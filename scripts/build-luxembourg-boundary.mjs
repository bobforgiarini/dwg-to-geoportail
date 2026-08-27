import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import proj4 from 'proj4';

const LUREF_DEFINITION =
  '+proj=tmerc +lat_0=49.8333333333333 +lon_0=6.16666666666667 +k=1 +x_0=80000 +y_0=100000 +ellps=intl +towgs84=-189.6806,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 +units=m +no_defs +type=crs';
const SOURCE_DATASET = 'https://data.public.lu/en/datasets/limites-administratives-du-grand-duche-de-luxembourg/';
const SOURCE_RESOURCE = 'https://data.public.lu/en/datasets/r/39af91a6-9ce4-4c18-8271-313b3ad7c7f5';
const BUFFER_METERS = 1_000;
const SIMPLIFICATION_TOLERANCE_METERS = 5;

const inputPath = process.argv[2];
const outputPath = resolve(process.argv[3] ?? 'src/lib/cad/data/luxembourgBoundary.epsg2169.json');

if (!inputPath) {
  console.error('Usage: node scripts/build-luxembourg-boundary.mjs <limadmin.geojson> [output.json]');
  process.exitCode = 1;
} else {
  const sourceBytes = readFileSync(resolve(inputPath));
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const feature = source?.pays?.features?.find((candidate) => candidate?.properties?.PAYS === 'Grand-Duché du Luxembourg')
    ?? source?.pays?.features?.[0];

  if (!feature || feature.geometry?.type !== 'MultiPolygon') {
    throw new Error('The ACT limadmin source does not contain the expected pays MultiPolygon.');
  }

  proj4.defs('EPSG:2169', LUREF_DEFINITION);

  const polygons = feature.geometry.coordinates.map((polygon) => polygon.map((ring) => {
    const lurefRing = ring.map(([longitude, latitude]) => proj4('EPSG:4326', 'EPSG:2169', [longitude, latitude]));
    const simplified = simplifyClosedRing(lurefRing, SIMPLIFICATION_TOLERANCE_METERS);
    return simplified.map(([x, y]) => [roundCentimeter(x), roundCentimeter(y)]);
  }));

  const output = {
    schemaVersion: 1,
    coordinateReferenceSystem: 'EPSG:2169',
    bufferMeters: BUFFER_METERS,
    simplificationToleranceMeters: SIMPLIFICATION_TOLERANCE_METERS,
    source: {
      authority: 'Administration du cadastre et de la topographie (ACT)',
      dataset: SOURCE_DATASET,
      resource: SOURCE_RESOURCE,
      license: 'CC0-1.0',
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    },
    polygons,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
  console.log(`Wrote ${outputPath} (${polygons.reduce((sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0), 0)} points).`);
}

function roundCentimeter(value) {
  return Math.round(value * 100) / 100;
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return squaredDistance(point, start);
  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return squaredDistance(point, [start[0] + ratio * dx, start[1] + ratio * dy]);
}

function squaredDistance(left, right) {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

function simplifyOpen(points, tolerance) {
  if (points.length <= 2) return points;
  const threshold = tolerance * tolerance;
  let maxDistance = threshold;
  let splitIndex = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], points[0], points.at(-1));
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (splitIndex < 0) return [points[0], points.at(-1)];
  const before = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const after = simplifyOpen(points.slice(splitIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

function simplifyClosedRing(points, tolerance) {
  const open = points.length > 1 && squaredDistance(points[0], points.at(-1)) < 1e-12 ? points.slice(0, -1) : points;
  if (open.length < 4) return [...open, open[0]];

  let minXIndex = 0;
  let maxXIndex = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (open[index][0] < open[minXIndex][0]) minXIndex = index;
    if (open[index][0] > open[maxXIndex][0]) maxXIndex = index;
  }
  if (minXIndex > maxXIndex) [minXIndex, maxXIndex] = [maxXIndex, minXIndex];

  const firstPath = open.slice(minXIndex, maxXIndex + 1);
  const secondPath = [...open.slice(maxXIndex), ...open.slice(0, minXIndex + 1)];
  const simplified = [
    ...simplifyOpen(firstPath, tolerance).slice(0, -1),
    ...simplifyOpen(secondPath, tolerance).slice(0, -1),
  ];
  simplified.push(simplified[0]);
  return simplified;
}
