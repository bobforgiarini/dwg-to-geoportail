import { Magnet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  calculateDistanceMeters,
  formatDistanceMeters,
} from '../lib/measurement';
import type { CadSnapKind, DistanceMeasurementState } from '../types/models';
import { BottomSheet } from './BottomSheet';
import styles from './DistanceMeasurementSheet.module.css';

interface Props {
  open: boolean;
  measurement: DistanceMeasurementState;
  snapKind?: CadSnapKind | null;
  onClose: () => void;
  onSetPoint: () => void;
  onRestart: () => void;
  onSnapEnabledChange: (enabled: boolean) => void;
}

export function DistanceMeasurementSheet({
  open,
  measurement,
  snapKind = null,
  onClose,
  onSetPoint,
  onRestart,
  onSnapEnabledChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'de';
  const completedMeasurement = measurement.phase === 'complete' ? measurement : null;
  const complete = completedMeasurement !== null;
  const actionKey = measurement.phase === 'placing-second'
    ? 'measurementSetSecondPoint'
    : complete
      ? 'measurementNew'
      : 'measurementSetFirstPoint';

  return (
    <BottomSheet
      open={open}
      className={styles.sheet}
      ariaLabel={t('measurementTitle')}
      closeLabel={t('measurementClose')}
      onClose={onClose}
    >
      {completedMeasurement && (
        <output className={styles.result} aria-live="polite">
          <span>{t('measurementDistance')}</span>
          <strong>
            {formatDistanceMeters(
              calculateDistanceMeters(
                completedMeasurement.firstPoint.coordinate,
                completedMeasurement.secondPoint.coordinate,
              ),
              locale,
            )}
          </strong>
        </output>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.snapToggle}
          aria-pressed={measurement.snapEnabled}
          data-snap-kind={snapKind ?? undefined}
          onClick={() => onSnapEnabledChange(!measurement.snapEnabled)}
        >
          <Magnet size={17} aria-hidden="true" />
          <span>{t('measurementCadSnap')}</span>
          <i aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles.primaryAction}
          onClick={complete ? onRestart : onSetPoint}
        >
          {t(actionKey)}
        </button>
      </div>
    </BottomSheet>
  );
}
