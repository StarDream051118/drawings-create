import type { Instance } from '../../api/instance/instance';
import type { Instancer } from '../../api/instance/instancer';
import type { InstanceType } from '../../api/instance/instanceType';
import { GlBuffer } from '../gl/glBuffer';

export class InstancerImpl<D extends Instance> implements Instancer<D> {
  public _model?: unknown;
  public data: Float32Array;
  private readonly instances: D[] = [];
  private dirty: boolean = false;
  public readonly glBuffer: GlBuffer;
  private capacity: number = 64;
  private count: number = 0;

  constructor (
    private readonly type: InstanceType<D>,
    private readonly gl: WebGLRenderingContext
  ) {
    this.data = new Float32Array(this.capacity * this.type.format());
    this.glBuffer = new GlBuffer(gl);
  }

  createInstance (): D {
    this.ensureCapacity();
    const instance = this.type.create(this, this.count);
    this.instances.push(instance);
    this.count++;
    this.notifyDirty();
    return instance;
  }

  notifyDirty (): void {
    this.dirty = true;
  }

  private ensureCapacity () {
    if (this.count >= this.capacity) {
      const newCapacity = this.capacity * 2;
      const newData = new Float32Array(newCapacity * this.type.format());
      newData.set(this.data);
      this.data = newData;
      this.capacity = newCapacity;
    }
  }

  // Called by instances to drop themselves from the batch
  deleteInstance (instance: D) {
    const idx = this.instances.indexOf(instance);
    if (idx === -1) {
      return;
    }
    this.instances.splice(idx, 1);
    this.count = this.instances.length;
    this.notifyDirty();
  }

  public update () {
    if (this.dirty) {
      const stride = this.type.format();
      for (let i = 0; i < this.count; i++) {
        if (!this.instances[i]) {
          console.warn(`InstancerImpl: Missing instance at index ${i}, skipping update.`);
          continue;
        }
        this.instances[i]!.write(this.data, i * stride);
      }
      this.glBuffer.bind(this.gl.ARRAY_BUFFER);
      // Optimization: Use subData if we didn't resize? For now data is fine.
      this.glBuffer.data(this.gl.ARRAY_BUFFER, this.data as BufferSource, this.gl.DYNAMIC_DRAW);
      this.dirty = false;
    }
  }

  public get instanceCount () {
    return this.count;
  }
}
