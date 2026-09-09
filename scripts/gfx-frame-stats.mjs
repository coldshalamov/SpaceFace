// Measure the background-fill characteristics of a frame, so "the background reads as empty" becomes
// a number instead of a matter of taste.
//
// The independent reviewer scores our deep-flight frame `background: 1` and `composition: 1` against
// 2020s reference frames. Both notes come down to the same observable: how much of the frame carries
// any signal at all, and how much of it is dead black. This measures exactly that, on our frame and
// on the references, using the same code path so the numbers are comparable.
//
// Reported per image:
//   deadFrac     fraction of pixels below the near-black cutoff (the "void" share)
//   midFrac      fraction in the low-mid band — where nebula/dust/macro structure actually lives
//   meanLuma     average luminance
//   p50/p90/p99  luminance percentiles
//   satMean      mean saturation of non-dead pixels (is the void coloured, or grey?)
//
// HUD pixels would pollute this, so a margin crop is available and used for our shots.
//
// Run: node scripts/gfx-frame-stats.mjs <img...> [--crop 0.12] [--json out.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const cropArg = argv.indexOf('--crop');
const CROP = cropArg >= 0 ? Number(argv[cropArg + 1]) : 0;
const jsonArg = argv.indexOf('--json');
const JSON_OUT = jsonArg >= 0 ? argv[jsonArg + 1] : null;

const DEAD = 0.045;     // below this reads as black on any display
const MID_HI = 0.42;    // above this is a highlight (star core, planet lit face), not fill

let decode;
try {
  const jpeg = require('jpeg-js');
  decode = (buf) => {
    const r = jpeg.decode(buf, { useTArray: true });
    return { w: r.width, h: r.height, data: r.data };
  };
} catch {
  console.error('[stats] jpeg-js not available — cannot decode');
  process.exit(2);
}

const rows = [];
for (const f of files) {
  if (!existsSync(f)) { console.error(`[stats] missing ${f}`); continue; }
  let img;
  try { img = decode(readFileSync(f)); } catch (e) { console.error(`[stats] ${f}: ${e.message}`); continue; }
  const { w, h, data } = img;
  const x0 = Math.floor(w * CROP), x1 = Math.ceil(w * (1 - CROP));
  const y0 = Math.floor(h * CROP), y1 = Math.ceil(h * (1 - CROP));

  const lumas = [];
  let dead = 0, mid = 0, satSum = 0, satN = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas.push(l);
      if (l < DEAD) { dead++; continue; }
      if (l < MID_HI) mid++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0) { satSum += (mx - mn) / mx; satN++; }
    }
  }
  // Tile-local structure coverage — the metric that actually answers "is there content here?".
  //
  // deadFrac and midFrac are both confounded by the BLACK FLOOR: our median pixel is luma 0.004
  // (byte ~1) while reference frames bottom out around byte 12 (a filmic toe). A flat +0.02 luma lift
  // would therefore collapse deadFrac from 83.7% to single digits while adding no content at all.
  // A constant offset does not change local standard deviation, so tiling the frame and asking what
  // fraction of tiles carry any variation is immune to that lift — and it correctly credits sparse
  // content like the parallax debris, which creates local variance exactly where it sits.
  const TILE = 16;
  const STRUCT_STDEV = 0.01;
  let tiles = 0, structured = 0;
  for (let ty = y0; ty + TILE <= y1; ty += TILE) {
    for (let tx = x0; tx + TILE <= x1; tx += TILE) {
      let s = 0, ss = 0;
      for (let y = ty; y < ty + TILE; y++) {
        for (let x = tx; x < tx + TILE; x++) {
          const i = (y * w + x) * 4;
          const l = 0.2126 * data[i] / 255 + 0.7152 * data[i + 1] / 255 + 0.0722 * data[i + 2] / 255;
          s += l; ss += l * l;
        }
      }
      const cnt = TILE * TILE;
      const varr = Math.max(0, ss / cnt - (s / cnt) ** 2);
      tiles++;
      if (Math.sqrt(varr) > STRUCT_STDEV) structured++;
    }
  }

  lumas.sort((a, b) => a - b);
  const pct = (p) => lumas[Math.min(lumas.length - 1, Math.floor(lumas.length * p))] || 0;
  const n = lumas.length || 1;
  rows.push({
    file: f.replace(/\\/g, '/').split('/').slice(-2).join('/'),
    deadFrac: +(dead / n).toFixed(4),
    midFrac: +(mid / n).toFixed(4),
    structFrac: +(tiles ? structured / tiles : 0).toFixed(4),
    meanLuma: +(lumas.reduce((s, v) => s + v, 0) / n).toFixed(4),
    p50: +pct(0.50).toFixed(4),
    p90: +pct(0.90).toFixed(4),
    p99: +pct(0.99).toFixed(4),
    satMean: +(satN ? satSum / satN : 0).toFixed(4),
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('image', 40), pad('dead%', 8), pad('struct%', 9), pad('mid%', 8), pad('mean', 8), pad('p50', 8), pad('sat', 7));
for (const r of rows) {
  console.log(pad(r.file, 40), pad((r.deadFrac * 100).toFixed(1), 8), pad((r.structFrac * 100).toFixed(1), 9),
    pad((r.midFrac * 100).toFixed(1), 8),
    pad(r.meanLuma.toFixed(3), 8), pad(r.p50.toFixed(3), 8), pad(r.satMean.toFixed(3), 7));
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ crop: CROP, dead: DEAD, midHi: MID_HI, rows }, null, 2));
