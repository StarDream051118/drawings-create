import { mat4 } from 'gl-matrix';
import type { ViewerState } from '../api/viewer';

export interface CameraTarget {
  yaw: number
  pitch: number
  distance: number
  center: [number, number, number]
}

export class CameraController {
  private easingFrame = 0;
  readonly target: CameraTarget = { yaw: 0, pitch: 0, distance: 48, center: [8, 8, 8] };

  constructor (
    private readonly state: ViewerState,
    private readonly canvas: HTMLCanvasElement,
    private readonly onRenderRequest: () => void
  ) {}

  buildView (): mat4 {
    const view = mat4.create();
    mat4.translate(view, view, [0, 0, -this.state.distance]);
    mat4.rotateX(view, view, this.state.pitch);
    mat4.rotateY(view, view, this.state.yaw);
    mat4.translate(view, view, [-this.state.center[0], -this.state.center[1], -this.state.center[2]]);
    return view;
  }

  resetCamera (size: [number, number, number]) {
    this.target.center = [size[0] / 2, size[1] / 2, size[2] / 2];
    this.target.distance = Math.max(12, Math.max(...size) * 1.5);
    this.target.yaw = 0.45;
    this.target.pitch = 0.45;
    this.state.yaw = 0;
    this.state.pitch = 0;
    this.state.center = [...this.target.center];
    this.state.distance = this.target.distance;
    this.requestEasing();
  }

  requestEasing () {
    if (this.easingFrame) return;
    const tick = () => {
      const rate = 0.08;
      const s = this.state;
      const t = this.target;
      const dy = t.yaw - s.yaw;
      const dp = t.pitch - s.pitch;
      const dd = t.distance - s.distance;
      const dc0 = t.center[0] - s.center[0];
      const dc1 = t.center[1] - s.center[1];
      const dc2 = t.center[2] - s.center[2];

      const done = Math.abs(dy) < 0.0005 && Math.abs(dp) < 0.0005 &&
                   Math.abs(dd) < 0.01 && Math.abs(dc0) < 0.005 &&
                   Math.abs(dc1) < 0.005 && Math.abs(dc2) < 0.005;
      if (done) {
        s.yaw = t.yaw;
        s.pitch = t.pitch;
        s.distance = t.distance;
        s.center = [...t.center];
        this.easingFrame = 0;
        this.onRenderRequest();
        return;
      }
      s.yaw += dy * rate;
      s.pitch += dp * rate;
      s.distance += dd * rate;
      s.center[0] += dc0 * rate;
      s.center[1] += dc1 * rate;
      s.center[2] += dc2 * rate;
      this.onRenderRequest();
      this.easingFrame = requestAnimationFrame(tick);
    };
    this.easingFrame = requestAnimationFrame(tick);
  }

  attachControls (enableResize: boolean, enableMouseControls: boolean) {
    if (enableResize) {
      // Initial DPR resize
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = this.canvas;
      this.canvas.width = clientWidth * dpr;
      this.canvas.height = clientHeight * dpr;

      window.addEventListener('resize', () => {
        const dpr = window.devicePixelRatio || 1;
        const { clientWidth, clientHeight } = this.canvas;
        this.canvas.width = clientWidth * dpr;
        this.canvas.height = clientHeight * dpr;
        this.state.renderer?.setViewport(0, 0, this.canvas.width, this.canvas.height);
        this.onRenderRequest();
      });
    }

    if (enableMouseControls) {
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const pointers = new Map<number, { x: number; y: number }>();
      let lastPinchDist = 0;

      const getPinchDist = () => {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return 0;
        const dx = pts[0]!.x - pts[1]!.x;
        const dy = pts[0]!.y - pts[1]!.y;
        return Math.sqrt(dx * dx + dy * dy);
      };

      this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      this.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

      this.canvas.addEventListener('pointerdown', e => {
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
        this.canvas.setPointerCapture(e.pointerId);
      });

      this.canvas.addEventListener('pointerup', e => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) lastPinchDist = 0;
        if (pointers.size === 0) dragging = false;
        this.canvas.releasePointerCapture(e.pointerId);
      });

      this.canvas.addEventListener('pointermove', e => {
        const pt = pointers.get(e.pointerId);
        if (!pt) return;
        pt.x = e.clientX;
        pt.y = e.clientY;

        if (pointers.size === 2) {
          const dist = getPinchDist();
          if (lastPinchDist > 0) {
            this.target.distance = Math.max(6, this.target.distance * (lastPinchDist / dist));
            this.requestEasing();
          }
          lastPinchDist = dist;
          return;
        }

        if (!dragging || pointers.size !== 1) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        this.target.yaw += dx * 0.005;
        this.target.pitch = Math.max(-1.4, Math.min(1.4, this.target.pitch + (dy * 0.005)));
        lastX = e.clientX;
        lastY = e.clientY;
        this.requestEasing();
      });

      this.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        this.target.distance = Math.max(2, this.target.distance * (1 + (e.deltaY * 0.001)));
        this.requestEasing();
      }, { passive: false });
    }
  }
}
