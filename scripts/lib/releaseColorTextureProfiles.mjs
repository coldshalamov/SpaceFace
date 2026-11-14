import { cachedKtx2 } from './cachedKtx2.mjs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Reviewed exceptions are keyed by asset and exact texture identity, never by a broad slot.
const PROFILES = Object.freeze({
  wholeship_helios_lark: Object.freeze({
    texture: 'helios_lark_panel_albedo',
    description: 'ETC1S KTX2, mipmapped, quality255, sRGB transfer for helios_lark_panel_albedo; other color textures use UASTC',
  }),
  cockpit_dome: Object.freeze({
    texture: 'cockpit_dome_trim_sheet_1k',
    sourceSha256: 'b2f8289a6dd761565d2263b65d27a8d32cc236baadf44d3227770670002461e0',
    resize: 256,
    description: 'Reviewed cockpit trim albedo resized to 256px, ETC1S KTX2, mipmapped, quality255, sRGB transfer; full-resolution source retained',
  }),
});

export async function applyReleaseColorTextureProfile(document, assetId, imageDecoder) {
  const profile = PROFILES[assetId];
  if (!profile) return null;
  const matches = document.getRoot().listTextures().filter(t => t.getName() === profile.texture);
  if (matches.length > 1) throw new Error(`${assetId}: ambiguous duplicate texture name ${profile.texture}`);
  const texture = matches[0];
  // Older source revisions can still use the shared Forge tile and retain the default profile.
  if (!texture) return null;
  const slots = texture.getGraph().listParentEdges(texture)
    .filter(edge => edge.getParent() !== document.getRoot()).map(edge => edge.getName());
  if (!slots.length || slots.some(slot => slot !== 'baseColorTexture')) {
    throw new Error(`${assetId}: ${profile.texture} must be a base-color-only texture`);
  }
  if (profile.sourceSha256) {
    const image = texture.getImage();
    const sha256 = image && createHash('sha256').update(image).digest('hex');
    // A later authored sheet should keep the default full-resolution profile until reviewed.
    if (sha256 !== profile.sourceSha256) return null;
    const resized = await sharp(image).resize(profile.resize, profile.resize, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha().png().toBuffer();
    texture.setImage(resized).setMimeType('image/png');
  }
  const escapedName = profile.texture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await document.transform(cachedKtx2({
    pattern: new RegExp(`^${escapedName}$`),
    slots: /^baseColorTexture$/,
    imageDecoder,
    isUASTC: false,
    qualityLevel: 255,
    compressionLevel: 2,
    generateMipmap: true,
    needSupercompression: false,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
  }));
  return { baseColorTexture: profile.description };
}

export function hasReleaseColorTextureProfile(assetId) {
  return Object.hasOwn(PROFILES, assetId);
}
