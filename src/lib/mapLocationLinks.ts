import proj4 from 'proj4';
import { LUREF_CODE } from './crs';
import type { LurefCoordinate } from '../types/models';

const WGS84_CODE = 'EPSG:4326';
const WGS84_DECIMALS = 7;
const GEOPORTAIL_ZOOM = 12;

export type GeoportailLanguage = 'de' | 'fr' | 'en';

export interface Wgs84Coordinate {
  latitude: number;
  longitude: number;
}

export interface MapLocationLinks {
  geoportail: string;
  googleMaps: string;
  appleMaps: string;
  googleStreetView: string;
}

function assertFiniteCoordinate(coordinate: LurefCoordinate): void {
  if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
    throw new RangeError('LUREF_COORDINATE_INVALID');
  }
}

function wgs84Pair({ latitude, longitude }: Wgs84Coordinate): string {
  return `${latitude.toFixed(WGS84_DECIMALS)},${longitude.toFixed(WGS84_DECIMALS)}`;
}

function supportedGeoportailLanguage(language: string | undefined): GeoportailLanguage {
  const normalized = language?.split('-')[0]?.toLocaleLowerCase('en-US');
  return normalized === 'fr' || normalized === 'en' ? normalized : 'de';
}

/** Stable clipboard representation in the app's metre-based LUREF coordinate order. */
export function formatLurefCoordinate(coordinate: LurefCoordinate): string {
  assertFiniteCoordinate(coordinate);
  return `${coordinate[0].toFixed(2)}, ${coordinate[1].toFixed(2)}`;
}

export function lurefToWgs84Coordinate(coordinate: LurefCoordinate): Wgs84Coordinate {
  assertFiniteCoordinate(coordinate);
  const [longitude, latitude] = proj4(LUREF_CODE, WGS84_CODE, [coordinate[0], coordinate[1]]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RangeError('WGS84_COORDINATE_INVALID');
  }
  return { latitude, longitude };
}

/**
 * Creates external map links without network access. Geoportail's permalink
 * contract names northing `X` and easting `Y`, which is intentionally the
 * reverse of the app's `[easting, northing]` LUREF tuple.
 */
export function createMapLocationLinks(
  coordinate: LurefCoordinate,
  language?: string,
): MapLocationLinks {
  assertFiniteCoordinate(coordinate);
  const [easting, northing] = coordinate;
  const wgs84 = lurefToWgs84Coordinate(coordinate);
  const pair = wgs84Pair(wgs84);

  const geoportail = new URL('https://map.geoportail.lu/');
  geoportail.searchParams.set('X', northing.toFixed(2));
  geoportail.searchParams.set('Y', easting.toFixed(2));
  geoportail.searchParams.set('zoom', String(GEOPORTAIL_ZOOM));
  geoportail.searchParams.set('crosshair', 'true');
  geoportail.searchParams.set('lang', supportedGeoportailLanguage(language));

  const googleMaps = new URL('https://www.google.com/maps/search/');
  googleMaps.searchParams.set('api', '1');
  googleMaps.searchParams.set('query', pair);

  const appleMaps = new URL('https://maps.apple.com/');
  appleMaps.searchParams.set('ll', pair);
  appleMaps.searchParams.set('q', pair);

  const googleStreetView = new URL('https://www.google.com/maps/@');
  googleStreetView.searchParams.set('api', '1');
  googleStreetView.searchParams.set('map_action', 'pano');
  googleStreetView.searchParams.set('viewpoint', pair);

  return {
    geoportail: geoportail.toString(),
    googleMaps: googleMaps.toString(),
    appleMaps: appleMaps.toString(),
    googleStreetView: googleStreetView.toString(),
  };
}

