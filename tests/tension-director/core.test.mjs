import test from 'node:test';
import assert from 'node:assert/strict';
import { TensionDirector, healthy, advanceTo, drive } from './helpers.mjs';
import { TENSION_LIMITS } from '../../src/ai/tensionDirector.js';
import { createTensionWindow, addTensionSignal, summarizeTensionWindow,
  validateTensionWindow } from '../../src/ai/tensionWindow.js';

// These test behavior, not just object shape. Every clock is simulation time.
test('opening provides a real protected quiet window', () => {
  const d = new TensionDirector();
  for (let t = 0; t < 65; t++) {
    const p = d.advance(t, healthy).policy;
    assert.equal(p.phase, 'quiet'); assert.equal(p.allowCombat, false);
  }
  assert.equal(d.advance(65, healthy).policy.phase, 'opportunity');
});

test('empty world never receives a fabricated peak or victory', () => {
  const d = new TensionDirector(); const phases = new Set(); const misses = [];
  for (let t = 0; t < 3600; t++) {
    const r = d.advance(t, { ...healthy, pendingCombat: 0 });
    phases.add(r.policy.phase); if (r.starvation) misses.push(r.starvation);
  }
  assert(!phases.has('peak')); assert(phases.has('aftermath'));
  assert(misses.length > 0); assert(misses.every((m) => m.reason === 'no_combat_supply'));
  assert.equal(d.state.confidence, 0);
  assert.equal(d.inspect().metrics.spawns30m, 0);
});

test('actual delivered pressure enters peak and resolution buys aftermath', () => {
  const d = new TensionDirector(); advanceTo(d, 179);
  d.observe(180, { kind: 'combat' });
  assert.equal(d.advance(180, healthy).policy.phase, 'peak');
  for (let t = 181; t < 205; t++) d.advance(t, healthy);
  d.observe(205, { kind: 'resolved', combat: true, token: 'fight:1' });
  assert.equal(d.advance(205, healthy).policy.phase, 'aftermath');
  assert.equal(d.state.policy.allowCombat, false);
});

test('critical hull overrides minimum phase dwell immediately at next decision', () => {
  const d = new TensionDirector(); advanceTo(d, 70);
  const result = d.advance(71, { ...healthy, hull: 0.10 });
  assert.equal(result.policy.phase, 'recovery'); assert.equal(result.policy.allowCombat, false);
  assert.equal(result.phaseChange.reason, 'critical_player_state');
});

test('actual burst damage triggers recovery while a zero hit is ignored', () => {
  const d = new TensionDirector(); advanceTo(d, 180);
  assert.equal(d.observe(181, { kind: 'incoming', amount: 0 }), false);
  d.observe(181, { kind: 'incoming', amount: 0.23 });
  assert.equal(d.advance(181, healthy).policy.phase, 'recovery');
});

test('recovery has hysteresis, a minimum duration, and no forced danger on an unrepaired hull', () => {
  const d = new TensionDirector(); d.advance(0, { ...healthy, hull: 0.2 });
  for (let t = 1; t < 90; t++) assert.equal(d.advance(t, healthy).policy.phase, 'recovery');
  assert.equal(d.advance(90, healthy).policy.phase, 'aftermath');
  for (let t = 91; t < 3600; t++) {
    const p = d.advance(t, { ...healthy, hull: 0.10 }).policy;
    assert.equal(p.phase, 'recovery'); assert.equal(p.allowCombat, false);
  }
});

test('continuous actual combat accumulates fatigue and closes new-pressure admission', () => {
  const d = new TensionDirector(); let recovery = false;
  for (let t = 0; t < 1200; t++) {
    d.observe(t, { kind: 'combat' });
    const r = d.advance(t, { ...healthy, nearbyCombat: 2 });
    if (r.policy.phase === 'recovery') recovery = true;
  }
  assert(recovery); assert.equal(d.state.policy.allowCombat, false);
  assert(d.state.fatigue <= 1);
});

test('chapter and motif variation are bounded, with no time-based power growth', () => {
  const d = new TensionDirector(); const motifs = new Set();
  for (let t = 0; t <= 5400; t++) { d.advance(t, healthy); motifs.add(d.state.motif); }
  assert(motifs.size >= 2); assert.equal(d.state.chapter, 3); assert.equal(d.state.confidence, 0);
  assert(d.state.recentMotifs.length <= 3);
});

test('pressure targets, rates and slew remain bounded on every difficulty', () => {
  for (const [profile, cap] of Object.entries({ casual: .58, standard: .70, veteran: .78, ironman: .78 })) {
    const d = new TensionDirector(); let last = .08;
    for (let t = 0; t < 2400; t++) {
      if (t % 3 === 0) d.observe(t, { kind: 'kill', token: `${t}` });
      const p = d.advance(t, { ...healthy, profile, nearbyCombat: t % 300 < 80 ? 1 : 0 }).policy;
      assert(p.target <= cap && p.target >= .02); assert(p.combatRate >= .15 && p.combatRate <= 1.25);
      assert(p.civilianRate >= .65 && p.civilianRate <= 1.3);
      assert(p.requested - last <= .0180000001 && last - p.requested <= .0500000001);
      last = p.requested;
    }
  }
});

test('repeated input at one timestamp cannot advance the dramatic clock', () => {
  const d = new TensionDirector(); d.advance(0, healthy);
  for (let i = 0; i < 10000; i++) assert.equal(d.advance(0, healthy), null);
  assert.equal(d.state.activeS, 0); assert.equal(d.state.sequence, 1);
});

test('pause/modal flapping does not mint active seconds', () => {
  const d = new TensionDirector(); d.advance(0, healthy);
  for (let i = 0; i < 100; i++) {
    d.advance(0, { eligible: false, suspension: 'docked' }); d.advance(0, healthy);
  }
  assert.equal(d.state.activeS, 0); assert.equal(d.state.sequence, 1);
  for (let t = 1; t <= 1000; t++) d.advance(t, { eligible: false, suspension: 'docked' });
  assert.equal(d.state.activeS, 0);
  d.advance(1001, healthy); assert.equal(d.state.activeS, 1);
  assert.equal(d.state.policy.allowCombat, false);
});

test('time jump makes one protected decision, not thousands of catch-up beats', () => {
  const d = new TensionDirector(); advanceTo(d, 180);
  const seq = d.state.sequence; d.advance(1e6, healthy);
  assert.equal(d.state.sequence, seq + 1); assert.equal(d.state.clockGapCount, 1);
  assert.equal(d.state.policy.allowCombat, false); assert(d.state.skippedClockS > 900000);
  assert.throws(() => d.advance(20, healthy), /rewound/);
});

test('window saturates repeated verbs, excludes future/old bins, and never grows', () => {
  const w = createTensionWindow();
  for (let i = 0; i < 10000; i++) addTensionSignal(w, 20, 'tether');
  let h = summarizeTensionWindow(w, 20);
  assert.equal(h.medium.tether, 1); assert.equal(h.distinctVerbs, 1); assert.equal(h.entropy, 0);
  addTensionSignal(w, 2000, 'mining'); assert.equal(addTensionSignal(w, 200, 'combat'), false);
  h = summarizeTensionWindow(w, 2000); assert.equal(h.long.tether, 0);
  assert.equal(w.values.length, 180); assert(validateTensionWindow(w));
  assert.equal(addTensionSignal(w, NaN, 'tether'), false);
});

test('duplicate receipts are counted once and deduplication storage is capped', () => {
  const d = new TensionDirector();
  for (let i = 0; i < 10; i++) d.observe(0, { kind: 'delivered', token: 'same', shape: 'same' });
  d.advance(0, healthy); assert.equal(d.state.metrics.spawns30m, 1);
  for (let t = 1; t < 200; t++) d.observe(t, { kind: 'delivered', token: `${t}`, shape: `shape:${t}` });
  assert.equal(d.state.dedupe.length, 64); assert.equal(d.state.recentShapes.length, 8);
});

test('invalid and ambient-independent facts cannot corrupt state', () => {
  const d = new TensionDirector();
  for (const fact of [null, { kind: 'undefined' }, { kind: 'incoming', amount: NaN },
    { kind: 'incoming', amount: Infinity }, { kind: 'incoming', amount: -5 }]) assert.equal(d.observe(0, fact), false);
  d.observe(10, { kind: 'mining' }); assert.equal(d.observe(9, { kind: 'mining' }), false);
  assert.equal(d.state.factCount, 1); assert(Number.isFinite(d.state.command));
});

test('same facts and seed produce byte-identical snapshots; instances are isolated', () => {
  const a = new TensionDirector(), b = new TensionDirector();
  assert.deepEqual(drive(a, 0, 1500), drive(b, 0, 1500));
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
  a.observe(1501, { kind: 'defeat' }); assert.notEqual(a.state.lastDefeatAt, b.state.lastDefeatAt);
});

test('JSON save/restore continuation is exact, including phase, filters, leases, and event dedupe', () => {
  const a = new TensionDirector(); drive(a, 0, 500);
  const b = new TensionDirector({ snapshot: JSON.parse(JSON.stringify(a.snapshot())) });
  assert.deepEqual(drive(a, 501, 2500, 8008), drive(b, 501, 2500, 8008));
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('inspect and snapshots cannot mutate the live controller', () => {
  const d = new TensionDirector(); advanceTo(d, 100);
  const read = d.inspect(); read.policy.allowCombat = !d.state.policy.allowCombat;
  read.trace[0].phase = 'bad'; const s = d.snapshot(); s.window.values[0][0] = 99;
  assert.notEqual(read.policy.allowCombat, d.state.policy.allowCombat);
  assert.notEqual(d.state.trace[0].phase, 'bad'); assert.notEqual(d.state.window.values[0][0], 99);
});

test('corrupt/version-mismatched snapshots are rejected before replacing live state', () => {
  const d = new TensionDirector(); d.advance(0, healthy); const before = d.snapshot();
  const cases = [s => { s.schema = 'v999'; }, s => { s.window.values.push([]); },
    s => { s.fatigue = NaN; }, s => { s.traceCount = 999; }, s => { s.trace[0] = { nested: {} }; },
    s => { s.recentMotifs = ['bogus']; }, s => { delete s.burstAt; }];
  for (const mutate of cases) { const s = d.snapshot(); mutate(s); assert.throws(() => d.restore(s)); }
  assert.deepEqual(d.snapshot(), before);
});

test('trace, window, and identity rings remain bounded over a ten-hour session', () => {
  const d = new TensionDirector();
  for (let t = 0; t <= 36000; t++) {
    if (t % 5 === 0) d.observe(t, { kind: 'mining' });
    if (t % 199 === 0) d.observe(t, { kind: 'delivered', token: `d${t}`, shape: `s${t}` });
    d.advance(t, healthy);
  }
  const s = d.snapshot(); assert.equal(s.trace.length, TENSION_LIMITS.traceCapacity);
  assert.equal(s.window.values.length, 180); assert(s.dedupe.length <= 64);
  assert(JSON.stringify(s).length < 130000); assert(d.inspect().trace.length <= TENSION_LIMITS.traceCapacity);
});

test('sparse arrays, negative time budgets and prototype channel names cannot enter a snapshot', () => {
  const d = new TensionDirector(); d.advance(0, healthy);
  for (const mutate of [s => { delete s.window.values[0]; }, s => { delete s.window.values[0][0]; },
    s => { delete s.trace[0]; }, s => { s.phaseEnteredS = -100; }, s => { s.burst = -1; },
    s => { s.reentryUntilS = -100; }, s => { s.lastDecisionAt = 100; }]) {
    const snapshot = d.snapshot(); mutate(snapshot); assert.throws(() => d.restore(snapshot));
  }
  const w = createTensionWindow();
  assert.equal(addTensionSignal(w, 0, '__proto__'), false);
  assert.equal(addTensionSignal(w, 0, 'toString'), false);
});
