// Row 280 LG-STARTER-JOBS. Seed 4242. Each starter's two-step chain is on the
// Helios board, pays out through the ordinary mission handlers, and is refused
// when another starter's fit tries to take it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { SECTORS } from '../src/data/sectors.js';
import { starterJobForShip } from '../src/data/starterJobs.js';
import { missions } from '../src/systems/missions.js';
import { fittingsFromDefaultModules } from '../src/systems/ships.js';

const SEED = 4242;

function helios() {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === 'station_helios');
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function boot(starter) {
  const sim = createSimulation({ seed: SEED, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{
    defId: starter.shipId,
    fittings: fittingsFromDefaultModules(starter.shipId, starter.fittedModules),
  }];
  const info = helios();
  state.world.currentSectorId = info.sectorId;
  const payouts = [];
  sim.bus.on('economy:grantCredits', (payload) => {
    if (payload && String(payload.reason || '').startsWith('mission:')) payouts.push(payload.amount);
  });
  return { sim, state, player, info, payouts, missionsSys: sim.registry.get('missions') };
}

function starterOffer(offers, jobId, step) {
  return offers.find((offer) => offer && offer.params
    && offer.params.starterJobId === jobId
    && offer.params.starterStep === step) || null;
}

function finish(h, mission) {
  if (mission.type === 'mining_quota') {
    h.sim.bus.emit('mining:yield', {
      commodityId: mission.params.cmdtyId,
      qty: mission.objectiveTarget,
      minerId: h.state.playerId,
    });
    return;
  }
  if (mission.type === 'tow_recovery') {
    const core = (mission.targetEntityIds || [])
      .map((id) => h.state.entities.get(id))
      .find((entity) => entity && entity.alive !== false);
    assert.ok(core, 'the tow body spawned');
    let station = [...h.state.entities.values()].find((entity) => (
      entity && entity.type === 'station' && entity.data && entity.data.stationId === mission.destStationId
    ));
    if (!station) {
      station = h.sim.spawn({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 120 },
      });
    }
    core.pos.x = station.pos.x;
    core.pos.z = station.pos.z;
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  const targetId = mission.targetEntityIds && mission.targetEntityIds[0];
  assert.ok(targetId, 'the bounty mark spawned');
  h.sim.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
}

test('seed 4242 each starter flies its chain to payout and the other fits are refused', () => {
  const info = helios();
  assert.ok(info, 'Helios exists');
  for (const starter of NEW_GAME_STARTERS) {
    const job = starterJobForShip(starter.shipId);
    assert.ok(job, starter.id);
    const h = boot(starter);
    const fittings = h.state.player.ownedShips[0].fittings;
    assert.ok(fittings.includes(job.requiredModule), `${starter.id} woke up with ${job.requiredModule}`);
    let paid = 0;
    for (const step of job.steps) {
      const board = h.missionsSys.ensureBoard(info.id);
      assert.ok(board && Array.isArray(board.slots), 'Helios keeps an ordinary board');
      const offer = starterOffer(board.slots, job.id, step.step);
      assert.ok(offer, `${starter.id} step ${step.step} is on the Helios board`);
      assert.equal(offer.reward_cr, step.rewardCr);
      assert.equal(h.missionsSys.acceptMission(offer.id), true, `${starter.id} accepts step ${step.step}`);
      const mission = h.state.missions.active.find((row) => row.params && row.params.starterStep === step.step);
      assert.ok(mission, 'the step is active');
      finish(h, mission);
      assert.equal(h.state.missions.active.some((row) => row.id === mission.id), false, 'the step settled');
      paid += step.rewardCr;
    }
    assert.ok(h.payouts.reduce((sum, n) => sum + n, 0) >= paid, `${starter.id} was paid`);
    h.sim.dispose();
  }

  const hitch = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_hitch');
  const wasp = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_wasp');
  const hitchRun = boot(hitch);
  const waspOffers = boot(wasp).missionsSys._generateOffers(info, 1);
  const waspJob = starterOffer(waspOffers, 'starter_wasp', 1);
  assert.ok(waspJob, 'the wasp chain is on a wasp board');
  hitchRun.state.missions.boards[info.id] = { refreshEpoch: 0, slots: [waspJob] };
  assert.equal(hitchRun.missionsSys.acceptMission(waspJob.id), false, 'the hitch cannot take the ram job');
  hitchRun.sim.dispose();
});
