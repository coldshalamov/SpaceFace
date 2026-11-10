// Homing cargo vacuum: scrap pickups must chase the player (velocity match + approach),
// not golf-putt at an absolute speed cap that combat ships outrun.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mining,
  MAGNET_RANGE,
  MAGNET_APPROACH_MIN,
  MAGNET_APPROACH_MAX,
} from '../src/systems/mining.js';
import { CREDIT_CHIP_KIND } from '../src/data/killRewards.js';

const DT = 1 / 60;

function harness({ playerVelX = 180, pickupX = 120, pickupData = null } = {}) {
  const player = {
    id: 1,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: playerVelX, z: 0 },
    radius: 8,
    flags: {},
  };
  const pickup = {
    id: 2,
    alive: true,
    type: 'pickup',
    pos: { x: pickupX, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 2.2,
    mass: 0.1,
    collides: true,
    data: pickupData || { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 1 },
  };
  const entities = new Map([[player.id, player], [pickup.id, pickup]]);
  const state = {
    playerId: player.id,
    entities,
    entityList: [player, pickup],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      pickups: [pickup],
    },
    player: {
      magnetRange: 0,
      miningBeam: { tierId: 'beam_mk1' },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40 },
      credits: 0,
    },
    mode: 'flight',
    input: { fireGroup: 0 },
    simTime: 0,
    rng: () => 0.5,
  };
  const collected = [];
  const grants = [];
  const cargoWrites = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => {};
    },
    emit(type, payload) {
      if (type === 'pickup:collected') collected.push(payload);
      if (type === 'economy:grantCredits') grants.push(payload);
      if (type === 'cargo:changed') cargoWrites.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  mining.init({
    state,
    bus,
    helpers: {},
    registry: { get: () => null },
  });
  return { state, player, pickup, collected, grants, cargoWrites };
}

test('magnet constants expose a combat-viable relative approach band', () => {
  assert.ok(MAGNET_RANGE >= 400);
  assert.ok(MAGNET_APPROACH_MIN >= 80);
  assert.ok(MAGNET_APPROACH_MAX > MAGNET_APPROACH_MIN);
  assert.ok(MAGNET_APPROACH_MAX >= 200, 'approach must be able to close from a flyby');
});

test('magnetized scrap inherits player velocity and accelerates toward the ship', () => {
  const { state, player, pickup } = harness({ playerVelX: 180, pickupX: 100 });
  assert.ok(pickup.pos.x < MAGNET_RANGE, 'setup: pickup starts inside magnet range');

  // Enough ticks for MAGNET_ACCEL to fully settle onto the desired seek velocity.
  for (let i = 0; i < 90; i++) mining.update(DT, state);

  // Desired ≈ player.vel + towardShip * approach. Ship is to the -X of the pickup, so
  // relative approach is negative while world velocity stays near combat speed (not clamped
  // to the old absolute 210 wu/s ceiling that combat ships outran).
  const relative = pickup.vel.x - player.vel.x;
  assert.ok(relative < -MAGNET_APPROACH_MIN * 0.5,
    `pickup must close on the ship relative to player vel (got relative ${relative.toFixed(1)})`);
  assert.ok(relative > -MAGNET_APPROACH_MAX * 1.5,
    'relative approach stays inside the authored band');
  // Closing rate of the gap (player - pickup): d/dt(px - ux) = pvx - uvx = -relative > 0
  // when the pickup is ahead (+x) and we are reeling it in.
  assert.ok(-relative > 40, 'gap must close at a playable rate during a combat-speed flyby');
});

test('pickup left behind a fast ship still seeks with inherited velocity (no absolute speed trap)', () => {
  // Classic miss: ship flies past scrap; scrap is now behind and must sprint after.
  const { state, player, pickup } = harness({ playerVelX: 200, pickupX: -80 });
  for (let i = 0; i < 90; i++) mining.update(DT, state);
  // Toward player is +X; desired world speed = 200 + approach (> 200). Old absolute cap of 210
  // would leave only ~10 wu/s of catch-up and feel like golf.
  assert.ok(pickup.vel.x > player.vel.x + MAGNET_APPROACH_MIN * 0.5,
    `behind scrap must outrun the ship (vel ${pickup.vel.x.toFixed(1)} vs player ${player.vel.x})`);
});

test('scrap within scoop radius is collected without needing a perfect nose-on hit', () => {
  const { state, player, pickup, collected } = harness({ playerVelX: 0, pickupX: 18 });
  // player.radius 8 + pad 14 = 22 collect radius; pickup at 18 is inside.
  mining.update(DT, state);
  assert.equal(pickup.alive, false, 'near scrap should scoop');
  assert.equal(collected.length, 1);
  assert.equal(collected[0].commodityId, 'cmdty_scrap_metal');
  assert.equal(collected[0].collectorId, player.id);
});

test('credit chips scoop without a cargo write and grant through economy once', () => {
  const { state, pickup, collected, grants, cargoWrites } = harness({
    playerVelX: 0,
    pickupX: 18,
    pickupData: {
      kind: CREDIT_CHIP_KIND,
      amount: 75,
      credits: 75,
      grantReason: 'kill:credit_chip:wr:test:0',
    },
  });
  state.player.cargo.capVolume = 0;
  mining.update(DT, state);
  assert.equal(pickup.alive, false, 'near credit chip should scoop');
  assert.equal(collected.length, 1);
  assert.equal(collected[0].kind, CREDIT_CHIP_KIND);
  assert.equal(collected[0].commodityId, undefined);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 75);
  assert.equal(grants[0].reason, 'kill:credit_chip:wr:test:0');
  assert.equal(cargoWrites.length, 0);
  assert.deepEqual(state.player.cargo.items, {});
  assert.equal(state.player.credits, 0, 'mining must not write player credits');

  mining.update(DT, state);
  assert.equal(grants.length, 1, 'a dead chip cannot grant a second time');
});

test('kill wreck spawn is labeled salvage wreckage (not an anonymous molten ball)', () => {
  const { state } = harness();
  const spawned = [];
  mining.helpers = {
    spawnEntity(spec) {
      spawned.push(spec);
      return spec;
    },
  };
  mining._onShipDestroyed({
    type: 'ship',
    victimClass: 'ship',
    pos: { x: 10, z: -4 },
  });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].type, 'wreck');
  assert.equal(spawned[0].data.scanLabel, 'Salvage Wreck');
  assert.equal(spawned[0].data.label, 'Salvage Wreck');
  assert.ok(spawned[0].data.salvagePool && spawned[0].data.salvagePool.cmdty_scrap_metal > 0);
});
