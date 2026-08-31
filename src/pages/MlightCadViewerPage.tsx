import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { transform } from 'ol/proj';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../components/AppHeader';
import { BlockSheet } from '../components/BlockSheet';
import { createBlockSheetItems, createBlockSheetLabels } from '../components/blockSheetModel';
import { BottomSheet } from '../components/BottomSheet';
import { CadSettingsSheet } from '../components/CadSettingsSheet';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { DwgControlSheet } from '../components/DwgControlSheet';
import { DwgPreparationSheet } from '../components/DwgPreparationSheet';
import { DistanceMeasurementSheet } from '../components/DistanceMeasurementSheet';
import { LayerSheet } from '../components/LayerSheet';
import { createLayerSheetItems, createLayerSheetLabels, isLayerHidden, layerIdentityMatches, mergeLoadedLayerSheetLayers } from '../components/layerSheetModel';
import { MapActionControls } from '../components/MapActionControls';
import { MapCenterCrosshair } from '../components/MapCenterCrosshair';
import { MapLocationMenu, type ScreenPoint } from '../components/MapLocationMenu';
import { MapStatusBadges } from '../components/MapStatusBadges';
import { MlightCadCanvas } from '../components/MlightCadCanvas';
import { MlightCadMap, type MlightCadMapHandle } from '../components/MlightCadMap';
import { SelectionPanel } from '../components/SelectionPanel';
import { SiteBanner } from '../components/SiteBanner';
import { useLocationTracking } from '../hooks/useLocationTracking';
import {
  browserPreflightDevice,
  clearDwgImportMarker,
  markDwgImportStarted,
  type DwgImportRecoveryMarker,
} from '../lib/cad/importRecovery';
import type { CadLoadProfile, CadOverlayBlock, DwgPreflightReport } from '../lib/cad/preflightTypes';
import { isUnreadableFileError } from '../lib/fileAccessError';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import { DEFAULT_MLIGHTCAD_OPACITY } from '../lib/mlightcad/opacity';
import type { MlightCadCamera, MlightCadLoadOptions, MlightCadPreparationResult, MlightCadProgress, MlightCadReady } from '../lib/mlightcad/types';
import { useCadSession } from '../session/CadSessionContext';
import type { CadOverlayLayer, LurefCoordinate, MeasurementPoint, SelectedCadObject } from '../types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
type DrawerState = 'blocks' | 'settings' | 'dwg' | 'object' | 'prepare' | 'prepare-failed' | null;
type LayerSheetMode = 'loaded' | 'preparation' | null;
interface MapContextTarget {
  coordinate: LurefCoordinate;
  anchor: ScreenPoint;
  presentation: 'desktop' | 'mobile';
}
const MLIGHTCAD_SNAP_AFTER_COORDINATE_DELAY_MS = 20;
const DESKTOP_HOVER_SNAP_DELAY_MS = 40;
const DESKTOP_CLICK_MOVE_TOLERANCE_PX = 5;
const MOBILE_CONTEXT_HOLD_MS = 550;
const MOBILE_CONTEXT_MOVE_TOLERANCE_PX = 10;
const MOBILE_CONTEXT_SELECTION_SUPPRESSION_MS = 250;

function isDesktopMeasurementPointer(event: ReactPointerEvent<HTMLElement>): boolean {
  return event.pointerType === 'mouse'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function isMapSurfaceTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-map-surface]'));
}

function progressLabel(progress: MlightCadProgress, t: (key: string) => string): string {
  const phase = progress.detail === 'finalizing' ? t('mlightProgress.finalizing') : t(`mlightProgress.${progress.phase}`);
  return progress.percentage === null ? phase : `${phase} · ${progress.percentage}%`;
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && (error.name === 'AbortError' || error.message === 'MLIGHTCAD_IMPORT_CANCELLED'));
}

export default function MlightCadViewerPage() {
  const { t } = useTranslation();
  const session = useCadSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const xrefInput = useRef<HTMLInputElement>(null);
  const pointerActive = useRef(false);
  const desktopFinePointer = useRef(
    typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  const preparationResolver = useRef<((decision: MlightCadPreparationResult) => void) | null>(null);
  const activeImportMarker = useRef<DwgImportRecoveryMarker | null>(null);
  const preflightReceived = useRef(false);
  const previousFile = useRef<File | null>(null);
  const latestCamera = useRef<MlightCadCamera | null>(null);
  const mapCanvas = useRef<MlightCadMapHandle>(null);
  const snapPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopHoverPoint = useRef<{ x: number; y: number } | null>(null);
  const desktopMeasurementPointer = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const longPressPointer = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const activeTouchPointers = useRef(new Set<number>());
  const contextLongPressFired = useRef<number | null>(null);
  const suppressCadSelection = useRef(false);
  const dragEnterDepth = useRef(0);
  const cameraToRestore = useRef<MlightCadCamera | null>(null);
  const locallyAppliedDrawOrderAdapter = useRef<MlightCadViewerAdapter | null>(null);
  const [adapter, setAdapter] = useState<MlightCadViewerAdapter | null>(null);
  const [layers, setLayers] = useState<CadOverlayLayer[]>([]);
  const [blocks, setBlocks] = useState<CadOverlayBlock[]>([]);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [drawOrderMessageKey, setDrawOrderMessageKey] = useState<string | null>(null);
  const [entityCount, setEntityCount] = useState(0);
  const [opacity, setOpacity] = useState(DEFAULT_MLIGHTCAD_OPACITY);
  const [importState, setImportState] = useState<ImportState>(session.file ? 'loading' : 'idle');
  const [progress, setProgress] = useState<MlightCadProgress>({ phase: 'workers', percentage: null });
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<DrawerState>(() => (
    !session.file && session.distanceMeasurement.phase === 'inactive' ? 'dwg' : null
  ));
  const [layerSheetMode, setLayerSheetMode] = useState<LayerSheetMode>(null);
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [snapPreview, setSnapPreview] = useState<MeasurementPoint | null>(null);
  const [preparationReport, setPreparationReport] = useState<DwgPreflightReport | null>(session.preflightReport);
  const [pendingProfile, setPendingProfile] = useState<CadLoadProfile | null>(null);
  const [blockReturnToPreparation, setBlockReturnToPreparation] = useState(false);
  const [blockReloadPending, setBlockReloadPending] = useState(false);
  const [layerReloadPending, setLayerReloadPending] = useState(false);
  const [basemapSuspended, setBasemapSuspended] = useState(false);
  const [mapContextTarget, setMapContextTarget] = useState<MapContextTarget | null>(null);
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null);
  const [dwgDragActive, setDwgDragActive] = useState(false);

  useEffect(() => {
    session.setBasemapHealthSuspended(basemapSuspended);
    return () => session.setBasemapHealthSuspended(false);
  }, [basemapSuspended, session.setBasemapHealthSuspended]);
  const [forceFullAttempt, setForceFullAttempt] = useState(false);
  const location = useLocationTracking();
  const measurementActive = session.distanceMeasurement.phase !== 'inactive';

  useEffect(() => {
    if (session.recoveryMarker) setMessageKey('importRecovery');
  }, [session.recoveryMarker]);

  useEffect(() => () => {
    clearDwgImportMarker(activeImportMarker.current);
    activeImportMarker.current = null;
    if (desktopHoverTimer.current !== null) clearTimeout(desktopHoverTimer.current);
    desktopHoverTimer.current = null;
    desktopHoverPoint.current = null;
    desktopMeasurementPointer.current = null;
    if (longPressPointer.current) clearTimeout(longPressPointer.current.timer);
    longPressPointer.current = null;
    activeTouchPointers.current.clear();
  }, []);

  useEffect(() => {
    if (location.state.error === 'denied') setMessageKey('locationDenied');
    if (location.state.error === 'unavailable') setMessageKey('locationUnavailable');
    if (location.state.error === 'error') setMessageKey('locationError');
  }, [location.state.error]);

  useEffect(() => {
    const file = session.file;
    preflightReceived.current = false;
    if (file) {
      const newFile = previousFile.current !== file;
      previousFile.current = file;
      clearDwgImportMarker(activeImportMarker.current);
      activeImportMarker.current = markDwgImportStarted(file);
      setImportState('loading');
      setProgress({ phase: 'workers', percentage: null });
      setMessageKey(null);
      setSelection(null);
      if (newFile) {
        setLayers([]); setBlocks([]); setEntityCount(0); setPreparationReport(null); setPendingProfile(null);
        setBlockReloadPending(false); setLayerReloadPending(false); setForceFullAttempt(false);
        latestCamera.current = null; cameraToRestore.current = null;
      }
      return;
    }
    previousFile.current = null;
    clearDwgImportMarker(activeImportMarker.current);
    activeImportMarker.current = null;
    setImportState('idle'); setMessageKey(null); setSelection(null); setLayers([]); setBlocks([]); setEntityCount(0);
    setPreparationReport(null); setPendingProfile(null); setBlockReloadPending(false); setLayerReloadPending(false); setBasemapSuspended(false);
  }, [session.file, session.fileRevision]);

  useEffect(() => {
    if (!adapter || importState !== 'ready') return;
    adapter.setTextsVisible(session.cadTextVisible);
    for (const objectKey of session.hiddenObjectIds) adapter.hideObjectByKey(objectKey);
    const restore = cameraToRestore.current;
    if (restore) { cameraToRestore.current = null; adapter.setCamera(restore); }
  }, [adapter, importState, session.cadTextVisible, session.hiddenObjectIds]);

  useEffect(() => {
    if (!adapter || importState !== 'ready') return;
    if (locallyAppliedDrawOrderAdapter.current === adapter) {
      locallyAppliedDrawOrderAdapter.current = null;
      return;
    }
    locallyAppliedDrawOrderAdapter.current = null;
    const result = adapter.applyObjectDrawOrder(session.objectDrawOrder);
    if (result === 'applied') setDrawOrderMessageKey(null);
    else if (result === 'budget-exceeded') setDrawOrderMessageKey('drawOrderBudgetExceeded');
    else if (result === 'not-found' && (session.objectDrawOrder.front.length || session.objectDrawOrder.back.length)) {
      setDrawOrderMessageKey('drawOrderUnavailable');
    }
  }, [adapter, importState, session.objectDrawOrder]);

  useEffect(() => {
    if (!adapter || importState !== 'ready') return;
    adapter.setMeasurementCaptureActive(measurementActive);
    return () => adapter.setMeasurementCaptureActive(false);
  }, [adapter, importState, measurementActive]);

  useEffect(() => {
    if (!adapter || importState !== 'ready') return;
    const measurement = session.distanceMeasurement;
    const first = measurement.phase === 'placing-second' || measurement.phase === 'complete'
      ? measurement.firstPoint.coordinate
      : null;
    const second = measurement.phase === 'complete'
      ? measurement.secondPoint.coordinate
      : null;
    adapter.setMeasurementOverlay(first, second);
  }, [adapter, importState, session.distanceMeasurement]);

  useEffect(() => {
    if (snapPreviewTimer.current !== null) {
      clearTimeout(snapPreviewTimer.current);
      snapPreviewTimer.current = null;
    }
    if (
      !adapter
      || importState !== 'ready'
      || desktopFinePointer.current
      || !measurementActive
      || session.distanceMeasurement.phase === 'complete'
      || !session.distanceMeasurement.snapEnabled
    ) {
      setSnapPreview(null);
      adapter?.setSnapPreview(null);
      return;
    }
    // `coordinate` is published only after camera movement settles. Native
    // OSNAP therefore never enters the synchronous CAD -> map camera hotpath.
    snapPreviewTimer.current = setTimeout(() => {
      snapPreviewTimer.current = null;
      const candidate = adapter.resolveAimPoint(true);
      const nextPreview = candidate?.source === 'cad-snap' ? candidate : null;
      setSnapPreview(nextPreview);
      adapter.setSnapPreview(nextPreview);
    }, MLIGHTCAD_SNAP_AFTER_COORDINATE_DELAY_MS);
    return () => {
      if (snapPreviewTimer.current !== null) clearTimeout(snapPreviewTimer.current);
      snapPreviewTimer.current = null;
    };
  }, [adapter, coordinate, importState, measurementActive, session.distanceMeasurement.phase, session.distanceMeasurement.snapEnabled]);

  useEffect(() => {
    if (!adapter || importState !== 'ready' || location.state.follow !== 'following' || !location.state.position) return;
    const center = transform([location.state.position.coords.longitude, location.state.position.coords.latitude], 'EPSG:4326', 'EPSG:2169');
    adapter.centerOn([center[0], center[1]]);
  }, [adapter, importState, location.state.follow, location.state.position]);

  const requestPreparation = (report: DwgPreflightReport): Promise<MlightCadPreparationResult> => {
    preflightReceived.current = true;
    session.setPreflightReport(report); setPreparationReport(report); setPendingProfile(report.recommendedProfile);
    setBlockReturnToPreparation(false); setBasemapSuspended(report.risk.level === 'high'); setDrawerState('prepare');
    if (session.annotationScaleId == null) {
      session.setAnnotationScaleId(report.annotationScale?.selectedScaleId ?? report.annotationScale?.savedScaleId ?? null);
    }
    return new Promise((resolve) => { preparationResolver.current = resolve; });
  };

  const finishPreparation = (decision: MlightCadPreparationResult) => {
    const resolver = preparationResolver.current;
    const configured = decision.decision === 'cancel' ? decision : {
      ...decision,
      annotationScaleId: session.annotationScaleId
        ?? preparationReport?.annotationScale?.selectedScaleId
        ?? preparationReport?.annotationScale?.savedScaleId
        ?? null,
      spatialFilterEnabled: session.spatialFilterEnabled,
    };
    const resolved = configured.decision === 'filtered' && !configured.profile && preparationReport
      ? { ...configured, profile: preparationReport.recommendedProfile } : configured;
    if (resolved.decision === 'filtered' && resolved.profile) session.setLoadProfile(resolved.profile);
    if (resolved.decision === 'full') session.resetLoadProfile();
    resolver?.(resolved); preparationResolver.current = null;
    setDrawerState(null); setBlockReturnToPreparation(false);
    if (!resolver && decision.decision !== 'cancel' && session.file) {
      cameraToRestore.current = latestCamera.current;
      session.reloadFile();
    }
  };

  const openPreparation = () => {
    const report = session.preflightReport;
    if (!report) return;
    preparationResolver.current = null;
    setPreparationReport(report);
    setPendingProfile(session.loadProfile.mode === 'filtered' ? session.loadProfile : report.recommendedProfile);
    setBlockReturnToPreparation(false);
    setDrawerState('prepare');
  };

  const chooseFile = () => fileInput.current?.click();
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setMessageKey('invalidFile'); if (fileInput.current) fileInput.current.value = ''; return;
    }
    cameraToRestore.current = null; setBlockReloadPending(false); setLayerReloadPending(false); session.setFile(file); setDrawerState('dwg');
    if (fileInput.current) fileInput.current.value = '';
  };
  const handleXrefFiles = (files: FileList | null) => {
    const dwgFiles = [...(files ?? [])].filter((file) => file.name.toLocaleLowerCase('en-US').endsWith('.dwg'));
    if (dwgFiles.length) {
      cameraToRestore.current = latestCamera.current;
      setDrawerState(null);
      session.addXrefFiles(dwgFiles);
    }
    if (xrefInput.current) xrefInput.current.value = '';
  };

  const handleProgress = (next: MlightCadProgress) => { setProgress(next); if (next.phase !== 'ready') setImportState('loading'); };
  const handlePreflight = (report: DwgPreflightReport) => {
    preflightReceived.current = true; session.setPreflightReport(report); setPreparationReport(report);
  };
  const handleReady = (ready: MlightCadReady) => {
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    session.clearRecoveryPreparationRequirement(); setBasemapSuspended(false); setLayers(ready.layers ?? []); setBlocks(ready.blocks ?? []); setEntityCount(ready.entityCount);
    if (ready.preflight) { session.setPreflightReport(ready.preflight); setPreparationReport(ready.preflight); }
    setImportState('ready'); setMessageKey(null); setForceFullAttempt(false); setBlockReloadPending(false); setLayerReloadPending(false);
  };
  const handleError = (error: unknown) => {
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    session.clearRecoveryPreparationRequirement(); setBasemapSuspended(false); console.error('MLightCAD import failed', error);
    if (isAbortError(error)) { setImportState('cancelled'); setMessageKey('importCancelled'); setDrawerState('dwg'); return; }
    setImportState('error');
    if (!preflightReceived.current && !(error instanceof Error && error.message === 'MLIGHTCAD_WORKERS_UNAVAILABLE') && !isUnreadableFileError(error)) {
      setMessageKey(null); setDrawerState('prepare-failed'); return;
    }
    setDrawerState('dwg');
    setMessageKey(error instanceof Error && error.message === 'MLIGHTCAD_WORKERS_UNAVAILABLE'
      ? 'mlightWorkersUnavailable' : isUnreadableFileError(error) ? 'fileNotReadable' : 'importFailed');
  };

  const cancelImport = () => {
    preparationResolver.current?.({ decision: 'cancel' }); preparationResolver.current = null; void adapter?.cancel();
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    session.clearRecoveryPreparationRequirement(); setBasemapSuspended(false); setImportState('cancelled'); setMessageKey('importCancelled'); setDrawerState('dwg');
  };
  const removeDwg = () => {
    preparationResolver.current?.({ decision: 'cancel' }); preparationResolver.current = null; void adapter?.cancel();
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    setBlockReloadPending(false); setLayerReloadPending(false); session.clearFile();
  };

  const handleSelection = (next: SelectedCadObject | null) => {
    if (measurementActive || suppressCadSelection.current) {
      if (next) adapter?.clearSelection();
      return;
    }
    setSelection(next); setDrawOrderMessageKey(null); if (next) setDrawerState('object'); else setDrawerState((current) => current === 'object' ? null : current);
  };
  const closeSelection = () => { adapter?.clearSelection(); setSelection(null); setDrawerState(null); };
  const hideSelectedObject = () => {
    if (!selection || !adapter) return;
    adapter.hideObject(selection.featureId); session.setObjectHidden(selection.objectKey, true); setSelection(null); setDrawerState(null);
  };
  const hideSelectedLayer = () => {
    if (!selection || !adapter) return;
    adapter.setLayerVisible(selection.layerId, false); session.setLayerProfileVisible(selection.layerId, false); adapter.clearSelection();
    setSelection(null); setDrawerState(null);
  };
  const setSelectedDrawOrder = (tier: 'front' | 'back') => {
    if (!selection || !adapter) return;
    const result = adapter.setObjectDrawOrder(selection.drawOrderGroupKey, tier);
    if (result === 'applied') {
      // The active adapter already applied this interaction once. Mark it so
      // the session persistence effect does not rebuild the same preview a
      // second time; a new adapter still replays the complete session order.
      locallyAppliedDrawOrderAdapter.current = adapter;
      session.setObjectDrawOrder(selection.drawOrderGroupKey, tier);
      setDrawOrderMessageKey(null);
      return;
    }
    setDrawOrderMessageKey(result === 'budget-exceeded'
      ? 'drawOrderBudgetExceeded'
      : 'drawOrderUnavailable');
  };

  const displayedBlocks = preparationReport && blockReturnToPreparation
    ? preparationReport.blocks : (blocks.length ? blocks : session.preflightReport?.blocks ?? []);
  const activeProfile = blockReturnToPreparation ? pendingProfile : session.loadProfile;
  const blockItems = useMemo(() => createBlockSheetItems(
    displayedBlocks, activeProfile ?? session.loadProfile,
    preparationReport?.risk.deviceBudget ?? session.preflightReport?.risk.deviceBudget ?? 150_000,
  ), [activeProfile, displayedBlocks, preparationReport?.risk.deviceBudget, session.loadProfile, session.preflightReport?.risk.deviceBudget]);
  const blockSheetLabels = useMemo(() => createBlockSheetLabels(t), [t]);

  const setBlockVisible = (id: string, visible: boolean) => {
    const block = displayedBlocks.find((candidate) => candidate.id === id); if (!block) return;
    if (blockReturnToPreparation) {
      setPendingProfile((current) => {
        if (!current) return current;
        const canonical = block.name.toLocaleLowerCase('en-US');
        const hidden = current.hiddenBlockNames.some((name) => name.toLocaleLowerCase('en-US') === canonical);
        return { ...current, mode: 'filtered', hiddenBlockNames: visible
          ? current.hiddenBlockNames.filter((name) => name.toLocaleLowerCase('en-US') !== canonical)
          : hidden ? current.hiddenBlockNames : [...current.hiddenBlockNames, block.name] };
      });
      return;
    }
    session.setBlockProfileVisible(block.name, visible);
    const reloadRequired = adapter?.setBlockVisible(block.name, visible) ?? true;
    setBlocks((current) => current.map((candidate) => candidate.id === id ? { ...candidate, visible } : candidate));
    if (reloadRequired || block.isNested || session.loadProfile.mode === 'filtered') setBlockReloadPending(true);
  };
  const setAllBlocks = (visible: boolean) => {
    if (blockReturnToPreparation) {
      setPendingProfile((current) => current ? { ...current, mode: 'filtered', hiddenBlockNames: visible ? [] : displayedBlocks.map((block) => block.name) } : current);
      return;
    }
    let reloadRequired = false;
    for (const block of displayedBlocks) {
      session.setBlockProfileVisible(block.name, visible);
      reloadRequired = (adapter?.setBlockVisible(block.name, visible) ?? true) || reloadRequired;
    }
    setBlocks((current) => current.map((block) => ({ ...block, visible })));
    if (reloadRequired || session.loadProfile.mode === 'filtered') setBlockReloadPending(true);
  };
  const hideSelectedBlock = () => {
    const name = selection?.blockPath.at(-1); const block = displayedBlocks.find((candidate) => candidate.name === name || candidate.id === name);
    if (!block) return; setBlockVisible(block.id, false); adapter?.clearSelection(); setSelection(null); setDrawerState(null);
  };

  const captureCameraForReload = () => { cameraToRestore.current = latestCamera.current; };
  const applyBlockChanges = () => { captureCameraForReload(); setBlockReloadPending(false); session.reloadFile(); };
  const restoreHiddenObjects = () => {
    adapter?.restoreHiddenObjects();
    session.restoreHiddenObjects();
  };
  const restoreHiddenLayers = () => {
    const reloadRequired = session.loadProfile.hiddenLayerIds.length > 0;
    adapter?.setAllLayersVisible(true);
    session.restoreHiddenLayers();
    setLayers((current) => current.map((layer) => ({ ...layer, visible: true })));
    setLayerReloadPending(false);
    if (reloadRequired) { captureCameraForReload(); session.reloadFile(); }
  };
  const restoreHiddenBlocks = () => {
    const reloadRequired = session.loadProfile.hiddenBlockNames.length > 0;
    for (const block of displayedBlocks) adapter?.setBlockVisible(block.name, true);
    session.restoreHiddenBlocks();
    setBlocks((current) => current.map((block) => ({ ...block, visible: true })));
    setBlockReloadPending(false);
    if (reloadRequired) { captureCameraForReload(); session.reloadFile(); }
  };
  const toggleTexts = () => {
    const visible = !session.cadTextVisible; session.setCadTextVisible(visible); adapter?.setTextsVisible(visible);
  };

  const setLayerVisible = (layerId: string, visible: boolean) => {
    if (layerSheetMode === 'preparation') {
      setPendingProfile((current) => current ? {
        ...current,
        mode: 'filtered',
        hiddenLayerIds: visible
          ? current.hiddenLayerIds.filter((id) => id !== layerId)
          : current.hiddenLayerIds.includes(layerId) ? current.hiddenLayerIds : [...current.hiddenLayerIds, layerId],
      } : current);
      return;
    }
    const reportLayer = session.preflightReport?.layers.find((candidate) => layerIdentityMatches(candidate, layerId));
    const layer = layers.find((candidate) => (
      layerIdentityMatches(candidate, layerId)
      || Boolean(reportLayer && (layerIdentityMatches(candidate, reportLayer.id) || layerIdentityMatches(candidate, reportLayer.name)))
    ));
    const profileLayer = reportLayer ?? layer;
    if (!profileLayer) return;
    const wasFiltered = isLayerHidden(profileLayer, session.loadProfile.hiddenLayerIds);
    session.setLayerProfileVisible(profileLayer.id, visible);
    if (visible && profileLayer.name !== profileLayer.id) session.setLayerProfileVisible(profileLayer.name, true);
    if (layer) {
      adapter?.setLayerVisible(layer.id, visible);
      setLayers((current) => current.map((candidate) => layerIdentityMatches(candidate, layer.id) ? { ...candidate, visible } : candidate));
    }
    if (visible && wasFiltered) setLayerReloadPending(true);
  };
  const setAllLayers = (visible: boolean) => {
    if (layerSheetMode === 'preparation') {
      setPendingProfile((current) => current ? { ...current, mode: 'filtered', hiddenLayerIds: visible ? [] : (preparationReport?.layers.map((layer) => layer.id) ?? []) } : current);
      return;
    }
    const reloadRequired = visible && session.loadProfile.hiddenLayerIds.length > 0;
    for (const layer of session.preflightReport?.layers ?? layers) session.setLayerProfileVisible(layer.id, visible);
    adapter?.setAllLayersVisible(visible);
    if (reloadRequired) setLayerReloadPending(true);
  };
  const locationAction = () => {
    if (location.state.follow === 'off') location.start(); else if (location.state.follow === 'paused') location.resume(); else location.stop();
  };
  const clearSnapPreview = () => {
    if (snapPreviewTimer.current !== null) clearTimeout(snapPreviewTimer.current);
    snapPreviewTimer.current = null;
    if (desktopHoverTimer.current !== null) clearTimeout(desktopHoverTimer.current);
    desktopHoverTimer.current = null;
    desktopHoverPoint.current = null;
    setSnapPreview(null);
    adapter?.setSnapPreview(null);
  };
  const closeMeasurement = () => {
    clearSnapPreview();
    session.cancelMeasurement();
  };
  const toggleMeasurement = () => {
    if (measurementActive) {
      closeMeasurement();
      return;
    }
    adapter?.clearSelection();
    setSelection(null);
    setDrawerState(null);
    setLayerSheetMode(null);
    session.startMeasurement();
  };
  const setMeasurementPoint = () => {
    const point = adapter && importState === 'ready'
      ? adapter.resolveAimPoint(session.distanceMeasurement.snapEnabled)
      : mapCanvas.current?.resolveAimPoint() ?? null;
    if (!point) return;
    session.commitMeasurementPoint(point);
    clearSnapPreview();
  };
  const restartMeasurement = () => {
    clearSnapPreview();
    session.restartMeasurement();
  };
  const scheduleDesktopHoverSnap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !isDesktopMeasurementPointer(event)
      || pointerActive.current
      || !measurementActive
      || session.distanceMeasurement.phase === 'complete'
      || !session.distanceMeasurement.snapEnabled
      || !adapter
      || importState !== 'ready'
    ) return;
    desktopHoverPoint.current = { x: event.clientX, y: event.clientY };
    if (desktopHoverTimer.current !== null) return;
    desktopHoverTimer.current = setTimeout(() => {
      desktopHoverTimer.current = null;
      const clientPoint = desktopHoverPoint.current;
      if (!clientPoint) return;
      const point = adapter.resolveScreenPoint(clientPoint, true);
      const nextPreview = point?.source === 'cad-snap' ? point : null;
      setSnapPreview(nextPreview);
      adapter.setSnapPreview(nextPreview);
    }, DESKTOP_HOVER_SNAP_DELAY_MS);
  };
  const handleCadPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerActive.current = true;
    if (measurementActive) clearSnapPreview();
    desktopMeasurementPointer.current = measurementActive
      && session.distanceMeasurement.phase !== 'complete'
      && event.button === 0
      && isDesktopMeasurementPointer(event)
      ? {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        }
      : null;
  };
  const handleCadPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const capture = desktopMeasurementPointer.current;
    if (capture?.pointerId === event.pointerId) {
      const dx = event.clientX - capture.startX;
      const dy = event.clientY - capture.startY;
      if (dx * dx + dy * dy > DESKTOP_CLICK_MOVE_TOLERANCE_PX ** 2) capture.moved = true;
    }
    if (pointerActive.current) {
      location.pause();
      return;
    }
    scheduleDesktopHoverSnap(event);
  };
  const handleCadPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const capture = desktopMeasurementPointer.current;
    desktopMeasurementPointer.current = null;
    pointerActive.current = false;
    if (
      !capture
      || capture.pointerId !== event.pointerId
      || capture.moved
      || !measurementActive
      || session.distanceMeasurement.phase === 'complete'
      || !adapter
      || importState !== 'ready'
    ) return;
    const point = adapter.resolveScreenPoint(
      { x: event.clientX, y: event.clientY },
      session.distanceMeasurement.snapEnabled,
    );
    if (!point) return;
    session.commitMeasurementPoint(point);
    clearSnapPreview();
  };
  const handleCadPointerCancel = () => {
    pointerActive.current = false;
    desktopMeasurementPointer.current = null;
  };

  const closeMapContext = useCallback(() => setMapContextTarget(null), []);
  const resolveMapContextCoordinate = (point: ScreenPoint): LurefCoordinate | null => {
    const cadPoint = adapter && importState === 'ready'
      ? adapter.resolveScreenPoint(point, false)?.coordinate
      : null;
    return cadPoint ?? mapCanvas.current?.resolveScreenCoordinate(point) ?? null;
  };
  const openMapContext = (point: ScreenPoint, presentation: MapContextTarget['presentation']) => {
    if (measurementActive) return;
    const nextCoordinate = resolveMapContextCoordinate(point);
    if (!nextCoordinate) return;
    adapter?.clearSelection();
    setSelection(null);
    setMapContextTarget({ coordinate: nextCoordinate, anchor: point, presentation });
  };
  const clearLongPress = (pointerId?: number) => {
    const pending = longPressPointer.current;
    if (!pending || (pointerId !== undefined && pending.pointerId !== pointerId)) return;
    clearTimeout(pending.timer);
    longPressPointer.current = null;
  };
  const handlePagePointerDownCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    activeTouchPointers.current.add(event.pointerId);
    clearLongPress();
    if (
      activeTouchPointers.current.size !== 1
      || measurementActive
      || !isMapSurfaceTarget(event.target)
    ) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const timer = setTimeout(() => {
      const pending = longPressPointer.current;
      if (!pending || pending.pointerId !== pointerId || activeTouchPointers.current.size !== 1) return;
      longPressPointer.current = null;
      contextLongPressFired.current = pointerId;
      suppressCadSelection.current = true;
      openMapContext({ x: startX, y: startY }, 'mobile');
    }, MOBILE_CONTEXT_HOLD_MS);
    longPressPointer.current = { pointerId, startX, startY, timer };
  };
  const handlePagePointerMoveCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const pending = longPressPointer.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const dx = event.clientX - pending.startX;
    const dy = event.clientY - pending.startY;
    if (dx * dx + dy * dy > MOBILE_CONTEXT_MOVE_TOLERANCE_PX ** 2) clearLongPress(event.pointerId);
  };
  const finishTouchPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    activeTouchPointers.current.delete(event.pointerId);
    clearLongPress(event.pointerId);
    if (contextLongPressFired.current !== event.pointerId) return;
    contextLongPressFired.current = null;
    setTimeout(() => {
      suppressCadSelection.current = false;
      adapter?.clearSelection();
      setSelection(null);
    }, MOBILE_CONTEXT_SELECTION_SUPPRESSION_MS);
  };
  const handleMapContextMenu = (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
    if (!isMapSurfaceTarget(event.target)) return;
    event.preventDefault();
    if (!desktopFinePointer.current || measurementActive) return;
    openMapContext({ x: event.clientX, y: event.clientY }, 'desktop');
  };
  const isFileDrag = (event: ReactDragEvent<HTMLElement>) => (
    desktopFinePointer.current && Array.from(event.dataTransfer.types).includes('Files')
  );
  const handleDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    if (!isFileDrag(event) || (!dwgDragActive && !isMapSurfaceTarget(event.target))) return;
    event.preventDefault();
    dragEnterDepth.current += 1;
    setDwgDragActive(true);
  };
  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!isFileDrag(event) || (!dwgDragActive && !isMapSurfaceTarget(event.target))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (!isFileDrag(event) || dragEnterDepth.current === 0) return;
    dragEnterDepth.current = Math.max(0, dragEnterDepth.current - 1);
    if (dragEnterDepth.current === 0) setDwgDragActive(false);
  };
  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    if (!isMapSurfaceTarget(event.target)) {
      if (dwgDragActive) event.preventDefault();
      dragEnterDepth.current = 0;
      setDwgDragActive(false);
      return;
    }
    event.preventDefault();
    dragEnterDepth.current = 0;
    setDwgDragActive(false);
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      setMessageKey('dwgDrop.singleFile');
      setDrawerState('dwg');
      return;
    }
    const [file] = files;
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.dwg')) {
      setMessageKey('invalidFile');
      setDrawerState('dwg');
      return;
    }
    closeMapContext();
    if (session.file) setPendingDroppedFile(file);
    else handleFile(file);
  };

  useEffect(() => {
    if (!mapContextTarget) return;
    const closeOnViewportChange = () => closeMapContext();
    window.addEventListener('resize', closeOnViewportChange);
    return () => window.removeEventListener('resize', closeOnViewportChange);
  }, [closeMapContext, mapContextTarget]);

  useEffect(() => {
    if (drawerState || layerSheetMode || measurementActive) closeMapContext();
  }, [closeMapContext, drawerState, layerSheetMode, measurementActive]);

  const layerSheetLayers = useMemo(() => layerSheetMode === 'preparation'
    ? (preparationReport?.layers.map((layer) => ({ id: layer.id, name: layer.name, visible: !(pendingProfile?.hiddenLayerIds.includes(layer.id) ?? false), featureCount: layer.expandedEntityCount })) ?? [])
    : mergeLoadedLayerSheetLayers(session.preflightReport?.layers, layers, session.loadProfile.hiddenLayerIds), [
        layerSheetMode,
        layers,
        pendingProfile?.hiddenLayerIds,
        preparationReport?.layers,
        session.loadProfile.hiddenLayerIds,
        session.preflightReport?.layers,
      ]);
  const layerSheetItems = useMemo(() => createLayerSheetItems(
    layerSheetLayers,
    layerSheetMode === 'preparation' ? pendingProfile ?? session.loadProfile : session.loadProfile,
    preparationReport?.risk.deviceBudget ?? session.preflightReport?.risk.deviceBudget ?? 150_000,
    layerSheetMode !== 'preparation',
    layerReloadPending,
  ), [
    layerReloadPending,
    layerSheetLayers,
    layerSheetMode,
    pendingProfile,
    preparationReport?.risk.deviceBudget,
    session.loadProfile,
    session.preflightReport?.risk.deviceBudget,
  ]);
  const layerSheetLabels = useMemo(() => createLayerSheetLabels(t), [t]);
  const fontWarnings = (session.preflightReport?.warnings ?? [])
    .filter((warning) => warning.code === 'font-substitution');

  const loadOptions: MlightCadLoadOptions = {
    device: browserPreflightDevice(), loadProfile: session.loadProfile.mode === 'filtered' ? session.loadProfile : undefined,
    onPreparation: requestPreparation, forceFull: forceFullAttempt,
    forcePreparation: !forceFullAttempt && session.recoveryPreparationRequired,
    xrefFiles: session.xrefFiles,
    preferredXrefFileIds: session.preferredXrefFileIds,
    annotationScaleId: session.annotationScaleId,
    spatialFilterEnabled: session.spatialFilterEnabled,
  };
  const mlightControlsActive = Boolean(adapter && importState === 'ready');

  return (
    <main
      className={`app-shell mlightcad-page ${drawerState || layerSheetMode || measurementActive ? 'drawer-open' : 'drawer-closed'}`}
      onContextMenuCapture={handleMapContextMenu}
      onPointerDownCapture={handlePagePointerDownCapture}
      onPointerMoveCapture={handlePagePointerMoveCapture}
      onPointerUpCapture={finishTouchPointer}
      onPointerCancelCapture={finishTouchPointer}
      onWheelCapture={closeMapContext}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AppHeader
        settingsOpen={drawerState === 'settings'}
        onOpenSettings={() => {
          if (measurementActive) closeMeasurement();
          setLayerSheetMode(null);
          setDrawerState((current) => current === 'settings' ? null : 'settings');
        }}
      />
      <MlightCadMap ref={mapCanvas} adapter={importState === 'ready' ? adapter : null} basemapHealth={session.basemapHealth} basemapHealthReporter={session.basemapHealthReporter}
        basemapVisible={session.basemapVisible} cadastreVisible={session.cadastreVisible} basemapSuspended={basemapSuspended} mlightControlsActive={mlightControlsActive}
        cadOpacity={opacity}
        location={location.state} onCoordinate={setCoordinate} onManualMove={location.pause}
        distanceMeasurement={session.distanceMeasurement} snapPreview={snapPreview}
        onDesktopMeasurementPointCapture={(point) => {
          session.commitMeasurementPoint(point);
          clearSnapPreview();
        }} />
      <div data-map-surface className={`mlightcad-interaction-layer ${mlightControlsActive ? 'mlightcad-active' : 'map-active'}`}
        onPointerDown={handleCadPointerDown} onPointerMove={handleCadPointerMove}
        onPointerUp={handleCadPointerUp} onPointerCancel={handleCadPointerCancel}
        onPointerLeave={(event) => { if (isDesktopMeasurementPointer(event) && !pointerActive.current) clearSnapPreview(); }}
        onWheel={() => { if (measurementActive) clearSnapPreview(); location.pause(); }}>
        <MlightCadCanvas file={session.file} fileRevision={session.fileRevision} opacity={opacity} renderQuality={session.cadRenderQuality} appearance={session.cadAppearance} loadOptions={loadOptions}
          onAdapterChange={setAdapter} onError={handleError} onLayers={setLayers} onBlocks={setBlocks} onPreflight={handlePreflight}
          onCamera={(camera) => { latestCamera.current = camera; }} onProgress={handleProgress} onReady={handleReady} onSelection={handleSelection} />
      </div>

      <MapCenterCrosshair />
      {mapContextTarget && (
        <span
          className="map-context-target-cross"
          style={{ left: mapContextTarget.anchor.x, top: mapContextTarget.anchor.y }}
          aria-hidden="true"
        />
      )}
      {dwgDragActive && (
        <div className="dwg-drop-overlay" aria-hidden="true">
          <span>{t('dwgDrop.hint')}</span>
        </div>
      )}

      <MapStatusBadges basemapHealth={session.basemapHealth} basemapVisible={session.basemapVisible} coordinate={coordinate}
        cadastreVisible={session.cadastreVisible} accuracy={location.state.accuracy} onToggleBasemap={session.toggleBasemapVisible}
        onToggleCadastre={session.toggleCadastreVisible} />
      <MapActionControls locationMode={location.state.follow} fitDisabled={!adapter || importState !== 'ready'} layerCount={layerSheetItems.length}
        blockCount={displayedBlocks.length} blocksOpen={drawerState === 'blocks'} dwgControlsOpen={drawerState === 'dwg'}
        measurementActive={measurementActive}
        onLocation={() => { if (measurementActive) clearSnapPreview(); locationAction(); }}
        onFitDrawing={() => { if (measurementActive) clearSnapPreview(); adapter?.fitDrawing(); }}
        onToggleMeasurement={toggleMeasurement}
        onOpenLayerSheet={() => { if (measurementActive) closeMeasurement(); setDrawerState(null); setLayerSheetMode('loaded'); }}
        onOpenBlocks={() => { if (measurementActive) closeMeasurement(); setLayerSheetMode(null); setBlockReturnToPreparation(false); setDrawerState('blocks'); }}
        onToggleDwgControls={() => { if (measurementActive) closeMeasurement(); setLayerSheetMode(null); setDrawerState((current) => current === 'dwg' ? null : 'dwg'); }} />

      <DistanceMeasurementSheet open={measurementActive} measurement={session.distanceMeasurement}
        snapKind={snapPreview?.snapKind} onClose={closeMeasurement} onSetPoint={setMeasurementPoint}
        onRestart={restartMeasurement} onSnapEnabledChange={(enabled) => {
          session.setMeasurementSnapEnabled(enabled);
          if (!enabled) clearSnapPreview();
        }} />

      <BottomSheet open={drawerState === 'object'} modal className="control-sheet object" ariaLabel={t('objectDetails')}
        closeLabel={t('closeDrawer')} onClose={closeSelection}>
        <div aria-live="polite" className="object-sheet-content">
          <SelectionPanel selection={selection} layerName={layers.find((layer) => layer.id === selection?.layerId)?.name ?? selection?.layerId ?? ''}
            onHideObject={hideSelectedObject} onHideLayer={hideSelectedLayer} onHideBlock={selection?.blockPath.length ? hideSelectedBlock : undefined}
            onBringToFront={() => setSelectedDrawOrder('front')} onSendToBack={() => setSelectedDrawOrder('back')}
            drawOrderMessage={drawOrderMessageKey ? t(drawOrderMessageKey) : null} />
        </div>
      </BottomSheet>

      <CadSettingsSheet
        open={drawerState === 'settings'}
        opacity={opacity}
        renderQuality={session.cadRenderQuality}
        cadTextVisible={session.cadTextVisible}
        hiddenObjectCount={session.hiddenObjectIds.length}
        hiddenLayerCount={session.loadProfile.hiddenLayerIds.length}
        hiddenBlockCount={session.loadProfile.hiddenBlockNames.length}
        controlsDisabled={!adapter || importState !== 'ready'}
        onClose={() => setDrawerState(null)}
        onOpacityChange={setOpacity}
        onRenderQualityChange={session.setCadRenderQuality}
        onToggleTexts={toggleTexts}
        onRestoreHiddenObjects={restoreHiddenObjects}
        onRestoreHiddenLayers={restoreHiddenLayers}
        onRestoreHiddenBlocks={restoreHiddenBlocks}
      />

      <DwgControlSheet
        open={drawerState === 'dwg'}
        file={session.file}
        entityCount={entityCount}
        loading={importState === 'loading'}
        loadingTitle={t('importingMlight')}
        progressLabel={progressLabel(progress, t)}
        message={messageKey ? t(messageKey) : null}
        preparationAvailable={Boolean(session.preflightReport)}
        spatialFilterEnabled={session.spatialFilterEnabled}
        onClose={() => setDrawerState(null)}
        onDismissMessage={() => setMessageKey(null)}
        onChooseFile={chooseFile}
        onRemoveFile={removeDwg}
        onCancel={cancelImport}
        onOpenPreparation={openPreparation}
        onSpatialFilterChange={(enabled) => {
          session.setSpatialFilterEnabled(enabled);
          if (!session.file) return;
          captureCameraForReload();
          session.reloadFile();
        }}
        footer={fontWarnings.length > 0 ? (
          <details className="warnings">
            <summary>{t('warnings')} ({fontWarnings.length})</summary>
            <ul>{fontWarnings.map((warning, index) => (
              <li key={`${warning.fontName ?? 'font'}:${index}`}>
                {t('fontSubstitutionWarning', {
                  font: warning.fontName ?? '—',
                  count: warning.affectedCharacterCount ?? 0,
                })}
              </li>
            ))}</ul>
          </details>
        ) : undefined}
      />

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleFile(event.target.files?.[0])} />
      <input ref={xrefInput} className="visually-hidden" type="file" multiple accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleXrefFiles(event.target.files)} />
      <MapLocationMenu
        open={Boolean(mapContextTarget)}
        coordinate={mapContextTarget?.coordinate ?? null}
        anchor={mapContextTarget?.anchor}
        presentation={mapContextTarget?.presentation ?? 'desktop'}
        onClose={closeMapContext}
      />
      <ConfirmationSheet
        open={Boolean(pendingDroppedFile)}
        title={t('confirmation.replaceDwgTitle')}
        description={t('confirmation.replaceDwgDescription', {
          current: session.file?.name ?? '',
          next: pendingDroppedFile?.name ?? '',
        })}
        confirmLabel={t('confirmation.replaceDwgConfirm')}
        onClose={() => setPendingDroppedFile(null)}
        onConfirm={() => {
          const next = pendingDroppedFile;
          setPendingDroppedFile(null);
          if (next) handleFile(next);
        }}
      />
      <SiteBanner />
      <DwgPreparationSheet open={drawerState === 'prepare' || drawerState === 'prepare-failed'} report={preparationReport} profile={pendingProfile}
        failed={drawerState === 'prepare-failed'} onLoadFull={() => finishPreparation({ decision: 'full' })}
        onLoadRecommended={() => finishPreparation({ decision: 'filtered', profile: preparationReport?.recommendedProfile })}
        onApplySelection={() => finishPreparation({ decision: 'filtered', profile: pendingProfile ?? preparationReport?.recommendedProfile })}
        onEditLayers={() => { setDrawerState(null); setLayerSheetMode('preparation'); }} onEditBlocks={() => { setBlockReturnToPreparation(true); setDrawerState('blocks'); }}
        onCancel={() => finishPreparation({ decision: 'cancel' })}
        onTryFull={() => { preparationResolver.current = null; setForceFullAttempt(true); setDrawerState(null); session.reloadFile(); }}
        onDesktopCheck={() => { setMessageKey('preparation.desktopAdvice'); setDrawerState('dwg'); }}
        spatialFilterEnabled={session.spatialFilterEnabled}
        onSpatialFilterChange={session.setSpatialFilterEnabled}
        annotationScaleId={session.annotationScaleId}
        onAnnotationScaleChange={session.setAnnotationScaleId}
        onAddXrefs={() => xrefInput.current?.click()}
        onChooseXrefCandidate={(xrefId, fileId) => {
          cameraToRestore.current = latestCamera.current;
          setDrawerState(null);
          session.setPreferredXrefFile(xrefId, fileId);
        }} />
      <BlockSheet open={drawerState === 'blocks'} blocks={blockItems} labels={blockSheetLabels}
        onClose={() => { setDrawerState(blockReturnToPreparation ? 'prepare' : null); setBlockReturnToPreparation(false); }}
        onSetVisible={setBlockVisible} onSetAllVisible={setAllBlocks} applyPending={blockReloadPending}
        onApplyChanges={blockReturnToPreparation ? undefined : applyBlockChanges} />
      <LayerSheet open={layerSheetMode !== null} layers={layerSheetItems} labels={layerSheetLabels}
        onClose={() => { const back = layerSheetMode === 'preparation'; setLayerSheetMode(null); if (back) setDrawerState('prepare'); }}
        onSetVisible={setLayerVisible} onSetAllVisible={setAllLayers} applyPending={layerReloadPending}
        onApplyChanges={layerSheetMode === 'loaded' ? () => {
          captureCameraForReload(); setLayerReloadPending(false); session.reloadFile();
        } : undefined} />
    </main>
  );
}
