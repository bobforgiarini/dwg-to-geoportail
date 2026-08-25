import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocationTracking } from './useLocationTracking';

describe('useLocationTracking', () => {
  let sendPosition: PositionCallback;
  const clearWatch = vi.fn();

  beforeEach(() => {
    clearWatch.mockClear();
    const watchPosition = vi.fn((success: PositionCallback) => {
      sendPosition = success;
      return 42;
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps follow paused when a later GPS fix arrives', () => {
    const { result, unmount } = renderHook(() => useLocationTracking());

    act(() => result.current.start());
    act(() => result.current.pause());
    expect(result.current.state.follow).toBe('paused');

    act(() => sendPosition({
      coords: {
        accuracy: 4.5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 49.61,
        longitude: 6.13,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 1,
      toJSON: () => ({}),
    }));

    expect(result.current.state.follow).toBe('paused');
    expect(result.current.state.accuracy).toBe(4.5);
    expect(result.current.state.permission).toBe('granted');

    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it('does not restart follow when an already-cleared watch delivers a late fix', () => {
    const { result } = renderHook(() => useLocationTracking());

    act(() => result.current.start());
    act(() => result.current.stop());
    act(() => sendPosition({
      coords: {
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 49.61,
        longitude: 6.13,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 2,
      toJSON: () => ({}),
    }));

    expect(result.current.state.follow).toBe('off');
  });
});
