// INF-018 — every supported line-separation cause is distinguishable and emitted once.
//
// Voluntary releases stay on the releaseRated tiers (no break cue here); overload, an
// externally severed line, and a vanished endpoint each get their own restrained cue
// through the existing presentation recipe path. Separation spawns no damage or rewards:
// the cue carries no damage, score, or wallet fields by construction.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator, tetherBreakCueForReason, tetherBreakCueSourceId } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters, PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';

test('INF-018: break reasons route to distinct cause cues', () => {
  for (const reason of ['threshold', 'overload', 'sustained-overload', 'catastrophic-overload', 'snap', 'integrity-failure']) {
    assert.equal(tetherBreakCueForReason(reason), 'tether.break.overload', reason);
  }
  for (const reason of ['ace_cut', 'specialist_cut', 'monofilament_sweep']) {
    assert.equal(tetherBreakCueForReason(reason), 'tether.break.severed', reason);
  }
  for (const reason of ['target_lost', 'controller_lost', 'endpoint_lost']) {
    assert.equal(tetherBreakCueForReason(reason), 'tether.break.endpoint', reason);
  }
  for (const reason of ['line_broken', 'physics_break', 'owner_disabled', null, undefined]) {
    assert.equal(tetherBreakCueForReason(reason), 'tether.break', String(reason));
  }
  for (const reason of ['sector_changed', 'sector_exit', 'flight_exit', 'controller_unavailable', 'accepted', 'pilot', 'tether_cut']) {
    assert.equal(tetherBreakCueForReason(reason), null, String(reason));
  }
});

test('INF-018: every cause cue has a recipe and an authored audio mapping', () => {
  for (const cueId of ['tether.break', 'tether.break.overload', 'tether.break.severed', 'tether.break.endpoint']) {
    const recipe = PRESENTATION_RECIPES[cueId];
    assert.ok(recipe, `${cueId} needs a presentation recipe`);
    assert.ok(recipe.lanes && recipe.lanes.ui && recipe.lanes.audio && recipe.lanes.vfx,
      `${cueId} must ride the existing lanes, not invent new ones`);
  }
  for (const cueId of ['tether.break.overload', 'tether.break.severed', 'tether.break.endpoint']) {
    assert.ok(PRESENTATION_AUDIO_CUE_BY_ID[cueId], `${cueId} needs an authored audio mapping`);
  }
});

test('INF-018: one separation emits one distinguishable alert per cause', () => {
  const h = createHarness();
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const alerts = [];
  const captions = [];
  h.bus.on('alert', (payload) => alerts.push(payload));
  h.bus.on('presentation:caption', (payload) => captions.push(payload));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  try {
    const seen = {};
    for (const [reason, text] of [
      ['threshold', 'OVERLOAD BREAK'],
      ['monofilament_sweep', 'LINE SEVERED'],
      ['target_lost', 'TARGET LOST'],
      ['line_broken', 'MASSLINE BROKEN'],
    ]) {
      h.state.tick += 11;
      const before = alerts.length;
      h.bus.emit('tether:broken', { actorId: 1, targetId: 2, attachmentId: 'att_test', reason, tension: 5 });
      h.bus.flush();
      assert.equal(alerts.length, before + 1, `${reason} must emit exactly one alert`);
      assert.equal(alerts[alerts.length - 1].text, text, `${reason} names its cause`);
      seen[reason] = alerts[alerts.length - 1].text;
    }
    assert.equal(new Set(Object.values(seen)).size, 4, 'all four causes read differently');

    h.state.tick += 11;
    const quietHandoff = alerts.length;
    h.bus.emit('tether:broken', { actorId: 1, ownerId: 1, targetId: 2, attachmentId: 'att_cut', reason: 'tether_cut', tension: 5 });
    h.bus.emit('tether:broken', { actorId: 1, ownerId: 1, targetId: 2, attachmentId: 'att_hand', reason: 'accepted', tension: 5 });
    h.bus.emit('tether:broken', { actorId: 1, ownerId: 1, targetId: 2, attachmentId: 'att_bound', reason: 'sector_changed', tension: 5 });
    h.bus.flush();
    assert.equal(alerts.length, quietHandoff, 'a handoff or a sector drop is not MASSLINE BROKEN');

    h.state.tick += 11;
    const beforeSever = alerts.length;
    h.bus.emit('tether:broken', {
      actorId: 2, ownerId: 1, targetId: 9, attachmentId: 'att_player', reason: 'monofilament_sweep', tension: 5,
    });
    h.bus.flush();
    assert.equal(alerts.length, beforeSever + 1, 'a hostile cut of the player line still banners');
    assert.equal(alerts[alerts.length - 1].text, 'LINE SEVERED');
    assert.equal(tetherBreakCueSourceId(h.state, {
      actorId: 2, ownerId: 1, targetId: 9, reason: 'monofilament_sweep',
    }), 1);

    h.state.tick += 11;
    const beforeNpc = alerts.length;
    h.bus.emit('tether:broken', {
      actorId: 1, ownerId: 2, targetId: 9, attachmentId: 'att_npc', reason: 'monofilament_sweep', tension: 5,
    });
    h.bus.flush();
    const npcCue = alerts.slice(beforeNpc).find((a) => a.text === 'LINE SEVERED');
    assert.equal(tetherBreakCueSourceId(h.state, {
      actorId: 1, ownerId: 2, targetId: 9, reason: 'monofilament_sweep',
    }), 2, 'cutting an NPC line does not make the player the source');
    if (npcCue) assert.notEqual(npcCue.sourceId, 1);

    h.state.tick += 11;
    const beforeGrade = alerts.length;
    h.bus.emit('tether:releaseRated', {
      targetId: 9, sourceId: 1, classification: 'clean', technique: 'swing', deliberate: false,
    });
    h.bus.flush();
    assert.equal(alerts.length, beforeGrade, 'a snap rating must not banner CLEAN CUT');
    h.bus.emit('tether:releaseRated', {
      targetId: 9, sourceId: 1, classification: 'clean', technique: 'swing', deliberate: true,
    });
    h.bus.flush();
    assert.equal(alerts[alerts.length - 1].text, 'CLEAN CUT');

    const captionTexts = captions.map((c) => c.text);
    assert.ok(captionTexts.some((t) => /overload/i.test(t)), 'overload caption speaks');
    assert.ok(captionTexts.some((t) => /severed/i.test(t)), 'sever caption speaks');
    assert.ok(captionTexts.some((t) => /target lost/i.test(t)), 'endpoint caption speaks');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

function createHarness() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 200, data: {} };
  const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 200, data: {} };
  const state = {
    tick: 100,
    simTime: 100 / 60,
    playerId: player.id,
    player: { heat: 0 },
    settings: { video: {}, accessibility: {} },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [enemy.id, enemy]]),
    entityList: [player, enemy],
  };
  const bus = createBus();
  return { state, bus };
}
