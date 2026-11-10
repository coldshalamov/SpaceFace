// Catalog armorFlat must stay strictly below starter Pulse damage.
// A comment in enemies.js is not a check; this file is the check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEvidenceSpindleSpec } from '../src/data/scenarios/47aLiveScene.js';
import {
  PQ_174_05_SEED,
  simulateBossKill,
} from '../src/data/survivalArenas.js';
import { WEAPONS } from '../src/data/weapons.js';

const HEADER_RULE =
  'armorFlat must stay well below starter shot damage — flat DR ≥ dmg zeroes residual damage '
  + 'after the shield layer and made bruisers literally unkillable with the Hitch gun.';

function starterPulse() {
  const pulse = WEAPONS.find((row) => row.id === 'wpn_pulse_laser_s');
  assert.ok(pulse, 'starter Pulse Laser S must exist in weapons.js');
  assert.ok(Number.isFinite(pulse.dmg) && pulse.dmg > 0, 'starter Pulse must publish dmg');
  return pulse;
}

test(HEADER_RULE, () => {
  const pulse = starterPulse();
  const enemiesSrc = readFileSync(fileURLToPath(new URL('../src/data/enemies.js', import.meta.url)), 'utf8');
  assert.ok(enemiesSrc.includes(HEADER_RULE.replace(/\s+/g, ' ')) || enemiesSrc.includes('armorFlat must stay well below starter shot damage'), HEADER_RULE);

  for (const row of ENEMY_TYPES) {
    const armorFlat = Number(row.armorFlat) || 0;
    assert.ok(
      armorFlat < pulse.dmg,
      `${HEADER_RULE} (${row.id} armorFlat ${armorFlat} is not < Pulse dmg ${pulse.dmg})`,
    );
  }

  const spindle = makeEvidenceSpindleSpec();
  const spindleFlat = Number(spindle.armorFlat) || 0;
  assert.ok(
    spindleFlat < pulse.dmg,
    `${HEADER_RULE} (47a evidence spindle armorFlat ${spindleFlat} is not < Pulse dmg ${pulse.dmg})`,
  );
});

test(`seed ${PQ_174_05_SEED}: starter Pulse kills every champion slower than thrown mass`, () => {
  for (const wave of [10, 20, 30]) {
    const physics = simulateBossKill({ wave, weaponId: 'wpn_pulse_laser_s', seed: PQ_174_05_SEED });
    console.log(
      `[enemy-armor-flat seed ${PQ_174_05_SEED}] wave ${wave} ${physics.enemyId} `
      + `armorFlat=${physics.catalogArmorFlat} `
      + `physics=${physics.physics.seconds.toFixed(2)}s dead=${physics.physics.dead} `
      + `pulse=${physics.gun.seconds.toFixed(2)}s dead=${physics.gun.dead}`,
    );
    assert.equal(physics.invuln, false);
    assert.ok(physics.physics.dead, `${physics.enemyId} must die to thrown mass`);
    assert.ok(
      physics.gun.dead,
      `${HEADER_RULE} (wave ${wave} ${physics.enemyId} Pulse never finished)`,
    );
    assert.ok(
      physics.gun.seconds > physics.physics.seconds,
      `${physics.enemyId} Pulse ${physics.gun.seconds}s must be slower than physics ${physics.physics.seconds}s`,
    );
  }
});
