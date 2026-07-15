// E1/H5 self-registering alignment hinge. Intentionally no neutral/fourth branch.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 260;
export const trigger = deepFreeze({
  id: 'depth_h5_corridor_massacre', tier: 'major', deck: 'combat', weight: 1,
  zoneTypes: ['patrol_corridor'], script: 'selfRegistered', pressureCost: 55, cooldownS: 86400,
  proximity: true, gates: { uniqueOnce: true, sectorIds: ['sector_io_reach'], storyBeatMin: 5 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h5;
export default defineEncounter(trigger, {
  title: 'THE CORRIDOR MASSACRE', factionId: 'faction_scn', context: 'patrol',
  squad: {
    archetypes: ['lancer_sniper', 'bruiser_brawler'], size: [2, 3], doctrine: 'anchor',
    formation: 'wedge', team: 1, passive: true,
  },
  primaryLine: 'CONCORD: witness contact. Prepare the pirate cover channel.',
  choices: [
    { id: 'flee', label: 'Flee silent', playerLine: 'We saw nothing. Burn out.' },
    { id: 'publish', label: 'Record and publish', playerLine: 'Send the record. Name the dead.' },
    { id: 'engage', label: 'Engage Concord', playerLine: 'No cover story. Weapons free.' },
  ],
  timeoutChoice: 'flee',
  receipts: {
    fled: 'COVER HOLDS — Concord credits your silence.',
    published: 'RECORD PUBLISHED — Vale closes; Orrin opens.',
    engaged: 'CONCORD ENGAGED — Dorin and the atrocity branch open.',
  },
});
