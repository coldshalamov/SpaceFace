// The Look: one authored source for the picture's vibe (src/data/lookMoods.js), one runtime
// owner (src/render/look.js). These tests protect the wiring, not the taste: every value a
// shader reads must exist, every sector must wear a real mood, and a mood change must reach
// the shared uniforms.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  DEFAULT_LOOK_MOOD,
  LOOK_BASE,
  resolveLookEmissiveGain,
  LOOK_MOODS,
  resolveLookLighting,
  resolveLookMood,
  resolveLookMoodId,
  resolveLookPost,
} from '../src/data/lookMoods.js';
import { SECTOR_VISUAL_PROFILES } from '../src/data/sectorVisualProfiles.js';
import {
  beginLookMood,
  currentLookMoodId,
  LOOK_FIELDS,
  LOOK_POST_UNIFORMS,
  LOOK_SURFACE_UNIFORMS,
  tuneLook,
  updateLook,
} from '../src/render/look.js';
import { installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { SPACE_POST_PRESENTATION_GLSL } from '../src/render/bloom.js';

const isColor = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

test('every mood resolves a complete, finite look', () => {
  for (const id of Object.keys(LOOK_MOODS)) {
    const mood = resolveLookMood(id);
    assert.equal(mood.id, id);
    for (const key of LOOK_FIELDS.surfaceScalars) assert.ok(Number.isFinite(mood.surface[key]), `${id} surface.${key}`);
    for (const key of LOOK_FIELDS.surfaceColors) assert.ok(isColor(mood.surface[key]), `${id} surface.${key}`);
    for (const key of LOOK_FIELDS.postScalars) assert.ok(Number.isFinite(mood.post[key]), `${id} post.${key}`);
    for (const key of LOOK_FIELDS.postColors) assert.ok(isColor(mood.post[key]), `${id} post.${key}`);
    for (const key of ['grade', 'vignette']) {
      assert.ok(mood.post[key] >= 0 && mood.post[key] <= 1, `${id} post.${key} is a 0..1 amount`);
    }
    for (const key of ['keyHex', 'rimHex', 'fillHex', 'ambientHex']) {
      assert.ok(Number.isInteger(mood.rig[key]) && mood.rig[key] >= 0 && mood.rig[key] <= 0xffffff, `${id} rig.${key}`);
    }
    assert.equal(Object.isFrozen(mood), true);
  }
  assert.equal(resolveLookMood('no-such-mood').id, DEFAULT_LOOK_MOOD, 'an unknown mood falls back');
});

test('a mood only restates base keys, so a typo cannot silently do nothing', () => {
  for (const [id, mood] of Object.entries(LOOK_MOODS)) {
    for (const block of ['surface', 'post', 'rig']) {
      for (const key of Object.keys(mood[block] || {})) {
        assert.ok(key in LOOK_BASE[block], `${id}.${block}.${key} is not a Look value`);
      }
    }
  }
});

test('paint never emits: the pigment ceiling sits under the bloom knee in every mood', () => {
  // bloom.js: threshold 1.0, knee 0.25 -> spill starts at 0.75 scene-linear luminance.
  for (const id of Object.keys(LOOK_MOODS)) {
    assert.ok(resolveLookMood(id).surface.paintCeiling <= 0.75, `${id} paint ceiling`);
  }
  assert.ok(resolveLookEmissiveGain('signal', 'glow_cyan') > 2 && resolveLookEmissiveGain('drive', 'glow_drive') > 1,
    'lamps are lifted above paint');
  assert.ok(resolveLookEmissiveGain('signal', 'glow_warm.deck') < resolveLookEmissiveGain('signal', 'glow_red'),
    'window rows are lifted less than point lamps');
  assert.equal(resolveLookEmissiveGain('hull', 'paint'), 1, 'paint is never lifted');
});

test('every sector visual profile wears a real mood, its rig colours and its post amounts', () => {
  for (const profile of Object.values(SECTOR_VISUAL_PROFILES)) {
    const moodId = resolveLookMoodId(profile);
    assert.ok(Object.prototype.hasOwnProperty.call(LOOK_MOODS, moodId), `${profile.id} -> ${moodId}`);
    const mood = resolveLookMood(moodId);
    const lighting = resolveLookLighting(profile);
    assert.equal(lighting.key, profile.lighting.key, `${profile.id} keeps its authored key intensity`);
    assert.equal(lighting.rimColor, Number.isFinite(profile.lighting.rimColor) ? profile.lighting.rimColor : mood.rig.rimHex);
    assert.equal(lighting.keyColor, Number.isFinite(profile.lighting.keyColor) ? profile.lighting.keyColor : mood.rig.keyHex,
      `${profile.id} explicit key tint wins over the mood`);
    assert.equal(resolveLookLighting(profile), lighting, 'one rig object per profile (the renderer guards by identity)');
    const post = resolveLookPost(profile);
    assert.equal(post.exposure, profile.post.exposure);
    assert.equal(post.grade, mood.post.grade);
    assert.equal(post.vignette, mood.post.vignette);
    assert.equal(resolveLookPost(profile), post);
  }
  assert.equal(resolveLookPost(null), null);
});

test('the surface shader declares exactly the Look uniforms the runtime provides', () => {
  const material = new THREE.MeshStandardMaterial();
  installIllustratedSurface(material);
  const shader = {
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader, {});
  const declared = new Set([...shader.fragmentShader.matchAll(/uniform\s+\w+\s+(sfLook\w+)\s*;/g)].map((m) => m[1]));
  assert.deepEqual([...declared].sort(), Object.keys(LOOK_SURFACE_UNIFORMS).sort());
  for (const name of declared) {
    assert.equal(shader.uniforms[name], LOOK_SURFACE_UNIFORMS[name], `${name} is the shared object, not a copy`);
  }
});

test('the post block declares exactly the Look uniforms the runtime provides', () => {
  const declared = new Set([...SPACE_POST_PRESENTATION_GLSL.matchAll(/uniform\s+\w+\s+(uLook\w+)\s*;/g)].map((m) => m[1]));
  assert.deepEqual([...declared].sort(), Object.keys(LOOK_POST_UNIFORMS).sort());
});

test('a mood change reaches the shared uniforms: snap, lerp, and bench patch', () => {
  beginLookMood('arcade', 0);
  assert.equal(currentLookMoodId(), 'arcade');
  const arcade = resolveLookMood('arcade');
  const noir = resolveLookMood('neon_noir');
  assert.equal(LOOK_SURFACE_UNIFORMS.sfLookContour.value, arcade.surface.contour);
  assert.deepEqual(LOOK_POST_UNIFORMS.uLookShadowTint.value.toArray(), arcade.post.shadowTint);

  beginLookMood('neon_noir', 2);
  assert.equal(LOOK_SURFACE_UNIFORMS.sfLookContour.value, arcade.surface.contour, 'a lerp starts from the current look');
  assert.equal(updateLook(1), true);
  const mid = LOOK_SURFACE_UNIFORMS.sfLookContour.value;
  assert.ok(mid > Math.min(arcade.surface.contour, noir.surface.contour)
    && mid < Math.max(arcade.surface.contour, noir.surface.contour), 'midway is between the two moods');
  updateLook(5);
  assert.equal(LOOK_SURFACE_UNIFORMS.sfLookContour.value, noir.surface.contour);
  assert.deepEqual(LOOK_SURFACE_UNIFORMS.sfLookRim.value.toArray(), noir.surface.rim);
  assert.equal(updateLook(1), false, 'an idle look costs nothing');

  tuneLook({ surface: { coat: 0.25, rim: [0, 1, 0] }, post: { ink: 0 } });
  assert.equal(LOOK_SURFACE_UNIFORMS.sfLookCoat.value, 0.25);
  assert.deepEqual(LOOK_SURFACE_UNIFORMS.sfLookRim.value.toArray(), [0, 1, 0]);
  assert.equal(LOOK_POST_UNIFORMS.uLookInk.value, 0);
  beginLookMood('neon_noir', 0);
  assert.equal(LOOK_SURFACE_UNIFORMS.sfLookCoat.value, noir.surface.coat, 'a snap clears a bench patch');
  beginLookMood('arcade', 0);
});
