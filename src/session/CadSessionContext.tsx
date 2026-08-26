import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  BasemapHealthController,
  type BasemapHealthReporter,
  type BasemapHealthState,
} from '../lib/basemapHealth';
import { probeWmtsAvailability } from '../lib/geoportail';
import {
  consumeDwgImportRecoveryMarker,
  type DwgImportRecoveryMarker,
} from '../lib/cad/importRecovery';
import type { CadLoadProfile, DwgPreflightReport } from '../lib/cad/preflightTypes';
import type { CadRenderQualityMode } from '../lib/mlightcad/renderQuality';
import {
  getViewerHref,
  navigateBrowserToViewer,
  resolveViewerKind,
  type ViewerKind,
  type ViewerNavigationOptions,
} from '../lib/viewerRouting';

export type { ViewerKind } from '../lib/viewerRouting';

export interface CadSession {
  /** The original local file. It is held in React memory only. */
  file: File | null;
  /** Changes whenever the selected file is set or cleared. */
  fileRevision: number;
  activeViewer: ViewerKind;
  /** Shared visibility of the Geoportail background in both viewers. */
  basemapVisible: boolean;
  /** Shared Geoportail source/health state; survives CAD viewer switches. */
  basemapHealth: BasemapHealthState;
  preflightReport: DwgPreflightReport | null;
  loadProfile: CadLoadProfile;
  cadTextVisible: boolean;
  cadRenderQuality: CadRenderQualityMode;
  hiddenObjectIds: string[];
  /** Marker left by a previous hard tab termination; contains metadata only. */
  recoveryMarker: DwgImportRecoveryMarker | null;
  recoveryPreparationRequired: boolean;
}

export interface CadSessionContextValue extends CadSession {
  setFile: (file: File) => void;
  clearFile: () => void;
  setViewer: (viewer: ViewerKind, options?: ViewerNavigationOptions) => void;
  getViewerHref: (viewer: ViewerKind) => string;
  setBasemapVisible: (visible: boolean) => void;
  toggleBasemapVisible: () => void;
  /** Temporarily stops tile requests and health timers while CAD needs the memory budget. */
  setBasemapHealthSuspended: (suspended: boolean) => void;
  basemapHealthReporter: BasemapHealthReporter;
  setPreflightReport: (report: DwgPreflightReport | null) => void;
  setLoadProfile: (profile: CadLoadProfile) => void;
  setLayerProfileVisible: (layerId: string, visible: boolean) => void;
  setBlockProfileVisible: (blockName: string, visible: boolean) => void;
  resetLoadProfile: () => void;
  setCadTextVisible: (visible: boolean) => void;
  setCadRenderQuality: (quality: CadRenderQualityMode) => void;
  setObjectHidden: (objectId: string, hidden: boolean) => void;
  restoreHiddenObjects: () => void;
  clearRecoveryPreparationRequirement: () => void;
  reloadFile: () => void;
}

const CadSessionContext = createContext<CadSessionContextValue | null>(null);

function readInitialViewer(): ViewerKind {
  return typeof window === 'undefined' ? 'mlightcad' : resolveViewerKind(window.location.pathname);
}

const EMPTY_LOAD_PROFILE: CadLoadProfile = {
  mode: 'full',
  hiddenLayerIds: [],
  hiddenBlockNames: [],
  hiddenEntityCategories: [],
};

function updateVisibility(values: string[], id: string, visible: boolean): string[] {
  const normalized = id.toLocaleLowerCase('en-US');
  if (visible) return values.filter((value) => value.toLocaleLowerCase('en-US') !== normalized);
  return values.some((value) => value.toLocaleLowerCase('en-US') === normalized) ? values : [...values, id];
}

export function CadSessionProvider({ children }: PropsWithChildren) {
  const [file, updateFile] = useState<File | null>(null);
  const [fileRevision, setFileRevision] = useState(0);
  const [activeViewer, setActiveViewer] = useState<ViewerKind>(readInitialViewer);
  const [basemapVisible, setBasemapVisible] = useState(true);
  const [basemapHealthSuspended, setBasemapHealthSuspended] = useState(false);
  const [preflightReport, setPreflightReport] = useState<DwgPreflightReport | null>(null);
  const [loadProfile, setLoadProfileState] = useState<CadLoadProfile>(EMPTY_LOAD_PROFILE);
  const [cadTextVisible, setCadTextVisible] = useState(true);
  const [cadRenderQuality, setCadRenderQuality] = useState<CadRenderQualityMode>('auto');
  const [hiddenObjectIds, setHiddenObjectIds] = useState<string[]>([]);
  const [recoveryMarker, setRecoveryMarker] = useState<DwgImportRecoveryMarker | null>(
    () => consumeDwgImportRecoveryMarker(),
  );
  const recoveryMarkerRef = useRef(recoveryMarker);
  recoveryMarkerRef.current = recoveryMarker;
  const [recoveryPreparationRequired, setRecoveryPreparationRequired] = useState(false);
  const basemapControllerRef = useRef<BasemapHealthController | null>(null);
  if (!basemapControllerRef.current) {
    basemapControllerRef.current = new BasemapHealthController({
      initialActive: typeof document === 'undefined' || document.visibilityState === 'visible',
      initialOnline: typeof navigator === 'undefined' || navigator.onLine,
      probeWmts: probeWmtsAvailability,
    });
  }
  const basemapController = basemapControllerRef.current;
  const basemapHealth = useSyncExternalStore(
    basemapController.subscribe,
    basemapController.getSnapshot,
    basemapController.getSnapshot,
  );
  const basemapHealthReporter = useMemo(
    () => basemapController.createReporter(),
    [basemapController],
  );

  useEffect(() => {
    const handlePopState = () => setActiveViewer(resolveViewerKind(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const syncOnline = () => basemapController.setOnline(navigator.onLine);
    const syncActive = () => basemapController.setActive(
      basemapVisible && !basemapHealthSuspended && document.visibilityState === 'visible',
    );
    syncOnline();
    syncActive();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    document.addEventListener('visibilitychange', syncActive);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      document.removeEventListener('visibilitychange', syncActive);
    };
  }, [basemapController, basemapHealthSuspended, basemapVisible]);

  useEffect(() => () => basemapController.dispose(), [basemapController]);

  const setFile = useCallback((nextFile: File) => {
    const interrupted = recoveryMarkerRef.current;
    setRecoveryPreparationRequired(Boolean(
      interrupted && interrupted.name === nextFile.name && interrupted.size === nextFile.size,
    ));
    recoveryMarkerRef.current = null;
    setRecoveryMarker(null);
    updateFile(nextFile);
    setPreflightReport(null);
    setLoadProfileState(EMPTY_LOAD_PROFILE);
    setCadTextVisible(true);
    setHiddenObjectIds([]);
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const clearFile = useCallback(() => {
    setRecoveryPreparationRequired(false);
    updateFile(null);
    setPreflightReport(null);
    setLoadProfileState(EMPTY_LOAD_PROFILE);
    setCadTextVisible(true);
    setHiddenObjectIds([]);
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const setLoadProfile = useCallback((profile: CadLoadProfile) => {
    setLoadProfileState({
      ...profile,
      hiddenLayerIds: [...profile.hiddenLayerIds],
      hiddenBlockNames: [...profile.hiddenBlockNames],
      hiddenEntityCategories: [...profile.hiddenEntityCategories],
    });
  }, []);

  const setLayerProfileVisible = useCallback((layerId: string, visible: boolean) => {
    setLoadProfileState((current) => {
      const hiddenLayerIds = updateVisibility(current.hiddenLayerIds, layerId, visible);
      return {
        ...current,
        mode: hiddenLayerIds.length || current.hiddenBlockNames.length || current.hiddenEntityCategories.length ? 'filtered' : 'full',
        hiddenLayerIds,
      };
    });
  }, []);

  const setBlockProfileVisible = useCallback((blockName: string, visible: boolean) => {
    setLoadProfileState((current) => {
      const hiddenBlockNames = updateVisibility(current.hiddenBlockNames, blockName, visible);
      return {
        ...current,
        mode: hiddenBlockNames.length || current.hiddenLayerIds.length || current.hiddenEntityCategories.length ? 'filtered' : 'full',
        hiddenBlockNames,
      };
    });
  }, []);

  const resetLoadProfile = useCallback(() => setLoadProfileState(EMPTY_LOAD_PROFILE), []);
  const setObjectHidden = useCallback((objectId: string, hidden: boolean) => {
    setHiddenObjectIds((current) => updateVisibility(current, objectId, !hidden));
  }, []);
  const restoreHiddenObjects = useCallback(() => setHiddenObjectIds([]), []);
  const clearRecoveryPreparationRequirement = useCallback(
    () => setRecoveryPreparationRequired(false),
    [],
  );
  const reloadFile = useCallback(() => {
    if (file) setFileRevision((currentRevision) => currentRevision + 1);
  }, [file]);

  const setViewer = useCallback((viewer: ViewerKind, options?: ViewerNavigationOptions) => {
    navigateBrowserToViewer(viewer, options);
    setActiveViewer(viewer);
  }, []);

  const toggleBasemapVisible = useCallback(() => {
    setBasemapVisible((visible) => !visible);
  }, []);

  const value = useMemo<CadSessionContextValue>(
    () => ({
      file,
      fileRevision,
      activeViewer,
      basemapVisible,
      basemapHealth,
      basemapHealthReporter,
      preflightReport,
      loadProfile,
      cadTextVisible,
      cadRenderQuality,
      hiddenObjectIds,
      recoveryMarker,
      recoveryPreparationRequired,
      setFile,
      clearFile,
      setViewer,
      getViewerHref,
      setBasemapVisible,
      toggleBasemapVisible,
      setBasemapHealthSuspended,
      setPreflightReport,
      setLoadProfile,
      setLayerProfileVisible,
      setBlockProfileVisible,
      resetLoadProfile,
      setCadTextVisible,
      setCadRenderQuality,
      setObjectHidden,
      restoreHiddenObjects,
      clearRecoveryPreparationRequirement,
      reloadFile,
    }),
    [activeViewer, basemapHealth, basemapHealthReporter, basemapVisible, cadRenderQuality, cadTextVisible, clearFile, clearRecoveryPreparationRequirement, file, fileRevision, hiddenObjectIds, loadProfile, preflightReport, recoveryMarker, recoveryPreparationRequired, reloadFile, resetLoadProfile, restoreHiddenObjects, setBlockProfileVisible, setFile, setLayerProfileVisible, setLoadProfile, setObjectHidden, setViewer, toggleBasemapVisible],
  );

  return <CadSessionContext.Provider value={value}>{children}</CadSessionContext.Provider>;
}

export function useCadSession(): CadSessionContextValue {
  const context = useContext(CadSessionContext);
  if (!context) throw new Error('useCadSession must be used inside a CadSessionProvider');
  return context;
}
