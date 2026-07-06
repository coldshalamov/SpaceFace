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
