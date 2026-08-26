function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

/** Stable cross-viewer identity based on the DWG handle and recursive block path. */
export function createCadObjectKey(objectId: string, blockPath: string[]): string {
  const path = blockPath.map(normalize).filter(Boolean).join('>');
  return `${path}::${normalize(objectId)}`;
}

export function cadObjectIdFromKey(key: string): string {
  const separator = key.lastIndexOf('::');
  return separator >= 0 ? key.slice(separator + 2) : key;
}
