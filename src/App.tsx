import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { BottomSheet } from './components/BottomSheet';
import { BlockSheet, type BlockSheetItem } from './components/BlockSheet';
import { createBlockSheetItems, createBlockSheetLabels } from './components/blockSheetModel';
import { CadControlSheet } from './components/CadControlSheet';
import { DwgPreparationSheet } from './components/DwgPreparationSheet';
import { LayerSheet } from './components/LayerSheet';
import { createLayerSheetItems, createLayerSheetLabels, isLayerHidden, layerIdentityMatches } from './components/layerSheetModel';
import { MapActionControls } from './components/MapActionControls';
import { MapCanvas, type MapCanvasHandle } from './components/MapCanvas';
import { MapCenterCrosshair } from './components/MapCenterCrosshair';
import { MapStatusBadges } from './components/MapStatusBadges';
import { SelectionPanel } from './components/SelectionPanel';
import { SiteBanner } from './components/SiteBanner';
import { useLocationTracking } from './hooks/useLocationTracking';
import { cancelDwgImport, importDwg, isDwgPreflightError, type DwgPreparationDecision } from './lib/cad/importDwg';
import { browserPreflightDevice, clearDwgImportMarker, markDwgImportStarted } from './lib/cad/importRecovery';
import type { CadLoadProfile, DwgPreflightReport } from './lib/cad/preflightTypes';
import { countHiddenCadObjects } from './lib/cad/visibility';
import { isUnreadableFileError } from './lib/fileAccessError';
import { DEFAULT_MLIGHTCAD_OPACITY } from './lib/mlightcad/opacity';
import { useCadSession } from './session/CadSessionContext';
import type { DwgImportResult, SelectedCadObject } from './types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
type DrawerState = 'blocks' | 'controls' | 'object' | 'prepare' | 'prepare-failed' | null;
type LayerSheetMode = 'loaded' | 'preparation' | null;

function translatedWarning(warning: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (warning === '3d-flattened') return t('warning3d');
  if (warning === 'paper-space-ignored') return t('warningPaper');
  if (warning === 'missing-block' || warning === 'cyclic-block') return t('warningBlock');
  if (warning.startsWith('unsupported:')) return t('warningUnsupported', { type: warning.slice(12) });
  if (warning === 'hatch-boundary-missing') return t('warningHatchBoundary');
  if (warning === 'hatch-raw-unavailable') return t('warningHatchRawUnavailable');
  return t('warningGeneric', { warning });
}

export default function App() {
  const { t } = useTranslation();
  const session = useCadSession();
  const [dwg, setDwg] = useState<DwgImportResult | null>(null);
  const [importState, setImportState] = useState<ImportState>(session.file ? 'loading' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [layerSheetMode, setLayerSheetMode] = useState<LayerSheetMode>(null);
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState<Set<string>>(new Set());
  const [drawerState, setDrawerState] = useState<DrawerState>(session.file ? null : 'controls');
  const [cadOpacity, setCadOpacity] = useState(DEFAULT_MLIGHTCAD_OPACITY);
  const [preparationReport, setPreparationReport] = useState<DwgPreflightReport | null>(null);
  const [pendingProfile, setPendingProfile] = useState<CadLoadProfile | null>(null);
  const [blockReturnToPreparation, setBlockReturnToPreparation] = useState(false);
  const [blockReloadPending, setBlockReloadPending] = useState(false);
  const [layerReloadPending, setLayerReloadPending] = useState(false);
  const [basemapSuspended, setBasemapSuspended] = useState(false);

  useEffect(() => {
    session.setBasemapHealthSuspended(basemapSuspended);
    return () => session.setBasemapHealthSuspended(false);
  }, [basemapSuspended, session.setBasemapHealthSuspended]);
  const [preserveViewOnImport, setPreserveViewOnImport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const xrefInput = useRef<HTMLInputElement>(null);
  const mapCanvas = useRef<MapCanvasHandle>(null);
  const abortController = useRef<AbortController | null>(null);
  const preparationResolver = useRef<((decision: DwgPreparationDecision) => void) | null>(null);
  const location = useLocationTracking();

  useEffect(() => () => {
    const controller = abortController.current;
    abortController.current = null;
    controller?.abort();
    cancelDwgImport();
  }, []);

  useEffect(() => {
    if (session.recoveryMarker) setMessage(t('importRecovery'));
  }, [session.recoveryMarker, t]);

  useEffect(() => {
    if (location.state.error === 'denied') setMessage(t('locationDenied'));
    if (location.state.error === 'unavailable') setMessage(t('locationUnavailable'));
    if (location.state.error === 'error') setMessage(t('locationError'));
  }, [location.state.error, t]);

  const visibleLayers = useMemo(() => new Set(dwg?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []), [dwg]);
  const hiddenBlockNames = useMemo(() => new Set(
    session.loadProfile.hiddenBlockNames.map((name) => name.toLocaleLowerCase('en-US')),
  ), [session.loadProfile.hiddenBlockNames]);
  const hiddenObjectKeys = useMemo(() => new Set(session.hiddenObjectIds), [session.hiddenObjectIds]);
  const hiddenObjectCount = useMemo(() => countHiddenCadObjects(dwg, hiddenFeatureIds, hiddenObjectKeys), [dwg, hiddenFeatureIds, hiddenObjectKeys]);
  const displayedBlocks = preparationReport && (drawerState === 'prepare' || blockReturnToPreparation)
    ? preparationReport.blocks
    : (dwg?.blocks ?? session.preflightReport?.blocks ?? []);
  const activeProfile = blockReturnToPreparation ? pendingProfile : session.loadProfile;
  const blockItems = useMemo<BlockSheetItem[]>(() => createBlockSheetItems(
    displayedBlocks,
    activeProfile ?? session.loadProfile,
    preparationReport?.risk.deviceBudget ?? session.preflightReport?.risk.deviceBudget ?? 150_000,
  ), [activeProfile, displayedBlocks, preparationReport?.risk.deviceBudget, session.loadProfile, session.preflightReport?.risk.deviceBudget]);

  const chooseFile = () => fileInput.current?.click();

  const requestPreparation = (report: DwgPreflightReport): Promise<DwgPreparationDecision> => {
    session.setPreflightReport(report);
    setPreparationReport(report);
    setPendingProfile(report.recommendedProfile);
    setBlockReturnToPreparation(false);
    setBasemapSuspended(report.risk.level === 'high');
    setDrawerState('prepare');
    if (session.annotationScaleId == null) {
      session.setAnnotationScaleId(
        report.annotationScale?.selectedScaleId ?? report.annotationScale?.savedScaleId ?? null,
      );
    }
    return new Promise((resolve) => { preparationResolver.current = resolve; });
  };

  const finishPreparation = (decision: DwgPreparationDecision) => {
    const resolver = preparationResolver.current;
    const configuredDecision = decision.decision === 'cancel' ? decision : {
      ...decision,
      annotationScaleId: session.annotationScaleId
        ?? preparationReport?.annotationScale?.selectedScaleId
        ?? preparationReport?.annotationScale?.savedScaleId
        ?? null,
      spatialFilterEnabled: session.spatialFilterEnabled,
    };
    const resolvedDecision = configuredDecision.decision === 'filtered' && !configuredDecision.profile && preparationReport
      ? { ...configuredDecision, profile: preparationReport.recommendedProfile }
      : configuredDecision;
    if (resolvedDecision.decision === 'filtered' && resolvedDecision.profile) session.setLoadProfile(resolvedDecision.profile);
    if (decision.decision === 'full') session.resetLoadProfile();
    resolver?.(resolvedDecision);
    preparationResolver.current = null;
    setDrawerState(null);
    setBlockReturnToPreparation(false);
    if (!resolver && decision.decision !== 'cancel' && session.file) {
      setPreserveViewOnImport(true);
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

  const importSessionFile = async (file: File, forceFull = false) => {
    preparationResolver.current?.({ decision: 'cancel' });
    preparationResolver.current = null;
    abortController.current?.abort();
    cancelDwgImport();
    const controller = new AbortController();
    abortController.current = controller;
    setImportState('loading');
    setProgress('read');
    setMessage(null);
    const recoveryMarker = markDwgImportStarted(file);
    const isCurrentImport = () => abortController.current === controller;
    try {
      const result = await importDwg(file, controller.signal, (event) => {
        if (isCurrentImport()) setProgress(event.phase);
      }, {
        initialProfile: session.loadProfile.mode === 'filtered' ? session.loadProfile : undefined,
        preflight: { device: browserPreflightDevice() },
        onPreparation: (report) => {
          if (!isCurrentImport()) return Promise.reject(new DOMException('Import aborted', 'AbortError'));
          return requestPreparation(report);
        },
        forceFull,
        forcePreparation: !forceFull && session.recoveryPreparationRequired,
        xrefFiles: session.xrefFiles,
        preferredXrefFileIds: session.preferredXrefFileIds,
        annotationScaleId: session.annotationScaleId,
        spatialFilterEnabled: session.spatialFilterEnabled,
      });
      if (!isCurrentImport()) return;
      setDwg(result);
      session.setPreflightReport(result.preflight);
      setSelection(null);
      setHiddenFeatureIds(new Set(result.autoHiddenFeatureIds));
      setImportState('ready');
      setBlockReloadPending(false);
      setLayerReloadPending(false);
      setMessage(null);
    } catch (error) {
      if (!isCurrentImport()) return;
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        setImportState('cancelled');
        setMessage(t('importCancelled'));
        setDrawerState('controls');
      } else if (isDwgPreflightError(error)) {
        setImportState('error');
        setMessage(null);
        setDrawerState('prepare-failed');
      } else {
        console.error('DWG import failed', error);
        setImportState('error');
        setMessage(t(isUnreadableFileError(error) ? 'fileNotReadable' : 'importFailed'));
        setDrawerState('controls');
      }
    } finally {
      clearDwgImportMarker(recoveryMarker);
      if (isCurrentImport()) {
        setBasemapSuspended(false);
        session.clearRecoveryPreparationRequirement();
        abortController.current = null;
      }
    }
  };

  useEffect(() => {
    if (session.file) {
      void importSessionFile(session.file);
      return;
    }
    setDwg(null);
    setSelection(null);
    setHiddenFeatureIds(new Set());
    setBlockReloadPending(false);
    setLayerReloadPending(false);
    setImportState('idle');
    setMessage(null);
  // A revision deliberately retriggers parsing even when the same File object is selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.fileRevision]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setMessage(t('invalidFile'));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setBlockReloadPending(false);
    setLayerReloadPending(false);
    session.setFile(file);
    setPreserveViewOnImport(false);
    setDrawerState('controls');
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleXrefFiles = (files: FileList | null) => {
    const dwgFiles = [...(files ?? [])].filter((file) => file.name.toLocaleLowerCase('en-US').endsWith('.dwg'));
    if (dwgFiles.length) {
      setDrawerState(null);
      session.addXrefFiles(dwgFiles);
    }
    if (xrefInput.current) xrefInput.current.value = '';
  };

  const cancelImport = () => {
    preparationResolver.current?.({ decision: 'cancel' });
    preparationResolver.current = null;
    abortController.current?.abort();
    cancelDwgImport();
    setDrawerState('controls');
  };

  const removeDwg = () => {
    preparationResolver.current?.({ decision: 'cancel' });
    preparationResolver.current = null;
    const controller = abortController.current;
    abortController.current = null;
    controller?.abort();
    cancelDwgImport();
    setBlockReloadPending(false);
    setLayerReloadPending(false);
    session.clearFile();
  };

  const setLayerVisible = (id: string, visible: boolean) => {
    if (layerSheetMode === 'preparation') {
      setPendingProfile((current) => current ? {
        ...current,
        mode: 'filtered',
        hiddenLayerIds: visible
          ? current.hiddenLayerIds.filter((layer) => layer !== id)
          : current.hiddenLayerIds.includes(id) ? current.hiddenLayerIds : [...current.hiddenLayerIds, id],
      } : current);
      return;
    }
    const reportLayer = session.preflightReport?.layers.find((candidate) => layerIdentityMatches(candidate, id));
    const layer = dwg?.layers.find((candidate) => (
      layerIdentityMatches(candidate, id)
      || Boolean(reportLayer && (layerIdentityMatches(candidate, reportLayer.id) || layerIdentityMatches(candidate, reportLayer.name)))
    ));
    if (!layer && !reportLayer) return;
    const profileLayer = reportLayer ?? layer!;
    const wasFiltered = isLayerHidden(profileLayer, session.loadProfile.hiddenLayerIds);
    session.setLayerProfileVisible(profileLayer.id, visible);
    if (visible && profileLayer.name !== profileLayer.id) session.setLayerProfileVisible(profileLayer.name, true);
    setDwg((current) => current ? {
      ...current,
      layers: current.layers.map((candidate) => (
        layerIdentityMatches(candidate, layer?.id ?? id) ? { ...candidate, visible } : candidate
      )),
    } : current);
    if (visible && wasFiltered) {
      setLayerReloadPending(true);
    }
  };
  const setAllLayers = (visible: boolean) => {
    if (layerSheetMode === 'preparation') {
      setPendingProfile((current) => current ? {
        ...current,
        mode: 'filtered',
        hiddenLayerIds: visible ? [] : (preparationReport?.layers.map((layer) => layer.id) ?? []),
      } : current);
      return;
    }
    const reloadRequired = visible && session.loadProfile.hiddenLayerIds.length > 0;
    for (const layer of session.preflightReport?.layers ?? dwg?.layers ?? []) session.setLayerProfileVisible(layer.id, visible);
    setDwg((current) => current ? { ...current, layers: current.layers.map((layer) => ({ ...layer, visible })) } : current);
    if (reloadRequired) {
      setLayerReloadPending(true);
    }
  };
  const setBlockVisible = (id: string, visible: boolean) => {
    const block = displayedBlocks.find((candidate) => candidate.id === id);
    if (!block) return;
    if (blockReturnToPreparation) {
      setPendingProfile((current) => {
        if (!current) return current;
        const hidden = current.hiddenBlockNames.some((name) => name.toLocaleLowerCase('en-US') === block.name.toLocaleLowerCase('en-US'));
        return {
          ...current,
          mode: 'filtered',
          hiddenBlockNames: visible
            ? current.hiddenBlockNames.filter((name) => name.toLocaleLowerCase('en-US') !== block.name.toLocaleLowerCase('en-US'))
            : hidden ? current.hiddenBlockNames : [...current.hiddenBlockNames, block.name],
        };
      });
      return;
    }
    session.setBlockProfileVisible(block.name, visible);
    setDwg((current) => current ? {
      ...current,
      blocks: current.blocks.map((candidate) => candidate.id === id ? { ...candidate, visible } : candidate),
    } : current);
    if (block.isNested || session.loadProfile.mode === 'filtered') setBlockReloadPending(true);
  };
  const setAllBlocks = (visible: boolean) => {
    for (const block of displayedBlocks) {
      if (blockReturnToPreparation) {
        setPendingProfile((current) => current ? {
          ...current,
          mode: 'filtered',
          hiddenBlockNames: visible ? [] : displayedBlocks.map((candidate) => candidate.name),
        } : current);
        break;
      }
      session.setBlockProfileVisible(block.name, visible);
    }
    if (!blockReturnToPreparation) setDwg((current) => current ? { ...current, blocks: current.blocks.map((block) => ({ ...block, visible })) } : current);
    if (!blockReturnToPreparation && displayedBlocks.some((block) => block.isNested || session.loadProfile.mode === 'filtered')) setBlockReloadPending(true);
  };
  const restoreAllHidden = () => {
    const reloadRequired = session.loadProfile.mode === 'filtered';
    setHiddenFeatureIds(new Set());
    session.restoreHiddenObjects();
    setDwg((current) => current ? {
      ...current,
      layers: current.layers.map((layer) => ({ ...layer, visible: true })),
      blocks: current.blocks.map((block) => ({ ...block, visible: true })),
    } : current);
    session.resetLoadProfile();
    setBlockReloadPending(false);
    setLayerReloadPending(false);
    if (reloadRequired) {
      setPreserveViewOnImport(true);
      session.reloadFile();
    }
  };

  const hideSelectedObject = () => {
    if (!selection) return;
    session.setObjectHidden(selection.objectKey, true);
    setSelection(null);
    setDrawerState(null);
  };
  const hideSelectedLayer = () => {
    if (!selection) return;
    session.setLayerProfileVisible(selection.layerId, false);
    setDwg((current) => current ? { ...current, layers: current.layers.map((layer) => layer.id === selection.layerId ? { ...layer, visible: false } : layer) } : current);
    setSelection(null);
    setDrawerState(null);
  };
  const hideSelectedBlock = () => {
    const blockName = selection?.blockPath.at(-1);
    const block = dwg?.blocks.find((candidate) => candidate.name === blockName || candidate.id === blockName);
    if (!block) return;
    setBlockVisible(block.id, false);
    setSelection(null);
    setDrawerState(null);
  };

  const handleCadSelect = (nextSelection: SelectedCadObject | null) => {
    setSelection(nextSelection);
    if (nextSelection) setDrawerState('object');
    else setDrawerState((current) => current === 'object' ? null : current);
  };
  const setSelectedDrawOrder = (tier: 'front' | 'back') => {
    if (!selection) return;
    session.setObjectDrawOrder(selection.drawOrderGroupKey, tier);
  };

  const locationAction = () => {
    if (location.state.follow === 'off') location.start();
    else if (location.state.follow === 'paused') location.resume();
    else location.stop();
  };
  const layerSheetLayers = layerSheetMode === 'preparation'
    ? (preparationReport?.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: !(pendingProfile?.hiddenLayerIds.includes(layer.id) ?? false),
        featureCount: layer.expandedEntityCount,
      })) ?? [])
    : (session.preflightReport?.layers.map((reportLayer) => {
        const rendered = dwg?.layers.find((layer) => layerIdentityMatches(layer, reportLayer.id) || layerIdentityMatches(layer, reportLayer.name));
        const hidden = isLayerHidden(reportLayer, session.loadProfile.hiddenLayerIds);
        return {
          id: reportLayer.id,
          name: reportLayer.name,
          visible: !hidden && (rendered?.visible ?? true),
          featureCount: Math.max(rendered?.featureCount ?? 0, reportLayer.expandedEntityCount),
        };
      }) ?? dwg?.layers ?? []);
  const layerSheetItems = createLayerSheetItems(
    layerSheetLayers,
    layerSheetMode === 'preparation' ? pendingProfile ?? session.loadProfile : session.loadProfile,
    preparationReport?.risk.deviceBudget ?? session.preflightReport?.risk.deviceBudget ?? 150_000,
    layerSheetMode !== 'preparation',
    layerReloadPending,
  );

  return (
    <main className={`app-shell ${drawerState || layerSheetMode ? 'drawer-open' : 'drawer-closed'}`}>
      <AppHeader />
      <MapCanvas
        ref={mapCanvas}
        dwg={dwg}
        visibleLayers={visibleLayers}
        location={location.state}
        basemapHealth={session.basemapHealth}
        basemapHealthReporter={session.basemapHealthReporter}
        basemapVisible={session.basemapVisible}
        cadastreVisible={session.cadastreVisible}
        basemapSuspended={basemapSuspended}
        onManualMove={location.pause}
        onCoordinate={(value) => setCoordinate([value[0], value[1]])}
        hiddenFeatureIds={hiddenFeatureIds}
        hiddenObjectKeys={hiddenObjectKeys}
        hiddenBlockNames={hiddenBlockNames}
        selectedFeatureId={selection?.featureId ?? null}
        onCadSelect={handleCadSelect}
        cadTextVisible={session.cadTextVisible}
        cadOpacity={cadOpacity}
        objectDrawOrder={session.objectDrawOrder}
        appearance={session.cadAppearance}
        fitOnDwgChange={!preserveViewOnImport}
      />

      <MapCenterCrosshair />

      <MapStatusBadges
        basemapHealth={session.basemapHealth}
        basemapVisible={session.basemapVisible}
        cadastreVisible={session.cadastreVisible}
        coordinate={coordinate}
        accuracy={location.state.accuracy}
        onToggleBasemap={session.toggleBasemapVisible}
        onToggleCadastre={session.toggleCadastreVisible}
      />

      <MapActionControls
        locationMode={location.state.follow}
        fitDisabled={!dwg}
        layerCount={dwg?.layers.length ?? 0}
        blockCount={dwg?.blocks?.length ?? session.preflightReport?.blocks.length ?? 0}
        blocksOpen={drawerState === 'blocks'}
        cadControlsOpen={drawerState === 'controls'}
        hiddenObjectCount={hiddenObjectCount}
        onLocation={locationAction}
        onFitDrawing={() => mapCanvas.current?.fitDrawing()}
        onOpenLayers={() => { setDrawerState(null); setLayerSheetMode('loaded'); }}
        onOpenBlocks={() => { setLayerSheetMode(null); setBlockReturnToPreparation(false); setDrawerState('blocks'); }}
        onToggleCadControls={() => {
          setLayerSheetMode(null);
          setDrawerState((current) => current === 'controls' ? null : 'controls');
        }}
      />

      <BottomSheet
        open={drawerState === 'object'}
        modal
        className="control-sheet object"
        ariaLabel={t('objectDetails')}
        closeLabel={t('closeDrawer')}
        onClose={() => handleCadSelect(null)}
      >
        <div aria-live="polite" className="object-sheet-content">
          <SelectionPanel
            selection={selection}
            layerName={dwg?.layers.find((layer) => layer.id === selection?.layerId)?.name ?? ''}
            onHideObject={hideSelectedObject}
            onHideLayer={hideSelectedLayer}
            onHideBlock={hideSelectedBlock}
            onBringToFront={() => setSelectedDrawOrder('front')}
            onSendToBack={() => setSelectedDrawOrder('back')}
          />
        </div>
      </BottomSheet>

      <CadControlSheet
        open={drawerState === 'controls'}
        file={session.file}
        entityCount={dwg?.features.length ?? 0}
        loading={importState === 'loading'}
        loadingTitle={t('importing')}
        progressLabel={progress}
        message={message}
        opacity={cadOpacity}
        preparationAvailable={Boolean(session.preflightReport)}
        spatialFilterEnabled={session.spatialFilterEnabled}
        cadTextVisible={session.cadTextVisible}
        hiddenObjectCount={hiddenObjectCount}
        controlsDisabled={!dwg || importState !== 'ready'}
        onClose={() => setDrawerState(null)}
        onDismissMessage={() => setMessage(null)}
        onChooseFile={chooseFile}
        onRemoveFile={removeDwg}
        onCancel={cancelImport}
        onOpacityChange={setCadOpacity}
        onOpenPreparation={openPreparation}
        onSpatialFilterChange={(enabled) => {
          session.setSpatialFilterEnabled(enabled);
          setPreserveViewOnImport(true);
          session.reloadFile();
        }}
        onToggleTexts={() => session.setCadTextVisible(!session.cadTextVisible)}
        onRestoreHidden={restoreAllHidden}
        footer={<>
          {location.state.follow === 'paused' && <button className="follow-banner" onClick={location.resume}><LocateFixed size={17} />{t('locationPaused')} · {t('locationResume')}</button>}
          {dwg && dwg.warnings.length > 0 && (
            <details className="warnings"><summary>{t('warnings')} ({dwg.warnings.length})</summary><ul>{dwg.warnings.map((warning) => <li key={warning}>{translatedWarning(warning, t)}</li>)}</ul></details>
          )}
        </>}
      />

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleFile(event.target.files?.[0])} />
      <input ref={xrefInput} className="visually-hidden" type="file" multiple accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleXrefFiles(event.target.files)} />
      <SiteBanner />
      <DwgPreparationSheet
        open={drawerState === 'prepare' || drawerState === 'prepare-failed'}
        report={preparationReport}
        profile={pendingProfile}
        failed={drawerState === 'prepare-failed'}
        onLoadFull={() => finishPreparation({ decision: 'full' })}
        onLoadRecommended={() => finishPreparation({ decision: 'filtered', profile: preparationReport?.recommendedProfile })}
        onApplySelection={() => finishPreparation({ decision: 'filtered', profile: pendingProfile ?? preparationReport?.recommendedProfile })}
        onEditLayers={() => { setDrawerState(null); setLayerSheetMode('preparation'); }}
        onEditBlocks={() => { setBlockReturnToPreparation(true); setDrawerState('blocks'); }}
        onCancel={() => finishPreparation({ decision: 'cancel' })}
        onTryFull={() => {
          preparationResolver.current = null;
          setDrawerState(null);
          if (session.file) void importSessionFile(session.file, true);
        }}
        onDesktopCheck={() => {
          setMessage(t('preparation.desktopAdvice'));
          setDrawerState('controls');
        }}
        spatialFilterEnabled={session.spatialFilterEnabled}
        onSpatialFilterChange={session.setSpatialFilterEnabled}
        annotationScaleId={session.annotationScaleId}
        onAnnotationScaleChange={session.setAnnotationScaleId}
        onAddXrefs={() => xrefInput.current?.click()}
        onChooseXrefCandidate={(xrefId, fileId) => {
          setPreserveViewOnImport(true);
          setDrawerState(null);
          session.setPreferredXrefFile(xrefId, fileId);
        }}
      />
      <BlockSheet
        open={drawerState === 'blocks'}
        blocks={blockItems}
        labels={createBlockSheetLabels(t)}
        onClose={() => {
          setDrawerState(blockReturnToPreparation ? 'prepare' : null);
          setBlockReturnToPreparation(false);
        }}
        onSetVisible={setBlockVisible}
        onSetAllVisible={setAllBlocks}
        applyPending={blockReloadPending}
        onApplyChanges={blockReturnToPreparation ? undefined : () => {
          setBlockReloadPending(false);
          setPreserveViewOnImport(true);
          session.reloadFile();
        }}
      />
      <LayerSheet
        open={layerSheetMode !== null}
        layers={layerSheetItems}
        labels={createLayerSheetLabels(t)}
        onClose={() => {
          const returnToPreparation = layerSheetMode === 'preparation';
          setLayerSheetMode(null);
          if (returnToPreparation) setDrawerState('prepare');
        }}
        onSetVisible={setLayerVisible}
        onSetAllVisible={setAllLayers}
        applyPending={layerReloadPending}
        onApplyChanges={layerSheetMode === 'loaded' ? () => {
          setLayerReloadPending(false);
          setPreserveViewOnImport(true);
          session.reloadFile();
        } : undefined}
      />
    </main>
  );
}
