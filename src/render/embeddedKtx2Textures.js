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

const EXTENSION = 'KHR_texture_basisu';

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
    return parser.sourceCache[sourceIndex].then((texture) => texture.clone());
  }

  const promise = transferableSourceBytes(parser, sourceDef.bufferView)
    .then((bytes) => new Promise((resolve, reject) => {
      loader.parse(bytes, resolve, reject);
    }))
    .then((texture) => {
      if (sourceDef.extras !== undefined) {
        if (typeof sourceDef.extras === 'object') Object.assign(texture.userData, sourceDef.extras);
        else console.warn(`THREE.GLTFLoader: Ignoring primitive type .extras, ${sourceDef.extras}`);
      }
      texture.userData.mimeType = sourceDef.mimeType || 'image/ktx2';
      return texture;
    })
    .catch((error) => {
      console.error('THREE.GLTFLoader: Couldn\'t load texture', `bufferView ${sourceDef.bufferView}`);
      throw error;
    });

  parser.sourceCache[sourceIndex] = promise;
  return promise;
}

// KTX2Loader transfers the buffer it is given to the transcoder worker, so it needs bytes nobody else
// holds. The previous path took the parser's cached bufferView (itself a fresh slice of the GLB body)
// and sliced it again: two main-thread copies of every embedded texture, the second ~0.2 s over 10 s of
// flight streaming on the quiet VM. A plain bufferView (no extension decoding it) is exactly
// body[byteOffset, byteOffset + byteLength), so slicing that range straight off the binary buffer gives
// the transcoder the same bytes with one copy, and the parser's bufferView cache is never touched.
// Extension-decoded bufferViews (e.g. EXT_meshopt_compression) keep the parser path.
function transferableSourceBytes(parser, bufferViewIndex) {
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
