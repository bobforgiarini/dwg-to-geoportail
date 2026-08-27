import { describe, expect, it } from 'vitest';
import {
  appearanceForProfile,
  DEFAULT_CAD_APPEARANCE,
  MAP_FILL_OPACITY,
  normalizeFillOpacity,
  ORIGINAL_FILL_OPACITY,
  withFillOpacity,
} from './appearance';

describe('CAD appearance settings', () => {
  it('starts with the unchanged original rendering', () => {
    expect(DEFAULT_CAD_APPEARANCE).toEqual({
      profile: 'original',
      fillOpacity: ORIGINAL_FILL_OPACITY,
    });
  });

  it('uses the agreed map-profile fill opacity', () => {
    expect(appearanceForProfile('map')).toEqual({
      profile: 'map',
      fillOpacity: MAP_FILL_OPACITY,
    });
    expect(appearanceForProfile('original').fillOpacity).toBe(100);
  });

  it('clamps manual fill opacity without mutating the previous settings', () => {
    const previous = appearanceForProfile('map');
    expect(withFillOpacity(previous, 143)).toEqual({ profile: 'map', fillOpacity: 100 });
    expect(previous.fillOpacity).toBe(35);
    expect(normalizeFillOpacity(-5)).toBe(0);
    expect(normalizeFillOpacity(Number.NaN)).toBe(100);
  });
});
