// BP-13/B17 Hunter's Signature Trick.
//
// One readable gimmick per bounty hunter. The verb field is deliberately singular: each trick maps
// to one already-shipped gameplay verb/event family instead of creating a new physics subsystem.
import { hash32 } from '../core/rng.js';

function freeze(def) {
  return Object.freeze({
    ...def,
    verb: Object.freeze({ ...def.verb }),
    effect: def.effect ? Object.freeze({ ...def.effect }) : undefined,
  });
}

export const HUNTER_TRICKS = Object.freeze({
  'tether-cutter': freeze({
    id: 'tether-cutter',
    label: 'Tether Cutter',
    telegraph: 'Tether cutter charging. Break angle now.',
    counterWindowS: 1.25,
    cooldownS: 18,
    verb: { kind: 'tether_cut', event: 'tether:broken' },
    // Severs every live attachment whose target is the hunter (masslines, snares).
    effect: { sever: 'attachments_on_hunter' },
  }),
  'mine-dropper': freeze({
    id: 'mine-dropper',
    label: 'Mine Dropper',
    telegraph: 'Mine rack opening. Clear the wake.',
    counterWindowS: 1.4,
    cooldownS: 20,
    verb: { kind: 'mine_drop', event: 'combat:fire' },
    effect: { mineCount: 1, mineCadenceS: 0.7 },
  }),
  'phase-jammer': freeze({
    id: 'phase-jammer',
    label: 'Phase Jammer',
    telegraph: 'Phase jammer spooling. Hold lock loosely.',
    counterWindowS: 1.1,
    cooldownS: 16,
    verb: { kind: 'phase_jam', event: 'countermeasure:deployed' },
    // Runs through the countermeasures ECM loop: missiles in radius lose their turn rate.
    effect: { ecm: { radius: 320, durationS: 3.0, turnRateMult: 0 } },
  }),
  'shield-turtle': freeze({
    id: 'shield-turtle',
    label: 'Shield Turtle',
    telegraph: 'Shield turtle forming. Wait out the shell.',
    counterWindowS: 1.5,
    cooldownS: 24,
    verb: { kind: 'shield_turtle', event: 'combat:damage' },
  }),
  'ram-plate': freeze({
    id: 'ram-plate',
    label: 'Ram Plate',
    telegraph: 'Ram plate locked. Slide off the nose.',
    counterWindowS: 0.95,
    cooldownS: 15,
    verb: { kind: 'ram_plate', event: 'physics:impact' },
    // During the window the hunter's direct contacts deal the plated multiplier.
    effect: { ram: { durationS: 3.0, damageMultiplier: 2.0 } },
  }),
  'decoy-clone': freeze({
    id: 'decoy-clone',
    label: 'Decoy Clone',
    telegraph: 'Decoy clone blooming. Check the real drive.',
    counterWindowS: 1.35,
    cooldownS: 22,
    verb: { kind: 'decoy_clone', event: 'countermeasure:deployed' },
    // A buoy point astern that keeps re-baiting seekers for its duration.
    effect: { decoy: { radius: 380, durationS: 4.0, divertPct: 0.9 } },
  }),
  'emergency-jump-spool': freeze({
    id: 'emergency-jump-spool',
    label: 'Emergency Jump Spool',
    telegraph: 'Jump spool winding. Interrupt before the flash.',
    counterWindowS: 1.75,
    cooldownS: 30,
    verb: { kind: 'emergency_jump', event: 'jump:arrive' },
    // The telegraph's promise is real: damage during the window fizzles the spool.
    interruptsOnDamage: true,
  }),
  'wake-mines': freeze({
    id: 'wake-mines',
    label: 'Wake Mines',
    telegraph: 'Wake mines arming. Break the trail.',
    counterWindowS: 1.3,
    cooldownS: 19,
    verb: { kind: 'mine_drop', event: 'combat:fire' },
    effect: { mineCount: 3, mineCadenceS: 0.7 },
  }),
  'pd-curtain': freeze({
    id: 'pd-curtain',
    label: 'PD Curtain',
    telegraph: 'Point-defense curtain spinning up. Hold missiles.',
    counterWindowS: 1.2,
    cooldownS: 17,
    verb: { kind: 'pd_screen', event: 'combat:fire' },
    // A temporary servo ring through the countermeasures point-defense loop.
    effect: { pd: { radius: 260, cooldownS: 1.2, durationS: 4.0 } },
  }),
  'sensor-ghost': freeze({
    id: 'sensor-ghost',
    label: 'Sensor Ghost',
    telegraph: 'Sensor ghost blooming. Trust the drive flare.',
    counterWindowS: 1.4,
    cooldownS: 21,
    verb: { kind: 'decoy_clone', event: 'countermeasure:deployed' },
    // Wider, longer decoy than the clone + it frays locks already on the hunter.
    effect: { decoy: { radius: 620, durationS: 8.0, divertPct: 0.9 }, lockBreakPct: 0.6 },
  }),
});

export const HUNTER_TRICK_IDS = Object.freeze(Object.keys(HUNTER_TRICKS));

export function hunterTrickById(id) {
  return HUNTER_TRICKS[id] || null;
}

export function hunterTrickForContract(contractId = 'bounty-contract', seed = 1) {
  const n = HUNTER_TRICK_IDS.length;
  const idx = hash32(seed, 'bountyHunt:trick', contractId) % n;
  return HUNTER_TRICKS[HUNTER_TRICK_IDS[idx]];
}

export default HUNTER_TRICKS;
