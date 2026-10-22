// Row 492 (FIGHT-READ): the latched body wears the Line's colour on its rim — a flat annulus in
// the cable's neon, so a glance down the rope tells you which body is bound. Opacity and band
// scale breathe with the same presentation load the cable reads (tether.load + strainGlow), so
// the rim thickens as the line strains — one language, two reads.
//
// No sim writes. The plan is pure for headless proof; the matter owns one resident ring mesh.

import * as THREE from 'three';

export const MASSLINE_LATCH_RIM_COLOR = Object.freeze({ r: 0.49, g: 1.0, b: 0.66 });
export const MASSLINE_LATCH_RIM_RADIUS_PAD = 1.16;   // rim sits just off the hull edge
export const MASSLINE_LATCH_RIM_BAND_FRAC = 0.16;    // band thickness as a fraction of radius
const RIM_SEGMENTS = 48;
const RIM_FADE_PER_S = 7;

export function createMasslineLatchRimPlan() {
  return { visible: false, x: 0, z: 0, radius: 0, opacity: 0, bandScale: 1 };
}

/**
 * Pure latch-rim read. `tether` is the presented mirror (player.tether or remoteMassline);
 * `target` the resolved latch body; `load`/`whip` the already-published presentation reads.
 */
export function resolveMasslineLatchRimPlan(tether, target, load = 0, whip = 0, out = {}) {
  const live = !!(tether && tether.active && tether.targetId != null
    && target && target.alive !== false && target.pos
    && Number.isFinite(target.pos.x) && Number.isFinite(target.pos.z));
  if (!live) { out.visible = false; return out; }
  const radius = Math.max(2, Number(target.radius) || 6);
  const l = Math.max(0, Math.min(1, Number(load) || 0));
  const w = Math.max(0, Math.min(1, Number(whip) || 0));
  out.visible = true;
  out.x = target.pos.x;
  out.z = target.pos.z;
  out.radius = radius * MASSLINE_LATCH_RIM_RADIUS_PAD;
  out.opacity = Math.min(1, 0.42 + l * 0.34 + w * 0.24);
  out.bandScale = 1 + l * 0.5 + w * 0.3;
  return out;
}

export function createMasslineLatchRim() {
  // Unit annulus [0.84, 1.0]; mesh scale carries the world radius, bandScale widens the band by
  // shrinking the hole through UV-space scale of the inner edge — approximated by an outer swell
  // plus opacity, which reads as thickening at gameplay zoom.
  const geo = new THREE.RingGeometry(1 - MASSLINE_LATCH_RIM_BAND_FRAC, 1.0, RIM_SEGMENTS);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(MASSLINE_LATCH_RIM_COLOR.r, MASSLINE_LATCH_RIM_COLOR.g, MASSLINE_LATCH_RIM_COLOR.b),
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 1.6;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return { mesh, fade: 0, plan: createMasslineLatchRimPlan() };
}

/**
 * Per-frame write. `plan` is the resolved latch-rim plan; `toLocal` maps world XZ → mesh space;
 * `dt` drives the same gentle fade the swing trace uses so release never pops.
 */
export function updateMasslineLatchRim(rim, plan, dt, toLocal) {
  if (!rim || !rim.mesh) return false;
  if (plan.visible) rim.fade = Math.min(1, rim.fade + dt * RIM_FADE_PER_S);
  else rim.fade = Math.max(0, rim.fade - dt * RIM_FADE_PER_S);
  const m = rim.mesh;
  if (!(rim.fade > 0.001)) {
    if (m.visible) { m.visible = false; m.material.opacity = 0; }
    return false;
  }
  const px = plan.visible ? plan.x : m.userData.lastX || 0;
  const pz = plan.visible ? plan.z : m.userData.lastZ || 0;
  const local = toLocal(px, pz);
  m.userData.lastX = px;
  m.userData.lastZ = pz;
  m.position.x = local.x;
  m.position.z = local.z;
  const swell = plan.visible ? plan.bandScale : 1;
  m.scale.setScalar(Math.max(0.001, (plan.visible ? plan.radius : m.userData.lastR || 1) * swell));
  m.userData.lastR = plan.visible ? plan.radius : (m.userData.lastR || 1);
  m.material.opacity = (plan.visible ? plan.opacity : 0.4) * rim.fade;
  m.visible = true;
  return true;
}
