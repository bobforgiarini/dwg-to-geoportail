import { useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { transform } from 'ol/proj';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../components/AppHeader';
import { BottomSheet } from '../components/BottomSheet';
import { CadControlSheet } from '../components/CadControlSheet';
import { LayerSheet } from '../components/LayerSheet';
import { MapActionControls } from '../components/MapActionControls';
import { MapStatusBadges } from '../components/MapStatusBadges';
import { MlightCadCanvas } from '../components/MlightCadCanvas';
import { MlightCadMap } from '../components/MlightCadMap';
import { SelectionPanel } from '../components/SelectionPanel';
import { SiteBanner } from '../components/SiteBanner';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { RECOMMENDED_DWG_BYTES } from '../lib/cad/importDwg';
import { isUnreadableFileError } from '../lib/fileAccessError';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import { DEFAULT_MLIGHTCAD_OPACITY } from '../lib/mlightcad/opacity';
import type { MlightCadProgress, MlightCadReady } from '../lib/mlightcad/types';
import { useCadSession } from '../session/CadSessionContext';
import type { BasemapMode, CadOverlayLayer, SelectedCadObject } from '../types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
type DrawerState = 'controls' | 'object' | null;

function progressLabel(progress: MlightCadProgress, t: (key: string) => string): string {
  const phase = progress.detail === 'finalizing'
    ? t('mlightProgress.finalizing')
    : t(`mlightProgress.${progress.phase}`);
  return progress.percentage === null ? phase : `${phase} · ${progress.percentage}%`;
}

export default function MlightCadViewerPage() {
  const { t } = useTranslation();
  const session = useCadSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const pointerActive = useRef(false);
  const [adapter, setAdapter] = useState<MlightCadViewerAdapter | null>(null);
  const [layers, setLayers] = useState<CadOverlayLayer[]>([]);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [hiddenObjectCount, setHiddenObjectCount] = useState(0);
  const [entityCount, setEntityCount] = useState(0);
  const [cadTextVisible, setCadTextVisible] = useState(true);
  const [opacity, setOpacity] = useState(DEFAULT_MLIGHTCAD_OPACITY);
  const [importState, setImportState] = useState<ImportState>(session.file ? 'loading' : 'idle');
  const [progress, setProgress] = useState<MlightCadProgress>({ phase: 'workers', percentage: null });
  const [messageKey, setMessageKey] = useState<string | null>(session.file && session.file.size > RECOMMENDED_DWG_BYTES ? 'tooLarge' : null);
  const [drawerState, setDrawerState] = useState<DrawerState>(session.file ? null : 'controls');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('wmts');
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const location = useLocationTracking();

  useEffect(() => {
    if (location.state.error === 'denied') setMessageKey('locationDenied');
    if (location.state.error === 'unavailable') setMessageKey('locationUnavailable');
    if (location.state.error === 'error') setMessageKey('locationError');
  }, [location.state.error]);

  useEffect(() => {
    if (session.file) {
      setImportState('loading');
      setMessageKey(session.file.size > RECOMMENDED_DWG_BYTES ? 'tooLarge' : null);
      setSelection(null);
      setLayers([]);
      setHiddenObjectCount(0);
      setEntityCount(0);
      setCadTextVisible(true);
      return;
    }
    setImportState('idle');
    setMessageKey(null);
    setSelection(null);
    setLayers([]);
    setHiddenObjectCount(0);
    setEntityCount(0);
  }, [session.file, session.fileRevision]);

  useEffect(() => {
    if (!adapter || importState !== 'ready' || location.state.follow !== 'following' || !location.state.position) return;
    const center = transform([
      location.state.position.coords.longitude,
      location.state.position.coords.latitude,
    ], 'EPSG:4326', 'EPSG:2169');
    adapter.centerOn([center[0], center[1]]);
  }, [adapter, importState, location.state.follow, location.state.position]);

  const chooseFile = () => fileInput.current?.click();
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setMessageKey('invalidFile');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    session.setFile(file);
    setDrawerState('controls');
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleProgress = (nextProgress: MlightCadProgress) => {
    setProgress(nextProgress);
    if (nextProgress.phase !== 'ready') setImportState('loading');
  };

  const handleReady = (ready: MlightCadReady) => {
    setLayers(ready.layers);
    setEntityCount(ready.entityCount);
    setImportState('ready');
    setMessageKey(null);
  };

  const handleError = (error: unknown) => {
    console.error('MLightCAD import failed', error);
    setImportState('error');
    setDrawerState('controls');
    setMessageKey(error instanceof Error && error.message === 'MLIGHTCAD_WORKERS_UNAVAILABLE'
      ? 'mlightWorkersUnavailable'
      : isUnreadableFileError(error) ? 'fileNotReadable' : 'importFailed');
  };

  const cancelImport = () => {
    void adapter?.cancel();
    setImportState('cancelled');
    setMessageKey('importCancelled');
    setDrawerState('controls');
  };

  const removeDwg = () => {
    void adapter?.cancel();
    session.clearFile();
  };

  const handleSelection = (nextSelection: SelectedCadObject | null) => {
    setSelection(nextSelection);
    if (nextSelection) setDrawerState('object');
    else setDrawerState((current) => current === 'object' ? null : current);
  };

  const closeSelection = () => {
    adapter?.clearSelection();
    setSelection(null);
    setDrawerState(null);
  };

  const hideSelectedObject = () => {
    if (!selection || !adapter) return;
    adapter.hideObject(selection.featureId);
    setHiddenObjectCount(adapter.hiddenObjectCount);
    setSelection(null);
    setDrawerState(null);
  };

  const hideSelectedLayer = () => {
    if (!selection || !adapter) return;
    adapter.setLayerVisible(selection.layerId, false);
    adapter.clearSelection();
    setSelection(null);
    setDrawerState(null);
  };

  const restoreAllHidden = () => {
    adapter?.restoreHiddenObjects();
    adapter?.setAllLayersVisible(true);
    setHiddenObjectCount(0);
  };

  const toggleTexts = () => {
    const visible = !cadTextVisible;
    setCadTextVisible(visible);
    adapter?.setTextsVisible(visible);
  };

  const toggleLayer = (layerId: string) => {
    const layer = layers.find((candidate) => candidate.id === layerId);
    if (layer) adapter?.setLayerVisible(layerId, !layer.visible);
  };

  const setAllLayers = (visible: boolean) => adapter?.setAllLayersVisible(visible);

  const useWmsFallback = useCallback(() => {
    setBasemapMode('wms');
    setMessageKey('mapFallback');
  }, []);

  const locationAction = () => {
    if (location.state.follow === 'off') location.start();
    else if (location.state.follow === 'paused') location.resume();
    else location.stop();
  };
  const mlightControlsActive = Boolean(adapter && importState === 'ready');

  return (
    <main className={`app-shell mlightcad-page ${drawerState || sheetOpen ? 'drawer-open' : 'drawer-closed'}`}>
      <AppHeader />
      <MlightCadMap
        adapter={adapter}
        basemapMode={basemapMode}
        basemapVisible={session.basemapVisible}
        mlightControlsActive={mlightControlsActive}
        location={location.state}
        onCoordinate={setCoordinate}
        onManualMove={location.pause}
        onWmtsError={useWmsFallback}
      />
      <div
        className={`mlightcad-interaction-layer ${mlightControlsActive ? 'mlightcad-active' : 'openlayers-active'}`}
        onPointerDown={() => { pointerActive.current = true; }}
        onPointerMove={() => { if (pointerActive.current) location.pause(); }}
        onPointerUp={() => { pointerActive.current = false; }}
        onPointerCancel={() => { pointerActive.current = false; }}
        onWheel={location.pause}
      >
        <MlightCadCanvas
          file={session.file}
          fileRevision={session.fileRevision}
          opacity={opacity}
          onAdapterChange={setAdapter}
          onError={handleError}
          onLayers={setLayers}
          onProgress={handleProgress}
          onReady={handleReady}
          onSelection={handleSelection}
        />
      </div>

      <MapStatusBadges
        basemapMode={basemapMode}
        basemapVisible={session.basemapVisible}
        coordinate={coordinate}
        accuracy={location.state.accuracy}
        onToggleBasemap={session.toggleBasemapVisible}
      />

      <MapActionControls
        locationMode={location.state.follow}
        fitDisabled={!adapter || importState !== 'ready'}
        layerCount={layers.length}
        cadControlsOpen={drawerState === 'controls'}
        hiddenObjectCount={hiddenObjectCount}
        onLocation={locationAction}
        onFitDrawing={() => adapter?.fitDrawing()}
        onOpenLayers={() => { setDrawerState(null); setSheetOpen(true); }}
        onToggleCadControls={() => {
          setSheetOpen(false);
          setDrawerState((current) => current === 'controls' ? null : 'controls');
        }}
      />

      <BottomSheet
        open={drawerState === 'object'}
        modal
        className="control-sheet object"
        ariaLabel={t('objectDetails')}
        closeLabel={t('closeDrawer')}
        onClose={closeSelection}
      >
        <div aria-live="polite" className="object-sheet-content">
          <SelectionPanel
            selection={selection}
            layerName={layers.find((layer) => layer.id === selection?.layerId)?.name ?? selection?.layerId ?? ''}
            onHideObject={hideSelectedObject}
            onHideLayer={hideSelectedLayer}
          />
        </div>
      </BottomSheet>

      <CadControlSheet
        open={drawerState === 'controls'}
        file={session.file}
        entityCount={entityCount}
        loading={importState === 'loading'}
        loadingTitle={t('importingMlight')}
        progressLabel={progressLabel(progress, t)}
        message={messageKey ? t(messageKey) : null}
        opacity={opacity}
        cadTextVisible={cadTextVisible}
        hiddenObjectCount={hiddenObjectCount}
        controlsDisabled={!adapter || importState !== 'ready'}
        onClose={() => setDrawerState(null)}
        onDismissMessage={() => setMessageKey(null)}
        onChooseFile={chooseFile}
        onRemoveFile={removeDwg}
        onCancel={cancelImport}
        onOpacityChange={setOpacity}
        onToggleTexts={toggleTexts}
        onRestoreHidden={restoreAllHidden}
        footer={<>
          {location.state.follow === 'paused' && (
            <button className="follow-banner" onClick={location.resume}><LocateFixed size={17} />{t('locationPaused')} · {t('locationResume')}</button>
          )}
        </>}
      />

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleFile(event.target.files?.[0])} />
      <SiteBanner />
      <LayerSheet open={sheetOpen} layers={layers} onClose={() => setSheetOpen(false)} onToggle={toggleLayer} onSetAll={setAllLayers} />
    </main>
  );
}
