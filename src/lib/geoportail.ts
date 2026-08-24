import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import WMTS from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { get as getProjection } from 'ol/proj';
import { getTopLeft, getWidth } from 'ol/extent';
import type { BasemapMode } from '../types/models';

export const GEOPORTAIL_ATTRIBUTION =
  '© <a href="https://geoportail.lu" target="_blank" rel="noopener">Geoportail Luxembourg</a>';
export const WMTS_URL = 'https://wmts1.geoportail.lu/opendata/service';
export const WMS_URL = 'https://wms.geoportail.lu/public_map_layers/service';

export function createWmtsSource(): WMTS {
  const projection = getProjection('EPSG:3857');
  if (!projection) throw new Error('EPSG:3857 is not available.');
  const extent = projection.getExtent();
  const size = getWidth(extent) / 256;
  const resolutions = Array.from({ length: 22 }, (_, zoom) => size / 2 ** zoom);
  const matrixIds = resolutions.map((_, zoom) => String(zoom));

  return new WMTS({
    url: WMTS_URL,
    layer: 'ortho_2025',
    matrixSet: 'GLOBAL_WEBMERCATOR_4_V3',
    format: 'image/jpeg',
    projection,
    tileGrid: new WMTSTileGrid({
      origin: getTopLeft(extent),
      resolutions,
      matrixIds,
    }),
    style: 'default',
    attributions: GEOPORTAIL_ATTRIBUTION,
    crossOrigin: 'anonymous',
  });
}

export function createWmsSource(): TileWMS {
  return new TileWMS({
    url: WMS_URL,
    params: {
      LAYERS: 'ortho_latest',
      TILED: true,
      FORMAT: 'image/jpeg',
    },
    projection: 'EPSG:3857',
    attributions: GEOPORTAIL_ATTRIBUTION,
    crossOrigin: 'anonymous',
  });
}

export function createBasemapLayer(mode: BasemapMode): TileLayer<WMTS | TileWMS> {
  return new TileLayer({
    source: mode === 'wmts' ? createWmtsSource() : createWmsSource(),
  });
}
