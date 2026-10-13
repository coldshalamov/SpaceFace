import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { consumePhysicsCommand, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';
import { checkTumble, THRESHOLDS } from '../scripts/player-truth/checks.mjs';
import { applyDomainPathUpdate, configureDomainMirroring, createDomainDiffer } from '../scripts/lib/simReadModel.mjs';

const DT = 1 / 60;
function harness() {
  const player = { id: 1, occupantGeneration: 71, type: 'ship', isPlayer: true, alive: true,
    pos: { x: 36, y: 0, z: 0 }, vel: { x: 0, z: -200 }, rot: -Math.PI / 2, angVel: -200 / 36,
    mass: 20, radius: 6, hull: 100, hullMax: 100, bank: 0, pitch: 0, maxSpeed: 180, flags: {}, data: {},
    physicsBody: { mass: 20, inertiaY: 100, radius: 6 },
    boost: { energy: 220, max: 220, drainRate: 36, regenRate: 28, dashImpulse: 170, dashCost: 28,
      dashCd: 1.8, dashCdT: 0, topSpeedPct: 0, burnDurS: 0, burnCdS: 0 } };
  const anchor = { id: 2, occupantGeneration: 72, type: 'wreck', alive: true, radius: 2, mass: 2000,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, physicsBody: { dynamic: false } };
  const state = { mode: 'flight', tick: 20, simTime: 1, playerId: player.id,
    player: { tether: { active: true, targetId: anchor.id, restLength: 36, phase: 'loaded' } },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic', orbitAssistStrength: 'standard' },
      controls: { flightMode: 'assisted' } },
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, actions: {} },
    ui: { screenStack: [] }, world: {}, nav: {}, flight: { mode: 'manual' },
    entities: new Map([[player.id, player], [anchor.id, anchor]]), entityList: [player, anchor] };
  const bus = createBus(); const system = Object.create(flightV3);
  system.init({ state, bus });
  return { player, anchor, state, bus, system, step() {
    state.tick++; state.simTime += DT; system.update(DT, state);
  } };
}

function transport() {
  configureDomainMirroring({});
  const differ = createDomainDiffer(); const domains = new Map(); const touched = new Set();
  const facade = { flightRuntime: { presentationLocal: 'preserve' } };
  domains.set('flightRuntime', facade.flightRuntime);
  return { facade, land(state, tick) {
    for (const update of differ.diff(state, tick).updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, touched);
      facade[segs[0]] = domains.get(segs[0]);
    }
  } };
}

function readSample(state, player) {
  let callback;
  state.entityList = [player]; state.render = { meshes: new Map() };
  const win = { SF: { THREE, state }, performance: { now: () => state.simTime * 1000 },
    innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {} };
  const reader = installPlayerTruthReader(win, { pxEvery: 0 });
  try {
    reader.start(); callback(); reader.stop();
    return reader.drain().samples[0];
  } finally { reader.dispose(); }
}

function spinTrace(sample, change = () => {}) {
  const samples = Array.from({ length: 20 }, (_, i) => {
    const sim = 10 + i * 0.1; const tick = 600 + i;
    const s = { ...sample, sim, tick, t: i * 100, mode: 'flight', run: null,
      p: { ...sample.p, alive: true, angVel: -6, y: 0, pitch: 0, bank: 0,
        angularIntent: sample.p.angularIntent ? { ...sample.p.angularIntent, sim, tick, targetYawRate: -6 } : null } };
    change(s);
    return s;
  });
  return { meta: { mode: 'adventure' }, samples, events: [], rounds: [] };
}

test('actual swing-carry command reaches native physics, hot worker transport and detached reader samples', async () => {
  const h = harness();
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(h.state.entityList);
    h.step();
    const receipt = h.state.flightRuntime.angularIntent;
    assert.equal(h.player._flightFrame.orbitAssist.carry, true, 'no A/D input: actual assist owns swing carry');
    assert.equal(receipt.source, 'player-flight-v3'); assert.equal(receipt.kind, 'swing-carry');
    assert.equal(receipt.playerId, h.player.id); assert.equal(receipt.occupantGeneration, h.player.occupantGeneration);
    assert.equal(receipt.tick, h.state.tick); assert.equal(receipt.sim, h.state.simTime);
    assert.equal(receipt.targetYawRate, h.player._flightFrame.targetYawRate, 'rate is from the final kernel command');
    assert.ok(Math.abs(receipt.targetYawRate) > THRESHOLDS.tumbleAngVel);
    const command = consumePhysicsCommand(h.player);
    assert.equal(command.control.source, receipt.source);
    assert.equal(receipt.angularAcceleration, command.control.torque.y / h.player.physicsBody.inertiaY,
      'receipt describes the final command queued through physics authority');
    writePhysicsControl(h.player, command.control);
    owner.step(DT, h.state.tick);
    const native = owner.records.get(h.player.id);
    assert.ok(native.appliedTorque.y * command.control.torque.y > 0);
    assert.ok(Math.abs(native.appliedTorque.y) <= Math.abs(command.control.torque.y),
      'native owner retains its separate absolute yaw torque clamp');
    assert.ok(Math.abs(h.player.angVel) > THRESHOLDS.tumbleAngVel, 'native result really is a fast commanded yaw');
    assert.ok(Math.abs(h.player.angVel) <= 6 + 1e-4, 'unchanged native yaw ceiling still applies');
    const channel = transport(); channel.land(h.state, 0);
    assert.deepEqual(channel.facade.flightRuntime.angularIntent, receipt);
    assert.equal(channel.facade.flightRuntime.presentationLocal, 'preserve');
    const sample = readSample(channel.facade, h.player);
    assert.deepEqual(sample.p.angularIntent, receipt);
    assert.notEqual(sample.p.angularIntent, receipt, 'trace retains values, not a mutable owner object');
    assert.equal(checkTumble(spinTrace(sample)).status, 'PASS');
    h.state.player.tether.active = false; h.step(); channel.land(h.state, 1);
    assert.equal(h.state.flightRuntime.angularIntent, null);
    assert.equal(channel.facade.flightRuntime.angularIntent, null, 'clear ships on the next ordinary transport pass');
    assert.equal(sample.p.angularIntent.active, true, 'past sample stays intact after owner retirement');
  } finally { owner.dispose(); }
});

test('nonassist, inactive backend, blocked controls and run lifecycle clear angular authority', () => {
  for (const deactivate of [
    (h) => { h.state.player.tether.active = false; h.step(); },
    (h) => { h.state.settings.gameplay.physicsBackend = 'custom'; h.step(); },
    (h) => { h.state.ui.screenStack = ['pause']; h.step(); },
    (h) => { h.player.alive = false; h.step(); },
    ...['save:loaded', 'game:started', 'player:death', 'player:respawn'].map((event) => (h) => h.bus.emit(event, {})),
  ]) {
    const h = harness(); h.step(); assert.ok(h.state.flightRuntime.angularIntent);
    deactivate(h);
    assert.equal(h.state.flightRuntime.angularIntent, null);
  }
});

test('only a fresh exact owner/life command explains high yaw; unsupported or excessive motion still fails', () => {
  const h = harness(); h.step(); const sample = readSample(h.state, h.player);
  const invalid = [
    (s) => { s.p.angularIntent = null; },
    (s) => { s.p.angularIntent.tick--; },
    (s) => { s.p.angularIntent.sim -= 1; },
    (s) => { s.p.angularIntent.playerId = 99; },
    (s) => { s.p.angularIntent.occupantGeneration++; },
    (s) => { s.p.occupantGeneration = null; s.p.angularIntent.occupantGeneration = null; },
    (s) => { s.p.angularIntent.source = 'unknown'; },
    (s) => { s.p.angularIntent.active = false; },
    (s) => { s.p.angularIntent.kind = 'held-tether'; },
    (s) => { s.p.angularIntent.reason = 'unknown'; },
    (s) => { s.p.angularIntent.targetYawRate = 6; },
    (s) => { s.p.angularIntent.targetYawRate = -1; },
    (s) => { s.p.angularIntent.targetYawRate = NaN; },
    (s) => { s.p.angularIntent.angularAcceleration = NaN; },
    (s) => { s.p.angVel = -9; },
  ];
  assert.equal(checkTumble(spinTrace(sample)).status, 'PASS');
  for (const change of invalid) assert.equal(checkTumble(spinTrace(sample, change)).status, 'FAIL');
  for (const reason of ['engaged', 'line-slack']) assert.equal(checkTumble(spinTrace(sample, (s) => {
    s.p.angularIntent.kind = 'orbit-assist'; s.p.angularIntent.reason = reason;
  })).status, 'PASS', 'active ordinary orbit helm has the same explicit command contract');
  assert.equal(checkTumble(spinTrace(sample, (s) => {
    s.p.angVel = -6 - THRESHOLDS.tumbleAngVel;
  })).status, 'PASS', 'original residual yaw limit is retained exactly');
  assert.equal(checkTumble(spinTrace(sample, (s) => {
    s.p.angVel = -6 - THRESHOLDS.tumbleAngVel - 0.001;
  })).status, 'FAIL');
});

test('commanded yaw never masks pitch, bank or height failures and old traces keep original behavior', () => {
  const h = harness(); h.step(); const sample = readSample(h.state, h.player);
  for (const [key, limit] of [['pitch', THRESHOLDS.tumblePitch], ['bank', THRESHOLDS.tumbleBank], ['y', THRESHOLDS.tumbleY]]) {
    assert.equal(checkTumble(spinTrace(sample, (s) => { s.p[key] = limit + 0.01; })).status, 'FAIL');
  }
  assert.equal(checkTumble(spinTrace(sample, (s) => { delete s.p.angularIntent; delete s.tick; })).status, 'FAIL');
  const held = spinTrace(sample, (s) => { delete s.p.angularIntent; });
  held.events = [{ ev: 'input', kind: 'keydown', code: 'KeyA', sim: 9 }];
  assert.equal(checkTumble(held).status, 'PASS', 'existing manual-yaw input classification is unchanged');
});
