import { TextDecoder } from 'node:util';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function parseStrictEmbeddedGlb(input, label = 'GLB') {
  if (!(input instanceof Uint8Array)) throw new TypeError(`${label}: GLB bytes must be a Uint8Array`);
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 12) throw new Error(`${label}: GLB is smaller than the 12-byte header`);
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${label}: bad GLB magic`);
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error(`${label}: canonical assets require GLB version 2`);
  const headerTotal = bytes.readUInt32LE(8);
  if (headerTotal !== bytes.length) {
    throw new Error(`${label}: header total ${headerTotal} does not match physical length ${bytes.length}`);
  }

  let offset = 12;
  let chunkIndex = 0;
  let jsonPayload = null;
  let binary = null;
  let jsonCount = 0;
  let binCount = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) {
      throw new Error(`${label}: truncated chunk header at byte ${offset}`);
    }
    if (offset % 4 !== 0) throw new Error(`${label}: chunk header at byte ${offset} is not 4-byte aligned`);
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    if (chunkLength % 4 !== 0) {
      throw new Error(`${label}: chunk length ${chunkLength} is not 4-byte aligned`);
    }
    const start = offset + 8;
    const end = start + chunkLength;
    if (!Number.isSafeInteger(end) || end > bytes.length) {
      throw new Error(`${label}: chunk ${chunkIndex} declares end ${end} past physical length ${bytes.length}`);
    }
    if (chunkIndex === 0 && chunkType !== CHUNK_JSON) {
      throw new Error(`${label}: first chunk must be JSON`);
    }
    if (chunkType !== CHUNK_JSON && chunkType !== CHUNK_BIN) {
      throw new Error(`${label}: unexpected chunk type 0x${chunkType.toString(16).padStart(8, '0')}; canonical parts require exactly JSON then BIN`);
    }
    const payload = bytes.subarray(start, end);
    if (chunkType === CHUNK_JSON) {
      jsonCount++;
      if (jsonCount > 1) throw new Error(`${label}: duplicate JSON chunk; expected exactly one JSON chunk`);
      jsonPayload = payload;
    } else if (chunkType === CHUNK_BIN) {
      binCount++;
      if (binCount > 1) throw new Error(`${label}: duplicate BIN chunk; expected exactly one BIN chunk`);
      binary = payload;
    }
    offset = end;
    chunkIndex++;
  }
  if (chunkIndex !== 2) {
    throw new Error(`${label}: canonical parts require exactly two chunks: JSON then BIN`);
  }
  if (jsonCount !== 1 || !jsonPayload) throw new Error(`${label}: expected exactly one JSON chunk`);
  if (binCount !== 1 || !binary) throw new Error(`${label}: expected exactly one physical BIN chunk`);

  let jsonEnd = jsonPayload.length;
  while (jsonEnd > 0 && jsonPayload[jsonEnd - 1] === 0x20) jsonEnd--;
  const jsonPadding = jsonPayload.length - jsonEnd;
  if (jsonPadding > 3) {
    throw new Error(`${label}: JSON chunk padding is ${jsonPadding} bytes; alignment padding may be at most 3 bytes`);
  }
  if (jsonEnd === 0 || jsonPayload[jsonEnd - 1] !== 0x7d) {
    throw new Error(`${label}: JSON chunk must contain a root object followed only by 0x20 padding bytes`);
  }

  let json;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(jsonPayload.subarray(0, jsonEnd));
  } catch (error) {
    throw new Error(`${label}: JSON chunk contains invalid UTF-8: ${error.message}`);
  }

  let gltf;
  try {
    gltf = JSON.parse(json);
  } catch (error) {
    throw new Error(`${label}: JSON chunk is malformed: ${error.message}`);
  }
  if (!gltf || typeof gltf !== 'object' || Array.isArray(gltf)) {
    throw new Error(`${label}: JSON chunk root must be an object`);
  }

  if (!Array.isArray(gltf.buffers) || gltf.buffers.length !== 1) {
    throw new Error(`${label}: canonical part must declare exactly one embedded buffer 0`);
  }
  const buffer = gltf.buffers[0];
  if (!buffer || typeof buffer !== 'object' || Array.isArray(buffer)) {
    throw new Error(`${label}: embedded buffer 0 is malformed`);
  }
  if (Object.prototype.hasOwnProperty.call(buffer, 'uri')) {
    throw new Error(`${label}: embedded buffer 0 must not use URI/external storage`);
  }
  if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) {
    throw new Error(`${label}: embedded buffer 0 byteLength must be a nonnegative safe integer`);
  }

  const views = gltf.bufferViews || [];
  if (!Array.isArray(views)) throw new Error(`${label}: bufferViews must be an array`);
  views.forEach((view, index) => {
    if (!view || typeof view !== 'object' || Array.isArray(view)) {
      throw new Error(`${label}: bufferView ${index} is malformed`);
    }
    if (view.buffer !== 0) throw new Error(`${label}: bufferView ${index} must use embedded buffer 0`);
    const byteOffset = view.byteOffset === undefined ? 0 : view.byteOffset;
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) {
      throw new Error(`${label}: bufferView ${index} byteOffset must be a nonnegative integer`);
    }
    if (byteOffset % 4 !== 0) {
      throw new Error(`${label}: bufferView ${index} byteOffset ${byteOffset} must be 4-byte aligned`);
    }
    if (!Number.isSafeInteger(view.byteLength) || view.byteLength <= 0) {
      throw new Error(`${label}: bufferView ${index} byteLength must be a positive integer`);
    }
    const end = byteOffset + view.byteLength;
    if (!Number.isSafeInteger(end)) throw new Error(`${label}: bufferView ${index} range is not a safe integer`);
    if (end > buffer.byteLength) {
      throw new Error(`${label}: bufferView ${index} end ${end} exceeds declared buffer byteLength ${buffer.byteLength}`);
    }
    if (end > binary.length) {
      throw new Error(`${label}: bufferView ${index} end ${end} exceeds physical BIN length ${binary.length}`);
    }
  });

  if (buffer.byteLength > binary.length) {
    throw new Error(`${label}: declared buffer byteLength ${buffer.byteLength} exceeds physical BIN length ${binary.length}`);
  }
  const padding = binary.length - buffer.byteLength;
  if (padding > 3) {
    throw new Error(`${label}: physical BIN length ${binary.length} exceeds declared buffer byteLength ${buffer.byteLength}; legal padding is at most 3 bytes`);
  }
  const invalidPaddingIndex = binary.subarray(buffer.byteLength).findIndex((byte) => byte !== 0x00);
  if (invalidPaddingIndex >= 0) {
    throw new Error(`${label}: BIN padding byte ${buffer.byteLength + invalidPaddingIndex} must be 0x00`);
  }
  return { bytes, gltf, binary };
}
