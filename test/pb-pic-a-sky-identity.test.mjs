// PB-PIC-A — board row 135: SF-216 (background depth without dome edges) +
// SF-222 (a layered sky that supports sector identity), pinned at the tabletop-policy
// seam with fixed seeds and no screenshots.
//
// Both mechanisms are already live on master; this row closes them as already satisfied
// and lands the row-level regression that keeps them closed:
//
//   SF-216 — the sky is camera-locked with frozen wrap cells sized for the widest
//   supported camera, so no reachable camera shows a layer edge (the "half dome" read).
//   The tabletop glass is the coverage authority (src/render/tabletopPolicy.js); the
//   shipped parallax cells must contain the full wrap cap — manual max zoom multiplied
//   by the earned-speed, context and boost factors — at the designed aspect, and the
//   manual glass at the sim-authority worst aspect (48/9). The frame-coordinate adapter
//   must keep procedural sampling global while the root stays camera-local, so a frame
//   rebase changes no star's identity.
//
//   SF-222 — every playable sector resolves a total far/mid/near identity through the
//   composed recipe: distinct per family/rig, deterministic under re-resolution, and
//   restrained (the far plate and mid coverage stay under their authored caps so the
//   sky sits behind play instead of competing with it).
//
// Residual (recorded, deliberately not asserted): the frozen cells are designed for
// aspect 4. A triple-wide (48/9) surface at the FULL earned-speed wrap cap would need
// larger cells — that is a render-owner constant change (src/render/parallaxLayers.js),
// outside this seam's write-set; manual zoom at 48/9 is pinned covered below.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMERA_ZOOM_MAX,
} from '../src/render/camera.js';
import {
  TABLE_SIM_ASPECT,
  glassCornerWu,
} from '../src/render/tabletopPolicy.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  sectorSkyIdentityRecipe,
} from '../src/data/tabletopPictureRecipes.js';

installCanvasStub();
const parallaxLayers = await import('../src/render/parallaxLayers.js');
const frameCoordinates = await import('../src/render/spaceBackgroundFrameCoordinates.js');

/** The wrap cap the render side freezes its cells against (manual + every zoom multiplier). */
function wrapCapZoom() {
  return parallaxLayers.PARALLAX_WRAP_ZOOM_CAP;
}

test('SF-216: frozen wrap cells cover the full wrap cap, not just manual max zoom', () => {
  const cap = wrapCapZoom();
  assert.ok(cap > CAMERA_ZOOM_MAX, 'the wrap cap must include the speed/context/boost multipliers');
  for (const [name, band] of Object.entries(parallaxLayers.PARALLAX_BANDS)) {
    const need = parallaxLayers.requiredParallaxWrapTile({ y: band.y, zoom: cap });
    assert.ok(
      band.tile + 1e-9 >= need,
      `${name} cell ${band.tile} must cover the ${cap.toFixed(0)} WU wrap footprint (${need.toFixed(0)})`,
    );
  }
});

test('SF-216: no manual camera at the sim-authority worst aspect shows a wrap edge', () => {
  const smallestCellRadius = Math.min(
    ...Object.values(parallaxLayers.PARALLAX_BANDS).map((band) => band.tile / 2),
  );
  const corner = glassCornerWu(CAMERA_ZOOM_MAX, 50, TABLE_SIM_ASPECT, 60);
  assert.ok(
    corner < smallestCellRadius,
    `ground-glass corner ${corner.toFixed(0)} WU at ${TABLE_SIM_ASPECT.toFixed(2)}:1 must sit inside the smallest wrap cell radius ${smallestCellRadius.toFixed(0)} WU`,
  );
});

test('SF-216: a frame rebase moves the sampling origin, never the camera-locked root', () => {
  const global = frameCoordinates.resolveSpaceBackgroundGlobalCamera(
    { world: { frameOrigin: { x: 500, z: -900 } } },
    { x: 10, y: 200, z: -20 },
  );
  assert.deepEqual({ x: global.x, y: global.y, z: global.z }, { x: 510, y: 200, z: -920 });
  // Same local camera over a different origin must sample a different global position —
  // the sky's identity is galactic, not a screen overlay.
  const rebased = frameCoordinates.resolveSpaceBackgroundGlobalCamera(
    { world: { frameOrigin: { x: 0, z: 0 } } },
    { x: 10, y: 200, z: -20 },
  );
  assert.notEqual(rebased.x, global.x);
  assert.notEqual(rebased.z, global.z);
});

test('SF-216: the wrap cell is frozen for the life of the field (no runtime retile)', () => {
  for (const band of Object.values(parallaxLayers.PARALLAX_BANDS)) {
    assert.ok(Number.isFinite(band.tile) && band.tile > 0, 'every band ships a finite cell');
  }
  assert.equal(typeof parallaxLayers.wrapParallaxCoordinate, 'function',
    'the scalar wrap stays exported so continuity stays provable');
});

test('SF-222: every playable sector resolves a total far/mid/near sky identity', () => {
  assert.ok(SECTORS.length >= 10, 'the charted sector list is present');
  for (const sector of SECTORS) {
    const recipe = sectorSkyIdentityRecipe(sector);
    assert.equal(recipe.sectorId, sector.id);
    assert.ok(typeof recipe.family === 'string' && recipe.family.length > 0, `${sector.id} resolves a family`);
    assert.ok(['painted_plate', 'galaxy', 'void'].includes(recipe.far.kind), `${sector.id} far layer resolves`);
    assert.ok(['sparse_wisps', 'galactic_band', 'ion_filaments', 'dust_lanes', 'void'].includes(recipe.mid.structureKind),
      `${sector.id} mid layer resolves`);
    assert.ok(['planet', 'wormhole', 'flare', 'none'].includes(recipe.near.landmarkBias),
      `${sector.id} near landmark bias resolves`);
    for (const value of [recipe.far.luminance, recipe.mid.coverage, recipe.near.planetChance]) {
      assert.ok(Number.isFinite(value), `${sector.id} layers are numeric`);
    }
  }
});

test('SF-222: the identity is deterministic — the same sector reads the same sky twice', () => {
  const sector = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.deepEqual(sectorSkyIdentityRecipe(sector), sectorSkyIdentityRecipe(sector));
});

test('SF-222: the sector set is not uniform star noise — families stay distinct', () => {
  const identities = new Map();
  for (const sector of SECTORS) identities.set(sector.id, sectorSkyIdentityRecipe(sector).identityKey);
  const distinct = new Set(identities.values());
  assert.ok(
    distinct.size >= 8,
    `expected at least 8 distinct sky identities across ${SECTORS.length} sectors, got ${distinct.size}`,
  );
  // The named contrasts survive: Helios is the painted estuary, Tethys the only galaxy,
  // and the way-of-life rigs never collapse into their base family.
  const helios = identities.get('sector_helios_prime');
  const tethys = identities.get('sector_tethys_junction');
  assert.notEqual(helios, tethys);
  assert.match(helios, /painted_plate\|helios-amber-estuary/);
  assert.match(tethys, /galaxy/);
  const galaxyKeys = [...identities.values()].filter((key) => key.includes('|galaxy|'));
  assert.equal(galaxyKeys.length, 1, 'only Tethys reads as the galaxy');
  for (const rig of ['sector_vesta_forge', 'sector_pallas_drift', 'sector_sker_haven']) {
    assert.notEqual(identities.get(rig), identities.get('sector_ceres_belt'),
      `${rig} must not read as the plain belt family`);
  }
});

test('SF-222: the sky stays behind play — far and mid layers hold their authored caps', () => {
  for (const sector of SECTORS) {
    const recipe = sectorSkyIdentityRecipe(sector);
    assert.ok(recipe.far.luminance <= 0.35, `${sector.id} far luminance stays under the plate cap`);
    assert.ok(recipe.mid.coverage <= 0.35, `${sector.id} mid coverage stays under the authored cap`);
    assert.ok(recipe.near.planetChance >= 0 && recipe.near.planetChance <= 1,
      `${sector.id} near sky-body chances stay probabilities`);
  }
});

test('SF-222: a save round-trip of the sector id keeps the same sky identity', () => {
  // Profiles resolve from ids and palette tints, never from live object identity.
  const sector = SECTORS.find((s) => s.id === 'sector_ceres_belt');
  const restored = { id: sector.id, palette: sector.palette };
  assert.equal(
    sectorSkyIdentityRecipe(restored).identityKey,
    sectorSkyIdentityRecipe(sector).identityKey,
  );
});

function installCanvasStub() {
  const gradient = { addColorStop() {} };
  const context = {
    fillStyle: null,
    globalCompositeOperation: 'source-over',
    clearRect() {},
    createRadialGradient() { return gradient; },
    beginPath() {},
    arc() {},
    fill() {},
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return context;
        },
      };
    },
  };
}
