import { describe, expect, it } from 'vitest';
import { isUnreadableFileError } from './fileAccessError';

describe('isUnreadableFileError', () => {
  it('recognises browser file-permission failures', () => {
    expect(isUnreadableFileError(new DOMException('The requested file could not be read', 'NotReadableError'))).toBe(true);
  });

  it('does not classify parser errors as file-access failures', () => {
    expect(isUnreadableFileError(new Error('Unsupported DWG version'))).toBe(false);
  });
});
