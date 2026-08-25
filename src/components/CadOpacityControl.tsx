import { Blend, Map, SquareStack } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MLIGHTCAD_OPACITY_PRESETS, normalizeCadOpacity } from '../lib/mlightcad/opacity';

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export function CadOpacityControl({ value, onChange }: Props) {
  const { t } = useTranslation();
  const normalized = normalizeCadOpacity(value);

  return (
    <section className="cad-opacity-control" aria-label={t('cadOpacity')}>
      <div className="opacity-heading">
        <Blend size={16} aria-hidden="true" />
        <span>{t('cadOpacity')}</span>
        <strong>{normalized}%</strong>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={normalized}
        aria-label={t('cadOpacity')}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="opacity-presets">
        <button className={normalized === MLIGHTCAD_OPACITY_PRESETS.map ? 'active' : ''} onClick={() => onChange(MLIGHTCAD_OPACITY_PRESETS.map)}>
          <Map size={14} aria-hidden="true" />{t('opacityMap')}
        </button>
        <button className={normalized === MLIGHTCAD_OPACITY_PRESETS.mix ? 'active' : ''} onClick={() => onChange(MLIGHTCAD_OPACITY_PRESETS.mix)}>
          <Blend size={14} aria-hidden="true" />{t('opacityMix')}
        </button>
        <button className={normalized === MLIGHTCAD_OPACITY_PRESETS.cad ? 'active' : ''} onClick={() => onChange(MLIGHTCAD_OPACITY_PRESETS.cad)}>
          <SquareStack size={14} aria-hidden="true" />{t('opacityCad')}
        </button>
      </div>
    </section>
  );
}
