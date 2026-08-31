import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { CadSessionProvider, useCadSession } from '../session/CadSessionContext';
import type { MeasurementPoint } from '../types/models';
import MlightCadViewerPage from './MlightCadViewerPage';

const harness = vi.hoisted(() => {
  const layers = [{ id: 'draft', name: 'Draft', visible: true, featureCount: 12 }];
  const adapter = {
    cancel: vi.fn(() => Promise.resolve()),
    centerOn: vi.fn(),
    clearSelection: vi.fn(),
    fitDrawing: vi.fn(),
    hideObject: vi.fn(),
    hideObjectByKey: vi.fn(() => true),
    applyObjectDrawOrder: vi.fn(() => 'applied' as const),
    hiddenObjectCount: 0,
    restoreHiddenObjects: vi.fn(),
    resolveAimPoint: vi.fn(() => ({ coordinate: [80_000, 100_000], source: 'aim' }) as MeasurementPoint),
    resolveScreenPoint: vi.fn(() => ({ coordinate: [80_000, 100_000], source: 'aim' }) as MeasurementPoint),
    setAllLayersVisible: vi.fn(),
    setBlockVisible: vi.fn(() => false),
    setCamera: vi.fn(),
    setLayerVisible: vi.fn(),
    setOpacity: vi.fn(),
    setObjectDrawOrder: vi.fn(() => 'applied' as const),
    setMeasurementCaptureActive: vi.fn(),
    setMeasurementOverlay: vi.fn(),
    setRenderQuality: vi.fn(),
    setSnapPreview: vi.fn(),
    setTextsVisible: vi.fn(),
  };
  return {
    adapter,
    canvasProps: vi.fn(),
    layers,
    mapProps: vi.fn(),
    resolveScreenCoordinate: vi.fn(() => [80_000.125, 100_000.875] as [number, number]),
    location: {
      pause: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    locationState: {
      permission: 'idle',
      position: null as GeolocationPosition | null,
      accuracy: null as number | null,
      follow: 'off' as 'off' | 'following' | 'paused',
      error: null,
    },
  };
});

vi.mock('ol/proj', () => ({
  transform: (coordinate: number[]) => coordinate,
}));

vi.mock('../hooks/useLocationTracking', () => ({
  useLocationTracking: () => ({
    state: harness.locationState,
    ...harness.location,
  }),
}));

vi.mock('../components/MlightCadMap', async () => {
  const React = await import('react');
  return {
    MlightCadMap: React.forwardRef((_props: Record<string, unknown>, ref) => {
      const props = _props;
      harness.mapProps(props);
      React.useImperativeHandle(ref, () => ({
        resolveAimPoint: () => ({ coordinate: [80_000, 100_000] as const, source: 'aim' as const }),
        resolveScreenCoordinate: harness.resolveScreenCoordinate,
      }));
      return React.createElement('div', {
        'data-testid': 'mlightcad-map',
        'data-map-surface': true,
        'data-controls-active': String(props.mlightControlsActive),
      });
    }),
  };
});

vi.mock('../components/MlightCadCanvas', async () => {
  const React = await import('react');
  type CanvasProps = {
    file: File | null;
    fileRevision: number;
    opacity: number;
    renderQuality: 'auto' | 'sharp' | 'memory';
    onAdapterChange: (adapter: typeof harness.adapter | null) => void;
    onCamera: (camera: { center: [number, number]; resolution: number }) => void;
    onSelection: (selection: {
      featureId: string;
      objectKey: string;
      drawOrderGroupKey: string;
      layerId: string;
      cadType: string;
      label: string;
      blockPath: string[];
    } | null) => void;
    onProgress: (progress: { phase: 'ready'; percentage: number }) => void;
    onReady: (ready: { layers: typeof harness.layers; blocks: []; entityCount: number; preflight: null }) => void;
  };

  return {
    MlightCadCanvas: (props: CanvasProps) => {
      harness.canvasProps(props);

      React.useEffect(() => {
        if (!props.file) {
          props.onAdapterChange(null);
          return;
        }

        props.onAdapterChange(harness.adapter);
        const timer = window.setTimeout(() => {
          props.onCamera({ center: [80_000, 100_000], resolution: 2 });
          props.onProgress({ phase: 'ready', percentage: 100 });
          props.onReady({ layers: harness.layers, blocks: [], entityCount: 12, preflight: null });
        }, 0);

        return () => {
          window.clearTimeout(timer);
          props.onAdapterChange(null);
        };
      }, [props.file, props.fileRevision]);

      React.useEffect(() => {
        if (props.file) harness.adapter.setOpacity(props.opacity);
      }, [props.file, props.opacity]);

      return React.createElement('div', { 'aria-label': 'MLightCAD' });
    },
  };
});

function renderPage() {
  return render(
    <CadSessionProvider>
      <MlightCadViewerPage />
    </CadSessionProvider>,
  );
}

function stubFinePointer(enabled = true) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: enabled,
    media: '(hover: hover) and (pointer: fine)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

function closeInitialDwgSheet(container: HTMLElement) {
  const shell = container.querySelector('.dwg-control-sheet')?.closest('.sheet-shell');
  if (shell) fireEvent.click(shell);
}

function MeasuredMlightViewer() {
  const session = useCadSession();
  const [mounted, setMounted] = useState(false);
  if (mounted) return <MlightCadViewerPage />;
  return (
    <button onClick={() => {
      session.startMeasurement();
      setMounted(true);
    }}>
      Mount measured MLightCAD
    </button>
  );
}

describe('MLightCAD viewer page integration', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    window.history.replaceState(null, '', '/');
    vi.clearAllMocks();
    harness.adapter.resolveAimPoint.mockReset();
    harness.adapter.resolveAimPoint.mockReturnValue({
      coordinate: [80_000, 100_000],
      source: 'aim',
    });
    harness.adapter.resolveScreenPoint.mockReset();
    harness.adapter.resolveScreenPoint.mockReturnValue({
      coordinate: [80_000, 100_000],
      source: 'aim',
    });
    harness.resolveScreenCoordinate.mockReset();
    harness.resolveScreenCoordinate.mockReturnValue([80_000.125, 100_000.875]);
    Object.assign(harness.locationState, {
      permission: 'idle', position: null, accuracy: null, follow: 'off', error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shares the compact controls and hands gestures from OpenLayers to MLightCAD after loading', async () => {
    const { container, getByLabelText, getByRole, getByTestId, queryByRole } = renderPage();
    const actionBar = getByLabelText(i18n.t('mapActions'));
    const actionButtons = within(actionBar).getAllByRole('button');

    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      i18n.t('layers'),
      i18n.t('blocksTitle'),
      i18n.t('dwgControlsTitle'),
      i18n.t('measurementOpen'),
      i18n.t('locationStart'),
      i18n.t('fitDrawing'),
    ]);
    expect(actionButtons[0]).toBeDisabled();
    expect(actionButtons[5]).toBeDisabled();
    expect(getByTestId('mlightcad-map')).toHaveAttribute('data-controls-active', 'false');
    expect(container.querySelector('.mlightcad-interaction-layer')).toHaveClass('map-active');
    expect(getByRole('dialog', { name: i18n.t('dwgControlsTitle') })).toBeInTheDocument();

    fireEvent.wheel(container.querySelector('.mlightcad-interaction-layer') as HTMLElement);
    expect(harness.location.pause).toHaveBeenCalledOnce();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'plan.dwg')] } });

    await waitFor(() => {
      expect(getByRole('button', { name: i18n.t('layers') })).toBeEnabled();
      expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled();
      expect(getByTestId('mlightcad-map')).toHaveAttribute('data-controls-active', 'true');
    });
    expect(container.querySelector('.mlightcad-interaction-layer')).toHaveClass('mlightcad-active');
    expect(harness.mapProps).toHaveBeenLastCalledWith(expect.objectContaining({
      mlightControlsActive: true,
    }));

    fireEvent.click(getByRole('button', { name: i18n.t('fitDrawing') }));
    expect(harness.adapter.fitDrawing).toHaveBeenCalledOnce();

    fireEvent.click(getByRole('button', { name: i18n.t('layers') }));
    const layerDialog = getByRole('dialog', { name: i18n.t('layersTitle') });
    expect(within(layerDialog).getByText('Draft')).toBeInTheDocument();
    expect(queryByRole('dialog', { name: i18n.t('dwgControlsTitle') })).not.toBeInTheDocument();

    fireEvent.click(layerDialog.closest('.sheet-shell') as HTMLElement);
    expect(queryByRole('dialog', { name: i18n.t('layersTitle') })).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('cadSettingsTitle') }));
    const cadDialog = getByRole('dialog', { name: i18n.t('cadSettingsTitle') });
    fireEvent.click(within(cadDialog).getByRole('button', { name: `${i18n.t('quality.sharp.label')} · ${i18n.t('quality.sharp.ratio')}` }));
    expect((harness.canvasProps.mock.calls.at(-1)?.[0] as { renderQuality: string }).renderQuality).toBe('sharp');
    fireEvent.click(within(cadDialog).getByRole('button', { name: i18n.t('hideTexts') }));
    expect(harness.adapter.setTextsVisible).toHaveBeenCalledWith(false);
  });

  it('applies an existing GPS fix only after the CAD renderer is ready', async () => {
    const position = {
      coords: {
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 49.61,
        longitude: 6.13,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 1,
      toJSON: () => ({}),
    } satisfies GeolocationPosition;
    Object.assign(harness.locationState, {
      permission: 'granted', position, accuracy: 5, follow: 'following', error: null,
    });
    const { container } = renderPage();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'gps-plan.dwg')] } });
    expect(harness.adapter.centerOn).not.toHaveBeenCalled();

    await waitFor(() => expect(harness.adapter.centerOn).toHaveBeenCalledOnce());
  });

  it('measures from the MLightCAD aim without enabling CAD selection', async () => {
    harness.adapter.resolveAimPoint.mockReturnValue({ coordinate: [80_000, 100_000], source: 'aim' });
    const { container, getByRole, getByText } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'measure.dwg')] } });
    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());

    fireEvent.click(getByRole('button', { name: i18n.t('measurementOpen') }));
    await waitFor(() => expect(harness.adapter.setMeasurementCaptureActive).toHaveBeenCalledWith(true));
    fireEvent.click(getByRole('button', { name: i18n.t('measurementSetFirstPoint') }));
    harness.adapter.resolveAimPoint.mockReturnValue({
      coordinate: [80_003, 100_004],
      source: 'cad-snap',
      snapKind: 'endpoint',
    });
    fireEvent.click(getByRole('button', { name: i18n.t('measurementSetSecondPoint') }));

    expect(getByText('5,000 m')).toBeInTheDocument();
    expect(harness.adapter.setMeasurementOverlay).toHaveBeenLastCalledWith(
      [80_000, 100_000],
      [80_003, 100_004],
    );
  });

  it('captures desktop mouse clicks with hover snap while touch remains aim-only', async () => {
    stubFinePointer();
    harness.adapter.resolveScreenPoint.mockReturnValue({
      coordinate: [80_000, 100_000],
      source: 'cad-snap',
      snapKind: 'endpoint',
    });
    const { container, getByRole, getByText } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'desktop-measure.dwg')] } });
    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());
    fireEvent.click(getByRole('button', { name: i18n.t('measurementOpen') }));
    const interaction = container.querySelector('.mlightcad-interaction-layer') as HTMLElement;

    fireEvent.pointerDown(interaction, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 90, clientY: 110 });
    fireEvent.pointerUp(interaction, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 90, clientY: 110 });
    expect(harness.adapter.resolveScreenPoint).not.toHaveBeenCalled();
    expect(getByRole('button', { name: i18n.t('measurementSetFirstPoint') })).toBeInTheDocument();

    fireEvent.pointerMove(interaction, { pointerType: 'mouse', pointerId: 2, clientX: 100, clientY: 120 });
    await waitFor(() => expect(harness.adapter.setSnapPreview).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cad-snap',
      snapKind: 'endpoint',
    })));

    fireEvent.pointerDown(interaction, { pointerType: 'mouse', pointerId: 2, button: 0, clientX: 100, clientY: 120 });
    fireEvent.pointerUp(interaction, { pointerType: 'mouse', pointerId: 2, button: 0, clientX: 100, clientY: 120 });
    expect(getByRole('button', { name: i18n.t('measurementSetSecondPoint') })).toBeInTheDocument();

    harness.adapter.resolveScreenPoint.mockReturnValue({
      coordinate: [80_003, 100_004],
      source: 'aim',
    });
    fireEvent.pointerDown(interaction, { pointerType: 'mouse', pointerId: 3, button: 0, clientX: 130, clientY: 150 });
    fireEvent.pointerUp(interaction, { pointerType: 'mouse', pointerId: 3, button: 0, clientX: 130, clientY: 150 });
    expect(getByText('5,000 m')).toBeInTheDocument();
  });

  it('does not cover a viewer-switched measurement with the empty CAD drawer', () => {
    const { getByRole, queryByRole } = render(
      <CadSessionProvider><MeasuredMlightViewer /></CadSessionProvider>,
    );

    fireEvent.click(getByRole('button', { name: 'Mount measured MLightCAD' }));

    expect(getByRole('region', { name: i18n.t('measurementTitle') })).toBeInTheDocument();
    expect(queryByRole('dialog', { name: i18n.t('dwgControlsTitle') })).not.toBeInTheDocument();
  });

  it('groups layer changes into one reload and restores the CAD camera', async () => {
    const { container, getByRole } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'layers.dwg')] } });

    await waitFor(() => expect(getByRole('button', { name: i18n.t('layers') })).toBeEnabled());
    fireEvent.click(getByRole('button', { name: i18n.t('layers') }));
    fireEvent.click(getByRole('button', { name: i18n.t('layerDrawer.hideLayer', { name: 'Draft' }) }));
    fireEvent.click(getByRole('button', { name: i18n.t('layerDrawer.showLayer', { name: 'Draft' }) }));

    const apply = getByRole('button', { name: i18n.t('layerDrawer.applyChanges') });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() => {
      const latestProps = harness.canvasProps.mock.calls.at(-1)?.[0] as { fileRevision: number } | undefined;
      expect(latestProps?.fileRevision).toBe(2);
      expect(harness.adapter.setCamera).toHaveBeenCalledWith({ center: [80_000, 100_000], resolution: 2 });
    });
  });

  it('restores worker-filtered layers from Settings with exactly one controlled reload', async () => {
    const { container, getByRole } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'restore-layer.dwg')] } });

    await waitFor(() => expect(getByRole('button', { name: i18n.t('layers') })).toBeEnabled());
    fireEvent.click(getByRole('button', { name: i18n.t('layers') }));
    const layerDialog = getByRole('dialog', { name: i18n.t('layersTitle') });
    fireEvent.click(within(layerDialog).getByRole('button', {
      name: i18n.t('layerDrawer.hideLayer', { name: 'Draft' }),
    }));
    fireEvent.click(layerDialog.closest('.sheet-shell') as HTMLElement);

    fireEvent.click(getByRole('button', { name: i18n.t('cadSettingsTitle') }));
    const settings = getByRole('dialog', { name: i18n.t('cadSettingsTitle') });
    fireEvent.click(within(settings).getByRole('button', {
      name: i18n.t('showHiddenLayers', { count: 1 }),
    }));

    await waitFor(() => {
      const latestProps = harness.canvasProps.mock.calls.at(-1)?.[0] as { fileRevision: number } | undefined;
      expect(latestProps?.fileRevision).toBe(2);
      expect(harness.adapter.setAllLayersVisible).toHaveBeenCalledTimes(1);
      expect(harness.adapter.setAllLayersVisible).toHaveBeenCalledWith(true);
    });
  });

  it('applies a draw-order interaction exactly once before persisting it in the session', async () => {
    const { container, getByRole } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'order.dwg')] } });

    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());
    const canvas = harness.canvasProps.mock.calls.at(-1)?.[0] as {
      onSelection: (selection: {
        featureId: string;
        objectKey: string;
        drawOrderGroupKey: string;
        layerId: string;
        cadType: string;
        label: string;
        blockPath: string[];
      }) => void;
    };
    act(() => canvas.onSelection({
      featureId: '42',
      objectKey: 'entity:42',
      drawOrderGroupKey: 'group:42',
      layerId: 'draft',
      cadType: 'HATCH',
      label: '',
      blockPath: [],
    }));

    harness.adapter.setObjectDrawOrder.mockClear();
    harness.adapter.applyObjectDrawOrder.mockClear();
    fireEvent.click(getByRole('button', { name: i18n.t('bringToFront') }));

    expect(harness.adapter.setObjectDrawOrder).toHaveBeenCalledTimes(1);
    expect(harness.adapter.setObjectDrawOrder).toHaveBeenCalledWith('group:42', 'front');
    await waitFor(() => expect(harness.adapter.applyObjectDrawOrder).not.toHaveBeenCalled());
  });

  it('opens the desktop position menu at the precise map or CAD point and removes its target on close', async () => {
    stubFinePointer();
    const { container, getByRole, getByText, queryByRole } = renderPage();
    closeInitialDwgSheet(container);
    const map = container.querySelector('[data-testid="mlightcad-map"]') as HTMLElement;

    fireEvent.contextMenu(map, { clientX: 120, clientY: 160 });

    expect(harness.resolveScreenCoordinate).toHaveBeenCalledWith({ x: 120, y: 160 });
    expect(getByRole('menu', { name: i18n.t('mapContext.title') })).toBeInTheDocument();
    expect(getByText('80000.13, 100000.88')).toBeInTheDocument();
    expect(container.querySelector('.map-context-target-cross')).toHaveStyle({ left: '120px', top: '160px' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(queryByRole('menu', { name: i18n.t('mapContext.title') })).not.toBeInTheDocument();
    expect(container.querySelector('.map-context-target-cross')).not.toBeInTheDocument();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['dwg'], 'context.dwg')] } });
    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());
    closeInitialDwgSheet(container);
    harness.adapter.resolveScreenPoint.mockClear();
    harness.adapter.resolveScreenPoint.mockReturnValue({ coordinate: [81_000.5, 101_000.25], source: 'aim' });
    harness.resolveScreenCoordinate.mockClear();

    fireEvent.contextMenu(map, { clientX: 130, clientY: 170 });

    expect(harness.adapter.resolveScreenPoint).toHaveBeenCalledWith({ x: 130, y: 170 }, false);
    expect(harness.resolveScreenCoordinate).not.toHaveBeenCalled();
    expect(getByText('81000.50, 101000.25')).toBeInTheDocument();
  });

  it('opens the mobile position sheet only after an unmoved single-finger long press', () => {
    vi.useFakeTimers();
    stubFinePointer(false);
    try {
      const { container, getByRole, queryByRole } = renderPage();
      closeInitialDwgSheet(container);
      const map = container.querySelector('[data-testid="mlightcad-map"]') as HTMLElement;

      fireEvent.pointerDown(map, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 90, clientY: 110 });
      act(() => vi.advanceTimersByTime(549));
      expect(queryByRole('dialog', { name: i18n.t('mapContext.title') })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));

      expect(getByRole('dialog', { name: i18n.t('mapContext.title') })).toBeInTheDocument();
      expect(container.querySelector('.map-context-target-cross')).toHaveStyle({ left: '90px', top: '110px' });
      fireEvent.pointerUp(map, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 90, clientY: 110 });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('cancels mobile long press after movement or a second touch', () => {
    vi.useFakeTimers();
    stubFinePointer(false);
    try {
      const { container, queryByRole } = renderPage();
      closeInitialDwgSheet(container);
      const map = container.querySelector('[data-testid="mlightcad-map"]') as HTMLElement;

      fireEvent.pointerDown(map, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(map, { pointerType: 'touch', pointerId: 1, clientX: 61, clientY: 50 });
      act(() => vi.advanceTimersByTime(600));
      expect(queryByRole('dialog', { name: i18n.t('mapContext.title') })).not.toBeInTheDocument();
      fireEvent.pointerUp(map, { pointerType: 'touch', pointerId: 1, clientX: 61, clientY: 50 });

      fireEvent.pointerDown(map, { pointerType: 'touch', pointerId: 2, button: 0, clientX: 70, clientY: 70 });
      fireEvent.pointerDown(map, { pointerType: 'touch', pointerId: 3, button: 0, clientX: 72, clientY: 72 });
      act(() => vi.advanceTimersByTime(600));
      expect(queryByRole('dialog', { name: i18n.t('mapContext.title') })).not.toBeInTheDocument();
      fireEvent.pointerUp(map, { pointerType: 'touch', pointerId: 2, clientX: 70, clientY: 70 });
      fireEvent.pointerUp(map, { pointerType: 'touch', pointerId: 3, clientX: 72, clientY: 72 });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('loads one dropped DWG and requires confirmation before replacing it', async () => {
    stubFinePointer();
    const { container, getByRole, queryByRole } = renderPage();
    const map = container.querySelector('[data-testid="mlightcad-map"]') as HTMLElement;
    const first = new File(['first'], 'first.dwg');
    const second = new File(['second'], 'second.dwg');
    const firstTransfer = { types: ['Files'], files: [first], dropEffect: 'none' };

    fireEvent.dragEnter(map, { dataTransfer: firstTransfer });
    expect(container.querySelector('.dwg-drop-overlay')).toBeInTheDocument();
    fireEvent.drop(map, { dataTransfer: firstTransfer });
    await waitFor(() => expect((harness.canvasProps.mock.calls.at(-1)?.[0] as { file: File }).file.name).toBe('first.dwg'));

    const secondTransfer = { types: ['Files'], files: [second], dropEffect: 'none' };
    fireEvent.dragEnter(map, { dataTransfer: secondTransfer });
    fireEvent.drop(map, { dataTransfer: secondTransfer });
    const confirmation = getByRole('dialog', { name: i18n.t('confirmation.replaceDwgTitle') });
    expect(confirmation).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole('button', { name: i18n.t('confirmation.cancel') }));
    expect(queryByRole('dialog', { name: i18n.t('confirmation.replaceDwgTitle') })).not.toBeInTheDocument();
    expect((harness.canvasProps.mock.calls.at(-1)?.[0] as { file: File }).file.name).toBe('first.dwg');

    fireEvent.dragEnter(map, { dataTransfer: secondTransfer });
    fireEvent.drop(map, { dataTransfer: secondTransfer });
    fireEvent.click(within(getByRole('dialog', { name: i18n.t('confirmation.replaceDwgTitle') }))
      .getByRole('button', { name: i18n.t('confirmation.replaceDwgConfirm') }));
    await waitFor(() => expect((harness.canvasProps.mock.calls.at(-1)?.[0] as { file: File }).file.name).toBe('second.dwg'));
  });

  it('rejects invalid or multiple desktop drops in the DWG drawer', () => {
    stubFinePointer();
    const { container, getByRole, getByText } = renderPage();
    closeInitialDwgSheet(container);
    const map = container.querySelector('[data-testid="mlightcad-map"]') as HTMLElement;
    const header = container.querySelector('.app-header') as HTMLElement;
    const outsideTransfer = { types: ['Files'], files: [new File(['dwg'], 'outside.dwg')], dropEffect: 'none' };

    fireEvent.dragEnter(map, { dataTransfer: outsideTransfer });
    fireEvent.drop(header, { dataTransfer: outsideTransfer });
    expect((harness.canvasProps.mock.calls.at(-1)?.[0] as { file: File | null }).file).toBeNull();
    expect(container.querySelector('.dwg-drop-overlay')).not.toBeInTheDocument();

    const invalidTransfer = { types: ['Files'], files: [new File(['x'], 'notes.txt')], dropEffect: 'none' };

    fireEvent.dragEnter(map, { dataTransfer: invalidTransfer });
    fireEvent.drop(map, { dataTransfer: invalidTransfer });
    expect(getByRole('dialog', { name: i18n.t('dwgControlsTitle') })).toBeInTheDocument();
    expect(getByText(i18n.t('invalidFile'))).toBeInTheDocument();

    closeInitialDwgSheet(container);
    const multipleTransfer = {
      types: ['Files'],
      files: [new File(['a'], 'a.dwg'), new File(['b'], 'b.dwg')],
      dropEffect: 'none',
    };
    fireEvent.dragEnter(map, { dataTransfer: multipleTransfer });
    fireEvent.drop(map, { dataTransfer: multipleTransfer });
    expect(getByText(i18n.t('dwgDrop.singleFile'))).toBeInTheDocument();
  });
});
