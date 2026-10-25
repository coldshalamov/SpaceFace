// Controlled Chaos packet 08 - the presenter side of the dying hull.
//
// The kill queues the ordinary death explosion (a 0.4 s overload window); when the sim says the
// successor hull will fail for a window, the SAME queued explosion is held for it, the smoke/vent
// trail follows the real wreck body, and the burst lands at the wreck's CURRENT position on the
// single rupture event - never a second explosion path, never at the stale kill site.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import { dyingFuseS } from '../src/combat/lifecycle.js';

const DT = 1 / 60;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 10,
  };
  const wreck = {
    id: 50, type: 'wreck', alive: true, pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 }, rot: 0.4, radius: 12, mass: 16,
    data: { killedAt: 1 },
  };
  const entities = new Map([[1, player], [50, wreck]]);
  const state = {
    playerId: 1,
    mode: 'flight',
    entities,
    entityList: [player, wreck],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1, projectiles: [], ships: [player] },
    simTime: 1,
    tick: 60,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: { scene, camera: new THREE.PerspectiveCamera(), viewport: { height: 720 }, interpolationAlpha: 1 },
    player: {
      heatZone: { active: false, center: { x: 0, z: 0 }, radius: 0, level: 0, untilS: 0, clearAfterS: 0 },
      nav: { autopilot: { active: false, target: null }, waypoint: null },
      tether: { phase: 'idle', targetId: null, active: false },
      masslineTelemetry: { payloadReleaseGhost: null },
    },
    lawSecurity: { customsWeir: null },
    fields: { active: [] },
    combat: { entities: {}, statusNextPendingSeq: 0 },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  const queued = [];
  const original = system._queueExplosion.bind(system);
  system._queueExplosion = (p, classId, radius, cause) => {
    queued.push({ p, classId, radius, cause, at: state.simTime });
    return original(p, classId, radius, cause);
  };
  return { system, state, bus, wreck, queued, scene };
}

const KILL = Object.freeze({
  id: 9, type: 'ship', alive: false, pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 }, rot: 0.4, radius: 12, mass: 16,
  presentation: Object.freeze({
    cause: 'gun', position: Object.freeze({ x: 100, z: 40 }), direction: Object.freeze({ x: 1, z: 0 }),
    targetVelocity: Object.freeze({ x: 60, y: 0, z: 0 }),
  }),
});

function schedule(system) {
  system._scheduleDetonation(KILL, 'small', 10, 'gun');
  return system._pendingDetonations.find((r) => r.active);
}

test('without a dying hull the ordinary death explosion still fires on the 0.4 s fuse', () => {
  const { system, state, queued } = makeHarness();
  schedule(system);
  state.simTime = 1.2;
  system.update(DT);
  assert.equal(queued.length, 0, 'not before the fuse');
  state.simTime = 1.45;
  system.update(DT);
  assert.equal(queued.length, 1, 'then exactly once');
  state.simTime = 3;
  system.update(DT);
  assert.equal(queued.length, 1);
});

test('a dying hull holds the same queued explosion until the rupture, then blasts at the hull', () => {
  const { system, state, bus, wreck, queued } = makeHarness();
  const slot = schedule(system);
  assert.ok(slot);
  bus.emit('dyingHull:begin', {
    wreckId: wreck.id, victimId: KILL.id, markerId: 'm', killedAt: 1, ruptureAt: 2.0, windowS: 1.0, tier: 'medium',
    mass: 16, radius: 12, cause: 'gun', pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 }, direction: { x: 1, z: 0 },
  });
  bus.flush?.();
  assert.equal(system._dyingHulls.length, 1, 'the smoke trail follows the real wreck');
  assert.ok(slot.at >= 2.0, 'the fuse now waits for the scheduled rupture');
  assert.equal(slot.wreckId, wreck.id);

  // The hull travels; the old 0.4 s fuse passes with no explosion.
  state.simTime = 1.6;
  wreck.pos.x = 160; wreck.pos.z = 40;
  system.update(DT);
  assert.equal(queued.length, 0, 'no blast at the stale 0.4 s mark');

  // Rupture: ONE explosion, seated on the wreck's current position and motion.
  state.simTime = 2.0;
  wreck.pos.x = 220; wreck.pos.z = 55;
  bus.emit('dyingHull:ruptured', {
    wreckId: wreck.id, victimId: KILL.id, tier: 'medium', cause: 'gun', pos: { x: 220, z: 55 }, vel: { x: 60, z: 0 },
    direction: { x: 1, z: 0 }, mass: 16, radius: 12,
  });
  bus.flush?.();
  assert.equal(queued.length, 1, 'exactly one explosion');
  const blast = queued[0];
  assert.equal(blast.p.presentation.position.x, 220, 'it starts where the hull actually is');
  assert.equal(blast.p.presentation.position.z, 55);
  assert.equal(blast.p.presentation.targetVelocity.x, 60, 'and carries the hull\'s real motion');
  assert.equal(blast.classId, 'small');
  assert.equal(system._dyingHulls.length, 0, 'the trail retires with the hull');
  assert.equal(system._pendingDetonations.filter((r) => r.active).length, 0);
  // A later timer (or a second rupture) cannot fire it again.
  state.simTime = 5;
  system.update(DT);
  assert.equal(queued.length, 1);
});

test('if the rupture event never lands the hold falls back to its own timer, at the hull', () => {
  const { system, state, bus, wreck, queued } = makeHarness();
  schedule(system);
  bus.emit('dyingHull:begin', {
    wreckId: wreck.id, victimId: KILL.id, markerId: 'm', killedAt: 1, ruptureAt: 1.5, windowS: 0.5, tier: 'light',
    mass: 16, radius: 12, pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 },
  });
  bus.flush?.();
  wreck.pos.x = 190; wreck.pos.z = 40;
  state.simTime = 1.7;
  system.update(DT);
  assert.equal(queued.length, 0, 'still inside rupture + slack');
  state.simTime = 2.0;
  system.update(DT);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].p.presentation.position.x, 190);
  assert.equal(system._dyingHulls.length, 0);
});

test('lost (teardown / early destruction) releases the hold with no second blast', () => {
  const { system, state, bus, wreck, queued } = makeHarness();
  schedule(system);
  bus.emit('dyingHull:begin', {
    wreckId: wreck.id, victimId: KILL.id, markerId: 'm', killedAt: 1, ruptureAt: 2.5, windowS: 1.5, tier: 'heavy',
    mass: 120, radius: 20, pos: { x: 100, z: 40 }, vel: { x: 0, z: 0 },
  });
  bus.flush?.();
  bus.emit('dyingHull:lost', { wreckId: wreck.id, victimId: KILL.id, markerId: 'm', reason: 'sector:exit' });
  bus.flush?.();
  assert.equal(system._pendingDetonations.filter((r) => r.active).length, 0);
  assert.equal(system._dyingHulls.length, 0);
  state.simTime = 9;
  system.update(DT);
  assert.equal(queued.length, 0, 'the held explosion of a world that is gone never plays');
});

test('the trail emits smoke while the hull fails, stops when the body is gone, and honours reduced motion', () => {
  const { system, state, bus, wreck } = makeHarness();
  schedule(system);
  bus.emit('dyingHull:begin', {
    wreckId: wreck.id, victimId: KILL.id, markerId: 'm', killedAt: 1, ruptureAt: 2.0, windowS: 1.0, tier: 'medium',
    mass: 40, radius: 12, pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 },
  });
  bus.flush?.();
  let smoke = 0;
  const realEmit = system._emitDamageSmoke.bind(system);
  system._emitDamageSmoke = (e, frac, dt) => { smoke++; assert.ok(frac < 0.4, 'always in the wounded band'); return realEmit(e, frac, dt); };
  for (let i = 0; i < 40; i++) { state.simTime = 1 + i * DT; system.update(DT); }
  assert.ok(smoke >= 8, `smoke follows the failing hull (${smoke})`);
  const full = smoke;
  // reduced motion: the cue stays (location + state) but sparser
  const r = makeHarness();
  r.state.settings.video.motionReduce = true;
  schedule(r.system);
  r.bus.emit('dyingHull:begin', {
    wreckId: r.wreck.id, victimId: KILL.id, markerId: 'm', killedAt: 1, ruptureAt: 2.0, windowS: 1.0, tier: 'medium',
    mass: 40, radius: 12, pos: { x: 100, z: 40 }, vel: { x: 60, z: 0 },
  });
  r.bus.flush?.();
  let reducedSmoke = 0;
  r.system._emitDamageSmoke = () => { reducedSmoke++; };
  for (let i = 0; i < 40; i++) { r.state.simTime = 1 + i * DT; r.system.update(DT); }
  assert.ok(reducedSmoke > 0 && reducedSmoke < full, `reduced motion keeps the cue but sparser (${reducedSmoke} < ${full})`);
  // the body is destroyed: the trail drops itself without touching a dead reference
  wreck.alive = false;
  state.entities.delete(wreck.id);
  state.simTime = 1.9;
  system.update(DT);
  assert.equal(system._dyingHulls.length, 0);
});

test('audio fuse follows the dying record and falls back to the fixed 0.4 s', () => {
  const state = {
    simTime: 10,
    dyingHullRuntime: { byWreckId: { 7: { wreckId: 7, victimId: 3, ruptureAt: 11.2, ruptured: false } } },
  };
  assert.ok(Math.abs(dyingFuseS(state, 3, 0.4) - 1.2) < 1e-9, 'the boom waits for the rupture');
  assert.equal(dyingFuseS(state, 99, 0.4), 0.4, 'a kill with no dying successor keeps the fixed fuse');
  assert.equal(dyingFuseS({ simTime: 10 }, 3, 0.4), 0.4, 'no runtime at all is safe');
  state.dyingHullRuntime.byWreckId[7].ruptureAt = 10.1;
  assert.equal(dyingFuseS(state, 3, 0.4), 0.4, 'never earlier than the fixed fuse');
  state.dyingHullRuntime.byWreckId[7].ruptureAt = 400;
  assert.ok(dyingFuseS(state, 3, 0.4) <= 3.5, 'bounded');
});
