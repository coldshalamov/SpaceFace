import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  applyFlashAccessibility,
  resolveVfxAccessibilityProfile,
} from '../src/render/vfxAccessibility.js';
import {
  EVENT_LIGHT_POOL_SIZE,
  eventLightPoolSizeFor,
  vfx,
} from '../src/render/vfx.js';

test('event-light shader structure stays invariant across live accessibility and quality settings', () => {
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'high', motionReduce: false }), EVENT_LIGHT_POOL_SIZE);
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'low', motionReduce: false }), EVENT_LIGHT_POOL_SIZE);
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'high', motionReduce: true }), EVENT_LIGHT_POOL_SIZE);
});

test('reduced-flash presentation stays readable without full-screen intensity spikes', () => {
  const full = resolveVfxAccessibilityProfile({ video: {}, accessibility: {} });
  const reduced = resolveVfxAccessibilityProfile({
    video: {},
    accessibility: { flashReduce: true },
  });
  const authored = { life: 0.06, size0: 30, size1: 90, opacity0: 1, opacity1: 0 };
  const fullFlash = applyFlashAccessibility(authored, full);
  const reducedFlash = applyFlashAccessibility(authored, reduced);

  assert.deepEqual(fullFlash, authored);
  assert.ok(reducedFlash.opacity0 <= 0.32);
  assert.ok(reducedFlash.size0 < authored.size0);
  assert.ok(reducedFlash.size1 < authored.size1);
  assert.ok(reducedFlash.life >= 0.1,
    'reduced flashes trade the instantaneous spike for a lower, slightly longer cue');
  assert.equal(reduced.eventLightPeakScale, 0.24);
});

test('the pooled VFX choke points apply reduced-flash policy to every effect family', () => {
  const scene = new THREE.Scene();
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    entityList: [],
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });

  const normal = system._spawnSprite(0, 0, 0, 0, 0.06, 30, 90, 1, 0, '#ffffff', 0, 0);
  system._flashLight({ x: 0, z: 0 }, '#ffffff', 10, 8, 100);
  const normalPeak = system._lights[0].peak;

  state.settings.accessibility.flashReduce = true;
  const reduced = system._spawnSprite(0, 0, 0, 0, 0.06, 30, 90, 1, 0, '#ffffff', 0, 0);
  const reducedCombustion = system._spawnSprite(4, 0, 0, 0, 0.08, 24, 70, 0.8, 0,
    '#ff6a24', 0, 0, 2.2, 0);
  system._flashLight({ x: 0, z: 0 }, '#ffffff', 10, 8, 100);
  const reducedPeak = system._lights[1].peak;

  assert.ok(reduced.op0 < normal.op0);
  assert.ok(reduced.size1 < normal.size1);
  assert.ok(reducedCombustion.op0 <= 0.32,
    'irregular combustion must use the same reduced-flash choke point as generic flash cards');
  assert.ok(reducedCombustion.size1 < 70);
  assert.ok(reducedPeak < normalPeak * 0.3);
});
