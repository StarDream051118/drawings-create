import { Instance } from '../instance/instance';
import { Instancer } from '../instance/instancer';
import { InstanceType } from '../instance/instanceType';

export interface InstancerProvider {
  instancer<D extends Instance>(type: InstanceType<D>, model: unknown): Instancer<D>;
}

export interface VisualizationContext {
  instancerProvider(): InstancerProvider;
  partialTick(): number;
}
