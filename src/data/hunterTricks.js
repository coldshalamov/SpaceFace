// BP-13/B17 Hunter's Signature Trick.
//
// One readable gimmick per bounty hunter. The verb field is deliberately singular: each trick maps
// to one already-shipped gameplay verb/event family instead of creating a new physics subsystem.
import { hash32 } from '../core/rng.js';

function freeze(def) {
  return Object.freeze({
    ...def,
    verb: Object.freeze({ ...def.verb }),
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
  }),
  'mine-dropper': freeze({
    id: 'mine-dropper',
    label: 'Mine Dropper',
    telegraph: 'Mine rack opening. Clear the wake.',
    counterWindowS: 1.4,
    cooldownS: 20,
    verb: { kind: 'mine_drop', event: 'combat:fire' },
  }),
  'phase-jammer': freeze({
    id: 'phase-jammer',
    label: 'Phase Jammer',
    telegraph: 'Phase jammer spooling. Hold lock loosely.',
    counterWindowS: 1.1,
    cooldownS: 16,
    verb: { kind: 'phase_jam', event: 'countermeasure:deployed' },
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
  }),
  'decoy-clone': freeze({
    id: 'decoy-clone',
    label: 'Decoy Clone',
    telegraph: 'Decoy clone blooming. Check the real drive.',
    counterWindowS: 1.35,
    cooldownS: 22,
    verb: { kind: 'decoy_clone', event: 'countermeasure:deployed' },
  }),
  'emergency-jump-spool': freeze({
    id: 'emergency-jump-spool',
    label: 'Emergency Jump Spool',
    telegraph: 'Jump spool winding. Interrupt before the flash.',
    counterWindowS: 1.75,
    cooldownS: 30,
    verb: { kind: 'emergency_jump', event: 'jump:arrive' },
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
