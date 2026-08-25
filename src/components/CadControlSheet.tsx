import type { ReactNode } from 'react';
import { FileUp, RotateCcw, Trash2, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { CadOpacityControl } from './CadOpacityControl';
import { LoadingSpinner } from './LoadingSpinner';

interface Props {
  open: boolean;
  file: File | null;
  entityCount: number;
  loading: boolean;
  loadingTitle: string;
  progressLabel: string;
  message: string | null;
  opacity: number;
  cadTextVisible: boolean;
  hiddenObjectCount: number;
  controlsDisabled: boolean;
  footer?: ReactNode;
  onClose: () => void;
  onDismissMessage: () => void;
  onChooseFile: () => void;
  onRemoveFile: () => void;
  onCancel: () => void;
  onOpacityChange: (value: number) => void;
  onToggleTexts: () => void;
  onRestoreHidden: () => void;
}

export function CadControlSheet({
  open,
  file,
  entityCount,
  loading,
  loadingTitle,
  progressLabel,
  message,
  opacity,
  cadTextVisible,
  hiddenObjectCount,
  controlsDisabled,
  footer,
  onClose,
  onDismissMessage,
  onChooseFile,
  onRemoveFile,
  onCancel,
  onOpacityChange,
  onToggleTexts,
  onRestoreHidden,
}: Props) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      modal
      className="cad-control-sheet"
      ariaLabel={t('cadControlsTitle')}
      closeLabel={t('close')}
      onClose={onClose}
    >
      <header className="sheet-header compact-sheet-header">
        <div>
          <h2>{t('cadControlsTitle')}</h2>
        </div>
      </header>

      {message && (
        <div className="notice" aria-live="polite">
          <span>{message}</span>
          <button onClick={onDismissMessage} aria-label={t('close')}><X size={17} /></button>
        </div>
      )}

      <section className="cad-control-section" aria-labelledby="dwg-control-title">
        <h3 id="dwg-control-title">{t('dwgFile')}</h3>
        {loading ? (
          <div className="loading-row" role="status" aria-live="polite">
            <LoadingSpinner />
            <div className="loading-copy"><strong>{loadingTitle}</strong><small>{progressLabel}</small></div>
            <button className="secondary-button compact" onClick={onCancel}>{t('cancel')}</button>
          </div>
        ) : file ? (
          <div className="file-row compact-file-row">
            <div className="file-icon"><FileUp size={20} /></div>
            <div className="file-meta">
              <strong>{file.name}</strong>
              <small>{t('fileSize', { size: (file.size / 1024 / 1024).toFixed(2) })} · {t('featureCount', { count: entityCount })}</small>
            </div>
            <button className="icon-button subtle" onClick={onRemoveFile} aria-label={t('remove')} title={t('remove')}><Trash2 size={18} /></button>
            <button className="primary-button compact" onClick={onChooseFile}><FileUp size={16} />{t('replace')}</button>
          </div>
        ) : (
          <div className="empty-import compact-empty-import">
            <div><strong>{t('noDwg')}</strong><small>{t('fileLocal')}</small></div>
            <button className="primary-button" onClick={onChooseFile}><FileUp size={18} />{t('chooseDwg')}</button>
          </div>
        )}
      </section>

      <section className="cad-control-section" aria-labelledby="display-control-title">
        <h3 id="display-control-title">{t('cadDisplay')}</h3>
        <CadOpacityControl value={opacity} onChange={onOpacityChange} />
        <div className="cad-display-actions">
          <button
            className={!cadTextVisible ? 'active' : ''}
            onClick={onToggleTexts}
            disabled={controlsDisabled}
          >
            <Type size={18} aria-hidden="true" />
            <span>{cadTextVisible ? t('hideTexts') : t('showTexts')}</span>
          </button>
          <button onClick={onRestoreHidden} disabled={controlsDisabled || hiddenObjectCount === 0}>
            <RotateCcw size={18} aria-hidden="true" />
            <span>{t('showHidden', { count: hiddenObjectCount })}</span>
            {hiddenObjectCount > 0 && <strong>{hiddenObjectCount}</strong>}
          </button>
        </div>
      </section>

      {footer}
    </BottomSheet>
  );
}
