import { Identifier } from 'deepslate/core';
import type { BeltTextureManager } from '../flywheel/beltTextureManager';
import type { ResourceProvider } from '../loader/resourceProvider';

/** Belt 纹理加载日志（独立于结构方块日志） */
export const LOG_BELT_TEXTURES = false;

interface BeltDef {
  name: string
  texturePath: string
  textureId: string
  uvOverride?: [number, number, number, number]
  scrollMult?: number
}

const BELT_DEFS: BeltDef[] = [
  { name: 'top', texturePath: 'textures/block/belt_scroll.png', textureId: 'create:block/belt_scroll', uvOverride: [0, 0, 1, 2], scrollMult: 0.5 },
  { name: 'diagonal', texturePath: 'textures/block/belt_diagonal_scroll.png', textureId: 'create:block/belt_diagonal_scroll', uvOverride: [0, 0, 1, 2], scrollMult: 3 / 8 },
  { name: 'bottom', texturePath: 'textures/block/belt_offset.png', textureId: 'create:block/belt_offset', uvOverride: [0, 0, 1, 1], scrollMult: 1 },
];

export async function loadBeltTextures (
  gl: WebGL2RenderingContext,
  assetsProvider: ResourceProvider,
  getTextureUV: (id: Identifier) => [number, number, number, number] | undefined,
  beltManager: BeltTextureManager,
) {
  for (const def of BELT_DEFS) {
    try {
      if (LOG_BELT_TEXTURES) console.log(`[belt] loading ${def.texturePath} ...`);
      const img = await assetsProvider.getTexture(def.texturePath);
      if (LOG_BELT_TEXTURES) console.log(`[belt] ${def.texturePath} loaded:`, img?.width, '×', img?.height);

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      const uv = getTextureUV(Identifier.parse(def.textureId));
      if (LOG_BELT_TEXTURES) console.log(`[belt] atlas UV for ${def.textureId}:`, uv);
      if (uv) {
        beltManager.register(def.name, tex, [uv[0], uv[1], uv[2], uv[3]], def.scrollMult ?? 0.5);
      }
      if (def.uvOverride) {
        beltManager.setUV(def.name, ...def.uvOverride);
      }
      if (LOG_BELT_TEXTURES) console.log(`[belt] ${def.name} belt texture setup done`);
    } catch (e) {
      console.warn(`[belt] ${def.texturePath} not found`, e);
    }
  }
}
