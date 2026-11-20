import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createChaseCamera } from '../src/render/camera.js';
import { feel, resolveHullBlowFeel } from '../src/render/feel.js';
import { createCameraGate, HITSTOP_REARM_S } from '../src/render/shakeAdmission.js';

// OVH-06a / ruling R10 - the camera answers the player, not the room. Real camera controller,
// real feel owner, real gate; only the DOM is stubbed.
function rig({ motionReduce = false, flashReduce = false } = {}) {
  const player = { id: 1, pos: { x: 0, z: 0 }, hull: 1000, hullMax: 1000 };
  const foe = { id: 2, pos: { x: 100, z: 0 } };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 10,
    tick: 600,
    timeScale: 1,
    settings: {
      video: { motionReduce },
      accessibility: { flashReduce },
    },
    ui: { screenStack: [], docked: false },
    entities: new Map([[1, player], [2, foe]]),
    camera: { zoom: 72, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    render: {},
  };
  state.render.cameraGate = createCameraGate();
  state.render.cameraCtrl = createChaseCamera(state, { innerWidth: 1600, innerHeight: 900 });
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  const edge = { style: {}, isConnected: true };
  host._ensureEdge = () => edge;
  host._edgeEl = edge;
  host.init({ state, bus, timeEffects: effects });
  const gate = state.render.cameraGate;
  const count = (kind, ok = true) => gate.events().filter((e) => e.kind === kind && e.ok === ok).length;
  return { state, bus, host, gate, edge, count, ctrl: state.render.cameraCtrl };
}

test('a seeded busy fight of fifty collisions and kills that do not involve the player admits zero camera events', () => {
  const { state, bus, host, gate, ctrl } = rig();
  let seed = 47;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 50; i += 1) {
    state.simTime = 10 + i * 0.05;
    const x = (rnd() - 0.5) * 400;
    const z = (rnd() - 0.5) * 400;
    if (i % 2 === 0) {
      bus.emit('physics:impact', {
        dp: 4000, aId: 30 + i, bId: 80 + i, pos: { x, z }, normal: { x: 1, z: 0 },
      });
      host.frame(0.05, state);
    } else {
      bus.emit('entity:killed', { id: 30 + i, killerId: 9, pos: { x, z }, victimClass: 'fighter' });
    }
    // the room's other emitters, through the same renderer routing
    ctrl.addTrauma(0.3, 'explosion');
    ctrl.addTrauma(0.2, 'kill');
    ctrl.addTrauma(0.2); // untagged
    ctrl.impactKick(1, 0, 1, 'collision');
    ctrl.hold(0.05, 'collision');
  }
  const admitted = gate.events().filter((e) => e.ok);
  assert.deepEqual(admitted, [], 'no room event moves the camera');
  assert.equal(state.camera.trauma, 0);
  assert.equal(ctrl.holdRemaining(), 0);
  const { refused } = gate.counts();
  assert.ok(refused.explosion >= 50 && refused.kill >= 50 && refused.untagged >= 50, 'refusals are counted per cause');
});

test('a 10 % blow to the player admits one kick toward the hit side and one edge pulse; a 5 % blow admits none', () => {
  const { state, bus, host, count, edge, gate } = rig();
  bus.emit('combat:damage', { attackerId: 2, targetId: 1, hullHit: true, hullDamage: 100, amount: 100, pos: { x: 100, z: 0 } });
  assert.equal(count('kick'), 1, 'one kick');
  assert.equal(count('edge'), 1, 'one edge pulse');
  assert.equal(edge.style.display, 'block');
  assert.ok(edge.style.background.includes('105.0%'), 'the pulse sits on the right edge, the side the blow came from');
  assert.ok(state.camera.trauma === 0, 'a hit is a kick, not a shake');
  host.frame(0.5, state);
  assert.ok(Number(edge.style.opacity) < 0.55, 'the pulse decays');

  const quiet = rig();
  quiet.bus.emit('combat:damage', { attackerId: 2, targetId: 1, hullHit: true, hullDamage: 50, amount: 50, pos: { x: 100, z: 0 } });
  assert.equal(quiet.count('kick'), 0);
  assert.equal(quiet.count('edge'), 0);
  assert.equal(quiet.gate.counts().refused.hullChip, 1);
  assert.equal(gate.counts().admitted.hullHit >= 1, true);
});

test('a hard blow under reduced motion or reduced flashing gets the static edge tint, no pulse', () => {
  for (const opts of [{ motionReduce: true }, { flashReduce: true }]) {
    const { state, bus, host, edge } = rig(opts);
    bus.emit('combat:damage', { attackerId: 2, targetId: 1, hullHit: true, hullDamage: 150, amount: 150, pos: { x: -100, z: 0 } });
    const level = Number(edge.style.opacity);
    assert.equal(level, 0.28, 'a steady tint');
    host.frame(0.4, state);
    assert.equal(Number(edge.style.opacity), level, 'it does not pulse or fade while held');
    host.frame(1, state);
    assert.equal(edge.style.display, 'none', 'then it is gone');
  }
  assert.equal(resolveHullBlowFeel(0.1, 1, 0, 'reduced-motion').static, true);
  assert.equal(resolveHullBlowFeel(0.1, 1, 0, 'full').static, false);
  assert.equal(resolveHullBlowFeel(0.05, 1, 0, 'full'), null);
});

test('two hero beats 0.3 s apart get one hitstop, and the simulation clock never moves for it', () => {
  const { state, ctrl, gate } = rig();
  const before = state.simTime;
  ctrl.hold(0.05, 'perfectRelease');
  const first = ctrl.holdRemaining();
  assert.ok(first >= 0.04 && first <= 0.06, `40-60 ms (got ${first})`);
  state.simTime += 0.3;
  ctrl.hold(0.05, 'throwKillHeavy');
  const events = gate.events().filter((e) => e.kind === 'hitstop');
  assert.equal(events.filter((e) => e.ok).length, 1);
  assert.equal(events.filter((e) => !e.ok).length, 1);
  state.simTime += HITSTOP_REARM_S;
  ctrl.hold(0.05, 'bossBreak');
  assert.equal(gate.events().filter((e) => e.kind === 'hitstop' && e.ok).length, 2, 'it re-arms after 0.8 s');
  // hold is presentation only: nothing here wrote the clock or a time effect
  assert.equal(state.timeScale, 1);
  assert.equal(state.simTime, before + 0.3 + HITSTOP_REARM_S, 'only the test advanced simTime');
  // non-hero holds never freeze the frame
  const rig2 = rig();
  rig2.ctrl.hold(0.05, 'collision');
  rig2.ctrl.hold(0.05);
  assert.equal(rig2.ctrl.holdRemaining(), 0);
});

test('a hero beat is admitted one at a time', () => {
  const gate = createCameraGate();
  assert.ok(gate.motion('trauma', 'ploughKill', 0.5, 5) > 0);
  assert.equal(gate.motion('trauma', 'bossBreak', 0.5, 5.1), 0, 'a second hero beat inside the gap is refused');
  assert.ok(gate.motion('trauma', 'bossBreak', 0.5, 5.4) > 0);
});

test('damage numbers default off and the setting still works', () => {
  const state = createGameState(4242);
  assert.equal(state.settings.gameplay.damageNumbers, false);
  state.settings.gameplay.damageNumbers = true;
  assert.equal(state.settings.gameplay.damageNumbers, true);
});

test('a contact the player neither is in nor caused never punches the FOV; the player-caused one still does', () => {
  const { state, host, gate } = rig();
  host._queueCollisionFeel({ tick: 1, deltaV: 60, aId: 30, bId: 31 }, 60, false, 30, 31, 4000, 30, 31);
  assert.equal(host._pendingCollisionFeel, null, 'nothing queued for a room contact');
  host.frame(0.05, state);
  assert.equal(host._fovPunch, 0);
  assert.equal(gate.counts().refused.collisionFov, 1);
  host._queueCollisionFeel({ tick: 2, deltaV: 60, aId: 30, bId: 31, provenance: { actorId: 1 } }, 60, true, 30, 31, 4000, 30, 31);
  assert.ok(host._pendingCollisionFeel, 'the player\'s own throw is queued');
});
