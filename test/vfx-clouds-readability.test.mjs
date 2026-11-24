// DEMO-VFX-CLOUDS-1 — hits never white out the player.
//
// Guards the structural contracts behind the four white-out fixes:
//   1. ExplosionRupture bounds every material family (mineral, armor, reactor, fuel), stays low
//      behind ship silhouettes, and carries shorter lifetimes + lower opacity.
//   2. PowerFx.bomb() draws scorch/soot BEFORE fire and below ship height, trims puff size and
//      HDR so bloom does not blow out, clears cleanly on simTime rewind (Again -> round 1), and
//      feeds the player hull position to SparkField's silhouette-clearance uniform.
//   3. Event & flipbook shaders cap peak HDR/opacity, dissolve over life, fade radially from
//      the impact center, and keep broad flash/smoke layers behind ship hulls.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ExplosionRupture } from '../src/render/combat/explosionRupture.js';
import { createTransientVfxMaterial } from '../src/render/combat/transientVfxMaterials.js';
import { FLIPBOOK_SHEETS, createFlipbookMaterial } from '../src/render/combat/flipbookSprites.js';
import { PowerFx } from '../src/render/vfx/kit/powerFx.js';
import { SPARK_SHAPE } from '../src/render/vfx/kit/sparkField.js';
import { GAS_FAMILY_BY_ID } from '../src/render/combat/gas/gasFamilies.js';
import { createExplosionPresentationMethods } from '../src/render/vfx/explosionPresentationVfx.js';

test('ExplosionRupture bounds armor/mineral/fuel parcels and keeps clouds below ship roofs', () => {
  const cases = [
    { sourceType: 'asteroid', radius: 60 },
    { sourceType: 'ship', cause: 'kinetic', radius: 60 },
    { sourceType: 'ship', cause: 'generic', radius: 60 },
    { sourceType: 'volatile_asteroid', radius: 60 },
  ];
  for (const receipt of cases) {
    const owner = new ExplosionRupture(new THREE.Scene());
    owner.emitPhase('rupture', { serial: 9, classId: 'ordinary', x: 0, z: 0, dirX: 1, dirZ: 0, ...receipt });
    const parcels = owner.records.filter((r) => r.alive);
    assert.ok(parcels.length > 0 && parcels.length <= 4, `${receipt.sourceType}/${receipt.cause}: bounded parcel count`);
    assert.ok(parcels.every((r) => r.length < 18), 'no oversized cream-white curved shell on large hits');
    assert.ok(parcels.every((r) => r.height <= 2.0 && r.y < 0), 'rupture sits below ship hulls via depth test');
    assert.ok(parcels.every((r) => r.alpha <= 0.42), 'rupture stays translucent, never opaque');
    assert.ok(parcels.every((r) => r.life < 0.8), 'rupture clears promptly');
    owner.dispose();
  }
});

test('PowerFx bomb emits soot before fire below ship height, tracks player clearance, and clears on rewind', () => {
  const fx = new PowerFx(new THREE.Scene(), {
    toLocal: (x, z, out) => { out.x = x; out.z = z; return out; },
    flashLight: () => true,
  });
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 42, z: -18 }, radius: 10 };
  const s = {
    simTime: 32,
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player],
    fields: { active: [] },
    settings: { video: {}, accessibility: {} },
  };
  fx.update(0.016, s);
  const uPlayer = fx.sparks.material.uniforms.uPlayer.value;
  assert.equal(uPlayer.x, 42);
  assert.equal(uPlayer.z, -18);
  assert.ok(uPlayer.w >= 10, 'player protection radius reaches SparkField shader');

  fx.bomb(42, -18, 24, 'death-blast');
  const A = fx.sparks.arrays[0];
  const S = fx.sparks.arrays[2];
  const C0 = fx.sparks.arrays[3];
  const C1 = fx.sparks.arrays[4];
  let lastSoot = -1;
  let firstFire = Infinity;
  for (let i = 0; i < fx.sparks.highWater; i++) {
    const o = i * 4;
    if (C0[o + 3] === SPARK_SHAPE.PUFF) {
      assert.ok(A[o + 1] < 0, 'blast puffs sit below ship hulls');
      assert.ok(S[o + 1] < 45, `blast puff end size stays bounded (${S[o + 1]})`);
      if (C1[o + 3] >= 0.8) lastSoot = i;
      else if (firstFire === Infinity) firstFire = i;
    }
  }
  assert.ok(lastSoot >= 0 && firstFire > lastSoot, 'soot draws before fire so it never paints a dark grey disc over the blast');

  // Rewind (Again -> new round at simTime 0): clears prior run death explosion completely.
  s.simTime = 0.016;
  fx.update(0.016, s);
  assert.equal(fx.sparks.highWater, 0, 'clock rewind clears lingering sparks from the prior run');
  assert.equal(fx.sparks.mesh.visible, false);
  assert.equal(fx.shells.highWater, 0, 'no rings emitted');
  fx.dispose();
});

test('transient glow, flipbook, and gas settings cap HDR/opacity and stay readable', () => {
  const glow = createTransientVfxMaterial('glow', 1.7);
  assert.match(glow.vertexShader, /yDrop/, 'medium/large glow volumes drop below ship roof height');
  assert.match(glow.fragmentShader, /radialFade/, 'event volumes fade radially from the impact center');
  assert.match(glow.fragmentShader, /min\(event\.a/, 'glow bucket opacity stays capped');
  glow.dispose();

  assert.ok(FLIPBOOK_SHEETS.fire.hdr <= 2.5, 'fire flipbook HDR stays below white-out');
  assert.ok(FLIPBOOK_SHEETS.spark.hdr <= 2.6, 'spark flipbook HDR stays below white-out');
  const smokeMat = createFlipbookMaterial('smoke', new THREE.Texture());
  assert.match(smokeMat.vertexShader, /backOff/, 'flipbook smoke sits behind opaque hulls');
  assert.match(smokeMat.fragmentShader, /smokeAlpha/, 'flipbook smoke alpha stays capped');
  smokeMat.dispose();

  assert.ok(GAS_FAMILY_BY_ID.combustion.opacity <= 0.7);
  assert.ok(GAS_FAMILY_BY_ID.dust.opacity <= 0.65);
  assert.ok(GAS_FAMILY_BY_ID.vent.opacity <= 0.55);

  const methods = createExplosionPresentationMethods({ SPR_COMBUSTION: 4, SPR_FLASH: 0, SPR_PUFF: 2, SPR_RING: 1 });
  const spawned = [];
  const host = {
    state: { settings: {} },
    _spawnSprite: (...args) => spawned.push(args),
    _spawnParticle: () => {},
    _toLocalXZ: (x, z, out) => { out.x = x; out.z = z; return out; },
    _spawnLocalXZ: { x: 0, z: 0 },
  };
  methods._emitPaintedExplosionBody.call(host, 'ignition', { x: 0, z: 0, radius: 14, classId: 'ordinary', serial: 1 });
  const flash = spawned.find((a) => a[0] === 0);
  assert.ok(flash, 'ignition still delivers a punch flash');
  assert.ok(flash[2] < 0, 'explosion flash sits behind ship hulls');
  assert.ok(flash[6] < 24, `ignition flash stays sized to victim (${flash[6]})`);
  assert.ok(flash[7] <= 0.65, `ignition flash opacity avoids white-out (${flash[7]})`);
});
