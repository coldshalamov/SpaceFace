import { createHash } from 'node:crypto';

// This exact 1024² UASTC image is opaque white at every mip. The 4² replacement uses the
// same release color profile and sRGB transfer; all mips transcode to identical RGBA32,
// BC3, BC7, ASTC 4x4 and ETC2 values. Keep the map binding and its sampler unchanged.
const LEGACY_WHITE_ALBEDO_SHA256 = '2c2dead0a956ce7e89a03dd239c3a4fee7819db6b39eed54f519395a8e5e57ca';
const COMPACT_WHITE_ALBEDO_BASE64 = 'q0tUWCAyMLsNChoKAAAAAAEAAAAEAAAABAAAAAAAAAAAAAAAAQAAAAMAAAACAAAAmAAAACwAAADEAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAaAQAAAAAAABkAAAAAAAAAEAAAAAAAAAABAQAAAAAAABkAAAAAAAAAEAAAAAAAAADoAAAAAAAAABkAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQIAAwMAAAAAAAAAAAAAAAB/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuNTAAACi1L/0gEIEAAPf///8ffO8BAAAAAAAAAAAotS/9IBCBAAD3////H3zvAQAAAAAAAAAAKLUv/SAQgQAA9////x987wEAAAAAAAAAAA==';

export function compactUniformWhiteAlbedoTextures(document, { preserveKtx2Hashes } = {}) {
  // A declared external sidecar is addressed by its original bytes, so never rewrite it.
  if (preserveKtx2Hashes?.has(LEGACY_WHITE_ALBEDO_SHA256)) return 0;
  let compacted = 0;
  const root = document.getRoot();
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (texture.getMimeType() !== 'image/ktx2' || !image || image.byteLength !== 824) continue;
    if (createHash('sha256').update(image).digest('hex') !== LEGACY_WHITE_ALBEDO_SHA256) continue;
    const usages = texture.getGraph().listParentEdges(texture).filter((edge) => edge.getParent() !== root);
    // Even identical bytes must not be substituted for data or emissive texture roles.
    if (!usages.length || usages.some((edge) => edge.getName() !== 'baseColorTexture')) continue;
    texture.setImage(new Uint8Array(Buffer.from(COMPACT_WHITE_ALBEDO_BASE64, 'base64')));
    texture.setName('spaceface_neutral_baseColor_4x4');
    compacted++;
  }
  return compacted;
}
