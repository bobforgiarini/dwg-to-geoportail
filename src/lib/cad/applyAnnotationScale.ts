import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { CadAnnotationScaleSelection } from './preflightTypes';

type MutableCadEntity = Record<string, unknown> & { type?: string; layer?: string };

function selectedRatio(selection: CadAnnotationScaleSelection | undefined): number | null {
  const selected = selection?.availableScales.find((scale) => scale.id === selection.selectedScaleId);
  return selected && Number.isFinite(selected.ratio) && selected.ratio > 0 ? selected.ratio : null;
}

function textValue(entity: MutableCadEntity): string {
  const direct = entity.textContent ?? entity.text;
  if (typeof direct === 'string') return direct.trim().replace(/\s+/g, ' ');
  if (direct && typeof direct === 'object') {
    const nested = (direct as Record<string, unknown>).text;
    if (typeof nested === 'string') return nested.trim().replace(/\s+/g, ' ');
  }
  return '';
}

function pointKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function mleaderAnchor(entity: MutableCadEntity): string | null {
  const sections = entity.leaderSections;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!section || typeof section !== 'object') continue;
      const lines = (section as Record<string, unknown>).leaderLines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        if (!line || typeof line !== 'object') continue;
        const vertices = (line as Record<string, unknown>).vertices;
        if (Array.isArray(vertices) && vertices.length) {
          const key = pointKey(vertices[0]);
          if (key) return key;
        }
      }
    }
  }
  return pointKey(entity.contentBasePosition) ?? pointKey(entity.textAnchor);
}

function candidateScale(entity: MutableCadEntity): number | null {
  for (const value of [entity.contentScale, entity.annotationScale]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function scaleDistance(candidate: number, requested: number): number {
  return Math.abs(Math.log(candidate) - Math.log(requested));
}

/**
 * Applies the chosen fixed annotation scale to fields the MLightCAD converter
 * understands and removes only provable duplicate MLeader representations.
 * A duplicate is considered provable when text, layer and arrow anchor match
 * and the entities expose distinct positive annotation/content scales.
 */
export function applyAnnotationScaleSelectionToDatabase(
  database: DwgDatabase,
  selection: CadAnnotationScaleSelection | undefined,
): DwgDatabase {
  const ratio = selectedRatio(selection);
  if (ratio == null) return database;

  const collections = [
    database.entities,
    ...(database.tables.BLOCK_RECORD?.entries ?? []).map((entry) => entry.entities ?? []),
  ] as unknown as MutableCadEntity[][];

  for (const entities of collections) {
    for (const entity of entities) {
      if (entity.type === 'ATTRIB' || entity.type === 'ATTDEF') entity.annotationScale = ratio;
      if (entity.type === 'INSERT' && Array.isArray(entity.attribs)) {
        for (const attribute of entity.attribs as MutableCadEntity[]) attribute.annotationScale = ratio;
      }
    }

    const groups = new Map<string, Array<{ entity: MutableCadEntity; index: number; scale: number }>>();
    entities.forEach((entity, index) => {
      if (entity.type !== 'MULTILEADER' && entity.type !== 'MLEADER') return;
      if (entity.annotativeScaleEnabled !== true) return;
      const anchor = mleaderAnchor(entity);
      const text = textValue(entity);
      const scale = candidateScale(entity);
      if (!anchor || !text || scale == null) return;
      const key = `${entity.type}|${entity.layer ?? '0'}|${text}|${anchor}`;
      const group = groups.get(key) ?? [];
      group.push({ entity, index, scale });
      groups.set(key, group);
    });

    const removed = new Set<number>();
    for (const group of groups.values()) {
      if (group.length < 2 || new Set(group.map((candidate) => candidate.scale)).size < 2) continue;
      const selected = [...group].sort((left, right) => (
        scaleDistance(left.scale, ratio) - scaleDistance(right.scale, ratio)
        || left.index - right.index
      ))[0];
      for (const candidate of group) {
        if (candidate !== selected) removed.add(candidate.index);
      }
    }
    if (removed.size) {
      const retained = entities.filter((_, index) => !removed.has(index));
      entities.splice(0, entities.length, ...retained);
    }
  }
  return database;
}
