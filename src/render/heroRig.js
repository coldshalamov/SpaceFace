// DUST P3b — the hero at camera. The sector rig lights the world, but the player hull still
// read flat against the void at gameplay distance: on default flight captures the hull's dark
// side sat at the SAME luminance as the dead sky floor (min 11/255 both), so the silhouette
// had no edge to separate it from space. One real SpotLight rakes the hull's top faces from
// beyond the ship — the side away from the chase camera, which never yaws — in the Look's
// opposing edge hue (cool cyan against the warm sun key), so the hero reads at any zoom
// without lifting the world's authored darkness around it.
//
// Census note (2026-11-01 look-gate follow-up, "rim absent in some sectors"): investigated —
// there is NO per-sector light-budget gate on this rig. It mounts with the sector rig before
// shader warm-up, is never unmounted or hidden, and switches by intensity only, so the baked
// light census includes its slot in every sector (the precompile point-light budget only tops
// UP point-light stand-ins and never removes lights; Nocturne owns its own pool). The frames
// that read "no rim" were loading/dead frames (the rig requires state.mode === 'flight') plus
// plain under-calibration: at 1350 cd the rake delivered ~0.37 irradiance at the hull against
// sector keys of 2.4-3.4 — under perceptual threshold in the bright sectors. The fix is
// calibration, not gating: 2400 cd keeps ~0.66 at the hull center (under a quarter of even the
// brightest sector key, so worlds stay broody) while the edge clears threshold everywhere.
//
// Discipline copied from the headlight pool (src/render/headlights.js, owner 2026-10-20):
// light is a THREE light, never a posing mesh; the rig is mounted with the sector rig before
// shader warm-up and stays mounted for the renderer's lifetime; it switches by intensity,
// never by .visible or unmounting, because three bakes the light count into every program.
//
// The pilot lamp (2026-11-01 gate follow-up) is the at-rest half of P3b's "idle thruster
// life": the whole production jet pipeline is activity-gated and sleeps at rest
// (VP-220 idle-sleep invariant, pinned by test/vp220-p1-fleet-idle-segments.test.mjs), so no
// throttle floor can show at rest — the subsystem that would draw it is hidden. The lamp is
// the ship's engine ember instead: one tiny additive sprite at the stern socket, posed with
// the same inputs the rake already consumes each presented frame, static (reduced-motion safe),
// never a light and never census-visible. In flight it always burns; a live jet is orders
// brighter and additive, so the ember is invisible under thrust and owns the nozzle only at
// rest. Facing law copied from flightOverheadPresentation's bell light: root yaw is minus the
// heading, local +X is forward, aft is (-cos yaw, +sin yaw) / bare heading (-cos, -sin).
//
// Values: these are presentation constants for the player-hero treatment. They belong to the
// Look's constant family; graduation into src/data/lookMoods.js is a follow-up for that file's
// owner (DUST P3 edits are scoped to src/render).

import * as THREE from 'three';
import { noteShadowCensusLightMutation } from './shadowDepthAdmission.js';

const HERO_RIM = Object.freeze({
  colorHex: 0x8fd8ff,   // electric-cyan edge hue — the opponent of the warm sun key
  intensity: 2400,      // calibrated like LOOK_HEADLIGHT: ~0.66 irradiance at the hull center
  distance: 260,        // WU hard cutoff; the rake is a hull treatment, not a searchlight
  angle: 1.02,          // wide half-angle cone
  penumbra: 1.0,        // fully soft: a rake, never a disc
  decay: 2.0,           // physical inverse-square, shared by every local light
  offsetY: 34,          // above the hull, on the far side from the camera — low enough to rake
  offsetZ: 46,          // the chase camera sits at -Z behind the ship; the rake comes from +Z
  offsetX: 14,          // slight lateral bias so the rim is asymmetric, not a halo
  aimZ: -10,            // cone axis lands just past the hull toward the camera
  fadeSeconds: 0.4,     // fade with the presented hull, never pop
});

const HERO_PILOT = Object.freeze({
  colorHex: 0x9fd8ff,   // the ion family's nozzle ember hue
  aftFactor: 0.82,      // stern distance as a fraction of entity radius (bell-light law)
  deckY: 1.25,          // just above the hull deck at the nozzle lip
  sizeFactor: 0.5,      // ember diameter as a fraction of entity radius
  opacity: 0.85,
});

// 32x32 radial ember, generated once — no asset fetch, headless-safe (DataTexture, not canvas).
function makePilotLampTexture() {
  const S = 32;
  const data = new Uint8Array(S * S * 4);
  const c = (S - 1) * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r2 = dx * dx + dy * dy;
      const a = r2 >= 1 ? 0 : Math.max(0, Math.exp(-r2 * 5.2) - 0.02);
      const i = (y * S + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

const _local = { x: 0, z: 0 };
const _forward = new THREE.Vector3();

export class HeroRig {
  constructor(scene, { look = HERO_RIM, pilot = HERO_PILOT } = {}) {
    this.look = look;
    this.pilot = pilot;
    this.group = new THREE.Group();
    this.group.name = 'SF_HeroRig';
    this.light = new THREE.SpotLight(look.colorHex, 0, look.distance, look.angle, look.penumbra, look.decay);
    this.light.name = 'SF_HeroRim';
    this.light.castShadow = false;
    this.light.visible = true;
    this.group.add(this.light);
    this.group.add(this.light.target);
    // The at-rest engine ember. Not a light: census-invisible by construction.
    this._pilotTexture = makePilotLampTexture();
    this.pilotLamp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._pilotTexture,
      color: pilot.colorHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: pilot.opacity,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: true,
    }));
    this.pilotLamp.name = 'SF_HeroPilot';
    this.pilotLamp.visible = true;
    this.pilotLamp.renderOrder = 2;
    this.pilotLamp.scale.setScalar(3);
    this.pilotLamp.material.opacity = 0; // dark until the first presented flight frame
    this.group.add(this.pilotLamp);
    this._level = 0;
    this.scene = null;
    if (scene) {
      scene.add(this.group);
      this.scene = scene;
      noteShadowCensusLightMutation();
    }
  }

  /**
   * Pose and fade the rim for this frame. Same inputs as HeadlightPool.update: the membrane
   * converts galactic poses to frame-local XZ, and `meshes` (entity id -> presented root)
   * lets the rake ride the drawn, interpolated hull rather than the raw sim pose.
   */
  update(state, dt, membrane, meshes) {
    if (!state || !membrane || typeof membrane.toLocal !== 'function') return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const look = this.look;
    const player = state.playerId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    const lit = !!(player && player.alive !== false && player.pos
      && state.mode === 'flight');
    const rate = look.fadeSeconds > 0 ? step / look.fadeSeconds : 1;
    this._level = lit ? Math.min(1, this._level + rate) : Math.max(0, this._level - rate);
    if (this._level <= 0) {
      this.light.intensity = 0;
      this.pilotLamp.material.opacity = 0;
      return;
    }
    if (!player || !player.pos) {
      // Keep the last pose while fading out after the player entity is removed.
      const eased = this._level * this._level * (3 - 2 * this._level);
      this.light.intensity = look.intensity * eased;
      this.pilotLamp.material.opacity = this.pilot.opacity * eased;
      return;
    }
    let x;
    let z;
    const root = meshes ? meshes.get(player.id) : null;
    if (root && root.parent && root.visible !== false) {
      x = root.position.x;
      z = root.position.z;
    } else {
      membrane.toLocal(player.pos, _local);
      x = _local.x;
      z = _local.z;
    }
    // The rake comes from beyond the hull relative to the camera (which never yaws), so the
    // treatment survives the top-down angle: grazing light on the top faces and the far edge
    // of the silhouette, which is exactly the edge that was disappearing into the void.
    this.light.position.set(x + look.offsetX, look.offsetY, z + look.offsetZ);
    this.light.target.position.set(x, 0, z + look.aimZ);
    this.light.target.updateMatrixWorld();
    const eased = this._level * this._level * (3 - 2 * this._level);
    this.light.intensity = look.intensity * eased;
    // The engine ember rides the SAME eased presence at the stern socket — the hull's at-rest
    // signature. Root yaw (drawn, interpolated) when the presented root exists; the bare sim
    // heading law otherwise. Static by design: no pulse to reduce under motion sensitivity.
    const pilot = this.pilot;
    const radius = Number.isFinite(player.radius) && player.radius > 0 ? player.radius : 6;
    const aft = radius * pilot.aftFactor;
    const size = Math.max(1.2, radius * pilot.sizeFactor);
    let aftX;
    let aftZ;
    const yaw = root && root.rotation && Number.isFinite(root.rotation.y)
      ? root.rotation.y : null;
    if (yaw != null) {
      aftX = -Math.cos(yaw) * aft;
      aftZ = Math.sin(yaw) * aft;
    } else {
      const heading = Number.isFinite(player.rot) ? player.rot : 0;
      aftX = -Math.cos(heading) * aft;
      aftZ = -Math.sin(heading) * aft;
    }
    this.pilotLamp.position.set(x + aftX, pilot.deckY, z + aftZ);
    this.pilotLamp.scale.set(size, size, 1);
    this.pilotLamp.material.opacity = pilot.opacity * eased;
  }

  /** Session/sector boundary: off at once, stays mounted. */
  clear() {
    this._level = 0;
    this.light.intensity = 0;
    this.pilotLamp.material.opacity = 0;
  }

  dispose({ disposeGpu = true } = {}) {
    const mounted = this.group.parent != null;
    this.clear();
    this.group.removeFromParent();
    if (disposeGpu) {
      this.light.dispose?.();
      this.pilotLamp.material.dispose();
      this._pilotTexture.dispose();
    }
    this.group.clear();
    if (mounted) noteShadowCensusLightMutation();
    this.scene = null;
  }
}
