import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type {
  CadLoadDecision,
  CadLoadProfile,
  DwgPreflightOptions,
  DwgPreflightReport,
} from '../cad/preflightTypes';

export interface MlightDwgWorkerStartOptions {
  wasmBaseUrl: string;
  file?: DwgPreflightOptions['file'];
  device?: DwgPreflightOptions['device'];
  maxBlockDepth?: DwgPreflightOptions['maxBlockDepth'];
  loadProfile?: CadLoadProfile;
  forcePreparation?: boolean;
  forceFull?: boolean;
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
  stats: { unknownEntityCount: number };
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
}
