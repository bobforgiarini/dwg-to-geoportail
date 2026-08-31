import { Boxes, Focus, Layers3, LocateFixed, Ruler, Settings2, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LocationFollowMode } from '../types/models';

interface Props {
  locationMode: LocationFollowMode;
  fitDisabled: boolean;
  layerCount: number;
  blockCount: number;
  blocksOpen: boolean;
  settingsOpen: boolean;
  measurementActive: boolean;
  onLocation: () => void;
  onFitDrawing: () => void;
  onOpenLayerSheet: () => void;
  onOpenBlocks: () => void;
  onToggleSettings: () => void;
  onToggleMeasurement: () => void;
}

export function MapActionControls({
  locationMode,
  fitDisabled,
  layerCount,
  blockCount,
  blocksOpen,
  settingsOpen,
  measurementActive,
  onLocation,
  onFitDrawing,
  onOpenLayerSheet,
  onOpenBlocks,
  onToggleSettings,
  onToggleMeasurement,
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
          onClick={onOpenLayerSheet}
          disabled={layerCount === 0}
          aria-label={t('layers')}
          title={t('layers')}
        >
          <Layers3 size={22} aria-hidden="true" />
          {layerCount > 0 && <span className="map-action-count">{layerCount}</span>}
        </button>
        <button
          type="button"
          className={blocksOpen ? 'active' : ''}
          onClick={onOpenBlocks}
          disabled={blockCount === 0}
          aria-expanded={blocksOpen}
          aria-label={t('blocksTitle')}
          title={t('blocksTitle')}
        >
          <Boxes size={21} aria-hidden="true" />
          {blockCount > 0 && <span className="map-action-count">{blockCount}</span>}
        </button>
        <button
          type="button"
          className={settingsOpen ? 'active' : ''}
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-label={t('cadSettingsTitle')}
          title={t('cadSettingsTitle')}
        >
          <Settings2 size={21} aria-hidden="true" />
        </button>
      </div>

      <div className="map-action-group map-action-group-bottom">
        <button
          type="button"
          className={measurementActive ? 'active' : ''}
          onClick={onToggleMeasurement}
          aria-pressed={measurementActive}
          aria-label={t(measurementActive ? 'measurementClose' : 'measurementOpen')}
          title={t(measurementActive ? 'measurementClose' : 'measurementOpen')}
        >
          <Ruler size={21} aria-hidden="true" />
        </button>
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
