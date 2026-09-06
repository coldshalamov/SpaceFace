import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import {
  MINIMAL_ACTION_AUDIO,
  MINIMAL_ACTION_AUDIO_MAX_DELAY_TICKS,
  bindMinimalActionAudio,
  requestMinimalActionAudio,
} from '../src/audio/minimalActionAudio.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const PAYLOAD = {
  attachment: { player: true, targetId: 'rock-1' },
  loadedLine: { phase: 'loaded', load: 0.62 },
  release: { classification: 'messy', targetId: 'rock-1' },
  drillValid: { bite: true, depth: 0.4 },
  drillInvalid: { reason: 'dry' },
  shieldBreak: { entityId: 'player' },
  weaponVent: { ownerId: 'player', phase: 'end' },
  engineMode: { shipId: 'player', mode: 'boost' },
  purchase: { player: true, kind: 'buy' },
  blockedProduction: { siteId: 'works-1', machineId: 'mill-1', state: 'starved' },
};

function hostStub(tick = 120) {
  const plays = [];
  const cues = [];
  return {
    plays,
    cues,
    state: {
      tick,
      playerId: 'player',
      player: { tether: { active: true, phase: 'loaded', load: 0.62, strain: 0.01 } },
      settings: { accessibility: { reduceMotion: true }, video: { motionReduce: true } },
    },
    _mineOwnsEar() { return false; },
    _applyPriorityCue(cue) { cues.push(cue); },
    play(recipeId, opts) { plays.push({ recipeId, opts, tick: this.state.tick }); },
  };
}

test('PQ-158.06 each named action requests a recipe within 0.1s of the receipt', () => {
  assert.equal(MINIMAL_ACTION_AUDIO.length, 10);
  for (const spec of MINIMAL_ACTION_AUDIO) {
    const recipe = RECIPES.find((row) => row.id === spec.recipeId);
    assert.ok(recipe, `${spec.id} recipe ${spec.recipeId} exists`);
    const host = hostStub(90);
    const result = requestMinimalActionAudio(host, spec.id, PAYLOAD[spec.id], 90);
    assert.ok(result && result.played, `${spec.id} must play`);
    assert.equal(host.plays.length, 1, spec.id);
    assert.equal(host.plays[0].recipeId, spec.recipeId);
    assert.equal(host.plays[0].tick, 90);
    assert.ok(
      Math.abs(host.plays[0].tick - 90) <= MINIMAL_ACTION_AUDIO_MAX_DELAY_TICKS,
      `${spec.id} delay`,
    );
    assert.equal(host.plays[0].opts.reducedMotionKept, true);
  }
});

test('PQ-158.06 reduced-motion keeps every cue', () => {
  const host = hostStub(40);
  host.state.settings.video.motionReduce = true;
  for (const spec of MINIMAL_ACTION_AUDIO) {
    requestMinimalActionAudio(host, spec.id, PAYLOAD[spec.id], 40);
  }
  assert.equal(host.plays.length, MINIMAL_ACTION_AUDIO.length);
});

test('PQ-158.06 bus bindings fire on the same tick for the missing cues', () => {
  const bus = createBus();
  const host = hostStub(200);
  bindMinimalActionAudio(host, bus);
  bus.emit('tether:strain', PAYLOAD.loadedLine);
  bus.emit('tether:releaseRated', PAYLOAD.release);
  bus.emit('drill:spark', PAYLOAD.drillValid);
  bus.emit('drill:warn', PAYLOAD.drillInvalid);
  bus.emit('site:machineStatus', PAYLOAD.blockedProduction);
  const ids = host.plays.map((p) => p.recipeId);
  assert.ok(ids.includes('sfx_tether_strain_creak'));
  assert.ok(ids.includes('sfx.tetherSnap'));
  assert.ok(ids.includes('sfx_mining_drill_contact'));
  assert.ok(ids.includes('sfx_mining_drill_abort'));
  assert.ok(ids.includes('sfx_ui_error'));
  assert.ok(host.plays.every((p) => p.tick === 200));
});

test('PQ-158.06 a slack line stays silent', () => {
  const host = hostStub(10);
  host.state.player.tether = { active: true, phase: 'slack', load: 0.05, strain: 0 };
  const result = requestMinimalActionAudio(host, 'loadedLine', { ratio: 0.4 }, 10);
  assert.equal(result, null);
  assert.equal(host.plays.length, 0);
});

test('PQ-158.06 a rated clean release leaves the messy snap to presentation', () => {
  const host = hostStub(11);
  const result = requestMinimalActionAudio(host, 'release', { classification: 'clean' }, 11);
  assert.equal(result, null);
});

test('PQ-158.06 default-route receipts request a voice on the same tick', () => {
  try { audio.destroy(); } catch (_) {}
  const bus = createBus();
  const plays = [];
  const state = {
    tick: 300,
    playerId: 'player',
    simTime: 5,
    entities: new Map([['player', { id: 'player', pos: { x: 0, z: 0 } }]]),
    player: { tether: { active: true, phase: 'loaded', load: 0.6, strain: 0.01 } },
    settings: {
      audio: { muted: false, master: 1, sfx: 1, music: 0 },
      video: { motionReduce: true },
    },
    audioRuntime: {},
  };
  const host = Object.create(audio);
  host.play = function playSpy(recipeId, opts) {
    plays.push({ recipeId, opts, tick: this.state.tick });
    return { recipeId };
  };
  host.init({ state, bus, helpers: {} });

  bus.emit('audio:cue', { id: 'presentation.tether.attach' });
  bus.emit('tether:strain', { ratio: 1e-4 });
  bus.emit('tether:releaseRated', { classification: 'messy', targetId: 'rock-1' });
  bus.emit('drill:spark', { bite: true });
  bus.emit('drill:warn', { reason: 'dry' });
  bus.emit('shieldDown', { combatantId: 'player' });
  bus.emit('weapons:vent', { ownerId: 'player', phase: 'end' });
  bus.emit('ship:boostStart', { shipId: 'player' });
  bus.emit('economy:tradeCompleted', { kind: 'buy' });
  bus.emit('site:machineStatus', { machineId: 'mill-1', state: 'starved' });

  const ids = plays.map((row) => row.recipeId);
  assert.ok(ids.includes('sfx.tetherLatch'), `attach in ${ids.join(',')}`);
  assert.ok(ids.includes('sfx_tether_strain_creak'), 'loaded line');
  assert.ok(ids.includes('sfx.tetherSnap'), 'messy release');
  assert.ok(ids.includes('sfx_mining_drill_contact'), 'valid drill');
  assert.ok(ids.includes('sfx_mining_drill_abort'), 'invalid drill');
  assert.ok(ids.includes('sfx.shieldBreak'), 'shield');
  assert.ok(ids.includes('sfx_vent_chime') || ids.some((id) => id.includes('vent')), `vent in ${ids.join(',')}`);
  assert.ok(ids.includes('sfx_boost_whoosh'), 'boost');
  assert.ok(ids.includes('sfx_ui_confirm'), 'purchase');
  assert.ok(ids.includes('sfx_ui_error'), 'blocked production');
  assert.ok(plays.every((row) => row.tick === 300));
});

test('PQ-158.06 capture flag lets automation unmute', () => {
  const host = Object.create(audio);
  host.state = { settings: { audio: { muted: false } } };
  const previous = globalThis.window;
  globalThis.window = { __SF_CAPTURE_AUDIO: true, navigator: { webdriver: true } };
  try {
    assert.equal(host._isMuted(), false);
    globalThis.window.__SF_CAPTURE_AUDIO = false;
    assert.equal(host._isMuted(), true);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
