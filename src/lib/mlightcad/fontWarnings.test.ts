import { describe, expect, it } from 'vitest';
import type { DwgPreflightReport } from '../cad/preflightTypes';
import { appendFontSubstitutionWarnings } from './fontWarnings';

function report(warnings: DwgPreflightReport['warnings'] = []): DwgPreflightReport {
  return {
    schemaVersion: 2,
    file: { name: 'plan.dwg', size: 42, lastModified: 1 },
    format: 'dwg',
    documentVersion: 'AC1032',
    layers: [],
    blocks: [],
    entityCounts: {
      modelEntities: 0,
      insertInstances: 0,
      texts: 0,
      leaders: 0,
      mleaders: 0,
      hatches: 0,
      solids: 0,
      polylineVertices: 0,
      paperSpaceEntities: 0,
      images: 0,
      oleObjects: 0,
      proxyObjects: 0,
      threeDimensional: 0,
      xrefs: 0,
    },
    definedBlockCount: 0,
    reachableBlockCount: 0,
    maxBlockDepth: 0,
    risk: { level: 'low', shouldPrepare: false, estimatedRenderCost: 0, deviceBudget: 1, reasons: [] },
    recommendedProfile: {
      mode: 'full',
      hiddenLayerIds: [],
      hiddenBlockNames: [],
      hiddenEntityCategories: [],
    },
    warnings,
    effects: [],
  };
}

describe('appendFontSubstitutionWarnings', () => {
  it('adds valid diagnostics without mutating the report', () => {
    const original = report();
    const enriched = appendFontSubstitutionWarnings(original, {
      ' romans.shx ': 12.8,
      simplex: 0,
      invalid: Number.NaN,
      '': 4,
    });

    expect(enriched).not.toBe(original);
    expect(original.warnings).toEqual([]);
    expect(enriched.warnings).toContainEqual({
      code: 'font-substitution',
      fontName: 'romans.shx',
      affectedCharacterCount: 12,
    });
  });

  it('deduplicates names case-insensitively across existing and new warnings', () => {
    const original = report([{
      code: 'font-substitution',
      fontName: 'Romans.shx',
      affectedCharacterCount: 2,
    }]);
    const enriched = appendFontSubstitutionWarnings(original, {
      ' romans.SHX ': 8,
      'Simplex.shx': 5,
      'simplex.SHX ': 9,
    });

    expect(enriched.warnings).toHaveLength(2);
    expect(enriched.warnings[1]).toEqual({
      code: 'font-substitution',
      fontName: 'Simplex.shx',
      affectedCharacterCount: 5,
    });
  });

  it('keeps object identity when there is nothing to append', () => {
    const original = report();
    expect(appendFontSubstitutionWarnings(original, undefined)).toBe(original);
    expect(appendFontSubstitutionWarnings(original, { simplex: -1 })).toBe(original);
  });
});
