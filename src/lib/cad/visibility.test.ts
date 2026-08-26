import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { describe, expect, it } from 'vitest';
import type { DwgImportResult } from '../../types/models';
import type { DwgPreflightReport } from './preflightTypes';
import { countHiddenCadObjects } from './visibility';

function cadFeature(featureId: string, layerId: string) {
  return new Feature({ geometry: new Point([0, 0]), featureId, layerId });
}

describe('countHiddenCadObjects', () => {
  it('counts individually and layer-hidden objects once', () => {
    const dwg = {
      file: { name: 'test.dwg', size: 1, lastModified: 0 },
      lurefExtent: null,
      layers: [
        { id: 'visible', name: 'Visible', visible: true, featureCount: 1 },
        { id: 'hidden', name: 'Hidden', visible: false, featureCount: 2 },
      ],
      features: [cadFeature('one', 'visible'), cadFeature('two', 'hidden'), cadFeature('three', 'hidden')],
      autoHiddenFeatureIds: [],
      warnings: [],
      blocks: [],
      preflight: {} as DwgPreflightReport,
    } satisfies DwgImportResult;

    expect(countHiddenCadObjects(dwg, new Set(['one', 'two']))).toBe(3);
    expect(countHiddenCadObjects(null, new Set(['one']))).toBe(0);
  });
});
