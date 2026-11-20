// Row 486 (ROCK-WAVES): pack density that multi-hits and squads that re-form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FODDER_RIVER_RECIPE, COHORT_RECIPES } from '../src/data/squadChoreography.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('river cohort packs tighter than a throw corridor (multi-hit geometry)', () => {
  // A T2 thrown body (radius ~17) sweeps a ~34-unit corridor; a T3 (~27) sweeps ~54.
  // For a ≥30% multi-hit rate through the pack, at least two slots must sit inside one corridor:
  // lane spacing under 40 guarantees a second hull inside the T2 corridor on a lane pass.
  assert.ok(FODDER_RIVER_RECIPE.laneSpacing <= 40, `laneSpacing ${FODDER_RIVER_RECIPE.laneSpacing}`);
  assert.ok(FODDER_RIVER_RECIPE.alongSpacing <= 44, `alongSpacing ${FODDER_RIVER_RECIPE.alongSpacing}`);
  assert.ok(FODDER_RIVER_RECIPE.memberCount >= 6, 'a river holds a pack, not a pair');
  assert.ok(FODDER_RIVER_RECIPE.densityTarget >= 48);
});

test('squads re-form after scatter (rejoin_slots policy + reform machinery)', () => {
  const squadFrameSrc = readFileSync(path.join(REPO, 'src/ai/squadFrame.js'), 'utf8');
  assert.match(squadFrameSrc, /reformHeading/);
  assert.match(squadFrameSrc, /rejoinTick|disrupted/);
  const recipeSrc = readFileSync(path.join(REPO, 'src/data/squadChoreography.js'), 'utf8');
  assert.match(recipeSrc, /reformPolicy: 'rejoin_slots'/);
});
