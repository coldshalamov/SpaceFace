import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulationRunner } from '../src/core/simulationRunner.js';
import { laneRpc, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { bindStuntEvidence, resetStuntEvidence, unbindStuntEvidence } from '../src/combat/stuntEvidence.js';
import { mapImpulseReceiptIdentities, gradeCausalResidual } from '../src/testing/playerTruth/impulseReceipts.js';

const DT = 1 / 60;
function body(id, generation, x, vx = 0) {
  return { id, occupantGeneration: generation, type: 'wreck', alive: true, hull: 100, hullMax: 100,
    collides: true, radius: 6, mass: 24, pos: { x, z: 0 }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0,
    data: {}, physicsBody: { schemaVersion: 1, dynamic: true, ccd: true, shape: 'ball',
      radius: 6, mass: 24, inertiaY: 48, revision: 0 } };
}
async function fixture(t) {
  uninstallSimCommandSink();
  const state = createGameState(4242), bus = createBus();
  state.mode = 'menu';
  const owner = body(1, 1, -1000), victim = body(2, 2, 0), unforced = body(3, 3, 1000, 20);
  const fieldSource = { id: 'actual-native-cone', ownerId: owner.id, kind: 'cone', tag: 'deploy',
    center: { x: 0, z: 0 }, radius: 100, expireAt: Infinity };
  state.playerId = owner.id;
  state.entityList = [owner, victim, unforced];
  state.entities = new Map(state.entityList.map(e => [e.id, e]));
  bindStuntEvidence(state);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  native.syncFromEntities(state.entityList);
  const registry = { get(name) { return name === 'fields' ? { kernelList: () => [fieldSource] } : null; }, step(dt, boundary) {
    state.tick++; state.simTime += dt;
    boundary.publishInputCommand(state.input, state.tick);
    native.syncFromEntities(state.entityList); native.step(dt);
  } };
  const runner = createSimulationRunner(state, registry, { bus });
  const rpc = async (action, extra = {}) => {
    const response = await laneRpc('playerTruthImpulseObserver', { action, ...extra });
    assert.equal(response.ok, true, response.error);
    return response.result;
  };
  const force = (entity = victim, dv = 10) => queuePhysicsImpulse(entity, { x: entity.mass * dv, y: 0, z: 0 }, {
    kind: 'field', tick: state.tick + 1,
    provenance: { tag: `field_${fieldSource.kind}`, field: { id: fieldSource.id, ownerId: fieldSource.ownerId,
      x: fieldSource.center.x, z: fieldSource.center.z, radius: fieldSource.radius } },
  });
  t.after(() => { runner.close(); native.dispose(); unbindStuntEvidence(state); uninstallSimCommandSink(); });
  return { state, bus, native, runner, victim, unforced, rpc, force, fieldSource };
}
const mapped = capture => mapImpulseReceiptIdentities(capture, (id, generation) => `${id}:${generation}`);
const grade = (capture, e, tick) => gradeCausalResidual(mapped(capture), {
  readerLifeId: `${e.id}:${e.occupantGeneration}`, rawEntityId: e.id,
  occupantGeneration: e.occupantGeneration, throughTick: tick, velocity: e.vel,
});

test('main factory opens the same opt-in observer and attributes actual native field delivery before begin', async t => {
  const f = await fixture(t);
  assert.equal((await f.rpc('status')).reason, 'observer-not-installed');
  const before = JSON.stringify({ entities: f.state.entityList, tick: f.state.tick, mode: f.state.mode });
  const installed = await f.rpc('install', { maxReceipts: 8, maxTicks: 10 });
  assert.equal(installed.ok, true); assert.equal(installed.status, 'armed'); assert.equal(installed.readOnly, true);
  assert.equal(JSON.stringify({ entities: f.state.entityList, tick: f.state.tick, mode: f.state.mode }), before);
  f.state.mode = 'flight'; f.force(); f.runner.stepOnce();
  assert.ok(f.victim.vel.x > 9.9, 'the real Rapier body receives the queued force');
  assert.equal((await f.rpc('status')).pendingReceiptCount, 1);
  assert.equal((await f.rpc('begin', { tick: f.state.tick })).ok, true);
  const capture = await f.rpc('finalize');
  assert.equal(capture.status, 'complete'); assert.equal(capture.receiptCount, 1);
  assert.equal(capture.receipts[0].rawEntityId, f.victim.id);
  assert.equal(capture.receipts[0].occupantGeneration, f.victim.occupantGeneration);
  assert.equal(capture.receipts[0].kind, 'field');
  assert.equal(capture.receipts[0].fieldId, 'actual-native-cone');
  assert.equal(capture.receipts[0].fieldOwnerId, f.state.playerId);
  assert.equal(capture.receipts[0].fieldKind, 'field_cone');
  assert.equal(capture.receipts[0].tick, f.state.tick);
  assert.ok(Math.abs(capture.receipts[0].actualDeltaV.x - 10) < 1e-5);
  assert.equal(grade(capture, f.victim, f.state.tick).ok, true);
  assert.ok(f.unforced.vel.x > 19.9);
  assert.equal(grade(capture, f.unforced, f.state.tick).ok, false, 'unforced motion does not inherit another body receipt');
  const frozen = structuredClone(capture);
  capture.receipts[0].actualDeltaV.x = 100000;
  assert.deepEqual(await f.rpc('status'), frozen, 'a direct main caller cannot alter the retained diagnostic receipts');
  f.force(); f.runner.stepOnce();
  assert.deepEqual(await f.rpc('finalize'), frozen, 'finalize detaches the observer and freezes its snapshot');
});

test('arming before first public New Game/Continue survives empty preparation boundaries', async t => {
  const f = await fixture(t);
  await f.rpc('install');
  resetStuntEvidence(f.state); f.bus.emit('game:newGame', {});
  f.bus.emit('save:restoring', {}); resetStuntEvidence(f.state); f.bus.emit('save:loaded', {});
  f.state.mode = 'flight'; f.force(); f.runner.stepOnce();
  assert.equal((await f.rpc('begin', { tick: f.state.tick })).ok, true);
  const capture = await f.rpc('finalize');
  assert.equal(capture.status, 'complete'); assert.equal(grade(capture, f.victim, f.state.tick).ok, true);
});

for (const boundary of ['game:newGame', 'save:restoring', 'save:loaded']) {
  test(`${boundary} rejects already observed/started evidence rather than carrying it into another life`, async t => {
    const f = await fixture(t);
    await f.rpc('install'); f.state.mode = 'flight';
    await f.rpc('begin', { tick: 0 }); f.force(); f.runner.stepOnce();
    f.bus.emit(boundary, {}); f.force(); f.runner.stepOnce();
    const capture = await f.rpc('finalize');
    assert.equal(capture.ok, false); assert.equal(capture.status, 'stale-session');
    assert.deepEqual(capture.receipts, []);
    assert.equal(grade(capture, f.victim, f.state.tick).ok, false);
  });
}

test('recycled raw ids cannot inherit an old native force receipt', async t => {
  const f = await fixture(t);
  await f.rpc('install'); f.state.mode = 'flight'; f.force(); f.runner.stepOnce();
  const replacement = body(f.victim.id, f.victim.occupantGeneration + 1, 0, 20);
  f.state.entities.set(replacement.id, replacement);
  f.state.entityList[1] = replacement;
  f.force(f.victim, 100); // the retired object cannot command its replacement's native body
  f.runner.stepOnce();
  await f.rpc('begin', { tick: 1 });
  const capture = await f.rpc('finalize');
  assert.equal(capture.status, 'complete'); assert.equal(capture.receiptCount, 1);
  assert.equal(capture.receipts[0].occupantGeneration, f.victim.occupantGeneration);
  assert.ok(replacement.vel.x > 19.9 && replacement.vel.x < 20.1);
  assert.equal(grade(capture, replacement, f.state.tick).ok, false);
});

test('unannounced evidence reset and future begin tick fail closed', async t => {
  const f = await fixture(t);
  await f.rpc('install');
  assert.equal((await f.rpc('begin', { tick: f.state.tick + 1 })).ok, false);
  f.state.mode = 'flight'; f.force(); f.runner.stepOnce();
  resetStuntEvidence(f.state);
  const capture = await f.rpc('finalize');
  assert.equal(capture.ok, false); assert.equal(capture.status, 'stale-session'); assert.deepEqual(capture.receipts, []);
});

test('environmental receipts require a live exact field source at native delivery', async t => {
  const f = await fixture(t);
  f.fieldSource.ownerId = null;
  f.fieldSource.tag = 'environmental';
  await f.rpc('install'); f.state.mode = 'flight'; f.force(); f.runner.stepOnce();
  await f.rpc('begin', { tick: f.state.tick });
  const capture = await f.rpc('finalize');
  assert.equal(capture.status, 'complete');
  assert.equal(capture.receiptCount, 1);
  assert.equal(capture.receipts[0].fieldId, f.fieldSource.id);
  assert.equal(capture.receipts[0].fieldOwnerId, null);
  assert.equal(capture.receipts[0].fieldSourceTag, 'environmental');
  assert.equal(capture.receipts[0].fieldSourceKind, 'cone');
  assert.equal(grade(capture, f.victim, f.state.tick).ok, true, JSON.stringify({ capture, victim: f.victim.vel }));

  const stale = await fixture(t);
  stale.fieldSource.ownerId = null;
  stale.fieldSource.tag = 'environmental';
  stale.fieldSource.expireAt = -1;
  await stale.rpc('install'); stale.state.mode = 'flight'; stale.force(); stale.runner.stepOnce();
  await stale.rpc('begin', { tick: stale.state.tick });
  const rejected = await stale.rpc('finalize');
  assert.equal(rejected.status, 'invalid-receipt');
  assert.equal(grade(rejected, stale.victim, stale.state.tick).ok, false);
});

test('closing an older main factory cannot remove a newer factory RPC owner', async t => {
  const old = await fixture(t), current = await fixture(t);
  await current.rpc('install'); old.runner.close();
  assert.equal((await current.rpc('status')).ok, true);
  current.runner.close();
  const response = await laneRpc('playerTruthImpulseObserver', { action: 'install' });
  assert.equal(response.ok, false, 'closed factories leave no stale local RPC handler');
});
