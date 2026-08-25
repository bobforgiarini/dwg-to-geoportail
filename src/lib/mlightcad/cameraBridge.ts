import type { MlightCadCamera } from './types';

export interface CadCameraView {
  center: { x: number; y: number };
  screenToWorld: (point: { x: number; y: number }) => { x: number; y: number };
}

export interface SyncedMapView {
  setCenter: (center: [number, number]) => void;
  setResolution: (resolution: number) => void;
  setRotation: (rotation: number) => void;
}

/** Converts the CAD camera into the OpenLayers center/resolution contract. */
export function readCadCamera(view: CadCameraView): MlightCadCamera {
  const start = view.screenToWorld({ x: 0, y: 0 });
  const next = view.screenToWorld({ x: 1, y: 0 });
  const resolution = Math.hypot(next.x - start.x, next.y - start.y);

  return {
    center: [view.center.x, view.center.y],
    resolution: Number.isFinite(resolution) && resolution > 0 ? resolution : 1,
  };
}

/** Applies one renderer camera snapshot to OpenLayers without animation or feedback. */
export function syncCadCameraToMap(view: SyncedMapView, camera: MlightCadCamera): boolean {
  if (
    !Number.isFinite(camera.center[0])
    || !Number.isFinite(camera.center[1])
    || !Number.isFinite(camera.resolution)
    || camera.resolution <= 0
  ) {
    return false;
  }

  view.setCenter([camera.center[0], camera.center[1]]);
  view.setResolution(camera.resolution);
  view.setRotation(0);
  return true;
}

export function cameraPixelError(
  expected: [number, number],
  actual: [number, number],
  resolution: number,
): number {
  if (!Number.isFinite(resolution) || resolution <= 0) return Number.POSITIVE_INFINITY;
  return Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) / resolution;
}
