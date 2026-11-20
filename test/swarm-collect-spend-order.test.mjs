// BUG-SWEEP-1 — the spend-before-accept family in Swarm's pickup ledgers. The supply pod
// (swarmEvents) and the Mill's ore (swarmArena) both spent their ledger entry before the
// collector gate and never stamped the acceptance receipt, so a drone or NPC hull touching
// the pickup consumed it and the pilot's credits went with it. The repair cell (swarmSupply)
// already refuses on the receipt first and spends only on success; these two now speak the
// same contract. Payloads carry the exact fields physics' emitPickupCollected sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSwarmEventDirector, SWARM_EVENT_POD_KIND } from '../src/systems/swarmEvents.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { MILL_ORE_CREDITS, MILL_ORE_KIND } from '../src/systems/asteroidMillArena.js';

const DT = 1 / 60;

function flightState(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const player = { id: state.nextEntityId++, type: 'ship', alive: true, collides: true,
    pos: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  return state;
}

function npcScooping(state, at) {
  const npc = { id: state.nextEntityId++, type: 'ship', alive: true, collides: true,
    pos: { x: at.x, z: at.z }, radius: 12, data: {} };
  state.entities.set(npc.id, npc); state.entityList.push(npc);
  return npc;
}

function contact() {
  return Object.assign(Object.create(physics), { _diag: { pickupCollections: 0 } });
}

function pickupAt(state, kind, amount) {
  const pk = { id: state.nextEntityId++, type: 'pickup', alive: true, collides: true,
    radius: 5, mass: 0.1, pos: { x: 0, z: 0 }, data: { kind, amount, despawnAt: 18 } };
  state.entities.set(pk.id, pk); state.entityList.push(pk);
  return pk;
}

// The receipt physics publishes for every contact collection — emitPickupCollected's shape.
function physicsReceipt(pk, collector) {
  return {
    pickupId: pk.id, collectorId: collector.id, kind: pk.data.kind, amount: pk.data.amount,
    commodityId: pk.data.commodityId, pos: { x: pk.pos.x, z: pk.pos.z },
  };
}

test('supply pod: a refused collection spends nothing — the pod survives and pays the pilot after', () => {
  const state = flightState(4242), bus = createBus();
  const director = createSwarmEventDirector({ state, bus, helpers: {}, registry: null });
  director.init();
  const pod = pickupAt(state, SWARM_EVENT_POD_KIND, 60);
  director._pods.set(pod.id, 60);
  const awards = [];
  bus.on('run:awardRequested', (p) => awards.push(p));

  const npc = npcScooping(state, pod.pos);
  const receipt = physicsReceipt(pod, npc);
  bus.emit('pickup:collected', receipt);
  assert.equal(receipt.acceptedAmount, 0, 'the wrong collector is refused on the receipt');
  assert.equal(receipt.rejectedAmount, 60, 'the refusal names the whole physical quantity');
  assert.equal(awards.length, 0, 'no credits leave on a refused contact');
  assert.equal(director._pods.has(pod.id), true, 'the ledger entry is not spent by a refusal');

  // The physical route reads the same receipt: the NPC contact must leave the pod in the world.
  const phys = contact();
  assert.equal(phys._applyPickupCollection(pod, npc, bus, state), false);
  assert.equal(pod.alive, true, "an NPC scoop cannot eat the pilot's pod");
  assert.equal(director._pods.has(pod.id), true);

  const player = state.entities.get(state.playerId);
  const paid = physicsReceipt(pod, player);
  bus.emit('pickup:collected', paid);
  assert.equal(paid.acceptedAmount, 60, "the pilot's touch accepts the whole pod");
  assert.equal(paid.rejectedAmount, 0);
  assert.equal(awards.length, 1, 'the wallet is charged once, on the accepted collection');
  assert.equal(awards[0].credits, 60);
  assert.equal(director._pods.has(pod.id), false, 'the ledger entry retires with the award');
  assert.equal(phys._applyPickupCollection(pod, player, bus, state), true);
  assert.equal(pod.alive, false, 'the accepted contact consumes the pickup');
  director.destroy();
});

test('mill ore: a refused collection spends nothing — the chunk survives and pays the pilot after', () => {
  const state = flightState(4243), bus = createBus();
  const arena = Object.create(swarmArena);
  arena.init({ state, bus, helpers: {}, registry: null });
  const ore = pickupAt(state, MILL_ORE_KIND, MILL_ORE_CREDITS);
  arena._millOres.add(ore);
  const awards = [];
  bus.on('run:awardRequested', (p) => awards.push(p));

  const npc = npcScooping(state, ore.pos);
  const receipt = physicsReceipt(ore, npc);
  bus.emit('pickup:collected', receipt);
  assert.equal(receipt.acceptedAmount, 0, 'the wrong collector is refused on the receipt');
  assert.equal(receipt.rejectedAmount, MILL_ORE_CREDITS);
  assert.equal(awards.length, 0, 'a drone scoop pays nothing and burns nothing');
  assert.equal(arena._millOres.has(ore), true, 'the ore claim is not spent by a refusal');

  const phys = contact();
  assert.equal(phys._applyPickupCollection(ore, npc, bus, state), false);
  assert.equal(ore.alive, true, 'the chunk stays on the field for the pilot');

  state.simTime += 5 * DT; // past the 0.75 s same-collector retry embargo, and the player is a different collector anyway
  const player = state.entities.get(state.playerId);
  const paid = physicsReceipt(ore, player);
  bus.emit('pickup:collected', paid);
  assert.equal(paid.acceptedAmount, MILL_ORE_CREDITS);
  assert.equal(paid.rejectedAmount, 0);
  assert.equal(awards.length, 1, 'one chunk pays once');
  assert.equal(awards[0].credits, MILL_ORE_CREDITS);
  assert.equal(arena._millOres.has(ore), false);
  assert.equal(phys._applyPickupCollection(ore, player, bus, state), true);
  assert.equal(ore.alive, false);
  arena.destroy();
});
