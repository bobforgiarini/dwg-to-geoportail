import type { ReactNode } from 'react';
import { FileUp, ListChecks, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { CadSpatialFilterControl } from './CadSpatialFilterControl';
import { LoadingSpinner } from './LoadingSpinner';

interface Props {
  open: boolean;
  file: File | null;
  entityCount: number;
  loading: boolean;
  loadingTitle: string;
  progressLabel: string;
  message: string | null;
  preparationAvailable?: boolean;
  spatialFilterEnabled: boolean;
  footer?: ReactNode;
  onClose: () => void;
  onDismissMessage: () => void;
  onChooseFile: () => void;
  onRemoveFile: () => void;
  onCancel: () => void;
  onOpenPreparation?: () => void;
  onSpatialFilterChange: (enabled: boolean) => void;
}

export function DwgControlSheet({
  open,
  file,
  entityCount,
  loading,
  loadingTitle,
  progressLabel,
  message,
  preparationAvailable = false,
  spatialFilterEnabled,
  footer,
  onClose,
  onDismissMessage,
  onChooseFile,
  onRemoveFile,
  onCancel,
  onOpenPreparation,
  onSpatialFilterChange,
}: Props) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      modal
      className="cad-control-sheet dwg-control-sheet"
      ariaLabel={t('dwgControlsTitle')}
      closeLabel={t('close')}
      onClose={onClose}
    >
      <header className="sheet-header compact-sheet-header">
        <h2>{t('dwgControlsTitle')}</h2>
      </header>

      {message && (
        <div className="notice" aria-live="polite">
          <span>{message}</span>
          <button onClick={onDismissMessage} aria-label={t('close')}><X size={17} /></button>
        </div>
      )}

      <section className="cad-control-section" aria-labelledby="dwg-file-control-title">
        <h3 id="dwg-file-control-title">{t('dwgFile')}</h3>
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
        {!loading && file && preparationAvailable && onOpenPreparation && (
          <button className="secondary-button preparation-open-button" onClick={onOpenPreparation}>
            <ListChecks size={17} aria-hidden="true" />
            {t('openPreparation')}
          </button>
        )}
      </section>

      <section className="cad-control-section" aria-label={t('spatialFilter.title')}>
        <CadSpatialFilterControl
          enabled={spatialFilterEnabled}
          disabled={loading}
          onChange={onSpatialFilterChange}
        />
      </section>

      {footer}
    </BottomSheet>
  );
}
