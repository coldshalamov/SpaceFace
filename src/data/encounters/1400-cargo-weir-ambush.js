// 1400 — THE CARGO WEIR AMBUSH (LW-02). A Reach salvage crew is stripping a seized cargo
// hulk inside a customs weir while an SCN cordon cutter holds the impound line. A hostile
// tether specialist sits masked outbound of the gate, waiting for a runner.
//
// The hulk is a real tetherable body parked just inside the gate:
//   * ASSIST: tow it inbound to a living cordon cutter and cut the line clean —
//     lawful impound assist; customs pays the fee and remembers the hand.
//   * THEFT: tow it out through the gap and settle it past the cordon —
//     the crew pays a bigger cut, law sees it if a lawful eye is close enough.
//   * REFUSE: decline the offer (or let the clock die) and the specialist earns its cut.
//
// Opening fire during the offer reads as refusal by trigger. The specialist also springs
// mid-tow once the hulk has committed outbound — the whole point of the mask. The two
// ballast pieces sheared off the hull are throwable counterplay against its attach.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 1400;
export const trigger = deepFreeze({
  id: 'cargo_weir_ambush',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['border_checkpoint'],
  script: 'weirAmbush',
  pressureCost: 40,
  cooldownS: 900,
  proximity: true,
  gates: { uniqueOnce: true },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE CARGO WEIR',
  motive: 'cargo_extortion',
  primaryLine: 'SALVOR LEAD: Hauler — this hulk is a customs write-off and we\'re mid-strip. Tow it to the cordon and the badge tips you. Run it through the gap and we pay double. Or keep your nose clean.',
  patrolLine: 'CORDON: Impound line is set. Anything crossing the gate outbound is seized or shot.',
  springBark: 'SPECIALIST: Line\'s spooling. Nobody runs a weir on my watch.',
  offerS: 30,
  taskS: 240,
  timeoutChoice: 'refuse',
  choices: [
    { id: 'assist', label: 'Tow the hulk to the cordon' },
    { id: 'theft', label: 'Run the hulk through the gap' },
    { id: 'refuse', label: 'Refuse the offer' },
  ],
  ackBarks: {
    assist: 'SALVOR LEAD: Fine — hand it to the badge. We\'ll bill the impound either way.',
    theft: 'SALVOR LEAD: Half is yours — run it past the gate and drop it clear of the cutters.',
    refused: 'SALVOR LEAD: Your loss, hauler. Specialist — earn your cut.',
  },
  squad: {
    // Index 0 is the identity anchor — the masked tether specialist. The rest are the
    // stripping crew; the script lays them out around the hulk at fire time.
    anchorArchetype: 'tether_control_raider',
    archetypes: ['mule_trader'],
    size: [3, 3],
    doctrine: 'scavenger',
  },
  escort: {
    // The lawful cordon: SCN cutters on lawful_wanted_only — they never open on a clean
    // player, and their living eyes are what make the assist count and the theft a crime.
    archetypes: ['customs_cutter'],
    size: [2, 2],
    factionId: 'faction_scn',
    context: 'patrol',
  },
  verbs: ['latch', 'tow', 'release', 'displace', 'fight'],
  deadlineS: 300,
  receipts: {
    weir_lawful_assist: 'IN CUSTODY — the cordon took the hulk. Customs pays the impound fee and logs the assist.',
    weir_theft: 'THROUGH THE GAP — the hulk cleared the weir under a lawful eye. The crew pays; SCN writes the incident.',
    weir_refused: 'REFUSED — the specialist came off the mask. The weir keeps what it keeps.',
    weir_stalled: 'STALLED — nobody moved the hulk in time. The crew packs up around the seizure.',
    weir_hulk_lost: 'THE HULK IS GONE — whatever was worth fighting over isn\'t there anymore.',
    weir_abandoned: 'LEFT BEHIND — the cordon closes the opportunity. No fee or crew cut is owed.',
  },
});
