import test from 'node:test';
import assert from 'node:assert/strict';
import { countermeasures } from '../src/systems/countermeasures.js';
import { SpatialHash } from '../src/core/spatialHash.js';

function fixture() {
  const ship = { id: 1, type: 'ship', alive: true, collides: true, team: 0, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { fittings: ['mod_decoy_buoy_s'], combat: {} } };
  const state = { mode: 'flight', tick: 1, simTime: 1, playerId: 1, rng: () => 0,
    entities: new Map([[1, ship]]), entityList: [ship], input: {},
    spatialHash: new SpatialHash(), entityIndex: { ships: [ship], projectiles: [] } };
  const host = Object.create(countermeasures);
  host.init({ state, bus: { on() {}, emit() {} }, helpers: {} });
  assert.equal(host._tryDeploy(ship), true, 'bait can be placed before a missile launches');
  function missile(id, x, z) {
    const round = { id, type: 'projectile', alive: true, collides: true, radius: 1, pos: { x, z },
      data: { kind: 'missile', targetId: ship.id, ownerId: 90, turnRate: 2 } };
    state.entities.set(id, round);
    state.entityList.push(round);
    state.entityIndex.projectiles.push(round);
    return round;
  }
  return { host, state, ship, missile };
}

test('placed buoy baits arriving seekers after its deploying ship leaves the field', () => {
  const { host, state, ship, missile } = fixture();
  const effect = ship.data.cm.effect;
  ship.pos.x = 2500;
  const nearBuoy = missile(2, effect.originX + 40, effect.originZ);
  const nearShip = missile(3, ship.pos.x + 40, ship.pos.z);
  state.spatialHash.rebuild(state.entityList);
  host.update(1 / 60, state);
  assert.equal(nearBuoy.data.diverted, true);
  assert.deepEqual(nearBuoy.data.divertPos, { x: effect.originX, z: effect.originZ });
  assert.equal(nearShip.data.diverted, undefined, 'bait radius must stay at the buoy');
  ship.data.cm.effectT = 1 / 120;
  const late = missile(4, effect.originX + 20, effect.originZ);
  state.spatialHash.rebuild(state.entityList);
  host.update(1 / 60, state);
  assert.equal(late.data.diverted, undefined, 'expired bait does not divert new arrivals');
});
