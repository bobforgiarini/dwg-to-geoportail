import { Crosshair, EyeOff, LocateFixed, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BasemapMode } from '../types/models';

interface Props {
  basemapMode: BasemapMode;
  basemapVisible: boolean;
  coordinate: [number, number] | null;
  accuracy: number | null;
  onToggleBasemap: () => void;
}

export function MapStatusBadges({
  basemapMode,
  basemapVisible,
  coordinate,
  accuracy,
  onToggleBasemap,
}: Props) {
  const { t } = useTranslation();
  const basemapAction = basemapVisible ? t('hideBasemap') : t('showBasemap');

  return (
    <div className="map-status-stack">
      <button
        type="button"
        className={`map-status-card map-status-basemap ${basemapVisible ? 'is-active' : 'is-hidden'}`}
        onClick={onToggleBasemap}
        aria-pressed={basemapVisible}
        aria-label={t('basemapToggle')}
        title={basemapAction}
      >
        {basemapVisible ? <Map size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
        <span>{basemapVisible ? t(basemapMode === 'wmts' ? 'basemapWmts' : 'basemapWms') : t('basemapOff')}</span>
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
