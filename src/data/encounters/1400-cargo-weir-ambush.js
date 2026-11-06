// 1400 — THE CARGO WEIR AMBUSH (LW-02). A licensed MTS salvage crew is stripping a seized
// cargo hulk at the impound yard inside the gate while an SCN cordon holds the impound
// line past the customs weir's read reach. A Crimson Reach thief flight — a corsair lead
// and a reaver wing — sits masked outbound of the gate, waiting to take the hulk off
// whoever moves it.
//
// The hulk is a real tetherable body parked beyond the weir's read region:
//   * ASSIST: tow it deeper in to a living cordon cutter and cut the line clean —
//     lawful impound assist; the whole pull stays outside the beam, customs pays the
//     fee and remembers the hand.
//   * THEFT: tow it OUT through the gate — the tow crosses the weir's read, so the
//     gate itself answers (an unread exit raises weir_bolt; a slow transit feeds the
//     manifest read and a hold scan). The Reach fence pays a bigger runner's cut.
//   * REFUSE: decline the offer (or let the clock die) and the flight takes its shot.
//
// Opening fire during the offer reads as refusal by trigger. The flight also springs
// mid-tow once the hulk has committed outbound — the whole point of the mask — and its
// spring seeds a short mine fence across the run corridor (mines.mineCorridorLayout,
// 325's wake law). The two ballast pieces sheared off the hull are throwable
// counterplay against the contested run.
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
  primaryLine: 'SALVOR LEAD: Hauler — seized hulk on the impound yard inside the gate and we hold the SCN strip ticket. Tow her to the cordon and the badge tips you. Or keep your nose clean.',
  patrolLine: 'CORDON: Impound line holds past the read. Anything crossing the gate outbound answers to the manifest.',
  fenceLine: 'REACH FENCE: Or run her out past the gate to us — double the badge\'s tip and no manifest ever happened.',
  springBark: 'THIEF LEAD: Mask\'s off — the hulk leaves with us or it leaves with nobody.',
  // An assist tow that runs outbound burns the ticket and becomes the run — said aloud.
  pivotBark: 'SALVOR LEAD: That\'s OUTBOUND — you just ran a seized hull through the read. Our ticket\'s burned!',
  pivotFenceBark: 'REACH FENCE: Then it\'s our run after all — drop her clear of the cutters and the cut still pays.',
  // The run's progress read: the gate answers the crossing itself; the fence narrates
  // its own checklist — read cleared, drop registered.
  readClearBark: 'REACH FENCE: You\'re outside the manifest read — cut the line and let her settle.',
  dropCountedBark: 'REACH FENCE: Lot\'s down and off your line — counted the moment the cordon can\'t reach her.',
  offerS: 30,
  taskS: 320,
  timeoutChoice: 'refuse',
  choices: [
    { id: 'assist', label: 'Tow the hulk to the cordon' },
    { id: 'theft', label: 'Run the hulk out past the gate' },
    { id: 'refuse', label: 'Refuse the offer' },
  ],
  ackBarks: {
    assist: 'SALVOR LEAD: Clean hands — set her beside the cutters and cut the line. Our ticket already billed the strip.',
    theft: 'REACH FENCE: Run her out past the beam and drop her clear of the cutters — the cut is wired on delivery.',
    refused: 'SALVOR LEAD: Your call, hauler — we bill the impound either way.',
  },
  squad: {
    // The identity anchor leads the masked thief flight — a corsair and a reaver holding
    // outbound of the gate. The licensed strip crew is scene dressing the script supplies
    // itself (MTS mule_traders under the SCN ticket); the script lays out every hull at
    // fire time.
    anchorArchetype: 'corsair_raider',
    archetypes: ['reaver_pirate'],
    size: [2, 2],
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
    weir_lawful_assist: 'IN CUSTODY — the cordon took the hulk clear of the read. Customs pays the impound fee and logs the assist.',
    weir_theft: 'THROUGH THE GATE — the hulk ran the weir under its own read. The fence wired the runner\'s cut; the gate remembers the hull.',
    weir_refused: 'REFUSED — the masked flight came for the hulk anyway. The weir keeps what it keeps.',
    weir_stalled: 'STALLED — nobody moved the hulk in time. The strip crew packs up around the seizure.',
    weir_receiver_dead: 'NO RECEIVER — the cordon is gone and no lawful eye remains to take custody. The impound ticket closes empty.',
    weir_hulk_lost: 'THE HULK IS GONE — whatever was worth fighting over isn\'t there anymore.',
    weir_abandoned: 'LEFT BEHIND — the cordon closes the impound. No fee or fence cut is owed.',
  },
});
