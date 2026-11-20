import { deepFreeze, defineEncounter } from './catalog.js';
import { BLACKBOX_RUNS_RUNTIME } from '../../features/derelictExpedition/encounterRuntime.js';

export const encounterOrder = 8102;
export const trigger = deepFreeze({
  id: 'blackbox_runs', tier: 'ambient', deck: 'civilian', weight: 1,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 300, proximity: true,
  earlyWindowGuaranteeDay: 0, earlyDelayS: [60, 150],
  gates: { sectorIds: ['sector_vesta_forge'] },
});
export const runtime = BLACKBOX_RUNS_RUNTIME;

export default defineEncounter(trigger, {
  shape: { situation: 'salvage', place: 'derelict_field', twist: 'depth', actor: 'faction_reach' },
  title: 'BLACKBOX RUNS', factionId: 'faction_reach',
  motive: 'the flight recorder is worth a tow; the reactor core is worth a risk',
  primaryLine: 'Morrowglass has three broken holds. Work the shutter, vent the pressure hold, '
    + 'then tow its flight recorder to our open receiver. The deeper relay vault holds a heavier core. '
    + 'Take it if you want the extra pay, but pressure will make the return harder. '
    + 'Pull, Shove, Pin, Bomb, Rig, the Massline and ordinary guns all work on the hardware. Enter the run?',
  choices: [
    { id: 'enter', label: 'Enter the derelict', playerLine: 'Mark the receiver. I am going in.' },
    { id: 'decline', label: 'Leave it for now', playerLine: 'Keep the channel open. I am passing through.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    accepted: 'Receiver marked. Clear the three holds, tow the recorder back, and brake the load inside the open cradle. The deeper core is optional.',
    resumed: 'Same wreck, same load. Your cleared access remains open; lost cargo stays lost.',
    declined: 'The recovery offer stays open. Nothing has been disturbed.',
    spent: 'Morrowglass is spent. The recovered cargo has been settled and the missing hardware cannot be claimed again.',
  },
});
