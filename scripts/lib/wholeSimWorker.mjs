// S1 Phase-A spike — worker-side host for whole-sim-in-worker.
//
// Runs the FULL 47-A golden composition (createSimulation + the legacy47a explicit system set)
// inside a real worker_threads worker. The runner/cadence stays on the main thread: each
// 'tick' directive carries { input, commands, steps } exactly as the runner would drain them;
// the worker applies input + tape commands + scenario intents, then registry.step once per
// directive step. Replies carry { completedTick, journal byte-range pack, spawn info blocks,
// flat-subset events }.
//
// SPIKE DUPLICATION: the 47-A assembly and loop-body helpers below are replicated from
// scripts/sf-sim-cli.mjs (which self-executes on import and cannot be shared). Phase-B should
// extract a scripts/lib/sim47aShared.mjs consumed by both. Any divergence is caught by the
// golden hash gate.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { canonicalStringify, snapshotSimState } from '../../src/core/simSnapshot.js';
import { createPresentationJournal, createPresentationJournalRecord, PRESENTATION_JOURNAL_KINDS } from '../../src/core/presentationJournal.js';
import { validateScenarioDocument, formatScenarioIssue } from '../../src/contracts/scenarioSchemas.js';
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
import { collectJournalPresentationEntities, resolveWorldPresentationEntity } from '../../src/world/presentationSources.js';
import { projectileSkipsVisualFactoryMesh } from '../../src/render/weapons/recipes.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// Replicated sf-sim-cli helpers (verbatim semantics — hash is the arbiter).
// ---------------------------------------------------------------------------

const HANDOFF_STAND_OFF_TUG = { x: 815, z: 95, rot: -0.35 };
const HANDOFF_ZONE_BEACON = { x: 780, z: 320 };

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function loadScenarioContract(rel) {
  const path = normalizePath(rel);
  const document = readJson(rel);
  const report = validateScenarioDocument(document, { file: path });
  assert(report.ok, `scenario contract invalid:\n${report.issues.map(formatScenarioIssue).join('\n')}`);
  return {
    path,
    document,
    sha256: createHash('sha256').update(canonicalStringify(document)).digest('hex'),
  };
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

async function preparePhysicsBackend(registry, state, physicsBackend, options = {}) {
  if (physicsBackend !== 'rapier-dynamic') return;
  const physicsSys = registry.get('physics');
  assert(physicsSys, '47-A dynamic replay requires the physics system');
  assert.equal(typeof physicsSys.prepareBackend, 'function',
    '47-A dynamic replay requires physics.prepareBackend');
  const ready = await physicsSys.prepareBackend(state, options);
  assert.equal(ready, true, '47-A dynamic replay requires SG-02 dynamic authority to be ready before ticking');
  assert.equal(state.physicsRuntime && state.physicsRuntime.diagnostics && state.physicsRuntime.diagnostics.sg02Ready,
    true,
    '47-A dynamic replay should publish ready SG-02 diagnostics before ticking');
}

async function reloadThroughSave(registry, state, reloadAt, options = {}) {
  const saveSys = registry.get('save');
  assert(saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function',
    '47-A reload check requires the real save system');
  const persistentBefore = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  const envelope = saveSys.serialize('sf-sim-reload');
  assert.equal(saveSys.loadEnvelope(envelope, 'sf-sim-reload'), true, '47-A reload check should load its own envelope');
  state.settings.gameplay.flightBackend = options.flightBackend === 'v3' ? 'v3' : 'legacy';
  const persistentAfter = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  assert.equal(state.tick, reloadAt, '47-A reload should preserve sim tick');
  assert.equal(persistentAfter, persistentBefore, '47-A reload should preserve persistent live actors');
  await preparePhysicsBackend(registry, state, options.physicsBackend || 'rapier-dynamic', { reset: true });
}

function applyInput(state, input) {
  const aimAngle = finite(input.aimAngle, state.input.aimAngle || 0);
  const player = state.entities.get(state.playerId);
  const origin = player ? player.pos : { x: 0, z: 0 };
  Object.assign(state.input, {
    moveX: finite(input.moveX, 0),
    moveZ: finite(input.moveZ, 0),
    turnIntent: finite(input.turnIntent, input.moveX || 0),
    boost: !!input.boost,
    fire: !!input.fire,
    fireGroup: input.fireGroup == null ? null : input.fireGroup,
    aimAngle,
    aimWorld: {
      x: origin.x + Math.cos(aimAngle) * 1000,
      z: origin.z + Math.sin(aimAngle) * 1000,
    },
  });
}

function resolveScenarioEntity(state, ref) {
  if (ref == null) return null;
  if (Number.isSafeInteger(ref)) return state.entities.get(ref) || null;
  const id = String(ref);
  if (id === 'player' || id === 'player_kestrel') return state.entities.get(state.playerId) || null;
  const binding = state.scenario && state.scenario.actorBindings && state.scenario.actorBindings[id];
  if (binding && binding.status === 'bound') return state.entities.get(binding.entityId) || null;
  return (state.entityList || []).find((entity) => {
    const data = entity && entity.data || {};
    return data.scenarioActorId === id || data.scenarioRole === id || data.assetRef === id || data.defId === id;
  }) || null;
}

function resolveAttachmentRef(state, ref, ownerId) {
  const id = String(ref);
  if (id !== 'latestOwned') return id;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  const latest = Object.values(attachments)
    .filter((attachment) => attachment && attachment.state === 'active' && attachment.ownerId === ownerId)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  assert(latest, `golden tape attachment ref did not resolve: ${ref}`);
  return latest.id;
}

function applyTapeCommands(state, helpers, commands) {
  if (!Array.isArray(commands) || commands.length === 0) return;
  for (const command of commands) {
    if (!command) continue;
    if (command.kind === 'scenarioBranch') {
      assert(helpers && typeof helpers.applyScenarioBranch === 'function',
        'golden tape scenarioBranch commands require the SG-05 applyScenarioBranch helper');
      const result = helpers.applyScenarioBranch(command.branchId, {
        source: command.source || 'golden-tape',
      });
      assert(result && result.ok, `golden tape scenarioBranch rejected: ${command.branchId} (${result && result.reason || 'unknown'})`);
      continue;
    }
    if (command.kind !== 'combatAction') continue;
    assert(helpers && typeof helpers.requestCombatAction === 'function',
      'golden tape combatAction commands require the SG-03 requestCombatAction helper');
    const actor = resolveScenarioEntity(state, command.actor);
    assert(actor, `golden tape command actor did not resolve: ${command.actor}`);
    const request = {
      actorId: actor.id,
      actionId: command.actionId,
      source: { kind: command.source || 'player', controllerId: 'golden-tape' },
    };
    if (command.target != null) {
      const target = resolveScenarioEntity(state, command.target);
      assert(target, `golden tape command target did not resolve: ${command.target}`);
      request.targetId = target.id;
    }
    if (command.attachment != null) {
      request.attachmentId = resolveAttachmentRef(state, command.attachment, actor.id);
    }
    const result = helpers.requestCombatAction(request);
    assert(result && result.ok, `golden tape combatAction rejected: ${command.actionId} (${result && result.reason || 'unknown'})`);
  }
}

function placeEntity(entity, x, z, rot) {
  if (!entity) return;
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  entity.rot = rot;
  entity.angVel = 0;
  if (entity.vel) {
    entity.vel.x = 0;
    entity.vel.z = 0;
  }
}

function set47aTacticalActive(entity, active) {
  if (!entity || !entity.data || !entity.data.ai) return;
  entity.data.ai.passive = !active;
}

function stage47aHandoffActors(state, recoveryTug, simTime, activeBeat) {
  if (!(simTime >= 270 || activeBeat === 'recovery_tug' || activeBeat === 'resolution_branch')) return;
  if (recoveryTug && recoveryTug.alive !== false
      && Math.hypot(recoveryTug.pos.x - HANDOFF_STAND_OFF_TUG.x,
        recoveryTug.pos.z - HANDOFF_STAND_OFF_TUG.z) > 0.01) {
    placeEntity(recoveryTug, HANDOFF_STAND_OFF_TUG.x, HANDOFF_STAND_OFF_TUG.z, HANDOFF_STAND_OFF_TUG.rot);
    recoveryTug.flags = Object.assign({}, recoveryTug.flags, { noInterp: true });
    recoveryTug.physicsSleeping = false;
  }
  const beacon = resolveScenarioEntity(state, 'kessler_handoff_beacon');
  if (beacon && Math.hypot(beacon.pos.x - HANDOFF_ZONE_BEACON.x, beacon.pos.z - HANDOFF_ZONE_BEACON.z) > 0.01) {
    placeEntity(beacon, HANDOFF_ZONE_BEACON.x, HANDOFF_ZONE_BEACON.z, beacon.rot || 0);
  }
}

function update47aScenarioActorIntents(state) {
  const player = state.entities.get(state.playerId);
  const scenario = state.scenario && state.scenario.active;
  if (!player || !scenario) return;
  const interceptor = resolveScenarioEntity(state, 'scavenger_interceptor');
  const harasser = resolveScenarioEntity(state, 'scavenger_harasser');
  const thief = resolveScenarioEntity(state, 'scavenger_thief');
  const recoveryTug = resolveScenarioEntity(state, 'official_recovery_tug');
  const activeBeat = scenario.activeBeatId;
  const simTime = state.simTime || 0;
  set47aTacticalActive(interceptor, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(harasser, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(thief, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(recoveryTug, simTime >= 270 || activeBeat === 'recovery_tug');
  stage47aHandoffActors(state, recoveryTug, simTime, activeBeat);
  if (!harasser || !harasser.alive) return;
  const shouldFire = (simTime >= 75 && simTime <= 76.25) || (activeBeat === 'scavenger_arrival' && simTime <= 76.25);
  harasser.data.intent = shouldFire
    ? {
        fire: true,
        aimAngle: Math.atan2(player.pos.z - harasser.pos.z, player.pos.x - harasser.pos.x),
      }
    : null;
}

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

// Flat-payload event bridge. Payloads that carry live objects (entities, sector
// nodes, cargo refs) are dropped and counted — the known ~10-30 sim→main
// live-object family. Ids ride; resolution is a main-side read-model concern.
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

function flatPayload(value, depth = 0) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean') return value;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const flat = flatPayload(item, depth + 1);
      if (flat === undefined) return undefined;
      out.push(flat);
    }
    return out;
  }
  if (t === 'object') {
    // Live-sim-object shape: an entity/row carries id+pos/alive — never cloneable-safe.
    if ('pos' in value || 'vel' in value || 'alive' in value) return undefined;
    const out = {};
    for (const key of Object.keys(value)) {
      const flat = flatPayload(value[key], depth + 1);
      if (flat === undefined) return undefined;
      out[key] = flat;
    }
    return out;
  }
  return undefined;
}

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
  // per-tick event drain
  pendingEvents: [],
  droppedEventCount: 0,
  droppedEventTypes: {},
  scratch: null,
  journalRebuildCount: 0,
  rebuildReasons: {},
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
    inputCommandSeq: 0,
    inputWallMs: 0,
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
  // Writer-side eligibility mirrors pushAlive()'s mesh test in presentationSources.js:
  // entities the rebuild collect can never republish are never journaled. Without
  // this, a spawn suppressed during a pending rebuild (save restore at tick 600)
  // leaves the entity unspawned forever → transform-without-spawn → rebuild storm.
  const isEntityJournaled = (e) => !!(e && e._noMesh !== true
    && !(e.type === 'projectile' && projectileSkipsVisualFactoryMesh(e)));
  const journal = createPresentationJournal(journalCapacity, { isEntityJournaled });
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
      const flat = flatPayload(payload);
      if (flat === undefined || flat === null && payload !== null && payload !== undefined) {
        host.droppedEventCount++;
        host.droppedEventTypes[type] = (host.droppedEventTypes[type] || 0) + 1;
        return;
      }
      host.pendingEvents.push({ t: type, p: flat === undefined ? null : flat });
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
  host.ready = true;
  return {
    journalSequence: host.committedJournalSequence,
    initRebuild,
    scenarioContractSha256: scenarioContract.sha256,
  };
}

async function handleTick(msg) {
  const { state, sim, journal, scratch } = host;
  const workStart = process.hrtime.bigint();
  const arrivalNs = process.hrtime.bigint();

  // Command drain + input application happen per directive even when steps === 0 —
  // the runner-level gate (timeScale<=0 skips advanceFixedTimestep) must not strand
  // unpause/load commands addressed to a non-ticking worker.
  applyTapeCommands(state, sim.helpers, msg.commands || []);
  if (msg.input) applyInput(state, msg.input);
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
      await reloadThroughSave(registryRef(), state, host.reloadAt, {
        physicsBackend: 'rapier-dynamic',
        flightBackend: 'legacy',
      });
    }
  }
  // Churn probe (gate-c overflow exercise): spawn/destroy journaled entities to
  // drive non-coalescible append churn beyond ring capacity.
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
  return {
    tick: msg.tick,
    arrivalNs,
    completedTick,
    journalStart,
    journalEnd,
    journalFullRebuild: fullRebuild !== null,
    journalRebuildGeneration: fullRebuild ? fullRebuild.generation : 0,
    journalValid: !journal.needsRebuild(),
    pack,
    spawnInfos,
    events,
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
    tickCount: host.tickCount,
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
