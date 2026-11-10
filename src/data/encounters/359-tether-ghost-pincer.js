// 359 - Tether-ghost pincer. SF-052 (PB-TAC-A): the cutter and the ranged specialist in ONE
// authored fight, so the rope becomes the decision — keep the Massline loaded and the blade
// commits to cut it while the ghost punishes a tethered, slow hull; drop it and you are safe
// from the cut but the ghost owns the long bearing. Their committed passes are offset by the
// specialist dispatcher (one pass at a time, plus a breather), so the pattern is solvable:
// swing the rope's angle to beat the blade into recovery, then spend the breather on the ghost.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 359;
export const trigger = deepFreeze({
  id: 'tether_ghost_pincer',
  tier: 'minor',
  deck: 'combat',
  weight: 0.4,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field'],
  script: 'ambush',
  // Director pressure budget: the cutter interdiction alone costs 54-60 (encounters 334/336);
  // adding a contracted ghost rides the composed pair to 64.
  pressureCost: 64,
  cooldownS: 1140,
  proximity: true,
  rare: true,
  gates: {
    minSectorTier: 3,
    maxSecurity: 0.55,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'massline_interdiction',
  engagementTrigger: 'player_signature_massline_use',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'TETHER-GHOST PINCER',
  primaryLine: 'PINCER CONTACT: a Massline cutter spools on your rope while a ghost holds the long bearing — spend the line or save it.',
  squad: {
    anchorArchetype: 'tether_control_raider',
    archetypes: ['quiet_ghost', 'wasp_swarmer'],
    // The paired pressure only teaches if BOTH specialists actually arrive: the cutter anchors
    // the squad, the ghost is guaranteed a slot in the light pool.
    guaranteeArchetypes: ['quiet_ghost'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'loose',
    // Different readable bearings: the two specialists never bunch on one bearing — the blade
    // reads from the flank, the ghost's rail from the long range it kites to.
    minSeparation: 420,
  },
  bark: 'ambush_tele',
  telegraph: 'A Massline cutter spools while a ghost holds the long bearing. Spend the line or save it.',
  aftermath: {
    flee: 'The pincer opens: the cutter drops the contest and the ghost keeps only the bearing.',
    kill: 'The rope contest dies with the blade; the ghost re-ranges onto a new bearing.',
  },
});
