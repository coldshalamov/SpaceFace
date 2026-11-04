import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERWEIGHT_EVENT_BY_ID } from '../src/features/counterweightCircuit/definition.js';
import { createAttemptState, advanceAttempt, cancelAttempt } from '../src/features/counterweightCircuit/attempt.js';
import { applyResultToRecord, freshEventRecord, medalForTime, medalForCompletion } from '../src/features/counterweightCircuit/scoring.js';
import { projectCounterweightCircuitJournal } from '../src/features/counterweightCircuit/readModel.js';
import { commissionEntries } from '../src/ui/screens/missionLog.js';

// Pure-FSM harness: fabricated observation frames shaped exactly like
// physical.observe() emits. Local def coordinates are used as-is (the test
// injects absPos where the venue conversion would have placed them).
function mat(def) {
  const d = { ...def };
  if (def.gate) d.gate = { ...def.gate, absPos: { ...def.gate.pos } };
  if (def.bounds) d.bounds = { ...def.bounds, absPos: { ...def.bounds.pos } };
  return d;
}

function bodyAt(x, z, opts = {}) {
  return {
    id: opts.id ?? 7, occupantGeneration: opts.generation ?? 1, pos: { x, z }, prevPos: { x: opts.prevX ?? x, z: opts.prevZ ?? z },
    vel: { x: opts.vx ?? 0, z: opts.vz ?? 0 }, speed: Math.hypot(opts.vx ?? 0, opts.vz ?? 0),
    hull: opts.hull ?? 80, hullMax: opts.hullMax ?? 80, alive: opts.alive !== false,
  };
}

function obs(t, { bodies = {}, lines = [], player = { x: 0, z: 0 }, committed = true, dt = 1 / 60, releases = [], seated = false } = {}) {
  const receivers = {};
  if (seated) for (const [role, zone] of [['load','cradle'],['load_a','shelf_a'],['load_b','shelf_b']]) {
    const a=bodies[role], b=bodies[zone];
    if (a && b) receivers[`${role}:${zone}`] = {bodyId:a.id,bodyGeneration:a.occupantGeneration,
      receiverId:b.id,receiverGeneration:b.occupantGeneration,stable:true,relativeSpeed:Math.hypot(a.vel.x-b.vel.x,a.vel.z-b.vel.z)};
  }
  return {
    simTime: t, dt, committed, receivers,
    playerPos: player, playerVel: { x: 0, z: 0 }, playerId: 1, playerAlive: true, mode: 'flight',
    bodies, lines, releases, impacts: [],
  };
}

function line(aId, bId) { return { id: 'line-1', aId, bId, defId: 'attachment_massline', taut: true }; }

function run(state, def, frames) {
  const events = [];
  for (const o of frames) events.push(...advanceAttempt(state, def, o));
  return events;
}

test('soft berth: arm → attach → seat → complete', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.soft_berth);
  const st = createAttemptState(def, { attemptId: 1 });
  // Staged: not yet committed.
  let ev = run(st, def, [obs(0, { committed: false, bodies: { load: bodyAt(210, 0), cradle: bodyAt(520, 0, { id: 9 }) } })]);
  assert.equal(ev.length, 0);
  assert.equal(st.phase, 'staged');
  // Committed → armed.
  ev = run(st, def, [obs(1, { bodies: { load: bodyAt(210, 0), cradle: bodyAt(520, 0, { id: 9 }) }, lines: [] })]);
  assert.equal(st.phase, 'running');
  assert.equal(st.armedAt, 1);
  // Attach line → leg 0 done.
  ev = run(st, def, [obs(2, { bodies: { load: bodyAt(210, 0), cradle: bodyAt(520, 0, { id: 9 }) }, lines: [line(1, 7)] })]);
  assert.equal(st.legIndex, 1);
  // Seat: inside zone, slow, dwell 1.2 s.
  const frames = [];
  for (let t = 3; t < 6; t += 1 / 60) {
    frames.push(obs(t, { bodies: { load: bodyAt(520, 0, { vx: 1 }), cradle: bodyAt(520, 0, { id: 9 }) }, lines: [line(1, 7)], seated:true }));
  }
  run(st, def, frames);
  assert.equal(st.phase, 'complete');
  assert.ok(Math.abs(st.elapsedS - (st.finishedAt - 1)) < 0.01);
});

test('long arm: a straight gate shot does not complete it', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.long_arm);
  const st = createAttemptState(def, { attemptId: 1 });
  // Attach, then release and fly straight through the gate with no swing.
  run(st, def, [obs(0, { bodies: { load: bodyAt(300, 0, { id: 7 }), counterweight: bodyAt(420, 0, { id: 8 }) } })]);
  run(st, def, [obs(1, { bodies: { load: bodyAt(300, 0, { id: 7 }), counterweight: bodyAt(420, 0, { id: 8 }) }, lines: [line(1, 7)] })]);
  // Release immediately (still on swing leg), load flies through the gate.
  const frames = [];
  for (let i = 1; i <= 60; i++) {
    const x = 300 + i * 6;
    frames.push(obs(1 + i / 60, {
      bodies: { load: bodyAt(x, 0, { id: 7, prevX: x - 6, vx: 360 }), counterweight: bodyAt(420, 0, { id: 8 }) },
      lines: [],
    }));
  }
  run(st, def, frames);
  assert.notEqual(st.phase, 'complete');
  assert.equal(st.legIndex, 0, 'lost line returns to attach; a straight shot cannot pass swing');
});

test('long arm: attach → swing ≥100° → release → transit completes', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.long_arm);
  const st = createAttemptState(def, { attemptId: 1 });
  const cw = bodyAt(420, 0, { id: 8 });
  run(st, def, [obs(0, { bodies: { load: bodyAt(300, 0, { id: 7 }), counterweight: cw } })]);
  // Swing: walk the load 150° around the counterweight while attached.
  const frames = [];
  let t = 1;
  for (let deg = 180; deg >= -30; deg -= 3) {
    const a = (deg * Math.PI) / 180;
    const x = 420 + Math.cos(a) * 60, z = Math.sin(a) * 60;
    frames.push(obs(t, { bodies: { load: bodyAt(x, z, { id: 7 }), counterweight: cw }, lines: [line(1, 7)] }));
    t += 1 / 60;
  }
  run(st, def, frames);
  assert.ok(st.legIndex >= 2, `sweep completed (legIndex ${st.legIndex})`);
  // Release → transit leg.
  run(st, def, [obs(t, { bodies: { load: bodyAt(480, 52, { id: 7 }), counterweight: cw }, lines: [], releases: [{id:'line-1',role:'load'}] })]); t += 1 / 60;
  assert.equal(st.legIndex, 3);
  // Cross the gate plane (z = 0) within the 30 WU lateral half-width of x = 620.
  run(st, def, [obs(t, { bodies: { load: bodyAt(625, 5, { id: 7, prevX: 615, prevZ: -5, vx: 300 }), counterweight: cw }, lines: [] })]);
  assert.equal(st.phase, 'complete');
});

test('recoverable miss: load stops short of the gate → retry from attach', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.long_arm);
  const st = createAttemptState(def, { attemptId: 1 });
  const cw = bodyAt(420, 0, { id: 8 });
  run(st, def, [obs(0, { bodies: { load: bodyAt(300, 0, { id: 7 }), counterweight: cw } })]);
  const frames = [];
  let t = 1;
  for (let deg = 180; deg >= -20; deg -= 5) {
    const a = (deg * Math.PI) / 180;
    frames.push(obs(t, { bodies: { load: bodyAt(420 + Math.cos(a) * 60, Math.sin(a) * 60, { id: 7 }), counterweight: cw }, lines: [line(1, 7)] }));
    t += 1 / 60;
  }
  run(st, def, frames);
  run(st, def, [obs(t, { bodies: { load: bodyAt(480, 20, { id: 7 }), counterweight: cw }, lines: [], releases: [{id:'line-1',role:'load'}] })]); t += 1 / 60;
  assert.equal(st.legIndex, 3);
  // The load stops dead well short of the gate; after 3 s of stall → retry.
  const stalls = [];
  for (let i = 0; i < 200; i++) { stalls.push(obs(t, { bodies: { load: bodyAt(500, 20, { id: 7, vx: 0 }), counterweight: cw }, lines: [] })); t += 1 / 60; }
  const ev = run(st, def, stalls);
  assert.ok(ev.some((e) => e.type === 'retry'));
  assert.equal(st.legIndex, 0);
  assert.equal(st.mem.retriesByLeg[3], 1);
  // Re-attach and swing again → the attempt honestly continues.
  run(st, def, [obs(t, { bodies: { load: bodyAt(500, 20, { id: 7 }), counterweight: cw }, lines: [line(1, 7)] })]);
  assert.equal(st.legIndex, 1);
  const journal = projectCounterweightCircuitJournal({}, { attempt: { eventId: def.id, fsm: st } });
  assert.equal(journal.attempt.retryCount, 1);
  assert.equal(journal.attempt.legs[3].retries, 1);
  const [entry] = commissionEntries({ counterweightCircuitView: { eventId: def.id, attemptId: 1, journal } });
  assert.ok(entry.details.some(([label, value]) => label === 'Leg' && value.includes('1 retry')));
  // Recreate the same physical swing and complete the previously missed gate.
  const retryFrames = [];
  for (let deg = 180; deg >= -30; deg -= 3) {
    const a = deg * Math.PI / 180;
    retryFrames.push(obs(t, { bodies: { load: bodyAt(420 + Math.cos(a)*60, Math.sin(a)*60), counterweight: cw }, lines: [line(1, 7)] }));
    t += 1/60;
  }
  run(st, def, retryFrames);
  run(st, def, [obs(t, { bodies: { load: bodyAt(480, 52), counterweight: cw }, releases: [{ id:'line-1', role:'load' }] })]);
  t += 1/60;
  run(st, def, [obs(t, { bodies: { load: bodyAt(625, 5, { prevX: 615, prevZ: -5, vx: 300 }), counterweight: cw } })]);
  assert.equal(st.phase, 'complete');
  assert.equal(st.legStatus[3], 'done');
  assert.equal(st.mem.retriesByLeg[3], 1);
  const result = applyResultToRecord(freshEventRecord(), def, st, null).result;
  assert.equal(result.outcome, 'complete');
});

test('destroyed load fails for real', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.soft_berth);
  const st = createAttemptState(def, { attemptId: 1 });
  run(st, def, [obs(0, { bodies: { load: bodyAt(210, 0, { id: 7, hull: 80 }), cradle: bodyAt(520, 0, { id: 9 }) } })]);
  const ev = run(st, def, [obs(1, { bodies: { load: bodyAt(210, 0, { id: 7, hull: 0 }), cradle: bodyAt(520, 0, { id: 9 }) } })]);
  assert.equal(st.phase, 'failed');
  assert.equal(st.reason, 'destroyed');
  assert.ok(ev.some((e) => e.type === 'finished' && e.outcome === 'failed'));
});

test('clean sling: player inside the basin ring fails', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.clean_sling);
  const st = createAttemptState(def, { attemptId: 1 });
  run(st, def, [obs(0, {
    bodies: { load: bodyAt(300, 60, { id: 7 }), basin: bodyAt(560, -120, { id: 9 }) },
    player: { x: 200, z: 0 },
  })]);
  const ev = run(st, def, [obs(1, {
    bodies: { load: bodyAt(300, 60, { id: 7 }), basin: bodyAt(560, -120, { id: 9 }) },
    player: { x: 560, z: -100 }, // inside the 95 WU exclusion ring
  })]);
  assert.equal(st.phase, 'failed');
  assert.equal(st.reason, 'entered_basin');
});

test('split decision: both loads must be attached AND parked', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.split_decision);
  const st = createAttemptState(def, { attemptId: 1 });
  const bodies = {
    load_a: bodyAt(560, 60, { id: 7 }), load_b: bodyAt(560, -60, { id: 8 }),
    shelf_a: bodyAt(560, 60, { id: 9 }), shelf_b: bodyAt(560, -60, { id: 10 }),
  };
  // Both parked but only A ever attached → pending.
  run(st, def, [obs(0, { bodies, lines: [line(1, 7)], seated:true })]);
  const frames = [];
  for (let i = 0; i < 120; i++) frames.push(obs(1 + i / 60, { bodies, lines: [], seated:true }));
  run(st, def, frames);
  assert.equal(st.phase, 'running', 'load_b was never attached — parkAll waits');
  // Attach B once, keep both parked → done after dwell.
  const frames2 = [obs(4, { bodies, lines: [line(1, 8)], seated:true })];
  for (let i = 0; i < 90; i++) frames2.push(obs(4.1 + i / 60, { bodies, lines: [], seated:true }));
  run(st, def, frames2);
  assert.equal(st.phase, 'complete');
});

test('finale: ordered legs gate the sequence', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.counterweight_finale);
  const st = createAttemptState(def, { attemptId: 1 });
  const cw = bodyAt(400, -20, { id: 8 });
  const cradle = bodyAt(760, -20, { id: 9 });
  // Seating before any attach does nothing.
  run(st, def, [obs(0, { bodies: { load: bodyAt(760, -20, { id: 7 }), counterweight: cw, cradle } })]);
  assert.equal(st.legIndex, 0);
  // Attach → swing → release → transit → reacquire → seat.
  run(st, def, [obs(1, { bodies: { load: bodyAt(270, -20, { id: 7 }), counterweight: cw, cradle }, lines: [line(1, 7)] })]);
  const frames = [];
  let t = 2;
  for (let deg = 180; deg >= -30; deg -= 4) {
    const a = (deg * Math.PI) / 180;
    frames.push(obs(t, { bodies: { load: bodyAt(400 + Math.cos(a) * 60, -20 + Math.sin(a) * 60, { id: 7 }), counterweight: cw, cradle }, lines: [line(1, 7)] }));
    t += 1 / 60;
  }
  run(st, def, frames);
  assert.ok(st.legIndex >= 2);
  run(st, def, [obs(t, { bodies: { load: bodyAt(470, 30, { id: 7 }), counterweight: cw, cradle }, lines: [], releases: [{id:'line-1',role:'load'}] })]); t += 1 / 60;
  // Cross the gate plane (z = -20) within 30 WU of x = 570.
  run(st, def, [obs(t, { bodies: { load: bodyAt(575, -16, { id: 7, prevX: 565, prevZ: -24, vx: 300 }), counterweight: cw, cradle }, lines: [], releases: [{id:'line-1',role:'load'}] })]); t += 1 / 60;
  assert.equal(st.legIndex, 4, 'reacquire leg after gate transit');
  run(st, def, [obs(t, { bodies: { load: bodyAt(600, -15, { id: 7 }), counterweight: cw, cradle }, lines: [line(1, 7)] })]); t += 1 / 60;
  assert.equal(st.legIndex, 5, 'final seat leg');
  const seats = [];
  for (let i = 0; i < 120; i++) { seats.push(obs(t, { bodies: { load: bodyAt(760, -20, { id: 7, vx: 0.5 }), counterweight: cw, cradle }, lines: [line(1, 7)], seated:true })); t += 1 / 60; }
  run(st, def, seats);
  assert.equal(st.phase, 'complete');
});

test('load escaping the finale bounds fails as lost', () => {
  const def = mat(COUNTERWEIGHT_EVENT_BY_ID.counterweight_finale);
  const st = createAttemptState(def, { attemptId: 1 });
  const cw = bodyAt(400, -20, { id: 8 });
  const cradle = bodyAt(760, -20, { id: 9 });
  run(st, def, [obs(0, { bodies: { load: bodyAt(270, -20, { id: 7 }), counterweight: cw, cradle } })]);
  const frames = [];
  let t = 1;
  // Load drifts beyond the 480 WU bounds circle and stays there past grace.
  for (let i = 0; i < 400; i++) { frames.push(obs(t, { bodies: { load: bodyAt(1200, -20, { id: 7 }), counterweight: cw, cradle } })); t += 1 / 60; }
  run(st, def, frames);
  assert.equal(st.phase, 'failed');
  assert.equal(st.reason, 'lost');
});

test('scoring: medals, condition caps, one-time reward, idempotent replay', () => {
  const def = COUNTERWEIGHT_EVENT_BY_ID.soft_berth;
  assert.equal(medalForTime(def, 30), 'gold');
  assert.equal(medalForTime(def, 50), 'silver');
  assert.equal(medalForTime(def, 80), 'bronze');
  assert.equal(medalForTime(def, 120), 'none');
  const rec = freshEventRecord();
  const attempt = { phase: 'complete', eventId: 'soft_berth', attemptId: 4, elapsedS: 35, finishedAt: 100, practice: false };
  const first = applyResultToRecord(rec, def, attempt, null);
  assert.equal(first.rewardRequested, true);
  assert.equal(rec.paid, false);
  rec.paid = true; // accepted economy receipt is the settlement boundary
  assert.equal(first.result.medal, 'gold');
  // Duplicate reply of the same attempt — no second payment.
  const replay = applyResultToRecord(rec, def, attempt, null);
  assert.equal(replay.paid, false);
  // A second completion — completion counts, cash does not.
  const second = applyResultToRecord(rec, def, { ...attempt, attemptId: 5, elapsedS: 50 }, null);
  assert.equal(second.paid, false);
  assert.equal(rec.completions, 2);
  assert.equal(rec.bestTimeS, 35);
  // Practice grants nothing even when paid flag unset elsewhere.
  const rec2 = freshEventRecord();
  const prac = applyResultToRecord(rec2, def, { ...attempt, practice: true }, null);
  assert.equal(prac.paid, false);
  // Fragile: pod damage caps the medal.
  const frag = COUNTERWEIGHT_EVENT_BY_ID.fragile_freight;
  const damaged = medalForCompletion(frag, { elapsedS: 60 }, 0.6);
  assert.equal(damaged.medal, 'bronze');
  assert.equal(damaged.reason, 'pod_damage');
});
