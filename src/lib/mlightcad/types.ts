import type { CadOverlayLayer, SelectedCadObject } from '../../types/models';
import type {
  CadLoadDecision,
  CadLoadProfile,
  CadOverlayBlock,
  DwgPreflightOptions,
  DwgPreflightReport,
} from '../cad/preflightTypes';
import type { CadDwgSource } from '../cad/xrefBundle';

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
  blocks: CadOverlayBlock[];
  entityCount: number;
  preflight: DwgPreflightReport | null;
}

export interface MlightCadPreparationResult {
  decision: CadLoadDecision;
  profile?: CadLoadProfile;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}

export interface MlightCadLoadOptions {
  device?: DwgPreflightOptions['device'];
  maxBlockDepth?: DwgPreflightOptions['maxBlockDepth'];
  loadProfile?: CadLoadProfile;
  onPreparation?: (report: DwgPreflightReport) => Promise<MlightCadPreparationResult>;
  forcePreparation?: boolean;
  forceFull?: boolean;
  xrefFiles?: readonly File[];
  xrefSources?: CadDwgSource[];
  preferredXrefFileIds?: Readonly<Record<string, string>>;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}

export interface MlightCadAdapterEvents {
  progress: MlightCadProgress;
  camera: MlightCadCamera;
  layers: CadOverlayLayer[];
  blocks: CadOverlayBlock[];
  preflight: DwgPreflightReport;
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
