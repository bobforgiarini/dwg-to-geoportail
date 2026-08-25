import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { BottomSheet } from './components/BottomSheet';
import { CadControlSheet } from './components/CadControlSheet';
import { LayerSheet } from './components/LayerSheet';
import { MapActionControls } from './components/MapActionControls';
import { MapCanvas, type MapCanvasHandle } from './components/MapCanvas';
import { MapStatusBadges } from './components/MapStatusBadges';
import { SelectionPanel } from './components/SelectionPanel';
import { SiteBanner } from './components/SiteBanner';
import { useLocationTracking } from './hooks/useLocationTracking';
import { cancelDwgImport, importDwg, RECOMMENDED_DWG_BYTES } from './lib/cad/importDwg';
import { countHiddenCadObjects } from './lib/cad/visibility';
import { isUnreadableFileError } from './lib/fileAccessError';
import { DEFAULT_MLIGHTCAD_OPACITY } from './lib/mlightcad/opacity';
import { useCadSession } from './session/CadSessionContext';
import type { BasemapMode, DwgImportResult, SelectedCadObject } from './types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
type DrawerState = 'controls' | 'object' | null;

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('wmts');
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState<Set<string>>(new Set());
  const [drawerState, setDrawerState] = useState<DrawerState>(session.file ? null : 'controls');
  const [cadTextVisible, setCadTextVisible] = useState(true);
  const [cadOpacity, setCadOpacity] = useState(DEFAULT_MLIGHTCAD_OPACITY);
  const fileInput = useRef<HTMLInputElement>(null);
  const mapCanvas = useRef<MapCanvasHandle>(null);
  const abortController = useRef<AbortController | null>(null);
  const location = useLocationTracking();

  useEffect(() => () => { abortController.current?.abort(); cancelDwgImport(); }, []);

  useEffect(() => {
    if (location.state.error === 'denied') setMessage(t('locationDenied'));
    if (location.state.error === 'unavailable') setMessage(t('locationUnavailable'));
    if (location.state.error === 'error') setMessage(t('locationError'));
  }, [location.state.error, t]);

  const visibleLayers = useMemo(() => new Set(dwg?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []), [dwg]);
  const hiddenObjectCount = useMemo(() => countHiddenCadObjects(dwg, hiddenFeatureIds), [dwg, hiddenFeatureIds]);

  const chooseFile = () => fileInput.current?.click();

  const importSessionFile = async (file: File) => {
    abortController.current?.abort();
    cancelDwgImport();
    const controller = new AbortController();
    abortController.current = controller;
    setImportState('loading');
    setProgress('read');
    setMessage(file.size > RECOMMENDED_DWG_BYTES ? t('tooLarge') : null);
    try {
      const result = await importDwg(file, controller.signal, (event) => setProgress(event.phase));
      setDwg(result);
      setSelection(null);
      setHiddenFeatureIds(new Set(result.autoHiddenFeatureIds));
      setCadTextVisible(true);
      setImportState('ready');
      setMessage(null);
    } catch (error) {
      if (controller.signal.aborted) {
        setImportState('cancelled');
        setMessage(t('importCancelled'));
        setDrawerState('controls');
      } else {
        console.error('DWG import failed', error);
        setImportState('error');
        setMessage(t(isUnreadableFileError(error) ? 'fileNotReadable' : 'importFailed'));
        setDrawerState('controls');
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
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
    setCadTextVisible(true);
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
    session.setFile(file);
    setDrawerState('controls');
    if (fileInput.current) fileInput.current.value = '';
  };

  const cancelImport = () => {
    abortController.current?.abort();
    cancelDwgImport();
    setDrawerState('controls');
  };

  const removeDwg = () => {
    abortController.current?.abort();
    cancelDwgImport();
    session.clearFile();
  };

  const toggleLayer = (id: string) => setDwg((current) => current ? {
    ...current, layers: current.layers.map((layer) => layer.id === id ? { ...layer, visible: !layer.visible } : layer),
  } : current);
  const setAllLayers = (visible: boolean) => setDwg((current) => current ? {
    ...current, layers: current.layers.map((layer) => ({ ...layer, visible })),
  } : current);
  const restoreAllHidden = () => {
    setHiddenFeatureIds(new Set());
    setAllLayers(true);
  };

  const hideSelectedObject = () => {
    if (!selection) return;
    setHiddenFeatureIds((current) => new Set(current).add(selection.featureId));
    setSelection(null);
    setDrawerState(null);
  };
  const hideSelectedLayer = () => {
    if (!selection) return;
    setDwg((current) => current ? { ...current, layers: current.layers.map((layer) => layer.id === selection.layerId ? { ...layer, visible: false } : layer) } : current);
    setSelection(null);
    setDrawerState(null);
  };

  const handleCadSelect = (nextSelection: SelectedCadObject | null) => {
    setSelection(nextSelection);
    if (nextSelection) setDrawerState('object');
    else setDrawerState((current) => current === 'object' ? null : current);
  };

  const useWmsFallback = useCallback(() => {
    setBasemapMode('wms');
    setMessage(t('mapFallback'));
  }, [t]);

  const locationAction = () => {
    if (location.state.follow === 'off') location.start();
    else if (location.state.follow === 'paused') location.resume();
    else location.stop();
  };
  const locationLabel = location.state.follow === 'off' ? t('locationStart') : location.state.follow === 'paused' ? t('locationResume') : t('locationStop');

  return (
    <main className={`app-shell ${drawerState || sheetOpen ? 'drawer-open' : 'drawer-closed'}`}>
      <AppHeader />
      <MapCanvas
        ref={mapCanvas}
        dwg={dwg}
        visibleLayers={visibleLayers}
        location={location.state}
        basemapMode={basemapMode}
        basemapVisible={session.basemapVisible}
        onWmtsError={useWmsFallback}
        onManualMove={location.pause}
        onCoordinate={(value) => setCoordinate([value[0], value[1]])}
        hiddenFeatureIds={hiddenFeatureIds}
        selectedFeatureId={selection?.featureId ?? null}
        onCadSelect={handleCadSelect}
        cadTextVisible={cadTextVisible}
        cadOpacity={cadOpacity}
      />

      <MapStatusBadges
        basemapMode={basemapMode}
        basemapVisible={session.basemapVisible}
        coordinate={coordinate}
        accuracy={location.state.accuracy}
        onToggleBasemap={session.toggleBasemapVisible}
      />

      <MapActionControls
        locationMode={location.state.follow}
        fitDisabled={!dwg}
        layerCount={dwg?.layers.length ?? 0}
        cadControlsOpen={drawerState === 'controls'}
        hiddenObjectCount={hiddenObjectCount}
        onLocation={locationAction}
        onFitDrawing={() => mapCanvas.current?.fitDrawing()}
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
        onClose={() => handleCadSelect(null)}
      >
        <div aria-live="polite" className="object-sheet-content">
          <SelectionPanel
            selection={selection}
            layerName={dwg?.layers.find((layer) => layer.id === selection?.layerId)?.name ?? ''}
            onClose={() => handleCadSelect(null)}
            onHideObject={hideSelectedObject}
            onHideLayer={hideSelectedLayer}
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
        cadTextVisible={cadTextVisible}
        hiddenObjectCount={hiddenObjectCount}
        controlsDisabled={!dwg || importState !== 'ready'}
        onClose={() => setDrawerState(null)}
        onDismissMessage={() => setMessage(null)}
        onChooseFile={chooseFile}
        onRemoveFile={removeDwg}
        onCancel={cancelImport}
        onOpacityChange={setCadOpacity}
        onToggleTexts={() => setCadTextVisible((visible) => !visible)}
        onRestoreHidden={restoreAllHidden}
        footer={<>
          {location.state.follow === 'paused' && <button className="follow-banner" onClick={location.resume}><LocateFixed size={17} />{t('locationPaused')} · {t('locationResume')}</button>}
          {dwg && dwg.warnings.length > 0 && (
            <details className="warnings"><summary>{t('warnings')} ({dwg.warnings.length})</summary><ul>{dwg.warnings.map((warning) => <li key={warning}>{translatedWarning(warning, t)}</li>)}</ul></details>
          )}
        </>}
      />

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => handleFile(event.target.files?.[0])} />
      <SiteBanner />
      <LayerSheet open={sheetOpen} layers={dwg?.layers ?? []} onClose={() => setSheetOpen(false)} onToggle={toggleLayer} onSetAll={setAllLayers} />
    </main>
  );
}
