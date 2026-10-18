// FIELD TRIAL — glue, meet mass. Offered on the Vesta derelict, declined for
// free, and settled by the adhesive law. The runtime owns the fitting, the
// three masses, and the two physical endings.
import { deepFreeze, defineEncounter } from './catalog.js';
import { GLUE_MEET_MASS_RUNTIME } from '../../systems/glueMeetMassRuntime.js';

export const encounterOrder = 1303;
export const trigger = deepFreeze({
  id: 'glue_meet_mass', tier: 'ambient', deck: 'civilian', weight: 1,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 1800, proximity: true,
  earlyWindowGuaranteeDay: 0, earlyDelayS: [45, 180],
  gates: { sectorIds: ['sector_vesta_forge'], uniqueOnce: true },
});
export const runtime = GLUE_MEET_MASS_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'set_piece',
    place: 'derelict_field',
    twist: 'named',
    actor: 'faction_reach',
  },
  title: 'Field trial',
  factionId: 'faction_reach',
  motive: 'the film has to earn its note',
  primaryLine: 'FIELD TRIAL: Nothing moves until you take the fitting. The hold needs room for four units of polymers. '
    + 'A light hull, a loose wreck, and a heavy rock sit in the drift. '
    + 'Bridge the light hull to the wreck and shove them, or coat the hull and finish it with guns. '
    + 'A miss leaves the surface bare. You can leave the trial.',
  choices: [
    { id: 'fit', label: 'Take the fitting', playerLine: 'I will take the fitting.' },
    { id: 'decline', label: 'Leave the trial', playerLine: 'I am leaving the trial.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    shoved: 'The film held the shove. Calibration is logged and 280 credits are paid. The sterile sample stays a paid choice, and the gun does not get hotter.',
    coated: 'The coated hull is down. Calibration is logged and 280 credits are paid. The sterile sample stays a paid choice, and the gun does not get hotter.',
    fought_bare: 'The hull went down bare. No film, no calibration, and no pay.',
    samples_gone: 'The sample is gone and nothing held. The trial closes unpaid.',
    unfinished: 'The lane stops watching. The trial is unfinished and unpaid.',
    declined: 'The trial stays on the bench. The hold and the wallet are unchanged.',
    hold_full: 'The hold cannot take the sample. Nothing was loaded.',
  },
});
