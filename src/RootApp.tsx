import { lazy, Suspense } from 'react';
import App from './App';
import { CadSessionProvider, useCadSession } from './session/CadSessionContext';

const MlightCadViewerPage = lazy(() => import('./pages/MlightCadViewerPage'));

function ActiveViewer() {
  const { activeViewer } = useCadSession();

  if (activeViewer === 'mlightcad') {
    return (
      <Suspense fallback={<div className="viewer-route-loading" aria-live="polite" /> }>
        <MlightCadViewerPage />
      </Suspense>
    );
  }

  return <App />;
}

export default function RootApp() {
  return (
    <CadSessionProvider>
      <ActiveViewer />
    </CadSessionProvider>
  );
}
