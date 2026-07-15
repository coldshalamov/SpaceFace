// E1/H2 self-registering first contact. Its first verb permanently defines Understory posture.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 230;
export const trigger = deepFreeze({
  id: 'depth_h2_drifting_bloom', tier: 'major', deck: 'civilian', weight: 1,
  zoneTypes: ['anomaly_deep'], script: 'selfRegistered', pressureCost: 28, cooldownS: 86400,
  proximity: true,
  gates: { uniqueOnce: true, requiredTech: 'tech_long_range_survey', minSectorTier: 3 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h2;
export default defineEncounter(trigger, {
  title: 'FIRST CONTACT: THE DRIFTING BLOOM', factionId: 'faction_understory',
  context: 'encounter', squad: {
    archetypes: ['mule_trader'], size: [1, 1], doctrine: 'balanced', formation: 'loose', passive: true,
  },
  primaryLine: 'A bloom-hull waits beyond the network. It does not hail.',
  choices: [
    { id: 'hail', label: 'Hail first', playerLine: 'We hear you. We will not fire.' },
    { id: 'scan', label: 'Scan first' }, { id: 'fire', label: 'Fire first' },
  ],
  timeoutChoice: 'scan',
  receipts: {
    hailed: 'FIRST CONTACT — Understory trade opens early.',
    scanned: 'FIRST CONTACT — armed, not hot. The bloom remembers caution.',
    fired: 'FIRST CONTACT — the Understory keeps the first shot.',
  },
});
