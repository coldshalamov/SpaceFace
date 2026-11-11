// THE COURSE'S SIX CHAMPIONS RIDE THE FIRST PASS — and only the first.
//
// C01-01: the Swarm course is thirty rounds with champions on 5, 10, 15, 20, 25 and 30,
// and swarmWaveOf clamps every deeper index onto the wave-30 row — the wrap machinery
// (cycle numerals on the versus card, warden honor guards folded into the row) is
// unreachable inside a run. The deep rematch cases are retired; see
// test/RETIRED_SWARM_ENDLESS.md. What stays pinned here: every course champion is the
// authored first-pass row, the numeral ladder the versus card would have rendered,
// and plan determinism on the rows a run can field.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_BOSS_ROTATION,
  SWARM_RULESET,
  swarmBossFor,
  swarmCycleNumeral,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

test('every course champion is the authored first-pass row — no cycle, no numeral', () => {
  for (const wave of [5, 10, 15, 20, 25, 30]) {
    const boss = swarmBossFor(wave);
    assert.equal(SWARM_BOSS_ROTATION.includes(boss), true,
      `wave ${wave} returns an authored rotation row, not a wrapped copy`);
    assert.equal(boss.cycle, undefined, `wave ${wave} carries no cycle`);
    assert.ok(!/\s(II|III|IV|V|VI|VII|VIII|IX|X)$/.test(boss.label),
      `wave ${wave} wears no numeral`);
    assert.equal(planFor(wave).swarm.bossCycle, 0, `wave ${wave} plan rides pass zero`);
  }
  assert.equal(swarmBossFor(7), null, 'an ordinary wave fields no champion');
  // C01-03: past the win the deep course resumes on the old clock — a champion every tenth
  // round (45 is no champion row), and the wrap's first pass lands Iron Maw II at wave 150.
  assert.equal(swarmBossFor(45), null, 'a deep non-decade round fields no champion');
  const wrap = swarmBossFor(150);
  assert.equal(wrap.id, 'iron_maw', 'the second pass opens where the rotation began');
  assert.equal(wrap.cycle, 1, 'wave 150 wears the first wrap');
  assert.equal(wrap.label, "Dreadnought 'Iron Maw' II");
});

test('the numeral ladder reads the pass — II on the second, VIII at the ceiling', () => {
  assert.equal(swarmCycleNumeral(1), 'II');
  assert.equal(swarmCycleNumeral(2), 'III');
  assert.equal(swarmCycleNumeral(3), 'IV');
  assert.equal(swarmCycleNumeral(4), 'V');
  assert.equal(swarmCycleNumeral(7), 'VIII');
  assert.equal(swarmCycleNumeral(0), 'I');
});

test('course plans stay deterministic — same seed, same champion row', () => {
  for (const wave of [5, 10, 15, 20, 25, 30, 145]) {
    const a = planFor(wave);
    const b = planFor(wave);
    assert.deepEqual(a.packages, b.packages, `wave ${wave} packages drifted`);
    assert.equal(a.swarm.bossLabel, b.swarm.bossLabel);
  }
});
