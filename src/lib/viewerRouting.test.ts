import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getViewerHref, navigateBrowserToViewer, resolveViewerKind } from './viewerRouting';

describe('viewer routing', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('maps the public routes to their renderer', () => {
    expect(resolveViewerKind('/')).toBe('mlightcad');
    expect(resolveViewerKind('/openlayers')).toBe('legacy');
    expect(resolveViewerKind('/openlayers/')).toBe('legacy');
    expect(resolveViewerKind('/mlightcad')).toBe('mlightcad');
    expect(resolveViewerKind('/mlightcad/')).toBe('mlightcad');
    expect(resolveViewerKind('/unknown')).toBe('mlightcad');
    expect(getViewerHref('legacy')).toBe('/openlayers');
    expect(getViewerHref('mlightcad')).toBe('/');
  });

  it('navigates with the History API', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    navigateBrowserToViewer('legacy');
    expect(pushState).toHaveBeenCalledWith({ viewer: 'legacy' }, '', '/openlayers');
    expect(window.location.pathname).toBe('/openlayers');
  });

  it('can replace the current route', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    navigateBrowserToViewer('legacy', { replace: true });
    expect(replaceState).toHaveBeenLastCalledWith({ viewer: 'legacy' }, '', '/openlayers');
  });
});
