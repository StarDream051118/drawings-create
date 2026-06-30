import { Identifier, TextureAtlas, upperPowerOfTwo } from 'deepslate';

export async function mergeAtlases (
  vanillaImage: HTMLImageElement,
  vanillaUvMap: Record<string, [number, number, number, number]>,
  newTextures: Record<string, Blob> // id -> blob
): Promise<TextureAtlas> {

  // 1. Prepare new textures
  const textureIds = Object.keys(newTextures);
  if (textureIds.length === 0) {
    const size = upperPowerOfTwo(Math.max(vanillaImage.width, vanillaImage.height));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(vanillaImage, 0, 0);

    const idMap: Record<string, [number, number, number, number]> = {};
    Object.keys(vanillaUvMap).forEach(id => {
      if (!vanillaUvMap[id]) {
        console.warn(`Missing UV mapping for texture ID: ${id}`);
        return;
      }
      const [u, v, du, dv] = vanillaUvMap[id];
      const dv2 = (du !== dv && id.startsWith('block/')) ? du : dv;
      idMap[Identifier.create(id).toString()] = [u / size, v / size, (u + du) / size, (v + dv2) / size];
    });

    return new TextureAtlas(ctx.getImageData(0, 0, size, size), idMap);
  }

  // Load new images
  const images: Record<string, ImageBitmap> = {};
  for (const id of textureIds) {
    if (!newTextures[id]) {
      console.warn(`Missing texture blob for ID: ${id}`);
      continue;
    }
    images[id] = await createImageBitmap(newTextures[id]);
  }

  // 2. Calculate dimensions using native texture sizes (no forced downscale)
  const VANILLA_WIDTH = vanillaImage.width;
  const VANILLA_HEIGHT = vanillaImage.height;

  const sizes = textureIds.map(id => ({ id, w: images[id]!.width, h: images[id]!.height }));
  const maxNewWidth = sizes.reduce((m, s) => Math.max(m, s.w), 0);
  const totalNewHeight = sizes.reduce((sum, s) => sum + s.h, 0);

  const atlasWidth = Math.max(VANILLA_WIDTH, maxNewWidth);
  const atlasHeight = VANILLA_HEIGHT + totalNewHeight;
  // Final dimensions must be POT
  const finalSize = upperPowerOfTwo(Math.max(atlasWidth, atlasHeight));

  // 3. Draw
  const canvas = document.createElement('canvas');
  canvas.width = finalSize;
  canvas.height = finalSize;
  const ctx = canvas.getContext('2d')!;

  // Draw vanilla
  ctx.drawImage(vanillaImage, 0, 0);

  // Draw new textures
  const idMap: Record<string, [number, number, number, number]> = {};

  // Remap vanilla UVs to new size
  // vanillaUvMap is expected to be [x, y, width, height] in PIXELS (from misode)
  Object.keys(vanillaUvMap).forEach(id => {
    const [x, y, w, h] = vanillaUvMap[id]!;
    // Fix for specific misode data anomaly if needed (like in main.ts)
    const h2 = (w !== h && id.startsWith('block/')) ? w : h;

    idMap[Identifier.create(id).toString()] = [
      x / finalSize,
      y / finalSize,
      (x + w) / finalSize,
      (y + h2) / finalSize
    ];
  });

  // Place new textures stacked vertically preserving native resolution
  let yOffset = VANILLA_HEIGHT;
  for (const { id, w, h } of sizes) {
    const x = 0;
    const y = yOffset;
    ctx.drawImage(images[id]!, x, y, w, h);
    idMap[id] = [
      x / finalSize,
      y / finalSize,
      (x + w) / finalSize,
      (y + h) / finalSize
    ];
    yOffset += h;
  }

  // Create ImageData
  const atlasData = ctx.getImageData(0, 0, finalSize, finalSize);

  return new TextureAtlas(atlasData, idMap);
}
