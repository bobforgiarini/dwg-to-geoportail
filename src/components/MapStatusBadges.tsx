import { CloudOff, Crosshair, EyeOff, LocateFixed, Map, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BasemapHealthState } from '../lib/basemapHealth';

interface Props {
  basemapHealth: BasemapHealthState;
  basemapVisible: boolean;
  coordinate: [number, number] | null;
  accuracy: number | null;
  onToggleBasemap: () => void;
}

export function MapStatusBadges({
  basemapHealth,
  basemapVisible,
  coordinate,
  accuracy,
  onToggleBasemap,
}: Props) {
  const { t } = useTranslation();
  const basemapAction = basemapVisible ? t('hideBasemap') : t('showBasemap');
  const basemapLabel = !basemapVisible
    ? t('basemapOff')
    : basemapHealth.status === 'loading'
      ? t('basemapLoading')
      : basemapHealth.status === 'retrying'
        ? t('basemapRetrying')
        : basemapHealth.status === 'offline'
          ? t('basemapOffline')
          : basemapHealth.status === 'unavailable'
            ? t('basemapUnavailable')
            : t(basemapHealth.mode === 'wmts' ? 'basemapWmts' : 'basemapWms');
  const BasemapIcon = !basemapVisible
    ? EyeOff
    : basemapHealth.status === 'offline' || basemapHealth.status === 'unavailable'
      ? CloudOff
      : basemapHealth.status === 'loading' || basemapHealth.status === 'retrying'
        ? RefreshCw
        : Map;

  return (
    <div className="map-status-stack">
      <button
        type="button"
        className={`map-status-card map-status-basemap ${basemapVisible ? 'is-active' : 'is-hidden'} is-${basemapHealth.status}`}
        onClick={onToggleBasemap}
        aria-pressed={basemapVisible}
        aria-label={t('basemapToggle')}
        title={basemapAction}
      >
        <BasemapIcon size={14} aria-hidden="true" />
        <span>{basemapLabel}</span>
      </button>

      {coordinate && (
        <div className="map-status-card map-status-coordinate">
          <Crosshair size={14} aria-hidden="true" />
          <span>{t('coordinates', { x: coordinate[0].toFixed(2), y: coordinate[1].toFixed(2) })}</span>
        </div>
      )}

      {accuracy !== null && (
        <div className="map-status-card map-status-accuracy">
          <LocateFixed size={14} aria-hidden="true" />
          <span>{t('gpsAccuracy', { meters: Math.round(accuracy) })}</span>
        </div>
      )}
    </div>
  );
}
