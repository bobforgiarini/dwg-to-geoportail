import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import {
  AcDbOpenDatabaseError,
  acdbCreateWorkerApi,
  type AcDbParsingTaskResult,
  type AcDbWorkerApi,
} from '@mlightcad/data-model';
import { normalizeLegacyMLeaderTextEncoding } from './mleaderTextEncoding';

/**
 * The upstream converter destroys its worker only after parsing finishes. This
 * small subclass retains the public worker API so a mobile user can abort a
 * long-running local DWG import immediately.
 */
export class CancellableLibreDwgConverter extends AcDbLibreDwgConverter {
  private parserApi: AcDbWorkerApi | null = null;

  cancel(): void {
    this.parserApi?.destroy();
    this.parserApi = null;
  }

  protected override async parse(
    data: ArrayBuffer,
    timeout?: number,
  ): Promise<AcDbParsingTaskResult<DwgDatabase>> {
    const workerUrl = this.config.parserWorkerUrl;
    if (!workerUrl) throw new Error('A LibreDWG parser worker URL is required');

    // AcDbWorkerApi transfers the complete ArrayBuffer to its worker, which
    // detaches it in this thread. Preserve only the DWG signature needed by
    // the legacy MLeader normalizer before handing the file to the worker.
    const sourceSignature = data.slice(0, 6);

    const api = acdbCreateWorkerApi({
      workerUrl,
      timeout: this.getParserWorkerTimeout(data, timeout),
      maxConcurrentWorkers: 1,
    });
    this.parserApi = api;

    try {
      const result = await api.execute<ArrayBuffer, AcDbParsingTaskResult<DwgDatabase>>(data);
      AcDbOpenDatabaseError.throwOnWorkerParseFailure(result);
      if (result.data.model) {
        normalizeLegacyMLeaderTextEncoding(result.data.model, sourceSignature);
      }
      return result.data;
    } finally {
      api.destroy();
      if (this.parserApi === api) this.parserApi = null;
    }
  }
}
