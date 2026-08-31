import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchLibreDwgInitialMemory, relocateMlightLibreDwgApiImports } from '../../build/patchLibreDwgMemory';

describe('patchLibreDwgInitialMemory', () => {
  it('creates a valid lower-memory LibreDWG module without changing the source asset', () => {
    const source = readFileSync(resolve('node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm'));
    const patched = patchLibreDwgInitialMemory(source);

    expect(WebAssembly.validate(Uint8Array.from(source))).toBe(true);
    expect(WebAssembly.validate(Uint8Array.from(patched))).toBe(true);
    expect(patched).not.toEqual(source);
    expect(source.byteLength - patched.byteLength).toBeLessThan(8);
  });

  it('keeps the MLightCAD API and its Emscripten runtime colocated in the release directory', () => {
    const packageRoot = resolve('node_modules/@mlightcad/libredwg-web');
    const apiSource = readFileSync(resolve(packageRoot, 'dist/libredwg-web.js'), 'utf8');
    const relocated = relocateMlightLibreDwgApiImports(apiSource);

    expect(relocated).toContain('from "./libredwg-web.js"');
    expect(relocated).not.toContain('../wasm/libredwg-web.js');
    expect(readFileSync(resolve(packageRoot, 'wasm/libredwg-web.js')).byteLength).toBeGreaterThan(0);
  });
});
