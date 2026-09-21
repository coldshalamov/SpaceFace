import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRibbonTrail, RIBBON_RETIRE_FADE_S } from '../src/render/engineTrailSurfaces.js';
import { vfx } from '../src/render/vfx.js';
import { resolveActuatorScale } from '../src/render/rcsJets.js';

// INF-047 — exhaust history is nailed to world space. A hull that stops earns no NEW
// samples, but the committed wake stays where it was laid and fades by age alone: no
// retraction to the nozzle, no wipe on stop, no lifetime coupled to current speed.

function layTrail() {
  const scene = new THREE.Scene();
  const trail = createRibbonTrail(scene, '#7fe0ff', 30, 5);
  // Fly +X at 60 WU/s, sampling every frame like follow() would.
  let x = 0;
  for (let i = 0; i < 40; i++) {
    x += 1;
    trail.follow(x, 0, 0, 1 / 60, 'hull-7', 1, 240, 1 / 30);
  }
  trail.rebuild(0.6, 0, 10, 1.5);
  return { scene, trail };
}

function headPositions(trail) {
  const attr = trail.getMesh().geometry.getAttribute('position');
  return Array.from(attr.array.slice(0, 12));
}

test('INF-047: stopping earns nothing new but keeps the laid wake', () => {
  const { trail } = layTrail();
  const before = trail.inspect();
  assert.ok(before.historyCount > 5, 'precondition: a flown wake exists');
  assert.equal(trail.getMesh().visible, true);
  const posBefore = headPositions(trail);
  // The stop: retire at render-clock 10. Half a fade later the wake is still there.
  trail.retire(10);
  trail.rebuild(0.6, 0, 10 + RIBBON_RETIRE_FADE_S / 2, 1.5);
  const during = trail.inspect();
  assert.ok(during.visiblePointCount > 0, 'half-aged wake still renders');
  assert.deepEqual(headPositions(trail), posBefore, 'old samples never move toward the nozzle');
  assert.equal(trail.getMesh().visible, true);
});

test('INF-047: only age removes the wake, on a fixed clock', () => {
  const { trail } = layTrail();
  trail.retire(10);
  trail.rebuild(0.6, 0, 10 + RIBBON_RETIRE_FADE_S + 0.05, 1.5);
  assert.equal(trail.getMesh().visible, false, 'fully-aged wake leaves');
  assert.equal(trail.inspect().historyCount, 0, 'retirement releases history once, at the end');
});

test('INF-047: resumed thrust cancels retirement and extends the same wake', () => {
  const { trail } = layTrail();
  const countBefore = trail.inspect().historyCount;
  trail.retire(10);
  trail.follow(41, 0, 0, 1 / 60, 'hull-7', 1, 240, 1 / 30);
  trail.rebuild(0.6, 0, 10 + RIBBON_RETIRE_FADE_S + 5, 1.5);
  assert.equal(trail.getMesh().visible, true, 'no age-out after the hull moves again');
  assert.ok(trail.inspect().historyCount >= countBefore, 'old wake plus new samples');
});

test('INF-047: retirement is per-trail and reported', () => {
  const { trail } = layTrail();
  assert.equal(trail.inspect().retired, false);
  trail.retire(10);
  assert.equal(trail.inspect().retired, true);
});

// ---- vfx wiring: the stop branch retires instead of wiping, the rebase shifts instead of wiping.

function stoppedNpc(id = 7) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 200, z: 60 },
    vel: { x: 2, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 24,
    mass: 200,
    maxSpeed: 200,
    flags: {},
    presentation: null,
    _flightFrame: { acceleration: { x: 0, z: 0 }, throttle: 0 },
  };
}

function ribbonSystem(npc, t) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 60,
    flags: {}, presentation: null, _flightFrame: {},
  };
  const system = Object.create(vfx);
  system._scene = new THREE.Scene();
  system.state = {
    playerId: 1,
    player: { cruise: null, targetId: npc.id },
    entities: new Map([[1, player], [npc.id, npc]]),
    entityList: [player, npc],
    input: {},
    settings: { video: {} },
    flightRuntime: {},
  };
  system._t = t;
  system._actuatorScratch = {};
  system._rcsScaleCache = new Map();
  system._rcsDefaultScale = resolveActuatorScale(null);
  system._plumeDashPending = false;
  system._trailCandidates = [];
  system._ribbonCandidates = [];
  system._trailCacheDirty = true;
  system._trailListRef = null;
  system._trailListLength = -1;
  system._trailContextScratch = {};
  system._trailScreenCheckScratch = { remaining: 0 };
  system._tableLookAtScratch = { x: 0, z: 0 };
  system._tableVfxDrawWu = 6000;
  system._ribbonTrails = new Map();
  system._spawnLocalXZ = { x: 0, z: 0 };
  system._entityLocalXZ = { x: 0, z: 0 };
  system._trailScreenScratch = new THREE.Vector3();
  return system;
}

function seedNpcWake(system, npc) {
  const trail = createRibbonTrail(system._scene, '#7fe0ff', 30, 5);
  for (let i = 1; i <= 40; i++) trail.follow(i * 5, 60, 0, 1 / 60, `hull-${npc.id}`, 1, 240, 1 / 30);
  trail.rebuild(0.6, 0, system._t, 1.5);
  system._ribbonTrails.set(npc.id, trail);
  return trail;
}

test('INF-047: a stopped NPC keeps its wake through the live update, fading by age', () => {
  const npc = stoppedNpc();
  const system = ribbonSystem(npc, 10);
  const trail = seedNpcWake(system, npc);
  const laid = trail.inspect().historyCount;
  assert.ok(laid > 5, 'precondition: the NPC laid a wake while moving');
  system._updateRibbonTrails(1 / 60);
  const kept = trail.inspect();
  assert.ok(kept.historyCount >= laid, 'the stop tick keeps every laid sample');
  assert.equal(kept.retired, true, 'the trail is marked retiring, not cleared');
  assert.equal(trail.getMesh().visible, true, 'the wake still renders right after the stop');
  system._t = 10 + RIBBON_RETIRE_FADE_S + 0.1;
  system._updateRibbonTrails(1 / 60);
  assert.equal(trail.inspect().historyCount, 0, 'only the fixed age clock releases the wake');
  assert.equal(trail.getMesh().visible, false);
});

test('INF-047: a frame rebase shifts the wake instead of wiping it', () => {
  const npc = stoppedNpc();
  const system = ribbonSystem(npc, 10);
  system._lights = [{ obj: { position: { x: 0, y: 0, z: 0 } } }];
  const trail = seedNpcWake(system, npc);
  const laid = trail.inspect().historyCount;
  const liveBefore = { x: trail.inspect().liveX, z: trail.inspect().liveZ };
  system.reprojectFrame(100, -50);
  const after = trail.inspect();
  assert.equal(after.historyCount, laid, 'rebase keeps every sample');
  assert.equal(after.liveX, liveBefore.x + 100, 'history re-expressed in the new frame');
  assert.equal(after.liveZ, liveBefore.z - 50);
  trail.rebuild(0.6, 0, 10, 1.5);
  assert.equal(trail.getMesh().visible, true, 'the shifted wake still renders');
});
