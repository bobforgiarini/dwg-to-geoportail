import { describe, expect, it } from 'vitest';
import type { DistanceMeasurementState, MeasurementPoint } from '../types/models';
import {
  INITIAL_DISTANCE_MEASUREMENT_STATE,
  calculateDistanceMeters,
  cancelDistanceMeasurement,
  commitDistanceMeasurementPoint,
  formatDistanceMeters,
  formatLurefCoordinate,
  restartDistanceMeasurement,
  setDistanceMeasurementSnapEnabled,
  startDistanceMeasurement,
} from './measurement';

const first: MeasurementPoint = { coordinate: [80_000, 70_000], source: 'aim' };
const second: MeasurementPoint = {
  coordinate: [80_003, 70_004],
  source: 'cad-snap',
  snapKind: 'endpoint',
};

describe('distance measurement state', () => {
  it('captures exactly two points and then waits for an explicit restart', () => {
    const placingFirst = startDistanceMeasurement(INITIAL_DISTANCE_MEASUREMENT_STATE);
    expect(placingFirst).toEqual({ phase: 'placing-first', snapEnabled: true });

    const placingSecond = commitDistanceMeasurementPoint(placingFirst, first);
    expect(placingSecond).toEqual({
      phase: 'placing-second',
      snapEnabled: true,
      firstPoint: first,
    });

    const complete = commitDistanceMeasurementPoint(placingSecond, second);
    expect(complete).toEqual({
      phase: 'complete',
      snapEnabled: true,
      firstPoint: first,
      secondPoint: second,
    });
    expect(commitDistanceMeasurementPoint(complete, first)).toBe(complete);
  });

  it('preserves the snap preference across restart and cancel', () => {
    const withoutSnap = setDistanceMeasurementSnapEnabled(
      INITIAL_DISTANCE_MEASUREMENT_STATE,
      false,
    );
    const active = startDistanceMeasurement(withoutSnap);
    const withPoint = commitDistanceMeasurementPoint(active, first);

    expect(restartDistanceMeasurement(withPoint)).toEqual({
      phase: 'placing-first',
      snapEnabled: false,
    });
    expect(cancelDistanceMeasurement(withPoint)).toEqual({
      phase: 'inactive',
      snapEnabled: false,
    });
  });

  it('does not capture points while inactive', () => {
    expect(commitDistanceMeasurementPoint(INITIAL_DISTANCE_MEASUREMENT_STATE, first))
      .toBe(INITIAL_DISTANCE_MEASUREMENT_STATE);
  });

  it('rejects a non-finite point while capturing', () => {
    const active = startDistanceMeasurement(INITIAL_DISTANCE_MEASUREMENT_STATE);
    expect(() => commitDistanceMeasurementPoint(active, {
      coordinate: [Number.NaN, 70_000],
      source: 'aim',
    })).toThrow(RangeError);
  });

  it('retains captured points when snapping is toggled', () => {
    const active: DistanceMeasurementState = {
      phase: 'placing-second',
      snapEnabled: true,
      firstPoint: first,
    };
    expect(setDistanceMeasurementSnapEnabled(active, false)).toEqual({
      ...active,
      snapEnabled: false,
    });
  });
});

describe('distance measurement math and formatting', () => {
  it('calculates Euclidean distances directly in metric LUREF coordinates', () => {
    expect(calculateDistanceMeters(first.coordinate, second.coordinate)).toBe(5);
    expect(calculateDistanceMeters(first.coordinate, first.coordinate)).toBe(0);
  });

  it('formats metres with three to four localized decimals', () => {
    expect(formatDistanceMeters(12.3456, 'de-LU')).toBe('12,3456 m');
    expect(formatDistanceMeters(12.3456, 'en')).toBe('12.3456 m');
    expect(formatDistanceMeters(12.3, 'de-LU')).toBe('12,300 m');
    expect(formatLurefCoordinate([80_123.4, 70_456.7894], 'de-LU'))
      .toBe('80123,400 / 70456,789');
  });

  it('rejects invalid coordinates and distances', () => {
    expect(() => calculateDistanceMeters([Number.NaN, 0], [0, 0])).toThrow(RangeError);
    expect(() => formatDistanceMeters(-1, 'de')).toThrow(RangeError);
  });
});
