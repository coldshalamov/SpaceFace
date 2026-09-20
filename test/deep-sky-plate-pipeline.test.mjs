// The deep-sky plate contract, end to end: authored source -> baked plate -> runtime residency.
//
// Three things can silently rot here, and one of them is an art regression rather than a bug:
//
//  1. A plate is mixed across the WHOLE frame. Earlier review rejected exactly that construction
//     when it was a procedural full-field wash, and four sector profiles still carry the comment.
//     So the composition budget is measured HERE, on the shipped PNG bytes — not on a re-render,
//     not on the source, not on the baker's own say-so. A plate that fills the frame, floods the
//     lower-left play corridor, or ends on a hard edge fails this test.
//  2. The runtime budgets memory from a registry of plate sizes. If a re-bake changes a plate and
//     the registry is not updated, every residency number the renderer reports becomes fiction.
//  3. The residency itself must stay bounded and must never upload on a frame that has no room,
//     because a region transition can land in the middle of a fight.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decodePng, measurePlate, renderDeepSkyPlate, quantisePlate, plateResidentBytes,
  isPowerOfTwo, checkPlateBudget, DEFAULT_BUDGETS, loadSources,
} from '../tools/art/bake_deep_sky_plates.mjs';
import {
  DEEP_SKY_PLATES, DEEP_SKY_MAX_RESIDENT, DeepSkyPlateResidency, deepSkyPeakResidentBytes,
} from '../src/render/deepSkyPlates.js';
import {
  SECTOR_VISUAL_PROFILES, resolveBackgroundPaintedSky,
} from '../src/data/sectorVisualProfiles.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/background/deep-sky/manifest.json'), 'utf8'));

// Decoding four 2K plates is the expensive part; do it once and share.
const decoded = new Map();
function plateBytes(entry) {
  if (!decoded.has(entry.id)) {
    const bytes = readFileSync(resolve(ROOT, entry.file));
    decoded.set(entry.id, { bytes, image: decodePng(bytes) });
  }
  return decoded.get(entry.id);
}

test('every shipped plate is the one the manifest describes', () => {
  assert.equal(manifest.schema, 'spaceface.deepSkyPlateManifest.v1');
  assert.ok(manifest.plates.length >= 4, 'the four regional plates must all be listed');
  for (const entry of manifest.plates) {
    const { bytes, image } = plateBytes(entry);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
      `${entry.id}: shipped PNG does not match its manifest hash — re-run the baker`);
    assert.equal(image.width, entry.width, `${entry.id}: width`);
    assert.equal(image.height, entry.height, `${entry.id}: height`);
    assert.equal(plateResidentBytes(image.width, image.height), entry.residentBytes,
      `${entry.id}: recorded residency must be the exact RGBA8 chain including mips`);
  }
});

test('shipped plate pixels obey the composition budget, so no plate is a full-field wash', () => {
  for (const entry of manifest.plates) {
    const { image } = plateBytes(entry);
    const stats = measurePlate(image.rgb8, image.width, image.height);
    const failures = checkPlateBudget(stats, entry.budgets);
    assert.deepEqual(failures, [], `${entry.id}: ${failures.join('; ')}`);

    // The play corridor is the load-bearing one: the lower-left of the frame is where combat and
    // machinery live, and the sky has to stay out of it. The reviewed reference plate measures
    // 0.0000 here, so this is the accepted standard rather than an invented one.
    assert.ok(stats.corridorCoverage05 <= DEFAULT_BUDGETS.corridorCoverage05,
      `${entry.id}: lower-left play corridor coverage ${stats.corridorCoverage05} is not quiet`);

    // Hierarchy: a plate must have a subject. A flat field would pass a coverage cap while being
    // precisely the thing the cap exists to prevent, so require real separation between the
    // brightest and dimmest quadrants.
    const quads = Object.values(stats.quadrantMean);
    assert.ok(Math.max(...quads) >= Math.min(...quads) * 2.0,
      `${entry.id}: quadrant means ${JSON.stringify(stats.quadrantMean)} are too even to be a composition`);

    // No hard layer edge where the sampler clamps.
    assert.ok(stats.edgeMean <= DEFAULT_BUDGETS.edgeMean,
      `${entry.id}: outer band mean ${stats.edgeMean} would show the plate boundary`);
  }
});

test('baked plates are power-of-two so the mip chain halves cleanly', () => {
  for (const entry of manifest.plates) {
    if (entry.imported) continue;   // pre-existing reviewed art, measured but never re-baked
    assert.ok(isPowerOfTwo(entry.width) && isPowerOfTwo(entry.height),
      `${entry.id}: ${entry.width}x${entry.height} is not power-of-two`);
  }
});

test('the bake is reproducible: the same source renders the same pixels every time', () => {
  const sources = loadSources();
  assert.ok(sources.length >= 3, 'the editable sources must ship beside the plates');
  for (const source of sources) {
    // A proof render, not the full plate: the point is determinism of source -> pixels.
    const a = renderDeepSkyPlate(source, 256, 128);
    const b = renderDeepSkyPlate(source, 256, 128);
    assert.deepEqual(Array.from(quantisePlate(a.rgb, 256, 128)), Array.from(quantisePlate(b.rgb, 256, 128)),
      `${source.id}: the baker is not deterministic — no ambient randomness or wall clock is allowed`);
    // The composition holds at a different resolution too, so the budget is a property of the
    // authored shapes rather than of one pixel grid.
    const stats = measurePlate(quantisePlate(a.rgb, 256, 128), 256, 128);
    assert.ok(stats.corridorCoverage05 <= 0.02,
      `${source.id}: corridor is only quiet at the shipped resolution (${stats.corridorCoverage05})`);
  }
});

test('the runtime registry agrees with the bake manifest', () => {
  for (const entry of manifest.plates) {
    const plate = DEEP_SKY_PLATES[entry.id];
    assert.ok(plate, `${entry.id} is baked but not registered in src/render/deepSkyPlates.js`);
    assert.equal(plate.width, entry.width);
    assert.equal(plate.height, entry.height);
    assert.equal(plate.residentBytes, entry.residentBytes,
      `${entry.id}: the runtime budgets from a stale size`);
    assert.equal(plate.url, `/${entry.file}`,
      `${entry.id}: the runtime URL must be the root-relative path of the shipped file`);
  }
  assert.equal(deepSkyPeakResidentBytes(), manifest.peakResidentBytes,
    'peak residency must be the two largest plates, as the manifest records');
});

test('every region binds a plate that exists, and a plateless region costs nothing', () => {
  let plateless = 0;
  for (const profile of Object.values(SECTOR_VISUAL_PROFILES)) {
    const art = resolveBackgroundPaintedSky(profile);
    if (!art) { plateless++; continue; }
    assert.ok(DEEP_SKY_PLATES[art.plate],
      `${profile.id} binds plate "${art.plate}", which is not in the registry`);
    // The clamp is the guard against this layer quietly becoming the rejected full-field wash.
    assert.ok(art.strength > 0 && art.strength <= 0.35,
      `${profile.id}: plate strength ${art.strength} is outside the authored range`);
    assert.ok(art.parallax >= 0 && art.parallax <= 0.02, `${profile.id}: plate parallax out of range`);
  }
  assert.ok(plateless >= 1,
    'at least one region must stay deliberately plateless, or the feature is a uniform veil');
  assert.equal(resolveBackgroundPaintedSky(SECTOR_VISUAL_PROFILES.fringe), null,
    'the fringe is the plateless region: stars and the tidal filament against empty sky');
});

// ---------------------------------------------------------------------------------------------
// Residency: bounded, and never uploading on a frame with no room for it.
// ---------------------------------------------------------------------------------------------

function fakeResidency({ lastPresentDtMs = 10 } = {}) {
  const loads = [];
  const disposed = [];
  const uploaded = [];
  const state = { render: { lastPresentDtMs } };
  const loader = {
    load(url, onLoad) {
      const texture = { url, disposed: false, dispose() { this.disposed = true; disposed.push(url); } };
      loads.push({ url, onLoad, texture });
      return texture;
    },
  };
  const renderer = { initTexture(texture) { uploaded.push(texture.url); } };
  const residency = new DeepSkyPlateResidency({ loader, renderer, state });
  return { residency, loads, disposed, uploaded, state };
}

test('residency never holds more than one active plate plus one incoming', () => {
  const { residency, loads } = fakeResidency();
  const order = ['helios-amber-estuary', 'core-lantern-shelf', 'belt-ochre-shoal', 'anomaly-cold-halo'];
  for (const id of order) {
    residency.request(id);
    assert.ok(residency.residentCount <= DEEP_SKY_MAX_RESIDENT,
      `holding ${residency.residentCount} plates while switching to ${id}`);
    loads[loads.length - 1].onLoad();
    residency.pump();
    assert.ok(residency.residentCount <= DEEP_SKY_MAX_RESIDENT, 'after promotion');
    assert.equal(residency.activeId, id);
  }
  // Four regions visited, and the memory held is one plate, not four.
  assert.equal(residency.residentCount, 1);
  assert.equal(residency.residentBytes, DEEP_SKY_PLATES['anomaly-cold-halo'].residentBytes);

  // A plateless region releases everything rather than keeping the last plate warm.
  residency.request(null);
  assert.equal(residency.residentCount, 0);
  assert.equal(residency.residentBytes, 0);
  assert.equal(residency.readyId, null);
});

test('the plate upload waits for a frame with room, and is never skipped forever', () => {
  const { residency, loads, uploaded, state } = fakeResidency({ lastPresentDtMs: 48 });
  residency.request('core-lantern-shelf');
  loads[0].onLoad();

  // A 48 ms present is a frame in trouble. Uploading 10.7 MB into it is the exact hitch this gate
  // exists to prevent, and until the upload happens the plate must not be reported as live.
  for (let frame = 0; frame < 5; frame++) {
    assert.equal(residency.pump(), false, `uploaded during a late frame (${frame})`);
    assert.equal(uploaded.length, 0);
    assert.equal(residency.readyId, null, 'a plate must not go live before its upload');
  }

  // Frames recover: the upload lands on the first one that has room.
  state.render.lastPresentDtMs = 9;
  assert.equal(residency.pump(), true);
  assert.deepEqual(uploaded, ['/assets/background/deep-sky/core-lantern-shelf.png']);
  assert.equal(residency.readyId, 'core-lantern-shelf',
    'only after initTexture may the sky start blending the plate in');
  assert.equal(residency.stats().uploads, 1);
});

test('a sustained run of late frames still admits the plate rather than parking it', () => {
  const { residency, loads, uploaded } = fakeResidency({ lastPresentDtMs: 60 });
  residency.request('belt-ochre-shoal');
  loads[0].onLoad();
  let frames = 0;
  while (uploaded.length === 0 && frames < 64) { residency.pump(); frames++; }
  assert.equal(uploaded.length, 1,
    'a machine that never has a fast frame would otherwise never get its sky');
  assert.ok(frames > 1, 'the first late frame must still have been skipped');
});

test('a plate that fails to load leaves a quiet region, not a broken frame', () => {
  const { residency, loads } = fakeResidency();
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args[0]);
  try {
    residency.request('core-lantern-shelf');
    loads[0].onLoad = null;
    // Simulate the loader's error path.
    const plate = DEEP_SKY_PLATES['core-lantern-shelf'];
    assert.equal(residency.pendingId, plate.id);
    residency.failedIds.add(plate.id);
    residency._releasePending();
    assert.equal(residency.residentCount, 0);
    assert.equal(residency.readyId, null);
    // A failed plate is not retried on every sector entry.
    assert.equal(residency.request('core-lantern-shelf'), false);
  } finally {
    console.error = consoleError;
  }
});

test('dispose releases every plate it was holding', () => {
  const { residency, loads, disposed } = fakeResidency();
  residency.request('helios-amber-estuary');
  loads[0].onLoad();
  residency.pump();
  residency.request('core-lantern-shelf');   // active + incoming
  assert.equal(residency.residentCount, 2);
  residency.dispose();
  assert.equal(residency.residentCount, 0);
  assert.equal(disposed.length, 2);
  assert.equal(residency.request('belt-ochre-shoal'), false, 'a disposed residency loads nothing');
});
