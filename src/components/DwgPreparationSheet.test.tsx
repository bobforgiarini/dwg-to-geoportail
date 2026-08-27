import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DwgPreflightReport } from '../lib/cad/preflightTypes';
import { DwgPreparationSheet } from './DwgPreparationSheet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (
      typeof values?.count === 'number' ? `${key}:${values.count}` : key
    ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

const profile = {
  mode: 'filtered' as const,
  hiddenLayerIds: ['HIDDEN'],
  hiddenBlockNames: ['TREE', 'Survey base'],
  hiddenEntityCategories: ['paper-space' as const],
};

function report(overrides: Partial<DwgPreflightReport> = {}): DwgPreflightReport {
  return {
    schemaVersion: 2,
    file: { name: 'site.dwg', size: 2_097_152, lastModified: 1_788_000_000_000 },
    format: 'dwg',
    documentVersion: 'AC1032',
    layers: [{ id: '0', name: '0', visible: true, frozen: false, noPlot: false, expandedEntityCount: 900 }],
    blocks: [],
    entityCounts: {
      modelEntities: 1_000, insertInstances: 10, texts: 20, leaders: 2, mleaders: 1,
      hatches: 5, solids: 3, polylineVertices: 100, paperSpaceEntities: 20,
      images: 0, oleObjects: 0, proxyObjects: 0, threeDimensional: 0, xrefs: 1,
    },
    definedBlockCount: 2,
    reachableBlockCount: 1,
    maxBlockDepth: 2,
    risk: { level: 'high', shouldPrepare: true, estimatedRenderCost: 2_500, deviceBudget: 2_000, reasons: ['render-cost'] },
    recommendedProfile: profile,
    warnings: [],
    impact: {
      before: { entityCount: 1_000, estimatedCost: 2_500 },
      recommended: { entityCount: 640, estimatedCost: 1_300 },
    },
    effects: [
      { id: 'category:paper-space', kind: 'category', policy: 'required', reason: 'paper-space', label: 'Paper space', affectedEntityCount: 20, estimatedCost: 20, selected: true },
      { id: 'layer:HIDDEN', kind: 'layer', policy: 'recommended', reason: 'layer-off', label: 'Hidden layer', affectedEntityCount: 300, estimatedCost: 900, selected: true },
      { id: 'block:TREE', kind: 'block', policy: 'user', reason: 'user-selection', label: 'Tree', affectedEntityCount: 40, estimatedCost: 100, selected: true },
      { id: 'boundary', kind: 'boundary', policy: 'required', reason: 'outside-luxembourg-buffer', label: 'Outside Luxembourg', affectedEntityCount: 12, estimatedCost: 12, selected: true },
      { id: 'block:Survey base', kind: 'xref', policy: 'recommended', reason: 'unresolved-xref', label: 'Survey base', affectedEntityCount: 8, estimatedCost: 16, selected: true },
    ],
    annotationScale: {
      mode: 'saved', savedScaleId: 'scale-500', selectedScaleId: 'scale-500', contextObjectCount: 5, failOpen: false,
      availableScales: [
        { id: 'scale-500', name: '1:500', paperUnits: 1, drawingUnits: 500, ratio: 500, source: 'saved', isDefault: true },
        { id: 'scale-1000', name: '1:1000', paperUnits: 1, drawingUnits: 1_000, ratio: 1_000, source: 'context', isDefault: false },
      ],
    },
    externalReferences: [{
      id: 'xref:survey', name: 'Survey base', normalizedName: 'survey base', sourcePath: 'refs/Survey base.dwg',
      kind: 'attachment', status: 'ambiguous', parentFileId: 'root', resolvedFileId: null,
      candidateFileIds: ['survey-a', 'survey-b'], depth: 1, path: ['root', 'Survey base'],
    }],
    spatialFilter: {
      enabled: true, coordinateReferenceSystem: 'EPSG:2169', bufferMeters: 1_000,
      sourceAuthority: 'ACT', sourceLicense: 'CC0-1.0', retainedRootEntityCount: 980,
      removedRootEntityCount: 12, unknownRootEntityCount: 8, removedBlockDefinitionCount: 1,
      removedEntityKeys: [], unknownEntityKeys: [], removedBlockNames: [], warnings: [],
    },
    ...overrides,
  };
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof DwgPreparationSheet>> = {}) {
  const props: React.ComponentProps<typeof DwgPreparationSheet> = {
    open: true,
    report: report(),
    profile,
    onLoadFull: vi.fn(),
    onLoadRecommended: vi.fn(),
    onApplySelection: vi.fn(),
    onEditLayers: vi.fn(),
    onEditBlocks: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DwgPreparationSheet {...props} />) };
}

describe('DwgPreparationSheet schema 2', () => {
  afterEach(cleanup);

  it('shows exact entity impact separately from estimated performance cost', () => {
    renderSheet();

    const entityImpact = screen.getByText('preparation.impactEntities').parentElement;
    expect(entityImpact).not.toBeNull();
    expect(within(entityImpact!).getByText('1,000 → 640')).toBeInTheDocument();
    const costImpact = screen.getByText('preparation.impactEstimatedCost').parentElement;
    expect(within(costImpact!).getByText('≈ 2,500 → 1,300')).toBeInTheDocument();
  });

  it('groups fixed, recommended and manual effects using report-provided impact', () => {
    renderSheet();

    expect(within(screen.getByRole('list', { name: 'preparation.fixedTitle' })).getByText('Paper space')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'preparation.recommendedTitle' })).getByText('Hidden layer')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'preparation.manualTitle' })).getByText('Tree')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'preparation.spatialEffects' })).toHaveTextContent('Outside Luxembourg');
    expect(screen.getByRole('list', { name: 'preparation.xrefs.effects' })).toHaveTextContent('Survey base');
    expect(screen.getAllByText('preparation.effectExcluded')).toHaveLength(5);
  });

  it('reports the main file and resolves ambiguous local XRef candidates', () => {
    const onAddXrefs = vi.fn();
    const onChooseXrefCandidate = vi.fn();
    renderSheet({ onAddXrefs, onChooseXrefCandidate });

    expect(screen.getByText('site.dwg')).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
    const candidate = screen.getByRole('combobox', { name: 'preparation.xrefs.chooseCandidate: Survey base' });
    fireEvent.change(candidate, { target: { value: 'survey-b' } });
    expect(onChooseXrefCandidate).toHaveBeenCalledWith('xref:survey', 'survey-b');

    fireEvent.click(screen.getByRole('button', { name: 'preparation.xrefs.add' }));
    expect(onAddXrefs).toHaveBeenCalledOnce();
  });

  it('changes annotation scale and Luxembourg filter only through explicit callbacks', () => {
    const onAnnotationScaleChange = vi.fn();
    const onSpatialFilterChange = vi.fn();
    renderSheet({ onAnnotationScaleChange, onSpatialFilterChange });

    fireEvent.change(screen.getByRole('combobox', { name: 'preparation.annotationScale' }), { target: { value: 'scale-1000' } });
    expect(onAnnotationScaleChange).toHaveBeenCalledWith('scale-1000');

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSpatialFilterChange).toHaveBeenCalledWith(false);
  });

  it('keeps schema 1 reports usable without inventing a filtered estimate', () => {
    const legacy = report({ schemaVersion: 1, effects: undefined, impact: undefined, annotationScale: undefined, externalReferences: undefined, spatialFilter: undefined });
    renderSheet({ report: legacy });

    expect(screen.getByText('preparation.impactEntities').parentElement).toHaveTextContent('1,000');
    expect(screen.getByText('preparation.impactEstimatedCost').parentElement).toHaveTextContent('≈ 2,500');
    expect(screen.getAllByText('preparation.noEffects')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /preparation.chooseLayers/ })).toBeInTheDocument();
  });
});
