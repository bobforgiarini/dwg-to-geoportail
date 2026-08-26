import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import {
  type AcDbParsingTaskResult,
} from '@mlightcad/data-model';
import type { CadLoadProfile, DwgPreflightOptions, DwgPreflightReport } from '../cad/preflightTypes';
import { MlightDwgPreparationWorkerClient } from './MlightDwgPreparationWorkerClient';
import type { MlightCadPreparationResult } from './types';

const MLIGHTCAD_WASM_BASE_URL = '/mlightcad-workers/0.3.0';

export interface CancellableLibreDwgPreparation {
  file?: DwgPreflightOptions['file'];
  device?: DwgPreflightOptions['device'];
  maxBlockDepth?: DwgPreflightOptions['maxBlockDepth'];
  loadProfile?: CadLoadProfile;
  onPreflight?: (report: DwgPreflightReport) => void;
  onPreparation?: (report: DwgPreflightReport) => Promise<MlightCadPreparationResult>;
  forcePreparation?: boolean;
  forceFull?: boolean;
}

export class MlightCadImportCancelledError extends Error {
  override name = 'AbortError';

  constructor() {
    super('MLIGHTCAD_IMPORT_CANCELLED');
  }
}

/**
 * The upstream converter destroys its worker only after parsing finishes. This
 * small subclass retains the public worker API so a mobile user can abort a
 * long-running local DWG import immediately.
 */
export class CancellableLibreDwgConverter extends AcDbLibreDwgConverter {
  private parserClient: MlightDwgPreparationWorkerClient | null = null;
  private preparation: CancellableLibreDwgPreparation = {};
  private cancelled = false;
  private report: DwgPreflightReport | null = null;

  get preflightReport(): DwgPreflightReport | null {
    return this.report;
  }

  configurePreparation(options: CancellableLibreDwgPreparation): this {
    this.preparation = options;
    this.cancelled = false;
    this.report = null;
    return this;
  }

  cancel(): void {
    this.cancelled = true;
    this.parserClient?.cancel();
    this.parserClient = null;
  }

  protected override async parse(
    data: ArrayBuffer,
    timeout?: number,
  ): Promise<AcDbParsingTaskResult<DwgDatabase>> {
    if (this.cancelled) throw new MlightCadImportCancelledError();

    const client = new MlightDwgPreparationWorkerClient();
    this.parserClient = client;

    try {
      const result = await client.execute(
        data,
        {
          wasmBaseUrl: MLIGHTCAD_WASM_BASE_URL,
          file: this.preparation.file,
          device: this.preparation.device,
          maxBlockDepth: this.preparation.maxBlockDepth,
          loadProfile: this.preparation.loadProfile,
          forcePreparation: this.preparation.forcePreparation,
          forceFull: this.preparation.forceFull,
        },
        {
          onPreflight: (report) => {
            this.report = report;
            this.preparation.onPreflight?.(report);
          },
          onPreparation: this.preparation.onPreparation,
        },
        this.getParserWorkerTimeout(data, timeout),
      );
      if (this.cancelled) throw new MlightCadImportCancelledError();
      return result;
    } finally {
      client.destroy();
      if (this.parserClient === client) this.parserClient = null;
    }
  }
}
