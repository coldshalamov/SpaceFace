// Plan 19 Drifter Shoals — hard 3D bioluminescent wildlife presentation.
//
// Simulation owns the moving Rapier body. This module only builds a lathed bell, luminous internal
// core, structural ribs, and rooted tentacles around that body. No Sprite, Points, texture card,
// camera-facing geometry, random motion, light allocation, or physics write exists here.

import * as THREE from 'three';

const PALETTES = Object.freeze([
  Object.freeze({ shell: 0x173f49, glow: 0x5df4d5, deep: 0x226f84 }),
  Object.freeze({ shell: 0x25385c, glow: 0x7dc8ff, deep: 0x3650a2 }),
  Object.freeze({ shell: 0x3b315d, glow: 0xc39cff, deep: 0x6849a3 }),
]);

const BELL_PROFILE = Object.freeze([
  Object.freeze([0.05, 0.72]),
  Object.freeze([0.34, 0.68]),
  Object.freeze([0.66, 0.53]),
  Object.freeze([0.90, 0.28]),
  Object.freeze([1.00, 0.05]),
  // The profile stays wide at its final ring: LatheGeometry leaves this underside physically open.
  Object.freeze([0.94, -0.10]),
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bellGeometry() {
  const profile = BELL_PROFILE.map(([radius, y]) => new THREE.Vector2(radius, y));
  const geometry = new THREE.LatheGeometry(profile, 16);
  geometry.computeVertexNormals();
  return geometry;
}

function ribGeometry() {
  const positions = [];
  const meridians = 8;
  for (let ring = 0; ring < meridians; ring++) {
    const angle = ring / meridians * Math.PI * 2;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    for (let index = 0; index < BELL_PROFILE.length - 1; index++) {
      const a = BELL_PROFILE[index];
      const b = BELL_PROFILE[index + 1];
      positions.push(ca * a[0], a[1], sa * a[0], ca * b[0], b[1], sa * b[0]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function tentacleCurve(slot, tendril, count) {
  const lateral = (tendril - (count - 1) * 0.5) / Math.max(1, (count - 1) * 0.5);
  const handed = tendril % 2 === 0 ? 1 : -1;
  const length = 1.85 + (tendril % 3) * 0.24;
  const curl = handed * (0.13 + slot % 3 * 0.025);
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.46, -0.04, lateral * 0.72),
    new THREE.Vector3(-0.88, -0.12, lateral * 0.91 + curl),
    new THREE.Vector3(-1.38, -0.20, lateral * 1.02 - curl * 0.7),
    new THREE.Vector3(-length, -0.27 - Math.abs(lateral) * 0.08, lateral * 1.14 + curl * 0.35),
  ]);
}

export function buildDrifterShoalVisual(entity) {
  const data = entity && entity.data;
  if (!data || data.kind !== 'drifter_wildlife') return null;

  const slot = Math.max(0, Math.trunc(finite(data.drifterSlot)));
  const palette = PALETTES[slot % PALETTES.length];
  const root = new THREE.Group();
  root.name = `DrifterWildlife_${slot}`;
  root.scale.setScalar(Math.max(1, finite(entity.radius, 4.5)));

  const body = new THREE.Group();
  body.name = 'DrifterBellAssembly';
  root.add(body);

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    name: `DrifterShell_${slot}`,
    color: palette.shell,
    emissive: palette.glow,
    emissiveIntensity: 0.82,
    roughness: 0.24,
    metalness: 0,
    transmission: 0.16,
    thickness: 0.34,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(bellGeometry(), shellMaterial);
  shell.name = 'DrifterLathedBell';
  body.add(shell);

  const coreMaterial = new THREE.MeshStandardMaterial({
    name: `DrifterCore_${slot}`,
    color: palette.glow,
    emissive: palette.glow,
    emissiveIntensity: 1.55,
    roughness: 0.3,
    metalness: 0,
    toneMapped: false,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), coreMaterial);
  core.name = 'DrifterBioluminescentCore';
  core.position.y = 0.28;
  core.scale.set(1.0, 0.62, 1.0);
  body.add(core);

  const rimMaterial = new THREE.MeshStandardMaterial({
    name: `DrifterOpenRim_${slot}`,
    color: palette.deep,
    emissive: palette.glow,
    emissiveIntensity: 0.72,
    roughness: 0.38,
    metalness: 0,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.035, 5, 24), rimMaterial);
  rim.name = 'DrifterOpenUndersideRim';
  rim.rotation.x = Math.PI * 0.5;
  rim.position.y = -0.10;
  body.add(rim);

  const ribMaterial = new THREE.LineBasicMaterial({
    name: `DrifterRibs_${slot}`,
    color: palette.glow,
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: false,
    toneMapped: false,
  });
  const ribs = new THREE.LineSegments(ribGeometry(), ribMaterial);
  ribs.name = 'DrifterMeridianRibs';
  ribs.renderOrder = 16;
  body.add(ribs);

  const tentacleMaterial = new THREE.MeshStandardMaterial({
    name: `DrifterTentacles_${slot}`,
    color: palette.deep,
    emissive: palette.glow,
    emissiveIntensity: 0.68,
    roughness: 0.5,
    metalness: 0,
  });
  const tentacles = new THREE.Group();
  tentacles.name = 'DrifterRootedTentacles';
  tentacles.renderOrder = 15;
  const tentacleCount = 7;
  for (let tendril = 0; tendril < tentacleCount; tendril++) {
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(tentacleCurve(slot, tendril, tentacleCount), 12, 0.035, 5, false),
      tentacleMaterial,
    );
    tube.name = `DrifterTentacle_${tendril}`;
    tentacles.add(tube);
  }
  body.add(tentacles);

  const presentation = {
    construction: 'hard_3d_lathed_bell_ribs_and_rooted_tentacles',
    cameraFacing: false,
    meshes: 3 + tentacleCount,
    lineSegments: 1,
    sprites: 0,
    points: 0,
    textureCards: 0,
    lastHitPulse: Math.max(0, Math.trunc(finite(data.drifterHitPulse))),
    reducedMotion: false,
    reducedFlash: false,
  };
  root.userData.drifterShoalPresentation = presentation;
  root.userData.kind = 'drifter_wildlife';

  shell.onBeforeRender = () => {
    const time = finite(data.drifterPresentationTime);
    const reducedMotion = data.drifterMotionReduce === true;
    const reducedFlash = data.drifterFlashReduce === true;
    const phase = slot * 0.73;
    const pulse = reducedMotion ? 0 : Math.sin(time * 2.15 + phase);
    const speed = Math.hypot(finite(entity.vel && entity.vel.x), finite(entity.vel && entity.vel.z));
    const wake = reducedMotion ? 0 : clamp(speed / 90, 0, 1);
    const hitPulse = Math.max(0, Math.trunc(finite(data.drifterHitPulse)));
    const hitActive = time <= finite(data.drifterFlickerUntil, -Infinity);
    const hitFlicker = !hitActive
      ? 0
      : (reducedFlash ? 0.18 : (Math.floor(time * 18) % 2 === 0 ? 0.95 : -0.25));

    body.scale.set(1 - pulse * 0.025, 1 + pulse * 0.055, 1 - pulse * 0.025);
    const velocityAngle = speed > 0.01
      ? Math.atan2(finite(entity.vel && entity.vel.z), finite(entity.vel && entity.vel.x))
      : finite(entity.rot);
    const sweepYaw = finite(entity.rot) - velocityAngle;
    tentacles.rotation.y = sweepYaw + pulse * 0.035 * wake;
    tentacles.rotation.z = pulse * 0.025 * wake;
    core.scale.set(1 + pulse * 0.08, 0.62 - pulse * 0.035, 1 + pulse * 0.08);
    shellMaterial.emissiveIntensity = Math.max(0.28, 0.82 + pulse * 0.16 + hitFlicker);
    coreMaterial.emissiveIntensity = Math.max(0.5, 1.55 + pulse * 0.28 + hitFlicker * 0.75);
    ribMaterial.color.setHex(hitActive && !reducedFlash ? 0xf3ffff : palette.glow);

    presentation.lastHitPulse = hitPulse;
    presentation.reducedMotion = reducedMotion;
    presentation.reducedFlash = reducedFlash;
  };

  return root;
}

export default buildDrifterShoalVisual;
