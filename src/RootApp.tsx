import { lazy, Suspense } from 'react';
import { CadSessionProvider, useCadSession } from './session/CadSessionContext';

const LegacyViewer = lazy(() => import('./App'));
const MlightCadViewerPage = lazy(() => import('./pages/MlightCadViewerPage'));

function ActiveViewer() {
  const { activeViewer } = useCadSession();

  return (
    <Suspense fallback={<div className="viewer-route-loading" aria-live="polite" />}>
      {activeViewer === 'mlightcad' ? <MlightCadViewerPage /> : <LegacyViewer />}
    </Suspense>
  );
}

export default function RootApp() {
  return (
    <CadSessionProvider>
      <ActiveViewer />
    </CadSessionProvider>
  );
}
