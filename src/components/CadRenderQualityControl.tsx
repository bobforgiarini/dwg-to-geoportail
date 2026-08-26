import { Gauge, ScanLine, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CadRenderQualityMode } from '../lib/mlightcad/renderQuality';

interface Props {
  value: CadRenderQualityMode;
  onChange: (value: CadRenderQualityMode) => void;
}

const QUALITY_OPTIONS = [
  { value: 'auto', icon: Gauge },
  { value: 'sharp', icon: ScanLine },
  { value: 'memory', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{
  value: CadRenderQualityMode;
  icon: typeof Gauge;
}>;

export function CadRenderQualityControl({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <section className="cad-quality-control" aria-label={t('cadQuality')}>
      <div className="quality-heading">
        <Gauge size={16} aria-hidden="true" />
        <span>{t('cadQuality')}</span>
      </div>
      <div className="quality-options">
        {QUALITY_OPTIONS.map(({ value: option, icon: Icon }) => {
          const label = t(`quality.${option}.label`);
          const ratio = t(`quality.${option}.ratio`);
          return (
            <button
              key={option}
              type="button"
              className={value === option ? 'active' : ''}
              aria-pressed={value === option}
              aria-label={`${label} · ${ratio}`}
              onClick={() => onChange(option)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
              <small>{ratio}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
