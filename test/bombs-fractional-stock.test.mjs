// NXI-034 — Reject fractional stock as ammunition
// Keep normalization and purchase/sell/fit input on finite nonnegative whole rounds;
// rejected input must not alter cooldowns or create partial rounds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { bombs } from '../src/systems/bombs.js';
import { economy } from '../src/systems/economy.js';
import { BOMB_DEFS } from '../src/data/bombs.js';

const OUTFIT_BERTH = 'station_helios';

function setupBombsScenario({ credits = 5000 } = {}) {
  const state = createGameState(42), bus = createBus(), helpers = {};
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, mass: 32, radius: 6,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 1000, hullMax: 1000,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const sys = Object.create(bombs);
  sys.init(ctx);
  state.ui.docked = true;
  state.ui.dockedStationId = OUTFIT_BERTH;
  return {
    state,
    bus,
    player,
    sys,
    econ,
    close() {
      sys.destroy();
      if (typeof econ.destroy === 'function') econ.destroy();
      bus.clear();
    },
  };
}

test('NXI-034: buyPayload rejects NaN, negative, zero, and fractional units without debiting or altering cooldowns', () => {
  const t = setupBombsScenario({ credits: 5000 });
  try {
    const rt = t.state.bombs;
    rt.cooldownUntil = 105.5;
    rt.cooldowns.bomb_thermite = 110.0;
    const initialCredits = t.state.player.credits;

    const invalidInputs = [NaN, -1, -5, 0, 0.5, 1.5, -0.5, Infinity, -Infinity, 'abc', null];
    for (const units of invalidInputs) {
      const res = t.sys.buyPayload({ payloadId: 'bomb_thermite', units });
      assert.equal(res, false, `buyPayload should reject units=${units}`);
      assert.equal(t.state.player.credits, initialCredits, `credits must remain untouched for units=${units}`);
      assert.equal(rt.stock.bomb_thermite || 0, 0, `stock must remain untouched for units=${units}`);
      assert.equal(rt.cooldownUntil, 105.5, `cooldownUntil must not be altered for units=${units}`);
      assert.equal(rt.cooldowns.bomb_thermite, 110.0, `payload cooldown must not be altered for units=${units}`);
    }

    // Legitimate whole-integer purchase succeeds
    const ok = t.sys.buyPayload({ payloadId: 'bomb_thermite', units: 2 });
    assert.equal(ok, true);
    assert.equal(t.state.player.credits, initialCredits - BOMB_DEFS.bomb_thermite.price * 2);
    assert.equal(rt.stock.bomb_thermite, 2);
    assert.equal(rt.cooldownUntil, 105.5);
    assert.equal(rt.cooldowns.bomb_thermite, 110.0);
  } finally {
    t.close();
  }
});

test('NXI-034: sellPayload rejects NaN, negative, zero, and fractional units without granting credits or altering cooldowns', () => {
  const t = setupBombsScenario({ credits: 0 });
  try {
    const rt = t.state.bombs;
    rt.stock.bomb_emp = 5;
    rt.cooldownUntil = 102.0;
    rt.cooldowns.bomb_emp = 108.0;

    const invalidInputs = [NaN, -1, -10, 0, 0.5, 1.5, 2.7, Infinity, -Infinity, 'xyz'];
    for (const units of invalidInputs) {
      const res = t.sys.sellPayload({ payloadId: 'bomb_emp', units });
      assert.equal(res, false, `sellPayload should reject units=${units}`);
      assert.equal(t.state.player.credits, 0, `no refund granted for units=${units}`);
      assert.equal(rt.stock.bomb_emp, 5, `stock remains 5 for units=${units}`);
      assert.equal(rt.cooldownUntil, 102.0, `cooldownUntil must not be altered for units=${units}`);
      assert.equal(rt.cooldowns.bomb_emp, 108.0, `payload cooldown must not be altered for units=${units}`);
    }

    // Legitimate whole-integer sale succeeds
    const ok = t.sys.sellPayload({ payloadId: 'bomb_emp', units: 2 });
    assert.equal(ok, true);
    assert.equal(rt.stock.bomb_emp, 3);
    assert.ok(t.state.player.credits > 0);
    assert.equal(rt.cooldownUntil, 102.0);
    assert.equal(rt.cooldowns.bomb_emp, 108.0);
  } finally {
    t.close();
  }
});

test('NXI-034: fitPayload and unfitPayload reject fractional socket indices without altering cooldowns', () => {
  const t = setupBombsScenario();
  try {
    const rt = t.state.bombs;
    rt.stock.bomb_emp = 3;
    rt.cooldownUntil = 55.0;

    assert.equal(t.sys.fitPayload({ socketIndex: 0.5, payloadId: 'bomb_emp' }), false);
    assert.equal(t.sys.fitPayload({ socketIndex: 1.5, payloadId: 'bomb_emp' }), false);
    assert.equal(t.sys.fitPayload({ socketIndex: NaN, payloadId: 'bomb_emp' }), false);
    assert.equal(t.sys.fitPayload({ socketIndex: -1, payloadId: 'bomb_emp' }), false);

    assert.equal(t.sys.unfitPayload({ socketIndex: 0.5 }), false);
    assert.equal(t.sys.unfitPayload({ socketIndex: 1.5 }), false);
    assert.equal(t.sys.unfitPayload({ socketIndex: NaN }), false);

    assert.equal(rt.cooldownUntil, 55.0);
  } finally {
    t.close();
  }
});
