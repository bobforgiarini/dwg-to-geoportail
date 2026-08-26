import { describe, expect, it, vi } from 'vitest';
import type { CadLoadProfile } from '../lib/cad/preflightTypes';
import type { CadOverlayLayer } from '../types/models';
import { createLayerSheetItems, createLayerSheetLabels, isLayerHidden, layerIdentityMatches } from './layerSheetModel';

const profile: CadLoadProfile = {
  mode: 'filtered',
  hiddenLayerIds: ['planning'],
  hiddenBlockNames: [],
  hiddenEntityCategories: [],
};

const layers: CadOverlayLayer[] = [
  { id: 'PLANNING', name: '20 Planning', visible: false, featureCount: 41 },
  { id: 'SURVEY', name: 'Survey', visible: true, featureCount: 11 },
  { id: 'TEXT', name: 'Text', visible: true, featureCount: 10 },
];

describe('layerSheetModel', () => {
  it('maps object counts, relative performance costs and filtered reload state', () => {
    expect(createLayerSheetItems(layers, profile, 100)).toEqual([
      { id: 'PLANNING', name: '20 Planning', visible: false, objectCount: 41, cost: 'high', requiresReload: true },
      { id: 'SURVEY', name: 'Survey', visible: true, objectCount: 11, cost: 'medium', requiresReload: false },
      { id: 'TEXT', name: 'Text', visible: true, objectCount: 10, cost: 'low', requiresReload: false },
    ]);
  });

  it('can suppress reload indicators while editing a preparation profile', () => {
    expect(createLayerSheetItems(layers, profile, 100, false).every((layer) => !layer.requiresReload)).toBe(true);
  });

  it('marks every affected row while a grouped reload is pending', () => {
    expect(createLayerSheetItems(layers, profile, 100, true, true).every((layer) => layer.requiresReload)).toBe(true);
  });

  it('matches hidden layers by name without case sensitivity', () => {
    const byName = { ...profile, hiddenLayerIds: ['survey'] };
    expect(createLayerSheetItems(layers, byName, 100)[1].requiresReload).toBe(true);
  });

  it('matches renderer and preflight identities through either id or name', () => {
    const layer = { id: '7', name: 'Survey' };
    expect(layerIdentityMatches(layer, 'SURVEY')).toBe(true);
    expect(layerIdentityMatches(layer, '7')).toBe(true);
    expect(isLayerHidden(layer, ['survey'])).toBe(true);
  });

  it('creates every translated label through the provided translator', () => {
    const t = vi.fn((key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key);
    const labels = createLayerSheetLabels(t);

    expect(labels.searchLabel).toBe('layerDrawer.search');
    expect(labels.visibleCount(3)).toContain('"count":3');
    expect(labels.visibilitySummary(2, 1)).toContain('"visible":2');
    expect(labels.toggleLayer('A', false)).toContain('layerDrawer.hideLayer');
  });
});
