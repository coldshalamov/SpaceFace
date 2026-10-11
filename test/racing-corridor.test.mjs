import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RACE_CONTRACTS, RACE_LEVELS, racingSeedFor } from '../src/data/raceLevels.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { createSectorArranger, segmentDistanceSquared } from '../src/world/arranger.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { configureRacingCorridorSession, racingCorridorPlan, clearsRacingCorridor } from '../src/world/racingCorridor.js';

function boot(sectorId, seed, temporary = true) {
  const state = createGameState(seed), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  core.init(ctx);
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true,
    pos: { x: 0, z: 0 }, radius: 32, mass: 400, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, temporary);
  world.enterSector(sectorId);
  return { state, world };
}

const home = row => row.homeSectorId || row.data?.homeSectorId;
const rocks = (state, sectorId) => [...(state.world.asteroidField?.rocks || []), ...state.entityList]
  .filter(row => row.alive !== false && row.type === 'asteroid' && home(row) === sectorId);
const snapshot = rows => rows.map(row => [row.id, row.pos.x, row.pos.z, row.radius, row.data?.typeId]);

test('all public temporary contracts build full-body clear course banks and starting grids', () => {
  for (const contract of RACE_CONTRACTS) {
    const level = RACE_LEVELS.find(row => row.id === contract.levelId);
    const { state } = boot(level.sectorId, racingSeedFor(contract.id));
    const plan = racingCorridorPlan(level.sectorId);
    const field = rocks(state, level.sectorId);
    assert.ok(field.length > 20, contract.id);
    for (const rock of field) {
      const radius = asteroidColliderRadius(rock.data?.typeId, rock.radius);
      assert.ok(clearsRacingCorridor(plan, rock.pos, radius), `${contract.id}: rock ${rock.id} intrudes`);
    }
    // Static stations and actual solid dressing also matter; a gate-safe asteroid
    // fixture must not certify a start line that still aims through Helios Station.
    const solids = [...state.entityList, ...(state.world.dressing?.rows || [])]
      .filter(row => row.alive !== false && row.collides && home(row) === level.sectorId
        && row.type !== 'ship' && row.type !== 'asteroid');
    for (const row of solids) {
      const closest = Math.min(...plan.keepouts.map(({ a, b }) => Math.sqrt(segmentDistanceSquared(row.pos, a, b))));
      assert.ok(closest >= row.radius + plan.layout.hullRadiusWU,
        `${contract.id}: ${row.data?.name || row.data?.placeId || row.type} blocks hull path (${closest.toFixed(1)} < ${row.radius + plan.layout.hullRadiusWU})`);
    }
  }
});

test('temporary layouts preserve the existing asteroid budget and deterministic material slots', () => {
  for (const level of RACE_LEVELS) {
    const seed = racingSeedFor(`practice_${level.id}`);
    const normal = boot(level.sectorId, seed, false), race = boot(level.sectorId, seed), repeat = boot(level.sectorId, seed);
    const a = rocks(normal.state, level.sectorId), b = rocks(race.state, level.sectorId);
    assert.equal(b.length, a.length, level.name);
    assert.deepEqual(b.map(r => [r.radius, r.data.typeId, r.hullMax]), a.map(r => [r.radius, r.data.typeId, r.hullMax]));
    assert.notDeepEqual(snapshot(a), snapshot(b));
    assert.deepEqual(snapshot(b), snapshot(rocks(repeat.state, level.sectorId)));
    const groupOffsets = new Map();
    for (let i = 0; i < a.length; i++) {
      const group = a[i].data?.opticStructureId;
      if (!group) continue;
      const offset = [b[i].pos.x - a[i].pos.x, b[i].pos.z - a[i].pos.z];
      const prior = groupOffsets.get(group);
      if (prior) assert.ok(Math.hypot(offset[0] - prior[0], offset[1] - prior[1]) < 1e-6, 'lattice stays coherent');
      else groupOffsets.set(group, offset);
    }
  }
});

test('session registration belongs to exact fresh sector objects and clears on replacement/restore', () => {
  const state = createGameState(7);
  const sector = { ...RACE_LEVELS[0].course, id: RACE_LEVELS[0].sectorId };
  state.world.sectors = { [sector.id]: sector };
  configureRacingCorridorSession(state, true);
  const original = createSectorArranger(sector);
  assert.equal(original.profile.name, 'Twin-quarry slalom');
  assert.notEqual(createSectorArranger({ ...sector }).profile.name, original.profile.name);
  const replacement = { ...sector };
  state.world.sectors = { [sector.id]: replacement };
  configureRacingCorridorSession(state, true);
  assert.notEqual(createSectorArranger(sector).profile.name, original.profile.name);
  assert.equal(createSectorArranger(replacement).profile.name, original.profile.name);
  configureRacingCorridorSession(state, false);
  assert.notEqual(createSectorArranger(replacement).profile.name, original.profile.name);
});

test('solid kit props move at insertion only in a temporary circuit; campaign and ghost markers stay put', () => {
  const state = createGameState(9), level = RACE_LEVELS[0], plan = racingCorridorPlan(level.sectorId);
  state.world.sectors = { [level.sectorId]: { id: level.sectorId } };
  const spec = { pos: { ...plan.gates[0] }, radius: 48, collides: true,
    homeSectorId: level.sectorId, data: { placeId: 'place_container_rack', everydaySpaceKit: true } };
  assert.deepEqual(insertDressingRow(state, spec).pos, spec.pos);
  configureRacingCorridorSession(state, true);
  const temporary = insertDressingRow(state, spec);
  assert.ok(clearsRacingCorridor(plan, temporary.pos, temporary.radius));
  assert.deepEqual(insertDressingRow(state, { ...spec, collides: false }).pos, spec.pos);
  assert.deepEqual(spec.pos, plan.gates[0], 'caller-owned spec is preserved');
  configureRacingCorridorSession(state, false);
  assert.deepEqual(insertDressingRow(state, spec).pos, spec.pos);
});
