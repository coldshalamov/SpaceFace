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
  applyWeaponVfxProjectiles,
  applyDestroyIds,
  applyAuxUpserts,
  applyAuxRemovals,
  applyDomainPathUpdate,
  applyEntityVitals,
  applyFacadePose,
  canonicalClone,
  configureDomainMirroring,
  createDomainMirroringProfile,
  DOMAIN_MIRROR_KEYS,
} from '../../scripts/lib/simReadModel.mjs';
import {
  createSimCommandRing,
  pushLaneCommand,
} from '../../scripts/lib/simCommandChannel.mjs';
import { createInputCommandSnapshotQueue } from './inputCommandSnapshot.js';
import { readLocalTimeEffectsSnapshot, applyRemoteTimeEffectsSnapshot, setTimeEffectsGeneration } from './timeEffects.js';
import { createSimLaneJournal, createLaneSabJournalArena } from './simLaneJournal.js';
import {
  bindSabEnvelopeChannel,
  decodeReplyFromSab,
  sabEnvelopeAwaitReply,
  sabEnvelopeDrain,
  sabEnvelopePost,
  SAB_ENV_KIND,
} from '../../scripts/lib/simSabEnvelope.mjs';
import { flattenEventPayload, resolveEventEntityRef } from '../../scripts/lib/simEventBridge.mjs';
import { MAIN_TO_SIM_BUS_EVENTS, KNOWN_UNFORWARDED_BUS_EVENTS } from './mainToSimEventSurface.js';
import { runtimeWorkerUrl } from '../render/runtimeWorkers.js';
import { createLaneTouchSurface } from '../systems/mobile/laneTouchSurface.js';
import { normalizePadSensitivity } from '../systems/gamepad.js';
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
  frameSimStepCap,
} from './simulationRunner.js';

const SIM_LANE = Object.freeze({ MAIN: 'main', WORKER: 'worker' });

// A tick directive has this much responsive main-thread time to come back. Timers and worker
// messages use different task sources: yielding one timer turn does not prove that WebKit had
// a chance to dispatch a queued reply after a cold-start GL/DOM task.
const LANE_STALL_MS = 5000;
const LANE_WATCHDOG_SAMPLE_MS = 100;
// The directive-driven lane has one outstanding reply, while worker-local clock
// replies can outpace rAF presentation. The physical ring stays bounded and a
// single coalesced metadata tail absorbs that presentation-only backlog.
const LANE_COMPLETED_TICK_CAPACITY = 8;

// Sim-bus events that legitimately originate main-side and must replay in the
// worker realm — the census-generated set lives in mainToSimEventSurface.js
// (regenerate via `node scripts/lib/eventSurfaceCensus.mjs --forward-set`). The
// worker's own emits are never bridged back — that is the echo-prevention
// invariant (worker→main replay runs under suppression).

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
 *   (default)        — the whole-sim Worker IS the runtime (Stage-E flip).
 *   ?simLane=main    — escape hatch: run the authoritative sim in-process.
 *   ?simLane=worker  — explicit worker lane (same as the default).
 *   ?simSab=1        — opt into the SAB journal lane; requires
 *                      crossOriginIsolated (COOP/COEP). Without headers this
 *                      warns and the fallback transfer channel serves.
 *   localStorage sf.domainProfile or the diagnostic Electron environment
 *   SPACEFACE_DOMAIN_PROFILE may select the history-bearing commodity profile.
 * Returns { lane, sab, domainProfile, warnings[] }.
 */
export function resolveSimLaneFlags(search) {
  let params = null;
  try {
    const raw = typeof search === 'string'
      ? search
      : (typeof location !== 'undefined' ? location.search : '');
    params = new URLSearchParams(raw || '');
  } catch (_) { params = null; }
  // Stage-E default: the worker lane is the runtime; ?simLane=main is the
  // escape hatch back to the in-process sim. An unrecognized value warns and
  // still takes the default. Harnesses whose canonical root forbids query
  // strings (release-soak browser/electron) select via localStorage
  // 'sf.simLane' instead — the query param wins when both are present.
  let requested = params && params.get('simLane');
  if (requested == null && typeof localStorage !== 'undefined') {
    try { requested = localStorage.getItem('sf.simLane'); } catch (_) { /* storage gated */ }
  }
  const warnings = [];
  let lane;
  if (requested === SIM_LANE.MAIN) lane = SIM_LANE.MAIN;
  else {
    if (requested && requested !== SIM_LANE.WORKER) {
      warnings.push(`unrecognized simLane='${requested}' — worker lane serves by default`);
    }
    lane = SIM_LANE.WORKER;
  }
  let sab = !!(params && (params.get('simSab') === '1' || params.get('simSab') === 'true'));
  if (sab) {
    const isolated = typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
    if (!isolated || typeof SharedArrayBuffer !== 'function') {
      warnings.push('simSab=1 requested but crossOriginIsolated/SharedArrayBuffer unavailable — transfer channel');
      sab = false;
    }
  }
  let requestedDomainProfile = params && params.get('domainProfile');
  if (requestedDomainProfile == null && typeof localStorage !== 'undefined') {
    try { requestedDomainProfile = localStorage.getItem('sf.domainProfile'); } catch (_) { /* storage gated */ }
  }
  requestedDomainProfile = typeof requestedDomainProfile === 'string'
    ? requestedDomainProfile.trim() : '';
  let domainProfile = null;
  if (requestedDomainProfile === 'station' || requestedDomainProfile === 'commodity') {
    domainProfile = requestedDomainProfile;
  } else if (requestedDomainProfile) {
    warnings.push(`unrecognized domainProfile='${requestedDomainProfile}' — station profile serves by default`);
  }
  return {
    lane, sab, domainProfile, domainProfileRequested: requestedDomainProfile || null, warnings,
  };
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
export function createSimLaneRuntime({
  state,
  registry,
  bus,
  flags,
  onInputCommandSnapshot,
  channelFactory,
  helpers,
  pumpScheduler,
  clockMode,
}) {
  const resolved = flags || resolveSimLaneFlags();
  if (!resolved || resolved.lane !== SIM_LANE.WORKER) return null;
  // Browser production gets an autonomous worker clock. Injected channels are
  // directive-driven on purpose: the node/manual fixtures must retain their
  // explicit tick order and never acquire a second wall clock.
  const workerClockMode = clockMode === 'worker-local' || clockMode === 'worker-pump'
    ? clockMode
    : (typeof channelFactory === 'function' ? 'worker-pump' : 'worker-local');
  // The worker clock is injectable only for deterministic transport tests. The production path
  // uses the browser timer and monotonic performance clock; presentationRunner owns when this
  // clock is active, while this module owns its fixed-step cadence and transport wakeups.
  const workerPumpNow = typeof pumpScheduler?.nowMs === 'function'
    ? pumpScheduler.nowMs : nowMs;
  const workerPumpSetTimeout = typeof pumpScheduler?.setTimeout === 'function'
    ? pumpScheduler.setTimeout
    : (fn, delay) => setTimeout(fn, delay);
  const workerPumpClearTimeout = typeof pumpScheduler?.clearTimeout === 'function'
    ? pumpScheduler.clearTimeout
    : (handle) => clearTimeout(handle);
  for (const w of resolved.warnings) console.warn(`[simLane] ${w}`);
  console.info('[simLane] worker lane active — the sim realm runs the whole authoritative step');

  // Worker channel first: a host without Worker support (or a construction-
  // time throw) degrades to the in-process sim while state is still untouched
  // — boot-time main fallback with the default lane flipped.
  let channel;
  try {
    channel = (typeof channelFactory === 'function' ? channelFactory : createBrowserChannel)();
  } catch (error) {
    console.warn(`[simLane] worker construction failed — in-process sim serves: ${(error && error.message) || error}`);
    return null;
  }

  const readModel = createReadModel();
  // This is a diagnostic-only profile selected before the first diff. The
  // same object is installed in this facade realm and sent on init so the
  // worker's differ cannot drift to a different path shape.
  const domainMirroring = createDomainMirroringProfile(resolved.domainProfile || 'station');
  configureDomainMirroring(domainMirroring);

  // ---- sim-owned state binding -------------------------------------------------
  // state.entities becomes the mirrored Map (insertion-ordered = spawn order,
  // matching live entityList ordering); entityList keeps the same array object,
  // refilled from the map each reply so aliased references keep working.
  const laneEntityList = state.entityList;
  const laneWeaponVfxProjectiles = [];
  state.weaponVfxProjectiles = laneWeaponVfxProjectiles;
  state.entities = readModel.entities;
  function reconcileEntities() {
    laneEntityList.length = 0;
    laneWeaponVfxProjectiles.length = 0;
    for (const row of readModel.entities.values()) {
      laneEntityList.push(row);
      if (row && row.type === 'projectile') laneWeaponVfxProjectiles.push(row);
    }
    for (const row of readModel.weaponVfxProjectiles.values()) {
      if (row && row.alive !== false) laneWeaponVfxProjectiles.push(row);
    }
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
    if (isEntityRef(p)) return resolveEventEntityRef(p, readModel.entities);
    if (!p || typeof p !== 'object') {
      return p;
    }
    if (p.entity === undefined && Number.isFinite(p.entityId)) {
      const row = readModel.entities.get(p.entityId);
      if (row) p.entity = resolveEventEntityRef({ entityRef: p.entityId,
        occupantGeneration: p.occupantGeneration }, readModel.entities);
    }
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (isEntityRef(v)) p[k] = resolveEventEntityRef(v, readModel.entities);
      else if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (isEntityRef(v[i])) v[i] = resolveEventEntityRef(v[i], readModel.entities);
        }
      }
    }
    return p;
  }

  // Domain roots whose landed mirror should also emit the facade-bus signal the
  // UI renders on. A sim-side emit replays in the reply the event shipped on;
  // the domain data it announces can trail by the differ's leaf cadence (the
  // missions root signs on the 60-pass cold tier), so a render keyed on the
  // replay alone can run before the rows exist. Re-emitting on mirror land
  // closes that gap — these types are not on the forwarded surface, so nothing
  // echoes back to the worker.
  const DOMAIN_MIRROR_EMITS = Object.freeze({
    missions: 'mission:updated',
  });
  // Domain mirrors write straight into state roots — whole-root keys install the
  // root container once, then deep-assign in place; leaf-path keys graft onto
  // the live root object so main-owned siblings are untouched.
  const domainTouched = new Set();
  const domainHolder = new Map();
  function applyDomainUpdate(u) {
    if (!u || !Array.isArray(u.segs) || u.segs.length === 0) return;
    // Top-level leaf keys ship as one dotted segment (['ui.docked'],
    // ['world.currentSectorId']): graft them as the nested path they name so
    // state.ui.docked/state.world.currentSectorId consumers see the value.
    // Expanded-container updates already carry real per-segment paths.
    const segs = u.segs.length === 1 && u.segs[0].indexOf('.') !== -1
      ? u.segs[0].split('.') : u.segs;
    const root = segs[0];
    domainAppliedKeys[segs.join('.')] = (domainAppliedKeys[segs.join('.')] || 0) + 1;
    domainHolder.clear();
    domainHolder.set(root, state[root]);
    // `touched` guards repeated visits within one source graph. Each wire update
    // is a separate merge, so stale entries would make the next nested snapshot
    // replace its already-mirrored root instead of mutating it in place.
    domainTouched.clear();
    applyDomainPathUpdate(domainHolder, { ...u, segs }, domainTouched);
    state[root] = domainHolder.get(root);
  }
  function applyDomainUpdates(updates) {
    if (!Array.isArray(updates) || !updates.length) return;
    for (const key of DOMAIN_MIRROR_KEYS) {
      if (key.indexOf('.') === -1 && state[key] === undefined) state[key] = {};
    }
    let touchedEmits = null;
    let dockRelease = false;
    for (const u of updates) {
      // The UI's committed undock is a main-side transition, but the
      // authoritative ui.docked fold lands here later.  ScreenManager already
      // popped the station before that mirror reply, so remember the edge and
      // wake its aggregate pause owner after the authoritative value arrives.
      // Do this only for a true -> false edge and an empty local screen stack:
      // a nested modal remains a real pause owner and must not receive a resume
      // edge merely because the dock latch changed.
      const updatePath = Array.isArray(u?.segs) ? u.segs.join('.') : '';
      const wasDocked = updatePath === 'ui.docked' && state.ui?.docked === true;
      applyDomainUpdate(u);
      if (wasDocked && state.ui?.docked !== true
        && !(Array.isArray(state.ui?.screenStack) && state.ui.screenStack.length > 0)) {
        dockRelease = true;
      }
      const root = u && Array.isArray(u.segs) && u.segs.length
        ? String(u.segs[0]).split('.')[0] : null;
      if (root && DOMAIN_MIRROR_EMITS[root]) {
        (touchedEmits || (touchedEmits = new Set())).add(DOMAIN_MIRROR_EMITS[root]);
      }
    }
    if (touchedEmits && bus && typeof bus.emit === 'function') {
      for (const type of touchedEmits) {
        try { bus.emit(type, { missionId: null, stationId: null }); }
        catch (_) { /* listener faults stay caller-owned */ }
      }
    }
    if (dockRelease && bus && typeof bus.emit === 'function') {
      // sim:resume is a main-only signal (the event surface deliberately does
      // not forward it to the worker).  It lets screenManager reconcile its
      // UI-owned timeEffects source without inventing a second dock event or
      // replaying the station transition.
      try { bus.emit('sim:resume', { source: 'sim-lane-domain-mirror' }); }
      catch (_) { /* listener faults stay caller-owned */ }
    }
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
  const tokenCounter = { value: 0 };
  const pending = new Map();            // seq -> { kind, resolve, reject }
  const pendingRpcs = new Map();        // rpc id -> { resolve, reject }
  let inFlight = null;                  // { seq, sentMs, steps, mainThreadDelayedMs }
  let stallWatchdogTimer = null;
  // Worker-local clock commands are not stored in `inFlight`: their replies
  // are unsolicited clockTick messages rather than seq-keyed tickDone
  // replies. Keep a separate identity so a delayed confirmation for an old
  // command cannot close or invalidate its replacement.
  let workerClockCommandFlight = null;
  let sabEnv = null;                    // armed SAB envelope channel (layout v2)
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
    // Worker-local clock replies are unsolicited: the worker keeps stepping
    // while rAF (and therefore this callback) is blocked. They are coalesced
    // at the worker and carry the command sequence that has been applied.
    if (msg.kind === 'clockTick') {
      try {
        applyTickReply(msg);
        if (Number.isSafeInteger(msg.clockSequence)) {
          workerClockLastReceivedSequence = Math.max(workerClockLastReceivedSequence, msg.clockSequence);
          workerClockAckPending = {
            clockSequence: msg.clockSequence,
            journalEnd: Number.isSafeInteger(msg.journalEnd) ? msg.journalEnd : 0,
          };
        }
        // A local-clock reply carries the worker's cumulative completion
        // watermark. Prefer the diagnostic copy because it is explicitly
        // named as the applied watermark; retain the top-level field as the
        // wire-compatible fallback for older replies and focused fixtures.
        const appliedCommandSequence = Number.isSafeInteger(
          msg.clockDiagnostics?.appliedCommandSequence,
        )
          ? msg.clockDiagnostics.appliedCommandSequence
          : (Number.isSafeInteger(msg.commandSequence) ? msg.commandSequence : 0);
        if (appliedCommandSequence > workerClockLastAppliedCommandSequence) {
          workerClockLastAppliedCommandSequence = appliedCommandSequence;
        }
        releaseWorkerClockCommand(appliedCommandSequence);
        flushDirectives();
      } catch (error) {
        failLane(`sim worker clock reply apply failed: ${(error && error.message) || error}`,
          error && error.stack ? String(error.stack) : null);
      }
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
        startWorkerPump();
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
    // A reply can release a long-running directive while timer dispatch is otherwise quiet. The
    // wake is disposable and generation-guarded; normal timer cadence remains the steady clock.
    if (workerPumpRequested && pendingSteps > 0) armWorkerPumpAckWake();
  }

  function releaseFlight(msg, flight) {
    if (stallWatchdogTimer !== null) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
    inFlightSteps = Math.max(0, inFlightSteps - (flight ? flight.steps : 0));
    inFlight = null;
  }

  function releaseWorkerClockCommand(appliedCommandSequence) {
    const flight = workerClockCommandFlight;
    if (!flight || !Number.isSafeInteger(appliedCommandSequence)
      || appliedCommandSequence < flight.commandSequence) return false;
    if (stallWatchdogTimer !== null) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
    workerClockCommandFlight = null;
    workerClockCommandInFlight = false;
    workerClockCommandInFlightSequence = 0;
    return true;
  }

  // ---- SAB envelope reply pump (arena layout v2) ----------------------------------
  // The worker parks on the cmd ring post-arm; its tickDone replies arrive as
  // READY cells on the reply ring. The pump drains them into the same
  // onChannelMessage path postMessage uses (seq-keyed pending resolution,
  // releaseFlight, flushDirectives) and re-arms a non-blocking
  // Atomics.waitAsync so replies land without waiting for the next frame's
  // consume call. Where waitAsync is missing the pump degrades to the
  // per-frame drain inside consumeLatestCompletedTick.
  function drainSabRepliesNow() {
    if (!sabEnv) return;
    try {
      sabEnvelopeDrain(sabEnv, 'reply', (msg, cell, bin) => {
        onChannelMessage(decodeReplyFromSab(msg, bin, (slot, count) => journal.sabPackViewsFor(slot, count)));
      });
    } catch (error) {
      failLane(`sim worker envelope reply drain failed: ${(error && error.message) || error}`,
        error && error.stack ? String(error.stack) : null);
    }
  }

  function pumpSabReplies() {
    if (!sabEnv || laneClosed) return;
    // `seen` is read BEFORE the drain — a reply landing mid-drain must make
    // the waitAsync fall through to another drain pass, not sleep past it.
    const seen = Atomics.load(sabEnv.header, 14 /* SAB_REPLY_SEQ_INDEX */);
    drainSabRepliesNow();
    if (laneClosed) return;
    const next = sabEnvelopeAwaitReply(sabEnv, seen, LANE_STALL_MS);
    if (next && typeof next.then === 'function') {
      next.then(() => {
        if (!laneClosed) pumpSabReplies();
      });
    }
  }

  // One post path for every directive: pre-arm (or SAB-off) directives ride
  // postMessage; post-arm everything goes through the cmd ring so the two
  // channels can never interleave directives. A cell that cannot take the
  // payload (oversize / occupied) fails the lane — the same fail-closed
  // contract the stall detector uses.
  function postLaneDirective(msg) {
    if (!sabEnv) { channel.post(msg); return; }
    const kind = msg.kind === 'tick' ? SAB_ENV_KIND.TICK
      : msg.kind === 'finalize' ? SAB_ENV_KIND.FINALIZE
      : msg.kind === 'shutdown' ? SAB_ENV_KIND.SHUTDOWN
      : SAB_ENV_KIND.OTHER;
    try {
      sabEnvelopePost(sabEnv, 'cmd', msg, kind);
    } catch (error) {
      failLane(`sim worker envelope post failed: ${(error && error.message) || error}`,
        error && error.stack ? String(error.stack) : null);
    }
  }

  function postWorkerClockControl() {
    if (laneClosed || !ready || workerClockMode !== 'worker-local') return;
    postLaneDirective({
      kind: 'clockControl',
      seq: nextToken(),
      active: workerClockRequested === true,
      generation: workerClockGeneration,
      lifecycleGeneration,
      timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 0,
      timeEffectsSnapshot: readLocalTimeEffectsSnapshot(state),
    });
  }

  function postWorkerClockAck() {
    if (laneClosed || !ready || workerClockMode !== 'worker-local' || !workerClockAckPending) return false;
    const ack = workerClockAckPending;
    workerClockAckPending = null;
    postLaneDirective({
      kind: 'clockAck',
      seq: nextToken(),
      clockSequence: ack.clockSequence,
      ackJournalEnd: ack.journalEnd,
      generation: workerClockGeneration,
      lifecycleGeneration,
    });
    workerClockLastAckedSequence = Math.max(workerClockLastAckedSequence, ack.clockSequence || 0);
    return true;
  }

  // ---- envelope queue (descriptor → wire via the shared ring) --------------------
  const envelopeRing = createSimCommandRing();
  const cursorScreen = { x: null, y: null };
  const cursorNdc = { x: 0, y: 0 };
  const cursorHit = { x: 0, z: 0 };
  let cursorProjectionPending = false;
  // The sink's return value is what the caller receives — for rpc descriptors
  // that is a promise resolved/rejected off the wire ack (laneRpc callers
  // like startNewGame await it), for everything else the ring's push result.
  const uninstallSink = installSimCommandSink((d) => enqueueDescriptor(d));
  function enqueueDescriptor(d) {
    if (laneClosed || !d) return null;
    if (workerClockMode === 'worker-local' && d.kind === 'domEvent') {
      // Preserve the boundary request if a prior worker command is still in
      // flight; the reply flush will project this batch before shipping it.
      cursorProjectionPending = true;
    }
    const pointer = d.kind === 'domEvent' ? d.d : null;
    if (pointer && ['mousemove', 'pointermove', 'mousedown'].includes(pointer.type)
      && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
      cursorScreen.x = pointer.clientX;
      cursorScreen.y = pointer.clientY;
    }
    if (d.kind === 'rpc') {
      let resolveRpc;
      let rejectRpc;
      const rpcPromise = new Promise((resolve, reject) => {
        resolveRpc = resolve;
        rejectRpc = reject;
      });
      // Keep the promise itself so ordinary runtime teardown can observe the
      // cancellation rejection before it reaches the host's unhandled-
      // rejection hook.  A worker failure takes a different close path and
      // deliberately remains observable as a rejected RPC.
      pendingRpcs.set(d.id, {
        resolve: resolveRpc,
        reject: rejectRpc,
        promise: rpcPromise,
      });
      pushLaneCommand(envelopeRing, d);
      flushDirectives();
      return rpcPromise;
    }
    const queued = pushLaneCommand(envelopeRing, d);
    if (workerClockMode === 'worker-local') {
      // Input/UI batches are a valid projection boundary. RPC-only batches
      // deliberately stay projection-free and preserve the command FIFO.
      flushDirectives({ projectCursor: d.kind === 'domEvent' });
    }
    // Input/UI descriptors should not wait for the next render callback while the worker owns
    // the clock. A single disposable zero-delay wake preserves FIFO order and coalesces pointer
    // motion without creating one timer per DOM event.
    if (workerPumpRequested) armWorkerPumpAckWake();
    return queued;
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
  // rAF is allowed to stop presenting while the worker-local clock keeps the
  // authoritative sim moving. Keep the physical ring bounded, but retain a
  // single metadata tail once the ring is full. Journal packs/events are
  // already applied in reply order; this tail only coalesces the presentation
  // fence that tells the renderer which latest range is ready.
  let completedOverflow = null;
  let completedTickCoalescingEvents = 0;
  let completedTickCoalescedCount = 0;
  let completedFullRebuildsCoalesced = 0;
  let consumedTickCount = 0;
  let skippedPresentationTicks = 0;
  let lifecycleGeneration = 0;
  // Public worker read snapshots are epoch-bound. A facade can reject an older receipt
  // during restore/new-game without mutating any mirrored authority state on main.
  if (helpers) helpers.workerReadGeneration = () => laneClosed ? -1 : lifecycleGeneration;

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
    if (Array.isArray(msg.weaponVfxProjectiles)) {
      applyWeaponVfxProjectiles(readModel, msg.weaponVfxProjectiles);
    }
    if (Array.isArray(msg.auxUpserts)) applyAuxUpserts(readModel, msg.auxUpserts);
    if (Array.isArray(msg.auxRemovals)) applyAuxRemovals(readModel, msg.auxRemovals);
    applyDomainUpdates(msg.domainUpdates);
    if (msg.timeEffectsSnapshot) applyRemoteTimeEffectsSnapshot(state, 'simulation', msg.timeEffectsSnapshot);
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
    if (Array.isArray(msg.weaponVfxProjectiles)) {
      applyWeaponVfxProjectiles(readModel, msg.weaponVfxProjectiles);
    }
    if (Array.isArray(msg.entityVitals) && msg.entityVitals.length) {
      applyEntityVitals(readModel, msg.entityVitals);
    }
    if (Array.isArray(msg.auxUpserts) && msg.auxUpserts.length) applyAuxUpserts(readModel, msg.auxUpserts);
    if (Array.isArray(msg.auxRemovals) && msg.auxRemovals.length) applyAuxRemovals(readModel, msg.auxRemovals);
    applyDomainUpdates(msg.domainUpdates);
    if (msg.timeEffectsSnapshot) applyRemoteTimeEffectsSnapshot(state, 'simulation', msg.timeEffectsSnapshot);
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
            try {
              const p = remapEventPayload(ev.p);
              if (ev.t === 'sector:enter' && p && typeof p === 'object') {
                // The bridge ships a lite {id,name,seed} shell; renderer sector
                // visuals need the full sector — resolve it from the world
                // mirror (world.sectors is a mirrored leaf).
                const sid = String(p.sectorId || (p.sector && p.sector.id) || '');
                const full = sid && state.world && state.world.sectors
                  ? state.world.sectors[sid] : null;
                if (full && typeof full === 'object') p.sector = full;
              } else if (ev.t === 'settings:restored' && p && typeof p === 'object') {
                // Save restore replaced state.settings inside the worker
                // wholesale; the mirror is main-owned so the restore must be
                // grafted back here for the facade to answer correctly.
                if (p.settings && typeof p.settings === 'object') {
                  state.settings = canonicalClone(p.settings);
                }
              }
              // The worker stamps each envelope with the sim's mode/enterSerial
              // at capture (emit) time. Replay sees the reply's END state
              // otherwise: a batch applying domain updates first would hand a
              // mid-batch emit the wrong mode — e.g. a boot sector:enter
              // minted under 'loading' replaying under 'flight', which mints
              // the heavy post-jump cook instead of the opening skip. Shim the
              // emit-time values for the synchronous dispatch window.
              const emitMode = typeof ev.m === 'string' ? ev.m : null;
              const emitSerial = Number.isSafeInteger(ev.es) ? ev.es : null;
              const prevMode = state.mode;
              const world = state.world;
              const prevSerial = world ? world.enterSerial : undefined;
              if (emitMode != null) state.mode = emitMode;
              if (emitSerial != null && world) world.enterSerial = emitSerial;
              try {
                bus.emit(ev.t, p);
              } finally {
                if (emitMode != null) state.mode = prevMode;
                if (emitSerial != null && world) world.enterSerial = prevSerial;
              }
            } catch (_) { boundaryErrorCount++; }
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
    if (Number.isFinite(msg.clockAccumulator)) state.accumulator = Math.max(0, msg.clockAccumulator);
    if (msg.clockDiagnostics && typeof msg.clockDiagnostics === 'object') {
      const d = msg.clockDiagnostics;
      const bounded = (value, max = 0xffffffff) => Number.isFinite(value)
        ? Math.max(0, Math.min(max, value)) : null;
      workerClockLastDiagnostics = {
        active: d.active === true,
        scale: bounded(d.scale, 4),
        accumulator: bounded(d.accumulator, 1),
        timerPending: d.timerPending === true,
        timerFires: bounded(d.timerFires),
        directiveTicks: bounded(d.directiveTicks),
        steps: bounded(d.steps),
        shedSteps: bounded(d.shedSteps),
        commands: bounded(d.commands),
        pendingCommands: bounded(d.pendingCommands, 4096),
        appliedCommandSequence: bounded(d.appliedCommandSequence),
        awaitingAck: d.awaitingAck === true,
        backpressured: d.backpressured === true,
      };
    }

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
        coalescedCount: Number.isSafeInteger(msg.completedTickCount)
          ? msg.completedTickCount : ct.coalescedCount,
        fullRebuildCount: Number.isSafeInteger(msg.completedFullRebuildCount)
          ? msg.completedFullRebuildCount : ct.fullRebuildCount,
        fullRebuildStart: Number.isSafeInteger(msg.journalFullRebuildStart)
          ? msg.journalFullRebuildStart : ct.fullRebuildStart,
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

  function completedRecordCount(record) {
    return Number.isSafeInteger(record?.coalescedCount) && record.coalescedCount > 0
      ? record.coalescedCount : 1;
  }

  function completedFullCount(record) {
    return Number.isSafeInteger(record?.fullRebuildCount) && record.fullRebuildCount > 0
      ? record.fullRebuildCount : (record?.fullRebuild === true ? 1 : 0);
  }

  function normalizeCompletedTick(fields) {
    const record = { ...(fields || {}) };
    const full = record.fullRebuild === true;
    const journalStart = Number.isSafeInteger(record.journalStart) ? record.journalStart : 0;
    record.coalescedCount = completedRecordCount(record);
    record.fullRebuildCount = completedFullCount(record);
    record.fullRebuildStart = full
      ? (Number.isSafeInteger(record.fullRebuildStart) ? record.fullRebuildStart : journalStart)
      : null;
    return record;
  }

  function mergeCompletedTickMetadata(target, incoming) {
    const targetCount = completedRecordCount(target);
    const incomingCount = completedRecordCount(incoming);
    const targetFull = target?.fullRebuild === true;
    const incomingFull = incoming?.fullRebuild === true;
    const targetFullStart = Number.isSafeInteger(target?.fullRebuildStart)
      ? target.fullRebuildStart : null;
    const incomingFullStart = Number.isSafeInteger(incoming?.fullRebuildStart)
      ? incoming.fullRebuildStart : null;
    const targetStart = Number.isSafeInteger(target?.journalStart) ? target.journalStart : 0;
    const incomingStart = Number.isSafeInteger(incoming?.journalStart) ? incoming.journalStart : targetStart;
    const targetEnd = Number.isSafeInteger(target?.journalEnd) ? target.journalEnd : targetStart;
    const incomingEnd = Number.isSafeInteger(incoming?.journalEnd) ? incoming.journalEnd : incomingStart;
    const full = targetFull || incomingFull;
    const fullStart = incomingFull
      ? (incomingFullStart ?? incomingStart)
      : targetFullStart;
    const fullCount = completedFullCount(target) + completedFullCount(incoming);
    const rebuildGeneration = Math.max(
      Number.isSafeInteger(target?.rebuildGeneration) ? target.rebuildGeneration : 0,
      Number.isSafeInteger(incoming?.rebuildGeneration) ? incoming.rebuildGeneration : 0,
    );

    // The incoming record is the latest snapshot for all scalar/input fields.
    Object.assign(target, incoming);
    target.coalescedCount = targetCount + incomingCount;
    target.fullRebuildCount = fullCount;
    target.fullRebuild = full;
    target.fullRebuildStart = full ? fullStart : null;
    target.rebuildGeneration = rebuildGeneration;
    target.journalStart = full
      ? (Number.isSafeInteger(fullStart) ? fullStart : Math.min(targetStart, incomingStart))
      : Math.min(targetStart, incomingStart);
    target.journalEnd = Math.max(targetEnd, incomingEnd);
  }

  function pushCompletedTick(fields) {
    const record = normalizeCompletedTick(fields);
    if (completedCount >= LANE_COMPLETED_TICK_CAPACITY) {
      if (!completedOverflow) completedOverflow = record;
      else mergeCompletedTickMetadata(completedOverflow, record);
      completedTickCoalescingEvents++;
      completedTickCoalescedCount += completedRecordCount(record);
      completedFullRebuildsCoalesced += completedFullCount(record);
      return;
    }
    completedTicks[completedWrite] = record;
    completedWrite = (completedWrite + 1) % LANE_COMPLETED_TICK_CAPACITY;
    completedCount++;
  }

  // ---- directive posting ---------------------------------------------------------------------
  const advanceResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  let pendingSteps = 0;
  let queuedShedSteps = 0;
  // Worker mode normally receives its wall-clock budget from presentationRunner. Once the
  // renderer is busy, however, rAF is no longer a reliable simulation clock. The worker pump
  // owns only this lane's cadence; main fallback never sees these fields or methods.
  let workerPumpRequested = false;
  let workerClockRequested = false;
  let workerClockGeneration = 0;
  let workerClockCommandSequence = 0;
  let workerClockCommandInFlight = false;
  let workerClockCommandInFlightSequence = 0;
  let workerClockAckPending = null;
  let workerClockLastReceivedSequence = 0;
  let workerClockLastAckedSequence = 0;
  let workerClockLastAppliedCommandSequence = 0;
  let workerClockLastCommandScale = null;
  let workerClockLastDiagnostics = null;
  let workerPumpTimer = null;
  let workerPumpAckWake = null;
  let workerPumpGeneration = 0;
  let workerPumpAnchorMs = 0;
  let workerPumpTicks = 0;
  let workerPumpSteps = 0;
  let workerPumpShedSteps = 0;

  function capPendingSteps(stepCap) {
    const shed = Math.max(0, pendingSteps - stepCap);
    pendingSteps -= shed;
    queuedShedSteps += shed;
    return shed;
  }

  function clearWorkerPumpWake(handleName) {
    const handle = handleName === 'ack' ? workerPumpAckWake : workerPumpTimer;
    if (handle === null) return;
    try { workerPumpClearTimeout(handle); } catch (_) { /* teardown is best-effort */ }
    if (handleName === 'ack') workerPumpAckWake = null;
    else workerPumpTimer = null;
  }

  function stopWorkerPump() {
    workerPumpGeneration++;
    clearWorkerPumpWake('timer');
    clearWorkerPumpWake('ack');
    workerPumpAnchorMs = 0;
  }

  function isCurrentFlight(flight) {
    if (!flight) return false;
    return flight.kind === 'clockCommand'
      ? workerClockCommandFlight === flight
      : inFlight === flight;
  }

  function watchFlight(flight, delayMs = LANE_WATCHDOG_SAMPLE_MS, confirm = false) {
    const dueMs = nowMs() + delayMs;
    const timer = setTimeout(() => {
      // A stale confirmation can run after an ACK has already admitted a new
      // command. Only the timer that is still current may clear the shared
      // handle; otherwise teardown would lose the replacement's watchdog.
      if (stallWatchdogTimer === timer) stallWatchdogTimer = null;
      if (laneClosed || !isCurrentFlight(flight)) return;
      const observedMs = nowMs();
      // A delayed watchdog callback documents unavailable dispatch time. Neither it nor a
      // worker message can run during that interval; do not charge it to worker silence.
      flight.mainThreadDelayedMs += Math.max(0, observedMs - dueMs);
      drainSabRepliesNow();
      if (laneClosed || !isCurrentFlight(flight)) return;
      const responsiveMs = observedMs - flight.sentMs - flight.mainThreadDelayedMs;
      const remainingMs = LANE_STALL_MS - responsiveMs;
      if (remainingMs <= 0) {
        if (confirm) {
          const kind = flight.kind === 'clockCommand' ? 'clock command' : 'tick directive';
          const sequence = flight.kind === 'clockCommand'
            ? `commandSequence ${flight.commandSequence}, seq ${flight.seq}`
            : `seq ${flight.seq}`;
          failLane(`sim worker ${kind} stalled >${LANE_STALL_MS}ms (${sequence})`);
        } else {
          watchFlight(flight, 0, true);
        }
      } else {
        watchFlight(flight, Math.min(LANE_WATCHDOG_SAMPLE_MS, remainingMs));
      }
    }, delayMs);
    stallWatchdogTimer = timer;
  }

  function appendCursorProjection(commands) {
    // Camera/galactic-origin geometry belongs to presentation. The worker has
    // no renderer raycast helper: project on main for every batch, even when
    // the cursor has not moved.
    if (!helpers || typeof helpers.raycastToPlane !== 'function') return;
    const size = viewportSize();
    const mouse = state.settings?.controls?.mouse || {};
    const sensitivity = normalizePadSensitivity(mouse.sensitivity);
    const centered = state.input?.autoFire || cursorScreen.x == null;
    cursorNdc.x = centered || size.w <= 0 ? 0 : (cursorScreen.x / size.w * 2 - 1) * sensitivity;
    cursorNdc.y = centered || size.h <= 0 ? 0 : (1 - cursorScreen.y / size.h * 2) * sensitivity * (mouse.invertY ? -1 : 1);
    const hit = helpers.raycastToPlane(cursorNdc, cursorHit);
    if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) {
      pushLaneCommand(envelopeRing, { kind: 'domEvent', d: { type: 'cursorProjection', x: hit.x, z: hit.z } });
      commands.push(...envelopeRing.drain());
    }
  }

  function flushWorkerClockDirectives({ projectCursor = false } = {}) {
    if (laneClosed || !ready || workerClockMode !== 'worker-local') return;
    // A timer tick can publish just before a main command reaches the worker's
    // serialized chain. Its reply has commandSequence 0 (or an older command
    // sequence) but still needs an ACK; withholding that ACK while the command
    // is in flight deadlocks the worker's coalesced reply and leaves every later
    // RPC buffered. ACKs are safe to send alone; commands remain FIFO below.
    if (workerClockCommandInFlight) {
      if (workerClockAckPending) postWorkerClockAck();
      return;
    }
    const commands = envelopeRing.drain();
    // A clock reply is an acknowledgement boundary, not an input/presentation
    // boundary. Projecting the cursor here turns a real raycast helper into a
    // synthetic cursorProjection command on every reply, which schedules the
    // next reply indefinitely. Reproject only at rAF or input boundaries.
    if (projectCursor || cursorProjectionPending) {
      appendCursorProjection(commands);
      cursorProjectionPending = false;
    }
    const hasJournalAck = pendingAckEnd > 0;
    const hasClockAck = !!workerClockAckPending;
    if (commands.length === 0 && pendingSteps <= 0 && !hasJournalAck && !hasClockAck) return;

    // A pure presentation acknowledgement does not need a synthetic sim tick.
    // The worker consumes it on its serial chain and only emits a reply when a
    // coalesced snapshot is waiting; command and journal acknowledgements ride
    // a clockCommand so their ordering stays before the next fixed step.
    if (commands.length === 0 && !hasJournalAck && hasClockAck) {
      postWorkerClockAck();
      return;
    }

    const ack = workerClockAckPending;
    // A worker reply can have advanced its retained journal beyond the last
    // presentation ACK by the time a queued command is ready. Keep the larger
    // cumulative watermark so the worker does not mistake the combined
    // command for a gap and request a full rebuild on every coalesced reply.
    const ackJournalEnd = Math.max(
      pendingAckEnd,
      Number.isSafeInteger(ack?.journalEnd) ? ack.journalEnd : 0,
    );
    const commandSequence = ++workerClockCommandSequence;
    const msg = {
      kind: 'clockCommand',
      seq: nextToken(),
      commandSequence,
      commands,
      steps: Math.max(0, pendingSteps),
      ackJournalEnd,
      ackClockSequence: ack ? ack.clockSequence : 0,
      generation: lifecycleGeneration,
      lifecycleGeneration,
      timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 0,
      timeEffectsSnapshot: readLocalTimeEffectsSnapshot(state),
    };
    pendingAckEnd = 0;
    postedSteps += Math.max(0, pendingSteps);
    pendingSteps = 0;
    workerClockAckPending = null;
    workerClockCommandInFlight = true;
    workerClockCommandInFlightSequence = commandSequence;
    workerClockLastCommandScale = msg.timeScale;
    const commandFlight = {
      kind: 'clockCommand',
      seq: msg.seq,
      commandSequence,
      sentMs: nowMs(),
      mainThreadDelayedMs: 0,
    };
    workerClockCommandFlight = commandFlight;
    postedDirectives++;
    // Local-clock commands are RPC-like transport boundaries even though the
    // worker reply is unsolicited. Watch them with the same responsive-dispatch
    // budget as directive-driven tick replies.
    watchFlight(commandFlight);
    postLaneDirective(msg);
  }

  function flushDirectives(options = {}) {
    if (laneClosed || !ready) return;
    if (workerClockMode === 'worker-local') {
      flushWorkerClockDirectives(options);
      return;
    }
    if (inFlight) return;
    const commands = envelopeRing.drain();
    if (pendingSteps <= 0 && commands.length === 0 && pendingAckEnd === 0) return;
    appendCursorProjection(commands);
    capPendingSteps(MAX_CATCHUP_STEPS);

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
    inFlight = { seq, sentMs: nowMs(), steps: msg.steps, mainThreadDelayedMs: 0 };
    pending.set(seq, { kind: 'tick' });
    watchFlight(inFlight);
    postLaneDirective(msg);
  }

  function advanceWorkerPump(frameDt) {
    if (laneClosed || !ready) return;
    const dt = Number.isFinite(frameDt) ? Math.max(0, Math.min(frameDt, 0.25)) : 0;
    const effectiveStepCap = frameSimStepCap({
      frameDt: dt,
      fixedDt: LOOP_FIXED_DT,
      maxSteps: MAX_CATCHUP_STEPS,
    });
    state.simCatchupIndex = 0;
    advanceFixedTimestep(
      state.accumulator,
      dt,
      state.timeScale,
      () => { pendingSteps++; state.simCatchupIndex = (state.simCatchupIndex | 0) + 1; },
      advanceResult,
      LOOP_FIXED_DT,
      effectiveStepCap,
    );
    // Keep the same transport ceiling as runner.advance(): a slow worker reply must not allow
    // timer callbacks to build an unbounded batch while the previous directive is in flight.
    const queuedOverflow = capPendingSteps(MAX_CATCHUP_STEPS);
    if (queuedOverflow > 0) {
      advanceResult.shedBacklog = true;
      advanceResult.shedSteps += queuedOverflow;
      advanceResult.steps = Math.max(0, advanceResult.steps - queuedOverflow);
    }
    advanceResult.stepCap = effectiveStepCap;
    advanceResult.catchupPresentationSkips = Math.max(0, (advanceResult.steps | 0) - 1);
    state.accumulator = advanceResult.accumulator;
    workerPumpTicks++;
    workerPumpSteps += advanceResult.steps;
    workerPumpShedSteps += advanceResult.shedSteps;
    sampleLaneUiFold();
    flushDirectives();
  }

  function scheduleWorkerPump(generation = workerPumpGeneration) {
    if (laneClosed || !ready || !workerPumpRequested || generation !== workerPumpGeneration
      || workerPumpTimer !== null) return;
    const delayMs = Math.max(1, LOOP_FIXED_DT * 1000);
    workerPumpTimer = workerPumpSetTimeout(() => {
      workerPumpTimer = null;
      if (laneClosed || !ready || !workerPumpRequested || generation !== workerPumpGeneration) return;
      const now = workerPumpNow();
      const elapsedMs = Number.isFinite(now) && Number.isFinite(workerPumpAnchorMs)
        ? Math.max(0, now - workerPumpAnchorMs) : 0;
      workerPumpAnchorMs = Number.isFinite(now) ? now : workerPumpAnchorMs;
      advanceWorkerPump(elapsedMs / 1000);
      scheduleWorkerPump(generation);
    }, delayMs);
  }

  function armWorkerPumpAckWake() {
    if (laneClosed || !ready || !workerPumpRequested || workerPumpAckWake !== null) return;
    const generation = workerPumpGeneration;
    workerPumpAckWake = workerPumpSetTimeout(() => {
      workerPumpAckWake = null;
      if (laneClosed || !ready || !workerPumpRequested || generation !== workerPumpGeneration) return;
      const now = workerPumpNow();
      const elapsedMs = Number.isFinite(now) && Number.isFinite(workerPumpAnchorMs)
        ? Math.max(0, now - workerPumpAnchorMs) : 0;
      workerPumpAnchorMs = Number.isFinite(now) ? now : workerPumpAnchorMs;
      advanceWorkerPump(elapsedMs / 1000);
      scheduleWorkerPump(generation);
    }, 0);
  }

  function startWorkerPump() {
    if (workerClockMode === 'worker-local') {
      if (laneClosed || !ready || !workerClockRequested) return;
      postWorkerClockControl();
      flushDirectives();
      return;
    }
    if (laneClosed || !ready || !workerPumpRequested) return;
    if (workerPumpTimer !== null) return;
    workerPumpGeneration++;
    workerPumpAnchorMs = workerPumpNow();
    // Fold UI ownership and any command queued before the worker became ready before waiting for
    // the first cadence interval. This is the same zero-step flush used by prepareWithoutAdvance.
    sampleLaneUiFold();
    flushDirectives();
    scheduleWorkerPump(workerPumpGeneration);
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
    }, { capture: true });
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
    listen(window, 'mouseup', (e) => laneDomEvent({ type: 'mouseup', button: e.button }), { capture: true });
    listen(window, 'pointercancel', () => laneDomEvent({ type: 'blur' }));
    const pointerLockTarget = typeof document !== 'undefined' ? document : null;
    listen(pointerLockTarget, 'pointerlockchange', () => {
      if (!pointerLockTarget || !pointerLockTarget.pointerLockElement) {
        laneDomEvent({ type: 'blur' });
      }
    });

    // The mobile touch deck is DOM — it runs here and ships resolved gesture
    // frames as touchFrame descriptors to the worker's input reducer.
    const laneTouch = createLaneTouchSurface({ state: st, bus, helpers });

    return {
      dispose() {
        try { laneTouch.dispose(); } catch (_) {}
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
  // Census coverage check: emits whose type is in NEITHER the forward set nor
  // the generated KNOWN_UNFORWARDED set die at the boundary unrecorded —
  // counted per type so a missed census entry surfaces in getDiagnostics()
  // (and trips the LANE-FWD gate's unforwardedEmitCount === 0 assertion)
  // instead of vanishing silently. Main-only emits ride KNOWN_UNFORWARDED and
  // stay uncounted.
  let unforwardedEmitCount = 0;
  const unforwardedEmitTypes = new Map();
  const busForward = installBusForward(bus);
  function installBusForward(b) {
    if (!b || typeof b.emit !== 'function') return null;
    const origEmit = b.emit.bind(b);
    const origQueue = typeof b.queue === 'function' ? b.queue.bind(b) : null;
    // Shared forward gate for emit AND queue: eventBus.queue() defers through
    // an internal deferred[] pool drained by flush()→emitAll — the wrapped
    // b.emit is never re-entered, so without this wrap a queued emission of a
    // forwarded type silently never reached the worker (stage-9 finding).
    // Queued emits forward at queue time: the worker applies the envelope on
    // its next directive drain while the local deferred slot still delivers to
    // main subscribers on this realm's flush cadence.
    const maybeForward = (type, payload) => {
      if (suppressForward > 0 || typeof type !== 'string') return;
      if (MAIN_TO_SIM_BUS_EVENTS.has(type)) {
        try {
          let wirePayload = payload;
          if (type === 'game:load' || type === 'game:save') {
            // The worker realm has no localStorage of its own — stage this
            // realm's sf.* keyspace so its save system resolves slots and
            // recovery against real bytes.
            wirePayload = Object.assign({}, payload, { __laneStorage: collectLaneSaveStorage() });
          }
          // Same projection the worker→main bridge applies: live sim objects
          // flatten to { entityRef } tokens and unflattenable members reject
          // the whole emit (counted, never shipped malformed).
          const flat = flattenEventPayload(wirePayload);
          if (typeof flat === 'symbol') {
            droppedEnvelopes++;
          } else {
            laneBusEmit(type, flat);
          }
        } catch (_) { droppedEnvelopes++; }
      } else if (!KNOWN_UNFORWARDED_BUS_EVENTS.has(type)) {
        unforwardedEmitCount++;
        if (unforwardedEmitTypes.size < 256) {
          unforwardedEmitTypes.set(type, (unforwardedEmitTypes.get(type) || 0) + 1);
        }
      }
    };
    b.emit = (type, payload) => {
      const result = origEmit(type, payload);
      maybeForward(type, payload);
      return result;
    };
    if (origQueue) {
      b.queue = (type, payload) => {
        const result = origQueue(type, payload);
        maybeForward(type, payload);
        return result;
      };
    }
    return {
      restore() {
        b.emit = origEmit;
        if (origQueue) b.queue = origQueue;
      },
    };
  }

  // ---- runner -------------------------------------------------------------------------------
  const runner = {
    fixedDt: LOOP_FIXED_DT,
    maxSteps: MAX_CATCHUP_STEPS,
    clockOwner: workerClockMode,
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
      // While a directive is in flight, multiple presentation frames can owe the next
      // batch. Apply the same catch-up ceiling to that combined debt: replaying all of
      // it makes each reply slower and the next batch larger. Only whole overdue ticks
      // are shed; command order and the accumulator's fractional phase remain intact.
      const queuedOverflow = capPendingSteps(effectiveStepCap);
      if (queuedOverflow > 0) {
        advanceResult.shedBacklog = true;
        advanceResult.shedSteps += queuedOverflow;
        advanceResult.steps = Math.max(0, advanceResult.steps - queuedOverflow);
      }
      advanceResult.stepCap = effectiveStepCap;
      advanceResult.catchupPresentationSkips = Math.max(0, (advanceResult.steps | 0) - 1);
      state.accumulator = advanceResult.accumulator;
      sampleLaneUiFold();
      flushDirectives({ projectCursor: workerClockMode === 'worker-local' });
      return advanceResult;
    },
    stepOnce() {
      assertLaneOpen();
      pendingSteps++;
      flushDirectives({ projectCursor: workerClockMode === 'worker-local' });
      return true;
    },
    prepareWithoutAdvance() {
      assertLaneOpen();
      advanceResult.steps = 0;
      advanceResult.shedBacklog = false;
      advanceResult.shedSteps = 0;
      advanceResult.accumulator = Number.isFinite(state.accumulator)
        ? Math.max(0, state.accumulator) : 0;
      // Worker-local presentation frames do not call advance(), but they still
      // own the main→worker UI boundary. Keep modal depth and screen-stack
      // admission in sync before flushing the frame's cursor/clock command.
      sampleLaneUiFold();
      flushDirectives({ projectCursor: workerClockMode === 'worker-local' });
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
      let physicalConsumed = 0;
      let representedConsumed = 0;
      let earliestJournalStart = 0;
      let latestFullRebuildStart = null;
      let fullRebuild = false;
      let rebuildGeneration = 0;
      let fullRebuildCount = 0;
      drainSabRepliesNow(); // SAB-mode replies must surface even when waitAsync is absent
      const absorb = (rec) => {
        const represented = completedRecordCount(rec);
        const full = rec.fullRebuild === true;
        if (physicalConsumed === 0) earliestJournalStart = rec.journalStart;
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
        if (full) {
          fullRebuild = true;
          latestFullRebuildStart = Number.isSafeInteger(rec.fullRebuildStart)
            ? rec.fullRebuildStart : rec.journalStart;
        }
        rebuildGeneration = Math.max(
          rebuildGeneration,
          Number.isSafeInteger(rec.rebuildGeneration) ? rec.rebuildGeneration : 0,
        );
        fullRebuildCount += completedFullCount(rec);
        representedConsumed += represented;
        physicalConsumed++;
      };
      while (completedCount > 0) {
        const rec = completedTicks[completedRead];
        absorb(rec);
        completedRead = (completedRead + 1) % LANE_COMPLETED_TICK_CAPACITY;
        completedCount--;
      }
      if (completedOverflow) {
        absorb(completedOverflow);
        completedOverflow = null;
      }
      if (representedConsumed > 0) {
        // A rebuild supersedes every older range still waiting in the ring. Do
        // not hand presentation a pre-rebuild start that the worker already
        // discarded; the full boundary is the only valid beginning.
        out.journalStart = fullRebuild
          ? (Number.isSafeInteger(latestFullRebuildStart)
            ? latestFullRebuildStart : earliestJournalStart)
          : earliestJournalStart;
        out.fullRebuild = fullRebuild;
        out.rebuildGeneration = rebuildGeneration;
        out.coalescedCount = representedConsumed;
        out.fullRebuildCount = fullRebuildCount;
        out.fullRebuildStart = fullRebuild
          ? (Number.isSafeInteger(latestFullRebuildStart) ? latestFullRebuildStart : out.journalStart)
          : null;
      }
      if (representedConsumed > 1) skippedPresentationTicks += representedConsumed - 1;
      consumedTickCount += representedConsumed;
      return representedConsumed;
    },
    alignJournalCursor(sequence) {
      assertLaneOpen();
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        throw new RangeError(`SimulationRunner journal cursor is invalid (${sequence})`);
      }
      if (completedCount > 0 || completedOverflow) {
        throw new Error('SimulationRunner cannot align the journal cursor with pending completed ticks');
      }
      // The real cursor lives in the worker; only bounds-check on this side.
      return sequence;
    },
    setLifecycleGeneration(value) {
      lifecycleGeneration = Number.isSafeInteger(value) && value >= 0 ? value : lifecycleGeneration;
      setTimeEffectsGeneration(state, lifecycleGeneration);
    },
    setClockActive(active) {
      if (laneClosed) return false;
      if (workerClockMode === 'worker-local') {
        workerClockRequested = active === true;
        workerClockGeneration++;
        if (ready) {
          postWorkerClockControl();
          flushDirectives();
        }
        return workerClockRequested;
      }
      if (active === true) {
        workerPumpRequested = true;
        startWorkerPump();
      } else {
        workerPumpRequested = false;
        stopWorkerPump();
      }
      return workerPumpRequested;
    },
    getLifecycleGeneration: () => lifecycleGeneration,
    getPendingCompletedTickCount: () => completedCount
      + (completedOverflow ? completedRecordCount(completedOverflow) : 0),
    isClosed: () => laneClosed,
    close,
    getDiagnostics() {
      return {
        closed: laneClosed,
        closeComplete: laneClosedComplete,
        lane: 'worker',
        clockOwner: workerClockMode,
        workerClockMode,
        workerClockRequested,
        workerClockGeneration,
        workerClockCommandInFlight,
        workerClockCommandSequence,
        workerClockLastReceivedSequence,
        workerClockLastAckedSequence,
        workerClockLastAppliedCommandSequence,
        workerClockLastCommandScale,
        workerClockLastDiagnostics,
        workerClockCommandWallMs: workerClockCommandFlight
          ? Math.max(0, nowMs() - workerClockCommandFlight.sentMs) : null,
        workerClockCommandMainThreadDelayedMs: workerClockCommandFlight
          ? workerClockCommandFlight.mainThreadDelayedMs : null,
        workerClockCommandResponsiveMs: workerClockCommandFlight
          ? Math.max(0, nowMs() - workerClockCommandFlight.sentMs
            - workerClockCommandFlight.mainThreadDelayedMs) : null,
        workerPumpRequested,
        workerPumpTimerPending: workerPumpTimer !== null,
        workerPumpAckWakePending: workerPumpAckWake !== null,
        workerPumpTicks,
        workerPumpSteps,
        workerPumpShedSteps,
        domainProfile: resolved.domainProfile || 'station',
        domainProfileRequested: resolved.domainProfileRequested,
        laneReady: ready,
        replyCount,
        postedDirectives,
        postedSteps,
        pendingSteps,
        queuedShedSteps,
        inFlight: inFlight != null,
        inFlightWallMs: inFlight ? Math.max(0, nowMs() - inFlight.sentMs) : null,
        inFlightMainThreadDelayedMs: inFlight ? inFlight.mainThreadDelayedMs : null,
        inFlightResponsiveMs: inFlight
          ? Math.max(0, nowMs() - inFlight.sentMs - inFlight.mainThreadDelayedMs) : null,
        pendingRpcs: pendingRpcs.size,
        boundaryCaptureCount,
        boundaryErrorCount,
        snapshotObserverErrors,
        droppedEnvelopes,
        suppressedEchoes,
        domainAppliedKeys,
        unforwardedEmitCount,
        unforwardedEmitTypes: Object.fromEntries(unforwardedEmitTypes),
        skippedPresentationTicks,
        consumedTickCount,
        completedTicksPending: completedCount
          + (completedOverflow ? completedRecordCount(completedOverflow) : 0),
        completedTickSlotsPending: completedCount,
        completedTickCoalescingEvents,
        completedTickCoalescedCount,
        completedFullRebuildsCoalesced,
        journal: journal.getDiagnostics(),
        readModelEntities: readModel.entities.size,
        error: laneError,
        errorSite: laneErrorSite,
        // PresentationRunner consumes the same close-cause contract as the
        // in-process SimulationRunner. Preserve the transport names above
        // and expose aliases for the shared simulation-recovery surface.
        closeCauseMessage: laneError,
        closeCauseSite: laneErrorSite,
      };
    },
  };

  // ---- init directive --------------------------------------------------------------
  const initSeq = nextToken();
  const initPayload = {
    kind: 'init',
    seq: initSeq,
    profile: 'production',
    clockMode: workerClockMode,
    timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 0,
    timeEffectsSnapshot: readLocalTimeEffectsSnapshot(state),
    seed: (state.meta && Number.isSafeInteger(state.meta.seed) ? state.meta.seed : 1) >>> 0,
    settings: canonicalClone(state.settings || {}),
    domainMirroring,
    bridgeAll: true,
    tacticalAI: true,
    viewport: viewportSize(),
    // The worker realm has no filesystem — the scenario contract the main lane
    // already parsed rides the directive (host falls back to realm fs only when
    // this is absent, which is the node-adapter path).
    scenarioContract: helpers && helpers.scenarioContract ? canonicalClone(helpers.scenarioContract) : null,
    scenarioContractPath: helpers && helpers.scenarioContractPath ? helpers.scenarioContractPath : null,
    scenarioContractHash: helpers && helpers.scenarioContractHash ? helpers.scenarioContractHash : null,
    // ?simSab=1 honours the flag: the arena is minted here (crossOriginIsolated
    // was already resolved into warnings → sab=false when unavailable) and the
    // worker binds it for journal packs. Attach locally so busy-bit release
    // works on evicted SAB-backed packs.
    sabArena: resolved.sab ? createLaneSabJournalArena() : null,
  };
  const readyPromise = new Promise((resolve, reject) => {
    pending.set(initSeq, { kind: 'init', resolve, reject });
  });
  channel.post(initPayload);
  if (initPayload.sabArena) {
    journal.attachSabArena(initPayload.sabArena);
    // Arm the envelope rings on the same arena — the worker binds the same
    // layout after its own init and starts parking on the cmd ring.
    sabEnv = bindSabEnvelopeChannel(initPayload.sabArena);
    if (sabEnv) pumpSabReplies();
  }

  function close() {
    if (laneClosed) return false;
    if (workerClockMode === 'worker-local') {
      workerClockRequested = false;
      workerClockGeneration++;
      if (ready) {
        try { postWorkerClockControl(); } catch (_) { /* dead channel */ }
      }
    }
    workerPumpRequested = false;
    stopWorkerPump();
    laneClosed = true;
    if (stallWatchdogTimer !== null) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
    workerClockCommandFlight = null;
    workerClockCommandInFlight = false;
    workerClockCommandInFlightSequence = 0;
    try { uninstallSink(); } catch (_) {}
    try { if (busForward && typeof busForward.restore === 'function') busForward.restore(); } catch (_) {}
    try { domSurface.dispose(); } catch (_) {}
    try { journal.close(); } catch (_) {}

    const closingForLaneFailure = laneError !== null;
    for (const [, tracked] of pendingRpcs) {
      // close() is also the normal presentation teardown path.  Fire-and-
      // forget RPCs can still be in flight there; observe only that expected
      // cancellation so their rejection cannot become a page-level error.
      // failLane() sets laneError first, so real worker failures retain their
      // original unhandled-rejection behavior for callers that ignore them.
      if (!closingForLaneFailure && tracked.promise && typeof tracked.promise.catch === 'function') {
        tracked.promise.catch(() => {});
      }
      try { tracked.reject(new Error(laneError || 'sim lane closed')); } catch (_) {}
    }
    pendingRpcs.clear();
    try { postLaneDirective({ kind: 'shutdown', seq: nextToken() }); } catch (_) { /* dead channel */ }
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
    // Retail path resolves workers/wholeSimBrowserWorker.js against the document
    // base (the bundle emits it as a shared-chunk ESM program — same esbuild
    // call as main so vendored deps dedupe); dev keeps the raw-module
    // ./wholeSimBrowserWorker.js sibling.
    runtimeWorkerUrl('simLane', import.meta.url),
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
  // Deserialization failures (a postMessage payload the structured-clone pass
  // could not materialize — e.g. a mis-bound SAB descriptor) arrive here, not
  // on onerror/onmessage. Surface them through the same error path so they
  // quarantine the lane instead of dropping silently.
  worker.onmessageerror = (event) => {
    for (const h of errorHandlers) {
      try { h(new Error(`worker message deserialization failed: ${(event && event.type) || 'messageerror'}`)); } catch (_) {}
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
