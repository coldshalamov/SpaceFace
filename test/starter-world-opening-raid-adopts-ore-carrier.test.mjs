import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';

const FRAME_WU = 2 * 115 + 30;

function fireOpeningRaid(seed, carrierSpec) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const carrier = carrierSpec ? sim.spawn(carrierSpec) : null;
  const spawned = [];
  bus.on('encounter:spawned', (p) => spawned.push(p));
  const raidPlan = planEncounters(seed, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime'))
    .find((it) => it.shapeId === 'opening_hauler_raid');
  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30;
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120);
  const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
  return { sim, state, player, carrier, live, spawned };
}

function loadedCarrierSpec(pos, qty) {
  return {
    type: 'ship', team: 2, factionId: 'faction_scn', pos, vel: { x: 0, z: 0 }, hull: 120, hullMax: 120, radius: 9,
    data: {
      activityActorSlotId: 'helios_starter_ore_carrier',
      worldRecordId: 'wr_starter_world_test_carrier',
      trafficRole: 'hauler',
      factionId: 'faction_scn',
      cargoManifest: qty > 0 ? {
        manifestId: 'fm_starter_world_seam_lot',
        freighterKey: 'wr_starter_world_test_carrier',
        role: 'ore_carrier',
        lines: [{ commodityId: 'cmdty_ore_iron', qty }],
        totalQty: qty,
      } : null,
    },
  };
}

test('starter-world: the opening raid hits the loaded Helios ore barge already in its frame', () => {
  for (const seed of [4242, 8008]) {
    const { sim, state, player, carrier, live, spawned } = fireOpeningRaid(seed,
      loadedCarrierSpec({ x: 40, z: 30 }, 3));
    assert.ok(live, `seed ${seed}: raid must fire`);
    assert.ok(spawned.some((p) => p.encounterId === live.id), `seed ${seed}: commitment event`);
    const members = live.ids.map((id) => state.entities.get(id)).filter(Boolean);
    const haulers = members.filter((e) => live.roles[e.id] === 'hauler'
      || e.data?.ai?.encounterRole === 'hauler');
    assert.equal(haulers.length, 1, `seed ${seed}: exactly one victim hull`);
    assert.equal(haulers[0].id, carrier.id, `seed ${seed}: the victim is the working barge, not a fresh mule`);
    assert.equal(haulers[0].data.worldRecordId, 'wr_starter_world_test_carrier');
    assert.equal(live.data.adoptedCarrier.worldRecordId, 'wr_starter_world_test_carrier');
    assert.equal(live.data.freightManifest.manifestId, 'fm_starter_world_seam_lot',
      `seed ${seed}: the raid's lot is the barge's real seam manifest`);
    assert.deepEqual(live.data.freightManifest.lines, [{ commodityId: 'cmdty_ore_iron', qty: 3 }]);
    assert.equal(carrier.data.freightRewardOwner, 'manifest_custody');
    const raiders = members.filter((e) => e.id !== carrier.id);
    assert.ok(raiders.length >= 1, `seed ${seed}: raiders committed`);
    for (const raider of raiders) {
      assert.ok(Math.hypot(raider.pos.x - player.pos.x, raider.pos.z - player.pos.z) <= FRAME_WU + 320,
        `seed ${seed}: raiders stay in the opening frame`);
      assert.equal(raider.data.combat.targetId, carrier.id, `seed ${seed}: focus track is the barge`);
    }
    // The predation stack binds the barge as the manifest carrier; the designated raider holds the
    // sanctioned first-fire onto a Helios (SCN) hull. Wingmen keep ordinary faction authority.
    assert.equal(carrier.data.predationRole, 'manifest_carrier');
    assert.equal(carrier.data.predationEncounterId, live.id);
    const designated = state.entities.get(live.data.predationRaiderId);
    assert.ok(designated && raiders.includes(designated), `seed ${seed}: one designated raider`);
    assert.equal(isHostileForAI(state, designated, carrier), true, `seed ${seed}: designated raider hunts the barge`);

    // Nobody intervenes: the raid's window closes and the barge goes back to its own work.
    sim.runTicks(60 * 90);
    assert.equal(live.phase, 'done', `seed ${seed}: raid resolved`);
    assert.equal(carrier.alive, true, `seed ${seed}: the barge is still a live hull`);
    assert.equal(live.ids.includes(carrier.id), false, `seed ${seed}: released from the raid roster`);
    assert.equal(carrier.data.predationEncounterId == null, true, `seed ${seed}: predation binding cleared`);
    assert.equal(carrier.data.freightRewardOwner, undefined, `seed ${seed}: world reward ownership restored`);
    assert.equal(carrier.data.ai.encounterId, undefined, `seed ${seed}: squad-frame stamps restored`);
    assert.equal(carrier.data.worldRecordId, 'wr_starter_world_test_carrier');
  }
});

test('starter-world: an empty or out-of-frame barge is left to its work; the raid brings its own mule', () => {
  for (const [label, spec] of [
    ['empty', loadedCarrierSpec({ x: 40, z: 30 }, 0)],
    ['far', loadedCarrierSpec({ x: 900, z: -400 }, 3)],
  ]) {
    const { state, carrier, live } = fireOpeningRaid(4242, spec);
    assert.ok(live, `${label}: raid must still fire`);
    assert.equal(live.data.adoptedCarrier == null, true, `${label}: no adoption`);
    assert.equal(live.ids.includes(carrier.id), false, `${label}: barge not enrolled`);
    assert.equal(carrier.data.predationEncounterId == null, true, `${label}: barge untouched`);
    const mule = live.ids.map((id) => state.entities.get(id))
      .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
    assert.ok(mule && mule.id !== carrier.id, `${label}: the planned mule carries the raid`);
  }
});

test('starter-world: a barge lost to the raid leaves one marker wreck with its real lot identity', async () => {
  const { aftermathWrecks, aftermathForSector } = await import('../src/systems/aftermathWrecks.js');
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, encounterDirector, aftermathWrecks] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const carrier = sim.spawn(loadedCarrierSpec({ x: 40, z: 30 }, 12));
  const raidPlan = planEncounters(4242, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime'))
    .find((it) => it.shapeId === 'opening_hauler_raid');
  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30;
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120);
  const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
  assert.equal(live.data.adoptedCarrier.entityId, carrier.id);
  const raider = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data && e.data.predationRole === 'raider');
  assert.ok(raider, 'a designated raider is bound to the barge');

  // The kill is delivered on the production event; what is asserted is the consequence it leaves.
  carrier.alive = false;
  const kill = { id: carrier.id, killerId: raider.id, type: 'ship', factionId: 'faction_scn',
    pos: { ...carrier.pos }, sectorId: 'sector_helios_prime' };
  bus.emit('entity:killed', kill);
  bus.emit('entity:killed', { ...kill });
  const markers = aftermathForSector(state, 'sector_helios_prime')
    .filter((m) => m.freightIdentity && m.freightIdentity.manifestId === 'fm_starter_world_seam_lot');
  assert.equal(markers.length, 1, 'one wreck marker for the barge, duplicate kill delivery ignored');
  const marker = markers[0];
  assert.equal(marker.freightIdentity.freighterKey, 'wr_starter_world_test_carrier', 'the wreck names the barge');
  assert.equal(marker.encounterId, live.id, 'the wreck names the raid that took it');
  // Custody is the single writer for the lot: the whole seam manifest spills as physical pods
  // under the raid's custody, and the wreck adds no second copy of the same ore.
  assert.equal(carrier.data.freightCustody.status, 'spilled');
  assert.equal(carrier.data.cargoManifest.totalQty, 0, 'the hold emptied into space, not into the ledger');
  const custody = live.data.freightCargoCustody;
  assert.equal(custody.legalOwnerStableId, 'wr_starter_world_test_carrier', 'the pods still belong to the barge');
  const pods = custody.pods.filter((pod) => pod.cause === 'carrier_destroyed' && pod.status === 'live');
  assert.equal(pods.reduce((sum, pod) => sum + pod.qty, 0), 12, 'all twelve ore are floating as physical pods');
  for (const pod of pods) {
    const body = state.entities.get(pod.entityId);
    assert.ok(body && body.alive !== false, `pod ${pod.podIdentity} is a live body`);
  }
  assert.equal(marker.manifestResidue, null, 'no double-paid residue on top of the spilled lot');
  assert.equal(marker.killerId, raider.id);

  sim.runTicks(60);
  const wrecks = sim.registry.get('aftermathWrecks');
  const persisted = JSON.parse(JSON.stringify(wrecks.serialize()));
  wrecks.deserialize(persisted);
  const back = aftermathForSector(state, 'sector_helios_prime')
    .filter((m) => m.markerId === marker.markerId);
  assert.equal(back.length, 1, 'the barge wreck survives save/load');
  assert.deepEqual(back[0].freightIdentity, marker.freightIdentity);
  assert.deepEqual(back[0].manifestResidue, marker.manifestResidue);
  sim.dispose();
});
