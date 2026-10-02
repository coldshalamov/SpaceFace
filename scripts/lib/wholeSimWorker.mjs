// S1 Phase-A spike — worker-side host for whole-sim-in-worker.
//
// Runs the FULL 47-A golden composition (createSimulation + the legacy47a explicit system set)
// inside a real worker_threads worker. The runner/cadence stays on the main thread: each
// 'tick' directive carries { input, commands, steps } exactly as the runner would drain them;
// the worker applies input + tape commands + scenario intents, then registry.step once per
// directive step. Replies carry { completedTick, journal byte-range pack, spawn info blocks,
// flat-subset events }.
//
// The 47-A assembly and loop-body helpers come from the shared driver
// (scripts/lib/simScenarioDriver.mjs, Phase-B stage 0) — the same module the CLI lane
// consumes. Any divergence is caught by the golden hash gate.

import { parentPort, workerData } from 'node:worker_threads';

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { snapshotSimState } from '../../src/core/simSnapshot.js';
import { createPresentationJournal, createPresentationJournalRecord, PRESENTATION_JOURNAL_KINDS } from '../../src/core/presentationJournal.js';
import { scenarioRuntime } from '../../src/systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../../src/systems/presentationAdapters.js';
import { actions } from '../../src/systems/actions.js';
import { flight } from '../../src/systems/flight.js';
import { weapons } from '../../src/systems/weapons.js';
import { physics } from '../../src/core/physics.js';
import { combat } from '../../src/systems/combat.js';
import { cargo } from '../../src/systems/cargo.js';
import { economy } from '../../src/systems/economy.js';
import { missions } from '../../src/systems/missions.js';
import { story } from '../../src/systems/story.js';
import { save } from '../../src/save/saveSystem.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../src/systems/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';
import { COMBAT_FLAGS, applyFeatureConfigToMaps } from '../../src/data/featureFlags.js';
import {
  makeEvidenceSpindleSpec,
  mark47aPlayerActor,
  spawn47aScenarioCast,
} from '../../src/data/scenarios/47aLiveScene.js';
import { resolveRuntimeManifest } from '../../src/runtime/resolveRuntimeManifest.js';
import { LEGACY47A_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import {
  collectJournalPresentationEntities,
  collectMeshPresentationEntities,
  entityIsJournaled,
  presentationCollectRadius,
  presentationGlassCorner,
  resolveWorldPresentationEntity,
} from '../../src/world/presentationSources.js';
import { farLedgerScanRadius, tableLookAtOrigin } from '../../src/render/tabletopPolicy.js';
import { createInputCommandHistory } from '../../src/core/inputCommandSnapshot.js';
import { digestIds } from './simReadModel.mjs';
import {
  finite,
  hashSnapshot,
  loadScenarioContract,
  preparePhysicsBackend,
  reloadThroughSave,
  update47aScenarioActorIntents,
} from './simScenarioDriver.mjs';
import { drainSimCommandEnvelopes } from './simCommandChannel.mjs';
import { projectBridgeEvent } from './simEventBridge.mjs';
import { insertAsteroidFieldRock } from '../../src/world/asteroidField.js';
import { insertFarActor, promoteFarActor } from '../../src/world/farActorTable.js';
import { dropDressingRow, insertDressingRow } from '../../src/world/dressingTable.js';



// ---------------------------------------------------------------------------
// Journal transport pack — the "byte-range" that crosses worker→main.
// Layout mirrors createPresentationJournalRecord: 17 f64 scalars + kind code +
// entityType string-table index. Structured clone of the three typed arrays is
// the measured transport; SAB columns are the Phase-B upgrade path.
// ---------------------------------------------------------------------------

const JOURNAL_SCALAR_STRIDE = 18;
const KIND_CODES = Object.freeze({
  [PRESENTATION_JOURNAL_KINDS.SPAWN]: 1,
  [PRESENTATION_JOURNAL_KINDS.DESTROY]: 2,
  [PRESENTATION_JOURNAL_KINDS.TRANSFORM]: 3,
  [PRESENTATION_JOURNAL_KINDS.VISUAL]: 4,
});
const KIND_NAMES = [null, 'spawn', 'destroy', 'transform', 'visual'];

function packJournalRange(journal, start, end, scratch) {
  const count = Math.max(0, end - start);
  const scalars = new Float64Array(count * JOURNAL_SCALAR_STRIDE);
  const kinds = new Uint8Array(count);
  const typeIndex = new Uint16Array(count);
  const typeTable = [];
  const typeIds = new Map();
  const spawnEntityIds = [];
  let i = 0;
  journal.visitRange(start, end, scratch, (record) => {
    const o = i * JOURNAL_SCALAR_STRIDE;
    scalars[o] = record.tick;
    scalars[o + 1] = record.sequence;
    scalars[o + 2] = record.entityId;
    scalars[o + 3] = record.generation;
    scalars[o + 4] = record.revision;
    scalars[o + 5] = record.x;
    scalars[o + 6] = record.y;
    scalars[o + 7] = record.z;
    scalars[o + 8] = record.prevX;
    scalars[o + 9] = record.prevY;
    scalars[o + 10] = record.prevZ;
    scalars[o + 11] = record.rot;
    scalars[o + 12] = record.bank;
    scalars[o + 13] = record.pitch;
    scalars[o + 14] = record.prevRot;
    scalars[o + 15] = record.prevBank;
    scalars[o + 16] = record.prevPitch;
    scalars[o + 17] = record.visualRevision;
    kinds[i] = KIND_CODES[record.kind] || 0;
    const typeKey = typeof record.entityType === 'string' ? record.entityType : '';
    let idx = typeIds.get(typeKey);
    if (idx === undefined) {
      idx = typeTable.length;
      typeTable.push(typeKey);
      typeIds.set(typeKey, idx);
    }
    typeIndex[i] = idx;
    if (record.kind === PRESENTATION_JOURNAL_KINDS.SPAWN) spawnEntityIds.push(record.entityId);
    i++;
  });
  return { count, scalars, kinds, typeIndex, typeTable, spawnEntityIds, start, end };
}

// Versioned entity-info projection — the read-model payload a main-side resolver
// consumes after applying a SPAWN. Flat scalars + strings only; versioned so the
// field set can grow without a protocol break.
function entityInfoBlock(state, entityId) {
  const e = resolveWorldPresentationEntity(state, entityId);
  if (!e) return null;
  const data = e.data && typeof e.data === 'object' ? e.data : {};
  const flags = e.flags && typeof e.flags === 'object' ? e.flags : {};
  const flatFlags = {};
  for (const key of Object.keys(flags).sort()) {
    const value = flags[key];
    if (value == null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      flatFlags[key] = value;
    }
  }
  const activity = e.activity && typeof e.activity === 'object' ? e.activity : {};
  return {
    v: 1,
    entityId,
    type: typeof e.type === 'string' ? e.type : null,
    alive: e.alive !== false,
    team: Number.isFinite(e.team) ? e.team : 0,
    factionId: typeof e.factionId === 'string' ? e.factionId : (typeof data.factionId === 'string' ? data.factionId : null),
    x: finite(e.pos && e.pos.x),
    z: finite(e.pos && e.pos.z),
    radius: finite(e.radius),
    callsign: typeof data.callsign === 'string' ? data.callsign : null,
    name: typeof data.name === 'string' ? data.name : null,
    trafficRole: typeof data.trafficRole === 'string' ? data.trafficRole : null,
    role: typeof data.role === 'string' ? data.role : (data.ai && typeof data.ai.role === 'string' ? data.ai.role : null),
    presentationTier: Number.isFinite(activity.presentationTier) ? activity.presentationTier : 0,
    sectorId: typeof e.sectorId === 'string' ? e.sectorId : (state.world && state.world.currentSectorId) || null,
    isPlayer: e.isPlayer === true,
    farResident: e.farResident === true,
    fieldResident: e.fieldResident === true,
    flags: flatFlags,
  };
}

// Deep-flat event bridge (stage 2). Payloads are projected through the shared
// bridge module: depth-bounded flat projection, live entities collapse to
// { entityRef } tokens, per-type adapters cover the non-entity live-object
// families. Unflattenable payloads are intentional drops, counted separately.
// ---------------------------------------------------------------------------
// Stage 3 — aux-row channel + collect probe.
//
// Ledger rows (far actors, field rocks, dressing rows) are not journaled
// entities; the read model needs their durable fields so its windowed collect
// reproduces appendNearbyLedgerRows' set. Every tick the worker walks the three
// tables and diffs a signature string per row against auxShipped — changed rows
// cross as flat upsert blocks, vanished ids as removals. Version counters do not
// cover every mutation (shelf sweeps write pos/lastExactT in place), so the diff
// compares field values, not table versions — total coverage, O(rows) per tick.
// ---------------------------------------------------------------------------

function auxRowBlock(kind, row) {
  const data = row && row.data && typeof row.data === 'object' ? row.data : {};
  return {
    v: 1,
    kind,
    id: row.id,
    type: typeof row.type === 'string' ? row.type : null,
    alive: row.alive !== false,
    x: finite(row.pos && row.pos.x),
    z: finite(row.pos && row.pos.z),
    vx: finite(row.vel && row.vel.x),
    vz: finite(row.vel && row.vel.z),
    rot: finite(row.rot),
    radius: finite(row.radius),
    lastExactT: Number.isFinite(row.lastExactT) ? row.lastExactT : null,
    liveEntityId: Number.isSafeInteger(row.liveEntityId) ? row.liveEntityId : null,
    noMesh: row._noMesh === true,
    sectorId: typeof row.sectorId === 'string' ? row.sectorId
      : (typeof row.homeSectorId === 'string' ? row.homeSectorId
        : (typeof data.sectorId === 'string' ? data.sectorId : null)),
  };
}

function auxSignature(b) {
  return `${b.type}|${b.alive ? 1 : 0}|${b.x}|${b.z}|${b.vx}|${b.vz}|${b.rot}|${b.radius}`
    + `|${b.lastExactT}|${b.liveEntityId}|${b.noMesh ? 1 : 0}|${b.sectorId}`;
}

function diffAuxTables(state) {
  const world = state && state.world;
  const shipped = host.auxShipped;
  const upserts = [];
  const removals = [];
  const seen = host.auxSeen || (host.auxSeen = new Set());
  seen.clear();
  const visit = (kind, rows) => {
    if (!Array.isArray(rows)) return;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Number.isSafeInteger(row.id)) continue;
      const block = auxRowBlock(kind, row);
      seen.add(block.id);
      const sig = `${kind}|${auxSignature(block)}`;
      if (shipped.get(block.id) !== sig) {
        shipped.set(block.id, sig);
        upserts.push(block);
      }
    }
  };
  visit('rock', world && world.asteroidField && world.asteroidField.rocks);
  visit('far', world && world.farActors && world.farActors.rows);
  visit('dressing', world && world.dressing && world.dressing.rows);
  for (const id of shipped.keys()) {
    if (!seen.has(id)) {
      shipped.delete(id);
      removals.push(id);
    }
  }
  return { upserts, removals };
}

const _collectOrigin = { x: 0, z: 0 };

// The live present-lane collect, run inside the worker: resolved inputs ship as
// collectProbe so the read-model twin answers the identical question.
function collectProbeBlock(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const live = collectMeshPresentationEntities(state);
  const liveIds = [];
  for (let i = 0; i < live.length; i++) {
    if (live[i] && live[i].id != null) liveIds.push(live[i].id);
  }
  const probe = {
    digest: digestIds(liveIds),
    count: liveIds.length,
    ids: liveIds.length <= 256 ? liveIds : null,
    hasPlayer: !!(player && player.pos),
  };
  if (player && player.pos) {
    const origin = tableLookAtOrigin(state, player.pos, _collectOrigin);
    probe.originX = origin.x;
    probe.originZ = origin.z;
    probe.collectRadius = presentationCollectRadius(state);
    probe.scanRadius = farLedgerScanRadius(state);
    probe.glassCorner = presentationGlassCorner(state);
    probe.simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
    probe.pvx = finite(player.vel && player.vel.x);
    probe.pvz = finite(player.vel && player.vel.z);
  }
  return probe;
}

const BRIDGE_EVENTS = [
  'entity:spawned', 'entity:killed', 'combat:fire', 'combat:damage', 'projectile:hit',
  'economy:tick', 'tether:attached', 'tether:reel', 'tether:broken',
  'presentation:cue', 'ship:thrust', 'ship:boostStart', 'ship:boostStop',
  'scenario:loaded', 'scenario:beatEntered', 'scenario:factsInitialized',
  'scenario:factChanged', 'scenario:branchResolved', 'game:started',
  'presentation:vfxCue', 'presentation:audioCue', 'presentation:uiCue',
  'presentation:cameraCue', 'presentation:caption', 'audio:cue', 'alert',
  'camera:shake', 'presentation:cueApplied', 'sector:enter', 'cargo:changed',
];


// ---------------------------------------------------------------------------
// Host assembly — mirrors run47a exactly (same order, same mutations).
// ---------------------------------------------------------------------------

const host = {
  ready: false,
  sim: null,
  state: null,
  bus: null,
  registry: null,
  journal: null,
  reloadAt: null,
  committedJournalSequence: 0,
  completedSequence: 0,
  tickCount: 0,
  // per-tick event drain (stage 2 deep-flat bridge)
  pendingEvents: [],
  droppedEventCount: 0,
  droppedEventTypes: {},
  unintentionalDrops: 0,
  unintentionalDropTypes: {},
  dropSamples: [],
  emittedEventCounts: {},
  unbridgeable: { depth: 0, typed: 0 },
  scratch: null,
  journalRebuildCount: 0,
  rebuildReasons: {},
  // stage-3 aux channel
  auxShipped: new Map(),
  auxSeen: new Set(),
  auxUpsertsTotal: 0,
  auxRemovalsTotal: 0,
  // stage-1 command channel: per-directive attribution + input tape recording
  lastInputSeq: 0,
  lastInputWallMs: 0,
  inputHistory: createInputCommandHistory(),
  commandDropped: 0,
  // timing
  totalWorkNs: 0n,
  totalPackNs: 0n,
};

function drainEvents() {
  const events = host.pendingEvents;
  host.pendingEvents = [];
  return events;
}

function rebuildJournalIfNeeded() {
  const journal = host.journal;
  if (!journal || !journal.needsRebuild()) return null;
  const reason = journal.getDiagnostics ? journal.getDiagnostics().rebuildReason : null;
  host.rebuildReasons[reason || 'unknown'] = (host.rebuildReasons[reason || 'unknown'] || 0) + 1;
  const entities = collectJournalPresentationEntities(host.state);
  const tick = Number.isSafeInteger(host.state.tick) && host.state.tick >= 0 ? host.state.tick : 0;
  if (journal.rebuildFrom(entities, tick) !== true) return { failed: true };
  const start = journal.getLastRebuildStart() || 0;
  const end = journal.getLastRebuildEnd() || start;
  host.committedJournalSequence = end;
  host.journalRebuildCount++;
  return { start, end, generation: journal.getRebuildGeneration() };
}

function makeCompletedTick(journalStart, journalEnd) {
  host.completedSequence++;
  const state = host.state;
  return {
    sequence: host.completedSequence,
    tick: Number.isSafeInteger(state.tick) ? state.tick : 0,
    simTime: Number.isFinite(state.simTime) ? state.simTime : 0,
    stateDigestMarker: Number.isSafeInteger(state.tick) ? state.tick : 0,
    inputSequence: host.completedSequence,
    inputCommandSeq: host.lastInputSeq,
    inputWallMs: host.lastInputWallMs,
    lifecycleGeneration: 0,
    journalStart,
    journalEnd,
  };
}

async function handleInit(msg) {
  applyFeatureConfigToMaps(LEGACY47A_FEATURES);
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: false });

  const seed = (Number(msg.seed) >>> 0) || 47;
  host.reloadAt = Number.isSafeInteger(msg.reloadAt) ? msg.reloadAt : null;
  const scenarioContract = loadScenarioContract(msg.scenarioContractPath || 'src/data/scenarios/47a.scenario.json');
  const journalCapacity = Number.isSafeInteger(msg.journalCapacity) && msg.journalCapacity > 0
    ? msg.journalCapacity
    : undefined;
  const journal = createPresentationJournal(journalCapacity, { isEntityJournaled: entityIsJournaled });
  host.journal = journal;
  host.scratch = createPresentationJournalRecord(); // visitRange copies each record into this

  // Spike instrumentation: name entities whose records hit identity errors
  // (spawn suppressed during a pending rebuild, transform without spawn
  // metadata) — this tells us WHO creates the rebuild churn.
  host.suppressedSpawns = [];
  host.identityOffenders = [];
  const origSpawn = journal.recordSpawn.bind(journal);
  const origTransformIfChanged = journal.recordTransformIfChanged.bind(journal);
  journal.recordSpawn = (tick, entity) => {
    const seq = origSpawn(tick, entity);
    if (seq === 0 && journal.needsRebuild() && host.suppressedSpawns.length < 40) {
      host.suppressedSpawns.push({ tick, id: entity && entity.id, type: entity && entity.type });
    }
    return seq;
  };
  journal.recordTransformIfChanged = (tick, entity) => {
    const before = journal.getDiagnostics().identityErrorCount;
    const seq = origTransformIfChanged(tick, entity);
    const diag = journal.getDiagnostics();
    if (diag.identityErrorCount > before && host.identityOffenders.length < 40) {
      const state = host.state;
      const inList = !!(state && state.entityList && state.entityList.some((x) => x && x.id === (entity && entity.id)));
      const inMap = !!(state && state.entities && state.entities.get(entity && entity.id));
      host.identityOffenders.push({
        tick, id: entity && entity.id, type: entity && entity.type,
        reason: diag.rebuildReason, inList, inMap: !!inMap,
        alive: entity && entity.alive,
      });
    }
    return seq;
  };

  const systems = [
    scenarioRuntime, presentationOrchestrator, presentationAdapters, actions,
    flight, weapons, physics, combat, cargo, economy, missions, story, save,
  ];
  const runtimeManifest = resolveRuntimeManifest({
    profileId: 'legacy47a',
    explicitSystems: systems,
    tacticalAI: false,
    exclusions: [
      'production-manifest-claim',
      'full-production-system-set',
      'massline-family',
      'travel-family',
    ],
  });

  const sim = createSimulation({
    seed,
    helpers: {
      scenarioContract: scenarioContract.document,
      scenarioContractPath: scenarioContract.path,
      scenarioContractHash: scenarioContract.sha256,
    },
    systems,
    runtimeManifest,
    runtimeConfig: {
      profileId: 'legacy47a',
      features: runtimeManifest.features,
      evidenceClass: runtimeManifest.evidenceClass,
      exclusions: runtimeManifest.exclusions,
    },
    presentationJournal: journal,
  });
  host.sim = sim;
  const { state, bus, registry } = sim;
  host.state = state;
  host.bus = bus;
  host.registry = registry;

  for (const type of BRIDGE_EVENTS) {
    bus.on(type, (payload) => {
      const projected = projectBridgeEvent(type, payload);
      host.emittedEventCounts[type] = (host.emittedEventCounts[type] || 0) + 1;
      if (projected.dropped) {
        host.droppedEventCount++;
        host.droppedEventTypes[type] = (host.droppedEventTypes[type] || 0) + 1;
        if (host.dropSamples.length < 20) {
          host.dropSamples.push({
            t: type, reason: projected.reason,
            path: projected.hits && projected.hits.path,
            ctor: projected.hits && projected.hits.ctor,
          });
        }
        if (projected.unintentional) {
          host.unintentionalDrops++;
          host.unintentionalDropTypes[type] = (host.unintentionalDropTypes[type] || 0) + 1;
        }
        if (projected.hits) {
          host.unbridgeable.depth += projected.hits.depth;
          host.unbridgeable.typed += projected.hits.typed;
        }
        return;
      }
      host.pendingEvents.push({ t: type, p: projected.flat, lane: projected.lane });
    });
  }

  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'legacy';
  state.settings.gameplay.flightBackend = 'legacy';
  state.settings.gameplay.runtimeProfile = 'legacy47a';

  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 5000;

  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  mark47aPlayerActor(player);

  const spindle = sim.spawn(makeEvidenceSpindleSpec({ pos: { x: 92, z: 0 }, rot: 0 }));
  spindle.data = Object.assign({}, spindle.data, {
    scenarioActorId: 'evidence_spindle_47a',
    scenarioRole: 'tether_payload',
    assetRef: 'asset.slice.47a_spindle',
  });

  const target = sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reavers',
    pos: { x: 620, z: -18 },
    rot: Math.PI,
    ai: { role: 'target_dummy' },
  }));
  target.radius = Math.max(target.radius || 0, 44);
  target.flags = Object.assign({}, target.flags, { persistent: true });

  spawn47aScenarioCast(sim);

  const econ = registry.get('economy');
  if (econ && typeof econ.newGame === 'function') econ.newGame();
  bus.emit('game:started', { source: 'sf-sim', scenario: '47a' });
  await preparePhysicsBackend(registry, state, 'rapier-dynamic');

  const initRebuild = rebuildJournalIfNeeded();
  if (initRebuild && !initRebuild.failed && initRebuild.end > initRebuild.start) {
    initRebuild.pack = packJournalRange(journal, initRebuild.start, initRebuild.end, host.scratch);
    initRebuild.spawnInfos = [];
    for (const entityId of initRebuild.pack.spawnEntityIds) {
      const info = entityInfoBlock(state, entityId);
      if (info) initRebuild.spawnInfos.push(info);
    }
  }
  host.committedJournalSequence = journal.getWriteSequence();
  const initAux = diffAuxTables(state);
  const initCollectProbe = collectProbeBlock(state);
  host.ready = true;
  return {
    journalSequence: host.committedJournalSequence,
    initRebuild,
    auxUpserts: initAux.upserts,
    auxRemovals: initAux.removals,
    collectProbe: initCollectProbe,
    scenarioContractSha256: scenarioContract.sha256,
  };
}

async function handleTick(msg) {
  const { state, sim, journal, scratch } = host;
  const workStart = process.hrtime.bigint();
  const arrivalNs = process.hrtime.bigint();

  // Command drain + input application happen per directive even when steps === 0 —
  // the runner-level gate (timeScale<=0 skips advanceFixedTimestep) must not strand
  // unpause/load commands addressed to a non-ticking worker. Stage 1: every
  // directive-side mutation arrives as a typed {input|bus|settings|rpc} envelope
  // folded in wire order through the shared channel.
  const drain = drainSimCommandEnvelopes(msg.commands || [], {
    state,
    helpers: sim.helpers,
  });
  host.lastInputSeq = drain.inputSeq || 0;
  host.lastInputWallMs = drain.inputWallMs || 0;
  host.commandDropped += drain.dropped;
  for (const env of msg.commands || []) {
    if (env && env.t === 'input' && env.p && env.p.input) {
      host.inputHistory.record(state.tick, env.p.input, { sequence: env.seq });
    }
  }
  const steps = Number.isSafeInteger(msg.steps) ? Math.max(0, msg.steps) : 1;

  // Present-side ack: main consumed up to ackJournalEnd → free the ring slots.
  if (Number.isSafeInteger(msg.ackJournalEnd) && msg.ackJournalEnd > 0) {
    journal.discardThrough(msg.ackJournalEnd);
  }

  let completedTick = null;
  let journalStart = host.committedJournalSequence;
  for (let s = 0; s < steps; s++) {
    update47aScenarioActorIntents(state);
    sim.step(SIM_DT);
    if (host.reloadAt != null && state.tick === host.reloadAt) {
      await reloadThroughSave(registryRef(), state, null, host.reloadAt, {
        physicsBackend: 'rapier-dynamic',
        flightBackend: 'legacy',
      });
    }
  }
  // Churn probe (gate-c overflow exercise): spawn/destroy journaled entities to
  // drive non-coalescible append churn beyond ring capacity.
  // Aux-row probe (stage 3 gate exercise): scripted live→shelve→promote
  // lifecycle + rock mutation + dressing drop, driven by --probe aux. Mutates
  // sim state so gate-A hash parity is not expected under this probe — the
  // collect-set parity gate is what it exists to exercise.
  if (msg.aux) {
    const t = msg.tick;
    if (t === 60 && !host.auxProbeShip) {
      host.auxProbeShip = sim.spawn(makeShipEntitySpec('ship_wasp', {
        team: 1,
        factionId: 'faction_reavers',
        pos: { x: 1500, z: 1500 },
        rot: 0,
      }));
      host.auxProbeRock = insertAsteroidFieldRock(state, {
        pos: { x: 120, z: 120 }, vel: { x: -0.5, z: -0.2 }, radius: 8,
      });
      host.auxProbeDressing = insertDressingRow(state, {
        type: 'fx', pos: { x: 40, z: -40 }, radius: 10,
      });
    } else if (t === 120 && host.auxProbeShip) {
      // Shelve: snapshot into the far ledger, then remove the live entity —
      // the journal destroy and the aux upsert race to the same tick reply.
      insertFarActor(state, host.auxProbeShip, state.simTime, sim.helpers);
      sim.helpers.removeEntity(host.auxProbeShip.id, { immediate: true });
      host.auxProbeFarId = host.auxProbeShip.id;
      host.auxProbeShip = null;
    } else if (t === 300 && host.auxProbeRock) {
      // In-place durable-field write (no version bump guaranteed) — the
      // signature diff must still ship the upsert.
      host.auxProbeRock.pos.x += 400;
      host.auxProbeRock.pos.z += 150;
    } else if (t === 400 && host.auxProbeFarId != null) {
      // Promote back: row gains liveEntityId (or leaves the table), the live
      // entity re-enters through the journal.
      promoteFarActor(state, host.auxProbeFarId, sim.helpers);
      host.auxProbeFarId = null;
    } else if (t === 500 && host.auxProbeDressing) {
      dropDressingRow(state, host.auxProbeDressing.id);
      host.auxProbeDressing = null;
    }
  }
  if (msg.churn && Number.isSafeInteger(msg.churn.spawn) && msg.churn.spawn > 0) {
    if (!host.churnEntities) host.churnEntities = [];
    for (const prev of host.churnEntities) {
      if (prev && prev.alive !== false) sim.helpers.removeEntity(prev.id, { immediate: true });
    }
    host.churnEntities = [];
    for (let i = 0; i < msg.churn.spawn; i++) {
      host.churnEntities.push(sim.spawn(makeShipEntitySpec('ship_wasp', {
        team: 1,
        factionId: 'faction_reavers',
        pos: { x: -2000 - i * 40, z: -2000 },
        rot: 0,
      })));
    }
  }
  let journalEnd = journal.getWriteSequence();
  let fullRebuild = null;
  if (journal.needsRebuild()) {
    const rebuild = rebuildJournalIfNeeded();
    if (rebuild && !rebuild.failed) {
      // Production parity: a mid-tick rebuild replaces the tick range with the
      // rebuild's spawn set (presentationRunner.rebuildJournalIfNeeded).
      fullRebuild = rebuild;
      journalStart = rebuild.start;
      journalEnd = rebuild.end;
    }
  }
  if (steps > 0) {
    completedTick = makeCompletedTick(journalStart, journalEnd);
  }
  // Committed = last journal sequence shipped on the wire; next tick's range
  // starts there. Present-side acks (discardThrough) lag behind this cursor.
  host.committedJournalSequence = journalEnd;

  const workNs = process.hrtime.bigint() - workStart;
  host.totalWorkNs += workNs;
  host.tickCount += steps;

  const packStart = process.hrtime.bigint();
  let pack;
  try {
    pack = journalStart < journalEnd
      ? packJournalRange(journal, journalStart, journalEnd, scratch)
      : { count: 0, scalars: new Float64Array(0), kinds: new Uint8Array(0), typeIndex: new Uint16Array(0), typeTable: [], spawnEntityIds: [], start: journalStart, end: journalEnd };
  } catch (error) {
    const diag = journal.getDiagnostics ? journal.getDiagnostics() : {};
    throw new Error(`journal pack failed for (${journalStart}, ${journalEnd}] tick=${msg.tick}: ${error.message} ` +
      `| oldest=${diag.oldestSequence} pending=${diag.pending} writeSeq=${diag.writeSequence} ` +
      `rebuilds=${diag.rebuildCount} lastRebuild=(${diag.lastRebuildStart},${diag.lastRebuildEnd}] ` +
      `discards=${diag.discardCount} committed=${host.committedJournalSequence}`);
  }
  const spawnInfos = [];
  for (const entityId of pack.spawnEntityIds) {
    const info = entityInfoBlock(state, entityId);
    if (info) spawnInfos.push(info);
  }
  const packNs = process.hrtime.bigint() - packStart;
  host.totalPackNs += packNs;

  const events = drainEvents();
  const aux = diffAuxTables(state);
  host.auxUpsertsTotal += aux.upserts.length;
  host.auxRemovalsTotal += aux.removals.length;
  return {
    tick: msg.tick,
    arrivalNs,
    completedTick,
    auxUpserts: aux.upserts,
    auxRemovals: aux.removals,
    collectProbe: completedTick ? collectProbeBlock(state) : null,
    journalStart,
    journalEnd,
    journalFullRebuild: fullRebuild !== null,
    journalRebuildGeneration: fullRebuild ? fullRebuild.generation : 0,
    journalValid: !journal.needsRebuild(),
    pack,
    spawnInfos,
    events,
    rpcAcks: drain.rpcAcks,
    settingsAcks: drain.settingsAcks,
    workMs: Number(workNs) / 1e6,
    packMs: Number(packNs) / 1e6,
    sendNs: 0, // stamped just before postMessage by the dispatcher
    stateTick: state.tick,
    simTime: state.simTime,
  };
}

function registryRef() {
  return host.registry;
}

async function handleFinalize() {
  const { state, journal } = host;
  const snapshot = snapshotSimState(state);
  const sha256 = hashSnapshot(snapshot);
  const journalDiag = journal && typeof journal.getDiagnostics === 'function'
    ? journal.getDiagnostics()
    : null;
  const mem = process.memoryUsage();
  return {
    sha256,
    stateTick: state.tick,
    entityCount: state.entityList.length,
    journalDiag,
    journalRebuildCount: host.journalRebuildCount,
    rebuildReasons: host.rebuildReasons,
    suppressedSpawns: host.suppressedSpawns,
    identityOffenders: host.identityOffenders,
    droppedEventCount: host.droppedEventCount,
    droppedEventTypes: host.droppedEventTypes,
    unintentionalDrops: host.unintentionalDrops,
    unintentionalDropTypes: host.unintentionalDropTypes,
    dropSamples: host.dropSamples,
    emittedEventCounts: host.emittedEventCounts,
    unbridgeable: host.unbridgeable,
    commandDropped: host.commandDropped,
    inputTape: host.inputHistory ? host.inputHistory.toTape() : null,
    tickCount: host.tickCount,
    auxRowsShipped: host.auxShipped.size,
    auxUpsertsTotal: host.auxUpsertsTotal,
    auxRemovalsTotal: host.auxRemovalsTotal,
    avgWorkMs: host.tickCount > 0 ? Number(host.totalWorkNs) / 1e6 / host.tickCount : 0,
    avgPackMs: host.tickCount > 0 ? Number(host.totalPackNs) / 1e6 / host.tickCount : 0,
    workerRssBytes: mem.rss,
    workerHeapUsedBytes: mem.heapUsed,
  };
}

// Serialize every directive — a reload await inside tick N must finish before
// tick N+1 applies input against the reloaded state.
let chain = Promise.resolve();
parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  chain = chain.then(async () => {
    try {
      if (msg.kind === 'init') {
        const result = await handleInit(msg);
        parentPort.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      } else if (msg.kind === 'tick') {
        const reply = await handleTick(msg);
        reply.kind = 'tickDone';
        reply.seq = msg.seq;
        reply.sendNs = Number(process.hrtime.bigint());
        const transfers = [];
        if (reply.pack.scalars.byteLength) transfers.push(reply.pack.scalars.buffer);
        if (reply.pack.kinds.byteLength) transfers.push(reply.pack.kinds.buffer);
        if (reply.pack.typeIndex.byteLength) transfers.push(reply.pack.typeIndex.buffer);
        parentPort.postMessage(reply, transfers);
      } else if (msg.kind === 'finalize') {
        const result = await handleFinalize();
        parentPort.postMessage({ kind: 'done', seq: msg.seq, ...result });
      } else if (msg.kind === 'shutdown') {
        try { host.sim && host.sim.dispose(); } catch (_) { /* spike teardown */ }
        parentPort.postMessage({ kind: 'bye', seq: msg.seq });
      }
    } catch (error) {
      parentPort.postMessage({
        kind: 'error',
        seq: msg && msg.seq,
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? String(error.stack) : null,
      });
    }
  });
});

parentPort.postMessage({ kind: 'boot', workerDataPresent: workerData != null });
