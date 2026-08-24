import { DwgWorkerClient } from '@flyfish-dev/cad-viewer';
import type { CadLoadProgress } from '@flyfish-dev/cad-viewer';
import { convertCadDocument } from './convertCadDocument';
import type { DwgImportResult } from '../../types/models';

export const RECOMMENDED_DWG_BYTES = 10 * 1024 * 1024;
export const DWG_TIMEOUT_MS = 120_000;

let activeClient: DwgWorkerClient | null = null;

export function cancelDwgImport(): void {
  activeClient?.terminate();
  activeClient = null;
}

export async function importDwg(
  file: File,
  signal: AbortSignal,
  onProgress?: (progress: CadLoadProgress) => void,
): Promise<DwgImportResult> {
  cancelDwgImport();
  const client = new DwgWorkerClient();
  activeClient = client;
  const abort = () => client.terminate();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal.aborted) throw new DOMException('Import aborted', 'AbortError');
    const result = await client.load(bytes, { fileName: file.name, buffer: bytes }, {
      fileName: file.name,
      wasmPath: '/wasm/libredwg-web.wasm',
      workerUrl: '/wasm/dwg-worker.js',
      workerTimeoutMs: DWG_TIMEOUT_MS,
      includePaperSpace: false,
      maxInsertDepth: 32,
      keepRaw: false,
      signal,
      onProgress,
    });
    const converted = convertCadDocument(result.document);
    return {
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      ...converted,
      warnings: [...new Set([...result.warnings, ...converted.warnings])],
    };
  } finally {
    signal.removeEventListener('abort', abort);
    client.terminate();
    if (activeClient === client) activeClient = null;
  }
}
