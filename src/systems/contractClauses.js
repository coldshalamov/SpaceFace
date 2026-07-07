// contractClauses.js — BP-12 packet COLLATERAL_AND_CLAUSES ("Contract Fine Print") — SYSTEM.
//
// Evaluates contract clauses against the events missions ALREADY tracks, and on breach emits a
// `contract:clauseBroken` intent for the missions layer to consume as the existing fail/penalty.
// The collateral forfeit is the SHIPPED path (missions.collateral_cr, forfeit on fail) — this system
// never forfeits itself (ONE penalty path; double-penalizing is the named failureMode).
//
// CRITICAL DISCIPLINE (enforced structurally):
//   • ATTACH is seeded via the offer's existing seed stream (hash32(seed, offerId, 'clause')). A
//     clause-free offer behaves EXACTLY as today (no clause ⇒ no observable difference).
//   • Only clauses whose `event` is in OBSERVED_CLAUSE_EVENTS are ever attached or evaluated. A clause
//     a system can't observe is FORBIDDEN (the named failureMode) — attachClauses filters them out.
//   • Breach fires ONCE per clause (flagged on the instance), then emits `contract:clauseBroken`
//     { missionId, clauseId, event }. The missions layer routes that through its existing fail path.
//     This system NEVER writes credits/cargo/rep (single-writer honored).
//   • HONOR bonus: when a clause-bearing mission completes WITHOUT breach, the system emits
//     `contract:clauseHonored` so the missions layer can apply the clause.rewardMult bonus. (The
//     bonus is the carrot; the deposit forfeit is the stick — both via the shipped paths.)
//
// noTouch honored: missions.js / economy.js / factions.js are not edited. This system reads
// state.missions.active (the live instances) and listens to the same bus events missions does.
// Budget: spawn:none · voice: one 'comms' line on breach · draw:none.

import { CONTRACT_CLAUSES, OBSERVED_CLAUSE_EVENTS, CLAUSE_IDS } from '../data/contractClauses.js';
import { MISSION_TYPES } from '../data/missions.js';
import { hash32, mulberry32 } from '../core/rng.js';

const SET_OBSERVED = new Set(OBSERVED_CLAUSE_EVENTS);
const ATTACH_PROB = 0.35; // ~35% of qualifying offers carry a clause (seeded; low enough to be a treat)
const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));

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
    this._onKilled = (p) => this._evaluate('entity:killed', p);
    this._onScanned = (p) => this._evaluate('player:scannedByPatrol', p);
    this._onAccept = (p) => this._onMissionAccepted(p);
    this._onComplete = (p) => this._onMissionCompleted(p);
    if (this._bus && this._bus.on) {
      this._bus.on('entity:killed', this._onKilled);
      this._bus.on('player:scannedByPatrol', this._onScanned);
      this._bus.on('ui:acceptMission', this._onAccept);
      this._bus.on('mission:completed', this._onComplete);
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
    for (const m of active) {
      if (!m || !m.clauses || !m.clauses.length) continue;
      if (m._clauseState && m._clauseState._completed) continue;
      for (const c of m.clauses) {
        if (c.event !== eventName) continue;
        const key = c.id;
        if (m._clauseState && m._clauseState[key] && m._clauseState[key].breached) continue; // fire once
        const clauseDef = CONTRACT_CLAUSES[c.id];
        if (!clauseDef) continue;
        const ctx = {
          playerId,
          simTime: state.simTime || 0,
          escorteeId: m._escorteeId || null,
          deadline_s: (m._clauseState && m._clauseState.time_limit && m._clauseState.time_limit.deadline_s) || m.deadline_s || null,
        };
        let breached = false;
        try { breached = !!clauseDef.breachOn(payload, ctx); } catch (_) { breached = false; }
        if (!breached) continue;
        if (!m._clauseState) m._clauseState = {};
        m._clauseState[key] = { breached: true, at: state.simTime || 0 };
        this._emitBreach(m, c, eventName);
      }
    }
  },

  _onMissionCompleted(p) {
    const state = this._state;
    if (!state || !p || !p.missionId) return;
    const m = this._findActive(p.missionId);
    if (!m || !m.clauses || !m.clauses.length) return;
    if (m._clauseState && m._clauseState._completed) return;
    if (!m._clauseState) m._clauseState = {};
    m._clauseState._completed = true;
    // HONOR: any clause that did NOT breach → the run was clean. Emit clauseHonored for each.
    for (const c of m.clauses) {
      const breached = !!(m._clauseState[c.id] && m._clauseState[c.id].breached);
      if (!breached && this._bus && this._bus.emit) {
        this._bus.emit('contract:clauseHonored', { missionId: m.id, clauseId: c.id, rewardMult: c.rewardMult });
      }
    }
  },

  _emitBreach(m, clause, eventName) {
    if (!this._bus || !this._bus.emit) return;
    // The ONE penalty intent — the missions layer routes this through its shipped collateral-forfeit
    // fail path. This system NEVER writes credits/cargo/rep itself.
    this._bus.emit('contract:clauseBroken', {
      missionId: m.id, clauseId: clause.id, event: eventName, label: clause.label,
    });
    // One comms line on breach, through the arbiter.
    const helpers = this._helpers || {};
    const line = `Contract clause broken: ${clause.label}.`;
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
      if (this._onKilled) this._bus.off('entity:killed', this._onKilled);
      if (this._onScanned) this._bus.off('player:scannedByPatrol', this._onScanned);
      if (this._onAccept) this._bus.off('ui:acceptMission', this._onAccept);
      if (this._onComplete) this._bus.off('mission:completed', this._onComplete);
    }
    this._onKilled = null;
    this._onScanned = null;
    this._onAccept = null;
    this._onComplete = null;
  },
};

export default contractClausesSystem;
