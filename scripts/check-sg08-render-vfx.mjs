import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

function makeBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
      return () => {
        const current = listeners.get(type) || [];
        listeners.set(type, current.filter((item) => item !== fn));
      };
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

function makeHarness(overrides = {}) {
  const scene = new THREE.Scene();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  const target = { id: 2, type: 'ship', alive: true, pos: { x: 40, z: -12 }, vel: { x: 0, z: 0 }, rot: 0, radius: 14, factionId: 'concord' };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        ...(overrides.video || {}),
      },
      accessibility: {
        flashReduce: false,
        ...(overrides.accessibility || {}),
      },
    },
    render: { scene },
    content: {},
  };
  const bus = makeBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  return { scene, state, bus, system };
}

{
  const { bus, system } = makeHarness();
  bus.emit('presentation:vfxCue', {
    id: 'shield.collapse',
    lane: 'vfx.shield_collapse',
    particles: 80,
    lights: 1,
    targetId: 2,
    material: 'shield',
    magnitude: 2,
  });
  const inspect = system.inspect();
  assert.equal(inspect.schema, 'spaceface.vfxInspect.v1', 'VFX inspect schema should be versioned');
  assert.equal(inspect.presentation.applied, 1, 'renderer VFX should consume the SG-08 cue');
  assert.equal(inspect.presentation.last.id, 'shield.collapse', 'renderer VFX should remember the last semantic cue id');
  assert.equal(inspect.presentation.last.particlesRequested, 80, 'renderer VFX should see the normalized particle budget');
  assert.equal(inspect.presentation.last.particlesSpawned, 80, 'high-quality renderer VFX should spend the cue particle budget');
  assert.equal(inspect.liveParticles, 80, 'semantic cue particles should enter the renderer particle pool');
  assert(inspect.liveSprites >= 2, 'shield semantic cue should add renderer sprite punctuation');
  assert.equal(inspect.activeLights, 1, 'semantic cue light budget should activate a renderer event light');
  assert.equal(inspect.presentation.last.lightsActivated, 1, 'renderer VFX should account activated semantic lights');
}

{
  const { bus, system } = makeHarness({ accessibility: { flashReduce: true } });
  bus.emit('presentation:vfxCue', {
    id: 'tether.break',
    lane: 'vfx.tether_break',
    particles: 48,
    lights: 0,
    flashReduced: true,
    position: { x: 24, z: 8 },
    direction: { x: 1, z: 0 },
    material: 'massline',
    magnitude: 4,
  });
  const inspect = system.inspect();
  assert.equal(inspect.presentation.applied, 1, 'reduced-flash cue should still be visually represented');
  assert.equal(inspect.presentation.last.flashReduced, true, 'renderer VFX should preserve reduced-flash evidence');
  assert.equal(inspect.presentation.last.particlesRequested, 48, 'renderer VFX should consume the adapter-halved particle budget');
  assert.equal(inspect.presentation.last.particlesSpawned, 48, 'renderer VFX should not exceed the reduced particle budget');
  assert.equal(inspect.activeLights, 0, 'reduced-flash semantic cue should not activate event lights');
  assert(inspect.liveSprites >= 1, 'reduced-flash cue should keep a non-color visual marker');
}

{
  const { bus, system } = makeHarness({ video: { motionReduce: true } });
  bus.emit('presentation:vfxCue', {
    id: 'shield.collapse',
    lane: 'vfx.shield_collapse',
    particles: 16,
    lights: 1,
    targetId: 2,
    material: 'shield',
    magnitude: 1,
  });
  const inspect = system.inspect();
  assert.equal(inspect.presentation.applied, 1, 'motion-reduced renderer should still consume cues');
  assert.equal(inspect.presentation.last.lightsRequested, 1, 'motion-reduced renderer should record requested lights');
  assert.equal(inspect.presentation.last.lightsActivated, 0, 'motion-reduced renderer should suppress dynamic event lights');
  assert.equal(inspect.activeLights, 0, 'motion-reduced renderer should keep light pool inactive');
}

console.log('SG-08 renderer VFX consumer checks OK');
