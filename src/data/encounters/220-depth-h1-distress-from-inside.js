// E1/H1 self-registering unique encounter: Captain Vols's old mayday at the Helios yard.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 220;
export const trigger = deepFreeze({
  id: 'depth_h1_distress_from_inside', tier: 'major', deck: 'civilian', weight: 1,
  zoneTypes: ['anomaly_deep'], script: 'selfRegistered', pressureCost: 22, cooldownS: 86400,
  proximity: true, anchorPoiId: 'poi_helios_yard',
  gates: {
    uniqueOnce: true, sectorIds: ['sector_helios_prime'], storyBeatMin: 3,
    requiredPoiDiscovered: 'poi_helios_yard', requirePriorPoiVisit: true,
  },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h1;
export default defineEncounter(trigger, {
  title: 'THE DISTRESS FROM INSIDE', factionId: 'faction_free', noCombat: true, noCredits: true,
  primaryLine: 'VOLS: Mayday. Tessera drive gone. Four souls. Anyone receiving.',
  choices: [
    { id: 'listen', label: 'Listen', playerLine: 'I will listen to the end.' },
    { id: 'board', label: 'Board the wreck', playerLine: 'I will bring the black box home.' },
    { id: 'leave', label: 'Leave quietly', playerLine: 'Let the mayday keep flying.' },
  ],
  timeoutChoice: 'leave',
  receipts: {
    listen: 'MAYDAY HEARD — Vols remains in the Tessera.',
    boarded: 'BLACK BOX RECOVERED — fourteen months late.',
    left: 'MAYDAY LEFT BROADCASTING — no rescue remains.',
  },
});
