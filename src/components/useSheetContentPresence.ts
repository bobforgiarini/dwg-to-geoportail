import { useEffect, useState } from 'react';

const SHEET_EXIT_DURATION_MS = 300;

/** Keeps expensive drawer content mounted only for the visible exit animation. */
export function useSheetContentPresence(open: boolean): boolean {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;

    const timer = setTimeout(() => setPresent(false), SHEET_EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [open, present]);

  return open || present;
}
