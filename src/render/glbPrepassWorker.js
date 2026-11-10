// Worker for src/render/glbPrepass.js: one render-package GLB per message, so everything the
// main-thread GLTFLoader would otherwise do per bufferView happens here instead — batch meshopt
// decodes (the same vendored WASM decoder, in place inside this worker) and the per-image slice
// that transferableSourceBytes otherwise memcpy's on the calling thread for the KTX2 transcoder.
//
// Protocol: in { id, glb } (the buffer is transferred), out { id, ok: true, glb, decoded, images }
// where glb is the same buffer transferred back, decoded = [[bufferViewIndex, ArrayBuffer]] of
// exactly what the meshopt plugin's own decode would resolve, and images = [[bufferViewIndex,
// ArrayBuffer]] of plain body slices for embedded images. On failure the reply is
// { id, ok: false, error, glb } with glb still transferred back so the caller can run the stock
// parse on it; a reply never leaves the buffer here.
//
// The file is also importable off-worker for tests: prepassGlb is a named export and the listener
// only registers when a worker global exists.
import { MeshoptDecoder } from '../../vendor/addons/libs/meshopt_decoder.module.js';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const MESHOPT_EXTENSION_NAMES = ['EXT_meshopt_compression', 'KHR_meshopt_compression'];

export async function prepassGlb(glb) {
  if (MeshoptDecoder && MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const header = new DataView(glb);
  if (header.byteLength < 20 || header.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('GLB pre-pass requires a GLB container');
  }
  const decoded = [];
  const images = [];
  const jsonLength = header.getUint32(12, true);
  if (header.getUint32(16, true) !== GLB_JSON_CHUNK) throw new Error('GLB pre-pass: first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));

  const binHeader = 20 + jsonLength;
  if (binHeader + 8 > glb.byteLength || header.getUint32(binHeader + 4, true) !== GLB_BIN_CHUNK) {
    return { decoded, images };
  }
  const binOffset = binHeader + 8;
  const bodyBacked = (index) => {
    const def = json.buffers && json.buffers[index];
    return !!def && def.uri === undefined && (!def.type || def.type === 'arraybuffer');
  };
  const inBody = (byteOffset, byteLength) => (
    Number.isInteger(byteOffset) && Number.isInteger(byteLength)
    && byteOffset >= 0 && byteLength >= 0
    && binOffset + byteOffset + byteLength <= glb.byteLength
  );

  const bufferViews = json.bufferViews || [];
  for (let index = 0; index < bufferViews.length; index++) {
    const extensions = bufferViews[index].extensions || {};
    let spec = null;
    for (const name of MESHOPT_EXTENSION_NAMES) {
      if (extensions[name]) { spec = extensions[name]; break; }
    }
    if (!spec || spec.buffer !== 0 || !bodyBacked(0)) continue; // non-body sources keep the stock path
    const byteOffset = spec.byteOffset || 0;
    const byteLength = spec.byteLength || 0;
    if (!inBody(byteOffset, byteLength)) continue;
    const source = new Uint8Array(glb, binOffset + byteOffset, byteLength);
    const target = new Uint8Array(spec.count * spec.byteStride);
    MeshoptDecoder.decodeGltfBuffer(target, spec.count, spec.byteStride, source, spec.mode, spec.filter);
    decoded.push([index, target.buffer]);
  }

  const imageViews = new Set();
  for (const image of json.images || []) {
    if (image && image.uri === undefined && image.bufferView !== undefined) imageViews.add(image.bufferView);
  }
  for (const viewIndex of imageViews) {
    const def = bufferViews[viewIndex];
    if (!def || def.buffer !== 0 || !bodyBacked(0)) continue;
    if (def.extensions && Object.keys(def.extensions).length > 0) continue; // decoded views keep the parser path
    const byteOffset = def.byteOffset || 0;
    const byteLength = def.byteLength || 0;
    if (!inBody(byteOffset, byteLength)) continue;
    images.push([viewIndex, glb.slice(binOffset + byteOffset, binOffset + byteOffset + byteLength)]);
  }
  return { decoded, images };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event) => {
    const data = event.data || {};
    const id = data.id;
    const glb = data.glb;
    Promise.resolve()
      .then(() => prepassGlb(glb))
      .then(({ decoded, images }) => {
        const transfer = [glb];
        for (const entry of decoded) transfer.push(entry[1]);
        for (const entry of images) transfer.push(entry[1]);
        self.postMessage({ id, ok: true, glb, decoded, images }, transfer);
      })
      .catch((error) => {
        const message = String((error && error.message) || error);
        if (glb && glb.byteLength > 0) {
          self.postMessage({ id, ok: false, error: message, glb }, [glb]);
        } else {
          self.postMessage({ id, ok: false, error: message });
        }
      });
  });
}
