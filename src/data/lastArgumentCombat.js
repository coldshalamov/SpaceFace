// Actual SG-03 subsystem volumes. All guns are disabled through the native capability view.
import { LAST_ARGUMENT as C } from './lastArgument.js';
const component = (id, capability, x, z, hx, hz, health, cue = 'combat.subsystem.weapon.disabled') => ({
  id: `subsystem_last_argument_${id}`, version: 1, tags: ['last_argument', id],
  volume: { shape: 'box', space: 'normalized', center: [x/C.radius,z/C.radius], halfExtents: [hx/C.radius,hz/C.radius] },
  health, armor: { flat: 0, multipliers: { kinetic: 1, thermal: 1, ion: 1.15, plasma: 1, phase: 1 } },
  dependencies: [], disabledBehavior: { capabilities: { [capability]: false } },
  repair: { fieldRatePerTick: 0, dockRatePerTick: 0 }, cueId: cue,
});
export const LAST_ARGUMENT_SUBSYSTEMS = Object.freeze([
  component('port', 'lastArgumentPort', -24,-68,68,22,270),
  component('starboard', 'lastArgumentStarboard', -24,68,68,22,270),
  component('spine', 'lastArgumentSpine', 107,0,64,16,340),
  component('drive', 'drive', -139,0,22,58,520,'combat.subsystem.drive.disabled'),
  component('sensor', 'sensor', -78,0,23,17,210,'combat.subsystem.sensor.disabled'),
]);
export const LAST_ARGUMENT_COMBAT_PROFILE = Object.freeze({
  id: 'combat_profile_last_argument', version: 1, entityTypes: ['ship'],
  heat: { max: 220, dissipationPerTick: 0.35 }, immunityTags: [],
  subsystemIds: LAST_ARGUMENT_SUBSYSTEMS.map(s => s.id),
  sockets: [
    { id: 'socket_hull', tags: ['tether'], localPos: [0,0], maxAttachments: 4 },
    { id: 'socket_bow', tags: ['tether'], localPos: [153/C.radius,0], maxAttachments: 2 },
  ],
  capabilities: { drive: true, weapon: true, sensor: true, tether: false, power: true,
    lastArgumentPort: true, lastArgumentStarboard: true, lastArgumentSpine: true },
});
export const LAST_ARGUMENT_CAPABILITY_TO_REQUIREMENT = Object.freeze({
  lastArgumentPort: 'last_argument_port', lastArgumentStarboard: 'last_argument_starboard',
  lastArgumentSpine: 'last_argument_spine',
});
