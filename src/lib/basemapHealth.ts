import type { BasemapMode } from '../types/models';

export type BasemapHealthStatus = 'loading' | 'ready' | 'retrying' | 'offline' | 'unavailable';

export type BasemapTransitionReason =
  | 'initial'
  | 'source-mounted'
  | 'tile-loaded'
  | 'wmts-tile-errors'
  | 'wms-tile-errors'
  | 'wmts-retry'
  | 'wms-retry'
  | 'wmts-stall'
  | 'wms-stall'
  | 'wmts-recovered'
  | 'offline'
  | 'online'
  | 'visible'
  | 'unavailable';

export interface BasemapHealthState {
  mode: BasemapMode;
  status: BasemapHealthStatus;
  /** Increments whenever the OpenLayers source must be replaced. */
  generation: number;
  transitionReason: BasemapTransitionReason;
}

export interface BasemapHealthReporter {
  sourceMounted: (generation: number) => void;
  tileLoadStart: (generation: number) => void;
  tileLoadEnd: (generation: number) => void;
  tileLoadError: (generation: number) => void;
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export interface BasemapHealthControllerOptions {
  initialActive?: boolean;
  initialOnline?: boolean;
  retryDelayMs?: number;
  wmtsStallMs?: number;
  wmsStallMs?: number;
  recoveryProbeDelayMs?: number;
  probeWmts?: () => Promise<boolean>;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_WMTS_STALL_MS = 8_000;
const DEFAULT_WMS_STALL_MS = 10_000;
const DEFAULT_RECOVERY_PROBE_DELAY_MS = 60_000;
const MAX_CONSECUTIVE_TILE_ERRORS = 3;

/**
 * Owns Geoportail retry/fallback state independently from an OpenLayers map.
 * This allows the same state machine to survive a switch between CAD viewers.
 */
export class BasemapHealthController {
  private state: BasemapHealthState;
  private readonly listeners = new Set<() => void>();
  private readonly retryDelayMs: number;
  private readonly wmtsStallMs: number;
  private readonly wmsStallMs: number;
  private readonly recoveryProbeDelayMs: number;
  private readonly probeWmts: () => Promise<boolean>;
  private readonly setTimer: (callback: () => void, delay: number) => TimerHandle;
  private readonly clearTimer: (timer: TimerHandle) => void;
  private active: boolean;
  private online: boolean;
  private disposed = false;
  private consecutiveErrors = 0;
  private retryUsed: Record<BasemapMode, boolean> = { wmts: false, wms: false };
  private recoveryProbeSuccesses = 0;
  private inFlightTiles = 0;
  private hasSuccessfulTile = false;
  private asyncToken = 0;
  private stallTimer: TimerHandle | null = null;
  private retryTimer: TimerHandle | null = null;
  private recoveryProbeTimer: TimerHandle | null = null;

  constructor(options: BasemapHealthControllerOptions = {}) {
    this.active = options.initialActive ?? true;
    this.online = options.initialOnline ?? true;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.wmtsStallMs = options.wmtsStallMs ?? DEFAULT_WMTS_STALL_MS;
    this.wmsStallMs = options.wmsStallMs ?? DEFAULT_WMS_STALL_MS;
    this.recoveryProbeDelayMs = options.recoveryProbeDelayMs ?? DEFAULT_RECOVERY_PROBE_DELAY_MS;
    this.probeWmts = options.probeWmts ?? (async () => false);
    this.setTimer = options.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.state = {
      mode: 'wmts',
      status: this.online ? 'loading' : 'offline',
      generation: 0,
      transitionReason: this.online ? 'initial' : 'offline',
    };
  }

  getSnapshot = (): BasemapHealthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  createReporter(): BasemapHealthReporter {
    return {
      sourceMounted: (generation) => this.sourceMounted(generation),
      tileLoadStart: (generation) => this.tileLoadStart(generation),
      tileLoadEnd: (generation) => this.tileLoadEnd(generation),
      tileLoadError: (generation) => this.tileLoadError(generation),
    };
  }

  setOnline(online: boolean): void {
    if (this.disposed || this.online === online) return;
    this.online = online;
    if (!online) {
      this.clearOperationTimers();
      this.update({ status: 'offline', transitionReason: 'offline' });
      return;
    }
    if (this.active) this.startGeneration('wmts', 'loading', 'online', true);
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (!active) {
      this.clearOperationTimers();
      return;
    }
    if (!this.online) {
      this.update({ status: 'offline', transitionReason: 'offline' });
      return;
    }
    this.startGeneration(this.state.mode, 'loading', 'visible', false);
  }

  sourceMounted(generation: number): void {
    if (!this.accepts(generation) || this.state.status === 'unavailable') return;
    if (this.state.status !== 'retrying') {
      this.update({ status: 'loading', transitionReason: 'source-mounted' });
    }
    this.scheduleStall(generation);
  }

  tileLoadStart(generation: number): void {
    if (!this.accepts(generation) || this.state.status === 'unavailable') return;
    this.inFlightTiles += 1;
    if (!this.stallTimer) this.scheduleStall(generation);
  }

  tileLoadEnd(generation: number): void {
    if (!this.accepts(generation) || this.state.status === 'unavailable') return;
    this.inFlightTiles = Math.max(0, this.inFlightTiles - 1);
    this.hasSuccessfulTile = true;
    if (this.inFlightTiles === 0) this.clearStallTimer();
    this.clearRetryTimer();
    this.consecutiveErrors = 0;
    this.retryUsed[this.state.mode] = false;
    this.update({ status: 'ready', transitionReason: 'tile-loaded' });
    if (this.state.mode === 'wms') this.scheduleRecoveryProbe();
    else this.clearRecoveryProbe();
  }

  tileLoadError(generation: number): void {
    if (!this.accepts(generation) || this.state.status === 'unavailable' || this.retryTimer) return;
    this.inFlightTiles = Math.max(0, this.inFlightTiles - 1);
    this.consecutiveErrors += 1;
    if (this.consecutiveErrors < MAX_CONSECUTIVE_TILE_ERRORS) {
      if (this.inFlightTiles === 0 && this.hasSuccessfulTile) this.clearStallTimer();
      return;
    }
    this.clearStallTimer();
    const mode = this.state.mode;
    // The fallback itself is the single WMS attempt. Recreating another WMS
    // source after repeated tile failures would only duplicate requests while
    // Geoportail is unavailable.
    if (mode === 'wms') {
      this.markUnavailable('wms-tile-errors');
      return;
    }
    if (!this.retryUsed[mode]) {
      this.retryUsed[mode] = true;
      this.update({
        status: 'retrying',
        transitionReason: mode === 'wmts' ? 'wmts-tile-errors' : 'wms-tile-errors',
      });
      const generationAtFailure = this.state.generation;
      this.retryTimer = this.setTimer(() => {
        this.retryTimer = null;
        if (!this.accepts(generationAtFailure)) return;
        this.startGeneration(
          mode,
          'retrying',
          mode === 'wmts' ? 'wmts-retry' : 'wms-retry',
          false,
        );
      }, this.retryDelayMs);
      return;
    }
    this.switchToWms('wmts-tile-errors');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearOperationTimers();
    this.listeners.clear();
  }

  private accepts(generation: number): boolean {
    return !this.disposed
      && this.active
      && this.online
      && generation === this.state.generation;
  }

  private scheduleStall(generation: number): void {
    this.clearStallTimer();
    const delay = this.state.mode === 'wmts' ? this.wmtsStallMs : this.wmsStallMs;
    this.stallTimer = this.setTimer(() => {
      this.stallTimer = null;
      if (!this.accepts(generation)) return;
      if (this.state.mode === 'wmts') this.switchToWms('wmts-stall');
      else this.markUnavailable('wms-stall');
    }, delay);
  }

  private switchToWms(reason: 'wmts-stall' | 'wmts-tile-errors'): void {
    this.retryUsed.wms = false;
    this.recoveryProbeSuccesses = 0;
    this.startGeneration('wms', 'loading', reason, false);
  }

  private markUnavailable(reason: 'wms-stall' | 'wms-tile-errors' | 'unavailable'): void {
    this.clearOperationTimers();
    this.update({ status: 'unavailable', transitionReason: reason });
  }

  private startGeneration(
    mode: BasemapMode,
    status: 'loading' | 'retrying',
    transitionReason: BasemapTransitionReason,
    resetRetries: boolean,
  ): void {
    this.clearOperationTimers();
    this.consecutiveErrors = 0;
    this.inFlightTiles = 0;
    this.hasSuccessfulTile = false;
    if (resetRetries) this.retryUsed = { wmts: false, wms: false };
    this.update({
      mode,
      status,
      generation: this.state.generation + 1,
      transitionReason,
    });
  }

  private scheduleRecoveryProbe(): void {
    this.clearRecoveryProbe();
    const generation = this.state.generation;
    const token = this.asyncToken;
    this.recoveryProbeTimer = this.setTimer(() => {
      this.recoveryProbeTimer = null;
      void this.runRecoveryProbe(generation, token);
    }, this.recoveryProbeDelayMs);
  }

  private async runRecoveryProbe(generation: number, token: number): Promise<void> {
    let available = false;
    try {
      available = await this.probeWmts();
    } catch {
      available = false;
    }
    if (this.asyncToken !== token || !this.accepts(generation) || this.state.mode !== 'wms') return;
    this.recoveryProbeSuccesses = available ? this.recoveryProbeSuccesses + 1 : 0;
    if (this.recoveryProbeSuccesses >= 2) {
      this.retryUsed.wmts = false;
      this.startGeneration('wmts', 'loading', 'wmts-recovered', false);
      return;
    }
    this.scheduleRecoveryProbe();
  }

  private clearOperationTimers(): void {
    this.clearStallTimer();
    this.clearRetryTimer();
    this.clearRecoveryProbe();
  }

  private clearStallTimer(): void {
    if (!this.stallTimer) return;
    this.clearTimer(this.stallTimer);
    this.stallTimer = null;
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  private clearRecoveryProbe(): void {
    this.asyncToken += 1;
    if (!this.recoveryProbeTimer) return;
    this.clearTimer(this.recoveryProbeTimer);
    this.recoveryProbeTimer = null;
  }

  private update(patch: Partial<BasemapHealthState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
