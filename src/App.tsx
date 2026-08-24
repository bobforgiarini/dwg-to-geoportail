import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, FileUp, Layers3, LocateFixed, Map, PanelBottomClose, PanelTopOpen, Square, Trash2, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { LayerSheet } from './components/LayerSheet';
import { MapCanvas } from './components/MapCanvas';
import { SelectionPanel } from './components/SelectionPanel';
import { SiteBanner } from './components/SiteBanner';
import { useLocationTracking } from './hooks/useLocationTracking';
import { cancelDwgImport, importDwg, RECOMMENDED_DWG_BYTES } from './lib/cad/importDwg';
import type { BasemapMode, DwgImportResult, SelectedCadObject } from './types/models';

type ImportState = 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';

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
  const [dwg, setDwg] = useState<DwgImportResult | null>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('wmts');
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [selection, setSelection] = useState<SelectedCadObject | null>(null);
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [cadTextVisible, setCadTextVisible] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | null>(null);
  const location = useLocationTracking();

  useEffect(() => () => { abortController.current?.abort(); cancelDwgImport(); }, []);

  useEffect(() => {
    if (location.state.error === 'denied') setMessage(t('locationDenied'));
    if (location.state.error === 'unavailable') setMessage(t('locationUnavailable'));
    if (location.state.error === 'error') setMessage(t('locationError'));
  }, [location.state.error, t]);

  const visibleLayers = useMemo(() => new Set(dwg?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []), [dwg]);

  const chooseFile = () => fileInput.current?.click();
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setMessage(t('invalidFile'));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    abortController.current?.abort();
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
      setDrawerOpen(true);
      setImportState('ready');
      setMessage(null);
    } catch (error) {
      if (controller.signal.aborted) {
        setImportState('cancelled');
        setMessage(t('importCancelled'));
      } else {
        console.error('DWG import failed', error);
        setImportState('error');
        setMessage(t('importFailed'));
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const cancelImport = () => {
    abortController.current?.abort();
    cancelDwgImport();
  };

  const removeDwg = () => {
    setDwg(null);
    setSelection(null);
    setHiddenFeatureIds(new Set());
    setCadTextVisible(true);
    setImportState('idle');
    setMessage(null);
  };

  const toggleLayer = (id: string) => setDwg((current) => current ? {
    ...current, layers: current.layers.map((layer) => layer.id === id ? { ...layer, visible: !layer.visible } : layer),
  } : current);
  const setAllLayers = (visible: boolean) => setDwg((current) => current ? {
    ...current, layers: current.layers.map((layer) => ({ ...layer, visible })),
  } : current);

  const hideSelectedObject = () => {
    if (!selection) return;
    setHiddenFeatureIds((current) => new Set(current).add(selection.featureId));
    setSelection(null);
  };
  const hideSelectedLayer = () => {
    if (!selection) return;
    setDwg((current) => current ? { ...current, layers: current.layers.map((layer) => layer.id === selection.layerId ? { ...layer, visible: false } : layer) } : current);
    setSelection(null);
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
    <main className={`app-shell ${drawerOpen ? 'drawer-open' : 'drawer-closed'}`}>
      <AppHeader />
      <MapCanvas
        dwg={dwg}
        visibleLayers={visibleLayers}
        location={location.state}
        basemapMode={basemapMode}
        onWmtsError={useWmsFallback}
        onManualMove={location.pause}
        onCoordinate={(value) => setCoordinate([value[0], value[1]])}
        hiddenFeatureIds={hiddenFeatureIds}
        selectedFeatureId={selection?.featureId ?? null}
        onCadSelect={setSelection}
        cadTextVisible={cadTextVisible}
      />

      <div className="map-badge"><Map size={14} />{basemapMode === 'wmts' ? t('basemapWmts') : t('basemapWms')}</div>
      {coordinate && <div className="coordinate-badge"><Crosshair size={14} />{t('coordinates', { x: coordinate[0].toFixed(2), y: coordinate[1].toFixed(2) })}</div>}

      <div className="floating-actions" aria-label="Map actions">
        <button className={location.state.follow !== 'off' ? 'active' : ''} onClick={locationAction} title={locationLabel} aria-label={locationLabel}>
          {location.state.follow === 'following' ? <Square size={20} /> : <LocateFixed size={22} />}
        </button>
        <button onClick={() => setSheetOpen(true)} disabled={!dwg?.layers.length} aria-label={t('layers')} title={t('layers')}>
          <Layers3 size={22} /><span>{dwg?.layers.length ?? 0}</span>
        </button>
        <button className={!cadTextVisible ? 'active' : ''} onClick={() => setCadTextVisible((visible) => !visible)} disabled={!dwg} aria-label={cadTextVisible ? t('hideTexts') : t('showTexts')} title={cadTextVisible ? t('hideTexts') : t('showTexts')}>
          <Type size={22} />
        </button>
      </div>

      {!drawerOpen && <button className="drawer-reopen" onClick={() => setDrawerOpen(true)} aria-label={t('openDrawer')} title={t('openDrawer')}><PanelTopOpen size={22} /></button>}
      <section className={`import-card ${drawerOpen ? 'open' : 'closed'}`} aria-live="polite" aria-hidden={!drawerOpen}>
        <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t('closeDrawer')} title={t('closeDrawer')}><span className="drawer-grip" aria-hidden="true" /><PanelBottomClose size={19} /></button>
        {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage(null)} aria-label={t('close')}><X size={17} /></button></div>}
        <SelectionPanel
          selection={selection}
          layerName={dwg?.layers.find((layer) => layer.id === selection?.layerId)?.name ?? ''}
          hiddenCount={hiddenFeatureIds.size}
          onClose={() => setSelection(null)}
          onHideObject={hideSelectedObject}
          onHideLayer={hideSelectedLayer}
          onRestoreHidden={() => setHiddenFeatureIds(new Set())}
        />
        {importState === 'loading' ? (
          <div className="loading-row">
            <div className="spinner" aria-hidden="true" />
            <div><strong>{t('importing')}</strong><small>{progress}</small></div>
            <button className="secondary-button" onClick={cancelImport}>{t('cancel')}</button>
          </div>
        ) : dwg ? (
          <div className="file-row">
            <div className="file-icon"><FileUp /></div>
            <div className="file-meta"><strong>{dwg.file.name}</strong><small>{t('fileSize', { size: (dwg.file.size / 1024 / 1024).toFixed(2) })} · {t('featureCount', { count: dwg.features.length })}</small></div>
            <button className="icon-button subtle" onClick={removeDwg} aria-label={t('remove')}><Trash2 size={20} /></button>
            <button className="primary-button compact" onClick={chooseFile}>{t('replace')}</button>
          </div>
        ) : (
          <div className="empty-import">
            <div><strong>{t('noDwg')}</strong><small>{t('fileLocal')}</small></div>
            <button className="primary-button" onClick={chooseFile}><FileUp size={20} />{t('chooseDwg')}</button>
          </div>
        )}
        {location.state.follow === 'paused' && <button className="follow-banner" onClick={location.resume}><LocateFixed size={17} />{t('locationPaused')} · {t('locationResume')}</button>}
        {location.state.accuracy !== null && <div className="accuracy-label">{t('accuracy', { meters: Math.round(location.state.accuracy) })}</div>}
        {dwg && dwg.warnings.length > 0 && (
          <details className="warnings"><summary>{t('warnings')} ({dwg.warnings.length})</summary><ul>{dwg.warnings.map((warning) => <li key={warning}>{translatedWarning(warning, t)}</li>)}</ul></details>
        )}
      </section>

      <input ref={fileInput} className="visually-hidden" type="file" accept=".dwg,application/acad,application/x-dwg" onChange={(event) => void handleFile(event.target.files?.[0])} />
      <SiteBanner />
      <LayerSheet open={sheetOpen} layers={dwg?.layers ?? []} onClose={() => setSheetOpen(false)} onToggle={toggleLayer} onSetAll={setAllLayers} />
    </main>
  );
}
