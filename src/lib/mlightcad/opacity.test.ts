import { describe, expect, it } from 'vitest';
import { DEFAULT_MLIGHTCAD_OPACITY, MLIGHTCAD_OPACITY_PRESETS, normalizeCadOpacity, opacityToCss } from './opacity';

describe('MLightCAD opacity', () => {
  it('provides the requested map, mix and CAD presets', () => {
    expect(MLIGHTCAD_OPACITY_PRESETS).toEqual({ map: 0, mix: 60, cad: 100 });
    expect(DEFAULT_MLIGHTCAD_OPACITY).toBe(70);
  });

  it('clamps slider values and converts them to CSS opacity', () => {
    expect(normalizeCadOpacity(-12)).toBe(0);
    expect(normalizeCadOpacity(60.4)).toBe(60);
    expect(normalizeCadOpacity(130)).toBe(100);
    expect(opacityToCss(70)).toBe('0.7');
  });
});
