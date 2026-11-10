// LAW-05 — a station acknowledging custody says it at the berth. `law:custodyAcknowledged` was
// emitted by custodyConsequences into a void (zero listeners): the surrender→tow→custody beat
// ended with only a CONTROL ledger line and the berth itself never spoke. barkDirector now
// answers with one comms line in the law register, naming the station when authored geography
// knows it, deduped on the upstream settlement key so one transfer cannot bark twice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { barkDirector } from '../src/systems/barkDirector.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    handlers,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeState() {
  const entities = new Map();
  entities.set(7, {
    id: 7, type: 'ship', team: 1, factionId: 'faction_red',
    data: { ai: { archetype: 'pirate_raider' }, bountyCr: 900 },
  });
  return {
    meta: { seed: 4242 },
    simTime: 50,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: { credits: 5000 },
    world: { currentSectorId: 'sector_helios_reach' },
    entities,
    ui: {},
  };
}

function bootBarks(state) {
  const bus = makeBus();
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { bus, barks };
}

const berthLines = (bus) => bus.emitLog.filter(
  (e) => e.evt === 'comms:popup' && e.payload.sender === 'BERTH CONTROL');

test('law:custodyAcknowledged produces one berth line naming the station', () => {
  const state = makeState();
  const { bus } = bootBarks(state);
  bus.emit('law:custodyAcknowledged', {
    entityId: 7, stationId: 'station_helios', authorityFactionId: 'faction_scn',
    profileId: 'faction_red:pirate_raider', repeatIndex: 1, t: 50,
  });
  const lines = berthLines(bus);
  assert.equal(lines.length, 1, 'exactly one berth line');
  assert.equal(lines[0].payload.category, 'law');
  assert.match(lines[0].payload.text, /Helios Station/, 'the line names the berth');
});

test('a replayed ack cannot bark twice for one transfer', () => {
  const state = makeState();
  const { bus } = bootBarks(state);
  const payload = {
    entityId: 7, stationId: 'station_helios', repeatIndex: 1, t: 50,
  };
  bus.emit('law:custodyAcknowledged', payload);
  bus.emit('law:custodyAcknowledged', payload);
  assert.equal(berthLines(bus).length, 1, 'same settlement key collapses');
  // A genuinely different transfer (new t) is a new ack, not a duplicate.
  bus.emit('law:custodyAcknowledged', { ...payload, t: 51, repeatIndex: 2 });
  const lines = berthLines(bus);
  assert.equal(lines.length, 2, 'a second transfer may speak');
  assert.match(lines[1].payload.text, /repeat profile/, 'repeat captures get the repeat line');
});

test('destroy removes the listener', () => {
  const state = makeState();
  const { bus, barks } = bootBarks(state);
  barks.destroy();
  bus.emit('law:custodyAcknowledged', { entityId: 7, stationId: 'station_helios', repeatIndex: 1, t: 50 });
  assert.equal(berthLines(bus).length, 0, 'no listener survives destroy');
});

test('the seam is live end-to-end from a real custody transfer', () => {
  const state = makeState();
  const bus = makeBus();
  const custody = Object.create(custodyConsequences);
  custody.init({ state, bus, helpers: { voice: { say() { return true; } } }, registry: { get() { return null; } } });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  bus.emit('law:custodyTransfer', {
    outcome: 'custody', id: 'surrender-custody:7', entityId: 7,
    stationId: 'station_helios', authorityFactionId: 'faction_scn', t: state.simTime,
  });
  const acks = bus.emitLog.filter((e) => e.evt === 'law:custodyAcknowledged');
  assert.equal(acks.length, 1, 'custody owner emits one ack');
  assert.equal(berthLines(bus).length, 1, 'the ack paints one berth line');
});

test('a re-init of custodyConsequences does not double-subscribe', () => {
  const state = makeState();
  const bus = makeBus();
  const custody = Object.create(custodyConsequences);
  const ctx = { state, bus, helpers: { voice: { say() { return true; } } }, registry: { get() { return null; } } };
  custody.init(ctx);
  custody.init(ctx);
  assert.equal((bus.handlers.get('law:custodyTransfer') || []).length, 1,
    'init is idempotent — one custody listener');
});

test('a refused voice.say falls back to toast instead of dropping the line', () => {
  const state = makeState();
  const bus = makeBus();
  const custody = Object.create(custodyConsequences);
  custody.init({ state, bus, helpers: { voice: { say() { return false; } } }, registry: { get() { return null; } } });
  bus.emit('law:custodyTransfer', {
    outcome: 'custody', id: 'surrender-custody:7', entityId: 7,
    stationId: 'station_helios', authorityFactionId: 'faction_scn', t: state.simTime,
  });
  const toasts = bus.emitLog.filter((e) => e.evt === 'toast');
  assert.equal(toasts.length, 1, 'rejected voice line still reaches the player');
  assert.match(toasts[0].payload.text, /custody confirmed/i);
});
