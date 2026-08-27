import { Blend, DraftingCompass, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  appearanceForProfile,
  normalizeFillOpacity,
  type CadAppearanceProfile,
  type CadAppearanceSettings,
  withFillOpacity,
} from '../lib/cad/appearance';

interface Props {
  value: CadAppearanceSettings;
  disabled?: boolean;
  onChange: (value: CadAppearanceSettings) => void;
}

export function CadAppearanceControl({ value, disabled = false, onChange }: Props) {
  const { t } = useTranslation();
  const fillOpacity = normalizeFillOpacity(value.fillOpacity);
  const selectProfile = (profile: CadAppearanceProfile) => onChange(appearanceForProfile(profile));

  return (
    <section className="cad-appearance-control" aria-label={t('appearance.title')}>
      <div className="opacity-heading">
        <DraftingCompass size={16} aria-hidden="true" />
        <span>{t('appearance.title')}</span>
      </div>
      <div className="appearance-presets" role="group" aria-label={t('appearance.profile')}>
        <button
          type="button"
          aria-label={`${t('appearance.profile')}: ${t('appearance.original')}`}
          className={value.profile === 'original' ? 'active' : ''}
          disabled={disabled}
          onClick={() => selectProfile('original')}
        >
          <DraftingCompass size={14} aria-hidden="true" />{t('appearance.original')}
        </button>
        <button
          type="button"
          aria-label={`${t('appearance.profile')}: ${t('appearance.map')}`}
          className={value.profile === 'map' ? 'active' : ''}
          disabled={disabled}
          onClick={() => selectProfile('map')}
        >
          <Map size={14} aria-hidden="true" />{t('appearance.map')}
        </button>
      </div>
      <div className="opacity-heading compact-opacity-heading">
        <Blend size={15} aria-hidden="true" />
        <span>{t('appearance.fillOpacity')}</span>
        <strong>{fillOpacity}%</strong>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={fillOpacity}
        disabled={disabled}
        aria-label={t('appearance.fillOpacity')}
        onChange={(event) => onChange(withFillOpacity(value, Number(event.target.value)))}
      />
      <small className="appearance-help">{t('appearance.fillHelp')}</small>
    </section>
  );
}
