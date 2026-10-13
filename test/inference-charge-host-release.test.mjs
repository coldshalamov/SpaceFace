import test from 'node:test';
import assert from 'node:assert/strict';
import { impulseCharges } from '../src/systems/impulseCharges.js';

function fixture() {
  const host = { id: 1, type: 'asteroid', alive: true, radius: 12, rot: 0,
    pos: { x: 100, z: 40 }, vel: { x: 30, z: -6 } };
  const charge = { id: 2, type: 'charge', alive: true, radius: 1.2, rot: 0,
    pos: { x: 113, z: 40 }, vel: { x: 0, z: 0 }, data: {
      chargeId: 'charge_standard', ownerId: 99, hostId: 1,
      localOffset: { x: 13, z: 0 }, localRot: 0, armed: true, spawnedAt: 0 } };
  const state = { simTime: 1, tick: 60, playerId: 99, input: { actions: {} },
    entityList: [host, charge], entities: new Map([[1, host], [2, charge]]) };
  const events = [];
  const system = Object.create(impulseCharges);
  system.state = state;
  system.bus = { emit: (name, payload) => events.push({ name, payload }) };
  system.helpers = { queryRadius() { return []; } };
  system._stickScratch = [];
  return { system, state, host, charge, events };
}

test('a planted plate survives host destruction, drifts with inherited motion, and still answers R', () => {
  const { system, state, host, charge, events } = fixture();
  system._tickCharges(1 / 60, state);
  host.alive = false;
  system._tickCharges(1 / 60, state);
  assert.equal(charge.alive, true, 'destroying the carrier does not erase the paid plate');
  assert.equal(charge.data.hostId, null);
  assert.equal(charge.data.armed, true);
  assert.deepEqual(charge.vel, { x: 30, z: -6 });
  assert.ok(charge.pos.x > 113 && charge.pos.z < 40);
  state.input.actions.chargeDetonate = true;
  system._handleDetonate({ id: 99 }, state);
  assert.equal(charge.alive, false);
  const blast = events.find(row => row.name === 'charge:detonated');
  assert.ok(blast, 'released plate uses the normal blast path');
  assert.deepEqual(blast.payload.pos, charge.pos);
  assert.equal(blast.payload.hostId, null);
});

test('a released plate can catch a new body instead of retaining its destroyed host', () => {
  const { system, state, host, charge } = fixture();
  system._tickCharges(1 / 60, state);
  state.entities.delete(host.id);
  host.alive = false;
  const nextHost = { id: 3, type: 'asteroid', alive: true, radius: 12, rot: 0.7,
    pos: { x: 130, z: 40 }, vel: { x: -4, z: 2 } };
  state.entities.set(3, nextHost);
  state.entityList.push(nextHost);
  system._tickCharges(1 / 60, state);
  assert.equal(charge.alive, true);
  assert.equal(charge.data.hostId, nextHost.id);
  assert.deepEqual(charge.vel, nextHost.vel);
  assert.ok(Number.isFinite(charge.data.localRot));
});
