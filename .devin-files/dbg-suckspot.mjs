import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { GYRE_SNARE } from '../src/data/gyreSnare.js';

const sim = createSimulation({ seed: 4343, bus: createBus(), systems: [gyreSnare, physics] });
const { state, helpers } = sim;
state.mode = 'flight';
state.input.actions = {};
const player = sim.spawn({
  type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
  vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
  flightModel: { inertia: 88 }, flags: {},
  physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
  data: { combatProfileId: 'combat_profile_standard_ship' },
});
state.playerId = player.id;
player.cap = 100;
const sys = sim.registry.get('gyreSnare');
const physicsSys = sim.registry.get('physics');
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
console.log('ready=', await physicsSys.prepareBackend(state));

const rock = (x, z, mass = 6, radius = 4, type = 'asteroid') => sim.spawn({
  type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true,
  hull: 40, hullMax: 40,
  physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
  data: {},
});

rock(200, 0, 6, 4);
for (let i = 0; i < 10; i++) { state.input.actions.gyreSnare = true; sim.step(); }
console.log('phase', sys._rt.phase);
const core = state.entities.get(sys._rt.coreId);
console.log('core pos', core.pos, 'clumpR', sys._rt.clumpRadius);
const victim = rock(core.pos.x + 40, core.pos.z, 6, 4);
state.input.actions.gyreSnare = true; sim.step();
console.log('victim pos', victim.pos, 'alive', victim.alive);
console.log('scratch len', sys._spotScratch.length, JSON.stringify(sys._spotScratch));
console.log('rt.basinSpots', JSON.stringify(sys._rt.basinSpots));
console.log('pub.basinSpots', JSON.stringify(state.gyreSnare.basinSpots));
console.log('dist victim-core', Math.hypot(core.pos.x - victim.pos.x, core.pos.z - victim.pos.z));

// second run, instrumented
const sim2 = createSimulation({ seed: 4343, bus: createBus(), systems: [gyreSnare, physics] });
const st2 = sim2.state, h2 = sim2.helpers;
st2.mode = 'flight'; st2.input.actions = {};
const p2 = sim2.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
  vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200, flightModel: { inertia: 88 }, flags: {},
  physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
  data: { combatProfileId: 'combat_profile_standard_ship' } });
st2.playerId = p2.id; p2.cap = 100;
const s2 = sim2.registry.get('gyreSnare');
const os = s2._suckPass.bind(s2), op = s2._pullPass.bind(s2);
s2._suckPass = (dt, s, pl, core, rt) => { const c0 = s2._spotScratch.length; os(dt, s, pl, core, rt); console.log('  suck: suckCount', rt.suckCount, 'spotScratch', c0, '->', s2._spotScratch.length); };
s2._pullPass = (dt, s, pl, m, n, o) => { const c0 = s2._spotScratch.length; op(dt, s, pl, m, n, o); console.log('  pull: spotScratch', c0, '->', s2._spotScratch.length, 'basinSpots', s2._rt.basinSpots.length); };
const rock2 = (x, z, mass = 6, radius = 4, type = 'asteroid') => sim2.spawn({
  type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true,
  hull: 40, hullMax: 40,
  physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
  data: {},
});
rock2(200, 0, 6, 4);
for (let i = 0; i < 10; i++) { st2.input.actions.gyreSnare = true; sim2.step(); }
console.log('phase2', s2._rt.phase);
const c2 = st2.entities.get(s2._rt.coreId);
rock2(c2.pos.x + 40, c2.pos.z, 6, 4);
console.log('--- step with victim ---');
st2.input.actions.gyreSnare = true; sim2.step();
console.log('pub spots', JSON.stringify(st2.gyreSnare.basinSpots));

rock2(c2.pos.x + 60, c2.pos.z, 6, 4);
console.log('--- step again (index settle) ---');
st2.input.actions.gyreSnare = true; sim2.step();
console.log('pub spots', JSON.stringify(st2.gyreSnare.basinSpots), 'suckCount', s2._rt.suckCount);
