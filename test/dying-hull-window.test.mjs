// Controlled Chaos packet 08 - the dying window is shaped by mass, bounded, and tick-quantized.
// Pure law checks (src/combat/lifecycle.js); the wired system is covered by dying-hull-system.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DYING_WINDOW_LAW,
  LIFECYCLE,
  dyingHullTier,
  dyingMassOf,
  dyingWindowS,
  lifecycleOf,
  readDying,
} from '../src/combat/lifecycle.js';

test('fodder ruptures promptly, heavier hulls fail longer, nothing exceeds the caps', () => {
  const fodder = dyingWindowS({ mass: 16 });
  const medium = dyingWindowS({ mass: 45 });
  const heavy = dyingWindowS({ mass: 120 });
  const capital = dyingWindowS({ mass: 600 });
  const colossal = dyingWindowS({ mass: 5000 });
  assert.ok(fodder <= DYING_WINDOW_LAW.fodderCapS, `fodder ${fodder}s`);
  assert.ok(fodder < medium && medium < heavy && heavy < capital, [fodder, medium, heavy, capital].join(' < '));
  assert.ok(capital <= DYING_WINDOW_LAW.maxS && colossal <= DYING_WINDOW_LAW.maxS, 'large hulls cap at ~3 s');
  assert.ok(dyingWindowS({ mass: 0.001 }) >= DYING_WINDOW_LAW.minS, 'never an instantaneous or zero window');
});

test('the window is monotone in mass and quantized to the 60 Hz sim', () => {
  let last = 0;
  for (let mass = 4; mass <= 800; mass *= 1.15) {
    const s = dyingWindowS({ mass });
    assert.ok(s >= last - 1e-9, `non-decreasing at mass ${mass}: ${s} vs ${last}`);
    assert.ok(Math.abs(s * 60 - Math.round(s * 60)) < 1e-6, `tick-quantized: ${s}`);
    last = s;
  }
});

test('a heavily overkilled hull comes apart sooner than one that barely failed', () => {
  const barely = dyingWindowS({ mass: 100, overkill: 0 });
  const blown = dyingWindowS({ mass: 100, overkill: 1 });
  assert.ok(blown < barely, `${blown} < ${barely}`);
  assert.ok(blown >= barely * DYING_WINDOW_LAW.overkillFloor - 1 / 60, 'but never collapses to nothing');
  assert.equal(dyingWindowS({ mass: 100, overkill: 99 }), blown, 'overkill is clamped');
  assert.equal(dyingWindowS({ mass: 100, overkill: -4 }), barely);
});

test('unknown mass is sized from radius, legacy 1e6 sentinel is "unknown" not a planet', () => {
  assert.equal(dyingMassOf(1e6, 14), 14 * DYING_WINDOW_LAW.massPerRadius);
  assert.equal(dyingMassOf(null, null), DYING_WINDOW_LAW.defaultMass);
  assert.equal(dyingMassOf(undefined, 0), DYING_WINDOW_LAW.defaultMass);
  assert.ok(dyingWindowS({ mass: 1e6, radius: 14 }) <= DYING_WINDOW_LAW.fodderCapS, 'a legacy wreck is not treated as 3 s of capital');
});

test('tiers use the same cut points as the explosion class', () => {
  assert.equal(dyingHullTier(16), 'light');
  assert.equal(dyingHullTier(30), 'medium');
  assert.equal(dyingHullTier(79), 'medium');
  assert.equal(dyingHullTier(80), 'heavy');
  assert.equal(dyingHullTier(199), 'heavy');
  assert.equal(dyingHullTier(200), 'capital');
});

test('readDying honors a record only for the body it was minted against (id reuse is safe)', () => {
  const wreck = { id: 77, type: 'wreck', alive: true, data: { killedAt: 10 } };
  const state = {
    simTime: 10.2,
    entities: new Map([[77, wreck]]),
    dyingHullRuntime: { byWreckId: { 77: { wreckId: 77, killedAt: 10, ruptureAt: 10.6, ruptured: false } } },
  };
  assert.equal(lifecycleOf(state, wreck), LIFECYCLE.DYING);
  assert.ok(readDying(state, wreck));
  // The same id later names a different body (different kill stamp): never dying.
  const stranger = { id: 77, type: 'wreck', alive: true, data: { killedAt: 55 } };
  state.entities.set(77, stranger);
  assert.equal(lifecycleOf(state, stranger), LIFECYCLE.WRECK);
  // After the rupture instant the window is over even if the record lingers a tick.
  state.entities.set(77, wreck);
  state.simTime = 10.6;
  assert.equal(lifecycleOf(state, wreck), LIFECYCLE.WRECK);
  // A ruptured record and a dead wreck both read as inert.
  state.simTime = 10.2;
  state.dyingHullRuntime.byWreckId[77].ruptured = true;
  assert.equal(lifecycleOf(state, wreck), LIFECYCLE.WRECK);
  state.dyingHullRuntime.byWreckId[77].ruptured = false;
  wreck.alive = false;
  assert.equal(readDying(state, wreck), null);
});
