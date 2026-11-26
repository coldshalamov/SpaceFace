import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { cachedKtx2 } from './cachedKtx2.mjs';

// The original source sheets remain full size. These settings are confined to the
// reviewed gatling maps and preserve a real linear tangent-space normal map.
const SHEETS = Object.freeze([
  Object.freeze({
    name: 'weapon_gatling_mechanical_normal_1k',
    sha256: '890d541e6d0c56f0b3e8ee73700e7ea37e8565b860d329b249b81e3d4cfb4e2a',
    slots: ['normalTexture'], normal: true, srgb: false,
  }),
  Object.freeze({
    name: 'weapon_gatling_mechanical_orm_1k',
    sha256: 'b205292fb1eb58a2a428567e758c47888ef631299510f8376928c5900e8015d5',
    slots: ['metallicRoughnessTexture', 'occlusionTexture'], normal: false, srgb: false,
  }),
  Object.freeze({
    name: 'weapon_gatling_mechanical_baseColor_1k',
    sha256: '64bec5e15a0a0f9dce597c640912d69bbffe183dcb6adb6b35ae83b22b19fa4e',
    slots: ['baseColorTexture'], normal: false, srgb: true,
  }),
]);

export async function applyReleaseGatlingTextureProfiles(document, assetId, imageDecoder) {
  if (assetId !== 'weapon_gatling') return null;
  const root = document.getRoot(), result = {};
  for (const sheet of SHEETS) {
    const matches = root.listTextures().filter((texture) => {
      const image = texture.getImage();
      return texture.getName() === sheet.name && image
        && createHash('sha256').update(image).digest('hex') === sheet.sha256;
    });
    if (matches.length > 1) throw new Error(`weapon_gatling: ambiguous reviewed texture ${sheet.name}`);
    const texture = matches[0];
    if (!texture) continue;
    const slots = texture.getGraph().listParentEdges(texture)
      .filter((edge) => edge.getParent() !== root).map((edge) => edge.getName());
    if (!slots.length || slots.some((slot) => !sheet.slots.includes(slot))
      || sheet.slots.some((slot) => !slots.includes(slot))) {
      throw new Error(`weapon_gatling: reviewed texture ${sheet.name} is used in an incompatible slot`);
    }
    const resized = await sharp(texture.getImage()).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha().png().toBuffer();
    const originalName = texture.getName(), uniqueName = `__spaceface_gatling_${sheet.slots[0]}`;
    if (root.listTextures().some((other) => other !== texture && other.getName() === uniqueName)) {
      throw new Error(`weapon_gatling: reserved texture name ${uniqueName} is already used`);
    }
    texture.setImage(resized).setMimeType('image/png').setName(uniqueName);
    try {
      await document.transform(cachedKtx2({
        pattern: new RegExp(`^${uniqueName}$`), slots: new RegExp(`^(${sheet.slots.join('|')})$`), imageDecoder,
        ...(sheet.normal ? { isUASTC: true, uastcLDRQualityLevel: 2, needSupercompression: true, isNormalMap: true }
          : { isUASTC: false, qualityLevel: 255, compressionLevel: 2, needSupercompression: false }),
        generateMipmap: true, isPerceptual: sheet.srgb, isSetKTX2SRGBTransferFunc: sheet.srgb,
      }));
    } finally {
      texture.setName(originalName);
    }
    const description = `Reviewed gatling sheet resized to 256px, ${sheet.normal ? 'UASTC normal-map' : 'ETC1S quality255'} KTX2, mipmapped, ${sheet.srgb ? 'sRGB' : 'linear'} transfer; full-resolution source retained`;
    for (const slot of sheet.slots) result[slot] = description;
  }
  return Object.keys(result).length ? result : null;
}
