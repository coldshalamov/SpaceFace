// Pure acceptance math for per-requestAnimationFrame presentation samples.
//
// The browser/Electron probe owns sampling real Three.js identities. This module deliberately owns
// only deterministic comparison and receipt construction so the rejection rules can be unit tested
// without a GPU or a wall clock.

export const PRESENTATION_CONTINUITY_LIMITS = Object.freeze({
  stablePixelDelta: 0.25,
  rebasePixelDelta: 0.25,
  lodPixelDelta: 0.25,
  contextPixelDelta: 0.25,
  continuePixelDelta: 0.25,
  interpolationJumpPixels: 4,
  interpolationJumpDiameters: 0.5,
  interpolationDiameterJumpPixels: 1.5,
  interpolationDiameterJumpRatio: 0.2,
  // Continue reload settles a camera spring rather than teleporting instantly. Strict pairwise compare
  // is deferred until the projected composition reconverges to the pre-continue baseline: it must land
  // within continuePixelDelta and hold for continueSettleHold frames inside continueSettleFrames.
  continueSettleFrames: 24,
  continueSettleHold: 4,
  // A per-sector reload legitimately omits entities far from the restore point. A missing established
  // role target is a failure only when its last-known position lies within this presence range of the
  // player; beyond it, absence is streaming truth (counted, not failed).
  roleTargetMissingRangeWu: 4000,
  // Pose restore across save/Continue is contracted in world units (the route's POSE_TOL_WU), not
  // pixels. The settle contract therefore separates two bounds: frame-to-frame stability stays at
  // continuePixelDelta, while proximity to the pre-continue baseline may carry a pose-equivalent
  // pixel slack the harness computes from the measured scale. Null = no slack (strict), the
  // fail-closed default for unit scenarios that do not model the pose contract.
  continueBaselineSlackPx: null,
});

/**
 * Index of the first frame in the first run of `stableFrames` consecutive adjacent-frame steps whose
 * projected center and diameter both move no more than `tolerancePx`, or -1 if the series never
 * settles. Pure so the rebase two-stage precondition (harness-side, real-time) is unit testable. Each
 * `series` entry is `{ x, y, diameter, onScreen }`.
 */
export function frameSeriesSettleIndex(series, options = {}) {
  const stableFrames = Math.max(1, Math.floor(options.stableFrames || 8));
  const tolerancePx = Number.isFinite(options.tolerancePx) ? options.tolerancePx : 0.25;
  if (!Array.isArray(series)) return -1;
  let runStart = -1;
  let run = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const stable = a && b && a.onScreen === true && b.onScreen === true
      && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.diameter)
      && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.diameter)
      && Math.hypot(b.x - a.x, b.y - a.y) <= tolerancePx
      && Math.abs(b.diameter - a.diameter) <= tolerancePx;
    if (stable) {
      if (run === 0) runStart = i - 1;
      run++;
      if (run >= stableFrames) return runStart;
    } else {
      run = 0;
      runStart = -1;
    }
  }
  return -1;
}

export const PRESENTATION_REQUIRED_ROLES = Object.freeze([
  'player',
  'helios',
  'authored-asteroid',
  'ordinary-asteroid',
]);

const STRICT_SPATIAL_TRANSITIONS = new Set([
  'stable',
  'rebase',
  'lod',
  'hlod',
  'context-recovery',
  'continue',
]);

/**
 * Evaluate normalized presentation samples. Every failure includes the exact sample pair so a live
 * receipt is actionable rather than a boolean "flickered" claim.
 *
 * Samples may come from several entities and phases. `sequence` is the host-ordered frame index;
 * `frame` is accepted as a deterministic unit-test fallback. Cross-phase pairs are compared only
 * when the later sample declares `transitionKind`, preventing unrelated camera moves from being
 * mislabeled as asset jumps.
 */
export function evaluatePresentationContinuity(samples, options = {}) {
  const limits = Object.freeze({
    ...PRESENTATION_CONTINUITY_LIMITS,
    ...(options.limits || {}),
  });
  const failures = [];
  const requiredRoles = Array.isArray(options.requiredRoles) ? [...new Set(options.requiredRoles)] : [];
  const requiredAuthoredRoles = Array.isArray(options.requiredAuthoredRoles)
    ? [...new Set(options.requiredAuthoredRoles)]
    : [];
  const requiredOnScreenRoles = Array.isArray(options.requiredOnScreenRoles)
    ? [...new Set(options.requiredOnScreenRoles)]
    : [];
  // Fail-closed admission: every sample in one of these roles must carry a live token that is exactly
  // 'pending' or 'ready', and the role must reach 'ready' at least once. A null/renamed/unavailable
  // token is a rejection, not a silent pass — a refactor that stops publishing the token turns red.
  const requiredAdmissionRoles = Array.isArray(options.requiredAdmissionRoles)
    ? [...new Set(options.requiredAdmissionRoles)]
    : [];
  const requiredAdmissionRoleSet = new Set(requiredAdmissionRoles);
  const counters = {
    samples: 0,
    entities: 0,
    spatialPairs: 0,
    stablePairs: 0,
    rebasePairs: 0,
    lodPairs: 0,
    hlodPairs: 0,
    contextPairs: 0,
    continuePairs: 0,
    interpolationPairs: 0,
    offscreenPairsSkipped: 0,
    missingProjectionPairs: 0,
    unloadedPairs: 0,
    outOfRangeRoleTargets: 0,
    pendingSamples: 0,
    authoredSamples: 0,
    instanceSamples: 0,
    validInstanceOwnershipSamples: 0,
  };
  const maxima = {
    centerDeltaPx: 0,
    diameterDeltaPx: 0,
    interpolationJumpPx: 0,
    interpolationJumpDiameters: 0,
    interpolationDiameterJumpPx: 0,
    interpolationDiameterJumpRatio: 0,
  };

  const normalized = Array.isArray(samples)
    ? samples.map((sample, index) => normalizeSample(sample, index))
    : [];
  counters.samples = normalized.length;

  const groups = new Map();
  const roleCoverage = new Map();
  const roleTargetMissingFlagged = new Set();
  for (const sample of normalized) {
    // Cluster 4: the recorder emits a sentinel when an established role cannot re-bind to an entity
    // of its stable semantic identity after a reload. Fail honestly rather than pairing a different
    // entity; the sentinel never joins a role group (it has no live target to compare).
    // Range qualification: a per-sector reload legitimately omits entities whose last-known position
    // is far from the restore point (streaming truth, proven by the run-5 far-restore evidence). The
    // failure therefore fires only when the target SHOULD be present: last-known position within
    // roleTargetMissingRangeWu of the player, or either position unknown (fail-closed).
    if (sample.roleTargetMissing === true) {
      const role = sample.role || 'missing-role';
      const lastKnown = sample.lastKnownWorld;
      const playerWorld = sample.playerWorld;
      const positionsKnown = lastKnown && playerWorld
        && Number.isFinite(lastKnown.x) && Number.isFinite(lastKnown.z)
        && Number.isFinite(playerWorld.x) && Number.isFinite(playerWorld.z);
      const outOfRange = positionsKnown
        && Math.hypot(lastKnown.x - playerWorld.x, lastKnown.z - playerWorld.z) > limits.roleTargetMissingRangeWu;
      if (outOfRange) {
        counters.outOfRangeRoleTargets++;
        continue;
      }
      if (!roleTargetMissingFlagged.has(role)) {
        roleTargetMissingFlagged.add(role);
        failures.push(coverageFailure(
          'role-target-missing-after-continue',
          role,
          `no entity matched the established semantic identity ${String(sample.semanticIdentity)} after continue`
            + (positionsKnown
              ? ` (last known ${fmt(Math.hypot(lastKnown.x - playerWorld.x, lastKnown.z - playerWorld.z))} WU from the player, inside the ${limits.roleTargetMissingRangeWu} WU presence range)`
              : ' (positions unknown; absence cannot be justified as out-of-range streaming)'),
        ));
      }
      continue;
    }
    const key = `${sample.route || 'route'}:${sample.role || `entity-${String(sample.entityId)}`}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    group.push(sample);
    recordRoleSample(roleCoverage, sample);
    evaluateSingleSample(sample, failures, counters, requiredAdmissionRoleSet);
  }
  counters.entities = groups.size;

  for (const group of groups.values()) {
    group.sort((a, b) => a.sequence - b.sequence);

    // Cluster 2: Continue reloads settle a camera spring rather than teleporting instantly. The
    // projected composition must reconverge to the pre-continue baseline within a bounded window;
    // strict pairwise compare is deferred until it does.
    const continueSettle = computeContinueSettle(group, limits);
    if (continueSettle.neverSettled) {
      failures.push(coverageFailure(
        'continue-composition-never-settled',
        continueSettle.role,
        `composition did not reconverge to the pre-continue baseline within ${limits.continueSettleFrames} frames (tail=${JSON.stringify(continueSettle.tail)})`,
      ));
    }

    for (let index = 1; index < group.length; index++) {
      const before = group[index - 1];
      const after = group[index];
      const transition = classifyTransition(before, after);
      if (!transition) continue;

      // Cluster 3: a released mesh (rootUuid null) is a continuity segment break, not identity churn.
      // The role legitimately left render relevance; skip identity/spatial and do not resume pairing
      // until a live mesh reappears (the reacquired root then starts a fresh segment — its first
      // sample is a baseline, never compared to the pre-unload one).
      const beforeLive = present(before.rootUuid);
      const afterLive = present(after.rootUuid);
      if (!afterLive) {
        counters.unloadedPairs++;
        continue;
      }
      if (!beforeLive) continue;

      recordRolePair(roleCoverage, after.role, transition, false);
      evaluateIdentityPair(before, after, transition, failures);
      const measurement = measureProjectedPair(before, after);
      if (measurement.status === 'missing') {
        counters.missingProjectionPairs++;
        continue;
      }
      if (measurement.status === 'offscreen') {
        counters.offscreenPairsSkipped++;
        continue;
      }

      counters.spatialPairs++;
      incrementTransitionCounter(counters, transition);
      recordRolePair(roleCoverage, after.role, transition, true);
      maxima.centerDeltaPx = Math.max(maxima.centerDeltaPx, measurement.centerDeltaPx);
      maxima.diameterDeltaPx = Math.max(maxima.diameterDeltaPx, measurement.diameterDeltaPx);

      if (transition === 'interpolation') {
        maxima.interpolationJumpPx = Math.max(maxima.interpolationJumpPx, measurement.centerDeltaPx);
        maxima.interpolationJumpDiameters = Math.max(
          maxima.interpolationJumpDiameters,
          measurement.centerDeltaDiameters,
        );
        maxima.interpolationDiameterJumpPx = Math.max(
          maxima.interpolationDiameterJumpPx,
          measurement.diameterDeltaPx,
        );
        maxima.interpolationDiameterJumpRatio = Math.max(
          maxima.interpolationDiameterJumpRatio,
          measurement.diameterDeltaRatio,
        );
        if (measurement.centerDeltaPx > limits.interpolationJumpPixels
          && measurement.centerDeltaDiameters > limits.interpolationJumpDiameters) {
          failures.push(pairFailure(
            'interpolation-isolated-jump',
            before,
            after,
            `center moved ${fmt(measurement.centerDeltaPx)}px / ${fmt(measurement.centerDeltaDiameters)} diameters`,
            measurement,
          ));
        }
        if (measurement.diameterDeltaPx > limits.interpolationDiameterJumpPixels
          && measurement.diameterDeltaRatio > limits.interpolationDiameterJumpRatio) {
          failures.push(pairFailure(
            'interpolation-diameter-pop',
            before,
            after,
            `diameter changed ${fmt(measurement.diameterDeltaPx)}px / ${fmt(measurement.diameterDeltaRatio)} of prior scale`,
            measurement,
          ));
        }
        continue;
      }

      // Cluster 2: within the continue settle window the camera spring is still converging; the pair
      // is counted and identity is pinned, but strict pairwise spatial is deferred until the settle
      // point. A composition that never reconverges is reported once as continue-composition-never-settled.
      if (transition === 'continue') {
        if (continueSettle.neverSettled) continue;
        if (continueSettle.settleSeq != null && after.sequence <= continueSettle.settleSeq) continue;
      }

      const tolerance = spatialTolerance(transition, limits);
      if (measurement.centerDeltaPx > tolerance) {
        failures.push(pairFailure(
          `${transition}-center-discontinuity`,
          before,
          after,
          `center delta ${fmt(measurement.centerDeltaPx)}px exceeds ${fmt(tolerance)}px`,
          measurement,
        ));
      }
      if (measurement.diameterDeltaPx > tolerance) {
        failures.push(pairFailure(
          `${transition}-diameter-discontinuity`,
          before,
          after,
          `diameter delta ${fmt(measurement.diameterDeltaPx)}px exceeds ${fmt(tolerance)}px`,
          measurement,
        ));
      }
    }
  }

  const roles = Object.fromEntries([...roleCoverage.entries()].map(([role, coverage]) => [role, coverage]));
  enforceRequiredCoverage({
    roles,
    requiredRoles,
    requiredAuthoredRoles,
    requiredOnScreenRoles,
    requiredAdmissionRoles,
    requirePlayerInitialAdmission: options.requirePlayerInitialAdmission === true,
    requireInstanceOwnershipWhenInstanced: options.requireInstanceOwnershipWhenInstanced === true,
    instancedSamplesExist: counters.instanceSamples > 0,
    validInstanceOwnershipSamples: counters.validInstanceOwnershipSamples,
    failures,
  });

  return {
    schema: 'spaceface.presentationContinuityEvaluation.v2',
    pass: failures.length === 0,
    limits,
    counters,
    maxima,
    coverage: {
      initialAdmission: normalized.some((sample) => sample.phase === 'initial-admission'),
      stable: counters.stablePairs > 0,
      rebase: counters.rebasePairs > 0,
      lod: counters.lodPairs > 0 || counters.hlodPairs > 0,
      interpolation: counters.interpolationPairs > 0,
      continue: counters.continuePairs > 0,
      contextRecovery: counters.contextPairs > 0,
      instanceOwnership: counters.validInstanceOwnershipSamples > 0,
      roles,
    },
    failures,
  };
}

function recordRoleSample(roleCoverage, sample) {
  const role = sample.role || 'missing-role';
  let coverage = roleCoverage.get(role);
  if (!coverage) {
    coverage = {
      samples: 0,
      evidenceCompleteSamples: 0,
      onScreenSamples: 0,
      explicitOffscreenSamples: 0,
      initialAdmissionSamples: 0,
      pendingAdmissionSamples: 0,
      readyAdmissionSamples: 0,
      authoredSamples: 0,
      instanceOwnershipSamples: 0,
      immediateLodRequestSamples: 0,
      immediateLodMatches: 0,
      pairs: 0,
      spatialPairs: 0,
      transitions: {},
    };
    roleCoverage.set(role, coverage);
  }
  coverage.samples++;
  if (sample.evidence.entity && sample.evidence.counts && sample.evidence.projection) {
    coverage.evidenceCompleteSamples++;
  }
  if (sample.projected.onScreen) coverage.onScreenSamples++;
  if (sample.evidence.explicitOffscreen) coverage.explicitOffscreenSamples++;
  if (sample.phase === 'initial-admission') coverage.initialAdmissionSamples++;
  if (sample.phase === 'initial-admission' && sample.presentationAdmission === 'pending') {
    coverage.pendingAdmissionSamples++;
  }
  if (sample.presentationAdmission === 'ready') coverage.readyAdmissionSamples++;
  if (String(sample.authoredAssetState || '').startsWith('authored')) coverage.authoredSamples++;
  if (sample.instancePoolUuid && Number.isInteger(sample.instanceId)
    && sample.instanceEntityId === sample.entityId) coverage.instanceOwnershipSamples++;
  if (sample.lodRequest?.stage === 'immediate-request') {
    coverage.immediateLodRequestSamples++;
    // Truthful match only: derived from the visible tagged-bucket census (offExpectedVisible), never
    // from the stale selectorLevel. normalizeSample recomputes it so a receipt cannot self-declare.
    if (sample.lodRequest.matched === true) coverage.immediateLodMatches++;
  }
}

function recordRolePair(roleCoverage, role, transition, spatial) {
  const coverage = roleCoverage.get(role || 'missing-role');
  if (!coverage) return;
  if (spatial) {
    coverage.spatialPairs++;
    return;
  }
  coverage.pairs++;
  coverage.transitions[transition] = (coverage.transitions[transition] || 0) + 1;
}

function enforceRequiredCoverage({
  roles,
  requiredRoles,
  requiredAuthoredRoles,
  requiredOnScreenRoles,
  requiredAdmissionRoles,
  requirePlayerInitialAdmission,
  requireInstanceOwnershipWhenInstanced,
  instancedSamplesExist,
  validInstanceOwnershipSamples,
  failures,
}) {
  for (const role of requiredAdmissionRoles || []) {
    if ((roles[role]?.readyAdmissionSamples || 0) < 1) {
      failures.push(coverageFailure(
        'admission-never-ready',
        role,
        'required-admission role never reached a ready presentation token',
      ));
    }
  }
  for (const role of requiredRoles) {
    const coverage = roles[role];
    if (!coverage || coverage.samples < 1) {
      failures.push(coverageFailure('required-role-not-sampled', role, 'role has no samples'));
      continue;
    }
    if (coverage.evidenceCompleteSamples < 1) {
      failures.push(coverageFailure('required-role-evidence-incomplete', role, 'role has no complete entity/count/projection sample'));
    }
    if (coverage.pairs < 1) {
      failures.push(coverageFailure('required-role-continuity-unmeasured', role, 'role has no classified adjacent-frame pair'));
    }
  }
  for (const role of requiredAuthoredRoles) {
    if ((roles[role]?.authoredSamples || 0) < 1) {
      failures.push(coverageFailure(
        'required-authored-role-not-ready',
        role,
        'role has no authored presentation sample',
      ));
    }
  }
  for (const role of requiredOnScreenRoles) {
    if ((roles[role]?.onScreenSamples || 0) < 1) {
      failures.push(coverageFailure(
        'required-role-never-on-screen',
        role,
        'role has no on-screen projected sample',
      ));
    }
  }
  if (requirePlayerInitialAdmission && (roles.player?.initialAdmissionSamples || 0) < 1) {
    failures.push(coverageFailure(
      'player-initial-admission-unmeasured',
      'player',
      'player has no initial-admission rAF sample',
    ));
  }
  // Conditional ownership proof: near-spawn ordinary rocks are authored-upgraded today, so the
  // instance pool is legitimately dormant and no ordinary sample carries instance fields. Only demand
  // an exact submitted-owner receipt when instanced samples were actually recorded — a submitted pool
  // that resolves to the wrong owner (or none) must still be caught.
  if (requireInstanceOwnershipWhenInstanced && instancedSamplesExist && (validInstanceOwnershipSamples || 0) < 1) {
    failures.push(coverageFailure(
      'instance-ownership-unproven',
      'ordinary-asteroid',
      'instanced samples were recorded but none proved exact submitted instance ownership',
    ));
  }
}

function coverageFailure(code, role, detail) {
  return { code, role, detail, phase: 'coverage' };
}

/**
 * Continue settle contract for a role group. The pre-continue baseline is the last settled on-screen
 * pre-continue projection; the continue-phase samples must reconverge to it (center and diameter both
 * within continuePixelDelta) and hold continueSettleHold frames inside the first continueSettleFrames
 * continue samples. `settleSeq` marks the first converged sample — pairs up to and including it are the
 * settling window (strict compare deferred); later pairs stay strict.
 */
function computeContinueSettle(group, limits) {
  let baseline = null;
  const continueSamples = [];
  for (const sample of group) {
    if (!sample.evidence.projection || sample.projected?.onScreen !== true) continue;
    if (sample.phase === 'pre-continue') baseline = sample.projected;
    else if (sample.phase === 'continue') continueSamples.push(sample);
  }
  if (!baseline || continueSamples.length === 0) {
    return { baseline: null, settleSeq: null, neverSettled: false, role: null, tail: null };
  }
  const tol = limits.continuePixelDelta;
  // Baseline proximity honors the pose contract: restore is guaranteed in WU, so the harness may
  // supply a pose-equivalent pixel slack. Frame-to-frame stability stays strict — a composition
  // oscillating inside the slack band is not settled.
  const slack = Number.isFinite(limits.continueBaselineSlackPx) && limits.continueBaselineSlackPx > tol
    ? limits.continueBaselineSlackPx
    : tol;
  const hold = Math.max(1, Math.floor(limits.continueSettleHold || 4));
  const cap = Math.max(hold, Math.floor(limits.continueSettleFrames || 24));
  const window = continueSamples.slice(0, cap);
  const role = window[0].role;
  let runStart = -1;
  let run = 0;
  for (let i = 0; i < window.length; i++) {
    const p = window[i].projected;
    const withinSlack = Math.hypot(p.x - baseline.x, p.y - baseline.y) <= slack
      && Math.abs(p.diameter - baseline.diameter) <= slack;
    // Stability is judged INSIDE the run: the hop that enters the slack band may be large (a fast
    // final spring step), but successive frames within a candidate settle run must move <= tol or
    // the composition is oscillating, not settled.
    const prev = run > 0 ? window[i - 1].projected : null;
    const stableWithinRun = !prev
      || (Math.hypot(p.x - prev.x, p.y - prev.y) <= tol && Math.abs(p.diameter - prev.diameter) <= tol);
    const converged = withinSlack && (stableWithinRun || run === 0);
    if (withinSlack && !stableWithinRun && run > 0) {
      // Re-entering stability: this frame restarts a candidate run rather than extending one.
      runStart = i;
      run = 1;
      if (run >= hold) {
        return { baseline, settleSeq: window[runStart].sequence, neverSettled: false, role, tail: null };
      }
      continue;
    }
    if (converged) {
      if (run === 0) runStart = i;
      run++;
      if (run >= hold) {
        return { baseline, settleSeq: window[runStart].sequence, neverSettled: false, role, tail: null };
      }
    } else {
      run = 0;
      runStart = -1;
    }
  }
  const tail = window.slice(-Math.min(4, window.length)).map((sample) => ({
    centerDelta: Number(Math.hypot(sample.projected.x - baseline.x, sample.projected.y - baseline.y).toFixed(3)),
    diameterDelta: Number(Math.abs(sample.projected.diameter - baseline.diameter).toFixed(3)),
  }));
  return { baseline, settleSeq: null, neverSettled: true, role, tail };
}

const LOD_LEVELS = ['lod0', 'lod1', 'lod2'];

function normalizeRequestedLevel(level) {
  return level === 'lod1' || level === 'lod2' ? level : 'lod0';
}

/**
 * Closest authored LOD level for a request given the levels actually present, mirroring
 * src/render/partsLibrary.js closestAvailableLod so the receipt's expectedApplied matches what the
 * live installAuthoredLod hook would show. An asset with only {lod0} legitimately resolves a 'lod2'
 * request to 'lod0'.
 */
function closestAvailableLod(requested, available) {
  const req = normalizeRequestedLevel(requested);
  if (!available || available.size === 0) return req;
  if (available.has(req)) return req;
  if (req === 'lod2' && available.has('lod1')) return 'lod1';
  if (available.has('lod0')) return 'lod0';
  if (available.has('lod1')) return 'lod1';
  return 'lod2';
}

/**
 * Canonicalize the reshaped synchronous-LOD receipt. `matched` is derived only from the observable
 * visible-bucket census the in-page recorder captured (per-part `offExpectedVisible` + `taggedVisible`),
 * never from `selectorLevel` — that selector is the resolve()-owned getter a forced updateLod() never
 * writes, so trusting it is the stale tautology this evaluator refuses to reintroduce.
 */
function normalizeLodRequest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const appliedSource = raw.applied && typeof raw.applied === 'object' ? raw.applied : {};
  const visibleBuckets = {};
  let bucketSum = 0;
  for (const level of LOD_LEVELS) {
    const count = Math.max(0, finite(appliedSource.visibleBuckets?.[level], 0) | 0);
    visibleBuckets[level] = count;
    bucketSum += count;
  }
  const availableLevels = Array.isArray(appliedSource.availableLevels)
    ? [...new Set(appliedSource.availableLevels.filter((level) => LOD_LEVELS.includes(level)))]
      .sort((a, b) => LOD_LEVELS.indexOf(a) - LOD_LEVELS.indexOf(b))
    : [];
  const availableSet = new Set(availableLevels);
  const taggedVisible = Number.isInteger(appliedSource.taggedVisible)
    ? Math.max(0, appliedSource.taggedVisible)
    : bucketSum;
  // Fail-closed: an absent offExpectedVisible must never read as matched. The recorder always sets it
  // (buildLodReceipt); a malformed receipt without it is treated as an unresolved (off-expected) LOD.
  const hasOffExpected = Number.isInteger(appliedSource.offExpectedVisible)
    && appliedSource.offExpectedVisible >= 0;
  const offExpectedVisible = hasOffExpected
    ? appliedSource.offExpectedVisible
    : Math.max(1, taggedVisible);
  const dynamicDetailVisible = Math.max(0, finite(appliedSource.dynamicDetailVisible, 0) | 0);
  const expectedApplied = closestAvailableLod(raw.requested, availableSet);
  const matched = taggedVisible > 0 && offExpectedVisible === 0;
  return {
    requested: raw.requested ?? null,
    stage: raw.stage || null,
    selectorLevel: raw.selectorLevel ?? null,
    applied: {
      visibleBuckets,
      dynamicDetailVisible,
      availableLevels,
      taggedVisible,
      offExpectedVisible,
    },
    expectedApplied,
    matched,
  };
}

function normalizeSample(sample, index) {
  const source = sample && typeof sample === 'object' ? sample : {};
  const projectedPresent = source.projected && typeof source.projected === 'object';
  const projected = projectedPresent ? source.projected : {};
  const onScreenExplicit = typeof projected.onScreen === 'boolean';
  const onScreen = projected.onScreen === true;
  const finiteProjection = !onScreen || (
    typeof projected.x === 'number' && Number.isFinite(projected.x)
    && typeof projected.y === 'number' && Number.isFinite(projected.y)
    && typeof projected.diameter === 'number' && Number.isFinite(projected.diameter)
    && projected.diameter >= 0
  );
  return {
    ...source,
    route: source.route || null,
    phase: source.phase || 'unknown',
    sequence: finite(source.sequence, finite(source.frame, index)),
    frame: finite(source.frame, index),
    entityId: source.entityId ?? null,
    entityType: nonemptyString(source.entityType),
    role: nonemptyString(source.role),
    semanticIdentity: nonemptyString(source.semanticIdentity),
    authoredSemanticIdentity: nonemptyString(source.authoredSemanticIdentity),
    worldIdentity: nonemptyString(source.worldIdentity),
    presentationAdmission: source.presentationAdmission || null,
    lodRequest: normalizeLodRequest(source.lodRequest),
    visibleDrawableCount: evidenceCount(source, 'visibleDrawableCount'),
    authoredVisibleCount: evidenceCount(source, 'authoredVisibleCount'),
    fallbackVisibleCount: evidenceCount(source, 'fallbackVisibleCount'),
    evidence: {
      entity: source.entityId !== null && source.entityId !== undefined
        && nonemptyString(source.role) !== null
        && nonemptyString(source.entityType) !== null,
      counts: validEvidenceCount(source, 'visibleDrawableCount')
        && validEvidenceCount(source, 'authoredVisibleCount')
        && validEvidenceCount(source, 'fallbackVisibleCount'),
      projection: projectedPresent && onScreenExplicit && finiteProjection,
      explicitOffscreen: projectedPresent && onScreenExplicit && !onScreen,
    },
    projected: {
      x: onScreen ? finite(projected.x, NaN) : null,
      y: onScreen ? finite(projected.y, NaN) : null,
      diameter: onScreen ? Math.max(0, finite(projected.diameter, NaN)) : null,
      onScreen,
    },
  };
}

function evaluateSingleSample(sample, failures, counters, requiredAdmissionRoleSet) {
  // Fail-closed admission token for required-admission roles. The only live vocabulary is
  // {pending, ready, unavailable} (src/core/presentationAdmission.js). 'unavailable' is an explicit
  // refusal; anything not exactly 'pending' or 'ready' (null, missing, or a renamed token) is a
  // missing admission — never a silent pass.
  if (requiredAdmissionRoleSet && sample.role && requiredAdmissionRoleSet.has(sample.role)) {
    const token = sample.presentationAdmission;
    if (token === 'unavailable') {
      failures.push(sampleFailure(
        'admission-unavailable',
        sample,
        'required-admission role published an unavailable presentation token',
      ));
    } else if (token !== 'pending' && token !== 'ready') {
      failures.push(sampleFailure(
        'admission-token-missing',
        sample,
        `required-admission role has no valid presentation token (got ${String(token)})`,
      ));
    }
  }
  if (!sample.evidence.entity) {
    failures.push(sampleFailure(
      'entity-identity-evidence-missing',
      sample,
      'sample requires entityId, entityType, and role',
    ));
  }
  if (!sample.evidence.counts) {
    failures.push(sampleFailure(
      'drawable-count-evidence-missing',
      sample,
      'sample requires finite nonnegative integer visible/authored/fallback counts',
    ));
  }
  if (!sample.evidence.projection) {
    failures.push(sampleFailure(
      'projection-evidence-missing',
      sample,
      'sample requires explicit projected.onScreen and finite on-screen center/diameter',
    ));
  }
  if (sample.presentationAdmission === 'pending') {
    counters.pendingSamples++;
    if (Number.isFinite(sample.visibleDrawableCount) && sample.visibleDrawableCount !== 0) {
      failures.push(sampleFailure(
        'pending-admission-visible-drawables',
        sample,
        `pending admission exposed ${sample.visibleDrawableCount} visible drawables`,
      ));
    }
  }
  if (String(sample.authoredAssetState || '').startsWith('authored')) counters.authoredSamples++;
  if (Number.isFinite(sample.fallbackVisibleCount) && Number.isFinite(sample.authoredVisibleCount)
    && sample.fallbackVisibleCount > 0 && sample.authoredVisibleCount > 0) {
    failures.push(sampleFailure(
      'fallback-authored-overlap',
      sample,
      `visible fallback=${sample.fallbackVisibleCount}, authored=${sample.authoredVisibleCount}`,
    ));
  }
  if (sample.expectsInstanceOwner === true || sample.instancePoolUuid || sample.instanceId != null) {
    counters.instanceSamples++;
    if (!sample.instancePoolUuid || !Number.isInteger(sample.instanceId)) {
      failures.push(sampleFailure(
        'visible-instance-owner-missing',
        sample,
        'on-screen instanced entity exposed no submitted pool slot',
      ));
    } else if (sample.instanceEntityId !== sample.entityId) {
      failures.push(sampleFailure(
        'instance-owner-mismatch',
        sample,
        `instance resolves to ${String(sample.instanceEntityId)} instead of ${String(sample.entityId)}`,
      ));
    } else {
      counters.validInstanceOwnershipSamples++;
    }
  }
}

function classifyTransition(before, after) {
  if (after.transitionKind) return String(after.transitionKind);
  if (before.phase !== after.phase) return null;
  if (after.contextEpoch !== before.contextEpoch) return 'context-recovery';
  if (after.frameOriginSeq !== before.frameOriginSeq) return 'rebase';
  if (after.phase === 'interpolation') return 'interpolation';
  if (after.phase === 'lod') return 'lod';
  if (after.phase === 'hlod') return 'hlod';
  if (after.phase === 'continue') return 'continue';
  if (after.phase === 'stable') return 'stable';
  return null;
}

function evaluateIdentityPair(before, after, transition, failures) {
  const admissionChanged = before.presentationAdmission !== after.presentationAdmission;
  const rootChanged = present(before.rootUuid) && before.rootUuid !== after.rootUuid;
  const hullChanged = present(before.hullUuid) && before.hullUuid !== after.hullUuid;
  const instanceChanged = present(before.instancePoolUuid) && before.instancePoolUuid !== after.instancePoolUuid;
  const compositionChanged = present(before.authoredCompositionId)
    && before.authoredCompositionId !== after.authoredCompositionId;
  const continueBoundary = transition === 'continue'
    && after.transitionKind === 'continue'
    && before.phase !== after.phase;

  pinSemanticField(before, after, transition, 'role', failures);
  pinSemanticField(before, after, transition, 'entityType', failures);
  pinSemanticField(before, after, transition, 'semanticIdentity', failures);
  // worldIdentity is type:entityId; entity ids reshuffle across save/load, so it is NOT stable across
  // the Continue reload boundary. semanticIdentity is the stable key there and stays pinned.
  if (!continueBoundary) pinSemanticField(before, after, transition, 'worldIdentity', failures);
  const authoredEitherSide = String(before.authoredAssetState || '').startsWith('authored')
    || String(after.authoredAssetState || '').startsWith('authored');
  // Across a reload, authored admission restarts lazily (onBeforeRender-triggered): an off-camera
  // boundary legitimately re-enters 'awaiting-authored-admission' and carries no authored identity
  // yet. That is deferred re-admission, not identity churn — only a STARTED admission that resolves
  // to a different authored identity (or a mid-admission state leaking past the readiness gate)
  // remains a violation.
  const lazyReadmissionBoundary = transition === 'continue'
    && after.authoredAssetState === 'awaiting-authored-admission';
  if (authoredEitherSide && !lazyReadmissionBoundary) {
    pinSemanticField(before, after, transition, 'authoredSemanticIdentity', failures);
  }

  // Only the first Continue boundary may reconstruct Three objects. Delayed UUID churn is a real
  // presentation replacement and is rejected by subsequent same-phase Continue comparisons.
  if (continueBoundary) return;

  // Initial admission is allowed to replace a no-draw pending root with the authored identity.
  if (admissionChanged && before.presentationAdmission === 'pending') return;

  if (rootChanged) failures.push(pairFailure(
    `${transition}-root-identity-changed`,
    before,
    after,
    `${before.rootUuid} -> ${after.rootUuid}`,
  ));
  if (hullChanged) failures.push(pairFailure(
    `${transition}-hull-identity-changed`,
    before,
    after,
    `${before.hullUuid} -> ${after.hullUuid}`,
  ));
  if (instanceChanged) failures.push(pairFailure(
    `${transition}-instance-pool-identity-changed`,
    before,
    after,
    `${before.instancePoolUuid} -> ${after.instancePoolUuid}`,
  ));
  if (compositionChanged) failures.push(pairFailure(
    `${transition}-authored-composition-changed`,
    before,
    after,
    `${before.authoredCompositionId} -> ${after.authoredCompositionId}`,
  ));
}

function pinSemanticField(before, after, transition, field, failures) {
  const a = before[field];
  const b = after[field];
  if (!present(a) || !present(b)) {
    failures.push(pairFailure(
      `${transition}-${field}-missing`,
      before,
      after,
      `${field} must be present on both sides (${String(a)} -> ${String(b)})`,
    ));
    return;
  }
  if (a !== b) {
    failures.push(pairFailure(
      `${transition}-${field}-changed`,
      before,
      after,
      `${String(a)} -> ${String(b)}`,
    ));
  }
}

function measureProjectedPair(before, after) {
  const a = before.projected;
  const b = after.projected;
  if (!before.evidence.projection || !after.evidence.projection) return { status: 'missing' };
  if (!a.onScreen || !b.onScreen) return { status: 'offscreen' };
  const centerDeltaPx = Math.hypot(b.x - a.x, b.y - a.y);
  const diameterDeltaPx = Math.abs(b.diameter - a.diameter);
  const referenceDiameter = Math.max(1e-6, Math.min(a.diameter, b.diameter));
  return {
    status: 'measured',
    centerDeltaPx,
    diameterDeltaPx,
    centerDeltaDiameters: centerDeltaPx / referenceDiameter,
    diameterDeltaRatio: diameterDeltaPx / referenceDiameter,
    beforeDiameterPx: a.diameter,
    afterDiameterPx: b.diameter,
  };
}

function spatialTolerance(transition, limits) {
  if (!STRICT_SPATIAL_TRANSITIONS.has(transition)) return limits.stablePixelDelta;
  if (transition === 'rebase') return limits.rebasePixelDelta;
  if (transition === 'lod' || transition === 'hlod') return limits.lodPixelDelta;
  if (transition === 'context-recovery') return limits.contextPixelDelta;
  if (transition === 'continue') return limits.continuePixelDelta;
  return limits.stablePixelDelta;
}

function incrementTransitionCounter(counters, transition) {
  if (transition === 'context-recovery') counters.contextPairs++;
  else if (transition === 'interpolation') counters.interpolationPairs++;
  else if (transition === 'continue') counters.continuePairs++;
  else if (transition === 'hlod') counters.hlodPairs++;
  else if (transition === 'lod') counters.lodPairs++;
  else if (transition === 'rebase') counters.rebasePairs++;
  else if (transition === 'stable') counters.stablePairs++;
}

function sampleFailure(code, sample, detail) {
  return {
    code,
    detail,
    entityId: sample.entityId,
    role: sample.role || null,
    phase: sample.phase,
    frame: sample.frame,
    sequence: sample.sequence,
  };
}

function pairFailure(code, before, after, detail, measurement = null) {
  return {
    code,
    detail,
    entityId: after.entityId,
    role: after.role || before.role || null,
    transition: after.transitionKind || classifyTransition(before, after),
    before: { phase: before.phase, frame: before.frame, sequence: before.sequence },
    after: { phase: after.phase, frame: after.frame, sequence: after.sequence },
    measurement,
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validEvidenceCount(source, field) {
  if (!Object.hasOwn(source, field)) return false;
  if (typeof source[field] !== 'number') return false;
  const value = source[field];
  return Number.isInteger(value) && value >= 0;
}

function evidenceCount(source, field) {
  return validEvidenceCount(source, field) ? Number(source[field]) : NaN;
}

function nonemptyString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

function fmt(value) {
  return Number(value).toFixed(3);
}
