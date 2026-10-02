// S1 Phase-B stage 8 — main-thread twin of the whole-sim worker lane.
//
// When ?simLane=worker flips the runtime, this module owns the sim half of
// PresentationRunner's contract: the completedTick ring, the input-snapshot
// queue, the accumulator arithmetic and the journal consumption path keep the
// SAME shapes createSimulationRunner maintains — the worker is a transport,
// not a second runner.
//
// Ownership split under the flip:
//   worker realm : every authoritative system (production manifest
//                  authoritativeSystemIds), the sim bus listeners they carry,
//                  the presentation journal, RNG and world tables.
//   main realm   : presentation (renderer/publisher), UI systems, the DOM
//                  surface, settings persistence, and the mirrored state
//                  facade this file maintains for main-side sim reads.
//
// Fail-closed rule (mirrors stepSimulation): a directive error or a stall
// quarantines the runner — subsequent advances throw "SimulationRunner is
// closed" exactly like a step throw does, so presentationRunner's existing
// failure surface is the whole error path.

import {
  createReadModel,
  applySpawnInfos,
  applyDestroyIds,
  applyAuxUpserts,
  applyAuxRemovals,
  applyDomainPathUpdate,
  applyEntityVitals,
  applyFacadePose,
  canonicalClone,
  configureDomainMirroring,
  DOMAIN_MIRROR_KEYS,
} from '../../scripts/lib/simReadModel.mjs';
import {
  createSimCommandRing,
  pushLaneCommand,
} from '../../scripts/lib/simCommandChannel.mjs';
import { createInputCommandSnapshotQueue } from './inputCommandSnapshot.js';
import { createSimLaneJournal } from './simLaneJournal.js';
import { PRESENTATION_JOURNAL_KINDS } from './presentationJournal.js';
import {
  installSimCommandSink,
  uninstallSimCommandSink,
  laneNotifySpawnAcks,
  laneDomEvent,
  laneUiFold,
  laneViewport,
  laneBusEmit,
} from './simLaneCommands.js';
import {
  modalInputActive,
  shouldNeutralizeFlightInput,
  eventCode,
  isTextEntryTarget,
  isUiCommandTarget,
} from '../systems/input.js';
import {
  advanceFixedTimestep,
  LOOP_FIXED_DT,
  MAX_CATCHUP_STEPS,
} from './simulationRunner.js';

const SIM_LANE = Object.freeze({ MAIN: 'main', WORKER: 'worker' });

// A tick directive has this long to come back before the lane is dead. A real
// worker round-trip is <50ms even on loaded boxes; 5s means the realm is gone.
const LANE_STALL_MS = 5000;
// Replies can never outpace posts (one outstanding directive), but the ring
// keeps the production bound — an overflow is an impossible-state failure,
// not a silent drop.
const LANE_COMPLETED_TICK_CAPACITY = 8;

// Sim-bus events that legitimately originate main-side and must replay in the
// worker realm. The worker's own emits NEVER appear on this list — that is the
// echo-prevention invariant (worker→main replay runs under suppression).
const MAIN_TO_SIM_BUS_EVENTS = new Set([
  'world:playerRelocated',
  'ship:appearanceChanged',
  'entity:kill',
  'entity:spawnRequest',
  'save:restoring',
  'save:loaded',
  'game:load',
  'game:save',
  'scenario:branchChoice',
]);

// The save system's keyspace — shipped to the worker on save/load forwards so
// its own slot-resolution and recovery logic sees real bytes.
function collectLaneSaveStorage() {
  const out = {};
  try {
    if (typeof localStorage === 'undefined') return out;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (typeof key === 'string' && key.startsWith('sf.')) {
        const v = localStorage.getItem(key);
        if (typeof v === 'string') out[key] = v;
      }
    }
  } catch (_) { /* storage enumeration unavailable — ship the empty map */ }
  return out;
}

/**
 * Resolve the sim-lane runtime flags once at boot.
 *   ?simLane=worker  — flip the sim into the whole-sim Worker.
 *   ?simSab=1        — opt into the SAB journal lane; requires
 *                      crossOriginIsolated (COOP/COEP). Without headers this
 *                      warns and the fallback transfer channel serves.
 * Returns { lane, sab, warnings[] }.
 */
export function resolveSimLaneFlags(search) {
  let params = null;
  try {
    const raw = typeof search === 'string'
      ? search
      : (typeof location !== 'undefined' ? location.search : '');
    params = new URLSearchParams(raw || '');
  } catch (_) { params = null; }
  const lane = params && params.get('simLane') === SIM_LANE.WORKER
    ? SIM_LANE.WORKER
    : SIM_LANE.MAIN;
  const warnings = [];
  let sab = !!(params && (params.get('simSab') === '1' || params.get('simSab') === 'true'));
  if (sab) {
    const isolated = typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
    if (!isolated || typeof SharedArrayBuffer !== 'function') {
      warnings.push('simSab=1 requested but crossOriginIsolated/SharedArrayBuffer unavailable — transfer channel');
      sab = false;
    }
  }
  return { lane, sab, warnings };
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now() : Date.now();
}

function viewportSize() {
  const w = (typeof window !== 'undefined' && window && Number.isFinite(window.innerWidth))
    ? window.innerWidth : 0;
  const h = (typeof window !== 'undefined' && window && Number.isFinite(window.innerHeight))
    ? window.innerHeight : 0;
  return { w, h };
}

/**
 * Install the whole-sim worker lane. Returns null on the main lane (nothing
 * else changes — production keeps its in-process sim).
 * Otherwise returns { runner, journal, lane, readyPromise, close } where
 * runner is a createSimulationRunner-compatible object for
 * deps.simulationRunner and journal is the transport journal to hand to
 * deps.presentationJournal.
 */
export function createSimLaneRuntime({ state, registry, bus, flags, onInputCommandSnapshot, channelFactory, helpers }) {
  const resolved = flags || resolveSimLaneFlags();
  if (!resolved || resolved.lane !== SIM_LANE.WORKER) return null;
  for (const w of resolved.warnings) console.warn(`[simLane] ${w}`);
  console.warn('[simLane] worker lane active — the sim realm runs the whole authoritative step');

  const readModel = createReadModel();
  configureDomainMirroring({});

  // ---- sim-owned state binding -------------------------------------------------
  // state.entities becomes the mirrored Map (insertion-ordered = spawn order,
  // matching live entityList ordering); entityList keeps the same array object,
  // refilled from the map each reply so aliased references keep working.
  const laneEntityList = state.entityList;
  state.entities = readModel.entities;
  function reconcileEntities() {
    laneEntityList.length = 0;
    for (const row of readModel.entities.values()) laneEntityList.push(row);
  }

  // Event payloads cross the wire deep-flattened — live entities collapse to
  // { entityRef: <id> } tokens or an entityId field (simEventBridge adapters).
  // Rehydrate them to the mirrored row before emit: a listener mutating the
  // clone (mesh bind, decode kick, flag write) would otherwise touch an object
  // nothing else sees. Unresolvable refs stay as shipped.
  function isEntityRef(v) {
    return !!v && typeof v === 'object' && Number.isFinite(v.entityRef);
  }
  function remapEventPayload(p) {
    if (!p || typeof p !== 'object') {
      return isEntityRef(p) ? (readModel.entities.get(p.entityRef) || p) : p;
    }
    if (p.entity === undefined && Number.isFinite(p.entityId)) {
      const row = readModel.entities.get(p.entityId);
      if (row) p.entity = row;
    }
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (isEntityRef(v)) p[k] = readModel.entities.get(v.entityRef) || v;
      else if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (isEntityRef(v[i])) v[i] = readModel.entities.get(v[i].entityRef) || v[i];
        }
      }
    }
    return p;
  }

  // Domain mirrors write straight into state roots — whole-root keys install the
  // root container once, then deep-assign in place; leaf-path keys graft onto
  // the live root object so main-owned siblings are untouched.
  const domainTouched = new Set();
  const domainHolder = new Map();
  function applyDomainUpdate(u) {
    if (!u || !Array.isArray(u.segs) || u.segs.length === 0) return;
    const root = u.segs[0];
    domainAppliedKeys[u.segs.join('.')] = (domainAppliedKeys[u.segs.join('.')] || 0) + 1;
    domainHolder.clear();
    domainHolder.set(root, state[root]);
    applyDomainPathUpdate(domainHolder, u, domainTouched);
    state[root] = domainHolder.get(root);
  }
  function applyDomainUpdates(updates) {
    if (!Array.isArray(updates) || !updates.length) return;
    for (const key of DOMAIN_MIRROR_KEYS) {
      if (key.indexOf('.') === -1 && state[key] === undefined) state[key] = {};
    }
    for (const u of updates) applyDomainUpdate(u);
  }

  // ---- transport journal ---------------------------------------------------------
  const journal = createSimLaneJournal();
  let pendingAckEnd = 0;
  journal.onAck((end) => { pendingAckEnd = Math.max(pendingAckEnd, end); });
  // A presentation-side rebuild request maps onto the worker's own rebuild —
  // locally minted records would produce sequences the worker never shipped.
  journal.onRebuildRequest(() => {
    enqueueDescriptor({ kind: 'rpc', id: nextToken(), op: 'journalRebuild', args: {} });
  });

  // Journal records also feed the facade's pose/removal fields so main-side
  // entity reads (state.entities.get(id).pos etc.) answer like live rows.
  const recordScratch = {};
  function foldPackIntoReadModel(start, end) {
    journal.visitRange(start, end, recordScratch, (rec) => {
      if (rec.kind === PRESENTATION_JOURNAL_KINDS.TRANSFORM) {
        applyFacadePose(readModel, rec.entityId, rec);
      } else if (rec.kind === PRESENTATION_JOURNAL_KINDS.DESTROY) {
        applyDestroyIds(readModel, [rec.entityId]);
      }
    });
  }

  // ---- worker channel -------------------------------------------------------------
  const channel = (typeof channelFactory === 'function' ? channelFactory : createBrowserChannel)();
  const tokenCounter = { value: 0 };
  const pending = new Map();            // seq -> { kind, resolve, reject }
  const pendingRpcs = new Map();        // rpc id -> { resolve, reject }
  let inFlight = null;                  // { seq, sentMs, steps }
  let laneClosed = false;
  let laneClosedComplete = false;
  let laneError = null;
  let laneErrorSite = null;
  let ready = false;
  let replyCount = 0;
  let postedDirectives = 0;
  let postedSteps = 0;
  let droppedEnvelopes = 0;
  let suppressedEchoes = 0;
  const domainAppliedKeys = Object.create(null);

  function nextToken() { return `l${++tokenCounter.value}`; }

  function failLane(message, site) {
    if (laneError) return;
    laneError = String(message).slice(0, 240);
    laneErrorSite = site || null;
    close();
  }
  function assertLaneOpen() {
    if (laneClosed) {
      const why = laneError ? ` — ${laneError}` : '';
      throw new Error(`SimulationRunner is closed${why}`);
    }
  }

  channel.onMessage((msg) => { onChannelMessage(msg); });
  if (typeof channel.onError === 'function') {
    channel.onError((error) => {
      failLane(`sim worker error: ${(error && error.message) || error || 'unknown'}`);
    });
  }

  function onChannelMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'boot') return;
    if (msg.kind === 'error') {
      const tracked = pending.get(msg.seq);
      if (tracked) { pending.delete(msg.seq); tracked.reject?.(new Error(msg.message || 'worker error')); }
      if (inFlight && inFlight.seq === msg.seq) releaseFlight(msg, inFlight);
      failLane(`sim worker directive failed: ${msg.message || 'unknown'}`, msg.stack || null);
      return;
    }
    const tracked = pending.get(msg.seq);
    if (!tracked) return;
    pending.delete(msg.seq);
    try {
      if (msg.kind === 'ready') {
        applyInitReply(msg);
        ready = true;
        tracked.resolve?.(msg);
      } else if (msg.kind === 'tickDone') {
        if (inFlight && inFlight.seq === msg.seq) releaseFlight(msg, inFlight);
        applyTickReply(msg);
        tracked.resolve?.(msg);
      } else if (msg.kind === 'done' || msg.kind === 'bye') {
        if (inFlight && inFlight.seq === msg.seq) releaseFlight(msg, inFlight);
        tracked.resolve?.(msg);
        if (msg.kind === 'bye') laneClosedComplete = true;
      } else {
        tracked.resolve?.(msg);
      }
    } catch (error) {
      tracked.reject?.(error);
      failLane(`sim worker reply apply failed: ${(error && error.message) || error}`,
        error && error.stack ? String(error.stack) : null);
      return;
    }
    flushDirectives();
  }

  function releaseFlight(msg, flight) {
    inFlightSteps = Math.max(0, inFlightSteps - (flight ? flight.steps : 0));
    inFlight = null;
  }

  // ---- envelope queue (descriptor → wire via the shared ring) --------------------
  const envelopeRing = createSimCommandRing();
  // The sink's return value is what the caller receives — for rpc descriptors
  // that is a promise resolved/rejected off the wire ack (laneRpc callers
  // like startNewGame await it), for everything else the ring's push result.
  const uninstallSink = installSimCommandSink((d) => enqueueDescriptor(d));
  function enqueueDescriptor(d) {
    if (laneClosed || !d) return null;
    if (d.kind === 'rpc') {
      const rpcPromise = new Promise((resolve, reject) => {
        pendingRpcs.set(d.id, { resolve, reject });
      });
      pushLaneCommand(envelopeRing, d);
      flushDirectives();
      return rpcPromise;
    }
    return pushLaneCommand(envelopeRing, d);
  }

  // ---- input boundary -------------------------------------------------------------
  const inputSnapshots = createInputCommandSnapshotQueue(LANE_COMPLETED_TICK_CAPACITY);
  const snapshotObserver = typeof onInputCommandSnapshot === 'function' ? onInputCommandSnapshot : null;
  let nextInputSequence = 0;
  let lastShippedTick = Number.isSafeInteger(state.tick) ? state.tick : 0;
  let inFlightSteps = 0;                // steps posted but not yet acked
  let boundaryCaptureCount = 0;
  let boundaryErrorCount = 0;
  let snapshotObserverErrors = 0;

  // ---- completedTick ring ------------------------------------------------------------
  const completedTicks = new Array(LANE_COMPLETED_TICK_CAPACITY);
  let completedRead = 0;
  let completedWrite = 0;
  let completedCount = 0;
  let consumedTickCount = 0;
  let skippedPresentationTicks = 0;
  let lifecycleGeneration = 0;

  // ---- reply application ------------------------------------------------------------------
  function applyInitReply(msg) {
    if (msg.initRebuild && msg.initRebuild.pack) {
      journal.applyRebuildPack(msg.initRebuild);
      foldPackIntoReadModel(msg.initRebuild.start, msg.initRebuild.end);
      if (Array.isArray(msg.initRebuild.spawnInfos)) {
        applySpawnInfos(readModel, msg.initRebuild.spawnInfos);
      }
    }
    if (Array.isArray(msg.spawnInfos)) applySpawnInfos(readModel, msg.spawnInfos);
    if (Array.isArray(msg.auxUpserts)) applyAuxUpserts(readModel, msg.auxUpserts);
    if (Array.isArray(msg.auxRemovals)) applyAuxRemovals(readModel, msg.auxRemovals);
    applyDomainUpdates(msg.domainUpdates);
    reconcileEntities();
    const vp = viewportSize();
    if (vp.w && vp.h) laneViewport(vp.w, vp.h);

    // Init produced a full rebuild range but no stepped tick; presentation
    // only merges journal windows off consumed completedTicks, so mint one
    // here — the init reply IS the first completed journal production.
    if (msg.initRebuild && Number.isSafeInteger(msg.initRebuild.end)
      && msg.initRebuild.end > msg.initRebuild.start) {
      pushCompletedTick({
        sequence: 0,
        tick: Number.isSafeInteger(msg.stateTick) ? msg.stateTick : 0,
        simTime: Number.isFinite(msg.simTime) ? msg.simTime : 0,
        stateDigestMarker: 0,
        inputSequence: 0,
        inputCommandSeq: 0,
        inputWallMs: 0,
        lifecycleGeneration,
        journalStart: msg.initRebuild.start,
        journalEnd: msg.initRebuild.end,
        fullRebuild: true,
        rebuildGeneration: journal.getRebuildGeneration(),
      });
    }
  }

  function applyTickReply(msg) {
    replyCount++;
    if (Number.isSafeInteger(msg.stateTick)) lastShippedTick = msg.stateTick;

    // Input boundary: replay the worker's publishes into the ring via
    // publish() — reserve+capture atomically, the only order the ring accepts
    // (capture requires the slot to be the newest reserved). The main lane
    // runs the same publish→consume pair inside stepSimulation; here the
    // worker already stepped, so the pair replays at reply time.
    if (Array.isArray(msg.inputPublishes)) {
      for (const pub of msg.inputPublishes) {
        const slotSeq = ++nextInputSequence;
        inputSnapshots.publish(slotSeq, pub.actualTick, lifecycleGeneration, pub.input);
        boundaryCaptureCount++;
        const observerError = inputSnapshots.consume(slotSeq, snapshotObserver);
        if (observerError) snapshotObserverErrors++;
      }
    }

    let journalLo = -1;
    let journalHi = -1;
    if (msg.journalFullRebuild === true && msg.pack) {
      journal.applyRebuildPack({ start: msg.journalStart, end: msg.journalEnd, pack: msg.pack });
      journalLo = msg.journalStart; journalHi = msg.journalEnd;
    } else if (msg.pack && msg.pack.count > 0) {
      journal.applyPack(msg.pack);
      journalLo = msg.pack.start; journalHi = msg.pack.end;
    }
    if (journalLo >= 0 && journalHi > journalLo) foldPackIntoReadModel(journalLo, journalHi);

    if (Array.isArray(msg.spawnInfos) && msg.spawnInfos.length) {
      applySpawnInfos(readModel, msg.spawnInfos);
    }
    if (Array.isArray(msg.entityVitals) && msg.entityVitals.length) {
      applyEntityVitals(readModel, msg.entityVitals);
    }
    if (Array.isArray(msg.auxUpserts) && msg.auxUpserts.length) applyAuxUpserts(readModel, msg.auxUpserts);
    if (Array.isArray(msg.auxRemovals) && msg.auxRemovals.length) applyAuxRemovals(readModel, msg.auxRemovals);
    applyDomainUpdates(msg.domainUpdates);
    reconcileEntities();

    // Worker-emitted sim-bus events replay onto the main bus with forwarding
    // suppressed — otherwise a forwarded type would echo right back.
    if (Array.isArray(msg.events) && msg.events.length && bus && typeof bus.emit === 'function') {
      if (typeof window !== 'undefined') {
        const log = window.__SF_LANE_APPLIED || (window.__SF_LANE_APPLIED = []);
        for (const ev of msg.events) { if (ev && typeof ev.t === 'string') log.push(ev.t); }
        if (log.length > 96) log.splice(0, log.length - 96);
      }
      suppressForward++;
      try {
        for (const ev of msg.events) {
          if (ev && typeof ev.t === 'string') {
            try { bus.emit(ev.t, remapEventPayload(ev.p)); } catch (_) { /* listener faults stay caller-side */ }
          }
        }
      } finally { suppressForward--; }
    }

    if (Array.isArray(msg.rpcAcks) && msg.rpcAcks.length) {
      for (const ack of msg.rpcAcks) {
        const tracked = ack && pendingRpcs.get(ack.id);
        if (!tracked) continue;
        pendingRpcs.delete(ack.id);
        if (ack.ok === false) tracked.reject(new Error(ack.reason || `lane rpc ${ack.op || ''} failed`));
        else tracked.resolve(ack);
      }
    }
    if (Array.isArray(msg.spawnAcks) && msg.spawnAcks.length) {
      laneNotifySpawnAcks(msg.spawnAcks);
    }

    // Worker realm storage writes — the sim's own save bytes — persist to real
    // localStorage here. Ordered with tick replies, same authority ordering the
    // sim had when it wrote them.
    if (Array.isArray(msg.storageOps) && msg.storageOps.length) {
      for (const op of msg.storageOps) {
        try {
          if (!op) continue;
          if (op.op === 'set' && typeof op.key === 'string' && typeof op.value === 'string') localStorage.setItem(op.key, op.value);
          else if (op.op === 'remove' && typeof op.key === 'string') localStorage.removeItem(op.key);
          else if (op.op === 'clear') {
            const doomed = [];
            for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sf.')) doomed.push(k); }
            for (const k of doomed) localStorage.removeItem(k);
          }
        } catch (_) { /* persistence relay is best-effort; quota policy stayed worker-side */ }
      }
    }

    if (Number.isSafeInteger(msg.stateTick)) state.tick = msg.stateTick;
    if (Number.isFinite(msg.simTime)) state.simTime = msg.simTime;

    if (msg.completedTick) {
      const ct = msg.completedTick;
      pushCompletedTick({
        sequence: ct.sequence,
        tick: ct.tick,
        simTime: ct.simTime,
        stateDigestMarker: ct.stateDigestMarker,
        inputSequence: ct.inputSequence,
        inputCommandSeq: ct.inputCommandSeq,
        inputWallMs: ct.inputWallMs,
        lifecycleGeneration,
        journalStart: ct.journalStart,
        journalEnd: ct.journalEnd,
        fullRebuild: msg.journalFullRebuild === true,
        rebuildGeneration: msg.journalRebuildGeneration || 0,
      });
    } else if (journalHi > journalLo || msg.journalFullRebuild === true) {
      // A steps:0 reply that produced journal records is still presentation-
      // complete. Loading screens run at timeScale 0 — no sim steps ever post
      // — and without this the pending journal window never merges: the
      // publisher would starve at sequence 0 while the wire packs pile up.
      pushCompletedTick({
        sequence: replyCount,
        tick: Number.isSafeInteger(msg.stateTick) ? msg.stateTick : lastShippedTick,
        simTime: Number.isFinite(msg.simTime) ? msg.simTime : state.simTime,
        stateDigestMarker: 0,
        inputSequence: 0,
        inputCommandSeq: 0,
        inputWallMs: 0,
        lifecycleGeneration,
        journalStart: journalLo >= 0 ? journalLo
          : (Number.isSafeInteger(msg.journalStart) ? msg.journalStart : journal.getOldestSequence()),
        journalEnd: journalHi >= 0 ? journalHi
          : (Number.isSafeInteger(msg.journalEnd) ? msg.journalEnd : journal.getWriteSequence()),
        fullRebuild: msg.journalFullRebuild === true,
        rebuildGeneration: msg.journalRebuildGeneration || 0,
      });
    }
  }

  function pushCompletedTick(fields) {
    if (completedCount >= LANE_COMPLETED_TICK_CAPACITY) {
      throw new Error(`SimulationRunner completed-tick queue overflow (${LANE_COMPLETED_TICK_CAPACITY})`);
    }
    completedTicks[completedWrite] = fields;
    completedWrite = (completedWrite + 1) % LANE_COMPLETED_TICK_CAPACITY;
    completedCount++;
  }

  // ---- directive posting ---------------------------------------------------------------------
  const advanceResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  let pendingSteps = 0;

  function flushDirectives() {
    if (laneClosed || !ready) return;
    if (inFlight) {
      if (nowMs() - inFlight.sentMs > LANE_STALL_MS) {
        failLane(`sim worker tick directive stalled >${LANE_STALL_MS}ms (seq ${inFlight.seq})`);
      }
      return;
    }
    const commands = envelopeRing.drain();
    if (pendingSteps <= 0 && commands.length === 0 && pendingAckEnd === 0) return;

    const seq = nextToken();
    const msg = {
      kind: 'tick',
      seq,
      tick: postedDirectives,
      steps: pendingSteps,
      commands,
      ackJournalEnd: pendingAckEnd,
      generation: lifecycleGeneration,
    };
    pendingAckEnd = 0;
    pendingSteps = 0;
    inFlightSteps += msg.steps;
    postedDirectives++;
    postedSteps += msg.steps;
    inFlight = { seq, sentMs: nowMs(), steps: msg.steps };
    pending.set(seq, { kind: 'tick' });
    channel.post(msg);
  }

  // ---- DOM surface -------------------------------------------------------------------------
  function installLaneDomSurface(st) {
    if (typeof window === 'undefined' || !window || typeof window.addEventListener !== 'function') {
      return { dispose() {} };
    }
    const canvas = (typeof document !== 'undefined')
      ? document.getElementById('gl-canvas') : null;
    const bindings = [];
    const listen = (target, type, fn, options) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, options);
      bindings.push({ target, type, fn, options });
    };

    listen(window, 'resize', () => {
      laneDomEvent({ type: 'resize' });
      laneViewport(viewportSize().w, viewportSize().h);
    });
    listen(window, 'keydown', (e) => {
      laneDomEvent({
        type: 'keydown',
        code: eventCode(e),
        pressed: true,
        repeat: e.repeat === true,
        blocked: modalInputActive()
          || isTextEntryTarget(e.target)
          || isUiCommandTarget(e.target),
      });
    });
    listen(window, 'keyup', (e) => {
      laneDomEvent({ type: 'keyup', code: eventCode(e), pressed: false });
    });
    listen(window, 'blur', () => laneDomEvent({ type: 'blur' }));

    const pointerDescriptor = (e) => ({
      type: e.type,
      clientX: e.clientX,
      clientY: e.clientY,
      movementX: e.movementX,
      movementY: e.movementY,
      uiCommand: isUiCommandTarget(e.target),
      neutralize: shouldNeutralizeFlightInput(st, modalInputActive()),
    });
    const handlePointerMove = (e) => laneDomEvent(pointerDescriptor(e));
    listen(window, 'mousemove', handlePointerMove, { capture: true });
    listen(window, 'pointermove', handlePointerMove, { capture: true });
    const surface = canvas || window;
    listen(surface, 'mousedown', (e) => {
      const d = pointerDescriptor(e);
      d.type = 'mousedown';
      d.offCanvas = !!(canvas && e.target !== canvas);
      d.button = e.button;
      laneDomEvent(d);
      if (e.button === 1 && typeof e.preventDefault === 'function') e.preventDefault();
    });
    listen(window, 'mouseup', (e) => laneDomEvent({ type: 'mouseup', button: e.button }));

    return {
      dispose() {
        for (const { target, type, fn, options } of bindings) {
          try { target.removeEventListener(type, fn, options); } catch (_) { /* host teardown */ }
        }
        bindings.length = 0;
      },
    };
  }
  const domSurface = installLaneDomSurface(state);

  // ---- ui fold sampling ------------------------------------------------------------------------
  let lastModalActive = null;
  let lastScreenStackLen = -1;
  function sampleLaneUiFold() {
    const stack = state.ui && Array.isArray(state.ui.screenStack) ? state.ui.screenStack.length : 0;
    const modal = modalInputActive();
    if (modal === lastModalActive && stack === lastScreenStackLen) return;
    lastModalActive = modal;
    lastScreenStackLen = stack;
    laneUiFold({ modalActive: modal, screenStackLen: stack });
  }

  // ---- main→worker bus forward -------------------------------------------------------------------
  let suppressForward = 0;
  installBusForward(bus);
  function installBusForward(b) {
    if (!b || typeof b.emit !== 'function') return;
    const origEmit = b.emit.bind(b);
    b.emit = (type, payload) => {
      const result = origEmit(type, payload);
      if (suppressForward <= 0 && MAIN_TO_SIM_BUS_EVENTS.has(type)) {
        try {
          let wirePayload = payload;
          if (type === 'game:load' || type === 'game:save') {
            // The worker realm has no localStorage of its own — stage this
            // realm's sf.* keyspace so its save system resolves slots and
            // recovery against real bytes.
            wirePayload = Object.assign({}, payload, { __laneStorage: collectLaneSaveStorage() });
          }
          laneBusEmit(type, canonicalClone(wirePayload));
        } catch (_) { droppedEnvelopes++; }
      }
      return result;
    };
  }

  // ---- runner -------------------------------------------------------------------------------
  const runner = {
    fixedDt: LOOP_FIXED_DT,
    maxSteps: MAX_CATCHUP_STEPS,
    advance(frameDt, timeScale = state.timeScale, perCallStepCap = MAX_CATCHUP_STEPS) {
      assertLaneOpen();
      const requestedStepCap = Number.isFinite(perCallStepCap)
        ? Math.floor(perCallStepCap)
        : MAX_CATCHUP_STEPS;
      const effectiveStepCap = Math.max(1, Math.min(MAX_CATCHUP_STEPS, requestedStepCap));
      state.simCatchupIndex = 0;
      // Identical arithmetic to the in-process advance — the step callback
      // counts into pendingSteps instead of stepping inline.
      advanceFixedTimestep(
        state.accumulator,
        frameDt,
        timeScale,
        () => { pendingSteps++; state.simCatchupIndex = (state.simCatchupIndex | 0) + 1; },
        advanceResult,
        LOOP_FIXED_DT,
        effectiveStepCap,
      );
      advanceResult.stepCap = effectiveStepCap;
      advanceResult.catchupPresentationSkips = Math.max(0, (advanceResult.steps | 0) - 1);
      state.accumulator = advanceResult.accumulator;
      sampleLaneUiFold();
      flushDirectives();
      return advanceResult;
    },
    stepOnce() {
      assertLaneOpen();
      pendingSteps++;
      flushDirectives();
      return true;
    },
    prepareWithoutAdvance() {
      assertLaneOpen();
      advanceResult.steps = 0;
      advanceResult.shedBacklog = false;
      advanceResult.shedSteps = 0;
      advanceResult.accumulator = Number.isFinite(state.accumulator)
        ? Math.max(0, state.accumulator) : 0;
      flushDirectives();
      return advanceResult;
    },
    interpolationAlpha() {
      assertLaneOpen();
      const accumulator = Number.isFinite(state.accumulator) ? state.accumulator : 0;
      const alpha = accumulator / LOOP_FIXED_DT;
      return alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
    },
    consumeLatestCompletedTick(out) {
      assertLaneOpen();
      if (!out || typeof out !== 'object') {
        throw new TypeError('consumeLatestCompletedTick requires a caller-owned output object');
      }
      let consumed = 0;
      let earliestJournalStart = 0;
      while (completedCount > 0) {
        const rec = completedTicks[completedRead];
        if (consumed === 0) earliestJournalStart = rec.journalStart;
        out.sequence = rec.sequence;
        out.tick = rec.tick;
        out.simTime = rec.simTime;
        out.stateDigestMarker = rec.stateDigestMarker;
        out.inputSequence = rec.inputSequence;
        out.inputCommandSeq = rec.inputCommandSeq;
        out.inputWallMs = rec.inputWallMs;
        out.lifecycleGeneration = rec.lifecycleGeneration;
        out.journalStart = rec.journalStart;
        out.journalEnd = rec.journalEnd;
        out.fullRebuild = rec.fullRebuild === true;
        out.rebuildGeneration = rec.rebuildGeneration || 0;
        completedRead = (completedRead + 1) % LANE_COMPLETED_TICK_CAPACITY;
        completedCount--;
        consumed++;
      }
      if (consumed > 0) out.journalStart = earliestJournalStart;
      if (consumed > 1) skippedPresentationTicks += consumed - 1;
      consumedTickCount += consumed;
      return consumed;
    },
    alignJournalCursor(sequence) {
      assertLaneOpen();
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        throw new RangeError(`SimulationRunner journal cursor is invalid (${sequence})`);
      }
      if (completedCount > 0) {
        throw new Error('SimulationRunner cannot align the journal cursor with pending completed ticks');
      }
      // The real cursor lives in the worker; only bounds-check on this side.
      return sequence;
    },
    setLifecycleGeneration(value) {
      lifecycleGeneration = Number.isSafeInteger(value) && value >= 0 ? value : lifecycleGeneration;
    },
    getLifecycleGeneration: () => lifecycleGeneration,
    getPendingCompletedTickCount: () => completedCount,
    isClosed: () => laneClosed,
    close,
    getDiagnostics() {
      return {
        closed: laneClosed,
        closeComplete: laneClosedComplete,
        lane: 'worker',
        laneReady: ready,
        replyCount,
        postedDirectives,
        postedSteps,
        inFlight: inFlight != null,
        pendingRpcs: pendingRpcs.size,
        boundaryCaptureCount,
        boundaryErrorCount,
        snapshotObserverErrors,
        droppedEnvelopes,
        suppressedEchoes,
        domainAppliedKeys,
        skippedPresentationTicks,
        consumedTickCount,
        completedTicksPending: completedCount,
        journal: journal.getDiagnostics(),
        readModelEntities: readModel.entities.size,
        error: laneError,
        errorSite: laneErrorSite,
      };
    },
  };

  // ---- init directive --------------------------------------------------------------
  const initSeq = nextToken();
  const initPayload = {
    kind: 'init',
    seq: initSeq,
    profile: 'production',
    seed: (state.meta && Number.isSafeInteger(state.meta.seed) ? state.meta.seed : 1) >>> 0,
    settings: canonicalClone(state.settings || {}),
    domainMirroring: {},
    bridgeAll: true,
    tacticalAI: true,
    viewport: viewportSize(),
    // The worker realm has no filesystem — the scenario contract the main lane
    // already parsed rides the directive (host falls back to realm fs only when
    // this is absent, which is the node-adapter path).
    scenarioContract: helpers && helpers.scenarioContract ? canonicalClone(helpers.scenarioContract) : null,
    scenarioContractPath: helpers && helpers.scenarioContractPath ? helpers.scenarioContractPath : null,
    scenarioContractHash: helpers && helpers.scenarioContractHash ? helpers.scenarioContractHash : null,
    sabArena: null, // browser lane: SAB needs COOP/COEP — the transfer channel is the default.
  };
  const readyPromise = new Promise((resolve, reject) => {
    pending.set(initSeq, { kind: 'init', resolve, reject });
  });
  channel.post(initPayload);

  function close() {
    if (laneClosed) return false;
    laneClosed = true;
    try { uninstallSink(); } catch (_) {}
    try { domSurface.dispose(); } catch (_) {}
    try { journal.close(); } catch (_) {}

    for (const [, tracked] of pendingRpcs) {
      try { tracked.reject(new Error(laneError || 'sim lane closed')); } catch (_) {}
    }
    pendingRpcs.clear();
    try { channel.post({ kind: 'shutdown', seq: nextToken() }); } catch (_) { /* dead channel */ }
    try { if (typeof channel.terminate === 'function') channel.terminate(); } catch (_) {}
    laneClosedComplete = true;
    return true;
  }

  return {
    runner,
    journal,
    lane: SIM_LANE.WORKER,
    readyPromise,
    close,
    getDiagnostics: runner.getDiagnostics,
  };
}

// The channel contract simLaneMain consumes. A browser Worker is the default;
// a verification lane (node twin) may inject an adapter with the same surface:
//   post(msg) / onMessage(cb) / onError(cb) / terminate()
function createBrowserChannel() {
  const worker = new Worker(
    new URL('./wholeSimBrowserWorker.js', import.meta.url),
    { type: 'module' },
  );
  const messageHandlers = [];
  const errorHandlers = [];
  worker.onmessage = (event) => {
    const msg = event && event.data;
    for (const h of messageHandlers) {
      try { h(msg); } catch (_) { /* handler faults are caller bugs */ }
    }
  };
  worker.onerror = (event) => {
    const error = (event && (event.error || event.message)) || 'worker error';
    for (const h of errorHandlers) {
      try { h(error); } catch (_) {}
    }
  };
  return {
    post(msg) { worker.postMessage(msg); },
    onMessage(cb) { messageHandlers.push(cb); },
    onError(cb) { errorHandlers.push(cb); },
    terminate() { try { worker.terminate(); } catch (_) {} },
    raw: worker,
  };
}
