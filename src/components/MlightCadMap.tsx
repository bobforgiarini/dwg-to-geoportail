import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';
import Circle from 'ol/geom/Circle';
import LineString from 'ol/geom/LineString';
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
import { bindBasemapSourceHealth, createBasemapLayer, createCadastreLayers } from '../lib/geoportail';
import { syncCadCameraToMap } from '../lib/mlightcad/cameraBridge';
import type { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type {
  DistanceMeasurementState,
  LocationTrackingState,
  MeasurementPoint,
} from '../types/models';

interface Props {
  adapter: MlightCadViewerAdapter | null;
  basemapHealth: BasemapHealthState;
  basemapHealthReporter: BasemapHealthReporter;
  basemapVisible: boolean;
  cadastreVisible?: boolean;
  basemapSuspended?: boolean;
  mlightControlsActive: boolean;
  cadOpacity?: number;
  location: LocationTrackingState;
  onCoordinate: (coordinate: [number, number]) => void;
  onManualMove: () => void;
  distanceMeasurement?: DistanceMeasurementState;
  snapPreview?: MeasurementPoint | null;
  onDesktopMeasurementPointCapture?: (point: MeasurementPoint) => void;
}

export interface MlightCadMapHandle {
  resolveAimPoint: () => MeasurementPoint | null;
}

const MOBILE_TILE_CACHE_SIZE = 32;
const COORDINATE_UPDATE_DELAY_MS = 100;

export function isMemoryConstrainedMapRuntime(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return coarsePointer || mobileUserAgent;
}

export const MlightCadMap = forwardRef<MlightCadMapHandle, Props>(function MlightCadMap({ adapter, basemapHealth, basemapHealthReporter, basemapVisible, cadastreVisible = false, basemapSuspended = false, mlightControlsActive, cadOpacity = 100, location, onCoordinate, onManualMove, distanceMeasurement, snapPreview = null, onDesktopMeasurementPointCapture }, ref) {
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseRef = useRef<TileLayer<WMTS | TileWMS> | null>(null);
  const cadastreRef = useRef<Array<TileLayer<WMTS>>>([]);
  const basemapVisibleRef = useRef(basemapVisible);
  const mlightControlsActiveRef = useRef(mlightControlsActive);
  const memoryConstrained = useRef(isMemoryConstrainedMapRuntime());
  const desktopFinePointer = useRef(
    typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  const onCoordinateRef = useRef(onCoordinate);
  const onManualMoveRef = useRef(onManualMove);
  const distanceMeasurementRef = useRef(distanceMeasurement);
  const onDesktopMeasurementPointCaptureRef = useRef(onDesktopMeasurementPointCapture);
  onCoordinateRef.current = onCoordinate;
  onManualMoveRef.current = onManualMove;
  distanceMeasurementRef.current = distanceMeasurement;
  onDesktopMeasurementPointCaptureRef.current = onDesktopMeasurementPointCapture;
  basemapVisibleRef.current = basemapVisible;
  mlightControlsActiveRef.current = mlightControlsActive;
  const locationSource = useMemo(() => new VectorSource(), []);
  const measurementSource = useMemo(() => new VectorSource(), []);
  const measurementLayer = useMemo(() => new VectorLayer({
    source: measurementSource,
    zIndex: 15,
    style: (feature) => {
      const kind = feature.get('kind');
      if (kind === 'measurement-line') {
        return [
          new Style({ stroke: new Stroke({ color: 'rgba(5,28,44,.9)', width: 5 }) }),
          new Style({ stroke: new Stroke({ color: '#f1be88', width: 2.5 }) }),
        ];
      }
      if (kind === 'snap-preview') {
        return new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: 'rgba(241,190,136,.16)' }),
            stroke: new Stroke({ color: '#f1be88', width: 2 }),
          }),
        });
      }
      return new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: '#f1be88' }),
          stroke: new Stroke({ color: '#051c2c', width: 2 }),
        }),
      });
    },
  }), [measurementSource]);
  const locationLayer = useMemo(() => new VectorLayer({
    source: locationSource,
    zIndex: 20,
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
      layers: [measurementLayer, locationLayer],
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
      // Programmatic CAD camera updates can synchronously emit OpenLayers
      // moveend. The trailing CAD callback below owns the status card while
      // MLightCAD owns navigation, avoiding a full React render per frame.
      if (mlightControlsActiveRef.current) return;
      const currentCenter = map.getView().getCenter();
      if (currentCenter) onCoordinateRef.current([currentCenter[0], currentCenter[1]]);
    };
    const handlePointerDrag = () => onManualMoveRef.current();
    const handleWheel = () => onManualMoveRef.current();
    const handleDesktopMeasurementClick = (event: {
      coordinate: number[];
      originalEvent?: Event & { pointerType?: string };
    }) => {
      const measurement = distanceMeasurementRef.current;
      const pointerType = event.originalEvent?.pointerType ?? 'mouse';
      if (
        !desktopFinePointer.current
        || pointerType !== 'mouse'
        || mlightControlsActiveRef.current
        || !measurement
        || measurement.phase === 'inactive'
        || measurement.phase === 'complete'
      ) return;
      const [x, y] = event.coordinate;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      onDesktopMeasurementPointCaptureRef.current?.({
        coordinate: [x, y],
        source: 'aim',
      });
    };
    map.on('moveend', updateCoordinate);
    map.on('pointerdrag', handlePointerDrag);
    map.on('singleclick', handleDesktopMeasurementClick);
    map.getViewport().addEventListener('wheel', handleWheel, { passive: true });
    interactions.forEach((interaction) => interaction.setActive(!mlightControlsActive));
    mapRef.current = map;
    updateCoordinate();
    return () => {
      map.un('moveend', updateCoordinate);
      map.un('pointerdrag', handlePointerDrag);
      map.un('singleclick', handleDesktopMeasurementClick);
      map.getViewport().removeEventListener('wheel', handleWheel);
      map.setTarget(undefined);
      mapRef.current = null;
      baseRef.current = null;
      cadastreRef.current = [];
    };
  }, [locationLayer, measurementLayer]);

  useImperativeHandle(ref, () => ({
    resolveAimPoint: () => {
      const center = mapRef.current?.getView().getCenter();
      if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return null;
      return { coordinate: [center[0], center[1]], source: 'aim' };
    },
  }), []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getInteractions().forEach((interaction) => interaction.setActive(!mlightControlsActive));
    // Normally the native WebGL overlay owns measurement rendering. At the
    // 0 % Map preset that entire canvas is transparent, so OpenLayers supplies
    // the same lightweight geometry underneath it instead.
    measurementLayer.setVisible(!mlightControlsActive || cadOpacity <= 0);
  }, [cadOpacity, measurementLayer, mlightControlsActive]);

  useEffect(() => {
    measurementSource.clear();
    // Keep a lightweight fallback rendering ready in OpenLayers. It shares the
    // same EPSG:2169 camera and adds no work to the CAD camera bridge.
    if (!distanceMeasurement || distanceMeasurement.phase === 'inactive') return;
    const firstPoint = distanceMeasurement.phase === 'placing-second' || distanceMeasurement.phase === 'complete'
      ? distanceMeasurement.firstPoint
      : null;
    const secondPoint = distanceMeasurement.phase === 'complete' ? distanceMeasurement.secondPoint : null;
    if (firstPoint) {
      measurementSource.addFeature(new Feature({
        geometry: new Point([...firstPoint.coordinate]),
        kind: 'measurement-point',
      }));
    }
    if (secondPoint && firstPoint) {
      measurementSource.addFeatures([
        new Feature({
          geometry: new LineString([[...firstPoint.coordinate], [...secondPoint.coordinate]]),
          kind: 'measurement-line',
        }),
        new Feature({
          geometry: new Point([...secondPoint.coordinate]),
          kind: 'measurement-point',
        }),
      ]);
    }
    if (snapPreview?.source === 'cad-snap') {
      measurementSource.addFeature(new Feature({
        geometry: new Point([...snapPreview.coordinate]),
        kind: 'snap-preview',
      }));
    }
  }, [distanceMeasurement, measurementSource, snapPreview]);

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
    replacement.setZIndex(0);
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
    const map = mapRef.current;
    if (!map) return;
    if (basemapSuspended || !cadastreVisible) {
      if (cadastreRef.current.length > 0) {
        cadastreRef.current.forEach((layer) => {
          layer.getSource()?.clear();
          map.removeLayer(layer);
        });
        cadastreRef.current = [];
      }
      return;
    }
    if (cadastreRef.current.length > 0) return;
    const layers = createCadastreLayers({
      cacheSize: memoryConstrained.current ? MOBILE_TILE_CACHE_SIZE : undefined,
    });
    layers.forEach((layer, index) => {
      layer.setZIndex(5 + index);
      map.addLayer(layer);
    });
    cadastreRef.current = layers;
  }, [basemapSuspended, cadastreVisible]);

  useEffect(() => {
    if (!adapter) return;
    let coordinateTimer: ReturnType<typeof setTimeout> | null = null;
    let latestCoordinate: [number, number] | null = null;
    const publishCoordinateWhenIdle = (center: [number, number]) => {
      latestCoordinate = center;
      if (coordinateTimer !== null) clearTimeout(coordinateTimer);
      coordinateTimer = setTimeout(() => {
        coordinateTimer = null;
        if (latestCoordinate) onCoordinateRef.current(latestCoordinate);
      }, COORDINATE_UPDATE_DELAY_MS);
    };
    const unbindCamera = adapter.events.camera.addEventListener(({ center, resolution }) => {
      const map = mapRef.current;
      if (!map || !syncCadCameraToMap(map.getView(), { center, resolution })) return;
      // Keep the proven 0.2.4 CAD -> OpenLayers coupling synchronous. Only the
      // status-card update is delayed so a pan gesture never rerenders the
      // complete React UI (including closed CAD drawers) on every camera tick.
      publishCoordinateWhenIdle(center);
      map.renderSync();
    });
    return () => {
      unbindCamera();
      if (coordinateTimer !== null) clearTimeout(coordinateTimer);
    };
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
});
