import { createHash } from 'node:crypto';

import sharp from 'sharp';

const MATERIAL_TEXTURE_ROLES = [
  ['baseColor', (material) => material.pbrMetallicRoughness?.baseColorTexture],
  ['normal', (material) => material.normalTexture],
  ['metallicRoughness', (material) => material.pbrMetallicRoughness?.metallicRoughnessTexture],
  ['occlusion', (material) => material.occlusionTexture],
  ['emissive', (material) => material.emissiveTexture],
];

const ROLE_FAMILY = {
  baseColor: 'color',
  emissive: 'color',
  normal: 'normal',
  metallicRoughness: 'orm',
  occlusion: 'orm',
};

function resolveTextureImageIndex(texture) {
  return texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source ?? null;
}

function embeddedImageBytes(gltf, binary, image, imageIndex, label) {
  if (!Number.isInteger(image?.bufferView) || image.uri) {
    throw new Error(`${label}: image ${imageIndex} is not embedded in a bufferView`);
  }
  const view = gltf.bufferViews?.[image.bufferView];
  if (!view || (view.buffer ?? 0) !== 0) {
    throw new Error(`${label}: image ${imageIndex} references invalid bufferView ${image.bufferView}`);
  }
  const offset = view.byteOffset ?? 0;
  const end = offset + view.byteLength;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end > binary.length) {
    throw new Error(`${label}: image ${imageIndex} bufferView ${image.bufferView} exceeds embedded BIN data`);
  }
  return binary.subarray(offset, end);
}

function channelStats(data, channels, channel) {
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let minimum = 255;
  let maximum = 0;
  for (let offset = channel; offset < data.length; offset += channels) {
    const value = data[offset];
    count++;
    sum += value;
    sumSquares += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  return {
    mean: Number(mean.toFixed(3)),
    standardDeviation: Number(Math.sqrt(variance).toFixed(3)),
    minimum,
    maximum,
  };
}

function rgbStats(data, channels) {
  const channelIndexes = channels <= 2 ? [0, 0, 0] : [0, 1, 2];
  return {
    red: channelStats(data, channels, channelIndexes[0]),
    green: channelStats(data, channels, channelIndexes[1]),
    blue: channelStats(data, channels, channelIndexes[2]),
  };
}

function formatTriplet(stats, field) {
  return [
    stats.red[field],
    stats.green[field],
    stats.blue[field],
  ].map((value) => Number(value).toFixed(1)).join('/');
}

function addFinding(findings, severity, code, message, detail = {}) {
  findings.push({ severity, code, message, ...detail });
}

function collectImageUses(gltf, findings, label) {
  const usesByImage = new Map();
  for (const [materialIndex, material] of (gltf.materials || []).entries()) {
    const materialName = material.name || `material#${materialIndex}`;
    for (const [role, getTextureInfo] of MATERIAL_TEXTURE_ROLES) {
      const info = getTextureInfo(material);
      if (!Number.isInteger(info?.index)) continue;
      const texture = gltf.textures?.[info.index];
      const imageIndex = resolveTextureImageIndex(texture);
      if (!Number.isInteger(imageIndex) || !gltf.images?.[imageIndex]) {
        addFinding(
          findings,
          'error',
          'unresolved-texture-image',
          `${materialName} ${role} texture ${info.index} does not resolve to an embedded image`,
          { materialIndex, materialName, role, textureIndex: info.index },
        );
        continue;
      }
      const uses = usesByImage.get(imageIndex) || [];
      uses.push({ materialIndex, materialName, role, textureIndex: info.index });
      usesByImage.set(imageIndex, uses);
    }
  }
  if (!(gltf.materials || []).length) {
    addFinding(findings, 'warning', 'no-materials', `${label} has no materials to audit`);
  }
  return usesByImage;
}

function auditMaterialRoleCoverage(gltf, findings) {
  for (const [materialIndex, material] of (gltf.materials || []).entries()) {
    const materialName = material.name || `material#${materialIndex}`;
    const infos = Object.fromEntries(
      MATERIAL_TEXTURE_ROLES
        .filter(([role]) => role !== 'emissive')
        .map(([role, getTextureInfo]) => [role, getTextureInfo(material)]),
    );
    const boundRoles = Object.entries(infos).filter(([, info]) => Number.isInteger(info?.index));
    if (boundRoles.length === 0) continue;
    const missingRoles = Object.entries(infos)
      .filter(([, info]) => !Number.isInteger(info?.index))
      .map(([role]) => role);
    if (missingRoles.length) {
      addFinding(
        findings,
        'error',
        'incomplete-material-role-coverage',
        `${materialName} binds some PBR textures but is missing ${missingRoles.join(', ')}`,
        { materialIndex, materialName, missingRoles },
      );
      continue;
    }

    const imageByRole = Object.fromEntries(Object.entries(infos).map(([role, info]) => [
      role,
      resolveTextureImageIndex(gltf.textures?.[info.index]),
    ]));
    if (imageByRole.metallicRoughness !== imageByRole.occlusion) {
      addFinding(
        findings,
        'error',
        'split-orm-images',
        `${materialName} metallicRoughness and occlusion roles resolve to different images`,
        { materialIndex, materialName, imageByRole },
      );
    }
    if (new Set([
      imageByRole.baseColor,
      imageByRole.normal,
      imageByRole.metallicRoughness,
    ]).size !== 3) {
      addFinding(
        findings,
        'error',
        'aliased-material-role-images',
        `${materialName} baseColor, normal, and ORM roles do not resolve to three distinct images`,
        { materialIndex, materialName, imageByRole },
      );
    }
  }
}

function auditRoleSpecificPixels(image, findings) {
  const roles = new Set(image.uses.map((use) => use.role));
  const stats = image.channelStats;
  const standardDeviations = [
    stats.red.standardDeviation,
    stats.green.standardDeviation,
    stats.blue.standardDeviation,
  ];

  if (roles.has('normal')) {
    const normalVariationDegrees = Number((
      Math.atan2(
        Math.hypot(
          stats.red.standardDeviation / 127,
          stats.green.standardDeviation / 127,
        ),
        Math.max(0.0001, (stats.blue.mean - 128) / 127),
      ) * 180 / Math.PI
    ).toFixed(3));
    image.normalVariationDegrees = normalVariationDegrees;
    if (normalVariationDegrees <= 2) {
      addFinding(
        findings,
        'warning',
        'near-flat-normal',
        `${image.name} is used as a normal map but has near-flat RGB variation `
          + `(${normalVariationDegrees.toFixed(2)}° RMS tangent variation; `
          + `mean ${formatTriplet(stats, 'mean')}, σ ${formatTriplet(stats, 'standardDeviation')})`,
        { imageIndex: image.imageIndex, roles: [...roles], normalVariationDegrees },
      );
    } else if (
      stats.blue.mean < 128
      || stats.blue.mean < Math.max(stats.red.mean, stats.green.mean) + 10
    ) {
      addFinding(
        findings,
        'warning',
        'normal-not-blue-dominant',
        `${image.name} is used as a tangent-space normal map but its blue channel is not dominant `
          + `(mean ${formatTriplet(stats, 'mean')})`,
        { imageIndex: image.imageIndex, roles: [...roles] },
      );
    }
  }

  if (roles.has('metallicRoughness') || roles.has('occlusion')) {
    if (Math.max(...standardDeviations) <= 1) {
      addFinding(
        findings,
        'warning',
        'flat-orm',
        `${image.name} is used as ORM data but all RGB channels are effectively constant `
          + `(mean ${formatTriplet(stats, 'mean')})`,
        { imageIndex: image.imageIndex, roles: [...roles] },
      );
    } else {
      const flatChannels = ['red', 'green', 'blue'].filter(
        (channel) => stats[channel].standardDeviation <= 1,
      );
      if (flatChannels.length) {
        addFinding(
          findings,
          'info',
          'flat-orm-channel',
          `${image.name} has constant ${flatChannels.join(', ')} ORM channel data`,
          { imageIndex: image.imageIndex, roles: [...roles], channels: flatChannels },
        );
      }
    }
  }
}

function auditContentAliases(images, findings) {
  const imagesByHash = new Map();
  for (const image of images) {
    const group = imagesByHash.get(image.sha256) || [];
    group.push(image);
    imagesByHash.set(image.sha256, group);
  }
  for (const group of imagesByHash.values()) {
    const roles = new Set(group.flatMap((image) => image.uses.map((use) => use.role)));
    const families = new Set([...roles].map((role) => ROLE_FAMILY[role]).filter(Boolean));
    if (families.size <= 1) continue;
    const imageIndexes = group.map((image) => image.imageIndex);
    addFinding(
      findings,
      'error',
      'incompatible-role-alias',
      `identical embedded image bytes at indexes ${imageIndexes.join(', ')} are bound to incompatible roles: `
        + [...roles].sort().join(', '),
      { imageIndexes, roles: [...roles].sort(), sha256: group[0].sha256 },
    );
  }
}

export async function auditEmbeddedTextureChannels({ gltf, binary }, label = 'source asset') {
  if (!gltf || typeof gltf !== 'object') throw new TypeError(`${label}: glTF document is required`);
  if (!(binary instanceof Uint8Array)) throw new TypeError(`${label}: embedded BIN bytes are required`);

  const findings = [];
  auditMaterialRoleCoverage(gltf, findings);
  const usesByImage = collectImageUses(gltf, findings, label);
  const images = [];

  for (const [imageIndex, image] of (gltf.images || []).entries()) {
    const name = image.name || `image#${imageIndex}`;
    const uses = usesByImage.get(imageIndex) || [];
    if (!uses.length) {
      addFinding(
        findings,
        'warning',
        'unbound-embedded-image',
        `${name} is embedded but not bound to a supported material texture role`,
        { imageIndex },
      );
    }

    let payload;
    try {
      payload = embeddedImageBytes(gltf, binary, image, imageIndex, label);
    } catch (error) {
      addFinding(findings, 'error', 'invalid-embedded-image', error.message, { imageIndex });
      continue;
    }

    try {
      const decoded = await sharp(payload, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
      const stats = rgbStats(decoded.data, decoded.info.channels);
      const record = {
        imageIndex,
        name,
        mimeType: image.mimeType || null,
        sha256: createHash('sha256').update(payload).digest('hex'),
        byteLength: payload.length,
        width: decoded.info.width,
        height: decoded.info.height,
        channels: decoded.info.channels,
        uses,
        channelStats: stats,
      };
      images.push(record);
      if (decoded.info.width < 256 || decoded.info.height < 256) {
        addFinding(
          findings,
          'info',
          'low-resolution-texture',
          `${name} is ${decoded.info.width}x${decoded.info.height}`,
          { imageIndex, width: decoded.info.width, height: decoded.info.height },
        );
      }
      auditRoleSpecificPixels(record, findings);
    } catch (error) {
      addFinding(
        findings,
        'error',
        'image-decode-failure',
        `${name} could not be decoded: ${error.message}`,
        { imageIndex },
      );
    }
  }

  auditContentAliases(images, findings);
  findings.sort((left, right) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return (severityOrder[left.severity] - severityOrder[right.severity])
      || left.code.localeCompare(right.code)
      || (left.imageIndex ?? -1) - (right.imageIndex ?? -1);
  });
  const count = (severity) => findings.filter((finding) => finding.severity === severity).length;
  return {
    label,
    summary: {
      materials: (gltf.materials || []).length,
      images: (gltf.images || []).length,
      boundImages: usesByImage.size,
      errors: count('error'),
      warnings: count('warning'),
      info: count('info'),
    },
    findings,
    images,
  };
}
