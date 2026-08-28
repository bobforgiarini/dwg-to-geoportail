import { Crosshair } from 'lucide-react';

export function MapCenterCrosshair() {
  return (
    <div className="map-center-crosshair" aria-hidden="true">
      <Crosshair size={15} strokeWidth={2} />
    </div>
  );
}
