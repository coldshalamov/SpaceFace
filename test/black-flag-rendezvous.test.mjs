import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { captureEntitySelection } from '../src/ui/sim/stableSelection.js';

const DT = 1 / 60;
function runtime() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  const player = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player }));
  const target = makeEntity(makeShipEntitySpec('ship_mule', { team: 2, pos: { x: 700, z: 0 } }));
  player.id = 1; target.id = 2; player.occupantGeneration = 1; target.occupantGeneration = 2;
  target.vel.set(44, 0, 0); target.data.ai = null;
  state.entities = new Map([[1, player], [2, target]]); state.entityList = [player, target]; state.playerId = 1;
  state.nav.autopilot = { active: true, rendezvous: true, targetEntityId: 2,
    stable: captureEntitySelection(target), target: { x: 700, z: 0 }, arrivalRadius: 36, status: 'armed' };
  const flight = Object.create(flightV3);
  flight.init({ state, bus, helpers: { getEntity: id => state.entities.get(id) } });
  return { state, bus, player, target, flight };
}

test('native Rapier rendezvous catches a ballistic 44 WU/s hull and maintains boarding range and relative speed', async () => {
  const { state, player, target, flight } = runtime();
  const native = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    native.syncFromEntities(state.entityList);
    let lastWorstRange = 0, lastWorstRelative = 0;
    for (let tick = 1; tick <= 1800; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      // Run the production player controller against the untouched ballistic target body.
      flight._stepCraft(player, state.input, DT, state, true);
      native.step(DT, tick);
      if (tick > 1200) {
        lastWorstRange = Math.max(lastWorstRange, player.pos.distanceTo(target.pos));
        lastWorstRelative = Math.max(lastWorstRelative, player.vel.distanceTo(target.vel));
      }
    }
    assert.ok(lastWorstRange < 115, `boarding band maintained for final ten seconds (${lastWorstRange} WU)`);
    assert.ok(lastWorstRelative < 14, `relative motion maintained for final ten seconds (${lastWorstRelative} WU/s)`);
    assert.equal(state.nav.autopilot.active, true, 'moving rendezvous does not retire as an absolute stop');
    assert.equal(state.nav.autopilot.status, 'rendezvous-holding');
    assert.ok(Math.abs(target.vel.x - 44) < .01, 'target remains ballistic; the controller never brakes it');
    assert.ok(Math.abs(target.pos.x - (700 + 44 * 30)) < 1, 'real native motion continues throughout');
    state.input.moveX = .5;
    flight._stepCraft(player, state.input, DT, state, true);
    assert.equal(state.nav.autopilot.active, false);
    assert.equal(state.nav.autopilot.status, 'manual');
  } finally { native.dispose(); }
});

test('rendezvous spends actual channels and resources; absent opt-in retains ordinary kernel output', () => {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 28, inertia: 900 };
  const args = { dt: DT, body, profile, runtime: createPropulsionRuntime(profile), input: { throttle: .5, assistMode: 'assisted' } };
  const ordinary = structuredClone(stepPropulsion(args));
  assert.deepEqual(stepPropulsion({ ...args, input: { ...args.input, rendezvous: null } }), ordinary);
  const command = { rendezvous: { velocity: { x: 100, z: 100 }, heading: 1 } };
  const result = stepPropulsion({ ...args, input: command });
  assert.ok(result.force.x > 0); assert.ok(result.force.z > 0);
  assert.ok(result.resourceDelta.energy <= 0);
  const dead = stepPropulsion({ ...args, input: command, authority: { forward: 0, reverse: 0, strafe: 0, yaw: 0 } });
  assert.equal(dead.force.x, 0); assert.equal(dead.force.z, 0); assert.equal(dead.torque.y, 0);
  assert.deepEqual(body.vel, { x: 0, z: 0 }, 'the pure kernel never changes velocity');
});

test('lost target and unattainable target speed retire rendezvous explicitly', () => {
  for (const kind of ['lost', 'fast']) {
    const { state, player, target, flight } = runtime();
    if (kind === 'lost') target.alive = false;
    else target.vel.x = 2000;
    flight._stepCraft(player, state.input, DT, state, true);
    assert.equal(state.nav.autopilot.active, false);
    assert.equal(state.nav.autopilot.status, kind === 'lost' ? 'lost-target' : 'target-too-fast');
  }
});
