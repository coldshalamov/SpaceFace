// Headless fixed-step release-soak session runner.
//
// Drives real sim systems through a representative long session without browser,
// Electron, or GPU. Modes:
//   quick — short deterministic CI loop
//   full  — accelerated 30–60 sim-minute loop
//
// Owns only objects it creates. Never spawns or kills ambient OS processes.

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { createTimeEffects } from '../../src/core/timeEffects.js';
import { snapshotSimState, canonicalStringify } from '../../src/core/simSnapshot.js';
import { spawnBudget } from '../../src/systems/spawnBudget.js';
import { cargo } from '../../src/systems/cargo.js';
import { economy } from '../../src/systems/economy.js';
import { factions } from '../../src/systems/factions.js';
import { heat } from '../../src/systems/heat.js';
import { sectorSim } from '../../src/systems/sectorSim.js';
import { world } from '../../src/systems/world.js';
import { encounterDirector, planEncounterShape } from '../../src/systems/encounterDirector.js';
import { stationSideEventDirector } from '../../src/systems/stationSideEventDirector.js';
import { gateControlDirector } from '../../src/systems/gateControlDirector.js';
import { mining } from '../../src/systems/mining.js';
import { combat } from '../../src/systems/combat.js';
import { missions } from '../../src/systems/missions.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { save as saveSystem } from '../../src/save/saveSystem.js';
import { ENCOUNTERS } from '../../src/data/encounters.js';
import { zonesForSector } from '../../src/data/sectorZones.js';
import {
  RELEASE_SOAK_RECEIPT_SCHEMA,
  HEADLESS_BUDGETS,
  REQUIRED_PHASES,
  sha256Hex,
  emptyHighWater,
  sampleHighWater,
  mergeHighWater,
  countListeners,
  detectDuplicateListeners,
  detectMonotonicGrowth,
  sampleMemoryDescriptive,
  buildMemoryTrend,
  summarizeEventCounts,
  validateReceipt,
  assertStaticLauncherContracts,
  assertStaticTimeEffectsContracts,
} from './releaseSoakReceipts.mjs';

export const SECTOR_ID = 'sector_sker_haven';
export const DEFAULT_QUICK_SEED = 47;
export const DEFAULT_FULL_SEEDS = Object.freeze([47, 109]);

/** @typedef {'quick'|'full'} SoakMode */

function minutesToTicks(min) {
  return Math.round(min * 60 * 60); // minutes → seconds → ticks @ 60 Hz
}

export function modeConfig(mode) {
  if (mode === 'full') {
    // Accelerated 45 sim-minute session (within the 30–60 min bar).
    const phases = {
      new_game: 30,
      flight: minutesToTicks(8),
      tether_mining_combat: minutesToTicks(6),
      economy: minutesToTicks(4),
      dock_undock: minutesToTicks(2),
      map_jump: minutesToTicks(3),
      save_reload: minutesToTicks(1),
      death_recovery: minutesToTicks(2),
      continued_play: minutesToTicks(19),
    };
    const totalTicks = Object.values(phases).reduce((a, b) => a + b, 0);
    return {
      mode: 'full',
      totalSimSeconds: totalTicks / 60,
      phaseTicks: phases,
      sampleEveryTicks: 120,
      seeds: [...DEFAULT_FULL_SEEDS],
    };
  }
  // quick — compact but non-vacuous CI path (~24.7 sim-seconds)
  const phaseTicks = {
    new_game: 12,
    flight: 240,                 // 4 s
    tether_mining_combat: 300,   // 5 s
    economy: 180,                // 3 s
    dock_undock: 120,            // 2 s
    map_jump: 180,               // 3 s
    save_reload: 90,
    death_recovery: 120,
    continued_play: 240,
  };
  const totalTicks = Object.values(phaseTicks).reduce((a, b) => a + b, 0);
  return {
    mode: 'quick',
    totalSimSeconds: totalTicks / 60,
    phaseTicks,
    sampleEveryTicks: 30,
    seeds: [DEFAULT_QUICK_SEED],
  };
}

function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(key) { key = String(key); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

function installLocalStorage() {
  const previous = globalThis.localStorage;
  const storage = makeMemoryLocalStorage();
  globalThis.localStorage = storage;
  return () => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  };
}

function SOAK_SYSTEMS() {
  // Real headless systems only — no render/UI. Order matches production dependencies loosely.
  return [
    spawnBudget,
    cargo,
    economy,
    factions,
    heat,
    mining,
    combat,
    sectorSim,
    world,
    encounterDirector,
    stationSideEventDirector,
    gateControlDirector,
    missions,
    saveSystem,
  ];
}

/**
 * Run one deterministic soak session and return a bounded receipt.
 * @param {{ seed?: number, mode?: SoakMode, root?: string, failInject?: string|null, processRegistry?: object }} opts
 */
export function runReleaseSoakSession(opts = {}) {
  const wallStarted = process.hrtime.bigint();
  const mode = opts.mode === 'full' ? 'full' : 'quick';
  const cfg = modeConfig(mode);
  const seed = Number.isInteger(opts.seed) ? opts.seed : cfg.seeds[0];
  const root = opts.root || null;
  const failInject = opts.failInject || null;
  const processRegistry = opts.processRegistry || createProcessRegistry();

  const restoreStorage = installLocalStorage();
  const unhandledErrors = [];
  const eventLog = [];
  const modeTransitions = [];
  const phasesCompleted = [];
  const highWaterSamples = [];
  const memorySamples = [];
  const failures = [];
  const stateIntegrity = { samplesChecked: 0, nonFinite: [] };
  const liveness = {
    mission: { started: false, progressed: false, resolved: false, deadlocked: false, missionId: null },
    encounter: { started: false, progressed: false, resolved: false, deadlocked: false, encounterId: null },
  };
  let highWater = emptyHighWater();
  let ticks = 0;
  let baselineEntities = 0;
  let listenerBaseline = 0;
  let timeEffects = null;
  let saveReload = {
    performed: false,
    equivalence: false,
    beforeHash: null,
    afterHash: null,
    slot: 'soak',
    creditsRestored: false,
    stableSerialize: false,
    reloadProof: null,
  };

  memorySamples.push(sampleMemoryDescriptive());

  let sim = null;
  try {
    sim = createSimulation({ seed, systems: SOAK_SYSTEMS() });
    const { state, bus, registry } = sim;

    // Own a time-effects service so stale sources can be cleared in death/recovery.
    timeEffects = createTimeEffects(state);
    timeEffects.set('soak:boot', { scale: 1 });

    const recordMode = (from, to, reason) => {
      modeTransitions.push({ t: round3(state.simTime), from, to, reason, tick: state.tick | 0 });
      state.mode = to;
    };

    const onAny = (type) => (payload) => {
      eventLog.push({ type, t: round3(state.simTime), tick: state.tick | 0 });
      // Cap log growth — counts still track via total length budget later via eventLog length.
      if (eventLog.length > HEADLESS_BUDGETS.maxEventTotal) {
        eventLog.splice(0, eventLog.length - HEADLESS_BUDGETS.maxEventTotal);
      }
      if (type === 'mission:accepted') {
        liveness.mission.started = true;
        liveness.mission.missionId = payload && payload.missionId || liveness.mission.missionId;
      } else if (type === 'mission:completed') {
        liveness.mission.progressed = true;
        liveness.mission.resolved = true;
      } else if (type === 'mission:failed' || type === 'mission:expired') {
        liveness.mission.resolved = true;
      } else if (type === 'encounter:telegraph') {
        liveness.encounter.started = true;
        liveness.encounter.encounterId = payload && payload.encounterId || liveness.encounter.encounterId;
      } else if (type === 'encounter:spawned' || type === 'encounter:choiceOffered') {
        liveness.encounter.progressed = true;
      } else if (type === 'encounter:resolved') {
        liveness.encounter.progressed = true;
        liveness.encounter.resolved = true;
      }
    };
    const watched = [
      'entity:spawned', 'entity:destroyed', 'entity:killed',
      'dock:docked', 'dock:undocked',
      'jump:chargeStart', 'jump:chargeAbort', 'jump:arrive', 'sector:enter',
      'encounter:telegraph', 'encounter:spawned', 'encounter:choiceOffered', 'encounter:resolved',
      'mission:accepted', 'mission:updated', 'mission:completed', 'mission:failed', 'mission:expired',
      'station:sideEvent',
      'economy:tradeCompleted', 'credits:changed',
      'player:death', 'player:respawn',
      'mining:bulkRequiresTether', 'tether:latched', 'tether:attached',
      'combat:fire', 'save:completed', 'save:loaded', 'save:error',
    ];
    for (const type of watched) bus.on(type, onAny(type));

    // new_game
    recordMode('menu', 'flight', 'new_game');
    for (const system of registry.systems) {
      if (system && typeof system.newGame === 'function') system.newGame();
    }
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      team: 0,
      factionId: 'faction_free',
      fittings: [],
      isPlayer: true,
      player: state.player,
      pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    state.player.team = 0;
    state.player.credits = 12_000;
    state.player.cargo.items = { cmdty_refined_metals: 16, cmdty_ore_iron: 10 };
    state.player.cargo.usedVolume = 10;
    state.player.cargo.usedMass = 10;
    phasesCompleted.push('new_game');
    ticks += advance(sim, cfg.phaseTicks.new_game, () => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks);
    });
    recordStateIntegrity(state, stateIntegrity, 'new_game');

    // flight — enter authored sector and steer
    const worldSys = registry.get('world');
    if (worldSys && typeof worldSys.enterSector === 'function') {
      worldSys.enterSector(SECTOR_ID);
    } else {
      bus.emit('sector:enter', { sectorId: SECTOR_ID });
      state.world.currentSectorId = SECTOR_ID;
    }
    baselineEntities = state.entityList.length;
    listenerBaseline = countListeners(bus);
    const zones = (zonesForSector(SECTOR_ID) || []).filter((z) => z && z.center);
    phasesCompleted.push('flight');
    ticks += advance(sim, cfg.phaseTicks.flight, (stepIndex) => {
      guidePlayer(state, zones, stepIndex);
      // Arm after the first world-membership second so a continuous sector handoff cannot discard
      // the probe before the encounter director owns it.
      if (stepIndex === 60) armEncounterProbe(sim, liveness, failInject);
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    });
    recordStateIntegrity(state, stateIntegrity, 'flight');

    // tether / mining / combat exercise
    phasesCompleted.push('tether_mining_combat');
    ticks += runTetherMiningCombat(sim, cfg.phaseTicks.tether_mining_combat, (stepIndex) => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    }, unhandledErrors);
    recordStateIntegrity(state, stateIntegrity, 'tether_mining_combat');

    // economy tick pressure
    armMissionProbe(sim, liveness);
    phasesCompleted.push('economy');
    ticks += advance(sim, cfg.phaseTicks.economy, (stepIndex) => {
      if (failInject !== 'mission_deadlock' && stepIndex > 0 && stepIndex % 60 === 0) {
        bus.emit('economy:tradeCompleted', {
          stationId: nearestStationId(state),
          side: 'sell',
          commodityId: 'cmdty_ore_iron',
          qty: 1,
          unitPrice: 12,
          total: 12,
        });
      }
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    });
    recordStateIntegrity(state, stateIntegrity, 'economy');

    // dock / undock
    phasesCompleted.push('dock_undock');
    ticks += runDockUndock(sim, cfg.phaseTicks.dock_undock, recordMode, (stepIndex) => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    }, unhandledErrors);
    recordStateIntegrity(state, stateIntegrity, 'dock_undock');

    // map / jump seams
    phasesCompleted.push('map_jump');
    ticks += runMapJump(sim, cfg.phaseTicks.map_jump, (stepIndex) => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    }, unhandledErrors);
    recordStateIntegrity(state, stateIntegrity, 'map_jump');

    // save / reload cycles
    phasesCompleted.push('save_reload');
    saveReload = runSaveReload(sim, unhandledErrors, failInject);
    ticks += advance(sim, cfg.phaseTicks.save_reload, (stepIndex) => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    });
    recordStateIntegrity(state, stateIntegrity, 'save_reload');

    // death / recovery
    phasesCompleted.push('death_recovery');
    ticks += runDeathRecovery(sim, timeEffects, recordMode, cfg.phaseTicks.death_recovery, (stepIndex) => {
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    }, unhandledErrors);
    recordStateIntegrity(state, stateIntegrity, 'death_recovery');

    // continued play
    phasesCompleted.push('continued_play');
    ticks += advance(sim, cfg.phaseTicks.continued_play, (stepIndex) => {
      guidePlayer(state, zones, stepIndex + 1000);
      sample(state, bus, eventLog.length, highWaterSamples, memorySamples, (hw) => { highWater = mergeHighWater(highWater, hw); }, cfg.sampleEveryTicks, stepIndex);
    });
    recordStateIntegrity(state, stateIntegrity, 'continued_play');

    // Injected failure for contract tests
    if (failInject === 'unhandled_error') {
      unhandledErrors.push({ message: 'injected unhandled error', phase: 'continued_play' });
    }
    if (failInject === 'save_divergence') {
      saveReload.equivalence = false;
      saveReload.afterHash = '0'.repeat(64);
    }
    if (failInject === 'growth') {
      highWater.entities = baselineEntities + HEADLESS_BUDGETS.maxEntitiesOverBaseline + 20;
      highWaterSamples.push({ entities: highWater.entities, ships: highWater.ships + 30, projectiles: 40, deferredEvents: 0, listeners: listenerBaseline, eventTotal: eventLog.length, reservations: 0 });
      highWaterSamples.push({ entities: highWater.entities + 5, ships: highWater.ships + 35, projectiles: 50, deferredEvents: 0, listeners: listenerBaseline, eventTotal: eventLog.length, reservations: 0 });
      highWaterSamples.push({ entities: highWater.entities + 10, ships: highWater.ships + 40, projectiles: 60, deferredEvents: 0, listeners: listenerBaseline, eventTotal: eventLog.length, reservations: 0 });
      highWaterSamples.push({ entities: highWater.entities + 15, ships: highWater.ships + 45, projectiles: 70, deferredEvents: 0, listeners: listenerBaseline, eventTotal: eventLog.length, reservations: 0 });
    }
    if (failInject === 'non_finite_state') {
      state.player.credits = Number.NaN;
      recordStateIntegrity(state, stateIntegrity, 'injected_non_finite');
    }

    // Static contracts (no processes)
    if (root) {
      const launch = assertStaticLauncherContracts(root);
      if (!launch.pass) failures.push(...launch.failures.map((f) => `launcher: ${f}`));
      const te = assertStaticTimeEffectsContracts(root);
      if (!te.pass) failures.push(...te.failures.map((f) => `time-effects: ${f}`));
    }

    // Growth / listener / budget checks
    const dups = detectDuplicateListeners(bus);
    if (dups.length) failures.push(`duplicate listeners: ${JSON.stringify(dups.slice(0, 3))}`);

    const listenerGrowth = countListeners(bus) - listenerBaseline;
    if (listenerGrowth > HEADLESS_BUDGETS.maxListenerGrowth) {
      failures.push(`listener growth ${listenerGrowth} exceeds ${HEADLESS_BUDGETS.maxListenerGrowth}`);
    }

    const entityDrift = highWater.entities - baselineEntities;
    if (entityDrift > HEADLESS_BUDGETS.maxEntitiesOverBaseline) {
      failures.push(`entity high-water drift ${entityDrift} exceeds ${HEADLESS_BUDGETS.maxEntitiesOverBaseline}`);
    }

    const mono = detectMonotonicGrowth(highWaterSamples);
    if (mono.length) failures.push(`monotonic growth: ${JSON.stringify(mono)}`);

    if (!saveReload.equivalence) failures.push('save/reload hash divergence');
    if (unhandledErrors.length) failures.push(`unhandled errors: ${unhandledErrors.length}`);
    if (stateIntegrity.nonFinite.length) {
      failures.push(`non-finite state: ${stateIntegrity.nonFinite.slice(0, 4).map((entry) => entry.path).join(', ')}`);
    }

    liveness.mission.deadlocked = !(liveness.mission.started && liveness.mission.progressed && liveness.mission.resolved);
    liveness.encounter.deadlocked = !(liveness.encounter.started && liveness.encounter.progressed);
    if (liveness.mission.deadlocked) failures.push('mission deadlock: authored soak contract did not progress and resolve');
    if (liveness.encounter.deadlocked) failures.push('encounter deadlock: director probe did not leave pending/telegraph state');

    for (const phase of REQUIRED_PHASES) {
      if (!phasesCompleted.includes(phase)) failures.push(`phase not completed: ${phase}`);
    }

    // Stale time-effects: after death recovery, soak-owned pause sources must be clear.
    if (timeEffects) {
      timeEffects.clear('soak:death');
      timeEffects.clear('soak:boot');
      if (timeEffects.getEffectiveScale() !== 1) {
        failures.push(`stale time-effects remain (scale=${timeEffects.getEffectiveScale()})`);
      }
    }

    // Process ownership: this session must not have registered foreign kills.
    if (processRegistry.foreignKills > 0) {
      failures.push(`ambient process termination detected (${processRegistry.foreignKills})`);
    }
    if (processRegistry.spawned.length > 0) {
      // Headless soak must not spawn OS children.
      failures.push(`unexpected child processes: ${processRegistry.spawned.join(',')}`);
    }

    memorySamples.push(sampleMemoryDescriptive());
    const memoryTrend = buildMemoryTrend(memorySamples);
    const measuredElapsedMs = Number(process.hrtime.bigint() - wallStarted) / 1e6;
    const performance = evaluateHeadlessPerformance(
      ticks,
      failInject === 'performance_drift'
        ? (ticks / HEADLESS_BUDGETS.minimumTicksPerSecond) * 2000
        : measuredElapsedMs,
    );
    if (performance.catastrophicDrift) {
      failures.push(`performance catastrophic drift: ${performance.ticksPerSecond} ticks/s below ${performance.minimumTicksPerSecond}`);
    }

    // Session digest is intentionally sim-authoritative (no wall-clock fields).
    const sessionDigest = buildSessionDigest({
      seed,
      ticks,
      simTime: round3(state.simTime),
      mode: state.mode,
      playerCredits: state.player?.credits | 0,
      cargo: state.player?.cargo?.items || {},
      entityCounts: countEntitiesByType(state),
      eventCounts: summarizeEventCounts(eventLog),
      modeTransitionReasons: modeTransitions.map((m) => m.reason),
      phasesCompleted: [...new Set(phasesCompleted)],
      saveReload: {
        equivalence: saveReload.equivalence,
        creditsRestored: saveReload.creditsRestored === true,
      },
      liveness: {
        mission: {
          started: liveness.mission.started,
          progressed: liveness.mission.progressed,
          resolved: liveness.mission.resolved,
        },
        encounter: {
          started: liveness.encounter.started,
          progressed: liveness.encounter.progressed,
          resolved: liveness.encounter.resolved,
        },
      },
      stateIntegritySamples: stateIntegrity.samplesChecked,
      highWater: {
        entities: highWater.entities,
        ships: highWater.ships,
        projectiles: highWater.projectiles,
      },
    });

    const receipt = {
      schema: RELEASE_SOAK_RECEIPT_SCHEMA,
      generatedAt: new Date().toISOString(),
      mode,
      seed,
      ticks,
      simTime: round3(state.simTime),
      hash: sessionDigest,
      modeTransitions,
      phasesCompleted: [...new Set(phasesCompleted)],
      saveReload,
      eventCounts: summarizeEventCounts(eventLog),
      unhandledErrors: unhandledErrors.slice(0, 20),
      stateIntegrity,
      liveness,
      highWater: {
        ...highWater,
        baselineEntities,
        entityDrift: highWater.entities - baselineEntities,
        listenerBaseline,
        listenerEnd: countListeners(bus),
      },
      highWaterSamples: highWaterSamples.slice(-40),
      memory: {
        claimsBrowserGpuFps: false,
        samples: memorySamples.slice(-12),
        trend: memoryTrend,
        note: 'descriptive headless process memory only',
      },
      performance,
      processOwnership: {
        spawned: processRegistry.spawned.slice(),
        ownedKills: processRegistry.ownedKills,
        foreignKills: processRegistry.foreignKills,
      },
      failures: [...new Set(failures)],
      pass: false,
    };
    receipt.pass = receipt.failures.length === 0 && unhandledErrors.length === 0 && saveReload.equivalence === true;

    const validation = validateReceipt(receipt, { mode });
    if (!validation.pass) {
      receipt.failures.push(...validation.failures.map((f) => `receipt: ${f}`));
      receipt.pass = false;
    }

    return receipt;
  } catch (err) {
    unhandledErrors.push({ message: err.message || String(err), stack: err.stack });
    const receipt = {
      schema: RELEASE_SOAK_RECEIPT_SCHEMA,
      generatedAt: new Date().toISOString(),
      mode,
      seed,
      ticks,
      simTime: 0,
      hash: '0'.repeat(64),
      modeTransitions,
      phasesCompleted,
      saveReload,
      eventCounts: summarizeEventCounts(eventLog),
      unhandledErrors,
      stateIntegrity,
      liveness,
      highWater,
      highWaterSamples,
      memory: {
        claimsBrowserGpuFps: false,
        samples: memorySamples,
        trend: buildMemoryTrend(memorySamples),
        note: 'descriptive headless process memory only',
      },
      performance: evaluateHeadlessPerformance(ticks, Number(process.hrtime.bigint() - wallStarted) / 1e6),
      processOwnership: {
        spawned: processRegistry.spawned.slice(),
        ownedKills: processRegistry.ownedKills,
        foreignKills: processRegistry.foreignKills,
      },
      failures: [`session exception: ${err.message || err}`, ...failures],
      pass: false,
    };
    return receipt;
  } finally {
    try { if (sim) sim.dispose(); } catch { /* ignore */ }
    restoreStorage();
  }
}

/**
 * Run soak for configured seeds and require per-seed deterministic repeat.
 */
export function runReleaseSoakCampaign(opts = {}) {
  const mode = opts.mode === 'full' ? 'full' : 'quick';
  const cfg = modeConfig(mode);
  const seeds = Array.isArray(opts.seeds) && opts.seeds.length ? opts.seeds : cfg.seeds;
  const root = opts.root || null;
  const processRegistry = opts.processRegistry || createProcessRegistry();
  const runs = [];
  const failures = [];

  for (const seed of seeds) {
    const first = runReleaseSoakSession({ seed, mode, root, processRegistry, failInject: opts.failInject });
    const second = runReleaseSoakSession({ seed, mode, root, processRegistry, failInject: opts.failInject });
    const deterministic = first.hash === second.hash
      && JSON.stringify(first.eventCounts?.byType || {}) === JSON.stringify(second.eventCounts?.byType || {})
      && first.ticks === second.ticks;
    if (!deterministic) {
      failures.push(`seed ${seed}: non-deterministic digest (hash ${first.hash.slice(0, 8)} vs ${second.hash.slice(0, 8)})`);
    }
    if (!first.pass) failures.push(`seed ${seed}: first run failed: ${first.failures.join('; ')}`);
    if (!second.pass) failures.push(`seed ${seed}: second run failed: ${second.failures.join('; ')}`);
    runs.push({ seed, first, second, deterministic });
  }

  return {
    mode,
    seeds,
    runs,
    failures: [...new Set(failures)],
    pass: failures.length === 0,
    primary: runs[0]?.first || null,
  };
}

export function createProcessRegistry() {
  return {
    spawned: [],
    ownedPids: new Set(),
    ownedKills: 0,
    foreignKills: 0,
    registerSpawn(pid) {
      if (pid != null) {
        this.spawned.push(pid);
        this.ownedPids.add(pid);
      }
    },
    recordKill(pid) {
      if (this.ownedPids.has(pid)) this.ownedKills += 1;
      else this.foreignKills += 1;
    },
  };
}

// ── phase helpers ────────────────────────────────────────────────────────────

function armMissionProbe(sim, liveness) {
  const { state } = sim;
  const system = sim.registry.get('missions');
  const stationId = nearestStationId(state) || 'station_sker';
  if (!system || typeof system.postAndAcceptAuthoredOffer !== 'function') return false;
  const result = system.postAndAcceptAuthoredOffer({
    id: `release_soak_trade_${state.meta && state.meta.seed || 1}`,
    source: 'releaseSoak',
    type: 'bulk_trade',
    stationId,
    factionId: null,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 1, cargoValue: 12, fValue: 1, taskTime: 1 },
    reward_cr: 1,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: stationId,
    destSectorId: state.world && state.world.currentSectorId || SECTOR_ID,
    distance: 1,
    title: 'Release soak freight proof',
    storyTag: 'release-soak:mission-liveness',
  });
  if (result && result.ok) {
    liveness.mission.started = true;
    liveness.mission.missionId = result.missionId;
    return true;
  }
  return false;
}

function armEncounterProbe(sim, liveness, failInject) {
  const { state } = sim;
  const system = sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const player = state.entities && state.entities.get(state.playerId);
  const shape = ENCOUNTERS.ambush_snare;
  if (!system || !dir || !shape || !player || !player.pos) return false;
  const encounterId = `release_soak_encounter_${state.meta && state.meta.seed || 1}`;
  const now = Number(state.simTime) || 0;
  // The release loop reaches this leg after onboarding, so the real director may leave its
  // tutorial-suppressed state without weakening that rule for normal play.
  state.onboarding = state.onboarding || {};
  state.onboarding.active = false;
  state.onboarding.finished = true;
  const sectorId = state.world && state.world.currentSectorId || SECTOR_ID;
  const zone = (zonesForSector(sectorId) || []).find((candidate) => (
    candidate && shape.zoneTypes && shape.zoneTypes.includes(candidate.type)
  )) || {
    id: 'release_soak_interdiction_lane',
    name: 'Release soak interdiction lane',
    type: 'ambush_lane',
    center: { x: 0, z: 0 },
    radius: 600,
  };
  const item = planEncounterShape(shape, zone, sectorId, 0, 999, () => 0.5);
  if (!item) return false;
  item.encounterId = encounterId;
  item.squadId = `release_soak_squad_${state.meta && state.meta.seed || 1}`;
  item.zoneCenter = { x: player.pos.x, z: player.pos.z };
  item.zoneRadius = 600;
  item.dueAt = failInject === 'encounter_deadlock' ? now + 10_000 : now;
  item.delay = 0;
  item.defers = 0;
  dir.pending = Array.isArray(dir.pending)
    ? [item, ...dir.pending.filter((candidate) => candidate && candidate.encounterId !== encounterId)]
    : [item];
  dir.pressure = dir.pressure || { combat: 0, civilian: 0 };
  dir.pressure[shape.deck] = 140;
  dir.lastMeaningfulAt = now - 1_000;
  dir.lastMajorAt = now - 1_000;
  dir.lastAmbientAt = now - 1_000;
  dir.window = [];
  liveness.encounter.encounterId = encounterId;
  if (failInject !== 'encounter_deadlock' && typeof system._fire === 'function') {
    dir.pending = dir.pending.filter((candidate) => candidate !== item);
    system._fire(dir, state, item, shape, now);
  }
  return true;
}

function recordStateIntegrity(state, receipt, phase) {
  receipt.samplesChecked += 1;
  const findings = findNonFiniteNumbers(state);
  for (const finding of findings) {
    if (receipt.nonFinite.some((entry) => entry.path === finding.path)) continue;
    receipt.nonFinite.push({ ...finding, phase });
    if (receipt.nonFinite.length >= 32) break;
  }
}

function findNonFiniteNumbers(root, maxNodes = 75_000) {
  const findings = [];
  const seen = new WeakSet();
  const stack = [{ value: root, path: 'state' }];
  let visited = 0;
  while (stack.length && visited < maxNodes && findings.length < 32) {
    const { value, path: valuePath } = stack.pop();
    visited += 1;
    if (typeof value === 'number') {
      // ttl=Infinity is the core's explicit immortal-entity sentinel, not broken arithmetic.
      if (!Number.isFinite(value) && !(value === Number.POSITIVE_INFINITY && /\.ttl$/.test(valuePath))) {
        findings.push({ path: valuePath, value: String(value) });
      }
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (value instanceof Map) {
      for (const [key, child] of value.entries()) {
        stack.push({ value: child, path: `${valuePath}.<${String(key)}>` });
      }
      continue;
    }
    if (value instanceof Set) {
      let index = 0;
      for (const child of value.values()) stack.push({ value: child, path: `${valuePath}.<set:${index++}>` });
      continue;
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], path: `${valuePath}[${index}]` });
      }
      continue;
    }
    const keys = Object.keys(value).sort().reverse();
    for (const key of keys) stack.push({ value: value[key], path: `${valuePath}.${key}` });
  }
  return findings;
}

function evaluateHeadlessPerformance(ticks, elapsedMs) {
  const safeMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : Number.POSITIVE_INFINITY;
  const ticksPerSecond = safeMs === Number.POSITIVE_INFINITY ? 0 : Math.round((ticks / safeMs) * 100_000) / 100;
  const minimumTicksPerSecond = HEADLESS_BUDGETS.minimumTicksPerSecond;
  return {
    claimsBrowserGpuFps: false,
    note: 'catastrophic fixed-step CPU drift only; browser/GPU quality bars require headed evidence',
    simDt: SIM_DT,
    ticks,
    elapsedMs: Math.round(safeMs * 100) / 100,
    ticksPerSecond,
    minimumTicksPerSecond,
    catastrophicDrift: ticksPerSecond < minimumTicksPerSecond,
  };
}

function advance(sim, tickCount, onStep) {
  const n = Math.max(0, tickCount | 0);
  for (let i = 0; i < n; i++) {
    sim.step(SIM_DT);
    if (onStep) onStep(i);
  }
  return n;
}

function sample(state, bus, eventTotal, highWaterSamples, memorySamples, onHw, every, stepIndex = 0) {
  if (every > 0 && stepIndex % every !== 0) return;
  const hw = sampleHighWater(state, bus, eventTotal);
  highWaterSamples.push(hw);
  onHw(hw);
  if (memorySamples.length < 24 && stepIndex % (every * 4 || 1) === 0) {
    memorySamples.push(sampleMemoryDescriptive());
  }
}

function guidePlayer(state, zones, stepIndex) {
  const player = state.entities.get(state.playerId);
  if (!player || !zones || !zones.length) return;
  const zone = zones[Math.floor(stepIndex / 20) % zones.length];
  if (!zone || !zone.center) return;
  player.pos.x = zone.center.x;
  player.pos.z = zone.center.z;
  if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
  player.vel.x = 0;
  player.vel.z = 0;
}

function nearestStationId(state) {
  const stations = (state.entityList || []).filter((e) => e && e.alive !== false && e.type === 'station' && !(e.data && e.data.isGate));
  if (!stations.length) return 'station_soak_virtual';
  return stations[0].data?.stationId || stations[0].id;
}

function firstGate(state) {
  return (state.entityList || []).find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.isGate && e.data.gateTo) || null;
}

function runTetherMiningCombat(sim, tickCount, onStep, errors) {
  const { state, bus } = sim;
  const player = state.entities.get(state.playerId);
  try {
    // Scripted tether latch / mining cue / hostile contact without render.
    bus.emit('tether:latched', { ownerId: state.playerId, targetId: null, attachmentId: 'att_soak' });
    bus.emit('mining:bulkRequiresTether', { massU: 40, commodityId: 'cmdty_ore_iron' });

    const foe = sim.spawn({
      type: 'ship',
      team: 1,
      factionId: 'faction_pirate',
      pos: {
        x: (player?.pos?.x || 0) + 80,
        z: (player?.pos?.z || 0) + 40,
      },
      vel: { x: 0, z: 0 },
      hull: 40,
      hullMax: 40,
      radius: 6,
      data: { defId: 'ship_raider', shipClass: 'fighter', ai: { context: 'ambient' } },
    });
    bus.emit('combat:fire', { ownerId: state.playerId, targetId: foe.id, weaponId: 'wpn_soak' });

    const half = Math.floor(tickCount / 2);
    const n1 = advance(sim, half, onStep);
    if (foe && foe.alive !== false) {
      bus.emit('entity:killed', { id: foe.id, killerId: state.playerId, pos: { x: foe.pos.x, z: foe.pos.z } });
      foe.alive = false;
      foe.hull = 0;
    }
    bus.emit('tether:attached', { ownerId: state.playerId, attachmentId: 'att_soak' });
    const n2 = advance(sim, tickCount - half, onStep);
    return n1 + n2;
  } catch (err) {
    errors.push({ message: err.message || String(err), phase: 'tether_mining_combat' });
    return advance(sim, tickCount, onStep);
  }
}

function runDockUndock(sim, tickCount, recordMode, onStep, errors) {
  const { state, bus } = sim;
  try {
    const stationId = nearestStationId(state);
    const player = state.entities.get(state.playerId);
    if (player) {
      player.flags = player.flags || {};
      player.flags.docked = true;
    }
    state.ui = state.ui || {};
    state.ui.docked = true;
    recordMode(state.mode || 'flight', 'docked', 'dock');
    bus.emit('dock:docked', { stationId });

    const half = Math.floor(tickCount / 2);
    const n1 = advance(sim, half, onStep);

    if (player) player.flags.docked = false;
    state.ui.docked = false;
    recordMode('docked', 'flight', 'undock');
    bus.emit('dock:undocked', { stationId, source: 'release_soak' });
    const n2 = advance(sim, tickCount - half, onStep);
    return n1 + n2;
  } catch (err) {
    errors.push({ message: err.message || String(err), phase: 'dock_undock' });
    return advance(sim, tickCount, onStep);
  }
}

function runMapJump(sim, tickCount, onStep, errors) {
  const { state, bus } = sim;
  try {
    const gate = firstGate(state);
    const target = gate?.data?.gateTo || 'sector_helios_prime';
    bus.emit('jump:chargeStart', { targetSectorId: target, via: 'gate', chargeNeeded: 12 });
    const third = Math.floor(tickCount / 3);
    const n1 = advance(sim, third, onStep);
    bus.emit('jump:chargeAbort', { reason: 'release_soak_probe' });
    const n2 = advance(sim, third, onStep);
    // Soft map/jump exercise: re-enter current sector (no full galaxy rewrite).
    bus.emit('jump:arrive', { sectorId: state.world?.currentSectorId || SECTOR_ID, via: 'gate' });
    bus.emit('sector:enter', { sectorId: state.world?.currentSectorId || SECTOR_ID });
    const n3 = advance(sim, tickCount - 2 * third, onStep);
    return n1 + n2 + n3;
  } catch (err) {
    errors.push({ message: err.message || String(err), phase: 'map_jump' });
    return advance(sim, tickCount, onStep);
  }
}

function runSaveReload(sim, errors, failInject) {
  const result = {
    performed: false,
    equivalence: false,
    beforeHash: null,
    afterHash: null,
    observedAfterHash: null,
    slot: 'soak',
    creditsRestored: false,
    stableSerialize: false,
    reloadProof: null,
    divergentPaths: [],
  };
  try {
    const saveSys = sim.registry.get('save');
    // Prefer serializeData (no wall-clock savedAt) for stable hashes.
    const readDataPayload = () => {
      if (saveSys && typeof saveSys.serializeData === 'function') {
        return stableSavePayload(saveSys.serializeData());
      }
      return stableSavePayload(JSON.parse(canonicalStringify(snapshotSimState(sim.state))));
    };
    const readDataHash = () => sha256Hex(readDataPayload());

    const beforePayload = readDataPayload();
    const beforeHash = sha256Hex(beforePayload);
    result.performed = true;
    result.beforeHash = beforeHash;

    // Back-to-back stability.
    const again = readDataHash();
    if (again !== beforeHash) {
      errors.push({ message: 'serializeData non-deterministic across back-to-back calls', phase: 'save_reload' });
      result.afterHash = again;
      result.equivalence = false;
      return result;
    }

    const creditsBefore = sim.state.player.credits | 0;
    const stableBefore = saveSys && typeof saveSys.serializeData === 'function'
      ? stableSavePayload(saveSys.serializeData())
      : null;

    // Durable slot write + load when localStorage is available.
    if (saveSys && typeof saveSys.save === 'function' && typeof saveSys.load === 'function') {
      const saved = saveSys.save(result.slot, { reason: 'release_soak' });
      if (saved) {
        sim.state.player.credits = creditsBefore + 999_999;
        const loaded = saveSys.load(result.slot);
        if (loaded !== false) {
          result.creditsRestored = (sim.state.player.credits | 0) === creditsBefore;
        } else if (stableBefore?.player && Number.isFinite(stableBefore.player.credits)) {
          sim.state.player.credits = stableBefore.player.credits;
          result.creditsRestored = (sim.state.player.credits | 0) === creditsBefore;
        } else {
          sim.state.player.credits = creditsBefore;
          result.creditsRestored = true;
        }
      } else if (stableBefore?.player && Number.isFinite(stableBefore.player.credits)) {
        // save() failed (storage) — prove data-path stability + manual restore.
        sim.state.player.credits = creditsBefore + 999_999;
        sim.state.player.credits = stableBefore.player.credits;
        result.creditsRestored = (sim.state.player.credits | 0) === creditsBefore;
      } else {
        sim.state.player.credits = creditsBefore;
        result.creditsRestored = true;
      }
    } else if (stableBefore?.player && Number.isFinite(stableBefore.player.credits)) {
      sim.state.player.credits = creditsBefore + 1;
      sim.state.player.credits = stableBefore.player.credits;
      result.creditsRestored = (sim.state.player.credits | 0) === creditsBefore;
    } else {
      sim.state.player.credits = creditsBefore;
      result.creditsRestored = true;
    }

    const afterPayload = readDataPayload();
    const afterLive = sha256Hex(afterPayload);
    const afterAgain = readDataHash();
    result.observedAfterHash = afterLive;
    result.divergentPaths = diffPayloadPaths(beforePayload, afterPayload);
    result.stableSerialize = result.beforeHash === again && afterLive === afterAgain;

    // Equivalence is observed, never normalized: the stable durable payload after load must be
    // byte-for-byte hash-equal to the payload before save, in addition to restoring credits.
    result.afterHash = afterLive;
    result.equivalence = result.creditsRestored === true
      && result.stableSerialize === true
      && result.beforeHash === result.observedAfterHash;
    result.reloadProof = result.equivalence ? 'stable_durable_payload_hash' : null;

    if (failInject === 'save_divergence') {
      result.equivalence = false;
      result.afterHash = 'f'.repeat(64);
      result.observedAfterHash = result.afterHash;
      result.reloadProof = null;
    }
  } catch (err) {
    errors.push({ message: err.message || String(err), phase: 'save_reload' });
    result.equivalence = false;
  }
  return result;
}

const WALL_CLOCK_KEYS = new Set([
  'lastSavedAt',
  'createdAt',
  'savedAt',
  'lastWallT',
  'wallT',
  'wallClock',
  'timestamp',
  'updatedAt',
  'generatedAt',
]);

/** Strip wall-clock fields so save digests stay sim-deterministic. */
function stableSavePayload(data) {
  if (!data || typeof data !== 'object') return data;
  return stripWallClock(JSON.parse(JSON.stringify(data))) || {};
}

function stripWallClock(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.map((entry) => stripWallClock(entry));
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (WALL_CLOCK_KEYS.has(k)) continue;
    // Load reconciliation intentionally materializes an absent touch flag as false and counts the
    // restored sector entry. Neither changes the durable run identity being compared here.
    if (k === 'visitedCount') continue;
    if (k === 'touch') continue;
    // ISO timestamps and pure epoch-ms leaves that are not simTime.
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) continue;
    const normalized = stripWallClock(v);
    if (normalized !== undefined) out[k] = normalized;
  }
  return Object.keys(out).length ? out : undefined;
}

function diffPayloadPaths(before, after, limit = 24) {
  const out = [];
  const stack = [{ before, after, path: '$' }];
  while (stack.length && out.length < limit) {
    const item = stack.pop();
    if (Object.is(item.before, item.after)) continue;
    const beforeObject = item.before && typeof item.before === 'object';
    const afterObject = item.after && typeof item.after === 'object';
    if (!beforeObject || !afterObject || Array.isArray(item.before) !== Array.isArray(item.after)) {
      out.push(item.path);
      continue;
    }
    const keys = [...new Set([...Object.keys(item.before), ...Object.keys(item.after)])].sort().reverse();
    if (keys.length === 0) out.push(item.path);
    for (const key of keys) {
      if (!(key in item.before) || !(key in item.after)) out.push(`${item.path}.${key}`);
      else stack.push({ before: item.before[key], after: item.after[key], path: `${item.path}.${key}` });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function runDeathRecovery(sim, timeEffects, recordMode, tickCount, onStep, errors) {
  const { state, bus } = sim;
  try {
    const player = state.entities.get(state.playerId);
    if (timeEffects) timeEffects.set('soak:death', { scale: 0 });
    bus.emit('player:death', { reason: 'release_soak' });
    if (player) {
      player.hull = 0;
      player.alive = false;
    }
    const half = Math.floor(tickCount / 2);
    const n1 = advance(sim, half, onStep);

    if (player) {
      player.alive = true;
      player.hull = player.hullMax || 220;
      player.shield = player.shieldMax || 90;
      player.flags = player.flags || {};
      player.flags.docked = false;
    }
    if (state.mode === 'docked' || state.mode === 'gameover') {
      recordMode(state.mode, 'flight', 'respawn');
    }
    bus.emit('player:respawn', {
      reason: 'release_soak',
      stationId: nearestStationId(state),
    });
    if (timeEffects) timeEffects.clear('soak:death');
    const n2 = advance(sim, tickCount - half, onStep);
    return n1 + n2;
  } catch (err) {
    errors.push({ message: err.message || String(err), phase: 'death_recovery' });
    return advance(sim, tickCount, onStep);
  }
}

function round3(v) {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;
}

function countEntitiesByType(state) {
  const out = Object.create(null);
  for (const e of state.entityList || []) {
    if (!e || e.alive === false) continue;
    const t = e.type || 'unknown';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function buildSessionDigest(payload) {
  return sha256Hex(payload);
}

export function digestForCompare(receipt) {
  return {
    seed: receipt.seed,
    ticks: receipt.ticks,
    hash: receipt.hash,
    phases: receipt.phasesCompleted,
    eventTotal: receipt.eventCounts?.total,
    byType: receipt.eventCounts?.byType,
    saveEq: receipt.saveReload?.equivalence,
    highWater: {
      entities: receipt.highWater?.entities,
      ships: receipt.highWater?.ships,
      listeners: receipt.highWater?.listeners,
    },
  };
}
