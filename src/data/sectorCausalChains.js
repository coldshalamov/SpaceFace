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
import { HELIOS_ACTIVITY_SECTOR_ID } from './sectorActivityPockets.js';

// ── Helios Prime: "claim day" ───────────────────────────────────────────────────────────────────
// The starter harbour already flies four authored hulls (sectorActivityPockets.js): a seam miner
// and the fence who wants its cargo on the Sanctioned Claim, and a freight hauler with the customs
// patrol on the freight spine by the tally post. The chain strings four catalog events across
// them, one per category, so the neighbourhood reads as one afternoon rather than four loops:
//
//   work      ev_prospector_stakes_claim  the seam miner hunts a rock and fires a stake      (miner)
//   law       ev_customs_pullover         customs walks the loaded hauler aside and reads it (patrol, hauler)
//   civilian  ev_prospectors_posture      the fence turns up and the two fly the argument    (miner, fence)
//   crime     ev_claim_jump               the loser works the staked rock while the owner is away (fence, miner)
//
// The stake opens the cycle (the catalog's own composability: the posture and the jump are both
// downstream of a staked rock). The pullover rides the same stake — the lot leaving the claim is
// what customs reads — and runs in parallel on the freight spine, where the opening position is.
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
    // law, next20: customs flags a loaded hauler down on the freight spine, walks it aside and
    // reads the hold. The patrol closes on the hauler for the whole read (the Ceres patrol-scan
    // redirect, generalized) and is released back to its beat when the link ends.
    id: 'ev_customs_pullover',
    actorSlots: Object.freeze([HELIOS_CUSTOMS_PATROL, HELIOS_FREIGHT_HAULER]),
    requires: Object.freeze(['claim_staked']),
    seedAtPhase: 'inspect',
    seeds: Object.freeze(['lot_read']),
    // Aborted inspection (a hull lost): the catalog's "visible unexamined marker" — the lot went
    // through unread, and the cycle's news line says so.
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
  // lot_unread is the only seed that diverges the cycle's story: customs lost a hull mid-read.
  return seeds && seeds.lot_unread === true
    ? 'Helios customs waves a loaded hauler on unread; the Sanctioned Claim argues over a stake.'
    : 'Helios customs reads another loaded hauler; the Sanctioned Claim argues over a stake.';
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
});
