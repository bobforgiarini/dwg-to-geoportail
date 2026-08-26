import { describe, expect, it } from 'vitest';
import { resolveCadPixelRatio, resolveCadRenderQuality } from './renderQuality';

describe('MLightCAD render quality', () => {
  it('always renders memory mode at one device pixel per CSS pixel', () => {
    expect(resolveCadPixelRatio('memory', { nativePixelRatio: 3 })).toBe(1);
    expect(resolveCadPixelRatio('memory', { nativePixelRatio: 1.25 })).toBe(1);
  });

  it('caps sharp mode at the native DPR and 2.5', () => {
    expect(resolveCadPixelRatio('sharp', { nativePixelRatio: 3 })).toBe(2.5);
    expect(resolveCadPixelRatio('sharp', { nativePixelRatio: 2 })).toBe(2);
    expect(resolveCadPixelRatio('sharp', { nativePixelRatio: 1 })).toBe(1);
  });

  it('uses DPR 2 for a capable device after a low-risk preflight', () => {
    expect(resolveCadRenderQuality('auto', {
      nativePixelRatio: 3,
      mobile: true,
      risk: 'low',
    })).toEqual({ mode: 'auto', pixelRatio: 2, reason: 'balanced' });
  });

  it('reduces Auto quality according to measured risk', () => {
    expect(resolveCadPixelRatio('auto', {
      nativePixelRatio: 3,
      risk: 'elevated',
    })).toBe(1.5);
    expect(resolveCadPixelRatio('auto', {
      nativePixelRatio: 3,
      risk: 'high',
    })).toBe(1);
  });

  it('protects truly constrained devices even when preflight risk is low', () => {
    expect(resolveCadRenderQuality('auto', {
      nativePixelRatio: 3,
      memoryGiB: 2,
      risk: 'low',
    }).reason).toBe('constrained-memory');
    expect(resolveCadPixelRatio('auto', {
      nativePixelRatio: 3,
      memoryGiB: 2,
      risk: 'low',
    })).toBe(1);
  });

  it('starts conservatively on mobile and large files until preflight completes', () => {
    expect(resolveCadRenderQuality('auto', {
      nativePixelRatio: 3,
      mobile: true,
      fileSize: 2 * 1024 * 1024,
    })).toMatchObject({ pixelRatio: 1.5, reason: 'pending-mobile-file' });
    expect(resolveCadRenderQuality('auto', {
      nativePixelRatio: 3,
      mobile: true,
      fileSize: 12 * 1024 * 1024,
    })).toMatchObject({ pixelRatio: 1, reason: 'pending-large-file' });
  });

  it('never exceeds a low-DPR display', () => {
    expect(resolveCadPixelRatio('auto', { nativePixelRatio: 1.25, risk: 'low' })).toBe(1.25);
    expect(resolveCadPixelRatio('auto', { nativePixelRatio: Number.NaN, risk: 'low' })).toBe(1);
  });
});
