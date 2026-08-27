import { describe, expect, it, vi } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import {
  extractDatabaseXrefs,
  normalizeDwgBaseName,
  resolveCadXrefBundleSequentially,
  type CadDwgSource,
  type DwgExternalReferenceDeclaration,
} from './xrefBundle';

function source(id: string, name = `${id}.dwg`): CadDwgSource {
  return {
    file: { id, name, size: 10, lastModified: 1 },
    data: new ArrayBuffer(4),
  };
}

function ref(name: string, kind: 'attachment' | 'overlay' = 'attachment'): DwgExternalReferenceDeclaration {
  return {
    id: name, name, normalizedName: normalizeDwgBaseName(name), sourcePath: null,
    kind, hasEmbeddedEntities: false,
  };
}

interface FakeModel {
  id: string;
  refs: DwgExternalReferenceDeclaration[];
  merged: string[];
}

describe('local XRef bundles', () => {
  it('normalizes Windows, Unix and dependent-record names', () => {
    expect(normalizeDwgBaseName('C:\\plans\\Road.DWG')).toBe('road');
    expect(normalizeDwgBaseName('../xrefs/Projet.dwg')).toBe('projet');
    expect(normalizeDwgBaseName('Road|Layer 1')).toBe('road');
  });

  it('extracts only loadable XRef root records and retains overlay semantics', () => {
    const model = {
      tables: { BLOCK_RECORD: { entries: [
        { handle: '1', name: 'Road', flags: 4, entities: [] },
        { handle: '2', name: 'Overlay', flags: 8, entities: [] },
        { handle: '3', name: 'Road|Layer', flags: 16, entities: [] },
      ] } },
    } as unknown as DwgDatabase;

    expect(extractDatabaseXrefs(model)).toEqual([
      expect.objectContaining({ name: 'Road', normalizedName: 'road', kind: 'attachment' }),
      expect.objectContaining({ name: 'Overlay', normalizedName: 'overlay', kind: 'overlay' }),
    ]);
  });

  it('parses attachments sequentially, stops overlay propagation and reports cycles', async () => {
    const root = source('root');
    const a = source('a');
    const overlay = source('overlay');
    const models: Record<string, FakeModel> = {
      root: { id: 'root', refs: [ref('a'), ref('overlay', 'overlay')], merged: [] },
      a: { id: 'a', refs: [ref('a')], merged: [] },
      overlay: { id: 'overlay', refs: [ref('a')], merged: [] },
    };
    let activeParsers = 0;
    let maxActiveParsers = 0;
    const parse = vi.fn(async (input: CadDwgSource) => {
      activeParsers += 1;
      maxActiveParsers = Math.max(maxActiveParsers, activeParsers);
      await Promise.resolve();
      activeParsers -= 1;
      return models[input.file.id];
    });

    const result = await resolveCadXrefBundleSequentially({
      root, xrefs: [a, overlay], parse,
      inspect: (model) => model.refs,
      merge: (parent, declaration, child) => ({
        ...parent, merged: [...parent.merged, `${declaration.name}:${child.id}`],
      }),
    });

    expect(maxActiveParsers).toBe(1);
    expect(parse.mock.calls.map(([input]) => input.file.id)).toEqual(['root', 'a', 'overlay']);
    expect(result.references).toEqual([
      expect.objectContaining({ name: 'a', status: 'resolved', resolvedFileId: 'a' }),
      expect.objectContaining({ name: 'a', status: 'cycle', resolvedFileId: 'a' }),
      expect.objectContaining({ name: 'overlay', status: 'resolved', resolvedFileId: 'overlay' }),
    ]);
    expect(result.root.model.merged).toEqual(['a:a', 'overlay:overlay']);
  });

  it('keeps duplicate basenames ambiguous unless an explicit candidate is selected', async () => {
    const root = source('root');
    const first = source('first', 'shared.dwg');
    const second = source('second', 'SHARED.DWG');
    const declaration = ref('shared');
    const model = (id: string): FakeModel => ({ id, refs: id === 'root' ? [declaration] : [], merged: [] });

    const ambiguous = await resolveCadXrefBundleSequentially({
      root, xrefs: [first, second], parse: async (input) => model(input.file.id),
      inspect: (value) => value.refs, merge: (parent) => parent,
    });
    expect(ambiguous.references[0]).toMatchObject({
      status: 'ambiguous', candidateFileIds: ['first', 'second'], resolvedFileId: null,
    });

    const referenceId = `root:${declaration.id}`;
    const resolved = await resolveCadXrefBundleSequentially({
      root, xrefs: [first, second], parse: async (input) => model(input.file.id),
      inspect: (value) => value.refs, merge: (parent) => parent,
      preferredFileIds: { [referenceId]: 'second' },
    });
    expect(resolved.references[0]).toMatchObject({ status: 'resolved', resolvedFileId: 'second' });
  });
});
