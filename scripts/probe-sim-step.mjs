// Per-system step profiler probe (master-plan campaign E2).
//
// Boots the Node-safe PRODUCTION manifest (same systems, same order, same physics backend as the
// worker lane), builds a heavy scene shaped like the Crucible / Adventure busy routes, runs it,
// and exports the permanent per-system profile as JSON.
//
// Matching: the owner's laptop is shared, so two runs minutes apart are not comparable. `--ab`
// boots the LEGACY hot-path shape, measures, disposes, then boots the SIM CORE shape in the SAME
// process seconds later — same machine state, same scene, same seed. That is the campaign's
// matched comparison; `--label` alone is a single-arm run.
//
//   node scripts/probe-sim-step.mjs --ab --bodies=160 --ticks=900
//   node scripts/probe-sim-step.mjs --label=after --bodies=320 --ticks=900
//
// Reads/writes only .devshots/ (ignored).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getSimStepProfiler } from '../src/core/simStepProfiler.js';
import { setSimCoreFlags, simCoreFlagDefaults, resetSimCoreFlags } from '../src/core/simCoreFlags.js';
import { SIM_DT } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const argv = new Map();
for (const raw of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
  if (m) argv.set(m[1], m[2] === undefined ? 'true' : m[2]);
}
const LABEL = argv.get('label') || (argv.get('ab') ? 'ab' : 'run');
const BODIES = Number(argv.get('bodies') || 160);
const TICKS = Number(argv.get('ticks') || 900);
const WARMUP = Number(argv.get('warmup') || 180);
const SEED = Number(argv.get('seed') || 4242);
const ENEMIES = Number(argv.get('enemies') || 14);
const AB = argv.get('ab') === 'true';
const OUT = path.join(ROOT, '.devshots', 'sim-step-profile');

const quantile = (sorted, q) => (sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  : 0);

function summarise(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

async function runScene(label, flags) {
  setSimCoreFlags(flags);
  resetSimCoreFlags();
  const profiler = getSimStepProfiler();
  profiler.reset();
  profiler.setEnabled(false);

  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'tactical';
  state.world.currentSectorId = 'sector_helios_prime';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  // Player hull on the ordinary starter spec — the same construction the New Game route uses.
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_scr',
    isPlayer: true,
    player: state.player,
    fittings: [],
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;

  // Heavy field: drifting rocks on a wide ring so the broad phase is full and contacts happen,
  // plus hostile hulls closing on the player so weapons/combat/AI run at combat cadence.
  for (let i = 0; i < BODIES; i += 1) {
    const angle = (Math.PI * 2 * i) / BODIES;
    const radius = 90 + state.rng() * 520;
    const sized = 6 + state.rng() * 18;
    const rock = runtime.spawn({
      type: 'asteroid',
      pos: { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      vel: { x: (state.rng() - 0.5) * 14, z: (state.rng() - 0.5) * 14 },
      radius: sized,
      mass: 120 + sized * 22,
      hull: 160 + sized * 12,
      hullMax: 160 + sized * 12,
      data: { typeId: 'ast_rock', oreHP: 200, oreHPMax: 200 },
    });
    rock.angVel = (state.rng() - 0.5) * 0.4;
  }

  const enemyTypes = ['corsair_raider', 'wasp_swarmer', 'reaver_pirate'];
  for (let i = 0; i < ENEMIES; i += 1) {
    const angle = (Math.PI * 2 * i) / ENEMIES;
    const radius = 260 + state.rng() * 180;
    const spec = makeEnemySpawnSpec(
      enemyTypes[i % enemyTypes.length],
      2,
      { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      { motive: 'probe', engagementTrigger: 'authorized_hostile_spawn', zoneId: 'probe' },
    );
    spec.data = spec.data || {};
    spec.data.intent = { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, brake: false, fire: true };
    runtime.spawn(spec);
  }

  const physicsSystem = runtime.getSystem('physics');
  if (physicsSystem && typeof physicsSystem.prepareBackend === 'function') {
    await physicsSystem.prepareBackend(state, { reset: true });
  }

  const sequence = (tick) => {
    const input = state.input;
    input.moveZ = 0.85;
    input.moveX = Math.sin(tick / 90) * 0.35;
    input.turnIntent = Math.sin(tick / 140) * 0.5;
    input.boost = (tick % 180) < 60;
    input.brake = false;
    if (!input.actions) input.actions = {};
    input.actions.brake = false;
    input.actions.autopursuit = false;
    input.fire = true;
    runtime.step(SIM_DT);
  };

  for (let i = 0; i < WARMUP; i += 1) sequence(i);

  const stepSeries = [];
  profiler.setEnabled(true);
  profiler.setSampleEvery(1);
  for (let i = 0; i < TICKS; i += 1) {
    sequence(WARMUP + i);
    stepSeries.push(profiler.lastTick().ms);
  }
  const report = profiler.snapshot();
  profiler.setEnabled(false);

  const totalLive = state.entityList.filter((e) => e.alive).length;
  const external = summarise(stepSeries);
  const output = {
    schema: 'spaceface.simStepProbe.v2',
    label,
    capturedAt: new Date().toISOString(),
    flags,
    host: { platform: process.platform, node: process.version, arch: process.arch },
    scene: {
      seed: SEED,
      requestedBodies: BODIES,
      enemies: ENEMIES,
      ticks: TICKS,
      warmup: WARMUP,
      liveEntities: totalLive,
      physicsBackend: state.settings.gameplay.physicsBackend,
      profileId: runtime.config.profileId,
      evidenceClass: runtime.config.evidenceClass,
    },
    step: report.step,
    allocation: report.allocation,
    externalStep: {
      n: external.n,
      meanMs: round3(external.mean),
      p50: round3(external.p50),
      p95: round3(external.p95),
      p99: round3(external.p99),
      max: round3(external.max),
    },
    systems: report.systems,
  };
  runtime.dispose();
  return output;
}

function banner(out) {
  console.log(`\n[sim-step] ${out.label}: ${out.scene.liveEntities} live, ${out.scene.ticks} ticks`);
  console.log(`[sim-step] step mean ${out.step.meanMs} p50 ${out.step.p50} p95 ${out.step.p95} p99 ${out.step.p99} max ${out.step.max}`);
  if (out.allocation) {
    console.log(`[sim-step] alloc ${(out.allocation.bytesPerTickMean / 1024).toFixed(1)} KB/tick`);
  }
  for (const row of out.systems.slice(0, 10)) {
    console.log(`  ${row.id.padEnd(24)} mean ${String(row.meanMs).padStart(7)} p95 ${String(row.p95).padStart(7)} max ${String(row.max).padStart(8)} share ${(row.share * 100).toFixed(1)}%`);
  }
}

await mkdir(OUT, { recursive: true });

if (AB) {
  const legacy = await runScene('legacy', { telemetryDemand: false, lazySg02Snapshot: false, economySlicing: false });
  banner(legacy);
  const optimised = await runScene('simcore', simCoreFlagDefaults());
  banner(optimised);

  const byId = new Map(legacy.systems.map((r) => [r.id, r]));
  const delta = [];
  for (const row of optimised.systems) {
    const before = byId.get(row.id);
    if (!before) continue;
    const d = row.meanMs - before.meanMs;
    if (Math.abs(d) >= 0.01) delta.push({ id: row.id, before: before.meanMs, after: row.meanMs, delta: round3(d) });
  }
  delta.sort((a, b) => a.delta - b.delta);
  console.log('\n[sim-step] per-system mean delta (after − before, ms/tick):');
  for (const row of [...delta.slice(0, 10), ...delta.slice(-6)]) {
    console.log(`  ${row.id.padEnd(24)} ${String(row.before).padStart(7)} → ${String(row.after).padStart(7)}  ${row.delta > 0 ? '+' : ''}${row.delta}`);
  }
  console.log(`\n[sim-step] step p50 ${legacy.step.p50} → ${optimised.step.p50}   p95 ${legacy.step.p95} → ${optimised.step.p95}   p99 ${legacy.step.p99} → ${optimised.step.p99}   max ${legacy.step.max} → ${optimised.step.max}`);
  const comparison = {
    schema: 'spaceface.simStepComparison.v1',
    capturedAt: new Date().toISOString(),
    scene: optimised.scene,
    legacy,
    optimised,
    perSystemDelta: delta,
  };
  const file = path.join(OUT, `${LABEL}.json`);
  await writeFile(file, `${JSON.stringify(comparison, null, 2)}\n`);
  console.log(`[sim-step] wrote ${path.relative(ROOT, file)}`);
} else {
  const output = await runScene(LABEL, simCoreFlagDefaults());
  banner(output);
  const file = path.join(OUT, `${LABEL}.json`);
  await writeFile(file, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[sim-step] wrote ${path.relative(ROOT, file)}`);
}
