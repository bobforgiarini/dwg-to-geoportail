import type { CadLoadProfile, CadOverlayBlock } from '../lib/cad/preflightTypes';
import type { BlockSheetCost, BlockSheetItem, BlockSheetLabels } from './BlockSheet';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function blockCost(block: CadOverlayBlock, budget: number): BlockSheetCost {
  if (block.estimatedCost > budget * 0.4) return 'high';
  if (block.estimatedCost > budget * 0.1) return 'medium';
  return 'low';
}

export function createBlockSheetLabels(t: Translate): BlockSheetLabels {
  return {
    ariaLabel: t('blocksTitle'), close: t('close'), title: t('blocksTitle'),
    searchLabel: t('blocks.search'), searchPlaceholder: t('blocks.searchPlaceholder'),
    showAll: t('showAll'), hideAll: t('hideAll'), namedGroup: t('blocks.named'), systemGroup: t('blocks.system'), xrefGroup: t('blocks.xref'),
    noBlocks: t('blocks.none'), noMatches: t('blocks.noMatches'), reloadRequired: t('blocks.reloadRequired'), applyChanges: t('blocks.applyChanges'),
    visibleCount: (count) => t('blocks.visibleCount', { count }), hiddenCount: (count) => t('blocks.hiddenCount', { count }),
    visibilitySummary: (visible, hidden) => t('blocks.summary', { visible, hidden }), groupCount: (visible, total) => t('blocks.groupCount', { visible, total }),
    instanceCount: (count) => t('blocks.instanceCount', { count }), objectCount: (count) => t('blocks.objectCount', { count }),
    textCount: (count) => t('blocks.textCount', { count }), hatchCount: (count) => t('blocks.hatchCount', { count }),
    mainLayer: (name) => t('blocks.mainLayer', { name }), cost: { low: t('blocks.costLow'), medium: t('blocks.costMedium'), high: t('blocks.costHigh') },
    costLabel: (cost) => t('blocks.costLabel', { cost }), toggleBlock: (name, nextVisible) => t(nextVisible ? 'blocks.showBlock' : 'blocks.hideBlock', { name }),
  };
}

export function createBlockSheetItems(
  blocks: CadOverlayBlock[],
  profile: CadLoadProfile,
  budget: number,
): BlockSheetItem[] {
  const hidden = new Set(profile.hiddenBlockNames.map((name) => name.toLocaleLowerCase('en-US')));
  return blocks.map((block) => ({
    id: block.id,
    name: block.name,
    group: block.kind === 'anonymous' ? 'system' : block.kind,
    visible: !hidden.has(block.name.toLocaleLowerCase('en-US')) && !hidden.has(block.id.toLocaleLowerCase('en-US')),
    instanceCount: block.instanceCount,
    recursiveObjectCount: block.expandedEntityCount,
    textCount: block.textCount,
    hatchCount: block.hatchCount,
    mainLayer: block.primaryLayer ?? undefined,
    cost: blockCost(block, budget),
    requiresReload: block.isNested || profile.mode === 'filtered',
  }));
}
