import { Boxes, BringToFront, EyeOff, Layers3, SendToBack } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SelectedCadObject } from '../types/models';

interface Props {
  selection: SelectedCadObject | null;
  layerName: string;
  onHideObject: () => void;
  onHideLayer: () => void;
  onHideBlock?: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  drawOrderMessage?: string | null;
}

export function SelectionPanel({ selection, layerName, onHideObject, onHideLayer, onHideBlock, onBringToFront, onSendToBack, drawOrderMessage }: Props) {
  const { t } = useTranslation();
  if (!selection) return null;
  return (
    <section className="selection-panel" aria-label={t('objectDetails')}>
      {selection && <>
        <header>
          <div><strong>{t('objectDetails')}</strong><small>{selection.cadType}</small></div>
        </header>
        <div className="selection-layer"><Layers3 size={16} /><span>{t('cadLayer')}</span><strong>{layerName || selection.layerId}</strong></div>
        {selection.blockPath.length > 0 && (
          <div className="selection-layer"><Boxes size={16} /><span>{t('cadBlock')}</span><strong>{selection.blockPath.join(' › ')}</strong></div>
        )}
        {selection.label && <div className="selection-label">{selection.label}</div>}
        <div className="selection-actions selection-order-actions">
          <button onClick={onSendToBack}><SendToBack size={17} />{t('sendToBack')}</button>
          <button onClick={onBringToFront}><BringToFront size={17} />{t('bringToFront')}</button>
        </div>
        {drawOrderMessage && <p className="selection-action-message" role="status">{drawOrderMessage}</p>}
        <div className="selection-actions">
          <button onClick={onHideObject}><EyeOff size={17} />{t('hideObject')}</button>
          <button onClick={onHideLayer}><Layers3 size={17} />{t('hideLayer')}</button>
          {selection.blockPath.length > 0 && onHideBlock && <button onClick={onHideBlock}><Boxes size={17} />{t('hideBlock')}</button>}
        </div>
      </>}
    </section>
  );
}
