import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
}

export interface CadSessionContextValue extends CadSession {
  setFile: (file: File) => void;
  clearFile: () => void;
  setViewer: (viewer: ViewerKind, options?: ViewerNavigationOptions) => void;
  getViewerHref: (viewer: ViewerKind) => string;
  setBasemapVisible: (visible: boolean) => void;
  toggleBasemapVisible: () => void;
}

const CadSessionContext = createContext<CadSessionContextValue | null>(null);

function readInitialViewer(): ViewerKind {
  return typeof window === 'undefined' ? 'legacy' : resolveViewerKind(window.location.pathname);
}

export function CadSessionProvider({ children }: PropsWithChildren) {
  const [file, updateFile] = useState<File | null>(null);
  const [fileRevision, setFileRevision] = useState(0);
  const [activeViewer, setActiveViewer] = useState<ViewerKind>(readInitialViewer);
  const [basemapVisible, setBasemapVisible] = useState(true);

  useEffect(() => {
    const handlePopState = () => setActiveViewer(resolveViewerKind(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setFile = useCallback((nextFile: File) => {
    updateFile(nextFile);
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

  const clearFile = useCallback(() => {
    updateFile(null);
    setFileRevision((currentRevision) => currentRevision + 1);
  }, []);

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
      setFile,
      clearFile,
      setViewer,
      getViewerHref,
      setBasemapVisible,
      toggleBasemapVisible,
    }),
    [activeViewer, basemapVisible, clearFile, file, fileRevision, setFile, setViewer, toggleBasemapVisible],
  );

  return <CadSessionContext.Provider value={value}>{children}</CadSessionContext.Provider>;
}

export function useCadSession(): CadSessionContextValue {
  const context = useContext(CadSessionContext);
  if (!context) throw new Error('useCadSession must be used inside a CadSessionProvider');
  return context;
}
