import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import { describe, expect, it } from 'vitest';
import { filterMlightDwgDatabaseToLuxembourg } from './mlightLuxembourgSpatialFilter';

function line(handle: string, x: number, y: number): DwgEntity {
  return {
    type: 'LINE',
    handle,
    ownerBlockRecordSoftId: 'model',
    layer: '0',
    transparencyType: 0,
    startPoint: { x, y, z: 0 },
    endPoint: { x: x + 1, y: y + 1, z: 0 },
  } as DwgEntity;
}

function database(rootEntities: DwgEntity[]): DwgDatabase {
  return {
    header: {},
    entities: rootEntities,
    tables: {
      LAYER: {
        entries: [{
          name: '0',
          colorIndex: 7,
          frozen: false,
          locked: false,
          off: false,
          plotFlag: 1,
        }],
      },
      BLOCK_RECORD: {
        entries: [
          { name: '*Model_Space', handle: 'model', flags: 0, entities: rootEntities },
          { name: 'UNUSED', handle: 'unused', flags: 0, entities: [line('block-line', 0, 0)] },
          { name: '*Paper_Space', handle: 'paper', flags: 0, entities: [line('paper-line', 0, 0)] },
        ],
      },
    },
    objects: {},
  } as unknown as DwgDatabase;
}

describe('filterMlightDwgDatabaseToLuxembourg', () => {
  it('projects the shared fail-open filter back to the raw model without cloning retained entities', () => {
    const inside = line('inside', 80_000, 80_000);
    const outside = line('outside', 0, 0);
    const source = database([inside, outside]);

    const result = filterMlightDwgDatabaseToLuxembourg(source);

    expect(result.model).not.toBe(source);
    expect(result.model.entities).toEqual([inside]);
    expect(result.model.entities[0]).toBe(inside);
    expect(result.model.tables.BLOCK_RECORD.entries.map((entry) => entry.name)).toEqual(['*Model_Space']);
    expect(result.report.removedEntityKeys).toEqual(['outside']);
    expect(source.entities).toEqual([inside, outside]);
  });

  it('returns the original raw model when the filter is disabled', () => {
    const source = database([line('outside', 0, 0)]);
    const result = filterMlightDwgDatabaseToLuxembourg(source, { enabled: false });
    expect(result.model).toBe(source);
    expect(result.report.enabled).toBe(false);
  });
});
