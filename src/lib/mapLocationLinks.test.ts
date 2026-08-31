import { describe, expect, it } from 'vitest';
import {
  createMapLocationLinks,
  formatLurefCoordinate,
  lurefToWgs84Coordinate,
} from './mapLocationLinks';

describe('map location links', () => {
  it('formats LUREF easting and northing with exactly two decimals', () => {
    expect(formatLurefCoordinate([80_000.126, 99_999.994])).toBe('80000.13, 99999.99');
    expect(() => formatLurefCoordinate([Number.NaN, 100_000])).toThrow('LUREF_COORDINATE_INVALID');
  });

  it('uses Geoportail permalink axes instead of tuple order', () => {
    const links = createMapLocationLinks([63_403.457, 115_350.5501], 'fr-LU');
    const url = new URL(links.geoportail);

    expect(url.origin).toBe('https://map.geoportail.lu');
    expect(url.searchParams.get('X')).toBe('115350.55');
    expect(url.searchParams.get('Y')).toBe('63403.46');
    expect(url.searchParams.get('crosshair')).toBe('true');
    expect(url.searchParams.get('lang')).toBe('fr');
  });

  it('transforms LUREF into stable WGS84 Google and Apple links', () => {
    const coordinate = [80_000, 100_000] as const;
    const wgs84 = lurefToWgs84Coordinate(coordinate);
    const links = createMapLocationLinks(coordinate, 'en');
    const expectedPair = `${wgs84.latitude.toFixed(7)},${wgs84.longitude.toFixed(7)}`;

    expect(wgs84.latitude).toBeCloseTo(49.8344002, 5);
    expect(wgs84.longitude).toBeCloseTo(6.1681269, 5);
    expect(new URL(links.googleMaps).searchParams.get('query')).toBe(expectedPair);
    expect(new URL(links.appleMaps).searchParams.get('ll')).toBe(expectedPair);

    const streetView = new URL(links.googleStreetView);
    expect(streetView.searchParams.get('map_action')).toBe('pano');
    expect(streetView.searchParams.get('viewpoint')).toBe(expectedPair);
    expect(Object.keys(links)).toEqual([
      'geoportail',
      'googleMaps',
      'appleMaps',
      'googleStreetView',
    ]);
  });

  it('falls back to German for unsupported Geoportail languages', () => {
    expect(new URL(createMapLocationLinks([80_000, 100_000], 'lb').geoportail).searchParams.get('lang')).toBe('de');
  });
});
