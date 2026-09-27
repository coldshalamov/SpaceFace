// SpaceFace — Forge Regent crown (PQ-133.07).
//
// The wave-30 Foundry finale bosses the Mirrorjaw core under a WIDER mirror crown (180° vs the
// Foreman's 150° prow arc, src/data/enemies.js `forge_regent`). This module is that crown's
// presentation owner: a collar of mirror plates ringing the bow axis (+X local is the nose —
// src/combat/damage.js normalized-arc convention), rotating like furnace machinery while the
// plates rake forward-and-outward over the prow the directional armor sheds fire from.
//
// PURE RENDER-ONLY PRESENTATION: never mutates sim state; reads entity.data.bossDressing
// (stamped by makeEnemySpawnSpec from def.bossDressing) and entity.alive as OBSERVATION only.
// Transform edits stay on position/rotation/scale; shared geometries/materials are tagged
// spacefaceSharedAsset so boundary disposal never frees them.
//
// Lifecycle per docs/visual-assets/VFX_TECHNIQUE_STANDARD.md:
//   build    — plates scale in with stagger and the ember ring lights off (ignition);
//   spin     — the collar turns around the nose axis continuously, plates breathe on their
//              seeded radius offset, ember seams pulse (sustained transport — visible even with
//              zero affected bodies);
//   release  — on entity.alive === false the plates fling outward, tumble and collapse, then the
//              group detaches. An unbind before that (eviction, rebuild, authored swap) detaches
//              immediately; a rebuilt mesh re-acquires the crown on the next update.
//
// Accessibility/pause contract: driven by presentation frame dt (0 under freeze — the crown
// holds its pose), `motionReduce` slows the spin and kills the bob, `flashReduce` caps the ember
// pulse to a steady glow. No per-frame allocations; deterministic seeded plate variation.

import * as THREE from 'three';
import { WORKS_FURNACE_HEAT } from './industrialMaterialFamilies.js';

const CROWN_KIND = 'forge_crown';
const PLATE_COUNT = 9;

// --- proportions, in units of entity.radius (collision radius) ---
const COLLAR_RADIUS_FRAC = 0.62;   // ring centreline radius from the nose axis
const BOW_OFFSET_FRAC = 0.46;      // ring sits over the forward third of the hull
const PLATE_LEN_FRAC = 0.36;       // plate radial height (hull-beam clearance comes from this)
const PLATE_WIDTH_FRAC = 0.22;     // tangential width — gap between plates is the dark separation
const PLATE_THICK_FRAC = 0.055;
const RAKE_RAD = 0.52;             // face normal tilts from +X toward radial-out — flared crown
const EMBER_RING_RADIUS_FRAC = 0.50;
const EMBER_RING_TUBE_FRAC = 0.055;
const HUB_DISC_RADIUS_FRAC = 0.24;

// --- choreography (seconds / rad·s⁻¹) ---
const BUILD_S = 1.15;
const PLATE_STAGGER_S = 0.55;      // spread across all plates inside the build window
const PLATE_GROW_S = 0.55;
const SPIN_RATE = 0.55;
const SPIN_RATE_REDUCED = 0.14;
const COUNTER_RING_RATE = -0.21;   // the ember collar counter-rotates — machinery, not a halo
const BOB_AMP_WU = 0.9;
const BOB_RATE = 1.3;
const EMBER_HOT = 1.25;
const EMBER_PULSE = 0.45;
const EMBER_PULSE_RATE = 2.1;
const RELEASE_S = 0.6;
const RELEASE_FLING_WU = 30;       // outward radial velocity at release
const RELEASE_TUMBLE_MAX = 6.5;    // per-plate tumble rad/s, seeded

let _shared = null;

function sharedAssets() {
  if (_shared) return _shared;
  const plateGeo = new THREE.BoxGeometry(1, 1, 1);
  const ringGeo = new THREE.TorusGeometry(1, 0.11, 8, 28);
  const hubGeo = new THREE.CylinderGeometry(1, 1, 0.16, 20);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xb8c2cc, metalness: 0.92, roughness: 0.24,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161a20, metalness: 0.62, roughness: 0.68,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x1d1008,
    emissive: new THREE.Color(WORKS_FURNACE_HEAT.emberHex),
    emissiveIntensity: WORKS_FURNACE_HEAT.darkIntensity,
    metalness: 0.4, roughness: 0.5,
  });
  for (const res of [plateGeo, ringGeo, hubGeo, plateMat, darkMat, emberMat]) {
    res.userData.spacefaceSharedAsset = true;
  }
  _shared = { plateGeo, ringGeo, hubGeo, plateMat, darkMat, emberMat };
  return _shared;
}

// Deterministic per-plate hash — cosmetic variation only, never consumes sim RNG.
function plateSeed(i, salt) {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildCrownGroup(radiusWu) {
  const shared = sharedAssets();
  const group = new THREE.Group();
  group.name = 'forge_regent_crown';
  group.position.set(radiusWu * BOW_OFFSET_FRAC, 0, 0);

  const spinner = new THREE.Group();
  spinner.name = 'forge_regent_crown_spinner';
  group.add(spinner);

  const collarR = radiusWu * COLLAR_RADIUS_FRAC;
  const plates = [];
  for (let i = 0; i < PLATE_COUNT; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = (i / PLATE_COUNT) * Math.PI * 2;
    spinner.add(pivot);

    const plate = new THREE.Mesh(shared.plateGeo, shared.plateMat);
    plate.name = 'forge_regent_crown_plate';
    plate.userData.spacefaceSharedAsset = true;
    const sx = radiusWu * PLATE_THICK_FRAC;
    const sy = radiusWu * PLATE_LEN_FRAC;
    const sz = radiusWu * PLATE_WIDTH_FRAC;
    plate.scale.set(sx, 0.0001, sz);
    plate.position.set(0, collarR, 0);
    plate.rotation.z = -RAKE_RAD;
    plate.castShadow = false;
    plate.receiveShadow = false;
    pivot.add(plate);

    // Hot seam along the plate's radial-outer lip — luminous junction, not a glow card.
    const seam = new THREE.Mesh(shared.plateGeo, shared.emberMat);
    seam.userData.spacefaceSharedAsset = true;
    seam.scale.set(1.12, 0.075, 0.86);
    seam.position.set(0, 0.53, 0);
    plate.add(seam);

    plates.push({
      pivot, plate, sx, sy, sz,
      baseY: collarR,
      bobPhase: plateSeed(i, 1) * Math.PI * 2,
      releaseSpin: (plateSeed(i, 2) - 0.5) * 2 * RELEASE_TUMBLE_MAX,
      delay: (i / PLATE_COUNT) * PLATE_STAGGER_S,
    });
  }

  // Furnace collar the plates ride on — a dark hub ring plus the ember band that counter-rotates.
  const emberRing = new THREE.Mesh(shared.ringGeo, shared.emberMat);
  emberRing.name = 'forge_regent_crown_ember';
  emberRing.userData.spacefaceSharedAsset = true;
  emberRing.rotation.y = Math.PI / 2; // torus plane XY -> encircle the X (nose) axis
  const emberR = radiusWu * EMBER_RING_RADIUS_FRAC;
  emberRing.scale.set(emberR, emberR, radiusWu * EMBER_RING_TUBE_FRAC / 0.11);
  emberRing.castShadow = false;
  emberRing.receiveShadow = false;
  group.add(emberRing);

  const hub = new THREE.Mesh(shared.hubGeo, shared.darkMat);
  hub.name = 'forge_regent_crown_hub';
  hub.userData.spacefaceSharedAsset = true;
  hub.rotation.z = Math.PI / 2; // cylinder Y axis -> X (nose) axis
  const hubR = radiusWu * HUB_DISC_RADIUS_FRAC;
  hub.scale.set(radiusWu * 0.10, hubR, hubR);
  hub.position.set(radiusWu * -0.06, 0, 0);
  hub.castShadow = false;
  hub.receiveShadow = false;
  spinner.add(hub); // hub rotates with the plates — the whole assembly is one machine

  return { group, spinner, emberRing, plates, emberMat: shared.emberMat };
}

function easeOutBack(t) {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function crownSpecFor(entity) {
  const dressing = entity && entity.data && entity.data.bossDressing;
  if (!dressing || dressing.kind !== CROWN_KIND) return null;
  return dressing;
}

function detachCrown(rec) {
  if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
  rec.boundMesh = null;
}

export function createForgeCrownTracker() {
  const records = new Map();

  function updateForgeCrown(entity, mesh, simTime, frameDt, options) {
    if (!entity || entity.id == null || !mesh) return;
    const spec = crownSpecFor(entity);
    let rec = records.get(entity.id);
    if (!spec) {
      if (rec) { detachCrown(rec); records.delete(entity.id); }
      return;
    }
    if (!rec) {
      rec = {
        boundMesh: null, group: null, spinner: null, emberRing: null, emberMat: null,
        plates: null, phase: 'build', clock: 0, spinAngle: 0, releaseClock: 0,
      };
      records.set(entity.id, rec);
    }
    if (rec.phase === 'done') return; // released with the kill — never re-crown a dead boss
    // Rebind after boundary eviction / authored upgrade: keep the phase clock, re-seat the group.
    if (rec.boundMesh !== mesh) {
      detachCrown(rec);
      const parent = (mesh.userData && mesh.userData.hull) || mesh;
      if (!rec.group) {
        const built = buildCrownGroup(Math.max(8, entity.radius || 32));
        rec.group = built.group; rec.spinner = built.spinner;
        rec.emberRing = built.emberRing; rec.plates = built.plates; rec.emberMat = built.emberMat;
      }
      parent.add(rec.group);
      rec.boundMesh = mesh;
    }

    const reduced = !!(options && options.motionReduce);
    const calmFlash = !!(options && options.flashReduce);
    const dt = Math.max(0, frameDt || 0);
    rec.clock += dt;

    const alive = entity.alive !== false;
    if (rec.phase !== 'release' && !alive) {
      rec.phase = 'release';
      rec.releaseClock = 0;
    }

    if (rec.phase === 'build' || rec.phase === 'spin') {
      const buildT = Math.min(1, rec.clock / BUILD_S);
      const spinRate = (reduced ? SPIN_RATE_REDUCED : SPIN_RATE)
        * Math.min(1, buildT * 1.6); // ignition spool — the collar winds up, not snaps on
      rec.spinAngle += spinRate * dt;
      rec.spinner.rotation.x = rec.spinAngle;
      rec.emberRing.rotation.x = COUNTER_RING_RATE * rec.clock;

      const emberPulse = (reduced || calmFlash)
        ? 0
        : EMBER_PULSE * (0.5 + 0.5 * Math.sin(simTime * EMBER_PULSE_RATE));
      rec.emberMat.emissiveIntensity = rec.phase === 'build'
        ? WORKS_FURNACE_HEAT.darkIntensity + (EMBER_HOT - WORKS_FURNACE_HEAT.darkIntensity) * buildT
        : (calmFlash ? Math.min(EMBER_HOT, 0.9) : EMBER_HOT + emberPulse);

      const bobAmp = reduced ? 0 : BOB_AMP_WU;
      for (let i = 0; i < rec.plates.length; i++) {
        const p = rec.plates[i];
        const grow = Math.min(1, Math.max(0, (rec.clock - p.delay) / PLATE_GROW_S));
        const s = grow <= 0 ? 0.0001 : easeOutBack(grow);
        p.plate.scale.set(p.sx, p.sy * s, p.sz * (0.35 + 0.65 * Math.min(1, grow * 1.4)));
        p.plate.position.y = p.baseY + bobAmp * Math.sin(simTime * BOB_RATE + p.bobPhase);
      }
      if (rec.phase === 'build' && buildT >= 1) rec.phase = 'spin';
    } else if (rec.phase === 'release') {
      rec.releaseClock += dt;
      const rt = Math.min(1, rec.releaseClock / RELEASE_S);
      rec.spinAngle += SPIN_RATE * (1 - rt) * dt; // momentum decays with the machine
      rec.spinner.rotation.x = rec.spinAngle;
      rec.emberMat.emissiveIntensity = Math.max(
        WORKS_FURNACE_HEAT.darkIntensity,
        EMBER_HOT * (1 - rt * 1.6),
      );
      const shrink = Math.max(0.0001, 1 - rt);
      for (let i = 0; i < rec.plates.length; i++) {
        const p = rec.plates[i];
        p.plate.position.y = p.baseY + RELEASE_FLING_WU * rec.releaseClock * rec.releaseClock;
        p.plate.rotation.y += p.releaseSpin * dt;
        p.plate.scale.set(p.sx * shrink, p.sy * shrink, p.sz * shrink);
      }
      if (rt >= 1) {
        detachCrown(rec);
        rec.phase = 'done';
      }
    }
  }

  function releaseEntityMesh(entityId) {
    const rec = records.get(entityId);
    if (rec) detachCrown(rec);
  }

  function releaseMesh(mesh) {
    if (!mesh) return;
    for (const rec of records.values()) {
      if (rec.boundMesh === mesh) detachCrown(rec);
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of records.keys()) {
      if (!activeEntityIds.has(id)) {
        const rec = records.get(id);
        detachCrown(rec);
        records.delete(id);
      }
    }
  }

  function peekRecord(entityId) {
    return records.get(entityId) || null;
  }

  return { updateForgeCrown, releaseEntityMesh, releaseMesh, prune, peekRecord };
}

export const globalForgeCrown = createForgeCrownTracker();
