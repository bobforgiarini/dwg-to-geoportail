import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootApp from './RootApp';

vi.mock('./App', () => ({
  default: () => <div>OpenLayers route mounted</div>,
}));

vi.mock('./pages/MlightCadViewerPage', () => ({
  default: () => <div>MLightCAD route mounted</div>,
}));

describe('RootApp viewer routes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(cleanup);

  it('mounts MLightCAD as the root experience', async () => {
    render(<RootApp />);
    expect(await screen.findByText('MLightCAD route mounted')).toBeInTheDocument();
    expect(screen.queryByText('OpenLayers route mounted')).not.toBeInTheDocument();
  });

  it('mounts the legacy viewer only at /openlayers', async () => {
    window.history.replaceState(null, '', '/openlayers');
    render(<RootApp />);
    expect(await screen.findByText('OpenLayers route mounted')).toBeInTheDocument();
    expect(screen.queryByText('MLightCAD route mounted')).not.toBeInTheDocument();
  });
});
