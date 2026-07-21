// PQ-014 CONVERGENCE proof — offscreen ≈ onscreen, at the RUNTIME boundary.
//
// The kernel already proves advance() is decomposable (npc-jobs-kernel.test.mjs:516-532). This proves
// the WIRING preserves it: the runtime's two REAL advancement code paths — the materialized per-tick
// update() and the virtualized single-shot re-entry catch-up (_tryRelink) — reach the identical job
// state, and the materialized path surfaces the EXACT kernel intent stream (no drop / dup / reorder).
//
// Path A (onscreen): a runtime-managed job stepped materialized at an EXACT-divisor dt (0.5, so N×0.5
//   is float-exact — 1/60 would drift, per the kernel float policy).
// Path B (offscreen): the SAME job (same seed + id ⇒ identical rngSeed) virtualized on sector exit,
//   the WHOLE interval elapsed while away, then advanced in one aggregated catch-up on re-entry.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { createJob, advance, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const NPCJOBS_EVENTS = ['npcjobs:commission', 'npcjobs:depart', 'npcjobs:transit', 'npcjobs:approach',
  'npcjobs:work', 'npcjobs:load', 'npcjobs:unload', 'npcjobs:return', 'npcjobs:hold', 'npcjobs:cycle',
  'npcjobs:arrived', 'npcjobs:complete', 'npcjobs:truncated'];

const MINER_ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
function spec() {
  return { kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, sectorId: 'sector_a',
    speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };
}

// read-seam rounding, copied from the kernel suite so byte-stable comparison ignores ~1e-16 float noise
function snap(job) {
  const { _lastThreat, ...rest } = job; void _lastThreat;
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  for (const k of ['progress', 'simTime', 'heading']) if (k in rest) rest[k] = round(rest[k]);
  return JSON.parse(JSON.stringify(rest));
}
function snapIntents(list) {
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  return list.map((e) => {
    const out = { ...e };
    if ('simTime' in out) out.simTime = round(out.simTime);
    if (out.pos) out.pos = { x: round(out.pos.x), z: round(out.pos.z) };
    if ('heading' in out) out.heading = round(out.heading);
    return out;
  });
}

function boot(seed) {
  const sim = createSimulation({ seed, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
function despawn(state, id) {
  const i = state.entityList.findIndex((e) => e.id === id);
  if (i >= 0) state.entityList.splice(i, 1);
  state.entities.delete(id);
}

test('convergence: runtime materialized stepping ≡ runtime virtual catch-up (state), and surfaces the exact kernel intents', () => {
  const SEED = 55;
  const T = 12; const STEP = 0.5; const N = Math.round(T / STEP); // 24×0.5 === 12 exactly

  // Path A — onscreen: step the runtime-managed job materialized at exact dt, collecting bus intents.
  const simA = boot(SEED);
  const eA = hull(simA, 'conv');
  simA.helpers.npcJobs.assign(eA, spec());
  const jobsA = simA.registry.get('npcJobsRuntime');
  const intentsA = [];
  for (const ev of NPCJOBS_EVENTS) simA.bus.on(ev, (i) => intentsA.push(i));
  for (let i = 0; i < N; i++) simA.step(STEP);
  const jA = jobsA._byId()['job:conv'].job;

  // Path B — offscreen: SAME seed+id → identical job. Virtualize on exit, elapse the WHOLE interval,
  // re-enter → one aggregated catch-up + materialize.
  const simB = boot(SEED);
  const eB = hull(simB, 'conv');
  simB.helpers.npcJobs.assign(eB, spec());
  const jobsB = simB.registry.get('npcJobsRuntime');
  const entryB = jobsB._byId()['job:conv'];
  simB.bus.emit('sector:exit', { sectorId: 'sector_a' });
  despawn(simB.state, eB.id);
  simB.state.simTime = entryB.lastAdvanceSimT + T;
  hull(simB, 'conv'); // rematerialized hull, same worldRecordId
  simB.bus.emit('sector:enter', { sectorId: 'sector_a' });
  const jB = jobsB._byId()['job:conv'].job;

  assert.deepEqual(snap(jB), snap(jA),
    'the offscreen catch-up reaches the identical job state as onscreen tick-stepping');

  // The materialized path surfaces exactly the kernel's intent stream for the same total advance.
  const ref = createJob({ ...spec(), id: 'job:conv' }, SEED);
  const refIntents = advance(ref, T);
  assert.deepEqual(snapIntents(intentsA), snapIntents(refIntents),
    'runtime surfaces the exact kernel intent sequence (no drop / dup / reorder)');
  assert.deepEqual(snap(jA), snap(ref), 'runtime job state matches the kernel reference');
});
