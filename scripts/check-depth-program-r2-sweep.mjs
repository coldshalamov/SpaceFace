// R2 acceptance receipt: drive every authored wreck through the shipped
// rumor -> bearing -> scan -> salvage -> claim seams on an isolated test save.
// This is deterministic gameplay evidence, not a substitute for the 12 required live screenshots.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { movingRadiationGate, rewardDescriptors } from '../src/core/uniqueWreckComplications.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ships } from '../src/systems/ships.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, '.devshots/depth-program/r2-sweep-playtest.json');
const BASE_SEED = 48200;

function openRadiationWindow(state, record, def) {
  if (!String(def.hazardContext?.approachGate || '').includes('moving')) return;
  for (let simTime = 0; simTime <= 900; simTime += 1) {
    state.simTime = simTime;
    if (movingRadiationGate(state, record, def).allowed) return;
  }
  assert.fail(`${def.programSlot} has no deterministic moving-radiation opening`);
}

function liveWreck(state, wreckId) {
  return state.entityList.find((entity) => entity?.alive !== false
    && entity?.data?.uniqueWreckId === wreckId) || null;
}

function primarySource(def) {
  return def.rumorSources.find((source) => source.sourceRef === def.bearingSourceRef);
}

function sweepOne(def, index) {
  const sim = createSimulation({
    seed: BASE_SEED + index,
    systems: [encounterDirector, uniqueWrecks, cargo, ships],
  });
  const { state, bus } = sim;
  const encounterRequests = [];
  const rewardEvents = [];
  const phaseTrail = [];
  try {
    state.mode = 'flight';
    state.world.currentSectorId = def.sectorId;
    state.player.cargo.capVolume = 1000;
    state.player.cargo.capMass = 1e9;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 10,
      hull: 100,
      hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [] },
    });
    state.playerId = player.id;
    bus.on('uniqueWreck:encounterRequested', (payload) => encounterRequests.push(payload));
    bus.on('uniqueWreck:storyRewardGranted', (payload) => rewardEvents.push(payload));

    const source = primarySource(def);
    assert.ok(source, `${def.programSlot} primary rumor source`);
    assert.equal(state.player.uniqueWrecks?.bearings?.[def.id], undefined,
      `${def.programSlot} starts unread`);
    bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
      wreckId: def.id,
      authoredWreckId: def.id,
      sourceRef: source.sourceRef,
      channelId: source.channelId,
    });
    const record = state.player.uniqueWrecks.bearings[def.id];
    assert.ok(record, `${def.programSlot} rumor records a bearing`);
    phaseTrail.push(record.phase);
    assert.equal(record.coordSpace, 'global_v1');
    assert.ok(record.radius > 0, `${def.programSlot} begins as a fuzzy region`);

    if (def.scanRequirement) {
      state.player.moduleInventory.push({
        instanceId: `r2-sweep:${def.programSlot}:${def.scanRequirement}`,
        defId: def.scanRequirement,
      });
    }
    openRadiationWindow(state, record, def);
    bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    assert.equal(record.phase, 'fixed', `${def.programSlot} scan hardens its bearing`);
    phaseTrail.push(record.phase);
    assert.deepEqual(record.fixedPos, record.exactPos);

    const wreck = liveWreck(state, def.id);
    assert.ok(wreck, `${def.programSlot} materializes on the default sim path`);
    assert.deepEqual({ x: wreck.pos.x, z: wreck.pos.z }, record.exactPos);
    bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    assert.equal(record.phase, 'decision', `${def.programSlot} salvage opens its authored choice`);
    phaseTrail.push(record.phase);

    const choice = def.decision.choices.find((candidate) => candidate.uniqueDrop);
    assert.ok(choice, `${def.programSlot} has a unique-claim branch`);
    bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: choice.id });
    assert.equal(record.phase, 'salvaged', `${def.programSlot} resolves without a dead end`);
    phaseTrail.push(record.phase);

    const rewards = rewardDescriptors(def);
    for (const reward of rewards) {
      if (reward.kind === 'module' || reward.kind === 'weapon') {
        assert.equal(
          state.player.moduleInventory.filter((item) => item?.defId === reward.id).length,
          1,
          `${def.programSlot}/${reward.id} is singular`,
        );
      } else if (reward.kind === 'story_commodity' || reward.kind === 'story_data') {
        assert.equal(state.player.flags[reward.flagKey], true, `${def.programSlot}/${reward.id} is durable`);
      }
    }

    return {
      slot: def.programSlot,
      wreckId: def.id,
      name: def.name,
      sectorId: def.sectorId,
      rumor: { channelId: source.channelId, sourceRef: source.sourceRef },
      bearing: {
        coordSpace: record.coordSpace,
        radius: record.radius,
        fixedPos: record.fixedPos,
      },
      phaseTrail,
      choiceId: choice.id,
      rewardIds: rewards.map((reward) => reward.id),
      encounterIds: encounterRequests.map((request) => request.encounterId),
      storyRewardEventIds: rewardEvents.map((event) => event.rewardId),
      gentleNoCombat: def.programSlot === 'D10' ? encounterRequests.length === 0 : null,
      result: 'salvaged',
    };
  } finally {
    sim.dispose();
  }
}

assert.equal(UNIQUE_WRECKS.length, 12, 'R2 sweep remains a twelve-wreck contract');
const rows = UNIQUE_WRECKS.map(sweepOne);
assert.equal(rows.every((row) => row.result === 'salvaged'), true);
assert.equal(rows.find((row) => row.slot === 'D10')?.gentleNoCombat, true,
  'the teaching wreck completes without a combat request');

const report = {
  schemaVersion: 1,
  program: 'SpaceFace Depth Program R2',
  coordinateSchema: 'global_v1',
  seedBase: BASE_SEED,
  count: rows.length,
  result: 'passed',
  rows,
};
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`R2 sweep OK: ${rows.length}/12 wrecks reached, fixed, salvaged, and claimed.`);
console.log(`Evidence: ${OUTPUT}`);
