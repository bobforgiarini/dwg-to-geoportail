import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { CadControlSheet } from './CadControlSheet';
import { CadRenderQualityControl } from './CadRenderQualityControl';

describe('CAD render quality control', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
  });

  afterEach(cleanup);

  it('shows all three compact modes and announces the selected mode', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<CadRenderQualityControl value="auto" onChange={onChange} />);
    const group = getByRole('region', { name: i18n.t('cadQuality') });

    expect(within(group).getByRole('button', { name: 'Auto · bis 2×' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Scharf · bis 2,5×' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(group).getByRole('button', { name: 'Speicher · 1×' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(group).getByRole('button', { name: 'Scharf · bis 2,5×' }));
    expect(onChange).toHaveBeenCalledWith('sharp');
  });

  it('keeps the quality UI out of legacy CAD drawers when its optional props are omitted', () => {
    const props = {
      open: true,
      file: null,
      entityCount: 0,
      loading: false,
      loadingTitle: '',
      progressLabel: '',
      message: null,
      opacity: 70,
      cadTextVisible: true,
      hiddenObjectCount: 0,
      controlsDisabled: false,
      onClose: vi.fn(),
      onDismissMessage: vi.fn(),
      onChooseFile: vi.fn(),
      onRemoveFile: vi.fn(),
      onCancel: vi.fn(),
      onOpacityChange: vi.fn(),
      onToggleTexts: vi.fn(),
      onRestoreHidden: vi.fn(),
    };
    const { queryByRole, rerender } = render(<CadControlSheet {...props} />);

    expect(queryByRole('region', { name: i18n.t('cadQuality') })).not.toBeInTheDocument();

    rerender(
      <CadControlSheet
        {...props}
        renderQuality="memory"
        onRenderQualityChange={vi.fn()}
      />,
    );
    expect(queryByRole('region', { name: i18n.t('cadQuality') })).toBeInTheDocument();
  });
});
