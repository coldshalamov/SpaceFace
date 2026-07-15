// contractClauses.js — BP-12 packet COLLATERAL_AND_CLAUSES ("Contract Fine Print") — DATA catalog.
//
// This contract has teeth — a deposit I lose if I fail, and a clause that forbids a single kill.
// The collateral machinery is SHIPPED (missions.collateral_cr, charged on accept via
// economy:chargeCredits, forfeited on fail). This catalog adds optional CLAUSE metadata: a named
// predicate + prose + reward modifier, evaluated against events missions ALREADY tracks.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • Every clause's `event` maps to an event missions.js ALREADY listens to (entity:killed for
//     kills, player:scannedByPatrol for scans/busts, the deadline check for time_limit). A clause
//     whose predicate a system can't observe is FORBIDDEN (the named failureMode) — so the catalog
//     carries the `event` field and the system refuses to attach any clause whose event isn't in the
//     OBSERVED set (see src/systems/contractClauses.js).
//   • Breach routes through the ONE shipped collateral-forfeit path — contractClauses.js EMITS
//     `contract:clauseBroken`, and the missions layer (or its fail path) consumes it as the existing
//     fail/penalty. There is ONE penalty path, never two (double-penalizing is a named failureMode).
//   • Clause-free offers behave EXACTLY as today (no clause attached ⇒ no observable difference).
//
// Each clause:
//   id      — stable clause id
//   event   — the bus event missions ALREADY observes that this predicate keys off
//   label   — short UI label
//   prose   — one-line fine-print text
//   rewardMult — multiplier applied to the offer's reward if the clause is HONORED (>=1: a bonus for
//              a clean run); the deposit forfeit on breach is the SHIPPED collateral path, not this.
//   breachOn(payload, ctx) — PURE predicate: does this payload breach the clause? `ctx` carries the
//              mission instance (params/type) for context. Returns boolean.

export const OBSERVED_CLAUSE_EVENTS = Object.freeze(['entity:killed', 'player:scannedByPatrol']);

export const CONTRACT_CLAUSES = Object.freeze({
  // No kills during the contract — keyed off entity:killed (player kills; missions._onKill).
  no_kills: Object.freeze({
    id: 'no_kills',
    event: 'entity:killed',
    label: 'No kills',
    prose: 'Complete the run without destroying any vessel.',
    rewardMult: 1.15,
    breachOn(payload, ctx) {
      // Any player kill during an active contract with this clause breaches it.
      return !!(payload && payload.killerId && ctx && ctx.playerId && payload.killerId === ctx.playerId);
    },
  }),

  // Cargo intact — no scan bust that confiscates the cargo. Keyed off player:scannedByPatrol
  // (missions._onScannedByPatrol busts smuggling; a contraband bust breaches the intact-cargo clause).
  cargo_intact: Object.freeze({
    id: 'cargo_intact',
    event: 'player:scannedByPatrol',
    label: 'Cargo intact',
    prose: 'Deliver the cargo unopened — no customs confiscation.',
    rewardMult: 1.10,
    breachOn(payload, ctx) {
      // A scan that finds contraband (hasContraband) breaches the intact-cargo clause. (The actual
      // confiscation is the engine's; this clause is the contractual fine print on top.)
      return !!(payload && payload.hasContraband);
    },
  }),

  // No scan at all — even a clean scan breaches this stricter clause. Same event, stricter predicate.
  no_scan: Object.freeze({
    id: 'no_scan',
    event: 'player:scannedByPatrol',
    label: 'No scans',
    prose: 'Avoid customs scans entirely — slip the lane clean.',
    rewardMult: 1.20,
    breachOn(payload) {
      // Any scan (clean or not) breaches "no scans" — the strict variant.
      return !!payload;
    },
  }),

  // Rescue priority — a passenger/rescue contract that forbids letting the escortee die. Keyed off
  // entity:killed (the escortee is an entity; missions._onEntityDestroyed handles escort fail). We
  // reuse entity:killed and gate the predicate on the killed entity being the mission's escortee.
  rescue_priority: Object.freeze({
    id: 'rescue_priority',
    event: 'entity:killed',
    label: 'Rescue priority',
    prose: 'The passenger comes first — do not let the escort vessel fall.',
    rewardMult: 1.25,
    breachOn(payload, ctx) {
      // Breached when the killed/destroyed entity is the mission's escortee.
      const escorteeId = ctx && ctx.escorteeId;
      return !!(payload && escorteeId && (payload.id === escorteeId));
    },
  }),

  // Time limit — the contract must complete before a deadline. This clause's `event` is the deadline
  // check missions ALREADY runs in update() (m.deadline_s). The system surfaces it as a clause so the
  // fine print names the deadline; breach is detected by the system's own deadline tick, not a bus
  // event, so event is the sentinel 'time_limit' resolved internally (not a bus subscription).
  time_limit: Object.freeze({
    id: 'time_limit',
    event: 'time_limit',
    label: 'Time limit',
    prose: 'Complete within the deadline — the deposit forfeits on expiry.',
    rewardMult: 1.05,
    breachOn(payload, ctx) {
      // Breached when simTime exceeds the clause's deadline_s. `ctx.deadline_s` carries it.
      const now = (ctx && ctx.simTime) || 0;
      const dl = (ctx && ctx.deadline_s) || Infinity;
      return now > dl;
    },
  }),
});

/** Lookup a clause by id (frozen record or undefined). */
export function clauseById(id) {
  return CONTRACT_CLAUSES[id];
}

/**
 * Pure completion settlement for a canonical mission instance.
 *
 * Clause observation records breach flags on the normal active mission. Missions calls this before
 * payout/removal so the bonus and receipt are one atomic settlement, while this data helper remains
 * free of bus/state writes. Multiple honored clauses compose multiplicatively in their authored
 * order; malformed or unknown rows never create a bonus.
 */
export function settleContractClauses(mission) {
  const terms = Array.isArray(mission && mission.clauses) ? mission.clauses : [];
  const clauseState = mission && mission._clauseState && typeof mission._clauseState === 'object'
    ? mission._clauseState : {};
  const honored = [];
  const breached = [];
  let rewardMult = 1;
  for (const term of terms) {
    const canonical = term && clauseById(term.id);
    if (!canonical) continue;
    if (clauseState[canonical.id] && clauseState[canonical.id].breached) {
      breached.push(canonical.id);
      continue;
    }
    // The catalog, not mutable save/offer metadata, is the payout authority.
    const rewardTerm = Number.isFinite(Number(canonical.rewardMult)) && canonical.rewardMult >= 1
      ? canonical.rewardMult : 1;
    rewardMult *= rewardTerm;
    honored.push({ id: canonical.id, rewardMult: rewardTerm });
  }
  const baseRewardCr = Math.max(0, Math.round(Number(mission && mission.reward_cr) || 0));
  return Object.freeze({
    baseRewardCr,
    rewardMult,
    rewardCr: Math.max(0, Math.round(baseRewardCr * rewardMult)),
    honored: Object.freeze(honored.map((row) => Object.freeze(row))),
    breached: Object.freeze(breached),
  });
}

/** All clause ids (for seeded attachment selection). */
export const CLAUSE_IDS = Object.freeze(Object.keys(CONTRACT_CLAUSES));

export default CONTRACT_CLAUSES;
