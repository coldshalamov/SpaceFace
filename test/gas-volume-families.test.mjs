// Gas / smoke / dust — the four families must stay four MATERIALS, not one smoke with four tints.
//
// The failures this guards against are the ones the bake actually hit during authoring, so every
// assertion here corresponds to a defect that was real at some point:
//
//   * a film that quantises flat and stops evolving (fracture dust, after a max-normalised bake)
//   * a body that relaxes into a featureless ball with no lobes and no cavities (combustion, after
//     a per-step blur that integrated to sigma ~7 voxels)
//   * families that converge onto the same response curve, which is the "one smoke, four tints"
//     outcome the brief exists to prevent
//   * a pool that costs frame time while empty, or advances while the sim clock is paused
//   * an impact emitter that invents a direction from an UNSIGNED collision axis
//
// Deliberately NOT asserted: any pixel. GPU behaviour belongs to check:shader-compile.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { GAS_FILM, GAS_FAMILY_FILMS, decodeGasFilm } from '../src/render/combat/gas/gasVolumeData.js';
import { GAS_FAMILIES, GAS_FAMILY_BY_ID, gasFamilyForImpact, gasFilmFor } from '../src/render/combat/gas/gasFamilies.js';
import { createGasVolumeMaterial, createGasVolumeTextures, packCellBounds } from '../src/render/combat/gas/gasVolumeMaterial.js';
import { createGasSystem, GAS_VOLUME_CAPACITY } from '../src/render/combat/gas/gasVolumeField.js';
import { createImpactRecord, makeImpactRecord } from '../src/render/combat/impactEventRecord.js';

const G = GAS_FILM.grid;
const [AX, AY] = GAS_FILM.atlas;
const CELL_VOXELS = G * G * G;

let cached = null;
function film() {
  if (!cached) cached = decodeGasFilm();
  return cached;
}

/** Read (density, aux) at a voxel of an atlas cell. */
function voxel(density, cell, x, y, z) {
  const cx = cell % AX;
  const cy = Math.floor(cell / AX) % AY;
  const cz = Math.floor(cell / (AX * AY));
  const i = (((cz * G + z) * (AY * G) + (cy * G + y)) * (AX * G) + (cx * G + x)) * 2;
  return [density[i], density[i + 1]];
}

function cellStats(density, cell) {
  let occupied = 0;
  let auxOccupied = 0;
  let sum = 0;
  for (let z = 0; z < G; z++) {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const [d, a] = voxel(density, cell, x, y, z);
        if (d > 8) { occupied++; sum += d; }
        if (a > 8) auxOccupied++;
      }
    }
  }
  return { occupancy: occupied / CELL_VOXELS, auxOccupancy: auxOccupied / CELL_VOXELS, mean: sum / Math.max(1, occupied) };
}

function meanFrameDelta(density, cellA, cellB) {
  let total = 0;
  for (let z = 0; z < G; z++) {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        total += Math.abs(voxel(density, cellA, x, y, z)[0] - voxel(density, cellB, x, y, z)[0]);
      }
    }
  }
  return total / CELL_VOXELS;
}

function harness() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 5000);
  camera.position.set(0, 140, 0);
  return { scene, camera, gas: createGasSystem(scene) };
}

// ---------------------------------------------------------------------------------------------
// The baked payload
// ---------------------------------------------------------------------------------------------

test('the payload decodes to exactly the atlas the metadata describes', () => {
  const { density, motion } = film();
  assert.equal(density.length, GAS_FILM.densityTextureBytes);
  assert.equal(motion.length, GAS_FILM.motionTextureBytes);
  assert.equal(GAS_FILM.usedCells, GAS_FAMILY_FILMS.reduce((n, f) => n + f.frames, 0));
  assert.ok(GAS_FILM.usedCells <= GAS_FILM.slots,
    `${GAS_FILM.usedCells} cells do not fit ${GAS_FILM.slots} atlas slots`);
  // Every atlas dimension has to stay under WebGL2's guaranteed 256-texel 3D limit.
  for (const [i, cells] of GAS_FILM.atlas.entries()) {
    assert.ok(cells * G <= 256, `atlas axis ${i} is ${cells * G} texels, over the guaranteed 256`);
  }
});

test('every family ships a film with matching frame and bounds counts', () => {
  for (const family of GAS_FAMILIES) {
    const f = gasFilmFor(family);
    assert.ok(f, `family ${family.id} has no baked film`);
    assert.equal(f.bounds.length, f.frames * 6, `${family.id} bounds do not cover its frames`);
    assert.ok(f.frames >= 4, `${family.id} has only ${f.frames} frames`);
  }
  // Cell ranges must not overlap, or one family would play another's matter.
  const claimed = new Set();
  for (const f of GAS_FAMILY_FILMS) {
    for (let i = 0; i < f.frames; i++) {
      const cell = f.cellOffset + i;
      assert.ok(!claimed.has(cell), `cell ${cell} claimed twice`);
      claimed.add(cell);
    }
  }
});

test('no family is a static volume — every film measurably evolves frame to frame', () => {
  const { density } = film();
  for (const family of GAS_FAMILIES) {
    const f = gasFilmFor(family);
    let total = 0;
    for (let i = 1; i < f.frames; i++) {
      total += meanFrameDelta(density, f.cellOffset + i - 1, f.cellOffset + i);
    }
    const delta = total / (f.frames - 1);
    // A frozen translucent body is the rejection this guards. The first fracture-dust bake
    // measured 0.005 levels/frame after a max-normalised quantise; anything at that scale is
    // a still image with a fade on it.
    assert.ok(delta > 0.05,
      `${family.id} changes only ${delta.toFixed(4)} levels per frame — that is a static volume`);
  }
});

test('every family has matter AND openings — neither empty nor a solid block', () => {
  const { density } = film();
  for (const family of GAS_FAMILIES) {
    const f = gasFilmFor(family);
    for (let i = 0; i < f.frames; i++) {
      const stats = cellStats(density, f.cellOffset + i);
      assert.ok(stats.occupancy > 0.002,
        `${family.id} frame ${i} is effectively empty (${(stats.occupancy * 100).toFixed(2)}%)`);
      // A body that fills its own support has no silhouette and no openings to read through.
      assert.ok(stats.occupancy < 0.80,
        `${family.id} frame ${i} fills ${(stats.occupancy * 100).toFixed(1)}% of its box — no openings left`);
    }
  }
});

test('the four families are different matter, not one film played four times', () => {
  const { density } = film();
  const firstCells = GAS_FAMILIES.map((fam) => gasFilmFor(fam).cellOffset);
  for (let a = 0; a < firstCells.length; a++) {
    for (let b = a + 1; b < firstCells.length; b++) {
      const delta = meanFrameDelta(density, firstCells[a], firstCells[b]);
      assert.ok(delta > 1.0,
        `${GAS_FAMILIES[a].id} and ${GAS_FAMILIES[b].id} differ by only ${delta.toFixed(3)} levels`);
    }
  }
});

test('the aux channel means something different in each family', () => {
  // The shader has no per-family branch: these coefficients ARE the material difference, so if
  // they ever converge the four families quietly become one smoke with four tints.
  const { combustion, dust, vent, ambient } = GAS_FAMILY_BY_ID;
  assert.ok(combustion.emissionGain > 1, 'burnt gas must self-light from its temperature channel');
  assert.equal(dust.emissionGain, 0, 'rock flour must never emit light');
  assert.ok(dust.grainGain > 0.3, 'coarse grain must darken the body against the fine haze');
  assert.equal(combustion.grainGain, 0, 'combustion has no grain channel');
  assert.ok(vent.auxWarmth > 0.5, 'condensate must whiten the plume downstream');
  assert.ok(vent.emissionGain < 0.5, 'coolant is cold — it scatters, it does not burn');
  assert.ok(ambient.absorbGain < combustion.absorbGain / 3,
    'environmental gas must stay optically thin enough to read the fight through');
  // Distinct extinction is what makes them feel like different substances at the same size.
  const gains = GAS_FAMILIES.map((f) => f.absorbGain).sort((x, y) => x - y);
  for (let i = 1; i < gains.length; i++) {
    assert.ok(gains[i] - gains[i - 1] > 1, `absorb gains ${gains.join(', ')} are too close together`);
  }
});

test('baked bounds are tight enough to be worth marching', () => {
  // The whole point of shipping per-frame bounds is that the proxy box and the ray span shrink.
  // If every frame filled the unit cube this machinery would be dead weight.
  let tightest = 1;
  for (const f of GAS_FAMILY_FILMS) {
    for (let i = 0; i < f.frames; i++) {
      const b = f.bounds.slice(i * 6, i * 6 + 6);
      for (let k = 0; k < 3; k++) assert.ok(b[k + 3] >= b[k], 'bounds max below min');
      const volume = (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
      if (volume < tightest) tightest = volume;
    }
  }
  assert.ok(tightest < 0.25,
    `tightest frame still occupies ${(tightest * 100).toFixed(1)}% of its box — bounds buy nothing`);
});

// ---------------------------------------------------------------------------------------------
// The material
// ---------------------------------------------------------------------------------------------

test('the material is a depth-writing premultiplied volume, not an additive card', () => {
  const material = createGasVolumeMaterial(createGasVolumeTextures());
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendSrc, THREE.OneFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor,
    'premultiplied over is what lets one body both occlude as soot and add as fire');
  assert.equal(material.depthWrite, false);
  assert.equal(material.depthTest, true);
  assert.equal(material.side, THREE.BackSide, 'a volume proxy is marched from its back faces');
  assert.match(material.fragmentShader, /gl_FragDepth/,
    'without a manual depth write the body cannot sort against hulls and rocks');
  assert.match(material.fragmentShader, /vOccluder/,
    'the analytic occluder is the depth-aware soft intersection where gas meets geometry');
  assert.equal(material.userData.spacefaceTransientTechnique, 'baked-density-film');
  material.dispose();
});

test('a GLSL template literal contains no backtick and no unresolved hole', () => {
  // A backtick inside a GLSL template literal terminates the JS string and takes every importer
  // of vfx.js down with it. This has cost this repo real time more than once.
  for (const shader of ['vertexShader', 'fragmentShader']) {
    const material = createGasVolumeMaterial(createGasVolumeTextures());
    const source = material[shader];
    assert.ok(!source.includes(String.fromCharCode(96)), `${shader} contains a backtick`);
    assert.equal(source.match(/\$\{/g), null, `${shader} has an unresolved template hole`);
    const open = (source.match(/{/g) || []).length;
    const close = (source.match(/}/g) || []).length;
    assert.equal(open, close, `${shader} braces are unbalanced`);
    material.dispose();
  }
});

test('the fragment stage declares no attribute — it is a reserved word in GLSL ES 3.00', () => {
  // This is not hypothetical. The first GPU compile of this material failed with
  // "ERROR: 0:62: 'attribute' : Illegal use of reserved word" because the block holding the five
  // instance attributes was interpolated into BOTH stages. Under WebGL2 three.js rewrites
  // `attribute` to `in` for the vertex stage only. A broken program renders NOTHING rather than
  // throwing, so without this guard the regression is silent everywhere except a GPU boot.
  const material = createGasVolumeMaterial(createGasVolumeTextures());
  assert.equal(/\battribute\b/.test(material.fragmentShader), false,
    'the fragment stage declares an attribute; that program will not compile on any GPU');
  assert.equal((material.vertexShader.match(/\battribute\s+vec4\b/g) || []).length, 5,
    'the vertex stage lost its instance attributes');
  material.dispose();
});

test('every varying the fragment stage reads is declared and written by the vertex stage', () => {
  const material = createGasVolumeMaterial(createGasVolumeTextures());
  const names = (src) => new Set(
    [...src.matchAll(/^\s*varying\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]),
  );
  const vertex = names(material.vertexShader);
  const fragment = names(material.fragmentShader);
  assert.ok(fragment.size > 10, 'expected the volume stage interface to be substantial');
  const body = material.vertexShader.slice(material.vertexShader.indexOf('void main'));
  for (const name of fragment) {
    assert.ok(vertex.has(name), `fragment reads ${name}, which the vertex stage never declares`);
    assert.match(body, new RegExp(`\\b${name}\\s*(\\.[xyzwrgba]+)?\\s*=`),
      `${name} is declared but never written — it would link and then render garbage`);
  }
  material.dispose();
});

test('cell bounds pack one min/max pair per atlas slot', () => {
  const bounds = packCellBounds();
  assert.equal(bounds.length, GAS_FILM.slots * 2);
  for (const f of GAS_FAMILY_FILMS) {
    const min = bounds[f.cellOffset * 2];
    const max = bounds[f.cellOffset * 2 + 1];
    assert.ok(max.x > min.x && max.y > min.y && max.z > min.z,
      `${f.id} first frame packed a degenerate box`);
  }
});

// ---------------------------------------------------------------------------------------------
// The pooled runtime
// ---------------------------------------------------------------------------------------------

test('an empty pool draws nothing and costs nothing', () => {
  const { gas, camera } = harness();
  let t = 0;
  for (let i = 0; i < 20; i++) { t += 1 / 60; assert.equal(gas.update(t, camera), 0); }
  assert.equal(gas.mesh.count, 0);

  const started = performance.now();
  for (let i = 0; i < 3000; i++) { t += 1 / 60; gas.update(t, camera); }
  const perFrame = (performance.now() - started) / 3000;
  // vfx.update owns 2.5 ms of a 16.7 ms frame; an idle subsystem must not be a measurable share.
  assert.ok(perFrame < 0.01, `idle gas costs ${perFrame.toFixed(5)} ms per frame`);
  gas.dispose();
});

test('a body retires and the batch stops drawing it', () => {
  const { gas, camera } = harness();
  let t = 0;
  assert.equal(gas.emitCombustion({ x: 0, y: 0, z: 0, scale: 10, severity: 1 }), true);
  t += 1 / 60;
  assert.equal(gas.update(t, camera), 1);
  assert.equal(gas.mesh.count, 1);
  for (let i = 0; i < 400; i++) { t += 1 / 60; gas.update(t, camera); }
  assert.equal(gas.liveCount, 0, 'the body outlived its authored life');
  assert.equal(gas.mesh.count, 0, 'a retired body is still being drawn');
  gas.dispose();
});

test('the film advances on the SIM clock, so a paused sim freezes the gas', () => {
  const { gas, camera } = harness();
  let t = 0;
  gas.emitCombustion({ x: 0, y: 0, z: 0, scale: 10, severity: 1 });
  for (let i = 0; i < 5; i++) { t += 1 / 60; gas.update(t, camera); }
  const phase = gas.mesh.geometry.getAttribute('aGasTint').getW(0);
  assert.ok(phase > 0, 'the film never started');
  // Display keeps producing frames; the sim clock does not move.
  for (let i = 0; i < 60; i++) gas.update(t, camera);
  assert.equal(gas.mesh.geometry.getAttribute('aGasTint').getW(0), phase,
    'the gas advanced while the simulation was paused');
  gas.dispose();
});

test('bodies are written far-to-near, because premultiplied over is order dependent', () => {
  const { gas, camera } = harness();
  gas.emitCombustion({ x: 0, y: 0, z: 0, scale: 8 });
  gas.emitCombustion({ x: 0, y: 0, z: 800, scale: 8 });
  gas.emitCombustion({ x: 0, y: 0, z: 400, scale: 8 });
  gas.update(1 / 60, camera);
  const pose = gas.mesh.geometry.getAttribute('aGasPose');
  const distances = [];
  for (let i = 0; i < gas.mesh.count; i++) {
    const dx = pose.getX(i) - camera.position.x;
    const dy = pose.getY(i) - camera.position.y;
    const dz = pose.getZ(i) - camera.position.z;
    distances.push(dx * dx + dy * dy + dz * dz);
  }
  for (let i = 1; i < distances.length; i++) {
    assert.ok(distances[i] <= distances[i - 1], `instance ${i} is farther than the one before it`);
  }
  gas.dispose();
});

test('each family is capped independently so one event cannot starve the others', () => {
  const { gas, camera } = harness();
  for (let i = 0; i < 200; i++) gas.emitCombustion({ x: i, y: 0, z: 0, scale: 5 });
  const combustion = gas.diagnostics().families.find((f) => f.id === 'combustion');
  assert.equal(combustion.live, GAS_FAMILY_BY_ID.combustion.capacity);
  // The other families still have room.
  assert.equal(gas.emitFractureDust({ x: 0, y: 0, z: 0, scale: 5 }), true);
  assert.equal(gas.emitVent({ x: 0, y: 0, z: 0, scale: 5 }), true);
  assert.ok(gas.liveCount <= GAS_VOLUME_CAPACITY);
  gas.update(1 / 60, camera);
  gas.dispose();
});

test('a floating-origin rebase moves the bodies and their occluders with it', () => {
  const { gas, camera } = harness();
  gas.emitVent({
    x: 10, y: 0, z: 20, scale: 5,
    occluderX: 8, occluderY: 0, occluderZ: 20, occluderRadius: 4,
  });
  gas.update(1 / 60, camera);
  const pose = gas.mesh.geometry.getAttribute('aGasPose');
  const occl = gas.mesh.geometry.getAttribute('aGasOcclude');
  const x0 = pose.getX(0);
  const ox0 = occl.getX(0);
  // Kept well inside the family's draw range: a rebase large enough to cull the body would
  // correctly stop rewriting its attributes and this assertion would be measuring the cull.
  gas.reproject(-300, 100);
  gas.update(2 / 60, camera);
  // The body also coasts along its own axis between frames, so the rebase is asserted within one
  // frame of drift rather than exactly. The occluder does not drift, so that one is exact.
  assert.ok(Math.abs((pose.getX(0) - x0) + 300) < 1,
    `rebase moved the body by ${(pose.getX(0) - x0).toFixed(3)}, expected about -300`);
  assert.equal(occl.getX(0), ox0 - 300);
  gas.dispose();
});

test('reduced motion lowers energy and slows the arc but never freezes the volume', () => {
  const { gas, camera } = harness();
  gas.setAccessibility({ id: 'reduced-motion', flashOpacityScale: 0.58 });
  gas.emitCombustion({ x: 0, y: 0, z: 0, scale: 10, severity: 1 });
  let t = 0;
  for (let i = 0; i < 12; i++) { t += 1 / 60; gas.update(t, camera); }
  const phase = gas.mesh.geometry.getAttribute('aGasTint').getW(0);
  // A frozen volume IS the static translucent primitive the standard rejects, so reduced motion
  // must still move the film — just less far.
  assert.ok(phase > 0, 'reduced motion froze the film');
  for (let i = 0; i < 12; i++) { t += 1 / 60; gas.update(t, camera); }
  assert.ok(gas.mesh.geometry.getAttribute('aGasTint').getW(0) > phase);
  gas.dispose();
});

// ---------------------------------------------------------------------------------------------
// The impacts-lane contract
// ---------------------------------------------------------------------------------------------

function record(overrides) {
  return makeImpactRecord(createImpactRecord(), {
    x: 10, y: 0, z: 5, nx: 1, ny: 0, nz: 0,
    axisSigned: true, severity: 0.9, materialId: 'hull', radiusWU: 4, simTime: 12,
    ...overrides,
  });
}

test('impact material selects the matter, and a shield throws none', () => {
  assert.equal(gasFamilyForImpact('shield', 'slam', 1), null);
  assert.equal(gasFamilyForImpact('rock', 'fracture', 0.8).id, 'dust');
  assert.equal(gasFamilyForImpact('ice', 'breakup', 0.9).id, 'dust');
  assert.equal(gasFamilyForImpact('hull', 'detonation', 0.9).id, 'combustion');
  assert.equal(gasFamilyForImpact('hull', 'breach', 0.2).id, 'vent',
    'a shallow breach vents pressure, it does not burn');
  assert.equal(gasFamilyForImpact('hull', 'graze', 0.2), null, 'a graze removes nothing');
});

test('emitFromImpact is the one entry point and never throws on a bad record', () => {
  const { gas } = harness();
  assert.equal(typeof gas.emitFromImpact, 'function');
  assert.equal(gas.emitFromImpact(null), false);
  assert.equal(gas.emitFromImpact(undefined), false);
  assert.equal(gas.emitFromImpact({}), false);
  assert.equal(gas.emitFromImpact({ x: NaN, y: 0, z: 0 }), false);
  assert.equal(gas.emitFromImpact(record({ materialId: 'shield' })), false);
  assert.equal(gas.liveCount, 0);
  gas.dispose();
});

test('an UNSIGNED collision axis draws symmetric, never a fabricated direction', () => {
  const { gas } = harness();
  // Signed: one body, standing off along the outward normal.
  assert.equal(gas.emitFromImpact(record({ axisSigned: true, materialId: 'rock' })), true);
  const signed = gas.liveCount;
  assert.equal(signed, 1);

  gas.clear();
  // Unsigned: the sign of the normal is a collider-ordering artifact, so the emitter must place
  // matter on BOTH sides of the axis rather than reading a direction off it.
  assert.equal(gas.emitFromImpact(record({ axisSigned: false, materialId: 'rock' })), true);
  assert.equal(gas.liveCount, 2, 'an unsigned axis must produce a symmetric pair');
  gas.dispose();
});

test('severity and radius scale the body instead of only its opacity', () => {
  const { gas, camera } = harness();
  gas.emitFromImpact(record({ severity: 0.15, radiusWU: 2, materialId: 'hull', axisSigned: true }));
  gas.update(1 / 60, camera);
  const small = gas.mesh.geometry.getAttribute('aGasScale').getX(0);
  gas.clear();
  gas.emitFromImpact(record({ severity: 1, radiusWU: 8, materialId: 'hull', axisSigned: true }));
  gas.update(2 / 60, camera);
  const large = gas.mesh.geometry.getAttribute('aGasScale').getX(0);
  assert.ok(large > small * 3, `severity barely changed the body: ${small} -> ${large}`);
  gas.dispose();
});

test('the gas subsystem subscribes to nothing — the impacts lane owns the timing', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../src/render/combat/gas/', import.meta.url));
  for (const name of ['gasVolumeField.js', 'gasVolumeMaterial.js', 'gasFamilies.js']) {
    const source = await readFile(dir + name, 'utf8');
    assert.equal(source.match(/\bbus\s*\.\s*on\s*\(/g), null,
      `${name} subscribes to the event bus — one contact event would emit two bursts`);
  }
});
