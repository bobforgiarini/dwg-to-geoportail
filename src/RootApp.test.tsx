import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootApp from './RootApp';

vi.mock('./pages/MlightCadViewerPage', () => ({
  default: () => <div>MLightCAD route mounted</div>,
}));

describe('RootApp', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(cleanup);

  it('mounts MLightCAD as the root experience', async () => {
    render(<RootApp />);
    expect(await screen.findByText('MLightCAD route mounted')).toBeInTheDocument();
  });

  it('has no client-side legacy renderer fallback', async () => {
    window.history.replaceState(null, '', '/openlayers');
    render(<RootApp />);
    expect(await screen.findByText('MLightCAD route mounted')).toBeInTheDocument();
  });
});
