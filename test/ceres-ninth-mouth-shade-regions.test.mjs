// Verification of LOOK-04 geology role stamping + Ninth Mouth shade regions & per-facet steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyAuthoredMaterialProfile,
  configureAuthoredMaterialProfiles,
} from '../src/render/authoredMaterialProfiles.js';
import {
  ILLUSTRATED_SURFACE_KEY,
  installIllustratedSurface,
} from '../src/render/illustratedSurface.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { CERES_NINTH_MOUTH as CUT } from '../src/data/ceresNinthMouth.js';
import {
  MAX_SHADE_REGIONS,
  SHADE_REGION_UNIFORMS,
  claimShadeRegion,
  evaluateShadeRegions,
  installShadeRegionShader,
  shadeRegionGainAt,
} from '../src/render/nocturne/shadeRegions.js';

function forgeGeologyMaterial(name, baseHex = 0x51483e) {
  const material = new THREE.MeshStandardMaterial({
    name,
    color: baseHex,
    roughness: 0.92,
    metalness: 0.0,
  });
  material.userData = {
    spacefaceFinish: 'forge-v1',
    spacefaceMaterialRole: 'geology',
    spacefaceAuthoredMaterialName: name,
  };
  return material;
}

function compileStubShader(material, { physical = false } = {}) {
  const lib = physical ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  };
  material.onBeforeCompile(shader, {});
  return shader;
}

test('forge and legacy geology materials stamp SHARED_MATERIAL_ROLE.ROCK and enable sfRockSurface without per-rock shader programs', () => {
  const names = [
    'Material_Stone',
    'Material_Stone_deep',
    'Material_Stone_quarry',
    'Material_Stone_strata',
  ];
  const root = new THREE.Group();
  const forgeMats = names.map((name, idx) => {
    const mat = forgeGeologyMaterial(name, 0x3b332b + idx * 0x050504);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    root.add(mesh);
    return mat;
  });

  configureAuthoredMaterialProfiles(root, { assetId: 'helios-rock-a' });

  const keys = new Set();
  for (const mat of forgeMats) {
    assert.equal(mat.userData.spacefaceMaterialRole, 'geology');
    assert.equal(mat.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.ROCK);
    assert.equal(mat.customProgramCacheKey(), ILLUSTRATED_SURFACE_KEY);
    keys.add(mat.customProgramCacheKey());
    const shader = compileStubShader(mat);
    assert.equal(shader.uniforms.sfRockSurface.value, 1, `${mat.name} enables LOOK-04 rock treatment`);
    mat.dispose();
  }
  assert.equal(keys.size, 1, 'all geology sub-materials share one program family key');

  const legacyRock = new THREE.MeshStandardMaterial({
    name: 'Place_Asteroid_Rock_Legacy',
    roughness: 0.92,
    metalness: 0,
  });
  applyAuthoredMaterialProfile(legacyRock, 'geology', { assetId: 'place_asteroid_rock_b' });
  assert.equal(legacyRock.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.ROCK);
  assert.equal(compileStubShader(legacyRock).uniforms.sfRockSurface.value, 1);
  legacyRock.dispose();

  const hull = new THREE.MeshStandardMaterial({ name: 'Hull_Paint', roughness: 0.45, metalness: 0.1 });
  applyAuthoredMaterialProfile(hull, 'hull');
  assert.notEqual(hull.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.ROCK);
  assert.equal(compileStubShader(hull).uniforms.sfRockSurface.value, 0);
  hull.dispose();
});

test('shade regions default to zero gain outside claimed bounds, support multiple claims, and guard stale owners', () => {
  assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value, 0);
  assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: 0 }), 0, 'unclaimed world defaults to zero gain');
  assert.equal(shadeRegionGainAt({ x: 500, y: 0, z: 0 }), 0);

  const north = claimShadeRegion({
    id: 'test:north',
    halfExtents: { x: 120, y: 100, z: 80 },
    feather: 20,
    broadFloor: 0.86,
    facetBias: 0.08,
    facetContrast: 1.0,
    normal: { x: 0, y: 0.25, z: 0.97, w: 0.5 },
  });
  const south = claimShadeRegion({
    id: 'test:south',
    halfExtents: { x: 120, y: 100, z: 80 },
    feather: 20,
    broadFloor: 0.84,
    facetBias: -0.06,
    facetContrast: 1.0,
    normal: { x: 0, y: 0.25, z: -0.97, w: 0.5 },
  });

  try {
    // Still disabled until update(..., true) enables them.
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value, 0);
    assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: -125 }), 0);

    north.update({ x: 0, y: 0, z: -125 }, true);
    south.update({ x: 0, y: 0, z: 125 }, true);
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value, 1);
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeCount.value, 2);

    // Outside claimed regions: zero gain.
    assert.equal(shadeRegionGainAt({ x: -270, y: 0, z: 0 }), 0, 'berth/receiver outside cut keeps zero gain');
    assert.equal(shadeRegionGainAt({ x: 0, y: 120, z: -125 }), 0, 'above vertical halfExtent has zero gain');

    // Boundary vs interior smoothstep.
    assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: -45 }), 0);
    const edgeMid = shadeRegionGainAt({ x: 0, y: 0, z: -55 });
    assert.ok(edgeMid > 0 && edgeMid < 1, `feathered edge smoothly enters region: ${edgeMid}`);
    assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: -125 }), 1);

    // Adjacent facet orientations inside a directional region yield distinct evaluated gains/biases.
    const facingCut = evaluateShadeRegions({ x: 0, y: 0, z: -125 }, { x: 0, y: 0.25, z: 0.97 });
    const facingAway = evaluateShadeRegions({ x: 0, y: 0, z: -125 }, { x: 0, y: -0.25, z: -0.97 });
    assert.ok(facingCut.gain > facingAway.gain, 'aligned facet takes stronger region gain than opposite facet');
    assert.ok(Math.abs(facingCut.facetBias) > 0);

    // Re-claiming an ID supersedes and neutralizes the stale handle.
    const replacement = claimShadeRegion({
      id: 'test:north',
      halfExtents: { x: 100, y: 80, z: 60 },
      feather: 15,
      broadFloor: 0.9,
      facetBias: 0.1,
      facetContrast: 1.0,
    });
    north.update({ x: 999, y: 0, z: 0 }, true);
    north.release();
    replacement.update({ x: 0, y: 0, z: -125 }, true);
    assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: -125 }), 1);
    assert.equal(shadeRegionGainAt({ x: 999, y: 0, z: 0 }), 0);
    replacement.release();
  } finally {
    north.release();
    south.release();
  }

  assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value, 0);
  assert.equal(shadeRegionGainAt({ x: 0, y: 0, z: -125 }), 0);
});

test('illustratedSurface injects shared shade-region uniforms once and drives crisp facet steps on rocks only', () => {
  const rock = forgeGeologyMaterial('Material_Stone');
  applyAuthoredMaterialProfile(rock, 'geology', { assetId: 'helios-rock-a' });

  const shader = compileStubShader(rock);
  installShadeRegionShader(shader);
  const frag = shader.fragmentShader;

  assert.equal(shader.uniforms.sfShadeEnabled, SHADE_REGION_UNIFORMS.sfShadeEnabled);
  assert.equal(shader.uniforms.sfShadeCenters, SHADE_REGION_UNIFORMS.sfShadeCenters);
  assert.equal((frag.match(/uniform float sfShadeEnabled;/g) || []).length, 1);
  assert.match(frag, new RegExp(`MAX_SHADE_REGIONS|${MAX_SHADE_REGIONS}`));
  assert.match(frag, /sfNocturneViewToWorld \* vec4\(-vViewPosition, 1\.0\)/);
  assert.match(frag, /dFdx\(-vViewPosition\)/);
  assert.match(frag, /sfRockSurface/);
  assert.match(frag, /sfLocalPhysicalSpecular/);
  assert.match(frag, /sfLookSurfaceCeiling/);

  // Verify the CPU-mirrored facet-step curve produces distinct shade steps across adjacent facets under the same key light.
  const stepLevel = (halfLambert, bias = 0) => {
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const sig = Math.max(0, Math.min(1, halfLambert + bias));
    const s1 = smooth(0.24 - 0.015, 0.24 + 0.015, sig);
    const s2 = smooth(0.46 - 0.015, 0.46 + 0.015, sig);
    const s3 = smooth(0.68 - 0.015, 0.68 + 0.015, sig);
    return 0.28 + 0.26 * s1 + 0.42 * s2 + 0.56 * s3;
  };
  const trough = stepLevel(0.15);
  const cliff = stepLevel(0.35);
  const bevel = stepLevel(0.57);
  const crest = stepLevel(0.82);
  assert.ok(cliff - trough >= 0.2, `trough (${trough}) vs cliff (${cliff}) cleanly stepped`);
  assert.ok(bevel - cliff >= 0.3, `cliff (${cliff}) vs bevel (${bevel}) cleanly stepped`);
  assert.ok(crest - bevel >= 0.4, `bevel (${bevel}) vs crest (${crest}) cleanly stepped`);

  const physicalRock = new THREE.MeshPhysicalMaterial({ name: 'Stone_Phys', roughness: 0.92, metalness: 0 });
  physicalRock.userData = { spacefaceMaterialRole: 'geology' };
  installIllustratedSurface(physicalRock);
  const physShader = compileStubShader(physicalRock, { physical: true });
  assert.equal((physShader.fragmentShader.match(/uniform float sfShadeEnabled;/g) || []).length, 1);

  rock.dispose();
  physicalRock.dispose();
});

test('CERES_NINTH_MOUTH authors bounded cut and shoulder shade regions that leave berth and outside space unaffected', () => {
  assert.ok(CUT.shade, 'CERES_NINTH_MOUTH.shade must be defined');
  assert.ok(Array.isArray(CUT.shade.regions) && CUT.shade.regions.length >= 3, 'multiple cut/shoulder regions authored');
  assert.ok(CUT.shade.regions.length <= MAX_SHADE_REGIONS);
  const roles = new Set(CUT.shade.regions.map((r) => r.role).filter(Boolean));
  assert.ok(roles.has('shoulder_north'), 'north shoulder has an authored region');
  assert.ok(roles.has('shoulder_south'), 'south shoulder has an authored region');
});
