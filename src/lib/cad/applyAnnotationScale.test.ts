import { describe, expect, it } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import {
  applyAnnotationScaleSelectionToDatabase,
  annotationScaleLayerNamesToHide,
  parseAnnotationScaleLayerName,
} from './applyAnnotationScale';
import type { CadAnnotationScaleSelection } from './preflightTypes';

const selection: CadAnnotationScaleSelection = {
  mode: 'manual', savedScaleId: '100', selectedScaleId: '500', contextObjectCount: 2, failOpen: true,
  availableScales: [
    { id: '100', name: '1:100', paperUnits: 1, drawingUnits: 100, ratio: 100, source: 'saved', isDefault: true },
    { id: '500', name: '1:500', paperUnits: 1, drawingUnits: 500, ratio: 500, source: 'context', isDefault: false },
  ],
};

function database(entities: Record<string, unknown>[]): DwgDatabase {
  return {
    entities,
    tables: { BLOCK_RECORD: { entries: [] }, LAYER: { entries: [] } },
  } as unknown as DwgDatabase;
}

describe('annotation scale database application', () => {
  it('keeps the MLeader representation closest to the chosen scale', () => {
    const common = {
      type: 'MULTILEADER', layer: 'TEXT', textContent: '6117-049', annotativeScaleEnabled: true,
      leaderSections: [{ leaderLines: [{ vertices: [{ x: 80000, y: 90000 }] }] }],
    };
    const model = database([
      { ...common, handle: 'A', contentScale: 100 },
      { ...common, handle: 'B', contentScale: 500 },
      { type: 'LINE', handle: 'C' },
    ]);

    applyAnnotationScaleSelectionToDatabase(model, selection);
    expect((model.entities as unknown as Array<Record<string, unknown>>).map((entity) => entity.handle)).toEqual(['B', 'C']);
  });

  it('sets the selected ratio on attributes without pruning ambiguous annotations', () => {
    const model = database([
      { type: 'ATTRIB', annotationScale: 1 },
      { type: 'MULTILEADER', textContent: 'same', contentScale: 100, annotativeScaleEnabled: true },
      { type: 'MULTILEADER', textContent: 'same', contentScale: 500, annotativeScaleEnabled: true },
    ]);
    applyAnnotationScaleSelectionToDatabase(model, selection);
    expect((model.entities[0] as unknown as Record<string, unknown>).annotationScale).toBe(500);
    expect(model.entities).toHaveLength(3);
  });

  it('parses only explicit scale-layer suffixes with dot, comma and optional index', () => {
    expect(parseAnnotationScaleLayerName('BEST_SCHACHTNUMMER @ 0.5')).toEqual({
      baseName: 'BEST_SCHACHTNUMMER', factor: 0.5,
    });
    expect(parseAnnotationScaleLayerName('BEST_SCHACHTNUMMER @ 0,25 (2)')).toEqual({
      baseName: 'BEST_SCHACHTNUMMER', factor: 0.25,
    });
    expect(parseAnnotationScaleLayerName('mail@example.com')).toBeNull();
    expect(parseAnnotationScaleLayerName('BEST @ overview')).toBeNull();
  });

  it('returns every non-selected explicit scale layer for the shared model filter', () => {
    const model = database([
      { type: 'MULTILEADER', handle: 'A', layer: 'BEST_DATA @ 1 (1)' },
      { type: 'TEXT', handle: 'B', layer: 'BEST_DATA @ 0.5 (2)' },
      { type: 'DIMENSION_LINEAR', handle: 'C', layer: 'BEST_DATA @ 0.25' },
      { type: 'TEXT', handle: 'D', layer: 'SINGLE @ 1' },
      { type: 'LINE', handle: 'E', layer: 'UNMARKED' },
      {
        type: 'INSERT', handle: 'F', layer: 'UNMARKED', attribs: [
          { type: 'ATTRIB', handle: 'F1', layer: 'BEST_DATA @ 1' },
          { type: 'ATTRIB', handle: 'F2', layer: 'BEST_DATA @ 0.5' },
        ],
      },
    ]);
    model.tables.LAYER.entries = [
      { name: 'BEST_DATA @ 1 (1)' },
      { name: 'BEST_DATA @ 0.5 (2)' },
      { name: 'BEST_DATA @ 0.25' },
      { name: 'SINGLE @ 1' },
      { name: 'UNMARKED' },
    ] as never;
    model.tables.BLOCK_RECORD.entries = [{
      name: 'BLOCK', entities: [
        { type: 'MTEXT', handle: 'G', layer: 'BEST_DATA @ 1' },
        { type: 'LEADER', handle: 'H', layer: 'BEST_DATA @ 0.5' },
      ],
    }] as never;

    expect(annotationScaleLayerNamesToHide(model, selection)).toEqual([
      'BEST_DATA @ 0.25',
      'BEST_DATA @ 1',
      'BEST_DATA @ 1 (1)',
    ]);
    // The database itself remains structurally intact until the established
    // model filter rebuilds its entity and block-record views consistently.
    expect(model.entities).toHaveLength(6);
    expect(model.tables.BLOCK_RECORD.entries[0].entities).toHaveLength(2);
  });

  it('maps conventional 1:500 names to @ 0.5 and fails open without a matching sibling', () => {
    const conventionalSelection: CadAnnotationScaleSelection = {
      ...selection,
      selectedScaleId: 'standard-500',
      availableScales: [{
        id: 'standard-500', name: '1:500', paperUnits: 1, drawingUnits: 500,
        ratio: 500, source: 'saved', isDefault: true,
      }],
    };
    const model = database([
      { type: 'TEXT', handle: 'A', layer: 'FAMILY @ 1' },
      { type: 'TEXT', handle: 'B', layer: 'FAMILY @ 0.5' },
      { type: 'TEXT', handle: 'C', layer: 'NO_MATCH @ 1' },
      { type: 'TEXT', handle: 'D', layer: 'NO_MATCH @ 0.25' },
    ]);

    expect(annotationScaleLayerNamesToHide(model, conventionalSelection)).toEqual(['FAMILY @ 1']);
  });
});
