import Feature from 'ol/Feature';
import Circle from 'ol/geom/Circle';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { createEmpty, extend as extendExtent, isEmpty } from 'ol/extent';
import { resolveCadColor } from '@flyfish-dev/cad-viewer';
import type { CadDocument, CadEntity, CadPoint3D } from '@flyfish-dev/cad-viewer';
import { LUREF_CODE, WEB_MERCATOR_CODE } from '../crs';
import type { CadOverlayLayer } from '../../types/models';

type Matrix = [number, number, number, number, number, number];
type XY = [number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const CURVE_SEGMENTS = 64;

export interface CadConversionResult {
  features: Feature<Geometry>[];
  layers: CadOverlayLayer[];
  lurefExtent: [number, number, number, number] | null;
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
  if ((kind === 'solid' || kind === 'hatch') && entity.vertices && entity.vertices.length >= 3) {
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
      warnings.add(`unsupported:${entity.type}`);
      return;
    }
    extendExtent(lurefExtent, geometry.getExtent());
    geometry.transform(LUREF_CODE, WEB_MERCATOR_CODE);
    const feature = new Feature({ geometry });
    feature.setProperties({
      layerId,
      cadType: entity.type,
      cadColor: resolveCadColor(entity, document, { background: '#334b36', foreground: '#ffffff', contrastMode: 'preserve' }),
      label: kind === 'text' ? String(entity.text ?? entity.value ?? '') : '',
      textHeight: entity.textHeight ?? entity.height,
    });
    features.push(feature);
    layerCounts.set(layerId, (layerCounts.get(layerId) ?? 0) + 1);
  };

  document.entities.forEach((entity) => visit(entity, IDENTITY));
  const layers = [...new Set([...Object.keys(document.layers), ...layerCounts.keys()])]
    .map((id) => ({ id, name: document.layers[id]?.name ?? id, visible: document.layers[id]?.isVisible !== false, featureCount: layerCounts.get(id) ?? 0 }))
    .filter((layer) => layer.featureCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    features,
    layers,
    lurefExtent: isEmpty(lurefExtent) ? null : (lurefExtent as [number, number, number, number]),
    warnings: [...warnings],
  };
}
