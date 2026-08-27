import type { CadBlock, CadDocument, CadEntity, CadPoint3D } from '@flyfish-dev/cad-viewer';
import boundaryAsset from './data/luxembourgBoundary.epsg2169.json';

export type CadAabb = readonly [minX: number, minY: number, maxX: number, maxY: number];
export type CadSpatialClassification = 'retained' | 'outside' | 'unknown';
export type CadSpatialFilterWarningCode = 'invalid-extent' | 'missing-block' | 'cyclic-block' | 'max-depth';

export interface CadSpatialFilterSettings {
  enabled: boolean;
}

export interface CadSpatialFilterWarning {
  code: CadSpatialFilterWarningCode;
  entityKey?: string;
  blockName?: string;
  path?: string[];
}

export interface CadSpatialFilterReport {
  enabled: boolean;
  coordinateReferenceSystem: 'EPSG:2169';
  bufferMeters: number;
  sourceAuthority: string;
  sourceLicense: string;
  retainedRootEntityCount: number;
  removedRootEntityCount: number;
  unknownRootEntityCount: number;
  removedBlockDefinitionCount: number;
  removedEntityKeys: string[];
  unknownEntityKeys: string[];
  removedBlockNames: string[];
  warnings: CadSpatialFilterWarning[];
}

export interface CadSpatialFilterResult {
  document: CadDocument;
  report: CadSpatialFilterReport;
}

type XY = readonly [number, number];
type MutableAabb = [number, number, number, number];
type Matrix = readonly [number, number, number, number, number, number];
type BoundaryPolygon = readonly (readonly XY[])[];
type BoundaryMultiPolygon = readonly BoundaryPolygon[];

interface BoundaryData {
  schemaVersion: 1;
  coordinateReferenceSystem: 'EPSG:2169';
  bufferMeters: number;
  simplificationToleranceMeters: number;
  source: {
    authority: string;
    dataset: string;
    resource: string;
    license: string;
    sha256: string;
  };
  polygons: number[][][][];
}

interface BlockEntry {
  key: string;
  name: string;
  block: CadBlock;
}

interface ExtentContext {
  resolveBlock: (entity: CadEntity) => BlockEntry | undefined;
  warnings: CadSpatialFilterWarning[];
  maxDepth: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const EPSILON = 1e-7;
const MAX_RAW_GEOMETRY_NODES = 20_000;
const BOUNDARY = boundaryAsset as BoundaryData;
const POLYGONS = BOUNDARY.polygons as unknown as BoundaryMultiPolygon;
const BOUNDARY_AABB = multiPolygonAabb(POLYGONS);

export const LUXEMBOURG_SPATIAL_FILTER_METADATA = Object.freeze({
  coordinateReferenceSystem: BOUNDARY.coordinateReferenceSystem,
  bufferMeters: BOUNDARY.bufferMeters,
  simplificationToleranceMeters: BOUNDARY.simplificationToleranceMeters,
  source: Object.freeze({ ...BOUNDARY.source }),
});

function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function entityKind(entity: CadEntity): string {
  return String(entity.kind || entity.type || '').trim().toLowerCase();
}

function entityKey(entity: CadEntity, index: number): string {
  return String(entity.handle ?? entity.id ?? `${entity.type || 'ENTITY'}:${index}`);
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function angle(value: unknown): number {
  const numeric = finite(value);
  return Math.abs(numeric) > Math.PI * 4 ? (numeric * Math.PI) / 180 : numeric;
}

function createBlockResolver(blocks: CadDocument['blocks']) {
  const aliases = new Map<string, BlockEntry>();
  for (const [key, block] of Object.entries(blocks)) {
    const entry = { key, name: block.name || key, block };
    for (const alias of [key, entry.name]) {
      const normalized = canonical(alias);
      if (normalized && !aliases.has(normalized)) aliases.set(normalized, entry);
    }
  }
  return (entity: CadEntity): BlockEntry | undefined => {
    for (const candidate of [entity.blockName, entity.name, entity.effectiveBlockName]) {
      const entry = aliases.get(canonical(candidate));
      if (entry) return entry;
    }
    return undefined;
  };
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPoint(matrix: Matrix, point: XY): XY {
  return [
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  ];
}

function insertMatrix(entity: CadEntity, basePoint: CadPoint3D | undefined, column = 0, row = 0): Matrix {
  const rawInsert = entity.raw && typeof entity.raw === 'object'
    ? entity.raw as { rotation?: unknown }
    : undefined;
  const insertion = entity.insertionPoint ?? { x: 0, y: 0 };
  const scaleX = finite(entity.scale?.x, 1);
  const scaleY = finite(entity.scale?.y, 1);
  const rotation = angle(entity.rotation ?? rawInsert?.rotation);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const baseX = finite(basePoint?.x);
  const baseY = finite(basePoint?.y);
  const columnOffset = column * finite(entity.insertColumnSpacing);
  const rowOffset = row * finite(entity.insertRowSpacing);
  const insertionX = finite(insertion.x) + cos * columnOffset - sin * rowOffset;
  const insertionY = finite(insertion.y) + sin * columnOffset + cos * rowOffset;
  return [
    cos * scaleX,
    sin * scaleX,
    -sin * scaleY,
    cos * scaleY,
    insertionX - cos * scaleX * baseX + sin * scaleY * baseY,
    insertionY - sin * scaleX * baseX - cos * scaleY * baseY,
  ];
}

function validPoint(point: unknown): point is { x: number; y: number } {
  return Boolean(point && typeof point === 'object'
    && typeof (point as { x?: unknown }).x === 'number'
    && Number.isFinite((point as { x: number }).x)
    && typeof (point as { y?: unknown }).y === 'number'
    && Number.isFinite((point as { y: number }).y));
}

function emptyAabb(): MutableAabb {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function includePoint(aabb: MutableAabb, point: XY): void {
  aabb[0] = Math.min(aabb[0], point[0]);
  aabb[1] = Math.min(aabb[1], point[1]);
  aabb[2] = Math.max(aabb[2], point[0]);
  aabb[3] = Math.max(aabb[3], point[1]);
}

function includeAabb(target: MutableAabb, source: CadAabb): void {
  target[0] = Math.min(target[0], source[0]);
  target[1] = Math.min(target[1], source[1]);
  target[2] = Math.max(target[2], source[2]);
  target[3] = Math.max(target[3], source[3]);
}

function expandAabb(aabb: CadAabb, amount: number): CadAabb {
  return [aabb[0] - amount, aabb[1] - amount, aabb[2] + amount, aabb[3] + amount];
}

export function isValidCadAabb(aabb: CadAabb | null | undefined): aabb is CadAabb {
  return Boolean(aabb
    && aabb.length === 4
    && aabb.every(Number.isFinite)
    && aabb[0] <= aabb[2]
    && aabb[1] <= aabb[3]);
}

function finalAabb(aabb: MutableAabb): CadAabb | null {
  return isValidCadAabb(aabb) ? aabb : null;
}

function pointInAabb(point: XY, aabb: CadAabb): boolean {
  return point[0] >= aabb[0] - EPSILON && point[0] <= aabb[2] + EPSILON
    && point[1] >= aabb[1] - EPSILON && point[1] <= aabb[3] + EPSILON;
}

function aabbsIntersect(left: CadAabb, right: CadAabb): boolean {
  return left[0] <= right[2] + EPSILON && left[2] >= right[0] - EPSILON
    && left[1] <= right[3] + EPSILON && left[3] >= right[1] - EPSILON;
}

function pointOnSegment(point: XY, start: XY, end: XY): boolean {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > EPSILON * Math.max(1, Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]))) return false;
  return point[0] >= Math.min(start[0], end[0]) - EPSILON && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function pointInRing(point: XY, ring: readonly XY[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous];
    const end = ring[index];
    if (pointOnSegment(point, start, end)) return true;
    if ((start[1] > point[1]) !== (end[1] > point[1])
      && point[0] < ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: XY, polygon: BoundaryPolygon): boolean {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function orientation(first: XY, second: XY, third: XY): number {
  return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
}

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b))
    || (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b))
    || (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d))
    || (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d));
}

function squaredPointSegmentDistance(point: XY, start: XY, end: XY): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const closestX = start[0] + ratio * dx;
  const closestY = start[1] + ratio * dy;
  return (point[0] - closestX) ** 2 + (point[1] - closestY) ** 2;
}

function segmentIntersectsAabb(start: XY, end: XY, aabb: CadAabb): boolean {
  if (pointInAabb(start, aabb) || pointInAabb(end, aabb)) return true;
  const corners: [XY, XY, XY, XY] = [
    [aabb[0], aabb[1]],
    [aabb[2], aabb[1]],
    [aabb[2], aabb[3]],
    [aabb[0], aabb[3]],
  ];
  return segmentsIntersect(start, end, corners[0], corners[1])
    || segmentsIntersect(start, end, corners[1], corners[2])
    || segmentsIntersect(start, end, corners[2], corners[3])
    || segmentsIntersect(start, end, corners[3], corners[0]);
}

function squaredSegmentAabbDistance(start: XY, end: XY, aabb: CadAabb): number {
  if (segmentIntersectsAabb(start, end, aabb)) return 0;
  const corners: XY[] = [
    [aabb[0], aabb[1]],
    [aabb[2], aabb[1]],
    [aabb[2], aabb[3]],
    [aabb[0], aabb[3]],
  ];
  const pointAabbDistance = (point: XY) => {
    const dx = point[0] < aabb[0] ? aabb[0] - point[0] : point[0] > aabb[2] ? point[0] - aabb[2] : 0;
    const dy = point[1] < aabb[1] ? aabb[1] - point[1] : point[1] > aabb[3] ? point[1] - aabb[3] : 0;
    return dx * dx + dy * dy;
  };
  return Math.min(
    pointAabbDistance(start),
    pointAabbDistance(end),
    ...corners.map((corner) => squaredPointSegmentDistance(corner, start, end)),
  );
}

function multiPolygonAabb(polygons: BoundaryMultiPolygon): CadAabb {
  const result = emptyAabb();
  for (const polygon of polygons) {
    for (const ring of polygon) for (const point of ring) includePoint(result, point);
  }
  const resolved = finalAabb(result);
  if (!resolved) throw new Error('INVALID_LUXEMBOURG_BOUNDARY_ASSET');
  return resolved;
}

/**
 * Conservative AABB test against a polygon with a metric round buffer.
 * `outside` is returned only when the complete AABB is farther than `bufferMeters`
 * from every polygon and not inside it. Touching/intersecting AABBs are retained.
 */
export function classifyAabbAgainstBufferedPolygon(
  aabb: CadAabb,
  polygons: BoundaryMultiPolygon,
  bufferMeters: number,
): CadSpatialClassification {
  if (!isValidCadAabb(aabb) || !Number.isFinite(bufferMeters) || bufferMeters < 0 || !polygons.length) return 'unknown';
  return classifyAabbAgainstBufferedPolygonWithBounds(aabb, polygons, bufferMeters, multiPolygonAabb(polygons));
}

function classifyAabbAgainstBufferedPolygonWithBounds(
  aabb: CadAabb,
  polygons: BoundaryMultiPolygon,
  bufferMeters: number,
  polygonBounds: CadAabb,
): CadSpatialClassification {
  if (!aabbsIntersect(aabb, expandAabb(polygonBounds, bufferMeters))) return 'outside';

  const corners: XY[] = [
    [aabb[0], aabb[1]],
    [aabb[2], aabb[1]],
    [aabb[2], aabb[3]],
    [aabb[0], aabb[3]],
  ];
  if (corners.some((corner) => polygons.some((polygon) => pointInPolygon(corner, polygon)))) return 'retained';

  const threshold = bufferMeters * bufferMeters;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        const segmentBounds: CadAabb = [
          Math.min(start[0], end[0]),
          Math.min(start[1], end[1]),
          Math.max(start[0], end[0]),
          Math.max(start[1], end[1]),
        ];
        if (!aabbsIntersect(aabb, expandAabb(segmentBounds, bufferMeters))) continue;
        if (squaredSegmentAabbDistance(start, end, aabb) <= threshold + EPSILON) return 'retained';
      }
    }
  }
  return 'outside';
}

export function classifyAabbAgainstLuxembourg(aabb: CadAabb): CadSpatialClassification {
  if (!isValidCadAabb(aabb)) return 'unknown';
  if (!aabbsIntersect(aabb, expandAabb(BOUNDARY_AABB, BOUNDARY.bufferMeters))) return 'outside';
  return classifyAabbAgainstBufferedPolygonWithBounds(aabb, POLYGONS, BOUNDARY.bufferMeters, BOUNDARY_AABB);
}

function collectPoint(aabb: MutableAabb, matrix: Matrix, point: unknown): boolean {
  if (!validPoint(point)) return false;
  includePoint(aabb, transformPoint(matrix, [point.x, point.y]));
  return true;
}

function collectPathPoints(aabb: MutableAabb, matrix: Matrix, commands: CadEntity['commands']): boolean {
  let collected = false;
  for (const command of commands ?? []) {
    for (const point of command.points ?? []) collected = collectPoint(aabb, matrix, point) || collected;
  }
  return collected;
}

function includeTransformedCircle(aabb: MutableAabb, matrix: Matrix, center: XY, radius: number): void {
  const transformedCenter = transformPoint(matrix, center);
  const extentX = Math.abs(radius) * Math.hypot(matrix[0], matrix[2]);
  const extentY = Math.abs(radius) * Math.hypot(matrix[1], matrix[3]);
  includeAabb(aabb, [
    transformedCenter[0] - extentX,
    transformedCenter[1] - extentY,
    transformedCenter[0] + extentX,
    transformedCenter[1] + extentY,
  ]);
}

function collectRawGeometryPoints(aabb: MutableAabb, matrix: Matrix, raw: unknown): { collected: boolean; unsafe: boolean } {
  if (!raw || typeof raw !== 'object') return { collected: false, unsafe: false };
  const queue: unknown[] = [raw];
  const visited = new Set<object>();
  let collected = false;
  let unsafe = false;
  let inspected = 0;
  const geometryKeys = new Set([
    'boundarypaths', 'vertices', 'edges', 'start', 'end', 'startpoint', 'endpoint',
    'center', 'points', 'controlpoints', 'fitdatum', 'fitpoints', 'majoraxisendpoint',
    'insertionpoint', 'loops', 'commands',
  ]);
  while (queue.length && inspected < MAX_RAW_GEOMETRY_NODES) {
    const value = queue.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    inspected += 1;
    const record = value as Record<string, unknown>;
    if (validPoint(record.center) && typeof record.radius === 'number' && Number.isFinite(record.radius)) {
      includeTransformedCircle(aabb, matrix, [record.center.x, record.center.y], record.radius);
      collected = true;
    }
    if (validPoint(record.center) && validPoint(record.end)
      && typeof record.lengthOfMinorAxis === 'number' && Number.isFinite(record.lengthOfMinorAxis)) {
      // LibreDWG versions disagree on whether the ellipse `end` member is an
      // absolute endpoint or a major-axis vector. Taking the larger candidate
      // is intentionally conservative and therefore cannot under-estimate it.
      const absoluteRadius = Math.hypot(record.end.x - record.center.x, record.end.y - record.center.y);
      const vectorRadius = Math.hypot(record.end.x, record.end.y);
      includeTransformedCircle(
        aabb,
        matrix,
        [record.center.x, record.center.y],
        Math.max(absoluteRadius, vectorRadius, Math.abs(record.lengthOfMinorAxis)),
      );
      collected = true;
    }
    if (validPoint(value)) {
      if (typeof record.bulge === 'number' && Number.isFinite(record.bulge) && Math.abs(record.bulge) > EPSILON) unsafe = true;
      collected = collectPoint(aabb, matrix, value) || collected;
      continue;
    }
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      if (geometryKeys.has(key.toLocaleLowerCase('en-US'))) queue.push(child);
    }
  }
  if (queue.length) unsafe = true;
  return { collected, unsafe };
}

function includeBulgeBounds(
  aabb: MutableAabb,
  matrix: Matrix,
  start: CadPoint3D & { bulge?: number },
  end: CadPoint3D,
): void {
  const bulge = finite(start.bulge);
  if (Math.abs(bulge) <= EPSILON) return;
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (chord <= EPSILON) return;
  const theta = 4 * Math.atan(bulge);
  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const distance = chord / (2 * Math.tan(theta / 2));
  const center: XY = [
    (start.x + end.x) / 2 - ((end.y - start.y) / chord) * distance,
    (start.y + end.y) / 2 + ((end.x - start.x) / chord) * distance,
  ];
  includeTransformedCircle(aabb, matrix, center, radius);
}

function includeTextBounds(aabb: MutableAabb, matrix: Matrix, entity: CadEntity): boolean {
  const raw = entity.raw && typeof entity.raw === 'object' ? entity.raw as Record<string, unknown> : {};
  const anchor = entity.insertionPoint ?? entity.startPoint
    ?? (validPoint(raw.insertionPoint) ? raw.insertionPoint : validPoint(raw.startPoint) ? raw.startPoint : undefined);
  if (!validPoint(anchor)) return false;
  const text = String(entity.text ?? entity.value ?? raw.text ?? '');
  if (!text) return true;
  const height = Math.abs(finite(
    entity.textHeight ?? entity.height ?? raw.textHeight ?? raw.extentsHeight ?? raw.rectHeight,
  ));
  if (height <= EPSILON) return false;
  const width = Math.max(
    height,
    Math.abs(finite(entity.width ?? raw.extentsWidth ?? raw.rectWidth ?? raw.columnWidth)),
    height * Math.max(1, text.length) * Math.max(1, Math.abs(finite(entity.xScale ?? raw.xScale, 1))),
  );
  const rotation = angle(entity.rotation ?? raw.rotation);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // Justification varies by TEXT/MTEXT/ATTRIB. A symmetric authored-space box
  // is deliberately larger than any one anchoring convention.
  for (const [dx, dy] of [[-width, -height], [width, -height], [width, height], [-width, height]] as const) {
    collectPoint(aabb, matrix, {
      x: anchor.x + cos * dx - sin * dy,
      y: anchor.y + sin * dx + cos * dy,
    });
  }
  return true;
}

function primitiveEntityAabb(entity: CadEntity, matrix: Matrix): CadAabb | null {
  const result = emptyAabb();
  let collected = false;
  const kind = entityKind(entity);

  if ((kind === 'circle' || kind === 'arc') && validPoint(entity.center) && Number.isFinite(entity.radius)) {
    includeTransformedCircle(result, matrix, [entity.center.x, entity.center.y], entity.radius ?? 0);
    collected = true;
  } else if (kind === 'ellipse' && validPoint(entity.center) && validPoint(entity.majorAxisEndPoint)) {
    const center = transformPoint(matrix, [entity.center.x, entity.center.y]);
    const major = entity.majorAxisEndPoint;
    const ratio = Math.abs(finite(entity.axisRatio, 1));
    const minor: XY = [-major.y * ratio, major.x * ratio];
    const transformedMajor: XY = [matrix[0] * major.x + matrix[2] * major.y, matrix[1] * major.x + matrix[3] * major.y];
    const transformedMinor: XY = [matrix[0] * minor[0] + matrix[2] * minor[1], matrix[1] * minor[0] + matrix[3] * minor[1]];
    const extentX = Math.hypot(transformedMajor[0], transformedMinor[0]);
    const extentY = Math.hypot(transformedMajor[1], transformedMinor[1]);
    includeAabb(result, [center[0] - extentX, center[1] - extentY, center[0] + extentX, center[1] + extentY]);
    collected = true;
  } else {
    for (const point of [entity.startPoint, entity.endPoint, entity.center, entity.insertionPoint, entity.majorAxisEndPoint]) {
      collected = collectPoint(result, matrix, point) || collected;
    }
    for (const points of [entity.vertices, entity.points, entity.controlPoints, entity.fitPoints]) {
      for (const point of points ?? []) collected = collectPoint(result, matrix, point) || collected;
    }
    if (entity.vertices?.length) {
      const pairs = entity.isClosed ? entity.vertices.length : entity.vertices.length - 1;
      for (let index = 0; index < pairs; index += 1) {
        includeBulgeBounds(result, matrix, entity.vertices[index], entity.vertices[(index + 1) % entity.vertices.length]);
      }
    }
    for (const loop of entity.loops ?? []) {
      for (const point of loop.vertices ?? []) collected = collectPoint(result, matrix, point) || collected;
      collected = collectPathPoints(result, matrix, loop.commands) || collected;
    }
    collected = collectPathPoints(result, matrix, entity.commands) || collected;
    if (kind === 'text' && !includeTextBounds(result, matrix, entity)) return null;
    if (!collected || kind === 'hatch' || kind === 'image' || kind === 'unsupported') {
      const rawGeometry = collectRawGeometryPoints(result, matrix, entity.raw);
      if (rawGeometry.unsafe) return null;
      collected = rawGeometry.collected || collected;
    }
  }

  if (!collected) return null;
  const width = Math.max(
    0,
    Math.abs(finite(entity.constantWidth)),
    Math.abs(finite(entity.lineweight)) / 100,
    Math.abs(finite(entity.thickness)),
  );
  const linearScale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
  const padding = width * linearScale / 2;
  const resolved = finalAabb(result);
  return resolved && padding > 0 ? expandAabb(resolved, padding) : resolved;
}

function arrayCorners(entity: CadEntity): Array<readonly [number, number]> {
  const columns = Math.max(1, Math.trunc(finite(entity.insertColumnCount, 1)));
  const rows = Math.max(1, Math.trunc(finite(entity.insertRowCount, 1)));
  const candidates: Array<readonly [number, number]> = [[0, 0]];
  if (columns > 1) candidates.push([columns - 1, 0]);
  if (rows > 1) candidates.push([0, rows - 1]);
  if (columns > 1 && rows > 1) candidates.push([columns - 1, rows - 1]);
  return candidates;
}

function entityAabb(
  entity: CadEntity,
  parentMatrix: Matrix,
  context: ExtentContext,
  path: string[],
  entityKeyValue?: string,
): CadAabb | null {
  if (entity.isVisible === false) return primitiveEntityAabb(entity, parentMatrix);
  if (entityKind(entity) !== 'insert') return primitiveEntityAabb(entity, parentMatrix);

  const entry = context.resolveBlock(entity);
  if (!entry) {
    context.warnings.push({
      code: 'missing-block',
      entityKey: entityKeyValue,
      blockName: String(entity.blockName ?? entity.name ?? '') || undefined,
      path,
    });
    return null;
  }
  if (path.some((name) => canonical(name) === canonical(entry.key))) {
    context.warnings.push({ code: 'cyclic-block', entityKey: entityKeyValue, blockName: entry.name, path: [...path, entry.key] });
    return null;
  }
  if (path.length >= context.maxDepth) {
    context.warnings.push({ code: 'max-depth', entityKey: entityKeyValue, blockName: entry.name, path: [...path, entry.key] });
    return null;
  }

  const result = emptyAabb();
  let hasExtent = false;
  const nextPath = [...path, entry.key];
  for (const [column, row] of arrayCorners(entity)) {
    const matrix = multiply(parentMatrix, insertMatrix(entity, entry.block.basePoint, column, row));
    for (const child of entry.block.entities) {
      const childExtent = entityAabb(child, matrix, context, nextPath, entityKeyValue);
      if (!childExtent) return null;
      includeAabb(result, childExtent);
      hasExtent = true;
    }
    for (const attribute of entity.attribs ?? []) {
      const attributeExtent = entityAabb(attribute, parentMatrix, context, nextPath, entityKeyValue);
      if (!attributeExtent) return null;
      includeAabb(result, attributeExtent);
      hasExtent = true;
    }
  }
  if (!hasExtent) {
    return validPoint(entity.insertionPoint)
      ? primitiveEntityAabb({ ...entity, kind: 'point' }, parentMatrix)
      : null;
  }
  return finalAabb(result);
}

function deduplicateWarnings(warnings: CadSpatialFilterWarning[]): CadSpatialFilterWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.entityKey ?? ''}:${canonical(warning.blockName)}:${warning.path?.map(canonical).join('>') ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reachableBlocks(document: CadDocument, resolveBlock: ReturnType<typeof createBlockResolver>): Set<string> {
  const reachable = new Set<string>();
  const visit = (entry: BlockEntry, path: string[]) => {
    if (reachable.has(entry.key)) return;
    reachable.add(entry.key);
    if (path.some((key) => canonical(key) === canonical(entry.key))) return;
    const nextPath = [...path, entry.key];
    for (const child of entry.block.entities) {
      if (entityKind(child) !== 'insert') continue;
      const referenced = resolveBlock(child);
      if (referenced) visit(referenced, nextPath);
    }
  };
  for (const entity of document.entities) {
    if (entityKind(entity) !== 'insert') continue;
    const entry = resolveBlock(entity);
    if (entry) visit(entry, []);
  }
  return reachable;
}

function emptyReport(enabled: boolean, retainedRootEntityCount: number): CadSpatialFilterReport {
  return {
    enabled,
    coordinateReferenceSystem: BOUNDARY.coordinateReferenceSystem,
    bufferMeters: BOUNDARY.bufferMeters,
    sourceAuthority: BOUNDARY.source.authority,
    sourceLicense: BOUNDARY.source.license,
    retainedRootEntityCount,
    removedRootEntityCount: 0,
    unknownRootEntityCount: 0,
    removedBlockDefinitionCount: 0,
    removedEntityKeys: [],
    unknownEntityKeys: [],
    removedBlockNames: [],
    warnings: [],
  };
}

/**
 * Removes model-space root entities only when their complete recursive AABB is
 * demonstrably outside Luxembourg plus 1 km. Unknown or damaged geometry is
 * retained (fail-open). The parser-owned document and entity objects are not mutated.
 */
export function filterCadDocumentToLuxembourg(
  document: CadDocument,
  settings: CadSpatialFilterSettings = { enabled: true },
): CadSpatialFilterResult {
  if (!settings.enabled) return { document, report: emptyReport(false, document.entities.length) };

  const resolveBlock = createBlockResolver(document.blocks);
  const warnings: CadSpatialFilterWarning[] = [];
  const context: ExtentContext = { resolveBlock, warnings, maxDepth: 64 };
  const retained: CadEntity[] = [];
  const removedEntityKeys: string[] = [];
  const unknownEntityKeys: string[] = [];

  document.entities.forEach((entity, index) => {
    const key = entityKey(entity, index);
    const extent = entityAabb(entity, IDENTITY, context, [], key);
    const classification = extent ? classifyAabbAgainstLuxembourg(extent) : 'unknown';
    if (classification === 'outside') {
      removedEntityKeys.push(key);
      return;
    }
    if (classification === 'unknown') {
      unknownEntityKeys.push(key);
      warnings.push({ code: 'invalid-extent', entityKey: key });
    }
    retained.push(entity);
  });

  const partiallyFiltered: CadDocument = retained.length === document.entities.length
    ? document
    : { ...document, entities: retained };
  const filteredResolveBlock = createBlockResolver(partiallyFiltered.blocks);
  const reachable = reachableBlocks(partiallyFiltered, filteredResolveBlock);
  const blocks: CadDocument['blocks'] = {};
  const removedBlockNames: string[] = [];
  for (const [key, block] of Object.entries(document.blocks)) {
    if (reachable.has(key)) blocks[key] = block;
    else removedBlockNames.push(key);
  }

  const filteredDocument = removedBlockNames.length
    ? { ...partiallyFiltered, blocks }
    : partiallyFiltered;
  return {
    document: filteredDocument,
    report: {
      ...emptyReport(true, retained.length),
      removedRootEntityCount: removedEntityKeys.length,
      unknownRootEntityCount: unknownEntityKeys.length,
      removedBlockDefinitionCount: removedBlockNames.length,
      removedEntityKeys,
      unknownEntityKeys,
      removedBlockNames,
      warnings: deduplicateWarnings(warnings),
    },
  };
}
