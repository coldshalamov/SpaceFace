// Acceptance tests for the weapon SOURCE / CARRIED-PROJECTILE lane.
//
// The bar this file defends is the one that is easy to claim and hard to keep: a weapon family
// must be recognisable from SHAPE, MOTION and TIMING with every colour removed and bloom off.
// So every structural assertion below is deliberately computed from colour-free channels, and the
// two channels that would let a lane cheat - the per-strip RGB and the bolt tint - are dropped
// before anything is compared.
//
// It also holds the lane's two boundaries: nothing may be drawn at the contact point (that owner
// is the impacts lane), and a projectile's drawn envelope may never read as its damage radius.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { WeaponDischargePool } from '../src/render/forceLanguage/weaponDischargePool.js';
import { weaponSignature } from '../src/render/forceLanguage/catalog.js';
import { PersistentCombatBeamPool } from '../src/render/combat/persistentBeams.js';
import {
  EnergyBoltPool,
  FLIGHT_MODE,
  RIBBON_PROFILE,
  WeaponRibbonPool,
  listWeaponRecipes,
} from '../src/render/weapons/index.js';

// src/systems/weapons.js spawns projectiles with radius 0.7 (1.6 for the guided ordnance body).
const PROJECTILE_COLLISION_RADIUS = 0.7;

const POSE = { x: 0, y: 0.4, z: 0, ax: 1, ay: 0, az: 0 };
const FLASH = { life: 0.12, size0: 1.6, size1: 2.4, opacity0: 1 };

/** Replace the swept batch with a collector so one shot's geometry can be read back exactly. */
function collectingPool() {
  const pool = new WeaponDischargePool(null, { capacity: 4 });
  const frames = [];
  let current = null;
  pool.batch.dispose();
  pool.batch = {
    attributes: [],
    begin() { current = []; frames.push(current); },
    add(values) { current.push(Float32Array.from(values)); return true; },
    end() {},
    reproject() {},
    dispose() {},
  };
  pool.frames = frames;
  return pool;
}

/**
 * Colour-free structural fingerprint of one source beat.
 *
 * Descriptor layout (see WeaponDischargePool._strip): 0..2 origin, 3 angle, 4 path type,
 * 5..6 start/end angle, 7..8 start/end radius, 9 width, 10 lift, 12..14 RGB, 15 opacity,
 * 17 phase, 18 front mode, 19 material style, 23 pitch. Indices 12..15 are deliberately NOT
 * read: a family that only differs by tint must fail these tests.
 */
function grayscaleFingerprint(strips, width) {
  const round = (v) => Math.round(v * 1000) / 1000;
  return strips.map((d) => [
    round(d[4]), // path type: polar ring vs linear blade
    round(d[5]), round(d[6]), // angular placement / sweep
    round(d[7] / width), round(d[8] / width), // radial extents, normalised out of flash size
    round(d[9] / width), // strip width
    round(d[10] / width), // lift out of the plane
    round(d[18]), // travelling front mode
    round(d[19]), // material style
  ].join(':')).join('|');
}

function fireOnce(pool, variant, ownerId = 'ship', flash = FLASH) {
  pool.spawn({ variant }, POSE, ownerId, flash, 1);
}

const RECIPES = listWeaponRecipes();
const VARIANTS = Object.keys(RECIPES);

test('every weapon family emits source geometry whose identity survives grayscale', () => {
  const byVariant = new Map();
  for (const variant of VARIANTS) {
    const pool = collectingPool();
    fireOnce(pool, variant);
    pool.update(0.0001, null, null);
    const slot = pool.slots.find((s) => s.alive);
    const strips = pool.frames[pool.frames.length - 1];
    assert.ok(strips.length > 0, `${variant} must ignite a swept source`);
    byVariant.set(variant, {
      fingerprint: grayscaleFingerprint(strips, slot.width),
      strips: strips.length,
      source: slot.source,
    });
    pool.dispose();
  }

  // One source signature may legitimately be shared by more than one variant (flak and the
  // autocannon are both machined bursts). What may NOT happen is two DIFFERENT authored sources
  // producing the same colour-free geometry.
  const bySource = new Map();
  for (const [variant, record] of byVariant) {
    const signature = weaponSignature(variant);
    const source = signature ? signature.source : record.source;
    const seen = bySource.get(record.fingerprint);
    assert.ok(
      seen === undefined || seen === source,
      `${variant} (${source}) is geometrically identical to ${seen} with colour removed`,
    );
    bySource.set(record.fingerprint, source);
  }
  assert.ok(bySource.size >= 8, `expected at least 8 distinct source geometries, got ${bySource.size}`);

  // Named cross-family separations, so a future edit cannot quietly converge them.
  const kinetic = byVariant.get('autocannon');
  const coherent = byVariant.get('pulse-bolt');
  const induction = byVariant.get('disruptor');
  const propulsion = byVariant.get('thermal-bolt');
  assert.notEqual(kinetic.fingerprint, coherent.fingerprint);
  assert.notEqual(kinetic.fingerprint, induction.fingerprint);
  assert.notEqual(coherent.fingerprint, induction.fingerprint);
  assert.notEqual(propulsion.fingerprint, coherent.fingerprint);
});

test('ballistic sources run a real breech cycle; coherent sources align before they release', () => {
  // A machined impulse is a mechanism: the carrier rides back on ignition and returns. That axial
  // travel is what makes it a breech event rather than a flash pinned to a socket.
  const ballistic = collectingPool();
  fireOnce(ballistic, 'autocannon');
  ballistic.update(0.0001, null, null);
  const ignition = ballistic.frames[0];
  ballistic.update(0.1, null, null);
  const settled = ballistic.frames[1];
  const axialAt = (strips) => Math.min(...strips.map((d) => d[0]));
  assert.ok(axialAt(ignition) < -0.05, 'the carrier must ride back behind the bore on ignition');
  assert.ok(axialAt(settled) > axialAt(ignition), 'and return before the next round');
  ballistic.dispose();

  // A coherent aperture is an alignment: the jaws start apart and close onto the axis, so the
  // collimated core is released by a mechanism that found its line.
  const coherent = collectingPool();
  coherent.spawn({ variant: 'continuous-beam' }, POSE, 'ship', { ...FLASH, life: 0.2 }, 1);
  coherent.update(0.0001, null, null);
  const opening = coherent.frames[0];
  coherent.update(0.15, null, null);
  const latched = coherent.frames[1];
  // Measure the jaw stand-off in units of its own strip width, so the shared lifecycle envelope
  // (which scales every source down as it cools) cannot be mistaken for the alignment stroke.
  const jawSpread = (strips) => Math.max(...strips.map((d) => Math.abs(d[2]) / Math.max(d[9], 1e-6)));
  assert.ok(jawSpread(opening) > jawSpread(latched) * 1.2,
    `coherent jaws must converge onto the axis: ${jawSpread(opening)} -> ${jawSpread(latched)}`);
  const coreReach = (strips) => Math.max(...strips.map((d) => d[8]));
  assert.ok(coreReach(latched) > coreReach(opening), 'the collimated core opens after alignment');
  coherent.dispose();
});

test('electrical branches bridge a real junction and extinguish together', () => {
  const pool = collectingPool();
  fireOnce(pool, 'disruptor');
  pool.update(0.0001, null, null);
  const strips = pool.frames[0];
  // circuit-fork emits limb pairs: an inner limb rooted at the aperture and an outer limb that
  // must START inside the inner limb's reach. A gap there is a branch dangling in empty space.
  assert.equal(strips.length % 2, 0, 'branches come in rooted pairs');
  for (let i = 0; i < strips.length; i += 2) {
    const inner = strips[i];
    const outer = strips[i + 1];
    assert.ok(inner[7] <= 0.2, 'the inner limb is rooted at the aperture');
    assert.ok(outer[7] < inner[8], 'the outer limb starts inside the inner limb: a real junction');
    assert.ok(outer[8] > outer[7], 'and reaches beyond it');
  }
  // Every limb belongs to one slot with one envelope, so they can only die together.
  const live = pool.slots.filter((s) => s.alive);
  assert.equal(live.length, 1);
  pool.update(0.2, null, null);
  assert.equal(pool.slots.filter((s) => s.alive).length, 0, 'the whole discharge extinguishes as one');
  pool.dispose();
});

test('maximum-rate fire keeps a beat and never accumulates a second source', () => {
  const pool = collectingPool();
  const shapes = [];
  for (let shot = 0; shot < 8; shot++) {
    fireOnce(pool, 'autocannon');
    assert.equal(pool.slots.filter((s) => s.alive).length, 1,
      'rapid same-owner fire coalesces; it must never stack a second glowing source');
    pool.update(0.0001, null, null);
    const slot = pool.slots.find((s) => s.alive);
    shapes.push(grayscaleFingerprint(pool.frames[pool.frames.length - 1], slot.width));
    pool.update(0.012, null, null); // ~80 rounds/second, well inside the flash life
  }
  for (let i = 1; i < shapes.length; i++) {
    assert.notEqual(shapes[i], shapes[i - 1], `shot ${i} must not repeat shot ${i - 1} exactly`);
  }
  for (let i = 2; i < shapes.length; i++) {
    assert.equal(shapes[i], shapes[i - 2], 'the breech alternates on a two-stroke cycle');
  }

  // A stream must also not integrate into an opaque blob: the coalesced peak sits below the
  // isolated shot's peak, and there is still exactly one source object.
  const rapidOpacity = pool.slots.find((s) => s.alive).opacity;
  pool.dispose();
  const single = collectingPool();
  fireOnce(single, 'autocannon');
  const soloOpacity = single.slots.find((s) => s.alive).opacity;
  single.dispose();
  assert.ok(rapidOpacity < soloOpacity, `rapid ${rapidOpacity} must sit under solo ${soloOpacity}`);
});

test('weapon wakes are world-anchored sheets, not a camera-facing cross-frame', () => {
  const build = (camera) => {
    const pool = new WeaponRibbonPool(null, { capacity: 4, segments: 8 });
    pool.spawn({ entityId: 1, x: 0, y: 0.3, z: 0, width: 0.6, colorHead: '#fff', colorTail: '#08f', linger: 0.2 });
    for (let i = 1; i < 8; i++) pool.pushHead(1, -i * 5, 0.3, 0);
    pool.update(1 / 60, camera);
    const n = new THREE.Vector3(pool.normal[0], pool.normal[1], pool.normal[2]).normalize();
    const p0 = new THREE.Vector3(pool.position[0], pool.position[1], pool.position[2]);
    pool.dispose();
    return { n, p0 };
  };

  // Two cameras at the same elevation and range, 45 degrees apart in azimuth. A camera-facing
  // cross-frame has normal == view direction by construction, so its |n . up| would be sin(20deg)
  // ~= 0.35 and the two normals would sit 45 degrees apart.
  const a = build({ x: 0, y: 55, z: -144 });
  const b = build({ x: -102, y: 55, z: -102 });
  const up = new THREE.Vector3(0, 1, 0);
  assert.ok(Math.abs(a.n.dot(up)) > 0.9, `wake must lie in the flight plane, got ${a.n.dot(up)}`);
  assert.ok(Math.abs(b.n.dot(up)) > 0.9, `wake must lie in the flight plane, got ${b.n.dot(up)}`);
  assert.ok(a.n.dot(b.n) > 0.97, 'moving only the camera must not re-roll the sheet');
  assert.ok(a.p0.distanceTo(b.p0) < 0.25, 'nor rebuild its vertices around the new view');

  // The one case where it MAY roll: a camera down in the flight plane would otherwise see the
  // sheet perfectly edge-on. That guard is deliberate and must still fire.
  const grazing = build({ x: 0, y: 0.5, z: -144 });
  assert.ok(Math.abs(grazing.n.dot(up)) < 0.3,
    'an in-plane camera must still get a readable sheet, not a zero-width line');
});

test('wake cross-sections are authored per family and phased on distance, not on a clock', () => {
  for (const [variant, recipe] of Object.entries(RECIPES)) {
    assert.ok(Number.isFinite(recipe.flight.ribbonProfile), `${variant} needs an authored wake profile`);
  }
  const drawn = new Set(
    Object.values(RECIPES).filter((r) => r.flight.ribbon).map((r) => r.flight.ribbonProfile),
  );
  assert.ok(drawn.size >= 4,
    `wake-drawing families must span at least 4 cross-sections, got ${[...drawn].join(',')}`);
  assert.equal(RECIPES.autocannon.flight.ribbonProfile, RIBBON_PROFILE.CORD);
  assert.equal(RECIPES.disruptor.flight.ribbonProfile, RIBBON_PROFILE.FORK);
  assert.equal(RECIPES['pulse-bolt'].flight.ribbonProfile, RIBBON_PROFILE.FILAMENT);
  assert.equal(RECIPES['thermal-bolt'].flight.ribbonProfile, RIBBON_PROFILE.BRAID);

  const pool = new WeaponRibbonPool(null, { capacity: 2, segments: 4 });
  // No clock in the wake at all: its internal structure rides world arc length, so a positive
  // display dt cannot advance it while the simulation clock is paused.
  assert.deepEqual(Object.keys(pool.material.uniforms).sort(), ['uGrazeGain', 'uIntensity']);
  assert.doesNotMatch(pool.material.fragmentShader, /uTime|uSfTime|uBoltTime/);
  // Each profile owns a different lateral density expression, not a different tint.
  for (const marker of [/CORD/, /BRAID/, /FORK/, /SHEET/, /FILAMENT/]) {
    assert.match(pool.material.fragmentShader, marker);
  }
  assert.match(pool.material.fragmentShader, /float facing = clamp\(abs\(dot\(N, V\)\)/,
    'the sheet must carry a view-dependent term (B7)');
  pool.dispose();
});

test('a released wake unravels from the head, and idle slots stop re-uploading', () => {
  const pool = new WeaponRibbonPool(null, { capacity: 64, segments: 8 });
  const publish = () => {
    for (const attribute of pool._dynamicAttributes) attribute.clearUpdateRanges();
  };
  pool.spawn({ entityId: 1, x: 0, y: 0.3, z: 0, width: 0.6, colorHead: '#fff', colorTail: '#08f', linger: 0.2 });
  pool.spawn({ entityId: 2, x: 0, y: 0.3, z: 9, width: 0.6, colorHead: '#fff', colorTail: '#08f', linger: 0.2 });
  for (let i = 1; i < 8; i++) {
    pool.pushHead(1, -i * 5, 0.3, 0);
    pool.pushHead(2, -i * 5, 0.3, 9);
  }
  pool.update(1 / 60, { x: 0, y: 55, z: -144 });

  // Two live wakes in a 64-slot pool publish two slots, not the whole buffer.
  const liveBytes = pool.uploadedBytesLastFrame;
  assert.deepEqual(pool.geometry.attributes.position.updateRanges, [{ start: 0, count: 2 * 8 * 2 * 3 }]);
  assert.ok(liveBytes / pool.fullUploadBytes < 0.05,
    `two of 64 wakes must not cost a full buffer: ${liveBytes}/${pool.fullUploadBytes}`);
  publish();

  // While the round is still feeding it, the wake is brightest at the head.
  assert.ok(pool.alpha[0] > pool.alpha[5 * 2], 'a live wake is densest at the round');

  // Termination: the head goes first, because the round feeding it is gone.
  pool.release(1);
  pool.release(2);
  pool.update(0.1, { x: 0, y: 55, z: -144 });
  const head = pool.alpha[0];
  const body = pool.alpha[5 * 2];
  assert.ok(body > 0, 'the far wake is still hanging in space');
  assert.ok(head < body, `head ${head} must unravel before the body ${body}`);
  publish();

  pool.update(0.2, { x: 0, y: 55, z: -144 });
  assert.equal(pool.live, 0);
  assert.ok(pool.uploadedBytesLastFrame > 0, 'the frame a wake dies still clears its slot');
  publish();

  pool.update(1 / 60, { x: 0, y: 55, z: -144 });
  assert.equal(pool.uploadedBytesLastFrame, 0, 'an idle pool must publish nothing at all');
  pool.dispose();
});

test('projectile drawn extent is a directional smear, never a damage footprint', () => {
  for (const [variant, recipe] of Object.entries(RECIPES)) {
    if (recipe.flight.mode !== FLIGHT_MODE.ENERGY_CARD) continue;
    const { dashLength, width } = recipe.flight;
    assert.ok(dashLength / Math.max(width, 1e-6) >= 2,
      `${variant} must stay an elongated moving body (${dashLength} x ${width})`);
    assert.ok(dashLength > PROJECTILE_COLLISION_RADIUS * 4,
      `${variant} dash ${dashLength} must not sit at the collision radius and read as its reach`);
  }
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  const shader = pool.material.vertexShader;
  // Axial extent grows with the distance actually travelled this frame; lateral extent never
  // does. That asymmetry is what keeps the envelope a motion cue instead of a hazard boundary.
  assert.match(shader, /float dash = max\(aBoltSize\.x \+ smear, worldPerPx \* uMinLengthPixels\)/);
  assert.doesNotMatch(shader, /float width = max\([^)]*smear/);
  assert.match(shader, /never a hazard boundary/);
  // Bodies are shaped in the VELOCITY frame; no dialect may fall back to a camera-facing frame.
  assert.match(shader, /no camera-facing billboarding/);
  assert.doesNotMatch(shader, /billboard\s*\(/);
  pool.dispose();
});

test('every bolt dialect has its own silhouette, not one dart at seven widths', () => {
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  const shader = pool.material.vertexShader;
  // One branch per variant band. Before this lane, kinetic, rail and flak shared the unshaped
  // default, so three of seven dialects were the same object at three widths.
  for (const branch of [
    /aBoltSize\.w < 0\.5/,
    /aBoltSize\.w < 1\.5/,
    /aBoltSize\.w >= 1\.5 && aBoltSize\.w < 2\.5/,
    /aBoltSize\.w >= 2\.5 && aBoltSize\.w < 3\.5/,
    /aBoltSize\.w >= 3\.5 && aBoltSize\.w < 4\.5/,
    /aBoltSize\.w >= 4\.5 && aBoltSize\.w < 5\.5/,
    /aBoltSize\.w >= 5\.5/,
  ]) assert.match(shader, branch);
  // Every branch must move geometry (shaped.*), not only tint - tint lives in the fragment stage.
  const bodies = shader.split(/} else if \(aBoltSize\.w/).slice(1);
  assert.equal(bodies.length, 6);
  for (const body of bodies) {
    assert.match(body.split('}')[0] + body.split('}')[1], /shaped\.(x|y|z|yz)/);
  }
  pool.dispose();
});

test('the weapons lane draws nothing at the contact point', () => {
  const beams = new PersistentCombatBeamPool(THREE, { maxBeams: 2 });
  const sources = [];
  for (const material of [beams.coreMaterial, beams.haloMaterial]) {
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    material.onBeforeCompile(shader);
    sources.push(shader.fragmentShader);
  }
  for (const source of sources) {
    // The far terminal (uv.x -> 1) is the contact. The impacts lane owns it; a bright end here
    // would put two competing primary flashes on one shot.
    assert.doesNotMatch(source, /smoothstep\(0\.8+, 1\.0, vSfBeam\.x\)/,
      'beam must not brighten its contact end');
    assert.match(source, /sfMuzzle = smoothstep\(0\.\d+, 0\.0, vSfBeam\.x\)/,
      'only the aperture end is lit by this lane');
    // Travelling packets ride world distance, so a moving target cannot stretch them.
    assert.match(source, /sin\(vSfAxial \* [\d.]+ - uSfTime \* [\d.]+\)/);
    assert.doesNotMatch(source, /sin\(vSfBeam\.x \*/, 'uv-phased packets squash with beam length');
  }
  beams.dispose();

  // The carried-projectile pools expose no contact API at all.
  const ribbons = new WeaponRibbonPool(null, { capacity: 1, segments: 4 });
  const bolts = new EnergyBoltPool(null, { capacity: 1 });
  for (const pool of [ribbons, bolts]) {
    for (const name of ['spawnImpact', 'handleHit', 'spawnContact', 'impact']) {
      assert.equal(typeof pool[name], 'undefined', `${pool.constructor.name}.${name} must not exist`);
    }
  }
  ribbons.dispose();
  bolts.dispose();
});

test('a sustained beam can follow a moving socket without inventing its contact point', () => {
  const pool = new PersistentCombatBeamPool(THREE, { maxBeams: 2, timeoutS: 1 });
  const local = (x, z, out) => { out.x = x; out.z = z; return out; };
  pool.upsert({
    beamKey: 'ship:0', ownerId: 'ship', weaponId: 'beam',
    from: { x: 0, z: 0 }, to: { x: 60, z: 0 },
  }, 1, { coreColor: '#ffffff', accentColor: '#55ccff' });
  pool.update(1, local);
  const entry = pool._byKey.get('ship:0');
  const contactBefore = entry.toX;

  // The ship turns between simulation ticks; the aperture follows at display rate.
  pool.update(1.008, local, null, 0, () => ({ x: 4, y: 0.5, z: -3 }));
  assert.equal(entry.fromX, 4);
  assert.equal(entry.fromZ, -3);
  assert.equal(entry.toX, contactBefore, 'the resolver must never move the simulated contact');

  // A resolver that cannot find the socket leaves the last authoritative origin alone.
  pool.update(1.016, local, null, 0, () => null);
  assert.equal(entry.fromX, 4);

  // The world axial coordinate tracks the real beam length, which is what keeps packets stable.
  const axial = pool._coreBatch.axial;
  const length = Math.hypot(entry.toX - entry.fromX, entry.toZ - entry.fromZ);
  assert.equal(axial[entry.slot * 4], 0, 'the aperture vertex sits at axial zero');
  assert.ok(Math.abs(axial[entry.slot * 4 + 2] - length) < 1e-3,
    `contact vertex carries the world length (${axial[entry.slot * 4 + 2]} vs ${length})`);
  pool.dispose();
});
