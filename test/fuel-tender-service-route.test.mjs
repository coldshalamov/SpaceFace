import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_SECTOR_ID,
  CERES_FUEL_TENDER_SERVICE,
} from '../src/data/sectorActivityPockets.js';
import { save } from '../src/save/saveSystem.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fuelTenderService } from '../src/systems/fuelTenderService.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';
import { world } from '../src/systems/world.js';

const DT = SIM_DT;
const PLAYER_WEAPON_ID = 'wpn_siege_lance_l';

async function boot({ withSave = false } = {}) {
  const systems = [physics, actions, flightV3, weapons, combat, economy, factionPresence, world, npcJobsRuntime, fuelTenderService];
  if (withSave) systems.push(save);
  const updateOrder = [factionPresence, actions, flightV3, weapons, physics, combat, economy, world, npcJobsRuntime, fuelTenderService];
  const sim = createSimulation({ seed: 67, systems, updateOrder });
  const state = sim.state;
  const physicsOwner = sim.registry.get('physics');
  state.mode = 'flight';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.brake = false;
  state.input.boost = false;

  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true);
  const worldOwner = sim.registry.get('world');
  worldOwner.enterSector(CERES_ACTIVITY_SECTOR_ID, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  const tender = liveTender(state);
  assert.ok(tender, 'ordinary Ceres entry materializes the authored civilian tender');
  const player = sim.spawn(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: tender.pos.x - 84, z: tender.pos.z },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_bastion', Array(4).fill(PLAYER_WEAPON_ID)),
  }));
  state.playerId = player.id;
  state.fuel = { current: 40, max: 100 };
  return { sim, state, physicsOwner, tender, player };
}

function liveTender(state) {
  return state.entityList.find((entity) => (
    entity?.alive !== false && entity.data?.activityActorSlotId === 'ceres_refinery_tender'
  )) || null;
}

function tenderLot(tender) {
  return tender?.data?.cargoManifest?.fuelTenderService || null;
}

function armAutopilot(state, tender, label = 'Fuel tender rendezvous') {
  const player = state.entities.get(state.playerId);
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.brake = false;
  state.input.boost = false;
  state.nav.autopilot = {
    active: true,
    target: null,
    targetEntityId: tender.id,
    label,
    arrivalRadius: 42,
    initialDistance: Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z),
    status: 'armed',
  };
}

function clearManualInput(state) {
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.brake = false;
  state.input.boost = false;
}

function activeThreats(state, origin = null, radiusWU = Infinity) {
  return state.entityList.filter((entity) => {
    if (!entity || entity.alive === false || entity.team !== 1 || entity.type !== 'ship') return false;
    const ai = entity.data?.ai;
    if (ai?.passive === true || ai?.roe === 'hold_fire') return false;
    return !origin || Math.hypot(entity.pos.x - origin.pos.x, entity.pos.z - origin.pos.z) <= radiusWU;
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function clearTenderThreatsThroughCombat(h) {
  const deaths = [];
  const fired = [];
  const hits = [];
  const off = h.sim.bus.on('entity:killed', (payload) => {
    if (payload?.killerId === h.state.playerId) deaths.push(structuredClone(payload));
  });
  const offFired = h.sim.bus.on('combat:fire', (payload) => fired.push(structuredClone(payload)));
  const offHit = h.sim.bus.on('projectile:hit', (payload) => hits.push(structuredClone(payload)));
  const targets = activeThreats(h.state, h.tender, 760);
  assert.ok(targets.length > 0, 'the default route exposes the tender interruption before clearance');
  h.player.rot = Math.atan2(
    targets[0].pos.z - h.player.pos.z,
    targets[0].pos.x - h.player.pos.x,
  );
  for (const target of targets) {
    h.state.player.targetId = target.id;
    h.state.input.autoAim = { targetId: target.id };
    for (let guard = 0; guard < 480 && target.alive !== false; guard += 1) {
      clearManualInput(h.state);
      const desiredAngle = Math.atan2(
        target.pos.z - h.player.pos.z,
        target.pos.x - h.player.pos.x,
      );
      const turnError = Math.atan2(
        Math.sin(desiredAngle - h.player.rot),
        Math.cos(desiredAngle - h.player.rot),
      );
      h.state.input.turnIntent = Math.max(-1, Math.min(1, turnError / 0.5));
      h.state.input.aimAngle = desiredAngle;
      h.state.input.fire = true;
      h.state.input.fireGroup = 1;
      h.sim.step(DT);
    }
    assert.equal(target.alive, false, `the live catalog weapon must clear threat ${target.id}: ${JSON.stringify({
      targetHull: target.hull,
      targetShield: target.shield,
      distance: Math.hypot(target.pos.x - h.player.pos.x, target.pos.z - h.player.pos.z),
      fired: fired.filter((row) => row.ownerId === h.state.playerId).length,
      hits: hits.filter((row) => row.targetId === target.id).length,
      playerWeapons: h.player.data.weapons.map((weapon) => weapon.defId),
    })}`);
  }
  h.state.input.fire = false;
  h.state.input.fireGroup = null;
  h.state.input.autoAim = null;
  off();
  offFired();
  offHit();
  assert.equal(deaths.length, targets.length, 'Combat attributes every physical clearance to the player');
  assert.equal(activeThreats(h.state, liveTender(h.state), 760).length, 0);
  const tender = liveTender(h.state);
  stepUntil(h.sim, () => {
    const entry = h.state.npcJobs.byId[tender.data.jobId];
    return entry && entry.job.phase !== 'flee';
  }, 600, 'the ordinary job owner did not resume after the real threats were cleared',
  () => clearManualInput(h.state));
  return deaths;
}

function stepUntil(sim, predicate, maxTicks, message, beforeStep = null) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    beforeStep?.();
    sim.step(DT);
    if (predicate()) return tick + 1;
  }
  assert.fail(typeof message === 'function' ? message() : message);
}

test('ordinary Ceres tender takes a real Flight V3/Rapier rendezvous, transfers one durable finite lot, and preserves it through Continue', async (t) => {
  const h = await boot({ withSave: true });
  t.after(() => {
    h.physicsOwner._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });
  const transfers = [];
  const starts = [];
  const interruptions = [];
  h.sim.bus.on('fuelTender:rendezvousStarted', (payload) => starts.push(structuredClone(payload)));
  h.sim.bus.on('fuelTender:transferred', (payload) => transfers.push(structuredClone(payload)));
  h.sim.bus.on('fuelTender:interrupted', (payload) => interruptions.push(structuredClone(payload)));

  const lot = tenderLot(h.tender);
  assert.deepEqual(lot, {
    lotId: CERES_FUEL_TENDER_SERVICE.cargoLotId,
    commodityId: 'fuel',
    capacityUnits: 30,
    remainingUnits: 30,
  });
  const startingDistance = Math.hypot(
    h.tender.pos.x - h.player.pos.x,
    h.tender.pos.z - h.player.pos.z,
  );
  assert.ok(startingDistance > CERES_FUEL_TENDER_SERVICE.rendezvousRadiusWU);
  assert.ok(clearTenderThreatsThroughCombat(h).length > 0,
    'the ordinary Ceres route includes a real safety interruption before service');
  armAutopilot(h.state, h.tender);

  let minimumDistance = startingDistance;
  let minimumRelativeSpeedInRange = Infinity;
  let qualificationWitness = null;
  stepUntil(h.sim, () => {
    const tender = liveTender(h.state);
    const player = h.state.entities.get(h.state.playerId);
    minimumDistance = Math.min(minimumDistance,
      Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z));
    if (Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z)
      <= CERES_FUEL_TENDER_SERVICE.rendezvousRadiusWU) {
      const relativeSpeed = Math.hypot(tender.vel.x - player.vel.x, tender.vel.z - player.vel.z);
      minimumRelativeSpeedInRange = Math.min(minimumRelativeSpeedInRange, relativeSpeed);
      if (!qualificationWitness && relativeSpeed <= CERES_FUEL_TENDER_SERVICE.maxRelativeSpeedWUPerS) {
        const owner = h.sim.registry.get('fuelTenderService');
        qualificationWitness = {
          tick: h.state.tick,
          phase: h.state.npcJobs.byId[tender.data.jobId]?.job?.phase,
          canServe: owner._jobCanServe(h.state, tender),
          ownerTenderId: owner._tenderId,
          distance: Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z),
          relativeSpeed,
        };
      }
    }
    return transfers.length >= 12;
  }, 2_400, () => {
    const tender = liveTender(h.state);
    const player = h.state.entities.get(h.state.playerId);
    const job = h.state.npcJobs.byId[tender?.data?.jobId];
    const serviceOwner = h.sim.registry.get('fuelTenderService');
    return `the physical rendezvous did not begin its bounded transfer: ${JSON.stringify({
      distance: tender && player && Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z),
      relativeSpeed: tender && player && Math.hypot(tender.vel.x - player.vel.x, tender.vel.z - player.vel.z),
      player: player && { pos: player.pos, vel: player.vel, rot: player.rot },
      tender: tender && { pos: tender.pos, vel: tender.vel, rot: tender.rot },
      job: job && { phase: job.job?.phase, kind: job.job?.kind },
      autopilot: h.state.nav.autopilot,
      minimumDistance,
      minimumRelativeSpeedInRange,
      qualificationWitness,
      starts,
      interruptions: interruptions.slice(0, 8),
      serviceOwner: serviceOwner && {
        tenderId: serviceOwner._tenderId,
        holdS: serviceOwner._holdS,
        transferAccumS: serviceOwner._transferAccumS,
        canServe: tender && serviceOwner._jobCanServe(h.state, tender),
        foundTenderId: serviceOwner._findTender(h.state)?.id,
        testTenderId: tender?.id,
      },
    })}`;
  }, () => clearManualInput(h.state));

  assert.equal(h.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  assert.ok(minimumDistance <= CERES_FUEL_TENDER_SERVICE.rendezvousRadiusWU,
    `Flight V3/Rapier must close ${startingDistance} WU into the ${CERES_FUEL_TENDER_SERVICE.rendezvousRadiusWU} WU service envelope`);
  assert.equal(starts.length, 1);
  assert.equal(transfers.reduce((sum, row) => sum + row.amount, 0), 12);
  assert.equal(h.state.fuel.current, 52);
  assert.equal(tenderLot(liveTender(h.state)).remainingUnits, 18);

  const oldTenderId = liveTender(h.state).id;
  const saveOwner = h.sim.registry.get('save');
  const envelope = saveOwner.serialize('fuel-tender-continue');
  const savedRecord = envelope.data.world.records.byId[liveTender(h.state).data.worldRecordId];
  assert.equal(savedRecord.cargoManifest.fuelTenderService.remainingUnits, 18,
    'the finite physical lot is captured by the existing durable world-record owner');
  assert.equal(saveOwner.loadEnvelope(
    JSON.parse(JSON.stringify(envelope)),
    'fuel-tender-continue',
  ), true, 'the checksum-valid production Continue boundary restores the service run');

  const restoredTender = liveTender(h.state);
  assert.ok(restoredTender);
  assert.notEqual(restoredTender.id, oldTenderId, 'Continue rematerializes the durable tender body');
  assert.equal(tenderLot(restoredTender).remainingUnits, 18);
  assert.equal(h.state.fuel.current, 52);
  armAutopilot(h.state, restoredTender, 'Resume fuel tender rendezvous');
  stepUntil(h.sim, () => tenderLot(liveTender(h.state)).remainingUnits === 0,
    2_400, 'the restored physical route did not drain the remaining authored lot',
    () => clearManualInput(h.state));

  assert.equal(h.state.fuel.current, 70,
    'the ordinary tender can contribute exactly its fixed 30-unit lot and no more');
  assert.equal(transfers.reduce((sum, row) => sum + row.amount, 0), 30);
  const transferCountAtEmpty = transfers.length;
  h.sim.runTicks(240, DT);
  assert.equal(h.state.fuel.current, 70);
  assert.equal(transfers.length, transferCountAtEmpty, 'an empty tender cannot refill or double-write fuel');
});

test('a real Flight V3 departure interrupts the moving-tender transfer without touching traffic', async (t) => {
  const h = await boot();
  t.after(() => {
    h.physicsOwner._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });
  const transfers = [];
  const interruptions = [];
  h.sim.bus.on('fuelTender:transferred', (payload) => transfers.push(structuredClone(payload)));
  h.sim.bus.on('fuelTender:interrupted', (payload) => interruptions.push(structuredClone(payload)));
  assert.ok(clearTenderThreatsThroughCombat(h).length > 0);
  armAutopilot(h.state, h.tender);
  stepUntil(h.sim, () => transfers.length >= 2, 2_400, () => {
    const tender = liveTender(h.state);
    const player = h.state.entities.get(h.state.playerId);
    return `the control route did not establish a live transfer before interruption: ${JSON.stringify({
      distance: tender && player && Math.hypot(tender.pos.x - player.pos.x, tender.pos.z - player.pos.z),
      relativeSpeed: tender && player && Math.hypot(tender.vel.x - player.vel.x, tender.vel.z - player.vel.z),
      autopilot: h.state.nav.autopilot,
      interruptions,
    })}`;
  }, () => clearManualInput(h.state));

  const departureTarget = { x: h.tender.pos.x - 420, z: h.tender.pos.z + 180 };
  const player = h.state.entities.get(h.state.playerId);
  h.state.nav.autopilot = {
    active: true,
    target: departureTarget,
    targetEntityId: null,
    label: 'Break rendezvous',
    arrivalRadius: 36,
    initialDistance: Math.hypot(departureTarget.x - player.pos.x, departureTarget.z - player.pos.z),
    status: 'armed',
  };
  stepUntil(h.sim, () => interruptions.length > 0, 600,
    'the physical departure did not interrupt the service contact',
    () => clearManualInput(h.state));
  const transferCountAtInterrupt = transfers.length;
  const fuelAtInterrupt = h.state.fuel.current;
  const lotAtInterrupt = tenderLot(h.tender).remainingUnits;
  h.sim.runTicks(240, DT);

  assert.ok(['relative_speed', 'out_of_range'].includes(interruptions[0].reason));
  assert.equal(transfers.length, transferCountAtInterrupt,
    'no transfer lands after the player physically breaks the rendezvous');
  assert.equal(h.state.fuel.current, fuelAtInterrupt);
  assert.equal(tenderLot(h.tender).remainingUnits, lotAtInterrupt);
});
