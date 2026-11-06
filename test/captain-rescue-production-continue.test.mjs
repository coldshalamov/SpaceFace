import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stampCaptainIdentity } from '../src/systems/captainMemory.js';
import { shouldEjectCausalSurvivorPod, isCausalSurvivorPod } from '../src/systems/survivorPod.js';
import { productionContinueFixture, nextHostTurn } from './fixtures/production-continue-finalizer.mjs';

// Real production systems, native pod adoption, save envelope, Continue router/finalizer and
// rescue producer. Storage/paint are the existing headless ports; the handoff's latch is setup.
// This is not a browser picture, earned flight/tow route, or a quiet-host performance claim.
test('a first-met captain remains the same client through production Continue and original-pod rescue', { timeout: 20000 }, async () => {
  const h = await productionContinueFixture();
  try {
    const { runtime, state, bus, registry } = h;
    const player = state.entities.get(state.playerId);
    const victim = runtime.spawn(makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_mts', pos: { x: player.pos.x + 400, z: player.pos.z },
    }));
    Object.assign(victim.data, { trafficRole: 'hauler', trafficLabel: 'Relief hauler', homeSectorId: 'sector_helios_prime' });
    for (let i = 0; i < 100; i++) {
      victim.data.worldRecordId = `continue-civilian:${i}`;
      if (shouldEjectCausalSurvivorPod(state, victim)) break;
    }
    assert.ok(shouldEjectCausalSurvivorPod(state, victim), 'ordinary seeded ejection rule selects the fixture identity');
    const identity = stampCaptainIdentity(state, victim);
    assert.ok(identity);
    assert.equal((state.traffic.captainRoster || []).some(row => row.id === identity.id), false, 'first meeting has no invented previous outcome');
    const ejections = [];
    bus.on('survivorPod:ejected', receipt => ejections.push(receipt));
    victim.alive = false;
    bus.emit('entity:killed', { id: victim.id, type: 'ship', killerId: state.playerId,
      pos: { ...victim.pos }, vel: { ...victim.vel }, factionId: victim.factionId, data: victim.data });
    assert.equal(ejections.length, 1);
    const pod = state.entities.get(ejections[0].entityId);
    assert.ok(isCausalSurvivorPod(pod));
    const key = pod.data.captainPodKey, memoryId = pod.data.survivorPodCausal.memoryId;
    assert.ok(key);
    const prior = structuredClone(state.traffic.captainRoster.find(row => row.id === identity.id));
    assert.equal(prior.alive, false);
    assert.equal(prior.outcomes.killed, 1);
    const envelope = h.saves.serialize('captain-rescue-continue');
    assert.equal(await h.load(envelope), true);
    assert.deepEqual(await h.finalization(), { stale: false });
    await nextHostTurn();
    assert.equal(state.mode, 'flight');
    state.render.worldSubmittedFrames = (Number(state.render.worldSubmittedFrames) || 0) + 1;
    assert.equal(state.render.releaseOpeningPresentationHold(), true);
    const copies = state.entityList.filter(entity => entity.alive !== false && entity.data?.survivorPodCausal?.memoryId === memoryId);
    assert.equal(copies.length, 1, 'full restore retains exactly the original durable pod');
    const restored = copies[0];
    assert.equal(restored.data.captainPodKey, key);
    assert.ok(registry.get('physics')._sg02.records.has(restored.id), 'real Continue adopts the original pod into native physics');
    assert.deepEqual(state.traffic.captainRoster.find(row => row.id === identity.id), prior);
    runtime.step();
    assert.equal(state.entityList.filter(entity => entity.alive !== false && entity.data?.captainPodKey === key).length, 1);
    const currentPlayer = state.entities.get(state.playerId);
    // Focused handoff setup after real Continue. The original pod remains the only passenger;
    // a traffic-owned rescue hull takes custody before its real delivery owner completes rescue.
    const rescuer = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
      team: 2, factionId: 'faction_mts', pos: { x: restored.pos.x + 24, z: restored.pos.z },
    }));
    rescuer.data.trafficRole = 'rescue';
    rescuer.data.role = 'rescue';
    rescuer.data.worldRecordId = `continue-rescue:${rescuer.id}`;
    state.traffic.freighters.push({ id: rescuer.id, role: 'rescue', targetId: null,
      waitT: 0, carryingSurvivor: false });
    rescuer.flags.noInterp = true;
    currentPlayer.pos.x = restored.pos.x; currentPlayer.pos.z = restored.pos.z;
    currentPlayer.vel.x = 0; currentPlayer.vel.z = 0;
    currentPlayer.flags.noInterp = true;
    state.player.tether = { ...state.player.tether, active: true, targetId: restored.id, attachmentId: null };
    const receipts = [], grants = [], boarded = [];
    bus.on('survivorPod:rescued', receipt => receipts.push(receipt));
    bus.on('survivorPod:boarded', receipt => boarded.push(receipt));
    bus.on('economy:grantCredits', intent => { if (String(intent.reason).startsWith('survivor_mayday:')) grants.push(intent); });
    registry.get('survivorPod').update(0, state);
    assert.equal(boarded.length, 1, 'the latched pod transfers into rescue-hull custody');
    assert.equal(boarded[0].entityId, restored.id, 'custody keeps the original durable pod identity');
    assert.equal(receipts.length, 0, 'boarding is custody transfer, not terminal rescue');
    assert.equal(grants.length, 0, 'boarding alone must not pay the rescue fee');
    const custody = state.survivorPod.causal.receipts.find(item => item.id === memoryId);
    assert.equal(custody?.outcome, 'in_transit');
    assert.equal(custody?.carrierEntityId, rescuer.id);
    assert.equal(rescuer.data.carryingSurvivor, true);
    const traffic = registry.get('traffic');
    const rescueRecord = state.traffic.freighters.find(item => item.id === rescuer.id);
    assert.ok(traffic && rescueRecord?.targetId != null, 'the production traffic owner assigns a station destination');
    const deliveryStation = state.entities.get(rescueRecord.targetId);
    assert.ok(deliveryStation?.type === 'station', 'rescue destination is a real station entity');
    // Focus the final delivery handoff on the assigned real station; this is not a flown route test.
    rescuer.pos.x = deliveryStation.pos.x; rescuer.pos.z = deliveryStation.pos.z;
    // Invoke the production role owner at that arrival geometry. This focused Continue test
    // does not substitute an offscreen-scheduler or flown-route claim for the custody contract.
    assert.equal(traffic._stepRescue(rescuer, rescueRecord, traffic._sectorStations(), state, 0), true);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].reason, 'player_handoff_rescue_hull');
    assert.equal(receipts[0].playerAnswered, true);
    assert.equal(grants.length, 1);
    assert.equal(rescuer.data.carryingSurvivor, false);
    assert.equal(state.survivorPod.causal.receipts.find(item => item.id === memoryId)?.outcome, 'rescued');
    const row = state.traffic.captainRoster.find(item => item.id === identity.id);
    assert.equal(row.name, prior.name); assert.equal(row.worldRecordId, prior.worldRecordId);
    assert.equal(row.alive, true); assert.equal(row.outcomes.rescued, 1);
    const due = row.orderDueAtS;
    bus.emit('survivorPod:rescued', receipts[0]);
    assert.equal(row.outcomes.rescued, 1); assert.equal(row.orderDueAtS, due);
    state.simTime = due;
    const offers = registry.get('missions').ensureBoard(row.homeStationId).slots.filter(offer => offer.giverId === identity.id);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].clientId, identity.id);
    assert.match(offers[0].title, new RegExp(prior.name));
    assert.equal(offers[0].preloadedCargo, true);
    assert.equal(offers[0].params.qty, 2);
    assert.deepEqual(h.events.filter(event => event.name === 'save:error' || event.name === 'game:startFailed'), []);
  } finally { h.close(); }
});
