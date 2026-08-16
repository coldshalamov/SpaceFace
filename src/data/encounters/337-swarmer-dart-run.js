// Dart run — a thin high-speed file crossing an exposed outer lane.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 337;
export const trigger = deepFreeze({
  id: 'swarmer_dart_run',
  tier: 'minor',
  deck: 'combat',
  weight: 0.6,
  zoneTypes: ['ambush_lane', 'trade_lane', 'patrol_corridor'],
  script: 'ambush',
  pressureCost: 38,
  cooldownS: 720,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.72,
  },
});

export default defineEncounter(trigger, {
  motive: 'lane_interception',
  engagementTrigger: 'player_crosses_attack_lane',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'DART RUN',
  primaryLine: 'FAST CONTACTS: a Dart file is committing to the lane. Cross it; do not chase it.',
  squad: {
    archetypes: ['dart_swarmer'],
    size: [4, 7],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'White-blue run-in. Cross the lane before the file commits.',
  aftermath: {
    flee: 'The Dart file extends past the lane and does not turn in pursuit.',
    kill: 'Payroll chips mark the line where the run broke.',
  },
});
