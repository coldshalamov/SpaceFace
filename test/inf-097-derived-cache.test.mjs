import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';

// INF-097: derived stats are memoized on the exact composition. Repeated shipworks
// refreshes/hovers with unchanged fittings must not re-fold every module; any input that
// alters numbers misses the key and recomputes. Callers get a top-level clone because
// combat rebinds `derived.propulsion` on entity-owned blocks.
const KESTREL = 'ship_kestrel';
const BOOSTER = 'mod_shield_booster_s';

function player(over = {}) {
  return {
    efficiencyMods: {},
    cargo: { usedVolume: 0, capVolume: 40, usedMass: 0 },
    isPlayer: true, id: 'player', stats: {}, combatProfile: 'adventure',
    ...over,
  };
}

test('INF-097 identical compositions share numbers but never the object', () => {
  const p = player();
  const a = getDerivedStats(KESTREL, [], p);
  const b = getDerivedStats(KESTREL, [], p);
  assert.deepEqual(b, a);
  assert.notEqual(b, a, 'clone contract: no shared top-level block');
});

test('INF-097 combat-style key rebinds do not poison later calls', () => {
  const p = player();
  const a = getDerivedStats(KESTREL, [], p);
  a.propulsion = { ...a.propulsion, combatSpeed: 99999 };
  a.maxSpeed = -1;
  const b = getDerivedStats(KESTREL, [], p);
  assert.notEqual(b.propulsion.combatSpeed, 99999);
  assert.ok(b.maxSpeed > 0);
});

test('INF-097 every number-altering input invalidates structurally', () => {
  const base = getDerivedStats(KESTREL, [], player());
  const fitted = getDerivedStats(KESTREL, [BOOSTER], player());
  assert.notEqual(fitted.shieldMax, base.shieldMax, 'fitted module changes numbers');
  const heavy = getDerivedStats(KESTREL, [], player({ cargo: { usedVolume: 10, capVolume: 40, usedMass: 500 } }));
  assert.notEqual(heavy.cargoMass, base.cargoMass, 'cargo mass changes numbers');
  assert.notEqual(heavy.maxSpeed, base.maxSpeed, 'mass changes handling numbers');
  const boosted = getDerivedStats(KESTREL, [], player({ efficiencyMods: { shieldRegenMult: 2 } }));
  assert.notEqual(boosted.shieldRegenRate, base.shieldRegenRate, 'efficiency mult changes numbers');
  const crucible = getDerivedStats(KESTREL, [], player({ combatProfile: 'crucible' }));
  assert.notEqual(crucible.shieldMax, base.shieldMax, 'crucible profile drops the assist');
  const other = getDerivedStats('ship_pelican', [], player());
  assert.notEqual(other.hullMax, base.hullMax, 'hull changes numbers');
  // null fittings behave like empty (resolveFittings normalizes both) and stay stable.
  assert.deepEqual(getDerivedStats(KESTREL, null, player()), base);
});

test('INF-097 ghost-hover spam stays bounded', () => {
  for (let i = 0; i < 70; i++) {
    getDerivedStats(KESTREL, [`mod_probe_${i}`], player());
  }
  // The hot composition still resolves correctly after eviction churn.
  const hot = getDerivedStats(KESTREL, [], player());
  assert.ok(hot.maxSpeed > 0);
  assert.deepEqual(getDerivedStats(KESTREL, [], player()), hot);
});

test('INF-097 repeated identical derives stay fast', () => {
  const p = player();
  getDerivedStats(KESTREL, [BOOSTER], p);
  const start = Date.now();
  for (let i = 0; i < 2000; i++) getDerivedStats(KESTREL, [BOOSTER], p);
  assert.ok(Date.now() - start < 1500, '2000 cached derives complete with wide headroom');
});
