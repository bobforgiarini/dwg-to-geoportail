import type { CadBlock, CadDocument, CadEntity, CadEntityKind, CadLayer } from '../cad/cadDocumentTypes';
import type {
  DwgBlockRecordTableEntry,
  DwgDatabase,
  DwgEntity,
  DwgInsertEntity,
  DwgLayerTableEntry,
} from '@mlightcad/libredwg-web';
import { analyzeCadDocument } from '../cad/cadPreflight';
import { filterCadDocument } from '../cad/filterCadDocument';
import type {
  CadLoadProfile,
  DwgPreflightOptions,
  DwgPreflightReport,
} from '../cad/preflightTypes';

export interface MlightDwgFilterResult {
  model: DwgDatabase;
  removedEntityCount: number;
  removedBlockNames: string[];
  remainingBlockNames: string[];
}

const MODEL_SPACE_NAMES = new Set(['*model_space', '*model space']);

function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function isModelSpaceRecord(name: string): boolean {
  return MODEL_SPACE_NAMES.has(canonical(name));
}

function isPaperSpaceRecord(name: string): boolean {
  const normalized = canonical(name).replaceAll(' ', '_');
  return normalized.startsWith('*paper_space');
}

function modelSpaceEntities(model: DwgDatabase): DwgEntity[] {
  const record = model.tables.BLOCK_RECORD.entries.find((block) => isModelSpaceRecord(block.name));
  return record?.entities.length ? record.entities : model.entities;
}

function entityKind(type: string): CadEntityKind {
  const normalized = type.trim().toUpperCase();
  if (normalized === 'LINE' || normalized === 'XLINE' || normalized === 'RAY' || normalized === 'LEADER' || normalized === 'MLEADER' || normalized === 'MULTILEADER') return 'line';
  if (normalized === 'CIRCLE') return 'circle';
  if (normalized === 'ARC') return 'arc';
  if (normalized === 'LWPOLYLINE' || normalized === 'POLYLINE' || normalized === 'MLINE') return 'polyline';
  if (normalized === 'ELLIPSE') return 'ellipse';
  if (normalized === 'TEXT' || normalized === 'MTEXT' || normalized === 'ATTRIB' || normalized === 'ATTDEF') return 'text';
  if (normalized === 'POINT') return 'point';
  if (normalized === 'INSERT' || normalized === 'MINSERT') return 'insert';
  if (normalized === 'SOLID' || normalized === 'TRACE' || normalized === '3DFACE') return 'solid';
  if (normalized === 'HATCH') return 'hatch';
  if (normalized === 'SPLINE') return 'spline';
  if (normalized === 'IMAGE' || normalized === 'WIPEOUT' || normalized.includes('UNDERLAY')) return 'image';
  if (normalized === 'VIEWPORT') return 'viewport';
  if (normalized === 'TABLE' || normalized === 'ACAD_TABLE') return 'table';
  return 'unsupported';
}

function isInsert(entity: DwgEntity): entity is DwgInsertEntity {
  return entity.type.toUpperCase() === 'INSERT';
}

function toCadEntity(entity: DwgEntity): CadEntity {
  const source = entity as DwgEntity & Record<string, unknown>;
  const insert = isInsert(entity) ? entity : undefined;
  return {
    type: entity.type,
    id: entity.handle,
    handle: entity.handle,
    kind: entityKind(entity.type),
    layer: entity.layer,
    isVisible: source.isVisible as boolean | undefined,
    isInPaperSpace: entity.isInPaperSpace,
    thickness: source.thickness as number | undefined,
    startPoint: source.startPoint as CadEntity['startPoint'],
    endPoint: source.endPoint as CadEntity['endPoint'],
    center: source.center as CadEntity['center'],
    insertionPoint: source.insertionPoint as CadEntity['insertionPoint'],
    vertices: source.vertices as CadEntity['vertices'],
    points: source.points as CadEntity['points'],
    controlPoints: source.controlPoints as CadEntity['controlPoints'],
    fitPoints: source.fitPoints as CadEntity['fitPoints'],
    loops: source.loops as CadEntity['loops'],
    blockName: insert?.name,
    insertRowCount: insert?.rowCount,
    insertColumnCount: insert?.columnCount,
    insertRowSpacing: insert?.rowSpacing,
    insertColumnSpacing: insert?.columnSpacing,
    rotation: insert?.rotation,
    scale: insert ? { x: insert.xScale, y: insert.yScale, z: insert.zScale } : undefined,
    attribs: insert?.attribs?.map(toCadEntity),
    // The adapter document is short-lived and never structured-cloned. Keeping
    // the source object here lets the filtered view be projected back without
    // duplicating the heavy geometry payload.
    raw: entity,
  } as unknown as CadEntity;
}

function fromCadEntity(entity: CadEntity): DwgEntity {
  const source = entity.raw as DwgEntity | undefined;
  if (!source) throw new Error('MLIGHTCAD_FILTER_SOURCE_MISSING');
  if (!isInsert(source) || !entity.attribs) return source;
  const attribs = entity.attribs.map(fromCadEntity) as DwgInsertEntity['attribs'];
  return attribs.length === source.attribs.length
    && attribs.every((attribute, index) => attribute === source.attribs[index])
    ? source
    : { ...source, attribs } as DwgInsertEntity;
}

function toCadLayer(layer: DwgLayerTableEntry): CadLayer {
  return {
    name: layer.name,
    color: layer.color,
    colorIndex: layer.colorIndex,
    lineType: layer.lineType,
    lineweight: layer.lineweight,
    isVisible: !layer.off,
    isFrozen: layer.frozen,
    isLocked: layer.locked,
    raw: {
      plot: layer.plotFlag,
      noPlot: layer.plotFlag === 0,
    },
  };
}

function toCadBlock(block: DwgBlockRecordTableEntry): CadBlock {
  return {
    name: block.name,
    basePoint: block.basePoint,
    entities: block.entities.map(toCadEntity),
    raw: {
      flags: block.flags,
      isXref: Boolean(block.flags & 4),
      isOverlay: Boolean(block.flags & 8),
      isExternalReference: Boolean(block.flags & (4 | 8 | 16)),
    },
  };
}

/**
 * Creates the normalized, lightweight view used by the shared preflight core.
 * Geometry arrays remain shared with LibreDWG's result; only maps and aliases
 * needed for block/layer reasoning are allocated.
 */
export function adaptMlightDwgDatabase(model: DwgDatabase, sourceName?: string): CadDocument {
  const blocks: Record<string, CadBlock> = {};
  const pages: NonNullable<CadDocument['pages']> = [];
  for (const block of model.tables.BLOCK_RECORD.entries) {
    if (isModelSpaceRecord(block.name)) continue;
    if (isPaperSpaceRecord(block.name)) {
      pages.push({
        index: pages.length,
        name: block.name,
        width: 0,
        height: 0,
        entities: block.entities.map(toCadEntity),
      });
      continue;
    }
    blocks[block.name] = toCadBlock(block);
  }

  const layers: Record<string, CadLayer> = {};
  for (const layer of model.tables.LAYER.entries) layers[layer.name] = toCadLayer(layer);

  return {
    format: 'dwg',
    sourceName,
    header: model.header as Record<string, unknown>,
    layers,
    blocks,
    entities: modelSpaceEntities(model).map(toCadEntity),
    pages: pages.length ? pages : undefined,
    metadata: { dwgVersion: model.header.ACADVER ?? null },
    warnings: [],
  };
}

export function analyzeMlightDwgDatabase(
  model: DwgDatabase,
  options: DwgPreflightOptions = {},
): DwgPreflightReport {
  const document = adaptMlightDwgDatabase(model, options.file?.name);
  return analyzeCadDocument(document, options);
}

/**
 * Projects the shared CadLoadProfile back onto LibreDWG's raw model before
 * MLightCAD creates its AcDb database and Three.js scene. The input model is
 * never mutated, but the returned model reuses every retained geometry object.
 */
export function filterMlightDwgDatabase(
  model: DwgDatabase,
  profile: CadLoadProfile,
): MlightDwgFilterResult {
  const document = adaptMlightDwgDatabase(model);
  // Both renderers are intentionally model-space-only. Even the user's
  // "full" decision therefore means every supported model-space entity, not
  // paper layouts that MLightCAD would otherwise carry into AcDb/Three.js.
  const effectiveProfile: CadLoadProfile = {
    ...profile,
    mode: 'filtered',
    hiddenEntityCategories: profile.hiddenEntityCategories.includes('paper-space')
      ? profile.hiddenEntityCategories
      : [...profile.hiddenEntityCategories, 'paper-space'],
  };
  const filtered = filterCadDocument(document, effectiveProfile);
  const remaining = new Set(filtered.remainingBlockNames.map(canonical));
  const blocksByName = new Map(Object.entries(filtered.document.blocks).map(([key, block]) => [canonical(key), block]));

  const modelEntities = filtered.document.entities.map(fromCadEntity);
  const blockEntries = model.tables.BLOCK_RECORD.entries.flatMap((block) => {
    if (isModelSpaceRecord(block.name)) {
      return block.entities.length === modelEntities.length
        && modelEntities.every((entity, index) => entity === block.entities[index])
        ? [block]
        : [{ ...block, entities: modelEntities }];
    }
    if (isPaperSpaceRecord(block.name)) {
      return [{ ...block, entities: [] }];
    }
    if (!remaining.has(canonical(block.name))) return [];
    const filteredBlock = blocksByName.get(canonical(block.name));
    if (!filteredBlock) return [];
    const entities = filteredBlock.entities.map(fromCadEntity);
    return entities.length === block.entities.length
      && entities.every((entity, index) => entity === block.entities[index])
      ? [block]
      : [{ ...block, entities }];
  });

  const hideImages = profile.hiddenEntityCategories.includes('image');
  const prepared: DwgDatabase = {
    ...model,
    entities: modelEntities,
    tables: {
      ...model.tables,
      BLOCK_RECORD: { ...model.tables.BLOCK_RECORD, entries: blockEntries },
    },
    objects: hideImages
      ? { ...model.objects, IMAGEDEF: [] }
      : model.objects,
  };

  return {
    model: prepared,
    removedEntityCount: filtered.removedEntityCount,
    removedBlockNames: filtered.removedBlockNames,
    remainingBlockNames: filtered.remainingBlockNames,
  };
}
