import assert from 'node:assert/strict';
import test from 'node:test';
import { limitKnowledge, forgetStaleIdentity, segmentBlocked } from '../../../src/ai/counterplay/observe.js';

const self = { id: 'self', pos: { x: 0, z: 0 } };
const body = (id, x, z = 0) => ({ id, pos: { x, z }, vel: { x: 0, z: 0 }, generation: 1, radius: 2 });
const rope = (ownerId, targetId, length = 1) => ({ id: `${ownerId}-${targetId}`, ownerId, targetId, length });
const doctrine = (delay = 0) => ({ sensorRange: 100, reactionDelayTicks: delay });
const world = (contacts = [], obstacles = [], tethers = []) => ({ self, contacts, obstacles, tethers });
const sense = (input, memory = {}, tick = 0, delay = 0) => limitKnowledge(input, doctrine(delay), memory, tick);

test('rope length is not a location oracle for unobserved endpoints', () => {
  const result = sense(world([body('far-a', 1000), body('far-b', 1001)], [], [rope('far-a', 'far-b')]));
  assert.deepEqual(result.contacts, []);
  assert.deepEqual(result.tethers, []);
});

test('both third-party endpoints must be observed, not merely one', () => {
  const result = sense(world([body('a', 20)], [], [rope('a', 'hidden')]));
  assert.deepEqual(result.tethers, []);
});

test('long ropes between observed endpoints are not rejected by their length', () => {
  const result = sense(world([body('a', -90), body('b', 90)], [], [rope('a', 'b', 180)]));
  assert.equal(result.tethers.length, 1);
  assert.equal(result.tethers[0].length, 180);
});

test('own tethers remain known even when the other endpoint is out of range', () => {
  const result = sense(world([], [], [rope('self', 'distant', 500), rope('distant', 'self', 500)]));
  assert.equal(result.tethers.length, 2);
});

test('an occluded endpoint cannot leak back into perception through a tether', () => {
  const rock = { ...body('rock', 40), radius: 10 };
  const result = sense(world([body('a', 10, 20), body('b', 80)], [rock], [rope('a', 'b', 73)]));
  assert.equal(result.contacts.some((row) => row.id === 'b'), false);
  assert.deepEqual(result.tethers, []);
});

test('observed rock anchors can be tether endpoints without obscuring themselves', () => {
  const rock = { ...body('anchor', 40, 30), radius: 8 };
  const result = sense(world([body('a', 10), rock], [rock], [rope('a', 'anchor', 42)]));
  assert.equal(result.contacts.some((row) => row.id === 'anchor'), true);
  assert.equal(result.tethers.length, 1);
});

test('invalid coordinates, dead obstacles and invalid rope metrics do not create ghosts', () => {
  const result = sense(world([body('good', 80), { id: 'bad' }, body('nan', NaN)],
    [{ ...body('dead', 40), radius: 20, alive: false }],
    [rope('self', 'good', NaN), rope('self', 'good', -1), rope(null, 'self', 3)]));
  assert.deepEqual(result.contacts.map((row) => row.id), ['good']);
  assert.deepEqual(result.obstacles, []);
  assert.deepEqual(result.tethers, []);
});

test('invalid observer poses and non-integer ticks produce no sensory evidence', () => {
  for (const tick of [NaN, Infinity, -1, 0.5]) assert.deepEqual(sense(world([body('p', 10)]), {}, tick).contacts, []);
  assert.deepEqual(sense({ contacts: [body('p', 10)] }).contacts, []);
  assert.deepEqual(sense({ self: { pos: { x: NaN, z: 0 } }, contacts: [body('p', 10)] }).contacts, []);
});

test('reaction delay is respected by contacts and tethers together', () => {
  const memory = {};
  const input = world([body('a', 10), body('b', 20)], [], [rope('a', 'b', 10)]);
  for (let tick = 0; tick < 3; tick++) {
    const result = sense(input, memory, tick, 3);
    assert.deepEqual(result.contacts, []);
    assert.deepEqual(result.tethers, []);
  }
  const result = sense(input, memory, 3, 3);
  assert.equal(result.tick, 0);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.tethers.length, 1);
});

test('repeated calls in one tick cannot evict the delayed observation', () => {
  const memory = {};
  for (let tick = 0; tick <= 3; tick++) sense(world([body('p', tick)]), memory, tick, 3);
  for (let i = 0; i < 100; i++) {
    const result = sense(world([body('p', 90)]), memory, 3, 3);
    assert.equal(result.tick, 0);
    assert.equal(result.contacts[0].pos.x, 0);
  }
  assert.equal(memory.delay.length, 4);
  assert.equal(new Set(memory.delay.map((row) => row.tick)).size, memory.delay.length);
});

test('rewinding clears the discarded timeline and observes the delay again', () => {
  const memory = {};
  for (let tick = 0; tick <= 10; tick++) sense(world([body('old', tick)]), memory, tick, 2);
  assert.deepEqual(sense(world([body('new', 10)]), memory, 4, 2).contacts, []);
  assert.deepEqual(memory.delay.map((row) => row.tick), [4]);
  assert.equal(sense(world([body('new', 20)]), memory, 6, 2).contacts[0].id, 'new');
});

test('a delayed frame owns its pose even when the raw world is mutated', () => {
  const input = world([body('p', 10)]);
  const memory = {};
  sense(input, memory, 0, 2);
  input.contacts[0].pos.x = 80;
  assert.equal(sense(input, memory, 2, 2).contacts[0].pos.x, 10);
});

test('serialized history resumes with exactly the same delayed observations', () => {
  const a = {};
  for (let tick = 0; tick < 10; tick++) sense(world([body('p', tick)]), a, tick, 3);
  const b = JSON.parse(JSON.stringify(a));
  for (let tick = 10; tick < 30; tick++) {
    assert.deepEqual(sense(world([body('p', tick)]), a, tick, 3), sense(world([body('p', tick)]), b, tick, 3));
  }
  assert.deepEqual(a, b);
});

test('history stays bounded by delayed ticks, including sparse sampling', () => {
  const memory = {};
  for (let tick = 0; tick < 3000; tick++) {
    sense(world(), memory, tick, 7);
    assert.ok(memory.delay.length <= 8);
  }
  const sparse = {};
  sense(world([body('p', 10)]), sparse, 0, 3);
  const result = sense(world([body('p', 80)]), sparse, 10, 3);
  assert.equal(result.tick, 0);
  assert.equal(result.contacts[0].pos.x, 10);
});

test('zero-delay observation works without memory, nonzero delay cannot bypass it', () => {
  assert.equal(sense(world([body('p', 10)]), null, 0, 0).contacts.length, 1);
  assert.equal(sense(world([body('p', 10)]), null, 0, 1).contacts.length, 0);
});

test('recycled target identity clears a commit even with a partial memory snapshot', () => {
  const memory = { commit: { targetId: 'p', targetGeneration: 1 }, latchIssued: true };
  assert.equal(forgetStaleIdentity(memory, { tick: 50, contacts: [{ ...body('p', 10), generation: 2 }] }), true);
  assert.equal(memory.commit, null);
  assert.equal(memory.latchIssued, false);
  assert.equal(memory.phaseSince, 50);
  assert.equal(memory.identity.p.generation, 2);
});

test('occlusion can ignore an endpoint without allocating filtered obstacle arrays', () => {
  const rock = { ...body('rock', 40), radius: 10 };
  assert.equal(segmentBlocked(self.pos, { x: 80, z: 0 }, [rock]), true);
  assert.equal(segmentBlocked(self.pos, { x: 80, z: 0 }, [rock], 0, 'rock'), false);
});
