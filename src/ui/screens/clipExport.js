// Clip file encoding (PQ-160.01). GIF89a from RGBA frames, plus a raw-RGB ISO-BMFF MP4
// container the packaged host can save. No GPU, no ffmpeg — recorded buffers or a software
// title card are enough. Sharing is a file, never a service.

export const CLIP_EXPORT_FORMATS = Object.freeze(['gif', 'mp4']);
export const CLIP_EXPORT_UNAVAILABLE = 'gpu-export-unavailable';

const FONT_5X7 = {
  ' ': 0,
  '-': 0x0108,
  '.': 0x4000,
  ':': 0x0a00,
  '0': 0x3a53a, '1': 0x11911, '2': 0x39297, '3': 0x3925c,
  '4': 0x2aa7c, '5': 0x3c25c, '6': 0x3c573, '7': 0x39210,
  '8': 0x3a53e, '9': 0x3a53c, A: 0x3a57a, B: 0x3a56e,
  C: 0x3c10e, D: 0x3a52e, E: 0x3c197, F: 0x3c194, G: 0x3c53e,
  H: 0x2b57a, I: 0x3911c, J: 0x1105c, K: 0x2b59a, L: 0x21087,
  M: 0x2f57a, N: 0x2d56a, O: 0x3a53a, P: 0x3a594, Q: 0x3a56b,
  R: 0x3a59a, S: 0x3c25c, T: 0x39110, U: 0x2a53a, V: 0x2a548,
  W: 0x2a5ea, X: 0x2a4aa, Y: 0x2a510, Z: 0x39297,
};

function asBytes(input) {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return Uint8Array.from(input);
  return null;
}

function concatBytes(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function u16le(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u32le(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function box(type, payload) {
  const body = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  const out = new Uint8Array(8 + body.length);
  out.set(u32be(out.length), 0);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(body, 8);
  return out;
}

/** Unique RGB palette, capped at 256. Excess colours fold to 3-3-2. */
export function buildPalette(frames, width, height) {
  const seen = new Map();
  const colors = [];
  const area = width * height;
  for (const frame of frames) {
    const bytes = asBytes(frame);
    if (!bytes) continue;
    for (let i = 0; i < area; i += 1) {
      const o = i * 4;
      const r = bytes[o] || 0;
      const g = bytes[o + 1] || 0;
      const b = bytes[o + 2] || 0;
      const key = (r << 16) | (g << 8) | b;
      if (seen.has(key)) continue;
      if (colors.length < 256) {
        seen.set(key, colors.length);
        colors.push([r, g, b]);
      } else {
        const q = ((r & 0xe0) << 16) | ((g & 0xe0) << 8) | (b & 0xc0);
        if (!seen.has(q)) {
          seen.set(q, colors.length % 256);
        }
        seen.set(key, seen.get(q));
      }
    }
  }
  if (!colors.length) colors.push([0, 0, 0]);
  return { colors, seen };
}

function indexFrame(bytes, width, height, palette) {
  const area = width * height;
  const out = new Uint8Array(area);
  const src = asBytes(bytes);
  for (let i = 0; i < area; i += 1) {
    const o = i * 4;
    const r = src ? src[o] || 0 : 0;
    const g = src ? src[o + 1] || 0 : 0;
    const b = src ? src[o + 2] || 0 : 0;
    const key = (r << 16) | (g << 8) | b;
    let idx = palette.seen.get(key);
    if (idx == null) {
      const q = ((r & 0xe0) << 16) | ((g & 0xe0) << 8) | (b & 0xc0);
      idx = palette.seen.get(q) || 0;
    }
    out[i] = idx;
  }
  return out;
}

function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const dict = new Map();
  const bytes = [];
  let acc = 0;
  let bits = 0;

  function emit(code) {
    acc |= (code << bits) >>> 0;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  }

  function resetDict() {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = eoi + 1;
  }

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = prefix + ',' + k;
    if (dict.has(key)) {
      prefix = dict.get(key);
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      dict.set(key, nextCode);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      emit(clear);
      resetDict();
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) bytes.push(acc & 0xff);
  return bytes;
}

function gifSubBlocks(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    out.push(n);
    for (let j = 0; j < n; j += 1) out.push(data[i + j]);
  }
  out.push(0);
  return out;
}

/**
 * Encode RGBA frames as an animated GIF89a. `delayCs` is centiseconds per frame (default 10 = 100 ms).
 */
export function encodeClipGif(frames, { width, height, delayCs = 10 } = {}) {
  if (!Array.isArray(frames) || !frames.length) return null;
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  const palette = buildPalette(frames, w, h);
  let paletteSize = 2;
  while (paletteSize < palette.colors.length && paletteSize < 256) paletteSize *= 2;
  const minCodeSize = Math.max(2, Math.round(Math.log2(paletteSize)));
  const gctCount = 1 << minCodeSize;
  const gctFlag = 0x80 | 0x70 | (minCodeSize - 1);
  const header = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    ...u16le(w), ...u16le(h), gctFlag, 0x00, 0x00,
  ];
  const gct = new Uint8Array(gctCount * 3);
  for (let i = 0; i < palette.colors.length; i += 1) {
    gct[i * 3] = palette.colors[i][0];
    gct[i * 3 + 1] = palette.colors[i][1];
    gct[i * 3 + 2] = palette.colors[i][2];
  }
  const netscape = [
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00,
  ];
  const delay = Math.max(2, Math.min(255, Math.floor(Number(delayCs) || 10)));
  const chunks = [Uint8Array.from(header), gct, Uint8Array.from(netscape)];
  for (const frame of frames) {
    const indexed = indexFrame(frame, w, h, palette);
    const lzw = lzwEncode(indexed, minCodeSize);
    const gce = [0x21, 0xf9, 0x04, 0x00, ...u16le(delay), 0x00, 0x00];
    const img = [0x2c, ...u16le(0), ...u16le(0), ...u16le(w), ...u16le(h), 0x00, minCodeSize];
    chunks.push(Uint8Array.from(gce), Uint8Array.from(img), Uint8Array.from(gifSubBlocks(lzw)));
  }
  chunks.push(Uint8Array.from([0x3b]));
  return concatBytes(chunks);
}

function rgb24(frames, width, height) {
  const area = width * height;
  const out = [];
  for (const frame of frames) {
    const src = asBytes(frame);
    const rgb = new Uint8Array(area * 3);
    for (let i = 0; i < area; i += 1) {
      const o = i * 4;
      rgb[i * 3] = src ? src[o] || 0 : 0;
      rgb[i * 3 + 1] = src ? src[o + 1] || 0 : 0;
      rgb[i * 3 + 2] = src ? src[o + 2] || 0 : 0;
    }
    out.push(rgb);
  }
  return out;
}

/**
 * Minimal ISO-BMFF MP4 with one uncompressed RGB track. Structurally a real MP4 (ftyp/moov/mdat);
 * GIF is the playable export. Hosts that cannot decode raw RGB still get a saveable file.
 */
export function encodeClipMp4(frames, { width, height, fps = 10 } = {}) {
  if (!Array.isArray(frames) || !frames.length) return null;
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  const rate = Math.max(1, Math.floor(Number(fps) || 10));
  const rgbFrames = rgb24(frames, w, h);
  const frameSize = w * h * 3;
  const mdatBody = concatBytes(rgbFrames);
  const timescale = rate;
  const duration = rgbFrames.length;
  const mvhd = box('mvhd', Uint8Array.from([
    0, 0, 0, 0,
    ...u32be(0), ...u32be(0),
    ...u32be(timescale), ...u32be(duration),
    0x00, 0x01, 0x00, 0x00,
    0x01, 0x00,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32be(2),
  ]));
  const tkhd = box('tkhd', Uint8Array.from([
    0, 0, 0, 3,
    ...u32be(0), ...u32be(0),
    ...u32be(1), ...u32be(0),
    ...u32be(duration),
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 0, 0,
    ...u32be(w << 16), ...u32be(h << 16),
  ]));
  const mdhd = box('mdhd', Uint8Array.from([
    0, 0, 0, 0,
    ...u32be(0), ...u32be(0),
    ...u32be(timescale), ...u32be(duration),
    0x55, 0xc4, 0, 0,
  ]));
  const hdlr = box('hdlr', Uint8Array.from([
    0, 0, 0, 0, 0, 0, 0, 0,
    0x76, 0x69, 0x64, 0x65,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0x56, 0x69, 0x64, 0x65, 0x6f, 0x48, 0x61, 0x6e, 0x64, 0x6c, 0x65, 0x72, 0,
  ]));
  const vmhd = box('vmhd', Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]));
  const url = box('url ', Uint8Array.from([0, 0, 0, 1]));
  const dref = box('dref', concatBytes([Uint8Array.from([0, 0, 0, 0, ...u32be(1)]), url]));
  const dinf = box('dinf', dref);
  const rawEntry = new Uint8Array(86);
  rawEntry.set(u32be(86), 0);
  rawEntry[4] = 0x72; rawEntry[5] = 0x61; rawEntry[6] = 0x77; rawEntry[7] = 0x20;
  rawEntry[16] = 0; rawEntry[17] = 1;
  rawEntry[24] = (w >> 8) & 0xff; rawEntry[25] = w & 0xff;
  rawEntry[26] = (h >> 8) & 0xff; rawEntry[27] = h & 0xff;
  rawEntry[28] = 0x00; rawEntry[29] = 0x48; rawEntry[30] = 0; rawEntry[31] = 0;
  rawEntry[32] = 0x00; rawEntry[33] = 0x48; rawEntry[34] = 0; rawEntry[35] = 0;
  rawEntry[41] = 1;
  rawEntry[74] = 0x00; rawEntry[75] = 0x18;
  rawEntry[76] = 0xff; rawEntry[77] = 0xff;
  const stsd = box('stsd', concatBytes([Uint8Array.from([0, 0, 0, 0, ...u32be(1)]), rawEntry]));
  const stts = box('stts', Uint8Array.from([0, 0, 0, 0, ...u32be(1), ...u32be(duration), ...u32be(1)]));
  const stsc = box('stsc', Uint8Array.from([0, 0, 0, 0, ...u32be(1), ...u32be(1), ...u32be(1), ...u32be(1)]));
  const stszBody = [0, 0, 0, 0, ...u32be(frameSize), ...u32be(duration)];
  const stsz = box('stsz', Uint8Array.from(stszBody));
  // mdat comes after ftyp+moov; we size moov first then patch stco. Use a placeholder offset.
  const stbl = box('stbl', concatBytes([stsd, stts, stsc, stsz, box('stco', Uint8Array.from([0, 0, 0, 0, ...u32be(1), ...u32be(0)]))]));
  const minf = box('minf', concatBytes([vmhd, dinf, stbl]));
  const mdia = box('mdia', concatBytes([mdhd, hdlr, minf]));
  const trak = box('trak', concatBytes([tkhd, mdia]));
  const moov = box('moov', concatBytes([mvhd, trak]));
  const ftyp = box('ftyp', Uint8Array.from([
    0x69, 0x73, 0x6f, 0x6d, ...u32be(0),
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  ]));
  const mdatOffset = ftyp.length + moov.length + 8;
  const stcoOffset = findStcoOffset(moov);
  if (stcoOffset >= 0) {
    const off = u32be(mdatOffset);
    moov[stcoOffset] = off[0];
    moov[stcoOffset + 1] = off[1];
    moov[stcoOffset + 2] = off[2];
    moov[stcoOffset + 3] = off[3];
  }
  const mdat = box('mdat', mdatBody);
  return concatBytes([ftyp, moov, mdat]);
}

function findStcoOffset(moov) {
  const sig = [0x73, 0x74, 0x63, 0x6f];
  for (let i = 0; i < moov.length - 16; i += 1) {
    if (moov[i] === sig[0] && moov[i + 1] === sig[1] && moov[i + 2] === sig[2] && moov[i + 3] === sig[3]) {
      return i + 12;
    }
  }
  return -1;
}

function glyph(ch) {
  const code = FONT_5X7[ch] != null ? FONT_5X7[ch] : FONT_5X7[ch.toUpperCase()];
  return code == null ? 0 : code;
}

function plotText(pixels, width, height, text, x0, y0, color) {
  const [r, g, b] = color;
  let x = x0;
  for (const ch of String(text || '')) {
    const bits = glyph(ch);
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const on = (bits >>> (row * 5 + (4 - col))) & 1;
        if (!on) continue;
        const px = x + col;
        const py = y0 + row;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const o = (py * width + px) * 4;
        pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = 255;
      }
    }
    x += 6;
  }
}

function fillRect(pixels, width, height, x, y, w, h, color) {
  const [r, g, b] = color;
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(width, x + w);
  const y2 = Math.min(height, y + h);
  for (let py = y1; py < y2; py += 1) {
    for (let px = x1; px < x2; px += 1) {
      const o = (py * width + px) * 4;
      pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = 255;
    }
  }
}

/** Software title-card frames for a clip that has no GPU capture. */
export function rasterizeClipCard(clip, { width = 240, height = 72, frames = 4 } = {}) {
  const w = width;
  const h = height;
  const n = Math.max(2, Math.min(8, Math.floor(Number(frames) || 4)));
  const label = String((clip && (clip.label || clip.trickId)) || 'CLIP').toUpperCase().slice(0, 28);
  const ticks = clip && Number.isFinite(clip.startTick)
    ? `T${clip.startTick}-${clip.endTick}`
    : 'T--';
  const seed = clip && clip.seed != null ? `SEED ${clip.seed}` : 'SEED --';
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const px = new Uint8Array(w * h * 4);
    fillRect(px, w, h, 0, 0, w, h, [8, 14, 24]);
    fillRect(px, w, h, 0, 0, w, 2, [57, 208, 255]);
    fillRect(px, w, h, 0, h - 2, w, 2, [57, 208, 255]);
    plotText(px, w, h, label, 8, 10, [215, 230, 255]);
    plotText(px, w, h, ticks, 8, 24, [120, 160, 200]);
    plotText(px, w, h, seed, 8, 38, [120, 160, 200]);
    const barW = Math.floor((w - 16) * ((i + 1) / n));
    fillRect(px, w, h, 8, h - 12, barW, 4, [57, 208, 255]);
    out.push(px);
  }
  return { frames: out, width: w, height: h, source: 'software-card' };
}

export function resolveClipFrames(clip, options = {}) {
  const width = Number.isFinite(options.width) ? options.width
    : (clip && Number.isFinite(clip.width) ? clip.width : null);
  const height = Number.isFinite(options.height) ? options.height
    : (clip && Number.isFinite(clip.height) ? clip.height : null);
  const recorded = options.frames || (clip && clip.frames) || (clip && clip.frameBuffers);
  if (Array.isArray(recorded) && recorded.length) {
    const w = width || options.frameWidth || (clip && clip.frameWidth) || 0;
    const h = height || options.frameHeight || (clip && clip.frameHeight) || 0;
    if (!(w > 0 && h > 0)) return null;
    return { frames: recorded, width: w, height: h, source: 'recorded' };
  }
  const hasWindow = !!(clip && (Number.isFinite(clip.startTick) || clip.label || clip.trickId));
  if (hasWindow && options.allowRaster !== false) {
    return rasterizeClipCard(clip, {
      width: width || 240,
      height: height || 72,
    });
  }
  return null;
}

export function encodeClipBytes(frames, meta, format) {
  const spec = { width: meta.width, height: meta.height, delayCs: 10, fps: 10 };
  if (format === 'mp4') return encodeClipMp4(frames, spec);
  return encodeClipGif(frames, spec);
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function') return btoa(binary);
  return null;
}

/** Fire-and-forget delivery: Electron saveFile, injected download, or <a download>. */
export function deliverClipFile({ bytes, filename, mime, host } = {}) {
  const job = { bytes, filename, mime, bytesLength: bytes ? bytes.length : 0 };
  if (host && typeof host.saveFile === 'function') {
    const b64 = bytesToBase64(bytes);
    const result = host.saveFile({ filename, mime, bytes, bytesB64: b64 });
    job.via = 'electron-save';
    job.hostResult = result;
    return job;
  }
  if (host && typeof host.download === 'function') {
    host.download({ filename, mime, bytes });
    job.via = 'browser-download';
    return job;
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const blob = new Blob([bytes], { type: mime });
      const url = (typeof URL !== 'undefined' && URL.createObjectURL)
        ? URL.createObjectURL(blob)
        : null;
      const a = document.createElement('a');
      a.href = url || ('data:' + mime + ';base64,' + (bytesToBase64(bytes) || ''));
      a.download = filename;
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(a);
        if (typeof a.click === 'function') a.click();
        if (typeof a.remove === 'function') a.remove();
        else if (a.parentNode) a.parentNode.removeChild(a);
      }
      if (url && typeof URL.revokeObjectURL === 'function') {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      job.via = 'browser-download';
      return job;
    } catch {
      job.via = 'bytes-only';
      return job;
    }
  }
  job.via = 'bytes-only';
  return job;
}

export function detectClipExportHost() {
  if (typeof window !== 'undefined' && window.spacefaceShell
    && typeof window.spacefaceShell.saveClip === 'function') {
    return {
      kind: 'electron',
      saveFile: (job) => window.spacefaceShell.saveClip({
        filename: job.filename,
        mime: job.mime,
        bytesB64: job.bytesB64,
      }),
    };
  }
  if (typeof document !== 'undefined') return { kind: 'browser' };
  return { kind: 'headless' };
}
