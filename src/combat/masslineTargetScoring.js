// Pure massline target-scoring helpers (massline rung 07; extended by packet T03).
//
// Single owner of "which target is the best massline (tether/slingshot) candidate?" — a PURE
// scoring function over (player, target, options) with NO state, NO bus, NO side effects. The
// caller resolves anything stateful (hostility, obstruction, ownership, tether def range) and
// passes the result in via options, so this module stays deterministic and unit-testable without
// a harness.
//
// Consumed by rung 08 (combat/autoTargetMode.js auto-target wire): when the player is in massline
// mode (tether out / slingshot intent), the auto-target picker uses rankMasslineTargets() instead
// of the weapon "hostiles first, then distance" sort — it favors SWING POTENTIAL.
//
// Massline scoring favors a target you can actually whip: moving across your line (tangential),
// in the right mass band (not so light it flies away, not so heavy it won't budge), at a
// comfortable range (room to swing, not edge-of-break), with a hostility bonus so combat-relevant
// targets win ties. Geometry is 2D on the XZ plane (y=0), matching the sim.
//
// T03 AXES (03_SIGNATURE_SYSTEMS.md T03 row: intent, range, closing geometry, obstruction,
// ownership). All three additions are STRICTLY OPT-IN and the legacy path is byte-identical when
// none of them is supplied — that is what keeps rung-08 consumers and check:massline:target-scoring
// provably unchanged until a T04+ consumer chooses to pass them:
//   • PLAYER INTENT (opts.intentDir {x,z}, opts.preferredId): alignment between the line to the
//     target and the direction the player is pointing blends in at W_INTENT; an explicitly painted
//     preferredId gets an additive bonus sized to beat the latched tiebreak. Intent is a pure
//     function of THIS call's arguments — flip the intent vector and the very next ranking flips
//     with it (immediate reversal; no hysteresis beyond the documented latched bonus).
//   • OBSTRUCTION (opts.obstructed / opts.isObstructed): a latch cannot pass through terrain, so
//     an obstructed target GATES to score 0, rating 'blocked' — physics honesty, not a penalty.
//   • OWNERSHIP (opts.ownership / opts.ownershipOf -> 'own'|'station'|'ally'|'neutral'|'hostile'):
//     the player's own deployables and station structure GATE to rating 'protected' (you cannot
//     throw what you are); an ally is ELIGIBLE (rescue/tow, T11) but damped by ALLY_FACTOR so it
//     never outranks a comparable hostile; neutral/hostile multiply by 1 (the existing hostility
//     BONUS stays the separate axis it always was).
//   • REACH ALLOWANCE (opts.reachAllowance / opts.reachAllowanceOf -> non-negative WU): optional
//     extra latch range per candidate so a caller can restore surface-reach contracts
//     (centerDistance <= maxRange + radius) without changing range-comfort semantics. Absent or
//     zero allowance keeps the legacy center-distance gate byte-identical. Comfort still uses
//     raw distance / maxRange (clamped), never (distance - allowance).
//   • NO WEAPON-AIM COUPLING: this module reads no weapon or reticle state of any kind. A locked
//     gun must never steer massline target choice — pinned by the contract suite, which also
//     forbids this file from even naming those seams.

// Defaults mirror the live tether def (src/data/combatDefs.js: tether_standard.maxLength = 390).
const DEFAULT_MAX_RANGE = 390;
// Range comfort band: ideal at 30-75% of max range. <15% = too close (no room to swing, snap risk);
// >90% = edge of break. Below 15% and above 90% both penalize.
const RANGE_IDEAL_LO = 0.30;
const RANGE_IDEAL_HI = 0.75;
const RANGE_FLOOR = 0.15;
const RANGE_CEIL = 0.90;
// Mass band: anchors need enough mass that the line loads instead of yanking them away, but not so
// much that no energy transfers. Empirical sweet spot ~120-1200 wu-mass for the stock tether.
const MASS_IDEAL_LO = 120;
const MASS_IDEAL_HI = 1200;
const MASS_LIGHT_CEIL = 40;     // below this = drone/debris, whips away, barely an anchor
// Rating bands (mirror the release/snap-catch quality tiers).
const RATING_CLEAN = 0.80;
const RATING_GOOD = 0.55;
const RATING_ROUGH = 0.30;

// Factor weights (sum = 1.0). Swing geometry is the headline massline read; the rest break ties.
const W_SWING = 0.45;
const W_MASS = 0.20;
const W_RANGE = 0.20;
const W_HOSTILE = 0.15;

// --- T03 axis constants -------------------------------------------------------------------------
// Weight of the player-intent alignment axis WHEN an intent vector is supplied. The legacy axes
// are scaled by (1 - W_INTENT) so the blended weights still sum to 1; with no intent vector the
// legacy expression runs untouched (byte-identical scores).
const W_INTENT = 0.25;
// Painted-target bonus. Deliberately larger than the 0.08 latched tiebreak so an explicit player
// designation beats stickiness, while a full intent reversal (alignment swing of 1.0 x W_INTENT
// = 0.25) beats BOTH — reversal must always win immediately.
const PREFERRED_BONUS = 0.15;
// Ownership multipliers. 'own'/'station' are GATES handled before scoring (rating 'protected'),
// so they never reach this table. An ally is eligible (rescue/tow) but damped below any
// comparable hostile or neutral.
const ALLY_FACTOR = 0.35;
const OWNERSHIP_GATED = Object.freeze(new Set(['own', 'station']));

// PQ-004 contextual profiles. Closeness, turn direction, and cursor precision are the three
// strongest authored signals in every profile; the remaining axes explain *why this use* of the
// Massline is likely without turning selection into one universal weighted soup.
const PRECISE_CURSOR_THRESHOLD = 0.82;
// A cursor paint is explicit only when it separates one candidate from its nearest overlap.
// Otherwise the named context (hostile, route, tow, etc.) must break the ambiguity truthfully.
const PRECISE_CURSOR_SEPARATION = 0.08;
const MASSIVE_ANCHOR_MIN_MASS = 1800;
const CONTEXT_PROFILES = Object.freeze({
  'precision-pick': Object.freeze({
    label: 'PICK',
    weights: Object.freeze({ cursor: 0.34, proximity: 0.23, turn: 0.19, authority: 0.10, approach: 0.06, category: 0.04, base: 0.04 }),
  }),
  'massive-anchor-sling': Object.freeze({
    label: 'ORBIT',
    weights: Object.freeze({ turn: 0.30, proximity: 0.23, cursor: 0.19, mass: 0.12, approach: 0.06, category: 0.04, base: 0.03, authority: 0.03 }),
  }),
  'hostile-flyby': Object.freeze({
    label: 'INTERCEPT',
    weights: Object.freeze({ turn: 0.26, proximity: 0.23, cursor: 0.20, approach: 0.11, authority: 0.08, category: 0.07, base: 0.05 }),
  }),
  'tow/salvage': Object.freeze({
    label: 'TOW',
    weights: Object.freeze({ cursor: 0.31, proximity: 0.24, turn: 0.19, category: 0.10, authority: 0.08, approach: 0.05, base: 0.03 }),
  }),
  'route-anchor': Object.freeze({
    label: 'ROUTE',
    weights: Object.freeze({ turn: 0.26, proximity: 0.23, cursor: 0.20, authority: 0.14, approach: 0.07, mass: 0.05, category: 0.03, base: 0.02 }),
  }),
});
const TOW_TYPES = Object.freeze(new Set(['wreck', 'payload', 'pickup']));

/**
 * Score one candidate target as a massline (tether/slingshot) anchor.
 *
 * Pure: reads only the arguments, writes nothing. Caller resolves hostility + max range.
 *
 * @param {object} player   - { pos:{x,z}, vel?:{x,z} }
 * @param {object} target   - { id, pos:{x,z}, vel?:{x,z}, radius?, mass?, type? }
 * @param {object} [opts]
 * @param {number} [opts.maxRange=390]        - tether latch range (caller passes def.maxLength).
 * @param {number} [opts.reachAllowance=0]    - non-negative extra range (surface reach); opt-in.
 * @param {boolean} [opts.hostile=false]      - caller-resolved isHostileToPlayer flag.
 * @param {boolean} [opts.currentlyLatched=false] - small bonus to hold the target you already have.
 * @returns {{ id, score:0..1, rating:'clean'|'good'|'rough'|'poor'|'out', reasons:object }}
 *   Out-of-range targets return score 0, rating 'out' (they are not massline candidates).
 */
export function scoreMasslineTarget(player, target, opts = {}) {
  const maxRange = positiveFinite(opts.maxRange, DEFAULT_MAX_RANGE);
  const reachAllowance = nonNegativeFinite(opts.reachAllowance, 0);
  const id = target && target.id != null ? target.id : null;

  if (!player || !player.pos || !target || !target.pos) {
    return zero(id, 'missing geometry');
  }

  // T03 hard gates run before any scoring. Order is deliberate: ownership protection outranks
  // obstruction (you are told a station is protected even when a rock also happens to block it),
  // and both outrank the range gate so the caller's reasons are the most actionable ones.
  const ownership = typeof opts.ownership === 'string' ? opts.ownership : null;
  if (ownership && OWNERSHIP_GATED.has(ownership)) {
    return gated(id, 'protected', `ownership ${ownership}`);
  }
  if (opts.obstructed === true) {
    return gated(id, 'blocked', 'line of sight obstructed');
  }

  const dx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const dz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const distance = Math.hypot(dx, dz);

  // Reachability gate: outside latch range (+ optional surface allowance) is not a candidate.
  // Comfort still uses raw center distance / maxRange so allowance does not inflate "ideal mid-band".
  const reachLimit = maxRange + reachAllowance;
  if (!(distance <= reachLimit) || !(distance > 1e-6)) {
    return zero(id, distance > reachLimit ? 'out of range' : 'degenerate distance');
  }

  const swing = scoreSwingGeometry(player, target, dx, dz, distance);
  const mass = scoreMass(target);
  const range = scoreRangeComfort(distance, maxRange);
  const hostile = opts.hostile ? 1 : 0;
  const latchedBonus = opts.currentlyLatched ? 0.08 : 0;   // tiebreak, not a weighted factor

  const legacyWeighted = W_SWING * swing
    + W_MASS * mass
    + W_RANGE * range
    + W_HOSTILE * hostile;

  // Player-intent alignment: 1 = the line to this target points exactly where the player is
  // pointing, 0 = exactly opposite, 0.5 = orthogonal. Pure function of THIS call — flipping
  // intentDir flips the ranking on the very next call (immediate reversal by construction).
  const intent = readIntentAlignment(opts.intentDir, dx, dz, distance);
  const preferredBonus = opts.preferredId != null && id != null && opts.preferredId === id
    ? PREFERRED_BONUS : 0;

  let score;
  if (intent.present) {
    score = (1 - W_INTENT) * legacyWeighted + W_INTENT * intent.alignment
      + latchedBonus + preferredBonus;
  } else {
    // LEGACY PATH — byte-identical to rung 07 when no T03 axis is active.
    score = legacyWeighted + latchedBonus + preferredBonus;
  }

  const context = normalizeContext(opts.context);
  let contextReason = null;
  if (context) {
    contextReason = scoreContext(player, target, opts, context, intent, distance, reachLimit, score);
    score = contextReason.score;
  }

  const ownershipFactor = ownership === 'ally' ? ALLY_FACTOR : 1;
  score = clamp01(score * ownershipFactor);

  const reasons = { swing, mass, range, hostile, latchedBonus, distance };
  if (intent.present) reasons.intent = intent.alignment;
  if (preferredBonus > 0) reasons.preferredBonus = preferredBonus;
  if (ownership) reasons.ownership = ownership;
  if (contextReason) reasons.context = contextReason.reason;

  return { id, score, rating: ratingFor(score), reasons };
}

function scoreContext(player, target, opts, context, intent, distance, reachLimit, legacyScore) {
  const profile = CONTEXT_PROFILES[context.id];
  const surfaceDistance = Math.max(0, distance - nonNegativeFinite(target && target.radius, 0));
  const axes = {
    cursor: clamp01(finite(opts.cursorPrecision, 0)),
    proximity: clamp01(1 - surfaceDistance / Math.max(1, reachLimit)),
    turn: intent.present ? intent.alignment : 0.5,
    approach: scoreApproach(player, target, distance),
    mass: scoreAnchorMass(target),
    category: contextCategoryMatch(context.id, target, opts),
    authority: contextAuthorityMatch(context, target),
    base: clamp01(legacyScore),
  };
  let score = 0;
  const contributions = {};
  for (const [axis, weight] of Object.entries(profile.weights)) {
    const contribution = weight * clamp01(finite(axes[axis], 0));
    contributions[axis] = contribution;
    score += contribution;
  }
  const leadingSignals = Object.entries(profile.weights)
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([axis]) => axis);
  return {
    score: clamp01(score),
    reason: {
      id: context.id,
      label: profile.label,
      source: context.source,
      axes,
      contributions,
      leadingSignals,
      explicit: context.explicitId != null && target.id === context.explicitId,
    },
  };
}

function scoreApproach(player, target, distance) {
  const px = finite(player && player.pos && player.pos.x, 0);
  const pz = finite(player && player.pos && player.pos.z, 0);
  const tx = finite(target && target.pos && target.pos.x, 0);
  const tz = finite(target && target.pos && target.pos.z, 0);
  const rvx = finite(target && target.vel && target.vel.x, 0)
    - finite(player && player.vel && player.vel.x, 0);
  const rvz = finite(target && target.vel && target.vel.z, 0)
    - finite(player && player.vel && player.vel.z, 0);
  const dx = tx - px;
  const dz = tz - pz;
  const closing = distance > 1e-6 ? -(dx * rvx + dz * rvz) / distance : 0;
  const relSpeedSq = rvx * rvx + rvz * rvz;
  const tca = relSpeedSq > 1e-6 ? -(dx * rvx + dz * rvz) / relSpeedSq : Infinity;
  const closingScore = clamp01(closing / 120);
  const timeScore = tca >= 0 && tca <= 4 ? 1 - tca / 4 : 0;
  return clamp01(closingScore * 0.55 + timeScore * 0.45);
}

function scoreAnchorMass(target) {
  const mass = positiveFinite(target && target.mass, 0);
  if (!(mass > 0)) return 0.35;
  if (mass >= MASSIVE_ANCHOR_MIN_MASS) return 1;
  return clamp01(Math.sqrt(mass / MASSIVE_ANCHOR_MIN_MASS));
}

function contextCategoryMatch(contextId, target, opts) {
  if (contextId === 'tow/salvage') return isTowCandidate(target) ? 1 : 0;
  if (contextId === 'hostile-flyby') return opts.hostile ? 1 : 0;
  if (contextId === 'massive-anchor-sling') return isMassiveAnchor(target) ? 1 : 0.15;
  if (contextId === 'route-anchor') return target && target.type === 'asteroid' ? 1 : 0.6;
  return 0.5;
}

function contextAuthorityMatch(context, target) {
  if (!context || !target) return 0;
  if (context.explicitId != null) return target.id === context.explicitId ? 1 : 0;
  if (context.focusId != null) return target.id === context.focusId ? 1 : 0;
  if (context.routeId != null) return target.id === context.routeId ? 1 : 0;
  return 0;
}

function normalizeContext(value) {
  const id = typeof value === 'string' ? value : value && value.id;
  const profile = CONTEXT_PROFILES[id];
  if (!profile) return null;
  const source = value && typeof value === 'object' ? value.source : null;
  return {
    id,
    label: profile.label,
    source: typeof source === 'string' ? source : 'context',
    explicitId: value && typeof value === 'object' ? value.explicitId : null,
    focusId: value && typeof value === 'object' ? value.focusId : null,
    routeId: value && typeof value === 'object' ? value.routeId : null,
    forceId: value && typeof value === 'object' ? value.forceId : null,
  };
}

function contextRecord(id, exactId, source) {
  const profile = CONTEXT_PROFILES[id] || CONTEXT_PROFILES['precision-pick'];
  return Object.freeze({
    id,
    label: profile.label,
    source,
    explicitId: source === 'cursor-paint' ? exactId : null,
    focusId: source === 'flyby-focus' ? exactId : null,
    routeId: source === 'route-anchor' ? exactId : null,
    forceId: exactId,
  });
}

function candidateById(candidates, id) {
  if (id == null) return null;
  return candidates.find((candidate) => candidate && candidate.id === id) || null;
}

function candidateIntentAlignment(player, target, intentDir) {
  if (!player || !player.pos || !target || !target.pos) return 0.5;
  const dx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const dz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const distance = Math.hypot(dx, dz);
  if (!(distance > 1e-6)) return 0;
  const intent = readIntentAlignment(intentDir, dx, dz, distance);
  return intent.present ? intent.alignment : 0.5;
}

function isMassiveAnchor(target) {
  if (!target) return false;
  const anchorType = target.type === 'asteroid' || target.type === 'station'
    || target.data?.masslineAnchor === true;
  return anchorType && positiveFinite(target.mass, 0) >= MASSIVE_ANCHOR_MIN_MASS;
}

function isTowCandidate(target) {
  if (!target) return false;
  return TOW_TYPES.has(target.type)
    || target.data?.towable === true
    || target.data?.fractureChunk === true
    || target.data?.bulkHaul === true;
}

function selectNow(record, time) {
  return {
    selected: record,
    memory: {
      selectedId: record && record.id,
      selectedSince: time,
      challengerId: null,
      challengerSince: null,
    },
  };
}

/**
 * Pure PQ-004 intent classifier. It names the selection grammar before ranking so callers and the
 * HUD can explain the same decision. Focus is an exact lease; a genuinely precise cursor paint is
 * next; route, turn-side anchor, hostile flyby, and tow context follow in that order.
 */
export function classifyMasslineIntent(player, candidates, opts = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const focus = candidateById(list, opts.focusId);
  if (focus) return contextRecord('hostile-flyby', focus.id, 'flyby-focus');

  const cursorPrecisionOf = typeof opts.cursorPrecisionOf === 'function'
    ? opts.cursorPrecisionOf : () => 0;
  let precise = null;
  let preciseValue = -Infinity;
  let runnerUpPrecision = -Infinity;
  for (const candidate of list) {
    const value = clamp01(finite(cursorPrecisionOf(candidate), 0));
    if (value > preciseValue || (value === preciseValue && precise && compareId(candidate.id, precise.id) < 0)) {
      runnerUpPrecision = preciseValue;
      precise = candidate;
      preciseValue = value;
    } else if (value > runnerUpPrecision) {
      runnerUpPrecision = value;
    }
  }
  const isUnambiguousPaint = precise
    && preciseValue >= PRECISE_CURSOR_THRESHOLD
    && (runnerUpPrecision < 0 || preciseValue - runnerUpPrecision >= PRECISE_CURSOR_SEPARATION);
  if (isUnambiguousPaint) {
    const id = isTowCandidate(precise) ? 'tow/salvage' : 'precision-pick';
    return contextRecord(id, precise.id, 'cursor-paint');
  }

  const route = candidateById(list, opts.routeId);
  if (route) return contextRecord('route-anchor', route.id, 'route-anchor');

  const turnIntent = finite(opts.turnIntent, 0);
  if (Math.abs(turnIntent) >= 0.2) {
    let bestAnchor = null;
    let bestAlignment = -Infinity;
    for (const candidate of list) {
      if (!isMassiveAnchor(candidate)) continue;
      const alignment = candidateIntentAlignment(player, candidate, opts.intentDir);
      if (alignment > bestAlignment
          || (alignment === bestAlignment && bestAnchor && compareId(candidate.id, bestAnchor.id) < 0)) {
        bestAnchor = candidate;
        bestAlignment = alignment;
      }
    }
    if (bestAnchor && bestAlignment >= 0.62) {
      return contextRecord('massive-anchor-sling', null, 'turn-side-anchor');
    }
  }

  const isHostile = typeof opts.isHostile === 'function' ? opts.isHostile : () => false;
  const hostile = list.find((candidate) => isHostile(candidate));
  if (hostile) return contextRecord('hostile-flyby', null, 'closing-hostile');

  const tow = list.find(isTowCandidate);
  if (tow) return contextRecord('tow/salvage', null, 'towable-present');
  return contextRecord('precision-pick', null, 'general-pick');
}

/**
 * Pure Schmitt-style candidate memory. A challenger must beat the visible candidate by a margin
 * for 200 ms. Exact leases, precise paint, invalidation, and deliberate reversal may force an
 * immediate switch so hysteresis never feels like input lag.
 */
export function stabilizeMasslineSelection(ranked, previousMemory, now, opts = {}) {
  const list = Array.isArray(ranked) ? ranked.filter(Boolean) : [];
  if (!list.length) return { selected: null, memory: null };
  const time = finite(now, 0);
  const forceId = opts.forceId;
  const forced = forceId != null ? list.find((record) => record.id === forceId) : null;
  const eligible = list.filter((record) => record.score > 0);
  const best = forced || eligible[0] || list[0];
  const previous = previousMemory && previousMemory.selectedId != null
    ? list.find((record) => record.id === previousMemory.selectedId)
    : null;

  if (!previous || previous.score <= 0 || opts.forceSwitch === true || forced) {
    return selectNow(best, time);
  }
  if (best.id === previous.id) {
    return {
      selected: previous,
      memory: {
        selectedId: previous.id,
        selectedSince: finite(previousMemory.selectedSince, time),
        challengerId: null,
        challengerSince: null,
      },
    };
  }

  const margin = nonNegativeFinite(opts.switchMargin, 0.08);
  const holdS = nonNegativeFinite(opts.holdS, 0.2);
  if (!(best.score >= previous.score + margin)) {
    return {
      selected: previous,
      memory: {
        selectedId: previous.id,
        selectedSince: finite(previousMemory.selectedSince, time),
        challengerId: null,
        challengerSince: null,
      },
    };
  }

  const sameChallenger = previousMemory.challengerId === best.id;
  const challengerSince = sameChallenger
    ? finite(previousMemory.challengerSince, time)
    : time;
  if (time - challengerSince >= holdS) return selectNow(best, time);
  return {
    selected: previous,
    memory: {
      selectedId: previous.id,
      selectedSince: finite(previousMemory.selectedSince, time),
      challengerId: best.id,
      challengerSince,
    },
  };
}

/**
 * Normalise an intent vector and read the [0,1] alignment of the target bearing against it.
 * Absent, zero-length, or non-finite intent reads as not-present (legacy scoring path).
 */
function readIntentAlignment(intentDir, dx, dz, distance) {
  if (!intentDir || typeof intentDir !== 'object') return { present: false, alignment: 0.5 };
  const ix = finite(intentDir.x, 0);
  const iz = finite(intentDir.z, 0);
  const len = Math.hypot(ix, iz);
  if (!(len > 1e-9)) return { present: false, alignment: 0.5 };
  const dot = (dx / distance) * (ix / len) + (dz / distance) * (iz / len);
  return { present: true, alignment: clamp01((dot + 1) / 2) };
}

/**
 * Rank candidate targets by massline score, best first. Pure; does not mutate the input array
 * (returns a new sorted array of score records).
 *
 * @param {object} player
 * @param {Array<object>} candidates
 * @param {object} [opts]  - forwarded to scoreMasslineTarget for each candidate. May also pass
 *   opts.isHostile(target) -> boolean and/or opts.isLatched(target) -> boolean to let the caller
 *   resolve hostility and current-latch status per-candidate (both optional).
 * @returns {Array<object>} sorted score records ({id, score, rating, reasons}), descending.
 */
export function rankMasslineTargets(player, candidates, opts = {}) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const isHostileFn = typeof opts.isHostile === 'function' ? opts.isHostile : null;
  const isLatchedFn = typeof opts.isLatched === 'function' ? opts.isLatched : null;
  const isObstructedFn = typeof opts.isObstructed === 'function' ? opts.isObstructed : null;
  const ownershipOfFn = typeof opts.ownershipOf === 'function' ? opts.ownershipOf : null;
  const reachAllowanceOfFn = typeof opts.reachAllowanceOf === 'function' ? opts.reachAllowanceOf : null;
  const cursorPrecisionOfFn = typeof opts.cursorPrecisionOf === 'function' ? opts.cursorPrecisionOf : null;
  const out = [];
  for (const c of candidates) {
    const subOpts = { ...opts };
    if (isHostileFn) subOpts.hostile = !!isHostileFn(c);
    if (isLatchedFn) subOpts.currentlyLatched = !!isLatchedFn(c);
    if (isObstructedFn) subOpts.obstructed = !!isObstructedFn(c);
    if (ownershipOfFn) {
      const o = ownershipOfFn(c);
      if (typeof o === 'string') subOpts.ownership = o;
    }
    if (reachAllowanceOfFn) {
      const a = reachAllowanceOfFn(c);
      if (Number.isFinite(a) && a >= 0) subOpts.reachAllowance = a;
    }
    if (cursorPrecisionOfFn) subOpts.cursorPrecision = clamp01(finite(cursorPrecisionOfFn(c), 0));
    const rec = scoreMasslineTarget(player, c, subOpts);
    if (rec) out.push(rec);
  }
  // Deterministic sort: score desc, then id asc (stable across equal scores so reruns hash-equal).
  out.sort((a, b) => (b.score - a.score) || compareId(a.id, b.id));
  return out;
}

// ---- factor scorers (each 0..1) ----

// Swing geometry: how perpendicular is the target's motion to the line? A purely tangential
// (perpendicular) catch is the ideal slingshot — you convert all that sideways speed into a whip.
// A radial catch (flying straight at/away from you) has nothing to swing on. Measured as
// |tangential| / max(|relative|, floor) so a SLOW but purely-tangential target still scores its
// geometry, but a STATIC target scores 0 (no swing to convert).
function scoreSwingGeometry(player, target, dx, dz, distance) {
  const pvx = finite(player.vel && player.vel.x, 0);
  const pvz = finite(player.vel && player.vel.z, 0);
  const tvx = finite(target.vel && target.vel.x, 0);
  const tvz = finite(target.vel && target.vel.z, 0);
  const rvx = pvx - tvx;
  const rvz = pvz - tvz;
  const rel = Math.hypot(rvx, rvz);
  if (rel < 1e-6) return 0;                     // static catch — nothing to swing on
  const lineUnit = distance > 1e-9 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 };
  // 2D cross = tangential magnitude (unsigned for scoring).
  const tangential = Math.abs(rvx * lineUnit.z - rvz * lineUnit.x);
  return clamp01(tangential / rel);             // 1 = perfectly perpendicular, 0 = purely radial
}

// Mass band: sweet spot in the middle; penalize at both extremes. Below MASS_LIGHT_CEIL is barely
// an anchor (drone/debris whips away); above MASS_IDEAL_HI the target barely budges (still a usable
// anchor but less satisfying). Returns 0..1.
function scoreMass(target) {
  const mass = positiveFinite(target && target.mass, 0);
  if (mass <= 0) {
    // No mass data (some fixtures). Neutral — don't reward or penalize.
    return 0.5;
  }
  if (mass < MASS_LIGHT_CEIL) return 0.1;       // too light: yanks free
  if (mass < MASS_IDEAL_LO) return lerp(0.1, 0.9, (mass - MASS_LIGHT_CEIL) / (MASS_IDEAL_LO - MASS_LIGHT_CEIL));
  if (mass <= MASS_IDEAL_HI) return 1.0;        // ideal anchor band
  // Heavy tail: gradually decay but never to 0 — a capital ship is still a fine anchor, just stolid.
  return clamp01(1.0 - 0.4 * (mass - MASS_IDEAL_HI) / MASS_IDEAL_HI);
}

// Range comfort: ideal mid-band, penalize at the extremes. Too close = snap risk; too far = edge of
// break. Returns 0..1.
function scoreRangeComfort(distance, maxRange) {
  const r = clamp01(distance / maxRange);
  if (r < RANGE_FLOOR) return 0.2;              // too close — no swing room
  if (r > RANGE_CEIL) return 0.2;               // edge of break
  if (r >= RANGE_IDEAL_LO && r <= RANGE_IDEAL_HI) return 1.0;
  if (r < RANGE_IDEAL_LO) return lerp(0.2, 1.0, (r - RANGE_FLOOR) / (RANGE_IDEAL_LO - RANGE_FLOOR));
  return lerp(1.0, 0.2, (r - RANGE_IDEAL_HI) / (RANGE_CEIL - RANGE_IDEAL_HI));
}

// ---- helpers ----

function ratingFor(score) {
  if (score >= RATING_CLEAN) return 'clean';
  if (score >= RATING_GOOD) return 'good';
  if (score >= RATING_ROUGH) return 'rough';
  return 'poor';
}

function zero(id, reason) {
  return { id, score: 0, rating: 'out', reasons: { gate: reason } };
}

// T03 gate record: same shape as zero() but with the gate's own rating so a consumer can tell
// "not a candidate at all" ('out') from "physically blocked" ('blocked') from "yours/protected"
// ('protected') without parsing prose.
function gated(id, rating, reason) {
  return { id, score: 0, rating, reasons: { gate: reason } };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

function finite(v, fb) { return Number.isFinite(v) ? v : fb; }

function positiveFinite(v, fb) {
  return Number.isFinite(v) && v > 0 ? v : fb;
}

function nonNegativeFinite(v, fb) {
  return Number.isFinite(v) && v >= 0 ? v : fb;
}

function compareId(a, b) {
  // Stable, type-tolerant comparison so the sort is deterministic regardless of id type.
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
