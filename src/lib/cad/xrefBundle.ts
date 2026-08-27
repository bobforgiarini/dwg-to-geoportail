import type { DwgBlockRecordTableEntry, DwgDatabase } from '@mlightcad/libredwg-web';
import type {
  CadFileDescriptor,
  DwgExternalReference,
  DwgExternalReferenceKind,
} from './preflightTypes';

export interface CadDwgSource {
  file: CadFileDescriptor;
  data: ArrayBuffer;
}

export interface DwgExternalReferenceDeclaration {
  id: string;
  name: string;
  normalizedName: string;
  sourcePath: string | null;
  kind: DwgExternalReferenceKind;
  hasEmbeddedEntities: boolean;
}

export interface ResolvedCadDwg<T> {
  file: CadFileDescriptor;
  model: T;
}

export interface CadXrefResolution<T> {
  root: ResolvedCadDwg<T>;
  parsedFiles: ResolvedCadDwg<T>[];
  references: DwgExternalReference[];
}

export interface ResolveCadXrefBundleOptions<T> {
  root: CadDwgSource;
  xrefs: CadDwgSource[];
  parse(source: CadDwgSource): Promise<T>;
  inspect(model: T): DwgExternalReferenceDeclaration[];
  /** Merge a resolved child into the exact reference block of its parent. */
  merge(parent: T, declaration: DwgExternalReferenceDeclaration, child: T): T;
  preferredFileIds?: Readonly<Record<string, string>>;
}

function normalizedPathTail(value: string): string {
  const slashes = value.trim().replaceAll('\\', '/');
  return slashes.slice(slashes.lastIndexOf('/') + 1);
}

export function normalizeDwgBaseName(value: string): string {
  const tail = normalizedPathTail(value);
  const withoutExtension = tail.replace(/\.dwg$/i, '');
  // Dependent XRef table records commonly use `xrefName|recordName`.
  const rootName = withoutExtension.split('|', 1)[0];
  return rootName.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function cadFileDescriptor(
  file: Pick<File, 'name' | 'size' | 'lastModified'>,
  id?: string,
): CadFileDescriptor {
  const normalized = normalizeDwgBaseName(file.name) || 'dwg';
  return {
    id: id ?? `${normalized}:${file.size}:${file.lastModified}`,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
}

function sourcePath(block: DwgBlockRecordTableEntry): string | null {
  const raw = block as DwgBlockRecordTableEntry & Record<string, unknown>;
  for (const field of ['xrefPath', 'xrefPathName', 'pathName', 'fileName', 'xref_pname'] as const) {
    const value = raw[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function extractDatabaseXrefs(model: DwgDatabase): DwgExternalReferenceDeclaration[] {
  return model.tables.BLOCK_RECORD.entries.flatMap((block, index) => {
    // Bit 16 alone marks an externally dependent record (for example a layer
    // inside an XRef), not a loadable root reference.
    if (!(block.flags & (4 | 8))) return [];
    const path = sourcePath(block);
    const normalizedName = normalizeDwgBaseName(path || block.name);
    if (!normalizedName) return [];
    return [{
      id: `${block.handle || index}:${normalizedName}`,
      name: block.name,
      normalizedName,
      sourcePath: path,
      kind: block.flags & 8 ? 'overlay' : 'attachment',
      hasEmbeddedEntities: block.entities.length > 0,
    } satisfies DwgExternalReferenceDeclaration];
  });
}

interface MatchResult {
  status: DwgExternalReference['status'];
  resolved: CadDwgSource | null;
  candidates: CadDwgSource[];
}

function matchDeclaration(
  declaration: DwgExternalReferenceDeclaration,
  available: readonly CadDwgSource[],
  preferredFileId?: string,
): MatchResult {
  if (declaration.hasEmbeddedEntities) return { status: 'resolved', resolved: null, candidates: [] };
  const candidates = available.filter((source) => (
    normalizeDwgBaseName(source.file.name) === declaration.normalizedName
  ));
  if (preferredFileId) {
    const preferred = candidates.find((source) => source.file.id === preferredFileId);
    if (preferred) return { status: 'resolved', resolved: preferred, candidates };
  }
  if (candidates.length === 1) return { status: 'resolved', resolved: candidates[0], candidates };
  if (candidates.length > 1) return { status: 'ambiguous', resolved: null, candidates };
  return { status: 'missing', resolved: null, candidates };
}

function referenceResult(
  declaration: DwgExternalReferenceDeclaration,
  parentFileId: string,
  match: MatchResult,
  depth: number,
  path: string[],
): DwgExternalReference {
  return {
    id: `${parentFileId}:${declaration.id}`,
    name: declaration.name,
    normalizedName: declaration.normalizedName,
    sourcePath: declaration.sourcePath,
    kind: declaration.kind,
    status: match.status,
    parentFileId,
    resolvedFileId: match.resolved?.file.id ?? null,
    candidateFileIds: match.candidates.map((candidate) => candidate.file.id),
    candidateFiles: match.candidates.map((candidate) => ({ ...candidate.file })),
    depth,
    path,
  };
}

/**
 * Resolves local XRefs strictly sequentially. Attachments recurse, overlays do
 * not propagate their own references. Each merge is immutable from the
 * resolver's perspective and cycles are reported without throwing.
 */
export async function resolveCadXrefBundleSequentially<T>(
  options: ResolveCadXrefBundleOptions<T>,
): Promise<CadXrefResolution<T>> {
  const references: DwgExternalReference[] = [];
  const parsedFiles: ResolvedCadDwg<T>[] = [];
  const parsedByFile = new Map<string, T>();

  const parseOnce = async (source: CadDwgSource): Promise<T> => {
    const cached = parsedByFile.get(source.file.id);
    if (cached) return cached;
    const model = await options.parse(source);
    parsedByFile.set(source.file.id, model);
    parsedFiles.push({ file: source.file, model });
    return model;
  };

  const resolveSource = async (
    source: CadDwgSource,
    ancestry: string[],
    followNested: boolean,
    initialModel?: T,
  ): Promise<T> => {
    let model: T = initialModel ?? await parseOnce(source);
    if (initialModel && !parsedByFile.has(source.file.id)) {
      parsedByFile.set(source.file.id, initialModel);
      parsedFiles.push({ file: source.file, model: initialModel });
    }
    if (!followNested && ancestry.length > 1) return model;
    const declarations = options.inspect(model);
    for (const declaration of declarations) {
      const referenceId = `${source.file.id}:${declaration.id}`;
      const match = matchDeclaration(
        declaration,
        options.xrefs,
        options.preferredFileIds?.[referenceId],
      );
      const referencePath = [...ancestry, declaration.name];
      const result = referenceResult(
        declaration,
        source.file.id,
        match,
        ancestry.length - 1,
        referencePath,
      );
      references.push(result);

      if (!match.resolved) continue;
      if (ancestry.includes(match.resolved.file.id)) {
        result.status = 'cycle';
        result.path = [...referencePath, match.resolved.file.name];
        continue;
      }

      try {
        const childBase = await parseOnce(match.resolved);
        const child = await resolveSource(
          match.resolved,
          [...ancestry, match.resolved.file.id],
          declaration.kind === 'attachment',
          childBase,
        );
        model = options.merge(model, declaration, child);
      } catch {
        result.status = 'invalid';
      }
    }
    return model;
  };

  const rootBase = await parseOnce(options.root);
  const rootModel = await resolveSource(options.root, [options.root.file.id], true, rootBase);
  return {
    root: { file: options.root.file, model: rootModel },
    parsedFiles,
    references,
  };
}
