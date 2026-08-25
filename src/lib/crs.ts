import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { transform } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';

export const LUREF_CODE = 'EPSG:2169';
export const WEB_MERCATOR_CODE = 'EPSG:3857';
export const LUREF_DEFINITION =
  '+proj=tmerc +lat_0=49.8333333333333 +lon_0=6.16666666666667 +k=1 +x_0=80000 +y_0=100000 +ellps=intl +towgs84=-189.6806,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 +units=m +no_defs +type=crs';

proj4.defs(LUREF_CODE, LUREF_DEFINITION);
register(proj4);

// Do not constrain EPSG:2169 to Luxembourg's usual administrative bounds.
// Real CAD files can legitimately contain local/outlying WCS coordinates;
// OpenLayers then derives a global reprojection tile grid that can still
// request the Geoportail source tiles at those transformed positions. A
// proj4-registered projection has no extent unless one is explicitly set.

export function lurefToMap(coordinate: Coordinate): Coordinate {
  return transform(coordinate, LUREF_CODE, WEB_MERCATOR_CODE);
}

export function mapToLuref(coordinate: Coordinate): Coordinate {
  return transform(coordinate, WEB_MERCATOR_CODE, LUREF_CODE);
}
