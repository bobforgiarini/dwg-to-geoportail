import type { DwgBlockRecordTableEntry, DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
import {
  filterCadDocumentToLuxembourg,
  type CadSpatialFilterReport,
  type CadSpatialFilterSettings,
} from '../cad/luxembourgSpatialFilter';
import { adaptMlightDwgDatabase } from './dwgPreparation';

export interface MlightLuxembourgSpatialFilterResult {
  model: DwgDatabase;
  report: CadSpatialFilterReport;
}

const MODEL_SPACE_NAMES = new Set(['*model_space', '*model space']);

function canonical(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function isModelSpaceRecord(name: string): boolean {
  return MODEL_SPACE_NAMES.has(canonical(name));
}

function sourceEntity(entity: { raw?: unknown }): DwgEntity {
  if (!entity.raw || typeof entity.raw !== 'object') throw new Error('MLIGHTCAD_SPATIAL_FILTER_SOURCE_MISSING');
  return entity.raw as DwgEntity;
}

/**
 * Applies the shared EPSG:2169 filter before MLightCAD builds its AcDb database
 * and WebGL scene. Retained geometry objects are reused; the parser result is
 * never mutated and no geometry is structured-cloned solely for this step.
 */
export function filterMlightDwgDatabaseToLuxembourg(
  model: DwgDatabase,
  settings: CadSpatialFilterSettings = { enabled: true },
): MlightLuxembourgSpatialFilterResult {
  if (!settings.enabled) {
    const report = filterCadDocumentToLuxembourg(adaptMlightDwgDatabase(model), settings).report;
    return { model, report };
  }

  const filtered = filterCadDocumentToLuxembourg(adaptMlightDwgDatabase(model), settings);
  const rootEntities = filtered.document.entities.map(sourceEntity);
  const remainingBlocks = new Map(
    Object.entries(filtered.document.blocks).map(([key, block]) => [canonical(key), block]),
  );

  const blockEntries = model.tables.BLOCK_RECORD.entries.flatMap((record): DwgBlockRecordTableEntry[] => {
    if (isModelSpaceRecord(record.name)) {
      return record.entities.length === rootEntities.length
        && rootEntities.every((entity, index) => entity === record.entities[index])
        ? [record]
        : [{ ...record, entities: rootEntities }];
    }
    const block = remainingBlocks.get(canonical(record.name));
    if (!block) return [];
    const entities = block.entities.map(sourceEntity);
    return record.entities.length === entities.length
      && entities.every((entity, index) => entity === record.entities[index])
      ? [record]
      : [{ ...record, entities }];
  });

  const unchanged = rootEntities.length === model.entities.length
    && rootEntities.every((entity, index) => entity === model.entities[index])
    && blockEntries.length === model.tables.BLOCK_RECORD.entries.length
    && blockEntries.every((entry, index) => entry === model.tables.BLOCK_RECORD.entries[index]);

  return {
    model: unchanged
      ? model
      : {
        ...model,
        entities: rootEntities,
        tables: {
          ...model.tables,
          BLOCK_RECORD: { ...model.tables.BLOCK_RECORD, entries: blockEntries },
        },
      },
    report: filtered.report,
  };
}
