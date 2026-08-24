import { describe, expect, it } from 'vitest';
import { toLonLat } from 'ol/proj';
import { lurefToMap, mapToLuref } from './crs';

describe('LUREF projection', () => {
  it('round-trips a known Luxembourg LUREF point', () => {
    const luref: [number, number] = [80_000, 100_000];
    const roundTrip = mapToLuref(lurefToMap(luref));
    expect(Math.abs(roundTrip[0] - luref[0])).toBeLessThan(0.002);
    expect(Math.abs(roundTrip[1] - luref[1])).toBeLessThan(0.002);
  });

  it('places the LUREF origin near Luxembourg', () => {
    const [longitude, latitude] = toLonLat(lurefToMap([80_000, 100_000]));
    expect(longitude).toBeGreaterThan(6.1);
    expect(longitude).toBeLessThan(6.2);
    expect(latitude).toBeGreaterThan(49.8);
    expect(latitude).toBeLessThan(49.9);
  });
});
