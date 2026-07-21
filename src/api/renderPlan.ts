import { glMatrix, mat4 } from 'gl-matrix';
import type { BlockPos } from 'deepslate/core';
import { Identifier } from 'deepslate/core';
import type { PlacedBlock } from 'deepslate/core';
import type { Resources } from 'deepslate';
import { blockModelHasGeometry } from './deepslateExtensions';
import { BlockColors } from 'deepslate/render';
import type { Mesh, Cull } from 'deepslate/render';
import type { ExtendedMesh, VariantLike } from '../types/assets';

/** 对角 Belt UV 滚动速度（每 tick） */
export const DIAGONAL_BELT_SCROLL_SPEED = 0.008;
/** 水平 Belt UV 滚动速度（每 tick） */
export const HORIZONTAL_BELT_SCROLL_SPEED = 0.008;
/** 齿轮/传动杆旋转速度（每 tick，弧度） */
export const SPIN_SPEED = 0.02;

// ─── 日志开关（true 输出，false 静默）──────────────────────
/** 方块模型引用日志：方块名 + variant 模型路径 */
export const LOG_MODEL_REFS = true;
/** 方块模型 UV 截取日志：quad UV 坐标 + texLimit */
export const LOG_UV = false;
/** 方块纹理引用日志：各面引用的纹理 */
export const LOG_TEXTURES = false;

export type Axis = 'x' | 'y' | 'z';
export interface MotionSpec {
  kind: 'spin' | 'scroll';
  axis: Axis;
  speed: number;
}

export interface PartSpec {
  mesh: Mesh;
  modelId: string;
  motion?: MotionSpec;
}

export interface BlockVisualSpec {
  blockId: string;
  pos: BlockPos;
  parts: PartSpec[];
}

export interface RenderPlan {
  blocks: BlockVisualSpec[];
  flywheelBlocks: Set<string>;
}

export type PlanBuilder = (
  blocks: PlacedBlock[],
  resources: Resources,
  uploadMesh: (mesh: Mesh) => void
) => RenderPlan;

function posKey (pos: BlockPos): string {
  return `${pos[0]},${pos[1]},${pos[2]}`;
}

export interface SubModelPose {
  offset: [number, number, number];
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
}

export type SubModelTransform = SubModelPose & {
  shaftDir?: [number, number, number];
  facing?: string;
  perFacing?: Partial<Record<string, SubModelPose>>;
};

const FACING_DIR: Record<string, [number, number, number]> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0]
};

function getLocalAxes (
  shaftDir: [number, number, number],
  facing: string | undefined
): { lateral: [number, number, number]; vertical: [number, number, number] } {
  const fwd = shaftDir;
  const faceDir = facing ? FACING_DIR[facing] : undefined;

  // lateral = engine's facing direction projected perpendicular to shaft
  let lateral: [number, number, number];
  if (faceDir) {
    // lateral = faceDir - (faceDir · fwd) * fwd  (Gram-Schmidt)
    const dot = faceDir[0] * fwd[0] + faceDir[1] * fwd[1] + faceDir[2] * fwd[2];
    lateral = [
      faceDir[0] - dot * fwd[0],
      faceDir[1] - dot * fwd[1],
      faceDir[2] - dot * fwd[2]
    ];
    const len = Math.sqrt(lateral[0] ** 2 + lateral[1] ** 2 + lateral[2] ** 2);
    if (len > 0.01) {
      lateral = [lateral[0] / len, lateral[1] / len, lateral[2] / len];
    } else {
      // facing is parallel to shaft, pick a default
      lateral = getPerpAxis(fwd, 'lateral');
    }
  } else {
    lateral = getPerpAxis(fwd, 'lateral');
  }

  // vertical = fwd × lateral
  const vertical: [number, number, number] = [
    fwd[1] * lateral[2] - fwd[2] * lateral[1],
    fwd[2] * lateral[0] - fwd[0] * lateral[2],
    fwd[0] * lateral[1] - fwd[1] * lateral[0]
  ];

  return { lateral, vertical };
}

function getPerpAxis (
  shaftDir: [number, number, number],
  kind: 'lateral' | 'vertical'
): [number, number, number] {
  const [sx, sy, sz] = shaftDir;
  if (Math.abs(sy) > 0.9) {
    return kind === 'lateral' ? [1, 0, 0] : [0, 0, sy > 0 ? 1 : -1];
  } else if (Math.abs(sx) > 0.9) {
    return kind === 'lateral' ? [0, 0, sx > 0 ? -1 : 1] : [0, 1, 0];
  } else {
    return kind === 'lateral' ? [sz > 0 ? 1 : -1, 0, 0] : [0, 1, 0];
  }
}

/**
 * Convert a relative offset [lateral, forward, vertical] to world coordinates
 * based on the shaft direction (forward axis).
 *
 * lateral: perpendicular horizontal offset
 * forward: along the shaft direction
 * vertical: perpendicular vertical offset
 */
function relativeToWorld (
  relative: [number, number, number],
  shaftDir: [number, number, number],
  facing?: string
): [number, number, number] {
  const [l, f, v] = relative;
  const { lateral, vertical } = getLocalAxes(shaftDir, facing);
  const fwd = shaftDir;

  return [
    lateral[0] * l + fwd[0] * f + vertical[0] * v,
    lateral[1] * l + fwd[1] * f + vertical[1] * v,
    lateral[2] * l + fwd[2] * f + vertical[2] * v
  ];
}

function resolvePose (transform: SubModelTransform): SubModelPose {
  if (transform.perFacing && transform.facing && transform.perFacing[transform.facing]) {
    return transform.perFacing[transform.facing]!;
  }
  return {
    offset: transform.offset,
    rotateX: transform.rotateX,
    rotateY: transform.rotateY,
    rotateZ: transform.rotateZ
  };
}

function buildSubModelMesh (
  modelIdStr: string,
  resources: Resources,
  variant: VariantLike,
  transform: SubModelTransform
): Mesh | null {
  const modelId = Identifier.parse(modelIdStr);
  const blockModel = resources.getBlockModel(modelId);
  if (!blockModel || !blockModelHasGeometry(blockModel)) {
    return null;
  }
  const mesh = blockModel.getMesh(resources, {} as Cull, undefined);
  if (!mesh) {
    return null;
  }

  // Apply variant rotation (same as parent engine)
  if (variant.x || variant.y) {
    const t = mat4.create();
    mat4.translate(t, t, [8, 8, 8]);
    if (variant.y) {
      mat4.rotateY(t, t, -glMatrix.toRadian(variant.y));
    }
    if (variant.x) {
      mat4.rotateX(t, t, -glMatrix.toRadian(variant.x));
    }
    mat4.translate(t, t, [-8, -8, -8]);
    mesh.transform(t);
  }

  // Resolve per-facing overrides
  const pose = resolvePose(transform);

  // Apply custom rotation in shaft-relative frame
  if (pose.rotateX || pose.rotateY || pose.rotateZ) {
    const sd = transform.shaftDir ?? [0, 1, 0];
    const { lateral, vertical } = getLocalAxes(sd, transform.facing);
    const t = mat4.create();
    mat4.translate(t, t, [8, 8, 8]);

    if (pose.rotateZ) {
      mat4.rotate(t, t, glMatrix.toRadian(pose.rotateZ), vertical);
    }
    if (pose.rotateX) {
      mat4.rotate(t, t, glMatrix.toRadian(pose.rotateX), lateral);
    }
    if (pose.rotateY) {
      mat4.rotate(t, t, glMatrix.toRadian(pose.rotateY), [sd[0], sd[1], sd[2]]);
    }

    mat4.translate(t, t, [-8, -8, -8]);
    mesh.transform(t);
  }

  // Translate by block offset (in model units: 16 = 1 block)
  const o = pose.offset;
  if (o[0] || o[1] || o[2]) {
    const t = mat4.create();
    mat4.translate(t, t, [o[0] * 16, o[1] * 16, o[2] * 16]);
    mesh.transform(t);
  }

  // Scale to world space
  const scale = mat4.create();
  mat4.scale(scale, scale, [0.0625, 0.0625, 0.0625]);
  mesh.transform(scale);

  (mesh as ExtendedMesh).id = modelIdStr;
  return mesh;
}

function findNearestPoweredShaft (
  enginePos: BlockPos,
  blockMap: Map<string, PlacedBlock>,
  maxRadius: number = 5
): PlacedBlock | null {
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      for (let dz = -maxRadius; dz <= maxRadius; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const key = posKey([enginePos[0] + dx, enginePos[1] + dy, enginePos[2] + dz]);
        const block = blockMap.get(key);
        if (block && block.state.getName().toString().includes('powered_shaft')) {
          return block;
        }
      }
    }
  }
  return null;
}

// Set to true to enable steam engine sub-model rendering
const ENABLE_STEAM_ENGINE_SUBMODELS = false;

export function buildRenderPlan (
  blocks: PlacedBlock[],
  resources: Resources,
  uploadMesh: (mesh: Mesh) => void
): RenderPlan {
  const plan: BlockVisualSpec[] = [];
  const flywheelBlocks = new Set<string>();

  // Build position index for adjacency lookups
  const blockMap = new Map<string, PlacedBlock>();
  for (const block of blocks) {
    blockMap.set(posKey(block.pos), block);
  }

  for (const block of blocks) {
    const id = block.state.getName().toString();
    const props = block.state.getProperties();
    // Route vanilla blocks to the static renderer; keep Create blocks even if property-less (e.g., mechanical mixer).
    if (id.startsWith('minecraft:')) {
      continue;
    }
    if ((!props || Object.keys(props).length === 0) && !id.startsWith('create:')) {
      continue;
    }
    const def = resources.getBlockDefinition(block.state.getName());
    if (!def) {
      continue;
    }

    // Keep waterlogged leaves in the static renderer so they get tint + water overlay.
    if (isWaterloggedLeaves(id, props)) {
      continue;
    }

    const parts: PartSpec[] = [];

    if (id === 'minecraft:water' || id === 'minecraft:lava' || id === 'minecraft:air') {
      continue;
    }

    const variants: VariantLike[] = def.getModelVariants(props) as VariantLike[];

    // ─── 从 block entity NBT 读取 Casing 类型 ──────────────────
    let isAnCasing = false;
    if (props.casing === 'true' && block.nbt?.hasString('Casing') && block.nbt.getString('Casing') === 'ANDESITE') {
      isAnCasing = true;
    }

    for (const variant of variants) {
      if (!modelOrientationMatches(id, props, variant.model)) {
        continue;
      }

      const modelId = Identifier.parse(variant.model);
      const blockModel = resources.getBlockModel(modelId);
      if (!blockModel) {
        continue;
      }
      if (!blockModelHasGeometry(blockModel)) {
        continue;
      }

      // ─── ANDESITE 时临时替换 brass_belt_casing → andesite_belt_casing ─────
      let savedTextures: string[] | null = null;
      if (isAnCasing && variant.model.includes('belt_casing/')) {
        const tex = blockModel.textures;
        const keys = Object.keys(tex);
        savedTextures = keys.map(k => tex[k]!);
        for (const k of keys) {
          if (tex[k]) {
            tex[k] = tex[k]!
              .replace('brass_belt_casing', 'andesite_belt_casing')
              .replace('brass_casing', 'andesite_casing');
          }
        }
      }

      const tint = getTint(id, props);
      const mesh = blockModel.getMesh(resources, {} as Cull, tint);

      // ─── 恢复 brass 材质 ─────
      if (savedTextures) {
        const keys = Object.keys(blockModel.textures);
        for (let i = 0; i < keys.length; i++) {
          blockModel.textures[keys[i]!] = savedTextures[i]!;
        }
      }

      if (!mesh) {
        continue;
      }

      if (variant.x || variant.y) {
        const t = mat4.create();
        mat4.translate(t, t, [8, 8, 8]);
        if (variant.y) {
          mat4.rotateY(t, t, -glMatrix.toRadian(variant.y));
        }
        if (variant.x) {
          mat4.rotateX(t, t, -glMatrix.toRadian(variant.x));
        }
        mat4.translate(t, t, [-8, -8, -8]);
        mesh.transform(t);
      }

      applyCustomTransforms(id, variant.model, props, mesh);

      const scale = mat4.create();
      mat4.scale(scale, scale, [0.0625, 0.0625, 0.0625]);
      mesh.transform(scale);
      (mesh as ExtendedMesh).id = `${variant.model}_${variant.x ?? 0}_${variant.y ?? 0}`;
      uploadMesh(mesh);

      // ─── 纹理引用日志 ───────────────────────────────────────
      if (LOG_TEXTURES) {
        const texMap = blockModel.textures;
        if (texMap && Object.keys(texMap).length > 0) {
          const refs = Object.entries(texMap).map(([k, v]) => `${k}:${v}`);
          console.log(`%c${id} %c${variant.model} %c${refs.join('  ')}`, 'color:#8ae234;font-weight:bold', 'color:#888', 'color:#729fcf');
        } else if (LOG_MODEL_REFS) {
          console.log(`%c${id} %c${variant.model}`, 'color:#8ae234;font-weight:bold', 'color:#888');
        }
      } else if (LOG_MODEL_REFS) {
        console.log(`%c${id} %c${variant.model}`, 'color:#8ae234;font-weight:bold', 'color:#888');
      }

      // ─── UV 截取日志 ───────────────────────────────────────
      if (LOG_UV && mesh.quads.length > 0) {
        console.groupCollapsed(`%c${id} %c${variant.model}`, 'color:#8ae234;font-weight:bold', 'color:#888');
        console.log('  quads:', mesh.quads.length, '  lines:', mesh.lines?.length ?? 0);
        for (let i = 0; i < mesh.quads.length; i++) {
          const q = mesh.quads[i]!;
          const v1t = q.v1.texture;
          const v3t = q.v3.texture;
          const tl = q.v1.textureLimit;
          const uvStr = v1t && v3t
            ? `[${v1t[0].toFixed(1)},${v1t[1].toFixed(1)}]→[${v3t[0].toFixed(1)},${v3t[1].toFixed(1)}]`
            : 'none';
          const tlStr = tl ? `[${tl[0].toFixed(3)},${tl[1].toFixed(3)},${tl[2].toFixed(3)},${tl[3].toFixed(3)}]` : 'none';
          console.log(`  quad[${i}] UV: ${uvStr}  texLimit: ${tlStr}`);
        }
        console.groupEnd();
      }

      const motion = inferMotion(id, variant.model, props, variant);
      if (motion) {
        flywheelBlocks.add(id);
      }
      parts.push({ mesh, modelId: variant.model, motion: motion ?? undefined });
    }

    // Steam engine: inject sub-models when powered_shaft is nearby
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ENABLE_STEAM_ENGINE_SUBMODELS && id.includes('steam_engine') && props) {
      const variant: VariantLike = variants[0] ?? { model: '' };
      const shaftBlock = findNearestPoweredShaft(block.pos, blockMap);
      if (shaftBlock) {
        const dx = shaftBlock.pos[0] - block.pos[0];
        const dy = shaftBlock.pos[1] - block.pos[1];
        const dz = shaftBlock.pos[2] - block.pos[2];
        const autoLen = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        // Set to a number to override auto distance, or null to use auto
        const STEAM_ENGINE_LEN_OVERRIDE: number | null = null;
        const len = STEAM_ENGINE_LEN_OVERRIDE ?? autoLen;
        const step: [number, number, number] = autoLen > 0
          ? [Math.round(dx / autoLen), Math.round(dy / autoLen), Math.round(dz / autoLen)]
          : [0, 1, 0];

        // === Adjustable parameters: [lateral, forward, vertical] ===
        // lateral:  横向偏移（垂直于传动杆方向的水平分量）
        // forward:  沿传动杆方向偏移
        // vertical: 纵向偏移（垂直于传动杆方向的垂直分量）

        const facing = props['facing'] as string | undefined;

        // shaft_connector: at powered_shaft position
        const connectorTransform: SubModelTransform = {
          offset: relativeToWorld([0, len, 0], step, facing),
          rotateX: -90,
          rotateY: 0,
          rotateZ: 0,
          shaftDir: step,
          facing,
          perFacing: {
            north: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            south: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: -90 },
            east:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            west:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            up:    { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            down:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 }
          }
        };
        const connectorMesh = buildSubModelMesh('create:block/steam_engine/shaft_connector', resources, variant, connectorTransform);
        if (connectorMesh) {
          uploadMesh(connectorMesh);
          parts.push({ mesh: connectorMesh, modelId: 'create:block/steam_engine/shaft_connector' });
        }

        // linkage
        const linkageTransform: SubModelTransform = {
          offset: relativeToWorld([0.15, 1.45, 0], step, facing),
          rotateX: 30,
          rotateY: 0,
          rotateZ: 0,
          shaftDir: step,
          facing,
          perFacing: {
            north: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            south: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            east:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            west:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            up:    { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            down:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 }
          }
        };
        const linkageMesh = buildSubModelMesh('create:block/steam_engine/linkage', resources, variant, linkageTransform);
        if (linkageMesh) {
          uploadMesh(linkageMesh);
          parts.push({ mesh: linkageMesh, modelId: 'create:block/steam_engine/linkage' });
        }

        // piston
        const pistonTransform: SubModelTransform = {
          offset: relativeToWorld([0, 0.45, 0], step, facing),
          rotateX: 0,
          rotateY: 0,
          rotateZ: 0,
          shaftDir: step,
          facing,
          perFacing: {
            north: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            south: { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            east:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            west:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            up:    { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 },
            down:  { offset: [0, len, 0], rotateX: 0, rotateY: 0, rotateZ: 0 }
          }
        };
        const pistonMesh = buildSubModelMesh('create:block/steam_engine/piston', resources, variant, pistonTransform);
        if (pistonMesh) {
          uploadMesh(pistonMesh);
          parts.push({ mesh: pistonMesh, modelId: 'create:block/steam_engine/piston' });
        }
      }
    }

    // Analog transmission: inject spinning gear
    if (id.includes('analog_transmission') && props) {
      const axis = props['axis'] as string | undefined;
      if (axis) {
        const gearModelId = Identifier.parse('simulated:block/analog_transmission/gear');
        const gearModel = resources.getBlockModel(gearModelId);
        if (gearModel && blockModelHasGeometry(gearModel)) {
          const gearMesh = gearModel.getMesh(resources, {} as Cull, undefined);
          if (gearMesh) {
            // Apply axis rotation (matching the blockstate's variant rotation for this axis)
            const variantForAxis: Record<string, { x?: number; y?: number }> = {
              x: { x: 90, y: 90 },
              y: {},
              z: { x: 90, y: 180 }
            };
            const rot = variantForAxis[axis] || {};
            if (rot.x || rot.y) {
              const t = mat4.create();
              mat4.translate(t, t, [8, 8, 8]);
              if (rot.y) mat4.rotateY(t, t, -glMatrix.toRadian(rot.y));
              if (rot.x) mat4.rotateX(t, t, -glMatrix.toRadian(rot.x));
              mat4.translate(t, t, [-8, -8, -8]);
              gearMesh.transform(t);
            }
            const scale = mat4.create();
            mat4.scale(scale, scale, [0.0625, 0.0625, 0.0625]);
            gearMesh.transform(scale);
            (gearMesh as ExtendedMesh).id = 'simulated:block/analog_transmission/gear';
            uploadMesh(gearMesh);
            parts.push({ mesh: gearMesh, modelId: 'simulated:block/analog_transmission/gear', motion: { kind: 'spin', axis: axis as Axis, speed: SPIN_SPEED } });
          }
        }
      }
    }

    // Propeller sub-models: handled via multipart injection in createLoader.ts
    if (false && id.includes('propeller') && !id.includes('bearing') && props) { void 0; }

    if (parts.length > 0) {
      if (LOG_MODEL_REFS) {
        console.log('Block:', id, JSON.stringify(props), JSON.stringify(block.pos));
      }
      plan.push({ blockId: id, pos: block.pos, parts });
      flywheelBlocks.add(id);
    }
  }

  return { blocks: plan, flywheelBlocks };
}

function inferMotion (id: string, model: string, props: Record<string, string | boolean | number | undefined>, variant: VariantLike): MotionSpec | null {
  const lowered = model.toLowerCase();
  // Extract just the model file name (last part after /) to avoid matching parent dir names
  const modelName = lowered.split('/').pop() ?? '';

  // Belt surface models: scroll UV animation (not pulley/casing/funnel/tunnel/particle)
  const beltScrollTokens = ['belt/middle', 'belt/start', 'belt/end', 'belt/diagonal_middle', 'belt/diagonal_start', 'belt/diagonal_end'];
  const excludedBeltTokens = ['belt_casing', 'belt_funnel', 'belt_tunnel', 'particle'];
  if (beltScrollTokens.some(k => lowered.includes(k)) && !excludedBeltTokens.some(k => lowered.includes(k))) {
    if (lowered.includes('diagonal')) {
      // Diagonal: speed direction ensures beltUV increases (frame 0 → frame 1)
      const facing = props['facing'] as string;
      const upward = (props['slope'] as string) === 'upward';
      const facingFlip = facing === 'west' || facing === 'south' ? -1 : 1;
      const slopeDir = upward ? 1 : -1;
      return { kind: 'scroll', axis: 'y', speed: DIAGONAL_BELT_SCROLL_SPEED * slopeDir * facingFlip };
    }
    // Horizontal: direction logic from Create Mod BeltVisual.java §145-152
    const facing = props['facing'] as string | undefined;
    const upward = (props['slope'] as string) === 'upward';
    const axisNeg = facing === 'north' || facing === 'west';
    const alongX = facing === 'east' || facing === 'west';
    // Create Mod: (axisNeg ^ upward) ^ alongX
    const flip = (axisNeg !== upward) !== alongX;
    return { kind: 'scroll', axis: 'y', speed: HORIZONTAL_BELT_SCROLL_SPEED * (flip ? -1 : 1) };
  }

  // Gearbox shafts: shaft_half geometry is along Z, use base='z' so variant rotation maps correctly
  let axis: Axis = 'y';
  if (id === 'create:gearbox' && modelName.includes('shaft')) {
    axis = resolveAxisFromVariant(variant, 'z') ?? 'z';
  } else if (lowered.includes('belt_pulley')) {
    // Belt pulley: spin axis from variant (perpendicular to belt direction)
    axis = resolveAxisFromVariant(variant, 'y') ?? 'y';
  } else {
    axis = resolveAxis(props) ?? resolveAxisFromVariant(variant) ?? 'y';
  }

  if (id.includes('mechanical_mixer') && modelName.includes('head')) {
    return { kind: 'spin', axis: 'y', speed: SPIN_SPEED };
  }

  // Ignore obvious casings/frames so only inner shafts/gears spin
  const casingTokens = ['encased', 'casing', 'housing', 'frame', 'girder'];
  if (casingTokens.some(t => lowered.includes(t))) {
    return null;
  }

  // Only spin core kinetic pieces; avoid tool heads/press heads/blades/poles
  const spinTokens = [
    'shaft',
    'cogwheel',
    'large_cogwheel',
    'cogwheel_shaftless',
    'propeller',
    'whisk',
    'crushing_wheel',
    'drill/head',
    'fan',
    'flywheel',
    'pump/cog',
    'mechanical_crafter/gears',
    'mechanical_arm/cog',
    'pulley',
    'ironcog'
  ];

  // Exclude when model clearly refers to press/deployer/saw heads or poles
  const nonSpinToolTokens = ['press', 'deployer', 'saw', 'blade', 'head', 'pole'];
  if (nonSpinToolTokens.some(t => modelName.includes(t)) && !modelName.includes('shaft')) {
    return null;
  }

  if (spinTokens.some(k => modelName.includes(k))) {
    let speed = SPIN_SPEED;
    if (lowered.includes('belt_pulley')) {
      // Horizontal/vertical: positive; diagonal (down/up): negative
      const slope = props['slope'] as string | undefined;
      speed = (slope === 'downward' || slope === 'upward') ? -SPIN_SPEED : SPIN_SPEED;
    } else if (id === 'create:creative_motor') {
      speed = -SPIN_SPEED;
    } else if (id.includes('bearing') && (modelName.includes('shaft_half') || modelName.includes('ironcog'))) {
      const facing = props['facing'] as string | undefined;
      if (facing === 'east' || facing === 'south') {
        speed = -SPIN_SPEED;
      }
    }
    return { kind: 'spin', axis, speed };
  }

  return null;
}

export function renderPlanDebug (plan: RenderPlan) {
  return {
    blocks: plan.blocks.map(b => ({
      blockId: b.blockId,
      pos: b.pos,
      parts: b.parts.map(p => ({
        modelId: p.modelId,
        motion: p.motion ? { kind: p.motion.kind, axis: p.motion.axis, speed: p.motion.speed } : null
      }))
    })),
    flywheelBlocks: Array.from(plan.flywheelBlocks.values())
  };
}

function resolveAxis (props: Record<string, string | boolean | number | undefined>): Axis | null {
  const axisProp = props['axis'];
  if (axisProp === 'x' || axisProp === 'y' || axisProp === 'z') {
    return axisProp;
  }

  const facing = props['facing'] as string | undefined;
  if (facing === 'north' || facing === 'south') {
    return 'z';
  }
  if (facing === 'east' || facing === 'west') {
    return 'x';
  }
  if (facing === 'up' || facing === 'down') {
    return 'y';
  }

  return null;
}

function resolveAxisFromVariant (variant: VariantLike, base: Axis = 'y'): Axis | null {
  // Apply X rotation first, then Y — this correctly maps Y→Z (x:90) and Z→X (y:90)
  const radY = variant.y ? -glMatrix.toRadian(variant.y) : 0;
  const radX = variant.x ? -glMatrix.toRadian(variant.x) : 0;
  let v: [number, number, number] = base === 'x' ? [1, 0, 0] : base === 'z' ? [0, 0, 1] : [0, 1, 0];

  if (radX !== 0) {
    const cosX = Math.cos(radX), sinX = Math.sin(radX);
    v = [v[0], (v[1] * cosX) - (v[2] * sinX), (v[1] * sinX) + (v[2] * cosX)];
  }
  if (radY !== 0) {
    const cosY = Math.cos(radY), sinY = Math.sin(radY);
    v = [(v[0] * cosY) + (v[2] * sinY), v[1], (-v[0] * sinY) + (v[2] * cosY)];
  }

  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  if (ax > ay && ax > az) {
    return 'x';
  }
  if (az > ay && az > ax) {
    return 'z';
  }
  return 'y';
}

function applyCustomTransforms (
  blockId: string,
  model: string,
  props: Record<string, string | boolean | number | undefined>,
  mesh: Mesh
) {
  if (blockId.includes('mechanical_saw') && (model.includes('blade') || model.includes('saw_blade') || model.includes('saw/blade'))) {
    const facing = props['facing'];
    if (facing === 'up' || facing === 'down') {
      const tilt = mat4.create();
      mat4.translate(tilt, tilt, [8, 8, 8]);
      mat4.rotateX(tilt, tilt, facing === 'up' ? -Math.PI / 2 : Math.PI / 2);
      mat4.translate(tilt, tilt, [-8, -8, -8]);
      mesh.transform(tilt);
    }
  }

}

function getTint (id: string, props: Record<string, string | boolean | number | undefined>) {
  const parsed = Identifier.parse(id);
  const tintFn = BlockColors[parsed.path];
  if (!tintFn) {
    return undefined;
  }
  const stringProps: Record<string, string> = {};
  Object.entries(props).forEach(([k, v]) => stringProps[k] = String(v));
  return tintFn(stringProps);
}

function isWaterloggedLeaves (id: string, props: Record<string, string | boolean | number | undefined>) {
  const waterlogged = props['waterlogged'] === true || props['waterlogged'] === 'true';
  return waterlogged && id.includes('leaves');
}

function modelOrientationMatches (blockId: string, props: Record<string, string | boolean | number | undefined>, model: string): boolean {
  // Orientation filter is only relevant for mechanical saw blades (distinguish horizontal/vertical blade models).
  if (!blockId.includes('mechanical_saw')) {
    return true;
  }

  const facing = props['facing'] as string | undefined;
  if (!facing) {
    return true;
  }

  const isVerticalFacing = facing === 'up' || facing === 'down';
  const lower = model.toLowerCase();

  if (lower.includes('horizontal') && isVerticalFacing) {
    return false;
  }
  if (lower.includes('vertical') && !isVerticalFacing) {
    return false;
  }

  return true;
}
