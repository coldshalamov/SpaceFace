// moralTrap.js — BP-12 packet MORAL_TRAP_CONTRACTS ("The Job That Isn't What It Says") — SYSTEM.
//
// Attaches a trap to a qualifying offer (smuggling/passenger), fires the reveal ONCE mid-run, and
// presents the binary choice via the existing wreckMissions `choice` shape. Each choice option
// routes to a DISTINCT shipped consequence — rep (faction:repDelta), credits (economy:grantCredits),
// or a contraband bust (the shipped runScan path) — never two options with no mechanical difference.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • attachTrap is SEEDED + low-probability (hash32(seed, offerId, 'trap') < ATTACH_PROB). A
//     trap-free offer behaves EXACTLY as today. Golden-sim safe: traps attach only in the drifted
//     content path, never the 47-A deterministic slice (which doesn't post these offer types).
//   • The reveal fires ONCE (flagged on the instance: m._trapRevealed). Re-rolling is forbidden.
//   • Each choice option resolves through a DISTINCT shipped channel — the system EMITS intents
//     (faction:repDelta / economy:grantCredits), never writes state directly (single-writer honored).
//     A 'contraband' consequence reuses the shipped player:scannedByPatrol + runScan path.
//   • The choice uses the EXACT wreckMissions shape so the existing choice UI consumes it unchanged;
//     `consequence` is additive metadata the system reads to route the result.
//
// noTouch honored: missions.js / economy.js / factions.js are not edited. The system reads
// state.missions.active, listens to the same bus events, and EMITS sanctioned intents only.
// Budget: spawn:none · voice: comms (reveal + choice) · draw:none.

import { MORAL_TRAPS, TRAP_IDS, trapById, trapFitsOfferType } from '../data/moralTraps.js';
import { hash32, mulberry32 } from '../core/rng.js';

const ATTACH_PROB = 0.18; // low-probability attach — traps are a treat, not every run

/**
 * attachTrap(offer, seed) -> offer with an optional `trap: {id, revealAt, revealLine, choice,
 * options}` overlay, or the offer unchanged if no trap attaches. SEEDED via
 * hash32(seed, offer.id, 'trap'). Only attaches when:
 *   1. the seeded roll beats ATTACH_PROB (trap-free is the common case),
 *   2. a trap exists that fits the offer's type,
 *   3. (defensively) the offer has an id (no id ⇒ no trap — golden-sim safe).
 * PURE; deterministic per (seed, offerId).
 */
export function attachTrap(offer, seed) {
  if (!offer || !offer.id) return offer;
  const rng = mulberry32(hash32(seed, offer.id, 'trap') >>> 0);
  if (rng() > ATTACH_PROB) return offer; // trap-free (the common case)
  // Candidate traps that fit this offer type.
  const candidates = TRAP_IDS.map((id) => MORAL_TRAPS[id]).filter((t) => trapFitsOfferType(t, offer.type));
  if (!candidates.length) return offer;
  const trap = candidates[Math.floor(rng() * candidates.length)];
  // Carry the choice (shipped shape) + the additive consequence metadata the system routes on.
  return {
    ...offer,
    trap: {
      id: trap.id,
      revealAt: trap.revealAt,
      revealLine: trap.revealLine,
      choice: trap.choice,
    },
  };
}

// ── registry SYSTEMS-only entry (reveal once; choice via comms; emit-only consequences) ──────

export const moralTrapSystem = {
  name: 'moralTrap',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._helpers = ctx && ctx.helpers;
    // The reveal fires mid-run. We use the first sector:enter after accept as the deterministic
    // mid-run cue (the player has left the dock and is en route). Scan/encounter cues are
    // non-deterministic in timing; sector:enter is the stable, seeded-safe trigger.
    this._onSectorEnter = (p) => this._maybeReveal(p);
    this._onChoice = (p) => this._resolveChoice(p);
    if (this._bus && this._bus.on) {
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('moralTrap:choose', this._onChoice); // additive seam the choice UI emits
    }
  },

  _maybeReveal(p) {
    const state = this._state;
    if (!state) return;
    const active = (state.missions && state.missions.active) || [];
    let revealed = false;
    for (const m of active) {
      if (!m || !m.trap) continue;
      if (m._trapRevealed) continue; // fire ONCE per instance (never re-roll)
      m._trapRevealed = true;
      revealed = true;
      // Surface the choice on additive UI state + emit the additive reveal seam.
      if (!state.ui || typeof state.ui !== 'object') state.ui = {};
      state.ui.moralTrap = { missionId: m.id, trapId: m.trap.id, choice: m.trap.choice, t: state.simTime || 0 };
      if (this._bus && this._bus.emit) {
        this._bus.emit('moralTrap:revealed', { missionId: m.id, trapId: m.trap.id, choice: m.trap.choice });
      }
      // ONE comms line — the reveal, through the arbiter.
      const helpers = this._helpers || {};
      if (helpers.voice && typeof helpers.voice.say === 'function') {
        const said = helpers.voice.say({ channel: 'comms', text: m.trap.revealLine, kind: 'moralTrap' });
        if (!said) this._bus.emit('toast', { text: m.trap.revealLine, kind: 'warn', ttl: 4 });
      }
    }
    if (!revealed) return;
  },

  _resolveChoice(p) {
    const state = this._state;
    if (!p || !p.missionId || !p.optionId) return;
    const m = this._findActive(p.missionId);
    if (!m || !m.trap || !m.trap.choice) return;
    const option = m.trap.choice.options.find((o) => o.id === p.optionId);
    if (!option) return;
    // Route the option's consequence through its DISTINCT shipped channel. The system EMITS intents
    // only — it never writes credits/rep/cargo directly (single-writer honored).
    this._applyConsequence(m, option);
    // Clear the choice UI state.
    if (state.ui) delete state.ui.moralTrap;
    // Flag the trap resolved so it can't fire again.
    m._trapResolved = true;
    if (this._bus && this._bus.emit) {
      this._bus.emit('moralTrap:resolved', { missionId: m.id, trapId: m.trap.id, optionId: option.id });
    }
  },

  _applyConsequence(m, option) {
    const c = option.consequence;
    if (!c || !this._bus || !this._bus.emit) return;
    // Distinct shipped channel per consequence.channel:
    if (c.channel === 'rep' && c.repChannel) {
      // Single-writer: factions own rep via faction:repDelta.
      this._bus.emit('faction:repDelta', { factionId: c.repChannel, delta: c.delta || c.repDelta || 0, reason: 'moralTrap' });
    } else if (c.channel === 'credits') {
      // Single-writer: economy owns credits. The amount multiplies the mission's reward (a partial
      // or bonus payout). economy:grantCredits is the sanctioned grant channel.
      const reward = (m.reward_cr || 0) * (c.amount || 1);
      if (reward > 0) this._bus.emit('economy:grantCredits', { amount: Math.round(reward), reason: 'moralTrap:payout' });
      if (c.repChannel && (c.repDelta || 0)) {
        this._bus.emit('faction:repDelta', { factionId: c.repChannel, delta: c.repDelta, reason: 'moralTrap' });
      }
    }
    // A 'contraband' consequence (if a trap ever uses it) would emit the shipped
    // player:scannedByPatrol { hasContraband:true } to route through runScan — NOT a direct bust.
  },

  _findActive(missionId) {
    const active = (this._state.missions && this._state.missions.active) || [];
    return active.find((m) => m && m.id === missionId) || null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onSectorEnter) this._bus.off('sector:enter', this._onSectorEnter);
      if (this._onChoice) this._bus.off('moralTrap:choose', this._onChoice);
    }
    this._onSectorEnter = null;
    this._onChoice = null;
  },
};

export default moralTrapSystem;
