import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const basemaps: Array<{ setVisible: ReturnType<typeof vi.fn> }> = [];
  const viewOptions: unknown[] = [];
  const viewports: HTMLDivElement[] = [];
  return { basemaps, interaction, renderSync, view, viewOptions, viewports };
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
  default: vi.fn(function Map() {
    const viewport = document.createElement('div');
    harness.viewports.push(viewport);
    return {
      getInteractions: () => ({ forEach: (callback: (interaction: typeof harness.interaction) => void) => callback(harness.interaction) }),
      getLayers: () => ({ setAt: vi.fn() }),
      getView: () => harness.view,
      getViewport: () => viewport,
      on: vi.fn(),
      renderSync: harness.renderSync,
      setTarget: vi.fn(),
      un: vi.fn(),
    };
  }),
}));

vi.mock('ol/proj', () => ({
  transform: (coordinate: number[]) => coordinate,
}));

vi.mock('../lib/geoportail', () => ({
  createBasemapLayer: () => {
    const layer = {
      getSource: () => ({ once: vi.fn() }),
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
    harness.viewOptions.length = 0;
    harness.viewports.length = 0;
    harness.interaction.setActive.mockClear();
    harness.renderSync.mockClear();
    Object.values(harness.view).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    harness.view.getCenter.mockReturnValue([80_000, 100_000]);
    harness.view.getResolution.mockReturnValue(50);
  });

  afterEach(cleanup);

  it('enables OpenLayers until MLightCAD is ready and renders no north control', () => {
    const props = {
      adapter: null,
      basemapMode: 'wmts' as const,
      basemapVisible: true,
      location: idleLocation,
      onCoordinate: vi.fn(),
      onManualMove: vi.fn(),
      onWmtsError: vi.fn(),
    };
    const { queryByRole, rerender } = render(<MlightCadMap {...props} mlightControlsActive={false} />);

    expect(harness.interaction.setActive).toHaveBeenLastCalledWith(true);
    expect(queryByRole('button')).not.toBeInTheDocument();
    expect(harness.viewOptions.at(-1)).toMatchObject({ minResolution: 0 });
    expect(harness.viewOptions.at(-1)).not.toHaveProperty('extent');

    harness.viewports.at(-1)?.dispatchEvent(new WheelEvent('wheel'));
    expect(props.onManualMove).toHaveBeenCalledOnce();

    rerender(<MlightCadMap {...props} mlightControlsActive />);
    expect(harness.interaction.setActive).toHaveBeenLastCalledWith(false);
  });

  it('toggles only the current basemap layer', () => {
    const props = {
      adapter: null,
      basemapMode: 'wmts' as const,
      location: idleLocation,
      mlightControlsActive: false,
      onCoordinate: vi.fn(),
      onManualMove: vi.fn(),
      onWmtsError: vi.fn(),
    };
    const { rerender } = render(<MlightCadMap {...props} basemapVisible />);
    const currentLayer = harness.basemaps.at(-1);

    rerender(<MlightCadMap {...props} basemapVisible={false} />);
    expect(harness.basemaps.at(-1)).toBe(currentLayer);
    expect(currentLayer?.setVisible).toHaveBeenLastCalledWith(false);
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
      basemapMode="wmts"
      basemapVisible
      mlightControlsActive={false}
      location={{ ...idleLocation, permission: 'granted', position, accuracy: 6, follow: 'following' }}
      onCoordinate={vi.fn()}
      onManualMove={vi.fn()}
      onWmtsError={vi.fn()}
    />);

    expect(harness.view.animate).toHaveBeenCalledWith({
      center: [6.13, 49.61],
      resolution: 2,
      duration: 350,
    });
  });
});
