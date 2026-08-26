const WASM_HEADER_BYTES = 8;
const MEMORY_SECTION_ID = 5;

export function relocateMlightLibreDwgApiImports(source: string): string {
  const relocated = source.replaceAll('../wasm/libredwg-web.js', './libredwg-web.js');
  if (relocated === source) throw new Error('MLightCAD LibreDWG API runtime import was not found');
  return relocated;
}

interface VarUint {
  value: number;
  next: number;
}

function readVarUint(bytes: Uint8Array, offset: number): VarUint {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: cursor };
    shift += 7;
    if (shift > 35) break;
  }
  throw new Error('Invalid WASM unsigned LEB128 value');
}

function writeVarUint(value: number): number[] {
  const encoded: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    encoded.push(byte);
  } while (remaining !== 0);
  return encoded;
}

function replaceMemorySection(payload: Uint8Array, requestedPages: number): Uint8Array {
  const count = readVarUint(payload, 0);
  if (count.value === 0) throw new Error('LibreDWG WASM has no linear memory');

  const output: number[] = [...writeVarUint(count.value)];
  let cursor = count.next;
  for (let index = 0; index < count.value; index += 1) {
    const flags = readVarUint(payload, cursor);
    cursor = flags.next;
    const minimum = readVarUint(payload, cursor);
    cursor = minimum.next;
    const hasMaximum = (flags.value & 0x01) !== 0;
    const maximum = hasMaximum ? readVarUint(payload, cursor) : null;
    if (maximum) cursor = maximum.next;

    // memory64 uses 64-bit limits. The shipped LibreDWG modules are wasm32;
    // failing explicitly keeps a future upstream change from producing a
    // silently corrupted build artifact.
    if ((flags.value & 0x04) !== 0) throw new Error('memory64 LibreDWG modules are not supported');
    const safeMinimum = Math.max(1, Math.min(minimum.value, requestedPages));
    output.push(...writeVarUint(flags.value), ...writeVarUint(safeMinimum));
    if (maximum) output.push(...writeVarUint(maximum.value));
  }
  if (cursor !== payload.length) output.push(...payload.slice(cursor));
  return Uint8Array.from(output);
}

/**
 * Lowers only the declared initial WebAssembly memory. The upstream module is
 * already compiled with ALLOW_MEMORY_GROWTH and retains its original maximum.
 * Static data remains far below 128 MiB; WebAssembly validation and a worker
 * readiness check guard the generated asset during tests/builds.
 */
export function patchLibreDwgInitialMemory(source: Uint8Array, initialPages = 2_048): Uint8Array {
  if (source.length < WASM_HEADER_BYTES
    || source[0] !== 0x00 || source[1] !== 0x61 || source[2] !== 0x73 || source[3] !== 0x6d) {
    throw new Error('Invalid WASM module');
  }

  const chunks: Uint8Array[] = [source.slice(0, WASM_HEADER_BYTES)];
  let outputLength = WASM_HEADER_BYTES;
  let cursor = WASM_HEADER_BYTES;
  let patched = false;
  while (cursor < source.length) {
    const sectionId = source[cursor++];
    const sectionLength = readVarUint(source, cursor);
    const payloadStart = sectionLength.next;
    const payloadEnd = payloadStart + sectionLength.value;
    if (payloadEnd > source.length) throw new Error('Invalid WASM section length');
    const payload = source.slice(payloadStart, payloadEnd);
    const nextPayload = sectionId === MEMORY_SECTION_ID
      ? replaceMemorySection(payload, initialPages)
      : payload;
    if (sectionId === MEMORY_SECTION_ID) patched = true;
    const header = Uint8Array.from([sectionId, ...writeVarUint(nextPayload.length)]);
    chunks.push(header, nextPayload);
    outputLength += header.length + nextPayload.length;
    cursor = payloadEnd;
  }
  if (!patched) throw new Error('LibreDWG WASM memory section was not found');
  const output = new Uint8Array(outputLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    output.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return output;
}
