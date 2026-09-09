import sharp from 'sharp';

function requireUnitScalar(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new RangeError(`${label} must be an explicit finite scalar in [0, 1]`);
  }
  return numeric;
}

async function decodeImage(image) {
  return sharp(image, { failOn: 'error' })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function resolveFallbackDimensions(referenceImage, width, height) {
  if (Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0) {
    return { width, height };
  }
  if (!referenceImage) {
    throw new Error(
      'a reference image or explicit width and height are required when authored AO is unavailable',
    );
  }
  const metadata = await sharp(referenceImage, { failOn: 'error' }).metadata();
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
    throw new Error('reference image does not have usable dimensions');
  }
  return { width: metadata.width, height: metadata.height };
}

function redChannelStats(data, channels) {
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let minimum = 255;
  let maximum = 0;
  for (let offset = 0; offset < data.length; offset += channels) {
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
    minimum,
    maximum,
    mean: Number(mean.toFixed(3)),
    standardDeviation: Number(Math.sqrt(variance).toFixed(3)),
  };
}

async function resolveAo(aoPng, referenceImage, width, height) {
  if (!aoPng) {
    return {
      ...(await resolveFallbackDimensions(referenceImage, width, height)),
      data: null,
      channels: 0,
      mode: 'neutral-fallback',
      reason: 'missing-authored-ao',
      stats: null,
    };
  }

  let decoded;
  try {
    decoded = await decodeImage(aoPng);
  } catch {
    return {
      ...(await resolveFallbackDimensions(referenceImage, width, height)),
      data: null,
      channels: 0,
      mode: 'neutral-fallback',
      reason: 'invalid-authored-ao',
      stats: null,
    };
  }

  const stats = redChannelStats(decoded.data, decoded.info.channels);
  if (stats.maximum <= 1) {
    return {
      width: decoded.info.width,
      height: decoded.info.height,
      data: null,
      channels: 0,
      mode: 'neutral-fallback',
      reason: 'flat-black-authored-ao',
      stats,
    };
  }

  return {
    width: decoded.info.width,
    height: decoded.info.height,
    data: decoded.data,
    channels: decoded.info.channels,
    mode: 'authored-ao',
    reason: null,
    stats,
  };
}

/**
 * Pack physically meaningful glTF ORM data.
 *
 * R copies the authored AO bake's red channel. If AO is missing, undecodable, or
 * flat black, R is neutral white (255). G and B are exact, explicit material
 * roughness and metallic scalars. The reference image is used only to establish
 * output dimensions when no usable AO image can provide them; its pixels never
 * influence any data channel. Legacy wear input is intentionally ignored.
 */
export async function deriveOrmMap(referenceImage, {
  aoPng = null,
  roughness,
  metallic,
  width = null,
  height = null,
} = {}) {
  const materialRoughness = requireUnitScalar(roughness, 'roughness');
  const materialMetallic = requireUnitScalar(metallic, 'metallic');
  const ao = await resolveAo(aoPng, referenceImage, width, height);
  const roughnessByte = Math.round(materialRoughness * 255);
  const metallicByte = Math.round(materialMetallic * 255);
  const output = Buffer.alloc(ao.width * ao.height * 4);

  for (let pixel = 0; pixel < ao.width * ao.height; pixel++) {
    const outputOffset = pixel * 4;
    output[outputOffset] = ao.data
      ? ao.data[pixel * ao.channels]
      : 255;
    output[outputOffset + 1] = roughnessByte;
    output[outputOffset + 2] = metallicByte;
    output[outputOffset + 3] = 255;
  }

  const png = await sharp(output, {
    raw: { width: ao.width, height: ao.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const metadata = {
    schema: 'spaceface.derived-orm-map.v2',
    width: ao.width,
    height: ao.height,
    channelSources: {
      red: ao.mode === 'authored-ao' ? 'authored-ao-red' : 'neutral-ao-255',
      green: 'explicit-roughness-scalar',
      blue: 'explicit-metallic-scalar',
    },
    ao: {
      mode: ao.mode,
      fallbackReason: ao.reason,
      sourceStats: ao.stats,
    },
    material: {
      roughness: materialRoughness,
      metallic: materialMetallic,
    },
    recommendedTexturePolicy: ao.mode === 'neutral-fallback'
      ? 'neutral-ao-constant-material-class'
      : null,
  };

  return { png, metadata };
}

/**
 * Backward-compatible Buffer result for existing finalizers. Structured
 * provenance is available as `buffer.ormMetadata`; new callers can use
 * `deriveOrmMap` directly.
 */
export async function deriveOrmMapPng(referenceImage, options = {}) {
  const result = await deriveOrmMap(referenceImage, options);
  Object.defineProperty(result.png, 'ormMetadata', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: result.metadata,
  });
  return result.png;
}
