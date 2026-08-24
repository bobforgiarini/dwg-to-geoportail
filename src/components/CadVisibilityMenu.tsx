import { RotateCcw, Type } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  disabled: boolean;
  cadTextVisible: boolean;
  hiddenCount: number;
  onToggleTexts: () => void;
  onRestoreHidden: () => void;
}

export function CadVisibilityMenu({ disabled, cadTextVisible, hiddenCount, onToggleTexts, onRestoreHidden }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className={`cad-visibility-menu ${open ? 'open' : ''}`}>
      <div className="visibility-flyout" aria-hidden={!open} inert={!open ? true : undefined}>
        <button className={!cadTextVisible ? 'active' : ''} onClick={onToggleTexts} disabled={disabled} aria-label={cadTextVisible ? t('hideTexts') : t('showTexts')} title={cadTextVisible ? t('hideTexts') : t('showTexts')}>
          <Type size={22} />
        </button>
        <button onClick={onRestoreHidden} disabled={disabled || hiddenCount === 0} aria-label={t('showHidden', { count: hiddenCount })} title={t('showHidden', { count: hiddenCount })}>
          <RotateCcw size={21} />{hiddenCount > 0 && <span>{hiddenCount}</span>}
        </button>
      </div>
      <button className={open ? 'active' : ''} onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open} aria-label={t('cadVisibility')} title={t('cadVisibility')}>
        <Type size={22} />
      </button>
    </div>
  );
}
