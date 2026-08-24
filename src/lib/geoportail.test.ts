import { describe, expect, it } from 'vitest';
import { createWmsSource, createWmtsSource, WMS_URL, WMTS_URL } from './geoportail';

describe('Geoportail sources', () => {
  it('configures the requested 2025 WMTS orthophoto', () => {
    const source = createWmtsSource();
    expect(source.getUrls()).toContain(WMTS_URL);
    expect(source.getLayer()).toBe('ortho_2025');
    expect(source.getMatrixSet()).toBe('GLOBAL_WEBMERCATOR_4_V3');
  });

  it('provides ortho_latest as WMS fallback', () => {
    const source = createWmsSource();
    expect(source.getUrls()).toContain(WMS_URL);
    expect(source.getParams().LAYERS).toBe('ortho_latest');
  });
});
