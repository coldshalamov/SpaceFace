// INFERENCE-12 — the rated cluster moment finally reaches the player's eyes and ears.
//
// PQ-147.03 rated the well + primed-light moment and published `fields:clusterDetonate` into a
// void: zero subscribers, so the authored set piece played as raw blasts only. The orchestrator
// now consumes the receipt and rides the existing lane machinery — banner, caption, camera,
// authored audio, VFX — the same premium receipt a whip impact earns. Player-authored wells get
// the player-scoped lanes; NPC clusters keep world sparks and positional audio only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { WELL_CLUSTER } from '../src/data/fields.js';
import { rateClusterMoment } from '../src/core/fields/clusterDetonate.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters, PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

const CUE_IDS = ['fields.cluster_detonate', 'fields.cluster_detonate.cascade'];
const SECONDARY_KINDS = WELL_CLUSTER.secondaryKinds;

function rows(count) {
  return Array.from({ length: count }, (_, i) => ({ kind: SECONDARY_KINDS[i % SECONDARY_KINDS.length], id: i }));
}

test('rateClusterMoment keeps the rated threshold and adds the cascade tier', () => {
  const two = rateClusterMoment(rows(2));
  assert.equal(two.rated, false, 'two secondaries never rate the moment');
  const three = rateClusterMoment(rows(3));
  assert.equal(three.rated, true, 'three secondaries rate the moment (PQ-147.03 threshold)');
  assert.equal(three.tier, 'detonation');
  const six = rateClusterMoment(rows(6));
  assert.equal(six.tier, 'cascade', 'six secondaries reads as a cascade');
  const allKinds = rateClusterMoment(SECONDARY_KINDS.map((kind, i) => ({ kind, id: i })));
  assert.equal(allKinds.tier, 'cascade', 'all four consequence kinds reads as a cascade');
});

test('both cue ids carry recipes on real lanes and resolve to the authored boom', () => {
  for (const cueId of CUE_IDS) {
    const recipe = PRESENTATION_RECIPES[cueId];
    assert.ok(recipe, `${cueId} needs a presentation recipe`);
    for (const lane of ['camera', 'vfx', 'audio', 'ui', 'accessibility']) {
      assert.ok(recipe.lanes[lane] && recipe.lanes[lane] !== `${lane}.none`,
        `${cueId} must drive the ${lane} lane, not a placeholder`);
    }
    const semantic = PRESENTATION_AUDIO_CUE_BY_ID[cueId];
    assert.ok(semantic, `${cueId} needs an authored audio mapping`);
    const recipeId = resolveAudioCueRecipeId(semantic);
    assert.ok(recipeId && AUDIO_RECIPE_BY_ID[recipeId],
      `${cueId} audio must resolve to a real recipe, got ${recipeId}`);
  }
});

function createHarness() {
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  });
  player.id = 1;
  const raider = makeEntity({
    type: 'ship', team: 1, pos: { x: 4000, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  });
  raider.id = 3;
  const state = {
    tick: 100,
    simTime: 100 / 60,
    mode: 'flight',
    playerId: player.id,
    player: { heat: 0 },
    settings: { video: {}, accessibility: {} },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [raider.id, raider]]),
    entityList: [player, raider],
  };
  const bus = createBus();
  return { state, bus };
}

function wire(h) {
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const seen = { alerts: [], captions: [], audio: [], camera: [], vfx: [], suppressed: [] };
  h.bus.on('alert', (p) => seen.alerts.push(p));
  h.bus.on('presentation:caption', (p) => seen.captions.push(p));
  h.bus.on('audio:cue', (p) => seen.audio.push(p));
  h.bus.on('camera:shake', (p) => seen.camera.push(p));
  h.bus.on('presentation:vfxCue', (p) => seen.vfx.push(p));
  h.bus.on('presentation:cueSuppressed', (p) => seen.suppressed.push(p));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  return { presenter, adapters, seen };
}

function clusterEmit(h, over = {}) {
  h.bus.emit('fields:clusterDetonate', {
    schemaVersion: 1,
    fieldId: 'field_well_test',
    primedId: 3,
    ownerId: h.state.playerId,
    sourceId: h.state.playerId,
    pos: { x: 40, z: 0 },
    tier: 'detonation',
    secondaries: rows(4),
    count: 4,
    kinds: SECONDARY_KINDS.slice(),
    rated: true,
    tick: h.state.tick,
    ...over,
  });
  h.bus.flush();
}

test('a player-authored rated moment lands one banner, caption, camera, and authored voice', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    clusterEmit(h);
    const alertTexts = seen.alerts.map((a) => a.text);
    assert.deepEqual(alertTexts, ['CLUSTER DETONATION'], 'exactly one banner names the moment');
    assert.equal(seen.alerts[0].shape, 'diamond', 'the field receipt family reads as a diamond');
    assert.equal(seen.captions.length, 1);
    assert.match(seen.captions[0].text, /4 secondary consequences/);
    assert.equal(seen.camera.length, 1, 'the camera takes the small detonation kick');
    assert.equal(seen.vfx.length, 1);
    const audioIds = seen.audio.map((a) => a.id);
    assert.ok(audioIds.includes('presentation.fields.cluster_detonate'),
      'the authored boom speaks through the presentation lane');

    h.state.tick += 5;
    clusterEmit(h);
    assert.equal(seen.alerts.length, 1, 'same field inside the dedupe window stays quiet');
    assert.equal(seen.suppressed.length, 1);
    assert.equal(seen.suppressed[0].reason, 'dedupe_window');

    h.state.tick += 60;
    clusterEmit(h, { fieldId: 'field_well_big', tier: 'cascade', count: 6 });
    assert.equal(seen.alerts.at(-1).text, 'MASS CASCADE', 'the cascade tier gets its own banner');
    assert.equal(seen.alerts.at(-1).sev, 'warn');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

test('an NPC-authored cluster keeps world lanes but never raises the player banner', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    clusterEmit(h, { ownerId: 3, sourceId: 3, pos: { x: 4000, z: 0 } });
    assert.equal(seen.alerts.length, 0, 'no banner for somebody else\'s cluster');
    assert.equal(seen.captions.length, 0, 'no caption for somebody else\'s cluster');
    assert.equal(seen.camera.length, 0, 'the player\'s camera stays still');
    assert.equal(seen.vfx.length, 1, 'world sparks still fire at the NPC');
    assert.equal(seen.audio.length, 1, 'positional audio still plays');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});
