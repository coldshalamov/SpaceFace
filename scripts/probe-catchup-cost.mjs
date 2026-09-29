#!/usr/bin/env node
// W4 catch-up lane instrument: decompose what a forced-behind frame actually pays.
//
// The browser path is presentationRunner.frame() → runner.advance(frameDt) → up to
// MAX_CATCHUP_STEPS registry.step() calls. This probe rebuilds that same runner against the
// legacy47a system set (the golden's profile) so each phase of a catch-up step is timed on a
// populated world:
//
//   stepSimulation bookkeeping (reserve/capture/consume/publishCompletedTick/journalSequence)
//     ├─ registry.step(dt, boundary)
//     │    ├─ core.preStep          (tick++, pose snapshot, dirty journal rotate, index reconcile)
//     │    ├─ updateQueue systems   (full queue on step 0, TABLE-only on catch-up steps)
//     │    └─ core.lifetimeSweep    (TTL decay, corpse compact, bus flush)
//     └─ input boundary publish     (InputCommandSnapshot capture ≈ browser publish path)
//
// `sim.step` is thinner than the browser registry.step (no input.update, no per-system perf
// sampling); the residual between advance() and the instrumented internals is the runner's own
// bookkeeping — the only per-tick overhead a hypothetical fused batch could even try to erase.
//
//   node scripts/probe-catchup-cost.mjs [--warmup=720] [--iters=240]
//
// Numbers are medians over interleaved rounds. Nothing here mutates the sim path; it is a
// measurement instrument only.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { canonicalStringify } from '../src/core/simSnapshot.js';
import { createDeterministicEventTrace } from '../src/core/eventTrace.js';
import { createSimulationRunner, frameSimStepCap, MAX_CATCHUP_STEPS, HITCH_FRAME_TICKS, HITCH_CATCHUP_STEPS } from '../src/core/simulationRunner.js';
import { createInputCommandSnapshotQueue } from '../src/core/inputCommandSnapshot.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { stampNearWorkBudget } from '../src/core/activityScheduler.js';
import { validateScenarioDocument, formatScenarioIssue } from '../src/contracts/scenarioSchemas.js';
import { scenarioRuntime } from '../src/systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { actions } from '../src/systems/actions.js';
import { flight } from '../src/systems/flight.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { save } from '../src/save/saveSystem.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import {
  makeEvidenceSpindleSpec,
  mark47aPlayerActor,
  spawn47aScenarioCast,
} from '../src/data/scenarios/47aLiveScene.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { LEGACY47A_FEATURES } from '../src/runtime/runtimeProfiles.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argValue = (name, dflt) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : dflt;
};
const WARMUP_TICKS = Number(argValue('--warmup', 720));
const ITERS = Number(argValue('--iters', 240));

applyFeatureConfigToMaps(LEGACY47A_FEATURES);
const scenarioJson = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
const contractReport = validateScenarioDocument(scenarioJson, { file: 'src/data/scenarios/47a.scenario.json' });
assert(contractReport.ok, `scenario contract invalid:\n${contractReport.issues.map(formatScenarioIssue).join('\n')}`);

const systems = [
  scenarioRuntime, presentationOrchestrator, presentationAdapters, actions, flight,
  weapons, physics, combat, cargo, economy, missions, story, save,
];
const runtimeManifest = resolveRuntimeManifest({
  profileId: 'legacy47a',
  explicitSystems: systems,
  tacticalAI: false,
  exclusions: ['production-manifest-claim', 'full-production-system-set', 'massline-family', 'travel-family'],
});

const sim = createSimulation({
  seed: 47,
  helpers: {
    scenarioContract: scenarioJson,
    scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
    scenarioContractHash: createHash('sha256').update(canonicalStringify(scenarioJson)).digest('hex'),
  },
  systems,
  runtimeManifest,
  runtimeConfig: {
    profileId: 'legacy47a',
    features: runtimeManifest.features,
    evidenceClass: runtimeManifest.evidenceClass,
    exclusions: runtimeManifest.exclusions,
  },
});
const { state, bus, registry } = sim;
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.aiBackend = 'legacy';
state.settings.gameplay.flightBackend = 'legacy';
state.settings.gameplay.runtimeProfile = 'legacy47a';
createDeterministicEventTrace(bus, state, {});

state.mode = 'flight';
state.world.currentSectorId = 'sector_helios_prime';
state.player.credits = 5000;
const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: { x: 0, z: 0 }, rot: 0,
}));
state.playerId = player.id;
mark47aPlayerActor(player);
const spindle = sim.spawn(makeEvidenceSpindleSpec({ pos: { x: 92, z: 0 }, rot: 0 }));
spindle.data = Object.assign({}, spindle.data, {
  scenarioActorId: 'evidence_spindle_47a', scenarioRole: 'tether_payload',
  assetRef: 'asset.slice.47a_spindle',
});
const target = sim.spawn(makeShipEntitySpec('ship_wasp', {
  team: 1, factionId: 'faction_reavers', pos: { x: 620, z: -18 },
  rot: Math.PI, ai: { role: 'target_dummy' },
}));
target.radius = Math.max(target.radius || 0, 44);
target.flags = Object.assign({}, target.flags, { persistent: true });
spawn47aScenarioCast(sim);
const econ = registry.get('economy');
if (econ && typeof econ.newGame === 'function') econ.newGame();
bus.emit('game:started', { source: 'probe-catchup-cost', scenario: '47a' });
const physicsSys = registry.get('physics');
assert.equal(await physicsSys.prepareBackend(state), true, 'SG-02 backend must be ready');

// ── instrumentation: wrap every queue system's update plus core.preStep/lifetimeSweep ──
// Bucketed by catch-up index at call time: index 0 = primary step (full queue), >0 = catch-up
// step (TABLE clock only). simCatchupIndex is set by stepSimulation before registry.step runs.
const phaseNs = new Map();
const addPhase = (key, ns) => phaseNs.set(key, (phaseNs.get(key) || 0) + ns);
function wrapMethod(instance, method, key) {
  const orig = instance[method];
  if (typeof orig !== 'function') return;
  instance[method] = function (...args) {
    const t = performance.now();
    try { return orig.apply(this, args); }
    finally {
      const bucket = (state.simCatchupIndex | 0) > 0 ? 'catchup' : 'primary';
      addPhase(`${bucket}:${key}`, (performance.now() - t) * 1e6);
    }
  };
}
const coreInstance = registry.systems[0];
for (const instance of registry.systems) {
  if (instance === coreInstance) continue;
  wrapMethod(instance, 'update', `sys:${instance.name}`);
}
wrapMethod(coreInstance, 'preStep', 'core.preStep');
wrapMethod(coreInstance, 'lifetimeSweep', 'core.lifetimeSweep');

// Per-step records from inside the runner's step call: index 0 = primary queue, >0 = catch-up.
const stepRecords = [];
let publishNs = 0;
const proxyRegistry = {
  step(dt, boundary) {
    const t = performance.now();
    sim.registry.step(dt);
    const ns = (performance.now() - t) * 1e6;
    const p0 = performance.now();
    if (boundary) boundary.publishInputCommand(state.input, state.tick, null);
    publishNs += (performance.now() - p0) * 1e6;
    stepRecords.push({ ns, catchupIndex: state.simCatchupIndex | 0 });
  },
};
const runner = createSimulationRunner(state, proxyRegistry, {
  presentationJournal: createPresentationJournal(),
});

// ── warmup: replay the golden input tape so the measured world IS the golden's world ──
const tape = JSON.parse(readFileSync(resolve(ROOT, 'test/47a.inputs.json'), 'utf8'));
const frames = (tape.frames || []).slice().sort((a, b) => a.tick - b.tick);
let frameIndex = 0;
let currentInput = frames[0] ? frames[0].input : {};
const resolveScenarioEntity = (ref) => {
  if (ref == null) return null;
  if (Number.isSafeInteger(ref)) return state.entities.get(ref) || null;
  const id = String(ref);
  if (id === 'player' || id === 'player_kestrel') return state.entities.get(state.playerId) || null;
  const binding = state.scenario && state.scenario.actorBindings && state.scenario.actorBindings[id];
  if (binding && binding.status === 'bound') return state.entities.get(binding.entityId) || null;
  return (state.entityList || []).find((e) => {
    const data = (e && e.data) || {};
    return data.scenarioActorId === id || data.scenarioRole === id || data.assetRef === id || data.defId === id;
  }) || null;
};
function applyTapeCommands(commands) {
  for (const command of commands || []) {
    if (!command) continue;
    if (command.kind === 'combatAction') {
      const actor = resolveScenarioEntity(command.actor);
      if (actor && sim.helpers.requestCombatAction) {
        const request = {
          actorId: actor.id,
          actionId: command.actionId,
          source: { kind: command.source || 'player', controllerId: 'golden-tape' },
        };
        if (command.target != null) {
          const tgt = resolveScenarioEntity(command.target);
          if (tgt) request.targetId = tgt.id;
        }
        sim.helpers.requestCombatAction(request);
      }
    } else if (command.kind === 'scenarioBranch' && sim.helpers.applyScenarioBranch) {
      sim.helpers.applyScenarioBranch(command.branchId, { source: command.source || 'golden-tape' });
    }
  }
}
function applyTapeInput(input) {
  const p = state.entities.get(state.playerId);
  const aimAngle = Number.isFinite(input.aimAngle) ? input.aimAngle : (state.input.aimAngle || 0);
  const origin = p ? p.pos : { x: 0, z: 0 };
  Object.assign(state.input, {
    moveX: Number.isFinite(input.moveX) ? input.moveX : 0,
    moveZ: Number.isFinite(input.moveZ) ? input.moveZ : 0,
    turnIntent: Number.isFinite(input.turnIntent) ? input.turnIntent : (input.moveX || 0),
    boost: !!input.boost,
    fire: !!input.fire,
    fireGroup: input.fireGroup == null ? null : input.fireGroup,
    aimAngle,
    aimWorld: { x: origin.x + Math.cos(aimAngle) * 1000, z: origin.z + Math.sin(aimAngle) * 1000 },
  });
}
for (let tick = 0; tick < WARMUP_TICKS; tick++) {
  while (frameIndex < frames.length && frames[frameIndex].tick <= tick) {
    currentInput = frames[frameIndex].input || {};
    applyTapeCommands(frames[frameIndex].commands);
    frameIndex++;
  }
  applyTapeInput(currentInput);
  sim.step(SIM_DT);
}
const entityCount = state.entityList.length;

// ── measurement: interleaved forced-behind frames ──
// Each case resets the accumulator to zero so advance(frameDt) runs exactly the steps owed.
// Interleave A/B/C so world drift and GC amortize evenly across cases.
const cases = [
  { name: 'primary_1step', frameDt: SIM_DT, cap: null },
  { name: 'catchup_4step', frameDt: 4 * SIM_DT, cap: MAX_CATCHUP_STEPS },
  { name: 'hitch_2step_shed', frameDt: 7 * SIM_DT, cap: HITCH_CATCHUP_STEPS },
];
const advanceNs = new Map(cases.map((c) => [c.name, []]));
const shedCounts = new Map(cases.map((c) => [c.name, 0]));
const consumedScratch = {};
phaseNs.clear();
stepRecords.length = 0;
publishNs = 0;
for (let round = 0; round < ITERS; round++) {
  for (const c of cases) {
    state.accumulator = 0;
    const cap = c.cap ?? frameSimStepCap({ frameDt: c.frameDt });
    const t = performance.now();
    const out = runner.advance(c.frameDt, 1, cap);
    advanceNs.get(c.name).push((performance.now() - t) * 1e6);
    shedCounts.set(c.name, shedCounts.get(c.name) + out.shedSteps);
    // Mirror presentationRunner: the present drains every pending completed tick once a frame.
    runner.consumeLatestCompletedTick(consumedScratch);
  }
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const primarySteps = stepRecords.filter((r) => r.catchupIndex === 0).map((r) => r.ns);
const catchupSteps = stepRecords.filter((r) => r.catchupIndex > 0).map((r) => r.ns);
const publishPerStep = publishNs / Math.max(1, stepRecords.length);

// Per-bucket phase attribution.
const phaseUs = (key, count) =>
  +(((phaseNs.get(key) || 0) / Math.max(1, count)) / 1000).toFixed(1);
const bucketPhase = (bucket, count) => {
  const out = {};
  let sysTotal = 0;
  for (const [key, ns] of phaseNs) {
    if (!key.startsWith(`${bucket}:`)) continue;
    const name = key.slice(bucket.length + 1);
    const per = (ns / Math.max(1, count)) / 1000;
    out[name] = +per.toFixed(1);
    if (name.startsWith('sys:')) sysTotal += per;
  }
  return { phases: out, sysTotalUs: sysTotal };
};
const primaryPhases = bucketPhase('primary', primarySteps.length);
const catchupPhases = bucketPhase('catchup', catchupSteps.length);

// Bookkeeping residual = advance() median minus instrumented step minus boundary publish —
// the reserve/consume/publish queue ops + counters the runner pays per step (plus per-advance
// assert/loop, ~nothing). Reported per primary frame.
const bookkeepingPerStep =
  (median(advanceNs.get('primary_1step')) - median(primarySteps) - publishPerStep);

// ── standalone microbenches: the queue objects a fused batch would multiply by N ──
const benchIters = 200_000;
const q = createInputCommandSnapshotQueue(8);
const sampleInput = state.input;
{
  const t = performance.now();
  for (let i = 1; i <= benchIters; i++) {
    q.publish(i, i, 0, sampleInput);
    q.consume(i);
  }
  var publishConsumeNs = (performance.now() - t) * 1e6 / benchIters;
}
{
  const t = performance.now();
  for (let i = 0; i < 1000; i++) stampNearWorkBudget(state);
  var nearWorkStampNs = (performance.now() - t) * 1e6 / 1000;
}

const report = {
  schema: 'spaceface.catchupCostProbe.v1',
  world: { seed: 47, warmupTicks: WARMUP_TICKS, entities: entityCount, tickAtMeasure: state.tick },
  advanceMedianNs: Object.fromEntries(
    [...advanceNs].map(([name, arr]) => [name, Math.round(median(arr))]),
  ),
  shedStepsTotal: Object.fromEntries(shedCounts),
  stepMedianNs: {
    primary_fullQueue: Math.round(median(primarySteps)),
    catchup_tableOnly: Math.round(median(catchupSteps)),
  },
  primaryStepPhaseUs: primaryPhases.phases,
  catchupStepPhaseUs: catchupPhases.phases,
  boundaryPublishUs: +(publishPerStep / 1000).toFixed(1),
  runnerBookkeepingResidualUs: +(bookkeepingPerStep / 1000).toFixed(1),
  microbenchNs: {
    inputSnapshotPublishConsume: Math.round(publishConsumeNs),
    nearWorkBudgetStamp: Math.round(nearWorkStampNs),
  },
  notes: [
    'primary_fullQueue = step with simCatchupIndex=0 (every system); catchup_tableOnly = index>0 (TABLE clock only).',
    'runner.bookkeepingResidual = advance() total minus instrumented phases minus boundary publish — reserveCompletedTick + consumeLatest queue ops + counters.',
    `Caps under test: MAX_CATCHUP_STEPS=${MAX_CATCHUP_STEPS}, HITCH_FRAME_TICKS=${HITCH_FRAME_TICKS}, HITCH_CATCHUP_STEPS=${HITCH_CATCHUP_STEPS}.`,
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
