// WF-12 — a player weak-point hit must be visible in the world, not only as a floating callout.
// combat:weakPointHit previously had no render subscriber; this test pins the authored receipt:
// a directional breach fan and torn-metal streaks at the exact hit position.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PLAYER_ID = 1;
const TARGET_ID = 9;

function makeCanvas() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].type === type && listeners[i].fn === fn) listeners.splice(i, 1);
      }
    },
    dispatchEvent() { return true; },
  };
}

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, shield: 0,
  };
  const target = {
    id: TARGET_ID, type: 'ship', alive: true,
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, shield: 0,
  };
  const state = {
    playerId: PLAYER_ID,
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'high', motionReduce: false },
      accessibility: { flashReduce: false },
    },
    render: { scene, renderer: { domElement: makeCanvas() } },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, bus, state, target };
}

function liveParticles(system) {
  const out = [];
  const cap = system._cap || 0;
  for (let i = 0; i < cap; i++) {
    if (system._alive && system._alive[i]) out.push({
      x: system._px[i], z: system._pz[i],
      vx: system._vx[i], vz: system._vz[i],
      trailAxis: system._particleTrailAxis[i],
    });
  }
  return out;
}

function liveTrailStreaks(system) {
  return (system._ts || []).filter((s) => s && s.alive);
}

test('combat:weakPointHit is subscribed by the renderer', () => {
  assert.match(source, /add\('combat:weakPointHit'/,
    'vfx.js must consume combat:weakPointHit');
});

test('weak-point receipt spawns a directional breach fan, torn-metal streaks, and a juice cue', () => {
  const { system, bus } = makeHarness();
  const cues = [];
  bus.on('presentation:vfxCue', (p) => cues.push(p));

  // Hit on the target's east flank, offset from its center.
  bus.emit('combat:weakPointHit', {
    targetId: TARGET_ID, ownerId: PLAYER_ID, label: 'SPINE', mult: 1.8,
    pos: { x: 48, z: 0 },
  });

  const particles = liveParticles(system);
  assert.ok(particles.length >= 8,
    `weak-point hit must spray breach sparks (got ${particles.length})`);
  assert.ok(particles.every((particle) => Math.abs(particle.x - 48) < 1.5
    && Math.abs(particle.z) < 1.5),
  'breach sparks must originate at the supplied hit point');
  const outward = particles.filter((particle) => particle.vx > 0
    && particle.vx >= Math.abs(particle.vz) * 0.75);
  assert.ok(outward.length >= 8,
    'breach sparks must fan outward from the target surface normal');

  const streaks = liveTrailStreaks(system);
  assert.ok(streaks.length >= 3, 'breach must lay down directional torn-metal streaks');
  assert.ok(streaks.some((streak) => Math.abs(streak.x - 48) < 1.5
    && Math.abs(streak.z) < 1.5
    && streak.ax > 0
    && streak.ax >= Math.abs(streak.az) * 0.75),
  'one breach streak must point outward from the supplied hit point');

  const cue = cues.find((c) => c.id === 'combat.weakPoint');
  assert.ok(cue, 'a combat.weakPoint juice cue must be emitted');
  assert.equal(cue.magnitude, 2);
});

test('weak-point receipt with no renderer scene is a no-op', () => {
  const { system, bus } = makeHarness();
  const cues = [];
  bus.on('presentation:vfxCue', (p) => cues.push(p));
  system._scene = null;
  assert.doesNotThrow(() => {
    bus.emit('combat:weakPointHit', { targetId: TARGET_ID, pos: { x: 48, z: 0 } });
  });
  assert.equal(cues.length, 0, 'scene-absent weak-point events must not emit presentation cues');
  assert.equal(system._liveCount, 0, 'scene-absent weak-point events must not spawn particles');
  assert.equal(system._liveTrailStreakCount, 0, 'scene-absent weak-point events must not spawn streaks');
  assert.equal(system._liveSpriteCount, 0, 'scene-absent weak-point events must not spawn sprites');
});
