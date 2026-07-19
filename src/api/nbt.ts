import { NbtFile, NbtType, Structure } from 'deepslate';

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

function parseLitematic (root: InstanceType<typeof NbtFile>['root']): Structure {
  const regions = root.getCompound('Regions');
  const regionName = regions.keys().next().value;
  if (!regionName) {
    throw new Error('No regions found in litematic file');
  }
  const region = regions.getCompound(regionName);

  const sizeTag = region.get('Size');
  let sx: number, sy: number, sz: number;
  if (sizeTag?.getId() === NbtType.Compound) {
    const sizeCompound = region.getCompound('Size');
    sx = Math.abs(sizeCompound.getNumber('x') || sizeCompound.getNumber('X'));
    sy = Math.abs(sizeCompound.getNumber('y') || sizeCompound.getNumber('Y'));
    sz = Math.abs(sizeCompound.getNumber('z') || sizeCompound.getNumber('Z'));
  } else {
    const sizeList = region.getList('Size');
    sx = Math.abs(sizeList.getNumber(0));
    sy = Math.abs(sizeList.getNumber(1));
    sz = Math.abs(sizeList.getNumber(2));
  }

  const palette = region.getList('BlockStatePalette', NbtType.Compound);
  const blockStates = region.getLongArray('BlockStates');

  // 读取 TileEntities（block entity 数据）
  let tileEntities: Map<string, InstanceType<typeof NbtFile>['root']> | null = null;
  if (region.has('TileEntities')) {
    tileEntities = new Map();
    const tileEntList = region.getList('TileEntities', NbtType.Compound);
    for (let i = 0; i < tileEntList.length; i++) {
      const te = tileEntList.getCompound(i);
      if (te.has('Pos')) {
        const pos = te.getList('Pos');
        tileEntities.set(`${pos.getNumber(0)},${pos.getNumber(1)},${pos.getNumber(2)}`, te);
      }
    }
  }

  const paletteSize = palette.length;
  const bits = Math.max(2, Math.ceil(Math.log2(paletteSize)));
  const mask = (1n << BigInt(bits)) - 1n;
  const total = sx * sy * sz;

  const longs: bigint[] = [];
  for (let i = 0; i < blockStates.length; i++) {
    longs.push(blockStates.get(i)!.toBigInt());
  }

  let bitIndex = 0n;
  const result = new Structure([sx, sy, sz]);

  for (let i = 0; i < total; i++) {
    const longIdx = Number(bitIndex / 64n);
    const offset = Number(bitIndex % 64n);
    let value = Number((longs[longIdx]! >> BigInt(offset)) & mask);

    if (offset + bits > 64) {
      const remaining = 64 - offset;
      const nextBits = bits - remaining;
      const nextValue = Number(longs[longIdx + 1]! & ((1n << BigInt(nextBits)) - 1n));
      value = value | (nextValue << remaining);
    }

    const x = i % sx;
    const z = Math.floor(i / sx) % sz;
    const y = Math.floor(i / (sx * sz));

    const entry = palette.getCompound(value);
    const name = entry.getString('Name');

    if (name !== 'minecraft:air' && name !== 'minecraft:cave_air' && name !== 'minecraft:void_air') {
      const props = entry.has('Properties') ? entry.getCompound('Properties') : null;
      const properties: Record<string, string> = {};
      if (props) {
        for (const key of props.keys()) {
          properties[key] = props.getString(key);
        }
      }
      result.addBlock([x, y, z], name, Object.keys(properties).length ? properties : undefined, tileEntities?.get(`${x},${y},${z}`));
    }

    bitIndex += BigInt(bits);
  }

  return result;
}

export function isLitematic (filename: string): boolean {
  return filename.endsWith('.litematic');
}

export async function loadStructureFromNbt (input: NbtInput, filename?: string): Promise<Structure> {
  const data = await toUint8Array(input);
  const nbt = NbtFile.read(data);

  if (filename && isLitematic(filename)) {
    return parseLitematic(nbt.root);
  }

  return Structure.fromNbt(nbt.root);
}
