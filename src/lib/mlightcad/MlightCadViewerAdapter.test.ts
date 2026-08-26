import { describe, expect, it, vi } from 'vitest';
import type { CadOverlayLayer } from '../../types/models';
import type { CadOverlayBlock } from '../cad/preflightTypes';
import { AdapterEvent } from './types';

const runtimeHarness = vi.hoisted(() => ({
  checkWebworkerReadiness: vi.fn(),
}));

vi.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: class MockDocManager {
    static checkWebworkerReadiness = runtimeHarness.checkWebworkerReadiness;
  },
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

import { MlightCadViewerAdapter, shouldUseLowMemoryCadMode } from './MlightCadViewerAdapter';

interface AdapterInternals {
  layers: CadOverlayLayer[];
  blocks: CadOverlayBlock[];
  directBlockObjectIds: Map<string, Set<string>>;
  objectBlockPaths: Map<string, string[]>;
  manager: unknown;
  view: unknown;
  bindDocument: (manager: unknown) => void;
  bindSelection: (view: unknown) => void;
  bindWebglContextLoss: (view: unknown) => void;
  collectRenderedTextSceneObjects: (view: unknown) => void;
  configureLowMemoryRenderer: (view: unknown, enabled: boolean) => void;
  configureTransparentRenderer: (view: unknown) => void;
  configureTouchNavigation: (view: unknown) => void;
  hideEmbeddedCommandLine: () => void;
  describeObject: (id: string) => unknown;
}

function overlayBlock(name: string, init: Partial<CadOverlayBlock> = {}): CadOverlayBlock {
  return {
    id: name,
    name,
    kind: 'named',
    visible: true,
    instanceCount: 1,
    directInstanceCount: 1,
    directEntityCount: 1,
    recursiveEntityCount: 1,
    expandedEntityCount: 1,
    textCount: 0,
    hatchCount: 0,
    primaryLayer: '0',
    referencedBlockNames: [],
    isNested: false,
    hasCycle: false,
    estimatedCost: 1,
    ...init,
  };
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
  it('does not report a rejected worker as an import error after cancellation', async () => {
    let rejectReadiness: (error: Error) => void = () => undefined;
    runtimeHarness.checkWebworkerReadiness.mockReturnValueOnce(new Promise<boolean>((_resolve, reject) => {
      rejectReadiness = reject;
    }));
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const load = adapter.load(new File([new Uint8Array([1])], 'cancelled.dwg'));

    await vi.waitFor(() => expect(runtimeHarness.checkWebworkerReadiness).toHaveBeenCalledOnce());
    const cancellation = adapter.cancel();
    rejectReadiness(new Error('worker terminated'));

    await expect(load).resolves.toBeUndefined();
    await cancellation;
  });

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

  it('reduces zoom speed only for coarse pointers and leaves desktop controls unchanged', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    try {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ matches: true })),
      });
      const adapter = new MlightCadViewerAdapter(document.createElement('div'));
      const controls = { zoomSpeed: 5 };
      internals(adapter).configureTouchNavigation({ mode: 'selection', activeLayoutView: { _cameraControls: controls } });
      expect(controls.zoomSpeed).toBe(2.25);

      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ matches: false })),
      });
      const desktopControls = { zoomSpeed: 5 };
      internals(adapter).configureTouchNavigation({ mode: 'selection', activeLayoutView: { _cameraControls: desktopControls } });
      expect(desktopControls.zoomSpeed).toBe(5);
    } finally {
      if (descriptor) Object.defineProperty(window, 'matchMedia', descriptor);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('keeps host opacity untouched and makes the WebGL canvas transparent', () => {
    const container = document.createElement('div');
    container.style.opacity = '0.2';
    const canvas = document.createElement('canvas');
    const setClearColor = vi.fn();
    const setClearAlpha = vi.fn();
    const setPixelRatio = vi.fn();
    const adapter = new MlightCadViewerAdapter(container);
    const view = {
      container: document.createElement('div'),
      renderer: {
        clearAlpha: 1,
        domElement: canvas,
        setClearColor,
        internalRenderer: { setClearAlpha, setPixelRatio },
      },
    };
    internals(adapter).view = view;

    adapter.setOpacity(60);
    internals(adapter).configureTransparentRenderer(view);
    internals(adapter).configureLowMemoryRenderer(view, true);

    expect(container.style.opacity).toBe('');
    expect(canvas.style.opacity).toBe('0.6');
    expect(canvas.style.background).toBe('transparent');
    expect(setClearColor).toHaveBeenCalledWith(0x000000, 0);
    expect(setClearAlpha).toHaveBeenCalledWith(0);
    expect(setPixelRatio).toHaveBeenCalledWith(1);
    expect((view as typeof view & { isDirty: boolean }).isDirty).toBe(true);
  });

  it('uses DPR 1 mode for mobile/coarse devices independently of DWG size', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    try {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ matches: true })),
      });
      expect(shouldUseLowMemoryCadMode(1_024)).toBe(true);

      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ matches: false })),
      });
      expect(shouldUseLowMemoryCadMode(1_024, true)).toBe(true);
      expect(shouldUseLowMemoryCadMode(11 * 1024 * 1024, false)).toBe(true);
      expect(shouldUseLowMemoryCadMode(1_024, false)).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(window, 'matchMedia', descriptor);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
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
    expect((internals(adapter).view as { isDirty: boolean }).isDirty).toBe(true);

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
    internals(adapter).objectBlockPaths.set('42', ['OUTER', 'INNER']);

    expect(internals(adapter).describeObject('42')).toEqual({
      featureId: '42', objectKey: 'outer>inner::42', layerId: 'FILL', cadType: 'HATCH', label: '', blockPath: ['OUTER', 'INNER'],
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

    expect(adapter.hideObjectByKey('different>instance::42')).toBe(true);
    expect(adapter.hiddenObjectCount).toBe(1);
    expect(setVisible).toHaveBeenLastCalledWith('42', false);
  });

  it('hides direct block references immediately and requests a reload for nested blocks', () => {
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const setVisible = vi.fn();
    internals(adapter).view = { setEntitySceneVisible: setVisible };
    internals(adapter).blocks = [
      overlayBlock('DIRECT'),
      overlayBlock('NESTED', { isNested: true, directInstanceCount: 0 }),
    ];
    internals(adapter).directBlockObjectIds.set('direct', new Set(['INSERT-1', 'INSERT-2']));

    expect(adapter.setBlockVisible('DIRECT', false)).toBe(false);
    expect(setVisible.mock.calls).toEqual(expect.arrayContaining([
      ['INSERT-1', false],
      ['INSERT-2', false],
    ]));
    expect(adapter.currentBlocks.find((block) => block.name === 'DIRECT')?.visible).toBe(false);

    setVisible.mockClear();
    expect(adapter.setBlockVisible('NESTED', false)).toBe(true);
    expect(setVisible).not.toHaveBeenCalled();
  });

  it('hides rendered text inside a block without hiding its geometry and preserves hidden-object precedence', () => {
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const setVisible = vi.fn();
    const textRoot = { visible: true, userData: { textEntityTraits: { layer: 'TEXT' } }, children: [] };
    const geometryRoot = { visible: true, userData: {}, children: [] };
    const view = {
      setEntitySceneVisible: setVisible,
      selectionSet: { clear: vi.fn() },
      cadScene: {
        modelSpaceLayout: {
          layers: new Map([['TEXT', {
            internalObject: {
              _unbatchedEntities: new Map([['INSERT-1', [textRoot, geometryRoot]]]),
            },
          }]]),
        },
      },
    };
    internals(adapter).view = view;
    internals(adapter).collectRenderedTextSceneObjects(view);

    adapter.setTextsVisible(false);
    expect(textRoot.visible).toBe(false);
    expect(geometryRoot.visible).toBe(true);
    expect((view as typeof view & { isDirty: boolean }).isDirty).toBe(true);

    adapter.hideObject('INSERT-1');
    adapter.setTextsVisible(true);
    expect(textRoot.visible).toBe(false);
    expect(setVisible).toHaveBeenLastCalledWith('INSERT-1', false);

    adapter.restoreHiddenObjects();
    expect(textRoot.visible).toBe(true);
    expect(setVisible).toHaveBeenLastCalledWith('INSERT-1', true);
  });

  it('hides complete leader entities with CAD texts and preserves object and layer visibility', () => {
    const adapter = new MlightCadViewerAdapter(document.createElement('div'));
    const setVisible = vi.fn();
    const layerChanged = new AdapterEvent<void>();
    const entities = [
      { objectId: 'TEXT-1', dxfTypeName: 'TEXT', layer: 'NOTES' },
      { objectId: 'LEADER-1', dxfTypeName: 'LEADER', layer: 'NOTES' },
      { objectId: 'MLEADER-1', dxfTypeName: 'MLEADER', layer: 'NOTES' },
      { objectId: 'MULTILEADER-1', dxfTypeName: 'MULTILEADER', layer: 'NOTES' },
      { objectId: 'LINE-1', dxfTypeName: 'LINE', layer: 'NOTES' },
    ];
    const view = {
      setEntitySceneVisible: setVisible,
      selectionSet: { clear: vi.fn() },
      cadScene: {
        modelSpaceLayout: {
          layers: new Map([['NOTES', {
            entityCount: entities.length,
            internalObject: { _unbatchedEntities: new Map() },
          }]]),
        },
      },
    };
    const manager = {
      curView: view,
      curDocument: {
        database: {
          tables: {
            blockTable: {
              modelSpace: { newIterator: () => entities.values() },
            },
          },
        },
        layerStore: {
          getLayers: () => [{ name: 'NOTES', isOn: false, isFrozen: false }],
          events: { changed: layerChanged },
        },
      },
    };
    internals(adapter).view = view;
    internals(adapter).bindDocument(manager);

    adapter.setTextsVisible(false);
    expect(setVisible.mock.calls).toEqual(expect.arrayContaining([
      ['TEXT-1', false],
      ['LEADER-1', false],
      ['MLEADER-1', false],
      ['MULTILEADER-1', false],
    ]));
    expect(setVisible).not.toHaveBeenCalledWith('LINE-1', false);
    expect(adapter.currentLayers).toEqual([
      { id: 'NOTES', name: 'NOTES', visible: false, featureCount: entities.length },
    ]);

    adapter.hideObject('MULTILEADER-1');
    setVisible.mockClear();
    adapter.setTextsVisible(true);
    expect(setVisible).toHaveBeenCalledWith('LEADER-1', true);
    expect(setVisible).toHaveBeenCalledWith('MLEADER-1', true);
    expect(setVisible).toHaveBeenCalledWith('MULTILEADER-1', false);
    expect(adapter.currentLayers[0].visible).toBe(false);

    adapter.restoreHiddenObjects();
    expect(setVisible).toHaveBeenLastCalledWith('MULTILEADER-1', true);
  });

  it('emits a synchronized camera after programmatic center and fit operations', () => {
    vi.useFakeTimers();
    try {
      const adapter = new MlightCadViewerAdapter(document.createElement('div'));
      const zoomToFitDrawing = vi.fn();
      const flyTo = vi.fn(({ x, y }: { x: number; y: number }) => {
        view.center = { x, y };
      });
      const view = {
        center: { x: 10, y: 20 },
        internalCamera: { zoom: 2 },
        modelSpaceBtrId: 'model',
        renderer: {
          clearAlpha: 0,
          domElement: document.createElement('canvas'),
          setClearColor: vi.fn(),
          internalRenderer: { setClearAlpha: vi.fn() },
        },
        container: document.createElement('div'),
        screenToWorld: ({ x, y }: { x: number; y: number }) => ({ x: x + view.center.x, y: y + view.center.y }),
        flyTo,
        zoomToFitDrawing,
      };
      internals(adapter).view = view;
      const cameras: unknown[] = [];
      adapter.events.camera.addEventListener((camera) => cameras.push(camera));

      adapter.centerOn([30, 40]);
      expect(cameras.at(-1)).toEqual({ center: [30, 40], resolution: 1 });

      adapter.fitDrawing();
      expect(zoomToFitDrawing).toHaveBeenCalledWith(120_000, 'model');
      vi.advanceTimersByTime(350);
      expect(cameras).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
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
        featureId: '42', objectKey: '::42', layerId: 'A', cadType: 'LINE', label: '', blockPath: [],
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

  it('reports a lost WebGL context only after releasing renderer resources', async () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const forceContextLoss = vi.fn();
    const managerDestroy = vi.fn().mockResolvedValue(undefined);
    const adapter = new MlightCadViewerAdapter(container);
    const view = {
      selectionSet: { clear: vi.fn() },
      stopAnimationLoop: vi.fn(),
      clear: vi.fn(),
      renderer: {
        dispose: vi.fn(),
        domElement: canvas,
        internalRenderer: {
          setAnimationLoop: vi.fn(),
          renderLists: { dispose: vi.fn() },
          dispose: vi.fn(),
          forceContextLoss,
        },
      },
    };
    internals(adapter).view = view;
    internals(adapter).manager = { destroy: managerDestroy };
    internals(adapter).bindWebglContextLoss(view);
    const reported = new Promise<Error>((resolve) => adapter.events.error.addEventListener(resolve));

    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    const error = await reported;

    expect(event.defaultPrevented).toBe(true);
    expect(error.message).toBe('MLIGHTCAD_WEBGL_CONTEXT_LOST');
    expect(managerDestroy).toHaveBeenCalledOnce();
    expect(forceContextLoss).toHaveBeenCalledOnce();
    expect(container.childElementCount).toBe(0);
  });
});
