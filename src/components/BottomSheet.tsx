import { type ReactNode, useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  modal?: boolean;
  className?: string;
  ariaLabel: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ open, modal = false, className = '', ariaLabel, closeLabel, onClose, children }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !modal || !sheet.current) return;
    const dialog = sheet.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    (focusableElements()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [modal, open]);

  return (
    <div
      className={`sheet-shell ${modal ? 'sheet-modal' : 'sheet-dock'} ${open ? 'is-open' : ''}`}
      onClick={(event) => modal && event.target === event.currentTarget && onClose()}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <section ref={sheet} className={`bottom-sheet ${className}`} role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-label={ariaLabel} tabIndex={modal ? -1 : undefined}>
        <button className="sheet-handle-button" onClick={(event) => { event.currentTarget.blur(); onClose(); }} aria-label={closeLabel} title={closeLabel}>
          <span className="sheet-handle" aria-hidden="true" />
        </button>
        {children}
      </section>
    </div>
  );
}
