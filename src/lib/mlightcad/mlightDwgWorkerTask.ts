import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { CadLoadProfile, DwgPreflightReport } from '../cad/preflightTypes';
import { analyzeMlightDwgDatabase, filterMlightDwgDatabase } from './dwgPreparation';
import { normalizeLegacyMLeaderTextEncoding } from './mleaderTextEncoding';
import type {
  MlightDwgWorkerDecision,
  MlightDwgWorkerStartMessage,
} from './mlightDwgWorkerProtocol';

export interface ParsedMlightDwg {
  database: DwgDatabase;
  stats: { unknownEntityCount: number };
}

export interface MlightDwgWorkerTaskDependencies {
  parse(data: ArrayBuffer, wasmBaseUrl: string): Promise<ParsedMlightDwg>;
  analyze(
    model: DwgDatabase,
    options: Parameters<typeof analyzeMlightDwgDatabase>[1],
  ): DwgPreflightReport;
  filter(model: DwgDatabase, profile: CadLoadProfile): DwgDatabase;
  normalize(model: DwgDatabase, signature: ArrayBuffer): void;
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
    return libredwg.convertEx(pointer);
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
};

/**
 * Performs every memory-heavy parser/preflight/filter operation in the module
 * worker. The returned database is the first large value allowed to cross the
 * worker boundary, and it has already been reduced by the selected profile.
 */
export async function runMlightDwgWorkerTask(
  request: MlightDwgWorkerStartMessage,
  hooks: MlightDwgWorkerTaskHooks,
  dependencies: MlightDwgWorkerTaskDependencies = DEFAULT_DEPENDENCIES,
): Promise<ParsedMlightDwg> {
  const signature = request.data.slice(0, 6);
  const parsed = await dependencies.parse(request.data, request.options.wasmBaseUrl);
  dependencies.normalize(parsed.database, signature);

  let report: DwgPreflightReport | null = null;
  try {
    report = dependencies.analyze(parsed.database, {
      file: request.options.file,
      device: request.options.device,
      maxBlockDepth: request.options.maxBlockDepth,
      unknownEntityCount: parsed.stats.unknownEntityCount,
    });
  } catch (error) {
    if (!request.options.forceFull) throw error;
  }

  let profile = request.options.forceFull
    ? FULL_PROFILE
    : request.options.loadProfile;

  if (report) {
    const hasReusableFilteredProfile = profile?.mode === 'filtered';
    const requiresDecision = !request.options.forceFull
      && !hasReusableFilteredProfile
      && request.options.canPrepare
      && (report.risk.shouldPrepare || request.options.forcePreparation === true);

    // This compact report always precedes the large filtered database message.
    hooks.emitPreflight(report, requiresDecision);

    if (requiresDecision) {
      const decision = await hooks.waitForDecision();
      profile = decision.decision === 'filtered'
        ? decision.profile ?? report.recommendedProfile
        : FULL_PROFILE;
    }
  }

  return {
    database: dependencies.filter(parsed.database, profile ?? FULL_PROFILE),
    stats: parsed.stats,
  };
}
