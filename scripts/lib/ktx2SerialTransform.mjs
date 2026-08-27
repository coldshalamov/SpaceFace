import { KHRTextureBasisu } from '@gltf-transform/extensions';

const encoderEntry = import.meta.resolve('ktx2-encoder');
const [basisModule, enumModule, inputOptionsModule] = await Promise.all([
  import(new URL('../basis/basis_encoder.js', encoderEntry)),
  import(new URL('../enum.js', encoderEntry)),
  import(new URL('../applyInputOptions.js', encoderEntry)),
]);

const BASIS = basisModule.default;
const { HDRSourceType, SourceType } = enumModule;
const { applyInputOptions } = inputOptionsModule;

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LDR_OUTPUT_FLOOR_BYTES = 10 * 1024 * 1024;
const HDR_OUTPUT_FLOOR_BYTES = 24 * 1024 * 1024;
let basisPromise = null;

function initBasis() {
  if (!basisPromise) {
    basisPromise = BASIS().then((basis) => {
      basis.initializeBasis();
      return basis;
    });
  }
  return basisPromise;
}

function listTextureSlots(texture, root) {
  return Array.from(new Set(texture
    .getGraph()
    .listParentEdges(texture)
    .filter((edge) => edge.getParent() !== root)
    .map((edge) => edge.getName())));
}

function matches(pattern, value) {
  if (!pattern) return true;
  pattern.lastIndex = 0;
  return pattern.test(value);
}

async function encodeToKtx2(imageOrImages, options) {
  if (typeof options.imageDecoder !== 'function') {
    throw new Error('imageDecoder is required in Node.js');
  }

  const basis = await initBasis();
  const encoder = new basis.BasisEncoder();
  try {
    applyInputOptions(options, encoder);
    const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
    let decodedTexels = 0;

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      if (options.isHDR) {
        encoder.setSliceSourceImageHDR(
          index,
          image,
          0,
          0,
          options.imageType === 'hdr' ? HDRSourceType.HDR : HDRSourceType.EXR,
          true,
        );
        continue;
      }

      const decoded = await options.imageDecoder(image);
      if (!decoded?.data || !Number.isInteger(decoded.width) || !Number.isInteger(decoded.height)) {
        throw new Error('imageDecoder returned invalid image data');
      }
      decodedTexels += decoded.width * decoded.height;
      encoder.setSliceSourceImage(
        index,
        new Uint8Array(decoded.data),
        decoded.width,
        decoded.height,
        SourceType.RAW,
      );
    }

    // UASTC uses one byte per source texel before supercompression. A complete mip chain is
    // at most 4/3 of the base level; two bytes per texel leaves container and alignment headroom.
    // The upstream helper's fixed 10 MiB buffer rejects valid high-entropy 4096px maps.
    const outputCapacity = options.isHDR
      ? HDR_OUTPUT_FLOOR_BYTES
      : Math.max(LDR_OUTPUT_FLOOR_BYTES, Math.ceil(decodedTexels * 2));
    const output = new Uint8Array(outputCapacity);
    const outputSize = encoder.encode(output);
    if (outputSize === 0) {
      throw new Error(`BasisU encode failed with ${outputCapacity} output bytes available`);
    }
    return Buffer.from(output.subarray(0, outputSize));
  } finally {
    encoder.delete();
  }
}

export function ktx2Serial(options = {}) {
  const pattern = options.pattern;
  const slotsPattern = options.slots;

  return async function ktx2SerialTransform(document) {
    const root = document.getRoot();
    const logger = document.getLogger();
    let converted = false;

    for (const [index, texture] of root.listTextures().entries()) {
      const label = texture.getURI() || texture.getName() || `${index + 1}/${root.listTextures().length}`;
      const prefix = `ktx2Serial(${label})`;
      const mimeType = texture.getMimeType();
      if (mimeType === 'image/ktx2') continue;
      if (!SUPPORTED_MIME_TYPES.has(mimeType)) continue;
      if (pattern && !matches(pattern, texture.getName()) && !matches(pattern, texture.getURI())) continue;

      const slots = listTextureSlots(texture, root);
      if (slotsPattern && slots.length && !slots.some((slot) => matches(slotsPattern, slot))) continue;

      const image = texture.getImage();
      if (!image) throw new Error(`${prefix}: texture has no image data`);
      const encoded = await encodeToKtx2(image, options);
      texture.setImage(encoded);
      texture.setMimeType('image/ktx2');
      converted = true;
      logger.debug(`${prefix}: ${image.byteLength} -> ${encoded.byteLength} bytes`);
    }

    if (converted) document.createExtension(KHRTextureBasisu).setRequired(true);
  };
}
