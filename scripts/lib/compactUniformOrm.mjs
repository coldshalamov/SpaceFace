import { createHash } from 'node:crypto';

// This exact legacy image is a uniform 1024² white ORM map. The 4² replacement uses the same
// release UASTC profile, with mipmaps and linear transfer; all mip levels transcode to identical
// RGBA32, BC3, BC7, ASTC 4x4 and ETC2 values. Keeping both bindings preserves the material path.
const LEGACY_ORM_SHA256 = '3acbf9b454fbfcb76d2f87991cd340dc92c8899ad812a2720632e0f994cc58f3';
const COMPACT_ORM_BASE64 = 'q0tUWCAyMLsNChoKAAAAAAEAAAAEAAAABAAAAAAAAAAAAAAAAQAAAAMAAAACAAAAmAAAACwAAADEAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAaAQAAAAAAABkAAAAAAAAAEAAAAAAAAAABAQAAAAAAABkAAAAAAAAAEAAAAAAAAADoAAAAAAAAABkAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQEAAwMAAAAAAAAAAAAAAAB/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuNTAAACi1L/0gEIEAAPf///8ffO8BAAAAAAAAAAAotS/9IBCBAAD3////H3zvAQAAAAAAAAAAKLUv/SAQgQAA9////x987wEAAAAAAAAAAA==';
const ORM_SLOTS = new Set(['occlusionTexture', 'metallicRoughnessTexture']);

export function compactUniformOrmTextures(document, { preserveKtx2Hashes } = {}) {
  // Sidecars are addressed by their original bytes, so never rewrite a protected payload.
  if (preserveKtx2Hashes?.has(LEGACY_ORM_SHA256)) return 0;
  let compacted = 0;
  const root = document.getRoot();
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (texture.getMimeType() !== 'image/ktx2' || !image || image.byteLength !== 824) continue;
    if (createHash('sha256').update(image).digest('hex') !== LEGACY_ORM_SHA256) continue;
    const usages = texture.getGraph().listParentEdges(texture).filter((edge) => edge.getParent() !== root);
    if (!usages.length || usages.some((edge) => !ORM_SLOTS.has(edge.getName()))) continue;
    texture.setImage(new Uint8Array(Buffer.from(COMPACT_ORM_BASE64, 'base64')));
    texture.setName('spaceface_neutral_orm_4x4');
    compacted++;
  }
  return compacted;
}
