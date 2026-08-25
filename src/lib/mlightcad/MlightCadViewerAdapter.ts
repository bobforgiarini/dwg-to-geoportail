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
const MOBILE_SELECTION_RADIUS_PX = 12;
const TAP_MOVE_TOLERANCE_PX = 10;

const TEXT_ENTITY_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF']);

let disposalBarrier: Promise<void> = Promise.resolve();

type ListenerCleanup = () => void;

function bindCadEvent<T>(
  event: { addEventListener: (listener: (value: T) => void) => void; removeEventListener: (listener: (value: T) => void) => void },
  listener: (value: T) => void,
): ListenerCleanup {
  event.addEventListener(listener);
  return () => event.removeEventListener(listener);
}

function layerEntityCounts(entities: Iterable<AcDbEntity>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entity of entities) counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
  return counts;
}

function isCadEntity(value: unknown): value is AcDbEntity {
  return Boolean(value && typeof value === 'object' && 'dxfTypeName' in value && 'layer' in value);
}

export class MlightCadViewerAdapter {
  readonly events = {
    progress: new AdapterEvent<MlightCadAdapterEvents['progress']>(),
    camera: new AdapterEvent<MlightCadAdapterEvents['camera']>(),
    layers: new AdapterEvent<MlightCadAdapterEvents['layers']>(),
    selection: new AdapterEvent<MlightCadAdapterEvents['selection']>(),
    ready: new AdapterEvent<MlightCadAdapterEvents['ready']>(),
  };

  private manager: AcApDocManager | null = null;
  private view: AcTrView2d | null = null;
  private converter: CancellableLibreDwgConverter | null = null;
  private readonly cleanupListeners: ListenerCleanup[] = [];
  private layers: CadOverlayLayer[] = [];
  private readonly hiddenObjectIds = new Set<string>();
  private readonly textObjectIds = new Set<string>();
  private textVisible = true;
  private generation = 0;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(private readonly container: HTMLElement) {}

  get hiddenObjectCount(): number {
    return this.hiddenObjectIds.size;
  }

  get currentLayers(): CadOverlayLayer[] {
    return this.layers.map((layer) => ({ ...layer }));
  }

  async load(file: File): Promise<void> {
    const generation = ++this.generation;
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
    this.configureTransparentRenderer(view);
    this.hideEmbeddedCommandLine();
    this.bindCamera(view);
    this.bindSelection(view);

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
      minimumChunkSize: 1_000,
      mode: AcEdOpenMode.Read,
      openViewMode: AcApOpenViewMode.Extents,
      progressiveRendering: true,
      timeout: PARSER_TIMEOUT_MS,
    });
    if (!opened) throw new Error('MLIGHTCAD_OPEN_FAILED');
    if (this.disposed || generation !== this.generation) return;

    const database = manager.curDocument.database;
    acdbHostApplicationServices().layoutManager.setCurrentLayoutBtrId(
      database.tables.blockTable.modelSpace.objectId,
      database,
    );
    manager.setActiveLayout(view, database);
    this.configureTouchNavigation(view);
    await view.waitUntilIdle(PARSER_TIMEOUT_MS);
    if (this.disposed || generation !== this.generation) return;

    this.bindDocument(manager);
    view.zoomToFitDrawing(PARSER_TIMEOUT_MS, view.modelSpaceBtrId);
    this.emitCamera();
    this.events.progress.dispatch({ phase: 'ready', percentage: 100 });
    const entityCount = this.layers.reduce((sum, layer) => sum + layer.featureCount, 0);
    this.events.ready.dispatch({ layers: this.currentLayers, entityCount });
  }

  cancel(): Promise<void> {
    this.generation += 1;
    this.converter?.cancel();
    return this.dispose();
  }

  fitDrawing(): void {
    this.view?.zoomToFitDrawing(PARSER_TIMEOUT_MS, this.view.modelSpaceBtrId);
  }

  centerOn(center: [number, number]): void {
    if (!this.view) return;
    this.view.flyTo({ x: center[0], y: center[1] }, this.view.internalCamera.zoom);
  }

  setOpacity(value: number): void {
    this.container.style.opacity = opacityToCss(normalizeCadOpacity(value));
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    if (!this.view) return;
    this.view.cadScene.forEachSceneLayer(layerId, (layer) => { layer.visible = visible; });
    this.layers = this.layers.map((layer) => layer.id === layerId ? { ...layer, visible } : layer);
    this.events.layers.dispatch(this.currentLayers);
  }

  setAllLayersVisible(visible: boolean): void {
    for (const layer of this.layers) {
      this.view?.cadScene.forEachSceneLayer(layer.id, (sceneLayer) => { sceneLayer.visible = visible; });
    }
    this.layers = this.layers.map((layer) => ({ ...layer, visible }));
    this.events.layers.dispatch(this.currentLayers);
  }

  hideObject(objectId: string): void {
    this.hiddenObjectIds.add(objectId);
    this.applyObjectVisibility(objectId);
    this.view?.selectionSet.clear();
    this.events.selection.dispatch(null);
  }

  clearSelection(): void {
    this.view?.selectionSet.clear();
  }

  restoreHiddenObjects(): void {
    const hidden = [...this.hiddenObjectIds];
    this.hiddenObjectIds.clear();
    for (const objectId of hidden) this.applyObjectVisibility(objectId);
  }

  setTextsVisible(visible: boolean): void {
    this.textVisible = visible;
    for (const objectId of this.textObjectIds) this.applyObjectVisibility(objectId);
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
      while (this.cleanupListeners.length) this.cleanupListeners.pop()?.();

      try {
        view?.selectionSet.clear();
        view?.stopAnimationLoop();
        view?.clear();
        view?.renderer.internalRenderer.setAnimationLoop(null);
        view?.renderer.internalRenderer.renderLists.dispose();
        view?.renderer.internalRenderer.dispose();
        view?.renderer.internalRenderer.forceContextLoss();
        await manager?.destroy();
      } finally {
        if (view) {
          const renderer = view.renderer;
          renderer.dispose();
          renderer.domElement.remove();
        }
        AcDbDatabaseConverterManager.instance.unregister(AcDbFileType.DWG);
        this.container.replaceChildren();
        this.hiddenObjectIds.clear();
        this.textObjectIds.clear();
        this.layers = [];
      }
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
    view.container.style.background = 'transparent';
  }

  private configureTouchNavigation(view: AcTrView2d): void {
    // Pan/pinch owns all movement. A short tap is still resolved by the
    // pointer fallback in bindSelection, so mobile users do not need to swap
    // tools merely to inspect an object.
    view.mode = AcEdViewMode.PAN;
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
    const entities = [...modelSpace.newIterator()];
    const counts = layerEntityCounts(entities);
    this.textObjectIds.clear();
    for (const entity of entities) {
      if (TEXT_ENTITY_TYPES.has(entity.dxfTypeName.toUpperCase())) this.textObjectIds.add(entity.objectId);
    }

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
