import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { WARM_CARGO_CONTRACT as C } from '../src/data/economyContractTemplates.js';

function boot(t) {
  const sim = createSimulation({ seed: 4242, systems: [economy, missions] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.playerId = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 12, data: {} }).id;
  const desk = sim.registry.get('missions');
  return {
    state, bus, desk,
    dock(stationId) {
      state.ui.docked = true;
      state.ui.dockedStationId = stationId;
      bus.emit('dock:docked', { stationId });
    },
    warmRows() { return desk.ensureBoard(C.stationId).slots.filter(row => row.source === C.source); },
  };
}

function deliverWarmCargo(h) {
  h.dock(C.stationId);
  const offer = h.warmRows()[0];
  assert.ok(offer, 'ordinary Helios docking posts the one-time lot');
  h.bus.emit('ui:acceptMission', { missionId: offer.id });
  const active = h.state.missions.active.find(row => row.source === C.source);
  assert.ok(active, 'the board acceptance starts the delivery');
  assert.equal(h.state.player.cargo.items[C.cmdtyId], C.qty);
  h.dock(C.destStationId);
  assert.equal(active.status, 'completed');
  assert.equal(h.state.player.credits, 5000 + C.paysCr);
  assert.equal(h.state.player.cargo.items[C.cmdtyId] || 0, 0);
  assert.equal(h.warmRows().length, 0, 'completion withdraws the lot');
}

function rollReceipts(h) {
  for (let i = 0; i < 10; i++) {
    h.dock(C.stationId);
    const offer = {
      id: `rollover_delivery_${i}`, type: 'cargo_delivery', stationId: C.stationId,
      destStationId: C.destStationId, destSectorId: C.destSectorId, distance: C.distance,
      title: 'Food for Ceres Refinery', reward_cr: 100, collateral_cr: 0,
      time_limit_s: 1200, duration_s: 1200, preloadedCargo: true,
      params: { cmdtyId: 'cmdty_food', qty: 1 },
    };
    assert.equal(h.desk.postBoardOffer(offer).ok, true);
    h.bus.emit('ui:acceptMission', { missionId: offer.id });
    const active = h.state.missions.active.find(row => row.sourceOfferId === offer.id);
    assert.ok(active, 'another delivery is accepted through the board');
    h.dock(C.destStationId);
    assert.equal(active.status, 'completed', 'another real delivery settles');
  }
  assert.equal(h.state.missions.receipts.length, 10, 'the recent-receipt list stays bounded');
  assert.equal(h.state.missions.receipts.some(row => row.source === C.source), false,
    'ten later settlements evict the warm-cargo receipt');
}

function reload(t, h, legacy = false) {
  const data = JSON.parse(JSON.stringify(h.desk.serialize()));
  if (legacy) delete data.story.flags.warm_cargo_completed;
  const restored = boot(t);
  restored.state.simTime = h.state.simTime;
  restored.desk.deserialize(data);
  restored.bus.emit('save:loaded', { slot: 'test' });
  return restored;
}

for (const saved of [false, true]) {
  test(`completed warm cargo stays closed after ten later settlements${saved ? ' and save/reload' : ''}`, t => {
    let h = boot(t);
    deliverWarmCargo(h);
    if (saved) h = reload(t, h);
    rollReceipts(h);
    if (saved) h = reload(t, h);
    h.dock(C.stationId);
    assert.equal(h.warmRows().length, 0, 'the completed lot must not return after receipt rollover');
    h.state.simTime += h.state.missions.config.refreshSec;
    assert.equal(h.warmRows().length, 0, 'a fresh board epoch must not republish the completed lot');
  });
}

test('an older save with a surviving warm-cargo receipt stays closed when that receipt rolls off', t => {
  let h = boot(t);
  deliverWarmCargo(h);
  h = reload(t, h, true);
  rollReceipts(h);
  h = reload(t, h);
  h.dock(C.stationId);
  assert.equal(h.warmRows().length, 0, 'legacy completion must survive receipt rollover and another reload');
});
