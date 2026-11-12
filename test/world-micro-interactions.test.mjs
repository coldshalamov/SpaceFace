// WORLD-MICRO-INTERACTIONS-001
// Living-environment micro-interactions: bounded tactical threat camera containment, asteroid
// thermal fracturing + yield shatter, and the tractor-beam gravimetric vortex.
// Deterministic module tests — no headed browser, no goldens.
//
// Contracts pinned here:
//   Camera:  the threat context channel is a gentle, heavily damped (~0.6 s half-life) viewport
//            expansion bounded to +20% max. Passive hostiles nudge +5-12%, a live attacker earns
//            +15-20% by distance, and threat + tether together never exceed the ceiling. The
//            exponential damp approaches monotonically — no overshoot, no speed-based breathing.
//   Rocks:   fracture progress is a pure, monotonic function of ore-body HP; vein patterns are
//            deterministic per id; yield splits kick chunk tumble deterministically; all of it is
//            transform-only presentation (shared/instanced materials are never mutated).
//   Vortex:  tractor pull/vortex math is pure and bounded — the spiral collapses at the scoop and
//            at the range boundary, and scale compression never inverts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTEXT_ZOOM_DAMP_HALF_LIFE_S,
  CONTEXT_ZOOM_MAX,
  createChaseCamera,
  resolveChaseComposition,
  resolveThreatZoomBias,
} from '../src/render/camera.js';
import {
  createAsteroidMotionTracker,
  resolveFractureProgress,
  resolveVeinFracturePattern,
  resolveYieldSplitPattern,
} from '../src/render/asteroidMotionPresentation.js';
import {
  createPickupMotionTracker,
  isTractorMagnetized,
  resolveFunnelMoteStream,
  resolveTractorPullFactor,
  resolveTractorScaleTarget,
  resolveTractorVortex,
  resolveTractorVortexRate,
  TRACTOR_MAGNET_RANGE_WU,
  TRACTOR_VORTEX_MAX_RADIUS_WU,
  TRACTOR_VORTEX_RANGE_WU,
} from '../src/render/pickupMotionPresentation.js';
import { createBus } from '../src/core/eventBus.js';

const DT = 1 / 60;
const FOV = 50;
const TILT = 60;
const TACTICAL_ZOOM = 72;

// ---------------------------------------------------------------------------
// Harness (mirrors test/camera-focus-separation.test.mjs)
// ---------------------------------------------------------------------------

function entity(id, x, z, radius = 6, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    team: 1,
    pos: { x, z },
    radius,
    vel: { x: 0, z: 0 },
    data: { encounter: { id: 'micro-test-hostile' } },
    ...extra,
  };
}

function stateFor(player, others = [], options = {}) {
  const entities = new Map([[player.id, player], ...others.map((o) => [o.id, o])]);
  return {
    playerId: player.id,
    mode: 'flight',
    simTime: options.simTime ?? 0,
    entities,
    entityList: [player, ...others],
    player: {
      heat: options.heat ?? 0,
      targetId: options.targetId ?? null,
      flybyFocus: {
        active: false,
        targetId: null,
        latchScale: 1,
        startedAt: 0,
        until: 0,
        cooldownUntil: 0,
        zoom: 0,
      },
      tether: {
        active: !!options.tetherActive,
        targetId: options.tetherTargetId ?? null,
      },
    },
  };
}

function fakeBody() {
  return {
    userData: {},
    children: [],
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: {
      x: 1,
      y: 1,
      z: 1,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      setScalar(v) { this.x = v; this.y = v; this.z = v; },
    },
  };
}

// ---------------------------------------------------------------------------
// Camera: bounded tactical threat containment
// ---------------------------------------------------------------------------

test('threat zoom bias is bounded and monotone: passive +5-12%, active +15-20%', () => {
  // Passive hostile: gentle nudge only.
  assert.ok(Math.abs(resolveThreatZoomBias(0, false) - 0.05) < 1e-9, 'passive base +5%');
  assert.ok(Math.abs(resolveThreatZoomBias(600, false) - 0.12) < 1e-9, 'passive saturates +12%');
  assert.ok(Math.abs(resolveThreatZoomBias(10000, false) - 0.12) < 1e-9, 'passive clamps at range');
  // Active attacker: earns the full containment envelope.
  assert.ok(Math.abs(resolveThreatZoomBias(0, true) - 0.15) < 1e-9, 'active base +15%');
  assert.ok(Math.abs(resolveThreatZoomBias(600, true) - 0.20) < 1e-9, 'active saturates +20%');
  assert.ok(Math.abs(resolveThreatZoomBias(10000, true) - 0.20) < 1e-9, 'active clamps at range');
  // Monotonic non-decreasing in distance, never above the hard ceiling.
  for (const active of [false, true]) {
    let prev = -1;
    for (let d = 0; d <= 1200; d += 25) {
      const b = resolveThreatZoomBias(d, active);
      assert.ok(b >= prev - 1e-12, `bias monotone at ${d} wu (active=${active})`);
      assert.ok(b <= CONTEXT_ZOOM_MAX + 1e-12, `bias under ceiling at ${d} wu (active=${active})`);
      prev = b;
    }
  }
  // NaN-safe.
  assert.ok(Number.isFinite(resolveThreatZoomBias(NaN, true)), 'NaN distance fails closed');
  assert.ok(CONTEXT_ZOOM_MAX <= 0.20 + 1e-12, 'containment ceiling is +20% max');
});

test('composition threat + tether stack is capped at the containment ceiling', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const rock = {
    id: 60, type: 'asteroid', alive: true, pos: { x: 120, z: 0 }, radius: 14, hull: 200,
  };
  // Far-edge passive hostile (inside the 600 wu compose range): near-worst-case passive bias,
  // plus tether on top.
  const hostile = entity(2, 550, 0, 8, { team: 1 });
  const state = stateFor(player, [rock, hostile], { tetherActive: true, tetherTargetId: rock.id });
  const comp = resolveChaseComposition(state, player, { x: 0, z: 0 });
  assert.ok(comp.zoomBias > 0.05, 'passive threat + tether still widens');
  assert.ok(comp.zoomBias <= CONTEXT_ZOOM_MAX + 1e-9,
    `stacked bias ${comp.zoomBias} must respect the +20% ceiling`);

  // Active attacker close in: full containment, still capped.
  const attacker = entity(3, 150, 0, 8, {
    team: 1,
    data: { combat: { targetId: player.id, lockTarget: player.id } },
  });
  const combat = resolveChaseComposition(stateFor(player, [attacker]), player, { x: 0, z: 0 });
  assert.ok(combat.zoomBias >= 0.15 - 1e-9, 'active attacker earns the containment envelope');
  assert.ok(combat.zoomBias <= CONTEXT_ZOOM_MAX + 1e-9, 'active containment stays bounded');

  // No threats, no tether: perfectly still frame.
  const calm = resolveChaseComposition(stateFor(player, []), player, { x: 0, z: 0 });
  assert.equal(calm.zoomBias, 0, 'empty space never breathes');
});

test('threat containment damping: ~0.6 s half-life, monotonic approach, bounded settle', () => {
  assert.ok(CONTEXT_ZOOM_DAMP_HALF_LIFE_S >= 0.4 && CONTEXT_ZOOM_DAMP_HALF_LIFE_S <= 0.9,
    'containment stays heavily damped (~0.6 s half-life)');

  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = entity(1, 0, 0, 7, {
    team: 0, type: 'ship', vel: { x: 0, z: 0 }, maxSpeed: 120,
  });
  const state = stateFor(player, []);
  state.settings = { video: { fov: FOV, motionReduce: false } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };
  const zoomOf = (camera) => Math.hypot(
    camera.obj.position.x - state.camera.focus.x,
    camera.obj.position.y,
    camera.obj.position.z - state.camera.focus.z,
  );

  // Settle the empty-space frame first: snap seeds the dynamic zoom at the authored tactical
  // distance while the eased target sits at the speed-framed rest distance, so measuring from
  // snap would mix that settle-in transient into the containment approach this test pins.
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  for (let i = 0; i < 240; i++) cam.follow(DT);
  const baseZoom = zoomOf(cam);

  // A hostile appears mid-flight at the far edge of the compose range: the widened frame must
  // GLIDE open under the 0.6 s damp — never snap, never overshoot. A passive contact carries no
  // minZoom/group-fit floor, so the measured widening is purely the damped threat bias channel.
  const hostile = entity(2, 550, 0, 8, { team: 1 });
  state.entities.set(hostile.id, hostile);
  state.entityList.push(hostile);
  const samples = [];
  for (let i = 0; i < 240; i++) {
    cam.follow(DT);
    if ((i + 1) % 12 === 0) samples.push(zoomOf(cam) / baseZoom);
  }
  const settled = samples[samples.length - 1];

  assert.ok(settled > 1.03, `containment visibly widens (settled ratio ${settled.toFixed(3)})`);
  assert.ok(settled <= 1.20 + 0.02,
    `settled widening ${settled.toFixed(3)} respects the +20% containment bound`);
  // Exponential damp: non-decreasing approach, never overshooting the settle point.
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1] - 1e-6,
      `approach is monotonic (sample ${i}: ${samples[i - 1]} -> ${samples[i]})`);
  }
  // Half-life: at ~0.6 s (sample idx 2 = 0.6 s) at least a third of the widening has arrived —
  // snappy enough to track a fight, damped enough to never pulse.
  const at06 = samples[2] - 1;
  const finalDelta = settled - 1;
  assert.ok(at06 > finalDelta * 0.25 && at06 < finalDelta * 0.9,
    `0.6 s progress ${(at06 / finalDelta).toFixed(2)} reads as a damped half-life approach`);
});

// ---------------------------------------------------------------------------
// Asteroid thermal fracturing + yield shatter
// ---------------------------------------------------------------------------

test('fracture progress is pure, bounded, and monotone in ore depletion', () => {
  assert.equal(resolveFractureProgress(100, 100), 0, 'untouched rock has no fracture');
  assert.equal(resolveFractureProgress(0, 100), 1, 'depleted rock is fully fractured');
  assert.ok(Math.abs(resolveFractureProgress(40, 100) - 0.6) < 1e-9, 'linear depletion');
  assert.equal(resolveFractureProgress(-5, 100), 1, 'overkill clamps to 1');
  assert.equal(resolveFractureProgress(150, 100), 0, 'over-full clamps to 0');
  for (const [hp, max] of [[NaN, 100], [50, NaN], [50, 0], [50, -10], [undefined, undefined]]) {
    assert.equal(resolveFractureProgress(hp, max), 0, `invalid HP (${hp}/${max}) fails closed`);
  }
  let prev = -1;
  for (let hp = 100; hp >= 0; hp -= 5) {
    const f = resolveFractureProgress(hp, 100);
    assert.ok(f >= prev - 1e-12, 'monotone non-decreasing as HP falls');
    prev = f;
  }
});

test('vein fracture pattern is deterministic, bounded, and opens with fracture', () => {
  const a = resolveVeinFracturePattern('rock-7', 0.5);
  const b = resolveVeinFracturePattern('rock-7', 0.5);
  assert.deepEqual(
    a.veins.map((v) => [v.angle, v.open]),
    b.veins.map((v) => [v.angle, v.open]),
    'same id + fracture gives the identical pattern',
  );
  assert.equal(a.axisAngle, b.axisAngle, 'crack axis is stable per id');

  for (const v of a.veins) {
    assert.ok(v.angle >= 0 && v.angle < Math.PI * 2 + 1e-9, 'vein angle in [0, 2π)');
    assert.ok(v.open >= 0 && v.open <= 1, 'vein openness bounded');
  }
  // Staggered opening: every vein's openness is monotone non-decreasing in fracture.
  for (let i = 0; i < a.veins.length; i++) {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.1) {
      const open = resolveVeinFracturePattern('rock-7', f).veins[i].open;
      assert.ok(open >= prev - 1e-12, `vein ${i} opens monotonically`);
      prev = open;
    }
  }
  // Caller-owned scratch is reused (zero-allocation hot path).
  const scratch = { axisAngle: 0, swell: 0, veins: [{ angle: 0, open: 0 }, { angle: 0, open: 0 }, { angle: 0, open: 0 }] };
  const reused = resolveVeinFracturePattern('rock-9', 0.3, scratch);
  assert.equal(reused, scratch, 'out-param is filled, not reallocated');
  assert.ok(scratch.veins.some((v) => v.open >= 0), 'scratch veins populated');
});

test('yield split pattern is deterministic and bounded', () => {
  const a = resolveYieldSplitPattern('parent-1', 'chunk-1');
  const b = resolveYieldSplitPattern('parent-1', 'chunk-1');
  assert.deepEqual(a, b, 'same calving gives the same kick');
  for (const v of [a.spinX, a.spinY, a.spinZ]) {
    assert.ok(Number.isFinite(v) && Math.abs(v) <= 1.1, `kick component ${v} bounded`);
  }
  assert.ok(a.wobble >= 0.08 && a.wobble <= 0.20 + 1e-9, 'wobble seed bounded');
  const other = resolveYieldSplitPattern('parent-1', 'chunk-2');
  assert.notDeepEqual(a, other, 'different chunks shatter differently');
});

test('tracker: mining events drive agitation, fracture is monotonic, transforms stay sane', () => {
  const bus = createBus();
  const tracker = createAsteroidMotionTracker();
  tracker.bindEvents(bus);

  const rock = {
    id: 'ast-1',
    type: 'asteroid',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 12,
    data: { oreHP: 100, oreHPMax: 100 },
  };
  const mesh = fakeBody();

  // Dead wiring fixed: mining:start (not the never-emitted mining:beamContact) drives agitation.
  bus.emit('mining:start', { minerId: 'player', targetId: 'ast-1', verb: 'extract' });
  for (let i = 0; i < 30; i++) tracker.updateAsteroidMotion(rock, mesh, i * DT, DT);
  assert.equal(tracker.getFracture('ast-1'), 0, 'full-HP rock shows no fracture');
  const agitatedJitter = Math.hypot(mesh.position.x, mesh.position.z);
  assert.ok(agitatedJitter > 0, 'mined rock visibly trembles under the beam');

  // Deplete the ore body: fracture rises and never falls, even if HP later reads higher.
  rock.data.oreHP = 40;
  tracker.updateAsteroidMotion(rock, mesh, 1.0, DT);
  assert.ok(Math.abs(tracker.getFracture('ast-1') - 0.6) < 1e-9, 'fracture tracks ore depletion');
  rock.data.oreHP = 80;
  tracker.updateAsteroidMotion(rock, mesh, 1.1, DT);
  assert.ok(Math.abs(tracker.getFracture('ast-1') - 0.6) < 1e-9, 'fracture never heals');

  // Strain swell stays within the 2.5% transform envelope and never touches materials.
  for (let i = 0; i < 30; i++) tracker.updateAsteroidMotion(rock, mesh, 2 + i * DT, DT);
  assert.ok(mesh.scale.x >= 0.97 && mesh.scale.x <= 1.03, `swell x ${mesh.scale.x} bounded`);
  assert.ok(mesh.scale.z >= 0.97 && mesh.scale.z <= 1.03, `swell z ${mesh.scale.z} bounded`);
  assert.equal(mesh.scale.y, 1, 'no vertical strain');
  for (const v of [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z, mesh.position.x, mesh.position.z]) {
    assert.ok(Number.isFinite(v), 'transforms stay finite');
  }

  // Stop mining: agitation winds down, fracture persists.
  bus.emit('mining:stop', {});
  for (let i = 0; i < 120; i++) tracker.updateAsteroidMotion(rock, mesh, 4 + i * DT, DT);
  assert.ok(Math.hypot(mesh.position.x, mesh.position.z) < agitatedJitter + 1e-9,
    'released rock calms down');
  assert.ok(Math.abs(tracker.getFracture('ast-1') - 0.6) < 1e-9, 'fracture persists after release');

  // Yield shatter: chunk calving seeds a deterministic tumble kick through the bus.
  bus.emit('asteroid:chunked', { parentId: 'ast-1', chunkId: 'chunk-1', minerId: 'player' });
  const chunk = { id: 'chunk-1', type: 'asteroid', alive: true, pos: { x: 4, z: 1 }, radius: 5, data: {} };
  const chunkMesh = fakeBody();
  const rotBefore = { ...chunkMesh.rotation };
  for (let i = 0; i < 60; i++) tracker.updateAsteroidMotion(chunk, chunkMesh, 6 + i * DT, DT);
  const turned = Math.abs(chunkMesh.rotation.x - rotBefore.x)
    + Math.abs(chunkMesh.rotation.y - rotBefore.y)
    + Math.abs(chunkMesh.rotation.z - rotBefore.z);
  assert.ok(turned > 0.05, 'fresh chunk tumbles from its shatter kick');
  for (const v of [chunkMesh.rotation.x, chunkMesh.rotation.y, chunkMesh.rotation.z]) {
    assert.ok(Number.isFinite(v), 'chunk transforms stay finite');
  }

  tracker.unbindEvents();
  tracker.prune(new Set());
});

// ---------------------------------------------------------------------------
// Tractor-beam gravimetric vortex
// ---------------------------------------------------------------------------

test('tractor pull factor is bounded and zero outside magnet range', () => {
  assert.equal(resolveTractorPullFactor(TRACTOR_MAGNET_RANGE_WU), 0, 'no pull at range edge');
  assert.equal(resolveTractorPullFactor(TRACTOR_MAGNET_RANGE_WU * 3), 0, 'no pull far out');
  assert.ok(Math.abs(resolveTractorPullFactor(TRACTOR_MAGNET_RANGE_WU / 2) - 0.5) < 1e-9,
    'linear pull midpoint');
  assert.equal(resolveTractorPullFactor(0), 1, 'full pull at the scoop');
  assert.equal(resolveTractorPullFactor(NaN), 0, 'NaN fails closed');
  assert.equal(isTractorMagnetized(0.05), false, 'whisper of pull is not magnetized');
  assert.equal(isTractorMagnetized(0.5), true, 'firm pull is magnetized');
});

test('vortex spiral collapses at the scoop and at the range boundary', () => {
  const out = { radius: 0, x: 0, z: 0 };
  // Outside the vortex range: no offset at all.
  const far = resolveTractorVortex(TRACTOR_VORTEX_RANGE_WU + 50, 1.2, out);
  assert.equal(far, out, 'out-param reused');
  assert.equal(out.radius, 0, 'no vortex outside its range');
  assert.equal(out.x, 0);
  assert.equal(out.z, 0);

  // Mid-range: offset magnitude equals the authored radius, bounded by the max.
  const mid = resolveTractorVortex(100, 0.7);
  assert.ok(mid.radius > 0 && mid.radius <= TRACTOR_VORTEX_MAX_RADIUS_WU + 1e-9,
    `mid-range radius ${mid.radius} bounded`);
  assert.ok(Math.abs(Math.hypot(mid.x, mid.z) - mid.radius) < 1e-9, 'offset lies on the spiral');

  // At the scoop mouth the spiral closes — the drop compresses into the intake.
  const near = resolveTractorVortex(10, 0.7);
  assert.ok(near.radius < 0.2, `scoop radius ${near.radius} nearly closed`);
  assert.ok(near.radius < mid.radius, 'spiral tightens inward');

  // Every radius in between stays under the hard cap.
  for (let d = 1; d < TRACTOR_VORTEX_RANGE_WU; d += 7) {
    const v = resolveTractorVortex(d, 2.3);
    assert.ok(v.radius <= TRACTOR_VORTEX_MAX_RADIUS_WU + 1e-9, `radius cap at ${d} wu`);
  }
});

test('vortex spin rate and scoop compression are monotone and bounded', () => {
  assert.equal(resolveTractorVortexRate(0), 8, 'base spiral rate');
  assert.equal(resolveTractorVortexRate(1), 20, 'full-pull spiral rate');
  assert.ok(resolveTractorVortexRate(0.5) > 8 && resolveTractorVortexRate(0.5) < 20, 'mid rate');
  assert.equal(resolveTractorVortexRate(NaN), 8, 'NaN pull fails to base rate');

  assert.equal(resolveTractorScaleTarget(40), 1, 'no compression outside the scoop');
  assert.equal(resolveTractorScaleTarget(25), 1, 'compression starts at 25 wu');
  assert.ok(Math.abs(resolveTractorScaleTarget(12.5) - 0.5) < 1e-9, 'linear compression');
  assert.equal(resolveTractorScaleTarget(0), 0.15, 'compression floor at the scoop mouth');
});

test('funnel mote stream is deterministic and bounded', () => {
  const a = resolveFunnelMoteStream('drop-1', 10.0);
  const b = resolveFunnelMoteStream('drop-1', 10.0);
  assert.deepEqual(a, b, 'same seed + time gives the same mote');
  assert.ok(a.cycle >= 0 && a.cycle < 1, 'cycle bounded to [0, 1)');
  assert.ok(Number.isFinite(a.angle), 'angle finite');
  const later = resolveFunnelMoteStream('drop-1', 10.5);
  assert.notEqual(later.cycle, a.cycle, 'motes advance with sim time');
  const other = resolveFunnelMoteStream('drop-2', 10.0);
  assert.notDeepEqual(other, a, 'different drops stream differently');
  const scratch = { cycle: 0, angle: 0 };
  assert.equal(resolveFunnelMoteStream('drop-1', 10.0, scratch), scratch, 'out-param reused');
});

test('pickup motion: vortex offset bounded, calm beyond range, compresses at the scoop', () => {
  const tracker = createPickupMotionTracker();
  const player = { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  // Far pickup: no magnetism, no vortex offset, just tumble + bob.
  const farDrop = { id: 'far', type: 'pickup', pos: { x: 500, z: 0 }, data: {} };
  const farMesh = fakeBody();
  for (let i = 0; i < 30; i++) tracker.updatePickupMotion(farDrop, farMesh, i * DT, DT, player);
  assert.equal(farMesh.position.x, 0, 'distant drop never vortexes');
  assert.equal(farMesh.position.z, 0, 'distant drop never vortexes');

  // Magnetized pickup: spiral offset bounded by the vortex radius cap.
  const nearDrop = { id: 'near', type: 'pickup', pos: { x: 100, z: 0 }, data: {} };
  const nearMesh = fakeBody();
  for (let i = 0; i < 60; i++) {
    tracker.updatePickupMotion(nearDrop, nearMesh, 1 + i * DT, DT, player);
    const r = Math.hypot(nearMesh.position.x, nearMesh.position.z);
    assert.ok(r <= TRACTOR_VORTEX_MAX_RADIUS_WU + 1e-9, `vortex offset ${r} bounded`);
  }

  // At the scoop mouth the mesh compresses toward the intake scale floor.
  const scoopDrop = { id: 'scoop', type: 'pickup', pos: { x: 10, z: 0 }, data: {} };
  const scoopMesh = fakeBody();
  for (let i = 0; i < 120; i++) tracker.updatePickupMotion(scoopDrop, scoopMesh, 3 + i * DT, DT, player);
  assert.ok(scoopMesh.scale.x < 0.55 && scoopMesh.scale.x >= 0.14,
    `scoop compression ${scoopMesh.scale.x} eases toward the 0.4 target without inverting`);

  // Reduced motion: no tumble, no vortex — transforms stay put except compression.
  const calmDrop = { id: 'calm', type: 'pickup', pos: { x: 100, z: 0 }, data: {} };
  const calmMesh = fakeBody();
  for (let i = 0; i < 30; i++) {
    tracker.updatePickupMotion(calmDrop, calmMesh, 6 + i * DT, DT, player, { motionReduce: true });
  }
  assert.equal(calmMesh.position.x, 0, 'reduced motion kills the vortex');
  assert.equal(calmMesh.position.y, 0, 'reduced motion kills the bob');

  tracker.prune(new Set());
});
