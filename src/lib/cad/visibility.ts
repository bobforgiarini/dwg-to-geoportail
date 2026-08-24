import type { DwgImportResult } from '../../types/models';

export function countHiddenCadObjects(dwg: DwgImportResult | null, hiddenFeatureIds: ReadonlySet<string>): number {
  if (!dwg) return 0;

  const hiddenLayerIds = new Set(dwg.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  return dwg.features.reduce((count, feature) => {
    const featureId = String(feature.get('featureId') ?? feature.getId() ?? '');
    const layerId = String(feature.get('layerId') ?? '0');
    return count + (hiddenFeatureIds.has(featureId) || hiddenLayerIds.has(layerId) ? 1 : 0);
  }, 0);
}
