// L-EAR (row 71): the weak-point crit was a silent combat verb — combat.js emits
// combat:weakPointHit for the HUD callout and VFX answers it, but no ear owned it.
// The verb-cue table now voices it with one authored tick (sfx_lock_acquired) and
// the table dispatcher plays it; per-target admission keeps a spray on one exposed
// arc to earned ticks, never a machine-gun. Seed 4242 pins one play per event.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  PLAYER_ACTION_CUES,
  admitWeakPointVoice,
  combatVerbCueRow,
  combatVerbRecipe,
  installCombatVerbCueDispatch,
  playAuthoredVerbCue,
  verbCueCoverage,
  verbCueDispatchIds,
  WEAK_POINT_ADMIT_TICKS,
} from '../src/audio/combatVerbCues.js';

const SEED = 4242;
const RECIPE_IDS = new Set(RECIPES.map((r) => r && r.id).filter(Boolean));

function makeHost() {
  const played = [];
  return {
    played,
    state: { tick: 100 },
    rt: {},
    play(recipe, opts) {
      played.push({ recipe, opts });
      return { recipe };
    },
  };
}

function makeBus() {
  const subs = new Map();
  return {
    subs,
    on(id, fn) {
      if (!subs.has(id)) subs.set(id, []);
      subs.get(id).push(fn);
    },
    emit(id, payload) {
      for (const fn of subs.get(id) || []) fn(payload);
    },
  };
}

test('L-EAR seed 4242: combat:weakPointHit names one authored recipe', () => {
  assert.equal(SEED, 4242);
  const recipe = combatVerbRecipe('combat:weakPointHit');
  assert.ok(recipe, 'weak-point hit has a voice');
  assert.ok(RECIPE_IDS.has(recipe), `${recipe} is authored`);
  assert.notEqual(recipe, 'sfx_mining_impact', 'not another thud under combat:damage');
  assert.notEqual(recipe, 'sfx_hull_scrape', 'not the generic chip');
  const row = combatVerbCueRow('combat:weakPointHit');
  assert.equal(row.recipe, recipe);
});

test('L-EAR seed 4242: the weak-point voice has exactly one dispatcher', () => {
  const coverage = verbCueCoverage().find((r) => r.id === 'combat:weakPointHit');
  assert.ok(coverage, 'coverage row exists');
  assert.equal(coverage.dispatcher, 'table', 'table dispatch owns it, no second writer');
  assert.ok(verbCueDispatchIds().includes('combat:weakPointHit'));
  // No raw audioSystem subscription may exist for it: table dispatch is the single ear.
  assert.equal(PLAYER_ACTION_CUES['combat:weakPointHit'], 'sfx_lock_acquired');
});

test('L-EAR seed 4242: one play per event, spray admits on the gap', () => {
  const host = makeHost();
  const bus = makeBus();
  installCombatVerbCueDispatch(host, bus);
  const payload = { targetId: 7, ownerId: 1, tick: 200, pos: { x: 10, z: -4 } };
  bus.emit('combat:weakPointHit', payload);
  assert.equal(host.played.length, 1, 'first crit speaks');
  assert.equal(host.played[0].recipe, 'sfx_lock_acquired');
  bus.emit('combat:weakPointHit', { ...payload, tick: 200 });
  assert.equal(host.played.length, 1, 'same-tick spray stays silent');
  bus.emit('combat:weakPointHit', { ...payload, tick: 200 + WEAK_POINT_ADMIT_TICKS });
  assert.equal(host.played.length, 2, 'next burst earns its tick');
  bus.emit('combat:weakPointHit', { ...payload, targetId: 9, tick: 200 });
  assert.equal(host.played.length, 3, 'a different hull is a different tick');
});

test('L-EAR seed 4242: admission never invents a voice without a target', () => {
  assert.equal(admitWeakPointVoice(Object.create(null), null, 5), false);
  assert.equal(admitWeakPointVoice(Object.create(null), 3, NaN), false);
  const host = makeHost();
  const out = playAuthoredVerbCue(host, 'combat:weakPointHit', { tick: 10 });
  assert.equal(out, null, 'no target means no play');
  assert.equal(host.played.length, 0);
});
