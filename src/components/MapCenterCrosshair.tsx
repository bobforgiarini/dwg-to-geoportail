import { Plus } from 'lucide-react';

export function MapCenterCrosshair() {
  return (
    <div className="map-center-crosshair" aria-hidden="true">
      <Plus size={14} strokeWidth={1.7} />
    </div>
  );
}
