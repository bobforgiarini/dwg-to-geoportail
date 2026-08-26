import { describe, expect, it } from 'vitest';
import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import type { CadLoadProfile } from '../cad/preflightTypes';
import {
  adaptMlightDwgDatabase,
  analyzeMlightDwgDatabase,
  filterMlightDwgDatabase,
} from './dwgPreparation';

function line(handle: string, layer = '0', extra: Record<string, unknown> = {}): DwgEntity {
  return {
    type: 'LINE', handle, layer, ownerBlockRecordSoftId: '', transparencyType: 0, ...extra,
  } as unknown as DwgEntity;
}

function insert(handle: string, name: string, layer = '0'): DwgEntity {
  return {
    type: 'INSERT',
    handle,
    layer,
    name,
    ownerBlockRecordSoftId: '',
    transparencyType: 0,
    insertionPoint: { x: 0, y: 0, z: 0 },
    xScale: 1,
    yScale: 1,
    zScale: 1,
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    extrusionDirection: { x: 0, y: 0, z: 1 },
    attribs: [],
  } as unknown as DwgEntity;
}

function database(options: {
  entities?: DwgEntity[];
  blocks?: Array<{ name: string; flags?: number; entities: DwgEntity[] }>;
  layers?: Array<{ name: string; off?: boolean; frozen?: boolean; plotFlag?: number }>;
} = {}): DwgDatabase {
  const blockEntries = [
    { name: '*Model_Space', flags: 0, entities: options.entities ?? [], basePoint: { x: 0, y: 0, z: 0 } },
    ...(options.blocks ?? []).map((block) => ({
      ...block,
      flags: block.flags ?? 0,
      basePoint: { x: 0, y: 0, z: 0 },
    })),
  ];
  const layerEntries = (options.layers ?? [{ name: '0' }]).map((layer) => ({
    name: layer.name,
    off: layer.off ?? false,
    frozen: layer.frozen ?? false,
    frozenInNew: false,
    locked: false,
    plotFlag: layer.plotFlag ?? 1,
    colorIndex: 7,
    color: 0xffffff,
    transparency: 0,
    lineType: 'Continuous',
    lineweight: -1,
  }));
  return {
    header: { ACADVER: 'AC1032' },
    entities: options.entities ?? [],
    tables: {
      BLOCK_RECORD: { entries: blockEntries },
      LAYER: { entries: layerEntries },
    },
    objects: {
      DICTIONARY: [], IMAGEDEF: [{ handle: 'image' }], LAYER_FILTER: [], LAYER_INDEX: [],
      LAYOUT: [], MLEADERSTYLE: [], SPATIAL_FILTER: [], XRECORD: [],
    },
    classes: [],
  } as unknown as DwgDatabase;
}

function filteredProfile(init: Partial<CadLoadProfile> = {}): CadLoadProfile {
  return {
    mode: 'filtered',
    hiddenLayerIds: [],
    hiddenBlockNames: [],
    hiddenEntityCategories: [],
    ...init,
  };
}

describe('MLightCAD DWG preparation', () => {
  it('adapts block aliases and reports complexity without treating file size as a hard gate', () => {
    const model = database({
      entities: [insert('I-OUTER', 'OUTER', 'SITE')],
      blocks: [
        { name: 'INNER', entities: [line('L-1'), line('T-1', 'TEXT', { type: 'TEXT' })] },
        { name: 'OUTER', entities: [insert('I-INNER', 'INNER')] },
      ],
      layers: [{ name: '0' }, { name: 'SITE' }, { name: 'TEXT', plotFlag: 0 }],
    });

    const document = adaptMlightDwgDatabase(model, 'large-but-simple.dwg');
    const report = analyzeMlightDwgDatabase(model, {
      file: { name: 'large-but-simple.dwg', size: 80 * 1024 * 1024 },
      device: { mobile: false, memoryGiB: 16 },
    });

    expect(document.entities[0]).toMatchObject({ kind: 'insert', blockName: 'OUTER' });
    expect(report.documentVersion).toBe('AC1032');
    expect(report.file.size).toBe(80 * 1024 * 1024);
    expect(report.blocks.map((block) => block.name)).toEqual(['INNER', 'OUTER']);
    expect(report.blocks.find((block) => block.name === 'OUTER')?.recursiveEntityCount).toBe(2);
    expect(report.risk.shouldPrepare).toBe(false);
    expect(report.recommendedProfile.hiddenLayerIds).toContain('TEXT');
  });

  it('removes a selected nested block and unreachable definitions before database conversion', () => {
    const model = database({
      entities: [insert('I-OUTER', 'OUTER')],
      blocks: [
        { name: 'INNER', entities: [line('INNER-LINE')] },
        { name: 'OUTER', entities: [insert('I-INNER', 'INNER'), line('OUTER-LINE')] },
        { name: 'UNUSED', entities: [line('UNUSED-LINE')] },
      ],
    });

    const filtered = filterMlightDwgDatabase(model, filteredProfile({ hiddenBlockNames: ['inner'] }));
    const names = filtered.model.tables.BLOCK_RECORD.entries.map((block) => block.name);
    const outer = filtered.model.tables.BLOCK_RECORD.entries.find((block) => block.name === 'OUTER');

    expect(names).toContain('*Model_Space');
    expect(names).toContain('OUTER');
    expect(names).not.toContain('INNER');
    expect(names).not.toContain('UNUSED');
    expect(outer?.entities.map((entity) => entity.handle)).toEqual(['OUTER-LINE']);
    expect(model.tables.BLOCK_RECORD.entries.find((block) => block.name === 'OUTER')?.entities).toHaveLength(2);
  });

  it('respects layer 0 inheritance while removing authored hidden layers and their INSERTs', () => {
    const model = database({
      entities: [insert('HIDDEN-INSERT', 'SHARED', 'HIDDEN'), insert('VISIBLE-INSERT', 'SHARED', 'VISIBLE')],
      blocks: [{ name: 'SHARED', entities: [line('INHERITED', '0'), line('AUTHORED-HIDDEN', 'HIDDEN')] }],
      layers: [{ name: '0' }, { name: 'HIDDEN', off: true }, { name: 'VISIBLE' }],
    });

    const filtered = filterMlightDwgDatabase(model, filteredProfile({ hiddenLayerIds: ['HIDDEN'] }));
    const shared = filtered.model.tables.BLOCK_RECORD.entries.find((block) => block.name === 'SHARED');

    expect(filtered.model.entities.map((entity) => entity.handle)).toEqual(['VISIBLE-INSERT']);
    expect(filtered.model.tables.BLOCK_RECORD.entries.find((block) => block.name === '*Model_Space')?.entities
      .map((entity) => entity.handle)).toEqual(['VISIBLE-INSERT']);
    expect(shared?.entities.map((entity) => entity.handle)).toEqual(['INHERITED']);
  });

  it('drops paper geometry and image definitions only for the corresponding recommended groups', () => {
    const model = database({
      entities: [line('MODEL'), line('PAPER', '0', { isInPaperSpace: true }), line('IMAGE', '0', { type: 'IMAGE' })],
      blocks: [{ name: '*Paper_Space', entities: [line('LAYOUT')] }],
    });
    const filtered = filterMlightDwgDatabase(model, filteredProfile({
      hiddenEntityCategories: ['paper-space', 'image'],
    }));

    expect(filtered.model.entities.map((entity) => entity.handle)).toEqual(['MODEL']);
    expect(filtered.model.objects.IMAGEDEF).toEqual([]);
    expect(filtered.model.tables.BLOCK_RECORD.entries.find((block) => block.name === '*Paper_Space')?.entities).toEqual([]);
  });

  it('reports paper layouts and keeps even a full load model-space-only', () => {
    const model = database({
      entities: [line('MODEL'), line('PAPER-FLAGGED', '0', { isInPaperSpace: true })],
      blocks: [{ name: '*Paper_Space0', entities: [line('LAYOUT-1'), line('LAYOUT-2')] }],
    });

    const report = analyzeMlightDwgDatabase(model);
    const prepared = filterMlightDwgDatabase(model, {
      mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [],
    });

    expect(report.entityCounts.paperSpaceEntities).toBe(3);
    expect(report.recommendedProfile.hiddenEntityCategories).toContain('paper-space');
    expect(prepared.model.entities.map((entity) => entity.handle)).toEqual(['MODEL']);
    expect(prepared.model.tables.BLOCK_RECORD.entries.find((block) => block.name === '*Paper_Space0')?.entities).toEqual([]);
  });
});
