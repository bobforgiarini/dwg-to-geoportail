import { describe, expect, it, vi } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { CadLoadProfile, DwgPreflightReport } from '../cad/preflightTypes';
import { runMlightDwgWorkerTask } from './mlightDwgWorkerTask';

const FULL_PROFILE: CadLoadProfile = {
  mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [],
};

function database(): DwgDatabase {
  return {
    header: { ACADVER: 'AC1032' }, entities: [],
    tables: { BLOCK_RECORD: { entries: [] }, LAYER: { entries: [] } },
    objects: { IMAGEDEF: [] }, classes: [],
  } as unknown as DwgDatabase;
}

function report(shouldPrepare = true): DwgPreflightReport {
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
      level: shouldPrepare ? 'high' : 'low', shouldPrepare,
      estimatedRenderCost: 1, deviceBudget: 1,
      reasons: shouldPrepare ? ['render-cost'] : [],
    },
    recommendedProfile: FULL_PROFILE,
    warnings: [],
  };
}

describe('MLightCAD DWG worker task', () => {
  it('pauses after the compact report and filters before returning the model', async () => {
    const source = database();
    const filtered = database();
    const filteredProfile: CadLoadProfile = {
      mode: 'filtered', hiddenLayerIds: ['HEAVY'], hiddenBlockNames: [],
      hiddenEntityCategories: [],
    };
    let continueTask: ((value: { decision: 'filtered'; profile: CadLoadProfile }) => void) | undefined;
    const decision = new Promise<{ decision: 'filtered'; profile: CadLoadProfile }>((resolve) => {
      continueTask = resolve;
    });
    const emitPreflight = vi.fn();
    const filter = vi.fn(() => filtered);
    const parse = vi.fn(async () => ({ database: source, stats: { unknownEntityCount: 3 } }));
    const analyze = vi.fn(() => report());

    const task = runMlightDwgWorkerTask({
      type: 'start', jobId: 'one', data: new ArrayBuffer(12),
      options: {
        wasmBaseUrl: '/mlightcad-workers/0.3.0', canPrepare: true,
        forcePreparation: true, maxBlockDepth: 24,
      },
    }, {
      emitPreflight,
      waitForDecision: () => decision,
    }, {
      parse,
      analyze,
      filter,
      normalize: vi.fn(),
    });

    await vi.waitFor(() => expect(emitPreflight).toHaveBeenCalledWith(report(), true));
    expect(filter).not.toHaveBeenCalled();
    continueTask?.({ decision: 'filtered', profile: filteredProfile });

    await expect(task).resolves.toEqual({ database: filtered, stats: { unknownEntityCount: 3 } });
    expect(parse).toHaveBeenCalledWith(expect.any(ArrayBuffer), '/mlightcad-workers/0.3.0');
    expect(analyze).toHaveBeenCalledWith(source, expect.objectContaining({
      maxBlockDepth: 24,
      unknownEntityCount: 3,
    }));
    expect(filter).toHaveBeenCalledWith(source, filteredProfile);
  });

  it('does not pause a low-risk model and still applies the model-space filter', async () => {
    const source = database();
    const filter = vi.fn((model: DwgDatabase) => model);
    const waitForDecision = vi.fn();

    await runMlightDwgWorkerTask({
      type: 'start', jobId: 'two', data: new ArrayBuffer(8),
      options: { wasmBaseUrl: '/mlightcad-workers/0.3.0', canPrepare: true },
    }, {
      emitPreflight: vi.fn(), waitForDecision,
    }, {
      parse: async () => ({ database: source, stats: { unknownEntityCount: 0 } }),
      analyze: () => report(false), filter, normalize: vi.fn(),
    });

    expect(waitForDecision).not.toHaveBeenCalled();
    expect(filter).toHaveBeenCalledWith(source, FULL_PROFILE);
  });

  it('honors force-full when analysis itself cannot complete', async () => {
    const source = database();
    const filter = vi.fn((model: DwgDatabase) => model);

    await expect(runMlightDwgWorkerTask({
      type: 'start', jobId: 'three', data: new ArrayBuffer(8),
      options: {
        wasmBaseUrl: '/mlightcad-workers/0.3.0', canPrepare: true, forceFull: true,
      },
    }, {
      emitPreflight: vi.fn(), waitForDecision: vi.fn(),
    }, {
      parse: async () => ({ database: source, stats: { unknownEntityCount: 0 } }),
      analyze: () => { throw new Error('preflight failed'); },
      filter, normalize: vi.fn(),
    })).resolves.toEqual({ database: source, stats: { unknownEntityCount: 0 } });
    expect(filter).toHaveBeenCalledWith(source, FULL_PROFILE);
  });
});
