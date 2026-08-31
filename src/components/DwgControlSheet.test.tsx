import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { DwgControlSheet } from './DwgControlSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof DwgControlSheet>> = {}) {
  const props: React.ComponentProps<typeof DwgControlSheet> = {
    open: true,
    file: null,
    entityCount: 0,
    loading: false,
    loadingTitle: '',
    progressLabel: '',
    message: null,
    preparationAvailable: false,
    spatialFilterEnabled: true,
    onClose: vi.fn(),
    onDismissMessage: vi.fn(),
    onChooseFile: vi.fn(),
    onRemoveFile: vi.fn(),
    onCancel: vi.fn(),
    onOpenPreparation: vi.fn(),
    onSpatialFilterChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DwgControlSheet {...props} />) };
}

describe('DwgControlSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(cleanup);

  it('contains the local DWG input and explicit outer-buffer filter only', () => {
    const { props } = renderSheet();

    expect(screen.getByRole('dialog', { name: 'DWG file' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a 2D DWG' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Luxembourg \+ 1 km outer buffer/ }));

    expect(props.onChooseFile).toHaveBeenCalledOnce();
    expect(props.onSpatialFilterChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('slider', { name: 'CAD opacity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'CAD quality' })).not.toBeInTheDocument();
  });

  it('offers remove, replace and preparation for a loaded DWG', () => {
    const file = new File(['drawing'], 'site.dwg');
    const { props } = renderSheet({ file, entityCount: 17, preparationAvailable: true });

    expect(screen.getByText('site.dwg')).toBeInTheDocument();
    expect(screen.getByText(/17 objects/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove DWG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace DWG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open DWG preparation' }));

    expect(props.onRemoveFile).toHaveBeenCalledOnce();
    expect(props.onChooseFile).toHaveBeenCalledOnce();
    expect(props.onOpenPreparation).toHaveBeenCalledOnce();
  });

  it('shows progress and keeps import cancellation available', () => {
    const { props } = renderSheet({
      loading: true,
      loadingTitle: 'Parsing drawing',
      progressLabel: '42%',
    });

    expect(screen.getByRole('status')).toHaveTextContent('Parsing drawing');
    expect(screen.getByRole('status')).toHaveTextContent('42%');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });
});
