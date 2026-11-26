import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationContactCounterValue } from '../src/data/stationContacts.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { save } from '../src/save/saveSystem.js';

function world() {
  const bus = createBus();
  const state = { simTime: 10, player: { stationContacts: {} }, stationLife: { traffic: [] } };
  stationContacts.init({ state, bus });
  return { bus, state };
}

// The traffic system's weigh-point ledger row, in the shape traffic.js persists it.
function tallied(state, manifestId, disposition = 'counted') {
  const traffic = state.traffic || (state.traffic = {});
  const rows = traffic.heliosFreightTallies || (traffic.heliosFreightTallies = []);
  rows.push({
    manifestId,
    destinationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    totalQty: 40,
    simTime: 1,
    disposition,
  });
}

function cleanArrival(manifestId, extra = {}) {
  return {
    intentId: `arrival:${manifestId}`,
    kind: 'arrival',
    cause: 'arrival',
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    manifestId,
    totalQty: 40,
    trades: [{ stationId: 'station_helios', commodityId: 'cmdty_iron_ore', side: 'sell', qty: 40 }],
    ...extra,
  };
}

test('RC-17: yune.trust counts only clean tallied Helios freight and survives a save', () => {
  const { bus, state } = world();
  // Ambient freight docking at Helios was never weighed: no tally row, no evidence, no count.
  bus.emit('freight:arrival', cleanArrival('manifest-ambient'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);
  // A robbed manifest is 'lost' in the ledger — not clean even if the hulk still docks.
  tallied(state, 'manifest-lost', 'lost');
  bus.emit('freight:arrival', cleanArrival('manifest-lost'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);
  // A manifest already closed 'delivered' cannot count a second time.
  tallied(state, 'manifest-delivered', 'delivered');
  bus.emit('freight:arrival', cleanArrival('manifest-delivered'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);
  // Tallied freight bound anywhere but Helios Station is not Helios freight.
  tallied(state, 'manifest-elsewhere');
  bus.emit('freight:arrival', cleanArrival('manifest-elsewhere', { stationId: 'station_drift' }));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);

  tallied(state, 'manifest-clean-1');
  bus.emit('freight:arrival', cleanArrival('manifest-clean-1'));
  tallied(state, 'manifest-clean-2');
  bus.emit('freight:arrival', cleanArrival('manifest-clean-2'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 2);

  // Capped at the authored max of 3.
  for (const id of ['manifest-clean-3', 'manifest-clean-4', 'manifest-clean-5']) {
    tallied(state, id);
    bus.emit('freight:arrival', cleanArrival(id));
  }
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 3);

  // Save round-trip: the counter rides the player blob; a fresh init normalizes it back
  // and the cap still holds on the next clean arrival.
  save.state = state;
  const blob = save._serializePlayer();
  assert.equal(blob.stationContactCounters['yune.trust'], 3);
  const restored = {
    simTime: 11,
    player: { stationContactCounters: structuredClone(blob.stationContactCounters) },
    stationLife: { traffic: [] },
  };
  const bus2 = createBus();
  stationContacts.init({ state: restored, bus: bus2 });
  assert.equal(stationContactCounterValue(restored, 'yune.trust'), 3);
  tallied(restored, 'manifest-clean-6');
  bus2.emit('freight:arrival', cleanArrival('manifest-clean-6'));
  assert.equal(stationContactCounterValue(restored, 'yune.trust'), 3);
  stationContacts.destroy();
});

test('yune.trust also counts the player\'s own clean freight landing at Yune\'s desk (Nyx March)', () => {
  const { bus, state } = world();
  // The mission owner files the receipt (missionReceiptFor shape) before `mission:completed`
  // runs; the handler reads that receipt as the evidence, so give it exactly what lands there.
  const receipts = state.missions || (state.missions = {});
  receipts.receipts = [];
  const filed = (missionId, outcome, type, destStationId) => receipts.receipts.unshift({
    id: `${missionId}:${outcome}`,
    missionId,
    title: 'Run the Seizure Ledger',
    type,
    outcome,
    reason: null,
    at_s: 10,
    factionId: 'faction_quiet',
    stationId: 'station_drift',
    destStationId,
    destSectorId: 'sector_nyx_march',
    rewardCr: 1320,
    collateralRefundCr: 320,
    collateralLostCr: 0,
    repDelta: 3,
    researchPoints: 0,
    contractCargoRemoved: 3,
    storyOutcome: null,
    source: 'careerContract',
  });
  // The real completedPayload fields the missions settlement emits.
  const completed = missionId => ({
    missionId, type: 'smuggling_run', factionId: 'faction_quiet', repMult: 0.2,
    source: 'careerContract', rewardCr: 1320,
  });

  // A scanned-out smuggling run settles 'failed' — not clean, no trust.
  filed('m_ledger_burned', 'failed', 'smuggling_run', 'station_nyx_march');
  bus.emit('mission:completed', completed('m_ledger_burned'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);

  // Clean freight that lands anywhere but her fence is not hers to weigh.
  filed('m_chips_customs', 'completed', 'cargo_delivery', 'station_customs');
  bus.emit('mission:completed', completed('m_chips_customs'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);

  // A completed contract that never carried freight (escort) stays off a freight broker's books.
  filed('m_convoy', 'completed', 'escort', 'station_nyx_march');
  bus.emit('mission:completed', completed('m_convoy'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 0);

  // Sealed freight delivered clean to the Nyx Fence: hers, once.
  filed('m_ledger_clean', 'completed', 'smuggling_run', 'station_nyx_march');
  bus.emit('mission:completed', completed('m_ledger_clean'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 1);
  // A replayed completion of the same mission cannot count twice.
  bus.emit('mission:completed', completed('m_ledger_clean'));
  assert.equal(stationContactCounterValue(state, 'yune.trust'), 1);

  stationContacts.destroy();
});

test('RC-18: mara.debt gains +1 per pod signed into a medical berth and never subtracts', () => {
  const { bus, state } = world();
  // A pod on the rescue board is only inbound — not yet a delivered pod.
  bus.emit('survivorPod:promoted', { salvagePointId: 'sp-1', destStationId: 'station_drift' });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 0);

  bus.emit('survivorPod:delivered', { rescueHullId: 41, podEntityId: 901, stationId: 'station_drift', simTime: 20 });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 1);
  // A replayed receipt for the same hull and second does not double count.
  bus.emit('survivorPod:delivered', { rescueHullId: 41, podEntityId: 901, stationId: 'station_drift', simTime: 20 });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 1);
  bus.emit('survivorPod:delivered', { rescueHullId: 41, podEntityId: 902, stationId: 'station_drift', simTime: 40 });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 2);

  // The pilot's own station delivery counts once; hull handoffs resolve later as 'delivered'.
  bus.emit('survivorPod:rescued', { id: 77, reason: 'station_delivery', stationId: 'station_drift' });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 3);
  bus.emit('survivorPod:rescued', { id: 78, reason: 'rescue_hull' });
  bus.emit('survivorPod:rescued', { id: 79, reason: 'player_handoff_rescue_hull' });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 3);

  // Unrelated losses never subtract, and the counter clamps at its authored max of +3.
  bus.emit('survivorPod:abandoned', { id: 80, reason: 'ttl_expired' });
  bus.emit('survivorPod:captured', { id: 81 });
  bus.emit('survivorPod:delivered', { rescueHullId: 41, podEntityId: 903, stationId: 'station_drift', simTime: 60 });
  assert.equal(stationContactCounterValue(state, 'mara.debt'), 3);
  stationContacts.destroy();
});

test('RC-19: machine appeals move suhl.clauses to 9 and wreck resolves move senna.names to 8', () => {
  const { bus, state } = world();
  bus.emit('machine:appealAccepted', { siteId: 'site_veil_clerk', incidentId: 'inc-7741' });
  assert.equal(stationContactCounterValue(state, 'suhl.clauses'), 1);
  for (let i = 0; i < 11; i += 1) {
    bus.emit('machine:appealAccepted', { siteId: 'site_veil_clerk', incidentId: `inc-${i}` });
  }
  assert.equal(stationContactCounterValue(state, 'suhl.clauses'), 9);
  // A payload without an incident is not evidence of a clause.
  bus.emit('machine:appealAccepted', { siteId: 'site_veil_clerk' });
  assert.equal(stationContactCounterValue(state, 'suhl.clauses'), 9);

  bus.emit('uniqueWreck:resolved', { wreckId: 'wreck_dmc_01', sectorId: 'sector_charon_expanse', outcome: 'claimed' });
  assert.equal(stationContactCounterValue(state, 'senna.names'), 1);
  for (let i = 0; i < 9; i += 1) {
    bus.emit('uniqueWreck:resolved', { wreckId: `wreck_${i}`, outcome: i % 2 ? 'left_whole' : 'claimed' });
  }
  assert.equal(stationContactCounterValue(state, 'senna.names'), 8);
  bus.emit('uniqueWreck:resolved', {});
  assert.equal(stationContactCounterValue(state, 'senna.names'), 8);
  stationContacts.destroy();
});

test('RC-20: zell.work counts contraband module installs only, capped at 20', () => {
  const { bus, state } = world();
  bus.emit('module:purchased', { defId: 'mod_smuggler_hold', price: 38000, fitSlotIndex: 0, instanceId: 1, shipIndex: 0 });
  assert.equal(stationContactCounterValue(state, 'zell.work'), 1);
  bus.emit('module:purchased', { defId: 'mod_smart_bank', price: 44000 });
  assert.equal(stationContactCounterValue(state, 'zell.work'), 2);
  // Legal and merely restricted work stay off her book; unknown ids are not installs.
  bus.emit('module:purchased', { defId: 'mod_shield_booster_s', price: 6000 });
  bus.emit('module:purchased', { defId: 'mod_sensor_scrambler_s', price: 16000 });
  bus.emit('module:purchased', { defId: 'mod_not_real', price: 1 });
  bus.emit('module:purchased', {});
  assert.equal(stationContactCounterValue(state, 'zell.work'), 2);
  for (let i = 0; i < 25; i += 1) {
    bus.emit('module:purchased', { defId: 'mod_sensor_scrambler_m', price: 48000 });
  }
  assert.equal(stationContactCounterValue(state, 'zell.work'), 20);
  stationContacts.destroy();
});
