import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { tickAutoTarget, toggleAutoTarget } from '../src/combat/autoTargetMode.js';
import { aimTrueProjectileVelocity } from '../src/combat/tetherFireControl.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { input } from '../src/systems/input.js';
import * as flightModule from '../src/systems/flightV3.js';
import { solveLeadAngle, weapons } from '../src/systems/weapons.js';

function steeringState() {
  const state = createGameState(0xa07057ee);
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { weapons: [] },
  };
  const hostile = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 300, z: 0 },
    vel: { x: 0, z: 0 },
  };
  state.playerId = player.id;
  state.player.targetId = hostile.id;
  state.entities.set(player.id, player);
  state.entities.set(hostile.id, hostile);
  state.entityList.push(player, hostile);
  state.input.autoFire = true;
  state.input.pointerScreen = { x: 700, y: 80, active: true };
  return { state, player, hostile };
}

test('relative trackpad motion draws a persistent world route from the ship instead of emitting a momentary arrow', () => {
  const restore = installInputBrowser();
  try {
    const { state, player } = steeringState();
    state.mode = 'flight';
    const subject = Object.create(input);
    subject.init({
      state,
      bus: createBus(),
      helpers: {
        worldToScreen(point) {
          return { x: 400 + point.x, y: 300 - point.z, onScreen: true };
        },
        raycastToPlane(ndc) {
          return { x: ndc.x * 400, z: ndc.y * 300 };
        },
      },
    });
    subject.update(1 / 60, state);
    const mousemove = globalThis.__inputListeners.get('mousemove')[0];

    mousemove({ type: 'mousemove', clientX: 400, clientY: 300, movementX: 0, movementY: -90 });
    globalThis.__setInputNow(1010);
    mousemove({ type: 'mousemove', clientX: 400, clientY: 300, movementX: 90, movementY: 0 });
    subject.update(1 / 60, state);

    const route = state.input.autoTargetPath;
    assert.equal(route.active, true);
    assert.equal(route.drawing, true);
    assert(route.points.length >= 3,
      'the two-dimensional gesture should retain enough world points to describe its curve');
    assert.deepEqual(route.points[0], { x: player.pos.x, z: player.pos.z },
      'every gesture starts at the ship, regardless of where the finger lands on the trackpad');
    assert(route.points.at(-1).x > 0 && route.points.at(-1).z > 0,
      'the route endpoint should match the integrated up-then-right screen gesture');

    globalThis.__setInputNow(1200);
    subject.update(1 / 60, state);
    assert.equal(route.active, true,
      'lifting or pausing must leave the route available for the ship to finish');
    assert.equal(route.drawing, false,
      'idle time ends drawing without discarding the flight plan');
  } finally {
    restore();
  }
});

test('auto-target follows a drawn curve after input stops and settles at its endpoint', () => {
  const { state, player } = steeringState();
  state.input.autoTargetVector = {
    active: false,
    screenX: 0,
    screenY: 0,
    worldX: 0,
    worldZ: 0,
    magnitude: 0,
  };
  state.input.autoTargetPath = {
    active: true,
    drawing: false,
    cursorX: 500,
    cursorY: 200,
    pointIndex: 1,
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 120 },
      { x: 120, z: 120 },
    ],
  };

  tickAutoTarget(state, 1 / 60, null);
  assert(state.input.moveX > 0.8,
    'the ship should keep translating toward the first curve leg after the gesture has ended');
  assert(state.input.turnIntent > 0.8,
    'the nose should keep acquiring the route rather than losing yaw authority after 110 ms');

  player.pos = { x: 0, z: 116 };
  player.rot = Math.PI / 2;
  tickAutoTarget(state, 1 / 60, null);
  assert.equal(state.input.autoTargetPath.pointIndex, 2,
    'reaching the first leg should advance the route instead of cutting directly to idle');
  assert(state.input.moveX < -0.8,
    'the next command should bend onto the second leg of the drawn curve');

  player.pos = { x: 120, z: 120 };
  player.vel = { x: 0, z: 0 };
  tickAutoTarget(state, 1 / 60, null);
  assert.equal(state.input.autoTargetPath.active, false,
    'arrival at the final point should complete the route');
  assert.equal(state.input.moveX, 0);
  assert.equal(state.input.moveZ, 0);
  assert.equal(state.input.turnIntent, 0);
});

test('auto-target advances past an overshot curve point instead of doubling back at path speed', () => {
  const { state, player } = steeringState();
  player.pos = { x: 0, z: 145 };
  player.vel = { x: 0, z: 210 };
  player.rot = Math.PI / 2;
  state.input.autoTargetPath = {
    active: true,
    drawing: false,
    cursorX: 500,
    cursorY: 200,
    pointIndex: 1,
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 120 },
      { x: 400, z: 120 },
    ],
  };

  tickAutoTarget(state, 1 / 60, null);

  assert.equal(state.input.autoTargetPath.pointIndex, 2,
    'crossing a waypoint plane must advance the curve even when no tick landed inside its radius');
  const worldCommandX = Math.cos(player.rot) * state.input.moveZ
    - Math.sin(player.rot) * state.input.moveX;
  assert(worldCommandX > 0.5,
    'the next command must continue around the curve rather than reverse toward the passed point');
});

test('moving-target lead matches the actual aim-true projectile path during a strafing run', () => {
  const shooter = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 120 },
  };
  const target = {
    pos: { x: 300, z: 0 },
    vel: { x: 0, z: 70 },
    radius: 8,
  };
  const angle = solveLeadAngle(shooter, target, 320);
  const projectileVel = aimTrueProjectileVelocity(angle, 320, shooter.vel);
  const relativePos = {
    x: target.pos.x - shooter.pos.x,
    z: target.pos.z - shooter.pos.z,
  };
  const relativeVel = {
    x: target.vel.x - projectileVel.x,
    z: target.vel.z - projectileVel.z,
  };
  const relativeSpeedSq = relativeVel.x * relativeVel.x + relativeVel.z * relativeVel.z;
  const closestT = Math.max(0, -(
    relativePos.x * relativeVel.x + relativePos.z * relativeVel.z
  ) / relativeSpeedSq);
  const missDistance = Math.hypot(
    relativePos.x + relativeVel.x * closestT,
    relativePos.z + relativeVel.z * closestT
  );

  assert(missDistance < 0.5,
    `lead solver and spawned projectile must share one ballistic model; miss=${missDistance}`);
});

test('auto-target solves every mount against a moving enemy using that mount ballistic model', () => {
  const state = createGameState(0xa070a11);
  state.mode = 'flight';
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    rot: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 60 },
    cap: 200,
    flags: {},
    data: {
      weapons: [
        projectileMount('wpn_railgun_m', 240, 0),
        projectileMount('wpn_railgun_m', 700, 1),
        {
          defId: 'wpn_beam_laser_m',
          slotIndex: 2,
          facing: 'front',
          facingAngle: 0,
          gimbalArc: Math.PI,
          muzzleOffset: [0, 0],
          continuous: true,
          range: 520,
          energyCost: 14,
          _heat: 0,
        },
      ],
      combat: {},
      derived: { cap: 200 },
    },
  };
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 10,
    team: 1,
    pos: { x: 300, z: 0 },
    vel: { x: 0, z: 100 },
    data: { ai: { fsm: 'attack' }, combat: { targetId: player.id } },
  };
  state.playerId = player.id;
  state.player.targetId = target.id;
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);
  state.input.autoFire = true;
  state.input.fire = true;
  const spawned = [];
  weapons.init({
    state,
    bus: createBus(),
    helpers: {
      getEntity: (id) => state.entities.get(id) || null,
      spawnEntity(spec) { spawned.push(spec); return { id: 100 + spawned.length, ...spec }; },
      hash32,
      mulberry32,
    },
  });

  weapons.update(1 / 60, state);

  assert.equal(spawned.length, 2);
  for (const projectile of spawned) {
    const miss = closestLinearMiss(projectile.pos, projectile.vel, target.pos, target.vel);
    assert(miss <= target.radius,
      `projectile speed ${Math.hypot(projectile.vel.x, projectile.vel.z).toFixed(1)} should intersect the target; miss=${miss}`);
  }
  assert.equal(state.combat.beams.length, 1);
  const beam = state.combat.beams[0];
  const beamMiss = pointLineDistance(target.pos, beam.from, beam.to);
  assert(beamMiss <= target.radius,
    `hitscan auto-target must aim at the target current position; miss=${beamMiss}`);
});

test('auto-target flick vector commands world travel direction while weapon aim stays on the lock', () => {
  const { state, player } = steeringState();
  player.rot = 0;
  state.input.aimWorld = { x: 300, z: 0 };
  state.input.aimAngle = 0;
  state.input.autoTargetVector = {
    active: true,
    screenX: 0,
    screenY: 1,
    worldX: 0,
    worldZ: 1,
    magnitude: 1,
  };

  tickAutoTarget(state, 1 / 60, null);

  assert(Math.abs(state.input.moveX - 1) < 1e-9,
    'screen/world up must produce immediate +Z lateral thrust when the ship faces +X');
  assert(Math.abs(state.input.moveZ) < 1e-9,
    'world-direction flight must not reinterpret screen up as ship-local forward');
  assert(state.input.turnIntent > 0.9,
    'the nose should concurrently catch up toward the requested +Z travel heading');
  assert.equal(state.input.aimAngle, 0,
    'the locked hostile remains the independent weapon-aim authority');

  player.rot = Math.PI / 2;
  tickAutoTarget(state, 1 / 60, null);
  assert(Math.abs(state.input.moveX) < 1e-9);
  assert(Math.abs(state.input.moveZ - 1) < 1e-9,
    'the same world vector becomes forward thrust after the nose reaches that heading');
  assert(Math.abs(state.input.turnIntent) < 1e-9);
});

test('an inactive auto-target flick does not erase direct keyboard steering', () => {
  const { state } = steeringState();
  state.input.turnIntent = -0.65;
  state.input.autoTargetVector = {
    active: false,
    screenX: 0,
    screenY: 0,
    worldX: 0,
    worldZ: 0,
    magnitude: 0,
  };

  tickAutoTarget(state, 1 / 60, null);

  assert.equal(state.input.turnIntent, -0.65,
    'center is neutral; keyboard yaw remains available without a hidden mouse demand');
});

test('flick magnitude provides granular travel speed without changing its direction', () => {
  const { state, player } = steeringState();
  player.rot = 0;
  state.input.autoTargetVector = {
    active: true,
    screenX: -1,
    screenY: 0,
    worldX: -1,
    worldZ: 0,
    magnitude: 0.4,
  };

  tickAutoTarget(state, 1 / 60, null);

  assert(Math.abs(state.input.moveZ + 0.4) < 1e-9,
    'a 40% opposite flick should request 40% reverse thrust in the same world direction');
  assert(Math.abs(state.input.moveX) < 1e-9);
});

test('auto-target helm mode raises yaw speed, acceleration, and reversal braking by 50 percent', () => {
  assert.equal(typeof flightModule.applyAutoTargetHelmProfile, 'function');
  const tuned = flightModule.applyAutoTargetHelmProfile({
    maxYawRate: 2,
    yawAccel: 6,
    yawBrake: 8,
    mainAccel: 40,
  });
  assert.deepEqual(tuned, {
    maxYawRate: 3,
    yawAccel: 9,
    yawBrake: 12,
    mainAccel: 40,
  });
});

test('an active drawn route gets 60 percent translational overdrive without invoking boost', () => {
  assert.equal(typeof flightModule.applyAutoTargetPathProfile, 'function');
  const tuned = flightModule.applyAutoTargetPathProfile({
    mainAccel: 40,
    strafeAccel: 24,
    reverseAccel: 30,
    maxSpeed: 150,
    combatSpeed: 100,
    precisionSpeed: 70,
    boostAccelMult: 2.1,
  });
  assert.equal(tuned.mainAccel, 64);
  assert(Math.abs(tuned.strafeAccel - 38.4) < 1e-9);
  assert.equal(tuned.reverseAccel, 48);
  assert.equal(tuned.maxSpeed, 240);
  assert.equal(tuned.combatSpeed, 160);
  assert.equal(tuned.precisionSpeed, 112);
  assert.equal(tuned.boostAccelMult, 2.1,
    'route overdrive must not impersonate or modify the resource-gated boost system');
});

test('auto-target shows the route endpoint and curve instead of a yaw arrow or joystick gate', () => {
  const source = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /if \(autoTarget\) \{[\s\S]{0,500}projectLockedReticle/,
    'the only software cursor must not disappear onto the independently aimed hostile');
  assert.match(source, /auto-target-flight-path/,
    'the flight computer needs a visible endpoint and route for the ship to follow');
  assert.match(source, /sf-flight-path__route/,
    'curved gestures need a projected route rather than a direction-only indicator');
  assert.doesNotMatch(source, /auto-target-flight-vector/,
    'the disconnected yaw-arrow feedback must be removed');
  assert.doesNotMatch(source, /auto-target-stick-(?:base|puck)/,
    'the rejected virtual joystick gate and moving puck must be removed');
});

test('auto-target activation explains the captured gesture control', () => {
  const state = createGameState(0xa0707ea5);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (toast) => toasts.push(toast));

  toggleAutoTarget(state, bus);

  assert.match(toasts.at(-1).text, /draw to fly/i);
});

test('G acquires canvas pointer lock for bounded steering and releases it when disabled', async () => {
  const previous = installPointerLockBrowser();
  try {
    const state = createGameState(0xa07010c0);
    const bus = createBus();
    const subject = Object.create(autoTargetAssist);
    subject.init({ state, bus, helpers: {} });

    const keydown = globalThis.__autoTargetListeners.get('keydown')[0];
    const keyup = globalThis.__autoTargetListeners.get('keyup')[0];
    const event = keyEvent();
    keydown(event);
    await Promise.resolve();

    assert.equal(state.input.autoFire, true);
    assert.equal(globalThis.__autoTargetCanvas.lockRequests, 1,
      'enabling auto-target must capture relative trackpad/mouse motion inside the game window');

    keyup(event);
    keydown(keyEvent());
    assert.equal(state.input.autoFire, false);
    assert.equal(globalThis.__autoTargetDocument.exitRequests, 1,
      'disabling auto-target must return the OS pointer immediately');

    subject.destroy();
  } finally {
    previous();
  }
});

test('losing pointer lock or leaving flight cancels auto-target instead of restoring edge escape', async () => {
  const previous = installPointerLockBrowser();
  try {
    const state = createGameState(0xa070e5ca);
    state.mode = 'flight';
    const bus = createBus();
    const subject = Object.create(autoTargetAssist);
    subject.init({ state, bus, helpers: {} });
    const keydown = globalThis.__autoTargetListeners.get('keydown')[0];
    const keyup = globalThis.__autoTargetListeners.get('keyup')[0];

    keydown(keyEvent());
    await Promise.resolve();
    assert.equal(state.input.autoFire, true);
    const pointerLockListeners = globalThis.__autoTargetListeners.get('document:pointerlockchange') || [];
    assert.equal(pointerLockListeners.length, 1,
      'auto-target must observe Escape or platform pointer-lock loss');
    globalThis.__autoTargetDocument.pointerLockElement = null;
    pointerLockListeners[0]();
    assert.equal(state.input.autoFire, false,
      'pointer-lock loss must cancel the steering mode that depended on it');

    keyup(keyEvent());
    keydown(keyEvent());
    await Promise.resolve();
    assert.equal(state.input.autoFire, true);
    bus.emit('mode:changed', { mode: 'menu', previousMode: 'flight' });
    assert.equal(state.input.autoFire, false,
      'leaving flight must cancel auto-target and release its pointer capture');

    subject.destroy();
  } finally {
    previous();
  }
});

test('later trackpad motion extends the remaining route instead of erasing it', () => {
  const restore = installInputBrowser();
  try {
    const state = createGameState(0xa070571c);
    const bus = createBus();
    const player = {
      id: 1,
      type: 'ship',
      alive: true,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      data: { weapons: [] },
    };
    state.playerId = player.id;
    state.entities.set(player.id, player);
    state.entityList.push(player);
    state.mode = 'flight';
    state.input.autoFire = true;
    const subject = Object.create(input);
    subject.init({
      state,
      bus,
      helpers: {
        raycastToPlane(ndc) {
          // Perspective projection expands horizontal NDC by the viewport aspect ratio.
          return { x: ndc.x * (innerWidth / innerHeight) * 100, z: ndc.y * 100 };
        },
      },
    });

    subject.update(1 / 60, state);
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    assert.deepEqual(subject._screen, { ...center, active: true },
      'enabling auto-target keeps the hidden software pointer at screen center');

    const mousemove = globalThis.__inputListeners.get('mousemove')[0];
    mousemove({ type: 'mousemove', clientX: center.x, clientY: center.y, movementX: 120, movementY: 0 });
    subject.update(1 / 60, state);
    const originalRoute = state.input.autoTargetPath;
    const firstEndpoint = { ...originalRoute.points.at(-1) };
    const originalPointCount = originalRoute.points.length;

    globalThis.__setInputNow(1200);
    subject.update(1 / 60, state);
    assert.equal(state.input.autoTargetPath.active, true);
    assert.equal(state.input.autoTargetPath.drawing, false);

    globalThis.__setInputNow(1210);
    mousemove({ type: 'mousemove', clientX: center.x, clientY: center.y, movementX: -12, movementY: 0 });
    subject.update(1 / 60, state);
    const extended = state.input.autoTargetPath;
    assert.equal(extended, originalRoute,
      'finger lift and re-contact must continue the same route object');
    assert(extended.points.length > originalPointCount,
      'a small later gesture should append a segment rather than destroy earlier work');
    assert(extended.points.some((point) => point.x === firstEndpoint.x && point.z === firstEndpoint.z),
      'the previously drawn endpoint must remain in the curve');
    assert.equal(extended.drawing, true);
  } finally {
    restore();
  }
});

test('a long drawn curve never drops unflown segments to satisfy a point cap', () => {
  const restore = installInputBrowser();
  try {
    const { state } = steeringState();
    const subject = Object.create(input);
    subject.init({
      state,
      bus: createBus(),
      helpers: {
        worldToScreen(point) {
          return { x: 400 + point.x, y: 300 - point.z, onScreen: true };
        },
        raycastToPlane(ndc) {
          return { x: ndc.x * 400, z: ndc.y * 300 };
        },
      },
    });
    subject.update(1 / 60, state);
    const mousemove = globalThis.__inputListeners.get('mousemove')[0];

    mousemove({ type: 'mousemove', clientX: 400, clientY: 300, movementX: 9, movementY: 0 });
    const firstUnflownPoint = { ...state.input.autoTargetPath.points[1] };
    for (let i = 0; i < 70; i++) {
      globalThis.__setInputNow(1001 + i);
      mousemove({
        type: 'mousemove',
        clientX: 400,
        clientY: 300,
        movementX: i % 2 === 0 ? -9 : 9,
        movementY: -9,
      });
    }

    assert(state.input.autoTargetPath.points.length > 48,
      'an untraversed curve may exceed the old storage cap without losing intent');
    assert(state.input.autoTargetPath.points.some((point) => (
      point.x === firstUnflownPoint.x && point.z === firstUnflownPoint.z
    )), 'the oldest unflown segment must remain part of the route');
  } finally {
    restore();
  }
});

function projectileMount(defId, projSpeed, slotIndex) {
  return {
    defId,
    slotIndex,
    facing: 'front',
    facingAngle: 0,
    gimbalArc: Math.PI,
    muzzleOffset: [0, 0],
    projSpeed,
    range: 1100,
    rof: 1,
    energyCost: 1,
    dmg: 10,
    _cooldown: 0,
    _heat: 0,
  };
}

function closestLinearMiss(projectilePos, projectileVel, targetPos, targetVel) {
  const rx = targetPos.x - projectilePos.x;
  const rz = targetPos.z - projectilePos.z;
  const rvx = targetVel.x - projectileVel.x;
  const rvz = targetVel.z - projectileVel.z;
  const speedSq = rvx * rvx + rvz * rvz;
  const t = speedSq > 1e-9 ? Math.max(0, -(rx * rvx + rz * rvz) / speedSq) : 0;
  return Math.hypot(rx + rvx * t, rz + rvz * t);
}

function pointLineDistance(point, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSq = dx * dx + dz * dz;
  if (!(lengthSq > 1e-9)) return Math.hypot(point.x - from.x, point.z - from.z);
  const t = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSq));
  return Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t));
}

function keyEvent() {
  return {
    code: 'KeyG',
    target: { closest: () => null },
    preventDefault() {},
    stopImmediatePropagation() {},
  };
}

function installPointerLockBrowser() {
  const saved = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    document: globalThis.document,
    window: globalThis.window,
  };
  const listeners = new Map();
  const canvas = {
    lockRequests: 0,
    requestPointerLock() {
      this.lockRequests += 1;
      doc.pointerLockElement = this;
      return Promise.resolve();
    },
  };
  const doc = {
    pointerLockElement: null,
    exitRequests: 0,
    getElementById: (id) => id === 'gl-canvas' ? canvas : null,
    addEventListener(type, fn) {
      const list = listeners.get(`document:${type}`) || [];
      list.push(fn);
      listeners.set(`document:${type}`, list);
    },
    removeEventListener(type, fn) {
      const key = `document:${type}`;
      const list = listeners.get(key) || [];
      listeners.set(key, list.filter((item) => item !== fn));
    },
    exitPointerLock() {
      this.exitRequests += 1;
      this.pointerLockElement = null;
    },
    body: { classList: { contains: () => false } },
  };
  globalThis.__autoTargetListeners = listeners;
  globalThis.__autoTargetCanvas = canvas;
  globalThis.__autoTargetDocument = doc;
  globalThis.addEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    list.push(fn);
    listeners.set(type, list);
  };
  globalThis.removeEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    listeners.set(type, list.filter((item) => item !== fn));
  };
  globalThis.document = doc;
  globalThis.window = globalThis;
  return () => {
    globalThis.addEventListener = saved.addEventListener;
    globalThis.removeEventListener = saved.removeEventListener;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    delete globalThis.__autoTargetListeners;
    delete globalThis.__autoTargetCanvas;
    delete globalThis.__autoTargetDocument;
  };
}

function installInputBrowser() {
  const saved = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    performance: globalThis.performance,
  };
  const listeners = new Map();
  const canvas = {
    addEventListener(type, fn) {
      const list = listeners.get(`canvas:${type}`) || [];
      list.push(fn);
      listeners.set(`canvas:${type}`, list);
    },
  };
  const doc = {
    pointerLockElement: canvas,
    getElementById: (id) => id === 'gl-canvas' ? canvas : null,
    body: { classList: { contains: () => false } },
  };
  globalThis.__inputListeners = listeners;
  globalThis.addEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    list.push(fn);
    listeners.set(type, list);
  };
  globalThis.removeEventListener = () => {};
  globalThis.document = doc;
  globalThis.window = globalThis;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [], maxTouchPoints: 0 },
  });
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  let now = 1000;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.__setInputNow = (value) => { now = value; };
  return () => {
    globalThis.addEventListener = saved.addEventListener;
    globalThis.removeEventListener = saved.removeEventListener;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
    globalThis.innerWidth = saved.innerWidth;
    globalThis.innerHeight = saved.innerHeight;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: saved.performance });
    delete globalThis.__inputListeners;
    delete globalThis.__setInputNow;
  };
}
