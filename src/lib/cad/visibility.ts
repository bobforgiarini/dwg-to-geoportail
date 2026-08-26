import type { DwgImportResult } from '../../types/models';

export function countHiddenCadObjects(
  dwg: DwgImportResult | null,
  hiddenFeatureIds: ReadonlySet<string>,
  hiddenObjectKeys: ReadonlySet<string> = new Set(),
): number {
  if (!dwg) return 0;

  const hiddenLayerIds = new Set(dwg.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  const hidden = new Set<string>();
  for (const feature of dwg.features) {
    const featureId = String(feature.get('featureId') ?? feature.getId() ?? '');
    const objectKey = String(feature.get('objectKey') ?? featureId);
    const layerId = String(feature.get('layerId') ?? '0');
    if (hiddenFeatureIds.has(featureId) || hiddenObjectKeys.has(objectKey) || hiddenLayerIds.has(layerId)) hidden.add(objectKey);
  }
  return hidden.size;
}
