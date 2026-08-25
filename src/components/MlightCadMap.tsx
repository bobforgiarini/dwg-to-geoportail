import { useEffect, useMemo, useRef } from 'react';
import { Navigation2 } from 'lucide-react';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';
import Circle from 'ol/geom/Circle';
import Point from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { transform } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type TileWMS from 'ol/source/TileWMS';
import type WMTS from 'ol/source/WMTS';
import { useTranslation } from 'react-i18next';
import 'ol/ol.css';
import { LUREF_EXTENT } from '../lib/crs';
import { createBasemapLayer } from '../lib/geoportail';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type { BasemapMode, LocationTrackingState } from '../types/models';

interface Props {
  adapter: MlightCadViewerAdapter | null;
  basemapMode: BasemapMode;
  location: LocationTrackingState;
  onCoordinate: (coordinate: [number, number]) => void;
  onWmtsError: () => void;
}

export function MlightCadMap({ adapter, basemapMode, location, onCoordinate, onWmtsError }: Props) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseRef = useRef<TileLayer<WMTS | TileWMS> | null>(null);
  const locationSource = useMemo(() => new VectorSource(), []);
  const locationLayer = useMemo(() => new VectorLayer({
    source: locationSource,
    style: (feature) => feature.get('kind') === 'accuracy'
      ? new Style({
          fill: new Fill({ color: 'rgba(11,116,200,.16)' }),
          stroke: new Stroke({ color: 'rgba(11,116,200,.72)', width: 1.5 }),
        })
      : new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#0b74c8' }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
          }),
        }),
  }), [locationSource]);

  useEffect(() => {
    if (!target.current) return;
    const base = createBasemapLayer(basemapMode);
    baseRef.current = base;
    const center = transform([6.13, 49.61], 'EPSG:4326', 'EPSG:2169');
    const map = new Map({
      target: target.current,
      controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
      interactions: [],
      layers: [base, locationLayer],
      view: new View({
        center,
        constrainOnlyCenter: true,
        extent: LUREF_EXTENT,
        maxResolution: 500,
        minResolution: 0.01,
        projection: 'EPSG:2169',
        resolution: 50,
        rotation: 0,
      }),
    });
    mapRef.current = map;
    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [locationLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const replacement = createBasemapLayer(basemapMode);
    map.getLayers().setAt(0, replacement);
    baseRef.current = replacement;
    if (basemapMode === 'wmts') replacement.getSource()?.once('tileloaderror', onWmtsError);
  }, [basemapMode, onWmtsError]);

  useEffect(() => {
    if (!adapter) return;
    return adapter.events.camera.addEventListener(({ center, resolution }) => {
      const map = mapRef.current;
      if (!map) return;
      const view = map.getView();
      view.setCenter(center);
      view.setResolution(resolution);
      view.setRotation(0);
      onCoordinate(center);
      map.render();
    });
  }, [adapter, onCoordinate]);

  useEffect(() => {
    locationSource.clear();
    if (!location.position) return;
    const center = transform(
      [location.position.coords.longitude, location.position.coords.latitude],
      'EPSG:4326',
      'EPSG:2169',
    );
    locationSource.addFeatures([
      new Feature({ geometry: new Circle(center, location.position.coords.accuracy), kind: 'accuracy' }),
      new Feature({ geometry: new Point(center), kind: 'position' }),
    ]);
  }, [location.position, locationSource]);

  const alignNorth = () => {
    const map = mapRef.current;
    if (!map) return;
    map.getView().setRotation(0);
    map.render();
  };

  return <>
    <div ref={target} className="map-canvas mlightcad-map-canvas" aria-label="Geoportail" />
    <button className="compass-button mlightcad-north" onClick={alignNorth} aria-label={t('alignNorth')} title={t('alignNorth')}>
      <Navigation2 size={20} />
      <span>N</span>
    </button>
  </>;
}
