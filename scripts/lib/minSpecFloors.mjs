// PQ-033.02 — min-spec floor evaluation.
//
// Recomputes the release-matrix floors from raw soak evidence produced by
// runReleaseSoakProbe (scripts/lib/releaseSoakProbe.mjs). A claimed pass is
// never trusted: every verdict below is derived from the raw cycle marks,
// soak-window hitch events, frame histogram, post-GC heap snapshots, boot
// marks, and bound GPU identity.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const MIN_SPEC_SCHEMA = 'spaceface.minSpec.v1';
export const MIN_SPEC_RELATIVE_PATH = path.join('build', 'min-spec.json');

const MINUTE_MS = 60_000;
const THIRTY_MIN_MS = 30 * MINUTE_MS;
const DEFAULT_MAX_TRANSITION_HITCH_MS = 2_000;

export function loadMinSpec(root) {
  const filePath = path.join(root, MIN_SPEC_RELATIVE_PATH);
  const spec = JSON.parse(readFileSync(filePath, 'utf8'));
  assertMinSpec(spec, filePath);
  return spec;
}

function assertMinSpec(spec, filePath) {
  const fail = (message) => { throw new Error(`${filePath}: ${message}`); };
  if (!spec || typeof spec !== 'object') fail('min-spec must be an object');
  if (spec.schema !== MIN_SPEC_SCHEMA) fail(`schema must be ${MIN_SPEC_SCHEMA}`);
  if (typeof spec.hardware?.gpu?.name !== 'string' || !spec.hardware.gpu.name.trim()) {
    fail('a concrete min-spec GPU name is required');
  }
  if (!['integrated', 'discrete'].includes(spec.hardware.gpu.tier)) fail('gpu.tier must be integrated or discrete');
  if (!Array.isArray(spec.hardware.gpu.matchAny) || spec.hardware.gpu.matchAny.length === 0) {
    fail('gpu.matchAny must list renderer match patterns so evidence can be bound to the named GPU');
  }
  const floors = spec.floors || {};
  for (const key of ['medianFrameMs', 'hitchThresholdMs', 'maxHitchesPerMinute', 'bootToMenuMs', 'maxHeapGrowthBytesPer30Min']) {
    if (!Number.isFinite(floors[key]) || floors[key] <= 0) fail(`floors.${key} must be a positive number`);
  }
  if (!Number.isInteger(spec.soak?.durationMinutes) || spec.soak.durationMinutes <= 0) fail('soak.durationMinutes must be a positive integer');
  if (!Number.isInteger(spec.soak?.minSaveLoadCycles) || spec.soak.minSaveLoadCycles <= 0) fail('soak.minSaveLoadCycles must be a positive integer');
  if (!Array.isArray(spec.soak?.hosts) || spec.soak.hosts.length === 0) fail('soak.hosts is required');
}

/**
 * Recompute every floor from raw evidence fields. Returns
 * { pass, failures, floors } where floors carries the measured numbers.
 */
export function evaluateMinSpecFloors(evidence, spec) {
  const failures = [];
  const floors = {};
  const limits = spec.floors;
  const maxTransitionHitchMs = Number.isFinite(limits.maxTransitionHitchMs)
    ? limits.maxTransitionHitchMs
    : DEFAULT_MAX_TRANSITION_HITCH_MS;

  // ── GPU binding ──
  const gpu = evidence?.hardware?.gpu || null;
  const identityText = [gpu?.vendor, gpu?.renderer, gpu?.unmaskedRenderer].filter(Boolean).join(' ');
  const matchAny = Array.isArray(spec.hardware?.gpu?.matchAny) ? spec.hardware.gpu.matchAny : [];
  const gpuMatched = !!identityText && matchAny.some((pattern) => {
    try { return new RegExp(pattern, 'i').test(identityText); } catch { return false; }
  });
  floors.gpu = {
    vendor: gpu?.vendor ?? null,
    renderer: gpu?.renderer ?? null,
    unmaskedRenderer: gpu?.unmaskedRenderer ?? null,
    tier: gpu?.tier ?? null,
    software: gpu?.software ?? null,
    matched: gpuMatched,
  };
  if (!gpu) {
    failures.push('evidence has no hardware.gpu identity block');
  } else {
    if (!gpuMatched) failures.push(`evidence GPU does not match the named min-spec (${spec.hardware.gpu.name}): ${identityText || 'empty identity'}`);
    if (gpu.tier !== spec.hardware.gpu.tier) failures.push(`evidence GPU tier ${gpu.tier || 'missing'} does not match min-spec tier ${spec.hardware.gpu.tier}`);
    if (gpu.software !== false) failures.push('evidence GPU is software-classified or lacks a software=false classification');
  }

  // ── soak duration ──
  // Explicit typeof checks throughout: Number(null) === 0 would read absent
  // evidence as a perfect measurement, so every field must arrive as a real
  // number before it is compared to a floor.
  const soakWindow = evidence?.soakWindow || null;
  const durationMs = typeof soakWindow?.durationMs === 'number' && Number.isFinite(soakWindow.durationMs)
    ? soakWindow.durationMs
    : null;
  floors.soakDurationMinutes = durationMs != null ? durationMs / MINUTE_MS : null;
  if (!soakWindow || durationMs == null || durationMs <= 0) {
    failures.push('soakWindow.durationMs is missing or non-finite');
  } else if (durationMs < spec.soak.durationMinutes * MINUTE_MS) {
    failures.push(`soak ran ${(durationMs / MINUTE_MS).toFixed(2)} minutes; ${spec.soak.durationMinutes} required`);
  }

  // ── save/load cycles ──
  const results = Array.isArray(evidence?.cycles?.results) ? evidence.cycles.results : [];
  const saveLoadCycles = results.filter((cycle) => cycle?.pass === true
    && Array.isArray(cycle?.marks)
    && cycle.marks.includes('save-written')
    && cycle.marks.includes('load-restored')).length;
  floors.saveLoadCycles = saveLoadCycles;
  floors.cycles = results.length;
  if (!Number.isInteger(evidence?.cycles?.count) || evidence.cycles.count !== results.length) {
    failures.push('cycles.count does not equal cycles.results length');
  }
  if (results.some((cycle) => cycle?.pass !== true)) failures.push('one or more soak cycles did not pass');
  if (saveLoadCycles < spec.soak.minSaveLoadCycles) {
    failures.push(`${saveLoadCycles} verified public save/load cycles < required ${spec.soak.minSaveLoadCycles}`);
  }

  // ── median frame time ──
  const buckets = soakWindow?.frameBuckets;
  const bucketScaleMs = Number.isFinite(soakWindow?.frameBucketScaleMs) && soakWindow.frameBucketScaleMs > 0
    ? soakWindow.frameBucketScaleMs : 1;
  const histogramMedian = buckets && typeof buckets === 'object' ? medianFromBuckets(buckets, bucketScaleMs) : null;
  const p50Field = evidence?.performance?.frameMs?.p50;
  const windowP50 = typeof p50Field === 'number' && Number.isFinite(p50Field) && p50Field > 0 ? p50Field : null;
  const medianFrameMs = Number.isFinite(histogramMedian) ? histogramMedian : windowP50;
  floors.medianFrameMs = medianFrameMs;
  floors.medianFrameMsSource = Number.isFinite(histogramMedian) ? 'soak-window-histogram' : (medianFrameMs != null ? 'steady-window-p50' : 'missing');
  floors.medianFps = medianFrameMs != null && medianFrameMs > 0 ? 1000 / medianFrameMs : null;
  if (medianFrameMs == null) {
    failures.push('no median frame time available (soakWindow.frameBuckets and performance.frameMs.p50 both missing)');
  } else if (medianFrameMs > limits.medianFrameMs) {
    failures.push(`median frame ${medianFrameMs.toFixed(2)} ms (${floors.medianFps.toFixed(1)} fps) exceeds ${limits.medianFrameMs} ms floor`);
  }

  // ── hitches ──
  const recorderThreshold = typeof soakWindow?.hitchThresholdMs === 'number' && Number.isFinite(soakWindow.hitchThresholdMs)
    ? soakWindow.hitchThresholdMs
    : null;
  if (recorderThreshold == null || recorderThreshold <= 0 || recorderThreshold > limits.hitchThresholdMs) {
    failures.push(`soak hitch recorder threshold ${recorderThreshold ?? 'missing'} cannot observe ${limits.hitchThresholdMs} ms hitches`);
  }
  const events = Array.isArray(soakWindow?.hitchEvents) ? soakWindow.hitchEvents : [];
  const over = events.filter((event) => Number.isFinite(event?.deltaMs) && event.deltaMs > limits.hitchThresholdMs);
  const transitionEvents = over.filter((event) => typeof event?.transition === 'string' && event.transition.length > 0);
  // A hitch the game's own classifier attributes to externalScheduling was a gap the
  // page did not consume — machine noise on shared hardware, recorded and reported but
  // not a product stall. Unknown/ambiguous owners still count against the floor, and
  // the exemption only exists when the recorder actually armed the classifier —
  // external-claimed events without hitchAttributionEnabled are evidence the real
  // recorder cannot produce, so they count as gameplay.
  const attributionArmed = soakWindow?.hitchAttributionEnabled === true;
  const externalEvents = over.filter((event) => event?.owner === 'externalScheduling'
    && attributionArmed
    && !(typeof event?.transition === 'string' && event.transition.length > 0));
  const gameplayEvents = over.filter((event) => !(typeof event?.transition === 'string' && event.transition.length > 0)
    && !(event?.owner === 'externalScheduling' && attributionArmed));
  // The bounded in-page log can saturate on a badly-hitching run; the counters the
  // recorder maintains alongside it stay authoritative for the floor verdicts. A
  // claimed counter below the logged count is inconsistent evidence — clamp upward,
  // never down.
  const countedOver = Math.max(
    over.length,
    Number.isFinite(soakWindow?.hitchCount) ? soakWindow.hitchCount : 0,
  );
  const countedGameplay = Math.max(
    gameplayEvents.length,
    Number.isFinite(soakWindow?.hitchGameplayCount) ? soakWindow.hitchGameplayCount : 0,
  );
  const countedExternal = Math.max(
    externalEvents.length,
    attributionArmed && Number.isFinite(soakWindow?.hitchExternalCount) ? soakWindow.hitchExternalCount : 0,
  );
  // The recorder puts every over-threshold event into exactly one class, so the
  // class counters must sum to the whole. A forgery that drops the gameplay
  // counter without redistributing is caught here.
  const counterParts = [soakWindow?.hitchGameplayCount, soakWindow?.hitchTransitionCount, soakWindow?.hitchExternalCount];
  if (Number.isFinite(soakWindow?.hitchCount) && counterParts.every(Number.isFinite)) {
    const partsTotal = counterParts.reduce((sum, value) => sum + value, 0);
    if (partsTotal !== soakWindow.hitchCount) {
      failures.push(`hitch counters inconsistent: gameplay ${soakWindow.hitchGameplayCount} + transition ${soakWindow.hitchTransitionCount} + external ${soakWindow.hitchExternalCount} ≠ total ${soakWindow.hitchCount}`);
    }
  }
  // Measurement-apparatus pauses (forced GC, screenshot readback) are excluded
  // from the rate denominator — the game was not deliverable during them.
  const pausedMs = Number.isFinite(soakWindow?.pausedMs) && soakWindow.pausedMs >= 0
    && Number.isFinite(durationMs)
    ? Math.min(soakWindow.pausedMs, durationMs)
    : 0;
  const activeDurationMs = Number.isFinite(durationMs) ? durationMs - pausedMs : null;
  const minutes = Number.isFinite(activeDurationMs) && activeDurationMs > 0 ? activeDurationMs / MINUTE_MS : null;
  floors.pausedMs = pausedMs;
  floors.hitchCount = countedOver;
  floors.gameplayHitchCount = countedGameplay;
  floors.externalSchedulingHitchCount = countedExternal;
  floors.hitchAttribution = soakWindow?.hitchAttributionEnabled === true ? 'game-classifier' : 'unattributed';
  floors.hitchEventsTruncated = soakWindow?.hitchEventsTruncated === true;
  floors.hitchesPerMinute = minutes != null ? countedOver / minutes : null;
  floors.gameplayHitchesPerMinute = minutes != null ? countedGameplay / minutes : null;
  floors.externalSchedulingHitchesPerMinute = minutes != null ? countedExternal / minutes : null;
  let maxTransition = 0;
  for (const event of transitionEvents) if (event.deltaMs > maxTransition) maxTransition = event.deltaMs;
  if (Number.isFinite(soakWindow?.hitchMaxTransitionDeltaMs) && soakWindow.hitchMaxTransitionDeltaMs > maxTransition) {
    maxTransition = soakWindow.hitchMaxTransitionDeltaMs;
  }
  floors.maxTransitionHitchMs = maxTransition;
  if (floors.gameplayHitchesPerMinute != null && floors.gameplayHitchesPerMinute > limits.maxHitchesPerMinute) {
    failures.push(`gameplay hitches ${floors.gameplayHitchesPerMinute.toFixed(2)}/min exceed ${limits.maxHitchesPerMinute}/min floor (${countedGameplay} events over ${limits.hitchThresholdMs} ms)`);
  }
  const blownTransitions = transitionEvents.filter((event) => event.deltaMs > maxTransitionHitchMs);
  const counterBlown = Number.isFinite(soakWindow?.hitchMaxTransitionDeltaMs)
    && soakWindow.hitchMaxTransitionDeltaMs > maxTransitionHitchMs;
  if (blownTransitions.length || counterBlown) {
    failures.push(`${blownTransitions.length || 'unlogged'} transition hitches exceeded ${maxTransitionHitchMs} ms (worst ${floors.maxTransitionHitchMs} ms)`);
  }

  // An rAF-starved window (occluded/minimized headed runtime) under-reports hitches;
  // require a plausible delivered frame rate so thin evidence cannot pass.
  const frameCount = typeof soakWindow?.frameCount === 'number' && Number.isFinite(soakWindow.frameCount)
    ? soakWindow.frameCount
    : null;
  floors.averageFps = minutes != null && frameCount != null ? frameCount / (minutes * 60) : null;
  // The sanity floor only proves the recorder was alive and sampling — a
  // transition-dense soak legitimately averages well under 60 fps because
  // bounded transition stalls are part of the measurement. A starved recorder
  // (occluded/minimized runtime) delivers near-zero frames, not ~30 fps.
  if (minutes != null && (frameCount == null || frameCount / (minutes * 60) < 10)) {
    failures.push(`soak window delivered ${floors.averageFps == null ? 'no' : floors.averageFps.toFixed(1)} fps average — recorder starved or evidence thin`);
  }

  // ── boot ──
  // Recompute the delta from the ISO timestamps so a claimed field that
  // disagrees with its own marks (or a null that coerces to 0) cannot pass.
  // The floored number is gameBootToMenuMs: browser anchors at page navigation
  // (a web player's boot), electron at host-process launch. bootToMenuMs keeps
  // the full harness-inclusive figure for attribution only.
  const boot = evidence?.boot || null;
  const launchedAtMs = Date.parse(boot?.launchedAt || '');
  const navigationAtMs = Date.parse(boot?.navigationStartedAt || '');
  const menuVisibleAtMs = Date.parse(boot?.menuVisibleAt || '');
  const isBrowser = evidence?.runtimeKind === 'browser';
  const bootAnchorMs = isBrowser && Number.isFinite(navigationAtMs) ? navigationAtMs : launchedAtMs;
  if (isBrowser && !Number.isFinite(navigationAtMs)) {
    failures.push('boot.navigationStartedAt is missing for the browser host — navigation-anchored boot cannot be recomputed');
  }
  const bootField = boot?.gameBootToMenuMs;
  const gameBootToMenuMs = typeof bootField === 'number' && Number.isFinite(bootField) && bootField > 0 ? bootField : null;
  const harnessBootMs = typeof boot?.bootToMenuMs === 'number' && Number.isFinite(boot.bootToMenuMs) ? boot.bootToMenuMs : null;
  // Electron: the shipped boot is the packaged executable's launch->menu, not the
  // dev-server route. When the packaged-startup subreceipt carries its own timing
  // it outranks the dev-route number; the dev-route figure stays as diagnostics.
  // The packaged timing's processStartToMenuMs anchors at the spawned main
  // process's own first receipt (the honest double-click anchor); bootToMenuMs
  // there additionally wraps Playwright's launch machinery and is diagnostics only.
  const packagedTiming = !isBrowser ? evidence?.packagedStartup?.timing : null;
  const packagedBootMs = packagedTiming
    ? (typeof packagedTiming.processStartToMenuMs === 'number'
        && Number.isFinite(packagedTiming.processStartToMenuMs)
        && packagedTiming.processStartToMenuMs > 0
        ? packagedTiming.processStartToMenuMs
        : (typeof packagedTiming.bootToMenuMs === 'number'
            && Number.isFinite(packagedTiming.bootToMenuMs)
            && packagedTiming.bootToMenuMs > 0
            ? packagedTiming.bootToMenuMs
            : null))
    : null;
  const flooredBootMs = packagedBootMs != null ? packagedBootMs : gameBootToMenuMs;
  floors.bootToMenuMs = flooredBootMs;
  floors.bootToMenuMsSource = packagedBootMs != null ? 'packaged-startup' : 'dev-route';
  floors.devRouteBootToMenuMs = packagedBootMs != null ? gameBootToMenuMs : null;
  floors.harnessBootToMenuMs = harnessBootMs;
  if (!Number.isFinite(launchedAtMs) || !Number.isFinite(menuVisibleAtMs)) {
    failures.push('boot.launchedAt/boot.menuVisibleAt are missing or unparseable');
  } else {
    const recomputed = menuVisibleAtMs - bootAnchorMs;
    if (recomputed <= 0) {
      failures.push(`boot clock skew: menu mark does not follow the boot anchor (${recomputed} ms)`);
    } else if (gameBootToMenuMs != null && Math.abs(recomputed - gameBootToMenuMs) > 1) {
      failures.push(`boot.gameBootToMenuMs ${gameBootToMenuMs} ms disagrees with timestamp delta ${recomputed} ms`);
    }
  }
  if (flooredBootMs == null) {
    failures.push('boot measure is missing, non-finite, or non-positive (dev-route gameBootToMenuMs and packaged-startup timing both absent)');
  } else if (flooredBootMs > limits.bootToMenuMs) {
    failures.push(`boot to menu ${flooredBootMs} ms exceeds ${limits.bootToMenuMs} ms floor`);
  }

  // ── heap growth per 30 minutes ──
  const heapPer30 = heapGrowthPerThirtyMinutes(evidence?.memory, durationMs);
  floors.heapGrowthBytesPer30Min = heapPer30;
  floors.heapGrowthMbPer30Min = heapPer30 != null ? heapPer30 / (1024 * 1024) : null;
  if (heapPer30 == null) {
    failures.push('heap growth cannot be evaluated (no timestamped snapshots and no endpoint fallback)');
  } else if (heapPer30 > limits.maxHeapGrowthBytesPer30Min) {
    failures.push(`heap growth ${(heapPer30 / (1024 * 1024)).toFixed(1)} MB/30min exceeds ${limits.maxHeapGrowthBytesPer30Min / (1024 * 1024)} MB floor`);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)], floors };
}

/** Median (nearest lower bucket midpoint) from a { "<bucket>": count } histogram. */
export function medianFromBuckets(buckets, scaleMs = 1) {
  const scale = Number.isFinite(scaleMs) && scaleMs > 0 ? scaleMs : 1;
  const entries = Object.entries(buckets || {})
    .map(([key, count]) => [Number(key) * scale, count])
    .filter(([key, count]) => Number.isFinite(key) && key >= 0 && Number.isInteger(count) && count > 0)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return null;
  let seen = 0;
  for (const [bucket, count] of entries) {
    seen += count;
    if (seen >= total / 2) return bucket + scale / 2;
  }
  return null;
}

/**
 * Heap growth normalized to 30 minutes. Prefers a least-squares slope over the
 * timestamped post-GC snapshots; falls back to start/end endpoints scaled by
 * the soak duration.
 */
export function heapGrowthPerThirtyMinutes(memory, soakDurationMs) {
  const snapshots = [memory?.startSnapshot, ...(Array.isArray(memory?.checkpoints) ? memory.checkpoints : []), memory?.endSnapshot]
    .filter((snapshot) => snapshot && Number.isFinite(snapshot.heapBytes) && Number.isFinite(Date.parse(snapshot.at || '')));
  if (snapshots.length >= 2) {
    const t0 = Date.parse(snapshots[0].at);
    const series = snapshots.map((snapshot) => [Date.parse(snapshot.at) - t0, snapshot.heapBytes]);
    const spanMs = series[series.length - 1][0] - series[0][0];
    if (spanMs > 0) return leastSquaresSlopePerMs(series) * THIRTY_MIN_MS;
  }
  const growth = typeof memory?.heapGrowthBytes === 'number' && Number.isFinite(memory.heapGrowthBytes)
    ? memory.heapGrowthBytes
    : null;
  const duration = typeof soakDurationMs === 'number' && Number.isFinite(soakDurationMs) ? soakDurationMs : null;
  if (growth != null && duration != null && duration > 0) {
    return growth * (THIRTY_MIN_MS / duration);
  }
  return null;
}

function leastSquaresSlopePerMs(series) {
  const n = series.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of series) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denominator = n * sxx - sx * sx;
  if (denominator === 0) {
    const dx = series[n - 1][0] - series[0][0];
    return dx > 0 ? (series[n - 1][1] - series[0][1]) / dx : 0;
  }
  return (n * sxy - sx * sy) / denominator;
}

/** Directory-name grammar for soak output folders under an evidence root. */
export function minSpecEvidenceDirPattern(runtime) {
  if (!['browser', 'electron'].includes(runtime)) throw new Error(`unsupported runtime ${runtime}`);
  return new RegExp(`soak-${runtime}-`);
}

/**
 * Newest evidence.json under evidenceRoot whose directory name matches the
 * soak grammar for the runtime. Returns { dir, evidencePath, mtimeMs } | null.
 */
export function discoverMinSpecEvidence({ root, runtime, evidenceRoot = null } = {}) {
  const base = path.resolve(root, evidenceRoot || path.join('.devshots', 'spec2'));
  const pattern = minSpecEvidenceDirPattern(runtime);
  const candidates = [];
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !pattern.test(entry.name)) continue;
    const evidencePath = path.join(base, entry.name, 'evidence.json');
    try {
      const metadata = statSync(evidencePath);
      candidates.push({ dir: path.join(base, entry.name), evidencePath, mtimeMs: metadata.mtimeMs });
    } catch { /* directory without evidence.json */ }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0];
}
