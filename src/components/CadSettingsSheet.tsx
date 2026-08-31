import type { ReactNode } from 'react';
import { Boxes, Layers3, RotateCcw, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CadRenderQualityMode } from '../lib/mlightcad/renderQuality';
import { BottomSheet } from './BottomSheet';
import { CadOpacityControl } from './CadOpacityControl';
import { CadRenderQualityControl } from './CadRenderQualityControl';

interface Props {
  open: boolean;
  opacity: number;
  renderQuality: CadRenderQualityMode;
  cadTextVisible: boolean;
  hiddenObjectCount: number;
  hiddenLayerCount: number;
  hiddenBlockCount: number;
  controlsDisabled: boolean;
  footer?: ReactNode;
  onClose: () => void;
  onOpacityChange: (value: number) => void;
  onRenderQualityChange: (value: CadRenderQualityMode) => void;
  onToggleTexts: () => void;
  onRestoreHiddenObjects: () => void;
  onRestoreHiddenLayers: () => void;
  onRestoreHiddenBlocks: () => void;
}

interface RestoreButtonProps {
  count: number;
  disabled: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

function RestoreButton({ count, disabled, label, icon, onClick }: RestoreButtonProps) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled || count === 0}>
      {icon}
      <span>{label}</span>
      {count > 0 && <strong>{count}</strong>}
    </button>
  );
}

export function CadSettingsSheet({
  open,
  opacity,
  renderQuality,
  cadTextVisible,
  hiddenObjectCount,
  hiddenLayerCount,
  hiddenBlockCount,
  controlsDisabled,
  footer,
  onClose,
  onOpacityChange,
  onRenderQualityChange,
  onToggleTexts,
  onRestoreHiddenObjects,
  onRestoreHiddenLayers,
  onRestoreHiddenBlocks,
}: Props) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      modal
      className="cad-control-sheet cad-settings-sheet"
      ariaLabel={t('cadSettingsTitle')}
      closeLabel={t('close')}
      onClose={onClose}
    >
      <header className="sheet-header compact-sheet-header">
        <h2>{t('cadSettingsTitle')}</h2>
      </header>

      <section className="cad-control-section" aria-labelledby="cad-settings-display-title">
        <h3 id="cad-settings-display-title">{t('cadDisplay')}</h3>
        <CadOpacityControl value={opacity} onChange={onOpacityChange} />
        <CadRenderQualityControl value={renderQuality} onChange={onRenderQualityChange} />
        <div className="cad-display-actions cad-settings-actions">
          <button
            className={!cadTextVisible ? 'active' : ''}
            onClick={onToggleTexts}
            disabled={controlsDisabled}
          >
            <Type size={18} aria-hidden="true" />
            <span>{cadTextVisible ? t('hideTexts') : t('showTexts')}</span>
          </button>
          <RestoreButton
            count={hiddenObjectCount}
            disabled={controlsDisabled}
            label={t('showHidden', { count: hiddenObjectCount })}
            icon={<RotateCcw size={18} aria-hidden="true" />}
            onClick={onRestoreHiddenObjects}
          />
          <RestoreButton
            count={hiddenLayerCount}
            disabled={controlsDisabled}
            label={t('showHiddenLayers', { count: hiddenLayerCount })}
            icon={<Layers3 size={18} aria-hidden="true" />}
            onClick={onRestoreHiddenLayers}
          />
          <RestoreButton
            count={hiddenBlockCount}
            disabled={controlsDisabled}
            label={t('showHiddenBlocks', { count: hiddenBlockCount })}
            icon={<Boxes size={18} aria-hidden="true" />}
            onClick={onRestoreHiddenBlocks}
          />
        </div>
      </section>

      {footer}
    </BottomSheet>
  );
}
