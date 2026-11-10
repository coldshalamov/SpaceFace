import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS } from '../src/data/lastShift.js';
import { getCombatKernel } from '../src/combat/kernel.js';

function fixture() {
  const port = { createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true };
  const sim = createSimulation({ seed: 18, systems: [lastShift], helpers: { combatPhysics: port } });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  state.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
    radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const system = sim.registry.get('lastShift'); system.update(0, state);
  const recorder = system._find('recorder'), toasts = [], returns = [], payments = [];
  sim.bus.on('toast', p => toasts.push(p));
  sim.bus.on('lastShift:recorderReturned', p => returns.push(p));
  for (const event of ['economy:grant', 'cargo:add', 'cargo:persistentAdded', 'mission:completed']) {
    sim.bus.on(event, p => payments.push({ event, p }));
  }
  const request = () => sim.bus.emit('lastShift:returnRecorder');
  function dock() {
    player.pos.set(LAST_SHIFT_POS.x, 0, LAST_SHIFT_POS.z); player.vel.set(0, 0, 0);
    recorder.pos.set(player.pos.x + 20, 0, player.pos.z); recorder.vel.set(0, 0, 0);
    return sim.spawn({ type: 'station', team: 2, pos: { x: player.pos.x + 70, z: player.pos.z },
      radius: 80, hull: 1000, hullMax: 1000, mass: 1000,
      data: { stationId: 'station_test_archive', dockRadius: 80 } });
  }
  function tow() {
    const result = getCombatKernel(system.ctx).attachments.create({ defId: 'tether_standard',
      ownerId: player.id, targetId: recorder.id, sourceWorld: player.pos, targetWorld: recorder.pos });
    assert.equal(result.ok, true, result.reason); return result.attachment;
  }
  function reject(pattern) {
    const before = system.serialize();
    request();
    assert.match(toasts.at(-1).text, pattern);
    assert.equal(toasts.at(-1).kind, 'warn');
    assert.deepEqual(system.serialize(), before, 'feedback does not mutate durable evidence or custody');
    assert.deepEqual(returns, []); assert.deepEqual(payments, []);
  }
  return { sim, state, system, player, recorder, port, toasts, returns, payments, request, dock, tow, reject };
}

test('return refusal names the actual berth or tow requirement without conflating them', () => {
  const h = fixture();
  try {
    h.reject(/same slow exterior berth before docking/);
    h.dock(); h.reject(/no current tow/);
    assert.doesNotMatch(h.toasts.at(-1).text, /reel|already accepted/i);
  } finally { h.sim.dispose(); }
});

test('an unavailable original is not falsely reported destroyed or returned', () => {
  const h = fixture();
  try {
    h.recorder.data.persistenceOwner = 'another_owner';
    h.reject(/not available for return here.*does not confirm it was lost/);
    assert.equal(h.recorder.alive, true);
  } finally { h.sim.dispose(); }
});

test('confirmed destroyed or salvaged originals get terminal feedback without losing read facts', () => {
  for (const outcome of ['destroyed', 'salvaged']) {
    const h = fixture();
    try {
      h.system.inspect(h.recorder.id);
      h.sim.bus.emit(outcome === 'destroyed' ? 'entity:killed' : 'salvage:completed',
        outcome === 'destroyed' ? { id: h.recorder.id } : { wreckId: h.recorder.id });
      h.recorder.alive = false;
      h.reject(/destroyed or salvaged and cannot be returned/);
      assert.deepEqual(h.system.readout().clueIds, ['recorder']);
      assert.equal(h.system.archive().ok, true);
    } finally { h.sim.dispose(); }
  }
});

test('restore refusal is not mistaken for an already completed return', () => {
  const h = fixture();
  try {
    h.sim.bus.emit('save:restoring');
    assert.equal(h.system.returnRecorder().reason, 'restoring');
    h.reject(/paused while the saved world restores/);
    assert.doesNotMatch(h.toasts.at(-1).text, /already accepted|same slow exterior berth/);
  } finally { h.sim.dispose(); }
});

test('unconfirmed native custody asks for confirmation, not tighter reeling', () => {
  const h = fixture();
  try {
    h.dock(); const line = h.tow();
    h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    h.port.getAttachmentTelemetry = () => null;
    h.reject(/tow connection is not confirmed.*reeling will not restore custody/);
    assert.equal(line.state, 'active'); assert.equal(h.recorder.alive, true);
  } finally { h.sim.dispose(); }
});

test('a refused release leaves the original and line intact and explains the release failure', () => {
  const h = fixture();
  try {
    h.dock(); const line = h.tow(); h.system.inspect(h.recorder.id);
    delete h.port.cutAttachment;
    h.reject(/tow could not be released.*archive did not accept/);
    assert.equal(line.state, 'active'); assert.equal(h.recorder.alive, true);
  } finally { h.sim.dispose(); }
});

test('a presentation-time custody change is identified without manufacturing a return', () => {
  const h = fixture();
  try {
    h.dock(); const line = h.tow();
    h.sim.bus.on('lastShift:offer', () => { h.recorder.data.persistenceOwner = 'another_owner'; });
    h.request();
    assert.match(h.toasts.at(-1).text, /recorder or berth changed during handoff.*No return was recorded/);
    assert.equal(h.system.serialize().recorderReturn, undefined);
    assert.equal(line.state, 'active'); assert.equal(h.recorder.alive, true);
    assert.deepEqual(h.returns, []); assert.deepEqual(h.payments, []);
  } finally { h.sim.dispose(); }
});

test('reentrant requests explain the pending handoff while the original is accepted once', () => {
  const h = fixture();
  try {
    h.dock(); const line = h.tow(); let nested = 0;
    const off = h.sim.bus.on('lastShift:offer', () => {
      if (nested++ === 0) h.request();
    });
    h.request(); off();
    assert.ok(h.toasts.some(p => /handoff is already in progress/.test(p.text)));
    assert.equal(h.returns.length, 1); assert.equal(line.state, 'broken');
    assert.equal(h.recorder.alive, false); assert.deepEqual(h.payments, []);
    assert.equal(h.system.serialize().bodies.recorder.status, 'returned');
  } finally { h.sim.dispose(); }
});

test('a returned recorder stays accepted across restoration and revisits, without a second payment', () => {
  const h = fixture();
  try {
    h.dock(); h.tow(); h.system.inspect(h.recorder.id); h.request();
    assert.equal(h.returns.length, 1);
    const saved = h.system.serialize();
    h.system.deserialize(JSON.parse(JSON.stringify(saved)));
    h.system.afterContinue(); h.sim.bus.emit('sector:enter');
    h.request();
    assert.match(h.toasts.at(-1).text, /already accepted by the archive.*no second return or payment/);
    assert.equal(h.returns.length, 1); assert.deepEqual(h.payments, []);
    assert.equal(h.system._find('recorder'), null);
    assert.deepEqual(h.system.readout().clueIds, ['recorder']);
    assert.equal(h.system.archive().ok, true);
  } finally { h.sim.dispose(); }
});

test('destroyed system removes the return handler rather than emitting stale feedback', () => {
  const h = fixture();
  try {
    h.system.destroy(); h.request();
    assert.deepEqual(h.toasts, []); assert.deepEqual(h.returns, []); assert.deepEqual(h.payments, []);
  } finally { h.sim.dispose(); }
});

test('release-time custody changes do not create an acceptance receipt', () => {
  const h = fixture();
  try {
    h.dock(); const line = h.tow(); h.system.inspect(h.recorder.id);
    h.sim.bus.on('tether:broken', () => { h.recorder.data.persistenceOwner = 'another_owner'; });
    h.request();
    assert.match(h.toasts.at(-1).text, /recorder or berth changed during handoff.*No return was recorded/);
    assert.equal(h.system.serialize().recorderReturn, undefined);
    assert.equal(line.state, 'broken'); assert.equal(h.recorder.alive, true);
    assert.deepEqual(h.returns, []); assert.deepEqual(h.payments, []);
  } finally { h.sim.dispose(); }
});

test('acceptance callback cannot perform a second return and later requests name the completed return', () => {
  const h = fixture();
  try {
    h.dock(); h.tow(); h.system.inspect(h.recorder.id);
    const off = h.sim.bus.on('lastShift:recorderReturned', () => h.request());
    h.request(); off();
    assert.equal(h.returns.length, 1);
    assert.ok(h.toasts.some(p => /handoff is already in progress/.test(p.text)));
    assert.equal(h.toasts.at(-1).kind, 'good');
    h.request();
    assert.match(h.toasts.at(-1).text, /already accepted by the archive/);
    assert.equal(h.returns.length, 1); assert.deepEqual(h.payments, []);
  } finally { h.sim.dispose(); }
});

test('unrecognized failure reasons use safe feedback rather than inherited properties', () => {
  const h = fixture();
  const original = h.system.returnRecorder;
  try {
    for (const reason of ['future_reason', 'toString']) {
      h.system.returnRecorder = () => ({ ok: false, reason });
      h.reject(/Recorder return is unavailable/);
      assert.doesNotMatch(h.toasts.at(-1).text, /accepted|function/);
    }
  } finally { h.system.returnRecorder = original; h.sim.dispose(); }
});
