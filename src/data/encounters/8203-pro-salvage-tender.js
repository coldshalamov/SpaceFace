// Ordinary Adventure discovery. The encounter introduces one persistent object; the feature
// runtime owns every later visit, service, restoration and departure from that same barge.
import { deepFreeze, defineEncounter } from './catalog.js';
import { SALVAGE_TENDER_ENCOUNTER_RUNTIME } from '../../features/salvageTender/runtime.js';

export const encounterOrder = 8203;
export const trigger = deepFreeze({
  id: 'pro_salvage_tender',
  tier: 'ambient', deck: 'civilian', weight: 0.8,
  zoneTypes: ['civilian_core', 'mining_belt', 'derelict_field'],
  script: 'selfRegistered', pressureCost: 4,
  cooldownS: 1800, proximity: true,
  earlyWindowGuaranteeDay: 0, earlyDelayS: [90, 180],
  gates: { sectorIds: ['sector_helios_prime', 'sector_ceres_belt'] },
});

export const runtime = SALVAGE_TENDER_ENCOUNTER_RUNTIME;

export default defineEncounter(trigger, {
  shape: { situation: 'salvage', place: trigger.zoneTypes, twist: 'named', actor: 'none' },
  title: 'Morrowlight · a light left on',
  primaryLine: 'A battered service barge is still answering its own berth lamp. '
    + 'The pump, repair bench and cargo fairlead could work again. '
    + 'Inspect it, use the Massline to bring it into the marked berth, then decide whether to claim it. '
    + 'The first restoration needs one salvage electronics unit or 45 cr. Looking costs nothing.',
  verbs: ['inspect', 'latch', 'tow', 'salvage', 'return'],
  choices: [
    { id: 'inspect', label: 'Inspect the service barge', playerLine: 'Let me see what still works.' },
    { id: 'decline', label: 'Leave it for now', playerLine: 'Keep your light on.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    inspected: 'Morrowlight is marked. Accept the recovery at the barge when you are ready. Ownership has not changed.',
    declined: 'You leave the barge unclaimed. Its light stays on; you can return later.',
    known: 'Morrowlight is already on your chart. The same barge is waiting where you left it.',
    already_home: 'Morrowlight is already yours. The same barge is waiting where you left it.',
    claimed: 'Morrowlight · Lantern Berth. The home beacon and fuel-cell pump are yours now.',
    left: 'The barge remains where you left it. No charge, no lost claim, no fresh replacement.',
  },
});
