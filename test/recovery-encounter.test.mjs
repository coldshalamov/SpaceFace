import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { cargo } from '../src/systems/cargo.js';
import { recoveryEncounter, recoveryPowerSurprise } from '../src/systems/recoveryEncounter.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { recoveryCustodyView, recoveryStabilizationText } from '../src/ui/recoveryEncounterPrompt.js';
import { stationName } from '../src/ui/sectorLawPresenter.js';

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
    'recovery:defenseAwake', 'recovery:hazardCleared', 'recovery:completed', 'recovery:receipt', 'economy:grantCredits',
    'faction:repDelta', 'combat:hit', 'salvage:reactorBurst',
    'spawn:request',
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

test('custody guidance view preserves authoritative timers, cargo, destination, and phase verbs', () => {
  const state = { simTime: 100, entityList: [] };
  assert.equal(stationName(state, 'station_tethys'), 'Tethys Trade Hub');

  const civilian = recoveryCustodyView({
    id: 'civilian-recovery:fm_test:10', entityId: 9, label: 'MTS Relief Mule',
    recoveryKind: 'civilian_disabled', phase: 'awaiting_tether', deadlineAt: 175,
    remainingQty: 8, destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, state, state.simTime);
  assert.equal(civilian.status, 'WINDOW 75 S');
  assert.match(civilian.meta, /8 CARGO.*TETHYS TRADE HUB/i);
  assert.doesNotMatch(civilian.meta, /T\+|deadline/i);
  assert.match(civilian.detail, /Massline latch.*reel inside 60 WU/i);
  assert.match(civilian.ariaLabel, /75 seconds remaining/i);
  assert.doesNotMatch(civilian.detail, /\b[A-Z]\b|keyboard|controller/i);

  const surrendered = recoveryCustodyView({
    id: 'surrender:10', entityId: 10, label: 'Yielded Cutter', recoveryKind: 'surrendered',
    phase: 'tethered', escapeAt: 145, rewardCr: 180, destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, state, state.simTime);
  assert.equal(surrendered.status, 'ESCAPE 45 S');
  assert.match(surrendered.detail, /Line attached.*reel.*60 WU/i);

  const disabled = recoveryCustodyView({
    id: 'surrender:11', entityId: 11, label: 'Disabled Raider', recoveryKind: 'drive_disabled',
    phase: 'awaiting_tether', escapeAt: null, deadlineAt: null, destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, state, state.simTime);
  assert.equal(disabled.status, 'OPEN');
  assert.doesNotMatch(`${disabled.status} ${disabled.detail}`, /escape|deadline|\d+ S/i);

  const secured = recoveryCustodyView({
    ...civilian.source, phase: 'secured', deadlineAt: 160,
  }, state, state.simTime);
  assert.match(secured.detail, /Custody locked.*Tethys Trade Hub/i);
  assert.match(secured.detail, /tow/i);
});

test('custody guidance distinguishes relatch transitions from precise terminal receipts', () => {
  const state = { simTime: 120, entityList: [] };
  const relatch = recoveryCustodyView({
    id: 'surrender:12', entityId: 12, label: 'Yielded Cutter', recoveryKind: 'surrendered',
    phase: 'awaiting_tether', escapeAt: 160, destinationStationId: 'station_tethys', secureReel_wu: 60,
    instruction: 'Custody lock lost. Relatch before this ship escapes.',
  }, state, state.simTime);
  assert.equal(relatch.terminal, false);
  assert.match(relatch.detail, /Relatch/i);

  const lost = recoveryCustodyView({
    id: 'civilian-recovery:fm_test:10', entityId: 9, label: 'MTS Relief Mule',
    recoveryKind: 'civilian_disabled', phase: 'lost', lostReason: 'drive_restored',
    remainingQty: 8, destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, state, state.simTime);
  assert.equal(lost.terminal, true);
  assert.match(`${lost.headline} ${lost.detail}`, /drive restored/i);

  const receipt = recoveryCustodyView({
    id: 'civilian-recovery:fm_test:10:recovered', recoveryId: 'civilian-recovery:fm_test:10',
    shape: 'civilian_freight_recovery', outcome: 'recovered', recoveryKind: 'civilian_disabled',
    entityId: 9, stationId: 'station_tethys', remainingQty: 8, credits: 138,
    text: 'FREIGHT RECOVERED - civilian hull and remaining manifest transferred alive.',
  }, state, state.simTime);
  assert.equal(receipt.terminal, true);
  assert.match(receipt.headline, /FREIGHT RECOVERED/i);
  assert.match(receipt.meta, /138 CREDITS.*8 CARGO.*TETHYS TRADE HUB/i);
  assert.match(receipt.detail, /Receipt.*civilian-recovery:fm_test:10:recovered/i);
});

test('terminal and receipt custody views suppress every future deadline countdown', () => {
  const state = { simTime: 100, entityList: [] };
  for (const payload of [
    {
      id: 'civilian-recovery:released', recoveryKind: 'civilian_disabled', phase: 'lost',
      lostReason: 'released', deadlineAt: 175, remainingQty: 4, destinationStationId: 'station_tethys',
    },
    {
      id: 'civilian-recovery:broke', recoveryKind: 'civilian_disabled', phase: 'lost',
      lostReason: 'tether_broke', deadlineAt: 175, remainingQty: 4, destinationStationId: 'station_tethys',
    },
    {
      id: 'civilian-recovery:broke:tether_broke', recoveryId: 'civilian-recovery:broke',
      shape: 'civilian_freight_recovery', outcome: 'tether_broke', recoveryKind: 'civilian_disabled',
      deadlineAt: 175, remainingQty: 4, credits: 0,
    },
    {
      id: 'civilian-recovery:success:recovered', recoveryId: 'civilian-recovery:success',
      shape: 'civilian_freight_recovery', outcome: 'recovered', recoveryKind: 'civilian_disabled',
      deadlineAt: 175, remainingQty: 4, credits: 114, stationId: 'station_tethys',
    },
  ]) {
    const view = recoveryCustodyView(payload, state, state.simTime);
    assert.equal(view.terminal, true);
    assert.equal(view.remaining, null);
    assert.doesNotMatch(`${view.status} ${view.meta} ${view.detail} ${view.ariaLabel}`, /75 seconds|WINDOW 75|remaining/i);
  }
});

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

test('still-powered derelicts use the deterministic 10 percent and 60/40 trust contract', () => {
  const id = 'recovery:powered-1';
  let survivorSeed = null;
  let defenseSeed = null;
  let poweredCount = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const kind = recoveryPowerSurprise(seed, id);
    if (kind) poweredCount++;
    if (kind === 'survivor' && survivorSeed == null) survivorSeed = seed;
    if (kind === 'defense_drone' && defenseSeed == null) defenseSeed = seed;
  }
  assert.ok(poweredCount > 150 && poweredCount < 250, 'the deterministic deck stays near its exact 1-in-10 admission');
  assert.ok(survivorSeed != null && defenseSeed != null, 'both trust outcomes are reachable');

  const survivor = boot({ seed: survivorSeed, pointId: 'powered-1' });
  const survivorRecord = identify(survivor);
  assert.equal(survivorRecord.poweredSurprise, 'survivor');
  assert.equal(survivorRecord.hasSurvivor, true);
  assert.equal(events(survivor, 'spawn:request').length, 0);

  const defense = boot({ seed: defenseSeed, pointId: 'powered-1' });
  const defenseRecord = identify(defense);
  assert.equal(defenseRecord.poweredSurprise, 'defense_drone');
  assert.equal(defenseRecord.conditionLabel, 'POWERED DEFENSE · DRONE WAKE');
  const requests = events(defense, 'spawn:request');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.enemyTypeId, 'wasp_swarmer');
  assert.deepEqual(requests[0].payload.tags, ['derelict_defense', 'still_powered']);
  const awake = events(defense, 'recovery:defenseAwake');
  assert.equal(awake.length, 1);
  assert.match(recoveryStabilizationText(awake[0].payload), /helm control remains yours/);
  defense.bus.emit('scan:pulse', { pos: { ...defense.player.pos } });
  assert.equal(events(defense, 'spawn:request').length, 1, 'repeated pulses never duplicate the defense request');
  assert.equal(defense.system.serialize().records[defenseRecord.id].defenseTriggered, true);
});

test('telegraphed reactor hazard can fail durably without spawning an instant hostile', () => {
  const id = 'recovery:hazard-1';
  let seed = 1;
  while (seed < 5000) {
    const roll = hash32(seed, id, 'recovery-condition');
    if (!recoveryPowerSurprise(seed, id) && roll % 5 !== 1 && roll % 4 === 0) break;
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
  const registryOrder = ['salvageActions', 'survivorPod', 'recoveryEncounter', 'factions']
    .map((name) => registrySource.indexOf(`['${name}', ${name}]`));
  assert.equal(registryOrder.every((index) => index >= 0), true, 'all recovery authorities are registered');
  assert.deepEqual([...registryOrder].sort((a, b) => a - b), registryOrder,
    'recovery authorities retain salvage -> survivor -> encounter -> faction settlement order');
});
