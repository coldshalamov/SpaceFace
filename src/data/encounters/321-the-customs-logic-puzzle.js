// 321 — THE CUSTOMS LOGIC PUZZLE. Stanhope steal: a customs officer whose evasion is
// a logical argument that implicates them. The officer isn't hiding the corruption;
// the officer is performing it as syllogism, and the syllogism is airtight, and the
// airtightness is the confession. No edginess without logic; the logic is the edge.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 321;
export const trigger = deepFreeze({
  id: 'side_customs_logic', tier: 'minor', deck: 'civilian', weight: 0.7,
  zoneTypes: ['patrol_corridor'], script: 'selfRegistered',
  pressureCost: 12, cooldownS: 86400, proximity: true,
  gates: { uniqueOnce: true, storyBeatMin: 3 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h9;
export default defineEncounter(trigger, {
  title: 'THE CUSTOMS LOGIC PUZZLE', factionId: 'faction_scn', noCombat: true,
  primaryLine: 'CUSTOMS: The manifest says alloy. The scan says 12,400kg. The seal is Concord. I sign the seal. The seal is my department. The weight is not my department.',
  choices: [
    { id: 'press',  label: 'Press the weight',     playerLine: 'Whose department is the weight?' },
    { id: 'appeal', label: 'File an appeal',       playerLine: 'File it.' },
    { id: 'accept', label: 'Accept the signature', playerLine: 'Accept it.' },
  ],
  timeoutChoice: 'accept',
  receipts: {
    press:  'OFFICER PRESSED — "The weight is Logistics Oversight. Oversight is Vale. Vale is the seal. The seal is mine. The chain is unbroken."',
    appeal: 'APPEAL FILED — routed to Logistics Oversight under REF 44-C. The window has been open 14 years. Your appeal is now in it.',
    accept: 'SIGNATURE ACCEPTED — the officer initials both entries. The second is filed under REG 44-C. You did not look. The officer did not look up.',
  },
  graffitiOn: {
    appeal: { line: 'THE APPEAL WINDOW OPENS BOTH WAYS.', where: 'airlock' },
  },
});
