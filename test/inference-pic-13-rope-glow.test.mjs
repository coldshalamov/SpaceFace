// PIC-13 — the rope glows with the swing energy it is storing, so a loaded whip reads before it snaps.
//
// Seed 4242. The sim already computes and publishes tether.strainGlow (the whipStrainGlow law,
// src/systems/tetherGameplay.js); the Range drill drives a scripted wind-up. This pins the
// transport into the rope material: the ribbon uniform tracks the published value exactly, a
// slack line reads 0, and the shader spends the glow on brightness, never on alpha.
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import {
  createMasslineRibbonMaterial,
  updateEnergyMaterial,
} from '../src/render/energy/energyMaterials.js';
import { resolveMasslineWhipGlow } from '../src/render/masslinePresentation.js';
import { whipStrainGlow } from '../src/systems/tetherGameplay.js';
import {
  createElasticWhipRung,
  tickElasticWhipDrill,
} from '../src/ui/screens/range.js';

const SEED = 4242;
const DT = 1 / 60;

/** The exact frame vfx.js builds for the ribbon: the published value through the one mapper. */
function glowUniformFor(tether, material) {
  updateEnergyMaterial(material, { glow: resolveMasslineWhipGlow(tether) });
  return material.uniforms.uGlow.value;
}

test('a scripted wind-up raises the rope glow uniform in step with whipStrainGlow (seed 4242)', () => {
  const rng = mulberry32(SEED);
  assert.ok(rng() >= 0, 'seed 4242 must drive the fixture rng');
  const sim = createElasticWhipRung({ variant: 'light' });
  assert.ok(sim.tether.allowed, 'the whip line is live on the light variant');
  const material = createMasslineRibbonMaterial();
  try {
    assert.equal(material.uniforms.uGlow.value, 0, 'a fresh rope reads slack');

    let result = tickElasticWhipDrill(sim, DT, { input: { forward: true }, toggleTether: true });
    assert.equal(sim.tether.attachedOnce, true, 'the first tether press must latch the wasp');

    let samples = 0;
    let peakGlow = 0;
    let firstGlow = null;
    for (let tick = 0; tick < 720 && !result.verdict; tick += 1) {
      // The seed bends the wind-up: brief breaths off the throttle make the pull organic
      // while the spring keeps storing on the outward swing.
      const hold = rng() > 0.08;
      result = tickElasticWhipDrill(sim, DT, { input: { forward: hold } });
      if (!sim.tether.active) continue;
      const glow = glowUniformFor(sim.tether, material);
      // The transport is exact: the uniform equals the published value, and the published value
      // is the whipStrainGlow law on the same stretch/rest the drill drives. Any re-derivation,
      // scaling, offset or smoothing added in the presentation breaks this equality.
      assert.equal(glow, sim.tether.strainGlow);
      assert.equal(sim.tether.strainGlow, whipStrainGlow(sim.tether.stretch, sim.tether.restLength));
      samples += 1;
      if (firstGlow === null) firstGlow = glow;
      peakGlow = Math.max(peakGlow, glow);
    }

    console.log(`PIC13_WINDUP SAMPLES=${samples} PEAK_GLOW=${peakGlow.toFixed(3)} VERDICT=${result.verdict && result.verdict.kind}`);
    assert.ok(samples >= 24, `the wind-up must be sampled in motion, got ${samples}`);
    assert.ok(peakGlow >= 0.35, `a working wind-up must light a readable glow, peak ${peakGlow.toFixed(3)}`);
    assert.ok(peakGlow > (firstGlow ?? 0) + 0.2, 'the uniform must rise with the stored swing energy');
    assert.ok(peakGlow <= 1, 'the glow stays inside its 0..1 law');
  } finally {
    material.dispose();
  }
});

test('a slack line reads zero end to end, and the transport fails closed', () => {
  const sim = createElasticWhipRung({ variant: 'light' });
  const material = createMasslineRibbonMaterial();
  try {
    // Nothing is stored: park both bodies motionless at exactly rest length before latching,
    // so the spring sits at equilibrium and stretch is exactly 0.
    sim.player.vx = 0;
    sim.player.vz = 0;
    sim.hostile.vx = 0;
    sim.hostile.vz = 0;
    tickElasticWhipDrill(sim, DT, { input: {}, toggleTether: true });
    assert.equal(sim.tether.active, true, 'the line is latched');
    for (let tick = 0; tick < 12; tick += 1) tickElasticWhipDrill(sim, DT, { input: {} });
    assert.equal(sim.tether.stretch, 0, 'a line inside rest length stores nothing');
    assert.equal(sim.tether.strainGlow, 0, 'the sim publishes 0 for a slack line');
    assert.equal(glowUniformFor(sim.tether, material), 0, 'the rope uniform reads 0 on slack');

    // The transport fails closed on absent, non-finite and out-of-range mirrors.
    assert.equal(resolveMasslineWhipGlow(), 0);
    assert.equal(resolveMasslineWhipGlow(null), 0);
    assert.equal(resolveMasslineWhipGlow({}), 0);
    assert.equal(resolveMasslineWhipGlow({ strainGlow: undefined }), 0);
    assert.equal(resolveMasslineWhipGlow({ strainGlow: Number.NaN }), 0);
    assert.equal(resolveMasslineWhipGlow({ strainGlow: 'hot' }), 0);
    assert.equal(resolveMasslineWhipGlow({ strainGlow: -0.5 }), 0);
    assert.equal(resolveMasslineWhipGlow({ strainGlow: 1.5 }), 1, 'the clamp bounds a runaway publish');
    // A remote line's mirror (state.player.remoteMassline) carries strain/load but never a
    // strainGlow field: it is not the player's whip, and the transport must fail closed rather
    // than derive a glow from the strain/load numbers it does have.
    assert.equal(resolveMasslineWhipGlow({ active: true, strain: 0.9, load: 0.7, phase: 'loaded', restLength: 40 }), 0);

    // updateEnergyMaterial leaves uGlow alone when no glow arrives, and clamps what does.
    updateEnergyMaterial(material, { glow: 0.7 });
    assert.equal(material.uniforms.uGlow.value, 0.7);
    updateEnergyMaterial(material, {});
    assert.equal(material.uniforms.uGlow.value, 0.7, 'a frame without glow keeps the last value');
    updateEnergyMaterial(material, { glow: Number.NaN });
    assert.equal(material.uniforms.uGlow.value, 0.7, 'a non-finite glow never moves the uniform');
    // The release drain: _mirror(state, null, 0) writes strainGlow 0 the same tick the line ends,
    // so a fading rope receives an explicit 0 and must fall — not keep the last loaded value.
    updateEnergyMaterial(material, { glow: 0 });
    assert.equal(material.uniforms.uGlow.value, 0, 'a published 0 drains the fading rope');
    updateEnergyMaterial(material, { glow: 5 });
    assert.equal(material.uniforms.uGlow.value, 1);
    updateEnergyMaterial(material, { glow: -2 });
    assert.equal(material.uniforms.uGlow.value, 0);
  } finally {
    material.dispose();
  }
});

test('the ribbon shader spends the glow on radiance and the filament, never on alpha', () => {
  const material = createMasslineRibbonMaterial();
  try {
    const frag = material.fragmentShader;
    assert.match(frag, /uniform float uGlow/);
    // Radiance: a sustained lift below the uWhip transient, brighter on the core draw.
    assert.match(frag, /uGlow \* \(1\.3 \+ 1\.0 \* \(1\.0 - uSheath\)\)/);
    // Filament: the white drift lives inside the whiteMix clamp.
    assert.match(frag, /waveBand \* 1\.2 \+ uGlow \* 0\.30/);
    // Coverage stays a separate bounded quantity — no glow term may reach the alpha expression.
    assert.doesNotMatch(frag, /float alpha = [^;]+uGlow/);
  } finally {
    material.dispose();
  }
});
