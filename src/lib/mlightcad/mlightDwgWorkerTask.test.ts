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

function spatialResult(model: DwgDatabase) {
  return {
    model,
    report: {
      enabled: true as const,
      coordinateReferenceSystem: 'EPSG:2169' as const,
      bufferMeters: 1_000,
      sourceAuthority: 'ACT',
      sourceLicense: 'CC0-1.0',
      retainedRootEntityCount: 0,
      removedRootEntityCount: 0,
      unknownRootEntityCount: 0,
      removedBlockDefinitionCount: 0,
      removedEntityKeys: [], unknownEntityKeys: [], removedBlockNames: [], warnings: [],
    },
  };
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
      inspectXrefs: () => [],
      spatialFilter: (model) => spatialResult(model),
    });

    await vi.waitFor(() => expect(emitPreflight).toHaveBeenCalledWith(report(), true));
    expect(filter).not.toHaveBeenCalled();
    continueTask?.({ decision: 'filtered', profile: filteredProfile });

    await expect(task).resolves.toEqual({
      database: filtered,
      annotationScale: undefined,
      stats: {
        unknownEntityCount: 3,
        annotationScale: undefined,
        externalReferenceCount: 0,
        spatialFilter: spatialResult(source).report,
      },
    });
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
      inspectXrefs: () => [], spatialFilter: (model) => spatialResult(model),
    });

    expect(waitForDecision).not.toHaveBeenCalled();
    expect(filter).toHaveBeenCalledWith(source, FULL_PROFILE);
  });

  it('adds non-selected physical scale layers to the established model filter', async () => {
    const source = database();
    source.entities = [
      { type: 'MULTILEADER', handle: 'A', layer: 'LABEL @ 1' },
      { type: 'MULTILEADER', handle: 'B', layer: 'LABEL @ 0.5' },
      { type: 'MULTILEADER', handle: 'C', layer: 'LABEL @ 0.25' },
    ] as never;
    source.tables.LAYER.entries = [
      { name: 'LABEL @ 1' }, { name: 'LABEL @ 0.5' }, { name: 'LABEL @ 0.25' },
    ] as never;
    const filter = vi.fn((model: DwgDatabase) => model);

    await runMlightDwgWorkerTask({
      type: 'start', jobId: 'scale-layers', data: new ArrayBuffer(8),
      options: { wasmBaseUrl: '/mlightcad-workers/0.3.0', canPrepare: true },
    }, {
      emitPreflight: vi.fn(), waitForDecision: vi.fn(),
    }, {
      parse: async () => ({
        database: source,
        stats: { unknownEntityCount: 0 },
        annotationScale: {
          mode: 'saved', savedScaleId: '500', selectedScaleId: '500',
          availableScales: [{
            id: '500', name: '1/500 Best', paperUnits: 1, drawingUnits: 0.5,
            ratio: 0.5, source: 'context', isDefault: true,
          }],
          contextObjectCount: 1, failOpen: true,
        },
      }),
      analyze: () => report(false), filter, normalize: vi.fn(),
      inspectXrefs: () => [], spatialFilter: (model) => spatialResult(model),
    });

    expect(filter).toHaveBeenCalledWith(source, {
      mode: 'filtered',
      hiddenLayerIds: ['LABEL @ 0.25', 'LABEL @ 1'],
      hiddenBlockNames: [],
      hiddenEntityCategories: [],
    });
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
      inspectXrefs: () => [], spatialFilter: (model) => spatialResult(model),
    })).resolves.toEqual({
      database: source,
      annotationScale: undefined,
      stats: {
        unknownEntityCount: 0,
        annotationScale: undefined,
        externalReferenceCount: 0,
        spatialFilter: spatialResult(source).report,
      },
    });
    expect(filter).toHaveBeenCalledWith(source, FULL_PROFILE);
  });

  it('resolves local XRefs sequentially and applies scale/spatial decisions without reparsing', async () => {
    const root = database();
    const child = database();
    const merged = database();
    const spatiallyFiltered = database();
    const filter = vi.fn((model: DwgDatabase) => model);
    const parse = vi.fn(async (data: ArrayBuffer) => ({
      database: data.byteLength === 12 ? root : child,
      stats: { unknownEntityCount: data.byteLength === 12 ? 2 : 3 },
      annotationScale: data.byteLength === 12 ? {
        mode: 'saved' as const, savedScaleId: '100', selectedScaleId: '100',
        availableScales: [
          { id: '100', name: '1:100', paperUnits: 1, drawingUnits: 100, ratio: 100, source: 'saved' as const, isDefault: true },
          { id: '500', name: '1:500', paperUnits: 1, drawingUnits: 500, ratio: 500, source: 'context' as const, isDefault: false },
        ],
        contextObjectCount: 2, failOpen: true,
      } : undefined,
    }));
    const declaration = {
      id: 'X1:child', name: 'child', normalizedName: 'child', sourcePath: null,
      kind: 'attachment' as const, hasEmbeddedEntities: false,
    };
    const mergeXref = vi.fn(() => merged);
    const spatialFilter = vi.fn(() => ({ ...spatialResult(spatiallyFiltered) }));

    const result = await runMlightDwgWorkerTask({
      type: 'start', jobId: 'bundle', data: new ArrayBuffer(12),
      options: {
        wasmBaseUrl: '/mlightcad-workers/0.5.0', canPrepare: true,
        xrefSources: [{
          file: { id: 'child-file', name: 'child.dwg', size: 4, lastModified: 1 },
          data: new ArrayBuffer(4),
        }],
      },
    }, {
      emitPreflight: vi.fn(),
      waitForDecision: async () => ({
        decision: 'full', annotationScaleId: '500', spatialFilterEnabled: false,
      }),
    }, {
      parse,
      analyze: () => report(true),
      filter,
      normalize: vi.fn(),
      inspectXrefs: (model) => model === root ? [declaration] : [],
      mergeXref,
      spatialFilter,
    });

    expect(parse.mock.calls.map(([data]) => data.byteLength)).toEqual([12, 4]);
    expect(mergeXref).toHaveBeenCalledWith(root, declaration, child);
    expect(spatialFilter).toHaveBeenCalledOnce();
    expect(filter).toHaveBeenCalledWith(merged, FULL_PROFILE);
    expect(result.annotationScale).toMatchObject({ mode: 'manual', selectedScaleId: '500' });
    expect(result.stats).toMatchObject({
      unknownEntityCount: 5,
      externalReferenceCount: 1,
      spatialFilter: { enabled: false },
      annotationScale: { selectedScaleId: '500' },
    });
  });
});
