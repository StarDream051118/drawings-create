import { glMatrix, mat4 } from 'gl-matrix';
import { Identifier } from 'deepslate/core';
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
    yaw: 0,
    pitch: 0,
    pendingFrame: 0,
    showGrid: true,
    animateKinetics: true,
    kineticRPM: 16,
    lastFrameTime: null
  };

  // Easing targets — current values smoothly interpolate toward these
  const target = {
    yaw: 0,
    pitch: 0,
    distance: 48,
    center: [8, 8, 8] as Vec3
  };
  let easingFrame = 0;

  const setStatus = (msg: string) => {
    observer.emit({ type: 'loading-progress', message: msg });
  };

  const requestEasing = () => {
    if (easingFrame) return;
    const tick = () => {
      const rate = 0.08;
      const dy = target.yaw - state.yaw;
      const dp = target.pitch - state.pitch;
      const dd = target.distance - state.distance;
      const dc0 = target.center[0] - state.center[0];
      const dc1 = target.center[1] - state.center[1];
      const dc2 = target.center[2] - state.center[2];

      const done = Math.abs(dy) < 0.0005 && Math.abs(dp) < 0.0005 &&
                   Math.abs(dd) < 0.01 && Math.abs(dc0) < 0.005 &&
                   Math.abs(dc1) < 0.005 && Math.abs(dc2) < 0.005;
      if (done) {
        state.yaw = target.yaw;
        state.pitch = target.pitch;
        state.distance = target.distance;
        state.center = [...target.center];
        easingFrame = 0;
        requestRender();
        return;
      }
      state.yaw += dy * rate;
      state.pitch += dp * rate;
      state.distance += dd * rate;
      state.center[0] += dc0 * rate;
      state.center[1] += dc1 * rate;
      state.center[2] += dc2 * rate;
      requestRender();
      easingFrame = requestAnimationFrame(tick);
    };
    easingFrame = requestAnimationFrame(tick);
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
        v.update(delta * radiansPerSecond / 0.02);
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
    target.center = [size[0] / 2, size[1] / 2, size[2] / 2];
    target.distance = Math.max(12, Math.max(...size) * 1.5);
    target.yaw = 0.45;
    target.pitch = 0.45;
    // Snap to origin then ease to target
    state.yaw = 0;
    state.pitch = 0;
    state.center = [...target.center];
    state.distance = target.distance;
    requestEasing();
  };

  if (options.enableResize ?? true) {
    window.addEventListener('resize', resize);
  }

  if (options.enableMouseControls ?? true) {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    // Touch state for pinch-to-zoom
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;

    function getPinchDist (): number {
      const pts = Array.from(pointers.values());
      if (pts.length < 2) return 0;
      const a = pts[0]!;
      const b = pts[1]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

    canvas.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      if (pointers.size === 2) {
        dragging = false;
        lastPinchDist = getPinchDist();
      }
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointerup', e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) {
        lastPinchDist = 0;
      }
      if (pointers.size === 0) {
        dragging = false;
      }
      canvas.releasePointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      const pt = pointers.get(e.pointerId);
      if (!pt) return;
      pt.x = e.clientX;
      pt.y = e.clientY;

      // Pinch-to-zoom (two fingers)
      if (pointers.size === 2) {
        const dist = getPinchDist();
        if (lastPinchDist > 0) {
          const scale = lastPinchDist / dist;
          target.distance = Math.max(6, target.distance * scale);
          requestEasing();
        }
        lastPinchDist = dist;
        return;
      }

      // Single finger rotation
      if (!dragging || pointers.size !== 1) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      target.yaw += dx * 0.005;
      target.pitch = Math.max(-1.4, Math.min(1.4, target.pitch + (dy * 0.005)));
      lastX = e.clientX;
      lastY = e.clientY;
      requestEasing();
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      target.distance = Math.max(2, target.distance * (1 + (e.deltaY * 0.001)));
      requestEasing();
    }, { passive: false });
  }

  const loadStructure = async (input: File | ArrayBuffer) => {
    const isFile = input instanceof File;
    const name = isFile ? input.name : 'structure.nbt';
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
        state.flywheel.setTexture(atlasTexture);
      }

      try {
        console.log('[belt] loading belt.png ...');
        const beltImg = await assetsProvider.getTexture('textures/block/belt.png');
        console.log('[belt] belt.png loaded:', beltImg?.width, '×', beltImg?.height);
        const beltTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, beltTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, beltImg);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        state.flywheel.setBeltTexture(beltTex);
        const beltUv = resourcesBundle.resources.getTextureUV(Identifier.parse('create:block/belt'));
        console.log('[belt] atlas UV for create:block/belt:', beltUv);
        if (beltUv) {
          state.flywheel.setBeltTexLimit(beltUv[0], beltUv[1], beltUv[2], beltUv[3]);
        }
      } catch (e) {
        console.warn('[belt] belt texture not found', e);
      }

      try {
        console.log('[belt] loading belt_diagonal_scroll.png ...');
        const beltDiagonalImg = await assetsProvider.getTexture('textures/block/belt_diagonal_scroll.png');
        const w = beltDiagonalImg?.width ?? 0;
        const h = beltDiagonalImg?.height ?? 0;
        console.log('[belt] belt_diagonal_scroll.png loaded:', w, '×', h);
        const isPOT = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
        if (!isPOT) {
          console.warn(`[belt] NPOT texture (${w}×${h}): WebGL 1.0 不允许 REPEAT，自动降级为 CLAMP_TO_EDGE`);
        }
        const beltDiagonalTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, beltDiagonalTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, beltDiagonalImg);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        state.flywheel.setBeltDiagonalTexture(beltDiagonalTex);
        // 使用 create:block/belt_diagonal_scroll 在图集中的 UV 包围盒做归一化
        // 顶点 UV 在图集空间，归一化得到 [0,1] 后采样独立加载的 belt_diagonal_scroll.png，完全脱离 atlas
        const beltDiagonalUv = resourcesBundle.resources.getTextureUV(Identifier.parse('create:block/belt_diagonal_scroll'));
        console.log('[belt] atlas UV for create:block/belt_diagonal_scroll:', beltDiagonalUv);
        if (beltDiagonalUv) {
          state.flywheel.setBeltDiagonalTexLimitBase(beltDiagonalUv[0], beltDiagonalUv[1], beltDiagonalUv[2], beltDiagonalUv[3]);
          console.log('[belt] setBeltDiagonalUV(0, 0, 1, 1)');
          state.flywheel.setBeltDiagonalUV(0, 0, 1, 1.75);
        }
        console.log('[belt] diagonal belt texture setup done');
      } catch (e) {
        console.warn('[belt] belt diagonal scroll texture not found', e);
      }

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
      resize();
      observer.emit({ type: 'structure-loaded' });
    } catch (err) {
      console.error(err);
      setStatus('加载结构失败');
      observer.emit({ type: 'fatal-error', message: '加载结构失败', error: err });
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

function drawCompass (yaw: number, pitch: number) {
  const size = 90;
  const dpr = window.devicePixelRatio || 1;

  const compass = document.getElementById('compass-canvas') as HTMLCanvasElement | null;
  let ctx: CanvasRenderingContext2D | null = null;
  if (!compass) {
    const c = document.createElement('canvas');
    c.id = 'compass-canvas';
    c.style.cssText = 'position:fixed;bottom:16px;right:16px;pointer-events:none;z-index:50';
    document.body.appendChild(c);
    ctx = c.getContext('2d');
  } else {
    ctx = compass.getContext('2d');
  }
  if (!ctx) return;

  const el = compass || document.getElementById('compass-canvas')!;
  (el as HTMLCanvasElement).width = size * dpr;
  (el as HTMLCanvasElement).height = size * dpr;
  (el as HTMLCanvasElement).style.width = size + 'px';
  (el as HTMLCanvasElement).style.height = size + 'px';

  ctx.clearRect(0, 0, size * dpr, size * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);

  // Background circle
  ctx.beginPath();
  ctx.arc(0, 0, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Yaw needle (rotate to show which way is north)
  ctx.rotate(-yaw);

  const labels: [string, number, string][] = [
    ['N', 0, '#ff4444'],
    ['E', Math.PI / 2, '#aaa'],
    ['S', Math.PI, '#fff'],
    ['W', -Math.PI / 2, '#aaa'],
  ];

  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [label, angle, color] of labels) {
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -(size / 2 - 14));
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // Up / Down indicators (based on pitch)
  ctx.rotate(yaw); // reset rotation
  ctx.font = '10px sans-serif';
  ctx.fillStyle = pitch > 0.5 ? '#88ff88' : '#666';
  ctx.fillText('U', 0, -(size / 2 - 14) * 0.7);
  ctx.fillStyle = pitch < -0.5 ? '#ff8888' : '#666';
  ctx.fillText('D', 0, (size / 2 - 14) * 0.7);

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}
