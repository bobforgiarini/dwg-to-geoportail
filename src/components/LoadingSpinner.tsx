import type { HTMLAttributes } from 'react';

export function LoadingSpinner({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={`loading-spinner ${className}`.trim()}
    />
  );
}
