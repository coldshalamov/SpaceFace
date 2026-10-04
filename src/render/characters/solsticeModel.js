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

  // 4. Directional Light Beam (+X is forward)
  const beamGroup = group(root, 'beam_emitter');
  beamGroup.userData.animated = true;
  const beamGeo = new THREE.CylinderGeometry(2.0, 32, 160, 24, 1, true);
  beamGeo.rotateZ(-Math.PI / 2);
  beamGeo.translate(80, 0, 0);
  const beamMesh = add(beamGroup, beamGeo, m.beam, 'volumetric_beam_cone');
  beamMesh.userData.animated = true;

  // 5. Supernova Bloom Shockwave Ring
  const shockwaveGeo = new THREE.RingGeometry(1, 16, 36);
  shockwaveGeo.rotateX(-Math.PI / 2);
  const shockwave = add(root, shockwaveGeo, m.shockwave, 'bloom_shockwave');
  shockwave.userData.animated = true;

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

    // Beam aiming and intensity
    const beamAngle = Number.isFinite(pose.beamAngle) ? pose.beamAngle : 0;
    beamGroup.rotation.y = -beamAngle;
    const beamActive = pose.beamActive !== false;
    beamMesh.visible = beamActive;
    if (beamActive) {
      const intensity = Number.isFinite(pose.beamIntensity) ? pose.beamIntensity : 1.0;
      m.beam.opacity = (reduceFlash ? 0.2 : 0.35) * intensity;
      const beamScale = reduceMotion ? 1.0 : (1.0 + Math.sin(t * 4.0) * 0.04);
      beamMesh.scale.set(1, beamScale, beamScale);
    }

    // Supernova bloom shockwave animation
    const progress = Number.isFinite(pose.bloomProgress) ? pose.bloomProgress : 0;
    if (progress > 0 && !reduceMotion) {
      shockwave.visible = true;
      const s = 1.0 + progress * 24.0;
      shockwave.scale.set(s, s, s);
      m.shockwave.opacity = (1.0 - progress) * (reduceFlash ? 0.4 : 0.85);
    } else {
      shockwave.visible = false;
    }
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

  // Harmonic resonance aura
  const auraGeo = new THREE.RingGeometry(5.4, 6.6, 24);
  auraGeo.rotateX(-Math.PI / 2);
  const auraMat = new THREE.MeshBasicMaterial({
    color: index === 1 ? 0x44ff99 : index === 2 ? 0x44bbff : 0xffbb33,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const aura = add(root, auraGeo, auraMat, `resonance_aura_${index}`);
  aura.userData.animated = true;

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
    if (aligned) {
      aura.visible = true;
      auraMat.opacity = reduceFlash ? 0.35 : (0.55 + Math.sin(t * 5.0) * 0.25);
      const s = 1.0 + Math.sin(t * 3.0) * 0.08;
      aura.scale.set(s, s, s);
      prismMat.emissiveIntensity = reduceFlash ? 1.4 : 2.2;
    } else {
      aura.visible = false;
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
