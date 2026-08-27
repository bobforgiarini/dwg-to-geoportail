import type { AcDbParsingTaskResult } from '@mlightcad/data-model';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { DwgPreflightReport } from '../cad/preflightTypes';
import type { MlightCadPreparationResult } from './types';
import type {
  MlightDwgWorkerRequest,
  MlightDwgWorkerResponse,
  MlightDwgWorkerStartOptions,
} from './mlightDwgWorkerProtocol';

export interface MlightDwgWorkerPort {
  onmessage: ((event: MessageEvent<MlightDwgWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: MlightDwgWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export type MlightDwgWorkerFactory = () => MlightDwgWorkerPort;

export interface MlightDwgWorkerClientCallbacks {
  onPreflight?: (report: DwgPreflightReport) => void;
  onPreparation?: (report: DwgPreflightReport) => Promise<MlightCadPreparationResult>;
}

function createModuleWorker(): MlightDwgWorkerPort {
  return new Worker(
    new URL('./mlightDwgPreparation.worker.ts', import.meta.url),
    { type: 'module', name: 'mlightcad-dwg-preparation' },
  );
}

function cancellationError(): Error {
  const error = new Error('MLIGHTCAD_IMPORT_CANCELLED');
  error.name = 'AbortError';
  return error;
}

function workerError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export class MlightDwgPreparationWorkerClient {
  private readonly workerFactory: MlightDwgWorkerFactory;
  private worker: MlightDwgWorkerPort | null = null;
  private rejectTask: ((error: Error) => void) | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private settled = true;
  private jobSequence = 0;

  constructor(workerFactory: MlightDwgWorkerFactory = createModuleWorker) {
    this.workerFactory = workerFactory;
  }

  execute(
    data: ArrayBuffer,
    options: Omit<MlightDwgWorkerStartOptions, 'canPrepare'>,
    callbacks: MlightDwgWorkerClientCallbacks,
    timeout: number,
  ): Promise<AcDbParsingTaskResult<DwgDatabase>> {
    if (!this.settled) throw new Error('MLIGHTCAD_WORKER_BUSY');

    this.settled = false;
    const worker = this.workerFactory();
    this.worker = worker;
    const jobId = `dwg-${Date.now()}-${++this.jobSequence}`;

    return new Promise<AcDbParsingTaskResult<DwgDatabase>>((resolve, reject) => {
      this.rejectTask = reject;

      const armTimeout = () => {
        this.clearTimeout();
        this.timeoutId = setTimeout(() => {
          this.finishReject(workerError('TimeoutError', 'MLIGHTCAD_PARSER_TIMEOUT'));
        }, timeout);
      };

      worker.onmessage = (event) => {
        const message = event.data;
        if (message.jobId !== jobId || this.settled) return;

        if (message.type === 'preflight') {
          callbacks.onPreflight?.(message.report);
          if (!message.requiresDecision) return;

          // Deliberation time in the preparation sheet is not parser time.
          this.clearTimeout();
          const prepare = callbacks.onPreparation;
          if (!prepare) {
            worker.postMessage({ type: 'continue', jobId, decision: 'full' });
            armTimeout();
            return;
          }

          void prepare(message.report).then((selection) => {
            if (this.settled || this.worker !== worker) return;
            if (selection.decision === 'cancel') {
              this.cancel();
              return;
            }
            worker.postMessage({
              type: 'continue',
              jobId,
              decision: selection.decision,
              profile: selection.profile,
              annotationScaleId: selection.annotationScaleId,
              spatialFilterEnabled: selection.spatialFilterEnabled,
            });
            armTimeout();
          }, (error: unknown) => {
            this.finishReject(error instanceof Error ? error : new Error(String(error)));
          });
          return;
        }

        if (message.type === 'result') {
          this.finish();
          resolve({ model: message.model, data: message.stats });
          return;
        }
        if (message.type === 'cancelled') {
          this.finishReject(cancellationError());
          return;
        }
        this.finishReject(workerError(message.error.name, message.error.message));
      };

      worker.onerror = (event) => {
        this.finishReject(workerError('WorkerError', event.message || 'MLIGHTCAD_WORKER_ERROR'));
      };
      worker.onmessageerror = () => {
        this.finishReject(workerError('DataCloneError', 'MLIGHTCAD_WORKER_MESSAGE_ERROR'));
      };

      armTimeout();
      const xrefTransfers = options.xrefSources?.map((source) => source.data) ?? [];
      worker.postMessage({
        type: 'start',
        jobId,
        data,
        options: { ...options, canPrepare: Boolean(callbacks.onPreparation) },
      }, [data, ...xrefTransfers]);
    });
  }

  cancel(): void {
    if (this.settled) return;
    this.finishReject(cancellationError());
  }

  destroy(): void {
    if (!this.settled) this.cancel();
    else this.releaseWorker();
  }

  private finish(): void {
    if (this.settled) return;
    this.settled = true;
    this.rejectTask = null;
    this.clearTimeout();
    this.releaseWorker();
  }

  private finishReject(error: Error): void {
    if (this.settled) return;
    const reject = this.rejectTask;
    this.finish();
    reject?.(error);
  }

  private releaseWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }

  private clearTimeout(): void {
    if (this.timeoutId == null) return;
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}
