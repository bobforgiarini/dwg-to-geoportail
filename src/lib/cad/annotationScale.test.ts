import { describe, expect, it } from 'vitest';
import {
  annotationObjectTypes,
  extractRawAnnotationScales,
  selectAnnotationScale,
  type RawAnnotationLibreDwg,
} from './annotationScale';

function rawApi(): RawAnnotationLibreDwg {
  const fields = new Map<number, Record<string, unknown>>([
    [11, { name: '1:100', paper_units: 1, drawing_units: 100 }],
    [12, { name: '1:500', paper_units: 1, drawing_units: 500 }],
    [13, { name: 'broken', paper_units: 0, drawing_units: 1 }],
    [21, { default_scale: { id: 'B' } }],
  ]);
  const objects = [111, 112, 113, 121, 131, 132];
  const types = new Map<number, number>([
    [111, 706], [112, 706], [113, 706], [121, 615], [131, 521], [132, 521],
  ]);
  return {
    dwg_get_num_objects: () => objects.length,
    dwg_get_object: (_data, index) => objects[index] ?? 0,
    dwg_object_get_fixedtype: (object) => types.get(object) ?? 0,
    dwg_object_get_supertype: () => 1,
    dwg_object_to_object_tio: (object) => object - 100,
    dwg_object_get_handle_object: (object) => ({ value: object === 111 ? 10 : 11 }),
    dwg_dynapi_entity_data: <T>(tio: number, field: string) => fields.get(tio)?.[field] as T,
    dwg_dynapi_header_data: <T>(_data: number, field: string) => (
      field === 'CANNOSCALE' ? { id: 'A' } : undefined
    ) as T,
    dwg_ref_get_id: (ref) => (ref as { id?: string } | null)?.id,
  };
}

describe('raw annotation scales', () => {
  it('discovers runtime object ids without pinning another LibreDWG version', () => {
    expect(annotationObjectTypes({
      DWG_TYPE_SCALE: 706,
      DWG_TYPE_CONTEXTDATAMANAGER: 615,
      DWG_TYPE_ALDIMOBJECTCONTEXTDATA: 521,
    })).toEqual({ scale: 706, contextDataManager: 615, contextData: [521] });
  });

  it('validates scales, selects the saved scale and reports fail-open context data', () => {
    const selection = extractRawAnnotationScales(rawApi(), 1, {
      scale: 706,
      contextDataManager: 615,
      contextData: [521],
    });

    expect(selection).toMatchObject({
      mode: 'saved', savedScaleId: 'A', selectedScaleId: 'A',
      contextObjectCount: 2, failOpen: true,
    });
    expect(selection.availableScales).toEqual([
      expect.objectContaining({ id: 'A', name: '1:100', ratio: 100, source: 'saved' }),
      expect.objectContaining({ id: 'B', name: '1:500', ratio: 500, isDefault: true }),
    ]);
  });

  it('uses a valid manual choice and falls back safely for an unknown id', () => {
    const selection = extractRawAnnotationScales(rawApi(), 1, {
      scale: 706, contextDataManager: 615, contextData: [],
    });
    expect(selectAnnotationScale(selection, 'B')).toMatchObject({ mode: 'manual', selectedScaleId: 'B' });
    expect(selectAnnotationScale(selection, 'missing')).toMatchObject({
      mode: 'saved', selectedScaleId: 'A', failOpen: true,
    });
  });
});
