import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { combat } from '../src/systems/combat.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { missions } from '../src/systems/missions.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';
const ANCHOR = { x: 6200, z: 4800 };

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity, heat, economy, combat, cargo, spawnBudget, encounterDirector,
    combatOutcome, aftermathWrecks, custodyConsequences, missions, survivorPod] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.story.beatIndex = 7;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { ...ANCHOR }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8, data: { intent: {}, ai: {} } });
  state.playerId = player.id;
  sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn', pos: { ...ANCHOR }, radius: 42,
    data: { stationId: STATION, sectorId: SECTOR, dockRadius: 72 } });
  return { sim, state, bus, player, jobs: sim.registry.get('missions') };
}

function raid(h, killCast = true) {
  const encounterId = 'm01:opening:4242';
  const result = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'opening_hauler_raid', encounterId, sectorId: SECTOR,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const live = h.state.encounterDirector.live[encounterId];
  const carrier = h.state.entities.get(live.data.predationTargetId);
  assert.ok(carrier?.data.cargoManifest, 'use the shipped raid and its real manifest');
  const initialQty = carrier.data.cargoManifest.totalQty;
  // The ordinary drive-disable seam sheds the native freight pods; the encounter is not copied.
  h.state.combat.entities[String(carrier.id)] = { entityId: carrier.id,
    capabilities: { drive: false, weapon: true },
    subsystems: { subsystem_drive: { destroyed: true, effectiveDisabled: true } } };
  h.bus.emit('combat:subsystemDisabled', { targetId: carrier.id, attackerId: live.data.predationRaiderId,
    subsystemId: 'subsystem_drive', dependencyDisabled: false });
  assert.ok(live.ids.some((id) => live.roles[id] === 'freight_pod'));
  const cast = live.ids.filter((id) => ['raider', 'hauler'].includes(live.roles[id])).map((id) => h.state.entities.get(id));
  if (killCast) for (const ship of cast) h.sim.registry.get('combat').kill(ship, h.state.playerId);
  const pods = live.ids.filter((id) => live.roles[id] === 'freight_pod').map((id) => h.state.entities.get(id));
  const row = Object.values(h.state.player.custodyLedger.raidAftermath)[0];
  assert.ok(row);
  assert.equal(row.lines[0].qty, initialQty - (killCast ? 0 : live.data.freightCargoCustody.carrierQty), 'the tail names actual scattered freight, not a generated load');
  assert.equal(row.lines[0].manifestId, live.data.freightManifest.manifestId);
  if (killCast) assert.ok(Object.keys(row.survivors).length > 0, 'native seed-4242 crew ejection becomes part of this incident');
  return { live, pods, row, initialQty, carrier };
}

function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.bus.emit('dock:docked', { stationId: STATION });
}

function saveAndContinue(h) {
  const savedAftermath = JSON.parse(JSON.stringify(h.sim.registry.get('aftermathWrecks').serialize()));
  const player = JSON.parse(JSON.stringify(h.state.player));
  h.sim.dispose();
  const resumed = boot();
  resumed.state.player = player;
  resumed.sim.registry.get('aftermathWrecks').deserialize(savedAftermath);
  return resumed;
}

test('M01 seed 4242: raid field offers carry real freight/survivor custody; actual handoffs persist as settled', () => {
  let h = boot();
  try {
    const { pods, row, initialQty } = raid(h);
    const outcome = h.sim.registry.get('combatOutcome');
    outcome.update(1 / 60, h.state);
    const field = h.state.combatOutcome.aftermath;
    assert.ok(field?.custody?.some((entry) => entry.key === row.key && entry.freightRemaining === initialQty));
    assert.ok(field.choices.some((choice) => choice.id === 'salvage'));
    assert.ok(field.choices.some((choice) => choice.id === 'rescue'), 'living ejected crew are a real rescue target');
    assert.ok(field.choices.some((choice) => choice.id === 'escape'));
    assert.equal(h.state.paused, undefined);
    h.bus.emit('combat:aftermathChoose', { choiceId: 'salvage' });
    assert.equal(row.status, 'open', 'choosing salvage never pretends the goods were delivered');

    dock(h);
    const offer = h.state.missions.boards[STATION].slots.find((m) => m.source === 'custodyRecovery');
    assert.ok(offer);
    assert.equal(offer.params.qty, initialQty);
    assert.equal(h.jobs.acceptMission(offer.id), true);
    const heatBefore = h.state.player.heat;
    assert.equal(h.sim.registry.get('custodyConsequences').authorizesRecovery(row.lines[0].manifestId), true);
    for (const pod of pods) {
      const pickup = { pickupId: pod.id, collectorId: h.state.playerId, kind: pod.data.kind,
        commodityId: pod.data.commodityId, amount: pod.data.amount, pos: { x: pod.pos.x, z: pod.pos.z } };
      h.bus.emit('pickup:collected', pickup);
      assert.equal(pickup.acceptedAmount, pod.data.amount);
      pod.alive = false;
    }
    dock(h);
    assert.equal(row.lines[0].returnedQty, initialQty);
    assert.equal(h.state.player.heat, heatBefore, 'the accepted exact-manifest return is lawful collection');
    assert.equal(Object.values(h.state.lawSecurity.reportedIncidents || {}).some((receipt) => receipt.kind === 'payload_theft'), false);
    assert.equal(h.sim.registry.get('custodyConsequences').authorizesRecovery(row.lines[0].manifestId), false);
    assert.equal(row.status, 'open', 'freight return alone does not also rescue the crew');
    h.state.ui.docked = false;
    for (const person of Object.values(row.survivors)) {
      const pod = h.state.entities.get(person.entityId);
      assert.ok(pod);
      pod.pos.set(ANCHOR.x, 0, ANCHOR.z);
      h.state.combat.attachments.byId[`rescue:${pod.id}`] = {
        id: `rescue:${pod.id}`, ownerId: h.state.playerId, targetId: pod.id, state: 'active',
      };
      h.state.player.tether = { active: true, targetId: pod.id };
      h.bus.emit('tether:latched', { ownerId: h.state.playerId, targetId: pod.id, type: 'tether' });
      assert.equal(person.outcome, 'rescued', 'only the native physical station handoff settles crew custody');
    }
    assert.equal(row.status, 'settled');
    h = saveAndContinue(h);
    const restored = h.state.player.custodyLedger.raidAftermath[row.key];
    assert.equal(restored.status, 'settled');
    assert.equal(restored.lines[0].returnedQty, initialQty);
    dock(h);
    assert.equal(h.state.missions.boards[STATION].slots.some((m) => m.source === 'custodyRecovery'), false);
  } finally { h.sim.dispose(); }
});

test('M01 seed 4242: partial freight return and later native carrier recovery add their separate portions', () => {
  const h = boot();
  try {
    const { live, pods, row, carrier, initialQty } = raid(h, false);
    dock(h);
    const offer = h.state.missions.boards[STATION].slots.find((m) => m.source === 'custodyRecovery');
    assert.equal(h.jobs.acceptMission(offer.id), true);
    const pod = pods[0];
    const pickup = { pickupId: pod.id, collectorId: h.state.playerId, kind: pod.data.kind,
      commodityId: pod.data.commodityId, amount: pod.data.amount, pos: { x: pod.pos.x, z: pod.pos.z } };
    h.bus.emit('pickup:collected', pickup);
    pod.alive = false;
    dock(h);
    const playerReturned = row.lines[0].returnedQty;
    assert.ok(playerReturned > 0);
    const record = live.data.freightCargoCustody;
    const hullReturned = record.carrierQty;
    h.bus.emit('freight:recovery', { id: `civilian-recovery:${record.manifestId}:recovered`, outcome: 'recovered',
      entityId: carrier.id, stationId: STATION, manifestId: record.manifestId, freighterKey: record.freighterKey,
      remainingQty: hullReturned, manifest: structuredClone(carrier.data.cargoManifest) });
    assert.equal(row.lines[0].qty, initialQty);
    assert.equal(row.lines[0].returnedQty, playerReturned + hullReturned);
    assert.equal(row.lines[0].qty - row.lines[0].returnedQty, initialQty - playerReturned - hullReturned);
  } finally { h.sim.dispose(); }
});

test('M01 seed 4242: Continue finds a living survivor by durable identity after its entity id changes', () => {
  let h = boot();
  try {
    const { row } = raid(h);
    const person = Object.values(row.survivors)[0];
    const oldPod = h.state.entities.get(person.entityId);
    const data = JSON.parse(JSON.stringify(oldPod.data));
    h = saveAndContinue(h);
    // Occupy the old number; the real save owner likewise allocates a new one on collision.
    h.sim.spawn({ id: person.entityId, type: 'ship', team: 2, pos: { ...ANCHOR }, data: { name: 'Unrelated hull' } });
    const restoredPod = h.sim.spawn({ type: oldPod.type, pos: { ...ANCHOR }, radius: 5, data });
    assert.notEqual(restoredPod.id, person.entityId);
    h.bus.emit('save:loaded', {});
    h.bus.emit('sector:enter', { sectorId: SECTOR, continuous: true, noTeleport: true });
    assert.equal(h.state.combatOutcome.aftermath.targets.rescue, restoredPod.id);
    assert.notEqual(h.state.combatOutcome.aftermath.targets.rescue, person.entityId);
  } finally { h.sim.dispose(); }
});

test('M01 seed 4242: escape/abort and lost survivors persist as an unsettled tail without reposting the opening raid', () => {
  let h = boot();
  try {
    const { row, initialQty } = raid(h);
    h.sim.registry.get('combatOutcome').update(1 / 60, h.state);
    h.bus.emit('combat:aftermathChoose', { choiceId: 'escape' });
    assert.equal(row.lastChoice, 'escape');
    dock(h);
    const offer = h.state.missions.boards[STATION].slots.find((m) => m.source === 'custodyRecovery');
    assert.equal(h.jobs.acceptMission(offer.id), true);
    const job = h.state.missions.active.find((m) => m.source === 'custodyRecovery');
    assert.equal(h.jobs.abandonMission(job.id), true);
    assert.equal(h.sim.registry.get('custodyConsequences').authorizesRecovery(row.lines[0].manifestId), false);
    assert.equal(row.status, 'open');
    assert.equal(row.lines[0].returnedQty, 0);
    // Crew expiry is a native terminal fact, not an automatic rescue on encounter completion.
    h.state.simTime = Math.max(...Object.values(h.state.survivorPod.causal.byEntityId).map((person) => person.expireAt)) + 1;
    h.state.ui.docked = false;
    h.sim.registry.get('survivorPod').update(1, h.state);
    assert.ok(Object.values(row.survivors).every((person) => person.outcome === 'abandoned'));
    h = saveAndContinue(h);
    const restored = h.state.player.custodyLedger.raidAftermath[row.key];
    assert.equal(restored.status, 'open');
    assert.equal(restored.lines[0].qty - restored.lines[0].returnedQty, initialQty);
    assert.ok(Object.values(restored.survivors).every((person) => person.outcome === 'abandoned'));
    dock(h);
    assert.ok(h.state.missions.boards[STATION].slots.some((m) => m.source === 'custodyRecovery'));
    assert.equal(Object.values(h.state.encounterDirector.live).filter((live) => live.shapeId === 'opening_hauler_raid').length, 0);
  } finally { h.sim.dispose(); }
});
