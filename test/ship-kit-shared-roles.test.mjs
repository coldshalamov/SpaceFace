import assert from 'node:assert/strict';
import test from 'node:test';

import { resolve as resolveLibraryMaterial, _resetForTest } from '../src/render/materialLibrary.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { buildKestrelHero } from '../src/render/ships/kestrelHero.js';
import { buildMeridianTrader } from '../src/render/ships/meridianTrader.js';
import { buildDriftBarge } from '../src/render/ships/driftBarge.js';
import { buildReaverPirate } from '../src/render/ships/reaverPirate.js';
import { buildVaelSniper } from '../src/render/ships/vaelSniper.js';
import { machineryMaterial, pbrHullMaterial, standardMaterial } from '../src/render/ships/shipKit.js';
import { ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';

const SHARED_ROLES = new Set(Object.values(SHARED_MATERIAL_ROLE));

function stubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    getImageData(_x, _y, width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
    measureText() { return { width: 10 }; },
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    lineWidth: 1,
    globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild() {}, addEventListener() {} }),
};

function collectLitMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        materials.push({ material, name: object.name || material.name || object.type });
      }
    }
  });
  return materials;
}

test.afterEach(() => _resetForTest());

test('kit-built hull paints share one shader family and keep their own maps', () => {
  const frontier = pbrHullMaterial({
    hull: '#315f83',
    accent: '#4ecbe0',
    seed: 11,
    panelCount: 12,
  });
  const rust = pbrHullMaterial({
    hull: '#6b3f2b',
    accent: '#c28b35',
    seed: 22,
    panelCount: 12,
  });

  assert.ok(frontier && rust, 'two painted kit hulls must exist');
  assert.notEqual(frontier.uuid, rust.uuid, 'each paint keeps its own material instance');
  assert.ok(frontier.map && rust.map, 'each paint binds a hull texture');
  assert.notEqual(frontier.map, rust.map, 'paint stays a per-hull texture bind');
  assert.equal(frontier.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(rust.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(
    frontier.userData.spacefaceProgramFamily,
    rust.userData.spacefaceProgramFamily,
    'a new kit hull must reuse the existing hull shader family',
  );
  assert.equal(frontier.userData.spacefaceBatchKey, undefined);
  assert.equal(rust.userData.spacefaceBatchKey, undefined);
});

test('library body and glass join the shared role handful', () => {
  const pal = { hull: '#315f83', accent: '#4ecbe0', emissive: '#4ecbe0' };
  const body = resolveLibraryMaterial('bodyPrimary', pal);
  const glass = resolveLibraryMaterial('glass', pal);

  assert.ok(SHARED_ROLES.has(body.userData.spacefaceSharedMaterialRole), 'bodyPrimary must carry a shared role');
  assert.ok(SHARED_ROLES.has(glass.userData.spacefaceSharedMaterialRole), 'glass must carry a shared role');
  assert.equal(body.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(glass.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.GLASS);
  assert.equal(body.userData.spacefaceBatchKey, undefined);
  assert.equal(glass.userData.spacefaceBatchKey, undefined);
});

test('hero hull and canopy are stamped onto shared families', () => {
  const root = buildKestrelHero({ radius: 14 });
  const lit = collectLitMaterials(root);
  assert.ok(lit.length > 0, 'hero must create lit materials');

  const hull = lit.find((entry) => (
    entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL
    && entry.material.transparent !== true
  ));
  const canopy = lit.find((entry) => (
    entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.CANOPY
    || entry.material.name === 'Kestrel_canopy'
  ));

  assert.ok(hull, 'hero hull/metal must stamp the hull family');
  assert.ok(canopy, 'hero canopy must stamp the canopy family');
  assert.equal(canopy.material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.CANOPY);
  assert.equal(hull.material.userData.spacefaceBatchKey, undefined);
  assert.equal(canopy.material.userData.spacefaceBatchKey, undefined);
});

test('procedural faction hulls inherit the illustrated surface light language', () => {
  // The remastered GLB fleet is shaped by installIllustratedSurface at authored admission. The
  // procedural faction builders and the Kestrel hero must join the same family instead of falling
  // back to plain physical lighting, or outside-Helios traffic reads as a different art style.
  const hull = pbrHullMaterial({ hull: '#5a4a44', accent: '#D8334A', seed: 7, panelCount: 10 });
  const plate = standardMaterial('#6b3f2b', 0.9, 0.06);
  const machine = machineryMaterial('#15100e', 0.6, 0.66);

  for (const [label, material] of [['pbrHull', hull], ['standard', plate], ['machinery', machine]]) {
    assert.equal(material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY,
      `${label} must install the illustrated surface`);
    assert.equal(material.customProgramCacheKey(), ILLUSTRATED_SURFACE_KEY,
      `${label} must share the single illustrated program family`);
    assert.equal(material.userData.spacefaceIllustratedPigment, undefined,
      `${label} keeps its baked palette; no double-painted fleet pigment`);
  }

  const heroHull = collectLitMaterials(buildKestrelHero({ radius: 14 }))
    .find((entry) => entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL
      && entry.material.transparent !== true);
  assert.equal(heroHull.material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY,
    'the Kestrel hero hull must join the illustrated surface family too');
});

test('Meridian cargo cap and nav lights follow their own damage roles', () => {
  const root = buildMeridianTrader({ radius: 16 });
  const cargo = root.getObjectByName('Meridian_Container_P1');
  const cap = root.getObjectByName('Meridian_Container_Cap_P1');
  const left = root.getObjectByName('Meridian_NavLight_Port');
  const right = root.getObjectByName('Meridian_NavLight_Starboard');
  assert.equal(cap.parent, cargo);
  assert.notEqual(left.material, right.material);
  assert.notEqual(left.material, cap.material);
  const accentIntensity = cap.material.emissiveIntensity;
  root.userData.updateDamageState({ hull: 10, hullMax: 100 }, 1);
  assert.equal(cargo.visible, false);
  assert.equal(cap.material.emissiveIntensity, accentIntensity);
  root.userData.updateDamageState({ hull: 100, hullMax: 100 }, 2);
  assert.equal(cargo.visible, true);
});

test('Drift deck grime sits above the cargo deck', () => {
  const root = buildDriftBarge({ radius: 16 });
  const stain = root.getObjectByName('Drift_Ore_Stain');
  assert.ok(stain, 'ore stain remains a separate decal');
  assert.ok(stain.position.y > 1.7 + 0.4 / 2, 'the decal is above the top of the deck plate');
});

test('Vael hull stations progress from aft to nose without folding back', () => {
  const root = buildVaelSniper({ radius: 16 });
  const positions = root.getObjectByName('Vael_Pressure_Hull').geometry.getAttribute('position');
  const stations = Array.from({ length: 6 }, (_, i) => positions.getX(i * 6));
  assert.ok(stations.every((x, i) => i === 0 || x > stations[i - 1]), `stations: ${stations}`);
});

test('Reaver damage changes its nav light without dimming drive accents', () => {
  const root = buildReaverPirate({ radius: 16 });
  const nav = root.getObjectByName('Reaver_Nav_Strobe');
  let accent;
  root.traverse((part) => { if (part.material?.name === 'Reaver_TagGlow') accent = part.material; });
  assert.ok(accent);
  assert.notEqual(nav.material, accent);
  const intensity = accent.emissiveIntensity;
  root.userData.updateDamageState({ hull: 30, hullMax: 100 }, 1);
  assert.equal(accent.emissiveIntensity, intensity);
  assert.ok(nav.material.emissiveIntensity < intensity);
});

test('Kestrel tier-three plume follows speed and the pod sheds as one assembly', () => {
  const root = buildKestrelHero({ radius: 14, data: { visualTier: 3 } });
  const plume = root.getObjectByName('Kestrel_Drive_Glow');
  const pod = root.getObjectByName('Kestrel_Utility_Pod_Starboard');
  const band = root.getObjectByName('Kestrel_Utility_Pod_Band');
  assert.equal(pod.parent, band.parent);
  root.userData.updateDriveState({ vel: { x: 0, z: 0 } });
  assert.equal(plume.material.opacity, 0);
  root.userData.updateDriveState({ vel: { x: 135, z: 0 } });
  assert.equal(plume.material.opacity, 0.74);
  root.userData.updateDamageState({ hull: 10, hullMax: 100 }, 1);
  assert.equal(pod.parent.visible, false);
  root.userData.updateDamageState({ hull: 100, hullMax: 100 }, 2);
  assert.equal(pod.parent.visible, true);
});
