import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import { describe, expect, it } from 'vitest';
import {
  decodePackedWindows1252MLeaderText,
  normalizeLegacyMLeaderTextEncoding,
} from './mleaderTextEncoding';

const packedSurveyText = 'ㄭⰱ㜸⠭ⰹ〷 停乄';
const packedCp1252Text = '乄〸‰㈱㠬褳';
const packedTextWithBinaryFooter =
  '屻し㠮ⴻⰹ㜳‭停乄㔲倰⁐停㵬ㄹ㜬褸}ⴀν\u0001';

function entity(type: string, textContent: string): DwgEntity {
  return { type, textContent } as unknown as DwgEntity;
}

function database(
  modelEntities: DwgEntity[],
  blockEntities: DwgEntity[],
  header: Record<string, string> = {
    ACADVER: 'AC1015',
    DWGCODEPAGE: 'ANSI_1252',
  },
): DwgDatabase {
  return {
    header,
    entities: modelEntities,
    tables: {
      BLOCK_RECORD: { entries: [{ entities: blockEntities }] },
    },
  } as unknown as DwgDatabase;
}

function dwgSource(version: string): Uint8Array {
  return Uint8Array.from(version, (character) => character.charCodeAt(0));
}

describe('decodePackedWindows1252MLeaderText', () => {
  it('unpacks the observed old-DWG MText control sequence', () => {
    expect(decodePackedWindows1252MLeaderText(packedSurveyText)).toBe(
      '-11,87-(9,70) \\PDN',
    );
  });

  it('decodes Windows-1252 characters such as the per-mille sign', () => {
    expect(decodePackedWindows1252MLeaderText(packedCp1252Text)).toBe(
      'DN800 12,83‰',
    );
  });

  it('stops at a packed NUL before LibreDWG binary footer bytes', () => {
    expect(decodePackedWindows1252MLeaderText(packedTextWithBinaryFooter)).toBe(
      '{\\W0.8;-9,37- \\PDN250PP \\Pl=91,78‰}',
    );
  });

  it.each([
    'DN800 Sb',
    'Größe 12,83 ‰',
    '中文文本',
    '📍 LUREF 806218 / 8070461',
    '乄',
  ])('does not reinterpret valid or inconclusive text: %s', (text) => {
    expect(decodePackedWindows1252MLeaderText(text)).toBeUndefined();
  });
});

describe('normalizeLegacyMLeaderTextEncoding', () => {
  it('normalizes distinct model and block MLeaders without double-correcting references', () => {
    const sharedMLeader = entity('MULTILEADER', packedSurveyText);
    const blockMLeader = entity('MLEADER', packedCp1252Text);
    const normalMLeader = entity('MULTILEADER', 'Kanalbestand');
    const ordinaryMText = entity('MTEXT', packedSurveyText);
    const drawing = database(
      [sharedMLeader, normalMLeader, ordinaryMText],
      [sharedMLeader, blockMLeader],
    );

    expect(normalizeLegacyMLeaderTextEncoding(drawing)).toBe(2);
    expect((sharedMLeader as unknown as { textContent: string }).textContent).toBe(
      '-11,87-(9,70) \\PDN',
    );
    expect((blockMLeader as unknown as { textContent: string }).textContent).toBe(
      'DN800 12,83‰',
    );
    expect((normalMLeader as unknown as { textContent: string }).textContent).toBe(
      'Kanalbestand',
    );
    expect((ordinaryMText as unknown as { textContent: string }).textContent).toBe(
      packedSurveyText,
    );
  });

  it('uses a pre-Unicode source signature when LibreDWG omits header metadata', () => {
    const mleader = entity('MULTILEADER', packedTextWithBinaryFooter);
    const drawing = database([mleader], [], { ACADVER: '', DWGCODEPAGE: '' });

    expect(normalizeLegacyMLeaderTextEncoding(drawing, dwgSource('AC1015').buffer)).toBe(1);
    expect((mleader as unknown as { textContent: string }).textContent).toBe(
      '{\\W0.8;-9,37- \\PDN250PP \\Pl=91,78‰}',
    );
  });

  it('honors an explicitly incompatible codepage despite an old source signature', () => {
    const mleader = entity('MULTILEADER', packedSurveyText);
    const drawing = database([mleader], [], {
      ACADVER: '',
      DWGCODEPAGE: 'UTF-8',
    });

    expect(normalizeLegacyMLeaderTextEncoding(drawing, dwgSource('AC1015'))).toBe(0);
    expect((mleader as unknown as { textContent: string }).textContent).toBe(
      packedSurveyText,
    );
  });

  it.each([
    { ACADVER: 'AC1021', DWGCODEPAGE: 'ANSI_1252' },
    { ACADVER: 'AC1015', DWGCODEPAGE: 'UTF-8' },
    { ACADVER: '', DWGCODEPAGE: 'ANSI_1252' },
  ])('leaves non-legacy CP1252 drawings untouched: %o', (header) => {
    const mleader = entity('MULTILEADER', packedSurveyText);
    const drawing = database([mleader], [], header);

    expect(normalizeLegacyMLeaderTextEncoding(drawing)).toBe(0);
    expect((mleader as unknown as { textContent: string }).textContent).toBe(
      packedSurveyText,
    );
  });
});
