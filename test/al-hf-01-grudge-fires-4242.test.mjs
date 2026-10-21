// AL-HF-01 — a grudge victim must fire inside its armed response window, not a doctrine cycle
// later. Measured through the real sg06-tactical stack (aiPorts + tacticalAI + lawSecurity +
// weapons + combat), seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { weapons } from '../src/systems/weapons.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { mines } from '../src/systems/mines.js';

const SEED = 4242;
const RESPONSE_WINDOW_TICKS = 60;
const FIRE_DEADLINE_TICKS = 120;

function makeSim() {
  const tactical = createTacticalAISystem({ config: { enemyMind: { enabled: false } } });
  const sim = createSimulation({ seed: SEED, systems: [aiPorts, tactical, lawSecurity, weapons, combat, mines] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_gate';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 500 }, radius: 12,
    factionId: 'faction_free', data: { defId: 'ship_kestrel', ai: {} },
  });
  sim.state.playerId = player.id;
  const fires = [];
  sim.bus.on('combat:fire', (p) => fires.push({ tick: sim.state.tick, ownerId: p.ownerId }));
  return { sim, fires, player };
}

function spawnRaider(sim, x, { doctrineId = null, squadId = 'pack_a' } = {}) {
  const e = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 4, { x, z: 0 }, { startedTick: 0 }));
  e.data.ai.squadId = squadId;
  if (doctrineId) e.data.ai.combatDoctrineId = doctrineId;
  return e;
}

function settle(sim, ticks) {
  for (let i = 0; i < ticks; i++) sim.step();
}

// (1)+(2): a jackal mine blast turns the Reaver on its owner within 1 tick, and the first
// return shot leaves the battery inside the armed window (60..120 ticks after the hit).
for (const doctrineId of ['interceptor_flyby', 'brawler_commit']) {
  test(`a grudge victim (${doctrineId}) fires at the mine's owner inside the response window`, () => {
    const { sim, fires } = makeSim();
    const a = spawnRaider(sim, 0, { squadId: 'pack_a' });
    const b = spawnRaider(sim, 220, { doctrineId, squadId: 'pack_b' });
    settle(sim, 60);

    const liveMines = sim.registry.get('mines');
    liveMines.placeMine({ ownerId: a.id, pos: { x: 210, z: 0 }, armDelayS: 0, triggerRadius: 60, telegraph: false });
    const hitTick = sim.state.tick;
    sim.step();
    assert.equal(b.data.ai.retaliationTargetId, a.id, 'the victim turns on the mine owner within 1 tick');

    const mark = fires.length;
    settle(sim, 600);
    const firstFire = fires.slice(mark).find((f) => f.ownerId === b.id);
    assert.ok(firstFire, `${doctrineId}: no return fire within 10 s`);
    const delay = firstFire.tick - hitTick;
    assert.ok(delay >= RESPONSE_WINDOW_TICKS, `${doctrineId}: fired inside the response window (${delay} ticks)`);
    assert.ok(delay <= FIRE_DEADLINE_TICKS, `${doctrineId}: first shot at +${delay} ticks exceeds 2 s`);
    sim.dispose();
  });
}

// (4): a lawful Concord hull in the same blast forms no grudge pair and fires nothing.
test('a lawful hull in the same geometry forms 0 grudge pairs and fires nothing', () => {
  const { sim, fires } = makeSim();
  const a = spawnRaider(sim, 0, { squadId: 'pack_a' });
  const law = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_scn', radius: 18, pos: { x: 220, z: 0 },
    hull: 100, hullMax: 100, shield: 0, shieldMax: 0,
    data: { ai: { lawful: true, archetype: 'patrol', combatDoctrineId: 'escort_screen', squadId: 'law_wing' }, combat: {} },
  });
  settle(sim, 60);
  const liveMines = sim.registry.get('mines');
  liveMines.placeMine({ ownerId: a.id, pos: { x: 210, z: 0 }, armDelayS: 0, triggerRadius: 60, telegraph: false });
  const mark = fires.length;
  settle(sim, 300);
  assert.equal(law.data.ai.npcGrudge, undefined, 'lawful hulls never carry an NPC grudge');
  assert.equal(law.data.ai.retaliationTargetId, undefined);
  assert.equal(fires.slice(mark).filter((f) => f.ownerId === law.id).length, 0, 'the lawful hull fires nothing at the mine owner');
  sim.dispose();
});

// (5): a non-grudge hostile fighting the player keeps its pre-change first-fire timing.
test('a non-grudge hostile keeps its old first-fire tick', () => {
  const { sim, fires } = makeSim();
  const hunter = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 4, { x: 0, z: 350 }, { startedTick: 0 }));
  hunter.data.ai.squadId = 'pack_a';
  Object.assign(hunter.data.ai, {
    forcePlayerTarget: true, motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn', zoneId: 'sector_helios_gate',
    approachTelegraph: 'engine_flare', noFireResponseWindowS: 1, roe: 'weapons_free',
  });
  settle(sim, 900);
  const firstFire = fires.find((f) => f.ownerId === hunter.id);
  assert.ok(firstFire, 'the player-fighting hostile never fired');
  assert.equal(firstFire.tick, NON_GRUDGE_FIRST_FIRE_TICK,
    `non-grudge timing changed: ${firstFire.tick}`);
  sim.dispose();
});

// (6): the grudge sequence is deterministic across fresh sims.
test('two fresh sims on the same seed produce identical first-fire ticks', () => {
  const ticks = [];
  for (let run = 0; run < 2; run++) {
    const { sim, fires } = makeSim();
    const a = spawnRaider(sim, 0, { squadId: 'pack_a' });
    const b = spawnRaider(sim, 220, { squadId: 'pack_b' });
    settle(sim, 60);
    const liveMines = sim.registry.get('mines');
    liveMines.placeMine({ ownerId: a.id, pos: { x: 210, z: 0 }, armDelayS: 0, triggerRadius: 60, telegraph: false });
    const mark = fires.length;
    settle(sim, 300);
    const firstFire = fires.slice(mark).find((f) => f.ownerId === b.id);
    assert.ok(firstFire, `run ${run}: no return fire`);
    ticks.push(firstFire.tick);
    sim.dispose();
  }
  assert.equal(ticks[0], ticks[1]);
});

const NON_GRUDGE_FIRST_FIRE_TICK = 65; // measured HEAD-parity first-fire tick for this fixture
