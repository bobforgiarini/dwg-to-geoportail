import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import styles from './ConfirmationSheet.module.css';

export interface ConfirmationSheetProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmationSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmationSheetProps) {
  const { t } = useTranslation();
  const resolvedCancelLabel = cancelLabel ?? t('confirmation.cancel');

  return (
    <BottomSheet
      open={open}
      modal
      className={styles.sheet}
      ariaLabel={title}
      closeLabel={t('closeDrawer')}
      onClose={busy ? () => undefined : onClose}
    >
      <div className={styles.content} aria-busy={busy || undefined}>
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden="true"><AlertTriangle size={18} /></span>
          <div>
            <h2>{title}</h2>
            <div className={styles.description}>{description}</div>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={busy} onClick={onClose}>
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.confirm} ${tone === 'danger' ? styles.danger : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

