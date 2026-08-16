import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  isLivingChainPredationAuthorized,
  protectedStationAt,
} from '../src/ai/engagementAuthority.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CIVILIAN_CAST_SECTOR_ID,
  HELIOS_LIVING_CHAIN,
  HELIOS_LIVING_CHAIN_CAST,
} from '../src/data/civilianCast.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const SEED = 47;

function livingActor(state, role) {
  return state.entityList.find((entity) => entity?.alive !== false
    && entity.data?.livingWorldIslandCast === true
    && entity.data?.livingChainRole === role) || null;
}

function livingPod(state, handoffId) {
  return state.entityList.find((entity) => entity?.alive !== false
    && entity.type === 'payload'
    && entity.data?.heliosLivingHandoffPod?.handoffId === handoffId) || null;
}

async function boot() {
  const systems = [
    flightV3, physics, combat, world, npcJobsRuntime, traffic,
    lawSecurity, spawnBudget, encounterDirector,
  ];
  const sim = createSimulation({ seed: SEED, systems, updateOrder: systems });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.playerId = null;
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  sim.registry.get('world').enterSector(CIVILIAN_CAST_SECTOR_ID, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  return {
    sim,
    state,
    traffic: sim.registry.get('traffic'),
    director: sim.registry.get('encounterDirector'),
    law: sim.registry.get('lawSecurity'),
    physics: sim.registry.get('physics'),
  };
}

function stepUntil(sim, predicate, maxTicks, message, observe = null) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    sim.step(SIM_DT);
    observe?.();
    if (predicate()) return tick + 1;
  }
  assert.fail(message);
}

test('ordinary seeded Helios runs the complete second miner-hauler-pirate-patrol island inside ten sim-minutes', async (t) => {
  assert.deepEqual(HELIOS_LIVING_CHAIN_CAST.map((entry) => entry.livingChainRole), [
    'miner', 'hauler', 'patrol',
  ]);
  assert.equal(new Set(HELIOS_LIVING_CHAIN_CAST.map((entry) => entry.worldRecordSlotId)).size, 3);
  const h = await boot();
  t.after(() => {
    h.physics._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });
  const transitions = [];
  const raidRelationsAtTransfer = [];
  h.sim.bus.on('traffic:heliosLivingChain', (payload) => transitions.push(structuredClone(payload)));
  h.sim.bus.on('traffic:heliosManifestTransferred', () => {
    const opened = Object.values(h.state.encounterDirector.live)
      .find((candidate) => candidate.data?.heliosLivingChain === true);
    const openedRaider = opened && h.state.entities.get(opened.data.predationRaiderId);
    const openedHauler = opened && h.state.entities.get(opened.data.predationTargetId);
    raidRelationsAtTransfer.push(isLivingChainPredationAuthorized(h.state, openedRaider, openedHauler));
  });
  const startSimT = h.state.simTime;
  const maxTicks = Math.ceil(600 / SIM_DT);
  stepUntil(
    h.sim,
    () => h.state.traffic.heliosLivingChain?.state === 'in_transit',
    maxTicks,
    'the ordinary Helios miner and shuttle never completed their physical handoff',
  );
  const chain = h.state.traffic.heliosLivingChain;
  const miner = livingActor(h.state, 'miner');
  const hauler = livingActor(h.state, 'hauler');
  const patrol = livingActor(h.state, 'patrol');
  assert.ok(miner && hauler && patrol, 'all three stable island workers materialize beside ambient traffic');
  assert.equal(patrol.data.ai.lawful, true, 'the responder is a real lawful patrol');
  assert.ok(transitions.some((row) => row.kind === 'requested'));
  assert.ok(transitions.some((row) => row.kind === 'pod_released'), 'ore crosses a physical pod boundary');
  assert.ok(transitions.some((row) => row.kind === 'transferred'));
  assert.equal(livingPod(h.state, chain.handoffId), null, 'the received pod is consumed exactly once');
  assert.equal(hauler.data.cargoManifest.totalQty, chain.qty);
  assert.equal(hauler.data.cargoManifest.custody.handoffId, chain.handoffId);
  assert.equal(miner.data.cargoManifest.totalQty, 0, 'the miner no longer duplicates transferred ore');
  assert.ok(h.state.npcJobs.byId[hauler.data.jobId]?.job?.route
    .some((waypoint) => waypoint.id === `dest:${HELIOS_LIVING_CHAIN.destinationStationId}`),
  'the physical shuttle departs on the production NPC-job route to a real station');

  const live = Object.values(h.state.encounterDirector.live)
    .find((candidate) => candidate.data?.heliosLivingChain === true);
  assert.ok(live, 'the valuable transferred manifest automatically opens a real pirate intercept');
  assert.equal(live.data.predationTargetId, hauler.id);
  assert.equal(live.data.patrolEntityId, patrol.id);
  const raider = h.state.entities.get(live.data.predationRaiderId);
  assert.ok(raider && raider.alive !== false && raider.data?.predationRole === 'raider');
  assert.deepEqual(raidRelationsAtTransfer, [true],
    'the warning window is already bound to the exact manifest before the next law tick');
  assert.ok(Math.abs(Math.hypot(raider.pos.x - hauler.pos.x, raider.pos.z - hauler.pos.z) - 145) < 1e-6,
    'the pirate notices from a physical close intercept, not a receipt-only event');

  assert.ok(protectedStationAt(h.state, hauler), 'the handoff occurs inside witnessed jurisdiction');
  h.state.simTime = live.data.predationNoFireUntil + 0.1;
  h.state.tick = Math.ceil(h.state.simTime / SIM_DT);
  h.director.update(1, h.state);
  assert.equal(live.data.predationStatus, 'active');
  assert.equal(isLivingChainPredationAuthorized(h.state, raider, hauler), true,
    'only the stamped live manifest relation crosses station protection');
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: raider,
    target: hauler,
    tick: h.state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  }), { ok: true, reason: 'authorized' });
  h.sim.bus.emit('combat:damage', { attackerId: raider.id, targetId: hauler.id, applied: 8 });
  const incident = Object.values(h.state.lawSecurity.incidents)
    .find((candidate) => candidate.cause === 'npc_piracy' && candidate.attackerId === raider.id);
  assert.ok(incident, 'a real pirate strike opens the law-owned witnessed-crime incident');
  h.state.simTime = Math.max(h.state.simTime, incident.dispatchAt + 0.1);
  h.state.tick = Math.ceil(h.state.simTime / SIM_DT);
  h.law.update(SIM_DT, h.state);
  assert.equal(incident.status, 'responding');
  assert.equal(patrol.data.ai.securityTargetId, raider.id,
    'the exact visible Belt Watch patrol leaves its loop to intercept the pirate');
  assert.equal(h.state.npcJobs.byId[patrol.data.jobId]?.entityId, patrol.id,
    'law redirects the same physical patrol rather than creating a receipt-only responder');

  stepUntil(
    h.sim,
    () => h.state.traffic.heliosLivingChain?.state === 'delivered',
    maxTicks,
    'the routed hauler never settled the conserved manifest at Coalition',
  );
  assert.ok(h.state.simTime - startSimT <= 600 + SIM_DT, 'the full observation stays inside ten sim-minutes');
  assert.ok(transitions.some((row) => row.kind === 'delivered'));
  assert.equal(hauler.data.cargoManifest.totalQty, 0, 'the station sink clears the exact delivered lot');
});

test('the public handoff is physically interruptible and Continue preserves one conserved custody', async (t) => {
  const h = await boot();
  t.after(() => {
    h.physics._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });
  stepUntil(
    h.sim,
    () => h.state.traffic.heliosLivingChain?.state === 'handoff',
    Math.ceil(600 / SIM_DT),
    'the handoff pod never appeared',
  );
  const chain = h.state.traffic.heliosLivingChain;
  const pod = livingPod(h.state, chain.handoffId);
  const hauler = livingActor(h.state, 'hauler');
  assert.ok(pod && pod.collides === true && pod.flags?.persistent === true);
  assert.equal(Object.values(pod.data.salvagePool).reduce((sum, qty) => sum + qty, 0), chain.qty);

  // This is the player-intervention route: a Massline/tether can pull the ordinary dynamic payload
  // out of the receiving envelope. Moving the same body models that physics outcome without a
  // parallel click choice or injected cargo grant.
  pod.pos.x += HELIOS_LIVING_CHAIN.transferRangeWU + 20;
  h.sim.step(SIM_DT);
  assert.equal(chain.state, 'interrupted');
  assert.equal(chain.interruption, 'physical_handoff_intervened');
  assert.equal(pod.alive, true, 'the intercepted ore remains a salvageable world body');
  assert.equal(hauler.data.cargoManifest?.totalQty || 0, 0, 'the shuttle never duplicates the taken pod');

  const saved = h.traffic.serialize();
  assert.equal(saved.heliosLivingChain.handoffId, chain.handoffId);
  const beforeQty = Object.values(pod.data.salvagePool).reduce((sum, qty) => sum + qty, 0);
  h.traffic.deserialize(saved);
  h.sim.bus.emit('save:loaded', {});
  const restored = h.state.traffic.heliosLivingChain;
  assert.equal(restored.handoffId, chain.handoffId);
  assert.equal(restored.state, 'interrupted');
  assert.equal(livingPod(h.state, restored.handoffId), pod, 'Continue rebinds the existing physical pod');
  assert.equal(Object.values(pod.data.salvagePool).reduce((sum, qty) => sum + qty, 0), beforeQty);
});
