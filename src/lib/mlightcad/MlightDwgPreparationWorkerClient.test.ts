import { describe, expect, it, vi } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { DwgPreflightReport } from '../cad/preflightTypes';
import {
  MlightDwgPreparationWorkerClient,
  type MlightDwgWorkerPort,
} from './MlightDwgPreparationWorkerClient';
import type { MlightDwgWorkerRequest, MlightDwgWorkerResponse } from './mlightDwgWorkerProtocol';

function report(): DwgPreflightReport {
  return {
    schemaVersion: 1,
    file: { name: 'drawing.dwg', size: 20, lastModified: null },
    format: 'dwg', documentVersion: 'AC1032', layers: [], blocks: [],
    entityCounts: {
      modelEntities: 1, insertInstances: 0, texts: 0, leaders: 0, mleaders: 0, hatches: 0,
      solids: 0, polylineVertices: 0, paperSpaceEntities: 0, images: 0,
      oleObjects: 0, proxyObjects: 0, threeDimensional: 0, xrefs: 0,
    },
    definedBlockCount: 0, reachableBlockCount: 0, maxBlockDepth: 0,
    risk: {
      level: 'high', shouldPrepare: true, estimatedRenderCost: 2,
      deviceBudget: 1, reasons: ['render-cost'],
    },
    recommendedProfile: {
      mode: 'filtered', hiddenLayerIds: ['OFF'], hiddenBlockNames: [],
      hiddenEntityCategories: [],
    }, warnings: [],
  };
}

class FakeWorker implements MlightDwgWorkerPort {
  onmessage: ((event: MessageEvent<MlightDwgWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: Array<{ message: MlightDwgWorkerRequest; transfer?: Transferable[] }> = [];
  readonly terminate = vi.fn();

  postMessage(message: MlightDwgWorkerRequest, transfer?: Transferable[]): void {
    this.sent.push({ message, transfer });
  }

  emit(message: MlightDwgWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<MlightDwgWorkerResponse>);
  }
}

function jobId(worker: FakeWorker): string {
  const message = worker.sent[0].message;
  if (message.type !== 'start') throw new Error('Expected start message');
  return message.jobId;
}

describe('MlightDwgPreparationWorkerClient', () => {
  it('transfers the source, responds to preflight, and resolves only the final model', async () => {
    const worker = new FakeWorker();
    const client = new MlightDwgPreparationWorkerClient(() => worker);
    const data = new ArrayBuffer(24);
    const onPreflight = vi.fn();
    const model = { entities: [] } as unknown as DwgDatabase;

    const result = client.execute(data, {
      wasmBaseUrl: '/mlightcad-workers/0.3.0',
    }, {
      onPreflight,
      onPreparation: async (received) => ({
        decision: 'filtered', profile: received.recommendedProfile,
      }),
    }, 10_000);

    expect(worker.sent[0].message).toMatchObject({
      type: 'start', data,
      options: { wasmBaseUrl: '/mlightcad-workers/0.3.0', canPrepare: true },
    });
    expect(worker.sent[0].transfer).toEqual([data]);

    worker.emit({
      type: 'preflight', jobId: jobId(worker), report: report(), requiresDecision: true,
    });
    await vi.waitFor(() => expect(worker.sent).toHaveLength(2));
    expect(onPreflight).toHaveBeenCalledWith(report());
    expect(worker.sent[1].message).toMatchObject({
      type: 'continue', decision: 'filtered', profile: report().recommendedProfile,
    });

    worker.emit({
      type: 'result', jobId: jobId(worker), model, stats: { unknownEntityCount: 2 },
    });
    await expect(result).resolves.toEqual({ model, data: { unknownEntityCount: 2 } });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('transfers every local XRef buffer with the root in one start message', async () => {
    const worker = new FakeWorker();
    const client = new MlightDwgPreparationWorkerClient(() => worker);
    const root = new ArrayBuffer(8);
    const first = new ArrayBuffer(4);
    const second = new ArrayBuffer(6);

    const task = client.execute(root, {
      wasmBaseUrl: '/mlightcad-workers/0.5.0',
      xrefSources: [
        { file: { id: 'a', name: 'a.dwg', size: 4, lastModified: 1 }, data: first },
        { file: { id: 'b', name: 'b.dwg', size: 6, lastModified: 2 }, data: second },
      ],
    }, {}, 10_000);

    expect(worker.sent[0].transfer).toEqual([root, first, second]);
    client.cancel();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('terminates and rejects synchronously when cancelled', async () => {
    const worker = new FakeWorker();
    const client = new MlightDwgPreparationWorkerClient(() => worker);
    const result = client.execute(new ArrayBuffer(8), {
      wasmBaseUrl: '/mlightcad-workers/0.3.0',
    }, {}, 10_000);
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    const started = performance.now();
    client.cancel();

    expect(performance.now() - started).toBeLessThan(500);
    expect(worker.terminate).toHaveBeenCalledOnce();
    await rejection;
  });

  it('terminates on worker errors', async () => {
    const worker = new FakeWorker();
    const client = new MlightDwgPreparationWorkerClient(() => worker);
    const result = client.execute(new ArrayBuffer(8), {
      wasmBaseUrl: '/mlightcad-workers/0.3.0',
    }, {}, 10_000);

    worker.emit({
      type: 'error', jobId: jobId(worker),
      error: { name: 'DwgParseError', message: 'bad drawing' },
    });

    await expect(result).rejects.toMatchObject({ name: 'DwgParseError', message: 'bad drawing' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates parsing when the active worker timeout expires', async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const client = new MlightDwgPreparationWorkerClient(() => worker);
      const result = client.execute(new ArrayBuffer(8), {
        wasmBaseUrl: '/mlightcad-workers/0.3.0',
      }, {}, 1_000);
      const rejection = expect(result).rejects.toMatchObject({
        name: 'TimeoutError', message: 'MLIGHTCAD_PARSER_TIMEOUT',
      });

      await vi.advanceTimersByTimeAsync(1_000);

      await rejection;
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses the timeout for preparation, rearms it afterwards, and ignores late replies', async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const client = new MlightDwgPreparationWorkerClient(() => worker);
      let finishPreparation!: (selection: { decision: 'full' }) => void;
      const preparation = new Promise<{ decision: 'full' }>((resolve) => {
        finishPreparation = resolve;
      });
      const result = client.execute(new ArrayBuffer(8), {
        wasmBaseUrl: '/mlightcad-workers/0.3.0',
      }, { onPreparation: () => preparation }, 1_000);

      await vi.advanceTimersByTimeAsync(900);
      worker.emit({
        type: 'preflight', jobId: jobId(worker), report: report(), requiresDecision: true,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(worker.terminate).not.toHaveBeenCalled();

      finishPreparation({ decision: 'full' });
      await Promise.resolve();
      expect(worker.sent[1].message).toMatchObject({ type: 'continue', decision: 'full' });

      const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
      expect(worker.terminate).toHaveBeenCalledOnce();

      worker.emit({
        type: 'result', jobId: jobId(worker), model: { entities: [] } as unknown as DwgDatabase,
        stats: { unknownEntityCount: 0 },
      });
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
