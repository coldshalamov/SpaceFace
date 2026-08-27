#!/usr/bin/env node
// Measure a lookdev still the way the Hornet reviewers measured it, so the same numbers can be
// re-derived by anyone instead of re-argued.
//
// WHY THIS EXISTS
// ---------------
// Three reviewers judged Hornet cycle 54 and the useful half of each review was arithmetic, not
// adjectives: silhouette bbox, how much of the render background is enclosed by the ship, how the
// values are distributed, and whether the drive aperture is darker than its own casing. Those are
// the numbers the next cycle has to beat. Re-deriving them by hand each time is slow and, worse,
// invites a kinder measurement when the result is disappointing.
//
// Everything here is computed from the PNG alone — no Blender, no renderer, no scene access.
//
// WHAT IT REPORTS
//   silhouette   bbox in px, and length : height
//   enclosed     background regions fully surrounded by ship — "daylight through the hull".
//                Reported at two sizes, because the distinction matters. A reviewer counting by
//                hand discarded "~190 specks of 1-4 px, antialiasing on dark seams, not
//                player-visible" and reported only the rest. The first version of this script
//                counted every speck and returned 1012 regions where that reviewer returned 1 —
//                same image, same defect, twenty times the number, because of a threshold nobody
//                had written down. NOTABLE is what a player can see; total is every region.
//   values       share of ship pixels dark (<0.20), mid, and hot (>0.75). A-list wants roughly
//                15 / 60 / 8; cycle 54 measured 3.4 / 76.8 / 2.8.
//   region       with --region x,y,r: median luminance inside a disc vs the ring just outside it.
//                A drive throat must read DARKER than its own casing. Cycle 54 measured 72 inside
//                against 76 outside on one engine, and 96 against 70 on the other — the second is
//                brighter inside, the exact inverse of a throat.
//
// USE IT AS A RELATIVE INSTRUMENT, NOT AN ABSOLUTE ONE.
// Against the same two Hornet stills a hand reviewer reported 74 enclosed regions (4.1% of the
// ship) falling to 1 (0.05%). This script reports 16 (1.2%) falling to 13 (0.34%). Direction and
// magnitude of improvement agree; the absolute counts do not, because "is this pixel background"
// has no single right threshold and small changes to it move the count by an order of magnitude.
// Tuning the constants until they matched one reviewer would be fitting to a single observation.
// So: trust before/after on the SAME camera, and do not quote these counts as if they were the
// reviewer's, or the reviewer's as if they were these.
//
// The background colour is sampled from the image corners, so it needs no configuration and adapts
// if the studio backdrop changes.
//
// Usage:
//   node scripts/measure-ship-still.mjs <still.png> [--region x,y,r] [--json]

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  PLAY_CHASE_CLOSE_WIDTH_FRAC,
  PLAY_CHASE_WIDTH_FRAC,
} from './lib/chase-camera-occupancy.mjs';

function decodePng(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit PNGs supported, got ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  // Undo PNG per-scanline filtering. Each line is prefixed by its filter byte.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const dst = out.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? dst[i - channels] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= channels ? up[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      dst[i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function analyse(path, region) {
  const img = decodePng(path);
  const { width, height, channels, data } = img;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Backdrop = the corner colour. Studio stills use a flat backdrop, so corners are reliable.
  const corners = [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3]].map(([x, y]) => at(x, y));
  const bg = corners[0];
  // Tolerance 2, not 6. At 6 the mask swallows dark hull pixels that merely sit near the backdrop
  // value and reports them as holes: on Hornet cycle 54 that inflated the count from 3 regions to
  // 31. A reviewer measuring the same image by hand used 2. Match them, and stay conservative —
  // over-reporting daylight is the failure mode that wastes a cycle chasing a hole that is a
  // shadow.
  const isBg = (x, y, tol = 2) => {
    const [r, g, b] = at(x, y);
    return Math.abs(r - bg[0]) <= tol && Math.abs(g - bg[1]) <= tol && Math.abs(b - bg[2]) <= tol;
  };

  // Silhouette bbox and ship pixel count.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let shipPixels = 0;
  const shipMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBg(x, y)) continue;
      shipMask[y * width + x] = 1;
      shipPixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Background regions that do NOT touch the frame edge are enclosed by ship — daylight through
  // the hull. Flood from the border first; whatever background is left over is enclosed.
  const reached = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (reached[i] || shipMask[i]) return;
    reached[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  let enclosedPixels = 0;
  const seen = new Uint8Array(width * height);
  const regions = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (shipMask[i] || reached[i] || seen[i]) continue;
      let size = 0;
      const local = [i];
      seen[i] = 1;
      let rminX = x; let rmaxX = x; let rminY = y; let rmaxY = y;
      while (local.length) {
        const j = local.pop();
        const jx = j % width;
        const jy = (j - jx) / width;
        size++;
        if (jx < rminX) rminX = jx;
        if (jx > rmaxX) rmaxX = jx;
        if (jy < rminY) rminY = jy;
        if (jy > rmaxY) rmaxY = jy;
        for (const [nx, ny] of [[jx - 1, jy], [jx + 1, jy], [jx, jy - 1], [jx, jy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (shipMask[n] || reached[n] || seen[n]) continue;
          seen[n] = 1;
          local.push(n);
        }
      }
      enclosedPixels += size;
      regions.push({ size, x: rminX, y: rminY, w: rmaxX - rminX + 1, h: rmaxY - rminY + 1 });
    }
  }
  regions.sort((a, b) => b.size - a.size);
  // Below this a region is a seam artefact, not a hole a player can see. Matches the size a
  // hand reviewer discarded as antialiasing.
  const NOTABLE_PX = 20;
  const notable = regions.filter((g) => g.size >= NOTABLE_PX);
  const notablePixels = notable.reduce((a, g) => a + g.size, 0);

  // Value distribution over ship pixels only.
  let dark = 0;
  let hot = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!shipMask[y * width + x]) continue;
      const [r, g, b] = at(x, y);
      const l = lum(r, g, b) / 255;
      if (l < 0.20) dark++;
      else if (l > 0.75) hot++;
    }
  }

  let regionReport = null;
  if (region) {
    const [cx, cy, rad] = region;
    const inside = [];
    const outside = [];
    for (let y = Math.max(0, cy - rad * 2); y < Math.min(height, cy + rad * 2); y++) {
      for (let x = Math.max(0, cx - rad * 2); x < Math.min(width, cx + rad * 2); x++) {
        if (!shipMask[y * width + x]) continue;
        const d = Math.hypot(x - cx, y - cy);
        const [r, g, b] = at(x, y);
        const l = lum(r, g, b);
        if (d <= rad) inside.push(l);
        else if (d <= rad * 1.6) outside.push(l);
      }
    }
    const median = (a) => (a.length ? a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)] : null);
    const insideMedian = median(inside);
    const outsideMedian = median(outside);
    regionReport = {
      insideMedian: insideMedian == null ? null : Math.round(insideMedian),
      casingMedian: outsideMedian == null ? null : Math.round(outsideMedian),
      darkerThanCasing: insideMedian != null && outsideMedian != null && insideMedian < outsideMedian,
    };
  }

  return {
    path,
    image: { width, height },
    backdrop: bg,
    silhouette: {
      x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      lengthToHeight: +((maxX - minX + 1) / (maxY - minY + 1)).toFixed(2),
      pixels: shipPixels,
      widthFrac: +((maxX - minX + 1) / width).toFixed(3),
      heightFrac: +((maxY - minY + 1) / height).toFixed(3),
    },
    enclosedBackground: {
      notableRegions: notable.length,
      notablePixels,
      notableShareOfShip: +((notablePixels / Math.max(1, shipPixels)) * 100).toFixed(2),
      totalRegions: regions.length,
      totalPixels: enclosedPixels,
      largest: regions.slice(0, 5),
    },
    values: {
      darkPct: +((dark / Math.max(1, shipPixels)) * 100).toFixed(1),
      midPct: +(((shipPixels - dark - hot) / Math.max(1, shipPixels)) * 100).toFixed(1),
      hotPct: +((hot / Math.max(1, shipPixels)) * 100).toFixed(1),
    },
    region: regionReport,
  };
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const regionArg = argv.find((a) => a.startsWith('--region='));
const region = regionArg ? regionArg.slice('--region='.length).split(',').map(Number) : null;
const paths = argv.filter((a) => !a.startsWith('--'));
if (paths.length === 0) {
  console.error('usage: node scripts/measure-ship-still.mjs <still.png> [--region=x,y,r] [--json]');
  process.exit(2);
}

const results = paths.map((p) => analyse(p, region));
if (asJson) {
  console.log(JSON.stringify({ schema: 'spaceface.shipStillMeasure.v1', results }, null, 2));
} else {
  for (const r of results) {
    console.log(r.path);
    console.log(`  silhouette   ${r.silhouette.w} x ${r.silhouette.h} px  (${r.silhouette.lengthToHeight} : 1)`
      + `  width ${Math.round(r.silhouette.widthFrac * 100)}% of frame`);
    const wf = r.silhouette.widthFrac;
    const [defaultMin] = PLAY_CHASE_WIDTH_FRAC;
    const [closeMin, closeMax] = PLAY_CHASE_CLOSE_WIDTH_FRAC;
    if (wf > closeMax) {
      console.log('  chase        TOO CLOSE — ship fills the frame. This is a beauty shot, not play_chase.');
    } else if (wf >= closeMin) {
      console.log('  chase        close-zoom band (D=58, ~20–55%). Default play_chase should be ~8–22%.');
    } else if (wf >= defaultMin) {
      console.log('  chase        default-play band (D=144).');
    } else {
      console.log('  chase        ship is a speck or invalid crop.');
    }
    console.log(`  enclosed bg  ${r.enclosedBackground.notableRegions} region(s) >=20px, `
      + `${r.enclosedBackground.notablePixels} px, ${r.enclosedBackground.notableShareOfShip}% of the ship`
      + `   (${r.enclosedBackground.totalRegions} incl. seam specks)`);
    for (const g of r.enclosedBackground.largest) {
      if (g.size < 20) continue;
      console.log(`                 ${g.size} px at (${g.x},${g.y}) ${g.w}x${g.h}`);
    }
    console.log(`  values       dark ${r.values.darkPct}%  mid ${r.values.midPct}%  hot ${r.values.hotPct}%`
      + '   (A-list ~15 / 60 / 8)');
    if (r.region) {
      const verdict = r.region.darkerThanCasing ? 'darker than casing — reads as a throat'
        : 'NOT darker than casing — reads as a cap';
      console.log(`  region       inside ${r.region.insideMedian} vs casing ${r.region.casingMedian}  ${verdict}`);
    }
  }
}
