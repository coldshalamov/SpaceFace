// Export a fresh 720p render of tape poses, never upsample the flight pixel ring.
// A single audio-clock schedule drives both PCM playback and the 30 Hz pictures.
import { THEATER_FRAME_RATE, THEATER_WIDTH, THEATER_HEIGHT } from '../../sim/theaterTape.js';
import { createTheaterSession } from './theaterSession.js';
import { getReplayAudioTape, createReplayAudioPlayback } from '../../audio/replayAudioTape.js';
import { captionSidecar, captionVtt } from '../../presentation/momentMachine/captions.js';
import { deliverClipFile, detectClipExportHost } from './clipExport.js';
import { encodeTheaterWebCodecs } from './theaterWebm.js';

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

export async function encodeTheaterVideo(session, pcm, audioContext, {
  signal, format = 'mp4', scope = globalThis,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!session?.renderAt || !pcm) return null;
  const offline = await encodeTheaterWebCodecs(session, pcm, { signal, scope,
    fps: THEATER_FRAME_RATE, width: THEATER_WIDTH, height: THEATER_HEIGHT });
  if (offline) return offline;
  if (!audioContext || typeof scope.MediaRecorder !== 'function') return null;
  const choices = format === 'webm' ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = choices.find((type) => scope.MediaRecorder.isTypeSupported(type));
  if (!mime) return null;
  const canvas = scope.document.createElement('canvas');
  canvas.width = THEATER_WIDTH; canvas.height = THEATER_HEIGHT;
  const paint = canvas.getContext('2d', { alpha: false });
  if (!paint || !canvas.captureStream) return null;
  const video = canvas.captureStream(THEATER_FRAME_RATE);
  const audio = createReplayAudioPlayback(pcm, audioContext);
  if (!audio) { for (const t of video.getTracks()) t.stop(); return null; }
  const stream = new scope.MediaStream([...video.getVideoTracks(), ...audio.stream.getAudioTracks()]);
  const chunks = [];
  let recorder, resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  try {
    recorder = new scope.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
  } catch (error) {
    audio.stop(); for (const track of video.getTracks()) track.stop();
    canvas.width = 0; canvas.height = 0; throw error;
  }
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  recorder.onstop = resolveDone;
  recorder.onerror = (event) => rejectDone(event.error || new Error('Theater encoder failed'));
  const abort = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  const duration = (session.tape.samples - 1) / session.tape.sampleRate;
  const count = Math.max(1, Math.ceil(duration * THEATER_FRAME_RATE));
  let maximumSkew = 0;
  session.exporting = true;
  const previousTime = session.elapsed;
  const previousPhoto = session.photo.enabled;
  session.setPhoto(false);
  try {
    abortIfNeeded(signal);
    session.seek(0);
    const warm = session.renderAt(THEATER_WIDTH, THEATER_HEIGHT);
    if (!warm?.data) return null;
    paint.putImageData(new scope.ImageData(warm.data, THEATER_WIDTH, THEATER_HEIGHT), 0, 0);
    const start = audioContext.currentTime + 0.05;
    audio.start(start);
    while (audioContext.currentTime < start) { abortIfNeeded(signal); await wait(Math.min(10, (start - audioContext.currentTime) * 1000)); }
    recorder.start();
    for (let i = 0; i < count; i++) {
      const second = i / THEATER_FRAME_RATE, due = start + second;
      while (audioContext.currentTime < due) { abortIfNeeded(signal); await wait(Math.min(10, (due - audioContext.currentTime) * 1000)); }
      abortIfNeeded(signal);
      session.seek(second);
      const frame = session.renderAt(THEATER_WIDTH, THEATER_HEIGHT);
      if (!frame?.data) throw new Error('The tape renderer stopped before export finished');
      paint.putImageData(new scope.ImageData(frame.data, THEATER_WIDTH, THEATER_HEIGHT), 0, 0);
      video.getVideoTracks()[0]?.requestFrame?.();
      maximumSkew = Math.max(maximumSkew, Math.abs(audioContext.currentTime - due));
      if (maximumSkew > 1 / THEATER_FRAME_RATE) throw new Error('Export could not keep sound within one frame; retry when the renderer is free');
    }
    while (audioContext.currentTime < start + duration) { abortIfNeeded(signal); await wait(Math.min(10, (start + duration - audioContext.currentTime) * 1000)); }
    recorder.stop(); await done; abortIfNeeded(signal);
    const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
    return { bytes, mime: mime.split(';')[0], format: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
      source: 'rendered-tape', width: THEATER_WIDTH, height: THEATER_HEIGHT, fps: THEATER_FRAME_RATE,
      frames: count, seconds: duration, soundtrack: 'recorded-master-bus', maximumAudioSkewS: maximumSkew };
  } finally {
    signal?.removeEventListener('abort', abort);
    if (recorder.state !== 'inactive') recorder.stop();
    audio.stop(); for (const track of stream.getTracks()) track.stop();
    canvas.width = 0; canvas.height = 0;
    session.exporting = false; session.seek(previousTime); session.setPhoto(previousPhoto);
  }
}

export async function exportTheaterClip(clip, options = {}) {
  const state = options.state, recording = options.recording || state?.replay?.recording;
  if (!recording || !state) return null;
  const session = createTheaterSession(recording, state, { startTick: clip.startTick, endTick: clip.endTick, moment: clip.moment });
  if (!session) return null;
  let timeout;
  try {
    const audioTape = options.audioTape || getReplayAudioTape();
    const endTick = session.tape.baseTick + (session.tape.samples - 1) / session.tape.sampleRate * 60;
    let pcm = audioTape?.window(session.tape.baseTick, endTick);
    if (!pcm && !audioTape?.context) {
      // The mix tape only exists after a gesture started the audio graph. An export ordered
      // before that still owns a renderable tape: hand the encoder a silent bed of the right
      // length instead of refusing the clip. A real tape with coverage gaps still fails below.
      const sampleRate = 48000;
      const length = Math.max(1, Math.ceil((endTick - session.tape.baseTick) / 60 * sampleRate));
      pcm = { sampleRate, left: new Float32Array(length), right: new Float32Array(length),
        seconds: length / sampleRate, coverage: 1, startTick: session.tape.baseTick, endTick,
        source: 'silent-pre-gesture' };
    }
    if (!pcm) return { ok: false, reason: 'recorded-sound-unavailable', source: 'rendered-tape' };
    const ready = await Promise.race([session.waitReady(), new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 10000); })]);
    clearTimeout(timeout); abortIfNeeded(options.signal);
    if (!ready) return { ok: false, reason: 'tape-renderer-unavailable', source: 'rendered-tape' };
    const encoded = await encodeTheaterVideo(session, pcm, audioTape?.context, options);
    if (encoded && pcm.source === 'silent-pre-gesture') encoded.soundtrack = 'silent-pre-gesture';
    if (!encoded?.bytes.length) return { ok: false, reason: 'video-encoder-unavailable', source: 'rendered-tape' };
    const filename = options.filename || `spaceface-clip-${String(clip.id || 'moment').replace(/[^a-zA-Z0-9_-]/g, '_')}.${encoded.format}`;
    const host = options.host || detectClipExportHost();
    const delivery = deliverClipFile({ ...encoded, filename, host });
    if (delivery.hostResult?.then) {
      const saved = await delivery.hostResult;
      if (saved?.ok === false || saved?.cancelled) return { ok: false, reason: saved.cancelled ? 'cancelled' : 'file-save-failed' };
    }
    const moment = clip.moment || session.moment || { id: clip.id, label: clip.label || 'Recorded flight',
      reason: '', inTick: session.tape.baseTick, outTick: endTick };
    const captionPlan = { ...session.plan, exportSpan: { exportable: true, inTick: session.tape.baseTick, outTick: endTick } };
    const captions = captionSidecar(moment, captionPlan, { locale: state.settings?.locale || 'en-US', soundtrack: encoded.soundtrack });
    deliverClipFile({ bytes: new TextEncoder().encode(captionVtt(captions)), filename: filename.replace(/\.[^.]+$/, '.vtt'), mime: 'text/vtt', host });
    return { ok: true, status: 'exported', ...encoded, filename, captions, bytesLength: encoded.bytes.length, via: delivery.via,
      actualStartTick: session.tape.baseTick, actualEndTick: endTick };
  } finally { clearTimeout(timeout); session.dispose(); }
}
