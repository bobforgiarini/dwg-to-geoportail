import { Boxes, Languages, MapPinned } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCadSession, type ViewerKind } from '../session/CadSessionContext';

export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { activeViewer, getViewerHref, setViewer } = useCadSession();

  const targetViewer: ViewerKind = activeViewer === 'legacy' ? 'mlightcad' : 'legacy';
  const viewerToggleLabel = activeViewer === 'legacy' ? t('switchToMlight') : t('switchToLegacy');

  return (
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true"><MapPinned size={21} /></div>
      <div className="brand-copy">
        <strong>{t('appName')}</strong>
        <span>v0.2.1</span>
      </div>
      <a
        className="viewer-toggle"
        href={getViewerHref(targetViewer)}
        aria-label={viewerToggleLabel}
        title={viewerToggleLabel}
        onClick={(event) => {
          event.preventDefault();
          setViewer(targetViewer);
        }}
      >
        {targetViewer === 'legacy' ? <MapPinned size={18} aria-hidden="true" /> : <Boxes size={18} aria-hidden="true" />}
        <span>{targetViewer === 'legacy' ? 'OL' : 'ML'}</span>
      </a>
      <label className="language-control" aria-label={t('language')}>
        <Languages size={18} aria-hidden="true" />
        <select value={i18n.resolvedLanguage ?? 'de'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
          <option value="de">DE</option><option value="fr">FR</option><option value="en">EN</option>
        </select>
      </label>
    </header>
  );
}
