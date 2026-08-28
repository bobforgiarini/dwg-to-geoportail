import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type { CadOverlayBlock, DwgPreflightReport } from '../lib/cad/preflightTypes';

export interface CadOverlayLayer {
  id: string;
  name: string;
  visible: boolean;
  featureCount: number;
}

export interface DwgImportResult {
  file: { name: string; size: number; lastModified: number };
  lurefExtent: [number, number, number, number] | null;
  layers: CadOverlayLayer[];
  blocks: CadOverlayBlock[];
  preflight: DwgPreflightReport | null;
  features: Feature<Geometry>[];
  autoHiddenFeatureIds: string[];
  warnings: string[];
}

export interface SelectedCadObject {
  featureId: string;
  objectKey: string;
  /** Stable render-order identity. Block-definition children share this key across all INSERT occurrences. */
  drawOrderGroupKey: string;
  layerId: string;
  cadType: string;
  label: string;
  /** Outer-to-inner block definition path. Empty for model-space entities. */
  blockPath: string[];
}

export type CadObjectDrawOrderTier = 'front' | 'back';

export interface CadObjectDrawOrder {
  /** Oldest-to-newest; the last item is rendered foremost. */
  front: string[];
  /** Oldest-to-newest; the last item is rendered farthest behind. */
  back: string[];
}

/** A two-dimensional coordinate in metres in Luxembourg's EPSG:2169 CRS. */
export type LurefCoordinate = readonly [x: number, y: number];

export type CadSnapKind =
  | 'endpoint'
  | 'vertex'
  | 'intersection'
  | 'midpoint'
  | 'center'
  | 'nearest';

export interface MeasurementPoint {
  coordinate: LurefCoordinate;
  source: 'aim' | 'cad-snap';
  snapKind?: CadSnapKind;
}

interface DistanceMeasurementBase {
  /** CAD snapping is a session preference and survives closing a measurement. */
  snapEnabled: boolean;
}

export type DistanceMeasurementState =
  | (DistanceMeasurementBase & { phase: 'inactive' })
  | (DistanceMeasurementBase & { phase: 'placing-first' })
  | (DistanceMeasurementBase & { phase: 'placing-second'; firstPoint: MeasurementPoint })
  | (DistanceMeasurementBase & {
      phase: 'complete';
      firstPoint: MeasurementPoint;
      secondPoint: MeasurementPoint;
    });

export type LocationPermission = 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable';
export type LocationFollowMode = 'off' | 'following' | 'paused';

export interface LocationTrackingState {
  permission: LocationPermission;
  position: GeolocationPosition | null;
  accuracy: number | null;
  follow: LocationFollowMode;
  error: string | null;
}

export type BasemapMode = 'wmts' | 'wms';
