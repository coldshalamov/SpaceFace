const REQUIRED_ROLES = [
  ['baseColor', (material) => material.pbrMetallicRoughness?.baseColorTexture],
  ['normal', (material) => material.normalTexture],
  ['metallicRoughness', (material) => material.pbrMetallicRoughness?.metallicRoughnessTexture],
  ['occlusion', (material) => material.occlusionTexture],
];

function textureImageIndex(texture) {
  return texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source ?? null;
}

function validateTextureInfo(gltf, info) {
  if (!Number.isInteger(info?.index)) return 'slot is not bound to a texture';
  const texture = gltf.textures?.[info.index];
  if (!texture) return `references missing texture ${info.index}`;
  const basisSource = texture.extensions?.KHR_texture_basisu?.source;
  const imageIndex = Number.isInteger(basisSource) ? basisSource : texture.source;
  if (!Number.isInteger(imageIndex)) return `texture ${info.index} is not bound to an image`;
  const image = gltf.images?.[imageIndex];
  if (!image) return `texture ${info.index} references missing image ${imageIndex}`;
  if (image.uri || !Number.isInteger(image.bufferView)) {
    return `image ${imageIndex} is not embedded in a bufferView`;
  }
  const view = gltf.bufferViews?.[image.bufferView];
  if (!view || (view.buffer ?? 0) !== 0 || !Number.isFinite(view.byteLength) || view.byteLength <= 0) {
    return `image ${imageIndex} references invalid bufferView ${image.bufferView}`;
  }
  if (image.mimeType === 'image/png') {
    if (!Number.isInteger(texture.source)) return `PNG texture ${info.index} lacks a source image`;
    return null;
  }
  if (image.mimeType === 'image/ktx2') {
    if (!Number.isInteger(basisSource)) return `KTX2 texture ${info.index} lacks KHR_texture_basisu transport`;
    return null;
  }
  return `image ${imageIndex} uses unsupported transport ${image.mimeType || '<missing mimeType>'}`;
}

export function validateSourceTextureRoleCoverage(gltf, label = 'source asset') {
  const errors = [];
  const materials = gltf.materials || [];
  const bindingsByRole = new Map();
  if (materials.length === 0) errors.push('asset has no materials to receive required texture roles');
  const namedMaterials = materials.map((material, index) => ({
    material,
    name: material.name || `material#${index}`,
  }));
  for (const [role, getInfo] of REQUIRED_ROLES) {
    const bindings = namedMaterials
      .map(({ material, name }) => ({ name, info: getInfo(material) }))
      .filter(({ info }) => Number.isInteger(info?.index));
    bindingsByRole.set(role, bindings);
    if (bindings.length === 0) {
      errors.push(`material${namedMaterials.length === 1 ? '' : 's'} "${namedMaterials.map(({ name }) => name).join(', ')}" ${role}: slot is not bound to a texture`);
      continue;
    }
    for (const { name, info } of bindings) {
      const detail = validateTextureInfo(gltf, info);
      if (detail) errors.push(`material "${name}" ${role}: ${detail}`);
    }
  }
  const metallicRoughness = bindingsByRole.get('metallicRoughness') || [];
  const occlusion = bindingsByRole.get('occlusion') || [];
  const sharedOrmTextureIndices = [...new Set(metallicRoughness.map(({ info }) => info.index))]
    .filter((textureIndex) => occlusion.some(({ info }) => info.index === textureIndex));
  if (metallicRoughness.length > 0 && occlusion.length > 0 && sharedOrmTextureIndices.length === 0) {
    errors.push('metallicRoughness and occlusion must share one ORM texture binding');
  }

  const validImageIndices = (bindings) => bindings
    .filter(({ info }) => validateTextureInfo(gltf, info) == null)
    .map(({ info }) => textureImageIndex(gltf.textures?.[info.index]));
  const baseImages = validImageIndices(bindingsByRole.get('baseColor') || []);
  const normalImages = validImageIndices(bindingsByRole.get('normal') || []);
  const ormImages = sharedOrmTextureIndices
    .map((textureIndex) => textureImageIndex(gltf.textures?.[textureIndex]))
    .filter(Number.isInteger);
  const hasDistinctRoleImages = baseImages.some((baseImage) =>
    normalImages.some((normalImage) =>
      ormImages.some((ormImage) => new Set([baseImage, normalImage, ormImage]).size === 3)));
  if (baseImages.length > 0 && normalImages.length > 0 && ormImages.length > 0 && !hasDistinctRoleImages) {
    errors.push('baseColor, normal, and shared ORM bindings must resolve to three distinct embedded images');
  }
  if (errors.length) {
    throw new Error(`source texture role contract failed for '${label}':\n- ${errors.join('\n- ')}`);
  }
  return true;
}
