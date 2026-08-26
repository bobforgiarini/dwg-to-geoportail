import type { CadLoadProfile } from '../lib/cad/preflightTypes';
import type { CadOverlayLayer } from '../types/models';
import type { LayerSheetCost, LayerSheetItem, LayerSheetLabels } from './LayerSheet';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function layerCost(objectCount: number, budget: number): LayerSheetCost {
  if (objectCount > budget * 0.4) return 'high';
  if (objectCount > budget * 0.1) return 'medium';
  return 'low';
}

function canonicalLayerId(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

interface LayerIdentity {
  id: string;
  name: string;
}

interface PreflightLayerIdentity extends LayerIdentity {
  expandedEntityCount: number;
}

export function layerIdentityMatches(layer: LayerIdentity, value: string): boolean {
  const canonicalValue = canonicalLayerId(value);
  return canonicalLayerId(layer.id) === canonicalValue || canonicalLayerId(layer.name) === canonicalValue;
}

export function isLayerHidden(layer: LayerIdentity, hiddenLayerIds: string[]): boolean {
  return hiddenLayerIds.some((value) => layerIdentityMatches(layer, value));
}

/** Merges preflight and renderer layers in linear time for large layer lists. */
export function mergeLoadedLayerSheetLayers(
  preflightLayers: PreflightLayerIdentity[] | undefined,
  renderedLayers: CadOverlayLayer[],
  hiddenLayerIds: string[],
): CadOverlayLayer[] {
  if (!preflightLayers) return renderedLayers;

  const renderedByIdentity = new Map<string, CadOverlayLayer>();
  for (const layer of renderedLayers) {
    renderedByIdentity.set(canonicalLayerId(layer.id), layer);
    renderedByIdentity.set(canonicalLayerId(layer.name), layer);
  }
  const hiddenIdentities = new Set(hiddenLayerIds.map(canonicalLayerId));

  return preflightLayers.map((layer) => {
    const rendered = renderedByIdentity.get(canonicalLayerId(layer.id))
      ?? renderedByIdentity.get(canonicalLayerId(layer.name));
    const hidden = hiddenIdentities.has(canonicalLayerId(layer.id))
      || hiddenIdentities.has(canonicalLayerId(layer.name));
    return {
      id: layer.id,
      name: layer.name,
      visible: !hidden && (rendered?.visible ?? true),
      featureCount: Math.max(rendered?.featureCount ?? 0, layer.expandedEntityCount),
    };
  });
}

export function createLayerSheetLabels(t: Translate): LayerSheetLabels {
  return {
    ariaLabel: t('layersTitle'),
    close: t('close'),
    title: t('layersTitle'),
    searchLabel: t('layerDrawer.search'),
    searchPlaceholder: t('layerDrawer.searchPlaceholder'),
    showAll: t('showAll'),
    hideAll: t('hideAll'),
    noLayers: t('layerDrawer.none'),
    noMatches: t('layerDrawer.noMatches'),
    reloadRequired: t('layerDrawer.reloadRequired'),
    applyChanges: t('layerDrawer.applyChanges'),
    visibleCount: (count) => t('layerDrawer.visibleCount', { count }),
    hiddenCount: (count) => t('layerDrawer.hiddenCount', { count }),
    visibilitySummary: (visible, hidden) => t('layerDrawer.summary', { visible, hidden }),
    objectCount: (count) => t('layerDrawer.objectCount', { count }),
    cost: {
      low: t('layerDrawer.costLow'),
      medium: t('layerDrawer.costMedium'),
      high: t('layerDrawer.costHigh'),
    },
    costLabel: (cost) => t('layerDrawer.costLabel', { cost }),
    toggleLayer: (name, nextVisible) => t(nextVisible ? 'layerDrawer.showLayer' : 'layerDrawer.hideLayer', { name }),
  };
}

export function createLayerSheetItems(
  layers: CadOverlayLayer[],
  profile: CadLoadProfile,
  budget: number,
  filteredLayersRequireReload = true,
  applyPending = false,
): LayerSheetItem[] {
  const hidden = new Set(profile.hiddenLayerIds.map(canonicalLayerId));
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 1;

  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    objectCount: layer.featureCount,
    cost: layerCost(layer.featureCount, safeBudget),
    requiresReload: filteredLayersRequireReload
      && (applyPending || hidden.has(canonicalLayerId(layer.id)) || hidden.has(canonicalLayerId(layer.name))),
  }));
}
