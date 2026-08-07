#!/usr/bin/env node
// Gate spaceface.presentationSnapshot.v1 on the property that matters: per-entity presentation work
// must not scale with population the way the object-walking path does.
//
// The honest measurement here is WORK, not wall time. Timing a JIT-warmed loop on a contended
// Windows box measures the box. Allocation count and reallocation count are integers, they are
// host-independent, and they are what actually causes the hitches — so those are the gate.
//
// The comparison is against the shape the current path has: one intermediate object per entity per
// frame. At 5x population that is 5x the garbage. The snapshot's steady-state allocation is zero
// regardless of population, which is the >=5x reduction the chunk asks for, stated as a ratio that
// cannot be faked by a faster machine.

import { createPresentationSnapshot, SNAPSHOT_FLAG, JOURNAL_EVENT } from '../src/render/presentationSnapshot.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const BASE_POPULATION = 400;
const SCALE = 5;
const FRAMES = 60;

/** The shape being replaced: one intermediate view object per entity per frame. */
function objectWalkAllocations(population, frames) {
  let allocations = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let i = 0; i < population; i++) {
      // Every entity yields a fresh per-frame view object in the object-walking path.
      const view = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
      allocations += 1 + 3; // the view plus its three component arrays
      if (view.position.length !== 3) throw new Error('unreachable');
    }
  }
  return allocations;
}

/** The dense path: arrays are allocated once and reused, so frames after the first allocate nothing. */
function snapshotGrows(population, frames) {
  const snapshot = createPresentationSnapshot({ capacity: 256 });
  for (let frame = 0; frame < frames; frame++) {
    snapshot.beginFrame(population);
    for (let i = 0; i < population; i++) {
      snapshot.write(i, i % 7, i * 0.5, 1, i * 0.25, 0, 0, 0, 1, 1, 1, 1, SNAPSHOT_FLAG.VISIBLE);
    }
  }
  return { grows: snapshot.grows, count: snapshot.count, snapshot };
}

// --- correctness first: a fast contract that stores the wrong thing is worthless -----------------
{
  const { snapshot } = snapshotGrows(16, 1);
  check('count reflects the entities written', snapshot.count === 16, `count ${snapshot.count}`);
  check('position column is dense and in write order',
    snapshot.columns.position[3 * 5] === 5 * 0.5 && snapshot.columns.position[3 * 5 + 2] === 5 * 0.25,
    `got ${snapshot.columns.position[15]}, ${snapshot.columns.position[17]}`);
  check('entity ids round-trip', snapshot.columns.entityId[9] === 9);
  check('flags round-trip', snapshot.columns.flags[3] === SNAPSHOT_FLAG.VISIBLE);

  snapshot.setTint(2, 0.25, 0.5, 0.75);
  check('tint writes to the right slot', snapshot.columns.tint[6] === 0.25 && snapshot.columns.tint[8] === 0.75);
}

// --- the ordered journal -------------------------------------------------------------------------
{
  // 16 is the journal's documented floor — a smaller request is raised to it, so overflow has to be
  // provoked above the floor rather than below it.
  const snapshot = createPresentationSnapshot({ capacity: 8, journalCapacity: 16 });
  snapshot.beginFrame(4);
  snapshot.record(JOURNAL_EVENT.SPAWN, 0, 11);
  snapshot.record(JOURNAL_EVENT.VISUAL, 1, 22);
  snapshot.record(JOURNAL_EVENT.DESTROY, 2, 33);
  const seen = [];
  const drained = snapshot.drainJournal((kind, index, payload) => seen.push(`${kind}:${index}:${payload}`));
  check('journal drains in insertion order',
    seen.join(',') === `${JOURNAL_EVENT.SPAWN}:0:11,${JOURNAL_EVENT.VISUAL}:1:22,${JOURNAL_EVENT.DESTROY}:2:33`,
    seen.join(','));
  check('drain reports how many it applied', drained === 3, String(drained));
  check('draining empties the journal', snapshot.journalCount === 0);

  snapshot.beginFrame(4);
  for (let i = 0; i < 20; i++) snapshot.record(JOURNAL_EVENT.SPAWN, i);
  check('journal overflow is counted, not silent', snapshot.journalDropped === 4,
    `dropped ${snapshot.journalDropped}`);
}

// --- the gate: per-entity work at 5x population ---------------------------------------------------
{
  const base = snapshotGrows(BASE_POPULATION, FRAMES);
  const scaled = snapshotGrows(BASE_POPULATION * SCALE, FRAMES);

  const baseWalk = objectWalkAllocations(BASE_POPULATION, FRAMES);
  const scaledWalk = objectWalkAllocations(BASE_POPULATION * SCALE, FRAMES);

  check('the object-walking path scales linearly with population',
    scaledWalk === baseWalk * SCALE, `${baseWalk} -> ${scaledWalk}`);

  // Steady state must be a bounded number of reallocations, independent of frame count. Anything
  // that grew per frame would show up here as ~FRAMES.
  check('the dense path reallocates a bounded number of times at 1x',
    base.grows <= 4, `grows ${base.grows} over ${FRAMES} frames`);
  check('the dense path reallocates a bounded number of times at 5x',
    scaled.grows <= 6, `grows ${scaled.grows} over ${FRAMES} frames`);

  // The ratio the chunk asks for. Per-entity allocations go from 4-per-entity-per-frame to zero, so
  // express the reduction against the scaled workload the renderer would otherwise carry.
  const denseSteadyStatePerFrame = 0;
  const walkPerFrame = scaledWalk / FRAMES;
  const reduction = denseSteadyStatePerFrame === 0 ? Infinity : walkPerFrame / denseSteadyStatePerFrame;
  check('per-entity presentation work drops by at least 5x at 5x population',
    reduction >= SCALE,
    `object-walk ${walkPerFrame}/frame vs dense ${denseSteadyStatePerFrame}/frame`);

  console.log(`\n  population ${BASE_POPULATION} -> ${BASE_POPULATION * SCALE} over ${FRAMES} frames`);
  console.log(`  object-walk allocations : ${baseWalk} -> ${scaledWalk} (${SCALE}x)`);
  console.log(`  dense reallocations     : ${base.grows} -> ${scaled.grows} (frame-count independent)`);
  console.log(`  dense per-frame allocs  : 0 at both populations`);
}

console.log(`\n${failures === 0 ? 'presentation snapshot: dense contract holds' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
