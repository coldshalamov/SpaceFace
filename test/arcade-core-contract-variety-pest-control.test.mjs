import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  PEST_CONTROL_ARCHETYPE_ID,
  PEST_CONTROL_FOLLOWUP_SOURCE,
  PEST_CONTROL_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { combat } from '../src/systems/combat.js';
import { missions } from '../src/systems/missions.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';

function makeHarness(seed) {
  const sim = createSimulation({ seed, systems: [combat, missions], updateOrder: [missions] });
  const { state } = sim;
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = BOARD_SECTOR_ID;
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 20, hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  return { sim, state, bus: sim.bus, player, missions: sim.registry.get('missions') };
}

function pestOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === PEST_CONTROL_VARIANT_ID
      && offer.source !== PEST_CONTROL_FOLLOWUP_SOURCE
  ));
}

function findPestSeed() {
  for (let seed = 1; seed <= 128; seed++) {
    const harness = makeHarness(seed);
    const offer = pestOffer(harness);
    harness.sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Pest Control offer');
}

function enterTargetSector(harness, mission) {
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
}

function pestFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === PEST_CONTROL_FOLLOWUP_SOURCE);
}

function assertPhysicalWaspPack(harness, mission) {
  assert.equal(mission.targetEntityIds.length, mission.objectiveTarget);
  for (const id of mission.targetEntityIds) {
    const target = harness.state.entities.get(id);
    assert.ok(target && target.alive !== false);
    assert.equal(target.data.defId, 'ship_wasp');
    assert.equal(target.data.ai.archetype, 'swarmer');
    assert.equal(target.data.missionTag, mission.id);
    assert.equal(mission.params.pestControl.archetypeId, PEST_CONTROL_ARCHETYPE_ID);
  }
}

function destroyThroughCombat(harness, mission) {
  for (const id of [...mission.targetEntityIds]) {
    const target = harness.state.entities.get(id);
    harness.bus.emit('projectile:hit', {
      targetId: id,
      ownerId: harness.player.id,
      damage: 100000,
      damageType: 'kinetic',
      penetration: 1,
      pos: { x: target.pos.x, z: target.pos.z },
    });
    assert.equal(target.alive, false, 'combat owns the lethal hull mutation');
  }
}

test('ordinary Pest Control clears a physical wasp pack and a missed nest spreads into one recoverable follow-on', (t) => {
  const seed = findPestSeed();
  const success = makeHarness(seed);
  const replay = makeHarness(seed);
  t.after(() => { success.sim.dispose(); replay.sim.dispose(); });

  const offer = pestOffer(success);
  const deterministicReplay = pestOffer(replay);
  assert.ok(offer, 'ordinary Contracts board exposes the variant before acceptance');
  assert.equal(offer.id, deterministicReplay.id);
  assert.equal(offer.title, deterministicReplay.title);
  assert.match(offer.title, /^Pest Control — Wasp Nest near /);
  assert.match(offer.brief, /wasp nest is eating .*'s yield/i);
  assert.equal(offer.type, 'patrol_clear');
  assert.ok(offer.duration_s > 0, 'the advertised spread deadline is a real mission deadline');

  assert.equal(success.missions.acceptMission(offer.id), true);
  const cleared = success.state.missions.active.find((row) => row.variantId === PEST_CONTROL_VARIANT_ID);
  enterTargetSector(success, cleared);
  assertPhysicalWaspPack(success, cleared);
  destroyThroughCombat(success, cleared);

  assert.equal(success.state.missions.active.some((row) => row.id === cleared.id), false);
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === cleared.id)?.outcome, 'completed');
  assert.equal(pestFollowups(success.state).length, 0);

  const failed = makeHarness(seed);
  t.after(() => failed.sim.dispose());
  const missedOffer = pestOffer(failed);
  assert.equal(failed.missions.acceptMission(missedOffer.id), true);
  const missed = failed.state.missions.active.find((row) => row.variantId === PEST_CONTROL_VARIANT_ID);
  enterTargetSector(failed, missed);
  assertPhysicalWaspPack(failed, missed);
  const firstGenerationCount = missed.objectiveTarget;
  failed.state.simTime = missed.deadline_s;
  failed.sim.runTicks(1, SIM_DT);

  assert.equal(failed.state.missions.active.some((row) => row.id === missed.id), false);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === missed.id)?.outcome, 'expired');
  assert.equal(pestFollowups(failed.state).length, 1);
  const spreadOffer = pestFollowups(failed.state)[0];
  assert.match(spreadOffer.title, /^Pest Control — Nest Spillover near /);
  assert.equal(spreadOffer.params.pestControl.generation, 1);
  assert.ok(spreadOffer.params.clearCount > firstGenerationCount,
    'the missed nest mutates into a larger physical pack');

  const saved = structuredClone(failed.missions.serialize());
  const restored = makeHarness(seed);
  t.after(() => restored.sim.dispose());
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(pestFollowups(restored.state).length, 1,
    'save/load and an ordinary epoch refresh retain exactly one causal follow-on');

  const restoredOffer = pestFollowups(restored.state)[0];
  assert.equal(restored.missions.acceptMission(restoredOffer.id), true);
  const spread = restored.state.missions.active.find((row) => row.source === PEST_CONTROL_FOLLOWUP_SOURCE);
  enterTargetSector(restored, spread);
  assertPhysicalWaspPack(restored, spread);
  destroyThroughCombat(restored, spread);

  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === spread.id)?.outcome, 'completed');
  assert.equal(pestFollowups(restored.state).length, 0,
    'the accepted follow-on leaves the board and cannot create a duplicate generation');
});
