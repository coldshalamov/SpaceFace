import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { salvageActions } from '../src/systems/salvageActions.js';

function busStub() {
  const listeners = new Map();
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    off(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

test('R1 unique variants wrap their base families without changing the bases', () => {
  const repairBase = MODULES.find((entry) => entry.id === 'mod_repair_nanobots_m');
  const knitbots = MODULES.find((entry) => entry.id === 'unique_knitbots');
  assert.equal(repairBase.mods.hullRepairOOC, 4);
  assert.ok(knitbots, 'Knitbots must be present in the canonical module catalog');
  assert.deepEqual({
    baseId: knitbots.baseId,
    repair: knitbots.mods.hullRepairOOC,
    repairDockedDrones: knitbots.mods.repairDockedDrones,
    price: knitbots.price,
    unique: knitbots.unique,
    salvageOnly: knitbots.salvageOnly,
    requiresTech: knitbots.requiresTech,
  }, {
    baseId: 'mod_repair_nanobots_m',
    repair: 4.4,
    repairDockedDrones: true,
    price: 0,
    unique: true,
    salvageOnly: true,
    requiresTech: undefined,
  });

  const beamBase = WEAPONS.find((entry) => entry.id === 'wpn_beam_laser_m');
  const veilCutter = WEAPONS.find((entry) => entry.id === 'unique_veil_cutter');
  // Row A5 deliberately re-ranged small/medium weapons to the composed engagement envelope
  // (S ~240, M ~260); the beam's shipped reach is that authored value, not the old 520 WU
  // projectile-lifetime range.
  assert.deepEqual({ range: beamBase.range, heatPerSec: beamBase.heatPerSec }, { range: 240, heatPerSec: 55 });
  assert.ok(veilCutter, 'Veil-Cutter must be present in the canonical weapon catalog');
  assert.deepEqual({
    baseId: veilCutter.baseId,
    range: veilCutter.range,
    spreadDeg: veilCutter.spreadDeg,
    heatPerSec: veilCutter.heatPerSec,
    price: veilCutter.price,
    unique: veilCutter.unique,
    salvageOnly: veilCutter.salvageOnly,
    requiresTech: veilCutter.requiresTech,
  }, {
    baseId: 'wpn_beam_laser_m',
    range: 276,
    spreadDeg: 0.3,
    heatPerSec: 66,
    price: 0,
    unique: true,
    salvageOnly: true,
    requiresTech: undefined,
  });
  // The unique's reach is the authored rangePct bonus on the live base, not a fixed number.
  assert.equal(veilCutter.range, Math.round(beamBase.range * (1 + veilCutter.variantBonuses.rangePct)),
    'Veil-Cutter range must remain the authored rangePct bonus applied to the beam base');
});

test('authored salvage configuration survives reannotation and applies military legality', () => {
  const state = { simTime: 120, entities: new Map(), player: {} };
  salvageActions.init({ state, bus: busStub(), registry: { get: () => null } });
  try {
    assert.equal(typeof salvageActions.configureAuthoredWreck, 'function');
    const wreck = {
      id: 11,
      type: 'wreck',
      data: { parentType: 'military', wreckClass: 'military' },
    };
    salvageActions.configureAuthoredWreck(wreck, {
      salvagePool: { cmdty_salvage_electronics: 2 },
      scanLabel: 'ISC Vigilant',
    });
    assert.deepEqual(wreck.data.salvagePool, { cmdty_classified_salvage: 2 });
    assert.equal(wreck.data.scanLabel, 'ISC Vigilant');

    salvageActions._annotate(wreck);
    assert.deepEqual(wreck.data.salvagePool, { cmdty_classified_salvage: 2 });
    assert.equal(wreck.data.scanLabel, 'ISC Vigilant');
  } finally {
    salvageActions.destroy();
  }
});

test('an authored reactor timer replaces the generic deadline using current simTime', () => {
  const state = { simTime: 120, entities: new Map(), player: {} };
  salvageActions.init({ state, bus: busStub(), registry: { get: () => null } });
  try {
    const wreck = {
      id: 12,
      type: 'wreck',
      data: { parentType: 'reactor', unstableReactor: true },
    };
    salvageActions._annotate(wreck);
    assert.equal(wreck.data.unstableReactor.dueAt, 128, 'generic annotation starts the stock timer');

    state.simTime = 122;
    salvageActions.configureAuthoredWreck(wreck, {
      salvagePool: { cmdty_medical: 50 },
      scanLabel: 'Relief-Freighter Choir-Tender',
      reactorTimerS: 60,
    });
    assert.equal(wreck.data.unstableReactor.dueAt, 182);
    assert.deepEqual(wreck.data.salvagePool, { cmdty_medical: 50 });
    assert.equal(wreck.data.scanLabel, 'Relief-Freighter Choir-Tender');

    state.simTime = 140;
    salvageActions._annotate(wreck);
    assert.equal(wreck.data.unstableReactor.dueAt, 182, 'reannotation preserves the authored deadline');
    assert.deepEqual(wreck.data.salvagePool, { cmdty_medical: 50 });
    assert.equal(wreck.data.scanLabel, 'Relief-Freighter Choir-Tender');
  } finally {
    salvageActions.destroy();
  }
});
