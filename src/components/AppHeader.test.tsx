import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import { CadSessionProvider } from '../session/CadSessionContext';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('uses one compact control to switch between viewers', () => {
    const { getByRole } = render(<CadSessionProvider><AppHeader /></CadSessionProvider>);
    const toMlight = getByRole('link', { name: /MLightCAD/i });

    expect(toMlight).toHaveTextContent('ML');
    fireEvent.click(toMlight);

    expect(window.location.pathname).toBe('/mlightcad');
    expect(getByRole('link', { name: /OpenLayers/i })).toHaveTextContent('OL');
  });
});
