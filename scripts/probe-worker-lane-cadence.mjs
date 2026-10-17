#!/usr/bin/env node
// Worker-lane cadence probe: how fast does the REAL sim Worker step, how often does it reach the main
// thread, and what does flying or a tether cost it on THIS machine?
//
//   node scripts/probe-worker-lane-cadence.mjs                  parked, then flying + tethered (default)
//   node scripts/probe-worker-lane-cadence.mjs --only=base      parked in the belt
//   node scripts/probe-worker-lane-cadence.mjs --only=fly       thrusting, no tether
//   node scripts/probe-worker-lane-cadence.mjs --only=tether    thrusting with a loaded Massline
//   --secs=10 (window length)  --sector=sector_ceres_belt
//
// It runs the production sim host in a real worker_threads Worker (the same entrypoint the browser
// runs), the main-side lane facade, and a 60 Hz loop that does what the rAF callback does for the
// lane (ack + consume the newest completed tick). No renderer, so it measures the SIM half of
// smoothness on any machine, GPU or not. Read the lines like this:
//
//   worker ticks/s    60 means the sim keeps real time. Below 60 the Worker is saturated: the game
//                     is running slower than the clock and whole ticks are being shed.
//   replies/s         how often the main thread receives a new picture of the world. Healthy is
//                     close to ticks/s; a saturated Worker posts one reply per burst of several
//                     steps (the "stop-motion" cadence the follow clock in snapshotFence.js hides).
//   per-tick sim      milliseconds the Worker spends in ONE fixed step. The frame budget is 16.67.
//   pack / domainDiff the Worker's cost of shipping state to the main thread (journal pack, mirror diff).
//
// Measured 2026-10-17 on a shared 4-core Linux sandbox (absolute numbers are pessimistic; compare
// yours): parked 12.8 ms/step, 59 ticks/s, 23 replies/s (2.6 steps per reply); flying 15.7 ms/step,
// 50 ticks/s, 14 replies/s; flying with a loaded Massline 18.9 ms/step, 45 ticks/s, 12 replies/s and
// ~15 whole ticks/s shed. Past ~16.7 ms/step the Worker cannot hold real time.
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneDomEvent, laneRpc, laneSetMode } from '../src/core/simLaneCommands.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const WINDOW_S = Math.max(2, Number(arg('secs', 10)));
const ONLY = arg('only', 'both');
const SECTOR = arg('sector', 'sector_ceres_belt');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = createGameState(4242);
const effects = createTimeEffects(state);
effects.set('runtime:loading', { scale: 0 });
const worker = new Worker(new URL('../test/fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), { type: 'module' });
let workerError = null;
let receive = null;
let applyNs = 0n;
let applyCount = 0;
let maxApplyMs = 0;
worker.on('message', (message) => {
  if (message.kind === 'error') workerError = message;
  const t0 = process.hrtime.bigint();
  receive?.(message);
  const d = process.hrtime.bigint() - t0;
  applyNs += d;
  applyCount++;
  maxApplyMs = Math.max(maxApplyMs, Number(d) / 1e6);
});
worker.on('error', (error) => { workerError = error; });
const lane = createSimLaneRuntime({
  state,
  bus: createBus(),
  registry: {},
  flags: { lane: 'worker', warnings: [], sab: false },
  clockMode: 'worker-local',
  helpers: {
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
    scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
    scenarioContractHash: 'probe-worker-lane-cadence',
  },
  channelFactory: () => ({
    post(message) { worker.postMessage(message); },
    onMessage(handler) { receive = handler; },
    onError(handler) { worker.on('error', handler); },
    terminate() {},
  }),
});
await lane.readyPromise;
lane.runner.setClockActive(true);

// What each rAF callback does for the lane: ack the last reply and consume the newest completed tick.
let frames = 0;
let stop = false;
const consumed = {};
(async () => {
  while (!stop) {
    lane.runner.prepareWithoutAdvance();
    lane.runner.consumeLatestCompletedTick(consumed);
    frames++;
    await sleep(15);
  }
})();

const rpc = async (op, args) => {
  const reply = await laneRpc(op, args);
  if (!reply || reply.ok !== true) throw new Error(`${op} failed: ${JSON.stringify(reply).slice(0, 200)}`);
  return reply.result;
};

async function snapshot() {
  const p = await rpc('probePerformance');
  const d = lane.runner.getDiagnostics();
  return { p, d, wc: d.workerClockLastDiagnostics || {}, frames, applyNs, applyCount, wall: Date.now() };
}

function report(a, b, label) {
  const ticks = b.p.tickCount - a.p.tickCount;
  const sec = (b.wall - a.wall) / 1000;
  const perTick = (field) => (b.p[field] * b.p.tickCount - a.p[field] * a.p.tickCount) / Math.max(1, ticks);
  const replies = b.d.replyCount - a.d.replyCount;
  const applyMs = Number(b.applyNs - a.applyNs) / 1e6 / Math.max(1, b.applyCount - a.applyCount);
  const shed = (b.wc.shedSteps || 0) - (a.wc.shedSteps || 0);
  const steps = (b.wc.steps || 0) - (a.wc.steps || 0);
  console.log(`${label.padEnd(9)} worker ticks/s=${(ticks / sec).toFixed(1).padStart(5)}  replies/s=${(replies / sec).toFixed(1).padStart(5)}`
    + `  steps/reply=${(steps / Math.max(1, replies)).toFixed(1)}  shed ticks/s=${(shed / sec).toFixed(1)}`
    + `  | per-tick sim=${perTick('avgWorkMs').toFixed(2)}ms pack=${perTick('avgPackMs').toFixed(2)}ms`
    + ` domainDiff=${perTick('avgDomainDiffMs').toFixed(2)}ms | main apply/reply=${applyMs.toFixed(2)}ms (max ${maxApplyMs.toFixed(1)})`);
}

console.log(`worker-lane cadence, ${SECTOR}, ${WINDOW_S}s windows (frame budget 16.67 ms/step)`);
await rpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
laneSetMode(state, null, 'flight');
effects.clear('runtime:loading');
await sleep(500);
await rpc('worldCall', { method: 'enterSector', sectorId: SECTOR });
await sleep(3000); // arrival, residency and JIT settle

if (ONLY === 'both' || ONLY === 'base') {
  const a = await snapshot();
  await sleep(WINDOW_S * 1000);
  report(a, await snapshot(), 'parked');
}

if (ONLY !== 'base') {
  let player = state.entities.get(state.playerId);
  const rock = [...state.entities.values()].find((e) => e && e.type === 'asteroid' && e.alive !== false && e.pos);
  if (rock) {
    await rpc('worldCall', { method: 'relocatePlayerInSector', pose: { x: rock.pos.x - 160, z: rock.pos.z, rot: 0 }, opts: {} });
    await sleep(2500);
    player = state.entities.get(state.playerId);
  }
  const rocks = [...state.entities.values()].filter((e) => e && e.type === 'asteroid' && e.alive !== false && e.pos)
    .sort((x, y) => Math.hypot(x.pos.x - player.pos.x, x.pos.z - player.pos.z) - Math.hypot(y.pos.x - player.pos.x, y.pos.z - player.pos.z));
  const target = rocks.find((e) => Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) > 60) || rocks[0];
  const wantTether = ONLY === 'both' || ONLY === 'tether';
  if (wantTether && target) {
    // Fly first so the comparison against the tether is flying-vs-flying, not parked-vs-flying.
    laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true, repeat: false });
    laneDomEvent({ type: 'keydown', code: 'KeyD', pressed: true, repeat: false });
    await sleep(1500);
    if (ONLY === 'both') {
      const f0 = await snapshot();
      await sleep(WINDOW_S * 1000);
      report(f0, await snapshot(), 'flying');
    }
    const created = await rpc('sandboxPreAttachTether', {
      defId: 'tether_standard', ownerId: state.playerId, targetId: target.id,
      sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z }, targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
    });
    if (!created.ok) console.log('tether refused:', created.reason);
    await sleep(1500);
    const t0 = await snapshot();
    await sleep(WINDOW_S * 1000);
    report(t0, await snapshot(), 'tethered');
    const tether = state.player.tether;
    console.log(`  tether: ${JSON.stringify({ active: tether?.active, phase: tether?.phase, load: tether?.load })}`);
  } else {
    laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true, repeat: false });
    laneDomEvent({ type: 'keydown', code: 'KeyD', pressed: true, repeat: false });
    await sleep(1500);
    const f0 = await snapshot();
    await sleep(WINDOW_S * 1000);
    report(f0, await snapshot(), 'flying');
  }
}

if (workerError) console.log('worker error:', String(workerError.message || workerError).slice(0, 200));
stop = true;
lane.close();
await worker.terminate();
process.exit(workerError ? 1 : 0);
