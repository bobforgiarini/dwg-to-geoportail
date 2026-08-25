import { describe, expect, it, vi } from 'vitest';
import type { CadOverlayLayer } from '../../types/models';
import { AdapterEvent } from './types';

vi.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: class MockDocManager {},
  AcApOpenViewMode: { Extents: 'extents' },
  AcEdOpenMode: { Read: 0 },
  AcEdViewMode: { PAN: 'pan' },
  LIBREDWG_PARSER_WORKER_FILE: 'libredwg-parser-worker.js',
  MTEXT_RENDERER_WORKER_FILE: 'mtext-renderer-worker.js',
}));

vi.mock('@mlightcad/data-model', () => ({
  AcDbDatabaseConverterManager: {
    instance: { register: vi.fn(), unregister: vi.fn() },
  },
  AcDbFileType: { DWG: 'dwg' },
  AcDbOpenDatabaseError: { throwOnWorkerParseFailure: vi.fn() },
  acdbCreateWorkerApi: vi.fn(),
  acdbHostApplicationServices: vi.fn(),
}));

vi.mock('@mlightcad/libredwg-converter', () => ({
  AcDbLibreDwgConverter: class MockLibreDwgConverter {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown> = {}) { this.config = config; }
    protected getParserWorkerTimeout(_data: ArrayBuffer, timeout?: number) { return timeout ?? 30_000; }
  },
}));

import { MlightCadViewerAdapter } from './MlightCadViewerAdapter';

interface AdapterInternals {
  layers: CadOverlayLayer[];
  manager: unknown;
  view: unknown;
  bindSelection: (view: unknown) => void;
  configureTouchNavigation: (view: unknown) => void;
  hideEmbeddedCommandLine: () => void;
  describeObject: (id: string) => unknown;
}

function internals(adapter: MlightCadViewerAdapter): AdapterInternals {
  return adapter as unknown as AdapterInternals;
}

function dispatchPointer(
  target: HTMLCanvasElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  pointerId = 1,
) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
  });
  target.dispatchEvent(event);
}

describe('MlightCadViewerAdapter controls', () => {
  it('keeps touch movement in pan mode and removes the embedded command-line hit layer', () => {
    const container = document.createElement('div');
    const commandLine = document.createElement('div');
    commandLine.className = 'ml-cli-container';
    container.appendChild(commandLine);
    const adapter = new MlightCadViewerAdapter(container);
    const view = { mode: 'selection' };

    internals(adapter).configureTouchNavigation(view);
    internals(adapter).hideEmbeddedCommandLine();

    expect(view.mode).toBe('pan');
    expect(commandLine.hidden).toBe(true);
    expect(commandLine.style.pointerEvents).toBe('none');
  });

  it('updates one or all renderer layers and emits snapshots', () => {
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const visibility = new Map([['A', true], ['B', true]]);
    internals(adapter).layers = [
      { id: 'A', name: 'A', visible: true, featureCount: 2 },
      { id: 'B', name: 'B', visible: true, featureCount: 3 },
    ];
    internals(adapter).view = {
      cadScene: {
        forEachSceneLayer: (id: string, change: (layer: { visible: boolean }) => void) => {
          const layer = { visible: visibility.get(id) ?? false };
          change(layer);
          visibility.set(id, layer.visible);
        },
      },
    };
    const emitted: CadOverlayLayer[][] = [];
    adapter.events.layers.addEventListener((layers) => emitted.push(layers));

    adapter.setLayerVisible('A', false);
    expect(visibility.get('A')).toBe(false);
    expect(adapter.currentLayers[0].visible).toBe(false);

    adapter.setAllLayersVisible(false);
    expect([...visibility.values()]).toEqual([false, false]);
    expect(emitted.at(-1)?.every((layer) => !layer.visible)).toBe(true);
  });

  it('describes selections and restores individually hidden objects', () => {
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const setVisible = vi.fn();
    const clearSelection = vi.fn();
    internals(adapter).view = {
      setEntitySceneVisible: setVisible,
      selectionSet: { clear: clearSelection },
    };
    internals(adapter).manager = {
      curDocument: {
        database: {
          tables: { blockTable: { getEntityById: () => ({ dxfTypeName: 'HATCH', layer: 'FILL' }) } },
          getObjectById: vi.fn(),
        },
      },
    };

    expect(internals(adapter).describeObject('42')).toEqual({
      featureId: '42', layerId: 'FILL', cadType: 'HATCH', label: '',
    });
    adapter.hideObject('42');
    expect(adapter.hiddenObjectCount).toBe(1);
    expect(setVisible).toHaveBeenLastCalledWith('42', false);
    expect(clearSelection).toHaveBeenCalled();

    adapter.clearSelection();
    expect(clearSelection).toHaveBeenCalledTimes(2);

    adapter.restoreHiddenObjects();
    expect(adapter.hiddenObjectCount).toBe(0);
    expect(setVisible).toHaveBeenLastCalledWith('42', true);
  });

  it('selects a tapped entity through the pointer fallback without duplicating native selection', () => {
    vi.useFakeTimers();
    try {
      const adapter = new MlightCadViewerAdapter(document.createElement('div'));
      const canvas = document.createElement('canvas');
      const selectionAdded = new AdapterEvent<{ ids: string[] }>();
      const selectionRemoved = new AdapterEvent<{ ids: string[] }>();
      const selected = new Set<string>();
      const selectionSet = {
        events: { selectionAdded, selectionRemoved },
        get count() { return selected.size; },
        has: (id: string) => selected.has(id),
        clear: () => {
          const ids = [...selected];
          selected.clear();
          if (ids.length) selectionRemoved.dispatch({ ids });
        },
      };
      const applySelection = vi.fn((ids: string[]) => {
        selectionSet.clear();
        ids.forEach((id) => selected.add(id));
        selectionAdded.dispatch({ ids });
      });
      const view = {
        canvas,
        entitySelectionEnabled: false,
        selectionBoxSize: 4,
        selectionSet,
        viewportToCanvas: ({ x, y }: { x: number; y: number }) => ({ x, y }),
        screenToWorld: ({ x, y }: { x: number; y: number }) => ({ x, y }),
        pick: vi.fn(() => [{ id: '42' }]),
        applySelection,
      };
      internals(adapter).view = view;
      internals(adapter).manager = {
        curDocument: {
          database: {
            tables: { blockTable: { getEntityById: () => ({ dxfTypeName: 'LINE', layer: 'A' }) } },
            getObjectById: vi.fn(),
          },
        },
      };
      const emitted: unknown[] = [];
      adapter.events.selection.addEventListener((selection) => emitted.push(selection));
      internals(adapter).bindSelection(view);

      dispatchPointer(canvas, 'pointerdown', 100, 120);
      dispatchPointer(canvas, 'pointerup', 100, 120);
      vi.runAllTimers();

      expect(view.entitySelectionEnabled).toBe(true);
      expect(view.selectionBoxSize).toBe(12);
      expect(view.pick).toHaveBeenCalledWith({ x: 100, y: 120 }, 12, true);
      expect(applySelection).toHaveBeenCalledOnce();
      expect(emitted.at(-1)).toEqual({
        featureId: '42', layerId: 'A', cadType: 'LINE', label: '',
      });

      // The library's native mouse path may already have selected this id
      // before the deferred fallback runs. In that case it must not select it twice.
      applySelection.mockClear();
      dispatchPointer(canvas, 'pointerdown', 100, 120);
      dispatchPointer(canvas, 'pointerup', 100, 120);
      vi.runAllTimers();
      expect(applySelection).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not turn a pan gesture into an object selection', () => {
    vi.useFakeTimers();
    try {
      const adapter = new MlightCadViewerAdapter(document.createElement('div'));
      const canvas = document.createElement('canvas');
      const view = {
        canvas,
        entitySelectionEnabled: false,
        selectionBoxSize: 4,
        selectionSet: {
          count: 0,
          has: vi.fn(() => false),
          clear: vi.fn(),
          events: {
            selectionAdded: new AdapterEvent<{ ids: string[] }>(),
            selectionRemoved: new AdapterEvent<{ ids: string[] }>(),
          },
        },
        viewportToCanvas: vi.fn(),
        screenToWorld: vi.fn(),
        pick: vi.fn(),
        applySelection: vi.fn(),
      };
      internals(adapter).view = view;
      internals(adapter).bindSelection(view);

      dispatchPointer(canvas, 'pointerdown', 10, 10);
      dispatchPointer(canvas, 'pointermove', 30, 10);
      dispatchPointer(canvas, 'pointerup', 30, 10);
      vi.runAllTimers();

      expect(view.pick).not.toHaveBeenCalled();
      expect(view.applySelection).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops rendering and releases the WebGL context during dispose', async () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const stopAnimationLoop = vi.fn();
    const clear = vi.fn();
    const rendererDispose = vi.fn();
    const webglDispose = vi.fn();
    const forceContextLoss = vi.fn();
    const setAnimationLoop = vi.fn();
    const renderListsDispose = vi.fn();
    const managerDestroy = vi.fn().mockResolvedValue(undefined);
    const adapter = new MlightCadViewerAdapter(container);
    internals(adapter).view = {
      selectionSet: { clear: vi.fn() },
      stopAnimationLoop,
      clear,
      renderer: {
        dispose: rendererDispose,
        domElement: canvas,
        internalRenderer: {
          setAnimationLoop,
          renderLists: { dispose: renderListsDispose },
          dispose: webglDispose,
          forceContextLoss,
        },
      },
    };
    internals(adapter).manager = { destroy: managerDestroy };

    await adapter.dispose();

    expect(stopAnimationLoop).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(setAnimationLoop).toHaveBeenCalledWith(null);
    expect(renderListsDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();
    expect(forceContextLoss).toHaveBeenCalledOnce();
    expect(managerDestroy).toHaveBeenCalledOnce();
    expect(rendererDispose).toHaveBeenCalledOnce();
    expect(container.childElementCount).toBe(0);
  });
});
