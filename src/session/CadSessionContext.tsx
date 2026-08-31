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
import { cadFileDescriptor } from '../lib/cad/xrefBundle';
import type { CadRenderQualityMode } from '../lib/mlightcad/renderQuality';
import { EMPTY_CAD_OBJECT_DRAW_ORDER, moveCadObjectDrawOrder } from '../lib/cad/drawOrder';
import {
  DEFAULT_CAD_APPEARANCE,
  type CadAppearanceSettings,
} from '../lib/cad/appearance';
import {
  INITIAL_DISTANCE_MEASUREMENT_STATE,
  cancelDistanceMeasurement,
  commitDistanceMeasurementPoint,
  restartDistanceMeasurement,
  setDistanceMeasurementSnapEnabled,
  startDistanceMeasurement,
} from '../lib/measurement';
import type {
  CadObjectDrawOrder,
  CadObjectDrawOrderTier,
  DistanceMeasurementState,
  MeasurementPoint,
} from '../types/models';
export interface CadSession {
  /** The original local file. It is held in React memory only. */
  file: File | null;
  /** Changes whenever the selected file is set or cleared. */
  fileRevision: number;
  /** Local XRef files held only for the current browser session. */
  xrefFiles: File[];
  /** Explicit choices for ambiguous XRef base-name matches. */
  preferredXrefFileIds: Record<string, string>;
  /** Fixed annotation scale selected for the current main DWG. */
  annotationScaleId: string | null;
  /** Luxembourg plus 1 km conservative model filter. */
  spatialFilterEnabled: boolean;
  /** Visibility of the Geoportail background. */
  basemapVisible: boolean;
  /** Optional Geoportail cadastral plan overlay shared by both viewers. */
  cadastreVisible: boolean;
  /** Shared Geoportail source/health state. */
  basemapHealth: BasemapHealthState;
  preflightReport: DwgPreflightReport | null;
  loadProfile: CadLoadProfile;
  cadTextVisible: boolean;
  cadRenderQuality: CadRenderQualityMode;
  /** Shared CAD-only appearance; it never changes the Geoportail layer. */
  cadAppearance: CadAppearanceSettings;
  hiddenObjectIds: string[];
  /** Session-only front/back overrides. */
  objectDrawOrder: CadObjectDrawOrder;
  /** One session-only 2D LUREF measurement. */
  distanceMeasurement: DistanceMeasurementState;
  /** Marker left by a previous hard tab termination; contains metadata only. */
  recoveryMarker: DwgImportRecoveryMarker | null;
  recoveryPreparationRequired: boolean;
}

export interface CadSessionContextValue extends CadSession {
  setFile: (file: File) => void;
  clearFile: () => void;
  addXrefFiles: (files: readonly File[]) => void;
  setPreferredXrefFile: (xrefId: string, fileId: string) => void;
  setAnnotationScaleId: (scaleId: string | null) => void;
  setSpatialFilterEnabled: (enabled: boolean) => void;
  setBasemapVisible: (visible: boolean) => void;
  toggleBasemapVisible: () => void;
  setCadastreVisible: (visible: boolean) => void;
  toggleCadastreVisible: () => void;
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
  setCadAppearance: (appearance: CadAppearanceSettings) => void;
  setObjectHidden: (objectId: string, hidden: boolean) => void;
  setObjectDrawOrder: (groupKey: string, tier: CadObjectDrawOrderTier) => void;
  restoreHiddenObjects: () => void;
  restoreHiddenLayers: () => void;
  restoreHiddenBlocks: () => void;
  startMeasurement: () => void;
  commitMeasurementPoint: (point: MeasurementPoint) => void;
  restartMeasurement: () => void;
  cancelMeasurement: () => void;
  setMeasurementSnapEnabled: (enabled: boolean) => void;
  clearRecoveryPreparationRequirement: () => void;
  reloadFile: () => void;
}

const CadSessionContext = createContext<CadSessionContextValue | null>(null);

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
  const [xrefFiles, setXrefFiles] = useState<File[]>([]);
  const [preferredXrefFileIds, setPreferredXrefFileIds] = useState<Record<string, string>>({});
  const [annotationScaleId, setAnnotationScaleId] = useState<string | null>(null);
  const [spatialFilterEnabled, setSpatialFilterEnabled] = useState(true);
  const [basemapVisible, setBasemapVisible] = useState(true);
  const [cadastreVisible, setCadastreVisible] = useState(false);
  const [basemapHealthSuspended, setBasemapHealthSuspended] = useState(false);
  const [preflightReport, setPreflightReport] = useState<DwgPreflightReport | null>(null);
  const [loadProfile, setLoadProfileState] = useState<CadLoadProfile>(EMPTY_LOAD_PROFILE);
  const [cadTextVisible, setCadTextVisible] = useState(true);
  const [cadRenderQuality, setCadRenderQuality] = useState<CadRenderQualityMode>('auto');
  const [cadAppearance, setCadAppearanceState] = useState<CadAppearanceSettings>(DEFAULT_CAD_APPEARANCE);
  const [hiddenObjectIds, setHiddenObjectIds] = useState<string[]>([]);
  const [objectDrawOrder, setObjectDrawOrderState] = useState<CadObjectDrawOrder>(() => ({
    front: [...EMPTY_CAD_OBJECT_DRAW_ORDER.front],
    back: [...EMPTY_CAD_OBJECT_DRAW_ORDER.back],
  }));
  const [distanceMeasurement, setDistanceMeasurement] = useState<DistanceMeasurementState>(
    () => ({ ...INITIAL_DISTANCE_MEASUREMENT_STATE }),
  );
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
    setXrefFiles([]);
    setPreferredXrefFileIds({});
    setAnnotationScaleId(null);
    setSpatialFilterEnabled(true);
    setPreflightReport(null);
    setLoadProfileState(EMPTY_LOAD_PROFILE);
    setCadTextVisible(true);
    setCadAppearanceState(DEFAULT_CAD_APPEARANCE);
    setHiddenObjectIds([]);
    setObjectDrawOrderState({ front: [], back: [] });
    setDistanceMeasurement({ ...INITIAL_DISTANCE_MEASUREMENT_STATE });
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const clearFile = useCallback(() => {
    setRecoveryPreparationRequired(false);
    updateFile(null);
    setXrefFiles([]);
    setPreferredXrefFileIds({});
    setAnnotationScaleId(null);
    setSpatialFilterEnabled(true);
    setPreflightReport(null);
    setLoadProfileState(EMPTY_LOAD_PROFILE);
    setCadTextVisible(true);
    setCadAppearanceState(DEFAULT_CAD_APPEARANCE);
    setHiddenObjectIds([]);
    setObjectDrawOrderState({ front: [], back: [] });
    setDistanceMeasurement({ ...INITIAL_DISTANCE_MEASUREMENT_STATE });
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const addXrefFiles = useCallback((nextFiles: readonly File[]) => {
    if (!nextFiles.length) return;
    setXrefFiles((current) => {
      const byId = new Map(current.map((candidate) => [cadFileDescriptor(candidate).id, candidate]));
      for (const candidate of nextFiles) {
        if (!candidate.name.toLocaleLowerCase('en-US').endsWith('.dwg')) continue;
        byId.set(cadFileDescriptor(candidate).id, candidate);
      }
      return [...byId.values()];
    });
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const setPreferredXrefFile = useCallback((xrefId: string, fileId: string) => {
    setPreferredXrefFileIds((current) => ({ ...current, [xrefId]: fileId }));
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
  const setCadAppearance = useCallback((appearance: CadAppearanceSettings) => {
    setCadAppearanceState({ ...appearance });
  }, []);
  const setObjectHidden = useCallback((objectId: string, hidden: boolean) => {
    setHiddenObjectIds((current) => updateVisibility(current, objectId, !hidden));
  }, []);
  const restoreHiddenObjects = useCallback(() => setHiddenObjectIds([]), []);
  const restoreHiddenLayers = useCallback(() => {
    setLoadProfileState((current) => ({
      ...current,
      mode: current.hiddenBlockNames.length || current.hiddenEntityCategories.length ? 'filtered' : 'full',
      hiddenLayerIds: [],
    }));
  }, []);
  const restoreHiddenBlocks = useCallback(() => {
    setLoadProfileState((current) => ({
      ...current,
      mode: current.hiddenLayerIds.length || current.hiddenEntityCategories.length ? 'filtered' : 'full',
      hiddenBlockNames: [],
    }));
  }, []);
  const setObjectDrawOrder = useCallback((groupKey: string, tier: CadObjectDrawOrderTier) => {
    setObjectDrawOrderState((current) => moveCadObjectDrawOrder(current, groupKey, tier));
  }, []);
  const startMeasurement = useCallback(() => {
    setDistanceMeasurement((current) => startDistanceMeasurement(current));
  }, []);
  const commitMeasurementPoint = useCallback((point: MeasurementPoint) => {
    setDistanceMeasurement((current) => commitDistanceMeasurementPoint(current, point));
  }, []);
  const restartMeasurement = useCallback(() => {
    setDistanceMeasurement((current) => restartDistanceMeasurement(current));
  }, []);
  const cancelMeasurement = useCallback(() => {
    setDistanceMeasurement((current) => cancelDistanceMeasurement(current));
  }, []);
  const setMeasurementSnapEnabled = useCallback((enabled: boolean) => {
    setDistanceMeasurement((current) => setDistanceMeasurementSnapEnabled(current, enabled));
  }, []);
  const clearRecoveryPreparationRequirement = useCallback(
    () => setRecoveryPreparationRequired(false),
    [],
  );
  const reloadFile = useCallback(() => {
    if (file) setFileRevision((currentRevision) => currentRevision + 1);
  }, [file]);

  const toggleBasemapVisible = useCallback(() => {
    setBasemapVisible((visible) => !visible);
  }, []);

  const toggleCadastreVisible = useCallback(() => {
    setCadastreVisible((visible) => !visible);
  }, []);

  const value = useMemo<CadSessionContextValue>(
    () => ({
      file,
      fileRevision,
      xrefFiles,
      preferredXrefFileIds,
      annotationScaleId,
      spatialFilterEnabled,
      basemapVisible,
      cadastreVisible,
      basemapHealth,
      basemapHealthReporter,
      preflightReport,
      loadProfile,
      cadTextVisible,
      cadRenderQuality,
      cadAppearance,
      hiddenObjectIds,
      objectDrawOrder,
      distanceMeasurement,
      recoveryMarker,
      recoveryPreparationRequired,
      setFile,
      clearFile,
      addXrefFiles,
      setPreferredXrefFile,
      setAnnotationScaleId,
      setSpatialFilterEnabled,
      setBasemapVisible,
      toggleBasemapVisible,
      setCadastreVisible,
      toggleCadastreVisible,
      setBasemapHealthSuspended,
      setPreflightReport,
      setLoadProfile,
      setLayerProfileVisible,
      setBlockProfileVisible,
      resetLoadProfile,
      setCadTextVisible,
      setCadRenderQuality,
      setCadAppearance,
      setObjectHidden,
      setObjectDrawOrder,
      restoreHiddenObjects,
      restoreHiddenLayers,
      restoreHiddenBlocks,
      startMeasurement,
      commitMeasurementPoint,
      restartMeasurement,
      cancelMeasurement,
      setMeasurementSnapEnabled,
      clearRecoveryPreparationRequirement,
      reloadFile,
    }),
    [addXrefFiles, annotationScaleId, basemapHealth, basemapHealthReporter, basemapVisible, cadAppearance, cadRenderQuality, cadTextVisible, cadastreVisible, cancelMeasurement, clearFile, clearRecoveryPreparationRequirement, commitMeasurementPoint, distanceMeasurement, file, fileRevision, hiddenObjectIds, loadProfile, objectDrawOrder, preferredXrefFileIds, preflightReport, recoveryMarker, recoveryPreparationRequired, reloadFile, resetLoadProfile, restartMeasurement, restoreHiddenBlocks, restoreHiddenLayers, restoreHiddenObjects, setBlockProfileVisible, setCadAppearance, setFile, setLayerProfileVisible, setLoadProfile, setMeasurementSnapEnabled, setObjectDrawOrder, setObjectHidden, setPreferredXrefFile, spatialFilterEnabled, startMeasurement, toggleBasemapVisible, toggleCadastreVisible, xrefFiles],
  );

  return <CadSessionContext.Provider value={value}>{children}</CadSessionContext.Provider>;
}

export function useCadSession(): CadSessionContextValue {
  const context = useContext(CadSessionContext);
  if (!context) throw new Error('useCadSession must be used inside a CadSessionProvider');
  return context;
}
