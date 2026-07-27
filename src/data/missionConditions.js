// src/data/missionConditions.js — PHYSICS-AWARE MISSION CONDITIONS (data catalog).
//
// WHY THIS FILE EXISTS (design/PHYSICAL_PLAY_GRAMMAR.md §9.9):
//   A mission could express success in exactly two ways: `counter >= N` incremented by one of six bus
//   handlers, or `docked at station X`. `missions.update()` evaluated nothing per frame except the
//   deadline. So eleven mission types, five set-piece archetypes, nine career chains and the POI offer
//   generator all collapsed onto the same eleven verbs, and two instances of a type differed only in
//   numbers and proper nouns. Meanwhile the game emits ~60 physics events that nothing evaluated.
//
//   A CONDITION is a contract term expressed in the game's own physical vocabulary. It does not add a
//   mission type. It modifies the verb: "deliver 20u — never above 40 wu/s", "recover the core —
//   never let the line go slack", "fill the quota — without pegging the beam once". Risk tier stops
//   being a payout multiplier and becomes a verb modifier.
//
// SHAPE — this is a strict superset of the shipped CONTRACT_CLAUSES record, so a condition rides in
// the SAME `mission.clauses` array, settles through the SAME settleContractClauses(), is observed by
// the SAME contractClauses system, and renders in the SAME station-dossier tag row. One array, one
// observer (grammar §9.9.1), no new UI surface, no second settlement path.
//
//   id            stable id (also the `_clauseState` key)
//   kind          'forbid' — doing the thing trips the term.  'require' — you must do it to settle.
//   event         a bus event that ALREADY FIRES (verified emitter, see the per-record notes), or
//                 null for a tick condition. This is the safety allowlist the grammar asks us to
//                 generalise: a term nothing can observe is FORBIDDEN, and attachConditions filters
//                 any record whose event is not live on the bus.
//   tickSample    (ctx) => boolean — the per-frame predicate slot. TRUE means "the watched physical
//                 state holds RIGHT NOW". Borrowed wholesale from encounterScripts.js's
//                 distance-and-hold / speed-below / sustained-absence shapes (`:38-52`, `:291-297`).
//   holdS         a tick sample must hold continuously for this long before it scores once. This is
//                 the fairness grace window: the player gets `warnText` at t=0 and only trips at
//                 t=holdS. A trackpad overshoot must never void a contract.
//   count         occurrences needed to trip (forbid) or to satisfy (require).
//   onBreach      forbid only. 'fail' routes through the SHIPPED contract:clauseBroken → _failMission
//                 collateral-forfeit path (one penalty path, never two). 'forfeit' keeps the contract
//                 and drops the premium — the softer verb modifier.
//   blocking      require only. TRUE refuses the turn-in until the term is satisfied, which is what
//                 makes the mission a DIFFERENT mission rather than the same one with a bonus. Set it
//                 only where satisfaction is strictly inside the player's own control — a term that
//                 needs world content to be present (a big enough rock, a tetherable body) is
//                 premium-only, because a blocked turn-in the world cannot unblock is a soft-lock.
//   rewardMult    premium paid when the term is honoured (>= 1). Composes multiplicatively exactly
//                 like a clause; settleContractClauses is the payout authority.
//   label/prose   dossier tag + tooltip. THE PLAYER IS TOLD THE RULE BEFORE ACCEPTING.
//   brief         the short form appended to the offer's one-line brief.
//   breachText    the one line the player sees THE MOMENT the term trips. A hidden condition is a bug.
//   warnText      tick terms only: shown the instant the watched state goes bad, holdS before it trips.
//   pendingText   require terms only: shown when a turn-in is refused because the term is unmet.
//   appliesTo     mission types this term is allowed on.
//   minRisk       lowest risk tier that may carry it (this is how risk becomes a verb modifier).
//   requiresFeature  massline2 feature flag the term depends on. A require term whose feature is off
//                 would be unsatisfiable, so attachment refuses it.
//   fits(offer)   extra attach gate over the concrete offer (e.g. only tag fragile freight).
//   match(p,ctx)  event predicate.
//
// EVERY numeric threshold in this file is NEW tuning authored with this catalog. Nothing here
// re-tunes a protected value: no flight constant, no tether break envelope, no particle cap.
//
// DELIBERATELY ABSENT — a "keep the line under X strain" term. The Massline is deliberately
// near-unbreakable (breakTension 10500000, automaticBreakPolicy 'extreme_load_only'). Designing a
// contract term around line load re-introduces a fixed bug by teaching the player to fear a break
// that cannot happen. Line terms here are about SLACK and RELEASE QUALITY — the things the player
// actually controls.

// ── shared thresholds ─────────────────────────────────────────────────────────────────────────
export const STEADY_SPEED_LIMIT = 40;      // wu/s — the grammar's own worked example
export const STEADY_HOLD_S = 1.5;          // overshoot grace: a bump is not a breach
export const SLACK_TOLERANCE_S = 3.0;      // a tow may go momentarily loose; three seconds is neglect
export const BERTH_RANGE_WU = 700;         // "alongside" — encounterScripts pays a toll inside 520
export const BERTH_SPEED = 25;             // wu/s to be considered under control at the berth
export const BERTH_HOLD_S = 1.0;
export const QUIET_APPROACH_RANGE_WU = 2400;
export const QUIET_APPROACH_SPEED = 55;    // wu/s — a hot burn into a customs berth gets you looked at
export const QUIET_APPROACH_HOLD_S = 2.0;
export const SOLID_WHIP_RATINGS = Object.freeze(['solid', 'crushing']);
export const CLEAN_RELEASE_CLASSES = Object.freeze(['clean', 'razor']);

const isPlayerOf = (id, ctx) => id != null && ctx && ctx.playerId != null && id === ctx.playerId;

/** Straight-line world distance from the player to the mission's destination berth, or Infinity. */
function berthDistance(ctx) {
  const p = ctx && ctx.player;
  const berth = ctx && ctx.destPos;
  if (!p || !p.pos || !berth) return Infinity;
  return Math.hypot((p.pos.x || 0) - (berth.x || 0), (p.pos.z || 0) - (berth.z || 0));
}

export const MISSION_CONDITIONS = Object.freeze({

  // ── 1. STEADY HANDS ─────────────────────────────────────────────────────────────────────────
  // The grammar's headline example: "deliver 20 units by tether without exceeding 40 wu/s."
  // Tick predicate on the player's own speed. Forfeits the premium rather than voiding the run —
  // a speed ceiling held across several jumps is a discipline, not a trap.
  steady_hands: Object.freeze({
    id: 'steady_hands',
    kind: 'forbid',
    event: null,
    holdS: STEADY_HOLD_S,
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.30,
    label: 'Steady hands',
    prose: `Never exceed ${STEADY_SPEED_LIMIT} wu/s while the manifest is aboard. The premium is paid on a calm run.`,
    brief: `Hold under ${STEADY_SPEED_LIMIT} wu/s.`,
    warnText: `OVER ${STEADY_SPEED_LIMIT} WU/S — EASE OFF`,
    breachText: `Steady-hands premium lost: you held over ${STEADY_SPEED_LIMIT} wu/s.`,
    appliesTo: ['cargo_delivery', 'salvage_retrieval', 'passenger_transport', 'bulk_trade', 'smuggling_run'],
    minRisk: 0,
    tickSample(ctx) {
      return (ctx.speed || 0) > STEADY_SPEED_LIMIT;
    },
  }),

  // ── 2. NO SLACK ─────────────────────────────────────────────────────────────────────────────
  // "Recover the core without letting the line go slack." Reads state.player.tether.phase, which
  // tetherGameplay._mirror writes every tick ('slack' | 'capture' | 'loaded' | 'overload').
  // Three seconds of grace: reeling in legitimately passes through slack.
  no_slack: Object.freeze({
    id: 'no_slack',
    kind: 'forbid',
    event: null,
    holdS: SLACK_TOLERANCE_S,
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.35,
    label: 'Line under tension',
    prose: 'Once you are on the load, keep the line working. Three seconds of slack forfeits the recovery premium.',
    brief: 'Do not let the line go slack.',
    warnText: 'LINE SLACK — TAKE UP THE LOAD',
    breachText: 'Recovery premium lost: you let the line hang slack.',
    // bulk_haul ONLY, deliberately. A forbid term that samples the tether is vacuously honoured by a
    // player who never puts a line out, so on any type where tethering is optional it would pay a
    // 35% premium for ignoring the rope — the exact inverse of the point. bulk_haul is the one type
    // whose objective cannot be met without towing. Types where the rope is optional get the
    // `clean_release` REQUIRE instead, which has to be earned.
    appliesTo: ['bulk_haul'],
    minRisk: 0,
    tickSample(ctx) {
      const t = ctx.tether;
      return !!(t && t.active && t.phase === 'slack');
    },
  }),

  // ── 3. SOFT BERTH ───────────────────────────────────────────────────────────────────────────
  // The encounterScripts toll predicate (brake inside a radius, below a speed, for held ticks —
  // `:38-40`, `:291-297`) moved onto the mission board for the first time. A REQUIRE term: the
  // turn-in is refused, with a reason, until the player has actually come alongside under control.
  // Never a soft-lock — it is re-satisfiable at any time, and the deadline is the only pressure.
  soft_berth: Object.freeze({
    id: 'soft_berth',
    kind: 'require',
    blocking: true,          // the turn-in is refused until this is satisfied — see the note above
    event: null,
    holdS: BERTH_HOLD_S,
    count: 1,
    rewardMult: 1.15,
    label: 'Come alongside',
    prose: `Match the berth before you hand over: inside ${BERTH_RANGE_WU} wu of the destination and under ${BERTH_SPEED} wu/s.`,
    brief: `Arrive under ${BERTH_SPEED} wu/s.`,
    pendingText: `Hold alongside under ${BERTH_SPEED} wu/s before they will sign for it.`,
    satisfiedText: 'Alongside and under control — they will sign for it.',
    appliesTo: ['cargo_delivery', 'passenger_transport', 'bulk_trade', 'salvage_retrieval', 'bulk_haul'],
    minRisk: 0,
    tickSample(ctx) {
      if ((ctx.speed || 0) >= BERTH_SPEED) return false;
      return berthDistance(ctx) <= BERTH_RANGE_WU;
    },
  }),

  // ── 4. QUIET APPROACH ───────────────────────────────────────────────────────────────────────
  // "Break the blockade running dark", expressed with physics the player always has rather than a
  // cloak module they may not own. A hot burn into a watched berth is what gets you looked at.
  quiet_approach: Object.freeze({
    id: 'quiet_approach',
    kind: 'forbid',
    event: null,
    holdS: QUIET_APPROACH_HOLD_S,
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.25,
    label: 'Cold approach',
    prose: `Come into the destination quiet — no sustained burn above ${QUIET_APPROACH_SPEED} wu/s inside ${QUIET_APPROACH_RANGE_WU} wu of it.`,
    brief: 'Approach the drop cold.',
    warnText: 'HOT APPROACH — CUT THRUST',
    breachText: 'Quiet-approach premium lost: you came in hot and loud.',
    appliesTo: ['smuggling_run', 'passenger_transport'],
    minRisk: 1,
    tickSample(ctx) {
      if ((ctx.speed || 0) <= QUIET_APPROACH_SPEED) return false;
      return berthDistance(ctx) <= QUIET_APPROACH_RANGE_WU;
    },
  }),

  // ── 5. FRAGILE INTACT ───────────────────────────────────────────────────────────────────────
  // "Get the cargo there with the fragile crate intact." Emitter verified:
  // src/systems/fragileCargo.js:174 emits cargo:fragileLost from its physics:impact subscription.
  // Only attaches when the contract commodity is actually fragile (crystal/rare/exotic tags), so
  // the term is never free money.
  fragile_intact: Object.freeze({
    id: 'fragile_intact',
    kind: 'forbid',
    event: 'cargo:fragileLost',
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.20,
    label: 'Fragile — intact',
    prose: 'This freight does not survive a hard knock. Crack any of it and the contract is void.',
    brief: 'Do not crack the freight.',
    breachText: 'Contract void: the fragile freight cracked on impact.',
    appliesTo: ['cargo_delivery', 'salvage_retrieval', 'bulk_trade'],
    minRisk: 0,
    fits(offer, ctx) {
      const cmdtyId = offer && offer.params && offer.params.cmdtyId;
      return !!(cmdtyId && ctx && typeof ctx.isFragile === 'function' && ctx.isFragile(cmdtyId));
    },
    match(payload) {
      // The receipt is player-hold scoped by construction: fragileCargo plans the loss straight from
      // state.player.cargo, so any receipt at all is the player's freight cracking.
      return !!payload && (payload.totalQty == null || Number(payload.totalQty) > 0);
    },
  }),

  // ── 6. WEAPONS COLD ─────────────────────────────────────────────────────────────────────────
  // "Clear it without firing a shot — use mass." Emitter verified: src/systems/weapons.js:553/:687
  // emit combat:fire { ownerId }. DELIBERATELY NOT on bounty_hunt / patrol_clear: a mass kill does
  // not currently credit the player (src/combat/damage.js:276 is the only recordImpulseProvenance
  // call site, so a slung rock kills with actorId null and entity:killed carries no killerId), which
  // would make those two types unwinnable under this term. See the lane report handoff.
  weapons_cold: Object.freeze({
    id: 'weapons_cold',
    kind: 'forbid',
    event: 'combat:fire',
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.45,
    label: 'Weapons cold',
    prose: 'Run this one without firing. Shove, tow and outfly — but do not shoot.',
    brief: 'Do not fire a shot.',
    breachText: 'Contract void: you opened fire on a weapons-cold run.',
    appliesTo: ['escort', 'passenger_transport', 'recon_scan', 'cargo_delivery'],
    // Risk 2 = the "Accepted Contracts" standing gate. This is the hardest term in the catalog — one
    // reflex shot voids the contract and forfeits the deposit — so it is deliberately absent from the
    // first-hour board and shows up only once the player has standing and a reason to want 1.45x.
    minRisk: 2,
    match(payload, ctx) {
      return isPlayerOf(payload && payload.ownerId, ctx);
    },
  }),

  // ── 7. VENT DISCIPLINE ──────────────────────────────────────────────────────────────────────
  // Lane 5 restored the mining beam's heat/vent rhythm and emits mining:overheated
  // { minerId, heatMax, forfeitedOreU } (src/systems/mining.js:455). Pegging the gauge is now a
  // real mistake, so a contract can price it.
  vent_discipline: Object.freeze({
    id: 'vent_discipline',
    kind: 'forbid',
    event: 'mining:overheated',
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.30,
    label: 'Beam discipline',
    prose: 'Fill this quota without pegging the beam once. Pulse it.',
    brief: 'Do not overheat the beam.',
    breachText: 'Beam-discipline premium lost: you pegged the gauge.',
    appliesTo: ['mining_quota'],
    minRisk: 0,
    match(payload, ctx) {
      return isPlayerOf(payload && payload.minerId, ctx);
    },
  }),

  // ── 8. THREE CLEAN VENTS ────────────────────────────────────────────────────────────────────
  // The positive half of the same rhythm. mining:ventBonus { minerId, qty, depth, ... }
  // (src/systems/mining.js:503). A REQUIRE with a real counter — the first mission condition in the
  // game whose progress is a number the player can watch climb.
  vent_rhythm: Object.freeze({
    id: 'vent_rhythm',
    kind: 'require',
    blocking: true,          // strictly inside the player's control: filling the quota IS running the beam
    event: 'mining:ventBonus',
    count: 3,
    rewardMult: 1.35,
    label: 'Three clean vents',
    prose: 'The buyer is paying for technique: land three vent bonuses while you fill this.',
    brief: 'Land three vent bonuses.',
    pendingText: 'Three clean vents were part of the price. Keep pulsing the beam.',
    satisfiedText: 'Three clean vents logged.',
    appliesTo: ['mining_quota'],
    minRisk: 0,
    match(payload, ctx) {
      return isPlayerOf(payload && payload.minerId, ctx) && (payload.qty || 0) > 0;
    },
  }),

  // ── 9. ONE CLEAN RELEASE ────────────────────────────────────────────────────────────────────
  // Massline literacy as a contract term. tether:releaseRated carries the full release grade
  // (src/systems/tetherGameplay.js:1104 rateRelease → classification razor|clean|good|messy). This
  // is the term that makes a mission ask you to use the rope and judges HOW you used it.
  clean_release: Object.freeze({
    id: 'clean_release',
    kind: 'require',
    blocking: false,        // premium-only: satisfaction depends on world content being present
    event: 'tether:releaseRated',
    count: 1,
    rewardMult: 1.30,
    label: 'One clean release',
    prose: 'Show them the line works: one clean or razor release logged before you file this.',
    brief: 'Land one clean Massline release.',
    pendingText: 'They want one clean release on the line before they sign. Swing something and let go on the tangent.',
    satisfiedText: 'Clean release logged.',
    appliesTo: ['salvage_retrieval', 'bulk_haul', 'bounty_hunt', 'patrol_clear', 'mining_quota'],
    minRisk: 0,
    match(payload, ctx) {
      if (!payload || !isPlayerOf(payload.sourceId, ctx)) return false;
      return CLEAN_RELEASE_CLASSES.includes(payload.classification);
    },
  }),

  // ── 10. LAND MASS ON THEM ───────────────────────────────────────────────────────────────────
  // tether:whipImpact { victimId, relSpeed, mass, momentum, rating } — src/systems/masslineImpacts.js:184,
  // ungated by any feature flag. A "solid" or "crushing" rating means you actually put weight into
  // something. This is the game's thesis expressed as a contract term.
  mass_on_target: Object.freeze({
    id: 'mass_on_target',
    kind: 'require',
    blocking: false,        // premium-only: satisfaction depends on world content being present
    event: 'tether:whipImpact',
    count: 1,
    rewardMult: 1.40,
    label: 'Put mass on them',
    prose: 'Land one solid mass strike on this job — a rock, a wreck, anything with weight behind it.',
    brief: 'Land one solid mass strike.',
    pendingText: 'The bonus wanted mass on the target. Tether something heavy and swing it into them.',
    satisfiedText: 'Solid mass strike logged.',
    appliesTo: ['patrol_clear', 'bounty_hunt', 'escort'],
    minRisk: 1,
    match(payload) {
      return !!payload && SOLID_WHIP_RATINGS.includes(payload.rating);
    },
  }),

  // ── 11. THROW IT ────────────────────────────────────────────────────────────────────────────
  // massline:throw (src/systems/masslineThrow.js:425) is gated on massline2Flag('throw') — ON in the
  // production profile, OFF in legacy47a. A require term that cannot fire would be a soft-lock, so
  // requiresFeature refuses attachment wherever the verb does not exist.
  throw_it: Object.freeze({
    id: 'throw_it',
    kind: 'require',
    blocking: false,        // premium-only: satisfaction depends on world content being present
    event: 'massline:throw',
    count: 1,
    rewardMult: 1.35,
    requiresFeature: 'throw',
    label: 'Throw it',
    prose: 'Finish at least one of them with a thrown mass, not a gun.',
    brief: 'Land one Massline throw.',
    pendingText: 'They are paying for a thrown mass. Grab something and sling it.',
    satisfiedText: 'Throw logged.',
    appliesTo: ['patrol_clear', 'bounty_hunt'],
    minRisk: 2,
    match(payload) {
      return !!payload && payload.payloadId != null;
    },
  }),

  // ── 12. BULK ON THE LINE ────────────────────────────────────────────────────────────────────
  // Lane 5 made the bulk core chunk reachable for the first time; asteroid:chunked now carries
  // { bulkCore, massU } (src/systems/mining.js:966). A forfeit-grade term so a field with no rock
  // large enough to core can never void a contract — it only costs the premium.
  core_on_the_line: Object.freeze({
    id: 'core_on_the_line',
    kind: 'require',
    blocking: false,        // premium-only: satisfaction depends on world content being present
    event: 'asteroid:chunked',
    count: 1,
    rewardMult: 1.30,
    label: 'Break a core loose',
    prose: 'Crack something big enough to leave a core chunk behind. That is what the refinery is short of.',
    brief: 'Break one core chunk loose.',
    pendingText: 'No core chunk yet. Work a bigger rock — the beam will not swallow the core.',
    satisfiedText: 'Core chunk broken loose.',
    appliesTo: ['mining_quota'],
    minRisk: 1,
    match(payload, ctx) {
      return !!payload && payload.bulkCore === true && isPlayerOf(payload.minerId, ctx);
    },
  }),
});

export const MISSION_CONDITION_IDS = Object.freeze(Object.keys(MISSION_CONDITIONS));

/** Lookup a condition by id (frozen record or undefined). */
export function missionConditionById(id) {
  return MISSION_CONDITIONS[id];
}

/**
 * Every bus event this catalog can observe. This is the generalised form of the shipped
 * OBSERVED_CLAUSE_EVENTS allowlist: three events became N, but the discipline is identical — a term
 * whose event is not in this set is never attached and never evaluated.
 */
export const MISSION_CONDITION_EVENTS = Object.freeze([...new Set(
  MISSION_CONDITION_IDS
    .map((id) => MISSION_CONDITIONS[id].event)
    .filter((event) => typeof event === 'string' && event.length > 0),
)]);

/** Conditions with no `event` are evaluated by the per-tick predicate slot in missions.update(). */
export const TICK_CONDITION_IDS = Object.freeze(
  MISSION_CONDITION_IDS.filter((id) => !MISSION_CONDITIONS[id].event),
);

/** The serializable row a condition contributes to `offer.clauses` (same shape a clause uses). */
export function serializableMissionCondition(id) {
  const c = MISSION_CONDITIONS[id];
  if (!c) return null;
  return {
    id: c.id,
    conditionId: c.id,          // marks the row as a physics condition, not fine print
    kind: c.kind,
    event: c.event || null,
    label: c.label,
    prose: c.prose,
    rewardMult: c.rewardMult,
  };
}

/** True when a clause-array row was contributed by this catalog. */
export function isMissionConditionRow(row) {
  return !!(row && row.conditionId && MISSION_CONDITIONS[row.conditionId]);
}

/**
 * Count ONE satisfied occurrence of a condition onto a mission instance and report what happened.
 *
 * This is the single counter shared by both halves of the observer — the event half in
 * contractClauses.js and the per-tick predicate half in missions.update() — so an event term and a
 * tick term can never drift apart in how they count, latch, or settle. It mutates only
 * `mission._clauseState[def.id]`, which is a plain-JSON subtree of the mission instance and is
 * therefore already carried by the shipped mission serializer (save-safe by construction: no new
 * top-level state, no new save-schema path).
 *
 * Returns 'ignored' (already latched), 'progress' (counted, target not reached yet),
 * 'satisfied' (a require term is now met) or 'breached' (a forbid term has now tripped).
 */
export function tallyMissionCondition(mission, def, simTime = 0) {
  if (!mission || !def) return 'ignored';
  if (!mission._clauseState) mission._clauseState = {};
  const runtime = mission._clauseState[def.id] || (mission._clauseState[def.id] = { count: 0 });
  if (runtime.breached || runtime.satisfied) return 'ignored';
  runtime.count = (runtime.count || 0) + 1;
  const need = Math.max(1, Math.round(Number(def.count) || 1));
  if (runtime.count < need) return 'progress';
  runtime.at = Number.isFinite(simTime) ? simTime : 0;
  if (def.kind === 'require') { runtime.satisfied = true; return 'satisfied'; }
  runtime.breached = true;
  return 'breached';
}

/** Occurrences still needed before a term latches. */
export function conditionRemaining(mission, def) {
  const need = Math.max(1, Math.round(Number(def && def.count) || 1));
  const runtime = mission && mission._clauseState && mission._clauseState[def && def.id];
  return Math.max(0, need - ((runtime && runtime.count) || 0));
}

export default MISSION_CONDITIONS;
