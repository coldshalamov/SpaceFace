// contractClauses.js — BP-12 packet COLLATERAL_AND_CLAUSES ("Contract Fine Print") — SYSTEM,
// GENERALISED into THE mission condition observer (design/PHYSICAL_PLAY_GRAMMAR.md §9.9.1).
//
// WHAT CHANGED AND WHY. This system used to allow exactly five fine-print clauses on three events
// under a hardcoded allowlist. That allowlist was the right discipline attached to too small a
// vocabulary, and it was the only place in the game where a mission could express a term at all —
// so eleven mission types collapsed onto eleven verbs and the reward loop could not see the physics.
// It is now ONE generic observer over N terms:
//   • the subscription list is DERIVED from the catalogs (OBSERVED_CONTRACT_TERM_EVENTS), not typed
//     out here, so authoring a term on an already-emitted event needs no system edit;
//   • `attachClauses` (the 35% fine-print treat) is unchanged and untouched, and
//     `attachConditions` beside it is the same discipline grown to N risk-tiered physical terms;
//   • both kinds of term ride in ONE `mission.clauses` array, settle through ONE settlement
//     function, and render through the ONE station-dossier tag row that already existed.
// The per-tick half of the language — predicates over live physical state rather than events —
// lives in missions.update()'s `_evaluateMissionConditions`, and both halves count through the same
// shared tally in src/data/missionConditions.js so they cannot drift.
//
// Evaluates contract terms against events that ALREADY FIRE, and on breach emits a
// `contract:clauseBroken` intent for the missions layer to consume as the existing fail/penalty.
// The collateral forfeit is the SHIPPED path (missions.collateral_cr, forfeit on fail) — this system
// never forfeits itself (ONE penalty path; double-penalizing is the named failureMode).
//
// CRITICAL DISCIPLINE (enforced structurally):
//   • ATTACH is seeded via the offer's existing seed stream (hash32(seed, offerId, 'clause')). A
//     clause-free offer behaves EXACTLY as today (no clause ⇒ no observable difference).
//   • Only terms whose `event` is in the observed set are ever attached or evaluated. A term a system
//     can't observe is FORBIDDEN (the named failureMode) — attachClauses/attachConditions filter them
//     out, and check-mission-conditions.mjs additionally proves each condition event has a live
//     emitter in src/, because an unobservable `require` is a contract the player cannot ever settle.
//   • Breach fires ONCE per clause (flagged on the instance), then emits `contract:clauseBroken`
//     { missionId, clauseId, event }. The missions layer routes that through its existing fail path.
//     This system NEVER writes credits/cargo/rep (single-writer honored).
//   • HONOR bonus is settled synchronously by missions before payout/removal. This observer marks
//     breaches; its completion listener is an explicitly guarded legacy-check fallback because a
//     live completed instance has already left the canonical list.
//
// Missions is the canonical settlement owner; this observer only reads active instances and emits
// breach intents. Economy/factions/cargo authority remains untouched.
// Budget: spawn:none · voice: one 'comms' line on breach · draw:none.

import {
  CONTRACT_CLAUSES,
  OBSERVED_CLAUSE_EVENTS,
  OBSERVED_CONTRACT_TERM_EVENTS,
  CLAUSE_IDS,
  contractTermById,
} from '../data/contractClauses.js';
import {
  MISSION_CONDITIONS,
  MISSION_CONDITION_IDS,
  MISSION_CONDITION_EVENTS,
  serializableMissionCondition,
  tallyMissionCondition,
} from '../data/missionConditions.js';
import { MISSION_TYPES } from '../data/missions.js';
import { massline2Flag } from '../data/featureFlags.js';
import { hash32, mulberry32 } from '../core/rng.js';

const SET_OBSERVED = new Set(OBSERVED_CLAUSE_EVENTS);
const SET_CONDITION_OBSERVED = new Set(MISSION_CONDITION_EVENTS);
const ATTACH_PROB = 0.35; // ~35% of qualifying offers carry a clause (seeded; low enough to be a treat)
const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));

// How often a generated board offer carries a physical condition, and how many it may carry at once.
// A condition is the interesting half of a contract, so this is deliberately higher than the
// fine-print ATTACH_PROB — but never certain, because "every job has terms" is its own monotony.
const CONDITION_ATTACH_PROB = Object.freeze([0.20, 0.34, 0.48, 0.62, 0.72]); // indexed by risk tier
const CONDITION_MAX_PER_OFFER = 2;
const CONDITION_SECOND_PROB = 0.30;

/**
 * attachClauses(offer, seed) -> offer with an optional `clauses: [{id, event, label, prose, rewardMult}]`
 * array, or the offer unchanged if no clause attaches. SEEDED via hash32(seed, offer.id, 'clause').
 *
 * A clause attaches only when:
 *   1. the seeded roll beats ATTACH_PROB (clause-free is the common case — offers behave as today),
 *   2. the clause's event is in OBSERVED_CLAUSE_EVENTS (a clause a system can't observe is forbidden),
 *   3. the clause is APPROPRIATE for the offer's type (e.g. no_kills fits combat/escort, not cargo).
 * PURE over its inputs; deterministic per (seed, offerId).
 */
export function attachClauses(offer, seed) {
  if (!offer || !offer.id) return offer;
  const rng = mulberry32(hash32(seed, offer.id, 'clause') >>> 0);
  if (rng() > ATTACH_PROB) return offer; // clause-free (the common case — no observable difference)

  // Candidate clauses: observed-event only, and type-appropriate.
  const candidates = CLAUSE_IDS
    .map((id) => CONTRACT_CLAUSES[id])
    .filter((c) => c && SET_OBSERVED.has(c.event) && clauseFitsOffer(c, offer));
  if (!candidates.length) return offer;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const clauses = [{
    id: pick.id, event: pick.event, label: pick.label, prose: pick.prose, rewardMult: pick.rewardMult,
  }];
  return { ...offer, clauses };
}

// ── GENERALISED ATTACHMENT: N physics conditions over the events that exist ───────────────────
// This is `attachClauses` grown up (grammar §9.9.1). Same three-part discipline — seeded from the
// offer's own stream, filtered against an observed-event allowlist, gated on type appropriateness —
// but the allowlist is now derived from the catalog instead of a hardcoded triple, the pick is
// risk-tiered instead of a flat coin, and an offer may carry more than one term.

/** Terms that regulate the same physical quantity must not stack on one offer. */
function conditionGroupOf(condition) {
  if (condition.id === 'steady_hands' || condition.id === 'quiet_approach') return 'speed';
  return condition.id;
}

function conditionAttachable(condition, offer, riskTier, ctx, takenIds) {
  if (!condition || takenIds.has(condition.id)) return false;
  if (!Array.isArray(condition.appliesTo) || !condition.appliesTo.includes(offer.type)) return false;
  if (riskTier < (condition.minRisk || 0)) return false;
  // The allowlist, generalised: a term whose event nothing emits is never attached (the named
  // failureMode of the original packet, preserved verbatim across the generalisation).
  if (condition.event && !SET_CONDITION_OBSERVED.has(condition.event)) return false;
  // A `require` term whose verb is switched off by a feature profile would be unsatisfiable.
  if (condition.requiresFeature && !massline2Flag(condition.requiresFeature)) return false;
  if (typeof condition.fits === 'function' && !condition.fits(offer, ctx || {})) return false;
  return true;
}

/**
 * attachConditions(offer, seed, ctx) -> offer with 0..2 physics conditions appended to `offer.clauses`,
 * or the offer unchanged. SEEDED via hash32(seed, offer.id, 'condition') — a condition-free offer is
 * byte-identical to today, so nothing that does not draw a term can move a golden.
 *
 * `ctx` supplies the world facts an attach gate may need without importing them here:
 *   isFragile(commodityId) -> boolean
 */
export function attachConditions(offer, seed, ctx = {}) {
  if (!offer || !offer.id || !offer.type) return offer;
  const riskTier = Math.max(0, Math.min(4, Math.round(Number(offer.riskTier) || 0)));
  const rng = mulberry32(hash32(seed, offer.id, 'condition') >>> 0);
  if (rng() > CONDITION_ATTACH_PROB[riskTier]) return offer;

  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  const taken = new Set(existing.map((row) => row && row.id).filter(Boolean));
  let pool = MISSION_CONDITION_IDS
    .map((id) => MISSION_CONDITIONS[id])
    .filter((c) => conditionAttachable(c, offer, riskTier, ctx, taken));
  if (!pool.length) return offer;

  const picked = [pool[Math.floor(rng() * pool.length)]];
  if (picked.length < CONDITION_MAX_PER_OFFER && rng() < CONDITION_SECOND_PROB) {
    const groups = new Set(picked.map(conditionGroupOf));
    pool = pool.filter((c) => !picked.includes(c) && !groups.has(conditionGroupOf(c)));
    if (pool.length) picked.push(pool[Math.floor(rng() * pool.length)]);
  }

  const rows = picked.map((c) => serializableMissionCondition(c.id)).filter(Boolean);
  if (!rows.length) return offer;
  return { ...offer, clauses: [...existing, ...rows] };
}

/** Is a clause appropriate for an offer's type? (cargo runs don't get no_kills; escorts can.) */
function clauseFitsOffer(clause, offer) {
  const t = offer.type;
  if (clause.id === 'no_kills') {
    // no_kills is meaningful for combat/escort/patrol/bounty — types where kills are expected.
    return t === 'escort' || t === 'patrol_clear' || t === 'bounty_hunt';
  }
  if (clause.id === 'rescue_priority') {
    return t === 'escort' || t === 'passenger_transport';
  }
  if (clause.id === 'cargo_intact' || clause.id === 'no_scan') {
    // cargo/smuggling runs care about scans; pure combat types don't haul scan-relevant cargo.
    return t === 'cargo_delivery' || t === 'smuggling_run' || t === 'bulk_trade' || t === 'salvage_retrieval';
  }
  if (clause.id === 'time_limit') return true; // any type can carry a deadline
  return false;
}

// ── registry SYSTEMS-only entry (event-driven; one breach voice line; never writes credits) ───

export const contractClausesSystem = {
  name: 'contractClauses',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._helpers = ctx && ctx.helpers;
    this._onAccept = (p) => this._onMissionAccepted(p);
    this._onLegacyComplete = (p) => this._onLegacyMissionCompleted(p);
    // ONE generic observer over N events. The subscription list is DERIVED from the two catalogs
    // rather than written out here, so authoring a condition on a new (already-emitted) event needs
    // no system edit — which is the whole point of the generalisation (grammar §9.9.1).
    this._termHandlers = new Map();
    if (this._bus && this._bus.on) {
      for (const eventName of OBSERVED_CONTRACT_TERM_EVENTS) {
        const handler = (p) => this._evaluate(eventName, p);
        this._termHandlers.set(eventName, handler);
        this._bus.on(eventName, handler);
      }
      this._bus.on('mission:accepted', this._onAccept);
      // Compatibility only for the isolated clause checker. Canonical missions includes rewardCr
      // after settling clauses and removes the active instance before this event, so live play can
      // never enter the fallback or emit a second honor.
      this._bus.on('mission:completed', this._onLegacyComplete);
    }
  },

  // Track escortee ids + deadlines for clause predicates that need instance context.
  _onMissionAccepted(p) {
    const state = this._state;
    if (!state || !p || !p.missionId) return;
    const m = this._findActive(p.missionId);
    if (!m || !m.clauses || !m.clauses.length) return;
    // Seed the per-clause breach flags + any deadline the clause needs.
    if (!m._clauseState) m._clauseState = {};
    for (const c of m.clauses) {
      if (c.id === 'time_limit' && m.deadline_s) {
        m._clauseState.time_limit = { deadline_s: m.deadline_s, breached: false };
      }
    }
  },

  _evaluate(eventName, payload) {
    const state = this._state;
    if (!state) return;
    const active = (state.missions && state.missions.active) || [];
    const playerId = state.playerId || (state.player && state.player.id);
    for (const m of [...active]) {
      if (!m || !m.clauses || !m.clauses.length) continue;
      if (m._clauseState && m._clauseState._completed) continue;
      for (const c of m.clauses) {
        if (c.event !== eventName) continue;
        const key = c.id;
        const runtime = m._clauseState && m._clauseState[key];
        if (runtime && (runtime.breached || runtime.satisfied)) continue; // fire once
        const termDef = contractTermById(c.id);
        if (!termDef) continue;
        const ctx = {
          playerId,
          simTime: state.simTime || 0,
          escorteeId: m._escorteeId || null,
          deadline_s: (m._clauseState && m._clauseState.time_limit && m._clauseState.time_limit.deadline_s) || m.deadline_s || null,
          mission: m,
        };
        // Legacy fine-print clause: one predicate, fires once, always fails the contract.
        if (typeof termDef.breachOn === 'function') {
          let breached = false;
          try { breached = !!termDef.breachOn(payload, ctx); } catch (_) { breached = false; }
          if (!breached) continue;
          if (!m._clauseState) m._clauseState = {};
          m._clauseState[key] = { breached: true, at: state.simTime || 0 };
          this._emitBreach(m, c, eventName);
          continue;
        }
        // Physics condition: an N-count predicate with forbid/require semantics.
        this._scoreCondition(m, termDef, payload, ctx, eventName);
      }
    }
  },

  /**
   * Score one physics-condition occurrence. Counting goes through the shared pure tally in
   * src/data/missionConditions.js, which the per-tick predicate slot in missions.update() also uses,
   * so an event term and a tick term can never drift apart in how they count, latch, or settle.
   */
  _scoreCondition(mission, def, payload, ctx, eventName) {
    let matched = true;
    if (typeof def.match === 'function') {
      try { matched = !!def.match(payload, ctx); } catch (_) { matched = false; }
    }
    if (!matched) return false;
    const outcome = tallyMissionCondition(mission, def, ctx.simTime);
    if (outcome === 'ignored') return false;
    const bus = this._bus;
    if (outcome === 'progress') {
      if (bus && bus.emit) {
        // Visible progress on a multi-count term — a counter the player can watch climb.
        bus.emit('mission:conditionProgress', {
          missionId: mission.id, conditionId: def.id, kind: def.kind, label: def.label,
          count: (mission._clauseState[def.id] || {}).count || 0,
          target: Math.max(1, Math.round(Number(def.count) || 1)),
        });
        bus.emit('mission:updated', { missionId: mission.id });
      }
      return false;
    }
    if (outcome === 'satisfied') {
      if (bus && bus.emit) {
        bus.emit('mission:conditionSatisfied', {
          missionId: mission.id, conditionId: def.id, label: def.label, blocking: def.blocking === true,
        });
        bus.emit('toast', { text: def.satisfiedText || `${def.label}: done.`, kind: 'success', ttl: 3 });
        bus.emit('mission:updated', { missionId: mission.id });
      }
      return true;
    }
    this._emitConditionBreach(mission, def, eventName);
    return true;
  },

  /**
   * A forbid condition tripped. `onBreach: 'fail'` reuses the SHIPPED single penalty intent so the
   * canonical missions fail path still owns collateral, rep, cleanup and receipts — this system
   * never writes credits. `onBreach: 'forfeit'` keeps the contract alive and only drops the premium
   * (settleContractClauses reads the same breached flag), so the player is told and keeps playing.
   */
  _emitConditionBreach(mission, def, eventName) {
    if (!this._bus || !this._bus.emit) return;
    const line = def.breachText || `Contract term broken: ${def.label}.`;
    this._bus.emit('mission:conditionBroken', {
      missionId: mission.id, conditionId: def.id, event: eventName || null,
      label: def.label, onBreach: def.onBreach || 'fail',
    });
    if (def.onBreach === 'forfeit') {
      // One voice, one line, at the moment it happens. A hidden condition is a bug.
      const helpers = this._helpers || {};
      let said = false;
      if (helpers.voice && typeof helpers.voice.say === 'function') {
        said = helpers.voice.say({ channel: 'comms', text: line, kind: 'clauseBreach' });
      }
      if (!said) this._bus.emit('toast', { text: line, kind: 'warn', ttl: 4 });
      this._bus.emit('mission:updated', { missionId: mission.id });
      return;
    }
    this._emitBreach(mission, { id: def.id, label: def.label }, eventName, line);
  },

  _onLegacyMissionCompleted(payload) {
    if (!payload || !payload.missionId || Number.isFinite(payload.rewardCr)) return;
    const mission = this._findActive(payload.missionId);
    if (!mission || !Array.isArray(mission.clauses) || !mission.clauses.length) return;
    if (!mission._clauseState) mission._clauseState = {};
    if (mission._clauseState._legacyHonored) return;
    mission._clauseState._legacyHonored = true;
    for (const clause of mission.clauses) {
      const runtime = mission._clauseState[clause.id];
      const breached = !!(runtime && runtime.breached);
      // A `require` condition that was never satisfied earns nothing — it is not honored either.
      const def = contractTermById(clause.id);
      if (def && def.kind === 'require' && !(runtime && runtime.satisfied)) continue;
      if (!breached && this._bus && this._bus.emit) {
        this._bus.emit('contract:clauseHonored', {
          missionId: mission.id,
          clauseId: clause.id,
          rewardMult: clause.rewardMult,
        });
      }
    }
  },

  _emitBreach(m, clause, eventName, breachText = null) {
    if (!this._bus || !this._bus.emit) return;
    // The ONE penalty intent — the missions layer routes this through its shipped collateral-forfeit
    // fail path. This system NEVER writes credits/cargo/rep itself.
    this._bus.emit('contract:clauseBroken', {
      missionId: m.id, clauseId: clause.id, event: eventName, label: clause.label,
    });
    // One comms line on breach, through the arbiter.
    const helpers = this._helpers || {};
    const line = breachText || `Contract clause broken: ${clause.label}.`;
    if (helpers.voice && typeof helpers.voice.say === 'function') {
      const said = helpers.voice.say({ channel: 'comms', text: line, kind: 'clauseBreach' });
      if (!said) this._bus.emit('toast', { text: line, kind: 'warn', ttl: 3 });
    }
  },

  _findActive(missionId) {
    const active = (this._state.missions && this._state.missions.active) || [];
    return active.find((m) => m && m.id === missionId) || null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._termHandlers) {
        for (const [eventName, handler] of this._termHandlers) this._bus.off(eventName, handler);
      }
      if (this._onAccept) this._bus.off('mission:accepted', this._onAccept);
      if (this._onLegacyComplete) this._bus.off('mission:completed', this._onLegacyComplete);
    }
    if (this._termHandlers) this._termHandlers.clear();
    this._termHandlers = null;
    this._onAccept = null;
    this._onLegacyComplete = null;
  },
};

export default contractClausesSystem;
