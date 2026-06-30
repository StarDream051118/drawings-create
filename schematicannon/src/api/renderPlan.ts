import { glMatrix, mat4 } from 'gl-matrix';
import type { BlockPos } from 'deepslate/core';
import { Identifier } from 'deepslate/core';
import type { PlacedBlock } from 'deepslate/core';
import type { Resources } from 'deepslate';
import { blockModelHasGeometry } from './deepslateExtensions';
import { BlockColors } from 'deepslate/render';
import type { Mesh, Cull } from 'deepslate/render';
import type { ExtendedMesh, VariantLike } from '../types/assets';

export type Axis = 'x' | 'y' | 'z';
export interface MotionSpec {
  kind: 'spin';
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

export function buildRenderPlan (
  blocks: PlacedBlock[],
  resources: Resources,
  uploadMesh: (mesh: Mesh) => void
): RenderPlan {
  const plan: BlockVisualSpec[] = [];
  const flywheelBlocks = new Set<string>();

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

      const tint = getTint(id, props);
      const mesh = blockModel.getMesh(resources, {} as Cull, tint);
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

      const motion = inferMotion(id, variant.model, props, variant);
      if (motion) {
        flywheelBlocks.add(id);
      }
      parts.push({ mesh, modelId: variant.model, motion: motion ?? undefined });
    }

    if (parts.length > 0) {
      plan.push({ blockId: id, pos: block.pos, parts });
      flywheelBlocks.add(id);
    }
  }

  return { blocks: plan, flywheelBlocks };
}

function inferMotion (id: string, model: string, props: Record<string, string | boolean | number | undefined>, variant: VariantLike): MotionSpec | null {
  const axis = resolveAxis(props) ?? resolveAxisFromVariant(variant) ?? 'y';
  const lowered = model.toLowerCase();

  if (id.includes('mechanical_mixer') && lowered.includes('head')) {
    return { kind: 'spin', axis: 'y', speed: 0.5 };
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
    'mechanical_arm/cog'
  ];

  // Exclude when model clearly refers to press/deployer/saw heads or poles
  const nonSpinToolTokens = ['press', 'deployer', 'saw', 'blade', 'head', 'pole'];
  if (nonSpinToolTokens.some(t => lowered.includes(t)) && !lowered.includes('shaft')) {
    return null;
  }

  if (spinTokens.some(k => lowered.includes(k) || id.includes(k))) {
    return { kind: 'spin', axis, speed: 0.5 };
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
  // Apply the same rotation order used for meshes to a unit vector aligned with the intended spin normal.
  const radY = variant.y ? -glMatrix.toRadian(variant.y) : 0;
  const radX = variant.x ? -glMatrix.toRadian(variant.x) : 0;
  let v: [number, number, number] = base === 'x' ? [1, 0, 0] : base === 'z' ? [0, 0, 1] : [0, 1, 0];

  if (radY !== 0) {
    const cosY = Math.cos(radY), sinY = Math.sin(radY);
    v = [(v[0] * cosY) + (v[2] * sinY), v[1], (-v[0] * sinY) + (v[2] * cosY)];
  }
  if (radX !== 0) {
    const cosX = Math.cos(radX), sinX = Math.sin(radX);
    v = [v[0], (v[1] * cosX) - (v[2] * sinX), (v[1] * sinX) + (v[2] * cosX)];
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
