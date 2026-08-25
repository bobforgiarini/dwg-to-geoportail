import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocationTrackingState } from '../types/models';

const initialState: LocationTrackingState = {
  permission: 'idle', position: null, accuracy: null, follow: 'off', error: null,
};

export function useLocationTracking() {
  const [state, setState] = useState<LocationTrackingState>(initialState);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setState((current) => ({ ...current, follow: 'off' }));
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((current) => ({ ...current, permission: 'unavailable', error: 'unavailable', follow: 'off' }));
      return;
    }
    if (watchId.current !== null) {
      setState((current) => ({ ...current, follow: 'following' }));
      return;
    }
    setState((current) => ({ ...current, permission: 'prompt', follow: 'following', error: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (position) => setState((current) => ({
        permission: 'granted',
        position,
        accuracy: position.coords.accuracy,
        // A fresh GPS fix must not undo a pause caused by manual map movement.
        follow: current.follow,
        error: null,
      })),
      (error) => {
        watchId.current = null;
        setState((current) => ({
          ...current,
          permission: error.code === error.PERMISSION_DENIED ? 'denied' : current.permission,
          follow: 'off',
          error: error.code === error.PERMISSION_DENIED ? 'denied' : 'error',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);

  const pause = useCallback(() => {
    setState((current) => current.follow === 'following' ? { ...current, follow: 'paused' } : current);
  }, []);
  const resume = useCallback(() => setState((current) => ({ ...current, follow: 'following' })), []);

  useEffect(() => stop, [stop]);
  return { state, start, stop, pause, resume };
}
