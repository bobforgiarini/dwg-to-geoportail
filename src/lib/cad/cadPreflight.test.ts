import { describe, expect, it } from 'vitest';
import type { CadDocument, CadEntity } from '@flyfish-dev/cad-viewer';
import { analyzeCadDocument } from './cadPreflight';
import { filterCadDocument } from './filterCadDocument';
import type { CadLoadProfile } from './preflightTypes';

function line(layer = '0'): CadEntity {
  return { type: 'LINE', kind: 'line', layer, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } };
}

function documentWith(init: Partial<CadDocument> = {}): CadDocument {
  return {
    format: 'dwg',
    sourceName: 'fixture.dwg',
    header: { $ACADVER: 'AC1027' },
    layers: {
      '0': { name: '0' },
      SITE: { name: 'Site' },
      HIDDEN: { name: 'Hidden', isVisible: false },
      FROZEN: { name: 'Frozen', isFrozen: true },
      NOPLOT: { name: 'No plot', raw: { plot: false } },
    },
    blocks: {},
    entities: [],
    metadata: {},
    warnings: [],
    ...init,
  };
}

const filteredProfile = (overrides: Partial<CadLoadProfile> = {}): CadLoadProfile => ({
  mode: 'filtered',
  hiddenLayerIds: [],
  hiddenBlockNames: [],
  hiddenEntityCategories: [],
  ...overrides,
});

describe('DWG preflight analysis', () => {
  it('builds reachable named, anonymous and xref block metrics from model-space instances', () => {
    const document = documentWith({
      blocks: {
        bench: { name: 'Bench', entities: [
          line('0'),
          { type: 'MTEXT', kind: 'text', layer: '0', text: 'Seat' },
          { type: 'INSERT', kind: 'insert', layer: '0', blockName: '*U1' },
        ] },
        '*U1': { name: '*U1', entities: [
          { type: 'CIRCLE', kind: 'circle', layer: '0', center: { x: 0, y: 0 }, radius: 1 },
          { type: 'CIRCLE', kind: 'circle', layer: '0', center: { x: 2, y: 0 }, radius: 1 },
        ] },
        xref: { name: 'pipes|model', raw: { isXref: true }, entities: [line('0')] },
        unused: { name: 'Unused', entities: [line()] },
      },
      entities: [
        { type: 'INSERT', kind: 'insert', layer: 'SITE', blockName: 'bench', insertRowCount: 2, insertColumnCount: 1 },
        { type: 'INSERT', kind: 'insert', layer: 'SITE', blockName: 'xref' },
        line('HIDDEN'),
        { type: 'TEXT', kind: 'text', layer: 'SITE', isInPaperSpace: true, text: 'Layout' },
      ],
      pages: [{ index: 0, width: 100, height: 100, entities: [line()] }],
    });

    const report = analyzeCadDocument(document, {
      file: { name: 'plan.dwg', size: 25_000_000, lastModified: 42 },
      device: { mobile: true, memoryGiB: 4 },
    });

    expect(report.file).toEqual({ name: 'plan.dwg', size: 25_000_000, lastModified: 42 });
    expect(report.documentVersion).toBe('AC1027');
    expect(report.definedBlockCount).toBe(4);
    expect(report.reachableBlockCount).toBe(3);
    expect(report.blocks.map((block) => [block.name, block.kind])).toEqual([
      ['Bench', 'named'],
      ['pipes|model', 'xref'],
      ['*U1', 'anonymous'],
    ]);
    expect(report.blocks.find((block) => block.id === 'bench')).toMatchObject({
      instanceCount: 2,
      directInstanceCount: 2,
      directEntityCount: 2,
      recursiveEntityCount: 4,
      textCount: 1,
      primaryLayer: 'SITE',
      isNested: false,
    });
    expect(report.blocks.find((block) => block.id === '*U1')).toMatchObject({
      instanceCount: 2,
      directInstanceCount: 0,
      isNested: true,
      primaryLayer: 'SITE',
    });
    expect(report.entityCounts).toMatchObject({
      modelEntities: 10,
      insertInstances: 5,
      texts: 2,
      paperSpaceEntities: 2,
      xrefs: 1,
    });
    expect(report.recommendedProfile.hiddenLayerIds).toEqual(['FROZEN', 'HIDDEN', 'NOPLOT']);
    expect(report.recommendedProfile.hiddenEntityCategories).toEqual(['paper-space']);
    expect(report.recommendedProfile.hiddenBlockNames).toEqual([]);
    expect(report.schemaVersion).toBe(2);
    expect(report.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'layer:HIDDEN', reason: 'layer-off', label: 'Hidden' }),
      expect.objectContaining({ id: 'layer:FROZEN', reason: 'layer-frozen', label: 'Frozen' }),
      expect.objectContaining({ id: 'layer:NOPLOT', reason: 'layer-no-plot', label: 'No plot' }),
      expect.objectContaining({ id: 'category:paper-space', policy: 'required', affectedEntityCount: 2 }),
    ]));
    expect(report.impact).toMatchObject({
      before: { entityCount: 12 },
      recommended: { entityCount: 9 },
    });
    // Size alone is metadata, not a mobile hard block or preparation trigger.
    expect(report.risk.shouldPrepare).toBe(false);
  });

  it('reports cycles and missing references without expanding forever', () => {
    const report = analyzeCadDocument(documentWith({
      blocks: {
        A: { name: 'A', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'B' }] },
        B: { name: 'B', entities: [line(), { type: 'INSERT', kind: 'insert', blockName: 'A' }] },
      },
      entities: [
        { type: 'INSERT', kind: 'insert', blockName: 'A' },
        { type: 'INSERT', kind: 'insert', blockName: 'missing' },
      ],
    }));

    expect(report.blocks.map((block) => block.name)).toEqual(['A', 'B']);
    expect(report.blocks.every((block) => block.hasCycle)).toBe(true);
    expect(report.warnings.some((warning) => warning.code === 'cyclic-block')).toBe(true);
    expect(report.warnings.some((warning) => warning.code === 'missing-block' && warning.blockName === 'missing')).toBe(true);
  });

  it('recommends only unresolved XRefs while retaining resolved references', () => {
    const report = analyzeCadDocument(documentWith({
      blocks: {
        resolved: { name: 'resolved|model', raw: { isXref: true }, entities: [line()] },
        unresolved: { name: 'missing|model', raw: { isXref: true }, entities: [] },
      },
      entities: [
        { type: 'INSERT', kind: 'insert', blockName: 'resolved' },
        { type: 'INSERT', kind: 'insert', blockName: 'unresolved' },
      ],
    }));

    expect(report.recommendedProfile.hiddenBlockNames).toEqual(['missing|model']);
    expect(report.recommendedProfile.hiddenEntityCategories).not.toContain('xref');
  });

  it('recommends preparation from expanded complexity while never using file size as a gate', () => {
    const complex = analyzeCadDocument(documentWith({
      blocks: { symbol: { name: 'symbol', entities: [{
        type: 'HATCH', kind: 'hatch', loops: [{ vertices: Array.from({ length: 400 }, (_, index) => ({ x: index, y: index })) }],
      }] } },
      entities: [{
        type: 'INSERT', kind: 'insert', blockName: 'symbol', insertRowCount: 300, insertColumnCount: 300,
      }],
    }), { device: { mobile: true, memoryGiB: 2 }, file: { size: 2_000_000 } });
    expect(complex.risk.level).toBe('high');
    expect(complex.risk.shouldPrepare).toBe(true);
    expect(complex.risk.reasons).toContain('block-expansion');
    expect(complex.entityCounts.hatches).toBe(90_000);

    const largeButSimple = analyzeCadDocument(documentWith({ entities: [line('SITE')] }), {
      device: { mobile: true, memoryGiB: 1 },
      file: { size: 500_000_000 },
    });
    expect(largeButSimple.risk).toMatchObject({ level: 'low', shouldPrepare: false });

    const nearBudgetEntities = Array.from({ length: 38_000 }, () => line('SITE'));
    const smallNearBudget = analyzeCadDocument(documentWith({ entities: nearBudgetEntities }), {
      device: { mobile: true }, file: { size: 2_000_000 },
    });
    const largeNearBudget = analyzeCadDocument(documentWith({ entities: nearBudgetEntities }), {
      device: { mobile: true }, file: { size: 100_000_000 },
    });
    expect(smallNearBudget.risk.shouldPrepare).toBe(false);
    expect(largeNearBudget.risk.shouldPrepare).toBe(true);
    expect(largeNearBudget.risk.reasons).toContain('file-size-pressure');
  });

  it('includes LibreDWG entities that could not be converted as removable proxy cost', () => {
    const report = analyzeCadDocument(documentWith({ entities: [line('SITE')] }), {
      unknownEntityCount: 7,
    });

    expect(report.entityCounts).toMatchObject({ modelEntities: 8, proxyObjects: 7 });
    expect(report.risk.estimatedRenderCost).toBeGreaterThanOrEqual(36);
    expect(report.recommendedProfile.hiddenEntityCategories).toContain('proxy');
  });

  it('carries annotation and local XRef diagnostics into schema 2', () => {
    const report = analyzeCadDocument(documentWith(), {
      annotationScale: {
        mode: 'saved', savedScaleId: null, selectedScaleId: null,
        availableScales: [], contextObjectCount: 3, failOpen: true,
      },
      externalReferences: [{
        id: 'root:xref', name: 'XRef', normalizedName: 'xref', sourcePath: null,
        kind: 'attachment', status: 'missing', parentFileId: 'root', resolvedFileId: null,
        candidateFileIds: [], depth: 0, path: ['root', 'XRef'],
      }],
    });

    expect(report.annotationScale?.contextObjectCount).toBe(3);
    expect(report.externalReferences?.[0].status).toBe('missing');
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'annotation-scale-unresolved' }),
      expect.objectContaining({ code: 'xref-missing', blockName: 'XRef' }),
    ]));
  });
});

describe('CAD document filtering', () => {
  it('removes a selected nested block, prunes unreachable definitions and preserves INSERT transforms', () => {
    const insertion: CadEntity = {
      type: 'INSERT', kind: 'insert', blockName: 'outer', layer: 'SITE',
      insertionPoint: { x: 80_000, y: 100_000 }, rotation: 0.4, scale: { x: 2, y: 3 },
    };
    const document = documentWith({
      blocks: {
        outer: { name: 'outer', entities: [
          line('0'),
          { type: 'INSERT', kind: 'insert', blockName: 'inner', layer: '0', insertionPoint: { x: 10, y: 20 }, rotation: 1.2 },
        ] },
        inner: { name: 'inner', entities: [line('0')] },
        unrelated: { name: 'unrelated', entities: [line()] },
      },
      entities: [insertion],
    });

    const result = filterCadDocument(document, filteredProfile({ hiddenBlockNames: ['INNER'] }));

    expect(result.document.entities[0]).toEqual(insertion);
    expect(result.document.blocks.outer.entities).toEqual([line('0')]);
    expect(result.remainingBlockNames).toEqual(['outer']);
    expect(result.removedBlockNames).toEqual(['inner', 'unrelated']);
    expect(document.blocks.outer.entities).toHaveLength(2);
  });

  it('filters explicit hidden layers but keeps Layer 0 contents for INSERT inheritance', () => {
    const document = documentWith({
      blocks: {
        outer: { name: 'outer', entities: [
          { ...line('0'), lineType: 'ByBlock', color: 'ByBlock' },
          line('HIDDEN'),
        ] },
      },
      entities: [
        { type: 'INSERT', kind: 'insert', blockName: 'outer', layer: 'SITE' },
        line('HIDDEN'),
      ],
    });

    const result = filterCadDocument(document, filteredProfile({ hiddenLayerIds: ['Hidden'] }));

    expect(result.document.entities).toHaveLength(1);
    expect(result.document.blocks.outer.entities).toHaveLength(1);
    expect(result.document.blocks.outer.entities[0]).toMatchObject({ layer: '0', lineType: 'ByBlock', color: 'ByBlock' });
    expect(result.document.layers.HIDDEN.isVisible).toBe(false);
  });

  it('filters paper space, xrefs, 3D and text attributes before pruning blocks', () => {
    const document = documentWith({
      blocks: {
        xref: { name: 'network|model', raw: { isExternalReference: true }, entities: [line()] },
        symbol: { name: 'symbol', entities: [
          line(),
          { type: 'LINE', kind: 'line', startPoint: { x: 0, y: 0, z: 4 }, endPoint: { x: 1, y: 1 } },
        ] },
      },
      entities: [
        { type: 'INSERT', kind: 'insert', blockName: 'xref' },
        { type: 'INSERT', kind: 'insert', blockName: 'symbol', attribs: [{ type: 'ATTRIB', kind: 'text', text: 'A' }] },
        { type: 'TEXT', kind: 'text', isInPaperSpace: true, text: 'Layout' },
      ],
      pages: [{ index: 0, width: 10, height: 10, entities: [line()] }],
    });

    const result = filterCadDocument(document, filteredProfile({
      hiddenEntityCategories: ['paper-space', 'xref', '3d', 'text'],
    }));

    expect(result.document.entities).toHaveLength(1);
    expect(result.document.entities[0].attribs).toEqual([]);
    expect(result.document.blocks.symbol.entities).toEqual([line()]);
    expect(result.document.blocks.xref).toBeUndefined();
    expect(result.document.pages).toBeUndefined();
  });

  it('retains reachable cyclic definitions and returns a diagnostic', () => {
    const document = documentWith({
      blocks: {
        A: { name: 'A', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'B' }] },
        B: { name: 'B', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'A' }] },
      },
      entities: [{ type: 'INSERT', kind: 'insert', blockName: 'A' }],
    });
    const result = filterCadDocument(document, filteredProfile());
    expect(result.remainingBlockNames).toEqual(['A', 'B']);
    expect(result.warnings.some((warning) => warning.code === 'cyclic-block')).toBe(true);
  });

  it('returns the source document unchanged for a full load profile', () => {
    const document = documentWith({ entities: [line()] });
    const result = filterCadDocument(document, {
      mode: 'full', hiddenLayerIds: ['0'], hiddenBlockNames: ['anything'], hiddenEntityCategories: ['text'],
    });
    expect(result.document).toBe(document);
    expect(result.removedEntityCount).toBe(0);
  });
});
