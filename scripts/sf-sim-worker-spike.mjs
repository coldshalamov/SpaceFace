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
//     [--pipeline N] [--journal-capacity N] [--ack-stall]
//     [--probe pause|aux|churn|domains] [--expected-hash <sha256>] [--json]

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
import {
  applyAuxRemovals,
  applyAuxUpserts,
  applyDestroyIds,
  applyDomainPathUpdate,
  applySpawnInfos,
  createDomainProbeChecker,
  createReadModel,
  digestIds,
  DOMAIN_MIRROR_KEYS,
  readModelCollectIds,
  sameDomainContainerKind,
} from './lib/simReadModel.mjs';

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

// Read model v1 (stage 3): entities Map from journal spawns/destroys +
// entity-info blocks; aux rows (far/rock/dressing ledger tables) from the
// auxUpserts/auxRemovals channel; windowed collect = readModelCollectIds —
// the read-model twin of collectMeshPresentationEntities. Gate F digests the
// two sets each completed tick.
const JOURNAL_DESTROY_KIND = PRESENTATION_JOURNAL_KINDS.DESTROY;

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
  const readModel = createReadModel();
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
    domainDiffMs: [], domainShipBytes: [],
  };
  let eventsReceived = 0;
  // Stage-2 bridge parity: per-type receipts vs the worker's emitted counts.
  const receivedByType = {};
  // Presentation lane: lane:'presentation' events re-enqueue into the main-side
  // presentationQueue model instead of dispatching at tick receipt.
  const presentationQueue = [];
  let presentationDrained = 0;
  let pauseProbed = false;
  // Stage-3 read-model parity: digest mismatches vs the worker's live collect.
  const readModelScratch = [];
  const destroyScratch = [];
  let collectMismatches = 0;
  let collectProbes = 0;
  const collectMismatchSamples = [];
  // Stage-4 domain mirrors: per-tick signature parity + mutate-in-place
  // identity accounting. domainProbe = worker's canonical signature of every
  // mirrored key; the runner re-signs its facades and compares the full set.
  const domainMissingKeys = [];
  const domainMissingPaths = [];
  const domainExtraPaths = [];
  const domainMismatchSamples = [];
  const domainProbeChecker = createDomainProbeChecker(readModel.domains);
  let domainProbes = 0;
  let domainSweeps = 0;
  let domainPathChecks = 0;
  let domainMismatches = 0;
  let domainIdentityChecks = 0;
  let domainIdentityBreaks = 0;

  const domainTouched = new Set();
  function applyDomainUpdatesTracked(updates) {
    if (!Array.isArray(updates)) return;
    for (const u of updates) {
      if (!u || !Array.isArray(u.segs) || u.segs.length === 0) continue;
      const root = u.segs[0];
      const prevRoot = readModel.domains.get(root);
      domainTouched.clear();
      applyDomainPathUpdate(readModel.domains, u, domainTouched);
      // Root facade identity: multi-segment updates always mutate the root in
      // place; single-segment updates must keep identity whenever prev and
      // shipped value are the same container kind.
      const mustKeep = prevRoot !== null && typeof prevRoot === 'object'
        && (u.segs.length > 1
          || (u.v !== null && typeof u.v === 'object' && sameDomainContainerKind(prevRoot, u.v)));
      if (mustKeep) {
        domainIdentityChecks++;
        if (readModel.domains.get(root) !== prevRoot) domainIdentityBreaks++;
      }
    }
  }

  function compareDomainProbe(probe, tickLabel) {
    if (!probe) return;
    domainProbes++;
    const res = domainProbeChecker.consume(probe);
    if (res.sweep) domainSweeps++;
    domainPathChecks += res.checks;
    for (const ev of res.events) {
      domainMismatches++;
      if (ev.kind === 'missing-facade-path') domainMissingPaths.push(ev.path);
      if (ev.kind === 'extra-facade-path') domainExtraPaths.push(ev.path);
      if (domainMismatchSamples.length < 12) {
        domainMismatchSamples.push({ tick: tickLabel, ...ev });
      }
    }
  }

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
    readModel.entities.clear();
    applySpawnInfos(readModel, init.initRebuild.spawnInfos);
    applyAuxUpserts(readModel, init.auxUpserts);
    applyAuxRemovals(readModel, init.auxRemovals);
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

  // Stage-4 init coverage: every mirrored key must land a facade from the
  // init batch, then the init probe signs the full set like a completed tick.
  applyDomainUpdatesTracked(init.domainUpdates);
  for (const key of DOMAIN_MIRROR_KEYS) {
    if (!readModel.domains.has(key)) domainMissingKeys.push(key);
  }
  compareDomainProbe(init.domainProbe, 'init');

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
      aux: OPT.probe === 'aux',
      domains: OPT.probe === 'domains',
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
      for (const evt of item.events || []) {
        eventsReceived++;
        if (evt && typeof evt === 'object' && evt.t) {
          receivedByType[evt.t] = (receivedByType[evt.t] || 0) + 1;
          if (evt.lane === 'presentation') {
            // Re-enqueue into the presentationQueue model; drain one slot per
            // consumed tick (the 8/frame drain budget lives on the main side).
            presentationQueue.push(evt);
            for (let n = 0; n < 8 && presentationQueue.length; n++) {
              presentationQueue.shift();
              presentationDrained++;
            }
          }
        }
      }
      // Stage-4: domain updates apply on every reply — a steps:0 directive can
      // still carry command-driven domain mutations the mirror must not lose.
      applyDomainUpdatesTracked(item.domainUpdates);
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
      if (frame.journalFullRebuild) readModel.entities.clear();
      applySpawnInfos(readModel, frame.spawnInfos);
      applyAuxUpserts(readModel, frame.auxUpserts);
      applyAuxRemovals(readModel, frame.auxRemovals);
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
      // Stage-3: destroy records carry the entities-map deletions (parity with
      // state.entities.delete timing — removal-time, not kill-time).
      if (frame.journalStart < frame.journalEnd) {
        destroyScratch.length = 0;
        journal.visitRange(frame.journalStart, frame.journalEnd, null, (rec) => {
          if (rec.kind === JOURNAL_DESTROY_KIND) destroyScratch.push(rec.entityId);
        });
        if (destroyScratch.length) applyDestroyIds(readModel, destroyScratch);
      }
      journal.discardThrough(frame.journalEnd);
      ackedJournalEnd = Math.max(ackedJournalEnd, frame.journalEnd);

      // Gate F — collect-set equality: the read model's windowed collect must
      // return the same id set the worker's live collect just walked.
      const probe = frame.collectProbe;
      if (probe && probe.digest) {
        collectProbes++;
        readModelCollectIds(readModel, probe, readModelScratch);
        const modelDigest = digestIds(readModelScratch);
        if (modelDigest !== probe.digest) {
          collectMismatches++;
          if (collectMismatchSamples.length < 8) {
            const modelSet = new Set(readModelScratch);
            const liveSet = new Set(probe.ids || []);
            collectMismatchSamples.push({
              tick: meta.tick,
              modelDigest,
              liveDigest: probe.digest,
              liveCount: probe.count,
              modelCount: readModelScratch.length,
              onlyModel: readModelScratch.filter((id) => !liveSet.has(id)).slice(0, 12),
              onlyLive: (probe.ids || []).filter((id) => !modelSet.has(id)).slice(0, 12),
            });
          }
        }
      }

      // Gate F2 — domain-mirror parity: every mirrored key present in
      // readModel.domains, facade signatures equal to the worker's live set.
      compareDomainProbe(frame.domainProbe, meta.tick);

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
      timing.domainDiffMs.push(frame.domainDiffMs || 0);
      timing.domainShipBytes.push(frame.domainShipBytes || 0);
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
      applyDomainUpdatesTracked(paused.domainUpdates);
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
    unintentionalDrops: fin.unintentionalDrops,
    unintentionalDropTypes: fin.unintentionalDropTypes,
    dropSamples: fin.dropSamples,
    emittedEventCounts: fin.emittedEventCounts,
    unbridgeable: fin.unbridgeable,
    receivedByType,
    presentationDrained,
    presentationQueueDepth: presentationQueue.length,
    collectProbes,
    collectMismatches,
    collectMismatchSamples,
    auxRowsShipped: fin.auxRowsShipped,
    auxUpsertsTotal: fin.auxUpsertsTotal,
    auxRemovalsTotal: fin.auxRemovalsTotal,
    domainProbes,
    domainSweeps,
    domainPathChecks,
    domainMismatches,
    domainMismatchSamples,
    domainMissingKeys,
    domainMissingPaths,
    domainExtraPaths,
    domainIdentityChecks,
    domainIdentityBreaks,
    domainLeafPaths: fin.domainLeafPaths,
    domainUpdatesTotal: fin.domainUpdatesTotal,
    domainShipBytesTotal: fin.domainShipBytesTotal,
    domainSignedBytesTotal: fin.domainSignedBytesTotal,
    domainShipBytesMax: fin.domainShipBytesMax,
    domainShipPerPath: fin.domainShipPerPath,
    domainOversize: fin.domainOversize,
    avgDomainDiffMs: fin.avgDomainDiffMs,
    maxDomainDiffMs: fin.maxDomainDiffMs,
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

  // Gate (a): hash parity — mutating probes (aux) still must be deterministic
  // across repeats but are not expected to match the golden hash.
  const mutatingProbe = OPT.probe === 'aux' || OPT.probe === 'churn' || OPT.probe === 'domains';
  const gateA = {
    pass: allHashEqual && (mutatingProbe || hashMatch) && results[0].stateTick === OPT.ticks,
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

  // GATE E — stage-2 deep-flat bridge: every emitted event must arrive
  // (per-type parity emitted vs received) and unintentional drops must be zero
  // (intentional drops = unbridgeable typed/depth counters only).
  const emittedCounts = run.emittedEventCounts || {};
  const parityMismatch = {};
  for (const [type, count] of Object.entries(emittedCounts)) {
    const received = (run.receivedByType || {})[type] || 0;
    const dropped = (run.droppedEventTypes || {})[type] || 0;
    if (received + dropped !== count) parityMismatch[type] = { emitted: count, received, dropped };
  }
  const gateE = {
    pass: run.unintentionalDrops === 0 && Object.keys(parityMismatch).length === 0,
    unintentionalDrops: run.unintentionalDrops,
    unintentionalDropTypes: run.unintentionalDropTypes,
    intentionalDrops: run.droppedEventCount,
    unbridgeable: run.unbridgeable,
    parityMismatch,
    presentationDrained: run.presentationDrained,
    presentationQueueDepth: run.presentationQueueDepth,
  };

  // GATE F — stage-3 read model v1: the read-model collect (entities via
  // journal spawns/destroys + aux rows via the upsert/removal channel, windowed
  // query) must digest equal to the worker's live collectMeshPresentationEntities
  // on every completed tick.
  const gateF = {
    pass: run.collectMismatches === 0 && run.collectProbes > 0,
    probes: run.collectProbes,
    mismatches: run.collectMismatches,
    samples: run.collectMismatchSamples,
    auxRowsShipped: run.auxRowsShipped,
    auxUpsertsTotal: run.auxUpsertsTotal,
    auxRemovalsTotal: run.auxRemovalsTotal,
  };

  // GATE F2 — stage-4 domain mirrors (read model v2): every mirrored key
  // present in readModel.domains, facade canonical signatures equal to the
  // worker's live set on every completed tick, facade identity preserved
  // across same-kind updates (mutate-in-place contract).
  const domainDiffStats = stats(results.flatMap((r) => r.timing.domainDiffMs));
  const domainShipStats = stats(results.flatMap((r) => r.timing.domainShipBytes));
  const gateF2 = {
    pass: run.domainMismatches === 0 && run.domainProbes > 0
      && run.domainMissingKeys.length === 0 && run.domainIdentityBreaks === 0,
    probes: run.domainProbes,
    sweeps: run.domainSweeps,
    pathChecks: run.domainPathChecks,
    mismatches: run.domainMismatches,
    samples: run.domainMismatchSamples,
    keysMirrored: DOMAIN_MIRROR_KEYS.length,
    leafPaths: run.domainLeafPaths,
    missingKeys: run.domainMissingKeys,
    missingPaths: run.domainMissingPaths,
    extraPaths: run.domainExtraPaths,
    identityChecks: run.domainIdentityChecks,
    identityBreaks: run.domainIdentityBreaks,
    updatesTotal: run.domainUpdatesTotal,
    shipPerPath: run.domainShipPerPath,
    shipBytes: {
      total: run.domainShipBytesTotal,
      signedTotal: run.domainSignedBytesTotal,
      meanPerTick: round(domainShipStats.mean, 1),
      p95PerTick: round(domainShipStats.p95, 1),
      maxPerTick: round(domainShipStats.max, 1),
    },
    oversizeKeys: run.domainOversize,
    domainDiffMs: {
      mean: round(domainDiffStats.mean),
      p95: round(domainDiffStats.p95),
      max: round(domainDiffStats.max),
      workerAvg: round(run.avgDomainDiffMs),
      workerMax: round(run.maxDomainDiffMs),
    },
  };

  const summary = {
    schema: 'spaceface.s1WorkerSpike.v1',
    mode: 'whole-sim-in-worker',
    options: OPT,
    gates: { a_hash: gateA, b_transport: gateB, c_rings: gateC, d_commandChannel: gateD, e_eventBridge: gateE, f_readModel: gateF, f2_domainMirrors: gateF2 },
    verdict: gateA.pass && gateB.pass && gateC.pass && gateD.pass && gateE.pass && gateF.pass && gateF2.pass ? 'ALL PASS' : 'GATE FAILURE',
    run: {
      entityCount: run.entityCount,
      droppedEventCount: run.droppedEventCount,
      droppedEventTypes: run.droppedEventTypes,
      emittedEventCounts: run.emittedEventCounts,
      unbridgeable: run.unbridgeable,
      eventsReceived: run.eventsReceived,
      presentationDrained: run.presentationDrained,
      avgWorkMs: round(run.avgWorkMs),
      avgPackMs: round(run.avgPackMs),
      workerHeapMb: round((run.workerHeapUsedBytes || 0) / 1e6, 1),
      journalRebuildCount: run.journalRebuildCount,
    },
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
    console.log(`GATE E event bridge: ${gateE.pass ? 'PASS' : 'FAIL'}  unintentionalDrops=${gateE.unintentionalDrops} intentionalDrops=${gateE.intentionalDrops} unbridgeable=${JSON.stringify(gateE.unbridgeable)} parityMismatch=${JSON.stringify(gateE.parityMismatch)}`);
    console.log(`                     presentation drained=${gateE.presentationDrained} residualQueue=${gateE.presentationQueueDepth}`);
    console.log(`GATE F read model  : ${gateF.pass ? 'PASS' : 'FAIL'}  probes=${gateF.probes} mismatches=${gateF.mismatches} auxRows=${gateF.auxRowsShipped} upserts=${gateF.auxUpsertsTotal} removals=${gateF.auxRemovalsTotal}`);
    if (gateF.samples && gateF.samples.length) {
      console.log(`                     samples=${JSON.stringify(gateF.samples.slice(0, 4))}`);
    }
    console.log(`GATE F2 domains    : ${gateF2.pass ? 'PASS' : 'FAIL'}  probes=${gateF2.probes} sweeps=${gateF2.sweeps} pathChecks=${gateF2.pathChecks} mismatches=${gateF2.mismatches} roots=${gateF2.keysMirrored} leafPaths=${gateF2.leafPaths} missing=${gateF2.missingKeys.length}+${gateF2.missingPaths.length} extra=${gateF2.extraPaths.length}`);
    console.log(`                     identity checks=${gateF2.identityChecks} breaks=${gateF2.identityBreaks} updates=${gateF2.updatesTotal} ship mean=${gateF2.shipBytes.meanPerTick}B p95=${gateF2.shipBytes.p95PerTick}B max=${gateF2.shipBytes.maxPerTick}B diff mean=${gateF2.domainDiffMs.mean}ms p95=${gateF2.domainDiffMs.p95}ms max=${gateF2.domainDiffMs.max}ms`);
    if (gateF2.samples && gateF2.samples.length) {
      console.log(`                     samples=${JSON.stringify(gateF2.samples.slice(0, 4))}`);
    }
    if (gateF2.oversizeKeys && gateF2.oversizeKeys.length) {
      console.log(`                     oversize(>${256}KB)=${JSON.stringify(gateF2.oversizeKeys.slice(0, 8))}`);
    }
    console.log(`run: entities=${run.entityCount} events=${run.eventsReceived} dropped=${run.droppedEventCount} avgWorkMs=${round(run.avgWorkMs)} workerHeap=${round((run.workerHeapUsedBytes || 0) / 1e6, 1)}MB`);
    console.log(`rebuild reasons: ${JSON.stringify(run.rebuildReasons)}`);
    console.log(`identity offenders: ${JSON.stringify((run.identityOffenders || []).slice(0, 12))}`);
    console.log(`suppressed spawns : ${JSON.stringify((run.suppressedSpawns || []).slice(0, 12))}`);
    if (Object.keys(run.droppedEventTypes).length) {
      console.log(`dropped event types: ${JSON.stringify(run.droppedEventTypes)} samples=${JSON.stringify((run.dropSamples || []).slice(0, 10))}`);
    }
    console.log(`verdict: ${summary.verdict}`);
  }

  process.exitCode = summary.verdict === 'ALL PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error('spike failed:', error);
  process.exitCode = 2;
});
