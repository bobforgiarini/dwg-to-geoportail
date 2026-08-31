import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { CadSettingsSheet } from './CadSettingsSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof CadSettingsSheet>> = {}) {
  const props: React.ComponentProps<typeof CadSettingsSheet> = {
    open: true,
    opacity: 70,
    renderQuality: 'auto',
    cadTextVisible: true,
    hiddenObjectCount: 2,
    hiddenLayerCount: 3,
    hiddenBlockCount: 4,
    controlsDisabled: false,
    onClose: vi.fn(),
    onOpacityChange: vi.fn(),
    onRenderQualityChange: vi.fn(),
    onToggleTexts: vi.fn(),
    onRestoreHiddenObjects: vi.fn(),
    onRestoreHiddenLayers: vi.fn(),
    onRestoreHiddenBlocks: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CadSettingsSheet {...props} />) };
}

describe('CadSettingsSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(cleanup);

  it('contains CAD appearance and quality controls without DWG file actions', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'CAD settings' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'CAD opacity' })).toHaveValue('70');
    expect(screen.getByRole('region', { name: 'CAD quality' })).toBeInTheDocument();
    expect(screen.queryByText('DWG file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace DWG' })).not.toBeInTheDocument();
  });

  it('reports text and all three independent restore actions', () => {
    const { props } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Hide CAD texts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 hidden objects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 hidden layers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 hidden blocks' }));

    expect(props.onToggleTexts).toHaveBeenCalledOnce();
    expect(props.onRestoreHiddenObjects).toHaveBeenCalledOnce();
    expect(props.onRestoreHiddenLayers).toHaveBeenCalledOnce();
    expect(props.onRestoreHiddenBlocks).toHaveBeenCalledOnce();
  });

  it('disables only restore actions whose count is zero', () => {
    renderSheet({ hiddenObjectCount: 0, hiddenLayerCount: 0, hiddenBlockCount: 1 });

    expect(screen.getByRole('button', { name: 'Show 0 hidden objects' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show 0 hidden layers' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show 1 hidden blocks' })).toBeEnabled();
  });
});
