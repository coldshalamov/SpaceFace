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
  if (materials.length === 0) errors.push('asset has no materials to receive required texture roles');
  let fullyTexturedMaterialCount = 0;
  materials.forEach((material, index) => {
    const name = material.name || `material#${index}`;
    const infos = Object.fromEntries(REQUIRED_ROLES.map(([role, getInfo]) => [role, getInfo(material)]));
    const boundRoleCount = Object.values(infos).filter((info) => Number.isInteger(info?.index)).length;
    if (boundRoleCount === 0) {
      if (!validBaseColorFactor(material.pbrMetallicRoughness?.baseColorFactor)) {
        for (const [role] of REQUIRED_ROLES) {
          errors.push(`material "${name}" ${role}: slot is not bound to a texture`);
        }
        errors.push(`material "${name}" factor-only mode requires a valid baseColorFactor with four finite values in [0,1]`);
      }
      return;
    }

    let rolesValid = true;
    for (const [role] of REQUIRED_ROLES) {
      const detail = validateTextureInfo(gltf, infos[role]);
      if (detail) {
        errors.push(`material "${name}" ${role}: ${detail}`);
        rolesValid = false;
      }
    }
    if (!rolesValid) return;

    if (infos.metallicRoughness.index !== infos.occlusion.index) {
      errors.push(`material "${name}" metallicRoughness and occlusion must share one ORM texture binding`);
      return;
    }
    const baseImage = textureImageIndex(gltf.textures?.[infos.baseColor.index]);
    const normalImage = textureImageIndex(gltf.textures?.[infos.normal.index]);
    const ormImage = textureImageIndex(gltf.textures?.[infos.metallicRoughness.index]);
    if (new Set([baseImage, normalImage, ormImage]).size !== 3) {
      errors.push(`material "${name}" baseColor, normal, and shared ORM bindings must resolve to three distinct embedded images`);
      return;
    }
    fullyTexturedMaterialCount++;
  });
  if (materials.length > 0 && fullyTexturedMaterialCount === 0) {
    errors.push('bound texture-role mode requires at least one fully textured material');
  }
  if (errors.length) {
    throw new Error(`source texture role contract failed for '${label}':\n- ${errors.join('\n- ')}`);
  }
  return true;
}

function validBaseColorFactor(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.every((component) => Number.isFinite(component) && component >= 0 && component <= 1);
}
