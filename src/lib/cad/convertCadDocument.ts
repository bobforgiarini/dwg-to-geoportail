import Feature from 'ol/Feature';
import Circle from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { createEmpty, extend as extendExtent, getCenter, isEmpty } from 'ol/extent';
import { resolveCadColor } from '@flyfish-dev/cad-viewer';
import type { CadDocument, CadEntity, CadPoint3D } from '@flyfish-dev/cad-viewer';
import { LUREF_CODE, WEB_MERCATOR_CODE } from '../crs';
import type { CadOverlayLayer } from '../../types/models';
import { createCadObjectKey } from './objectKey';
import { createCadDrawOrderGroupKey } from './drawOrder';

type Matrix = [number, number, number, number, number, number];
type XY = [number, number];
type FitCandidate = { center: XY; extent: [number, number, number, number] };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const CURVE_SEGMENTS = 64;
const NATIONAL_LUREF_BOUNDS: [number, number, number, number] = [30_000, 50_000, 130_000, 160_000];
const PLAUSIBLE_LUREF_BOUNDS: [number, number, number, number] = [0, 0, 160_000, 180_000];

function coordinateInExtent(coordinate: XY, extent: [number, number, number, number]): boolean {
  return coordinate[0] >= extent[0] && coordinate[0] <= extent[2] && coordinate[1] >= extent[1] && coordinate[1] <= extent[3];
}

function densestModelExtent(candidates: FitCandidate[]): [number, number, number, number] | null {
  if (!candidates.length) return null;
  const cellSize = 5_000;
  const cells = new Map<string, { x: number; y: number; count: number }>();
  for (const candidate of candidates) {
    const x = Math.floor(candidate.center[0] / cellSize);
    const y = Math.floor(candidate.center[1] / cellSize);
    const key = `${x}:${y}`;
    const current = cells.get(key);
    cells.set(key, { x, y, count: (current?.count ?? 0) + 1 });
  }
  const densest = [...cells.values()].sort((left, right) => right.count - left.count)[0];
  const extent = createEmpty();
  for (const candidate of candidates) {
    const x = Math.floor(candidate.center[0] / cellSize);
    const y = Math.floor(candidate.center[1] / cellSize);
    if (Math.abs(x - densest.x) > 1 || Math.abs(y - densest.y) > 1) continue;
    const width = candidate.extent[2] - candidate.extent[0];
    const height = candidate.extent[3] - candidate.extent[1];
    if (width <= 20_000 && height <= 20_000) extendExtent(extent, candidate.extent);
    else extendExtent(extent, [candidate.center[0], candidate.center[1], candidate.center[0], candidate.center[1]]);
  }
  return isEmpty(extent) ? null : (extent as [number, number, number, number]);
}

export interface CadConversionResult {
  features: Feature<Geometry>[];
  layers: CadOverlayLayer[];
  lurefExtent: [number, number, number, number] | null;
  autoHiddenFeatureIds: string[];
  warnings: string[];
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

function apply(matrix: Matrix, point: CadPoint3D): XY {
  return [
    matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  ];
}

function applyXy(matrix: Matrix, point: XY): XY {
  return [matrix[0] * point[0] + matrix[2] * point[1] + matrix[4], matrix[1] * point[0] + matrix[3] * point[1] + matrix[5]];
}

function hasZ(entity: CadEntity): boolean {
  const points = [
    entity.startPoint,
    entity.endPoint,
    entity.center,
    entity.insertionPoint,
    ...(entity.vertices ?? []),
    ...(entity.points ?? []),
    ...(entity.controlPoints ?? []),
    ...(entity.fitPoints ?? []),
  ];
  return points.some((point) => point?.z !== undefined && Math.abs(point.z) > 1e-6) || Boolean(entity.thickness);
}

function angle(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Math.abs(value) > Math.PI * 4 ? (value * Math.PI) / 180 : value;
}

function sampleArc(center: CadPoint3D, radius: number, start: number, end: number, matrix: Matrix): XY[] {
  let sweep = end - start;
  while (sweep <= 0) sweep += Math.PI * 2;
  const segments = Math.max(12, Math.ceil((CURVE_SEGMENTS * sweep) / (Math.PI * 2)));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const current = start + (sweep * index) / segments;
    return applyXy(matrix, [center.x + Math.cos(current) * radius, center.y + Math.sin(current) * radius]);
  });
}

function sampleEllipse(entity: CadEntity, matrix: Matrix): XY[] | null {
  if (!entity.center || !entity.majorAxisEndPoint) return null;
  const major = entity.majorAxisEndPoint;
  const majorLength = Math.hypot(major.x, major.y);
  if (!majorLength) return null;
  const ratio = entity.axisRatio ?? 1;
  const ux = major.x / majorLength;
  const uy = major.y / majorLength;
  const start = angle(entity.startAngle, 0);
  let end = angle(entity.endAngle, Math.PI * 2);
  while (end <= start) end += Math.PI * 2;
  return Array.from({ length: CURVE_SEGMENTS + 1 }, (_, index) => {
    const current = start + ((end - start) * index) / CURVE_SEGMENTS;
    const x = entity.center!.x + ux * majorLength * Math.cos(current) - uy * majorLength * ratio * Math.sin(current);
    const y = entity.center!.y + uy * majorLength * Math.cos(current) + ux * majorLength * ratio * Math.sin(current);
    return applyXy(matrix, [x, y]);
  });
}

function bulgePoints(start: CadPoint3D, end: CadPoint3D, bulge: number, matrix: Matrix): XY[] {
  if (!bulge) return [apply(matrix, start), apply(matrix, end)];
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (!chord) return [apply(matrix, start)];
  const theta = 4 * Math.atan(bulge);
  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const midpoint: XY = [(start.x + end.x) / 2, (start.y + end.y) / 2];
  const distance = chord / (2 * Math.tan(theta / 2));
  const nx = -(end.y - start.y) / chord;
  const ny = (end.x - start.x) / chord;
  const center: XY = [midpoint[0] + nx * distance, midpoint[1] + ny * distance];
  const startAngle = Math.atan2(start.y - center[1], start.x - center[0]);
  const segments = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const current = startAngle + (theta * index) / segments;
    return applyXy(matrix, [center[0] + radius * Math.cos(current), center[1] + radius * Math.sin(current)]);
  });
}

function polylineCoordinates(entity: CadEntity, matrix: Matrix): XY[] {
  const vertices = (entity.vertices ?? entity.points ?? []) as Array<CadPoint3D & { bulge?: number }>;
  if (vertices.length < 2) return vertices.map((point) => apply(matrix, point));
  const pairs = entity.isClosed ? vertices.length : vertices.length - 1;
  const coordinates: XY[] = [];
  for (let index = 0; index < pairs; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const segment = bulgePoints(current, next, current.bulge ?? 0, matrix);
    coordinates.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return coordinates;
}

function sampleCubic(start: XY, control1: XY, control2: XY, end: XY, segments = 16): XY[] {
  return Array.from({ length: segments }, (_, index) => {
    const t = (index + 1) / segments;
    const inverse = 1 - t;
    return [
      inverse ** 3 * start[0] + 3 * inverse ** 2 * t * control1[0] + 3 * inverse * t ** 2 * control2[0] + t ** 3 * end[0],
      inverse ** 3 * start[1] + 3 * inverse ** 2 * t * control1[1] + 3 * inverse * t ** 2 * control2[1] + t ** 3 * end[1],
    ];
  });
}

function sampleQuadratic(start: XY, control: XY, end: XY, segments = 12): XY[] {
  return Array.from({ length: segments }, (_, index) => {
    const t = (index + 1) / segments;
    const inverse = 1 - t;
    return [
      inverse ** 2 * start[0] + 2 * inverse * t * control[0] + t ** 2 * end[0],
      inverse ** 2 * start[1] + 2 * inverse * t * control[1] + t ** 2 * end[1],
    ];
  });
}

type RawPoint = { x?: unknown; y?: unknown; bulge?: unknown };
type RawHatchPath = {
  isClosed?: unknown;
  vertices?: RawPoint[];
  edges?: Array<{
    type?: unknown;
    start?: RawPoint;
    end?: RawPoint;
    center?: RawPoint;
    radius?: unknown;
    startAngle?: unknown;
    endAngle?: unknown;
    isCCW?: unknown;
    controlPoints?: RawPoint[];
    fitDatum?: RawPoint[];
  } | null | undefined>;
};

function rawXy(point: RawPoint | undefined): XY | null {
  return point && typeof point.x === 'number' && typeof point.y === 'number' ? [point.x, point.y] : null;
}

function rawHatchRings(entity: CadEntity, matrix: Matrix): XY[][] {
  if (!entity.raw || typeof entity.raw !== 'object') return [];
  const paths = (entity.raw as { boundaryPaths?: Array<RawHatchPath | null | undefined> }).boundaryPaths;
  if (!Array.isArray(paths)) return [];
  const rings: XY[][] = [];
  for (const path of paths) {
    if (!path) continue;
    let authored: XY[] = [];
    if (Array.isArray(path.vertices) && path.vertices.length >= 3) {
      const vertices = path.vertices
        .map((point) => rawXy(point))
        .filter((point): point is XY => point !== null);
      for (let index = 0; index < vertices.length; index += 1) {
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        const bulge = Number(path.vertices[index]?.bulge ?? 0);
        const points = bulgePoints({ x: current[0], y: current[1] }, { x: next[0], y: next[1] }, Number.isFinite(bulge) ? bulge : 0, IDENTITY);
        authored.push(...(index === 0 ? points : points.slice(1)));
      }
    } else if (Array.isArray(path.edges)) {
      for (const edge of path.edges) {
        if (!edge) continue;
        const edgeType = Number(edge.type);
        if (edgeType === 1) {
          const start = rawXy(edge.start);
          const end = rawXy(edge.end);
          if (start && (!authored.length || authored.at(-1)?.[0] !== start[0] || authored.at(-1)?.[1] !== start[1])) authored.push(start);
          if (end) authored.push(end);
        } else if (edgeType === 2) {
          const center = rawXy(edge.center);
          const radius = Number(edge.radius);
          if (center && Number.isFinite(radius) && radius > 0) {
            let start = angle(Number(edge.startAngle), 0);
            let end = angle(Number(edge.endAngle), Math.PI * 2);
            if (edge.isCCW === false) [start, end] = [end, start];
            authored.push(...sampleArc({ x: center[0], y: center[1] }, radius, start, end, IDENTITY).slice(authored.length ? 1 : 0));
          }
        } else if (edgeType === 4) {
          const source = Array.isArray(edge.fitDatum) && edge.fitDatum.length > 1 ? edge.fitDatum : edge.controlPoints;
          const points = source?.map((point) => rawXy(point)).filter((point): point is XY => point !== null) ?? [];
          authored.push(...points.slice(authored.length ? 1 : 0));
        }
      }
    }
    if (authored.length >= 3) {
      if (authored[0][0] !== authored.at(-1)?.[0] || authored[0][1] !== authored.at(-1)?.[1]) authored.push(authored[0]);
      rings.push(authored.map((point) => applyXy(matrix, point)));
    }
  }
  return rings;
}

function commandRings(entity: CadEntity, matrix: Matrix): XY[][] {
  const rings: XY[][] = [];
  for (const loop of entity.loops ?? []) {
    if (loop.vertices?.length) {
      const ring = loop.vertices.map((point) => apply(matrix, point));
      if (ring.length >= 3) {
        if (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1]) ring.push(ring[0]);
        rings.push(ring);
      }
      continue;
    }
    let sourceRing: XY[] = [];
    let current: XY | null = null;
    let start: XY | null = null;
    const finish = () => {
      if (sourceRing.length >= 3) {
        if (sourceRing[0][0] !== sourceRing.at(-1)?.[0] || sourceRing[0][1] !== sourceRing.at(-1)?.[1]) sourceRing.push(sourceRing[0]);
        rings.push(sourceRing.map((point) => applyXy(matrix, point)));
      }
      sourceRing = [];
      current = null;
      start = null;
    };
    for (const command of loop.commands ?? []) {
      if (command.cmd === 'M' && command.points[0]) {
        if (sourceRing.length) finish();
        current = [command.points[0].x, command.points[0].y];
        start = current;
        sourceRing.push(current);
      } else if (command.cmd === 'L' && command.points[0]) {
        current = [command.points[0].x, command.points[0].y];
        sourceRing.push(current);
      } else if (command.cmd === 'C' && current && command.points.length >= 3) {
        const control1: XY = [command.points[0].x, command.points[0].y];
        const control2: XY = [command.points[1].x, command.points[1].y];
        const end: XY = [command.points[2].x, command.points[2].y];
        sourceRing.push(...sampleCubic(current, control1, control2, end));
        current = end;
      } else if (command.cmd === 'Q' && current && command.points.length >= 2) {
        const control: XY = [command.points[0].x, command.points[0].y];
        const end: XY = [command.points[1].x, command.points[1].y];
        sourceRing.push(...sampleQuadratic(current, control, end));
        current = end;
      } else if (command.cmd === 'Z' && start) {
        sourceRing.push(start);
      }
    }
    finish();
  }
  return rings.length ? rings : rawHatchRings(entity, matrix);
}

function entityGeometry(entity: CadEntity, matrix: Matrix): Geometry | null {
  const kind = entity.kind ?? entity.type.toLowerCase();
  if (kind === 'line' && entity.startPoint && entity.endPoint) {
    return new LineString([apply(matrix, entity.startPoint), apply(matrix, entity.endPoint)]);
  }
  if (kind === 'polyline') {
    const coordinates = polylineCoordinates(entity, matrix);
    return coordinates.length > 1 ? new LineString(coordinates) : null;
  }
  if (kind === 'circle' && entity.center && entity.radius) {
    return new LineString(sampleArc(entity.center, entity.radius, 0, Math.PI * 2, matrix));
  }
  if (kind === 'arc' && entity.center && entity.radius) {
    return new LineString(sampleArc(entity.center, entity.radius, angle(entity.startAngle, 0), angle(entity.endAngle, Math.PI * 2), matrix));
  }
  if (kind === 'ellipse') {
    const coordinates = sampleEllipse(entity, matrix);
    return coordinates ? new LineString(coordinates) : null;
  }
  if (kind === 'spline') {
    const points = entity.fitPoints?.length ? entity.fitPoints : entity.controlPoints;
    return points && points.length > 1 ? new LineString(points.map((point) => apply(matrix, point))) : null;
  }
  if (kind === 'point') {
    const point = entity.insertionPoint ?? entity.startPoint ?? entity.points?.[0];
    return point ? new Point(apply(matrix, point)) : null;
  }
  if (kind === 'text') {
    const point = entity.insertionPoint ?? entity.startPoint;
    return point ? new Point(apply(matrix, point)) : null;
  }
  if (kind === 'hatch') {
    const rings = commandRings(entity, matrix);
    return rings.length ? new Polygon(rings) : null;
  }
  if (kind === 'solid' && entity.vertices && entity.vertices.length >= 3) {
    const ring = entity.vertices.map((point) => apply(matrix, point));
    ring.push(ring[0]);
    return new Polygon([ring]);
  }
  return null;
}

function insertMatrix(entity: CadEntity, basePoint: CadPoint3D | undefined): Matrix {
  const insertion = entity.insertionPoint ?? { x: 0, y: 0 };
  const scale = entity.scale ?? { x: 1, y: 1 };
  const rotation = angle(entity.rotation, 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const base = basePoint ?? { x: 0, y: 0 };
  return [
    cos * (scale.x || 1),
    sin * (scale.x || 1),
    -sin * (scale.y || 1),
    cos * (scale.y || 1),
    insertion.x - cos * (scale.x || 1) * base.x + sin * (scale.y || 1) * base.y,
    insertion.y - sin * (scale.x || 1) * base.x - cos * (scale.y || 1) * base.y,
  ];
}

export function convertCadDocument(document: CadDocument): CadConversionResult {
  const features: Feature<Geometry>[] = [];
  const warnings = new Set<string>(document.warnings);
  const layerCounts = new Map<string, number>();
  const lurefExtent = createEmpty();
  const nationalLurefExtent = createEmpty();
  const plausibleLurefExtent = createEmpty();
  const nationalFitCandidates: FitCandidate[] = [];

  const visit = (entity: CadEntity, parentMatrix: Matrix, inheritedLayer?: string, stack: string[] = []) => {
    if (entity.isVisible === false) return;
    if (entity.isInPaperSpace) {
      warnings.add('paper-space-ignored');
      return;
    }
    if (hasZ(entity)) warnings.add('3d-flattened');
    const layerId = entity.layer || inheritedLayer || '0';
    const kind = entity.kind ?? entity.type.toLowerCase();

    if (kind === 'insert') {
      const blockName = entity.blockName ?? entity.name;
      const block = blockName ? document.blocks[blockName] : undefined;
      if (!block || !blockName) {
        warnings.add('missing-block');
        return;
      }
      if (stack.includes(blockName) || stack.length >= 32) {
        warnings.add('cyclic-block');
        return;
      }
      const matrix = multiply(parentMatrix, insertMatrix(entity, block.basePoint));
      block.entities.forEach((child) => visit(child, matrix, layerId, [...stack, blockName]));
      return;
    }

    const geometry = entityGeometry(entity, parentMatrix);
    if (!geometry) {
      warnings.add(kind === 'hatch' ? 'hatch-boundary-missing' : `unsupported:${entity.type}`);
      return;
    }
    const authoredExtent = geometry.getExtent();
    extendExtent(lurefExtent, authoredExtent);
    const authoredCenter = getCenter(authoredExtent) as XY;
    if (coordinateInExtent(authoredCenter, NATIONAL_LUREF_BOUNDS)) {
      extendExtent(nationalLurefExtent, authoredExtent);
      nationalFitCandidates.push({ center: authoredCenter, extent: [...authoredExtent] as [number, number, number, number] });
    }
    if (coordinateInExtent(authoredCenter, PLAUSIBLE_LUREF_BOUNDS)) extendExtent(plausibleLurefExtent, authoredExtent);
    geometry.transform(LUREF_CODE, WEB_MERCATOR_CODE);
    const authoredSnapCenter = entity.center ? apply(parentMatrix, entity.center) : null;
    const cadSnapCenter = authoredSnapCenter
      ? new Point(authoredSnapCenter).transform(LUREF_CODE, WEB_MERCATOR_CODE).getCoordinates()
      : undefined;
    const feature = new Feature({ geometry });
    const featureId = `${entity.handle ?? entity.id ?? entity.type}-${features.length}`;
    const objectKey = createCadObjectKey(String(entity.handle ?? entity.id ?? featureId), stack);
    const drawOrderGroupKey = createCadDrawOrderGroupKey(
      String(entity.handle ?? entity.id ?? featureId),
      stack,
    );
    const normalizedType = String(entity.type ?? '').trim().toUpperCase();
    const isCadAnnotation = kind === 'text'
      || normalizedType === 'LEADER'
      || normalizedType === 'MLEADER'
      || normalizedType === 'MULTILEADER';
    feature.setId(featureId);
    feature.setProperties({
      featureId,
      objectKey,
      drawOrderGroupKey,
      layerId,
      cadType: entity.type,
      cadColor: resolveCadColor(entity, document, { background: '#334b36', foreground: '#ffffff', contrastMode: 'preserve' }),
      label: kind === 'text' ? String(entity.text ?? entity.value ?? '') : '',
      textHeight: entity.textHeight ?? entity.height,
      // Text visibility intentionally includes annotation leader geometry so
      // hiding its label never leaves orphaned arrows/lines behind.
      isCadText: isCadAnnotation,
      isLurefNational: coordinateInExtent(authoredCenter, NATIONAL_LUREF_BOUNDS),
      blockPath: [...stack],
      cadSnapCenter,
    });
    features.push(feature);
    layerCounts.set(layerId, (layerCounts.get(layerId) ?? 0) + 1);
  };

  document.entities.forEach((entity) => visit(entity, IDENTITY));
  const layers = [...new Set([...Object.keys(document.layers), ...layerCounts.keys()])]
    .map((id) => ({ id, name: document.layers[id]?.name ?? id, visible: document.layers[id]?.isVisible !== false, featureCount: layerCounts.get(id) ?? 0 }))
    .filter((layer) => layer.featureCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const modelFitExtent = densestModelExtent(nationalFitCandidates);
  return {
    features,
    layers,
    autoHiddenFeatureIds: isEmpty(nationalLurefExtent)
      ? []
      : features.filter((feature) => feature.get('isLurefNational') !== true).map((feature) => String(feature.get('featureId'))),
    lurefExtent: modelFitExtent
      ? modelFitExtent
      : !isEmpty(plausibleLurefExtent)
        ? (plausibleLurefExtent as [number, number, number, number])
        : (isEmpty(lurefExtent) ? null : (lurefExtent as [number, number, number, number])),
    warnings: [...warnings],
  };
}
