import { glMatrix, mat4 } from 'gl-matrix';
import { Flywheel } from '../flywheel/flywheel';
import { RotatingVisual } from '../flywheel/lib/visual/rotatingVisual';
import { StaticVisual } from '../flywheel/lib/visual/staticVisual';
import type { Structure } from 'deepslate';
import type { BlockPos } from 'deepslate/core';
import { StructureRenderer } from 'deepslate/render';
import { loadResourcesForStructure, type ResourceBundle } from './resources';
import { loadStructureFromNbt } from './nbt';
import type { Mesh } from 'deepslate/render';
import type { Vertex } from 'deepslate/render';
import { buildRenderPlan, type PlanBuilder } from './renderPlan.js';
import { LimestoneObserver } from './events.js';
import { ResourceProvider, FetchResourceProvider } from '../loader/resourceProvider.js';

export type Vec3 = [number, number, number];

export type ViewerState = {
  renderer: StructureRenderer | null;
  flywheel: Flywheel | null;
  visuals: (RotatingVisual | StaticVisual)[];
  structure: Structure | null;
  center: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  pendingFrame: number;
};

export function uploadMeshBuffers (gl: WebGLRenderingContext, mesh: Mesh) {
  const needsQuads = mesh.quadVertices() > 0 && (!mesh.posBuffer || !mesh.normalBuffer || !mesh.textureBuffer || !mesh.indexBuffer || !mesh.colorBuffer);
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
  observer?: LimestoneObserver;
};

export function createStructureViewer (options: ViewerOptions) {
  const { canvas } = options;
  const gl = canvas.getContext('webgl');
  if (!gl) {
    throw new Error('WebGL not supported');
  }

  const observer = options.observer ?? new LimestoneObserver();
  const planBuilder = options.renderPlanBuilder ?? buildRenderPlan;

  const state: ViewerState = {
    renderer: null,
    flywheel: null,
    visuals: [],
    structure: null,
    center: [8, 8, 8],
    distance: 48,
    yaw: -Math.PI / 4,
    pitch: -Math.PI / 6,
    pendingFrame: 0
  };

  const setStatus = (msg: string) => {
    observer.emit({ type: 'loading-progress', message: msg });
  };

  const buildView = () => {
    const view = mat4.create();
    mat4.translate(view, view, [0, 0, -state.distance]);
    mat4.rotateX(view, view, state.pitch);
    mat4.rotateY(view, view, state.yaw);
    mat4.translate(view, view, [-state.center[0], -state.center[1], -state.center[2]]);
    return view;
  };

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

    for (const v of state.visuals) {
      v.update(1);
      v.beginFrame({ instancerProvider: () => state.flywheel!, partialTick: () => 0 });
    }

    state.renderer.drawGrid(view);
    state.renderer.drawStructure(view);
    state.flywheel.render(view, proj);
  };

  const requestRender = () => {
    if (state.pendingFrame) {
      return;
    }
    state.pendingFrame = requestAnimationFrame(renderScene);
  };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    state.renderer?.setViewport(0, 0, canvas.width, canvas.height);
    requestRender();
  };

  const resetCamera = (structure: Structure) => {
    const size = structure.getSize();
    state.center = [size[0] / 2, size[1] / 2, size[2] / 2];
    state.distance = Math.max(12, Math.max(...size) * 1.5);
  };

  if (options.enableResize ?? true) {
    window.addEventListener('resize', resize);
  }

  if (options.enableMouseControls ?? true) {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', e => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointerup', e => {
      dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      if (!dragging) {
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      state.yaw += dx * 0.005;
      state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + (dy * 0.005)));
      lastX = e.clientX;
      lastY = e.clientY;
      requestRender();
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      state.distance = Math.max(6, state.distance * (1 + (e.deltaY * 0.001)));
      requestRender();
    }, { passive: false });
  }

  const loadStructure = async (input: File | ArrayBuffer) => {
    const isFile = input instanceof File;
    const name = isFile ? input.name : 'structure.nbt';
    setStatus(`Loading ${name}...`);
    try {
      const nbt = isFile ? await input.arrayBuffer() : input;
      const structure = await loadStructureFromNbt(nbt);
      setStatus('Fetching assets...');

      const vanillaProvider = typeof options.vanillaAssetsBase === 'string'
        ? new FetchResourceProvider(options.vanillaAssetsBase)
        : options.vanillaAssetsBase ?? new FetchResourceProvider('./assets/minecraft/1.20.1/');

      const assetsProvider = typeof options.createAssetsBase === 'string'
        ? new FetchResourceProvider(options.createAssetsBase)
        : options.createAssetsBase ?? new FetchResourceProvider('./assets/create/0.5.1.j/');

      const resourcesBundle: ResourceBundle = await loadResourcesForStructure(structure, {
        createAssetsBase: assetsProvider.getBasePath(),
        vanillaAssetsBase: vanillaProvider.getBasePath()
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
        state.flywheel.setTexture(atlasTexture);
      }

      state.visuals = [];
      for (const block of renderPlan.blocks) {
        for (const part of block.parts) {
          if (part.motion && part.motion.kind === 'spin') {
            state.visuals.push(new RotatingVisual({ instancerProvider: () => state.flywheel!, partialTick: () => 0 }, block.pos, part.mesh, part.motion.axis, part.motion.speed));
          } else {
            state.visuals.push(new StaticVisual({ instancerProvider: () => state.flywheel!, partialTick: () => 0 }, block.pos, part.mesh));
          }
        }
      }

      state.structure = structure;
      resetCamera(structure);
      setStatus(`Loaded ${name}`);
      resize();
      observer.emit({ type: 'structure-loaded' });
    } catch (err) {
      console.error(err);
      setStatus('Failed to load structure');
      observer.emit({ type: 'fatal-error', message: 'Failed to load structure', error: err });
    }
  };

  resize();
  requestRender();

  return {
    state,
    observer,
    loadStructure,
    requestRender,
    setStatus,
    dispose: () => {
      state.visuals = [];
      state.renderer = null;
      state.flywheel = null;
    }
  };
}
