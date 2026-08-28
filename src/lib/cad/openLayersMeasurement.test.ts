import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import { describe, expect, it, vi } from 'vitest';
import { resolveOpenLayersAim } from './openLayersMeasurement';

function line(coordinates: number[][], cadType = 'LINE'): Feature<LineString> {
  const feature = new Feature(new LineString(coordinates));
  feature.set('cadType', cadType);
  return feature;
}

describe('resolveOpenLayersAim', () => {
  it('keeps the exact aim when snapping is disabled', () => {
    expect(resolveOpenLayersAim({
      aim: [12, 34],
      resolution: 1,
      features: [line([[10, 34], [20, 34]])],
      snapEnabled: false,
    })).toEqual({ coordinate: [12, 34] });
  });

  it('uses an 18 CSS-pixel tolerance independent of device pixel ratio', () => {
    const feature = line([[0, 0], [100, 0]]);
    expect(resolveOpenLayersAim({
      aim: [1, 1],
      resolution: 1,
      features: [feature],
      snapEnabled: true,
    })).toEqual({ coordinate: [0, 0], snapKind: 'endpoint' });
    expect(resolveOpenLayersAim({
      aim: [40, 19],
      resolution: 1,
      features: [feature],
      snapEnabled: true,
    })).toEqual({ coordinate: [40, 19] });
  });

  it('prioritises vertices over intersections and intersections over midpoints', () => {
    const horizontal = line([[0, 0], [100, 0]]);
    const vertical = line([[50, -50], [50, 50]]);
    expect(resolveOpenLayersAim({
      aim: [52, 2],
      resolution: 1,
      features: [horizontal, vertical],
      snapEnabled: true,
    })).toEqual({ coordinate: [50, 0], snapKind: 'intersection' });

    const endpoint = line([[51, 1], [80, 30]]);
    expect(resolveOpenLayersAim({
      aim: [52, 2],
      resolution: 1,
      features: [horizontal, vertical, endpoint],
      snapEnabled: true,
    })).toEqual({ coordinate: [51, 1], snapKind: 'endpoint' });
  });

  it('snaps to a line midpoint before the nearest geometry point', () => {
    expect(resolveOpenLayersAim({
      aim: [50, 8],
      resolution: 1,
      features: [line([[0, 0], [100, 0]])],
      snapEnabled: true,
    })).toEqual({ coordinate: [50, 0], snapKind: 'midpoint' });
  });

  it('falls back to the nearest point on visible geometry', () => {
    expect(resolveOpenLayersAim({
      aim: [30, 4],
      resolution: 1,
      features: [line([[0, 0], [100, 0]])],
      snapEnabled: true,
    })).toEqual({ coordinate: [30, 0], snapKind: 'nearest' });
  });

  it('finds point vertices and sampled circle centres without exposing sampled vertices', () => {
    const point = new Feature(new Point([4, 5]));
    expect(resolveOpenLayersAim({
      aim: [5, 5],
      resolution: 1,
      features: [point],
      snapEnabled: true,
    })).toEqual({ coordinate: [4, 5], snapKind: 'vertex' });

    const circle = line([[0, 5], [5, 10], [10, 5], [5, 0], [0, 5]], 'CIRCLE');
    expect(resolveOpenLayersAim({
      aim: [5, 5],
      resolution: 1,
      features: [circle],
      snapEnabled: true,
    })).toEqual({ coordinate: [5, 5], snapKind: 'center' });

    const arc = line([[0, 30], [21, 21], [30, 0]], 'ARC');
    arc.set('cadSnapCenter', [0, 0]);
    expect(resolveOpenLayersAim({
      aim: [1, 1],
      resolution: 1,
      features: [arc],
      snapEnabled: true,
    })).toEqual({ coordinate: [0, 0], snapKind: 'center' });
  });

  it('never snaps to a feature rejected by the shared visibility predicate', () => {
    const hidden = line([[10, 10], [20, 10]]);
    hidden.set('visible', false);
    const visible = line([[-100, 0], [200, 0]]);
    const result = resolveOpenLayersAim({
      aim: [10, 10],
      resolution: 1,
      features: [hidden, visible],
      snapEnabled: true,
      isFeatureVisible: (feature) => feature.get('visible') !== false,
    });
    expect(result.snapKind).toBe('nearest');
    expect(result.coordinate[0]).toBeCloseTo(10, 10);
    expect(result.coordinate[1]).toBe(0);
  });

  it('bounds geometry traversal before expanding dense feature coordinate arrays', () => {
    const denseFeatures = Array.from({ length: 80 }, (_, index) => {
      const feature = line([[0, index / 100], [100, index / 100]]);
      const geometry = feature.getGeometry()!;
      const spy = vi.spyOn(geometry, 'getFlatCoordinates');
      return { feature, spy };
    });

    resolveOpenLayersAim({
      aim: [50, 0],
      resolution: 1,
      features: denseFeatures.map(({ feature }) => feature),
      snapEnabled: true,
    });

    expect(denseFeatures.reduce((calls, { spy }) => calls + spy.mock.calls.length, 0)).toBeLessThanOrEqual(48);
  });

  it('caps segment traversal while retaining endpoint and vertex priority', () => {
    const coordinates: Array<[number, number]> = Array.from({ length: 2_001 }, (_, index) => [index, 0]);
    const feature = line(coordinates);
    const geometry = feature.getGeometry()!;
    let coordinateReads = 0;
    const boundedCoordinates = new Proxy(coordinates.flat(), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) coordinateReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    vi.spyOn(geometry, 'getFlatCoordinates').mockReturnValue(boundedCoordinates);

    expect(resolveOpenLayersAim({
      aim: [250, 1],
      resolution: 1,
      features: [feature],
      snapEnabled: true,
    })).toEqual({ coordinate: [250, 0], snapKind: 'vertex' });
    expect(coordinateReads).toBeLessThanOrEqual(2_100);
  });
});
