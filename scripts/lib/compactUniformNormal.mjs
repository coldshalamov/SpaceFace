import { createHash } from 'node:crypto';

// The eight legacy modular parts share this exact 1024², mipmapped UASTC image. Its source is
// uniformly (128, 128, 255, 255); the 4² image below is encoded from the same pixels with the
// same release normal-map profile. Every mip transcodes to the identical constant RGBA32, BC3,
// BC7, ASTC 4x4 and ETC2 blocks. Keeping a normal binding preserves the existing material path.
// Re-encode a solid 4x4 RGBA image with ktx2-encoder: UASTC quality 2, mipmaps and zstd on,
// normal-map mode on, perceptual and sRGB-transfer flags off. package-lock pins the encoder.
// Its bytes also match the fin-wedge placeholder, allowing the live image-source cache to share it.
const LEGACY_NORMAL_SHA256 = 'd807ff9d413cdf8c3b4b2a1bbe28d2002f70a5e7f667bacebb23d132977e4be0';
const COMPACT_NORMAL_BASE64 = 'q0tUWCAyMLsNChoKAAAAAAEAAAAEAAAABAAAAAAAAAAAAAAAAQAAAAMAAAACAAAAmAAAACwAAADEAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAaAQAAAAAAABkAAAAAAAAAEAAAAAAAAAABAQAAAAAAABkAAAAAAAAAEAAAAAAAAADoAAAAAAAAABkAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQEAAwMAAAAAAAAAAAAAAAB/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuNTAAACi1L/0gEIEAABcQ8P+fPOcBAAAAAAAAAAAotS/9IBCBAAAXEPD/nzznAQAAAAAAAAAAKLUv/SAQgQAAFxDw/5885wEAAAAAAAAAAA==';

export function compactUniformNormalTextures(document, { preserveKtx2Hashes } = {}) {
  // Externalized resource manifests address the original payload by hash. Preserve that exact
  // contract when a caller explicitly requests the legacy bytes as a sidecar.
  if (preserveKtx2Hashes?.has(LEGACY_NORMAL_SHA256)) return 0;
  let compacted = 0;
  const root = document.getRoot();
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (texture.getMimeType() !== 'image/ktx2' || !image || image.byteLength !== 824) continue;
    if (createHash('sha256').update(image).digest('hex') !== LEGACY_NORMAL_SHA256) continue;
    const usages = texture.getGraph().listParentEdges(texture)
      .filter((edge) => edge.getParent() !== root);
    // Exact bytes alone are not permission to change a color/emissive or unused texture.
    if (!usages.length || usages.some((edge) => edge.getName() !== 'normalTexture')) continue;
    texture.setImage(new Uint8Array(Buffer.from(COMPACT_NORMAL_BASE64, 'base64')));
    texture.setName('spaceface_neutral_normal_4x4');
    compacted++;
  }
  return compacted;
}
