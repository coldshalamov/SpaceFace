// Embedded KTX2 textures straight to the transcoder.
//
// three's GLTFLoader loads every image stored inside a .glb by wrapping its bytes in a Blob, minting an
// object URL, and fetching that URL back before KTX2Loader.parse() ever runs. For release models
// (KHR_texture_basisu with the image in the binary chunk) that round trip moved each texture into the
// browser's blob store and back again: Blob + createObjectURL + fetch were ~0.57 s of main thread over a
// jump to Ceres and 8 s of flight there (2026-09-13 profile, design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md).
//
// GLTFLoader keys its plugins by extension name, so registering this one replaces the built-in
// KHR_texture_basisu handler. It hands the bytes directly to KTX2Loader.parse(); everything else mirrors
// GLTFParser.loadTextureImage and loadImageSource in vendor/addons/loaders/GLTFLoader.js so the resulting
// texture is the same object the stock path produces. Images referenced by URI keep the stock path.
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
} from 'three';
import {
  adoptSharedImageSourceClone,
  claimSharedImageTexture,
  imageSourceKeyAsync,
  sharedImageTextureFor,
  texturePayloadIntact,
} from './imageSourceDedupe.js';

const EXTENSION = 'KHR_texture_basisu';
// Records which userData keys a document's image extras applied, so a dedupe-shared clone can drop
// the first document's extras before stamping its own.
const APPLIED_EXTRAS_KEY = 'spacefaceAppliedImageExtras';

const WEBGL_FILTERS = {
  9728: NearestFilter,
  9729: LinearFilter,
  9984: NearestMipmapNearestFilter,
  9985: LinearMipmapNearestFilter,
  9986: NearestMipmapLinearFilter,
  9987: LinearMipmapLinearFilter,
};

const WEBGL_WRAPPINGS = {
  33071: ClampToEdgeWrapping,
  33648: MirroredRepeatWrapping,
  10497: RepeatWrapping,
};

export class EmbeddedKtx2TexturePlugin {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSION;
  }

  loadTexture(textureIndex) {
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];
    const extension = textureDef.extensions && textureDef.extensions[EXTENSION];
    if (!extension) return null;

    const loader = parser.options.ktx2Loader;
    if (!loader) {
      if (json.extensionsRequired && json.extensionsRequired.indexOf(EXTENSION) >= 0) {
        throw new Error('THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures');
      }
      // Assumes the extension is optional and a fallback texture is present.
      return null;
    }

    const sourceDef = json.images[extension.source];
    if (!sourceDef || sourceDef.bufferView === undefined || typeof loader.parse !== 'function') {
      return parser.loadTextureImage(textureIndex, extension.source, loader);
    }

    const cacheKey = `${sourceDef.uri || sourceDef.bufferView}:${textureDef.sampler}`;
    if (parser.textureCache[cacheKey]) {
      // See https://github.com/mrdoob/three.js/issues/21559.
      return parser.textureCache[cacheKey];
    }

    const promise = loadEmbeddedSource(parser, extension.source, sourceDef, loader).then((texture) => {
      texture.flipY = false;
      texture.name = textureDef.name || sourceDef.name || '';

      const samplers = json.samplers || {};
      const sampler = samplers[textureDef.sampler] || {};
      texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || LinearFilter;
      texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || LinearMipmapLinearFilter;
      texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || RepeatWrapping;
      texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || RepeatWrapping;
      texture.generateMipmaps = !texture.isCompressedTexture
        && texture.minFilter !== NearestFilter && texture.minFilter !== LinearFilter;

      parser.associations.set(texture, { textures: textureIndex });
      return texture;
    }).catch(() => null);

    parser.textureCache[cacheKey] = promise;
    return promise;
  }
}

function loadEmbeddedSource(parser, sourceIndex, sourceDef, loader) {
  if (parser.sourceCache[sourceIndex] !== undefined) {
    // The cached texture is a tracked registry user; its clone carries the shared-source key in
    // userData, so re-adopting keeps the per-document refcount honest.
    return parser.sourceCache[sourceIndex].then((texture) => {
      // packageCpuDetach can release this texture's CPU payload after a proven GPU upload while
      // the parse is still in flight; cloning then mints empty mips that crash the next uploader.
      // The package bytes are immutable, so a real re-decode reproduces the same pixels.
      if (!texturePayloadIntact(texture)) return decodeEmbeddedSource(parser, sourceDef, loader);
      return adoptSharedImageSourceClone(texture.clone());
    });
  }

  const promise = decodeEmbeddedSource(parser, sourceDef, loader);
  parser.sourceCache[sourceIndex] = promise;
  return promise;
}

function decodeEmbeddedSource(parser, sourceDef, loader) {
  return transferableSourceBytes(parser, sourceDef.bufferView)
    .then(async (bytes) => {
      // GFX-10 cross-GLB dedupe: Forge bodies embed byte-identical finish/detail atlases, so key on
      // the image bufferView's content (SHA-256 via crypto.subtle + byteLength + mimeType; the
      // digest runs on the platform path, not a JS byte loop). A hit returns a tracked clone
      // sharing the cached THREE.Source — three uploads one copy per Source — while the caller
      // still applies this document's sampler/colorSpace/flipY. On a miss the bytes go to the
      // transcoder as before and the decoded texture claims the entry.
      const view = bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
      const key = await imageSourceKeyAsync(view, bytes.byteLength, sourceDef.mimeType || 'image/ktx2');
      const shared = sharedImageTextureFor(key);
      if (shared) return shared;
      return new Promise((resolve, reject) => {
        loader.parse(bytes, resolve, reject);
      }).then((texture) => claimSharedImageTexture(key, texture));
    })
    .then((texture) => {
      // A dedupe-hit clone deep-copied the first document's userData — including its extras. Clear
      // the keys that document applied before stamping this document's extras and mimeType.
      const priorExtras = texture.userData && texture.userData[APPLIED_EXTRAS_KEY];
      if (Array.isArray(priorExtras)) {
        for (const key of priorExtras) delete texture.userData[key];
      }
      delete texture.userData[APPLIED_EXTRAS_KEY];
      if (sourceDef.extras !== undefined) {
        if (typeof sourceDef.extras === 'object') {
          Object.assign(texture.userData, sourceDef.extras);
          texture.userData[APPLIED_EXTRAS_KEY] = Object.keys(sourceDef.extras);
        } else console.warn(`THREE.GLTFLoader: Ignoring primitive type .extras, ${sourceDef.extras}`);
      }
      texture.userData.mimeType = sourceDef.mimeType || 'image/ktx2';
      return texture;
    })
    .catch((error) => {
      console.error('THREE.GLTFLoader: Couldn\'t load texture', `bufferView ${sourceDef.bufferView}`);
      throw error;
    });
}

// KTX2Loader transfers the buffer it is given to the transcoder worker, so it needs bytes nobody else
// holds. The previous path took the parser's cached bufferView (itself a fresh slice of the GLB body)
// and sliced it again: two main-thread copies of every embedded texture, the second ~0.2 s over 10 s of
// flight streaming on the quiet VM. A plain bufferView (no extension decoding it) is exactly
// body[byteOffset, byteOffset + byteLength), so slicing that range straight off the binary buffer gives
// the transcoder the same bytes with one copy, and the parser's bufferView cache is never touched.
// Extension-decoded bufferViews (e.g. EXT_meshopt_compression) keep the parser path.
function transferableSourceBytes(parser, bufferViewIndex) {
  // A GLB pre-pass worker (glbPrepass.js) may already have sliced this image's bytes off the calling
  // thread — the parked buffer transfers straight to the transcoder with no copy here. Serve it once:
  // a bufferView shared by two image defs falls back to the stock path for the second load rather
  // than handing the transcoder a detached buffer.
  const presliced = parser.preslicedSourceBytes;
  const preslicedBuffer = presliced && presliced.get(bufferViewIndex);
  if (preslicedBuffer !== undefined) {
    presliced.delete(bufferViewIndex);
    return Promise.resolve(preslicedBuffer);
  }
  const bufferViews = parser.json && parser.json.bufferViews;
  const def = bufferViews && bufferViews[bufferViewIndex];
  const plain = embeddedKtx2DirectSliceEnabled && def
    && Number.isInteger(def.buffer) && Number.isInteger(def.byteLength) && def.byteLength >= 0
    && !(def.extensions && Object.keys(def.extensions).length > 0);
  if (!plain) {
    return parser.getDependency('bufferView', bufferViewIndex).then((bufferView) => bufferView.slice(0));
  }
  // With the vendored loader's in-place GLB body (#168), slice the same range straight off the fetched
  // GLB so the body itself is never materialized; ArrayBuffer.prototype.slice clamping is preserved.
  const range = typeof parser.glbBodySliceRange === 'function'
    ? parser.glbBodySliceRange(def.buffer, def.byteOffset || 0, def.byteLength)
    : null;
  if (range) {
    return Promise.resolve(range).then((r) => r.source.slice(r.byteOffset, r.byteOffset + r.byteLength));
  }
  return parser.getDependency('buffer', def.buffer).then((buffer) => {
    const byteOffset = def.byteOffset || 0;
    return buffer.slice(byteOffset, byteOffset + def.byteLength);
  });
}

let embeddedKtx2DirectSliceEnabled = true;
/** Bench/proof toggle: false restores the bufferView-then-copy path. Production default ON. */
export function setEmbeddedKtx2DirectSliceForBench(on) { embeddedKtx2DirectSliceEnabled = on !== false; }

/** Stable callback for GLTFLoader.register(): the loader de-duplicates registrations by identity. */
export function registerEmbeddedKtx2Textures(parser) {
  return new EmbeddedKtx2TexturePlugin(parser);
}
