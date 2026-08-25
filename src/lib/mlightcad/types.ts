import type { CadOverlayLayer, SelectedCadObject } from '../../types/models';

export interface MlightCadCamera {
  center: [number, number];
  /** Drawing metres represented by one CSS pixel. */
  resolution: number;
}

export interface MlightCadProgress {
  phase: 'workers' | 'read' | 'parse' | 'render' | 'ready';
  percentage: number | null;
  detail?: string;
}

export interface MlightCadReady {
  layers: CadOverlayLayer[];
  entityCount: number;
}

export interface MlightCadAdapterEvents {
  progress: MlightCadProgress;
  camera: MlightCadCamera;
  layers: CadOverlayLayer[];
  selection: SelectedCadObject | null;
  ready: MlightCadReady;
  error: Error;
}

export class AdapterEvent<T> {
  private readonly listeners = new Set<(value: T) => void>();

  addEventListener(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeEventListener(listener: (value: T) => void): void {
    this.listeners.delete(listener);
  }

  dispatch(value: T): void {
    for (const listener of this.listeners) listener(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}
