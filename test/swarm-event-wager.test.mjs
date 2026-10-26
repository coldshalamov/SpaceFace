// CRUCIBLE mid-run wager — the telegraph is a bet, not ambient pressure.
//
// Every 5th non-boss wave draws a seeded card; while its windup runs the card's own wager
// terms ride `swarm:eventTelegraphed` and the deck answers on `swarm:eventVerdict`. ENGAGE
// fires the event as authored and pays the stated bounty score; REFUSE stands the room
// down — pressure and payout both forfeit. An unanswered card resolves to its authored
// `wager.timeout`: every shipped telegraph declares the event as already inbound
// ("about to run hot", "riding in"), so they all read 'accept' — opt-out pressure.
//
// Deterministic: seeded picks, simTime windows, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWARM_EVENT_BY_ID,
  swarmEventFor,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import {
  createSwarmEventDirector,
  swarmEventFrame,
  swarmEventWager,
  SWARM_EVENT_BOUNTY_REASON,
} from '../src/systems/swarmEvents.js';
import { isSwarmBossWave } from '../src/data/swarmMode.js';
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

const SEED = 4242;

/** Find the wave in 1..400 whose seeded draw is `eventId` for `arenaId`. */
function waveFor(arenaId, eventId, seed = SEED) {
  for (let wave = 1; wave <= 400; wave++) {
    const draw = swarmEventFor({ arenaId, wave, seed });
    if (draw && draw.id === eventId) return wave;
  }
  return null;
}

/**
 * A live director on a mock bus, armed on an event wave. Returns the captured traffic and
 * the director so a test can answer the wager or run the clock past the fire line.
 */
function armedDirector({ arenaId, wave, seed = SEED, phase = 'active' }) {
  const emitted = [];
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const writes = [];
  const registered = [];
  const spawned = [];
  const mineRequests = [];
  const fields = {
    updateExternal(id, patch) { writes.push({ id, ...patch }); return { id }; },
    unregisterExternal() { return true; },
    registerEnvironmental(spec) { registered.push(spec); return spec; },
  };
  const state = {
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 1, pos: { x: 40, z: -15 } }]]),
    run: { kind: 'survival', ruleset: 'swarm', phase, arenaId, wave, seed },
  };
  const director = createSwarmEventDirector({
    state,
    bus,
    helpers: { spawnEntity(spec) { spawned.push(spec); return { id: 'pod-1' }; } },
    registry: { get: (name) => (name === 'fields' ? fields : null) },
  });
  director.init();
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave }));
  director.setInstalledFields([{ id: 'room_field', strength: 40 }]);
  return { director, bus, state, emitted, writes, registered, spawned, mineRequests };
}

const named = (h, event) => h.emitted.filter((entry) => entry.event === event);
const telegraphed = (h) => named(h, 'swarm:eventTelegraphed').map((entry) => entry.payload);
const eventVerbs = (h) => named(h, 'swarm:event').map((entry) => entry.payload && entry.payload.verb);
const bounties = (h) => named(h, 'run:awardRequested')
  .filter((entry) => entry.payload && entry.payload.reason === SWARM_EVENT_BOUNTY_REASON)
  .map((entry) => entry.payload);

function startWave(h, wave) {
  h.bus.emit('run:waveStarted', { wave });
}

test('the telegraph offers the wager — terms, deadline, and no ambient spend', () => {
  assert.deepEqual(validateSwarmEvents(), []);
  const wave = waveFor('asteroid_mill', 'rock_rain');
  const card = SWARM_EVENT_BY_ID.rock_rain;
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);

  const offers = telegraphed(h);
  assert.equal(offers.length, 1, 'one wager offer per armed event');
  const offer = offers[0];
  assert.equal(offer.eventId, 'rock_rain');
  assert.equal(offer.deadlineAt, card.windupS, 'the answer window IS the authored windup');
  assert.deepEqual(offer.wager, { score: card.wager.score, timeout: 'accept' });
  // The alert still speaks — the wager adds a decision, it does not silence the telegraph.
  const alerts = named(h, 'alert').map((entry) => entry.payload);
  assert.ok(alerts.some((alert) => alert.text === card.telegraph));
  // Offered, not fired: nothing spent while the wager sits on the table.
  assert.equal(h.writes.length, 0);
  assert.deepEqual(eventVerbs(h), [], 'no spend before the fire line');
});

test('engage: the event fires as authored and pays the stated bounty — exact receipts', () => {
  const wave = waveFor('asteroid_mill', 'rock_rain');
  const card = SWARM_EVENT_BY_ID.rock_rain;
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'rock_rain', accept: true, source: 'test' });

  // Engaging does not rush the room: the fire line is the authored windup, not the click.
  h.state.simTime = card.windupS - 0.25;
  h.director.update(0.016, h.state);
  assert.equal(h.writes.length, 0, 'an early engage still waits for the telegraph window');
  assert.equal(bounties(h).length, 0);

  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'), 'the event spent');
  assert.ok(h.writes.some((w) => w.id === 'room_field' && w.strength === 40 * card.factor),
    'the surge ran hot as authored');
  assert.deepEqual(bounties(h), [
    { score: card.wager.score, reason: SWARM_EVENT_BOUNTY_REASON, wave },
  ], 'one bounty receipt, the card\'s stated score');
  h.director.destroy();
});

test('refuse: the event never fires and nothing pays — the wager cuts both ways', () => {
  const wave = waveFor('asteroid_mill', 'rock_rain');
  const card = SWARM_EVENT_BY_ID.rock_rain;
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'rock_rain', accept: false, source: 'test' });

  assert.deepEqual(eventVerbs(h), ['declined'], 'the stand-down receipt');
  h.state.simTime = card.windupS + 2;
  h.director.update(0.016, h.state);
  h.state.simTime += card.windowS + 2;
  h.director.update(0.016, h.state);
  assert.equal(h.writes.length, 0, 'no surge — the pressure is forfeit too');
  assert.equal(bounties(h).length, 0, 'no payout');
  assert.equal(named(h, 'swarm:event').length, 1, 'declined is the only verb the card ever emits');
  h.director.destroy();
});

test('timeout: an unanswered wager engages — every shipped card is authored opt-out', () => {
  // The card text is the honest read: each telegraph declares the event as already
  // inbound, so silence is consent. REFUSE is the only verb that changes anything.
  const wave = waveFor('cinder_sluice', 'sluice_surge');
  const card = SWARM_EVENT_BY_ID.sluice_surge;
  assert.equal(card.wager.timeout, 'accept');
  const h = armedDirector({ arenaId: 'cinder_sluice', wave });
  startWave(h, wave);
  h.state.simTime = card.windupS + 1;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'), 'unanswered pressure still lands');
  assert.equal(bounties(h).length, 1, 'the opt-out bounty pays with the event');
  h.director.destroy();
});

test('verdict guards: wrong card, wrong wave, and second answers all bounce', () => {
  const wave = waveFor('asteroid_mill', 'rock_rain');
  const card = SWARM_EVENT_BY_ID.rock_rain;
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'mine_drift', accept: false });
  h.bus.emit('swarm:eventVerdict', { wave: wave + 5, eventId: 'rock_rain', accept: false });
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'rock_rain', accept: true });
  // First verdict won: a late refuse cannot stand the room down after an engage.
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'rock_rain', accept: false });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'), 'the accepted card still fired');
  assert.equal(eventVerbs(h).filter((v) => v === 'declined').length, 0);
  h.director.destroy();
});

test('a wave ending mid-windup stands the wager down — declined, not spent', () => {
  const wave = waveFor('asteroid_mill', 'rock_rain');
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);
  h.bus.emit('run:waveCleared', {});
  assert.deepEqual(eventVerbs(h), ['declined'], 'the room reports the stand-down');
  h.state.simTime = 100;
  h.director.update(0.016, h.state);
  assert.equal(h.writes.length, 0);
  assert.equal(bounties(h).length, 0);
  h.director.destroy();
});

test('boss waves and ordinary waves offer nothing — the wager is the event round', () => {
  for (const wave of [6, 10]) {
    assert.equal(isSwarmBossWave(wave), wave === 10);
    const h = armedDirector({ arenaId: 'asteroid_mill', wave });
    startWave(h, wave);
    assert.equal(telegraphed(h).length, 0, `wave ${wave} offers no wager`);
    h.state.simTime = 30;
    h.director.update(0.016, h.state);
    assert.equal(h.writes.length, 0);
    assert.equal(bounties(h).length, 0);
    h.director.destroy();
  }
});

test('a supply wager pays score and still drops the pod at its authored stamp', () => {
  const wave = waveFor('helios_core', 'sprocket_crate');
  const card = SWARM_EVENT_BY_ID.sprocket_crate;
  const h = armedDirector({ arenaId: 'helios_core', wave });
  startWave(h, wave);
  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'sprocket_crate', accept: true });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  assert.equal(h.spawned.length, 1, 'the crate still rides in');
  assert.equal(h.spawned[0].data.amount, card.credits, 'the pod keeps its authored stamp');
  assert.equal(h.spawned[0].data.kind, 'swarm_supply_pod');
  assert.deepEqual(bounties(h), [
    { score: card.wager.score, reason: SWARM_EVENT_BOUNTY_REASON, wave },
  ], 'the bounty rides on top of the pod');
  h.director.destroy();
});

test('seeded determinism: same arena, wave and seed offer the identical wager', () => {
  const a = armedDirector({ arenaId: 'the_hive', wave: 15, seed: SEED });
  const b = armedDirector({ arenaId: 'the_hive', wave: 15, seed: SEED });
  startWave(a, 15);
  startWave(b, 15);
  assert.deepEqual(telegraphed(a), telegraphed(b), 'same seed, same offer — ghosts agree');
  // And a different seed still draws a wager-shaped offer when it draws a card at all.
  const c = armedDirector({ arenaId: 'the_hive', wave: 15, seed: 777 });
  startWave(c, 15);
  const offer = telegraphed(c)[0];
  if (offer) assert.ok(offer.wager && offer.wager.timeout, 'any drawn card states its default');
  a.director.destroy();
  b.director.destroy();
  c.director.destroy();
});

test('the wager normalizer: missing is ambient, malformed defaults safe', () => {
  assert.equal(swarmEventWager(null), null);
  assert.equal(swarmEventWager({ id: 'x' }), null, 'a pre-wager card carries no terms');
  assert.equal(swarmEventWager({ wager: { score: 50, timeout: 'accept' } }).timeout, 'accept');
  assert.equal(swarmEventWager({ wager: { score: 50, timeout: 'refuse' } }).timeout, 'refuse');
  assert.equal(swarmEventWager({ wager: { score: 50, timeout: 'banana' } }).timeout, 'refuse',
    'an unstated default can never mean impose');
  assert.equal(swarmEventWager({ wager: { score: 40.6, timeout: 'accept' } }).score, 41);
});

test('the deck adapter turns the telegraph into an ENGAGE/REFUSE card and one verdict', () => {
  const emitted = [];
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    off(event, handler) {
      const i = subs.findIndex(([t, h]) => t === event && h === handler);
      if (i >= 0) subs.splice(i, 1);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const offers = [];
  const resolved = [];
  setPromptDeck({
    offerDecision(spec) { offers.push(spec); return true; },
    resolveDecision(id) { resolved.push(id); return true; },
    updateDecision() { return true; },
  });
  const prompt = createEncounterChoicePrompt({ bus });
  try {
    bus.emit('swarm:eventTelegraphed', {
      wave: 5, eventId: 'rock_rain', windupS: 4, deadlineAt: 4,
      name: 'Rock rain', kind: 'surge',
      telegraph: 'ROCK RAIN — catch what you can, throw what you catch',
      wager: { score: 50, timeout: 'accept' },
    });
    assert.equal(offers.length, 1, 'the wager reached the deck');
    const spec = offers[0];
    assert.equal(spec.deadlineAt, 4, 'the card carries the sim\'s own fire line');
    assert.deepEqual(spec.choices.map((c) => c.id), ['accept', 'refuse']);
    assert.equal(spec.choices[1].cancel, true, 'refuse is the safe verb');
    spec.onChoose('refuse', 'test');
    const verdict = emitted.find((entry) => entry.event === 'swarm:eventVerdict');
    assert.deepEqual(verdict && verdict.payload, {
      wave: 5, eventId: 'rock_rain', accept: false, source: 'test',
    });
    assert.deepEqual(resolved, ['swarm:event-wager'], 'the card comes down on the answer');
    // The room settling the event retires the offer the same way.
    bus.emit('swarm:event', { verb: 'spend', eventId: 'rock_rain' });
    assert.equal(resolved.length, 2);
  } finally {
    prompt.destroy();
    setPromptDeck(null);
  }
});

test('a wager-less telegraph never reaches the deck — ambient degrades quietly', () => {
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    off() {},
    emit(event, payload) {
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const offers = [];
  setPromptDeck({ offerDecision(spec) { offers.push(spec); return true; }, resolveDecision() { return true; } });
  const prompt = createEncounterChoicePrompt({ bus });
  try {
    bus.emit('swarm:eventTelegraphed', { wave: 5, eventId: 'x', windupS: 4 });
    assert.equal(offers.length, 0, 'no wager terms, no card');
  } finally {
    prompt.destroy();
    setPromptDeck(null);
  }
});
