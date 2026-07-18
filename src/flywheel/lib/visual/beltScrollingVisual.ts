import { BlockPos } from 'deepslate/core';
import { DynamicVisual } from '../../api/visual/visual';
import { VisualizationContext } from '../../api/visualization/visualizationContext';
import { InstanceTypes } from '../instance/instanceTypes';
import { ScrollTransformedInstance } from '../instance/scrollInstance';
import { AbstractBlockEntityVisual } from './abstractBlockEntityVisual';

export class BeltScrollingVisual extends AbstractBlockEntityVisual implements DynamicVisual {
  private readonly instance: ScrollTransformedInstance;
  private scrollState: number = 0;
  private readonly speed: number;

  constructor (
    context: VisualizationContext,
    pos: BlockPos,
    model: unknown,
    speed = 0.5
  ) {
    super(context, pos);
    this.speed = speed;

    this.instance = context.instancerProvider()
      .instancer(InstanceTypes.SCROLL_TRANSFORMED, model)
      .createInstance() as ScrollTransformedInstance;

    this.instance.setPosition(pos);
    this.instance.setIdentity();
    this.instance.translate(pos[0], pos[1], pos[2]);
  }

  beginFrame (_context: VisualizationContext): void {
    // Transform is static — only scroll offset changes each frame
  }

  update (partialTick: number): void {
    this.scrollState += this.speed * partialTick;
    this.scrollState %= 1.0;
    this.instance.scrollV = this.scrollState;
    this.instance.setChanged();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateLight (_partialTick: number): void {
    // TODO: Update light
  }

  delete (): void {
    this.instance.delete();
  }
}
