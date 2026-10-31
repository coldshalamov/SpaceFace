import * as THREE from 'three';
import { massline2Flag } from '../../data/featureFlags.js';

// The blade is the line that cuts. Keep this ratio aligned with tetherGameplay's NPC line cut gate.
export const MONOFILAMENT_BLADE_HEAD = 'monofilament_sweep';
export const MONOFILAMENT_BLADE_TAUT_RATIO = 0.92;

const BLADE_HALF_WIDTH = 0.36;
const BLADE_Y = 1.62;

export function createMonofilamentBlade(scene) {
  if (!scene) return null;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(12), 3);
  const color = new THREE.BufferAttribute(new Float32Array(12), 3);
  position.usage = THREE.DynamicDrawUsage;
  color.usage = THREE.DynamicDrawUsage;
  paintMonofilamentBlade(color.array);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 1, 3, 2]), 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.35, 1.45, 1.55),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sf-monofilament-blade';
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh,
    positions: position.array,
    world: { ax: 0, az: 0, bx: 0, bz: 0, dirX: 1, dirZ: 0, chord: 0, targetRadius: 4 },
    present: false,
  };
}

export function hideMonofilamentBlade(blade) {
  if (!blade) return false;
  blade.present = false;
  if (blade.world) blade.world.chord = 0;
  const mesh = blade.mesh;
  if (!mesh) return false;
  const drawn = mesh.geometry && mesh.geometry.drawRange ? mesh.geometry.drawRange.count : 0;
  if (mesh.visible || drawn !== 0 || (mesh.material && mesh.material.opacity !== 0)) {
    mesh.visible = false;
    if (mesh.material) mesh.material.opacity = 0;
    if (mesh.geometry) mesh.geometry.setDrawRange(0, 0);
  }
  return false;
}

/** Update the blade against live VFX-owned state and explicit presentation callbacks. */
export function updateMonofilamentBlade(
  blade,
  state,
  tether,
  player,
  resolveEntity,
  owner,
  writeEndpoints,
  renderAlpha,
  localize,
  accessibilityPolicy,
) {
  if (!blade) return false;
  if (!tether || tether.active !== true || !player || player.alive === false || !player.pos) {
    return hideMonofilamentBlade(blade);
  }
  if (!monofilamentHeadFitted(state, tether, player)) return hideMonofilamentBlade(blade);
  const target = typeof resolveEntity === 'function' ? resolveEntity.call(owner, tether.targetId) : null;
  if (!target || target.alive === false || !target.pos) return hideMonofilamentBlade(blade);
  const span = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
  if (!monofilamentLineTaut(tether.phase, span, Number(tether.restLength))) {
    return hideMonofilamentBlade(blade);
  }
  const alpha = typeof renderAlpha === 'function' ? renderAlpha.call(owner) : 1;
  if (typeof writeEndpoints !== 'function'
    || !writeEndpoints(player, target, false, blade.world, alpha)) {
    return hideMonofilamentBlade(blade);
  }
  const world = blade.world;
  const px = -world.dirZ * BLADE_HALF_WIDTH;
  const pz = world.dirX * BLADE_HALF_WIDTH;
  const positions = blade.positions;
  positions[0] = world.ax - px; positions[1] = BLADE_Y; positions[2] = world.az - pz;
  positions[3] = world.ax + px; positions[4] = BLADE_Y; positions[5] = world.az + pz;
  positions[6] = world.bx - px; positions[7] = BLADE_Y; positions[8] = world.bz - pz;
  positions[9] = world.bx + px; positions[10] = BLADE_Y; positions[11] = world.bz + pz;
  const scratch = owner._spawnLocalXZ || (owner._spawnLocalXZ = { x: 0, z: 0 });
  for (let vertex = 0; vertex < 4; vertex += 1) {
    const offset = vertex * 3;
    const local = localize.call(owner, positions[offset], positions[offset + 2], scratch);
    positions[offset] = local.x;
    positions[offset + 2] = local.z;
  }
  const mesh = blade.mesh;
  mesh.geometry.setDrawRange(0, 6);
  mesh.geometry.attributes.position.needsUpdate = true;
  const accessibility = accessibilityPolicy(state && state.settings);
  mesh.material.opacity = 0.92 * accessibility.opacityScale;
  mesh.visible = true;
  blade.present = true;
  return true;
}

function monofilamentHeadFitted(state, tether, player) {
  if (!massline2Flag('masslineHeadMonofilamentSweep', state && state.runtime && state.runtime.features)) {
    return false;
  }
  const snapped = tether && tether.headId;
  if (snapped === MONOFILAMENT_BLADE_HEAD) return true;
  if (typeof snapped === 'string' && snapped.length > 0) return false;
  const derived = player && player.data && player.data.derived;
  return !!(derived && derived.masslineHeadId === MONOFILAMENT_BLADE_HEAD);
}

function monofilamentLineTaut(phase, span, rest) {
  if (phase === 'loaded' || phase === 'overload') return true;
  return Number.isFinite(rest) && rest > 0 && Number.isFinite(span)
    && span >= rest * MONOFILAMENT_BLADE_TAUT_RATIO;
}

function paintMonofilamentBlade(colors) {
  for (let i = 0; i < 4; i += 1) {
    const hot = (i & 1) === 1;
    const gain = hot ? 1.55 : 0.7;
    const offset = i * 3;
    colors[offset] = gain * 0.9;
    colors[offset + 1] = gain * 0.98;
    colors[offset + 2] = gain;
  }
}
