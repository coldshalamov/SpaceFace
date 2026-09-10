// PQ-174.05 — boss waves are physics puzzles.
//
// Done when: each wave 10/20/30 boss is killed by physics alone within 90 s.
// Guns are the slow way, never the only way. No invulnerability, no extra hull.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  PHYSICS_BOSS_BUDGET_S,
  PQ_174_05_SEED,
  catalogCombatant,
  physicsBossWaves,
  simulateBossKill,
} from '../src/data/survivalArenas.js';
import { swarmBossFor } from '../src/data/swarmMode.js';
import { SURVIVAL_WAVES, waveHealthOverrideIssues } from '../src/data/survivalWaves.js';
import {
  CINDER_BOSS_ROLE,
} from '../src/systems/cinderSluiceArena.js';
import { CRYO_BOSS_ROLE } from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_BOSS_ROLE } from '../src/systems/lagrangeCrucible.js';
import { STORM_BOSS_ROLE } from '../src/systems/stormLatticeArena.js';

const DREAD = ENEMY_TYPES.find((row) => row.id === 'dreadnought_boss');

test('boss roles reuse the catalog dreadnought hull: no extra HP, no immunity theatre', () => {
  assert.ok(DREAD);
  for (const role of [LAGRANGE_BOSS_ROLE, CINDER_BOSS_ROLE, CRYO_BOSS_ROLE, STORM_BOSS_ROLE]) {
    assert.equal(role.hullId, 'dreadnought_boss');
    assert.equal(role.invulnerable, false);
    assert.equal(role.hp, undefined);
    assert.equal(role.hull, undefined);
  }
  const combatant = catalogCombatant('dreadnought_boss');
  assert.equal(combatant.hull, DREAD.hull);
  assert.equal(combatant.armor, DREAD.armor);
  assert.equal(combatant.shield, DREAD.shield);
  assert.equal(combatant.flags.invuln, false);
  for (const recipe of SURVIVAL_WAVES.filter((row) => row.wave === 10)) {
    assert.equal(waveHealthOverrideIssues(recipe).length, 0, recipe.id);
    assert.equal(recipe.packages[0].enemyId, 'dreadnought_boss');
  }
});

test(`seed ${PQ_174_05_SEED}: wave 10/20/30 champions die to thrown mass within ${PHYSICS_BOSS_BUDGET_S}s; guns are slower`, () => {
  const rows = physicsBossWaves();
  assert.equal(rows.length, 3);
  for (const spec of rows) {
    const rotation = swarmBossFor(spec.wave);
    assert.equal(rotation.id, spec.rotationId);
    const physics = simulateBossKill({ wave: spec.wave, weaponId: 'wpn_pulse_laser_s', seed: PQ_174_05_SEED });
    const kinetic = simulateBossKill({ wave: spec.wave, weaponId: 'wpn_autocannon_m', seed: PQ_174_05_SEED });
    const rail = simulateBossKill({ wave: spec.wave, weaponId: 'wpn_railgun_m', seed: PQ_174_05_SEED });
    console.log(
      `[pq-174.05 seed ${PQ_174_05_SEED}] wave ${spec.wave} ${spec.rotationId} `
      + `n=${spec.count} hull=${physics.catalogHull} slam=${physics.physicsDamagePerSlam.toFixed(1)} `
      + `physics=${physics.physics.seconds.toFixed(2)}s dead=${physics.physics.dead} `
      + `pulse=${physics.gun.seconds.toFixed(2)}s dead=${physics.gun.dead} `
      + `cannon=${kinetic.gun.seconds.toFixed(2)}s dead=${kinetic.gun.dead} `
      + `rail=${rail.gun.seconds.toFixed(2)}s dead=${rail.gun.dead}`,
    );
    assert.equal(physics.invuln, false);
    assert.equal(physics.catalogHull, catalogCombatant(spec.enemyId).hull);
    assert.ok(physics.physics.dead, `${spec.rotationId} must die to thrown mass`);
    assert.ok(
      physics.physics.seconds <= PHYSICS_BOSS_BUDGET_S,
      `${spec.rotationId} physics ${physics.physics.seconds}s must be ≤ ${PHYSICS_BOSS_BUDGET_S}s`,
    );
    assert.ok(physics.physicsDamagePerSlam > 0);
    if (spec.enemyId === 'dreadnought_boss') {
      // RETARGETED 2026-09-10. This block previously asserted `physics.gun.dead === false` --
      // that Iron Maw's catalog armorFlat of 25 zeroed the starter Pulse (8) after shields. That
      // was the DEFECT written down as if it were the design: `src/data/enemies.js` opens by
      // requiring "armorFlat must stay well below starter shot damage", and names flat DR >= dmg as
      // the bug that "made bruisers literally unkillable with the Hitch gun". Iron Maw was the only
      // catalog hull violating it. Capital plate is now 3, and `enemy-armor-flat-contract.test.mjs`
      // enforces the header rule against the live weapon damage so it cannot come back.
      //
      // The packet's law is "physics must be the fast way, guns the slow way, immunity never", so
      // the bar is ORDERING, not a gun that cannot finish.
      assert.ok(physics.gun.dead, 'the starter Pulse must be able to kill Iron Maw -- slowly is the design, never is immunity theatre');
      assert.ok(
        physics.gun.seconds > physics.physics.seconds,
        `the starter Pulse (${physics.gun.seconds.toFixed(2)}s) must be slower than thrown mass (${physics.physics.seconds.toFixed(2)}s)`,
      );
      assert.ok(rail.gun.dead, 'a heavier gun must still be able to kill Iron Maw');
      assert.ok(rail.gun.seconds > physics.physics.seconds, 'rail must be slower than thrown mass');
    } else {
      const gun = kinetic.gun.dead ? kinetic : physics;
      assert.ok(gun.gun.dead, `${spec.rotationId} must still die to a gun`);
      assert.ok(
        gun.gun.seconds > physics.physics.seconds,
        `${spec.rotationId} gun ${gun.gun.seconds}s must be slower than physics ${physics.physics.seconds}s`,
      );
    }
  }
});
