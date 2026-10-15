// Optional WebCodecs backend for flight footage.  The normal recorder remains the JPEG worker path;
// this module is deliberately capability gated and keeps encoded chunks opaque until a viewer/export
// actually needs pixels again.

export const FOOTAGE_VIDEO_CODEC_CANDIDATES = Object.freeze([
  Object.freeze({ codec: 'avc1.4D401E', hardwareAcceleration: 'prefer-hardware', avc: { format: 'annexb' } }),
  Object.freeze({ codec: 'avc1.42E01E', hardwareAcceleration: 'prefer-hardware', avc: { format: 'annexb' } }),
  Object.freeze({ codec: 'vp09.00.10.08', hardwareAcceleration: 'prefer-hardware' }),
  Object.freeze({ codec: 'vp8', hardwareAcceleration: 'prefer-hardware' }),
  Object.freeze({ codec: 'avc1.4D401E', avc: { format: 'annexb' } }),
  Object.freeze({ codec: 'avc1.42E01E', avc: { format: 'annexb' } }),
  Object.freeze({ codec: 'vp09.00.10.08' }),
  Object.freeze({ codec: 'vp8' }),
]);

const DEFAULT_BITRATE = 4_000_000;
const DEFAULT_TIMEOUT_MS = 5000;

function copyBuffer(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return value ?? null;
}
function cloneConfig(config) {
  if (!config || typeof config !== 'object') return null;
  const copy = { ...config };
  if (config.avc) copy.avc = { ...config.avc };
  if (config.description) copy.description = copyBuffer(config.description);
  return copy;
}

/**
 * Self-contained worker body.  It receives transferable VideoFrames, encodes every sample as an
 * intra frame for independent seeking, and returns transferable encoded bytes.  The hardware value
 * is only a WebCodecs preference; the worker does not report it as a hardware guarantee.
 */
export function footageVideoCodecRuntime() {
  let encoder = null;
  let config = null;
  let resizeCanvas = null;
  let resizeContext = null;
  let failed = false;
  const pendingIds = [];

  const copy = (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    return value ?? null;
  };
  const clone = (value) => {
    if (!value || typeof value !== 'object') return value;
    const copy = { ...value };
    if (value.avc) copy.avc = { ...value.avc };
    if (value.description) copy.description = value.description instanceof ArrayBuffer
      ? value.description.slice(0)
      : ArrayBuffer.isView(value.description)
        ? value.description.buffer.slice(value.description.byteOffset, value.description.byteOffset + value.description.byteLength)
        : value.description;
    return copy;
  };
  const safeClose = (frame) => { try { frame?.close?.(); } catch { /* already closed */ } };
  const fail = (reason) => {
    failed = true;
    try { encoder?.close?.(); } catch { /* best effort */ }
    encoder = null;
    const message = String(reason?.message || reason || 'footage VideoEncoder failed');
    self.postMessage({ kind: 'error', error: message });
  };

  self.onmessage = async ({ data }) => {
    if (!data || failed) return;
    if (data.kind === 'dispose') {
      try { await encoder?.flush?.(); } catch { /* disposal must remain bounded */ }
      try { encoder?.close?.(); } catch { /* best effort */ }
      encoder = null;
      pendingIds.length = 0;
      return;
    }
    if (data.kind === 'configure') {
      try {
        if (typeof VideoEncoder !== 'function' || typeof VideoEncoder.isConfigSupported !== 'function') {
          throw new Error('VideoEncoder unavailable in worker');
        }
        let supported = null;
        for (const candidate of data.configs || []) {
          try {
            const result = await VideoEncoder.isConfigSupported(candidate);
            if (result?.supported) { supported = result.config || candidate; break; }
          } catch { /* try the next codec */ }
        }
        if (!supported) throw new Error('no supported footage video codec');
        config = supported;
        encoder = new VideoEncoder({
          output(chunk, metadata = {}) {
            const id = pendingIds.shift();
            if (id == null) return;
            const bytes = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(new Uint8Array(bytes));
            const decoderConfig = metadata.decoderConfig
              ? { ...metadata.decoderConfig, description: copy(metadata.decoderConfig.description) }
              : clone(config);
            self.postMessage({
              kind: 'chunk',
              id,
              type: chunk.type,
              timestamp: chunk.timestamp,
              duration: chunk.duration,
              data: bytes,
              decoderConfig,
              codec: config.codec,
            }, [bytes]);
          },
          error(error) { fail(error); },
        });
        encoder.configure(config);
        self.postMessage({ kind: 'ready', config: clone(config) });
      } catch (error) { fail(error); }
      return;
    }
    if (data.kind !== 'encode' || !encoder) return;
    const frame = data.frame;
    if (!frame) {
      self.postMessage({ kind: 'encode-error', id: data.id, error: 'missing VideoFrame' });
      return;
    }
    let resizedFrame = null;
    try {
      const frameWidth = Number(frame.displayWidth || frame.codedWidth || frame.width);
      const frameHeight = Number(frame.displayHeight || frame.codedHeight || frame.height);
      let encodeFrame = frame;
      // VideoEncoder requires the input dimensions to match its configured coded size. Resize in the
      // worker beside the encoder, keeping the main draw boundary free of ImageBitmap/JPEG readback.
      // A missing dimension on a test/fallback frame leaves the native encoder to validate it.
      if (Number.isFinite(frameWidth) && Number.isFinite(frameHeight)
        && (frameWidth !== config.width || frameHeight !== config.height)) {
        if (typeof OffscreenCanvas !== 'function' || typeof VideoFrame !== 'function') {
          throw new Error('worker VideoFrame resize unavailable');
        }
        if (!resizeCanvas) {
          resizeCanvas = new OffscreenCanvas(config.width, config.height);
          resizeContext = resizeCanvas.getContext('2d');
        }
        if (!resizeContext) throw new Error('worker VideoFrame resize context unavailable');
        if (resizeCanvas.width !== config.width) resizeCanvas.width = config.width;
        if (resizeCanvas.height !== config.height) resizeCanvas.height = config.height;
        resizeContext.drawImage(frame, 0, 0, config.width, config.height);
        resizedFrame = new VideoFrame(resizeCanvas, {
          timestamp: Number.isFinite(frame.timestamp) ? frame.timestamp : 0,
          alpha: 'discard',
        });
        encodeFrame = resizedFrame;
      }
      pendingIds.push(data.id);
      // Every chunk is a key frame.  This bounds random-seek decode cost and means the ring does not
      // need to retain an unbounded dependency chain when old entries roll off.
      encoder.encode(encodeFrame, { keyFrame: true });
    } catch (error) {
      const pendingIndex = pendingIds.lastIndexOf(data.id);
      if (pendingIndex >= 0) pendingIds.splice(pendingIndex, 1);
      safeClose(frame);
      self.postMessage({ kind: 'encode-error', id: data.id, error: String(error?.message || error) });
    } finally {
      // The encoder has synchronously consumed the VideoFrame; releasing our worker-side reference is
      // required even when the implementation queues its hardware work asynchronously.
      safeClose(resizedFrame);
      safeClose(frame);
    }
  };
}

function makeCodecConfigs({ width, height, fps, bitrate, candidates }) {
  return (candidates || FOOTAGE_VIDEO_CODEC_CANDIDATES).map((candidate) => ({
    ...candidate,
    width,
    height,
    framerate: fps,
    bitrate,
    latencyMode: 'realtime',
  }));
}

/** Create the opt-in worker encoder, or null when the host cannot provide the required APIs. */
export function createFootageVideoCodec(scope = globalThis, {
  width = 640,
  height = 360,
  fps = 10,
  bitrate = DEFAULT_BITRATE,
  maxPending = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  candidates = FOOTAGE_VIDEO_CODEC_CANDIDATES,
} = {}) {
  if (typeof scope.Worker !== 'function' || typeof scope.Blob !== 'function'
    || typeof scope.URL?.createObjectURL !== 'function' || typeof scope.VideoEncoder !== 'function') return null;
  let worker = null;
  let url = null;
  let nextId = 0;
  let state = 'starting';
  let info = null;
  const pending = new Map();
  const configs = makeCodecConfigs({ width, height, fps, bitrate, candidates });
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // No caller should be forced to await capability failure merely to dispose a recorder. The encode
  // path still observes the rejection, while this handled branch prevents an unhandled rejection.
  ready.catch(() => {});

  const rejectPending = (reason) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(reason instanceof Error ? reason : new Error(String(reason)));
      try { entry.frame?.close?.(); } catch { /* frame may have transferred */ }
    }
    pending.clear();
  };
  const releaseWorker = () => {
    try { worker?.terminate?.(); } catch { /* best effort */ }
    worker = null;
    if (url) { try { scope.URL.revokeObjectURL?.(url); } catch { /* best effort */ } url = null; }
  };
  const fail = (reason) => {
    if (state === 'failed' || state === 'disposed') return;
    state = 'failed';
    const error = reason instanceof Error ? reason : new Error(String(reason || 'footage codec failed'));
    rejectPending(error);
    rejectReady(error);
    releaseWorker();
  };
  const retire = (reason = 'footage video codec disposed') => {
    if (state === 'disposed') return;
    state = 'disposed';
    const error = reason instanceof Error ? reason : new Error(String(reason));
    rejectPending(error);
    rejectReady(error);
    try { if (worker && state !== 'failed') worker.postMessage({ kind: 'dispose' }); } catch { /* worker may be gone */ }
    releaseWorker();
  };
  try {
    url = scope.URL.createObjectURL(new scope.Blob([`(${footageVideoCodecRuntime.toString()})();`], {
      type: 'text/javascript',
    }));
    worker = new scope.Worker(url, { name: 'spaceface-footage-video' });
  } catch (error) {
    if (url) { try { scope.URL.revokeObjectURL?.(url); } catch { /* best effort */ } }
    return null;
  }
  worker.onerror = (event) => { event?.preventDefault?.(); fail(event?.message || 'footage video worker error'); };
  worker.onmessageerror = () => fail('footage video worker message error');
  worker.onmessage = ({ data }) => {
    if (!data) return;
    if (data.kind === 'ready') {
      state = 'ready';
      info = { config: data.config || null, requestedHardwareAcceleration: 'prefer-hardware' };
      resolveReady(info);
      return;
    }
    if (data.kind === 'error') { fail(data.error || 'footage video worker failed'); return; }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.kind === 'encode-error') entry.reject(new Error(data.error || 'footage video encode failed'));
    else if (data.kind === 'chunk' && data.data) {
      entry.resolve({
        data: data.data,
        type: data.type || 'key',
        timestamp: Number.isFinite(data.timestamp) ? data.timestamp : entry.timestamp,
        duration: Number.isFinite(data.duration) ? data.duration : undefined,
        decoderConfig: data.decoderConfig || info?.config || null,
        codec: data.codec || info?.config?.codec || null,
        width: entry.width,
        height: entry.height,
        byteLength: data.data.byteLength,
        tick: entry.tick,
      });
    } else entry.reject(new Error('footage video worker returned no chunk'));
  };
  try { worker.postMessage({ kind: 'configure', configs }); }
  catch (error) { fail(error); }

  return {
    ready,
    get usable() { return state === 'starting' || state === 'ready'; },
    get info() { return info; },
    encode(frame, { tick = 0, timestamp = Math.round(Number(tick) * 1_000_000 / 60), width, height } = {}) {
      if (!frame) return Promise.reject(new Error('missing VideoFrame'));
      if (state === 'failed' || state === 'disposed') {
        try { frame.close?.(); } catch { /* best effort */ }
        return Promise.reject(new Error('footage video codec unavailable'));
      }
      if (pending.size >= Math.max(1, maxPending)) {
        try { frame.close?.(); } catch { /* best effort */ }
        return Promise.reject(new Error('footage video codec busy'));
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const entry = pending.get(id);
          if (!entry) return;
          pending.delete(id);
          reject(new Error('footage video codec timed out'));
          fail('footage video codec timed out');
        }, timeoutMs);
        const entry = { resolve, reject, timer, frame, tick, timestamp, width, height };
        pending.set(id, entry);
        ready.then(() => {
          if (!pending.has(id) || state !== 'ready') return;
          try { worker.postMessage({ kind: 'encode', id, frame }, [frame]); }
          catch (error) {
            pending.delete(id); clearTimeout(timer);
            try { frame.close?.(); } catch { /* best effort */ }
            reject(error); fail(error);
          }
        }, (error) => {
          if (!pending.delete(id)) return;
          clearTimeout(timer);
          try { frame.close?.(); } catch { /* best effort */ }
          reject(error);
        });
      });
    },
    dispose() { retire(); },
  };
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') { reject(new Error('footage decode canvas cannot encode')); return; }
    try { canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('footage decode returned no blob'))), type, quality); }
    catch (error) { reject(error); }
  });
}

function abortDecode(signal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** Materialize one encoded ring entry only when a viewer/export asks for actual pixels. */
export async function decodeFootageFrameToBlob(frame, { signal, scope = globalThis } = {}) {
  if (frame?.blob) return frame.blob;
  const encoded = frame?.encoded;
  if (!encoded || typeof scope.VideoDecoder !== 'function' || typeof scope.EncodedVideoChunk !== 'function') return null;
  abortDecode(signal);
  const width = Math.max(1, Number(frame.width || encoded.width || encoded.codedWidth || 1));
  const height = Math.max(1, Number(frame.height || encoded.height || encoded.codedHeight || 1));
  const decoderConfig = {
    ...(encoded.decoderConfig || {}),
    codec: encoded.decoderConfig?.codec || encoded.codec,
    codedWidth: encoded.decoderConfig?.codedWidth || width,
    codedHeight: encoded.decoderConfig?.codedHeight || height,
  };
  if (!decoderConfig.codec) return null;
  let decoder = null;
  let decoded = null;
  let rejectOutput;
  const output = new Promise((resolve, reject) => { rejectOutput = reject; });
  const onAbort = () => {
    try { decoder?.close?.(); } catch { /* best effort */ }
    rejectOutput(new DOMException('Export cancelled', 'AbortError'));
  };
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    decoder = new scope.VideoDecoder({
      output(videoFrame) {
        if (!decoded) { decoded = videoFrame; return; }
        try { videoFrame.close?.(); } catch { /* best effort */ }
      },
      error(error) { rejectOutput(error); },
    });
    decoder.configure(decoderConfig);
    const data = encoded.data instanceof ArrayBuffer
      ? new Uint8Array(encoded.data)
      : encoded.data instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data);
    const chunkInit = {
      type: encoded.type || 'key',
      timestamp: Number.isFinite(encoded.timestamp) ? encoded.timestamp : 0,
      data,
    };
    if (Number.isFinite(encoded.duration)) chunkInit.duration = encoded.duration;
    decoder.decode(new scope.EncodedVideoChunk(chunkInit));
    await Promise.race([decoder.flush(), output]);
    // flush resolves after output callbacks, but a few implementations schedule the callback as a
    // microtask after the promise. Yield once before declaring an empty chunk unusable.
    if (!decoded) { await Promise.resolve(); }
    if (!decoded) throw new Error('footage video decoder returned no frame');
    abortDecode(signal);
    const canvas = typeof scope.OffscreenCanvas === 'function'
      ? new scope.OffscreenCanvas(width, height)
      : scope.document?.createElement?.('canvas');
    if (!canvas) return null;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext?.('2d');
    if (!context) return null;
    context.drawImage(decoded, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    try { decoded.close?.(); } catch { /* best effort */ }
    try { canvas.width = 0; canvas.height = 0; } catch { /* best effort */ }
    return blob;
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    try { decoder?.close?.(); } catch { /* best effort */ }
    try { decoded?.close?.(); } catch { /* best effort */ }
  }
}
