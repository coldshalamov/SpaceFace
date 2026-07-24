/**
 * VP-220 pass-3 adversarial tests:
 * zero-alloc hot path, live brake mode, per-entity continuum, ownership lifecycle,
 * RCS quality segments, faction exhaust identity.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import {
  ContinuousPlumeSystem,
  PlumeSlotPool,
} from '../src/render/thruster/systems/continuousPlume.js';
import { RcsImpulseSystem } from '../src/render/thruster/systems/rcsImpulse.js';
import {
  FamilyProductionFleet,
} from '../src/render/thruster/systems/familyFleet.js';
import {
  resolveDriveMode,
  sampleThrottleInto,
} from '../src/render/thruster/systems/throttleResponse.js';
import {
  resolveEngineProfileId,
  getEngineProfileBase,
  ENGINE_PROFILES,
} from '../src/render/vfxProfiles.js';
import {
  resolveThrusterRecipes,
} from '../src/render/thruster/recipes/registry.js';
import {
  resolveSegmentCount,
  segmentedVertexCount,
} from '../src/render/thruster/geometry/segmentedPlumeGeometry.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import {
  FLOW_FLIPBOOK_VERTEX,
  FLOW_FLIPBOOK_FRAGMENT,
} from '../src/render/thruster/materials/flowFlipbookMaterial.js';

const A11Y = {
  reducedMotion: false,
  reducedFlash: false,
  lowQuality: false,
  qualityTier: 'high',
};

function makeHarness(entities, opts = {}) {
  const scene = new THREE.Scene();
  const map = new Map(entities.map((e) => [e.id, e]));
  const state = {
    playerId: entities[0].id,
    player: {},
    entities: map,
    entityList: entities.slice(),
    input: opts.input || { moveZ: 0, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: 'high',
        engineTrails: true,
        energyMaterials: false,
        motionReduce: false,
        bloom: false,
      },
      accessibility: { flashReduce: false },
    },
    render: { scene },
    flightRuntime: opts.flightRuntime || null,
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: opts.helpers || {} });
  return { scene, state, system };
}

test('resolveDriveMode and sampleThrottleInto accept persistent scratch without object literals', () => {
  const recipe = KESTREL_MAIN_PLUME_RECIPE;
  const scratch = {
    drive: 0.55,
    throttle: 0.02,
    boost: 0,
    boostBlend: 0,
    cruise: 0,
    reverse: 0,
    retroOnly: false,
    brake: 0.6,
    speedDrive: 0.55,
    mode: null,
  };
  assert.equal(resolveDriveMode(scratch, recipe), 'brake');
  scratch.retroOnly = true;
  scratch.reverse = 0.5;
  assert.equal(resolveDriveMode(scratch, recipe), 'reverse');
  scratch.retroOnly = false;
  scratch.reverse = 0;
  scratch.throttle = 0.8;
  scratch.boostBlend = 0;
  assert.equal(resolveDriveMode(scratch, recipe), 'accel');

  // sampleThrottleInto must not allocate a mode object — uses flags scratch.
  const out = {
    throttle: 0, length: 0, width: 0, turbulence: 0,
    coreSheathBalance: 0, dissipation: 0, flowSpeed: 0, effectiveDrive: 0, mode: 'idle',
  };
  const flags = {
    reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high',
    drive: 0.5, throttle: 0.02, boostBlend: 0, boost: 0,
    cruise: 0, reverse: 0, retroOnly: false, brake: 0.5, speedDrive: 0.5, mode: null,
  };
  sampleThrottleInto(recipe, 0.5, flags, out);
  assert.equal(out.mode, 'brake');
});

test('resolveEngineProfileId: authored engine slot outranks hull defIdFallback', () => {
  // Explicit ion slot on a Wasp hull must stay ion — not vector from ship_wasp default.
  assert.equal(
    resolveEngineProfileId(
      { slots: { engine: ['engines/engine_ion_small.glb'] } },
      'ship_wasp',
    ),
    'engine_ion_small',
  );
  // Explicit non-ion slot wins even with conflicting fallback.
  assert.equal(
    resolveEngineProfileId(
      { slots: { engine: ['engines/engine_industrial.glb'] } },
      'ship_wasp',
    ),
    'engine_industrial',
  );
  // Fallback-only when meta has no authoritative engine data.
  assert.equal(resolveEngineProfileId(null, 'ship_wasp'), 'engine_vector');
  assert.equal(resolveEngineProfileId({}, 'ship_bastion'), 'engine_plasma_ring');
  // Explicit meta.defId wins without slot.
  assert.equal(resolveEngineProfileId({ defId: 'ship_kestrel' }, null), 'engine_ion_small');
  // Unknown → default ion.
  assert.equal(resolveEngineProfileId(null, 'ship_unknown_zzz'), 'engine_ion_small');
  assert.equal(resolveEngineProfileId(null, null), 'engine_ion_small');
  // Pure + stable
  assert.equal(
    resolveEngineProfileId(null, 'ship_wasp'),
    resolveEngineProfileId(null, 'ship_wasp'),
  );
});

test('sampleThrottleInto does not mutate frozen caller flags', () => {
  const recipe = KESTREL_MAIN_PLUME_RECIPE;
  const out = {
    throttle: 0, length: 0, width: 0, turbulence: 0,
    coreSheathBalance: 0, dissipation: 0, flowSpeed: 0, effectiveDrive: 0, mode: 'idle',
  };
  const frozenA11y = Object.freeze({
    reducedMotion: true,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  });
  assert.doesNotThrow(() => sampleThrottleInto(recipe, 1, frozenA11y, out));
  assert.equal(Object.isFrozen(frozenA11y), true);
  assert.equal(frozenA11y.drive, undefined);
  assert.equal(frozenA11y.throttle, undefined);
  assert.equal(frozenA11y.boostBlend, undefined);
  assert.ok(out.mode === 'accel' || out.mode === 'idle' || out.mode === 'cruise');

  const frozenBrake = Object.freeze({
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
    drive: 0.55,
    throttle: 0.02,
    boostBlend: 0,
    boost: 0,
    cruise: 0,
    reverse: 0,
    retroOnly: false,
    brake: 0.6,
    speedDrive: 0.55,
  });
  assert.doesNotThrow(() => sampleThrottleInto(recipe, 0.55, frozenBrake, out));
  assert.equal(out.mode, 'brake');
  assert.equal(frozenBrake.drive, 0.55);
  assert.equal(frozenBrake.throttle, 0.02);
});

test('route-shaped brake uses commanded throttle not residual drive', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 }, rot: 0, radius: 4,
    maxSpeed: 120,
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle: 0, maxSpeed: 120, forwardSpeed: 80 },
    flags: {},
  };
  const { system } = makeHarness([player], { input: { moveZ: 0, turnIntent: 0 } });
  // Residual speed with no forward command → brake continuum at fleet seam.
  for (let f = 0; f < 20; f++) system.update(1 / 60);
  const fleet = system._energy.fleet;
  const ship = fleet.findShip(player.id);
  assert.ok(ship && ship.alive && ship.isPlayer);
  assert.ok(ship.throttle < 0.1, `commanded throttle low, got ${ship.throttle}`);
  assert.ok(ship.drive > 0.15 || ship.speedDrive > 0.2 || ship.brake > 0.2,
    'residual energy present for brake classification');
  // Direct pool path with live-shaped signals
  const pool = new PlumeSlotPool(KESTREL_MAIN_PLUME_RECIPE, { maxSockets: 2 });
  const driveState = { plumeDrive: 0, boostBlend: 0 };
  // Warm residual
  for (let i = 0; i < 30; i++) {
    pool.beginWrite(A11Y);
    pool.writeEntity(0.55, [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }], 1 / 60, 0, driveState, {
      throttle: 0.02, boost: 0, cruise: 0, reverse: 0, retroOnly: false, brake: 0.5, speedDrive: 0.55,
    }, 1);
    pool.endWrite();
  }
  assert.equal(pool._scratchSample.mode, 'brake');

  // Retro-only reverse stays reverse, not brake.
  const ds2 = { plumeDrive: 0, boostBlend: 0 };
  pool.beginWrite(A11Y);
  pool.writeEntity(0.2, [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }], 1 / 60, 0, ds2, {
    throttle: 0, boost: 0, cruise: 0, reverse: 0.6, retroOnly: true, brake: 0.8, speedDrive: 0.4,
  }, 1);
  const rev = pool.endWrite();
  assert.equal(rev.mode, 'reverse');
  system._disposeEnergy();
});

test('same-family idle and boost upload distinct instance dynamics without cross-contamination', () => {
  assert.match(FLOW_FLIPBOOK_VERTEX, /instanceDynamics/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /vFlowSpeed/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /dynBoost/);

  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  const idleShip = fleet.acquireShip(1, 'engine_ion_small', true);
  const boostShip = fleet.acquireShip(2, 'engine_ion_small', false);
  fleet.setShipSockets(idleShip, sockets, 1);
  fleet.setShipSockets(boostShip, sockets, 1);
  fleet.setShipDrive(idleShip, {
    drive: 0.08, throttle: 0.02, boost: 0, cruise: 0, reverse: 0, retroOnly: false, brake: 0, speedDrive: 0.05,
  });
  fleet.setShipDrive(boostShip, {
    drive: 1.2, throttle: 1.0, boost: 1, cruise: 0, reverse: 0, retroOnly: false, brake: 0, speedDrive: 0.8,
  });
  // Warm boost blend (retain-only after first admit)
  for (let f = 0; f < 24; f++) {
    fleet.beginFrame(A11Y);
    const a = fleet.acquireShip(1, 'engine_ion_small', true);
    const b = fleet.acquireShip(2, 'engine_ion_small', false);
    fleet.setShipSockets(a, sockets, 1);
    fleet.setShipSockets(b, sockets, 1);
    fleet.setShipDrive(a, {
      drive: 0.08, throttle: 0.02, boost: 0, cruise: 0, reverse: 0, retroOnly: false, brake: 0, speedDrive: 0.05,
    });
    fleet.setShipDrive(b, {
      drive: 1.2, throttle: 1.0, boost: 1, cruise: 0, reverse: 0, retroOnly: false, brake: 0, speedDrive: 0.8,
    });
    fleet.endFrame(1 / 60);
  }
  const plume = fleet.familyPlume('engine_ion_small');
  assert.ok(plume.group.visible);
  const coreBatch = plume.layerBatches.find((b) => b.role === 'core');
  assert.ok(coreBatch && coreBatch.writeCount >= 2, 'two sockets in same family batch');
  // Instance 0 = idle, instance 1 = boost (write order)
  const d0 = coreBatch.dynamics;
  const p0 = coreBatch.params;
  const flow0 = d0[0];
  const flow1 = d0[4];
  const boost0 = p0[3];
  const boost1 = p0[7];
  const turb0 = d0[1];
  const turb1 = d0[5];
  assert.ok(flow1 > flow0 * 1.05, `boost flow ${flow1} > idle flow ${flow0}`);
  assert.ok(boost1 > boost0 + 0.3, `boostBlend instance ${boost1} vs ${boost0}`);
  assert.ok(Math.abs(turb1 - turb0) > 1e-4 || flow1 !== flow0,
    'dynamics must differ across idle/boost instances');
  // Length also differs
  const len0 = coreBatch.axisScale[3];
  const len1 = coreBatch.axisScale[7];
  assert.ok(len1 > len0 * 1.15, `boost length ${len1} vs idle ${len0}`);
  fleet.dispose();
});

test('identity-stable slots preserve survivors; ownership change resets newcomers', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  // Warm two entities with boost
  for (let f = 0; f < 20; f++) {
    fleet.beginFrame(A11Y);
    if (f === 0) fleet.beginAdmitPhase();
    const a = fleet.acquireShip(10, 'engine_vector', true);
    const b = fleet.acquireShip(20, 'engine_ion_small', false);
    fleet.setShipSockets(a, sockets, 1);
    fleet.setShipSockets(b, sockets, 1);
    fleet.setShipDrive(a, { drive: 1, throttle: 1, boost: 1 });
    fleet.setShipDrive(b, { drive: 1, throttle: 1, boost: 1 });
    fleet.endFrame(1 / 60);
  }
  const ship10 = fleet.findShip(10);
  const ship20 = fleet.findShip(20);
  assert.ok(ship10.driveState.boostBlend > 0.5);
  assert.ok(ship20.driveState.boostBlend > 0.5);
  const warmA = ship10.driveState.boostBlend;
  const warmB = ship20.driveState.boostBlend;
  const slotIndexA = fleet.ships.indexOf(ship10);

  // Order swap: acquire 20 before 10 — surviving drive state must be preserved.
  fleet.beginFrame(A11Y);
  const b2 = fleet.acquireShip(20, 'engine_ion_small', false);
  const a2 = fleet.acquireShip(10, 'engine_vector', true);
  assert.equal(b2, ship20, 'entity 20 reclaims its persistent slot');
  assert.equal(a2, ship10, 'entity 10 reclaims its persistent slot');
  assert.equal(fleet.ships.indexOf(a2), slotIndexA, 'slot index stable for entity 10');
  assert.ok(Math.abs(a2.driveState.boostBlend - warmA) < 1e-6, 'order swap must not reset survivor boost');
  assert.ok(Math.abs(b2.driveState.boostBlend - warmB) < 1e-6, 'order swap must not reset survivor boost');
  fleet.setShipSockets(a2, sockets, 1);
  fleet.setShipSockets(b2, sockets, 1);
  fleet.setShipDrive(a2, { drive: 1, throttle: 1, boost: 1 });
  fleet.setShipDrive(b2, { drive: 1, throttle: 1, boost: 1 });
  fleet.endFrame(1 / 60);

  // Remove 20, add newcomer 99 — newcomer resets; 10 still warm.
  // Two-phase: retain survivors first, then admit newcomers into departed slots only.
  fleet.beginFrame(A11Y);
  const a3 = fleet.retainShip(10, 'engine_vector', true);
  fleet.beginAdmitPhase();
  const newbie = fleet.admitShip(99, 'engine_industrial', false);
  assert.equal(a3, ship10);
  assert.ok(a3.driveState.boostBlend > 0.4, 'survivor retains warm boost after peer removal');
  assert.equal(newbie.driveState.boostBlend, 0, 'new ownership clears boostBlend');
  assert.equal(newbie.driveState.plumeDrive, 0, 'new ownership clears plumeDrive');

  // Player family switch resets previous RCS impulses.
  const rcsVector = fleet._familyByProfile.engine_vector.rcs;
  rcsVector.fire([0, 0, 0], [1, 0, 0], 1);
  rcsVector.update(1 / 60, A11Y);
  assert.ok(rcsVector.pool.activeImpulseCount > 0);
  fleet.beginFrame(A11Y);
  fleet.retainShip(10, 'engine_industrial', true);
  assert.equal(rcsVector.pool.activeImpulseCount, 0, 'previous family RCS reset on switch');

  fleet.dispose();
  assert.equal(fleet._disposed, true);
});

test('two-phase full-table: newcomer first cannot steal warmed survivors', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const N = fleet.maxShips; // 10
  // Warm full table with entities 1..N
  for (let f = 0; f < 20; f++) {
    fleet.beginFrame(A11Y);
    if (f === 0) fleet.beginAdmitPhase();
    for (let id = 1; id <= N; id++) {
      const s = fleet.acquireShip(id, 'engine_ion_small', id === 1);
      fleet.setShipSockets(s, sockets, 1);
      fleet.setShipDrive(s, { drive: 1, throttle: 1, boost: 1 });
    }
    fleet.endFrame(1 / 60);
  }
  const records = [];
  const warms = [];
  for (let id = 1; id <= N; id++) {
    const rec = fleet.findShip(id);
    assert.ok(rec, `warmed entity ${id}`);
    assert.ok(rec.driveState.boostBlend > 0.5, `entity ${id} boost warm`);
    records[id] = rec;
    warms[id] = rec.driveState.boostBlend;
  }
  const warm1 = warms[1];

  // Adversarial order: newcomer 999 first, then survivors 1..N.
  // Phase 1 retain-only: newcomer must not claim any slot yet.
  fleet.beginFrame(A11Y);
  const earlyNewcomer = fleet.retainShip(999, 'engine_industrial', false);
  assert.equal(earlyNewcomer, null, 'retainShip must reject newcomers');
  const stolenIfAdmit = fleet.admitShip(999, 'engine_industrial', false);
  assert.equal(stolenIfAdmit, null, 'admitShip before beginAdmitPhase must fail closed');

  for (let id = 1; id <= N; id++) {
    const s = fleet.retainShip(id, 'engine_ion_small', id === 1);
    assert.equal(s, records[id], `entity ${id} reclaims same record`);
    assert.ok(
      Math.abs(s.driveState.boostBlend - warms[id]) < 1e-6,
      `entity ${id} keeps boostBlend ${s.driveState.boostBlend} vs ${warms[id]}`,
    );
  }
  assert.equal(fleet.activeShipCount, N);

  // Phase 2: table full — newcomer saturates without stealing.
  fleet.beginAdmitPhase();
  const lateNewcomer = fleet.admitShip(999, 'engine_industrial', false);
  assert.equal(lateNewcomer, null, 'full table must not admit newcomer over survivors');
  assert.ok(fleet.saturated >= 1);
  assert.equal(fleet.findShip(1).driveState.boostBlend, warm1);
  assert.equal(fleet.findShip(1), records[1]);
  assert.equal(fleet.findShip(N), records[N]);
  assert.equal(fleet.findShip(999), null);

  fleet.endFrame(1 / 60);
  fleet.dispose();
});

test('two-phase two-slot: newcomer first, later survivor keeps record; only departed reused', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {}, maxShips: 2 });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  for (let f = 0; f < 18; f++) {
    fleet.beginFrame(A11Y);
    if (f === 0) fleet.beginAdmitPhase();
    const a = fleet.acquireShip(1, 'engine_vector', true);
    const b = fleet.acquireShip(2, 'engine_ion_small', false);
    fleet.setShipSockets(a, sockets, 1);
    fleet.setShipSockets(b, sockets, 1);
    fleet.setShipDrive(a, { drive: 1, throttle: 1, boost: 1 });
    fleet.setShipDrive(b, { drive: 1, throttle: 1, boost: 1 });
    fleet.endFrame(1 / 60);
  }
  const rec1 = fleet.findShip(1);
  const rec2 = fleet.findShip(2);
  const warm1 = rec1.driveState.boostBlend;
  const warm2 = rec2.driveState.boostBlend;
  assert.ok(warm1 > 0.5 && warm2 > 0.5);

  // Survivor 1 + newcomer 99; entity 2 departed. Newcomer encountered first.
  fleet.beginFrame(A11Y);
  assert.equal(fleet.retainShip(99, 'engine_industrial', false), null);
  // Unsafe single-pass acquireShip must not auto-steal before retains complete.
  assert.equal(fleet.acquireShip(99, 'engine_industrial', false), null);
  const s1 = fleet.retainShip(1, 'engine_vector', true);
  assert.equal(s1, rec1);
  assert.ok(Math.abs(s1.driveState.boostBlend - warm1) < 1e-6);
  // Entity 2 not retained → departed slot free after admit opens.
  fleet.beginAdmitPhase();
  const newbie = fleet.admitShip(99, 'engine_industrial', false);
  assert.ok(newbie);
  assert.equal(newbie, rec2, 'only the departed slot is reused');
  assert.equal(newbie.entityId, 99);
  assert.equal(newbie.driveState.boostBlend, 0, 'departed slot clears drive on new ownership');
  assert.equal(fleet.findShip(1), rec1);
  assert.ok(Math.abs(fleet.findShip(1).driveState.boostBlend - warm1) < 1e-6);
  assert.equal(fleet.findShip(2), null);
  fleet.dispose();
});

test('hadEntity snapshots priorEntityId for the frame; admit overwrite does not clear it', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {}, maxShips: 2 });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  fleet.acquireShip(1, 'engine_ion_small', true);
  fleet.acquireShip(2, 'engine_vector', false);
  fleet.endFrame(1 / 60);

  fleet.beginFrame(A11Y);
  assert.equal(fleet.hadEntity(1), true);
  assert.equal(fleet.hadEntity(2), true);
  assert.equal(fleet.hadEntity(99), false);
  // Retain only 1; admit newcomer into departed slot 2.
  fleet.retainShip(1, 'engine_ion_small', true);
  fleet.beginAdmitPhase();
  const newbie = fleet.admitShip(99, 'engine_industrial', false);
  assert.ok(newbie);
  assert.equal(newbie.entityId, 99);
  // priorEntityId stays 2 for the frame even though live entityId is now 99.
  assert.equal(newbie.priorEntityId, 2);
  assert.equal(fleet.hadEntity(2), true, 'departed owner remains hadEntity after overwrite');
  assert.equal(fleet.hadEntity(99), false, 'newcomer was not a prior owner this frame');
  assert.equal(fleet.hadEntity(1), true);
  fleet.dispose();
});

test('retain pass does not burn screen-check budget on newcomers; each candidate tier-resolved once', () => {
  // Warm only historical owners first; inject offscreen newcomers on the probe frame so
  // they are !hadEntity and must not consume retain-phase screen-check budget.
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle: 1 },
  };
  const nearNpc = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 40, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 10,
    data: { defId: 'ship_wasp' },
    _flightFrame: { throttle: 1 },
  };
  const { system, state } = makeHarness([player, nearNpc]);
  for (let f = 0; f < 4; f++) system.update(1 / 60);
  const fleet = system._energy.fleet;
  assert.ok(fleet.findShip(1) && fleet.findShip(2), 'historical owners warmed');

  const newcomers = [];
  for (let i = 0; i < 12; i++) {
    const e = {
      id: 100 + i,
      type: 'ship',
      alive: true,
      pos: { x: 2500 + i * 10, z: 0 },
      vel: { x: 5, z: 0 },
      rot: 0,
      radius: 10,
      data: { defId: 'ship_wasp' },
      _flightFrame: { throttle: 1 },
    };
    newcomers.push(e);
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  const fleetResolveCounts = Object.create(null);
  let remainingAtAdmit = -1;
  let remainingAtFleetBegin = -1;
  let resolveDuringRetainOnNewcomer = 0;
  let inFleetPlume = false;
  const origBeginFrame = fleet.beginFrame.bind(fleet);
  fleet.beginFrame = function (a11y) {
    inFleetPlume = true;
    return origBeginFrame(a11y);
  };
  const origEndFrame = fleet.endFrame.bind(fleet);
  fleet.endFrame = function (dt) {
    const out = origEndFrame(dt);
    inFleetPlume = false;
    return out;
  };
  const origResolve = system._resolveTrailTier.bind(system);
  system._resolveTrailTier = function (e, ctx, screenChecks) {
    const id = e && e.id;
    if (inFleetPlume) {
      fleetResolveCounts[id] = (fleetResolveCounts[id] || 0) + 1;
      // Detect retain-phase evaluation of true newcomers (the budget regression).
      if (id >= 100 && !fleet.hadEntity(id) && !fleet._admitOpen) {
        resolveDuringRetainOnNewcomer += 1;
      }
    }
    // Force screen-check only for far newcomers so near historical NPC still retains.
    if (id >= 100) {
      if (screenChecks.remaining <= 0) return 'reduced';
      screenChecks.remaining--;
      return 'skip'; // offscreen — culled only when budget remains for a real check
    }
    return origResolve(e, ctx, screenChecks);
  };
  const origScreenChecks = system._trailScreenChecks.bind(system);
  system._trailScreenChecks = function () {
    const sc = origScreenChecks();
    if (inFleetPlume && remainingAtFleetBegin < 0) {
      remainingAtFleetBegin = sc.remaining;
    }
    return sc;
  };
  const origBeginAdmit = fleet.beginAdmitPhase.bind(fleet);
  fleet.beginAdmitPhase = function () {
    remainingAtAdmit = system._trailScreenCheckScratch.remaining;
    return origBeginAdmit();
  };

  system.update(1 / 60);

  assert.equal(remainingAtFleetBegin, 8, 'fleet path starts with full screen-check budget');
  // Historical near NPC may consume at most one check; newcomers must not touch retain budget.
  assert.ok(remainingAtFleetBegin - remainingAtAdmit <= 1,
    `retain budget delta too large (begin=${remainingAtFleetBegin}, atAdmit=${remainingAtAdmit})`);
  assert.ok(remainingAtAdmit >= 7,
    `retain must leave screen budget for admit culling (remaining at admit=${remainingAtAdmit})`);
  assert.equal(resolveDuringRetainOnNewcomer, 0,
    'retain pass must not tier-resolve newcomers that fail hadEntity');

  assert.equal(fleetResolveCounts[2] || 0, 1, 'historical near NPC tier-resolved once in fleet path');
  for (let i = 0; i < newcomers.length; i++) {
    const id = 100 + i;
    assert.equal(fleetResolveCounts[id] || 0, 1, `newcomer ${id} tier-resolved exactly once in fleet path`);
  }
  assert.equal(fleet.hasEntity(2), true, 'near survivor retained');
  // With budget 8, first 8 screen-checks return skip; only overflow (budget exhausted → reduced)
  // may admit. Prove real checks happened: admitted newcomers must be fewer than total.
  let admittedNewcomers = 0;
  for (let i = 0; i < newcomers.length; i++) {
    if (fleet.hasEntity(100 + i)) admittedNewcomers += 1;
  }
  assert.ok(admittedNewcomers <= newcomers.length - 8,
    `screen-check culling must skip at least 8 offscreen newcomers (admitted=${admittedNewcomers})`);
  assert.equal(fleet.hadEntity(2), true);
  assert.equal(fleet.hadEntity(100), false);

  system._disposeEnergy();
});

test('faction thruster hex parse uses charCode only (no slice/substring)', () => {
  // Source-level: method body must not call String slice/substring.
  const src = fs.readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const start = src.indexOf('_factionThrusterRgbInto(e, out)');
  assert.ok(start >= 0, 'method present');
  const end = src.indexOf('\n  },', start);
  const body = src.substring(start, end > start ? end : start + 900);
  assert.ok(body.includes('hexNibbleFromCharCode') || body.includes('charCodeAt'), 'charCode path');
  assert.equal(/\bhex\.slice\b/.test(body), false, 'no hex.slice in faction parse');
  assert.equal(/\bhex\.substring\b/.test(body), false, 'no hex.substring in faction parse');
  assert.equal(/\.slice\s*\(/.test(body), false, 'no .slice() call inside faction parse body');
  assert.equal(/\.substring\s*\(/.test(body), false, 'no .substring() call inside faction parse body');

  // Runtime: String.prototype.slice / substring must not run during parse.
  const out = { r: 0, g: 0, b: 0 };
  const system = Object.create(vfx);
  system.state = {
    content: { factionPalettes: { faction_cyan: { thruster: '#00eeff' } } },
  };
  system._engineColor = () => '#00eeff';
  const origSlice = String.prototype.slice;
  const origSubstr = String.prototype.substring;
  let sliceHits = 0;
  let subHits = 0;
  String.prototype.slice = function (...args) {
    sliceHits += 1;
    return origSlice.apply(this, args);
  };
  String.prototype.substring = function (...args) {
    subHits += 1;
    return origSubstr.apply(this, args);
  };
  try {
    system._factionThrusterRgbInto({ factionId: 'faction_cyan' }, out);
  } finally {
    String.prototype.slice = origSlice;
    String.prototype.substring = origSubstr;
  }
  assert.equal(sliceHits, 0, 'faction parse must not call String.slice');
  assert.equal(subHits, 0, 'faction parse must not call String.substring');
  assert.ok(Math.abs(out.r - 0) < 1e-6);
  assert.ok(Math.abs(out.g - 0xee / 255) < 1e-6);
  assert.ok(Math.abs(out.b - 1) < 1e-6);
});

test('RCS quality tiers drive real segment counts and dispose cleanly', () => {
  const pack = resolveThrusterRecipes('engine_vector');
  const rcs = new RcsImpulseSystem(THREE, pack.rcs);
  const high = resolveSegmentCount(pack.rcs, 'high');
  const low = resolveSegmentCount(pack.rcs, 'low');
  assert.ok(high >= 1);
  rcs.setQualityTier('high');
  assert.equal(rcs.getActiveGeometryStats().segments, high);
  assert.equal(rcs.getActiveGeometryStats().vertexCount, segmentedVertexCount(high));
  rcs.setQualityTier('low');
  assert.equal(rcs.getActiveGeometryStats().segments, low);
  assert.equal(rcs.getActiveGeometryStats().vertexCount, segmentedVertexCount(low));
  // Repeated switch reuses prebuilt geos
  const geoLow = rcs.layerBatches[0].tierBuffers.low.geo;
  rcs.setQualityTier('high');
  rcs.setQualityTier('low');
  assert.equal(rcs.layerBatches[0].mesh.geometry, geoLow);
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  rcs.update(1 / 60, { ...A11Y, qualityTier: 'medium' });
  assert.equal(rcs._qualityTier, 'medium');
  rcs.dispose();
  assert.equal(rcs._disposed, true);
});

test('legacy overflow exhaust preserves faction tint with real palette delta', () => {
  const concord = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, radius: 10,
    data: { defId: 'ship_wasp', factionId: 'faction_cyan' },
    factionId: 'faction_cyan',
    _flightFrame: { throttle: 1 },
    flags: {},
  };
  const reaver = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 10, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, radius: 10,
    data: { defId: 'ship_wasp', factionId: 'faction_amber' },
    factionId: 'faction_amber',
    _flightFrame: { throttle: 1 },
    flags: {},
  };
  const system = Object.create(vfx);
  const scene = new THREE.Scene();
  system.init({
    state: {
      playerId: 999,
      player: {},
      entities: new Map([
        [concord.id, concord],
        [reaver.id, reaver],
        [999, {
          id: 999, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 4,
          data: { defId: 'ship_kestrel' },
        }],
      ]),
      entityList: [concord, reaver],
      input: {},
      settings: { video: { particleQuality: 'high', engineTrails: true } },
      // Distinct thruster palettes — required for a real nonzero sheath-pass delta.
      content: {
        factionPalettes: {
          faction_cyan: { thruster: '#00eeff' },
          faction_amber: { thruster: '#ff8800' },
        },
      },
      render: { scene },
    },
    bus: createBus(),
    helpers: {},
  });
  system._productionOwnedCount = 0; // force legacy streak path
  // Sheath pass: corePass = ((trailFrameIndex + id) & 1) === 0 → pick odd sum so sheath uses tint.
  // id=1 → trailFrameIndex even → sheath; id=2 → trailFrameIndex odd → sheath.
  const colors = [];
  const orig = system._spawnTrailStreak.bind(system);
  system._spawnTrailStreak = function (...args) {
    const c = args[7];
    if (c && c.isColor) colors.push({ r: c.r, g: c.g, b: c.b });
    return orig(...args);
  };
  system._trailFrameIndex = 0; // 0+1 odd → sheath for concord
  system._emitEngineTrail(concord, 1, 1 / 60);
  system._trailFrameIndex = 1; // 1+2 odd → sheath for reaver
  system._emitEngineTrail(reaver, 1, 1 / 60);
  assert.equal(colors.length, 2, 'both faction sheath passes must emit a streak color');
  // Same structural engine profile
  assert.equal(system._engineProfileIdFor(concord), 'engine_vector');
  assert.equal(system._engineProfileIdFor(reaver), 'engine_vector');
  assert.equal(system._engineProfile(concord), ENGINE_PROFILES.engine_vector);
  assert.equal(system._engineProfile(reaver), ENGINE_PROFILES.engine_vector);
  const cA = colors[0];
  const cB = colors[1];
  const delta = Math.abs(cA.r - cB.r) + Math.abs(cA.g - cB.g) + Math.abs(cA.b - cB.b);
  assert.ok(delta > 0.05,
    `distinct faction thruster palettes must produce nonzero sheath color delta (got ${delta})`);
  system._disposeEnergy();
});

test('fleet path reuses trail context/screen-check scratch (no per-call object literals)', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle: 1 },
  };
  const npc = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 30, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 10,
    data: { defId: 'ship_wasp' },
    _flightFrame: { throttle: 1 },
  };
  const { system } = makeHarness([player, npc]);
  for (let f = 0; f < 5; f++) system.update(1 / 60);
  const ctx1 = system._trailContext();
  const ctx2 = system._trailContext();
  assert.equal(ctx1, ctx2, 'trail context is persistent scratch');
  const sc1 = system._trailScreenChecks();
  const sc2 = system._trailScreenChecks();
  assert.equal(sc1, sc2, 'screen-check budget is persistent scratch');
  assert.equal(sc2.remaining, 8); // TRAIL_SCREEN_CHECK_MAX
  system._disposeEnergy();
});

test('production fleet same-family ships get distinct faction instance RGB', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel', factionId: 'faction_cyan' },
    factionId: 'faction_cyan',
    _flightFrame: { throttle: 1 },
  };
  const npc = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 25, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 10,
    data: { defId: 'ship_kestrel', factionId: 'faction_amber' },
    factionId: 'faction_amber',
    _flightFrame: { throttle: 1 },
  };
  const { system, state } = makeHarness([player, npc]);
  state.content = {
    factionPalettes: {
      faction_cyan: { thruster: '#00eeff' },
      faction_amber: { thruster: '#ff8800' },
    },
  };
  for (let f = 0; f < 8; f++) system.update(1 / 60);
  const fleet = system._energy.fleet;
  assert.ok(fleet.hasEntity(1) && fleet.hasEntity(2));
  assert.equal(fleet.findShip(1).profileId, 'engine_ion_small');
  assert.equal(fleet.findShip(2).profileId, 'engine_ion_small');
  // Distinct precomputed faction RGB on ship records
  const s1 = fleet.findShip(1);
  const s2 = fleet.findShip(2);
  const shipDelta = Math.abs(s1.factionR - s2.factionR)
    + Math.abs(s1.factionG - s2.factionG)
    + Math.abs(s1.factionB - s2.factionB);
  assert.ok(shipDelta > 0.2, `ship faction RGB must differ (delta=${shipDelta})`);
  // Same-family plume batch carries distinct instance colors for sheath role
  const plume = fleet.familyPlume('engine_ion_small');
  const sheath = plume.layerBatches.find((b) => b.role === 'sheath');
  assert.ok(sheath && sheath.writeCount >= 2, 'both ships write sheath instances');
  const c0 = [sheath.color[0], sheath.color[1], sheath.color[2]];
  const c1 = [sheath.color[3], sheath.color[4], sheath.color[5]];
  const instDelta = Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]);
  assert.ok(instDelta > 0.05,
    `same-family production instances must differ by faction (delta=${instDelta})`);
  system._disposeEnergy();
});

test('hide/dispose clears production ownership so fallback is not suppressed', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle: 1 },
  };
  const { system } = makeHarness([player]);
  for (let f = 0; f < 4; f++) system.update(1 / 60);
  assert.ok(system._productionOwnedCount > 0, 'ownership populated while production live');
  assert.equal(system._usesProductionThruster(player), true);
  system._hideEnergyPlumes();
  assert.equal(system._productionOwnedCount, 0, 'hide clears sticky ownership count');
  // Player still uses production path by playerId rule; NPC must not be stale-owned.
  const npc = {
    id: 7, type: 'ship', alive: true,
    pos: { x: 10, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 8,
    data: { defId: 'ship_wasp' },
  };
  system.state.entities.set(7, npc);
  assert.equal(system._usesProductionThruster(npc), false,
    'hide must not leave NPC stuck in production-owned set');
  // Re-drive then dispose
  for (let f = 0; f < 3; f++) system.update(1 / 60);
  assert.ok(system._productionOwnedCount > 0);
  system._disposeEnergy();
  assert.equal(system._productionOwnedCount, 0, 'dispose clears ownership');
  assert.equal(system._usesProductionThruster(npc), false);
});

test('trail context and screen-check scratch exist before first live frame', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel' },
  };
  const { system } = makeHarness([player]);
  // Cold: no update() yet — scratch must already exist from init.
  assert.ok(system._trailContextScratch, 'trail context preallocated at init');
  assert.ok(system._trailScreenCheckScratch, 'screen-check preallocated at init');
  assert.equal(typeof system._trailScreenCheckScratch.remaining, 'number');
  const coldCtx = system._trailContext();
  assert.equal(coldCtx, system._trailContextScratch, 'cold first call reuses init scratch');
  const coldSc = system._trailScreenChecks();
  assert.equal(coldSc, system._trailScreenCheckScratch, 'cold first screen-check reuses init scratch');
  system._disposeEnergy();
});
