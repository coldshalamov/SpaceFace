// RC-50 — game over has a populated bench state, and the empty plate is its own shot.
//
// The bench fixtures are data (importable here); the seeding is proven by scoped slices of the
// bench tool: the populated receipt is built through the real defeat-receipt builder (never an
// authored cause string), and the empty plate is a genuine empty state, not the populated
// receipt with its fields blanked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { UI_BENCH_SHOTS, resolveShot } from '../scripts/lib/uiBenchCatalog.mjs';

const BENCH_SRC = readFileSync(new URL('../tools/ui-bench.js', import.meta.url), 'utf8');
const GAMEOVER_SRC = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');

test('the bench carries both game-over states: populated and honestly empty', () => {
  const populated = resolveShot('gameOver');
  const empty = resolveShot('gameOver-empty');
  assert.equal(populated.defeat, 'populated');
  assert.equal(empty.defeat, 'empty');
  assert.notEqual(populated.seed, empty.seed, 'the empty plate is its own varied seed, not a blanked copy');
  assert.ok(UI_BENCH_SHOTS.some((s) => s.id === 'game-over'), 'the legacy id still resolves');
});

// seedGameOverShot is defined AFTER unseedGameOverShot in the tool, so the slice runs to the
// next top-level function rather than to the unseed definition.
function seedFunctionSource() {
  const start = BENCH_SRC.indexOf('function seedGameOverShot');
  return BENCH_SRC.slice(start, BENCH_SRC.indexOf('\nfunction ', start + 10));
}

test('the populated state is a real defeat receipt, built by the same builder the game runs', () => {
  const seed = seedFunctionSource();
  assert.match(seed, /buildDefeatReceipt\(gameState, player, BENCH_KILLER_ID/, 'the receipt comes from the live builder');
  assert.match(seed, /gameState\.combat\.lastPlayerDefeat = receipt;/);
  // The receipt's own inputs carry no cause — the builder derives it. (The telemetry deathLog
  // stub below is the black-box ring's fake session, a different surface.)
  const receiptCall = seed.slice(seed.indexOf('buildDefeatReceipt(gameState'), seed.indexOf('gameState.combat.lastPlayerDefeat = receipt;'));
  assert.doesNotMatch(receiptCall, /cause/, 'no cause is authored into the receipt call');
  assert.match(seed, /impactDirection reads AFT|never a direction string authored/, 'the impact direction runs the real math');
});

test('the empty plate empties the state instead of blanking the populated one', () => {
  const seed = seedFunctionSource();
  assert.match(seed, /if \(shot\.defeat === 'empty'\) \{\s*gameState\.combat\.lastPlayerDefeat = null;/);
  const catalog = readFileSync(new URL('../scripts/lib/uiBenchCatalog.mjs', import.meta.url), 'utf8');
  assert.match(catalog, /the honest empty plate/, 'the catalog comment keeps the two-state contract named');
});

test("the screen's 'Cause unrecorded' line stays the honest fallback", () => {
  assert.match(GAMEOVER_SRC, /const text = cause && !\/\^unknown loss\$\/i\.test\(cause\) \? cause : 'Cause unrecorded';/,
    'a real cause names itself; only a missing one falls back');
});
