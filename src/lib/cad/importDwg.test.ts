import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadLoadProfile, DwgPreflightReport } from './preflightTypes';

const executeWorker = vi.hoisted(() => vi.fn());
const cancelWorker = vi.hoisted(() => vi.fn());
const destroyWorker = vi.hoisted(() => vi.fn());
const normalizeDwgDatabase = vi.hoisted(() => vi.fn());
const convertCadDocument = vi.hoisted(() => vi.fn());

vi.mock('../mlightcad/MlightDwgPreparationWorkerClient', () => ({
  MlightDwgPreparationWorkerClient: class {
    execute(...args: unknown[]) { return executeWorker(...args); }
    cancel() { cancelWorker(); }
    destroy() { destroyWorker(); }
  },
}));
vi.mock('@flyfish-dev/cad-viewer', () => ({ normalizeDwgDatabase }));
vi.mock('./convertCadDocument', () => ({ convertCadDocument }));
vi.mock('./runtimeDisposal', () => ({ awaitCadRuntimeDisposal: vi.fn(async () => undefined) }));

import { importDwg, isDwgPreflightError } from './importDwg';

const FILTERED_PROFILE: CadLoadProfile = {
  mode: 'filtered', hiddenLayerIds: ['OFF'], hiddenBlockNames: ['HEAVY'], hiddenEntityCategories: [],
};

function report(): DwgPreflightReport {
  return {
    schemaVersion: 1,
    file: { name: 'plan.dwg', size: 12, lastModified: 1 },
    format: 'dwg', documentVersion: 'AC1032',
    layers: [],
    blocks: [{
      id: 'HEAVY', name: 'HEAVY', kind: 'named', visible: true, instanceCount: 1,
      directInstanceCount: 1, directEntityCount: 2, recursiveEntityCount: 4,
      expandedEntityCount: 4, textCount: 0, hatchCount: 0, estimatedCost: 4,
      primaryLayer: '0', referencedBlockNames: [], isNested: false, hasCycle: false,
    }],
    entityCounts: {
      modelEntities: 4, insertInstances: 1, texts: 0, leaders: 0, mleaders: 0,
      hatches: 0, solids: 0, polylineVertices: 0, paperSpaceEntities: 0,
      images: 0, oleObjects: 0, proxyObjects: 0, threeDimensional: 0, xrefs: 0,
    },
    definedBlockCount: 1, reachableBlockCount: 1, maxBlockDepth: 1,
    risk: { level: 'elevated', shouldPrepare: true, estimatedRenderCost: 4, deviceBudget: 2, reasons: ['render-cost'] },
    recommendedProfile: FILTERED_PROFILE,
    warnings: [],
  };
}

function dwgFile(name: string): File {
  return Object.assign(new File(['local dwg'], name, { lastModified: 1 }), {
    arrayBuffer: async () => new ArrayBuffer(16),
  });
}

describe('legacy adaptive DWG import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeDwgDatabase.mockReturnValue({ warnings: [], header: {}, entities: [], layers: [], blocks: [], metadata: {}, sourceName: 'plan.dwg' });
    convertCadDocument.mockReturnValue({
      lurefExtent: [0, 0, 1, 1], layers: [], features: [], autoHiddenFeatureIds: [], warnings: [],
    });
  });

  it('waits for the preparation decision and normalizes only the worker result', async () => {
    const preflight = report();
    const model = { header: { ACADVER: 'AC1032' }, entities: [] };
    executeWorker.mockImplementation(async (_data, options, callbacks) => {
      expect(options.maxBlockDepth).toBe(18);
      callbacks.onPreflight(preflight);
      expect(await callbacks.onPreparation(preflight)).toEqual({ decision: 'filtered', profile: FILTERED_PROFILE });
      return { model, data: { unknownEntityCount: 0 } };
    });
    const file = dwgFile('plan.dwg');
    const onPreparation = vi.fn(async () => ({ decision: 'filtered' as const, profile: FILTERED_PROFILE }));

    const result = await importDwg(file, new AbortController().signal, undefined, {
      onPreparation,
      preflight: { maxBlockDepth: 18 },
    });

    expect(onPreparation).toHaveBeenCalledWith(preflight);
    expect(normalizeDwgDatabase).toHaveBeenCalledWith(model, 'plan.dwg', 'AC1032', { keepRaw: true });
    expect(result.preflight).toEqual(preflight);
    expect(result.blocks[0].visible).toBe(false);
    expect(destroyWorker).toHaveBeenCalledOnce();
  });

  it('preserves worker cancellation instead of reporting a preflight failure', async () => {
    const cancellation = new Error('MLIGHTCAD_IMPORT_CANCELLED');
    cancellation.name = 'AbortError';
    executeWorker.mockRejectedValue(cancellation);

    const task = importDwg(dwgFile('cancelled.dwg'), new AbortController().signal);

    await expect(task).rejects.toBe(cancellation);
    await task.catch((error) => expect(isDwgPreflightError(error)).toBe(false));
  });

  it('does not mislabel a post-preflight filter failure as an unavailable preflight', async () => {
    const filterFailure = new Error('DWG_FILTER_FAILED');
    executeWorker.mockImplementation(async (_data, _options, callbacks) => {
      callbacks.onPreflight(report());
      throw filterFailure;
    });

    const task = importDwg(dwgFile('filter-failure.dwg'), new AbortController().signal);

    await expect(task).rejects.toBe(filterFailure);
    await task.catch((error) => expect(isDwgPreflightError(error)).toBe(false));
  });
});
