import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  afterEach(cleanup);

  it('closes a modal drawer only after a complete backdrop click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <BottomSheet open modal ariaLabel="Controls" closeLabel="Close" onClose={onClose}>
        <div>Drawer content</div>
      </BottomSheet>,
    );

    fireEvent.click(getByText('Drawer content'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(container.querySelector('.sheet-shell') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('.sheet-shell') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps focus, closes with Escape and restores the previous focus', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open drawer';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { getByRole, rerender } = render(
      <BottomSheet open modal ariaLabel="Controls" closeLabel="Close" onClose={onClose}>
        <button>First action</button>
        <button>Last action</button>
      </BottomSheet>,
    );

    const closeButton = getByRole('button', { name: 'Close' });
    const lastButton = getByRole('button', { name: 'Last action' });
    expect(closeButton).toHaveFocus();

    lastButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(lastButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <BottomSheet open={false} modal ariaLabel="Controls" closeLabel="Close" onClose={onClose}>
        <button>First action</button>
      </BottomSheet>,
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
