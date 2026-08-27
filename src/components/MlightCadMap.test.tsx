import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type { MlightCadCamera } from '../lib/mlightcad/types';
import type { LocationTrackingState } from '../types/models';
import { MlightCadMap } from './MlightCadMap';

const harness = vi.hoisted(() => {
  const interaction = { setActive: vi.fn() };
  const view = {
    animate: vi.fn(),
    getCenter: vi.fn(() => [80_000, 100_000]),
    getResolution: vi.fn(() => 50),
    setCenter: vi.fn(),
    setResolution: vi.fn(),
    setRotation: vi.fn(),
  };
  const renderSync = vi.fn();
  const removeLayer = vi.fn();
  const basemaps: Array<{
    getSource: () => { clear: ReturnType<typeof vi.fn> };
    setVisible: ReturnType<typeof vi.fn>;
  }> = [];
  const basemapOptions: unknown[] = [];
  const mapOptions: unknown[] = [];
  const viewOptions: unknown[] = [];
  const viewports: HTMLDivElement[] = [];
  return { basemapOptions, basemaps, interaction, mapOptions, removeLayer, renderSync, view, viewOptions, viewports };
});

vi.mock('ol/interaction/defaults', () => ({
  defaults: () => ({ forEach: (callback: (interaction: typeof harness.interaction) => void) => callback(harness.interaction) }),
}));

vi.mock('ol/View', () => ({
  default: vi.fn(function View(options: unknown) {
    harness.viewOptions.push(options);
    return harness.view;
  }),
}));

vi.mock('ol/Map', () => ({
  default: vi.fn(function Map(options: unknown) {
    harness.mapOptions.push(options);
    const viewport = document.createElement('div');
    const listeners = new globalThis.Map<string, Set<() => void>>();
    harness.viewports.push(viewport);
    return {
      getInteractions: () => ({ forEach: (callback: (interaction: typeof harness.interaction) => void) => callback(harness.interaction) }),
      getLayers: () => ({ insertAt: vi.fn(), setAt: vi.fn() }),
      getView: () => harness.view,
      getViewport: () => viewport,
      on: vi.fn((event: string, listener: () => void) => {
        const eventListeners = listeners.get(event) ?? new Set<() => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      }),
      removeLayer: harness.removeLayer,
      renderSync: () => {
        harness.renderSync();
        listeners.get('moveend')?.forEach((listener) => listener());
      },
      setTarget: vi.fn(),
      un: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
    };
  }),
}));

vi.mock('ol/proj', () => ({
  transform: (coordinate: number[]) => coordinate,
}));

vi.mock('../lib/geoportail', () => ({
  bindBasemapSourceHealth: () => vi.fn(),
  createBasemapLayer: (_mode: unknown, options: unknown) => {
    harness.basemapOptions.push(options);
    const source = { clear: vi.fn() };
    const layer = {
      getSource: () => source,
      setVisible: vi.fn(),
    };
    harness.basemaps.push(layer);
    return layer;
  },
}));

const idleLocation: LocationTrackingState = {
  permission: 'idle',
  position: null,
  accuracy: null,
  follow: 'off',
  error: null,
};

describe('MlightCadMap interaction handover', () => {
  beforeEach(() => {
    harness.basemaps.length = 0;
    harness.basemapOptions.length = 0;
    harness.mapOptions.length = 0;
    harness.viewOptions.length = 0;
    harness.viewports.length = 0;
    harness.interaction.setActive.mockClear();
    harness.removeLayer.mockClear();
    harness.renderSync.mockClear();
    Object.values(harness.view).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    harness.view.getCenter.mockReturnValue([80_000, 100_000]);
    harness.view.getResolution.mockReturnValue(50);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('enables OpenLayers until MLightCAD is ready and renders no north control', () => {
    const props = {
      adapter: null,
      basemapHealth: { mode: 'wmts', status: 'loading', generation: 0, transitionReason: 'initial' } as const,
      basemapHealthReporter: {
        sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
      },
      basemapVisible: true,
      location: idleLocation,
      onCoordinate: vi.fn(),
      onManualMove: vi.fn(),
    };
    const { queryByRole, rerender } = render(<MlightCadMap {...props} mlightControlsActive={false} />);

    expect(harness.interaction.setActive).toHaveBeenLastCalledWith(true);
    expect(queryByRole('button')).not.toBeInTheDocument();
    expect(harness.viewOptions.at(-1)).toMatchObject({ minResolution: 0 });
    expect(harness.viewOptions.at(-1)).toMatchObject({ projection: 'EPSG:2169' });
    expect(harness.viewOptions.at(-1)).not.toHaveProperty('extent');

    harness.viewports.at(-1)?.dispatchEvent(new WheelEvent('wheel'));
    expect(props.onManualMove).toHaveBeenCalledOnce();

    rerender(<MlightCadMap {...props} mlightControlsActive />);
    expect(harness.interaction.setActive).toHaveBeenLastCalledWith(false);
  });

  it('toggles only the current basemap layer', () => {
    const props = {
      adapter: null,
      basemapHealth: { mode: 'wmts', status: 'loading', generation: 0, transitionReason: 'initial' } as const,
      basemapHealthReporter: {
        sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
      },
      location: idleLocation,
      mlightControlsActive: false,
      onCoordinate: vi.fn(),
      onManualMove: vi.fn(),
    };
    const { rerender } = render(<MlightCadMap {...props} basemapVisible />);
    const currentLayer = harness.basemaps.at(-1);

    rerender(<MlightCadMap {...props} basemapVisible={false} />);
    expect(harness.basemaps.at(-1)).toBe(currentLayer);
    expect(currentLayer?.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('releases the basemap while CAD preparation needs the mobile memory budget', () => {
    const props = {
      adapter: null,
      basemapHealth: { mode: 'wmts', status: 'loading', generation: 0, transitionReason: 'initial' } as const,
      basemapHealthReporter: {
        sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
      },
      basemapVisible: true,
      location: idleLocation,
      mlightControlsActive: false,
      onCoordinate: vi.fn(),
      onManualMove: vi.fn(),
    };
    const { rerender } = render(<MlightCadMap {...props} basemapSuspended={false} />);
    const original = harness.basemaps.at(-1);

    rerender(<MlightCadMap {...props} basemapSuspended />);

    expect(original?.getSource().clear).toHaveBeenCalledOnce();
    expect(harness.removeLayer).toHaveBeenCalledWith(original);
    expect(harness.basemaps).toHaveLength(1);

    rerender(<MlightCadMap {...props} basemapSuspended={false} />);
    expect(harness.basemaps).toHaveLength(2);
  });

  it('centres OpenLayers on GPS while no CAD renderer owns the gestures', () => {
    const position = {
      coords: {
        accuracy: 6,
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

    render(<MlightCadMap
      adapter={null}
      basemapHealth={{ mode: 'wmts', status: 'loading', generation: 0, transitionReason: 'initial' }}
      basemapHealthReporter={{
        sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
      }}
      basemapVisible
      mlightControlsActive={false}
      location={{ ...idleLocation, permission: 'granted', position, accuracy: 6, follow: 'following' }}
      onCoordinate={vi.fn()}
      onManualMove={vi.fn()}
    />);

    expect(harness.view.animate).toHaveBeenCalledWith({
      center: [6.13, 49.61],
      resolution: 2,
      duration: 350,
    });
  });

  it('keeps every CAD camera event synchronous while publishing only the idle coordinate', () => {
    vi.useFakeTimers();
    let cameraListener: ((camera: MlightCadCamera) => void) | null = null;
    const removeListener = vi.fn();
    const adapter = {
      events: {
        camera: {
          addEventListener: vi.fn((listener: (camera: MlightCadCamera) => void) => {
            cameraListener = listener;
            return removeListener;
          }),
        },
      },
    } as unknown as MlightCadViewerAdapter;
    const onCoordinate = vi.fn();
    const { unmount } = render(<MlightCadMap
      adapter={adapter}
      basemapHealth={{ mode: 'wmts', status: 'ready', generation: 0, transitionReason: 'tile-loaded' }}
      basemapHealthReporter={{
        sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
      }}
      basemapVisible
      mlightControlsActive
      location={idleLocation}
      onCoordinate={onCoordinate}
      onManualMove={vi.fn()}
    />);
    const coordinateCallsBeforePan = onCoordinate.mock.calls.length;

    act(() => {
      for (let index = 0; index < 240; index += 1) {
        cameraListener?.({ center: [index, index + 1], resolution: 4 / (index + 1) });
      }
    });
    expect(harness.view.setCenter).toHaveBeenCalledTimes(240);
    expect(harness.view.setCenter).toHaveBeenLastCalledWith([239, 240]);
    expect(harness.view.setResolution).toHaveBeenLastCalledWith(4 / 240);
    expect(harness.renderSync).toHaveBeenCalledTimes(240);
    expect(onCoordinate).toHaveBeenCalledTimes(coordinateCallsBeforePan);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onCoordinate).toHaveBeenCalledTimes(coordinateCallsBeforePan + 1);
    expect(onCoordinate).toHaveBeenLastCalledWith([239, 240]);

    unmount();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('limits map pixel ratio and tile cache on coarse-pointer devices', () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    try {
      render(<MlightCadMap
        adapter={null}
        basemapHealth={{ mode: 'wmts', status: 'loading', generation: 0, transitionReason: 'initial' }}
        basemapHealthReporter={{
          sourceMounted: vi.fn(), tileLoadStart: vi.fn(), tileLoadEnd: vi.fn(), tileLoadError: vi.fn(),
        }}
        basemapVisible
        mlightControlsActive={false}
        location={idleLocation}
        onCoordinate={vi.fn()}
        onManualMove={vi.fn()}
      />);

      expect(harness.mapOptions.at(-1)).toMatchObject({ pixelRatio: 1 });
      expect(harness.basemapOptions.at(-1)).toEqual({ cacheSize: 32 });
    } finally {
      if (previous) Object.defineProperty(window, 'matchMedia', previous);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});
