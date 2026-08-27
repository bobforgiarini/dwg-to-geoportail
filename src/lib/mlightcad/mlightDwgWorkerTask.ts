import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type {
  CadAnnotationScaleSelection,
  CadFileDescriptor,
  CadLoadProfile,
  DwgPreflightReport,
} from '../cad/preflightTypes';
import {
  annotationObjectTypes,
  extractRawAnnotationScales,
  selectAnnotationScale,
  type RawAnnotationLibreDwg,
} from '../cad/annotationScale';
import {
  extractDatabaseXrefs,
  resolveCadXrefBundleSequentially,
  type CadDwgSource,
  type DwgExternalReferenceDeclaration,
} from '../cad/xrefBundle';
import { analyzeMlightDwgDatabase, filterMlightDwgDatabase } from './dwgPreparation';
import {
  filterMlightDwgDatabaseToLuxembourg,
  type MlightLuxembourgSpatialFilterResult,
} from './mlightLuxembourgSpatialFilter';
import { normalizeLegacyMLeaderTextEncoding } from './mleaderTextEncoding';
import { mergeMlightXrefDatabase } from './xrefDatabaseMerge';
import type {
  MlightDwgWorkerDecision,
  MlightDwgWorkerStats,
  MlightDwgWorkerStartMessage,
} from './mlightDwgWorkerProtocol';

export interface ParsedMlightDwg {
  database: DwgDatabase;
  stats: MlightDwgWorkerStats;
  annotationScale?: CadAnnotationScaleSelection;
}

export interface MlightDwgWorkerTaskDependencies {
  parse(data: ArrayBuffer, wasmBaseUrl: string): Promise<ParsedMlightDwg>;
  analyze(
    model: DwgDatabase,
    options: Parameters<typeof analyzeMlightDwgDatabase>[1],
  ): DwgPreflightReport;
  filter(model: DwgDatabase, profile: CadLoadProfile): DwgDatabase;
  normalize(model: DwgDatabase, signature: ArrayBuffer): void;
  inspectXrefs(model: DwgDatabase): DwgExternalReferenceDeclaration[];
  mergeXref(
    parent: DwgDatabase,
    declaration: DwgExternalReferenceDeclaration,
    child: DwgDatabase,
  ): DwgDatabase;
  spatialFilter(model: DwgDatabase, enabled: boolean): MlightLuxembourgSpatialFilterResult;
}

export interface MlightDwgWorkerTaskHooks {
  emitPreflight(report: DwgPreflightReport, requiresDecision: boolean): void;
  waitForDecision(): Promise<MlightDwgWorkerDecision>;
}

const FULL_PROFILE: CadLoadProfile = {
  mode: 'full',
  hiddenLayerIds: [],
  hiddenBlockNames: [],
  hiddenEntityCategories: [],
};

async function parseWithLibreDwg(
  data: ArrayBuffer,
  wasmBaseUrl: string,
): Promise<ParsedMlightDwg> {
  // The version-matched public API bundle is served beside the patched WASM.
  // Keeping this runtime import out of Vite's worker graph prevents Vite from
  // emitting and accidentally making available the upstream 1-GiB-initial
  // WASM as an additional, unpatched asset.
  const apiUrl = `${wasmBaseUrl}/libredwg-web-api.js`;
  const api = await import(/* @vite-ignore */ apiUrl) as typeof import('@mlightcad/libredwg-web');
  const libredwg = await api.LibreDwg.create(wasmBaseUrl);
  if (!libredwg) throw new Error('libredwg is not loaded');

  const pointer = libredwg.dwg_read_data(data, api.Dwg_File_Type.DWG);
  if (pointer == null) throw new Error('Failed to read DWG data');

  try {
    let annotationScale: CadAnnotationScaleSelection | undefined;
    try {
      annotationScale = extractRawAnnotationScales(
        libredwg as unknown as RawAnnotationLibreDwg,
        pointer,
        annotationObjectTypes(api.Dwg_Object_Type as unknown as Record<string, number | string>),
      );
    } catch {
      // Raw extension data differs between DWG generations. Conversion itself
      // must remain available when annotation metadata cannot be decoded.
      annotationScale = {
        mode: 'saved', savedScaleId: null, selectedScaleId: null,
        availableScales: [], contextObjectCount: 0, failOpen: true,
      };
    }
    return { ...libredwg.convertEx(pointer), annotationScale };
  } finally {
    libredwg.dwg_free(pointer);
  }
}

const DEFAULT_DEPENDENCIES: MlightDwgWorkerTaskDependencies = {
  parse: parseWithLibreDwg,
  analyze: analyzeMlightDwgDatabase,
  filter: (model, profile) => filterMlightDwgDatabase(model, profile).model,
  normalize: (model, signature) => {
    normalizeLegacyMLeaderTextEncoding(model, signature);
  },
  inspectXrefs: extractDatabaseXrefs,
  mergeXref: mergeMlightXrefDatabase,
  spatialFilter: (model, enabled) => filterMlightDwgDatabaseToLuxembourg(model, { enabled }),
};

function requestRootDescriptor(request: MlightDwgWorkerStartMessage): CadFileDescriptor {
  const file = request.options.file;
  const name = file?.name ?? 'drawing.dwg';
  const size = file?.size ?? request.data.byteLength;
  const lastModified = file?.lastModified ?? 0;
  return {
    id: `root:${name}:${size}:${lastModified}`,
    name,
    size,
    lastModified,
  };
}

function spatialReportWithState(
  candidate: MlightLuxembourgSpatialFilterResult,
  enabled: boolean,
): MlightLuxembourgSpatialFilterResult['report'] {
  if (enabled) return candidate.report;
  return {
    ...candidate.report,
    enabled: false,
    retainedRootEntityCount: candidate.report.retainedRootEntityCount
      + candidate.report.removedRootEntityCount,
  };
}

/**
 * Performs every memory-heavy parser/preflight/filter operation in the module
 * worker. The returned database is the first large value allowed to cross the
 * worker boundary, and it has already been reduced by the selected profile.
 */
export async function runMlightDwgWorkerTask(
  request: MlightDwgWorkerStartMessage,
  hooks: MlightDwgWorkerTaskHooks,
  dependencies: Partial<MlightDwgWorkerTaskDependencies> = {},
): Promise<ParsedMlightDwg> {
  const runtime: MlightDwgWorkerTaskDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const rootSource: CadDwgSource = { file: requestRootDescriptor(request), data: request.data };
  let parsedRoot: ParsedMlightDwg | null = null;
  const resolution = await resolveCadXrefBundleSequentially<ParsedMlightDwg>({
    root: rootSource,
    xrefs: request.options.xrefSources ?? [],
    preferredFileIds: request.options.preferredXrefFileIds,
    parse: async (source) => {
      const parsed = source === rootSource && parsedRoot
        ? parsedRoot
        : await runtime.parse(source.data, request.options.wasmBaseUrl);
      runtime.normalize(parsed.database, source.data.slice(0, 6));
      if (source === rootSource) parsedRoot = parsed;
      return parsed;
    },
    inspect: (parsed) => runtime.inspectXrefs(parsed.database),
    merge: (parent, declaration, child) => ({
      database: runtime.mergeXref(parent.database, declaration, child.database),
      annotationScale: parent.annotationScale,
      stats: {
        ...parent.stats,
        unknownEntityCount: parent.stats.unknownEntityCount + child.stats.unknownEntityCount,
      },
    }),
  });
  const resolved = resolution.root.model;
  let annotationScale = resolved.annotationScale
    ? selectAnnotationScale(resolved.annotationScale, request.options.annotationScaleId)
    : undefined;
  const spatialCandidate = runtime.spatialFilter(resolved.database, true);
  let spatialFilterEnabled = request.options.spatialFilterEnabled !== false;
  const initialModel = spatialFilterEnabled ? spatialCandidate.model : resolved.database;
  const initialSpatialReport = spatialReportWithState(spatialCandidate, spatialFilterEnabled);

  let report: DwgPreflightReport | null = null;
  try {
    report = runtime.analyze(initialModel, {
      file: request.options.file,
      device: request.options.device,
      maxBlockDepth: request.options.maxBlockDepth,
      unknownEntityCount: resolved.stats.unknownEntityCount,
      annotationScale,
      externalReferences: resolution.references,
      spatialFilter: initialSpatialReport,
    });
  } catch (error) {
    if (!request.options.forceFull) throw error;
  }

  let profile = request.options.forceFull
    ? FULL_PROFILE
    : request.options.loadProfile;

  if (report) {
    const hasReusableFilteredProfile = profile?.mode === 'filtered';
    const needsLocalXrefChoice = resolution.references.some((reference) => (
      reference.status === 'missing' || reference.status === 'ambiguous'
    ));
    const requiresDecision = !request.options.forceFull
      && !hasReusableFilteredProfile
      && request.options.canPrepare
      && (report.risk.shouldPrepare || request.options.forcePreparation === true || needsLocalXrefChoice);

    // This compact report always precedes the large filtered database message.
    hooks.emitPreflight(report, requiresDecision);

    if (requiresDecision) {
      const decision = await hooks.waitForDecision();
      profile = decision.decision === 'filtered'
        ? decision.profile ?? report.recommendedProfile
        : FULL_PROFILE;
      spatialFilterEnabled = decision.spatialFilterEnabled ?? spatialFilterEnabled;
      if (resolved.annotationScale) {
        annotationScale = selectAnnotationScale(
          resolved.annotationScale,
          decision.annotationScaleId ?? annotationScale?.selectedScaleId,
        );
      }
    }
  }

  const spatialReport = spatialReportWithState(spatialCandidate, spatialFilterEnabled);
  const spatialModel = spatialFilterEnabled ? spatialCandidate.model : resolved.database;
  return {
    database: runtime.filter(spatialModel, profile ?? FULL_PROFILE),
    annotationScale,
    stats: {
      ...resolved.stats,
      annotationScale,
      externalReferenceCount: resolution.references.length,
      spatialFilter: spatialReport,
    },
  };
}
