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
    act(() => result.current.setViewer('mlightcad'));

    expect(result.current.activeViewer).toBe('mlightcad');
    expect(result.current.file).toBe(file);
    expect(window.location.pathname).toBe('/mlightcad');

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.activeViewer).toBe('legacy');
    expect(result.current.file).toBe(file);
    expect(result.current.fileRevision).toBe(1);
  });

  it('shares basemap visibility while switching renderers', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    expect(result.current.basemapVisible).toBe(true);
    act(() => result.current.toggleBasemapVisible());
    expect(result.current.basemapVisible).toBe(false);

    act(() => result.current.setViewer('mlightcad'));
    expect(result.current.basemapVisible).toBe(false);

    act(() => result.current.setBasemapVisible(true));
    expect(result.current.basemapVisible).toBe(true);
  });

  it('retains Geoportail health while switching renderers', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });
    const generation = result.current.basemapHealth.generation;

    act(() => {
      result.current.basemapHealthReporter.sourceMounted(generation);
      result.current.basemapHealthReporter.tileLoadEnd(generation);
    });
    expect(result.current.basemapHealth).toMatchObject({ mode: 'wmts', status: 'ready' });

    act(() => result.current.setViewer('mlightcad'));
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
