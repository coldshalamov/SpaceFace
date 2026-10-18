// FIGHT-12 — a specialist that counters your Massline says what it did, once.
// Seed 4242, real owner code (barkDirector through the voice arbiter's bark
// channel). First countered latch in an engagement speaks in the specialist's
// register; the second stays quiet; the next engagement speaks again.
import assert from 'node:assert/strict';
import test from 'node:test';

import { barkDirector } from '../src/systems/barkDirector.js';
import { createSimulation } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { MASSLINE_COUNTERS, MASSLINE_COUNTERPLAY_BARKS } from '../src/data/masslineCounters.js';

function makeDirector(t) {
  const said = [];
  const sim = createSimulation({ seed: 4242, systems: [combatOutcome], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.tick = 4242; state.simTime = 70.7;
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 } }));
  state.playerId = player.id;
  const specialist = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 120, z: 0 }));
  const escort = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 180, z: 0 }));
  for (const entity of [specialist, escort]) {
    // aiFireIntent publishes these target/fire fields on the default worker lane.
    entity.data.combat = { targetId: player.id };
    entity.data.intent = { fire: true };
  }
  const voice = {
    say(entry) {
      if (entry.register === 'specialist' || entry.register === 'ace') said.push(entry);
      return true;
    },
  };
  const host = Object.create(barkDirector);
  host.init({ state, bus, helpers: { voice } });
  t.after(() => { host.destroy(); sim.dispose(); });
  const counter = (actorId = specialist.id) => bus.emit('massline:npcCounterplay', {
    schemaVersion: 1,
    verb: 'cut_bridle',
    role: 'specialist',
    actorId,
    attachmentId: 'att1',
    reason: 'specialist_cut',
    tick: state.tick,
  });
  return { host, bus, voice, state, said, counter, specialist, escort };
}

function hasRawId(text) {
  return /massline|npc_counterplay|cut_bridle|specialist_cut|attachment/i.test(String(text || ''))
    || /[_:]/.test(String(text || ''))
    || /[a-z]+[A-Z]/.test(String(text || ''));
}

test('FIGHT-12 seed 4242: first countered latch speaks once in the specialist register', (t) => {
  const { state, said, counter } = makeDirector(t);
  assert.ok(state.meta.seed === 4242, 'fixed seed 4242');
  assert.ok(
    Array.isArray(MASSLINE_COUNTERS) && MASSLINE_COUNTERS.some((row) => row.counter),
    'the counter rules carry the specialist counter words',
  );
  counter();
  assert.equal(said.length, 1, 'the first countered latch produces one bark');
  assert.equal(said[0].channel, 'bark', 'the bark travels the voice arbiter bark channel');
  assert.ok(said[0].text && said[0].text.length >= 8, 'the bark is a spoken line');
  assert.ok(MASSLINE_COUNTERPLAY_BARKS.includes(said[0].text), 'the line comes from the counter data');
  assert.equal(hasRawId(said[0].text), false, 'player words carry no raw id');
});

test('FIGHT-12 seed 4242: second countered latch in the same engagement stays quiet', (t) => {
  const { state, said, counter } = makeDirector(t);
  counter();
  assert.equal(said.length, 1, 'first latch speaks');
  state.simTime += 1;
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'second latch in the same engagement produces no bark');
});

test('FIGHT-12 seed 4242: the next engagement speaks again', (t) => {
  const { bus, state, said, counter, specialist, escort } = makeDirector(t);
  counter();
  assert.equal(said.length, 1, 'first engagement speaks once');
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'still quiet inside the same engagement');
  escort.alive = false;
  bus.emit('entity:killed', { id: escort.id, killerId: state.playerId });
  specialist.data.intent.fire = false;
  bus.emit('ai:flee', { entityId: specialist.id });
  assert.equal(state.combatOutcome.outcomes.length, 2, 'the real outcome owner records both hulls');
  specialist.data.intent.fire = true;
  // The ambient gap stays the anti-spam floor across engagements: a fresh engagement
  // speaks again once the gap has passed.
  counter();
  assert.equal(said.length, 1, 'the fresh engagement still obeys the ambient gap');
  state.simTime += 13;
  state.tick += 780;
  counter();
  assert.equal(said.length, 2, 'a new engagement speaks again');
});

for (const outcome of ['disabled', 'surrendered', 'fled', 'killed']) {
  test(`FIGHT-12 seed 4242: another ship ${outcome} does not re-arm the fighting specialist`, (t) => {
    const { bus, state, said, counter, escort } = makeDirector(t);
    counter();
    if (outcome === 'disabled') bus.emit('combat:subsystemDisabled', {
      targetId: escort.id, subsystemId: 'subsystem_drive' });
    if (outcome === 'surrendered') bus.emit('combat:surrendered', { entityId: escort.id });
    if (outcome === 'fled') {
      escort.data.intent.fire = false;
      bus.emit('ai:flee', { entityId: escort.id });
    }
    if (outcome === 'killed') {
      escort.alive = false;
      bus.emit('entity:killed', { id: escort.id, killerId: state.playerId });
    }
    assert.equal(state.combatOutcome.outcomes[0].outcome, outcome, 'real per-ship outcome published');
    state.simTime += 13; state.tick += 780;
    counter();
    assert.equal(said.length, 1, 'a per-ship outcome cannot re-arm a specialist still attacking');
  });
}
