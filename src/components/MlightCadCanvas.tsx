import { useEffect, useRef } from 'react';
import { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type { MlightCadCamera, MlightCadLoadOptions, MlightCadProgress, MlightCadReady } from '../lib/mlightcad/types';
import type { CadOverlayBlock, DwgPreflightReport } from '../lib/cad/preflightTypes';
import type { CadOverlayLayer, SelectedCadObject } from '../types/models';
import type { CadRenderQualityMode } from '../lib/mlightcad/renderQuality';

interface Props {
  file: File | null;
  fileRevision: number;
  opacity: number;
  renderQuality: CadRenderQualityMode;
  loadOptions: MlightCadLoadOptions;
  onAdapterChange: (adapter: MlightCadViewerAdapter | null) => void;
  onError: (error: unknown) => void;
  onLayers: (layers: CadOverlayLayer[]) => void;
  onBlocks: (blocks: CadOverlayBlock[]) => void;
  onPreflight: (report: DwgPreflightReport) => void;
  onCamera: (camera: MlightCadCamera) => void;
  onProgress: (progress: MlightCadProgress) => void;
  onReady: (ready: MlightCadReady) => void;
  onSelection: (selection: SelectedCadObject | null) => void;
}

export function MlightCadCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const adapter = useRef<MlightCadViewerAdapter | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    adapter.current?.setOpacity(props.opacity);
  }, [props.opacity]);

  useEffect(() => {
    adapter.current?.setRenderQuality(props.renderQuality);
  }, [props.renderQuality]);

  useEffect(() => {
    if (!container.current || !props.file) {
      callbacks.current.onAdapterChange(null);
      return;
    }

    let active = true;
    const nextAdapter = new MlightCadViewerAdapter(container.current);
    adapter.current = nextAdapter;
    nextAdapter.setOpacity(callbacks.current.opacity);
    nextAdapter.setRenderQuality(callbacks.current.renderQuality);
    callbacks.current.onAdapterChange(nextAdapter);

    const reportError = (error: unknown) => {
      if (!active) return;
      if (adapter.current === nextAdapter) {
        adapter.current = null;
        callbacks.current.onAdapterChange(null);
      }
      callbacks.current.onError(error);
    };

    const removeListeners = [
      nextAdapter.events.progress.addEventListener((value) => callbacks.current.onProgress(value)),
      nextAdapter.events.layers.addEventListener((value) => callbacks.current.onLayers(value)),
      nextAdapter.events.blocks.addEventListener((value) => callbacks.current.onBlocks(value)),
      nextAdapter.events.preflight.addEventListener((value) => callbacks.current.onPreflight(value)),
      nextAdapter.events.camera.addEventListener((value) => callbacks.current.onCamera(value)),
      nextAdapter.events.selection.addEventListener((value) => callbacks.current.onSelection(value)),
      nextAdapter.events.ready.addEventListener((value) => callbacks.current.onReady(value)),
      nextAdapter.events.error.addEventListener(reportError),
    ];

    // The adapter disposes all partially-created worker/scene/WebGL resources
    // before a load failure reaches this boundary.
    void nextAdapter.load(props.file, callbacks.current.loadOptions).catch(reportError);

    return () => {
      active = false;
      for (const removeListener of removeListeners) removeListener();
      if (adapter.current === nextAdapter) {
        adapter.current = null;
        callbacks.current.onAdapterChange(null);
      }
      void nextAdapter.cancel();
    };
  // File revision intentionally reloads the same File object when reselected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file, props.fileRevision]);

  return <div ref={container} className="mlightcad-render-host" aria-label="MLightCAD" />;
}
