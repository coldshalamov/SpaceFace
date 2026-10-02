import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createFloatingText, HIT_CONFIRM_PIP_SYMBOLS } from '../src/ui/floatingText.js';
import { mulberry32 } from '../src/core/rng.js';

test('FB-019: hitting a shielded target through to hull confirms shield -> armor -> hull pips in order', () => {
  const rng = mulberry32(4242);
  const bus = createBus();
  const state = {
    playerId: 1,
    simTime: 10.0,
    rng,
    settings: {
      showDamageNumbers: true,
      gameplay: { hitConfirmPips: true },
      video: { motionReduce: false, reducedFlash: false },
    },
    entities: new Map(),
  };

  const target = {
    id: 10,
    type: 'ship',
    alive: true,
    pos: { x: 100, z: 0 },
    shield: 100,
    shieldMax: 100,
    armorHp: 100,
    armorMax: 100,
    hull: 200,
    hullMax: 200,
  };
  state.entities.set(10, target);

  const ft = createFloatingText({ state, helpers: {}, bus });

  // 1. Hit shield
  state.simTime += 0.05; // +50ms
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 10,
    amount: 30,
    applied: 30,
    shieldAbsorbed: true,
    shieldDamage: 30,
    pos: { x: 100, z: 0 },
  });

  // 2. Hit armor (shield depleted)
  state.simTime += 0.05; // +50ms
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 10,
    amount: 30,
    applied: 30,
    dominantLayer: 'armor',
    armorDamage: 30,
    pos: { x: 100, z: 0 },
  });

  // 3. Hit hull (armor depleted)
  state.simTime += 0.05; // +50ms
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 10,
    amount: 30,
    applied: 30,
    dominantLayer: 'hull',
    hullDamage: 30,
    pos: { x: 100, z: 0 },
  });

  assert.equal(ft.pipLog.length, 3);
  assert.equal(ft.pipLog[0].layer, 'shield');
  assert.equal(ft.pipLog[0].symbol, HIT_CONFIRM_PIP_SYMBOLS.shield);
  assert.equal(ft.pipLog[1].layer, 'armor');
  assert.equal(ft.pipLog[1].symbol, HIT_CONFIRM_PIP_SYMBOLS.armor);
  assert.equal(ft.pipLog[2].layer, 'hull');
  assert.equal(ft.pipLog[2].symbol, HIT_CONFIRM_PIP_SYMBOLS.hull);
});

test('FB-019: rate limit drops second hit inside 40 ms per target', () => {
  const bus = createBus();
  const state = {
    playerId: 1,
    simTime: 1.000,
    settings: {
      showDamageNumbers: true,
      gameplay: { hitConfirmPips: true },
      video: { motionReduce: false },
    },
    entities: new Map(),
  };

  const ft = createFloatingText({ state, helpers: {}, bus });

  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 20,
    amount: 10,
    shieldAbsorbed: true,
    timeMs: 1000,
    pos: { x: 0, z: 0 },
  });
  // 20ms later (inside 40ms threshold)
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 20,
    amount: 10,
    shieldAbsorbed: true,
    timeMs: 1020,
    pos: { x: 0, z: 0 },
  });
  // 50ms later (exceeds 40ms threshold)
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 20,
    amount: 10,
    shieldAbsorbed: true,
    timeMs: 1050,
    pos: { x: 0, z: 0 },
  });

  assert.equal(ft.pipLog.length, 2);
  assert.equal(ft.pipLog[0].timeMs, 1000);
  assert.equal(ft.pipLog[1].timeMs, 1050);
});

test('FB-019: showDamageNumbers: false leaves pips enabled; hitConfirmPips: false disables pips', () => {
  const bus = createBus();
  const state = {
    playerId: 1,
    simTime: 1.0,
    settings: {
      showDamageNumbers: false,
      gameplay: { hitConfirmPips: true },
    },
    entities: new Map(),
  };

  const ft = createFloatingText({ state, helpers: {}, bus });

  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 30,
    amount: 10,
    dominantLayer: 'hull',
    timeMs: 2000,
    pos: { x: 0, z: 0 },
  });
  assert.equal(ft.pipLog.length, 1);

  // Turn hitConfirmPips off
  state.settings.gameplay.hitConfirmPips = false;
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 30,
    amount: 10,
    dominantLayer: 'hull',
    timeMs: 2100,
    pos: { x: 0, z: 0 },
  });
  assert.equal(ft.pipLog.length, 1, 'no new pip spawned when hitConfirmPips is false');
});

test('FB-019: NPC-on-NPC hits do not generate pips', () => {
  const bus = createBus();
  const state = {
    playerId: 1,
    simTime: 1.0,
    settings: { gameplay: { hitConfirmPips: true } },
    entities: new Map(),
  };

  const ft = createFloatingText({ state, helpers: {}, bus });

  bus.emit('combat:damage', {
    attackerId: 99,
    targetId: 100,
    amount: 50,
    dominantLayer: 'hull',
    pos: { x: 0, z: 0 },
  });
  assert.equal(ft.pipLog.length, 0);
});
