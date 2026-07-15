// Banked E1 follow-on only. This is a truthful registry stub, not a playable encounter.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 310;
export const trigger = deepFreeze({
  id: 'depth_h8_mass_migration_follow_on', tier: 'ambient', deck: 'civilian', weight: 0,
  zoneTypes: [], script: 'followOnStub', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  title: 'MASS MIGRATION', follows: 'depth_h8_echo_of_player', followOnStub: true,
  runtimeReady: false, intendedCadence: 'repeatable_ambient_mandatory_pause',
});
