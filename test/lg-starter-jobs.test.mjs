// Row 280 LG-STARTER-JOBS. Seed 4242. Each starter's two-step chain is on the
// Helios board, pays out through the ordinary mission handlers, and is refused
// when another starter's fit tries to take it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { SECTORS } from '../src/data/sectors.js';
import { starterJobForShip, starterRamHail } from '../src/data/starterJobs.js';
import { buildKillPresentationReceipt } from '../src/systems/combat.js';
import {
  buildCollisionPresentationProvenance,
  playerRamPlateImpact,
} from '../src/systems/collisionConsequences.js';
import { missions } from '../src/systems/missions.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { missionCommandBrief, objectiveText } from '../src/ui/screens/missionLog.js';

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

function stillActive(h, mission) {
  return h.state.missions.active.some((row) => row.id === mission.id);
}

function finish(h, mission) {
  if (mission.type === 'mining_quota') {
    const ship = h.state.player.ownedShips[0];
    const kept = ship.fittings.slice();
    ship.fittings = kept.filter((id) => id !== 'mod_drill_amp');
    h.sim.bus.emit('mining:yield', {
      commodityId: mission.params.cmdtyId,
      qty: mission.objectiveTarget,
      minerId: h.state.playerId,
    });
    assert.equal(stillActive(h, mission), true, 'iron cut without the drill amp does not pay the hitch job');
    ship.fittings = kept;
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
    assert.equal(stillActive(h, mission), true, 'a loose core at the berth does not pay the winch job');
    h.sim.bus.emit('tether:latched', { targetId: core.id });
    h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  const targetId = mission.targetEntityIds && mission.targetEntityIds[0];
  assert.ok(targetId, 'the bounty mark spawned');
  h.sim.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  assert.equal(stillActive(h, mission), true, 'a gun kill does not pay the ram job');
  h.sim.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId, weaponId: 'mod_ram_plate' });
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
      if (starter.id === 'starter_wasp') assertWaspWrit(h, mission, step);
      finish(h, mission);
      assert.equal(h.state.missions.active.some((row) => row.id === mission.id), false, 'the step settled');
      paid += step.rewardCr;
    }
    assert.equal(h.payouts.length, job.steps.length, `${starter.id} paid once per step`);
    job.steps.forEach((step, index) => {
      assert.ok(h.payouts[index] >= step.rewardCr, `${starter.id} step ${step.step} paid ${h.payouts[index]}`);
    });
    h.sim.dispose();
  }

  const hitch = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_hitch');
  const wasp = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_wasp');
  const saved = boot(hitch);
  const firstBoard = saved.missionsSys.ensureBoard(info.id);
  const first = starterOffer(firstBoard.slots, 'starter_hitch', 1);
  assert.equal(saved.missionsSys.acceptMission(first.id), true);
  const firstMission = saved.state.missions.active.find((row) => row.params && row.params.starterStep === 1);
  finish(saved, firstMission);
  const packed = saved.missionsSys.serialize();
  assert.equal(packed.starterJobStep.starter_hitch, 1);
  delete saved.state.missions.starterJobStep;
  saved.missionsSys.deserialize(packed);
  assert.equal(saved.state.missions.starterJobStep.starter_hitch, 1);
  const secondBoard = saved.missionsSys.ensureBoard(info.id);
  assert.ok(starterOffer(secondBoard.slots, 'starter_hitch', 2), 'step 2 is on the cached Helios board after reload');
  saved.sim.dispose();

  const hitchRun = boot(hitch);
  const waspBoard = boot(wasp).missionsSys.ensureBoard(info.id);
  const waspOffers = waspBoard.slots;
  const waspJob = starterOffer(waspOffers, 'starter_wasp', 1);
  assert.ok(waspJob, 'the wasp chain is on a wasp board');
  hitchRun.state.missions.boards[info.id] = { refreshEpoch: 0, slots: [waspJob] };
  assert.equal(hitchRun.missionsSys.acceptMission(waspJob.id), false, 'the hitch cannot take the ram job');
  hitchRun.sim.dispose();
});

function assertWaspWrit(h, mission, step) {
  const who = step.runnerName;
  assert.equal(mission.title, step.title);
  assert.equal(mission.params.markName, who);
  assert.equal(mission.brief, `${who} is running the gate. The plate closes the writ. A gun does not.`);
  const objective = objectiveText(mission);
  assert.equal(objective, `Ram ${who} — guns do not count`);
  const mark = h.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(mark && mark.data, 'the named runner spawned');
  assert.equal(mark.data.name, who);
  assert.equal(mark.data.scanLabel, `${who.toUpperCase()} — RUNNER`);
  const waypoint = h.missionsSys._missionWaypoint(mission);
  assert.equal(waypoint.reason, objective);
  assert.equal(waypoint.targetEntityId, mark.id);
  const command = missionCommandBrief(mission, h.state);
  assert.equal(command.what, objective);
  assert.equal(command.how, `${objective}.`);
  assert.match(command.why, /The plate closes the writ/);
  mark.pos.x = h.player.pos.x;
  mark.pos.z = h.player.pos.z;
  const hails = [];
  h.sim.bus.on('comms:popup', (payload) => hails.push(payload));
  h.missionsSys._maybeMarkHail(mission, h.state);
  h.missionsSys._maybeMarkHail(mission, h.state);
  assert.equal(hails.length, 1, 'the runner hails once');
  assert.equal(hails[0].sender, who);
  assert.equal(hails[0].text, starterRamHail(mission.params));
  assert.match(
    h.missionsSys._missionSuccessDebriefText(mission),
    new RegExp(`The plate closed ${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
}

test('seed 4242 a live ram receipt closes the wasp writ and a gun or a flail does not', () => {
  const wasp = NEW_GAME_STARTERS.find((starter) => starter.id === 'starter_wasp');
  const h = boot(wasp);
  const fittings = h.state.player.ownedShips[0].fittings;
  const derived = getDerivedStats(wasp.shipId, fittings);
  assert.ok(derived.ramDamageDealtMult > 1, 'the fitted plate is the live ram');
  h.player.data = h.player.data || {};
  h.player.data.derived = derived;
  const board = h.missionsSys.ensureBoard(h.info.id);
  const offer = starterOffer(board.slots, 'starter_wasp', 1);
  assert.equal(h.missionsSys.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.params && row.params.starterStep === 1);
  const targetId = mission.targetEntityIds[0];
  const mark = h.state.entities.get(targetId);
  assert.equal(mark.data.name, 'Nim Gatecut');

  const gun = buildKillPresentationReceipt(h.state, mark, h.state.playerId, {
    origin: { kind: 'weapon', id: 'wpn_autocannon', weaponId: 'wpn_autocannon' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_autocannon' } },
  });
  h.sim.bus.emit('entity:killed', {
    id: targetId,
    killerId: h.state.playerId,
    type: mark.type,
    pos: { x: mark.pos.x, z: mark.pos.z },
    presentation: gun,
  });
  assert.equal(stillActive(h, mission), true, 'a gun receipt does not close the writ');

  h.sim.bus.emit('entity:killed', {
    id: targetId,
    killerId: h.state.playerId,
    type: mark.type,
    pos: { x: mark.pos.x, z: mark.pos.z },
    presentation: {
      version: 1,
      cause: 'ship_collision',
      impactLink: { actorId: h.state.playerId, tag: 'tow_flail', appliedTick: 1, holdUntilTick: null },
    },
  });
  assert.equal(stillActive(h, mission), true, 'a tow flail does not close the writ');

  const tick = 12;
  h.player.vel = h.player.vel || { x: 0, z: 0 };
  mark.vel = mark.vel || { x: 0, z: 0 };
  h.player.vel.x = 40;
  h.player.vel.z = 0;
  const impact = playerRamPlateImpact(
    h.player,
    h.state.playerId,
    tick,
    { actorId: h.state.playerId, tag: 'direct_contact', appliedTick: tick },
    h.state,
  );
  assert.ok(impact, 'the plate claims the contact');
  assert.equal(impact.provenance.weaponId, 'mod_ram_plate');
  assert.equal(impact.provenance.tag, 'ram_plate');
  const collisionPresentation = buildCollisionPresentationProvenance(mark, h.player, {
    pos: { x: mark.pos.x, z: mark.pos.z },
    normal: { x: 1, z: 0 },
    surface: 'craft',
    deltaV: 40,
    exchangedMomentum: 800,
    impactDamage: 50,
    provenance: impact.provenance,
  });
  const presentation = buildKillPresentationReceipt(h.state, mark, h.state.playerId, {
    origin: { kind: 'collision', id: 'craft', weaponId: impact.provenance.weaponId },
    packet: {
      source: {
        kind: 'collision_craft',
        weaponId: impact.provenance.weaponId,
        impulseProvenance: impact.provenance,
        collisionPresentation,
      },
    },
  });
  assert.equal(presentation.impactLink && presentation.impactLink.tag, 'ram_plate');
  assert.equal(presentation.weaponId, undefined, 'the live kill drops weaponId and keeps the tag');
  h.sim.bus.emit('entity:killed', {
    id: targetId,
    killerId: h.state.playerId,
    type: mark.type,
    pos: { x: mark.pos.x, z: mark.pos.z },
    presentation,
  });
  assert.equal(stillActive(h, mission), false, 'the live plate receipt closes the writ');
  assert.ok(h.payouts[0] >= 480, 'the board paid the ram');
  h.sim.dispose();
});
