import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const cadAssetNames = ['dwg-worker.js', 'libredwg-web.js', 'libredwg-web.wasm', 'dwfv-render.wasm'];
const cadAssetDirectory = resolve('node_modules/@flyfish-dev/cad-viewer/dist/wasm');

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

export default defineConfig(({ command }) => ({
  // The Netlify plugin is only needed for production builds. Keeping local Vite
  // development standalone avoids requiring a linked Netlify account.
  plugins: [react(), ...(command === 'build' ? [netlify()] : []), cadWasmAssets()],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
