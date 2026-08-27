import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import type { BasemapHealthReporter, BasemapHealthState } from '../lib/basemapHealth';
import { bindBasemapSourceHealth, createBasemapLayer } from '../lib/geoportail';
import { mapToLuref } from '../lib/crs';
import { normalizeCadOpacity } from '../lib/mlightcad/opacity';
import type { CadObjectDrawOrder, DwgImportResult, LocationTrackingState, SelectedCadObject } from '../types/models';
import { browserPreflightDevice } from '../lib/cad/importRecovery';
import { cadObjectDrawOrderZIndex } from '../lib/cad/drawOrder';
import { normalizeFillOpacity, type CadAppearanceSettings } from '../lib/cad/appearance';

interface Props {
  dwg: DwgImportResult | null;
  visibleLayers: Set<string>;
  location: LocationTrackingState;
  basemapHealth: BasemapHealthState;
  basemapHealthReporter: BasemapHealthReporter;
  basemapVisible: boolean;
  basemapSuspended?: boolean;
  onManualMove: () => void;
  onCoordinate: (coordinate: Coordinate) => void;
  hiddenFeatureIds: Set<string>;
  hiddenObjectKeys: Set<string>;
  hiddenBlockNames: Set<string>;
  selectedFeatureId: string | null;
  onCadSelect: (selection: SelectedCadObject | null) => void;
  cadTextVisible: boolean;
  cadOpacity: number;
  objectDrawOrder: CadObjectDrawOrder;
  appearance: CadAppearanceSettings;
  fitOnDwgChange?: boolean;
}

export interface MapCanvasHandle {
  fitDrawing: () => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ dwg, visibleLayers, location, basemapHealth, basemapHealthReporter, basemapVisible, basemapSuspended = false, onManualMove, onCoordinate, hiddenFeatureIds, hiddenObjectKeys, hiddenBlockNames, selectedFeatureId, onCadSelect, cadTextVisible, cadOpacity, objectDrawOrder, appearance, fitOnDwgChange = true }, ref) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const memoryConstrained = useRef(browserPreflightDevice().mobile === true);
  const baseRef = useRef<TileLayer<WMTS | TileWMS> | null>(null);
  const basemapVisibleRef = useRef(basemapVisible);
  const cadSource = useMemo(() => new VectorSource(), []);
  const locationSource = useMemo(() => new VectorSource(), []);
  const visibleRef = useRef(visibleLayers);
  const hiddenRef = useRef(hiddenFeatureIds);
  const hiddenObjectKeysRef = useRef(hiddenObjectKeys);
  const hiddenBlocksRef = useRef(hiddenBlockNames);
  const selectedRef = useRef(selectedFeatureId);
  const onCadSelectRef = useRef(onCadSelect);
  const cadTextVisibleRef = useRef(cadTextVisible);
  const drawOrderRef = useRef(objectDrawOrder);
  const appearanceRef = useRef(appearance);
  const [rotation, setRotation] = useState(0);
  visibleRef.current = visibleLayers;
  hiddenRef.current = hiddenFeatureIds;
  hiddenObjectKeysRef.current = hiddenObjectKeys;
  hiddenBlocksRef.current = hiddenBlockNames;
  selectedRef.current = selectedFeatureId;
  onCadSelectRef.current = onCadSelect;
  cadTextVisibleRef.current = cadTextVisible;
  drawOrderRef.current = objectDrawOrder;
  appearanceRef.current = appearance;
  basemapVisibleRef.current = basemapVisible;

  const cadLayer = useMemo(() => new VectorLayer({
    source: cadSource,
    declutter: true,
    style: (feature) => {
      if (!visibleRef.current.has(String(feature.get('layerId')))) return undefined;
      const blockPath = (feature.get('blockPath') as string[] | undefined) ?? [];
      if (blockPath.some((name) => hiddenBlocksRef.current.has(name.toLocaleLowerCase('en-US')))) return undefined;
      if (!cadTextVisibleRef.current && feature.get('isCadText') === true) return undefined;
      const featureId = String(feature.get('featureId') ?? feature.getId() ?? '');
      const objectKey = String(feature.get('objectKey') ?? featureId);
      if (hiddenRef.current.has(featureId) || hiddenObjectKeysRef.current.has(objectKey)) return undefined;
      const color = String(feature.get('cadColor') || '#f1be88');
      const label = String(feature.get('label') || '');
      const selected = selectedRef.current === featureId;
      const drawOrderGroupKey = String(feature.get('drawOrderGroupKey') ?? objectKey);
      const zIndex = cadObjectDrawOrderZIndex(drawOrderRef.current, drawOrderGroupKey);
      const mapProfile = appearanceRef.current.profile === 'map';
      const fillOpacity = normalizeFillOpacity(appearanceRef.current.fillOpacity) / 100;
      const fillColor = color.startsWith('#') && (color.length === 4 || color.length === 7)
        ? `${color}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}`
        : color;
      const selection = new Style({
        stroke: new Stroke({ color: '#f1be88', width: 8 }),
        fill: new Fill({ color: 'rgba(241,190,136,.28)' }),
        image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(241,190,136,.25)' }), stroke: new Stroke({ color: '#f1be88', width: 3 }) }),
        zIndex,
      });
      const halo = new Style({ stroke: new Stroke({ color: mapProfile ? 'rgba(0,0,0,.86)' : 'rgba(0,0,0,.72)', width: mapProfile ? 6 : 5 }), zIndex });
      const foreground = new Style({
        stroke: new Stroke({ color, width: mapProfile ? 2.5 : 2 }),
        fill: new Fill({ color: fillColor }),
        image: new CircleStyle({ radius: mapProfile ? 4.5 : 4, fill: new Fill({ color }), stroke: new Stroke({ color: '#051c2c', width: mapProfile ? 2.5 : 2 }) }),
        text: label ? new Text({
          text: label,
          font: `${mapProfile ? '700 13px' : '600 12px'} system-ui, sans-serif`,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#051c2c', width: mapProfile ? 5 : 4 }),
          offsetY: -10,
        }) : undefined,
        zIndex,
      });
      return selected ? [selection, halo, foreground] : [halo, foreground];
    },
  }), [cadSource]);

  const fitDrawing = useCallback(() => {
    if (!dwg) return;
    const extent = dwg.lurefExtent
      ? transformExtent(dwg.lurefExtent, 'EPSG:2169', 'EPSG:3857')
      : cadSource.getExtent();
    if (extent.every(Number.isFinite)) {
      mapRef.current?.getView().fit(extent, { padding: [80, 24, 80, 24], maxZoom: 20, duration: 500 });
    }
  }, [cadSource, dwg]);

  useImperativeHandle(ref, () => ({ fitDrawing }), [fitDrawing]);

  const locationLayer = useMemo(() => new VectorLayer({
    source: locationSource,
    style: (feature) => feature.get('kind') === 'accuracy'
      ? new Style({ fill: new Fill({ color: 'rgba(11,116,200,.16)' }), stroke: new Stroke({ color: 'rgba(11,116,200,.7)', width: 1.5 }) })
      : new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#0b74c8' }), stroke: new Stroke({ color: '#fff', width: 3 }) }) }),
  }), [locationSource]);

  useEffect(() => {
    if (!target.current) return;
    const map = new Map({
      target: target.current,
      pixelRatio: memoryConstrained.current ? 1 : (window.devicePixelRatio || 1),
      layers: [cadLayer, locationLayer],
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }),
      view: new View({ center: fromLonLat([6.13, 49.61]), zoom: 12, minZoom: 7, maxZoom: 21 }),
    });
    mapRef.current = map;
    const updateCoordinate = () => onCoordinate(mapToLuref(map.getView().getCenter() ?? [0, 0]));
    const viewport = map.getViewport();
    map.on('moveend', updateCoordinate);
    map.on('pointerdrag', onManualMove);
    viewport.addEventListener('wheel', onManualMove, { passive: true });
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
        objectKey: String(feature.get('objectKey') ?? featureId),
        drawOrderGroupKey: String(feature.get('drawOrderGroupKey') ?? feature.get('objectKey') ?? featureId),
        layerId: String(feature.get('layerId') ?? '0'),
        cadType: String(feature.get('cadType') ?? 'CAD'),
        label: String(feature.get('label') ?? ''),
        blockPath: (feature.get('blockPath') as string[] | undefined) ?? [],
      });
    });
    const updateRotation = () => setRotation(map.getView().getRotation());
    map.getView().on('change:rotation', updateRotation);
    updateCoordinate();
    return () => {
      map.un('moveend', updateCoordinate);
      map.un('pointerdrag', onManualMove);
      viewport.removeEventListener('wheel', onManualMove);
      map.getView().un('change:rotation', updateRotation);
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [cadLayer, locationLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (basemapSuspended) {
      const existing = baseRef.current;
      if (existing) {
        existing.getSource()?.clear();
        map.removeLayer(existing);
        baseRef.current = null;
      }
      return;
    }
    const replacement = createBasemapLayer(basemapHealth.mode, {
      cacheSize: memoryConstrained.current ? 32 : undefined,
    });
    const source = replacement.getSource();
    if (!source) return;
    const unbindHealth = bindBasemapSourceHealth(
      source,
      basemapHealth.generation,
      basemapHealthReporter,
    );
    replacement.setVisible(basemapVisibleRef.current);
    if (baseRef.current) map.getLayers().setAt(0, replacement);
    else map.getLayers().insertAt(0, replacement);
    baseRef.current = replacement;
    basemapHealthReporter.sourceMounted(basemapHealth.generation);
    return unbindHealth;
  }, [basemapHealth.generation, basemapHealth.mode, basemapHealthReporter, basemapSuspended]);

  useEffect(() => {
    baseRef.current?.setVisible(basemapVisible);
  }, [basemapVisible]);

  useEffect(() => {
    cadSource.clear();
    if (!dwg) return;
    cadSource.addFeatures(dwg.features as Feature<Geometry>[]);
    if (fitOnDwgChange) fitDrawing();
  }, [cadSource, dwg, fitDrawing, fitOnDwgChange]);

  useEffect(() => {
    cadLayer.setOpacity(normalizeCadOpacity(cadOpacity) / 100);
  }, [cadLayer, cadOpacity]);

  useEffect(() => { cadLayer.changed(); }, [appearance, cadLayer, cadTextVisible, hiddenBlockNames, hiddenFeatureIds, hiddenObjectKeys, objectDrawOrder, selectedFeatureId, visibleLayers]);

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
});
