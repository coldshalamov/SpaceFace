import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEEP_FIELD_STRUCTURE_RECIPES,
  resolveDeepFieldStructureRecipe,
  sampleAuthoredWidth,
} from '../src/render/deepFieldStructureRecipes.js';

test('deep-field recipes are immutable authored compositions with bounded localized geometry', () => {
  const ids = Object.keys(DEEP_FIELD_STRUCTURE_RECIPES);
  assert.ok(ids.length >= 6);
  assert.equal(Object.isFrozen(DEEP_FIELD_STRUCTURE_RECIPES), true);

  for (const id of ids) {
    const recipe = DEEP_FIELD_STRUCTURE_RECIPES[id];
    assert.equal(recipe.id, id);
    assert.equal(Object.isFrozen(recipe), true);
    assert.ok(recipe.anchorNdc.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.75));
    assert.ok(recipe.parallax > 0 && recipe.parallax < 0.08);
    for (const ribbon of recipe.ribbons) {
      assert.ok(ribbon.points.length >= 8, `${id}/${ribbon.id}: silhouette needs authored control points`);
      assert.equal(ribbon.points.length, ribbon.widths.length,
        `${id}/${ribbon.id}: every control point owns its physical width`);
      assert.ok(ribbon.points.every((point) => point.length === 3 && point.every(Number.isFinite)));
      assert.ok(ribbon.widths.every((width) => width >= 0.003 && width <= 0.5));
      const xs = ribbon.points.map((point) => point[0]);
      const zs = ribbon.points.map((point) => point[2]);
      assert.ok(Math.max(...xs) - Math.min(...xs) <= 2.8,
        `${id}/${ribbon.id}: macro stays localized instead of becoming a fullscreen sheet`);
      assert.ok(Math.max(...zs) - Math.min(...zs) <= 1.2,
        `${id}/${ribbon.id}: macro vertical coverage stays bounded`);
    }
  }
});

test('belt, fringe, and anomaly resolve structurally different source art, not tint variants', () => {
  const belt = resolveDeepFieldStructureRecipe({ recipeId: 'belt_broken_dust_lane' });
  const fringe = resolveDeepFieldStructureRecipe({ recipeId: 'fringe_tidal_filament' });
  const anomaly = resolveDeepFieldStructureRecipe({ recipeId: 'anomaly_electromagnetic_scar' });

  assert.notDeepEqual(belt.ribbons.map((ribbon) => ribbon.points), fringe.ribbons.map((ribbon) => ribbon.points));
  assert.notDeepEqual(fringe.ribbons.map((ribbon) => ribbon.points), anomaly.ribbons.map((ribbon) => ribbon.points));
  assert.notDeepEqual(belt.starAssociations, anomaly.starAssociations);
  assert.deepEqual(belt.ribbons.map((ribbon) => ribbon.style), [0, 2, 1],
    'belt composition layers a stellar envelope, occluding lane, and mineral rim');
  assert.equal(fringe.ribbons[0].style, 0, 'fringe foreground is a sheared tidal shell');
  assert.deepEqual(anomaly.ribbons.map((ribbon) => ribbon.style), [0, 1, 1],
    'anomaly foreground is a broad sheared envelope with two bifurcated scars');
});

test('authored width sampling is stable and preserves deliberate pinches', () => {
  const widths = [0.02, 0.12, 0.035, 0.09, 0.01];
  assert.equal(sampleAuthoredWidth(widths, 0), 0.02);
  assert.ok(Math.abs(sampleAuthoredWidth(widths, 1) - 0.01) < 1e-12);
  assert.equal(sampleAuthoredWidth(widths, 0.25), 0.12);
  assert.equal(sampleAuthoredWidth(widths, 0.5), 0.035);
  assert.equal(sampleAuthoredWidth(widths, 0.625), 0.0625);
  assert.equal(sampleAuthoredWidth(widths, Number.NaN), 0.02);
});
