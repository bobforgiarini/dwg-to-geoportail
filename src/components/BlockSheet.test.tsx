import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockSheet, type BlockSheetItem, type BlockSheetLabels } from './BlockSheet';

const labels: BlockSheetLabels = {
  ariaLabel: 'Block controls',
  close: 'Close blocks',
  title: 'Blocks',
  searchLabel: 'Search blocks',
  searchPlaceholder: 'Block or layer',
  showAll: 'Show all',
  hideAll: 'Hide all',
  namedGroup: 'Named blocks',
  systemGroup: 'System blocks',
  xrefGroup: 'External references',
  noBlocks: 'No blocks',
  noMatches: 'No matches',
  reloadRequired: 'Reload required',
  applyChanges: 'Apply changes',
  visibleCount: (count) => `${count} visible`,
  hiddenCount: (count) => `${count} hidden`,
  visibilitySummary: (visible, hidden) => `${visible} visible and ${hidden} hidden`,
  groupCount: (visible, total) => `${visible} of ${total}`,
  instanceCount: (count) => `${count} instances`,
  objectCount: (count) => `${count} objects`,
  textCount: (count) => `${count} texts`,
  hatchCount: (count) => `${count} hatches`,
  mainLayer: (name) => `Layer ${name}`,
  cost: { low: 'Low', medium: 'Medium', high: 'High' },
  costLabel: (cost) => `Load cost ${cost}`,
  toggleBlock: (name, nextVisible) => `${nextVisible ? 'Show' : 'Hide'} ${name}`,
};

const blocks: BlockSheetItem[] = [
  {
    id: 'building',
    name: 'Building A',
    group: 'named',
    visible: true,
    instanceCount: 4,
    recursiveObjectCount: 320,
    textCount: 12,
    hatchCount: 8,
    mainLayer: '20_Planning',
    cost: 'high',
    requiresReload: false,
  },
  {
    id: 'system-door',
    name: '*U19',
    group: 'system',
    visible: false,
    instanceCount: 7,
    recursiveObjectCount: 42,
    textCount: 0,
    hatchCount: 0,
    cost: 'low',
    requiresReload: true,
  },
  {
    id: 'survey',
    name: 'Survey base',
    group: 'xref',
    visible: true,
    instanceCount: 1,
    recursiveObjectCount: 920,
    textCount: 31,
    hatchCount: 0,
    mainLayer: 'XREF',
    cost: 'medium',
    requiresReload: true,
  },
];

function renderSheet(overrides: Partial<React.ComponentProps<typeof BlockSheet>> = {}) {
  const props: React.ComponentProps<typeof BlockSheet> = {
    open: true,
    blocks,
    labels,
    onClose: vi.fn(),
    onSetVisible: vi.fn(),
    onSetAllVisible: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<BlockSheet {...props} />) };
}

describe('BlockSheet', () => {
  afterEach(cleanup);

  it('groups block rows and keeps system blocks collapsed initially', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Block controls' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '2 visible and 1 hidden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Building A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Survey base' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show *U19' })).not.toBeInTheDocument();

    const systemHeading = screen.getByRole('button', { name: /System blocks/ });
    expect(systemHeading).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(systemHeading);
    expect(screen.getByRole('button', { name: 'Show *U19' })).toBeInTheDocument();
  });

  it('filters by block or layer and automatically reveals matching groups', () => {
    renderSheet();
    const search = screen.getByRole('searchbox', { name: 'Search blocks' });

    fireEvent.change(search, { target: { value: 'u19' } });
    expect(screen.getByRole('button', { name: 'Show *U19' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide Building A' })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '20_planning' } });
    expect(screen.getByRole('button', { name: 'Hide Building A' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'not present' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('reports toggle and all-visible actions through callbacks', () => {
    const onSetVisible = vi.fn();
    const onSetAllVisible = vi.fn();
    renderSheet({ onSetVisible, onSetAllVisible });

    fireEvent.click(screen.getByRole('button', { name: 'Hide Building A' }));
    expect(onSetVisible).toHaveBeenCalledWith('building', false);

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(onSetAllVisible).toHaveBeenNthCalledWith(1, true);
    expect(onSetAllVisible).toHaveBeenNthCalledWith(2, false);
  });

  it('shows object metrics, load cost and reload state on a row', () => {
    renderSheet();
    const row = screen.getByRole('button', { name: 'Hide Building A' });
    expect(within(row).getByText('4 instances')).toBeInTheDocument();
    expect(within(row).getByText('320 objects')).toBeInTheDocument();
    expect(within(row).getByText('12 texts')).toBeInTheDocument();
    expect(within(row).getByText('8 hatches')).toBeInTheDocument();
    expect(within(row).getByText('Layer 20_Planning')).toBeInTheDocument();
    expect(within(row).getByTitle('Load cost High')).toBeInTheDocument();

    const xrefRow = screen.getByRole('button', { name: 'Hide Survey base' });
    expect(within(xrefRow).getByLabelText('Reload required')).toBeInTheDocument();
  });

  it('renders an empty state and disables bulk actions', () => {
    renderSheet({ blocks: [] });
    expect(screen.getByText('No blocks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled();
  });

  it('applies pending reload changes explicitly', () => {
    const onApplyChanges = vi.fn();
    const { rerender, props } = renderSheet({ applyPending: false, onApplyChanges });
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();

    rerender(<BlockSheet {...props} applyPending onApplyChanges={onApplyChanges} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onApplyChanges).toHaveBeenCalledOnce();
  });
});
