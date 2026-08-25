import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import App from './App';
import { CadSessionProvider, useCadSession } from './session/CadSessionContext';

const fitDrawing = vi.hoisted(() => vi.fn());
const mapCanvasProps = vi.hoisted(() => vi.fn());
const importDwg = vi.hoisted(() => vi.fn());

vi.mock('./components/MapCanvas', async () => {
  const React = await import('react');
  return {
    MapCanvas: React.forwardRef((props: Record<string, unknown>, ref) => {
      mapCanvasProps(props);
      React.useImperativeHandle(ref, () => ({ fitDrawing }));
      return React.createElement('div', { 'data-testid': 'legacy-map' });
    }),
  };
});

vi.mock('./lib/cad/importDwg', () => ({
  RECOMMENDED_DWG_BYTES: 10 * 1024 * 1024,
  cancelDwgImport: vi.fn(),
  importDwg,
}));

function renderApp() {
  return render(<CadSessionProvider><App /></CadSessionProvider>);
}

function DeferredLegacyViewer() {
  const session = useCadSession();
  const [mounted, setMounted] = useState(false);
  if (mounted) return <App />;
  return (
    <button onClick={() => {
      session.setFile(new File(['dwg'], 'session.dwg'));
      setMounted(true);
    }}>
      Mount legacy
    </button>
  );
}

describe('legacy viewer controls', () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage('de');
    window.history.replaceState(null, '', '/');
    fitDrawing.mockClear();
    mapCanvasProps.mockClear();
    importDwg.mockReset();
    importDwg.mockImplementation(async (file: File) => ({
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      lurefExtent: [60_000, 70_000, 60_100, 70_100],
      layers: [{ id: '0', name: 'Plan', visible: true, featureCount: 0 }],
      features: [],
      autoHiddenFeatureIds: [],
      warnings: ['3d-flattened'],
    }));
  });

  it('uses the same compact action order and modal CAD drawer as MLightCAD', () => {
    const { container, getByLabelText, getByRole, queryByRole } = renderApp();
    const dialog = getByRole('dialog', { name: i18n.t('cadControlsTitle') });
    const actionBar = getByLabelText(i18n.t('mapActions'));
    const actionLabels = within(actionBar).getAllByRole('button').map((button) => button.getAttribute('aria-label'));

    expect(actionLabels).toEqual([
      i18n.t('layers'),
      i18n.t('openCadControls'),
      i18n.t('locationStart'),
      i18n.t('fitDrawing'),
    ]);

    fireEvent.click(dialog.closest('.sheet-shell') as HTMLElement);
    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('openCadControls') }));
    expect(getByRole('dialog', { name: i18n.t('cadControlsTitle') })).toBeInTheDocument();
    expect(container.querySelector('.drawer-reopen')).not.toBeInTheDocument();
  });

  it('passes opacity to MapCanvas, exposes fit drawing, and keeps legacy warnings', async () => {
    const { container, getByRole, getByText } = renderApp();
    const file = new File(['dwg'], 'plan.dwg');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(getByRole('button', { name: i18n.t('fitDrawing') })).toBeEnabled());
    expect(getByText(i18n.t('warning3d'))).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: i18n.t('fitDrawing') }));
    expect(fitDrawing).toHaveBeenCalledOnce();

    fireEvent.click(getByRole('button', { name: i18n.t('opacityMap') }));
    await waitFor(() => expect(mapCanvasProps).toHaveBeenLastCalledWith(expect.objectContaining({ cadOpacity: 0 })));
  });

  it('starts closed when mounting with an existing session file', async () => {
    const { getByRole, queryByRole } = render(
      <CadSessionProvider><DeferredLegacyViewer /></CadSessionProvider>,
    );

    fireEvent.click(getByRole('button', { name: 'Mount legacy' }));

    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();
    await waitFor(() => expect(importDwg).toHaveBeenCalledOnce());
    expect(queryByRole('dialog', { name: i18n.t('cadControlsTitle') })).not.toBeInTheDocument();
  });
});
