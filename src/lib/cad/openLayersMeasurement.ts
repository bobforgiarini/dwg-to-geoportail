import type Feature from 'ol/Feature';
import Circle from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import GeometryCollection from 'ol/geom/GeometryCollection';
import LineString from 'ol/geom/LineString';
import MultiLineString from 'ol/geom/MultiLineString';
import MultiPoint from 'ol/geom/MultiPoint';
import MultiPolygon from 'ol/geom/MultiPolygon';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import type { Coordinate } from 'ol/coordinate';
import type { CadSnapKind } from '../../types/models';

type XY = [number, number];

interface Segment {
  start: XY;
  end: XY;
  featureIndex: number;
}

interface RankedCandidate {
  coordinate: XY;
  kind: CadSnapKind;
  distanceSquared: number;
  rank: number;
}

interface NearbyFeature {
  feature: Feature<Geometry>;
  geometry: Geometry;
  distanceSquared: number;
  sourceIndex: number;
}

export interface OpenLayersAimResult {
  coordinate: XY;
  snapKind?: CadSnapKind;
}

export interface ResolveOpenLayersAimOptions {
  aim: Coordinate;
  resolution: number;
  features: Array<Feature<Geometry>>;
  snapEnabled: boolean;
  pixelTolerance?: number;
  isFeatureVisible?: (feature: Feature<Geometry>) => boolean;
}

const DEFAULT_PIXEL_TOLERANCE = 18;
const MAX_INTERSECTION_FEATURES = 48;
const MAX_INTERSECTION_SEGMENTS = 512;
const EPSILON = 1e-9;

const SNAP_RANK: Record<CadSnapKind, number> = {
  endpoint: 0,
  vertex: 0,
  intersection: 1,
  midpoint: 2,
  center: 2,
  nearest: 3,
};

function xy(coordinate: Coordinate): XY {
  return [Number(coordinate[0]), Number(coordinate[1])];
}

function squaredDistance(left: Coordinate, right: Coordinate): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

function squaredDistanceToExtent(point: Coordinate, extent: number[]): number {
  if (extent.length < 4 || !extent.every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const dx = point[0] < extent[0]
    ? extent[0] - point[0]
    : point[0] > extent[2]
      ? point[0] - extent[2]
      : 0;
  const dy = point[1] < extent[1]
    ? extent[1] - point[1]
    : point[1] > extent[3]
      ? point[1] - extent[3]
      : 0;
  return dx * dx + dy * dy;
}

/**
 * Selects the closest visible features from their cached extents before any
 * coordinate arrays are expanded. Dense CAD drawings can contain thousands of
 * features in the 18 px search box; keeping this list bounded prevents one aim
 * update from walking all of their vertices.
 */
function selectNearbyFeatures(
  features: Array<Feature<Geometry>>,
  aim: Coordinate,
  toleranceSquared: number,
  isFeatureVisible: (feature: Feature<Geometry>) => boolean,
): NearbyFeature[] {
  const selected: NearbyFeature[] = [];
  let worstIndex = -1;

  const recomputeWorst = () => {
    worstIndex = 0;
    for (let index = 1; index < selected.length; index += 1) {
      const current = selected[index];
      const worst = selected[worstIndex];
      if (
        current.distanceSquared > worst.distanceSquared
        || (current.distanceSquared === worst.distanceSquared && current.sourceIndex > worst.sourceIndex)
      ) {
        worstIndex = index;
      }
    }
  };

  features.forEach((feature, sourceIndex) => {
    if (!isFeatureVisible(feature)) return;
    const geometry = feature.getGeometry();
    if (!geometry) return;
    const distanceSquared = squaredDistanceToExtent(aim, geometry.getExtent());
    if (distanceSquared > toleranceSquared) return;

    const candidate = { feature, geometry, distanceSquared, sourceIndex };
    if (selected.length < MAX_INTERSECTION_FEATURES) {
      selected.push(candidate);
      recomputeWorst();
      return;
    }

    const worst = selected[worstIndex];
    if (
      distanceSquared > worst.distanceSquared
      || (distanceSquared === worst.distanceSquared && sourceIndex >= worst.sourceIndex)
    ) return;
    selected[worstIndex] = candidate;
    recomputeWorst();
  });

  return selected.sort((left, right) => (
    left.distanceSquared - right.distanceSquared || left.sourceIndex - right.sourceIndex
  ));
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return Math.abs(left[0] - right[0]) <= EPSILON && Math.abs(left[1] - right[1]) <= EPSILON;
}

function closestPointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): XY {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return xy(start);
  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return [start[0] + ratio * dx, start[1] + ratio * dy];
}

type FlatLineVisitor = (
  flatCoordinates: number[],
  stride: number,
  offset: number,
  end: number,
) => boolean;

/** Visits line coordinate ranges lazily so the caller can stop at its budget. */
function visitFlatLines(geometry: Geometry, visitor: FlatLineVisitor): boolean {
  if (geometry instanceof LineString) {
    const flatCoordinates = geometry.getFlatCoordinates();
    return visitor(flatCoordinates, geometry.getStride(), 0, flatCoordinates.length);
  }
  if (geometry instanceof MultiLineString || geometry instanceof Polygon) {
    const flatCoordinates = geometry.getFlatCoordinates();
    const stride = geometry.getStride();
    let offset = 0;
    for (const end of geometry.getEnds()) {
      if (!visitor(flatCoordinates, stride, offset, end)) return false;
      offset = end;
    }
    return true;
  }
  if (geometry instanceof MultiPolygon) {
    const flatCoordinates = geometry.getFlatCoordinates();
    const stride = geometry.getStride();
    let offset = 0;
    for (const ends of geometry.getEndss()) {
      for (const end of ends) {
        if (!visitor(flatCoordinates, stride, offset, end)) return false;
        offset = end;
      }
    }
    return true;
  }
  if (geometry instanceof GeometryCollection) {
    for (const child of geometry.getGeometries()) {
      if (!visitFlatLines(child, visitor)) return false;
    }
  }
  return true;
}

function visitFlatPoints(geometry: Geometry, visitor: (coordinate: XY) => boolean): boolean {
  if (geometry instanceof Point || geometry instanceof MultiPoint) {
    const flatCoordinates = geometry.getFlatCoordinates();
    const stride = geometry.getStride();
    for (let offset = 0; offset < flatCoordinates.length; offset += stride) {
      if (!visitor([flatCoordinates[offset], flatCoordinates[offset + 1]])) return false;
    }
    return true;
  }
  if (geometry instanceof GeometryCollection) {
    for (const child of geometry.getGeometries()) {
      if (!visitFlatPoints(child, visitor)) return false;
    }
  }
  return true;
}

function flatCoordinate(flatCoordinates: number[], offset: number): XY {
  return [flatCoordinates[offset], flatCoordinates[offset + 1]];
}

function segmentNearAim(segment: Segment, aim: Coordinate, toleranceSquared: number): boolean {
  return squaredDistance(closestPointOnSegment(aim, segment.start, segment.end), aim) <= toleranceSquared;
}

function intersection(left: Segment, right: Segment): XY | null {
  const ax = left.start[0];
  const ay = left.start[1];
  const bx = left.end[0];
  const by = left.end[1];
  const cx = right.start[0];
  const cy = right.start[1];
  const dx = right.end[0];
  const dy = right.end[1];
  const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denominator) <= EPSILON) return null;
  const first = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denominator;
  const second = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denominator;
  if (first < -EPSILON || first > 1 + EPSILON || second < -EPSILON || second > 1 + EPSILON) return null;
  return [ax + first * (bx - ax), ay + first * (by - ay)];
}

function segmentMidpoint(start: Coordinate, end: Coordinate): XY {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

function normalizedCadType(feature: Feature<Geometry>): string {
  return String(feature.get('cadType') ?? '').trim().toUpperCase();
}

function isSampledCurve(cadType: string): boolean {
  return cadType === 'CIRCLE' || cadType === 'ARC' || cadType === 'ELLIPSE';
}

function candidateCenter(feature: Feature<Geometry>, geometry: Geometry, cadType: string): XY | null {
  const explicit = feature.get('cadSnapCenter');
  if (Array.isArray(explicit) && explicit.length >= 2 && explicit.slice(0, 2).every(Number.isFinite)) {
    return [Number(explicit[0]), Number(explicit[1])];
  }
  if (geometry instanceof Circle) return xy(geometry.getCenter());
  if (cadType !== 'CIRCLE' && cadType !== 'ELLIPSE') return null;
  const extent = geometry.getExtent();
  if (!extent.every(Number.isFinite)) return null;
  return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
}

/**
 * Resolves a fixed-screen aim against visible CAD geometry. All coordinates are
 * in the OpenLayers view projection. The tolerance is deliberately expressed
 * in CSS pixels so touch behaviour does not change with devicePixelRatio.
 */
export function resolveOpenLayersAim({
  aim,
  resolution,
  features,
  snapEnabled,
  pixelTolerance = DEFAULT_PIXEL_TOLERANCE,
  isFeatureVisible = () => true,
}: ResolveOpenLayersAimOptions): OpenLayersAimResult {
  const rawAim = xy(aim);
  if (!snapEnabled || !Number.isFinite(resolution) || resolution <= 0) return { coordinate: rawAim };

  const tolerance = resolution * pixelTolerance;
  const toleranceSquared = tolerance * tolerance;
  const visibleFeatures = selectNearbyFeatures(features, rawAim, toleranceSquared, isFeatureVisible);
  let best: RankedCandidate | null = null;

  const consider = (coordinate: Coordinate, kind: CadSnapKind) => {
    const distanceSquared = squaredDistance(coordinate, rawAim);
    if (distanceSquared > toleranceSquared) return;
    const rank = SNAP_RANK[kind];
    if (!best || rank < best.rank || (rank === best.rank && distanceSquared < best.distanceSquared)) {
      best = { coordinate: xy(coordinate), kind, distanceSquared, rank };
    }
  };

  const segmentsByFeature: Segment[][] = [];
  let traversedSegments = 0;
  let traversedPointCandidates = 0;
  visibleFeatures.forEach(({ feature, geometry }, featureIndex) => {
    const cadType = normalizedCadType(feature);
    const sampledCurve = isSampledCurve(cadType);

    visitFlatPoints(geometry, (coordinate) => {
      if (traversedPointCandidates >= MAX_INTERSECTION_SEGMENTS) return false;
      traversedPointCandidates += 1;
      consider(coordinate, 'vertex');
      return true;
    });
    const center = candidateCenter(feature, geometry, cadType);
    if (center) consider(center, 'center');

    const featureSegments: Segment[] = [];
    const remainingFeatures = visibleFeatures.length - featureIndex;
    const featureSegmentBudget = Math.max(
      1,
      Math.floor((MAX_INTERSECTION_SEGMENTS - traversedSegments) / remainingFeatures),
    );
    let featureTraversedSegments = 0;
    visitFlatLines(geometry, (flatCoordinates, stride, offset, end) => {
      if (
        traversedSegments >= MAX_INTERSECTION_SEGMENTS
        || featureTraversedSegments >= featureSegmentBudget
      ) return false;
      const pointCount = Math.floor((end - offset) / stride);
      if (pointCount === 0) return true;
      const firstCoordinate = flatCoordinate(flatCoordinates, offset);
      const lastCoordinate = flatCoordinate(flatCoordinates, end - stride);
      const closed = pointCount > 2 && sameCoordinate(firstCoordinate, lastCoordinate);
      if (!sampledCurve) {
        consider(firstCoordinate, closed ? 'vertex' : 'endpoint');
        if (pointCount > 1) consider(lastCoordinate, closed ? 'vertex' : 'endpoint');
      } else if (!closed) {
        consider(firstCoordinate, 'endpoint');
        consider(lastCoordinate, 'endpoint');
      }
      for (let coordinateOffset = offset + stride; coordinateOffset < end; coordinateOffset += stride) {
        if (
          traversedSegments >= MAX_INTERSECTION_SEGMENTS
          || featureTraversedSegments >= featureSegmentBudget
        ) return false;
        traversedSegments += 1;
        featureTraversedSegments += 1;
        const segment: Segment = {
          start: flatCoordinate(flatCoordinates, coordinateOffset - stride),
          end: flatCoordinate(flatCoordinates, coordinateOffset),
          featureIndex,
        };
        if (!sampledCurve && coordinateOffset < end - stride) consider(segment.end, 'vertex');
        if (!segmentNearAim(segment, rawAim, toleranceSquared)) continue;
        featureSegments.push(segment);
        if (!sampledCurve) consider(segmentMidpoint(segment.start, segment.end), 'midpoint');
      }
      return true;
    });
    if (cadType === 'ARC' && geometry instanceof LineString) consider(geometry.getCoordinateAt(0.5), 'midpoint');
    segmentsByFeature[featureIndex] = featureSegments;

    if (geometry instanceof Circle) {
      const closest = geometry.getClosestPoint(rawAim);
      consider(closest, 'nearest');
    } else {
      let closest: XY | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const segment of featureSegments) {
        const current = closestPointOnSegment(rawAim, segment.start, segment.end);
        const distance = squaredDistance(current, rawAim);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = current;
        }
      }
      if (closest) consider(closest, 'nearest');
    }
  });

  const intersectionFeatureIndexes = visibleFeatures
    .map((_, index) => ({
      index,
      distanceSquared: (segmentsByFeature[index] ?? []).reduce(
        (closest, segment) => Math.min(
          closest,
          squaredDistance(closestPointOnSegment(rawAim, segment.start, segment.end), rawAim),
        ),
        Number.POSITIVE_INFINITY,
      ),
    }))
    .filter(({ distanceSquared }) => Number.isFinite(distanceSquared))
    .sort((left, right) => left.distanceSquared - right.distanceSquared)
    .slice(0, MAX_INTERSECTION_FEATURES)
    .map(({ index }) => index);

  const intersectionFeatureSet = new Set(intersectionFeatureIndexes);
  const intersectionSegments = intersectionFeatureIndexes
    .flatMap((index) => segmentsByFeature[index] ?? [])
    .sort((left, right) => (
      squaredDistance(closestPointOnSegment(rawAim, left.start, left.end), rawAim)
      - squaredDistance(closestPointOnSegment(rawAim, right.start, right.end), rawAim)
    ))
    .slice(0, MAX_INTERSECTION_SEGMENTS);
  for (let leftIndex = 0; leftIndex < intersectionSegments.length; leftIndex += 1) {
    const left = intersectionSegments[leftIndex];
    if (!intersectionFeatureSet.has(left.featureIndex)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < intersectionSegments.length; rightIndex += 1) {
      const right = intersectionSegments[rightIndex];
      if (left.featureIndex === right.featureIndex) continue;
      const coordinate = intersection(left, right);
      if (coordinate) consider(coordinate, 'intersection');
    }
  }

  const resolved = best as RankedCandidate | null;
  return resolved ? { coordinate: resolved.coordinate, snapKind: resolved.kind } : { coordinate: rawAim };
}
