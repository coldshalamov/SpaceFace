import assert from 'node:assert/strict';
import test from 'node:test';

import { fixerCacheOffer, frontierRumorOffer, frontierRumorOwned } from '../src/data/frontierRumors.js';
import { FIXER_CONTACT } from '../src/data/stationContacts.js';
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { buildReply, generateContacts } from '../src/ui/screens/bar.js';
import { executePauseCargoStash } from '../src/ui/screens/pauseInventory.js';

const SEED = 0x490ca;
const HOME_SECTOR = 'sector_helios_prime';
const HOME_STATION = 'station_helios';
const ORE = 'cmdty_ore_iron';

function registryFor(runtime) {
  return { get: (name) => runtime.getSystem(name) };
}

async function setupRuntime(seed = SEED) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  const { state } = runtime;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = runtime.spawn(makeShipEntitySpec('ship_hitch', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_hitch'),
  }));
  state.playerId = player.id;
  const world = runtime.getSystem('world');
  world.enterSector(HOME_SECTOR, { placePlayer: false });
  const anchor = state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'asteroid' && entity.collides !== false);
  assert.ok(anchor, 'production World must materialize a physical rock');
  player.pos.x = anchor.pos.x + anchor.radius + player.radius + 24;
  player.pos.z = anchor.pos.z;
  player.vel.x = Number(anchor.vel?.x) || 0;
  player.vel.z = Number(anchor.vel?.z) || 0;
  await runtime.getSystem('physics').prepareBackend(state, { reset: true });
  return { runtime, state, player, anchor, world, registry: registryFor(runtime) };
}

test('pause inventory stashes a rich lot against a real rock and Rapier contact recovers that pod', async (t) => {
  const h = await setupRuntime();
  t.after(() => h.runtime.dispose());
  const cargo = h.runtime.getSystem('cargo');
  const jettisonReceipts = [];
  const recoveryContacts = [];
  h.runtime.bus.on('cargo:jettisoned', (payload) => jettisonReceipts.push(structuredClone(payload)));
  h.runtime.bus.on('cargo:podRecovered', (payload) => {
    const livePod = h.state.entities.get(payload.podId);
    recoveryContacts.push({
      distance: livePod ? Math.hypot(livePod.pos.x - h.player.pos.x, livePod.pos.z - h.player.pos.z) : Infinity,
      contactRadius: livePod ? livePod.radius + h.player.radius : 0,
      backend: h.state.physicsRuntime?.diagnostics?.backend || null,
      sg02Ready: h.state.physicsRuntime?.diagnostics?.sg02Ready === true,
    });
  });
  assert.equal(cargo.addCargo(ORE, 5, {
    lotId: 'rich:drop-cache:1',
    provenanceId: 'prov:drop-cache:1',
    sourceKind: 'rich_seam',
    sourceOwner: 'player',
  }), 5);
  const beforeVelocity = { x: h.player.vel.x, z: h.player.vel.z };
  h.state.mode = 'paused';

  const stashed = executePauseCargoStash({ state: h.state, bus: h.runtime.bus, registry: h.registry }, ORE, 5);
  assert.equal(stashed.ok, true);
  assert.equal(stashed.quantity, 5);
  assert.equal(h.state.player.cargo.items[ORE] || 0, 0);
  assert.deepEqual({ x: h.player.vel.x, z: h.player.vel.z }, beforeVelocity,
    'placing a cache does not use the tactical jettison kick');
  assert.equal(jettisonReceipts.length, 1);
  assert.equal(jettisonReceipts[0].reactionImpulse, false);
  const pod = h.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.data?.smugglingDropCacheId === stashed.cacheId);
  assert.ok(pod && pod.type === 'payload' && pod.physicsBody?.dynamic === true && pod.collides === true);
  assert.equal(pod.data.richLotSource.provenanceId, 'prov:drop-cache:1');
  assert.equal(pod.data.richLotSource.lotId, 'rich:drop-cache:1');

  const dx = pod.pos.x - h.anchor.pos.x;
  const dz = pod.pos.z - h.anchor.pos.z;
  const mag = Math.hypot(dx, dz) || 1;
  const nx = dx / mag;
  const nz = dz / mag;
  // Isolate the already-created physical pod from its stash rock so this assertion measures the
  // canonical player/payload contact rather than the rock's simultaneous contact manifold.
  pod.pos.x += nx * 240;
  pod.pos.z += nz * 240;
  pod.vel.x = 0;
  pod.vel.z = 0;
  h.player.pos.x = pod.pos.x + nx * (h.player.radius + pod.radius + 2);
  h.player.pos.z = pod.pos.z + nz * (h.player.radius + pod.radius + 2);
  h.player.vel.x = -nx * 12;
  h.player.vel.z = -nz * 12;
  h.player.flightAssistMode = 'newtonian';
  h.state.mode = 'flight';
  await h.runtime.getSystem('physics').prepareBackend(h.state, { reset: true });
  for (let tick = 0; tick < 180 && pod.alive !== false; tick++) h.runtime.step(SIM_DT);

  assert.equal(recoveryContacts.length, 1);
  assert.equal(recoveryContacts[0].backend, 'rapier-dynamic');
  assert.equal(recoveryContacts[0].sg02Ready, true);
  assert.ok(recoveryContacts[0].distance <= recoveryContacts[0].contactRadius + 0.05,
    'the canonical owner accepts only the real post-Rapier body contact');
  assert.equal(pod.alive, false);
  assert.equal(h.state.player.cargo.items[ORE], 5);
  assert.equal(h.state.player.cargo.richLots[0].provenanceId, 'prov:drop-cache:1');
  const record = h.state.world.smugglingDropCaches.records.find((row) => row.id === stashed.cacheId);
  assert.equal(record.status, 'recovered');
  assert.equal(record.remainingQty, 0);
});

test('real save Continue restores one physical cache and Nera buys its coordinates exactly once', async (t) => {
  const h = await setupRuntime(SEED + 1);
  t.after(() => h.runtime.dispose());
  h.state.player.credits = 20_000;
  assert.equal(h.runtime.getSystem('cargo').addCargo(ORE, 4), 4);
  h.state.mode = 'paused';
  const stashed = executePauseCargoStash({ state: h.state, bus: h.runtime.bus, registry: h.registry }, ORE, 4);
  assert.equal(stashed.ok, true);
  const save = h.runtime.getSystem('save');
  const envelope = save.serialize('drop-cache-continue');
  assert.ok(envelope?.data?.world?.smugglingDropCaches);
  assert.doesNotMatch(JSON.stringify(envelope.data.world.smugglingDropCaches), /anchorEntityId|podId/,
    'disk state keeps stable cache identities, not live entity ids');
  assert.equal(save.loadEnvelope(envelope, 'drop-cache-continue'), true);
  const live = h.state.entityList.filter((entity) => entity && entity.alive !== false
    && entity.data?.smugglingDropCacheId === stashed.cacheId);
  assert.equal(live.length, 1, 'Continue rematerializes exactly one physical pod');

  h.state.player.credits = 20_000;
  h.state.mode = 'station';
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = HOME_STATION;
  const introduction = frontierRumorOffer(h.state, HOME_STATION);
  assert.ok(introduction);
  h.runtime.bus.emit('ui:purchaseFrontierRumor', { rumorId: introduction.id, stationId: HOME_STATION });
  assert.equal(frontierRumorOwned(h.state, introduction.id), true);
  const contact = generateContacts(HOME_STATION, h.state)
    .find((candidate) => candidate.id === FIXER_CONTACT.id);
  assert.ok(contact);
  assert.ok(contact.choices.some((choice) => choice.id === 'sell_drop'));
  const beforeSale = h.state.player.credits;
  const reply = buildReply('fixer', 'sell_drop', {
    state: h.state, bus: h.runtime.bus, registry: h.registry,
  }, HOME_STATION, contact);
  assert.equal(reply.dropCacheSale.ok, true);
  assert.equal(h.state.player.credits, beforeSale + reply.dropCacheSale.payoutCr);
  assert.equal(h.state.world.smugglingDropCaches.records.find((row) => row.id === stashed.cacheId).status, 'sold');
  assert.equal(h.state.entityList.some((entity) => entity && entity.alive !== false
    && entity.data?.smugglingDropCacheId === stashed.cacheId), false);
  const afterSale = h.state.player.credits;
  const duplicate = buildReply('fixer', 'sell_drop', {
    state: h.state, bus: h.runtime.bus, registry: h.registry,
  }, HOME_STATION, contact);
  assert.equal(duplicate.dropCacheSale, undefined);
  assert.equal(h.state.player.credits, afterSale, 'the coordinate payout is idempotent');

  const bought = buildReply('fixer', 'cache', {
    state: h.state, bus: h.runtime.bus, registry: h.registry,
  }, HOME_STATION, contact).frontierRumorOffer;
  assert.equal(bought?.source, 'fixer');
  h.runtime.bus.emit('ui:purchaseFrontierRumor', { rumorId: bought.id, stationId: HOME_STATION });
  assert.equal(frontierRumorOwned(h.state, bought.id), true);
  h.state.mode = 'flight';
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.world.enterSector(bought.sectorId, { placePlayer: false });
  assert.ok(h.state.entityList.some((entity) => entity && entity.alive !== false && entity.data && (
    entity.data.poiId === bought.targetId
    || entity.data.heistFacilityId === bought.targetId
    || entity.data.cacheId === bought.targetId
  )), 'the other half remains a purchased lead to a real World cache');
});
