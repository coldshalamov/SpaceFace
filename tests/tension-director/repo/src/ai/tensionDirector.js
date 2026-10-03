/** Session-scale controller: intention is not evidence.
 * Owns a serializable model; consumes normalized facts and read-only observations.
 * No engine imports, global state, RNG draws, wall clocks, entities, or presentation.
 */
import {
  createTensionWindow, addTensionSignal, summarizeTensionWindow, validateTensionWindow,
} from './tensionWindow.js';
import { TENSION_POLICY_SCHEMA } from './tensionPolicy.js';

export const TENSION_STATE_SCHEMA = 'spaceface.tension-director.v1';
export const TENSION_PHASES = Object.freeze(['quiet', 'opportunity', 'build', 'peak', 'aftermath', 'recovery']);
export const TENSION_LIMITS = Object.freeze({
  traceCapacity: 192, dedupeCapacity: 64, recentShapeCapacity: 8,
  decisionPeriodS: 1, policyLeaseS: 3, maxClockGapS: 3,
  chapterS: 1800, recoveryMinS: 90, reentryGraceS: 20,
  starvationNoticeGapS: 120, diagnosticPeriodS: 5,
});
const MOTIFS = Object.freeze({
  voyage: Object.freeze({ quiet: 65, opportunity: 115, build: 105, peak: 60, aftermath: 85 }),
  discovery: Object.freeze({ quiet: 85, opportunity: 155, build: 85, peak: 45, aftermath: 100 }),
  hunt: Object.freeze({ quiet: 50, opportunity: 85, build: 125, peak: 75, aftermath: 90 }),
});
const PROFILE_CAP = Object.freeze({ casual: 0.58, standard: 0.70, veteran: 0.78, ironman: 0.78 });
const TARGETS = Object.freeze({ quiet: 0.08, opportunity: 0.23, build: 0.46, peak: 0.60, aftermath: 0.10, recovery: 0.03 });
const PHASE_SET = new Set(TENSION_PHASES);
const FACTS = new Set(['incoming', 'combat', 'mining', 'trade', 'tether', 'exploration',
  'salvage', 'mission', 'offered', 'delivered', 'resolved', 'defeat', 'kill']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const unit = (v, fallback = 0) => clamp(finite(v, fallback), 0, 1);
const count = (v) => Math.min(Number.MAX_SAFE_INTEGER, v + 1);
const clone = (v) => JSON.parse(JSON.stringify(v));
const shortString = (v) => typeof v === 'string' ? v.slice(0, 96) : '';
const approach = (v, target, rise, fall) => v + clamp(target - v, -fall, rise);

function freshState(now) {
  return {
    schema: TENSION_STATE_SCHEMA,
    lastUpdateAt: now, lastDecisionAt: now - 1, lastFactAt: now,
    activeS: 0, phase: 'quiet', phaseEnteredS: 0, phaseEnteredAt: now, phaseGoalS: 65,
    arc: 0, chapter: 0, act: 0, motif: 'voyage', recentMotifs: ['voyage'],
    confidence: 0, fatigue: 0, observed: 0, command: 0.08,
    burst: 0, burstAt: now, lastSpikeAt: -1e9, lastDamageAt: -1e9,
    lastCombatAt: -1e9, lastDefeatAt: -1e9, lastResolutionAt: -1e9,
    lastDeliveryAt: now, lastOpportunityAt: now,
    reentryUntilS: 0, lastStarvationAtS: -1e9, lastTraceAtS: -1e9,
    missedBuilds: 0, starvedS: 0, sequence: 0, factCount: 0,
    ignoredFacts: 0, clockGapCount: 0, skippedClockS: 0,
    suspension: null, window: createTensionWindow(),
    recentShapes: [], dedupe: [], trace: Array(TENSION_LIMITS.traceCapacity).fill(null),
    traceHead: 0, traceCount: 0, policy: null, metrics: {},
  };
}

function phaseGoal(model, phase) {
  if (phase === 'recovery') return TENSION_LIMITS.recoveryMinS;
  const base = MOTIFS[model.motif][phase];
  // The three ten-minute acts lengthen commitment and then buy a longer release.
  // They do not unlock stats, invent content, or raise danger just because time passed.
  const actDelta = phase === 'build' ? model.act * 10 : phase === 'aftermath' ? model.act * 12 : 0;
  const fatigueDelta = phase === 'quiet' || phase === 'aftermath' ? Math.round(model.fatigue * 45) : 0;
  return base + actDelta + fatigueDelta;
}

function pickMotif(model, history) {
  const total = Math.max(1, history.occupiedVerbBins);
  const action = history.medium;
  const scores = {
    voyage: 0.45 + action.exploration / total * 0.25,
    discovery: 0.35 + history.dominance * 0.35 + (action.mining + action.trade + action.tether) / total * 0.2,
    hunt: 0.35 + action.combat / total * 0.55 + model.confidence * 0.12 - model.fatigue * 0.3,
  };
  for (let i = 0; i < model.recentMotifs.length; i++) {
    scores[model.recentMotifs[i]] -= 0.45 / (model.recentMotifs.length - i);
  }
  let chosen = 'voyage';
  // Authored order is the tie-break, never locale or hash-map iteration order.
  for (const name of ['discovery', 'hunt']) if (scores[name] > scores[chosen]) chosen = name;
  return chosen;
}

function trace(model, row) {
  model.trace[model.traceHead] = row;
  model.traceHead = (model.traceHead + 1) % TENSION_LIMITS.traceCapacity;
  model.traceCount = Math.min(TENSION_LIMITS.traceCapacity, model.traceCount + 1);
  model.lastTraceAtS = model.activeS;
}

function normalizeSensors(input) {
  const s = input || {};
  return {
    eligible: s.eligible !== false,
    suspension: shortString(s.suspension) || 'inactive',
    hull: unit(s.hull, 1), shield: unit(s.shield, 1),
    nearbyCombat: clamp(finite(s.nearbyCombat), 0, 16),
    liveCombat: clamp(finite(s.liveCombat), 0, 16),
    pendingCombat: clamp(finite(s.pendingCombat), 0, 64),
    pendingCivilian: clamp(finite(s.pendingCivilian), 0, 64),
    scanTruncated: s.scanTruncated === true,
    profile: Object.hasOwn(PROFILE_CAP, s.profile) ? s.profile : 'standard',
    recoveryStance: s.recoveryStance === true,
  };
}

export class TensionDirector {
  constructor({ now = 0, snapshot = null } = {}) {
    if (!Number.isFinite(now) || now < 0) throw new RangeError('tension: now must be finite and nonnegative');
    this.state = freshState(now);
    if (snapshot !== null) this.restore(snapshot);
  }

  /** Fact timestamps are assigned by the host from state.simTime, never trusted from payloads.
   * Optional token deduplicates semantic receipts (not damage packets). All storage is capped.
   */
  observe(now, fact) {
    const m = this.state;
    if (!Number.isFinite(now) || now < m.lastFactAt || now < 0 || !fact || !FACTS.has(fact.kind)) {
      m.ignoredFacts = count(m.ignoredFacts); return false;
    }
    const kind = fact.kind;
    const amount = fact.amount === undefined ? 1 : fact.amount;
    if (!Number.isFinite(amount) || amount <= 0) { m.ignoredFacts = count(m.ignoredFacts); return false; }
    const token = shortString(fact.token);
    if (token) {
      const key = `${kind}:${token}`;
      if (m.dedupe.includes(key)) return false;
      m.dedupe.push(key);
      if (m.dedupe.length > TENSION_LIMITS.dedupeCapacity) m.dedupe.shift();
    }
    m.lastFactAt = now;
    m.factCount = count(m.factCount);
    const channel = kind === 'kill' ? 'combat' : kind;
    addTensionSignal(m.window, now, channel, Math.min(4, amount));
    if (kind === 'incoming') {
      m.burst = Math.min(2, m.burst * Math.max(0, 1 - (now - m.burstAt) / 5) + Math.min(1, amount));
      m.burstAt = now;
      m.lastDamageAt = now;
      m.lastCombatAt = now;
      if (m.burst >= 0.30 || amount >= 0.22) m.lastSpikeAt = now;
      addTensionSignal(m.window, now, 'combat');
    }
    if (kind === 'combat' || kind === 'kill') m.lastCombatAt = now;
    if (kind === 'kill') m.confidence = Math.min(1, m.confidence + 0.06);
    if (kind === 'defeat') { m.lastDefeatAt = now; m.confidence = Math.max(0, m.confidence - 0.35); }
    if (kind === 'resolved' && fact.combat === true) m.lastResolutionAt = now;
    if (kind === 'delivered') m.lastDeliveryAt = now;
    if (kind === 'offered') m.lastOpportunityAt = now;
    if ((kind === 'offered' || kind === 'delivered') && shortString(fact.shape)) {
      const shape = shortString(fact.shape);
      if (m.recentShapes[m.recentShapes.length - 1] !== shape) {
        m.recentShapes.push(shape);
        if (m.recentShapes.length > TENSION_LIMITS.recentShapeCapacity) m.recentShapes.shift();
      }
    }
    return true;
  }

  /** At most one decision per simulation second. Large gaps rebase, never catch up a
   * backlog of dramatic beats. Call before the campaign encounter director.
   */
  advance(now, input = {}) {
    const m = this.state;
    if (!Number.isFinite(now) || now < 0) throw new RangeError('tension: invalid simulation time');
    if (now < m.lastUpdateAt) throw new RangeError('tension: simulation rewound; restore or reset explicitly');
    const s = normalizeSensors(input);
    const frameGap = now - m.lastUpdateAt;
    m.lastUpdateAt = now;
    if (!s.eligible) {
      m.suspension = s.suspension;
      m.lastDecisionAt = now; // no active-time accrual while docked, paused, in tutorial, or in an arena
      m.policy = { schema: TENSION_POLICY_SCHEMA, enabled: false, reason: s.suspension, issuedAt: now, validUntil: now };
      return null;
    }
    if (m.suspension !== null) {
      m.suspension = null;
      m.reentryUntilS = m.activeS + TENSION_LIMITS.reentryGraceS;
      // Preserve the clock: toggling a modal at the same simTime must not mint a second.
    }
    if (frameGap > TENSION_LIMITS.maxClockGapS) {
      m.clockGapCount = count(m.clockGapCount);
      m.skippedClockS += frameGap - 1;
      m.reentryUntilS = m.activeS + TENSION_LIMITS.reentryGraceS;
      m.lastDecisionAt = now - 1;
    }
    if (now - m.lastDecisionAt < TENSION_LIMITS.decisionPeriodS - 1e-8) {
      // Undocking/re-enabling can occur between one-second decisions. Publish a
      // protective lease immediately without minting active time or a decision;
      // otherwise an expired/disabled policy would expose the legacy spawn gate
      // for the fractional second before the next normal decision.
      if (m.activeS < m.reentryUntilS && m.policy?.enabled !== true) {
        m.policy = {
          schema: TENSION_POLICY_SCHEMA, enabled: true, issuedAt: now,
          validUntil: now + TENSION_LIMITS.policyLeaseS, sequence: m.sequence,
          phase: m.phase, rhythmPhase: 'quiet', motif: m.motif, chapter: m.chapter, act: m.act,
          target: 0.08, requested: m.command, observed: m.observed,
          allowCombat: false, allowMajor: false, combatRate: 0.15, civilianRate: 1,
          minGapS: 60, preference: 0, recentShapes: m.recentShapes.slice(), reason: 'reentry_grace',
        };
      }
      return null;
    }
    m.lastDecisionAt = now;
    if (m.sequence > 0) m.activeS += 1; // one second per decision, except the initial observation
    m.sequence = count(m.sequence);
    const history = summarizeTensionWindow(m.window, now);
    const chapter = Math.floor(m.activeS / TENSION_LIMITS.chapterS);
    const chapterChange = chapter !== m.chapter ? { previous: m.chapter, chapter } : null;
    m.chapter = chapter;
    m.act = Math.min(2, Math.floor((m.activeS % TENSION_LIMITS.chapterS) / 600));
    const combat = s.nearbyCombat > 0 || now - m.lastCombatAt <= 12;
    const recentDamage = unit(history.recent.incoming / 0.40);
    const danger = unit(0.45 * recentDamage + 0.30 * (1 - s.hull)
      + 0.10 * (1 - s.shield) + 0.15 * Math.min(1, s.nearbyCombat / 3));
    const measured = unit((combat ? 0.36 : 0) + 0.42 * recentDamage
      + 0.14 * Math.min(1, s.nearbyCombat / 3) + 0.08 * (1 - s.hull));
    m.observed = approach(m.observed, measured, 0.065, 0.028);
    m.fatigue = clamp(m.fatigue + (combat ? (0.35 + danger) / 200 : -1 / 110), 0, 1);
    const emergency = s.hull <= 0.25 || now - m.lastSpikeAt <= 5 || now - m.lastDefeatAt <= 90;
    const needsRecovery = emergency || s.recoveryStance || danger >= 0.64 || m.fatigue >= 0.88;
    const previous = m.phase;
    let reason = 'minimum_dwell';
    let next = m.phase;
    const age = m.activeS - m.phaseEnteredS;

    if (needsRecovery && m.phase !== 'recovery') {
      next = 'recovery';
      reason = emergency ? 'critical_player_state' : m.fatigue >= 0.88 ? 'sustained_load' : 'observed_distress';
    } else if (m.phase === 'recovery') {
      if (!needsRecovery && age >= TENSION_LIMITS.recoveryMinS && s.hull >= 0.50
        && danger < 0.40 && now - m.lastDamageAt >= 20 && m.fatigue < 0.45) {
        next = 'aftermath'; reason = 'recovery_earned';
      } else reason = 'recovery_protected';
    } else if (m.phase === 'quiet' && age >= m.phaseGoalS) {
      next = 'opportunity'; reason = 'breathing_room_delivered';
    } else if (m.phase === 'opportunity') {
      if (combat) { next = 'peak'; reason = 'world_delivered_combat'; }
      else if (age >= m.phaseGoalS) { next = 'build'; reason = 'commitment_window'; }
    } else if (m.phase === 'build') {
      if (combat) { next = 'peak'; m.missedBuilds = 0; reason = 'world_delivered_combat'; }
      else if (age >= m.phaseGoalS) {
        m.missedBuilds = Math.min(2, m.missedBuilds + 1);
        next = m.missedBuilds >= 2 ? 'aftermath' : 'opportunity';
        reason = 'no_delivered_conflict'; // never fabricate a peak because a timer expired
      }
    } else if (m.phase === 'peak') {
      if (age >= 20 && m.lastResolutionAt >= m.phaseEnteredAt && !combat) {
        next = 'aftermath'; reason = 'conflict_resolved';
      } else if (age >= 20 && !combat) {
        next = 'aftermath'; reason = 'contact_released';
      } else if (age >= m.phaseGoalS) {
        next = 'aftermath'; reason = 'peak_budget_spent';
      }
    } else if (m.phase === 'aftermath' && age >= m.phaseGoalS) {
      next = 'quiet'; reason = 'arc_complete';
      m.arc = count(m.arc);
      m.missedBuilds = 0;
      m.motif = pickMotif(m, history);
      m.recentMotifs.push(m.motif);
      if (m.recentMotifs.length > 3) m.recentMotifs.shift();
    }
    let phaseChange = null;
    if (next !== previous) {
      m.phase = next;
      m.phaseEnteredS = m.activeS;
      m.phaseEnteredAt = now;
      m.phaseGoalS = phaseGoal(m, next);
      phaseChange = { previous, phase: next, reason, simTime: now, activeS: m.activeS, arc: m.arc, motif: m.motif };
    }

    const ready = !needsRecovery && s.hull >= 0.50 && !s.scanTruncated && m.activeS >= m.reentryUntilS;
    const allowCombat = ready && (m.phase === 'opportunity' || m.phase === 'build' || m.phase === 'peak');
    const allowMajor = allowCombat && danger < 0.40 && m.fatigue < 0.55
      && (m.phase === 'build' || m.phase === 'peak') && m.motif !== 'discovery';
    const profileCap = PROFILE_CAP[s.profile];
    let target = TARGETS[m.phase];
    if (m.phase === 'build' || m.phase === 'peak') target += m.confidence * 0.10 + m.act * 0.025;
    target = clamp(target - m.fatigue * 0.12, 0.02, profileCap);
    if (!ready) target = Math.min(target, 0.08);
    m.command = approach(m.command, target, 0.018, 0.05);
    const preference = clamp((m.motif === 'discovery' ? 0.65 : m.motif === 'hunt' ? -0.60 : 0.15)
      + history.dominance * (history.medium.combat > 0 ? 0.10 : 0.25), -1, 1);
    const combatRate = allowCombat ? clamp(0.50 + m.command + (m.command - m.observed) * 0.25, 0.45, 1.25) : 0.15;
    const civilianRate = m.phase === 'peak' ? 0.65 : clamp(1.05 + preference * 0.25, 0.8, 1.3);
    // The existing tactical director also reads the published rhythm. Every
    // readiness veto must therefore hold respite there, not only at our spawn gate.
    const rhythmPhase = !ready || m.phase === 'recovery' ? 'quiet' : m.phase === 'opportunity' ? 'curiosity'
      : m.phase === 'build' ? 'tension' : m.phase === 'peak' ? 'violence' : m.phase;
    m.policy = {
      schema: TENSION_POLICY_SCHEMA, enabled: true, issuedAt: now, validUntil: now + TENSION_LIMITS.policyLeaseS,
      sequence: m.sequence, phase: m.phase, rhythmPhase, motif: m.motif, chapter: m.chapter, act: m.act,
      target, requested: m.command, observed: m.observed, allowCombat, allowMajor,
      combatRate, civilianRate, minGapS: m.phase === 'peak' ? 45 : m.phase === 'build' ? 40 : 60,
      preference, recentShapes: m.recentShapes.slice(),
    };

    // Dead-air diagnosis is conditional on permission + pending supply. Requested != spawned.
    const expected = allowCombat && m.phase === 'build' && !combat;
    m.starvedS = expected ? Math.min(3600, m.starvedS + 1) : Math.max(0, m.starvedS - 0.25);
    let starvation = null;
    if (expected && m.starvedS >= 45 && m.activeS - m.lastStarvationAtS >= TENSION_LIMITS.starvationNoticeGapS) {
      m.lastStarvationAtS = m.activeS;
      starvation = {
        reason: s.pendingCombat === 0 ? 'no_combat_supply' : 'combat_not_delivered',
        simTime: now, pendingCombat: s.pendingCombat, starvedS: m.starvedS,
        secondsSinceSpawn: Math.max(0, now - m.lastDeliveryAt),
      };
    }
    m.metrics = {
      stress: danger, fatigue: m.fatigue, combatObserved: combat,
      incoming30s: history.recent.incoming, distinctVerbs5m: history.distinctVerbs,
      verbEntropy5m: history.entropy, dominantVerbShare5m: history.dominance,
      offers30m: history.long.offered, spawns30m: history.long.delivered,
      resolutions30m: history.long.resolved, pendingCombat: s.pendingCombat,
      pendingCivilian: s.pendingCivilian, starvedS: m.starvedS, scanTruncated: s.scanTruncated,
    };
    const diagnostic = phaseChange !== null || starvation !== null
      || m.activeS - m.lastTraceAtS >= TENSION_LIMITS.diagnosticPeriodS;
    let row = null;
    if (diagnostic) {
      row = {
        sequence: m.sequence, simTime: now, activeS: m.activeS, phase: m.phase,
        reason, motif: m.motif, chapter: m.chapter, act: m.act, target,
        requested: m.command, observed: m.observed, stress: danger, fatigue: m.fatigue,
        allowCombat, allowMajor, spawns30m: history.long.delivered,
        offers30m: history.long.offered, starvedS: m.starvedS,
      };
      trace(m, row);
    }
    return { policy: m.policy, phaseChange, chapterChange, starvation, diagnostic: row };
  }

  inspect({ includeTrace = true } = {}) {
    const m = this.state;
    const rows = [];
    if (includeTrace) {
      const start = (m.traceHead - m.traceCount + TENSION_LIMITS.traceCapacity) % TENSION_LIMITS.traceCapacity;
      for (let i = 0; i < m.traceCount; i++) rows.push(m.trace[(start + i) % TENSION_LIMITS.traceCapacity]);
    }
    // Callers cannot mutate the controller through a debug inspector.
    return clone({ schema: m.schema, phase: m.phase, phaseAgeS: m.activeS - m.phaseEnteredS,
      phaseGoalS: m.phaseGoalS, activeS: m.activeS, arc: m.arc, chapter: m.chapter, motif: m.motif,
      policy: m.policy, metrics: m.metrics, counters: {
        decisions: m.sequence, facts: m.factCount, ignoredFacts: m.ignoredFacts,
        clockGaps: m.clockGapCount, skippedClockS: m.skippedClockS,
      }, trace: rows });
  }

  snapshot() { return clone(this.state); }

  restore(snapshot) {
    validateSnapshot(snapshot);
    // Canonical field allow-list: hostile/unknown top-level properties are not retained.
    const fresh = freshState(snapshot.lastUpdateAt);
    for (const key of Object.keys(fresh)) fresh[key] = clone(snapshot[key]);
    this.state = fresh;
    return this;
  }
}

function validateSnapshot(s) {
  if (!s || s.schema !== TENSION_STATE_SCHEMA || !PHASE_SET.has(s.phase)
    || !Object.hasOwn(MOTIFS, s.motif) || !validateTensionWindow(s.window)) {
    throw new TypeError('tension: invalid snapshot schema, phase, motif, or histogram');
  }
  const reference = freshState(0);
  for (const [key, value] of Object.entries(reference)) {
    if (!Object.hasOwn(s, key)) throw new TypeError(`tension: missing snapshot field ${key}`);
    if (typeof value === 'number' && (!Number.isFinite(s[key]) || Math.abs(s[key]) > Number.MAX_SAFE_INTEGER)) {
      throw new TypeError(`tension: nonfinite/out-of-range snapshot field ${key}`);
    }
  }
  for (const key of ['activeS', 'arc', 'chapter', 'act', 'sequence', 'factCount', 'ignoredFacts',
    'clockGapCount', 'traceHead', 'traceCount', 'missedBuilds']) {
    if (!Number.isSafeInteger(s[key]) || s[key] < 0) throw new TypeError(`tension: invalid counter ${key}`);
  }
  for (const key of ['confidence', 'fatigue', 'observed', 'command']) {
    if (s[key] < 0 || s[key] > 1) throw new TypeError(`tension: invalid unit field ${key}`);
  }
  if (s.lastUpdateAt < 0 || s.lastFactAt < 0 || s.lastDecisionAt > s.lastUpdateAt
    || s.phaseEnteredS < 0 || s.phaseEnteredAt < 0 || s.phaseEnteredS > s.activeS
    || s.reentryUntilS < 0 || s.burst < 0 || s.burst > 2 || s.starvedS < 0 || s.starvedS > 3600
    || s.skippedClockS < 0 || s.phaseGoalS < 1 || s.phaseGoalS > 3600
    || s.act > 2 || s.missedBuilds > 2 || s.traceHead >= TENSION_LIMITS.traceCapacity
    || s.traceCount > TENSION_LIMITS.traceCapacity || !Array.isArray(s.trace)
    || s.trace.length !== TENSION_LIMITS.traceCapacity) throw new TypeError('tension: invalid snapshot bounds');
  for (const [key, limit] of [['dedupe', 64], ['recentShapes', 8], ['recentMotifs', 3]]) {
    if (!Array.isArray(s[key]) || s[key].length > limit
      || Array.from(s[key]).some((v) => typeof v !== 'string' || v.length > 110)) throw new TypeError(`tension: invalid ${key}`);
  }
  if (s.recentMotifs.some((v) => !Object.hasOwn(MOTIFS, v))) throw new TypeError('tension: invalid motif history');
  if (s.suspension !== null && (typeof s.suspension !== 'string' || s.suspension.length > 96)) {
    throw new TypeError('tension: invalid suspension');
  }
  // Validate diagnostic/policy leaves too; nothing unbounded or executable enters a save.
  function boundedRecord(v, maxKeys = 32) {
    if (v === null) return true;
    if (typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > maxKeys) return false;
    return Object.values(v).every((leaf) => leaf === null || typeof leaf === 'boolean'
      || (typeof leaf === 'number' && Number.isFinite(leaf))
      || (typeof leaf === 'string' && leaf.length <= 128)
      || (Array.isArray(leaf) && leaf.length <= 8 && Array.from(leaf).every((x) => typeof x === 'string' && x.length <= 96)));
  }
  if (!boundedRecord(s.policy) || !boundedRecord(s.metrics) || !Array.from(s.trace).every((row) => boundedRecord(row))) {
    throw new TypeError('tension: invalid diagnostic or policy record');
  }
}
