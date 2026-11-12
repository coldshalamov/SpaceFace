import { hash32, mulberry32 } from '../core/rng.js';

// src/data/missionConditions.js — PHYSICS-AWARE MISSION CONDITIONS (data catalog).
// PQ-152.03 twist clauses ride here too: they attach on their own seed stream and mutate
// the contract mid-run (PQ-138.04) instead of voiding it.
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
//   warnOnly      tick terms only: the sample is a warning light and never tallies — warnText fires
//                 while it holds, and the latch belongs to the owner's own event/dock handler.
//                 For a forbid the player can still fix in flight (dump, or go declare).
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
// M18 honest shortcut — a delivery punctuality premium earned by local geometry knowledge.
// The sling must be recent (an old swing is not punctuality) and the delivery must land well
// inside the window (a photo finish is scheduling, not a shortcut). Both are NEW tuning owned
// by this catalog: no flight constant, no deadline, no payout base is retuned.
export const HONEST_SLING_SLING_WINDOW_S = 240;  // the swing counts this long after the cut
export const HONEST_SLING_EARLY_FRACTION = 0.6;  // settle inside the first 60% of the window

const isPlayerOf = (id, ctx) => id != null && ctx && ctx.playerId != null && id === ctx.playerId;

// ── W-TENDER shared reads ────────────────────────────────────────────────────────────────────────
// The Tender's three terms read the dock and the hold through ctx.state (the escort_turns
// precedent: the event-clause ctx carries no cargo, so the tender terms are TICK-shaped). The
// registry freezes full-tick systems while `ui.docked` (src/core/presentationFreeze.js), so the
// LIVE latch path for the dock moments is missions' own dock:docked handler, which stamps the
// SAME `_clauseState` tally shapes these samples produce. The samples stay the canonical catalog
// truth and drive any context where ticks run with a docked UI state (headless harnesses, probes).
// manifest_undisclosed is the exception: its sample is a warnOnly light over the desk's sector, and
// the dock handler is its only latch.
//
// The rival-queue ledger lives on the mission's own subrecord (`mission.tender.rivals`), owned and
// re-bound by src/missions/tenderHaul.js. One rival HOLDS the scan face while its hull is alive and
// its authored dwell has not elapsed; the face frees as each completes and departs.
const TENDER_GATE_STATION_ID = 'station_customs';
const TENDER_DESK_SECTOR_ID = 'sector_vesta_forge';

function tenderDockedAt(state, stationId) {
  const ui = state && state.ui;
  return !!(ui && ui.docked === true && ui.dockedStationId === stationId);
}

/** Total hold units aboard, across every stack. Tier-0 ore is 1.0 vol/u, so units read as mass. */
function tenderUnitsAboard(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items || typeof items !== 'object') return 0;
  let total = 0;
  for (const id of Object.keys(items)) total += Math.max(0, Math.floor(Number(items[id]) || 0));
  return total;
}

/**
 * Unmanifested mass at the weigh face: everything aboard that is not the contract ore, plus
 * contract ore beyond the lot. The same reading src/missions/tenderHaul.js weighs at both weighs.
 */
function tenderUnmanifestedUnits(mission, state) {
  const params = (mission && mission.params) || {};
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const contract = params.cmdtyId && items
    ? Math.max(0, Math.floor(Number(items[params.cmdtyId]) || 0)) : 0;
  const lot = Math.max(0, Math.trunc(Number(params.qty) || 0));
  return Math.max(0, tenderUnitsAboard(state) - contract) + Math.max(0, contract - lot);
}

/** Unmanifested units a Tally declaration already covered (0 without one). */
function tenderDeclaredOverUnits(mission) {
  const params = mission && mission.params;
  if (!params || params.weighDeclared !== true || params.weighAtDesk !== false) return 0;
  return Math.max(0, Math.trunc(Number(params.weighOverU) || 0));
}

/** True once the Forge intake itself has weighed the run — nothing is left for it to flag. */
function tenderIntakeWeighed(mission) {
  const params = mission && mission.params;
  if (!params) return false;
  if (params.weighDeclared === true && params.weighAtDesk === true) return true;
  return params.intakeWeighAt_s != null && Number.isFinite(Number(params.intakeWeighAt_s));
}

/** True while any queued rival still holds the scan face on its own authored dwell. */
function tenderScanFaceHeld(mission, state, now) {
  const tender = mission && mission.tender;
  const rivals = tender && Array.isArray(tender.rivals) ? tender.rivals : [];
  const entities = state && state.entities;
  for (const rival of rivals) {
    if (!rival || rival.departed) continue;
    if (Number.isFinite(rival.dwellUntil) && now < rival.dwellUntil) {
      const entity = rival.id != null && entities && entities.get ? entities.get(rival.id) : null;
      if (entity && entity.alive !== false) return true;
    }
  }
  return false;
}

/** The desk's intake-window close, in sim seconds; a legacy instance falls back to its deadline. */
function tenderCloseAtOf(mission) {
  const close = Number(mission && mission.params && mission.params.tenderCloseAt_s);
  if (Number.isFinite(close)) return close;
  const deadline = Number(mission && mission.deadline_s);
  return Number.isFinite(deadline) ? deadline : null;
}


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
    appliesTo: ['bulk_haul', 'tow_recovery', 'authored_set_piece'],
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
    appliesTo: ['cargo_delivery', 'passenger_transport', 'bulk_trade', 'salvage_retrieval', 'bulk_haul', 'tow_recovery', 'rescue_under_fire'],
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
    appliesTo: ['smuggling_run', 'passenger_transport', 'authored_set_piece'],
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

  // ── 5b. FRAGILE GRADED — SF-114 damage clause ─────────────────────────────────────────────
  // The negotiated alternative to intact-or-void: a smaller handling premium that survives a
  // crack. Breach forfeits the premium only — the contract stays live, the spilled units are
  // physically gone (re-scoopable or lost), and whatever still sits in the hold settles on the
  // recorded per-unit terms through the NXB-028 partial path. Same `isFragile` gate as
  // fragile_intact, same 'fragile' group — the two terms never co-attach to one offer.
  fragile_graded: Object.freeze({
    id: 'fragile_graded',
    kind: 'forbid',
    event: 'cargo:fragileLost',
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.15,
    label: 'Fragile — graded terms',
    prose: 'Freight priced by the unit on arrival. A hard knock costs the handling premium and whatever cracked — the rest still settles.',
    brief: 'Cracks cost the premium; the survivors still pay.',
    breachText: 'Handling premium lost: fragile freight cracked on impact — the survivors still settle.',
    appliesTo: ['cargo_delivery', 'salvage_retrieval', 'bulk_trade'],
    minRisk: 0,
    fits(offer, ctx) {
      const cmdtyId = offer && offer.params && offer.params.cmdtyId;
      return !!(cmdtyId && ctx && typeof ctx.isFragile === 'function' && ctx.isFragile(cmdtyId));
    },
    match(payload) {
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
    appliesTo: ['escort', 'passenger_transport', 'recon_scan', 'cargo_delivery', 'authored_set_piece'],
    // Risk 2 = the "Accepted Contracts" standing gate. This is the hardest term in the catalog — one
    // reflex shot voids the contract and forfeits the deposit — so it is deliberately absent from the
    // first-hour board and shows up only once the player has standing and a reason to want 1.45x.
    minRisk: 2,
    match(payload, ctx) {
      return isPlayerOf(payload && payload.ownerId, ctx);
    },
  }),

  // ── 7. VENT DISCIPLINE ──────────────────────────────────────────────────────────────────────
  // Removed 2026-09-22: the owner ruling in f524ade41 dropped the beam overheat state machine
  // entirely — mining:overheated is no longer emitted, so a forbid term priced on it could never
  // breach and was dead content. vent_rhythm below still prices the live vent rhythm.

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
    appliesTo: ['salvage_retrieval', 'bulk_haul', 'bounty_hunt', 'patrol_clear', 'mining_quota', 'tow_recovery', 'authored_set_piece'],
    minRisk: 0,
    match(payload, ctx) {
      if (!payload || !isPlayerOf(payload.sourceId, ctx)) return false;
      return CLEAN_RELEASE_CLASSES.includes(payload.classification);
    },
  }),

  // ── 10. THE HONEST SHORTCUT (M18) ───────────────────────────────────────────────────────
  // A delivery punctuality premium earned by local geometry knowledge, not by a faster ship:
  // swing a Massline anchor and let go clean (the sling), then brake honestly and run out under
  // control to the berth, settling well inside the contract window. Emitter verified:
  // src/systems/tetherGameplay.js emits tether:releaseRated on every cut/break with the cadence
  // grade (classification clean|razor on a real tangent release, deliberate on a player cut).
  // The timing half is a tick sample against the mission's own window, so no new event exists.
  //
  // Premium-only (blocking false, onBreach unused): a delivery without the sling — or a slung
  // run that arrives late or hot — still settles at exactly base pay. The turn-in is never
  // refused and the contract never fails on this term; the receipt reads `unmet`, never breach.
  // One event per definition (the language counts each half through the shared tally): the event
  // half stamps the sling, the tick half stamps the early controlled arrival, and the term pays
  // only when BOTH stamps are present at settlement. honest_sling is the catalog's first
  // dual-half term, so TICK_CONDITION_IDS names it explicitly alongside the event-free terms —
  // the observer routes the sling event, the per-tick slot routes the arrival sample.
  honest_sling: Object.freeze({
    id: 'honest_sling',
    kind: 'require',
    blocking: false,        // premium-only: never refuses the turn-in, never fails the contract
    event: 'tether:releaseRated',
    count: 2,               // TWO stamps through the one shared tally: the sling, then the arrival
    rewardMult: 1.25,
    label: 'Honest shortcut',
    prose: 'Know the local geometry: sling an anchor and let go clean on the Massline, then brake honest and run out under control to the berth well inside the window. Early slung deliveries earn a punctuality premium on top of base pay.',
    brief: 'Sling an anchor clean, deliver early and under control.',
    pendingText: 'No honest shortcut logged yet — sling an anchor clean and bring her in early and under control.',
    satisfiedText: 'Honest shortcut logged — early and under control off a clean sling.',
    appliesTo: ['cargo_delivery'],
    minRisk: 1,
    match(payload, ctx) {
      // The sling half: the PLAYER's deliberate clean-or-razor release. Breaks, target loss,
      // and other pilots' lines never stamp it (rateRelease marks deliberate only on a cut).
      if (!payload || !isPlayerOf(payload.sourceId, ctx)) return false;
      if (payload.deliberate !== true) return false;
      if (!CLEAN_RELEASE_CLASSES.includes(payload.classification)) return false;
      const mission = ctx && ctx.mission;
      if (mission) {
        if (!mission._clauseState) mission._clauseState = {};
        const runtime = mission._clauseState.honest_sling
          || (mission._clauseState.honest_sling = { count: 0 });
        // Stamp simTime, never a zero default: a sling fired at the epoch start must still
        // read as fresh against the window math below.
        const stamped = Number.isFinite(ctx.simTime) && ctx.simTime > 0 ? ctx.simTime : 0.001;
        // The release half latches separately: a second clean release refreshes the swing
        // but never stamps the arrival half, so two releases alone stay at 1 of 2 and only
        // a qualifying early controlled arrival can satisfy the term.
        if ((runtime.count || 0) >= 1 || Number.isFinite(runtime.slingAt)) {
          runtime.slingAt = stamped;
          return false;
        }
        runtime.slingAt = stamped;
      }
      return true;
    },
    // The arrival half: well inside the mission's own window, alongside the berth and under
    // control (BERTH_RANGE_WU / BERTH_SPEED, the same limits soft_berth teaches). Sampled per
    // tick; the shared tally latches it exactly once. The SAME count-2 tally both halves share
    // means the event arm alone (sling, 1 of 2) never satisfies — arrival must follow while the
    // swing is fresh. A stale swing simply leaves the term at 1 of 2: unmet at settlement, never
    // a breach.
    holdS: BERTH_HOLD_S,
    tickSample(ctx) {
      const mission = ctx && ctx.mission;
      if (!mission) return false;
      const runtime = mission._clauseState && mission._clauseState.honest_sling;
      // No sling, no shortcut: the arrival half cannot stamp first.
      if (!runtime || !Number.isFinite(runtime.slingAt)) return false;
      if (runtime.satisfied || runtime.breached) return false;
      const now = Number.isFinite(ctx.simTime) ? ctx.simTime : 0;
      // The swing goes stale: an old sling is not punctuality.
      if (now - runtime.slingAt > HONEST_SLING_SLING_WINDOW_S) return false;
      const acceptedAt = Number(mission.acceptedAt_s);
      const deadline = Number(mission.deadline_s);
      if (!Number.isFinite(acceptedAt) || !Number.isFinite(deadline) || deadline <= acceptedAt) return false;
      if (now > acceptedAt + (deadline - acceptedAt) * HONEST_SLING_EARLY_FRACTION) return false;
      if ((ctx.speed || 0) >= BERTH_SPEED) return false;
      return berthDistance(ctx) <= BERTH_RANGE_WU;
    },
  }),

  // ── 10b. THE INTAKE WINDOW (W-TENDER) ───────────────────────────────────────────────────────
  // The tender's 1.5× premium: the lot sold into the desk BEFORE the intake window closes. A late
  // sale still settles the contract at base — the window re-prices, it never voids — so the term
  // is a non-blocking require like honest_sling, and the SAME dual-half shape: the event half
  // (economy:tradeCompleted, verified emitter src/systems/economy.js:3480) stamps the desk sale;
  // the tick half stamps "sold before close" and completes the shared count-2 tally. Because the
  // lot's completing sale is ALSO the mission's completing event (missions._onTrade settles the
  // quota synchronously, ahead of this catalog's observer), missions' tender _onTrade branch
  // stamps the same tally itself at that moment — the stamp below is the run's bookkeeping for
  // multi-sale lots, and the two paths converge on one runtime shape.
  tender_window: Object.freeze({
    id: 'tender_window',
    kind: 'require',
    blocking: false,        // premium-only: a late sale settles at base, never refused
    event: 'economy:tradeCompleted',
    count: 2,               // TWO stamps through the one shared tally: the desk sale, then "before close"
    rewardMult: 1.5,
    label: 'Intake window',
    prose: 'Sell the lot into the desk before the intake window closes and the desk honors a 1.5× tender premium. A late sale still settles at base terms — the window re-prices the run, it never voids it — but the settle keeps the run only when at least half the lot sold: under that the run fails forward and the stake goes with it, and the desk posts a spot row so what remains aboard still has a market.',
    brief: 'Sell before the window closes — half must sell.',
    pendingText: 'The tender premium wants the lot sold into the desk before the window closes.',
    satisfiedText: 'Window sale logged — the desk honors the tender premium.',
    appliesTo: ['tender_haul'],
    minRisk: 0,
    match(payload, ctx) {
      // The desk-sale half: a SELL of the contract ore AT the desk berth. First qualifying sale
      // stamps and counts 1 of 2; later sales refresh the stamp without counting, so one
      // completing sale can never satisfy the term alone.
      const mission = ctx && ctx.mission;
      if (!mission || !payload || payload.side !== 'sell') return false;
      const deskId = mission.destStationId;
      if (deskId && payload.stationId !== deskId) return false;
      const cmdtyId = mission.params && mission.params.cmdtyId;
      if (cmdtyId && payload.commodityId !== cmdtyId) return false;
      if (!mission._clauseState) mission._clauseState = {};
      const runtime = mission._clauseState.tender_window
        || (mission._clauseState.tender_window = { count: 0 });
      if (runtime.satisfied || runtime.breached) return false;
      const stamped = Number.isFinite(ctx.simTime) && ctx.simTime > 0 ? ctx.simTime : 0.001;
      if ((runtime.count || 0) >= 1 || Number.isFinite(runtime.soldAt)) {
        runtime.soldAt = stamped;
        return false;
      }
      runtime.soldAt = stamped;
      return true;
    },
    // The "sold before close" half: the desk's count is full (the quota the owner scores) and the
    // stamp predates the window close. Runs per tick; the shared tally latches it exactly once.
    holdS: 0,
    tickSample(ctx) {
      const mission = ctx && ctx.mission;
      if (!mission) return false;
      const runtime = mission._clauseState && mission._clauseState.tender_window;
      if (!runtime || !Number.isFinite(runtime.soldAt)) return false;
      if (runtime.satisfied || runtime.breached) return false;
      const need = Math.max(1, Math.round(Number(mission.objectiveTarget) || 0));
      if ((mission.objectiveProgress || 0) < need) return false;
      const closeAt = tenderCloseAtOf(mission);
      if (closeAt == null) return false;
      return (Number(ctx.simTime) || 0) <= closeAt;
    },
  }),

  // ── 10c. DECLARED AT THE TALLY (W-TENDER) ───────────────────────────────────────────────────
  // The honest weigh: dock Concord's Customs Gate and wait your slot. Two rival haulers hold the
  // scan face on their own authored dwells (~50 s each, staggered) — the face frees as each
  // completes and departs, and the declaration latches only when the player's slot opens. Waiting
  // is real: queue seconds are window seconds. Latching stamps the unmanifested duty at the weigh
  // moment (never re-read at settle) and moves Concord +1 through the secondary rep channel.
  grader_declared: Object.freeze({
    id: 'grader_declared',
    kind: 'require',
    blocking: false,        // premium-only: running the chord is the priced alternative arm
    event: null,
    holdS: 1.0,
    count: 1,
    rewardMult: 1.10,
    label: 'Declared at the Tally',
    prose: 'Dock the Customs Gate on the chord and hold until your slot opens — the rivals on the scan face work their own clocks, and the desk weighs your unmanifested mass at 4 cr/u the moment you declare. The receipt stays clean: +10% paperwork and +1 Concord standing. Or run the direct chord and keep the clock — the Forge intake weighs what lands.',
    brief: 'Declare at the Customs Gate or run the chord.',
    pendingText: 'The desk pays the paperwork premium for a declaration at the Tally.',
    satisfiedText: 'Declared at the Tally — the receipt stays clean.',
    appliesTo: ['tender_haul'],
    minRisk: 0,
    tickSample(ctx) {
      const mission = ctx && ctx.mission;
      if (!mission) return false;
      const runtime = mission._clauseState && mission._clauseState.grader_declared;
      if (runtime && (runtime.satisfied || runtime.breached)) return false;
      const state = ctx.state;
      if (!tenderDockedAt(state, TENDER_GATE_STATION_ID)) return false;
      return !tenderScanFaceHeld(mission, state, Number(ctx.simTime) || 0);
    },
  }),

  // ── 10d. UNDISCLOSED MASS (W-TENDER) ────────────────────────────────────────────────────────
  // The smuggler's weigh: dock the Forge with unmanifested mass no Tally declaration covers and
  // the intake flags it. A forfeit-grade forbid — the contract still settles and the window
  // premium still stands; the flag costs the same 4 cr/u duty, stamped at the intake weigh, and
  // −2 Concord through the secondary channel, while the +10% paperwork premium is only ever
  // earned by a Tally declaration. The contract iron itself is manifest-covered up to the lot.
  // The sample is a WARNING light (warnOnly): undeclared side mass anywhere in the desk's sector
  // warns while a dump is still possible, and missions' dock handler is the only latch.
  manifest_undisclosed: Object.freeze({
    id: 'manifest_undisclosed',
    kind: 'forbid',
    event: null,
    holdS: 1.0,
    count: 1,
    onBreach: 'forfeit',
    warnOnly: true,
    // The clean forbid rides at ×1.0: its weight is the duty, the −2 Concord mark, and the
    // paperwork premium a flag forecloses — never a premium of its own, never a penalty multiplier.
    rewardMult: 1.0,
    label: 'Undisclosed mass',
    prose: 'The Forge intake weighs what lands. Dock with unmanifested mass no Tally declaration covers and the intake flags it: the same 4 cr/u duty stamps on the receipt and Concord marks you −2 — and the +10% paperwork premium is only ever earned by declaring at the Tally. The contract iron itself is manifest-covered up to the lot — dump the side stack, declare it at the Tally, or pay the weigh.',
    brief: 'No undeclared mass at the Forge dock.',
    warnText: 'UNMANIFESTED MASS ABOARD — DECLARE AT THE TALLY OR DUMP BEFORE THE INTAKE',
    breachText: 'Flagged at intake: the Forge weighed undeclared mass — 4 cr/u duty stamps and Concord marks the receipt −2.',
    appliesTo: ['tender_haul'],
    minRisk: 0,
    tickSample(ctx) {
      const mission = ctx && ctx.mission;
      if (!mission) return false;
      const runtime = mission._clauseState && mission._clauseState.manifest_undisclosed;
      if (runtime && (runtime.satisfied || runtime.breached)) return false;
      const state = ctx.state;
      const sectorId = state && state.world && state.world.currentSectorId;
      if (!sectorId || sectorId !== (mission.destSectorId || TENDER_DESK_SECTOR_ID)) return false;
      if (tenderIntakeWeighed(mission)) return false;
      return tenderUnmanifestedUnits(mission, state) - tenderDeclaredOverUnits(mission) > 0;
    },
  }),

  // ── 11. LAND MASS ON THEM ───────────────────────────────────────────────────────────────────
  // tether:whipImpact carries a solid-or-crushing rating when real weight lands on something.
  // This is the game's thesis expressed as a contract term.
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
    appliesTo: ['patrol_clear', 'bounty_hunt', 'escort', 'demolition', 'authored_set_piece', 'capital_boss'],
    minRisk: 1,
    match(payload) {
      return !!payload && SOLID_WHIP_RATINGS.includes(payload.rating);
    },
  }),

  // ── 12. THROW IT ────────────────────────────────────────────────────────────────────────────
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
    appliesTo: ['patrol_clear', 'bounty_hunt', 'demolition', 'authored_set_piece', 'capital_boss'],
    minRisk: 2,
    match(payload) {
      return !!payload && payload.payloadId != null;
    },
  }),

  // ── 13. BULK ON THE LINE ────────────────────────────────────────────────────────────────────
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

  // ── 14. SILENT RUNNER ───────────────────────────────────────────────────────────────────────
  // Covert infiltration discipline (Wave M2 §4.2 cloak integration): slip through the lane without
  // blowing your cloak via forced depletion or combat breach. Emitter verified: src/systems/cloak.js:117
  // emits cloak:dropped { reason, energy }. A breach reason of 'depleted' (ran out of power) or
  // 'fired' (broke cloak by firing) voids the silent-runner premium; intentional graceful deactivation
  // ('toggled') is allowed.
  silent_runner: Object.freeze({
    id: 'silent_runner',
    kind: 'forbid',
    event: 'cloak:dropped',
    count: 1,
    onBreach: 'forfeit',
    rewardMult: 1.35,
    requiresFeature: 'cloak',
    label: 'Silent runner',
    prose: 'Keep your cloak discipline intact on this run — do not let the cloak blow out or break under fire.',
    brief: 'Do not blow or break your cloak.',
    breachText: 'Silent-runner premium lost: your cloak was compromised.',
    appliesTo: ['smuggling_run', 'recon_scan', 'passenger_transport'],
    minRisk: 2,
    match(payload) {
      return !!payload && (payload.reason === 'depleted' || payload.reason === 'fired');
    },
  }),

  // ── 15–19. TWIST CLAUSES (PQ-152.03) ────────────────────────────────────────────────────────
  // Mid-run terms. They fire during the job and mutate the contract (PQ-138.04) instead of
  // voiding it. `fits` stays false so the existing physics-term attach pool — and its goldens —
  // cannot see them. missions._withConditions stamps them on a separate `twist` seed stream.

  escort_turns: Object.freeze({
    id: 'escort_turns',
    twist: true,
    kind: 'forbid',
    event: null,
    holdS: 1.0,
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.20,
    label: 'The escort turns',
    prose: 'This convoy may show its real colours mid-run. If they turn, the job becomes a hunt — it does not die in a red box.',
    brief: 'If the escort turns, hunt them.',
    warnText: 'ESCORT TURNING — THEY ARE NOT YOURS',
    breachText: 'The escort turned. Hunt contract is live.',
    appliesTo: ['escort'],
    minRisk: 2,
    fits() { return false; },
    tickSample(ctx) {
      const mission = ctx && ctx.mission;
      const id = mission && mission._escorteeId;
      const entity = id != null && ctx.state && ctx.state.entities
        ? ctx.state.entities.get(id) : null;
      if (!entity || entity.alive === false) return false;
      if (entity.data && entity.data.escortTurned) return true;
      const playerTeam = ctx.player && ctx.player.team;
      return playerTeam != null && entity.team != null && entity.team !== playerTeam;
    },
  }),

  cargo_volatile: Object.freeze({
    id: 'cargo_volatile',
    twist: true,
    kind: 'forbid',
    event: 'cargo:volatileSlam',
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.20,
    label: 'Cargo is volatile',
    prose: 'This lot can cook mid-run. If it slams, the job becomes a recovery — not a voided manifest.',
    brief: 'If the cargo cooks, recover it.',
    breachText: 'The cargo cooked. Recovery contract is live.',
    appliesTo: ['cargo_delivery', 'smuggling_run', 'bulk_trade'],
    minRisk: 1,
    fits() { return false; },
    match(payload) {
      return !!payload && (payload.podId != null || payload.appliedImpulse > 0 || !!payload.class);
    },
  }),

  buyer_is_the_law: Object.freeze({
    id: 'buyer_is_the_law',
    twist: true,
    kind: 'forbid',
    event: null,
    holdS: QUIET_APPROACH_HOLD_S,
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.25,
    label: 'The buyer is the law',
    prose: 'The drop may be a sting. Come in close and the contract reroutes — you still have a buyer, just not this one.',
    brief: 'If the buyer is the law, reroute.',
    warnText: 'STING BERTH — THIS BUYER IS THE LAW',
    breachText: 'The buyer is the law. New drop is live.',
    appliesTo: ['cargo_delivery', 'smuggling_run', 'bulk_trade'],
    minRisk: 1,
    fits() { return false; },
    tickSample(ctx) {
      return berthDistance(ctx) <= QUIET_APPROACH_RANGE_WU;
    },
  }),

  wreck_wakes: Object.freeze({
    id: 'wreck_wakes',
    twist: true,
    kind: 'forbid',
    event: 'physics:impact',
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.20,
    label: 'The wreck wakes',
    prose: 'This hull may still have a crew. Wake it and the salvage becomes a hunt — the wreck stays the reason to be here.',
    brief: 'If the wreck wakes, hunt it.',
    breachText: 'The wreck woke. Hunt contract is live.',
    appliesTo: ['salvage_retrieval'],
    minRisk: 1,
    fits() { return false; },
    match(payload, ctx) {
      if (!payload || !payload.playerInvolved) return false;
      const mission = ctx && ctx.mission;
      // The target-id Set is rebuilt only when the mission's ids or escortee change — this
      // match runs on every player-involved physics:impact, so a fresh Set per contact was
      // steady churn in debris fights.
      let ids = mission && mission._wreckWakesIds;
      if (!mission) {
        ids = null;
      } else if (!ids
          || mission._wreckWakesIdsSource !== mission.targetEntityIds
          || mission._wreckWakesIdsLength !== (mission.targetEntityIds ? mission.targetEntityIds.length : 0)
          || mission._wreckWakesIdsEscortee !== mission._escorteeId) {
        ids = new Set(mission.targetEntityIds || []);
        if (mission._escorteeId != null) ids.add(mission._escorteeId);
        mission._wreckWakesIds = ids;
        mission._wreckWakesIdsSource = mission.targetEntityIds;
        mission._wreckWakesIdsLength = mission.targetEntityIds ? mission.targetEntityIds.length : 0;
        mission._wreckWakesIdsEscortee = mission._escorteeId;
      }
      if (!ids || !ids.size) {
        return payload.aId != null || payload.bId != null;
      }
      return ids.has(payload.aId) || ids.has(payload.bId);
    },
  }),

  pods_are_bait: Object.freeze({
    id: 'pods_are_bait',
    twist: true,
    kind: 'forbid',
    event: null,
    holdS: QUIET_APPROACH_HOLD_S,
    count: 1,
    onBreach: 'fail',
    rewardMult: 1.20,
    label: 'The pods are bait',
    prose: 'The distress may be an ambush. Close on the pods and the rescue becomes a field-clear — the pods stay in the picture.',
    brief: 'If the pods are bait, clear the field.',
    warnText: 'BAIT PODS — THIS IS AN AMBUSH',
    breachText: 'The pods were bait. Clear-field contract is live.',
    appliesTo: ['rescue_under_fire', 'escort'],
    minRisk: 2,
    fits() { return false; },
    tickSample(ctx) {
      if (berthDistance(ctx) <= QUIET_APPROACH_RANGE_WU) return true;
      const mission = ctx && ctx.mission;
      const player = ctx && ctx.player;
      const entities = ctx && ctx.state && ctx.state.entities;
      if (!mission || !player || !player.pos || !entities) return false;
      for (const id of mission.targetEntityIds || []) {
        const entity = entities.get(id);
        if (!entity || !entity.pos) continue;
        const role = entity.data && entity.data.physicalRole;
        if (role && role !== 'rescue_pod' && role !== 'life_pod') continue;
        const range = Math.hypot(
          (player.pos.x || 0) - (entity.pos.x || 0),
          (player.pos.z || 0) - (entity.pos.z || 0),
        );
        if (range <= QUIET_APPROACH_RANGE_WU) return true;
      }
      return false;
    },
  }),
});

export const MISSION_CONDITION_IDS = Object.freeze(Object.keys(MISSION_CONDITIONS));

export const TWIST_CLAUSE_IDS = Object.freeze([
  'escort_turns',
  'cargo_volatile',
  'buyer_is_the_law',
  'wreck_wakes',
  'pods_are_bait',
]);

const TWIST_CLAUSE_ID_SET = new Set(TWIST_CLAUSE_IDS);

export const TWIST_MUTATIONS = Object.freeze({
  escort_turns: Object.freeze({ type: 'bounty_hunt', tag: 'turned', keepTargets: true }),
  cargo_volatile: Object.freeze({ type: 'salvage_retrieval', tag: 'cooked' }),
  buyer_is_the_law: Object.freeze({ type: 'cargo_delivery', tag: 'sting' }),
  wreck_wakes: Object.freeze({ type: 'bounty_hunt', tag: 'wakes', keepTargets: true }),
  pods_are_bait: Object.freeze({ type: 'patrol_clear', tag: 'bait', keepTargets: true }),
});

const TWIST_SKIP_SOURCES = Object.freeze(new Set([
  'authoredSetPiece',
  'capitalBoss',
  'missionMutation',
  'onboardingChoice',
]));

const TWIST_ATTACH_PROB = Object.freeze([0.18, 0.48, 0.62, 0.74, 0.84]);

export function isTwistCondition(idOrDef) {
  const id = typeof idOrDef === 'string' ? idOrDef : idOrDef && idOrDef.id;
  return TWIST_CLAUSE_ID_SET.has(id);
}

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

/** Conditions with no `event` — plus the dual-half terms (honest_sling's tick half stamps the
 * arrival; tender_window's tick half stamps "sold before close") — are evaluated by the per-tick
 * predicate slot in missions.update(). A dual-half term carries an event AND a tickSample: the
 * observer routes the event half, the slot routes the tick half, and the shared count-2 tally
 * joins them. */
export const TICK_CONDITION_IDS = Object.freeze(
  MISSION_CONDITION_IDS.filter((id) => !MISSION_CONDITIONS[id].event
    || id === 'honest_sling' || id === 'tender_window'),
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
    ...(c.twist ? { twist: true } : {}),
  };
}

/**
 * Stamp at most one mid-run twist onto a rolled board offer. Own seed stream
 * (`hash32(seed, offer.id, 'twist')`) so the physics-term pool cannot move a golden.
 * Story, authored, capital, and mutation successors are left alone.
 */
export function attachTwistClauses(offer, seed) {
  if (!offer || !offer.id || !offer.type) return offer;
  if (offer.storyTag || offer.campaign47aBeat != null || offer.storyBranch) return offer;
  if (offer.source && TWIST_SKIP_SOURCES.has(offer.source)) return offer;
  // Helios is the 47-A teaching board. A sting or cooked-lot twist on the first haul
  // would mutate the opening contract. Other route stations carry the live set.
  if (offer.stationId === 'station_helios') return offer;
  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  if (existing.some((row) => row && (
    row.twist === true
    || TWIST_CLAUSE_ID_SET.has(row.conditionId)
    || TWIST_CLAUSE_ID_SET.has(row.id)
  ))) {
    return offer;
  }
  const riskTier = Math.max(0, Math.min(4, Math.round(Number(offer.riskTier) || 0)));
  const rng = mulberry32(hash32(seed, offer.id, 'twist') >>> 0);
  if (rng() > TWIST_ATTACH_PROB[riskTier]) return offer;
  const pool = TWIST_CLAUSE_IDS
    .map((id) => MISSION_CONDITIONS[id])
    .filter((condition) => (
      condition
      && Array.isArray(condition.appliesTo)
      && condition.appliesTo.includes(offer.type)
      && riskTier >= (condition.minRisk || 0)
    ));
  if (!pool.length) return offer;
  const pick = pool[Math.floor(rng() * pool.length)];
  const row = serializableMissionCondition(pick.id);
  if (!row) return offer;
  return {
    ...offer,
    clauses: [...existing, row],
    params: { ...(offer.params || {}), twistClauseId: pick.id },
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
