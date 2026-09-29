import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { provenanceLedger, PROVENANCE_CHAIN_CAP } from '../src/systems/provenanceLedger.js';

function acts(state, outcome) {
  const chains = state.provenance && state.provenance.chains || [];
  const nodes = chains.flatMap((chain) => chain && chain.nodes || []);
  return outcome ? nodes.filter((node) => node && node.k === 'act' && node.outcome === outcome) : nodes;
}

function mount() {
  const state = createGameState(4242);
  const bus = createBus();
  const ledger = Object.create(provenanceLedger);
  ledger.init({ state, bus });
  return { state, bus, ledger };
}

test('a custody record adds one surrendered chain entry and does not double it', () => {
  const { state, bus } = mount();
  bus.emit('custody:recorded', {
    receiptId: 'surrender-custody:7',
    settlementKey: 'surrender-custody:7@12',
    entityId: 7,
    offenderFactionId: 'faction_pirate',
    stationId: 'station_helios',
    sectorId: 'sector_helios',
    capturedAt: 12,
  });
  const secured = acts(state, 'surrendered_secured');
  assert.equal(secured.length, 1);
  assert.equal(state.provenance.chains[0].outcome, 'surrendered_secured');
  assert.ok(
    secured[0].incidentId === 'surrender-custody:7@12' || secured[0].targetId === 'surrender-custody:7',
  );

  state.tick += 5;
  bus.emit('law:custodyTransfer', {
    id: 'surrender-custody:7',
    entityId: 7,
    factionId: 'faction_pirate',
    stationId: 'station_helios',
    sectorId: 'sector_helios',
    t: 12,
    outcome: 'custody',
  });
  assert.equal(acts(state, 'surrendered_secured').length, 1);

  bus.emit('surrender:escaped', {
    entityId: 'runner-2',
    factionId: 'faction_runner',
    sectorId: 'sector_elsewhere',
    t: 20,
  });
  assert.equal(acts(state, 'surrendered_escaped').length, 1);
  assert.equal(acts(state, 'surrendered_secured').length, 1);

  state.tick += 5;
  state.simTime += 40;
  bus.emit('custody:recorded', {
    receiptId: 'surrender-custody:7',
    entityId: 7,
    offenderFactionId: 'faction_pirate',
    stationId: 'station_helios',
    sectorId: 'sector_helios',
    capturedAt: 500,
  });
  const again = acts(state, 'surrendered_secured');
  assert.equal(again.length, 2, 'a recycled receipt at a new time is a new custody');
  assert.ok(again.some((node) => node.incidentId === 'surrender-custody:7@500' || Number(node.t) === 500));
});

test('another custody record still fits the published chain cap', () => {
  const { state, bus } = mount();
  let guard = 0;
  while (state.provenance.chains.length < PROVENANCE_CHAIN_CAP) {
    const n = guard;
    guard += 1;
    assert.ok(guard <= PROVENANCE_CHAIN_CAP + 2);
    bus.emit('custody:recorded', {
      receiptId: `cap-${n}`,
      entityId: 1000 + n,
      offenderFactionId: `faction_cap_${n}`,
      stationId: 'station_helios',
      sectorId: `sector_cap_${n}`,
      capturedAt: n + 1,
    });
  }
  assert.equal(state.provenance.chains.length, PROVENANCE_CHAIN_CAP);
  bus.emit('custody:recorded', {
    receiptId: 'cap-extra',
    entityId: 9001,
    offenderFactionId: 'faction_cap_extra',
    stationId: 'station_helios',
    sectorId: 'sector_cap_extra',
    capturedAt: 900,
  });
  assert.equal(state.provenance.chains.length, PROVENANCE_CHAIN_CAP);
  const keptNodes = acts(state, 'surrendered_secured');
  const keptIds = new Set(keptNodes.map((node) => node.targetId));
  assert.equal(keptIds.has('cap-extra'), true);
  assert.equal(keptIds.has('cap-0'), false, 'the oldest custody leaves so the recent one stays');
  assert.equal(keptIds.has(`cap-${PROVENANCE_CHAIN_CAP - 1}`), true);
});

test('open custody chains stay inside the published cap', () => {
  const { state, bus } = mount();
  let guard = 0;
  while (state.provenance.chains.length < PROVENANCE_CHAIN_CAP) {
    const n = guard;
    guard += 1;
    assert.ok(guard <= PROVENANCE_CHAIN_CAP + 2);
    state.factions[`faction_open_${n}`] = { aggro: true };
    bus.emit('custody:recorded', {
      receiptId: `open-${n}`,
      entityId: 3000 + n,
      offenderFactionId: `faction_open_${n}`,
      stationId: 'station_helios',
      sectorId: `sector_open_${n}`,
      capturedAt: n + 1,
    });
  }
  assert.equal(state.provenance.chains.length, PROVENANCE_CHAIN_CAP);
  state.factions.faction_open_extra = { aggro: true };
  bus.emit('custody:recorded', {
    receiptId: 'open-extra',
    entityId: 9002,
    offenderFactionId: 'faction_open_extra',
    stationId: 'station_helios',
    sectorId: 'sector_open_extra',
    capturedAt: 900,
  });
  assert.equal(state.provenance.chains.length, PROVENANCE_CHAIN_CAP);
  assert.equal(acts(state, 'surrendered_secured').some((node) => node.targetId === 'open-extra'), true);
});
