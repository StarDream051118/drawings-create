export type LimestoneEvent =
  | { type: 'loading-progress'; message: string; progress?: number }
  | { type: 'render-warning'; message: string }
  | { type: 'fatal-error'; message: string; error?: unknown }
  | { type: 'asset-loaded'; assetType: string; id: string }
  | { type: 'structure-loaded' };

export type LimestoneEventHandler = (event: LimestoneEvent) => void;

export class LimestoneObserver {
  private handlers: Set<LimestoneEventHandler> = new Set();

  subscribe (handler: LimestoneEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit (event: LimestoneEvent) {
    this.handlers.forEach(h => h(event));
  }
}
