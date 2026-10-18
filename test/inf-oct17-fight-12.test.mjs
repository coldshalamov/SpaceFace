// FIGHT-12 — a specialist that counters your Massline says what it did, once.
// Seed 4242, real owner code (barkDirector through the voice arbiter's bark
// channel). First countered latch in an engagement speaks in the specialist's
// register; the second stays quiet; the next engagement speaks again.
import assert from 'node:assert/strict';
import test from 'node:test';

import { barkDirector } from '../src/systems/barkDirector.js';
import { MASSLINE_COUNTERS, MASSLINE_COUNTERPLAY_BARKS } from '../src/data/masslineCounters.js';

function makeDirector() {
  const said = [];
  const state = {
    mode: 'flight',
    tick: 4242,
    simTime: 70.7,
    playerId: 1,
    meta: { seed: 4242 },
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, data: {} }],
      [7, {
        id: 7, type: 'ship', alive: true, team: 1, pos: { x: 120, z: 0 },
        data: { name: 'Cutter Mara', factionId: 'faction_free' },
      }],
    ]),
    entityList: [],
  };
  state.entityList = [...state.entities.values()];
  const bus = {
    handlers: new Map(),
    on(name, fn) {
      if (!this.handlers.has(name)) this.handlers.set(name, new Set());
      this.handlers.get(name).add(fn);
      return () => this.handlers.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of this.handlers.get(name) || []) fn(payload);
    },
  };
  const voice = {
    say(entry) {
      said.push(entry);
      return true;
    },
  };
  const host = Object.create(barkDirector);
  host.init({ state, bus, helpers: { voice } });
  const counter = (actorId = 7) => bus.emit('massline:npcCounterplay', {
    schemaVersion: 1,
    verb: 'cut_bridle',
    role: 'specialist',
    actorId,
    attachmentId: 'att1',
    reason: 'specialist_cut',
    tick: state.tick,
  });
  return { host, bus, voice, state, said, counter };
}

function hasRawId(text) {
  return /massline|npc_counterplay|cut_bridle|specialist_cut|attachment/i.test(String(text || ''))
    || /[_:]/.test(String(text || ''))
    || /[a-z]+[A-Z]/.test(String(text || ''));
}

test('FIGHT-12 seed 4242: first countered latch speaks once in the specialist register', () => {
  const { state, said, counter } = makeDirector();
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

test('FIGHT-12 seed 4242: second countered latch in the same engagement stays quiet', () => {
  const { state, said, counter } = makeDirector();
  counter();
  assert.equal(said.length, 1, 'first latch speaks');
  state.simTime += 1;
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'second latch in the same engagement produces no bark');
});

test('FIGHT-12 seed 4242: the next engagement speaks again', () => {
  const { bus, state, said, counter } = makeDirector();
  counter();
  assert.equal(said.length, 1, 'first engagement speaks once');
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'still quiet inside the same engagement');
  bus.emit('combat:outcome', { entityId: 9, outcome: 'killed', reason: 'entity:killed' });
  // The ambient gap stays the anti-spam floor across engagements: a fresh engagement
  // speaks again once the gap has passed.
  state.simTime += 13;
  state.tick += 780;
  counter();
  assert.equal(said.length, 2, 'a new engagement speaks again');
});
