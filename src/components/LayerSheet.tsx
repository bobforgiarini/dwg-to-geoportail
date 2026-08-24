import { Eye, EyeOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CadOverlayLayer } from '../types/models';
import { BottomSheet } from './BottomSheet';

interface Props {
  open: boolean;
  layers: CadOverlayLayer[];
  onClose: () => void;
  onToggle: (id: string) => void;
  onSetAll: (visible: boolean) => void;
}

export function LayerSheet({ open, layers, onClose, onToggle, onSetAll }: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} modal ariaLabel={t('layersTitle')} closeLabel={t('close')} onClose={onClose}>
        <header className="sheet-header">
          <div><h2 id="layer-title">{t('layersTitle')}</h2><span>{layers.length}</span></div>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}><X /></button>
        </header>
        <div className="sheet-actions">
          <button onClick={() => onSetAll(true)}><Eye size={18} />{t('showAll')}</button>
          <button onClick={() => onSetAll(false)}><EyeOff size={18} />{t('hideAll')}</button>
        </div>
        <div className="layer-list">
          {layers.map((layer) => (
            <label className="layer-row" key={layer.id}>
              <input type="checkbox" checked={layer.visible} onChange={() => onToggle(layer.id)} />
              <span className="layer-check" aria-hidden="true">{layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}</span>
              <span className="layer-name">{layer.name}</span>
              <small>{t('featureCount', { count: layer.featureCount })}</small>
            </label>
          ))}
        </div>
    </BottomSheet>
  );
}
