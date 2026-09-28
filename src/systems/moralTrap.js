// moralTrap.js — BP-12 packet MORAL_TRAP_CONTRACTS ("The Job That Isn't What It Says") — SYSTEM.
//
// Attaches a trap to a qualifying offer (smuggling/passenger), fires the reveal ONCE mid-run, and
// presents the binary choice via the wreckMissions `choice` shape through the prompt deck.
// Each choice option routes to a DISTINCT shipped consequence — rep (faction:repDelta), credits
// (economy:grantCredits), or a contraband bust (the shipped runScan path) — never two options
// with no mechanical difference.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • attachTrap is SEEDED + low-probability (hash32(seed, offerId, 'trap') < ATTACH_PROB). A
//     trap-free offer behaves EXACTLY as today. Golden-sim safe: traps attach only in the drifted
//     content path, never the 47-A deterministic slice (which doesn't post these offer types).
//   • The reveal fires ONCE (flagged on the instance: m._trapRevealed). Re-rolling is forbidden.
//   • Each choice option resolves through a DISTINCT shipped channel — the system EMITS intents
//     (faction:repDelta / economy:grantCredits), never writes state directly (single-writer honored).
//     A 'contraband' consequence reuses the shipped player:scannedByPatrol + runScan path.
//   • The choice uses the EXACT wreckMissions shape; the moralTrapPrompt prompt-deck adapter
//     consumes the reveal and emits moralTrap:choose back. `consequence` is additive metadata
//     the system reads to route the result.
//
// Attach rides offer GENERATION: missions.js calls attachTrap once inside _withConditions
// (seeded per offer id, Helios and story offers excluded), and the active instance inherits
// offer.trap through _instanceFromOffer. This system stays event-driven — it reads
// state.missions.active, listens to bus events, and EMITS sanctioned intents only.
// Budget: spawn:none · voice: comms (reveal + choice) · draw:none.
//
// MID-RUN CUES (the reveal fires exactly once, on the FIRST of these):
//   • patrol:proximity — a live law sweep is running the hold (lawful inspection or a patrol-scan
//     encounter, a real hull alongside). The trap's lie unravels WITNESSED: the trap's
//     patrolRevealLine speaks instead of revealLine and the fork lands with the cutter there.
//     The sweep overrides cue routing — it is the strongest cue there is.
//   • dock:undocked — the guaranteed mid-run cue: the player has left the dock and is en route.
//     Same-sector jobs (origin sector == dest sector) never cross a sector boundary, so without
//     this cue their fork could never present at all. Procedural traps on SAME-SECTOR routes
//     reveal here but not instantly: a short sim interval (revealDelayS) lands the fork mid-lane,
//     so the voice never speaks the moment the umbilical clears.
//   • sector:enter — CROSS-SECTOR procedural routes reveal at the sector crossing, where the
//     route gives the fork weight, instead of the instant of undock.
// The routing is stamped onto the overlay at attach time (revealCue) from the offer's own
// topology; legacy overlays (no stamp) answer every cue, exactly as shipped.
// Without the undock cue the reveal only fired at the destination-sector threshold — at the
// doorstep, where both fork options are free — or never, on same-sector runs.
//
// A1/A2 additions (passengers are people / traps are about the hold):
//   • attachTrap gates cargo-familied traps on the ACTUAL hauled commodity family
//     (trapFitsCargoFamily over COMMODITY_MORAL_TAGS) — air_is_owed can no longer lie about
//     iron ore — and interpolates the offer's minted passenger identity into the fugitive
//     reveal/prompt, so the fugitive trap names the person the run made real.
//   • Each resolved fork routes through rememberMoralDebt (the EXISTING moralMemory owner), so
//     the counterparty — the named passenger, or a supplier minted from the mission id —
//     becomes a pending debt record the existing debt-reveal readers can surface. Pay/rep
//     intents are untouched (single writers stay single).

import { MORAL_TRAPS, TRAP_IDS, trapFitsOfferType, trapFitsCargoFamily } from '../data/moralTraps.js';
import { rememberMoralDebt } from './moralMemory.js';
import { FRONTIER_FIRST_NAMES, FRONTIER_LAST_NAMES } from '../data/barks.js';
import { SECTORS } from '../data/sectors.js';
import { hash32, mulberry32 } from '../core/rng.js';

const ATTACH_PROB = 0.18; // low-probability attach — traps are a treat, not every run
const UNDOCK_REVEAL_DELAY_S = 30; // same-sector forks land mid-lane, not at the umbilical

// station id → sector id (static catalog; runtime content registries mount through missions).
const STATION_SECTOR = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) STATION_SECTOR.set(st.id, sec.id);
}

/**
 * A deterministic counterparty name for a cargo trap: the supplier/broker the choice made real,
 * minted from (world seed, mission id) — never an rng draw, stable across save/load.
 */
function trapCounterpartyName(seed, missionId) {
  const h = hash32((Number(seed) || 0) >>> 0, String(missionId || ''), 'trap-counterparty');
  const first = FRONTIER_FIRST_NAMES[h % FRONTIER_FIRST_NAMES.length];
  const last = FRONTIER_LAST_NAMES[(h >>> 8) % FRONTIER_LAST_NAMES.length];
  return `${first} ${last}`;
}

/**
 * The overlay that rides the offer/instance: the shipped choice shape plus the reveal lines.
 * Interpolates the A1 minted passenger into the named variants when the offer carries one (the
 * static lines stay the no-name fallback), and stamps the A2 reveal cue from the offer's own
 * route topology (same-sector → delayed undock; cross-sector → sector crossing).
 */
function trapOverlayFor(trap, offer) {
  const rawName = offer && offer.params && offer.params.passenger && offer.params.passenger.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const swap = (s) => (typeof s === 'string' ? s.replace(/\{name\}/g, name) : s);
  const useNamed = !!name && !!trap.revealLineNamed;
  const overlay = {
    id: trap.id,
    revealAt: trap.revealAt,
    revealLine: useNamed ? swap(trap.revealLineNamed) : trap.revealLine,
    patrolRevealLine: (useNamed && trap.patrolRevealLineNamed)
      ? swap(trap.patrolRevealLineNamed) : trap.patrolRevealLine,
    choice: trap.choice,
  };
  if (useNamed && trap.promptNamed && trap.choice) {
    overlay.choice = { ...trap.choice, prompt: swap(trap.promptNamed) };
  }
  const originSector = (offer && offer.stationId && STATION_SECTOR.get(offer.stationId)) || null;
  const sameSector = originSector == null || originSector === offer.destSectorId;
  overlay.revealCue = sameSector ? 'undock_delayed' : 'sector_enter';
  if (sameSector) overlay.revealDelayS = UNDOCK_REVEAL_DELAY_S;
  return overlay;
}

/**
 * attachTrap(offer, seed) -> offer with an optional `trap: {id, revealAt, revealLine, choice,
 * options}` overlay, or the offer unchanged if no trap attaches. SEEDED via
 * hash32(seed, offerId, 'trap'). Only attaches when:
 *   1. the seeded roll beats ATTACH_PROB (trap-free is the common case),
 *   2. a trap exists that fits the offer's type AND the actual hauled cargo family
 *      (trapFitsCargoFamily — an arms-class trap requires a military hold, etc.),
 *   3. (defensively) the offer has an id (no id ⇒ no trap — golden-sim safe).
 * The authored Helios teaching beat owns its board (seedHeliosOfferTrap); authored and
 * contract-sourced offers never carry a procedural lie on top of their written one.
 * PURE; deterministic per (seed, offerId).
 */
export function attachTrap(offer, seed) {
  if (!offer || !offer.id) return offer;
  if (offer.trap || offer.stationId === 'station_helios') return offer;
  if (offer.storyTag || offer.campaign47aBeat != null || offer.storyBranch || offer.source) return offer;
  const rng = mulberry32(hash32(seed, offer.id, 'trap') >>> 0);
  if (rng() > ATTACH_PROB) return offer; // trap-free (the common case)
  // Candidate traps that fit this offer type AND the actual hauled commodity family.
  const candidates = TRAP_IDS.map((id) => MORAL_TRAPS[id])
    .filter((t) => trapFitsOfferType(t, offer.type))
    .filter((t) => trapFitsCargoFamily(t, offer.params && offer.params.cmdtyId));
  if (!candidates.length) return offer;
  const trap = candidates[Math.floor(rng() * candidates.length)];
  // Carry the choice (shipped shape) + the additive consequence metadata the system routes on.
  return {
    ...offer,
    trap: trapOverlayFor(trap, offer),
  };
}

/**
 * WORLD-18 — one Helios passenger or cargo offer carries a trap that already exists.
 * Accepting it speaks revealLine once. Not a new trap type. The A1 named interpolation applies
 * here too: the authored teaching lie is about the passenger the board actually named.
 */
export function seedHeliosOfferTrap(offer) {
  if (!offer || offer.stationId !== 'station_helios' || offer.trap) return offer;
  if (offer.type !== 'cargo_delivery' && offer.type !== 'passenger_transport') return offer;
  const trap = offer.type === 'passenger_transport'
    ? MORAL_TRAPS.passenger_is_fugitive
    : MORAL_TRAPS.cargo_is_weapons;
  if (!trap || !trapFitsOfferType(trap, offer.type)) return offer;
  return {
    ...offer,
    _heliosTrapSeeded: true,
    trap: trapOverlayFor(trap, offer),
  };
}

// ── registry SYSTEMS-only entry (reveal once; choice via comms; emit-only consequences) ──────

export const moralTrapSystem = {
  name: 'moralTrap',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._helpers = ctx && ctx.helpers;
    // The reveal fires mid-run on the FIRST cue: a live law sweep (witnessed — overrides cue
    // routing), leaving the dock (guaranteed — same-sector jobs never cross a boundary; their
    // procedural traps land a short interval later, mid-lane), or a sector crossing
    // (cross-sector procedural routes). Legacy overlays answer every cue as shipped.
    this._onSectorEnter = (p) => this._maybeReveal(p, { cue: 'sector_enter' });
    this._onUndocked = (p) => this._maybeReveal(p, { cue: 'undock' });
    this._onPatrolProximity = (p) => this._maybeReveal(p, { witnessedByPatrol: true });
    this._onChoice = (p) => this._resolveChoice(p);
    this._onAccepted = (p) => this._revealAcceptedHeliosTrap(p);
    if (this._bus && this._bus.on) {
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('dock:undocked', this._onUndocked);
      this._bus.on('patrol:proximity', this._onPatrolProximity);
      this._bus.on('moralTrap:choose', this._onChoice); // additive seam the choice UI emits
      this._bus.on('mission:accepted', this._onAccepted);
    }
  },

  _revealAcceptedHeliosTrap(payload) {
    const id = payload && (payload.missionId || payload.id);
    const mission = this._findActive(id) || (payload && payload.mission);
    if (!mission || !mission.trap || mission._acceptLineSpoken) return;
    const station = mission.stationId || mission.startStationId || (payload && payload.stationId);
    if (station !== 'station_helios') return;
    const line = typeof mission.trap.revealLine === 'string' ? mission.trap.revealLine.trim() : '';
    if (!line) return;
    mission._acceptLineSpoken = true;
    // Do NOT set _trapRevealed here — the fork still presents mid-run via _maybeReveal (which
    // stashes + emits moralTrap:revealed). Marking it now would strand the choice unanswered.
    this._speakReveal(line);
  },

  _maybeReveal(p, opts = {}) {
    const state = this._state;
    if (!state) return;
    const witnessed = !!(opts && opts.witnessedByPatrol);
    const cue = (opts && opts.cue) || null;
    const active = (state.missions && state.missions.active) || [];
    for (const m of active) {
      if (!m || !m.trap || m._trapRevealed || m._trapResolved) continue;
      if (m.status && m.status !== 'active') continue;
      if (m.trap.revealAt && m.trap.revealAt !== 'mid_run') continue;
      // A2 routing: a stamped cue only answers its own event (undock vs sector crossing);
      // legacy overlays (no stamp) answer everything, exactly as shipped. A live law sweep
      // overrides the routing — the cutter alongside is in the fiction NOW.
      const trapCue = m.trap.revealCue || null;
      if (!witnessed && cue === 'undock' && trapCue === 'undock_delayed') {
        // Not instant: schedule the same fork a short sim interval into the lane.
        if (m._trapRevealAt == null) {
          m._trapRevealAt = (Number(state.simTime) || 0)
            + (Number(m.trap.revealDelayS) || UNDOCK_REVEAL_DELAY_S);
        }
        continue;
      }
      if (!witnessed && cue && trapCue && cue !== trapCue) continue;
      this._revealMission(m, state, witnessed);
      break;
    }
  },

  /** The reveal itself — once per mission, stashing the live fork for the prompt deck. */
  _revealMission(m, state, witnessed) {
    // Under a live law sweep the lie unravels WITNESSED: the trap's patrol line speaks (the
    // cutter alongside is in the fiction) and the mission remembers who was watching.
    const lineSource = (witnessed && typeof m.trap.patrolRevealLine === 'string'
      && m.trap.patrolRevealLine.trim()) ? m.trap.patrolRevealLine : m.trap.revealLine;
    const line = typeof lineSource === 'string' ? lineSource.trim() : '';
    if (!line) return;
    m._trapRevealed = true;
    m._trapRevealAt = null;
    if (witnessed) m._trapWitnessedByPatrol = true;
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.moralTrap = {
      missionId: m.id, trapId: m.trap.id, choice: m.trap.choice,
      witnessed, t: state.simTime || 0,
    };
    if (this._bus && this._bus.emit) {
      this._bus.emit('moralTrap:revealed', {
        missionId: m.id, trapId: m.trap.id, choice: m.trap.choice, witnessed,
      });
    }
    if (!m._acceptLineSpoken) this._speakReveal(line); // Helios traps already said it at accept
  },

  /** Per-tick: fire same-sector undock reveals whose short delay has elapsed. Cheap guard: only
   *  missions with a pending reveal time do any work. */
  update(dt, state) {
    const active = (state && state.missions && state.missions.active) || [];
    for (const m of active) {
      if (!m || !m.trap || m._trapRevealed || m._trapResolved) continue;
      if (m._trapRevealAt == null) continue;
      if (m.status && m.status !== 'active') { m._trapRevealAt = null; continue; }
      if ((Number(state.simTime) || 0) < m._trapRevealAt) continue;
      this._revealMission(m, state, false);
    }
  },

  _speakReveal(line) {
    const helpers = this._helpers || {};
    const voice = helpers.voice;
    if (voice && typeof voice.say === 'function') {
      const said = voice.say({ channel: 'comms', text: line, kind: 'moralTrap' });
      if (said) return;
    }
    if (this._bus && this._bus.emit) {
      this._bus.emit('toast', { text: line, kind: 'warn', ttl: 4 });
    }
  },

  _resolveChoice(p) {
    const state = this._state;
    if (!p || !p.missionId || !p.optionId) return;
    const m = this._findActive(p.missionId);
    if (!m || !m.trap || !m.trap.choice || m._trapResolved) return;
    const option = m.trap.choice.options.find((o) => o.id === p.optionId);
    if (!option) return;
    // Route the option's consequence through its DISTINCT shipped channel. The system EMITS intents
    // only — it never writes credits/rep/cargo directly (single-writer honored).
    this._applyConsequence(m, option);
    // A2: whichever branch the player chose, the counterparty it made real is written into the
    // EXISTING moralMemory owner as a pending debt — the double-crossed supplier or the harbored
    // passenger outlives the contract through the records its readers already surface.
    this._rememberTrapDebt(m, option);
    // Clear the choice UI state.
    if (state.ui) delete state.ui.moralTrap;
    // Flag the trap resolved so it can't fire again — before the settle emit, whose listeners run
    // synchronously and must already see the fork closed.
    m._trapResolved = true;
    if (this._bus && this._bus.emit) {
      this._bus.emit('moralTrap:resolved', { missionId: m.id, trapId: m.trap.id, optionId: option.id });
      // 'end' options break the contract NOW through missions' own abandon path — no parallel
      // teardown: poster rep penalty, collateral forfeit, receipt and cargo cleanup ride _failMission.
      if (option.settle === 'end') {
        this._bus.emit('mission:abandon', { missionId: m.id, reason: 'moral_trap' });
      }
    }
  },

  _applyConsequence(m, option) {
    const c = option.consequence;
    if (!c || !this._bus || !this._bus.emit) return;
    // The rep mark always lands at choice time — the faction learned which way you chose.
    if (c.repChannel && (c.repDelta || c.delta || 0)) {
      this._bus.emit('faction:repDelta', { factionId: c.repChannel, delta: c.delta || c.repDelta || 0, reason: 'moralTrap' });
    }
    // A credits channel grants upfront only on 'end' options (bounty/settlement payoffs). On a
    // 'continue' option the pay IS the contract — granting it here would pay twice at delivery.
    if (c.channel === 'credits' && option.settle !== 'continue') {
      const reward = (m.reward_cr || 0) * (c.amount || 1);
      if (reward > 0) this._bus.emit('economy:grantCredits', { amount: Math.round(reward), reason: 'moralTrap:payout' });
    }
    // A 'contraband' consequence (if a trap ever uses it) would emit the shipped
    // player:scannedByPatrol { hasContraband:true } to route through runScan — NOT a direct bust.
  },

  /**
   * A2: a resolved fork leaves a durable person/debt behind through the EXISTING moralMemory
   * owner (rememberMoralDebt — the same records ace-memory spares write, the same pending
   * queue the debt-reveal readers surface). Exactly one record per resolved trap (deduped by
   * id). 'continue' = the player kept their deal (the counterparty remembers it kindly);
   * 'end' = the player crossed them (the counterparty remembers that instead).
   */
  _rememberTrapDebt(m, option) {
    const state = this._state;
    if (!state || !m || !m.trap) return;
    const trapId = m.trap.id;
    const name = trapId === 'passenger_is_fugitive'
      ? (m.params && m.params.passenger && m.params.passenger.name) || 'The passenger'
      : trapCounterpartyName((state.meta && state.meta.seed) || 0, m.id);
    rememberMoralDebt(state, {
      id: `moralTrap:${m.id}`,
      name,
      cause: `moral_trap:${trapId}:${option.id}`,
      factionId: (option.consequence && option.consequence.repChannel) || 'faction_reach',
      disposition: option.settle === 'continue' ? 'ally' : 'vengeful',
      t: state.simTime,
      source: 'moralTrap:resolve',
    });
  },

  _findActive(missionId) {
    const active = (this._state && this._state.missions && this._state.missions.active) || [];
    return active.find((m) => m && m.id === missionId) || null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onSectorEnter) this._bus.off('sector:enter', this._onSectorEnter);
      if (this._onUndocked) this._bus.off('dock:undocked', this._onUndocked);
      if (this._onPatrolProximity) this._bus.off('patrol:proximity', this._onPatrolProximity);
      if (this._onChoice) this._bus.off('moralTrap:choose', this._onChoice);
      if (this._onAccepted) this._bus.off('mission:accepted', this._onAccepted);
    }
    this._onSectorEnter = null;
    this._onUndocked = null;
    this._onPatrolProximity = null;
    this._onChoice = null;
    this._onAccepted = null;
  },
};

export default moralTrapSystem;
