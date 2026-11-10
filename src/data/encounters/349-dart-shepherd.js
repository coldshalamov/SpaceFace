// 349 — Dart shepherd. A Reach corsair runs a pack of fused detonator darts on a leash through
// the ambush lanes: weigh off a tithe in goods, or the bombs fly.
//
// The first campaign fight where the enemy's armament is itself a physics body. The darts are
// parked live ordnance through the demand window — a parked fuse still pops on any hull that is
// not theirs, and a dart that dies still detonates where it fell. Every counterplay is already
// the player's vocabulary: pay, run, snipe a parked dart inside the pack, or tether a live one
// back into the shepherd (the blast does not check a roster). Appended after 344/345/346/347/348
// — the next free order, not slotted by theme.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 349;
export const trigger = deepFreeze({
  id: 'dart_shepherd',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field'],
  script: 'ambush',
  pressureCost: 46,
  cooldownS: 540,
  proximity: true,
  gates: {
    minCargoValue: 160,
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'DART SHEPHERD',
  primaryLine: 'LANE CONTACT: a Reach shepherd holds fused darts on a leash. Pay the weigh-off, or the bombs decide.',
  // The anchor is a real hull worth killing — a corsair running the leash. The whole light pool
  // is darts: every member slot is a live bomb, parked inside its own blast radius of a wingmate
  // (sep 24+ vs blast 96), so one popped dart can chain the formation on any seed. Terrain lee:
  // the wing waits in a rock's shadow on the approach bearing — the demand hails before the
  // bombs show themselves.
  squad: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['detonator_dart'],
    size: [4, 5],
    clusterRadius: 85,
    minSeparation: 24,
    doctrine: 'scavenger',
    formation: 'loose',
    terrain: 'lee',
  },
  // Demand mode on the shared ambush script: the shepherd voices the weigh-off and opens the
  // timed fork — jettison the tithe, refuse and meet the darts, or burn off the leash. Closing
  // inside the spring ring or opening fire early also cuts the leash (the ambush script's own
  // proximity/attack springs), so the physical reads all work without clicking.
  bark: 'dart_shepherd_demand',
  offerS: 14,
  timeoutChoice: 'refuse',
  choices: [
    { id: 'pay', label: 'Jettison the weigh-off', needs: 'cargo' },
    { id: 'refuse', label: 'Refuse — let the darts fly' },
    { id: 'run', label: 'Burn off the leash' },
  ],
  springBark: 'dart_shepherd_spring',
  ackBarks: {
    paid: 'dart_shepherd_paid',
    refused: 'dart_shepherd_refused',
    flee: 'dart_shepherd_flee',
    broke: 'dart_shepherd_broke',
  },
  telegraph: 'Fuses lit across the pack. A live dart is still just a bomb — put it on their hull, not yours.',
  aftermath: {
    flee: 'The shepherd reels the pack back into the belt shadow.',
    kill: 'Dart casings and a snapped leash beacon drift off the lane.',
  },
});
