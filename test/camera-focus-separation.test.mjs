// CAMERA-FOCUS-SEPARATION-GROK-001
// Separation between ordinary (mining/asteroid/non-hostile) tether camera and combat Flyby Focus.
// Deterministic module tests — no headed browser, no goldens.
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

test('every azimuth admitted by the early Focus envelope fits the camera margin', () => {
  for (let step = 0; step < 16; step++) {
    const angle = step * Math.PI * 2 / 16;
    const player = entity(1, 0, 0, 7, { team: 0, vel: { x: 0, z: 0 } });
    let target = null;
    let pick = null;
    let distance = 280;
    for (; distance >= 120 && !pick; distance -= 5) {
      target = entity(100 + step, Math.cos(angle) * distance, Math.sin(angle) * distance, 10, {
        team: 1,
        vel: { x: -Math.cos(angle) * 180, z: -Math.sin(angle) * 180 },
        data: { combat: { targetId: player.id }, weapons: [{ id: 'focus-fit-test' }] },
      });
      const candidateState = stateFor(player, [target]);
      pick = pickFlybyTarget(candidateState, player, [target]);
    }
    assert.ok(pick, `azimuth ${step} acquires by 120 units`);
    const state = stateFor(player, [target], { focusActive: true, focusTargetId: target.id });
    const director = createCameraDirector();
    director.syncFollow(0, 0, TACTICAL_ZOOM);
    const frame = settle(director, 0.6, state, player);
    assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR, `azimuth ${step} enters Focus pair`);
    assert.equal(frame.overflow, false, `azimuth ${step} does not overflow at admitted range ${distance + 5}`);
    assertInFocusMargin(player, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, `azimuth ${step} player`);
    assertInFocusMargin(target, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, `azimuth ${step} target`);
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

test('Flyby Focus enters FOCUS_PAIR and frames player + exact hostile with 15-20% margin', () => {
  assert.ok(
    CAMERA_DIRECTOR_FOCUS_SAFE_NDC <= 0.7 + 1e-12,
    'Focus safe NDC must encode at least ~15% context margin per side (NDC <= 0.70)',
  );
  assert.ok(
    CAMERA_DIRECTOR_FOCUS_SAFE_NDC >= 0.6 - 1e-12,
    'Focus safe NDC must not exceed ~20% margin floor (NDC >= 0.60)',
  );

  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 110, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    focusActive: true,
    focusTargetId: hostile.id,
    targetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR, 'active Focus uses FOCUS_PAIR');
  assert.equal(frame.targetId, hostile.id, 'Focus frames the authoritative hostile');
  assert.equal(frame.overflow, false, 'in-envelope flyby pair must fit');
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'player');
  assertInFocusMargin(hostile, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'hostile');
});

test('explicit allied onboarding trainer stays inside 10% margins without exceeding authored zoom 180', () => {
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
  // Reproduce the held-out seed where FOLLOW arrived from a wide contextual shot. Training Focus
  // must enforce its authored ceiling on entry instead of easing down through 250-330 zoom.
  director.syncFollow(0, 0, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
  const entered = director.step(DT, state, player, view());
  assert.ok(entered.zoom <= CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
    `training Focus entry zoom ${entered.zoom} must clamp immediately to the authored ceiling`);
  assertInFocusMargin(player, entered, CAMERA_DIRECTOR_SAFE_NDC, 'entry player');
  assertInFocusMargin(trainer, entered, CAMERA_DIRECTOR_SAFE_NDC, 'entry trainer');
  const frame = settle(director, 0.5, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR,
    'the two explicit training flags authorize pair framing without making ordinary allies eligible');
  assert.equal(frame.targetId, trainer.id);
  assert.ok(frame.zoom <= CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
    `training Focus zoom ${frame.zoom} must remain inside the authored 58-180 band`);
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_SAFE_NDC, 'player');
  assertInFocusMargin(trainer, frame, CAMERA_DIRECTOR_SAFE_NDC, 'trainer');
});

test('Flyby Focus threat-aware zoom-out keeps nearby active hostile in frame', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const focusHostile = entity(9, 120, 0, 8, { team: 1 });
  const nearbyAttacker = entity(3, -70, 20, 8, { team: 1, hull: 80 });
  const state = stateFor(player, [focusHostile, nearbyAttacker], {
    focusActive: true,
    focusTargetId: focusHostile.id,
    targetId: focusHostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  const frame = settle(director, 0.55, state, player);

  assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR);
  assertInFocusMargin(player, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'player');
  assertInFocusMargin(focusHostile, frame, CAMERA_DIRECTOR_FOCUS_SAFE_NDC, 'focus hostile');
  // Nearby active attacker must not be cropped off-screen (unseen attacker).
  assertInFocusMargin(nearbyAttacker, frame, CAMERA_DIRECTOR_SAFE_NDC, 'nearby attacker');
  assert.ok(frame.zoom > TACTICAL_ZOOM,
    'threat context should prefer zoom-out over cropping attackers');
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

test('Focus release returns to FOLLOW cleanly without sticky pair target', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(9, 100, 0, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    focusActive: true,
    focusTargetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  settle(director, 0.4, state, player);

  state.player.flybyFocus.active = false;
  state.player.flybyFocus.targetId = null;
  const mid = director.step(DT, state, player, view());
  assert.equal(mid.mode, CameraDirectorMode.RECOVER, 'leaving Focus eases through RECOVER');

  const done = settle(director, CAMERA_DIRECTOR_EASE_S + 0.05, state, player);
  assert.equal(done.mode, CameraDirectorMode.FOLLOW, 'Focus release ends in FOLLOW');
  assert.equal(done.targetId, null, 'pair target clears on release');
  assert.ok(done.zoom <= CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
});

test('Focus release and immediate same-target re-latch remain continuous', () => {
  const player = entity(1, 0, 0, 7, { team: 0 });
  const hostile = entity(10, 120, 20, 8, { team: 1 });
  const state = stateFor(player, [hostile], {
    focusActive: true,
    focusTargetId: hostile.id,
  });
  const director = createCameraDirector();
  director.syncFollow(0, 0, TACTICAL_ZOOM);
  settle(director, 0.5, state, player);

  state.player.flybyFocus.active = false;
  state.player.flybyFocus.targetId = null;
  const recovering = director.step(DT, state, player, view());
  assert.equal(recovering.mode, CameraDirectorMode.RECOVER);
  const recoveryPose = {
    x: recovering.focusX,
    z: recovering.focusZ,
    zoom: recovering.zoom,
  };

  state.player.flybyFocus.active = true;
  state.player.flybyFocus.targetId = hostile.id;
  const relatched = director.step(DT, state, player, view());
  assert.equal(relatched.mode, CameraDirectorMode.FOCUS_PAIR,
    'same hostile can reacquire during recovery without waiting for FOLLOW');
  assert.equal(relatched.targetId, hostile.id);
  assert.ok(Math.hypot(relatched.focusX - recoveryPose.x, relatched.focusZ - recoveryPose.z) < 2,
    'first re-latch frame preserves focus continuity');
  assert.ok(Math.abs(relatched.zoom - recoveryPose.zoom) < 2,
    'first re-latch frame preserves zoom continuity');

  const pair = settle(director, CAMERA_DIRECTOR_EASE_S + 0.05, state, player);
  assert.equal(pair.mode, CameraDirectorMode.FOCUS_PAIR);
  state.player.flybyFocus.active = false;
  state.player.flybyFocus.targetId = null;
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
  assert.equal(frame.mode, CameraDirectorMode.FOCUS_PAIR);
  assert.equal(frame.targetId, hostile.id);
  assert.equal(frame.nearPlane, 1, 'combat pair never inherits gate near clipping');
  assert.ok(frame.zoom <= CAMERA_DIRECTOR_ENGINE_MAX_ZOOM, 'Focus retains its authored combat zoom envelope');
});

console.log('camera-focus-separation tests loaded');
