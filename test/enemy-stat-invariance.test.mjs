// Plan 11 — encounter level changes encounter composition, never the same hull's combat stats.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

function combatFingerprint(spec) {
  return {
    hull: spec.hull,
    armor: spec.armorHp,
    armorFlat: spec.armorFlat,
    shield: spec.shield,
    shieldRegenRate: spec.shieldRegenRate,
    weapons: (spec.data?.weapons || []).map((weapon) => ({
      defId: weapon.defId,
      dmg: weapon.dmg,
      rof: weapon.rof,
      range: weapon.range,
      projSpeed: weapon.projSpeed,
    })),
  };
}

test('every shipped enemy keeps one authored combat fingerprint at every encounter level', () => {
  assert.ok(ENEMY_TYPES.length > 0);
  for (const def of ENEMY_TYPES) {
    const low = makeEnemySpawnSpec(def.id, 1, { x: 0, z: 0 });
    const high = makeEnemySpawnSpec(def.id, 15, { x: 0, z: 0 });
    assert.deepEqual(
      combatFingerprint(high),
      combatFingerprint(low),
      `${def.id} must become harder only through composition, geometry, or timing`,
    );
    assert.equal(low.data.fixedCombatStats, true, `${def.id} publishes the fixed-stat contract`);
    assert.equal(high.data.fixedCombatStats, true, `${def.id} keeps the contract at high level`);
    assert.equal(low.mass, def.mass, `${def.id} keeps its authored physics mass`);
    assert.equal(high.mass, def.mass, `${def.id} encounter level cannot alter physics class`);
  }
});

test('the catalog occupies only the four authored mass-ladder bands', () => {
  const occupied = new Set();
  for (const def of ENEMY_TYPES) {
    assert.ok(Number.isFinite(def.mass) && def.mass > 0, `${def.id} has an honest positive mass`);
    const band = def.mass <= 20 ? 'light'
      : def.mass <= 60 ? 'medium'
        : def.mass <= 150 ? 'heavy'
          : 'capital';
    occupied.add(band);
  }
  assert.deepEqual([...occupied].sort(), ['capital', 'heavy', 'light', 'medium']);
});
