// Rows 427 + 438 — sim-aware life on the far depth sheets, above and below the flight plane.
// Render-only: every silhouette, beam and flash here is a presentation projection of sim state
// (real miners, real combat events, real sector identity) or ambient lane choreography. Nothing
// in this module writes sim state or collides — the clean-flight-plane law holds by construction.
import * as THREE from 'three';
import { wrapParallaxCoordinate } from './parallaxLayers.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';

// ── Nav strobes: the streams are traffic, so the hulls answer like traffic ─────────────────
// A far silhouette used to glide past as a dead cutout. Each one now carries an anti-collision
// double-flash plus a faint running light on its own phase, so the high and deep streams
// twinkle like a live shipping lane at night. Pure presentation: phase comes from the same
// spawn rng as the silhouette, the clock is cosmetic, and reduced-motion slows the blink
// instead of silencing it.
export const STROBE_PERIOD_S = 1.9;
export const STROBE_PERIOD_REDUCED_S = 5.7;
/** Running-light floor: a hull never goes fully dark between flashes. */
export const STROBE_FLOOR = 0.14;
// Two short flashes inside one period, as [start01, end01] pairs — the anti-collision
// double-flash, not a metronome blink.
const STROBE_PULSES = Object.freeze([[0.05, 0.13], [0.24, 0.32]]);

/** 0..1 brightness of one strobe at normalized period position `u01`. Deterministic. */
export function strobeEnvelope(u01) {
  const u = ((Number.isFinite(u01) ? u01 : 0) % 1 + 1) % 1;
  let peak = 0;
  for (let p = 0; p < STROBE_PULSES.length; p++) {
    const a0 = STROBE_PULSES[p][0];
    const a1 = STROBE_PULSES[p][1];
    if (u >= a0 && u <= a1) {
      const t = (u - a0) / (a1 - a0);
      peak = Math.max(peak, Math.sin(t * Math.PI));
    }
  }
  return STROBE_FLOOR + (1 - STROBE_FLOOR) * peak;
}

// Two moving sheets: a high stream overhead and a deep stream far below. Counts stay small —
// these are instanced draws, one mesh per sheet.
const HIGH = { count: 10, y: 52, factor: 0.50, tile: 2600, speed: [14, 30], scale: [1.6, 3.2], alpha: 0.55 };
const DEEP = { count: 14, y: -190, factor: 0.10, tile: 3400, speed: [9, 18], scale: [4.5, 9], alpha: 0.35 };
// Yield envelope: silhouettes bank laterally away from the camera focus inside this radius so
// they visibly give way rather than sailing through the play plane's screen space.
const YIELD_RADIUS = 260;
const YIELD_PUSH = 90;
const MINER_SCAN_S = 1.0;
const MAX_MINER_BEAMS = 4;
const FLASH_POOL = 10;
const FLASH_LIFE_S = 0.9;
const FLASH_FAR_WU = 380;

let active = null;

export function init(scene, state, bus) {
  if (active) active.dispose();
  active = new FarPlaneLife(scene, state, bus);
  return active;
}

export function update(dt) {
  if (active) active.update(dt);
}

export function dispose() {
  if (!active) return;
  active.dispose();
  active = null;
}

export function activeSheets() {
  return active ? active.sheets : [];
}

class FarPlaneLife {
  constructor(scene, state, bus) {
    this.scene = scene;
    this.state = state || {};
    this.bus = bus;
    this.sheets = [];
    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._euler = new THREE.Euler();
    this._minerScanT = 0;
    this._flashes = [];

    this._geometry = hullSilhouetteGeometry();
    this._spawnSheet('FarLife_HighStream', HIGH, 0x51c4d9);
    this._spawnSheet('FarLife_DeepStream', DEEP, 0x8a3f11);
    this._createBeams();
    this._createFlashes();
    if (bus && typeof bus.on === 'function') {
      bus.on('combat:hit', (p) => this._queueBattleFlash(p));
      bus.on('combat:fire', (p) => this._queueBattleFlash(p));
    }
  }

  _spawnSheet(name, spec, seed) {
    const material = new THREE.MeshBasicMaterial({
      transparent: true, opacity: spec.alpha, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(this._geometry, material, spec.count);
    mesh.name = `${name}_Instances`;
    mesh.frustumCulled = false;
    mesh.renderOrder = -4;
    const group = new THREE.Group();
    group.name = name;
    group.renderOrder = -4;
    group.userData.layer = name;
    group.add(mesh);
    this.scene.add(group);

    const rnd = mulberry(seed);
    const ships = [];
    for (let i = 0; i < spec.count; i++) {
      const lane = rnd() < 0.5 ? 1 : -1; // two counter-flowing lanes per sheet
      ships.push({
        x: (rnd() - 0.5) * spec.tile,
        z: (rnd() - 0.5) * spec.tile,
        dir: lane,
        // lanes run roughly on sector diagonals; a per-ship heading wobble keeps streams organic
        heading: (lane > 0 ? 0.24 : Math.PI + 0.24) + (rnd() - 0.5) * 0.22,
        speed: spec.speed[0] + rnd() * (spec.speed[1] - spec.speed[0]),
        scale: spec.scale[0] + rnd() * (spec.scale[1] - spec.scale[0]),
        yieldOff: 0,
        phase: rnd() * Math.PI * 2,
        // nav-light identity: mostly warm white running lights, some amber freight, a few red
        strobeTint: rnd() < 0.76 ? 0xfff3e0 : (rnd() < 0.5 ? 0xffb066 : 0xff6a55),
      });
    }
    const sheet = { name, spec, group, mesh, ships };
    this.sheets.push(sheet);
    this._spawnStrobes(sheet, ships, rnd);
  }

  // One instanced additive quad per silhouette: the anti-collision light riding a wingtip.
  _spawnStrobes(sheet, ships, rnd) {
    const geometry = farPlaneStrobeGeometry();
    const material = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    });
    const strobeMesh = new THREE.InstancedMesh(geometry, material, ships.length);
    strobeMesh.name = `${sheet.name}_NavStrobes`;
    strobeMesh.frustumCulled = false;
    strobeMesh.renderOrder = -3; // just above its sheet, far behind the play plane
    const color = new THREE.Color();
    for (let i = 0; i < ships.length; i++) {
      strobeMesh.setColorAt(i, color.setHex(ships[i].strobeTint));
      // Park off-screen until the first update writes a real matrix.
      this._pos.set(0, -9999, 0);
      this._quat.identity();
      this._scale.set(0.001, 0.001, 0.001);
      this._matrix.compose(this._pos, this._quat, this._scale);
      strobeMesh.setMatrixAt(i, this._matrix);
    }
    if (strobeMesh.instanceColor) strobeMesh.instanceColor.needsUpdate = true;
    sheet.group.add(strobeMesh);
    sheet.strobeMesh = strobeMesh;
  }

  _createBeams() {
    // Mining beams: thin additive boxes mirrored from real far-away miner entities.
    const material = new THREE.MeshBasicMaterial({
      color: 0x86c8ff, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const geometry = new THREE.BoxGeometry(1, 0.4, 0.4);
    this._beamMesh = new THREE.InstancedMesh(geometry, material, MAX_MINER_BEAMS);
    this._beamMesh.frustumCulled = false;
    this._beamMesh.renderOrder = -3;
    this._beamMesh.name = 'FarLife_MiningBeams';
    this._beamGroup = new THREE.Group();
    this._beamGroup.name = 'FarLife_MiningBeams';
    this._beamGroup.add(this._beamMesh);
    this.scene.add(this._beamGroup);
    this._beamTargets = [];
  }

  _createFlashes() {
    // A real 3D flare body (squashed octahedron), not a glow card — the VFX standard bars
    // sprites/cards as the object itself. Additive + depthWrite off keeps it a light pulse.
    const geometry = new THREE.OctahedronGeometry(1, 0);
    geometry.scale(1, 0.25, 1);
    this._flashGeometry = geometry;
    this._flashGroup = new THREE.Group();
    this._flashGroup.name = 'FarLife_BattleFlashes';
    this._flashGroup.renderOrder = 5;
    for (let i = 0; i < FLASH_POOL; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this._flashGroup.add(mesh);
      this._flashes.push({ mesh: mesh, t: 0, life: 0 });
    }
    this.scene.add(this._flashGroup);
  }

  _queueBattleFlash(payload) {
    // A distant-battle flash only earns its place if the real fight is actually off-screen far.
    const pos = payload && (payload.pos || payload.position
      || (payload.target && payload.target.pos) || (payload.entity && payload.entity.pos));
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const focus = this._focus();
    if (!focus) return;
    const dx = pos.x - focus.x, dz = pos.z - focus.z;
    if (dx * dx + dz * dz < FLASH_FAR_WU * FLASH_FAR_WU) return; // close fights draw themselves
    const slot = this._flashes.find((f) => f.life <= 0) || this._flashes[0];
    slot.t = 0;
    slot.life = FLASH_LIFE_S;
    // project onto the deep sheet, world-anchored so the flash sits where the fight is
    slot.mesh.position.set(pos.x - focus.x, -120, pos.z - focus.z);
    slot.mesh.visible = true;
  }

  _focus() {
    const camera = this.state.camera || {};
    const focus = camera.focus || (camera.obj && camera.obj.position) || null;
    return focus && Number.isFinite(focus.x) ? focus : null;
  }

  update(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const focus = this._focus();
    const localX = focus ? focus.x : 0;
    const localZ = focus ? focus.z : 0;
    const origin = (this.state.world && this.state.world.frameOrigin) || {};
    const worldX = localX + (Number.isFinite(origin.x) ? origin.x : 0);
    const worldZ = localZ + (Number.isFinite(origin.z) ? origin.z : 0);
    // Reduced motion slows the anti-collision blink to a calm pulse; it never silences it —
    // a dark lane reads as dead traffic, not calm traffic.
    const a11y = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const strobePeriod = a11y.id === 'full' ? STROBE_PERIOD_S : STROBE_PERIOD_REDUCED_S;
    const strobeSize = a11y.flashSizeScale;

    for (const sheet of this.sheets) {
      const { spec, mesh, ships, group } = sheet;
      group.position.x = localX;
      group.position.z = localZ;
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        s.x += Math.cos(s.heading) * s.speed * frameDt;
        s.z += Math.sin(s.heading) * s.speed * frameDt;

        // Yield: ease the ship off-axis when the focus closes in, ease back when it leaves.
        const wx = wrapParallaxCoordinate(s.x, worldX, spec.factor, spec.tile);
        const wz = wrapParallaxCoordinate(s.z, worldZ, spec.factor, spec.tile);
        const d2 = wx * wx + wz * wz;
        const want = d2 < YIELD_RADIUS * YIELD_RADIUS ? YIELD_PUSH * (1 - Math.sqrt(d2) / YIELD_RADIUS) : 0;
        s.yieldOff += (want - s.yieldOff) * Math.min(1, frameDt * 2.2);

        const px = wx - Math.sin(s.heading) * s.yieldOff;
        const pz = wz + Math.cos(s.heading) * s.yieldOff;
        this._pos.set(px, spec.y, pz);
        const bank = s.yieldOff * 0.012 * s.dir;
        this._euler.set(0, -s.heading, bank + Math.sin(s.phase) * 0.04);
        this._quat.setFromEuler(this._euler);
        const pulse = 1 + 0.05 * Math.sin(s.phase + (this._time || 0) * 2);
        this._scale.set(s.scale * pulse, s.scale * 0.45, s.scale * 0.32);
        this._matrix.compose(this._pos, this._quat, this._scale);
        mesh.setMatrixAt(i, this._matrix);

        // Nav strobe on the wingtip (perpendicular off the heading, sides alternate), riding
        // the same yield-corrected hull position the silhouette draws.
        if (sheet.strobeMesh) {
          const env = strobeEnvelope((this._time || 0) / strobePeriod + s.phase * 0.618);
          const side = (i % 2 === 0) ? 1 : -1;
          const ss = Math.max(0.05, s.scale * 0.24 * env * strobeSize);
          this._pos.set(px - Math.sin(s.heading) * side * s.scale * 0.55, spec.y + 0.6,
            pz + Math.cos(s.heading) * side * s.scale * 0.55);
          this._quat.identity();
          this._scale.set(ss, ss, ss);
          this._matrix.compose(this._pos, this._quat, this._scale);
          sheet.strobeMesh.setMatrixAt(i, this._matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (sheet.strobeMesh) sheet.strobeMesh.instanceMatrix.needsUpdate = true;
    }
    this._time = (this._time || 0) + frameDt;

    this._minerScanT -= frameDt;
    if (this._minerScanT <= 0) {
      this._minerScanT = MINER_SCAN_S;
      this._scanMiners();
    }
    this._drawBeams(localX, localZ);
    this._updateFlashes(frameDt);
  }

  // Mirror live far-away miners onto the deep sheet with their beams on — the distant mining
  // work is the sim's own roster, not a staged crowd.
  _scanMiners() {
    const entities = (this.state.world && this.state.world.entities)
      || this.state.entities || [];
    const focus = this._focus();
    this._beamTargets.length = 0;
    if (!focus || !entities.length) return;
    for (const e of entities) {
      if (this._beamTargets.length >= MAX_MINER_BEAMS) break;
      const role = e && e.data && (e.data.role || e.data.job && e.data.job.kind);
      if (role !== 'miner') continue;
      if (!e.pos || !Number.isFinite(e.pos.x)) continue;
      const dx = e.pos.x - focus.x, dz = e.pos.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 600 * 600 || d2 > 4000 * 4000) continue;
      this._beamTargets.push({ x: dx, z: dz, yaw: e.rot || 0 });
    }
  }

  _drawBeams(localX, localZ) {
    const mesh = this._beamMesh;
    if (!mesh) return;
    this._beamGroup.position.x = localX;
    this._beamGroup.position.z = localZ;
    for (let i = 0; i < MAX_MINER_BEAMS; i++) {
      const t = this._beamTargets[i];
      if (t) {
        const len = 26 + 8 * Math.sin((this._time || 0) * 3 + i);
        this._pos.set(t.x + Math.cos(t.yaw) * len * 0.5, -150, t.z + Math.sin(t.yaw) * len * 0.5);
        this._euler.set(0, -t.yaw, 0);
        this._quat.setFromEuler(this._euler);
        this._scale.set(len, 1, 1);
      } else {
        this._pos.set(0, -9999, 0);
        this._quat.identity();
        this._scale.set(0.001, 0.001, 0.001);
      }
      this._matrix.compose(this._pos, this._quat, this._scale);
      mesh.setMatrixAt(i, this._matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _updateFlashes(dt) {
    for (const f of this._flashes) {
      if (f.life <= 0) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.life = 0;
        f.mesh.visible = false;
        continue;
      }
      const bell = Math.sin(Math.min(1, k) * Math.PI);
      f.mesh.material.opacity = bell * 0.85;
      const size = 30 + 90 * k;
      f.mesh.scale.set(size, size, 1);
    }
  }

  dispose() {
    for (const sheet of this.sheets) {
      if (this.scene) this.scene.remove(sheet.group);
      sheet.mesh.dispose();
      sheet.mesh.material.dispose();
      if (sheet.strobeMesh) {
        sheet.strobeMesh.dispose();
        sheet.strobeMesh.material.dispose();
      }
    }
    this.sheets.length = 0;
    for (const group of [this._beamGroup, this._flashGroup]) {
      if (!group) continue;
      if (this.scene) this.scene.remove(group);
      for (const child of group.children) {
        if (child.material) child.material.dispose();
      }
    }
    if (this._beamMesh) this._beamMesh.geometry.dispose();
    if (this._flashGeometry) this._flashGeometry.dispose();
    if (this._geometry) this._geometry.dispose();
  }
}

// A cheap authored hull silhouette: wedge nose, box mid, twin nacelle hints. Reads as a ship at
// far-plane scale without per-ship geometry cost.
function hullSilhouetteGeometry() {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // nose wedge (two tris, flat on the plane)
    0, 0, -1.0, 0.55, 0, 0.5, -0.55, 0, 0.5,
    // mid-body sliver
    0.55, 0, 0.5, 0.75, 0, 1.0, -0.75, 0, 1.0,
    0.55, 0, 0.5, -0.75, 0, 1.0, -0.55, 0, 0.5,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

// Shared flat 1x1 quad in the play plane for the instanced nav strobes (top-down camera sees it).
let _strobeGeometry = null;
function farPlaneStrobeGeometry() {
  if (_strobeGeometry) return _strobeGeometry;
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  return (_strobeGeometry = geo);
}

function mulberry(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
