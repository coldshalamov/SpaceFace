// Name the owner of any display callback that misses two vsyncs (>32 ms).
//
// Production play does not call this unless a probe enables hitch attribution.
// The classifier is a pure function over already-collected phase samples so the
// default picture pays no extra clocks.

export const HITCH_THRESHOLD_MS = 32;

export const HITCH_OWNERS = Object.freeze([
  'compile',
  'upload',
  'compose',
  'meshBuild',
  'shadow',
  'speedLines',
  'bloom',
  'gc',
  'restore',
  'autosave',
  'present',
  'sim',
  'ui',
  'admission',
  'vfx',
  'feel',
  'callbackUntracked',
  'externalScheduling',
  'unknown',
]);

const PHASE_TO_OWNER = Object.freeze({
  compileMs: 'compile',
  uploadMs: 'upload',
  composeMs: 'compose',
  meshBuildMs: 'meshBuild',
  shadowMs: 'shadow',
  speedLinesMs: 'speedLines',
  bloomMs: 'bloom',
  gcMs: 'gc',
  restoreMs: 'restore',
  autosaveMs: 'autosave',
  presentMs: 'present',
  simMs: 'sim',
  uiMs: 'ui',
  admissionMs: 'admission',
  vfxMs: 'vfx',
  feelMs: 'feel',
  untrackedMs: 'callbackUntracked',
  scheduleMs: 'externalScheduling',
  renderMs: 'present',
  presentationMs: 'present',
});

const DETAILED_HITCH_OWNERS = new Set([
  'compile',
  'upload',
  'compose',
  'meshBuild',
  'shadow',
  'speedLines',
  'bloom',
  'gc',
  'restore',
  'autosave',
]);

export function isHitchFrame(frameMs, thresholdMs = HITCH_THRESHOLD_MS) {
  return Number.isFinite(Number(frameMs)) && Number(frameMs) > thresholdMs;
}

/**
 * Pick the largest named phase that accounts for at least `share` of the
 * excess over the hitch threshold. Unattributed leftovers stay `unknown`.
 */
export function classifyHitchFrame(sample = {}, options = {}) {
  const frameMs = Number(sample.frameMs);
  const thresholdMs = Number.isFinite(Number(options.thresholdMs))
    ? Number(options.thresholdMs)
    : HITCH_THRESHOLD_MS;
  if (!isHitchFrame(frameMs, thresholdMs)) return null;

  const share = Number.isFinite(Number(options.share)) ? Number(options.share) : 0.4;
  const excess = frameMs - thresholdMs;
  let bestOwner = 'unknown';
  let bestMs = 0;
  let bestDetailedOwner = 'unknown';
  let bestDetailedMs = 0;
  const phases = {};

  for (const [key, owner] of Object.entries(PHASE_TO_OWNER)) {
    const ms = Number(sample[key]);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    phases[owner] = (phases[owner] || 0) + ms;
    if (phases[owner] > bestMs) {
      bestMs = phases[owner];
      bestOwner = owner;
    }
    if (DETAILED_HITCH_OWNERS.has(owner) && phases[owner] > bestDetailedMs) {
      bestDetailedMs = phases[owner];
      bestDetailedOwner = owner;
    }
  }

  // Exact work (compile/upload/compose/etc.) can be nested inside a broader measured container.
  // Prefer it only when it explains nearly all of that container; a small detailed slice must not
  // steal a frame genuinely dominated by simulation, presentation, or scheduling.
  if (bestDetailedMs > 0 && bestDetailedMs >= bestMs * 0.75) {
    bestMs = bestDetailedMs;
    bestOwner = bestDetailedOwner;
  }

  // Blame a phase only if it owns a real share of the *frame*, not a sliver of
  // the 1–4 ms excess on a one-dropped-vsync hitch.
  const attributed = bestMs >= Math.max(excess * share, frameMs * 0.2)
    && bestOwner !== 'unknown';
  return {
    owner: attributed ? bestOwner : 'unknown',
    frameMs,
    excessMs: excess,
    ownerMs: attributed ? bestMs : 0,
    attributed,
    phases,
  };
}

export function createHitchHistogram() {
  const counts = Object.create(null);
  for (const owner of HITCH_OWNERS) counts[owner] = 0;
  return {
    frames: 0,
    hitches: 0,
    named: 0,
    unknown: 0,
    counts,
  };
}

export function accumulateHitch(histogram, classification) {
  if (!histogram) return histogram;
  histogram.frames += 1;
  if (!classification) return histogram;
  histogram.hitches += 1;
  const owner = HITCH_OWNERS.includes(classification.owner)
    ? classification.owner
    : 'unknown';
  histogram.counts[owner] += 1;
  if (owner === 'unknown') histogram.unknown += 1;
  else histogram.named += 1;
  return histogram;
}

export function hitchCoverage(histogram) {
  if (!histogram || histogram.hitches <= 0) return 1;
  return histogram.named / histogram.hitches;
}

export function hitchHistogramReport(histogram) {
  return {
    frames: histogram ? histogram.frames : 0,
    hitches: histogram ? histogram.hitches : 0,
    named: histogram ? histogram.named : 0,
    unknown: histogram ? histogram.unknown : 0,
    coverage: hitchCoverage(histogram),
    counts: { ...(histogram && histogram.counts) },
  };
}
