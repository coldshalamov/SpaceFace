// GLASSWAKE: a deliberate, geographically bounded expedition from Vesta's outer derelict drift.
// Include this module in the generated encounter catalog during local integration.
import { deepFreeze, defineEncounter } from './catalog.js';
import { STORM_CHASE_ENCOUNTER_RUNTIME, STORM_CHASE_ENCOUNTER_ID } from '../../features/stormChase/runtime.js';

export const encounterOrder = 8104;
export const trigger = deepFreeze({
  id: STORM_CHASE_ENCOUNTER_ID, tier: 'ambient', deck: 'civilian', weight: 0.8,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 900, proximity: true,
  gates: { sectorIds: ['sector_vesta_forge'] },
});
export const runtime = STORM_CHASE_ENCOUNTER_RUNTIME;
export default defineEncounter(trigger, {
  shape: { situation: 'set_piece', place: 'derelict_field', twist: 'named', actor: 'faction_reach' },
  title: 'GLASSWAKE / Ride the eye', factionId: 'faction_reach',
  motive: 'bring the storm home in a sealed bottle',
  primaryLine: 'GLASSWAKE: A charged front is crossing the outer wreck drift. The eye is moving, and both fronts have forecast openings. '
    + 'Take a survey course, hold the physical sample pods inside a marked pocket until charged, then tow them to the mooring below 12 WU/s. '
    + 'Heavy cover makes a lee; Pin gives a tether something to lean against. Each delivered pod banks crystal and a survey bonus. '
    + 'The next pocket is always optional. Declining costs nothing.',
  choices: [
    { id: 'lee_arc', label: 'Lee Arc / follow the current', playerLine: 'Give me the long outside bend.' },
    { id: 'cross_shear', label: 'Cross Shear / opposing fronts', playerLine: 'I will read the crossing.' },
    { id: 'return_hook', label: 'Return Hook / deep samples', playerLine: 'I will take the returning eye.' },
    { id: 'decline', label: 'Leave the expedition', playerLine: 'Let the storm pass.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    extracted: 'GLASSWAKE: recovered samples are banked. The uncollected bottles stayed with the storm.',
    samples_accounted: 'GLASSWAKE: every bottle is accounted for. The course is closed.',
    return_window_closed: 'GLASSWAKE: the return window has closed. Unrecovered bottles are written off.',
    declined: 'GLASSWAKE: the storm passes. No fitting, no fee, no cargo change.',
    withdrawn: 'GLASSWAKE: the expedition is withdrawn. Delivered samples remain banked.',
    departed: 'GLASSWAKE: you left the survey corridor. Delivered samples remain banked.',
    sector_left: 'GLASSWAKE: the sector is behind you. Loose sample bottles were abandoned.',
    pilot_lost: 'GLASSWAKE: the survey is lost. No unreturned sample was paid.',
    receiver_lost: 'GLASSWAKE: the sample mooring was lost. Delivered samples remain banked; loose bottles cannot be received.',
    move_outside_front: 'GLASSWAKE: move outside the forecast rim before taking a course.',
    owner_unavailable: 'GLASSWAKE: the survey mooring is unavailable. No cargo was taken.',
    interrupted: 'GLASSWAKE: this survey could not be rebound. No missing pod was recreated.',
  },
});
