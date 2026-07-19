/**
 * Minimal deterministic PNG encoder (RGBA8). No external dependencies.
 * Produces stable bytes for identical pixel input (fixed window zlib via stored blocks
 * when compression disabled; uses Node zlib for deflate with fixed level+strategy).
 */
import { deflateSync } from 'node:zlib';

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function chunk(typeStr, data) {
  const type = Buffer.from(typeStr, 'ascii');
  const len = u32be(data.length);
  const crcBuf = Buffer.concat([type, data]);
  const crc = u32be(crc32(crcBuf));
  return Buffer.concat([Buffer.from(len), type, data, Buffer.from(crc)]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba row-major top-down RGBA
 * @returns {Buffer}
 */
export function encodePngRgba(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA length mismatch: expected ${width * height * 4}, got ${rgba.length}`);
  }
  // Filter type 0 (None) per scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    const src = y * width * 4;
    raw.set(rgba.subarray(src, src + width * 4), rowStart + 1);
  }

  // Deterministic zlib: level 9, default strategy, no dictionary
  const compressed = deflateSync(raw, { level: 9, strategy: 0, window: 15 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
