// RC-14/RC-15 — vignette tolls are debits, not payouts. The `cost` verb must route the
// amount to the sole credits writer through the director facade's charge dep (the same
// economy:chargeCredits event every other system uses); it never writes state.player
// itself. A hull that cannot cover the count aborts with a reason instead of silently
// clamping at zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import * as toll562 from '../src/data/encounters/562-lived-border-checkpoint-toll-mule-trader-depth.js';

const TOLL_ID = 'lived_border_checkpoint_toll_mule_trader_depth';

function makeWorld(credits) {
  const state = {
    encounterDirector: { stats: {} },
    entities: new Map(),
    player: { credits },
  };
  const emitted = { charges: [], grants: [] };
  const calls = { says: [], offers: [], reps: [], resolved: [], aborts: [] };
  let nextId = 1;
  let now = 100;
  const live = {
    id: 'test:cost', shapeId: 'toll', vars: {}, ids: [], roles: {},
    anchor: { x: 0, z: 0 }, phase: 'telegraph', data: {},
    shape: { choices: [], timeoutChoice: 'c', title: 'TOLL' },
  };
  // Stand in for the director script facade exactly where the economy seam lives:
  // charge/grant emit the canonical events and a sole-writer handler moves the balance.
  const bus = {
    handlers: {},
    on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); },
    emit(event, payload) { for (const fn of this.handlers[event] || []) fn(payload); },
  };
  // Economy sole-writer stand-in: it and only it mutates state.player.credits.
  bus.on('economy:chargeCredits', (p) => {
    emitted.charges.push(p);
    state.player.credits = Math.max(0, state.player.credits - p.amount);
  });
  bus.on('economy:grantCredits', (p) => {
    emitted.grants.push(p);
    state.player.credits += p.amount;
  });
  const d = {
    now: () => now,
    player: () => ({ pos: { x: 0, z: 0 } }),
    say(_l, _c, text) { calls.says.push(text); },
    offerChoices(_l, ids, timeout, deadlineAt) { calls.offers.push({ ids, timeout, deadlineAt }); },
    spawnShips(row, ships) {
      return ships.map((ship) => {
        const entityId = nextId++;
        state.entities.set(entityId, {
          id: entityId, type: 'ship', alive: true, pos: { ...ship.pos }, rot: 0, data: {},
        });
        row.ids.push(entityId);
        row.roles[entityId] = ship.role;
        return entityId;
      });
    },
    spawnProp() { return { id: nextId++, data: {} }; },
    entsOf: (row) => row.ids.map((id) => state.entities.get(id)).filter((e) => e && e.type === 'ship'),
    charge(amount, reason) { if (amount > 0) bus.emit('economy:chargeCredits', { amount: Math.round(amount), reason }); },
    grant(amount, reason) { if (amount > 0) bus.emit('economy:grantCredits', { amount: Math.round(amount), reason }); },
    rep(factionId, delta, reason) { calls.reps.push({ factionId, delta, reason }); },
    resolve(row, outcome) { calls.resolved.push(outcome); row.phase = 'done'; },
    abort(row, reason) { calls.aborts.push(reason); row.phase = 'done'; },
  };
  const drive = (runtime, choiceId) => {
    const t0 = now;
    runtime.fire(d, live, state);
    let steps = 0;
    while (live.phase !== 'offer' && live.phase !== 'done' && steps++ < 100) {
      now = live.deadlineAt + 0.01;
      runtime.tick(d, live, state, now);
    }
    const preOfferS = now - t0;
    if (choiceId) runtime.choose(d, live, state, choiceId);
    return preOfferS;
  };
  return { state, calls, emitted, live, d, drive };
}

function tollSpec() {
  return {
    id: 'unit_toll',
    title: 'UNIT TOLL',
    factionId: 'faction_free',
    start: 'spawn',
    cast: [{ role: 'hull_0', archetype: 'mule_trader', dx: 0, dz: 0, scanLabel: 'MOSS' }],
    choices: [
      { id: 'a', label: 'Pay the count', playerLine: 'Paying.' },
      { id: 'c', label: 'Leave', playerLine: 'Leaving.' },
    ],
    timeoutChoice: 'c',
    phases: [
      { id: 'spawn', verb: 'spawn', next: 'offer' },
      { id: 'offer', verb: 'offer', windowS: 10, motion: 'hold', onChoice: { a: 'say_a', c: 'done_c' } },
      { id: 'say_a', verb: 'say', line: 'Count cleared.', channel: 'info', next: 'cost_a' },
      { id: 'cost_a', verb: 'cost', amount: 36, reason: 'unit_toll', next: 'grant_a' },
      { id: 'grant_a', verb: 'grant', amount: 0, reason: 'unit_toll', next: 'rep_a' },
      { id: 'rep_a', verb: 'rep', factionId: 'faction_free', delta: 2, reason: 'unit_toll', next: 'done_a' },
      { id: 'done_a', verb: 'resolve', outcome: 'a' },
      { id: 'done_c', verb: 'resolve', outcome: 'c' },
    ],
  };
}

test('cost routes the debit to the credits owner through the charge dep', () => {
  const world = makeWorld(500);
  const runtime = compileVignette(tollSpec());
  world.drive(runtime, 'a');
  assert.deepEqual(world.emitted.charges, [{ amount: 36, reason: 'unit_toll' }]);
  assert.deepEqual(world.emitted.grants, [], 'a paid toll grants nothing');
  assert.equal(world.state.player.credits, 464, 'the sole writer debited 36');
  assert.deepEqual(world.calls.resolved, ['a']);
  assert.deepEqual(world.calls.aborts, []);
});

test('insufficient funds aborts the vignette with a reason and moves no money', () => {
  const world = makeWorld(10);
  const runtime = compileVignette(tollSpec());
  world.drive(runtime, 'a');
  assert.deepEqual(world.calls.aborts, ['insufficient_funds']);
  assert.deepEqual(world.emitted.charges, [], 'no debit when the hull cannot cover it');
  assert.equal(world.state.player.credits, 10, 'balance untouched');
  assert.deepEqual(world.calls.resolved, []);
});

test('a zero cost is a no-op that still reaches the next phase', () => {
  const world = makeWorld(0);
  const spec = tollSpec();
  spec.phases.find((phase) => phase.id === 'cost_a').amount = 0;
  const runtime = compileVignette(spec);
  world.drive(runtime, 'a');
  assert.deepEqual(world.emitted.charges, []);
  assert.deepEqual(world.calls.aborts, []);
  assert.deepEqual(world.calls.resolved, ['a']);
});

test('the generated border-checkpoint toll charges the count and waits ≤10 s to offer', () => {
  const world = makeWorld(500);
  const preOfferS = world.drive(toll562.runtime, 'a');
  assert.ok(preOfferS <= 10.2, `pre-offer orbit ran ${preOfferS.toFixed(2)} s of authored wait`);
  assert.deepEqual(world.emitted.charges, [{ amount: 36, reason: TOLL_ID }]);
  assert.deepEqual(world.emitted.grants, [], 'Pay the count pays nothing back');
  assert.equal(world.state.player.credits, 464);
  assert.deepEqual(world.calls.resolved, ['a']);
});
