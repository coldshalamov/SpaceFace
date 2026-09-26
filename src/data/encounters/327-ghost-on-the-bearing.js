// 327 — A Quiet ghost on long-range bearing. Sniper disengage after alpha.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 327;
export const trigger = deepFreeze({
  id: 'ghost_on_the_bearing',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field', 'border_checkpoint'],
  script: 'ambush',
  pressureCost: 48,
  cooldownS: 540,
  proximity: false,
  gates: {
    maxSecurity: 0.55,
    storyBeatMin: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_quiet',
  },
  motive: 'assassination',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_quiet',
  context: 'encounter',
  title: 'GHOST ON THE BEARING',
  primaryLine: 'SENSOR GHOST: one hard lock, then static. Someone is paid to miss the paperwork.',
  squad: {
    archetypes: ['quiet_ghost', 'lancer_sniper'],
    size: [1, 2],
    doctrine: 'balanced',
    formation: 'loose',
  },
  // Demand mode (ambush script): the ghost voices its contract and opens the timed fork —
  // buy out the contract, hold the bearing and fight, or burn off it — instead of a silent
  // stalk that only ever resolves into a sprung fight or a quiet despawn.
  bark: 'ghost_contract_demand',
  offerS: 12,
  timeoutChoice: 'refuse',
  buyoutCr: 420,                                  // matches the quiet_ghost contract price
  choices: [
    { id: 'buyout', label: 'Buy out the contract', needs: 'credits', playerLine: 'I pay the contract price. Take the credits and lose my bearing.' },
    { id: 'refuse', label: 'Hold the bearing', playerLine: 'Your client overpaid for a warning shot. Come collect.' },
    { id: 'run', label: 'Burn off the bearing', playerLine: 'No deal. I am already gone.' },
  ],
  springBark: 'ghost_spring',
  ackBarks: {
    bought: 'ghost_contract_bought_ack',
    refused: 'ghost_refused_ack',
    flee: 'ghost_flee_ack',
    broke: 'ghost_broke_ack',
  },
  telegraph: 'Sensor ghost blooming. Trust the drive flare.',
  aftermath: {
    flee: 'The ghost reappears on a new bearing with the same lock tone.',
    kill: 'Quiet leaves no wreck name — only a blank receipt.',
  },
});
