// Optional salvage engineering at Vesta's existing dead freighter. No starter
// relocation, no hostile ambush, no extra input, no auto-granted fitting.
import { deepFreeze, defineEncounter } from './catalog.js';
import { KINETIC_CATALYST_TRIAL_RUNTIME } from '../../features/kineticCatalysts/fieldTrial.js';

export const encounterOrder = 8105;
export const trigger = deepFreeze({
  id: 'kinetic_catalysts_trial', tier: 'ambient', deck: 'civilian', weight: 1,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 6,
  cooldownS: 1800, proximity: true,
  earlyWindowGuaranteeDay: 0, earlyDelayS: [75, 210],
  gates: { sectorIds: ['sector_vesta_forge'] },
});
export const runtime = KINETIC_CATALYST_TRIAL_RUNTIME;
export default defineEncounter(trigger, {
  shape: { situation: 'set_piece', place: 'derelict_field', twist: 'named', actor: 'faction_reach' },
  title: 'Kinetic Catalysts · fitting trial',
  factionId: 'faction_reach',
  motive: 'a salvage fitter wants a physical calibration record, not another damage chart',
  primaryLine: 'KINETIC CATALYSTS. A Reach fitter offers one recovered relic at the Dead Freighter Drift bench. '
    + 'Choose a three-piece orbital magazine, a delayed repulsion echo, or a two-body load bridge. '
    + 'Only one catalyst may be fitted. Each uses the five powers you already have; each has a physical cost. '
    + 'An empty utility mount is needed to try it here. The chosen relic is yours even if you leave.',
  choices: [
    { id: 'orbital_magazine', label: 'Orbital Magazine · 3 bodies, capacitor drag', playerLine: 'Fit the magazine. I will pay for the load.' },
    { id: 'aftershock_core', label: 'Aftershock Core · delayed echo, fixed origin', playerLine: 'Fit the core. I will clear the echo point.' },
    { id: 'load_bridge', label: 'Load Bridge · shared impulse, short tether', playerLine: 'Fit the bridge. Let the heavy end carry its share.' },
    { id: 'decline', label: 'Leave the bench', playerLine: 'Keep the bench open. I am passing through.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    calibrated: 'Calibration logged. The relic remains fitted. Its physical behavior and its costs follow you out of the trial.',
    inventory: 'The chosen relic is in module inventory. There is no free compatible mount, so fit it through the shipyard before using it. No existing fitting was discarded.',
    retained_unavailable: 'This bench already issued your chosen relic. That exact instance is no longer available; the calibration record cannot issue a replacement.',
    retained_elsewhere: 'Your chosen relic is fitted to another owned ship. Move that exact fitting through the shipyard to run its calibration here.',
    retained: 'The calibration bench closes. Your chosen relic remains yours; no extra relic or salvage reward is issued.',
    unfitted: 'Calibration stopped when the catalyst was removed. The relic stays in your inventory through the ordinary fitting system.',
    spent: 'All four test masses are gone. Calibration ends without replacing them. Your relic remains yours.',
    declined: 'The fitter leaves the bench open. No relic was issued and nothing was charged.',
    fit_refused: 'The fitting bench could not issue the relic. No calibration bodies were deployed.',
  },
});
