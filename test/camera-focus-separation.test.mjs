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
import { createChaseCamera, resolveChaseComposition } from '../src/render/camera.js';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';

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
      targetId: null,
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
  assert.equal(state.player.targetId, hostile.id);
  assert.equal(state.timeScale, 0.5, 'Focus owns 50% time scale through timeEffects authority');

  // Mining tether active blocks further acquisition after release, and never arms focus on rock.
  system.update(DT, state); // still active
  state.player.tether.active = true;
  state.player.tether.targetId = rock.id;
  // Expire focus window
  state.simTime = state.player.flybyFocus.until + 0.01;
  system.update(DT, state);
  assert.equal(state.player.flybyFocus.active, false, 'Focus releases when window ends');
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

console.log('camera-focus-separation tests loaded');
