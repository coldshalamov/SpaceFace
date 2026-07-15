// E1/H3 self-registering unique recognition encounter.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 240;
export const trigger = deepFreeze({
  id: 'depth_h3_wreck_that_knows_you', tier: 'minor', deck: 'civilian', weight: 1,
  zoneTypes: ['derelict_field', 'mining_belt', 'trade_lane', 'patrol_corridor', 'anomaly_deep'],
  script: 'selfRegistered', pressureCost: 18, cooldownS: 86400, proximity: true,
  gates: { uniqueOnce: true, storyBeatMin: 6 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h3;
export default defineEncounter(trigger, {
  title: 'THE WRECK THAT KNOWS YOU', factionId: 'faction_free', noCombat: true,
  primaryLine: 'DERELICT: Tessera. Captain Vols said you would outlive us.',
  choices: [
    { id: 'read', label: 'Read the letter', playerLine: 'Read it to the ship.' },
    { id: 'carry', label: 'Carry it', playerLine: 'The Tessera will carry this.' },
    { id: 'ignore', label: 'Ignore it', playerLine: 'Go quiet. Leave it here.' },
  ],
  timeoutChoice: 'ignore',
  receipts: {
    read: 'LETTER READ — the ship remembers its dead.',
    carried: 'LETTER CARRIED — Kurtz can read it at the desk.',
    ignored: 'WRECK SILENT — one witness leaves no epilogue.',
  },
});
