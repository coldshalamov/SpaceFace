import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { cachedKtx2 } from './cachedKtx2.mjs';

// The authored albedo and material-data maps share a name, so select by both
// image digest and role. A later sheet keeps the general release profile.
const SHEETS = Object.freeze([
  Object.freeze({
    slot: 'baseColorTexture',
    sha256: '1eaf306d7b585046090522702ba96406d40947a23daebf64b53d43bfab08fba1',
    srgb: true,
  }),
  Object.freeze({
    slot: 'metallicRoughnessTexture',
    sha256: '7577cceffe0df1d50aa411efc228624710537163ec3026aa3109b1817e81e433',
    srgb: false,
  }),
]);

export async function applyReleaseCockpitRecessedTextureProfiles(document, assetId, imageDecoder) {
  if (assetId !== 'cockpit_recessed') return null;
  const root = document.getRoot(), result = {};
  for (const sheet of SHEETS) {
    const matches = root.listTextures().filter((texture) => {
      const image = texture.getImage();
      return texture.getName() === 'cockpit_recessed_wear_mask_1k' && image
        && createHash('sha256').update(image).digest('hex') === sheet.sha256;
    });
    if (matches.length > 1) throw new Error(`cockpit_recessed: ambiguous reviewed ${sheet.slot}`);
    const texture = matches[0];
    if (!texture) continue;
    const slots = texture.getGraph().listParentEdges(texture)
      .filter((edge) => edge.getParent() !== root).map((edge) => edge.getName());
    if (!slots.length || slots.some((slot) => slot !== sheet.slot)) {
      throw new Error(`cockpit_recessed: reviewed ${sheet.slot} is used in an incompatible slot`);
    }
    const resized = await sharp(texture.getImage()).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha().png().toBuffer();
    const originalName = texture.getName(), uniqueName = `__spaceface_recessed_${sheet.slot}`;
    if (root.listTextures().some((other) => other !== texture && other.getName() === uniqueName)) {
      throw new Error(`cockpit_recessed: reserved texture name ${uniqueName} is already used`);
    }
    texture.setImage(resized).setMimeType('image/png').setName(uniqueName);
    try {
      await document.transform(cachedKtx2({
        pattern: new RegExp(`^${uniqueName}$`), slots: new RegExp(`^${sheet.slot}$`), imageDecoder,
        isUASTC: false, qualityLevel: 255, compressionLevel: 2,
        generateMipmap: true, needSupercompression: false,
        isPerceptual: sheet.srgb, isSetKTX2SRGBTransferFunc: sheet.srgb,
      }));
    } finally {
      texture.setName(originalName);
    }
    result[sheet.slot] = `Reviewed recessed cockpit sheet resized to 256px, ETC1S KTX2, mipmapped, quality255, ${sheet.srgb ? 'sRGB' : 'linear'} transfer; full-resolution source retained`;
  }
  return Object.keys(result).length ? result : null;
}
