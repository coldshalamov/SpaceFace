// THE COUNTING RELAY (366) — a strange signal played as a three-hop physical chase: two
// relay buoys and a dead convoy's mail hulk, each hop a real body you reach by flying the
// bearing the last one named, ending in an honest choice.
//
// Focused contract (deterministic, sim-time only):
//   1. fire places the first repeater and offers the cycle;
//   2. listening twice walks the chain — hop two spawns as a real prop, then the mail hulk
//      spawns with a real salvage pool;
//   3. taking the mail is physical: jettisoned-cargo pods on the field, the courier's pay,
//      the graffiti receipt, and the count closing;
//   4. leaving it keeps the count unbroken, and ignoring it fades the chain quietly.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const OBSERVED = Object.freeze([
  'encounter:choiceOffered',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:voice',
  'graffiti:show',
  'economy:grantCredits',
]);

const SECTOR = 'sector_veil_nebula';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.story.beatIndex = 7;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function record(t, names = OBSERVED) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function fire(t, suffix) {
  const result = t.director.requestAuthoredEncounter({
    shapeId: 'counting_relay',
    encounterId: `relay:${suffix}`,
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(result.ok, true, `fire ${suffix}: ${JSON.stringify(result)}`);
  return result.encounterId;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const countOf = (rows, name, match) => rows.filter(
  (r) => r.name === name && (!match || JSON.stringify(r.payload).includes(match)),
).length;
const propsOf = (t) => [...t.state.entities.values()].filter(
  (e) => e && e.data && e.data.parentType === 'story_prop',
);
const choose = (t, id, choiceId) => t.bus.emit('encounter:choose', { encounterId: id, choiceId });

test('counting relay: fire places the first repeater and offers the cycle', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'open');

  assert.equal(propsOf(t).length, 1, 'the first repeater is a real body');
  assert.equal(propsOf(t)[0].data.storyPropKind, 'counting_relay_1');
  const offer = rows.find((r) => r.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the cycle is offered');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['listen', 'ignore']);
  assert.equal(countOf(rows, 'encounter:voice', 'This one counts'), 1, 'the intercept speaks');
});

test('counting relay: listening twice walks the chain to the mail hulk', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'chain');

  choose(t, id, 'listen');
  assert.equal(propsOf(t).length, 2, 'the echo hop is a real body');
  assert.equal(propsOf(t)[1].data.storyPropKind, 'counting_relay_2');
  assert.ok(propsOf(t)[1].pos.x !== propsOf(t)[0].pos.x || propsOf(t)[1].pos.z !== propsOf(t)[0].pos.z,
    'hop two is elsewhere: a flight, not a stroll');
  assert.equal(countOf(rows, 'encounter:voice', 'The pulse is a count'), 1);
  assert.equal(countOf(rows, 'encounter:choiceOffered'), 2, 'the cycle re-offers');

  choose(t, id, 'listen');
  const wrecks = [...t.state.entities.values()].filter(
    (e) => e && e.type === 'wreck' && e.data && e.data.storyPropKind === 'counting_relay_cache',
  );
  assert.equal(wrecks.length, 1, 'the mail hulk is a real salvage body');
  assert.equal(wrecks[0].data.salvagePool.cmdty_salvage_electronics, 3, 'the pool is real');
  assert.equal(countOf(rows, 'encounter:voice', 'the count stops'), 1);
  const offer = rows.filter((r) => r.name === 'encounter:choiceOffered')[2];
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['take_the_mail', 'leave_it', 'ignore']);
});

test('counting relay: taking the mail is physical and closes the count', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'mail');

  choose(t, id, 'listen');
  choose(t, id, 'listen');
  choose(t, id, 'take_the_mail');

  const pods = [...t.state.entities.values()].filter(
    (e) => e && e.type !== 'wreck' && e.data && e.data.payloadType
      && e.data.salvagePool && e.data.salvagePool.cmdty_salvage_electronics,
  );
  const qty = pods.reduce((sum, p) => sum + (p.data.salvagePool.cmdty_salvage_electronics || 0), 0);
  assert.ok(qty >= 3 && qty <= 5, `the mail is real pods on the field, got ${qty}`);
  const grants = rows.filter((r) => r.name === 'economy:grantCredits'
    && r.payload.reason === 'counting_relay:mail');
  assert.equal(grants.length, 1, 'the courier pay lands once');
  assert.equal(grants[0].payload.amount, 140);
  assert.equal(countOf(rows, 'graffiti:show', 'WE CAME BACK'), 1, 'the hull remembers');
  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'mail_taken');
  assert.equal(resolved.length, 1);
  const receipt = rows.find((r) => r.name === 'encounter:receipt' && r.payload.outcome === 'mail_taken');
  assert.ok(receipt && receipt.payload.text.includes('stopped counting'), 'the receipt closes the count');
  assert.equal(liveOf(t, id), undefined, 'no live record leaks');
});

test('counting relay: leaving it keeps the count; ignoring fades it', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'leave');
  choose(t, id, 'listen');
  choose(t, id, 'listen');
  choose(t, id, 'leave_it');
  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'left_with_the_count');
  assert.equal(resolved.length, 1, 'the respectful path resolves');
  assert.equal(countOf(rows, 'graffiti:show', 'STILL COUNTING'), 1, 'the other truth is also written');

  const t2 = boot();
  const rows2 = record(t2);
  const id2 = fire(t2, 'ignored');
  choose(t2, id2, 'ignore');
  assert.equal(rows2.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'ignored').length, 1, 'the quiet path resolves');
  assert.equal(liveOf(t2, id2), undefined, 'no live record leaks');
});
