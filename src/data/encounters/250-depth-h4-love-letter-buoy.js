// E1/H4 self-registering rare encounter. Re-seeding, not reward, is its terminal verb.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 250;
export const trigger = deepFreeze({
  id: 'depth_h4_love_letter_buoy', tier: 'ambient', deck: 'civilian', weight: 0.35,
  zoneTypes: ['patrol_corridor'], script: 'selfRegistered', pressureCost: 5, cooldownS: 600,
  proximity: true, rare: true,
  gates: { sectorIds: ['sector_io_reach'], blockAfterOutcome: 'reseeded' },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h4;
export default defineEncounter(trigger, {
  title: 'THE LOVE LETTER BUOY', factionId: 'faction_free', noCombat: true, noCredits: true,
  primaryLine: 'BUOY: Nera, I will hold the corridor until your light returns.',
  choices: [
    { id: 'reseed', label: 'Re-seed on the grave route', playerLine: 'Take the letter where they waited.' },
    { id: 'listen', label: 'Let it play', playerLine: 'Let the letter finish.' },
  ],
  timeoutChoice: 'listen',
  receipts: {
    reseeded: 'LETTER RE-SEEDED — the old broadcast finally stops.',
    heard: 'LETTER HEARD — the buoy keeps its date.',
  },
});
