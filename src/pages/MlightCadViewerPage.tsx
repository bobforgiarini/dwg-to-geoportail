import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { transform } from 'ol/proj';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../components/AppHeader';
import { BlockSheet } from '../components/BlockSheet';
import { createBlockSheetItems, createBlockSheetLabels } from '../components/blockSheetModel';
import { BottomSheet } from '../components/BottomSheet';
import { CadControlSheet } from '../components/CadControlSheet';
import { DwgPreparationSheet } from '../components/DwgPreparationSheet';
import { LayerSheet } from '../components/LayerSheet';
import { createLayerSheetItems, createLayerSheetLabels, isLayerHidden, layerIdentityMatches, mergeLoadedLayerSheetLayers } from '../components/layerSheetModel';
import { MapActionControls } from '../components/MapActionControls';
import { MapStatusBadges } from '../components/MapStatusBadges';
import { MlightCadCanvas } from '../components/MlightCadCanvas';
import { MlightCadMap } from '../components/MlightCadMap';
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
import type { CadOverlayLayer, SelectedCadObject } from '../types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
type DrawerState = 'blocks' | 'controls' | 'object' | 'prepare' | 'prepare-failed' | null;
type LayerSheetMode = 'loaded' | 'preparation' | null;

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
  const pointerActive = useRef(false);
  const preparationResolver = useRef<((decision: MlightCadPreparationResult) => void) | null>(null);
  const activeImportMarker = useRef<DwgImportRecoveryMarker | null>(null);
  const preflightReceived = useRef(false);
  const previousFile = useRef<File | null>(null);
  const latestCamera = useRef<MlightCadCamera | null>(null);
  const cameraToRestore = useRef<MlightCadCamera | null>(null);
  const [adapter, setAdapter] = useState<MlightCadViewerAdapter | null>(null);
  const [layers, setLayers] = useState<CadOverlayLayer[]>([]);
  const [blocks, setBlocks] = useState<CadOverlayBlock[]>([]);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [entityCount, setEntityCount] = useState(0);
  const [opacity, setOpacity] = useState(DEFAULT_MLIGHTCAD_OPACITY);
  const [importState, setImportState] = useState<ImportState>(session.file ? 'loading' : 'idle');
  const [progress, setProgress] = useState<MlightCadProgress>({ phase: 'workers', percentage: null });
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<DrawerState>(session.file ? null : 'controls');
  const [layerSheetMode, setLayerSheetMode] = useState<LayerSheetMode>(null);
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [preparationReport, setPreparationReport] = useState<DwgPreflightReport | null>(session.preflightReport);
  const [pendingProfile, setPendingProfile] = useState<CadLoadProfile | null>(null);
  const [blockReturnToPreparation, setBlockReturnToPreparation] = useState(false);
  const [blockReloadPending, setBlockReloadPending] = useState(false);
  const [layerReloadPending, setLayerReloadPending] = useState(false);
  const [basemapSuspended, setBasemapSuspended] = useState(false);

  useEffect(() => {
    session.setBasemapHealthSuspended(basemapSuspended);
    return () => session.setBasemapHealthSuspended(false);
  }, [basemapSuspended, session.setBasemapHealthSuspended]);
  const [forceFullAttempt, setForceFullAttempt] = useState(false);
  const location = useLocationTracking();

  useEffect(() => {
    if (session.recoveryMarker) setMessageKey('importRecovery');
  }, [session.recoveryMarker]);

  useEffect(() => () => {
    clearDwgImportMarker(activeImportMarker.current);
    activeImportMarker.current = null;
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
    if (!adapter || importState !== 'ready' || location.state.follow !== 'following' || !location.state.position) return;
    const center = transform([location.state.position.coords.longitude, location.state.position.coords.latitude], 'EPSG:4326', 'EPSG:2169');
    adapter.centerOn([center[0], center[1]]);
  }, [adapter, importState, location.state.follow, location.state.position]);

  const requestPreparation = (report: DwgPreflightReport): Promise<MlightCadPreparationResult> => {
    preflightReceived.current = true;
    session.setPreflightReport(report); setPreparationReport(report); setPendingProfile(report.recommendedProfile);
    setBlockReturnToPreparation(false); setBasemapSuspended(report.risk.level === 'high'); setDrawerState('prepare');
    return new Promise((resolve) => { preparationResolver.current = resolve; });
  };

  const finishPreparation = (decision: MlightCadPreparationResult) => {
    const resolved = decision.decision === 'filtered' && !decision.profile && preparationReport
      ? { ...decision, profile: preparationReport.recommendedProfile } : decision;
    if (resolved.decision === 'filtered' && resolved.profile) session.setLoadProfile(resolved.profile);
    if (resolved.decision === 'full') session.resetLoadProfile();
    preparationResolver.current?.(resolved); preparationResolver.current = null;
    setDrawerState(null); setBlockReturnToPreparation(false);
  };

  const chooseFile = () => fileInput.current?.click();
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setMessageKey('invalidFile'); if (fileInput.current) fileInput.current.value = ''; return;
    }
    cameraToRestore.current = null; setBlockReloadPending(false); setLayerReloadPending(false); session.setFile(file); setDrawerState('controls');
    if (fileInput.current) fileInput.current.value = '';
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
    if (isAbortError(error)) { setImportState('cancelled'); setMessageKey('importCancelled'); setDrawerState('controls'); return; }
    setImportState('error');
    if (!preflightReceived.current && !(error instanceof Error && error.message === 'MLIGHTCAD_WORKERS_UNAVAILABLE') && !isUnreadableFileError(error)) {
      setMessageKey(null); setDrawerState('prepare-failed'); return;
    }
    setDrawerState('controls');
    setMessageKey(error instanceof Error && error.message === 'MLIGHTCAD_WORKERS_UNAVAILABLE'
      ? 'mlightWorkersUnavailable' : isUnreadableFileError(error) ? 'fileNotReadable' : 'importFailed');
  };

  const cancelImport = () => {
    preparationResolver.current?.({ decision: 'cancel' }); preparationResolver.current = null; void adapter?.cancel();
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    session.clearRecoveryPreparationRequirement(); setBasemapSuspended(false); setImportState('cancelled'); setMessageKey('importCancelled'); setDrawerState('controls');
  };
  const removeDwg = () => {
    preparationResolver.current?.({ decision: 'cancel' }); preparationResolver.current = null; void adapter?.cancel();
    clearDwgImportMarker(activeImportMarker.current); activeImportMarker.current = null;
    setBlockReloadPending(false); setLayerReloadPending(false); session.clearFile();
  };

  const handleSelection = (next: SelectedCadObject | null) => {
    setSelection(next); if (next) setDrawerState('object'); else setDrawerState((current) => current === 'object' ? null : current);
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
  const restoreAllHidden = () => {
    const reloadRequired = session.loadProfile.mode === 'filtered';
    adapter?.restoreHiddenObjects(); adapter?.setAllLayersVisible(true);
    for (const block of displayedBlocks) adapter?.setBlockVisible(block.name, true);
    session.restoreHiddenObjects(); session.resetLoadProfile(); setBlocks((current) => current.map((block) => ({ ...block, visible: true })));
    setBlockReloadPending(false); setLayerReloadPending(false);
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

  const loadOptions: MlightCadLoadOptions = {
    device: browserPreflightDevice(), loadProfile: session.loadProfile.mode === 'filtered' ? session.loadProfile : undefined,
    onPreparation: requestPreparation, forceFull: forceFullAttempt,
    forcePreparation: !forceFullAttempt && session.recoveryPreparationRequired,
  };
  const mlightControlsActive = Boolean(adapter && importState === 'ready');

  return (
    <main className={`app-shell mlightcad-page ${drawerState || layerSheetMode ? 'drawer-open' : 'drawer-closed'}`}>
      <AppHeader />
      <MlightCadMap adapter={importState === 'ready' ? adapter : null} basemapHealth={session.basemapHealth} basemapHealthReporter={session.basemapHealthReporter}
        basemapVisible={session.basemapVisible} basemapSuspended={basemapSuspended} mlightControlsActive={mlightControlsActive}
        location={location.state} onCoordinate={setCoordinate} onManualMove={location.pause} />
      <div className={`mlightcad-interaction-layer ${mlightControlsActive ? 'mlightcad-active' : 'openlayers-active'}`}
        onPointerDown={() => { pointerActive.current = true; }} onPointerMove={() => { if (pointerActive.current) location.pause(); }}
        onPointerUp={() => { pointerActive.current = false; }} onPointerCancel={() => { pointerActive.current = false; }} onWheel={location.pause}>
        <MlightCadCanvas file={session.file} fileRevision={session.fileRevision} opacity={opacity} renderQuality={session.cadRenderQuality} loadOptions={loadOptions}
          onAdapterChange={setAdapter} onError={handleError} onLayers={setLayers} onBlocks={setBlocks} onPreflight={handlePreflight}
          onCamera={(camera) => { latestCamera.current = camera; }} onProgress={handleProgress} onReady={handleReady} onSelection={handleSelection} />
      </div>

      <MapStatusBadges basemapHealth={session.basemapHealth} basemapVisible={session.basemapVisible} coordinate={coordinate}
        accuracy={location.state.accuracy} onToggleBasemap={session.toggleBasemapVisible} />
      <MapActionControls locationMode={location.state.follow} fitDisabled={!adapter || importState !== 'ready'} layerCount={layerSheetItems.length}
        blockCount={displayedBlocks.length} blocksOpen={drawerState === 'blocks'} cadControlsOpen={drawerState === 'controls'}
        hiddenObjectCount={session.hiddenObjectIds.length} onLocation={locationAction} onFitDrawing={() => adapter?.fitDrawing()}
        onOpenLayers={() => { setDrawerState(null); setLayerSheetMode('loaded'); }}
        onOpenBlocks={() => { setLayerSheetMode(null); setBlockReturnToPreparation(false); setDrawerState('blocks'); }}
        onToggleCadControls={() => { setLayerSheetMode(null); setDrawerState((current) => current === 'controls' ? null : 'controls'); }} />

      <BottomSheet open={drawerState === 'object'} modal className="control-sheet object" ariaLabel={t('objectDetails')}
        closeLabel={t('closeDrawer')} onClose={closeSelection}>
        <div aria-live="polite" className="object-sheet-content">
          <SelectionPanel selection={selection} layerName={layers.find((layer) => layer.id === selection?.layerId)?.name ?? selection?.layerId ?? ''}
            onHideObject={hideSelectedObject} onHideLayer={hideSelectedLayer} onHideBlock={selection?.blockPath.length ? hideSelectedBlock : undefined} />
        </div>
      </BottomSheet>

      <CadControlSheet open={drawerState === 'controls'} file={session.file} entityCount={entityCount} loading={importState === 'loading'}
        loadingTitle={t('importingMlight')} progressLabel={progressLabel(progress, t)} message={messageKey ? t(messageKey) : null}
        opacity={opacity} cadTextVisible={session.cadTextVisible} hiddenObjectCount={session.hiddenObjectIds.length}
        renderQuality={session.cadRenderQuality} onRenderQualityChange={session.setCadRenderQuality}
        controlsDisabled={!adapter || importState !== 'ready'} onClose={() => setDrawerState(null)} onDismissMessage={() => setMessageKey(null)}
        onChooseFile={chooseFile} onRemoveFile={removeDwg} onCancel={cancelImport} onOpacityChange={setOpacity}
        onToggleTexts={toggleTexts} onRestoreHidden={restoreAllHidden}
        footer={<>{location.state.follow === 'paused' && <button className="follow-banner" onClick={location.resume}><LocateFixed size={17} />{t('locationPaused')} · {t('locationResume')}</button>}</>} />

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleFile(event.target.files?.[0])} />
      <SiteBanner />
      <DwgPreparationSheet open={drawerState === 'prepare' || drawerState === 'prepare-failed'} report={preparationReport} profile={pendingProfile}
        failed={drawerState === 'prepare-failed'} onLoadFull={() => finishPreparation({ decision: 'full' })}
        onLoadRecommended={() => finishPreparation({ decision: 'filtered', profile: preparationReport?.recommendedProfile })}
        onApplySelection={() => finishPreparation({ decision: 'filtered', profile: pendingProfile ?? preparationReport?.recommendedProfile })}
        onEditLayers={() => { setDrawerState(null); setLayerSheetMode('preparation'); }} onEditBlocks={() => { setBlockReturnToPreparation(true); setDrawerState('blocks'); }}
        onCancel={() => finishPreparation({ decision: 'cancel' })}
        onTryFull={() => { preparationResolver.current = null; setForceFullAttempt(true); setDrawerState(null); session.reloadFile(); }}
        onDesktopCheck={() => { setMessageKey('preparation.desktopAdvice'); setDrawerState('controls'); }} />
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
