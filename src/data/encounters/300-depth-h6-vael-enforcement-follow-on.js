// Banked E1 follow-on only. This is a truthful registry stub, not a playable encounter.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 300;
export const trigger = deepFreeze({
  id: 'depth_h6_vael_enforcement_follow_on', tier: 'major', deck: 'combat', weight: 0,
  zoneTypes: [], script: 'followOnStub', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  title: 'VAEL ENFORCEMENT', follows: 'depth_h6_patrol_ambush', followOnStub: true,
  runtimeReady: false, intendedCadence: 'late_game_unique',
});
