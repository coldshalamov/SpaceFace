// scripts/probe-crucible-perf.mjs — PQ-133.04 Foundry p95 probe (the receipt's DEFERRED gate).
//
//   node scripts/probe-crucible-perf.mjs
//
// Measures the packet's performance bar (design/program/roadmap/active/PQ-133.md Performance:
// "p95 <= 16.7 ms ... the Foundry at wave 10") against the TEN AUTHORED BLOCK WAVES of the
// Foundry arena (helios_core), wave ten included, on three fixed seeds.
//
// WHY THIS SHAPE (the R4 probe could not produce the gate's number — measured 2026-09-25):
//   * it drove scripts/lib/bench/crucibleBench.mjs, whose loop hardcodes ruleset 'swarm'
//     (crucibleBench.mjs:380), so even a successful run measured generated swarm waves,
//     never the authored wave-ten block the gate names;
//   * its chase-bot stalled in the Foundry room: seed 4242 ran 36000 ticks, never left
//     wave 1 (stop=tick_cap wave=1), stopped firing at tick ~1300 with ten hostiles alive —
//     the probe measured a wave-1 stalemate with accumulating bodies, at p95 107.77 ms.
//
// This rewrite keeps the honest bracket of the old instrument (per-tick wall delta around the
// scripted pilot + runtime.step — a sim-side CPU UPPER BOUND: nodeSafeOnly, no renderer, so it
// is not a render-side frame time) and fixes the scenario: each wave of the authored block is
// measured as its own cell through the REAL owners only —
//   * the wave plan comes from the PURE planner (planWave) with the same arguments
//     survivalRun._planCurrentWaveIntro passes (survivalRun.js:362-373);
//   * the plan reaches the room and the spawner the way the machine delivers it:
//     `run:wavePlanned { wave, plan }` — the same receipt test/pq-133-04-foundry.test.mjs uses;
//     survivalWave materializes through spawnBudget (survivalWave.js:303) and survivalArena
//     installs the wave-N room off plan.arenaPhase (survivalArena.js:908, teardown-then-rearm);
//   * the run machine cannot advance underneath the cell: survivalRun only honors a wave-clear
//     receipt for the wave IT planned (survivalRun.js:327), and it never plans these cells'
//     waves — the phase stays 'active' and run.wave stays 1 for the whole cell (asserted).
// The pilot's job is to keep combat live (aim, close range, hold fire on a wide envelope), not
// to win; killing efficiency is not a performance quantity. Waves never "clear" mid-window, so
// no draft/refit/cleanup tick can pollute a measurement.
//
// Output: one line per (seed, wave) cell, then EXACTLY TWO final lines:
//   WAVE10_P95_MS=<nearest-rank p95 over every measured tick of every wave-10 cell>
//   GATE_16_7_MS=<PASS|FAIL>
// Nothing prints after GATE_16_7_MS.

// The player-save drawer stays shut: this probe must never mount the real shared store.
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const ARENA_ID = 'helios_core';
const KIT_ID = 'mirror_demonstrator'; // the authored three-spec Pulse direct/Bank/Smart kit
const SEEDS = [4242, 8008, 13502];
const WAVES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The wave schedule completes within 201 materializer updates (test/pq-133-04-foundry.test.mjs
// "ten wave schedules materialize under the unchanged cap"); the settled board is what the
// window then measures — steady wave-N combat, every package alive.
const SETTLE_TICKS = 210;
const MEASURE_TICKS = 600; // 10 sim-seconds of steady wave-N combat per cell
const SIM_BUDGET_MS = 16.7;

const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
const { createBus } = await import('../src/core/eventBus.js');
const { SIM_DT } = await import('../src/core/sim.js');
const { wrapAngle } = await import('../src/core/rng.js');
const { makeShipEntitySpec } = await import('../src/systems/ships.js');
const { applyCombatLabSetup } = await import('../src/ui/sandbox/sandboxSetup.js');
const { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } = await import('../src/data/combatLabSetups.js');
const { validateCombatLabSetup } = await import('../src/contracts/combatLabSetupSchema.js');
const { SURVIVAL_COHORT_TAG } = await import('../src/systems/waveMaterialization.js');
const { planWave } = await import('../src/systems/survivalWavePlanner.js');
const { actIndexForWave, difficultyForWave } = await import('../src/data/survivalActs.js');
const { normalizeMutators } = await import('../src/systems/survivalMutators.js');
const { TECH_NODES } = await import('../src/data/tech.js');
const { FIELD_FLAGS } = await import('../src/data/fields.js');
const {
  snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps,
} = await import('../src/data/featureFlags.js');
const { realPathProof } = await import('./lib/bench/realPath.mjs');

// Same bindings the Crucible bench's scripted pilot presses (crucibleBench.mjs:70) — the real
// input device state, never a write into state.input.
const BIND = {
  forward: ['KeyW'], brake: ['Digit0'], boost: ['ShiftLeft'],
  yawLeft: ['KeyA'], yawRight: ['KeyD'],
};
const RANGE = 150;      // bench pilot's hold distance
const FIRE_RANGE = 700; // wide envelope: keep bolts (and ricochets) in flight
const FIRE_ARC = 0.6;

function nearestRankP95(values) {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}
function percentile(values, p) {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function round2(value) {
  return Math.round(value * 100) / 100;
}

/** The bench's public-writers tech subsidy (crucibleBench.mjs:715), copied verbatim in shape:
 *  the run's arsenal is possibility, not campaign research; the grant is returned by unlockTech. */
function unlockAllTech(player, shipsSys, economySys) {
  const researched = new Set(player.researchedNodes || []);
  const remaining = TECH_NODES.filter((n) => !researched.has(n.id));
  const credits = remaining.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (credits > 0 && economySys && typeof economySys.grantCredits === 'function') {
    economySys.grantCredits(credits, 'probe:tech-budget');
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

/** Keep the fight live: chase the nearest cohort hostile, hold fire on a wide envelope.
 *  Deliberately not skilled — the probe measures per-tick cost, not kill efficiency. */
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

function stepTicks(runtime, state, n, onTick = null) {
  const inputSys = runtime.getSystem('input');
  const aim = { x: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const player = state.entityList.find((e) => e && e.id === state.playerId) || null;
    const seen = drivePilot({ state, player, inputSys, aim, tick: state.tick | 0 });
    runtime.step(SIM_DT);
    if (onTick) onTick(seen);
  }
}

/**
 * One wave cell: fresh production runtime, real begin (block ruleset), wave 1 materializes and
 * is emptied through the real damage owner, then the authored wave-N plan is delivered through
 * the machine's own receipt. Returns { mean, p50, p95, cohort, wave, seed, samples }.
 */
async function measureWaveCell({ seed, wave }) {
  const bus = createBus();
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    bus,
    helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';

  const ctx = {
    state,
    bus,
    helpers: runtime.getHelpers(),
    registry: { get: (n) => runtime.getSystem(n) },
  };
  const shipsSys = runtime.getSystem('ships');
  const economySys = runtime.getSystem('economy');
  const physicsSys = runtime.getSystem('physics');
  const combatSys = runtime.getSystem('combat');

  const prevFieldsEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const previousFlags = snapshotFeatureMaps();
    try {
      // The feature window the bench wraps its own boot in (crucibleBench.mjs:293-315) — SG-02
      // must be built with contact capture ON or every contact number is a blank gauge.
      applyFeatureConfigToMaps(runtime.config.features);

      unlockAllTech(state.player, shipsSys, economySys);

      const starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === KIT_ID);
      const arena = COMBAT_LAB_ARENAS.find((a) => a.id === ARENA_ID);
      if (!starter) throw new Error(`probe: unknown kit "${KIT_ID}"`);
      if (!arena) throw new Error(`probe: unknown arena "${ARENA_ID}"`);

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
        throw new Error('probe: physics.prepareBackend did not return true — not the real path');
      }
      if (realPathProof(runtime).contactCaptureEnabled !== true) {
        throw new Error('probe: SG-02 was built with contact capture OFF — blank gauge');
      }

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
        throw new Error(`probe: combat lab setup invalid: ${setup.issues && setup.issues[0] && setup.issues[0].message}`);
      }

      bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'block', seed, arenaId: ARENA_ID });
      const fitReceipt = applyCombatLabSetup(ctx, setup.value);
      if (!fitReceipt || fitReceipt.notFitted.length !== 0) {
        throw new Error(`probe: kit did not fit: ${JSON.stringify(fitReceipt && fitReceipt.notFitted)}`);
      }
      bus.emit('run:loadoutReady', {});

      // Walk the real machine to active (intro is one tick each in sim terms).
      let guard = 0;
      while (state.run && state.run.phase !== 'active' && guard++ < 20) {
        runtime.step(SIM_DT);
      }
      if (!state.run || state.run.phase !== 'active') {
        throw new Error(`probe: run never reached active (phase=${state.run && state.run.phase})`);
      }

      // Empty wave 1 through the real damage owner; entity:destroyed releases the reservations
      // (the foundry test's own kill path, test/pq-133-04-foundry.test.mjs:243-248).
      for (const entity of cohortHostiles(state)) {
        combatSys.onHit({
          targetId: entity.id,
          ownerId: state.playerId,
          damage: 100000,
          damageType: 'kinetic',
          weaponId: 'wpn_pulse_laser_s',
          pos: entity.pos,
        });
        bus.emit('entity:destroyed', { id: entity.id });
      }

      // The authored wave-N plan, with the machine's own arguments (survivalRun.js:362-373),
      // delivered by the machine's own receipt. survivalWave materializes through spawnBudget;
      // survivalArena tears down wave 1's room and installs wave N's (survivalArena.js:908).
      const plan = planWave({
        seed,
        arenaId: ARENA_ID,
        wave,
        act: actIndexForWave(wave),
        difficulty: difficultyForWave(wave),
        mutators: normalizeMutators((state.run && state.run.arenaMutators) || []),
        buildSummary: null,
        ruleset: 'block',
      });
      if (!plan || plan.ok === false) throw new Error(`probe: planWave wave ${wave} failed`);
      bus.emit('run:wavePlanned', { wave, plan, tick: state.tick | 0 });
      bus.emit('run:waveStarted', { wave });

      // Settle through the spawn schedule (batches due within 201 updates), pilot live.
      stepTicks(runtime, state, SETTLE_TICKS);

      // The measured window: pilot + runtime.step bracketed per tick — the same conservative
      // upper bound the R4 instrument stated, now on the authored wave-N board.
      const deltas = [];
      let cohortAtWindow = 0;
      const inputSys2 = runtime.getSystem('input');
      const aim = { x: 0, z: 0 };
      for (let i = 0; i < MEASURE_TICKS; i++) {
        const tickStart = performance.now();
        const player = state.entityList.find((e) => e && e.id === state.playerId) || null;
        const seen = drivePilot({ state, player, inputSys: inputSys2, aim, tick: state.tick | 0 });
        runtime.step(SIM_DT);
        deltas.push(performance.now() - tickStart);
        if (i === 0) cohortAtWindow = seen ? seen.hostiles : cohortHostiles(state).length;
      }
      if (state.run.phase !== 'active' || state.run.wave !== 1) {
        throw new Error(`probe: machine moved underneath the cell (phase=${state.run.phase} wave=${state.run.wave})`);
      }
      return {
        seed, wave,
        samples: deltas.length,
        mean: round2(deltas.reduce((s, d) => s + d, 0) / deltas.length),
        p50: round2(percentile(deltas, 0.5)),
        p95: round2(nearestRankP95(deltas)),
        cohort: cohortAtWindow,
        deltas,
      };
    } finally {
      restoreFeatureMaps(previousFlags);
    }
  } finally {
    FIELD_FLAGS.enabled = prevFieldsEnabled;
    runtime.dispose();
  }
}

const wave10All = [];
for (const seed of SEEDS) {
  for (const wave of WAVES) {
    const cell = await measureWaveCell({ seed, wave });
    if (wave === 10) wave10All.push(cell);
    console.log(
      `seed=${seed} wave=${String(wave).padStart(2, '0')} samples=${cell.samples} `
      + `cohort=${cell.cohort} mean=${cell.mean} p50=${cell.p50} p95=${cell.p95}`,
    );
  }
}

// The gate number pools every measured tick of every wave-10 cell across seeds.
const wave10Ticks = wave10All.flatMap((c) => c.deltas);
const pooledP95 = nearestRankP95(wave10Ticks);
console.log(`WAVE10_P95_MS=${round2(pooledP95).toFixed(2)}`);
console.log(`GATE_16_7_MS=${pooledP95 <= SIM_BUDGET_MS ? 'PASS' : 'FAIL'}`);
