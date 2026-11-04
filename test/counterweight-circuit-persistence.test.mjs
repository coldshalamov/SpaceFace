import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshCounterweightCircuitState, normalizeCounterweightCircuitState,
  installCounterweightCircuitSaveAdapter, captureCounterweightCircuitSave,
  restoreCounterweightCircuitState, COUNTERWEIGHT_SAVE_KEY,
} from '../src/features/counterweightCircuit/persistence.js';
import { normalizeGhost, createGhostRecorder, ghostPoseAt, ghostAllowed, decimateGhostSamples, GHOST_VERSION } from '../src/features/counterweightCircuit/ghost.js';
import { COUNTERWEIGHT_EVENTS, GHOST_MAX_SAMPLES } from '../src/features/counterweightCircuit/definition.js';

const copy = (v) => JSON.parse(JSON.stringify(v));

test('fresh state is a complete valid section', () => {
  const out = normalizeCounterweightCircuitState(freshCounterweightCircuitState());
  assert.equal(out.schema, 1);
  assert.equal(out.discovered, false);
  assert.equal(out.attempt, null);
});

test('records and ghosts round-trip through the world bag', () => {
  const row = freshCounterweightCircuitState();
  row.discovered = true;
  row.attemptCounter = 9;
  row.records.soft_berth = {
    completions: 2, attempts: 4, bestTimeS: 38.5, bestMedal: 'gold',
    lastTimeS: 55, lastMedal: 'silver', lastAt: 400, paid: true,
    lastAttemptKey: 'soft_berth:4', lastResult: { eventId: 'soft_berth', outcome: 'complete', medal: 'silver' },
  };
  const rec = createGhostRecorder('soft_berth', { x: -18680, z: 19880 }, 0);
  for (let i = 0; i < 30; i++) rec.sample(i * 0.1, { x: -18680 + i, z: 19880 }, 0.1 * i);
  row.ghost.soft_berth = rec.end({ x: -18600, z: 19880 }, 0, 3.1);
  const normalized = normalizeCounterweightCircuitState(copy(row));
  assert.equal(normalized.discovered, true);
  assert.equal(normalized.attemptCounter, 9);
  assert.equal(normalized.records.soft_berth.completions, 2);
  assert.equal(normalized.records.soft_berth.paid, true);
  assert.equal(normalized.records.soft_berth.bestMedal, 'gold');
  assert.ok(normalized.ghost.soft_berth.samples.length >= 8);
  // Incoherent fields drop to defaults, never trusted.
  const bad = normalizeCounterweightCircuitState({
    schema: 1,
    records: { soft_berth: { completions: 'x', bestTimeS: -5, bestMedal: 'platinum', paid: 'yes' } },
    ghost: { soft_berth: { version: 99, samples: [1, 2, 3] } },
    settings: 'broken',
    attempt: { eventId: 'not_an_event' },
  });
  assert.equal(bad.records.soft_berth.completions, 0);
  assert.equal(bad.records.soft_berth.bestTimeS, null);
  assert.equal(bad.records.soft_berth.paid, false);
  assert.equal(bad.ghost.soft_berth, undefined);
  assert.equal(bad.attempt, null);
});

test('schema mismatch and non-objects drop to fresh state', () => {
  assert.equal(normalizeCounterweightCircuitState({ schema: 99, discovered: true }).discovered, false);
  assert.equal(normalizeCounterweightCircuitState('junk').schema, 1);
  assert.equal(normalizeCounterweightCircuitState(null).schema, 1);
});

test('a live attempt survives normalization; a terminal one does not', () => {
  const row = freshCounterweightCircuitState();
  row.attempt = {
    eventId: 'soft_berth', attemptId: 3, practice: false,
    fsm: {
      eventId: 'soft_berth', attemptId: 3, practice: false, phase: 'running',
      legIndex: 1, legStartedAt: null, armedAt: 22, finishedAt: null, elapsedS: null,
      reason: null, reasonDetail: null,
      mem: { sweepRad: {}, lastBearing: {}, dwellS: {}, attachSeen: {}, legStartedAt: { 0: 20 }, transitAt: {}, insideSince: {}, impacts: 2, maxImpactDp: 9, conditionAtStart: { load: 80 } },
      legStatus: ['done', 'active'], result: null,
    },
    shift: { x: 0, z: 80 }, cohort: ['load', 'cradle'],
  };
  const normalized = normalizeCounterweightCircuitState(copy(row));
  assert.ok(normalized.attempt);
  assert.equal(normalized.attempt.eventId, 'soft_berth');
  assert.equal(normalized.attempt.fsm.phase, 'running');
  assert.deepEqual(normalized.attempt.cohort, ['load', 'cradle']);
  row.attempt.fsm.phase = 'complete';
  assert.equal(normalizeCounterweightCircuitState(copy(row)).attempt, null);
});

test('save adapter nests the section inside the world bag on both lanes', () => {
  const state = { world: { counterweightCircuit: freshCounterweightCircuitState() } };
  state.world.counterweightCircuit.discovered = true;
  const save = {
    state,
    *_saveCapturePlan() { return [['world', () => ({ currentSectorId: 'sector_pallas_drift' })]]; },
    *_serializeDataSteps() { return { world: { currentSectorId: 'sector_pallas_drift' } }; },
    *_restoreChunks(session) {
      this.restored = session?.data?.world?.counterweightCircuit ?? 'absent';
      yield 'rebuildWorld';
    },
  };
  const systemRef = {
    serialize: () => captureCounterweightCircuitSave(state),
    deserialize(raw) { this.raw = raw; },
  };
  const dispose = installCounterweightCircuitSaveAdapter(save, systemRef);
  // Chunked lane: the world plan row carries the nested section.
  const it = save._saveCapturePlan();
  let step;
  while (!(step = it.next()).done) { /* drain markers */ }
  const worldBag = step.value.find(([key]) => key === 'world')[1].call(save);
  assert.equal(worldBag.counterweightCircuit.discovered, true);
  // Streaming lane: data.world gets the section appended.
  const steps = save._serializeDataSteps();
  const yielded = [];
  let r;
  while (!(r = steps.next()).done) yielded.push(r.value);
  assert.equal(r.value.world.counterweightCircuit.discovered, true);
  // Restore lane: the section feeds restoreCounterweightCircuitState + the system.
  const session = { data: { world: { counterweightCircuit: { schema: 1, discovered: true, records: {}, ghost: {}, settings: {} } } } };
  for (const _ of save._restoreChunks(session)) { /* drain */ }
  assert.equal(save.state.world.counterweightCircuit.discovered, true);
  assert.equal(systemRef.raw.schema, 1);
  dispose();
  // After disposal the world bag is the untouched owner's again.
  const it2 = save._saveCapturePlan();
  let step2;
  while (!(step2 = it2.next()).done) { /* drain */ }
  const plainBag = step2.value.find(([key]) => key === 'world')[1].call(save);
  assert.equal(plainBag.counterweightCircuit, undefined);
});

test('ghost recording is bounded, decimated and keeps key events', () => {
  const rec = createGhostRecorder('long_arm', { x: 0, z: 0 }, 0);
  // 15 Hz cap: 200 samples offered at 240 Hz keeps only ~15 Hz.
  for (let i = 0; i < 200; i++) rec.sample(i / 240, { x: i, z: 0 }, 0);
  const ghost = rec.end({ x: 200, z: 0 }, 0, 1);
  assert.ok(ghost);
  const count = ghost.samples.length / 4;
  assert.ok(count <= Math.ceil(1 / (1 / 15)) + 4, `throttled to ~15 Hz + endpoints (${count})`);
  // Marks preserved through decimation.
  const rec2 = createGhostRecorder('long_arm', { x: 0, z: 0 }, 0);
  for (let i = 0; i < 5000; i++) {
    rec2.sample(i / 15, { x: i, z: 0 }, 0);
    if (i === 105) rec2.mark('attach', { x: i, z: 0 }, 0, i / 15);
    if (i === 4980) rec2.mark('seat', { x: i, z: 0 }, 0, i / 15);
  }
  const ghost2 = rec2.end({ x: 5000, z: 0 }, 0, 333.4);
  assert.ok(ghost2.samples.length / 4 <= GHOST_MAX_SAMPLES);
  assert.equal(ghost2.marks.length, 2);
  // Playback is a pure pose — the entire contract.
  const pose = ghostPoseAt(ghost2, 100);
  assert.ok(pose && Number.isFinite(pose.x) && Number.isFinite(pose.rot));
  assert.equal(ghostPoseAt(ghost2, -1), null);
  // normalizeGhost rejects oversize/corrupt tapes.
  assert.equal(normalizeGhost({ version: GHOST_VERSION, eventId: 'long_arm', origin: { x: 0, z: 0 }, samples: new Array(GHOST_MAX_SAMPLES * 4 + 4).fill(0) }, 'long_arm'), null);
  assert.equal(normalizeGhost(ghost2, 'soft_berth'), null, 'event id must match');
  assert.ok(normalizeGhost(ghost2, 'long_arm'));
});

test('ghost opt-in and reduced-motion gate', () => {
  assert.equal(ghostAllowed({ ghostEnabled: false }, false), false);
  assert.equal(ghostAllowed({ ghostEnabled: true }, false), true);
  assert.equal(ghostAllowed({ ghostEnabled: true }, true), false);
  assert.equal(ghostAllowed({ ghostEnabled: true, ghostReduceMotion: true }, true), true);
});
