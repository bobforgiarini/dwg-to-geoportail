import { EyeOff, Layers3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SelectedCadObject } from '../types/models';

interface Props {
  selection: SelectedCadObject | null;
  layerName: string;
  onHideObject: () => void;
  onHideLayer: () => void;
}

export function SelectionPanel({ selection, layerName, onHideObject, onHideLayer }: Props) {
  const { t } = useTranslation();
  if (!selection) return null;
  return (
    <section className="selection-panel" aria-label={t('objectDetails')}>
      {selection && <>
        <header>
          <div><strong>{t('objectDetails')}</strong><small>{selection.cadType}</small></div>
        </header>
        <div className="selection-layer"><Layers3 size={16} /><span>{t('cadLayer')}</span><strong>{layerName || selection.layerId}</strong></div>
        {selection.label && <div className="selection-label">{selection.label}</div>}
        <div className="selection-actions">
          <button onClick={onHideObject}><EyeOff size={17} />{t('hideObject')}</button>
          <button onClick={onHideLayer}><Layers3 size={17} />{t('hideLayer')}</button>
        </div>
      </>}
    </section>
  );
}
