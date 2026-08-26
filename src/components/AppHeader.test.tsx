import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import packageJson from '../../package.json';
import { CadSessionProvider } from '../session/CadSessionContext';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('uses one compact control to switch between viewers', () => {
    const { getByRole, getByText } = render(<CadSessionProvider><AppHeader /></CadSessionProvider>);
    const toLegacy = getByRole('link', { name: /OpenLayers/i });

    expect(getByText(`v${packageJson.version}`)).toBeInTheDocument();
    expect(toLegacy).toHaveTextContent('OL');
    fireEvent.click(toLegacy);

    expect(window.location.pathname).toBe('/openlayers');
    expect(getByRole('link', { name: /MLightCAD/i })).toHaveTextContent('ML');
  });
});
