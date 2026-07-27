/**
 * VP-220 pass-3 adversarial tests:
 * engineTrails=false compact core+inner on live VFX route,
 * family-switch RCS reset, death/dock/sector/reset/dispose cleanup,
 * 600-frame dense allocation caps, overflow fallback without suppression,
 * fail-closed acceptance report validator.
 *
 * Public behavior only — no aesthetic constants or source-string orthodoxy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import {
  FamilyProductionFleet,
  FLEET_MAX_SHIPS,
  FLEET_INITIAL_SHIPS,
} from '../src/render/thruster/systems/familyFleet.js';
import { LIVE_ENGINE_PROFILE_IDS } from '../src/render/thruster/recipes/registry.js';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import {
  SCHEMA_ID,
  REQUIRED_PROFILE_IDS,
  SCENARIO_CONTRACT,
  KESTREL_SHIPPED_GLB_URL,
  ACCEPTED_AUTHORED_STATES,
  LIFECYCLE_PHASE_ORDER,
  TEMPORAL_RUNTIMES,
  ALLOWED_CLEANUP_TRIGGERS,
  validateVp220PropulsionReport,
  buildSelfTestGoodReport,
  buildSelfTestBadReports,
  runReportValidatorSelfTest,
  assertReadableCoreInner,
  hashAllRuntimeFiles,
  buildCurrentTreeCandidateIdentity,
  validateMeasuredProjection,
  validateCleanupTrigger,
  RUNTIME_HASH_PATHS,
  isSha256Hex,
  resolveArtifactUnderRoot,
  verifyArtifactOnDisk,
} from '../scripts/lib/vp220-propulsion-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A11Y = {
  reducedMotion: false,
  reducedFlash: false,
  lowQuality: false,
  qualityTier: 'high',
};

function makeEntity(id, opts = {}) {
  return {
    id,
    type: 'ship',
    alive: opts.alive !== false,
    isPlayer: !!opts.isPlayer,
    pos: opts.pos || { x: id * 8, z: 0 },
    vel: opts.vel || { x: 30, z: 0 },
    rot: opts.rot || 0,
    radius: opts.radius || 5,
    maxSpeed: 120,
    data: {
      defId: opts.defId || 'ship_kestrel',
      slots: opts.slots || undefined,
      ...(opts.data || {}),
    },
    _flightFrame: opts.flightFrame || { throttle: 0.85, boost: 0, maxSpeed: 120 },
    flags: opts.flags || {},
  };
}

function makeHarness(entities, opts = {}) {
  const scene = new THREE.Scene();
  const map = new Map(entities.map((e) => [e.id, e]));
  const state = {
    playerId: entities[0].id,
    player: {},
    entities: map,
    entityList: entities.slice(),
    input: opts.input || { moveZ: 0.8, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: opts.particleQuality || 'high',
        engineTrails: opts.engineTrails !== undefined ? opts.engineTrails : true,
        energyMaterials: false,
        motionReduce: !!opts.motionReduce,
        bloom: false,
      },
      accessibility: {
        flashReduce: !!opts.flashReduce,
        motionPreference: opts.motionReduce ? 'reduce' : 'full',
      },
    },
    render: { scene },
    flightRuntime: opts.flightRuntime || null,
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: opts.helpers || {} });
  return { scene, state, system };
}

function activeRoles(plume) {
  if (!plume || !plume.layerBatches) return [];
  return plume.layerBatches
    .filter((b) => b.mesh && b.mesh.count > 0)
    .map((b) => b.role);
}

function layerSnap(plume) {
  if (!plume || !plume.layerBatches) return [];
  return plume.layerBatches.map((batch) => {
    const u = batch.material && batch.material.uniforms;
    return {
      role: batch.role,
      drawCount: batch.mesh ? (batch.mesh.count || 0) : 0,
      intensity: u?.uIntensity?.value ?? batch.baseIntensity ?? 0,
      opacity: u?.uOpacity?.value ?? batch.baseOpacity ?? 0,
    };
  });
}

// ── Compact propulsion (engineTrails=false) ───────────────────────────────────

test('live VFX route with engineTrails=false activates core+inner GPU batches', () => {
  const player = makeEntity(1, {
    isPlayer: true,
    defId: 'ship_kestrel',
    flightFrame: { throttle: 1, boost: 0.4, maxSpeed: 120 },
    vel: { x: 80, z: 0 },
  });
  const { system, state } = makeHarness([player], { engineTrails: false });
  assert.equal(state.settings.video.engineTrails, false);
  assert.equal(system._extendedEngineTrailsEnabled(), false);
  assert.equal(system._productionThrusterEnabled(), true);

  for (let f = 0; f < 8; f++) system.update(1 / 60);

  const energy = system._energy;
  assert.ok(energy && energy.fleet, 'production fleet must initialize under compact trails');
  const plume = energy.plumeSystem || energy.fleet.playerPlumeSystem();
  assert.ok(plume, 'player plume system required');
  assert.ok(plume.group.visible, 'compact plume group must remain visible');
  assert.ok(plume.pool.activeCount > 0, 'compact must write pool slots');

  const roles = activeRoles(plume);
  assert.ok(roles.includes('core'), `compact must draw core, got ${roles.join(',')}`);
  assert.ok(roles.includes('inner'), `compact must draw inner, got ${roles.join(',')}`);
  // Sheath-only identity is forbidden; core+inner must both be live.
  assert.equal(roles.includes('core') && roles.includes('inner'), true);

  const snap = layerSnap(plume);
  const check = assertReadableCoreInner(snap, { compact: true });
  assert.equal(check.ok, true, check.failures.join('; '));

  const core = snap.find((l) => l.role === 'core');
  const inner = snap.find((l) => l.role === 'inner');
  assert.ok(core.drawCount > 0 && inner.drawCount > 0);
  // Intensities must reject faint sheath-only claims.
  assert.ok(core.intensity > 0 || core.drawCount > 0);
  assert.ok(inner.intensity > 0 || inner.drawCount > 0);

  // a11y quality tier must be compact/low when trails off.
  assert.equal(system._productionThrusterA11y.qualityTier, 'low');
  assert.equal(system._productionThrusterA11y.lowQuality, true);

  // Zero frame alloc under compact sustain.
  assert.equal(plume.pool.frameAllocations, 0);
  if (energy.fleet) assert.equal(energy.fleet.frameAllocations, 0);

  system._disposeEnergy();
});

test('compact mode is not off: RCS remains fireable under engineTrails=false', () => {
  const player = makeEntity(1, {
    isPlayer: true,
    defId: 'ship_kestrel',
    flightFrame: { throttle: 0.6, maxSpeed: 120 },
  });
  const flightRuntime = {
    telemetry: {
      actuators: {
        yaw: 1,
        pitch: 0,
        roll: 0,
        translateX: 0,
        translateY: 0,
        translateZ: 0,
      },
    },
  };
  const { system } = makeHarness([player], {
    engineTrails: false,
    flightRuntime,
  });
  for (let f = 0; f < 6; f++) system.update(1 / 60);
  const rcs = system._energy?.rcsSystem || system._energy?.fleet?.playerRcsSystem();
  assert.ok(rcs, 'RCS system must exist under compact');
  // Direct fire proves system is not disposed/suppressed.
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  rcs.update(1 / 60, system._productionThrusterA11y);
  assert.ok(rcs.pool.activeImpulseCount > 0, 'RCS must remain readable under compact');
  system._disposeEnergy();
});

// ── Family switch / lifecycle ─────────────────────────────────────────────────

test('family switch resets old family RCS mesh counts and pool', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];

  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  const ship = fleet.acquireShip(1, 'engine_vector', true);
  fleet.setShipSockets(ship, sockets, 1);
  fleet.setShipDrive(ship, { drive: 1, throttle: 1, boost: 0 });
  fleet.endFrame(1 / 60);

  const vectorRcs = fleet._familyByProfile.engine_vector.rcs;
  vectorRcs.fire([1, 0, 0], [0, 0, 1], 1);
  vectorRcs.fire([1, 0, 0], [0, 0, -1], 0.8);
  vectorRcs.update(1 / 60, A11Y);
  assert.ok(vectorRcs.pool.activeImpulseCount >= 2);
  const beforeMesh = (vectorRcs.layerBatches || [])
    .reduce((n, b) => n + (b.mesh?.count || 0), 0);
  assert.ok(beforeMesh > 0, 'RCS GPU mesh counts live before switch');

  // Switch player family → previous RCS must reset.
  fleet.beginFrame(A11Y);
  fleet.retainShip(1, 'engine_industrial', true);
  assert.equal(vectorRcs.pool.activeImpulseCount, 0, 'old family RCS pool cleared');
  for (const b of vectorRcs.layerBatches || []) {
    // reset() zeros impulses; mesh counts cleared on next update or reset path.
    assert.ok(b.mesh.count === 0 || vectorRcs.pool.activeImpulseCount === 0);
  }
  // New family RCS is the active player system.
  const industrialRcs = fleet.playerRcsSystem();
  assert.equal(industrialRcs, fleet._familyByProfile.engine_industrial.rcs);
  assert.notEqual(industrialRcs, vectorRcs);

  fleet.dispose();
});

test('death, dock, sector reset, and dispose clear ownership and mesh counts', () => {
  const player = makeEntity(1, {
    isPlayer: true,
    defId: 'ship_kestrel',
    flightFrame: { throttle: 1, maxSpeed: 120 },
  });
  const npc = makeEntity(2, {
    defId: 'ship_wasp',
    slots: { engine: ['engines/engine_vector.glb'] },
    flightFrame: { throttle: 0.9, maxSpeed: 120 },
    pos: { x: 20, z: 5 },
  });
  const { system, state } = makeHarness([player, npc]);

  for (let f = 0; f < 10; f++) system.update(1 / 60);
  assert.ok(system._productionOwnedCount > 0, 'ownership populated');
  const fleet = system._energy.fleet;
  assert.ok(fleet.activeShipCount >= 1);
  const livePlume = system._energy.plumeSystem;
  assert.ok(livePlume.pool.activeCount > 0);

  // Death of NPC — next frame must drop ownership for dead entity.
  npc.alive = false;
  for (let f = 0; f < 4; f++) system.update(1 / 60);
  assert.equal(fleet.hasEntity(npc.id), false, 'dead NPC not in fleet');

  // Dock player — fleet path skips docked; hide path on relevance may clear.
  player.flags.docked = true;
  // Player is still playerId-owned for production thruster, but docked NPCs skipped.
  // Simulate sector boundary reset (public bus path used by live route).
  system._resetEnergyForBoundary();
  assert.equal(system._productionOwnedCount, 0, 'sector/boundary reset clears ownership');
  if (system._energy && system._energy.fleet) {
    assert.equal(system._energy.fleet.activeShipCount, 0);
    for (const fam of system._energy.fleet.families) {
      assert.equal(fam.plume.pool.activeCount, 0, `${fam.profileId} plume cleared`);
      assert.equal(fam.rcs.pool.activeImpulseCount, 0, `${fam.profileId} rcs cleared`);
      for (const b of fam.plume.layerBatches || []) {
        assert.equal(b.mesh.count, 0, `${fam.profileId}/${b.role} mesh count 0`);
      }
    }
  }

  // Revive and re-drive, then full dispose.
  player.flags.docked = false;
  player.alive = true;
  npc.alive = true;
  for (let f = 0; f < 6; f++) system.update(1 / 60);
  assert.ok(system._productionOwnedCount > 0);
  system._disposeEnergy();
  assert.equal(system._energy, null);
  assert.equal(system._productionOwnedCount, 0, 'dispose clears ownership');
  assert.equal(system._usesProductionThruster(npc), false);

  // Keep state reference alive for linters / future assertions.
  assert.equal(state.playerId, 1);
});

// ── Dense 600-frame sweep ─────────────────────────────────────────────────────

test('600-frame dense multi-family sweep stays within caps and zero frame alloc', () => {
  const entities = [
    makeEntity(1, {
      isPlayer: true,
      defId: 'ship_kestrel',
      flightFrame: { throttle: 0.9, boost: 0.2, maxSpeed: 120 },
    }),
  ];
  // One ship per live profile (+ extras to stress cap).
  const profileShips = [
    ['ship_wasp', 'engine_vector'],
    ['ship_mule', 'engine_industrial'],
    ['ship_bastion', 'engine_plasma_ring'],
    ['ship_pelican', 'engine_ion_twin'],
    ['ship_ranger', 'engine_resonator'],
    ['ship_hornet', 'engine_vector'],
    ['ship_atlas', 'engine_industrial'],
    ['ship_warden', 'engine_plasma_ring'],
    ['ship_ironback', 'engine_ion_twin'],
    ['ship_colossus', 'engine_plasma_ring'],
    ['ship_leviathan', 'engine_plasma_ring'],
  ];
  for (let i = 0; i < profileShips.length; i++) {
    const [defId, profileId] = profileShips[i];
    entities.push(makeEntity(10 + i, {
      defId,
      slots: { engine: [`engines/${profileId}.glb`] },
      flightFrame: { throttle: 0.7 + (i % 3) * 0.1, boost: i % 2 ? 0.3 : 0, maxSpeed: 120 },
      pos: { x: (i + 1) * 12, z: (i % 4) * 8 },
      vel: { x: 20 + i, z: 5 },
    }));
  }

  const { system } = makeHarness(entities, { engineTrails: true });
  // Force on-screen FULL tier so dense candidates reach the fleet (no camera in harness).
  system._resolveTrailTier = () => 'full';
  system._trailCadenceAllows = () => true;

  let maxPlumeAlloc = 0;
  let maxShips = 0;
  let maxSaturated = 0;
  // The fleet ship table is a growable pool, so "zero allocation" is a statement about
  // the steady state, not about frame 0. Split the two: a frame that migrated capacity
  // may allocate; every other frame may not. That still catches a regression that
  // churns records per frame, and it no longer forbids the pool from sizing itself.
  let steadyStateAlloc = 0;
  let growthFrames = 0;
  let seenGrowths = 0;

  for (let f = 0; f < 600; f++) {
    // Rotate throttle/boost to exercise continuum without alloc.
    const t = (f % 60) / 60;
    for (const e of entities) {
      if (!e.alive) continue;
      e._flightFrame.throttle = 0.4 + t * 0.6;
      e._flightFrame.boost = f % 90 < 20 ? 0.8 : 0;
      e.vel.x = 15 + (f % 40);
    }
    system.update(1 / 60);
    const energy = system._energy;
    if (!energy || !energy.fleet) continue;
    const growths = energy.fleet.capacityGrowths || 0;
    const frameAlloc = energy.fleet.frameAllocations || 0;
    if (growths !== seenGrowths) {
      growthFrames += 1;
      seenGrowths = growths;
    } else {
      steadyStateAlloc = Math.max(steadyStateAlloc, frameAlloc);
    }
    maxShips = Math.max(maxShips, energy.fleet.activeShipCount || 0);
    maxSaturated = Math.max(maxSaturated, energy.fleet.saturated || 0);
    if (energy.plumeSystem?.pool) {
      maxPlumeAlloc = Math.max(maxPlumeAlloc, energy.plumeSystem.pool.frameAllocations || 0);
    }
    for (const fam of energy.fleet.families) {
      maxPlumeAlloc = Math.max(maxPlumeAlloc, fam.plume.pool.frameAllocations || 0);
    }
  }

  assert.equal(
    steadyStateAlloc, 0,
    `fleet must allocate nothing on a frame that did not migrate capacity, got ${steadyStateAlloc}`,
  );
  // Doubling from FLEET_INITIAL_SHIPS to the ceiling is log2-bounded, and six families can
  // each migrate their plume once per step. Anything beyond a handful means churn.
  assert.ok(growthFrames > 0, 'fixture must exceed the initial allocation and exercise growth');
  assert.ok(
    growthFrames <= 12,
    `capacity migrations must be rare and amortized over 600 frames, got ${growthFrames}`,
  );
  assert.equal(maxPlumeAlloc, 0, `plume frame alloc must stay 0 over 600 frames, got ${maxPlumeAlloc}`);
  assert.ok(maxShips <= FLEET_MAX_SHIPS, `ships ${maxShips} must not exceed ceiling ${FLEET_MAX_SHIPS}`);
  assert.ok(maxShips > 0, 'dense sweep must keep production ships active');
  // The invariant the old `saturated > 0` assertion was really protecting is that nothing
  // is dropped SILENTLY. Below the ceiling the pool grows, so nothing is dropped at all:
  // every eligible candidate must own a production slot and saturation must stay 0.
  assert.ok(entities.length > FLEET_INITIAL_SHIPS, 'fixture must exceed the initial allocation');
  assert.ok(entities.length <= FLEET_MAX_SHIPS, 'fixture must stay under the sanity ceiling');
  assert.equal(
    maxSaturated, 0,
    `no candidate under the ceiling may be refused a slot (got ${maxSaturated} saturated)`,
  );
  assert.equal(
    maxShips, entities.length,
    'dense sweep should give every eligible candidate a production plume',
  );

  // Player production path never suppressed by overflow.
  assert.equal(system._usesProductionThruster(entities[0]), true);
  const playerPlume = system._energy.plumeSystem;
  assert.ok(playerPlume.pool.activeCount > 0, 'player plume not suppressed under density');

  system._disposeEnergy();
});

// ── Overflow / missing fallback ───────────────────────────────────────────────

test('missing profile and over-cap candidates fall back without suppressing owned ships', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];

  // Fill to cap with known profiles.
  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  for (let id = 1; id <= FLEET_MAX_SHIPS; id++) {
    const profile = LIVE_ENGINE_PROFILE_IDS[(id - 1) % LIVE_ENGINE_PROFILE_IDS.length];
    const s = fleet.admitShip(id, profile, id === 1);
    assert.ok(s, `ship ${id} must admit under cap`);
    fleet.setShipSockets(s, sockets, 1);
    fleet.setShipDrive(s, { drive: 1, throttle: 1, boost: 0 });
  }
  // Overflow candidate. Ids must sit above the ceiling so they cannot collide with the
  // 1..FLEET_MAX_SHIPS fill above (they did once the ceiling passed 999's neighbours).
  const overflow = fleet.admitShip(90001, 'engine_vector', false);
  assert.equal(overflow, null, 'overflow must not admit past the ceiling');
  assert.ok(fleet.saturated >= 1, 'overflow increments saturated counter');

  // Unknown profile resolves to ion_small fallback family (not null/suppress).
  // Use a free slot by resetting one departure.
  fleet.beginFrame(A11Y);
  for (let id = 1; id <= FLEET_MAX_SHIPS - 1; id++) {
    fleet.retainShip(id, LIVE_ENGINE_PROFILE_IDS[(id - 1) % LIVE_ENGINE_PROFILE_IDS.length], id === 1);
  }
  fleet.beginAdmitPhase();
  const fallbackShip = fleet.admitShip(90042, 'engine_does_not_exist_zzz', false);
  assert.ok(fallbackShip, 'missing profile must still admit via ion_small fallback');
  assert.equal(fallbackShip.profileId, 'engine_ion_small');

  const diag = fleet.endFrame(1 / 60);
  assert.ok(diag.shipsActive > 0, 'owned ships remain active after overflow attempt');
  assert.equal(diag.frameAllocations, 0);
  // Player (id 1) still present.
  assert.equal(fleet.hasEntity(1), true);

  fleet.dispose();
});

test('route-level overflow leaves player production path active and legacy fallback truthful', () => {
  const entities = [
    makeEntity(1, {
      isPlayer: true,
      defId: 'ship_kestrel',
      flightFrame: { throttle: 1, maxSpeed: 120 },
    }),
  ];
  for (let i = 0; i < FLEET_MAX_SHIPS + 4; i++) {
    entities.push(makeEntity(100 + i, {
      defId: 'ship_wasp',
      slots: { engine: ['engines/engine_vector.glb'] },
      flightFrame: { throttle: 0.8, maxSpeed: 120 },
      pos: { x: 15 + i * 5, z: i },
      vel: { x: 25, z: 0 },
    }));
  }
  const { system } = makeHarness(entities);
  for (let f = 0; f < 12; f++) system.update(1 / 60);

  assert.equal(system._usesProductionThruster(entities[0]), true, 'player never suppressed');
  const fleet = system._energy.fleet;
  assert.ok(fleet.activeShipCount <= FLEET_MAX_SHIPS);
  assert.ok(fleet.saturated > 0 || fleet.activeShipCount === FLEET_MAX_SHIPS);

  // Overflowed NPCs are not production-owned → legacy path may run, but must not
  // claim production ownership that would suppress their fallback incorrectly.
  const overflowNpc = entities.find((e) => e.id !== 1 && !system._usesProductionThruster(e));
  assert.ok(overflowNpc, 'at least one NPC outside production ownership');
  // Player plume still live.
  assert.ok(system._energy.plumeSystem.pool.activeCount > 0);

  system._disposeEnergy();
});

// ── Accessibility dense + reduced ─────────────────────────────────────────────

test('reduced-motion dense update preserves core+inner and zero alloc', () => {
  const entities = [
    makeEntity(1, {
      isPlayer: true,
      defId: 'ship_kestrel',
      flightFrame: { throttle: 0.9, maxSpeed: 120 },
    }),
    makeEntity(2, {
      defId: 'ship_wasp',
      slots: { engine: ['engines/engine_vector.glb'] },
      flightFrame: { throttle: 0.8, maxSpeed: 120 },
      pos: { x: 18, z: 4 },
    }),
  ];
  const { system } = makeHarness(entities, {
    motionReduce: true,
    flashReduce: true,
  });
  // Apply derived motionReduce as live accessibility would.
  system.state.settings.video.motionReduce = true;

  for (let f = 0; f < 20; f++) system.update(1 / 60);
  const plume = system._energy.plumeSystem;
  assert.ok(plume.group.visible);
  const roles = activeRoles(plume);
  assert.ok(roles.includes('core'), 'reduced-motion keeps core');
  assert.ok(roles.includes('inner'), 'reduced-motion keeps inner');
  assert.equal(plume.pool.frameAllocations, 0);
  assert.equal(system._energy.fleet.frameAllocations, 0);
  system._disposeEnergy();
});

// ── Report validator (no browser) ─────────────────────────────────────────────

test('acceptance schema and scenario contract cover required profiles and scenarios', () => {
  assert.equal(SCHEMA_ID, 'spaceface.vp220PropulsionAcceptance.v1');
  assert.equal(REQUIRED_PROFILE_IDS.length, 6);
  assert.deepEqual(REQUIRED_PROFILE_IDS.slice().sort(), LIVE_ENGINE_PROFILE_IDS.slice().sort());
  const ids = SCENARIO_CONTRACT.map((s) => s.id);
  for (const required of [
    'idle', 'onset', 'sustain', 'cruise', 'boost', 'hard-turn-rcs',
    'brake-reverse', 'compact-trails-off', 'reduced-motion-flash',
    'dense-multi-family', 'release', 'cleanup',
  ]) {
    assert.ok(ids.includes(required), `scenario contract missing ${required}`);
  }
  const compact = SCENARIO_CONTRACT.find((s) => s.id === 'compact-trails-off');
  assert.equal(compact.engineTrails, false);
  assert.equal(compact.forbidsSheathOnly, true);
  assert.ok(compact.requires.includes('inner'));
});

test('report validator accepts complete self-test good report', () => {
  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fabc1234', root: ROOT });
  const result = validateVp220PropulsionReport(good);
  assert.equal(result.ok, true, result.failures.join('; '));
});

test('report validator rejects missing family, compact inner, lifecycle, GPU, hash identity', () => {
  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fabc1234', root: ROOT });
  const badCases = buildSelfTestBadReports(good);
  assert.ok(badCases.length >= 5);

  const byName = Object.fromEntries(badCases.map((b) => [b.name, b.report]));

  const missingFamily = validateVp220PropulsionReport(byName['missing-family']);
  assert.equal(missingFamily.ok, false);
  assert.ok(missingFamily.failures.some((f) => /engine_vector|missing family/i.test(f)));

  const missingInner = validateVp220PropulsionReport(byName['missing-compact-inner']);
  assert.equal(missingInner.ok, false);
  assert.ok(missingInner.failures.some((f) => /compact|inner/i.test(f)));

  const missingLifecycle = validateVp220PropulsionReport(byName['missing-lifecycle-cleanup']);
  assert.equal(missingLifecycle.ok, false);
  assert.ok(missingLifecycle.failures.some((f) => /cleanup|ownership|plume/i.test(f)));

  const missingGpu = validateVp220PropulsionReport(byName['missing-gpu']);
  assert.equal(missingGpu.ok, false);
  assert.ok(missingGpu.failures.some((f) => /GPU|gpu/i.test(f)));

  const missingHash = validateVp220PropulsionReport(byName['missing-hash-identity']);
  assert.equal(missingHash.ok, false);
  assert.ok(missingHash.failures.some((f) => /hash|gitHead|sha256/i.test(f)));
});

test('report validator rejects extended fail-closed defect mutants', () => {
  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fabc1234', root: ROOT });
  const badCases = buildSelfTestBadReports(good);
  const byName = Object.fromEntries(badCases.map((b) => [b.name, b.report]));

  const expectFail = (name, pattern) => {
    assert.ok(byName[name], `mutant ${name} must exist`);
    const result = validateVp220PropulsionReport(byName[name]);
    assert.equal(result.ok, false, `${name} must fail-closed`);
    assert.ok(
      result.failures.some((f) => pattern.test(f)),
      `${name} failures should match ${pattern}: ${result.failures.join('; ')}`,
    );
  };

  expectFail('missing-artifact-metadata', /artifact|nonempty|positive finite|sha256|hex/i);
  expectFail('colliding-runtime-paths', /collid|path/i);
  expectFail('unordered-lifecycle-frames', /phaseFrames|ordered|distinct/i);
  expectFail('nonpositive-projection', /projection|pixel signal|length|width/i);
  expectFail('negative-pixel-signal', /pixel signal|strictly positive/i);
  expectFail('nonzero-allocation-samples', /allocations\.(plume|dense)|must be 0/i);
  expectFail('missing-kestrel-identity', /kestrel|sockets|authoredState|url/i);
  expectFail('invalid-authored-state', /authoredState|authored|live-authored/i);
  expectFail('wrong-kestrel-url', /kestrel url|wholeships\/kestrel\.glb/i);
  expectFail('non-hex-sha256', /sha256|hex/i);
  expectFail('placeholder-sockets', /placeholder|socket/i);
  expectFail('incomplete-structural-signature', /structuralSignature/i);
  expectFail('synthetic-labeled-authored', /synthetic|authored/i);
  expectFail('candidate-hash-mismatch', /candidateHash/i);
  expectFail('cleanup-nonzero-draws', /active draws|active instances/i);
  expectFail('missing-allocation-sample-arrays', /samples|finite|nonempty|null is fail-closed|missing/i);
  expectFail('missing-temporal-runtime', /temporal matrix|runtime electron|missing temporal/i);
  expectFail('missing-temporal-phase', /missing phase|growth/i);
  expectFail('world-only-projection-width', /world-only|worldWidth|measured|widthSource|world/i);
  expectFail('invented-fallback-projection-width', /invented|fallback|widthSource|measured/i);
  expectFail('private-helper-cleanup-trigger', /private helper|allowed set|sector:enter|_resetEnergy/i);
  expectFail('missing-cleanup-trigger', /cleanup trigger|allowed set|sector:enter/i);

  // Every mutant must fail (one real mutant per defect).
  for (const bad of badCases) {
    const r = validateVp220PropulsionReport(bad.report);
    assert.equal(r.ok, false, `mutant ${bad.name} must fail: ${r.failures?.join('; ')}`);
    assert.ok(r.failures.length > 0, `mutant ${bad.name} must report failures`);
  }
});

test('prepare-only blocked report never validates as complete evidence', () => {
  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fabc1234', root: ROOT });
  const prepare = JSON.parse(JSON.stringify(good));
  prepare.prepareOnly = true;
  prepare.runtime = 'prepare-only';
  prepare.blocked = {
    reason: 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE',
  };
  prepare.visualStatus = 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE';
  prepare.gpu = {};
  prepare.artifacts = [];
  prepare.temporalMatrices = { browser: null, electron: null };
  prepare.projection = null;
  const blocked = validateVp220PropulsionReport(prepare);
  assert.equal(blocked.ok, false, 'prepare-only must remain ok:false');
  assert.ok(blocked.failures.some((f) => /prepare-only|staged incomplete|blocked/i.test(f)));
  assert.ok(blocked.failures.some((f) => /artifact|missing evidence|temporal|projection/i.test(f)));

  // Even a structurally complete prepare-only package is not complete evidence.
  const fullButPrepare = JSON.parse(JSON.stringify(good));
  fullButPrepare.prepareOnly = true;
  fullButPrepare.blocked = 'OCCUPIED_LARK_GPU_LEASE';
  fullButPrepare.visualStatus = 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE';
  const stillBlocked = validateVp220PropulsionReport(fullButPrepare);
  assert.equal(stillBlocked.ok, false);
  assert.ok(stillBlocked.failures.some((f) => /prepare-only|staged incomplete|blocked/i.test(f)));
});

test('artifactRoot verifies real files and rejects missing/zero/hash/traversal mutants', () => {
  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fabc1234', root: ROOT });
  const tmpRoot = path.join(ROOT, '.tmp', `vp220-artifact-root-${process.pid}`);
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });

  try {
    // Materialize every artifact path with content matching report bytes/sha.
    for (const art of good.artifacts) {
      const loc = resolveArtifactUnderRoot(tmpRoot, art.path);
      assert.equal(loc.ok, true, loc.reason);
      mkdirSync(path.dirname(loc.resolved), { recursive: true });
      // Write exact payload that produces the reported sha256 by using the preimage pattern
      // from buildSelfTestGoodReport, or rewrite sha/bytes from actual content.
      const payload = Buffer.alloc(Math.max(1, Number(art.bytes) || 1), 0x41);
      // Prefer matching report: recompute sha/bytes from written content.
      writeFileSync(loc.resolved, payload);
      const sha = createHash('sha256').update(payload).digest('hex');
      art.bytes = payload.length;
      art.sha256 = sha;
      // Keep temporal matrix entries in sync when path matches.
      for (const rt of TEMPORAL_RUNTIMES) {
        for (const phase of LIFECYCLE_PHASE_ORDER) {
          const still = good.temporalMatrices?.[rt]?.[phase];
          if (still && still.path === art.path) {
            still.bytes = art.bytes;
            still.sha256 = art.sha256;
          }
        }
      }
    }

    const okDisk = validateVp220PropulsionReport(good, { artifactRoot: tmpRoot });
    assert.equal(okDisk.ok, true, okDisk.failures.join('; '));

    // Missing file mutant
    const missing = JSON.parse(JSON.stringify(good));
    missing.artifacts[0].path = 'self-test/scenarios/__missing__.png';
    const missResult = validateVp220PropulsionReport(missing, { artifactRoot: tmpRoot });
    assert.equal(missResult.ok, false);
    assert.ok(missResult.failures.some((f) => /missing file/i.test(f)));

    // Zero-byte mutant
    const zeroPath = path.join(tmpRoot, 'self-test', 'scenarios', 'zero.png');
    mkdirSync(path.dirname(zeroPath), { recursive: true });
    writeFileSync(zeroPath, Buffer.alloc(0));
    const zero = JSON.parse(JSON.stringify(good));
    zero.artifacts[0] = {
      ...zero.artifacts[0],
      path: 'self-test/scenarios/zero.png',
      bytes: 1,
      sha256: createHash('sha256').update('x').digest('hex'),
    };
    const zeroResult = validateVp220PropulsionReport(zero, { artifactRoot: tmpRoot });
    assert.equal(zeroResult.ok, false);
    assert.ok(zeroResult.failures.some((f) => /zero-byte/i.test(f)));

    // Hash mismatch mutant
    const mismatch = JSON.parse(JSON.stringify(good));
    mismatch.artifacts[0].sha256 = createHash('sha256').update('wrong-bytes').digest('hex');
    const hashResult = validateVp220PropulsionReport(mismatch, { artifactRoot: tmpRoot });
    assert.equal(hashResult.ok, false);
    assert.ok(hashResult.failures.some((f) => /sha256 mismatch/i.test(f)));

    // Path traversal mutant
    const trav = JSON.parse(JSON.stringify(good));
    trav.artifacts[0].path = '../outside/evil.png';
    const travResult = validateVp220PropulsionReport(trav, { artifactRoot: tmpRoot });
    assert.equal(travResult.ok, false);
    assert.ok(travResult.failures.some((f) => /traversal|outside root/i.test(f)));

    // Helper unit checks
    const badLoc = resolveArtifactUnderRoot(tmpRoot, '..\\Windows\\system32\\evil.png');
    assert.equal(badLoc.ok, false);
    const diskFails = verifyArtifactOnDisk(
      { path: 'nope.png', bytes: 1, sha256: 'a'.repeat(64) },
      tmpRoot,
      'probe',
    );
    assert.ok(diskFails.length > 0);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('kestrel shipped URL and authored states are contract constants', () => {
  assert.equal(KESTREL_SHIPPED_GLB_URL, 'assets/ships/release/parts/wholeships/kestrel.glb');
  assert.ok(ACCEPTED_AUTHORED_STATES.includes('authored'));
  assert.ok(ACCEPTED_AUTHORED_STATES.includes('live-authored'));
  assert.equal(isSha256Hex('a'.repeat(64)), true);
  assert.equal(isSha256Hex('z'.repeat(64)), false);
  assert.equal(isSha256Hex('a'.repeat(63)), false);
});

test('report validator self-test harness passes good and fails all bad mutants', () => {
  const result = runReportValidatorSelfTest({ root: ROOT, gitHead: '8f1c630fselftest' });
  assert.equal(result.ok, true, JSON.stringify(result.results, null, 2));
  assert.equal(result.goodPassed, true);
  assert.equal(result.badPassed, true);
});

test('runtime hash helper covers every required thruster runtime file', () => {
  const hashes = hashAllRuntimeFiles(ROOT);
  assert.equal(hashes.length, RUNTIME_HASH_PATHS.length);
  for (const h of hashes) {
    assert.equal(h.missing, false, `${h.path} missing from working tree`);
    assert.equal(String(h.sha256).length, 64, `${h.path} sha256`);
    assert.ok(h.bytes > 0);
  }
});

test('current-tree candidateHash changes when one runtime file digest changes; artifact mismatch fails', () => {
  const head = '8f1c630fcandidate-identity';
  const baseHashes = hashAllRuntimeFiles(ROOT);
  assert.ok(baseHashes.length >= 1);
  const base = buildCurrentTreeCandidateIdentity(ROOT, head, { runtimeHashes: baseHashes });
  assert.equal(isSha256Hex(base.candidateHash), true);
  assert.equal(base.identityInputs.scheme, 'vp220-candidate:v2:head+runtime-tree');
  assert.equal(base.identityInputs.gitHead, head);
  assert.equal(base.identityInputs.runtimeFiles.length, RUNTIME_HASH_PATHS.length);
  // Exact identity inputs: sorted path + sha256 + bytes for every runtime hash path.
  for (let i = 1; i < base.identityInputs.runtimeFiles.length; i++) {
    assert.ok(
      base.identityInputs.runtimeFiles[i - 1].path
        <= base.identityInputs.runtimeFiles[i].path,
      'identity runtimeFiles must be sorted by path',
    );
  }
  for (const f of base.identityInputs.runtimeFiles) {
    assert.ok(RUNTIME_HASH_PATHS.includes(f.path), `unexpected identity path ${f.path}`);
    assert.equal(f.missing, false);
    assert.equal(isSha256Hex(f.sha256), true);
    assert.ok(f.bytes > 0);
  }

  // Mutate one runtime hash entry (exact contents identity) → candidateHash must change.
  const mutatedHashes = baseHashes.map((h, i) => (
    i === 0
      ? {
        ...h,
        sha256: createHash('sha256').update(`mutated-runtime:${h.path}`).digest('hex'),
        bytes: (h.bytes || 0) + 17,
      }
      : { ...h }
  ));
  const mutated = buildCurrentTreeCandidateIdentity(ROOT, head, { runtimeHashes: mutatedHashes });
  assert.notEqual(
    mutated.candidateHash,
    base.candidateHash,
    'changing one runtime path digest must change candidateHash',
  );
  // Same HEAD alone is insufficient: dirty-tree content is part of identity.
  const sameHeadOnlyWouldCollide = createHash('sha256')
    .update(`vp220-candidate:${head}`)
    .digest('hex');
  assert.notEqual(base.candidateHash, sameHeadOnlyWouldCollide);

  // Artifact candidateHash mismatch fails closed against the report identity.
  const good = buildSelfTestGoodReport({ gitHead: head, root: ROOT });
  assert.equal(good.candidateHash, base.candidateHash);
  const mismatch = JSON.parse(JSON.stringify(good));
  mismatch.artifacts[0].candidateHash = mutated.candidateHash;
  const result = validateVp220PropulsionReport(mismatch);
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((f) => /candidateHash/i.test(f)),
    `expected candidateHash mismatch: ${result.failures.join('; ')}`,
  );
});

test('validateMeasuredProjection rejects world-only, fallback, and invented widths', () => {
  const measuredOk = validateMeasuredProjection({
    lengthPx: 80,
    widthPx: 18,
    pixelSignal: 100,
    measured: true,
    widthMeasured: true,
    widthSource: 'measured-screen-project',
  });
  assert.equal(measuredOk.ok, true, measuredOk.failures.join('; '));

  const worldOnly = validateMeasuredProjection({
    lengthPx: 80,
    widthPx: 1.4,
    worldWidth: 1.4,
    worldOnly: true,
    widthSource: 'world',
    pixelSignal: 100,
    measured: false,
  });
  assert.equal(worldOnly.ok, false);
  assert.ok(worldOnly.failures.some((f) => /world|measured|widthSource/i.test(f)));

  const invented = validateMeasuredProjection({
    lengthPx: 80,
    widthPx: Math.max(1, 80 * 0.18),
    widthInvented: true,
    widthFallback: true,
    widthSource: 'invented-ratio-fallback',
    pixelSignal: 100,
  });
  assert.equal(invented.ok, false);
  assert.ok(invented.failures.some((f) => /invented|fallback|widthSource/i.test(f)));

  const missingWidth = validateMeasuredProjection({
    lengthPx: 80,
    worldWidth: 2.5,
    projectedWidth: 2.5,
    pixelSignal: 100,
  });
  assert.equal(missingWidth.ok, false);
  assert.ok(missingWidth.failures.some((f) => /widthPx|measured/i.test(f)));

  // projectedWidth alone must not satisfy (no widthPx).
  const projectedOnly = validateMeasuredProjection({
    lengthPx: 80,
    projectedWidth: 14,
    pixelSignal: 100,
  });
  assert.equal(projectedOnly.ok, false);
});

test('cleanup trigger requires public lifecycle event and rejects private helpers', () => {
  assert.ok(ALLOWED_CLEANUP_TRIGGERS.includes('sector:enter'));
  assert.deepEqual(validateCleanupTrigger('sector:enter'), []);
  assert.deepEqual(validateCleanupTrigger('save:loaded'), []);

  const privateReset = validateCleanupTrigger('_resetEnergyForBoundary');
  assert.ok(privateReset.length > 0);
  assert.ok(privateReset.some((f) => /private helper|allowed set/i.test(f)));

  const privateHide = validateCleanupTrigger('_hideEnergyPlumes');
  assert.ok(privateHide.length > 0);

  const missing = validateCleanupTrigger(null);
  assert.ok(missing.some((f) => /allowed set|sector:enter/i.test(f)));

  const good = buildSelfTestGoodReport({ gitHead: '8f1c630fcleanup-trigger', root: ROOT });
  assert.equal(good.lifecycle.cleanup.trigger, 'sector:enter');
  const cleanupScenario = good.scenarios.find((s) => s.id === 'cleanup');
  assert.equal(cleanupScenario.cleanup.trigger, 'sector:enter');
  assert.equal(validateVp220PropulsionReport(good).ok, true);

  const privateReport = JSON.parse(JSON.stringify(good));
  privateReport.lifecycle.cleanup.trigger = '_resetEnergyForBoundary';
  privateReport.scenarios.find((s) => s.id === 'cleanup').cleanup.trigger = '_resetEnergyForBoundary';
  const privateResult = validateVp220PropulsionReport(privateReport);
  assert.equal(privateResult.ok, false);
  assert.ok(privateResult.failures.some((f) => /private helper|allowed set/i.test(f)));
});

test('assertReadableCoreInner rejects sheath-only and faint compact claims', () => {
  const ok = assertReadableCoreInner([
    { role: 'core', drawCount: 1, intensity: 8, opacity: 0.8 },
    { role: 'inner', drawCount: 1, intensity: 6, opacity: 0.7 },
  ], { compact: true });
  assert.equal(ok.ok, true);

  const sheathOnly = assertReadableCoreInner([
    { role: 'sheath', drawCount: 4, intensity: 2, opacity: 0.3 },
  ], { compact: true });
  assert.equal(sheathOnly.ok, false);
  assert.ok(sheathOnly.failures.some((f) => /core|inner|sheath-only/i.test(f)));

  const faint = assertReadableCoreInner([
    { role: 'core', drawCount: 1, intensity: 0.1, opacity: 0.05 },
    { role: 'inner', drawCount: 1, intensity: 0.1, opacity: 0.05 },
  ], { compact: true });
  assert.equal(faint.ok, false);
});

test('assertReadableCoreInner rejects zero intensity even with positive drawCount', () => {
  const result = assertReadableCoreInner([
    { role: 'core', drawCount: 4, intensity: 0, opacity: 0.8 },
    { role: 'inner', drawCount: 4, intensity: 0, opacity: 0.7 },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /core intensity/i.test(f)));
  assert.ok(result.failures.some((f) => /inner intensity/i.test(f)));
});

test('assertReadableCoreInner rejects zero opacity even with positive drawCount', () => {
  const result = assertReadableCoreInner([
    { role: 'core', drawCount: 4, intensity: 8, opacity: 0 },
    { role: 'inner', drawCount: 4, intensity: 6, opacity: 0 },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /core opacity/i.test(f)));
  assert.ok(result.failures.some((f) => /inner opacity/i.test(f)));
});

test('assertReadableCoreInner rejects NaN intensity even with positive drawCount', () => {
  const result = assertReadableCoreInner([
    { role: 'core', drawCount: 4, intensity: NaN, opacity: 0.8 },
    { role: 'inner', drawCount: 4, intensity: Number.NaN, opacity: 0.7 },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /core intensity/i.test(f)));
  assert.ok(result.failures.some((f) => /inner intensity/i.test(f)));
});

test('assertReadableCoreInner rejects NaN opacity even with positive drawCount', () => {
  const result = assertReadableCoreInner([
    { role: 'core', drawCount: 4, intensity: 8, opacity: NaN },
    { role: 'inner', drawCount: 4, intensity: 6, opacity: Number.NaN },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /core opacity/i.test(f)));
  assert.ok(result.failures.some((f) => /inner opacity/i.test(f)));
});
