// CAMERA-FOCUS-SEPARATION-GROK-001
// Separation between ordinary (mining/asteroid/non-hostile) tether camera and combat Flyby Focus.
// Deterministic module tests — no headed browser, no goldens.
//
// 2026-07-27 (Lane 4): the separation got one step sharper. A hostile Flyby Focus lease used to
// switch the director into FOCUS_PAIR for its authored three seconds; that involuntary pan-to-
// midpoint-and-back plus zoom pump, twice per flyby on top of 50% slow time, was the nausea source
// and fought the 60-degree top-down readability this camera exists for. Focus is now a GAMEPLAY
// lease only.
//
// The seven cases below that asserted FOCUS_PAIR under a hostile lease are re-expressed, not
// relaxed. Each keeps its original geometric claim by driving it through TETHER_PAIR — the pair
// mode a hostile contact can still legitimately reach, and the same composition code — and gains a
// positive statement of the removal: under a live lease the director output must be identical to
// the same frame with no lease at all. FOCUS_PAIR survives only for the explicitly flagged
// onboarding trainer, which is still asserted in both directions below.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  CAMERA_DIRECTOR_EASE_S,
  CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
  CAMERA_DIRECTOR_FOCUS_SAFE_NDC,
  CAMERA_DIRECTOR_GATE_MAX_ZOOM,
  CAMERA_DIRECTOR_GATE_SAFE_NDC,
  CAMERA_DIRECTOR_MAX_ZOOM,
  CAMERA_DIRECTOR_MIN_ZOOM,
  CAMERA_DIRECTOR_SAFE_NDC,
  CameraDirectorMode,
  createCameraDirector,
  resolveGateApproachTarget,
  resolveGateVisualMetrics,
} from '../src/render/cameraDirector.js';
import {
  clampFocusToPlayerSafeRect,
  COMPOSITION_ZOOM_MAX,
  createChaseCamera,
  resolveCombatCompositionZoomCap,
  resolveChaseComposition,
} from '../src/render/camera.js';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;
const TACTICAL_ZOOM = 72;

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
    data: { encounter: { id: 'camera-test-hostile' } },
    ...extra,
  };
}

function view(overrides = {}) {
  return {
    followX: 0,
    followZ: 0,
    followZoom: TACTICAL_ZOOM,
    fov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
    ...overrides,
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
        active: !!options.focusActive,
        targetId: options.focusTargetId ?? null,
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

function settle(director, seconds, state, player, cameraView = view()) {
  let frame = null;
  const steps = Math.max(1, Math.ceil(seconds / DT));
  for (let i = 0; i < steps; i++) {
    frame = director.step(DT, state, player, cameraView);
  }
  return frame;
}

function projectedNdc(item, frame) {
  const tilt = TILT * Math.PI / 180;
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const dx = item.pos.x - frame.focusX;
  const dz = item.pos.z - frame.focusZ;
  const nearestDepth = frame.zoom - (Math.cos(tilt) * Math.abs(dz) + item.radius);
  return {
    x: (Math.abs(dx) + item.radius) / (nearestDepth * tanHalf * ASPECT),
    y: (Math.sin(tilt) * Math.abs(dz) + item.radius) / (nearestDepth * tanHalf),
  };
}

function assertInFocusMargin(item, frame, safeNdc, label) {
  const b = projectedNdc(item, frame);
  assert.ok(b.x <= safeNdc + 1e-6, `${label} horizontal NDC ${b.x} must be <= ${safeNdc}`);
  assert.ok(b.y <= safeNdc + 1e-6, `${label} vertical NDC ${b.y} must be <= ${safeNdc}`);
}

function perspectiveCameraForFocus(focus, zoom, aspect = ASPECT) {
  const tilt = TILT * Math.PI / 180;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 1, 14000);
  camera.position.set(focus.x, Math.sin(tilt) * zoom, focus.z - Math.cos(tilt) * zoom);
  camera.lookAt(focus.x, 0, focus.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function projectionSamples(item, origin = { x: 0, z: 0 }) {
  const x = item.pos.x - origin.x;
  const z = item.pos.z - origin.z;
  const radius = Math.max(0, item.radius || 0);
  return [
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x - radius, 0, z),
    new THREE.Vector3(x + radius, 0, z),
    new THREE.Vector3(x, 0, z - radius),
    new THREE.Vector3(x, 0, z + radius),
  ];
}

function assertProjectedVisible(camera, item, label, origin = { x: 0, z: 0 }) {
  for (const point of projectionSamples(item, origin)) {
    const ndc = point.project(camera);
    assert.ok(Math.abs(ndc.x) <= 1 + 1e-6, `${label} projected x ${ndc.x} must stay on screen`);
    assert.ok(Math.abs(ndc.y) <= 1 + 1e-6, `${label} projected y ${ndc.y} must stay on screen`);
    assert.ok(ndc.z >= -1 - 1e-6 && ndc.z <= 1 + 1e-6, `${label} projected z ${ndc.z} must stay in clip`);
  }
}

function projectedPlayerWidthFractionAtWorstSafeFocus(radius, zoom, aspect = ASPECT) {
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const focus = { x: 0, z: -Math.max(22, 0.46 * tanHalf * 0.72 * zoom) };
  const camera = perspectiveCameraForFocus(focus, zoom, aspect);
  const left = new THREE.Vector3(-radius, 0, 0).project(camera);
  const right = new THREE.Vector3(radius, 0, 0).project(camera);
  return Math.abs(right.x - left.x) * 0.5;
}

function countedMapValues(state) {
  const values = state.entities.values.bind(state.entities);
  let visits = 0;
  state.entities.values = function* countedValues() {
    for (const item of values()) {
      visits++;
      yield item;
    }
  };
  return () => visits;
}

function countedShipLikeIndex(state, candidates) {
  let visits = 0;
  const shipLike = [...candidates];
  shipLike[Symbol.iterator] = function* countedValues() {
    const values = Array.prototype.values.call(this);
    for (const item of values) {
      visits++;
      yield item;
    }
  };
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    shipLike,
  };
  state.entities.values = () => {
    throw new Error('ready camera shipLike index must bypass the full entity map');
  };
  return () => visits;
}

function irrelevantCameraEntities(count, startId = 10_000) {
  const types = ['asteroid', 'projectile', 'station', 'pickup', 'fx'];
  return Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    type: types[index % types.length],
    alive: true,
    hull: 100,
    team: 1,
    pos: { x: 800 + index, z: -700 - index },
    radius: 4,
  }));
}

test('ordinary chase composition visits only the ready stable ship-like index', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(2, 140, 25, 9, {
    team: 1,
    data: { combat: { targetId: player.id, lockTarget: player.id } },
  });
  const irrelevant = irrelevantCameraEntities(1_000);
  const baseline = stateFor(player, [hostile, ...irrelevant]);
  const indexed = stateFor(player, [hostile, ...irrelevant]);
  const baselineVisits = countedMapValues(baseline);
  const indexedVisits = countedShipLikeIndex(indexed, [player, hostile]);

  const expected = resolveChaseComposition(baseline, player, { x: 0, z: 0 });
  const actual = resolveChaseComposition(indexed, player, { x: 0, z: 0 });
  assert.deepEqual(actual, expected, 'candidate narrowing preserves exact threat choice and composition');
  assert.equal(baselineVisits(), 1_002, 'legacy source visits player, hostile, and every irrelevant root');
  assert.equal(indexedVisits(), 2, 'ordinary frame visits only the player and hostile ship-like roots');

  const unready = stateFor(player, [hostile]);
  unready.entityIndex = { __spacefaceEntityIndexV1: true, ready: false, shipLike: [player] };
  const fallbackVisits = countedMapValues(unready);
  assert.equal(resolveChaseComposition(unready, player, { x: 0, z: 0 }).hasActiveAttacker, true,
    'boot/rebuild uses the complete map instead of a stale unready index');
  assert.equal(fallbackVisits(), 2);
});

test('indexed chase preserves Map insertion order for an exact-distance hostile tie after rebuild', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const mapFirst = entity(2, -120, 0, 9, {
    team: 1,
    data: { combat: { targetId: player.id } },
  });
  const rebuiltFirst = entity(3, 120, 0, 9, {
    team: 1,
    data: { combat: { targetId: player.id } },
  });
  const tiedFormation = Array.from({ length: 24 }, (_, index) => entity(100 + index, 0, 120, 9, {
    team: 1,
    data: { combat: { targetId: player.id } },
  }));
  const mapOrder = [mapFirst, rebuiltFirst, ...tiedFormation];
  const baseline = stateFor(player, mapOrder);
  const rebuilt = stateFor(player, mapOrder);
  rebuilt.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    // A direct non-ship append can force reconcile from swap-removed entityList order without
    // changing the legacy Map order. Model the resulting reversed equal-distance candidates.
    shipLike: [player, ...tiedFormation.toReversed(), rebuiltFirst, mapFirst],
  };

  const expected = resolveChaseComposition(baseline, player, { x: 0, z: 0 });
  const tieMapVisits = countedMapValues(rebuilt);
  const actual = resolveChaseComposition(rebuilt, player, { x: 0, z: 0 });
  assert.deepEqual(actual, expected, 'exact ties retain the legacy first Map-inserted hostile');
  // Group fit owns the composed focus once a second attacker exists (B3b); the tie-break contract
  // survives as which threat identity the composition names, not the frame side it leans toward.
  assert.equal(actual.composedThreatId, mapFirst.id,
    'the Map-first hostile remains the composed threat of the frame');
  assert.equal(tieMapVisits(), 2,
    'the whole tied formation resolves in one Map pass ending at the first hostile');
});

test('pair director threat context visits only ship-like roots without changing framing', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const pairHostile = entity(2, 125, 0, 10, { team: 1 });
  const crossingThreat = entity(3, -70, 20, 8, { team: 1 });
  const irrelevant = irrelevantCameraEntities(750, 20_000);
  const options = { tetherActive: true, tetherTargetId: pairHostile.id };
  const baseline = stateFor(player, [pairHostile, crossingThreat, ...irrelevant], options);
  const indexed = stateFor(player, [pairHostile, crossingThreat, ...irrelevant], options);
  const baselineVisits = countedMapValues(baseline);
  const indexedVisits = countedShipLikeIndex(indexed, [player, pairHostile, crossingThreat]);

  const expectedDirector = createCameraDirector();
  expectedDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const expected = { ...settle(expectedDirector, 0.5, baseline, player) };
  const actualDirector = createCameraDirector();
  actualDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const actual = { ...settle(actualDirector, 0.5, indexed, player) };

  assert.deepEqual(actual, expected, 'candidate narrowing preserves exact pair/threat zoom and pose');
  assert.equal(actual.mode, CameraDirectorMode.TETHER_PAIR);
  assert.ok(baselineVisits() > indexedVisits() * 200,
    `irrelevant-root visits fall from ${baselineVisits()} to ${indexedVisits()} at identical framing`);

  const unready = stateFor(player, [pairHostile, crossingThreat], options);
  unready.entityIndex = { __spacefaceEntityIndexV1: true, ready: false, shipLike: [player] };
  const fallbackDirector = createCameraDirector();
  fallbackDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const fallback = { ...settle(fallbackDirector, 0.5, unready, player) };
  const fallbackBaselineDirector = createCameraDirector();
  fallbackBaselineDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const fallbackBaseline = { ...settle(
    fallbackBaselineDirector,
    0.5,
    stateFor(player, [pairHostile, crossingThreat], options),
    player,
  ) };
  assert.deepEqual(fallback, fallbackBaseline,
    'pair framing falls back to the full map while the stable index is rebuilding');
});

// ---------------------------------------------------------------------------
// RED: asteroid / non-hostile tether must not take combat pair framing
// ---------------------------------------------------------------------------

test('asteroid mining tether does not enter combat TETHER_PAIR or FOCUS_PAIR', () => {
  const player = entity(1, 0, 0, 7, { team: 0, type: 'ship' });
  const rock = {
    id: 50,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: 0 },
    radius: 16,
    hull: 200,
  };
  const state = stateFor(player, [rock], {
    tetherActive: true,
    tetherTargetId: rock.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.notEqual(frame.mode, CameraDirectorMode.TETHER_PAIR,
    'asteroid tether must not request combat TETHER_PAIR framing');
  assert.notEqual(frame.mode, CameraDirectorMode.FOCUS_PAIR,
    'asteroid tether must not request combat FOCUS_PAIR');
  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'ordinary mining tether stays on neutral FOLLOW');
  assert.equal(frame.targetId, null, 'ordinary tether does not claim a combat pair target');
});

test('asteroid mining tether never zooms closer than normal tactical view', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const rock = {
    id: 51,
    type: 'asteroid',
    alive: true,
    pos: { x: 36, z: 8 },
    radius: 14,
  };
  const state = stateFor(player, [rock], {
    tetherActive: true,
    tetherTargetId: rock.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player, view({ followZoom: TACTICAL_ZOOM }));

  assert.ok(frame.zoom + 1e-9 >= TACTICAL_ZOOM,
    `mining tether zoom ${frame.zoom} must not go closer than tactical ${TACTICAL_ZOOM}`);
  assert.ok(frame.zoom >= CAMERA_DIRECTOR_MIN_ZOOM, 'zoom remains legal');
});

test('stale Focus lease on a mining tether fails closed and keeps threat-aware FOLLOW', () => {
  const player = entity(1, 0, 0, 7, { team: 0, type: 'ship' });
  const rock = {
    id: 52,
    type: 'asteroid',
    alive: true,
    pos: { x: 38, z: 6 },
    radius: 15,
    hull: 200,
  };
  const nearbyAttacker = entity(53, -180, 30, 8, {
    team: 1,
    vel: { x: 90, z: -10 },
    data: { encounter: { id: 'camera-regression-hostile' } },
  });
  const state = stateFor(player, [rock, nearbyAttacker], {
    focusActive: true,
    focusTargetId: rock.id,
    tetherActive: true,
    tetherTargetId: rock.id,
    targetId: rock.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player, view({ followZoom: TACTICAL_ZOOM }));
  const chase = resolveChaseComposition(state, player, { x: 0, z: 0 });

  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'invalid asteroid Focus cannot bypass the mining-tether FOLLOW contract');
  assert.equal(frame.targetId, null, 'invalid Focus target never owns camera pair state');
  assert.ok(frame.zoom + 1e-9 >= TACTICAL_ZOOM,
    `mining view ${frame.zoom} must not collapse inside tactical ${TACTICAL_ZOOM}`);
  assert.equal(chase.hasThreatFocus, true,
    'ordinary chase composition still sees the nearby attacker while mining');
  assert.ok(chase.zoomBias > 0,
    'nearby attacker widens ordinary mining context instead of being cropped');
});

test('live mining camera never tightens inside tactical view while nearby threats remain active', () => {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = entity(1, 0, 0, 7, {
    team: 0,
    type: 'ship',
    vel: { x: 0, z: 0 },
    maxSpeed: 120,
  });
  const rock = {
    id: 54,
    type: 'asteroid',
    alive: true,
    pos: { x: 44, z: 8 },
    radius: 16,
    hull: 200,
  };
  const nearbyAttacker = entity(55, -190, 25, 8, {
    team: 1,
    data: {
      encounter: { id: 'camera-regression-hostile-live' },
      combat: { targetId: player.id, lockTarget: player.id },
    },
  });
  const state = stateFor(player, [rock, nearbyAttacker], {
    tetherActive: true,
    tetherTargetId: rock.id,
  });
  state.settings = { video: { fov: FOV, motionReduce: true } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };

  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 90; i++) camera.follow(DT);
  const frame = camera.composition();
  const effectiveZoom = Math.hypot(
    camera.obj.position.x - state.camera.focus.x,
    camera.obj.position.y,
    camera.obj.position.z - state.camera.focus.z,
  );

  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'live asteroid tether never promotes to pair director');
  assert.ok(effectiveZoom + 1e-6 >= TACTICAL_ZOOM,
    `live mining zoom ${effectiveZoom} must not tighten inside tactical ${TACTICAL_ZOOM}`);
  assert.ok(Math.abs(state.camera.focus.x - rock.pos.x * 0.5) > 5,
    'mining camera does not midpoint-lock player and asteroid');
  assertInFocusMargin(nearbyAttacker, frame, 0.88,
    'active attacker remains visible under reduced motion while the player works a utility tether');
});

test('Focus arms on its own kinematics at every azimuth and never moves the camera', () => {
  // Lane 4 retired `focusPairFitsCamera`, which refused an ACQUISITION whose pair the camera could
  // not have framed — a gameplay lease gated on a render heuristic, and one that hardcoded fov 50 /
  // aspect 16:9 / tilt 60. At 279 wu it refused EVERY azimuth (a lateral pair needed ~358 wu of
  // zoom, a screen-vertical one ~513, against a 330 ceiling), so the lease armed only once the
  // contact had closed to roughly half its authored range. The envelope is now purely kinematic:
  // within 280 wu, relative speed >= 96, closing >= 25, closest approach within 2.5 s and 96 wu.
  for (let step = 0; step < 16; step++) {
    const angle = step * Math.PI * 2 / 16;
    const player = entity(1, 0, 0, 7, { team: 0, vel: { x: 0, z: 0 } });
    const distance = 279;
    const target = entity(100 + step, Math.cos(angle) * distance, Math.sin(angle) * distance, 10, {
      team: 1,
      vel: { x: -Math.cos(angle) * 180, z: -Math.sin(angle) * 180 },
      data: { combat: { targetId: player.id }, weapons: [{ id: 'focus-fit-test' }] },
    });
    const pick = pickFlybyTarget(stateFor(player, [target]), player, [target]);
    assert.ok(pick, `azimuth ${step} arms at the full 279 wu envelope, not only once it has closed`);
    assert.equal(pick.id, target.id, `azimuth ${step} leases the exact contact`);

    // ...and holding that lease leaves the camera exactly where ordinary follow put it.
    const leaseState = stateFor(player, [target], { focusActive: true, focusTargetId: target.id });
    const leaseDirector = createCameraDirector();
    leaseDirector.syncFollow(0, 0, TACTICAL_ZOOM);
    const leaseFrame = settle(leaseDirector, 0.6, leaseState, player);
    assert.equal(leaseFrame.mode, CameraDirectorMode.FOLLOW, `azimuth ${step} lease takes no pair mode`);
    assert.equal(leaseFrame.targetId, null, `azimuth ${step} lease claims no camera pair target`);
    assert.equal(leaseFrame.focusX, 0, `azimuth ${step} lease does not pan the camera`);
    assert.equal(leaseFrame.focusZ, 0, `azimuth ${step} lease does not pan the camera laterally`);
    assert.equal(leaseFrame.zoom, TACTICAL_ZOOM, `azimuth ${step} lease does not pump the zoom`);
  }
});

test('every azimuth of the combat pair either fits the authored band or reports its overflow', () => {
  // The pair-composition geometry the old Focus takeover exercised is unchanged code; a hostile
  // massline still reaches it. This is that claim, held at a range a pair camera can actually own.
  for (let step = 0; step < 16; step++) {
    const angle = step * Math.PI * 2 / 16;
    const player = entity(1, 0, 0, 7, { team: 0, vel: { x: 0, z: 0 } });
    const distance = 150;
    const target = entity(100 + step, Math.cos(angle) * distance, Math.sin(angle) * distance, 10, {
      team: 1,
      vel: { x: -Math.cos(angle) * 180, z: -Math.sin(angle) * 180 },
      data: { combat: { targetId: player.id }, weapons: [{ id: 'pair-fit-test' }] },
    });
    const state = stateFor(player, [target], { tetherActive: true, tetherTargetId: target.id });
    const director = createCameraDirector();
    director.syncFollow(0, 0, TACTICAL_ZOOM);
    const frame = settle(director, 0.6, state, player);
    assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR, `azimuth ${step} enters the combat pair`);
    assert.equal(frame.targetId, target.id, `azimuth ${step} keeps the exact attached hostile`);
    assert.ok(frame.zoom <= CAMERA_DIRECTOR_ENGINE_MAX_ZOOM + 1e-9,
      `azimuth ${step} remains inside the legal chase-camera ceiling`);
    assert.equal(frame.overflow, frame.requiredZoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
      `azimuth ${step} reports authored-envelope overflow truthfully`);
    assert.equal(frame.preferredBandExceeded, frame.zoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
      `azimuth ${step} reports actual use of the wider chase envelope`);
    assertInFocusMargin(player, frame, CAMERA_DIRECTOR_SAFE_NDC, `azimuth ${step} player`);
    assertInFocusMargin(target, frame, CAMERA_DIRECTOR_SAFE_NDC, `azimuth ${step} target`);
  }
});

test('friendly non-hostile ship tether does not enter combat pair mode', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const ally = entity(4, 55, 0, 8, { team: 0 });
  const state = stateFor(player, [ally], {
    tetherActive: true,
    tetherTargetId: ally.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'non-hostile ship tether is ordinary, not combat pair');
  assert.ok(frame.zoom + 1e-9 >= TACTICAL_ZOOM,
    'non-hostile tether must not zoom closer than tactical');
});

test('team mismatch without live hostility cannot authorize Focus or tether pair framing', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const neutralTrader = entity(5, 70, 0, 8, {
    team: 1,
    data: { ai: { archetype: 'trader' } },
  });
  const state = stateFor(player, [neutralTrader], {
    focusActive: true,
    focusTargetId: neutralTrader.id,
    tetherActive: true,
    tetherTargetId: neutralTrader.id,
    targetId: neutralTrader.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'camera authority fails neutral when affiliation differs but hostility is not live');
  assert.equal(frame.targetId, null, 'neutral team mismatch never owns pair camera target');
});

test('neutral team mismatch does not create false ordinary chase threat bias', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const neutralTrader = entity(6, 90, 15, 8, {
    team: 1,
    data: { ai: { archetype: 'trader' } },
  });
  const state = stateFor(player, [neutralTrader]);
  const composition = resolveChaseComposition(state, player, { x: 0, z: 0 });

  assert.equal(composition.hasThreatFocus, false,
    'trader affiliation mismatch is not battlefield threat context');
  assert.equal(composition.nearbyEnemies, 0,
    'neutral trader is not counted as a nearby enemy');
  assert.equal(composition.zoomBias, 0,
    'neutral traffic cannot widen or steer ordinary chase framing');
});

test('ordinary tether composition stays modest and keeps threat context bias', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const rock = {
    id: 60,
    type: 'asteroid',
    alive: true,
    pos: { x: 280, z: 0 },
    radius: 12,
  };
  const hostile = entity(2, 420, 0, 8, { team: 1 });
  const state = stateFor(player, [rock, hostile], {
    tetherActive: true,
    tetherTargetId: rock.id,
  });
  // Mirror live gameplay: player.tether is authoritative for ordinary massline endpoint.
  const composition = resolveChaseComposition(state, player, { x: 0, z: 0 });

  assert.equal(composition.hasTetherFocus, true,
    'player.tether endpoint must contribute modest tether composition');
  assert.equal(composition.hasThreatFocus, true,
    'nearby hostile must still pull threat context during ordinary tether');
  assert.ok(composition.zoomBias > 0.05,
    'ordinary tether + threat should widen context, not collapse inward');
  // Modest lateral bias — not a full pair re-center at the rock midpoint (~140).
  assert.ok(Math.abs(composition.x) < 120,
    `ordinary tether focus bias ${composition.x} must stay modest vs pair midpoint`);
});

test('ordinary chase calculations can reuse caller-owned frame records without changing values', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(2, 180, 35, 8, {
    team: 1,
    data: {
      encounter: { id: 'camera-frame-scratch-hostile' },
      combat: { targetId: player.id, lockTarget: player.id },
    },
  });
  const payload = {
    id: 60,
    type: 'payload',
    alive: true,
    pos: { x: -90, z: 20 },
    data: { tetherPayload: true },
  };
  const state = stateFor(player, [hostile, payload]);
  state.combat = {
    attachments: {
      byId: {
        test_tether: {
          state: 'active',
          ownerId: player.id,
          targetId: payload.id,
        },
      },
    },
  };
  const cameraView = { fov: FOV, aspect: ASPECT, tiltDeg: TILT };
  const expectedComposition = resolveChaseComposition(state, player, { x: 8, z: -4 }, cameraView);
  const compositionOut = {};
  const tetherOut = {};
  const reusedComposition = resolveChaseComposition(
    state,
    player,
    { x: 8, z: -4 },
    cameraView,
    compositionOut,
    tetherOut,
  );

  assert.strictEqual(reusedComposition, compositionOut,
    'live chase composition may write into one camera-owned result record');
  assert.deepEqual(reusedComposition, expectedComposition,
    'reusing the result record must preserve every composition field');

  const safeOptions = { zoom: 72, fov: FOV, aspect: ASPECT };
  const expectedSafe = clampFocusToPlayerSafeRect({ x: 120, z: -80 }, player, safeOptions);
  const safeOut = {};
  const reusedSafe = clampFocusToPlayerSafeRect({ x: 120, z: -80 }, player, safeOptions, safeOut);

  assert.strictEqual(reusedSafe, safeOut,
    'live safe-rect clamping may write into one camera-owned result record');
  assert.deepEqual(reusedSafe, expectedSafe,
    'reusing the safe-rect record must preserve every clamp field');
});

test('resolveCombatCompositionZoomCap preserves standard hull legibility at combat cap', () => {
  const viewOptions = { fov: FOV, baseFov: FOV, aspect: ASPECT, tiltDeg: TILT };
  for (const radius of [14, 16]) {
    const zoom = resolveCombatCompositionZoomCap({ radius }, viewOptions);
    assert.ok(zoom <= COMPOSITION_ZOOM_MAX,
      `radius ${radius} cap ${zoom.toFixed(2)} must stay at or below the settled ceiling`);
    const width = projectedPlayerWidthFractionAtWorstSafeFocus(radius, zoom, ASPECT);
    assert.ok(width >= 0.04,
      `radius ${radius} projected width ${(width * 100).toFixed(2)}% must preserve 4% hull legibility`);
  }
});

test('resolveCombatCompositionZoomCap responds to aspect, hull radius, and unknown-radius fallback', () => {
  const base = { fov: FOV, baseFov: FOV, aspect: ASPECT, tiltDeg: TILT };
  const wide = resolveCombatCompositionZoomCap({ radius: 14 }, { ...base, aspect: 21 / 9 });
  const normal = resolveCombatCompositionZoomCap({ radius: 14 }, base);
  const larger = resolveCombatCompositionZoomCap({ radius: 16 }, base);
  const unknown = resolveCombatCompositionZoomCap({}, base);
  assert.ok(wide < normal,
    `21:9 cap ${wide.toFixed(2)} must be tighter than 16:9 cap ${normal.toFixed(2)}`);
  assert.ok(larger > normal,
    `larger hull cap ${larger.toFixed(2)} must exceed radius-14 cap ${normal.toFixed(2)}`);
  assert.ok(unknown <= 330, `unknown-radius fallback ${unknown.toFixed(2)} must stay within manual zoom`);
});

test('active attacker composition projects single threats at the production cap angles', () => {
  for (const [x, z] of [[0, -270], [0, 380], [520, 0]]) {
    const player = entity(1, 0, 0, 7, { team: 0 });
    const threat = entity(2, x, z, 6, {
      team: 1,
      data: { combat: { targetId: player.id } },
    });
    const state = stateFor(player, [threat]);
    const comp = resolveChaseComposition(state, player, { x: 0, z: 0 }, view());
    assert.ok(comp.minZoom > 330 && comp.minZoom <= COMPOSITION_ZOOM_MAX,
      `single attacker ${x},${z} minZoom ${comp.minZoom} must stay inside production cap`);
    const safe = clampFocusToPlayerSafeRect(comp, player, { zoom: comp.minZoom, fov: FOV, aspect: ASPECT });
    const camera = perspectiveCameraForFocus(safe, comp.minZoom);
    assertProjectedVisible(camera, player, `player vs ${x},${z}`);
    assertProjectedVisible(camera, threat, `threat ${x},${z}`);
  }
});

test('an unframeable group member cannot evict a frameable attacker', () => {
  const player = entity(1, -628.3846435546875, 802.1555786132812, 16, { team: 0 });
  const impossible = entity(14, -563.7261962890625, 1197.9014892578125, 12,
    { data: { combat: { targetId: player.id } } });
  const attacker = entity(16, -497.0660400390625, 606.7481689453125, 12,
    { data: { combat: { targetId: player.id } } });
  const state = stateFor(player, [impossible, attacker]);
  const cap = resolveCombatCompositionZoomCap(player, view());
  const comp = resolveChaseComposition(state, player, player.pos, view({ maxZoom: cap }));
  assert.ok(comp.minZoom <= cap);
  const safe = clampFocusToPlayerSafeRect(comp, player, { zoom: comp.minZoom, fov: FOV, aspect: ASPECT });
  const camera = perspectiveCameraForFocus(safe, comp.minZoom);
  assertProjectedVisible(camera, player, 'player with unreachable hostile');
  assertProjectedVisible(camera, attacker, 'frameable attacker');
});

test('group fit repositions an infeasible centroid before dropping a frameable attacker', () => {
  for (const origin of [{ x: 0, z: 0 }, { x: 10000, z: -20000 }]) {
    const player = entity(1, -231.0701904296875 + origin.x, 213.49179077148438 + origin.z, 16, { team: 0, maxSpeed: 95 });
    const positions = [
      [14, -373.0793762207031, 424.9876403808594],
      [15, -417.1158447265625, 390.6977233886719],
      [16, -455.9724426269531, 385.01263427734375],
      [18, -406.74969482421875, 160.3074951171875],
      [21, -217.97549438476562, 375.75750732421875],
      [23, -322.6826477050781, 362.9065246582031],
      [24, -339.80657958984375, 379.60638427734375],
      [25, -368.1152648925781, 368.9293212890625],
      [22, -104.06979376819753, 94.14417014635379],
    ];
    const hostiles = positions.map(([id, x, z]) => entity(id, x + origin.x, z + origin.z, 12,
      { data: { combat: { targetId: player.id } } }));
    const state = stateFor(player, hostiles);
    const cap = resolveCombatCompositionZoomCap(player, view());
    const comp = resolveChaseComposition(state, player, player.pos, view({ maxZoom: cap }));
    assert.ok(comp.minZoom <= cap);
    const safe = clampFocusToPlayerSafeRect(comp, player, { zoom: comp.minZoom, fov: FOV, aspect: ASPECT });
    const projection = perspectiveCameraForFocus(safe, comp.minZoom);
    for (const body of [player, ...hostiles]) assertProjectedVisible(projection, body, `static body ${body.id}`);
    state.world = { frameOrigin: origin };
    state.camera = { zoom: 144, tilt: TILT, lookAhead: 400, lerp: 6, trauma: 0 };
    state.settings = { video: { fov: FOV, motionReduce: true } };
    state.input = { aimWorld: null };
    const camera = createChaseCamera(state, { innerWidth: 1600, innerHeight: 900 });
    camera.snapToPlayer();
    let lastZoom = 144;
    for (let tick = 0; tick < 300; tick++) {
      camera.follow(DT);
      const focus = state.camera.focus;
      const zoom = Math.hypot(camera.obj.position.x - focus.x, camera.obj.position.y, camera.obj.position.z - focus.z);
      assert.ok(zoom - lastZoom <= 5.5 + 1e-6);
      assert.ok(zoom <= cap + 1e-6);
      lastZoom = zoom;
    }
    camera.obj.updateMatrixWorld(true);
    for (const body of [player, ...hostiles]) assertProjectedVisible(camera.obj, body, `live body ${body.id}`, origin);
  }
});

test('active attacker composition projects two attackers in the same frame', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const left = entity(2, -180, -150, 6, {
    team: 1,
    data: { combat: { targetId: player.id } },
  });
  const right = entity(3, 160, -170, 6, {
    team: 1,
    data: { combat: { targetId: player.id } },
  });
  const state = stateFor(player, [left, right]);
  const comp = resolveChaseComposition(state, player, { x: 0, z: 0 }, view());
  assert.ok(comp.minZoom > 330 && comp.minZoom <= COMPOSITION_ZOOM_MAX,
    `two-attacker minZoom ${comp.minZoom} must stay inside production cap`);
  const safe = clampFocusToPlayerSafeRect(comp, player, { zoom: comp.minZoom, fov: FOV, aspect: ASPECT });
  const camera = perspectiveCameraForFocus(safe, comp.minZoom);
  assertProjectedVisible(camera, player, 'player in two-attacker fit');
  assertProjectedVisible(camera, left, 'left attacker');
  assertProjectedVisible(camera, right, 'right attacker');
});

test('live chase composition is invariant across matching frame origins', () => {
  function liveState(offset) {
    const player = entity(1, offset.x, offset.z, 7, {
      team: 0,
      vel: { x: 0, z: 0 },
      maxSpeed: 120,
    });
    const left = entity(2, offset.x - 180, offset.z - 150, 6, {
      team: 1,
      data: { combat: { targetId: player.id } },
    });
    const right = entity(3, offset.x + 160, offset.z - 170, 6, {
      team: 1,
      data: { combat: { targetId: player.id } },
    });
    const state = stateFor(player, [left, right]);
    state.world = { frameOrigin: { x: offset.x, z: offset.z }, frameOriginSeq: offset.x || offset.z ? 1 : 0 };
    state.camera = { zoom: 144, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
    state.settings = { video: { fov: FOV, motionReduce: true } };
    state.input = { aimWorld: null };
    return { state, player, entities: [player, left, right], origin: state.world.frameOrigin };
  }

  function settleLive(offset) {
    const fixture = liveState(offset);
    const camera = createChaseCamera(fixture.state, { innerWidth: 1600, innerHeight: 900 });
    camera.snapToPlayer();
    for (let i = 0; i < 180; i++) camera.follow(DT);
    camera.obj.updateMatrixWorld(true);
    return {
      fixture,
      camera,
      pose: {
        focusX: fixture.state.camera.focus.x,
        focusZ: fixture.state.camera.focus.z,
        cameraX: camera.obj.position.x,
        cameraY: camera.obj.position.y,
        cameraZ: camera.obj.position.z,
      },
      projected: fixture.entities.map((item) => projectionSamples(item, fixture.origin)
        .map((point) => {
          const ndc = point.project(camera.obj);
          return [ndc.x, ndc.y, ndc.z];
        })),
    };
  }

  const base = settleLive({ x: 0, z: 0 });
  const translated = settleLive({ x: 10000, z: -20000 });
  for (const key of Object.keys(base.pose)) {
    assert.ok(Math.abs(base.pose[key] - translated.pose[key]) <= 1e-6,
      `${key} must match across frame origins`);
  }
  for (let i = 0; i < base.projected.length; i++) {
    for (let j = 0; j < base.projected[i].length; j++) {
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(base.projected[i][j][k] - translated.projected[i][j][k]) <= 1e-6,
          `projected entity ${i} point ${j} axis ${k} must match across frame origins`);
      }
    }
  }
});

test('preallocated chase camera avoids constructor RNG and resets projection parameters', () => {
  const player = entity(1, 32, -18, 7, {
    team: 0,
    vel: { x: 0, z: 0 },
    maxSpeed: 120,
  });
  const state = stateFor(player, []);
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.settings = { video: { fov: FOV } };
  state.input = { aimWorld: null };
  const viewport = { innerWidth: 1600, innerHeight: 900 };
  const provided = new THREE.PerspectiveCamera(37, 4 / 3, 5, 777);
  const originalUuid = provided.uuid;
  provided.zoom = 2.25;
  provided.setViewOffset(3200, 1800, 40, 30, 1200, 700);
  provided.updateProjectionMatrix();

  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('preallocated camera path must not touch Math.random');
  };
  try {
    const camera = createChaseCamera(state, viewport, provided);
    assert.strictEqual(camera.obj, provided);
    assert.equal(provided.uuid, originalUuid);
    assert.equal(provided.fov, FOV);
    assert.equal(provided.aspect, ASPECT);
    assert.equal(provided.near, 1);
    assert.equal(provided.far, 14000);
    assert.equal(provided.zoom, 1);
    assert.equal(provided.view, null);
    camera.snapToPlayer();
    camera.follow(DT);
  } finally {
    Math.random = originalRandom;
  }
});

test('group-fit sticky lifecycle removes stale holders and preserves caller-owned output', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const dead = entity(2, -120, -80, 6, {
    team: 1,
    alive: false,
    data: { combat: { targetId: player.id } },
  });
  const neutral = entity(3, 120, -80, 6, {
    team: 0,
    data: { combat: { targetId: player.id } },
  });
  const active = entity(4, 150, 0, 6, {
    team: 1,
    data: { combat: { targetId: player.id } },
  });
  const state = stateFor(player, [dead, neutral, active]);
  const sticky = { id: null, remainS: 0, wasActive: false, holds: new Map([[dead.id, 1], [neutral.id, 1], [99, 1]]) };
  const out = {};
  const first = resolveChaseComposition(state, player, { x: 0, z: 0 }, view({ dt: DT }), out, null, sticky);
  assert.strictEqual(first, out);
  assert.equal(sticky.holds.has(dead.id), false, 'dead held target is removed');
  assert.equal(sticky.holds.has(neutral.id), false, 'neutral held target is removed');
  assert.equal(sticky.holds.has(99), false, 'despawned held target is removed');
  assert.equal(sticky.holds.has(active.id), true, 'live active target remains held');
  const snapshot = { ...first };
  const valuesOnlyState = {
    ...state,
    entities: { values: state.entities.values.bind(state.entities) },
  };
  assert.doesNotThrow(() => resolveChaseComposition(valuesOnlyState, player, { x: 0, z: 0 }, view({ dt: DT }), {}, null, sticky),
    'values-only entity stores do not throw while sticky holds exist');
  const second = resolveChaseComposition(state, player, { x: 0, z: 0 }, view({ dt: DT }), {});
  assert.deepEqual(first, snapshot, 'pure caller result is not mutated by a later call');
  assert.equal(second.hasActiveAttacker, true);
});

// ---------------------------------------------------------------------------
// RED: combat Flyby Focus must frame player + hostile with context margin
// ---------------------------------------------------------------------------

test('a live hostile Focus lease leaves the camera bit-identical to no lease at all', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 110, 0, 8, { team: 1 });
  const leaseState = stateFor(player, [hostile], {
    focusActive: true,
    focusTargetId: hostile.id,
    targetId: hostile.id,
  });
  const noLeaseState = stateFor(player, [hostile], { targetId: hostile.id });
  const leaseDirector = createCameraDirector();
  const plainDirector = createCameraDirector();
  leaseDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  plainDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const leaseFrame = settle(leaseDirector, 0.5, leaseState, player);
  const plainFrame = settle(plainDirector, 0.5, noLeaseState, player);

  assert.equal(leaseFrame.mode, CameraDirectorMode.FOLLOW, 'a hostile lease takes no pair mode');
  assert.equal(leaseFrame.targetId, null, 'a hostile lease claims no camera pair target');
  assert.deepEqual({ ...leaseFrame }, { ...plainFrame },
    'every published director field is unchanged by holding the lease');
});

test('combat massline still frames player + exact hostile with 10% margins', () => {
  assert.equal(CAMERA_DIRECTOR_FOCUS_SAFE_NDC, CAMERA_DIRECTOR_SAFE_NDC,
    'combat pair framing uses the authored 10% functional safe frame');

  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 110, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    tetherActive: true,
    tetherTargetId: hostile.id,
    targetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR, 'hostile massline uses TETHER_PAIR');
  assert.equal(frame.targetId, hostile.id, 'the pair frames the authoritative hostile');
  assert.equal(frame.overflow, false, 'in-envelope combat pair must fit');
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'player');
  assertInFocusMargin(hostile, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'hostile');
  // Control for the test above: pair framing genuinely relocates this camera, so "identical to no
  // lease" is a real constraint on the same geometry rather than an inert fixture passing.
  assert.ok(Math.abs(frame.focusX) > 40,
    `pair framing moves focus to the pair midpoint (${frame.focusX})`);
  assert.ok(frame.zoom > TACTICAL_ZOOM, 'pair framing widens past the ordinary follow zoom');
});

test('explicit allied onboarding trainer eases into the authored 10% / zoom-180 composition', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  // Late-window separation from the held-out public flyby. The general hostile Focus envelope may
  // use the engine ceiling, but the authored onboarding composition must remain in the 58-180 band.
  const trainer = entity(12, 200, 20, 8, {
    type: 'drone',
    team: 0,
    data: {
      onboarding: true,
      onboardingTraining: true,
      trainingFocusEligible: true,
      ai: { passive: true, roe: 'hold_fire' },
      weapons: [],
    },
  });
  // A safe first-flight sector can still contain an unrelated hostile-classified contact. It must
  // not expand the authored trainer shot beyond 180 when it is not the lesson's explicit pair.
  const unrelated = entity(13, -240, -10, 8, { team: 1 });
  const state = stateFor(player, [trainer, unrelated], {
    focusActive: true,
    focusTargetId: trainer.id,
    targetId: trainer.id,
  });
  const director = createCameraDirector();
  // Reproduce a wide contextual FOLLOW shot. Focus must take the real authored 0.35-second path
  // into its final envelope instead of snapping 330 -> 180 on the acquisition frame.
  director.syncFollow(0, 0, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
  const entered = director.step(DT, state, player, view());
  assert.ok(entered.zoom < CAMERA_DIRECTOR_ENGINE_MAX_ZOOM && entered.zoom > CAMERA_DIRECTOR_MAX_ZOOM,
    `training Focus entry ${entered.zoom} advances one smooth step instead of snapping`);
  assert.equal(entered.overflow, false, 'the optimal trainer pose fits the authored envelope');
  assert.equal(entered.preferredBandExceeded, true,
    'the transient wide pose is reported until the ease reaches the authored envelope');
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR,
    'the two explicit training flags authorize pair framing without making ordinary allies eligible');
  assert.equal(frame.targetId, trainer.id);
  assert.ok(frame.zoom <= CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
    `training Focus zoom ${frame.zoom} must remain inside the authored 58-180 band`);
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_SAFE_NDC, 'player');
  assertInFocusMargin(trainer, frame, CAMERA_DIRECTOR_SAFE_NDC, 'trainer');
});

test('300-unit hostile pair remains exact, eases smoothly, and truthfully reports authored overflow', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(91, 300, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    tetherActive: true,
    tetherTargetId: hostile.id,
    targetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);

  const entered = director.step(DT, state, player, view());
  assert.equal(entered.mode, CameraDirectorMode.TETHER_PAIR);
  assert.equal(entered.targetId, hostile.id, 'the held-out pair keeps the authoritative hostile');
  assert.equal(entered.overflow, true, 'overflow is immediate even while the visible pose eases');
  assert.ok(entered.requiredZoom > CAMERA_DIRECTOR_MAX_ZOOM
    && entered.requiredZoom < CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
  `held-out pair exposes its real ${entered.requiredZoom} zoom requirement`);
  assert.ok(entered.zoom < CAMERA_DIRECTOR_ENGINE_MAX_ZOOM
    && entered.zoom > entered.requiredZoom,
  `first frame ${entered.zoom} is one ease step, not a 330 -> ${entered.requiredZoom} snap`);

  const frame = settle(director, CAMERA_DIRECTOR_EASE_S + DT, state, player);
  assert.equal(frame.targetId, hostile.id);
  assert.equal(frame.overflow, true);
  assert.ok(frame.zoom > CAMERA_DIRECTOR_MAX_ZOOM && frame.zoom < CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
    'out-of-band pair uses the legal wider chase envelope instead of cropping either ship');
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_SAFE_NDC, 'held-out player');
  assertInFocusMargin(hostile, frame, CAMERA_DIRECTOR_SAFE_NDC, 'held-out hostile');
});

test('combat pair threat-aware zoom-out keeps nearby active hostile in frame', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const pairHostile = entity(9, 120, 0, 8, { team: 1 });
  const nearbyAttacker = entity(3, -70, 20, 8, { team: 1, hull: 80 });
  const state = stateFor(player, [pairHostile, nearbyAttacker], {
    tetherActive: true,
    tetherTargetId: pairHostile.id,
    targetId: pairHostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.55, state, player);

  assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR);
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'player');
  assertInFocusMargin(pairHostile, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'pair hostile');
  // Nearby active attacker must not be cropped off-screen (unseen attacker).
  assertInFocusMargin(nearbyAttacker, frame, CAMERA_DIRECTOR_SAFE_NDC, 'nearby attacker');
  assert.ok(frame.zoom > TACTICAL_ZOOM,
    'threat context should prefer zoom-out over cropping attackers');
});

test('a hostile holding a live Focus lease is kept on screen by ordinary chase composition', () => {
  // The other half of the separation: Focus must not MOVE the camera, but the contact it names must
  // not fall off the edge of the screen either. That job belongs to the ordinary chase composition,
  // which biases toward an active attacker at the pair midpoint and publishes a minZoom computed
  // from the live fov/aspect/tilt that contains both ships.
  //
  // This case covers the half that always worked — a leased contact that is ALSO shooting at the
  // player. The two halves that did not (a lease granted on pass geometry alone, and a leased
  // drone) are the two tests immediately below; all three now go through the same code.
  const player = entity(1, 0, 0, 7, { team: 0 });
  const leased = entity(9, 240, 40, 8, {
    team: 1,
    vel: { x: -180, z: -30 },
    data: {
      encounter: { id: 'camera-lease-frame' },
      combat: { targetId: 1, lockTarget: 1 },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  const state = stateFor(player, [leased], {
    focusActive: true,
    focusTargetId: leased.id,
    targetId: leased.id,
  });
  const composition = resolveChaseComposition(state, player, { x: 0, z: 0 },
    { fov: FOV, aspect: ASPECT, tiltDeg: TILT });

  assert.equal(composition.hasActiveAttacker, true,
    'the leased contact is composed as an active attacker, not ambient traffic');
  assert.ok(composition.minZoom > TACTICAL_ZOOM,
    `composition publishes a zoom floor that contains the pair (${composition.minZoom})`);
  const framed = { focusX: composition.x, focusZ: composition.z, zoom: composition.minZoom };
  assertInFocusMargin(player, framed, 0.9, 'player under ordinary chase composition');
  assertInFocusMargin(leased, framed, 0.9, 'leased hostile under ordinary chase composition');
});

test('a lease granted on pass geometry alone still composes its contact as an attacker', () => {
  // The lease is granted on pass GEOMETRY — proximity plus closing speed (flybyFocus.js:173-213) —
  // never on the leased ship having targeted the player. `direct` is only a tie-break. So a hostile
  // making a genuine sub-96-wu high-speed pass while its combat target is someone else held a live
  // lease (50% time, player.targetId reassigned, latch window open) and was composed as ambient
  // traffic: an 8%-of-range bias capped at 42 wu, and no zoom floor at all.
  const player = entity(1, 0, 0, 7, { team: 0 });
  const leased = entity(9, 240, 40, 8, {
    team: 1,
    vel: { x: -180, z: -30 },
    data: {
      encounter: { id: 'camera-lease-geometry' },
      // Fighting someone else entirely. Hostile to the player, but not aiming at them.
      combat: { targetId: 777, lockTarget: 777 },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  const leaseState = stateFor(player, [leased], {
    focusActive: true,
    focusTargetId: leased.id,
    targetId: leased.id,
  });
  const composition = resolveChaseComposition(leaseState, player, { x: 0, z: 0 },
    { fov: FOV, aspect: ASPECT, tiltDeg: TILT });

  assert.equal(composition.hasActiveAttacker, true,
    'a live lease makes its contact functional context, not ambient traffic');
  assert.ok(composition.minZoom > TACTICAL_ZOOM,
    `composition publishes a zoom floor that contains the pair (${composition.minZoom})`);
  const framed = { focusX: composition.x, focusZ: composition.z, zoom: composition.minZoom };
  assertInFocusMargin(player, framed, 0.9, 'player under a geometry-only lease');
  assertInFocusMargin(leased, framed, 0.9, 'geometry-only leased hostile');

  // Control: the SAME contact, same geometry, with no lease held. It is ordinary ambient traffic —
  // modest bias, no zoom floor — which is what makes the assertions above a statement about the
  // lease rather than a fixture that would pass either way.
  const noLease = resolveChaseComposition(stateFor(player, [leased], { targetId: leased.id }),
    player, { x: 0, z: 0 }, { fov: FOV, aspect: ASPECT, tiltDeg: TILT });
  assert.equal(noLease.hasActiveAttacker, false,
    'control: without the lease this contact is ambient, so the lease is doing the work');
  assert.equal(noLease.minZoom, 0, 'control: ambient traffic publishes no zoom floor');
  assert.ok(Math.abs(noLease.x) < Math.abs(composition.x),
    'control: ambient bias is strictly more restrained than attacker composition');
});

test('a hostile drone is threat composition, not an invisible entity type', () => {
  // Flyby Focus leases ships AND drones (flybyFocus.js:81 `isHostileShip` accepts either), but the
  // composition loop skipped everything whose type was not exactly 'ship'. A leased drone was not
  // biased toward, not given a zoom floor, and not even counted in nearbyEnemies.
  const player = entity(1, 0, 0, 7, { team: 0 });
  const drone = entity(9, 240, 40, 8, {
    type: 'drone',
    team: 1,
    vel: { x: -180, z: -30 },
    data: {
      encounter: { id: 'camera-lease-drone' },
      combat: { targetId: 1, lockTarget: 1 },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  const view3 = { fov: FOV, aspect: ASPECT, tiltDeg: TILT };

  // Independent of any lease: a drone actively shooting at the player is an attacker.
  const attacking = resolveChaseComposition(stateFor(player, [drone], { targetId: drone.id }),
    player, { x: 0, z: 0 }, view3);
  assert.equal(attacking.nearbyEnemies, 1, 'a hostile drone counts as a nearby enemy');
  assert.equal(attacking.hasActiveAttacker, true, 'a drone shooting at the player is an attacker');
  assert.ok(attacking.minZoom > TACTICAL_ZOOM, 'the drone pair gets a real zoom floor');

  // And a leased drone with no interest in the player is composed on the lease, same as a ship.
  const geometryDrone = { ...drone, data: { ...drone.data, combat: { targetId: 777, lockTarget: 777 } } };
  const leased = resolveChaseComposition(
    stateFor(player, [geometryDrone], {
      focusActive: true,
      focusTargetId: geometryDrone.id,
      targetId: geometryDrone.id,
    }),
    player, { x: 0, z: 0 }, view3);
  assert.equal(leased.hasActiveAttacker, true, 'a leased drone is composed exactly like a leased ship');
  const framed = { focusX: leased.x, focusZ: leased.z, zoom: leased.minZoom };
  assertInFocusMargin(player, framed, 0.9, 'player under a leased drone');
  assertInFocusMargin(geometryDrone, framed, 0.9, 'leased drone');
});

test('a Focus lease cannot promote a non-hostile contact into threat composition', () => {
  // The lease reads as an attacker only for a contact that is ALREADY hostile — it widens which
  // hostiles count as active, never who counts as hostile. FOCUS_PAIR survives for the explicitly
  // flagged onboarding trainer, and the trainer must not additionally drag the chase composition.
  const player = entity(1, 0, 0, 7, { team: 0 });
  const trainer = entity(12, 200, 20, 8, {
    type: 'drone',
    team: 0,
    data: {
      onboarding: true,
      onboardingTraining: true,
      trainingFocusEligible: true,
      ai: { passive: true, roe: 'hold_fire' },
      weapons: [],
    },
  });
  const state = stateFor(player, [trainer], {
    focusActive: true,
    focusTargetId: trainer.id,
    targetId: trainer.id,
  });
  const composition = resolveChaseComposition(state, player, { x: 0, z: 0 },
    { fov: FOV, aspect: ASPECT, tiltDeg: TILT });

  assert.equal(composition.hasActiveAttacker, false,
    'an allied trainer under a lease is not battlefield threat context');
  assert.equal(composition.nearbyEnemies, 0, 'the trainer is not counted as a nearby enemy');
  assert.equal(composition.zoomBias, 0, 'a leased ally cannot widen ordinary chase framing');
  assert.equal(composition.minZoom, 0, 'a leased ally publishes no zoom floor');
});

test('granting a Focus lease moves the live camera continuously, never with a cut', () => {
  // The design constraint on the fix above: Focus must never seize the camera. Keeping the pair on
  // screen is allowed to move the frame, but only through the composition the chase camera already
  // runs — bias slew-limited to COMPOSITION_BIAS_SLEW (90 wu/s) and damped, zoom eased at ZOOM_LERP.
  // A takeover would show up here as a single frame that jumps.
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = entity(1, 0, 0, 7, { team: 0, vel: { x: 0, z: 0 }, maxSpeed: 120 });
  const leased = entity(9, 240, 40, 8, {
    team: 1,
    vel: { x: 0, z: 0 },
    data: {
      encounter: { id: 'camera-lease-continuity' },
      combat: { targetId: 777, lockTarget: 777 },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  const state = stateFor(player, [leased]);
  state.settings = { video: { fov: FOV } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };

  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  const effectiveZoom = () => Math.hypot(
    camera.obj.position.x - state.camera.focus.x,
    camera.obj.position.y,
    camera.obj.position.z - state.camera.focus.z,
  );
  for (let i = 0; i < 120; i++) camera.follow(DT);

  // Control: with no lease held the contact really is off the edge of the screen, so the framing
  // assertion at the end of this test is a claim the lease has to earn.
  const beforeNdc = projectedNdc(leased, {
    focusX: state.camera.focus.x, focusZ: state.camera.focus.z, zoom: effectiveZoom(),
  });
  assert.ok(beforeNdc.x > 1,
    `control: the un-leased contact is off-screen (${beforeNdc.x}) before the lease is granted`);

  state.player.flybyFocus.active = true;
  state.player.flybyFocus.targetId = leased.id;
  let prevX = state.camera.focus.x;
  let prevZ = state.camera.focus.z;
  let prevZoom = effectiveZoom();
  let maxFocusStep = 0;
  let maxZoomStep = 0;
  // The authored lease is three sim-seconds long; hold it for that window.
  for (let i = 0; i < Math.ceil(3 / DT); i++) {
    camera.follow(DT);
    const zoom = effectiveZoom();
    maxFocusStep = Math.max(maxFocusStep,
      Math.hypot(state.camera.focus.x - prevX, state.camera.focus.z - prevZ));
    maxZoomStep = Math.max(maxZoomStep, Math.abs(zoom - prevZoom));
    prevX = state.camera.focus.x;
    prevZ = state.camera.focus.z;
    prevZoom = zoom;
  }

  assert.equal(camera.composition().mode, CameraDirectorMode.FOLLOW,
    'the lease still takes no pair mode — composition, not seizure');
  assert.ok(maxFocusStep <= 1.6,
    `focus never jumps: largest single-frame step was ${maxFocusStep} wu (slew allows 1.5)`);
  assert.ok(maxZoomStep <= 6,
    `zoom never cuts: largest single-frame step was ${maxZoomStep} wu`);
  const framed = {
    focusX: state.camera.focus.x, focusZ: state.camera.focus.z, zoom: effectiveZoom(),
  };
  assertInFocusMargin(player, framed, 0.9, 'player after the lease window');
  assertInFocusMargin(leased, framed, 0.9, 'leased contact after the lease window');
});

test('hostile ship combat tether still uses TETHER_PAIR pair framing', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 90, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    tetherActive: true,
    tetherTargetId: hostile.id,
    targetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR,
    'hostile ship massline remains combat pair');
  assert.equal(frame.targetId, hostile.id);
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_SAFE_NDC, 'player under combat tether');
  assertInFocusMargin(hostile, frame, CAMERA_DIRECTOR_SAFE_NDC, 'hostile under combat tether');
});

// ---------------------------------------------------------------------------
// Focus release + acquisition hygiene + time-effects authority
// ---------------------------------------------------------------------------

test('pair release returns to FOLLOW cleanly without sticky pair target', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 100, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    tetherActive: true,
    tetherTargetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  settle(director, 0.4, state, player);

  state.player.tether.active = false;
  state.player.tether.targetId = null;
  const mid = director.step(DT, state, player, view());
  assert.equal(mid.mode, CameraDirectorMode.RECOVER, 'leaving a pair eases through RECOVER');

  const done = settle(director, CAMERA_DIRECTOR_EASE_S + 0.05, state, player);
  assert.equal(done.mode, CameraDirectorMode.FOLLOW, 'pair release ends in FOLLOW');
  assert.equal(done.targetId, null, 'pair target clears on release');
  assert.ok(done.zoom <= CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
});

test('pair release and immediate same-target re-latch remain continuous', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(10, 120, 20, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    tetherActive: true,
    tetherTargetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  settle(director, 0.5, state, player);

  state.player.tether.active = false;
  state.player.tether.targetId = null;
  const recovering = director.step(DT, state, player, view());
  assert.equal(recovering.mode, CameraDirectorMode.RECOVER);
  const recoveryPose = {
    x: recovering.focusX,
    z: recovering.focusZ,
    zoom: recovering.zoom,
  };

  state.player.tether.active = true;
  state.player.tether.targetId = hostile.id;
  const relatched = director.step(DT, state, player, view());
  assert.equal(relatched.mode, CameraDirectorMode.TETHER_PAIR,
    'same hostile can reacquire during recovery without waiting for FOLLOW');
  assert.equal(relatched.targetId, hostile.id);
  assert.ok(Math.hypot(relatched.focusX - recoveryPose.x, relatched.focusZ - recoveryPose.z) < 2,
    'first re-latch frame preserves focus continuity');
  assert.ok(Math.abs(relatched.zoom - recoveryPose.zoom) < 2,
    'first re-latch frame preserves zoom continuity');

  const pair = settle(director, CAMERA_DIRECTOR_EASE_S + 0.05, state, player);
  assert.equal(pair.mode, CameraDirectorMode.TETHER_PAIR);
  state.player.tether.active = false;
  state.player.tether.targetId = null;
  let previousZoom = pair.zoom;
  for (let i = 0; i < Math.ceil((CAMERA_DIRECTOR_EASE_S + 0.05) / DT); i++) {
    const frame = director.step(DT, state, player, view());
    assert.ok(frame.zoom <= previousZoom + 1e-8,
      'normal release zoom moves monotonically toward tactical FOLLOW');
    previousZoom = frame.zoom;
  }
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
});

test('asteroid tether never arms Flyby Focus acquisition', () => {
  const player = entity(1, 0, 0, 7, {
    team: 0,
    vel: { x: 120, z: 0 },
  });
  const rock = {
    id: 70,
    type: 'asteroid',
    alive: true,
    pos: { x: 80, z: 0 },
    radius: 18,
    vel: { x: 0, z: 0 },
  };
  // Closing high-speed geometry that would pass ship filters if type were ignored.
  const state = stateFor(player, [rock], { simTime: 10 });
  assert.equal(pickFlybyTarget(state, player, [rock]), null,
    'asteroids are never Flyby Focus candidates');
});

test('Flyby Focus only acquires valid high-speed hostile near-miss and owns timeEffects', () => {
  const player = entity(1, 0, 0, 7, {
    team: 0,
    vel: { x: 120, z: 0 },
    flags: {},
  });
  const hostile = entity(2, 120, 0, 12, {
    team: 1,
    vel: { x: -20, z: 0 },
    mass: 60,
    data: {
      ai: { archetype: 'pirate' },
      combat: { targetId: 1, lockTarget: null },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  const rock = {
    id: 71,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: 0 },
    radius: 10,
    vel: { x: 0, z: 0 },
  };
  const entities = new Map([[player.id, player], [hostile.id, hostile], [rock.id, rock]]);
  const state = {
    mode: 'flight',
    simTime: 20,
    playerId: player.id,
    entities,
    entityList: [player, hostile, rock],
    player: {
      heat: 0,
      targetId: rock.id,
      tether: { active: false, targetId: null },
      flybyFocus: null,
    },
  };
  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const system = Object.assign({}, flybyFocus);
  system.init({ state, bus, timeEffects });
  system.update(DT, state);

  assert.equal(state.player.flybyFocus.active, true, 'valid hostile near-miss arms Focus');
  assert.equal(state.player.flybyFocus.targetId, hostile.id);
  assert.equal(state.player.targetId, rock.id,
    'Focus preserves the explicit persistent gun/UI selection');
  assert.equal(state.timeScale, 0.5, 'Focus owns 50% time scale through timeEffects authority');
  const latch = tetherGameplay._acquireTarget.call(
    { _targetScratch: [], helpers: {} },
    player,
    { maxLength: 390 },
    state,
  );
  assert.equal(latch?.entity?.id, hostile.id,
    'Massline reads the transient Focus target directly despite nearer persistent selection');

  // Mining tether active blocks further acquisition after release, and never arms focus on rock.
  system.update(DT, state); // still active
  state.player.tether.active = true;
  state.player.tether.targetId = rock.id;
  // Expire focus window
  state.simTime = state.player.flybyFocus.until + 0.01;
  system.update(DT, state);
  assert.equal(state.player.flybyFocus.active, false, 'Focus releases when window ends');
  assert.equal(state.player.targetId, rock.id, 'Focus expiry preserves persistent gun/UI selection');
  // Cooldown + tether active: no re-acquire, especially not on asteroid
  state.simTime += 10;
  system.update(DT, state);
  assert.equal(state.player.flybyFocus.active, false,
    'active tether prevents Focus re-acquire; asteroid never becomes Focus');
});

// ---------------------------------------------------------------------------
// Gate approach: authored-bounds composition without stealing manual/Focus camera authority
// ---------------------------------------------------------------------------

function authoredGate(id, x, z) {
  const gate = {
    id,
    type: 'station',
    alive: true,
    hull: 1e6,
    team: 0,
    pos: { x, z },
    radius: 32,
    data: { isGate: true, dockRadius: 70, gateTo: 'sector_test' },
  };
  const authoredRoot = {
    userData: {
      visualBounds: {
        center: [0, -10, 12],
        // Mirrors the oversized release gate after its 5x runtime placeScale.
        size: [100, 521, 533],
      },
    },
    children: [],
  };
  gate.mesh = { userData: { hull: authoredRoot }, children: [authoredRoot] };
  gate.view = { root: gate.mesh };
  return gate;
}

function armGateAutopilot(state, gate) {
  state.nav = {
    autopilot: {
      active: true,
      targetEntityId: gate.id,
      target: { x: gate.pos.x, z: gate.pos.z },
      arrivalRadius: 82,
      status: 'cruising',
    },
  };
}

test('gate metrics use mounted authored bounds rather than the tiny collision radius', () => {
  const gate = authoredGate(80, 0, 360);
  const metrics = resolveGateVisualMetrics(gate);
  assert.equal(metrics.source, 'authored');
  assert.ok(metrics.boundsRadius > 370, `actual gate radius ${metrics.boundsRadius} reflects mounted GLB bounds`);
  assert.ok(metrics.apertureRadius > 195 && metrics.apertureRadius < 205,
    `aperture ${metrics.apertureRadius} derives from the two broad gate-plane axes`);
  assert.ok(metrics.depthHalf >= 50, 'near clipping derives from the shallow authored depth axis');
  assert.notEqual(metrics.boundsRadius, gate.radius, 'camera never mistakes collision radius for visual size');
});

test('manual flight near an authored gate remains ordinary FOLLOW', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const gate = authoredGate(80, 0, 240);
  const state = stateFor(player, [gate]);
  assert.equal(resolveGateApproachTarget(state, player), null, 'no autopilot lease means no gate camera takeover');
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);
  assert.equal(frame.mode, CameraDirectorMode.FOLLOW);
  assert.equal(frame.nearPlane, 1);
});

test('autopilot gate approach eases to player + aperture framing from actual bounds', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const gate = authoredGate(80, 0, 360);
  const state = stateFor(player, [gate]);
  armGateAutopilot(state, gate);
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);

  const first = director.step(DT, state, player, view());
  assert.equal(first.mode, CameraDirectorMode.GATE_APPROACH);
  assert.ok(first.zoom - TACTICAL_ZOOM < 8,
    `first gate frame eases instead of snapping (${TACTICAL_ZOOM} -> ${first.zoom})`);
  assert.ok(first.nearPlane < 3, `near plane also eases on acquire (${first.nearPlane})`);

  const frame = settle(director, 1.5, state, player);
  assert.equal(frame.mode, CameraDirectorMode.GATE_APPROACH);
  assert.equal(frame.targetId, gate.id);
  assert.ok(frame.zoom > CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
    'oversized gate may exceed the combat/manual ceiling only under gate autopilot');
  assert.ok(frame.zoom <= CAMERA_DIRECTOR_GATE_MAX_ZOOM);
  assert.ok(frame.nearPlane > 30, 'foreground slabs are clipped using the authored shallow-depth bound');
  assert.ok(frame.gateBoundsRadius > 370 && frame.gateApertureRadius > 195,
    'director publishes the actual visual envelope used for composition');
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_GATE_SAFE_NDC, 'player on gate approach');
  assertInFocusMargin({ pos: gate.pos, radius: 16 }, frame, CAMERA_DIRECTOR_GATE_SAFE_NDC, 'gate aperture');

  const gateZoom = frame.zoom;
  state.nav.autopilot.active = false;
  const release = director.step(DT, state, player, view());
  assert.equal(release.mode, CameraDirectorMode.RECOVER);
  assert.ok(release.zoom < gateZoom && gateZoom - release.zoom < 8,
    'gate release begins with a small continuous zoom step');
  const recovered = settle(director, CAMERA_DIRECTOR_EASE_S + 0.05, state, player);
  assert.equal(recovered.mode, CameraDirectorMode.FOLLOW);
  assert.equal(recovered.nearPlane, 1);
});

test('Flyby Focus remains authoritative over simultaneous gate autopilot', () => {
  // The lease no longer TAKES the camera, but it still outranks the scenic gate cinematic:
  // bullet time plus a contact closing on the player must never be replaced by a gate approach
  // shot. Suppressing GATE_APPROACH leaves FOLLOW, whose chase composition is threat-aware.
  const player = entity(1, 0, 0, 7, { team: 0 });
  const gate = authoredGate(80, 0, 260);
  const hostile = entity(81, 90, 0, 8, { team: 1 });
  const state = stateFor(player, [gate, hostile], {
    focusActive: true,
    focusTargetId: hostile.id,
    targetId: hostile.id,
  });
  armGateAutopilot(state, gate);
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);
  assert.notEqual(frame.mode, CameraDirectorMode.GATE_APPROACH,
    'a live hostile lease outranks the gate cinematic');
  assert.equal(frame.mode, CameraDirectorMode.FOLLOW,
    'suppressing the gate shot leaves threat-aware FOLLOW, not a pair takeover');
  assert.equal(frame.targetId, null, 'the lease claims no camera pair target');
  assert.equal(frame.nearPlane, 1, 'the lease never inherits gate near clipping');
  assert.equal(frame.zoom, TACTICAL_ZOOM, 'the lease leaves the ordinary follow pose alone');

  // Control: without the lease this exact autopilot does take the gate cinematic, so the
  // suppression above is a real ordering result and not a fixture that could never arm.
  const controlState = stateFor(player, [gate, hostile], { targetId: hostile.id });
  armGateAutopilot(controlState, gate);
  const controlDirector = createCameraDirector();
  controlDirector.syncFollow(0, 0, TACTICAL_ZOOM);
  const controlFrame = settle(controlDirector, 0.5, controlState, player);
  assert.equal(controlFrame.mode, CameraDirectorMode.GATE_APPROACH,
    'control: the same autopilot lease composes the gate when no Focus lease is held');
  assert.ok(controlFrame.nearPlane > 30, 'control: the gate shot really does take the camera');
});

test('chase camera stays finite after death, missing player, or poisoned focus', () => {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = entity(1, 40, -12, 7, {
    team: 0,
    vel: { x: 8, z: 0 },
    maxSpeed: 120,
  });
  const state = stateFor(player, []);
  state.settings = { video: { fov: FOV } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };

  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  camera.follow(DT);
  assert.ok(Number.isFinite(camera.obj.position.x));
  assert.ok(Number.isFinite(state.camera.focus.x));

  player.alive = false;
  player.pos = null;
  camera.follow(DT);
  assert.ok(Number.isFinite(camera.obj.position.x), 'death with a missing pos must not NaN the chase camera');
  assert.ok(Number.isFinite(state.camera.focus.x));

  state.camera.focus.x = NaN;
  state.camera.focus.z = NaN;
  camera.obj.position.set(NaN, NaN, NaN);
  camera.follow(DT);
  assert.ok(Number.isFinite(state.camera.focus.x), 'a poisoned focus must recover');
  assert.ok(Number.isFinite(camera.obj.position.x), 'camera pose must recover from NaN');

  state.entities.delete(player.id);
  assert.doesNotThrow(() => camera.follow(DT));
  assert.ok(Number.isFinite(camera.obj.position.x));

  state.entities = null;
  assert.doesNotThrow(() => camera.follow(DT));
  assert.equal(camera.snapToPlayer(), false, 'snap after the player map is gone is a no-op, not a throw');
  assert.ok(Number.isFinite(camera.obj.position.x));
});

test('camera focus tracks interpolated player position during high-speed flight without jitter or reversals', () => {
  const player = entity(1, 0, 0, 16, { team: 0, vel: { x: 0, y: 0, z: 200 } });
  player.prevPos = { x: 0, y: 0, z: 0 };
  const state = stateFor(player, []);
  state.settings = { video: { fov: FOV } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 400, lerp: 20, trauma: 0 };
  state.input = { aimWorld: null };
  state.render = {};

  const camera = createChaseCamera(state);
  camera.snapToPlayer();

  const dtSim = 1 / 60;
  const speed = 200;
  const simStepDist = speed * dtSim;

  for (let step = 0; step < 180; step++) {
    player.prevPos.z = player.pos.z;
    player.pos.z += simStepDist;
    camera.follow(dtSim, 1);
  }

  // Simulate 144 Hz display frames over multiple sim ticks
  const frameDt = 1 / 144;
  let accum = 0;
  const relHistory = [];

  for (let frame = 0; frame < 24; frame++) {
    accum += frameDt;
    while (accum >= dtSim) {
      accum -= dtSim;
      player.prevPos.z = player.pos.z;
      player.pos.z += simStepDist;
    }
    const alpha = accum / dtSim;
    const interpolatedPlayerZ = player.prevPos.z + (player.pos.z - player.prevPos.z) * alpha;
    camera.follow(frameDt, alpha);
    const relZ = interpolatedPlayerZ - state.camera.focus.z;
    relHistory.push(relZ);
  }

  // Relative distance must monotonically decrease toward steady state without direction reversals
  for (let i = 1; i < relHistory.length; i++) {
    const delta = relHistory[i] - relHistory[i - 1];
    assert.ok(delta > 0, `frame ${i} relative motion must be forward without reversing: delta was ${delta.toFixed(5)}`);
  }
});

test('camera anchors to the presented hull pose, not the last sim-tick window', () => {
  // On a catch-up frame the presented snapshot pack can span several sim ticks while prevPos→pos
  // covers only the latest one. The renderer hands follow() the exact pose the hull drew; the chase
  // anchor and safe-rect must track that or the ship reads as jigging forward/back along its path.
  const player = entity(1, 0, 2000, 16, { team: 0, vel: { x: 0, y: 0, z: 0 } });
  player.prevPos = { x: 0, y: 0, z: 1996.7 };
  const state = stateFor(player, []);
  state.settings = { video: { fov: FOV } };
  state.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 400, lerp: 100, trauma: 0 };
  state.input = { aimWorld: null };
  state.render = {};

  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  assert.ok(Math.abs(state.camera.focus.z - 2000) < 1e-6, 'snap lands on the raw pos');

  // The drawn hull sits one tick behind pos — a pack interpolated across a wider span. With zero
  // velocity there is no look-ahead or composition bias, so focus converges on the anchor itself.
  const presented = { x: 0, y: 0, z: 1990 };
  for (let i = 0; i < 30; i++) camera.follow(DT, 0.5, presented);
  assert.ok(Math.abs(state.camera.focus.z - 1990) < 0.5,
    `focus ${state.camera.focus.z} must converge to the presented pose 1990, not pos 2000`);
  assert.ok(Math.abs(state.camera.focus.z - 2000) > 5,
    'the camera must not re-peg to the latest sim tick');

  // Without a presented pose the fallback still interpolates prevPos→pos by alpha.
  const fallbackPlayer = entity(1, 0, 2000, 16, { team: 0, vel: { x: 0, y: 0, z: 0 } });
  fallbackPlayer.prevPos = { x: 0, y: 0, z: 1996.7 };
  const fallbackState = stateFor(fallbackPlayer, []);
  fallbackState.settings = { video: { fov: FOV } };
  fallbackState.camera = { zoom: TACTICAL_ZOOM, tilt: TILT, lookAhead: 400, lerp: 100, trauma: 0 };
  fallbackState.input = { aimWorld: null };
  fallbackState.render = {};
  const fallbackCamera = createChaseCamera(fallbackState);
  fallbackCamera.snapToPlayer();
  for (let i = 0; i < 30; i++) fallbackCamera.follow(DT, 0.5);
  const simLerp = 1996.7 + (2000 - 1996.7) * 0.5;
  assert.ok(Math.abs(fallbackState.camera.focus.z - simLerp) < 0.5,
    `fallback focus ${fallbackState.camera.focus.z} must converge to the alpha-lerped ${simLerp}`);
});

console.log('camera-focus-separation tests loaded');
