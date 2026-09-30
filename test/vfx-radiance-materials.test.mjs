import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHIELD_SHELL_GLSL } from '../src/render/weapons/shieldShell.js';
import { EnergyBoltPool } from '../src/render/weapons/energyBoltPool.js';
import { createFlowFlipbookMaterial } from '../src/render/thruster/materials/flowFlipbookMaterial.js';
import { createEnergyMaterial, createPlumeMaterial } from '../src/render/energy/energyMaterials.js';
import { createTransientVfxMaterial } from '../src/render/combat/transientVfxMaterials.js';
import { createBombTelegraphMaterial } from '../src/render/bombPresentation.js';
import { SURFACE_FRAGMENT } from '../src/render/forceLanguage/sweptSurfaceBatch.js';
import { createEmergentPrimitivePools } from '../src/render/forceLanguage/emergentPrimitivePools.js';

// The radiance upgrade lives in shader wiring WebGL can't compile under node. These tests pin the
// public contracts on the real owner objects: the lift stays local (crest/fold/hot terms), alpha
// and lifecycle envelopes are untouched, and reduced flash keeps its existing authority.

test('shield shell lifts core and seam-current RGB only, gated on heat', () => {
  assert.match(SHIELD_SHELL_GLSL, /crestLift = smoothstep\(0\.30, 0\.90, heat\)/);
  assert.match(SHIELD_SHELL_GLSL, /0\.65 \* seam \* panelCharge \+ 1\.35 \* core\) \* \(1\.0 \+ 0\.30 \* crestLift\)/);
  // The pane/alpha path is the accepted construction: no lift may reach it.
  assert.match(SHIELD_SHELL_GLSL, /float alpha = clamp\(limb \+ wall \* 0\.62 \+ ribLight \* 0\.26/);
  assert.doesNotMatch(SHIELD_SHELL_GLSL, /alpha[^;]*crestLift/);
});

test('energy bolt boosts the hot fold, keeps flicker and alpha authored', () => {
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  try {
    assert.match(pool.material.fragmentShader, /body \* vIntensity \* \(1\.0 \+ 0\.25 \* core\)/);
    assert.match(pool.material.fragmentShader, /uBoltFlicker/);
    assert.match(pool.material.fragmentShader, /hot\*\(1\.0-\.65\*channel\)\*1\.9/);
  } finally { pool.dispose(); }
});

test('plume hot crest rides the fold clock only through core/inner roles', () => {
  const material = createFlowFlipbookMaterial(THREE, { role: 'core' });
  try {
    assert.match(material.fragmentShader, /crestRole = clamp\(coreRole \+ innerRole/);
    assert.match(material.fragmentShader, /hotCrest = crestRole \* fold \* \(1\.0 - uReducedFlash\)/);
    assert.match(material.fragmentShader, /\(1\.0 \+ 0\.30 \* hotCrest\)/);
  } finally { material.dispose(); }
});

test('energy and plume materials lift only dense hot folds', () => {
  const energy = createEnergyMaterial();
  const plume = createPlumeMaterial();
  try {
    assert.match(energy.fragmentShader, /1\.0 \+ 0\.30 \* crest/);
    assert.match(plume.fragmentShader, /1\.0 \+ 0\.30 \* crest/);
    assert.match(plume.fragmentShader, /smoothstep\(0\.55, 0\.95, density\) \* smoothstep\(0\.55, 1\.05, heat\)/);
  } finally { energy.dispose(); plume.dispose(); }
});

test('transient impulse ridge and combustion fire carry the local boost; smoke does not', () => {
  const sheet = createTransientVfxMaterial('impulse', 1);
  const combustion = createTransientVfxMaterial('combustion', 1);
  const smoke = createTransientVfxMaterial('smoke', 1);
  try {
    assert.match(sheet.fragmentShader, /\*1\.06\*ridge\*transport/);
    assert.match(combustion.fragmentShader, /vSpriteColor\*3\.5\*pow\(interfaceHeat,1\.35\)/);
    assert.match(combustion.fragmentShader, /\)\*4\.75,peak\*\.72/);
    assert.equal(smoke.fragmentShader, combustion.fragmentShader,
      'smoke and combustion share the volume shader; uCombustion selects the path');
  } finally { sheet.dispose(); combustion.dispose(); smoke.dispose(); }
});

test('bomb telegraph compensates thin channels and keeps its cache identity fresh', () => {
  const material = createBombTelegraphMaterial();
  try {
    assert.equal(material.customProgramCacheKey(), 'bomb-transport-volume-v7');
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
    };
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /min\(3\.0, 1\.0 \/ max\(0\.22, bombDensity\)\) \* 0\.55/);
    assert.match(shader.fragmentShader, /bombWorking \*= 1\.0 \+ 0\.55 \* bombSurge/);
    // vBombSurface.y attenuation stays in the emissive path — reduced flash is not divided out.
    assert.match(shader.fragmentShader, /vBombSurface\.y \* \(0\.025 \+ bombMatter \+ bombWorking \* bombRadiance\)/);
  } finally { material.dispose(); }
});

test('field volume compensates local coverage and travels its own crest pulse', () => {
  assert.match(SURFACE_FRAGMENT, /min\(3\.0,1\.0\/max\(0\.22,absorbed\)\)/);
  assert.match(SURFACE_FRAGMENT, /1\.10\+0\.75\*uFlash\*crestPulse/);
  assert.match(SURFACE_FRAGMENT, /alpha=edge\*tips\*reveal\*vTint\.a\*vFront\*fracture\*absorbed/);
});

test('emergent current and pressure crests lift locally; structure families are untouched', () => {
  const pools = createEmergentPrimitivePools();
  try {
    const current = pools.group.children.find(m => m.material.name === 'emergent-connected-current');
    const pressure = pools.group.children.find(m => m.material.name === 'emergent-pressure-fracture');
    const deposit = pools.group.children.find(m => m.material.name === 'emergent-reactive-deposit');
    assert.ok(current && pressure && deposit);
    assert.match(current.material.fragmentShader, /packets\*4\.9/);
    assert.match(current.material.fragmentShader, /crest\*5\.9/);
    assert.equal(deposit.material.type, 'MeshPhysicalMaterial', 'opaque deposits keep lit shading');
  } finally { pools.dispose(); }
});
