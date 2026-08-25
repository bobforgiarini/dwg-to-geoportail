export function isUnreadableFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return name === 'NotReadableError'
    || /requested file could not be read/i.test(message)
    || /cloud file provider/i.test(message);
}
