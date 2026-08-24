import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';

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
  features: Feature<Geometry>[];
  autoHiddenFeatureIds: string[];
  warnings: string[];
}

export interface SelectedCadObject {
  featureId: string;
  layerId: string;
  cadType: string;
  label: string;
}

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
