import { deepFreeze, defineEncounter } from './catalog.js';
import { TOWJAW_ENCOUNTER_RUNTIME } from '../../features/towjaw/encounter.js';

export const encounterOrder = 8101;
export const trigger = deepFreeze({
  id: 'pro_five_towjaw', tier: 'major', deck: 'combat', weight: 1,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 28,
  cooldownS: 3600, proximity: true,
  gates: { sectorIds: ['sector_vesta_forge'], uniqueOnce: true },
});
export const runtime = TOWJAW_ENCOUNTER_RUNTIME;
export default defineEncounter(trigger, {
  shape: { situation: 'set_piece', place: 'derelict_field', twist: 'named', actor: 'faction_reach' },
  title: 'TOWJAW — The Borrowed Hull', factionId: 'faction_reach',
  motive: 'a salvage tug is stealing the field to armor itself',
  primaryLine: 'A huge yard tug is stripping the Vesta wreck field. Its armor is stolen wreckage. Investigate to confront TOWJAW, or leave the field undisturbed. Nothing launches until you choose.',
  choices: [
    { id: 'investigate', label: 'Confront TOWJAW', playerLine: 'That scrap is not yours yet.' },
    { id: 'decline', label: 'Leave the wreck field', playerLine: 'Keep the rust.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    defeated: 'TOWJAW is disabled. The surviving armor plates and cargo are real salvage: collect the freight or work the wrecks.',
    retreated: 'TOWJAW gives up the field. Surviving loose plates and freight remain to salvage.',
    declined: 'The yard tug keeps working. You leave without a fight.',
    already_settled: 'The TOWJAW field has already been settled.',
  },
});
