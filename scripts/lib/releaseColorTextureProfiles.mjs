import { cachedKtx2 } from './cachedKtx2.mjs';

// Reviewed exceptions are keyed by asset and exact texture identity, never by a broad slot.
const PROFILES = Object.freeze({
  wholeship_helios_lark: Object.freeze({
    texture: 'helios_lark_panel_albedo',
    description: 'ETC1S KTX2, mipmapped, quality255, sRGB transfer for helios_lark_panel_albedo; other color textures use UASTC',
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
  await document.transform(cachedKtx2({
    pattern: /^helios_lark_panel_albedo$/,
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
