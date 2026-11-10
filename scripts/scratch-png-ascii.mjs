#!/usr/bin/env node
// Decode a PNG screenshot and print a coarse luminance/hue map so an agent can
// "look" at a frame without an image viewer. Usage:
//   node scripts/scratch-png-ascii.mjs <file.png> [cols]
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const COLS = Math.min(160, Number(process.argv[3]) || 100);
// optional crop as fractions: x0 y0 x1 y1 (0..1)
const CROP = process.argv.slice(4).map(Number);
const buf = readFileSync(file);

// minimal PNG parse: IHDR + IDAT, 8-bit RGB/RGBA only
let pos = 8;
let w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos); pos += 4;
  const type = buf.toString('ascii', pos, pos + 4); pos += 4;
  const data = buf.subarray(pos, pos + len); pos += len + 4; // skip CRC
  if (type === 'IHDR') {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
}
if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
  console.error(`unsupported PNG: depth=${bitDepth} colorType=${colorType}`);
  process.exit(1);
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
      default: throw new Error(`bad filter ${filter}`);
    }
    px[y * stride + x] = out & 0xff;
  }
  rp += stride;
}

const cx0 = CROP.length === 4 ? CROP[0] : 0, cy0 = CROP.length === 4 ? CROP[1] : 0;
const cx1 = CROP.length === 4 ? CROP[2] : 1, cy1 = CROP.length === 4 ? CROP[3] : 1;
const rows = Math.round(COLS * ((h * (cy1 - cy0)) / (w * (cx1 - cx0))) * 0.5);
const glyphs = ' .:-=+*#%@';
const hueMarks = [];
const stats = { bright: 0, mid: 0, dark: 0, cyan: 0, warm: 0 };
for (let r = 0; r < rows; r++) {
  let line = '';
  let hueLine = '';
  for (let c = 0; c < COLS; c++) {
    const fx0 = cx0 + c * (cx1 - cx0) / COLS, fx1 = cx0 + (c + 1) * (cx1 - cx0) / COLS;
    const fy0 = cy0 + r * (cy1 - cy0) / rows, fy1 = cy0 + (r + 1) * (cy1 - cy0) / rows;
    const x0 = Math.floor(fx0 * w), x1 = Math.max(x0 + 1, Math.floor(fx1 * w));
    const y0 = Math.floor(fy0 * h), y1 = Math.max(y0 + 1, Math.floor(fy1 * h));
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = y * stride + x * ch;
        rs += px[o]; gs += px[o + 1]; bs += px[o + 2]; n++;
      }
    }
    const R = rs / n, G = gs / n, B = bs / n;
    const L = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    line += glyphs[Math.min(glyphs.length - 1, Math.floor(L * glyphs.length))];
    if (L > 0.55) stats.bright++;
    else if (L > 0.22) stats.mid++;
    else stats.dark++;
    if (B > R * 1.25 && L > 0.3) { hueLine += 'C'; stats.cyan++; }
    else if (R > B * 1.2 && L > 0.3) { hueLine += 'W'; stats.warm++; }
    else hueLine += ' ';
  }
  console.log(line);
  hueMarks.push(hueLine);
}
console.log('\n-- hue marks (C=cyan/blue-tinted, W=warm/orange-tinted, bright cells only) --');
for (const l of hueMarks) console.log(l);
console.log(`\n${file} ${w}x${h} -> ${COLS}x${rows} | cells bright=${stats.bright} mid=${stats.mid} dark=${stats.dark} cyan=${stats.cyan} warm=${stats.warm}`);
