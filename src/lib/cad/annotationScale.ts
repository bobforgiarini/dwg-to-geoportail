import type {
  CadAnnotationScale,
  CadAnnotationScaleSelection,
} from './preflightTypes';

export interface RawAnnotationObjectTypes {
  scale: number | undefined;
  contextDataManager: number | undefined;
  contextData: number[];
}

/** Minimal facade over the native API, kept mockable and out of Vite's main graph. */
export interface RawAnnotationLibreDwg {
  dwg_get_num_objects(data: number): number;
  dwg_get_object(data: number, index: number): number;
  dwg_object_get_fixedtype(object: number): number;
  dwg_object_get_supertype(object: number): number;
  dwg_object_to_object_tio(object: number): number;
  dwg_object_get_handle_object(object: number): { value?: number | bigint } | null;
  dwg_dynapi_entity_data<T>(tio: number, field: string): T;
  dwg_dynapi_header_data<T>(data: number, field: string): T;
  dwg_ref_get_id(ref: unknown): string | undefined;
}

type RuntimeDwgObjectType = Record<string, number | string>;

const CONTEXT_TYPE_NAMES = [
  'DWG_TYPE_ALDIMOBJECTCONTEXTDATA',
  'DWG_TYPE_ANGDIMOBJECTCONTEXTDATA',
  'DWG_TYPE_ANNOTSCALEOBJECTCONTEXTDATA',
  'DWG_TYPE_BLKREFOBJECTCONTEXTDATA',
  'DWG_TYPE_DMDIMOBJECTCONTEXTDATA',
  'DWG_TYPE_FCFOBJECTCONTEXTDATA',
  'DWG_TYPE_LEADEROBJECTCONTEXTDATA',
  'DWG_TYPE_MLEADEROBJECTCONTEXTDATA',
  'DWG_TYPE_MTEXTATTRIBUTEOBJECTCONTEXTDATA',
  'DWG_TYPE_MTEXTOBJECTCONTEXTDATA',
  'DWG_TYPE_ORDDIMOBJECTCONTEXTDATA',
  'DWG_TYPE_RADIMLGOBJECTCONTEXTDATA',
  'DWG_TYPE_RADIMOBJECTCONTEXTDATA',
  'DWG_TYPE_TEXTOBJECTCONTEXTDATA',
] as const;

function enumNumber(values: RuntimeDwgObjectType, name: string): number | undefined {
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function annotationObjectTypes(values: RuntimeDwgObjectType): RawAnnotationObjectTypes {
  return {
    scale: enumNumber(values, 'DWG_TYPE_SCALE'),
    contextDataManager: enumNumber(values, 'DWG_TYPE_CONTEXTDATAMANAGER'),
    contextData: CONTEXT_TYPE_NAMES.flatMap((name) => {
      const value = enumNumber(values, name);
      return value == null ? [] : [value];
    }),
  };
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function safeRead<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function refId(libredwg: RawAnnotationLibreDwg, value: unknown): string | null {
  if (value == null) return null;
  const id = safeRead(() => libredwg.dwg_ref_get_id(value));
  if (id) return id.toUpperCase();
  if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  return null;
}

function objectHandle(libredwg: RawAnnotationLibreDwg, object: number): string | null {
  const handle = safeRead(() => libredwg.dwg_object_get_handle_object(object));
  const value = handle?.value;
  if (typeof value === 'bigint') return value.toString(16).toUpperCase();
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value).toString(16).toUpperCase();
  return null;
}

interface NativeAnnotationObject {
  object: number;
  tio: number;
}

/**
 * The npm package does not expose LibreDWG's C convenience collector. Iterate
 * the object table through the same public bindings used by convertEx().
 */
function objectsByType(
  libredwg: RawAnnotationLibreDwg,
  data: number,
  type: number | undefined,
): NativeAnnotationObject[] {
  if (type == null) return [];
  const count = safeRead(() => libredwg.dwg_get_num_objects(data)) ?? 0;
  const objects: NativeAnnotationObject[] = [];
  for (let index = 0; index < count; index += 1) {
    const object = safeRead(() => libredwg.dwg_get_object(data, index));
    if (!object) continue;
    const fixedType = safeRead(() => libredwg.dwg_object_get_fixedtype(object));
    if (fixedType !== type) continue;
    // Annotation contexts and SCALE are object records (supertype 1). Calling
    // object_to_object_tio for an entity would otherwise be undefined behavior.
    if (safeRead(() => libredwg.dwg_object_get_supertype(object)) !== 1) continue;
    const tio = safeRead(() => libredwg.dwg_object_to_object_tio(object));
    if (tio) objects.push({ object, tio });
  }
  return objects;
}

function readFirst<T>(
  libredwg: RawAnnotationLibreDwg,
  tio: number,
  names: readonly string[],
): T | undefined {
  for (const name of names) {
    const value = safeRead(() => libredwg.dwg_dynapi_entity_data<T>(tio, name));
    if (value != null) return value;
  }
  return undefined;
}

function savedScaleId(libredwg: RawAnnotationLibreDwg, data: number): string | null {
  for (const name of ['CANNOSCALE', 'CANNOSCALEOBJECT', 'ANNOALLVISIBLE'] as const) {
    const ref = safeRead(() => libredwg.dwg_dynapi_header_data<unknown>(data, name));
    const id = refId(libredwg, ref);
    if (id) return id;
  }
  return null;
}

function defaultScaleIds(
  libredwg: RawAnnotationLibreDwg,
  data: number,
  type: number | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (type == null) return ids;
  const managers = objectsByType(libredwg, data, type);
  for (const { tio: manager } of managers) {
    for (const field of ['default_scale', 'current_scale', 'scale', 'default_context'] as const) {
      const ref = safeRead(() => libredwg.dwg_dynapi_entity_data<unknown>(manager, field));
      const id = refId(libredwg, ref);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function contextScaleMetadata(
  libredwg: RawAnnotationLibreDwg,
  data: number,
  types: readonly number[],
): {
  count: number;
  defaultIds: Set<string>;
  referencedIds: Set<string>;
  defaultReferenceCounts: Map<string, number>;
} {
  let count = 0;
  const defaultIds = new Set<string>();
  const referencedIds = new Set<string>();
  const defaultReferenceCounts = new Map<string, number>();
  for (const type of types) {
    const objects = objectsByType(libredwg, data, type);
    count += objects.length;
    for (const { tio: context } of objects) {
      const scale = safeRead(() => libredwg.dwg_dynapi_entity_data<unknown>(context, 'scale'));
      const id = refId(libredwg, scale);
      if (!id) continue;
      referencedIds.add(id);
      const isDefault = safeRead(() => libredwg.dwg_dynapi_entity_data<unknown>(context, 'is_default'));
      if (isDefault === true || isDefault === 1) {
        defaultIds.add(id);
        defaultReferenceCounts.set(id, (defaultReferenceCounts.get(id) ?? 0) + 1);
      }
    }
  }
  return { count, defaultIds, referencedIds, defaultReferenceCounts };
}

/**
 * Reads SCALE and annotation-context metadata before convertEx()/dwg_free().
 * It never infers ownership from XData alone and therefore deliberately leaves
 * ambiguous representations untouched.
 */
export function extractRawAnnotationScales(
  libredwg: RawAnnotationLibreDwg,
  data: number,
  types: RawAnnotationObjectTypes,
): CadAnnotationScaleSelection {
  const nativeSavedId = savedScaleId(libredwg, data);
  const defaultIds = defaultScaleIds(libredwg, data, types.contextDataManager);
  const contextMetadata = contextScaleMetadata(libredwg, data, types.contextData);
  contextMetadata.defaultIds.forEach((id) => defaultIds.add(id));
  const scaleType = types.scale;
  const rawScales = objectsByType(libredwg, data, scaleType);
  const byIdentity = new Map<string, CadAnnotationScale>();

  for (const { object, tio } of rawScales) {
    const paperUnits = finitePositive(readFirst<unknown>(libredwg, tio, ['paper_units', 'paperUnits']));
    const drawingUnits = finitePositive(readFirst<unknown>(libredwg, tio, ['drawing_units', 'drawingUnits']));
    if (paperUnits == null || drawingUnits == null) continue;
    const handle = objectHandle(libredwg, object);
    const rawName = readFirst<unknown>(libredwg, tio, ['name', 'scale_name']);
    const ratio = drawingUnits / paperUnits;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const name = typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : `1:${Number(ratio.toPrecision(12))}`;
    const identity = handle ?? `${name.toLocaleLowerCase('en-US')}:${ratio.toPrecision(12)}`;
    const rawDefault = readFirst<unknown>(libredwg, tio, ['is_unit_scale', 'is_default']);
    const isDefault = (handle != null && (handle === nativeSavedId || defaultIds.has(handle)))
      || rawDefault === true || rawDefault === 1;
    byIdentity.set(identity, {
      id: identity,
      name,
      paperUnits,
      drawingUnits,
      ratio,
      source: handle === nativeSavedId ? 'saved' : 'context',
      isDefault,
    });
  }

  const availableScales = [...byIdentity.values()].sort((left, right) => (
    Number(right.source === 'saved') - Number(left.source === 'saved')
    || Number(right.isDefault) - Number(left.isDefault)
    || left.ratio - right.ratio
    || left.name.localeCompare(right.name)
  ));
  const dominantContextScaleId = [...contextMetadata.defaultReferenceCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const saved = availableScales.find((scale) => scale.id === nativeSavedId)
    // Old DWGs often have no global CANNOSCALE. In that case prefer the scale
    // referenced by most object-default contexts instead of accidentally
    // choosing the smallest numerical ratio among several defaults.
    ?? availableScales.find((scale) => scale.id === dominantContextScaleId)
    ?? availableScales.find((scale) => scale.isDefault)
    ?? availableScales[0]
    ?? null;
  const contexts = contextMetadata.count;

  return {
    mode: 'saved',
    savedScaleId: saved?.id ?? null,
    selectedScaleId: saved?.id ?? null,
    availableScales,
    contextObjectCount: contexts,
    // Context ownership is not part of convertEx(). Do not prune unless a
    // future, fully validated owner map can prove the alternate relationship.
    failOpen: contexts > 0,
  };
}

export function selectAnnotationScale(
  selection: CadAnnotationScaleSelection,
  requestedScaleId: string | null | undefined,
): CadAnnotationScaleSelection {
  if (!requestedScaleId) {
    return { ...selection, mode: 'saved', selectedScaleId: selection.savedScaleId };
  }
  const selected = selection.availableScales.find((scale) => scale.id === requestedScaleId);
  if (!selected) return { ...selection, mode: 'saved', selectedScaleId: selection.savedScaleId, failOpen: true };
  return { ...selection, mode: 'manual', selectedScaleId: selected.id };
}
