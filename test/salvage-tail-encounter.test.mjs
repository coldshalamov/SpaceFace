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
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';
import { getPromptDeck, setPromptDeck, routeDigit } from '../src/ui/promptDeck.js';
import { runtime } from '../src/data/encounters/367-the-salvage-tail.js';

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
    assert.equal(r.data.combat.targetId, null, 'cover preserves the stalking window');
    assert.equal(r.data.ai.arrivalHoldUntil, live.startedAt + 26);
  }
  assert.equal(countOf(rows, 'encounter:voice', 'Copy cover'), 1);
  for (let i = 0; i < 60 * 27; i++) t.sim.step();
  for (const r of t.director.entsOf(live, 'raider')) assert.equal(r.data.combat.targetId, hauler.id);

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
  assert.equal(countOf(rows, 'news:publish', 'SECOND LOT LOST'), 1, 'the wire remembers both');
});

test('salvage tail: bait slips on real controls then coasts; cover keeps its powered course', () => {
  const a = boot(), b = boot();
  const la = liveOf(a, fire(a, 'cover-motion').encounterId);
  const lb = liveOf(b, fire(b, 'bait-motion').encounterId);
  choose(a, la.id, 'shadow'); choose(b, lb.id, 'bait');
  const cover = a.director.entsOf(la, 'hauler')[0], lure = b.director.entsOf(lb, 'hauler')[0];
  assert.equal(cover.data.intent.moveZ, 0.22);
  assert.equal(lure.data.intent.moveX, 0.5);
  assert.equal(lure.data.intent.assistMode, 'newtonian');
  for (const r of b.director.entsOf(lb, 'raider')) {
    assert.equal(r.data.combat.targetId, lure.id);
    assert.equal(r.data.ai.arrivalHoldUntil, undefined);
  }
  const before = JSON.stringify(b.state.input);
  for (let i = 0; i < 60 * 4; i++) { a.sim.step(); b.sim.step(); }
  assert.equal(lure.data.intent.moveX, 0);
  assert.equal(lure.data.intent.moveZ, 0);
  assert.equal(lure.data.intent.assistMode, 'newtonian');
  assert.equal(cover.data.intent.moveZ, 0.22);
  assert.equal(JSON.stringify(b.state.input), before, 'the captain does not fly the player');
});

test('salvage tail: actual damage breaks stalking, not harmless or foreign damage', () => {
  const t = boot(), rows = record(t), l = liveOf(t, fire(t, 'damage').encounterId);
  choose(t, l.id, 'shadow');
  const r = t.director.entsOf(l, 'raider')[0];
  for (const p of [{ targetId: r.id, attackerId: t.state.playerId, amount: 0 },
    { targetId: 99999, attackerId: t.state.playerId, amount: 10 }]) t.bus.emit('combat:damage', p);
  assert.equal(l.data.tail.phase, 'shadow');
  t.bus.emit('combat:damage', { targetId: r.id, attackerId: t.state.playerId, amount: 1 });
  assert.equal(l.data.tail.phase, 'run');
  assert.equal(r.data.ai.arrivalHoldUntil, undefined);
  assert.equal(countOf(rows, 'encounter:voice', 'Forget the stalk'), 1);
  t.bus.emit('combat:damage', { targetId: r.id, attackerId: t.state.playerId, amount: 1 });
  assert.equal(countOf(rows, 'encounter:voice', 'Forget the stalk'), 1);
});

test('salvage tail: lifecycle releases only its own controls and respects newer holds', () => {
  for (const event of ['save:restoring', 'sector:exit', 'game:exitToMenu', 'game:new']) {
    const t = boot(), l = liveOf(t, fire(t, event).encounterId);
    const h = t.director.entsOf(l, 'hauler')[0], r = t.director.entsOf(l, 'raider')[0];
    r.data.ai.arrivalHoldUntil = 999;
    const foreign = { moveZ: 0.2 };
    h.data.intent = foreign;
    t.bus.emit(event, {});
    assert.equal(h.data.intent, foreign);
    assert.equal(r.data.ai.arrivalHoldUntil, 999);
    t.bus.emit(event, {});
    assert.equal(h.data.intent, foreign);
  }
});

test('salvage tail: actor loss of ownership is neutral and cannot manufacture a reward', () => {
  for (const mutation of ['generation', 'body', 'intent', 'captured', 'removed', 'reused_dead']) {
    const t = boot(), rows = record(t), l = liveOf(t, fire(t, mutation).encounterId);
    const h = t.director.entsOf(l, 'hauler')[0];
    if (mutation === 'generation') h.occupantGeneration = (h.occupantGeneration || 0) + 1;
    if (mutation === 'body') h.physicsBody = { ...h.physicsBody };
    if (mutation === 'intent') h.data.intent = { moveZ: 0.2 };
    if (mutation === 'captured') { h.flags ||= {}; h.flags.persistent = true; }
    if (mutation === 'removed') t.state.entities.delete(h.id);
    if (mutation === 'reused_dead') { h.alive = false; t.state.entities.set(h.id, { ...h, alive: true, data: { ...h.data } }); }
    for (let i = 0; i < 60 * 2; i++) t.sim.step();
    assert.equal(countOf(rows, 'encounter:resolved', 'interrupted'), 1, mutation);
    assert.equal(countOf(rows, 'economy:grantCredits'), 0, mutation);
    assert.equal(countOf(rows, 'faction:repDelta'), 0, mutation);
  }
});

test('salvage tail: the watch deadline is not a fictitious dock or raider retreat', () => {
  const t = boot(), rows = record(t), l = liveOf(t, fire(t, 'deadline').encounterId);
  choose(t, l.id, 'bait');
  const h = t.director.entsOf(l, 'hauler')[0];
  for (let i = 0; i < 60 * 152; i++) t.sim.step();
  assert.equal(countOf(rows, 'encounter:resolved', 'tail_over'), 1);
  assert.equal(countOf(rows, 'economy:grantCredits'), 0);
  assert.notEqual(h.data.intent?.assistMode, 'newtonian');
  assert.equal(l.outcome, 'tail_over');
  assert.match(l.shape.receipts.tail_over, /No dock arrival/);
});

test('salvage tail: terminal effects resist synchronous re-entry', () => {
  for (const event of ['economy:grantCredits', 'faction:repDelta', 'news:publish', 'encounter:resolved']) {
    const t = boot(), rows = record(t), l = liveOf(t, fire(t, event).encounterId);
    let entered = 0;
    t.bus.on(event, () => { if (++entered === 1) { runtime.tick(t.director, l, t.state, t.state.simTime); choose(t, l.id, 'bait'); } });
    choose(t, l.id, 'shadow');
    for (const r of t.director.entsOf(l, 'raider')) r.alive = false;
    for (let i = 0; i < 120; i++) t.sim.step();
    assert.equal(countOf(rows, 'economy:grantCredits'), 1, event);
    assert.equal(countOf(rows, 'faction:repDelta'), 1, event);
    assert.equal(countOf(rows, 'news:publish'), 1, event);
    assert.equal(countOf(rows, 'encounter:resolved', 'defended'), 1, event);
  }
});
test('salvage tail: dead hauler without flight intent still waits for finite cargo custody', () => {
  const t = boot(), rows = record(t), l = liveOf(t, fire(t, 'custody').encounterId);
  const h = t.director.entsOf(l, 'hauler')[0];
  l.data.freightCargoCustody = { terminal: false };
  h.alive = false; delete h.data.intent;
  for (let i = 0; i < 120; i++) t.sim.step();
  assert.equal(countOf(rows, 'encounter:resolved'), 0);
  l.data.freightCargoCustody.terminal = true;
  for (let i = 0; i < 120; i++) t.sim.step();
  assert.equal(countOf(rows, 'encounter:resolved', 'hauler_lost'), 1);
  assert.equal(countOf(rows, 'faction:repDelta'), 1);
});

test('salvage tail: unanswered commit replaces the real adapter decision and rejects stale input', () => {
  const previousDeck = getPromptDeck();
  for (const reason of ['damage', 'elapsed']) {
    const cards = new Map();
    setPromptDeck({
      offerDecision(spec) { cards.set(spec.id, { ...cards.get(spec.id), ...spec }); return true; },
      resolveDecision(id) { return cards.delete(id); },
    });
    const t = boot(), ui = createEncounterChoicePrompt({ bus: t.bus });
    try {
      const rows = record(t, ['story:playerChoiceRecorded', 'encounter:waitStarted']);
      const l = liveOf(t, fire(t, 'ui-' + reason).encounterId), key = 'encounter:' + l.id;
      assert.deepEqual(cards.get(key).choices.map(c => c.id), ['shadow', 'bait', 'decline']);
      assert.equal(cards.get(key).deadlineAt, l.startedAt + 26);
      if (reason === 'damage') {
        const r = t.director.entsOf(l, 'raider')[0];
        t.bus.emit('combat:damage', { targetId: r.id, attackerId: t.state.playerId, amount: 1 });
      } else for (let i = 0; i < 60 * 28; i++) t.sim.step();
      assert.equal(cards.size, 1, 'same encounter key replaced, not another card');
      const wait = cards.get(key);
      assert.deepEqual(wait.choices, []);
      assert.equal(wait.detail, 'Waiting on the outcome.');
      assert.equal(wait.deadlineAt, l.deadlineAt);
      assert.equal(routeDigit([{ ...wait, seq: 1 }], key, 'Digit1'), null);
      choose(t, l.id, 'bait');
      assert.equal(l.data.tail.chosen, 'unanswered');
      assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 0, 'no invented or stale player answer');
      assert.equal(countOf(rows, 'encounter:waitStarted'), 1);
      t.director.resolve(l, 'tail_over', { speak: false });
      assert.equal(cards.size, 0, 'actual resolution clears the watch');
    } finally { ui.destroy(); setPromptDeck(previousDeck); }
  }
});

test('salvage tail: reused occupant cleanup leaves successor packets and holds untouched', () => {
  for (const changed of ['generation', 'body']) {
    const t = boot(), l = liveOf(t, fire(t, 'successor-' + changed).encounterId);
    const h = t.director.entsOf(l, 'hauler')[0], r = t.director.entsOf(l, 'raider')[0];
    const packet = h.data.intent, before = { ...packet }, hold = r.data.ai.arrivalHoldUntil;
    for (const e of [h, r]) {
      if (changed === 'generation') e.occupantGeneration = (e.occupantGeneration || 0) + 1;
      else e.physicsBody = { ...e.physicsBody };
    }
    t.bus.emit('ship:controlChanging', { fromId: t.state.playerId, toId: h.id });
    t.bus.emit('save:restoring', {});
    assert.equal(h.data.intent, packet);
    assert.deepEqual(packet, before, changed);
    assert.equal(r.data.ai.arrivalHoldUntil, hold, changed);
  }
});
