import type { InstanceType } from '../../api/instance/instanceType';
import type { Instancer } from '../../api/instance/instancer';
import { TransformedInstance } from './transformedInstance';

export class ScrollTransformedInstance extends TransformedInstance {
  public scrollU: number = 0;
  public scrollV: number = 0;

  constructor (instancer: Instancer<ScrollTransformedInstance>) {
    super(instancer);
  }

  write (buffer: Float32Array, offset: number): void {
    super.write(buffer, offset);
    buffer[offset + 16] = this.scrollU;
    buffer[offset + 17] = this.scrollV;
  }

  static type: InstanceType<ScrollTransformedInstance> = {
    create: instancer => new ScrollTransformedInstance(instancer),
    format: () => 18
  };
}
