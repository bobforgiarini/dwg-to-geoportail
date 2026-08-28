import type {
  DistanceMeasurementState,
  LurefCoordinate,
  MeasurementPoint,
} from '../types/models';

export const INITIAL_DISTANCE_MEASUREMENT_STATE: DistanceMeasurementState = {
  phase: 'inactive',
  snapEnabled: true,
};

function copyPoint(point: MeasurementPoint): MeasurementPoint {
  return {
    coordinate: [point.coordinate[0], point.coordinate[1]],
    source: point.source,
    ...(point.snapKind ? { snapKind: point.snapKind } : {}),
  };
}

export function startDistanceMeasurement(
  state: DistanceMeasurementState,
): DistanceMeasurementState {
  return { phase: 'placing-first', snapEnabled: state.snapEnabled };
}

export function commitDistanceMeasurementPoint(
  state: DistanceMeasurementState,
  point: MeasurementPoint,
): DistanceMeasurementState {
  if (state.phase === 'placing-first') {
    assertFiniteCoordinate(point.coordinate);
    return {
      phase: 'placing-second',
      snapEnabled: state.snapEnabled,
      firstPoint: copyPoint(point),
    };
  }
  if (state.phase === 'placing-second') {
    assertFiniteCoordinate(point.coordinate);
    return {
      phase: 'complete',
      snapEnabled: state.snapEnabled,
      firstPoint: state.firstPoint,
      secondPoint: copyPoint(point),
    };
  }
  return state;
}

export function restartDistanceMeasurement(
  state: DistanceMeasurementState,
): DistanceMeasurementState {
  return { phase: 'placing-first', snapEnabled: state.snapEnabled };
}

export function cancelDistanceMeasurement(
  state: DistanceMeasurementState,
): DistanceMeasurementState {
  return { phase: 'inactive', snapEnabled: state.snapEnabled };
}

export function setDistanceMeasurementSnapEnabled(
  state: DistanceMeasurementState,
  snapEnabled: boolean,
): DistanceMeasurementState {
  if (state.snapEnabled === snapEnabled) return state;
  return { ...state, snapEnabled } as DistanceMeasurementState;
}

function assertFiniteCoordinate(coordinate: LurefCoordinate): void {
  if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
    throw new RangeError('LUREF coordinates must contain finite values.');
  }
}

export function calculateDistanceMeters(
  first: LurefCoordinate,
  second: LurefCoordinate,
): number {
  assertFiniteCoordinate(first);
  assertFiniteCoordinate(second);
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function assertDistance(distanceMeters: number): void {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new RangeError('Distance must be a finite, non-negative value.');
  }
}

export function formatDistanceMeters(distanceMeters: number, locale: string): string {
  assertDistance(distanceMeters);
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    useGrouping: false,
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(distanceMeters);
}

export function formatLurefCoordinate(coordinate: LurefCoordinate, locale: string): string {
  assertFiniteCoordinate(coordinate);
  const formatter = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${formatter.format(coordinate[0])} / ${formatter.format(coordinate[1])}`;
}
