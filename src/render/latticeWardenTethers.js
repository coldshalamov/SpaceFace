// SpaceFace — Lattice Warden lattice presentation (capital hunt boss dressing).
//
// The Warden (src/data/encounters/capital-boss/lattice-warden.js) fights through a staked
// tether-lattice: three breakable node stakes land in a triangle around the TARGET, the cell
// holds fire while the survey is intact, and a phase lance collapses it. This module is the
// presentation owner for that machinery — what the hull already models as a stake collar and
// projector vanes gets the live field:
//
//   STAKES   — each lattice_node entity (mission-owned asteroid actors spawned by the score's
//              latticeDeploy command) gets a teal glint at its body, visible against the field.
//   TETHERS  — thin emissive beams run from the Warden's collar to each live stake, re-aimed
//              every frame in the same re-aim idiom as the storm-relay feed wires.
//   CHARGE   — while the fight record's live cast is a lattice lance in its tell, the collar
//              band and beam cores brighten into the charge (the authored warning window).
//   COLLAPSE — a lance resolving inside an intact cell flashes the beams; a broken stake kills
//              its beam and glint instantly (the machine feels the missing leg).
//   RELEASE  — on entity.alive === false the collar fades and drops; the group detaches.
//
// PURE RENDER-ONLY PRESENTATION: never mutates sim state; reads entity.data.bossDressing
// (kind 'lattice_warden'), options.entities (the live lattice_node bodies), and the capital
// fight record in options.state as OBSERVATION only. No per-frame allocations: beam/glint
// slots are preallocated at bind and hidden when unused.
//
// Accessibility/pause contract: driven by presentation frame dt (0 under freeze — the field
// holds its pose), motionReduce kills beam flicker and charge shimmer, flashReduce caps every
// pulse and flash to a steady glow.

import * as THREE from 'three';
import { recordMountedRootForUnreadyScan } from './bloom.js';

const KIND = 'lattice_warden';
const NODE_COUNT = 3;

// Cold surveyor teal — matches the forge body's glow_cyan.teal accent.
const TEAL_HEX = 0x2fe8d4;

// --- proportions, in units of entity.radius ---
const COLLAR_RADIUS_FRAC = 0.86;   // beam emitter ring around the stake collar band
const BEAM_HEIGHT = 9;             // world-Y the field rides at — deck height of the hull
const NODE_GLINT_WU = 3.2;
const BEAM_HALF_W = 0.55;

// --- choreography ---
const BUILD_S = 0.9;
const IDLE_PULSE_RATE = 1.6;
const IDLE_PULSE_AMP = 0.18;
const CHARGE_RATE = 4.4;           // lance tell shimmer — faster than the idle breathing
const CHARGE_AMP = 0.55;
const FLASH_S = 0.5;               // collapse flash decay
const RELEASE_S = 0.7;

let _shared = null;

function sharedAssets() {
  if (_shared) return _shared;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const collarGeo = new THREE.TorusGeometry(1, 0.055, 8, 36);
  const glintGeo = new THREE.OctahedronGeometry(1, 0);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x0c2622, emissive: new THREE.Color(TEAL_HEX), emissiveIntensity: 0.5,
    metalness: 0.4, roughness: 0.5,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    color: TEAL_HEX, transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glintMat = new THREE.MeshBasicMaterial({
    color: TEAL_HEX, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (const res of [boxGeo, collarGeo, glintGeo, collarMat, beamMat, glintMat]) {
    res.userData.spacefaceSharedAsset = true;
  }
  _shared = { boxGeo, collarGeo, glintGeo, collarMat, beamMat, glintMat };
  return _shared;
}

function specFor(entity) {
  const dressing = entity && entity.data && entity.data.bossDressing;
  return dressing && dressing.kind === KIND ? dressing : null;
}

function buildBossGroup(radiusWu) {
  const shared = sharedAssets();
  const group = new THREE.Group();
  group.name = 'lattice_warden_field';
  const collar = new THREE.Mesh(shared.collarGeo, shared.collarMat);
  collar.name = 'lattice_warden_collar';
  collar.userData.spacefaceSharedAsset = true;
  collar.rotation.x = Math.PI / 2; // torus plane -> flat ring around the hull deck
  const r = radiusWu * COLLAR_RADIUS_FRAC;
  collar.scale.set(r, r, Math.max(1.2, radiusWu * 0.07));
  collar.castShadow = false;
  collar.receiveShadow = false;
  group.add(collar);
  return { group, collar };
}

function detachBoss(rec) {
  if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
  rec.boundMesh = null;
}

// Re-aim a unit box beam between two world-space points (XZ plane, beams ride at BEAM_HEIGHT).
function aimBeam(beam, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.max(1, Math.sqrt(dx * dx + dz * dz));
  beam.scale.set(len, BEAM_HALF_W, BEAM_HALF_W);
  beam.position.set((ax + bx) / 2, BEAM_HEIGHT, (az + bz) / 2);
  beam.rotation.y = -Math.atan2(dz, dx);
}

export function createLatticeWardenFx() {
  const records = new Map();
  // One world-space lattice field per fight — beams + stake glints live on the scene root so
  // their endpoints can sit on OTHER entities (the mission-owned stakes).
  const fields = new Map(); // fightId -> { root, beams[], glints[], nodeIds }

  function latticeFightFor(state, bossId) {
    const fights = state && state.capitalBossEncounters && state.capitalBossEncounters.fights;
    if (!fights) return null;
    for (const r of Object.values(fights)) {
      if (r && r.bossId === bossId && r.lattice) return r;
    }
    return null;
  }

  function fieldFor(fight, scene) {
    let f = fields.get(fight.fightId);
    if (f) return f;
    const shared = sharedAssets();
    const root = new THREE.Group();
    root.name = 'lattice_warden_lattice_field';
    const beams = [];
    const glints = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const beam = new THREE.Mesh(shared.boxGeo, shared.beamMat);
      beam.name = 'lattice_warden_tether';
      beam.userData.spacefaceSharedAsset = true;
      beam.visible = false;
      beam.castShadow = beam.receiveShadow = false;
      root.add(beam);
      beams.push(beam);
      const glint = new THREE.Mesh(shared.glintGeo, shared.glintMat);
      glint.name = 'lattice_warden_node_glint';
      glint.userData.spacefaceSharedAsset = true;
      glint.visible = false;
      glint.castShadow = glint.receiveShadow = false;
      root.add(glint);
      glints.push(glint);
    }
    scene.add(root);
    recordMountedRootForUnreadyScan(root);
    f = { root, beams, glints, rootParent: scene };
    fields.set(fight.fightId, f);
    return f;
  }

  function dropField(fightId) {
    const f = fields.get(fightId);
    if (f && f.root && f.root.parent) f.root.parent.remove(f.root);
    fields.delete(fightId);
  }

  function updateLatticeWarden(entity, mesh, simTime, frameDt, options) {
    if (!entity || entity.id == null || !mesh) return;
    const spec = specFor(entity);
    let rec = records.get(entity.id);
    if (!spec) {
      if (rec) { detachBoss(rec); records.delete(entity.id); }
      return;
    }
    if (!rec) {
      rec = {
        boundMesh: null, group: null, collar: null, fightId: null,
        phase: 'build', clock: 0, releaseClock: 0,
        flash: 0, seenCollapsed: 0,
      };
      records.set(entity.id, rec);
    }
    if (rec.phase === 'done') return;
    if (rec.boundMesh !== mesh) {
      detachBoss(rec);
      const parent = (mesh.userData && mesh.userData.hull) || mesh;
      if (!rec.group) {
        const built = buildBossGroup(Math.max(8, entity.radius || entity.collisionRadius || 26));
        rec.group = built.group;
        rec.collar = built.collar;
      }
      parent.add(rec.group);
      recordMountedRootForUnreadyScan(rec.group);
      rec.boundMesh = mesh;
    }

    const reduced = !!(options && options.motionReduce);
    const calmFlash = !!(options && options.flashReduce);
    const dt = Math.max(0, frameDt || 0);
    const simNow = Number.isFinite(simTime) ? simTime : 0;
    rec.clock += dt;

    const alive = entity.alive !== false;
    if (rec.phase !== 'release' && !alive) {
      rec.phase = 'release';
      rec.releaseClock = 0;
    }

    const fight = latticeFightFor(options && options.state, entity.id);
    const lat = fight && fight.lattice;
    const cast = fight && fight.cast;
    const charging = !!(cast && /lance/.test(String(cast.beatId)));

    // Collapse flash: the record's collapsed counter stepping up is the same fact the
    // latticeCollapse command carries — the render lane reads the fact, not the event.
    if (lat && lat.collapsed > rec.seenCollapsed) {
      rec.seenCollapsed = lat.collapsed;
      rec.flash = 1;
    }
    rec.flash = Math.max(0, rec.flash - dt / FLASH_S);

    if (rec.phase === 'build' || rec.phase === 'spin') {
      const buildT = Math.min(1, rec.clock / BUILD_S);
      rec.group.scale.setScalar(Math.max(0.0001, 0.4 + 0.6 * buildT));
      const idle = reduced ? 0 : IDLE_PULSE_AMP * Math.sin(simNow * IDLE_PULSE_RATE);
      const charge = charging && !reduced
        ? CHARGE_AMP * (0.5 + 0.5 * Math.sin(simNow * CHARGE_RATE)) : 0;
      rec.collar.material.emissiveIntensity = calmFlash
        ? 0.7
        : 0.45 + buildT * 0.4 + idle + charge + rec.flash * 1.6;
      if (rec.phase === 'build' && buildT >= 1) rec.phase = 'spin';
    } else if (rec.phase === 'release') {
      rec.releaseClock += dt;
      const rt = Math.min(1, rec.releaseClock / RELEASE_S);
      rec.group.scale.setScalar(Math.max(0.0001, 1 - rt));
      rec.collar.material.emissiveIntensity = Math.max(0.1, 0.8 * (1 - rt));
      if (rt >= 1) { detachBoss(rec); rec.phase = 'done'; }
    }

    // Field: beams + glints. Node slots are read straight off the fight record ids and bound
    // against live entities each frame — a dead stake just stops being drawn.
    const scene = mesh.parent && mesh.parent.isScene ? mesh.parent
      : (() => { let p = mesh; while (p.parent) p = p.parent; return p.isScene ? p : null; })();
    if (!fight || !lat || !scene) return;
    if (rec.fightId && rec.fightId !== fight.fightId) dropField(rec.fightId);
    rec.fightId = fight.fightId;
    const f = fieldFor(fight, scene);
    const entities = options && options.entities;
    const bx = entity.pos ? entity.pos.x : 0;
    const bz = entity.pos ? entity.pos.z : 0;
    const fieldDim = rec.phase === 'release' ? 0.25 : 1;
    for (let i = 0; i < NODE_COUNT; i++) {
      const nodeId = lat.nodeIds ? lat.nodeIds[i] : null;
      const node = nodeId != null && entities && typeof entities.get === 'function'
        ? entities.get(nodeId) : null;
      const live = !!(node && node.alive !== false);
      const beam = f.beams[i];
      const glint = f.glints[i];
      if (!live || rec.phase === 'done') {
        beam.visible = false;
        glint.visible = false;
        continue;
      }
      glint.visible = true;
      glint.position.set(node.pos.x, BEAM_HEIGHT, node.pos.z);
      const gs = NODE_GLINT_WU * (0.8 + (reduced ? 0 : 0.2 * Math.sin(simNow * 2.3 + i * 2.1)));
      glint.scale.setScalar(gs);
      glint.material.opacity = 0.85 * fieldDim;
      beam.visible = true;
      aimBeam(beam, bx, bz, node.pos.x, node.pos.z);
      const shimmer = reduced ? 0 : 0.1 * Math.sin(simNow * 3.1 + i);
      beam.material.opacity = Math.min(1, (0.34 + shimmer + charge * 0.5 + rec.flash * 0.6) * fieldDim);
    }
  }

  function releaseEntityMesh(entityId) {
    const rec = records.get(entityId);
    if (rec) {
      detachBoss(rec);
      if (rec.fightId) dropField(rec.fightId);
    }
  }

  function releaseMesh(mesh) {
    if (!mesh) return;
    for (const rec of records.values()) {
      if (rec.boundMesh === mesh) {
        detachBoss(rec);
        if (rec.fightId) dropField(rec.fightId);
      }
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of records.keys()) {
      if (!activeEntityIds.has(id)) {
        const rec = records.get(id);
        detachBoss(rec);
        if (rec.fightId) dropField(rec.fightId);
        records.delete(id);
      }
    }
    // Orphan guard: a field whose boss record was just pruned is released above; a field with
    // no boss record and no surviving stakes is dropped here so a detached fight never leaks
    // its world root past a save/sector rebuild.
    for (const [fightId, f] of fields) {
      let owned = false;
      for (const rec of records.values()) {
        if (rec.fightId === fightId) { owned = true; break; }
      }
      if (!owned) dropField(fightId);
    }
  }

  function peekRecord(entityId) {
    return records.get(entityId) || null;
  }

  return { updateLatticeWarden, releaseEntityMesh, releaseMesh, prune, peekRecord };
}

export const globalLatticeWardenFx = createLatticeWardenFx();
