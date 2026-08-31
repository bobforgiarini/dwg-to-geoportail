import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import packageJson from '../../package.json';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
  });

  it('uses the former viewer slot for a compact settings control', () => {
    const onOpenSettings = vi.fn();
    const { getByRole, getByText, rerender } = render(
      <AppHeader settingsOpen={false} onOpenSettings={onOpenSettings} />,
    );
    const settings = getByRole('button', { name: /Einstellungen/i });

    expect(getByText(`v${packageJson.version}`)).toBeInTheDocument();
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    expect(settings).not.toHaveTextContent('OL');
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledOnce();

    rerender(<AppHeader settingsOpen onOpenSettings={onOpenSettings} />);
    expect(settings).toHaveAttribute('aria-expanded', 'true');
  });
});
