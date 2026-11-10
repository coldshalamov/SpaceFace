// VERB-37 — a decoy dropped while boosting inherits the hull's vector and keeps flying on it.
// Seed 4242. Two boost speeds must match the ship exactly. A drop that is not a boost sits.
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import { countermeasures } from '../src/systems/countermeasures.js';

const DT = 1 / 60;
const SEED = 4242;

function drop(vel, boosting) {
  const ship = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: vel.x, z: vel.z }, rot: 0,
    flags: { boosting },
    data: { fittings: ['mod_decoy_buoy_s'], combat: {} },
  };
  const state = {
    mode: 'flight', tick: 4, simTime: 1, playerId: 1,
    meta: { seed: SEED }, rng: mulberry32(SEED),
    entities: new Map([[1, ship]]), entityList: [ship],
    input: { deployCountermeasure: true },
    entityIndex: { __spacefaceEntityIndexV1: true, ships: [ship], projectiles: [] },
  };
  const host = Object.create(countermeasures);
  host.init({ state, bus: { on() {}, emit() {} }, helpers: {} });
  host.update(DT, state);
  const effect = ship.data.cm && ship.data.cm.effect;
  return { host, state, ship, effect, body: effect && effect.body };
}

test('a decoy dropped while boosting inherits the ship velocity at two speeds', () => {
  for (const vel of [{ x: 80, z: 12 }, { x: -36, z: 140 }]) {
    const { state, ship, effect, body } = drop(vel, true);
    assert.equal(ship.data.cm.effectT, 8, 'boost inheritance must not retune how long the buoy lives');
    assert.equal(ship.data.cm.cooldownT, 14, 'boost inheritance must not retune the dispenser cooldown');
    assert.equal(ship.data.cm.stock, undefined, 'boost inheritance must not invent a magazine');
    assert.ok(body && body.vel, 'a boost drop leaves a decoy body');
    assert.equal(body.vel.x, ship.vel.x, `seed ${SEED} speed ${vel.x},${vel.z}: body vx`);
    assert.equal(body.vel.z, ship.vel.z, `seed ${SEED} speed ${vel.x},${vel.z}: body vz`);
    assert.equal(effect.originX, body.x);
    assert.equal(effect.originZ, body.z);
    assert.equal(state.entityList.some((e) => e && e.type === 'decoy'), false);
    // The drop copies the numbers. A later change in the ship's speed must not rewrite it.
    ship.vel.x = 0;
    ship.vel.z = 0;
    ship.flags.boosting = false;
    assert.equal(body.vel.x, vel.x);
    assert.equal(body.vel.z, vel.z);
  }
});

test('a decoy dropped without boosting sits, even if the hull is still moving', () => {
  const { host, state, ship, effect, body } = drop({ x: 90, z: -25 }, false);
  assert.ok(body && body.vel, 'a placed buoy still has a body, it just does not inherit speed');
  assert.equal(body.vel.x, 0);
  assert.equal(body.vel.z, 0);
  assert.notEqual(body.vel.x, ship.vel.x);
  const x0 = body.x;
  const z0 = body.z;
  host.update(DT, state);
  assert.equal(body.x, x0, 'a buoy that was not thrown on a boost does not drift');
  assert.equal(body.z, z0);
  assert.equal(effect.originX, x0);
  assert.equal(effect.originZ, z0);
  assert.equal(ship.data.cm.effectT, 8 - DT);
});

test('the boost drop keeps flying on the drop vector after the ship slows, and a seeker follows it', () => {
  const { host, state, ship, body } = drop({ x: 120, z: -40 }, true);
  assert.ok(body && body.vel, 'a boost drop leaves a decoy body');
  const missile = {
    id: 9, type: 'projectile', alive: true, radius: 1,
    pos: { x: body.x, z: body.z }, vel: { x: 0, z: 0 },
    data: { kind: 'missile', targetId: 42, turnRate: 2 },
  };
  state.entityList.push(missile);
  state.entities.set(missile.id, missile);
  state.entityIndex.projectiles.push(missile);
  const droppedX = body.x;
  const droppedZ = body.z;
  ship.vel.x = 0;
  ship.vel.z = 0;
  ship.flags.boosting = false;
  host.update(DT, state);
  assert.equal(body.vel.x, 120, 'the buoy keeps the speed it was dropped with');
  assert.equal(body.vel.z, -40);
  assert.ok(Math.abs(body.x - (droppedX + 120 * DT)) < 1e-9, 'the buoy flies along the drop vector');
  assert.ok(Math.abs(body.z - (droppedZ - 40 * DT)) < 1e-9);
  assert.equal(missile.data.diverted, true, 'a seeker that crosses the buoy still goes for it');
  assert.equal(missile.data.divertPos.x, body.x);
  assert.equal(missile.data.divertPos.z, body.z);
  assert.equal(missile.data.targetId, ship.data.cm.effect.decoyId);
});
