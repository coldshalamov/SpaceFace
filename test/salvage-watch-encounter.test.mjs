// THE SALVAGE WATCH (362) — the station answers a lane mayday with a yard tug, raiders
// escalate onto the rescue, and the player's presence decides which world the lane keeps.
//
// Focused contract (deterministic, sim-time only, no wall clock, no Math.random):
//   1. fire fields the full physical premise: broken mule casualty, Hawser-class yard tug
//      (not an enemy hull), raider pack, volatile manifest stake;
//   2. raiders escalate onto the TUG at the authored beat — killing the rescue is the
//      unforgivable loss, and the rep/news consequence is said EXACTLY ONCE;
//   3. work only completes when the lane is clear: raiders pressed on the tug stall the
//      repair, a cleared lane closes it, and a clean close pays, reps, and makes news;
//   4. the casualty breaking up resolves the disputed-field outcome with its own headline.
//
// Harness: encounterDirector only — no combat system — so hulls move exactly when this file
// (or the encounter's own math) moves them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { runtime } from '../src/data/encounters/362-the-salvage-watch.js';

const OBSERVED = Object.freeze([
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:voice',
  'economy:grantCredits',
  'faction:repDelta',
  'news:publish',
  'comms:log',
]);

const SECTOR = 'sector_helios_prime'; // force-fired; the 0.8 security gate is a live-route concern

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
    shapeId: 'salvage_watch',
    encounterId: `sw:${suffix}`,
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

test('salvage watch: fire fields casualty, yard tug, raiders, and the volatile stake', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'cast');

  const live = liveOf(t, id);
  assert.ok(live, 'the watch must own a live record');
  assert.equal(live.phase, 'conflict');
  assert.equal(t.director.aliveCount(live, 'hauler'), 1, 'exactly one casualty');
  assert.equal(t.director.aliveCount(live, 'escort'), 1, 'exactly one rescue tug');
  assert.ok(t.director.aliveCount(live, 'raider') >= 1, 'at least one raider');

  const freighter = t.director.entsOf(live, 'hauler')[0];
  assert.ok(freighter.hull < freighter.hullMax * 0.3, 'the casualty rides in broken');
  assert.equal(freighter.data.jobKind, 'hauler');
  assert.ok(freighter.data.cargo && freighter.data.cargo.cmdty_fuel_cells > 0, 'volatile lot aboard');
  assert.ok(live.data.freightManifest, 'manifest stake wired for the custody stack');

  const tug = t.director.entsOf(live, 'escort')[0];
  assert.equal(tug.data.defId, 'ship_hawser', 'the rescue is yard stock, not an enemy hull');
  assert.equal(tug.data.jobKind, 'tender');
  assert.equal(tug.data.watchTugFor, freighter.id, 'the tug owns the work site');
  assert.equal(tug.data.ai.passive, true, 'a rescue helm does not authorize combat');

  assert.equal(countOf(rows, 'encounter:spawned'), 1);
  const news = rows.filter((r) => r.name === 'news:publish');
  assert.equal(news.length, 0, 'no news before any outcome');
});

test('salvage watch: raiders escalate onto the tug; the tender-lost consequence is said once', () => {
  const t = boot();
  record(t);
  const id = fire(t, 'escalate');
  const live = liveOf(t, id);
  const tug = t.director.entsOf(live, 'escort')[0];
  const raiders = t.director.entsOf(live, 'raider');

  // Pre-escalation: raiders are on the casualty.
  for (let i = 0; i < 300; i++) t.sim.step(); // 5 s
  assert.ok(live.data.watch.escalated === false, 'no escalation before the beat');
  for (const r of raiders) {
    if (r.alive !== false) assert.equal(r.data.combat.targetId, t.director.entsOf(live, 'hauler')[0].id);
  }

  // Past the escalation beat the rescue is the target.
  for (let i = 0; i < 1200; i++) t.sim.step(); // +20 s (t=25 s)
  assert.equal(live.data.watch.escalated, true, 'the complication commits on schedule');
  for (const r of t.director.entsOf(live, 'raider')) {
    assert.equal(r.data.combat.targetId, tug.id, 'raiders re-aim at the rescue');
  }

  // Killing the tug: exactly one rep hit and one headline, however long the lane stays.
  const rows = record(t, ['faction:repDelta', 'news:publish']);
  tug.alive = false;
  for (let i = 0; i < 600; i++) t.sim.step(); // 10 s of stripping
  const repHits = rows.filter((r) => r.name === 'faction:repDelta'
    && r.payload.reason === 'salvage_watch_tender_lost');
  const news = rows.filter((r) => r.name === 'news:publish' && r.payload.text.includes('YARD TUG LOST'));
  assert.equal(repHits.length, 1, 'the rep hit is said exactly once');
  assert.equal(news.length, 1, 'the headline is said exactly once');
  assert.ok(liveOf(t, id) === undefined || live.data.watch.tenderLost === true,
    'the watch either resolved or carries the loss honestly');
});

test('salvage watch: a cleared lane closes the repair — paid, repped, and in the news', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'repaired');
  const live = liveOf(t, id);

  // Raiders pressed on the scene stall the work through the arrive burn.
  for (let i = 0; i < 60 * 14; i++) t.sim.step(); // 14 s: arrive + pressure
  assert.ok(live.data.watch.t < 55 * 0.5, 'work cannot complete while raiders press the tug');

  // Stationary unit fixture only: explicitly place both real hull envelopes beside each
  // other. This fixture proves attended time/rewards, NOT native propulsion or arrival.
  const tug = t.director.entsOf(live, 'escort')[0];
  const mule = t.director.entsOf(live, 'hauler')[0];
  tug.pos = { x: mule.pos.x + mule.radius + tug.radius + 35, z: mule.pos.z };
  tug.vel = { x: 0, z: 0 }; mule.vel = { x: 0, z: 0 };

  // The player answers: every raider goes down.
  for (const r of t.director.entsOf(live, 'raider')) r.alive = false;
  for (let i = 0; i < 60 * 70 && liveOf(t, id); i++) t.sim.step();

  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'repaired');
  assert.equal(resolved.length, 1, 'the clean close resolves exactly once');
  const grants = rows.filter((r) => r.name === 'economy:grantCredits'
    && r.payload.reason === 'salvage_watch:repaired');
  assert.equal(grants.length, 1, 'watch bounty paid once');
  assert.equal(grants[0].payload.amount, 300);
  const reps = rows.filter((r) => r.name === 'faction:repDelta'
    && r.payload.reason === 'salvage_watch_repaired');
  assert.equal(reps.length, 1, 'station standing moves once');
  assert.equal(reps[0].payload.delta, 6, 'standing rises by six');
  const news = rows.filter((r) => r.name === 'news:publish'
    && r.payload.text.includes('SALVAGE WATCH CLOSED CLEAN'));
  assert.equal(news.length, 1, 'the clean close makes the wire');
  const receipt = rows.find((r) => r.name === 'encounter:receipt'
    && r.payload.outcome === 'repaired');
  assert.ok(receipt && receipt.payload.text.includes('WATCH CLOSED'), 'the receipt speaks');
  assert.equal(liveOf(t, id), undefined, 'the live record is gone after resolve');
});

test('salvage watch: the casualty breaking up resolves the disputed field', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'casualty');

  const freighter = t.director.entsOf(liveOf(t, id), 'hauler')[0];
  freighter.alive = false;
  for (let i = 0; i < 60 * 3 && liveOf(t, id); i++) t.sim.step();

  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'casualty_lost');
  assert.equal(resolved.length, 1, 'the disputed field resolves once');
  const news = rows.filter((r) => r.name === 'news:publish'
    && r.payload.text.includes('BROKE UP UNDER WATCH'));
  assert.equal(news.length, 1, 'the field makes the wire once');
  assert.equal(liveOf(t, id), undefined, 'no live record leaks');
});

// These deliberate owner fixtures use genuine director actors but do not integrate motion.
// Native Hawser/flightV3/physics qualification is separate.
function serviceFixture(suffix) {
  const t = boot(), rows = record(t), id = fire(t, suffix), live = liveOf(t, id);
  const tug = t.director.entsOf(live, 'escort')[0];
  const mule = t.director.entsOf(live, 'hauler')[0];
  const raiders = t.director.entsOf(live, 'raider');
  for (const r of raiders) r.alive = false;
  function berth() {
    tug.pos = { x: mule.pos.x + tug.radius + mule.radius + 35, z: mule.pos.z };
    tug.vel = { x: 0, z: 0 }; mule.vel = { x: 0, z: 0 };
  }
  function tick(seconds = 1) {
    t.state.simTime += seconds;
    runtime.tick(t.director, live, t.state, t.state.simTime);
  }
  berth();
  return { ...t, rows, id, live, tug, mule, raiders, berth, tick };
}
const paid = q => countOf(q.rows, 'economy:grantCredits', 'salvage_watch:repaired');

test('salvage watch: remote, rushing, overlapping and pressure cannot buy repair time', () => {
  const q = serviceFixture('physical-gates');
  const broken = q.mule.hull;
  q.tug.pos.x += 100000;
  for (let i = 0; i < 70; i++) q.tick();
  assert.equal(q.live.data.watch.t, 0, 'no timer-only remote repair');
  assert.equal(q.mule.hull, broken); assert.equal(paid(q), 0);
  assert.ok(Math.abs(q.tug.data.intent.moveX) + Math.abs(q.tug.data.intent.moveZ) > 0,
    'remote rescue actually requests propulsion');
  q.berth(); q.tug.vel.x = 20;
  for (let i = 0; i < 10; i++) q.tick();
  assert.equal(q.live.data.watch.t, 0, 'flybys are not attended work');
  q.berth(); q.tug.pos = { ...q.mule.pos };
  q.tick(); assert.equal(q.live.data.watch.t, 0, 'overlapping hulls are not a service berth');
  q.berth(); q.raiders[0].alive = true; q.raiders[0].pos = { ...q.tug.pos };
  for (let i = 0; i < 10; i++) q.tick();
  assert.equal(q.live.data.watch.t, 0, 'the original threat still interrupts repairs');
});

test('salvage watch: separation pauses, return resumes, and missed time earns nothing', () => {
  const q = serviceFixture('resume');
  for (let i = 0; i < 21; i++) q.tick();
  assert.equal(q.live.data.watch.t, 20);
  q.tug.pos.x += 1000;
  for (let i = 0; i < 10; i++) q.tick();
  assert.equal(q.live.data.watch.t, 20);
  q.berth(); q.tick(); assert.equal(q.live.data.watch.t, 20, 'return first establishes attendance');
  q.tick(10); assert.equal(q.live.data.watch.t, 20, 'no catch-up repair');
  for (let i = 0; i < 34; i++) q.tick();
  assert.equal(paid(q), 0, '54 eligible seconds do not finish 55 seconds');
  q.tick();
  assert.equal(paid(q), 1); assert.equal(q.mule.hull, q.mule.hullMax);
  assert.equal(liveOf(q, q.id), undefined);
});

test('salvage watch: reentrant reward listeners and duplicate ticks cannot pay twice', () => {
  const q = serviceFixture('reentrant');
  q.bus.on('economy:grantCredits', () => runtime.tick(q.director, q.live, q.state, q.state.simTime));
  for (let i = 0; i < 56; i++) q.tick();
  q.tick(); runtime.tick(q.director, q.live, q.state, q.state.simTime);
  assert.equal(paid(q), 1);
  assert.equal(countOf(q.rows, 'faction:repDelta', 'salvage_watch_repaired'), 1);
  assert.equal(countOf(q.rows, 'news:publish', 'SALVAGE WATCH CLOSED CLEAN'), 1);
});

test('salvage watch: foreign ownership, actor identity and body replacement cannot qualify', () => {
  for (const actorKind of ['tug', 'mule']) for (const kind of ['intent', 'actor', 'generation', 'body', 'role', 'sector', 'owner', 'missing', 'departure']) {
    const q = serviceFixture('foreign-' + actorKind + '-' + kind);
    const owned = q.tug.data.intent, actor = q[actorKind];
    if (kind === 'intent') q.tug.data.intent = { moveX: 0.75, moveZ: 0.25, owner: 'new-owner' };
    if (kind === 'actor') q.state.entities.set(actor.id, { ...actor });
    if (kind === 'generation') actor.occupantGeneration = (actor.occupantGeneration || 0) + 1;
    if (kind === 'body') {
      actor.physicsBody = {}; q.tick(); actor.physicsBody = {};
    }
    if (kind === 'role') q.live.roles[actor.id] = actorKind === 'tug' ? 'hauler' : 'escort';
    if (kind === 'sector') q.state.world.currentSectorId = 'sector_elsewhere';
    if (kind === 'owner') actor.data.ai.encounterId = 'another-scene';
    if (kind === 'missing') q.state.entities.delete(actor.id);
    if (kind === 'departure') actor.data.despawnAt = q.state.simTime + 20;
    q.tick();
    assert.equal(paid(q), 0, kind);
    assert.equal(countOf(q.rows, 'news:publish'), 0, 'no invented obituary: ' + kind);
    assert.equal(countOf(q.rows, 'faction:repDelta'), 0, 'no invented loss penalty: ' + kind);
    assert.equal(q.live.outcome, 'watch_over', kind);
    assert.notEqual(q.tug.data.intent, owned, 'release scene control: ' + kind);
    if (kind === 'intent') assert.equal(q.tug.data.despawnAt, undefined, 'successor is not retired');
    if (kind === 'intent') assert.deepEqual(q.tug.data.intent,
      { moveX: 0.75, moveZ: 0.25, owner: 'new-owner' }, 'do not overwrite successor helm');
  }
});

test('salvage watch: missing/dead actors, timeout, abort and restore clear only the watch helm', () => {
  for (const kind of ['missing', 'dead', 'timeout', 'abort', 'restore', 'new-game']) {
    const q = serviceFixture('cleanup-' + kind), owned = q.tug.data.intent;
    if (kind === 'missing') q.state.entities.delete(q.mule.id);
    if (kind === 'dead') q.tug.alive = false;
    if (kind === 'timeout') q.state.simTime = q.live.deadlineAt;
    if (kind === 'abort') q.director.abort(q.live, 'interrupted');
    if (kind === 'restore') q.bus.emit('save:restoring', {});
    if (kind === 'new-game') q.bus.emit('game:new', {});
    q.tick();
    assert.notEqual(q.tug.data.intent, owned, kind);
    assert.equal(owned.moveX, 0); assert.equal(owned.moveZ, 0);
    assert.equal(paid(q), 0, kind);
  }
});

test('salvage watch: a lost tender cannot restart the watch by reviving its old actor', () => {
  const q = serviceFixture('revived');
  q.raiders[0].alive = true;
  q.raiders[0].pos = { x: q.tug.pos.x + 10000, z: q.tug.pos.z };
  q.tug.alive = false; q.tick();
  assert.equal(q.live.data.watch.tenderLost, true);
  q.tug.alive = true;
  for (let i = 0; i < 70; i++) q.tick();
  assert.equal(q.live.data.watch.t, 0);
  assert.equal(paid(q), 0);
});

test('salvage watch: malformed geometry pauses work and neutralizes the owned helm', () => {
  const q = serviceFixture('malformed');
  q.tug.pos.x += 10000; q.tick();
  const helm = q.tug.data.intent;
  assert.ok(Math.abs(helm.moveX) + Math.abs(helm.moveZ) > 0);
  q.tug.vel.x = NaN; q.tick();
  assert.equal(helm.moveX, 0); assert.equal(helm.moveZ, 0);
  assert.equal(q.live.data.watch.t, 0);
  q.berth(); q.tick();
  assert.equal(q.live.data.watch.t, 0);
});
