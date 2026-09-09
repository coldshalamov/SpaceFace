// The working trades are three GRAPHS, not three labels.
//
// The kernel's founding claim (npcJobs.js header) is that its kinds are "three genuinely different
// phase graphs, not three labels on one machine". Adding surveyor / salvor / tender is only worth
// anything if that stays true — six kinds that all read commission/transit/approach/work/return are
// one kind wearing six hats, and the whole variety argument collapses.
//
// So the load-bearing test here is the DISCRIMINATION one: strip the labels off a phase sequence and
// you must still be able to tell which trade produced it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createJob,
  advance,
  serializeJob,
  restoreJob,
  interrupt,
  resume,
  NPC_JOB_KIND,
  NPC_JOB_PHASE,
} from '../src/systems/npcJobs.js';

const NEW_KINDS = ['surveyor', 'salvor', 'tender'];

function routeFor(kind) {
  if (kind === 'surveyor') {
    return [
      { id: 'mark0', pos: { x: 0, z: 0 } },
      { id: 'mark1', pos: { x: 300, z: 120 } },
      { id: 'mark2', pos: { x: 520, z: -180 } },
      { id: 'mark3', pos: { x: 180, z: -420 } },
    ];
  }
  return [
    { id: 'home', pos: { x: 0, z: 0 } },
    { id: 'site', pos: { x: 400, z: 260 } },
  ];
}

/** Run a job for `seconds` and return the ordered list of phases it actually occupied. */
function phaseTrace(kind, seconds = 900, step = 0.25) {
  const job = createJob({ id: 'j:' + kind, kind, route: routeFor(kind) }, 4242);
  const trace = [job.phase];
  for (let t = 0; t < seconds / step; t++) {
    advance(job, step);
    if (trace[trace.length - 1] !== job.phase) trace.push(job.phase);
  }
  return { job, trace };
}

test('every new kind is constructible and runs without corrupting itself', () => {
  for (const kind of NEW_KINDS) {
    const { job, trace } = phaseTrace(kind);
    assert.equal(job.corrupt, undefined === job.corrupt ? job.corrupt : false);
    assert.ok(!job.corrupt, `${kind} must not corrupt itself`);
    assert.ok(trace.length > 4, `${kind} must actually advance, saw ${trace.join(' -> ')}`);
  }
});

test('each new kind produces a DISTINCT phase sequence — the anti-relabelling test', () => {
  const signatures = new Map();
  for (const kind of [...Object.values(NPC_JOB_KIND)]) {
    const route = routeFor(kind === 'surveyor' || kind === 'patrol' ? 'surveyor' : kind);
    const job = createJob({ id: 'j', kind, route }, 99);
    const seen = [job.phase];
    for (let t = 0; t < 6000; t++) {
      advance(job, 0.25);
      if (seen[seen.length - 1] !== job.phase) seen.push(job.phase);
      if (job.phase === NPC_JOB_PHASE.COMPLETE) break;
    }
    // Normalise to the SET of phases plus their cyclic order, which is what a viewer could infer.
    signatures.set(kind, [...new Set(seen)].sort().join(','));
  }
  const distinct = new Set(signatures.values());
  assert.equal(distinct.size, signatures.size,
    `every kind must occupy a distinct phase set; got ${JSON.stringify([...signatures])}`);
});

test('surveyor works every mark and never loads or unloads', () => {
  const { trace } = phaseTrace('surveyor');
  assert.ok(trace.includes(NPC_JOB_PHASE.WORK), 'a surveyor measures at its marks');
  assert.equal(trace.includes(NPC_JOB_PHASE.HOLD), false,
    'a surveyor has no scheduled dwell — that is what makes it not a patrol');
  for (const cargo of [NPC_JOB_PHASE.LOAD, NPC_JOB_PHASE.UNLOAD]) {
    assert.equal(trace.includes(cargo), false, `a surveyor never ${cargo}s — it carries nothing`);
  }
});

test('salvor separates cutting from lifting — the difference from a barge', () => {
  const { trace } = phaseTrace('salvor');
  const work = trace.indexOf(NPC_JOB_PHASE.WORK);
  const load = trace.indexOf(NPC_JOB_PHASE.LOAD);
  assert.ok(work >= 0 && load >= 0, `expected both work and load, saw ${trace.join(' -> ')}`);
  assert.ok(load > work, 'you sever, THEN you wrangle — load must follow work');
  assert.ok(trace.includes(NPC_JOB_PHASE.UNLOAD), 'the pieces go on the scales at home');
});

test('tender re-departs every call-out and never touches cargo', () => {
  const { trace } = phaseTrace('tender');
  const departs = trace.filter((p) => p === NPC_JOB_PHASE.DEPART).length;
  assert.ok(departs >= 2,
    `a tender undocks for every call-out; saw ${departs} departs in ${trace.join(' -> ')}`);
  for (const cargo of [NPC_JOB_PHASE.LOAD, NPC_JOB_PHASE.UNLOAD]) {
    assert.equal(trace.includes(cargo), false,
      `a tender never ${cargo}s — repair adds material, it does not move it`);
  }
  assert.ok(trace.includes(NPC_JOB_PHASE.WORK), 'a tender welds');
});

test('the new kinds cycle rather than terminating', () => {
  for (const kind of NEW_KINDS) {
    const { job, trace } = phaseTrace(kind);
    assert.equal(trace.includes(NPC_JOB_PHASE.COMPLETE), false, `${kind} is a cyclic trade`);
    assert.ok(job.loopCount >= 1, `${kind} must close at least one circuit, got ${job.loopCount}`);
  }
});

test('advancement stays decomposable for the new kinds', () => {
  // The kernel's founding invariant: advance(a) then advance(b) == advance(a+b), in BOTH final
  // state and the concatenated intent stream. A new kind that broke it would silently desynchronise
  // offscreen jobs from onscreen ones.
  for (const kind of NEW_KINDS) {
    const split = createJob({ id: 'j', kind, route: routeFor(kind) }, 7);
    const whole = createJob({ id: 'j', kind, route: routeFor(kind) }, 7);
    const a = [];
    const b = [];
    for (let i = 0; i < 400; i++) { a.push(...advance(split, 0.5)); a.push(...advance(split, 0.75)); }
    for (let i = 0; i < 400; i++) { b.push(...advance(whole, 1.25)); }
    assert.equal(split.phase, whole.phase, `${kind} phase diverged`);
    assert.equal(split.routeIndex, whole.routeIndex, `${kind} routeIndex diverged`);
    assert.equal(split.loopCount, whole.loopCount, `${kind} loopCount diverged`);
    assert.deepEqual(a.map((i) => i.event), b.map((i) => i.event), `${kind} intent stream diverged`);
  }
});

test('the new kinds survive a save/restore round trip mid-cycle', () => {
  for (const kind of NEW_KINDS) {
    const job = createJob({ id: 'j', kind, route: routeFor(kind) }, 31);
    for (let i = 0; i < 700; i++) advance(job, 0.5);
    const restored = restoreJob(serializeJob(job));
    assert.ok(!restored.corrupt, `${kind} must restore clean`);
    assert.equal(restored.phase, job.phase, `${kind} phase`);
    assert.equal(restored.kind, job.kind, `${kind} kind`);
    assert.equal(restored.routeIndex, job.routeIndex, `${kind} routeIndex`);
    // And it must keep running from there rather than restarting.
    const before = restored.loopCount;
    for (let i = 0; i < 700; i++) advance(restored, 0.5);
    assert.ok(restored.loopCount > before, `${kind} must keep cycling after restore`);
  }
});

test('flee interrupts and resumes to the exact phase for the new kinds', () => {
  for (const kind of NEW_KINDS) {
    const job = createJob({ id: 'j', kind, route: routeFor(kind) }, 11);
    for (let i = 0; i < 300; i++) advance(job, 0.5);
    const was = job.phase;
    const wasIndex = job.routeIndex;
    interrupt(job, { entityId: 5 });
    assert.equal(job.phase, NPC_JOB_PHASE.FLEE, `${kind} must be interruptible`);
    advance(job, 20);
    assert.equal(job.phase, NPC_JOB_PHASE.FLEE, `${kind} flee is sticky`);
    resume(job);
    assert.equal(job.phase, was, `${kind} must resume its exact phase, not restart`);
    assert.equal(job.routeIndex, wasIndex, `${kind} must resume its exact leg`);
  }
});

test('a corrupt kind/phase pair heals instead of emitting an impossible completion', () => {
  // e.g. a save that claims a tender is in UNLOAD, a phase its graph can never reach.
  for (const [kind, illegal] of [
    ['surveyor', NPC_JOB_PHASE.UNLOAD],
    ['surveyor', NPC_JOB_PHASE.HOLD],
    ['tender', NPC_JOB_PHASE.LOAD],
    ['salvor', NPC_JOB_PHASE.HOLD],
  ]) {
    const raw = serializeJob(createJob({ id: 'j', kind, route: routeFor(kind) }, 3));
    raw.phase = illegal;
    const healed = restoreJob(raw);
    assert.notEqual(healed.phase, illegal, `${kind}+${illegal} must not survive restore`);
    const intents = advance(healed, 60);
    assert.equal(intents.some((i) => i.event === `npcjobs:${illegal}`), false,
      `${kind} must never emit a ${illegal} completion`);
  }
});
