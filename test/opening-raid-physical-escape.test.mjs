import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { save } from '../src/save/saveSystem.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';

function raid({ withSave = false, budgetCap = null, withoutCarrier = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, encounterDirector, ...(withSave ? [save] : [])] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  if (budgetCap != null) state.spawnBudget.max = budgetCap;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  let carrier = withoutCarrier ? null : sim.spawn({ type: 'ship', team: 2, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 9, hull: 120, hullMax: 120,
    data: { activityActorSlotId: 'helios_starter_ore_carrier', worldRecordId: 'test-barge', trafficRole: 'hauler',
      cargoManifest: { manifestId: 'real-ore', freighterKey: 'test-barge', role: 'ore_carrier',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 3 }], totalQty: 3 } } });
  const plan = planEncounters(4242, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime')).find((r) => r.shapeId === 'opening_hauler_raid');
  state.encounterDirector.pending = [{ ...plan, dueAt: 0, defers: 0, ...(withoutCarrier ? { fireReadyHoldSince: -3600 } : {}) }];
  state.encounterDirector.pressure.combat = 30;
  sim.runTicks(150);
  const live = Object.values(state.encounterDirector.live).find((r) => r.shapeId === 'opening_hauler_raid');
  assert.ok(live);
  if (withoutCarrier) carrier = live.ids.map((id) => state.entities.get(id)).find((e) => live.roles[e.id] === 'hauler');
  else assert.equal(live.data.adoptedCarrier.entityId, carrier.id);
  const raiders = live.ids.filter((id) => live.roles[id] === 'raider').map((id) => state.entities.get(id));
  const results = [], grants = [];
  bus.on('encounter:resolved', (p) => results.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  return { sim, state, bus, player, carrier, live, raiders, results, grants };
}

function separate(t) {
  t.carrier.pos.x += 180;
  t.raiders.forEach((r, i) => { r.pos.x = t.carrier.pos.x + 600 + i * 40; r.pos.z = t.carrier.pos.z; r.vel.x = 0; r.vel.z = 0; });
}
function intervene(t) {
  t.bus.emit('tether:attached', { actorId: t.player.id, targetId: t.raiders[0].id, attachmentId: 'actual-player-line' });
}

test('fallback freight actually flies toward the live Helios station with its original cargo', async () => {
  const h = await bootRealPath({ seed: 4242, systems: ['tacticalAI', 'flightV3', 'aiPorts', spawnBudget, encounterDirector],
    bounds: { center: { x: 0, z: 0 }, radius: 4200, hardRadius: 4700 },
    prepareState({ state }) { state.world.currentSectorId = 'sector_helios_prime'; },
    hulls: [{ hullId: 'ship_wasp', isPlayer: true, pos: { x: 0, z: 0 } }] });
  try {
    const station = h.runtime.spawn({ type: 'station', pos: { x: 1400, z: 0 }, radius: 34, mass: 1e6,
      hull: 1e6, hullMax: 1e6, collides: true, data: { stationId: 'station_helios' } });
    h.state.world.activeSector.stations.push({ id: station.id, stationId: 'station_helios', pos: { ...station.pos } });
    const plan = planEncounters(4242, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime')).find((r) => r.shapeId === 'opening_hauler_raid');
    h.state.encounterDirector.pending = [{ ...plan, dueAt: 0, defers: 0, fireReadyHoldSince: -3600 }];
    h.state.encounterDirector.pressure.combat = 30;
    h.step(150);
    const live = Object.values(h.state.encounterDirector.live).find((r) => r.shapeId === 'opening_hauler_raid');
    assert.ok(live); assert.equal(live.data.adoptedCarrier, undefined);
    const carrier = live.ids.map((id) => h.state.entities.get(id)).find((e) => live.roles[e.id] === 'hauler');
    assert.ok(carrier); assert.equal(carrier.data.ai.activity.reason, 'vignette_motion:opening_freight_escape');
    const start = { ...carrier.pos }, cargo = JSON.stringify(carrier.data.cargoManifest);
    h.step(60 * 12);
    assert.ok(Math.hypot(carrier.pos.x - start.x, carrier.pos.z - start.z) > 20, 'normal propulsion moves the carrier');
    assert.ok(Math.hypot(carrier.pos.x - station.pos.x, carrier.pos.z - station.pos.z)
      < Math.hypot(start.x - station.pos.x, start.z - station.pos.z) - 20, 'the carrier makes progress toward the station');
    assert.equal(JSON.stringify(carrier.data.cargoManifest), cargo);
    const releaseForCapture = h.runtime.getSystem('aiPorts')._captureManeuverActivity(carrier);
    assert.equal(typeof releaseForCapture, 'function');
    assert.equal(releaseForCapture(), true);
    assert.equal(carrier.data.ai.activity, null, 'capture does not inherit the freighter escape helm');
    assert.notEqual(carrier.data.ai.allowPassiveManeuver, true);
  } finally { h.dispose(); }
});

test('fallback without a live station and an adopted working barge retain their own helm', () => {
  const fallback = raid({ withoutCarrier: true });
  assert.notEqual(fallback.carrier.data.ai.activity?.reason, 'vignette_motion:opening_freight_escape');
  fallback.sim.dispose();
  const adopted = raid();
  assert.notEqual(adopted.carrier.data.ai.activity?.reason, 'vignette_motion:opening_freight_escape');
  assert.notEqual(adopted.carrier.data.ai.allowPassiveManeuver, true);
  adopted.sim.dispose();
});

test('grabbing the bound thief provokes real retaliation, without faking its velocity', () => {
  const t = raid();
  const thief = t.state.entities.get(t.live.data.predationRaiderId);
  const velocity = { ...thief.vel };
  t.bus.emit('tether:attached', { actorId: t.player.id, targetId: thief.id, attachmentId: 'player-line' });
  assert.equal(thief.data.ai.retaliationTargetId, t.player.id);
  assert.equal(thief.data.ai.predationEndReason, 'player_intervention');
  assert.deepEqual({ ...thief.vel }, velocity);
  t.sim.dispose();
});

test('a player can physically clear the lane without killing the raiders or duplicating ore', () => {
  const t = raid(); const initial = JSON.stringify(t.carrier.data.cargoManifest);
  intervene(t); separate(t); t.sim.runTicks(60 * 7);
  assert.equal(t.live.outcome, 'defended');
  assert.equal(t.results.at(-1).causality.resolutionMethod, 'physical_escape');
  assert.equal(t.grants.length, 1);
  assert.equal(JSON.stringify(t.carrier.data.cargoManifest), initial);
  assert.equal(t.carrier.data.worldRecordId, 'test-barge');
  assert.equal(t.carrier.data.ai.encounterId, undefined);
  assert.equal(t.carrier.data.predationEncounterId, undefined);
  assert.equal(t.carrier.data.freightCustody, undefined, 'the released worker is no longer custody-pinned');
  assert.equal(t.carrier.data.freightCustodyCarrierIdentityKey, undefined);
  for (const r of t.raiders) { assert.equal(r.alive, true); assert.equal(r.data.despawnAt, undefined); assert.notEqual(t.state.encounterDirector.squadMembership[r.id], t.live.id); }
  assert.notEqual(t.state.encounterDirector.squadMembership[t.carrier.id], t.live.id);
  t.sim.runTicks(120); assert.equal(t.grants.length, 1);
  t.sim.dispose();
});

test('the light attacker is staged on the player side without overlapping the real carrier', () => {
  const t = raid();
  const wasp = t.raiders.find((r) => r.data.lootTableId === 'wasp_swarmer');
  assert.ok(wasp, 'the guaranteed light hull exists');
  const playerDistance = Math.hypot(wasp.pos.x - t.player.pos.x, wasp.pos.z - t.player.pos.z);
  const carrierDistance = Math.hypot(wasp.pos.x - t.carrier.pos.x, wasp.pos.z - t.carrier.pos.z);
  assert.ok(playerDistance < 70, 'the light hull is within reach on the player flank');
  assert.ok(carrierDistance > wasp.radius + t.carrier.radius + 16, 'the hulls have physical clearance');
  t.sim.dispose();
});

test('a partial spawn budget still includes the light attacker beside the fallback freighter', () => {
  const t = raid({ budgetCap: 3, withoutCarrier: true });
  assert.equal(t.raiders.length, 2);
  assert.equal(t.raiders[0].data.lootTableId, 'wasp_swarmer');
  t.sim.dispose();
});

test('towing the carrier clear is also an intervention, but shooting it is not a paid rescue', () => {
  const towed = raid();
  towed.bus.emit('tether:attached', { actorId: towed.player.id, targetId: towed.carrier.id, attachmentId: 'tow' });
  separate(towed); towed.sim.runTicks(60 * 7);
  assert.equal(towed.live.outcome, 'defended');
  assert.equal(towed.grants.length, 1);
  towed.sim.dispose();

  const harmed = raid();
  harmed.bus.emit('combat:damage', { attackerId: harmed.player.id, targetId: harmed.carrier.id, applied: 1 });
  intervene(harmed); separate(harmed); harmed.sim.runTicks(60 * 7);
  assert.equal(harmed.live.phase, 'conflict'); assert.equal(harmed.grants.length, 0);
  harmed.sim.dispose();
});

test('a real player hit on an attacker can open the same physical escape', () => {
  const t = raid();
  t.bus.emit('combat:damage', { attackerId: t.player.id, targetId: t.raiders[0].id, applied: 1 });
  separate(t); t.sim.runTicks(60 * 7);
  assert.equal(t.live.outcome, 'defended'); assert.equal(t.grants.length, 1);
  t.sim.dispose();
});

test('separation needs real player intervention and a sustained clear path', () => {
  const t = raid(); separate(t); t.sim.runTicks(60 * 6);
  assert.equal(t.live.phase, 'conflict'); assert.equal(t.grants.length, 0);
  intervene(t); t.raiders[0].pos.x = t.carrier.pos.x + 350; t.raiders[0].vel.x = -50;
  t.sim.runTicks(60 * 6); assert.equal(t.live.phase, 'conflict', 'a closing raider is still a threat');
  t.raiders[0].vel.x = 0; t.sim.runTicks(60 * 2);
  t.raiders[0].pos.x = t.carrier.pos.x + 100; t.sim.runTicks(60 * 2);
  t.raiders[0].pos.x = t.carrier.pos.x + 600; t.sim.runTicks(60 * 3);
  assert.equal(t.live.phase, 'conflict', 'renewed threat resets the clear timer');
  t.sim.runTicks(60 * 3); assert.equal(t.live.outcome, 'defended'); t.sim.dispose();
});

test('changed cargo or a reused body identity never becomes an intact rescue', () => {
  for (const change of [
    (t) => { t.carrier.data.cargoManifest.lines[0].qty = 2; t.carrier.data.cargoManifest.totalQty = 2; },
    (t) => { t.carrier.occupantGeneration = (t.carrier.occupantGeneration || 0) + 1; },
    (t) => { t.raiders[0].occupantGeneration = (t.raiders[0].occupantGeneration || 0) + 1; },
  ]) {
    const t = raid(); intervene(t); separate(t); change(t); t.sim.runTicks(60 * 7);
    assert.equal(t.live.phase, 'conflict'); assert.equal(t.grants.length, 0); t.sim.dispose();
  }
});

test('a foreign custody marker is never retired or rewarded as this raid', () => {
  const t = raid(); intervene(t); separate(t);
  t.carrier.data.freightCustody.encounterId = 'another-encounter';
  t.sim.runTicks(60 * 7);
  assert.equal(t.live.phase, 'conflict');
  assert.equal(t.carrier.data.freightCustody.encounterId, 'another-encounter');
  assert.equal(t.grants.length, 0);
  t.sim.dispose();
});

test('a separately owned persistence handoff cannot be discarded by the escape', () => {
  const t = raid(); intervene(t); separate(t);
  t.carrier.data.freightCustodyPersistence = { custodyId: 'different-recovery', role: 'carrier' };
  t.sim.runTicks(60 * 7);
  assert.equal(t.live.phase, 'conflict');
  assert.equal(t.carrier.data.freightCustodyPersistence.custodyId, 'different-recovery');
  assert.equal(t.carrier.data.freightCustody.manifestId, 'real-ore');
  assert.equal(t.grants.length, 0);
  t.sim.dispose();
});

test('rewinding the simulation clock cancels an incomplete escape rather than paying it', () => {
  const t = raid(); intervene(t); separate(t); t.sim.runTicks(60 * 2);
  t.state.simTime = 0; t.sim.runTicks(60 * 7);
  assert.equal(t.grants.length, 0);
  assert.notEqual(t.live.outcome, 'defended');
  t.sim.dispose();
});

test('Continue cannot award an escape from transient pre-save timing state', () => {
  const t = raid({ withSave: true }); intervene(t); separate(t); t.sim.runTicks(60 * 2);
  const system = t.sim.registry.get('save');
  const envelope = JSON.parse(JSON.stringify(system.serialize('opening-escape')));
  assert.equal(system.loadEnvelope(envelope, 'opening-escape'), true);
  t.sim.runTicks(60 * 7);
  assert.equal(t.grants.length, 0);
  assert.equal(t.results.some((row) => row.causality?.resolutionMethod === 'physical_escape'), false);
  const restored = [...t.state.entities.values()].find((e) => e.data?.worldRecordId === 'test-barge');
  if (restored) assert.equal(restored.data.freightCustody, undefined, 'Continue leaves no orphaned raid marker');
  t.sim.dispose();
});

test('a real drive-disable spill leaves custody open and cannot pay an intact escape', () => {
  const t = raid();
  const thief = t.state.entities.get(t.live.data.predationRaiderId);
  t.bus.emit('combat:subsystemDisabled', { attackerId: thief.id, targetId: t.carrier.id,
    subsystemId: 'subsystem_drive', dependencyDisabled: false });
  assert.ok(t.live.data.freightCargoCustody && !t.live.data.freightCargoCustody.terminal);
  intervene(t); separate(t); t.sim.runTicks(60 * 7);
  assert.equal(t.live.phase, 'conflict'); assert.equal(t.grants.length, 0);
  t.sim.dispose();
});
