import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import {
  clampContextMenuPosition,
  MapLocationMenu,
  writeClipboardText,
} from './MapLocationMenu';

describe('MapLocationMenu', () => {
  beforeAll(() => void i18n.changeLanguage('en'));
  afterAll(() => void i18n.changeLanguage('de'));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a desktop popover, copies two-decimal LUREF and closes outside', async () => {
    const copyCoordinate = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const onCoordinateCopied = vi.fn();
    const { getByRole } = render(
      <MapLocationMenu
        open
        coordinate={[80_000.126, 100_000.994]}
        anchor={{ x: 220, y: 160 }}
        presentation="desktop"
        copyCoordinate={copyCoordinate}
        onCoordinateCopied={onCoordinateCopied}
        onClose={onClose}
      />,
    );

    const menu = getByRole('menu', { name: 'Map location' });
    expect(menu).toBeInTheDocument();
    fireEvent.click(getByRole('menuitem', { name: /Copy LUREF coordinates/ }));
    await waitFor(() => expect(copyCoordinate).toHaveBeenCalledWith('80000.13, 100000.99'));
    expect(onCoordinateCopied).toHaveBeenCalledWith('80000.13, 100000.99');
    expect(getByRole('status')).toHaveTextContent('Coordinates copied');

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('switches from the desktop target choice to coordinates and back', () => {
    const onDesktopSourceChange = vi.fn();
    const { getByRole, queryByRole, rerender } = render(
      <MapLocationMenu
        open
        coordinate={null}
        anchor={{ x: 120, y: 160 }}
        presentation="desktop"
        desktopSource="choose"
        onDesktopSourceChange={onDesktopSourceChange}
        onClose={vi.fn()}
      />,
    );

    expect(getByRole('menuitem', { name: 'Position here (gold)' })).toBeInTheDocument();
    expect(getByRole('menuitem', { name: 'Position from center (red)' })).toBeInTheDocument();
    expect(queryByRole('menuitem', { name: /Copy LUREF/ })).not.toBeInTheDocument();
    fireEvent.click(getByRole('menuitem', { name: 'Position here (gold)' }));
    expect(onDesktopSourceChange).toHaveBeenCalledWith('here');

    rerender(
      <MapLocationMenu
        open
        coordinate={[80_000, 100_000]}
        anchor={{ x: 120, y: 160 }}
        presentation="desktop"
        desktopSource="here"
        onDesktopSourceChange={onDesktopSourceChange}
        onClose={vi.fn()}
      />,
    );
    const back = getByRole('menuitem', { name: 'Back' });
    expect(back.className).toContain('backAction');
    expect(getByRole('menuitem', { name: /Copy LUREF/ })).toBeInTheDocument();
    fireEvent.click(back);
    expect(onDesktopSourceChange).toHaveBeenLastCalledWith('choose');
  });

  it('uses the browser clipboard API when available', async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    try {
      await writeClipboardText('80000.00, 100000.00');
      expect(writeText).toHaveBeenCalledWith('80000.00, 100000.00');
    } finally {
      if (previous) Object.defineProperty(navigator, 'clipboard', previous);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('provides only the requested map services and closes after a link action', () => {
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(
      <MapLocationMenu
        open
        coordinate={[80_000, 100_000]}
        presentation="desktop"
        onClose={onClose}
      />,
    );

    const geoportail = getByRole('menuitem', { name: 'Open Geoportail' });
    const google = getByRole('menuitem', { name: 'Open Google Maps' });
    const apple = getByRole('menuitem', { name: 'Open Apple Maps' });
    const streetView = getByRole('menuitem', { name: 'Open Google Street View' });
    expect(geoportail).toHaveAttribute('target', '_blank');
    expect(google).toHaveAttribute('href', expect.stringContaining('google.com/maps/search'));
    expect(apple).toHaveAttribute('href', expect.stringContaining('maps.apple.com'));
    expect(streetView).toHaveAttribute('href', expect.stringContaining('map_action=pano'));
    expect(queryByRole('menuitem', { name: /Look Around/i })).not.toBeInTheDocument();

    fireEvent.click(geoportail);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the common modal BottomSheet on mobile', () => {
    const onClose = vi.fn();
    const { container, getByRole } = render(
      <MapLocationMenu
        open
        coordinate={[80_000, 100_000]}
        presentation="mobile"
        onClose={onClose}
      />,
    );

    expect(getByRole('dialog', { name: 'Map location' })).toBeInTheDocument();
    expect(getByRole('menuitem', { name: /Copy LUREF coordinates/ })).toBeInTheDocument();
    fireEvent.click(container.querySelector('.sheet-shell') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('reports clipboard failure without closing the menu', async () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <MapLocationMenu
        open
        coordinate={[80_000, 100_000]}
        presentation="desktop"
        copyCoordinate={async () => { throw new Error('denied'); }}
        onClose={onClose}
      />,
    );

    fireEvent.click(getByRole('menuitem', { name: /Copy LUREF coordinates/ }));
    await waitFor(() => expect(getByRole('status')).toHaveTextContent('could not be copied'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the desktop menu with Escape', () => {
    const onClose = vi.fn();
    render(
      <MapLocationMenu
        open
        coordinate={[80_000, 100_000]}
        presentation="desktop"
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the popover inside all viewport edges', () => {
    expect(clampContextMenuPosition(
      { x: 390, y: 790 },
      { width: 280, height: 330 },
      { width: 400, height: 800 },
    )).toEqual({ x: 112, y: 462 });
    expect(clampContextMenuPosition(
      { x: -20, y: -40 },
      { width: 280, height: 330 },
      { width: 400, height: 800 },
    )).toEqual({ x: 8, y: 8 });
  });

  it('renders nothing until a coordinate exists', () => {
    const { queryByRole } = render(
      <MapLocationMenu open coordinate={null} presentation="desktop" onClose={vi.fn()} />,
    );
    expect(queryByRole('menu')).not.toBeInTheDocument();
  });
});
