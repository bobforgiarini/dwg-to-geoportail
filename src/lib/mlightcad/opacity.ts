export const MLIGHTCAD_OPACITY_PRESETS = {
  map: 0,
  mix: 60,
  cad: 100,
} as const;

export const DEFAULT_MLIGHTCAD_OPACITY = 70;

export function normalizeCadOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MLIGHTCAD_OPACITY;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function opacityToCss(value: number): string {
  return String(normalizeCadOpacity(value) / 100);
}
