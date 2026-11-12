// pockets-review-fixes R04/R05 — a pocket must never promise an economy event that cannot
// happen, and a hull described as another faction's must fly that faction's colours.
//
// R04: every lived-frontier slot that still advertises a receiptType is driven through the
// real kernel (npcJobs.advance) and the completing intent is handed to the real traffic
// consumer over the bus; the advertised event (freight:arrival / mining:npcExtraction) must
// actually move. Miners are given one real same-field rock at their field mark, so only the
// contract can fail — never the fixture.
//
// R05: the Io Concord picket, killed as a witnessed player kill on the real factions owner,
// must cost Concord standing without costing Free Frontier any; and a restored hull whose
// durable record still carries the old sector colours must be re-stamped to its authored
// faction on re-entry.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVED_FRONTIER_SETS,
  activityPocketById,
} from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { traffic } from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { advance } from '../src/systems/npcJobs.js';

const SEED = 4242;
const SYSTEMS = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];

function enterSector(sectorId) {
  const sim = createSimulation({ seed: SEED, systems: SYSTEMS });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  for (const station of SECTOR_ANCHORS[sectorId].stations) {
    sim.spawn({
      type: 'station', team: 2, pos: sectorLocalToGlobalForSector(station.pos, sectorId),
      radius: 42, mass: 1e6, data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, sectorId),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };
  bus.emit('sector:enter', { sectorId, sector: SECTORS.find((s) => s.id === sectorId) });
  sim.runTicks(60);
  return { sim, state, bus, player };
}

function castBySlot(state, sectorId) {
  const bySlot = new Map();
  for (const entity of state.entityList) {
    if (!entity.alive || !entity.data?.authoredActivityCast || entity.homeSectorId !== sectorId) continue;
    bySlot.set(entity.data.activityActorSlotId, entity);
  }
  return bySlot;
}

/** One real rock of the miner's own field, sitting on its authored field mark. */
function spawnFieldRock({ state, sim }, slot, sectorId) {
  const fieldMark = slot.route.marks.find((m) => String(m.targetRef).startsWith('field:'));
  assert.ok(fieldMark, `${slot.id}: an extraction receipt needs a field mark`);
  const pocket = activityPocketById(slot.pocketId);
  const pos = sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + fieldMark.offset.x,
    z: pocket.activityAnchor.localPos.z + fieldMark.offset.z,
  }, sectorId);
  return sim.spawn({
    type: 'asteroid', pos, radius: 12, mass: 1000,
    data: { fieldId: fieldMark.targetRef.slice('field:'.length), commodityId: 'cmdty_ore_iron', yieldU: 10 },
  });
}

const RECEIPT_SECTORS = Object.entries(LIVED_FRONTIER_SETS)
  .filter(([, set]) => set.pockets.flatMap((p) => p.actorSlots).some((s) => s.route.receiptType))
  .map(([sectorId]) => sectorId);

for (const sectorId of RECEIPT_SECTORS) {
  test(`seed 4242: every advertised receipt in ${sectorId} fires through the real consumer`, () => {
    const set = LIVED_FRONTIER_SETS[sectorId];
    const advertised = set.pockets.flatMap((p) => p.actorSlots).filter((s) => s.route.receiptType);
    assert.ok(advertised.length > 0, `${sectorId}: this suite only visits sectors that advertise`);
    const ctx = enterSector(sectorId);
    const { state, bus } = ctx;
    let arrivals = 0;
    let extractions = 0;
    bus.on('freight:arrival', () => arrivals++);
    bus.on('mining:npcExtraction', () => extractions++);
    const bySlot = castBySlot(state, sectorId);
    for (const slot of advertised) {
      const entity = bySlot.get(slot.id);
      assert.ok(entity, `${slot.id}: authored hull is live`);
      assert.ok(entity.data.jobId, `${slot.id}: flying a real job`);
      if (slot.route.receiptType === 'mining:npcExtraction') spawnFieldRock(ctx, slot, sectorId);
      const entry = state.npcJobs.byId[entity.data.jobId];
      assert.ok(entry?.job, `${slot.id}: kernel job is registered`);
      const before = slot.route.receiptType === 'freight:arrival' ? arrivals : extractions;
      const completing = slot.route.receiptType === 'freight:arrival' ? 'npcjobs:unload' : 'npcjobs:work';
      const intents = advance(entry.job, 300)
        .filter((intent) => intent.completed && intent.event === completing);
      assert.ok(intents.length > 0, `${slot.id}: the kernel reaches its completing step`);
      for (const intent of intents) bus.emit(intent.event, intent);
      const after = slot.route.receiptType === 'freight:arrival' ? arrivals : extractions;
      assert.ok(after > before,
        `${slot.id}: advertised ${slot.route.receiptType} must move its counter (${before} -> ${after})`);
    }
    ctx.sim.dispose();
  });
}

test('seed 4242: killing the Concord picket costs Concord, never Free Frontier', () => {
  const { sim, state, bus, player } = enterSector('sector_io_reach');
  const picket = castBySlot(state, 'sector_io_reach').get('io_cruiser_picket');
  assert.ok(picket, 'the picket is live');
  assert.equal(picket.factionId, 'faction_scn', 'the picket flies Concord colours');
  state.factions.faction_free = { ...state.factions.faction_free, rep: 0, tier: 'Neutral' };
  state.factions.faction_scn = { ...state.factions.faction_scn, rep: 0, tier: 'Neutral' };
  bus.emit('entity:killed', {
    id: picket.id, type: 'ship', factionId: picket.factionId, killerId: player.id,
    victimClass: 'fighter', witnessed: true, pos: picket.pos,
  });
  const free = state.factions.faction_free.rep;
  const scn = state.factions.faction_scn.rep;
  assert.ok(free >= 0, `Free Frontier must not pay for a Concord kill (rep ${free})`);
  assert.ok(scn < 0, `Concord must pay for its own picket, not be rewarded (rep ${scn})`);
  sim.dispose();
});

test('seed 4242: a restored picket is re-stamped to its authored faction', () => {
  const { sim, state, bus } = enterSector('sector_io_reach');
  const before = castBySlot(state, 'sector_io_reach').get('io_cruiser_picket');
  assert.ok(before, 'the picket is live');
  const recordId = before.data.worldRecordId;
  // An old durable record still wearing the sector's colours.
  before.factionId = 'faction_free';
  before.data.factionId = 'faction_free';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach', sector: SECTORS.find((s) => s.id === 'sector_io_reach') });
  sim.runTicks(1);
  const restored = state.entityList.find((e) => e.data?.worldRecordId === recordId);
  assert.ok(restored, 'the same durable hull is still live');
  assert.equal(restored.factionId, 'faction_scn', 're-stamp restores the authored colours');
  assert.equal(restored.data.factionId, 'faction_scn', 'the durable record agrees after re-stamp');
  sim.dispose();
});
