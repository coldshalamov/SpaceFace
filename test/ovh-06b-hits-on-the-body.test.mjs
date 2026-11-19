// OVH-06b — hits on the body: the damage ladder, the two-frame flash, the spark reflection,
// the flash book's pooling, reduced-flash dimming, and presentation-seed determinism.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  BODY_TIER_CLEAN, BODY_TIER_SMOKE, BODY_TIER_SPARKS, BODY_TIER_FIRE,
  HIT_FLASH_S, HIT_FLASH_REDUCED_SCALE, HIT_FLASH_REDUCED_S,
  bodyDamageTier, bodyHitEnabled, corkscrewOffset, createHitFlashBook, hitFlashLevel,
  lampFlicker, plumeStutter, reflectAxis, seed01, seedSigned, tierEmitRates,
} from '../src/render/vfx/bodyHitRead.js';
import { syncHullHitFlash, hullFlashMeshCount } from '../src/render/hullHitFlash.js';

test('the damage ladder enters at 60 / 30 / 10 percent hull', () => {
  assert.equal(bodyDamageTier(100, 100), BODY_TIER_CLEAN);
  assert.equal(bodyDamageTier(61, 100), BODY_TIER_CLEAN);
  assert.equal(bodyDamageTier(60, 100), BODY_TIER_SMOKE);
  assert.equal(bodyDamageTier(31, 100), BODY_TIER_SMOKE);
  assert.equal(bodyDamageTier(30, 100), BODY_TIER_SPARKS);
  assert.equal(bodyDamageTier(11, 100), BODY_TIER_SPARKS);
  assert.equal(bodyDamageTier(10, 100), BODY_TIER_FIRE);
  assert.equal(bodyDamageTier(1, 100), BODY_TIER_FIRE);
  assert.equal(bodyDamageTier(0, 100), BODY_TIER_CLEAN, 'death has its own owner');
  assert.equal(bodyDamageTier(5, 0), BODY_TIER_CLEAN, 'set dressing without a hull never reads damaged');
  assert.equal(bodyDamageTier(NaN, 100), BODY_TIER_CLEAN);
});

test('each tier adds a read and never takes one away', () => {
  const a = tierEmitRates(BODY_TIER_SMOKE);
  const b = tierEmitRates(BODY_TIER_SPARKS);
  const c = tierEmitRates(BODY_TIER_FIRE);
  assert.ok(a.smoke > 0 && a.spark === 0 && a.fire === 0, 'smoke first');
  assert.ok(b.spark > 0 && b.fire === 0 && b.smoke >= a.smoke, 'then sparks');
  assert.ok(c.fire > 0 && c.spark >= b.spark && c.smoke >= b.smoke, 'then fire');
  assert.equal(tierEmitRates(BODY_TIER_CLEAN).smoke, 0);
  assert.equal(tierEmitRates(BODY_TIER_SMOKE), tierEmitRates(BODY_TIER_SMOKE), 'frozen shared records: no allocation');
  assert.ok(Object.isFrozen(tierEmitRates(BODY_TIER_FIRE)));
});

test('the flash is exactly two frames, and reduced flashing dims and smooths it', () => {
  assert.equal(hitFlashLevel(0), 1);
  assert.equal(hitFlashLevel(HIT_FLASH_S * 0.99), 1);
  assert.equal(hitFlashLevel(HIT_FLASH_S), 0);
  assert.equal(hitFlashLevel(-1), 0);
  const reduced0 = hitFlashLevel(0, 1, true);
  assert.equal(reduced0, HIT_FLASH_REDUCED_SCALE);
  assert.ok(reduced0 < 0.5, 'dimmed well below the full flash');
  assert.ok(hitFlashLevel(HIT_FLASH_REDUCED_S * 0.5, 1, true) < reduced0, 'it eases out, it never steps');
  assert.equal(hitFlashLevel(HIT_FLASH_REDUCED_S, 1, true), 0);
  assert.equal(hitFlashLevel(0, 0.5), 0.5, 'a lighter hit flashes lighter');
});

test('the flash book pools: bounded, reuses a slot per body, and never skips a slow frame', () => {
  const book = createHitFlashBook(4);
  for (let i = 0; i < 40; i += 1) book.noteHit(i % 6, i * 0.001, 1);
  assert.ok(book.occupied <= 4, 'fixed capacity: older slots are overwritten, nothing grows');
  book.clear();
  assert.equal(book.occupied, 0);
  book.noteHit('a', 1.0, 1);
  book.noteHit('a', 1.01, 1);
  assert.equal(book.occupied, 1, 'a repeat hit on one body re-uses its slot');
  assert.equal(book.level('a', 1.01), 1);
  assert.equal(book.level('a', 1.5), 0, 'past two frames: dark');
  assert.equal(book.occupied, 0, 'and the slot is released');
  // A render stall: the first read comes long after the hit and still shows the flash once.
  book.noteHit('b', 2.0, 1);
  assert.equal(book.level('b', 2.5), 1, 'the first read after a hit never returns nothing');
  assert.equal(book.level('b', 2.5), 0, 'and only once');
});

test('the spark spray leaves along the reflection, not the normal', () => {
  const out = { x: 0, z: 0 };
  // Shot travelling +x into a plate whose outward normal is -x: bounces straight back.
  reflectAxis(1, 0, -1, 0, out);
  assert.ok(Math.abs(out.x + 1) < 1e-9 && Math.abs(out.z) < 1e-9);
  // A glancing shot (45 degrees) off a -z facing plate keeps its along-plate travel.
  reflectAxis(1, 1, 0, -1, out);
  assert.ok(out.x > 0.7 && out.z < -0.7, `reflected ${out.x}, ${out.z}`);
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - 1) < 1e-9, 'unit length');
  reflectAxis(1, 0, 0, 0, out);
  assert.ok(Math.abs(out.x + 1) < 1e-9, 'a degenerate normal reverses the shot');
});

test('presentation seeds are pure functions of id, tick and salt', () => {
  assert.equal(seed01(7, 100, 3), seed01(7, 100, 3));
  assert.notEqual(seed01(7, 100, 3), seed01(8, 100, 3));
  assert.notEqual(seed01(7, 100, 3), seed01(7, 101, 3));
  assert.notEqual(seed01(7, 100, 3), seed01(7, 100, 4));
  for (let i = 0; i < 500; i += 1) {
    const v = seed01('hull', i, 9);
    assert.ok(v >= 0 && v < 1);
    const s = seedSigned('hull', i, 9);
    assert.ok(s >= -1 && s < 1);
  }
  assert.equal(plumeStutter(3, 12.34, BODY_TIER_FIRE), plumeStutter(3, 12.34, BODY_TIER_FIRE));
  assert.equal(corkscrewOffset(3, 2, 6, 10), corkscrewOffset(3, 2, 6, 10));
  assert.equal(lampFlicker(3, 5, 1), lampFlicker(3, 5, 1));
});

test('the drive flickers at 30 percent, stutters at 10, and reduced flash removes the strobe', () => {
  assert.equal(plumeStutter(1, 3, BODY_TIER_CLEAN), 1);
  assert.equal(plumeStutter(1, 3, BODY_TIER_SMOKE), 1);
  let sparksMin = 1; let fireMin = 1; let reducedMin = 1;
  for (let i = 0; i < 400; i += 1) {
    sparksMin = Math.min(sparksMin, plumeStutter(2, i / 14, BODY_TIER_SPARKS));
    fireMin = Math.min(fireMin, plumeStutter(2, i / 9, BODY_TIER_FIRE));
    reducedMin = Math.min(reducedMin, plumeStutter(2, i / 9, BODY_TIER_FIRE, true));
  }
  assert.ok(sparksMin >= 0.55 && sparksMin < 0.9, `flicker never drops the drive out (${sparksMin})`);
  assert.ok(fireMin <= 0.15, `stutter cuts the drive out in bursts (${fireMin})`);
  assert.ok(reducedMin >= 0.8, `reduced flash breathes, it does not strobe (${reducedMin})`);
});

test('the A/B switch restores the old presentation', () => {
  assert.equal(bodyHitEnabled(), true);
  globalThis.__ovh06bOff = true;
  try { assert.equal(bodyHitEnabled(), false); } finally { delete globalThis.__ovh06bOff; }
  assert.equal(bodyHitEnabled(), true);
});

function makeHull() {
  const shared = new THREE.MeshStandardMaterial({ color: 0x889099, emissive: 0x000000, emissiveIntensity: 1 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22aaff, emissiveIntensity: 3 });
  const shell = new THREE.MeshBasicMaterial({ transparent: true });
  const group = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const l = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lamp);
  l.userData.blink = { base: 3 };
  const s = new THREE.Mesh(new THREE.SphereGeometry(1), shell);
  group.add(a, b, l, s);
  return { group, shared, lamp, shell, a, b, l, s };
}

test('the struck hull flashes on a private clone and the shared material is never edited', () => {
  const h = makeHull();
  const book = createHitFlashBook(8);
  assert.equal(hullFlashMeshCount(h.group), 2, 'two opaque lit hull meshes; lamp and shell keep their own glow');
  book.noteHit(9, 1.0, 1);
  const level = syncHullHitFlash(9, h.group, 1.0, false, book);
  assert.equal(level, 1);
  assert.notEqual(h.a.material, h.shared, 'the struck mesh draws a clone');
  assert.equal(h.shared.emissiveIntensity, 1, 'the shared material is untouched');
  assert.equal(h.shared.emissive.getHex(), 0x000000);
  assert.ok(h.a.material.emissiveIntensity > 3, 'brighter while the flash is live');
  assert.equal(h.l.material, h.lamp, 'the lamp keeps its own driver');
  assert.equal(h.s.material, h.shell, 'a transparent shell is never flashed');
  const clone = h.a.material;
  // Two frames later it is the authored look again.
  assert.equal(syncHullHitFlash(9, h.group, 1.0 + HIT_FLASH_S + 0.001, false, book), 0);
  assert.equal(h.a.material, h.shared);
  assert.equal(h.b.material, h.shared);
  // A second hit re-uses the same clone: no new material per hit.
  book.noteHit(9, 5.0, 1);
  syncHullHitFlash(9, h.group, 5.0, false, book);
  assert.equal(h.a.material, clone, 'the clone is pooled per mesh');
});

test('an unstruck hull costs nothing and is never touched', () => {
  const h = makeHull();
  const book = createHitFlashBook(8);
  assert.equal(syncHullHitFlash(4, h.group, 1, false, book), 0);
  assert.equal(h.a.material, h.shared);
  assert.equal(syncHullHitFlash(null, h.group, 1, false, book), 0);
  assert.equal(syncHullHitFlash(4, null, 1, false, book), 0);
});

test('reduced flashing dims the hull flash', () => {
  const full = makeHull();
  const dim = makeHull();
  const book = createHitFlashBook(8);
  book.noteHit(1, 1.0, 1);
  book.noteHit(2, 1.0, 1);
  const lf = syncHullHitFlash(1, full.group, 1.0, false, book);
  const ld = syncHullHitFlash(2, dim.group, 1.0, true, book);
  assert.ok(ld < lf * 0.5, `${ld} vs ${lf}`);
  assert.ok(dim.a.material.emissiveIntensity < full.a.material.emissiveIntensity);
});
