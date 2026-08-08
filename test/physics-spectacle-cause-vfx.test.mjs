import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  EXPLOSION_CAUSE_SCHEDULES,
  explosionScheduleFor,
} from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const flashKind = Number(source.match(/const SPR_FLASH = (\d+);/)[1]);
const ringKind = Number(source.match(/const SPR_RING = (\d+);/)[1]);

function entry(cause, overrides = {}) {
  return {
    cause,
    classId: 'ordinary',
    serial: 73,
    x: 2,
    z: -4,
    radius: 10,
    dirX: 1,
    dirZ: 0,
    hasNormal: cause === 'terrain_collision' || cause === 'ship_collision',
    normalX: 0,
    normalZ: 1,
    targetVelocityX: 7,
    targetVelocityZ: -3,
    ...overrides,
  };
}

function captureCause(cause, { reduced = false, overrides = {} } = {}) {
  const calls = [];
  let phase = null;
  const harness = Object.create(vfx);
  harness._burst = 1;
  harness.state = {
    settings: {
      video: { motionReduce: reduced },
      accessibility: { flashReduce: reduced },
    },
  };
  harness.bus = { emit: (...args) => calls.push({ type: 'bus', phase, args }) };
  harness._spawnSprite = (...args) => calls.push({ type: 'sprite', phase, args });
  harness._spawnProjectileTrailStreak = (...args) => calls.push({ type: 'streak', phase, args });
  harness._spawnParticle = (...args) => calls.push({ type: 'particle', phase, args });
  harness._impactParticleCone = (...args) => calls.push({ type: 'cone', phase, args });
  harness._flashLight = (...args) => calls.push({ type: 'light', phase, args });
  const resident = entry(cause, overrides);
  for (const event of explosionScheduleFor(resident.classId, cause).events) {
    phase = event.phase;
    harness._emitExplosionPhase(phase, resident);
  }
  return calls;
}

function structuralSignature(calls) {
  return calls.map((call) => {
    if (call.type === 'streak') {
      return `streak:${call.phase}:${Number(call.args[10]).toFixed(3)},${Number(call.args[11]).toFixed(3)}`;
    }
    if (call.type === 'sprite') return `sprite:${call.phase}:${call.args[0]}:${Number(call.args[12] || 1).toFixed(2)}`;
    return `${call.type}:${call.phase}`;
  });
}

test('non-generic cause profiles replay deterministically and remain structurally distinct without color', () => {
  assert.deepEqual(captureCause('generic'), captureCause(undefined),
    'explicit generic and legacy receipt omission retain identical accepted rendering');
  const causes = ['kinetic', 'explosive', 'terrain_collision', 'ship_collision'];
  const signatures = [];
  for (const cause of causes) {
    const first = captureCause(cause);
    assert.deepEqual(captureCause(cause), first, `${cause} must replay from immutable receipt truth`);
    assert.equal(first.some((call) => call.type === 'sprite' && call.args[0] === ringKind), false,
      `${cause} may not use a primary ring`);
    signatures.push(structuralSignature(first).join('|'));
  }
  assert.equal(new Set(signatures).size, causes.length,
    'shape, axis, count, and timing distinguish causes even if all colors are removed');

  const kinetic = captureCause('kinetic').filter((call) => call.type === 'streak');
  assert.ok(kinetic.length >= 2);
  assert.ok(kinetic.every((call) => Math.abs(call.args[11]) < 0.8),
    'kinetic breakup remains a narrow axial tear');

  const ship = captureCause('ship_collision').filter((call) => call.type === 'streak');
  assert.ok(ship.some((call) => call.args[11] > 0.9));
  assert.ok(ship.some((call) => call.args[11] < -0.9), 'ship collision remains bilateral');

  const terrain = captureCause('terrain_collision').filter((call) => call.type === 'streak');
  assert.ok(terrain.some((call) => Math.abs(call.args[10]) > 0.9),
    'terrain profile retains tangent spall orthogonal to its contact normal');
});

test('cause fragments inherit target velocity and breakup axes rotate with receipt truth', () => {
  const base = captureCause('kinetic').filter((call) => call.type === 'streak');
  assert.ok(base.every((call) => Number(call.args[8]) >= 7),
    'positive target velocity is inherited before bounded axial breakup is added');
  const rotated = captureCause('kinetic', {
    overrides: { dirX: 0, dirZ: 1, targetVelocityX: 3, targetVelocityZ: 7 },
  }).filter((call) => call.type === 'streak');
  assert.equal(rotated.length, base.length);
  for (let i = 0; i < base.length; i++) {
    assert.ok(Math.abs(rotated[i].args[10] + base[i].args[11]) < 1e-9);
    assert.ok(Math.abs(rotated[i].args[11] - base[i].args[10]) < 1e-9);
  }

  const terrain = captureCause('terrain_collision', {
    overrides: { normalX: 1, normalZ: 0, targetVelocityX: 20, targetVelocityZ: 0 },
  }).filter((call) => call.type === 'streak');
  assert.ok(terrain.some((call) => call.args[10] < -0.9),
    'unoriented terrain normal chooses the half-space opposing incoming target velocity');
});

test('reduced settings retain direction-locked structure with lower count, travel, opacity, and no light', () => {
  const normal = captureCause('explosive');
  const reduced = captureCause('explosive', { reduced: true });
  const normalStreaks = normal.filter((call) => call.type === 'streak');
  const reducedStreaks = reduced.filter((call) => call.type === 'streak');
  assert.ok(reducedStreaks.length > 0 && reducedStreaks.length < normalStreaks.length);
  assert.ok(reducedStreaks.every((call) => Number.isFinite(call.args[10]) && Number.isFinite(call.args[11])));
  assert.ok(Math.max(...reducedStreaks.map((call) => Math.hypot(call.args[8] - 7, call.args[9] + 3)))
    < Math.max(...normalStreaks.map((call) => Math.hypot(call.args[8] - 7, call.args[9] + 3))));
  assert.ok(Math.max(...reducedStreaks.map((call) => call.args[6]))
    < Math.max(...normalStreaks.map((call) => call.args[6])));
  assert.equal(reduced.some((call) => call.type === 'light'), false);
  assert.ok(reduced.some((call) => call.type === 'sprite' && call.args[0] === flashKind
    && Number.isFinite(call.args[13])), 'reduced flash retains an anisotropic direction-locked core');
});

function collisionHarness() {
  const calls = [];
  const entities = new Map([
    [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } }],
    [2, { id: 2, type: 'asteroid', alive: true, pos: { x: 4, z: 0 } }],
  ]);
  const harness = Object.create(vfx);
  harness._scene = true;
  harness._burst = 1;
  harness._t = 0;
  harness.state = {
    tick: 20,
    playerId: 1,
    entities,
    settings: { video: { motionReduce: false }, accessibility: { flashReduce: false } },
  };
  harness._c0 = new THREE.Color();
  harness._c1 = new THREE.Color();
  harness._spawnSprite = (...args) => calls.push({ type: 'sprite', args });
  harness._spawnProjectileTrailStreak = (...args) => calls.push({ type: 'streak', args });
  harness._spawnParticle = (...args) => calls.push({ type: 'particle', args });
  harness._flashLight = (...args) => calls.push({ type: 'light', args });
  harness._queueExplosion = (...args) => calls.push({ type: 'explosion', args });
  harness._emitJuiceCue = () => {};
  return { harness, calls };
}

test('collision rungs keep low contact, real medium consequence, and catastrophic kill ownership separate', () => {
  const { harness, calls } = collisionHarness();
  const impact = {
    backend: 'rapier-dynamic', consequenceKernelVersion: 1, tick: 20,
    aId: 1, bId: 2, dp: 220, pos: { x: 2, z: 0 }, normal: { x: 1, z: 0 },
  };
  assert.equal(harness._onPhysicsImpact(impact), true);
  const lowCount = calls.length;
  assert.ok(lowCount > 0);
  assert.equal(harness._onPhysicsImpact(impact), false, 'pair cooldown rate-limits resting contacts');
  assert.equal(calls.length, lowCount);
  assert.equal(harness._onPhysicsImpact({ ...impact, backend: 'custom', tick: 21 }), false,
    'custom backend low contact stays on the legacy collision event, avoiding a duplicate');
  assert.equal(calls.some((call) => call.type === 'explosion'), false);
  harness._resetCollisionPresentation();
  assert.equal(harness._onPhysicsImpact({ ...impact, tick: 21 }), true,
    'sector/save boundary reset clears only presentation cooldown state');

  assert.equal(harness._onCollisionConsequence({
    tick: 22, targetId: 1, otherId: 2, pos: impact.pos, normal: impact.normal,
    control: 'none', impactDamage: 0, deltaV: 8, surface: 'terrain',
  }), false, 'magnitude alone cannot fabricate a medium consequence');
  assert.equal(harness._onCollisionDebris({
    tick: 22, targetId: 1, otherId: 2, pos: impact.pos, normal: impact.normal,
    count: 8, surface: 'terrain',
  }), false, 'debris requires the matching admitted consequence receipt');

  assert.equal(harness._onCollisionConsequence({
    tick: 23, targetId: 1, otherId: 2, pos: impact.pos, normal: impact.normal,
    control: 'tumble', impactDamage: 0, deltaV: 18, surface: 'terrain',
  }), true);
  assert.equal(harness._onCollisionDebris({
    tick: 23, targetId: 1, otherId: 2, pos: impact.pos, normal: impact.normal,
    count: 8, surface: 'terrain',
  }), true);
  assert.equal(calls.some((call) => call.type === 'explosion'), false,
    'low and medium receipts never queue catastrophic breakup');

  harness._onKilled({ presentation: { cause: 'terrain_collision' } });
  assert.equal(calls.filter((call) => call.type === 'explosion').length, 1,
    'catastrophic breakup enters only through collision-caused entity:killed.presentation');

  const reduced = collisionHarness();
  reduced.harness.state.settings.video.motionReduce = true;
  reduced.harness.state.settings.accessibility.flashReduce = true;
  assert.equal(reduced.harness._onCollisionConsequence({
    tick: 30, targetId: 1, otherId: 2, pos: impact.pos, normal: impact.normal,
    control: 'stagger', impactDamage: 0, deltaV: 12, surface: 'terrain',
  }), true);
  const reducedStreak = reduced.calls.find((call) => call.type === 'streak');
  assert.ok(reducedStreak && Number.isFinite(reducedStreak.args[10]) && Number.isFinite(reducedStreak.args[11]),
    'reduced medium collision retains its explicit contact axis');
  assert.equal(reduced.calls.some((call) => call.type === 'light'), false);
});

test('source contract contains no random or rupture/pressure ring fallback in destruction emitter', () => {
  const start = source.indexOf('  _emitExplosionPhase(');
  const end = source.indexOf('  _explode(p, big)', start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /Math\.random/);
  for (const phase of ['rupture', 'pressure']) {
    const phaseStart = body.indexOf(`if (phase === '${phase}')`);
    const next = body.indexOf("\n    if (phase === '", phaseStart + 1);
    assert.doesNotMatch(body.slice(phaseStart, next > phaseStart ? next : body.length), /SPR_RING/);
  }
  assert.deepEqual(Object.keys(EXPLOSION_CAUSE_SCHEDULES), [
    'generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision',
  ]);
});

test('causal receipt runs through the real pooled VFX substrates with inherited priority', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const target = { id: 9, type: 'ship', alive: true, pos: { x: 14, z: 2 } };
  const state = {
    playerId: player.id,
    player: { targetId: target.id },
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene: new THREE.Scene() },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  assert.equal(system._queueExplosion({
    id: target.id,
    radius: 8,
    admissionPriority: 0.91,
    presentation: {
      cause: 'explosive',
      position: { x: 14, z: 2 },
      direction: { x: 1, z: 0 },
      normal: { x: -1, z: 0 },
      targetVelocity: { x: 6, z: -2 },
      playerCaused: true,
    },
  }, 'ordinary'), true);
  system._explosions.update(0.7, system._explosionEmitter);
  assert.ok(system._liveSpriteCount > 0);
  assert.ok(system._liveTrailStreakCount > 0);
  assert.ok(Array.from(system._activeTrailStreaks.slice(0, system._liveTrailStreakCount),
    (slot) => system._ts[slot].admissionPriority).every((priority) => priority === 0.91));
});
