import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ActionVfx } from '../src/render/actionVfx.js';
import { WORLD_CUE_ACTION_RECIPE, isComposedMiningCue } from '../src/render/vfx/worldCueRecipes.js';
import { AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';

function fixture(reduced = false) {
  const player = { id: 1, alive: true, type: 'ship', radius: 6, pos: { x: 0, z: 0 }, rot: 0 };
  const rock = { id: 2, alive: true, type: 'asteroid', radius: 12, pos: { x: 30, z: 0 }, rot: 0 };
  return { simTime: 1, playerId: 1, entities: new Map([[1, player], [2, rock]]),
    settings: { video: { motionReduce: reduced, flashReduce: reduced } } };
}

test('survey, cutter and collected yield use the production geometry owner at their real anchors', () => {
  const state = fixture(), owner = new ActionVfx(new THREE.Scene());
  try {
    for (const id of ['mining.survey.pulse', 'mining.extraction.locked', 'mining.yield.collected']) {
      assert.equal(isComposedMiningCue(id), true, 'the legacy sprite path must yield ownership');
      assert.equal(owner.emit('presentation:cue', { id, sourceId: 1, targetId: 2 }, state), true);
    }
    const slots = owner.slots.filter(s => s.alive);
    assert.deepEqual(slots.map(s => s.recipe.verb), ['survey', 'grind', 'harvest']);
    assert.deepEqual(slots.map(s => s.id), [1, 2, 2]);
    state.simTime = 1.15;
    owner.update(state);
    assert.ok(owner.batch.count > 0, 'shared geometry contains visible work');
    state.simTime = 3;
    owner.update(state);
    assert.equal(owner.live, 0, 'phase responses retire rather than become held loops');
  } finally { owner.dispose(); }
});

test('reduced motion preserves the surface response and stale/missing anchors invent nothing', () => {
  const state = fixture(true), owner = new ActionVfx(new THREE.Scene());
  try {
    assert.equal(owner.emit('presentation:cue', { id: 'mining.extraction.locked', sourceId: 1, targetId: 99 }, state), false);
    assert.equal(owner.emit('presentation:cue', { id: 'mining.extraction.locked', sourceId: 1, targetId: 2 }, state), true);
    state.simTime += 0.1;
    owner.update(state);
    assert.ok(owner.batch.count > 0);
    assert.equal(owner.particles.live, 0);
    assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.extraction.locked'].surfaceWork, true);
    state.simTime = 0;
    owner.update(state);
    assert.equal(owner.live, 0, 'load/rewind clears the old phase');
  } finally { owner.dispose(); }
});

test('survey, lock, fracture and yield keep distinct sound recipes', () => {
  const ids = ['presentation.mining.scan_classified', 'presentation.mining.cutter_lock',
    'presentation.mining.fracture_break', 'presentation.mining.yield'].map(id => AUDIO_CUE_TO_RECIPE[id]);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
});
