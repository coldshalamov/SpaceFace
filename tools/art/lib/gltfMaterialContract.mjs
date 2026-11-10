import { createHash } from 'node:crypto';

export function gltfMaterialContract(gltf) {
  const usedMaterialIndices = new Set();
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (Number.isInteger(primitive.material)) usedMaterialIndices.add(primitive.material);
    }
  }

  const materialRowsByIndex = new Map([...usedMaterialIndices].map((index) => {
    const material = gltf.materials?.[index];
    if (!material || typeof material !== 'object') {
      throw new Error(`material contract references missing material ${index}`);
    }
    const pbr = material.pbrMetallicRoughness || {};
    return [index, {
      name: material.name || `material_${index}`,
      baseColorFactor: pbr.baseColorFactor || [1, 1, 1, 1],
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
      baseColorTexture: normalizeTextureInfo(gltf, 'baseColorTexture', pbr.baseColorTexture),
      metallicRoughnessTexture: normalizeTextureInfo(
        gltf,
        'metallicRoughnessTexture',
        pbr.metallicRoughnessTexture,
      ),
      normalTexture: normalizeTextureInfo(gltf, 'normalTexture', material.normalTexture),
      occlusionTexture: normalizeTextureInfo(gltf, 'occlusionTexture', material.occlusionTexture),
      emissiveTexture: normalizeTextureInfo(gltf, 'emissiveTexture', material.emissiveTexture),
      emissiveFactor: material.emissiveFactor || [0, 0, 0],
      alphaMode: material.alphaMode || 'OPAQUE',
      alphaCutoff: material.alphaCutoff ?? 0.5,
      doubleSided: material.doubleSided === true,
      extensions: normalizeMaterialExtensions(gltf, material.extensions || {}),
      extras: stableValue(material.extras ?? null),
    }];
  }));
  const materials = [...materialRowsByIndex.values()];
  materials.sort((left, right) => (
    left.name.localeCompare(right.name)
    || JSON.stringify(left).localeCompare(JSON.stringify(right))
  ));
  const bindings = [];
  for (const [meshIndex, mesh] of (gltf.meshes || []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
      const material = Number.isInteger(primitive.material)
        ? materialRowsByIndex.get(primitive.material)
        : null;
      bindings.push({
        meshIndex,
        meshName: mesh.name || `mesh_${meshIndex}`,
        primitiveIndex,
        material: material ? {
          name: material.name,
          signature: createHash('sha256').update(JSON.stringify(material)).digest('hex'),
        } : null,
      });
    }
  }
  return { materials, bindings };
}

export function gltfMaterialContractSignature(gltf) {
  return createHash('sha256')
    .update('spaceface-gltf-material-contract-v1\0')
    .update(JSON.stringify(gltfMaterialContract(gltf)))
    .digest('hex');
}

export function assertGltfMaterialContractParity(sourceGltf, releaseGltf, label = 'GLB pair') {
  const sourceContract = gltfMaterialContract(sourceGltf);
  const releaseContract = gltfMaterialContract(releaseGltf);
  const sourceSignature = contractSignature(sourceContract);
  const releaseSignature = contractSignature(releaseContract);
  if (sourceSignature !== releaseSignature) {
    const difference = firstContractDifference(sourceContract, releaseContract);
    throw new Error(
      `${label} changed material factors, extensions, texture identity, or texture sampling `
      + `(${sourceSignature} -> ${releaseSignature}); first difference: ${difference}`,
    );
  }
  return sourceSignature;
}

function contractSignature(contract) {
  return createHash('sha256')
    .update('spaceface-gltf-material-contract-v1\0')
    .update(JSON.stringify(contract))
    .digest('hex');
}

function firstContractDifference(left, right, path = '$') {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return `${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`;
    }
    if (left.length !== right.length) return `${path}.length: ${left.length} != ${right.length}`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstContractDifference(left[index], right[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (JSON.stringify([...leftKeys].sort()) !== JSON.stringify([...rightKeys].sort())) {
      return `${path} keys: ${JSON.stringify([...leftKeys].sort())} != ${JSON.stringify([...rightKeys].sort())}`;
    }
    for (const key of leftKeys) {
      const difference = firstContractDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return `${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`;
}

function normalizeTextureInfo(gltf, role, info) {
  if (!info) return null;
  if (typeof info !== 'object' || !Number.isInteger(info.index)) {
    throw new Error(`${role} must contain a valid texture index`);
  }
  const texture = gltf.textures?.[info.index];
  if (!texture || typeof texture !== 'object') {
    throw new Error(`${role} references missing texture ${info.index}`);
  }
  const imageIndex = texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
  const image = Number.isInteger(imageIndex) ? gltf.images?.[imageIndex] : null;
  const identity = image?.name || texture.name;
  if (!identity) {
    throw new Error(`${role} texture ${info.index} has no stable image or texture name`);
  }
  const transform = info.extensions?.KHR_texture_transform;
  const otherExtensions = { ...(info.extensions || {}) };
  delete otherExtensions.KHR_texture_transform;
  const scalarFields = {};
  for (const key of Object.keys(info).sort()) {
    if (key === 'index' || key === 'texCoord' || key === 'extensions') continue;
    scalarFields[key] = stableValue(info[key]);
  }
  if (/NormalTexture$/.test(role) && scalarFields.scale === undefined) scalarFields.scale = 1;
  if (role === 'occlusionTexture' && scalarFields.strength === undefined) scalarFields.strength = 1;
  return {
    identity,
    sampler: normalizeSampler(gltf.samplers?.[texture.sampler]),
    texCoord: info.texCoord ?? 0,
    transform: transform ? {
      offset: transform.offset || [0, 0],
      rotation: transform.rotation ?? 0,
      scale: transform.scale || [1, 1],
      texCoord: transform.texCoord ?? info.texCoord ?? 0,
    } : null,
    fields: scalarFields,
    extensions: normalizeExtensionObject(gltf, otherExtensions),
  };
}

function normalizeSampler(sampler = {}) {
  return {
    magFilter: sampler.magFilter ?? 9729,
    minFilter: sampler.minFilter ?? 9987,
    wrapS: sampler.wrapS ?? 10497,
    wrapT: sampler.wrapT ?? 10497,
  };
}

function normalizeExtensionObject(gltf, value) {
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (/Texture$/.test(key) && child && typeof child === 'object' && Number.isInteger(child.index)) {
      normalized[key] = normalizeTextureInfo(gltf, key, child);
    } else {
      normalized[key] = stableValue(child);
    }
  }
  return normalized;
}

function normalizeMaterialExtensions(gltf, value) {
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (key === 'KHR_materials_clearcoat' && child && typeof child === 'object') {
      normalized[key] = {
        clearcoatFactor: child.clearcoatFactor ?? 0,
        clearcoatTexture: normalizeTextureInfo(gltf, 'clearcoatTexture', child.clearcoatTexture),
        clearcoatRoughnessFactor: child.clearcoatRoughnessFactor ?? 0,
        clearcoatRoughnessTexture: normalizeTextureInfo(
          gltf,
          'clearcoatRoughnessTexture',
          child.clearcoatRoughnessTexture,
        ),
        clearcoatNormalTexture: normalizeTextureInfo(
          gltf,
          'clearcoatNormalTexture',
          child.clearcoatNormalTexture,
        ),
      };
    } else {
      normalized[key] = stableValue(child);
    }
  }
  return normalized;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}
