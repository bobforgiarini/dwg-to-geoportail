import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { patchLibreDwgInitialMemory, relocateMlightLibreDwgApiImports } from './build/patchLibreDwgMemory';

const releaseAssetVersion = '0.3.0';
const mlightLibreDwgDirectory = resolve('node_modules/@mlightcad/libredwg-converter/node_modules/@mlightcad/libredwg-web');
const mlightCadAssets = new Map([
  ['libredwg-parser-worker.js', resolve('node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js')],
  ['libredwg-web-api.js', resolve(mlightLibreDwgDirectory, 'dist/libredwg-web.js')],
  ['libredwg-web.js', resolve(mlightLibreDwgDirectory, 'wasm/libredwg-web.js')],
  ['libredwg-web.wasm', resolve('node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm')],
  ['mtext-renderer-worker.js', resolve('node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js')],
]);

function readCadAsset(source: string, assetName: string): Uint8Array {
  if (assetName === 'libredwg-web-api.js') {
    // The package bundle expects its Emscripten runtime in ../wasm. The
    // versioned Netlify asset directory is intentionally flat, so keep the
    // import colocated and cache-safe without changing package code in place.
    return new TextEncoder().encode(
      relocateMlightLibreDwgApiImports(readFileSync(source, 'utf8')),
    );
  }
  const bytes = readFileSync(source);
  return assetName === 'libredwg-web.wasm'
    ? patchLibreDwgInitialMemory(bytes)
    : bytes;
}

function mlightCadWorkerAssets() {
  return {
    name: 'dwg-to-geoportail-mlightcad-worker-assets',
    configureServer(server: { middlewares: { use: (path: string, handler: (request: { method?: string; url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use(`/mlightcad-workers/${releaseAssetVersion}`, (request, response, next) => {
        const assetName = request.url?.replace(/^\//, '').split('?')[0];
        const source = assetName ? mlightCadAssets.get(assetName) : undefined;
        if (!assetName || !source || !existsSync(source)) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', extname(assetName) === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8');
        const bytes = readCadAsset(source, assetName);
        response.setHeader('Content-Length', String(bytes.byteLength));
        response.end(request.method === 'HEAD' ? undefined : bytes);
      });
    },
    closeBundle() {
      const output = resolve(`dist/mlightcad-workers/${releaseAssetVersion}`);
      mkdirSync(output, { recursive: true });
      for (const [assetName, source] of mlightCadAssets) {
        if (assetName === 'libredwg-web.wasm' || assetName === 'libredwg-web-api.js') {
          writeFileSync(resolve(output, assetName), readCadAsset(source, assetName));
        }
        else copyFileSync(source, resolve(output, assetName));
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  // The Netlify plugin is only needed for production builds. Keeping local Vite
  // development standalone avoids requiring a linked Netlify account.
  plugins: [react(), ...(command === 'build' ? [netlify()] : []), mlightCadWorkerAssets()],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
