import type { CadBlock, CadDocument, CadEntity } from '@flyfish-dev/cad-viewer';
import { cadEntityCategories, isCadXrefBlock } from './cadPreflight';
import type { CadDocumentFilterResult, CadEntityCategory, CadLoadProfile, DwgPreflightWarning } from './preflightTypes';

interface BlockEntry {
  key: string;
  name: string;
  block: CadBlock;
}
function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function entityKind(entity: CadEntity): string {
  return String(entity.kind || entity.type || '').trim().toLowerCase();
}

function createBlockResolver(blocks: CadDocument['blocks']) {
  const aliases = new Map<string, BlockEntry>();
  for (const [key, block] of Object.entries(blocks)) {
    const entry = { key, name: block.name || key, block };
    for (const alias of [key, entry.name]) {
      const normalized = canonical(alias);
      if (normalized && !aliases.has(normalized)) aliases.set(normalized, entry);
    }
  }
  return (entity: CadEntity): BlockEntry | undefined => {
    for (const candidate of [entity.blockName, entity.name]) {
      const entry = aliases.get(canonical(candidate));
      if (entry) return entry;
    }
    return undefined;
  };
}

function deduplicateWarnings(warnings: DwgPreflightWarning[]): DwgPreflightWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${canonical(warning.blockName)}:${warning.path?.map(canonical).join('>') ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Creates a filtered CAD-document view without mutating the parser result.
 * Layer 0 inside block definitions stays in the definition because its effective
 * layer is inherited independently by every INSERT instance.
 */
export function filterCadDocument(document: CadDocument, profile: CadLoadProfile): CadDocumentFilterResult {
  if (profile.mode === 'full') {
    return {
      document,
      removedEntityCount: 0,
      removedBlockNames: [],
      remainingBlockNames: Object.keys(document.blocks),
      warnings: [],
    };
  }

  const hiddenLayers = new Set(profile.hiddenLayerIds.map(canonical));
  for (const [id, layer] of Object.entries(document.layers)) {
    if (hiddenLayers.has(canonical(id)) || hiddenLayers.has(canonical(layer.name))) {
      hiddenLayers.add(canonical(id));
      hiddenLayers.add(canonical(layer.name));
    }
  }
  const hiddenBlocks = new Set(profile.hiddenBlockNames.map(canonical));
  const hiddenCategories = new Set<CadEntityCategory>(profile.hiddenEntityCategories);
  const resolveBlock = createBlockResolver(document.blocks);
  const warnings: DwgPreflightWarning[] = [];
  let removedEntityCount = 0;

  const isHiddenBlock = (entry: BlockEntry | undefined, entity: CadEntity): boolean => {
    return [entry?.key, entry?.name, entity.blockName, entity.name, entity.effectiveBlockName]
      .some((name) => hiddenBlocks.has(canonical(name)));
  };

  const hasHiddenLayer = (entity: CadEntity, insideBlock: boolean): boolean => {
    const authoredLayer = entity.layer || '0';
    if (insideBlock && canonical(authoredLayer) === '0') return false;
    return hiddenLayers.has(canonical(authoredLayer));
  };

  const filterEntity = (entity: CadEntity, insideBlock: boolean): CadEntity | null => {
    const referencedBlock = entityKind(entity) === 'insert' ? resolveBlock(entity) : undefined;
    const categories = cadEntityCategories(entity, referencedBlock);
    if (referencedBlock && isCadXrefBlock(referencedBlock.name, referencedBlock.block)) categories.add('xref');
    if (hasHiddenLayer(entity, insideBlock)
      || [...categories].some((category) => hiddenCategories.has(category))
      || (entityKind(entity) === 'insert' && isHiddenBlock(referencedBlock, entity))) {
      removedEntityCount += 1;
      return null;
    }

    if (entityKind(entity) === 'insert' && !referencedBlock) {
      warnings.push({
        code: 'missing-block',
        blockName: String(entity.blockName ?? entity.name ?? '') || undefined,
      });
    }

    if (!entity.attribs?.length) return entity;
    const attribs = entity.attribs
      .map((attribute) => filterEntity(attribute, true))
      .filter((attribute): attribute is CadEntity => attribute !== null);
    return attribs.length === entity.attribs.length ? entity : { ...entity, attribs };
  };

  const filteredBlocks: CadDocument['blocks'] = {};
  for (const [key, block] of Object.entries(document.blocks)) {
    const entities = block.entities
      .map((entity) => filterEntity(entity, true))
      .filter((entity): entity is CadEntity => entity !== null);
    filteredBlocks[key] = entities.length === block.entities.length ? block : { ...block, entities };
  }
  const filteredEntities = document.entities
    .map((entity) => filterEntity(entity, false))
    .filter((entity): entity is CadEntity => entity !== null);

  const filteredResolveBlock = createBlockResolver(filteredBlocks);
  const reachable = new Set<string>();
  const visitBlock = (entry: BlockEntry, path: string[]) => {
    if (reachable.has(entry.key)) return;
    reachable.add(entry.key);
    const nextPath = [...path, entry.key];
    for (const entity of entry.block.entities) {
      if (entityKind(entity) !== 'insert') continue;
      const child = filteredResolveBlock(entity);
      if (!child) {
        warnings.push({ code: 'missing-block', blockName: String(entity.blockName ?? entity.name ?? '') || undefined, path: nextPath });
        continue;
      }
      if (nextPath.some((name) => canonical(name) === canonical(child.key))) {
        warnings.push({ code: 'cyclic-block', blockName: child.name, path: [...nextPath, child.key] });
        reachable.add(child.key);
        continue;
      }
      visitBlock(child, nextPath);
    }
  };
  for (const entity of filteredEntities) {
    if (entityKind(entity) !== 'insert') continue;
    const entry = filteredResolveBlock(entity);
    if (entry) visitBlock(entry, []);
  }

  const blocks: CadDocument['blocks'] = {};
  const removedBlockNames: string[] = [];
  for (const [key, block] of Object.entries(filteredBlocks)) {
    if (reachable.has(key)) blocks[key] = block;
    else {
      removedBlockNames.push(key);
      removedEntityCount += block.entities.length;
    }
  }

  const hidePaperSpace = hiddenCategories.has('paper-space');
  const pages = hidePaperSpace
    ? undefined
    : document.pages?.map((page) => {
      const entities = page.entities
        .map((entity) => filterEntity(entity, false))
        .filter((entity): entity is CadEntity => entity !== null);
      return entities.length === page.entities.length ? page : { ...page, entities };
    });
  if (hidePaperSpace) removedEntityCount += document.pages?.reduce((sum, page) => sum + page.entities.length, 0) ?? 0;

  const layers = Object.fromEntries(Object.entries(document.layers).map(([id, layer]) => {
    const hidden = hiddenLayers.has(canonical(id)) || hiddenLayers.has(canonical(layer.name));
    // Layer 0 remains available for ByBlock inheritance in otherwise visible INSERTs.
    return [id, hidden && canonical(id) !== '0' && canonical(layer.name) !== '0' ? { ...layer, isVisible: false } : layer];
  }));

  return {
    document: {
      ...document,
      layers,
      blocks,
      entities: filteredEntities,
      pages,
      warnings: [...document.warnings],
    },
    removedEntityCount,
    removedBlockNames,
    remainingBlockNames: Object.keys(blocks),
    warnings: deduplicateWarnings(warnings),
  };
}
