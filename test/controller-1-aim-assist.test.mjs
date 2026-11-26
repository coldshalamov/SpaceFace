// CONTROLLER-1 — the twin-stick aim layer: the reticle rides the stick's deflection
// distance, and the soft assist eases it part-way toward a legitimate target inside the
// aim cone — never a snap, never a friendly, never outside the cone, and only on the pad.
// The DOM reticle projects the same aimWorld the sim authored, clamped to the frame.
//
// Run: node --test test/controller-1-aim-assist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { input } = await import('../src/systems/input.js');
const { createGameState } = await import('../src/core/gameState.js');
const { padAimReticlePosition } = await import('../src/ui/uiRoot.js');

function flightState(entities = []) {
  const state = createGameState(1101);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui = { screenStack: [] };
  state.player = { id: 1, tether: { active: false, targetId: null, load: 0 } };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
  };
  state.entities = new Map([[1, player], ...entities]);
  return state;
}

function makeHost(gp) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmTick = -1; host._lastKbmSeq = -1;
  host.helpers = { raycastToPlane: (ndc) => ({ x: ndc.x * 100, z: -ndc.y * 100 }) };
  host.bus = { emit() {} };
  host.gamepad = gp;
  host.touch = null;
  return host;
}

function fakeGp(axes, actions = {}) {
  return {
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0, ...axes },
    actions,
    lastActiveTick: 0, lastActiveSeq: 0,
    isConnected() { return true; },
    tick() {},
  };
}

// A hostile the scanner contract agrees with: enemy team, actively targeting the player.
function hostile(id, x, z) {
  return [id, {
    id, type: 'ship', alive: true, team: 1,
    pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { combat: { targetId: 1 } },
  }];
}

const BEARING = Math.PI / 2; // axes[3] = -1 aims +z in the overhead view
const CONE = 0.16;           // PAD_AIM_ASSIST_CONE — keep in step with input.js

function at(bearing, dist) {
  return [Math.cos(bearing) * dist, Math.sin(bearing) * dist];
}

test('CONTROLLER-1: the reticle rides the stick — deflection sets the aim distance', () => {
  const state = flightState();
  const gp = fakeGp({ rightY: -1 });
  const host = makeHost(gp);
  host._movementSource = 'gamepad';
  host.update(1 / 60, state);
  const full = Math.hypot(state.input.aimWorld.x, state.input.aimWorld.z);
  assert.ok(Math.abs(full - 380) < 2, `full throw reaches the far peg — got ${full.toFixed(1)}`);
  assert.equal(state.input.aimFromStick, true);

  gp.axes.rightY = -0.5;
  state.tick += 1;
  host.update(1 / 60, state);
  const half = Math.hypot(state.input.aimWorld.x, state.input.aimWorld.z);
  assert.ok(half < full - 50 && half >= 110,
    `a half push drops the crosshair closer — got ${half.toFixed(1)}`);
});

test('CONTROLLER-1: the soft assist eases toward a hostile inside the cone', () => {
  const [hx, hz] = at(BEARING + CONE * 0.6, 300); // inside the cone, off the stick bearing
  const state = flightState([hostile(42, hx, hz)]);
  const gp = fakeGp({ rightY: -1 });
  const host = makeHost(gp);
  host._movementSource = 'gamepad';
  host.update(1 / 60, state);

  assert.equal(state.input.aimAssistTargetId, 42, 'the candidate is published for the reticle tint');
  const targetBearing = Math.atan2(hz, hx);
  assert.ok(state.input.aimAngle > BEARING && state.input.aimAngle < targetBearing,
    `aimAngle eased toward the target, never snapped — got ${state.input.aimAngle}, target ${targetBearing}`);
});

test('CONTROLLER-1: the assist refuses a hostile outside the cone, too far, or not hostile', () => {
  for (const [label, ent] of [
    ['outside the cone', hostile(7, ...at(BEARING + CONE * 2, 300))],
    ['beyond the range', hostile(8, ...at(BEARING + 0.05, 800))],
    ['same team as the player', [9, {
      id: 9, type: 'ship', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, data: {},
    }]],
  ]) {
    const state = flightState([ent]);
    const host = makeHost(fakeGp({ rightY: -1 }));
    host._movementSource = 'gamepad';
    host.update(1 / 60, state);
    assert.equal(state.input.aimAssistTargetId, undefined, `no assist — ${label}`);
  }
});

test('CONTROLLER-1: the assist is a player choice and a twin-stick feature', () => {
  const [hx, hz] = at(BEARING + CONE * 0.6, 300);

  const off = flightState([hostile(42, hx, hz)]);
  off.settings.controls.gamepad.stickAimAssist = false;
  const hostOff = makeHost(fakeGp({ rightY: -1 }));
  hostOff._movementSource = 'gamepad';
  hostOff.update(1 / 60, off);
  assert.equal(off.input.aimAssistTargetId, undefined, 'the Settings toggle silences the ease');

  const drive = flightState([hostile(42, hx, hz)]);
  drive.settings.controls.gamepad.scheme = 'drive';
  const hostDrive = makeHost(fakeGp({ rightY: -1 }));
  hostDrive._movementSource = 'gamepad';
  hostDrive.update(1 / 60, drive);
  assert.equal(drive.input.aimAssistTargetId, undefined, 'the legacy drive scheme never assists');
});

test('CONTROLLER-1: releasing the stick clears the assist marker with the reticle', () => {
  const [hx, hz] = at(BEARING + CONE * 0.6, 300);
  const state = flightState([hostile(42, hx, hz)]);
  const gp = fakeGp({ rightY: -1 });
  const host = makeHost(gp);
  host._movementSource = 'gamepad';
  host.update(1 / 60, state);
  assert.equal(state.input.aimAssistTargetId, 42);

  gp.axes.rightY = 0;
  state.tick += 1;
  host.update(1 / 60, state);
  assert.equal(state.input.aimAssistTargetId, undefined, 'the marker dies with the stick aim');
  assert.equal(state.input.aimFromStick, undefined, 'the stick-aim flag clears too');
});

test('CONTROLLER-1: the DOM reticle projects aimWorld and clamps to the frame', () => {
  // A deterministic orthographic stand-in for helpers.worldToScreen.
  const host = {
    helpers: { worldToScreen: (inV, outV) => { outV.x = 640 + inV.x; outV.y = 400 - inV.z; return outV; } },
  };
  const state = { input: { aimFromStick: true, aimWorld: { x: 100, z: 50 } } };
  assert.deepEqual(padAimReticlePosition(host, state, 1280, 800), { x: 740, y: 350 },
    'the projected point lands where the camera puts the aim');

  state.input.aimWorld = { x: 10000, z: 50 };
  assert.deepEqual(padAimReticlePosition(host, state, 1280, 800), { x: 1280, y: 350 },
    'an off-frame aim clamps to the edge instead of vanishing');

  state.input.aimFromStick = false;
  assert.equal(padAimReticlePosition(host, state, 1280, 800), null, 'mouse aim uses the pointer path');
  state.input.aimFromStick = true;
  state.input.aimWorld = { x: NaN, z: 0 };
  assert.equal(padAimReticlePosition(host, state, 1280, 800), null, 'a corrupt aim never renders');
});
