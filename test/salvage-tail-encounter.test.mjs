// THE SALVAGE TAIL (367) — the opening raid's second chapter: the surviving mule captain
// runs the corridor again with the replacement lot, and the cutter that took her once is
// shadowing her for round two. The stalk is a decision window, not a timer trap.
//
// Focused contract (deterministic, sim-time only):
//   1. the requiresCompletedShape gate keeps the chapter honest — it cannot fire in a save
//      where the opening raid never happened;
//   2. fire fields the same captain with the volatile replacement lot and the raiding pack,
//      holds their first fire, and offers the fork;
//   3. the fork answers: shadow/bait commit the raiders on the captain; the unanswered stalk
//      commits on its own at the authored beat;
//   4. a broken tail pays, reps, and makes the wire; a lost captain grades the loss by the
//      FIRST raid's outcome — the corridor remembers losing her twice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const OBSERVED = Object.freeze([
  'encounter:choiceOffered',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:voice',
  'economy:grantCredits',
  'faction:repDelta',
  'news:publish',
]);

const SECTOR = 'sector_helios_prime';

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
  sim.state.story.depthProgramEncounters = { completed: {} };
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function record(t, names = OBSERVED) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function fire(t, suffix, { raidHappened = true, raidOutcome = 'defended' } = {}) {
  if (raidHappened) {
    t.state.story.depthProgramEncounters.completed.opening_hauler_raid = { outcome: raidOutcome };
  }
  const result = t.director.requestAuthoredEncounter({
    shapeId: 'salvage_tail',
    encounterId: `tail:${suffix}`,
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: false, // the GATE is the subject: no force in the honesty test
  });
  return result;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const countOf = (rows, name, match) => rows.filter(
  (r) => r.name === name && (!match || JSON.stringify(r.payload).includes(match)),
).length;
const choose = (t, id, choiceId) => t.bus.emit('encounter:choose', { encounterId: id, choiceId });

test('salvage tail: the chapter cannot fire in a save where the raid never happened', () => {
  const t = boot();
  const result = fire(t, 'unearned', { raidHappened: false });
  assert.equal(result.ok, false, 'no first chapter, no second chapter');
  assert.equal(result.reason, 'gated');

  const earned = fire(t, 'earned');
  assert.equal(earned.ok, true, 'after the raid, the corridor asks again');
});

test('salvage tail: fire fields the captain, holds first fire, and offers the fork', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'cast').encounterId;
  const live = liveOf(t, id);

  assert.equal(t.director.aliveCount(live, 'hauler'), 1);
  assert.ok(t.director.aliveCount(live, 'raider') >= 1);
  const hauler = t.director.entsOf(live, 'hauler')[0];
  assert.ok(hauler.data.cargo.cmdty_fuel_cells >= 5, 'the replacement lot is the stake');
  assert.ok(live.data.freightManifest, 'manifest wired for custody');

  // The stalk holds: raiders aim at her but no combat commit before the fork.
  for (const r of t.director.entsOf(live, 'raider')) {
    assert.equal(r.data.ai.targetId, hauler.id, 'they shadow her');
    assert.equal(r.data.combat.targetId, null, 'first fire is held');
  }
  const offer = rows.find((r) => r.name === 'encounter:choiceOffered');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['shadow', 'bait', 'decline']);
});

test('salvage tail: the fork commits, and a broken tail pays and makes the wire', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'shadow').encounterId;
  const live = liveOf(t, id);

  choose(t, id, 'shadow');
  const hauler = t.director.entsOf(live, 'hauler')[0];
  for (const r of t.director.entsOf(live, 'raider')) {
    assert.equal(r.data.combat.targetId, hauler.id, 'the commit lands after the answer');
  }
  assert.equal(countOf(rows, 'encounter:voice', 'Copy cover'), 1);

  // The player answers: every raider goes down, the captain makes the dock.
  for (const r of t.director.entsOf(live, 'raider')) r.alive = false;
  for (let i = 0; i < 60 * 5 && liveOf(t, id); i++) t.sim.step();

  const grants = rows.filter((r) => r.name === 'economy:grantCredits'
    && r.payload.reason === 'salvage_tail:defended');
  assert.equal(grants.length, 1, 'the escort is paid once');
  assert.equal(grants[0].payload.amount, 320);
  const reps = rows.filter((r) => r.name === 'faction:repDelta'
    && r.payload.reason === 'salvage_tail_defended');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].payload.delta, 7);
  assert.equal(countOf(rows, 'news:publish', 'THE CORRIDOR HOLDS'), 1, 'the run makes the wire');
  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'defended');
  assert.equal(resolved.length, 1);
  assert.equal(liveOf(t, id), undefined, 'no live record leaks');
});

test('salvage tail: an unanswered stalk commits itself; losing her grades the first raid', () => {
  const t = boot();
  const rows = record(t);
  const id = fire(t, 'unanswered', { raidOutcome: 'robbed' }).encounterId;
  const live = liveOf(t, id);

  // No answer: at the authored beat the raiders stop being careful on their own.
  for (let i = 0; i < 60 * 28; i++) t.sim.step();
  assert.equal(live.data.tail.chosen, 'unanswered', 'the stalk reads silence as an answer');
  const hauler = t.director.entsOf(live, 'hauler')[0];
  for (const r of t.director.entsOf(live, 'raider')) {
    assert.equal(r.data.combat.targetId, hauler.id);
  }

  // Losing her twice grades harder: the first raid was robbed, so this loss is the second.
  hauler.alive = false;
  for (let i = 0; i < 60 * 3 && liveOf(t, id); i++) t.sim.step();
  const resolved = rows.filter((r) => r.name === 'encounter:resolved'
    && r.payload.outcome === 'hauler_lost');
  assert.equal(resolved.length, 1);
  const reps = rows.filter((r) => r.name === 'faction:repDelta'
    && r.payload.reason === 'salvage_tail_lost');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].payload.delta, -6, 'the second loss reads as the second loss');
  assert.equal(countOf(rows, 'news:publish', 'LOST HER TWICE'), 1, 'the wire remembers both');
});
