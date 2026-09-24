// PQ-205.01 — field loops follow the bomb and die on every fieldEnded/cleanup path;
// thermite burn and goo residue share the combat status owner's duration and stacks.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { bombScenario } from './helpers/bombScenario.mjs';
import {
  bindBombAudio,
  bombFieldLoopKey,
  bombStatusLoopKey,
  collectBombFieldLoopSpecs,
  collectBombStatusLoopSpecs,
  gooResidueGain,
  isBombFieldLoopCue,
  isBombStatusLoopCue,
  stopAllBombAudioLoops,
  syncBombAudioLoops,
} from '../src/audio/bombAudio.js';

function mockHost(state) {
  const loops = {};
  const ended = [];
  return {
    state,
    rt: { loops, ctx: { state: 'running', currentTime: 0 } },
    started: [],
    ended,
    _startLoopVoice(recipeId, position, gain, options) {
      const voice = {
        recipeId, position, gain, options, trackId: options && options.trackId,
        _baseGain: gain, _fieldEnvelope: 1, _statusScale: 1, loop: true, busName: 'combat',
      };
      this.started.push(voice);
      return voice;
    },
    _endLoopVoice(voice) { voice.stopped = true; ended.push(voice); },
    _markLoopPositionDirty() { this.dirty = true; },
  };
}

test('the slug inhale is a field loop cue and the collapse is not', () => {
  assert.equal(isBombFieldLoopCue('bombs.slug.inhale'), true);
  assert.equal(isBombFieldLoopCue('bombs.slug.collapse'), false);
  assert.equal(isBombFieldLoopCue('bombs.goo.burst'), false);
});

test('opening a neutron slug starts a source-following inhale that dies on fieldEnded', () => {
  const t = bombScenario({ velocity: { x: 40, z: 0 } });
  const host = mockHost(t.state);
  bindBombAudio(host, t.bus);
  try {
    const cues = [];
    t.bus.on('audio:cue', (p) => cues.push(p && p.id));
    t.state.bombs.selectedId = 'bomb_singularity';
    t.drop('bomb_singularity');
    t.tick(40);
    t.press('chargeDetonate');
    t.tick(20);
    const key = bombFieldLoopKey(t.events('detonated')[0].bombId);
    assert.ok(host.rt.loops[key], 'inhale loop follows the bomb id');
    assert.equal(host.rt.loops[key].recipeId, 'sfx_bomb_slug_inhale');
    assert.equal(host.rt.loops[key].options.follow, true);
    assert.ok(cues.includes('bombs.slug.inhale'));
    const specs = collectBombFieldLoopSpecs(t.state);
    assert.equal(specs.length, 1);
    assert.ok(specs[0].envelope > 0 && specs[0].envelope <= 1);

    t.tick(200);
    assert.ok(t.events('fieldEnded').length >= 1, 'the field actually ended');
    assert.equal(host.rt.loops[key], undefined, 'fieldEnded stops the inhale');
    assert.ok(cues.includes('bombs.slug.collapse'), 'collapse snap is a separate cue');
  } finally {
    t.close();
  }
});

test('sector cleanup and releaseAll stop field loops without a collapse snap', () => {
  const t = bombScenario();
  const host = mockHost(t.state);
  bindBombAudio(host, t.bus);
  const cues = [];
  t.bus.on('audio:cue', (p) => cues.push(p && p.id));
  try {
    t.drop('bomb_singularity');
    t.tick(40);
    t.press('chargeDetonate');
    t.tick(20);
    assert.ok(Object.keys(host.rt.loops).some((k) => k.startsWith('bombField_')));
    assert.ok(cues.includes('bombs.slug.inhale'));
    t.system.releaseAll('sector_exit');
    assert.equal(Object.keys(host.rt.loops).length, 0);
    assert.equal(cues.filter((id) => id === 'bombs.slug.collapse').length, 0);
  } finally {
    t.close();
  }
});

test('burning and goo loops follow the status bag duration and stacks', () => {
  const entities = new Map();
  const victim = { id: 7, alive: true, type: 'ship', pos: { x: 10, z: 0 }, radius: 6 };
  entities.set(7, victim);
  const state = {
    tick: 10,
    simTime: 10 / 60,
    playerId: 1,
    entities,
    combat: {
      entities: {
        7: {
          statuses: {
            status_burning: { id: 'status_burning', stacks: 2, expiresTick: 130 },
            status_goo: { id: 'status_goo', stacks: 3, expiresTick: 250 },
          },
        },
      },
    },
  };
  const specs = collectBombStatusLoopSpecs(state);
  assert.equal(specs.length, 2);
  const burn = specs.find((s) => s.statusId === 'status_burning');
  const goo = specs.find((s) => s.statusId === 'status_goo');
  assert.equal(burn.remainingTicks, 120);
  assert.equal(burn.recipeId, 'sfx_bomb_thermite_burn');
  assert.equal(goo.stacks, 3);
  assert.ok(goo.gain > gooResidueGain(1), 'full tar stacks are louder than a smear');
  assert.equal(bombStatusLoopKey(7, 'status_burning'), 'bombStatus_status_burning_7');

  state.tick = 130;
  assert.equal(collectBombStatusLoopSpecs(state).some((s) => s.statusId === 'status_burning'), false,
    'burn ends when the status owner expires, not on a guessed particle life');
  assert.equal(collectBombStatusLoopSpecs(state).length, 1);
});

test('statusExpired and stopAll drop attached loops', () => {
  const bus = createBus();
  const host = mockHost({ tick: 0, entities: new Map(), combat: { entities: {} } });
  bindBombAudio(host, bus);
  const key = bombStatusLoopKey(4, 'status_burning');
  host.rt.loops[key] = { recipeId: 'sfx_bomb_thermite_burn' };
  bus.emit('combat:statusExpired', { targetId: 4, statusId: 'status_burning' });
  assert.equal(host.rt.loops[key], undefined);
  host.rt.loops[bombFieldLoopKey(9)] = { recipeId: 'sfx_bomb_slug_inhale' };
  assert.equal(stopAllBombAudioLoops(host), 1);
  bus.clear();
});

test('reconcile is the backstop: a loop whose event never fired still dies', () => {
  const entities = new Map();
  const bomb = {
    id: 11, alive: true, type: 'bomb', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { bombId: 'bomb_singularity', phase: 'field', fieldStartedAt: 0 },
  };
  entities.set(11, bomb);
  const state = {
    tick: 20,
    simTime: 20 / 60,
    playerId: 1,
    entities,
    combat: { entities: {} },
    bombs: { selectedId: 'bomb_singularity', cooldownUntil: 0, cooldowns: {} },
  };
  const host = mockHost(state);
  host.rt.loops[bombFieldLoopKey(11)] = { recipeId: 'sfx_bomb_slug_inhale', trackId: 11 };

  // The bomb leaves the field phase (consumed by the collapse, killed by damage — no
  // bombs:fieldEnded delivery). The next audio sync must sweep the orphaned voice.
  bomb.data.phase = 'dead';
  syncBombAudioLoops(host);
  assert.equal(host.rt.loops[bombFieldLoopKey(11)], undefined, 'field loop swept without the event');
  assert.ok(host.ended.some((v) => v.recipeId === 'sfx_bomb_slug_inhale'));

  // Same backstop for a status loop whose owner expiry passed without the event.
  const victim = { id: 7, alive: true, type: 'ship', pos: { x: 4, z: 0 }, radius: 6 };
  entities.set(7, victim);
  const burnKey = bombStatusLoopKey(7, 'status_burning');
  host.rt.loops[burnKey] = { recipeId: 'sfx_bomb_thermite_burn', trackId: 7 };
  state.combat.entities[7] = {
    statuses: { status_burning: { id: 'status_burning', stacks: 1, expiresTick: 30 } },
  };
  state.tick = 31;
  state.simTime = 31 / 60;
  syncBombAudioLoops(host);
  assert.equal(host.rt.loops[burnKey], undefined, 'expired status loop swept without the event');
});

test('isBombStatusLoopCue guards the continuous ids against one-shot leaks', () => {
  assert.equal(isBombStatusLoopCue('combat.status.burning'), true);
  assert.equal(isBombStatusLoopCue('combat.status.goo'), true);
  assert.equal(isBombStatusLoopCue('bombs.thermite.ignite'), false);
});
