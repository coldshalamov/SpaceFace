// S1 Phase-B stage 6 — the flip: worker-driven ticks, main-side accumulator.
//
// The main lane runs production's advanceFixedTimestep: each accumulated step
// posts a {kind:'tick'} directive; the worker steps the sim and replies with
// the transport frame (packed journal range + spawn infos + aux + domain
// diffs + events). The present side drains every RESOLVED reply per frame and
// presents only the newest completed tick — consumeLatestCompletedTick's
// newest-wins merge; a late reply re-presents the previous frame, never
// blocks. SIM_LANE=main swaps the worker for an in-process client over the
// SAME host module (scripts/lib/simWorkerHost.mjs) — identical reply objects
// through identical consume plumbing; the flag is the byte-for-byte revert.
//
// Gates:
//   (a) hash parity — finalize sha256 === golden sha256 (post-flip baseline)
//   (b) transport — pack(worker) + post/decode + consume(main) < 0.5 ms/tick
//   (c) ring bounds — in-flight directives ≤ pipeline bound; journal
//       overflow→rebuild via --journal-capacity / --ack-stall; pause via
//       --probe pause
//   (d) command channel — lossless envelope transport (tape byte-equality)
//   (i) digest canary (--canary) — worker-lane vs main-lane replies must
//       hash identically for every one of the 720 directives, through the
//       reload-at-600 boundary
//   (j) crash fail-closed (--probe crash) — a thrown step on either lane
//       rejects the directive at the same tick with the same failure shape
//
// Usage:
//   node scripts/sf-sim-worker-spike.mjs [--ticks 720] [--seed 47]
//     [--inputs test/47a.inputs.json] [--reload-at 600] [--repeat 1]
//     [--pipeline N] [--journal-capacity N] [--ack-stall] [--consume-batch N]
//     [--probe pause|aux|churn|domains|commands|market-parity|crash]
//     [--sim-lane worker|main] [--canary] [--expected-hash <sha256>] [--json]
//   SIM_LANE=main env var is equivalent to --sim-lane main.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { advanceFixedTimestep, LOOP_FIXED_DT, MAX_CATCHUP_STEPS } from '../src/core/simulationRunner.js';
import {
  createSimHost, createSabJournalArena, sabFeatureAvailable, sabFreePackSlot,
} from './lib/simWorkerHost.mjs';

import { createPresentationJournalRecord, PRESENTATION_JOURNAL_KINDS } from '../src/core/presentationJournal.js';
import { createInputCommandHistory } from '../src/core/inputCommandSnapshot.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createSimCommandRing, pushLaneCommand } from './lib/simCommandChannel.mjs';
import {
  installSimCommandSink,
  uninstallSimCommandSink,
  laneInputWrite,
  laneSetMode,
  laneSetNavWaypoint,
  laneClearNavWaypoint,
  laneWriteSetting,
  laneSpawnEntity,
  laneRemoveEntity,
  lanePromote,
} from '../src/core/simLaneCommands.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  applyAuxRemovals,
  applyAuxUpserts,
  applyDestroyIds,
  applyDomainPathUpdate,
  applySpawnInfos,
  canonicalSignature,
  configureDomainMirroring,
  createDomainProbeChecker,
  createReadModel,
  digestIds,
  DOMAIN_MIRROR_KEYS,
  readModelCollectIds,
  sameDomainContainerKind,
} from './lib/simReadModel.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKER_PATH = resolve(ROOT, 'scripts/lib/wholeSimWorker.mjs');
// Post-flip baseline — upstream re-baselined the 47a golden at 9fac82f34; the
// comparator was stale (stage-5 hash). This is the main-lane golden the flip
// must still produce bit-identically.
const GOLDEN_HASH = 'f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb';
const COMPLETED_TICK_RING_DEPTH = 8;
// Stage 7 item A: the completed-tick reply channel gets a hard bound — resolved
// replies carrying a completedTick count as outstanding until the present side
// drains them (drain = free, whether the tick presents or is superseded). At
// bound+1 outstanding the run fails closed with a completedTickQueue diagnostic,
// the same surface an in-process step throw produces. --ring-bound 0 disables.

// The production rAF schedule can't be measured on a benchmark headless box,
// so the spike drives a deterministic frame-DT pattern: 12 frames = 12 steps,
// exercising 0-step frames (ring holds), 2-step frames (catch-up), and 1-step
// frames (nominal). Bounded far under HITCH_FRAME_TICKS so nothing sheds — the
// step set is exactly the tape's 720 ticks either lane.
const FRAME_PATTERN = Object.freeze([1.0, 0.4, 1.6, 1.0, 1.0, 0.2, 1.8, 1.0, 1.0, 0.6, 1.4, 1.0]);

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
  // 0 = production drain-all (consumeLatestCompletedTick drains every pending
  // reply); N>0 caps replies consumed per frame to model present-side lag.
  consumeBatch: Math.max(0, argInt('--consume-batch', 0)),
  journalCapacity: argInt('--journal-capacity', null),
  ringBound: Math.max(0, argInt('--ring-bound', COMPLETED_TICK_RING_DEPTH)),
  // Stage-7 item B: 'commodity' (default) mirrors economy.markets/cycles at
  // commodity-row granularity keeping every render-consumed path; 'station' is
  // the stage-6 whole-station shape — byte-identical revert; 'commodity-nohist'
  // is the drop-history ceiling measurement (needs UI readers on marketHistory
  // rpc before it can ship).
  marketWire: argValue('--market-wire', 'commodity'),
  // Stage-7 item C: opt-in SAB journal arena (--sab or SIM_SAB=1).
  sab: argv.includes('--sab') || process.env.SIM_SAB === '1',
  ackStall: argv.includes('--ack-stall'),
  probe: argValue('--probe', null),
  simLane: argValue('--sim-lane', process.env.SIM_LANE || 'worker'),
  canary: argv.includes('--canary'),
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

function createTransportJournal(sabHeader = null) {
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
    sabPacks: 0,
    sabBytesShared: 0,
    sabFallbacks: 0,
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
        for (const held of packs.values()) sabFreePackSlot(sabHeader, held);
        packs.clear();
        rebuildGeneration = generation >>> 0;
      }
      if (pack && pack.end > pack.start) {
        const displaced = packs.get(pack.start);
        if (displaced && displaced !== pack) sabFreePackSlot(sabHeader, displaced);
        packs.set(pack.start, pack);
      } else sabFreePackSlot(sabHeader, pack);
      if (pack) {
        lastEnd = Math.max(lastEnd, pack.end);
        diagnostics.packsReceived++;
        diagnostics.recordsTransported += pack.count;
        diagnostics.bytesTransported += pack.scalars.byteLength
          + pack.kinds.byteLength + pack.typeIndex.byteLength;
        if (pack.sab) {
          diagnostics.sabPacks++;
          diagnostics.sabBytesShared += pack.scalars.byteLength
            + pack.kinds.byteLength + pack.typeIndex.byteLength;
        } else if (sabHeader && pack.count > 0) {
          diagnostics.sabFallbacks++;
        }
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
          sabFreePackSlot(sabHeader, pack);
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
    lane: 'worker',
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

// SIM_LANE=main — the in-process client. Identical host module, identical
// reply objects, identical in-order serialization: a promise chain stands in
// for the worker's postMessage chain (each directive completes before the next
// dispatches). The ONLY differences are transport artifacts: no structured
// clone, no real sendNs/wire latency. Rejection shape is normalized to the
// worker lane's (throw → 'worker error: <message>') so fail-closed parity is
// exact under --probe crash.
function createInProcessClient() {
  const host = createSimHost();
  let seq = 0;
  let chain = Promise.resolve();
  return {
    lane: 'main',
    send(msg) {
      msg.seq = ++seq;
      const task = chain.then(async () => {
        try {
          let reply;
          if (msg.kind === 'init') {
            reply = { kind: 'ready', ...(await host.init(msg)) };
          } else if (msg.kind === 'tick') {
            reply = await host.tick(msg);
            reply.kind = 'tickDone';
            reply.sendNs = Number(process.hrtime.bigint());
          } else if (msg.kind === 'finalize') {
            reply = { kind: 'done', ...(await host.finalize()) };
          } else if (msg.kind === 'shutdown') {
            host.shutdown();
            reply = { kind: 'bye' };
          } else {
            throw new Error(`unknown directive kind: ${msg.kind}`);
          }
          reply.seq = msg.seq;
          reply._recvNs = process.hrtime.bigint();
          return reply;
        } catch (error) {
          const err = new Error(`worker error: ${error && error.message ? error.message : error}`);
          err.stack = error && error.stack ? String(error.stack) : err.stack;
          throw err;
        }
      });
      // Serialize regardless of outcome — the next directive must not run while
      // this one is mid-flight, matching the worker adapter's chain.
      chain = task.then(() => {}, () => {});
      return task;
    },
    async terminate() { await chain.catch(() => {}); },
  };
}

function createClient(lane) {
  return lane === 'main' ? createInProcessClient() : createWorkerClient();
}

// ---------------------------------------------------------------------------
// One full run.
// ---------------------------------------------------------------------------
async function runOnce(options = {}) {
  const tape = readJson(OPT.inputs);
  const frames = normalizeTape(tape);
  const lane = options.lane || OPT.simLane;
  const client = createClient(lane);
  try {
    const result = await runBody(client, frames, options);
    result.lane = lane;
    return result;
  } finally {
    await client.terminate();
  }
}

async function runBody(client, frames, options = {}) {
  // Stage-7 item C: opt-in SAB journal arena. Main allocates, worker claims
  // slots via Atomics; shared memory replaces the pack columns' structured
  // clone. Feature-detected — never assumed (browsers need COOP/COEP).
  const sabLane = options.lane || OPT.simLane; // same expression as flipLane below
  const sabArena = OPT.sab && sabLane === 'worker' && sabFeatureAvailable()
    ? createSabJournalArena({ slotCount: 8, recordCap: 4096 })
    : null;
  const sabHeader = sabArena ? sabArena.header : null;
  const journal = createTransportJournal(sabHeader);
  const readModel = createReadModel();
  // Item B wire profile — installed in THIS realm before the facade probe
  // exists, and shipped on init so the worker realm's differ signs/projects
  // identically. 'station' sends an empty profile = stage-6 byte-identical.
  const marketWireProfile = OPT.marketWire === 'station' ? {} : {
    expandPaths: [
      { segs: ['economy', 'markets'], depth: 3 },
      { segs: ['economy', 'cycles'], depth: 3 },
    ],
    leafViews: [
      // 'commodity' keeps every render-lane-consumed path on the wire (the
      // market screen charts entry.history — census contract). The
      // 'commodity-nohist' variant projects the 64-point price history ring
      // off the wire instead (89.7% of a station leaf's canonical bytes) to
      // measure the ceiling; it is only safe once the two no-op-safe readers
      // (priceHistory backfill, market screen chart) switch to the
      // 'marketHistory' rpc.
      {
        segs: ['economy', 'markets'], leafSegs: 4,
        drop: OPT.marketWire === 'commodity-nohist' ? ['history'] : [],
        deferFirstSign: true, firstSignTicks: 60,
      },
      // cycles: no projected field — expansion + deferred mints alone kill the
      // ~24KB-per-station mint bursts (~440KB single ticks measured).
      { segs: ['economy', 'cycles'], leafSegs: 4, drop: [], deferFirstSign: true, firstSignTicks: 60 },
    ],
    staggerCold: true,
  };
  configureDomainMirroring(marketWireProfile);
  const world = createPresentationWorld();
  const publisher = createPresentationPublisher(world, readModel, { journal });

  // The in-flight directive ring — production's 8-deep completedTick bound,
  // moved ahead of the wire: pending replies hold journal packs until the
  // present side drains them (newest-wins per frame).
  const pendingDirectives = []; // {order, p, meta, resolved, reply, failed}
  let ringHighWater = 0;
  let ackedJournalEnd = 0;
  let simulationFailure = null;
  // Stage-7 item A bound: outstanding = resolved replies holding a completedTick
  // that the present side has NOT drained. A drained reply frees its slot —
  // presentation (or supersession) is a consume-side decision, not outstanding.
  // Worker lane only: the in-process client has no reply channel to back up.
  const flipLane = options.lane || OPT.simLane;
  let outstandingCompletedTicks = 0;
  let outstandingCompletedTicksMax = 0;
  let completedTickOverflows = 0;
  // Recorded at the first instant the count crosses the bound — the violation
  // depth is bound+1 even when several replies land between bound checks.
  let pendingCompletedTickOverflow = null;
  function enforceCompletedTickBound() {
    if (OPT.ringBound <= 0 || flipLane !== 'worker') return;
    if (!pendingCompletedTickOverflow) return;
    const depth = pendingCompletedTickOverflow.depth;
    completedTickOverflows++;
    const message = `completed-tick queue overflow: ${depth} outstanding completed ticks exceed bound ${OPT.ringBound} (fail-closed)`;
    simulationFailure = { site: 'completedTickQueue', tick: nextTick > 0 ? nextTick - 1 : 0, message };
    const err = new Error(message);
    err.completedTickQueueOverflow = { depth, bound: OPT.ringBound };
    err.simulationFailure = simulationFailure;
    throw err;
  }
  const timing = {
    packMs: [], wireMs: [], consumeMs: [], transportMs: [],
    workMs: [], directiveWireMs: [], rttMs: [], transportTicks: [],
    domainDiffMs: [], domainShipBytes: [], domainMarketShipBytes: [],
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
    eagerMarketMint: options.eagerMarketMint === true,
    // Instrumentation flags (item D-F3): probe blocks ship only when asked.
    aux: OPT.probe === 'aux',
    auxVerify: OPT.probe === 'aux',
    domainProbe: OPT.probe === 'domains',
    domainMirroring: marketWireProfile,
    sabArena: sabArena
      ? { sab: sabArena.sab, slotCount: sabArena.slotCount, recordCap: sabArena.recordCap }
      : null,
    crashAt: Number.isSafeInteger(options.crashAt) ? options.crashAt : null,
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
  const initAbsentKeys = new Set(init.domainAbsentKeys || []);
  for (const key of DOMAIN_MIRROR_KEYS) {
    if (!readModel.domains.has(key)) {
      // Leaf keys that resolve absent at init (drill.*, sectorSim.field,
      // save.slots, factionPresence.boarding) aren't "missing" — they ship a
      // facade the first tick the leaf becomes present.
      if (initAbsentKeys.has(key)) continue;
      domainMissingKeys.push(key);
    }
  }
  compareDomainProbe(init.domainProbe, 'init');

  let frameIndex = 0;
  let currentInput = frames[0] ? frames[0].input : {};
  // Stage-1 command channel: all directive-side mutations cross as typed
  // {input|bus|settings|rpc} envelopes. refInputHistory records every input
  // envelope main-side so the worker's own history.toTape() proves lossless
  // transport at finalize (gate d).
  const commandRing = createSimCommandRing();
  const refInputHistory = createInputCommandHistory();
  const observedRpcAcks = [];
  const observedSettingsAcks = [];
  const observedSpawnAcks = [];
  const observedCommandAcks = [];
  const appliedEnvelopeKinds = new Set();
  let observedFoldsApplied = 0;

  // ---- stage-5 probes ------------------------------------------------------
  // --probe commands: inject one of each new lane kind through the REAL
  // production emitters (sink → descriptor → ring → worker drain). Net-neutral
  // pairs land in a single wire batch so no tick ever observes the transient.
  // --probe market-parity: scripted quote rpcs against unminted + lazily-minted
  // and already-live rows; main() runs eager ON vs OFF and diffs answers+hashes.
  const cmdProbe = {
    spawnToken: null, spawnedId: null, farId: null,
    promoted: false, removed: false,
  };

  const PARITY_QUOTES = new Map([
    [40, [
      { id: 'pq-mint-market', op: 'quote', args: { stationId: 'station_ceres', commodityId: 'cmdty_ore_iron', side: 'buy', qty: 10 } },
      { id: 'pq-mint-listing-deferred', op: 'quote', args: { stationId: 'station_ceres', commodityId: 'cmdty_live_specimen', side: 'buy', qty: 1 } },
      { id: 'pq-listing-defer-live', op: 'quote', args: { stationId: 'station_helios', commodityId: 'cmdty_calcified_filament', side: 'buy', qty: 1 } },
      { id: 'pq-control', op: 'quote', args: { stationId: 'station_helios', commodityId: 'cmdty_ore_iron', side: 'buy', qty: 10 } },
    ]],
    [45, [
      { id: 'pi-ceres-iron', op: 'inspectListing', args: { stationId: 'station_ceres', commodityId: 'cmdty_ore_iron' } },
      { id: 'pi-ceres-specimen', op: 'inspectListing', args: { stationId: 'station_ceres', commodityId: 'cmdty_live_specimen' } },
      { id: 'pi-helios-filament', op: 'inspectListing', args: { stationId: 'station_helios', commodityId: 'cmdty_calcified_filament' } },
      { id: 'pi-control', op: 'inspectListing', args: { stationId: 'station_helios', commodityId: 'cmdty_ore_iron' } },
      // Item-B rpc surface: marketHistory backfills the projected-off history
      // rings — one whole-station read + one per-commodity read.
      { id: 'pmhist-helios', op: 'marketHistory', args: { stationId: 'station_helios' } },
      { id: 'pmhist-ceres-iron', op: 'marketHistory', args: { stationId: 'station_ceres', commodityId: 'cmdty_ore_iron' } },
    ]],
  ]);

  function injectStage5Probe(tick, ring) {
    if (OPT.probe !== 'commands' && !options.parityQuotes) return;
    const dummy = {}; // lane emitters under a sink never touch the state arg
    installSimCommandSink((d) => pushLaneCommand(ring, d));
    try {
      if (options.parityQuotes && PARITY_QUOTES.has(tick)) {
        for (const q of PARITY_QUOTES.get(tick)) {
          pushLaneCommand(ring, { kind: 'rpc', id: q.id, op: q.op, args: q.args });
        }
      }
      if (OPT.probe !== 'commands') return;
      switch (tick) {
        case 30:
          laneInputWrite(dummy, 'player.targetId', 7);
          laneInputWrite(dummy, 'player.targetId', null);
          laneInputWrite(dummy, 'input.targetAssistDisabled', true);
          laneInputWrite(dummy, 'input.targetAssistDisabled', false);
          laneInputWrite(dummy, 'input.blocked', 'probe');
          laneInputWrite(dummy, 'input.blocked', false);
          laneInputWrite(dummy, 'input.worldObjectTargetId', 'wo_probe');
          laneInputWrite(dummy, 'input.worldObjectTargetId', undefined);
          laneInputWrite(dummy, 'ui.docked', true);
          laneInputWrite(dummy, 'ui.docked', false);
          laneSetMode(dummy, null, 'paused');
          laneSetMode(dummy, null, 'flight');
          laneSetNavWaypoint(dummy, { stationId: 'station_ceres', pos: { x: 10, z: 20 } });
          laneClearNavWaypoint(dummy);
          laneWriteSetting(dummy, 'settings.ui.overviewOpen', true);
          laneWriteSetting(dummy, 'settings.ui.overviewOpen', false);
          laneWriteSetting(dummy, 'settings.video.bloom', true);
          laneWriteSetting(dummy, 'settings.video.bloom', false);
          break;
        case 40:
          pushLaneCommand(ring, { kind: 'rpc', id: 'cmdprobe-noop', op: 'noop', args: {} });
          break;
        case 44:
          // physicsPrep rpc round-trip — benign backend short-circuits before
          // rapier init; the heavy rapier re-prep is covered by reload-at-600.
          pushLaneCommand(ring, { kind: 'rpc', id: 'cmdprobe-phys', op: 'physicsPrep', args: { backend: 'noop-backend' } });
          break;
        case 200:
          cmdProbe.spawnToken = laneSpawnEntity(makeShipEntitySpec('ship_wasp', {
            team: 1, factionId: 'faction_reavers',
            pos: { x: 9999, z: 9999 }, rot: 0,
            ai: { role: 'target_dummy' },
          }));
          break;
        case 230:
          if (cmdProbe.spawnedId != null && !cmdProbe.removed) {
            laneRemoveEntity(cmdProbe.spawnedId, { immediate: true });
            cmdProbe.removed = true;
          }
          break;
        case 310:
          if (cmdProbe.farId != null && !cmdProbe.promoted) {
            lanePromote({ id: cmdProbe.farId, source: 'actor', reason: 'commands-probe' });
            cmdProbe.promoted = true;
          }
          break;
        default: break;
      }
    } finally {
      uninstallSimCommandSink();
    }
  }

  function observeStage5Reply(reply) {
    if (Array.isArray(reply.spawnAcks)) observedSpawnAcks.push(...reply.spawnAcks);
    if (Array.isArray(reply.commandAcks)) observedCommandAcks.push(...reply.commandAcks);
    if (Array.isArray(reply.commandProbe)) {
      for (const a of reply.commandProbe) if (a && a.t) appliedEnvelopeKinds.add(a.t);
    }
    for (const a of reply.spawnAcks || []) {
      if (a && a.token === cmdProbe.spawnToken && a.ok) cmdProbe.spawnedId = a.id;
    }
    if (reply.commandsProbe && reply.commandsProbe.farId != null) {
      cmdProbe.farId = reply.commandsProbe.farId;
    }
    observedFoldsApplied += reply.foldsApplied || 0;
  }

  function enqueueFrameEnvelopes(tick) {
    while (frameIndex < frames.length && frames[frameIndex].tick <= tick) {
      const frame = frames[frameIndex];
      currentInput = frame.input || {};
      for (const c of frame.commands) commandRing.pushBus(c);
      frameIndex++;
    }
    injectStage5Probe(tick, commandRing);
    const seq = commandRing.pushInput(currentInput, { wallMs: Date.now() });
    refInputHistory.record(tick, currentInput, { sequence: seq });
  }

  // ---- stage-6 flip: accumulator on main, steps as directives ------------
  const flip = {
    frames: 0, steppingFrames: 0, multiStepFrames: 0, zeroStepFrames: 0,
    directivesPosted: 0, drainDirectives: 0,
    repliesConsumed: 0, completedTicksConsumed: 0,
    presentedTicks: 0, rePresents: 0, skippedPresentationTicks: 0,
    maxInFlight: 0, alphaSum: 0, lastAlpha: 0,
    orderViolations: 0,
  };
  const canaryDigests = options.canary === true ? [] : null;
  const warmStubTicks = [];
  let lastDrainedOrder = -1;

  const canaryScratch = {};
  // Digest canary — hash every reply's deterministic fields (tick ids, journal
  // pack contents incl. typed-array payloads, spawn/aux/domain/event channels,
  // acks). Timing fields are deliberately excluded.
  function replyDigestSig(reply) {
    const pack = reply.pack || {};
    return {
      tick: reply.tick,
      stateTick: reply.stateTick,
      simTime: reply.simTime,
      // inputWallMs carries the enqueue wall clock (Date.now) — scheduling metadata, not a
      // sim-truth field. Null it so the canary compares like-for-like across lanes/processes.
      completedTick: reply.completedTick ? { ...reply.completedTick, inputWallMs: 0 } : null,
      journalStart: reply.journalStart,
      journalEnd: reply.journalEnd,
      journalFullRebuild: reply.journalFullRebuild === true,
      journalRebuildGeneration: reply.journalRebuildGeneration,
      journalValid: reply.journalValid === true,
      pack: {
        count: pack.count, start: pack.start, end: pack.end,
        scalars: pack.scalars, kinds: pack.kinds, typeIndex: pack.typeIndex,
        typeTable: pack.typeTable, spawnEntityIds: pack.spawnEntityIds,
      },
      spawnInfos: reply.spawnInfos,
      auxUpserts: reply.auxUpserts,
      auxRemovals: reply.auxRemovals,
      collectProbe: reply.collectProbe,
      // Wall-clock by design (slot savedAt/lastSavedAt ISO stamps, excluded from the
      // authoritative hash): normalize ISO strings so the canary compares sim truth only.
      domainUpdates: Array.isArray(reply.domainUpdates)
        ? reply.domainUpdates.map((u) => u && typeof u.v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(u.v) ? { ...u, v: '<iso>' } : u)
        : reply.domainUpdates,
      domainProbe: reply.domainProbe,
      domainShipBytes: reply.domainShipBytes,
      events: reply.events,
      warmStubs: reply.warmStubs,
      commandsProbe: reply.commandsProbe,
      commandProbe: reply.commandProbe,
      foldsApplied: reply.foldsApplied,
      rpcAcks: reply.rpcAcks,
      settingsAcks: reply.settingsAcks,
      spawnAcks: reply.spawnAcks,
      commandAcks: reply.commandAcks,
    };
  }

  function postTick(tick, steps, extra = null) {
    if (steps > 0) enqueueFrameEnvelopes(tick);
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
      commandsProbe: OPT.probe === 'commands',
      commandProbe: OPT.probe === 'commands',
      ...(extra || {}),
    });
    const entry = {
      order: flip.directivesPosted++,
      p, meta: { sendNs, tick, steps, ...extra },
      resolved: false, reply: null, failed: null,
    };
    if (steps === 0) flip.drainDirectives++;
    p.then(
      (reply) => {
        entry.resolved = true;
        entry.reply = reply;
        if (reply && reply.completedTick != null) {
          outstandingCompletedTicks++;
          if (outstandingCompletedTicks > outstandingCompletedTicksMax) {
            outstandingCompletedTicksMax = outstandingCompletedTicks;
          }
          if (OPT.ringBound > 0 && outstandingCompletedTicks === OPT.ringBound + 1
              && !pendingCompletedTickOverflow) {
            pendingCompletedTickOverflow = { depth: outstandingCompletedTicks, bound: OPT.ringBound, tick: reply.tick };
          }
        }
      },
      (error) => { entry.resolved = true; entry.failed = error; },
    );
    pendingDirectives.push(entry);
    ringHighWater = Math.max(ringHighWater, pendingDirectives.length);
  }

  // Every drained reply applies its full stream — events, domain updates,
  // journal pack, spawn infos, aux rows, acks — regardless of whether its
  // completedTick is the one that ends up presented.
  function applyReplyStreams(reply) {
    const meta = reply._meta;
    for (const evt of reply.events || []) {
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
    applyDomainUpdatesTracked(reply.domainUpdates);
    if (Array.isArray(reply.rpcAcks)) observedRpcAcks.push(...reply.rpcAcks);
    if (Array.isArray(reply.settingsAcks)) observedSettingsAcks.push(...reply.settingsAcks);
    observeStage5Reply(reply);
    if (Array.isArray(reply.warmStubs) && reply.warmStubs.length) {
      warmStubTicks.push({ tick: meta.tick, count: reply.warmStubs.length });
    }
    journal.push(reply.pack, {
      fullRebuild: reply.journalFullRebuild,
      generation: reply.journalRebuildGeneration,
    });
    if (reply.journalFullRebuild) readModel.entities.clear();
    applySpawnInfos(readModel, reply.spawnInfos);
    applyAuxUpserts(readModel, reply.auxUpserts);
    applyAuxRemovals(readModel, reply.auxRemovals);
    if (canaryDigests) {
      const sig = replyDigestSig(reply);
      canaryDigests.push({ order: reply._meta.order, tick: reply.tick, digest: createHash('sha256').update(canonicalSignature(sig, canaryScratch)).digest('hex'), sig });
    }
  }

  // consumeLatestCompletedTick semantics on the wire: drain every RESOLVED
  // reply in post order, then present only the newest completed tick — merged
  // [earliest journalStart .. newest journalEnd]. A drained-but-skipped reply
  // still applied its streams above; only its presentation tick is dropped
  // (skippedPresentationTicks = production's stale-tick discard counter).
  function consumeResolved() {
    const batch = OPT.consumeBatch;
    let drained = 0;
    let consumedTicks = 0;
    let mergedStart = null;
    let rebuildGen = null;
    let latest = null;
    while (pendingDirectives.length && pendingDirectives[0].resolved
        && (batch === 0 || drained < batch)) {
      const entry = pendingDirectives.shift();
      drained++;
      flip.repliesConsumed++;
      if (entry.reply && entry.reply.completedTick != null) outstandingCompletedTicks--;
      // SPSC ordering proof: reply stream must drain in strict post order.
      if (entry.order <= lastDrainedOrder) flip.orderViolations++;
      lastDrainedOrder = entry.order;
      if (entry.failed) {
        simulationFailure = {
          site: 'tick',
          tick: entry.meta.tick,
          message: String((entry.failed && entry.failed.message) || entry.failed),
        };
        throw entry.failed; // fail-closed — same shape as an in-process step throw
      }
      const reply = entry.reply;
      reply._meta = entry.meta;
      applyReplyStreams(reply);
      if (meta_pauseProbeCheck(reply, entry)) { /* counted inside */ }
      if (reply.completedTick != null) {
        consumedTicks++;
        flip.completedTicksConsumed++;
        if (mergedStart == null || reply.journalFullRebuild) mergedStart = reply.journalStart;
        if (reply.journalFullRebuild) rebuildGen = reply.journalRebuildGeneration;
        latest = reply;
      }
    }
    if (!latest) return;
    flip.presentedTicks++;
    flip.skippedPresentationTicks += consumedTicks - 1;
    const frame = latest;
    const meta = frame._meta;
    const recvNs = frame._recvNs;
    // Destroy ids come out of the merged journal range — the read model tracks
    // the presented window, same as production's merged consume.
    if (mergedStart < frame.journalEnd) {
      destroyScratch.length = 0;
      journal.visitRange(mergedStart, frame.journalEnd, null, (rec) => {
        if (rec.kind === JOURNAL_DESTROY_KIND) destroyScratch.push(rec.entityId);
      });
      if (destroyScratch.length) applyDestroyIds(readModel, destroyScratch);
    }
    const consumeStart = process.hrtime.bigint();
    const r = publisher.consume({
      journalStart: mergedStart,
      journalEnd: frame.journalEnd,
      journalFullRebuild: rebuildGen != null,
      journalRebuildGeneration: rebuildGen != null ? rebuildGen : frame.journalRebuildGeneration,
      journalValid: frame.journalValid,
      journal,
    });
    const consumeNs = process.hrtime.bigint() - consumeStart;
    if (r.fallback) {
      throw new Error(`publisher fell back at tick ${meta.tick}: ${r.error}`);
    }
    journal.discardThrough(frame.journalEnd);
    ackedJournalEnd = Math.max(ackedJournalEnd, frame.journalEnd);

    // Gate F — collect-set equality (instrumented ticks only; the probe block
    // ships under --probe aux).
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

    // Gate F2 — domain-mirror parity (probe blocks ship under --probe domains).
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
    timing.domainMarketShipBytes.push(frame.domainMarketShipBytes || 0);
  }

  let pauseReplyOk = false;
  function meta_pauseProbeCheck(reply, entry) {
    if (!entry.meta || entry.meta.pauseProbe !== true) return false;
    assert.equal(reply.completedTick, null, 'steps:0 must not publish a completedTick');
    assert.equal(reply.stateTick, entry.meta.tick, 'steps:0 must not advance state.tick');
    pauseReplyOk = true;
    return true;
  }

  // Pause-probe: at the frame whose step produces tick 2, deliver the tick-2
  // tape commands through a steps:0 drain directive first (the timeScale<=0
  // path), then the step itself. Ordering is post-order on the SPSC channel.
  const pauseAt = OPT.probe === 'pause' ? 2 : -1;

  const advanceResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  let accumulator = 0;
  let nextTick = 0;
  for (let f = 0; nextTick < OPT.ticks; f++) {
    flip.frames++;
    const frameDt = LOOP_FIXED_DT * FRAME_PATTERN[f % FRAME_PATTERN.length];
    advanceFixedTimestep(accumulator, frameDt, 1, () => {
      const tick = nextTick++;
      if (tick === pauseAt && !pauseProbed) {
        pauseProbed = true;
        // Drain directive: tape commands for this tick + a settings write and
        // a noop rpc exercise the steps:0 command path — acks still return.
        enqueueFrameEnvelopes(tick);
        commandRing.pushSettings('timeScale', 1);
        commandRing.pushRpc('pause-probe-1', 'noop');
        postTick(tick, 0, { pauseProbe: true });
      }
      postTick(tick, 1);
    }, advanceResult, LOOP_FIXED_DT, MAX_CATCHUP_STEPS);
    accumulator = advanceResult.accumulator;
    // interpolationAlpha = clamp(accumulator / fixedDt) — a main-side schedule
    // quantity computed before the drain; worker execution latency never
    // enters it.
    flip.lastAlpha = Math.min(1, Math.max(0, accumulator / LOOP_FIXED_DT));
    flip.alphaSum += flip.lastAlpha;
    if (advanceResult.steps > 0) {
      flip.steppingFrames++;
      if (advanceResult.steps > 1) flip.multiStepFrames++;
    } else {
      flip.zeroStepFrames++;
      // 0-step frames still drain pending commands — an unpause/load addressed
      // to a non-ticking lane must not strand in the ring.
      if (commandRing.size > 0) postTick(nextTick, 0, { drain: true });
    }
    // Bounded in-flight window: block only when the pipeline bound is hit AND
    // the oldest reply hasn't landed; otherwise drain whatever resolved.
    // Under --probe hold-consume the head never drains, so pace production on
    // the newest directive's reply instead — the producer keeps sim rate while
    // resolved replies accumulate undrained to the item-A bound.
    if (OPT.probe === 'hold-consume') {
      const tail = pendingDirectives[pendingDirectives.length - 1];
      if (tail && !tail.resolved) await tail.p.then(() => {}, () => {});
    } else {
      while (pendingDirectives.length >= OPT.pipeline && !pendingDirectives[0].resolved) {
        await pendingDirectives[0].p.then(() => {}, () => {});
      }
    }
    const beforeConsumed = flip.repliesConsumed;
    // --probe hold-consume: the present side stops draining entirely. Resolved
    // replies pile up until the item-A bound fails the run closed at depth 9.
    if (OPT.probe !== 'hold-consume') consumeResolved();
    enforceCompletedTickBound();
    if (flip.repliesConsumed === beforeConsumed) flip.rePresents++;
  }
  // Final drain — every posted directive resolves and consumes.
  while (pendingDirectives.length) {
    if (!pendingDirectives[0].resolved) {
      await pendingDirectives[0].p.then(() => {}, () => {});
    }
    consumeResolved();
    enforceCompletedTickBound();
  }

  const fin = await client.send({ kind: 'finalize' });
  const journalDiagTransport = journal.getDiagnostics();
  assert.equal(fin.kind, 'done');

  return {
    sha256: fin.sha256,
    inputTape: fin.inputTape,
    refTape: refInputHistory.toTape(),
    observedRpcAcks,
    observedSettingsAcks,
    observedSpawnAcks,
    observedCommandAcks,
    appliedEnvelopeKinds: [...appliedEnvelopeKinds],
    observedFoldsApplied,
    cmdProbe: { ...cmdProbe },
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
    sab: {
      requested: OPT.sab,
      active: sabArena != null,
      slotCount: sabArena ? sabArena.slotCount : 0,
      recordCap: sabArena ? sabArena.recordCap : 0,
      packsShared: journalDiagTransport.sabPacks,
      bytesShared: journalDiagTransport.sabBytesShared,
      fallbacks: (journalDiagTransport.sabFallbacks || 0) + (fin.sabFallbacks || 0),
    },
    receivedByType,
    presentationDrained,
    presentationQueueDepth: presentationQueue.length,
    collectProbes,
    collectMismatches,
    collectMismatchSamples,
    auxRowsShipped: fin.auxRowsShipped,
    auxUpsertsTotal: fin.auxUpsertsTotal,
    auxRemovalsTotal: fin.auxRemovalsTotal,
    auxJournalArmed: fin.auxJournalArmed,
    auxJournalDirtyAdds: fin.auxJournalDirtyAdds,
    auxJournalSkippedRows: fin.auxJournalSkippedRows,
    auxJournalBreaches: fin.auxJournalBreaches,
    auxJournalBreachSamples: fin.auxJournalBreachSamples,
    warmStubCount: fin.warmStubCount,
    warmStubTicks,
    flip,
    canaryDigests,
    simulationFailure,
    pauseReplyOk,
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
    outstandingCompletedTicksMax,
    completedTickOverflows,
    ackedJournalEnd,
    transportDiag: journalDiagTransport,
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

// --probe crash: an injected worker step throw must surface as a rejected
// directive at the same tick on BOTH lanes — fail-closed parity is what main
// would see as `onSimulationFailure` after the flip.
async function runCrashLane(lane, crashAt) {
  const client = createClient(lane);
  const result = { lane, failed: false, failTick: null, message: null };
  try {
    const init = await client.send({
      kind: 'init', seed: OPT.seed, reloadAt: null,
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
      crashAt,
    });
    if (init.kind !== 'ready') throw new Error(`init failed on ${lane} lane`);
    for (let t = 0; t <= crashAt + 2; t++) {
      try {
        await client.send({ kind: 'tick', tick: t, commands: [], steps: 1, ackJournalEnd: 0 });
      } catch (error) {
        result.failed = true;
        result.failTick = t;
        result.message = String(error && error.message ? error.message : error);
        return result;
      }
    }
    return result;
  } finally {
    await client.terminate();
  }
}

async function main() {
  const results = [];
  // --probe crash: dedicated fail-closed check across both lanes.
  let crash = { enabled: OPT.probe === 'crash' };
  if (crash.enabled) {
    const crashAt = 240;
    const workerRes = await runCrashLane('worker', crashAt);
    const mainRes = await runCrashLane('main', crashAt);
    crash = {
      enabled: true, crashAt,
      pass: workerRes.failed === true && mainRes.failed === true
        && workerRes.failTick === mainRes.failTick
        && workerRes.message === mainRes.message,
      worker: workerRes,
      main: mainRes,
    };
    const verdict = crash.pass ? 'ALL PASS' : 'GATE FAILURE';
    const out = { schema: 'spaceface.s1WorkerSpike.v1', mode: 'crash-probe', options: OPT, gateJ_crash: crash, verdict };
    if (OPT.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`\n=== S1 Phase-B stage-6 spike: crash probe ===`);
      console.log(`GATE J crash       : ${crash.pass ? 'PASS' : 'FAIL'}  crashAt=${crashAt}`);
      console.log(`  worker: failed=${workerRes.failed} failTick=${workerRes.failTick} message=${workerRes.message}`);
      console.log(`  main  : failed=${mainRes.failed} failTick=${mainRes.failTick} message=${mainRes.message}`);
      console.log(`verdict: ${verdict}`);
    }
    process.exitCode = crash.pass ? 0 : 1;
    return;
  }

  // --probe hold-consume (stage-7 item A): the present side never drains, so
  // resolved completed ticks pile up until the bound fails the run closed at
  // exactly bound+1 outstanding — the same simulationFailure surface a step
  // throw produces. Gate evidence = the overflow firing at depth ringBound+1.
  if (OPT.probe === 'hold-consume') {
    let err = null;
    let run = null;
    try {
      run = await runOnce();
    } catch (e) {
      err = e;
    }
    const ov = err && err.completedTickQueueOverflow;
    const sf = err && err.simulationFailure;
    const pass = !!ov && ov.depth === OPT.ringBound + 1 && ov.bound === OPT.ringBound
      && !!sf && sf.site === 'completedTickQueue'
      && /completed-tick queue overflow/.test(String(err && err.message));
    const out = {
      schema: 'spaceface.s1WorkerSpike.v1', mode: 'hold-consume-probe', options: OPT,
      gate: {
        pass,
        expectedDepth: OPT.ringBound + 1,
        overflow: ov || null,
        simulationFailure: sf || null,
        error: err ? String(err.message) : null,
        completedWithoutOverflow: run !== null,
      },
      verdict: pass ? 'ALL PASS' : 'GATE FAILURE',
    };
    if (OPT.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`\n=== S1 Phase-B stage-7 spike: hold-consume probe ===`);
      console.log(`GATE A hold-consume: ${pass ? 'PASS' : 'FAIL'}  bound=${OPT.ringBound} expectedDepth=${OPT.ringBound + 1}`);
      console.log(`  overflow=${JSON.stringify(ov || null)}`);
      console.log(`  simulationFailure=${JSON.stringify(sf || null)}`);
      if (!err) console.log(`  run completed with no overflow (completedTicks consumed)`);
      console.log(`verdict: ${out.verdict}`);
    }
    process.exitCode = pass ? 0 : 1;
    return;
  }

  // --probe market-parity: identical scripted quote/inspect rpcs against the
  // lazy path (eager OFF) and the deferred path (eager ON). Answers AND the
  // whole-run state hash must match — deferred mints land byte-identically.
  const parity = { enabled: OPT.probe === 'market-parity' };
  // --canary: run BOTH lanes and hash every reply's deterministic payload
  // fields — the tick-for-tick journal-stream identity check (item A).
  const canary = { enabled: OPT.canary === true };
  if (parity.enabled) {
    const off = await runOnce({ eagerMarketMint: false, parityQuotes: true });
    const on = await runOnce({ eagerMarketMint: true, parityQuotes: true });
    results.push(off, on);
    const offAcks = new Map(off.observedRpcAcks.map((a) => [a && a.id, a]));
    const onAcks = new Map(on.observedRpcAcks.map((a) => [a && a.id, a]));
    const parityIds = ['pq-mint-market', 'pq-mint-listing-deferred', 'pq-listing-defer-live', 'pq-control',
      'pi-ceres-iron', 'pi-ceres-specimen', 'pi-helios-filament', 'pi-control',
      'pmhist-helios', 'pmhist-ceres-iron'];
    parity.hashEqual = on.sha256 === off.sha256;
    parity.onHash = on.sha256;
    parity.offHash = off.sha256;
    parity.pairs = parityIds.map((id) => {
      const a = offAcks.get(id);
      const b = onAcks.get(id);
      return { id, equal: JSON.stringify(a) === JSON.stringify(b), off: a || null, on: b || null };
    });
    parity.pass = parity.hashEqual && parity.pairs.every((p) => p.equal && p.off && p.on);
  } else if (canary.enabled) {
    const workerRun = await runOnce({ lane: 'worker', canary: true });
    const mainRun = await runOnce({ lane: 'main', canary: true });
    results.push(workerRun, mainRun);
    const w = workerRun.canaryDigests || [];
    const m = mainRun.canaryDigests || [];
    canary.workerDigests = w.length;
    canary.mainDigests = m.length;
    canary.mismatches = [];
    const n = Math.min(w.length, m.length);
    function diffSigPaths(a, b, base = '') {
      const out = [];
      if (a === b) return out;
      if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
        out.push(`${base || '$'}: ${JSON.stringify(a)?.slice(0, 60)} !== ${JSON.stringify(b)?.slice(0, 60)}`);
        return out;
      }
      const aArr = Array.isArray(a) || ArrayBuffer.isView(a);
      const bArr = Array.isArray(b) || ArrayBuffer.isView(b);
      if (aArr !== bArr) { out.push(`${base}: type differs`); return out; }
      if (aArr) {
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len && out.length < 24; i++) out.push(...diffSigPaths(a[i], b[i], `${base}[${i}]`));
        return out;
      }
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (out.length >= 24) break;
        out.push(...diffSigPaths(a[k], b[k], base ? `${base}.${k}` : k));
      }
      return out;
    }
    for (let i = 0; i < n; i++) {
      if (w[i].digest !== m[i].digest || w[i].tick !== m[i].tick) {
        canary.mismatches.push({
          index: i,
          workerTick: w[i].tick, mainTick: m[i].tick,
          workerDigest: w[i].digest, mainDigest: m[i].digest,
          paths: diffSigPaths(w[i].sig, m[i].sig).slice(0, 12),
        });
      }
    }
    if (w.length !== m.length) {
      canary.mismatches.push({ index: n, error: `digest count differs: worker=${w.length} main=${m.length}` });
    }
    canary.workerHash = workerRun.sha256;
    canary.mainHash = mainRun.sha256;
    canary.hashEqual = workerRun.sha256 === mainRun.sha256;
    canary.pass = canary.mismatches.length === 0 && canary.hashEqual
      && canary.workerDigests > 0 && canary.mainDigests > 0;
  } else {
    for (let i = 0; i < OPT.repeat; i++) {
      results.push(await runOnce());
    }
  }

  const allHashEqual = results.every((r) => r.sha256 === results[0].sha256);
  const hashMatch = results[0].sha256 === OPT.expectedHash;

  // Gate (a): hash parity — mutating probes (aux) still must be deterministic
  // across repeats but are not expected to match the golden hash.
  const mutatingProbe = OPT.probe === 'aux' || OPT.probe === 'churn' || OPT.probe === 'domains'
    || OPT.probe === 'commands' || OPT.probe === 'market-parity' || OPT.probe === 'crash';
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
  const completedTickOutstandingMax = Math.max(...results.map((r) => r.outstandingCompletedTicksMax || 0));
  const completedTickOverflows = results.reduce((a, r) => a + (r.completedTickOverflows || 0), 0);
  const gateC = {
    pass: maxRing <= COMPLETED_TICK_RING_DEPTH && ringBound && completedTickOverflows === 0
      && (OPT.ringBound <= 0 || completedTickOutstandingMax <= OPT.ringBound),
    completedTickHighWater: maxRing,
    completedTickDepth: COMPLETED_TICK_RING_DEPTH,
    ringBound: OPT.ringBound,
    completedTickOutstandingMax,
    completedTickOverflows,
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
  // on every completed tick. Stage-6: the probe is instrumentation — it ships
  // only under --probe aux; flag-off runs skip the check (zero probe cost).
  const gateF = {
    pass: OPT.probe !== 'aux' || (run.collectMismatches === 0 && run.collectProbes > 0),
    instrumented: OPT.probe === 'aux',
    probes: run.collectProbes,
    mismatches: run.collectMismatches,
    samples: run.collectMismatchSamples,
    auxRowsShipped: run.auxRowsShipped,
    auxUpsertsTotal: run.auxUpsertsTotal,
    auxRemovalsTotal: run.auxRemovalsTotal,
    auxJournalArmed: run.auxJournalArmed,
    auxJournalDirtyAdds: run.auxJournalDirtyAdds,
    auxJournalSkippedRows: run.auxJournalSkippedRows,
    auxJournalBreaches: run.auxJournalBreaches,
    auxJournalBreachSamples: run.auxJournalBreachSamples,
    warmStubCount: run.warmStubCount,
    warmStubTicks: run.warmStubTicks,
  };

  // GATE F2 — stage-4 domain mirrors (read model v2): every mirrored key
  // present in readModel.domains, facade canonical signatures equal to the
  // worker's live set on every completed tick, facade identity preserved
  // across same-kind updates (mutate-in-place contract).
  const domainDiffStats = stats(results.flatMap((r) => r.timing.domainDiffMs));
  const domainShipStats = stats(results.flatMap((r) => r.timing.domainShipBytes));
  const domainMarketShipStats = stats(results.flatMap((r) => r.timing.domainMarketShipBytes));
  // GATE G — stage-5 command surface (--probe commands): every new lane kind
  // must have been injected via the production emitters, applied worker-side
  // (commandProbe applied list), and acked ok. spawn→ack→remove and
  // shelve→lane-promote prove the correlated id lifecycles.
  const stage5RequiredKinds = ['mode', 'nav', 'spawn', 'remove', 'promote', 'settings', 'rpc', 'input'];
  const commandsAcksOk = run.observedCommandAcks.every((a) => a && a.ok === true)
    && run.observedSpawnAcks.every((a) => a && a.ok === true);
  const cmdRpcOk = OPT.probe !== 'commands'
    || (run.observedRpcAcks.some((a) => a && a.id === 'cmdprobe-noop' && a.ok === true)
      && run.observedRpcAcks.some((a) => a && a.id === 'cmdprobe-phys' && a.ok === true));
  const gateG = {
    pass: OPT.probe !== 'commands' || (
      stage5RequiredKinds.every((k) => run.appliedEnvelopeKinds.includes(k))
      && run.observedFoldsApplied >= 6
      && commandsAcksOk
      && cmdRpcOk
      && run.cmdProbe.spawnedId != null
      && run.cmdProbe.removed === true
      && run.cmdProbe.promoted === true
      && run.observedCommandAcks.some((a) => a && a.t === 'promote' && a.ok === true)
    ),
    enabled: OPT.probe === 'commands',
    appliedKinds: run.appliedEnvelopeKinds,
    foldsApplied: run.observedFoldsApplied,
    spawnAcks: run.observedSpawnAcks,
    commandAcks: run.observedCommandAcks,
    cmdProbe: run.cmdProbe,
    cmdRpcOk,
  };

  // GATE H — stage-5 market parity (--probe market-parity): eager vs lazy mint
  // paths produce identical quote answers AND identical whole-run state hashes.
  const gateH = {
    pass: !parity.enabled || parity.pass === true,
    enabled: parity.enabled,
    hashEqual: parity.hashEqual || null,
    pairs: parity.pairs || [],
  };

  const gateF2 = {
    pass: run.domainMissingKeys.length === 0 && run.domainIdentityBreaks === 0
      && (OPT.probe !== 'domains' || (run.domainMismatches === 0 && run.domainProbes > 0)),
    instrumented: OPT.probe === 'domains',
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
    // economy.markets.* component of the per-tick ship — item B's target:
    // station-mode wire tail was ~230-280KB whole-station leaves.
    marketShipBytes: {
      meanPerTick: round(domainMarketShipStats.mean, 1),
      p95PerTick: round(domainMarketShipStats.p95, 1),
      maxPerTick: round(domainMarketShipStats.max, 1),
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

  // GATE I — digest canary (--canary): worker-lane replies must hash
  // identical to main-lane replies for every directive — the journal stream
  // is tick-for-tick identical across the flip, through the reload boundary.
  const gateI = {
    pass: !canary.enabled || canary.pass === true,
    enabled: canary.enabled,
    workerDigests: canary.workerDigests || 0,
    mainDigests: canary.mainDigests || 0,
    mismatches: canary.mismatches || [],
    hashEqual: canary.hashEqual || null,
  };

  // Flip accounting — the schedule proof: accumulator kept on main, one
  // directive per accumulated step, newest-wins consumption, ordering proof.
  const flip = run.flip || {};
  const flipOk = flip.completedTicksConsumed === OPT.ticks
    && flip.presentedTicks + flip.rePresents >= 0
    && flip.orderViolations === 0
    && flip.maxInFlight <= OPT.pipeline;
  const gateJ = {
    pass: !canary.enabled || flipOk,
    enabled: canary.enabled,
    frames: flip.frames,
    steppingFrames: flip.steppingFrames,
    multiStepFrames: flip.multiStepFrames,
    zeroStepFrames: flip.zeroStepFrames,
    directivesPosted: flip.directivesPosted,
    drainDirectives: flip.drainDirectives,
    repliesConsumed: flip.repliesConsumed,
    completedTicksConsumed: flip.completedTicksConsumed,
    presentedTicks: flip.presentedTicks,
    rePresents: flip.rePresents,
    skippedPresentationTicks: flip.skippedPresentationTicks,
    maxInFlight: flip.maxInFlight,
    orderViolations: flip.orderViolations,
    meanAlpha: flip.frames ? round(flip.alphaSum / flip.frames) : 0,
    simulationFailure: run.simulationFailure,
  };

  const summary = {
    schema: 'spaceface.s1WorkerSpike.v1',
    mode: 'whole-sim-in-worker',
    options: OPT,
    gates: { a_hash: gateA, b_transport: gateB, c_rings: gateC, d_commandChannel: gateD, e_eventBridge: gateE, f_readModel: gateF, f2_domainMirrors: gateF2, g_commandSurface: gateG, h_marketParity: gateH, i_canary: gateI, j_flip: gateJ },
    verdict: gateA.pass && gateB.pass && gateC.pass && gateD.pass && gateE.pass && gateF.pass && gateF2.pass && gateG.pass && gateH.pass && gateI.pass && gateJ.pass ? 'ALL PASS' : 'GATE FAILURE',
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
      sab: run.sab,
    },
  };

  if (OPT.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== S1 Phase-B stage-6 spike: the flip (lane=${OPT.simLane}) ===`);
    console.log(`GATE A hash parity : ${gateA.pass ? 'PASS' : 'FAIL'}  sha256=${gateA.sha256}`);
    console.log(`                     expected=${gateA.expected}  runs=${gateA.runs} allEqual=${gateA.allRunsEqual}`);
    console.log(`GATE B transport   : ${gateB.pass ? 'PASS' : 'FAIL'}  <0.5ms/tick  ` +
      `mean=${gateB.transport.mean} p95=${gateB.transport.p95} max=${gateB.transport.max}`);
    console.log(`                     pack mean=${gateB.pack.mean} p95=${gateB.pack.p95} | wire mean=${gateB.wire.mean} p95=${gateB.wire.p95} | consume mean=${gateB.consume.mean} p95=${gateB.consume.p95}`);
    if (run.sab && run.sab.requested) {
      console.log(`                     SAB ${run.sab.active ? 'active' : 'INACTIVE'} slots=${run.sab.slotCount}x${run.sab.recordCap}rec packsShared=${run.sab.packsShared} bytesShared=${run.sab.bytesShared} fallbacks=${run.sab.fallbacks}`);
    }
    console.log(`                     >0.5ms ticks: ${gateB.overThresholdCount}  ${JSON.stringify(gateB.overThresholdTicks)}`);
    console.log(`GATE C rings       : ${gateC.pass ? 'PASS' : 'FAIL'}  completedTick hw=${gateC.completedTickHighWater}/8  outstandingMax=${gateC.completedTickOutstandingMax}/${gateC.ringBound} overflows=${gateC.completedTickOverflows} journalRebuilds=${gateC.journalRebuilds}`);
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
    if (gateG.enabled) {
      console.log(`GATE G cmd surface : ${gateG.pass ? 'PASS' : 'FAIL'}  kinds=${JSON.stringify(gateG.appliedKinds)} folds=${gateG.foldsApplied}`);
      console.log(`                     spawnAcks=${JSON.stringify(gateG.spawnAcks)} commandAcks=${JSON.stringify(gateG.commandAcks)} rpcOk=${gateG.cmdRpcOk}`);
    }
    if (gateH.enabled) {
      console.log(`GATE H market parity: ${gateH.pass ? 'PASS' : 'FAIL'}  hashEqual=${gateH.hashEqual}`);
      console.log(`                     pairs=${JSON.stringify(gateH.pairs.map((p) => ({ id: p.id, equal: p.equal })))}`);
      if (!gateH.pass) console.log(`                     detail=${JSON.stringify(gateH.pairs)}`);
    }
    if (gateI.enabled) {
      console.log(`GATE I canary      : ${gateI.pass ? 'PASS' : 'FAIL'}  digests=${gateI.workerDigests}/${gateI.mainDigests} mismatches=${gateI.mismatches.length} hashEqual=${gateI.hashEqual}`);
      if (gateI.mismatches.length) {
        console.log(`                     samples=${JSON.stringify(gateI.mismatches.slice(0, 6))}`);
      }
    }
    console.log(`GATE J flip sched  : ${gateJ.pass ? 'PASS' : 'FAIL'}  frames=${gateJ.frames} (steps=${gateJ.steppingFrames} multi=${gateJ.multiStepFrames} zero=${gateJ.zeroStepFrames})`);
    console.log(`                     directives=${gateJ.directivesPosted} (drain=${gateJ.drainDirectives}) consumed=${gateJ.repliesConsumed} completed=${gateJ.completedTicksConsumed} presented=${gateJ.presentedTicks} rePresents=${gateJ.rePresents} skipped=${gateJ.skippedPresentationTicks} maxInFlight=${gateJ.maxInFlight} orderViolations=${gateJ.orderViolations} meanAlpha=${gateJ.meanAlpha}`);
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
