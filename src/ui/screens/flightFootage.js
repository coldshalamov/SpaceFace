import { decodeFootageFrameToBlob } from './footageVideoCodec.js';
import { getReplayAudioTape, createReplayAudioPlayback } from '../../audio/replayAudioTape.js';
import { FLIGHT_FOOTAGE_LIMITS, getFlightFootage } from './flightFootageCapture.js';
export {
  FLIGHT_FOOTAGE_LIMITS,
  createFootageEncoder,
  createFootageRing,
  footageEncoderRuntime,
  getFlightFootage,
  installFlightFootage,
} from './flightFootageCapture.js';

// Compatibility entry for the lazy replay/Clips surfaces. Main imports the capture owner directly
// so frame recording can start before flight without eagerly loading playback/export helpers.

/** One bitmap at a time; seeking never mutates the live camera or bodies. */
export function createFootageViewer(canvas) {
  let token = 0, disposed = false, lastTick = null, lastRing = null, lastFrame = null;
  return {
    async show(tick) {
      // Every request is authoritative, including a no-op request for the already-visible frame.
      // This invalidates an older decode that could otherwise paint after the caller moved back.
      const own = ++token;
      const ring = getFlightFootage()?.ring;
      const frames = ring?.frames || [];
      if (!frames.length || disposed) return false;
      let chosen = frames[0];
      for (const frame of frames) { if (frame.tick > tick) break; chosen = frame; }
      if (chosen.tick === lastTick && ring === lastRing && chosen === lastFrame) return true;
      const blob = await decodeFootageFrameToBlob(chosen);
      if (!blob) return false;
      const bitmap = await createImageBitmap(blob);
      try {
        // A clear/restart can retain the same viewer while replacing the recorder ring. Do not
        // let a delayed decode from the retired capture repaint the current viewer.
        if (disposed || own !== token || getFlightFootage()?.ring !== ring || !ring.frames.includes(chosen)) return false;
        canvas.width = chosen.width; canvas.height = chosen.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        lastTick = chosen.tick; lastRing = ring; lastFrame = chosen;
        return true;
      } finally { bitmap.close(); }
    },
    dispose() { disposed = true; token += 1; canvas.width = 0; canvas.height = 0; },
  };
}

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); }

/** Decode genuine JPEG frames for the existing GIF codec. Bounded transient RGBA storage. */
export async function resolveFlightClipFrames(clip, { signal } = {}) {
  const frames = getFlightFootage()?.ring.window(clip.startTick, clip.endTick) || [];
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
      const blob = await decodeFootageFrameToBlob(frame, { signal });
      if (!blob) return null;
      const bitmap = await createImageBitmap(blob);
      try { ctx.drawImage(bitmap, 0, 0, width, height); rgba.push(ctx.getImageData(0, 0, width, height).data); }
      finally { bitmap.close(); }
    }
    const seconds = (frames.at(-1).tick - frames[0].tick) / 60 + 0.1;
    return { frames: rgba, width, height, fps: selected.length / seconds, source: 'recorded-flight',
      actualStartTick: frames[0].tick, actualEndTick: frames.at(-1).tick };
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Browser codec export: play only the recorded pixels into an isolated output canvas. */
export async function encodeFlightVideo(clip, {
  signal, format = 'mp4', scope = globalThis, audioTape = getReplayAudioTape(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const frames = getFlightFootage()?.ring.window(clip.startTick, clip.endTick) || [];
  if (frames.length < 2 || typeof scope.MediaRecorder !== 'function') return null;
  const pcm = audioTape?.window(frames[0].tick, frames.at(-1).tick);
  const hasAudio = !!pcm && audioTape?.context?.state === 'running';
  // Reuse the captured master mix even when the fresh theater renderer is unavailable.
  // A pre-gesture/expired sound window keeps the existing silent-video recovery route.
  const codecs = format === 'webm'
    ? (hasAudio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'])
    : (hasAudio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8']);
  const mime = codecs.find((type) => scope.MediaRecorder.isTypeSupported(type));
  if (!mime) return null;
  let canvas = null, video = null, stream = null, audio = null, recorder = null;
  const chunks = [];
  const abort = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
  const audioClockRunning = () => {
    abortIfNeeded(signal);
    if (audio && audio.context.state !== 'running') throw new Error('The sound output stopped during export; retry after resuming audio');
  };
  const waitForAudio = async (due) => {
    audioClockRunning();
    while (audio.context.currentTime < due) {
      await wait(Math.min(10, (due - audio.context.currentTime) * 1000));
      audioClockRunning();
    }
  };
  let maximumSkew = 0;
  try {
    abortIfNeeded(signal);
    canvas = scope.document.createElement('canvas'); canvas.width = frames[0].width; canvas.height = frames[0].height;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.captureStream) return null;
    video = canvas.captureStream(0);
    audio = hasAudio ? createReplayAudioPlayback(pcm, audioTape.context) : null;
    if (hasAudio && !audio) throw new Error('The sound output stopped during export; retry after resuming audio');
    stream = audio ? new scope.MediaStream([...video.getVideoTracks(), ...audio.stream.getAudioTracks()]) : video;
    recorder = new scope.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000, ...(audio ? { audioBitsPerSecond: 192_000 } : {}) });
    let stopResolve, rejectRecord;
    const done = new Promise((resolve, reject) => { stopResolve = resolve; rejectRecord = reject; });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = stopResolve; recorder.onerror = (event) => rejectRecord(event.error || new Error('Video encoder failed'));
    signal?.addEventListener('abort', abort, { once: true });
    let start = null;
    for (let i = 0; i < frames.length; i += 1) {
      abortIfNeeded(signal);
      const blob = await decodeFootageFrameToBlob(frames[i], { signal });
      if (!blob) return null;
      const bitmap = await scope.createImageBitmap(blob);
      try {
        if (i === 0) {
          // Decode the first picture before starting sound or the recorder. Later pictures
          // use the same audio clock, rather than accumulating JPEG decode time as drift.
          audioClockRunning();
          if (audio) { start = audio.context.currentTime + 0.05; audio.start(start); await waitForAudio(start); }
          recorder.start();
        }
        if (audio) {
          const due = start + (frames[i].tick - frames[0].tick) / 60;
          await waitForAudio(due);
          maximumSkew = Math.max(maximumSkew, Math.abs(audio.context.currentTime - due));
          if (maximumSkew > 1 / FLIGHT_FOOTAGE_LIMITS.fps) throw new Error('Export could not keep sound within one frame; retry when the renderer is free');
        }
        abortIfNeeded(signal);
        ctx.drawImage(bitmap, 0, 0); video.getVideoTracks()[0].requestFrame?.();
      } finally { bitmap.close(); }
      const delay = i + 1 < frames.length ? (frames[i + 1].tick - frames[i].tick) * 1000 / 60 : 100;
      if (!audio || i + 1 === frames.length) await wait(delay);
    }
    audioClockRunning();
    if (recorder.state !== 'inactive') recorder.stop();
    await done; abortIfNeeded(signal);
    const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
    return { bytes, mime: mime.split(';')[0], format: mime.startsWith('video/mp4') ? 'mp4' : 'webm', source: 'recorded-flight',
      soundtrack: audio ? 'recorded-master-bus' : null, maximumAudioSkewS: audio ? maximumSkew : null,
      actualStartTick: frames[0].tick, actualEndTick: frames.at(-1).tick };
  } finally {
    signal?.removeEventListener('abort', abort);
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* finish other owned resources */ }
    try { audio?.stop(); } catch { /* graph may already have closed */ }
    for (const track of (stream || video)?.getTracks() || []) {
      try { track.stop(); } catch { /* finish other owned tracks */ }
    }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
