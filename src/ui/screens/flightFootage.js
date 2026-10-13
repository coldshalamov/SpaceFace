// Actual presented pixels, independent of simulation and its native renderer objects.
// The ring lives only in this UI module; no Blob, stream, video or bitmap enters GameState.
export const FLIGHT_FOOTAGE_LIMITS = Object.freeze({ seconds: 30, fps: 10, width: 640, height: 360, maxBytes: 32 * 1024 * 1024 });

export function createFootageRing(limits = FLIGHT_FOOTAGE_LIMITS) {
  const frames = [];
  let bytes = 0;
  return {
    frames,
    push(frame) {
      if (!frame?.blob || !Number.isFinite(frame.tick) || frame.blob.size > limits.maxBytes) return false;
      if (frames.length && frame.tick <= frames.at(-1).tick) return false;
      frames.push(frame); bytes += frame.blob.size;
      while (frames.length && (bytes > limits.maxBytes || frames.length > limits.seconds * limits.fps
        || frame.tick - frames[0].tick > limits.seconds * 60)) bytes -= frames.shift().blob.size;
      return true;
    },
    window(start, end) { return frames.filter((frame) => frame.tick >= start && frame.tick <= end); },
    clear() { frames.length = 0; bytes = 0; },
    get bytes() { return bytes; },
  };
}

const FOOTAGE_ENCODER_SOURCE = `
self.onmessage = async (event) => {
  const { id, bitmap, width, height, quality } = event.data;
  try {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    self.postMessage({ id, blob });
  } catch (error) {
    try { bitmap.close(); } catch {}
    self.postMessage({ id, error: String(error && error.message || error) });
  }
};`;

let encoderInstance;
/** Shared JPEG encoder worker; null where workers/OffscreenCanvas/createImageBitmap are missing. */
function footageEncoder() {
  if (encoderInstance !== undefined) return encoderInstance;
  encoderInstance = null;
  try {
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
      || typeof createImageBitmap !== 'function' || typeof URL?.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(new Blob([FOOTAGE_ENCODER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url, { name: 'spaceface-flight-footage' });
    URL.revokeObjectURL(url);
    const pending = new Map();
    let nextId = 0;
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id); if (!job) return;
      pending.delete(data.id);
      if (data.blob) job.resolve(data.blob); else job.reject(new Error(data.error || 'encode failed'));
    };
    worker.onerror = () => {
      for (const job of pending.values()) job.reject(new Error('footage encoder failed'));
      pending.clear(); encoderInstance = null; worker.terminate();
    };
    encoderInstance = {
      encode(bitmap, width, height) {
        return new Promise((resolve, reject) => {
          const id = ++nextId; pending.set(id, { resolve, reject });
          worker.postMessage({ id, bitmap, width, height, quality: 0.88 }, [bitmap]);
        });
      },
    };
  } catch { encoderInstance = null; }
  return encoderInstance;
}

let active = null;
export function getFlightFootage() { return active; }

export function installFlightFootage(bus, { stateOf } = {}) {
  active?.dispose();
  if (typeof document === 'undefined' || typeof stateOf !== 'function') { active = null; return null; }
  const ring = createFootageRing();
  const poses = [];
  let marks = [], lastPoseTick = -1, video = null, stream = null, callback = null;
  let canvas = null, source = null, timer = null, stopped = false, encoding = false, epoch = 0;
  const subscriptions = [];
  const stopStream = () => {
    epoch += 1;
    if (video && callback != null) video.cancelVideoFrameCallback?.(callback);
    callback = null;
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
    if (video) { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load(); }
    video = null; source = null; canvas = null;
  };
  const clear = () => { stopStream(); ring.clear(); poses.length = 0; marks = []; lastPoseTick = -1; };
  const recordMetadata = (state) => {
    const sample = state?.replay?.latestPoseSample;
    if (!sample || sample.tick === lastPoseTick) return;
    lastPoseTick = sample.tick;
    poses.push({ tick: sample.tick, poses: sample.poses.map((pose) => ({ ...pose })), boost: sample.boost });
    while (poses.length > 300 || (poses.length && sample.tick - poses[0].tick > 1800)) poses.shift();
    marks = (sample.events || []).map((event) => ({ ...event }));
  };
  const eligible = (state) => state?.mode === 'flight' && !state.paused && !document.hidden;
  const capture = () => {
    if (stopped || !video) return;
    const state = stateOf();
    if (!eligible(state)) { stopStream(); return; }
    recordMetadata(state);
    const tick = Number(state.tick);
    if (!encoding && video.readyState >= 2 && (!ring.frames.length || tick - ring.frames.at(-1).tick >= 6)) {
      const token = epoch;
      const scale = Math.min(1, FLIGHT_FOOTAGE_LIMITS.width / (source.width || 640), FLIGHT_FOOTAGE_LIMITS.height / (source.height || 360));
      const width = Math.max(1, Math.round((source.width || 640) * scale));
      const height = Math.max(1, Math.round((source.height || 360) * scale));
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      encoding = true;
      const accept = (blob) => {
        encoding = false;
        if (blob && token === epoch && !stopped) ring.push({ tick, blob, width, height });
      };
      const encoder = footageEncoder();
      if (encoder) {
        // The grab stays here (drawImage of the video frame is sub-millisecond); the JPEG encode
        // moves to a worker. createImageBitmap snapshots this canvas's exact pixels and the worker
        // draws them 1:1 and encodes at the same 0.88 quality, so the stored JPEG is
        // byte-identical to canvas.toBlob's. toBlob itself was the main-thread cost: ~4.6 ms median,
        // 40+ ms worst per call, 10x a second for the whole flight.
        createImageBitmap(canvas).then((bitmap) => encoder.encode(bitmap, width, height))
          .then(accept, () => { encoding = false; });
      } else {
        canvas.toBlob(accept, 'image/jpeg', 0.88);
      }
    }
    if (video) callback = video.requestVideoFrameCallback?.(capture) ?? null;
  };
  const poll = () => {
    const state = stateOf();
    if (state?.mode === 'menu' && ring.frames.length) clear();
    if (!eligible(state)) { if (video) stopStream(); return; }
    recordMetadata(state);
    const next = state.render?.renderer?.domElement || state.render?.canvas;
    if (!next?.captureStream || next.width <= 0 || next.height <= 0) return;
    if (source === next && video) return;
    stopStream(); source = next;
    try {
      stream = next.captureStream(FLIGHT_FOOTAGE_LIMITS.fps);
      video = document.createElement('video'); video.muted = true; video.playsInline = true;
      video.srcObject = stream; canvas = document.createElement('canvas');
      video.play().then(() => { if (video) callback = video.requestVideoFrameCallback?.(capture) ?? null; }).catch(stopStream);
    } catch { stopStream(); }
  };
  for (const event of ['game:new', 'game:load', 'game:loaded', 'save:loaded', 'game:exitToMenu']) {
    const off = bus?.on?.(event, clear); if (off) subscriptions.push(off);
  }
  const visibility = () => { if (document.hidden) stopStream(); else poll(); };
  document.addEventListener('visibilitychange', visibility);
  timer = setInterval(poll, 100);
  active = {
    ring,
    status() { return { capturing: !!stream, frames: ring.frames.length, bytes: ring.bytes }; },
    recording() {
      if (!ring.frames.length) return null;
      const base = ring.frames[0].tick, end = ring.frames.at(-1).tick;
      const rows = poses.filter((row) => row.tick >= base && row.tick <= end);
      return { seed: stateOf()?.meta?.seed || 0, tickRate: 60, ticks: end - base + 1,
        seconds: (end - base + 1) / 60, absoluteBaseTick: base, base,
        poseFrames: rows, samples: rows.flatMap((row) => row.poses),
        events: marks.filter((mark) => mark.absoluteTick >= base && mark.absoluteTick <= end)
          .map((mark) => ({ ...mark, tick: mark.absoluteTick - base })),
        inputRing: { read(tick) { const row = rows.find((entry) => entry.tick >= base + tick); return { data: { boost: !!row?.boost } }; } },
      };
    },
    clear,
    dispose() {
      stopped = true; clear(); clearInterval(timer);
      subscriptions.forEach((off) => off()); document.removeEventListener('visibilitychange', visibility);
      if (active === this) active = null;
    },
  };
  return active;
}

/** One bitmap at a time; seeking never mutates the live camera or bodies. */
export function createFootageViewer(canvas) {
  let token = 0, disposed = false, lastTick = null;
  return {
    async show(tick) {
      const frames = active?.ring.frames || [];
      if (!frames.length || disposed) return false;
      let chosen = frames[0];
      for (const frame of frames) { if (frame.tick > tick) break; chosen = frame; }
      if (chosen.tick === lastTick) return true;
      lastTick = chosen.tick;
      const own = ++token;
      const bitmap = await createImageBitmap(chosen.blob);
      try {
        if (disposed || own !== token) return false;
        canvas.width = chosen.width; canvas.height = chosen.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        return true;
      } finally { bitmap.close(); }
    },
    dispose() { disposed = true; token += 1; canvas.width = 0; canvas.height = 0; },
  };
}

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); }

/** Decode genuine JPEG frames for the existing GIF codec. Bounded transient RGBA storage. */
export async function resolveFlightClipFrames(clip, { signal } = {}) {
  const frames = active?.ring.window(clip.startTick, clip.endTick) || [];
  if (frames.length < 2) return null;
  const stride = Math.max(1, Math.ceil(frames.length / 150));
  const selected = frames.filter((_frame, index) => index % stride === 0);
  const scale = Math.min(1, 480 / selected[0].width, 270 / selected[0].height);
  const width = Math.max(1, Math.round(selected[0].width * scale));
  const height = Math.max(1, Math.round(selected[0].height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), rgba = [];
  try {
    for (const frame of selected) {
      abortIfNeeded(signal);
      const bitmap = await createImageBitmap(frame.blob);
      try { ctx.drawImage(bitmap, 0, 0, width, height); rgba.push(ctx.getImageData(0, 0, width, height).data); }
      finally { bitmap.close(); }
    }
    const seconds = (frames.at(-1).tick - frames[0].tick) / 60 + 0.1;
    return { frames: rgba, width, height, fps: selected.length / seconds, source: 'recorded-flight',
      actualStartTick: frames[0].tick, actualEndTick: frames.at(-1).tick };
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Browser codec export: play only the recorded pixels into an isolated output canvas. */
export async function encodeFlightVideo(clip, { signal, format = 'mp4' } = {}) {
  const frames = active?.ring.window(clip.startTick, clip.endTick) || [];
  if (frames.length < 2 || typeof MediaRecorder === 'undefined') return null;
  const codecs = format === 'webm' ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
  const mime = codecs.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) return null;
  const canvas = document.createElement('canvas'); canvas.width = frames[0].width; canvas.height = frames[0].height;
  const ctx = canvas.getContext('2d'), stream = canvas.captureStream(0), chunks = [];
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 }); }
  catch (error) { stream.getTracks().forEach((track) => track.stop()); canvas.width = 0; canvas.height = 0; throw error; }
  let stopResolve, rejectRecord;
  const done = new Promise((resolve, reject) => { stopResolve = resolve; rejectRecord = reject; });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = stopResolve; recorder.onerror = (event) => rejectRecord(event.error || new Error('Video encoder failed'));
  const abort = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    abortIfNeeded(signal); recorder.start();
    for (let i = 0; i < frames.length; i += 1) {
      abortIfNeeded(signal);
      const bitmap = await createImageBitmap(frames[i].blob);
      try { ctx.drawImage(bitmap, 0, 0); stream.getVideoTracks()[0].requestFrame?.(); } finally { bitmap.close(); }
      const delay = i + 1 < frames.length ? (frames[i + 1].tick - frames[i].tick) * 1000 / 60 : 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (recorder.state !== 'inactive') recorder.stop();
    await done; abortIfNeeded(signal);
    const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
    return { bytes, mime: mime.split(';')[0], format: mime.startsWith('video/mp4') ? 'mp4' : 'webm', source: 'recorded-flight' };
  } finally {
    signal?.removeEventListener('abort', abort);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop()); canvas.width = 0; canvas.height = 0;
  }
}
