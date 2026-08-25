export type ViewerKind = 'legacy' | 'mlightcad';

export interface ViewerNavigationOptions {
  replace?: boolean;
}

const VIEWER_PATHS: Readonly<Record<ViewerKind, string>> = {
  legacy: '/',
  mlightcad: '/mlightcad',
};

/** Returns the app route for a CAD renderer without touching browser state. */
export function getViewerHref(viewer: ViewerKind): string {
  return VIEWER_PATHS[viewer];
}

/**
 * Resolves a browser pathname to a renderer. Unknown routes deliberately fall
 * back to the established viewer, which is also the app's root experience.
 */
export function resolveViewerKind(pathname: string): ViewerKind {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return normalizedPath === VIEWER_PATHS.mlightcad ? 'mlightcad' : 'legacy';
}

/**
 * Updates the URL through the History API. The caller owns the corresponding
 * React state update because pushState and replaceState do not emit popstate.
 */
export function navigateBrowserToViewer(
  viewer: ViewerKind,
  options: ViewerNavigationOptions = {},
  browserWindow: Window = window,
): void {
  const targetPath = getViewerHref(viewer);
  const currentPath = browserWindow.location.pathname;

  if (currentPath === targetPath) return;

  const method = options.replace ? 'replaceState' : 'pushState';
  browserWindow.history[method]({ viewer }, '', targetPath);
}
