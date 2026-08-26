import type { MlightCadCamera } from './types';
import { lurefToMap } from '../crs';

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

function isFiniteCoordinate(coordinate: readonly number[]): coordinate is [number, number] {
  return Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);
}

/**
 * Returns the local EPSG:3857 scale at one LUREF coordinate.
 *
 * OpenLayers renders Geoportail in Web Mercator while MLightCAD keeps its
 * authoritative camera in drawing metres (EPSG:2169). A centred difference
 * over one drawing metre is stable even at very deep CAD zoom levels and
 * avoids treating one Web Mercator map unit as one LUREF metre.
 */
export function lurefResolutionToWebMercator(
  center: [number, number],
  lurefResolution: number,
): number | null {
  if (!isFiniteCoordinate(center) || !Number.isFinite(lurefResolution) || lurefResolution <= 0) {
    return null;
  }

  const west = lurefToMap([center[0] - 1, center[1]]);
  const east = lurefToMap([center[0] + 1, center[1]]);
  const south = lurefToMap([center[0], center[1] - 1]);
  const north = lurefToMap([center[0], center[1] + 1]);
  if (![west, east, south, north].every(isFiniteCoordinate)) return null;

  const xScale = Math.hypot(east[0] - west[0], east[1] - west[1]) / 2;
  const yScale = Math.hypot(north[0] - south[0], north[1] - south[1]) / 2;
  // readCadCamera measures its CSS-pixel resolution along the screen X axis.
  // Use that same basis here; averaging both axes introduces a measurable
  // scale error because the historic LUREF datum transformation is not
  // perfectly isotropic.
  const localScale = Number.isFinite(xScale) && xScale > 0 ? xScale : yScale;
  const projected = lurefResolution * localScale;
  return Number.isFinite(projected) && projected > 0 ? projected : null;
}

/** Projects a complete CAD camera snapshot into the OpenLayers map CRS. */
export function projectCadCameraToMap(camera: MlightCadCamera): MlightCadCamera | null {
  if (
    !isFiniteCoordinate(camera.center)
    || !Number.isFinite(camera.resolution)
    || camera.resolution <= 0
  ) {
    return null;
  }

  const center = lurefToMap(camera.center);
  const resolution = lurefResolutionToWebMercator(camera.center, camera.resolution);
  if (!isFiniteCoordinate(center) || resolution === null) return null;
  return { center: [center[0], center[1]], resolution };
}

/** Applies one renderer camera snapshot to OpenLayers without animation or feedback. */
export function syncCadCameraToMap(view: SyncedMapView, camera: MlightCadCamera): boolean {
  const projected = projectCadCameraToMap(camera);
  if (!projected) return false;

  view.setCenter(projected.center);
  view.setResolution(projected.resolution);
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
