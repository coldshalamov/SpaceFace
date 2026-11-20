// scripts/sim-crowd-stress.mjs — F1 crowd-cost fixture (Finish Program Lane 2, packet F1).
//
//   node scripts/sim-crowd-stress.mjs                     swarm wave 15, 600 measured ticks
//   node scripts/sim-crowd-stress.mjs --ticks=300 --warmup=240 --seed=8008 --json
//
// What it measures: the headless 60 Hz sim step (runtime.step) under a real wave-15 Crucible
// crowd — production manifest, production update order, rapier-dynamic physics, sg06 tactical
// AI, flight v3. It reports total sim-step ms p50/p95/p99 plus a per-system ms table so the
// packet's levers can be picked from measurement, not guesses.
//
// Scenario fidelity (same real owners as the browser stress probe,
// scripts/probe-crucible-stress.mjs):
//   * production runtime via createAuthoritativeRuntime({ nodeSafeOnly: true }) — the
//     authoritativeSystemManifest order, not a hand-rolled list;
//   * a real survival/swarm run is begun (run:beginRequested), then forced to the target wave
//     the way the unobserved-browser probe forces it: run.wave := WAVE-1, emit the wave-clear
//     receipt the wave owner emits, click through the draft with its own legal skip; the real
//     wave-15 plan is planned and materialized by the machine (survivalRun → planWave →
//     spawnBudget → survivalArena/swarmArena rooms);
//   * a scripted pilot keeps combat live (aim, close range, hold fire) so projectiles, mines,
//     reinforcements and wrecks accumulate the way a busy round does. The pilot is harness
//     cost and is NOT inside the measured bracket.
//   * deterministic: fixed seed, state.rng/state.simTime only, deterministic draft skip.
//
// Per-system table: each update system's `update` is wrapped once (harness instrumentation on
// the forked instance — same objects the step queue calls) and charged wall time. Instrument
// only inside the measured window.

process.env.SPACEFACE_PLAYER_STORE_DIR = ''; // never mount the real shared store

import { loadavg, cpus, totalmem, freemem } from 'node:os';
import { writeFileSync } from 'node:fs';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEED = Number(arg('seed', 4242));
const WAVE = Number(arg('wave', 15));
const ARENA_ID = arg('arena', 'helios_core');
const RULESET = arg('ruleset', 'swarm');
const KIT_ID = arg('kit', 'mirror_demonstrator');
const WARMUP = Number(arg('warmup', 600));   // ticks of crowd settle after the wave goes active
const TICKS = Number(arg('ticks', 600));
const TOP = Number(arg('top', 30));
const JSON_OUT = arg('json', null);           // --json → stdout blob; --json=path → file
const SEED2 = arg('repeat', 0);               // optional second seed measured in the same run
// Enemy-AI levers (additive; the default invocation prints exactly what it always did):
//   --ships=N      keep the room topped up to N AI ships (Wasp/Zealot/Dart mix through the real
//                  wave materializer), outside the timed bracket — wave 15 alone fields ~11 ships
//   --census       print which brain each AI ship runs (pack / squad frame / solo doctrine)
//   --ai-buckets   split tacticalAI into stack / pack brain / rest, plus planner calls per tick
const SHIPS = Number(arg('ships', 0));
const CENSUS = process.argv.includes('--census');
const AI_BUCKETS = process.argv.includes('--ai-buckets');
//   --pack=off     A/B: fly every Swarm ship on the tactical stack instead of the pack brain
const PACK_OFF = arg('pack', 'on') === 'off';

if (PACK_OFF) (await import('../src/systems/tacticalAI.js')).setPackBrainEnabledForBench(false);
const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
const { createBus } = await import('../src/core/eventBus.js');
const { loadRapierCompatRuntime } = await import('../src/core/rapierCompatRuntime.js');
const { SIM_DT } = await import('../src/core/sim.js');
const { wrapAngle } = await import('../src/core/rng.js');
const { makeShipEntitySpec } = await import('../src/systems/ships.js');
const { applyCombatLabSetup } = await import('../src/ui/sandbox/sandboxSetup.js');
const { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } = await import('../src/data/combatLabSetups.js');
const { validateCombatLabSetup } = await import('../src/contracts/combatLabSetupSchema.js');
const { SURVIVAL_COHORT_TAG, materializeWaveBatch } = await import('../src/systems/waveMaterialization.js');
const { TECH_NODES } = await import('../src/data/tech.js');
const { INERTIAL_SHUNT_TUNING } = await import('../src/data/combatDefs.js');
const { FIELD_FLAGS } = await import('../src/data/fields.js');
const {
  snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps,
} = await import('../src/data/featureFlags.js');

const BIND = {
  forward: ['KeyW'], brake: ['Digit0'], boost: ['ShiftLeft'],
  yawLeft: ['KeyA'], yawRight: ['KeyD'],
};
const RANGE = 150;
const FIRE_RANGE = 700;
const FIRE_ARC = 0.6;

function percentile(values, p) {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function round3(v) { return Math.round(v * 1000) / 1000; }

/** The bench's public-writers tech subsidy (crucibleBench.mjs) — the run's arsenal is
 *  possibility, not campaign research; the grant is returned by unlockTech. */
function unlockAllTech(player, shipsSys, economySys) {
  const researched = new Set(player.researchedNodes || []);
  const remaining = TECH_NODES.filter((n) => !researched.has(n.id));
  const credits = remaining.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (credits > 0 && economySys && typeof economySys.grantCredits === 'function') {
    economySys.grantCredits(credits, 'crowd-stress:tech-budget');
  }
  const rp = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0);
  if (typeof player.researchPoints === 'number') player.researchPoints += rp + 1000;
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (player.researchedNodes.includes(node.id)) continue;
      if (typeof shipsSys.researchable === 'function' && !shipsSys.researchable(node.id)) continue;
      if (shipsSys.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
}

function cohortHostiles(state) {
  const out = [];
  for (const e of state.entityList) {
    if (!e || e.alive === false || e.id === state.playerId) continue;
    if (!(e.data && e.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(e);
  }
  return out;
}

function aiShips(state) {
  let n = 0;
  for (const e of cohortHostiles(state)) if (e.type === 'ship') n++;
  return n;
}

const TOP_UP_MIX = Object.freeze(['wasp_swarmer', 'wasp_swarmer', 'choir_zealot', 'wasp_swarmer',
  'detonator_dart', 'wasp_swarmer']);
const TOP_UP_GATES = Object.freeze(['nw', 'ne', 'se', 'sw']);
/** --ships=N: materialize the shortfall through the real wave owner path (spawn budget, gates,
 *  role stamps). Deterministic: the mix and gates cycle on the batch counter. Harness cost —
 *  callers run it outside the timed bracket. */
function topUpShips(ctx, state, seed, counter) {
  if (!(SHIPS > 0)) return 0;
  // The stress cell measures a full room: lift the live cap to the budget's own hard ceiling.
  if (state.spawnBudget && Number.isFinite(state.spawnBudget.max) && state.spawnBudget.max < 40) {
    state.spawnBudget.max = 40;
  }
  const missing = SHIPS - aiShips(state);
  if (missing <= 0) return 0;
  let made = 0;
  for (let i = 0; i < Math.min(missing, 8); i += 4) {
    const k = counter.n++;
    const r = materializeWaveBatch(ctx, {
      swarm: true, enemyId: TOP_UP_MIX[k % TOP_UP_MIX.length], count: Math.min(4, missing - i),
      wave: WAVE, seed, gateGroup: TOP_UP_GATES[k % TOP_UP_GATES.length], ownerId: 'survival-wave:crowd-stress-topup',
      packageIndex: 90, batchIndex: k,
    });
    made += (r && r.admitted) || 0;
  }
  return made;
}

function aiCensus(state) {
  const by = new Map();
  for (const e of cohortHostiles(state)) {
    if (e.type !== 'ship') continue;
    const ai = (e.data && e.data.ai) || {};
    const path = ai.packBrain === true ? 'pack' : ai.cohortRecipe ? 'cohort'
      : ai.squadRecipe ? 'squadFrame' : ai.combatDoctrineId ? 'soloDoctrine' : 'utility';
    const key = `${e.data.lootTableId || e.data.enemyTypeId} ${path} ${ai.combatDoctrineId || '-'}`;
    by.set(key, (by.get(key) || 0) + 1);
  }
  return [...by].sort().map(([k, n]) => `${String(n).padStart(3)}  ${k}`);
}

function liveEntityCount(state) {
  let n = 0;
  for (const e of state.entityList) if (e && e.alive !== false) n++;
  return n;
}

/** Chase the nearest cohort hostile, hold fire on a wide envelope — keeps bolts, mines and
 *  reinforcements in flight. Deliberately not skilled: cost per tick, not kill efficiency. */
function drivePilot({ state, player, inputSys, aim, tick }) {
  inputSys._keys = inputSys._keys || Object.create(null);
  for (const k of Object.keys(inputSys._keys)) inputSys._keys[k] = false;
  inputSys._m0 = false;
  if (!player || player.alive === false) return null;
  const hostiles = cohortHostiles(state);
  let best = null;
  let bestD = Infinity;
  for (const h of hostiles) {
    const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) return null;
  aim.x = best.pos.x;
  aim.z = best.pos.z;
  const err = wrapAngle(Math.atan2(aim.z - player.pos.z, aim.x - player.pos.x) - player.rot);
  for (const c of (Math.abs(err) > 0.12 ? (err > 0 ? BIND.yawRight : BIND.yawLeft) : [])) {
    inputSys._keys[c] = true;
  }
  if (bestD > RANGE) for (const c of BIND.forward) inputSys._keys[c] = true;
  else if (bestD < RANGE * 0.45) for (const c of BIND.brake) inputSys._keys[c] = true;
  if (bestD > 480 && tick % 240 < 90) for (const c of BIND.boost) inputSys._keys[c] = true;
  if (Math.abs(err) < FIRE_ARC && bestD < FIRE_RANGE) inputSys._m0 = true;
  return { bestD, hostiles: hostiles.length };
}

/** Wrap every forked update instance once; the step queue calls these same objects.
 *  `armed` gates recording — only the measured window is charged. */
function instrumentSystems(runtime) {
  const meters = new Map(); // name -> { calls, ms, max }
  const control = { armed: false };
  const wrap = (instance, label, fn) => {
    if (!instance || typeof fn !== 'function' || fn.__crowdWrapped) return;
    const wrapped = function (...args) {
      if (!control.armed) return fn.apply(this, args);
      const m = meters.get(label) || meters.set(label, { calls: 0, ms: 0, max: 0 }).get(label);
      const t0 = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        const d = performance.now() - t0;
        m.calls += 1; m.ms += d; if (d > m.max) m.max = d;
      }
    };
    wrapped.__crowdWrapped = true;
    return wrapped;
  };
  const core = runtime.getSystem('core');
  if (core) {
    if (typeof core.preStep === 'function') core.preStep = wrap(core, 'core.preStep', core.preStep);
    if (typeof core.lifetimeSweep === 'function') core.lifetimeSweep = wrap(core, 'core.lifetimeSweep', core.lifetimeSweep);
  }
  const order = (runtime.manifest && runtime.manifest.authoritativeUpdateOrder) || [];
  let wrappedCount = 0;
  for (const def of order) {
    const name = def && def.name;
    if (!name) continue;
    const instance = runtime.getSystem(name);
    if (!instance || typeof instance.update !== 'function') continue;
    const wrapped = wrap(instance, name, instance.update);
    if (wrapped) { instance.update = wrapped; wrappedCount++; }
  }
  return { meters, control, wrappedCount, wrap };
}

/** R2 — per-listener fanout attribution for physics:impact. The emit path's remaining cost is
 *  the ~30-listener synchronous fanout, and the per-system table cannot split it (listener time
 *  is charged to physics.emitImpacts, not to the owning system row). Wrapping bus.on BEFORE the
 *  runtime subscribes labels every listener by its registration site (first stack frame outside
 *  the bus/this harness) and times it only while `ctl.armed`. The wrapper preserves argument and
 *  call-order identity exactly — the sim sees the same dispatch; systems that later off() by
 *  original reference are unaffected inside the measured window (no mid-run unbinds). */
function instrumentImpactFanout(bus, ctl, meters) {
  const realOn = bus.on;
  const labelFor = () => {
    const stack = new Error().stack || '';
    for (const line of stack.split('\n')) {
      if (line.includes('sim-crowd-stress.mjs')) {
        // The harness's own census subscriber is the only legit label-less registration.
        if (line.includes('runCell')) return 'harness:census';
        continue; // skip labelFor/bus.on frames — they live in this file
      }
      if (line.includes('eventBus.js') || !line.includes('src/')) continue;
      const m = line.match(/src[\/\\]([^)\s]+)/);
      if (m) return m[1];
    }
    return 'unknown';
  };
  bus.on = function (event, fn, ...rest) {
    if (event !== 'physics:impact' || typeof fn !== 'function') return realOn.call(this, event, fn, ...rest);
    const label = labelFor();
    const wrapped = function (p, e) {
      if (!ctl.armed) return fn.call(this, p, e);
      const m = meters.get(label) || meters.set(label, { calls: 0, ms: 0, max: 0 }).get(label);
      const t0 = performance.now();
      try {
        return fn.call(this, p, e);
      } finally {
        const d = performance.now() - t0;
        m.calls += 1; m.ms += d; if (d > m.max) m.max = d;
      }
    };
    return realOn.call(this, event, wrapped, ...rest);
  };
}

/** R3 — sub-attribute collisionConsequences._onImpact (the top fanout row) into its phases:
 *  admit/cooldown, causal-provenance read, whip pre-check, deferred queue, resolve. Wraps the
 *  system's own `this.` methods (including the two pure delegation seams _contactProvenance /
 *  _potentialWhipContact added for exactly this) with the same armed-gated timer as the
 *  listener fanout. Nested rows double-count into their parents — _resolveTarget runs inside
 *  _resolveContact — noted on the labels. */
function instrumentConsequencePhases(runtime, ctl, meters) {
  const sys = runtime.getSystem && runtime.getSystem('collisionConsequences');
  if (!sys) return 0;
  const labels = {
    _onImpact: 'ccPhase:onImpact.total',
    _admitPair: 'ccPhase:admitPair',
    _contactProvenance: 'ccPhase:contactProvenance',
    _potentialWhipContact: 'ccPhase:whipCheck',
    _deferCraftContact: 'ccPhase:deferContact',
    _resolveContact: 'ccPhase:resolveContact',
    _resolveTarget: 'ccPhase:resolveTarget(nested in resolveContact)',
    _routeImpactDamage: 'ccPhase:routeDamage(nested)',
    _maybeTearOffPlating: 'ccPhase:tearOff(nested)',
    _resolvePendingCraftContact: 'ccPhase:resolvePending(queued-event)',
    _resolveOrchardContactsAtTick: 'ccPhase:resolveOrchard(queued-event)',
    _resolveStrandedCraftContactsBefore: 'ccPhase:resolveStranded(update)',
    _onWhipImpact: 'ccPhase:onWhipImpact(tether-event)',
  };
  let wrapped = 0;
  for (const [method, label] of Object.entries(labels)) {
    if (typeof sys[method] !== 'function' || sys[method].__crowdWrapped) continue;
    const orig = sys[method];
    const wrappedFn = function (...args) {
      if (!ctl.armed) return orig.apply(this, args);
      const m = meters.get(label) || meters.set(label, { calls: 0, ms: 0, max: 0, admits: 0 }).get(label);
      const t0 = performance.now();
      try {
        const ret = orig.apply(this, args);
        if (method === '_admitPair' && ret === true) m.admits += 1;
        return ret;
      } finally {
        const d = performance.now() - t0;
        m.calls += 1; m.ms += d; if (d > m.max) m.max = d;
      }
    };
    wrappedFn.__crowdWrapped = true;
    sys[method] = wrappedFn;
    wrapped += 1;
  }
  return wrapped;
}

/** Sub-attribute the physics system's inside cost: the rapier-dynamic update is one row in the
 *  per-system table, but the lever decision needs step vs sync vs impact-emit vs sweep splits.
 *  These wrap instance methods the same way as instrumentSystems. */
function instrumentPhysicsInternals(physicsSys, wrapInto) {
  const targets = [
    [physicsSys, '_syncSg02DynamicAuthorityEntities', 'physics.syncEntities'],
    [physicsSys, '_reconcileCombatPhysicsBeforeStep', 'physics.reconcileCombat'],
    [physicsSys, '_emitSg02ContactImpacts', 'physics.emitImpacts'],
    [physicsSys, '_syncDynamicSpatialHash', 'physics.spatialHash'],
    [physicsSys, 'sweepProjectiles', 'physics.sweepProjectiles'],
    [physicsSys, 'collectPickups', 'physics.collectPickups'],
    [physicsSys, 'updateDockRange', 'physics.dockRange'],
    [physicsSys, 'tickPhysicalEffects', 'physics.physicalEffects'],
    [physicsSys, 'reconcileMachineryBeforePhysics', 'physics.reconcileMachinery'],
    [physicsSys, 'reconcileLatchBeforePhysics', 'physics.reconcileLatch'],
  ];
  for (const [obj, method, label] of targets) {
    if (!obj || typeof obj[method] !== 'function') continue;
    const wrapped = wrapInto(obj, label, obj[method]);
    if (wrapped) obj[method] = wrapped;
  }
  const owner = physicsSys && physicsSys._sg02;
  if (owner && typeof owner.syncFromEntityLayers === 'function') {
    const wrapped = wrapInto(owner, 'physics.ownerSyncFromLayers(rapier)', owner.syncFromEntityLayers);
    if (wrapped) owner.syncFromEntityLayers = wrapped;
  }
  if (owner && typeof owner.syncFromEntities === 'function') {
    const wrapped = wrapInto(owner, 'physics.ownerSync(rapier)', owner.syncFromEntities);
    if (wrapped) owner.syncFromEntities = wrapped;
  }
  if (owner && typeof owner._captureContactImpacts === 'function') {
    const wrapped = wrapInto(owner, 'physics.ownerCaptureImpacts', owner._captureContactImpacts);
    if (wrapped) owner._captureContactImpacts = wrapped;
  }
  if (owner && typeof owner.step === 'function') {
    const wrapped = wrapInto(owner, 'physics.ownerStep(rapier)', owner.step);
    if (wrapped) owner.step = wrapped;
  }
}

/** Split the authoritative Rapier-owner step at public WASM binding boundaries.
 *  These wrappers preserve arguments/return values and are armed only for the
 *  measured window. `contactPair` is used while translating force events; body
 *  create/remove calls expose measured-window shape rebuilds. */
function instrumentRapierMethods(RAPIER, ctl, meters) {
  const restore = [];
  const wrap = (prototype, method, label) => {
    if (!prototype || typeof prototype[method] !== 'function') return;
    const original = prototype[method];
    if (original.__crowdRapierWrapped) return;
    const wrapped = function (...args) {
      if (!ctl.armed) return original.apply(this, args);
      const meter = meters.get(label) || meters.set(label, { calls: 0, ms: 0, max: 0 }).get(label);
      const t0 = performance.now();
      try { return original.apply(this, args); }
      finally {
        const elapsed = performance.now() - t0;
        meter.calls += 1;
        meter.ms += elapsed;
        if (elapsed > meter.max) meter.max = elapsed;
      }
    };
    wrapped.__crowdRapierWrapped = true;
    prototype[method] = wrapped;
    restore.push(() => { if (prototype[method] === wrapped) prototype[method] = original; });
  };
  wrap(RAPIER.World?.prototype, 'step', 'physics.rapier.world.step');
  wrap(RAPIER.World?.prototype, 'contactPairsWith', 'physics.rapier.world.contactPairsWith');
  wrap(RAPIER.World?.prototype, 'contactPair', 'physics.rapier.world.contactPair');
  wrap(RAPIER.EventQueue?.prototype, 'drainContactForceEvents', 'physics.rapier.eventQueue.drainContactForceEvents');
  for (const method of ['createRigidBody', 'createCollider', 'removeCollider', 'removeRigidBody']) {
    wrap(RAPIER.World?.prototype, method, `physics.rapier.world.${method}`);
  }
  return () => { for (let i = restore.length - 1; i >= 0; i--) restore[i](); };
}

/** Host-busy note: loadavg is 0 on Windows, so also time a fixed CPU calibration loop. */
function hostBusyNote() {
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < 3e6; i++) { acc += (i * 2654435761) % 97; acc |= 0; }
  const calibrationMs = performance.now() - t0;
  return {
    loadavg: loadavg().map((v) => Math.round(v * 100) / 100),
    cpu: (cpus()[0] || {}).model || 'unknown',
    memFreeMB: Math.round(freemem() / 1048576),
    memTotalMB: Math.round(totalmem() / 1048576),
    cpuCalibrationMs: Math.round(calibrationMs * 100) / 100,
    node: process.version,
    _acc: acc,
  };
}

async function runCell({ seed }) {
  const aim = { x: 0, z: 0 };
  const bus = createBus();
  // Fanout attribution must intercept registrations before the runtime's systems subscribe.
  const fanoutCtl = { armed: false };
  const fanoutMeters = new Map();
  instrumentImpactFanout(bus, fanoutCtl, fanoutMeters);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    bus,
    helpers: { raycastToPlane: () => ({ x: aim.x, z: aim.z }) },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  // Browser parity for diagnostics: in the live game these publish gates are flag-off by
  // default (physics.js shouldPublishSg02*). Headless used to force them on — the F1 opt-out
  // makes the fixture pay what the production main thread pays. --diag=on restores it.
  if (arg('diag', 'off') !== 'on') {
    state.physicsRuntime = state.physicsRuntime || {};
    state.physicsRuntime.publishSg02Telemetry = false;
    state.physicsRuntime.publishSg02Snapshot = false;
  }

  const ctx = {
    state,
    bus,
    helpers: runtime.getHelpers(),
    registry: { get: (n) => runtime.getSystem(n) },
  };
  const shipsSys = runtime.getSystem('ships');
  const economySys = runtime.getSystem('economy');
  const physicsSys = runtime.getSystem('physics');
  const inputSys = runtime.getSystem('input');
  const { meters, control: meterCtl, wrappedCount, wrap } = instrumentSystems(runtime);
  const RAPIER = await loadRapierCompatRuntime();
  const restoreRapierMethods = instrumentRapierMethods(RAPIER, meterCtl, meters);
  const ccPhaseWrapped = instrumentConsequencePhases(runtime, fanoutCtl, fanoutMeters);
  const impactStats = {
    emits: 0, pairs: new Set(), ticksWithImpacts: 0, maxPerTick: 0, _perTick: 0, _lastTick: -1,
    // R3 — weapons shunt gate estimate: how many emits the minClosingSpeed pre-gate would skip.
    closing: { missing: 0, belowShuntMin: 0, atOrAboveShuntMin: 0 },
  };
  bus.on('physics:impact', (p) => {
    if (!meterCtl.armed) return;
    impactStats.emits += 1;
    if (p && p.pairKey) impactStats.pairs.add(p.pairKey);
    const cs = p && p.preSolveClosingSpeed;
    if (!Number.isFinite(cs)) impactStats.closing.missing += 1;
    else if (Math.max(0, cs) < INERTIAL_SHUNT_TUNING.minClosingSpeed) impactStats.closing.belowShuntMin += 1;
    else impactStats.closing.atOrAboveShuntMin += 1;
    const t = p && Number.isFinite(p.tick) ? p.tick : -1;
    if (t !== impactStats._lastTick) {
      impactStats._lastTick = t;
      if (impactStats._perTick > impactStats.maxPerTick) impactStats.maxPerTick = impactStats._perTick;
      impactStats._perTick = 1;
      impactStats.ticksWithImpacts += 1;
    } else {
      impactStats._perTick += 1;
    }
  });

  const prevFieldsEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const deltas = [];
  const ents = [];
  const hostilesN = [];
  const shipsN = [];
  let aiCensusLines = null;
  let aiBucketCtl = null;
  try {
    const previousFlags = snapshotFeatureMaps();
    try {
      applyFeatureConfigToMaps(runtime.config.features);
      unlockAllTech(state.player, shipsSys, economySys);

      const starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === KIT_ID);
      const arena = COMBAT_LAB_ARENAS.find((a) => a.id === ARENA_ID);
      if (!starter) throw new Error(`crowd-stress: unknown kit "${KIT_ID}"`);
      if (!arena) throw new Error(`crowd-stress: unknown arena "${ARENA_ID}"`);

      const spawned = runtime.spawn(makeShipEntitySpec(starter.hullId, {
        isPlayer: true,
        player: state.player,
        fittings: [],
        pos: arena.spawnPos,
        rot: 0,
        team: 0,
      }));
      state.playerId = spawned.id;

      if ((await physicsSys.prepareBackend(state, { reset: true })) !== true) {
        throw new Error('crowd-stress: physics.prepareBackend did not return true');
      }
      instrumentPhysicsInternals(physicsSys, wrap);

      const setup = validateCombatLabSetup({
        schema: 'spaceface.combatLabSetup.v1',
        hullId: starter.hullId,
        loadout: starter.loadout.map((e) => ({ slotIndex: e.slotIndex, defId: e.defId })),
        enemyPackageId: 'wasp_flight',
        arenaId: ARENA_ID,
        seed,
        wave: 1,
      });
      if (!setup.ok || !setup.value) {
        throw new Error(`crowd-stress: combat lab setup invalid: ${setup.issues && setup.issues[0] && setup.issues[0].message}`);
      }

      bus.emit('run:beginRequested', { kind: 'survival', ruleset: RULESET, seed, arenaId: ARENA_ID });
      const fitReceipt = applyCombatLabSetup(ctx, setup.value);
      if (!fitReceipt || fitReceipt.notFitted.length !== 0) {
        throw new Error(`crowd-stress: kit did not fit: ${JSON.stringify(fitReceipt && fitReceipt.notFitted)}`);
      }
      bus.emit('run:loadoutReady', {});

      const player = () => state.entityList.find((e) => e && e.id === state.playerId) || null;
      // loadout → arena_intro (120 ticks) → wave_intro (90) → active; the machine's own
      // phase timers advance it (same as the browser when the intro UI is absent).
      let guard = 0;
      while (state.run && state.run.phase !== 'active' && guard++ < 400) {
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        runtime.step(SIM_DT);
      }
      if (!state.run || state.run.phase !== 'active') {
        throw new Error(`crowd-stress: run never reached active (phase=${state.run && state.run.phase})`);
      }

      // Force the target wave exactly like the unobserved browser probe: claim the wave
      // before it as cleared, release live hostiles to the lifetime sweep (the probe does
      // this — otherwise wave-1 stragglers survive into the measured "wave-15" crowd), let
      // the machine plan/materialize the real wave, skip the draft.
      state.run.wave = WAVE - 1;
      for (const e of state.entities.values()) {
        if (e && e.alive !== false && e.type === 'ship' && e.id !== state.playerId
          && e.data && e.data.combat && e.data.combat.hostile !== false) e.alive = false;
      }
      bus.emit('run:waveCleared', { wave: WAVE - 1 });
      let jumped = false;
      for (let i = 0; i < 2400 && !jumped; i++) {
        // A null offerId is the draft's own legal skip; a no-op while no draft is open.
        bus.emit('run:draftPickRequested', { offerId: null });
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        runtime.step(SIM_DT);
        if (state.run.phase === 'active' && state.run.wave === WAVE) jumped = true;
      }
      if (!jumped) {
        throw new Error(`crowd-stress: wave ${WAVE} never went active (phase=${state.run.phase} wave=${state.run.wave})`);
      }

      // Warmup: the spawn schedule and reinforcement ramp fill the room; wrecks accumulate.
      const topUp = { n: 0 };
      for (let i = 0; i < WARMUP; i++) {
        bus.emit('run:draftPickRequested', { offerId: null });
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        if (i % 30 === 0) topUpShips(ctx, state, seed, topUp);
        runtime.step(SIM_DT);
      }

      if (CENSUS) aiCensusLines = aiCensus(state);
      if (AI_BUCKETS) aiBucketCtl = instrumentAIBuckets(runtime);
      meterCtl.armed = true;
      fanoutCtl.armed = true;
      if (aiBucketCtl) aiBucketCtl.armed = true;
      for (let i = 0; i < TICKS; i++) {
        bus.emit('run:draftPickRequested', { offerId: null });
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        if ((SHIPS > 0) && i % 30 === 0) topUpShips(ctx, state, seed, topUp);
        const t0 = performance.now();
        runtime.step(SIM_DT);
        deltas.push(performance.now() - t0);
        ents.push(liveEntityCount(state));
        hostilesN.push(cohortHostiles(state).length);
        shipsN.push(aiShips(state));
      }
      meterCtl.armed = false;
      fanoutCtl.armed = false;
      if (aiBucketCtl) aiBucketCtl.armed = false;
    } finally {
      restoreFeatureMaps(previousFlags);
    }
  } finally {
    FIELD_FLAGS.enabled = prevFieldsEnabled;
    try { runtime.dispose(); }
    finally { restoreRapierMethods(); }
  }

  const sum = deltas.reduce((s, d) => s + d, 0);
  const systems = [...meters.entries()]
    .map(([name, m]) => ({
      name,
      calls: m.calls,
      totalMs: round3(m.ms),
      meanMs: round3(m.ms / (m.calls || 1)),
      maxMs: round3(m.max),
      sharePct: Math.round((m.ms / sum) * 1000) / 10,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
  const impactFanout = [...fanoutMeters.entries()]
    .map(([name, m]) => ({
      listener: name,
      calls: m.calls,
      totalMs: round3(m.ms),
      meanUs: Math.round((m.ms / (m.calls || 1)) * 1e3 * 10) / 10,
      maxMs: round3(m.max),
      ...(m.admits ? { admits: m.admits } : {}),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
  return {
    seed,
    wave: WAVE,
    ruleset: RULESET,
    arena: ARENA_ID,
    ticks: TICKS,
    warmup: WARMUP,
    systemsInstrumented: wrappedCount,
    ccPhasesInstrumented: ccPhaseWrapped,
    simStepMs: {
      mean: round3(sum / deltas.length),
      p50: round3(percentile(deltas, 0.5)),
      p95: round3(percentile(deltas, 0.95)),
      p99: round3(percentile(deltas, 0.99)),
      max: round3(Math.max(...deltas)),
    },
    entities: {
      mean: Math.round((ents.reduce((s, v) => s + v, 0) / ents.length) * 10) / 10,
      max: Math.max(...ents),
      hostilesMean: Math.round((hostilesN.reduce((s, v) => s + v, 0) / hostilesN.length) * 10) / 10,
      hostilesMax: Math.max(...hostilesN),
    },
    impacts: {
      emits: impactStats.emits,
      uniquePairs: impactStats.pairs.size,
      ticksWithImpacts: impactStats.ticksWithImpacts,
      // The running tick's count only folds into maxPerTick on the NEXT tick transition;
      // the last stepped tick is complete (steps are atomic) so fold its count in here.
      maxPerTick: Math.max(impactStats.maxPerTick, impactStats._perTick),
      perTickMean: round3(impactStats.emits / TICKS),
      // Emits the weapons inertial-shunt listener's minClosingSpeed gate would skip (R3).
      preSolveClosingSpeed: { ...impactStats.closing },
    },
    impactFanout,
    systems,
    ...((SHIPS > 0 || CENSUS || AI_BUCKETS) ? { ai: {
      shipsMean: Math.round((shipsN.reduce((s, v) => s + v, 0) / (shipsN.length || 1)) * 10) / 10,
      shipsMax: shipsN.length ? Math.max(...shipsN) : 0,
      census: aiCensusLines,
      buckets: aiBucketCtl ? aiBucketCtl.report(TICKS, systems.find((s) => s.name === 'tacticalAI')) : null,
    } } : {}),
  };
}

/** --ai-buckets: wrap the live stack's update and planner, and the pack brain if present. */
function instrumentAIBuckets(runtime) {
  const tai = runtime.getSystem('tacticalAI') || runtime.getSystem('aiSlot');
  const ctl = { armed: false, stackMs: 0, packMs: 0, plans: 0 };
  const stack = tai && tai.stack;
  if (stack) {
    const up = stack.update.bind(stack);
    stack.update = (...a) => {
      if (!ctl.armed) return up(...a);
      const t0 = performance.now();
      try { return up(...a); } finally { ctl.stackMs += performance.now() - t0; }
    };
    const plan = stack.maneuver.plan.bind(stack.maneuver);
    stack.maneuver.plan = (a) => { if (ctl.armed) ctl.plans++; return plan(a); };
  }
  const pack = tai && tai.pack;
  if (pack && typeof pack.step === 'function') {
    const step = pack.step.bind(pack);
    pack.step = (...a) => {
      if (!ctl.armed) return step(...a);
      const t0 = performance.now();
      try { return step(...a); } finally { ctl.packMs += performance.now() - t0; }
    };
  }
  ctl.report = (ticks, row) => {
    const total = row ? row.totalMs : 0;
    return {
      tacticalAIMeanMs: round3(total / ticks),
      stackMeanMs: round3(ctl.stackMs / ticks),
      packMeanMs: round3(ctl.packMs / ticks),
      restMeanMs: round3((total - ctl.stackMs - ctl.packMs) / ticks),
      planCallsPerTick: round3(ctl.plans / ticks),
    };
  };
  return ctl;
}

const hostBusy = hostBusyNote();
const cells = [];
cells.push(await runCell({ seed: SEED }));
if (SEED2) cells.push(await runCell({ seed: Number(SEED2) }));

const report = { schema: 'spaceface.simCrowdStress.v1', hostBusy, cells };
if (JSON_OUT !== null) {
  const blob = JSON.stringify(report, null, 1);
  if (JSON_OUT === '' || JSON_OUT === 'true') console.log(blob);
  else { writeFileSync(JSON_OUT, blob); console.log(`wrote ${JSON_OUT}`); }
}

for (const cell of cells) {
  console.log(`\n== sim-crowd-stress seed=${cell.seed} ${cell.ruleset} wave=${cell.wave} arena=${cell.arena} ticks=${cell.ticks} warmup=${cell.warmup}`);
  console.log(`host-busy: cpu="${hostBusy.cpu}" loadavg=${JSON.stringify(hostBusy.loadavg)} memFree=${hostBusy.memFreeMB}MB cpuCalibration=${hostBusy.cpuCalibrationMs}ms node=${hostBusy.node}`);
  console.log(`entities: mean=${cell.entities.mean} max=${cell.entities.max} hostiles mean=${cell.entities.hostilesMean} max=${cell.entities.hostilesMax} systemsInstrumented=${cell.systemsInstrumented}`);
  console.log(`physics:impact emits=${cell.impacts.emits} uniquePairs=${cell.impacts.uniquePairs} ticksWithImpacts=${cell.impacts.ticksWithImpacts}/${cell.ticks} maxPerTick=${cell.impacts.maxPerTick} meanPerTick=${cell.impacts.perTickMean}`);
  if (cell.impacts.preSolveClosingSpeed) {
    const c = cell.impacts.preSolveClosingSpeed;
    console.log(`preSolveClosingSpeed: belowShuntMin(40)=${c.belowShuntMin} atOrAbove=${c.atOrAboveShuntMin} missing=${c.missing} ccPhases=${cell.ccPhasesInstrumented}`);
  }
  if (cell.ai) {
    const b = cell.ai.buckets;
    console.log(`ai ships: mean=${cell.ai.shipsMean} max=${cell.ai.shipsMax}${SHIPS > 0 ? ` target=${SHIPS}` : ''}`);
    if (b) console.log(`ai buckets ms/tick: tacticalAI=${b.tacticalAIMeanMs} stack=${b.stackMeanMs} pack=${b.packMeanMs} rest=${b.restMeanMs} planCalls/tick=${b.planCallsPerTick}`);
    if (cell.ai.census) { console.log('ai census (enemy path doctrine):'); for (const l of cell.ai.census) console.log('  ' + l); }
  }
  console.log(`sim-step ms: mean=${cell.simStepMs.mean} p50=${cell.simStepMs.p50} p95=${cell.simStepMs.p95} p99=${cell.simStepMs.p99} max=${cell.simStepMs.max}`);
  console.log('per-system (top ' + TOP + ' by total ms):');
  console.log('  ' + 'system'.padEnd(34) + 'calls'.padStart(7) + 'totalMs'.padStart(10) + 'meanMs'.padStart(9) + 'maxMs'.padStart(9) + 'share%'.padStart(8));
  for (const row of cell.systems.slice(0, TOP)) {
    console.log('  ' + row.name.padEnd(34) + String(row.calls).padStart(7) + String(row.totalMs).padStart(10) + String(row.meanMs).padStart(9) + String(row.maxMs).padStart(9) + String(row.sharePct).padStart(8));
  }
  if (cell.impactFanout && cell.impactFanout.length) {
    console.log('physics:impact fanout (listener registration site, armed window only):');
    console.log('  ' + 'listener'.padEnd(44) + 'calls'.padStart(7) + 'totalMs'.padStart(10) + 'meanUs'.padStart(9) + 'maxMs'.padStart(9) + 'admits'.padStart(8));
    for (const row of cell.impactFanout.slice(0, Math.min(TOP, cell.impactFanout.length))) {
      console.log('  ' + row.listener.padEnd(44) + String(row.calls).padStart(7) + String(row.totalMs).padStart(10) + String(row.meanUs).padStart(9) + String(row.maxMs).padStart(9) + String(row.admits || '').padStart(8));
    }
  }
}
