import { describe, expect, it } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import { applyAnnotationScaleSelectionToDatabase } from './applyAnnotationScale';
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
    tables: { BLOCK_RECORD: { entries: [] } },
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
});
