import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type {
  CadAnnotationScaleSelection,
  CadLoadDecision,
  CadLoadProfile,
  DwgPreflightOptions,
  DwgPreflightReport,
} from '../cad/preflightTypes';
import type { CadSpatialFilterReport } from '../cad/luxembourgSpatialFilter';
import type { CadDwgSource } from '../cad/xrefBundle';

export interface MlightDwgWorkerStartOptions {
  wasmBaseUrl: string;
  file?: DwgPreflightOptions['file'];
  device?: DwgPreflightOptions['device'];
  maxBlockDepth?: DwgPreflightOptions['maxBlockDepth'];
  loadProfile?: CadLoadProfile;
  forcePreparation?: boolean;
  forceFull?: boolean;
  xrefSources?: CadDwgSource[];
  preferredXrefFileIds?: Record<string, string>;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
  canPrepare: boolean;
}

export interface MlightDwgWorkerStartMessage {
  type: 'start';
  jobId: string;
  data: ArrayBuffer;
  options: MlightDwgWorkerStartOptions;
}

export interface MlightDwgWorkerContinueMessage {
  type: 'continue';
  jobId: string;
  decision: Exclude<CadLoadDecision, 'cancel'>;
  profile?: CadLoadProfile;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}

export interface MlightDwgWorkerCancelMessage {
  type: 'cancel';
  jobId: string;
}

export type MlightDwgWorkerRequest =
  | MlightDwgWorkerStartMessage
  | MlightDwgWorkerContinueMessage
  | MlightDwgWorkerCancelMessage;

export interface MlightDwgWorkerPreflightMessage {
  type: 'preflight';
  jobId: string;
  report: DwgPreflightReport;
  requiresDecision: boolean;
}

export interface MlightDwgWorkerResultMessage {
  type: 'result';
  jobId: string;
  model: DwgDatabase;
  stats: MlightDwgWorkerStats;
}

export interface MlightDwgWorkerStats {
  unknownEntityCount: number;
  annotationScale?: CadAnnotationScaleSelection;
  externalReferenceCount?: number;
  spatialFilter?: CadSpatialFilterReport;
}

export interface MlightDwgWorkerErrorMessage {
  type: 'error';
  jobId: string;
  error: {
    name: string;
    message: string;
  };
}

export interface MlightDwgWorkerCancelledMessage {
  type: 'cancelled';
  jobId: string;
}

export type MlightDwgWorkerResponse =
  | MlightDwgWorkerPreflightMessage
  | MlightDwgWorkerResultMessage
  | MlightDwgWorkerErrorMessage
  | MlightDwgWorkerCancelledMessage;

export interface MlightDwgWorkerDecision {
  decision: Exclude<CadLoadDecision, 'cancel'>;
  profile?: CadLoadProfile;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}
