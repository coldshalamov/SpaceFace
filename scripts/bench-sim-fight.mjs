// Headless fight bench for the simulation worker's step cost (sim performance, 2026-11-21).
//
// Runs a REAL fight through the same host the sim worker uses (createSimHost: command drain, the
// production step, journal, read-model diff, reply packing), in Node, with a busy deterministic
// hand: thrust held, turns, the trigger held at the nearest enemy, powers tapped. No window, no
// GPU, no game lock. One tick per directive, each timed.
//
//   node scripts/bench-sim-fight.mjs --scene=swarm6|swarm12|adventure [--steps=3600] [--warm=900]
//        [--profile]            per-system table (ms per step) over the measured span
//        [--ab=<flag>[,<flag>]] run the scene with the named simCoreFlags OFF, then ON, alternating
//                               (--rounds=2 pairs), in ONE process: the only matched comparison
//                               on a machine whose load swings 2-3x a minute
//        [--off=<flag>,..]      single arm with these flags off
//        [--hash]               print a state hash (run twice: the same seed must give the same hash)
//        [--mortal]             let the player die (default: the hull is refilled so the fight lasts)
//
// For a function-level profile:  node --cpu-prof --cpu-prof-dir=.devshots/sim-bench scripts/bench-sim-fight.mjs ...
// Writes nothing but .devshots/sim-bench/<scene>.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SCENE = String(argv.scene || 'swarm6');
const STEPS = Number(argv.steps || 3600);
const WARM = Number(argv.warm || 900);
const PROFILE = argv.profile === true;
const HASH = argv.hash === true;
const MORTAL = argv.mortal === true;
const ROUNDS = Number(argv.rounds || 2);
const AB = typeof argv.ab === 'string' ? argv.ab.split(',').filter(Boolean) : null;
const OFF = typeof argv.off === 'string' ? argv.off.split(',').filter(Boolean) : [];
const TOP = Number(argv.top || 34);

const { createSimHost } = await import('./lib/simWorkerHost.mjs');
const { createSimCommandRing, pushLaneCommand } = await import('./lib/simCommandChannel.mjs');
const { createBus } = await import('../src/core/eventBus.js');
const { SWARM_RULESET } = await import('../src/data/swarmMode.js');
const { crucibleSetupFor, requestCrucibleRun, CRUCIBLE_ARENA_ID, CRUCIBLE_DEFAULT_STARTER_ID } = await import('../src/ui/crucibleLaunch.js');
const { swarmStartAtRound, swarmArcadeSeedFor } = await import('../src/data/swarmLadder.js');
const { getSimStepProfiler } = await import('../src/core/simStepProfiler.js');
const { setSimCoreFlags } = await import('../src/core/simCoreFlags.js');

const scenarioContract = JSON.parse(readFileSync(join(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
const now = () => performance.now();
const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : 0);
const r2 = (v) => Math.round(v * 100) / 100;

function swarmOptions(round) {
  const bus = createBus();
  let opts = null;
  bus.on('game:new', (payload) => { opts = structuredClone(payload); });
  const start = swarmStartAtRound(String(round));
  const setup = crucibleSetupFor({ starterId: CRUCIBLE_DEFAULT_STARTER_ID, arenaId: CRUCIBLE_ARENA_ID,
    ruleset: SWARM_RULESET, seed: swarmArcadeSeedFor(CRUCIBLE_ARENA_ID) || 73311, startWave: start.startWave });
  if (!setup || !setup.ok || !requestCrucibleRun(bus, setup, SWARM_RULESET)) throw new Error('swarm setup refused');
  return opts;
}

function fnv(h, v) {
  // 32-bit FNV-1a over a number's rounded value
  let x = Math.round(v * 1000) | 0;
  for (let i = 0; i < 4; i++) { h ^= x & 255; h = Math.imul(h, 16777619); x >>>= 8; }
  return h >>> 0;
}

async function runArm(label, flags) {
  setSimCoreFlags(flags);
  const swarmRound = SCENE.startsWith('swarm') ? Number(SCENE.slice(5) || 6) : 0;
  const lane = createSimHost();
  const out = { label, flags, scene: SCENE };
  try {
    const ready = await lane.init({ profile: 'production', seed: swarmRound ? 73311 : 4242, scenarioContract, systemProfile: PROFILE });
    const ring = createSimCommandRing();
    let ackEnd = ready && ready.initRebuild ? ready.initRebuild.end : 0;
    let tick = 0;
    const send = async (n, ...commands) => {
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps: n, ackEnd, commands: ring.drain() });
      ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
      return reply;
    };
    const opts = swarmRound ? swarmOptions(swarmRound) : { seed: 4242 };
    const boot = await send(0, { kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'bench-boot', op: 'newGameBoot', args: { opts } });
    const ack = boot && boot.rpcAcks && boot.rpcAcks.find((row) => row.id === 'bench-boot');
    if (!ack || !ack.result || ack.result.ok !== true) throw new Error('boot refused: ' + JSON.stringify(ack).slice(0, 300));
    const state = lane.host.state;
    if (swarmRound) await send(0, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    await send(1, { kind: 'mode', mode: 'flight' });
    // Let asynchronous owners (the Rapier authority) finish starting.
    for (let i = 0; i < 40; i++) { await new Promise((ok) => setImmediate(ok)); await send(1); }
    if (swarmRound) for (let i = 0; i < 240 && state.run && state.run.phase !== 'active'; i++) await send(4);

    const key = (type, code) => ({ kind: 'domEvent', d: { type, code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), repeat: false } });
    const player = () => state.entities.get(state.playerId);
    const aim = () => {
      const p0 = player();
      let best = null; let bestD = Infinity;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.type !== 'ship' || e.id === state.playerId || !e.pos || !p0 || !p0.pos) continue;
        if (e.team === p0.team) continue;
        const d = (e.pos.x - p0.pos.x) ** 2 + (e.pos.z - p0.pos.z) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      const p = best ? best.pos : (p0 && p0.pos) || { x: 0, z: 0 };
      return { kind: 'domEvent', d: { type: 'cursorProjection', x: p.x, z: p.z } };
    };
    const keepAlive = () => {
      if (MORTAL) return;
      const p = player();
      if (!p) return;
      if (Number.isFinite(p.hullMax) && p.hull < p.hullMax) p.hull = p.hullMax;
      if (Number.isFinite(p.shieldMax) && p.shield < p.shieldMax * 0.5) p.shield = p.shieldMax;
    };
    await send(0, key('keydown', 'KeyW'), { kind: 'domEvent', d: { type: 'mousedown', button: 0 } });
    const powers = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    const times = [];
    const ents = []; const ships = [];
    let deaths = 0; let spawned = 0;
    lane.host.bus.on('entity:destroyed', () => { deaths++; });
    lane.host.bus.on('entity:spawned', () => { spawned++; });
    const profiler = getSimStepProfiler();
    let measuredFrom = null;
    const total = WARM + STEPS;
    for (let i = 0; i < total; i++) {
      if (i === WARM) { if (PROFILE) profiler.reset(); measuredFrom = now(); deaths = 0; spawned = 0; }
      const beat = Math.floor(i / 12);
      const sub = i % 12;
      const commands = [];
      if (sub === 0 || sub === 6) commands.push(aim());
      const turn = beat % 4 === 0 ? 'KeyA' : beat % 4 === 2 ? 'KeyD' : null;
      const power = powers[beat % powers.length];
      if (sub === 0) { if (turn) commands.push(key('keydown', turn)); if (beat % 3 === 0) commands.push(key('keydown', power)); }
      if (sub === 6) { if (turn) commands.push(key('keyup', turn)); if (beat % 3 === 0) commands.push(key('keyup', power)); }
      keepAlive();
      const t0 = now();
      await send(1, ...commands);
      const dt = now() - t0;
      if (i >= WARM) {
        times.push(dt);
        if (i % 30 === 0) {
          ents.push(state.entityList.length);
          let s = 0; for (const e of state.entityList) if (e && e.alive !== false && e.type === 'ship') s++;
          ships.push(s);
        }
      }
      // Yield a macrotask now and then so timers and async owners run as they do in the worker.
      if (i % 60 === 59) await new Promise((ok) => setImmediate(ok));
    }
    const sorted = times.slice().sort((a, b) => a - b);
    out.ticks = times.length;
    out.meanMs = r2(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length));
    out.p50 = r2(q(sorted, 0.5)); out.p95 = r2(q(sorted, 0.95)); out.p99 = r2(q(sorted, 0.99)); out.max = r2(sorted.at(-1) || 0);
    out.over16 = times.filter((t) => t > 16.7).length;
    // Worst 10 s window (600 ticks): what world speed a 60 Hz clock could hold through it.
    let worst = 0;
    for (let i = 0; i + 600 <= times.length; i += 60) {
      let sum = 0; for (let k = i; k < i + 600; k++) sum += Math.max(times[k], 0);
      worst = Math.max(worst, sum / 600);
    }
    out.worst10sMeanMs = r2(worst);
    out.entsMean = Math.round(ents.reduce((a, b) => a + b, 0) / Math.max(1, ents.length));
    out.entsMax = Math.max(0, ...ents);
    out.shipsMean = Math.round(ships.reduce((a, b) => a + b, 0) / Math.max(1, ships.length));
    out.shipsMax = Math.max(0, ...ships);
    out.deaths = deaths; out.spawned = spawned;
    {
      // What the world is made of at the end: a leak shows up here as one kind growing.
      const kinds = new Map();
      for (const e of state.entityList) {
        if (!e || e.alive === false) continue;
        const k = e.type === 'projectile' || e.type === 'pickup' || e.type === 'fx' || e.type === 'payload'
          ? e.type + ':' + ((e.data && (e.data.kind || e.data.weaponId || e.data.commodityId || e.data.fxKind)) || '-') : e.type;
        kinds.set(k, (kinds.get(k) || 0) + 1);
      }
      out.census = [...kinds.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14);
    }
    out.run = state.run ? { phase: state.run.phase, wave: state.run.wave, kind: state.run.kind } : null;
    out.simTime = r2(state.simTime || 0);
    const diag = state.physicsRuntime && state.physicsRuntime.diagnostics;
    if (diag) out.physics = { bodies: diag.sg02Bodies, dynamic: diag.sg02DynamicBodies, backend: diag.backend, ready: diag.sg02Ready };
    if (HASH) {
      let h = 2166136261;
      const list = state.entityList.slice().sort((a, b) => a.id - b.id);
      for (const e of list) {
        if (!e || e.alive === false) continue;
        h = fnv(h, e.id); h = fnv(h, e.pos ? e.pos.x : 0); h = fnv(h, e.pos ? e.pos.z : 0);
        h = fnv(h, e.vel ? e.vel.x : 0); h = fnv(h, e.vel ? e.vel.z : 0); h = fnv(h, e.rot || 0); h = fnv(h, e.hull || 0);
      }
      h = fnv(h, state.tick); h = fnv(h, state.rng ? state.rng() : 0);
      out.hash = h.toString(16);
    }
    if (PROFILE) {
      const snap = profiler.snapshot();
      out.profileStep = snap.step;
      out.systems = snap.systems.filter((s) => s.meanMsPerTick >= 0.004)
        .sort((a, b) => b.meanMsPerTick - a.meanMsPerTick)
        .map((s) => ({ id: s.id, nested: s.nested, msPerTick: s.meanMsPerTick, p95: s.p95, calls: s.calls }));
      out.topLevelMsPerTick = r2(snap.topLevelMeasuredMs / Math.max(1, snap.ticksMeasured));
      out.systemsMeasured = snap.systemsMeasured;
    }
    out.wallS = r2((now() - measuredFrom) / 1000);
  } finally {
    try { lane.host.registry && lane.host.registry.get('save') && (lane.host.registry.get('save')._suppressUnloadExitSave = true); } catch (_) { /* bench teardown */ }
    try { lane.shutdown(); } catch (_) { /* bench teardown */ }
  }
  return out;
}

function line(o) {
  return `${String(o.label).padEnd(10)} step mean ${String(o.meanMs).padStart(6)}  p50 ${String(o.p50).padStart(6)}  p95 ${String(o.p95).padStart(6)}  p99 ${String(o.p99).padStart(6)}  max ${String(o.max).padStart(6)}  worst10s ${String(o.worst10sMeanMs).padStart(6)}  >16.7ms ${String(o.over16).padStart(4)}/${o.ticks}  ents ${o.entsMean}/${o.entsMax} ships ${o.shipsMean}/${o.shipsMax} deaths ${o.deaths} spawned ${o.spawned} wave ${o.run ? o.run.wave : '-'} ${o.physics ? `bodies ${o.physics.bodies} dyn ${o.physics.dynamic}` : ''}${o.hash ? ' hash ' + o.hash : ''}${o.census ? ' | census: ' + o.census.map(([k, n]) => k + ' ' + n).join(', ') : ''}`;
}

const results = [];
const flagSet = (names, on) => Object.fromEntries(names.map((n) => [n, on]));
if (AB) {
  for (let r = 0; r < ROUNDS; r++) {
    for (const on of [false, true]) {
      const res = await runArm(on ? 'ON' : 'OFF', { ...flagSet(OFF, false), ...flagSet(AB, on) });
      results.push(res);
      console.log(line(res));
    }
  }
  const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  for (const k of ['meanMs', 'p50', 'p95', 'worst10sMeanMs']) {
    const off = med(results.filter((x) => x.label === 'OFF').map((x) => x[k]));
    const on = med(results.filter((x) => x.label === 'ON').map((x) => x[k]));
    console.log(`  ${k.padEnd(16)} OFF ${off}  ON ${on}  (${r2((on - off) / off * 100)} %)`);
  }
} else {
  const res = await runArm(SCENE, flagSet(OFF, false));
  results.push(res);
  console.log(`bench-sim-fight ${SCENE} on ${os.cpus()[0].model.trim()} (${res.wallS} s wall for ${res.simTime} s sim)`);
  console.log(line(res));
  if (res.systems) {
    console.log(`per-system (ms per step, measured span; ${res.systemsMeasured} rows, top-level sum ${res.topLevelMsPerTick}):`);
    for (const s of res.systems.slice(0, TOP)) console.log(`  ${(s.nested ? '. ' : '') + s.id}`.padEnd(40) + String(s.msPerTick).padStart(8) + '   p95 ' + String(s.p95).padStart(7));
    const rest = res.systems.slice(TOP).filter((s) => !s.nested);
    console.log(`  (${rest.length} more top-level rows: ${r2(rest.reduce((a, s) => a + s.msPerTick, 0))} ms)`);
  }
}
mkdirSync(join(ROOT, '.devshots/sim-bench'), { recursive: true });
writeFileSync(join(ROOT, '.devshots/sim-bench', `${SCENE}${AB ? '-ab' : ''}.json`), JSON.stringify(results, null, 1));
process.exit(0);
