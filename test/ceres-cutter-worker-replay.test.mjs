import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPose } from '../src/data/ceresWorkfleet.js';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { ceresWorkfleetHardwareSpec, ceresWorkfleetWorldPose, reconcileCeresWorkfleetPresentation,
  validateCeresWorkfleetOperation, CERES_WORKFLEET_JOB_ID } from '../src/systems/ceresWorkfleet.js';
import { createWorldSiteRecord, applyWorldSiteOperation } from '../src/systems/worldSiteKernel.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
function sectionSpec() {
  const mass = 1800, radius = 120;
  return { type: 'wreck', alive: true, hull: 1000, pos: ceresWorkfleetWorldPose(C.existing.section.mountedPose),
    vel: { x: 0, z: 0 }, angVel: 0, radius, mass, collides: true,
    data: { worldRecordId: C.identities.payload, worldSiteId: C.siteId, worldSitePayloadId: 'long_plate',
      worldSiteStructural: true, persistenceOwner: 'asteroidSites', worldSitePresentationAdmitted: true },
    physicsBody: { schemaVersion: 1, dynamic: true, radius, mass, inertiaY: mass * 1200, material: 'wreck', ccd: true, revision: 0,
      collisionProxyManifest: { schemaVersion: 1, id: 'audio-proof-section', referenceRadius: 'radius', primitives: C.existing.section.boxes.map(b =>
        ({ kind: 'obb', id: b.id, x: b.center.x / radius, z: b.center.z / radius, hx: b.size.x / 2 / radius, hz: b.size.z / 2 / radius, angle: 0 })) } } };
}
async function fixture() {
  const worker = createSimHost(), main = createGameState(4242), bus = createBus(), helpers = {};
  let receive, initRequest, seq = 0;
  const lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers,
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  const init = await worker.init({ ...initRequest, scenarioContract });
  receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init })); await lane.readyPromise;
  const state = worker.host.state;
  state.mode = 'flight'; state.world.currentSectorId = C.sectorId; main.world.currentSectorId = C.sectorId;
  // The fixture positions real owner hardware at the cut socket; no sim or renderer code changes.
  const breaker = worker.host.runtime.spawn(ceresWorkfleetHardwareSpec('breaker'));
  const head = worker.host.runtime.spawn(ceresWorkfleetHardwareSpec('cutterHead'));
  const at = ceresWorkfleetPose(ceresWorkfleetWorldPose(C.route.breakerWorkPose), C.route.headPosesInBreaker.at(-1));
  head.pos.x = at.x; head.pos.z = at.z; head.rot = at.rot;
  const section = worker.host.runtime.spawn(sectionSpec());
  const job = { id: CERES_WORKFLEET_JOB_ID, worker: C.identities.worker, head: C.identities.cutterHead,
    section: C.identities.payload, cradle: C.identities.cradle, phase: 'head_cut' };
  state.npcJobs = { byId: {}, ceresWorkfleet: job };
  let record = createWorldSiteRecord(manifest);
  const brace = applyWorldSiteOperation(manifest, record, { operationId: 'brace_long_plate', amount: 24,
    requestStreamId: 'player-industrial-beam', requestSequence: 1, tick: 1 });
  assert.equal(brace.ok, true); record = brace.record;
  state.sites.worldById[C.siteId] = record;
  reconcileCeresWorkfleetPresentation({ state });
  const request = { siteId: C.siteId, operationId: 'cut_long_plate_seam', jobId: job.id,
    workerId: breaker.id, headId: head.id, sectionId: section.id, amount: 0.3 };
  const sites = worker.host.registry.get('asteroidSites');
  const ear = Object.create(audio), plays = [], replay = [], ownerReceipts = [];
  worker.host.bus.on('worldSite:operationReceipt', p => {
    if (p.receipt?.requestStreamId === 'ceres-second-measure-cutter') ownerReceipts.push(structuredClone(p));
  });
  const audioClock = { currentTime: 0, close() { return Promise.resolve(); } };
  let eventTick = null;
  bus.on('worldSite:operationReceipt', p => { if (p.receipt?.requestStreamId === 'ceres-second-measure-cutter') { eventTick = p.receipt.tick; replay.push({ tick: eventTick, stateTick: main.tick }); } });
  ear.init({ state: main, bus, helpers });
  ear.rt.ctx = audioClock;
  ear.play = (id, opts) => { plays.push({ id, opts, stateTick: main.tick, eventTick }); return { id }; };
  async function deliver() {
    const reply = await worker.tick({ tick: ++seq, steps: 0, commands: [], generation: 0 });
    audioClock.currentTime = state.tick / 60;
    receive(structuredClone({ kind: 'clockTick', ...reply })); return reply;
  }
  function cut(tick) {
    state.tick = tick; state.simTime = tick / 60;
    const next = { ...request, requestSequence: tick };
    assert.equal(validateCeresWorkfleetOperation(state, next), true, 'real physical owner validation');
    const result = sites.applyCeresWorkfleetOperation(next);
    assert.equal(result.ok, true); assert.ok(result.moved > 0); return result;
  }
  return { worker, main, state, head, ear, plays, replay, ownerReceipts, deliver, cut,
    close() { ear.destroy(); lane.close(); worker.shutdown(); } };
}

test('batched owner receipts retain their tick cadence through production replay', async () => {
  const h = await fixture();
  try {
    await h.deliver();
    const prior = h.main.tick;
    h.cut(prior + 1); h.cut(prior + 2); h.cut(prior + 3);
    assert.equal(h.main.tick, prior, 'worker and facade clocks remain separate before the reply');
    const reply = await h.deliver();
    assert.ok(reply.events.some(e => e.t === 'worldSite:operationReceipt' && e.p.receipt?.amountApplied > 0));
    assert.deepEqual(h.replay, [1, 2, 3].map(n => ({ tick: prior + n, stateTick: prior + 3 })));
    assert.equal(h.plays.length, 1, 'successful current worker receipt makes contact audio');
    assert.equal(h.plays[0].eventTick, prior + 1, 'the first real advance, not just the last batched tick, is heard');

    for (let tick = prior + 4; tick <= prior + 61; tick++) h.cut(tick);
    await h.deliver();
    assert.deepEqual(h.plays.map(p => p.eventTick), [prior + 1, prior + 61],
      'continuous work uses receipt ticks, not artificial batch gaps');
    h.state.tick = prior + 99; await h.deliver();
    assert.equal(h.plays.length, 2, 'no receipt means no continuing cue');
    for (let tick = prior + 100; tick <= prior + 103; tick++) h.cut(tick);
    await h.deliver();
    assert.deepEqual(h.plays.map(p => p.eventTick), [prior + 1, prior + 61, prior + 100],
      'after interruption, current work can sound again');
    // Re-emit genuine old owner payloads through the production bridge to exercise stale and
    // reordered delivery. The test never replaces the host projection or main replay bus.
    h.worker.host.bus.emit('worldSite:operationReceipt', h.ownerReceipts[1]);
    h.worker.host.bus.emit('worldSite:operationReceipt', h.ownerReceipts[0]);
    h.state.tick = prior + 140; await h.deliver();
    assert.equal(h.plays.length, 3, 'stale or reordered owner receipts cannot re-arm audio');

    h.cut(prior + 141);
    h.head.data.playerOwned = true;
    await h.deliver();
    assert.equal(h.main.entities.get(h.head.id).data.playerOwned, true);
    assert.equal(h.plays.length, 3, 'a cutter captured by the end of the batch stays silent');
  } finally { h.close(); }
});

test('a large worker batch cannot stack several contacts at one replay instant', async () => {
  const h = await fixture();
  try {
    await h.deliver();
    const prior = h.main.tick;
    for (let tick = prior + 1; tick <= prior + 70; tick++) h.cut(tick);
    await h.deliver();
    assert.deepEqual(h.plays.map(p => p.eventTick), [prior + 1]);
    h.cut(prior + 71); await h.deliver();
    assert.deepEqual(h.plays.map(p => p.eventTick), [prior + 1], 'adjacent replies cannot stack the sample either');
    h.cut(prior + 107); await h.deliver();
    assert.deepEqual(h.plays.map(p => p.eventTick), [prior + 1, prior + 107]);
  } finally { h.close(); }
});
