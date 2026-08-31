import { lazy, Suspense } from 'react';
import { CadSessionProvider } from './session/CadSessionContext';

const MlightCadViewerPage = lazy(() => import('./pages/MlightCadViewerPage'));

export default function RootApp() {
  return (
    <CadSessionProvider>
      <Suspense fallback={<div className="viewer-route-loading" aria-live="polite" />}>
        <MlightCadViewerPage />
      </Suspense>
    </CadSessionProvider>
  );
}
