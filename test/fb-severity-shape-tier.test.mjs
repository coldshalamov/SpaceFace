// FB-072 — cue severity escalates by silhouette and layout, with particle counts held flat.
//
// In cueRecipes.js the escalating families declare a `shape` tier from SEVERITY_SHAPE_TIERS
// (cone → sheet → ring) and hold budgets.particles / budgets.cameraTrauma at their tier-1
// values. In causalVfxGrammar.js the kill rungs stop buying bigger primitive counts: a capital
// breakup resolves to the same counts as a tier-1 direct burst under a distinct silhouette and
// layout. The directed impact kick (camera.js impactKick) owns what used to be extra trauma.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  PRESENTATION_RECIPES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import {
  SEVERITY_SHAPE_TIERS,
  resolveCausalVfxPresentation,
  shapeTierViolations,
} from '../src/presentation/causalVfxGrammar.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

const PLAYER_ID = 1;

// Recipe families that escalate by declared shape tier. Within one family, higher tiers may
// never out-spend tier-1 and may never differ only by budget.
const SHAPE_LADDER_FAMILIES = Object.freeze({
  'tether story': ['tether.attach', 'tether.near_break', 'tether.break',
    'tether.break.overload', 'tether.break.severed', 'tether.break.endpoint'],
  'tether release': ['tether.release.good', 'tether.release.clean', 'tether.release.razor'],
  'massline threat': ['massline.threat', 'massline.threat.sweep_commit',
    'massline.counter_tether.cut', 'massline.counter_tether.overload'],
  'cluster detonation': ['fields.cluster_detonate', 'fields.cluster_detonate.cascade'],
  'player combat': ['combat.damage.applied', 'combat.player.hit', 'combat.player.kill'],
});

function boot() {
  const state = createGameState(13304);
  state.playerId = PLAYER_ID;
  state.tick = 12;
  state.simTime = 0.2;
  state.settings = { video: {}, accessibility: {} };
  state.entities = new Map([
    [PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, y: 0, z: 0 } }],
    [2, { id: 2, pos: { x: 40, y: 0, z: 0 } }],
  ]);
  const bus = createBus();
  const records = { cues: [], vfx: [] };
  bus.on('presentation:cue', (p) => records.cues.push(p));
  bus.on('presentation:vfxCue', (p) => records.vfx.push(p));
  presentationOrchestrator.init({ state, bus });
  presentationAdapters.init({ state, bus });
  return {
    state, bus, records,
    teardown() { presentationOrchestrator.dispose(); presentationAdapters.dispose(); },
  };
}

test('every escalating recipe family is a shape ladder, never a count ladder', () => {
  for (const [family, ids] of Object.entries(SHAPE_LADDER_FAMILIES)) {
    const rows = ids.map((id) => {
      const recipe = getPresentationRecipe(id);
      assert.ok(recipe, `${id} must exist`);
      assert.ok(recipe.shape, `${id} must declare a shape tier`);
      return recipe;
    });
    assert.deepEqual(shapeTierViolations(rows), [], `${family} must escalate by shape`);

    // Budgets are held at or under the family's lowest declared tier (its tier-1 budget).
    const baseRow = rows.slice().sort((a, b) => a.shape.tier - b.shape.tier)[0];
    const particleCap = baseRow.budgets.particles || 0;
    const traumaCap = baseRow.budgets.cameraTrauma || 0;
    for (const row of rows) {
      assert.ok((row.budgets.particles || 0) <= particleCap || particleCap === 0,
        `${row.id} particles must not exceed the tier-1 budget`);
      assert.ok((row.budgets.cameraTrauma || 0) <= traumaCap || traumaCap === 0,
        `${row.id} trauma must not exceed the tier-1 budget`);
    }
  }
});

test('the tether ladder holds the tier-1 budget across attach, near-break, and break', () => {
  const attach = getPresentationRecipe('tether.attach');
  const nearBreak = getPresentationRecipe('tether.near_break');
  const breaks = ['tether.break', 'tether.break.overload', 'tether.break.severed']
    .map(getPresentationRecipe);

  assert.equal(attach.budgets.particles, 48, 'tier-1 budget is the anchor');
  for (const recipe of breaks) {
    assert.equal(recipe.budgets.particles, attach.budgets.particles,
      `${recipe.id} holds the tier-1 particle budget`);
    assert.equal(recipe.budgets.cameraTrauma, attach.budgets.cameraTrauma,
      `${recipe.id} holds the tier-1 trauma cap`);
    assert.equal(recipe.shape.tier, 3);
    assert.equal(recipe.shape.layout, SEVERITY_SHAPE_TIERS[3].layout);
  }
  // The three rungs are different shapes — silhouette AND layout — never only a count.
  assert.notEqual(attach.shape.silhouette, nearBreak.shape.silhouette);
  assert.notEqual(nearBreak.shape.layout, breaks[0].shape.layout);
  assert.notEqual(attach.shape.layout, breaks[0].shape.layout);
});

test('release quality tiers keep a flat budget and distinct shapes', () => {
  const [good, clean, razor] = ['tether.release.good', 'tether.release.clean', 'tether.release.razor']
    .map(getPresentationRecipe);
  assert.equal(good.budgets.particles, 12);
  assert.equal(clean.budgets.particles, 12);
  assert.equal(razor.budgets.particles, 12);
  assert.equal(good.budgets.cameraTrauma, 0.04);
  assert.equal(clean.budgets.cameraTrauma, 0.04);
  assert.equal(razor.budgets.cameraTrauma, 0.04);
  const silhouettes = new Set([good.shape.silhouette, clean.shape.silhouette, razor.shape.silhouette]);
  assert.equal(silhouettes.size, 3, 'three ratings read as three silhouettes');
});

test('tier-3 kills resolve the tier-1 primitive budget under a distinct layout', () => {
  const base = resolveCausalVfxPresentation('direct', {});
  const capital = resolveCausalVfxPresentation('direct', { capital: true, hero: true });
  assert.equal(capital.blades + capital.arcs + capital.shards,
    base.blades + base.arcs + base.shards,
    'a capital kill must not buy a bigger primitive budget');
  assert.notEqual(capital.layout, base.layout, 'the tier-3 kill carries a distinct layout id');
  assert.notEqual(capital.silhouette, base.silhouette);

  // Reduced motion preserves the shape distinction — the tiers never collapse to "fewer dots".
  const baseReduced = resolveCausalVfxPresentation('direct', { reduced: true });
  const capitalReduced = resolveCausalVfxPresentation('direct', { capital: true, hero: true, reduced: true });
  assert.notEqual(capitalReduced.silhouette, baseReduced.silhouette);
  assert.notEqual(capitalReduced.layout, baseReduced.layout);
  assert.equal(capitalReduced.blades + capitalReduced.arcs + capitalReduced.shards,
    baseReduced.blades + baseReduced.arcs + baseReduced.shards);
});

test('a recipe-family assertion catches a tier that only buys more particles', () => {
  const fake = [
    { id: 't1', shape: SEVERITY_SHAPE_TIERS[1] },
    { id: 't2-same-shape', shape: { ...SEVERITY_SHAPE_TIERS[1], tier: 2 } },
  ];
  assert.ok(shapeTierViolations(fake).length > 0,
    'a higher rung with the tier-1 shape is a count-only escalation and must fail');
});

test('the emitted break cue carries the tier-3 ring shape into the vfx record', () => {
  const h = boot();
  try {
    h.bus.emit('tether:broken', { targetId: 2, reason: 'overload', direction: { x: 1, z: 0 } });
    h.bus.flush();
    const cue = h.records.cues.find((c) => c.id === 'tether.break.overload');
    assert.ok(cue, 'the overload break cue must emit');
    assert.equal(cue.shape.layout, 'radial', 'tier-3 ring layout rides the cue');
    const vfxCue = h.records.vfx.find((v) => v.id === 'tether.break.overload');
    assert.ok(vfxCue, 'the vfx lane must fire');
    assert.equal(vfxCue.particles, 48, 'the emitted budget is the tier-1 budget');
    assert.equal(vfxCue.shape.layout, 'radial', 'the render record shows the layout id');
    assert.equal(vfxCue.shape.silhouette, 'burst-ring');
  } finally { h.teardown(); }
});

test('the whole registry still validates with declared shape tiers', () => {
  const report = validatePresentationRecipes();
  assert.equal(report.ok, true, report.issues.join('\n'));
  for (const [id, recipe] of Object.entries(PRESENTATION_RECIPES)) {
    if (!recipe.shape) continue;
    assert.ok(Number.isFinite(recipe.shape.tier));
    assert.ok(recipe.shape.silhouette && recipe.shape.layout && recipe.shape.signaturePrimitive);
  }
});
