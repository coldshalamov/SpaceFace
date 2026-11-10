// Minimal WebM mux for the two explicit WebCodecs tracks produced by Theater.
// Container element definitions: https://www.webmproject.org/docs/container/
// All timestamps share the tape's origin. Encoding speed never changes playback cadence.
const text = (s) => new TextEncoder().encode(s);
function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out;
}
function id(value) {
  const bytes = []; do { bytes.unshift(value & 255); value = Math.floor(value / 256); } while (value);
  return Uint8Array.from(bytes);
}
function size(value) {
  let length = 1;
  while (value >= 2 ** (length * 7) - 1) length++;
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) { out[i] = value % 256; value = Math.floor(value / 256); }
  out[0] |= 1 << (8 - length); return out;
}
function uint(value) { return id(value); }
function float(value) { const out = new Uint8Array(8); new DataView(out.buffer).setFloat64(0, value); return out; }
const element = (tag, value) => join([id(tag), size(value.length), value]);
const u = (tag, value) => element(tag, uint(value));
const s = (tag, value) => element(tag, text(value));
const f = (tag, value) => element(tag, float(value));
const master = (tag, children) => element(tag, join(children));

function opusHeader(sampleRate) {
  const out = new Uint8Array(19), view = new DataView(out.buffer);
  out.set(text('OpusHead')); out[8] = 1; out[9] = 2;
  view.setUint16(10, 312, true); view.setUint32(12, sampleRate, true);
  return out;
}

export function muxTheaterWebm(video, audio, { width = 1280, height = 720, fps = 30, seconds, audioDescription } = {}) {
  if (!video.length || !audio.length) return null;
  const header = master(0x1a45dfa3, [u(0x4286, 1), u(0x42f7, 1), u(0x42f2, 4), u(0x42f3, 8), s(0x4282, 'webm'), u(0x4287, 4), u(0x4285, 2)]);
  const description = audioDescription?.byteLength ? new Uint8Array(audioDescription) : opusHeader(48000);
  const preSkip = description.length >= 12 ? new DataView(description.buffer, description.byteOffset, description.byteLength).getUint16(10, true) : 312;
  const info = master(0x1549a966, [u(0x2ad7b1, 1_000_000), f(0x4489, seconds * 1000), s(0x4d80, 'SpaceFace Theater'), s(0x5741, 'SpaceFace Theater')]);
  const tracks = master(0x1654ae6b, [
    master(0xae, [u(0xd7, 1), u(0x73c5, 1), u(0x83, 1), s(0x86, 'V_VP8'), u(0x23e383, Math.round(1e9 / fps)),
      master(0xe0, [u(0xb0, width), u(0xba, height)])]),
    master(0xae, [u(0xd7, 2), u(0x73c5, 2), u(0x83, 2), s(0x86, 'A_OPUS'), element(0x63a2, description),
      u(0x56aa, Math.round(preSkip / 48000 * 1e9)), u(0x56bb, 80_000_000),
      master(0xe1, [f(0xb5, 48000), u(0x9f, 2)])]),
  ]);
  const chunks = video.map((chunk) => ({ ...chunk, track: 1 })).concat(audio.map((chunk) => ({ ...chunk, track: 2 })));
  chunks.sort((a, b) => a.timestamp - b.timestamp || a.track - b.track);
  const clusters = [];
  let base = 0, blocks = [u(0xe7, 0)];
  for (const chunk of chunks) {
    const ms = Math.max(0, Math.round(chunk.timestamp / 1000));
    if (ms - base >= 5000) { clusters.push(master(0x1f43b675, blocks)); base = ms; blocks = [u(0xe7, base)]; }
    const relative = ms - base;
    const block = new Uint8Array(4 + chunk.bytes.length);
    block[0] = 0x80 | chunk.track;
    new DataView(block.buffer).setInt16(1, relative);
    block[3] = chunk.key ? 0x80 : 0;
    block.set(chunk.bytes, 4); blocks.push(element(0xa3, block));
  }
  clusters.push(master(0x1f43b675, blocks));
  return join([header, master(0x18538067, [info, tracks, ...clusters])]);
}

export async function encodeTheaterWebCodecs(session, pcm, {
  signal, scope = globalThis, fps = 30, width = 1280, height = 720,
} = {}) {
  if (!scope.VideoEncoder || !scope.AudioEncoder || !scope.AudioData || !scope.VideoFrame) return null;
  const videoConfig = { codec: 'vp8', width, height, bitrate: 8_000_000, framerate: fps };
  const audioConfig = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 };
  const [videoSupport, audioSupport] = await Promise.all([
    scope.VideoEncoder.isConfigSupported(videoConfig), scope.AudioEncoder.isConfigSupported(audioConfig),
  ]);
  if (!videoSupport.supported || !audioSupport.supported) return null;
  const canvas = scope.document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const paint = canvas.getContext('2d', { alpha: false });
  if (!paint) return null;
  const videoChunks = [], audioChunks = [];
  let error = null, audioDescription = null;
  const copy = (chunk) => { const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes); return { bytes, timestamp: chunk.timestamp, key: chunk.type === 'key' }; };
  const video = new scope.VideoEncoder({ output: (chunk) => videoChunks.push(copy(chunk)), error: (e) => { error = e; } });
  const audio = new scope.AudioEncoder({ output: (chunk, meta) => {
    audioChunks.push(copy(chunk));
    if (meta?.decoderConfig?.description) audioDescription = meta.decoderConfig.description;
  }, error: (e) => { error = e; } });
  const duration = (session.tape.samples - 1) / session.tape.sampleRate, count = Math.ceil(duration * fps);
  const previousTime = session.elapsed, previousPhoto = session.photo.enabled;
  const check = () => { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); if (error) throw error; };
  session.exporting = true; session.setPhoto(false);
  try {
    video.configure(videoConfig); audio.configure(audioConfig);
    for (let i = 0; i < count; i++) {
      check(); session.seek(i / fps);
      const pixels = session.renderAt(width, height);
      if (!pixels?.data) throw new Error('The tape renderer stopped before export finished');
      paint.putImageData(new scope.ImageData(pixels.data, width, height), 0, 0);
      const frame = new scope.VideoFrame(canvas, { timestamp: Math.round(i / fps * 1e6), duration: Math.round(1e6 / fps) });
      try { video.encode(frame, { keyFrame: i % (fps * 2) === 0 }); } finally { frame.close(); }
      if (video.encodeQueueSize >= 4) await video.flush();
    }
    const rate = 48000, total = Math.round(duration * rate), blockSize = 960;
    for (let offset = 0; offset < total; offset += blockSize) {
      check(); const n = Math.min(blockSize, total - offset), data = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const source = (offset + i) / rate * pcm.sampleRate;
        const a = Math.min(pcm.left.length - 1, Math.floor(source)), b = Math.min(pcm.left.length - 1, a + 1), blend = source - a;
        data[i] = pcm.left[a] + (pcm.left[b] - pcm.left[a]) * blend;
        data[n + i] = pcm.right[a] + (pcm.right[b] - pcm.right[a]) * blend;
      }
      const frame = new scope.AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n,
        numberOfChannels: 2, timestamp: Math.round(offset / rate * 1e6), data });
      try { audio.encode(frame); } finally { frame.close(); }
      // Flush only at the end: an intermediate Opus flush emits a padded packet,
      // which overlaps the next block's timestamp. Yield without closing that packet.
      if (audio.encodeQueueSize >= 16) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all([video.flush(), audio.flush()]); check();
    const bytes = muxTheaterWebm(videoChunks, audioChunks, { width, height, fps, seconds: duration, audioDescription });
    return { bytes, mime: 'video/webm', format: 'webm', source: 'rendered-tape', width, height,
      fps, frames: count, seconds: duration, soundtrack: 'recorded-master-bus', maximumAudioSkewS: 0,
      encoding: 'offline-webcodecs' };
  } finally {
    if (video.state !== 'closed') video.close(); if (audio.state !== 'closed') audio.close();
    canvas.width = 0; canvas.height = 0;
    session.exporting = false; session.seek(previousTime); session.setPhoto(previousPhoto);
  }
}
