import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthoredCourseVictory } from '../src/data/survivalCourse.js';
import { SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
import { evaluateUnlocks } from '../src/systems/survivalUnlocks.js';
import { settleCrucibleRun, resetCrucibleMetaForTests, useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';

const victory = { outcome: 'victory', ruleset: 'scored', mode: 'arc', wave: 30,
  deepestWave: 30, startWave: 1, wavesCleared: 30, lastRoundCleared: 30,
  seed: 4242, arenaId: 'helios_core', credits: 0, score: 200, kills: 50 };
const courseUnlocks = new Set(SURVIVAL_UNLOCK_CATALOG.filter(row =>
  ['authored_victory', 'victory_and_physics_pick'].includes(row.earn?.kind)).map(row => row.id));

test('course completion needs an authored ruleset and all thirty committed clears', () => {
  for (const ruleset of ['scored', 'trial_one_hull', 'trial_one_weapon']) {
    assert.equal(isAuthoredCourseVictory({ ...victory, ruleset }), true);
  }
  for (const patch of [
    { ruleset: 'swarm' }, { ruleset: 'foundry_block' }, { ruleset: 'boss_circuit' },
    { ruleset: 'endless' }, { ruleset: 'powered_conveyor_demo' }, { ruleset: null },
    { outcome: 'defeat' }, { wavesCleared: 29 }, { wavesCleared: undefined },
    { lastRoundCleared: 29 }, { lastRoundCleared: NaN }, { startWave: 11 },
    { practice: true }, { recordRules: { mode: 'practice' } },
    { mode: 'swarm' }, { circuit: {} }, { recordRules: { circuit: {} } },
  ]) {
    const result = { ...victory, ...patch };
    assert.equal(isAuthoredCourseVictory(result), false, JSON.stringify(patch));
    assert.deepEqual(evaluateUnlocks({}, result).newly.filter(id => courseUnlocks.has(id)), [], JSON.stringify(patch));
  }
  assert.equal(isAuthoredCourseVictory(victory, { ruleset: 'swarm' }), false);
  assert.equal(isAuthoredCourseVictory(victory, { ruleset: 'scored', practice: true }), false);
  assert.equal(isAuthoredCourseVictory(victory, { ruleset: 'scored', telemetry: { startWave: 11 } }), false);
  assert.equal(isAuthoredCourseVictory(victory, { kind: 'lab', ruleset: 'scored' }), false);
});

test('real settlement awards the course head only for the complete authored contract', t => {
  const rows = new Map();
  useCrucibleMetaStorage({ getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) });
  t.after(() => { resetCrucibleMetaForTests(); useCrucibleMetaStorage(null); });
  for (const ruleset of ['swarm', 'endless', 'foundry_block', 'boss_circuit', 'scored']) {
    rows.clear(); resetCrucibleMetaForTests();
    const result = { ...victory, ruleset, mode: ruleset === 'scored' ? 'arc' : ruleset };
    const settled = settleCrucibleRun({ result,
      run: { kind: 'survival', ruleset, seed: 4242, arenaId: 'helios_core', telemetry: {}, modifiers: [] } });
    assert.ok(settled);
    assert.equal(settled.unlocksEarned.some(id => courseUnlocks.has(id)), ruleset === 'scored', ruleset);
    assert.equal(settled.result.lineMetaEarned?.includes('line_head_multi_latch') || false, ruleset === 'scored', ruleset);
  }
  rows.clear(); resetCrucibleMetaForTests();
  const contradictory = settleCrucibleRun({ result: { ...victory, ruleset: 'swarm', recordRules: { mode: 'scored' } },
    run: { kind: 'survival', ruleset: 'scored', telemetry: {}, modifiers: [] } });
  assert.equal(contradictory.unlocksEarned.some(id => courseUnlocks.has(id)), false);
  assert.equal(contradictory.result.lineMetaEarned?.includes('line_head_multi_latch') || false, false);
});
