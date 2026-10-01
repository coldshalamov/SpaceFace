/** Native media owns its frame clock. Loading events must never seek or redraw it.
 * This controller observes a bounded first-frame proof; it does NOT drive playback
 * from rAF/requestVideoFrameCallback, and a late JS callback is not a video stall.
 */
export const BOOT_MEDIA = Object.freeze({
  normal: 'assets/cinematics/boot-visualizer.mp4',
  quiet: 'assets/cinematics/boot-visualizer-quiet.mp4',
  original: 'assets/cinematics/intro-visualizer.mp4',
  poster: 'assets/cinematics/boot-visualizer.jpg',
});

export function createBootMediaPlayback({ video, host = globalThis, timeoutMs = 2500,
  motionReduced = () => false, flashReduced = () => false, hidden = () => false,
  onState = () => {}, onFallback = () => {}, sources = BOOT_MEDIA } = {}) {
  if (!video?.addEventListener || typeof video.play !== 'function') return null;
  let wanted = false, disposed = false, failed = false, pending = false;
  let epoch = 0, frameHandle = null, deadline = null, resolveReady;
  let readySettled = false, status = 'idle', selected = '', quiet = null;
  let lastFrame = null, proofFrames = 0, resumeTime = 0, fallbackUsed = false;
  const listeners = [];
  const ready = new Promise(resolve => { resolveReady = resolve; });
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
  const cancelProof = () => {
    if (frameHandle !== null) video.cancelVideoFrameCallback?.(frameHandle);
    frameHandle = null;
  };
  const pause = () => {
    epoch++; pending = false; cancelProof(); lastFrame = null; proofFrames = 0;
    try { video.pause(); } catch {}
  };
  function acceptFrame(mediaTime) {
    if (!canRun() || failed || video.readyState < 2 || !Number.isFinite(mediaTime)) return;
    if (lastFrame === null || mediaTime !== lastFrame) { lastFrame = mediaTime; proofFrames++; }
    if (proofFrames >= 2) {
      notify('video'); settle('two-presented-media-frames'); cancelProof();
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
    failed = true; pause(); notify('fallback', reason); settle(reason);
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
  function selectSource(source) {
    const previous = Number(video.currentTime) || 0;
    pause(); selected = source; resumeTime = previous;
    lastFrame = null; proofFrames = 0;
    // The only source switch/seek is a real asset or preference change. Neither
    // start(), progress reporting nor a new loading stage resets the movie.
    video.src = source;
    video.preload = 'auto'; video.muted = true; video.loop = true;
    video.playsInline = true; video.playbackRate = 1;
    notify('probing');
    try { video.load(); } catch (error) { fail(error?.name || 'load-failed'); return; }
    play();
  }
  function refresh() {
    if (disposed) return;
    if (!wanted || hidden()) { pause(); return; }
    if (motionReduced()) {
      pause(); notify('poster', 'reduced-motion'); settle('reduced-motion'); return;
    }
    const nextQuiet = !!flashReduced();
    if (quiet !== nextQuiet || !selected) {
      quiet = nextQuiet; failed = false; fallbackUsed = false;
      selectSource(quiet ? sources.quiet : sources.normal);
    } else if (!failed) play();
  }
  const listen = (event, fn) => { video.addEventListener(event, fn); listeners.push([event, fn]); };
  listen('loadedmetadata', () => {
    if (disposed || failed) return;
    if (resumeTime > 0 && Number.isFinite(video.duration) && video.duration > 0) {
      try { video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .1)); } catch {}
    }
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
  const ctl = {
    ready,
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
      refresh(); return ready;
    },
    stop() { wanted = false; pause(); },
    refresh,
    inspect() { return { status, source: selected, wanted, disposed, failed, pending,
      proofFrames, currentTime: Number(video.currentTime) || 0, paused: video.paused,
      decodedFrames: video.getVideoPlaybackQuality?.().totalVideoFrames ?? null }; },
    destroy() {
      if (disposed) return;
      wanted = false; pause(); disposed = true;
      if (deadline !== null) host.clearTimeout(deadline);
      deadline = null;
      for (const [event, fn] of listeners) video.removeEventListener(event, fn);
      status = 'destroyed'; settle('destroyed');
    },
  };
  return ctl;
}
