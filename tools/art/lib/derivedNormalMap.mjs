import sharp from 'sharp';

function normalByte(value) {
  return Math.max(0, Math.min(255, Math.round(128 + value * 127)));
}

export async function deriveNormalMapPng(sourcePng, {
  blurSigma = 0.8,
  strength = 0.8,
} = {}) {
  if (!(sourcePng instanceof Uint8Array)) {
    throw new TypeError('deriveNormalMapPng requires encoded source-image bytes');
  }
  if (!Number.isFinite(blurSigma) || blurSigma < 0) {
    throw new TypeError('blurSigma must be a nonnegative finite number');
  }
  if (!Number.isFinite(strength) || strength <= 0) {
    throw new TypeError('strength must be a positive finite number');
  }

  let pipeline = sharp(sourcePng, { failOn: 'error' }).greyscale();
  if (blurSigma > 0) pipeline = pipeline.blur(Math.max(0.3, blurSigma));
  const decoded = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const output = Buffer.alloc(width * height * 4);
  const heightAt = (x, y) => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));
    return decoded.data[(clampedY * width + clampedX) * channels] / 255;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const slopeX = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength;
      const slopeY = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
      let normalX = -slopeX;
      let normalY = slopeY;
      let normalZ = 1;
      const length = Math.hypot(normalX, normalY, normalZ) || 1;
      normalX /= length;
      normalY /= length;
      normalZ /= length;
      const offset = (y * width + x) * 4;
      output[offset] = normalByte(normalX);
      output[offset + 1] = normalByte(normalY);
      output[offset + 2] = normalByte(normalZ);
      output[offset + 3] = 255;
    }
  }

  return sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
