import assert from 'node:assert/strict';
import test from 'node:test';

import { latestLossFor, lossLedger } from '../src/systems/lossLedger.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    off(name, fn) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== fn));
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function makeState() {
  return {
    meta: { seed: 0x47a },
    simTime: 720,
    playerId: 1,
    entities: new Map(),
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          name: 'Helios Prime',
          owner: 'faction_scn',
        },
      },
    },
  };
}

function makeSystem(state, bus = makeBus(), voice = { say: () => true }) {
  const system = { ...lossLedger };
  system.init({
    state,
    bus,
    helpers: { voice },
    registry: { get: () => null },
  });
  return { system, bus };
}

function victim(id, identity = {}) {
  return {
    id,
    type: 'ship',
    factionId: 'faction_reach',
    data: {
      defId: 'ship_wasp',
      sectorId: 'sector_helios_prime',
      ...identity,
    },
  };
}

test('entity:killed records and saves deterministic player-kill provenance', () => {
  const state = makeState();
  state.entities.set(41, victim(41));
  const { system, bus } = makeSystem(state);

  bus.emit('entity:killed', {
    id: 41,
    killerId: state.playerId,
    type: 'ship',
    factionId: 'faction_reach',
    bountyCr: 120,
  });

  const entry = latestLossFor(state, 'sector_helios_prime');
  assert.ok(entry);
  assert.equal(entry.killerId, state.playerId);
  assert.equal(entry.killedByPlayer, true);
  const playerModel = buildShipLedger(state, { page: 0, pageSize: 12 });
  assert.equal(playerModel.entries[0].playerCaused, true);

  const snapshot = JSON.parse(JSON.stringify(system.serialize()));
  const restoredState = makeState();
  const { system: restored } = makeSystem(restoredState);
  restored.deserialize(snapshot);
  const restoredEntry = latestLossFor(restoredState, 'sector_helios_prime');
  assert.equal(restoredEntry.lossId, entry.lossId);
  assert.equal(restoredEntry.killerId, state.playerId);
  assert.equal(restoredEntry.killedByPlayer, true);

  system.destroy();
  restored.destroy();
});

test('named victim identity survives save and reaches the read-only ship ledger', () => {
  const state = makeState();
  state.entities.set(52, victim(52, {
    name: 'Captain Rime',
    callsign: 'RIME-6',
    ai: { name: 'Captain Rime' },
  }));
  const { system, bus } = makeSystem(state);

  bus.emit('entity:killed', {
    id: 52,
    killerId: 99,
    type: 'ship',
    factionId: 'faction_reach',
    bountyCr: 0,
  });

  const entry = latestLossFor(state, 'sector_helios_prime');
  assert.equal(entry.killedByPlayer, false);
  assert.equal(entry.victimName, 'Captain Rime');
  assert.equal(entry.victimCallsign, 'RIME-6');

  const snapshot = JSON.parse(JSON.stringify(system.serialize()));
  const restoredState = makeState();
  const { system: restored } = makeSystem(restoredState);
  restored.deserialize(snapshot);
  const restoredEntry = latestLossFor(restoredState, 'sector_helios_prime');
  assert.equal(restoredEntry.victimName, 'Captain Rime');
  assert.equal(restoredEntry.victimCallsign, 'RIME-6');

  const model = buildShipLedger(restoredState, { page: 0, pageSize: 12 });
  assert.equal(model.entries.length, 1);
  assert.match(model.entries[0].text, /RIME-6/);
  assert.equal(model.entries[0].playerCaused, false);

  system.destroy();
  restored.destroy();
});

test('live ship kills stay durable without automation loss news or ghost-convoy offers', () => {
  const state = makeState();
  const bus = makeBus();
  const voiceCalls = [];
  const { system } = makeSystem(state, bus, {
    say(cue) {
      voiceCalls.push(cue);
      return true;
    },
  });

  for (const id of [61, 62, 63]) {
    state.entities.set(id, victim(id));
    bus.emit('entity:killed', {
      id,
      killerId: state.playerId,
      type: 'ship',
      factionId: 'faction_reach',
      bountyCr: 100 + id,
    });
  }

  const snapshot = JSON.parse(JSON.stringify(system.serialize()));
  assert.equal(snapshot.entries.length, 3);
  assert.equal(snapshot.entries.every((entry) => entry.source === 'entity:killed'), true);
  assert.equal(bus.emitted.filter((event) => event.name === 'lossLedger:recorded').length, 3,
    'K1 consumers still receive one durable loss receipt per live ship kill');
  assert.equal(voiceCalls.filter((cue) => cue.channel === 'news').length, 0,
    'live combat churn must not become station loss news');
  assert.equal(bus.emitted.some((event) => event.name === 'rumor:ghostConvoy'), false);
  assert.equal(bus.emitted.some((event) => event.name === 'mission:offered'), false);

  system.destroy();
});
