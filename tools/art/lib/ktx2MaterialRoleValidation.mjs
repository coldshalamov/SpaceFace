import {
  KHR_DF_MODEL_ETC1S,
  KHR_DF_MODEL_UASTC,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_TRANSFER_SRGB,
  KHR_SUPERCOMPRESSION_BASISLZ,
  KHR_SUPERCOMPRESSION_ZSTD,
  read,
} from 'ktx-parse';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const ROLE_PROFILES = Object.freeze({
  baseColorTexture: Object.freeze({
    colorModel: KHR_DF_MODEL_ETC1S,
    transferFunction: KHR_DF_TRANSFER_SRGB,
    supercompressionScheme: KHR_SUPERCOMPRESSION_BASISLZ,
    profile: 'ETC1S-sRGB',
  }),
  emissiveTexture: Object.freeze({
    colorModel: KHR_DF_MODEL_ETC1S,
    transferFunction: KHR_DF_TRANSFER_SRGB,
    supercompressionScheme: KHR_SUPERCOMPRESSION_BASISLZ,
    profile: 'ETC1S-sRGB',
  }),
  normalTexture: Object.freeze({
    colorModel: KHR_DF_MODEL_UASTC,
    transferFunction: KHR_DF_TRANSFER_LINEAR,
    supercompressionScheme: KHR_SUPERCOMPRESSION_ZSTD,
    profile: 'UASTC-linear',
  }),
  metallicRoughnessTexture: Object.freeze({
    colorModel: KHR_DF_MODEL_ETC1S,
    transferFunction: KHR_DF_TRANSFER_LINEAR,
    supercompressionScheme: KHR_SUPERCOMPRESSION_BASISLZ,
    profile: 'ETC1S-linear',
  }),
  occlusionTexture: Object.freeze({
    colorModel: KHR_DF_MODEL_ETC1S,
    transferFunction: KHR_DF_TRANSFER_LINEAR,
    supercompressionScheme: KHR_SUPERCOMPRESSION_BASISLZ,
    profile: 'ETC1S-linear',
  }),
});

export function expectedKtx2ProfileForRole(role) {
  const profile = ROLE_PROFILES[role];
  if (!profile) throw new Error(`unsupported KTX2 material role: ${role}`);
  return profile;
}

export function parseReleaseGlbPayload(input, label = 'release GLB') {
  if (!(input instanceof Uint8Array)) throw new TypeError(`${label}: GLB bytes must be a Uint8Array`);
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 20
    || bytes.readUInt32LE(0) !== GLB_MAGIC
    || bytes.readUInt32LE(4) !== GLB_VERSION
    || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${label}: invalid GLB transport header`);
  }
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error(`${label}: truncated GLB chunk header`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error(`${label}: GLB chunk overruns transport`);
    if (type === CHUNK_JSON) {
      if (json) throw new Error(`${label}: duplicate JSON chunk`);
      json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/u, '').trim());
    } else if (type === CHUNK_BIN) {
      if (binary) throw new Error(`${label}: duplicate BIN chunk`);
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }
  if (!json || !binary) throw new Error(`${label}: requires embedded JSON and BIN chunks`);
  return { gltf: json, binary };
}

export function validateKtx2MaterialRolePayloads(gltf, binary, label = 'release GLB') {
  if (!(binary instanceof Uint8Array)) throw new TypeError(`${label}: binary must be embedded bytes`);
  const rolesByTexture = collectRolesByTexture(gltf, label);
  if (rolesByTexture.size !== (gltf.textures || []).length) {
    throw new Error(
      `${label}: every KTX2 texture must be bound to a validated material role `
      + `(${rolesByTexture.size}/${(gltf.textures || []).length})`,
    );
  }

  const textures = [];
  for (const [textureIndex, roles] of rolesByTexture) {
    const texture = gltf.textures?.[textureIndex];
    const imageIndex = texture?.extensions?.KHR_texture_basisu?.source;
    if (!Number.isInteger(imageIndex)) {
      throw new Error(`${label}: texture ${textureIndex} is not transported by KHR_texture_basisu`);
    }
    const image = gltf.images?.[imageIndex];
    if (!image || image.mimeType !== 'image/ktx2' || !Number.isInteger(image.bufferView)) {
      throw new Error(`${label}: texture ${textureIndex} has no embedded image/ktx2 payload`);
    }
    const view = gltf.bufferViews?.[image.bufferView];
    if (!view || view.buffer !== 0 || !Number.isInteger(view.byteLength) || view.byteLength <= 0) {
      throw new Error(`${label}: KTX2 image ${imageIndex} has invalid buffer storage`);
    }
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (!Number.isInteger(start) || start < 0 || end > binary.byteLength) {
      throw new Error(`${label}: KTX2 image ${imageIndex} overruns embedded storage`);
    }
    const container = read(binary.subarray(start, end));
    const descriptors = container.dataFormatDescriptor || [];
    if (descriptors.length !== 1) {
      throw new Error(`${label}: KTX2 image ${imageIndex} must have one basic data descriptor`);
    }
    const descriptor = descriptors[0];
    const expectedProfiles = roles.map(expectedKtx2ProfileForRole);
    const distinctProfiles = new Set(expectedProfiles.map((profile) => profile.profile));
    if (distinctProfiles.size !== 1) {
      throw new Error(
        `${label}: texture ${textureIndex} is bound to incompatible roles ${roles.join(', ')}`,
      );
    }
    const expected = expectedProfiles[0];
    if (descriptor.colorModel !== expected.colorModel
      || descriptor.transferFunction !== expected.transferFunction
      || container.supercompressionScheme !== expected.supercompressionScheme) {
      throw new Error(
        `${label}: texture ${textureIndex} roles ${roles.join(', ')} require ${expected.profile}; `
        + `emitted model=${descriptor.colorModel} transfer=${descriptor.transferFunction} `
        + `supercompression=${container.supercompressionScheme}`,
      );
    }
    const largestDimension = Math.max(
      container.pixelWidth,
      container.pixelHeight || 1,
      container.pixelDepth || 1,
    );
    const expectedLevels = Math.floor(Math.log2(largestDimension)) + 1;
    if (container.levelCount !== expectedLevels || container.levels.length !== expectedLevels) {
      throw new Error(
        `${label}: texture ${textureIndex} has incomplete mip pyramid `
        + `${container.levelCount}/${expectedLevels}`,
      );
    }
    if (container.levels.some((level) => !(level.levelData?.byteLength > 0))) {
      throw new Error(`${label}: texture ${textureIndex} has an empty mip payload`);
    }
    textures.push({
      textureIndex,
      image: image.name || `image_${imageIndex}`,
      roles,
      profile: expected.profile,
      width: container.pixelWidth,
      height: container.pixelHeight,
      levels: container.levelCount,
    });
  }
  textures.sort((left, right) => left.textureIndex - right.textureIndex);
  return { textureCount: textures.length, textures };
}

function collectRolesByTexture(gltf, label) {
  const rolesByTexture = new Map();
  const bind = (info, role, materialName) => {
    if (!info) return;
    if (!Number.isInteger(info.index) || !gltf.textures?.[info.index]) {
      throw new Error(`${label}: ${materialName}.${role} has an invalid texture index`);
    }
    const roles = rolesByTexture.get(info.index) || [];
    if (!roles.includes(role)) roles.push(role);
    rolesByTexture.set(info.index, roles);
  };
  for (const [materialIndex, material] of (gltf.materials || []).entries()) {
    const materialName = material.name || `material_${materialIndex}`;
    const pbr = material.pbrMetallicRoughness || {};
    bind(pbr.baseColorTexture, 'baseColorTexture', materialName);
    bind(pbr.metallicRoughnessTexture, 'metallicRoughnessTexture', materialName);
    bind(material.normalTexture, 'normalTexture', materialName);
    bind(material.occlusionTexture, 'occlusionTexture', materialName);
    bind(material.emissiveTexture, 'emissiveTexture', materialName);
  }
  return rolesByTexture;
}
