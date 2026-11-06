/** Native media owns its frame clock. Loading events must never seek or redraw it.
 * This controller observes a bounded first-frame proof; it does NOT drive playback
 * from rAF/requestVideoFrameCallback, and a late JS callback is not a video stall.
 *
 * Two gates leave this module. `ready` is the instrument's bounded first-frame
 * proof and may be the short poster deadline. `playbackReady` is the boot hold:
 * the game graph waits for a real playback proof (or the generous `holdMs` cap,
 * or an invisible window) — the intro visualizer outranks every other startup
 * asset, and a few extra seconds are the cheap price of an intro never freezing.
 */
export const BOOT_MEDIA = Object.freeze({
  normal: 'assets/cinematics/boot-visualizer.mp4',
  quiet: 'assets/cinematics/boot-visualizer-quiet.mp4',
  original: 'assets/cinematics/intro-visualizer.mp4',
  poster: 'assets/cinematics/boot-visualizer.jpg',
});

/** Owner direction: the boot movie reads too slow at 1.0 — present it 15% faster.
 * The fallback ORIGINAL movie keeps its own authored pace. */
export const BOOT_PLAYBACK_RATE = 1.15;

export function createBootMediaPlayback({ video, host = globalThis, timeoutMs = 2500, holdMs = 9000,
  motionReduced = () => false, flashReduced = () => false, hidden = () => false,
  onState = () => {}, onFallback = () => {}, sources = BOOT_MEDIA,
  startOffset = null } = {}) {
  if (!video?.addEventListener || typeof video.play !== 'function') return null;
  let wanted = false, disposed = false, failed = false, pending = false;
  let epoch = 0, frameHandle = null, deadline = null, resolveReady;
  let readySettled = false, status = 'idle', selected = '', quiet = null;
  let lastFrame = null, proofFrames = 0, resumeTime = 0, fallbackUsed = false;
  let playbackSettled = false, playbackDeadline = null, resolvePlayback;
  let assignedSource = '', assignedUrl = '', pendingStartOffset = false;
  const listeners = [];
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const playbackReady = new Promise(resolve => { resolvePlayback = resolve; });
  const canRun = () => wanted && !disposed && !hidden() && !motionReduced();
  const notify = (next, reason = '') => {
    status = next;
    try { onState({ status, reason, source: selected, proofFrames }); } catch {}
  };
  const settle = reason => {
    if (readySettled) return;
    readySettled = true;
    if (deadline !== null) host.clearTimeout(deadline);
    deadline = null;
    resolveReady({ status, reason, source: selected, proofFrames });
  };
  // Independent of settle(): once the poster deadline has consumed the instrument
  // gate, a late playback proof must still reach the boot hold.
  const settlePlayback = reason => {
    if (playbackSettled) return;
    playbackSettled = true;
    if (playbackDeadline !== null) host.clearTimeout(playbackDeadline);
    playbackDeadline = null;
    resolvePlayback({ status, reason, source: selected, proofFrames });
  };
  const cancelProof = () => {
    if (frameHandle !== null) video.cancelVideoFrameCallback?.(frameHandle);
    frameHandle = null;
  };
  const pause = () => {
    epoch++; pending = false; cancelProof(); lastFrame = null; proofFrames = 0;
    try { video.pause(); } catch {}
  };
  // ---------------------------------------------------------------------------
  // In-memory transport: a loading movie must never wait on the wire. Each clip
  // is fetched once into a blob mint and replayed from memory, so heavy asset
  // streaming during a load (authored-visuals, gpu-resources) can never starve
  // the decoder into `waiting`. Until the mint lands the plain URL plays exactly
  // as before; the swap only ever happens while the element is paused.
  const blobCache = new Map();
  function prefetch(source) {
    if (!source || blobCache.has(source)) return;
    const entry = { url: null, failed: false };
    blobCache.set(source, entry);
    if (typeof host.fetch !== 'function' || typeof host.URL?.createObjectURL !== 'function') {
      entry.failed = true; return;
    }
    try {
      Promise.resolve(host.fetch(source, { priority: 'high' })).then(response => {
        if (!response || response.ok === false) throw new Error('http');
        return response.blob();
      }).then(blob => {
        if (disposed || !blob || !blob.size) { entry.failed = true; return; }
        entry.url = host.URL.createObjectURL(blob);
      }).catch(() => { entry.failed = true; });
    } catch (_) { entry.failed = true; }
  }
  function resolvedUrl(source) {
    if (!source) return '';
    const cached = blobCache.get(source);
    if (cached?.url) return cached.url;
    prefetch(source);
    return source;
  }
  /** Whether the element's current stream is already this source — the minted
   *  blob or the plain path the parse-time markup streams. */
  function ownsElement(source) {
    if (!source) return false;
    if (assignedSource === source) return true;
    const current = String(video.currentSrc || video.src || '');
    return !!current && (current === source || current.endsWith('/' + source));
  }
  /** Swap to the minted in-memory URL while the element is paused — invisible,
   *  and the only moment a reload is free. Keeps the paused position via the
   *  ordinary resumeTime path so the swap is not a seek the player can see. */
  function upgradeTransport() {
    if (!selected || failed || !video.paused) return false;
    const minted = blobCache.get(selected)?.url;
    if (!minted || minted === assignedUrl) return false;
    selectSource(selected, { fresh: true });
    return true;
  }
  // ---------------------------------------------------------------------------
  // Session entry point: a fresh loading session enters the ambient loop at a
  // different place every time — the movie is a loop, not a sequence, and the
  // first seconds were the only ones a player ever saw.
  function applyStartOffset() {
    if (typeof startOffset !== 'function' || failed) return;
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) { pendingStartOffset = true; return; }
    const t = startOffset(duration, Number(video.currentTime) || 0);
    if (t == null || !Number.isFinite(Number(t))) return;
    const clamped = Math.min(Math.max(0, Number(t)), Math.max(0, duration - .5));
    try { if (Number(video.currentTime) !== clamped) video.currentTime = clamped; } catch (_) {}
  }
  function acceptFrame(mediaTime) {
    if (!canRun() || failed || video.readyState < 2 || !Number.isFinite(mediaTime)) return;
    if (lastFrame === null || mediaTime !== lastFrame) { lastFrame = mediaTime; proofFrames++; }
    if (proofFrames >= 2) {
      notify('video'); settle('two-presented-media-frames'); settlePlayback('video'); cancelProof();
    }
  }
  function armProof() {
    if (!canRun() || failed || frameHandle !== null || proofFrames >= 2) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const owner = epoch;
      frameHandle = video.requestVideoFrameCallback((_now, metadata) => {
        frameHandle = null;
        if (disposed || owner !== epoch) return;
        acceptFrame(Number(metadata?.mediaTime));
        armProof();
      });
    }
  }
  function fail(reason) {
    if (disposed || failed) return;
    // An old package may lack the new bake. Try the ORIGINAL movie, not a second
    // renderer. Never substitute a flashier clip for the reduced-flash variant.
    if (!quiet && !fallbackUsed && sources.original && selected !== sources.original) {
      fallbackUsed = true; selectSource(sources.original); return;
    }
    failed = true; pause(); notify('fallback', reason); settle(reason); settlePlayback(reason);
    try { onFallback(reason); } catch {}
  }
  function play() {
    if (!canRun() || failed) return;
    armProof();
    if (pending || video.paused === false) return;
    pending = true;
    const owner = epoch;
    try {
      Promise.resolve(video.play()).then(() => {
        if (disposed || owner !== epoch) return;
        pending = false;
        if (!canRun()) pause(); // hide/reduced-motion won while play was pending
      }, error => {
        if (disposed || owner !== epoch || !canRun()) return;
        pending = false; fail(error?.name || 'play-rejected');
      });
    } catch (error) { pending = false; fail(error?.name || 'play-failed'); }
  }
  function selectSource(source, { fresh = false } = {}) {
    const url = resolvedUrl(source);
    const previous = Number(video.currentTime) || 0;
    // The entry markup already streams the normal clip (preload=auto, fetchpriority=high) and
    // the parse-time kick may already be presenting it. Re-selecting the SAME movie must not
    // reload or pause it: a restart re-buffered a clip that was already playing and cost the
    // intro its first visible seconds. `fresh` opts out — the paused transport
    // upgrade re-sources the same movie on purpose.
    const adoptPlaying = !fresh && ownsElement(source) && video.readyState >= 1 && !video.error;
    if (!adoptPlaying) pause();
    selected = source;
    resumeTime = adoptPlaying ? 0 : previous;
    lastFrame = null; proofFrames = 0;
    video.preload = 'auto'; video.muted = true; video.loop = true;
    video.playsInline = true;
    if (adoptPlaying) {
      // No probing state here: the drift keyframe would pop an already-playing picture. The
      // first presented frames complete the proof and set the live state directly.
    } else {
      // The only source switch/seek is a real asset or preference change. Neither
      // start(), progress reporting nor a new loading stage resets the movie.
      video.src = url;
      assignedSource = source; assignedUrl = url;
      notify('probing');
      try { video.load(); } catch (error) { fail(error?.name || 'load-failed'); return; }
    }
    // load() resets the rate to defaultPlaybackRate; without a load the pace must still be
    // (re)applied — the parse-time kick plays at the authored 1.0 rate until here.
    try { video.playbackRate = source === sources.original ? 1 : BOOT_PLAYBACK_RATE; } catch {}
    play();
  }
  function refresh() {
    if (disposed) return;
    if (!wanted) { pause(); upgradeTransport(); return; }
    // An invisible window releases the boot hold at once — nothing visible is
    // waiting on the movie, and the play request revives on return. The paused
    // element is also the free moment to leave the wire for the memory mint.
    if (hidden()) { pause(); upgradeTransport(); settlePlayback('hidden'); return; }
    if (motionReduced()) {
      pause(); notify('poster', 'reduced-motion'); settle('reduced-motion');
      settlePlayback('reduced-motion'); return;
    }
    const nextQuiet = !!flashReduced();
    if (quiet !== nextQuiet || !selected) {
      quiet = nextQuiet; failed = false; fallbackUsed = false;
      selectSource(quiet ? sources.quiet : sources.normal);
    } else if (!failed) {
      // Between sessions the paused element moves off the wire onto its minted
      // memory copy; within a session nothing re-sources the movie.
      if (!video.paused || !upgradeTransport()) play();
    }
  }
  const listen = (event, fn) => { video.addEventListener(event, fn); listeners.push([event, fn]); };
  listen('loadedmetadata', () => {
    if (disposed || failed) return;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      if (resumeTime > 0) {
        try { video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .1)); } catch {}
        pendingStartOffset = false;
      } else if (pendingStartOffset) {
        // First load with unknown duration: the session's entry offset waited for metadata.
        applyStartOffset();
      }
    }
    pendingStartOffset = false;
    resumeTime = 0;
  });
  listen('playing', () => { if (canRun() && !failed) armProof(); });
  // On older hosts, advancing media time + decoded data is the fallback proof.
  listen('timeupdate', () => {
    if (typeof video.requestVideoFrameCallback !== 'function') acceptFrame(Number(video.currentTime));
  });
  listen('waiting', () => {
    if (!canRun() || failed) return;
    proofFrames = 0; lastFrame = null; notify('buffering'); armProof();
  });
  listen('error', () => fail('media-error'));
  video.poster = sources.poster;
  // The ordinary clip's in-memory mint starts downloading now, not inside the
  // first launch click — variant and fallback sources arm on demand.
  prefetch(sources.normal);
  const ctl = {
    ready,
    playbackReady,
    start() {
      if (disposed) return ready;
      if (wanted) return ready; // idempotence is the central playback invariant
      wanted = true;
      if (!readySettled && deadline === null) deadline = host.setTimeout(() => {
        deadline = null;
        if (disposed) return;
        notify('poster', 'startup-media-deadline'); settle('startup-media-deadline');
        // Keep the native play request alive. Slow networking must not permanently
        // strand a good movie, and decoration must not block the game indefinitely.
      }, Math.max(0, timeoutMs));
      // The boot hold: a real playback proof releases it, the poster deadline above
      // does not. Generously bounded so a slow host still boots.
      if (!playbackSettled && playbackDeadline === null) playbackDeadline = host.setTimeout(() => {
        playbackDeadline = null;
        if (disposed) return;
        settlePlayback('playback-hold-deadline');
      }, Math.max(0, holdMs));
      applyStartOffset();
      refresh(); return ready;
    },
    stop() { wanted = false; pause(); upgradeTransport(); },
    refresh,
    inspect() { return { status, source: selected, wanted, disposed, failed, pending, playbackSettled,
      proofFrames, currentTime: Number(video.currentTime) || 0, paused: video.paused,
      decodedFrames: video.getVideoPlaybackQuality?.().totalVideoFrames ?? null }; },
    destroy() {
      if (disposed) return;
      wanted = false; pause(); disposed = true;
      if (deadline !== null) host.clearTimeout(deadline);
      deadline = null;
      for (const entry of blobCache.values()) {
        if (entry.url) { try { host.URL?.revokeObjectURL?.(entry.url); } catch {} }
      }
      blobCache.clear();
      settlePlayback('destroyed');
      for (const [event, fn] of listeners) video.removeEventListener(event, fn);
      status = 'destroyed'; settle('destroyed');
    },
  };
  return ctl;
}
