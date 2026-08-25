import { describe, expect, it } from 'vitest';
import { cameraPixelError, readCadCamera, syncCadCameraToMap } from './cameraBridge';

describe('MLightCAD camera bridge', () => {
  it('maps the WCS center and metres per CSS pixel without an affine offset', () => {
    const camera = readCadCamera({
      center: { x: 80_123.5, y: 101_987.25 },
      screenToWorld: ({ x, y }) => ({ x: 80_000 + x * 0.25, y: 102_000 - y * 0.25 }),
    });

    expect(camera.center).toEqual([80_123.5, 101_987.25]);
    expect(camera.resolution).toBeCloseTo(0.25, 8);
    expect(cameraPixelError(camera.center, [80_124, 101_987.25], camera.resolution)).toBe(2);
  });

  it('uses a safe resolution if the renderer reports an invalid transform', () => {
    const camera = readCadCamera({
      center: { x: 80_000, y: 100_000 },
      screenToWorld: () => ({ x: 1, y: 1 }),
    });
    expect(camera.resolution).toBe(1);
  });

  it('synchronously applies deep CAD zoom and north-up rotation to the map', () => {
    const calls: unknown[][] = [];
    const synced = syncCadCameraToMap({
      setCenter: (center) => calls.push(['center', center]),
      setResolution: (resolution) => calls.push(['resolution', resolution]),
      setRotation: (rotation) => calls.push(['rotation', rotation]),
    }, {
      center: [1_176.41, 44_976.64],
      resolution: 0.00001,
    });

    expect(synced).toBe(true);
    expect(calls).toEqual([
      ['center', [1_176.41, 44_976.64]],
      ['resolution', 0.00001],
      ['rotation', 0],
    ]);
  });

  it('ignores an invalid renderer camera instead of corrupting the map view', () => {
    const setCenter = () => { throw new Error('must not be called'); };
    expect(syncCadCameraToMap({
      setCenter,
      setResolution: setCenter,
      setRotation: setCenter,
    }, { center: [Number.NaN, 100_000], resolution: 1 })).toBe(false);
  });
});
