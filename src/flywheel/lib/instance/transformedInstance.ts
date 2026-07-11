import { mat4, vec3 } from 'gl-matrix';
import { Instancer } from '../../api/instance/instancer';
import { InstanceType } from '../../api/instance/instanceType';
import { AbstractInstance } from './abstractInstance';

export class TransformedInstance extends AbstractInstance {
  public readonly transform: mat4;

  constructor (instancer: Instancer<TransformedInstance>) {
    super(instancer);
    this.transform = mat4.create();
  }

  translate (x: number, y: number, z: number): TransformedInstance {
    mat4.translate(this.transform, this.transform, [x, y, z]);
    this.setChanged();
    return this;
  }

  rotate (angle: number, axis: vec3): TransformedInstance {
    mat4.rotate(this.transform, this.transform, angle, axis);
    this.setChanged();
    return this;
  }

  scale (x: number, y: number, z: number): TransformedInstance {
    mat4.scale(this.transform, this.transform, [x, y, z]);
    this.setChanged();
    return this;
  }

  setIdentity (): TransformedInstance {
    mat4.identity(this.transform);
    this.setChanged();
    return this;
  }

  write (buffer: Float32Array, offset: number): void {
    buffer.set(this.transform, offset);
  }

  static type: InstanceType<TransformedInstance> = {
    create: instancer => new TransformedInstance(instancer),
    format: () => 16
  };
}
