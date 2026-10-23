// Thirty seconds of the actual master mix, indexed by presented sim ticks. Audio
// graph ownership stays with audioSystem: never create/unlock/close an AudioContext.
import { getReplayAudioSource } from './audioSystem.js';

const WINDOW_SECONDS = 30;
const MARKER_CAPACITY = 4096;
const SEGMENT_CAPACITY = 16384;

export function createReplayAudioRing(sampleRate, seconds = WINDOW_SECONDS) {
  const capacity = Math.ceil(sampleRate * Math.min(WINDOW_SECONDS, Math.max(1, seconds)));
  const left = new Float32Array(capacity), right = new Float32Array(capacity);
  const markerTicks = new Float64Array(MARKER_CAPACITY), markerFrames = new Float64Array(MARKER_CAPACITY);
  const segmentFrames = new Float64Array(SEGMENT_CAPACITY), segmentSeqs = new Float64Array(SEGMENT_CAPACITY);
  const segmentSizes = new Uint32Array(SEGMENT_CAPACITY);
  let total = 0, markers = 0, segments = 0;
  return {
    sampleRate, capacity,
    clear() { total = 0; markers = 0; segments = 0; },
    mark(tick, time) {
      if (!Number.isFinite(tick) || !Number.isFinite(time)) return;
      const previous = (markers - 1 + MARKER_CAPACITY) % MARKER_CAPACITY;
      if (markers && markerTicks[previous] === tick) return;
      const at = markers++ % MARKER_CAPACITY;
      markerTicks[at] = tick; markerFrames[at] = time * sampleRate;
    },
    append(audioFrame, l, r = l) {
      if (!l?.length || l.length !== r?.length) return;
      const at = segments++ % SEGMENT_CAPACITY;
      segmentFrames[at] = audioFrame; segmentSeqs[at] = total; segmentSizes[at] = l.length;
      for (let i = 0; i < l.length; i++) {
        const target = (total + i) % capacity;
        left[target] = l[i]; right[target] = r[i];
      }
      total += l.length;
    },
    window(startTick, endTick) {
      if (!(endTick > startTick) || markers < 2 || !segments) return null;
      const markStart = Math.max(0, markers - MARKER_CAPACITY), markEnd = markers - 1;
      let m = markStart;
      while (m + 1 < markers && markerTicks[(m + 1) % MARKER_CAPACITY] <= startTick) m++;
      if (markerTicks[m % MARKER_CAPACITY] > startTick || markerTicks[markEnd % MARKER_CAPACITY] < endTick) return null;
      const length = Math.ceil((endTick - startTick) / 60 * sampleRate);
      if (length > capacity) return null;
      const l = new Float32Array(length), r = new Float32Array(length);
      let segment = Math.max(0, segments - SEGMENT_CAPACITY), found = 0;
      for (let i = 0; i < length; i++) {
        const tick = startTick + i / sampleRate * 60;
        while (m + 1 < markers - 1 && markerTicks[(m + 1) % MARKER_CAPACITY] <= tick) m++;
        const a = m % MARKER_CAPACITY, b = (m + 1) % MARKER_CAPACITY;
        const span = markerTicks[b] - markerTicks[a];
        const frame = markerFrames[a] + (markerFrames[b] - markerFrames[a]) * (span > 0 ? (tick - markerTicks[a]) / span : 0);
        while (segment + 1 < segments && segmentFrames[(segment + 1) % SEGMENT_CAPACITY] <= frame) segment++;
        const at = segment % SEGMENT_CAPACITY, offset = Math.round(frame - segmentFrames[at]);
        if (offset < 0 || offset >= segmentSizes[at]) continue;
        const seq = segmentSeqs[at] + offset;
        if (seq < total - capacity || seq >= total) continue;
        l[i] = left[seq % capacity]; r[i] = right[seq % capacity]; found++;
      }
      if (found / length < 0.98) return null;
      return { sampleRate, left: l, right: r, seconds: length / sampleRate, coverage: found / length,
        startTick, endTick, source: 'gesture-started-master-bus' };
    },
    census() { return { samples: Math.min(total, capacity), capacity, markers: Math.min(markers, MARKER_CAPACITY) }; },
  };
}

let active = null;

export function getReplayAudioTape() { return active; }

export function installReplayAudioTape(bus, { stateOf = () => null, sourceOf = getReplayAudioSource } = {}) {
  active?.dispose();
  let tap = null, master = null, context = null, ring = null, loading = false, disposed = false, failedContext = null;
  let raf = null, recording = false;
  const off = [];
  const session = {
    get context() { return context; },
    window(start, end) { return ring?.window(start, end) || null; },
    clear() { ring?.clear(); },
    dispose() {
      disposed = true;
      if (raf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      for (const stop of off) stop?.();
      try { master?.disconnect(tap); } catch { /* the game may have already torn its graph down */ }
      try { tap?.disconnect(); tap?.port.close(); } catch { /* teardown */ }
      if (active === session) active = null;
      tap = null; master = null; context = null; ring = null;
    },
  };
  async function attach(source) {
    if (loading || disposed || !source?.context?.audioWorklet || typeof AudioWorkletNode === 'undefined') return;
    loading = true;
    try {
      await source.context.audioWorklet.addModule(new URL('./replayAudioWorklet.js', import.meta.url));
      if (disposed || source.context.state !== 'running') return;
      context = source.context; master = source.node;
      ring = createReplayAudioRing(context.sampleRate);
      tap = new AudioWorkletNode(context, 'spaceface-replay-audio', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      tap.port.onmessage = (event) => {
        if (!disposed && event.data?.left) ring?.append(event.data.frame, event.data.left, event.data.right);
      };
      master.connect(tap); tap.connect(context.destination);
    } finally { loading = false; }
  }
  function frame() {
    if (disposed) return;
    const source = sourceOf(), state = stateOf();
    if (tap && source && (source.context !== context || source.node !== master)) {
      try { master.disconnect(tap); tap.disconnect(); tap.port.close(); } catch { /* replaced graph */ }
      tap = null; master = null; context = null; ring = null; recording = false;
    }
    if (!tap && source && !loading && source.context !== failedContext) attach(source).catch(() => { failedContext = source.context; });
    const on = !!tap && state?.mode === 'flight' && !state.paused;
    if (tap && on !== recording) { recording = on; tap.port.postMessage({ recording: on }); }
    if (on && context?.state === 'running') ring.mark(state.tick, context.currentTime);
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  }
  for (const event of ['game:new', 'save:loaded', 'game:exitToMenu']) if (bus?.on) off.push(bus.on(event, () => session.clear()));
  active = session;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  return session;
}

/** Schedule the sealed PCM on that same context and expose only an export audio track. */
export function createReplayAudioPlayback(pcm, context) {
  if (!pcm || !context || context.state !== 'running') return null;
  const buffer = context.createBuffer(2, pcm.left.length, pcm.sampleRate);
  buffer.copyToChannel(pcm.left, 0); buffer.copyToChannel(pcm.right, 1);
  const destination = context.createMediaStreamDestination(), source = context.createBufferSource();
  source.buffer = buffer; source.connect(destination);
  let started = false;
  return {
    stream: destination.stream, context,
    start(at) { if (!started) { started = true; source.start(at); } },
    stop() {
      try { source.stop(); } catch { /* a source scheduled but not started is already quiet */ }
      source.disconnect(); destination.disconnect();
      for (const track of destination.stream.getTracks()) track.stop();
    },
  };
}
