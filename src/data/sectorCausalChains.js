// Sector causal chains — the authored staged stories that unfold around the player in a sector
// other than Ceres. Data only: the choreography timer lives in `traffic.js` (`SECTOR_CAUSAL_CHAINS`),
// which reads this table, runs each chain on the same hard cap (two live links) and the same cycle
// gap as the Ceres chain, and binds every link to the sector's authored cast by actor slot id.
//
// A link here is one catalog microevent (design/incubator/microevent_library/catalog/*.json): the
// phase names, durations and visible-signal cues are the catalog's own, so the existing target
// panel, hail STATUS and signature-VFX cue readers show it with no new presentation code. Ceres
// owns eleven catalog ids; a second sector's chain borrows none of them, so the wired list in
// INTEGRATION.md stays an honest count and no id means two different stories.
//
// Link shape (same as the Ceres chain): { id, actorSlots, requires, seedAtPhase, seeds,
// interruptSeeds, jobHints, phases }. A seed is planted when its link enters `seedAtPhase`, and on
// every terminal outcome too (`interruptSeeds` when the story diverges), so a lost hull degrades
// the chain instead of stalling it.
import { HELIOS_ACTIVITY_SECTOR_ID, TETHYS_ACTIVITY_SECTOR_ID } from './sectorActivityPockets.js';

// ── Helios Prime: "claim day" ───────────────────────────────────────────────────────────────────
// The starter harbour already flies four authored hulls (sectorActivityPockets.js): a seam miner
// and the fence who wants its cargo on the Sanctioned Claim, and a freight hauler with the customs
// patrol on the freight spine by the tally post. The chain strings four catalog events across
// them, one per category, so the neighbourhood reads as one afternoon rather than four loops:
//
//   work      ev_prospector_stakes_claim  the seam miner hunts a rock and fires a stake      (miner)
//   law       ev_customs_pullover         customs flags the freight hauler down and walks it aside (patrol, hauler)
//   civilian  ev_prospectors_posture      the fence turns up and the two fly the argument    (miner, fence)
//   crime     ev_claim_jump               the loser works the staked rock while the owner is away (fence, miner)
//
// The stake opens the cycle (the catalog's own composability: the posture and the jump are both
// downstream of a staked rock). The pullover waits on the same stake — a staked claim is a claim
// worth watching the freight spine for — and runs in parallel there, where the opening position is.
// The Helios hauler is not guaranteed a manifest when customs reaches it, so nothing in this chain
// (or its news line) claims a cargo: the beat is the stop and the walk-around, not the hold.
//
// Catalog boundaries recorded here, same discipline as the Ceres chain: the claim-mark prop, the
// field-slot owner id and the second stake after a won jump stay unwired (no claim-mark object
// seam yet); the pullover's inspection point and orbit ride the patrol's existing job redirect
// (it closes on the hauler and is released back to its beat), not a new off-lane waypoint; the
// jump's "fight" branch is not staged — the fence yields, nobody fires.
//
// Cue honesty: two catalog lamps read as hull failure in the hail STATUS table (the discord lamp,
// the spine wake). The catalog's cues are kept for the signature VFX; contactHail.js carries
// phase-scoped means for those three phases so no hull claims a failure it does not have.

const HELIOS_SEAM_MINER = 'helios_seam_miner';
const HELIOS_SEAM_FENCE = 'helios_seam_fence';
const HELIOS_FREIGHT_HAULER = 'helios_freight_hauler';
const HELIOS_CUSTOMS_PATROL = 'helios_customs_patrol';

export const HELIOS_CAUSAL_CHAIN = Object.freeze([
  Object.freeze({
    // work, next20: "a tiny hull that hunts like a surveyor but is dressed like a miner - and then
    // it SHOOTS the rock". The stake phase is the find the rest of the afternoon answers.
    id: 'ev_prospector_stakes_claim',
    actorSlots: Object.freeze([HELIOS_SEAM_MINER]),
    requires: Object.freeze([]),
    seedAtPhase: 'stake',
    seeds: Object.freeze(['claim_staked']),
    // Miner lost mid-hunt: the rock was still read, so the dispute downstream still has a subject.
    interruptSeeds: Object.freeze(['claim_staked']),
    // The miner already works the seam through its authored extraction job — reaffirm only.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: HELIOS_SEAM_MINER,
        reaffirm: true,
        phases: Object.freeze(['hunt', 'stake', 'circle', 'leave_or_cut']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'hunt', durationS: 20, cue: 'reading_the_dark' }),
      Object.freeze({ name: 'stake', durationS: 5, cue: null }),
      Object.freeze({ name: 'circle', durationS: 15, cue: 'clean_burn' }),
      Object.freeze({ name: 'leave_or_cut', durationS: 15, cue: 'blind_cone' }),
    ]),
  }),
  Object.freeze({
    // law, next20: customs flags a hauler down on the freight spine, walks it aside and inspects
    // it. The patrol closes on the hauler for the whole stop (the Ceres patrol-scan redirect,
    // generalized) and is released back to its beat when the link ends.
    id: 'ev_customs_pullover',
    actorSlots: Object.freeze([HELIOS_CUSTOMS_PATROL, HELIOS_FREIGHT_HAULER]),
    requires: Object.freeze(['claim_staked']),
    seedAtPhase: 'inspect',
    seeds: Object.freeze(['hauler_inspected']),
    // Aborted inspection (a hull lost): the catalog's "visible unexamined marker" — the hauler
    // went through unread, and the cycle's news line says so.
    interruptSeeds: Object.freeze(['lot_unread']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: HELIOS_CUSTOMS_PATROL,
        subjectSlotId: HELIOS_FREIGHT_HAULER,
        phases: Object.freeze(['flag_down', 'pull_aside', 'inspect', 'wave_on']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'flag_down', durationS: 15, cue: 'on_the_pin' }),
      Object.freeze({ name: 'pull_aside', durationS: 20, cue: 'stacking' }),
      Object.freeze({ name: 'inspect', durationS: 40, cue: 'on_the_pin' }),
      Object.freeze({ name: 'wave_on', durationS: 10, cue: 'spine_wake' }),
    ]),
  }),
  Object.freeze({
    // civilian, standard: "two small hulls circling one rock in OPPOSITE directions - the geometry
    // of disagreement". The fence plays the second prospector: it already shadows the miner on its
    // authored route, so the argument is flown on rails the cast already has.
    id: 'ev_prospectors_posture',
    actorSlots: Object.freeze([HELIOS_SEAM_MINER, HELIOS_SEAM_FENCE]),
    requires: Object.freeze(['claim_staked']),
    seedAtPhase: 'break',
    seeds: Object.freeze(['stake_contested']),
    interruptSeeds: Object.freeze(['stake_contested']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: HELIOS_SEAM_MINER,
        reaffirm: true,
        phases: Object.freeze(['simultaneous_claim', 'posture', 'break', 'settle']),
      }),
      Object.freeze({
        actorSlotId: HELIOS_SEAM_FENCE,
        reaffirm: true,
        phases: Object.freeze(['simultaneous_claim', 'posture', 'break', 'settle']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'simultaneous_claim', durationS: 15, cue: 'stacking' }),
      Object.freeze({ name: 'posture', durationS: 40, cue: 'clean_burn' }),
      Object.freeze({ name: 'break', durationS: 20, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'settle', durationS: 20, cue: 'blind_cone' }),
    ]),
  }),
  Object.freeze({
    // crime, standard: the catalog names this the posture's tomorrow ("the loser leaves knowing
    // exactly where a rich rock is and who owns it thinly"). The fence works the staked rock while
    // its owner is away; the owner returns and pushes; the jumper yields. Nobody fires.
    id: 'ev_claim_jump',
    actorSlots: Object.freeze([HELIOS_SEAM_FENCE, HELIOS_SEAM_MINER]),
    requires: Object.freeze(['stake_contested']),
    seedAtPhase: 'owner_returns',
    seeds: Object.freeze(['claim_jumped']),
    interruptSeeds: Object.freeze(['claim_jumped']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: HELIOS_SEAM_FENCE,
        reaffirm: true,
        phases: Object.freeze(['poach', 'owner_returns', 'push', 'yield_or_fight']),
      }),
      Object.freeze({
        actorSlotId: HELIOS_SEAM_MINER,
        reaffirm: true,
        phases: Object.freeze(['poach', 'owner_returns', 'push', 'yield_or_fight']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'poach', durationS: 30, cue: 'blind_cone' }),
      Object.freeze({ name: 'owner_returns', durationS: 15, cue: 'stacking' }),
      Object.freeze({ name: 'push', durationS: 25, cue: 'blind_cone' }),
      Object.freeze({ name: 'yield_or_fight', durationS: 20, cue: 'breaking_the_pattern' }),
    ]),
  }),
]);

function heliosCycleNewsText(seeds) {
  // lot_unread is the only seed that diverges the cycle's story: customs lost a hull mid-stop.
  return seeds && seeds.lot_unread === true
    ? 'Helios customs waves a hauler on unread; the Sanctioned Claim argues over a stake.'
    : 'Helios customs pulls another hauler aside; the Sanctioned Claim argues over a stake.';
}

// ── Tethys Junction: "the quiet handoff" ─────────────────────────────────────────────────────────
// The junction already flies eight authored hulls (sectorActivityPockets.js): a toll hauler
// holding in the checkpoint queue under the gate patrol, a lane convoy and its lane patrol, the
// Quiet Cache's keeper and the runner it loads, and the customs-log pair picking seized hulks.
// The chain strings five catalog events across them so the afternoon reads as one story rather
// than five loops — and the story is the catalog's own composability:
//
//   logistics  ev_tanker_holds_for_berth  the queue is the queue: a heavy hull parked and waiting (toll hauler)
//   law        ev_patrol_shift_change     the watch passes the pin while the gate is busiest    (both patrols)
//   crime      ev_criminal_handoff        the keeper meets the runner inside the hole that opens (cache pair)
//   law        ev_smuggler_breaks         the lane patrol runs the runner down; it dumps the load (patrol, runner)
//   civilian   ev_observation_stop        the surveyor drifts to the hulk face and looks         (log surveyor)
//
// The catalog names the hole the shift change opens — "time crimes to the pass-the-pin moment" —
// so the handoff waits on watch_passed, and the pursuit waits on the cargo the meet set loose.
// The observation stop is the day's coda: the log yard is where the law's work ends up, so it
// follows the bolt.
//
// Catalog boundaries recorded here, same discipline as the other chains: the handoff's
// tail-to-tail parking pose and the patrol's abeam pass ride the job-redirect seam (an actor
// closes on its subject and the restored authored job is the departure leg — no formation
// layer); the three-piece swap and the jettison spray are REAL pickups minted by the traffic
// owner's phase effects on the standard pipeline (player-grabbable; nobody mints cargo onto a
// hull). The catalog's spawn legs — a relief hull from the station, the second smuggler party,
// marker props — stay unwired: the chain binds the authored cast only, like Helios.
const TETHYS_TOLL_HAULER = 'tethys_toll_hauler';
const TETHYS_CUSTOMS_PATROL = 'tethys_customs_patrol';
const TETHYS_LANE_PATROL = 'tethys_lane_patrol';
const TETHYS_QUIET_RUNNER = 'tethys_quiet_runner';
const TETHYS_QUIET_KEEPER = 'tethys_quiet_keeper';
const TETHYS_LOG_SURVEYOR = 'tethys_log_surveyor';

export const TETHYS_CAUSAL_CHAIN = Object.freeze([
  Object.freeze({
    // logistics, next20: "a heavy hull parked in the open pointing at a station and refusing to
    // close — the pose IS the queue". The toll hauler's authored job is already the queue-hold
    // run, so the whole link is reaffirm — the authored cast performs the wait on rails.
    id: 'ev_tanker_holds_for_berth',
    actorSlots: Object.freeze([TETHYS_TOLL_HAULER]),
    requires: Object.freeze([]),
    seedAtPhase: 'cleared',
    seeds: Object.freeze(['berth_held']),
    // The wait still happened even if the hull is lost on the approach — the queue had a body.
    interruptSeeds: Object.freeze(['berth_held']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: TETHYS_TOLL_HAULER,
        reaffirm: true,
        phases: Object.freeze(['arrive_hold', 'queue_visible', 'cleared', 'approach']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'arrive_hold', durationS: 20, cue: 'on_the_pin' }),
      Object.freeze({ name: 'queue_visible', durationS: 40, cue: null }),
      Object.freeze({ name: 'cleared', durationS: 10, cue: 'spine_wake' }),
      Object.freeze({ name: 'approach', durationS: 25, cue: 'stacking' }),
    ]),
  }),
  Object.freeze({
    // law, first15: the lane patrol is the relief — it leaves its lane beat, closes on the gate
    // patrol's corner, and the pin passes between two hulls already in the sky. The stand_down
    // is both hulls back on their authored beats (the redirect restores at link end).
    id: 'ev_patrol_shift_change',
    actorSlots: Object.freeze([TETHYS_CUSTOMS_PATROL, TETHYS_LANE_PATROL]),
    requires: Object.freeze(['berth_held']),
    seedAtPhase: 'pass_the_pin',
    seeds: Object.freeze(['watch_passed']),
    // The watch changed or tried to; the hole the smuggler works opened either way.
    interruptSeeds: Object.freeze(['watch_passed']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: TETHYS_CUSTOMS_PATROL,
        reaffirm: true,
        phases: Object.freeze(['hold_short', 'relief_inbound', 'pass_the_pin', 'stand_down']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_LANE_PATROL,
        subjectSlotId: TETHYS_CUSTOMS_PATROL,
        phases: Object.freeze(['relief_inbound', 'pass_the_pin']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_LANE_PATROL,
        reaffirm: true,
        phases: Object.freeze(['hold_short', 'stand_down']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'hold_short', durationS: 15, cue: 'on_the_pin' }),
      Object.freeze({ name: 'relief_inbound', durationS: 20, cue: 'clean_burn' }),
      Object.freeze({ name: 'pass_the_pin', durationS: 8, cue: 'on_the_pin' }),
      Object.freeze({ name: 'stand_down', durationS: 15, cue: 'clean_burn' }),
    ]),
  }),
  Object.freeze({
    // crime, next20: "the oldest hole in every guard schedule". The keeper leaves its stash
    // sweep, closes on the runner's hold, and the swap drops three real contraband pickups in
    // the gap — grabbable evidence, the catalog's "three pickups cross the gap one at a time".
    // The part is the restore: both hulls return to their authored routes on different bearings.
    id: 'ev_criminal_handoff',
    actorSlots: Object.freeze([TETHYS_QUIET_RUNNER, TETHYS_QUIET_KEEPER]),
    requires: Object.freeze(['watch_passed']),
    seedAtPhase: 'swap',
    seeds: Object.freeze(['cargo_moved']),
    // Interrupted, the meet still leaves cargo loose — "the pickups stay; evidence" — so the
    // pursuit downstream keeps its subject either way.
    interruptSeeds: Object.freeze(['cargo_moved']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: TETHYS_QUIET_RUNNER,
        reaffirm: true,
        phases: Object.freeze(['converge', 'standoff', 'swap', 'part']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_QUIET_KEEPER,
        subjectSlotId: TETHYS_QUIET_RUNNER,
        phases: Object.freeze(['converge', 'standoff', 'swap']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_QUIET_KEEPER,
        reaffirm: true,
        phases: Object.freeze(['part']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'converge', durationS: 20, cue: 'clean_burn' }),
      Object.freeze({ name: 'standoff', durationS: 10, cue: null }),
      Object.freeze({ name: 'swap', durationS: 20, cue: 'mouth_open' }),
      Object.freeze({ name: 'part', durationS: 15, cue: 'clean_burn' }),
    ]),
  }),
  Object.freeze({
    // law, first15: the lane patrol runs the runner down. The patrol's redirect IS the pursuit
    // leg (it closes on the runner while the bolt burns); at jettison the runner sheds its load
    // as three real pickups sprayed off its tail — the law's evidence, the player's window.
    // Resolve restores both: the patrol walks its beat past the drifting evidence.
    id: 'ev_smuggler_breaks',
    actorSlots: Object.freeze([TETHYS_LANE_PATROL, TETHYS_QUIET_RUNNER]),
    requires: Object.freeze(['cargo_moved']),
    seedAtPhase: 'jettison',
    seeds: Object.freeze(['runner_bolted']),
    interruptSeeds: Object.freeze(['runner_bolted']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: TETHYS_LANE_PATROL,
        subjectSlotId: TETHYS_QUIET_RUNNER,
        phases: Object.freeze(['bolt', 'pursuit', 'jettison']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_LANE_PATROL,
        reaffirm: true,
        phases: Object.freeze(['resolve']),
      }),
      Object.freeze({
        actorSlotId: TETHYS_QUIET_RUNNER,
        reaffirm: true,
        phases: Object.freeze(['bolt', 'pursuit', 'jettison', 'resolve']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'bolt', durationS: 8, cue: 'clean_burn' }),
      Object.freeze({ name: 'pursuit', durationS: 30, cue: 'on_the_pin' }),
      Object.freeze({ name: 'jettison', durationS: 8, cue: null }),
      Object.freeze({ name: 'resolve', durationS: 20, cue: null }),
    ]),
  }),
  Object.freeze({
    // civilian, standard: "a parked hull aimed at nothing minable, dockable or scannable — the
    // only explanation left is that it is LOOKING". The log surveyor's authored sweep already
    // parks it at the seized-hulk face — the yard is the junction's overlook, so the day's coda
    // is one small hull looking at what the law's work costs. Reaffirm throughout.
    id: 'ev_observation_stop',
    actorSlots: Object.freeze([TETHYS_LOG_SURVEYOR]),
    requires: Object.freeze(['runner_bolted']),
    seedAtPhase: 'linger',
    seeds: Object.freeze(['day_noted']),
    interruptSeeds: Object.freeze(['day_noted']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: TETHYS_LOG_SURVEYOR,
        reaffirm: true,
        phases: Object.freeze(['drift_in', 'linger', 'move_on']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'drift_in', durationS: 15, cue: 'clean_burn' }),
      Object.freeze({ name: 'linger', durationS: 50, cue: 'on_the_pin' }),
      Object.freeze({ name: 'move_on', durationS: 15, cue: 'clean_burn' }),
    ]),
  }),
]);

function tethysCycleNewsText(seeds) {
  // A runner that bolted and dumped is the only divergent read: the law saw the chase, the
  // cache keeps its hours either way.
  return seeds && seeds.runner_bolted !== true
    ? 'Tethys customs changes the watch on a full queue; the Quiet Cache keeps its own hours.'
    : 'A runner bolted the Tethys lane and dumped its load; the Quiet Cache keeps its own hours.';
}

/**
 * Every non-Ceres sector that runs a staged ambient chain, keyed by sector id. `traffic.js` turns
 * each row into a `SECTOR_CAUSAL_CHAINS` entry (shared cap, shared cycle gap).
 */
export const SECTOR_CAUSAL_CHAIN_DEFS = Object.freeze({
  [HELIOS_ACTIVITY_SECTOR_ID]: Object.freeze({
    sectorId: HELIOS_ACTIVITY_SECTOR_ID,
    chain: HELIOS_CAUSAL_CHAIN,
    stationId: 'station_helios',
    newsKind: 'helios_claim_story',
    cycleNewsText: heliosCycleNewsText,
  }),
  [TETHYS_ACTIVITY_SECTOR_ID]: Object.freeze({
    sectorId: TETHYS_ACTIVITY_SECTOR_ID,
    chain: TETHYS_CAUSAL_CHAIN,
    stationId: 'station_customs',
    newsKind: 'tethys_quiet_handoff',
    cycleNewsText: tethysCycleNewsText,
  }),
});
