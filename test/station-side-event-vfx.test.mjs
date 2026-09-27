import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  STATION_SIDE_EVENT_VFX_CAPACITY,
  writeStationSideEventVfxFrame,
} from '../src/render/stationSideEventVfx.js';
import { vfx } from '../src/render/vfx.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';

const KINDS = ['hauler_dock', 'patrol_launch', 'repair_drone', 'cargo_tractor', 'sensor_sweep', 'quiet_dock'];

function makeHarness({ motionReduce = false, flashReduce = false, patrol = false } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 'player',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: -240 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
  };
  const station = {
    id: 'station_test',
    type: 'station',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 42,
    data: { stationTypeId: 'trade_hub' },
  };
  const entities = new Map([[player.id, player], [station.id, station]]);
  const entityList = [player, station];
  let patrolEntity = null;
  if (patrol) {
    patrolEntity = {
      id: 'patrol_test',
      type: 'ship',
      alive: true,
      team: 2,
      pos: { x: 56, z: 9 },
      vel: { x: 0, z: 24 },
      rot: Math.PI * 0.5,
      radius: 5,
    };
    entities.set(patrolEntity.id, patrolEntity);
    entityList.push(patrolEntity);
  }
  const state = {
    simTime: 0,
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities,
    entityList,
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce,
        flashReduce,
        energyMaterials: false,
        engineTrails: false,
        bloom: true,
      },
      accessibility: { flashReduce },
    },
    input: { turnIntent: 0 },
    render: { scene },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} }, beams: [] },
    content: {},
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { bus, patrolEntity, player, state, station, system };
}

function payload(kind, options = {}) {
  return {
    eventId: options.eventId || `event:${kind}`,
    kind,
    stationId: 'station_test',
    path: resolveStationSideEventVfxProfile(kind).trajectory,
    durationS: options.durationS || 2,
    bearing: 0,
    from: { x: 110, z: 0 },
    to: { x: 46, z: 0 },
    entityIds: options.entityIds || [],
  };
}

function captureKind(kind) {
  const harness = makeHarness({ patrol: kind === 'patrol_launch' });
  const streaks = [];
  const sprites = [];
  harness.system._spawnProjectileTrailStreak = (
    x, y, z, life, width, length, opacity, color, vx, vz, axisX, axisZ,
  ) => {
    const record = { x, y, z, life, width, length, opacity, color, vx, vz, axisX, axisZ };
    streaks.push(record);
    return record;
  };
  harness.system._spawnSprite = (
    spriteKind, x, y, z, life, size0, size1, opacity, opacity1, color,
  ) => {
    const record = { spriteKind, x, y, z, life, size0, size1, opacity, opacity1, color };
    sprites.push(record);
    return record;
  };
  const entityIds = harness.patrolEntity ? [harness.patrolEntity.id] : [];
  harness.bus.emit('station:sideEvent', payload(kind, { entityIds }));
  harness.state.simTime += .1;
  harness.system.update(0.1);
  return { ...harness, sprites, streaks };
}

test('station operation profiles differ by silhouette, trajectory, and accent rather than tint', () => {
  const profiles = KINDS.map((kind) => resolveStationSideEventVfxProfile(kind));
  assert.ok(profiles.every((profile) => Object.isFrozen(profile)));
  assert.equal(new Set(profiles.map((profile) => profile.silhouette)).size, KINDS.length);
  assert.equal(new Set(profiles.map((profile) => profile.trajectory)).size, KINDS.length);
  assert.equal(new Set(profiles.map((profile) => profile.accent)).size, KINDS.length);
  assert.strictEqual(resolveStationSideEventVfxProfile('hauler_dock'), profiles[0],
    'hot profile resolution reuses the immutable catalogue record');
  assert.equal(resolveStationSideEventVfxProfile('unknown'), null);
});

test('pure path writer reuses scratch and preserves static silhouettes in reduced motion', () => {
  for (const kind of KINDS) {
    const profile = resolveStationSideEventVfxProfile(kind);
    const scratch = createStationSideEventVfxFrameScratch();
    const early = writeStationSideEventVfxFrame(
      profile, 2, 20, 100, 0, 40, 0, 0, 0, 0, true, scratch,
    );
    const pose = { x: early.x, z: early.z, dirX: early.dirX, dirZ: early.dirZ };
    const late = writeStationSideEventVfxFrame(
      profile, 12, 20, 100, 0, 40, 0, 0, 0, 0, true, scratch,
    );
    assert.strictEqual(early, scratch);
    assert.strictEqual(late, scratch);
    assert.deepEqual(
      { x: late.x, z: late.z, dirX: late.dirX, dirZ: late.dirZ },
      pose,
      `${kind} should hold a stable operation pose under reduced motion`,
    );
    assert.ok(late.emitStep > 0, `${kind} must retain a low-cadence static readability cue`);
  }

  const orbit = resolveStationSideEventVfxProfile('cargo_tractor');
  const scratch = createStationSideEventVfxFrameScratch();
  const first = writeStationSideEventVfxFrame(
    orbit, 2, 20, 100, 0, 100, 0, 0, 0, 0, false, scratch,
  );
  const firstPose = { x: first.x, z: first.z };
  const second = writeStationSideEventVfxFrame(
    orbit, 7, 20, 100, 0, 100, 0, 0, 0, 0, false, scratch,
  );
  assert.notDeepEqual({ x: second.x, z: second.z }, firstPose,
    'ordinary-motion cargo tractor should advance around the docking orbit');
  assert.ok(Math.abs(Math.hypot(second.x, second.z) - 100) < 1e-9,
    'docking orbit remains anchored to the station bubble radius');
});

test('station:sideEvent drives bounded volumetric compositions and lifecycle cleanup', () => {
  const captures = Object.fromEntries(KINDS.map((kind) => [kind, captureKind(kind)]));
  const signatures = [];
  for (const [kind, h] of Object.entries(captures)) {
    const owner = h.system._stationOperationVfx;
    assert.ok(owner && owner.batch.count >= 3, kind);
    assert.equal(h.streaks.length, 0, 'no duplicate legacy rail emitter');
    assert.equal(h.sprites.length, 0, 'no glow card supplies the operation body');
    signatures.push(Array.from({length:owner.batch.count}, (_,i) => owner.batch.attributes[1].getX(i)).join(','));
  }
  assert.ok(new Set(signatures).size >= 5, 'operations compose different physical cross-sections');
  const patrol = captures.patrol_launch;
  const plume = patrol.system._stationOperationVfx.inspect().instances[0];
  assert.ok(Math.abs(plume.x - patrol.patrolEntity.pos.x) < .01);
  assert.ok(plume.z < patrol.patrolEntity.pos.z, 'launch matter starts at the real aft surface');
  for (const h of Object.values(captures)) h.system.destroy();

  const lifecycle = makeHarness();
  const event = payload('hauler_dock', { durationS: 0.26, eventId: 'dedupe' });
  lifecycle.bus.emit('station:sideEvent', event);
  lifecycle.bus.emit('station:sideEvent', event);
  assert.deepEqual(lifecycle.system.inspect().stationSideEvents, {
    active: 1,
    starts: 1,
    lastKind: 'hauler_dock',
    capacity: STATION_SIDE_EVENT_VFX_CAPACITY,
  });
  for (let i = 0; i < 4; i++) lifecycle.system.update(0.1);
  assert.equal(lifecycle.system.inspect().stationSideEvents.active, 0,
    'expired ambient records return to the fixed pool');

  lifecycle.bus.emit('station:sideEvent', payload('repair_drone', { eventId: 'boundary' }));
  assert.equal(lifecycle.system.inspect().stationSideEvents.active, 1);
  lifecycle.bus.emit('sector:exit', {});
  assert.equal(lifecycle.system.inspect().stationSideEvents.active, 0,
    'sector boundaries clear cosmetic movers without touching sim entities');

  const culled = makeHarness();
  let offscreenSpawns = 0;
  culled.system._spawnProjectileTrailStreak = () => { offscreenSpawns++; return {}; };
  culled.system._spawnSprite = () => { offscreenSpawns++; return {}; };
  culled.player.pos.x = 2000;
  culled.player.pos.z = 0;
  culled.bus.emit('station:sideEvent', payload('hauler_dock', { eventId: 'offscreen' }));
  culled.system.update(0.1);
  assert.equal(offscreenSpawns, 0, 'ambient station work is LOD-culled after the player leaves');
});

test('a bound patrol retires when its real entity disappears instead of becoming a VFX ghost', () => {
  const harness = makeHarness({ patrol: true });
  let spawns = 0;
  harness.system._spawnProjectileTrailStreak = () => { spawns++; return {}; };
  harness.bus.emit('station:sideEvent', payload('patrol_launch', {
    eventId: 'live-patrol',
    entityIds: [harness.patrolEntity.id],
  }));
  harness.state.simTime += .1;
  harness.system.update(0.1);
  assert.equal(harness.system.inspect().stationSideEvents.active, 1);
  assert.ok(harness.system._stationOperationVfx.batch.count > 0, 'the live patrol receives its launch decoration');

  harness.patrolEntity.alive = false;
  harness.state.entities.delete(harness.patrolEntity.id);
  const beforeRemoval = spawns;
  harness.state.simTime += .1;
  harness.system.update(0.1);
  assert.equal(harness.system.inspect().stationSideEvents.active, 0,
    'a removed sim patrol must retire its bound cosmetic record immediately');
  assert.equal(spawns, beforeRemoval,
    'the renderer must not continue the from-to path as a synthetic patrol after removal');
});

test('station director producer payload drives the initialized VFX consumer end to end', () => {
  const harness = makeHarness();
  const director = Object.create(stationSideEventDirector);
  director.init({ state: harness.state, bus: harness.bus, helpers: {} });

  director._fire(harness.state, harness.station, {
    eventId: 'producer-cargo-tractor',
    kind: 'cargo_tractor',
    budget: 0,
    path: 'docking-orbit',
    durationS: 40,
    bearing: 0.35,
    sectorId: 'sector_test',
    stationId: harness.station.id,
  }, 0);

  const inspect = harness.system.inspect().stationSideEvents;
  assert.equal(inspect.active, 1);
  assert.equal(inspect.starts, 1);
  assert.equal(inspect.lastKind, 'cargo_tractor');
  const record = harness.system._stationSideEventSlots.find((slot) => slot.alive);
  assert.equal(record.duration, 40);
  assert.ok(Number.isFinite(record.fromX) && Number.isFinite(record.fromZ));
  assert.equal(record.fromX, record.toX,
    'the producer docking-orbit seam supplies the same radial start/end point');
  assert.equal(record.fromZ, record.toZ);

  harness.state.simTime += .1;
  harness.system.update(0.1);
  assert.ok(harness.system._stationOperationVfx.batch.count >= 5,
    'the real producer seam reaches the rolled conductor and receiver clamp composition');
  director.destroy();
});

test('repair weld uses the shared material flash control without a point sprite', () => {
  function emittedWeld(flashReduce) {
    const h = makeHarness({ flashReduce });
    h.bus.emit('station:sideEvent', payload('repair_drone'));
    h.state.simTime += .1; h.system.update(.1);
    const owner = h.system._stationOperationVfx;
    assert.ok(owner.batch.count > 0);assert.equal(h.system._liveSpriteCount, 0);
    const result = {opacity:owner.batch.attributes[3].getW(0), flash:owner.batch.material.uniforms.uFlash.value};
    h.system.destroy();return result;
  }
  const full=emittedWeld(false),reduced=emittedWeld(true);
  assert.ok(reduced.opacity < full.opacity);
  assert.ok(reduced.flash < full.flash, 'actual HDR material receives the accessibility flash scale');
});
