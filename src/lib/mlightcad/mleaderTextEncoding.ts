import type {
  DwgDatabase,
  DwgEntity,
  DwgMultiLeaderEntity,
} from '@mlightcad/libredwg-web';

const FIRST_UNICODE_DWG_VERSION = 1021;
const MINIMUM_PACKED_CODE_UNITS = 3;
const MINIMUM_PACKED_UNIT_RATIO = 0.75;
const MINIMUM_ASCII_BYTE_RATIO = 0.8;

const CP1252_SPECIAL_CHARACTERS: Readonly<Record<number, string>> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

const UNDEFINED_CP1252_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

type MLeaderEntity = DwgMultiLeaderEntity & { type: 'MULTILEADER' | 'MLEADER' };

type DwgSourceData = ArrayBuffer | Uint8Array;

function parseDwgVersion(value: string | undefined): number | undefined {
  const match = /^AC(\d+)$/i.exec(value?.trim() ?? '');
  if (!match) return undefined;

  const version = Number.parseInt(match[1], 10);
  return Number.isFinite(version) ? version : undefined;
}

function readSourceDwgVersion(sourceData: DwgSourceData | undefined): number | undefined {
  if (!sourceData) return undefined;

  const bytes =
    sourceData instanceof Uint8Array ? sourceData : new Uint8Array(sourceData);
  if (bytes.byteLength < 6) return undefined;

  let signature = '';
  for (let index = 0; index < 6; index += 1) {
    signature += String.fromCharCode(bytes[index]);
  }
  return parseDwgVersion(signature);
}

function isLegacyWindows1252Drawing(
  database: DwgDatabase,
  sourceData: DwgSourceData | undefined,
): boolean {
  const sourceVersion = readSourceDwgVersion(sourceData);
  const version = sourceVersion ?? parseDwgVersion(database.header.ACADVER);
  const codePage = database.header.DWGCODEPAGE?.trim().toUpperCase() ?? '';

  if (version == null || version >= FIRST_UNICODE_DWG_VERSION) return false;

  if (codePage.length > 0) {
    return /(?:^|[_-])(?:ANSI|CP|WINDOWS)?[_-]?1252$/.test(codePage);
  }

  // Some LibreDWG conversions omit both header fields. Only permit a CP1252
  // fallback when the original bytes independently prove a pre-Unicode DWG;
  // the per-string packing heuristic remains the final corruption guard.
  return sourceVersion != null && sourceVersion < FIRST_UNICODE_DWG_VERSION;
}

function isAllowedTextByte(byte: number): boolean {
  if (UNDEFINED_CP1252_BYTES.has(byte) || byte === 0x7f) {
    return false;
  }

  return byte >= 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function isAsciiTextByte(byte: number): boolean {
  return (byte >= 0x20 && byte <= 0x7e) || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function decodeWindows1252Byte(byte: number): string {
  if (byte < 0x80 || byte >= 0xa0) return String.fromCharCode(byte);
  return CP1252_SPECIAL_CHARACTERS[byte];
}

/**
 * Repairs the little-endian byte-pair packing produced by LibreDWG for some
 * pre-Unicode MULTILEADER strings. A value is returned only when the source
 * has strong evidence of packing; ordinary Unicode and already decoded text
 * are deliberately left alone.
 */
export function decodePackedWindows1252MLeaderText(text: string): string | undefined {
  if (text.length < MINIMUM_PACKED_CODE_UNITS) return undefined;

  const bytes: number[] = [];
  let packedCodeUnits = 0;
  let inspectedCodeUnits = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) return undefined;
    inspectedCodeUnits += 1;

    const lowByte = codeUnit & 0xff;
    const highByte = codeUnit >>> 8;

    // LibreDWG can expose the terminating NUL packed together with the first
    // byte of an internal binary footer. Only the bytes before NUL are text.
    if (lowByte === 0) break;
    if (!isAllowedTextByte(lowByte)) return undefined;
    bytes.push(lowByte);

    if (highByte === 0) {
      // The final odd text byte is stored in the low half of a code unit; its
      // zero high half is the same terminator and must not remove that byte.
      break;
    }

    if (!isAllowedTextByte(highByte)) return undefined;
    bytes.push(highByte);
    packedCodeUnits += 1;
  }

  if (
    packedCodeUnits < MINIMUM_PACKED_CODE_UNITS ||
    packedCodeUnits / inspectedCodeUnits < MINIMUM_PACKED_UNIT_RATIO
  ) {
    return undefined;
  }

  const asciiByteCount = bytes.filter(isAsciiTextByte).length;
  if (asciiByteCount / bytes.length < MINIMUM_ASCII_BYTE_RATIO) return undefined;

  const decoded = bytes.map(decodeWindows1252Byte).join('');
  return /[\p{L}\p{N}]/u.test(decoded) ? decoded : undefined;
}

function isMLeader(entity: DwgEntity): entity is MLeaderEntity {
  return entity.type === 'MULTILEADER' || (entity.type as string) === 'MLEADER';
}

/**
 * Normalizes affected MLeader text in both model-space and block records.
 * Returns the number of distinct entities changed.
 */
export function normalizeLegacyMLeaderTextEncoding(
  database: DwgDatabase,
  sourceData?: DwgSourceData,
): number {
  if (!isLegacyWindows1252Drawing(database, sourceData)) return 0;

  const visited = new Set<DwgEntity>();
  let changedCount = 0;

  const visit = (entities: DwgEntity[]) => {
    for (const entity of entities) {
      if (visited.has(entity)) continue;
      visited.add(entity);

      if (!isMLeader(entity) || typeof entity.textContent !== 'string') continue;

      const decoded = decodePackedWindows1252MLeaderText(entity.textContent);
      if (!decoded || decoded === entity.textContent) continue;

      entity.textContent = decoded;
      changedCount += 1;
    }
  };

  visit(database.entities ?? []);
  for (const blockRecord of database.tables.BLOCK_RECORD.entries ?? []) {
    visit(blockRecord.entities ?? []);
  }

  return changedCount;
}
