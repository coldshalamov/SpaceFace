import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { countermeasures, equippedInterceptWeapons } from '../src/systems/countermeasures.js';
import { pdScreenPosition } from '../src/ai/pdScreen.js';
import { mulberry32 } from '../src/core/rng.js';

test('FB-018: flak turret intercepts inbound missile salvo (>= 1 intercept) while unfitted hull records 0', () => {
  const rng = mulberry32(4242);
  const bus = createBus();
  const intercepted = [];
  bus.on('pds:intercept', (p) => intercepted.push(p));

  const state = {
    tick: 1,
    simTime: 1.0,
    playerId: 1,
    rng,
    mode: 'flight',
    entityList: [],
    entityIndex: null,
  };

  const flakShip = {
    id: 10,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    rot: 0,
    cap: 100,
    data: {
      weapons: [
        { defId: 'wpn_flak_turret_s', _cooldown: 0, _heat: 0 },
      ],
    },
  };

  const missiles = [
    {
      id: 101,
      type: 'projectile',
      alive: true,
      team: 2,
      ownerId: 2,
      pos: { x: 50, z: 0 },
      vel: { x: -100, z: 0 },
      data: { kind: 'missile' },
    },
    {
      id: 102,
      type: 'projectile',
      alive: true,
      team: 2,
      ownerId: 2,
      pos: { x: 70, z: 10 },
      vel: { x: -100, z: 0 },
      data: { kind: 'missile' },
    },
  ];

  state.entityList = [flakShip, ...missiles];

  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers: {} });

  cm.update(0.1, state);

  assert.ok(intercepted.length >= 1, 'flak-fitted hull records >= 1 pds:intercept');
  assert.equal(intercepted[0].shipId, 10);
  assert.equal(intercepted[0].flak, true);
  assert.equal(intercepted[0].weaponId, 'wpn_flak_turret_s');

  const w = flakShip.data.weapons[0];
  assert.ok(w._cooldown > 0, 'weapon cooldown set');
  assert.ok(w._heat > 0, 'heat charged');

  // Now test unfitted hull
  intercepted.length = 0;
  const unfittedShip = {
    id: 20,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: { weapons: [] },
  };
  const freshMissile = {
    id: 201,
    type: 'projectile',
    alive: true,
    team: 2,
    ownerId: 2,
    pos: { x: 50, z: 0 },
    vel: { x: -100, z: 0 },
    data: { kind: 'missile' },
  };
  state.entityList = [unfittedShip, freshMissile];

  cm.update(0.1, state);
  assert.equal(intercepted.length, 0, 'unfitted hull records 0 intercepts');
  assert.equal(freshMissile.alive, true, 'missile remains alive');
});

test('FB-018: NPC flak does not intercept player projectiles', () => {
  const rng = mulberry32(4242);
  const bus = createBus();
  const intercepted = [];
  bus.on('pds:intercept', (p) => intercepted.push(p));

  const state = {
    tick: 1,
    simTime: 1.0,
    playerId: 1,
    rng,
    mode: 'flight',
    entityList: [],
    entityIndex: null,
  };

  const npcShip = {
    id: 10,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: {
      weapons: [{ defId: 'wpn_flak_turret_s', _cooldown: 0, _heat: 0 }],
    },
  };

  const playerMissile = {
    id: 999,
    type: 'projectile',
    alive: true,
    team: 1,
    ownerId: 1, // player!
    pos: { x: 30, z: 0 },
    data: { kind: 'missile' },
  };

  state.entityList = [npcShip, playerMissile];

  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers: {} });

  cm.update(0.1, state);
  assert.equal(intercepted.length, 0, 'NPC flak must not intercept player projectile');
  assert.equal(playerMissile.alive, true);
});

test('FB-018: pdScreenPosition resolves escort screen position ahead of charge toward threat', () => {
  const charge = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const threat = { pos: { x: 500, z: 0 } };
  const pos = pdScreenPosition(charge, threat, 200);
  assert.ok(pos, 'screen position calculated');
  assert.ok(pos.x > 100 && pos.x <= 200, `pos.x should be toward threat: ${pos.x}`);
  assert.equal(Math.round(pos.z), 0);
});
