import { describe, expect, it, vi } from 'vitest';
import {
  bindBasemapSourceHealth,
  createBasemapLayer,
  createCadastreWmtsSources,
  createWmsSource,
  createWmtsProbeUrl,
  createWmtsSource,
  WMS_URL,
  WMTS_URL,
} from './geoportail';

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
    expect(WMS_URL).toBe(WMTS_URL);
    expect(source.getParams().LAYERS).toBe('ortho_latest');
    expect(source.getParams().VERSION).toBe('1.3.0');
  });

  it('configures the official transparent cadastral parcel and number overlays', () => {
    const sources = createCadastreWmtsSources();
    expect(sources.map((source) => source.getLayer())).toEqual(['parcels', 'parcels_labels']);
    sources.forEach((source) => {
      expect(source.getUrls()).toContain(WMTS_URL);
      expect(source.getFormat()).toBe('image/png');
      expect(source.getMatrixSet()).toBe('GLOBAL_WEBMERCATOR_4_V3');
    });
  });

  it('accepts a bounded layer tile cache for mobile maps', () => {
    const layer = createBasemapLayer('wmts', { cacheSize: 32 });
    const cacheAwareLayer = layer as unknown as { getCacheSize: () => number | undefined };
    expect(cacheAwareLayer.getCacheSize()).toBe(32);
  });

  it('probes a cache-busted Luxembourg WMTS tile', () => {
    const url = new URL(createWmtsProbeUrl(42));
    expect(url.origin + url.pathname).toBe(WMTS_URL);
    expect(url.searchParams.get('LAYER')).toBe('ortho_2025');
    expect(url.searchParams.get('TILEMATRIXSET')).toBe('GLOBAL_WEBMERCATOR_4_V3');
    expect(url.searchParams.get('TILEROW')).toBe('2792');
    expect(url.searchParams.get('TILECOL')).toBe('4235');
    expect(url.searchParams.get('_')).toBe('42');
  });

  it('forwards tile events with their source generation and unbinds them', () => {
    const source = createWmtsSource();
    const reporter = {
      sourceMounted: vi.fn(),
      tileLoadStart: vi.fn(),
      tileLoadEnd: vi.fn(),
      tileLoadError: vi.fn(),
    };
    const unbind = bindBasemapSourceHealth(source, 7, reporter);

    source.dispatchEvent('tileloadstart');
    source.dispatchEvent('tileloadend');
    source.dispatchEvent('tileloaderror');
    expect(reporter.tileLoadStart).toHaveBeenCalledWith(7);
    expect(reporter.tileLoadEnd).toHaveBeenCalledWith(7);
    expect(reporter.tileLoadError).toHaveBeenCalledWith(7);

    unbind();
    source.dispatchEvent('tileloaderror');
    expect(reporter.tileLoadError).toHaveBeenCalledTimes(1);
  });
});
