import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { spec as convoy } from '../src/data/encounters/423-lived-refinery-approach-convoy-helix-k1.js';

// Position fixtures isolate observation semantics; native navigation is a separate proof.
function fixture(steps = null) {
  const spec = structuredClone(convoy);
  spec.start = 'offer';
  if (steps) spec.phases.find(p => p.id === 'await_a').steps = steps;
  const runtime = compileVignette(spec);
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 1000, z: 0 }, vel: { x: 0, z: 0 } };
  const lead = { id: 2, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const wing = { id: 3, alive: true, type: 'ship', pos: { x: 0, z: 200 }, vel: { x: 0, z: 0 } };
  const state = { entities: new Map([[1, player], [2, lead], [3, wing]]), playerId: 1, player: { credits: 100 } };
  const live = { ids: [2, 3], roles: { 2: 'hull_0', 3: 'hull_1' }, vars: {}, anchor: { x: 0, z: 0 } };
  let now = 0;
  const receipts = [];
  const d = {
    now: () => now, player: () => player, entsOf: () => [lead, wing],
    offerChoices() {}, say() {},
    grant: (...args) => receipts.push(['grant', ...args]),
    charge: (...args) => receipts.push(['charge', ...args]),
    rep: (...args) => receipts.push(['rep', ...args]),
    resolve: (_, outcome) => { receipts.push(['resolve', outcome]); live.phase = 'done'; },
    abort: (_, reason) => { receipts.push(['abort', reason]); live.phase = 'done'; },
  };
  runtime.fire(d, live, state);
  const choose = (id = 'a') => runtime.choose(d, live, state, id);
  const tick = t => { now = t; runtime.tick(d, live, state, now); };
  const station = (t, x, z = 120) => { lead.pos.x = x; player.pos = { x, z }; tick(t); };
  const restart = () => runtime.fire(d, live, state);
  return { choose, tick, station, restart, receipts, player, lead, wing, live, state };
}
const formation = { kind: 'formation', of: 'hull_0', min: 60, max: 180, holdS: 8, leaderProgress: 100 };
function assertPaid(f) {
  assert.deepEqual(f.receipts.map(r => r.slice(0, 3)), [
    ['grant', 48, convoy.id], ['rep', 'faction_helix', 2], ['resolve', 'a'],
  ]);
}
test('late stationary join cannot cash travel made after acceptance while absent', () => {
  const f = fixture(); f.choose();
  for (let t = 0; t <= 10; t++) { f.lead.pos.x = 10 * t; f.tick(t); }
  f.player.pos = { x: 0, z: 120 };
  for (let t = 11; t <= 19; t++) f.tick(t);
  assert.deepEqual(f.receipts, []);
});
test('continuous station keeping needs both concurrent time and distance, pays once', () => {
  const f = fixture(); f.choose();
  f.station(0, 0); f.station(8, 99);
  assert.deepEqual(f.receipts, []);
  f.station(9, 100); assertPaid(f);
  f.choose(); f.tick(10); assertPaid(f);
  const fast = fixture(); fast.choose();
  fast.station(0, 0); fast.station(1, 100);
  assert.deepEqual(fast.receipts, []);
  fast.station(7.99, 100); assert.deepEqual(fast.receipts, []);
  fast.station(8, 100); assertPaid(fast);
});
test('range break clears spatial and temporal evidence, including either boundary', () => {
  for (const outside of [59, 181]) {
    const f = fixture(); f.choose();
    f.station(0, 0); f.station(7, 90); f.station(8, 100, outside);
    f.station(9, 100); f.station(17, 199);
    assert.deepEqual(f.receipts, []);
    f.station(18, 200); assertPaid(f);
  }
});
test('gap crossing stays first; travel before it is not formation progress', () => {
  const f = fixture([{ kind: 'gapCross', of: ['hull_0', 'hull_1'], within: 60 }, formation]);
  f.choose();
  f.lead.pos.x = f.wing.pos.x = 200;
  f.player.pos = { x: 190, z: 100 }; f.tick(1);
  assert.equal(f.live.vars.vAwait.stepIndex, 0);
  f.player.pos = { x: 210, z: 100 }; f.tick(2);
  assert.equal(f.live.vars.vAwait.stepIndex, 1);
  f.tick(10); assert.deepEqual(f.receipts, []);
  f.station(11, 300, 100); assertPaid(f);
});
test('a succeeding formation step starts a fresh interval', () => {
  const f = fixture([formation, formation]); f.choose();
  f.station(0, 0); f.station(8, 100);
  assert.equal(f.live.vars.vAwait.stepIndex, 1);
  f.station(16, 100); assert.deepEqual(f.receipts, []);
  f.station(17, 200); assertPaid(f);
});
test('missing and dead leaders abort rather than reward', () => {
  for (const missing of [false, true]) {
    const f = fixture(); f.choose(); f.station(0, 0);
    if (missing) f.state.entities.delete(2); else f.lead.alive = false;
    f.tick(9);
    assert.deepEqual(f.receipts, [['abort', 'physical_subject_gone']]);
  }
});
test('sponsor, decline, and physical timeout preserve their outcomes', () => {
  const sponsor = fixture(); sponsor.choose('b');
  sponsor.player.pos = { x: 0, z: 0 }; sponsor.tick(0); sponsor.tick(2);
  assert.deepEqual(sponsor.receipts.map(r => r.slice(0, 3)), [
    ['charge', 24, convoy.id + ':sponsor'], ['rep', 'faction_helix', 3], ['resolve', 'b'],
  ]);
  const decline = fixture(); decline.choose('c');
  decline.player.pos.x = 1200; decline.tick(1);
  assert.deepEqual(decline.receipts, [['resolve', 'c']]);
  const timeout = fixture(); timeout.choose(); timeout.tick(120);
  assert.deepEqual(timeout.receipts, [['abort', 'physical_timeout']]);
});

test('a range break resets the hold clock even when new travel is fast', () => {
  const f = fixture(); f.choose();
  f.station(0, 0); f.station(7, 90); f.station(8, 100, 181);
  f.station(9, 100); f.station(10, 200);
  assert.deepEqual(f.receipts, []);
  f.station(16.99, 200); assert.deepEqual(f.receipts, []);
  f.station(17, 200); assertPaid(f);
});
test('fresh await entry cannot inherit a prior interval', () => {
  const f = fixture(); f.choose(); f.station(0, 0); f.station(7, 90);
  f.restart(); f.choose(); f.station(8, 90);
  f.station(16, 189); assert.deepEqual(f.receipts, []);
  f.station(17, 190); assertPaid(f);
});

test('formation range boundaries are inclusive', () => {
  for (const range of [60, 180]) {
    const f = fixture(); f.choose();
    f.station(0, 0, range); f.station(8, 100, range); assertPaid(f);
  }
});
test('non-finite leader and player positions fail closed', () => {
  for (const actor of ['lead', 'player']) {
    for (const value of [NaN, Infinity]) {
      const f = fixture(); f.choose(); f.station(0, 0);
      f[actor].pos.x = value; f.tick(8);
      assert.deepEqual(f.receipts, [['abort', 'physical_subject_gone']]);
    }
  }
});
