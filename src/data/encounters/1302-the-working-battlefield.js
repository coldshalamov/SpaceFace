import { deepFreeze, defineEncounter } from './catalog.js';
import { WORKING_BATTLEFIELD_RUNTIME } from '../../systems/workingBattlefieldRuntime.js';

export const encounterOrder = 1302;
export const trigger = deepFreeze({
  id: 'the_working_battlefield', tier: 'ambient', deck: 'civilian', weight: 1,
  zoneTypes: ['mining_belt'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 1800, proximity: true, gates: { sectorIds: ['sector_ceres_belt'] },
  earlyWindowGuaranteeDay: 0, earlyDelayS: [180, 300],
});
export const runtime = WORKING_BATTLEFIELD_RUNTIME;
export default defineEncounter(trigger, {
  shape: { situation: 'yard', place: 'mining_belt', twist: 'named', actor: 'faction_mts' },
  title: 'The Working Battlefield', factionId: 'faction_mts',
  primaryLine: 'CERES YARD: The crusher keeps working under guard. Bring down its control tower. '
    + 'Ride the warning, shove the heavy workpiece into the jaw on the surge, or mine the breaking plate and use guns. '
    + 'Bring a mining beam and a gun; the Helios shipyard stocks both. No fee; two job polymers need 2.4u free hold space. Lost output costs 180 cr. '
    + 'Contain the aftermath or leave the yard; you can abandon the contract from the Mission Log.',
  choices: [{ id: 'accept', label: 'Take the demolition job' }, { id: 'decline', label: 'Leave the yard working' }],
  receipts: {
    accepted: 'Yard contract accepted. The marked tower is beside Excavator Jaws.',
    declined: 'The yard keeps working. No contract, no charge.',
    not_ready: 'The job is on the Ceres mission board. Check the equipment and cargo requirements, then accept there.',
  },
});
