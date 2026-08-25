import { Focus, Layers3, LocateFixed, SlidersHorizontal, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LocationFollowMode } from '../types/models';

interface Props {
  locationMode: LocationFollowMode;
  fitDisabled: boolean;
  layerCount: number;
  cadControlsOpen: boolean;
  hiddenObjectCount: number;
  onLocation: () => void;
  onFitDrawing: () => void;
  onOpenLayers: () => void;
  onToggleCadControls: () => void;
}

export function MapActionControls({
  locationMode,
  fitDisabled,
  layerCount,
  cadControlsOpen,
  hiddenObjectCount,
  onLocation,
  onFitDrawing,
  onOpenLayers,
  onToggleCadControls,
}: Props) {
  const { t } = useTranslation();
  const locationLabel = locationMode === 'off'
    ? t('locationStart')
    : locationMode === 'paused' ? t('locationResume') : t('locationStop');

  return (
    <div className="map-action-controls" role="group" aria-label={t('mapActions')}>
      <div className="map-action-group map-action-group-top">
        <button
          type="button"
          onClick={onOpenLayers}
          disabled={layerCount === 0}
          aria-label={t('layers')}
          title={t('layers')}
        >
          <Layers3 size={22} aria-hidden="true" />
          {layerCount > 0 && <span className="map-action-count">{layerCount}</span>}
        </button>
        <button
          type="button"
          className={cadControlsOpen ? 'active' : ''}
          onClick={onToggleCadControls}
          aria-expanded={cadControlsOpen}
          aria-label={t('openCadControls')}
          title={t('openCadControls')}
        >
          <SlidersHorizontal size={21} aria-hidden="true" />
          {hiddenObjectCount > 0 && <span className="map-action-count">{hiddenObjectCount}</span>}
        </button>
      </div>

      <div className="map-action-group map-action-group-bottom">
        <button
          type="button"
          className={locationMode !== 'off' ? 'active' : ''}
          onClick={onLocation}
          aria-label={locationLabel}
          title={locationLabel}
        >
          {locationMode === 'following'
            ? <Square size={20} aria-hidden="true" />
            : <LocateFixed size={22} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onFitDrawing}
          disabled={fitDisabled}
          aria-label={t('fitDrawing')}
          title={t('fitDrawing')}
        >
          <Focus size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
