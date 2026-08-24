import { Languages, MapPinned } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AppHeader() {
  const { t, i18n } = useTranslation();
  return (
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true"><MapPinned size={21} /></div>
      <div className="brand-copy">
        <strong>{t('appName')}</strong>
        <span>Geoportail · LUREF</span>
      </div>
      <label className="language-control" aria-label={t('language')}>
        <Languages size={18} aria-hidden="true" />
        <select value={i18n.resolvedLanguage ?? 'de'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
          <option value="de">DE</option><option value="fr">FR</option><option value="en">EN</option>
        </select>
      </label>
    </header>
  );
}
