import type { CadDocument, CadEntity } from '@flyfish-dev/cad-viewer';
import { describe, expect, it } from 'vitest';
import {
  LUXEMBOURG_SPATIAL_FILTER_METADATA,
  classifyAabbAgainstBufferedPolygon,
  classifyAabbAgainstLuxembourg,
  filterCadDocumentToLuxembourg,
} from './luxembourgSpatialFilter';

function line(handle: string, start: [number, number], end: [number, number], layer = '0'): CadEntity {
  return {
    type: 'LINE',
    kind: 'line',
    handle,
    layer,
    startPoint: { x: start[0], y: start[1] },
    endPoint: { x: end[0], y: end[1] },
  };
}

function documentWith(entities: CadEntity[], blocks: CadDocument['blocks'] = {}): CadDocument {
  return {
    format: 'dwg',
    layers: { '0': { name: '0' } },
    blocks,
    entities,
    metadata: {},
    warnings: [],
  };
}

describe('classifyAabbAgainstBufferedPolygon', () => {
  const square = [[[
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]]] as const;

  it('retains boxes inside, touching and within the round buffer', () => {
    expect(classifyAabbAgainstBufferedPolygon([2, 2, 3, 3], square, 1)).toBe('retained');
    expect(classifyAabbAgainstBufferedPolygon([10, 4, 12, 6], square, 0)).toBe('retained');
    expect(classifyAabbAgainstBufferedPolygon([10.5, 4, 11.5, 6], square, 1)).toBe('retained');
    expect(classifyAabbAgainstBufferedPolygon([10.5, 10.5, 10.6, 10.6], square, 1)).toBe('retained');
  });

  it('only classifies a complete box outside after the metric buffer', () => {
    expect(classifyAabbAgainstBufferedPolygon([11.01, 4, 12, 6], square, 1)).toBe('outside');
    expect(classifyAabbAgainstBufferedPolygon([10.8, 10.8, 11, 11], square, 1)).toBe('outside');
  });

  it('retains a polygon that is fully contained by a large AABB', () => {
    expect(classifyAabbAgainstBufferedPolygon([-5, -5, 15, 15], square, 0)).toBe('retained');
  });

  it('fails open for invalid extents and buffer settings', () => {
    expect(classifyAabbAgainstBufferedPolygon([Number.NaN, 0, 1, 1], square, 1)).toBe('unknown');
    expect(classifyAabbAgainstBufferedPolygon([0, 0, 1, 1], square, -1)).toBe('unknown');
  });
});

describe('Luxembourg boundary asset', () => {
  it('uses the official ACT source, EPSG:2169 and the exact configured tolerance', () => {
    expect(LUXEMBOURG_SPATIAL_FILTER_METADATA.coordinateReferenceSystem).toBe('EPSG:2169');
    expect(LUXEMBOURG_SPATIAL_FILTER_METADATA.bufferMeters).toBe(1_000);
    expect(LUXEMBOURG_SPATIAL_FILTER_METADATA.simplificationToleranceMeters).toBeLessThanOrEqual(10);
    expect(LUXEMBOURG_SPATIAL_FILTER_METADATA.source.authority).toContain('Administration du cadastre');
    expect(LUXEMBOURG_SPATIAL_FILTER_METADATA.source.license).toBe('CC0-1.0');
  });

  it('retains central Luxembourg coordinates and rejects distant coordinates', () => {
    expect(classifyAabbAgainstLuxembourg([79_990, 79_990, 80_010, 80_010])).toBe('retained');
    expect(classifyAabbAgainstLuxembourg([0, 0, 10, 10])).toBe('outside');
    expect(classifyAabbAgainstLuxembourg([Number.NaN, 0, 1, 1])).toBe('unknown');
  });
});

describe('filterCadDocumentToLuxembourg', () => {
  it('removes only roots whose complete AABB is demonstrably outside', () => {
    const inside = line('inside', [79_990, 79_990], [80_010, 80_010]);
    const outside = line('outside', [0, 0], [10, 10]);
    const crossing = line('crossing', [0, 80_000], [80_000, 80_000]);
    const unknown: CadEntity = { type: 'CUSTOM_ENTITY', kind: 'unsupported', handle: 'unknown' };
    const source = documentWith([inside, outside, crossing, unknown]);

    const result = filterCadDocumentToLuxembourg(source);

    expect(result.document.entities).toEqual([inside, crossing, unknown]);
    expect(result.report.removedEntityKeys).toEqual(['outside']);
    expect(result.report.unknownEntityKeys).toEqual(['unknown']);
    expect(result.report.removedRootEntityCount).toBe(1);
    expect(result.report.retainedRootEntityCount).toBe(3);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'invalid-extent', entityKey: 'unknown' }));
    expect(source.entities).toHaveLength(4);
  });

  it('uses conservative full-curve bounds instead of endpoints alone', () => {
    const circle: CadEntity = {
      type: 'CIRCLE',
      kind: 'circle',
      handle: 'large-circle',
      center: { x: 0, y: 0 },
      radius: 100_000,
    };
    const bulged: CadEntity = {
      type: 'LWPOLYLINE',
      kind: 'polyline',
      handle: 'bulged',
      vertices: [
        { x: 0, y: 0, bulge: 0.00003 },
        { x: 10, y: 0 },
      ],
    };

    const result = filterCadDocumentToLuxembourg(documentWith([circle, bulged]));

    expect(result.document.entities).toEqual([circle, bulged]);
    expect(result.report.removedRootEntityCount).toBe(0);
  });

  it('applies nested INSERT transforms and prunes blocks that become unreachable', () => {
    const blockLine = line('block-line', [0, 0], [10, 0]);
    const insideInsert: CadEntity = {
      type: 'INSERT',
      kind: 'insert',
      handle: 'inside-insert',
      blockName: 'MARKER',
      insertionPoint: { x: 80_000, y: 80_000 },
      scale: { x: 2, y: 3 },
      rotation: Math.PI / 4,
    };
    const outsideInsert: CadEntity = {
      ...insideInsert,
      handle: 'outside-insert',
      insertionPoint: { x: 0, y: 0 },
    };
    const source = documentWith([insideInsert, outsideInsert], {
      MARKER: { name: 'MARKER', basePoint: { x: 5, y: 0 }, entities: [blockLine] },
      UNUSED: { name: 'UNUSED', entities: [line('unused-line', [0, 0], [1, 1])] },
    });

    const result = filterCadDocumentToLuxembourg(source);

    expect(result.document.entities).toEqual([insideInsert]);
    expect(Object.keys(result.document.blocks)).toEqual(['MARKER']);
    expect(result.report.removedEntityKeys).toEqual(['outside-insert']);
    expect(result.report.removedBlockNames).toEqual(['UNUSED']);
  });

  it('uses extreme MINSERT rows and columns without expanding every instance', () => {
    const insert: CadEntity = {
      type: 'INSERT',
      kind: 'insert',
      handle: 'array',
      blockName: 'POINTS',
      insertionPoint: { x: 79_000, y: 79_000 },
      insertColumnCount: 1_000,
      insertColumnSpacing: 100,
      insertRowCount: 1_000,
      insertRowSpacing: 100,
      rotation: Math.PI / 6,
    };
    const source = documentWith([insert], {
      POINTS: { name: 'POINTS', entities: [line('point-line', [0, 0], [1, 1])] },
    });

    const result = filterCadDocumentToLuxembourg(source);

    expect(result.document.entities).toEqual([insert]);
    expect(result.report.unknownRootEntityCount).toBe(0);
  });

  it('retains missing and cyclic block references with fail-open warnings', () => {
    const missing: CadEntity = {
      type: 'INSERT',
      kind: 'insert',
      handle: 'missing',
      blockName: 'NOT_THERE',
      insertionPoint: { x: 0, y: 0 },
    };
    const cycleRoot: CadEntity = {
      type: 'INSERT',
      kind: 'insert',
      handle: 'cycle-root',
      blockName: 'A',
      insertionPoint: { x: 0, y: 0 },
    };
    const source = documentWith([missing, cycleRoot], {
      A: { name: 'A', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'B' }] },
      B: { name: 'B', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'A' }] },
    });

    const result = filterCadDocumentToLuxembourg(source);

    expect(result.document.entities).toEqual([missing, cycleRoot]);
    expect(result.report.unknownEntityKeys).toEqual(['missing', 'cycle-root']);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'missing-block', entityKey: 'missing' }));
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'cyclic-block', entityKey: 'cycle-root' }));
  });

  it('returns the original object graph when disabled', () => {
    const source = documentWith([line('outside', [0, 0], [1, 1])]);
    const result = filterCadDocumentToLuxembourg(source, { enabled: false });
    expect(result.document).toBe(source);
    expect(result.report.enabled).toBe(false);
    expect(result.report.removedRootEntityCount).toBe(0);
  });
});
