import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import App from './App';
import type { DwgPreflightReport } from './lib/cad/preflightTypes';
import { CadSessionProvider, useCadSession } from './session/CadSessionContext';

const fitDrawing = vi.hoisted(() => vi.fn());
const mapCanvasProps = vi.hoisted(() => vi.fn());
const importDwg = vi.hoisted(() => vi.fn());

vi.mock('./components/MapCanvas', async () => {
  const React = await import('react');
  return {
    MapCanvas: React.forwardRef((props: Record<string, unknown>, ref) => {
      mapCanvasProps(props);
      React.useImperativeHandle(ref, () => ({ fitDrawing }));
      return React.createElement('div', { 'data-testid': 'legacy-map' });
    }),
  };
});

vi.mock('./lib/cad/importDwg', () => ({
  RECOMMENDED_DWG_BYTES: 10 * 1024 * 1024,
  cancelDwgImport: vi.fn(),
  importDwg,
}));

function renderApp() {
  return render(<CadSessionProvider><App /></CadSessionProvider>);
}

function legacyResult(file: File) {
  return {
    file: { name: file.name, size: file.size, lastModified: file.lastModified },
    lurefExtent: [60_000, 70_000, 60_100, 70_100],
    layers: [{ id: '0', name: 'Plan', visible: true, featureCount: 0 }],
    features: [],
    autoHiddenFeatureIds: [],
    warnings: [],
    blocks: [],
    preflight: null,
  };
}

function filteredLayerReport(file: File): DwgPreflightReport {
  return {
    schemaVersion: 1,
    file: { name: file.name, size: file.size, lastModified: file.lastModified },
    format: 'dwg',
    documentVersion: 'AC1032',
    layers: [
      { id: '0', name: 'Plan', visible: true, frozen: false, noPlot: false, expandedEntityCount: 1 },
      { id: 'HIDDEN', name: 'Hidden', visible: false, frozen: true, noPlot: false, expandedEntityCount: 5 },
    ],
    blocks: [],
    entityCounts: {
      modelEntities: 6, paperSpaceEntities: 0, insertInstances: 0, texts: 0, leaders: 0, mleaders: 0,
      hatches: 0, solids: 0, polylineVertices: 0, images: 0, oleObjects: 0,
      proxyObjects: 0, threeDimensional: 0, xrefs: 0,
    },
    definedBlockCount: 0,
    reachableBlockCount: 0,
    maxBlockDepth: 0,
    risk: { level: 'low', shouldPrepare: false, estimatedRenderCost: 6, deviceBudget: 100_000, reasons: [] },
    recommendedProfile: { mode: 'filtered', hiddenLayerIds: ['HIDDEN'], hiddenBlockNames: [], hiddenEntityCategories: [] },
    warnings: [],
  };
}

function DeferredLegacyViewer() {
  const session = useCadSession();
  const [mounted, setMounted] = useState(false);
  if (mounted) return <App />;
  return (
    <button onClick={() => {
      session.setFile(new File(['dwg'], 'session.dwg'));
      setMounted(true);
    }}>
      Mount legacy
    </button>
  );
}

function PreparedLegacyViewer() {
  const session = useCadSession();
  const [mounted, setMounted] = useState(false);
  if (mounted) return <App />;
  return (
    <button onClick={() => {
      const file = new File(['dwg'], 'prepared.dwg');
      const report = filteredLayerReport(file);
      session.setFile(file);
      session.setPreflightReport(report);
      session.setLoadProfile(report.recommendedProfile);
      setMounted(true);
    }}>
      Mount prepared legacy
    </button>
  );
}

describe('legacy viewer controls', () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage('de');
    window.history.replaceState(null, '', '/');
    fitDrawing.mockClear();
    mapCanvasProps.mockClear();
    importDwg.mockReset();
    importDwg.mockImplementation(async (file: File) => ({
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      lurefExtent: [60_000, 70_000, 60_100, 70_100],
      layers: [{ id: '0', name: 'Plan', visible: true, featureCount: 0 }],
      features: [],
      autoHiddenFeatureIds: [],
      warnings: ['3d-flattened'],
      blocks: [],
      preflight: null,
    }));
  });

  it('uses the same compact action order and modal CAD drawer as MLightCAD', () => {
    const { container, getByLabelText, getByRole, queryByRole } = renderApp();
    const dialog = getByRole('dialog', { name: i18n.t('cadControlsTitle') });
    const actionBar = getByLabelText(i18n.t('mapActions'));
    const actionLabels = within(actionBar).getAllByRole('button').map((button) => button.getAttribute('aria-label'));

    expect(actionLabels).toEqual([
      i18n.t('layers'),
      i18n.t('blocksTitle'),
      i18n.t('openCadControls'),
      i18n.t('locationStart'),
      i18n.t('fitDrawing'),
    ]);

    fireEvent.click(dialog.closest('.sheet-shell') as HTMLElement);
    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('openCadControls') }));
    expect(getByRole('dialog', { name: i18n.t('cadControlsTitle') })).toBeInTheDocument();
    expect(container.querySelector('.drawer-reopen')).not.toBeInTheDocument();
  });

  it('passes opacity to MapCanvas, exposes fit drawing, and keeps legacy warnings', async () => {
    const { container, getByRole, getByText } = renderApp();
    const file = new File(['dwg'], 'plan.dwg');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());
    expect(getByText(i18n.t('warning3d'))).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('fitDrawing') }));
    expect(fitDrawing).toHaveBeenCalledOnce();

    fireEvent.click(getByRole('button', { name: i18n.t('opacityMap') }));
    await waitFor(() => expect(mapCanvasProps).toHaveBeenLastCalledWith(expect.objectContaining({ cadOpacity: 0 })));
  });

  it('starts closed when mounting with an existing session file', async () => {
    const { getByRole, queryByRole } = render(
      <CadSessionProvider><DeferredLegacyViewer /></CadSessionProvider>,
    );

    fireEvent.click(getByRole('button', { name: 'Mount legacy' }));

    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();
    await waitFor(() => expect(importDwg).toHaveBeenCalledOnce());
    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();
  });

  it('ignores a late result from an aborted older import', async () => {
    let resolveFirst!: (value: ReturnType<typeof legacyResult>) => void;
    let resolveSecond!: (value: ReturnType<typeof legacyResult>) => void;
    importDwg
      .mockImplementationOnce((file: File) => new Promise((resolve) => {
        resolveFirst = () => resolve(legacyResult(file));
      }))
      .mockImplementationOnce((file: File) => new Promise((resolve) => {
        resolveSecond = () => resolve(legacyResult(file));
      }));
    const { container } = renderApp();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(['first'], 'first.dwg');
    const second = new File(['second'], 'second.dwg');

    fireEvent.change(input, { target: { files: [first] } });
    await waitFor(() => expect(importDwg).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [second] } });
    await waitFor(() => expect(importDwg).toHaveBeenCalledTimes(2));

    await act(async () => resolveSecond(legacyResult(second)));
    await waitFor(() => expect(mapCanvasProps).toHaveBeenLastCalledWith(expect.objectContaining({
      dwg: expect.objectContaining({ file: expect.objectContaining({ name: 'second.dwg' }) }),
    })));

    await act(async () => resolveFirst(legacyResult(first)));
    expect(mapCanvasProps).toHaveBeenLastCalledWith(expect.objectContaining({
      dwg: expect.objectContaining({ file: expect.objectContaining({ name: 'second.dwg' }) }),
    }));
  });

  it('treats an app-worker AbortError as a cancelled import', async () => {
    const workerCancellation = new Error('MLIGHTCAD_IMPORT_CANCELLED');
    workerCancellation.name = 'AbortError';
    importDwg.mockRejectedValueOnce(workerCancellation);
    const { container, findByText } = renderApp();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['dwg'], 'cancelled.dwg')] } });

    expect(await findByText(i18n.t('importCancelled'))).toBeInTheDocument();
  });

  it('keeps preflight-filtered layers in the drawer and reloads when they are restored', async () => {
    importDwg.mockImplementation(async (file: File) => ({
      ...legacyResult(file),
      layers: [{ id: '0', name: 'Plan', visible: true, featureCount: 1 }],
      preflight: filteredLayerReport(file),
    }));
    const { getByRole, getByText } = render(
      <CadSessionProvider><PreparedLegacyViewer /></CadSessionProvider>,
    );

    fireEvent.click(getByRole('button', { name: 'Mount prepared legacy' }));
    await waitFor(() => expect(importDwg).toHaveBeenCalledOnce());
    fireEvent.click(getByRole('button', { name: i18n.t('layers') }));
    expect(getByText('Hidden')).toBeInTheDocument();
    const hiddenRow = getByRole('button', { name: i18n.t('layerDrawer.showLayer', { name: 'Hidden' }) });
    expect(hiddenRow).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(hiddenRow);
    fireEvent.click(getByRole('button', { name: i18n.t('layerDrawer.applyChanges') }));
    await waitFor(() => expect(importDwg).toHaveBeenCalledTimes(2));
  });
});
