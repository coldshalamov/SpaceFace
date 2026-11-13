// LOOK-05D: the Foundry's shops are landmarks, so nothing stands on them. Every authored opening
// bank and every seeded ring rock keeps a clear apron around each pad, and every pad declares
// its own NOCTURNE light so it reads as a pool of light on a dark floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWARM_FLOOR_PLANS, swarmPadNocturne, swarmFloorKeepClear } from '../src/data/swarmFloor.js';
import { planSwarmOpeningTerrain, swarmOpeningTerrainStage } from '../src/data/swarmOpeningTerrain.js';
import { planSwarmDebris, withShopAprons } from '../src/systems/swarmArena.js';
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
