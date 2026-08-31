import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import packageJson from '../../package.json';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
  });

  it('uses the former viewer slot for a compact DWG upload control', () => {
    const onOpenDwgControls = vi.fn();
    const { getByRole, getByText, rerender } = render(
      <AppHeader dwgControlsOpen={false} onOpenDwgControls={onOpenDwgControls} />,
    );
    const upload = getByRole('button', { name: i18n.t('dwgControlsTitle') });

    expect(getByText(`v${packageJson.version}`)).toBeInTheDocument();
    expect(upload).toHaveAttribute('aria-expanded', 'false');
    expect(upload).not.toHaveTextContent('OL');
    fireEvent.click(upload);
    expect(onOpenDwgControls).toHaveBeenCalledOnce();

    rerender(<AppHeader dwgControlsOpen onOpenDwgControls={onOpenDwgControls} />);
    expect(upload).toHaveAttribute('aria-expanded', 'true');
  });
});
