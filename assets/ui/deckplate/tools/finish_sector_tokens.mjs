// finish_sector_tokens — merge the two passes render_sector_tokens.py writes per sector into the Chart's token.
//
//   <id>.png        transparent film: true coverage for solid bodies (a near-transparent glow clips to white here)
//   <id>.black.png  the same frame over black: true colour for glows (premultiplied over black)
//
// alpha = max(coverage, brightness of the black pass); colour = black pass / alpha. Over the Chart's dark glass
// this reproduces the render: solid bodies opaque with clean edges, gas and glows in their own hue.
//
//   node assets/ui/deckplate/tools/finish_sector_tokens.mjs <render dir> [out dir=assets/ui/generated/chart] [sheet.png]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dir, outDir = 'assets/ui/generated/chart', sheetOut] = process.argv.slice(2);
if (!dir) { console.error('usage: finish_sector_tokens.mjs <render dir> [out dir] [sheet.png]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const ids = fs.readdirSync(dir).filter((f) => /^sector_[a-z_]+\.png$/.test(f)).map((f) => f.replace('.png', '')).sort();
const written = [];
for (const id of ids) {
  const cov = await sharp(path.join(dir, `${id}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = cov.info.width; const H = cov.info.height;
  const blackPath = path.join(dir, `${id}.black.png`);
  const blk = fs.existsSync(blackPath) ? (await sharp(blackPath).removeAlpha().raw().toBuffer()) : null;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    if (!blk) { cov.data.copy(out, i * 4, i * 4, i * 4 + 4); continue; }
    const a1 = cov.data[i * 4 + 3] / 255;
    const r = blk[i * 3] / 255; const g = blk[i * 3 + 1] / 255; const b = blk[i * 3 + 2] / 255;
    const a = Math.max(a1, Math.min(1, Math.max(r, g, b)));
    if (a <= 0.002) continue;
    out[i * 4] = Math.round(Math.min(1, r / a) * 255);
    out[i * 4 + 1] = Math.round(Math.min(1, g / a) * 255);
    out[i * 4 + 2] = Math.round(Math.min(1, b / a) * 255);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  const o = path.join(outDir, `${id}.webp`);
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize(256, 256, { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(o);
  written.push(o);
  console.log(path.basename(o), fs.statSync(o).size);
}

if (sheetOut && written.length) {
  // a contact sheet on the chart's glass: each token at 192 px and at a chart-sized 64 px
  const cols = 6; const cell = 220; const rows = Math.ceil(written.length / cols);
  const layers = [];
  for (let i = 0; i < written.length; i += 1) {
    const x = (i % cols) * cell; const y = Math.floor(i / cols) * (cell + 80);
    layers.push({ input: await sharp(written[i]).resize(192, 192).png().toBuffer(), left: x + 14, top: y + 6 });
    layers.push({ input: await sharp(written[i]).resize(64, 64, { kernel: 'lanczos3' }).png().toBuffer(), left: x + 78, top: y + 204 });
  }
  await sharp({ create: { width: cols * cell, height: rows * (cell + 80), channels: 4, background: { r: 8, g: 10, b: 14, alpha: 1 } } })
    .composite(layers).png().toFile(sheetOut);
  console.log('sheet', written.map((w, i) => `${i}:${path.basename(w, '.webp').replace('sector_', '')}`).join(' '));
}
