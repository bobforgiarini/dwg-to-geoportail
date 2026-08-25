import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { CadSessionProvider } from '../session/CadSessionContext';
import MlightCadViewerPage from './MlightCadViewerPage';

const harness = vi.hoisted(() => {
  const layers = [{ id: 'draft', name: 'Draft', visible: true, featureCount: 12 }];
  const adapter = {
    cancel: vi.fn(() => Promise.resolve()),
    centerOn: vi.fn(),
    clearSelection: vi.fn(),
    fitDrawing: vi.fn(),
    hideObject: vi.fn(),
    hiddenObjectCount: 0,
    restoreHiddenObjects: vi.fn(),
    setAllLayersVisible: vi.fn(),
    setLayerVisible: vi.fn(),
    setOpacity: vi.fn(),
    setTextsVisible: vi.fn(),
  };
  return {
    adapter,
    canvasProps: vi.fn(),
    layers,
    mapProps: vi.fn(),
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

vi.mock('../lib/cad/importDwg', () => ({
  RECOMMENDED_DWG_BYTES: 10 * 1024 * 1024,
}));

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
    MlightCadMap: (props: Record<string, unknown>) => {
      harness.mapProps(props);
      return React.createElement('div', {
        'data-testid': 'mlightcad-map',
        'data-controls-active': String(props.mlightControlsActive),
      });
    },
  };
});

vi.mock('../components/MlightCadCanvas', async () => {
  const React = await import('react');
  type CanvasProps = {
    file: File | null;
    fileRevision: number;
    opacity: number;
    onAdapterChange: (adapter: typeof harness.adapter | null) => void;
    onProgress: (progress: { phase: 'ready'; percentage: number }) => void;
    onReady: (ready: { layers: typeof harness.layers; entityCount: number }) => void;
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
          props.onProgress({ phase: 'ready', percentage: 100 });
          props.onReady({ layers: harness.layers, entityCount: 12 });
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

describe('MLightCAD viewer page integration', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    window.history.replaceState(null, '', '/mlightcad');
    vi.clearAllMocks();
    Object.assign(harness.locationState, {
      permission: 'idle', position: null, accuracy: null, follow: 'off', error: null,
    });
  });

  afterEach(cleanup);

  it('shares the compact controls and hands gestures from OpenLayers to MLightCAD after loading', async () => {
    const { container, getByLabelText, getByRole, getByTestId, queryByRole } = renderPage();
    const actionBar = getByLabelText(i18n.t('mapActions'));
    const actionButtons = within(actionBar).getAllByRole('button');

    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      i18n.t('layers'),
      i18n.t('openCadControls'),
      i18n.t('locationStart'),
      i18n.t('fitDrawing'),
    ]);
    expect(actionButtons[0]).toBeDisabled();
    expect(actionButtons[3]).toBeDisabled();
    expect(getByTestId('mlightcad-map')).toHaveAttribute('data-controls-active', 'false');
    expect(container.querySelector('.mlightcad-interaction-layer')).toHaveClass('openlayers-active');
    expect(getByRole('dialog', { name: i18n.t('cadControlsTitle') })).toBeInTheDocument();

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
    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();

    fireEvent.click(layerDialog.closest('.sheet-shell') as HTMLElement);
    expect(queryByRole('dialog', { name: i18n.t('layersTitle') })).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('openCadControls') }));
    const cadDialog = getByRole('dialog', { name: i18n.t('cadControlsTitle') });
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
});
