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

const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
const { createBus } = await import('../src/core/eventBus.js');
const { SIM_DT } = await import('../src/core/sim.js');
const { wrapAngle } = await import('../src/core/rng.js');
const { makeShipEntitySpec } = await import('../src/systems/ships.js');
const { applyCombatLabSetup } = await import('../src/ui/sandbox/sandboxSetup.js');
const { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } = await import('../src/data/combatLabSetups.js');
const { validateCombatLabSetup } = await import('../src/contracts/combatLabSetupSchema.js');
const { SURVIVAL_COHORT_TAG } = await import('../src/systems/waveMaterialization.js');
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
    const wrapped = function (dt, state) {
      if (!control.armed) return fn.call(this, dt, state);
      const m = meters.get(label) || meters.set(label, { calls: 0, ms: 0, max: 0 }).get(label);
      const t0 = performance.now();
      try {
        return fn.call(this, dt, state);
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
  if (owner && typeof owner.step === 'function') {
    const wrapped = wrapInto(owner, 'physics.ownerStep(rapier)', owner.step);
    if (wrapped) owner.step = wrapped;
  }
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
      for (let i = 0; i < WARMUP; i++) {
        bus.emit('run:draftPickRequested', { offerId: null });
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        runtime.step(SIM_DT);
      }

      meterCtl.armed = true;
      fanoutCtl.armed = true;
      for (let i = 0; i < TICKS; i++) {
        bus.emit('run:draftPickRequested', { offerId: null });
        drivePilot({ state, player: player(), inputSys, aim, tick: state.tick | 0 });
        const t0 = performance.now();
        runtime.step(SIM_DT);
        deltas.push(performance.now() - t0);
        ents.push(liveEntityCount(state));
        hostilesN.push(cohortHostiles(state).length);
      }
      meterCtl.armed = false;
      fanoutCtl.armed = false;
    } finally {
      restoreFeatureMaps(previousFlags);
    }
  } finally {
    FIELD_FLAGS.enabled = prevFieldsEnabled;
    runtime.dispose();
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
      meanUs: Math.round((m.ms / (m.calls || 1)) * 1e6 * 10) / 10,
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
  };
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
