import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
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

});
