#!/usr/bin/env node
// Pair .devshots/optic-materials/<tag>.png with <tag>.cells.json (screen positions of
// every lattice cell at shot time) and report what each kind actually looks like on
// glass: mean colour, luminance, specular-pixel share. This is the stranger test read
// out numerically — three kinds must land in three visually separable bands.
//   node scripts/scratch-optic-evidence.mjs gallery_close
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const tag = process.argv[2] || 'gallery_close';
const pngPath = path.join(ROOT, '.devshots/optic-materials', `${tag}.png`);
const cellsPath = path.join(ROOT, '.devshots/optic-materials', `${tag}.cells.json`);

// --- tiny PNG decoder (8-bit RGB/RGBA) ---
const buf = readFileSync(pngPath);
let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos); pos += 4;
  const type = buf.toString('ascii', pos, pos + 4); pos += 4;
  const data = buf.subarray(pos, pos + len); pos += len + 4;
  if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
}
const ch = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = w * ch;
const px = Buffer.alloc(h * stride);
let rp = 0;
for (let y = 0; y < h; y++) {
  const filter = raw[rp++];
  for (let x = 0; x < stride; x++) {
    const v = raw[rp + x];
    const a = x >= ch ? px[y * stride + x - ch] : 0;
    const b = y > 0 ? px[(y - 1) * stride + x] : 0;
    const c = (x >= ch && y > 0) ? px[(y - 1) * stride + x - ch] : 0;
    let out;
    switch (filter) {
      case 0: out = v; break;
      case 1: out = v + a; break;
      case 2: out = v + b; break;
      case 3: out = v + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: throw new Error(`filter ${filter}`);
    }
    px[y * stride + x] = out & 0xff;
  }
  rp += stride;
}

const report = JSON.parse(readFileSync(cellsPath, 'utf8'));
const sx = w / report.width, sy = h / report.height;

// A cell's visible body is a circle of ~0.8 of its projected radius; sample the core
// half so neighbours/background don't pollute the read.
function patchStats(cx, cy, r) {
  const rr = Math.max(3, Math.min(26, r * 0.55));
  let rs = 0, gs = 0, bs = 0, n = 0, spec = 0, lit = 0;
  for (let y = Math.max(0, Math.floor(cy - rr)); y <= Math.min(h - 1, Math.round(cy + rr)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rr)); x <= Math.min(w - 1, Math.round(cx + rr)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rr * rr) continue;
      const o = y * stride + x * ch;
      const R = px[o], G = px[o + 1], B = px[o + 2];
      rs += R; gs += G; bs += B; n++;
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (l > 30) lit++;
      if (l > 170) spec++;
    }
  }
  return { r: rs / n, g: gs / n, b: bs / n, lum: (0.2126 * rs + 0.7152 * gs + 0.0722 * bs) / n, specShare: spec / n, litShare: lit / n, n };
}

const rows = [];
for (const cell of report.cells) {
  if (!cell.onScreen) continue;
  const cx = cell.x * sx, cy = cell.y * sy;
  const rr = Math.max(3, Math.min(26, cell.screenR * sx * 0.55));
  if (cx - rr < 0 || cx + rr > w || cy - rr < 0 || cy + rr > h) continue; // patch must fit the frame
  const s = patchStats(cx, cy, cell.screenR * sx);
  if (!(s.n > 0)) continue;
  rows.push({ id: cell.id, kind: cell.kind, x: Math.round(cx), y: Math.round(cy), ...s });
}

console.log(`${tag}: ${report.cells.length} lattice cells, ${rows.length} in frame — patch means`);
const byKind = {};
for (const r of rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.x - b.x)) {
  console.log(`  ${r.kind.padEnd(7)} ${String(r.id).padEnd(28)} @(${r.x},${r.y})  rgb(${r.r.toFixed(0)},${r.g.toFixed(0)},${r.b.toFixed(0)})  lum=${r.lum.toFixed(1)}  lit=${(r.litShare * 100).toFixed(0)}%  spec=${(r.specShare * 100).toFixed(0)}%`);
  (byKind[r.kind] = byKind[r.kind] || []).push(r);
}
console.log('\nkind aggregates (in-frame):');
for (const [kind, list] of Object.entries(byKind)) {
  const m = (f) => list.reduce((s, r) => s + f(r), 0) / list.length;
  console.log(`  ${kind.padEnd(7)} n=${list.length}  lum=${m((r) => r.lum).toFixed(1)}  rgb=(${m((r) => r.r).toFixed(0)},${m((r) => r.g).toFixed(0)},${m((r) => r.b).toFixed(0)})  spec=${(m((r) => r.specShare) * 100).toFixed(0)}%  lit=${(m((r) => r.litShare) * 100).toFixed(0)}%`);
}
