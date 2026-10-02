// S1 Phase-A spike — golden-in-worker probe.
//
// Runs the 47-A golden composition inside a real worker_threads worker
// (scripts/lib/wholeSimWorker.mjs) while the main thread keeps the production
// present-side machinery: the 8-deep completedTick ring, the REAL
// createPresentationPublisher + createPresentationWorld, and journal-range acks.
// Journal records cross as packed typed arrays (the "byte-range"); entity-info
// blocks feed a main-side read-model projection for resolver sites.
//
// Gates:
//   (a) hash parity — worker finalize sha256 === golden sha256
//   (b) transport — pack(worker) + post/decode + consume(main) < 0.5 ms/tick
//   (c) ring bounds — completedTick ring ≤ 8; journal overflow→rebuild exercised
//       via --journal-capacity / --ack-stall; pause gate via --probe pause
//   (d) command channel — stage 1: every directive mutation crosses as a typed
//       {input|bus|settings|rpc} envelope; worker-side inputCommandHistory.toTape()
//       must byte-match the main-side reference recording (lossless transport)
//
// Usage:
//   node scripts/sf-sim-worker-spike.mjs [--ticks 720] [--seed 47]
//     [--inputs test/47a.inputs.json] [--reload-at 600] [--repeat 1]
//     [--pipeline N] [--journal-capacity N] [--ack-stall] [--probe pause]
//     [--expected-hash <sha256>] [--json]

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { createPresentationJournalRecord, PRESENTATION_JOURNAL_KINDS } from '../src/core/presentationJournal.js';
import { createInputCommandHistory } from '../src/core/inputCommandSnapshot.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createSimCommandRing } from './lib/simCommandChannel.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKER_PATH = resolve(ROOT, 'scripts/lib/wholeSimWorker.mjs');
const GOLDEN_HASH = 'e517a97bd256045b0db0f96a7124a5abd539478a84ee305e36e1eb8479449dd3';
const COMPLETED_TICK_RING_DEPTH = 8;

const argv = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}
function argInt(flag, fallback) {
  const v = argValue(flag, null);
  return v == null ? fallback : Number.parseInt(v, 10);
}

const OPT = {
  seed: argInt('--seed', 47),
  ticks: argInt('--ticks', 720),
  inputs: argValue('--inputs', 'test/47a.inputs.json'),
  reloadAt: argInt('--reload-at', 600),
  repeat: argInt('--repeat', 1),
  pipeline: Math.max(1, Math.min(COMPLETED_TICK_RING_DEPTH, argInt('--pipeline', 1))),
  consumeBatch: Math.max(1, argInt('--consume-batch', 1)),
  journalCapacity: argInt('--journal-capacity', null),
  ackStall: argv.includes('--ack-stall'),
  probe: argValue('--probe', null),
  expectedHash: argValue('--expected-hash', GOLDEN_HASH),
  json: argv.includes('--json'),
};

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function normalizeTape(tape) {
  return tape.frames.map((frame) => ({
    tick: frame.tick,
    input: frame.input || {},
    commands: Array.isArray(frame.commands) ? frame.commands.map((c) => ({ ...c })) : [],
  }));
}

// ---------------------------------------------------------------------------
// Journal facade — presents transported byte-ranges through the journal API the
// real publisher consumes. Retains packs until the present side acks
// (discardThrough), mirroring worker-side ring semantics.
// ---------------------------------------------------------------------------
const KIND_NAMES = [null, 'spawn', 'destroy', 'transform', 'visual'];

function createTransportJournal() {
  const packs = new Map(); // start -> pack
  const scratch = createPresentationJournalRecord();
  let lastEnd = 0;
  let rebuildGeneration = 0;
  let requestRebuildCount = 0;
  let requestRebuildReasons = {};
  const diagnostics = {
    packsReceived: 0,
    packsDroppedByAck: 0,
    recordsTransported: 0,
    bytesTransported: 0,
  };

  function coveringPack(sequence) {
    for (const pack of packs.values()) {
      if (sequence > pack.start && sequence <= pack.end) return pack;
    }
    return null;
  }

  function decodeAt(pack, sequence, target) {
    const i = sequence - pack.start - 1;
    const o = i * 18;
    const s = pack.scalars;
    target.tick = s[o];
    target.sequence = s[o + 1];
    target.kind = KIND_NAMES[pack.kinds[i]];
    target.entityId = s[o + 2];
    target.generation = s[o + 3];
    target.revision = s[o + 4];
    target.entityType = pack.typeTable[pack.typeIndex[i]];
    target.x = s[o + 5];
    target.y = s[o + 6];
    target.z = s[o + 7];
    target.prevX = s[o + 8];
    target.prevY = s[o + 9];
    target.prevZ = s[o + 10];
    target.rot = s[o + 11];
    target.bank = s[o + 12];
    target.pitch = s[o + 13];
    target.prevRot = s[o + 14];
    target.prevBank = s[o + 15];
    target.prevPitch = s[o + 16];
    target.visualRevision = s[o + 17];
    return target;
  }

  return {
    push(pack, { fullRebuild = false, generation = 0 } = {}) {
      if (fullRebuild) {
        packs.clear();
        rebuildGeneration = generation >>> 0;
      }
      if (pack && pack.end > pack.start) packs.set(pack.start, pack);
      if (pack) {
        lastEnd = Math.max(lastEnd, pack.end);
        diagnostics.packsReceived++;
        diagnostics.recordsTransported += pack.count;
        diagnostics.bytesTransported += pack.scalars.byteLength
          + pack.kinds.byteLength + pack.typeIndex.byteLength;
      }
    },
    hasRange(start, end) {
      if (start === end) return true;
      for (let seq = start + 1; seq <= end; seq++) {
        if (!coveringPack(seq)) return false;
      }
      return true;
    },
    visitRange(start, end, target, visitor) {
      const out = target || scratch;
      let visited = 0;
      for (let seq = start + 1; seq <= end; seq++) {
        const pack = coveringPack(seq);
        if (!pack) throw new Error(`transport journal record ${seq} not retained`);
        visitor(decodeAt(pack, seq, out));
        visited++;
      }
      return visited;
    },
    discardThrough(sequence) {
      for (const [start, pack] of packs) {
        if (pack.end <= sequence) {
          packs.delete(start);
          diagnostics.packsDroppedByAck++;
        }
      }
    },
    needsRebuild: () => false,
    requestRebuild(reason = 'requested') {
      requestRebuildCount++;
      requestRebuildReasons[reason] = (requestRebuildReasons[reason] || 0) + 1;
    },
    getWriteSequence: () => lastEnd,
    getOldestSequence: () => {
      let min = lastEnd;
      for (const pack of packs.values()) min = Math.min(min, pack.start);
      return packs.size ? min : 0;
    },
    getPendingCount: () => 0,
    getRebuildGeneration: () => rebuildGeneration,
    getDiagnostics: () => diagnostics,
    getRequestRebuildCount: () => requestRebuildCount,
    getRequestRebuildReasons: () => requestRebuildReasons,
  };
}

// Read-model projection: resolve sites (resolveWorldPresentationEntity) read
// entities Map + world.asteroidField/dressing/farActors. SPAWN info blocks feed
// the entities Map; the three aux tables stay empty in Phase-A (their records
// resolve null entity — same as a headless main without a world).
function createReadModelState() {
  return {
    entities: new Map(),
    entityList: [],
    world: { asteroidField: null, dressing: null, farActors: null },
  };
}

function applySpawnInfos(readModel, spawnInfos) {
  for (const info of spawnInfos || []) {
    if (!info || !Number.isSafeInteger(info.entityId)) continue;
    readModel.entities.set(info.entityId, {
      id: info.entityId,
      type: info.type,
      alive: info.alive,
      team: info.team,
      factionId: info.factionId,
      pos: { x: info.x || 0, y: 0, z: info.z || 0 },
      radius: info.radius || 0,
      isPlayer: info.isPlayer === true,
      farResident: info.farResident === true,
      fieldResident: info.fieldResident === true,
      sectorId: info.sectorId || null,
      flags: info.flags || {},
      data: {
        callsign: info.callsign,
        name: info.name,
        trafficRole: info.trafficRole,
        role: info.role,
      },
      activity: { presentationTier: info.presentationTier || 0 },
    });
  }
}

// ---------------------------------------------------------------------------
// Worker driver — request/response pump with a bounded in-flight window.
// ---------------------------------------------------------------------------
function createWorkerClient() {
  const worker = new Worker(WORKER_PATH, { workerData: { spike: 's1-phase-a' } });
  let seq = 0;
  const pending = new Map();
  let lastRecvNs = 0n;
  worker.on('message', (msg) => {
    lastRecvNs = process.hrtime.bigint();
    const entry = pending.get(msg.seq);
    if (!entry) return;
    pending.delete(msg.seq);
    if (msg.kind === 'error') {
      const err = new Error(`worker error: ${msg.message}`);
      err.stack = msg.stack || err.stack;
      entry.reject(err);
      return;
    }
    msg._recvNs = lastRecvNs;
    entry.resolve(msg);
  });
  worker.on('error', (err) => {
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      for (const entry of pending.values()) {
        entry.reject(new Error(`worker exited with code ${code}`));
      }
      pending.clear();
    }
  });
  return {
    worker,
    postNs: 0n,
    send(msg) {
      msg.seq = ++seq;
      this.postNs = process.hrtime.bigint();
      worker.postMessage(msg);
      return new Promise((resolveP, rejectP) => pending.set(msg.seq, { resolve: resolveP, reject: rejectP }));
    },
    terminate() { return worker.terminate(); },
  };
}

// ---------------------------------------------------------------------------
// One full run.
// ---------------------------------------------------------------------------
async function runOnce() {
  const tape = readJson(OPT.inputs);
  const frames = normalizeTape(tape);
  const client = createWorkerClient();
  try {
    return await runBody(client, frames);
  } finally {
    await client.terminate();
  }
}

async function runBody(client, frames) {
  const journal = createTransportJournal();
  const readModel = createReadModelState();
  const world = createPresentationWorld();
  const publisher = createPresentationPublisher(world, readModel, { journal });

  // 8-deep completedTick ring — mirrors simulationRunner's bounded publication.
  const completedTickRing = [];
  function ringPush(record) {
    if (completedTickRing.length >= COMPLETED_TICK_RING_DEPTH) {
      throw new Error(`completedTick ring overflow beyond ${COMPLETED_TICK_RING_DEPTH}`);
    }
    completedTickRing.push(record);
  }
  let ringHighWater = 0;
  let ackedJournalEnd = 0;
  const timing = {
    packMs: [], wireMs: [], consumeMs: [], transportMs: [],
    workMs: [], directiveWireMs: [], rttMs: [], transportTicks: [],
  };
  let eventsReceived = 0;
  let pauseProbed = false;

  const init = await client.send({
    kind: 'init',
    seed: OPT.seed,
    reloadAt: OPT.reloadAt,
    journalCapacity: OPT.journalCapacity,
    scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
  });
  assert.equal(init.kind, 'ready');

  // Consume the init rebuild as the first frame (production does the same on
  // the first present after game:started).
  if (init.initRebuild && init.initRebuild.end > init.initRebuild.start) {
    journal.push(init.initRebuild.pack, { fullRebuild: true, generation: init.initRebuild.generation });
    applySpawnInfos(readModel, init.initRebuild.spawnInfos);
    const r = publisher.consume({
      journalStart: init.initRebuild.start,
      journalEnd: init.initRebuild.end,
      journalFullRebuild: true,
      journalRebuildGeneration: init.initRebuild.generation,
      journalValid: true,
      journal,
    });
    assert.equal(r.fallback, false, `init rebuild consume fell back: ${r.error}`);
    ackedJournalEnd = init.initRebuild.end;
  }

  let frameIndex = 0;
  let currentInput = frames[0] ? frames[0].input : {};
  const pendingTicks = []; // promises, in-order
  const tickMeta = new Map();
  // Stage-1 command channel: all directive-side mutations cross as typed
  // {input|bus|settings|rpc} envelopes. refInputHistory records every input
  // envelope main-side so the worker's own history.toTape() proves lossless
  // transport at finalize (gate d).
  const commandRing = createSimCommandRing();
  const refInputHistory = createInputCommandHistory();
  const observedRpcAcks = [];
  const observedSettingsAcks = [];

  function enqueueFrameEnvelopes(tick) {
    while (frameIndex < frames.length && frames[frameIndex].tick <= tick) {
      const frame = frames[frameIndex];
      currentInput = frame.input || {};
      for (const c of frame.commands) commandRing.pushBus(c);
      frameIndex++;
    }
    const seq = commandRing.pushInput(currentInput, { wallMs: Date.now() });
    refInputHistory.record(tick, currentInput, { sequence: seq });
  }

  function postTick(tick, steps) {
    enqueueFrameEnvelopes(tick);
    const commands = commandRing.drain();
    const sendNs = Number(process.hrtime.bigint());
    const p = client.send({
      kind: 'tick',
      tick,
      commands,
      steps,
      ackJournalEnd: OPT.ackStall ? 0 : ackedJournalEnd,
      churn: OPT.probe === 'churn' && tick >= 10 && tick < 210 ? { spawn: 6 } : null,
    });
    tickMeta.set(p, { sendNs, tick });
    pendingTicks.push(p);
  }

  function consumeRing(threshold) {
    // Consume drain: completedTicks leave the ring when the present side applies
    // their journal range (consumeLatestCompletedTick drains all pending). A
    // consume-batch >1 models present-side lag (frames slower than ticks).
    while (completedTickRing.length >= threshold) {
      const item = completedTickRing.shift();
      if (item.completedTick == null) {
        // steps:0 directive — commands delivered, no completedTick published.
        continue;
      }
      const frame = item;
      const meta = frame._meta;
      const recvNs = frame._recvNs;
      journal.push(frame.pack, {
        fullRebuild: frame.journalFullRebuild,
        generation: frame.journalRebuildGeneration,
      });
      applySpawnInfos(readModel, frame.spawnInfos);
      const consumeStart = process.hrtime.bigint();
      const r = publisher.consume({
        journalStart: frame.journalStart,
        journalEnd: frame.journalEnd,
        journalFullRebuild: frame.journalFullRebuild,
        journalRebuildGeneration: frame.journalRebuildGeneration,
        journalValid: frame.journalValid,
        journal,
      });
      const consumeNs = process.hrtime.bigint() - consumeStart;
      if (r.fallback) {
        throw new Error(`publisher fell back at tick ${meta.tick}: ${r.error}`);
      }
      journal.discardThrough(frame.journalEnd);
      ackedJournalEnd = Math.max(ackedJournalEnd, frame.journalEnd);

      const wireNs = recvNs - BigInt(frame.sendNs);
      const directiveWireNs = BigInt(frame.arrivalNs) - BigInt(meta.sendNs);
      const transportNs = wireNs + BigInt(Math.round(frame.packMs * 1e6)) + consumeNs;
      timing.packMs.push(frame.packMs);
      timing.wireMs.push(Number(wireNs) / 1e6);
      timing.consumeMs.push(Number(consumeNs) / 1e6);
      timing.transportMs.push(Number(transportNs) / 1e6);
      timing.workMs.push(frame.workMs);
      timing.directiveWireMs.push(Number(directiveWireNs) / 1e6);
      timing.rttMs.push((Number(recvNs) - meta.sendNs) / 1e6);
      timing.transportTicks.push({ tick: meta.tick, ms: Number(transportNs) / 1e6 });
      eventsReceived += (frame.events || []).length;
    }
  }

  async function drainOne() {
    const p = pendingTicks.shift();
    const meta = tickMeta.get(p);
    tickMeta.delete(p);
    const reply = await p;
    reply._meta = meta;
    if (Array.isArray(reply.rpcAcks)) observedRpcAcks.push(...reply.rpcAcks);
    if (Array.isArray(reply.settingsAcks)) observedSettingsAcks.push(...reply.settingsAcks);
    ringPush(reply); // tickDone envelope = completedTick + journal byte-range
    ringHighWater = Math.max(ringHighWater, completedTickRing.length);
    consumeRing(OPT.consumeBatch);
  }

  // Pause-probe: at tick 2, deliver the tick-2 tape commands via a steps:0
  // directive (timeScale<=0 path), then a normal steps:1 tick. Command drain at
  // directive level must not strand them; hash stays identical.
  const pauseAt = OPT.probe === 'pause' ? 2 : -1;

  for (let tick = 0; tick < OPT.ticks; tick++) {
    if (tick === pauseAt) {
      pauseProbed = true;
      enqueueFrameEnvelopes(tick);
      // Settings + rpc kinds exercise the same steps:0 drain: an idempotent
      // timeScale write and a noop rpc must land even with no tick advancing,
      // and their acks must come back on the directive reply.
      commandRing.pushSettings('timeScale', 1);
      commandRing.pushRpc('pause-probe-1', 'noop');
      const commands = commandRing.drain();
      const paused = await client.send({
        kind: 'tick', tick, commands, steps: 0,
        ackJournalEnd: OPT.ackStall ? 0 : ackedJournalEnd,
      });
      assert.equal(paused.kind, 'tickDone');
      assert.equal(paused.completedTick, null, 'steps:0 must not publish a completedTick');
      assert.equal(paused.stateTick, tick, 'steps:0 must not advance state.tick');
      if (Array.isArray(paused.rpcAcks)) observedRpcAcks.push(...paused.rpcAcks);
      if (Array.isArray(paused.settingsAcks)) observedSettingsAcks.push(...paused.settingsAcks);
      postTick(tick, 1);
      while (pendingTicks.length) await drainOne();
      continue;
    }
    postTick(tick, 1);
    if (pendingTicks.length >= OPT.pipeline) await drainOne();
  }
  while (pendingTicks.length) await drainOne();
  consumeRing(1);

  const fin = await client.send({ kind: 'finalize' });
  assert.equal(fin.kind, 'done');

  return {
    sha256: fin.sha256,
    inputTape: fin.inputTape,
    refTape: refInputHistory.toTape(),
    observedRpcAcks,
    observedSettingsAcks,
    commandDropped: fin.commandDropped,
    stateTick: fin.stateTick,
    entityCount: fin.entityCount,
    journalDiag: fin.journalDiag,
    journalRebuildCount: fin.journalRebuildCount,
    rebuildReasons: fin.rebuildReasons,
    suppressedSpawns: fin.suppressedSpawns,
    identityOffenders: fin.identityOffenders,
    droppedEventCount: fin.droppedEventCount,
    droppedEventTypes: fin.droppedEventTypes,
    avgWorkMs: fin.avgWorkMs,
    avgPackMs: fin.avgPackMs,
    workerHeapUsedBytes: fin.workerHeapUsedBytes,
    timing,
    ringHighWater,
    ringDepth: COMPLETED_TICK_RING_DEPTH,
    ackedJournalEnd,
    transportDiag: journal.getDiagnostics(),
    requestRebuildCount: journal.getRequestRebuildCount(),
    requestRebuildReasons: journal.getRequestRebuildReasons(),
    publisherDiag: publisher.getDiagnostics(),
    worldDiag: world.getDiagnostics ? world.getDiagnostics() : null,
    eventsReceived,
    pauseProbed,
  };
}

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { n: arr.length, mean, p50: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
}

function round(x, d = 4) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function reportStats(s) {
  return { n: s.n, mean: round(s.mean), p50: round(s.p50), p95: round(s.p95), max: round(s.max) };
}

async function main() {
  const results = [];
  for (let i = 0; i < OPT.repeat; i++) {
    results.push(await runOnce());
  }

  const allHashEqual = results.every((r) => r.sha256 === results[0].sha256);
  const hashMatch = results[0].sha256 === OPT.expectedHash;

  // Gate (a): hash parity
  const gateA = {
    pass: allHashEqual && hashMatch && results[0].stateTick === OPT.ticks,
    sha256: results[0].sha256,
    expected: OPT.expectedHash,
    allRunsEqual: allHashEqual,
    stateTick: results[0].stateTick,
    runs: results.length,
  };

  // Gate (b): transport cost = pack + wire + consume per tick
  const transport = stats(results.flatMap((r) => r.timing.transportMs));
  const transportTicks = results.flatMap((r) => r.timing.transportTicks);
  const over05 = transportTicks.filter((t) => t.ms >= 0.5);
  const gateB = {
    pass: transport.p95 < 0.5 && transport.mean < 0.5,
    thresholdMs: 0.5,
    overThresholdCount: over05.length,
    overThresholdTicks: over05.slice(0, 30),
    transport: reportStats(transport),
    pack: reportStats(stats(results.flatMap((r) => r.timing.packMs))),
    wire: reportStats(stats(results.flatMap((r) => r.timing.wireMs))),
    consume: reportStats(stats(results.flatMap((r) => r.timing.consumeMs))),
    directiveWire: reportStats(stats(results.flatMap((r) => r.timing.directiveWireMs))),
    rtt: reportStats(stats(results.flatMap((r) => r.timing.rttMs))),
    workMs: reportStats(stats(results.flatMap((r) => r.timing.workMs))),
  };

  // Gate (c): ring bounds
  const maxRing = Math.max(...results.map((r) => r.ringHighWater));
  const lastDiag = results[results.length - 1].journalDiag || {};
  const lastTransportDiag = results[results.length - 1].transportDiag;
  const rebuildCount = results.reduce((a, r) => a + r.journalRebuildCount, 0);
  const ringBound = OPT.ackStall || OPT.journalCapacity
    ? rebuildCount > 0
    : lastDiag.pending != null && lastDiag.pending <= (lastDiag.capacity || Infinity);
  const gateC = {
    pass: maxRing <= COMPLETED_TICK_RING_DEPTH && ringBound,
    completedTickHighWater: maxRing,
    completedTickDepth: COMPLETED_TICK_RING_DEPTH,
    journalRebuilds: rebuildCount,
    journalDiag: lastDiag,
    transportDiag: lastTransportDiag,
    publisherDiag: results[results.length - 1].publisherDiag,
    requestRebuildReasons: results[results.length - 1].requestRebuildReasons,
    pauseProbed: results[0].pauseProbed,
  };

  // Gate (d): stage-1 command channel — the worker's inputCommandHistory.toTape()
  // must byte-match the main-side reference recording of the same envelopes
  // (lossless envelope transport), and ack envelopes must come back.
  const run = results[0];
  const workerTapeJson = JSON.stringify(run.inputTape);
  const refTapeJson = JSON.stringify(run.refTape);
  const rpcAckOk = OPT.probe === 'pause'
    ? run.observedRpcAcks.some((a) => a && a.id === 'pause-probe-1' && a.ok === true)
    : true;
  const settingsAckOk = OPT.probe === 'pause'
    ? run.observedSettingsAcks.some((a) => a && a.path === 'timeScale' && a.ok === true)
    : true;
  const gateD = {
    pass: workerTapeJson === refTapeJson && rpcAckOk && settingsAckOk && run.commandDropped === 0,
    workerTapeFrames: run.inputTape && run.inputTape.frames ? run.inputTape.frames.length : 0,
    refTapeFrames: run.refTape && run.refTape.frames ? run.refTape.frames.length : 0,
    tapeParity: workerTapeJson === refTapeJson,
    rpcAcks: run.observedRpcAcks,
    settingsAcks: run.observedSettingsAcks,
    commandDropped: run.commandDropped,
  };

  const summary = {
    schema: 'spaceface.s1WorkerSpike.v1',
    mode: 'whole-sim-in-worker',
    options: OPT,
    gates: { a_hash: gateA, b_transport: gateB, c_rings: gateC, d_commandChannel: gateD },
    run: {
      entityCount: run.entityCount,
      droppedEventCount: run.droppedEventCount,
      droppedEventTypes: run.droppedEventTypes,
      eventsReceived: run.eventsReceived,
      avgWorkMs: round(run.avgWorkMs),
      avgPackMs: round(run.avgPackMs),
      workerHeapMb: round((run.workerHeapUsedBytes || 0) / 1e6, 1),
      journalRebuildCount: run.journalRebuildCount,
    },
    verdict: gateA.pass && gateB.pass && gateC.pass && gateD.pass ? 'ALL PASS' : 'GATE FAILURE',
  };

  if (OPT.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== S1 Phase-A spike: whole-sim-in-worker ===`);
    console.log(`GATE A hash parity : ${gateA.pass ? 'PASS' : 'FAIL'}  sha256=${gateA.sha256}`);
    console.log(`                     expected=${gateA.expected}  runs=${gateA.runs} allEqual=${gateA.allRunsEqual}`);
    console.log(`GATE B transport   : ${gateB.pass ? 'PASS' : 'FAIL'}  <0.5ms/tick  ` +
      `mean=${gateB.transport.mean} p95=${gateB.transport.p95} max=${gateB.transport.max}`);
    console.log(`                     pack mean=${gateB.pack.mean} p95=${gateB.pack.p95} | wire mean=${gateB.wire.mean} p95=${gateB.wire.p95} | consume mean=${gateB.consume.mean} p95=${gateB.consume.p95}`);
    console.log(`                     >0.5ms ticks: ${gateB.overThresholdCount}  ${JSON.stringify(gateB.overThresholdTicks)}`);
    console.log(`GATE C rings       : ${gateC.pass ? 'PASS' : 'FAIL'}  completedTick hw=${gateC.completedTickHighWater}/8  journalRebuilds=${gateC.journalRebuilds}`);
    console.log(`                     journalDiag.pending=${gateC.journalDiag && gateC.journalDiag.pending} capacity=${gateC.journalDiag && gateC.journalDiag.capacity} published=${gateC.journalDiag && gateC.journalDiag.publishedCount} coalesced=${gateC.journalDiag && gateC.journalDiag.transformCoalesceCount} suppressed=${gateC.journalDiag && gateC.journalDiag.suppressedCount} rebuildReqs=${gateC.journalDiag && gateC.journalDiag.rebuildRequestCount} failures=${gateC.journalDiag && gateC.journalDiag.rebuildFailureCount} discarded=${gateC.journalDiag && gateC.journalDiag.discardCount}`);
    console.log(`GATE D cmd channel : ${gateD.pass ? 'PASS' : 'FAIL'}  tapeParity=${gateD.tapeParity} frames=${gateD.workerTapeFrames}/${gateD.refTapeFrames} dropped=${gateD.commandDropped}`);
    console.log(`                     rpcAcks=${JSON.stringify(gateD.rpcAcks)} settingsAcks=${JSON.stringify(gateD.settingsAcks)}`);
    console.log(`run: entities=${run.entityCount} events=${run.eventsReceived} dropped=${run.droppedEventCount} avgWorkMs=${round(run.avgWorkMs)} workerHeap=${round((run.workerHeapUsedBytes || 0) / 1e6, 1)}MB`);
    console.log(`rebuild reasons: ${JSON.stringify(run.rebuildReasons)}`);
    console.log(`identity offenders: ${JSON.stringify((run.identityOffenders || []).slice(0, 12))}`);
    console.log(`suppressed spawns : ${JSON.stringify((run.suppressedSpawns || []).slice(0, 12))}`);
    if (Object.keys(run.droppedEventTypes).length) {
      console.log(`dropped event types (live-payload): ${JSON.stringify(run.droppedEventTypes)}`);
    }
    console.log(`verdict: ${summary.verdict}`);
  }

  process.exitCode = summary.verdict === 'ALL PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error('spike failed:', error);
  process.exitCode = 2;
});
