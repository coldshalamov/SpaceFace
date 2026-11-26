// Builds the shipped hull-wear atlases from raw Codex generations (see assets/textures/hull-wear/PROMPTS.md).
//   node tools/hull-wear-atlas.mjs <rawDir>
// marks_raw.png (green key) -> hull_marks_atlas.png (RGBA); scratch_raw.png (white on black) and
// grime_raw.png (black on white) -> one RGBA mask atlas hull_wear_atlas.png, 1024x1024:
// scratches/chips occupy the top two rows of tiles (white, alpha = luminance), grime the bottom two
// (black, alpha = darkness). 512x512 each, stacked: scratch top half, grime bottom half.
import sharp from 'sharp';
import { join } from 'node:path';
const raw = process.argv[2] || '.devshots/look05b/raw';
const out = 'assets/textures/hull-wear/';
{
  const { data, info } = await sharp(join(raw, 'marks_raw.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const spill = g - Math.max(r, b);
    const a = Math.min(1, Math.max(0, 1 - (spill - 50) / 110));
    data[i + 3] = Math.round(a * 255);
    if (spill > 0) data[i + 1] = Math.max(r, b) + Math.min(spill, 12);
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(out + 'hull_marks_atlas.png');
}
async function mask(file, invert) {
  const { data, info } = await sharp(join(raw, file)).greyscale().resize(512, 512, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i++) {
    const v = invert ? 255 - data[i] : data[i];
    rgba[i * 4] = invert ? 0 : 255; rgba[i * 4 + 1] = invert ? 0 : 255; rgba[i * 4 + 2] = invert ? 0 : 255;
    rgba[i * 4 + 3] = v;
  }
  return sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
}
const top = await mask('scratch_raw.png', false), bottom = await mask('grime_raw.png', true);
await sharp({ create: { width: 512, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: top, left: 0, top: 0 }, { input: bottom, left: 0, top: 512 }])
  .png({ compressionLevel: 9 }).toFile(out + 'hull_wear_atlas.png');
console.log('atlases written');
