import { normalizeDwgDatabase, type CadLoadProgress } from '@flyfish-dev/cad-viewer';
import { convertCadDocument } from './convertCadDocument';
import type { DwgImportResult } from '../../types/models';
import type { CadLoadDecision, CadLoadProfile, DwgPreflightOptions, DwgPreflightReport } from './preflightTypes';
import { awaitCadRuntimeDisposal } from './runtimeDisposal';
import { MlightDwgPreparationWorkerClient } from '../mlightcad/MlightDwgPreparationWorkerClient';
import { cadFileDescriptor, type CadDwgSource } from './xrefBundle';

export const RECOMMENDED_DWG_BYTES = 10 * 1024 * 1024;
export const DWG_TIMEOUT_MS = 120_000;
export const CAD_PREFLIGHT_WASM_PATH = '/mlightcad-workers/0.3.0';

let activeClient: MlightDwgPreparationWorkerClient | null = null;

const FULL_PROFILE: CadLoadProfile = {
  mode: 'full', hiddenLayerIds: [], hiddenBlockNames: [], hiddenEntityCategories: [],
};

export interface DwgPreparationDecision {
  decision: CadLoadDecision;
  profile?: CadLoadProfile;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}

export interface DwgImportOptions {
  initialProfile?: CadLoadProfile;
  preflight?: DwgPreflightOptions;
  onPreparation?: (report: DwgPreflightReport) => Promise<DwgPreparationDecision>;
  forceFull?: boolean;
  forcePreparation?: boolean;
  xrefFiles?: readonly File[];
  preferredXrefFileIds?: Readonly<Record<string, string>>;
  annotationScaleId?: string | null;
  spatialFilterEnabled?: boolean;
}

export class DwgPreflightError extends Error {
  constructor(cause: unknown) {
    super('DWG_PREFLIGHT_FAILED', { cause });
    this.name = 'DwgPreflightError';
  }
}

export function isDwgPreflightError(error: unknown): error is DwgPreflightError {
  return error instanceof DwgPreflightError || (error instanceof Error && error.message === 'DWG_PREFLIGHT_FAILED');
}

export function cancelDwgImport(): void {
  activeClient?.cancel();
  activeClient?.destroy();
  activeClient = null;
}

export async function importDwg(
  file: File,
  signal: AbortSignal,
  onProgress?: (progress: CadLoadProgress) => void,
  options: DwgImportOptions = {},
): Promise<DwgImportResult> {
  cancelDwgImport();
  await awaitCadRuntimeDisposal();
  if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');
  const client = new MlightDwgPreparationWorkerClient();
  activeClient = client;
  const abort = () => client.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    onProgress?.({ phase: 'read', message: 'Reading local DWG' });
    const data = await file.arrayBuffer();
    if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');
    onProgress?.({ phase: 'worker-start', message: 'Starting adaptive DWG worker' });

    const xrefSources: CadDwgSource[] = [];
    for (const xref of options.xrefFiles ?? []) {
      if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');
      xrefSources.push({ file: cadFileDescriptor(xref), data: await xref.arrayBuffer() });
    }

    let preflight: DwgPreflightReport | null = null;
    let preflightReceived = false;
    let appliedProfile = options.forceFull ? FULL_PROFILE : options.initialProfile ?? FULL_PROFILE;
    let parsed;
    try {
      parsed = await client.execute(data, {
        wasmBaseUrl: CAD_PREFLIGHT_WASM_PATH,
        file: { name: file.name, size: file.size, lastModified: file.lastModified },
        device: options.preflight?.device,
        maxBlockDepth: options.preflight?.maxBlockDepth,
        loadProfile: options.initialProfile,
        forcePreparation: options.forcePreparation,
        forceFull: options.forceFull,
        xrefSources,
        preferredXrefFileIds: options.preferredXrefFileIds
          ? { ...options.preferredXrefFileIds }
          : undefined,
        annotationScaleId: options.annotationScaleId,
        spatialFilterEnabled: options.spatialFilterEnabled,
      }, {
        onPreflight: (report) => {
          preflight = report;
          preflightReceived = true;
          onProgress?.({ phase: 'parse', message: 'DWG preflight complete' });
        },
        onPreparation: options.onPreparation ? async (report) => {
          const selection = await options.onPreparation!(report);
          if (selection.decision === 'filtered') {
            appliedProfile = selection.profile ?? report.recommendedProfile;
          } else if (selection.decision === 'full') appliedProfile = FULL_PROFILE;
          return selection;
        } : undefined,
      }, DWG_TIMEOUT_MS);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (preflightReceived) throw error;
      throw new DwgPreflightError(error);
    }
    if (!parsed.model) throw new DwgPreflightError(new Error('DWG_WORKER_MODEL_MISSING'));
    if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');

    onProgress?.({ phase: 'normalize', message: 'Normalizing filtered DWG model' });
    const document = normalizeDwgDatabase(
      parsed.model,
      file.name,
      parsed.model.header?.ACADVER,
      { keepRaw: true },
    );
    if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');
    const converted = convertCadDocument(document);
    onProgress?.({ phase: 'done', message: 'DWG ready', percent: 100 });
    const finalPreflight = preflight as DwgPreflightReport | null;
    return {
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      ...converted,
      blocks: (finalPreflight?.blocks ?? []).map((block) => ({
        ...block,
        visible: !appliedProfile.hiddenBlockNames.some((name) => name.toLocaleLowerCase('en-US') === block.name.toLocaleLowerCase('en-US')),
      })),
      preflight: finalPreflight,
      warnings: [...new Set([...document.warnings, ...converted.warnings])],
    };
  } finally {
    signal.removeEventListener('abort', abort);
    client.destroy();
    if (activeClient === client) activeClient = null;
  }
}
