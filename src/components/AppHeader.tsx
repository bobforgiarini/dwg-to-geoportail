import { Languages, MapPinned, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../package.json';

interface Props {
  settingsOpen: boolean;
  onOpenSettings: () => void;
}

export function AppHeader({ settingsOpen, onOpenSettings }: Props) {
  const { t, i18n } = useTranslation();

  return (
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true"><MapPinned size={21} /></div>
      <div className="brand-copy">
        <strong>{t('appName')}</strong>
        <span>v{packageJson.version}</span>
      </div>
      <button
        type="button"
        className={`header-settings-button ${settingsOpen ? 'active' : ''}`}
        aria-label={t('cadSettingsTitle')}
        title={t('cadSettingsTitle')}
        aria-expanded={settingsOpen}
        onClick={onOpenSettings}
      >
        <Settings2 size={19} aria-hidden="true" />
      </button>
      <label className="language-control" aria-label={t('language')}>
        <Languages size={18} aria-hidden="true" />
        <select value={i18n.resolvedLanguage ?? 'de'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
          <option value="de">DE</option><option value="fr">FR</option><option value="en">EN</option>
        </select>
      </label>
    </header>
  );
}
