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

  it('marks CAD text features for the global text visibility switch', () => {
    const result = convertCadDocument(documentWith([
      { type: 'TEXT', kind: 'text', layer: 'A', insertionPoint: { x: 80_000, y: 100_000 }, text: 'Test' },
      { type: 'LINE', kind: 'line', layer: 'A', startPoint: { x: 80_000, y: 100_000 }, endPoint: { x: 80_010, y: 100_010 } },
    ]));
    expect(result.features[0].get('isCadText')).toBe(true);
    expect(result.features[1].get('isCadText')).toBe(false);
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

  it('converts hatch command loops into selectable polygons', () => {
    const result = convertCadDocument(documentWith([
      {
        id: 'hatch-1', type: 'HATCH', kind: 'hatch', layer: 'A', loops: [{ commands: [
          { cmd: 'M', points: [{ x: 80_000, y: 100_000 }] },
          { cmd: 'L', points: [{ x: 80_010, y: 100_000 }] },
          { cmd: 'L', points: [{ x: 80_010, y: 100_010 }] },
          { cmd: 'L', points: [{ x: 80_000, y: 100_010 }] },
          { cmd: 'Z', points: [] },
        ] }],
      },
    ]));
    expect(result.features).toHaveLength(1);
    expect(result.features[0].getGeometry()?.getType()).toBe('Polygon');
    expect(result.features[0].get('featureId')).toBe('hatch-1-0');
    expect(result.warnings).not.toContain('unsupported:HATCH');
  });

  it('converts LibreDWG raw hatch boundary paths', () => {
    const result = convertCadDocument(documentWith([
      {
        id: 'raw-hatch', type: 'HATCH', kind: 'hatch', layer: 'A', raw: {
          boundaryPaths: [{ isClosed: true, vertices: [
            { x: 80_000, y: 100_000, bulge: 0 },
            { x: 80_020, y: 100_000, bulge: 0 },
            { x: 80_020, y: 100_020, bulge: 0 },
            { x: 80_000, y: 100_020, bulge: 0 },
          ] }],
        },
      },
    ]));
    expect(result.features).toHaveLength(1);
    expect(result.features[0].getGeometry()?.getType()).toBe('Polygon');
    expect(result.warnings).not.toContain('hatch-boundary-missing');
  });

  it('excludes extreme coordinate outliers from the initial LUREF fit extent', () => {
    const result = convertCadDocument(documentWith([
      { type: 'LINE', kind: 'line', layer: 'A', startPoint: { x: 80_000, y: 100_000 }, endPoint: { x: 80_100, y: 100_100 } },
      { type: 'LINE', kind: 'line', layer: 'A', startPoint: { x: 4_000_000, y: -2_000_000 }, endPoint: { x: 4_000_100, y: -1_999_900 } },
    ]));
    expect(result.features).toHaveLength(2);
    expect(result.lurefExtent).toEqual([80_000, 100_000, 80_100, 100_100]);
    expect(result.autoHiddenFeatureIds).toEqual(['LINE-1']);
  });
});
