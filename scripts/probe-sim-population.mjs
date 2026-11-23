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

if (argv.experiment === 'homeImmune') {
  // Experiment: homing combat loot ignores force fields.
  const fsys = lane.host.registry.get('fields');
  const orig = fsys._forceableBody.bind(fsys);
  fsys._forceableBody = (e) => (e && e.type === 'pickup' && e.data && e.data.combatLoot === true && state.simTime >= (e.data.homeAt || 0)) ? false : orig(e);
}
if (argv.chiptrace === true) {
  const ms = lane.host.registry.get('mining');
  const ou = ms.update.bind(ms); const op = ms._updatePickups.bind(ms);
  globalThis.__minUpd = 0; globalThis.__minPick = 0; globalThis.__minErr = null;
  ms.update = (...a) => { globalThis.__minUpd++; try { return ou(...a); } catch (err) { globalThis.__minErr = String(err && err.stack || err).slice(0, 400); throw err; } };
  ms._updatePickups = (...a) => { globalThis.__minPick++; try { return op(...a); } catch (err) { globalThis.__minErr = String(err && err.stack || err).slice(0, 600); throw err; } };
}
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
// --impacts also reads the raw receipts the Rapier owner drains each step (before the per-tick
// fan-out cap): how many repeat a pair inside the same step, how many repeat a pair seen the step
// before, and how fast the pair was closing before the solve (a resting pile closes at ~0).
const raw = { receipts: 0, ticks: 0, dupInTick: 0, sameAsPrevTick: 0, closing: new Map() };
let prevPairs = new Set();
let rawWrapped = false;
function wrapRawReceipts() {
  if (rawWrapped || argv.impacts !== true) return;
  const o = owner();
  if (!o || typeof o.drainContactImpacts !== 'function') return;
  rawWrapped = true;
  const orig = o.drainContactImpacts.bind(o);
  o.drainContactImpacts = (...args) => {
    const list = orig(...args);
    if (!Array.isArray(list)) return list;
    raw.ticks++;
    const pairs = new Set();
    for (const r of list) {
      raw.receipts++;
      const k = r.aId < r.bId ? `${r.aId}|${r.bId}` : `${r.bId}|${r.aId}`;
      if (pairs.has(k)) raw.dupInTick++;
      else if (prevPairs.has(k)) raw.sameAsPrevTick++;
      pairs.add(k);
      const v = Number(r.preSolveClosingSpeed);
      const cb = !Number.isFinite(v) ? 'n/a' : v < 1 ? '<1' : v < 5 ? '1-5' : v < 20 ? '5-20' : '20+';
      raw.closing.set(cb, (raw.closing.get(cb) || 0) + 1);
    }
    prevPairs = pairs;
    return list;
  };
}
const total = (WARM + SECONDS) * 60;
let handOn = false;
let secMs = 0; let secMax = 0; let secN = 0; let secCpu = 0;
const busyAt = (i) => HAND === 'busy' || (HAND === 'alt' && Math.floor(i / 300) % 2 === 0);
for (let i = 0; i < total; i++) {
  const wantHand = busyAt(i);
  wrapRawReceipts();
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
  if (argv.chiptrace === true && i >= WARM * 60 && i % 15 === 0) {
    // Follow the three oldest loose chips: distance to the hull, speed, how much of their motion
    // points at the hull, whether a body exists for them, which fields hold them.
    const pp = player();
    const chips = state.entityList.filter((e) => e && e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === 'credit_chip')
      .sort((a, b) => a.id - b.id).slice(0, 3);
    const o = owner();
    if (i % 120 === 0) { const fs_ = lane.host.registry.get('fields'); const fl = fs_ && fs_._kernel ? fs_._kernel.list() : []; console.log('   fields ' + fl.map((f) => f.kind + '@' + Math.round(f.center.x) + ',' + Math.round(f.center.z) + ' r' + Math.round(f.radius) + ' s' + Math.round(f.strength || 0) + ' own' + (f.ownerId ?? '-')).join(' | ')); console.log('   player vel ' + pp.vel.x.toFixed(0) + ',' + pp.vel.z.toFixed(0) + ' hull ' + Math.round(pp.hull) + ' flags ' + JSON.stringify(pp.flags || {}).slice(0, 120)); }
    { const md = state.miningRuntime && state.miningRuntime.diagnostics; const ix = state.entityIndex; const ms = lane.host.registry.get('mining'); console.log('   index v1 ' + !!(ix && ix.__spacefaceEntityIndexV1) + ' ready ' + (ix && ix.ready) + ' pickups ' + (ix && Array.isArray(ix.pickups) ? ix.pickups.length : 'n/a') + ' payloads ' + (ix && Array.isArray(ix.payloads) ? ix.payloads.length : 'n/a') + ' quiet ' + JSON.stringify(ms && ms._miningQuiet) + ' sys ' + !!ms); console.log('   mining calls upd ' + globalThis.__minUpd + ' pick ' + globalThis.__minPick + ' err ' + globalThis.__minErr); console.log('   mining diag ' + JSON.stringify(md || null).slice(0, 300) + ' arcadeLoot? retry ' + chips.map((c) => c.data.pickupAcceptanceRetryAt ?? '-').join(',')); }
    for (const c of chips) {
      const dx = pp.pos.x - c.pos.x; const dz = pp.pos.z - c.pos.z; const d = Math.hypot(dx, dz) || 1;
      const sp = Math.hypot(c.vel.x, c.vel.z);
      const toward = sp > 1e-6 ? ((c.vel.x - pp.vel.x) * dx + (c.vel.z - pp.vel.z) * dz) / d : 0;
      const rec = o && o.records ? o.records.get(c.id) : null;
      console.log(`   chip ${c.id} t=${state.simTime.toFixed(2)} dist ${d.toFixed(0)} speed ${sp.toFixed(0)} closing ${toward.toFixed(0)} body ${rec ? 'yes' : 'no'} homeAt ${(c.data.homeAt || 0).toFixed(1)} energised ${c.data.energisedUntil ? (c.data.energisedUntil - state.simTime).toFixed(1) : '-'} pos ${c.pos.x.toFixed(0)},${c.pos.z.toFixed(0)} player ${pp.pos.x.toFixed(0)},${pp.pos.z.toFixed(0)}`);
    }
  }
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
    if (argv.chips === true) {
      // Loose credit chips: how many, how far from the hull, how many home (combat loot), wallet.
      const pp = player();
      const dists = []; let homing = 0; const wallets = {};
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.type !== 'pickup' || !e.data || e.data.kind !== 'credit_chip') continue;
        if (pp && pp.pos) dists.push(Math.round(Math.hypot(e.pos.x - pp.pos.x, e.pos.z - pp.pos.z)));
        if (e.data.combatLoot === true) homing++;
        const w = e.data.wallet || '-'; wallets[w] = (wallets[w] || 0) + 1;
      }
      dists.sort((a, b) => a - b);
      console.log(`   run credits ${state.run && state.run.credits}`);
      console.log(`   chips ${dists.length} homing ${homing} wallets ${JSON.stringify(wallets)} dist p10/p50/p90 ${dists[Math.floor(dists.length * 0.1)]}/${dists[Math.floor(dists.length * 0.5)]}/${dists[Math.floor(dists.length * 0.9)]}`);
    }
    if (argv.quiet !== true) {
      console.log(`   bodies ${JSON.stringify(byType)}`);
      console.log(`   fields ${JSON.stringify(fk)}`);
    }
  }
  if (i % 60 === 59) { impacts = 0; secMs = 0; secMax = 0; secN = 0; secCpu = 0; }
}
if (argv.impacts === true) console.log('raw receipts', JSON.stringify({ perTick: +(raw.receipts / Math.max(1, raw.ticks)).toFixed(1), dupInTick: raw.dupInTick, samePairAsPrevTick: raw.sameAsPrevTick, total: raw.receipts, closing: Object.fromEntries(raw.closing) }));
if (argv.impacts === true) for (const [k, n] of [...impactHist].sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log('impact', String(n).padStart(6), k);
try { lane.host.registry.get('save')._suppressUnloadExitSave = true; } catch (_) { /* teardown */ }
try { lane.shutdown(); } catch (_) { /* teardown */ }
process.exit(0);
