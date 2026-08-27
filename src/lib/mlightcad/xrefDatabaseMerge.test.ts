import { describe, expect, it } from 'vitest';
import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import type { DwgExternalReferenceDeclaration } from '../cad/xrefBundle';
import { mergeMlightXrefDatabase } from './xrefDatabaseMerge';

function database(init: {
  blocks: Array<Record<string, unknown>>;
  layers?: Array<Record<string, unknown>>;
  styles?: Array<Record<string, unknown>>;
}): DwgDatabase {
  return {
    header: { ACADVER: 'AC1032' }, entities: [], classes: [],
    tables: {
      BLOCK_RECORD: { entries: init.blocks },
      LAYER: { entries: init.layers ?? [] },
      STYLE: { entries: init.styles ?? [] },
      LTYPE: { entries: [] }, DIMSTYLE: { entries: [] }, APPID: { entries: [] },
      VPORT: { entries: [] },
    },
    objects: {
      DICTIONARY: [], IMAGEDEF: [], LAYER_FILTER: [], LAYER_INDEX: [], LAYOUT: [],
      MLEADERSTYLE: [], SPATIAL_FILTER: [], XRECORD: [],
    },
  } as unknown as DwgDatabase;
}

const declaration: DwgExternalReferenceDeclaration = {
  id: 'X1:road', name: 'Road', normalizedName: 'road', sourcePath: 'xrefs/Road.dwg',
  kind: 'attachment', hasEmbeddedEntities: false,
};

describe('MLightCAD XRef database merge', () => {
  it('fills the XRef root block and namespaces dependent tables and blocks', () => {
    const parentInsert = {
      type: 'INSERT', handle: 'E1', ownerBlockRecordSoftId: 'MS', layer: 'SITE',
      name: 'Road', xScale: 1, yScale: 1, zScale: 1, rotation: 0,
      rowCount: 1, columnCount: 1, rowSpacing: 0, columnSpacing: 0, attribs: [],
    } as unknown as DwgEntity;
    const parent = database({
      blocks: [
        { handle: 'MS', name: '*Model_Space', flags: 0, entities: [parentInsert] },
        { handle: 'X1', name: 'Road', flags: 4, entities: [] },
      ],
      layers: [{ handle: 'L0', name: 'SITE' }],
    });
    parent.entities = [parentInsert];
    const childLine = {
      type: 'LINE', handle: '1A', ownerBlockRecordSoftId: 'CMS', layer: '0',
      startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 }, lineType: 'Continuous',
    } as unknown as DwgEntity;
    const childInsert = {
      type: 'INSERT', handle: '1B', ownerBlockRecordSoftId: 'CMS', layer: 'DETAIL',
      name: 'Symbol', xScale: 1, yScale: 1, zScale: 1, rotation: 0,
      rowCount: 1, columnCount: 1, rowSpacing: 0, columnSpacing: 0, attribs: [],
    } as unknown as DwgEntity;
    const child = database({
      blocks: [
        { handle: 'CMS', name: '*Model_Space', flags: 0, entities: [childLine, childInsert] },
        { handle: 'CB', name: 'Symbol', flags: 0, entities: [childLine] },
        { handle: 'PS', name: '*Paper_Space', flags: 0, entities: [childLine] },
      ],
      layers: [{ handle: 'CL0', name: '0' }, { handle: 'CL1', name: 'DETAIL' }],
      styles: [{ handle: 'CS', name: 'STANDARD' }],
    });
    child.entities = [childLine, childInsert];

    const merged = mergeMlightXrefDatabase(parent, declaration, child);
    const road = merged.tables.BLOCK_RECORD.entries.find((entry) => entry.name === 'Road');

    expect(road?.entities).toEqual([
      expect.objectContaining({ handle: 'Road:1A', ownerBlockRecordSoftId: 'X1', layer: 'Road|0', lineType: 'Road|Continuous' }),
      expect.objectContaining({ handle: 'Road:1B', ownerBlockRecordSoftId: 'X1', layer: 'Road|DETAIL', name: 'Road|Symbol' }),
    ]);
    expect(merged.tables.BLOCK_RECORD.entries.map((entry) => entry.name)).toEqual([
      '*Model_Space', 'Road', 'Road|Symbol',
    ]);
    expect(merged.tables.LAYER.entries.map((entry) => entry.name)).toEqual([
      'SITE', 'Road|0', 'Road|DETAIL',
    ]);
    expect(merged.tables.STYLE.entries.map((entry) => entry.name)).toEqual(['Road|STANDARD']);
    expect(parent.tables.BLOCK_RECORD.entries[1].entities).toEqual([]);
    expect(child.tables.BLOCK_RECORD.entries[0].entities[0].handle).toBe('1A');
  });

  it('rejects a merge when the authored XRef block cannot be identified', () => {
    const parent = database({ blocks: [{ handle: 'MS', name: '*Model_Space', flags: 0, entities: [] }] });
    const child = database({ blocks: [{ handle: 'CMS', name: '*Model_Space', flags: 0, entities: [] }] });
    expect(() => mergeMlightXrefDatabase(parent, declaration, child))
      .toThrow('MLIGHTCAD_XREF_BLOCK_NOT_FOUND:Road');
  });
});
