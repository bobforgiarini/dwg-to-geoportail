import { describe, expect, it } from 'vitest';
import { cadObjectIdFromKey, createCadObjectKey } from './objectKey';

describe('stable CAD object keys', () => {
  it('normalizes handles and recursive block paths across viewers', () => {
    expect(createCadObjectKey(' 0A2F ', [' Haus ', ' TÜR '])).toBe('haus>tür::0a2f');
  });

  it('keeps direct model-space objects stable', () => {
    expect(createCadObjectKey('42', [])).toBe('::42');
    expect(cadObjectIdFromKey('::42')).toBe('42');
  });

  it('extracts an object id from nested and legacy keys', () => {
    expect(cadObjectIdFromKey('outer>inner::ab12')).toBe('ab12');
    expect(cadObjectIdFromKey('unscoped-id')).toBe('unscoped-id');
  });
});
