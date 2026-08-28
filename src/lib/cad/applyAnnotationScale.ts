import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { CadAnnotationScaleSelection } from './preflightTypes';

type MutableCadEntity = Record<string, unknown> & { type?: string; layer?: string };

export interface AnnotationScaleLayerName {
  baseName: string;
  factor: number;
}

const SCALE_LAYER_SUFFIX = /^(.*?)\s+@\s*(\d+(?:[.,]\d+)?)(?:\s*\(\d+\))?\s*$/u;

/**
 * Some survey DWGs author one physical layer per plot scale instead of native
 * annotative representations (for example `LABEL @ 1`, `LABEL @ 0.5`).
 * Keep this parser deliberately strict: unrelated layers containing an `@`
 * remain untouched.
 */
export function parseAnnotationScaleLayerName(layerName: string): AnnotationScaleLayerName | null {
  const match = SCALE_LAYER_SUFFIX.exec(layerName);
  if (!match) return null;
  const baseName = match[1].trim();
  const factor = Number(match[2].replace(',', '.'));
  if (!baseName || !Number.isFinite(factor) || factor <= 0) return null;
  return { baseName, factor };
}

function selectedRatio(selection: CadAnnotationScaleSelection | undefined): number | null {
  const selected = selection?.availableScales.find((scale) => scale.id === selection.selectedScaleId);
  return selected && Number.isFinite(selected.ratio) && selected.ratio > 0 ? selected.ratio : null;
}

function canonical(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function approximatelyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-6;
}

function selectedLayerFactors(selection: CadAnnotationScaleSelection | undefined): number[] {
  const selected = selection?.availableScales.find((scale) => scale.id === selection.selectedScaleId);
  if (!selected) return [];
  const factors = [selected.ratio];
  // BEST-style scale names use millimetres in the denominator while the
  // explicitly scaled layer suffix is expressed in metres: 1/500 -> @ 0.5.
  const namedScale = /\b1\s*[:/]\s*(\d+(?:[.,]\d+)?)\b/u.exec(selected.name);
  if (namedScale) {
    const denominator = Number(namedScale[1].replace(',', '.'));
    if (Number.isFinite(denominator) && denominator > 0) factors.push(denominator / 1_000);
  }
  return factors.filter((factor, index, all) => (
    Number.isFinite(factor)
    && factor > 0
    && all.findIndex((candidate) => approximatelyEqual(candidate, factor)) === index
  ));
}

export function annotationScaleLayerNamesToHide(
  database: DwgDatabase,
  selection: CadAnnotationScaleSelection | undefined,
): string[] {
  const requestedFactors = selectedLayerFactors(selection);
  if (!requestedFactors.length) return [];

  const names = new Set<string>();
  for (const layer of database.tables.LAYER?.entries ?? []) {
    if (typeof layer.name === 'string') names.add(layer.name);
  }
  const collections = [
    database.entities,
    ...(database.tables.BLOCK_RECORD?.entries ?? []).map((entry) => entry.entities ?? []),
  ] as unknown as MutableCadEntity[][];
  for (const entities of collections) {
    for (const entity of entities) {
      if (typeof entity.layer === 'string') names.add(entity.layer);
    }
  }

  const families = new Map<string, Array<{ name: string; factor: number }>>();
  for (const name of names) {
    const parsed = parseAnnotationScaleLayerName(name);
    if (!parsed) continue;
    const key = canonical(parsed.baseName);
    const family = families.get(key) ?? [];
    family.push({ name, factor: parsed.factor });
    families.set(key, family);
  }

  const hidden = new Set<string>();
  for (const family of families.values()) {
    const distinctFactors = family.filter((entry, index, all) => (
      all.findIndex((candidate) => approximatelyEqual(candidate.factor, entry.factor)) === index
    ));
    if (distinctFactors.length < 2) continue;
    const selectedFactor = requestedFactors.find((requested) => (
      distinctFactors.some((entry) => approximatelyEqual(entry.factor, requested))
    ));
    // If this family has no representation for the requested scale, retain it
    // unchanged. Guessing would hide valid drawing content.
    if (selectedFactor == null) continue;
    for (const entry of family) {
      if (!approximatelyEqual(entry.factor, selectedFactor)) hidden.add(entry.name);
    }
  }
  return [...hidden].sort((left, right) => left.localeCompare(right));
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
