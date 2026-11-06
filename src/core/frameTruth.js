// E10 — Frame-truth recorder: one always-on, allocation-free ingest of the numbers every
// performance campaign cites, one dev overlay, one JSON trace export. This module owns
// NOTHING authoritative: it reads the probes that already exist (presentationRunner frame
// timings, sim-lane reply work, the snapshot fence's presented clock, the mirrored player
// row) and records them in preallocated typed rings so a live session can always answer
// "where did the frame go, and what did the ship do".

const RING_FRAMES = 1800;          // ~30 s at 60 Hz
const RING_REPLIES = 2048;         // 2–10 Hz replies → 3–6 minutes of arrivals
const OVERLAY_UPDATE_MS = 100;

const FRAME_FIELDS = Object.freeze([
  'wallMs',          // ms since recorder start
  'frameDtMs',       // rAF delta
  'callbackMs',      // whole rAF callback JS time
  'presentMs',       // registry.renderUpdate (render JS) time
  'steps',           // sim steps this frame
  'simTimeS',        // authoritative sim time at present
  'tick',            // authoritative tick at present
  'replyAgeMs',      // wall age of the newest applied worker reply (99999 = none yet)
  'workerWorkMs',    // newest reply's authoritative step cost
  'workerStepsMs',
  'workerPackMs',
  'applyMs',         // main-thread apply cost of the newest reply
  'playoutDelayMs',  // presented clock behind the newest pack (fence)
  'extrapolateMs',   // presented clock past the newest pack (fence)
  'bufferDepthPacks',// history packs between the presented bracket and the newest
  'playerX',         // presented-or-mirrored player pose
  'playerZ',
  'playerSpeed',
  'poseJumpWu',      // per-frame presented pose delta (0 when the pose repeats)
  'heldPoseFrames',  // consecutive repeat-pose frames while speed > HELD_SPEED (1 during a streak)
  'drawCalls',
  'trianglesK',
  'heapMB',
]);

const REPLY_FIELDS = Object.freeze([
  'wallMs', 'workMs', 'stepsMs', 'packMs', 'applyMs', 'steps', 'journalRecords', 'events',
]);

const HELD_SPEED = 5;              // wu/s — below this a still pose is not a freeze
const HELD_EPSILON_WU = 0.001;

function nowMs() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now() : Date.now();
}

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function makeRing(size, fields) {
  const columns = {};
  for (const field of fields) columns[field] = new Float64Array(size);
  return { size, fields, columns, write: 0, count: 0 };
}

function ringPush(ring, values) {
  const index = ring.write;
  for (const field of ring.fields) {
    const value = values[field];
    ring.columns[field][index] = Number.isFinite(value) ? value : 0;
  }
  ring.write = (index + 1) % ring.size;
  if (ring.count < ring.size) ring.count++;
}

function ringToArray(ring, field, from = 0) {
  const out = new Array(ring.count);
  const start = (ring.write - ring.count + ring.size) % ring.size;
  for (let i = 0; i < ring.count; i++) out[i] = ring.columns[field][(start + i) % ring.size];
  return from > 0 && out.length > from ? out.slice(out.length - from) : out;
}

function ringStats(ring, field, window = Infinity) {
  const values = ringToArray(ring, field, window);
  if (!values.length) return { n: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  let total = 0;
  for (const value of values) total += value;
  return {
    n: values.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean: total / values.length,
  };
}

function ensureOverlay(recorder) {
  if (typeof document === 'undefined') return null;
  if (recorder.overlayEl && recorder.overlayEl.isConnected) return recorder.overlayEl;
  const el = document.createElement('div');
  el.id = 'sf-frame-truth';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Frame truth diagnostics overlay');
  el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483000;pointer-events:none;'
    + 'font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;color:#d8e6ff;'
    + 'background:rgba(6,12,24,0.82);border:1px solid rgba(120,170,255,0.35);border-radius:6px;'
    + 'padding:8px 10px;white-space:pre;display:none;text-shadow:0 1px 2px rgba(0,0,0,0.8);';
  document.body.appendChild(el);
  recorder.overlayEl = el;
  return el;
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function overlayText(recorder) {
  const f = recorder.lastFrame;
  const work = ringStats(recorder.replies, 'workMs', 120);
  const cb = ringStats(recorder.frames, 'callbackMs', 600);
  const present = ringStats(recorder.frames, 'presentMs', 600);
  const jump = ringStats(recorder.frames, 'poseJumpWu', 600);
  const interval = ringStats(recorder.replyIntervals, 'ms', 120);
  const fps = f.frameDtMs > 0 ? 1000 / f.frameDtMs : 0;
  const replyHz = interval.mean > 0 ? 1000 / interval.mean : 0;
  return [
    'FRAME TRUTH  (Ctrl+Alt+F hide · Ctrl+Alt+J export)',
    `fps ${fmt(fps, 0)}  dt ${fmt(f.frameDtMs)}ms  cb p50/p95 ${fmt(cb.p50)}/${fmt(cb.p95)}ms  present p50/p95 ${fmt(present.p50)}/${fmt(present.p95)}ms`,
    `worker replies ${fmt(replyHz, 1)}/Hz  age ${fmt(f.replyAgeMs, 0)}ms  work p50/p95/max ${fmt(work.p50)}/${fmt(work.p95)}/${fmt(work.max)}ms`,
    `apply ${fmt(f.applyMs)}ms  steps ${fmt(f.steps, 0)}  sim ${fmt(f.simTimeS, 2)}s tick ${fmt(f.tick, 0)}`,
    `playout delay ${fmt(f.playoutDelayMs)}ms  extrapolating ${fmt(f.extrapolateMs)}ms  depth ${fmt(f.bufferDepthPacks, 0)} packs`,
    `player ${fmt(f.playerX, 1)},${fmt(f.playerZ, 1)} @ ${fmt(f.playerSpeed, 1)}wu/s  jumps ${fmt(jump.n, 0)}/600f max ${fmt(jump.max, 2)}wu  held ${fmt(recorder.heldStreak, 0)}f`,
    `draws ${fmt(f.drawCalls, 0)}  tris ${fmt(f.trianglesK, 0)}k  heap ${fmt(f.heapMB, 0)}MB`,
    recorder.note,
  ].filter(Boolean).join('\n');
}

function installHotkeys(recorder) {
  if (typeof window === 'undefined' || recorder.hotkeysInstalled) return;
  recorder.hotkeysInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.altKey) return;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === 'f') {
      event.preventDefault();
      recorder.setOverlayVisible(!recorder.overlayVisible);
    } else if (key === 'j') {
      event.preventDefault();
      void recorder.exportJSON();
    }
  }, { capture: true });
}

function download(name, text) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (_) {
    return false;
  }
}

export function ensureFrameTruth(state) {
  if (state && state.frameTruth && state.frameTruth.__frameTruthV1) return state.frameTruth;
  if (!state || typeof state !== 'object') throw new TypeError('ensureFrameTruth requires state');

  const recorder = {
    __frameTruthV1: true,
    startedAtMs: nowMs(),
    frames: makeRing(RING_FRAMES, FRAME_FIELDS),
    replies: makeRing(RING_REPLIES, REPLY_FIELDS),
    replyIntervals: makeRing(RING_REPLIES, ['ms']),
    lastFrame: {},
    lastReplyWallMs: -1,
    heldStreak: 0,
    overlayVisible: false,
    overlayEl: null,
    overlayTimer: null,
    hotkeysInstalled: false,
    note: '',
    // Export-time extras (E5 probe): providers push () => ({...}) objects folded into
    // every trace — the sim-lane/SAB state rides the same evidence as the frame data.
    extraProviders: [],
    lastPlayerX: NaN,
    lastPlayerZ: NaN,
  };

  recorder.setOverlayVisible = (visible) => {
    recorder.overlayVisible = visible === true;
    const el = recorder.overlayVisible ? ensureOverlay(recorder) : recorder.overlayEl;
    if (!el) return;
    el.style.display = recorder.overlayVisible ? 'block' : 'none';
    if (recorder.overlayVisible && recorder.overlayTimer === null) {
      const tickOverlay = () => {
        if (!recorder.overlayVisible) { recorder.overlayTimer = null; return; }
        try { el.textContent = overlayText(recorder); } catch (_) { /* overlay never aborts */ }
        recorder.overlayTimer = setTimeout(tickOverlay, OVERLAY_UPDATE_MS);
      };
      tickOverlay();
    }
  };

  // One call per worker reply (2–10 Hz): the authoritative cost chain.
  recorder.noteWorkerReply = (sample) => {
    if (!sample) return;
    const wall = Number.isFinite(sample.wallMs) ? sample.wallMs : nowMs();
    if (recorder.lastReplyWallMs >= 0) {
      ringPush(recorder.replyIntervals, { ms: Math.max(0, wall - recorder.lastReplyWallMs) });
    }
    recorder.lastReplyWallMs = wall;
    ringPush(recorder.replies, {
      wallMs: wall - recorder.startedAtMs,
      workMs: sample.workMs,
      stepsMs: sample.stepsMs,
      packMs: sample.packMs,
      applyMs: sample.applyMs,
      steps: sample.steps,
      journalRecords: sample.journalRecords,
      events: sample.events,
    });
  };

  // One call per presented frame. Everything is read defensively: a missing probe
  // records as 0 rather than aborting the loop that feeds it.
  recorder.ingestFrame = (sample) => {
    if (!sample) return;
    const now = nowMs();
    const playerRow = sample.playerRow || null;
    const px = playerRow && playerRow.pos ? Number(playerRow.pos.x) : NaN;
    const pz = playerRow && playerRow.pos ? Number(playerRow.pos.z) : NaN;
    const speed = playerRow
      ? Math.hypot(Number(playerRow.vx) || 0, Number(playerRow.vz) || 0)
      : 0;
    let jump = 0;
    if (Number.isFinite(px) && Number.isFinite(recorder.lastPlayerX)) {
      jump = Math.hypot(px - recorder.lastPlayerX, pz - recorder.lastPlayerZ);
    }
    // The E1 verify metric's raw material: a pose that repeats while the body's own
    // velocity is non-zero is the hold-then-jump signature, counted per frame.
    let heldFrame = 0;
    if (Number.isFinite(px) && speed > HELD_SPEED && jump <= HELD_EPSILON_WU) {
      recorder.heldStreak++;
      heldFrame = 1;
    } else if (jump > HELD_EPSILON_WU) {
      recorder.heldStreak = 0;
    }
    recorder.lastPlayerX = px;
    recorder.lastPlayerZ = pz;
    const values = {
      wallMs: now - recorder.startedAtMs,
      frameDtMs: sample.frameDtMs,
      callbackMs: sample.callbackMs,
      presentMs: sample.presentMs,
      steps: sample.steps,
      simTimeS: sample.simTimeS,
      tick: sample.tick,
      replyAgeMs: sample.replyAgeMs,
      workerWorkMs: sample.workerWorkMs,
      workerStepsMs: sample.workerStepsMs,
      workerPackMs: sample.workerPackMs,
      applyMs: sample.applyMs,
      playoutDelayMs: sample.playoutDelayMs,
      extrapolateMs: sample.extrapolateMs,
      bufferDepthPacks: sample.bufferDepthPacks,
      playerX: px,
      playerZ: pz,
      playerSpeed: speed,
      poseJumpWu: jump,
      heldPoseFrames: heldFrame,
      drawCalls: sample.drawCalls,
      trianglesK: sample.trianglesK,
      heapMB: sample.heapMB,
    };
    ringPush(recorder.frames, values);
    recorder.lastFrame = values;
  };

  recorder.snapshotSummary = () => ({
    fps: recorder.lastFrame.frameDtMs > 0 ? 1000 / recorder.lastFrame.frameDtMs : 0,
    // Worker cost stats are per-reply distributions (the 2–10 Hz authoritative chain),
    // not per-frame last values.
    workerWork: ringStats(recorder.replies, 'workMs'),
    workerSteps: ringStats(recorder.replies, 'stepsMs'),
    workerApply: ringStats(recorder.replies, 'applyMs'),
    replyInterval: ringStats(recorder.replyIntervals, 'ms'),
    frameCallback: ringStats(recorder.frames, 'callbackMs'),
    present: ringStats(recorder.frames, 'presentMs'),
    poseJump: ringStats(recorder.frames, 'poseJumpWu'),
    heldPoseStreak: recorder.heldStreak,
    heapMB: {
      start: ringToArray(recorder.frames, 'heapMB')[0] || 0,
      end: recorder.lastFrame.heapMB || 0,
    },
  });

  recorder.exportJSON = (options = {}) => {
    const fence = typeof options.fence !== 'undefined' ? options.fence : null;
    const columns = {};
    for (const field of FRAME_FIELDS) columns[field] = ringToArray(recorder.frames, field);
    const trace = {
      schema: 'spaceface.frameTruth.v1',
      startedAtWallMs: recorder.startedAtMs,
      exportedAtWallMs: nowMs(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      crossOriginIsolated: typeof globalThis !== 'undefined'
        ? globalThis.crossOriginIsolated === true : false,
      sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
      frameCount: recorder.frames.count,
      columns,
      replies: {
        count: recorder.replies.count,
        wallMs: ringToArray(recorder.replies, 'wallMs'),
        workMs: ringToArray(recorder.replies, 'workMs'),
        stepsMs: ringToArray(recorder.replies, 'stepsMs'),
        packMs: ringToArray(recorder.replies, 'packMs'),
        applyMs: ringToArray(recorder.replies, 'applyMs'),
        steps: ringToArray(recorder.replies, 'steps'),
        journalRecords: ringToArray(recorder.replies, 'journalRecords'),
        events: ringToArray(recorder.replies, 'events'),
        intervalMs: ringToArray(recorder.replyIntervals, 'ms'),
      },
      summary: recorder.snapshotSummary(),
      fence: fence && typeof fence.getPlayoutDiagnostics === 'function'
        ? fence.getPlayoutDiagnostics() : null,
    };
    if (typeof options.extra === 'object' && options.extra) Object.assign(trace, options.extra);
    for (const provider of recorder.extraProviders) {
      try {
        const extra = provider();
        if (extra && typeof extra === 'object') Object.assign(trace, extra);
      } catch (_) { /* a broken probe never blocks the export */ }
    }
    const text = JSON.stringify(trace);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(`frame-truth-${stamp}.json`, text);
    return trace;
  };

  if (typeof window !== 'undefined') {
    window.__SF_FRAME_TRUTH__ = recorder;
    installHotkeys(recorder);
  }
  state.frameTruth = recorder;
  return recorder;
}

/** Frame overlay auto-enable from the boot URL (?frameTruth=1). */
export function frameTruthRequestedByParam(search) {
  try {
    return new URLSearchParams(search || '').get('frameTruth') === '1';
  } catch (_) {
    return false;
  }
}
