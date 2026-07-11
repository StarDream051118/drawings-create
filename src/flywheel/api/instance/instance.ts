import { BlockPos } from 'deepslate/core';

export interface Instance {
  setPosition(pos: BlockPos): Instance;
  setChanged(): void;
  delete(): void;
  write(buffer: Float32Array, offset: number): void;
}

export interface InstanceHandle {
  setChanged(): void;
  delete(): void;
}
