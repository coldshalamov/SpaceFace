/**
 * CR-TEXTURE (build_map §23.2) — The Toll Saint's Toll-Box: a memorial destination on the
 * Tethys toll approach with REAL dark offerings — unlit cargo pods left for the lane's
 * toll-keeper (tally plates + the keepsake flight recorder). The first one-off with
 * collectable content.
 *
 * Seconds-scale contract test: the box and its piled-pods cluster land as dressing, the
 * `offerings` slots spawn unlit pickups owned by the one-off itself, a taken slot stays
 * empty for the visit, and the next materialization re-offers it — "the lane keeps
 * leaving tolls." Deterministic; no rng in the one-off pass.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world } from '../src/systems/world.js';

const BOX = WORLD_ONE_OFFS.find((o) => o.id === 'oneoff_toll_saint_box');
const SECTOR = SECTORS.find((s) => s.id === 'sector_tethys_junction');

function bootOneOffHarness() {
  const spawned = [];
  let nextId = 9001;
  const entities = new Map();
  const entityList = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        type: spec.type,
        alive: true,
        pos: { ...spec.pos },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        rot: spec.rot,
        angVel: spec.angVel,
        radius: spec.radius,
        mass: spec.mass,
        collides: spec.collides,
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
        flags: { ...(spec.flags || {}) },
        data: { ...spec.data },
      };
      spawned.push(ent);
      entities.set(ent.id, ent);
      entityList.push(ent);
      return ent;
    },
    removeEntity(id) {
      const e = entities.get(id);
      if (e) e.alive = false;
      return true;
    },
  };
  system.state = {
    entities,
    entityList,
    meta: { seed: 47 },
    world: { dressing: { rows: [] } },
  };
  const dressingRows = () => (system.state.world && system.state.world.dressing
    ? system.state.world.dressing.rows : []);
  return { system, spawned, dressingRows, entities };
}

test('the Toll Saint\'s Box is authored on the toll approach at Tethys', () => {
  assert.ok(BOX, 'the one-off exists');
  assert.equal(BOX.sectorId, 'sector_tethys_junction');
  assert.equal(BOX.anchor.id, 'station_customs', 'anchored to the customs gate itself');
  assert.ok(Array.isArray(BOX.offerings) && BOX.offerings.length === 3,
    'three offering slots: two plates and the keepsake');
  assert.equal(BOX.offerings[2].commodityId, 'cmdty_dmc_black_box',
    'the keepsake is the flight recorder every old crew leaves');
});

test('materializing the sector spawns the box, the piled toll, and three dark offerings', () => {
  const { system, spawned, dressingRows } = bootOneOffHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(SECTOR, active);

  const boxRows = dressingRows().filter((r) => r.data && r.data.name === BOX.name);
  assert.equal(boxRows.length, 1 + BOX.cluster.props.length,
    'the memorial plus its piled-pods cluster all land as dressing');

  const station = SECTOR.stations.find((s) => s.id === 'station_customs');
  const stationGlobal = sectorLocalToGlobalForSector(station.pos, SECTOR.id);
  const boxGlobal = {
    x: stationGlobal.x + BOX.offsetLocal.x,
    z: stationGlobal.z + BOX.offsetLocal.z,
  };
  assert.equal(boxRows[0].pos.x, boxGlobal.x, 'the box sits exactly where the data says');
  assert.equal(boxRows[0].pos.z, boxGlobal.z);

  const offerings = spawned.filter((e) => e.data && e.data.offeringFor === BOX.id);
  assert.equal(offerings.length, 3, 'one pod per authored slot');
  const slots = new Set(offerings.map((e) => e.data.offeringSlot));
  assert.deepEqual([...slots].sort(), [0, 1, 2], 'each slot filled once');

  for (const pod of offerings) {
    assert.equal(pod.type, 'payload', 'a real collectable cargo pod');
    assert.equal(pod.data.unlitDrop, true, 'dark — a silhouette find, no strobe');
    assert.equal(pod.data.anchored, true, 'the materialize sweep does not wipe it');
    assert.equal(pod.data.worldOneOff, true);
    assert.equal(pod.flags && pod.flags.persistent, false,
      'residency owns its exit — it re-offers next visit');
    assert.equal(pod.data.ownerId, BOX.id,
      'the offering belongs to the box — taking it answers the owned-cargo read');
  }
  const keepsake = offerings.find((e) => e.data.commodityId === 'cmdty_dmc_black_box');
  assert.ok(keepsake, 'the flight-recorder keepsake is there to find');
  assert.equal(keepsake.pos.x, boxGlobal.x + 10);
  assert.equal(keepsake.pos.z, boxGlobal.z + 30);

  assert.deepEqual(active.oneOffOfferings[BOX.id].length, 3, 'the visit ledger tracks the slots');
});

test('a taken offering stays empty for the visit and re-offers next materialization', () => {
  const { system, spawned, entities } = bootOneOffHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(SECTOR, active);
  const offerings = spawned.filter((e) => e.data && e.data.offeringFor === BOX.id);
  assert.equal(offerings.length, 3);

  // Re-materialize mid-visit: nothing duplicates while the pods are live.
  const active2 = { pois: [], stations: [], gates: [], dressing: [], oneOffOfferings: active.oneOffOfferings };
  system._spawnWorldOneOffs(SECTOR, active2);
  assert.equal(spawned.filter((e) => e.data && e.data.offeringFor === BOX.id).length, 3,
    'live slots are not re-spawned');

  // Take the keepsake — the slot stays empty for this visit...
  const keepsake = offerings.find((e) => e.data.commodityId === 'cmdty_dmc_black_box');
  entities.get(keepsake.id).alive = false;
  const active3 = { pois: [], stations: [], gates: [], dressing: [], oneOffOfferings: active.oneOffOfferings };
  system._spawnWorldOneOffs(SECTOR, active3);
  const afterTake = spawned.filter((e) => e.data && e.data.offeringFor === BOX.id);
  assert.equal(afterTake.length, 4, 'the taken slot re-offers on the next pass');
  const refilled = afterTake.filter((e) => e.data.offeringSlot === 2);
  assert.equal(refilled.length, 2, 'one dead taken pod, one fresh offering');
});
