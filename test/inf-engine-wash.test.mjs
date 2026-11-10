// inf-engine-wash — a burning drive stirs the dust off the surface it hangs over.
//
// A ship's exhaust was a light effect with no environment: a tug hovering its main drive over a
// rock sat on a surface that behaved like a painted backdrop. Now the plume blows that surface's
// dust off its skin — the contact sits on the near face under the plume path, the breath drifts
// downrange along the exhaust, strength follows the throttle and the height above the skin, and
// the tint names the surface. The contact law is pure and headless; the vfx adapter only walks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ENGINE_WASH_DRIVE_FLOOR,
  ENGINE_WASH_HZ,
  ENGINE_WASH_STRONG_DRIVE,
  ENGINE_WASH_TINTS,
  engineWashEmitPayload,
  engineWashPhase,
  engineWashSlot,
  resolveEngineWashContact,
  shouldEmitEngineWash,
} from '../src/render/engineWash.js';

const ship = { pos: { x: 0, z: 0 }, rot: 0, radius: 8 };
// A rock directly behind the ship (the exhaust side): the plume blows across its skin.
const asternRock = { pos: { x: -60, z: 0 }, radius: 40, kind: 'rock' };

test('a hover over a rock kicks dust off its near face, downrange along the exhaust', () => {
  const wash = resolveEngineWashContact(ship, 1, asternRock, {});
  assert.ok(wash.hit, 'the plume works the surface beneath it');
  // The contact sits on the rock's near face: 94% of the radius back toward the ship.
  assert.ok(Math.abs(wash.x - (-60 + 40 * 0.94)) < 1e-6, `contact on the skin (x ${wash.x.toFixed(1)})`);
  assert.ok(Math.abs(wash.z) < 1e-6);
  // The breath drifts downrange: the exhaust points −X (rot 0 → forward +X), so dust blows −X.
  assert.ok(wash.driftX < 0, `dust blows downrange (driftX ${wash.driftX.toFixed(2)})`);
  assert.ok(Math.abs(wash.driftZ) < 1e-9);
  assert.equal(wash.r, ENGINE_WASH_TINTS.rock.r, 'rock dust wears the mineral tint');
});

test('height and throttle shape the wash: a low hard burn beats a high gentle one', () => {
  const near = resolveEngineWashContact(ship, 1, asternRock, {});
  const far = { ...asternRock, pos: { x: -96, z: 0 } }; // deeper into the band, off the skin
  const high = resolveEngineWashContact(ship, 1, far, {});
  assert.ok(near.severity > high.severity, 'closer to the skin stirs harder');
  const gentle = resolveEngineWashContact(ship, 0.4, asternRock, {});
  assert.ok(near.severity > gentle.severity, 'more throttle stirs harder');
  assert.ok(near.scale > gentle.scale, 'a harder wash throws a broader breath');
});

test('a surface on the nose side reads clean burn-away, not wash', () => {
  const aheadRock = { pos: { x: 60, z: 0 }, radius: 40, kind: 'rock' };
  const wash = resolveEngineWashContact(ship, 1, aheadRock, {});
  assert.equal(wash.hit, false, 'the exhaust streams away from a surface ahead of the nose');
});

test('a surface beyond the plume band, or below the drive floor, stirs nothing', () => {
  assert.equal(resolveEngineWashContact(ship, 1, { pos: { x: -400, z: 0 }, radius: 10, kind: 'rock' }, {}).hit,
    false, 'out of range');
  assert.equal(resolveEngineWashContact(ship, ENGINE_WASH_DRIVE_FLOOR - 0.1, asternRock, {}).hit,
    false, 'an idle plume cannot stir');
  assert.equal(resolveEngineWashContact(ship, 1, { ...asternRock, kind: 'unknown-stuff' }, {}).hit,
    false, 'an unknown surface kind draws nothing');
  assert.equal(resolveEngineWashContact(null, 1, asternRock, {}).hit, false);
  assert.equal(resolveEngineWashContact(ship, 1, { ...asternRock, pos: { x: NaN, z: 0 } }, {}).hit, false);
});

test('station and wreck tints differ from rock, so the wash names its surface', () => {
  const deck = resolveEngineWashContact(ship, 1, { pos: { x: -60, z: 0 }, radius: 40, kind: 'station' }, {});
  const ash = resolveEngineWashContact(ship, 1, { pos: { x: -60, z: 0 }, radius: 40, kind: 'wreck' }, {});
  assert.equal(deck.r, ENGINE_WASH_TINTS.station.r);
  assert.equal(ash.r, ENGINE_WASH_TINTS.wreck.r);
  assert.ok(deck.r !== ash.r);
});

test('the cadence is frugal and deterministic: slots quantize sim time', () => {
  assert.equal(engineWashSlot(1.0), engineWashSlot(1.0 + 0.1 / ENGINE_WASH_HZ),
    'two reads inside one slot land on one slot');
  assert.ok(engineWashSlot(1.5) !== engineWashSlot(1.0), 'the slot advances with sim time');
});

test('a strong drive pulses every slot; a working weak drive pulses every second slot', () => {
  const strong = [];
  const weak = [];
  for (let slot = 0; slot < 8; slot++) {
    strong.push(shouldEmitEngineWash(ENGINE_WASH_STRONG_DRIVE, slot, 0));
    weak.push(shouldEmitEngineWash(0.4, slot, 0));
  }
  assert.ok(strong.every(Boolean), 'a full burn washes on every slot');
  assert.equal(weak.filter(Boolean).length, 4, 'a light wash is a sparser wash');
  assert.ok(shouldEmitEngineWash(ENGINE_WASH_DRIVE_FLOOR - 0.01, 0, 0) === false,
    'below the floor nothing pulses at all');
});

test('ships de-phase: the weak-drive parity is the ship\'s own, not a global metronome', () => {
  const a = shouldEmitEngineWash(0.4, 1, 0.1);
  const b = shouldEmitEngineWash(0.4, 1, 0.7);
  assert.notEqual(a, b, 'two idle-hovering ships do not breathe in unison');
});

test('the emit payload is complete and deterministic per slot', () => {
  const wash = resolveEngineWashContact(ship, 1, asternRock, {});
  const p1 = engineWashEmitPayload(wash, 'tug-7', 42, {});
  const p2 = engineWashEmitPayload(wash, 'tug-7', 42, {});
  assert.equal(p1.seed, p2.seed, 'the same hover paints the same dust');
  assert.notEqual(p1.seed, engineWashEmitPayload(wash, 'tug-7', 43, {}).seed, 'slots vary the seed');
  assert.notEqual(p1.seed, engineWashEmitPayload(wash, 'tug-8', 42, {}).seed, 'ships vary the seed');
  assert.ok(p1.lifeScale > 0 && p1.lifeScale < 1, 'wash dust is short-lived; the family stays frugal');
  assert.ok(p1.opacity > 0.3 && p1.opacity <= 0.8, 'wash reads but never blankets');
  assert.ok(Number.isFinite(p1.heading));
});

test('the phase hash is stable per id and varies across ids', () => {
  assert.equal(engineWashPhase('tug-7'), engineWashPhase('tug-7'));
  assert.notEqual(engineWashPhase('tug-7'), engineWashPhase('tug-8'));
});

test('the live owner is wired: the adapter walks the same drive read the nozzles use', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /sub\.engineWash = this\._updateEngineWash\(\) \? 1 : 0;/,
    'the frame update walks the wash next to the cradle');
  assert.match(vfx, /const drive = this\._engineDriveFor\(e, this\._engineWashDriveScratch \|\|= {}\)\.drive;/,
    'the wash reads the same _engineDriveFor number the nozzles draw with once per candidate');
  assert.match(vfx, /drives\[candidates\.length\] = drive;/,
    'the wash copies each drive scalar before the shared scratch is refilled');
  assert.match(vfx, /gas\.emitFractureDust\(\{[\s\S]*?occluderRadius: surfR \* 0\.9/,);
  assert.match(vfx, /indexedTypeScan\(state, bucketName\)/,
    'surfaces come from the entity index buckets, not a second spatial pass');
});
