import type { CadBlock, CadDocument, CadEntity, CadLayer } from '@flyfish-dev/cad-viewer';
import type {
  CadBlockKind,
  CadEntityCategory,
  CadLoadProfile,
  CadOverlayBlock,
  DwgProfileEffect,
  DwgProfileEffectReason,
  DwgPreflightEntityCounts,
  DwgPreflightOptions,
  DwgPreflightReport,
  DwgPreflightWarning,
  DwgRiskReason,
} from './preflightTypes';
import { filterCadDocument } from './filterCadDocument';

const DEFAULT_MAX_BLOCK_DEPTH = 64;
const MAX_ESTIMATE = 1_000_000_000_000;

interface BlockEntry {
  key: string;
  name: string;
  block: CadBlock;
}

interface BlockRegistry {
  entries: BlockEntry[];
  resolve(entity: CadEntity): BlockEntry | undefined;
}

interface DefinitionMetrics {
  directEntityCount: number;
  recursiveEntityCount: number;
  textCount: number;
  hatchCount: number;
  estimatedCost: number;
  referencedBlockNames: Set<string>;
  hasCycle: boolean;
}

function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function saturatingAdd(left: number, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return MAX_ESTIMATE;
  return Math.min(MAX_ESTIMATE, Math.max(0, left) + Math.max(0, right));
}

function saturatingMultiply(left: number, right: number): number {
  if (!left || !right) return 0;
  if (!Number.isFinite(left) || !Number.isFinite(right) || left > MAX_ESTIMATE / right) return MAX_ESTIMATE;
  return Math.min(MAX_ESTIMATE, Math.max(0, left) * Math.max(0, right));
}

function positiveInteger(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}

function insertMultiplicity(entity: CadEntity): number {
  return saturatingMultiply(positiveInteger(entity.insertRowCount), positiveInteger(entity.insertColumnCount));
}

function blockRegistry(document: CadDocument): BlockRegistry {
  const aliases = new Map<string, BlockEntry>();
  const entries = Object.entries(document.blocks).map(([key, block]) => ({ key, name: block.name || key, block }));
  for (const entry of entries) {
    for (const alias of [entry.key, entry.name]) {
      const normalized = canonical(alias);
      if (normalized && !aliases.has(normalized)) aliases.set(normalized, entry);
    }
  }
  return {
    entries,
    resolve(entity) {
      for (const candidate of [entity.blockName, entity.name]) {
        const resolved = aliases.get(canonical(candidate));
        if (resolved) return resolved;
      }
      return undefined;
    },
  };
}

function rawRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function truthyRawFlag(raw: Record<string, unknown> | null, names: string[]): boolean {
  if (!raw) return false;
  return names.some((name) => raw[name] === true || raw[name] === 1 || raw[name] === '1');
}

export function isCadXrefBlock(name: string, block: CadBlock): boolean {
  const raw = rawRecord(block.raw);
  const flags = typeof raw?.flags === 'number' ? raw.flags : typeof raw?.flag === 'number' ? raw.flag : 0;
  return name.includes('|')
    || truthyRawFlag(raw, ['isXref', 'isXRef', 'xref', 'isExternalReference', 'externalReference', 'isOverlay'])
    || Boolean(flags & (4 | 8 | 16));
}

export function cadBlockKind(name: string, block: CadBlock): CadBlockKind {
  if (isCadXrefBlock(name, block)) return 'xref';
  return name.startsWith('*') ? 'anonymous' : 'named';
}

function normalizedEntityType(entity: CadEntity): string {
  return String(entity.type || entity.kind || '').trim().toUpperCase();
}

function entityKind(entity: CadEntity): string {
  return String(entity.kind || entity.type || '').trim().toLowerCase();
}

function pointHasZ(value: unknown): boolean {
  const point = rawRecord(value);
  return typeof point?.z === 'number' && Math.abs(point.z) > 1e-6;
}

export function isCadEntity3d(entity: CadEntity): boolean {
  const points: unknown[] = [entity.startPoint, entity.endPoint, entity.center, entity.insertionPoint];
  points.push(...(entity.vertices ?? []), ...(entity.points ?? []), ...(entity.controlPoints ?? []), ...(entity.fitPoints ?? []));
  const type = normalizedEntityType(entity);
  return points.some(pointHasZ)
    || (typeof entity.thickness === 'number' && Math.abs(entity.thickness) > 1e-6)
    || /(^3D|MESH|POLYFACE|BODY|REGION|SURFACE|EXTRUDED|REVOLVED|SWEPT|LOFTED)/.test(type);
}

export function cadEntityCategories(
  entity: CadEntity,
  referencedBlock?: { name: string; block: CadBlock },
): Set<CadEntityCategory> {
  const categories = new Set<CadEntityCategory>();
  const type = normalizedEntityType(entity);
  const kind = entityKind(entity);
  if (entity.isInPaperSpace) categories.add('paper-space');
  if (referencedBlock && isCadXrefBlock(referencedBlock.name, referencedBlock.block)) categories.add('xref');
  if (kind === 'image' || /(IMAGE|WIPEOUT|UNDERLAY|RASTER)/.test(type)) categories.add('image');
  if (type.includes('OLE')) categories.add('ole');
  if (kind === 'unsupported' || /(PROXY|CUSTOM_OBJECT|CUSTOMENTITY)/.test(type)) categories.add('proxy');
  if (isCadEntity3d(entity)) categories.add('3d');
  if (kind === 'text' || /^(TEXT|MTEXT|ATTRIB|ATTDEF)$/.test(type)) categories.add('text');
  if (/(^|MULTI)LEADER|MLEADER/.test(type)) categories.add('leader');
  if (kind === 'hatch' || type === 'HATCH') categories.add('hatch');
  return categories;
}

function vertexCount(entity: CadEntity): number {
  return (entity.vertices?.length ?? 0)
    + (entity.points?.length ?? 0)
    + (entity.controlPoints?.length ?? 0)
    + (entity.fitPoints?.length ?? 0)
    + (entity.loops?.reduce((sum, loop) => sum + (loop.vertices?.length ?? 0)
      + (loop.commands?.reduce((commandSum, command) => commandSum + command.points.length, 0) ?? 0), 0) ?? 0);
}

function entityCost(entity: CadEntity): number {
  const categories = cadEntityCategories(entity);
  let cost = 1;
  if (categories.has('text')) cost += 2;
  if (categories.has('leader')) cost += 3;
  if (categories.has('hatch')) cost += 8;
  if (categories.has('image')) cost += 12;
  if (categories.has('ole')) cost += 12;
  if (categories.has('proxy')) cost += 4;
  if (categories.has('3d')) cost += 16;
  cost += Math.ceil(vertexCount(entity) / 200);
  return cost;
}

function layerIsNoPlot(layer: CadLayer): boolean {
  const raw = rawRecord(layer.raw);
  const plotValue = raw?.plot ?? raw?.isPlottable ?? raw?.plottable;
  const noPlotValue = raw?.noPlot ?? raw?.isNoPlot;
  return plotValue === false || plotValue === 0 || noPlotValue === true || noPlotValue === 1;
}

function definitionMetrics(
  entry: BlockEntry,
  registry: BlockRegistry,
  maxDepth: number,
  warnings: DwgPreflightWarning[],
  memo: Map<string, DefinitionMetrics>,
  path: string[] = [],
): DefinitionMetrics {
  const memoKey = `${canonical(entry.key)}:${Math.max(0, maxDepth - path.length)}`;
  const cached = memo.get(memoKey);
  if (cached) return cached;
  const result: DefinitionMetrics = {
    directEntityCount: 0,
    recursiveEntityCount: 0,
    textCount: 0,
    hatchCount: 0,
    estimatedCost: 0,
    referencedBlockNames: new Set(),
    hasCycle: false,
  };
  const nextPath = [...path, entry.key];
  for (const entity of entry.block.entities) {
    if (entityKind(entity) !== 'insert') {
      result.directEntityCount = saturatingAdd(result.directEntityCount, 1);
      result.recursiveEntityCount = saturatingAdd(result.recursiveEntityCount, 1);
      const categories = cadEntityCategories(entity);
      if (categories.has('text')) result.textCount = saturatingAdd(result.textCount, 1);
      if (categories.has('hatch')) result.hatchCount = saturatingAdd(result.hatchCount, 1);
      result.estimatedCost = saturatingAdd(result.estimatedCost, entityCost(entity));
      continue;
    }

    const child = registry.resolve(entity);
    const authoredName = String(entity.blockName ?? entity.name ?? '');
    if (!child) {
      warnings.push({ code: 'missing-block', blockName: authoredName || undefined, path: nextPath });
      continue;
    }
    result.referencedBlockNames.add(child.name);
    if (nextPath.some((name) => canonical(name) === canonical(child.key))) {
      result.hasCycle = true;
      warnings.push({ code: 'cyclic-block', blockName: child.name, path: [...nextPath, child.key] });
      continue;
    }
    if (nextPath.length >= maxDepth) {
      warnings.push({ code: 'max-depth', blockName: child.name, path: nextPath });
      continue;
    }
    const childMetrics = definitionMetrics(child, registry, maxDepth, warnings, memo, nextPath);
    const multiplier = insertMultiplicity(entity);
    result.recursiveEntityCount = saturatingAdd(result.recursiveEntityCount, saturatingMultiply(childMetrics.recursiveEntityCount, multiplier));
    result.textCount = saturatingAdd(result.textCount, saturatingMultiply(childMetrics.textCount, multiplier));
    result.hatchCount = saturatingAdd(result.hatchCount, saturatingMultiply(childMetrics.hatchCount, multiplier));
    result.estimatedCost = saturatingAdd(result.estimatedCost, saturatingMultiply(childMetrics.estimatedCost, multiplier));
    childMetrics.referencedBlockNames.forEach((name) => result.referencedBlockNames.add(name));
    result.hasCycle ||= childMetrics.hasCycle;
  }
  // Cyclic results are path-dependent; acyclic shared subgraphs are safe to
  // reuse and keep preflight linear for common block DAGs.
  if (!result.hasCycle) memo.set(memoKey, result);
  return result;
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

function layerRegistry(document: CadDocument) {
  const aliases = new Map<string, string>();
  for (const [id, layer] of Object.entries(document.layers)) {
    if (!aliases.has(canonical(id))) aliases.set(canonical(id), id);
    if (!aliases.has(canonical(layer.name))) aliases.set(canonical(layer.name), id);
  }
  return {
    resolve(value: string | undefined): string {
      const normalized = canonical(value || '0');
      return aliases.get(normalized) ?? value ?? '0';
    },
  };
}

function effectiveLayer(entity: CadEntity, inheritedLayer: string | undefined, resolveLayer: (value: string | undefined) => string): string {
  const authored = entity.layer || '0';
  if (canonical(authored) === '0' && inheritedLayer) return inheritedLayer;
  return resolveLayer(authored);
}

function emptyEntityCounts(): DwgPreflightEntityCounts {
  return {
    modelEntities: 0,
    insertInstances: 0,
    texts: 0,
    leaders: 0,
    mleaders: 0,
    hatches: 0,
    solids: 0,
    polylineVertices: 0,
    paperSpaceEntities: 0,
    images: 0,
    oleObjects: 0,
    proxyObjects: 0,
    threeDimensional: 0,
    xrefs: 0,
  };
}

function deviceBudget(options: DwgPreflightOptions): number {
  const memory = options.device?.memoryGiB;
  const mobile = options.device?.mobile === true;
  if (typeof memory !== 'number' || !Number.isFinite(memory) || memory <= 0) return mobile ? 45_000 : 150_000;
  if (memory < 2) return 20_000;
  if (memory < 4) return mobile ? 35_000 : 70_000;
  if (memory < 8) return mobile ? 75_000 : 150_000;
  return mobile ? 140_000 : 300_000;
}

function documentVersion(document: CadDocument): string | null {
  const candidates = [
    document.header?.$ACADVER,
    document.header?.ACADVER,
    document.metadata.dwgVersion,
    document.metadata.version,
    document.metadata.acadVersion,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value : null;
}

function categoryCount(category: CadEntityCategory, counts: DwgPreflightEntityCounts): number {
  switch (category) {
    case 'paper-space': return counts.paperSpaceEntities;
    case 'xref': return counts.xrefs;
    case 'image': return counts.images;
    case 'ole': return counts.oleObjects;
    case 'proxy': return counts.proxyObjects;
    case '3d': return counts.threeDimensional;
    case 'text': return counts.texts;
    case 'leader': return saturatingAdd(counts.leaders, counts.mleaders);
    case 'hatch': return counts.hatches;
  }
}

function categoryReason(category: CadEntityCategory): DwgProfileEffectReason {
  switch (category) {
    case 'paper-space': return 'paper-space';
    case 'image': return 'unsupported-image';
    case 'ole': return 'unsupported-ole';
    case 'proxy': return 'unsupported-proxy';
    case '3d': return 'unsupported-3d';
    case 'xref': return 'unresolved-xref';
    default: return 'user-selection';
  }
}

function categoryCost(category: CadEntityCategory, count: number): number {
  const weight: Record<CadEntityCategory, number> = {
    'paper-space': 1,
    xref: 1,
    image: 13,
    ole: 13,
    proxy: 5,
    '3d': 17,
    text: 3,
    leader: 4,
    hatch: 9,
  };
  return saturatingMultiply(count, weight[category]);
}

function profileEffects(
  layers: DwgPreflightReport['layers'],
  blocks: CadOverlayBlock[],
  counts: DwgPreflightEntityCounts,
  profile: CadLoadProfile,
  options: DwgPreflightOptions,
): DwgProfileEffect[] {
  const effects: DwgProfileEffect[] = [];
  const hiddenLayerIds = new Set(profile.hiddenLayerIds.map(canonical));
  for (const layer of layers) {
    if (!hiddenLayerIds.has(canonical(layer.id)) && !hiddenLayerIds.has(canonical(layer.name))) continue;
    const reason: DwgProfileEffectReason = !layer.visible
      ? 'layer-off'
      : layer.frozen
        ? 'layer-frozen'
        : 'layer-no-plot';
    effects.push({
      id: `layer:${layer.id}`,
      kind: 'layer',
      policy: 'recommended',
      reason,
      label: layer.name,
      affectedEntityCount: layer.expandedEntityCount,
      estimatedCost: layer.expandedEntityCount,
      selected: true,
    });
  }

  const hiddenBlocks = new Set(profile.hiddenBlockNames.map(canonical));
  for (const block of blocks) {
    if (!hiddenBlocks.has(canonical(block.id)) && !hiddenBlocks.has(canonical(block.name))) continue;
    effects.push({
      id: `block:${block.id}`,
      kind: block.kind === 'xref' ? 'xref' : 'block',
      policy: 'recommended',
      reason: block.kind === 'xref' ? 'unresolved-xref' : 'user-selection',
      label: block.name,
      affectedEntityCount: block.expandedEntityCount,
      estimatedCost: block.estimatedCost,
      selected: true,
    });
  }

  for (const category of profile.hiddenEntityCategories) {
    const affectedEntityCount = categoryCount(category, counts);
    if (!affectedEntityCount) continue;
    effects.push({
      id: `category:${category}`,
      kind: 'category',
      policy: category === 'paper-space' ? 'required' : 'recommended',
      reason: categoryReason(category),
      label: category,
      affectedEntityCount,
      estimatedCost: categoryCost(category, affectedEntityCount),
      selected: true,
    });
  }
  const spatial = options.spatialFilter;
  if (spatial?.removedRootEntityCount) {
    effects.push({
      id: 'boundary:luxembourg-1000m',
      kind: 'boundary',
      policy: 'recommended',
      reason: 'outside-luxembourg-buffer',
      label: 'Luxembourg + 1 km',
      affectedEntityCount: spatial.removedRootEntityCount,
      estimatedCost: spatial.removedRootEntityCount,
      selected: spatial.enabled,
    });
  }
  return effects;
}

function metadataWarnings(options: DwgPreflightOptions): DwgPreflightWarning[] {
  const warnings: DwgPreflightWarning[] = [];
  const annotation = options.annotationScale;
  if (annotation?.contextObjectCount && !annotation.availableScales.length) {
    warnings.push({ code: 'annotation-scale-unresolved' });
  } else if (annotation?.failOpen) {
    warnings.push({
      code: 'annotation-context-invalid',
      detail: 'Ambiguous native annotation contexts were retained.',
    });
  }
  for (const reference of options.externalReferences ?? []) {
    if (reference.status === 'missing') warnings.push({
      code: 'xref-missing', blockName: reference.name, path: reference.path,
    });
    if (reference.status === 'ambiguous') warnings.push({
      code: 'xref-ambiguous', blockName: reference.name, path: reference.path,
    });
    if (reference.status === 'cycle') warnings.push({
      code: 'xref-cycle', blockName: reference.name, path: reference.path,
    });
    if (reference.status === 'invalid') warnings.push({
      code: 'xref-invalid', blockName: reference.name, path: reference.path,
    });
  }
  return warnings;
}

function analyzeCadDocumentInternal(
  document: CadDocument,
  options: DwgPreflightOptions,
  includeImpact: boolean,
): DwgPreflightReport {
  const registry = blockRegistry(document);
  const layerLookup = layerRegistry(document);
  const maxDepth = Math.max(1, options.maxBlockDepth ?? DEFAULT_MAX_BLOCK_DEPTH);
  const warnings: DwgPreflightWarning[] = [];
  const metrics = new Map<string, DefinitionMetrics>();
  const definitionMemo = new Map<string, DefinitionMetrics>();
  for (const entry of registry.entries) metrics.set(entry.key, definitionMetrics(entry, registry, maxDepth, warnings, definitionMemo));

  const counts = emptyEntityCounts();
  const instanceCounts = new Map<string, number>();
  const directInstanceCounts = new Map<string, number>();
  const blockLayerCounts = new Map<string, Map<string, number>>();
  const layerEntityCounts = new Map<string, number>();
  let estimatedRenderCost = 0;
  let directModelEntityCount = 0;
  let maxObservedDepth = 0;
  const unresolvedXrefBlockNames = new Set<string>();

  const addLayerCount = (layerId: string, amount: number) => {
    layerEntityCounts.set(layerId, saturatingAdd(layerEntityCounts.get(layerId) ?? 0, amount));
  };

  const visit = (entity: CadEntity, multiplier: number, inheritedLayer: string | undefined, depth: number, path: string[]) => {
    if (entity.isInPaperSpace) {
      counts.paperSpaceEntities = saturatingAdd(counts.paperSpaceEntities, multiplier);
      return;
    }
    const layerId = effectiveLayer(entity, inheritedLayer, layerLookup.resolve);
    if (entityKind(entity) === 'insert') {
      const definition = registry.resolve(entity);
      const authoredName = String(entity.blockName ?? entity.name ?? '');
      const amount = saturatingMultiply(multiplier, insertMultiplicity(entity));
      counts.insertInstances = saturatingAdd(counts.insertInstances, amount);
      entity.attribs?.forEach((attribute) => visit(attribute, amount, layerId, depth, path));
      if (!definition) {
        warnings.push({ code: 'missing-block', blockName: authoredName || undefined, path });
        return;
      }
      if (isCadXrefBlock(definition.name, definition.block)) {
        counts.xrefs = saturatingAdd(counts.xrefs, amount);
        if (definition.block.entities.length === 0) unresolvedXrefBlockNames.add(definition.name);
      }
      instanceCounts.set(definition.key, saturatingAdd(instanceCounts.get(definition.key) ?? 0, amount));
      if (depth === 0) directInstanceCounts.set(definition.key, saturatingAdd(directInstanceCounts.get(definition.key) ?? 0, amount));
      const layers = blockLayerCounts.get(definition.key) ?? new Map<string, number>();
      layers.set(layerId, saturatingAdd(layers.get(layerId) ?? 0, amount));
      blockLayerCounts.set(definition.key, layers);
      maxObservedDepth = Math.max(maxObservedDepth, depth + 1);
      if (path.some((name) => canonical(name) === canonical(definition.key))) {
        warnings.push({ code: 'cyclic-block', blockName: definition.name, path: [...path, definition.key] });
        return;
      }
      if (depth >= maxDepth) {
        warnings.push({ code: 'max-depth', blockName: definition.name, path });
        return;
      }
      definition.block.entities.forEach((child) => visit(child, amount, layerId, depth + 1, [...path, definition.key]));
      return;
    }

    counts.modelEntities = saturatingAdd(counts.modelEntities, multiplier);
    if (depth === 0) directModelEntityCount = saturatingAdd(directModelEntityCount, multiplier);
    addLayerCount(layerId, multiplier);
    estimatedRenderCost = saturatingAdd(estimatedRenderCost, saturatingMultiply(entityCost(entity), multiplier));
    const categories = cadEntityCategories(entity);
    if (categories.has('text')) counts.texts = saturatingAdd(counts.texts, multiplier);
    if (categories.has('leader')) {
      const type = normalizedEntityType(entity);
      if (type === 'MLEADER' || type === 'MULTILEADER') counts.mleaders = saturatingAdd(counts.mleaders, multiplier);
      else counts.leaders = saturatingAdd(counts.leaders, multiplier);
    }
    if (categories.has('hatch')) counts.hatches = saturatingAdd(counts.hatches, multiplier);
    if (categories.has('image')) counts.images = saturatingAdd(counts.images, multiplier);
    if (categories.has('ole')) counts.oleObjects = saturatingAdd(counts.oleObjects, multiplier);
    if (categories.has('proxy')) counts.proxyObjects = saturatingAdd(counts.proxyObjects, multiplier);
    if (categories.has('3d')) counts.threeDimensional = saturatingAdd(counts.threeDimensional, multiplier);
    const kind = entityKind(entity);
    if (kind === 'solid' || normalizedEntityType(entity) === 'SOLID') counts.solids = saturatingAdd(counts.solids, multiplier);
    if (kind === 'polyline' || /(POLYLINE|LWPOLYLINE)/.test(normalizedEntityType(entity))) {
      counts.polylineVertices = saturatingAdd(counts.polylineVertices, saturatingMultiply(vertexCount(entity), multiplier));
    }
  };

  document.entities.forEach((entity) => visit(entity, 1, undefined, 0, []));
  for (const page of document.pages ?? []) {
    for (const entity of page.entities) counts.paperSpaceEntities = saturatingAdd(counts.paperSpaceEntities, entityKind(entity) === 'insert' ? insertMultiplicity(entity) : 1);
  }

  const unknownEntityCount = Math.max(0, Math.floor(options.unknownEntityCount ?? 0));
  if (unknownEntityCount) {
    counts.modelEntities = saturatingAdd(counts.modelEntities, unknownEntityCount);
    counts.proxyObjects = saturatingAdd(counts.proxyObjects, unknownEntityCount);
    estimatedRenderCost = saturatingAdd(estimatedRenderCost, saturatingMultiply(unknownEntityCount, 5));
  }

  const blocks: CadOverlayBlock[] = registry.entries
    .filter((entry) => (instanceCounts.get(entry.key) ?? 0) > 0)
    .map((entry) => {
      const definition = metrics.get(entry.key)!;
      const instanceCount = instanceCounts.get(entry.key) ?? 0;
      const directInstanceCount = directInstanceCounts.get(entry.key) ?? 0;
      const layers = [...(blockLayerCounts.get(entry.key)?.entries() ?? [])]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
      return {
        id: entry.key,
        name: entry.name,
        kind: cadBlockKind(entry.name, entry.block),
        visible: true,
        instanceCount,
        directInstanceCount,
        directEntityCount: definition.directEntityCount,
        recursiveEntityCount: definition.recursiveEntityCount,
        expandedEntityCount: saturatingMultiply(definition.recursiveEntityCount, instanceCount),
        textCount: definition.textCount,
        hatchCount: definition.hatchCount,
        primaryLayer: layers[0]?.[0] ?? null,
        referencedBlockNames: [...definition.referencedBlockNames].sort((a, b) => a.localeCompare(b)),
        isNested: instanceCount > directInstanceCount,
        hasCycle: definition.hasCycle,
        estimatedCost: saturatingMultiply(definition.estimatedCost, instanceCount),
      } satisfies CadOverlayBlock;
    })
    .sort((left, right) => {
      const kindOrder = { named: 0, xref: 1, anonymous: 2 } as const;
      return kindOrder[left.kind] - kindOrder[right.kind] || left.name.localeCompare(right.name);
    });

  const layers = Object.entries(document.layers)
    .map(([id, layer]) => ({
      id,
      name: layer.name || id,
      visible: layer.isVisible !== false,
      frozen: layer.isFrozen === true,
      noPlot: layerIsNoPlot(layer),
      expandedEntityCount: layerEntityCounts.get(id) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  // Every layer adds renderer/material/index overhead even when its own entity
  // count is small. Keep the coefficient conservative so layer count informs
  // the device budget without becoming a hard gate by itself.
  estimatedRenderCost = saturatingAdd(estimatedRenderCost, layers.length * 3);

  const hiddenLayerIds = layers.filter((layer) => !layer.visible || layer.frozen || layer.noPlot).map((layer) => layer.id);
  const hiddenEntityCategories: CadEntityCategory[] = [];
  if (counts.paperSpaceEntities) hiddenEntityCategories.push('paper-space');
  if (counts.images) hiddenEntityCategories.push('image');
  if (counts.oleObjects) hiddenEntityCategories.push('ole');
  if (counts.proxyObjects) hiddenEntityCategories.push('proxy');
  if (counts.threeDimensional) hiddenEntityCategories.push('3d');
  const recommendedProfile: CadLoadProfile = {
    mode: hiddenLayerIds.length || unresolvedXrefBlockNames.size || hiddenEntityCategories.length ? 'filtered' : 'full',
    hiddenLayerIds,
    hiddenBlockNames: [...unresolvedXrefBlockNames],
    hiddenEntityCategories,
  };

  const budget = deviceBudget(options);
  const fileSize = options.file?.size ?? 0;
  const sizeRatio = fileSize > 10 * 1024 * 1024 ? fileSize / (10 * 1024 * 1024) : 1;
  // File size contributes only as a bounded memory-pressure multiplier to the
  // measured model complexity. Even a very large but simple DWG therefore
  // never opens preparation because of byte size alone.
  const sizePressureMultiplier = Math.min(1.5, 1 + Math.max(0, Math.log2(sizeRatio)) * 0.08);
  const riskScore = estimatedRenderCost * sizePressureMultiplier;
  const shouldPrepare = riskScore > budget;
  const reasons: DwgRiskReason[] = [];
  if (shouldPrepare) reasons.push('render-cost');
  if (shouldPrepare && sizePressureMultiplier > 1) reasons.push('file-size-pressure');
  if (counts.modelEntities > budget) reasons.push('entity-count');
  if (counts.modelEntities > Math.max(budget / 2, directModelEntityCount * 4) && counts.insertInstances) reasons.push('block-expansion');
  if (counts.texts > budget * 0.2) reasons.push('text-density');
  if (counts.hatches > budget * 0.02) reasons.push('hatch-density');
  if (counts.polylineVertices > budget * 10) reasons.push('polyline-density');
  if (shouldPrepare && layers.length > 500) reasons.push('layer-count');
  if ((options.device?.memoryGiB ?? Infinity) <= 2 && estimatedRenderCost > budget * 0.75) reasons.push('limited-device-memory');

  const effects = profileEffects(layers, blocks, counts, recommendedProfile, options);
  const allWarnings = deduplicateWarnings([...warnings, ...metadataWarnings(options)]);
  const report: DwgPreflightReport = {
    schemaVersion: 2,
    file: {
      name: options.file?.name ?? document.sourceName ?? null,
      size: options.file?.size ?? null,
      lastModified: options.file?.lastModified ?? null,
    },
    format: document.format,
    documentVersion: documentVersion(document),
    layers,
    blocks,
    entityCounts: counts,
    definedBlockCount: registry.entries.length,
    reachableBlockCount: blocks.length,
    maxBlockDepth: maxObservedDepth,
    risk: {
      level: !shouldPrepare ? 'low' : riskScore > budget * 2 ? 'high' : 'elevated',
      shouldPrepare,
      estimatedRenderCost,
      deviceBudget: budget,
      reasons,
    },
    recommendedProfile,
    warnings: allWarnings,
    effects,
    annotationScale: options.annotationScale,
    externalReferences: options.externalReferences,
    spatialFilter: options.spatialFilter,
  };

  if (includeImpact) {
    let recommendedEntityCount = saturatingAdd(counts.modelEntities, counts.paperSpaceEntities);
    let recommendedCost = estimatedRenderCost;
    if (recommendedProfile.mode === 'filtered') {
      const filtered = filterCadDocument(document, recommendedProfile).document;
      const filteredReport = analyzeCadDocumentInternal(filtered, {
        ...options,
        annotationScale: undefined,
        externalReferences: undefined,
      }, false);
      recommendedEntityCount = saturatingAdd(
        filteredReport.entityCounts.modelEntities,
        filteredReport.entityCounts.paperSpaceEntities,
      );
      recommendedCost = filteredReport.risk.estimatedRenderCost;
    }
    const appliedSpatialRemoval = options.spatialFilter?.enabled
      ? options.spatialFilter.removedRootEntityCount
      : 0;
    report.impact = {
      before: {
        entityCount: saturatingAdd(
          saturatingAdd(counts.modelEntities, counts.paperSpaceEntities),
          appliedSpatialRemoval,
        ),
        estimatedCost: saturatingAdd(estimatedRenderCost, appliedSpatialRemoval),
      },
      recommended: { entityCount: recommendedEntityCount, estimatedCost: recommendedCost },
    };
  }
  return report;
}

export function analyzeCadDocument(document: CadDocument, options: DwgPreflightOptions = {}): DwgPreflightReport {
  return analyzeCadDocumentInternal(document, options, true);
}
