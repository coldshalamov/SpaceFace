import { EXTMeshoptCompression } from '@gltf-transform/extensions';

export const MAX_RENDER_PACKAGE_FILE_BYTES = 100 * 1024 * 1024;

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
