// CAMERA-FOCUS-SEPARATION-GROK-001
// Separation between ordinary (mining/asteroid/non-hostile) tether camera and combat Flyby Focus.
// Deterministic module tests — no headed browser, no goldens.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAMERA_DIRECTOR_EASE_S,
  CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
  CAMERA_DIRECTOR_FOCUS_SAFE_NDC,
  CAMERA_DIRECTOR_MIN_ZOOM,
  CAMERA_DIRECTOR_SAFE_NDC,
  CameraDirectorMode,
  createCameraDirector,
} from '../src/render/cameraDirector.js';
import { resolveChaseComposition } from '../src/render/camera.js';
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

console.log('camera-focus-separation tests loaded');
