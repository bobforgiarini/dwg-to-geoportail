import {
  AcApDocManager,
  AcApOpenViewMode,
  AcEdOpenMode,
  AcEdViewMode,
  LIBREDWG_PARSER_WORKER_FILE,
  MTEXT_RENDERER_WORKER_FILE,
  type AcTrView2d,
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbDatabaseConverterManager,
  AcDbFileType,
  acdbHostApplicationServices,
  type AcDbEntity,
  type AcDbProgressdEventArgs,
} from '@mlightcad/data-model';
import type { CadOverlayLayer, SelectedCadObject } from '../../types/models';
import { readCadCamera } from './cameraBridge';
import { CancellableLibreDwgConverter } from './CancellableLibreDwgConverter';
import { normalizeCadOpacity, opacityToCss } from './opacity';
import { AdapterEvent, type MlightCadAdapterEvents } from './types';

const WORKER_ROOT = '/mlightcad-workers';
const DWG_WORKER_URL = `${WORKER_ROOT}/${LIBREDWG_PARSER_WORKER_FILE}`;
const MTEXT_WORKER_URL = `${WORKER_ROOT}/${MTEXT_RENDERER_WORKER_FILE}`;
const CAD_DATA_CDN = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/';
const PARSER_TIMEOUT_MS = 120_000;
const LARGE_DWG_BYTES = 10 * 1024 * 1024;
const DEFAULT_MINIMUM_CHUNK_SIZE = 1_000;
const LOW_MEMORY_MINIMUM_CHUNK_SIZE = 100;
const MOBILE_SELECTION_RADIUS_PX = 12;
const TAP_MOVE_TOLERANCE_PX = 10;
const MOBILE_TOUCH_ZOOM_SPEED = 2.25;
const FIT_CAMERA_SYNC_DELAY_MS = 350;

const TEXT_ENTITY_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF']);

let disposalBarrier: Promise<void> = Promise.resolve();

type ListenerCleanup = () => void;

interface RenderedSceneNode {
  visible: boolean;
  children?: RenderedSceneNode[];
  userData?: { textEntityTraits?: unknown };
}

interface TextAwareBatchedGroup {
  _unbatchedEntities?: Map<string, RenderedSceneNode[]>;
}

interface TouchCameraControls {
  zoomSpeed: number;
}

interface TouchLayoutView {
  _cameraControls?: TouchCameraControls;
}

function bindCadEvent<T>(
  event: { addEventListener: (listener: (value: T) => void) => void; removeEventListener: (listener: (value: T) => void) => void },
  listener: (value: T) => void,
): ListenerCleanup {
  event.addEventListener(listener);
  return () => event.removeEventListener(listener);
}

function isCadEntity(value: unknown): value is AcDbEntity {
  return Boolean(value && typeof value === 'object' && 'dxfTypeName' in value && 'layer' in value);
}

function runCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Cleanup is deliberately best-effort so one upstream disposal failure
    // cannot retain the remaining document, worker, DOM or WebGL resources.
  }
}

function renderedTextNodes(root: RenderedSceneNode): RenderedSceneNode[] {
  const result: RenderedSceneNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.userData?.textEntityTraits !== undefined) {
      result.push(node);
      // The traits-bearing root owns the complete glyph hierarchy.
      continue;
    }
    if (node.children) pending.push(...node.children);
  }
  return result;
}

export class MlightCadViewerAdapter {
  readonly events = {
    progress: new AdapterEvent<MlightCadAdapterEvents['progress']>(),
    camera: new AdapterEvent<MlightCadAdapterEvents['camera']>(),
    layers: new AdapterEvent<MlightCadAdapterEvents['layers']>(),
    selection: new AdapterEvent<MlightCadAdapterEvents['selection']>(),
    ready: new AdapterEvent<MlightCadAdapterEvents['ready']>(),
    error: new AdapterEvent<MlightCadAdapterEvents['error']>(),
  };

  private manager: AcApDocManager | null = null;
  private view: AcTrView2d | null = null;
  private converter: CancellableLibreDwgConverter | null = null;
  private readonly cleanupListeners: ListenerCleanup[] = [];
  private layers: CadOverlayLayer[] = [];
  private readonly hiddenObjectIds = new Set<string>();
  private readonly textObjectIds = new Set<string>();
  private readonly textSceneObjects = new Map<string, Set<RenderedSceneNode>>();
  private readonly cameraSyncTimers = new Set<ReturnType<typeof setTimeout>>();
  private textVisible = true;
  private opacity = 100;
  private generation = 0;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(private readonly container: HTMLElement) {
    // Opacity belongs to the CAD canvas, never to the host that is composited
    // with OpenLayers.
    this.container.style.removeProperty('opacity');
  }

  get hiddenObjectCount(): number {
    return this.hiddenObjectIds.size;
  }

  get currentLayers(): CadOverlayLayer[] {
    return this.layers.map((layer) => ({ ...layer }));
  }

  async load(file: File): Promise<void> {
    const generation = ++this.generation;
    const lowMemory = file.size > LARGE_DWG_BYTES;
    try {
      await disposalBarrier;
      if (this.disposed || generation !== this.generation) return;

      this.events.progress.dispatch({ phase: 'workers', percentage: null });
      const workersReady = await AcApDocManager.checkWebworkerReadiness({
        dwgParser: DWG_WORKER_URL,
        mtextRender: MTEXT_WORKER_URL,
      });
      if (!workersReady) throw new Error('MLIGHTCAD_WORKERS_UNAVAILABLE');
      if (this.disposed || generation !== this.generation) return;

      const converter = new CancellableLibreDwgConverter({
        convertByEntityType: false,
        parserWorkerUrl: DWG_WORKER_URL,
        timeout: PARSER_TIMEOUT_MS,
        useWorker: true,
      });
      this.converter = converter;
      AcDbDatabaseConverterManager.instance.register(AcDbFileType.DWG, converter);

      AcApDocManager.createInstance({
        autoResize: true,
        baseUrl: CAD_DATA_CDN,
        builtinOpenFileDialog: false,
        busyIndicatorHost: this.container,
        container: this.container,
        useMainThreadDraw: true,
        webworkerFileUrls: {
          dwgParser: DWG_WORKER_URL,
          mtextRender: MTEXT_WORKER_URL,
        },
      });

      const manager = AcApDocManager.instance;
      const view = manager.curView;
      this.manager = manager;
      this.view = view;
      this.configureLowMemoryRenderer(view, lowMemory);
      this.configureTransparentRenderer(view);
      this.hideEmbeddedCommandLine();
      this.bindCamera(view);
      this.bindSelection(view);
      this.bindWebglContextLoss(view);

      const progressDatabase = manager.curDocument.database;
      const progressListener = (event: AcDbProgressdEventArgs) => {
        const percentage = Number.isFinite(event.percentage) ? Math.round(event.percentage) : null;
        const stage = String(event.stage ?? '').toLowerCase();
        this.events.progress.dispatch({
          phase: stage.includes('parse') ? 'parse' : 'render',
          percentage,
          detail: event.subStage ?? event.stage,
        });
      };
      this.cleanupListeners.push(bindCadEvent(progressDatabase.events.openProgress, progressListener));

      this.events.progress.dispatch({ phase: 'read', percentage: null });
      const content = await file.arrayBuffer();
      if (this.disposed || generation !== this.generation) return;

      const opened = await manager.openDocument(file.name, content, {
        drawNoPlotLayers: true,
        minimumChunkSize: lowMemory ? LOW_MEMORY_MINIMUM_CHUNK_SIZE : DEFAULT_MINIMUM_CHUNK_SIZE,
        mode: AcEdOpenMode.Read,
        openViewMode: AcApOpenViewMode.Extents,
        progressiveRendering: true,
        timeout: PARSER_TIMEOUT_MS,
      });
      if (!opened) throw new Error('MLIGHTCAD_OPEN_FAILED');
      if (this.disposed || generation !== this.generation) return;
      // Document sysvars apply their background during open.
      this.configureTransparentRenderer(view);

      const database = manager.curDocument.database;
      acdbHostApplicationServices().layoutManager.setCurrentLayoutBtrId(
        database.tables.blockTable.modelSpace.objectId,
        database,
      );
      manager.setActiveLayout(view, database);
      // Layout activation applies its own background a second time.
      this.configureTransparentRenderer(view);
      this.configureTouchNavigation(view);
      this.bindResizeSync(view);
      this.events.progress.dispatch({ phase: 'render', percentage: null, detail: 'finalizing' });
      const idle = await view.waitUntilIdle(PARSER_TIMEOUT_MS);
      if (!idle) throw new Error('MLIGHTCAD_RENDER_TIMEOUT');
      if (this.disposed || generation !== this.generation) return;
      // Deferred text and hatch geometry can finish after document open.
      this.configureTransparentRenderer(view);

      this.bindDocument(manager);
      view.zoomToFitDrawing(PARSER_TIMEOUT_MS, view.modelSpaceBtrId);
      // zoomToFitDrawing uses an internal 300 ms condition waiter even when
      // the view is already idle. Wait for that final fit before publishing
      // the camera and ready state.
      await new Promise((resolve) => setTimeout(resolve, FIT_CAMERA_SYNC_DELAY_MS));
      if (this.disposed || generation !== this.generation) return;
      this.configureTransparentRenderer(view);
      this.emitCamera();
      this.events.progress.dispatch({ phase: 'ready', percentage: 100 });
      const entityCount = this.layers.reduce((sum, layer) => sum + layer.featureCount, 0);
      this.events.ready.dispatch({ layers: this.currentLayers, entityCount });
    } catch (error) {
      const cancelled = this.disposed || generation !== this.generation;
      await this.dispose();
      if (cancelled) return;
      throw error;
    }
  }

  cancel(): Promise<void> {
    this.generation += 1;
    this.converter?.cancel();
    return this.dispose();
  }

  fitDrawing(): void {
    if (!this.view) return;
    this.view.zoomToFitDrawing(PARSER_TIMEOUT_MS, this.view.modelSpaceBtrId);
    this.scheduleCameraSync(FIT_CAMERA_SYNC_DELAY_MS, this.view);
  }

  centerOn(center: [number, number]): void {
    if (!this.view) return;
    this.view.flyTo({ x: center[0], y: center[1] }, this.view.internalCamera.zoom);
    this.emitCamera();
  }

  setOpacity(value: number): void {
    this.opacity = normalizeCadOpacity(value);
    this.container.style.removeProperty('opacity');
    if (this.view) this.view.renderer.domElement.style.opacity = opacityToCss(this.opacity);
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    if (!this.view) return;
    this.view.cadScene.forEachSceneLayer(layerId, (layer) => { layer.visible = visible; });
    this.view.isDirty = true;
    this.layers = this.layers.map((layer) => layer.id === layerId ? { ...layer, visible } : layer);
    this.events.layers.dispatch(this.currentLayers);
  }

  setAllLayersVisible(visible: boolean): void {
    for (const layer of this.layers) {
      this.view?.cadScene.forEachSceneLayer(layer.id, (sceneLayer) => { sceneLayer.visible = visible; });
    }
    if (this.view) this.view.isDirty = true;
    this.layers = this.layers.map((layer) => ({ ...layer, visible }));
    this.events.layers.dispatch(this.currentLayers);
  }

  hideObject(objectId: string): void {
    this.hiddenObjectIds.add(objectId);
    this.applyObjectVisibility(objectId);
    this.applyRenderedTextVisibility(objectId);
    this.view?.selectionSet.clear();
    this.events.selection.dispatch(null);
  }

  clearSelection(): void {
    this.view?.selectionSet.clear();
  }

  restoreHiddenObjects(): void {
    const hidden = [...this.hiddenObjectIds];
    this.hiddenObjectIds.clear();
    for (const objectId of hidden) {
      this.applyObjectVisibility(objectId);
      this.applyRenderedTextVisibility(objectId);
    }
  }

  setTextsVisible(visible: boolean): void {
    this.textVisible = visible;
    for (const objectId of this.textObjectIds) this.applyObjectVisibility(objectId);
    for (const objectId of this.textSceneObjects.keys()) this.applyRenderedTextVisibility(objectId);
    if (this.view) this.view.isDirty = true;
  }

  async dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.generation += 1;

    const manager = this.manager;
    const view = this.view;
    this.converter?.cancel();
    this.converter = null;
    this.manager = null;
    this.view = null;

    const disposeTask = async () => {
      while (this.cleanupListeners.length) {
        const cleanup = this.cleanupListeners.pop();
        if (cleanup) runCleanup(cleanup);
      }
      for (const timer of this.cameraSyncTimers) clearTimeout(timer);
      this.cameraSyncTimers.clear();

      const renderer = view?.renderer;
      runCleanup(() => view?.selectionSet.clear());
      runCleanup(() => view?.stopAnimationLoop());
      runCleanup(() => renderer?.internalRenderer.setAnimationLoop(null));
      runCleanup(() => view?.clear());
      runCleanup(() => renderer?.internalRenderer.renderLists.dispose());
      runCleanup(() => renderer?.internalRenderer.dispose());
      runCleanup(() => renderer?.internalRenderer.forceContextLoss());
      try {
        await manager?.destroy();
      } catch {
        // Continue with local DOM/GPU teardown even when upstream destroy fails.
      }
      runCleanup(() => renderer?.dispose());
      runCleanup(() => renderer?.domElement.remove());
      runCleanup(() => AcDbDatabaseConverterManager.instance.unregister(AcDbFileType.DWG));
      runCleanup(() => this.container.replaceChildren());
      this.container.style.removeProperty('opacity');
      this.hiddenObjectIds.clear();
      this.textObjectIds.clear();
      this.textSceneObjects.clear();
      this.layers = [];
    };

    this.disposePromise = disposeTask();
    disposalBarrier = this.disposePromise.catch(() => undefined);
    return this.disposePromise;
  }

  private configureTransparentRenderer(view: AcTrView2d): void {
    view.renderer.setClearColor(0x000000, 0);
    view.renderer.clearAlpha = 0;
    view.renderer.internalRenderer.setClearAlpha(0);
    view.renderer.domElement.style.background = 'transparent';
    view.renderer.domElement.style.opacity = opacityToCss(this.opacity);
    view.container.style.background = 'transparent';
    view.isDirty = true;
    this.container.style.removeProperty('opacity');
  }

  private configureLowMemoryRenderer(view: AcTrView2d, enabled: boolean): void {
    if (!enabled) return;
    // A DPR of 3 renders nine times as many pixels as DPR 1. The CAD remains
    // geometrically exact while avoiding a large mobile GPU allocation.
    view.renderer.internalRenderer.setPixelRatio(1);
  }

  private configureTouchNavigation(view: AcTrView2d): void {
    // Pan/pinch owns all movement. A short tap is still resolved by the
    // pointer fallback in bindSelection, so mobile users do not need to swap
    // tools merely to inspect an object.
    view.mode = AcEdViewMode.PAN;
    const isCoarsePointer = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarsePointer) return;

    // cad-simple-viewer 1.6.3 does not expose OrbitControls publicly. Keep
    // the version-specific access guarded so desktop and future versions
    // retain their native value when the internal control is unavailable.
    const layoutView = view.activeLayoutView as unknown as TouchLayoutView | undefined;
    if (layoutView?._cameraControls && Number.isFinite(layoutView._cameraControls.zoomSpeed)) {
      layoutView._cameraControls.zoomSpeed = MOBILE_TOUCH_ZOOM_SPEED;
    }
  }

  private hideEmbeddedCommandLine(): void {
    // The simple viewer creates its desktop command line even for a read-only
    // embedded surface. It spans the canvas and would intercept map gestures.
    const commandLine = this.container.querySelector<HTMLElement>('.ml-cli-container');
    if (!commandLine) return;
    commandLine.hidden = true;
    commandLine.style.display = 'none';
    commandLine.style.pointerEvents = 'none';
  }

  private bindCamera(view: AcTrView2d): void {
    const listener = () => this.emitCamera();
    this.cleanupListeners.push(bindCadEvent(view.events.viewChanged, listener));
  }

  private bindResizeSync(view: AcTrView2d): void {
    const sync = () => this.scheduleCameraSync(0, view);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(sync);
      observer.observe(this.container);
      this.cleanupListeners.push(() => observer.disconnect());
      return;
    }

    const ownerWindow = this.container.ownerDocument.defaultView;
    ownerWindow?.addEventListener('resize', sync);
    this.cleanupListeners.push(() => ownerWindow?.removeEventListener('resize', sync));
  }

  private bindWebglContextLoss(view: AcTrView2d): void {
    const canvas = view.renderer.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (this.disposed || this.view !== view) return;
      const error = new Error('MLIGHTCAD_WEBGL_CONTEXT_LOST');
      void this.dispose().finally(() => this.events.error.dispatch(error));
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    this.cleanupListeners.push(() => canvas.removeEventListener('webglcontextlost', onContextLost));
  }

  private scheduleCameraSync(delay: number, expectedView: AcTrView2d): void {
    const timer = setTimeout(() => {
      this.cameraSyncTimers.delete(timer);
      if (this.disposed || this.view !== expectedView) return;
      this.configureTransparentRenderer(expectedView);
      this.emitCamera();
    }, delay);
    this.cameraSyncTimers.add(timer);
  }

  private bindSelection(view: AcTrView2d): void {
    view.entitySelectionEnabled = true;
    // cad-simple-viewer 1.6.3 performs its built-in selection through
    // mouse events only. A larger radius also makes thin CAD lines usable as
    // touch targets without changing their rendered line weight.
    view.selectionBoxSize = MOBILE_SELECTION_RADIUS_PX;
    const added = ({ ids }: { ids: string[] }) => {
      const objectId = ids.at(-1);
      this.events.selection.dispatch(objectId ? this.describeObject(objectId) : null);
    };
    const removed = () => {
      if (view.selectionSet.count === 0) this.events.selection.dispatch(null);
    };
    this.cleanupListeners.push(bindCadEvent(view.selectionSet.events.selectionAdded, added));
    this.cleanupListeners.push(bindCadEvent(view.selectionSet.events.selectionRemoved, removed));

    let tap: {
      pointerId: number;
      startX: number;
      startY: number;
      moved: boolean;
      hasModifier: boolean;
    } | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.isPrimary === false) {
        tap = null;
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (tap && tap.pointerId !== event.pointerId) {
        tap = null;
        return;
      }
      tap = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        hasModifier: event.shiftKey || event.ctrlKey || event.metaKey,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!tap || tap.pointerId !== event.pointerId) return;
      const dx = event.clientX - tap.startX;
      const dy = event.clientY - tap.startY;
      if (dx * dx + dy * dy > TAP_MOVE_TOLERANCE_PX * TAP_MOVE_TOLERANCE_PX) tap.moved = true;
    };
    const onPointerCancel = () => { tap = null; };
    const onPointerUp = (event: PointerEvent) => {
      if (!tap || tap.pointerId !== event.pointerId || tap.moved || tap.hasModifier) {
        tap = null;
        return;
      }
      tap = null;
      const clientPoint = { x: event.clientX, y: event.clientY };
      if (fallbackTimer) clearTimeout(fallbackTimer);
      // Run after the compatibility mouseup. Desktop/mouse selection therefore
      // remains owned by MLightCAD; this only fills the mobile pointer gap.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (this.disposed || this.view !== view) return;
        const canvasPoint = view.viewportToCanvas(clientPoint);
        const picked = view.pick(
          view.screenToWorld(canvasPoint),
          MOBILE_SELECTION_RADIUS_PX,
          true,
        );
        const objectId = picked[0]?.id;
        if (objectId) {
          if (view.selectionSet.count !== 1 || !view.selectionSet.has(objectId)) {
            view.applySelection([objectId], 'replace');
          }
        } else if (view.selectionSet.count > 0) {
          view.selectionSet.clear();
        }
      }, 0);
    };

    view.canvas.addEventListener('pointerdown', onPointerDown);
    view.canvas.addEventListener('pointermove', onPointerMove);
    view.canvas.addEventListener('pointerup', onPointerUp);
    view.canvas.addEventListener('pointercancel', onPointerCancel);
    this.cleanupListeners.push(() => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      view.canvas.removeEventListener('pointerdown', onPointerDown);
      view.canvas.removeEventListener('pointermove', onPointerMove);
      view.canvas.removeEventListener('pointerup', onPointerUp);
      view.canvas.removeEventListener('pointercancel', onPointerCancel);
    });
  }

  private bindDocument(manager: AcApDocManager): void {
    const document = manager.curDocument;
    const modelSpace = document.database.tables.blockTable.modelSpace;
    const counts = new Map<string, number>();
    this.textObjectIds.clear();
    // Iterate the database once without materializing a second, potentially
    // 60k+ entity array beside MLightCAD's own model and scene structures.
    for (const entity of modelSpace.newIterator()) {
      counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
      if (TEXT_ENTITY_TYPES.has(entity.dxfTypeName.toUpperCase())) this.textObjectIds.add(entity.objectId);
    }
    this.collectRenderedTextSceneObjects(manager.curView);

    const renderedLayers = manager.curView.cadScene.modelSpaceLayout?.layers;
    this.layers = document.layerStore.getLayers().map((layer) => ({
      id: layer.name,
      name: layer.name,
      visible: layer.isOn && !layer.isFrozen,
      featureCount: renderedLayers?.get(layer.name)?.entityCount ?? counts.get(layer.name) ?? 0,
    }));

    const changed = () => this.events.layers.dispatch(this.currentLayers);
    this.cleanupListeners.push(bindCadEvent(document.layerStore.events.changed, changed));
    this.events.layers.dispatch(this.currentLayers);
  }

  private collectRenderedTextSceneObjects(view: AcTrView2d): void {
    this.textSceneObjects.clear();
    const renderedLayers = view.cadScene.modelSpaceLayout?.layers;
    if (!renderedLayers) return;

    for (const layer of renderedLayers.values()) {
      // MLightCAD keeps glyph hierarchies unbatched and attaches
      // textEntityTraits to their render roots. Inspect that runtime registry
      // so nested INSERT/ATTRIB, DIMENSION, MLEADER and TABLE text is included.
      const group = layer.internalObject as unknown as TextAwareBatchedGroup;
      for (const [objectId, roots] of group._unbatchedEntities ?? []) {
        for (const root of roots) {
          for (const textNode of renderedTextNodes(root)) {
            let nodes = this.textSceneObjects.get(objectId);
            if (!nodes) {
              nodes = new Set();
              this.textSceneObjects.set(objectId, nodes);
            }
            nodes.add(textNode);
          }
        }
      }
    }

    for (const objectId of this.textSceneObjects.keys()) this.applyRenderedTextVisibility(objectId);
  }

  private describeObject(objectId: string): SelectedCadObject | null {
    const entity = this.manager?.curDocument.database.tables.blockTable.getEntityById(objectId)
      ?? this.manager?.curDocument.database.getObjectById(objectId);
    if (!isCadEntity(entity)) return null;
    return {
      featureId: objectId,
      layerId: entity.layer,
      cadType: entity.dxfTypeName,
      label: '',
    };
  }

  private applyObjectVisibility(objectId: string): void {
    const shouldShow = !this.hiddenObjectIds.has(objectId)
      && (this.textVisible || !this.textObjectIds.has(objectId));
    this.view?.setEntitySceneVisible(objectId, shouldShow);
  }

  private applyRenderedTextVisibility(objectId: string): void {
    const visible = this.textVisible && !this.hiddenObjectIds.has(objectId);
    for (const node of this.textSceneObjects.get(objectId) ?? []) node.visible = visible;
  }

  private emitCamera(): void {
    if (!this.view) return;
    this.events.camera.dispatch(readCadCamera(this.view));
  }
}

export const mlightCadRuntimeConfig = {
  cadDataBaseUrl: CAD_DATA_CDN,
  dwgWorkerUrl: DWG_WORKER_URL,
  mtextWorkerUrl: MTEXT_WORKER_URL,
  parserTimeoutMs: PARSER_TIMEOUT_MS,
} as const;
