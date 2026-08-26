/// <reference lib="webworker" />

import { runMlightDwgWorkerTask } from './mlightDwgWorkerTask';
import type {
  MlightDwgWorkerDecision,
  MlightDwgWorkerRequest,
  MlightDwgWorkerResponse,
  MlightDwgWorkerStartMessage,
} from './mlightDwgWorkerProtocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let activeJobId: string | null = null;
let resolveDecision: ((decision: MlightDwgWorkerDecision) => void) | null = null;
let rejectDecision: ((error: Error) => void) | null = null;

function post(message: MlightDwgWorkerResponse): void {
  scope.postMessage(message);
}

function cancellationError(): Error {
  const error = new Error('MLIGHTCAD_IMPORT_CANCELLED');
  error.name = 'AbortError';
  return error;
}

async function start(request: MlightDwgWorkerStartMessage): Promise<void> {
  if (activeJobId) throw new Error('MLIGHTCAD_WORKER_BUSY');
  activeJobId = request.jobId;

  try {
    const result = await runMlightDwgWorkerTask(request, {
      emitPreflight: (report, requiresDecision) => {
        post({ type: 'preflight', jobId: request.jobId, report, requiresDecision });
      },
      waitForDecision: () => new Promise<MlightDwgWorkerDecision>((resolve, reject) => {
        resolveDecision = resolve;
        rejectDecision = reject;
      }),
    });

    if (activeJobId !== request.jobId) return;
    post({
      type: 'result',
      jobId: request.jobId,
      model: result.database,
      stats: result.stats,
    });
  } catch (unknownError) {
    if (activeJobId !== request.jobId) return;
    const error = unknownError instanceof Error
      ? unknownError
      : new Error(String(unknownError));
    if (error.name === 'AbortError') {
      post({ type: 'cancelled', jobId: request.jobId });
    } else {
      post({
        type: 'error',
        jobId: request.jobId,
        error: { name: error.name, message: error.message },
      });
    }
  } finally {
    if (activeJobId === request.jobId) activeJobId = null;
    resolveDecision = null;
    rejectDecision = null;
  }
}

scope.onmessage = (event: MessageEvent<MlightDwgWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'start') {
    void start(message);
    return;
  }
  if (message.jobId !== activeJobId) return;
  if (message.type === 'continue') {
    resolveDecision?.({ decision: message.decision, profile: message.profile });
    resolveDecision = null;
    rejectDecision = null;
    return;
  }

  activeJobId = null;
  rejectDecision?.(cancellationError());
  resolveDecision = null;
  rejectDecision = null;
  post({ type: 'cancelled', jobId: message.jobId });
};

export {};
