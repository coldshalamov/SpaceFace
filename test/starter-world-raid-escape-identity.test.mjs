// Flying on leaves the raiders in the world. One of them keeps a name the save can read,
// and a new game does not keep that person. Defending the barge names nobody.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { aftermathWrecks, causalAftermathForSector } from '../src/systems/aftermathWrecks.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { runtime as openingRaid } from '../src/data/encounters/344-opening-hauler-raid.js';

const SECTOR = 'sector_helios_prime';

function loadedCarrierSpec(pos, qty) {
  return {
    type: 'ship', team: 2, factionId: 'faction_scn', pos, vel: { x: 0, z: 0 },
    hull: 120, hullMax: 120, radius: 9,
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

function fireOpeningRaid(seed) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, encounterDirector, aftermathWrecks, aceMemory],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const carrier = sim.spawn(loadedCarrierSpec({ x: 40, z: 30 }, 4));
  const raidPlan = planEncounters(seed, SECTOR, 0, zonesForSector(SECTOR))
    .find((it) => it.shapeId === 'opening_hauler_raid');
  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30;
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120);
  const live = Object.values(dir.live).find((row) => row.shapeId === 'opening_hauler_raid');
  return { sim, state, bus, carrier, live, director: sim.registry.get('encounterDirector') };
}

function promotedHulls(state) {
  return (state.entityList || []).filter((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.promotedPilot);
}

function promotedRecords(memory) {
  return Object.entries(memory || {})
    .filter(([, rec]) => rec && typeof rec === 'object' && rec.promoted === true);
}

describe('opening raid escape identity', { concurrency: false }, () => {
  test('a living named raider cannot duplicate into a return crew, while a recycled hull id cannot defer them', () => {
    const {sim, state, live, director} = fireOpeningRaid(4242);
    try {
      live.deadlineAt = state.simTime;
      openingRaid.tick(director, live, state, state.simTime);
      const hull = promotedHulls(state)[0];
      const [pilotId, rec] = promotedRecords(state.aceMemory)[0];
      const ace = sim.registry.get('aceMemory');
      state.simTime = rec.returnAt + 1;
      const count = state.entities.size;
      ace._processReturns(state);
      assert.equal(state.entities.size, count, 'their original live hull still owns the identity');
      assert.equal(rec.returnScheduled, true); assert.notEqual(rec.returned, true);
      assert.equal(rec.nextReturnAttemptAt, state.simTime + 10);
      // Leave the original physical hull, then reuse only its numeric id for somebody else.
      state.entities.delete(hull.id);
      state.entityList = state.entityList.filter(e => e.id !== hull.id);
      const stranger = {id: hull.id, type: 'ship', alive: true, pos: {x: 1, z: 1}, data: {}};
      state.entities.set(stranger.id, stranger); state.entityList.push(stranger);
      state.simTime = rec.nextReturnAttemptAt;
      ace._processReturns(state);
      assert.equal(rec.returnScheduled, false);
      assert.equal(rec.returned, true);
      assert.ok(rec.activeReturnIds.length > 0, 'a genuine later encounter fields the promoted pilot');
      const boss = rec.activeReturnIds.map(id => state.entities.get(id)).find(e => e?.data?.aceMemory?.role === 'boss');
      assert.equal(boss.data.aceMemory.aceId, pilotId);
    } finally { sim.dispose(); }
  });
  test('flying on names one living raider, and the name survives save but not New Game', () => {
    const { sim, state, bus, carrier, live, director } = fireOpeningRaid(4242);
    assert.ok(live && live.data.adoptedCarrier);
    const fingerprint = live.causality.fingerprint;
    const toasts = [];
    const headlines = [];
    bus.on('toast', (payload) => toasts.push(payload));
    bus.on('news:headline', (payload) => headlines.push(payload));
    live.deadlineAt = state.simTime;
    openingRaid.tick(director, live, state, state.simTime);
    assert.equal(live.outcome, 'raid_over');
    assert.equal(carrier.alive, true);
    assert.equal(carrier.data.promotedPilot, undefined, 'the barge is not the person who got away');
    assert.equal(carrier.data.encounterFingerprint, undefined);

    const named = promotedHulls(state);
    assert.equal(named.length, 1, 'one raider wears the minted name');
    const hull = named[0];
    assert.equal(hull.team, 1);
    assert.equal(hull.data.ai.encounterRole, 'raider');
    assert.equal(hull.data.encounterFingerprint, fingerprint);
    assert.equal(hull.data.name, hull.data.promotedPilot.name);
    assert.equal(hull.data.promotedPilot.grudgeKey, 'escaped');

    const records = promotedRecords(state.aceMemory);
    assert.equal(records.length, 1);
    const [pilotId, rec] = records[0];
    assert.equal(pilotId, hull.data.promotedPilot.id);
    assert.equal(rec.name, hull.data.name);
    assert.equal(rec.fled, true);
    assert.equal(rec.defeated, false);
    assert.equal(rec.returnScheduled, true);
    assert.equal(rec.lastSectorId, SECTOR);
    assert.ok(rec.returnAt > state.simTime);
    const cause = causalAftermathForSector(state, SECTOR)[0];
    assert.equal(cause.fingerprint, fingerprint);
    assert.equal(cause.outcome, 'raid_over');
    assert.equal(cause.remedyType, 'patrol_clear');
    assert.equal(cause.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(toasts.some((row) => row && String(row.text || '').includes('got away')), false);
    assert.equal(headlines.some((row) => row && row.aceId === pilotId && row.kind === 'ace-fled'), true);

    const ace = sim.registry.get('aceMemory');
    const saved = JSON.parse(JSON.stringify(ace.serialize()));
    ace.newGame();
    assert.equal(promotedRecords(state.aceMemory).length, 0);
    ace.deserialize(saved);
    const restored = state.aceMemory[pilotId];
    assert.equal(restored.promoted, true);
    assert.equal(restored.name, hull.data.name);
    assert.equal(restored.fled, true);
    assert.equal(restored.returnScheduled, true);
    assert.equal(restored.lastSectorId, SECTOR);

    const reusedId = hull.id;
    resetFreshRunSystems(sim.registry);
    assert.equal(promotedRecords(state.aceMemory).length, 0, 'New Game drops the person');
    state.entities.delete(reusedId);
    state.entityList = state.entityList.filter((entity) => entity.id !== reusedId);
    const stranger = {
      id: reusedId,
      type: 'ship',
      alive: true,
      team: 1,
      pos: { x: 12, z: 8 },
      data: { ai: { doctrine: 'thief', encounterRole: 'raider' } },
    };
    state.entities.set(reusedId, stranger);
    state.entityList.push(stranger);
    assert.equal(stranger.data.promotedPilot, undefined);
    assert.equal(state.aceMemory[pilotId], undefined, 'the recycled id does not resurrect the record');
    sim.dispose();
  });

  test('defending the barge does not mint a raider who is already dead', () => {
    const { sim, state, carrier, live, director } = fireOpeningRaid(8008);
    for (const id of live.ids) {
      const entity = state.entities.get(id);
      if (entity && entity.id !== carrier.id) entity.alive = false;
    }
    openingRaid.tick(director, live, state, state.simTime);
    assert.equal(live.outcome, 'defended');
    assert.equal(promotedHulls(state).length, 0);
    assert.equal(promotedRecords(state.aceMemory).length, 0);
    sim.dispose();
  });
});
