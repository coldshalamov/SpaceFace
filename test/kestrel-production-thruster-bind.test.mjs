import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { validateRecipe } from '../src/render/thruster/recipes/validate.js';
import {
  KESTREL_MAIN_PLUME_RECIPE,
  KESTREL_RCS_RECIPE,
} from '../src/render/thruster/recipes/kestrelRecipes.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { RcsImpulseSystem, assertRcsStructurallyDistinct } from '../src/render/thruster/systems/rcsImpulse.js';
import {
  FLOW_FLIPBOOK_VERTEX,
  FLOW_FLIPBOOK_FRAGMENT,
  computeLayerRadiance,
} from '../src/render/thruster/materials/flowFlipbookMaterial.js';
import { createBus } from '../src/core/eventBus.js';
import { createVfxPrecompileSalvo, vfx } from '../src/render/vfx.js';

const vfxSource = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
const captureSource = readFileSync(new URL('../scripts/capture-thruster-acceptance.mjs', import.meta.url), 'utf8');

test('accepted Kestrel recipes construct the real batched runtime systems', () => {
  assert.equal(validateRecipe(KESTREL_MAIN_PLUME_RECIPE).ok, true);
  assert.equal(validateRecipe(KESTREL_RCS_RECIPE).ok, true);
  assert.equal(assertRcsStructurallyDistinct(KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE).ok, true);

  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  assert.equal(plume.assertLayerBindings().ok, true);
  assert.equal(rcs.assertLayerBindings().ok, true);
  assert.ok(plume.group.children.every((child) => child.isInstancedMesh));
  assert.ok(rcs.group.children.every((child) => child.isInstancedMesh));
  assert.ok(rcs.layerBatches.every((batch) => batch.material.userData.usesSharedAxialEnvelope === true));
  assert.ok(rcs.layerBatches.every((batch) => batch.material.uniforms.uImpulseJet.value === 1));
  assert.ok(rcs.layerBatches.every((batch) => batch.material.userData.impulseJet === true));
  assert.ok(plume.layerBatches.every((batch) => batch.material.uniforms.uCoreWhitenessCap.value
    === KESTREL_MAIN_PLUME_RECIPE.accessibility.reducedFlash.coreWhitenessCap));
  assert.ok(rcs.layerBatches.every((batch) => batch.material.uniforms.uCoreWhitenessCap.value
    === KESTREL_RCS_RECIPE.accessibility.reducedFlash.coreWhitenessCap));
  plume.dispose();
  rcs.dispose();
});

test('recipe validation owns role-specific readability and turbo-structure bounds', () => {
  const badWidth = structuredClone(KESTREL_MAIN_PLUME_RECIPE);
  badWidth.accessibility.reducedMotion.roleWidthScale.core = 0.1;
  const widthResult = validateRecipe(badWidth);
  assert.equal(widthResult.ok, false);
  assert.ok(widthResult.errors.some((issue) => issue.path
    === 'accessibility.reducedMotion.roleWidthScale.core'));

  const badBoost = structuredClone(KESTREL_MAIN_PLUME_RECIPE);
  badBoost.identity.layeringCharacter.boostStructuralDrive = 2;
  const boostResult = validateRecipe(badBoost);
  assert.equal(boostResult.ok, false);
  assert.ok(boostResult.errors.some((issue) => issue.path
    === 'identity.layeringCharacter.boostStructuralDrive'));
});

test('live Kestrel seam suppresses the legacy bead trail and generic boost burst', () => {
  assert.match(vfxSource, /_usesProductionThruster\(e\)/);
  assert.match(vfxSource, /if \(this\._usesProductionThruster\(e\)\) return \{ particles: 0, streaks: 0 \}/);
  assert.match(vfxSource, /if \(this\._usesProductionThruster\(e\)\) return;/,
    'event-driven thrust/boost paths must not layer generic sprites over the production plume');
  assert.match(vfxSource, /new ContinuousPlumeSystem\(/);
  assert.match(vfxSource, /new RcsImpulseSystem\(/);
});

test('live Kestrel plume remains visible when the legacy HDR-energy toggle is off', () => {
  const scene = new THREE.Scene();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 4,
    data: { defId: 'ship_kestrel' },
  };
  const state = {
    playerId: 1,
    player: {},
    entities: new Map([[1, player]]),
    entityList: [player],
    input: { moveZ: 1, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: 'medium',
        engineTrails: true,
        energyMaterials: false,
        motionReduce: false,
        bloom: false,
      },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });

  assert.equal(system._updateEnergy(1 / 60), true,
    'the production exhaust is an engine-trail visual, not an optional Massline/HDR experiment');
  assert.ok(system._energy?.plumeSystem?.group?.visible,
    'normal forward thrust must publish a visible production plume');
  assert.ok(system._energy.plumeSystem.layerBatches.some((batch) => batch.mesh.count > 0),
    'at least one plume layer must reach the live draw list');

  system._disposeEnergy();
});

test('production thruster pose tracks the nozzle every display frame at high speed', () => {
  // Regression: a 30 Hz cadence left the continuous plume one frame behind the hull at high
  // speed, which read as a doubled/flickering thruster. Pose must advance every update().
  assert.doesNotMatch(vfxSource, /VFX_ENERGY_PLUME_HZ/,
    'production plume must not be cadence-gated behind a reduced-Hz constant');
  assert.doesNotMatch(vfxSource, /_cadenceEnergyPlume/,
    'production plume must not use the optional subsystem cadence accumulator');

  const scene = new THREE.Scene();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 255, z: 0 },
    rot: 0,
    radius: 4,
    maxSpeed: 120,
    data: { defId: 'ship_kestrel' },
    flags: {},
  };
  const state = {
    playerId: 1,
    player: {},
    entities: new Map([[1, player]]),
    entityList: [player],
    input: { moveZ: 1, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: 'high',
        engineTrails: true,
        energyMaterials: false,
        motionReduce: false,
        bloom: false,
      },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });

  const dt = 1 / 60;
  const nozzleX = [];
  for (let i = 0; i < 4; i++) {
    player.pos.x = i * 255 * dt;
    assert.equal(system._updateEnergy(dt), true, `frame ${i} must keep the production plume active`);
    const batch = system._energy.plumeSystem.layerBatches.find((entry) => entry.writeCount > 0);
    assert.ok(batch, `frame ${i} must write at least one plume instance`);
    nozzleX.push(batch.offset[0]);
  }

  for (let i = 1; i < nozzleX.length; i++) {
    const step = nozzleX[i] - nozzleX[i - 1];
    assert.ok(step > 255 * dt * 0.85,
      `nozzle pose must advance ~full frame distance at SPD 255 (step=${step.toFixed(3)} on frame ${i})`);
  }

  system._disposeEnergy();
});

test('startup VFX precompile salvo contains the production plume shader family', () => {
  const salvo = createVfxPrecompileSalvo();
  const plumeRoles = [];
  salvo.traverse((object) => {
    if (object.material?.userData?.thrusterMaterial) {
      plumeRoles.push(object.material.userData.layerRole);
    }
  });
  assert.ok(plumeRoles.includes('core') && plumeRoles.includes('vapor'),
    `precompile must warm both the hot core and vapor shader paths; found ${plumeRoles.join(', ')}`);
});

test('reduced flash preserves useful continuous plume radiance with one intensity scale', () => {
  const normal = computeLayerRadiance(1, 1, 1, false);
  const reduced = computeLayerRadiance(1, 0.68, 1, true);
  assert.ok(Math.abs((reduced / normal) - 0.68) < 1e-9,
    'the accessibility recipe scale must be applied once, not squared by the shader');
  assert.ok(reduced >= normal * 0.65,
    'reduced flash must retain constant propulsion feedback while limiting flashes');
  assert.doesNotMatch(FLOW_FLIPBOOK_FRAGMENT, /uIntensity[^;]*mix\(1\.0,\s*0\.55,\s*uReducedFlash\)/,
    'the fragment shader must not reapply the recipe intensity scale');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /uCoreWhitenessCap,\s*uReducedFlash/,
    'reduced flash must continue to cap hot-core whiteness');
});

test('main and RCS reduced-motion flow scales are applied exactly once', () => {
  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  plume.update(1, 1, sockets, { a11y: { reducedMotion: false } });
  const plumeNormal = plume.layerBatches.find((batch) => batch.role === 'inner').material.uniforms.uFlowSpeed.value;
  plume.reset();
  plume.update(1, 1, sockets, { a11y: { reducedMotion: true } });
  const plumeReduced = plume.layerBatches.find((batch) => batch.role === 'inner').material.uniforms.uFlowSpeed.value;
  assert.ok(Math.abs((plumeReduced / plumeNormal) - 0.12) < 1e-6,
    'main flow uses the authored 0.12 reduced-motion scale once');

  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  rcs.update(0.04, { reducedMotion: false });
  const rcsNormal = rcs.layerBatches.find((batch) => batch.role === 'inner').material.uniforms.uFlowSpeed.value;
  rcs.reset();
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  rcs.update(0.04, { reducedMotion: true });
  const rcsReduced = rcs.layerBatches.find((batch) => batch.role === 'inner').material.uniforms.uFlowSpeed.value;
  assert.ok(Math.abs((rcsReduced / rcsNormal) - 0.08) < 1e-6,
    'RCS flow uses the authored 0.08 reduced-motion scale once');
  assert.doesNotMatch(FLOW_FLIPBOOK_FRAGMENT, /mix\(uFlowSpeed,\s*uFlowSpeed\s*\*\s*0\.12/,
    'the fragment shader must not square the CPU accessibility scale');
  plume.dispose();
  rcs.dispose();
});

test('reduced settings preserve a shorter attached main core and directional inner jet', () => {
  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const normal = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const reduced = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  normal.update(1, 1, sockets, { a11y: { reducedMotion: false, reducedFlash: false } });
  reduced.update(1, 1, sockets, { a11y: { reducedMotion: true, reducedFlash: true } });

  const normalSlots = Object.fromEntries(normal.pool.slots.slice(0, normal.pool.activeCount)
    .map((slot) => [slot.layerRole, slot]));
  const reducedSlots = Object.fromEntries(reduced.pool.slots.slice(0, reduced.pool.activeCount)
    .map((slot) => [slot.layerRole, slot]));
  assert.ok(reducedSlots.vapor.length < normalSlots.vapor.length * 0.8,
    'reduced motion must shorten the diffuse tail instead of leaving a static full-length smudge');
  assert.ok(reducedSlots.sheath.width < normalSlots.sheath.width,
    'reduced motion must tighten the outer sheath');
  assert.ok(reducedSlots.core.width > normalSlots.core.width,
    'the attached white-hot core gets a minification-safe width under reduced settings');
  assert.ok(reducedSlots.inner.length > reducedSlots.core.length * 2,
    'the calmer presentation still retains a directional inner jet beyond the compact core');

  const normalCore = normal.layerBatches.find((batch) => batch.role === 'core');
  const normalInner = normal.layerBatches.find((batch) => batch.role === 'inner');
  const reducedCore = reduced.layerBatches.find((batch) => batch.role === 'core');
  const reducedInner = reduced.layerBatches.find((batch) => batch.role === 'inner');
  assert.ok(reducedCore.material.uniforms.uIntensity.value
    >= normalCore.material.uniforms.uIntensity.value * 0.94,
  'continuous core feedback stays close to normal while flash whiteness/event light remain capped');
  assert.ok(reducedInner.material.uniforms.uIntensity.value
    >= normalInner.material.uniforms.uIntensity.value * 0.84,
  'reduced settings cannot erase the directional inner jet');
  assert.ok(reducedCore.material.uniforms.uOpacity.value >= normalCore.material.uniforms.uOpacity.value);
  assert.ok(reducedInner.material.uniforms.uOpacity.value >= normalInner.material.uniforms.uOpacity.value);

  normal.dispose();
  reduced.dispose();
});

test('RCS accessibility keeps one geometric envelope and a minimum readable hot-root shape', () => {
  const normal = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  const reducedFlash = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  const reducedMotion = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  for (const system of [normal, reducedFlash, reducedMotion]) system.fire([0, 0, 0], [0, 0, 1], 1);
  normal.update(0.04, { reducedMotion: false, reducedFlash: false });
  reducedFlash.update(0.04, { reducedMotion: false, reducedFlash: true });
  reducedMotion.update(0.04, { reducedMotion: true, reducedFlash: true });

  const slot = (system, role) => system.pool.slots.slice(0, system.pool.activeSlotCount)
    .find((entry) => entry.layerRole === role);
  assert.equal(reducedFlash.pool._presentation.intensityScale, KESTREL_RCS_RECIPE.accessibility.reducedFlash.intensityScale);
  assert.ok(Math.abs(slot(reducedFlash, 'core').envelope - slot(normal, 'core').envelope) < 1e-6,
    'reduced flash must not damp the impulse twice through its geometric envelope');
  assert.ok(slot(reducedMotion, 'core').width > slot(normal, 'core').width,
    'reduced-motion RCS keeps a wider root-biased core at the gameplay camera');
  assert.ok(slot(reducedMotion, 'vapor').length < slot(normal, 'vapor').length * 0.75,
    'the reduced RCS tail dissipates quickly instead of posing as a miniature main engine');
  assert.ok(slot(reducedMotion, 'core').width >= 1.0 && slot(reducedMotion, 'core').length >= 1.8,
    'RCS core geometry must stay above the minimum readable world-space shape');

  const normalCore = normal.layerBatches.find((batch) => batch.role === 'core');
  const reducedCore = reducedMotion.layerBatches.find((batch) => batch.role === 'core');
  assert.ok(reducedCore.material.uniforms.uIntensity.value
    >= normalCore.material.uniforms.uIntensity.value * 0.89,
  'reduced RCS retains its attached hot root while separately constraining event light and whiteness');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float impulseRoot = uImpulseJet/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /coreRole \* 0\.52 \+ innerRole \* 0\.22/);

  normal.dispose();
  reducedFlash.dispose();
  reducedMotion.dispose();
});

test('turbo changes plume length, axial structure, and shear without using opacity as identity', () => {
  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const cruise = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const turbo = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  cruise.update(1, 1, sockets, { boost: 0, a11y: {} });
  turbo.update(1, 1, sockets, { boost: 1, a11y: {} });
  const slot = (system, role) => system.pool.slots.slice(0, system.pool.activeCount)
    .find((entry) => entry.layerRole === role);
  assert.ok(slot(turbo, 'sheath').length > slot(cruise, 'sheath').length * 1.8);
  assert.ok(slot(turbo, 'vapor').length > slot(cruise, 'vapor').length * 2);
  assert.ok(slot(turbo, 'sheath').throttle > slot(cruise, 'sheath').throttle,
    'turbo contributes a bounded structural drive beyond ordinary throttle');
  const cruiseSheath = cruise.layerBatches.find((batch) => batch.role === 'sheath');
  const turboSheath = turbo.layerBatches.find((batch) => batch.role === 'sheath');
  assert.equal(turboSheath.material.uniforms.uOpacity.value, cruiseSheath.material.uniforms.uOpacity.value,
    'cruise/turbo identity cannot be an opacity swap');
  assert.ok(turboSheath.material.uniforms.uBoostBlend.value > 0.95);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /uBoostBlend \* 2\.4/,
    'turbo changes axial breakup frequency');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float crossFilaments = 0\.56 \+ 0\.44/,
    'outer layers carry attached directional shear filaments');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float axialShear = 0\.68 \+ 0\.32/,
    'outer-layer breakup remains elongated along the flow axis');

  cruise.dispose();
  turbo.dispose();
});

test('outer plume terminates as attached unequal shear tongues rather than soft bulbs', () => {
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float tongueCenter = exp/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float tongueUpper = exp/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float tongueLower = exp/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float rootBridge = \(1\.0 - smoothstep\(0\.12, 0\.38, vAlong\)\) \* sideFall/,
    'all distal notches must remain connected by an analytic nozzle bridge');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float attachedTongues = max\(tongueMask, rootBridge\)/);
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /0\.18 \+ 0\.82 \* attachedTongues/,
    'tongue breakup keeps a nonzero floor and cannot form detached beads');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float sheathWrap = mix\(sideFall, sheathRim, mix\(0\.22, 0\.46, breakupDrive\)\)/,
    'low-throttle sheath must stay center-connected instead of resolving into two rim bulbs');
});

test('oblique core and RCS cards emerge toward the camera while retaining depth occlusion', () => {
  assert.match(FLOW_FLIPBOOK_VERTEX, /dot\(binormalW, cameraPosition - worldNozzle\) < 0\.0/,
    'billboard lift basis must face the camera in both ordinary and fallback branches');
  assert.match(FLOW_FLIPBOOK_VERTEX, /float rootEscape = smoothstep\(0\.035, 0\.2, uv\.x\)/);
  assert.match(FLOW_FLIPBOOK_VERTEX, /coreRoleV \* 0\.035 \+ uImpulseJet \* 0\.13/,
    'the compact core and RCS body receive bounded depth-safe emergence, not broad glow');

  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  rcs.fire([-2, 0, 0], [0, 0, 1], 1);
  rcs.fire([2, 0, 0], [0, 0, -1], 1);
  rcs.update(0.04, { reducedMotion: true, reducedFlash: true });
  const core = rcs.layerBatches.find((batch) => batch.role === 'core');
  assert.equal(core.mesh.count, 2, 'both commanded RCS jets must reach the instanced draw batch');
  assert.equal(core.material.depthTest, true, 'camera emergence cannot disable hull occlusion');
  assert.equal(core.material.depthWrite, false, 'transparent jets must not create a depth shell');
  assert.equal(core.material.uniforms.uImpulseJet.value, 1);
  rcs.dispose();
});

test('layered pressure zones remain structurally separated at the game-facing pool seam', () => {
  const plume = new ContinuousPlumeSystem(null, KESTREL_MAIN_PLUME_RECIPE);
  const result = plume.update(1, 1, [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }], null);
  const byRole = Object.fromEntries(plume.pool.slots.slice(0, result.activeCount).map((slot) => [slot.layerRole, slot]));
  assert.ok(byRole.core.length < byRole.inner.length && byRole.inner.length < byRole.sheath.length);
  assert.ok(byRole.core.width < byRole.inner.width && byRole.inner.width < byRole.sheath.width);
  assert.ok(byRole.vapor.width > byRole.sheath.width,
    'dissipation must own the broadest silhouette rather than collapsing into the inner wisp');
  assert.equal(result.frameAllocations, 0);
});

test('main sheath has attached throttle-responsive breakup and backdrop-safe temperature zones', () => {
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float attachedBreakup = 0\.38 \+ 0\.62/,
    'attached turbulence keeps a non-zero silhouette floor instead of producing beads');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /mix\(0\.42, 0\.94, breakupDrive\)/,
    'sheath breakup depth must change continuously with throttle');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /float localWidth = 1\.0 \+ broadRole \* breakupDrive/,
    'the outer silhouette itself must vary instead of remaining a smooth axial wisp');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /vec3 coreTemp[\s\S]*vec3 innerTemp[\s\S]*vec3 sheathTemp[\s\S]*vec3 vaporTemp/,
    'temperature/value separation must be encoded structurally, not delegated to bloom');
  const core = KESTREL_MAIN_PLUME_RECIPE.layers.find((layer) => layer.role === 'core');
  const inner = KESTREL_MAIN_PLUME_RECIPE.layers.find((layer) => layer.role === 'inner');
  const sheath = KESTREL_MAIN_PLUME_RECIPE.layers.find((layer) => layer.role === 'sheath');
  const vapor = KESTREL_MAIN_PLUME_RECIPE.layers.find((layer) => layer.role === 'vapor');
  assert.ok(core.widthScale < inner.widthScale && inner.widthScale < sheath.widthScale);
  assert.ok(core.intensity > inner.intensity && inner.intensity > sheath.intensity && sheath.intensity > vapor.intensity);
  assert.equal(vapor.blend, 'alpha', 'cool dissipation must retain backdrop contrast without bloom');
});

test('RCS is a root-biased impulse with asymmetric downstream dissipation', () => {
  const byRole = Object.fromEntries(KESTREL_RCS_RECIPE.layers.map((layer) => [layer.role, layer]));
  assert.ok(byRole.core.lengthScale < byRole.inner.lengthScale);
  assert.ok(byRole.inner.lengthScale < byRole.sheath.lengthScale);
  assert.ok(byRole.sheath.lengthScale < byRole.vapor.lengthScale,
    'RCS must progress from a compact hot root into a longer dissipation tail');
  assert.ok(byRole.core.widthScale < byRole.inner.widthScale && byRole.inner.widthScale < byRole.sheath.widthScale);
  assert.ok(KESTREL_RCS_RECIPE.timing.attack <= 0.025 && KESTREL_RCS_RECIPE.timing.sustain <= 0.06,
    'the root impulse must be sharp rather than a soft main-engine hold');
  assert.match(FLOW_FLIPBOOK_FRAGMENT, /centerDrift \+= uImpulseJet \* downstream/,
    'downstream RCS release must bend asymmetrically instead of forming a circular puff');
});

test('normal-route acceptance rejects draw-count-only and legacy-profile false positives', () => {
  assert.match(captureSource, /energyMaterials = false/,
    'capture must exercise the persisted-profile route that previously erased the replacement plume');
  assert.match(captureSource, /measurePlumePixels\(/,
    'capture must inspect rendered pixels, not merely accept an instanced draw count');
  assert.match(captureSource, /projectedPlume\.lengthPx < 35/,
    'capture must reject a technically drawn plume that collapses below game-camera scale');
  assert.match(captureSource, /cyanPixels[^\n]*< 24/,
    'capture must reject an empty/black shader result even when the batch is live');
  assert.match(captureSource, /layerPixelEvidence/,
    'capture must inspect core, inner, sheath, and vapor separately');
  assert.match(captureSource, /trimGameplayVideo/,
    'motion evidence must trim the boot sequence and begin on the live route');
});

test('legacy NPC engine fallback cannot emit moving particle beads', () => {
  const start = vfxSource.indexOf('  _emitEngineTrail(e, throttle, dt) {');
  assert.ok(start >= 0, 'engine fallback source boundary must remain inspectable');
  // Slice only this function — later field/damage systems also call _spawnParticle.
  const after = vfxSource.slice(start);
  const close = after.match(/streaksSpawned = 1;\r?\n\s*return \{ particles: particlesSpawned, streaks: streaksSpawned \};\r?\n\s*\},/);
  assert.ok(close, 'engine fallback end boundary must remain inspectable');
  const fallback = after.slice(0, close.index + close[0].length);
  assert.doesNotMatch(fallback, /_spawnParticle\(/,
    'engine fallback must use attached pooled streak layers, never round moving particles');
  assert.match(fallback, /streaksSpawned = 1/,
    'fallback emits one alternating core-or-sheath layer per cadence to stay bounded');
});
