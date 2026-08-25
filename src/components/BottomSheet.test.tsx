import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  it('closes a modal drawer when its backdrop is pressed', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <BottomSheet open modal ariaLabel="Controls" closeLabel="Close" onClose={onClose}>
        <div>Drawer content</div>
      </BottomSheet>,
    );

    fireEvent.pointerDown(getByText('Drawer content'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(container.querySelector('.sheet-shell') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
