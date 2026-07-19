// src/data/wreckMissions.js — SHORT salvage-mission templates seeded by the derelict-field
// discovery loop (GDD pillar 1: "a floating communicator near wreckage starts a mission").
//
// Pure data + pure helpers. No imports, no Three.js, no RNG here — callers pass their sim RNG so
// selection stays deterministic (§0.5). A template is a self-contained offer the salvage system
// hands to the missions/comms/UI layer via a `mission:offered` event; nothing here mutates state.
//
// Each template themes to the fiction (the Pit convoy, the Crimson Reach raids, Silt / pressurized
// air as frontier currency, the Quiet's off-book work). Fields:
//   id        stable id (used to dedupe / hash)
//   title     short board/comms title
//   type      a missions.js MISSION_TYPE id the offer maps onto (so an accept path can reuse it)
//   giver     who the communicator log is "from" (flavour)
//   log       the black-box / distress log line revealed on scan (the hook)
//   summary   one line of what the player is asked to do
//   reward_cr baseline payout hint (the missions layer may re-scale; this is a floor)
//   choice    optional moral-choice descriptor { prompt, options:[{ id, label, blurb }] }
//   tag       'wreck_salvage' marker so consumers can route these distinctly

export const WRECK_MISSIONS = [
  {
    id: 'wm_blackbox_attacker',
    title: 'Recover the Black Box',
    type: 'salvage_retrieval',
    giver: 'Derelict flight recorder',
    log: '…they came out of the belt shadow with no transponder. Reach colors. If anyone finds this — the box knows who fired first.',
    summary: 'Pull the flight recorder from the wreck and carry it to a station; its log names the attackers.',
    reward_cr: 900,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_survivor_pod',
    title: 'The Survivor Pod',
    type: 'passenger_transport',
    giver: 'Cryo-pod distress ping',
    log: 'Life-support at 6 percent. One occupant. Pod is squawking a Concord crew tag — but the manifest was scrubbed. Someone did not want them found.',
    summary: 'A single survivor drifts in a failing pod. Haul them to safety — or leave the pod for the scrap.',
    reward_cr: 750,
    choice: {
      prompt: 'The pod is failing. What do you do?',
      options: [
        { id: 'rescue', label: 'Tow the pod to a station', blurb: 'Slow, risky, but the crew tag buys you Concord goodwill.' },
        { id: 'strip', label: 'Strip the pod for salvage', blurb: 'Faster credits now — and no witnesses.' },
      ],
    },
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_silt_canisters',
    title: 'Loose Silt Canisters',
    type: 'salvage_retrieval',
    giver: 'Hauler cargo beacon',
    log: 'Cargo seals blew when the drive went. Canisters are venting Silt into the field. Recover them before the pressure drops — this air is worth more than the hull.',
    summary: 'Tether the drifting Silt canisters out of the wreck field and sell the pressurized air.',
    reward_cr: 640,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_manifest_run',
    title: 'The Missing Manifest',
    type: 'cargo_delivery',
    giver: 'Freighter data core',
    log: 'The manifest was never logged at dock. Whoever hauls it in gets paid — and whoever reads it learns what this ship was really carrying.',
    summary: 'Recover the freighter data core and deliver it to a station buyer who has been asking questions.',
    reward_cr: 820,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_reach_bounty',
    title: 'They Left a Marker',
    type: 'bounty_hunt',
    giver: 'Scarred hull transponder',
    log: 'The raiders tagged this kill like a trophy — same signature we have seen on three haulers. The box has their flight vector. Go end it.',
    summary: 'The wreck log fingers a specific raider. Track the marked hostile and put them down.',
    reward_cr: 1100,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_quiet_favor',
    title: 'An Off-Book Favor',
    type: 'salvage_retrieval',
    giver: 'Encrypted courier chip',
    log: 'If you are reading this you already know too much. The Quiet pay well for a quiet hand. Bring the chip — do not open it — and forget you saw the wreck.',
    summary: 'Recover an encrypted courier chip for The Quiet. Ask no questions, get paid.',
    reward_cr: 980,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_mine_wake_map',
    title: 'Map of the Salted Wake',
    type: 'recon_scan',
    giver: 'Hauler nav core',
    log: 'They seeded the exit vector. Every buoy we trusted was a mine. The map still has the drop points if you can stand to look.',
    summary: 'Recover the nav core and scan the marked mine drop bearings before another convoy dies in the wake.',
    reward_cr: 860,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_pd_curtain_blackbox',
    title: 'Curtain Black Box',
    type: 'salvage_retrieval',
    giver: 'Escort flight recorder',
    log: 'Point-defense held for nine minutes. Missiles died. The freighter did not. Bring the box — insurers want the curtain timing.',
    summary: 'Pull the escort black box so insurers can price PD screens against raider missile racks.',
    reward_cr: 920,
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_pattern_offering',
    title: 'Unfinished Offering',
    type: 'cargo_delivery',
    giver: 'Choir cargo beacon',
    log: 'Tithe incomplete. Pattern incomplete. Whoever finishes the delivery is counted. Whoever opens the hold is corrected.',
    summary: 'A sealed Choir offering drifts free of a wreck. Deliver it unopened — or open it and live with the Pattern.',
    reward_cr: 1040,
    choice: {
      prompt: 'The hold seals are ritual-waxed. What do you do?',
      options: [
        { id: 'deliver', label: 'Deliver sealed', blurb: 'Choir goodwill; no look inside.' },
        { id: 'open', label: 'Break the wax', blurb: 'Knowledge and heat. Possibly both.' },
      ],
    },
    tag: 'wreck_salvage',
  },
  {
    id: 'wm_ghost_contract',
    title: 'Contract Without a Name',
    type: 'bounty_hunt',
    giver: 'Blank Quiet chip',
    log: 'Target: redacted. Bearing: last known. Payment: already half-loaded. Do not ask who wrote the other half.',
    summary: 'A Quiet bounty chip names a bearing, not a face. Hunt the ghost before the contract expires.',
    reward_cr: 1250,
    tag: 'wreck_salvage',
  },
  {
    // The moisture-loss wreck: closes the audit's arithmetic gap in play.
    // The hauler's black box records the discrepancy the column was built to hide.
    id: 'wm_shaft_seven_blackbox',
    title: 'The Shaft Seven Box',
    type: 'salvage_retrieval',
    giver: 'Drift hauler flight recorder',
    log: 'Cargo reweighed on accept: 11.2t. Cargo on departure: 9.4t. Two crew aboard. The 1.8t is logged moisture loss. The two are filed as 0.7t of it. Somebody wrote the other 1.1t into a column that does not have our names.',
    summary: 'Recover the hauler black box whose mass log is the cover for two missing Drift miners. Deliver it — to the buyer who pays, or the one who counts.',
    reward_cr: 1180,
    choice: {
      prompt: 'The box proves the 0.7t was two names. Who gets it?',
      options: [
        { id: 'drift', label: 'Hand it to Drift Claims', blurb: 'The Collective refiles the dead by name. No bounty. The moisture-loss column closes for Shaft 7.' },
        { id: 'mts', label: 'Sell it to Meridian', blurb: 'The box vanishes into a drawer. The 0.7t stays moisture. You keep the fee — and the column.' },
      ],
    },
    tag: 'wreck_salvage',
  },
  {
    // The relief-canister wreck: closes the audit's beneficiary-cycle gap in play.
    // The canisters are the Pit's own air, sold back to it.
    id: 'wm_recall_canisters',
    title: 'The Recalled Air',
    type: 'cargo_delivery',
    giver: 'Sealed atmo canister beacon',
    log: 'Batch R3-CARRIER. Withdrawn from Sector 0 three cycles ago under recall. Never destroyed. Seals re-stamped. Resold under a new lot number. The Pit is still waiting on the replacement that this is.',
    summary: 'A float of rebreathed air drifts off a wreck — relief stock resold to the station it was taken from. Haul it to a buyer, or back to the people who breathed it first.',
    reward_cr: 940,
    choice: {
      prompt: 'The canisters are the Pit\u2019s own replacement. Where do they go?',
      options: [
        { id: 'buyer', label: 'Sell to the off-station buyer', blurb: 'Meridian clears the position again. You take the margin. The Pit buys its air twice.' },
        { id: 'pit', label: 'Return to the Pit dock', blurb: 'No pay. The Pit breathes one cycle on air it was already owed.' },
      ],
    },
    tag: 'wreck_salvage',
  },
];

const BY_ID = new Map(WRECK_MISSIONS.map((m) => [m.id, m]));

/** Look up a template by id (null if unknown). */
export function wreckMissionById(id) {
  return BY_ID.get(id) || null;
}

/**
 * Deterministically pick a wreck-mission template.
 * @param rng   a seeded [0,1) function (state.world.rng) — REQUIRED for determinism; falls back to
 *              index 0 if absent so a headless/degraded caller still gets a valid template.
 * @returns a WRECK_MISSIONS entry (never null while the table is non-empty).
 */
export function pickWreckMission(rng) {
  if (!WRECK_MISSIONS.length) return null;
  const r = typeof rng === 'function' ? rng() : 0;
  const i = Math.floor(r * WRECK_MISSIONS.length) % WRECK_MISSIONS.length;
  return WRECK_MISSIONS[i] || WRECK_MISSIONS[0];
}
