import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserPreflightDevice,
  clearDwgImportMarker,
  consumeDwgImportRecoveryMarker,
  markDwgImportStarted,
} from './importRecovery';

describe('DWG import recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stores only metadata and consumes the marker once', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const marker = markDwgImportStarted(new File(['dwg'], 'local.dwg'));
    expect(consumeDwgImportRecoveryMarker()).toEqual(marker);
    expect(consumeDwgImportRecoveryMarker()).toBeNull();
  });

  it('can clear a completed import', () => {
    const marker = markDwgImportStarted(new File(['dwg'], 'done.dwg'));
    clearDwgImportMarker(marker);
    expect(consumeDwgImportRecoveryMarker()).toBeNull();
  });

  it('does not let an older import clear a newer recovery marker', () => {
    const older = markDwgImportStarted(new File(['old'], 'old.dwg'));
    const newer = markDwgImportStarted(new File(['new'], 'new.dwg'));

    clearDwgImportMarker(older);

    expect(consumeDwgImportRecoveryMarker()).toEqual(newer);
  });

  it('returns browser capability hints without making them a hard gate', () => {
    const result = browserPreflightDevice();
    expect(typeof result.mobile).toBe('boolean');
  });
});
