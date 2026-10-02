import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { pursuitBarkFor } from '../src/data/barks.js';

// A refused voice request must not consume the entity's one line for that situation;
// the bark has to stay owed so a later think tick can still deliver it.

function boot(sayImpl) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.meta = state.meta || {};
  state.meta.seed = 47;
  const bus = createBus();
  const emitted = [];
  const realEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    emitted.push({ event, payload });
    return realEmit(event, payload);
  };
  const sayCalls = [];
  const helpers = {
    voice: {
      say(payload) {
        sayCalls.push(payload);
        return sayImpl(payload, sayCalls.length);
      },
    },
  };
  core.init({ state, bus, helpers, registry: null });
  const actor = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 400, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 80,
    hullMax: 80,
    collides: true,
    team: 1,
    data: { ai: { passive: true, fsm: 'idle' }, factionId: 'faction_reach' },
  });
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, actor, system, sayCalls, emitted };
}

function recordFor(state, actor) {
  return state.barkDirector && state.barkDirector.entities
    && state.barkDirector.entities[String(actor.id)];
}

test('refused _speak does not consume the situation; acceptance marks and emits once', () => {
  const answers = [false, true];
  const { state, actor, system, sayCalls, emitted } = boot(() => answers.shift() ?? true);

  // The arbiter refuses. The record must be left untouched so the
  // line is still owed — a refusal is not a delivery.
  assert.equal(system._speak(actor, 'scan', 'state'), false);
  assert.equal(sayCalls.length, 1);
  let rec = recordFor(state, actor);
  assert.equal(rec.lastSituation, null);
  assert.deepEqual(rec.said, {});
  assert.deepEqual(rec.history, []);
  assert.equal(rec.lastSpokenAt, -Infinity);
  assert.equal(emitted.filter((e) => e.event === 'barkDirector:voice').length, 0);

  // Acceptance: the same actor and situation now delivers, records, and emits once.
  assert.equal(system._speak(actor, 'scan', 'state'), true);
  assert.equal(sayCalls.length, 2);
  rec = recordFor(state, actor);
  assert.equal(rec.lastSituation, 'scan');
  assert.equal(rec.said.scan, true);
  assert.equal(rec.history.length, 1);
  assert.equal(rec.history[0].situation, 'scan');
  assert.equal(rec.lastSpokenAt, state.simTime || 0);
  const receipts = emitted.filter((e) => e.event === 'barkDirector:voice');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].payload.entityId, actor.id);
  assert.equal(receipts[0].payload.situation, 'scan');

  // The situation is spent: a third attempt neither calls the arbiter nor emits.
  assert.equal(system._speak(actor, 'scan', 'state'), false);
  assert.equal(sayCalls.length, 2);
  assert.equal(emitted.filter((e) => e.event === 'barkDirector:voice').length, 1);
});

test('_speakEventLine refusal keeps the line owed and acceptance spends it once', () => {
  const answers = [false, true];
  const { state, actor, system, sayCalls, emitted } = boot(() => answers.shift() ?? true);

  assert.equal(
    system._speakEventLine(actor, 'law-pursuit', 'law:wantedWarrantPosted', pursuitBarkFor),
    false,
  );
  assert.equal(sayCalls.length, 1);
  let rec = recordFor(state, actor);
  assert.deepEqual(rec.said, {});
  assert.deepEqual(rec.history, []);

  assert.equal(
    system._speakEventLine(actor, 'law-pursuit', 'law:wantedWarrantPosted', pursuitBarkFor),
    true,
  );
  assert.equal(sayCalls.length, 2);
  rec = recordFor(state, actor);
  assert.equal(rec.said['law-pursuit'], true);
  assert.equal(rec.history.length, 1);
  assert.equal(rec.history[0].situation, 'law-pursuit');
  assert.equal(emitted.filter((e) => e.event === 'barkDirector:voice').length, 1);

  assert.equal(
    system._speakEventLine(actor, 'law-pursuit', 'law:wantedWarrantPosted', pursuitBarkFor),
    false,
  );
  assert.equal(sayCalls.length, 2);
});

test('recycled entity id does not inherit the dead occupant\'s said record', () => {
  const { state, helpers, actor, system, sayCalls, emitted } = boot(() => true);

  // A second live actor's record must survive the reset of the recycled id.
  const bystander = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 500, z: 40 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 80,
    hullMax: 80,
    collides: true,
    team: 1,
    data: { ai: { passive: true, fsm: 'idle' }, factionId: 'faction_mts' },
  });
  assert.equal(system._speak(bystander, 'scan', 'state'), true);
  assert.equal(system._speak(actor, 'scan', 'state'), true);
  const actorId = actor.id;
  assert.equal(recordFor(state, actor).said.scan, true);

  // Real core lifecycle: immediate removal frees the id, the next spawn reoccupies it.
  helpers.removeEntity(actorId, { immediate: true });
  const recycled = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 600, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 80,
    hullMax: 80,
    collides: true,
    team: 1,
    data: { ai: { passive: true, fsm: 'idle' }, factionId: 'faction_reach' },
  });
  assert.equal(recycled.id, actorId, 'the freed id is recycled for the new occupant');
  assert.notEqual(recycled, actor);

  // The new occupant owns the id's voice budget fresh: it may speak 'scan' once,
  // then dedup applies to it as normal.
  assert.equal(recordFor(state, recycled), undefined);
  assert.equal(system._speak(recycled, 'scan', 'state'), true);
  assert.equal(recordFor(state, recycled).said.scan, true);
  const sayCountAfterDelivery = sayCalls.length;
  assert.equal(system._speak(recycled, 'scan', 'state'), false);
  assert.equal(sayCalls.length, sayCountAfterDelivery);

  // Only the recycled id's record was cleared; the bystander stays deduped.
  assert.equal(recordFor(state, bystander).said.scan, true);
  assert.equal(system._speak(bystander, 'scan', 'state'), false);
  assert.equal(sayCalls.length, sayCountAfterDelivery);
  assert.equal(
    emitted.filter((e) => e.event === 'barkDirector:voice').length,
    3,
  );
});
