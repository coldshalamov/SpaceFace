// Shields and force-field SURFACES — the shield-response class's two named 2026-09-18 gaps.
//
// 1. "Shield idle shell is static while visible (B16 near-miss)". The shell had no clock at all:
//    every term was a function of the scalar charge, so while the shield was on screen the picture
//    was frozen and its only animation was its own brightness ramp. That is B16 sitting on B17.
// 2. "Shield hit is a gaussian contact ring on a shell+lattice". The contact record aged ONE
//    linear number and the shell derived both the ring's radius and its brightness from it, so a
//    hit could only ever be a circle growing at a constant rate while dimming at a constant rate.
//
// Plus the field-surface material pass: structural members and the machined cross-section must ride
// in already-reserved descriptor floats, must leave weapon-source descriptors neutral, and must not
// cost a strip, an attribute or a descriptor upload.
//
// Deliberately imports the owning modules directly rather than `src/render/vfx.js`: these are
// contracts of the shield and field surfaces themselves, and the whole-hub integration is already
// covered by test/vfx-field-lifecycle.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  SHIELD_HIT_LIFE, SHIELD_HIT_SLOTS,
  addShieldContact, ageShieldContacts, clearShieldContacts, hasShieldContact, readShieldContacts,
} from '../src/render/weapons/shieldContacts.js';
import {
  SHIELD_SHELL_GLSL, SHIELD_SHELL_TIME_UNIFORM, setShieldShellClock, shieldShellUniforms,
} from '../src/render/weapons/shieldShell.js';
import { FIELD_SIGNATURES, SURFACE_MATERIALS } from '../src/render/forceLanguage/catalog.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import {
  SURFACE_FLOATS, SURFACE_VERTEX, SweptSurfaceBatch,
} from '../src/render/forceLanguage/sweptSurfaceBatch.js';

const STEP = 1 / 60;
const SCRATCH = new Float32Array(SHIELD_HIT_SLOTS * 4);

function contactTrace(id, frames) {
  const trace = [];
  for (let i = 0; i < frames; i++) {
    readShieldContacts(id, SCRATCH);
    trace.push({
      x: SCRATCH[0], y: SCRATCH[1], z: SCRATCH[2],
      reach: Math.hypot(SCRATCH[0], SCRATCH[1], SCRATCH[2]),
      radiance: SCRATCH[3],
    });
    ageShieldContacts(STEP);
  }
  return trace;
}

test('a shield contact carries propagation and radiance on SEPARATE channels', () => {
  clearShieldContacts();
  addShieldContact('hull', 0.5773502692, 0.5773502692, 0.5773502692, 1);
  const trace = contactTrace('hull', 15);

  assert.equal(trace[0].radiance, 1, 'the bite lands at full authored strength on the strike frame');
  assert.ok(Math.abs(trace[0].reach - 1) < 1e-6, 'the front has not travelled yet on the strike frame');

  const live = trace.filter((f) => f.radiance > 0);
  assert.ok(live.length > 8, 'the contact is readable for most of its life');

  // Propagation rises while radiance falls: two channels, not one number doing both jobs.
  for (let i = 1; i < live.length; i++) {
    assert.ok(live[i].reach >= live[i - 1].reach - 1e-9,
      `front never retreats (frame ${i}: ${live[i].reach} < ${live[i - 1].reach})`);
  }
  assert.ok(live[live.length - 1].reach > 1.8, 'the front does cross the shell within the contact life');

  // The front DECELERATES. A constant-rate ring is the gaussian-circle defect this replaces.
  const early = live[2].reach - live[1].reach;
  const late = live[live.length - 1].reach - live[live.length - 2].reach;
  assert.ok(early > late * 2,
    `the front must brake into the lattice (early ${early.toFixed(4)} vs late ${late.toFixed(4)})`);

  // Radiance is not a straight ramp: the lattice re-radiates as the front crosses panel rings,
  // which is exactly what stops brightness from being the only thing that moves.
  let rises = 0;
  for (let i = 1; i < live.length; i++) if (live[i].radiance > live[i - 1].radiance + 1e-9) rises++;
  assert.ok(rises >= 1, 'cooling has structure rather than being a monotone opacity ramp');

  // The strike point itself never moves — the incandescent bite belongs where the round landed.
  for (const frame of live) {
    const unit = [frame.x / frame.reach, frame.y / frame.reach, frame.z / frame.reach];
    for (const component of unit) {
      assert.ok(Math.abs(component - 0.5773502692) < 1e-5, 'the contact direction is stable');
    }
  }
  clearShieldContacts();
});

test('contacts retire on the authored life and keep the inbound-direction contract', () => {
  clearShieldContacts();
  addShieldContact('hull', -1, 0, 0, 1);
  const hits = readShieldContacts('hull');
  assert.ok(hits[0] < 0, 'contact direction faces the inbound hit');
  assert.equal(hits[3], 1, 'peak radiance is clamped into 0..1');

  // Sampled fine, so the answer is the retirement time and not the frame it was noticed on.
  const fine = 1 / 600;
  let elapsed = 0;
  while (hasShieldContact('hull') && elapsed < 2) { ageShieldContacts(fine); elapsed += fine; }
  assert.ok(elapsed <= SHIELD_HIT_LIFE + fine,
    `a contact never outlives SHIELD_HIT_LIFE (retired at ${elapsed.toFixed(4)}s)`);
  assert.ok(elapsed > SHIELD_HIT_LIFE * 0.9, 'and it uses nearly all of that window');
  assert.equal(readShieldContacts('hull'), null, 'the record is released once nothing is burning');

  // Weak contacts still present: the shell gate reads radiance, not a separate flag.
  addShieldContact('hull', 0, 1, 0, 0.05);
  assert.ok(Math.abs(readShieldContacts('hull')[3] - 0.35) < 1e-6, 'a weak hit is floored, not dropped');
  clearShieldContacts();
});

test('two contacts landing on one frame do not ring in lockstep', () => {
  clearShieldContacts();
  addShieldContact('hull', 1, 0, 0, 1);
  addShieldContact('hull', 0, 0, 1, 1);
  for (let i = 0; i < 6; i++) ageShieldContacts(STEP);
  readShieldContacts('hull', SCRATCH);
  const reachA = Math.hypot(SCRATCH[0], SCRATCH[1], SCRATCH[2]);
  const reachB = Math.hypot(SCRATCH[4], SCRATCH[5], SCRATCH[6]);
  assert.notEqual(reachA, reachB, 'the two fronts cross the lattice at different rates');
  assert.notEqual(SCRATCH[3], SCRATCH[7], 'and they re-radiate out of phase');
  assert.ok(Math.abs(reachA - reachB) < 0.25, 'but they remain the same event, not two unrelated cues');
  clearShieldContacts();
});

test('the shell owns a clock, and it is the simulation clock', () => {
  assert.match(SHIELD_SHELL_GLSL, /uniform float uShellTime;/,
    'the shared construction declares its own clock, so both consumers compile with or without it');

  // The response must move on something other than the scalar charge. These are the three
  // structural channels the idle shell was missing; losing them is the B16 regression.
  for (const term of ['circulation', 'current', 'breath']) {
    assert.ok(SHIELD_SHELL_GLSL.includes(term), `shell keeps its ${term} channel`);
  }
  const clockUses = SHIELD_SHELL_GLSL.split('clock').length - 1;
  assert.ok(clockUses >= 4, `the clock drives real structure, not one decorative term (${clockUses} uses)`);

  // Contact arrives on two channels, and a producer that still ships a unit direction is correct.
  assert.match(SHIELD_SHELL_GLSL, /spread\s*=\s*clamp\(len - 1\.0/, 'propagation is read from the encoded reach');
  assert.match(SHIELD_SHELL_GLSL, /age\s*=\s*spread > 0\.0005 \? spread : 1\.0 - w/,
    'a legacy unit-length record still resolves to the old age-from-strength read');

  // No backtick may enter a GLSL template literal: it terminates the JS string and breaks the file.
  assert.equal(SHIELD_SHELL_GLSL.includes('`'), false, 'no backtick inside the shader source');

  const material = { uniforms: shieldShellUniforms() };
  assert.ok(material.uniforms[SHIELD_SHELL_TIME_UNIFORM], 'the uniform entry is the whole hook surface');
  assert.equal(setShieldShellClock(material, 12.5), 12.5, 'the clock follows simulation time');
  assert.equal(setShieldShellClock(material, 12.5), 12.5, 'a paused simulation clock freezes the shell');
  assert.equal(setShieldShellClock(material, 40, true), 12.5, 'reduced motion holds the shell still');
  assert.equal(setShieldShellClock(material, Number.NaN), 12.5, 'a broken clock never poisons the uniform');
  assert.equal(setShieldShellClock(null, 1), 0, 'a material without the uniform is simply inert');
});

test('field surfaces carry authored member material in ALREADY-RESERVED floats', () => {
  assert.equal(SURFACE_FLOATS, 36, 'the descriptor did not grow');
  assert.deepEqual(SURFACE_MATERIALS.plain, { flex: 1, ribs: 0, heat: 1 },
    'the neutral member reproduces the previous surface exactly');

  // Weapon sources must be untouched: their 24-float descriptor never reaches the lifecycle branch,
  // and the shader reads the two material channels as neutral when it is not on that branch.
  assert.match(SURFACE_VERTEX, /vMaterial=vec4\(cycle \? iBehavior\.w : 1\.0, cycle \? iPivot\.z : 0\.0, cycle \? iPivot\.w : 1\.0, 0\.0\);/,
    'a legacy weapon strip resolves to a smooth, fully hot surface');
  assert.equal(SURFACE_VERTEX.includes('`'), false, 'no backtick inside the shader source');

  const batch = new SweptSurfaceBatch(new THREE.Scene(), { capacity: 2 });
  batch.begin(1);
  batch.add(new Float32Array(24));
  batch.end();
  assert.equal(batch.attributes[7].getW(0), 0, 'legacy flex float stays at its default');
  assert.equal(batch.attributes[8].getZ(0), 0, 'legacy rib float stays at its default');
  assert.equal(batch.attributes[8].getW(0), 0, 'legacy heat float stays at its default');
  for (const attribute of batch.attributes) {
    assert.ok(attribute.array.every(Number.isFinite), 'every instance float stays finite');
  }
  assert.equal(batch.attributes.length + 1 + 4, 14, 'still 14 of the portable 16 attribute slots');
  batch.dispose();
});

test('every powered tool is built from stiff hardware AND a working membrane, at no extra cost', () => {
  const field = (kind) => ({
    id: kind, kind, center: { x: 40, z: -25 }, radius: 80,
    dir: { x: 1, z: 0 }, halfAngleRad: 0.45, halfWidth: 30, engaged: false,
  });

  for (const [kind, signature] of Object.entries(FIELD_SIGNATURES)) {
    const owner = new FieldForcePresentation(new THREE.Scene());
    const state = { simTime: 0, fields: { active: [field(kind)] }, settings: { video: {} } };
    owner.update(0, state);
    state.simTime = 0.5;
    owner.update(0.5, state);

    assert.equal(owner.mesh.count, signature.surfaces,
      `${kind}: the material pass costs no extra strip`);

    let rigid = 0;
    let ribbed = 0;
    let cool = 0;
    let hot = 0;
    let minFlex = Infinity;
    let maxFlex = -Infinity;
    for (let i = 0; i < owner.mesh.count; i++) {
      const flex = owner.batch.attributes[7].getW(i);
      const ribs = owner.batch.attributes[8].getZ(i);
      const heat = owner.batch.attributes[8].getW(i);
      assert.ok(Number.isFinite(flex) && flex >= 0 && flex <= 2, `${kind}: flex stays authored`);
      assert.ok(Number.isFinite(ribs) && ribs >= 0 && ribs <= 16, `${kind}: rib count stays authored`);
      assert.ok(Number.isFinite(heat) && heat >= 0 && heat <= 1, `${kind}: heat stays authored`);
      if (flex <= 0.4) rigid++;
      if (ribs >= 1) ribbed++;
      if (heat <= 0.7) cool++;
      if (heat > 0.9) hot++;
      minFlex = Math.min(minFlex, flex);
      maxFlex = Math.max(maxFlex, flex);
    }
    assert.ok(rigid > 0, `${kind}: has rigid structural members`);
    // Seed is all machined hardware and has no membrane, so the contract is stiffness CONTRAST
    // rather than a fixed membrane threshold — a tool whose every strip flexes alike is the
    // uniform jelly this pass exists to stop.
    assert.ok(maxFlex - minFlex >= 0.4,
      `${kind}: hardware and working surface differ in stiffness (${minFlex} .. ${maxFlex})`);
    assert.ok(ribbed > 0, `${kind}: has a machined cross-section somewhere`);
    assert.ok(cool > 0 && hot > 0, `${kind}: separates cool structure from the hot working surface`);

    // The whole point of putting this in retained descriptor floats: steady tools still sleep.
    const before = owner.batch.attributes.map((a) => a.version);
    state.simTime += STEP;
    owner.update(STEP, state);
    assert.deepEqual(owner.batch.attributes.map((a) => a.version), before,
      `${kind}: material channels are authored once, never republished per frame`);

    // Authority ends: boundary strips go immediately, and the body drains to nothing.
    state.fields.active = [];
    owner.update(0, state);
    for (let i = 0; i < owner.mesh.count; i++) {
      assert.notEqual(owner.batch.attributes[7].getY(i), 1, `${kind}: force boundary retired at once`);
    }
    state.simTime += 1.5;
    owner.update(1.5, state);
    assert.equal(owner.mesh.count, 0, `${kind}: mesh count reaches zero after release`);
    owner.dispose();
  }
});
