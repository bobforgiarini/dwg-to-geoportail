import type { DwgRiskLevel } from '../cad/preflightTypes';

export type CadRenderQualityMode = 'auto' | 'sharp' | 'memory';

export interface CadRenderQualityContext {
  /** Physical device pixels available for one CSS pixel. */
  nativePixelRatio?: number;
  /** Whether the current device primarily uses a mobile/coarse-pointer UI. */
  mobile?: boolean;
  /** Browser-reported device memory. Safari commonly leaves this unknown. */
  memoryGiB?: number;
  /** Selected DWG size, used only while the compact preflight is pending. */
  fileSize?: number;
  /** Measured complexity from the compact DWG preflight. */
  risk?: DwgRiskLevel | null;
}

export interface ResolvedCadRenderQuality {
  mode: CadRenderQualityMode;
  pixelRatio: number;
  reason:
    | 'memory-mode'
    | 'sharp-mode'
    | 'constrained-memory'
    | 'high-risk'
    | 'elevated-risk'
    | 'pending-large-file'
    | 'pending-mobile-file'
    | 'balanced';
}

const LARGE_DWG_BYTES = 10 * 1024 * 1024;
const AUTO_MAX_PIXEL_RATIO = 2;
const SHARP_MAX_PIXEL_RATIO = 2.5;
const ELEVATED_PIXEL_RATIO = 1.5;
const MIN_PIXEL_RATIO = 1;
const CONSTRAINED_MEMORY_GIB = 2;

function nativePixelRatio(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.max(MIN_PIXEL_RATIO, value as number)
    : MIN_PIXEL_RATIO;
}

function cappedRatio(native: number, maximum: number): number {
  return Math.min(native, maximum);
}

/**
 * Resolves only the MLightCAD WebGL canvas density. The OpenLayers basemap
 * deliberately has its own independent mobile-memory policy.
 */
export function resolveCadRenderQuality(
  mode: CadRenderQualityMode,
  context: CadRenderQualityContext = {},
): ResolvedCadRenderQuality {
  const native = nativePixelRatio(context.nativePixelRatio);

  if (mode === 'memory') {
    return { mode, pixelRatio: MIN_PIXEL_RATIO, reason: 'memory-mode' };
  }

  if (mode === 'sharp') {
    return {
      mode,
      pixelRatio: cappedRatio(native, SHARP_MAX_PIXEL_RATIO),
      reason: 'sharp-mode',
    };
  }

  if (context.memoryGiB !== undefined && context.memoryGiB <= CONSTRAINED_MEMORY_GIB) {
    return { mode, pixelRatio: MIN_PIXEL_RATIO, reason: 'constrained-memory' };
  }

  if (context.risk === 'high') {
    return { mode, pixelRatio: MIN_PIXEL_RATIO, reason: 'high-risk' };
  }

  if (context.risk === 'elevated') {
    return {
      mode,
      pixelRatio: cappedRatio(native, ELEVATED_PIXEL_RATIO),
      reason: 'elevated-risk',
    };
  }

  // Before preflight, avoid committing a large mobile WebGL allocation that
  // Safari may not be able to reclaim if the drawing later proves expensive.
  // A low-risk report upgrades Auto to DPR 2 immediately afterwards.
  if (context.risk == null && (context.fileSize ?? 0) > LARGE_DWG_BYTES) {
    return { mode, pixelRatio: MIN_PIXEL_RATIO, reason: 'pending-large-file' };
  }

  if (context.risk == null && context.mobile) {
    return {
      mode,
      pixelRatio: cappedRatio(native, ELEVATED_PIXEL_RATIO),
      reason: 'pending-mobile-file',
    };
  }

  return {
    mode,
    pixelRatio: cappedRatio(native, AUTO_MAX_PIXEL_RATIO),
    reason: 'balanced',
  };
}

export function resolveCadPixelRatio(
  mode: CadRenderQualityMode,
  context: CadRenderQualityContext = {},
): number {
  return resolveCadRenderQuality(mode, context).pixelRatio;
}
