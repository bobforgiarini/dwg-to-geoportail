import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const cadAssetNames = ['dwg-worker.js', 'libredwg-web.js', 'libredwg-web.wasm', 'dwfv-render.wasm'];
const cadAssetDirectory = resolve('node_modules/@flyfish-dev/cad-viewer/dist/wasm');
const mlightCadAssets = new Map([
  ['libredwg-parser-worker.js', resolve('node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js')],
  ['libredwg-web.wasm', resolve('node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm')],
  ['mtext-renderer-worker.js', resolve('node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js')],
]);

function cadWasmAssets() {
  return {
    name: 'dwg-to-geoportail-cad-wasm-assets',
    configureServer(server: { middlewares: { use: (path: string, handler: (request: { url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use('/wasm', (request, response, next) => {
        const assetName = request.url?.replace(/^\//, '').split('?')[0];
        if (!assetName || !cadAssetNames.includes(assetName)) return next();
        const source = resolve(cadAssetDirectory, assetName);
        if (!existsSync(source)) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', extname(assetName) === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8');
        response.end(readFileSync(source));
      });
    },
    closeBundle() {
      const output = resolve('dist/wasm');
      mkdirSync(output, { recursive: true });
      for (const assetName of cadAssetNames) copyFileSync(resolve(cadAssetDirectory, assetName), resolve(output, assetName));
    },
  };
}

function mlightCadWorkerAssets() {
  return {
    name: 'dwg-to-geoportail-mlightcad-worker-assets',
    configureServer(server: { middlewares: { use: (path: string, handler: (request: { method?: string; url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use('/mlightcad-workers', (request, response, next) => {
        const assetName = request.url?.replace(/^\//, '').split('?')[0];
        const source = assetName ? mlightCadAssets.get(assetName) : undefined;
        if (!assetName || !source || !existsSync(source)) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', extname(assetName) === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8');
        response.setHeader('Content-Length', String(readFileSync(source).byteLength));
        response.end(request.method === 'HEAD' ? undefined : readFileSync(source));
      });
    },
    closeBundle() {
      const output = resolve('dist/mlightcad-workers');
      mkdirSync(output, { recursive: true });
      for (const [assetName, source] of mlightCadAssets) copyFileSync(source, resolve(output, assetName));
    },
  };
}

export default defineConfig(({ command }) => ({
  // The Netlify plugin is only needed for production builds. Keeping local Vite
  // development standalone avoids requiring a linked Netlify account.
  plugins: [react(), ...(command === 'build' ? [netlify()] : []), cadWasmAssets(), mlightCadWorkerAssets()],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
