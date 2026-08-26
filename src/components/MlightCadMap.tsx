import { useEffect, useMemo, useRef } from 'react';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';
import Circle from 'ol/geom/Circle';
import Point from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { transform } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type TileWMS from 'ol/source/TileWMS';
import type WMTS from 'ol/source/WMTS';
import 'ol/ol.css';
import type { BasemapHealthReporter, BasemapHealthState } from '../lib/basemapHealth';
import { bindBasemapSourceHealth, createBasemapLayer } from '../lib/geoportail';
import { syncCadCameraToMap } from '../lib/mlightcad/cameraBridge';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type { LocationTrackingState } from '../types/models';

interface Props {
  adapter: MlightCadViewerAdapter | null;
  basemapHealth: BasemapHealthState;
  basemapHealthReporter: BasemapHealthReporter;
  basemapVisible: boolean;
  basemapSuspended?: boolean;
  mlightControlsActive: boolean;
  location: LocationTrackingState;
  onCoordinate: (coordinate: [number, number]) => void;
  onManualMove: () => void;
}

const MOBILE_TILE_CACHE_SIZE = 32;

export function isMemoryConstrainedMapRuntime(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return coarsePointer || mobileUserAgent;
}

export function MlightCadMap({ adapter, basemapHealth, basemapHealthReporter, basemapVisible, basemapSuspended = false, mlightControlsActive, location, onCoordinate, onManualMove }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseRef = useRef<TileLayer<WMTS | TileWMS> | null>(null);
  const basemapVisibleRef = useRef(basemapVisible);
  const memoryConstrained = useRef(isMemoryConstrainedMapRuntime());
  const onCoordinateRef = useRef(onCoordinate);
  const onManualMoveRef = useRef(onManualMove);
  onCoordinateRef.current = onCoordinate;
  onManualMoveRef.current = onManualMove;
  basemapVisibleRef.current = basemapVisible;
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
    const center = transform([6.13, 49.61], 'EPSG:4326', 'EPSG:2169');
    const interactions = defaultInteractions({
      altShiftDragRotate: false,
      pinchRotate: false,
    });
    const map = new Map({
      target: target.current,
      pixelRatio: memoryConstrained.current ? 1 : (window.devicePixelRatio || 1),
      controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
      interactions,
      layers: [locationLayer],
      view: new View({
        center,
        // Keep large/outlying CAD extents reachable. A zero minimum removes the
        // previous zoom-in clamp so OpenLayers can follow every CAD resolution.
        maxResolution: 1_000_000_000,
        minResolution: 0,
        projection: 'EPSG:2169',
        resolution: 50,
        rotation: 0,
      }),
    });
    const updateCoordinate = () => {
      const currentCenter = map.getView().getCenter();
      if (currentCenter) onCoordinateRef.current([currentCenter[0], currentCenter[1]]);
    };
    const handlePointerDrag = () => onManualMoveRef.current();
    const handleWheel = () => onManualMoveRef.current();
    map.on('moveend', updateCoordinate);
    map.on('pointerdrag', handlePointerDrag);
    map.getViewport().addEventListener('wheel', handleWheel, { passive: true });
    interactions.forEach((interaction) => interaction.setActive(!mlightControlsActive));
    mapRef.current = map;
    updateCoordinate();
    return () => {
      map.un('moveend', updateCoordinate);
      map.un('pointerdrag', handlePointerDrag);
      map.getViewport().removeEventListener('wheel', handleWheel);
      map.setTarget(undefined);
      mapRef.current = null;
      baseRef.current = null;
    };
  }, [locationLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getInteractions().forEach((interaction) => interaction.setActive(!mlightControlsActive));
  }, [mlightControlsActive]);

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
      cacheSize: memoryConstrained.current ? MOBILE_TILE_CACHE_SIZE : undefined,
    });
    const source = replacement.getSource();
    if (!source) return;
    const unbindHealth = bindBasemapSourceHealth(
      source,
      basemapHealth.generation,
      basemapHealthReporter,
    );
    replacement.setVisible(basemapVisibleRef.current);
    const previous = baseRef.current;
    if (previous) {
      previous.getSource()?.clear();
      map.getLayers().setAt(0, replacement);
    } else map.getLayers().insertAt(0, replacement);
    baseRef.current = replacement;
    basemapHealthReporter.sourceMounted(basemapHealth.generation);
    return unbindHealth;
  }, [basemapHealth.generation, basemapHealth.mode, basemapHealthReporter, basemapSuspended]);

  useEffect(() => {
    baseRef.current?.setVisible(basemapVisible);
  }, [basemapVisible]);

  useEffect(() => {
    if (!adapter) return;
    return adapter.events.camera.addEventListener(({ center, resolution }) => {
      const map = mapRef.current;
      if (!map || !syncCadCameraToMap(map.getView(), { center, resolution })) return;
      onCoordinateRef.current(center);
      map.renderSync();
    });
  }, [adapter]);

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
    if (location.follow === 'following' && !mlightControlsActive) {
      const view = mapRef.current?.getView();
      const currentResolution = view?.getResolution() ?? 2;
      view?.animate({
        center,
        resolution: Math.min(currentResolution, 2),
        duration: 350,
      });
    }
  }, [location.follow, location.position, locationSource, mlightControlsActive]);

  return <div ref={target} className="map-canvas mlightcad-map-canvas" role="application" aria-label="Geoportail" />;
}
