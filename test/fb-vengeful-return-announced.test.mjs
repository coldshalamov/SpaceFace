// FB-139 — a vengeful return is announced through the ace memory voice, not only felt
// through the spawn. moralMemory:vengefulReturn gets one remembered bark and one cited
// news line naming the earlier mercy; a first encounter stays silent.
//
// Spare-then-return script on seed 4242: namedAce:fled → aceMemory:transition →
// rememberAceMemoryTransition (encounterDirector's real wiring) → moralMemory:vengefulReturn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aceMemory } from '../src/systems/aceMemory.js';
import { rememberAceMemoryTransition, pendingMoralDebt } from '../src/systems/moralMemory.js';
import { knownAces } from '../src/data/namedAces.js';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(evt, fn) { (handlers.get(evt) || handlers.set(evt, []).get(evt)).push(fn); return () => {}; },
    emit(evt, payload) { emitted.push({ event: evt, payload }); for (const fn of handlers.get(evt) || []) fn(payload); },
  };
}

function mount() {
  const bus = makeBus();
  const state = {
    mode: 'flight',
    meta: { seed: 4242 },
    simTime: 40,
    tick: 2400,
    playerId: 'player',
    entities: new Map(),
    world: { currentSectorId: 'sector_helios' },
    story: { flags: {} },
    ui: {},
  };
  const said = [];
  const helpers = { voice: { say(p) { said.push(p); } } };
  aceMemory.init({ state, bus, helpers });
  // The spare path, wired the way encounterDirector.js wires it.
  bus.on('aceMemory:transition', (p) => rememberAceMemoryTransition(state, p));
  return { bus, state, said };
}

test('a spare-then-return gets one remembered bark and one cited news line (seed 4242)', () => {
  const { bus, state, said } = mount();
  const ace = knownAces().find((a) => a.lifecycleOwner !== 'nemesis');

  // The spare: the ace flees, the moral ledger records the debt on the real wire.
  bus.emit('namedAce:fled', { aceId: ace.id, t: state.simTime });
  assert.ok(pendingMoralDebt(state, ace.id), 'the spare wrote a pending moral debt');
  const voicesBefore = bus.emitted.filter((e) => e.event === 'aceMemory:voice').length;
  const newsBefore = bus.emitted.filter((e) => e.event === 'news:headline' && e.payload.kind === 'ace-vengeful-return').length;
  assert.equal(voicesBefore, 0, 'the flee itself does not announce a return');
  assert.equal(newsBefore, 0);

  // The return: the spared pilot comes back angry (e1EncounterRuntime.js's emit shape).
  bus.emit('moralMemory:vengefulReturn', {
    id: ace.id, name: ace.name, encounterId: 'enc-return-1',
    cause: 'spared_escape', mercyOrdinal: 1, factionId: ace.factionId,
  });

  const voices = bus.emitted.filter((e) => e.event === 'aceMemory:voice' && e.payload.situation === 'vengeful-return');
  assert.equal(voices.length, 1, 'exactly one bark announces the return');
  assert.ok(voices[0].payload.text.length > 0);
  assert.equal(said.length, 1, 'the ace voice says the line once');

  const news = bus.emitted.filter((e) => e.event === 'news:headline' && e.payload.kind === 'ace-vengeful-return');
  assert.equal(news.length, 1, 'exactly one cited line posts');
  assert.ok(news[0].payload.text.includes('mercy no. 1'),
    'the line names the earlier mercy it answers');
  assert.equal(news[0].payload.aceId, ace.id);
});

test('the same return is announced once; a first encounter stays silent', () => {
  const { bus } = mount();
  const ace = knownAces().find((a) => a.lifecycleOwner !== 'nemesis');

  // A stranger with no spare on the ledger: nothing is announced.
  bus.emit('moralMemory:vengefulReturn', { id: 'ace-never-spared', name: 'Stranger', encounterId: 'enc-x' });
  assert.equal(bus.emitted.filter((e) => e.event === 'aceMemory:voice').length, 0,
    'no bark without a spare on the ledger');
  assert.equal(bus.emitted.filter((e) => e.event === 'news:headline' && e.payload.kind === 'ace-vengeful-return').length, 0);

  // Now the real spare, then the same return emitted twice — one announcement total.
  bus.emit('namedAce:fled', { aceId: ace.id, t: 40 });
  const payload = { id: ace.id, name: ace.name, encounterId: 'enc-return-2', cause: 'spared_escape', mercyOrdinal: 1, factionId: ace.factionId };
  bus.emit('moralMemory:vengefulReturn', payload);
  bus.emit('moralMemory:vengefulReturn', payload);
  assert.equal(bus.emitted.filter((e) => e.event === 'aceMemory:voice' && e.payload.situation === 'vengeful-return').length, 1,
    'one bark per return');
  assert.equal(bus.emitted.filter((e) => e.event === 'news:headline' && e.payload.kind === 'ace-vengeful-return').length, 1,
    'one cited line per return');
});
