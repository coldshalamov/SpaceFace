import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const MAX_RENDER_PACKAGE_FILE_BYTES = 100 * 1024 * 1024;

/** Replace selected embedded KTX2 image bufferViews with content-addressed package-relative URIs. */
export function externalizeRenderPackageKtx2(renderBytes, hashes = null) {
  const bytes = Buffer.from(renderBytes);
  const { json, binary } = readGlbChunks(bytes);
  const views = json.bufferViews || [];
  const resources = new Map();
  const imageCandidates = [];
  for (const [imageIndex, image] of (json.images || []).entries()) {
    if (image?.mimeType !== 'image/ktx2' || !Number.isInteger(image.bufferView)) continue;
    const view = views[image.bufferView];
    if (!view || (view.buffer || 0) !== 0 || view.extensions?.EXT_meshopt_compression) continue;
    const offset = view.byteOffset || 0;
    const length = view.byteLength;
    if (!Number.isSafeInteger(length) || length <= 0 || offset < 0 || offset + length > binary.byteLength) {
      throw new Error(`KTX2 image bufferView ${image.bufferView} is outside the render package binary chunk.`);
    }
    const payload = Buffer.from(binary.subarray(offset, offset + length));
    const sha256 = createHash('sha256').update(payload).digest('hex');
    if (hashes && !hashes.has(sha256)) continue;
    const uri = `../_shared/images/${sha256}.ktx2`;
    imageCandidates.push({ imageIndex, viewIndex: image.bufferView, uri, sha256, bytes: payload });
  }
  if (!imageCandidates.length) return { bytes, resources: [] };

  const candidatesByView = new Map();
  for (const row of imageCandidates) {
    if (!candidatesByView.has(row.viewIndex)) candidatesByView.set(row.viewIndex, []);
    candidatesByView.get(row.viewIndex).push(row);
  }
  const imageReferencesByView = new Map();
  for (const [imageIndex, image] of (json.images || []).entries()) {
    if (!Number.isInteger(image?.bufferView)) continue;
    if (!imageReferencesByView.has(image.bufferView)) imageReferencesByView.set(image.bufferView, new Set());
    imageReferencesByView.get(image.bufferView).add(imageIndex);
  }
  const nonImageViewReferences = new Set();
  const collectNonImageViewReferences = (value, insideImages = false) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) collectNonImageViewReferences(entry, insideImages);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!insideImages && key === 'bufferView' && Number.isInteger(child)) nonImageViewReferences.add(child);
      collectNonImageViewReferences(child, insideImages || key === 'images');
    }
  };
  collectNonImageViewReferences(json);
  const selectedImages = [];
  const exclusiveViewIndices = new Set();
  for (const [viewIndex, rows] of candidatesByView) {
    const imageRefs = imageReferencesByView.get(viewIndex) || new Set();
    if (nonImageViewReferences.has(viewIndex)
        || [...imageRefs].some((imageIndex) => !rows.some((row) => row.imageIndex === imageIndex))) continue;
    exclusiveViewIndices.add(viewIndex);
    selectedImages.push(...rows);
    for (const row of rows) {
      const prior = resources.get(row.uri);
      if (prior && !prior.bytes.equals(row.bytes)) throw new Error(`KTX2 SHA-256 collision at ${row.uri}`);
      if (!prior) resources.set(row.uri, { uri: row.uri, mimeType: 'image/ktx2', sha256: row.sha256, bytes: row.bytes });
    }
  }
  for (const viewIndex of [...exclusiveViewIndices]) {
    const view = views[viewIndex];
    const start = view?.byteOffset || 0;
    const end = start + (view?.byteLength || 0);
    if (views.some((other, otherIndex) => {
      if (otherIndex === viewIndex || (other.buffer || 0) !== (view?.buffer || 0)) return false;
      const otherStart = other.byteOffset || 0;
      return otherStart < end && otherStart + other.byteLength > start;
    })) {
      exclusiveViewIndices.delete(viewIndex);
    }
  }
  for (let index = selectedImages.length - 1; index >= 0; index -= 1) {
    if (!exclusiveViewIndices.has(selectedImages[index].viewIndex)) selectedImages.splice(index, 1);
  }
  resources.clear();
  for (const row of selectedImages) {
    const prior = resources.get(row.uri);
    if (prior && !prior.bytes.equals(row.bytes)) throw new Error(`KTX2 SHA-256 collision at ${row.uri}`);
    if (!prior) resources.set(row.uri, { uri: row.uri, mimeType: 'image/ktx2', sha256: row.sha256, bytes: row.bytes });
  }
  if (!selectedImages.length) return { bytes, resources: [] };

  const imageByIndex = new Map(selectedImages.map((row) => [row.imageIndex, row]));
  for (const [imageIndex, image] of (json.images || []).entries()) {
    const selected = imageByIndex.get(imageIndex);
    if (!selected) continue;
    image.uri = selected.uri;
    delete image.bufferView;
  }

  const removedRanges = [...exclusiveViewIndices]
    .map((index) => {
      const view = views[index];
      const start = view.byteOffset || 0;
      // Remove a four-byte-multiple span even when the source image itself starts at an odd
      // offset, so every retained buffer offset keeps its original alignment.
      return { index, start, end: start + Math.ceil(view.byteLength / 4) * 4 };
    })
    .sort((a, b) => a.start - b.start);
  for (let index = 1; index < removedRanges.length; index += 1) {
    if (removedRanges[index].start < removedRanges[index - 1].end) {
      throw new Error('KTX2 image bufferViews overlap; refusing to rewrite render package binary layout.');
    }
  }
  for (const range of removedRanges) {
    if (range.end > binary.byteLength) {
      throw new Error(`KTX2 image bufferView ${range.index} has no complete GLB alignment padding.`);
    }
    for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
      if (exclusiveViewIndices.has(viewIndex)) continue;
      const view = views[viewIndex];
      if ((view.buffer || 0) !== 0) continue;
      const start = view.byteOffset || 0;
      const end = start + view.byteLength;
      if (start < range.end && end > range.start) {
        throw new Error(`KTX2 image bufferView ${range.index} alignment padding overlaps retained bufferView ${viewIndex}.`);
      }
    }
  }
  const keptBinaryParts = [];
  let cursor = 0;
  for (const range of removedRanges) {
    keptBinaryParts.push(binary.subarray(cursor, range.start));
    cursor = range.end;
  }
  keptBinaryParts.push(binary.subarray(cursor));
  const rewrittenBinary = Buffer.concat(keptBinaryParts);
  const removedBufferViewObjects = new Set([...exclusiveViewIndices].map((index) => views[index]));
  const adjustBufferOffsets = (value, inheritedBuffer = undefined) => {
    if (!value || typeof value !== 'object') return;
    if (removedBufferViewObjects.has(value)) return;
    if (Array.isArray(value)) { for (const entry of value) adjustBufferOffsets(entry, inheritedBuffer); return; }
    const bufferIndex = Number.isInteger(value.buffer) ? value.buffer : inheritedBuffer;
    if (bufferIndex === 0 && Number.isInteger(value.byteOffset)) {
      const start = value.byteOffset;
      const end = start + (Number.isInteger(value.byteLength) ? value.byteLength : 0);
      let removedBefore = 0;
      for (const range of removedRanges) {
        if (range.end <= start) removedBefore += range.end - range.start;
        else if (range.start < end && range.end > start) {
          throw new Error(`KTX2 externalization range ${range.start}-${range.end} overlaps retained buffer data ${start}-${end}.`);
        }
      }
      value.byteOffset = start - removedBefore;
    }
    for (const child of Object.values(value)) adjustBufferOffsets(child, bufferIndex);
  };
  adjustBufferOffsets(json);
  const oldToNew = new Map();
  const newViews = [];
  views.forEach((view, oldIndex) => {
    if (exclusiveViewIndices.has(oldIndex)) return;
    oldToNew.set(oldIndex, newViews.length);
    newViews.push(view);
  });
  const remap = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const entry of value) remap(entry); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'bufferView' && Number.isInteger(child)) {
        if (!oldToNew.has(child)) delete value[key];
        else value[key] = oldToNew.get(child);
      } else remap(child);
    }
  };
  json.bufferViews = newViews;
  remap(json);
  if (json.buffers?.[0]) json.buffers[0].byteLength = rewrittenBinary.byteLength;
  return {
    bytes: writeGlbChunks(json, rewrittenBinary),
    resources: [...resources.values()].sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0),
  };
}

function readGlbChunks(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Cannot externalize KTX2 from an invalid GLB.');
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > bytes.length) throw new Error('Cannot externalize KTX2 from a GLB without a JSON chunk.');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  let cursor = 20 + jsonLength;
  let binary = Buffer.alloc(0);
  if (cursor + 8 <= bytes.length && bytes.readUInt32LE(cursor + 4) === 0x004e4942) {
    const length = bytes.readUInt32LE(cursor);
    if (cursor + 8 + length > bytes.length) throw new Error('Cannot externalize KTX2 from an invalid GLB binary chunk.');
    binary = bytes.subarray(cursor + 8, cursor + 8 + length);
  }
  return { json, binary };
}

function writeGlbChunks(json, binary) {
  const jsonRaw = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc((4 - jsonRaw.length % 4) % 4, 0x20)]);
  const hasBinary = binary.byteLength > 0 || json.buffers?.length;
  const binChunk = hasBinary
    ? Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)])
    : Buffer.alloc(0);
  const totalLength = 12 + 8 + jsonChunk.length + (hasBinary ? 8 + binChunk.length : 0);
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonChunk.length, 12); output.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(output, 20);
  if (hasBinary) {
    const offset = 20 + jsonChunk.length;
    output.writeUInt32LE(binChunk.length, offset); output.writeUInt32LE(0x004e4942, offset + 4); binChunk.copy(output, offset + 8);
  }
  return output;
}

/** Find exact KTX2 payload hashes shared by more than one compiled package GLB. */
export async function collectRepeatedKtx2PayloadHashes(glbPaths) {
  const packagesByHash = new Map();
  for (const [packageIndex, glbPath] of glbPaths.entries()) {
    const bytes = await readFile(glbPath);
    if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
      throw new Error(`Invalid render package GLB while scanning shared KTX2 payloads: ${glbPath}`);
    }
    const jsonLength = bytes.readUInt32LE(12);
    const jsonType = bytes.readUInt32LE(16);
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > bytes.length) {
      throw new Error(`Render package GLB has no valid JSON chunk: ${glbPath}`);
    }
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    let binaryStart = 20 + jsonLength;
    let binaryLength = 0;
    if (binaryStart + 8 <= bytes.length) {
      binaryLength = bytes.readUInt32LE(binaryStart);
      if (bytes.readUInt32LE(binaryStart + 4) === 0x004e4942) binaryStart += 8;
      else binaryLength = 0;
    }
    for (const image of json.images || []) {
      if (image.mimeType !== 'image/ktx2' || !Number.isInteger(image.bufferView)) continue;
      const view = json.bufferViews?.[image.bufferView];
      if (!view || (view.buffer || 0) !== 0 || view.extensions?.EXT_meshopt_compression) continue;
      const offset = view.byteOffset || 0;
      const length = view.byteLength;
      if (!Number.isSafeInteger(length) || length <= 0 || offset < 0 || offset + length > binaryLength) {
        throw new Error(`Render package GLB KTX2 bufferView is out of bounds: ${glbPath}`);
      }
      const sha256 = createHash('sha256').update(bytes.subarray(binaryStart + offset, binaryStart + offset + length)).digest('hex');
      let packages = packagesByHash.get(sha256);
      if (!packages) packagesByHash.set(sha256, packages = new Set());
      packages.add(packageIndex);
    }
  }
  return new Set([...packagesByHash].filter(([, packages]) => packages.size > 1).map(([hash]) => hash));
}

/** Keep ordinary packages unchanged; store oversized baked float normals using the shipping filter. */
export async function encodeRenderPackageGlb(io, document, { maxBytes = MAX_RENDER_PACKAGE_FILE_BYTES } = {}) {
  const original = Buffer.from(await io.writeBinary(document));
  if (original.length <= maxBytes) return original;
  if (document.getRoot().listAnimations().length) {
    throw new Error('Oversized animated render packages require separate storage handling; preserve animation precision.');
  }

  // Baking authored transforms expands normalized normals/tangents into float attributes. The
  // standard release's high-quality Meshopt path uses these same octahedral filters. Selecting its
  // encoder method restores compact storage without rerunning quantization, welding or reordering:
  // positions, UV precision, index topology, draw batches and semantic node markers stay intact.
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.FILTER,
  });
  const compact = Buffer.from(await io.writeBinary(document));
  if (compact.length > maxBytes) {
    throw new Error(`Render package remains above the ${maxBytes}-byte file limit after shipping-filter encoding: ${compact.length} bytes (was ${original.length}).`);
  }
  return compact;
}
