import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { defaults as defaultControls } from 'ol/control/defaults';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Circle from 'ol/geom/Circle';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import Text from 'ol/style/Text';
import CircleStyle from 'ol/style/Circle';
import { fromLonLat, transformExtent } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';
import type TileWMS from 'ol/source/TileWMS';
import type WMTS from 'ol/source/WMTS';
import type Geometry from 'ol/geom/Geometry';
import 'ol/ol.css';
import { createBasemapLayer } from '../lib/geoportail';
import { mapToLuref } from '../lib/crs';
import type { BasemapMode, DwgImportResult, LocationTrackingState, SelectedCadObject } from '../types/models';

interface Props {
  dwg: DwgImportResult | null;
  visibleLayers: Set<string>;
  location: LocationTrackingState;
  basemapMode: BasemapMode;
  onWmtsError: () => void;
  onManualMove: () => void;
  onCoordinate: (coordinate: Coordinate) => void;
  hiddenFeatureIds: Set<string>;
  selectedFeatureId: string | null;
  onCadSelect: (selection: SelectedCadObject | null) => void;
  cadTextVisible: boolean;
}

export function MapCanvas({ dwg, visibleLayers, location, basemapMode, onWmtsError, onManualMove, onCoordinate, hiddenFeatureIds, selectedFeatureId, onCadSelect, cadTextVisible }: Props) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseRef = useRef<TileLayer<WMTS | TileWMS> | null>(null);
  const cadSource = useMemo(() => new VectorSource(), []);
  const locationSource = useMemo(() => new VectorSource(), []);
  const visibleRef = useRef(visibleLayers);
  const hiddenRef = useRef(hiddenFeatureIds);
  const selectedRef = useRef(selectedFeatureId);
  const onCadSelectRef = useRef(onCadSelect);
  const cadTextVisibleRef = useRef(cadTextVisible);
  const [rotation, setRotation] = useState(0);
  visibleRef.current = visibleLayers;
  hiddenRef.current = hiddenFeatureIds;
  selectedRef.current = selectedFeatureId;
  onCadSelectRef.current = onCadSelect;
  cadTextVisibleRef.current = cadTextVisible;

  const cadLayer = useMemo(() => new VectorLayer({
    source: cadSource,
    declutter: true,
    style: (feature) => {
      if (!visibleRef.current.has(String(feature.get('layerId')))) return undefined;
      if (!cadTextVisibleRef.current && feature.get('isCadText') === true) return undefined;
      const featureId = String(feature.get('featureId') ?? feature.getId() ?? '');
      if (hiddenRef.current.has(featureId)) return undefined;
      const color = String(feature.get('cadColor') || '#f1be88');
      const label = String(feature.get('label') || '');
      const selected = selectedRef.current === featureId;
      const selection = new Style({
        stroke: new Stroke({ color: '#f1be88', width: 8 }),
        fill: new Fill({ color: 'rgba(241,190,136,.28)' }),
        image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(241,190,136,.25)' }), stroke: new Stroke({ color: '#f1be88', width: 3 }) }),
      });
      const halo = new Style({ stroke: new Stroke({ color: 'rgba(0,0,0,.72)', width: 5 }) });
      const foreground = new Style({
        stroke: new Stroke({ color, width: 2 }),
        fill: new Fill({ color: `${color}55` }),
        image: new CircleStyle({ radius: 4, fill: new Fill({ color }), stroke: new Stroke({ color: '#051c2c', width: 2 }) }),
        text: label ? new Text({
          text: label,
          font: '600 12px system-ui, sans-serif',
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#051c2c', width: 4 }),
          offsetY: -10,
        }) : undefined,
      });
      return selected ? [selection, halo, foreground] : [halo, foreground];
    },
  }), [cadSource]);

  const locationLayer = useMemo(() => new VectorLayer({
    source: locationSource,
    style: (feature) => feature.get('kind') === 'accuracy'
      ? new Style({ fill: new Fill({ color: 'rgba(11,116,200,.16)' }), stroke: new Stroke({ color: 'rgba(11,116,200,.7)', width: 1.5 }) })
      : new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#0b74c8' }), stroke: new Stroke({ color: '#fff', width: 3 }) }) }),
  }), [locationSource]);

  useEffect(() => {
    if (!target.current) return;
    const base = createBasemapLayer(basemapMode);
    baseRef.current = base;
    const map = new Map({
      target: target.current,
      layers: [base, cadLayer, locationLayer],
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }),
      view: new View({ center: fromLonLat([6.13, 49.61]), zoom: 12, minZoom: 7, maxZoom: 21 }),
    });
    mapRef.current = map;
    const updateCoordinate = () => onCoordinate(mapToLuref(map.getView().getCenter() ?? [0, 0]));
    map.on('moveend', updateCoordinate);
    map.on('pointerdrag', onManualMove);
    map.on('singleclick', (event) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        hitTolerance: 8,
        layerFilter: (layer) => layer === cadLayer,
      });
      if (!feature || typeof feature.get !== 'function') {
        onCadSelectRef.current(null);
        return;
      }
      const featureId = String(feature.get('featureId') ?? feature.getId() ?? '');
      if (!featureId || hiddenRef.current.has(featureId)) return;
      onCadSelectRef.current({
        featureId,
        layerId: String(feature.get('layerId') ?? '0'),
        cadType: String(feature.get('cadType') ?? 'CAD'),
        label: String(feature.get('label') ?? ''),
      });
    });
    const updateRotation = () => setRotation(map.getView().getRotation());
    map.getView().on('change:rotation', updateRotation);
    updateCoordinate();
    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [cadLayer, locationLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const previous = baseRef.current;
    const replacement = createBasemapLayer(basemapMode);
    if (previous) map.getLayers().setAt(0, replacement);
    baseRef.current = replacement;
    if (basemapMode === 'wmts') replacement.getSource()?.once('tileloaderror', onWmtsError);
  }, [basemapMode, onWmtsError]);

  useEffect(() => {
    cadSource.clear();
    if (!dwg) return;
    cadSource.addFeatures(dwg.features as Feature<Geometry>[]);
    const extent = dwg.lurefExtent
      ? transformExtent(dwg.lurefExtent, 'EPSG:2169', 'EPSG:3857')
      : cadSource.getExtent();
    if (extent.every(Number.isFinite)) mapRef.current?.getView().fit(extent, { padding: [96, 24, 190, 24], maxZoom: 20, duration: 500 });
  }, [cadSource, dwg]);

  useEffect(() => { cadLayer.changed(); }, [cadLayer, cadTextVisible, hiddenFeatureIds, selectedFeatureId, visibleLayers]);

  useEffect(() => {
    locationSource.clear();
    if (!location.position) return;
    const center = fromLonLat([location.position.coords.longitude, location.position.coords.latitude]);
    locationSource.addFeatures([
      new Feature({ geometry: new Circle(center, location.position.coords.accuracy), kind: 'accuracy' }),
      new Feature({ geometry: new Point(center), kind: 'position' }),
    ]);
    if (location.follow === 'following') mapRef.current?.getView().animate({ center, zoom: Math.max(mapRef.current.getView().getZoom() ?? 17, 17), duration: 350 });
  }, [location, locationSource]);

  const alignNorth = () => mapRef.current?.getView().animate({ rotation: 0, duration: 300 });

  return <>
    <div ref={target} className="map-canvas" role="application" aria-label="Geoportail" />
    <button
      className={`compass-button${Math.abs(rotation) > 0.001 ? ' rotated' : ''}`}
      onClick={alignNorth}
      disabled={Math.abs(rotation) <= 0.001}
      aria-label={t('alignNorth')}
      title={t('alignNorth')}
    >
      <Navigation2 size={22} style={{ transform: `rotate(${rotation}rad)` }} />
      <span>N</span>
    </button>
  </>;
}
