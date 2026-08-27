import type {
  DwgBlockRecordTableEntry,
  DwgDatabase,
  DwgEntity,
  DwgInsertEntity,
} from '@mlightcad/libredwg-web';
import type { DwgExternalReferenceDeclaration } from '../cad/xrefBundle';
import { normalizeDwgBaseName } from '../cad/xrefBundle';

const MODEL_SPACE_NAMES = new Set(['*model_space', '*model space']);
const PAPER_SPACE_PREFIXES = ['*paper_space', '*paper space'];
const UNQUALIFIED_NAMES = new Set(['BYLAYER', 'BYBLOCK']);
const PROTECTED_STRING_KEYS = new Set([
  'text', 'textContent', 'description', 'font', 'bigFont', 'fileName', 'sourcePath',
]);

function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function isModelSpace(name: string): boolean {
  return MODEL_SPACE_NAMES.has(canonical(name));
}

function isPaperSpace(name: string): boolean {
  const value = canonical(name);
  return PAPER_SPACE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function namespaceLabel(declaration: DwgExternalReferenceDeclaration): string {
  const source = declaration.sourcePath || declaration.name;
  const tail = source.trim().replaceAll('\\', '/').split('/').at(-1) ?? source;
  const root = tail.replace(/\.dwg$/i, '').split('|', 1)[0].trim();
  return root || declaration.normalizedName || 'XREF';
}

function qualified(namespace: string, value: string): string {
  if (!value || UNQUALIFIED_NAMES.has(value.toUpperCase())) return value;
  return `${namespace}|${value}`;
}

function collectHandles(value: unknown, handles: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectHandles(item, handles));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'handle' && typeof child === 'string' && child) handles.add(child);
    collectHandles(child, handles);
  }
}

function rewriteHandles(value: unknown, handles: ReadonlyMap<string, string>, key = ''): unknown {
  if (typeof value === 'string') {
    if (PROTECTED_STRING_KEYS.has(key)) return value;
    return handles.get(value) ?? value;
  }
  if (!value || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) return value.map((item) => rewriteHandles(item, handles, key));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([childKey, child]) => [childKey, rewriteHandles(child, handles, childKey)]));
}

function namespaceEntity(
  source: DwgEntity,
  namespace: string,
  handles: ReadonlyMap<string, string>,
): DwgEntity {
  const entity = rewriteHandles(source, handles) as DwgEntity & Record<string, unknown>;
  entity.layer = qualified(namespace, source.layer || '0');
  if (source.lineType) entity.lineType = qualified(namespace, source.lineType);

  const sourceRecord = source as DwgEntity & Record<string, unknown>;
  if (typeof sourceRecord.styleName === 'string') {
    entity.styleName = qualified(namespace, sourceRecord.styleName);
  }
  if (typeof sourceRecord.dimensionStyleName === 'string') {
    entity.dimensionStyleName = qualified(namespace, sourceRecord.dimensionStyleName);
  }
  if (source.type.toUpperCase() === 'DIMENSION' && typeof sourceRecord.name === 'string') {
    entity.name = qualified(namespace, sourceRecord.name);
  }
  if (source.type.toUpperCase() === 'INSERT') {
    const insert = entity as unknown as DwgInsertEntity;
    insert.name = qualified(namespace, (source as DwgInsertEntity).name);
    insert.attribs = (source as DwgInsertEntity).attribs.map((attribute) => (
      namespaceEntity(attribute, namespace, handles)
    )) as DwgInsertEntity['attribs'];
  }
  return entity;
}

function tableEntryName(entry: unknown): string | null {
  const value = (entry as { name?: unknown } | null)?.name;
  return typeof value === 'string' ? value : null;
}

function namespaceTableEntry<T>(
  entry: T,
  namespace: string,
  handles: ReadonlyMap<string, string>,
): T {
  const cloned = rewriteHandles(entry, handles) as T & { name?: string };
  const name = tableEntryName(entry);
  if (name != null) cloned.name = qualified(namespace, name);
  return cloned;
}

function appendUniqueEntries<T>(target: T[], additions: T[]): T[] {
  const identities = new Set(target.map((entry) => {
    const record = entry as { name?: string; handle?: string };
    return canonical(record.name) || `#${record.handle ?? ''}`;
  }));
  const result = [...target];
  for (const addition of additions) {
    const record = addition as { name?: string; handle?: string };
    const identity = canonical(record.name) || `#${record.handle ?? ''}`;
    if (identities.has(identity)) continue;
    identities.add(identity);
    result.push(addition);
  }
  return result;
}

function findReferenceBlock(
  entries: DwgBlockRecordTableEntry[],
  declaration: DwgExternalReferenceDeclaration,
): number {
  const authoredHandle = declaration.id.split(':', 1)[0];
  const byHandle = entries.findIndex((entry) => entry.handle === authoredHandle && Boolean(entry.flags & (4 | 8)));
  if (byHandle >= 0) return byHandle;
  return entries.findIndex((entry) => (
    Boolean(entry.flags & (4 | 8))
    && normalizeDwgBaseName(entry.name) === declaration.normalizedName
  ));
}

/**
 * Resolves one local XRef at application level. MLightCAD has no native XRef
 * loader, so the child model space becomes the referenced root block while all
 * dependent tables and block definitions receive an AutoCAD-like `XRef|…`
 * namespace. Inputs and geometry buffers are never mutated.
 */
export function mergeMlightXrefDatabase(
  parent: DwgDatabase,
  declaration: DwgExternalReferenceDeclaration,
  child: DwgDatabase,
): DwgDatabase {
  const targetIndex = findReferenceBlock(parent.tables.BLOCK_RECORD.entries, declaration);
  if (targetIndex < 0) throw new Error(`MLIGHTCAD_XREF_BLOCK_NOT_FOUND:${declaration.name}`);

  const namespace = namespaceLabel(declaration);
  const sourceHandles = new Set<string>();
  collectHandles(child, sourceHandles);
  const handles = new Map([...sourceHandles].map((handle) => [handle, `${namespace}:${handle}`]));
  const sourceModelSpace = child.tables.BLOCK_RECORD.entries.find((entry) => isModelSpace(entry.name));
  const sourceEntities = sourceModelSpace?.entities.length ? sourceModelSpace.entities : child.entities;
  const targetBlock = parent.tables.BLOCK_RECORD.entries[targetIndex];
  const targetEntities = sourceEntities.map((entity) => {
    const prepared = namespaceEntity(entity, namespace, handles) as DwgEntity & Record<string, unknown>;
    prepared.ownerBlockRecordSoftId = targetBlock.handle;
    return prepared;
  });

  const dependentBlocks = child.tables.BLOCK_RECORD.entries
    .filter((entry) => !isModelSpace(entry.name) && !isPaperSpace(entry.name))
    .map((entry) => ({
      ...namespaceTableEntry(entry, namespace, handles),
      entities: entry.entities.map((entity) => namespaceEntity(entity, namespace, handles)),
    }));
  const parentBlocks = parent.tables.BLOCK_RECORD.entries.map((entry, index) => (
    index === targetIndex ? { ...entry, entities: targetEntities } : entry
  ));

  const nextTables = { ...parent.tables } as DwgDatabase['tables'] & Record<string, { entries: unknown[] }>;
  const childTables = child.tables as DwgDatabase['tables'] & Record<string, { entries: unknown[] }>;
  for (const [tableName, targetTable] of Object.entries(nextTables)) {
    if (tableName === 'BLOCK_RECORD') continue;
    const childTable = childTables[tableName];
    if (!childTable) continue;
    nextTables[tableName] = {
      ...targetTable,
      entries: appendUniqueEntries(
        targetTable.entries,
        childTable.entries.map((entry) => namespaceTableEntry(entry, namespace, handles)),
      ),
    };
  }
  nextTables.BLOCK_RECORD = {
    ...parent.tables.BLOCK_RECORD,
    entries: appendUniqueEntries(parentBlocks, dependentBlocks),
  };

  const nextObjects = { ...parent.objects } as DwgDatabase['objects'] & Record<string, unknown[]>;
  const childObjects = child.objects as DwgDatabase['objects'] & Record<string, unknown[]>;
  for (const [kind, targetObjects] of Object.entries(nextObjects)) {
    const additions = childObjects[kind];
    if (!additions?.length) continue;
    nextObjects[kind] = [
      ...targetObjects,
      ...additions.map((object) => rewriteHandles(object, handles)),
    ];
  }

  const classKeys = new Set(parent.classes.map((entry) => JSON.stringify(entry)));
  const classes = [...parent.classes];
  for (const entry of child.classes) {
    const key = JSON.stringify(entry);
    if (!classKeys.has(key)) {
      classKeys.add(key);
      classes.push(entry);
    }
  }

  return {
    ...parent,
    tables: nextTables,
    objects: nextObjects,
    classes,
  };
}
