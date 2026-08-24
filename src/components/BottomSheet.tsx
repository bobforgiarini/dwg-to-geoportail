import type { ReactNode } from 'react';

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
  return (
    <div
      className={`sheet-shell ${modal ? 'sheet-modal' : 'sheet-dock'} ${open ? 'is-open' : ''}`}
      onPointerDown={(event) => modal && event.target === event.currentTarget && onClose()}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <section className={`bottom-sheet ${className}`} role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-label={ariaLabel}>
        <button className="sheet-handle-button" onClick={(event) => { event.currentTarget.blur(); onClose(); }} aria-label={closeLabel} title={closeLabel}>
          <span className="sheet-handle" aria-hidden="true" />
        </button>
        {children}
      </section>
    </div>
  );
}
