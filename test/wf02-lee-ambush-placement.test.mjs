// WF-02 terrain lee — an opting encounter squad (terrain: 'lee') takes its stand behind the best
// cover rock on the player's bearing instead of floating in open space. Real director pump, real
// ambush_snare shape, seed 4242. Fail-open: no qualifying rock → exactly the authored spawn.
//
// Player words: an ambush you can see coming across empty space is not an ambush — the wing waits
// where you cannot see it until you round the rock.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encounterDirector,
  computeLeePlacement,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

const SEED = 4242;
const SECTOR_ID = 'sector_nyx_march';

function rockEntity(id, x, z, radius) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius };
}

function makeHarness() {
  const entities = new Map();
  const entityList = [];
  const player = {
    id: 1, type: 'ship', alive: true, hull: 400, hullMax: 400, shield: 200, shieldMax: 200,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    entities,
    entityList,
    simTime: 0,
    tick: 0,
    player: { flags: {}, credits: 5000, cargo: { items: {} }, bounty: 0, heat: 0 },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: SECTOR_ID },
    meta: { seed: SEED },
    story: { beatIndex: 3 },
  };
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit(name, payload) { events.push({ name, payload }); }, on() {} };
  dir.helpers = {
    spawnEntity(spec) {
      const ent = { id: entities.size + 10, alive: true, type: 'ship', pos: { ...spec.pos }, data: spec.data || {} };
      entities.set(ent.id, ent);
      return ent;
    },
  };
  state.encounterDirector = {
    pending: [], active: {}, live: {}, plannedKey: null,
    pressure: { combat: 200, civilian: 200 }, noise: { mining: 0 }, window: [], cooldowns: {},
    named: {}, externalNamed: {}, receipts: [],
    stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
  // Plan the real authored shape on an authored zone (1000 wu radius keeps the 1500 wu player
  // inside the proximity reach: radius + 600 slack). zoneCenter is resolved to global coords.
  function planItem(shapeId) {
    const rng = mulberry32(hash32(SEED, shapeId, 'lee-test-plan'));
    const zone = {
      id: `zone_lee_${shapeId}`, name: 'Lee test zone', type: 'ambush_lane',
      center: { x: 2600, z: 0 }, radius: 1000, threat: 3,
    };
    const item = planEncounterShape(ENCOUNTERS[shapeId], zone, SECTOR_ID, 0, 0, rng);
    assert.ok(item, 'shape resolved into a schedule item');
    assert.ok(item.ships.length >= 3, 'a fight needs a crowd');
    return item;
  }
  function fireItem(item) {
    item.dueAt = 0;
    item.defers = 0;
    state.encounterDirector.pending.push(item);
    for (let t = 0; t <= 120; t += 21) {
      state.simTime = t;
      dir._pump(state.encounterDirector, state, t);
    }
  }
  const spawnedShips = () => [...entities.values()].filter((e) => e.type === 'ship' && e.id !== 1);
  return { state, player, entities, entityList, events, dir, planItem, fireItem, spawnedShips };
}

function centroid(points) {
  let x = 0, z = 0;
  for (const p of points) { x += p.x; z += p.z; }
  return { x: x / points.length, z: z / points.length };
}

test('the authored ambush_snare declares terrain lee through the real plan path', () => {
  const h = makeHarness();
  const item = h.planItem('ambush_snare');
  assert.equal(item.terrain, 'lee', 'resolveEncounter carries squad.terrain onto the plan');
  assert.equal(ENCOUNTERS.ambush_snare.squad.terrain, 'lee');
  assert.equal(ENCOUNTERS.tether_control_raider_ambush.squad.terrain, 'lee',
    'the tether-control specialist opts in through the same seam');
});

test('an opting ambush spawns in the big rock\'s lee — cover between player and squad', () => {
  const h = makeHarness();
  const item = h.planItem('ambush_snare');
  const zc = item.zoneCenter;
  // Player south-west of the zone; one big cover rock on the approach line, one gravel, one
  // sideways giant the scorer should pass over (off-axis, smaller score than the in-line rock).
  h.player.pos = { x: zc.x - 1500, z: zc.z };
  h.entityList.push(
    rockEntity(901, zc.x - 700, zc.z, 30),     // in-line cover (the pick)
    rockEntity(902, zc.x - 500, zc.z + 60, 6), // gravel: below the readable-size floor
    rockEntity(903, zc.x + 400, zc.z + 1400, 34), // sideways giant: out of the forward line
  );
  // Snapshot the authored relative geometry (jitter cluster) before the fire.
  const authored = item.ships.map((sh) => ({ x: sh.pos.x, z: sh.pos.z }));
  h.fireItem(item);

  const spawnedEvent = h.events.find((e) => e.name === 'encounter:spawned');
  assert.ok(spawnedEvent, 'the ambush fired and materialized');
  assert.ok(spawnedEvent.payload.terrainLee, 'the spawn reports its terrain lee');
  const lee = spawnedEvent.payload.terrainLee;
  assert.equal(lee.rockId, 901, 'the in-line big rock wins the cover score');
  assert.ok(lee.shiftWU > 120 && lee.shiftWU <= 420,
    `the wing moved a readable, bounded distance (got ${lee.shiftWU} WU)`);

  const ships = h.spawnedShips();
  assert.equal(ships.length, item.ships.length, 'the whole squad spawned');
  const cen = centroid(ships.map((s) => s.pos));
  const dPlayerRock = Math.hypot(h.entityList[0].pos.x - h.player.pos.x, h.entityList[0].pos.z - h.player.pos.z);
  const dPlayerSquad = Math.hypot(cen.x - h.player.pos.x, cen.z - h.player.pos.z);
  assert.ok(dPlayerRock < dPlayerSquad, 'the rock now stands between the player and the wing');
  // The wing is on the rock's far side along the approach bearing.
  const ux = (h.entityList[0].pos.x - h.player.pos.x) / dPlayerRock;
  const uz = (h.entityList[0].pos.z - h.player.pos.z) / dPlayerRock;
  const beyond = (cen.x - h.entityList[0].pos.x) * ux + (cen.z - h.entityList[0].pos.z) * uz;
  assert.ok(beyond > 0, 'the squad sits behind the cover, not in front of it');

  // Rigid shift: the formation's pairwise geometry is exactly the authored jitter cluster.
  const after = ships.map((s) => s.pos);
  assert.equal(after.length, authored.length);
  for (let i = 0; i < authored.length; i++) {
    for (let j = i + 1; j < authored.length; j++) {
      const before2 = Math.hypot(authored[i].x - authored[j].x, authored[i].z - authored[j].z);
      const after2 = Math.hypot(after[i].x - after[j].x, after[i].z - after[j].z);
      assert.ok(Math.abs(before2 - after2) < 1e-6, 'the shift is formation-preserving');
    }
  }
});

test('the same fight on seed 4242 resolves the identical lee twice', () => {
  const run = () => {
    const h = makeHarness();
    const item = h.planItem('ambush_snare');
    const zc = item.zoneCenter;
    h.player.pos = { x: zc.x - 1500, z: zc.z };
    h.entityList.push(rockEntity(901, zc.x - 700, zc.z, 30));
    h.fireItem(item);
    const spawnedEvent = h.events.find((e) => e.name === 'encounter:spawned');
    return {
      lee: spawnedEvent && spawnedEvent.payload.terrainLee,
      ships: h.spawnedShips().map((s) => ({ x: s.pos.x, z: s.pos.z })),
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.lee, b.lee, 'lee placement is deterministic');
  assert.deepEqual(a.ships, b.ships, 'spawn positions are byte-identical on the fixed seed');
});

test('no qualifying rock: the ambush spawns exactly where authored (fail-open)', () => {
  const h = makeHarness();
  const item = h.planItem('ambush_snare');
  // Inside the zone's proximity reach, like the lee run — the only difference is the cover.
  h.player.pos = { x: item.zoneCenter.x - 1500, z: item.zoneCenter.z };
  h.entityList.push(
    rockEntity(904, item.zoneCenter.x - 500, item.zoneCenter.z, 6), // gravel only
  );
  const authored = item.ships.map((sh) => ({ x: sh.pos.x, z: sh.pos.z }));
  h.fireItem(item);
  const spawnedEvent = h.events.find((e) => e.name === 'encounter:spawned');
  assert.ok(spawnedEvent, 'the ambush still fired');
  assert.equal(spawnedEvent.payload.terrainLee, null, 'no rock → no lee stamp');
  const ships = h.spawnedShips().sort((p, q) => p.id - q.id);
  for (let i = 0; i < ships.length; i++) {
    assert.equal(ships[i].pos.x, authored[i].x, 'unshifted spawn x');
    assert.equal(ships[i].pos.z, authored[i].z, 'unshifted spawn z');
  }
});

test('computeLeePlacement: off-axis giants lose to in-line cover; the shift is clamped', () => {
  const player = { x: 0, z: 0 };
  // A far squad: the unclamped lee point would sit far beyond the bounded shift cap.
  const ships = [
    { pos: { x: 5000, z: 0 } }, { pos: { x: 5100, z: 40 } },
    { pos: { x: 4900, z: -40 } }, { pos: { x: 5050, z: 10 } },
  ];
  const rocks = [
    rockEntity(1, 4400, 0, 30),   // in-line cover near the squad line
    rockEntity(2, 4600, 700, 60), // bigger but sideways off the approach
  ];
  const pick = computeLeePlacement(ships, player, rocks);
  assert.ok(pick, 'an in-line rock yields a shift');
  assert.equal(pick.rockId, 1, 'in-line cover beats the sideways giant');
  assert.ok(pick.shiftWU <= 420, `shift stays inside the honesty cap (got ${pick.shiftWU})`);
  // The invariant is not "moves away" — a wing already past its cover is pulled back into the
  // lee. The shifted centroid must land on the rock's far side along the approach bearing, with
  // the rock still between player and wing.
  let bx = 0, bz = 0;
  for (const sh of ships) { bx += sh.pos.x; bz += sh.pos.z; }
  bx /= ships.length; bz /= ships.length;
  const ux2 = 4400 / 4400, uz2 = 0;
  const beyond = ((bx + pick.dx) - 4400) * ux2 + ((bz + pick.dz) - 0) * uz2;
  assert.ok(beyond > 0, 'the shifted wing sits behind the cover along the approach bearing');
  const dPlayerRock = Math.hypot(4400, 0);
  const dPlayerWing = Math.hypot(bx + pick.dx, bz + pick.dz);
  assert.ok(dPlayerRock < dPlayerWing, 'cover stands between the player and the wing');
  // No player bearing → no placement.
  assert.equal(computeLeePlacement(ships, { x: 5050, z: 5 }, rocks), null,
    'a player standing inside the squad has no lee to hide behind');
  assert.equal(computeLeePlacement(ships, player, []), null, 'no rocks, no shift');
});
