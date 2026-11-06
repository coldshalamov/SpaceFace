// inf-magnet-catch — the catch you can see.
//
// A magnet capture had a voice but no picture: the audio answered `loot:magnetCaptured`
// while the glass showed nothing, though the net catch in the same cargo family reads a teal
// capture beat. The receipt now carries the pod's position at first pull and the action-vfx
// layer answers with the same catch verb, so a furball catch reads at the catch point.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTION_VFX_RECIPES, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { lootShards } from '../src/systems/lootShards.js';

test('the magnet capture answers with the net catch’s own visual verb', () => {
  const recipe = ACTION_VFX_RECIPES['loot:magnetCaptured'];
  assert.ok(recipe, 'the receipt has a picture');
  assert.equal(recipe.verb, ACTION_VFX_RECIPES['cargo:caughtByNet'].verb,
    'one capture language for the cargo-catch family');
  assert.equal(recipe.primitive, ACTION_VFX_RECIPES['cargo:caughtByNet'].primitive);
  assert.equal(recipe.surfaceCapture, true, 'the beat rides the captured hull surface');
  assert.ok(ACTION_VFX_EVENTS.includes('loot:magnetCaptured'),
    'the event auto-subscribes with the recipe table');
});

test('the receipt carries where the field took the pod, once per pod', () => {
  const emitted = [];
  const self = {
    _magnetTracked: new Set(),
    bus: { emit: (name, payload) => emitted.push({ name, payload }) },
  };
  const pod = { id: 'pod_7', alive: true, pos: { x: 120, z: -44 } };
  const state = { playerId: 3, tick: 900 };

  lootShards._noteMagnetCapture.call(self, pod, state);
  assert.equal(emitted.length, 1);
  const { payload } = emitted[0];
  assert.equal(payload.podId, 'pod_7');
  assert.equal(payload.playerId, 3);
  assert.equal(payload.pos.x, 120, 'the catch point is the pod’s own position');
  assert.equal(payload.pos.z, -44);

  lootShards._noteMagnetCapture.call(self, pod, state);
  assert.equal(emitted.length, 1, 'one readable event per pod, not per pull tick');

  const other = { id: 'pod_8', alive: true, pos: { x: 1, z: 2 } };
  lootShards._noteMagnetCapture.call(self, other, state);
  assert.equal(emitted.length, 2, 'another pod still catches');
});

test('a pod consumed before the presentation pass still leaves its catch point', () => {
  const emitted = [];
  const self = {
    _magnetTracked: new Set(),
    bus: { emit: (name, payload) => emitted.push(payload) },
  };
  const pod = { id: 'pod_9', alive: true, pos: { x: 8, z: 6 } };
  lootShards._noteMagnetCapture.call(self, pod, state_noop());
  // The snapshot is the emit-time position, independent of later pod death.
  pod.alive = false;
  pod.pos.x = 999;
  assert.equal(emitted[0].pos.x, 8, 'the beat holds the catch point, not a recycled position');
});

function state_noop() { return { playerId: 1, tick: 0 }; }
