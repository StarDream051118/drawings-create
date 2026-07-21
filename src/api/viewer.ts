import { glMatrix, mat4 } from 'gl-matrix';
import { Flywheel } from '../flywheel/flywheel';
import { RotatingVisual } from '../flywheel/lib/visual/rotatingVisual';
import { StaticVisual } from '../flywheel/lib/visual/staticVisual';
import { BeltScrollingVisual } from '../flywheel/lib/visual/beltScrollingVisual';
import type { Structure } from 'deepslate';
import type { BlockPos } from 'deepslate/core';
import { StructureRenderer } from 'deepslate/render';
import { loadResourcesForStructure, type ResourceBundle, type AddonProvider } from './resources';
import { loadStructureFromNbt } from './nbt';
import type { Mesh } from 'deepslate/render';
import type { Vertex } from 'deepslate/render';
import { buildRenderPlan, type PlanBuilder } from './renderPlan.js';
import { LimestoneObserver } from './events.js';
import { ResourceProvider, FetchResourceProvider } from '../loader/resourceProvider.js';
import { CameraController } from '../viewer/camera';
import { drawCompass } from '../viewer/compass';
import { loadBeltTextures } from '../viewer/textureLoader';

/** Minecraft ticks per second = 50，每 tick 对应的秒数 */
const SECONDS_PER_TICK = 1 / 50;

export type { AddonProvider };
export type Vec3 = [number, number, number];

export type ViewerState = {
  renderer: StructureRenderer | null;
  flywheel: Flywheel | null;
  visuals: (RotatingVisual | StaticVisual | BeltScrollingVisual)[];
  structure: Structure | null;
  center: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  pendingFrame: number;
  showGrid: boolean;
  animateKinetics: boolean;
  kineticRPM: number;
  lastFrameTime: number | null;
  hoveredBlock: { blockId: string; pos: [number, number, number]; properties: Record<string, string> } | null;
};

export function uploadMeshBuffers (gl: WebGLRenderingContext, mesh: Mesh) {
  const needsQuads = mesh.quadVertices() > 0 && (!mesh.posBuffer || !mesh.normalBuffer || !mesh.textureBuffer || !mesh.indexBuffer || !mesh.colorBuffer || !mesh.textureLimitBuffer);
  const needsLines = mesh.lineVertices() > 0 && (!mesh.linePosBuffer || !mesh.lineColorBuffer);
  if (!needsQuads && !needsLines) {
    return;
  }

  const bindAndData = (data: number[], target: number) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(target, buf);
    gl.bufferData(target, target === gl.ELEMENT_ARRAY_BUFFER ? new Uint16Array(data) : new Float32Array(data), gl.STATIC_DRAW);
    return buf;
  };

  if (needsQuads) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const texLimits: number[] = [];
    const indices: number[] = [];
    let index = 0;

    for (const quad of mesh.quads) {
      const v1 = quad.v1.pos;
      const v2 = quad.v2.pos;
      const v3 = quad.v3.pos;

      const d1 = v2.sub(v1);
      const d2 = v3.sub(v1);

      const cx = (d1.y * d2.z) - (d1.z * d2.y);
      const cy = (d1.z * d2.x) - (d1.x * d2.z);
      const cz = (d1.x * d2.y) - (d1.y * d2.x);

      const len = Math.sqrt((cx * cx) + (cy * cy) + (cz * cz)) || 1;
      const nx = cx / len;
      const ny = cy / len;
      const nz = cz / len;

      const pushVert = (v: Vertex) => {
        vertices.push(v.pos.x, v.pos.y, v.pos.z);
        normals.push(nx, ny, nz);
        uvs.push(v.texture ? v.texture[0] : 0, v.texture ? v.texture[1] : 0);
        const col = v.color ?? [1, 1, 1];
        colors.push(col[0], col[1], col[2]);
        if (v.textureLimit) {
          texLimits.push(v.textureLimit[0], v.textureLimit[1], v.textureLimit[2], v.textureLimit[3]);
        } else {
          texLimits.push(0, 0, 1, 1);
        }
      };

      pushVert(quad.v1);
      pushVert(quad.v2);
      pushVert(quad.v3);
      pushVert(quad.v4);

      indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
      index += 4;
    }

    mesh.posBuffer = bindAndData(vertices, gl.ARRAY_BUFFER);
    mesh.normalBuffer = bindAndData(normals, gl.ARRAY_BUFFER);
    mesh.textureBuffer = bindAndData(uvs, gl.ARRAY_BUFFER);
    mesh.colorBuffer = bindAndData(colors, gl.ARRAY_BUFFER);
    mesh.indexBuffer = bindAndData(indices, gl.ELEMENT_ARRAY_BUFFER);
    mesh.textureLimitBuffer = bindAndData(texLimits, gl.ARRAY_BUFFER);
  }

  if (needsLines) {
    mesh.linePosBuffer = bindAndData(mesh.lines.flatMap(l => [
      l.v1.pos.x, l.v1.pos.y, l.v1.pos.z,
      l.v2.pos.x, l.v2.pos.y, l.v2.pos.z
    ]), gl.ARRAY_BUFFER);
    mesh.lineColorBuffer = bindAndData(mesh.lines.flatMap(l => [
      ...(l.v1.color ?? [1, 0, 0]),
      ...(l.v2.color ?? [1, 0, 0])
    ]), gl.ARRAY_BUFFER);
  }
}

export type ViewerOptions = {
  canvas: HTMLCanvasElement;
  renderPlanBuilder?: PlanBuilder;
  enableResize?: boolean;
  enableMouseControls?: boolean;
  createAssetsBase?: string | ResourceProvider;
  vanillaAssetsBase?: string | ResourceProvider;
  addons?: AddonProvider[];
  observer?: LimestoneObserver;
};

export function createStructureViewer (options: ViewerOptions) {
  const { canvas } = options;
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('WebGL 2 not supported');
  }
  console.log('[viewer] WebGL 2 context created');

  const observer = options.observer ?? new LimestoneObserver();
  const planBuilder = options.renderPlanBuilder ?? buildRenderPlan;

  const state: ViewerState = {
    renderer: null,
    flywheel: null,
    visuals: [],
    structure: null,
    center: [8, 8, 8],
    distance: 48,
    yaw: 0,
    pitch: 0,
    pendingFrame: 0,
    showGrid: true,
    animateKinetics: true,
    kineticRPM: 16,
    lastFrameTime: null,
    hoveredBlock: null
  };

  const setStatus = (msg: string) => {
    observer.emit({ type: 'loading-progress', message: msg });
  };

  const camera = new CameraController(state, canvas, requestRender);

  // ─── 悬浮 Tooltip ───────────────────────────────────────────
  const tooltipEl = document.createElement('div');
  tooltipEl.style.cssText = 'display:none;position:fixed;background:rgba(0,0,0,0.85);color:#eee;padding:6px 10px;border-radius:4px;font:13px/1.4 monospace;pointer-events:none;z-index:9999;max-width:400px;white-space:pre-wrap;';
  document.body.appendChild(tooltipEl);

  const buildView = () => camera.buildView();

  const raycast = (mouseX: number, mouseY: number) => {
    if (!state.structure) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nx = ((mouseX - rect.left) * dpr / canvas.width) * 2 - 1;
    const ny = -(((mouseY - rect.top) * dpr / canvas.height) * 2 - 1);

    const view = buildView();
    const proj = mat4.create();
    const aspect = (canvas.width || 1) / (canvas.height || 1);
    mat4.perspective(proj, glMatrix.toRadian(70), aspect, 0.1, 500);

    const invVP = mat4.create();
    mat4.multiply(invVP, proj, view);
    mat4.invert(invVP, invVP);

    const near4 = [nx, ny, -1, 1] as number[];
    const far4 = [nx, ny, 1, 1] as number[];
    const pNear = [0, 0, 0, 0] as number[];
    const pFar = [0, 0, 0, 0] as number[];
    const invVPArr = Array.from(invVP) as number[];
    vec4MulMat4(pNear, near4, invVPArr);
    vec4MulMat4(pFar, far4, invVPArr);
    const wNear = pNear[3]! || 1;
    const wFar = pFar[3]! || 1;
    const rayOrigin0 = pNear[0]! / wNear;
    const rayOrigin1 = pNear[1]! / wNear;
    const rayOrigin2 = pNear[2]! / wNear;
    const rayOrigin: number[] = [rayOrigin0, rayOrigin1, rayOrigin2];
    const dirX = pFar[0]! / wFar - rayOrigin0;
    const dirY = pFar[1]! / wFar - rayOrigin1;
    const dirZ = pFar[2]! / wFar - rayOrigin2;
    const rayLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
    const rayDir: number[] = [dirX / rayLen, dirY / rayLen, dirZ / rayLen];

    let closest: { blockId: string; pos: [number, number, number]; properties: Record<string, string> } | null = null;
    let minT = Infinity;

    for (const block of state.structure.getBlocks()) {
      const bx = block.pos[0]!, by = block.pos[1]!, bz = block.pos[2]!;
      const t = rayAABB(rayOrigin, rayDir, bx, by, bz, bx + 1, by + 1, bz + 1);
      if (t !== null && t < minT && t > 0) {
        minT = t;
        const props = block.state.getProperties() as Record<string, string>;
        closest = { blockId: block.state.getName().toString(), pos: [bx, by, bz], properties: props };
      }
    }
    return closest;
  };

  const rayAABB = (origin: number[], dir: number[], minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number | null => {
    let tmin = -Infinity;
    let tmax = Infinity;
    const mins = [minX, minY, minZ];
    const maxs = [maxX, maxY, maxZ];
    for (let i = 0; i < 3; i++) {
      const o = origin[i]!;
      const d = dir[i]!;
      const bmin = mins[i]!;
      const bmax = maxs[i]!;
      if (d === 0) {
        if (o < bmin || o > bmax) return null;
      } else {
        const invD = 1 / d;
        const t1 = (bmin - o) * invD;
        const t2 = (bmax - o) * invD;
        const tNear = t1 < t2 ? t1 : t2;
        const tFar = t1 < t2 ? t2 : t1;
        if (tNear > tmin) tmin = tNear;
        if (tFar < tmax) tmax = tFar;
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  };

  const vec4MulMat4 = (out: number[], v: number[], m: number[]) => {
    for (let i = 0; i < 4; i++) {
      out[i] = m[i]! * v[0]! + m[4 + i]! * v[1]! + m[8 + i]! * v[2]! + m[12 + i]! * v[3]!;
    }
  };

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!state.structure) return;
    const hit = raycast(e.clientX, e.clientY);
    state.hoveredBlock = hit;
    if (hit) {
      const propsStr = JSON.stringify(hit.properties);
      tooltipEl.textContent = `Block: ${hit.blockId} ${propsStr} [${hit.pos[0]},${hit.pos[1]},${hit.pos[2]}]`;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = (e.clientX + 14) + 'px';
      tooltipEl.style.top = (e.clientY + 14) + 'px';
    } else {
      tooltipEl.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltipEl.style.display = 'none';
    state.hoveredBlock = null;
  });
  // ──────────────────────────────────────────────────────────────

  const renderScene = () => {
    state.pendingFrame = 0;
    gl.clearColor(0.1, 0.11, 0.13, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!state.renderer || !state.flywheel) {
      return;
    }

    const view = buildView();
    const proj = mat4.create();
    const aspect = (canvas.width || 1) / (canvas.height || 1);
    mat4.perspective(proj, glMatrix.toRadian(70), aspect, 0.1, 500);

    // Compute frame delta for kinetic animations
    let delta = 0;
    if (state.animateKinetics) {
      const now = performance.now();
      delta = state.lastFrameTime ? (now - state.lastFrameTime) / 1000 : 1 / 60;
      state.lastFrameTime = now;
    } else {
      state.lastFrameTime = null;
    }

    for (const v of state.visuals) {
      if (state.animateKinetics) {
        const radiansPerSecond = state.kineticRPM * 2 * Math.PI / 60;
        v.update(delta * radiansPerSecond / SECONDS_PER_TICK);
      }
      v.beginFrame({ instancerProvider: () => state.flywheel!, partialTick: () => 0 });
    }

    if (state.showGrid) state.renderer.drawGrid(view);
    state.renderer.drawStructure(view);
    state.flywheel.render(view, proj);
    drawCompass(state.yaw, state.pitch);

    if (state.animateKinetics) {
      requestRender();
    }
  };

  function requestRender () {
    if (state.pendingFrame) {
      return;
    }
    state.pendingFrame = requestAnimationFrame(renderScene);
  }

  const resetCamera = (structure: Structure) => {
    camera.resetCamera(structure.getSize());
  };

  // Attach camera controls (resize + mouse/touch)
  camera.attachControls(options.enableResize ?? true, options.enableMouseControls ?? true);

  const loadStructure = async (input: File | ArrayBuffer) => {
    const isFile = input instanceof File;
    const name = isFile ? input.name : 'structure.nbt';
    console.clear();
    setStatus(`加载 ${name}...`);
    try {
      const nbt = isFile ? await input.arrayBuffer() : input;
      const structure = await loadStructureFromNbt(nbt, name);
      setStatus('获取资源...');

      const vanillaProvider = typeof options.vanillaAssetsBase === 'string'
        ? new FetchResourceProvider(options.vanillaAssetsBase)
        : options.vanillaAssetsBase ?? new FetchResourceProvider('./assets/minecraft/1.20.1/');

      const assetsProvider = typeof options.createAssetsBase === 'string'
        ? new FetchResourceProvider(options.createAssetsBase)
        : options.createAssetsBase ?? new FetchResourceProvider('./assets/create/0.5.1.j/');

      const resourcesBundle: ResourceBundle = await loadResourcesForStructure(structure, {
        createAssetsBase: assetsProvider.getBasePath(),
        vanillaAssetsBase: vanillaProvider.getBasePath(),
        addons: options.addons
      });

      const renderPlan = planBuilder(structure.getBlocks(), resourcesBundle.resources, mesh => uploadMeshBuffers(gl, mesh));
      const filteredStructure = {
        getSize: () => structure.getSize(),
        getBlocks: () => structure.getBlocks().filter(b => !renderPlan.flywheelBlocks.has(b.state.getName().toString())),
        getBlock: (pos: BlockPos) => {
          const block = structure.getBlock(pos);
          if (!block || renderPlan.flywheelBlocks.has(block.state.getName().toString())) {
            return null;
          }
          return block;
        }
      } as Structure;

      state.renderer = new StructureRenderer(gl, filteredStructure, resourcesBundle.resources, { chunkSize: 8, useInvisibleBlockBuffer: false });
      state.renderer.updateStructureBuffers();

      state.flywheel = new Flywheel(gl);
      const atlasTexture = state.renderer.atlasTexture;
      if (atlasTexture && state.flywheel) {
        // 修复 deepslate 未设置 TEXTURE_MIN_FILTER 导致的模糊
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
        state.flywheel.setTexture(atlasTexture);
      }

      // Load belt textures
      await loadBeltTextures(
        gl,
        assetsProvider,
        id => resourcesBundle.resources.getTextureUV(id),
        state.flywheel.beltManager
      );

      state.visuals = [];
      for (const block of renderPlan.blocks) {
        for (const part of block.parts) {
          if (part.motion?.kind === 'scroll') {
            state.visuals.push(new BeltScrollingVisual({ instancerProvider: () => state.flywheel!, partialTick: () => 0 }, block.pos, part.mesh, part.motion.speed));
          } else if (part.motion?.kind === 'spin') {
            state.visuals.push(new RotatingVisual({ instancerProvider: () => state.flywheel!, partialTick: () => 0 }, block.pos, part.mesh, part.motion.axis, part.motion.speed));
          } else {
            state.visuals.push(new StaticVisual({ instancerProvider: () => state.flywheel!, partialTick: () => 0 }, block.pos, part.mesh));
          }
        }
      }

      state.structure = structure;
      resetCamera(structure);
      setStatus(`加载 ${name}`);
      requestRender();
      observer.emit({ type: 'structure-loaded' });
    } catch (err) {
      console.error(err);
      setStatus('加载结构失败');
      observer.emit({ type: 'fatal-error', message: '加载结构失败', error: err });
    }
  };

  requestRender();

  return {
    state,
    observer,
    loadStructure,
    requestRender,
    setStatus,
    setShowGrid: (show: boolean) => {
      state.showGrid = show;
      requestRender();
    },
    setAnimateKinetics: (animate: boolean) => {
      state.animateKinetics = animate;
      state.lastFrameTime = null;
      if (animate) requestRender();
    },
    setKineticRPM: (rpm: number) => {
      state.kineticRPM = rpm;
    },
    dispose: () => {
      state.visuals = [];
      state.renderer = null;
      state.flywheel = null;
    }
  };
}
