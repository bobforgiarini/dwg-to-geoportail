import { Magnet, MapPin, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  calculateDistanceMeters,
  formatDistanceMeters,
  formatLurefCoordinate,
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

const SNAP_LABEL_KEYS: Record<CadSnapKind, string> = {
  endpoint: 'measurementSnapEndpoint',
  vertex: 'measurementSnapVertex',
  intersection: 'measurementSnapIntersection',
  midpoint: 'measurementSnapMidpoint',
  center: 'measurementSnapCenter',
  nearest: 'measurementSnapNearest',
};

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
  const firstPoint = measurement.phase === 'placing-second' || measurement.phase === 'complete'
    ? measurement.firstPoint
    : null;
  const secondPoint = completedMeasurement?.secondPoint ?? null;
  const instructionKey = measurement.phase === 'placing-second'
    ? 'measurementAimSecond'
    : complete
      ? 'measurementComplete'
      : 'measurementAimFirst';
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
      <header className={styles.header}>
        <Ruler size={18} aria-hidden="true" />
        <h2>{t('measurementTitle')}</h2>
      </header>

      <div className={styles.readout} role="status" aria-live="polite">
        {completedMeasurement ? (
          <>
            <span>{t('measurementDistance')}</span>
            <output>
              {formatDistanceMeters(
                calculateDistanceMeters(
                  completedMeasurement.firstPoint.coordinate,
                  completedMeasurement.secondPoint.coordinate,
                ),
                locale,
              )}
            </output>
          </>
        ) : (
          <p>{t(instructionKey)}</p>
        )}
      </div>

      {firstPoint && (
        <div className={styles.points}>
          <div>
            <MapPin size={15} aria-hidden="true" />
            <span>{t('measurementPointOne')}</span>
            <strong>{formatLurefCoordinate(firstPoint.coordinate, locale)}</strong>
          </div>
          {secondPoint && (
            <div>
              <MapPin size={15} aria-hidden="true" />
              <span>{t('measurementPointTwo')}</span>
              <strong>{formatLurefCoordinate(secondPoint.coordinate, locale)}</strong>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.snapToggle}
        aria-pressed={measurement.snapEnabled}
        onClick={() => onSnapEnabledChange(!measurement.snapEnabled)}
      >
        <Magnet size={17} aria-hidden="true" />
        <span>{t('measurementCadSnap')}</span>
        <i aria-hidden="true" />
      </button>

      {measurement.snapEnabled && snapKind && !complete && (
        <p className={styles.snapFound}>
          {t('measurementSnapFound', { kind: t(SNAP_LABEL_KEYS[snapKind]) })}
        </p>
      )}

      <button
        type="button"
        className={styles.primaryAction}
        onClick={complete ? onRestart : onSetPoint}
      >
        {t(actionKey)}
      </button>
    </BottomSheet>
  );
}
