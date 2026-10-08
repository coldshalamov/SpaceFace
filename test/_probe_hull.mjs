// TEMP: measure hull speed ceilings on the real actuator path. Delete after use.
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

function finiteAxis(v) { return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }

const host = (() => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    seed: 13502,
    systems: [actions, flightV3, aiPorts, physics],
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  return { runtime, state };
})();

const corsair = (() => {
  const spec = makeEnemySpawnSpec('corsair_raider', 1, { x: 0, z: 0 }, {
    motive: 'probe', engagementTrigger: 'authorized_hostile_spawn', zoneId: 'probe',
  });
  spec.data = spec.data || {};
  spec.data.intent = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, brake: false, fire: false };
  return host.runtime.spawn(spec);
})();

const kestrel = (() => {
  const spec = makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: host.state.player, fittings: [], pos: { x: 400, z: 400 }, rot: 0, team: 0,
  });
  host.state.playerId = spec.id || null;
  const e = host.runtime.spawn(spec);
  host.state.playerId = e.id;
  return e;
})();

const ready = async () => {
  const physicsSys = host.runtime.getSystem('physics');
  await physicsSys.prepareBackend(host.state, { reset: true });
};
await ready();

let corsairPeak = 0;
let kestrelPeak = 0;
for (let i = 0; i < 600; i++) {
  // player input 0.28 throttle with the same gentle turn as M6
  const p = host.state.input;
  p.moveX = 0; p.moveZ = 0.28; p.turnIntent = 0.12; p.boost = false; p.brake = false;
  if (!p.actions) p.actions = {};
  p.actions.brake = false; p.actions.autopursuit = false;
  const ci = corsair.data && corsair.data.intent;
  if (ci) { ci.moveZ = 1; ci.turnIntent = 0; ci.boost = false; ci.brake = false; }
  host.runtime.step(SIM_DT);
  if (i > 60) {
    corsairPeak = Math.max(corsairPeak, Math.hypot(corsair.vel.x, corsair.vel.z));
    kestrelPeak = Math.max(kestrelPeak, Math.hypot(kestrel.vel.x, kestrel.vel.z));
  }
  if (i % 120 === 0) {
    console.log(`t=${(i / 60).toFixed(1)} corsair=${Math.hypot(corsair.vel.x, corsair.vel.z).toFixed(1)} kestrel=${Math.hypot(kestrel.vel.x, kestrel.vel.z).toFixed(1)}`);
  }
}
console.log('PEAK corsair', corsairPeak.toFixed(1), 'kestrel@0.28', kestrelPeak.toFixed(1));
console.log('corsair mass', corsair.mass, 'radius', corsair.radius, 'kestrel mass', kestrel.mass, 'radius', kestrel.radius);
host.runtime.dispose();
