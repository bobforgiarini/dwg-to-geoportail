import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapHealthController } from './basemapHealth';

describe('BasemapHealthController', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries WMTS after three errors and then switches to WMS', () => {
    const controller = new BasemapHealthController();
    controller.sourceMounted(0);

    controller.tileLoadError(0);
    controller.tileLoadError(0);
    expect(controller.getSnapshot().status).toBe('loading');

    controller.tileLoadError(0);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wmts', status: 'retrying', generation: 0, transitionReason: 'wmts-tile-errors',
    });

    vi.advanceTimersByTime(750);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wmts', status: 'retrying', generation: 1, transitionReason: 'wmts-retry',
    });

    // Late events from the replaced source must not affect the retry.
    controller.tileLoadEnd(0);
    expect(controller.getSnapshot().status).toBe('retrying');

    controller.sourceMounted(1);
    controller.tileLoadError(1);
    controller.tileLoadError(1);
    controller.tileLoadError(1);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wms', status: 'loading', generation: 2, transitionReason: 'wmts-tile-errors',
    });
    controller.dispose();
  });

  it('falls back after a WMTS stall and marks a stalled WMS unavailable', () => {
    const controller = new BasemapHealthController();
    controller.sourceMounted(0);

    vi.advanceTimersByTime(8_000);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wms', status: 'loading', generation: 1, transitionReason: 'wmts-stall',
    });

    controller.sourceMounted(1);
    vi.advanceTimersByTime(10_000);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wms', status: 'unavailable', transitionReason: 'wms-stall',
    });
    controller.dispose();
  });

  it('keeps the stall watchdog active while only part of a tile batch completed', () => {
    const controller = new BasemapHealthController();
    controller.sourceMounted(0);
    controller.tileLoadStart(0);
    controller.tileLoadStart(0);
    controller.tileLoadEnd(0);

    expect(controller.getSnapshot().status).toBe('ready');
    vi.advanceTimersByTime(8_000);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wms', status: 'loading', transitionReason: 'wmts-stall',
    });
    controller.dispose();
  });

  it('does not notify React again for every tile after the source is already ready', () => {
    const controller = new BasemapHealthController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.sourceMounted(0);
    controller.tileLoadStart(0);
    controller.tileLoadEnd(0);
    expect(listener).toHaveBeenCalledTimes(2);

    controller.tileLoadStart(0);
    controller.tileLoadEnd(0);
    controller.tileLoadStart(0);
    controller.tileLoadEnd(0);

    expect(listener).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('tries WMS only once when the fallback source repeatedly fails', () => {
    const controller = new BasemapHealthController();
    controller.sourceMounted(0);
    vi.advanceTimersByTime(8_000);
    controller.sourceMounted(1);

    controller.tileLoadError(1);
    controller.tileLoadError(1);
    controller.tileLoadError(1);

    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wms', status: 'unavailable', generation: 1, transitionReason: 'wms-tile-errors',
    });
    vi.advanceTimersByTime(10_000);
    expect(controller.getSnapshot().generation).toBe(1);
    controller.dispose();
  });

  it('returns to WMTS only after two successful recovery probes', async () => {
    const probeWmts = vi.fn().mockResolvedValue(true);
    const controller = new BasemapHealthController({ probeWmts });
    controller.sourceMounted(0);
    vi.advanceTimersByTime(8_000);
    controller.sourceMounted(1);
    controller.tileLoadEnd(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probeWmts).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ mode: 'wms', status: 'ready' });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probeWmts).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wmts', status: 'loading', generation: 2, transitionReason: 'wmts-recovered',
    });
    controller.dispose();
  });

  it('does not postpone the WMTS recovery probe when more WMS tiles finish', async () => {
    const probeWmts = vi.fn().mockResolvedValue(true);
    const controller = new BasemapHealthController({ probeWmts });
    controller.sourceMounted(0);
    vi.advanceTimersByTime(8_000);
    controller.sourceMounted(1);
    controller.tileLoadEnd(1);

    await vi.advanceTimersByTimeAsync(30_000);
    controller.tileLoadEnd(1);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(probeWmts).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ mode: 'wms', status: 'ready' });
    controller.dispose();
  });

  it('keeps probing WMTS while the WMS fallback is unavailable', async () => {
    const probeWmts = vi.fn().mockResolvedValue(true);
    const controller = new BasemapHealthController({ probeWmts });
    controller.sourceMounted(0);
    vi.advanceTimersByTime(8_000);
    controller.sourceMounted(1);
    controller.tileLoadError(1);
    controller.tileLoadError(1);
    controller.tileLoadError(1);

    expect(controller.getSnapshot()).toMatchObject({ mode: 'wms', status: 'unavailable' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probeWmts).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ mode: 'wms', status: 'unavailable' });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probeWmts).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wmts', status: 'loading', generation: 2, transitionReason: 'wmts-recovered',
    });
    controller.dispose();
  });

  it('pauses while hidden or offline and starts a fresh WMTS source on reconnect', () => {
    const controller = new BasemapHealthController();
    controller.sourceMounted(0);
    controller.setActive(false);
    vi.advanceTimersByTime(20_000);
    expect(controller.getSnapshot()).toMatchObject({ mode: 'wmts', generation: 0 });

    controller.setActive(true);
    expect(controller.getSnapshot()).toMatchObject({ status: 'loading', generation: 1 });
    controller.setOnline(false);
    expect(controller.getSnapshot().status).toBe('offline');
    vi.advanceTimersByTime(20_000);
    expect(controller.getSnapshot().status).toBe('offline');

    controller.setOnline(true);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'wmts', status: 'loading', generation: 2, transitionReason: 'online',
    });
    controller.dispose();
  });
});
