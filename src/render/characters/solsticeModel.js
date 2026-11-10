// src/render/characters/solsticeModel.js — Authored 3D procedural character art for Solstice / SL-9.
// Three.js hard-surface art, astronomical clockwork, gimbal rings, solar reflector petals, and focus prisms.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLSTICE as C } from '../../data/solstice.js';

const TAU = Math.PI * 2;
const sat = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = sat(x); return x * x * (3 - 2 * x); };

function palette() {
  const m = {
    gold: new THREE.MeshPhysicalMaterial({
      color: 0xdfb15b,
      metalness: 0.92,
      roughness: 0.16,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xb08842,
      metalness: 0.84,
      roughness: 0.32,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x151b22,
      metalness: 0.72,
      roughness: 0.38,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x6e7b8b,
      metalness: 0.88,
      roughness: 0.28,
    }),
    coreHeart: new THREE.MeshPhysicalMaterial({
      color: 0xfff0c8,
      emissive: 0xff9c22,
      emissiveIntensity: 1.8,
      roughness: 0.1,
      metalness: 0.15,
      clearcoat: 1.0,
    }),
    beam: new THREE.MeshBasicMaterial({
      color: 0xffe088,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    shockwave: new THREE.MeshBasicMaterial({
      color: 0xffea9f,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    amber: new THREE.MeshPhysicalMaterial({
      color: 0xffaa22,
      emissive: 0xff7700,
      emissiveIntensity: 1.4,
      roughness: 0.14,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
    emerald: new THREE.MeshPhysicalMaterial({
      color: 0x33ee88,
      emissive: 0x00cc55,
      emissiveIntensity: 1.4,
      roughness: 0.14,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
    sapphire: new THREE.MeshPhysicalMaterial({
      color: 0x33aaff,
      emissive: 0x0088ee,
      emissiveIntensity: 1.4,
      roughness: 0.14,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
    wispGold: new THREE.MeshBasicMaterial({
      color: 0xffe277,
    }),
  };
  for (const [k, v] of Object.entries(m)) v.name = `SL9_${k}`;
  return m;
}

function add(parent, g, m, name, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  return o;
}

function group(parent, name, pos = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  parent.add(g);
  return g;
}

function slab(points, depth = 1, bevel = 0.2) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z));
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  }).rotateX(-Math.PI / 2);
}

// Stable per-prism / per-event seeds: an integer-hash over identity, never ambient or
// per-frame random (VFX standard — randomness selects stable character; sim RNG untouched).
function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// The resonance aura's three unequal conformal arcs, merged into ONE geometry so each prism
// keeps a single draw call. Per-vertex aData = (rIn, rOut, thetaStart, thetaLength) gives the
// shader the annulus frame it needs for filtered radial edges and soft arc ends.
function buildAuraArcsGeometry(seed) {
  const arcs = [
    { rIn: 5.4, rOut: 6.05, start: TAU * seed[0], len: TAU * (0.52 + 0.18 * seed[1]) },
    { rIn: 6.12, rOut: 6.6, start: TAU * seed[1], len: TAU * (0.34 + 0.14 * seed[2]) },
    { rIn: 5.7, rOut: 6.42, start: TAU * seed[2], len: TAU * (0.22 + 0.12 * seed[0]) },
  ];
  const parts = [];
  for (const a of arcs) {
    const g = new THREE.RingGeometry(a.rIn, a.rOut, 40, 1, a.start, a.len);
    g.rotateX(-Math.PI / 2);
    const count = g.attributes.position.count;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = a.rIn;
      data[i * 4 + 1] = a.rOut;
      data[i * 4 + 2] = a.start;
      data[i * 4 + 3] = a.len;
    }
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function buildCore(root, m) {
  const coreHub = group(root, 'solstice_core_hub', [0, 0, 0]);
  coreHub.userData.animated = true;

  // 1. Captive Stellar Heart
  const heartGeo = new THREE.IcosahedronGeometry(7, 1);
  add(coreHub, heartGeo, m.coreHeart, 'stellar_heart_crystal');

  const subCore = add(coreHub, new THREE.SphereGeometry(3.8, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), 'inner_stellar_plasma');
  subCore.userData.animated = true;

  // 2. Gimbal System
  const gimbals = group(root, 'solstice_gimbals', [0, 0, 0]);
  gimbals.userData.animated = true;

  // Outer Ring (Brass with astronomical notches)
  const outerRingGroup = group(gimbals, 'outer_gimbal_ring');
  outerRingGroup.userData.animated = true;
  add(outerRingGroup, new THREE.TorusGeometry(18, 0.85, 8, 36), m.brass, 'outer_torus');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const notch = add(outerRingGroup, new THREE.BoxGeometry(0.7, 0.4, 2.4), m.dark, `outer_notch_${i}`, Math.cos(a) * 18, 0, Math.sin(a) * 18);
    notch.rotation.y = -a;
  }

  // Mid Ring (Graphite/Dark with gold balance studs)
  const midRingGroup = group(gimbals, 'mid_gimbal_ring');
  midRingGroup.userData.animated = true;
  add(midRingGroup, new THREE.TorusGeometry(14, 0.65, 8, 32), m.dark, 'mid_torus');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    add(midRingGroup, new THREE.CylinderGeometry(0.4, 0.4, 1.2, 6), m.gold, `mid_stud_${i}`, Math.cos(a) * 14, 0, Math.sin(a) * 14);
  }

  // Inner Gear Ring (Steel with 16 gear teeth)
  const innerRingGroup = group(gimbals, 'inner_gimbal_ring');
  innerRingGroup.userData.animated = true;
  add(innerRingGroup, new THREE.TorusGeometry(10.5, 0.5, 8, 28), m.steel, 'inner_torus');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const tooth = add(innerRingGroup, new THREE.BoxGeometry(0.5, 0.35, 1.4), m.steel, `gear_tooth_${i}`, Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5);
    tooth.rotation.y = -a;
  }

  // 3. Four Articulated Solar Reflector Petals (Spaced at 90 degrees around Y axis)
  const petals = [];
  const petalShape = [
    [-3.2, 0], [-2.4, 6], [-0.5, 12], [0.5, 12], [2.4, 6], [3.2, 0], [1.5, -2], [-1.5, -2],
  ];
  for (let i = 0; i < 4; i++) {
    const petalRoot = group(root, `petal_assembly_${i}`);
    petalRoot.userData.animated = true;
    petalRoot.rotation.y = (i * Math.PI / 2);

    const hinge = group(petalRoot, `petal_hinge_${i}`, [0, 0, 11]);
    hinge.userData.animated = true;

    // Curved mirror blade
    const blade = add(hinge, slab(petalShape, 0.9, 0.2), m.gold, `petal_blade_${i}`, 0, 0, 4);
    blade.rotation.x = Math.PI / 2;

    // Strut & actuator
    add(hinge, new THREE.CylinderGeometry(0.35, 0.35, 5, 6), m.dark, `petal_actuator_${i}`, 0, -1.2, 2);
    petals.push(hinge);
  }

  // 4. Directional Light Beam (+X is forward). Two layers on the persistent-beam recipe
  // (src/render/combat/persistentBeams.js): a normal-blend hot filament core that stays
  // readable against true black, plus one additive sheath carrying advected energy. The
  // donor stays MeshBasicMaterial so the injection contract and blend roles are untouched.
  // Cylinder uv.y is the axial coordinate: three builds uv.y = 1 - v with the narrow
  // radiusTop row at +y (three.core.js generateTorso), and rotateZ(-PI/2) maps +y to +x —
  // so uv.y is 0 at the emitter (x=0) and 1 at the far tip (x=160).
  const beamGroup = group(root, 'beam_emitter');
  beamGroup.userData.animated = true;
  const beamUniforms = {
    time: { value: 0 },     // one shared time base for both layers
    flow: { value: 1.0 },   // travelling-structure rate; 0 freezes it (reduced motion)
    drive: { value: 1.0 },  // pose.beamIntensity as radiance — never as opacity (B17)
  };
  const beamSheathGeo = new THREE.CylinderGeometry(2.0, 32, 160, 24, 1, true);
  beamSheathGeo.rotateZ(-Math.PI / 2);
  beamSheathGeo.translate(80, 0, 0);
  const beamSheathMat = new THREE.MeshBasicMaterial({
    name: 'SL9_beam_sheath',
    color: 0xffe088,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true, // additive is order-independent — one pass, not the r155+ two-pass
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  beamSheathMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSl9Time = beamUniforms.time;
    shader.uniforms.uSl9Flow = beamUniforms.flow;
    shader.uniforms.uSl9Drive = beamUniforms.drive;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSl9Beam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSl9Beam = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSl9Beam;\nuniform float uSl9Time;\nuniform float uSl9Flow;\nuniform float uSl9Drive;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float ax = vSl9Beam.y; // emitter(0) -> far tip(1)
  // Advected energy packets travel outward; helical folds couple the travel to the
  // circumference so the structure rolls as it moves instead of scrolling flat stripes.
  float packets = 0.5 + 0.5 * sin(6.2831853 * (ax * 3.0 - uSl9Time * uSl9Flow) + 2.1);
  float folds = 0.5 + 0.5 * sin(vSl9Beam.x * 12.5664 + ax * 9.0 - uSl9Time * uSl9Flow * 1.7);
  float tipRunout = 1.0 - smoothstep(0.78, 0.97, ax); // energy runs out before the mesh tip
  float muzzle = 1.0 - smoothstep(0.0, 0.12, ax);
  float body = (0.30 + 0.62 * packets) * (0.55 + 0.45 * folds);
  float gate = smoothstep(0.0, 0.06, uSl9Drive);
  diffuseColor.rgb *= (body * (0.75 + 0.85 * uSl9Drive) + muzzle * (0.45 + 0.75 * uSl9Drive)) * gate;
  diffuseColor.a *= tipRunout * 0.5 * gate;
}`);
  };
  beamSheathMat.customProgramCacheKey = () => 'sl9-beam-sheath';
  const beamMesh = add(beamGroup, beamSheathGeo, beamSheathMat, 'volumetric_beam_cone');
  beamMesh.castShadow = beamMesh.receiveShadow = false;
  beamMesh.userData.animated = true;

  const beamCoreGeo = new THREE.CylinderGeometry(0.7, 11, 160, 12, 1, true);
  beamCoreGeo.rotateZ(-Math.PI / 2);
  beamCoreGeo.translate(80, 0, 0);
  const beamCoreMat = new THREE.MeshBasicMaterial({
    name: 'SL9_beam_core',
    color: 0xfff2c4,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    // A sustained connection needs a stable energy filament even against true black space.
    // Normal blending supplies that readable structural core; only the sheath is additive.
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  beamCoreMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSl9Time = beamUniforms.time;
    shader.uniforms.uSl9Flow = beamUniforms.flow;
    shader.uniforms.uSl9Drive = beamUniforms.drive;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSl9Beam;\nvarying vec3 vSl9Nrm;\nvarying vec3 vSl9View;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSl9Beam = uv;
vSl9Nrm = normalize(normalMatrix * normal);
vec3 sl9Mv = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
vSl9View = -sl9Mv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSl9Beam;\nvarying vec3 vSl9Nrm;\nvarying vec3 vSl9View;\nuniform float uSl9Time;\nuniform float uSl9Flow;\nuniform float uSl9Drive;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float ax = vSl9Beam.y;
  // View-dependent filament: bright where the tube faces the camera, soft at the
  // silhouette, so the projected width reads as a rounded hot strand (M2).
  float facing = abs(dot(normalize(vSl9Nrm), normalize(vSl9View)));
  float filament = pow(facing, 2.6);
  float packets = 0.5 + 0.5 * sin(6.2831853 * (ax * 4.0 - uSl9Time * uSl9Flow * 1.35) + 4.7);
  float tipRunout = 1.0 - smoothstep(0.80, 0.985, ax);
  float muzzle = 1.0 - smoothstep(0.0, 0.10, ax);
  float hot = 0.55 + 0.45 * packets;
  float gate = smoothstep(0.0, 0.06, uSl9Drive);
  // HDR headroom: the filament peaks near 3x tint at full drive — that narrow bright
  // structure is what the bloom extractor (luma knee 1.0) is meant to lift.
  diffuseColor.rgb *= hot * (0.6 + 2.4 * uSl9Drive) * gate;
  diffuseColor.a *= (filament * (0.55 + 0.45 * hot) + muzzle * 0.35) * tipRunout * gate;
}`);
  };
  beamCoreMat.customProgramCacheKey = () => 'sl9-beam-core';
  const beamCore = add(beamGroup, beamCoreGeo, beamCoreMat, 'beam_filament_core');
  beamCore.castShadow = beamCore.receiveShadow = false;
  beamCore.userData.animated = true;
  beamMesh.renderOrder = 1;
  beamCore.renderOrder = 2;

  // 5. Supernova Bloom Shockwave. Still ONE mesh on the same (1,16) annulus and scale driver;
  // the shader advances an oriented arc front with pose.bloomProgress. Reach is unequal:
  // fixed harmonic lobes plus a leading bias toward the beam heading captured ONCE at onset
  // (rising edge of progress), never re-seeded per frame. The strip holds headroom for the
  // lobe displacement (front is clamped inside [0.05, 0.94] of the annulus).
  const shockwaveGeo = new THREE.RingGeometry(1, 16, 64);
  shockwaveGeo.rotateX(-Math.PI / 2);
  const shockwaveUniforms = {
    progress: { value: 0 },
    seed: { value: 0 },
    heading: { value: 0 },
    flash: { value: 1.0 },
  };
  const shockwaveMat = new THREE.MeshBasicMaterial({
    name: 'SL9_shockwave_front',
    color: 0xffea9f,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  shockwaveMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSl9Progress = shockwaveUniforms.progress;
    shader.uniforms.uSl9Seed = shockwaveUniforms.seed;
    shader.uniforms.uSl9Heading = shockwaveUniforms.heading;
    shader.uniforms.uSl9Flash = shockwaveUniforms.flash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSl9Pos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSl9Pos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSl9Pos;\nuniform float uSl9Progress;\nuniform float uSl9Seed;\nuniform float uSl9Heading;\nuniform float uSl9Flash;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // n spans the annulus built above: RingGeometry(1, 16) -> n = (r - 1) / 15 in [0, 1].
  float n = (length(vSl9Pos.xz) - 1.0) / 15.0;
  float th = atan(vSl9Pos.z, vSl9Pos.x);
  // Unequal reach: low-order lobes seeded from the onset heading, biased toward it.
  float lobes = 1.0 + 0.16 * sin(2.0 * th + uSl9Seed) + 0.11 * sin(3.0 * th - uSl9Seed * 1.7)
    + 0.06 * sin(5.0 * th + uSl9Seed * 2.3);
  float bias = 0.10 * (0.5 + 0.5 * cos(th - uSl9Heading));
  float frontN = clamp((0.34 + 0.60 * uSl9Progress) * lobes + bias, 0.05, 0.94);
  // Sharp filtered leading edge with a decaying wake behind — the band reaches ~zero well
  // before the annulus's inner boundary (no filled annulus, no mesh-boundary cut).
  float d = n - frontN;
  float aa = max(0.015, fwidth(d));
  float wake = (1.0 - smoothstep(0.0, aa, d)) * exp(min(d, 0.0) * 9.0);
  // Inner runout: the wake dies before the annulus hole instead of clipping at it.
  wake *= smoothstep(0.0, 0.10 + aa, n);
  float band = wake * (0.35 + 0.65 * wake);
  // Release: the front cools as it travels; radiance reaches 0 before the event ends.
  float env = pow(max(1.0 - uSl9Progress, 0.0), 1.4);
  diffuseColor.rgb *= band * (0.35 + 2.45 * env) * env * uSl9Flash;
}`);
  };
  shockwaveMat.customProgramCacheKey = () => 'sl9-shockwave-front';
  const shockwave = add(root, shockwaveGeo, shockwaveMat, 'bloom_shockwave');
  shockwave.castShadow = shockwave.receiveShadow = false;
  shockwave.userData.animated = true;

  let prevBloomProgress = 0;
  return (e, t, a11y) => {
    const pose = e.data?.solsticePose || {};
    const reduceMotion = !!a11y?.reducedMotion;
    const reduceFlash = !!a11y?.reducedFlash;

    // Breathing pulse for central heart
    const pulse = reduceMotion ? 1.0 : (1.0 + Math.sin(t * 2.5) * 0.12);
    coreHub.scale.set(pulse, pulse, pulse);
    m.coreHeart.emissiveIntensity = reduceFlash ? 1.0 : (1.4 + Math.sin(t * 3.2) * 0.4);

    // Gimbal rotations
    if (!reduceMotion) {
      outerRingGroup.rotation.y = t * 0.22;
      midRingGroup.rotation.x = t * 0.35;
      midRingGroup.rotation.z = Math.sin(t * 0.18) * 0.5;
      innerRingGroup.rotation.y = -t * 0.65;
    }

    // Petal unfolding / folding:
    // If folded (damaged), angle swings inwards tight. If awake/resonance, blossoms outward.
    const foldState = pose.folded ? 1 : 0;
    const baseOpenAngle = (pose.bloomed ? 0.85 : 0.5) * (1 - foldState) + (foldState * -0.6);
    for (let i = 0; i < 4; i++) {
      const flutter = reduceMotion ? 0 : Math.sin(t * 1.5 + i * 0.8) * 0.05;
      petals[i].rotation.x = baseOpenAngle + flutter;
    }

    // Beam aiming and intensity — radiance drive, never opacity (B17)
    const beamAngle = Number.isFinite(pose.beamAngle) ? pose.beamAngle : 0;
    beamGroup.rotation.y = -beamAngle;
    const beamActive = pose.beamActive !== false;
    beamMesh.visible = beamCore.visible = beamActive;
    if (beamActive) {
      const intensity = Number.isFinite(pose.beamIntensity) ? pose.beamIntensity : 1.0;
      beamUniforms.drive.value = intensity * (reduceFlash ? 0.45 : 1.0);
      beamUniforms.flow.value = reduceMotion ? 0.0 : 1.0;
      beamUniforms.time.value = t;
      const beamScale = reduceMotion ? 1.0 : (1.0 + Math.sin(t * 4.0) * 0.04);
      beamGroup.scale.set(1, beamScale, beamScale);
    }

    // Supernova bloom shockwave — heading and lobes captured once at onset. Hidden again
    // once the front has cooled (progress ~1) so a finished event pays no fragment work.
    const progress = Number.isFinite(pose.bloomProgress) ? pose.bloomProgress : 0;
    if (progress > 0 && progress < 0.995 && !reduceMotion) {
      if (prevBloomProgress <= 0) {
        shockwaveUniforms.heading.value = beamAngle;
        shockwaveUniforms.seed.value = hash01(beamAngle * 91.7) * TAU;
      }
      shockwave.visible = true;
      shockwaveUniforms.progress.value = progress;
      shockwaveUniforms.flash.value = reduceFlash ? 0.42 : 1.0;
      const s = 1.0 + progress * 24.0;
      shockwave.scale.set(s, s, s);
    } else {
      shockwave.visible = false;
    }
    prevBloomProgress = progress;
  };
}

function buildPrism(root, m, index) {
  const prismMat = index === 1 ? m.emerald : index === 2 ? m.sapphire : m.amber;

  const crystalGroup = group(root, `prism_crystal_group_${index}`);
  crystalGroup.userData.animated = true;

  // Faceted Octahedral Crystal
  const octGeo = new THREE.OctahedronGeometry(4.4, 0);
  add(crystalGroup, octGeo, prismMat, `oct_crystal_${index}`);

  // Outer Gimbal Cages
  const cageGroup = group(crystalGroup, `cage_group_${index}`);
  cageGroup.userData.animated = true;

  add(cageGroup, new THREE.TorusGeometry(5.2, 0.25, 6, 24), m.brass, `cage_ring_x_${index}`);
  const ringY = add(cageGroup, new THREE.TorusGeometry(5.2, 0.25, 6, 24), m.brass, `cage_ring_y_${index}`);
  ringY.rotation.x = Math.PI / 2;
  const ringZ = add(cageGroup, new THREE.TorusGeometry(5.2, 0.25, 6, 24), m.brass, `cage_ring_z_${index}`);
  ringZ.rotation.y = Math.PI / 2;

  // Harmonic resonance aura: three unequal conformal arcs share the prism's equator in ONE
  // merged geometry + material (one draw call, same footprint as the old flat ring). The
  // fragment shades filtered radial rims with unequal angular sectors and a travelling
  // shimmer; the aligned state only eases the uOp envelope — opacity is never the animation
  // channel (B17). Rim crests carry ~2-3x tint so the bloom extractor has headroom (M2).
  const auraSeed = [hash01(index * 7 + 1), hash01(index * 7 + 2), hash01(index * 7 + 3)];
  const auraGeo = buildAuraArcsGeometry(auraSeed);
  const auraUniforms = {
    op: { value: 0 },
    time: { value: 0 },
    flow: { value: 0 },
    peak: { value: 1.0 },
    seed: { value: new THREE.Vector3(auraSeed[0] * TAU, auraSeed[1] * TAU, auraSeed[2] * TAU) },
  };
  const auraMat = new THREE.MeshBasicMaterial({
    name: `SL9_resonance_aura_${index}`,
    color: index === 1 ? 0x44ff99 : index === 2 ? 0x44bbff : 0xffbb33,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  auraMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSl9Op = auraUniforms.op;
    shader.uniforms.uSl9Time = auraUniforms.time;
    shader.uniforms.uSl9Flow = auraUniforms.flow;
    shader.uniforms.uSl9Peak = auraUniforms.peak;
    shader.uniforms.uSl9Seed = auraUniforms.seed;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSl9Pos;\nvarying vec4 vSl9Data;\nvarying vec3 vSl9Nrm;\nvarying vec3 vSl9View;\nattribute vec4 aData;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSl9Pos = position;
vSl9Data = aData;
vSl9Nrm = normalize(normalMatrix * normal);
vec3 sl9Mv = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
vSl9View = -sl9Mv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSl9Pos;\nvarying vec4 vSl9Data;\nvarying vec3 vSl9Nrm;\nvarying vec3 vSl9View;\nuniform float uSl9Op;\nuniform float uSl9Time;\nuniform float uSl9Flow;\nuniform float uSl9Peak;\nuniform vec3 uSl9Seed;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float rIn = vSl9Data.x;
  float rOut = vSl9Data.y;
  float a0 = vSl9Data.z;
  float aLen = vSl9Data.w;
  float r = length(vSl9Pos.xz);
  float rn = clamp((r - rIn) / (rOut - rIn), 0.0, 1.0);
  float aa = max(0.05, fwidth(rn) * 1.4);
  // Radial cross-section: a faint shoulder plus one thin filtered hot rim near the outer
  // edge. The shoulder rises from zero at the inner boundary (no hard edge at the hole).
  float shoulder = smoothstep(0.0, 0.22 + aa, rn) * (1.0 - smoothstep(0.40, 0.78, rn));
  float rim = smoothstep(0.76 - aa, 0.84 + aa, rn) * (1.0 - smoothstep(0.94 - aa, 1.0, rn));
  // Arc position with soft ends — energy runs out before the mesh boundary.
  float ph = atan(-vSl9Pos.z, vSl9Pos.x);
  float u = mod(ph - a0, 6.2831853) / aLen;
  float uaa = max(0.04, fwidth(u) * 2.0);
  float ends = smoothstep(0.0, 0.10 + uaa, u) * (1.0 - smoothstep(0.90 - uaa, 1.0, u));
  // Unequal fixed sectors (stable per-prism seed); the shimmer travels along the arc with
  // signed uFlow chirality and freezes to static structure under reduced motion.
  float sector = 0.62 + 0.26 * sin(2.0 * ph + uSl9Seed.x) + 0.16 * sin(3.0 * ph - uSl9Seed.y);
  float travel = 0.5 + 0.5 * sin(6.2831853 * (u * 2.0 - uSl9Time * uSl9Flow) + uSl9Seed.z);
  float crest = rim * sector * (0.55 + 0.85 * travel);
  // M2 view response: the equatorial sheet gains radiance toward grazing incidence.
  float grazing = pow(1.0 - abs(dot(normalize(vSl9Nrm), normalize(vSl9View))), 1.5);
  // The aligned envelope rides radiance (heat), never alpha; coverage stays structural.
  float structure = (0.42 * shoulder + rim * (0.75 + 0.45 * grazing) + uSl9Peak * crest) * uSl9Op;
  diffuseColor.rgb *= structure;
  diffuseColor.a *= ends * clamp(shoulder * 0.5 + rim, 0.0, 1.0);
}`);
  };
  // Identical GLSL across prisms (seeds are uniforms), so all three share one program.
  auraMat.customProgramCacheKey = () => 'sl9-resonance-aura';
  const aura = add(root, auraGeo, auraMat, `resonance_aura_${index}`);
  aura.castShadow = aura.receiveShadow = false;
  aura.userData.animated = true;

  let lastAuraT = -1;
  return (e, t, a11y) => {
    const pose = e.data?.solsticePose || {};
    const reduceMotion = !!a11y?.reducedMotion;
    const reduceFlash = !!a11y?.reducedFlash;

    if (!reduceMotion) {
      crystalGroup.rotation.y = t * 0.6 + index;
      crystalGroup.rotation.x = Math.sin(t * 0.4 + index) * 0.3;
      cageGroup.rotation.z = -t * 0.4;
    }

    const aligned = pose.aligned === true;
    // Envelope only: the aura eases in fast and out slow on the aligned state (E3 attack /
    // release); every animation lives in the shader's travelling term, never in opacity.
    const dt = lastAuraT < 0 ? (1 / 60) : Math.min(Math.max(t - lastAuraT, 0), 0.1);
    lastAuraT = t;
    const envelopeTarget = aligned ? 1 : 0;
    const envelopeK = 1 - Math.exp(-dt * (aligned ? 9 : 3.5));
    auraUniforms.op.value += (envelopeTarget - auraUniforms.op.value) * envelopeK;
    auraUniforms.time.value = t;
    auraUniforms.flow.value = reduceMotion ? 0 : (auraSeed[1] > 0.5 ? 1 : -1) * (0.55 + 0.3 * auraSeed[2]);
    auraUniforms.peak.value = reduceFlash ? 0.3 : 1.0;
    aura.visible = auraUniforms.op.value > 0.012;
    if (aligned) {
      if (!reduceMotion) {
        const s = 1.0 + Math.sin(t * 3.0) * 0.08;
        aura.scale.set(s, s, s);
      }
      prismMat.emissiveIntensity = reduceFlash ? 1.4 : 2.2;
    } else {
      prismMat.emissiveIntensity = 1.2;
    }
  };
}

function buildWisp(root, m) {
  const wispCenter = group(root, 'wisp_center');
  wispCenter.userData.animated = true;

  // Luminous Spark Core
  add(wispCenter, new THREE.SphereGeometry(2.4, 14, 10), m.wispGold, 'wisp_spark_core');

  // Miniature Fluttering Copper Wings
  const wingShape = [[-0.8, 0], [-0.5, 3.2], [0.8, 4.5], [1.8, 2.5], [1.2, 0]];
  const wingL = group(wispCenter, 'wisp_wing_left', [-2.2, 0, 0]);
  wingL.userData.animated = true;
  add(wingL, slab(wingShape, 0.2, 0.06), m.brass, 'wing_plate_l');

  const wingR = group(wispCenter, 'wisp_wing_right', [2.2, 0, 0]);
  wingR.userData.animated = true;
  const rightBlade = add(wingR, slab(wingShape, 0.2, 0.06), m.brass, 'wing_plate_r');
  rightBlade.scale.x = -1;

  // Small soft forward light cone
  const coneGeo = new THREE.CylinderGeometry(0.8, 8, 30, 16, 1, true);
  coneGeo.rotateZ(-Math.PI / 2);
  coneGeo.translate(15, 0, 0);
  add(wispCenter, coneGeo, m.beam, 'wisp_headlight');

  return (e, t, a11y) => {
    const reduceMotion = !!a11y?.reducedMotion;
    const flutter = reduceMotion ? 0 : Math.sin(t * 12.0) * 0.45;
    wingL.rotation.z = 0.2 + flutter;
    wingR.rotation.z = -0.2 - flutter;

    const bob = reduceMotion ? 0 : Math.sin(t * 3.5) * 0.4;
    wispCenter.position.y = bob;
  };
}

export function buildSolsticeVisual(entity) {
  const part = entity?.data?.solsticePart || 'core';
  const index = entity?.data?.solsticeIndex || 0;

  const root = new THREE.Group();
  root.name = `SL9_${part}`;
  const m = palette();

  let update = null;
  if (part === 'core') {
    update = buildCore(root, m);
  } else if (part === 'prism') {
    update = buildPrism(root, m, index);
  } else if (part === 'wisp') {
    update = buildWisp(root, m);
  } else {
    throw new Error(`Unknown SOLSTICE part: ${part}`);
  }

  // Garbage collect unused materials
  const used = new Set();
  root.traverse(o => { if (o.material) used.add(o.material); });
  for (const mat of Object.values(m)) {
    if (!used.has(mat)) mat.dispose();
  }

  root.userData.kind = entity.type;
  root.userData.solstice = true;
  root.userData.animated = true;
  root.userData.visualLanguage = 'solstice-celestial-astrolabe';
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredVisualRoot = 'authored-root';

  root.userData.updateAuthoredMotion = (e, time, a11y = {}) => {
    const t = Number.isFinite(e.data?.solsticePose?.simTime)
      ? e.data.solsticePose.simTime
      : Number.isFinite(time) ? time : 0;
    update(e, t, a11y);
  };

  root.userData.disposeSolstice = () => disposeSolsticeVisual(root);
  root.userData.updateAuthoredMotion(entity, entity.data?.solsticePose?.simTime || 0, {});

  return root;
}

export function disposeSolsticeVisual(root) {
  if (!root || root.userData.solsticeDisposed) return;
  root.userData.solsticeDisposed = true;
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) {
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(mat);
      }
    }
  });
  for (const g of geometries) g.dispose();
  for (const mat of materials) mat.dispose();
  root.removeFromParent();
}
