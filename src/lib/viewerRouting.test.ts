import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getViewerHref, navigateBrowserToViewer, resolveViewerKind } from './viewerRouting';

describe('viewer routing', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('maps the public routes to their renderer', () => {
    expect(resolveViewerKind('/')).toBe('legacy');
    expect(resolveViewerKind('/mlightcad')).toBe('mlightcad');
    expect(resolveViewerKind('/mlightcad/')).toBe('mlightcad');
    expect(resolveViewerKind('/unknown')).toBe('legacy');
    expect(getViewerHref('legacy')).toBe('/');
    expect(getViewerHref('mlightcad')).toBe('/mlightcad');
  });

  it('navigates with the History API', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    navigateBrowserToViewer('mlightcad');
    expect(pushState).toHaveBeenCalledWith({ viewer: 'mlightcad' }, '', '/mlightcad');
    expect(window.location.pathname).toBe('/mlightcad');
  });

  it('can replace the current route', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    navigateBrowserToViewer('mlightcad', { replace: true });
    expect(replaceState).toHaveBeenLastCalledWith({ viewer: 'mlightcad' }, '', '/mlightcad');
  });
});
