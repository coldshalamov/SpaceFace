import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { fragileCargo, FRAGILE_CARGO_HARD_DELTA_V } from '../src/systems/fragileCargo.js';
import { WARM_CARGO_CONTRACT as C } from '../src/data/economyContractTemplates.js';

for (const hardKnock of [false, true]) {
  test(`ordinary Helios board publishes warm cargo before acceptance and ${hardKnock ? 'spoiled' : 'intact'} delivery pays once`, () => {
    const sim = createSimulation({seed: 4242, systems: [economy, missions, fragileCargo]});
    const {state, bus} = sim;
    const desk = sim.registry.get('missions');
    try {
      state.mode = 'flight'; state.simTime = 100;
      state.world.currentSectorId = 'sector_helios_prime';
      state.onboarding = {active: false, finished: true};
      state.player.credits = 5000;
      state.player.cargo = {items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120};
      state.playerId = sim.spawn({type: 'ship', pos: {x: 0, z: 0}, vel: {x: 0, z: 0},
        hull: 100, hullMax: 100, radius: 12, data: {}}).id;
      state.ui.docked = true; state.ui.dockedStationId = C.stationId;
      bus.emit('dock:docked', {stationId: C.stationId});
      const warmRows = station => desk.ensureBoard(station).slots.filter(o => o.source === C.source);
      const rows = warmRows(C.stationId);
      assert.equal(rows.length, 1, 'ordinary docking must publish the named volatile lot without test injection');
      const offer = rows[0];
      assert.equal(offer.params.qty, 10);
      assert.equal(offer.params.handlingLimit, FRAGILE_CARGO_HARD_DELTA_V);
      assert.match(offer.title, /Ice Volatiles for Ceres Refinery/);
      assert.match(offer.brief, /Handling limit 18/);
      assert.doesNotMatch(offer.title + offer.brief, /cmdty_|station_|volatile_lot/);
      assert.equal(warmRows(C.destStationId).length, 0, 'the buyer posts only at Helios');
      assert.equal(warmRows(C.stationId).length, 1, 'cached board reads cannot duplicate it');
      state.simTime += state.missions.config.refreshSec;
      assert.equal(warmRows(C.stationId).length, 1, 'board refresh keeps one available lot');
      assert.equal(desk.acceptMission(offer.id), true);
      const active = state.missions.active.find(m => m.source === C.source);
      assert.ok(active);
      assert.equal(state.player.cargo.items[C.cmdtyId], 10);
      assert.equal(warmRows(C.stationId).length, 0, 'a live run cannot be offered again');
      bus.emit('physics:impact', {playerInvolved: true, playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V - (hardKnock ? 0 : 1),
        simTime: state.simTime, tick: state.tick, aId: state.playerId, bId: 'approach-rock'});
      const delivered = hardKnock ? 9 : 10;
      assert.equal(state.player.cargo.items[C.cmdtyId], delivered);
      state.ui.dockedStationId = C.destStationId;
      bus.emit('dock:docked', {stationId: C.destStationId});
      assert.equal(active.status, 'completed');
      assert.equal(state.player.credits, 5000 + C.paysCr * delivered / C.qty);
      assert.equal(state.player.cargo.items[C.cmdtyId] || 0, 0);
      bus.emit('dock:docked', {stationId: C.destStationId});
      assert.equal(state.player.credits, 5000 + C.paysCr * delivered / C.qty, 'redocking cannot pay twice');
      assert.equal(warmRows(C.stationId).length, 0, 'the completed run stays settled');
    } finally { sim.dispose(); }
  });
}
