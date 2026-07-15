// E1/H7 self-registering reveal of a moral debt captured through the generalized memory seam.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 280;
export const trigger = deepFreeze({
  id: 'depth_h7_spared_return', tier: 'minor', deck: 'civilian', weight: 1,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'outlaw_zone', 'derelict_field'],
  script: 'selfRegistered', pressureCost: 14, cooldownS: 900, proximity: false,
  gates: { moralDebtOnly: true },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h7;
export default defineEncounter(trigger, {
  title: 'THE SPARED RETURN', factionId: 'faction_free', noCombat: false,
  primaryLine: 'A spared transponder returns on the seed you gave it.',
  choices: [
    { id: 'ask', label: 'Ask why', playerLine: 'Why did you come back?' },
    { id: 'accept', label: 'Accept the return', playerLine: 'Then come back alive.' },
    { id: 'refuse', label: 'Refuse', playerLine: 'The debt ends here.' },
  ],
  timeoutChoice: 'ask',
  receipts: {
    allied: 'DEBT RETURNED — mercy made a mission possible.',
    vengeful: 'DEBT RETURNED — mercy came back armed.',
    refused: 'DEBT REFUSED — the spared contact departs.',
  },
});
