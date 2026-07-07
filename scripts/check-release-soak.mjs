#!/usr/bin/env node
// check-release-soak.mjs — SPEC2/08 release-readiness long-run soak (T1c).
//
// Boots the REAL production sim headlessly and advances the 60Hz fixed timestep for a configurable
// duration, sampling state at intervals and asserting six release invariants. Gates SPEC2/08 and
// unblocks T9c (world-alive).
//
// BOOT PATH: this reuses the createSimulation harness pattern from scripts/sf-sim.mjs (the
// deterministic sim driver), NOT createRegistry. createRegistry statically imports renderer.js →
// bloom.js at module load, and bloom.js currently carries a syntax error (pre-existing at HEAD; it
// breaks every createRegistry-based check identically, including check-sg06-live-registry.mjs). The
// sf-sim pattern imports the live sim systems directly and never pulls in the render/audio/UI/DOM
// tree, so it boots headless cleanly. We assemble the live production UPDATE_ORDER system set here
// (rapier-dynamic + SG-06 tactical + flightV3 — the shipped defaults), excluding only render-phase
// systems (render/vfx/feel/audio/ui) and the two BP-12 directors not yet on disk
// (stationSideEventDirector, gateControlDirector). This is the same fidelity sf-sim.mjs uses.
//
// This is a pure scripts/ tool. It only READS the sim: boots it, steps it, asserts. Never edits src/.
// Deterministic in its sim-driving code (no Math.random / wall-clock inside the step loop — uses
// state.simTime); wall-clock is used ONLY for the --minutes cutoff + sampling cadence (test tooling,
// exempt per AGENTS §6).
//
// Flags:
//   --minutes N    soak wall-clock budget in minutes (default 30). The sim steps as fast as Node can.
//   --seed 0xNN    deterministic seed (default 0x5041 = 'PA'). Same seed + minutes → same verdict.
//   --quick        ~2-minute CI smoke (overrides --minutes to 2).
//   --tick-cap N   hard cap on ticks regardless of --minutes (default 300000 ≈ 83min @60Hz).
//   --sample-s N   sim-seconds between sample lines (default 60).
//   --inject X     NON-VACUOUS PROOF: inject a known fault and confirm the matching assertion trips.
//                  X ∈ {leak, drift, spawn}. Exit 0 = the injected fault was correctly caught.
//   --verbose      print every exception caught in the step loop.
//
// Exit codes: 0 = PASS. 1 = FAIL. With --inject, 0 = injected fault caught (proof passes).

import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { canonicalStringify } from '../src/core/simSnapshot.js';

// Live production sim systems, in UPDATE_ORDER (mirrors src/core/registry.js lines 98-101),
// excluding render-phase (render/vfx/feel/audio/ui/save) and the two BP-12 directors not yet on disk.
import { input } from '../src/systems/input.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { scanner } from '../src/systems/scanner.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { actions } from '../src/systems/actions.js';
import { beacons } from '../src/systems/beacons.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { cruise } from '../src/systems/cruise.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { weapons } from '../src/systems/weapons.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { mining } from '../src/systems/mining.js';
import { cargo } from '../src/systems/cargo.js';
import { automation } from '../src/systems/automation.js';
import { wingmen } from '../src/systems/wingmen.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { intervention } from '../src/systems/intervention.js';
import { world } from '../src/systems/world.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { salvage } from '../src/systems/salvage.js';
import { factions } from '../src/systems/factions.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { scenarioRuntime } from '../src/systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { ships } from '../src/systems/ships.js';
import { heat } from '../src/systems/heat.js';
import { traffic } from '../src/systems/traffic.js';
import { drill } from '../src/systems/drill.js';
import { claims } from '../src/systems/claims.js';
import { onboarding } from '../src/systems/onboarding.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const PLAYER_TEAM = 0;

const CONFIG = {
  minutes: 30,
  seed: 0x5041,
  quickMinutes: 2,
  tickCap: 300000,
  sampleSeconds: 60,
  // Strict enough to catch a real regression, loose enough that a healthy run passes on a warm box.
  entityCeiling: 400,
  spawnBudgetHardMax: 12,        // spawnBudget.js DEFAULT_MAX
  spawnBudgetAbsCeiling: 40,     // spawnBudget.js HARD_MAX — a bad override must never breach
  orphanedEntitiesAllowed: 0,    // dead-but-not-swept entities must be 0 after lifetimeSweep each tick
  tickBudgetMs: 8,
  tickSpikeConsecutive: 12,      // sustained breaches across N samples to flag
  stateGrowthFactor: 3.0,        // state-size proxy may grow up to (initial × factor) — linear logs OK
  telegraphWindowTicks: 60 * 60, // a hostile must trace to an authorizing event within 60s either side
  // How many sampled checkpoints the determinism cross-check re-runs. Re-running re-boots SG-02
  // (async/slow) and re-steps the sim, so this is bounded: a real non-determinism leak diverges
  // within the first checkpoint or two; 5 is plenty without doubling wall runtime.
  crossCheckMaxPoints: 5,
};

// ── Argument parsing ──────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const eq = name + '=';
  const ix = args.findIndex((a) => a === name || a.startsWith(eq));
  if (ix < 0) return fallback;
  if (args[ix].startsWith(eq)) return args[ix].slice(eq.length);
  return args[ix + 1] != null ? args[ix + 1] : fallback;
}
function hasFlag(name) { return args.includes(name); }
function readInt(name, fallback) {
  const n = Number(argValue(name, String(fallback)));
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return n;
}
function parseSeed(raw) {
  const s = String(raw);
  const n = s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : Number(s);
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('--seed must be a non-negative integer');
  return n >>> 0;
}

const isQuick = hasFlag('--quick');
const injectMode = argValue('--inject', null);
const verbose = hasFlag('--verbose') || hasFlag('-v');
const minutes = isQuick ? CONFIG.quickMinutes : readInt('--minutes', CONFIG.minutes);
const seed = parseSeed(argValue('--seed', String(CONFIG.seed)));
const tickCap = readInt('--tick-cap', CONFIG.tickCap);
const sampleSeconds = readInt('--sample-s', CONFIG.sampleSeconds);
const wallBudgetMs = minutes * 60 * 1000;

if (injectMode && !['leak', 'drift', 'spawn'].includes(injectMode)) {
  failArg(`--inject must be one of leak, drift, spawn (got ${injectMode})`);
}

const INJECT_EXPECTED = {
  leak: 'heapGrowth',
  drift: 'drift',
  spawn: 'untelegraphed',
};

// ── Headless browser stubs (DOM/window the sim's typeof-window guards expect) ──────────────────
const restoreGlobals = installHeadlessBrowserStubs();

try {
  await main();
} finally {
  restoreGlobals();
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const label = isQuick ? 'QUICK' : 'FULL';
  process.stdout.write(
    `[release-soak ${label}] minutes=${minutes} seed=0x${seed.toString(16)} tickCap=${tickCap} ` +
    `sampleS=${sampleSeconds}${injectMode ? ` inject=${injectMode}` : ''}\n`,
  );

  // Trackers attached INSIDE the harness, BEFORE bootstrap, so every spawn (incl. ambient hostiles
  // from enterSector + SG-02 warmup) is attributed.
  const trackers = makeTrackers();
  const harness = await makeSoakHarness({ seed, trackers });
  const { state, bus, sim, helpers } = harness;

  const samples = [];
  const faults = [];                 // [{invariant, message, detail, tick, simTime}] — first per invariant
  let stepExceptions = 0;
  let lastStepException = null;

  // Authorizing events for the untelegraphed-spawn invariant.
  bus.on('encounter:telegraph', (e) => trackers.auth({ kind: 'telegraph', encounterId: e && e.encounterId }));
  bus.on('encounter:spawned', (e) => trackers.auth({ kind: 'encounterSpawn', encounterId: e && e.encounterId }));
  bus.on('mission:accepted', () => trackers.auth({ kind: 'missionAccept' }));
  bus.on('scenario:beatEntered', () => trackers.auth({ kind: 'scenarioBeat' }));
  bus.on('sector:enter', () => trackers.auth({ kind: 'sectorEnter' }));
  bus.on('entity:spawned', (e) => {
    const ent = e && e.entity;
    if (!ent) return;
    trackers.spawn({ id: ent.id, team: ent.team | 0, type: ent.type, tick: state.tick });
  });

  // Optional non-vacuous fault injection. OFF in every normal run.
  let inject = null;
  if (injectMode === 'leak') inject = makeLeakInjector(state);
  if (injectMode === 'drift') inject = makeDriftInjector(state);
  if (injectMode === 'spawn') inject = makeSpawnInjector(state, helpers, trackers);

  const baselineStateSize = approximateStateSize(state);
  const sampleTickInterval = Math.max(1, Math.round(sampleSeconds / SIM_DT));
  let tickBudgetBreachesInARow = 0;
  const digestCheckpoints = [];     // {tick, digest} — for the cross-run determinism proof

  const wallStart = Date.now();
  let tick = 0;
  for (; tick < tickCap; tick++) {
    if (Date.now() - wallStart >= wallBudgetMs) break;   // wall-clock cutoff (test-tooling exempt)

    if (inject && inject.beforeStep) inject.beforeStep(tick);

    // Advance the sim one authoritative step. Invariant (f): catch+count, never crash the soak.
    try {
      sim.step(SIM_DT);
    } catch (err) {
      stepExceptions++;
      lastStepException = err;
      if (verbose) process.stderr.write(`[release-soak] step exception @tick=${tick}: ${err && err.message}\n`);
    }

    if (inject && inject.afterStep) inject.afterStep(tick);

    if (tick > 0 && (tick % sampleTickInterval === 0)) {
      const sample = collectSample(state, helpers, tick, trackers);
      samples.push(sample);
      process.stdout.write(formatSampleLine(sample));

      checkHeapGrowth(sample, baselineStateSize, faults);
      checkEntityCap(sample, faults);
      checkUntelegraphedSpawns(state, trackers, faults);
      checkSoftlock(sample, samples, faults);

      if (sample.lastTickMs > CONFIG.tickBudgetMs) {
        tickBudgetBreachesInARow++;
        if (tickBudgetBreachesInARow >= CONFIG.tickSpikeConsecutive) {
          pushFault(faults, 'tickBudget', sample,
            `tick cost sustained > ${CONFIG.tickBudgetMs}ms for ${tickBudgetBreachesInARow} samples`,
            { lastTickMs: sample.lastTickMs });
        }
      } else {
        tickBudgetBreachesInARow = 0;
      }

      digestCheckpoints.push({ tick, digest: sample.digest });
    }
  }

  // ── Final softlock check: did simTime advance across the whole run? ──
  const finalSimTime = state.simTime || 0;
  const expectedMinSimTime = (tick - 1) * SIM_DT * 0.95;
  if (finalSimTime < expectedMinSimTime) {
    pushFault(faults, 'softlock', samples[samples.length - 1] || { tick, simTime: finalSimTime },
      `simTime only reached ${finalSimTime.toFixed(2)}s after ${tick} ticks (expected ≥ ${expectedMinSimTime.toFixed(2)}s)`,
      { finalSimTime, expectedMinSimTime });
  }
  if (stepExceptions > Math.max(2, Math.floor(tick / 10000))) {
    pushFault(faults, 'softlock', samples[samples.length - 1] || { tick },
      `${stepExceptions} step exceptions over ${tick} ticks (last: ${lastStepException && lastStepException.message})`,
      { stepExceptions });
  }

  // ── Determinism cross-check (criterion c): same seed → same digest at sampled ticks ──
  // ALWAYS run — this is the real non-determinism detector. A second independent harness with the
  // same seed must reproduce every sampled digest. Any divergence = Math.random/wall-clock leak.
  // The drift injector writes to a digest-read path, so under --inject drift this WILL diverge.
  // The cross-check re-boots SG-02 (async/slow) and re-steps the sim, so it is capped to the FIRST
  // FEW checkpoints — a real drift leak diverges within the first checkpoint or two.
  const ccCheckpoints = digestCheckpoints.slice(0, CONFIG.crossCheckMaxPoints);
  const ccTicks = ccCheckpoints.length ? ccCheckpoints[ccCheckpoints.length - 1].tick + sampleTickInterval : 0;
  const driftErrors = await determinismCrossCheck({
    seed, ticks: ccTicks, sampleTickInterval, digestCheckpoints: ccCheckpoints,
  });
  for (const err of driftErrors) pushFault(faults, 'drift', null, err.message, err.detail);

  harness.dispose();

  // ── Verdict ──
  process.stdout.write(renderVerdict({
    label, minutes, seed, ticks: tick, samples, faults, stepExceptions,
    finalSimTime, wallElapsedMs: Date.now() - wallStart, injectMode,
  }));

  if (injectMode) {
    const matching = faults.some((f) => f.invariant === INJECT_EXPECTED[injectMode]);
    if (matching) {
      process.stdout.write(`[release-soak] INJECT=${injectMode} correctly caught by invariant "${INJECT_EXPECTED[injectMode]}". Proof passes.\n`);
      process.exitCode = 0;
    } else {
      process.stdout.write(`[release-soak] INJECT=${injectMode} did NOT trip invariant "${INJECT_EXPECTED[injectMode]}" — soak is vacuous!\n`);
      process.exitCode = 1;
    }
    return;
  }
  process.exitCode = faults.length === 0 ? 0 : 1;
}

// ── Trackers: per-entity spawn attribution + authorization log ────────────────────────────────
function makeTrackers() {
  return {
    spawns: new Map(),   // id -> {id, team, type, tick}
    auths: [],           // [{kind, tick, seq}]
    _seq: 0,
    spawn(rec) { this.spawns.set(rec.id, rec); },
    auth(rec) { this.auths.push({ ...rec, tick: rec.tick != null ? rec.tick : 0, seq: this._seq++ }); },
    clearAuths() { this.auths.length = 0; },
  };
}

// ── Harness: boot the live production sim headlessly (sf-sim.mjs pattern) ──────────────────────
async function makeSoakHarness({ seed, trackers }) {
  // The live UPDATE_ORDER (registry.js:98-101), minus render-phase + not-yet-created BP-12 directors.
  const systems = [
    voiceArbiter, input, autoTargetAssist, scanner, createTacticalAISystem(), aiEncounter, actions,
    beacons, flightV3, cruise, aiPorts, weapons, countermeasures, impulseCharges, physics, combat,
    tetherGameplay, masslineTelemetry, masslineThreats, masslineImpacts, mining, cargo, economy,
    automation, wingmen, crafting, intervention, spawnBudget, world, encounterDirector, salvage,
    factions, sectorSim, missions, story, scenarioRuntime, presentationOrchestrator,
    presentationAdapters, ships, heat, traffic, drill, claims, onboarding,
  ];

  const sim = createSimulation({ seed, systems });
  const { state, bus, helpers, registry } = sim;

  // Force the production backends (the shipped defaults).
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.tutorialHints = false;

  bootstrapNewGame(state, helpers, registry, bus);
  await ensureSg02Ready(registry, state);

  return {
    state, bus, sim, helpers,
    dispose() {
      const physicsSys = registry.get('physics');
      if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
        physicsSys._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

function bootstrapNewGame(state, helpers, registry, bus) {
  // Run newGame() on every system that has one, in main.js startNewGame() order, so subsystem trees
  // populate (economy markets, faction table, mission boards, sectorSim drift, traffic freighters).
  const newGameOrder = ['world', 'factions', 'economy', 'automation', 'intervention', 'sectorSim',
    'missions', 'aiEncounter', 'crafting', 'traffic', 'drill', 'claims', 'beacons', 'spawnBudget',
    'encounterDirector', 'ships'];
  for (const name of newGameOrder) {
    const sys = registry.get(name);
    if (sys && typeof sys.newGame === 'function') {
      try { sys.newGame(); } catch (err) {
        throw new Error(`[release-soak] ${name}.newGame() threw: ${err && err.message}`);
      }
    }
  }

  const shipId = NEW_GAME.shipId || 'ship_kestrel';
  const fittings = fittingsFromDefaultModules(shipId, NEW_GAME.fittedModules || []);
  const playerSpec = makeShipEntitySpec(shipId, {
    team: PLAYER_TEAM, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings, pos: { x: 0, z: 0 },
  });
  const player = helpers.spawnEntity(playerSpec);
  state.playerId = player.id;
  state.player.credits = NEW_GAME.credits || 5000;

  const shipsSys = registry.get('ships');
  if (shipsSys && typeof shipsSys.recomputeActiveShip === 'function') shipsSys.recomputeActiveShip();

  // Enter the home sector — spawns stations, asteroid fields, POIs, ambient enemies from data,
  // reserving against spawnBudget and emitting sector:enter (which sectorSim/traffic react to).
  const worldSys = registry.get('world');
  if (worldSys && typeof worldSys.enterSector === 'function') {
    worldSys.enterSector(NEW_GAME.startingSectorId || 'sector_helios_prime');
  }

  state.spatialHash.rebuild(state.entityList);
  bus.emit('game:started', { source: 'release-soak' });
}

async function ensureSg02Ready(registry, state) {
  for (let i = 0; i < 16; i++) {
    registry.step(SIM_DT);
    const physicsSys = registry.get('physics');
    if (physicsSys && physicsSys._sg02Init && typeof physicsSys._sg02Init.then === 'function') {
      await physicsSys._sg02Init;
    }
    const diag = state.physicsRuntime && state.physicsRuntime.diagnostics;
    if (diag && diag.backend === 'rapier-dynamic' && diag.sg02Ready === true) return;
  }
  throw new Error('[release-soak] SG-02 dynamic authority did not become ready within 16 ticks — cannot soak.');
}

// ── Sample collection ─────────────────────────────────────────────────────────────────────────
function collectSample(state, helpers, tick, trackers) {
  const entityList = state.entityList || [];
  const liveEntities = entityList.filter((e) => e && e.alive);
  const deadUnswept = entityList.filter((e) => e && !e.alive).length;

  const budget = helpers.spawnBudget;
  const spawnBudgetCurrent = budget ? budget.current() : 0;
  const spawnBudgetMax = budget ? budget.max() : CONFIG.spawnBudgetHardMax;

  const perf = state.perfRuntime;
  const report = perf && typeof perf.getReport === 'function' ? perf.getReport() : null;
  const simPhase = report && report.phases && report.phases.sim ? report.phases.sim : null;
  const lastTickMs = simPhase ? (simPhase.last || 0) : 0;

  const hostiles = liveEntities.filter((e) => e.type === 'ship' && e.team !== PLAYER_TEAM);

  return {
    tick,
    simTime: Number(state.simTime || 0),
    liveEntities: liveEntities.length,
    deadUnswept,
    spawnBudgetCurrent,
    spawnBudgetMax,
    stateSize: approximateStateSize(state),
    lastTickMs,
    digest: digestState(state),
    hostileIds: hostiles.map((e) => e.id),
    hostileCount: hostiles.length,
    authCount: trackers.auths.length,
    subtreeSizes: collectSubtreeSizes(state),
  };
}

function collectSubtreeSizes(state) {
  // The brief's named leak suspects. Each should be bounded (logs ring-buffered, boards capped).
  return {
    entityList: (state.entityList || []).length,
    sectorSimLossLog: Array.isArray(state.sectorSim && state.sectorSim.meta && state.sectorSim.meta.lossLog)
      ? state.sectorSim.meta.lossLog.length : 0,
    missionReceipts: Array.isArray(state.missions && state.missions.receipts) ? state.missions.receipts.length : 0,
    missionCompletedLog: Array.isArray(state.missions && state.missions.completedLog)
      ? state.missions.completedLog.length : 0,
    interventionList: Array.isArray(state.interventions) ? state.interventions.length : 0,
    economyEvents: Array.isArray(state.economy && state.economy.econEvents) ? state.economy.econEvents.length : 0,
    combatBeams: Array.isArray(state.combat && state.combat.beams) ? state.combat.beams.length : 0,
    aiEncounterCommands: Array.isArray(state.aiEncounter && state.aiEncounter.commands)
      ? state.aiEncounter.commands.length : 0,
    automationLostAssets: Array.isArray(state.automation && state.automation.meta && state.automation.meta.lostAssetsLog)
      ? state.automation.meta.lostAssetsLog.length : 0,
    trafficFreighters: Array.isArray(state.traffic && state.traffic.freighters) ? state.traffic.freighters.length : 0,
    soakLeakBin: Array.isArray(state._releaseSoakLeakBin) ? state._releaseSoakLeakBin.length : 0,
  };
}

// ── Invariant checks ──────────────────────────────────────────────────────────────────────────

function checkHeapGrowth(sample, baselineStateSize, faults) {
  // "linear-in-time logs OK; per-tick record growth that never clears = leak = FAIL." We bound the
  // state-size proxy by a factor of the baseline; a per-tick leak blows this out within a few samples.
  const ceiling = baselineStateSize * CONFIG.stateGrowthFactor;
  if (sample.stateSize > ceiling) {
    pushFault(faults, 'heapGrowth', sample,
      `state-size proxy ${sample.stateSize} exceeded ${ceiling.toFixed(0)} (baseline ${baselineStateSize} × ${CONFIG.stateGrowthFactor})`,
      { baselineStateSize, stateSize: sample.stateSize, subtrees: sample.subtreeSizes });
  }
  const subtreeCaps = { aiEncounterCommands: 5000, interventionList: 5000, economyEvents: 5000, soakLeakBin: 1000 };
  for (const [key, cap] of Object.entries(subtreeCaps)) {
    const val = sample.subtreeSizes[key];
    if (val > cap) {
      pushFault(faults, 'heapGrowth', sample,
        `subtree ${key}=${val} exceeded absolute cap ${cap} (unbounded accumulation suspect)`,
        { subtree: key, value: val, cap });
    }
  }
}

function checkEntityCap(sample, faults) {
  if (sample.spawnBudgetMax > CONFIG.spawnBudgetAbsCeiling) {
    pushFault(faults, 'entityCap', sample,
      `spawnBudget.max()=${sample.spawnBudgetMax} exceeded HARD_MAX ${CONFIG.spawnBudgetAbsCeiling}`,
      { spawnBudgetMax: sample.spawnBudgetMax });
  }
  if (sample.spawnBudgetCurrent > sample.spawnBudgetMax) {
    pushFault(faults, 'entityCap', sample,
      `spawnBudget.current()=${sample.spawnBudgetCurrent} exceeded max ${sample.spawnBudgetMax}`,
      { spawnBudgetCurrent: sample.spawnBudgetCurrent, spawnBudgetMax: sample.spawnBudgetMax });
  }
  if (sample.liveEntities > CONFIG.entityCeiling) {
    pushFault(faults, 'entityCap', sample,
      `live entity count ${sample.liveEntities} exceeded ceiling ${CONFIG.entityCeiling}`,
      { liveEntities: sample.liveEntities });
  }
  if (sample.deadUnswept > CONFIG.orphanedEntitiesAllowed) {
    pushFault(faults, 'entityCap', sample,
      `${sample.deadUnswept} dead-but-not-swept entities survived lifetimeSweep (should be 0)`,
      { deadUnswept: sample.deadUnswept });
  }
}

function checkUntelegraphedSpawns(state, trackers, faults) {
  // Every hostile-team ship must trace to a recent authorizing event (encounter:telegraph,
  // encounter:spawned, mission:accepted, scenario:beatEntered, or sector:enter for ambient
  // population). We attribute each spawn via entity:spawned → trackers.spawns, then check each LIVE
  // hostile's spawn tick against the authorization window.
  const liveHostiles = (state.entityList || []).filter((e) => e && e.alive && e.type === 'ship' && e.team !== PLAYER_TEAM);
  if (liveHostiles.length === 0) return;
  const auths = trackers.auths;
  const win = CONFIG.telegraphWindowTicks;
  for (const e of liveHostiles) {
    const rec = trackers.spawns.get(e.id);
    if (!rec) continue; // spawned before trackers attached (trackers attach pre-bootstrap, so rare)
    const covered = auths.some((a) => Math.abs(a.tick - rec.tick) <= win);
    if (!covered) {
      pushFault(faults, 'untelegraphed', null,
        `hostile ship id=${e.id} (team ${e.team}) spawned at tick=${rec.tick} with NO authorizing event within ${win} ticks`,
        { entityId: e.id, team: e.team, spawnTick: rec.tick, authCount: auths.length, authKinds: auths.slice(-8).map((a) => a.kind) });
      return; // first untelegraphed hostile is enough to fail; don't spam
    }
  }
}

function checkSoftlock(sample, samples, faults) {
  if (samples.length < 2) return;
  const prev = samples[samples.length - 2];
  const expected = CONFIG.sampleSeconds * 0.5;
  if (sample.simTime - prev.simTime < expected) {
    pushFault(faults, 'softlock', sample,
      `simTime advanced only ${(sample.simTime - prev.simTime).toFixed(2)}s over a ${CONFIG.sampleSeconds}s sample window (stall/halt)`,
      { prevSimTime: prev.simTime, simTime: sample.simTime });
  }
}

// ── Determinism cross-check (criterion c): same seed → same digest at sampled ticks ───────────
async function determinismCrossCheck({ seed, ticks, sampleTickInterval, digestCheckpoints }) {
  const errors = [];
  if (digestCheckpoints.length === 0) return errors;
  let harness2;
  try {
    harness2 = await makeSoakHarness({ seed, trackers: makeTrackers() });
  } catch (err) {
    errors.push({ message: `determinism cross-check could not boot a second harness: ${err && err.message}`, detail: {} });
    return errors;
  }
  try {
    const { state: state2, sim: sim2 } = harness2;
    let cpIdx = 0;
    for (let tick = 0; tick < ticks && cpIdx < digestCheckpoints.length; tick++) {
      try { sim2.step(SIM_DT); } catch (err) { /* divergence surfaces as a digest mismatch below */ }
      if (tick > 0 && tick % sampleTickInterval === 0) {
        const cp = digestCheckpoints[cpIdx];
        if (!cp || cp.tick !== tick) { cpIdx++; continue; }
        const digest2 = digestState(state2);
        if (digest2 !== cp.digest) {
          errors.push({
            message: `determinism divergence at tick=${tick}: primary ${cp.digest.slice(0, 12)}… vs rerun ${digest2.slice(0, 12)}…`,
            detail: { tick, primary: cp.digest, rerun: digest2 },
          });
        }
        cpIdx++;
      }
    }
  } finally {
    harness2.dispose();
  }
  return errors;
}

// ── State-size proxy + digest (deterministic, sim-driven) ──────────────────────────────────────

function approximateStateSize(state) {
  const s = collectSubtreeSizes(state);
  return (
    s.entityList * 8 +
    s.sectorSimLossLog +
    s.missionReceipts +
    s.missionCompletedLog +
    s.interventionList +
    s.economyEvents +
    s.combatBeams +
    s.aiEncounterCommands +
    s.automationLostAssets +
    s.trafficFreighters +
    s.soakLeakBin
  );
}

// Canonical deterministic digest of a state surface. Same seed + same ticks → identical across runs.
// Sensitive to non-determinism (Math.random/wall-clock leaks corrupt the hashed values). The drift
// injector writes to player.__soakDriftNoise, read here, so under --inject drift the two runs diverge.
function digestState(state) {
  const p = state.player || {};
  const surface = {
    tick: state.tick | 0,
    simTime: round6(state.simTime || 0),
    mode: state.mode,
    player: {
      credits: Math.round(p.credits || 0),
      heat: round6(p.heat || 0),
      driftNoise: p.__soakDriftNoise == null ? null : round6(p.__soakDriftNoise),
    },
    econClock: state.economy && state.economy.econClock ? { ticksElapsed: state.economy.econClock.ticksElapsed | 0 } : null,
    spawnBudget: { used: state.spawnBudget ? (state.spawnBudget.used | 0) : 0, max: state.spawnBudget ? (state.spawnBudget.max | 0) : 0 },
    entityCount: (state.entityList || []).length,
    liveEntityCount: (state.entityList || []).filter((e) => e && e.alive).length,
    nextEntityId: state.nextEntityId | 0,
    days: state.days | 0,
  };
  return sha256(canonicalStringify(surface));
}

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function round6(n) { return Math.round(n * 1e6) / 1e6; }

// ── Non-vacuous fault injectors ────────────────────────────────────────────────────────────────
// Each deliberately violates ONE invariant so we can prove the soak bites. OFF in every normal run.

function makeLeakInjector(state) {
  // Heap-growth fault: push records to a scratch array EVERY tick that never clears. Within one
  // sample (~3600 ticks) this is ~720,000 entries — blows past the soakLeakBin cap (1000) and the
  // state-size-growth ceiling → checkHeapGrowth trips.
  state._releaseSoakLeakBin = state._releaseSoakLeakBin || [];
  return {
    beforeStep() {
      for (let i = 0; i < 200; i++) state._releaseSoakLeakBin.push({ junk: 'x'.repeat(32) });
    },
  };
}

function makeDriftInjector(state) {
  // Drift fault: write Math.random() into a digest-read path (player.__soakDriftNoise). Each process
  // produces different Math.random output, so the primary run's digest won't match the rerun's →
  // determinismCrossCheck reports divergence → invariant 'drift' trips.
  return {
    beforeStep(tick) {
      if (tick % 10 === 0) state.player.__soakDriftNoise = Math.random();
    },
  };
}

function makeSpawnInjector(state, helpers, trackers) {
  // Untelegraphed-spawn fault: directly spawn a hostile-team ship AFTER wiping the authorization
  // log, so the injected hostile has NO authorizing event within the window → checkUntelegraphedSpawns
  // trips at the first sample.
  let spawned = false;
  return {
    beforeStep(tick) {
      if (spawned || tick < 3) return;
      spawned = true;
      trackers.clearAuths();   // remove the bootstrap sector:enter cover — prove the spawn is naked
      helpers.spawnEntity({
        type: 'ship', alive: true, collides: true, radius: 8, team: 1,
        factionId: 'faction_reavers', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
        hull: 100, hullMax: 100, data: { ai: { fsm: 'attack' }, combat: {} },
      });
    },
  };
}

// ── Fault + verdict rendering ──────────────────────────────────────────────────────────────────

function pushFault(faults, invariant, sample, message, detail) {
  if (faults.some((f) => f.invariant === invariant)) return;  // keep only the FIRST per invariant
  faults.push({
    invariant, message, detail: detail || {},
    tick: sample ? sample.tick : null, simTime: sample ? sample.simTime : null,
  });
}

function formatSampleLine(s) {
  return (
    `[soak t=${String(s.tick).padStart(7)} simT=${s.simTime.toFixed(1).padStart(7)}s ` +
    `ent=${String(s.liveEntities).padStart(4)} ` +
    `budget=${s.spawnBudgetCurrent}/${s.spawnBudgetMax} ` +
    `hostile=${String(s.hostileCount).padStart(3)} ` +
    `tickMs=${s.lastTickMs.toFixed(2)} ` +
    `size=${String(s.stateSize).padStart(7)} ` +
    `auth=${s.authCount} ` +
    `digest=${s.digest.slice(0, 8)}]\n`
  );
}

function renderVerdict(ctx) {
  const { label, minutes, seed, ticks, samples, faults, stepExceptions, finalSimTime, wallElapsedMs, injectMode } = ctx;
  const lines = ['', '═══════════════════════════════════════════════════════════════════════'];
  lines.push(`  RELEASE SOAK VERDICT — ${label}  (seed=0x${seed.toString(16)}, ${minutes}min budget)`);
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push(`  ticks run          : ${ticks}`);
  lines.push(`  simTime reached    : ${finalSimTime.toFixed(2)}s`);
  lines.push(`  wall elapsed       : ${(wallElapsedMs / 1000).toFixed(1)}s`);
  lines.push(`  samples collected  : ${samples.length}`);
  lines.push(`  step exceptions    : ${stepExceptions}`);
  if (samples.length) {
    const last = samples[samples.length - 1];
    lines.push(`  final entities     : ${last.liveEntities} live, ${last.deadUnswept} dead-unswept`);
    lines.push(`  final spawnBudget  : ${last.spawnBudgetCurrent}/${last.spawnBudgetMax}`);
    lines.push(`  final tick cost    : ${last.lastTickMs.toFixed(2)}ms`);
    lines.push(`  final state size   : ${last.stateSize}`);
  }
  lines.push('  ───────────────────────────────────────────────────────────────────');
  lines.push('  INVARIANT STATUS:');
  for (const inv of ['heapGrowth', 'entityCap', 'drift', 'untelegraphed', 'tickBudget', 'softlock']) {
    const f = faults.find((x) => x.invariant === inv);
    lines.push(`    ${f ? 'FAIL ✗' : 'OK ✓'}  ${inv}${f ? ' — ' + f.message : ''}`);
  }
  lines.push('  ───────────────────────────────────────────────────────────────────');
  const passed = faults.length === 0;
  if (injectMode) {
    lines.push(`  INJECT MODE (${injectMode}): expecting invariant "${INJECT_EXPECTED[injectMode]}" to trip.`);
    lines.push(passed ? '  ⚠ NO invariant tripped — the soak is VACUOUS (proof failed).'
                      : '  ✓ Injected fault was caught — soak bites.');
  } else {
    lines.push(passed ? '  RESULT: PASS — all 6 release invariants held for the full soak.'
                      : '  RESULT: FAIL — a release-blocking regression was found.');
  }
  lines.push('═══════════════════════════════════════════════════════════════════════', '');
  return lines.join('\n');
}

// ── Headless browser stubs ─────────────────────────────────────────────────────────────────────
function installHeadlessBrowserStubs() {
  const previous = {
    addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener,
    innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
    document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage,
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.document = {
    getElementById() { return null; }, querySelector() { return null; },
    createElement() {
      return {
        style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {},
        setAttribute() {}, addEventListener() {}, querySelector() { return null; }, innerHTML: '', textContent: '',
      };
    },
    head: { appendChild() {} }, body: { appendChild() {} },
  };
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem() { return null; }, setItem() {}, removeItem() {}, key() { return null; }, clear() {},
    get length() { return 0; },
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

function failArg(message) {
  process.stderr.write(message + '\n');
  process.stderr.write('Usage: node scripts/check-release-soak.mjs [--minutes 30] [--seed 0xNN] [--quick] [--inject leak|drift|spawn]\n');
  process.exit(2);
}
