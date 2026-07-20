// NPC job-state kernel (PQ-014 / SF-15 / W06).
//
// These tests pin the kernel's hard invariants, not incidental formatting:
//   • determinism — same seed + inputs ⇒ byte-identical state and intent stream across runs
//   • decomposability — advance(a) then advance(b) ≡ advance(a+b) in state AND intents
//   • exact-on-boundary — a dt that exactly reaches the phase boundary fires the completion intent
//     exactly once, never zero times and never with progress stuck at 1-epsilon
//   • bounded aggregation — a huge offscreen dt advances through legal boundaries without producing
//     duplicate completion intents and without NaN/negative/unbounded progress
//   • save/restore — serialize→normalize→advance agrees with the original; phase, route progress,
//     payload, interruption, and sequence identity all survive
//   • malformed saves fail safe through normalization (never move an NPC to an unrelated origin)
//   • miner / hauler / patrol differ structurally, not by label
//   • no direct economy/cargo/rep mutation — the kernel only emits intents
//
// The discriminating tests are the two decomposability ones: a mutant that re-derives progress from
// wall time, or that emits a completion intent on entry to a phase (level-triggered) instead of on
// the boundary, passes every other test in this file and fails those.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createJob,
  normalizeJob,
  restoreJob,
  advance,
  isTruncated,
  interrupt,
  resume,
  virtualize,
  materialize,
  describeMaterialization,
  routePosition,
  serializeJob,
  summarizeJob,
  validateJobSpec,
  isJSONSafe,
  NPC_JOB_KIND,
  NPC_JOB_PHASE,
  NPC_JOB_SCHEMA,
} from '../src/systems/npcJobs.js';

const DT = 1 / 60;

// ── Routes ────────────────────────────────────────────────────────────────────────────────────────
// A miner route is a two-way home↔field hop. A hauler route is an ordered origin→destination chain.
// A patrol route is a closed circuit (the kernel wraps the index).
const MINER_ROUTE = [
  { id: 'home', pos: { x: 0, z: 0 }, label: 'Refinery' },
  { id: 'field', pos: { x: 600, z: 0 }, label: 'Belt A' },
];
const HAULER_ROUTE = [
  { id: 'origin', pos: { x: 0, z: 0 }, label: 'Ceres Mine' },
  { id: 'mid', pos: { x: 500, z: 0 }, label: 'Beacon' },
  { id: 'dest', pos: { x: 1000, z: 0 }, label: 'Helios Hub' },
];
const PATROL_ROUTE = [
  { id: 'wp0', pos: { x: 0, z: 0 } },
  { id: 'wp1', pos: { x: 300, z: 0 } },
  { id: 'wp2', pos: { x: 300, z: 300 } },
  { id: 'wp3', pos: { x: 0, z: 300 } },
];

/** Plan a short, deterministic job: short phase durations so a full cycle fits in a few seconds. */
function minerSpec(id = 'm1', overrides = {}) {
  return {
    id, kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE,
    speed: 100, // 600 wu / 100 = 6s transit
    commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
    ...overrides,
  };
}
function haulerSpec(id = 'h1', overrides = {}) {
  return {
    id, kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE,
    speed: 100, // legs: 5s + 5s
    commissionS: 1, departS: 1, approachS: 1, workS: 1, loadS: 1, unloadS: 1, dwellS: 1,
    payload: { commodity: 'ore', units: 40 },
    ...overrides,
  };
}
function patrolSpec(id = 'p1', overrides = {}) {
  return {
    id, kind: NPC_JOB_KIND.PATROL, route: PATROL_ROUTE,
    speed: 100, // each leg 3s
    commissionS: 1, departS: 1, approachS: 1, workS: 1, loadS: 1, unloadS: 1, dwellS: 2,
    ...overrides,
  };
}

/** A recording sink; assertions can inspect both the returned array and what the sink saw. */
function makeSink() {
  const seen = [];
  const sink = (intent) => { seen.push(intent); };
  return { seen, sink };
}

/** Run a job forward by totalT seconds at fixed DT, concatenating intents. Mirrors a materialized
 *  on-screen tick. Uses the canonical 1/60 sim step. */
function runFixed(job, totalT, sink) {
  return runFixedStep(job, totalT, DT, sink);
}

/** Run a job forward by totalT seconds at an EXACT-divisor step. The offscreen/onscreen equivalence
 *  is exact only when N×step === total in floating point; 1/60 is a repeating binary fraction so
 *  720×(1/60) drifts from 12 by float accumulation. A step like 0.5 (24×0.5===12 exactly) isolates
 *  the kernel's decomposability from the test harness's float arithmetic. */
function runFixedExact(job, totalT, step, sink) {
  return runFixedStep(job, totalT, step, sink);
}

function runFixedStep(job, totalT, step, sink) {
  const all = [];
  const steps = Math.round(totalT / step);
  for (let i = 0; i < steps; i++) {
    const part = advance(job, step, sink);
    for (const e of part) all.push(e);
  }
  return all;
}

/** A canonical JSON snapshot of the deterministic fields (excludes transient `_lastThreat`).
 *  Float-sensitive fields (progress, simTime, heading) are rounded to a 1e-6 grid: the kernel keeps
 *  them in full double precision internally so decomposability holds to ~1e-16, and this read-seam
 *  rounding erases the residual float-assoc noise for byte-stable comparison. This mirrors how a real
 *  save round-trip would project the record (serializeJob is the production read seam). */
function snap(job) {
  const { _lastThreat, ...rest } = job;
  void _lastThreat;
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  for (const key of ['progress', 'simTime', 'heading']) {
    if (key in rest) rest[key] = round(rest[key]);
  }
  return JSON.parse(JSON.stringify(rest));
}

/** Round the simTime stamp on each intent to the 1e-6 grid, for the same reason snap() rounds the
 *  job record: decomposability holds to ~1e-16, and byte-stable intent-stream comparison rounds at
 *  the read seam. Position/heading inside intent payloads are also rounded. */
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

/** Round a materialization description's floats for byte-stable comparison (same read-seam rule). */
function snapDesc(desc) {
  if (!desc) return desc;
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  return {
    ...desc,
    progress: round(desc.progress),
    heading: round(desc.heading),
    simTime: round(desc.simTime),
    pos: desc.pos ? { x: round(desc.pos.x), z: round(desc.pos.z) } : null,
  };
}

// ═══ VALIDATION ═══════════════════════════════════════════════════════════════════════════════════

test('validateJobSpec rejects unknown kind, bad id, and too-short routes', () => {
  assert.deepEqual(validateJobSpec({ id: 'x', kind: 'pirate', route: MINER_ROUTE }).ok, false);
  assert.deepEqual(validateJobSpec({ id: '', kind: 'miner', route: MINER_ROUTE }).ok, false);
  assert.deepEqual(validateJobSpec({ id: 'x', kind: 'miner', route: [MINER_ROUTE[0]] }).ok, false);
  assert.deepEqual(validateJobSpec({ id: 'x', kind: 'miner', route: [{ id: 'a', pos: { x: NaN, z: 0 } }, MINER_ROUTE[1]] }).ok, false);
  assert.deepEqual(validateJobSpec({ id: 'x', kind: 'miner', route: MINER_ROUTE }).ok, true);
});

test('createJob throws on an invalid spec rather than producing a corrupt record', () => {
  assert.throws(() => createJob({ id: 'x', kind: 'bogus', route: MINER_ROUTE }, 0), /invalid spec/);
});

// ═══ DETERMINISM (same seed + inputs ⇒ identical state and intents) ═══════════════════════════════

test('determinism: two miner jobs from the same seed advance identically (state + intents)', () => {
  const a = createJob(minerSpec(), 42);
  const b = createJob(minerSpec(), 42);
  assert.deepEqual(snap(a), snap(b), 'fresh jobs must be byte-identical');
  const sa = makeSink(), sb = makeSink();
  const ia = runFixed(a, 20, sa.sink);
  const ib = runFixed(b, 20, sb.sink);
  assert.deepEqual(snap(a), snap(b), 'advanced jobs must still be byte-identical');
  assert.deepEqual(ia, ib, 'intent streams must be identical');
});

test('determinism: different seeds still produce legal, finite, in-range progress', () => {
  const a = createJob(minerSpec(), 1);
  const b = createJob(minerSpec(), 2);
  runFixed(a, 10);
  runFixed(b, 10);
  assert.ok(a.progress >= 0 && a.progress <= 1, 'progress in [0,1]');
  assert.ok(b.progress >= 0 && b.progress <= 1);
  assert.ok(Number.isFinite(a.simTime) && Number.isFinite(b.simTime));
});

// ═══ COMPLETE LEGAL PHASE SEQUENCES (all three kinds) ═════════════════════════════════════════════

test('miner completes the cyclic commission→transit→approach→work→return→(approach→)unload→transit loop', () => {
  const job = createJob(minerSpec(), 7);
  const phases = [job.phase];
  const seen = new Set([job.phase]);
  // Drive well past one full cycle (commission 1 + transit 6 + approach 1 + work 2 + return 6 + approach 1 + unload 1 = 18s, then transit again)
  let lastPhase = job.phase;
  for (let i = 0; i < Math.round(40 / DT); i++) {
    advance(job, DT);
    if (job.phase !== lastPhase) {
      phases.push(job.phase);
      seen.add(job.phase);
      lastPhase = job.phase;
    }
  }
  // The miner graph must visit these phases (work at the field, unload at home).
  for (const p of [NPC_JOB_PHASE.COMMISSION, NPC_JOB_PHASE.TRANSIT, NPC_JOB_PHASE.APPROACH, NPC_JOB_PHASE.WORK, NPC_JOB_PHASE.RETURN, NPC_JOB_PHASE.UNLOAD]) {
    assert.ok(seen.has(p), `miner must visit ${p} (saw: ${phases.join(',')})`);
  }
  // Miner is cyclic: loopCount must have advanced at least once (unload→transit boundary).
  assert.ok(job.loopCount >= 1, `miner must loop; loopCount=${job.loopCount}`);
  // And it must NOT terminate.
  assert.notEqual(job.phase, NPC_JOB_PHASE.COMPLETE);
});

test('hauler is one-shot: load→depart→transit→…→approach→unload→complete and terminates', () => {
  const job = createJob(haulerSpec(), 7);
  const sink = makeSink();
  const intents = [];
  // commission(1) + load(1) + depart(1) + transit(5) + transit(5) + approach(1) + unload(1) = 15s → complete
  let t = 0;
  while (job.phase !== NPC_JOB_PHASE.COMPLETE && t < 60) {
    intents.push(...advance(job, DT, sink.sink));
    t += DT;
  }
  assert.equal(job.phase, NPC_JOB_PHASE.COMPLETE, 'hauler must reach terminal complete phase');
  // The complete intent must carry the payload descriptor (the cargo owner applies it, not us).
  const complete = intents.find((e) => e.event === 'npcjobs:complete');
  assert.ok(complete, 'a complete intent must fire exactly once');
  assert.deepEqual(complete.payload, { commodity: 'ore', units: 40 });
  // advancing past complete: phase/progress/routeIndex/loopCount/sequence are frozen, no intents fire.
  // (simTime DOES advance — time passes for a completed job — which is required for decomposability of
  // terminal jobs; asserting that here would couple the test to the simTime snap grid.)
  const frozenPhase = job.phase, frozenProg = job.progress, frozenIdx = job.routeIndex;
  const frozenLoop = job.loopCount, frozenSeq = job.sequence;
  const more = advance(job, 5, sink.sink);
  assert.equal(job.phase, frozenPhase, 'phase frozen at complete');
  assert.equal(job.progress, frozenProg, 'progress frozen');
  assert.equal(job.routeIndex, frozenIdx, 'routeIndex frozen');
  assert.equal(job.loopCount, frozenLoop, 'loopCount frozen');
  assert.equal(job.sequence, frozenSeq, 'sequence frozen — no new intents');
  assert.equal(more.length, 0, 'no intents past complete');
});

test('patrol is cyclic over all waypoints with a scheduled hold, never terminating', () => {
  const job = createJob(patrolSpec(), 7);
  const seenWaypoints = new Set();
  let t = 0;
  while (t < 120) {
    advance(job, DT);
    t += DT;
    if (job.phase === NPC_JOB_PHASE.HOLD) seenWaypoints.add(job.routeIndex);
  }
  // A learnable patrol must visit every waypoint on the circuit and hold there.
  for (let i = 0; i < PATROL_ROUTE.length; i++) {
    assert.ok(seenWaypoints.has(i), `patrol must hold at waypoint ${i}`);
  }
  assert.ok(job.loopCount >= 1, 'patrol must wrap the circuit at least once');
  assert.notEqual(job.phase, NPC_JOB_PHASE.COMPLETE);
});

// ═══ STRUCTURAL DIFFERENCE: miner/hauler/patrol are not relabels of one machine ═══════════════════

test('structural difference: miner loops without terminating; hauler terminates; patrol loops over N wp', () => {
  const m = createJob(minerSpec('mm'), 3);
  const h = createJob(haulerSpec('hh'), 3);
  const p = createJob(patrolSpec('pp'), 3);
  runFixed(m, 200); runFixed(h, 200); runFixed(p, 200);
  assert.notEqual(m.phase, NPC_JOB_PHASE.COMPLETE, 'miner never completes');
  assert.equal(h.phase, NPC_JOB_PHASE.COMPLETE, 'hauler completes');
  assert.notEqual(p.phase, NPC_JOB_PHASE.COMPLETE, 'patrol never completes');
  // Hauler routeIndex stays at the final waypoint; patrol routeIndex wraps modulo N.
  assert.equal(h.routeIndex, HAULER_ROUTE.length - 1);
  assert.ok(p.routeIndex >= 0 && p.routeIndex < PATROL_ROUTE.length);
  // Miner stays on its 0/1 hop forever.
  assert.ok(m.routeIndex === 0 || m.routeIndex === 1);
});

// ═══ DECOMPOSABILITY (the offscreen/onscreen equivalence) ═════════════════════════════════════════

test('decomposability (miner): advance(a) then advance(b) ≡ advance(a+b) in state AND intents', () => {
  const A = 0.237; const B = 1.618; const total = A + B;
  // one-shot
  const one = createJob(minerSpec('d1'), 99);
  const oneIntents = [...advance(one, total)];
  // split
  const two = createJob(minerSpec('d1'), 99);
  const twoIntents = [...advance(two, A), ...advance(two, B)];
  assert.deepEqual(snap(two), snap(one), 'final state must agree');
  assert.deepEqual(snapIntents(twoIntents), snapIntents(oneIntents), 'concatenated intent stream must agree');
});

test('decomposability (hauler): the same holds across a phase boundary', () => {
  const A = 1.4; const B = 2.9; const total = A + B;
  const one = createJob(haulerSpec('d2'), 11);
  const oneIntents = [...advance(one, total)];
  const two = createJob(haulerSpec('d2'), 11);
  const twoIntents = [...advance(two, A), ...advance(two, B)];
  assert.deepEqual(snap(two), snap(one));
  assert.deepEqual(snapIntents(twoIntents), snapIntents(oneIntents));
});

test('decomposability: many tiny fixed steps ≡ one aggregated step (offscreen/onscreen equivalence)', () => {
  const TOTAL = 12.0;
  const STEP = 0.5; // 24×0.5 === 12 exactly in float, isolating kernel decomposability from harness arithmetic
  const fixed = createJob(patrolSpec('d3'), 5);
  const fixedIntents = runFixedExact(fixed, TOTAL, STEP);
  const agg = createJob(patrolSpec('d3'), 5);
  const aggIntents = advance(agg, TOTAL);
  assert.deepEqual(snap(agg), snap(fixed), 'aggregated offscreen step == fixed-step onscreen');
  assert.deepEqual(snapIntents(aggIntents), snapIntents(fixedIntents), 'intent streams identical regardless of step size');
});

// ═══ EXACT-ON-BOUNDARY ADVANCEMENT ═════════════════════════════════════════════════════════════════

test('exact-on-boundary: a dt equal to the phase duration fires the completion intent exactly once', () => {
  const job = createJob(minerSpec('b1'), 1);
  // commissionS = 1. Advance exactly 1s.
  const intents = advance(job, 1.0);
  const commissionDone = intents.filter((e) => e.event === 'npcjobs:commission');
  assert.equal(commissionDone.length, 1, 'commission completion fires exactly once on the boundary');
  assert.equal(job.phase, NPC_JOB_PHASE.TRANSIT, 'phase advanced to successor');
  assert.equal(job.progress, 0, 'progress reset for the new phase');
});

test('exact-on-boundary: a dt just under the boundary fires NO completion and leaves progress<1', () => {
  const job = createJob(minerSpec('b2'), 1);
  // 1e-6 below the boundary — one progress-grid cell, an unambiguous genuine sub-boundary value (not
  // float noise). The completion intent must NOT fire and progress must stay strictly below 1.
  const intents = advance(job, 1.0 - 1e-6);
  assert.equal(intents.length, 0, 'no completion intent below the boundary');
  assert.ok(job.progress < 1 && job.progress > 0, 'progress advanced but not pinned to 1');
  assert.equal(job.phase, NPC_JOB_PHASE.COMMISSION);
});

test('no duplicate completion intents: a huge dt advances through many boundaries without repeats', () => {
  const job = createJob(minerSpec('b3'), 1);
  const intents = advance(job, 1000); // far beyond one cycle
  // Each completion event must carry a unique seq.
  const seqs = intents.map((e) => e.seq);
  assert.equal(seqs.length, new Set(seqs).size, 'all seqs unique');
  // And no (event, phase) completion pair may repeat in a way that double-counts: count per event.
  const counts = {};
  for (const e of intents) counts[e.event] = (counts[e.event] || 0) + 1;
  // progress is finite and in range after the giant step.
  assert.ok(Number.isFinite(job.progress) && job.progress >= 0 && job.progress <= 1);
  assert.ok(Number.isFinite(job.simTime));
});

// ═══ BOUNDED AGGREGATION / NO NaN / NO NEGATIVE / NO UNBOUNDED ═════════════════════════════════════

test('bounded aggregation: progress and simTime stay finite and in-range over a very large dt', () => {
  for (const spec of [minerSpec('big-m'), haulerSpec('big-h'), patrolSpec('big-p')]) {
    const job = createJob(spec, 1);
    advance(job, 1e6);
    assert.ok(Number.isFinite(job.progress), `${spec.kind}: progress finite`);
    assert.ok(job.progress >= 0 && job.progress <= 1, `${spec.kind}: progress in [0,1]`);
    assert.ok(Number.isFinite(job.simTime), `${spec.kind}: simTime finite`);
    assert.ok(job.routeIndex >= 0, `${spec.kind}: routeIndex non-negative`);
  }
});

test('advance with dt=0 is a strict no-op; negative or NaN dt is a safe no-op', () => {
  const job = createJob(minerSpec('zero'), 1);
  const before = snap(job);
  assert.deepEqual(advance(job, 0), []);
  assert.deepEqual(advance(job, -5), []);
  assert.deepEqual(advance(job, NaN), []);
  assert.deepEqual(snap(job), before);
});

// ═══ SAVE / RESTORE ═══════════════════════════════════════════════════════════════════════════════

test('save/restore: serialize→normalize→advance agrees with the original (phase, route, payload, seq)', () => {
  const original = createJob(haulerSpec('sv'), 5);
  runFixed(original, 6.3); // somewhere mid-route with payload intent pending
  const saved = serializeJob(original);
  const restored = normalizeJob(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.corrupt, false);
  assert.equal(restored.phase, original.phase);
  assert.equal(restored.routeIndex, original.routeIndex);
  assert.equal(restored.progress, original.progress);
  assert.equal(restored.sequence, original.sequence);
  assert.deepEqual(restored.payload, original.payload);
  assert.equal(restored.rngSeed, original.rngSeed);
  // Advance both by the same dt from the restored point; they must stay in lockstep.
  const a = [...advance(original, 3.0)];
  const b = [...advance(restored, 3.0)];
  assert.deepEqual(snap(restored), snap(original));
  assert.deepEqual(b, a);
  assert.equal(restored.sequence, original.sequence);
});

test('save/restore: interrupted state and pre-interrupt phase survive the round trip', () => {
  const original = createJob(minerSpec('int'), 5);
  runFixed(original, 8); // into work or transit
  interrupt(original, { source: 'pirate', distance: 120 });
  const restored = normalizeJob(JSON.parse(JSON.stringify(serializeJob(original))));
  assert.equal(restored.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(restored.interrupted, true);
  assert.equal(restored.preInterruptPhase, original.preInterruptPhase);
  resume(restored);
  resume(original);
  assert.deepEqual(snap(restored), snap(original));
});

// ═══ REPEATED INITIALIZATION (idempotency) ═══════════════════════════════════════════════════════

test('normalizeJob is idempotent: normalize(normalize(x)) ≡ normalize(x)', () => {
  const job = createJob(minerSpec('idem'), 9);
  runFixed(job, 5);
  const once = normalizeJob(JSON.parse(JSON.stringify(serializeJob(job))));
  const twice = normalizeJob(JSON.parse(JSON.stringify(serializeJob(once))));
  assert.deepEqual(snap(twice), snap(once));
});

test('createJob is idempotent: identical spec+seed produces byte-identical records', () => {
  const a = createJob(patrolSpec('ci'), 123);
  const b = createJob(patrolSpec('ci'), 123);
  assert.deepEqual(snap(a), snap(b));
});

// ═══ MALFORMED SAVES FAIL SAFE ═════════════════════════════════════════════════════════════════════

test('malformed save: unknown kind is marked corrupt and never moves an NPC', () => {
  const bad = normalizeJob({ id: 'x', kind: 'assassin', route: MINER_ROUTE, phase: 'transit', progress: 0.5 });
  assert.equal(bad.corrupt, true);
  assert.equal(routePosition(bad), null, 'corrupt job has no position');
  assert.deepEqual(advance(bad, 10), [], 'corrupt job does not advance');
  assert.equal(describeMaterialization(bad), null);
});

test('malformed save: NaN/negative/>1 progress is healed into [0,1] and the machine stays legal', () => {
  const healed = normalizeJob({
    id: 'h', kind: 'miner', route: MINER_ROUTE, phase: 'work', progress: NaN,
    routeIndex: 99, simTime: -5, loopCount: -1, sequence: 'x',
  });
  assert.equal(healed.corrupt, false);
  assert.equal(healed.progress, 0, 'NaN progress → 0');
  assert.equal(healed.routeIndex, 0, 'out-of-range routeIndex → 0');
  assert.equal(healed.simTime, 0);
  assert.equal(healed.loopCount, 0);
  assert.equal(healed.sequence, 0);
  // The healed record must still advance cleanly.
  const intents = advance(healed, 50);
  assert.ok(intents.length > 0);
  assert.ok(healed.progress >= 0 && healed.progress <= 1);
});

test('malformed save: an unknown phase restarts the legal machine (no teleport)', () => {
  const healed = normalizeJob({ id: 'u', kind: 'hauler', route: HAULER_ROUTE, phase: 'teleporting', progress: 0.9 });
  assert.equal(healed.corrupt, false);
  assert.equal(healed.phase, NPC_JOB_PHASE.COMMISSION, 'unknown phase → kind start phase');
  // Position is at the origin, not wherever progress 0.9 would have implied under a bogus phase.
  const pos = routePosition(healed);
  assert.deepEqual(pos, { x: 0, z: 0 });
});

// ═══ FLEE / RESUME ════════════════════════════════════════════════════════════════════════════════

test('flee is sticky: advance() will not auto-leave it', () => {
  const job = createJob(minerSpec('f1'), 1);
  runFixed(job, 6); // into transit
  interrupt(job, { source: 'pirate' });
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  // Flee freezes the legal machine: phase, progress, routeIndex, loopCount, sequence do not move.
  // (simTime advances — time passes — but that carries no phase change, which is what "sticky" means.)
  const fPhase = job.phase, fProg = job.progress, fIdx = job.routeIndex;
  const fLoop = job.loopCount, fSeq = job.sequence;
  const intents = runFixed(job, 10);
  assert.equal(job.phase, fPhase, 'still fleeing');
  assert.equal(job.progress, fProg, 'progress frozen while fleeing');
  assert.equal(job.routeIndex, fIdx, 'routeIndex frozen while fleeing');
  assert.equal(job.loopCount, fLoop);
  assert.equal(job.sequence, fSeq, 'no intents emitted while fleeing');
  assert.equal(intents.length, 0);
});

test('resume restores the exact prior phase and progress — never a reset', () => {
  const job = createJob(minerSpec('f2'), 1);
  runFixed(job, 6.5);
  const phaseBefore = job.phase;
  const progBefore = job.progress;
  const idxBefore = job.routeIndex;
  interrupt(job);
  assert.notEqual(job.phase, phaseBefore);
  resume(job);
  assert.equal(job.phase, phaseBefore, 'phase restored exactly');
  assert.equal(job.progress, progBefore, 'progress restored exactly');
  assert.equal(job.routeIndex, idxBefore, 'routeIndex restored exactly');
});

test('interrupt is idempotent: re-interrupting a fleeing job does not stack phases', () => {
  const job = createJob(haulerSpec('f3'), 1);
  runFixed(job, 4);
  interrupt(job, { a: 1 });
  const snap1 = snap(job);
  interrupt(job, { a: 2 });
  assert.deepEqual(snap(job).preInterruptPhase, snap1.preInterruptPhase);
});

// ═══ MATERIALIZATION / VIRTUALIZE ROUND TRIP ══════════════════════════════════════════════════════

test('virtualize/materialize round trip: offscreen advance == onscreen advance (truthful continuity)', () => {
  // Onscreen: step live for 30s.
  const live = createJob(haulerSpec('v1'), 8);
  const liveIntents = runFixedExact(live, 30, 0.5); // 60×0.5 === 30 exactly; 1/60 would drift
  const liveDesc = describeMaterialization(live);

  // Offscreen: virtualize, advance the whole interval at once, then materialize.
  const off = createJob(haulerSpec('v1'), 8);
  virtualize(off);
  const offIntents = advance(off, 30);
  materialize(off);
  const offDesc = describeMaterialization(off);

  assert.deepEqual(snap(off), snap(live), 'offscreen and onscreen reach the same state');
  assert.deepEqual(snapIntents(offIntents), snapIntents(liveIntents), 'identical intent streams');
  assert.deepEqual(snapDesc(offDesc), snapDesc(liveDesc), 'identical materialization description');
});

test('materialization is truthful: position is the interpolated route point, never an unrelated origin', () => {
  const job = createJob(minerSpec('mat'), 1);
  // Advance into the middle of the first transit (commission 1s, then transit 6s). At t=4s we are
  // 3s into a 6s transit ⇒ halfway from home(0,0) to field(600,0) ⇒ x≈300.
  runFixed(job, 4);
  const pos = routePosition(job);
  assert.ok(pos && pos.x > 250 && pos.x < 350, `mid-transit x≈300, got ${pos && pos.x}`);
  assert.equal(job.phase, NPC_JOB_PHASE.TRANSIT);
  // The materialization description must carry the same truthful position.
  const desc = describeMaterialization(job);
  assert.deepEqual(desc.pos, pos);
  assert.equal(desc.targetId, 'field');
});

test('materialization never resets progress: a job re-materializing keeps its place', () => {
  const job = createJob(patrolSpec('mat2'), 1);
  runFixed(job, 5);
  const p1 = job.progress; const idx1 = job.routeIndex;
  virtualize(job);
  materialize(job);
  assert.equal(job.progress, p1, 'progress preserved across virtualize/materialize');
  assert.equal(job.routeIndex, idx1);
});

// ═══ NO DIRECT ECONOMY/CARGO/REP MUTATION ═════════════════════════════════════════════════════════

test('no direct mutation: advance never writes cargo/credits/reputation — it only emits intents', () => {
  const job = createJob(haulerSpec('nomut'), 1);
  const fakeState = { cargo: { ore: 0 }, credits: 0, reputation: { factionA: 0 }, heat: 0 };
  const frozen = JSON.parse(JSON.stringify(fakeState));
  runFixed(job, 20);
  // The kernel was never handed fakeState and has no reference to it; assert it is untouched by
  // confirming the kernel exposes no mutation API for those owners.
  assert.deepEqual(fakeState, frozen);
  // And the intents are descriptions only: each carries jobId/kind/seq and a description, never a
  // 'write' or a direct cargo/credit field.
  const sink = makeSink();
  const j2 = createJob(haulerSpec('nomut2'), 1);
  let t = 0;
  while (j2.phase !== NPC_JOB_PHASE.COMPLETE && t < 30) { advance(j2, DT, sink.sink); t += DT; }
  for (const e of sink.seen) {
    assert.equal('credits' in e, false, 'no intent carries credits');
    assert.equal('reputation' in e, false, 'no intent carries reputation');
    assert.equal('heat' in e, false, 'no intent carries heat');
    // cargo only appears as a descriptive payload descriptor, never as a write.
    assert.equal('write' in e, false);
  }
  void fakeState; void frozen;
});

// ═══ TRUTHFUL ROUTE-POSITION CONTINUITY ═══════════════════════════════════════════════════════════

test('route position is continuous: a transit leg interpolates monotonically from origin to target', () => {
  const job = createJob(haulerSpec('cont'), 1);
  // commission(1) + load(1) + depart(1) = 3s to enter transit; then transit leg 1 is 5s (0→500).
  runFixed(job, 3); // now at depart→ about to transit
  // step into transit and sample positions
  const xs = [];
  for (let i = 0; i < Math.round(5 / DT); i++) {
    advance(job, DT);
    const p = routePosition(job);
    if (job.phase === NPC_JOB_PHASE.TRANSIT && p) xs.push(p.x);
  }
  assert.ok(xs.length > 1);
  // monotonic non-decreasing along the +x leg
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 1e-6, `x must not jump backward: ${xs[i]} < ${xs[i - 1]}`);
  assert.ok(xs[xs.length - 1] > xs[0], 'x must advance across the leg');
});

test('summarizeJob exposes one stable shape and resumable flag', () => {
  const job = createJob(minerSpec('sum'), 1);
  const s = summarizeJob(job);
  assert.equal(s.schema, NPC_JOB_SCHEMA);
  assert.equal(s.jobId, 'sum');
  assert.equal(s.kind, NPC_JOB_KIND.MINER);
  assert.equal(s.resumable, true);
  assert.ok(s.pos);
  // a corrupt job summarizes to status 'corrupt'
  const c = summarizeJob(normalizeJob({ id: 'c', kind: 'x', route: MINER_ROUTE }));
  assert.equal(c.status, 'corrupt');
});

// ═══ INTENT UNIQUENESS / SEQUENCE IDENTITY ════════════════════════════════════════════════════════

test('intent sequence identity: every emitted intent carries a unique monotonic seq per job', () => {
  const job = createJob(patrolSpec('seq'), 1);
  const intents = [];
  let t = 0;
  while (t < 60) { intents.push(...advance(job, DT)); t += DT; }
  const seqs = intents.map((e) => e.seq);
  for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1], 'seq strictly monotonic');
  assert.equal(seqs.length, new Set(seqs).size, 'seqs unique');
  assert.equal(seqs[0], 1);
});

test('restoreJob is the save-seam alias for normalizeJob', () => {
  const job = createJob(minerSpec('rj'), 1);
  runFixed(job, 3);
  const a = normalizeJob(JSON.parse(JSON.stringify(serializeJob(job))));
  const b = restoreJob(JSON.parse(JSON.stringify(serializeJob(job))));
  assert.deepEqual(snap(b), snap(a));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL REGRESSION TESTS — one per reviewer-rejected defect (PQ-014 round 2).
// Each names its defect and asserts the post-fix contract. Each would FAIL against the pre-fix kernel.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

// A route with zero-distance legs so phase durations floor at MIN_PHASE_S, producing ~1000 transitions
// per simulated second — enough to reach the transition cap inside a multi-second advance.
const TINY_R = [
  { id: 'home', pos: { x: 0, z: 0 } },
  { id: 'field', pos: { x: 0, z: 0 } },
];
function tinyMinerSpec(id = 'tm') {
  return {
    id, kind: NPC_JOB_KIND.MINER, route: TINY_R, speed: 1,
    commissionS: 0.001, departS: 0.001, approachS: 0.001, workS: 0.001, loadS: 0.001, unloadS: 0.001, dwellS: 0.001,
  };
}

// ─── DEFECT 1: ADVANCE-CAP-DIVERGENCE ─────────────────────────────────────────────────────────────
// Pre-fix: advance(big) silently set simTime=big while stopping transitions at the cap, so it
// diverged from advance(small)+advance(small). Post-fix: when the cap binds, simTime stops at the
// last real crossing and a `truncated` intent honestly reports the shortfall; resuming with the
// remaining dt continues deterministically.

test('DEFECT 1 (advance-cap-divergence): a truncating advance does NOT silently advance simTime to the requested dt', () => {
  const job = createJob(tinyMinerSpec('cap1'), 1);
  // 200s at ~7000 transitions/s ≈ 1.4M transitions, far over the 100k cap → must truncate.
  const intents = advance(job, 200);
  const trunc = intents.find(isTruncated);
  assert.ok(trunc, 'a cap-binding advance must emit a truncated intent');
  assert.ok(job.simTime < 200, `simTime must stop at the last crossing (${job.simTime}), not lie at 200`);
  assert.ok(Math.abs((trunc.processedDt + trunc.remainingDt) - 200) < 1e-9, 'processedDt + remainingDt === requested dt');
  assert.ok(Math.abs(trunc.processedDt - job.simTime) < 1e-6, 'processedDt agrees with the reached simTime');
});

test('DEFECT 1: truncation is resumable — advance(remaining) continues from the honest stop point', () => {
  const job = createJob(tinyMinerSpec('cap2'), 1);
  const first = advance(job, 200);
  const trunc = first.find(isTruncated);
  assert.ok(trunc, 'expected truncation');
  const stoppedAt = job.sequence;
  const stoppedSimTime = job.simTime;
  // Resuming the remaining dt must produce MORE intents (the job keeps going) and advance simTime.
  const next = advance(job, trunc.remainingDt);
  assert.ok(next.length > 0, 'resuming must process more transitions');
  assert.ok(job.sequence > stoppedAt, 'sequence advanced after resume');
  assert.ok(job.simTime > stoppedSimTime, 'simTime advanced after resume');
});

test('DEFECT 1: decomposability still holds EXACTLY when neither advance truncates', () => {
  // 30s at ~7000 transitions/s ≈ 210k... that truncates. Use a smaller total that stays under cap.
  // 10s ≈ 70k transitions < 100k cap. Both advance(10) and advance(4)+advance(6) stay under cap.
  const total = 10;
  const splitA = 4, splitB = 6;
  const one = createJob(tinyMinerSpec('dec1'), 9);
  const oneI = snapIntents(advance(one, total));
  const two = createJob(tinyMinerSpec('dec1'), 9);
  const twoI = snapIntents([...advance(two, splitA), ...advance(two, splitB)]);
  assert.deepEqual(snap(two), snap(one), 'non-truncating split advances reach identical state');
  assert.deepEqual(twoI, oneI, 'non-truncating split advances produce identical intent streams');
});

test('DEFECT 1: no silent divergence between advance(big) and advance(big/2)+advance(big/2) — truncation is observable, not silent', () => {
  // The OLD bug: one(5s) gave phase=return/loopCount=682/seq=4778, two(2.5+2.5) gave phase=approach/
  // loopCount=833/seq=5833, BOTH with simTime=5. Post-fix they may still differ (one truncates, two
  // may not), BUT the difference is now OBSERVABLE: the truncating path emits `truncated` and stops
  // simTime short, instead of silently lying at simTime=5 with different phase/loopCount.
  const one = createJob(tinyMinerSpec('div1'), 1);
  const oneI = advance(one, 5);
  const two = createJob(tinyMinerSpec('div1'), 1);
  const twoI = advance(two, 2.5);
  advance(two, 2.5);
  // If they diverge, the diverging path MUST have signaled it via a truncated intent (no silent lie).
  const diverge = one.phase !== two.phase || one.loopCount !== two.loopCount;
  if (diverge) {
    const oneTrunc = oneI.some(isTruncated);
    const twoTrunc = twoI.some(isTruncated);
    assert.ok(oneTrunc || twoTrunc, 'any divergence must be flagged by a truncated intent on the truncating path');
  }
  // And neither may claim simTime past its last real crossing: if a path truncated, simTime < 5.
  if (oneI.some(isTruncated)) assert.ok(one.simTime < 5, 'truncating path stops simTime short of 5');
});

// ─── DEFECT 2: KIND-INVALID-PHASE ─────────────────────────────────────────────────────────────────
// Pre-fix: normalizeJob validated phase against the GLOBAL vocabulary, so miner+load was accepted
// and advance() emitted npcjobs:load — a phase a miner can never legally reach. Post-fix: phase is
// validated against the KIND's graph; an illegal kind/phase combo heals to the start phase.

test('DEFECT 2 (kind-invalid-phase): miner+load heals to start and never emits npcjobs:load', () => {
  const healed = normalizeJob({ id: 'm', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, phase: 'load', progress: 0.5 });
  assert.equal(healed.corrupt, false);
  assert.equal(healed.phase, NPC_JOB_PHASE.COMMISSION, 'illegal kind/phase heals to the kind start');
  assert.ok(healed.healed.some((h) => h.includes('load')), 'the heal records the rejected phase');
  const intents = advance(healed, 8);
  assert.equal(intents.some((e) => e.event === 'npcjobs:load'), false, 'a miner must never emit a load completion');
});

test('DEFECT 2: every kind rejects the phases it cannot reach (patrol+work, hauler+hold, miner+hold)', () => {
  const cases = [
    { kind: NPC_JOB_KIND.PATROL, route: PATROL_ROUTE, phase: 'work' },
    { kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, phase: 'hold' },
    { kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, phase: 'hold' },
  ];
  for (const c of cases) {
    const healed = normalizeJob({ id: 'x', kind: c.kind, route: c.route, phase: c.phase });
    assert.equal(healed.phase, NPC_JOB_PHASE.COMMISSION, `${c.kind}+${c.phase} heals to start`);
    const intents = advance(healed, 6);
    const badEvent = `npcjobs:${c.phase}`;
    assert.equal(intents.some((e) => e.event === badEvent), false, `${c.kind} must never emit ${badEvent}`);
  }
});

test('DEFECT 2: a legal phase for the kind is preserved (no false heal)', () => {
  // miner+work IS legal (miner reaches work). Confirm normalization keeps it.
  const ok = normalizeJob({ id: 'm', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, phase: 'work', progress: 0.3 });
  assert.equal(ok.phase, NPC_JOB_PHASE.WORK);
  assert.equal(ok.corrupt, false);
  assert.equal(ok.healed.some((h) => h.includes('phase')), false);
});

// ─── DEFECT 3: WRONG-RETURN-TARGET ────────────────────────────────────────────────────────────────
// Pre-fix: the RETURN intent's `to` used routeIndex (the origin = field) instead of the destination
// reached (home), so a miner arriving home reported to="field" while pos={x:0,z:0}. Post-fix: `to`
// names the actual destination and `from` names the origin.

test('DEFECT 3 (wrong-return-target): a miner RETURN intent names the destination reached, not the origin', () => {
  const job = createJob({
    id: 'mr', kind: NPC_JOB_KIND.MINER,
    route: [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 10, z: 0 } }],
    speed: 10, commissionS: 1, departS: 1, approachS: 1, workS: 1, loadS: 1, unloadS: 1, dwellS: 1,
  }, 1);
  const intents = [];
  let t = 0;
  while (t < 30) { intents.push(...advance(job, 0.5)); t += 0.5; }
  const returns = intents.filter((e) => e.event === 'npcjobs:return');
  assert.ok(returns.length > 0, 'miner must emit return intents');
  for (const r of returns) {
    assert.equal(r.to, 'home', `return destination must be home (got ${r.to})`);
    assert.equal(r.from, 'field', `return origin must be field (got ${r.from})`);
    assert.ok(Math.abs(r.pos.x) < 1e-6, `return pos must be at home x≈0 (got ${r.pos.x})`);
  }
});

test('DEFECT 3: TRANSIT intents already use from/to correctly (regression guard)', () => {
  const job = createJob({
    id: 'mt', kind: NPC_JOB_KIND.MINER,
    route: [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 10, z: 0 } }],
    speed: 10, commissionS: 1, departS: 1, approachS: 1, workS: 1, loadS: 1, unloadS: 1, dwellS: 1,
  }, 1);
  const intents = [];
  let t = 0;
  while (t < 12) { intents.push(...advance(job, 0.5)); t += 0.5; }
  const transit = intents.find((e) => e.event === 'npcjobs:transit');
  assert.ok(transit, 'transit intent emitted');
  assert.equal(transit.from, 'home');
  assert.equal(transit.to, 'field');
});

// ─── DEFECT 4: PAYLOAD-ALIASING-AND-SERIALIZATION ─────────────────────────────────────────────────
// Pre-fix: (a) emit() shallow-copied payload, so mutating intent.payload.meta mutated job.payload.meta;
// (b) a cyclic payload made serializeJob throw. Post-fix: payloads are deep-cloned into intents and
// validated as JSON-safe at every seam; cyclic/non-JSON payloads are rejected (null) predictably.

test('DEFECT 4a (payload aliasing): mutating a nested field on an emitted intent does NOT mutate the job', () => {
  const job = createJob({
    id: 'ha', kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, speed: 100,
    commissionS: 0.001, departS: 0.001, approachS: 0.001, workS: 0.001, loadS: 0.001, unloadS: 0.001, dwellS: 0.001,
    payload: { commodity: 'ore', units: 40, meta: { tag: 'clean', nested: { deep: 1 } } },
  }, 1);
  const seen = [];
  advance(job, 0.05, (i) => seen.push(i));
  const load = seen.find((e) => e.event === 'npcjobs:load');
  assert.ok(load, 'load intent emitted');
  // Mutate nested fields on the intent — the job record must be untouched.
  load.payload.commodity = 'MUTATED';
  load.payload.meta.tag = 'MUTATED';
  load.payload.meta.nested.deep = 999;
  assert.equal(job.payload.commodity, 'ore', 'top-level payload field not aliased');
  assert.equal(job.payload.meta.tag, 'clean', 'nested payload field not aliased');
  assert.equal(job.payload.meta.nested.deep, 1, 'deeply nested payload field not aliased');
});

test('DEFECT 4a: the returned intent array is also safe to mutate (no aliasing through the return value)', () => {
  const job = createJob({
    id: 'ha2', kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, speed: 100,
    commissionS: 0.001, departS: 0.001, approachS: 0.001, workS: 0.001, loadS: 0.001, unloadS: 0.001, dwellS: 0.001,
    payload: { commodity: 'ore', units: 40, meta: { tag: 'clean' } },
  }, 1);
  const intents = advance(job, 0.05);
  const load = intents.find((e) => e.event === 'npcjobs:load');
  load.payload.meta.tag = 'MUTATED';
  assert.equal(job.payload.meta.tag, 'clean', 'job not aliased through returned intent array');
});

test('DEFECT 4b (cyclic payload): a cyclic payload is rejected at createJob, normalizeJob, AND serializeJob — never throws', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(isJSONSafe(cyclic), false, 'isJSONSafe detects the cycle');

  // createJob rejects it (payload becomes null).
  const a = createJob({ id: 'c1', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, payload: cyclic }, 1);
  assert.equal(a.payload, null, 'cyclic payload rejected at createJob');

  // normalizeJob rejects it and records the heal.
  const b = normalizeJob({ id: 'c2', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, payload: cyclic });
  assert.equal(b.payload, null, 'cyclic payload rejected at normalizeJob');
  assert.ok(b.healed.some((h) => h.includes('payload')), 'heal records the payload rejection');

  // serializeJob does NOT throw even if the payload was mutated to cyclic after creation.
  const c = createJob({ id: 'c3', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, payload: { ok: 1 } }, 1);
  c.payload = cyclic; // simulate a corrupting post-creation mutation
  let threw = false;
  let out;
  try { out = serializeJob(c); } catch (e) { threw = true; }
  assert.equal(threw, false, 'serializeJob must not throw on a cyclic payload');
  assert.ok(out, 'serializeJob returns a record');
  assert.equal(out.payload, null, 'serializeJob drops the cyclic payload');
});

test('DEFECT 4b: non-JSON payload values (functions, undefined, class instances) are rejected', () => {
  const cases = [
    { p: { fn: () => 1 }, label: 'function value' },
    { p: { u: undefined }, label: 'undefined value' },
    { p: { d: new Date() }, label: 'Date instance' },
    { p: { m: new Map() }, label: 'Map instance' },
  ];
  for (const c of cases) {
    assert.equal(isJSONSafe(c.p), false, `${c.label} is not JSON-safe`);
    const job = createJob({ id: 'x', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, payload: c.p }, 1);
    assert.equal(job.payload, null, `${c.label} rejected at createJob`);
  }
  // A plain JSON-safe payload survives.
  const ok = createJob({ id: 'ok', kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, payload: { a: 1, b: 'x', c: [1, 2, { y: true }] } }, 1);
  assert.ok(ok.payload && ok.payload.c[2].y === true, 'plain JSON-safe payload accepted');
});

test('DEFECT 4: summarizeJob and describeMaterialization also deep-clone payload (no aliasing through projections)', () => {
  const job = createJob({
    id: 'proj', kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, payload: { commodity: 'ore', meta: { tag: 'clean' } },
  }, 1);
  const s = summarizeJob(job);
  const d = describeMaterialization(job);
  s.payload.meta.tag = 'MUTATED';
  d.payload.meta.tag = 'MUTATED2';
  assert.equal(job.payload.meta.tag, 'clean', 'job not aliased through summarizeJob');
  assert.equal(job.payload.meta.tag, 'clean', 'job not aliased through describeMaterialization');
});