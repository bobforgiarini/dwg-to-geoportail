import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import WMTS from 'ol/source/WMTS';
import type TileSource from 'ol/source/Tile';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { get as getProjection } from 'ol/proj';
import { getTopLeft, getWidth } from 'ol/extent';
import { unByKey } from 'ol/Observable';
import type { BasemapHealthReporter } from './basemapHealth';
import type { BasemapMode } from '../types/models';

export const GEOPORTAIL_ATTRIBUTION =
  '© <a href="https://geoportail.lu" target="_blank" rel="noopener">Geoportail Luxembourg</a>';
export const WMTS_URL = 'https://wmts1.geoportail.lu/opendata/service';
/** Geoportail serves its current Open Data WMS and WMTS from the same endpoint. */
export const WMS_URL = WMTS_URL;
export const WMTS_LAYER = 'ortho_2025';
export const WMS_LAYER = 'ortho_latest';
export const CADASTRE_PARCELS_WMTS_LAYER = 'parcels';
export const CADASTRE_LABELS_WMTS_LAYER = 'parcels_labels';

function createGeoportailWmtsSource(layer: string, format: string): WMTS {
  const projection = getProjection('EPSG:3857');
  if (!projection) throw new Error('EPSG:3857 is not available.');
  const extent = projection.getExtent();
  const size = getWidth(extent) / 256;
  const resolutions = Array.from({ length: 22 }, (_, zoom) => size / 2 ** zoom);
  const matrixIds = resolutions.map((_, zoom) => String(zoom));

  return new WMTS({
    url: WMTS_URL,
    layer,
    matrixSet: 'GLOBAL_WEBMERCATOR_4_V3',
    format,
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

export function createWmtsSource(): WMTS {
  return createGeoportailWmtsSource(WMTS_LAYER, 'image/jpeg');
}

export function createCadastreWmtsSources(): [WMTS, WMTS] {
  return [
    createGeoportailWmtsSource(CADASTRE_PARCELS_WMTS_LAYER, 'image/png'),
    createGeoportailWmtsSource(CADASTRE_LABELS_WMTS_LAYER, 'image/png'),
  ];
}

export function createWmsSource(): TileWMS {
  return new TileWMS({
    url: WMS_URL,
    params: {
      LAYERS: WMS_LAYER,
      TILED: true,
      FORMAT: 'image/jpeg',
      VERSION: '1.3.0',
    },
    projection: 'EPSG:3857',
    attributions: GEOPORTAIL_ATTRIBUTION,
    crossOrigin: 'anonymous',
  });
}

export interface BasemapLayerOptions {
  /** Keep the tile cache deliberately small on memory-constrained devices. */
  cacheSize?: number;
}

export function createBasemapLayer(
  mode: BasemapMode,
  options: BasemapLayerOptions = {},
): TileLayer<WMTS | TileWMS> {
  return new TileLayer({
    source: mode === 'wmts' ? createWmtsSource() : createWmsSource(),
    cacheSize: options.cacheSize,
  });
}

export function createCadastreLayers(options: BasemapLayerOptions = {}): [TileLayer<WMTS>, TileLayer<WMTS>] {
  const [parcels, labels] = createCadastreWmtsSources();
  return [parcels, labels].map((source) => new TileLayer({
    source,
    cacheSize: options.cacheSize,
  })) as [TileLayer<WMTS>, TileLayer<WMTS>];
}

/**
 * Register health listeners before inserting a source into an OpenLayers map.
 * The generation argument prevents late events from an old source changing the
 * state of its replacement.
 */
export function bindBasemapSourceHealth(
  source: TileSource,
  generation: number,
  reporter: BasemapHealthReporter,
): () => void {
  const keys = [
    source.on('tileloadstart', () => reporter.tileLoadStart(generation)),
    source.on('tileloadend', () => reporter.tileLoadEnd(generation)),
    source.on('tileloaderror', () => reporter.tileLoadError(generation)),
  ];
  return () => unByKey(keys);
}

/** A real Luxembourg WMTS tile used only while checking whether WMTS recovered. */
export function createWmtsProbeUrl(cacheBuster = Date.now()): string {
  const url = new URL(WMTS_URL);
  url.search = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    LAYER: WMTS_LAYER,
    STYLE: 'default',
    TILEMATRIXSET: 'GLOBAL_WEBMERCATOR_4_V3',
    TILEMATRIX: '13',
    TILEROW: '2792',
    TILECOL: '4235',
    FORMAT: 'image/jpeg',
    _: String(cacheBuster),
  }).toString();
  return url.toString();
}

export async function probeWmtsAvailability(timeoutMs = 5_000): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(createWmtsProbeUrl(), {
      cache: 'no-store',
      mode: 'cors',
      signal: controller.signal,
    });
    return response.ok && (response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/');
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
