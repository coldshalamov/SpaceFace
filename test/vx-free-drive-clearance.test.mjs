import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { world } from '../src/systems/world.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { SECTORS } from '../src/data/sectors.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { STARTER_FIELD_MACHINE } from '../src/data/environmentalMachinery.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { rockTierForRadius } from '../src/data/rockSubstances.js';
import { spawn47aOpeningScene } from '../src/data/scenarios/47aLiveScene.js';
import { starterBuoySpec, STARTER_WORKDAY_VERSION } from '../src/missions/starterWorkday.js';
import { vxFreeDriveReservationsFor } from '../src/data/vxFreeDriveRing.js';
import { dressingStaticLayerFor } from '../src/world/solidDressing.js';

const SECTOR = SECTORS.find(row => row.id === 'sector_helios_prime');
const MACHINE = STARTER_FIELD_MACHINE;
const CANDIDATE_TURN = { x: 300, z: 80 };

// The production station/field sequence preserves the epoch-0 draw order. No game boot,
// physics step, renderer, or simulated arranger input is needed to exercise the late ladder.
function materialize(resourceBodies = null) {
  const state = createGameState(47), bus = createBus(), helpers = {};
  Object.create(core).init({ state, bus, helpers });
  const system = Object.assign(Object.create(world), { state, bus, helpers });
  state.world.arrangementVersion = 1;
  state.world.currentSectorId = SECTOR.id;
  state.world.sectors = { [SECTOR.id]: SECTOR };
  if (resourceBodies) state.world.resourceBodies = structuredClone(resourceBodies);
  const active = system._emptySectorBag();
  state.world.activeSector = active;
  const rng = helpers.mulberry32(helpers.hash32(47, SECTOR.id, 0));
  system._spawnStations(SECTOR, active, rng);
  system._spawnFields(SECTOR, active, {}, rng);
  system._spawnFreeDriveRing(SECTOR, active);
  const rocks = state.world.asteroidField.rocks.filter(row => row.alive !== false);
  const ladder = rocks.filter(row => row.data.authoredBoulderId?.startsWith('ladder_'));
  return { state, system, active, helpers, rng, rocks, ladder };
}

function laneIntruders(rows) {
  const discs = vxFreeDriveReservationsFor(SECTOR.id, p => p);
  return rows.flatMap(row => discs.flatMap((disc, discIndex) => {
    const gap = Math.hypot(row.pos.x - disc.pos.x, row.pos.z - disc.pos.z)
      - asteroidColliderRadius(row.data.typeId, row.radius) - disc.radius;
    return gap < -1e-6 ? [{ slot: row.data.asteroidSlotId, discIndex }] : [];
  }));
}

function nativeFieldSnapshot(f) {
  const terrain = Object.assign(Object.create(terrainAnchors), { state: f.state, helpers: f.helpers });
  const anvil = terrain._ensureKillMachineAnvil({ ...MACHINE.anvil, machineId: MACHINE.id });
  f.system._spawnPlaceProp(f.active, SECTOR, MACHINE.placeId, MACHINE.globalPos, {
    rot: MACHINE.rot, name: MACHINE.mouth.name, radius: MACHINE.mouth.radius, worldOneOff: true,
  });
  const rocks = f.rocks.concat(f.state.entityList.filter(row => row.type === 'asteroid' && row !== anvil));
  return dressingStaticLayerFor(f.state).statics.concat(anvil, rocks.map(row => ({
    ...row, physicsBody: { radius: asteroidColliderRadius(row.data.typeId, row.radius), dynamic: false },
    collides: true,
  })));
}

function castKestrel(owner, statics, a, b, shipId) {
  const velocity = { x: b.x - a.x, y: 0, z: b.z - a.z };
  const ship = { ...makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, pos: { ...a }, rot: Math.atan2(velocity.z, velocity.x),
  }), id: shipId, alive: true, occupantGeneration: 1, vel: { x: 0, z: 0 }, angVel: 0 };
  owner.syncFromEntityLayers(statics, [ship], 1, null);
  const hull = owner.records.get(ship.id);
  assert.equal(hull.proxyId, 'skin:ship_kestrel:polygon');
  const hits = [];
  for (const obstacle of statics) {
    const record = owner.records.get(obstacle.id);
    assert.ok(record, `native collider missing for ${obstacle.id}`);
    if (record.colliders.some(c => hull.colliders.some(h =>
      c.castCollider({ x: 0, y: 0, z: 0 }, h, velocity, 0, 1, true)))) {
      hits.push(obstacle.data.name || obstacle.data.asteroidSlotId || obstacle.data.killMachineAnvilId);
    }
  }
  return hits;
}

test('fresh Helios materialization keeps late ladder rungs out of VX reservations', t => {
  const f = materialize();
  assert.ok(f.ladder.length > 0, 'the late ladder owner must actually run');
  const identities = f.rocks.concat(f.state.entityList.filter(row => row.type === 'asteroid')).map(row => ({
    field: row.data.fieldId, slot: row.data.asteroidSlotId, id: row.id,
    radius: row.radius, mass: row.mass, oreHP: row.data.oreHP, yieldU: row.data.yieldU,
  }));
  t.diagnostic(JSON.stringify({ rng: f.rng.getState(), fieldRows: f.rocks.length,
    ladderByTier: [0, 1, 2, 3, 4].map(tier => f.ladder.filter(row => rockTierForRadius(row.radius) === tier).length),
    identitiesSha256: createHash('sha256').update(JSON.stringify(identities)).digest('hex') }));
  assert.deepEqual(laneIntruders(f.ladder), [], 'late authored ladder bodies must honor the same lane discs as scatter');
});

test('native Kestrel clears the materialized low road and fixed ring approach chords', async () => {
  const f = materialize(), owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const field = nativeFieldSnapshot(f);
  const ring = field.filter(row => row.data.worldOneOff && row.data.name !== MACHINE.mouth.name);
  const origin = { x: 0, z: 0 };
  const hits = {
    lowRoad: castKestrel(owner, field, { x: 480, z: -525 }, { x: 840, z: -525 }, 900001),
    helios: castKestrel(owner, ring, origin, SECTOR.stations.find(row => row.id === 'station_helios').pos, 900002),
    tutorial: castKestrel(owner, ring, origin, SECTOR.pois.find(row => row.id === 'poi_tutorial').pos, 900003),
  };
  assert.deepEqual(hits, { lowRoad: [], helios: [], tutorial: [] });
});

test('Turn candidate clears native first-flight chords and nearby authored work', async () => {
  const f = materialize();
  // These are the existing authored owners, not synthetic substitutes for nearby scenery.
  f.system._spawnGates(SECTOR, f.active, f.rng);
  f.system._spawnPOIs(SECTOR, f.active, {}, f.rng, 'FULL');
  f.system._spawnWorldOneOffs(SECTOR, f.active);
  spawn47aOpeningScene({ state: f.state, helpers: f.helpers, liveColdStartSafe: true });
  f.helpers.spawnEntity(starterBuoySpec({ id: 'vx-clearance-buoy', type: 'tow_recovery',
    destSectorId: SECTOR.id, params: { starterWorkdayVersion: STARTER_WORKDAY_VERSION,
      starterJobId: 'starter_pelican', starterStep: 1 } }, p => p));
  const actualTurn = f.state.world.dressing.rows.find(row => row.data.name === 'The Turn');
  assert.ok(actualTurn);
  // Check the proposed location before source mutation as well as the final actual location.
  const candidate = { ...actualTurn, pos: { ...CANDIDATE_TURN } };
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const origin = { x: 0, z: 0 };
  assert.deepEqual(castKestrel(owner, [candidate], origin,
    SECTOR.stations.find(row => row.id === 'station_helios').pos, 900001), []);
  assert.deepEqual(castKestrel(owner, [candidate], origin,
    SECTOR.pois.find(row => row.id === 'poi_tutorial').pos, 900002), []);
  const nearby = f.state.entityList.concat(dressingStaticLayerFor(f.state).statics)
    .filter(row => row.id !== candidate.id && row.alive !== false && row.physicsBody !== false
      && (row.collides !== false || row.data.scenarioActorId === 'carrier_wreck_bourse')
      && Math.hypot(row.pos.x - candidate.pos.x, row.pos.z - candidate.pos.z) < 300)
    // The 47-A carrier currently opts out of contacts. Query its declared body envelope too,
    // without changing that gameplay contract or the production entity.
    .map(row => row.collides === false ? { ...row, collides: true } : row);
  assert.ok(nearby.some(row => row.data.scenarioActorId === 'carrier_wreck_bourse'), '47-A carrier must be checked');
  assert.ok(nearby.some(row => row.data.starterJobId === 'starter_pelican'), 'first tow job must be checked');
  owner.syncFromEntities([candidate, ...nearby]);
  const turn = owner.records.get(candidate.id);
  assert.ok(turn);
  for (const row of nearby) {
    const record = owner.records.get(row.id);
    assert.ok(record, `native body missing for nearby ${row.id}`);
    for (const a of turn.colliders) for (const b of record.colliders) {
      const contact = a.contactCollider(b, 0);
      assert.ok(!contact || contact.distance >= -0.001,
        `Turn overlaps ${row.data.name || row.data.scenarioActorId || row.data.poiId}: ${contact?.distance}`);
    }
  }
});

test('saved worked ladder body retains its real pose inside a fresh-world reservation', () => {
  const original = materialize();
  const row = original.ladder.find(r => r.data.authoredBoulderId === 'ladder_f_helios_starter_0_2');
  assert.ok(row);
  row.pos = { x: 743.0879825536101, z: -523.0770408094314 };
  row.vel = { x: 0, z: 0 };
  row.rot = 0.37;
  row.data.oreHP -= 3;
  row.data.displaced = true;
  const saved = original.system.persistResourceBody(row);
  assert.ok(saved.playerModified && saved.displaced);
  const restored = materialize(original.state.world.resourceBodies);
  const same = restored.ladder.find(r => r.data.authoredBoulderId === row.data.authoredBoulderId);
  assert.ok(same);
  assert.deepEqual(same.pos, row.pos, 'fresh constraints must not reseat the worked body');
  assert.equal(same.rot, row.rot);
  assert.deepEqual(same.vel, row.vel);
  assert.equal(same.data.oreHP, row.data.oreHP);
  assert.equal(same.data.resourceBodyId, saved.recordId);
  assert.ok(laneIntruders([same]).length > 0, 'the saved pose deliberately challenges the new lane constraint');
});
