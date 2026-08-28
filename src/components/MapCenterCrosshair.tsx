import { Plus } from 'lucide-react';

export function MapCenterCrosshair() {
  return (
    <div className="map-viewport-overlay" aria-hidden="true">
      <div className="map-center-crosshair">
        <Plus size={14} strokeWidth={1.7} />
      </div>
    </div>
  );
}
