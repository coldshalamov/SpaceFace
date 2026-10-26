import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RACE_CONTRACTS, RACE_LEVELS, RACING_CIRCUITS, raceLevelById, racingSeedFor } from '../src/data/raceLevels.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { createSectorArranger, segmentDistanceSquared } from '../src/world/arranger.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import {
  killMachinesForSector, VESTA_ORE_WINNOW,
  PALLAS_REEF_SECTOR_ID, PALLAS_REEF_MINES, PALLAS_REEF_MINE_BODY, pallasReefMinePos,
  APERTURE_SECTOR_ID, APERTURE_PLUG,
} from '../src/data/environmentalMachinery.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { configureRacingCorridorSession, racingCorridorPlan, clearsRacingCorridor } from '../src/world/racingCorridor.js';

function boot(sectorId, seed, temporary = true, noArrange = false) {
  const state = createGameState(seed), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  core.init(ctx);
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true,
    pos: { x: 0, z: 0 }, radius: 32, mass: 400, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, temporary);
  // No arranger and no session: every body holds its authored pose. The pairwise
  // diff below treats this run as the authored reference.
  if (noArrange) state.world.arrangementVersion = 0;
  world.enterSector(sectorId);
  return { state, world };
}

const home = row => row.homeSectorId || row.data?.homeSectorId;
const rocks = (state, sectorId) => [...(state.world.asteroidField?.rocks || []), ...state.entityList]
  .filter(row => row.alive !== false && row.type === 'asteroid' && home(row) === sectorId);
const snapshot = rows => rows.map(row => [row.id, row.pos.x, row.pos.z, row.radius, row.data?.typeId]);

test('all public temporary contracts build full-body clear course banks and starting grids', () => {
  for (const contract of RACE_CONTRACTS) {
    const level = raceLevelById(contract.levelId);
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

// Round-10 R-eb72c80 regression: a moved body must never land on another solid
// the membrane could not see — the kept authored pile (ladder boulders, optic
// cells), native standing solids (machinery anvils, reef mines, plugs, physical
// one-offs), or an earlier computed seat. The audit is a pairwise overlap diff
// against a no-arranger materialization of the same seed: an overlap that does
// not exist at authored poses is a stack the membrane itself made, while an
// authored overlap the session preserves is the author's own geometry.
const sectorSolids = (state, sectorId) => {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e.collides !== true || !e.pos) continue;
    // Mobile actors resolve their own contacts; only standing solids matter.
    if (e.type === 'ship' || e.isPlayer || e.id === state.playerId) continue;
    if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) continue;
    const r = (e.physicsBody && e.physicsBody.radius) || e.radius || 0;
    if (r > 0) out.push({ id: e.id, pos: e.pos, radius: r, data: e.data });
  }
  for (const row of state.world.asteroidField?.rocks || []) {
    if (!row || row.alive === false || !row.pos || row.liveEntityId != null) continue;
    if (row.homeSectorId !== sectorId) continue;
    out.push({ id: row.id, pos: row.pos, radius: row.radius, data: row.data });
  }
  for (const row of state.world.dressing?.rows || []) {
    if (!row || row.alive === false || row.collides !== true || !row.pos) continue;
    if (row.homeSectorId !== sectorId) continue;
    out.push({ id: row.id, pos: row.pos, radius: row.radius, data: row.data });
  }
  return out;
};
const overlapPairs = (rows) => {
  const keys = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < a.radius + b.radius - 0.5) {
        keys.push(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
      }
    }
  }
  return keys;
};

test('racing materialization adds no solid-on-solid stacks', () => {
  for (const level of RACING_CIRCUITS) {
    const seed = racingSeedFor(`practice_${level.id}`);
    const racing = overlapPairs(sectorSolids(boot(level.sectorId, seed).state, level.sectorId));
    const authored = new Set(overlapPairs(sectorSolids(boot(level.sectorId, seed, false, true).state, level.sectorId)));
    assert.deepEqual(racing.filter((key) => !authored.has(key)), [], level.id);
  }
});

// The machinery layer's anvils, furniture banks, reef mines, aperture plugs and
// the physical world one-offs spawn AFTER the field pass through no scenery
// hook. They enter the plan as reservations, so no settled body — banked rock,
// reseated boulder, shifted prop — may overlap the volume they occupy.
test('native standing solids are reserved before any movable seat', () => {
  const sectorById = new Map(SECTORS.map((s) => [s.id, s]));
  const staticsFor = (sectorId) => {
    const marks = [];
    for (const machine of killMachinesForSector(sectorId) || []) {
      if (machine?.anvil) marks.push({ pos: machine.anvil.pos, radius: machine.anvil.radius, id: machine.anvil.id });
      for (const bank of machine.furniture || []) marks.push({ pos: bank.pos, radius: bank.radius, id: bank.id });
    }
    if (sectorId === PALLAS_REEF_SECTOR_ID) {
      PALLAS_REEF_MINES.forEach((slot, i) => marks.push({
        pos: pallasReefMinePos(slot), radius: PALLAS_REEF_MINE_BODY.radius, id: `reef_${i}`,
      }));
    }
    if (sectorId === VESTA_ORE_WINNOW.sectorId) {
      for (const bank of VESTA_ORE_WINNOW.furniture || []) {
        marks.push({ pos: bank.pos, radius: bank.radius, id: bank.id });
      }
    }
    if (sectorId === APERTURE_SECTOR_ID) marks.push({ pos: APERTURE_PLUG.pos, radius: APERTURE_PLUG.radius, id: APERTURE_PLUG.id });
    const sector = sectorById.get(sectorId), origin = sectorGlobalOrigin(sectorId);
    for (const oneOff of WORLD_ONE_OFFS) {
      if (oneOff.sectorId !== sectorId || !oneOff.physicalBody) continue;
      const row = oneOff.anchor?.type === 'station'
        ? (sector?.stations || []).find((s) => s.id === oneOff.anchor.id)
        : (sector?.gates || []).find((g) => g.to === oneOff.anchor?.id);
      if (!row?.pos) continue;
      marks.push({
        pos: { x: row.pos.x + oneOff.offsetLocal.x + origin.x, z: row.pos.z + oneOff.offsetLocal.z + origin.z },
        radius: oneOff.radius || 20, id: oneOff.id,
      });
    }
    return marks;
  };
  for (const level of RACING_CIRCUITS) {
    const seed = racingSeedFor(`practice_${level.id}`);
    const { state } = boot(level.sectorId, seed);
    const bodies = sectorSolids(state, level.sectorId);
    for (const mark of staticsFor(level.sectorId)) {
      for (const body of bodies) {
        // The reserved mark's own body (a spawned one-off entity) occupies the point.
        if (body.data && body.data.oneOffId === mark.id) continue;
        const d = Math.hypot(body.pos.x - mark.pos.x, body.pos.z - mark.pos.z);
        assert.ok(d >= body.radius + mark.radius - 0.5,
          `${level.id}: body ${body.id} invades reserved ${mark.id} (${d.toFixed(1)} < ${(body.radius + mark.radius).toFixed(1)})`);
      }
    }
  }
});
