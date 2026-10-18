import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { heat } from '../src/systems/heat.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import {
  QUIET_PASSAGE,
  buildQuietPassageOffer,
  evaluatePassengerHeatProximity,
} from '../src/data/heatLure.js';

const SEED = 4242;

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [economy, cargo, factions, heat, missions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.world.currentSectorId = QUIET_PASSAGE.sectorId;
  state.player.credits = 10000;
  state.player.heat = 0;

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: QUIET_PASSAGE.transportStartPos.x + 50, z: QUIET_PASSAGE.transportStartPos.z + 50 },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 24,
    hull: 100,
    hullMax: 100,
    data: {},
  });
  state.playerId = player.id;

  const stationTethys = sim.spawn({
    type: 'station',
    pos: { x: 500, z: 500 },
    data: { stationId: QUIET_PASSAGE.stationId, dockRadius: 90, name: 'Tethys Trade Hub' },
  });

  const stationCustoms = sim.spawn({
    type: 'station',
    pos: { ...QUIET_PASSAGE.checkpointPos },
    data: { stationId: QUIET_PASSAGE.destStationId, dockRadius: 90, name: 'Customs Gate' },
  });

  const events = [];
  for (const name of ['mission:completed', 'mission:failed', 'mission:updated', 'toast', 'comms:popup', 'alert']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }

  const missionSystem = sim.registry.get('missions');
  const heatSystem = sim.registry.get('heat');

  function step(dt = 0.1) {
    state.simTime += dt;
    state.tick++;
    missionSystem.update(dt, state);
  }

  function seconds(s, dt = 0.1) {
    const steps = Math.ceil(s / dt);
    for (let i = 0; i < steps; i++) step(dt);
  }

  return { sim, state, bus, player, stationTethys, stationCustoms, missionSystem, heatSystem, events, step, seconds };
}

test('QUIET_PASSAGE data and evaluatePassengerHeatProximity reading helpers', () => {
  assert.ok(QUIET_PASSAGE, 'QUIET_PASSAGE defined in heatLure');
  assert.equal(QUIET_PASSAGE.id, 'm12_quiet_passage');
  assert.equal(QUIET_PASSAGE.type, 'passenger_transport');
  assert.equal(QUIET_PASSAGE.stationId, 'station_tethys');
  assert.equal(QUIET_PASSAGE.destStationId, 'station_customs');
  assert.equal(QUIET_PASSAGE.sectorId, 'sector_tethys_junction');
  assert.ok(QUIET_PASSAGE.rewardCr > QUIET_PASSAGE.degradedRewardCr);

  const offer = buildQuietPassageOffer();
  assert.equal(offer.id, QUIET_PASSAGE.id);
  assert.equal(offer.type, 'passenger_transport');
  assert.equal(offer.source, 'quietPassage');
  assert.equal(offer.reward_cr, QUIET_PASSAGE.rewardCr);
  assert.ok(offer.params?.quietPassage);

  const transport = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  // 1. Far away: out of range -> holds calm
  const farPlayer = { pos: { x: 1000, z: 1000 }, vel: { x: 0, z: 0 } };
  const farRes = evaluatePassengerHeatProximity(farPlayer, transport, 0);
  assert.equal(farRes.inRange, false);
  assert.equal(farRes.spooked, false);
  assert.equal(farRes.comfort, 1);

  // 2. Near transport, cold coast: low speed, zero heat -> shadow, calm
  const coldPlayer = { pos: { x: 100, z: 100 }, vel: { x: 15, z: 10 } };
  const coldRes = evaluatePassengerHeatProximity(coldPlayer, transport, 0);
  assert.equal(coldRes.inRange, true);
  assert.equal(coldRes.isHot, false);
  assert.equal(coldRes.spooked, false);
  assert.equal(coldRes.comfort, 1);
  assert.equal(coldRes.drive, 'shadow');

  // 3. Near transport, hot approach by WANTED heat -> charge, spooked
  const hotHeatPlayer = { pos: { x: 100, z: 100 }, vel: { x: 15, z: 10 } };
  const hotHeatRes = evaluatePassengerHeatProximity(hotHeatPlayer, transport, 0.35);
  assert.equal(hotHeatRes.inRange, true);
  assert.equal(hotHeatRes.isHot, true);
  assert.equal(hotHeatRes.spooked, true);
  assert.equal(hotHeatRes.comfort, 0);
  assert.equal(hotHeatRes.drive, 'charge');

  // 4. Near transport, hot approach by high speed / thruster plume -> charge, spooked
  const hotSpeedPlayer = { pos: { x: 100, z: 100 }, vel: { x: 60, z: 50 } };
  const hotSpeedRes = evaluatePassengerHeatProximity(hotSpeedPlayer, transport, 0);
  assert.equal(hotSpeedRes.inRange, true);
  assert.equal(hotSpeedRes.isHot, true);
  assert.equal(hotSpeedRes.spooked, true);
  assert.equal(hotSpeedRes.comfort, 0);
  assert.equal(hotSpeedRes.drive, 'charge');
});

test('Quiet passage offer on Tethys board: inspect, decline commits nothing', () => {
  const h = boot();
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  const board = h.missionSystem.ensureBoard('station_tethys');
  const offer = board.slots.find((o) => o.id === QUIET_PASSAGE.id);
  assert.ok(offer, 'Tethys board posts Quiet passage passenger transport');
  assert.equal(offer.type, 'passenger_transport');
  assert.equal(offer.reward_cr, QUIET_PASSAGE.rewardCr);

  // Decline / ignore: leaves missions and cargo untouched
  assert.equal(h.state.missions.active.length, 0);
  assert.equal(h.state.player.credits, 10000);
});

test('Positive branch: quiet passage (cold coast) maintains comfort and pays full fee', () => {
  const h = boot();
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(h.missionSystem.acceptMission(QUIET_PASSAGE.id), true);

  const mission = h.state.missions.active.find((m) => m.sourceOfferId === QUIET_PASSAGE.id || m.params?.quietPassage);
  assert.ok(mission, 'mission active');
  assert.equal(mission.type, 'passenger_transport');
  assert.equal(mission.reward_cr, QUIET_PASSAGE.rewardCr);

  // Step sim: transport entity materializes
  h.step();
  const transport = h.state.entityList.find((e) => e.data?.quietPassageOf === String(mission.id) || e.data?.quietPassageOf === QUIET_PASSAGE.id);
  assert.ok(transport, 'passenger transport ship entity spawned in sector');

  // Cold coast alongside transport
  h.player.pos.x = transport.pos.x + 80;
  h.player.pos.z = transport.pos.z + 80;
  h.player.vel.x = 20;
  h.player.vel.z = 10;
  h.state.player.heat = 0; // low heat

  // Advance transport near checkpoint
  transport.pos.x = QUIET_PASSAGE.checkpointPos.x + 30;
  transport.pos.z = QUIET_PASSAGE.checkpointPos.z + 30;
  h.player.pos.x = transport.pos.x + 50;
  h.player.pos.z = transport.pos.z + 50;

  h.step();

  assert.equal(mission.params.quietPassage.spooked, false, 'transport was not spooked');
  assert.equal(mission.params.quietPassage.comfort, 1, 'passenger comfort preserved');
  assert.equal(mission.status, 'completed', 'mission completed upon passing checkpoint');
  assert.equal(mission.reward_cr, QUIET_PASSAGE.rewardCr, 'full fee paid');

  const completedReceipt = h.state.missions.receipts.find((r) => r.missionId === mission.id);
  assert.ok(completedReceipt, 'receipt logged');
  assert.equal(completedReceipt.outcome, 'completed');
  assert.equal(completedReceipt.rewardCr, QUIET_PASSAGE.rewardCr);

  const debriefPopup = h.events.find((e) => e.name === 'comms:popup' && e.payload?.text?.includes('Clean transit'));
  assert.ok(debriefPopup, 'debrief popup quotes clean quiet passage');
});

test('Negative branch: hot approach spooks transport and visibly degrades contract fee', () => {
  const h = boot();
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(h.missionSystem.acceptMission(QUIET_PASSAGE.id), true);

  const mission = h.state.missions.active.find((m) => m.sourceOfferId === QUIET_PASSAGE.id || m.params?.quietPassage);
  assert.ok(mission, 'mission active');
  assert.equal(mission.reward_cr, QUIET_PASSAGE.rewardCr);

  // Step sim: transport entity materializes
  h.step();
  const transport = h.state.entityList.find((e) => e.data?.quietPassageOf === String(mission.id) || e.data?.quietPassageOf === QUIET_PASSAGE.id);
  assert.ok(transport, 'passenger transport ship entity spawned');

  // Hot approach: close proximity with high WANTED heat and high speed
  h.player.pos.x = transport.pos.x + 60;
  h.player.pos.z = transport.pos.z + 60;
  h.player.vel.x = 80;
  h.player.vel.z = 60;
  h.state.player.heat = 0.40; // hot heat signature

  h.step();

  assert.equal(mission.params.quietPassage.spooked, true, 'transport is spooked');
  assert.equal(mission.params.quietPassage.comfort, 0, 'comfort collapsed');
  assert.equal(mission.reward_cr, QUIET_PASSAGE.degradedRewardCr, 'contract fee visibly degraded');

  // Verify player-facing warning toast was emitted
  const warnToast = h.events.find((e) => e.name === 'toast' && e.payload?.text?.includes('hot approach'));
  assert.ok(warnToast, 'warning toast emitted on spook');

  // Transport passes checkpoint
  transport.pos.x = QUIET_PASSAGE.checkpointPos.x + 20;
  transport.pos.z = QUIET_PASSAGE.checkpointPos.z + 20;

  h.step();

  assert.equal(mission.status, 'completed', 'mission completed upon passing checkpoint');
  assert.equal(mission.reward_cr, QUIET_PASSAGE.degradedRewardCr, 'settled at degraded fee');

  const completedReceipt = h.state.missions.receipts.find((r) => r.missionId === mission.id);
  assert.ok(completedReceipt, 'receipt logged');
  assert.equal(completedReceipt.outcome, 'completed');
  assert.equal(completedReceipt.rewardCr, QUIET_PASSAGE.degradedRewardCr);

  const debriefPopup = h.events.find((e) => e.name === 'comms:popup' && e.payload?.text?.includes('Degraded delivery'));
  assert.ok(debriefPopup, 'debrief popup quotes degraded delivery');
});
