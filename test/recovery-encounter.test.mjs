import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { cargo } from '../src/systems/cargo.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { salvageActions } from '../src/systems/salvageActions.js';

function boot({ seed = 4401, sourceKind = 'salvage', parentType = 'ship', cargoCap = 30, pointId = 'point-1' } = {}) {
  const sim = createSimulation({ seed, systems: [cargo, salvageActions, recoveryEncounter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.cargo.capVolume = cargoCap;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const wreck = sim.spawn({
    type: 'wreck', team: 2, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 1800, hull: 1, hullMax: 1,
    data: { parentType, salvagePointId: pointId, salvagePool: { cmdty_scrap_metal: 9 }, salvageTimeLeft: 8 },
  });
  state.salvage = { points: [{ id: pointId, sectorId: 'sector_ceres_belt', zoneId: 'zone-1', pos: { ...wreck.pos }, entityId: wreck.id, offered: false }], plannedSectorId: 'sector_ceres_belt' };
  sim.runTicks(1);
  const events = [];
  const watched = [
    'recovery:started', 'recovery:identified', 'recovery:readout', 'recovery:decisionReady', 'recovery:retryAvailable',
    'recovery:hazardCleared', 'recovery:completed', 'recovery:receipt', 'economy:grantCredits',
    'faction:repDelta', 'combat:hit', 'salvage:reactorBurst',
  ];
  for (const name of watched) bus.on(name, (payload) => events.push({ name, payload }));
  bus.emit('signal:investigated', {
    signalId: `signal:${pointId}`, sectorId: 'sector_ceres_belt', sourceKind, sourceId: wreck.id,
    entityId: wreck.id, pos: { ...wreck.pos }, classification: sourceKind === 'distress' ? 'DISTRESS SIGNAL' : 'DERELICT SALVAGE',
  });
  return { sim, state, bus, player, wreck, events, system: sim.registry.get('recoveryEncounter'), pointId };
}

function identify(t) {
  t.bus.emit('scan:pulse', { pos: { ...t.player.pos } });
  return t.state.recoveryEncounters.records[`recovery:${t.pointId}`];
}

function clearHazardIfNeeded(t, record) {
  if (record.phase === 'hazard') t.bus.emit('recovery:vent', { recoveryId: record.id });
  assert.notEqual(record.phase, 'hazard');
}

function stabilize(t, record) {
  t.state.player.tether = { active: true, targetId: t.wreck.id };
  t.sim.runTicks(155);
  assert.equal(record.phase, 'decision');
}

function events(t, name) {
  return t.events.filter((event) => event.name === name);
}

test('investigation binds one physical wreck, suppresses the dead mission offer, and requires a second close scan', () => {
  const t = boot();
  const record = t.state.recoveryEncounters.records[`recovery:${t.pointId}`];
  assert.ok(record);
  assert.equal(record.entityId, t.wreck.id);
  assert.equal(record.phase, 'awaiting_scan');
  assert.equal(t.state.salvage.points[0].offered, true);
  assert.equal(t.wreck.data.salvagePool && Object.keys(t.wreck.data.salvagePool).length, 0,
    'generic mining cannot bypass the unresolved choice');
  assert.equal(events(t, 'recovery:started').length, 1);

  t.player.pos.x = -400;
  t.bus.emit('scan:pulse', { pos: { ...t.player.pos } });
  assert.equal(record.phase, 'awaiting_scan', 'far pulse does not identify the wreck');
  t.player.pos.x = 0;
  identify(t);
  assert.equal(record.scanned, true);
  assert.ok(record.conditionLabel);
  assert.ok(record.ownership);
  assert.match(record.legalStatus, /open|claimed|restricted/);
});

test('tether stabilization and black-box settlement grant cargo/credits/rep exactly once', () => {
  const t = boot();
  const record = identify(t);
  clearHazardIfNeeded(t, record);
  stabilize(t, record);
  t.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'blackbox' });
  assert.equal(record.phase, 'completed');
  assert.equal(t.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(events(t, 'economy:grantCredits').length, 1);
  assert.equal(events(t, 'faction:repDelta').length, 1);
  assert.equal(events(t, 'recovery:receipt').length, 1);
  assert.ok(t.state.recoveryEncounters.outcomes[record.id]);

  t.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'blackbox' });
  assert.equal(t.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(events(t, 'economy:grantCredits').length, 1);
  assert.equal(events(t, 'faction:repDelta').length, 1);
});

test('matched-speed station keeping is a complete alternative to tether stabilization', () => {
  const t = boot({ pointId: 'hold-1' });
  const record = identify(t);
  clearHazardIfNeeded(t, record);
  t.player.pos.x = 40;
  t.player.vel = { x: 1, z: 0 };
  t.wreck.vel = { x: 1, z: 0 };
  t.state.player.tether = { active: false, targetId: null };
  t.sim.runTicks(155);
  assert.equal(record.phase, 'decision');
  assert.equal(record.stabilizationMode, 'station_keeping');
});

test('cargo-full recovery is retryable and partial grants are never duplicated', () => {
  const t = boot({ cargoCap: 1 });
  const record = identify(t);
  clearHazardIfNeeded(t, record);
  stabilize(t, record);
  t.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'strip' });
  assert.equal(record.phase, 'decision');
  assert.equal(record.retryReason, 'cargo_full');
  assert.equal(events(t, 'recovery:retryAvailable').length, 1);
  assert.equal(events(t, 'economy:grantCredits').length, 0);
  const firstCargo = { ...t.state.player.cargo.items };

  t.state.player.cargo.capVolume = 20;
  t.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'strip' });
  assert.equal(record.phase, 'completed');
  assert.equal(t.state.player.cargo.items.cmdty_salvage_electronics, 2);
  assert.equal(t.state.player.cargo.items.cmdty_scrap_metal, 2);
  assert.ok(Object.keys(firstCargo).length >= 1, 'first attempt retained the cargo units that fit');
  assert.equal(events(t, 'economy:grantCredits').length, 1);
});

test('distress rescue and restricted stripping have intentional, distinct faction consequences', () => {
  const rescue = boot({ sourceKind: 'distress', pointId: 'distress-1' });
  const rescueRecord = identify(rescue);
  assert.equal(rescueRecord.hasSurvivor, true);
  stabilize(rescue, rescueRecord);
  rescue.bus.emit('recovery:choose', { recoveryId: rescueRecord.id, choice: 'rescue' });
  assert.equal(events(rescue, 'faction:repDelta')[0].payload.delta, 12);
  assert.equal(events(rescue, 'recovery:receipt')[0].payload.outcome, 'rescue');

  const strip = boot({ parentType: 'military', pointId: 'restricted-1' });
  const stripRecord = identify(strip);
  clearHazardIfNeeded(strip, stripRecord);
  stabilize(strip, stripRecord);
  assert.equal(stripRecord.legalStatus, 'restricted');
  strip.bus.emit('recovery:choose', { recoveryId: stripRecord.id, choice: 'strip' });
  assert.equal(events(strip, 'faction:repDelta')[0].payload.delta, -12);
  assert.equal(events(strip, 'recovery:receipt')[0].payload.outcome, 'strip');
});

test('telegraphed reactor hazard can fail durably without spawning an instant hostile', () => {
  const id = 'recovery:hazard-1';
  let seed = 1;
  while (seed < 5000) {
    const roll = hash32(seed, id, 'recovery-condition');
    if (roll % 5 !== 1 && roll % 4 === 0) break;
    seed++;
  }
  const t = boot({ seed, pointId: 'hazard-1' });
  const record = identify(t);
  assert.equal(record.phase, 'hazard');
  assert.equal(record.hazard, 'reactor_leak');
  assert.ok(record.hazardDueAt > t.state.simTime);
  t.sim.runTicks(730);
  assert.equal(record.phase, 'failed');
  assert.equal(events(t, 'salvage:reactorBurst').length, 1);
  assert.equal(events(t, 'recovery:receipt')[0].payload.failure, 'reactor_burst');
  assert.equal(events(t, 'economy:grantCredits').length, 0);
  assert.equal(events(t, 'faction:repDelta').length, 0);
  assert.equal(t.state.entityList.filter((entity) => entity.type === 'ship' && entity.id !== t.player.id).length, 0,
    'hazard never creates a hostile actor');
});

test('save sidecar preserves an in-progress decision and rebinds a new entity id by stable point id', () => {
  const a = boot({ seed: 902, pointId: 'persist-1' });
  const recordA = identify(a);
  clearHazardIfNeeded(a, recordA);
  stabilize(a, recordA);
  const saved = a.system.serialize();
  assert.equal(saved.records[recordA.id].phase, 'decision');
  assert.equal(saved.records[recordA.id].entityId, null);
  assert.equal('_lastReadoutSignature' in saved.records[recordA.id], false, 'runtime presentation dedupe is not persisted');

  const b = boot({ seed: 902, pointId: 'persist-1' });
  const oldNewEntityId = b.wreck.id;
  b.system.deserialize(saved);
  b.bus.emit('salvage:placed', { sectorId: 'sector_ceres_belt', count: 1 });
  const recordB = b.state.recoveryEncounters.records[recordA.id];
  assert.equal(recordB.phase, 'decision');
  assert.equal(recordB.entityId, oldNewEntityId);
  assert.equal(b.state.salvage.points[0].offered, true);
  assert.equal(b.wreck.data.recoveryEncounterId, recordB.id);
  b.sim.runTicks(1);
  assert.ok(events(b, 'recovery:readout').some((event) => event.payload.phase === 'decision'),
    'decision prompt resumes on the first post-load flight tick');
});

test('save and registry wiring preserve semantic sidecars before world rebuild', () => {
  const saveSource = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  const salvageSource = readFileSync(new URL('../src/systems/salvage.js', import.meta.url), 'utf8');
  const registrySource = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(saveSource, /data\.recoveryEncounters\s*=\s*this\._callSerialize\('recoveryEncounter'\)/);
  assert.match(saveSource, /this\._callDeserialize\('recoveryEncounter',\s*data\.recoveryEncounters\)/);
  assert.match(salvageSource, /bus\.on\('save:restoring'/);
  assert.doesNotMatch(salvageSource, /bus\.on\('save:loaded'[\s\S]{0,180}salvage\.points\s*=\s*\[\]/);
  assert.match(registrySource, /salvageActions, survivorPod, recoveryEncounter, factions/);
});
