import { describe, expect, it } from 'vitest';
import type { CadDocument } from '@flyfish-dev/cad-viewer';
import { convertCadDocument } from './convertCadDocument';

function documentWith(entities: CadDocument['entities'], blocks: CadDocument['blocks'] = {}): CadDocument {
  return {
    format: 'dwg', layers: { A: { name: 'A' }, BLOCK: { name: 'BLOCK' } }, blocks, entities,
    metadata: {}, warnings: [],
  };
}

describe('CAD document conversion', () => {
  it('keeps absolute LUREF extents and assigns layer metadata', () => {
    const result = convertCadDocument(documentWith([
      { type: 'LINE', kind: 'line', layer: 'A', startPoint: { x: 70_000, y: 80_000 }, endPoint: { x: 71_000, y: 81_000 }, color: '#ff0000' },
    ]));
    expect(result.lurefExtent).toEqual([70_000, 80_000, 71_000, 81_000]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].get('layerId')).toBe('A');
    expect(result.layers[0]).toMatchObject({ id: 'A', visible: true, featureCount: 1 });
  });

  it('resolves inserted blocks with translation and inherited layer', () => {
    const result = convertCadDocument(documentWith([
      { type: 'INSERT', kind: 'insert', layer: 'BLOCK', blockName: 'symbol', insertionPoint: { x: 80_000, y: 100_000 } },
    ], {
      symbol: { name: 'symbol', basePoint: { x: 0, y: 0 }, entities: [
        { type: 'LINE', kind: 'line', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
      ] },
    }));
    expect(result.lurefExtent).toEqual([80_000, 100_000, 80_010, 100_000]);
    expect(result.features[0].get('layerId')).toBe('BLOCK');
  });

  it('approximates curves and reports ignored 3D and paper-space content', () => {
    const result = convertCadDocument(documentWith([
      { type: 'CIRCLE', kind: 'circle', layer: 'A', center: { x: 80_000, y: 100_000 }, radius: 5 },
      { type: 'LINE', kind: 'line', layer: 'A', startPoint: { x: 0, y: 0, z: 4 }, endPoint: { x: 1, y: 1 } },
      { type: 'TEXT', kind: 'text', layer: 'A', insertionPoint: { x: 1, y: 2 }, text: 'Layout', isInPaperSpace: true },
    ]));
    expect(result.features).toHaveLength(2);
    expect(result.warnings).toContain('3d-flattened');
    expect(result.warnings).toContain('paper-space-ignored');
  });

  it('detects cyclic block references', () => {
    const result = convertCadDocument(documentWith([
      { type: 'INSERT', kind: 'insert', blockName: 'loop' },
    ], {
      loop: { name: 'loop', entities: [{ type: 'INSERT', kind: 'insert', blockName: 'loop' }] },
    }));
    expect(result.features).toHaveLength(0);
    expect(result.warnings).toContain('cyclic-block');
  });
});
