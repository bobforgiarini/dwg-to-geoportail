export type CadAppearanceProfile = 'original' | 'map';

export interface CadAppearanceSettings {
  profile: CadAppearanceProfile;
  fillOpacity: number;
}

export const ORIGINAL_FILL_OPACITY = 100;
export const MAP_FILL_OPACITY = 35;

export const DEFAULT_CAD_APPEARANCE: CadAppearanceSettings = {
  profile: 'original',
  fillOpacity: ORIGINAL_FILL_OPACITY,
};

export function normalizeFillOpacity(value: number): number {
  if (!Number.isFinite(value)) return ORIGINAL_FILL_OPACITY;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function appearanceForProfile(profile: CadAppearanceProfile): CadAppearanceSettings {
  return {
    profile,
    fillOpacity: profile === 'map' ? MAP_FILL_OPACITY : ORIGINAL_FILL_OPACITY,
  };
}

export function withFillOpacity(
  settings: CadAppearanceSettings,
  fillOpacity: number,
): CadAppearanceSettings {
  return { ...settings, fillOpacity: normalizeFillOpacity(fillOpacity) };
}
