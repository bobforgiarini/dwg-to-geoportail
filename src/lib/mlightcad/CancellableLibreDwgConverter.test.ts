import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { DwgPreflightReport } from '../cad/preflightTypes';

const client = vi.hoisted(() => ({
  execute: vi.fn(),
  cancel: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('./MlightDwgPreparationWorkerClient', () => ({
  MlightDwgPreparationWorkerClient: class MockWorkerClient {
    execute = client.execute;
    cancel = client.cancel;
    destroy = client.destroy;
  },
}));

vi.mock('@mlightcad/libredwg-converter', () => ({
  AcDbLibreDwgConverter: class MockLibreDwgConverter {
    config: { parserWorkerUrl?: string };
    constructor(config: { parserWorkerUrl?: string } = {}) { this.config = config; }
    protected getParserWorkerTimeout(_data: ArrayBuffer, timeout?: number) {
      return timeout ?? 30_000;
    }
  },
}));

import { CancellableLibreDwgConverter } from './CancellableLibreDwgConverter';

function preflight(): DwgPreflightReport {
  return {
    schemaVersion: 1,
    file: { name: 'drawing.dwg', size: 8, lastModified: null },
    format: 'dwg', documentVersion: 'AC1032', layers: [], blocks: [],
    entityCounts: {
      modelEntities: 0, insertInstances: 0, texts: 0, leaders: 0, mleaders: 0, hatches: 0,
      solids: 0, polylineVertices: 0, paperSpaceEntities: 0, images: 0,
      oleObjects: 0, proxyObjects: 0, threeDimensional: 0, xrefs: 0,
    },
    definedBlockCount: 0, reachableBlockCount: 0, maxBlockDepth: 0,
    risk: {
      level: 'low', shouldPrepare: false, estimatedRenderCost: 0,
      deviceBudget: 1, reasons: [],
    },
    recommendedProfile: {
      mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [],
    }, warnings: [],
  };
}

class TestConverter extends CancellableLibreDwgConverter {
  run(data = new ArrayBuffer(8)) {
    return this.parse(data);
  }
}

describe('CancellableLibreDwgConverter worker integration', () => {
  beforeEach(() => {
    client.execute.mockReset();
    client.cancel.mockReset();
    client.destroy.mockReset();
  });

  it('uses the app worker and forwards its compact preflight event', async () => {
    const model = { entities: [] } as unknown as DwgDatabase;
    const onPreflight = vi.fn();
    client.execute.mockImplementation(async (
      _data: ArrayBuffer,
      _options: unknown,
      callbacks: { onPreflight?: (value: DwgPreflightReport) => void },
    ) => {
      callbacks.onPreflight?.(preflight());
      return { model, data: { unknownEntityCount: 0 } };
    });
    const converter = new TestConverter().configurePreparation({ onPreflight });

    await expect(converter.run()).resolves.toEqual({
      model, data: { unknownEntityCount: 0 },
    });
    expect(client.execute).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ wasmBaseUrl: '/mlightcad-workers/0.3.0' }),
      expect.objectContaining({ onPreflight: expect.any(Function) }),
      30_000,
    );
    expect(converter.preflightReport).toEqual(preflight());
    expect(onPreflight).toHaveBeenCalledWith(preflight());
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('forwards reusable profile and explicit full-load controls into the worker', async () => {
    client.execute.mockResolvedValue({
      model: { entities: [] } as unknown as DwgDatabase,
      data: { unknownEntityCount: 0 },
    });
    const converter = new TestConverter().configurePreparation({
      file: { name: 'large.dwg', size: 200 * 1024 * 1024 },
      device: { mobile: true, memoryGiB: 1 },
      loadProfile: {
        mode: 'filtered', hiddenLayerIds: ['OFF'], hiddenBlockNames: [],
        hiddenEntityCategories: [],
      },
      forceFull: true,
    });

    await converter.run();

    expect(client.execute).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({
        file: { name: 'large.dwg', size: 200 * 1024 * 1024 },
        device: { mobile: true, memoryGiB: 1 },
        loadProfile: expect.objectContaining({ hiddenLayerIds: ['OFF'] }),
        forceFull: true,
      }),
      expect.any(Object),
      30_000,
    );
  });

  it('cancels the parser client immediately', async () => {
    let rejectTask: ((error: Error) => void) | undefined;
    client.execute.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectTask = reject;
    }));
    client.cancel.mockImplementation(() => {
      const error = new Error('MLIGHTCAD_IMPORT_CANCELLED');
      error.name = 'AbortError';
      rejectTask?.(error);
    });
    const converter = new TestConverter().configurePreparation({});
    const result = converter.run();
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    const started = performance.now();
    converter.cancel();

    expect(performance.now() - started).toBeLessThan(500);
    expect(client.cancel).toHaveBeenCalledOnce();
    await rejection;
  });
});
