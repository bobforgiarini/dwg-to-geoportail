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
  AcDbOsnapMode,
  acdbHostApplicationServices,
  type AcDbEntity,
  type AcDbProgressdEventArgs,
} from '@mlightcad/data-model';
import { disposePreviewSubset } from '@mlightcad/three-renderer';
import {
  BufferGeometry,
  Group,
  Line as ThreeLine,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type {
  CadSnapKind,
  CadObjectDrawOrder,
  CadObjectDrawOrderTier,
  CadOverlayLayer,
  LurefCoordinate,
  MeasurementPoint,
  SelectedCadObject,
} from '../../types/models';
import type { CadLoadProfile, CadOverlayBlock, DwgPreflightReport } from '../cad/preflightTypes';
import { awaitCadRuntimeDisposal, registerCadRuntimeDisposal } from '../cad/runtimeDisposal';
import { cadObjectIdFromKey, createCadObjectKey } from '../cad/objectKey';
import { createCadDrawOrderGroupKey, moveCadObjectDrawOrder } from '../cad/drawOrder';
import {
  DEFAULT_CAD_APPEARANCE,
  normalizeFillOpacity,
  type CadAppearanceSettings,
} from '../cad/appearance';
import { readCadCamera } from './cameraBridge';
import { CadFillOpacityController } from './fillOpacity';
import { appendFontSubstitutionWarnings } from './fontWarnings';
import { CancellableLibreDwgConverter } from './CancellableLibreDwgConverter';
import { normalizeCadOpacity, opacityToCss } from './opacity';
import {
  resolveCadRenderQuality,
  type CadRenderQualityContext,
  type CadRenderQualityMode,
  type ResolvedCadRenderQuality,
} from './renderQuality';
import {
  AdapterEvent,
  type MlightCadCamera,
  type MlightCadAdapterEvents,
  type MlightCadLoadOptions,
} from './types';
import { cadFileDescriptor, type CadDwgSource } from '../cad/xrefBundle';

const WORKER_ROOT = '/mlightcad-workers/0.3.0';
const DWG_WORKER_URL = `${WORKER_ROOT}/${LIBREDWG_PARSER_WORKER_FILE}`;
const MTEXT_WORKER_URL = `${WORKER_ROOT}/${MTEXT_RENDERER_WORKER_FILE}`;
const CAD_DATA_CDN = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/';
const PARSER_TIMEOUT_MS = 120_000;
const LARGE_DWG_BYTES = 10 * 1024 * 1024;
const DEFAULT_MINIMUM_CHUNK_SIZE = 1_000;
const LOW_MEMORY_MINIMUM_CHUNK_SIZE = 100;
const MOBILE_SELECTION_RADIUS_PX = 12;
const MEASUREMENT_SNAP_RADIUS_PX = 18;
const TAP_MOVE_TOLERANCE_PX = 10;
const MOBILE_TOUCH_ZOOM_SPEED = 2.25;
const FIT_CAMERA_SYNC_DELAY_MS = 350;
const MOBILE_REORDER_ACTION_BUDGET = 128;
const MOBILE_REORDER_TOTAL_BUDGET = 384;
const DESKTOP_REORDER_ACTION_BUDGET = 256;
const DESKTOP_REORDER_TOTAL_BUDGET = 512;
const REORDER_RENDER_TIER = 9_000;
const REORDER_RANK_STEP = 256;
const REORDER_SNAP_CANDIDATE_LIMIT = 32;
const MEASUREMENT_RENDER_ORDER = 20_000;
const MEASUREMENT_COLOR = 0xf3b66f;
const SNAP_PREVIEW_COLOR = 0xffc76f;

export type MlightCadDrawOrderResult = 'applied' | 'budget-exceeded' | 'not-found';

// LEADER and MULTILEADER annotations are a single CAD entity whose rendered
// geometry contains both the annotation and its leader line. Hiding only the
// glyph nodes leaves disconnected arrows on the map, so these entities follow
// the text visibility setting as a whole. MLEADER is retained as an alias used
// by some converter versions.
const TEXT_CONTROLLED_ENTITY_TYPES = new Set([
  'TEXT',
  'MTEXT',
  'ATTRIB',
  'ATTDEF',
  'LEADER',
  'MLEADER',
  'MULTILEADER',
]);

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

interface BlockReferenceEntity extends AcDbEntity {
  blockName: string;
  blockTableRecord?: {
    name: string;
    newIterator: () => Iterable<AcDbEntity>;
  };
}

interface ReorderPreview {
  root: Group;
  objectIds: string[];
  fragmentCount: number;
  subsets: Array<{ root: Group; layerId: string; objectId: string }>;
}

interface SnapPickResult {
  id: string;
}

function snapKindFromOsnapMode(mode: AcDbOsnapMode): CadSnapKind {
  switch (mode) {
    case AcDbOsnapMode.EndPoint:
      return 'endpoint';
    case AcDbOsnapMode.Node:
    case AcDbOsnapMode.Insertion:
      return 'vertex';
    case AcDbOsnapMode.Intersection:
      return 'intersection';
    case AcDbOsnapMode.MidPoint:
      return 'midpoint';
    case AcDbOsnapMode.Center:
      return 'center';
    case AcDbOsnapMode.Quadrant:
    case AcDbOsnapMode.Nearest:
    default:
      return 'nearest';
  }
}

function disposeLocalOverlay(root: Object3D | null): void {
  if (!root) return;
  root.removeFromParent();
  root.traverse((object) => {
    const geometry = (object as Object3D & { geometry?: BufferGeometry }).geometry;
    geometry?.dispose();
    for (const material of drawableMaterials(object)) material.dispose();
  });
}

function drawableMaterials(object: Object3D): Material[] {
  if (!('material' in object)) return [];
  const material = (object as Object3D & { material?: Material | Material[] }).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
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

function isBlockReference(value: AcDbEntity): value is BlockReferenceEntity {
  return value.dxfTypeName.toUpperCase() === 'INSERT'
    && typeof (value as unknown as Partial<BlockReferenceEntity>).blockName === 'string';
}

function canonicalBlockName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function sameCanonicalValues(left: string[], right: string[]): boolean {
  const leftValues = new Set(left.map(canonicalBlockName));
  const rightValues = new Set(right.map(canonicalBlockName));
  return leftValues.size === rightValues.size
    && [...leftValues].every((value) => rightValues.has(value));
}

function isMobileCadDevice(explicitMobile?: boolean): boolean {
  if (explicitMobile !== undefined) return explicitMobile;
  if (typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches) return true;
  return typeof navigator !== 'undefined'
    && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function shouldUseLowMemoryCadMode(fileSize: number, explicitMobile?: boolean): boolean {
  if (fileSize > LARGE_DWG_BYTES || explicitMobile === true) return true;
  if (typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches) return true;
  return typeof navigator !== 'undefined'
    && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
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
    blocks: new AdapterEvent<MlightCadAdapterEvents['blocks']>(),
    preflight: new AdapterEvent<MlightCadAdapterEvents['preflight']>(),
    selection: new AdapterEvent<MlightCadAdapterEvents['selection']>(),
    ready: new AdapterEvent<MlightCadAdapterEvents['ready']>(),
    error: new AdapterEvent<MlightCadAdapterEvents['error']>(),
  };

  private manager: AcApDocManager | null = null;
  private view: AcTrView2d | null = null;
  private converter: CancellableLibreDwgConverter | null = null;
  private readonly cleanupListeners: ListenerCleanup[] = [];
  private layers: CadOverlayLayer[] = [];
  private blocks: CadOverlayBlock[] = [];
  private preflight: DwgPreflightReport | null = null;
  private appliedLoadProfile: CadLoadProfile = {
    mode: 'full',
    hiddenLayerIds: [],
    hiddenBlockNames: [],
    hiddenEntityCategories: [],
  };
  private readonly directBlockObjectIds = new Map<string, Set<string>>();
  private readonly hiddenBlockObjectIds = new Set<string>();
  private readonly objectBlockPaths = new Map<string, string[]>();
  private readonly objectIdsByKey = new Map<string, string>();
  private readonly drawOrderKeyByObjectId = new Map<string, string>();
  private readonly objectIdsByDrawOrderKey = new Map<string, Set<string>>();
  private readonly reorderPreviews = new Map<string, ReorderPreview>();
  private readonly reorderedObjectIds = new Set<string>();
  private drawOrder: CadObjectDrawOrder = { front: [], back: [] };
  private readonly previewRaycaster = new Raycaster();
  private readonly previewPointer = new Vector2();
  private readonly fillOpacityController = new CadFillOpacityController();
  private readonly hiddenObjectIds = new Set<string>();
  private readonly textObjectIds = new Set<string>();
  private readonly textSceneObjects = new Map<string, Set<RenderedSceneNode>>();
  private readonly cameraSyncTimers = new Set<ReturnType<typeof setTimeout>>();
  private measurementOverlay: Group | null = null;
  private snapPreview: Points | null = null;
  private measurementCaptureActive = false;
  private textVisible = true;
  private opacity = 100;
  private appearance: CadAppearanceSettings = { ...DEFAULT_CAD_APPEARANCE };
  private renderQualityMode: CadRenderQualityMode = 'auto';
  private renderQualityContext: CadRenderQualityContext = {};
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

  get currentBlocks(): CadOverlayBlock[] {
    return this.blocks.map((block) => ({ ...block, referencedBlockNames: [...block.referencedBlockNames] }));
  }

  get preflightReport(): DwgPreflightReport | null {
    return this.preflight;
  }

  get currentRenderQuality(): ResolvedCadRenderQuality {
    return resolveCadRenderQuality(this.renderQualityMode, this.renderQualityContext);
  }

  async load(file: File, options: MlightCadLoadOptions = {}): Promise<void> {
    const generation = ++this.generation;
    const lowMemory = shouldUseLowMemoryCadMode(file.size, options.device?.mobile);
    this.renderQualityContext = {
      nativePixelRatio: this.container.ownerDocument.defaultView?.devicePixelRatio,
      mobile: isMobileCadDevice(options.device?.mobile),
      memoryGiB: options.device?.memoryGiB,
      fileSize: file.size,
      risk: null,
    };
    try {
      await disposalBarrier;
      await awaitCadRuntimeDisposal();
      if (this.disposed || generation !== this.generation) return;

      const xrefSources: CadDwgSource[] = options.xrefSources ? [...options.xrefSources] : [];
      if (!options.xrefSources) {
        for (const xref of options.xrefFiles ?? []) {
          if (this.disposed || generation !== this.generation) return;
          xrefSources.push({ file: cadFileDescriptor(xref), data: await xref.arrayBuffer() });
        }
      }

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
      }).configurePreparation({
        file: { name: file.name, size: file.size, lastModified: file.lastModified },
        device: options.device,
        maxBlockDepth: options.maxBlockDepth,
        loadProfile: options.loadProfile,
        onPreflight: (report) => {
          this.preflight = report;
          this.renderQualityContext = { ...this.renderQualityContext, risk: report.risk.level };
          this.applyRenderQuality();
          this.appliedLoadProfile = options.loadProfile ?? {
            mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [],
          };
          const hiddenBlocks = new Set(this.appliedLoadProfile.hiddenBlockNames.map(canonicalBlockName));
          this.blocks = report.blocks.map((block) => ({
            ...block,
            visible: !hiddenBlocks.has(canonicalBlockName(block.name)),
          }));
          this.events.preflight.dispatch(report);
          this.events.blocks.dispatch(this.currentBlocks);
        },
        onPreparation: options.onPreparation
          ? async (report) => {
            const selection = await options.onPreparation!(report);
            this.appliedLoadProfile = selection.decision === 'filtered'
              ? selection.profile ?? report.recommendedProfile
              : { mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [] };
            const hiddenBlocks = new Set(this.appliedLoadProfile.hiddenBlockNames.map(canonicalBlockName));
            this.blocks = report.blocks.map((block) => ({
              ...block,
              visible: !hiddenBlocks.has(canonicalBlockName(block.name)),
            }));
            this.events.blocks.dispatch(this.currentBlocks);
            return selection;
          }
          : undefined,
        forcePreparation: options.forcePreparation,
        forceFull: options.forceFull,
        xrefSources,
        preferredXrefFileIds: options.preferredXrefFileIds,
        annotationScaleId: options.annotationScaleId,
        spatialFilterEnabled: options.spatialFilterEnabled,
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
      this.configureRenderQuality(view);
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

      if (this.preflight) {
        const enrichedPreflight = appendFontSubstitutionWarnings(
          this.preflight,
          view.renderer.missedFonts,
        );
        if (enrichedPreflight !== this.preflight) {
          this.preflight = enrichedPreflight;
          this.events.preflight.dispatch(enrichedPreflight);
        }
      }

      this.bindDocument(manager);
      this.applyAppearance();
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
      this.events.ready.dispatch({
        layers: this.currentLayers,
        blocks: this.currentBlocks,
        entityCount,
        preflight: this.preflight,
      });
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

  /** Restores center and CSS-pixel scale after a controlled CAD-only reload. */
  setCamera(camera: MlightCadCamera): void {
    if (!this.view || !Number.isFinite(camera.resolution) || camera.resolution <= 0) return;
    const current = readCadCamera(this.view);
    const currentZoom = this.view.internalCamera.zoom;
    const zoom = currentZoom * (current.resolution / camera.resolution);
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    this.view.flyTo({ x: camera.center[0], y: camera.center[1] }, zoom);
    this.emitCamera();
  }

  /**
   * Resolves the fixed viewport aim in drawing metres. OSNAP is deliberately
   * invoked only by the caller (after movement has settled or on capture), so
   * the 0.2.4 camera bridge remains free of picking and React state work.
   */
  resolveAimPoint(snapEnabled = true): MeasurementPoint | null {
    const view = this.view;
    if (!view) return null;
    const rect = view.canvas.getBoundingClientRect();
    const width = rect.width || view.width || view.canvas.clientWidth || view.canvas.width;
    const height = rect.height || view.height || view.canvas.clientHeight || view.canvas.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const world = view.screenToWorld({ x: width / 2, y: height / 2 });
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;
    const aim: MeasurementPoint = {
      coordinate: [world.x, world.y],
      source: 'aim',
    };
    if (!snapEnabled) {
      view.osnapResolver?.clearAcquiredCenters?.();
      return aim;
    }

    const temporarilyVisibleReorderedIds: string[] = [];
    try {
      const reorderedCandidates = this.pickReorderSnapCandidates(view, {
        x: rect.left + width / 2,
        y: rect.top + height / 2,
      });
      for (const objectId of reorderedCandidates) {
        // MLightCAD's native OSNAP resolves database entities through the
        // original CAD scene. Reorder previews are render-only clones, so make
        // only the hit originals visible for this synchronous query.
        view.setEntitySceneVisible(objectId, true);
        temporarilyVisibleReorderedIds.push(objectId);
      }
      const temporarilyVisibleReorderedSet = new Set(temporarilyVisibleReorderedIds);
      // The renderer pick is the visibility gate. This prevents the native
      // resolver's database queries from snapping to objects hidden by the app.
      const visiblePick = (view.pick(world, MEASUREMENT_SNAP_RADIUS_PX) as SnapPickResult[])
        .some(({ id }) => this.isSnapObjectVisible(id, temporarilyVisibleReorderedSet));
      if (!visiblePick) return aim;
      view.osnapResolver?.clearAcquiredCenters?.();
      const snap = view.osnapResolver.resolve({
        cursorWcs: world,
        hitRadiusPx: MEASUREMENT_SNAP_RADIUS_PX,
      });
      if (!snap || !Number.isFinite(snap.x) || !Number.isFinite(snap.y)) return aim;
      return {
        coordinate: [snap.x, snap.y],
        source: 'cad-snap',
        snapKind: snapKindFromOsnapMode(snap.type),
      };
    } catch {
      // Progressive drawing or disposal can briefly invalidate a scene query.
      // Capturing the exact aim remains safe and deterministic in that window.
      return aim;
    } finally {
      // Reordered originals must remain render-hidden; their preview clones are
      // the only persistent representation. Restoration is synchronous and
      // does not add work to the camera bridge or retain scene resources.
      for (const objectId of temporarilyVisibleReorderedIds) this.applyObjectVisibility(objectId);
    }
  }

  /** Renders at most two captured points and their connecting 2D segment. */
  setMeasurementOverlay(
    first: LurefCoordinate | null = null,
    second: LurefCoordinate | null = null,
  ): void {
    const view = this.view;
    disposeLocalOverlay(this.measurementOverlay);
    this.measurementOverlay = null;
    if (!view || !first) {
      if (view) view.isDirty = true;
      return;
    }

    const root = new Group();
    root.name = 'CadDistanceMeasurement';
    const points = second ? [first, second] : [first];
    const markerGeometry = new BufferGeometry().setFromPoints(
      points.map(([x, y]) => new Vector3(x, y, 0)),
    );
    const markerMaterial = new PointsMaterial({
      color: MEASUREMENT_COLOR,
      depthTest: false,
      depthWrite: false,
      size: 8,
      sizeAttenuation: false,
    });
    const markers = new Points(markerGeometry, markerMaterial);
    markers.name = 'CadDistanceMeasurementPoints';
    markers.renderOrder = MEASUREMENT_RENDER_ORDER + 1;
    root.add(markers);

    if (second) {
      const lineGeometry = new BufferGeometry().setFromPoints([
        new Vector3(first[0], first[1], 0),
        new Vector3(second[0], second[1], 0),
      ]);
      const lineMaterial = new LineBasicMaterial({
        color: MEASUREMENT_COLOR,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 1,
      });
      const line = new ThreeLine(lineGeometry, lineMaterial);
      line.name = 'CadDistanceMeasurementLine';
      line.renderOrder = MEASUREMENT_RENDER_ORDER;
      root.add(line);
    }

    view.cadScene.internalScene.add(root);
    this.measurementOverlay = root;
    view.isDirty = true;
  }

  /** Updates the lightweight fixed-size marker for the current CAD snap. */
  setSnapPreview(point: MeasurementPoint | null = null): void {
    const view = this.view;
    if (!view || point?.source !== 'cad-snap') {
      if (!this.snapPreview) return;
      disposeLocalOverlay(this.snapPreview);
      this.snapPreview = null;
      if (view) view.isDirty = true;
      return;
    }

    const [x, y] = point.coordinate;
    if (!this.snapPreview) {
      const geometry = new BufferGeometry().setFromPoints([new Vector3(x, y, 0)]);
      const material = new PointsMaterial({
        color: SNAP_PREVIEW_COLOR,
        depthTest: false,
        depthWrite: false,
        size: 11,
        sizeAttenuation: false,
      });
      this.snapPreview = new Points(geometry, material);
      this.snapPreview.name = 'CadDistanceSnapPreview';
      this.snapPreview.renderOrder = MEASUREMENT_RENDER_ORDER + 2;
      view.cadScene.internalScene.add(this.snapPreview);
    } else {
      const position = this.snapPreview.geometry.getAttribute('position');
      position.setXYZ(0, x, y, 0);
      position.needsUpdate = true;
    }
    view.isDirty = true;
  }

  /** Keeps PAN gestures active while suppressing normal CAD object selection. */
  setMeasurementCaptureActive(active: boolean): void {
    this.measurementCaptureActive = active;
    const view = this.view;
    if (!view) return;
    view.osnapResolver?.clearAcquiredCenters?.();
    view.entitySelectionEnabled = !active;
    if (active) {
      view.selectionSet.clear();
      this.events.selection.dispatch(null);
    }
  }

  setOpacity(value: number): void {
    this.opacity = normalizeCadOpacity(value);
    this.container.style.removeProperty('opacity');
    if (this.view) this.view.renderer.domElement.style.opacity = opacityToCss(this.opacity);
  }

  setAppearance(value: CadAppearanceSettings): void {
    this.appearance = {
      profile: value.profile === 'map' ? 'map' : 'original',
      fillOpacity: normalizeFillOpacity(value.fillOpacity),
    };
    this.applyAppearance();
  }

  setRenderQuality(mode: CadRenderQualityMode): void {
    this.renderQualityMode = mode;
    this.applyRenderQuality();
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    if (!this.view) return;
    this.view.cadScene.forEachSceneLayer(layerId, (layer) => { layer.visible = visible; });
    this.view.isDirty = true;
    this.layers = this.layers.map((layer) => layer.id === layerId ? { ...layer, visible } : layer);
    this.refreshAllReorderPreviewVisibility();
    this.events.layers.dispatch(this.currentLayers);
  }

  setAllLayersVisible(visible: boolean): void {
    for (const layer of this.layers) {
      this.view?.cadScene.forEachSceneLayer(layer.id, (sceneLayer) => { sceneLayer.visible = visible; });
    }
    if (this.view) this.view.isDirty = true;
    this.layers = this.layers.map((layer) => ({ ...layer, visible }));
    this.refreshAllReorderPreviewVisibility();
    this.events.layers.dispatch(this.currentLayers);
  }

  /**
   * Changes direct model-space INSERTs without rebuilding the CAD document.
   * A block that is also reachable through another definition needs a filtered
   * reload so every nested occurrence is removed consistently.
   *
   * @returns true when the caller must reload the CAD document.
   */
  setBlockVisible(blockName: string, visible: boolean): boolean {
    const normalized = canonicalBlockName(blockName);
    const block = this.blocks.find((candidate) => canonicalBlockName(candidate.name) === normalized
      || canonicalBlockName(candidate.id) === normalized);
    if (!block) return true;
    const objectIds = this.directBlockObjectIds.get(normalized);
    if (objectIds?.size) {
      for (const objectId of objectIds) {
        if (visible) this.hiddenBlockObjectIds.delete(objectId);
        else this.hiddenBlockObjectIds.add(objectId);
        this.applyObjectVisibility(objectId);
        this.applyRenderedTextVisibility(objectId);
      }
    }
    if (this.view) this.view.isDirty = true;
    this.blocks = this.blocks.map((candidate) => candidate === block ? { ...candidate, visible } : candidate);
    this.refreshAllReorderPreviewVisibility();
    this.events.blocks.dispatch(this.currentBlocks);
    return block.isNested || !objectIds?.size;
  }

  /**
   * Applies changes that can safely be represented by the mounted scene and
   * reports whether the raw DWG must be reparsed with the new profile.
   */
  applyLoadProfile(profile: CadLoadProfile): boolean {
    const layerChanged = !sameCanonicalValues(
      this.appliedLoadProfile.hiddenLayerIds,
      profile.hiddenLayerIds,
    );
    const categoriesChanged = !sameCanonicalValues(
      this.appliedLoadProfile.hiddenEntityCategories,
      profile.hiddenEntityCategories,
    );
    let reloadRequired = layerChanged || categoriesChanged;
    const nextHiddenBlocks = new Set(profile.hiddenBlockNames.map(canonicalBlockName));
    for (const block of this.blocks) {
      const visible = !nextHiddenBlocks.has(canonicalBlockName(block.name));
      if (visible !== block.visible) reloadRequired = this.setBlockVisible(block.name, visible) || reloadRequired;
    }
    if (!reloadRequired) this.appliedLoadProfile = {
      ...profile,
      hiddenLayerIds: [...profile.hiddenLayerIds],
      hiddenBlockNames: [...profile.hiddenBlockNames],
      hiddenEntityCategories: [...profile.hiddenEntityCategories],
    };
    return reloadRequired;
  }

  hideObject(objectId: string): void {
    this.hiddenObjectIds.add(objectId);
    this.applyObjectVisibility(objectId);
    this.applyRenderedTextVisibility(objectId);
    this.refreshAllReorderPreviewVisibility();
    this.view?.selectionSet.clear();
    this.events.selection.dispatch(null);
  }

  hideObjectByKey(objectKey: string): boolean {
    const exactObjectId = this.objectIdsByKey.get(objectKey);
    const fallbackObjectId = cadObjectIdFromKey(objectKey);
    const fallbackEntity = exactObjectId ? null : (
      this.manager?.curDocument.database.tables.blockTable.getEntityById(fallbackObjectId)
      ?? this.manager?.curDocument.database.getObjectById(fallbackObjectId)
    );
    const objectId = exactObjectId ?? (fallbackEntity ? fallbackObjectId : null);
    if (!objectId) return false;
    // MLightCAD stores one object for a block-definition entity even when the
    // definition is inserted through several parent paths. Handle fallback is
    // therefore intentionally definition-wide when an exact path is absent.
    this.hideObject(objectId);
    return true;
  }

  /**
   * Moves a logical CAD object to an extreme render tier without rebuilding the
   * drawing. Preview extraction happens only here, never in the camera path.
   */
  setObjectDrawOrder(
    groupKey: string,
    tier: CadObjectDrawOrderTier,
  ): MlightCadDrawOrderResult {
    const view = this.view;
    if (!view) return 'not-found';
    let preview = this.reorderPreviews.get(groupKey);
    if (!preview) {
      const objectIds = [...(this.objectIdsByDrawOrderKey.get(groupKey) ?? [])];
      const fallbackId = cadObjectIdFromKey(groupKey);
      if (objectIds.length === 0 && view.cadScene.hasEntity(fallbackId)) objectIds.push(fallbackId);
      if (objectIds.length === 0) return 'not-found';
      const created = this.createReorderPreview(objectIds);
      if (created === 'budget-exceeded') return created;
      if (!created) return 'not-found';
      preview = created;
      this.reorderPreviews.set(groupKey, preview);
      for (const objectId of preview.objectIds) this.reorderedObjectIds.add(objectId);
      view.cadScene.internalScene.add(preview.root);
      this.applyFillOpacity(false);
    }

    this.drawOrder = moveCadObjectDrawOrder(this.drawOrder, groupKey, tier);
    this.refreshReorderPreviewOrders();
    for (const objectId of preview.objectIds) {
      this.applyObjectVisibility(objectId);
      this.applyRenderedTextVisibility(objectId);
    }
    this.refreshReorderPreviewVisibility(groupKey);
    view.selectionSet.clear();
    const selected = this.describeObject(preview.objectIds[0]);
    if (selected) this.events.selection.dispatch(selected);
    view.isDirty = true;
    return 'applied';
  }

  /** Replays session order after a CAD-only reload or viewer switch. */
  applyObjectDrawOrder(order: CadObjectDrawOrder): MlightCadDrawOrderResult {
    let result: MlightCadDrawOrderResult = 'applied';
    for (const groupKey of order.back) {
      const next = this.setObjectDrawOrder(groupKey, 'back');
      if (next !== 'applied') result = next;
    }
    for (const groupKey of order.front) {
      const next = this.setObjectDrawOrder(groupKey, 'front');
      if (next !== 'applied') result = next;
    }
    return result;
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
    this.refreshAllReorderPreviewVisibility();
  }

  setTextsVisible(visible: boolean): void {
    this.textVisible = visible;
    for (const objectId of this.textObjectIds) this.applyObjectVisibility(objectId);
    for (const objectId of this.textSceneObjects.keys()) this.applyRenderedTextVisibility(objectId);
    this.refreshAllReorderPreviewVisibility();
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
      runCleanup(() => view?.osnapResolver?.clearAcquiredCenters?.());
      runCleanup(() => this.fillOpacityController.restore());
      runCleanup(() => disposeLocalOverlay(this.snapPreview));
      this.snapPreview = null;
      runCleanup(() => disposeLocalOverlay(this.measurementOverlay));
      this.measurementOverlay = null;
      runCleanup(() => this.disposeReorderPreviews());
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
      this.container.style.removeProperty('filter');
      this.hiddenObjectIds.clear();
      this.hiddenBlockObjectIds.clear();
      this.directBlockObjectIds.clear();
      this.objectBlockPaths.clear();
      this.objectIdsByKey.clear();
      this.drawOrderKeyByObjectId.clear();
      this.objectIdsByDrawOrderKey.clear();
      this.reorderedObjectIds.clear();
      this.drawOrder = { front: [], back: [] };
      this.textObjectIds.clear();
      this.textSceneObjects.clear();
      this.measurementCaptureActive = false;
      this.layers = [];
      this.blocks = [];
      this.preflight = null;
    };

    this.disposePromise = disposeTask();
    disposalBarrier = this.disposePromise.catch(() => undefined);
    registerCadRuntimeDisposal(this.disposePromise);
    return this.disposePromise;
  }

  private configureTransparentRenderer(view: AcTrView2d): void {
    view.renderer.setClearColor(0x000000, 0);
    view.renderer.clearAlpha = 0;
    view.renderer.internalRenderer.setClearAlpha(0);
    view.renderer.domElement.style.background = 'transparent';
    view.renderer.domElement.style.opacity = opacityToCss(this.opacity);
    view.renderer.domElement.style.filter = this.appearance.profile === 'map'
      ? 'contrast(1.08) saturate(1.05)'
      : '';
    view.container.style.background = 'transparent';
    view.isDirty = true;
    this.container.style.removeProperty('opacity');
  }

  private configureRenderQuality(view: AcTrView2d): void {
    const { pixelRatio } = this.currentRenderQuality;
    view.renderer.internalRenderer.setPixelRatio(pixelRatio);
    view.isDirty = true;
  }

  private applyRenderQuality(): void {
    if (this.view) this.configureRenderQuality(this.view);
  }

  private applyFillOpacity(markDirty: boolean): void {
    const view = this.view;
    if (!view) return;
    this.fillOpacityController.apply(
      view.cadScene.internalScene,
      this.appearance.fillOpacity,
    );
    if (markDirty) view.isDirty = true;
  }

  private applyAppearance(): void {
    const view = this.view;
    if (!view) return;
    view.renderer.domElement.style.filter = this.appearance.profile === 'map'
      ? 'contrast(1.08) saturate(1.05)'
      : '';
    this.applyFillOpacity(false);
    view.isDirty = true;
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
    view.entitySelectionEnabled = !this.measurementCaptureActive;
    // cad-simple-viewer 1.6.3 performs its built-in selection through
    // mouse events only. A larger radius also makes thin CAD lines usable as
    // touch targets without changing their rendered line weight.
    view.selectionBoxSize = MOBILE_SELECTION_RADIUS_PX;
    const added = ({ ids }: { ids: string[] }) => {
      if (this.measurementCaptureActive) {
        view.selectionSet.clear();
        return;
      }
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
      if (this.measurementCaptureActive) {
        tap = null;
        return;
      }
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
        if (this.disposed || this.view !== view || this.measurementCaptureActive) return;
        const frontPreviewId = this.pickReorderPreview(view, clientPoint, 'front');
        if (frontPreviewId) {
          const selected = this.describeObject(frontPreviewId);
          if (selected) this.events.selection.dispatch(selected);
          return;
        }
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
        } else {
          const backPreviewId = this.pickReorderPreview(view, clientPoint, 'back');
          if (backPreviewId) {
            const selected = this.describeObject(backPreviewId);
            if (selected) this.events.selection.dispatch(selected);
          } else if (view.selectionSet.count > 0) {
            view.selectionSet.clear();
          }
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
    const blockTable = document.database.tables.blockTable;
    const modelSpace = blockTable.modelSpace;
    const counts = new Map<string, number>();
    this.textObjectIds.clear();
    this.directBlockObjectIds.clear();
    this.hiddenBlockObjectIds.clear();
    this.objectBlockPaths.clear();
    this.objectIdsByKey.clear();
    this.drawOrderKeyByObjectId.clear();
    this.objectIdsByDrawOrderKey.clear();
    const expandedDefinitions = new Set<string>();
    const visitBlockPath = (entity: AcDbEntity, parentPath: string[], branch: Set<string>) => {
      const path = isBlockReference(entity) ? [...parentPath, entity.blockName] : parentPath;
      if (!this.objectBlockPaths.has(entity.objectId)) this.objectBlockPaths.set(entity.objectId, path);
      this.objectIdsByKey.set(createCadObjectKey(entity.objectId, path), entity.objectId);
      const drawOrderKey = isBlockReference(entity) && parentPath.length === 0
        ? createCadObjectKey(entity.objectId, [])
        : createCadDrawOrderGroupKey(entity.objectId, path);
      this.drawOrderKeyByObjectId.set(entity.objectId, drawOrderKey);
      const drawOrderIds = this.objectIdsByDrawOrderKey.get(drawOrderKey) ?? new Set<string>();
      drawOrderIds.add(entity.objectId);
      this.objectIdsByDrawOrderKey.set(drawOrderKey, drawOrderIds);
      if (TEXT_CONTROLLED_ENTITY_TYPES.has(entity.dxfTypeName.toUpperCase())) {
        this.textObjectIds.add(entity.objectId);
      }
      if (!isBlockReference(entity)) return;

      if (parentPath.length === 0) {
        const normalized = canonicalBlockName(entity.blockName);
        const ids = this.directBlockObjectIds.get(normalized) ?? new Set<string>();
        ids.add(entity.objectId);
        this.directBlockObjectIds.set(normalized, ids);
      }
      const normalized = canonicalBlockName(entity.blockName);
      if (branch.has(normalized)) return;
      if (expandedDefinitions.has(normalized)) return;
      const record = entity.blockTableRecord ?? blockTable.getAt(entity.blockName);
      if (!record) return;
      expandedDefinitions.add(normalized);
      const nextBranch = new Set(branch);
      nextBranch.add(normalized);
      for (const child of record.newIterator()) visitBlockPath(child, path, nextBranch);
    };
    // Iterate the database once without materializing a second, potentially
    // 60k+ entity array beside MLightCAD's own model and scene structures.
    for (const entity of modelSpace.newIterator()) {
      counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
      visitBlockPath(entity, [], new Set());
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
    this.events.blocks.dispatch(this.currentBlocks);
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

  private createReorderPreview(objectIds: string[]): ReorderPreview | 'budget-exceeded' | null {
    const layout = this.view?.cadScene.modelSpaceLayout;
    if (!layout) return null;
    const mobile = this.renderQualityContext.mobile === true;
    const actionBudget = mobile ? MOBILE_REORDER_ACTION_BUDGET : DESKTOP_REORDER_ACTION_BUDGET;
    const totalBudget = mobile ? MOBILE_REORDER_TOTAL_BUDGET : DESKTOP_REORDER_TOTAL_BUDGET;
    const activeFragments = [...this.reorderPreviews.values()]
      .reduce((sum, preview) => sum + preview.fragmentCount, 0);
    const root = new Group();
    root.name = 'CadDrawOrderPreview';
    let fragmentCount = 0;
    const subsets: ReorderPreview['subsets'] = [];

    for (const objectId of objectIds) {
      for (const layer of layout.layers.values()) {
        if (!layer.hasEntity(objectId)) continue;
        const remaining = actionBudget - fragmentCount;
        if (remaining <= 0) {
          disposePreviewSubset(root);
          return 'budget-exceeded';
        }
        // Request one extra slot so truncated extraction is detected instead of
        // silently presenting only part of a complex INSERT/HATCH.
        const subset = layer.createPreviewSubset([objectId], {
          maxSlots: remaining + 1,
          missingEntity: 'skip',
        });
        if (!subset) continue;
        const added = subset.children.length;
        if (added > remaining || activeFragments + fragmentCount + added > totalBudget) {
          disposePreviewSubset(subset);
          disposePreviewSubset(root);
          return 'budget-exceeded';
        }
        fragmentCount += added;
        subsets.push({ root: subset, layerId: layer.name, objectId });
        root.add(subset);
      }
    }
    if (fragmentCount === 0) {
      disposePreviewSubset(root);
      return null;
    }

    root.traverse((object) => {
      object.userData.cadReorderLocalRenderOrder = object.renderOrder;
      for (const material of drawableMaterials(object)) {
        material.depthTest = false;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    });
    return { root, objectIds: [...objectIds], fragmentCount, subsets };
  }

  private refreshReorderPreviewOrders(): void {
    const apply = (groupKey: string, rank: number, tier: CadObjectDrawOrderTier) => {
      const preview = this.reorderPreviews.get(groupKey);
      if (!preview) return;
      preview.root.traverse((object) => {
        const local = Number(object.userData.cadReorderLocalRenderOrder ?? 0);
        object.renderOrder = rank + Math.max(-64, Math.min(64, local));
        for (const material of drawableMaterials(object)) {
          // Front previews deliberately ignore the source depth buffer. Back
          // previews remain depth-tested and receive a positive polygon offset,
          // so even transparent fills stay behind normal CAD geometry.
          material.depthTest = tier === 'back';
          material.depthWrite = false;
          material.polygonOffset = tier === 'back';
          material.polygonOffsetFactor = tier === 'back' ? 2 : 0;
          material.polygonOffsetUnits = tier === 'back' ? 2 : 0;
        }
      });
    };
    this.drawOrder.back.forEach((groupKey, index) => {
      apply(groupKey, -REORDER_RENDER_TIER - index * REORDER_RANK_STEP, 'back');
    });
    this.drawOrder.front.forEach((groupKey, index) => {
      apply(groupKey, REORDER_RENDER_TIER + index * REORDER_RANK_STEP, 'front');
    });
  }

  private previewObjectVisible(objectId: string): boolean {
    const entity = this.manager?.curDocument.database.tables.blockTable.getEntityById(objectId)
      ?? this.manager?.curDocument.database.getObjectById(objectId);
    if (!isCadEntity(entity)) return false;
    const layerVisible = this.layers.find((layer) => layer.id === entity.layer)?.visible ?? true;
    return layerVisible
      && !this.hiddenObjectIds.has(objectId)
      && !this.hiddenBlockObjectIds.has(objectId)
      && (this.textVisible || !this.textObjectIds.has(objectId));
  }

  private isSnapObjectVisible(
    objectId: string,
    temporarilyVisibleReorderedIds?: ReadonlySet<string>,
  ): boolean {
    if (
      this.hiddenObjectIds.has(objectId)
      || this.hiddenBlockObjectIds.has(objectId)
      || (this.reorderedObjectIds.has(objectId) && !temporarilyVisibleReorderedIds?.has(objectId))
    ) return false;
    if (this.view?.getEntityVisible?.(objectId) === false) return false;

    const entity = this.manager?.curDocument.database.tables.blockTable.getEntityById(objectId)
      ?? this.manager?.curDocument.database.getObjectById(objectId);
    if (!isCadEntity(entity)) return true;
    if (this.layers.find((layer) => layer.id === entity.layer)?.visible === false) return false;
    return this.textVisible || !TEXT_CONTROLLED_ENTITY_TYPES.has(entity.dxfTypeName.toUpperCase());
  }

  private refreshReorderPreviewVisibility(groupKey: string): void {
    const preview = this.reorderPreviews.get(groupKey);
    if (!preview) return;
    let anySubsetVisible = false;
    for (const subset of preview.subsets) {
      subset.root.visible = this.layers.find((layer) => layer.id === subset.layerId)?.visible ?? true;
      anySubsetVisible = anySubsetVisible || subset.root.visible;
    }
    preview.root.visible = anySubsetVisible
      && preview.objectIds.some((objectId) => this.previewObjectVisible(objectId));
  }

  private refreshAllReorderPreviewVisibility(): void {
    for (const groupKey of this.reorderPreviews.keys()) this.refreshReorderPreviewVisibility(groupKey);
    if (this.view) this.view.isDirty = true;
  }

  private disposeReorderPreviews(): void {
    for (const preview of this.reorderPreviews.values()) {
      preview.root.removeFromParent();
      disposePreviewSubset(preview.root);
    }
    this.reorderPreviews.clear();
    this.reorderedObjectIds.clear();
  }

  private pickReorderSnapCandidates(
    view: AcTrView2d,
    clientPoint: { x: number; y: number },
  ): string[] {
    if (this.reorderPreviews.size === 0) return [];
    const rect = view.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];
    this.previewPointer.set(
      ((clientPoint.x - rect.left) / rect.width) * 2 - 1,
      -((clientPoint.y - rect.top) / rect.height) * 2 + 1,
    );
    const threshold = readCadCamera(view).resolution * MEASUREMENT_SNAP_RADIUS_PX;
    this.previewRaycaster.params.Line = { threshold };
    this.previewRaycaster.params.Points = { threshold };
    this.previewRaycaster.setFromCamera(this.previewPointer, view.internalCamera);

    const candidates: string[] = [];
    const seen = new Set<string>();
    const keys = [...this.drawOrder.front].reverse().concat(this.drawOrder.back);
    for (const groupKey of keys) {
      const preview = this.reorderPreviews.get(groupKey);
      if (!preview?.root.visible) continue;
      for (const subset of preview.subsets) {
        if (
          seen.has(subset.objectId)
          || !subset.root.visible
          || !this.previewObjectVisible(subset.objectId)
        ) continue;
        if (this.previewRaycaster.intersectObject(subset.root, true).length === 0) continue;
        seen.add(subset.objectId);
        candidates.push(subset.objectId);
        if (candidates.length >= REORDER_SNAP_CANDIDATE_LIMIT) return candidates;
      }
    }
    return candidates;
  }

  private pickReorderPreview(
    view: AcTrView2d,
    clientPoint: { x: number; y: number },
    tier: CadObjectDrawOrderTier,
  ): string | null {
    const rect = view.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.previewPointer.set(
      ((clientPoint.x - rect.left) / rect.width) * 2 - 1,
      -((clientPoint.y - rect.top) / rect.height) * 2 + 1,
    );
    const threshold = readCadCamera(view).resolution * MOBILE_SELECTION_RADIUS_PX;
    this.previewRaycaster.params.Line = { threshold };
    this.previewRaycaster.params.Points = { threshold };
    this.previewRaycaster.setFromCamera(this.previewPointer, view.internalCamera);
    const keys = tier === 'front' ? [...this.drawOrder.front].reverse() : [...this.drawOrder.back];
    for (const groupKey of keys) {
      const preview = this.reorderPreviews.get(groupKey);
      if (!preview?.root.visible) continue;
      if (this.previewRaycaster.intersectObject(preview.root, true).length > 0) {
        return preview.objectIds[0] ?? null;
      }
    }
    return null;
  }

  private describeObject(objectId: string): SelectedCadObject | null {
    const entity = this.manager?.curDocument.database.tables.blockTable.getEntityById(objectId)
      ?? this.manager?.curDocument.database.getObjectById(objectId);
    if (!isCadEntity(entity)) return null;
    const blockPath = this.objectBlockPaths.get(objectId)
      ?? (isBlockReference(entity) ? [entity.blockName] : []);
    return {
      featureId: objectId,
      objectKey: createCadObjectKey(objectId, blockPath),
      drawOrderGroupKey: this.drawOrderKeyByObjectId.get(objectId)
        ?? (isBlockReference(entity)
          ? createCadObjectKey(objectId, [])
          : createCadDrawOrderGroupKey(objectId, blockPath)),
      layerId: entity.layer,
      cadType: entity.dxfTypeName,
      label: '',
      blockPath,
    };
  }

  private applyObjectVisibility(objectId: string): void {
    const shouldShow = !this.reorderedObjectIds.has(objectId)
      && !this.hiddenObjectIds.has(objectId)
      && !this.hiddenBlockObjectIds.has(objectId)
      && (this.textVisible || !this.textObjectIds.has(objectId));
    this.view?.setEntitySceneVisible(objectId, shouldShow);
  }

  private applyRenderedTextVisibility(objectId: string): void {
    const visible = !this.reorderedObjectIds.has(objectId)
      && this.textVisible
      && !this.hiddenObjectIds.has(objectId)
      && !this.hiddenBlockObjectIds.has(objectId);
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
