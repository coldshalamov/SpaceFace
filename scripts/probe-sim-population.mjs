// What a busy fight's simulation is made of, second by second (FREEZE/perf lane, 2026-11-23).
//
// Runs the same headless fight as scripts/bench-sim-fight.mjs (createSimHost, the production
// step, a busy deterministic hand) and, once a second of sim time, prints the step cost of that
// second (mean / worst ms per step) beside what the world is made of: bodies by type (dynamic
// records in the Rapier owner), how many are asleep, how many move slower than 1 WU/s, the live
// fields (kind/tag/radius) and the contact receipts. No window, no GPU, no game lock.
//
//   node scripts/probe-sim-population.mjs [--round=6] [--seconds=30] [--warm=10]
//        [--hand=busy|idle|alt]   busy: thrust held, turns, trigger, powers (default);
//                                 idle: no input at all; alt: 5 s busy then 5 s idle, repeated,
//                                 so input cost and population can be told apart in one run.
//        [--flags='{"name":false}'] simCoreFlags for this run
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROUND = Number(argv.round || 6);
const SECONDS = Number(argv.seconds || 30);
const WARM = Number(argv.warm || 10);
const HAND = String(argv.hand || 'busy');

const { createSimHost } = await import('./lib/simWorkerHost.mjs');
const { createSimCommandRing, pushLaneCommand } = await import('./lib/simCommandChannel.mjs');
const { createBus } = await import('../src/core/eventBus.js');
const { SWARM_RULESET } = await import('../src/data/swarmMode.js');
const { crucibleSetupFor, requestCrucibleRun, CRUCIBLE_ARENA_ID, CRUCIBLE_DEFAULT_STARTER_ID } = await import('../src/ui/crucibleLaunch.js');
const { swarmStartAtRound, swarmArcadeSeedFor } = await import('../src/data/swarmLadder.js');
const { setSimCoreFlags } = await import('../src/core/simCoreFlags.js');
const scenarioContract = JSON.parse(readFileSync(join(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
if (typeof argv.flags === 'string') setSimCoreFlags(JSON.parse(argv.flags));

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

const lane = createSimHost();
await lane.init({ profile: 'production', seed: 73311, scenarioContract });
const ring = createSimCommandRing();
let tick = 0; let ackEnd = 0;
const send = async (n, ...commands) => {
  for (const c of commands) pushLaneCommand(ring, c);
  const reply = await lane.tick({ tick: ++tick, steps: n, ackEnd, commands: ring.drain() });
  ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
  return reply;
};
const opts = ROUND > 0 ? swarmOptions(ROUND) : { seed: 4242 };
await send(0, { kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts } });
const state = lane.host.state;
if (ROUND > 0) await send(0, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
await send(1, { kind: 'mode', mode: 'flight' });
for (let i = 0; i < 40; i++) { await new Promise((ok) => setImmediate(ok)); await send(1); }
if (ROUND > 0) for (let i = 0; i < 240 && state.run && state.run.phase !== 'active'; i++) await send(4);

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
const powers = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
const owner = () => {
  const phys = lane.host.registry && lane.host.registry.get('physics');
  return phys && (phys._sg02 || null);
};
let impacts = 0;
const impactHist = new Map();
const dpBucket = (dp) => dp < 5 ? '<5' : dp < 20 ? '5-20' : dp < 50 ? '20-50' : dp < 200 ? '50-200' : '200+';
lane.host.bus.on('physics:impact', (p) => {
  impacts++;
  if (argv.impacts !== true || !p) return;
  const a = state.entities.get(p.aId); const b = state.entities.get(p.bId);
  const ta = a ? a.type : '?'; const tb = b ? b.type : '?';
  const k = (ta < tb ? ta + '|' + tb : tb + '|' + ta) + ' ' + dpBucket(p.dp);
  impactHist.set(k, (impactHist.get(k) || 0) + 1);
});
const total = (WARM + SECONDS) * 60;
let handOn = false;
let secMs = 0; let secMax = 0; let secN = 0; let secCpu = 0;
const busyAt = (i) => HAND === 'busy' || (HAND === 'alt' && Math.floor(i / 300) % 2 === 0);
for (let i = 0; i < total; i++) {
  const wantHand = busyAt(i);
  const commands = [];
  if (wantHand !== handOn) {
    if (wantHand) commands.push(key('keydown', 'KeyW'), { kind: 'domEvent', d: { type: 'mousedown', button: 0 } });
    else commands.push(key('keyup', 'KeyW'), key('keyup', 'KeyA'), key('keyup', 'KeyD'), { kind: 'domEvent', d: { type: 'mouseup', button: 0 } });
    handOn = wantHand;
  }
  if (handOn) {
    const beat = Math.floor(i / 12); const sub = i % 12;
    if (sub === 0 || sub === 6) commands.push(aim());
    const turn = beat % 4 === 0 ? 'KeyA' : beat % 4 === 2 ? 'KeyD' : null;
    const power = powers[beat % powers.length];
    if (sub === 0) { if (turn) commands.push(key('keydown', turn)); if (beat % 3 === 0) commands.push(key('keydown', power)); }
    if (sub === 6) { if (turn) commands.push(key('keyup', turn)); if (beat % 3 === 0) commands.push(key('keyup', power)); }
  }
  const p = player();
  if (p && Number.isFinite(p.hullMax)) p.hull = p.hullMax;
  // --vacuum=alt: every other 5 s, loose credit chips are retired the moment they appear (as if
  // collected), so the cost of the chips alone shows against the same fight.
  const vacuumOn = argv.vacuum === 'alt' && Math.floor(i / 300) % 2 === 1;
  if (vacuumOn) for (const e of state.entityList) if (e && e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === 'credit_chip') { e.alive = false; }
  const t0 = performance.now(); const c0 = process.cpuUsage();
  await send(1, ...commands);
  const dt = performance.now() - t0; const c1 = process.cpuUsage(c0); secCpu += (c1.user + c1.system) / 1000;
  secMs += dt; secN++; if (dt > secMax) secMax = dt;
  if (i % 60 === 59) await new Promise((ok) => setImmediate(ok));
  if (i % 60 === 59 && i >= WARM * 60) {
    const o = owner();
    const byType = {}; let asleep = 0; let slow = 0; let n = 0;
    const recs = o && o.dynamicRecords ? [...o.dynamicRecords] : [];
    for (const rec of recs) {
      const e = rec.entity; if (!e) continue; n++;
      const k = e.type === 'pickup' || e.type === 'payload' ? `${e.type}:${(e.data && (e.data.kind || e.data.commodityId)) || '-'}` : e.type;
      byType[k] = (byType[k] || 0) + 1;
      if (rec.body && rec.body.isSleeping && rec.body.isSleeping()) asleep++;
      const v = e.vel ? Math.hypot(e.vel.x || 0, e.vel.z || 0) : 0;
      if (v < 1) slow++;
    }
    const fieldsSys = lane.host.registry && lane.host.registry.get('fields');
    const fl = fieldsSys && fieldsSys._kernel ? fieldsSys._kernel.list() : [];
    const fk = {};
    for (const f of fl) { const k = `${f.kind}/${f.tag || '-'}/r${Math.round(f.radius || 0)}`; fk[k] = (fk[k] || 0) + 1; }
    console.log(`t=${(state.simTime || 0).toFixed(0)}s ${handOn ? 'BUSY' : 'idle'}${argv.vacuum === 'alt' && Math.floor(i / 300) % 2 === 1 ? ' VAC' : ''} step ${(secMs / Math.max(1, secN)).toFixed(1)}/${secMax.toFixed(0)} ms cpu ${(secCpu / Math.max(1, secN)).toFixed(1)}  wave ${state.run && state.run.wave} ents ${state.entityList.length} dyn ${n} asleep ${asleep} slow<1 ${slow} impacts/s ${impacts}`);
    if (argv.quiet !== true) {
      console.log(`   bodies ${JSON.stringify(byType)}`);
      console.log(`   fields ${JSON.stringify(fk)}`);
    }
  }
  if (i % 60 === 59) { impacts = 0; secMs = 0; secMax = 0; secN = 0; secCpu = 0; }
}
if (argv.impacts === true) for (const [k, n] of [...impactHist].sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log('impact', String(n).padStart(6), k);
try { lane.host.registry.get('save')._suppressUnloadExitSave = true; } catch (_) { /* teardown */ }
try { lane.shutdown(); } catch (_) { /* teardown */ }
process.exit(0);
