// FIGHT-15: clearing a live raid's escort wing flips the surviving raiders onto the loot sweep.
// Seed 4242. The curtain convoy is an existing raid — one point-defense screen and the raiders
// behind it. Positive: destroy that screen and every living raider takes the jackal wake, the
// tactical-AI doctrine that prefers cargo and wrecks. Quiet: while the screen is still up,
// destroying one raider leaves the others on their attack doctrine.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });
const SEED = 4242;
const ENCOUNTER_ID = 'fight15:curtain';

function boot() {
  const systems = [combat, surrenderRecovery, cargo, spawnBudget, encounterDirector, actions];
  const sim = createSimulation({ seed: SEED, systems });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Tethys Hub' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 200, hullMax: 200,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  return { sim, state, player, director: sim.registry.get('encounterDirector') };
}

function fireRaid(h) {
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy', encounterId: ENCOUNTER_ID, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId: ENCOUNTER_ID });
  const live = h.state.encounterDirector.live[ENCOUNTER_ID];
  assert.ok(live, 'the curtain raid is live');
  assert.equal(live.plan.predation && live.plan.predation.enabled, true, 'the curtain is a live raid');
  return live;
}

function doctrineOf(entity) {
  const ai = entity && entity.data && entity.data.ai;
  return ai && ai.combatDoctrineId || null;
}

function isEscortWing(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  if (data.lootTableId === 'pd_screen_escort') return true;
  return doctrineOf(entity) === CombatDoctrineId.ESCORT_SCREEN;
}

function livingRaiders(h, live) {
  return h.director.entsOf(live, 'raider');
}

function kill(h, entity) {
  h.sim.registry.get('combat').kill(entity, h.player.id);
}

test('destroying the escort wing of a live raid puts the surviving raiders on the loot sweep', () => {
  const h = boot();
  const live = fireRaid(h);
  const raiders = livingRaiders(h, live);
  const escorts = raiders.filter(isEscortWing);
  const strikers = raiders.filter((entity) => !isEscortWing(entity));
  assert.equal(escorts.length, 1, 'seed 4242 fields one escort screen on the raid');
  assert.ok(strikers.length >= 1, 'raiders remain behind the screen');
  const before = strikers.map((entity) => doctrineOf(entity));
  assert.ok(before.some((id) => id !== CombatDoctrineId.MINE_LAYER_WAKE),
    'the raiders are still pressing, not sweeping the spill');

  kill(h, escorts[0]);
  assert.equal(escorts[0].alive, false);

  const survivors = livingRaiders(h, live).filter((entity) => !isEscortWing(entity));
  assert.equal(survivors.length, strikers.length, 'the raiders stay on the field');
  for (const entity of survivors) {
    assert.equal(doctrineOf(entity), CombatDoctrineId.MINE_LAYER_WAKE,
      'clearing the escort wing flips each survivor onto the loot sweep');
  }
  assert.ok(survivors.some((entity, i) => before[i] !== doctrineOf(entity)),
    'at least one raider actually changed doctrine');
});

test('while the escort wing lives, destroying a raider leaves the others on their attack doctrine', () => {
  const h = boot();
  const live = fireRaid(h);
  const raiders = livingRaiders(h, live);
  const escorts = raiders.filter(isEscortWing);
  const strikers = raiders.filter((entity) => !isEscortWing(entity));
  assert.equal(escorts.length, 1);
  assert.ok(strikers.length >= 2, 'seed 4242 fields more than one raider behind the screen');
  const victim = strikers[strikers.length - 1];
  const kept = strikers.slice(0, -1);
  const before = kept.map((entity) => doctrineOf(entity));
  const screenBefore = doctrineOf(escorts[0]);

  kill(h, victim);
  assert.equal(victim.alive, false);
  assert.equal(escorts[0].alive, true, 'the escort wing is still up');
  assert.equal(doctrineOf(escorts[0]), screenBefore);

  const still = livingRaiders(h, live).filter((entity) => !isEscortWing(entity));
  assert.equal(still.length, kept.length);
  for (let i = 0; i < still.length; i++) {
    assert.equal(doctrineOf(still[i]), before[i],
      'a raider dying under a live screen does not flip the wing onto the loot sweep');
    assert.notEqual(doctrineOf(still[i]), CombatDoctrineId.MINE_LAYER_WAKE);
  }
});
