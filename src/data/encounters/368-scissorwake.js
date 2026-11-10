import { deepFreeze, defineEncounter } from './catalog.js';
import { scissorwakeEncounter } from '../../systems/scissorwake.js';

export const encounterOrder = 368;
export const trigger = deepFreeze({
  id: 'scissorwake_intro', tier: 'minor', deck: 'combat', weight: 0.55,
  zoneTypes: ['ambush_lane', 'mining_belt', 'outlaw_zone'],
  script: 'selfRegistered', fallbackScript: 'ambush', pressureCost: 36,
  cooldownS: 1200, proximity: true,
  gates: { minSectorTier: 1, maxSecurity: 0.8, storyBeatMin: 1 },
});
export const runtime = scissorwakeEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'none', actor: 'faction_reach' },
  motive: 'engineered_line_cut', engagementTrigger: 'player_massline_active',
  factionId: 'faction_reach', context: 'encounter', title: 'SCISSORWAKE',
  primaryLine: 'SCISSORWAKE: a light cutter opens a fixed crossing. Move the line or move the cutter.',
  squad: { anchorArchetype: 'scissorwake', archetypes: ['wasp_swarmer'],
    size: [3, 3], doctrine: 'scavenger', formation: 'loose' },
  bark: 'ambush_tele', telegraph: 'The cutter commits once. Sidestep its crossing, release, or throw it back.',
  aftermath: { flee: 'The missed crossing folds shut behind you.', kill: 'The exposed cutter is scrap; the line is yours.' },
});
