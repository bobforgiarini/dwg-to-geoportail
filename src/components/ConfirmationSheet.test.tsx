import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ConfirmationSheet } from './ConfirmationSheet';

describe('ConfirmationSheet', () => {
  afterEach(cleanup);

  it('uses the common modal sheet and exposes both decisions', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { getByRole, getByText } = render(
      <ConfirmationSheet
        open
        title="Replace DWG?"
        description="The current drawing will be replaced."
        confirmLabel="Replace"
        cancelLabel="Keep current"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(getByRole('dialog', { name: 'Replace DWG?' })).toBeInTheDocument();
    expect(getByText('The current drawing will be replaced.')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Keep current' }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Replace' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('blocks confirmation, cancellation and backdrop closing while busy', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { container, getByRole } = render(
      <ConfirmationSheet
        open
        busy
        title="Replace DWG?"
        description="Waiting"
        confirmLabel="Replace"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(getByRole('button', { name: 'Replace' })).toBeDisabled();
    expect(getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(container.querySelector('.sheet-shell') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

