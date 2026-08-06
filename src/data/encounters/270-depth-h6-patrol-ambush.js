// E1/H6 self-registering repeatable opportunist battle.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 270;
export const trigger = deepFreeze({
  id: 'depth_h6_patrol_ambush', tier: 'minor', deck: 'combat', weight: 1.2,
  zoneTypes: ['patrol_corridor', 'ambush_lane'], script: 'selfRegistered', pressureCost: 42,
  cooldownS: 540, proximity: true, gates: { minSectorTier: 2 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h6;
export default defineEncounter(trigger, {
  title: 'THE PATROL AMBUSH', factionId: 'faction_scn', context: 'patrol',
  squad: {
    archetypes: ['lancer_sniper'], size: [2, 2], doctrine: 'anchor', formation: 'wedge', team: 1,
  },
  escort: {
    archetypes: ['reaver_pirate', 'wasp_swarmer'], size: [2, 3], doctrine: 'scavenger',
    formation: 'loose', factionId: 'faction_reach', context: 'encounter', team: 2,
  },
  primaryLine: 'CONCORD and Reach are already firing. Both demand your guns.',
  choices: [
    { id: 'concord', label: 'Aid Concord', playerLine: 'Concord, mark us friendly.' },
    { id: 'reach', label: 'Aid the Reach', playerLine: 'Reach pack, we tip this together.' },
    { id: 'wait', label: 'Wait and vulture', playerLine: 'Hold fire. Let them spend themselves.' },
  ],
  timeoutChoice: 'wait',
  receipts: {
    concord: 'PATROL TIPPED — Concord records your aid.',
    reach: 'PACK TIPPED — the Reach records your aid.',
    vultured: 'FIELD VULTURED — the weakened winner turns on you.',
  },
});
