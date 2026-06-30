import { BlockDefinition, BlockModel, Identifier, type Resources } from 'deepslate';
import { describeBlockDefinition, createBlockModelFromJson, ModelMultiPartCondition } from './deepslateExtensions.js';
import { mergeAtlases } from './atlasMerger.js';
import type { Structure, TextureAtlas } from 'deepslate';
import { CreateModLoader, type CreateModLoaderOptions, type LoadedAssets } from './createLoader.js';
import { loadCreateModelManifest } from './createModelManifest.js';
import { RawBlockState, RawBlockModel } from '../types/assets';
import { ResourceProvider, FetchResourceProvider } from '../loader/resourceProvider.js';

export interface VanillaAssetBundle {
  blockStates: Record<string, RawBlockState>;
  blockModels: Record<string, RawBlockModel>;
  uvMap: Record<string, [number, number, number, number]>;
  atlasImage: HTMLImageElement;
}

export interface ResourceLoadOptions extends CreateModLoaderOptions {
  vanillaAssetsBase?: string | ResourceProvider;
  createAssetsBase?: string | ResourceProvider;
  summaryBase?: string;
  atlasBase?: string;
}

const DEFAULT_VANILLA_BASE = './assets/minecraft/1.20.1/';
const DEFAULT_SUMMARY_BASE = 'https://raw.githubusercontent.com/misode/mcmeta/summary/';
const DEFAULT_ATLAS_BASE = 'https://raw.githubusercontent.com/misode/mcmeta/atlas/';

export async function loadVanillaAssets (options: ResourceLoadOptions = {}): Promise<VanillaAssetBundle> {
  const provider = typeof options.vanillaAssetsBase === 'string'
    ? new FetchResourceProvider(options.vanillaAssetsBase)
    : options.vanillaAssetsBase ?? new FetchResourceProvider(DEFAULT_VANILLA_BASE);

  const summaryBase = options.summaryBase ?? DEFAULT_SUMMARY_BASE;
  const atlasBase = options.atlasBase ?? DEFAULT_ATLAS_BASE;

  const [blockStates, blockModels, uvMap, atlasImage] = await Promise.all([
    provider.getJson('block_definition.json').catch(() => fetch(`${summaryBase}assets/block_definition/data.min.json`).then(r => r.json())) as Promise<Record<string, RawBlockState>>,
    provider.getJson('model.json').catch(() => fetch(`${summaryBase}assets/model/data.min.json`).then(r => r.json())) as Promise<Record<string, RawBlockModel>>,
    provider.getJson('atlas.json').catch(() => fetch(`${atlasBase}all/data.min.json`).then(r => r.json())) as Promise<Record<string, [number, number, number, number]>>,
    provider.getTexture('atlas.png').catch(() => {
      return new Promise<HTMLImageElement>((res, rej) => {
        const image = new Image();
        image.onload = () => res(image);
        image.onerror = () => rej(new Error('Failed to load vanilla atlas texture'));
        image.crossOrigin = 'Anonymous';
        image.src = `${atlasBase}all/atlas.png`;
      });
    })
  ]);

  return { blockStates, blockModels, uvMap, atlasImage };
}

export interface ResourceBundle {
  resources: Resources;
  blockDefinitions: Record<string, BlockDefinition>;
  blockModels: Record<string, BlockModel>;
  textureAtlas: TextureAtlas;
  autoSubparts: Array<{ blockId: string; baseModel: string; subpart: string; when?: ModelMultiPartCondition }>;
  loader: CreateModLoader;
}

export async function loadResourcesForStructure (structure: Structure, options: ResourceLoadOptions = {}): Promise<ResourceBundle> {
  const createProvider = typeof options.createAssetsBase === 'string'
    ? new FetchResourceProvider(options.createAssetsBase)
    : options.createAssetsBase ?? new FetchResourceProvider('./assets/create/0.5.1/');

  const vanillaPromise = loadVanillaAssets(options);
  const manifestPromise = options.modelManifest
    ? Promise.resolve(undefined)
    : loadCreateModelManifest(createProvider).catch(err => {
      console.warn('[schematicannon resources] Failed to load Create model manifest', err);
      return undefined;
    });

  const [vanilla, manifestData] = await Promise.all([vanillaPromise, manifestPromise]);
  const loader = new CreateModLoader({
    ...options,
    assetsProvider: createProvider,
    modelManifest: manifestData ?? options.modelManifest
  });

  const blocks = new Set<string>();
  structure.getBlocks().forEach(b => blocks.add(b.state.getName().toString()));

  const modAssets: LoadedAssets = await loader.loadBlocks(blocks);
  const atlas = await mergeAtlases(vanilla.atlasImage, vanilla.uvMap, modAssets.textures);

  const blockDefinitions: Record<string, BlockDefinition> = {};
  Object.keys(vanilla.blockStates).forEach(id => {
    blockDefinitions['minecraft:' + id] = BlockDefinition.fromJson(vanilla.blockStates[id]);
  });
  Object.keys(modAssets.blockDefinitions).forEach(id => {
    blockDefinitions[id] = modAssets.blockDefinitions[id]!;
  });

  const blockProperties: Record<string, Record<string, string[]>> = {};
  const defaultBlockProperties: Record<string, Record<string, string>> = {};

  const parseVariantKey = (variant: string) => {
    const out: Record<string, string> = {};
    if (!variant || variant.trim() === '') {
      return out;
    }
    variant.split(',').forEach(p => {
      if (!p) {
        return;
      }
      const [k, v] = p.split('=');
      if (!k || v === undefined) {
        return;
      }
      out[k] = v;
    });
    return out;
  };

  const recordProps = (key: string, value: string, bucket: Map<string, Set<string>>) => {
    if (!bucket.has(key)) {
      bucket.set(key, new Set<string>());
    }
    bucket.get(key)!.add(value);
  };

  const normalizeWhenValue = (value: string | boolean | number | undefined | null) => {
    if (value === undefined || value === null) {
      return '';
    }
    if (Array.isArray(value)) {
      return (value as (string | boolean | number)[]).map(v => String(v)).join('|');
    }
    return String(value);
  };

  const collectFromWhen = (when: ModelMultiPartCondition | undefined, bucket: Map<string, Set<string>>) => {
    if (!when) {
      return;
    }
    if ('OR' in when && Array.isArray(when.OR)) {
      when.OR.forEach(c => collectFromWhen(c, bucket));
      return;
    }
    if ('AND' in when && Array.isArray(when.AND)) {
      when.AND.forEach(c => collectFromWhen(c, bucket));
      return;
    }
    Object.entries(when as Record<string, string | boolean | number>).forEach(([k, v]) => {
      const normalized = normalizeWhenValue(v);
      normalized.split('|').forEach(option => recordProps(k, option, bucket));
    });
  };

  const buildPropertyTable = (def: BlockDefinition) => {
    const properties = new Map<string, Set<string>>();
    let defaultProps: Record<string, string> = {};
    const { variants, multipart } = describeBlockDefinition(def);

    if (variants && Object.keys(variants).length > 0) {
      const keys = Object.keys(variants);
      for (const key of keys) {
        const parsed = parseVariantKey(key);
        Object.entries(parsed).forEach(([k, v]) => recordProps(k, v, properties));
        if (Object.keys(defaultProps).length === 0 && (key === '' || key === ' ' || key === undefined)) {
          defaultProps = parsed;
        }
      }
      if (Object.keys(defaultProps).length === 0 && keys.length > 0) {
        defaultProps = parseVariantKey(keys[0]!);
      }
    }

    if (multipart && multipart.length > 0) {
      multipart.forEach(part => collectFromWhen(part.when, properties));
      if (Object.keys(defaultProps).length === 0) {
        const first = multipart.find(p => p.when)?.when;
        if (first) {
          collectFromWhen(first, properties);
          defaultProps = {};
          Object.entries(first as Record<string, string>).forEach(([k, v]) => {
            if (k === 'OR' || k === 'AND') {
              return;
            }
            const option = normalizeWhenValue(v).split('|')[0];
            if (option) {
              defaultProps[k] = option;
            }
          });
        }
      }
    }

    const propertyObj: Record<string, string[]> = {};
    properties.forEach((values, key) => {
      propertyObj[key] = Array.from(values);
    });

    Object.entries(propertyObj).forEach(([k, v]) => {
      if (defaultProps[k] !== undefined) {
        return;
      }
      const v0 = v[0];
      if (v0) {
        defaultProps[k] = v0;
      }
    });

    return { properties: propertyObj, defaults: defaultProps };
  };

  Object.entries(blockDefinitions).forEach(([id, def]) => {
    const { properties, defaults } = buildPropertyTable(def);
    if (Object.keys(properties).length > 0) {
      blockProperties[id] = properties;
    }
    if (Object.keys(defaults).length > 0) {
      defaultBlockProperties[id] = defaults;
    }
  });

  const blockModels: Record<string, BlockModel> = {};
  Object.keys(vanilla.blockModels).forEach(id => {
    const modelId = Identifier.parse('minecraft:' + id);
    const model = vanilla.blockModels[id];
    if (model) {
      blockModels[modelId.toString()] = createBlockModelFromJson(model);
    }
  });
  Object.keys(modAssets.blockModels).forEach(id => {
    blockModels[id] = modAssets.blockModels[id]!;
  });

  Object.values(blockModels).forEach(m => m.flatten({ getBlockModel: id => blockModels[id.toString()] ?? null }));

  const warnedDefinitions = new Set<string>();
  const warnedModels = new Set<string>();
  const warnOnce = (seen: Set<string>, id: string, msg: string) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    console.warn(msg);
  };

  const resources: Resources = {
    getBlockDefinition: (id: Identifier) => {
      const key = id.toString();
      const def = blockDefinitions[key];
      if (!def) {
        warnOnce(warnedDefinitions, key, `[deepslate resources] Missing block definition for ${key}`);
      }
      return def ?? null;
    },
    getBlockModel: (id: Identifier) => {
      const key = id.toString();
      const model = blockModels[key];
      if (!model) {
        warnOnce(warnedModels, key, `[deepslate resources] Missing block model for ${key}`);
      }
      return model ?? null;
    },
    getTextureUV: (id: Identifier) => atlas.getTextureUV(id),
    getTextureAtlas: () => atlas.getTextureAtlas(),
    getBlockFlags: () => null,
    getBlockProperties: (id: Identifier) => blockProperties[id.toString()] ?? null,
    getDefaultBlockProperties: (id: Identifier) => defaultBlockProperties[id.toString()] ?? null
  };

  return {
    resources,
    blockDefinitions,
    blockModels,
    textureAtlas: atlas,
    autoSubparts: loader.getAutoSubpartDebug(),
    loader
  };
}
