import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerSheet, type LayerSheetItem, type LayerSheetLabels } from './LayerSheet';

const labels: LayerSheetLabels = {
  ariaLabel: 'Layer controls',
  close: 'Close layers',
  title: 'Layers',
  searchLabel: 'Search layers',
  searchPlaceholder: 'Search layer',
  showAll: 'Show all',
  hideAll: 'Hide all',
  noLayers: 'No layers',
  noMatches: 'No matches',
  reloadRequired: 'Reload required',
  applyChanges: 'Apply changes',
  visibleCount: (count) => `${count} visible`,
  hiddenCount: (count) => `${count} hidden`,
  visibilitySummary: (visible, hidden) => `${visible} visible and ${hidden} hidden`,
  objectCount: (count) => `${count} objects`,
  cost: { low: 'Low', medium: 'Medium', high: 'High' },
  costLabel: (cost) => `Load cost ${cost}`,
  toggleLayer: (name, nextVisible) => `${nextVisible ? 'Show' : 'Hide'} ${name}`,
};

const layers: LayerSheetItem[] = [
  {
    id: '20_PLANUNG',
    name: 'Planning contours',
    visible: true,
    objectCount: 320,
    cost: 'medium',
    requiresReload: false,
  },
  {
    id: '99_ORTHO',
    name: 'Orthophoto frame',
    visible: false,
    objectCount: 920,
    cost: 'high',
    requiresReload: true,
  },
];

function renderSheet(overrides: Partial<React.ComponentProps<typeof LayerSheet>> = {}) {
  const props: React.ComponentProps<typeof LayerSheet> = {
    open: true,
    layers,
    labels,
    onClose: vi.fn(),
    onSetVisible: vi.fn(),
    onSetAllVisible: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<LayerSheet {...props} />) };
}

describe('LayerSheet', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the animated shell mounted without rendering closed layer rows', () => {
    const { container } = renderSheet({ open: false });

    expect(container.querySelector('.sheet-shell')).toBeInTheDocument();
    expect(screen.queryByText('Planning contours')).not.toBeInTheDocument();
    expect(screen.queryByText('Orthophoto frame')).not.toBeInTheDocument();
  });

  it('keeps rows through the closing animation and releases them afterwards', () => {
    vi.useFakeTimers();
    const { props, rerender } = renderSheet();

    rerender(<LayerSheet {...props} open={false} />);
    expect(screen.getByText('Planning contours')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText('Planning contours')).not.toBeInTheDocument();
  });

  it('shows visibility counts and filters layers by name or id', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Layer controls' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '1 visible and 1 hidden' })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search layers' });

    fireEvent.change(search, { target: { value: 'ortho' } });
    expect(screen.getByRole('button', { name: 'Show Orthophoto frame' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide Planning contours' })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '20_planung' } });
    expect(screen.getByRole('button', { name: 'Hide Planning contours' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'missing' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('reports explicit row and bulk visibility actions', () => {
    const onSetVisible = vi.fn();
    const onSetAllVisible = vi.fn();
    renderSheet({ onSetVisible, onSetAllVisible });

    fireEvent.click(screen.getByRole('button', { name: 'Hide Planning contours' }));
    expect(onSetVisible).toHaveBeenCalledWith('20_PLANUNG', false);

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(onSetAllVisible).toHaveBeenNthCalledWith(1, true);
    expect(onSetAllVisible).toHaveBeenNthCalledWith(2, false);
  });

  it('rerenders only the changed layer row for large-drawing toggles', () => {
    const objectCount = vi.fn((count: number) => `${count} objects`);
    const stableLabels = { ...labels, objectCount };
    const { props, rerender } = renderSheet({ labels: stableLabels });
    expect(objectCount).toHaveBeenCalledTimes(2);

    rerender(<LayerSheet
      {...props}
      labels={stableLabels}
      layers={layers.map((layer) => layer.id === '20_PLANUNG' ? { ...layer, visible: false } : { ...layer })}
    />);

    expect(objectCount).toHaveBeenCalledTimes(3);
  });

  it('shows object count, performance cost and reload state', () => {
    renderSheet();

    const planning = screen.getByRole('button', { name: 'Hide Planning contours' });
    expect(within(planning).getByText('320 objects')).toBeInTheDocument();
    expect(within(planning).getByTitle('Load cost Medium')).toBeInTheDocument();

    const orthophoto = screen.getByRole('button', { name: 'Show Orthophoto frame' });
    expect(within(orthophoto).getByText('920 objects')).toBeInTheDocument();
    expect(within(orthophoto).getByTitle('Load cost High')).toBeInTheDocument();
    expect(within(orthophoto).getByLabelText('Reload required')).toBeInTheDocument();
  });

  it('renders an empty state and disables bulk actions', () => {
    renderSheet({ layers: [] });
    expect(screen.getByText('No layers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled();
  });

  it('applies pending reload changes explicitly', () => {
    const onApplyChanges = vi.fn();
    const { props, rerender } = renderSheet({ applyPending: false, onApplyChanges });
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();

    rerender(<LayerSheet {...props} applyPending onApplyChanges={onApplyChanges} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onApplyChanges).toHaveBeenCalledOnce();
  });
});
