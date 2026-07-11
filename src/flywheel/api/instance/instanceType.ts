import { Instance } from './instance';
import { Instancer } from './instancer';

export interface InstanceType<D extends Instance> {
  create(instancer: Instancer<D>, index: number): D;
  // Size in floats
  format(): number;
}
