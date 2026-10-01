// INST-30 — a magnet capture chimes softly, distinct from a scoop pickup.
//
// `loot:magnetCaptured` (lootShards._noteMagnetCapture, once per pod id per window) had zero
// consumers: the ring pulled pods in silently. It now plays one soft vent-chime ping at the
// pod — deliberately off the scoop ladder, which still owns the seat sound at claim.
//
// The same commit fixes the adjacent defect the wire exposed: `_magnetTracked` only cleared
// on `game:started`, so entity ids recycled through the LIFO free-list between sectors
// swallowed a fresh pod's capture emit — which would have swallowed this chime too.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lootShards } from '../src/systems/lootShards.js';
import { audio } from '../src/audio/audioSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => off(type, fn);
    },
    off(type, fn) {
      handlers.set(type, (handlers.get(type) || []).filter((h) => h !== fn));
    },
    of(type) {
      return events.filter((e) => e.type === type);
    },
  };
}

function lootRig() {
  const bus = makeBus();
  const pulls = [];
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { derived: { lootMagnetRange: 420 } },
  };
  const pod = {
    id: 55, type: 'payload', alive: true, pos: { x: 300, z: 0 }, mass: 20,
    data: { payloadType: 'jettisoned_cargo' },
  };
  const state = {
    meta: { seed: 4242 },
    mode: 'flight',
    tick: 100,
    playerId: 1,
    player: {},
    entities: new Map([[1, player], [55, pod]]),
    entityList: [player, pod],
  };
  const helpers = {
    combatPhysics: {
      applyImpulse(record) { pulls.push(record); return true; },
    },
  };
  const system = Object.create(lootShards);
  system.init({ state, bus, helpers });
  return { system, state, pulls, pod, bus };
}

function audioHost(played, pod) {
  const host = Object.create(audio);
  host.state = { playerId: 1, entities: new Map(pod ? [[pod.id, pod]] : []) };
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  return host;
}

test('seed 4242: a captured pod emits once and the chime is a soft non-scoop voice', () => {
  const { system, state, pod, bus } = lootRig();
  const played = [];
  const host = audioHost(played, pod);
  bus.on('loot:magnetCaptured', (p) => host._onMagnetCaptured(p));

  system.update(DT, state);
  const captures = bus.of('loot:magnetCaptured');
  assert.equal(captures.length, 1, 'one capture emit per pod');
  assert.equal(captures[0].payload.podId, 55);

  assert.equal(played.length, 1, 'one cue answered the emit');
  assert.equal(played[0].recipeId, 'sfx_vent_chime');
  assert.notEqual(played[0].recipeId, 'sfx_pickup_chime', 'not the scoop voice');
  assert.ok(RECIPES.some((r) => r.id === played[0].recipeId), 'the recipe exists in the catalog');
  assert.ok(played[0].opts.gain <= 0.5, `the catch reads soft (${played[0].opts.gain})`);
  assert.deepEqual(played[0].opts.position, { x: 300, z: 0 }, 'the ping is positioned at the pod');

  system.update(DT, state);
  assert.equal(bus.of('loot:magnetCaptured').length, 1, 'no per-tick stream');
});

test('a sector or session boundary releases the tracker so a recycled pod id still chimes', () => {
  for (const boundary of ['sector:enter', 'save:loaded', 'game:new', 'game:newGame', 'game:started']) {
    const { system, state, bus } = lootRig();
    system.update(DT, state);
    assert.equal(bus.of('loot:magnetCaptured').length, 1, `${boundary}: first capture emits`);
    bus.emit(boundary, { sectorId: 'sector_test' });
    // Same pod id stands in for the LIFO-recycled-id case: the tracker must not swallow it.
    system.update(DT, state);
    assert.equal(bus.of('loot:magnetCaptured').length, 2, `${boundary}: a post-boundary capture still emits`);
  }
});

test('foreign-player captures and shapeless payloads stay silent', () => {
  const played = [];
  const host = audioHost(played, { id: 55, pos: { x: 1, z: 2 } });
  host._onMagnetCaptured({ podId: 55, playerId: 99, tick: 100 });
  assert.equal(played.length, 0, 'another crew\'s magnet makes no sound here');
  host._onMagnetCaptured(null);
  host._onMagnetCaptured({});
  assert.equal(played.length, 0, 'a payload with no podId plays nothing');
});

test('a pod already gone still chimes, unpositioned', () => {
  const played = [];
  const host = audioHost(played, null);
  host._onMagnetCaptured({ podId: 55, playerId: 1, tick: 100 });
  assert.equal(played.length, 1);
  assert.equal(played[0].opts.position, null, 'no fabricated position');
});
