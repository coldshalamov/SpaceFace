import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  CAMERA_TRAUMA_TUNING,
  createChaseCamera,
  resolveScreenShakeScale,
} from '../src/render/camera.js';
import {
  feel as feelDefinition,
  HS_COMBAT_MAX,
  HS_COOLDOWN_S,
  HS_DASH_LATCH_S,
} from '../src/render/feel.js';

installDomFixture();

test('combat hit-stop is brief, rare, boost/dash-safe, and never mutates input actions', () => {
  const { state, bus, feel } = makeFeelFixture(501);
  const actions = state.input.actions;
  actions.firePrimary = true;

  bus.emit('combat:damage', playerShieldBreak());
  assert.ok(feel._hsTimer > 0 && feel._hsTimer <= HS_COMBAT_MAX,
    `admitted combat hit-stop must be <= ${HS_COMBAT_MAX}s (got ${feel._hsTimer})`);
  assert.strictEqual(state.input.actions, actions, 'the feel layer must leave the live action bag owned by input');
  assert.equal(actions.firePrimary, true, 'an admitted dip must not consume a held action');

  feel.frame(HS_COMBAT_MAX + 0.01, state);
  assert.equal(state.timeScale, 1, 'the shared time-effect request clears when the brief dip expires');
  bus.emit('combat:damage', playerShieldBreak());
  assert.equal(feel._hsTimer, 0, 'the two-second cadence rejects immediate hit-stop spam');

  advanceFeel(feel, state, HS_COOLDOWN_S + 0.01);
  const player = state.entities.get(state.playerId);
  player.flags.boosting = true;
  bus.emit('combat:damage', playerShieldBreak());
  assert.equal(feel._hsTimer, 0, 'boosting rejects a hit-stop even after the cadence is paid');

  player.flags.boosting = false;
  bus.emit('ship:dash', { shipId: state.playerId });
  assert.equal(feel._dashLatch, HS_DASH_LATCH_S, 'the player dash arms only the short render-clock latch');
  bus.emit('combat:damage', playerShieldBreak());
  assert.equal(feel._hsTimer, 0, 'the dash latch rejects an overlapping hit-stop');

  advanceFeel(feel, state, HS_DASH_LATCH_S + 0.01);
  bus.emit('combat:damage', playerShieldBreak());
  assert.ok(feel._hsTimer > 0 && feel._hsTimer <= HS_COMBAT_MAX,
    'hit-stop can return after both the rare-event cadence and dash latch have elapsed');
  feel.frame(HS_COMBAT_MAX + 0.01, state);
  assert.equal(state.timeScale, 1, 'the final admitted request also releases cleanly');
});

test('motion and flash accessibility preferences remain independent', () => {
  const motion = makeFeelFixture(502);
  motion.state.settings.video.motionReduce = true;
  motion.state.settings.accessibility.flashReduce = false;
  motion.bus.emit('player:death', {});
  assert.equal(motion.feel._hsTimer, 0, 'reduced motion suppresses death hit-stop');
  assert.ok(motion.feel._vig > 0, 'reduced motion does not silently suppress the independent flash preference');

  const flash = makeFeelFixture(503);
  flash.state.settings.video.motionReduce = false;
  flash.state.settings.accessibility.flashReduce = true;
  flash.bus.emit('player:death', {});
  assert.ok(flash.feel._hsTimer > 0, 'flash reduction does not silently suppress motion feedback');
  assert.equal(flash.feel._vig, 0, 'flash reduction suppresses the transient death vignette');
  assert.equal(flash.feel._vigEl.style.display, 'none', 'the suppressed vignette never becomes visible');
});

test('combat fire, damage, kill, and death never request FOV or kill-camera zoom', () => {
  const { state, bus, feel } = makeFeelFixture(504);
  let killCameraRequests = 0;
  bus.on('camera:kill', () => { killCameraRequests += 1; });

  bus.emit('combat:fire', { ownerId: state.playerId, weaponId: 'wpn_railgun_m' });
  bus.emit('combat:damage', playerShieldBreak());
  bus.emit('entity:killed', { id: 22, killerId: state.playerId, victimClass: 'fighter', radius: 8 });
  bus.emit('player:death', {});

  assert.equal(feel._fovPunch, 0, 'combat events leave the FOV-punch envelope untouched');
  assert.equal(feel._fovPunchApplied, 0, 'combat events leave the applied FOV offset untouched');
  assert.equal(killCameraRequests, 0, 'combat kills no longer invoke the push-zoom kill camera');
});

test('screen-shake slider and reduced motion scale both translation and rotation at the camera owner', () => {
  assert.equal(resolveScreenShakeScale({ settings: { video: {} } }), 1,
    'a profile without the slider key preserves full authored shake');
  assert.equal(resolveScreenShakeScale({ settings: { video: { screenShake: 0 } } }), 0);
  assert.equal(resolveScreenShakeScale({ settings: { video: { screenShake: 35 } } }), 0.35);
  assert.equal(CAMERA_TRAUMA_TUNING.motionReduceShakeScale, 0,
    'reduced motion structurally suppresses camera shake');

  const baseline = makeCameraFixture({ trauma: 0, screenShake: 0 });
  const muted = makeCameraFixture({ trauma: 1, screenShake: 0 });
  baseline.controller.follow(1 / 30);
  muted.controller.follow(1 / 30);
  assert.deepEqual(muted.state.camera.shakeOffset.toArray(), [0, 0, 0],
    'slider zero produces exactly zero translational shake');
  assert.deepEqual(muted.controller.obj.position.toArray(), baseline.controller.obj.position.toArray(),
    'slider zero preserves the no-trauma camera position exactly');
  assert.deepEqual(muted.controller.obj.quaternion.toArray(), baseline.controller.obj.quaternion.toArray(),
    'slider zero preserves the no-trauma camera rotation exactly');

  const reducedBaseline = makeCameraFixture({ trauma: 0, motionReduce: true });
  const reduced = makeCameraFixture({ trauma: 1, motionReduce: true });
  reducedBaseline.controller.follow(1 / 30);
  reduced.controller.follow(1 / 30);
  assert.deepEqual(reduced.controller.obj.position.toArray(), reducedBaseline.controller.obj.position.toArray(),
    'reduced motion suppresses translational shake');
  assert.deepEqual(reduced.controller.obj.quaternion.toArray(), reducedBaseline.controller.obj.quaternion.toArray(),
    'reduced motion suppresses rotational shake');

  const authored = makeCameraFixture({ trauma: 1 });
  const previousRandom = Math.random;
  Math.random = () => 1;
  try {
    authored.controller.follow(1 / 30);
  } finally {
    Math.random = previousRandom;
  }
  const [shakeX, , shakeZ] = authored.state.camera.shakeOffset.toArray();
  assert.ok(Math.abs(shakeX) > 0 && Math.abs(shakeZ) > 0,
    'the missing/default slider preserves authored translational shake');
  assert.ok(Math.abs(shakeX) <= 1.55 && Math.abs(shakeZ) <= 1.55,
    'default shake remains inside the existing positional hard cap');
  assert.notDeepEqual(authored.controller.obj.quaternion.toArray(), baseline.controller.obj.quaternion.toArray(),
    'the default slider preserves bounded rotational shake');
});

function playerShieldBreak() {
  return { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } };
}

function advanceFeel(feel, state, seconds, step = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) feel.frame(step, state);
}

function makeFeelFixture(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui.screenStack = [];
  state.ui.docked = false;
  state.input.actions ||= {};
  state.entities.set(1, {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    flags: { boosting: false },
  });
  state.entityList.push(state.entities.get(1));
  state.render.cameraCtrl = { addTrauma() {} };
  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const feel = Object.create(feelDefinition);
  feel.init({ state, bus, helpers: {}, timeEffects });
  return { state, bus, feel, timeEffects };
}

function makeCameraFixture({ trauma = 0, screenShake, motionReduce = false } = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 100,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    maxSpeed: 120,
    bank: 0,
    flags: {},
    data: {},
  };
  const video = { fov: 50, motionReduce };
  if (screenShake !== undefined) video.screenShake = screenShake;
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: { video, accessibility: { motionPreference: motionReduce ? 'reduce' : 'system' } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
  };
  const controller = createChaseCamera(state);
  controller.snapToPlayer();
  return { state, player, controller };
}

function installDomFixture() {
  const elements = new Map();
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.className = '';
      this.id = '';
      this.isConnected = true;
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      if (child.id) elements.set(child.id, child);
      return child;
    }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; },
        set globalCompositeOperation(_value) {},
      };
    }
  }
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const hud = new FakeElement('div');
  hud.id = 'hud';
  elements.set(hud.id, hud);
  body.appendChild(hud);
  globalThis.document = {
    body,
    head,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(tagName); },
  };
  globalThis.window = {
    innerWidth: 1600,
    innerHeight: 1000,
    addEventListener() {},
    removeEventListener() {},
  };
}
