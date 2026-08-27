import { MapPinned } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}

export function CadSpatialFilterControl({ enabled, disabled = false, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <label className="cad-spatial-filter-control">
      <span className="cad-spatial-filter-copy">
        <span><MapPinned size={16} aria-hidden="true" />{t('spatialFilter.title')}</span>
        <small>{t('spatialFilter.help')}</small>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
