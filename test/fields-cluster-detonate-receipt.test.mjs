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
import { fields } from '../src/systems/fields.js';
import { presentationAdapters, PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

const CUE_IDS = ['fields.cluster_detonate', 'fields.cluster_detonate.cascade'];
const SECONDARY_KINDS = WELL_CLUSTER.secondaryKinds;

function rows(count, kinds = SECONDARY_KINDS) {
  return Array.from({ length: count }, (_, i) => ({ kind: kinds[i % kinds.length], id: i }));
}

test('rateClusterMoment keeps the rated threshold and adds the cascade tier', () => {
  const two = rateClusterMoment(rows(2));
  assert.equal(two.rated, false, 'two secondaries never rate the moment');
  const three = rateClusterMoment(rows(3, ['other_body_hit']));
  assert.equal(three.rated, true, 'three secondaries rate the moment (PQ-147.03 threshold)');
  assert.equal(three.tier, 'detonation', 'three same-kind secondaries read as a detonation');
  // Six rows of only three kinds isolate the count branch — all-kinds alone must not be required.
  const six = rateClusterMoment(rows(6, SECONDARY_KINDS.slice(0, 3)));
  assert.equal(six.tier, 'cascade', 'six secondaries reads as a cascade even with three kinds');
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
    secondaries: rows(4, ['other_body_hit', 'terrain_slam']),
    count: 4,
    kinds: ['other_body_hit', 'terrain_slam'],
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
    assert.deepEqual(seen.vfx[0].position, { x: 40, y: 0, z: 0 },
      'the VFX fires where the sim said the clump was');
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
    assert.match(seen.captions.at(-1).text, /Mass cascade/, 'the cascade caption names the tier');
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

// ── Sim-side contract: the receipt that publishes the cue must describe the real well ────────────

function wireFields(h) {
  const sys = Object.create(fields);
  const seen = { detonations: [] };
  h.bus.on('fields:clusterDetonate', (p) => seen.detonations.push(p));
  sys.init({ state: h.state, bus: h.bus });
  return { sys, seen };
}

function deployWell(h, sys, over = {}) {
  sys._kernel.register({
    id: 'well_1', kind: 'well', center: { x: 120, z: 40 }, radius: 170,
    ownerId: h.state.playerId, sourceId: 7, durationS: 30, ...over,
  });
  h.bus.emit('fields:deployed', { kind: 'well', fieldId: 'well_1', sourceId: 7 });
}

function body(h, id, type = 'ship') {
  const e = makeEntity({ type, team: 1, pos: { x: 200 + id, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, data: {} });
  e.id = id;
  h.state.entities.set(id, e);
  h.state.entityList.push(e);
  return e;
}

test('the published receipt carries the well\'s own center, owner, and id — not a stray receipt pos', () => {
  const h = createHarness();
  const { sys, seen } = wireFields(h);
  deployWell(h, sys);
  body(h, 11); body(h, 12); body(h, 13);
  // An ambient impact with a pos of its own must not stamp the watch location.
  h.bus.emit('physics:impact', { aId: 11, bId: 12, pos: { x: -900, z: -900 } });
  h.bus.emit('charge:detonated', { trigger: 'proximity', hostId: 3, hits: [11, 12, 13] });
  assert.equal(seen.detonations.length, 1, 'three blast-hit secondaries publish one receipt');
  const emit = seen.detonations[0];
  assert.equal(emit.fieldId, 'well_1');
  assert.equal(emit.ownerId, h.state.playerId, 'ownership resolves from the field, not the emitter');
  assert.deepEqual(emit.pos, { x: 120, z: 40 }, 'presentation lands on the well\'s kernel center');
  assert.equal(emit.tier, 'detonation');
  assert.equal(emit.rated, true);
});

test('a retired well closes its watch — later detonations cannot publish under its id', () => {
  const h = createHarness();
  const { sys, seen } = wireFields(h);
  deployWell(h, sys);
  body(h, 11); body(h, 12); body(h, 13);
  // Two secondaries, still shy of the rating threshold, then the well expires.
  h.bus.emit('charge:detonated', { trigger: 'proximity', hostId: 3, hits: [11, 12] });
  assert.equal(seen.detonations.length, 0);
  sys._retireDeployed(h.state, h.state.fields,
    { fieldId: 'well_1', emitterId: 7, kind: 'well' }, 'expired');
  // A slammed proximity charge afterwards is somebody else's problem — not this well's cluster.
  h.state.tick += 30;
  h.bus.emit('charge:detonated', { trigger: 'slam', hostId: 3, hits: [13] });
  assert.equal(seen.detonations.length, 0,
    'receipts after the well retires must not publish a phantom CLUSTER DETONATION');
});
