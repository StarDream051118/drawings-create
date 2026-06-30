import { NbtFile, Structure } from 'deepslate';

export type NbtInput = Blob | ArrayBuffer | Uint8Array;

const toUint8Array = async (input: NbtInput): Promise<Uint8Array> => {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof input.arrayBuffer === 'function') {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new Error('Unsupported input type');
};

export async function loadStructureFromNbt (input: NbtInput): Promise<Structure> {
  const data = await toUint8Array(input);
  const nbt = NbtFile.read(data);
  return Structure.fromNbt(nbt.root);
}
