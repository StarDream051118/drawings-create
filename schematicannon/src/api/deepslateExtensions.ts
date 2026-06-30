
import { BlockDefinition, BlockModel } from 'deepslate';
import { Identifier } from 'deepslate/core';
import { RawBlockModel, RawModelElement } from 'src/types/assets';

declare type ModelVariant = {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
};
declare type ModelVariantEntry = ModelVariant | (ModelVariant & {
  weight?: number;
})[];
export type ModelMultiPartCondition = {
  OR?: ModelMultiPartCondition[];
  AND?: ModelMultiPartCondition[];
  waterlogged?: string;
  facing?: string;
  face?: string;
  axis_along_first?: string;
  flipped?: string;

  axis?: string;
  up?: string;
  down?: string;
  north?: string;
  south?: string;
  east?: string;
  west?: string;
};
declare type ModelMultiPart = {
  when?: ModelMultiPartCondition;
  apply: ModelVariantEntry;
};

export function describeBlockDefinition (def: BlockDefinition): { variants: {
  [key: string]: ModelVariantEntry;
} | undefined; multipart: ModelMultiPart[] | undefined; } {
  const d = def;
  return {
    variants: d.variants,
    multipart: d.multipart
  };
}

export function blockModelHasGeometry (model: BlockModel): boolean {
  return model.elements && model.elements.length > 0;
}

export function createBlockModelFromJson (data: RawBlockModel): BlockModel {
  const parent = data.parent ? Identifier.parse(data.parent) : undefined;
  const textures = data.textures ?? {};
  const elements = data.elements as RawModelElement[];
  const display = data.display;
  return new BlockModel(parent, textures, elements, display);
}

