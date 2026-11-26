// LOOK-05D: the Foundry's shops are landmarks, so nothing stands on them. Every authored opening
// bank and every seeded ring rock keeps a clear apron around each pad, and every pad declares
// its own NOCTURNE light so it reads as a pool of light on a dark floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWARM_FLOOR_APRON_WU, SWARM_FLOOR_CRATE_RADIUS, SWARM_FLOOR_PLANS,
  swarmPadNocturne, swarmFloorKeepClear,
} from '../src/data/swarmFloor.js';
import { planSwarmOpeningTerrain, swarmOpeningTerrainStage } from '../src/data/swarmOpeningTerrain.js';
import { planSwarmDebris, withShopAprons } from '../src/systems/swarmArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import {
  OPENING_ANCHOR_DIST, OPENING_ANCHOR_SIZE, OPENING_CORRIDOR_HALF, segmentDistance, terrainAnchors,
} from '../src/systems/terrainAnchors.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { swarmArenaTierForRun, swarmArenaDebrisLayout } from '../src/data/swarmArenaLadder.js';
import { NOCTURNE_LIGHT_PROFILES } from '../src/data/nocturneLighting.js';
import { validateNocturneLightMetadata, validateNocturneMediumMetadata } from '../src/render/nocturne/content.js';

const plan = SWARM_FLOOR_PLANS.helios_core;
const pads = [
  ...plan.wallGuns.map((g) => ({ x: g.dx, z: g.dz, r: 12 })),
  ...plan.crateSpots.map((c) => ({ x: c.dx, z: c.dz, r: 14 })),
  { x: plan.forge.dx, z: plan.forge.dz, r: 16 },
  ...plan.taps.map((t) => ({ x: t.dx, z: t.dz, r: 12 })),
];
const baseLayout = swarmArenaDebrisLayout(swarmArenaTierForRun({ wave: 1, ratingT: 0 }));
const layout = withShopAprons(baseLayout, 'helios_core');

test('authored opening banks leave every shop its apron', () => {
  for (const wave of [1, 2, 3]) {
    const stage = swarmOpeningTerrainStage({ arenaId: 'helios_core', wave, lineTier: 0 });
    const spots = planSwarmOpeningTerrain({ stage, anchor: { x: 0, z: 0 }, layout: baseLayout, want: 14 });
    assert.equal(spots.length, stage.count);
    for (const spot of spots) {
      for (const pad of pads) {
        const gap = Math.hypot(spot.x - pad.x, spot.z - pad.z) - spot.radius - pad.r;
        assert.ok(gap >= 8, `wave ${wave} bank at ${spot.x},${spot.z} sits on a pad at ${pad.x},${pad.z} (gap ${gap.toFixed(0)})`);
      }
    }
  }
});

test('Foundry opening encounter anchors leave room to reach the active Crate', () => {
  const savedFlags = snapshotFeatureMaps();
  const at = { x: -1900, z: -2200 };
  const crate = plan.crateSpots[0];
  const admit = (seed, arenaId) => {
    const bus = createBus();
    const pilot = { id: 1, type: 'ship', alive: true, radius: 16, pos: at };
    const state = { run: { ruleset: 'swarm', arenaId, seed }, meta: { seed }, simTime: 0,
      playerId: pilot.id, entityList: [pilot], entities: new Map([[pilot.id, pilot]]) };
    const anchors = Object.create(terrainAnchors);
    anchors.init({ state, bus, helpers: {
      hash32, mulberry32,
      spawnEntity(spec) {
        const entity = { ...spec, id: state.entityList.length + 1, alive: true };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
    } });
    try {
      const room = Object.assign(Object.create(survivalArena), { state, bus });
      room._installCover(true, 1);
      return state.entityList.slice(1);
    } finally {
      anchors.destroy();
    }
  };
  try {
    MASSLINE2_FLAGS.enabled = true;
    MASSLINE2_FLAGS.terrainAnchors = true;
    for (const seed of [...Array.from({ length: 360 }, (_, index) => index + 1), 4242]) {
      const rocks = admit(seed, 'helios_core');
      const ordinary = admit(seed, 'ceres_belt');
      const physical = rock => [rock.radius, rock.physicsBody.radius, rock.mass, rock.vel, rock.angVel];
      assert.deepEqual(rocks.map(physical), ordinary.map(physical), `seed ${seed} keeps the same seeded rocks and spins`);
      const [opening, ...banks] = rocks;
      assert.equal(opening.radius, OPENING_ANCHOR_SIZE);
      assert.ok(Math.abs(Math.hypot(opening.pos.x - at.x, opening.pos.z - at.z) - OPENING_ANCHOR_DIST) < 1e-7);
      for (const rock of rocks) {
        const gap = Math.hypot(rock.pos.x - at.x - crate.dx, rock.pos.z - at.z - crate.dz)
          - rock.physicsBody.radius - SWARM_FLOOR_CRATE_RADIUS;
        assert.ok(gap >= SWARM_FLOOR_APRON_WU, `seed ${seed} puts an anchor in the Crate apron (gap ${gap.toFixed(1)})`);
      }
      for (const rock of banks) {
        assert.ok(segmentDistance(at.x, at.z, opening.pos.x, opening.pos.z, rock.pos.x, rock.pos.z)
          >= OPENING_CORRIDOR_HALF, `seed ${seed} leaves the throw anchor reachable`);
      }
      if (seed === 4242) assert.deepEqual(rocks.map(rock => rock.pos), ordinary.map(rock => rock.pos));
    }
  } finally {
    restoreFeatureMaps(savedFlags);
  }
});

test('the seeded ring keeps a clear apron around every shop', () => {
  assert.ok(Array.isArray(layout.keepClear) && layout.keepClear.length === pads.length);
  assert.deepEqual(swarmFloorKeepClear('helios_core').length, pads.length);
  for (const seed of [4242, 7, 99, 31337]) {
    let state = seed >>> 0;
    const rng = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const spots = planSwarmDebris({ anchor: { x: 500, z: -300 }, want: 14, rng, layout });
    assert.ok(spots.length >= 8, `seed ${seed} placed only ${spots.length}`);
    for (const spot of spots) {
      for (const pad of pads) {
        const gap = Math.hypot(spot.x - 500 - pad.x, spot.z + 300 - pad.z) - spot.radius - pad.r;
        assert.ok(gap >= 24, `seed ${seed}: rock r${Math.round(spot.radius)} is ${gap.toFixed(0)} from a pad`);
      }
    }
  }
});

test('every pad kind declares a valid NOCTURNE light, and only a few carry haze', () => {
  let hazy = 0;
  for (const kind of ['wall_gun', 'crate', 'forge', 'tap']) {
    const meta = swarmPadNocturne(kind);
    assert.ok(meta && ['industrial', 'dock'].includes(meta.profile) && meta.lights.length >= 1, kind);
    for (const light of meta.lights) {
      assert.deepEqual(validateNocturneLightMetadata(light), [], kind);
      assert.ok(NOCTURNE_LIGHT_PROFILES[light.profile], kind);
    }
    if (meta.medium) { hazy++; assert.deepEqual(validateNocturneMediumMetadata(meta.medium), [], kind); }
  }
  // Two wall guns + the Forge share the pool of four haze volumes with the furnace.
  assert.ok(hazy <= 2, 'at most the wall gun and the forge kinds carry haze');
});

test('the Foundry rim: twelve plates at the room edge, clear of every shop, gate post and the rock band', async () => {
  const { planFoundryRim, FOUNDRY_RIM_COUNT, FOUNDRY_RIM_RADIUS_WU, FOUNDRY_RIM_HALF_WIDTH_WU } = await import('../src/systems/survivalArena.js');
  const { SWARM_DEBRIS_OUTER, SWARM_DEBRIS_SIZE_MAX } = await import('../src/systems/swarmArena.js');
  const { GATE_BEARINGS } = await import('../src/systems/waveMaterialization.js');
  const at = { x: 1000, z: -500 };
  const rim = planFoundryRim({ at });
  assert.equal(rim.length, FOUNDRY_RIM_COUNT);
  assert.deepEqual(rim, planFoundryRim({ at }), 'authored, no RNG');
  assert.ok(FOUNDRY_RIM_RADIUS_WU - 20 > SWARM_DEBRIS_OUTER + SWARM_DEBRIS_SIZE_MAX, 'rim is beyond the rock band');
  // Distance from a point to the plate's oriented box (tangent half-width, 17 WU half-depth).
  const boxGap = (plate, px, pz) => {
    const rx = plate.pos.x - at.x, rz = plate.pos.z - at.z;
    const tx = -plate.normal.z, tz = plate.normal.x;
    const du = Math.max(0, Math.abs((px - rx) * tx + (pz - rz) * tz) - plate.halfWidth);
    const dv = Math.max(0, Math.abs((px - rx) * plate.normal.x + (pz - rz) * plate.normal.z) - 17);
    return Math.hypot(du, dv);
  };
  for (const plate of rim) {
    const rx = plate.pos.x - at.x, rz = plate.pos.z - at.z;
    assert.ok(Math.abs(Math.hypot(rx, rz) - FOUNDRY_RIM_RADIUS_WU) < 1e-6);
    assert.ok(Math.abs(plate.normal.x * rx + plate.normal.z * rz + FOUNDRY_RIM_RADIUS_WU) < 1e-6, 'faces the room');
    for (const pad of pads) assert.ok(boxGap(plate, pad.x, pad.z) > pad.r + 24, `plate clear of a shop (${Math.round(boxGap(plate, pad.x, pad.z))})`);
    for (const g of Object.values(GATE_BEARINGS)) for (const side of [-1, 1]) {
      const gx = g.x * 320 + -g.z * 110 * side, gz = g.z * 320 + g.x * 110 * side;
      assert.ok(boxGap(plate, gx, gz) > 16 + 20, `plate clear of a gate post (${Math.round(boxGap(plate, gx, gz))})`);
    }
  }
  const chord = 2 * FOUNDRY_RIM_RADIUS_WU * Math.sin(Math.PI / FOUNDRY_RIM_COUNT);
  assert.ok(chord - 2 * FOUNDRY_RIM_HALF_WIDTH_WU >= 40, 'a hull fits between neighbours');
});
