import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { DEFAULT_CAD_APPEARANCE } from '../lib/cad/appearance';
import type { DwgImportResult, LocationTrackingState } from '../types/models';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';

interface HarnessMapEvent {
  pixel: number[];
  coordinate?: number[];
  dragging?: boolean;
  originalEvent?: Event;
}

const harness = vi.hoisted(() => ({
  listeners: new globalThis.Map<string, Set<(event: HarnessMapEvent) => void>>(),
  selectedFeature: null as Feature<Point> | null,
  view: null as import('ol/View').default | null,
}));

vi.mock('ol/Map', () => ({
  default: vi.fn(function Map(options: { view: import('ol/View').default }) {
    harness.view = options.view;
    const viewport = document.createElement('div');
    return {
      getView: () => options.view,
      getViewport: () => viewport,
      getLayers: () => ({ insertAt: vi.fn(), setAt: vi.fn() }),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      forEachFeatureAtPixel: () => harness.selectedFeature,
      on: vi.fn((event: string, listener: (event: HarnessMapEvent) => void) => {
        const listeners = harness.listeners.get(event) ?? new Set();
        listeners.add(listener);
        harness.listeners.set(event, listeners);
      }),
      un: vi.fn((event: string, listener: (event: HarnessMapEvent) => void) => {
        harness.listeners.get(event)?.delete(listener);
      }),
      setTarget: vi.fn(),
    };
  }),
}));

vi.mock('../lib/geoportail', () => ({
  bindBasemapSourceHealth: () => vi.fn(),
  createBasemapLayer: () => ({
    getSource: () => ({ clear: vi.fn() }),
    setVisible: vi.fn(),
    setZIndex: vi.fn(),
  }),
  createCadastreLayers: () => [],
}));

vi.mock('../lib/cad/importRecovery', () => ({
  browserPreflightDevice: () => ({ mobile: false }),
}));

const idleLocation: LocationTrackingState = {
  permission: 'idle',
  position: null,
  accuracy: null,
  follow: 'off',
  error: null,
};

function drawing(feature: Feature<Point>): DwgImportResult {
  return {
    file: { name: 'test.dwg', size: 1, lastModified: 1 },
    lurefExtent: null,
    layers: [{ id: 'A', name: 'A', visible: true, featureCount: 1 }],
    blocks: [],
    preflight: null,
    features: [feature],
    autoHiddenFeatureIds: [],
    warnings: [],
  };
}

function baseProps(feature: Feature<Point>) {
  return {
    dwg: drawing(feature),
    visibleLayers: new Set(['A']),
    location: idleLocation,
    basemapHealth: { mode: 'wmts', status: 'ready', generation: 0, transitionReason: 'tile-loaded' } as const,
    basemapHealthReporter: {
      sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
    },
    basemapVisible: true,
    onManualMove: vi.fn(),
    onCoordinate: vi.fn(),
    hiddenFeatureIds: new Set<string>(),
    hiddenObjectKeys: new Set<string>(),
    hiddenBlockNames: new Set<string>(),
    selectedFeatureId: null,
    onCadSelect: vi.fn(),
    cadTextVisible: true,
    cadOpacity: 100,
    objectDrawOrder: { front: [], back: [] },
    appearance: DEFAULT_CAD_APPEARANCE,
    fitOnDwgChange: false,
  };
}

describe('MapCanvas measurement integration', () => {
  beforeEach(async () => {
    harness.listeners.clear();
    harness.selectedFeature = null;
    harness.view = null;
    await i18n.changeLanguage('de');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('suppresses CAD selection while measurement capture is active', () => {
    const feature = new Feature(new Point([0, 0]));
    feature.setProperties({ featureId: '1', objectKey: '::1', drawOrderGroupKey: '::1', layerId: 'A', cadType: 'POINT' });
    harness.selectedFeature = feature;
    const props = baseProps(feature);
    const onMeasurementPointCapture = vi.fn();
    const { rerender } = render(<MapCanvas
      {...props}
      distanceMeasurement={{ phase: 'inactive', snapEnabled: true }}
      measurementCaptureActive={false}
    />);

    act(() => harness.listeners.get('singleclick')?.forEach((listener) => listener({ pixel: [0, 0] })));
    expect(props.onCadSelect).toHaveBeenCalledOnce();

    rerender(<MapCanvas
      {...props}
      distanceMeasurement={{ phase: 'placing-first', snapEnabled: true }}
      measurementCaptureActive
      onMeasurementPointCapture={onMeasurementPointCapture}
    />);
    act(() => harness.listeners.get('singleclick')?.forEach((listener) => listener({ pixel: [0, 0] })));
    expect(props.onCadSelect).toHaveBeenCalledOnce();
    expect(onMeasurementPointCapture).not.toHaveBeenCalled();
  });

  it('resolves the exact current view centre and snaps visible CAD points', () => {
    const feature = new Feature(new Point([0, 0]));
    feature.setProperties({ featureId: '1', objectKey: '::1', layerId: 'A', cadType: 'POINT' });
    const ref = createRef<MapCanvasHandle>();
    render(<MapCanvas
      ref={ref}
      {...baseProps(feature)}
      distanceMeasurement={{ phase: 'placing-first', snapEnabled: true }}
      measurementCaptureActive
    />);
    act(() => {
      harness.view?.setCenter([0, 0]);
      harness.view?.setResolution(1);
    });

    expect(ref.current?.resolveAimPoint(true)).toMatchObject({ source: 'cad-snap', snapKind: 'vertex' });
    expect(ref.current?.resolveAimPoint(false)).toMatchObject({ source: 'aim' });
  });

  it('does not run or render another snap preview after point 2 is complete', () => {
    vi.useFakeTimers();
    const feature = new Feature(new Point([0, 0]));
    feature.setProperties({ featureId: '1', objectKey: '::1', layerId: 'A', cadType: 'POINT' });
    const onSnapPreviewChange = vi.fn();
    render(<MapCanvas
      {...baseProps(feature)}
      distanceMeasurement={{
        phase: 'complete',
        snapEnabled: true,
        firstPoint: { coordinate: [80_000, 100_000], source: 'aim' },
        secondPoint: { coordinate: [80_003, 100_004], source: 'cad-snap', snapKind: 'endpoint' },
      }}
      measurementCaptureActive
      onSnapPreviewChange={onSnapPreviewChange}
    />);

    act(() => vi.advanceTimersByTime(200));

    expect(onSnapPreviewChange).toHaveBeenCalled();
    expect(onSnapPreviewChange.mock.calls.every(([point]) => point === null)).toBe(true);
  });

  it('uses mouse hover for a bounded snap preview and mouse click for the next point', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const feature = new Feature(new Point([0, 0]));
    feature.setProperties({ featureId: '1', objectKey: '::1', layerId: 'A', cadType: 'POINT' });
    const onSnapPreviewChange = vi.fn();
    const onMeasurementPointCapture = vi.fn();
    const props = baseProps(feature);
    render(<MapCanvas
      {...props}
      distanceMeasurement={{ phase: 'placing-first', snapEnabled: true }}
      measurementCaptureActive
      onSnapPreviewChange={onSnapPreviewChange}
      onMeasurementPointCapture={onMeasurementPointCapture}
    />);
    act(() => {
      harness.view?.setResolution(1);
      harness.listeners.get('pointermove')?.forEach((listener) => listener({
        pixel: [1, 0],
        coordinate: [1, 0],
        originalEvent: new MouseEvent('pointermove'),
      }));
    });

    expect(onSnapPreviewChange).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'cad-snap',
      snapKind: 'vertex',
    }));

    act(() => harness.listeners.get('singleclick')?.forEach((listener) => listener({
      pixel: [1, 0],
      coordinate: [1, 0],
      originalEvent: new MouseEvent('click'),
    })));

    expect(onMeasurementPointCapture).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cad-snap',
      snapKind: 'vertex',
    }));
    expect(props.onCadSelect).not.toHaveBeenCalled();
  });

  it('does not hover-snap to hidden CAD objects on desktop', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const feature = new Feature(new Point([0, 0]));
    feature.setProperties({ featureId: 'hidden', objectKey: '::hidden', layerId: 'A', cadType: 'POINT' });
    const onSnapPreviewChange = vi.fn();
    const onMeasurementPointCapture = vi.fn();
    const props = {
      ...baseProps(feature),
      hiddenFeatureIds: new Set(['hidden']),
    };
    render(<MapCanvas
      {...props}
      distanceMeasurement={{ phase: 'placing-first', snapEnabled: true }}
      measurementCaptureActive
      onSnapPreviewChange={onSnapPreviewChange}
      onMeasurementPointCapture={onMeasurementPointCapture}
    />);
    act(() => {
      harness.view?.setResolution(1);
      harness.listeners.get('pointermove')?.forEach((listener) => listener({
        pixel: [0, 0],
        coordinate: [0, 0],
        originalEvent: new MouseEvent('pointermove'),
      }));
    });

    act(() => harness.listeners.get('singleclick')?.forEach((listener) => listener({
      pixel: [0, 0],
      coordinate: [0, 0],
      originalEvent: new MouseEvent('click'),
    })));

    expect(onMeasurementPointCapture).toHaveBeenCalledWith(expect.objectContaining({ source: 'aim' }));
    expect(props.onCadSelect).not.toHaveBeenCalled();
    expect(onSnapPreviewChange.mock.calls.every(([point]) => point === null)).toBe(true);
  });
});
