import { BlockDefinition, BlockModel, Direction } from 'deepslate';
import { createBlockModelFromJson, ModelMultiPartCondition } from './deepslateExtensions';
import { parseObj, ObjMeshPart } from './objLoader';
import { RawBlockModel, RawBlockState, RawModelElement, RawBlockStateVariant, RawMultipartCase, RawModelFace } from '../types/assets';
import { ResourceProvider, FetchResourceProvider } from '../loader/resourceProvider.js';

const SUBPART_TOKENS = ['head', 'blade', 'pole', 'cog', 'cogwheel', 'pointer', 'flap', 'hand', 'fan', 'shaft', 'arm', 'middle', 'hose', 'top', 'belt', 'claw', 'body', 'wheel', 'roller', 'valve', 'handle', 'casing', 'guard'];
const AUTO_SUBPART_BLOCKS = ['funnel', 'tunnel', 'spout', 'mechanical_mixer', 'mechanical_pump', 'portable_storage_interface', 'mechanical_saw', 'mechanical_drill', 'deployer', 'mechanical_press', 'analog_lever', 'hand_crank', 'weighted_ejector', 'create:water_wheel', 'mechanical_roller', 'chain_conveyor'];

export interface LoadedAssets {
  blockDefinitions: Record<string, BlockDefinition>;
  blockModels: Record<string, BlockModel>;
  textures: Record<string, Blob>;
}

export interface CreateModLoaderOptions {
  assetsProvider?: ResourceProvider;
  enableAutoSubparts?: boolean;
  modelManifest?: Iterable<string>;
}

export class CreateModLoader {
  // private readonly fetchedBlockDefinitions = new Map<string, any>();
  private readonly fetchedBlockModels = new Map<string, RawBlockModel>();
  private readonly fetchedTextures = new Map<string, Blob>();
  private readonly enableAutoSubparts: boolean;
  private readonly autoSubpartLog: Array<{ blockId: string; baseModel: string; subpart: string; when: ModelMultiPartCondition | undefined }> = [];
  private readonly provider: ResourceProvider;
  private readonly modelManifest: Set<string>;

  // Cache to prevent duplicate fetches
  private readonly visitedModels = new Set<string>();
  private readonly missingResources = new Set<string>();

  constructor (options: CreateModLoaderOptions = {}) {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : undefined;
    // Default on; can disable with ?enableAutoSubparts=0 if it over-attaches.
    const paramFlag = params?.get('enableAutoSubparts');
    this.enableAutoSubparts = options.enableAutoSubparts ?? paramFlag !== '0';
    this.provider = options.assetsProvider ?? new FetchResourceProvider('./assets/create/0.5.1/');
    this.modelManifest = new Set(options.modelManifest ?? []);
  }

  private rotateElementsX90 (elements: RawModelElement[]): RawModelElement[] {
    return elements.map(el => this.rotateElementX90(el));
  }

  public getAutoSubpartDebug () {
    return this.autoSubpartLog.slice();
  }

  async loadBlocks (blockIds: Set<string>): Promise<LoadedAssets> {
    console.log(`Loading assets for ${blockIds.size} Create blocks...`);

    const definitions: Record<string, BlockDefinition> = {};
    const models: Record<string, BlockModel> = {};
    const textures: Record<string, Blob> = {};

    for (const id of blockIds) {
      if (!id.startsWith('create:')) {
        continue;
      }

      try {
        // 1. Fetch Block Definition (BlockState)
        const defJson = await this.fetchJson(`blockstates/${id.replace('create:', '')}.json`) as RawBlockState;

        if (defJson) {
          if (id === 'create:mechanical_crafter') {
            await this.injectMechanicalCrafterGears(defJson);
          } else if (id === 'create:mechanical_arm') {
            await this.injectMechanicalArmCog(defJson);
          }
          if (id === 'create:spout') {
            await this.ensureSpoutNozzles();
          }
          // Apply procedural patches to definitions first
          if (id === 'create:belt') {
            this.patchBeltDefinition(defJson);
          } else if (id === 'create:encased_fluid_pipe') {
            this.patchEncasedPipeDefinition(defJson);
          } else if (id === 'create:fluid_pipe') {
            this.patchFluidPipeConnectionRules(defJson);
          } else if (id.includes('encased_cogwheel') || id.includes('encased_shaft')) {
            this.patchEncasedCogDefinition(defJson, id);
          }

          // Auto subparts mutate the blockstate; run them before freezing into BlockDefinition.
          if (id.includes('mechanical_mixer')) {
            await this.loadModelRecursive('create:block/cogwheel_shaftless');
          }
          if (this.enableAutoSubparts) {
            await this.preloadSubpartModels(this.extractModelsFromDefinition(defJson));
            this.autoAttachSubparts(defJson, id);
          }

          definitions[id] = BlockDefinition.fromJson(defJson);

          // 2. Scan for Models in the definition
          const modelPaths = this.extractModelsFromDefinition(defJson);

          for (const modelPath of modelPaths) {
            await this.loadModelRecursive(modelPath);
          }

          // Extra Models: Ensure implicit dependencies for patched blocks are loaded
          const extraModels: string[] = [];
          if (id.includes('encased_cogwheel')) {
            extraModels.push('create:block/cogwheel_shaftless');
            extraModels.push('create:block/large_cogwheel_shaftless');
          }
          if (id.includes('encased_shaft')) {
            extraModels.push('create:block/shaft');
          }

          for (const m of extraModels) {
            await this.loadModelRecursive(m);
          }

        } else {
          this.missingResources.add(`Blockstate: ${id}`);
        }

      } catch (e) {
        console.error(`Failed to load assets for ${id}`, e);
      }
    }

    if (this.missingResources.size > 0) {
      console.warn('Missing Create Mod Resources:', Array.from(this.missingResources).sort());
    }

    // Process collected raw data into the return format
    // We need to construct BlockModel objects now that we have all potentially related models (parents)

    // This is a simplified flattening. In reality, deepslate BlockModel can flatten itself if we provide a getter for other models.
    // We'll prepare the models map for deepslate to use.

    this.fetchedBlockModels.forEach((json, key) => {
      const modelId = key.includes(':') ? key : `create:${key}`;

      // PATCH PIPE MESHES:
      // The asset models (u_x, lr_y, etc) only contain the central core knot (4,4,4 to 12,12,12).
      // We must procedurally add the limbs based on the filename.
      // AND ensure the core knot has all 6 faces to prevent holes.
      if (modelId.startsWith('create:block/fluid_pipe/')) {
        this.patchPipeCoreFaces(json);
        this.patchPipeModelLimbs(json, modelId);
      }

      // We only care about create models here. Vanilla models are handled by the main app.
      // If a Create model parents a Vanilla model, Deepslate needs to be able to find it.
      // For now, we assume we return all fetched Create models.
      models[modelId] = createBlockModelFromJson(json);
    });

    this.fetchedTextures.forEach((blob, key) => {
      // Ensure texture IDs are fully qualified
      const textureId = key.includes(':') ? key : `create:${key}`;
      textures[textureId] = blob;
    });

    return {
      blockDefinitions: definitions,
      blockModels: models,
      textures: Object.fromEntries(this.fetchedTextures.entries()) // IDs are already fixed in the map keys if we are careful
    };
  }

  private async preloadSubpartModels (modelPaths: string[]) {
    const queued = new Set<string>();
    for (const model of modelPaths) {
      const clean = this.normalizePath(model);
      for (const candidate of this.getSubpartCandidates(clean)) {
        if (queued.has(candidate)) {
          continue;
        }
        queued.add(candidate);
        await this.loadModelRecursive(candidate);
      }
    }
  }

  private getSubpartCandidates (baseModel: string): string[] {
    const candidates: string[] = [];
    const [ns, path] = (baseModel.includes(':') ? baseModel.split(':', 2) : ['create', baseModel]) as [string, string];
    const parts = path.split('/');
    const dirs = new Set<string>();

    if (parts.length >= 3 && parts[0] === 'block') {
      dirs.add(`${ns}:${parts[0]}/${parts[1]}`);
    }

    const lowerPath = path.toLowerCase();
    if (lowerPath.includes('funnel')) {
      dirs.add(`${ns}:block/funnel`);
      dirs.add(`${ns}:block/belt_funnel`);
    }
    if (lowerPath.includes('tunnel')) {
      dirs.add(`${ns}:block/tunnel`);
      dirs.add(`${ns}:block/belt_tunnel`);
    }

    // Fallback to the base dir only if it is not the root block folder to avoid sweeping the entire manifest
    const baseDir = baseModel.substring(0, baseModel.lastIndexOf('/'));
    if (baseDir !== `${ns}:block`) {
      dirs.add(baseDir);
    }

    for (const dir of dirs) {
      for (const p of this.modelManifest) {
        if (!p.startsWith(dir + '/')) {
          continue;
        }
        if (p === baseModel) {
          continue;
        }
        const name = p.substring(p.lastIndexOf('/') + 1);
        if (SUBPART_TOKENS.some(t => name.includes(t))) {
          candidates.push(p);
        }
      }
    }

    return candidates;
  }

  private autoAttachSubparts (def: RawBlockState, blockId: string) {
    // Limit auto-attachments to known safe blocks to avoid mass over-attachment.
    if (!AUTO_SUBPART_BLOCKS.some(k => blockId.includes(k))) {
      return;
    }

    const parseWhen = (key: string): Record<string, string> | undefined => {
      if (!key) {
        return undefined;
      }
      const when: Record<string, string> = {};
      for (const pair of key.split(',')) {
        if (!pair) {
          continue;
        }
        const [k, v] = pair.split('=');
        if (k && v) {
          when[k] = v;
        }
      }
      return Object.keys(when).length ? when : undefined;
    };

    const referenced = new Set<string>();
    const modelUsage = new Map<string, { apply: RawBlockStateVariant; when: ModelMultiPartCondition | undefined }[]>();
    const multiparts: RawMultipartCase[] = [];

    const recordUsage = (model: string, when: ModelMultiPartCondition | undefined, apply: RawBlockStateVariant) => {
      const norm = this.normalizePath(model);
      referenced.add(norm);
      if (!modelUsage.has(norm)) {
        modelUsage.set(norm, []);
      }
      modelUsage.get(norm)!.push({
        apply: apply ? JSON.parse(JSON.stringify(apply)) as RawBlockStateVariant : undefined!,
        when: when ? JSON.parse(JSON.stringify(when)) as ModelMultiPartCondition : undefined
      });
    };

    const pushMultipart = (apply: RawBlockStateVariant, when: ModelMultiPartCondition | undefined) => {
      multiparts.push({ apply, when });
      if (apply?.model) {
        recordUsage(apply.model, when, apply);
      }
    };

    if (def.variants) {
      for (const [key, variant] of Object.entries(def.variants)) {
        const when = parseWhen(key);
        const entries = Array.isArray(variant) ? variant : [variant];
        for (const entry of entries) {
          pushMultipart(entry, when);
        }
      }
    }

    if (def.multipart) {
      for (const part of def.multipart) {
        if (Array.isArray(part.apply)) {
          for (const apply of part.apply) {
            pushMultipart(apply, part.when);
          }
        } else {
          pushMultipart(part.apply, part.when);
        }
      }
    }

    const added = new Set<string>();

    for (const [baseModel, entries] of modelUsage.entries()) {
      const dir = baseModel.substring(0, baseModel.lastIndexOf('/'));
      // If the model has no subdirectory (dir == create:block), skip auto-scanning to avoid sweeping the entire manifest.
      if (dir.endsWith(':block')) {
        continue;
      }
      const whenList = entries.length ? entries : [{ apply: undefined, when: undefined }];

      for (const [candidate] of this.fetchedBlockModels) {
        if (!candidate.startsWith(dir + '/')) {
          continue;
        }
        if (referenced.has(candidate)) {
          continue;
        }
        const base = candidate.substring(candidate.lastIndexOf('/') + 1);
        if (!SUBPART_TOKENS.some(t => base.includes(t))) {
          continue;
        }

        for (const { apply: baseApply, when } of whenList) {
          const apply: RawBlockStateVariant = { model: candidate };
          if (baseApply) {
            for (const prop of ['x', 'y', 'z', 'uvlock'] as const) {
              if (prop in baseApply) {
                // @ts-expect-error type safety
                apply[prop] = baseApply[prop];
              }
            }
          }
          // Pump cog orientation should align its axis to the pump facing (horizontal pumps need vertical cogs).
          if (blockId.includes('mechanical_pump') && candidate.includes('mechanical_pump/cog')) {
            const facing = (when && !('OR' in when)) ? when.facing : undefined;
            const norm = (v: number) => ((v % 360) + 360) % 360;
            switch (facing) {
              case 'north':
                apply.x = 0;
                apply.y = 0;
                break;
              case 'south':
                apply.x = 0;
                apply.y = 180;
                break;
              case 'east':
                apply.x = 0;
                apply.y = 90;
                break;
              case 'west':
                apply.x = 0;
                apply.y = 270;
                break;
              case 'up':
                apply.x = 270;
                apply.y = 0;
                break;
              case 'down':
                apply.x = 90;
                apply.y = 0;
                break;
              default:
                apply.x = norm(apply.x ?? 0);
                apply.y = norm(apply.y ?? 0);
                break;
            }
          }
          // Drill head should align to facing rather than inheriting casing x/y which aim the body.
          if (blockId.includes('mechanical_drill') && candidate.includes('mechanical_drill/head')) {
            const facing = (when && !('OR' in when)) ? when.facing : undefined;
            const norm = (v: number) => ((v % 360) + 360) % 360;
            switch (facing) {
              case 'north':
                apply.x = 0;
                apply.y = norm(0);
                break;
              case 'south':
                apply.x = 0;
                apply.y = norm(180);
                break;
              case 'east':
                apply.x = 0;
                apply.y = norm(270);
                break;
              case 'west':
                apply.x = 0;
                apply.y = norm(90);
                break;
              case 'up':
                apply.x = norm(90);
                apply.y = 0;
                break;
              case 'down':
                apply.x = norm(270);
                apply.y = 0;
                break;
              default:
                break;
            }
          }
          const key = `${candidate}|${apply.x ?? 0}|${apply.y ?? 0}|${apply.z ?? 0}|${apply.uvlock ?? false}|${JSON.stringify(when ?? {})}`;
          if (added.has(key)) {
            continue;
          }
          multiparts.push({ apply, when });
          added.add(key);
          this.autoSubpartLog.push({ blockId, baseModel, subpart: candidate, when: when ? { ...when } : undefined });
        }
      }
    }

    // Spout nozzles are authored as separate models (top/middle/bottom) that are never referenced in the blockstate.
    const primaryBaseModel = modelUsage.keys().next().value ?? blockId;

    // Attach them unconditionally so spouts render their nose in static scenes.
    if (blockId.includes('spout')) {
      for (const nozzle of ['create:block/spout/top', 'create:block/spout/middle', 'create:block/spout/bottom']) {
        const norm = this.normalizePath(nozzle);
        if (!this.fetchedBlockModels.has(norm)) {
          continue;
        }
        if (!referenced.has(norm)) {
          multiparts.push({ apply: { model: norm }, when: undefined });
        }
        referenced.add(norm);
        this.autoSubpartLog.push({ blockId, baseModel: 'create:block/spout/block', subpart: norm, when: undefined });
      }
    }

    // Belt funnel/tunnel flaps should align with their base variant rotation and skip vertical funnels.
    const baseMultiparts = multiparts.slice();
    const attachFlap = (flapId: string, sourceModelMatch: (m: string) => boolean) => {
      const normFlap = this.normalizePath(flapId);
      if (!this.fetchedBlockModels.has(normFlap)) {
        console.warn(`[CreateModLoader] Missing flap model ${normFlap} for ${blockId}; skipping attachment.`);
        return;
      }
      for (const part of baseMultiparts) {
        const applies = Array.isArray(part.apply) ? part.apply : [part.apply];
        const when = part.when;

        for (const apply of applies) {
          const modelName = apply?.model;
          if (!modelName || !sourceModelMatch(modelName)) {
            continue;
          }
          const facing = (when && 'facing' in when) ? when.facing : undefined;
          if (facing === 'up' || facing === 'down') {
            continue;
          }
          const keyed = `${normFlap}|${JSON.stringify(when ?? {})}|${apply?.x ?? 0}|${apply?.y ?? 0}`;
          if (referenced.has(keyed)) {
            continue;
          }
          multiparts.push({ apply: { model: normFlap, x: apply?.x, y: apply?.y }, when });
          referenced.add(keyed);
          this.autoSubpartLog.push({ blockId, baseModel: primaryBaseModel, subpart: normFlap, when: when ? { ...when } : undefined });
        }
      }
    };

    if (blockId.includes('funnel')) {
      attachFlap('create:block/funnel/flap', m => m.includes('funnel'));
      attachFlap('create:block/belt_funnel/flap', m => m.includes('belt_funnel'));
    }
    if (blockId.includes('tunnel')) {
      attachFlap('create:block/belt_tunnel/flap', m => m.includes('tunnel'));
    }
    if (blockId.includes('mechanical_mixer')) {
      const cog = this.normalizePath('create:block/cogwheel_shaftless');
      if (this.fetchedBlockModels.has(cog) && !referenced.has(cog)) {
        multiparts.push({ apply: { model: cog }, when: undefined });
        referenced.add(cog);
        this.autoSubpartLog.push({ blockId, baseModel: primaryBaseModel, subpart: cog, when: undefined });
      }
    }

    if (multiparts.length > 0) {
      def.multipart = multiparts;
      delete def.variants;
    }
  }

  private async ensureSpoutNozzles () {
    for (const nozzle of ['create:block/spout/top', 'create:block/spout/middle', 'create:block/spout/bottom']) {
      await this.loadModelRecursive(nozzle);
    }
  }

  private patchBeltDefinition (def: RawBlockState) {
    if (!def.variants) {
      return;
    }
    const multipart: RawMultipartCase[] = [];

    for (const key of Object.keys(def.variants)) {
      // Parse key "part=middle,slope=flat,..."
      // Need to clean the key (extract properties)
      const props: Record<string, string> = {};
      key.split(',').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) {
          props[k] = v;
        }
      });

      const original = Array.isArray(def.variants[key]) ? def.variants[key][0] : def.variants[key];
      if (!original) {
        continue;
      }
      const models: string[] = [];

      // 1. Determine base models
      if (props.slope === 'horizontal') {
        if (props.part === 'middle') {
          models.push('create:block/belt/middle');
          models.push('create:block/belt/middle_bottom');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/horizontal_middle');
          }
        } else if (props.part === 'start') {
          models.push('create:block/belt/start');
          models.push('create:block/belt/start_bottom');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/horizontal_start');
          }
        } else if (props.part === 'end') {
          models.push('create:block/belt/end');
          models.push('create:block/belt/end_bottom');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/horizontal_end');
          }
        } else if (props.part === 'pulley') {
          models.push('create:block/belt_pulley');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/horizontal_pulley');
          }
        }
      } else {
        // Handle Slopes (Diagonal) - Simplified mapping
        // Diagonal logic is complex. Using heuristics.
        if (props.part === 'middle') {
          models.push('create:block/belt/diagonal_middle');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/diagonal_middle');
          }
        } else if (props.part === 'start') {
          models.push('create:block/belt/diagonal_start');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/diagonal_start');
          }
        } else if (props.part === 'end') {
          models.push('create:block/belt/diagonal_end');
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/diagonal_end');
          }
        } else if (props.part === 'pulley') {
          if (props.casing === 'true') {
            models.push('create:block/belt_casing/diagonal_pulley');
          }
        }
      }

      // Fallback if no models found (e.g. invalid state), keep original particle model logic?
      // But original logic didn't work well.
      if (models.length === 0) {
        models.push('create:block/belt/particle');
      }

      // 2. Create Multipart Entry
      for (const m of models) {
        multipart.push({
          apply: {
            model: m,
            x: original.x,
            y: original.y,
            uvlock: original.uvlock
          },
          when: props
        });
      }
    }

    delete def.variants;
    def.multipart = multipart;
  }

  private patchEncasedCogDefinition (def: RawBlockState, id: string) {
    if (!def.multipart) {
      def.multipart = [];
    }
    if (def.variants) {
      for (const [key, variant] of Object.entries(def.variants)) {
        const when: Record<string, string> = {};
        key.split(',').forEach(pair => {
          const [k, v] = pair.split('=');
          if (k && v) {
            when[k] = v;
          }
        });
        const entries = Array.isArray(variant) ? variant : [variant];
        for (const entry of entries) {
          def.multipart.push({ apply: entry, when: Object.keys(when).length ? when : undefined });
        }
      }
      delete def.variants;
    }

    // Case 1: Encased Cogwheel
    if (id.includes('encased_cogwheel')) {
      const isLarge = id.includes('large');
      const cogModel = isLarge ? 'create:block/large_cogwheel_shaftless' : 'create:block/cogwheel_shaftless';

      def.multipart.push({ apply: { model: cogModel }, when: { axis: 'y' } });
      def.multipart.push({ apply: { model: cogModel, x: 90, y: 90 }, when: { axis: 'x' } });
      def.multipart.push({ apply: { model: cogModel, x: 90 }, when: { axis: 'z' } });
    }

    // Case 2: Encased Shaft
    if (id.includes('encased_shaft')) {
      const shaftModel = 'create:block/shaft';
      def.multipart.push({ apply: { model: shaftModel }, when: { axis: 'y' } });
      def.multipart.push({ apply: { model: shaftModel, x: 90, y: 90 }, when: { axis: 'x' } });
      def.multipart.push({ apply: { model: shaftModel, x: 90 }, when: { axis: 'z' } });
    }
  }

  private patchEncasedPipeDefinition (def: RawBlockState) {
    if (!def.multipart) {
      def.multipart = [];
    }

    // 1. Add Cores (Always) to ensure hole is filled
    // We use all 3 cores to be safe.
    def.multipart.push({ apply: { model: 'create:block/fluid_pipe/core_x' }, when: { OR: [{}] } });
    def.multipart.push({ apply: { model: 'create:block/fluid_pipe/core_y' }, when: { OR: [{}] } });
    def.multipart.push({ apply: { model: 'create:block/fluid_pipe/core_z' }, when: { OR: [{}] } });

    // 2. Add Connections based on heuristic mapping
    const connections: { when: ModelMultiPartCondition; model: string }[] = [
      { when: { up: 'true' }, model: 'create:block/fluid_pipe/u_x' },
      { when: { down: 'true' }, model: 'create:block/fluid_pipe/d_x' },
      { when: { south: 'true' }, model: 'create:block/fluid_pipe/l_x' },
      { when: { north: 'true' }, model: 'create:block/fluid_pipe/r_x' },
      { when: { east: 'true' }, model: 'create:block/fluid_pipe/l_y' },
      { when: { west: 'true' }, model: 'create:block/fluid_pipe/r_y' }
    ];

    for (const conn of connections) {
      def.multipart.push({
        apply: { model: conn.model },
        when: conn.when
      });
    }
  }

  private rotateElementX90 (element: RawModelElement): RawModelElement {
    const newEl = JSON.parse(JSON.stringify(element)) as RawModelElement;
    // Rotate around center (8, 8, 8) by 90 deg on X
    // y' = - (z - 8) + 8 = 16 - z
    // z' = (y - 8) + 8 = y
    const rot = (p: [number, number, number]): [number, number, number] => [p[0], 16 - p[2], p[1]];

    const from = rot(element.from);
    const to = rot(element.to);

    newEl.from = [
      Math.min(from[0], to[0]),
      Math.min(from[1], to[1]),
      Math.min(from[2], to[2])
    ];
    newEl.to = [
      Math.max(from[0], to[0]),
      Math.max(from[1], to[1]),
      Math.max(from[2], to[2])
    ];

    if (newEl.rotation) {
      newEl.rotation.origin = rot(newEl.rotation.origin as [number, number, number]);
      if (newEl.rotation.axis === 'y') {
        newEl.rotation.axis = 'z';
      } else if (newEl.rotation.axis === 'z') {
        newEl.rotation.axis = 'y';
        newEl.rotation.angle = -newEl.rotation.angle;
      }
    }

    const faceMap: Record<string, string> = {
      up: 'south',
      down: 'north',
      north: 'up',
      south: 'down',
      east: 'east',
      west: 'west'
    };

    if (newEl.faces) {
      const newFaces: Record<string, RawModelFace> = {};
      for (const [dir, face] of Object.entries(newEl.faces)) {
        const newDir = faceMap[dir] || dir;
        newFaces[newDir] = face as RawModelFace;
      }
      newEl.faces = newFaces;
    }
    return newEl;
  }

  private patchFluidPipeConnectionRules (def: RawBlockState) {
    if (!def.multipart) {
      def.multipart = [];
    }

    // Add broad, non-exclusive rules for every direction.
    // These ensure that even in complex T-junctions or crosses (where standard strict rules fail),
    // the relevant limb is still rendered.
    // We rely on Z-fighting (invisible for identical overlaps) to handle cases where strict rules ALSO match.

    // Map global direction to a model that we know has that limb (based on our procedural patch)
    const fallbackRules: { when: ModelMultiPartCondition; model: string }[] = [
      { when: { up: 'true' }, model: 'create:block/fluid_pipe/u_x' }, // u_x has usage where u->up
      { when: { down: 'true' }, model: 'create:block/fluid_pipe/d_x' }, // d_x has usage where d->down
      { when: { north: 'true' }, model: 'create:block/fluid_pipe/r_x' }, // r_x has usage where r->north
      { when: { south: 'true' }, model: 'create:block/fluid_pipe/l_x' }, // l_x has usage where l->south
      { when: { east: 'true' }, model: 'create:block/fluid_pipe/l_z' }, // l_z has usage where l->east
      { when: { west: 'true' }, model: 'create:block/fluid_pipe/r_z' } // r_z has usage where r->west
    ];

    for (const rule of fallbackRules) {
      def.multipart.push({
        apply: { model: rule.model },
        when: rule.when
      });
    }
  }

  private patchPipeCoreFaces (json: RawBlockModel) {
    if (!json.elements) {
      return;
    }

    // Find the core element (4,4,4 to 12,12,12)
    const core = json.elements.find((e): e is RawModelElement => 'from' in e
      && e.from[0] === 4 && e.from[1] === 4 && e.from[2] === 4
      && e.to[0] === 12 && e.to[1] === 12 && e.to[2] === 12);

    if (core) {
      const faces = ['north', 'south', 'east', 'west', 'up', 'down'];
      const sampleFace = core.faces ? Object.values(core.faces)[0] as RawModelFace | undefined : undefined;
      const defaultUv = Array.isArray(sampleFace?.uv) && sampleFace.uv.length === 4 ? sampleFace.uv : [12, 8, 16, 12];
      const defaultTexture = sampleFace?.texture ?? '#0';

      if (!core.faces) {
        core.faces = {};
      }

      for (const face of faces) {
        const dir = face as Direction;
        if (!core.faces[dir]) {
          core.faces[dir] = {
            texture: defaultTexture,
            uv: defaultUv as [number, number, number, number]
          };
        }
      }
    }
  }

  private patchPipeModelLimbs (json: RawBlockModel, modelId: string) {
    const name = modelId.split('/').pop()?.replace('.json', '') || '';

    // Parse components: e.g. "lu_x" -> components="lu", axis="x"
    const parts = name.split('_');
    if (parts.length < 2) {
      return;
    } // e.g. "core_x", "window", etc.

    const components = parts[0]!;
    const axis = parts[1]!; // "x", "y", "z"

    // Ignore non-connection models
    if (!['x', 'y', 'z'].includes(axis)) {
      return;
    }
    if (components === 'core') {
      return;
    }

    if (!json.elements) {
      json.elements = [];
    }

    // Map logic: which global direction does a component letter represent in a given axis?
    const getDir = (comp: string, ax: string) => {
      if (ax === 'x') { // Core Axis X (East-West)
        if (comp === 'u') {
          return 'up';
        } // Local Up -> Global Up
        if (comp === 'd') {
          return 'down';
        } // Local Down -> Global Down
        if (comp === 'l') {
          return 'south';
        } // Local Left -> Global South
        if (comp === 'r') {
          return 'north';
        } // Local Right -> Global North
      }
      if (ax === 'y') { // Core Axis Y (Up-Down)
        if (comp === 'u') {
          return 'south';
        } // Local Up -> Global South (Wait, verify mapping)
        if (comp === 'd') {
          return 'north';
        } // Local Down -> Global North
        if (comp === 'l') {
          return 'east';
        } // Local Left -> Global East
        if (comp === 'r') {
          return 'west';
        } // Local Right -> Global West
      }
      if (ax === 'z') { // Core Axis Z (North-South)
        if (comp === 'u') {
          return 'up';
        } // Local Up -> Global Up
        if (comp === 'd') {
          return 'down';
        } // Local Down -> Global Down
        if (comp === 'l') {
          return 'east';
        } // Local Left -> Global East
        if (comp === 'r') {
          return 'west';
        } // Local Right -> Global West
      }
      return null;
    };

    // Iterate letters (e.g. "l", "u")
    for (const char of components) {
      const dir = getDir(char, axis);
      if (!dir) {
        continue;
      }
      if (dir) {
        this.addPipeLimb(json, dir);
      }
    }
  }

  private addPipeLimb (json: RawBlockModel, dir: string) {
    // Define limb geo
    const lim: RawModelElement = { from: [0, 0, 0], to: [0, 0, 0], faces: {} };
    // Reuse whatever UV/texture the core already declared to avoid sampling missing atlas space.
    const core = Array.isArray(json.elements)
      ? (json.elements as (RawModelElement | ObjMeshPart)[]).find((e): e is RawModelElement => 'from' in e && e.from[0] === 4 && e.from[1] === 4 && e.from[2] === 4 && e.to[0] === 12 && e.to[1] === 12 && e.to[2] === 12)
      : undefined;
    const pickFace = (name: string) => core?.faces ? (core.faces as Record<string, RawModelFace | undefined>)[name] : undefined;
    const sampleFace = pickFace(dir) || (core?.faces ? (Object.values(core?.faces ?? {})[0] as RawModelFace | undefined) : undefined);
    const texRef = sampleFace?.texture ?? '#0';
    const uvForDir = (name: string) => {
      const face = pickFace(name);
      return Array.isArray(face?.uv) && face.uv.length === 4 ? face.uv : undefined;
    };
    const uvSide = uvForDir(dir) || (Array.isArray(sampleFace?.uv) && sampleFace.uv.length === 4 ? sampleFace.uv : [4, 0, 12, 4]);
    const uvEnd = uvSide;

    // Geometry: Core is 4..12.
    if (dir === 'up') {
      lim.from = [4, 12, 4];
      lim.to = [12, 16, 12];
      lim.faces = {
        north: { texture: texRef, uv: uvSide },
        south: { texture: texRef, uv: uvSide },
        east: { texture: texRef, uv: uvSide },
        west: { texture: texRef, uv: uvSide },
        up: { texture: texRef, uv: uvEnd }
      };
    } else if (dir === 'down') {
      lim.from = [4, 0, 4];
      lim.to = [12, 4, 12];
      lim.faces = {
        north: { texture: texRef, uv: uvSide },
        south: { texture: texRef, uv: uvSide },
        east: { texture: texRef, uv: uvSide },
        west: { texture: texRef, uv: uvSide },
        down: { texture: texRef, uv: uvEnd }
      };
    } else if (dir === 'east') {
      lim.from = [12, 4, 4];
      lim.to = [16, 12, 12];
      lim.faces = {
        north: { texture: texRef, uv: uvSide },
        south: { texture: texRef, uv: uvSide },
        up: { texture: texRef, uv: uvSide },
        down: { texture: texRef, uv: uvSide },
        east: { texture: texRef, uv: uvEnd }
      };
    } else if (dir === 'west') {
      lim.from = [0, 4, 4];
      lim.to = [4, 12, 12];
      lim.faces = {
        north: { texture: texRef, uv: uvSide },
        south: { texture: texRef, uv: uvSide },
        up: { texture: texRef, uv: uvSide },
        down: { texture: texRef, uv: uvSide },
        west: { texture: texRef, uv: uvEnd }
      };
    } else if (dir === 'south') {
      lim.from = [4, 4, 12];
      lim.to = [12, 12, 16];
      lim.faces = {
        east: { texture: texRef, uv: uvSide },
        west: { texture: texRef, uv: uvSide },
        up: { texture: texRef, uv: uvSide },
        down: { texture: texRef, uv: uvSide },
        south: { texture: texRef, uv: uvEnd }
      };
    } else if (dir === 'north') {
      lim.from = [4, 4, 0];
      lim.to = [12, 12, 4];
      lim.faces = {
        east: { texture: texRef, uv: uvSide },
        west: { texture: texRef, uv: uvSide },
        up: { texture: texRef, uv: uvSide },
        down: { texture: texRef, uv: uvSide },
        north: { texture: texRef, uv: uvEnd }
      };
    }

    if (!json.elements) {
      json.elements = [];
    }
    json.elements.push(lim);
  }

  private flattenCompositeChildren (modelJson: RawBlockModel) {
    if (!modelJson?.children || typeof modelJson.children !== 'object') {
      return;
    }
    const entries = Object.entries(modelJson.children);
    if (entries.length === 0) {
      delete modelJson.children;
      return;
    }
    const elements = modelJson.elements ?? [];
    for (const [childName, child] of entries) {
      if (!child || typeof child !== 'object') {
        continue;
      }
      this.flattenCompositeChildren(child);
      const textureMap = this.mergeChildTextures(modelJson, child, childName);
      const childElements = child.elements;
      if (!Array.isArray(childElements)) {
        continue;
      }
      for (const element of childElements) {
        const clone = JSON.parse(JSON.stringify(element));
        this.remapElementTextures(clone, textureMap);
        elements.push(clone);
      }
    }
    modelJson.elements = elements;
    delete modelJson.children;
  }

  private mergeChildTextures (modelJson: RawBlockModel, child: RawBlockModel, childName: string) {
    const textures = modelJson.textures ?? (modelJson.textures = {});
    const mapping: Record<string, string> = {};
    const childTextures = child.textures;
    if (!childTextures || typeof childTextures !== 'object') {
      return mapping;
    }
    for (const [key, value] of Object.entries(childTextures)) {
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }
      let candidate = key;
      if (key === 'particle') {
        if (!textures.particle || textures.particle === value) {
          candidate = 'particle';
        } else {
          candidate = `${childName}_particle`;
        }
      } else {
        candidate = `${childName}_${key}`;
      }
      let finalKey = candidate;
      let suffix = 0;
      while (textures[finalKey] && textures[finalKey] !== value) {
        suffix += 1;
        finalKey = `${candidate}_${suffix}`;
      }
      textures[finalKey] = value;
      mapping[key] = finalKey;
    }
    return mapping;
  }

  private remapElementTextures (element: RawModelElement, textureMap: Record<string, string>) {
    if (!element.faces) {
      return;
    }
    for (const face of Object.values(element.faces)) {
      if (!face || !face.texture || typeof face.texture !== 'string') {
        continue;
      }
      if (!face.texture.startsWith('#')) {
        continue;
      }
      const key = face.texture.slice(1);
      const mapped = textureMap[key];
      if (!mapped) {
        continue;
      }
      face.texture = `#${mapped}`;
    }
  }

  private async loadModelRecursive (modelPath: string) {
    const cleanPath = this.normalizePath(modelPath);
    if (this.visitedModels.has(cleanPath)) {
      return;
    }
    if (this.fetchedBlockModels.has(cleanPath)) {
      this.visitedModels.add(cleanPath);
      return;
    }
    this.visitedModels.add(cleanPath);

    if (!cleanPath.startsWith('create:')) {
      // It's likely a vanilla model (e.g. minecraft:block/cube_all), skip it as we don't fetch vanilla here.
      return;
    }

    const relativePath = cleanPath.replace('create:', '');
    const modelJson = await this.fetchJson(`models/${relativePath}.json`) as RawBlockModel | undefined;
    if (modelJson) {
      if (modelJson.parent) {
        await this.loadModelRecursive(modelJson.parent);
      }

      // SPECIAL HANDLING FOR OBJ MODELS (Crushing Wheels, Water Wheels, Valve Handles)
      if (modelJson.loader && modelJson.loader.includes('obj')) {
        const objPathSrc = modelJson.model;
        let objPath = objPathSrc;
        if (objPath) {
          if (!objPath.endsWith('.obj')) {
            objPath += '.obj';
          }

          // "create:block/crushing_wheel/crushing_wheel.obj"
          const relativeRef = objPath.replace(/^create:/, '');
          const cleanRelPath = relativeRef.startsWith('models/') ? relativeRef.substring(7) : relativeRef;
          const objText = await this.fetchText(`models/${cleanRelPath}`);

          if (objText) {
            const parts = parseObj(objText);
            // ... (I need the rest of the block)

            // Resolve all available textures (including from parents) to use for remapping
            const collectTextures = (m: RawBlockModel): Record<string, string> => {
              const acc = m.parent ? collectTextures(this.fetchedBlockModels.get(this.normalizePath(m.parent)) || {}) : {};
              return { ...acc, ...(m.textures || {}) };
            };
            const availableTextures = collectTextures(modelJson);

            // 1. CRUSHING WHEEL
            if (cleanPath.includes('crushing_wheel')) {
              const materialMap: Record<string, string> = {
                crushing_wheel_insert: 'insert',
                crushing_wheel_plates: 'plates',
                m_axis: 'axis',
                m_axis_top: 'axis_top',
                m_spruce_log_top: 'spruce_log_top'
              };
              for (const part of parts) {
                const mapped = materialMap[part.texture];
                if (mapped) {
                  part.texture = mapped;
                }
              }
            }

            // 2. MECHANICAL ROLLER
            if (cleanPath.includes('mechanical_roller')) {
              const materialMap: Record<string, string> = {
                roller_wheel: 'wheel'
              };
              for (const part of parts) {
                const mapped = materialMap[part.texture];
                if (mapped) {
                  part.texture = mapped;
                }
              }
            }

            // 3. CHAIN CONVEYOR
            if (cleanPath.includes('chain_conveyor')) {
              const materialMap: Record<string, string> = {
                casing: 'conveyor_casing',
                bullwheel: 'bullwheel',
                axis: 'axis',
                axis_top: 'axis_top',
                port: 'conveyor_port'
              };
              for (const part of parts) {
                const mapped = materialMap[part.texture];
                if (mapped) {
                  part.texture = mapped;
                }
              }
            }

            // 4. WATER WHEEL (and LARGE)
            if (cleanPath.includes('water_wheel') || cleanPath.includes('large_water_wheel')) {
              const materialMap: Record<string, string> = {
                waterwheel_log: 'log', // or check availableTextures
                waterwheel_plank: 'planks',
                waterwheel_metal: 'metal',
                waterwheel_stripped_log: 'log_top',
                axis: 'axis',
                axis_top: 'axis_top'
              };
              for (const part of parts) {
                const mapped = materialMap[part.texture];
                if (mapped) {
                  part.texture = mapped;
                }
              }
            }

            // 4. VALVE HANDLE
            if (cleanPath.includes('valve_handle')) {
              const materialMap: Record<string, string> = {
                Material: '3'
              };
              for (const part of parts) {
                const mapped = materialMap[part.texture];
                if (mapped) {
                  part.texture = mapped;
                }
              }
            }

            // Generic OBJ texture remap
            const textureKeys = new Set(Object.keys(availableTextures));
            // If a texture key maps to another variable (#ref), we should resolve it?
            // Deepslate does this later, but for remapping "m_name" -> "name", we need to know "name" exists.

            const defaultKey = textureKeys.has('0') ? '0' : undefined;

            for (const part of parts) {
              if (textureKeys.has(part.texture)) {
                continue;
              }

              const stripped = part.texture.startsWith('m_') ? part.texture.slice(2) : part.texture;
              if (textureKeys.has(stripped)) {
                part.texture = stripped;
                continue;
              }
              const noHash = stripped.startsWith('#') ? stripped.slice(1) : stripped;
              if (textureKeys.has(noHash)) {
                part.texture = noHash;
                continue;
              }

              // If we have mapped a material (e.g. 'log') but the texture key is actually '#log', handle that?
              // Usually OBJ parts -> texture keys. Texture keys -> Paths.
              // If part.texture is 'log', and keys has 'log', good.

              if (defaultKey) {
              // Fallback to '0' if available (common for single-texture models)
              // Only if we haven't found a match
                part.texture = defaultKey;
              }
            }

            // Ensure declared textures are loaded
            // use availableTextures to access all inherited textures too
            for (const tex of Object.values(availableTextures)) {
              if (!tex || typeof tex !== 'string') {
                continue;
              }
              if (tex.startsWith('#')) {
                continue;
              }
              await this.loadTexture(tex);
            }

            modelJson.elements = parts;
          } else {
            console.warn(`Failed to load OBJ: models/${cleanRelPath}`);
            modelJson.elements = [];
          }
        }
      }

      // Standard processing continues...
      // 1. Check parent (Already done above for context, but standard logic does it again?
      //    visitedModels check prevents double fetch, but we might want to avoid re-recursion overhead)
      if (modelJson.parent && !modelJson.loader?.includes('obj')) {
        // Only load if not already handled or if not OBJ (OBJ block did it)
        // Actually, if we loaded it above, loadModelRecursive returns early.
        await this.loadModelRecursive(modelJson.parent);
      }

      this.flattenCompositeChildren(modelJson);

      // 2. Apply geometry patches after parent load
      this.patchFunnelFlap(modelJson, cleanPath);
      this.patchTunnelFlaps(modelJson, cleanPath);
      await this.patchKineticPoses(modelJson, cleanPath);
      this.patchMechanicalRoller(modelJson, cleanPath);
      await this.ensureFactoryGaugeGeometry(modelJson, cleanPath);

      this.fetchedBlockModels.set(cleanPath, modelJson);

      // 3. Check textures
      if (modelJson.textures) {
        for (const key in modelJson.textures) {
          const texturePath = modelJson.textures[key];
          if (texturePath) {
            if (texturePath.startsWith('#')) {
              continue;
            } // Reference to another variable

            await this.loadTexture(texturePath);
          }
        }
      }
    } else {
      const synthetic = this.buildFunnelFallback(cleanPath);
      if (synthetic) {
        this.flattenCompositeChildren(synthetic);
        this.fetchedBlockModels.set(cleanPath, synthetic);
        if (synthetic.parent) {
          await this.loadModelRecursive(synthetic.parent);
        }
        if (synthetic.textures) {
          for (const key in synthetic.textures) {
            const tex = synthetic.textures[key];
            if (tex && typeof tex === 'string' && !tex.startsWith('#')) {
              await this.loadTexture(tex);
            }
          }
        }
        return;
      }
      // Try a generic fallback: if a smart_* model is missing, reuse the base model without the smart_ prefix.
      if (cleanPath.includes('smart_')) {
        const fallbackPath = cleanPath.replace('smart_', '');
        const fallbackJson = await this.fetchJson<RawBlockModel>(`models/${fallbackPath.replace('create:', '')}.json`);
        if (fallbackJson) {
          console.warn(`[CreateModLoader] Missing ${cleanPath}, using fallback ${fallbackPath}`);
          this.flattenCompositeChildren(fallbackJson);
          this.fetchedBlockModels.set(cleanPath, fallbackJson);
          if (fallbackJson.parent) {
            await this.loadModelRecursive(fallbackJson.parent);
          }
          if (fallbackJson.textures) {
            for (const key in fallbackJson.textures) {
              const texturePath = fallbackJson.textures[key];
              if (texturePath && !texturePath.startsWith('#')) {
                await this.loadTexture(texturePath);
              }
            }
          }
          return;
        }
      }

      // Try generated if main failed? usually models are in main/resources
      this.missingResources.add(`Model: ${cleanPath}`);
    }
  }

  private async patchKineticPoses (modelJson: RawBlockModel, cleanPath: string) {
    // Mechanical Arm: use the folded item pose for the body, and publish the cog as a separate model for spinning.
    if (cleanPath === 'create:block/mechanical_arm/block') {
      await this.loadModelRecursive('create:block/mechanical_arm/item');
      const itemModel = this.fetchedBlockModels.get('create:block/mechanical_arm/item');
      if (!itemModel) {
        return;
      }
      const { bodyElements, cogElements, textures } = this.splitMechanicalArmElements(itemModel);
      if (bodyElements.length) {
        modelJson.elements = this.translateElements(bodyElements, 0, 16, 0);
        if (textures) {
          modelJson.textures = { ...(modelJson.textures ?? {}), ...textures };
        }
      }
      if (cogElements.length && !this.fetchedBlockModels.has('create:block/mechanical_arm/cog')) {
        this.fetchedBlockModels.set('create:block/mechanical_arm/cog', {
          parent: 'block/block',
          elements: this.translateElements(cogElements, 0, 16, 0),
          textures: { ...textures }
        });
      }
    }

    // Mechanical Crafter gears are attached via blockstate mutation (see injectMechanicalCrafterGears).
  }

  private async ensureFactoryGaugeGeometry (modelJson: RawBlockModel, cleanPath: string) {
    if (cleanPath !== 'create:block/factory_gauge/block') {
      return;
    }
    if (Array.isArray(modelJson.elements) && modelJson.elements.length > 0) {
      return;
    }
    const panelId = 'create:block/factory_gauge/panel';
    await this.loadModelRecursive(panelId);
    const panel = this.fetchedBlockModels.get(panelId);
    if (!panel?.elements) {
      return;
    }
    modelJson.elements = JSON.parse(JSON.stringify(panel.elements));
    modelJson.textures = { ...(modelJson.textures ?? {}), ...(panel.textures ?? {}) };
    if (!modelJson.display && panel.display) {
      modelJson.display = panel.display;
    }
  }

  private patchFunnelFlap (modelJson: RawBlockModel, cleanPath: string) {
    const flapIds = new Set([
      'create:block/funnel/flap',
      'create:block/belt_funnel/flap'
    ]);
    if (!flapIds.has(cleanPath)) {
      return;
    }
    if (!Array.isArray(modelJson.elements) || modelJson.elements.length === 0) {
      return;
    }
    // If already expanded, skip
    if (modelJson.elements.length > 1) {
      return;
    }
    const base = JSON.parse(JSON.stringify(modelJson.elements[0]));
    const clones = [base];
    for (let i = 1; i < 4; i++) {
      const c = JSON.parse(JSON.stringify(base));
      c.from[0] -= 3 * i;
      c.to[0] -= 3 * i;
      if (c.rotation?.origin) {
        c.rotation.origin[0] -= 3 * i;
      }
      c.name = `${base.name || 'flap'}_${i}`;
      clones.push(c);
    }
    modelJson.elements = clones;
  }

  private patchTunnelFlaps (modelJson: RawBlockModel, cleanPath: string) {
    // Belt tunnel block models (and their tunneled children) lack flaps; inject static flaps so visuals match Create.
    if (!cleanPath.startsWith('create:block/belt_tunnel/') && !cleanPath.startsWith('create:block/tunnel/')) {
      return;
    }

    // If this model has no elements, try cloning from its parent so we can inject flaps.
    if (!Array.isArray(modelJson.elements) || modelJson.elements.length === 0) {
      if (modelJson.parent) {
        const parentId = this.normalizePath(modelJson.parent);
        const parent = this.fetchedBlockModels.get(parentId);
        if (parent?.elements) {
          modelJson.elements = JSON.parse(JSON.stringify(parent.elements));
        }
      }
    }

    if (!Array.isArray(modelJson.elements) || modelJson.elements.length === 0) {
      return;
    }

    if (modelJson.elements.some(e => ('name' in e && e.name ? e.name : '').toLowerCase().includes('flap'))) {
      return;
    }
    // Prefer the dark funnel back texture; alias it into the model so the atlas loads it.
    let texKey = '#back';
    if (!modelJson.textures?.back) {
      const textures = modelJson.textures ?? (modelJson.textures = {});
      textures._flap = textures._flap ?? 'create:block/funnel/funnel_back';
      texKey = '#_flap';
    }
    const makeFlap = (from: [number, number, number], to: [number, number, number], rotateDown: number, rotateUp: number) => ({
      name: 'Flap',
      from,
      to,
      rotation: { angle: 0, axis: 'y' as const, origin: [8, 8, 8] as [number, number, number] },
      faces: {
        north: { uv: [6, 8, 6.5, 14.5] as [number, number, number, number], texture: texKey },
        east: { uv: [6, 8, 7.5, 14.5] as [number, number, number, number], rotation: 180 as const, texture: texKey },
        south: { uv: [7, 8, 7.5, 14.5] as [number, number, number, number], texture: texKey },
        west: { uv: [6, 8, 7.5, 14.5] as [number, number, number, number], texture: texKey },
        up: { uv: [6, 8.5, 7.5, 8] as [number, number, number, number], rotation: rotateUp as 0 | 90 | 180 | 270, texture: texKey },
        down: { uv: [6, 14, 7.5, 14.5] as [number, number, number, number], rotation: rotateDown as 0 | 90 | 180 | 270, texture: texKey }
      }
    }) as RawModelElement;
    const segments: [number, number][] = [
      [2, 5],
      [5, 8],
      [8, 11],
      [11, 14]
    ];
    for (const [z0, z1] of segments) {
      modelJson.elements.push(makeFlap([0.5, -2.5, z0], [1.5, 10.5, z1], 270, 90));
    }
    for (const [z0, z1] of segments.reverse()) {
      modelJson.elements.push(makeFlap([14.5, -2.5, z0], [15.5, 10.5, z1], 90, 270));
    }
  }

  private patchMechanicalRoller (model: RawBlockModel, cleanPath: string) {
    if ((!cleanPath.includes('mechanical_roller') && !cleanPath.includes('crushing_wheel')) || !cleanPath.includes('wheel')) {
      return;
    }
    // Only target the specific mechanical roller wheel which is missing/offset
    if (!cleanPath.includes('mechanical_roller')) {
      return;
    }

    if (!model.elements) {
      return;
    }

    // needs refinement, disabled for now
    /*  for (const part of model.elements) {
      if ('mesh' in part && part.mesh && part.mesh.quads) {
        const visited = new Set<unknown>();
        for (const quad of part.mesh.quads) {
          const processVertex = (vert: { pos: { x: number; y: number; z: number }; normal?: { x: number; y: number; z: number } }) => {
            if (!vert || !vert.pos || visited.has(vert)) {
              return;
            }
            visited.add(vert);
            const p = vert.pos;
            const oldX = p.x;
            const oldZ = p.z;
            p.x = oldZ;
            p.z = 16 - oldX;
            // Shift it down by one block and slightly forward
            p.y -= 16;
            p.z += 2;
            if (vert.normal) {
              const n = vert.normal;
              const nx = n.x;
              n.x = n.z;
              n.z = -nx;
            }
          };
          processVertex(quad.v1);
          processVertex(quad.v2);
          processVertex(quad.v3);
          processVertex(quad.v4);
        }
      }
    } */
  }

  private translateElements (elements: RawModelElement[], dx: number, dy: number, dz: number) {
    for (const el of elements) {
      if (el.from) {
        el.from = [el.from[0] + dx, el.from[1] + dy, el.from[2] + dz];
      }
      if (el.to) {
        el.to = [el.to[0] + dx, el.to[1] + dy, el.to[2] + dz];
      }
      if (el.rotation?.origin) {
        el.rotation.origin = [el.rotation.origin[0] + dx, el.rotation.origin[1] + dy, el.rotation.origin[2] + dz];
      }
      if (Array.isArray(el.children)) {
        this.translateElements(el.children as RawModelElement[], dx, dy, dz);
      }
    }
    return elements;
  }

  private splitMechanicalArmElements (itemModel: RawBlockModel) {
    const elements = Array.isArray(itemModel?.elements) ? itemModel.elements : [];
    const isCog = (el: RawModelElement | ObjMeshPart): el is RawModelElement => 'from' in el && (el.name ?? '').toLowerCase().includes('gear');
    const isBody = (el: RawModelElement | ObjMeshPart): el is RawModelElement => 'from' in el && !isCog(el);
    const clone = (el: RawModelElement) => JSON.parse(JSON.stringify(el)) as RawModelElement;
    const cogElements = elements.filter(isCog).map(clone);
    const bodyElements = elements.filter(isBody).map(clone);
    return { bodyElements, cogElements, textures: (itemModel?.textures ?? {}) as Record<string, string> };
  }

  private async injectMechanicalCrafterGears (def: RawBlockState & { _gearsInjected?: boolean }) {
    if (def._gearsInjected) {
      return;
    }
    await this.loadModelRecursive('create:block/mechanical_crafter/item');
    const itemModel = this.fetchedBlockModels.get('create:block/mechanical_crafter/item');
    if (!itemModel?.elements) {
      return;
    }
    const gears = (itemModel.elements as (RawModelElement | ObjMeshPart)[]).filter((el): el is RawModelElement => 'from' in el && (el.name ?? '').toLowerCase().includes('gear'));
    if (!gears.length) {
      return;
    }

    // Build horizontal and vertical gear models
    const horizontalId = 'create:block/mechanical_crafter/gears_horizontal';
    const verticalId = 'create:block/mechanical_crafter/gears_vertical';
    const horizModel: RawBlockModel = { parent: 'block/block', elements: gears, textures: { ...(itemModel.textures ?? {}) } };
    const vertModel: RawBlockModel = { parent: 'block/block', elements: this.rotateElementsX90(gears), textures: { ...(itemModel.textures ?? {}) } };
    this.fetchedBlockModels.set(horizontalId, horizModel);
    this.fetchedBlockModels.set(verticalId, vertModel);

    const ensureMultipart = () => {
      if (!def.multipart) {
        def.multipart = [];
      }
      if (def.variants) {
        for (const [key, variant] of Object.entries(def.variants)) {
          const when: Record<string, string> = {};
          key.split(',').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) {
              when[k] = v;
            }
          });
          const entries = Array.isArray(variant) ? variant : [variant];
          for (const entry of entries) {
            def.multipart.push({ apply: entry, when: Object.keys(when).length ? when : undefined });
          }
        }
        delete def.variants;
      }
    };

    ensureMultipart();

    const pickGearModel = () => {
      return horizontalId;
    };

    const baseParts = [...def.multipart!]; // snapshot to avoid iterating over appended parts
    for (const part of baseParts) {
      if (!part.apply) {
        continue;
      }
      const gearModel = pickGearModel();
      const apply = Array.isArray(part.apply) ? part.apply[0] : part.apply;
      const facing = (part.when && 'facing' in part.when) ? part.when.facing : undefined;
      let extraX = 0;
      const extraY = 0;
      if (facing === 'down') {
        extraX = 180;
      } else if (facing === 'up') {
        extraX = 0;
      } else {
        extraX = 90;
      }
      const rotX = ((apply?.x ?? 0) + extraX) % 360;
      const rotY = ((apply?.y ?? 0) + extraY) % 360;
      def.multipart!.push({ apply: { model: gearModel, x: rotX, y: rotY, uvlock: apply?.uvlock }, when: part.when });
    }
    def._gearsInjected = true;
  }

  private async injectMechanicalArmCog (def: RawBlockState & { _armCogInjected?: boolean }) {
    if (def._armCogInjected) {
      return;
    }
    await this.loadModelRecursive('create:block/mechanical_arm/item');
    const itemModel = this.fetchedBlockModels.get('create:block/mechanical_arm/item');
    if (!itemModel) {
      return;
    }
    const { cogElements, textures } = this.splitMechanicalArmElements(itemModel);
    if (!cogElements.length) {
      return;
    }

    const cogModelId = 'create:block/mechanical_arm/cog';
    if (!this.fetchedBlockModels.has(cogModelId)) {
      this.fetchedBlockModels.set(cogModelId, {
        parent: 'block/block',
        elements: this.translateElements(cogElements, 0, 16, 0),
        textures: { ...textures }
      });
    }

    const parseWhen = (key: string): Record<string, string> | undefined => {
      if (!key) {
        return undefined;
      }
      const when: Record<string, string> = {};
      for (const pair of key.split(',')) {
        if (!pair) {
          continue;
        }
        const [k, v] = pair.split('=');
        if (k && v) {
          when[k] = v;
        }
      }
      return Object.keys(when).length ? when : undefined;
    };

    const ensureMultipart = () => {
      if (!def.multipart) {
        def.multipart = [];
      }
      if (def.variants) {
        for (const [key, variant] of Object.entries(def.variants)) {
          const when = parseWhen(key);
          const entries = Array.isArray(variant) ? variant : [variant];
          for (const entry of entries) {
            def.multipart.push({ apply: entry, when });
          }
        }
        delete def.variants;
      }
    };

    ensureMultipart();

    const baseParts = [...(def.multipart as RawMultipartCase[])];
    for (const part of baseParts) {
      if (!part.apply) {
        continue;
      }
      const applies = Array.isArray(part.apply) ? part.apply : [part.apply];
      for (const apply of applies) {
        const rotX = (apply?.x ?? 0) % 360;
        const rotY = (apply?.y ?? 0) % 360;
        def.multipart!.push({ apply: { model: cogModelId, x: rotX, y: rotY, uvlock: apply?.uvlock }, when: part.when });
      }
    }

    def._armCogInjected = true;
  }

  private buildFunnelFallback (modelId: string): RawBlockModel | null {
    if (!modelId.startsWith('create:block/')) {
      return null;
    }
    const name = modelId.substring('create:block/'.length);
    if (!name.includes('funnel')) {
      return null;
    }

    const textures = {
      back: 'create:block/funnel/funnel_open',
      base: 'create:block/funnel/funnel_open',
      direction: name.includes('push') ? 'create:block/funnel/funnel_closed' : 'create:block/funnel/funnel_open',
      redstone: 'create:block/funnel/funnel_closed',
      particle: 'create:block/brass_block',
      block: 'create:block/brass_block'
    };

    if (name.includes('belt_funnel')) {
      let parent = 'create:block/belt_funnel/block_retracted';
      if (name.includes('extended')) {
        parent = 'create:block/belt_funnel/block_extended';
      } else if (name.includes('pulling')) {
        parent = 'create:block/belt_funnel/block_pulling';
      } else if (name.includes('pushing')) {
        parent = 'create:block/belt_funnel/block_pushing';
      }
      return { parent, textures };
    }

    let parent = 'create:block/funnel/block_horizontal';
    if (name.includes('vertical')) {
      parent = name.includes('filterless') ? 'create:block/funnel/block_vertical_filterless' : 'create:block/funnel/block_vertical';
    }

    return { parent, textures };
  }

  private async loadTexture (texturePath: string) {
    const cleanPath = this.normalizePath(texturePath);
    // cleanPath e.g. "create:block/axis"

    if (!cleanPath.startsWith('create:')) {
      return;
    }

    if (this.fetchedTextures.has(cleanPath)) {
      return;
    }

    const relativePath = cleanPath.replace('create:', '');

    try {
      const blob = await this.fetchBlob(`textures/${relativePath}.png`);
      if (blob) {
        this.fetchedTextures.set(cleanPath, blob);
        await this.loadFlowTextureForFluid(cleanPath);
      } else {
        this.missingResources.add(`Texture: ${cleanPath}`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private async loadFlowTextureForFluid (stillPath: string) {
    if (!stillPath.includes('/fluid/') || !stillPath.includes('_still')) {
      return;
    }
    const flowPath = stillPath.replace('_still', '_flow');
    if (this.fetchedTextures.has(flowPath)) {
      return;
    }
    await this.loadTexture(flowPath);
  }

  private extractModelsFromDefinition (def: RawBlockState): string[] {
    const models = new Set<string>();
    if (def.variants) {
      for (const key in def.variants) {
        const variant = def.variants[key];
        if (!variant) {
          continue;
        }
        if (Array.isArray(variant)) {
          variant.forEach(v => {
            if (v.model) {
              models.add(v.model);
            }
          });
        } else if (variant.model) {
          models.add(variant.model);
        }
      }
    }
    if (def.multipart) {
      def.multipart.forEach(part => {
        if (part.apply) {
          const apply = part.apply;
          if (Array.isArray(apply)) {
            apply.forEach(v => {
              if (v.model) {
                models.add(v.model);
              }
            });
          } else if (apply.model) {
            models.add(apply.model);
          }
        }
      });
    }
    return Array.from(models);
  }

  private normalizePath (path: string): string {
    if (!path.includes(':')) {
      return 'minecraft:' + path;
    }
    return path;
  }

  private async fetchJson<T = unknown> (path: string): Promise<T | null> {
    try {
      return await this.provider.getJson(path) as T;
    } catch (e) {
      console.error(`Provider error for ${path}`, e);
      return null;
    }
  }

  private async fetchText (path: string): Promise<string | null> {
    try {
      return await this.provider.getText(path);
    } catch (e) {
      console.error(`Provider error for ${path}`, e);
      return null;
    }
  }

  private async fetchBlob (path: string): Promise<Blob | null> {
    try {
      const buffer = await this.provider.getArrayBuffer(path);
      return new Blob([buffer]);
    } catch (e) {
      console.error(`Provider error for ${path}`, e);
      return null;
    }
  }
}
