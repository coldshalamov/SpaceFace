// E10 — Frame-truth recorder: one always-on, small-allocation ingest of the numbers every
// performance campaign cites, one dev overlay, one JSON trace export. This module owns
// NOTHING authoritative: it reads the probes that already exist (presentationRunner frame
// timings, sim-lane reply work, the snapshot fence's presented clock, the mirrored player
// row) and records them in preallocated typed rings so a live session can always answer
// "where did the frame go, and what did the ship do". The per-frame path reuses one value
// object and caller-owned fence/lane scratch; only trace export, the 1 Hz overlay and rare
// timeline events allocate.

import { CREDITS } from '../data/credits.js';

const RING_FRAMES = 1800;          // ~30 s at 60 Hz
const RING_REPLIES = 2048;         // 2–10 Hz replies → 3–6 minutes of arrivals
const OVERLAY_UPDATE_MS = 100;
const TIMELINE_EVENTS_MAX = 64;
const APP_VERSION = typeof CREDITS?.version === 'string' ? CREDITS.version : null;

const FRAME_FIELDS = Object.freeze([
  'wallMs',          // ms since recorder start (monotonic)
  'wallEpochMs',     // Date.now()-correlated wall clock for log correlation
  'frameDtMs',       // rAF delta, clamped by the loop (0.25 s)
  'rawFrameDtMs',    // rAF delta BEFORE the loop's 0.25 s clamp — FPS/hitch truth
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
  'playoutDelayMs',  // presented clock behind the wall-paced sim moment (fence)
  'extrapolateMs',   // presented clock past the wall-paced sim moment (fence)
  'bufferDepthPacks',// bracket depth: commits between the presented bracket and the newest
  'playbackRate',    // measured sim-seconds per TIME-SCALED presented second (not wall)
  'timeScale',       // game time scale at present
  'poseEpoch',       // fence pose epoch of the presented sample
  'presentedTimeS',  // fence presented sim clock (s); 0 before the first presented sample
  'playerX',         // presented-or-mirrored player pose
  'playerZ',
  'playerSpeed',     // authoritative body speed (wu/s)
  'presentedSpeed',  // measured presented-pose speed (wu/s)
  'poseJumpWu',      // per-frame presented pose delta (0 when the pose repeats)
  'jumpBarWu',       // 2 * bodySpeed * playbackRate * timeScale * clampedDt — presented-rate bar
  'jumpRatio',       // poseJumpWu / jumpBarWu
  'heldPoseFrames',  // consecutive repeat-pose frames while moving and unpaused (1 during a streak)
  'heldMs',          // wall duration of the current held streak (a 2.6 s callback is 2600 ms)
  'drawCalls',
  'trianglesK',
  'heapMB',
  'allocBytesPerSec',
  'popIn',           // visible-unready drawables (residency), 0 when the probe is absent
  'poseSourceCode',  // 1 mirrored / 2 presented (legend in the export)
  'laneCode',        // 1 main / 2 worker
  'transportCode',   // 1 main / 2 worker-local / 3 worker-pump
  'sectorCode',      // FNV-1a of the sector id; `sectorLegend` maps it back
]);

const REPLY_FIELDS = Object.freeze([
  'wallMs', 'workMs', 'stepsMs', 'packMs', 'applyMs', 'steps', 'journalRecords', 'events',
  'stallMs',
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

// Per-frame provenance columns are numeric so they ride the preallocated rings. The export
// carries these legends; a string column per frame would allocate on every presented frame.
const POSE_SOURCE_CODES = Object.freeze({ mirrored: 1, presented: 2 });
const LANE_CODES = Object.freeze({ main: 1, worker: 2 });
const TRANSPORT_CODES = Object.freeze({ main: 1, 'worker-local': 2, 'worker-pump': 3 });

function codeFor(table, value) {
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : 0;
}

function hashSectorCode(value) {
  if (typeof value !== 'string' || value === '') return 0;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return hash >>> 0 || 1;
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
  const ratio = ringStats(recorder.frames, 'jumpRatio', 600);
  const interval = ringStats(recorder.replyIntervals, 'ms', 120);
  const fps = f.rawFrameDtMs > 0 ? 1000 / f.rawFrameDtMs : 0;
  const replyHz = interval.mean > 0 ? 1000 / interval.mean : 0;
  return [
    'FRAME TRUTH  (Ctrl+Alt+F hide · Ctrl+Alt+J export)',
    `fps ${fmt(fps, 0)}  raw ${fmt(f.rawFrameDtMs)}ms  cb p50/p95 ${fmt(cb.p50)}/${fmt(cb.p95)}ms  present p50/p95 ${fmt(present.p50)}/${fmt(present.p95)}ms`,
    `worker replies ${fmt(replyHz, 1)}/Hz  age ${fmt(f.replyAgeMs, 0)}ms  work p50/p95/max ${fmt(work.p50)}/${fmt(work.p95)}/${fmt(work.max)}ms`,
    `apply ${fmt(f.applyMs)}ms  steps ${fmt(f.steps, 0)}  sim ${fmt(f.simTimeS, 2)}s tick ${fmt(f.tick, 0)}`,
    `playout delay ${fmt(f.playoutDelayMs)}ms  extrapolating ${fmt(f.extrapolateMs)}ms  depth ${fmt(f.bufferDepthPacks, 0)} packs  rate ${fmt(f.playbackRate, 2)}x`,
    `player ${fmt(f.playerX, 1)},${fmt(f.playerZ, 1)} @ ${fmt(f.playerSpeed, 1)}wu/s  drawn ${fmt(f.presentedSpeed, 1)}wu/s  jumps ${fmt(jump.n, 0)}/600f max ${fmt(jump.max, 2)}wu  ratio ${fmt(ratio.max, 2)}  held ${fmt(recorder.heldStreak, 0)}f`,
    `draws ${fmt(f.drawCalls, 0)}  tris ${fmt(f.trianglesK, 0)}k  heap ${fmt(f.heapMB, 0)}MB  alloc ${fmt(f.allocBytesPerSec / 1024, 0)}KB/s  popIn ${fmt(f.popIn, 0)}`,
    recorder.note,
  ].filter(Boolean).join('\n');
}

function installHotkeys(recorder) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || recorder.hotkeysInstalled) return;
  recorder.hotkeysInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.altKey) return;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === 'f') {
      event.preventDefault();
      recorder.setOverlayVisible(!recorder.overlayVisible);
    } else if (key === 'j') {
      event.preventDefault();
      // The hotkey export carries the live fence AND the perf report regardless of how the
      // recorder was minted. `trace.fence` is honestly null before the first fence exists;
      // per-system attribution rides the same evidence export.
      const extra = {};
      try {
        const report = recorder.state?.perfRuntime?.getReport?.();
        if (report && typeof report === 'object') extra.perf = report;
      } catch (_) { /* perf attribution is optional */ }
      void recorder.exportJSON({ fence: recorder.fenceProvider?.() ?? null, extra });
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

function readLocation() {
  try {
    if (typeof globalThis.location === 'undefined') return null;
    return {
      href: typeof globalThis.location.href === 'string' ? globalThis.location.href : null,
      search: typeof globalThis.location.search === 'string' ? globalThis.location.search : null,
    };
  } catch (_) {
    return null;
  }
}

// Export-only: the settings facts a performance trace needs to be reproducible. Never
// serialize the whole settings tree (it carries unrelated preferences).
function readSettingsSummary(state) {
  if (!state || typeof state !== 'object') return null;
  const video = state.settings && state.settings.video ? state.settings.video : null;
  const accessibility = state.settings && state.settings.accessibility
    ? state.settings.accessibility : null;
  return {
    graphicsPreset: typeof state.settings?.graphicsPreset === 'string'
      ? state.settings.graphicsPreset : null,
    quality: video && typeof video.quality === 'string' ? video.quality : null,
    motionReduce: video ? video.motionReduce === true : null,
    flashReduce: accessibility ? accessibility.flashReduce === true : null,
    reducedMotion: accessibility ? accessibility.reducedMotion === true : null,
  };
}

/**
 * Parse the presentation-side completed-pack gap harness:
 *   ?simGap=<ms>[@<atMs>[@<periodMs>]]
 * The gate withholds COMPLETED PACKS from the fence for <ms> of wall time, starting at
 * <atMs> (default 2000 ms after the runner starts) and optionally repeating every
 * <periodMs>. It is independent of the worker's step budget: the worker keeps simulating and
 * completing ticks; presentation simply does not consume them until the hold ends. That is
 * the honest reproduction of a 400 ms gap in the pack stream — the thing the playout buffer
 * exists to hide. Test/diagnostic only; absent = no gate.
 */
export function resolveSimGapSchedule(search) {
  let params = null;
  try {
    params = new URLSearchParams(search || '');
  } catch (_) {
    return null;
  }
  const raw = params.get('simGap');
  if (raw == null || raw === '') return null;
  const [msRaw, atRaw, periodRaw] = raw.split('@');
  const ms = Number(msRaw);
  if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) {
    return { ms: 0, atMs: 0, periodMs: 0, raw, warning: `simGap='${raw}' ignored (ms must be 1..5000)` };
  }
  const at = atRaw == null ? 2000 : Number(atRaw);
  const period = periodRaw == null ? 0 : Number(periodRaw);
  return {
    ms,
    atMs: Number.isFinite(at) && at >= 0 ? at : 2000,
    periodMs: Number.isFinite(period) && period > 0 ? period : 0,
    raw,
    warning: null,
  };
}

/** The wall-clock gate for one parsed simGap schedule. */
export function createSimGapGate(schedule, startMs = nowMs()) {
  const ms = schedule && Number.isFinite(schedule.ms) ? schedule.ms : 0;
  const period = schedule && Number.isFinite(schedule.periodMs) ? schedule.periodMs : 0;
  let nextAtMs = startMs + (schedule && Number.isFinite(schedule.atMs) ? schedule.atMs : 0);
  let holdUntilMs = -Infinity;
  let heldFrames = 0;
  let applications = 0;
  let holding = false;
  return {
    get ms() { return ms; },
    get heldFrames() { return heldFrames; },
    get applications() { return applications; },
    get holding() { return holding; },
    /** True while completed packs must be withheld. Call once per presented frame. */
    shouldHold(now) {
      const at = Number.isFinite(now) ? now : 0;
      if (ms > 0 && at >= nextAtMs) {
        holdUntilMs = at + ms;
        applications++;
        nextAtMs = period > 0 ? nextAtMs + period : Infinity;
      }
      holding = ms > 0 && at < holdUntilMs;
      if (holding) heldFrames++;
      return holding;
    },
  };
}

export function ensureFrameTruth(state) {
  if (state && state.frameTruth && state.frameTruth.__frameTruthV1) return state.frameTruth;
  if (!state || typeof state !== 'object') throw new TypeError('ensureFrameTruth requires state');

  const recorder = {
    __frameTruthV1: true,
    startedAtMs: nowMs(),
    // Wall-clock epoch, so an exported trace correlates with the log lines that cite it.
    // The old trace only carried a performance.now() stamp (which reads as 1970 when
    // interpreted as an epoch).
    startedAtEpochMs: Date.now(),
    frames: makeRing(RING_FRAMES, FRAME_FIELDS),
    replies: makeRing(RING_REPLIES, REPLY_FIELDS),
    replyIntervals: makeRing(RING_REPLIES, ['ms']),
    lastFrame: {},
    // One reusable value object: one small allocation at mint, none per presented frame.
    frameValues: {},
    lastReplyWallMs: -1,
    heldStreak: 0,
    heldWallMs: 0,
    maxHeldMs: 0,
    lastSimGapApplications: 0,
    lastSimGapHeldFrames: 0,
    lastPresentedTimeS: NaN,
    lastSectorName: null,
    lastSectorCode: 0,
    sectorLegend: {},
    overlayVisible: false,
    overlayEl: null,
    overlayTimer: null,
    hotkeysInstalled: false,
    note: '',
    // Export-time extras (E5 probe): providers push () => ({...}) objects folded into
    // every trace — the sim-lane/SAB state rides the same evidence as the frame data.
    extraProviders: [],
    // The live fence is registered by presentationRunner; the hotkey export reads it.
    fenceProvider: null,
    lastPlayerX: NaN,
    lastPlayerZ: NaN,
    lastHeapMB: 0,
    lastHeapAtMs: 0,
    lastAllocBytesPerSec: 0,
    lastPoseEpoch: null,
    lastPoseSource: null,
    lastLane: null,
    lastTransport: null,
    timeline: [],
    state,
  };

  recorder.noteEvent = (kind, detail) => {
    if (!kind) return;
    const event = {
      wallMs: Math.max(0, nowMs() - recorder.startedAtMs),
      wallEpochMs: recorder.startedAtEpochMs + Math.max(0, nowMs() - recorder.startedAtMs),
      kind,
    };
    if (detail && typeof detail === 'object') Object.assign(event, detail);
    if (recorder.timeline.length >= TIMELINE_EVENTS_MAX) recorder.timeline.shift();
    recorder.timeline.push(event);
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
      stallMs: sample.stallMs,
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
    const poseFinite = Number.isFinite(px) && Number.isFinite(pz);
    const hasPreviousPose = Number.isFinite(recorder.lastPlayerX)
      && Number.isFinite(recorder.lastPlayerZ);
    let jump = 0;
    if (poseFinite && hasPreviousPose) {
      jump = Math.hypot(px - recorder.lastPlayerX, pz - recorder.lastPlayerZ);
    }
    const rawDtMs = Number.isFinite(sample.rawFrameDtMs)
      ? sample.rawFrameDtMs : sample.frameDtMs;
    const frameDtMs = Number.isFinite(sample.frameDtMs) ? sample.frameDtMs : rawDtMs;
    // The presented clock advances on the CLAMPED frame delta; using the raw 2.6 s callback
    // gave a catch-up jump a 2.6 s-wide bar and hid it. FPS/raw columns keep the unclamped
    // value for hitch truth.
    const dtS = Number.isFinite(frameDtMs) && frameDtMs > 0 ? frameDtMs / 1000 : 0;
    const playbackRate = Number.isFinite(sample.playbackRate) ? sample.playbackRate : 1;
    const timeScale = Number.isFinite(sample.timeScale) ? sample.timeScale : 1;
    const paused = !(timeScale > 0) || sample.docked === true;
    // The E1 verify metric's raw material: a pose that repeats while the body's own
    // velocity is non-zero is the hold-then-jump signature, counted per frame. The first
    // frame has no previous pose and can never be a held frame; a non-finite pose, a body
    // at/below the speed threshold, or a paused/docked present ends the streak. A docked
    // hull can keep its last velocity while the world is frozen — that is not a freeze.
    let heldFrame = 0;
    if (!poseFinite || !hasPreviousPose || !(speed > HELD_SPEED) || paused) {
      recorder.heldStreak = 0;
      recorder.heldWallMs = 0;
    } else if (jump <= HELD_EPSILON_WU) {
      recorder.heldStreak++;
      heldFrame = 1;
      // Wall-time truth: one 2.6 s callback is one held FRAME but 2600 ms of frozen picture.
      recorder.heldWallMs += Number.isFinite(rawDtMs) && rawDtMs > 0 ? rawDtMs : 0;
      if (recorder.heldWallMs > recorder.maxHeldMs) recorder.maxHeldMs = recorder.heldWallMs;
    } else {
      recorder.heldStreak = 0;
      recorder.heldWallMs = 0;
    }
    recorder.lastPlayerX = poseFinite ? px : NaN;
    recorder.lastPlayerZ = poseFinite ? pz : NaN;

    const presentedSpeed = dtS > 0 ? jump / dtS
      : (Number.isFinite(sample.presentedSpeed) ? sample.presentedSpeed : 0);
    // The E1 jump bar is measured against the PRESENTED rate, not the authoritative body
    // speed: at 0.05x sim / 12 fps the old 2*speed*dt bar was ~10x too lenient.
    const jumpBarWu = 2 * speed * playbackRate * timeScale * dtS;
    const jumpRatio = jumpBarWu > 0 ? jump / jumpBarWu : 0;

    // 1 Hz heap sample carried across frames (the probe is not read every frame).
    let heapMB = Number.isFinite(sample.heapMB) ? sample.heapMB : recorder.lastHeapMB;
    if (Number.isFinite(sample.heapMB)) {
      const at = Number.isFinite(sample.wallMs) ? sample.wallMs : now;
      if (recorder.lastHeapAtMs > 0 && at > recorder.lastHeapAtMs && sample.heapMB > 0) {
        const deltaBytes = (sample.heapMB - recorder.lastHeapMB) * 1048576;
        const seconds = (at - recorder.lastHeapAtMs) / 1000;
        recorder.lastAllocBytesPerSec = deltaBytes > 0 && seconds > 0
          ? deltaBytes / seconds : 0;
      }
      recorder.lastHeapMB = sample.heapMB;
      recorder.lastHeapAtMs = at;
      heapMB = sample.heapMB;
    }
    const allocBytesPerSec = Number.isFinite(sample.allocBytesPerSec)
      ? sample.allocBytesPerSec : recorder.lastAllocBytesPerSec;

    const poseEpoch = Number.isFinite(sample.poseEpoch) ? sample.poseEpoch : null;
    if (poseEpoch !== recorder.lastPoseEpoch) {
      recorder.noteEvent('poseEpoch', { from: recorder.lastPoseEpoch, to: poseEpoch });
      recorder.lastPoseEpoch = poseEpoch;
    }
    if (typeof sample.poseSource === 'string') recorder.lastPoseSource = sample.poseSource;
    const lane = typeof sample.lane === 'string' ? sample.lane : recorder.lastLane;
    if (lane !== recorder.lastLane) {
      recorder.noteEvent('lane', { from: recorder.lastLane, to: lane });
      recorder.lastLane = lane;
    }
    const transport = typeof sample.transport === 'string'
      ? sample.transport : recorder.lastTransport;
    if (transport !== recorder.lastTransport) {
      recorder.noteEvent('transport', { from: recorder.lastTransport, to: transport });
      recorder.lastTransport = transport;
    }
    // E1 gap-harness counters: prove in the exported file that the gate withheld packs.
    if (Number.isFinite(sample.simGapApplications)) {
      recorder.lastSimGapApplications = sample.simGapApplications;
    }
    if (Number.isFinite(sample.simGapHeldFrames)) {
      recorder.lastSimGapHeldFrames = sample.simGapHeldFrames;
    }
    // Per-frame sector identity: a numeric code rides the ring; the legend maps it back.
    const sectorName = typeof sample.sector === 'string' && sample.sector
      ? sample.sector : recorder.lastSectorName;
    if (sectorName !== recorder.lastSectorName) {
      recorder.lastSectorName = sectorName;
      recorder.lastSectorCode = hashSectorCode(sectorName);
      if (sectorName) recorder.sectorLegend[recorder.lastSectorCode] = sectorName;
    }
    if (Number.isFinite(sample.presentedTimeS)) {
      recorder.lastPresentedTimeS = sample.presentedTimeS;
    }

    const values = recorder.frameValues;
    values.wallMs = now - recorder.startedAtMs;
    values.wallEpochMs = recorder.startedAtEpochMs + Math.max(0, now - recorder.startedAtMs);
    values.frameDtMs = frameDtMs;
    values.rawFrameDtMs = Number.isFinite(rawDtMs) ? rawDtMs : frameDtMs;
    values.callbackMs = sample.callbackMs;
    values.presentMs = sample.presentMs;
    values.steps = sample.steps;
    values.simTimeS = sample.simTimeS;
    values.tick = sample.tick;
    values.replyAgeMs = sample.replyAgeMs;
    values.workerWorkMs = sample.workerWorkMs;
    values.workerStepsMs = sample.workerStepsMs;
    values.workerPackMs = sample.workerPackMs;
    values.applyMs = sample.applyMs;
    values.playoutDelayMs = sample.playoutDelayMs;
    values.extrapolateMs = sample.extrapolateMs;
    values.bufferDepthPacks = sample.bufferDepthPacks;
    values.playbackRate = playbackRate;
    values.timeScale = timeScale;
    values.poseEpoch = poseEpoch == null ? 0 : poseEpoch;
    // The presented clock is sampled every frame by presentationRunner; carry the last real
    // sample across a frame whose fence probe was absent, then export it as a column.
    values.presentedTimeS = recorder.lastPresentedTimeS;
    values.playerX = poseFinite ? px : 0;
    values.playerZ = poseFinite ? pz : 0;
    values.playerSpeed = speed;
    values.presentedSpeed = presentedSpeed;
    values.poseJumpWu = jump;
    values.jumpBarWu = jumpBarWu;
    values.jumpRatio = jumpRatio;
    values.heldPoseFrames = heldFrame;
    values.heldMs = recorder.heldWallMs;
    values.drawCalls = sample.drawCalls;
    values.trianglesK = sample.trianglesK;
    values.heapMB = heapMB;
    values.allocBytesPerSec = allocBytesPerSec;
    values.popIn = sample.popIn;
    values.poseSourceCode = codeFor(POSE_SOURCE_CODES, recorder.lastPoseSource);
    values.laneCode = codeFor(LANE_CODES, lane);
    values.transportCode = codeFor(TRANSPORT_CODES, transport);
    values.sectorCode = recorder.lastSectorCode;
    ringPush(recorder.frames, values);
    recorder.lastFrame = values;
  };

  recorder.snapshotSummary = () => {
    const raw = ringStats(recorder.frames, 'rawFrameDtMs');
    const frameWall = ringToArray(recorder.frames, 'wallMs');
    const wallSpanMs = frameWall.length > 1 ? frameWall[frameWall.length - 1] - frameWall[0] : 0;
    let heapStart = 0;
    for (const value of ringToArray(recorder.frames, 'heapMB')) {
      if (value > 0) { heapStart = value; break; }
    }
    return {
      // `fps` is the last frame's instantaneous value; `meanFps` is the ring mean from RAW
      // frame deltas (the loop's 0.25 s clamp would otherwise hide multi-second hitches).
      fps: recorder.lastFrame.rawFrameDtMs > 0 ? 1000 / recorder.lastFrame.rawFrameDtMs : 0,
      meanFps: raw.mean > 0 ? 1000 / raw.mean : 0,
      frameWallSpanMs: wallSpanMs,
      rawFrame: raw,
      workerWork: ringStats(recorder.replies, 'workMs'),
      workerSteps: ringStats(recorder.replies, 'stepsMs'),
      workerApply: ringStats(recorder.replies, 'applyMs'),
      replyStall: ringStats(recorder.replies, 'stallMs'),
      replyInterval: ringStats(recorder.replyIntervals, 'ms'),
      frameCallback: ringStats(recorder.frames, 'callbackMs'),
      present: ringStats(recorder.frames, 'presentMs'),
      poseJump: ringStats(recorder.frames, 'poseJumpWu'),
      jumpRatio: ringStats(recorder.frames, 'jumpRatio'),
      heapMB: {
        start: heapStart,
        end: recorder.lastFrame.heapMB || 0,
      },
      allocBytesPerSec: recorder.lastAllocBytesPerSec,
      heldPoseStreak: recorder.heldStreak,
      maxHeldMs: recorder.maxHeldMs,
    };
  };

  recorder.exportJSON = (options = {}) => {
    const fence = typeof options.fence !== 'undefined'
      ? options.fence
      : (recorder.fenceProvider ? recorder.fenceProvider() : null);
    const columns = {};
    for (const field of FRAME_FIELDS) columns[field] = ringToArray(recorder.frames, field);
    const trace = {
      schema: 'spaceface.frameTruth.v1',
      // Wall-clock epoch fields, so an export correlates with logs and with the video take.
      startedAtEpochMs: recorder.startedAtEpochMs,
      exportedAtEpochMs: Date.now(),
      startedAtWallMs: recorder.startedAtMs,
      exportedAtWallMs: nowMs(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      location: readLocation(),
      note: recorder.note,
      // The generated credits version is a real app identity; a git/build hash only exists
      // when the host produces one (options.build or a boot producer). `build` used to be a
      // permanent null because `__SF_BUILD__` had no producer — do not claim a build stamp.
      appVersion: APP_VERSION,
      buildStamp: typeof options.build === 'string' ? options.build
        : (typeof globalThis !== 'undefined' && typeof globalThis.__SF_BUILD__ === 'string'
          ? globalThis.__SF_BUILD__ : null),
      seed: recorder.state && recorder.state.meta && Number.isFinite(recorder.state.meta.seed)
        ? recorder.state.meta.seed | 0 : null,
      saveSlot: recorder.state && recorder.state.save
        && typeof recorder.state.save.currentSlot === 'string'
        ? recorder.state.save.currentSlot : null,
      settings: readSettingsSummary(recorder.state),
      crossOriginIsolated: typeof globalThis !== 'undefined'
        ? globalThis.crossOriginIsolated === true : false,
      sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
      frameCount: recorder.frames.count,
      columns,
      provenanceLegend: {
        poseSource: POSE_SOURCE_CODES,
        lane: LANE_CODES,
        transport: TRANSPORT_CODES,
        sector: recorder.sectorLegend,
      },
      simGap: {
        applications: recorder.lastSimGapApplications,
        heldFrames: recorder.lastSimGapHeldFrames,
      },
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
        stallMs: ringToArray(recorder.replies, 'stallMs'),
        intervalMs: ringToArray(recorder.replyIntervals, 'ms'),
      },
      events: recorder.timeline.slice(),
      summary: recorder.snapshotSummary(),
      fence: fence && typeof fence.getPlayoutDiagnostics === 'function'
        ? fence.getPlayoutDiagnostics() : null,
    };
    const last = recorder.lastFrame;
    trace.playbackRate = Number.isFinite(last.playbackRate) ? last.playbackRate : null;
    trace.timeScale = Number.isFinite(last.timeScale) ? last.timeScale : null;
    trace.poseEpoch = Number.isFinite(last.poseEpoch) ? last.poseEpoch : null;
    trace.poseSource = typeof options.poseSource === 'string' ? options.poseSource
      : recorder.lastPoseSource;
    trace.mode = recorder.state && typeof recorder.state.mode === 'string'
      ? recorder.state.mode : null;
    trace.sector = recorder.state && recorder.state.world
      && recorder.state.world.currentSectorId != null
      ? String(recorder.state.world.currentSectorId) : null;
    if (typeof options.extra === 'object' && options.extra) Object.assign(trace, options.extra);
    for (const provider of recorder.extraProviders) {
      try {
        const extra = provider();
        if (extra && typeof extra === 'object') Object.assign(trace, extra);
      } catch (_) { /* a broken probe never blocks the export */ }
    }
    const simLane = trace.simLane && typeof trace.simLane === 'object' ? trace.simLane : null;
    trace.lane = typeof options.lane === 'string' ? options.lane
      : (simLane && typeof simLane.lane === 'string' ? simLane.lane : recorder.lastLane);
    trace.transport = typeof options.transport === 'string' ? options.transport
      : (simLane && (typeof simLane.clockOwner === 'string' || typeof simLane.workerClockMode === 'string')
        ? (simLane.clockOwner || simLane.workerClockMode) : recorder.lastTransport);
    const text = JSON.stringify(trace);
    if (options.download !== false) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      download(`frame-truth-${stamp}.json`, text);
    }
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
