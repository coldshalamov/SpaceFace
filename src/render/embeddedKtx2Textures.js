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

  const promise = parser.getDependency('bufferView', sourceDef.bufferView)
    .then((bufferView) => new Promise((resolve, reject) => {
      // KTX2Loader transfers its buffer to the transcoder worker, and the parser caches this bufferView,
      // so hand over a copy and keep the cached bytes intact. The stock path copied them into a Blob.
      loader.parse(bufferView.slice(0), resolve, reject);
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

/** Stable callback for GLTFLoader.register(): the loader de-duplicates registrations by identity. */
export function registerEmbeddedKtx2Textures(parser) {
  return new EmbeddedKtx2TexturePlugin(parser);
}
