import type { CadObjectDrawOrder, CadObjectDrawOrderTier } from '../../types/models';
import { createCadObjectKey } from './objectKey';

export const EMPTY_CAD_OBJECT_DRAW_ORDER: CadObjectDrawOrder = Object.freeze({
  front: Object.freeze([]) as unknown as string[],
  back: Object.freeze([]) as unknown as string[],
});

function normalizeKey(key: string): string {
  return key.trim().toLocaleLowerCase('en-US');
}

/**
 * Uses only the innermost definition name for block children. The same
 * definition entity therefore moves in every INSERT occurrence, while a
 * model-space entity keeps its own handle identity.
 */
export function createCadDrawOrderGroupKey(objectId: string, blockPath: string[]): string {
  const definitionPath = blockPath.length > 0 ? [blockPath[blockPath.length - 1]] : [];
  return createCadObjectKey(objectId, definitionPath);
}

export function moveCadObjectDrawOrder(
  current: CadObjectDrawOrder,
  groupKey: string,
  tier: CadObjectDrawOrderTier,
): CadObjectDrawOrder {
  const normalized = normalizeKey(groupKey);
  const without = (values: string[]) => values.filter((value) => normalizeKey(value) !== normalized);
  const front = without(current.front);
  const back = without(current.back);
  if (tier === 'front') front.push(groupKey);
  else back.push(groupKey);
  return { front, back };
}

export function cadObjectDrawOrderZIndex(order: CadObjectDrawOrder, groupKey: string): number {
  const normalized = normalizeKey(groupKey);
  const frontIndex = order.front.findIndex((value) => normalizeKey(value) === normalized);
  if (frontIndex >= 0) return 9_000 + frontIndex;
  const backIndex = order.back.findIndex((value) => normalizeKey(value) === normalized);
  return backIndex >= 0 ? -9_000 - backIndex : 0;
}
