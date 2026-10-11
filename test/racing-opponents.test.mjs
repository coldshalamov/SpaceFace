import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { RACE_LEVELS, RACE_CONTRACTS, racingSeedFor } from '../src/data/raceLevels.js';
import { configureRacingCorridorSession } from '../src/world/racingCorridor.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { createRacingOpponents, rankRacingEntrants } from '../src/missions/racingOpponents.js';

const DT = 1 / 60;
function fixture(level = RACE_LEVELS[0], options = {}) {
  const contract = RACE_CONTRACTS.find(row => row.levelId === level.id);
  const state = createGameState(racingSeedFor(contract.id)), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  const coreOwner = Object.create(core); coreOwner.init(ctx);
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, true);
  state.world.currentSectorId = level.sectorId;
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true, pos: { x: 50000, z: 50000 }, radius: 20 });
  state.playerId = player.id;
  world.enterSector(level.sectorId);
  const mission = { id: 'heat-1', type: 'race', status: 'active', params: {
    racingContractId: 'test', raceMode: 'race', raceDifficulty: 'club', raceOpponents: 3,
    courseSectorId: level.sectorId, gates: level.course.gates, gateRadiusWU: level.course.gateRadiusWU,
    courseLengthWU: level.course.courseLengthWU, closedCircuit: true, laps: 1, nextGate: 0,
    gridUntilSimS: 0.5, raceStartSimS: 0.5, ...options } };
  state.missions.active = [mission];
  const pack = createRacingOpponents(ctx);
  const flight = Object.create(flightV3); flight.init(ctx);
  return { state, helpers, mission, pack, flight };
}

const heats = [...RACE_LEVELS.map(level => ({ level, difficulty: 'club', laps: 1 })),
  { level: RACE_LEVELS[1], difficulty: 'expert', laps: 2 }];
for (const { level, difficulty, laps } of heats) {
  test(`three real V3 craft finish ${level.name}: ${difficulty}, ${laps} lap(s)`, async () => {
    const { state, mission, pack, flight } = fixture(level, { raceDifficulty: difficulty, laps });
    pack.update(mission);
    const ships = pack.inspect().rivals.map(row => state.entities.get(row.entityId));
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      assert.ok(Math.hypot(ships[i].pos.x - ships[j].pos.x, ships[i].pos.z - ships[j].pos.z)
        > ships[i].radius + ships[j].radius + 20, 'grid hulls have deliberate clearance');
    }
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    let contacts = 0, maxStep = 0;
    try {
      const terrain = [...state.entityList, ...(state.world.dressing?.rows || []), ...(state.world.asteroidField?.rocks || [])]
        .filter(entity => entity.id !== state.playerId && !ships.includes(entity)
          && entity.collides !== false && entity.type !== 'ship');
      // Field rocks use compact records in production; give the native fixture their
      // actual collider radius and immutable terrain identity, with no driver shortcuts.
      const bodies = terrain.map((row, index) => {
        const radius = row.type === 'asteroid' ? asteroidColliderRadius(row.data?.typeId, row.radius) : row.radius;
        return { ...row, id: 100000 + index, radius, alive: true,
          physicsBody: { dynamic: false, mass: 1e8, radius }, vel: { x: 0, z: 0 } };
      });
      owner.syncFromEntities([...ships, ...bodies]);
      for (let tick = 0; tick < 60 * 240; tick++) {
        state.tick = tick; state.simTime = tick * DT;
        pack.update(mission);
        const previous = ships.map(ship => ({ ...ship.pos }));
        flight.update(DT, state);
        owner.step(DT, tick);
        contacts += owner.drainContactImpacts().length;
        for (let i = 0; i < ships.length; i++) maxStep = Math.max(maxStep,
          Math.hypot(ships[i].pos.x - previous[i].x, ships[i].pos.z - previous[i].z));
        if (pack.inspect().rivals.every(row => row.status !== 'racing')) break;
      }
      const result = pack.inspect().rivals;
      console.log(level.name, JSON.stringify({ result, contacts, maxStep,
        stuck: ships.filter(ship => result.some(row => row.entityId === ship.id && row.status === 'racing'))
          .map(ship => ({ id: ship.id, pos: ship.pos, vel: ship.vel, intent: ship.data.intent })) }));
      assert.ok(result.every(row => row.status === 'finished'), JSON.stringify(result));
      assert.ok(result.every(row => row.elapsedS > 15 && row.elapsedS < 240));
      assert.ok(maxStep < 8, `bounded physical travel per tick: ${maxStep}`);
      assert.ok(new Set(result.map(row => Math.round(row.elapsedS * 10))).size > 1, 'personalities yield distinct finishes');
      const earliest = Math.min(...result.map(row => row.elapsedS));
      const finish = pack.finish(mission, earliest + 0.01);
      assert.equal(finish.find(row => row.player).position, 2);
      pack.stop('heat_complete');
      assert.ok(ships.every(ship => !state.entities.has(ship.id)), 'no orphan rival entities');
    } finally { owner.dispose(); }
  });
}

test('time trials and campaign races never materialize opponents; menu/load cleanup is exact', () => {
  const { state, mission, pack } = fixture(undefined, { raceMode: 'time-trial' });
  pack.update(mission); assert.equal(pack.inspect(), null);
  mission.params.raceMode = 'race'; pack.update(mission);
  const ids = pack.inspect().rivals.map(row => row.entityId);
  state.mode = 'menu'; pack.reconcile();
  assert.equal(pack.inspect(), null);
  assert.ok(ids.every(id => !state.entities.has(id)));
  state.mode = 'flight'; configureRacingCorridorSession(state, false);
  pack.update(mission); assert.equal(pack.inspect(), null);
});

test('finish ties and unfinished/DNF rows rank only actual evidence', () => {
  const ranked = rankRacingEntrants([
    { id: 'rook', status: 'finished', elapsedS: 30, progress: 1 },
    { id: 'player', status: 'finished', elapsedS: 30, progress: 1 },
    { id: 'mira', status: 'racing', elapsedS: null, progress: 0.8 },
    { id: 'sable', status: 'dnf', elapsedS: null, progress: 0.95 },
  ]);
  assert.deepEqual(ranked.map(row => row.id), ['player', 'rook', 'mira', 'sable']);
  assert.equal(ranked[2].elapsedS, null);
});

test('a physically displaced rival flies back behind its missed gate; dead craft are DNF', async () => {
  const { state, mission, pack, flight } = fixture(undefined, { raceOpponents: 1, gridUntilSimS: 0 });
  pack.update(mission);
  const ship = state.entities.get(pack.inspect().rivals[0].entityId);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    owner.syncFromEntities([ship]);
    const fx = Math.cos(ship.rot), fz = Math.sin(ship.rot);
    queuePhysicsImpulse(ship, { x: (fx * 360 - fz * 380) * ship.mass,
      z: (fz * 360 + fx * 380) * ship.mass });
    for (let tick = 0; tick < 60 * 60; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      pack.update(mission);
      flight.update(DT, state);
      owner.step(DT, tick);
      if (pack.inspect().rivals[0].nextGate > 0) break;
    }
    const result = pack.inspect().rivals[0];
    assert.ok(result.recoveries > 0, 'missed gate is detected');
    assert.ok(result.nextGate > 0, 'the actual craft crosses its originally missed gate legally');
    ship.alive = false; pack.update(mission);
    assert.equal(pack.inspect().rivals[0].status, 'dnf');
    pack.stop('test_complete');
  } finally { owner.dispose(); }
});
