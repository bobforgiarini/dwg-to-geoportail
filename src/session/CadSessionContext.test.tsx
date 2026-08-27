import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { markDwgImportStarted } from '../lib/cad/importRecovery';
import { CadSessionProvider, useCadSession } from './CadSessionContext';

function Wrapper({ children }: PropsWithChildren) {
  return <CadSessionProvider>{children}</CadSessionProvider>;
}

describe('CadSessionProvider', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('keeps the selected file in memory and increments its revision', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const firstFile = new File(['first'], 'first.dwg');
    const secondFile = new File(['second'], 'second.dwg');

    act(() => result.current.setFile(firstFile));
    expect(result.current.file).toBe(firstFile);
    expect(result.current.fileRevision).toBe(1);

    act(() => result.current.setFile(secondFile));
    expect(result.current.file).toBe(secondFile);
    expect(result.current.fileRevision).toBe(2);

    act(() => result.current.clearFile());
    expect(result.current.file).toBeNull();
    expect(result.current.fileRevision).toBe(3);
  });

  it('retains the file while switching renderers and following popstate', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const file = new File(['drawing'], 'drawing.dwg');

    act(() => result.current.setFile(file));
    act(() => result.current.setViewer('legacy'));

    expect(result.current.activeViewer).toBe('legacy');
    expect(result.current.file).toBe(file);
    expect(window.location.pathname).toBe('/openlayers');

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.activeViewer).toBe('mlightcad');
    expect(result.current.file).toBe(file);
    expect(result.current.fileRevision).toBe(1);
  });

  it('shares basemap visibility while switching renderers', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    expect(result.current.basemapVisible).toBe(true);
    act(() => result.current.toggleBasemapVisible());
    expect(result.current.basemapVisible).toBe(false);

    act(() => result.current.setViewer('legacy'));
    expect(result.current.basemapVisible).toBe(false);

    act(() => result.current.setBasemapVisible(true));
    expect(result.current.basemapVisible).toBe(true);
  });

  it('retains the selected MLightCAD quality while switching renderers', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    expect(result.current.cadRenderQuality).toBe('auto');
    act(() => result.current.setCadRenderQuality('sharp'));
    act(() => result.current.setViewer('legacy'));

    expect(result.current.cadRenderQuality).toBe('sharp');
  });

  it('shares draw order across viewers and resets it only for a new DWG', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const file = new File(['drawing'], 'drawing.dwg');
    act(() => result.current.setFile(file));
    act(() => result.current.setObjectDrawOrder('symbol::42', 'front'));
    act(() => result.current.setViewer('legacy'));
    expect(result.current.objectDrawOrder).toEqual({ front: ['symbol::42'], back: [] });

    act(() => result.current.reloadFile());
    expect(result.current.objectDrawOrder.front).toEqual(['symbol::42']);

    act(() => result.current.setObjectDrawOrder('symbol::42', 'back'));
    expect(result.current.objectDrawOrder).toEqual({ front: [], back: ['symbol::42'] });

    act(() => result.current.setFile(new File(['next'], 'next.dwg')));
    expect(result.current.objectDrawOrder).toEqual({ front: [], back: [] });
  });

  it('shares local XRefs, annotation scale and the Luxembourg filter across viewers and reloads', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const root = new File(['root'], 'root.dwg', { lastModified: 1 });
    const xref = new File(['xref'], 'Road.dwg', { lastModified: 2 });

    act(() => result.current.setFile(root));
    act(() => result.current.addXrefFiles([xref]));
    const revisionAfterXref = result.current.fileRevision;
    act(() => result.current.setPreferredXrefFile('root:xref-road', 'road:4:2'));
    act(() => result.current.setAnnotationScaleId('scale-500'));
    act(() => result.current.setSpatialFilterEnabled(false));
    act(() => result.current.setViewer('legacy'));

    expect(result.current.xrefFiles).toEqual([xref]);
    expect(result.current.preferredXrefFileIds).toEqual({ 'root:xref-road': 'road:4:2' });
    expect(result.current.annotationScaleId).toBe('scale-500');
    expect(result.current.spatialFilterEnabled).toBe(false);
    expect(result.current.fileRevision).toBe(revisionAfterXref + 1);

    act(() => result.current.reloadFile());
    expect(result.current.fileRevision).toBe(revisionAfterXref + 2);
    expect(result.current.xrefFiles).toEqual([xref]);
    expect(result.current.annotationScaleId).toBe('scale-500');
    expect(result.current.spatialFilterEnabled).toBe(false);
  });

  it('deduplicates local XRefs and resets all DWG-specific preparation choices for a new file', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const duplicateA = new File(['same'], 'Road.dwg', { lastModified: 5 });
    const duplicateB = new File(['same'], 'Road.dwg', { lastModified: 5 });

    act(() => result.current.setFile(new File(['root'], 'root.dwg')));
    act(() => result.current.addXrefFiles([duplicateA, duplicateB, new File(['x'], 'notes.txt')]));
    act(() => result.current.setPreferredXrefFile('xref:road', 'road:4:5'));
    act(() => result.current.setAnnotationScaleId('scale-1000'));
    act(() => result.current.setSpatialFilterEnabled(false));

    expect(result.current.xrefFiles).toEqual([duplicateB]);

    act(() => result.current.setFile(new File(['next'], 'next.dwg')));
    expect(result.current.xrefFiles).toEqual([]);
    expect(result.current.preferredXrefFileIds).toEqual({});
    expect(result.current.annotationScaleId).toBeNull();
    expect(result.current.spatialFilterEnabled).toBe(true);
  });

  it('retains Geoportail health while switching renderers', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const generation = result.current.basemapHealth.generation;

    act(() => {
      result.current.basemapHealthReporter.sourceMounted(generation);
      result.current.basemapHealthReporter.tileLoadEnd(generation);
    });
    expect(result.current.basemapHealth).toMatchObject({ mode: 'wmts', status: 'ready' });

    act(() => result.current.setViewer('legacy'));
    expect(result.current.basemapHealth).toMatchObject({ mode: 'wmts', status: 'ready' });
  });

  it('pauses Geoportail health while CAD preparation releases the basemap', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const generation = result.current.basemapHealth.generation;

    act(() => result.current.setBasemapHealthSuspended(true));
    act(() => result.current.basemapHealthReporter.tileLoadEnd(generation));
    expect(result.current.basemapHealth.status).not.toBe('ready');

    act(() => result.current.setBasemapHealthSuspended(false));
    expect(result.current.basemapHealth.generation).toBeGreaterThan(generation);
  });

  it('consumes a hard-termination marker once and forces preparation only for the matching file', () => {
    const file = new File(['drawing'], 'interrupted.dwg');
    markDwgImportStarted(file);
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    expect(result.current.recoveryMarker).toMatchObject({ name: file.name, size: file.size });
    act(() => result.current.setFile(file));
    expect(result.current.recoveryMarker).toBeNull();
    expect(result.current.recoveryPreparationRequired).toBe(true);

    act(() => result.current.clearRecoveryPreparationRequirement());
    expect(result.current.recoveryPreparationRequired).toBe(false);
    act(() => result.current.reloadFile());
    expect(result.current.recoveryPreparationRequired).toBe(false);
  });

  it('requires the hook to be rendered inside its provider', () => {
    expect(() => renderHook(() => useCadSession())).toThrow(
      'useCadSession must be used inside a CadSessionProvider',
    );
  });
});
