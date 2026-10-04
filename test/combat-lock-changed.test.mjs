import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { weapons } from '../src/systems/weapons.js';

function boot() {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 1,
    player: { targetId: null, tether: { targetId: null } },
    meta: { seed: 17 },
    entities,
    entityList,
    combat: { beams: [], entities: {} },
    input: { fire: false, actions: {} },
  };
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, radius: 8,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
    data: { weapons: [], combat: { targetId: null, lockTarget: null, lockProgress: 0 } },
    flags: {},
  };
  const hunter = {
    id: 2, type: 'ship', team: 1, alive: true, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      weapons: [{ defId: 'wpn_test_lock', tracking: 'homing', lockTimeS: 0.01, _cooldown: 0, _heat: 0 }],
      combat: { targetId: 1, lockTarget: null, lockProgress: 0 },
    },
    flags: {},
  };
  entities.set(1, player);
  entities.set(2, hunter);
  entityList.push(player, hunter);
  const system = Object.create(weapons);
  system.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity: (id) => entities.get(id) || null,
    },
  });
  return { bus, state, system, hunter };
}

test('incoming missile lock emits combat:lockChanged so jump lock and the HUD alert can fire', () => {
  const { bus, state, system, hunter } = boot();
  const events = [];
  bus.on('combat:lockChanged', (p) => events.push(p));

  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockProgress >= 1, true, 'lock completes across the 0.05s floor');
  assert.equal(hunter.data.combat.lockTarget, 1);
  assert.equal(events.length, 1, 'lock edge emits once');
  assert.deepEqual(events[0], { locked: true, targetId: 1, shooterId: 2 });

  system.update(1 / 60, state);
  assert.equal(events.length, 1, 'held lock does not re-emit');

  hunter.data.combat.targetId = null;
  hunter.rot = Math.PI;
  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null);
  assert.equal(events.at(-1)?.locked, false, 'lost lock clears the alert / jump interdiction');
});

test('an out-of-range missile rack cannot lock the player or prevent a jump', () => {
  const { bus, state, system, hunter } = boot();
  const events = [];
  bus.on('combat:lockChanged', (p) => events.push(p));
  hunter.data.weapons = [{ defId: 'wpn_missile_rack_m', lockTimeS: 0.05, _cooldown: 0, _heat: 0 }];
  const player = state.entities.get(state.playerId);
  player.pos.x = 1000;
  for (let i = 0; i < 12; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null, 'a 280 WU rack cannot lock a target at 1000 WU');
  assert.equal(hunter.data.combat.lockProgress, 0);
  assert.equal(events.some((p) => p.locked), false, 'the unreachable rack cannot publish jump interdiction');
  player.pos.x = 280;
  for (let i = 0; i < 4; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockProgress, 1, 'the authored range boundary is reachable');
  player.pos.x = 281;
  for (let i = 0; i < 4; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null, 'leaving range releases an acquired lock');
  assert.equal(events.at(-1)?.locked, false);
});

test('a short-range rack cannot lend its faster lock to a distant torpedo target', () => {
  const { state, system, hunter } = boot();
  hunter.data.weapons = [
    { defId: 'wpn_missile_rack_m', lockTimeS: 0.05, _cooldown: 0, _heat: 0 },
    { defId: 'wpn_torpedo_l', lockTimeS: 2.5, _cooldown: 0, _heat: 0 },
  ];
  state.entities.get(state.playerId).pos.x = 1000;
  for (let i = 0; i < 60; i++) system.update(1 / 60, state);
  assert.ok(Math.abs(hunter.data.combat.lockProgress - 0.4) < 1e-9,
    'only the torpedo can reach 1000 WU, so its 2.5s observation window governs the lock');
});

test('missile launch revalidates the target and each mount range before spending charge', () => {
  const { state, system, hunter } = boot();
  const target = state.entities.get(state.playerId);
  const shots = [];
  system._spawnProjectile = (_owner, _mount, _def, _dir, tgt) => shots.push(tgt.id);
  const def = system._byId.get('wpn_missile_rack_m');
  const mount = { defId: def.id, _cooldown: 0, _heat: 0 };
  hunter.data.combat.lockTarget = target.id;
  hunter.data.combat.lockProgress = 1;
  target.pos.x = 1000;
  const fire = (forcedTarget = null) => system._serviceProjectileWeapon(
    hunter, mount, def, false, 100, 1 / 60, state, 0, forcedTarget,
  );
  assert.equal(fire(), 100, 'a long-range rack lock does not let this 280 WU mount fire at 1000 WU');
  target.pos.x = 80;
  const other = { ...target, id: 3 };
  assert.equal(fire(other), 100, 'a lock on one contact cannot launch a round against another');
  assert.equal(shots.length, 0, 'refused launch spends neither a projectile nor a cooldown');
  assert.equal(fire(), 100 - def.energyCost, 'a valid in-range lock still fires');
  assert.deepEqual(shots, [target.id]);
});
