// Top-down schematic captures of the four arenas.
// Colors are the ORRERY tokens (src/ui/orrery/tokens.js): void, ice, hand, ink, danger.
// These are prototype drawings, not shipping-camera screenshots.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENAS } from './arenas.js';

const VOID = [5, 7, 10, 255];
const ICE = [143, 203, 255, 255];
const HAND = [242, 185, 80, 255];
const HAND_HOT = [255, 217, 140, 255];
const INK = [232, 226, 212, 255];
const DANGER = [255, 80, 56, 255];
const PHOS = [223, 238, 255, 255];
const DIM = [80, 86, 78, 255];

const W = 320;
const H = 180;

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '11100', '10010', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10010', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}

function zlibStore(raw) {
  const parts = [Buffer.from([0x78, 0x01])];
  let off = 0;
  while (off < raw.length) {
    const n = Math.min(65535, raw.length - off);
    const header = Buffer.alloc(5);
    header[0] = off + n >= raw.length ? 1 : 0;
    header.writeUInt16LE(n, 1);
    header.writeUInt16LE((n ^ 0xffff) & 0xffff, 3);
    parts.push(header, raw.subarray(off, off + n));
    off += n;
  }
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(adler32(raw));
  parts.push(sum);
  return Buffer.concat(parts);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fill(px, color) {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = color[3];
  }
}

function plot(px, x, y, color) {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = (iy * W + ix) * 4;
  px[i] = color[0];
  px[i + 1] = color[1];
  px[i + 2] = color[2];
  px[i + 3] = color[3];
}

function disc(px, x, y, r, color) {
  const r2 = r * r;
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= r2) plot(px, x + xx, y + yy, color);
    }
  }
}

function ring(px, x, y, r, color) {
  const outer = r * r;
  const inner = (r - 2) * (r - 2);
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      const d = xx * xx + yy * yy;
      if (d <= outer && d >= inner) plot(px, x + xx, y + yy, color);
    }
  }
}

function rect(px, x, y, w, h, color) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) plot(px, x + xx, y + yy, color);
  }
}

function text(px, x, y, message, color) {
  let cx = x;
  for (const ch of message) {
    const rows = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        if (rows[row][col] === '1') plot(px, cx + col, y + row, color);
      }
    }
    cx += 6;
  }
}

function frame(arena) {
  const px = Buffer.alloc(W * H * 4);
  fill(px, VOID);
  const scale = 1.35;
  const ox = W / 2;
  const oy = H / 2 + 8;
  const X = (x) => ox + x * scale;
  const Z = (z) => oy + z * scale;
  const b = arena.bounds;
  rect(px, X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, 2, DIM);
  rect(px, X(b.minX), Z(b.maxZ), (b.maxX - b.minX) * scale, 2, DIM);
  rect(px, X(b.minX), Z(b.minZ), 2, (b.maxZ - b.minZ) * scale, DIM);
  rect(px, X(b.maxX), Z(b.minZ), 2, (b.maxZ - b.minZ) * scale, DIM);
  if (arena.posts) {
    for (const post of arena.posts) disc(px, X(post.x), Z(post.z), 5, HAND);
    rect(px, X(-arena.goal.aperture), Z(arena.goal.plane) - 1, arena.goal.aperture * 2 * scale, 3, HAND_HOT);
  }
  if (arena.bumpers) {
    for (const bumper of arena.bumpers) ring(px, X(bumper.x), Z(bumper.z), 7, HAND);
  }
  if (arena.rails) {
    const g = arena.rails;
    rect(px, X(g.left), Z(g.north), 3, (g.south - g.north) * scale, INK);
    rect(px, X(g.right), Z(g.north), 3, (g.south - g.north) * scale, INK);
    rect(px, X(g.left), Z(g.south), (g.right - g.left) * scale, 3, INK);
    rect(px, X(g.left), Z(g.north), (g.right - g.left) * 0.32 * scale, 3, INK);
    rect(px, X(g.gap), Z(g.north), (g.right - g.gap) * scale, 3, INK);
    rect(px, X(-arena.goal.aperture), Z(g.north) - 2, arena.goal.aperture * 2 * scale, 4, HAND_HOT);
  }
  if (arena.pads) {
    for (const pad of arena.pads) ring(px, X(pad.x), Z(pad.z), 8, ICE);
    disc(px, X(arena.stone.x), Z(arena.stone.z), 4, PHOS);
  }
  if (arena.guard) ring(px, X(arena.guard.x), Z(arena.guard.z), 5, DANGER);
  if (arena.pen) ring(px, X(arena.pen.x), Z(arena.pen.z), 16, ICE);
  if (arena.zones) {
    for (const zone of arena.zones) ring(px, X(zone.x), Z(zone.z), 8, HAND);
    disc(px, X(arena.payload.x), Z(arena.payload.z), 4, PHOS);
  }
  if (arena.pocket) {
    disc(px, X(arena.pocket.x), Z(arena.pocket.z), 6, ICE);
    ring(px, X(arena.well.x), Z(arena.well.z), 14, HAND);
    disc(px, X(arena.pillar.x), Z(arena.pillar.z), 4, DANGER);
    disc(px, X(arena.magnetBall.x), Z(arena.magnetBall.z), 3, PHOS);
  }
  if (arena.ball && arena.posts) disc(px, X(arena.ball.x), Z(arena.ball.z), 4, PHOS);
  if (arena.keeper) disc(px, X(arena.keeper.x), Z(arena.keeper.z), 6, DANGER);
  text(px, 8, 8, arena.short, HAND_HOT);
  text(px, 8, 18, 'LEAGUE', INK);
  return px;
}

export const GALLERY_FILES = Object.freeze([
  ['yard', 'bracket-yard.png'],
  ['house', 'cushion-hall.png'],
  ['slip', 'long-ice.png'],
  ['dock', 'field-dock.png'],
]);

export function renderArena(id) {
  const arena = ARENAS[id];
  return encodePng(W, H, frame(arena));
}

export function writeGallery(dir = join(dirname(fileURLToPath(import.meta.url)), 'gallery')) {
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [id, name] of GALLERY_FILES) {
    const path = join(dir, name);
    writeFileSync(path, renderArena(id));
    written.push(path);
  }
  return written;
}

export function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
