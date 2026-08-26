import type { DwgPreflightOptions } from './preflightTypes';

const RECOVERY_KEY = 'dwg-to-geoportail:import-in-progress:v1';

export interface DwgImportRecoveryMarker {
  name: string;
  size: number;
  startedAt: number;
}

let lastStartedAt = 0;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function markDwgImportStarted(file: File): DwgImportRecoveryMarker {
  const marker = {
    name: file.name,
    size: file.size,
    startedAt: Math.max(Date.now(), lastStartedAt + 1),
  } satisfies DwgImportRecoveryMarker;
  lastStartedAt = marker.startedAt;
  try {
    storage()?.setItem(RECOVERY_KEY, JSON.stringify(marker));
  } catch {
    // Private browsing/storage policies must never prevent a local import.
  }
  return marker;
}

export function clearDwgImportMarker(expected?: DwgImportRecoveryMarker | null): void {
  try {
    const target = storage();
    if (!target) return;
    if (expected) {
      const raw = target.getItem(RECOVERY_KEY);
      if (!raw) return;
      const current = JSON.parse(raw) as Partial<DwgImportRecoveryMarker>;
      if (current.name !== expected.name
        || current.size !== expected.size
        || current.startedAt !== expected.startedAt) return;
    }
    target.removeItem(RECOVERY_KEY);
  } catch {
    // Best effort only.
  }
}

export function consumeDwgImportRecoveryMarker(): DwgImportRecoveryMarker | null {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(RECOVERY_KEY);
    target.removeItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DwgImportRecoveryMarker>;
    return typeof parsed.name === 'string'
      && typeof parsed.size === 'number'
      && typeof parsed.startedAt === 'number'
      ? { name: parsed.name, size: parsed.size, startedAt: parsed.startedAt }
      : null;
  } catch {
    target.removeItem(RECOVERY_KEY);
    return null;
  }
}

export function browserPreflightDevice(): NonNullable<DwgPreflightOptions['device']> {
  if (typeof navigator === 'undefined') return { mobile: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = typeof window !== 'undefined'
    && (window.matchMedia?.('(pointer: coarse)').matches
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  return {
    mobile,
    memoryGiB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
  };
}
