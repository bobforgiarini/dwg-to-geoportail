import { useEffect, useRef } from 'react';
import { MlightCadViewerAdapter } from '../lib/mlightcad/MlightCadViewerAdapter';
import type { MlightCadProgress, MlightCadReady } from '../lib/mlightcad/types';
import type { CadOverlayLayer, SelectedCadObject } from '../types/models';

interface Props {
  file: File | null;
  fileRevision: number;
  opacity: number;
  onAdapterChange: (adapter: MlightCadViewerAdapter | null) => void;
  onError: (error: unknown) => void;
  onLayers: (layers: CadOverlayLayer[]) => void;
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
    if (!container.current || !props.file) {
      callbacks.current.onAdapterChange(null);
      return;
    }

    let active = true;
    const nextAdapter = new MlightCadViewerAdapter(container.current);
    adapter.current = nextAdapter;
    nextAdapter.setOpacity(callbacks.current.opacity);
    callbacks.current.onAdapterChange(nextAdapter);

    const removeListeners = [
      nextAdapter.events.progress.addEventListener((value) => callbacks.current.onProgress(value)),
      nextAdapter.events.layers.addEventListener((value) => callbacks.current.onLayers(value)),
      nextAdapter.events.selection.addEventListener((value) => callbacks.current.onSelection(value)),
      nextAdapter.events.ready.addEventListener((value) => callbacks.current.onReady(value)),
    ];

    void nextAdapter.load(props.file).catch((error) => {
      if (active) callbacks.current.onError(error);
    });

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
