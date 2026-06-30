import type { NbtTag, Resources, ItemRendererResources } from 'deepslate';
import { BlockDefinition, BlockModel, Identifier, ItemModel, TextureAtlas, jsonToNbt, upperPowerOfTwo } from 'deepslate';
import type { SupportedVersions } from './versions';

export const MCMETA = 'https://raw.githubusercontent.com/misode/mcmeta/';

export interface Assets {
  items: string[];
  blockstates: Record<string, {
    variants?: Record<string, { model: string; x?: number; y?: number; uvlock?: boolean }>;
    multipart?: { when?: Record<string, string | string[]>; apply: { model: string; x?: number; y?: number; uvlock?: boolean } | { model: string; x?: number; y?: number; uvlock?: boolean }[] }[];
  }>;
  models: Record<string, {
    parent?: string;
    ambientocclusion?: boolean;
    display?: Record<string, { rotation?: [number, number, number]; translation?: [number, number, number]; scale?: [number, number, number] }>;
    textures?: Record<string, string>;
    elements?: {
      from: [number, number, number];
      to: [number, number, number];
      rotation?: { origin: [number, number, number]; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean };
      shade?: boolean;
      faces: Record<'down' | 'up' | 'north' | 'south' | 'west' | 'east', { uv?: [number, number, number, number]; texture: string; cullface?: string; rotation?: number; tintindex?: number }>;
    }[];
  }>;
  item_models: Record<string, {
    model: {
      type: string;
      model: string;
      [key: string]: unknown;
    };
  }>;
  item_components: Record<string, Record<string, unknown>>;
  uvMap: Record<string, [number, number, number, number]>;
  atlas: HTMLImageElement;
}

export async function fetchAssets (): Promise<Assets> {
  const [items, blockstates, models, item_models, item_components, uvMap, atlas] = await Promise.all([
    fetch(`${MCMETA}registries/item/data.min.json`).then(r => r.json()),
    fetch(`${MCMETA}summary/assets/block_definition/data.min.json`).then(r => r.json()),
    fetch(`${MCMETA}summary/assets/model/data.min.json`).then(r => r.json()),
    fetch(`${MCMETA}summary/assets/item_definition/data.min.json`).then(r => r.json()),
    fetch(`${MCMETA}summary/item_components/data.min.json`).then(r => r.json()),
    fetch(`${MCMETA}atlas/all/data.min.json`).then(r => r.json()),
    new Promise<HTMLImageElement>(res => {
      const image = new Image();
      image.onload = () => res(image);
      image.crossOrigin = 'Anonymous';
      image.src = `${MCMETA}atlas/all/atlas.png`;
    })
  ]);
  return { items, blockstates, models, item_models, item_components, uvMap, atlas };
}

export async function fetchSupportedVersions (): Promise<SupportedVersions> {
  try {
    const response = await fetch('/assets/supportedVersions.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch supported versions: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      throw new Error('Supported versions file is not valid JSON (received HTML?)');
    }
    return await response.json();
  } catch (err) {
    console.error('Error fetching supported versions, using empty defaults:', err);
    return { create: [], minecraft: [] };
  }
}

export async function loadVersionAssets (version: string): Promise<Assets> {
  const base = `/assets/minecraft/${version}/`;

  const fetchJson = async <T>(path: string, defaultValue: T): Promise<T> => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        return defaultValue;
      }
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return defaultValue;
      }
      return await response.json();
    } catch {
      return defaultValue;
    }
  };

  const [items, blockstates, models, item_models, item_components, uvMap, atlas] = await Promise.all([
    fetchJson(`${base}items.json`, []),
    fetchJson(`${base}block_definition.json`, {}),
    fetchJson(`${base}model.json`, {}),
    fetchJson(`${base}item_definition.json`, {}),
    fetchJson(`${base}item_components.json`, {}),
    fetchJson(`${base}atlas.json`, {}),
    new Promise<HTMLImageElement>(res => {
      const image = new Image();
      image.onload = () => res(image);
      image.crossOrigin = 'Anonymous';
      image.src = `${base}atlas.png`;
    })
  ]);
  return { items, blockstates, models, item_models, item_components, uvMap, atlas };
}

export async function createResources (assets: Assets): Promise<Resources & ItemRendererResources> {
  const { blockstates, models, item_models, item_components, uvMap, atlas } = assets;

  const blockDefinitions: Record<string, BlockDefinition> = {};
  Object.keys(blockstates).forEach(id => {
    blockDefinitions['minecraft:' + id] = BlockDefinition.fromJson(blockstates[id]);
  });

  const blockModels: Record<string, BlockModel> = {};
  Object.keys(models).forEach(id => {
    blockModels['minecraft:' + id] = BlockModel.fromJson(models[id]);
  });
  Object.values(blockModels).forEach(m => m.flatten({ getBlockModel: id => blockModels[id.toString()] || null }));

  const itemModels: Record<string, ItemModel> = {};
  Object.keys(item_models).forEach(id => {
    if (!item_models[id]) {
      console.warn(`Item model missing for id: ${id}`);
      return;
    }
    itemModels['minecraft:' + id] = ItemModel.fromJson(item_models[id].model);
  });

  const itemComponents: Record<string, Map<string, NbtTag>> = {};
  Object.keys(item_components).forEach(id => {
    if (!item_components[id]) {
      console.warn(`Item component missing for id: ${id}`);
      return;
    }
    const components = new Map<string, NbtTag>();
    Object.keys(item_components[id]).forEach(c_id => {
      components.set(c_id, jsonToNbt(item_components[id]![c_id]));
    });
    itemComponents['minecraft:' + id] = components;
  });

  const atlasCanvas = document.createElement('canvas');
  const atlasSize = upperPowerOfTwo(Math.max(atlas.width, atlas.height));
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const atlasCtx = atlasCanvas.getContext('2d')!;
  atlasCtx.drawImage(atlas, 0, 0);
  const atlasData = atlasCtx.getImageData(0, 0, atlasSize, atlasSize);
  const idMap: Record<string, [number, number, number, number]> = {};
  Object.keys(uvMap).forEach(id => {
    if (!uvMap[id]) {
      console.warn(`UV map missing for id: ${id}`);
      return;
    }
    const [u, v, du, dv] = uvMap[id];
    const dv2 = (du !== dv && id.startsWith('block/')) ? du : dv;
    idMap[Identifier.create(id).toString()] = [u / atlasSize, v / atlasSize, (u + du) / atlasSize, (v + dv2) / atlasSize];
  });
  const textureAtlas = new TextureAtlas(atlasData, idMap);

  return {
    getBlockDefinition (id) {
      return blockDefinitions[id.toString()] || null;
    },
    getBlockModel (id) {
      return blockModels[id.toString()] || null;
    },
    getTextureUV (id) {
      return textureAtlas.getTextureUV(id);
    },
    getTextureAtlas () {
      return textureAtlas.getTextureAtlas();
    },
    getPixelSize () {
      return textureAtlas.getPixelSize();
    },
    getBlockFlags () {
      return { opaque: false };
    },
    getBlockProperties () {
      return null;
    },
    getDefaultBlockProperties () {
      return null;
    },
    getItemModel (id) {
      return itemModels[id.toString()] || null;
    },
    getItemComponents (id) {
      if (!itemComponents[id.toString()]) {
        throw new Error(`failed to get item components for id ${id}`);
      }
      return itemComponents[id.toString()]!;
    }
  };
}
