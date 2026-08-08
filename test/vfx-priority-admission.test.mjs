import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  DEFAULT_VFX_ADMISSION_PRIORITY,
  deriveVfxAdmissionMetadata,
} from '../src/presentation/vfxAdmissionPriority.js';
import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

function makeState(particleQuality = 'low') {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const target = { id: 9, type: 'ship', alive: true, pos: { x: 12, z: 0 } };
  return {
    playerId: player.id,
    player: { targetId: target.id },
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    settings: {
      video: { particleQuality, motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene: new THREE.Scene() },
    content: {},
  };
}

function makeVfxHarness(particleQuality = 'low') {
  const state = makeState(particleQuality);
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  return { state, system };
}

function spawnParticle(system, priority) {
  return system._spawnParticle(
    0, 0, 0, 0, 30, 1, 0,
    { r: 1, g: 0.5, b: 0.2 },
    { r: 0.2, g: 0.1, b: 0.05 },
    0, 0, 0, 0, 0, priority,
  );
}

function spawnTrailParticle(system, priority, axis, stretch) {
  return system._spawnParticle(
    0, 0, 0, 0, 30, 1, 0,
    { r: 1, g: 0.5, b: 0.2 },
    { r: 0.2, g: 0.1, b: 0.05 },
    0, 0, 0, axis, stretch, priority,
  );
}

function spawnSprite(system, priority) {
  return system._spawnSprite(
    0, 0, 0, 0, 30, 1, 2, 0.8, 0,
    '#ffffff', 0, 0, 1, 0, priority,
  );
}

function spawnStructuralStreak(system, priority) {
  return system._spawnProjectileTrailStreak(
    0, 0, 0, 30, 0.1, 2, 0.8, '#ffffff', 0, 0, 1, 0, priority,
  );
}

test('presentation adapters preserve causal priority components and order hero work above ambient work', () => {
  const state = makeState();
  const bus = createBus();
  const system = Object.create(presentationAdapters);
  const cues = [];
  bus.on('presentation:vfxCue', (payload) => cues.push(payload));
  system.init({ state, bus });

  const hero = {
    id: 'combat.test.hero',
    lanes: { vfx: 'vfx.test' },
    budgets: { particles: 3, lights: 1 },
    importance: 0.82,
    playerRelevance: 0.88,
    distance: 12,
    position: { x: 12, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    magnitude: 84,
    material: 'hull',
    sourceId: 1,
    targetId: 9,
    tags: ['kinetic'],
    payload: { severity: 0.91 },
  };
  const ambient = {
    id: 'combat.test.ambient',
    lanes: { vfx: 'vfx.test' },
    budgets: { particles: 3, lights: 1 },
    importance: 0.35,
    playerRelevance: 0.08,
    distance: 900,
    position: { x: 900, y: 0, z: 0 },
    magnitude: 5,
    material: 'hull',
    sourceId: 22,
    targetId: 23,
    payload: { severity: 0.1, playerCaused: false },
  };

  bus.emit('presentation:cue', hero);
  bus.emit('presentation:cue', ambient);
  system.dispose();

  assert.equal(cues.length, 2);
  assert.deepEqual(
    {
      importance: cues[0].importance,
      playerRelevance: cues[0].playerRelevance,
      distance: cues[0].distance,
      magnitude: cues[0].magnitude,
      severity: cues[0].severity,
      sourceId: cues[0].sourceId,
      targetId: cues[0].targetId,
      playerCaused: cues[0].playerCaused,
      currentTarget: cues[0].currentTarget,
    },
    {
      importance: 0.82,
      playerRelevance: 0.88,
      distance: 12,
      magnitude: 84,
      severity: 0.91,
      sourceId: 1,
      targetId: 9,
      playerCaused: true,
      currentTarget: true,
    },
  );
  assert.ok(cues[0].admissionPriority >= 0 && cues[0].admissionPriority <= 1);
  assert.ok(cues[0].admissionPriority > cues[1].admissionPriority);
  assert.deepEqual(cues[0].priorityComponents, {
    importance: 0.82,
    playerRelevance: 0.88,
    proximity: cues[0].proximity,
    severity: 0.91,
    targetRelevance: 1,
    playerCaused: true,
    currentTarget: true,
  });
});

test('causality requires explicit metadata or exact player source identity', () => {
  const state = makeState();
  const fromPlayer = deriveVfxAdmissionMetadata({ sourceId: 1, targetId: 9 }, state);
  const explicitNo = deriveVfxAdmissionMetadata({
    sourceId: 1,
    targetId: 9,
    payload: { playerCaused: false },
  }, state);
  const unrelated = deriveVfxAdmissionMetadata({ sourceId: '1', targetId: 9 }, state);

  assert.equal(fromPlayer.playerCaused, true);
  assert.equal(explicitNo.playerCaused, false, 'explicit causal metadata outranks inference');
  assert.equal(unrelated.playerCaused, false, 'identity comparison must not coerce unrelated ids');
});

test('raw kill positions and nested presentation receipts derive safe near/far proximity', () => {
  const state = makeState();
  const near = deriveVfxAdmissionMetadata({
    id: 'npc-near',
    killerId: state.playerId,
    pos: { x: 24, z: 0 },
  }, state);
  const far = deriveVfxAdmissionMetadata({
    id: 'npc-far',
    killerId: state.playerId,
    pos: { x: 900, z: 0 },
  }, state);
  const nested = deriveVfxAdmissionMetadata({
    id: 'npc-nested',
    presentation: {
      playerCaused: true,
      position: { x: 48, z: 0 },
    },
  }, state);
  const normalizedNested = deriveVfxAdmissionMetadata({
    id: 'combat.player.kill',
    lanes: { vfx: 'vfx.combat' },
    payload: {
      presentation: {
        playerCaused: true,
        position: { x: 72, z: 0 },
      },
    },
  }, state);
  const invalid = deriveVfxAdmissionMetadata({
    id: 'npc-invalid',
    killerId: state.playerId,
    pos: { x: Number.NaN, z: 0 },
  }, state);

  assert.ok(near.proximity > far.proximity);
  assert.ok(near.admissionPriority > far.admissionPriority);
  assert.ok(nested.proximity > 0.9);
  assert.ok(normalizedNested.proximity > 0.85);
  assert.equal(invalid.proximity, 0.5,
    'malformed position evidence must stay neutral rather than becoming a zero-distance hero cue');
});

test('saturated particle pool admits hero work, rejects weaker ambient work, and resets retired metadata', () => {
  const { system } = makeVfxHarness('low');
  for (let i = 0; i < system._cap; i++) assert.notEqual(spawnParticle(system, 0.1), null);
  const oldest = system._activeParticles[0];
  const heroSlot = spawnParticle(system, 0.95);

  assert.equal(system._liveCount, system._cap);
  assert.equal(heroSlot, oldest, 'higher priority should evict the oldest lowest-priority resident');
  assert.equal(system._particleAdmissionPriority[heroSlot], 0.95);
  const serialBeforeReject = system._particleAdmissionSerial[heroSlot];
  assert.equal(spawnParticle(system, 0.01), null);
  assert.equal(system._particleAdmissionSerial[heroSlot], serialBeforeReject);

  system._retireParticle(heroSlot);
  assert.equal(system._particleAdmissionPriority[heroSlot], DEFAULT_VFX_ADMISSION_PRIORITY);
  assert.equal(system._particleAdmissionSerial[heroSlot], -1);
  const genericSlot = spawnParticle(system, undefined);
  assert.equal(genericSlot, heroSlot);
  assert.equal(system._particleAdmissionPriority[genericSlot], DEFAULT_VFX_ADMISSION_PRIORITY);
});

test('particle quality migration carries admission metadata without stale retired values', () => {
  const { state, system } = makeVfxHarness('low');
  spawnParticle(system, 0.22);
  spawnParticle(system, 0.87);
  const livePriorities = Array.from(system._activeParticles.slice(0, system._liveCount),
    (slot) => system._particleAdmissionPriority[slot]).sort();

  state.settings.video.particleQuality = 'medium';
  assert.equal(system._syncParticleQuality(), true);
  const migrated = Array.from(system._activeParticles.slice(0, system._liveCount),
    (slot) => system._particleAdmissionPriority[slot]).sort();
  assert.deepEqual(migrated, livePriorities);
  for (let i = system._liveCount; i < system._cap; i++) {
    assert.equal(system._particleAdmissionPriority[i], DEFAULT_VFX_ADMISSION_PRIORITY);
    assert.equal(system._particleAdmissionSerial[i], -1);
  }
});

test('recycle-before-migration rebuilds stale packed particle trail identity from CPU state', () => {
  const { state, system } = makeVfxHarness('low');
  const retired = spawnTrailParticle(system, 0.2, 0.25, 2.5);
  spawnTrailParticle(system, 0.4, 0.75, 4.5);
  system._integrateParticles(1 / 60);
  assert.equal(system._pPackedParticleSlots[0], retired);

  system._retireParticle(retired);
  const recycled = spawnTrailParticle(system, 0.95, 1.25, 7.5);
  assert.equal(recycled, retired);
  assert.ok(Array.from(system._pPackedParticleSlots.slice(0, system._liveCount))
    .some((slot) => slot < 0), 'recycle leaves at least one packed identity dirty before integration');

  state.settings.video.particleQuality = 'medium';
  assert.equal(system._syncParticleQuality(), true);
  for (let packed = 0; packed < system._liveCount; packed++) {
    const slot = system._activeParticles[packed];
    assert.equal(system._pPackedParticleSlots[packed], slot);
    assert.equal(system._pTrailAxis[packed], system._particleTrailAxis[slot]);
    assert.equal(system._pTrailStretch[packed], system._particleTrailStretch[slot]);
  }

  system._integrateParticles(1 / 60);
  for (let packed = 0; packed < system._liveCount; packed++) {
    const slot = system._activeParticles[packed];
    assert.equal(system._pPackedParticleSlots[packed], slot);
    assert.equal(system._pTrailAxis[packed], system._particleTrailAxis[slot]);
    assert.equal(system._pTrailStretch[packed], system._particleTrailStretch[slot]);
  }
});

test('particle quality downgrade retains hero work before equal-priority ambient residents', () => {
  const { state, system } = makeVfxHarness('high');
  for (let i = 0; i < system._cap; i++) spawnParticle(system, 0.15);
  spawnParticle(system, 0.98);

  state.settings.video.particleQuality = 'low';
  assert.equal(system._syncParticleQuality(), true);
  assert.equal(system._liveCount, system._cap);
  assert.ok(Array.from(system._activeParticles.slice(0, system._liveCount),
    (slot) => system._particleAdmissionPriority[slot]).includes(0.98));
});

test('saturated sprite pool uses priority then age and keeps generic callers compatible', () => {
  const { system } = makeVfxHarness();
  for (let i = 0; i < system._spr.length; i++) assert.ok(spawnSprite(system, 0.12));
  const oldest = system._activeSprites[0];
  const hero = spawnSprite(system, 0.9);

  assert.equal(system._liveSpriteCount, system._spr.length);
  assert.equal(system._activeSpritePos[oldest] >= 0, true);
  assert.equal(hero, system._spr[oldest]);
  assert.equal(hero.admissionPriority, 0.9);
  assert.equal(spawnSprite(system, 0.01), null);

  system._retireSprite(oldest);
  assert.equal(system._spr[oldest].admissionPriority, DEFAULT_VFX_ADMISSION_PRIORITY);
  assert.equal(system._spr[oldest].admissionSerial, -1);
  const generic = spawnSprite(system, undefined);
  assert.ok(generic);
  assert.equal(generic.admissionPriority, DEFAULT_VFX_ADMISSION_PRIORITY);
});

test('saturated structural streak pool evicts weakest-oldest, rejects weaker work, and drains metadata', () => {
  const { system } = makeVfxHarness();
  for (let i = 0; i < system._ts.length; i++) assert.ok(spawnStructuralStreak(system, 0.12));
  const oldest = system._activeTrailStreaks[0];
  const hero = spawnStructuralStreak(system, 0.94);
  assert.equal(hero, system._ts[oldest]);
  assert.equal(hero.admissionPriority, 0.94);
  const heroSerial = hero.admissionSerial;
  assert.equal(spawnStructuralStreak(system, 0.01), null);
  assert.equal(hero.admissionSerial, heroSerial, 'rejection must not mutate the winning resident');

  system._collisionContactTicks.set('stale-contact', 12);
  system._collisionMediumTicks.set('stale-medium', 12);
  system.bus.emit('save:loaded');
  assert.equal(system._liveTrailStreakCount, 0);
  assert.equal(system._freeTrailStreakCount, system._ts.length);
  assert.ok(system._ts.every((slot) => slot.admissionPriority === DEFAULT_VFX_ADMISSION_PRIORITY));
  assert.ok(system._ts.every((slot) => slot.admissionSerial === -1));
  assert.equal(system._collisionContactTicks.size, 0);
  assert.equal(system._collisionMediumTicks.size, 0);
  const generic = spawnStructuralStreak(system, undefined);
  assert.ok(generic);
  assert.equal(generic.admissionPriority, DEFAULT_VFX_ADMISSION_PRIORITY);
});

test('event-light saturation preserves hero lights and rejects weaker ambient replacement', () => {
  const { system } = makeVfxHarness();
  for (let i = 0; i < system._lights.length; i++) {
    assert.equal(system._flashLight({ x: i, z: 0 }, '#ffffff', 3, 8, 100, 0.1), true);
  }
  const oldest = system._lights[0];
  assert.equal(system._flashLight({ x: 0, z: 0 }, '#ffcc88', 8, 8, 120, 0.96), true);
  assert.equal(oldest.admissionPriority, 0.96);
  const heroSerial = oldest.admissionSerial;
  assert.equal(system._flashLight({ x: 0, z: 0 }, '#ffffff', 2, 8, 100, 0.01), false);
  assert.equal(oldest.admissionSerial, heroSerial);
  assert.equal(system._activeLightCount, system._lights.length);

  system._decayEventLights(10);
  assert.equal(system._activeLightCount, 0);
  assert.equal(system._freeLightCount, system._lights.length);
  assert.ok(system._lights.every((slot) => slot.admissionPriority === DEFAULT_VFX_ADMISSION_PRIORITY));
  assert.ok(system._lights.every((slot) => slot.admissionSerial === -1));
});

test('explosion phase emission carries resident priority into particles, sprites, and lights', () => {
  const { system } = makeVfxHarness();
  const entry = system._explosions.start({
    classId: 'ordinary',
    x: 4,
    z: 0,
    radius: 8,
    direction: { x: 1, z: 0 },
    priority: 0.93,
  });
  assert.ok(entry);
  system._explosions.update(0.3, system._explosionEmitter);

  assert.ok(system._liveSpriteCount > 0);
  assert.ok(system._liveCount > 0);
  assert.ok(system._activeLightCount > 0);
  assert.ok(Array.from(system._activeSprites.slice(0, system._liveSpriteCount),
    (slot) => system._spr[slot].admissionPriority).every((priority) => priority === 0.93));
  assert.ok(Array.from(system._activeParticles.slice(0, system._liveCount),
    (slot) => system._particleAdmissionPriority[slot]).every((priority) => priority === 0.93));
  assert.ok(system._lights.filter((slot) => slot.active)
    .every((slot) => slot.admissionPriority === 0.93));
  assert.ok(Array.from(system._activeTrailStreaks.slice(0, system._liveTrailStreakCount),
    (slot) => system._ts[slot].admissionPriority).every((priority) => priority === 0.93));
});

test('phased explosions admit by priority then age, default old callers, and drain cleanly', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 2 });
  const first = lifecycle.start({ classId: 'small', x: 1, priority: 0.6 });
  const second = lifecycle.start({ classId: 'small', x: 2, priority: 0.6 });
  assert.equal(lifecycle.start({ classId: 'capital', x: 3, priority: 0.2 }), null);

  const hero = lifecycle.start({ classId: 'ordinary', x: 4, priority: 0.95 });
  assert.equal(hero.slot, first.slot, 'equal lowest priorities evict the oldest explosion');
  assert.equal(hero.priority, 0.95);
  assert.equal(second.active, true);

  const phases = [];
  for (let i = 0; i < 80; i++) {
    lifecycle.update(0.05, (phase, entry) => phases.push([phase, entry.priority]));
  }
  assert.ok(phases.some(([, priority]) => priority === 0.95),
    'resident priority must reach phase emission');
  assert.equal(lifecycle.activeCount, 0);
  assert.ok(lifecycle.entries.every((entry) => entry.priority === DEFAULT_VFX_ADMISSION_PRIORITY));
  assert.ok(lifecycle.entries.every((entry) => entry.admissionSerial === -1));

  const generic = lifecycle.start({ classId: 'small' });
  assert.equal(generic.priority, DEFAULT_VFX_ADMISSION_PRIORITY);
  lifecycle.clear();
  assert.equal(lifecycle.activeCount, 0);
  assert.equal(generic.priority, DEFAULT_VFX_ADMISSION_PRIORITY);
});
