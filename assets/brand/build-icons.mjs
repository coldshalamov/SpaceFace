#!/usr/bin/env node
// SpaceFace app icon — "WARMASK". One geometry, every master.
//
//   node assets/brand/build-icons.mjs            # write SVG masters + exports/ (PNG, ICO, ICNS)
//   node assets/brand/build-icons.mjs --preview  # also write a contact sheet to --out=<dir>
//
// The mark is an angular, scarred helm: split-plane steel shell, two hot slit-eyes, a fanged jaw cut and
// claw slashes across the right cheek. Tile = chamfered armour plate, not a rounded app-store square.
// Raster sizes <= 32 use the "small" optical master (fewer cuts, fatter eyes) so the face survives a
// taskbar / tab-strip pixel budget. Pure SVG paths + gradients: sharp (librsvg) rasterizes them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => (argv.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || d;
const OUT = path.resolve(opt('out', path.join(HERE, 'exports')));
// The web bundle copies assets/ui (not assets/brand), so the browser favicon set lives there to ship.
const WEB_ICONS = path.resolve(opt('web', path.join(HERE, '..', 'ui', 'app-icon')));

// ---- geometry (512 grid, mark centred on x = 256) ---------------------------------------------------
const mx = (pts) => pts.map(([x, y]) => [512 - x, y]).reverse();
const P = (pts) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L') + 'Z';

// Left half of the helm outline, crown -> chin. Swept brow points, hard cheek, blunt jaw.
const L = [[256, 40], [176, 48], [104, 78], [50, 138], [70, 200], [80, 284], [136, 360], [192, 438], [228, 472], [256, 472]];
const SHELL_L = L;
const SHELL_R = mx(L);                       // right half, chin -> crown
const HEAD = P([...SHELL_L, ...SHELL_R.slice(1, -1)]);
const HALF_L = P(SHELL_L);
const HALF_R = P([...mx(SHELL_L).reverse(), [256, 40]]);
// Eyes: angry slits that taper toward the nose bridge.
const EYE_L = [[90, 170], [240, 236], [232, 264], [106, 224]];
const EYE_R = mx(EYE_L);
// Inner eye core (hot filament) — inset along the same taper.
const CORE_L = [[118, 186], [228, 236], [224, 253], [130, 218]];
const CORE_R = mx(CORE_L);
// Brow ridge shadow planes + cheek plane (give the two halves a faceted shell).
const BROW_L = [[256, 40], [176, 48], [104, 78], [50, 138], [90, 170], [240, 236], [256, 232]];
const CHEEK_L = [[106, 224], [232, 264], [256, 272], [256, 362], [192, 438], [136, 360], [80, 284]];
// Fanged jaw cut.
const JAW = [[196, 360], [256, 394], [316, 360], [304, 380], [256, 420], [208, 380]];
// Nose spine (a dark wedge between the eyes).
const SPINE = [[256, 140], [271, 236], [256, 330], [241, 236]];
// Claw slashes across the right cheek (parallel cuts, lit from inside by ember).
const SLASH = [
  [[318, 20], [342, 20], [446, 446], [424, 446]],
  [[364, 20], [382, 20], [468, 384], [452, 384]],
];
// Crest fin (rises above the crown).
const CREST = [[256, 6], [288, 52], [256, 44], [224, 52]];

// ---- palettes ---------------------------------------------------------------------------------------
const defsFull = `
  <linearGradient id="g-plate" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2B2D35"/><stop offset=".55" stop-color="#15161B"/><stop offset="1" stop-color="#060607"/>
  </linearGradient>
  <linearGradient id="g-rim" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#A6ACB8"/><stop offset=".4" stop-color="#3C3E45"/><stop offset="1" stop-color="#17181B"/>
  </linearGradient>
  <linearGradient id="g-lit" x1="90" y1="40" x2="250" y2="470" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#E9EBEF"/><stop offset=".45" stop-color="#A9AEB8"/><stop offset="1" stop-color="#5D626C"/>
  </linearGradient>
  <linearGradient id="g-shade" x1="430" y1="40" x2="262" y2="470" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7C818B"/><stop offset=".5" stop-color="#4A4E57"/><stop offset="1" stop-color="#25272C"/>
  </linearGradient>
  <linearGradient id="g-eye" x1="0" y1="176" x2="0" y2="270" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFE9A8"/><stop offset=".45" stop-color="#FF9A1F"/><stop offset="1" stop-color="#FF3D0F"/>
  </linearGradient>
  <radialGradient id="g-heat" cx="256" cy="250" r="270" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FF4A12" stop-opacity=".30"/><stop offset=".6" stop-color="#FF4A12" stop-opacity=".07"/><stop offset="1" stop-color="#FF4A12" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="c-head"><path d="${HEAD}"/></clipPath>`;

function emblemFull() {
  const slashes = SLASH.map((s) => {
    // Ember sliver along the leading edge, dark core behind it: a cut that glows from inside.
    const [a, b, c, d] = s;
    return `<path d="${P(s)}" fill="#FF5A14"/><path d="${P([[a[0] + 5, a[1]], b, c, [d[0] + 5, d[1]]])}" fill="#060608"/>`;
  }).join('');
  return `
  <path d="${HALF_L}" fill="url(#g-lit)"/>
  <path d="${HALF_R}" fill="url(#g-shade)"/>
  <path d="${P(BROW_L)}" fill="#23252B" opacity=".62"/>
  <path d="${P([[256, 40], [176, 48], [104, 78], [150, 118], [256, 100]])}" fill="#fff" opacity=".30"/>
  <path d="${P([[136, 360], [192, 438], [228, 472], [256, 472], [256, 400], [196, 372]])}" fill="#000" opacity=".16"/>
  <path d="${P(mx(BROW_L))}" fill="#0B0B0D" opacity=".55"/>
  <path d="${P(CHEEK_L)}" fill="#FFFFFF" opacity=".10"/>
  <path d="${P(mx(CHEEK_L))}" fill="#000" opacity=".16"/>
  <path d="${P(CREST)}" fill="#C9CDD5"/>
  <path d="${P([[256, 6], [256, 44], [224, 52]])}" fill="#fff" opacity=".45"/>
  <g clip-path="url(#c-head)">${slashes}</g>
    <path d="${P(SPINE)}" fill="#0B0B0D"/>
  <path d="${P(JAW)}" fill="#08080A"/>
  <path d="${P([[204, 364], [256, 390], [308, 364], [304, 369], [256, 396], [208, 369]])}" fill="#FF7A1A" opacity=".9"/>
  <g stroke="#060608" stroke-width="12" stroke-linejoin="miter" stroke-miterlimit="8" fill="#060608">
    <path d="${P(EYE_L)}"/><path d="${P(EYE_R)}"/>
  </g>
  <path d="${P(EYE_L)}" fill="url(#g-eye)"/><path d="${P(EYE_R)}" fill="url(#g-eye)"/>
  <path d="${P(CORE_L)}" fill="#FFF6D8" opacity=".85"/><path d="${P(CORE_R)}" fill="#FFF6D8" opacity=".85"/>`;
}


function emblemSmall() {
  // Optical master for <= 32 px: silhouette, two fat eyes, one jaw notch. No slashes/spine/hairlines.
  const eL = [[88, 164], [244, 226], [236, 282], [104, 232]];
  return `
  <path d="${HALF_L}" fill="url(#g-lit)"/>
  <path d="${HALF_R}" fill="url(#g-shade)"/>
  <path d="${P(CREST)}" fill="#C9CDD5"/>
  <path d="${P([[196, 350], [256, 392], [316, 350], [304, 384], [256, 424], [208, 384]])}" fill="#08080A"/>
  <g stroke="#060608" stroke-width="16" stroke-linejoin="miter" fill="#060608">
    <path d="${P(eL)}"/><path d="${P(mx(eL))}"/></g>
  <path d="${P(eL)}" fill="url(#g-eye)"/><path d="${P(mx(eL))}" fill="url(#g-eye)"/>`;
}

function emblemMono(color = 'currentColor') {
  // One colour: the face is the silhouette; eyes / jaw / spine / vents / slashes are knocked out via a mask.
  const cuts = [EYE_L, EYE_R, JAW, SPINE, ...SLASH].map((s) => `<path d="${P(s)}" fill="#000"/>`).join('');
  return `<mask id="m-face" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    <path d="${HEAD}" fill="#fff"/><path d="${P(CREST)}" fill="#fff"/>${cuts}
  </mask>
  <rect width="512" height="512" fill="${color}" mask="url(#m-face)"/>`;
}

const chamfer = (inset, big = 78, small = 34) => {
  const a = inset, b = 512 - inset;
  // Asymmetric armour plate: big cuts top-left / bottom-right, small cuts on the other corners.
  return P([[a + big, a], [b - small, a], [b, a + small], [b, b - big], [b - big, b], [a + small, b], [a, b - small], [a, a + big]]);
};

function wrap(title, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="sf-title">
  <title id="sf-title">${title}</title>
  <defs>${defs}</defs>${body}
</svg>
`;
}

function tile(inner, scale = 0.8, bar = true) {
  const t = 256 * (1 - scale);
  return `
  <path d="${chamfer(4)}" fill="url(#g-plate)"/>
  <path d="${chamfer(4)}" fill="url(#g-heat)"/>
  <path d="${chamfer(7, 76, 32)}" fill="none" stroke="url(#g-rim)" stroke-width="12" stroke-linejoin="miter"/>
  ${bar ? '<path d="M436 480L480 436" stroke="#FF5A14" stroke-width="6" stroke-linecap="butt"/>' : ''}
  <g transform="translate(${t.toFixed(1)} ${(t + 6).toFixed(1)}) scale(${scale})">${inner}</g>`;
}

export const MASTERS = {
  'spaceface-emblem.svg': wrap('SpaceFace emblem', emblemFull(), defsFull),
  'spaceface-emblem-small.svg': wrap('SpaceFace emblem (small optical master)', emblemSmall(), defsFull),
  'spaceface-emblem-mono.svg': wrap('SpaceFace emblem (one colour)', emblemMono('#000000')),
  'spaceface-emblem-reverse.svg': wrap('SpaceFace emblem (reverse)', emblemMono('#EFE9DD')),
  'spaceface-launcher.svg': wrap('SpaceFace launcher icon', tile(emblemFull(), 0.92), defsFull),
  'spaceface-favicon.svg': wrap('SpaceFace favicon', tile(emblemSmall(), 0.94, false), defsFull),
};

// ---- rasterize + containers -------------------------------------------------------------------------
const PNG_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024];
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

async function raster(svg, size) {
  // Render large then downsample so the hairlines/miters resample with Lanczos instead of librsvg's nearest AA.
  const f = size <= 64 ? 8 : size <= 256 ? 4 : 2;
  const px = size * f;
  const big = await sharp(Buffer.from(svg), { density: (72 * px) / 512 }).resize(px, px).png().toBuffer();
  // Taskbar frames get a light unsharp pass: Windows resamples whichever ICO frame is nearest the
  // DPI-wanted size, and the resample smears low-contrast edges on a dark taskbar.
  const small = size <= 64;
  let pipe = sharp(big).resize(size, size, { kernel: 'lanczos3' });
  if (small) pipe = pipe.sharpen({ sigma: 0.8, m1: 0.4, m2: 0.7 });
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

function buildIco(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let off = head.length;
  frames.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    head[o] = size % 256; head[o + 1] = size % 256; head[o + 2] = 0; head[o + 3] = 0;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f.buf)]);
}

function buildIcns(parts) {
  // PNG-payload ICNS: ic07=128, ic08=256, ic09=512, ic10=1024 (macOS 10.7+).
  const chunks = parts.map(({ type, buf }) => {
    const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([h, buf]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const h = Buffer.alloc(8); h.write('icns', 0, 'ascii'); h.writeUInt32BE(total, 4);
  return Buffer.concat([h, ...chunks]);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!flag('no-svg')) for (const [name, svg] of Object.entries(MASTERS)) fs.writeFileSync(path.join(HERE, name), svg);

  const frames = {};
  for (const size of PNG_SIZES) {
    const src = size <= 32 ? MASTERS['spaceface-favicon.svg'] : MASTERS['spaceface-launcher.svg'];
    frames[size] = await raster(src, size);
    fs.writeFileSync(path.join(OUT, `spaceface-launcher-${size}.png`), frames[size]);
  }
  for (const size of [256, 512, 1024, 2048]) {
    fs.writeFileSync(path.join(OUT, `spaceface-emblem-${size}.png`), await raster(MASTERS['spaceface-emblem.svg'], size));
  }
  fs.writeFileSync(path.join(OUT, 'spaceface.ico'), buildIco(ICO_SIZES.map((size) => ({ size, buf: frames[size] }))));
  fs.writeFileSync(path.join(OUT, 'spaceface.icns'), buildIcns([
    { type: 'ic07', buf: frames[128] }, { type: 'ic08', buf: frames[256] },
    { type: 'ic09', buf: frames[512] }, { type: 'ic10', buf: frames[1024] },
  ]));
  // Browser-side files: apple-touch + a 32 px favicon fallback for engines that skip SVG icons.
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await raster(MASTERS['spaceface-launcher.svg'], 180));
  fs.writeFileSync(path.join(OUT, 'favicon-32.png'), frames[32]);
  if (!flag('no-svg')) {
    fs.mkdirSync(WEB_ICONS, { recursive: true });
    fs.writeFileSync(path.join(WEB_ICONS, 'favicon.svg'), MASTERS['spaceface-favicon.svg']);
    fs.copyFileSync(path.join(OUT, 'favicon-32.png'), path.join(WEB_ICONS, 'favicon-32.png'));
    fs.copyFileSync(path.join(OUT, 'apple-touch-icon.png'), path.join(WEB_ICONS, 'apple-touch-icon.png'));
  }

  // Validate: ICO directory round-trips through sharp and every frame decodes at its stated size.
  const ico = fs.readFileSync(path.join(OUT, 'spaceface.ico'));
  const n = ico.readUInt16LE(4);
  if (n !== ICO_SIZES.length) throw new Error('ICO directory count mismatch');
  for (let i = 0; i < n; i++) {
    const len = ico.readUInt32LE(6 + 16 * i + 8), off = ico.readUInt32LE(6 + 16 * i + 12);
    const m = await sharp(ico.subarray(off, off + len)).metadata();
    const want = ICO_SIZES[i];
    if (m.width !== want || m.height !== want || !m.hasAlpha) throw new Error(`ICO frame ${i} bad: ${m.width}x${m.height}`);
  }
  console.log(`SpaceFace icon: ${Object.keys(MASTERS).length} SVG masters, ${PNG_SIZES.length} PNGs, ICO (${n} frames), ICNS -> ${OUT}`);

  if (flag('preview')) {
    const sheet = path.join(OUT, '_preview.png');
    const tiles = [];
    const bg = { create: { width: 1180, height: 640, channels: 4, background: '#2a2c31' } };
    const place = async (buf, left, top) => tiles.push({ input: buf, left, top });
    await place(await raster(MASTERS['spaceface-launcher.svg'], 512), 20, 20);
    let x = 560;
    for (const s of [256, 128, 64, 48]) { await place(frames[s] || await raster(MASTERS['spaceface-launcher.svg'], s), x, 20); x += s + 16; }
    x = 560;
    for (const s of [32, 24, 20, 16]) { await place(frames[s], x, 300); x += s + 16; }
    // light + dark taskbar strips, nearest-neighbour 4x of 32/16
    await place(await sharp(frames[32]).resize(128, 128, { kernel: 'nearest' }).png().toBuffer(), 560, 360);
    await place(await sharp(frames[16]).resize(128, 128, { kernel: 'nearest' }).png().toBuffer(), 720, 360);
    await place(await raster(MASTERS['spaceface-emblem.svg'], 160), 880, 360);
    await sharp(bg).composite(tiles).png().toFile(sheet);
    console.log('preview ->', sheet);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
