// SpaceFace — law-arena machinery + boss dressing (PQ-133.08).
//
// Lagrange Crucible and Cinder Sluice are law arenas (src/systems/lagrangeCrucible.js /
// cinderSluiceArena.js): the room IS the mechanic, and until now its machinery existed only as
// force specs — two wells on invisible pylons, a cone current with no mouth, a shutter line with
// no bar, a crusher with no jaw. This module is the presentation owner for both halves of that
// debt, per docs/visual-assets/VFX_TECHNIQUE_STANDARD.md — real geometry on the field, never a
// camera-facing card:
//
//   ROOM — driven by the `survivalArena:installed`/`released` pair (survivalArena.js). Field
//   anchors (well/repulsor/cone) get pylon machines at their centres; toy specs get shutter bars
//   across a→b, a crusher press working pos→anvil on the authored warning/surge/calm clock, and
//   a current mouth aimed down the cone. All clocks run off elapsed sim time through the same
//   pure helpers the sim uses (shutterPhase / crusherPhase / stepCinderMachinery), so the metal
//   is exactly in phase with the force it owns.
//
//   BOSS — the wave-10 boss of a law arena is a ROLE over the shared dreadnought hull
//   (`bossRole` in the arena module); materializeWaveBatch stamps data.bossDressing with the
//   role id. tidal_engine gets paired counter-rotating tide vanes around the spine; chain_tug
//   gets the aft winch array; manifold_warden its four coolant arms; grid_tyrant a relay-drone
//   ring; the Asteroid Mill's seam_crusher wears the opposed grind wheels and their ore train;
//   the Hive's queen_warden carries the brood clutch and its attendant ring. Same lifecycle
//   contract as forgeRegentCrown.js: lazy bind under mesh.userData.hull, build-in, idle
//   motion, kill release, mesh rebind, prune, done latch.
//
//   AFFIX — swarmElites stamps data.swarmAffix / data.swarmAffix2 on elite and champion
//   hulls (SWARM-06 §6.4); each stamp hangs a small per-trick machine on the spine —
//   a shielded dome, splitter pod twins, a volatile charge, a magnetic claw, a commander
//   mast, hasted fins — so the wave's named tricks are read off the body mid-chaos, not
//   only off the wave banner. Same lifecycle contract again.
//
// PURE RENDER-ONLY PRESENTATION: never mutates sim state; room props never become physics bodies
// (the law-arena toys are deliberately non-solid — a solid port would change the field digests).
// Transform edits stay on position/rotation/scale; shared geometries/materials are tagged
// spacefaceSharedAsset so boundary disposal never frees them. Driven by presentation frame dt
// (0 under freeze — the room holds its pose); motionReduce slows every mover and kills sweeps;
// flashReduce caps emissive pulses to a steady glow.

import * as THREE from 'three';
import { recordMountedRootForUnreadyScan } from './bloom.js';
import { CRUSHER_CYCLE, crusherPhase, SHUTTER_CYCLE, shutterPhase } from '../data/arenaModuleLibrary.js';
import { CINDER_ARENA_ID, stepCinderMachinery } from '../systems/cinderSluiceArena.js';
import { POWERED_CONVEYOR_RULESET } from '../data/survivalMutators.js';
import { LAGRANGE_ARENA_ID } from '../systems/lagrangeCrucible.js';
import { CRYO_ARENA_ID } from '../systems/cryoDriftArena.js';
import {
  STORM_ARENA_ID,
  STORM_CONDUCT_RANGE,
  STORM_RELAY_COUNT,
  STORM_RELAY_ORBIT,
  STORM_RELAY_PERIOD,
  buildConductivityGraph,
} from '../systems/stormLatticeArena.js';
import { WORKS_FURNACE_HEAT } from './industrialMaterialFamilies.js';

const LAW_ARENA_IDS = new Set([LAGRANGE_ARENA_ID, CINDER_ARENA_ID, CRYO_ARENA_ID, STORM_ARENA_ID]);
const BOSS_DRESSING_KINDS = new Set([
  'tidal_engine', 'chain_tug', 'manifold_warden', 'grid_tyrant', 'seam_crusher', 'queen_warden',
]);

// Cold polarity for pull machinery (wells, tide vanes); furnace ember for push/heat (repulsor,
// sluice throat, crusher faces). Two hues keep the room readable: cyan drags, orange shoves.
// The brood green is the Hive's own authored hue (broodPresentation.js marker rings).
const TIDE_HEX = 0x59d8e8;
const AMBER_HEX = 0xffb347;
const BROOD_HEX = 0x6cff9a;

// --- choreography (seconds / rad·s⁻¹) ---
const PYLON_SPIN = 0.22;
const PYLON_SPIN_REDUCED = 0.06;
const SHUTTER_SWEEP_PERIOD_S = 6.5;   // matches the authored calm half of the shutter cycle
const JAW_SLAM_FRAC = 0.22;           // first 22% of surge carries the stroke; the rest is hold
const MOUTH_ROLLER_RATE = 2.4;
const MOUTH_ROLLER_RATE_REDUCED = 0.5;
const VANE_RATE = 0.7;
const VANE_RATE_REDUCED = 0.16;
const WINCH_RATE = 0.45;
const WINCH_RATE_REDUCED = 0.12;
const GIMBAL_RATE = 0.5;          // manifold_warden arm tumble
const ORBIT_RATE = 0.4;           // grid_tyrant drone ring
const RELAY_SPARK_RATE = 5.0;     // storm relay beam flicker cadence
const GRIND_RATE = 0.55;          // seam_crusher mill wheels — a heavy turn, not a fan
const GRIND_RATE_REDUCED = 0.14;
const BROOD_ORBIT_RATE = 0.4;     // queen_warden attendant ring
const BROOD_ORBIT_RATE_REDUCED = 0.1;
const SAC_PULSE_RATE = 1.6;       // queen_warden sac bellows cadence (rad·s⁻¹ of the seethe)
const BUILD_S = 0.9;
const RELEASE_S = 0.55;
const RELEASE_FLING_WU = 26;

let _shared = null;

function sharedAssets() {
  if (_shared) return _shared;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  const torusGeo = new THREE.TorusGeometry(1, 0.09, 8, 28);
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x14181e, metalness: 0.66, roughness: 0.66,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x6f7880, metalness: 0.9, roughness: 0.38,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae, metalness: 0.88, roughness: 0.32,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x1d1008,
    emissive: new THREE.Color(WORKS_FURNACE_HEAT.emberHex),
    emissiveIntensity: WORKS_FURNACE_HEAT.darkIntensity,
    metalness: 0.4, roughness: 0.5,
  });
  const tideMat = new THREE.MeshStandardMaterial({
    color: 0x0a1418,
    emissive: new THREE.Color(TIDE_HEX),
    emissiveIntensity: 0.08,
    metalness: 0.35, roughness: 0.55,
  });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0x181008,
    emissive: new THREE.Color(AMBER_HEX),
    emissiveIntensity: 0.08,
    metalness: 0.4, roughness: 0.5,
  });
  const broodMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a10,
    emissive: new THREE.Color(BROOD_HEX),
    emissiveIntensity: 0.08,
    metalness: 0.25, roughness: 0.62,
  });
  for (const res of [boxGeo, cylGeo, torusGeo, darkMat, metalMat, plateMat, emberMat, tideMat, amberMat, broodMat]) {
    res.userData.spacefaceSharedAsset = true;
  }
  _shared = { boxGeo, cylGeo, torusGeo, darkMat, metalMat, plateMat, emberMat, tideMat, amberMat, broodMat };
  return _shared;
}

function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.userData.spacefaceSharedAsset = true;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/**
 * Animated emissive parts get their OWN material instance (the module's shared seam materials are
 * written by several movers every frame — a shared instance would flicker to whoever ran last).
 * The clone is pushed into `sink` and disposed when the owning install/dressing is released;
 * the shared-asset tag is stripped so ordinary disposal paths may free it too.
 */
function cloneEmissive(mat, sink) {
  const clone = mat.clone();
  if (clone.userData) delete clone.userData.spacefaceSharedAsset;
  if (Array.isArray(sink)) sink.push(clone);
  return clone;
}

// ---------------------------------------------------------------------------
// Room props. Every builder returns { root, mover } — mover is an optional per-frame callback
// (elapsedS, dt, reduced, calmFlash) — so updateRoom() is a flat loop over registered parts.
// ---------------------------------------------------------------------------

/** Pylon machine anchoring a well/repulsor centre. Well pulls cold, repulsor shoves hot. */
function buildFieldAnchor(field, sink) {
  const shared = sharedAssets();
  const hot = field && field.kind === 'repulsor';
  const seam = cloneEmissive(hot ? shared.emberMat : shared.tideMat, sink);
  const root = new THREE.Group();
  root.name = 'law_pylon';
  root.position.set(field.center.x, 0, field.center.z);

  // Tripod skirt + stacked drums: a heavy machine that owns the well, not a waypoint marker.
  const base = mesh(shared.boxGeo, shared.darkMat, 'law_pylon_base');
  base.scale.set(44, 6, 44);
  base.position.y = 3;
  root.add(base);
  const collar = new THREE.Group();
  collar.name = 'law_pylon_collar';
  for (let i = 0; i < 3; i++) {
    const drum = mesh(shared.cylGeo, i === 1 ? shared.metalMat : shared.darkMat, 'law_pylon_drum');
    const r = 17 - i * 4.5;
    drum.scale.set(r, 7, r);
    drum.position.y = 6 + i * 8.5;
    collar.add(drum);
  }
  root.add(collar);
  const ring = mesh(shared.torusGeo, seam, 'law_pylon_seam');
  ring.rotation.x = Math.PI / 2; // torus plane -> XZ
  ring.scale.setScalar(21);
  ring.position.y = 40;
  root.add(ring);
  const vane = mesh(shared.boxGeo, seam, 'law_pylon_vane');
  vane.scale.set(46, 2.4, 4);
  vane.position.y = 46;
  collar.add(vane);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse) {
      collar.rotation.y += (reduced ? PYLON_SPIN_REDUCED : PYLON_SPIN) * dt;
      ring.rotation.z -= (reduced ? PYLON_SPIN_REDUCED : PYLON_SPIN) * 0.6 * dt;
      seam.emissiveIntensity = calmFlash ? 0.85 : (hot ? 1.15 : 0.95) + pulse * 0.4;
    },
  };
}

/** Shutter bar spanning a→b: a dark beam that cuts the lane, with a cutter block sweeping it. */
function buildShutterBar(toy, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.emberMat, sink);
  const ax = toy.a.x, az = toy.a.z, bx = toy.b.x, bz = toy.b.z;
  const len = Math.max(8, Math.hypot(bx - ax, bz - az));
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const root = new THREE.Group();
  root.name = 'law_shutter';
  root.position.set(cx, 0, cz);
  root.rotation.y = -Math.atan2(bz - az, bx - ax); // local +X runs a->b

  const beam = mesh(shared.boxGeo, shared.darkMat, 'law_shutter_beam');
  beam.scale.set(len, 4.5, 7);
  beam.position.y = 5;
  root.add(beam);
  const lip = mesh(shared.boxGeo, seam, 'law_shutter_edge');
  lip.scale.set(len, 0.9, 1.6);
  lip.position.set(0, 7.6, 0);
  root.add(lip);
  for (const side of [-1, 1]) {
    const post = mesh(shared.boxGeo, shared.metalMat, 'law_shutter_post');
    post.scale.set(9, 16, 12);
    post.position.set(side * (len / 2), 6, 0);
    root.add(post);
  }
  const cutter = mesh(shared.boxGeo, seam, 'law_shutter_cutter');
  cutter.scale.set(10, 7.5, 9.5);
  cutter.position.y = 5;
  root.add(cutter);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash) {
      // The law shutter never travels (non-solid cut line) — the cutter block sweeps the beam
      // on the authored shutter cycle so the edge reads as a working machine, not scenery.
      const clock = shutterPhase(toy, elapsed);
      const cyc = toy.cycle || SHUTTER_CYCLE;
      const period = Math.max(0.001, cyc.warningS + cyc.surgeS + cyc.calmS);
      const t = reduced ? 0.25 : (elapsed % period) / period;
      cutter.position.x = -len / 2 + 8 + (len - 16) * t;
      const hot = clock.phase === 'surge' ? 1.3 : clock.phase === 'warning' ? 0.9 : 0.55;
      seam.emissiveIntensity = calmFlash ? Math.min(hot, 0.85) : hot;
    },
  };
}

/** Crusher press: jaw plate slams pos→anvil on the authored warning/surge/calm clock. */
function buildCrusherPress(toy, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.emberMat, sink);
  const root = new THREE.Group();
  root.name = 'law_crusher';
  const px = toy.pos.x, pz = toy.pos.z;
  const dir = toy.dir && Number.isFinite(toy.dir.x) ? toy.dir : { x: 1, z: 0 };
  const yaw = -Math.atan2(dir.z, dir.x); // local +X runs jaw->anvil
  const anvil = toy.anvil || { x: px + dir.x * 30, z: pz + dir.z * 30 };
  const stroke = Math.max(6, Math.hypot(anvil.x - px, anvil.z - pz));
  root.position.set(px, 0, pz);
  root.rotation.y = yaw;

  // Guide rails the jaw rides, plus the anvil block it kills against.
  for (const side of [-1, 1]) {
    const rail = mesh(shared.boxGeo, shared.metalMat, 'law_crusher_rail');
    rail.scale.set(stroke + 26, 3.5, 3.5);
    rail.position.set(stroke / 2 + 8, 4, side * 16);
    root.add(rail);
  }
  const anvilBlock = mesh(shared.boxGeo, shared.darkMat, 'law_crusher_anvil');
  anvilBlock.scale.set(10, 18, 44);
  anvilBlock.position.set(stroke + 8, 7, 0);
  root.add(anvilBlock);
  const jaw = new THREE.Group();
  jaw.name = 'law_crusher_jaw';
  const face = mesh(shared.boxGeo, shared.plateMat, 'law_crusher_face');
  face.scale.set(8, 16, 40);
  face.position.y = 7;
  jaw.add(face);
  const seamMesh = mesh(shared.boxGeo, seam, 'law_crusher_seam');
  seamMesh.scale.set(1.4, 12, 34);
  seamMesh.position.set(4.6, 7, 0);
  jaw.add(seamMesh);
  for (const side of [-1, 1]) {
    const ram = mesh(shared.cylGeo, shared.metalMat, 'law_crusher_ram');
    ram.rotation.z = Math.PI / 2; // cylinder axis -> local X
    ram.scale.set(3, 26, 3);
    ram.position.set(-14, 7, side * 12);
    jaw.add(ram);
  }
  root.add(jaw);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash) {
      // crusherPhase returns { phase, strength, remainingS } — phase progress derives from the
      // authored cycle (toy.cycle or CRUSHER_CYCLE) minus what remains.
      const clock = crusherPhase(toy, elapsed);
      const cyc = toy.cycle || CRUSHER_CYCLE;
      let travel;
      if (clock.phase === 'surge') {
        const progressed = Math.max(0, cyc.surgeS - clock.remainingS) / Math.max(0.001, cyc.surgeS);
        travel = Math.min(1, progressed / JAW_SLAM_FRAC);
      } else if (clock.phase === 'calm') {
        travel = Math.max(0, Math.min(1, clock.remainingS / Math.max(0.001, cyc.calmS)));
      } else {
        travel = 0; // warning: cocked open, seam climbing
      }
      jaw.position.x = travel * stroke;
      seam.emissiveIntensity = calmFlash
        ? 0.8
        : clock.phase === 'warning'
          ? 0.4 + 0.8 * Math.max(0, Math.min(1, 1 - clock.remainingS / Math.max(0.001, cyc.warningS)))
          : clock.phase === 'surge' ? 1.35 : 0.5;
    },
  };
}

/** Current mouth: the gate the cone current pours from — two baffles + a driven roller. */
function buildCurrentMouth(toy, isCinder, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.emberMat, sink);
  const root = new THREE.Group();
  root.name = 'law_current_mouth';
  const dir = toy.dir && Number.isFinite(toy.dir.x) ? toy.dir : { x: 1, z: 0 };
  root.position.set(toy.center.x, 0, toy.center.z);
  root.rotation.y = -Math.atan2(dir.z, dir.x); // local +X points downstream

  // Flume: two angled baffle plates forming a throat that opens downstream.
  for (const side of [-1, 1]) {
    const baffle = mesh(shared.boxGeo, shared.darkMat, 'law_mouth_baffle');
    baffle.scale.set(46, 9, 5);
    baffle.position.set(-6, 5.5, side * 17);
    baffle.rotation.y = side * 0.30; // flare outward toward +X
    root.add(baffle);
  }
  const sill = mesh(shared.boxGeo, shared.metalMat, 'law_mouth_sill');
  sill.scale.set(30, 3, 34);
  sill.position.set(-10, 1.5, 0);
  root.add(sill);
  const throat = mesh(shared.boxGeo, seam, 'law_mouth_throat');
  throat.scale.set(2.2, 4.5, 26);
  throat.position.set(-14, 5, 0);
  root.add(throat);
  const roller = mesh(shared.cylGeo, shared.metalMat, 'law_mouth_roller');
  roller.rotation.x = Math.PI / 2; // cylinder axis -> local Z (across the throat)
  roller.scale.set(4.5, 26, 4.5);
  roller.position.set(-14, 9.5, 0);
  root.add(roller);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash) {
      // Cinder's machinery cycle IS the law clock; lagrange's little current toys run steady.
      const clock = isCinder ? stepCinderMachinery(elapsed) : { phase: 'surge', strength: 1 };
      const driving = clock.strength > 0;
      roller.rotation.y += (reduced ? MOUTH_ROLLER_RATE_REDUCED : MOUTH_ROLLER_RATE)
        * (driving ? 1 : 0.15) * dt;
      seam.emissiveIntensity = calmFlash
        ? 0.8
        : clock.phase === 'surge' ? 1.3 : clock.phase === 'warning' ? 0.7 : 0.35;
    },
  };
}

// ---------------------------------------------------------------------------
// PQ-133.09 — Cryo Drift + Storm Lattice room machinery.
// ---------------------------------------------------------------------------

/** Cryo coolant tank / heat manifold — the portable pockets the quadrant law reads. */
function buildCryoProp(pos, isHeat, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(isHeat ? shared.emberMat : shared.tideMat, sink);
  const root = new THREE.Group();
  root.name = isHeat ? 'cryo_manifold' : 'cryo_tank';
  root.position.set(pos.x, 0, pos.z);
  const cradle = mesh(shared.boxGeo, shared.darkMat, 'cryo_prop_cradle');
  cradle.scale.set(40, 4, 26);
  cradle.position.y = 2;
  root.add(cradle);
  if (isHeat) {
    // Heat manifold: a vertical vent stack — fins climbing out of the bay.
    const stack = new THREE.Group();
    stack.name = 'cryo_manifold_stack';
    for (let i = 0; i < 4; i++) {
      const fin = mesh(shared.boxGeo, i % 2 ? shared.metalMat : shared.darkMat, 'cryo_manifold_fin');
      fin.scale.set(26 - i * 4, 3.2, 20 - i * 3);
      fin.position.y = 6 + i * 5;
      fin.rotation.y = i * 0.35;
      stack.add(fin);
    }
    root.add(stack);
    const glow = mesh(shared.boxGeo, seam, 'cryo_manifold_glow');
    glow.scale.set(2, 26, 2);
    glow.position.y = 15;
    root.add(glow);
    return {
      root,
      mover(elapsed, dt, reduced, calmFlash, pulse, simNow) {
        stack.rotation.y += (reduced ? 0.05 : 0.18) * dt;
        seam.emissiveIntensity = calmFlash ? 0.85 : 1.0 + pulse * 0.5;
      },
    };
  }
  // Coolant tank: a horizontal drum on the cradle with a slow-turning vent collar.
  const drum = mesh(shared.cylGeo, shared.metalMat, 'cryo_tank_drum');
  drum.rotation.z = Math.PI / 2; // axis -> X
  drum.scale.set(11, 34, 11);
  drum.position.y = 13;
  root.add(drum);
  for (const side of [-1, 1]) {
    const cap = mesh(shared.cylGeo, shared.darkMat, 'cryo_tank_cap');
    cap.rotation.z = Math.PI / 2;
    cap.scale.set(12.5, 3, 12.5);
    cap.position.set(side * 18, 13, 0);
    root.add(cap);
  }
  const collar = mesh(shared.torusGeo, seam, 'cryo_tank_collar');
  collar.rotation.y = Math.PI / 2; // ring in the YZ plane
  collar.scale.setScalar(13);
  collar.position.set(0, 13, 0);
  root.add(collar);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse) {
      collar.rotation.x += (reduced ? 0.05 : 0.2) * dt;
      seam.emissiveIntensity = calmFlash ? 0.8 : 0.9 + pulse * 0.4;
    },
  };
}

/** Bank plate: a tilted plate the wave can kick — pos + normal + halfWidth. */
function buildBankPlate(toy, sink) {
  const shared = sharedAssets();
  const isHeat = toy.id === 'heat_plate';
  const seam = cloneEmissive(isHeat ? shared.emberMat : shared.tideMat, sink);
  const root = new THREE.Group();
  root.name = `law_plate_${toy.id}`;
  root.position.set(toy.pos.x, 0, toy.pos.z);
  const n = toy.normal && Number.isFinite(toy.normal.x) ? toy.normal : { x: 0, z: 1 };
  root.rotation.y = -Math.atan2(n.z, n.x); // local +Z faces the incoming body
  const half = Math.max(6, Number.isFinite(toy.halfWidth) ? toy.halfWidth : 28);
  const plate = mesh(shared.boxGeo, shared.plateMat, 'law_plate_face');
  plate.scale.set(2.5, 16, half * 2);
  plate.position.set(0, 9, 0);
  plate.rotation.z = -0.42; // leaned back, like a banked wall
  root.add(plate);
  const edge = mesh(shared.boxGeo, seam, 'law_plate_edge');
  edge.scale.set(1.2, 2.2, half * 2);
  edge.position.set(2.4, 15.5, 0);
  edge.rotation.z = -0.42;
  root.add(edge);
  const foot = mesh(shared.boxGeo, shared.darkMat, 'law_plate_foot');
  foot.scale.set(14, 3, half * 2 + 8);
  foot.position.set(-4, 1.5, 0);
  root.add(foot);
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse) {
      seam.emissiveIntensity = calmFlash ? 0.7 : 0.55 + pulse * 0.35;
    },
  };
}

/**
 * Cryo quadrant frame: the thermal map is world-axis-aligned through `at` (cryoQuadrantKey),
 * so the room's law is drawn as two crossing rails plus a corner post per quadrant tinted by
 * the phase's thermal map, and the insulated island as a squat drum skirt at the centre.
 */
function buildCryoRoomFrame(roomSpec, sink) {
  const shared = sharedAssets();
  const root = new THREE.Group();
  root.name = 'cryo_frame';
  const at = roomSpec.at || { x: 0, z: 0 };
  const fieldR = Math.max(60, Number.isFinite(roomSpec.fieldRadius) ? roomSpec.fieldRadius : 420);
  root.position.set(at.x, 0, at.z);
  const parts = { root };

  for (const yaw of [0, Math.PI / 2]) {
    const rail = mesh(shared.boxGeo, shared.darkMat, 'cryo_frame_rail');
    rail.scale.set(fieldR * 2, 1.6, 2.6);
    rail.position.y = 0.8;
    rail.rotation.y = yaw;
    root.add(rail);
  }

  // Insulated island skirt: the safe center the freeze never reaches.
  const islandR = Number.isFinite(roomSpec.islandRadius) ? roomSpec.islandRadius : 48;
  const island = mesh(shared.cylGeo, shared.metalMat, 'cryo_island');
  island.scale.set(islandR, 5, islandR);
  island.position.y = 2.5;
  root.add(island);
  const islandRim = mesh(shared.torusGeo, shared.plateMat, 'cryo_island_rim');
  islandRim.rotation.x = Math.PI / 2;
  islandRim.scale.setScalar(islandR);
  islandRim.position.y = 5;
  root.add(islandRim);

  // One corner post per quadrant, emissive-tinted by the authored thermal map.
  const posts = [];
  const thermal = roomSpec.thermal || {};
  const keys = ['nw', 'ne', 'sw', 'se'];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // cryoQuadrantKey puts nw/ne at +z. That is player north — the top of the flight view.
    const sx = key === 'ne' || key === 'se' ? 1 : -1;
    const sz = key === 'nw' || key === 'ne' ? 1 : -1;
    const post = new THREE.Group();
    post.name = `cryo_post_${key}`;
    post.position.set(sx * fieldR * 0.5, 0, sz * fieldR * 0.5);
    const mast = mesh(shared.boxGeo, shared.darkMat, 'cryo_post_mast');
    mast.scale.set(7, 30, 7);
    mast.position.y = 15;
    post.add(mast);
    const lampMat = cloneEmissive(
      thermal[key] === 'hot' ? shared.emberMat : shared.tideMat, sink);
    const lamp = mesh(shared.cylGeo, lampMat, 'cryo_post_lamp');
    lamp.scale.set(4, 3, 4);
    lamp.position.y = 32;
    post.add(lamp);
    root.add(post);
    posts.push({ post, lampMat, hot: thermal[key] === 'hot' });
  }
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse, simNow) {
      for (let i = 0; i < posts.length; i++) {
        const entry = posts[i];
        entry.lampMat.emissiveIntensity = calmFlash
          ? 0.75
          : (entry.hot ? 1.1 : 0.85) + (reduced ? 0 : pulse * 0.4);
      }
    },
  };
}

/** Storm conductor pylon: mast + coil ring — a node of the conductivity graph. */
function buildStormPylon(node, index, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.tideMat, sink);
  const root = new THREE.Group();
  root.name = `storm_pylon_${node.id || index}`;
  root.position.set(node.pos.x, 0, node.pos.z);
  const foot = mesh(shared.cylGeo, shared.darkMat, 'storm_pylon_foot');
  foot.scale.set(16, 4, 16);
  foot.position.y = 2;
  root.add(foot);
  const mast = mesh(shared.cylGeo, shared.metalMat, 'storm_pylon_mast');
  mast.scale.set(4.5, 44, 4.5);
  mast.position.y = 24;
  root.add(mast);
  const coil = mesh(shared.torusGeo, seam, 'storm_pylon_coil');
  coil.rotation.x = Math.PI / 2;
  coil.scale.setScalar(11);
  coil.position.y = 46;
  root.add(coil);
  const crown = mesh(shared.cylGeo, shared.plateMat, 'storm_pylon_crown');
  crown.scale.set(7, 4, 7);
  crown.position.y = 50;
  root.add(crown);
  const phase = index * 0.7;
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse, simNow) {
      coil.rotation.z += (reduced ? 0.06 : 0.3) * dt;
      seam.emissiveIntensity = calmFlash
        ? 0.7
        : 0.7 + (reduced ? 0 : 0.45 * Math.max(0, Math.sin(simNow * 2.2 + phase)));
    },
  };
}

/**
 * Storm relay: a buoy that rides the same orbit the sim computes. The pose math mirrors
 * `orbitNodePose` (combat/orbitNodes.js) term-for-term on the authored storm constants —
 * inline so the render loop allocates nothing, and exact so the buoy IS the conductive pose.
 */
function buildStormRelay(at, index, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.amberMat, sink);
  const root = new THREE.Group();
  root.name = `storm_relay_${index}`;
  const body = mesh(shared.cylGeo, shared.darkMat, 'storm_relay_body');
  body.scale.set(7, 8, 7);
  body.position.y = 8;
  root.add(body);
  const coil = mesh(shared.torusGeo, seam, 'storm_relay_coil');
  coil.rotation.x = Math.PI / 2;
  coil.scale.setScalar(8.5);
  coil.position.y = 14;
  root.add(coil);
  const mast = mesh(shared.boxGeo, shared.metalMat, 'storm_relay_mast');
  mast.scale.set(2.4, 18, 2.4);
  mast.position.y = 16;
  root.add(mast);
  const spark = mesh(shared.boxGeo, seam, 'storm_relay_spark');
  spark.scale.set(1.4, 5, 1.4);
  spark.position.y = 27;
  root.add(spark);
  const basePhase = (index / STORM_RELAY_COUNT) * Math.PI * 2;
  return {
    root,
    mover(elapsed, dt, reduced, calmFlash, pulse, simNow) {
      // orbitNodePose(host, index, count, radius, simTime, periodTicks) — same arithmetic:
      // phase = (i/n)·τ + (simTime·60/periodTicks)·τ ; pos = host + r·(cos,sin).
      const phase = basePhase
        + ((Math.max(0, simNow || elapsed) * 60) / STORM_RELAY_PERIOD) * Math.PI * 2;
      root.position.set(
        at.x + Math.cos(phase) * STORM_RELAY_ORBIT,
        0,
        at.z + Math.sin(phase) * STORM_RELAY_ORBIT,
      );
      coil.rotation.z += (reduced ? 0.15 : 0.8) * dt;
      seam.emissiveIntensity = calmFlash
        ? 0.7
        : 0.75 + (reduced ? 0 : 0.4 * Math.sin(simNow * RELAY_SPARK_RATE + index));
    },
  };
}

/** Static conductor wire between two graph nodes — a drawn edge of the lattice. */
function buildConductorWire(aPos, bPos, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.tideMat, sink);
  const len = Math.max(2, Math.hypot(bPos.x - aPos.x, bPos.z - aPos.z));
  const wire = mesh(shared.boxGeo, seam, 'storm_wire');
  wire.scale.set(len, 0.7, 0.7);
  wire.position.set((aPos.x + bPos.x) / 2, 42, (aPos.z + bPos.z) / 2);
  wire.rotation.y = -Math.atan2(bPos.z - aPos.z, bPos.x - aPos.x);
  return {
    root: wire,
    mover(elapsed, dt, reduced, calmFlash, pulse, simNow) {
      seam.emissiveIntensity = calmFlash
        ? 0.45
        : 0.35 + (reduced ? 0 : 0.2 * Math.sin(simNow * 3.1 + aPos.x * 0.01));
    },
  };
}

// ---------------------------------------------------------------------------
// Boss dressing — role assemblies over the shared dreadnought hull (+X local is the nose).
// ---------------------------------------------------------------------------

function bossDressingKindFor(entity) {
  const kind = entity && entity.data && entity.data.bossDressing && entity.data.bossDressing.kind;
  return BOSS_DRESSING_KINDS.has(kind) ? kind : null;
}

/** Tidal Engine: two counter-rotating vane drums riding the spine — the room's law on the hull. */
function buildTidalVanes(radiusWu, sink) {
  const shared = sharedAssets();
  const seamMat = cloneEmissive(shared.tideMat, sink);
  const group = new THREE.Group();
  group.name = 'tidal_engine_dressing';
  const drums = [];
  const drumGeo = shared.cylGeo;
  for (const xOff of [0.34, -0.18]) {
    const drum = new THREE.Group();
    drum.name = 'tidal_vane_drum';
    drum.position.set(radiusWu * xOff, radiusWu * 0.52, 0);
    const core = mesh(drumGeo, shared.darkMat, 'tidal_vane_core');
    core.rotation.z = Math.PI / 2; // axis -> X (nose axis)
    const r = radiusWu * 0.30;
    core.scale.set(0.10 * radiusWu, r, r);
    drum.add(core);
    for (let i = 0; i < 6; i++) {
      const paddle = mesh(shared.boxGeo, shared.plateMat, 'tidal_vane_paddle');
      const a = (i / 6) * Math.PI * 2;
      paddle.position.set(0, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02);
      paddle.rotation.x = a;
      paddle.scale.set(radiusWu * 0.07, radiusWu * 0.16, radiusWu * 0.05);
      drum.add(paddle);
      const tip = mesh(shared.boxGeo, seamMat, 'tidal_vane_tip');
      tip.scale.set(1.1, 0.14, 0.9);
      tip.position.y = 0.55;
      paddle.add(tip);
    }
    group.add(drum);
    drums.push({ drum, dir: drums.length === 0 ? 1 : -1 });
  }
  const seam = mesh(shared.torusGeo, seamMat, 'tidal_engine_seam');
  seam.rotation.y = Math.PI / 2;
  seam.position.set(radiusWu * 0.06, radiusWu * 0.1, 0);
  seam.scale.setScalar(radiusWu * 0.42);
  group.add(seam);
  return { group, drums, seamMat };
}

/** Chain Tug: twin aft winch drums + a hoist beam — the room's drag made hardware. */
function buildChainTug(radiusWu, sink) {
  const shared = sharedAssets();
  const seamMat = cloneEmissive(shared.amberMat, sink);
  const group = new THREE.Group();
  group.name = 'chain_tug_dressing';
  const drums = [];
  for (const side of [-1, 1]) {
    const drum = new THREE.Group();
    drum.name = 'chain_winch_drum';
    drum.position.set(radiusWu * -0.34, radiusWu * 0.30, side * radiusWu * 0.34);
    const spool = mesh(shared.cylGeo, shared.metalMat, 'chain_winch_spool');
    spool.rotation.x = Math.PI / 2; // axis -> Z (lateral)
    const r = radiusWu * 0.13;
    spool.scale.set(r, radiusWu * 0.16, r);
    drum.add(spool);
    // Chain wrap on the spool: a torus + a row of links running aft off it.
    const wrap = mesh(shared.torusGeo, shared.darkMat, 'chain_winch_wrap');
    wrap.scale.set(r * 1.12, r * 1.12, radiusWu * 0.05);
    drum.add(wrap);
    group.add(drum);
    drums.push({ drum, dir: side });
  }
  const beam = mesh(shared.boxGeo, shared.darkMat, 'chain_tug_beam');
  beam.scale.set(radiusWu * 0.10, radiusWu * 0.08, radiusWu * 0.78);
  beam.position.set(radiusWu * -0.34, radiusWu * 0.44, 0);
  group.add(beam);
  const hook = mesh(shared.boxGeo, shared.plateMat, 'chain_tug_hook');
  hook.scale.set(radiusWu * 0.09, radiusWu * 0.22, radiusWu * 0.09);
  hook.position.set(radiusWu * -0.42, radiusWu * 0.12, 0);
  group.add(hook);
  const seam = mesh(shared.boxGeo, seamMat, 'chain_tug_seam');
  seam.scale.set(radiusWu * 0.05, radiusWu * 0.03, radiusWu * 0.6);
  seam.position.set(radiusWu * -0.34, radiusWu * 0.49, 0);
  group.add(seam);
  return { group, drums, seamMesh: seam, seamMat, hook };
}

/**
 * Manifold Warden (Cryo): four coolant-arm assemblies on a collar ring around the spine —
 * `arms: 4`, `method: 'tumbling_subsystems'`. Each arm carries a tank pod and gimbals on its
 * own phase while the collar rolls; the cold/hot split seam reads the room's two zones.
 */
function buildManifoldWarden(radiusWu, sink) {
  const shared = sharedAssets();
  const coldSeam = cloneEmissive(shared.tideMat, sink);
  const hotSeam = cloneEmissive(shared.emberMat, sink);
  const group = new THREE.Group();
  group.name = 'manifold_warden_dressing';
  const collar = new THREE.Group();
  collar.name = 'manifold_collar';
  collar.position.set(radiusWu * 0.08, radiusWu * 0.5, 0);
  group.add(collar);
  const ring = mesh(shared.torusGeo, shared.darkMat, 'manifold_collar_ring');
  ring.rotation.y = Math.PI / 2; // ring faces the nose axis
  ring.scale.setScalar(radiusWu * 0.5);
  collar.add(ring);
  const arms = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.name = 'manifold_arm';
    arm.rotation.x = a;
    collar.add(arm);
    const boom = mesh(shared.boxGeo, shared.metalMat, 'manifold_boom');
    boom.scale.set(radiusWu * 0.05, radiusWu * 0.30, radiusWu * 0.05);
    boom.position.y = radiusWu * 0.62;
    arm.add(boom);
    const pod = mesh(shared.cylGeo, shared.darkMat, 'manifold_pod');
    pod.scale.set(radiusWu * 0.075, radiusWu * 0.16, radiusWu * 0.075);
    pod.position.y = radiusWu * 0.80;
    arm.add(pod);
    const tip = mesh(shared.boxGeo, i % 2 ? hotSeam : coldSeam, 'manifold_tip');
    tip.scale.set(radiusWu * 0.06, radiusWu * 0.05, radiusWu * 0.06);
    tip.position.y = radiusWu * 0.92;
    arm.add(tip);
    arms.push({ arm, phase: a });
  }
  const seam = mesh(shared.torusGeo, coldSeam, 'manifold_seam');
  seam.rotation.y = Math.PI / 2;
  seam.position.set(radiusWu * -0.3, radiusWu * 0.1, 0);
  seam.scale.setScalar(radiusWu * 0.34);
  group.add(seam);
  const drums = [{ drum: collar, dir: 1 }];
  return {
    group, drums, seamMat: coldSeam,
    tick(rec, simTime, dt, reduced, calmFlash) {
      // Tumbling subsystems: each arm gimbals on its own phase; the hot tips breathe
      // counter-phase against the cold seam the generic driver writes.
      const rate = reduced ? 0.15 : GIMBAL_RATE;
      for (let i = 0; i < arms.length; i++) {
        arms[i].arm.rotation.x = arms[i].phase + Math.sin(simTime * rate + arms[i].phase) * 0.3;
      }
      hotSeam.emissiveIntensity = calmFlash
        ? 0.6
        : 0.55 + 0.35 * Math.max(0, Math.sin(simTime * 1.7 + Math.PI));
    },
  };
}

/**
 * Grid Tyrant (Storm): a conductor mast on the spine plus a ring of four relay drones
 * orbiting the hull — `drones: 4`, `method: 'thrown_mass'`. The ring is the room's lattice
 * carried as a body.
 */
function buildGridTyrant(radiusWu, sink) {
  const shared = sharedAssets();
  const seamMat = cloneEmissive(shared.amberMat, sink);
  const group = new THREE.Group();
  group.name = 'grid_tyrant_dressing';
  const mast = mesh(shared.cylGeo, shared.metalMat, 'tyrant_mast');
  mast.scale.set(radiusWu * 0.05, radiusWu * 0.5, radiusWu * 0.05);
  mast.position.set(radiusWu * 0.12, radiusWu * 0.6, 0);
  group.add(mast);
  const crown = mesh(shared.torusGeo, seamMat, 'tyrant_crown');
  crown.rotation.x = Math.PI / 2;
  crown.scale.setScalar(radiusWu * 0.16);
  crown.position.set(radiusWu * 0.12, radiusWu * 0.88, 0);
  group.add(crown);
  const ringGroup = new THREE.Group();
  ringGroup.name = 'tyrant_drone_ring';
  ringGroup.position.set(radiusWu * -0.05, radiusWu * 0.4, 0);
  group.add(ringGroup);
  const drones = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.x = a;
    ringGroup.add(holder);
    const drone = mesh(shared.boxGeo, shared.darkMat, 'tyrant_drone');
    const r = radiusWu * 0.55;
    drone.scale.set(radiusWu * 0.09, radiusWu * 0.09, radiusWu * 0.09);
    drone.position.y = r;
    holder.add(drone);
    const lamp = mesh(shared.boxGeo, seamMat, 'tyrant_drone_lamp');
    lamp.scale.set(0.35, 0.35, 0.35);
    lamp.position.y = r * 1.15;
    holder.add(lamp);
    drones.push({ holder, drone, phase: a });
  }
  const drums = [{ drum: ringGroup, dir: 1 }];
  return {
    group, drums, seamMat,
    tick(rec, simTime, dt, reduced) {
      const rate = reduced ? 0.4 : 1.4;
      for (let i = 0; i < drones.length; i++) {
        drones[i].drone.rotation.x += rate * dt;
        drones[i].drone.rotation.y += rate * 0.6 * dt;
      }
    },
  };
}

/**
 * Seam Crusher (Asteroid Mill): the grind pair worn as hardware — two opposed mill wheels
 * riding the flanks, teeth on the rims, an ore train marching the trough between them into
 * the grind. `method: 'thrown_mass'` — the room hurls the mass; the boss carries the mill
 * that fed it.
 */
function buildSeamCrusher(radiusWu, sink) {
  const shared = sharedAssets();
  const seamMat = cloneEmissive(shared.emberMat, sink);
  const group = new THREE.Group();
  group.name = 'seam_crusher_dressing';
  const drums = [];
  for (const side of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.name = 'seam_grind_wheel';
    wheel.position.set(radiusWu * -0.06, radiusWu * 0.4, side * radiusWu * 0.5);
    const cone = mesh(shared.cylGeo, shared.metalMat, 'seam_grind_cone');
    cone.rotation.x = Math.PI / 2; // cylinder axis -> Z: the wheel face stands outboard
    cone.scale.set(radiusWu * 0.24, radiusWu * 0.09, radiusWu * 0.24);
    wheel.add(cone);
    const face = mesh(shared.cylGeo, shared.darkMat, 'seam_grind_face');
    face.rotation.x = Math.PI / 2;
    face.scale.set(radiusWu * 0.15, radiusWu * 0.12, radiusWu * 0.15);
    face.position.z = side * radiusWu * 0.04;
    wheel.add(face);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tooth = mesh(shared.boxGeo, shared.plateMat, 'seam_grind_tooth');
      tooth.position.set(Math.cos(a) * radiusWu * 0.2, Math.sin(a) * radiusWu * 0.2, 0);
      tooth.rotation.z = a;
      tooth.scale.set(radiusWu * 0.07, radiusWu * 0.05, radiusWu * 0.1);
      wheel.add(tooth);
    }
    group.add(wheel);
    // Opposed turn — the room's two grind cones are written as counter-pushing currents,
    // so the wheels the boss carries counter-rotate too.
    drums.push({ drum: wheel, axis: 'z', dir: side });
  }
  // The ore train: a trough of broken rock riding the spine — the seam feeding itself.
  const trough = mesh(shared.boxGeo, shared.darkMat, 'seam_ore_trough');
  trough.scale.set(radiusWu * 0.86, radiusWu * 0.05, radiusWu * 0.18);
  trough.position.set(radiusWu * 0.02, radiusWu * 0.14, 0);
  group.add(trough);
  const oreTrain = new THREE.Group();
  oreTrain.name = 'seam_ore_train';
  oreTrain.position.copy(trough.position);
  group.add(oreTrain);
  const ore = [];
  for (let i = 0; i < 5; i++) {
    const lump = mesh(shared.boxGeo, i % 2 ? shared.plateMat : shared.darkMat, 'seam_ore_lump');
    lump.scale.set(radiusWu * 0.05, radiusWu * 0.045, radiusWu * 0.05);
    lump.position.y = radiusWu * 0.05;
    oreTrain.add(lump);
    ore.push({ lump, u: i / 5 });
  }
  const seam = mesh(shared.torusGeo, seamMat, 'seam_crusher_seam');
  seam.rotation.y = Math.PI / 2;
  seam.position.set(radiusWu * -0.3, radiusWu * 0.12, 0);
  seam.scale.setScalar(radiusWu * 0.32);
  group.add(seam);
  return {
    group, drums, seamMat,
    tick(rec, simTime, dt, reduced) {
      // Ore lumps march aft-to-nose down the trough and tumble — the mill at work.
      const rate = reduced ? 0.05 : 0.18;
      for (const o of ore) {
        o.u = (o.u + rate * dt) % 1;
        o.lump.position.x = radiusWu * (-0.42 + o.u * 0.84);
        o.lump.rotation.x += dt * (reduced ? 0.4 : 1.3);
        o.lump.rotation.y += dt * (reduced ? 0.25 : 0.8);
      }
    },
  };
}

/**
 * Queen Warden (the Hive): the brood heart riding the hull — a clutch of sacs amidships
 * swelling off-phase (the room's breath worn as organs), a ring of attendant pods orbiting
 * the spine, and the green seam the walls bleed. `method: 'machinery'` — the living room
 * is the machine; the warden carries its working set.
 */
function buildQueenWarden(radiusWu, sink) {
  const shared = sharedAssets();
  const seamMat = cloneEmissive(shared.broodMat, sink);
  const group = new THREE.Group();
  group.name = 'queen_warden_dressing';

  // The sac clutch amidships: three organ pods bulging off a collar — the brood heart.
  const clutch = new THREE.Group();
  clutch.name = 'queen_sac_clutch';
  clutch.position.set(radiusWu * 0.04, radiusWu * 0.46, 0);
  group.add(clutch);
  const collar = mesh(shared.torusGeo, shared.darkMat, 'queen_clutch_collar');
  collar.rotation.y = Math.PI / 2;
  collar.scale.setScalar(radiusWu * 0.34);
  clutch.add(collar);
  const sacs = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const sac = mesh(shared.cylGeo, shared.darkMat, 'queen_sac');
    const r = radiusWu * (0.13 + (i === 0 ? 0.03 : 0));
    sac.scale.set(r, radiusWu * 0.2, r);
    sac.position.set(0, Math.cos(a) * radiusWu * 0.3, Math.sin(a) * radiusWu * 0.3);
    sac.rotation.x = a; // pod axis points radially out of the collar ring
    clutch.add(sac);
    const glow = mesh(shared.cylGeo, seamMat, 'queen_sac_glow');
    // Child of the scaled sac: unit-local coords, a cap just past the pod's outer face.
    glow.scale.set(0.4, 0.14, 0.4);
    glow.position.y = 0.55;
    sac.add(glow);
    sacs.push({ sac, phase: i * 2.1, baseY: sac.scale.y });
  }

  // Attendant pods on a slow ring — the warden's honour brood riding the hull.
  const ringGroup = new THREE.Group();
  ringGroup.name = 'queen_attendant_ring';
  ringGroup.position.set(radiusWu * -0.1, radiusWu * 0.38, 0);
  group.add(ringGroup);
  const attendants = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.x = a;
    ringGroup.add(holder);
    const pod = mesh(shared.cylGeo, shared.darkMat, 'queen_attendant');
    const r = radiusWu * 0.55;
    pod.scale.set(radiusWu * 0.07, radiusWu * 0.11, radiusWu * 0.07);
    pod.position.y = r;
    holder.add(pod);
    const tip = mesh(shared.cylGeo, seamMat, 'queen_attendant_glow');
    tip.scale.set(radiusWu * 0.028, radiusWu * 0.03, radiusWu * 0.028);
    tip.position.y = r * 1.12;
    holder.add(tip);
    attendants.push({ pod, phase: a });
  }
  const drums = [{ drum: ringGroup, dir: 1 }];
  const seam = mesh(shared.torusGeo, seamMat, 'queen_warden_seam');
  seam.rotation.y = Math.PI / 2;
  seam.position.set(radiusWu * -0.34, radiusWu * 0.12, 0);
  seam.scale.setScalar(radiusWu * 0.36);
  group.add(seam);
  return {
    group, drums, seamMat,
    tick(rec, simTime, dt, reduced, calmFlash) {
      // Seething: every sac breathes off-phase; attendants bob on their berths.
      const rate = reduced ? 0.5 : SAC_PULSE_RATE;
      for (const s of sacs) {
        const swell = 1 + (reduced ? 0.04 : 0.16) * Math.sin(simTime * rate + s.phase);
        s.sac.scale.y = s.baseY * swell;
      }
      for (const a of attendants) {
        a.pod.position.y = radiusWu * (0.55 + 0.035 * Math.sin(simTime * rate * 0.8 + a.phase));
      }
      void calmFlash;
    },
  };
}

const BOSS_BUILDERS = {
  tidal_engine: buildTidalVanes,
  chain_tug: buildChainTug,
  manifold_warden: buildManifoldWarden,
  grid_tyrant: buildGridTyrant,
  seam_crusher: buildSeamCrusher,
  queen_warden: buildQueenWarden,
};

// Per-kind [normal, reduced] drum rates — the kind's own motion signature. Kinds absent
// here ride the default vane rates (tidal_engine, manifold_warden both do).
const VANE_SPIN = Object.freeze([VANE_RATE, VANE_RATE_REDUCED]);
const BOSS_SPIN_RATES = Object.freeze({
  chain_tug: Object.freeze([WINCH_RATE, WINCH_RATE_REDUCED]),
  grid_tyrant: Object.freeze([ORBIT_RATE, ORBIT_RATE * 0.3]),
  seam_crusher: Object.freeze([GRIND_RATE, GRIND_RATE_REDUCED]),
  queen_warden: Object.freeze([BROOD_ORBIT_RATE, BROOD_ORBIT_RATE_REDUCED]),
});

function driveBossDrums(rec) {
  for (const d of rec.drums) {
    d.drum.rotation[d.axis || 'x'] = rec.spinAngle * d.dir + (d.phase || 0);
  }
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

// ---------------------------------------------------------------------------
// Elite affix marks (SWARM-06 §6.4) — the stamped trick, worn as hardware.
//
// swarmElites stamps data.swarmAffix (and data.swarmAffix2 on the veteran band); this layer
// hangs a distinct little machine on the spine per stamp so mid-chaos the trick is read off
// the hull, not off a wave banner. Same lifecycle as the boss dressing above: lazy bind
// under mesh.userData.hull, build-in, idle motion on sim time, fling release on kill, mesh
// rebind, prune. A champion boss can carry both — the records run side by side. Only
// entity-backed bodies ever carry affixes (the stamp pass never reaches the buffer-drawn
// brood), so a mesh-bound mark covers every hull the trick can land on.
//
// The silhouette carries the identity; the law hues back it:
//   shielded  — a squat dome with a cold rim, the bubble's wall made metal   (tide cyan)
//   splitter  — twin pods on a yoke, the two wasps it becomes                (brood green)
//   volatile  — a charge drum with a hot collar; the drum shivers            (ember)
//   magnetic  — a two-prong claw that pinches over the field                 (tide cyan — the drag hue)
//   commander — a mast, pennant and rally lamp                               (brood green — feeds the cohort)
//   hasted    — swept fins raked aft with hot tips                           (ember — it runs hot)
// A veteran's pair is joined by a dark collar so two tricks read as double-marked at a
// glance. Mark meshes ride the 'sf-swarm-threat' name prefix on purpose: that is the
// hostile repaint's own exemption in tintSwarmHostileHull — without it a re-tint pass
// (LOD child swap) would crimson the seams and erase the per-affix hue the mark carries.
// ---------------------------------------------------------------------------

const AFFIX_MARK_ROOT = 'sf-swarm-threat-affix';
const AFFIX_VETERAN_BAND_NAME = 'sf-swarm-threat-affix-band';
// Spine anchors in radiusWu fractions: the primary rides forward, the veteran second rides
// aft — a late second stamp never shifts the primary's mark.
const AFFIX_ANCHOR_PRIMARY = 0.26;
const AFFIX_ANCHOR_SECOND = -0.38;
const AFFIX_MARK_DECK = 0.55;       // deck height the marks mount at
const AFFIX_MARK_DECK_VETERAN = 0.5;
const AFFIX_VOLATILE_SHIVER = 21;   // the charge's nervous tremble (rad·s⁻¹)

/** Shielded: the bubble's wall made metal — a squat dome with a cold rim at its foot. */
function buildAffixShielded(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.tideMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-shielded';
  const rim = mesh(shared.torusGeo, seam, 'sf-swarm-threat-affix-shielded-rim');
  rim.rotation.x = Math.PI / 2; // ring lies flat — the wall's foundation
  rim.scale.setScalar(r * 0.2);
  rim.position.y = -r * 0.05;
  group.add(rim);
  const dome = mesh(shared.cylGeo, shared.darkMat, 'sf-swarm-threat-affix-shielded-dome');
  dome.scale.set(r * 0.16, r * 0.11, r * 0.16);
  group.add(dome);
  const crown = mesh(shared.boxGeo, shared.plateMat, 'sf-swarm-threat-affix-shielded-crown');
  crown.scale.set(r * 0.05, r * 0.05, r * 0.05);
  crown.position.y = r * 0.08;
  group.add(crown);
  return { group };
}

/** Splitter: the two wasps it bursts into, carried as pods on a yoke — twin bumps, one hull. */
function buildAffixSplitter(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.broodMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-splitter';
  const yoke = mesh(shared.boxGeo, shared.darkMat, 'sf-swarm-threat-affix-splitter-yoke');
  yoke.scale.set(r * 0.07, r * 0.05, r * 0.5);
  group.add(yoke);
  const pods = [];
  for (const side of [-1, 1]) {
    const pod = mesh(shared.cylGeo, shared.darkMat, 'sf-swarm-threat-affix-splitter-pod');
    pod.rotation.z = Math.PI / 2; // axis -> X: a little hull nose-forward
    pod.scale.set(r * 0.07, r * 0.24, r * 0.07);
    pod.position.set(0, r * 0.05, side * r * 0.21);
    group.add(pod);
    const tip = mesh(shared.boxGeo, seam, 'sf-swarm-threat-affix-splitter-tip');
    tip.scale.set(r * 0.05, r * 0.05, r * 0.05);
    tip.position.set(r * 0.13, 0, 0); // the pod's nose, child of the turned pod
    pod.add(tip);
    pods.push({ pod, side, baseY: pod.position.y });
  }
  return {
    group,
    tick(mark, simTime, dt, reduced) {
      if (reduced) return;
      // The pods strain on their berths, off-phase — two bodies already trying to leave.
      for (const p of pods) {
        p.pod.position.y = p.baseY + Math.sin(simTime * 3.2 + p.side * 1.7) * r * 0.02;
      }
    },
  };
}

/** Volatile: the death-charge as a drum on the spine — hot collar, nervous shiver. */
function buildAffixVolatile(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.emberMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-volatile';
  const drum = mesh(shared.cylGeo, shared.metalMat, 'sf-swarm-threat-affix-volatile-drum');
  drum.scale.set(r * 0.1, r * 0.24, r * 0.1);
  group.add(drum);
  const collar = mesh(shared.torusGeo, seam, 'sf-swarm-threat-affix-volatile-collar');
  collar.rotation.x = Math.PI / 2;
  collar.scale.setScalar(r * 0.12);
  group.add(collar);
  const tip = mesh(shared.cylGeo, seam, 'sf-swarm-threat-affix-volatile-tip');
  tip.scale.set(r * 0.045, r * 0.06, r * 0.045);
  tip.position.y = r * 0.15;
  group.add(tip);
  return {
    group,
    tick(mark, simTime, dt, reduced) {
      if (reduced) return;
      // The charge shivers on its mount — the throw-me read is that it cannot sit still.
      drum.position.x = Math.sin(simTime * AFFIX_VOLATILE_SHIVER) * r * 0.006;
      drum.position.z = Math.cos(simTime * AFFIX_VOLATILE_SHIVER * 0.8) * r * 0.006;
    },
  };
}

/** Magnetic: a two-prong claw reaching past the nose — the pinch that drags chips in. */
function buildAffixMagnetic(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.tideMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-magnetic';
  const base = mesh(shared.boxGeo, shared.darkMat, 'sf-swarm-threat-affix-magnetic-base');
  base.scale.set(r * 0.16, r * 0.05, r * 0.12);
  group.add(base);
  const prongs = [];
  for (const side of [-1, 1]) {
    const prong = new THREE.Group();
    prong.name = 'sf-swarm-threat-affix-magnetic-prong';
    prong.position.set(r * 0.04, r * 0.04, side * r * 0.05);
    prong.rotation.y = -side * 0.5; // arms splay outboard — a claw opening forward
    group.add(prong);
    const arm = mesh(shared.boxGeo, shared.metalMat, 'sf-swarm-threat-affix-magnetic-arm');
    arm.scale.set(r * 0.3, r * 0.04, r * 0.05);
    arm.position.x = r * 0.15;
    prong.add(arm);
    const tip = mesh(shared.boxGeo, seam, 'sf-swarm-threat-affix-magnetic-tip');
    tip.scale.set(r * 0.05, r * 0.07, r * 0.07);
    tip.position.x = r * 0.3;
    prong.add(tip);
    prongs.push({ prong, side });
  }
  return {
    group,
    tick(mark, simTime, dt, reduced) {
      // A slow pinch — the pull is always working at something.
      const pinch = reduced ? 0.5 : 0.5 + Math.sin(simTime * 2.6) * 0.12;
      for (const p of prongs) p.prong.rotation.y = -p.side * pinch;
    },
  };
}

/** Commander: the rally mast — pennant forward, a lamp the cohort reads over the pack. */
function buildAffixCommander(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.broodMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-commander';
  const mast = mesh(shared.boxGeo, shared.darkMat, 'sf-swarm-threat-affix-commander-mast');
  mast.scale.set(r * 0.045, r * 0.52, r * 0.045);
  mast.position.y = r * 0.26;
  group.add(mast);
  const pennant = mesh(shared.boxGeo, shared.plateMat, 'sf-swarm-threat-affix-commander-pennant');
  pennant.scale.set(r * 0.2, r * 0.035, r * 0.06);
  pennant.position.set(r * 0.11, r * 0.44, 0);
  group.add(pennant);
  const lamp = mesh(shared.boxGeo, seam, 'sf-swarm-threat-affix-commander-lamp');
  lamp.scale.set(r * 0.08, r * 0.08, r * 0.08);
  lamp.position.y = r * 0.55;
  group.add(lamp);
  return { group };
}

/** Hasted: swept fins raked aft with hot tips — the third-again legs worn as wings. */
function buildAffixHasted(r, sink) {
  const shared = sharedAssets();
  const seam = cloneEmissive(shared.emberMat, sink);
  const group = new THREE.Group();
  group.name = 'sf-swarm-threat-affix-hasted';
  const keel = mesh(shared.boxGeo, shared.darkMat, 'sf-swarm-threat-affix-hasted-keel');
  keel.scale.set(r * 0.3, r * 0.045, r * 0.05);
  group.add(keel);
  const fins = [];
  for (const side of [-1, 1]) {
    const fin = mesh(shared.boxGeo, shared.metalMat, 'sf-swarm-threat-affix-hasted-fin');
    fin.scale.set(r * 0.26, r * 0.025, r * 0.09);
    fin.position.set(-r * 0.05, r * 0.05, side * r * 0.11);
    fin.rotation.y = side * 0.6; // swept back — the chevron opens aft
    group.add(fin);
    const tip = mesh(shared.boxGeo, seam, 'sf-swarm-threat-affix-hasted-tip');
    tip.scale.set(r * 0.05, r * 0.03, r * 0.05);
    tip.position.set(-r * 0.14, 0, 0); // hot trailing edge, child of the swept fin
    fin.add(tip);
    fins.push({ fin, side });
  }
  return {
    group,
    tick(mark, simTime, dt, reduced) {
      const flutter = reduced ? 0.6 : 0.6 + Math.sin(simTime * 7.5) * 0.06;
      for (const f of fins) f.fin.rotation.y = f.side * flutter;
    },
  };
}

// Per-affix builder + the seam's breath cadence (rad·s⁻¹). Volatile races; commander is the
// slow steady heartbeat the cohort flies on.
const AFFIX_MARKS = Object.freeze({
  shielded: Object.freeze({ build: buildAffixShielded, pulse: 2.0 }),
  splitter: Object.freeze({ build: buildAffixSplitter, pulse: 2.6 }),
  volatile: Object.freeze({ build: buildAffixVolatile, pulse: 4.8 }),
  magnetic: Object.freeze({ build: buildAffixMagnetic, pulse: 3.1 }),
  commander: Object.freeze({ build: buildAffixCommander, pulse: 1.5 }),
  hasted: Object.freeze({ build: buildAffixHasted, pulse: 3.9 }),
});

export function createLawArenaDressing() {
  const bossRecords = new Map();
  const affixRecords = new Map();
  // Mesh → record side index: boundMesh is already the boundary root identity,
  // so releases probe the index instead of scanning every record per batch.
  const boundIndex = new Map();
  const affixBoundIndex = new Map();
  const room = {
    root: null, parts: [], clones: [], installedAtSim: 0, arenaId: null,
    relayWires: [], pylonPositions: [],
  };

  function releaseRoom() {
    if (room.root && room.root.parent) room.root.parent.remove(room.root);
    for (const mat of room.clones) mat.dispose();
    room.root = null;
    room.parts = [];
    room.clones = [];
    room.arenaId = null;
    room.relayWires = [];
    room.pylonPositions = [];
  }

  function handleInstall(payload, scene) {
    releaseRoom();
    if (!payload || !scene) return;
    const arenaId = payload.arenaId;
    const conveyor = payload.lawId === POWERED_CONVEYOR_RULESET;
    if (!LAW_ARENA_IDS.has(arenaId) && !conveyor) return;
    const root = new THREE.Group();
    root.name = 'law_arena_room';
    const parts = [];
    const clones = [];

    const fields = Array.isArray(payload.fieldSpecs) ? payload.fieldSpecs : [];
    const toys = Array.isArray(payload.toySpecs) ? payload.toySpecs : [];

    // Field anchors: lagrange wells/repulsors are the pylons; cinder's cone is dressed by its
    // current mouth (deduped below) while its boss-phase ballast well gets the anchor too.
    // Cryo/Storm fields are occupancy markers (strength 0) — their furniture comes from
    // roomSpec, so zero-force markers never grow a pylon.
    for (const field of fields) {
      if (!field || !field.center) continue;
      if (!(Number.isFinite(field.strength) && field.strength !== 0)) continue;
      if (field.kind === 'cone' && (arenaId === CINDER_ARENA_ID || conveyor)) {
        const backed = toys.find((t) => t && t.kind === 'current' && t.center
          && Math.hypot(t.center.x - field.center.x, t.center.z - field.center.z) <= 12);
        if (backed) continue; // the mouth owns this anchor
      }
      const part = buildFieldAnchor(field, clones);
      parts.push(part);
      root.add(part.root);
    }
    for (const toy of toys) {
      // Foundry solids already render from their live bodies; the trial adds only the mouth.
      if (conveyor && toy.kind !== 'current') continue;
      let part = null;
      if (toy.kind === 'shutter' && toy.a && toy.b) part = buildShutterBar(toy, clones);
      else if (toy.kind === 'crusher' && toy.pos) part = buildCrusherPress(toy, clones);
      else if (toy.kind === 'current' && toy.center) {
        part = buildCurrentMouth(toy, arenaId === CINDER_ARENA_ID || toy.poweredCycle === true, clones);
      } else if (toy.kind === 'plate' && toy.pos) {
        part = buildBankPlate(toy, clones);
      }
      if (part) {
        parts.push(part);
        root.add(part.root);
      }
    }

    // PQ-133.09 — the law-specific rooms: Cryo's quadrant frame + coolant/manifold props,
    // Storm's pylon ring, graph wires and orbiting relays.
    const spec = payload && payload.roomSpec;
    if (arenaId === CRYO_ARENA_ID && spec && spec.at) {
      const frame = buildCryoRoomFrame(spec, clones);
      parts.push(frame);
      root.add(frame.root);
      const props = spec.props || { coolant: [], heat: [] };
      for (const pos of props.coolant || []) {
        const part = buildCryoProp(pos, false, clones);
        parts.push(part);
        root.add(part.root);
      }
      for (const pos of props.heat || []) {
        const part = buildCryoProp(pos, true, clones);
        parts.push(part);
        root.add(part.root);
      }
    } else if (arenaId === STORM_ARENA_ID && spec && spec.at) {
      const pylons = Array.isArray(spec.pylons) ? spec.pylons : [];
      const relays = Array.isArray(spec.relays) ? spec.relays : [];
      // Conductor wires are the conductivity graph drawn once at install — same edges the
      // sim's buildConductivityGraph produces for these nodes on this island.
      const nodes = pylons.concat(relays).map((n) => ({
        id: n.id, pos: n.pos, conductive: true,
        score: n.id && String(n.id).indexOf('relay') === 0 ? 2 : 1,
      }));
      const graph = buildConductivityGraph(nodes, {
        at: spec.at,
        islandRadius: Number.isFinite(spec.islandRadius) ? spec.islandRadius : undefined,
      });
      for (const edge of graph.edges) {
        const a = graph.nodesById.get(edge.a);
        const b = graph.nodesById.get(edge.b);
        if (!a || !b) continue;
        const wire = buildConductorWire(a.pos, b.pos, clones);
        parts.push(wire);
        root.add(wire.root);
      }
      for (let i = 0; i < pylons.length; i++) {
        const part = buildStormPylon(pylons[i], i, clones);
        parts.push(part);
        root.add(part.root);
        room.pylonPositions.push({ x: pylons[i].pos.x, z: pylons[i].pos.z });
      }
      for (let i = 0; i < relays.length; i++) {
        const part = buildStormRelay(spec.at, i, clones);
        parts.push(part);
        root.add(part.root);
        // A live feed wire per relay: allocated once, re-aimed every frame to the relay's
        // nearest graph node — the lattice visibly rewires as the relays orbit.
        const shared = sharedAssets();
        const beam = mesh(shared.boxGeo, cloneEmissive(shared.amberMat, clones), 'storm_relay_feed');
        beam.position.y = 30;
        root.add(beam);
        room.relayWires.push({ relay: part, beam });
      }
    }
    room.root = root;
    room.parts = parts;
    room.clones = clones;
    room.installedAtSim = Number.isFinite(payload.installedAtSim) ? payload.installedAtSim : 0;
    room.arenaId = arenaId;
    scene.add(root);
    return parts.length;
  }

  function handleReleased() {
    releaseRoom();
  }

  function updateRoom(simTime, frameDt, options) {
    if (!room.root) return;
    const dt = Math.max(0, frameDt || 0);
    const reduced = !!(options && options.reducedMotion);
    const calmFlash = !!(options && options.reducedFlash);
    const simNow = Number.isFinite(simTime) ? simTime : 0;
    const elapsed = Math.max(0, simNow - room.installedAtSim);
    const pulse = calmFlash ? 0 : 0.5 + 0.5 * Math.sin(simNow * 1.7);
    for (let i = 0; i < room.parts.length; i++) {
      const mover = room.parts[i].mover;
      if (mover) mover.call(room.parts[i], elapsed, dt, reduced, calmFlash, pulse, simNow);
    }
    // Relay feed wires: re-aim each live beam from its relay buoy to the nearest conductor
    // node — same "range + conductive" rule the graph uses, without rebuilding it per frame.
    for (let i = 0; i < room.relayWires.length; i++) {
      const rw = room.relayWires[i];
      const rp = rw.relay.root.position;
      let best = null;
      let bestD2 = STORM_CONDUCT_RANGE * STORM_CONDUCT_RANGE;
      for (let j = 0; j < room.pylonPositions.length; j++) {
        const p = room.pylonPositions[j];
        const dx = p.x - rp.x;
        const dz = p.z - rp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= bestD2) { bestD2 = d2; best = p; }
      }
      if (!best) { rw.beam.visible = false; continue; }
      rw.beam.visible = true;
      const len = Math.max(1, Math.sqrt(bestD2));
      rw.beam.scale.set(len, 0.8, 0.8);
      rw.beam.position.set((rp.x + best.x) / 2, 30, (rp.z + best.z) / 2);
      rw.beam.rotation.y = -Math.atan2(best.z - rp.z, best.x - rp.x);
      rw.beam.material.emissiveIntensity = calmFlash ? 0.5
        : 0.5 + (reduced ? 0 : 0.3 * Math.sin(simNow * RELAY_SPARK_RATE + i));
    }
  }

  // ---- affix marks (entity-driven, same lifecycle as the boss dressing) ----

  function detachAffix(rec) {
    if (!rec) return;
    if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
    if (rec.boundMesh && affixBoundIndex.get(rec.boundMesh) === rec) {
      affixBoundIndex.delete(rec.boundMesh);
    }
    rec.boundMesh = null;
  }

  function disposeAffix(rec) {
    detachAffix(rec);
    for (const mark of rec.marks) {
      for (const mat of mark.mats) mat.dispose();
    }
    rec.marks = [];
    rec.group = null;
  }

  /**
   * (Re)build the mark set inside the record's group: the primary rides the forward anchor,
   * the veteran second the aft anchor, and a dark collar joins a pair. Old marks release
   * their clone materials — a late second stamp never re-clones the primary's seams.
   */
  function rebuildAffixMarks(rec, entity) {
    if (!rec.group) {
      rec.group = new THREE.Group();
      rec.group.name = AFFIX_MARK_ROOT;
      rec.group.scale.setScalar(0.0001);
    }
    for (const mark of rec.marks) {
      if (mark.group && mark.group.parent) mark.group.parent.remove(mark.group);
      for (const mat of mark.mats) mat.dispose();
    }
    rec.marks = [];
    const staleBand = rec.group.getObjectByName(AFFIX_VETERAN_BAND_NAME);
    if (staleBand) rec.group.remove(staleBand);

    const ids = [];
    if (AFFIX_MARKS[rec.affix1]) ids.push(rec.affix1);
    if (rec.affix2 && rec.affix2 !== rec.affix1 && AFFIX_MARKS[rec.affix2]) ids.push(rec.affix2);
    const r = Math.max(8, entity.radius || entity.collisionRadius || 40);
    const anchors = ids.length > 1 ? [AFFIX_ANCHOR_PRIMARY, AFFIX_ANCHOR_SECOND] : [AFFIX_ANCHOR_PRIMARY];
    const deck = ids.length > 1 ? AFFIX_MARK_DECK_VETERAN : AFFIX_MARK_DECK;
    for (let i = 0; i < ids.length; i++) {
      const spec = AFFIX_MARKS[ids[i]];
      const mats = [];
      const built = spec.build(r, mats);
      built.group.position.set(anchors[i] * r, deck * r, 0);
      rec.group.add(built.group);
      rec.marks.push({ id: ids[i], group: built.group, mats, tick: built.tick || null, pulse: spec.pulse });
    }
    if (ids.length > 1) {
      const shared = sharedAssets();
      const band = mesh(shared.torusGeo, shared.darkMat, AFFIX_VETERAN_BAND_NAME);
      band.rotation.x = Math.PI / 2;
      band.scale.setScalar(r * 0.52);
      band.position.y = r * 0.28;
      rec.group.add(band);
    }
  }

  /**
   * The per-frame half, driven from updateBossDressing's visit: read the stamps the elites
   * runtime wrote, keep the mark set honest, animate, release on kill. Reads entity.data
   * only — presentation never rewrites the stamp.
   */
  function updateAffixMarks(entity, mesh_, simTime, frameDt, options) {
    const data = entity.data;
    const affix1 = data && typeof data.swarmAffix === 'string' ? data.swarmAffix : null;
    const affix2 = data && typeof data.swarmAffix2 === 'string' ? data.swarmAffix2 : null;
    let rec = affixRecords.get(entity.id);
    if (!affix1 && !affix2) {
      if (rec) { disposeAffix(rec); affixRecords.delete(entity.id); }
      return;
    }
    if (!rec) {
      rec = {
        affix1: null, affix2: null,
        boundMesh: null, group: null, marks: [],
        phase: 'build', clock: 0, releaseClock: 0,
      };
      affixRecords.set(entity.id, rec);
    }
    if (rec.affix1 !== affix1 || rec.affix2 !== affix2) {
      rec.affix1 = affix1;
      rec.affix2 = affix2;
      rebuildAffixMarks(rec, entity);
    }
    if (rec.phase === 'done' || !rec.group) return;
    if (rec.boundMesh !== mesh_) {
      detachAffix(rec);
      const parent = (mesh_.userData && mesh_.userData.hull) || mesh_;
      parent.add(rec.group);
      recordMountedRootForUnreadyScan(rec.group);
      rec.boundMesh = mesh_;
      const displaced = affixBoundIndex.get(mesh_);
      // A mesh re-seat steals the index entry — clear the displaced owner's bound field.
      if (displaced && displaced !== rec) displaced.boundMesh = null;
      affixBoundIndex.set(mesh_, rec);
    }

    const reduced = !!(options && options.motionReduce);
    const calmFlash = !!(options && options.flashReduce);
    const dt = Math.max(0, frameDt || 0);
    const simNow = Number.isFinite(simTime) ? simTime : 0;
    rec.clock += dt;
    if (rec.phase !== 'release' && entity.alive === false) {
      rec.phase = 'release';
      rec.releaseClock = 0;
    }

    if (rec.phase === 'build' || rec.phase === 'spin') {
      const buildT = Math.min(1, rec.clock / BUILD_S);
      rec.group.scale.setScalar(Math.max(0.0001, easeOutCubic(buildT)));
      for (let i = 0; i < rec.marks.length; i++) {
        const mark = rec.marks[i];
        if (mark.tick) mark.tick(mark, simNow, dt, reduced);
        for (const mat of mark.mats) {
          mat.emissiveIntensity = calmFlash
            ? 0.7
            : 0.7 + (reduced ? 0 : 0.4 * Math.sin(simNow * mark.pulse + i * 1.7));
        }
      }
      if (rec.phase === 'build' && buildT >= 1) rec.phase = 'spin';
    } else if (rec.phase === 'release') {
      rec.releaseClock += dt;
      const rt = Math.min(1, rec.releaseClock / RELEASE_S);
      for (const mark of rec.marks) {
        if (mark.tick) mark.tick(mark, simNow, dt, reduced);
        for (const mat of mark.mats) mat.emissiveIntensity = Math.max(0.08, 1.1 * (1 - rt));
      }
      rec.group.scale.setScalar(Math.max(0.0001, 1 - rt));
      rec.group.position.y += RELEASE_FLING_WU * dt * rt;
      if (rt >= 1) {
        detachAffix(rec);
        rec.phase = 'done';
      }
    }
  }

  // ---- boss dressing (entity-driven, crown-style lifecycle) ----

  function detachBoss(rec) {
    if (!rec) return;
    if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
    // Ownership-checked: a displaced entry now names a different rec — its
    // live mapping must survive this detach.
    if (rec.boundMesh && boundIndex.get(rec.boundMesh) === rec) boundIndex.delete(rec.boundMesh);
    rec.boundMesh = null;
  }

  function disposeBoss(rec) {
    detachBoss(rec);
    for (const mat of rec.clones) mat.dispose();
    rec.clones = [];
    rec.group = null;
  }

  function updateBossDressing(entity, mesh_, simTime, frameDt, options) {
    if (!entity || entity.id == null || !mesh_) return;
    // The elite's affix marks ride this same visit — a champion boss can carry both layers.
    updateAffixMarks(entity, mesh_, simTime, frameDt, options);
    const kind = bossDressingKindFor(entity);
    let rec = bossRecords.get(entity.id);
    if (!kind) {
      if (rec) { disposeBoss(rec); bossRecords.delete(entity.id); }
      return;
    }
    if (!rec) {
      rec = {
        boundMesh: null, group: null, drums: null, seamMat: null, hook: null, clones: [],
        tick: null, phase: 'build', clock: 0, spinAngle: 0, releaseClock: 0,
      };
      bossRecords.set(entity.id, rec);
    }
    if (rec.phase === 'done') return;
    if (rec.boundMesh !== mesh_) {
      detachBoss(rec);
      const parent = (mesh_.userData && mesh_.userData.hull) || mesh_;
      if (!rec.group) {
        const built = BOSS_BUILDERS[kind](
          Math.max(8, entity.radius || entity.collisionRadius || 40), rec.clones);
        rec.group = built.group;
        rec.drums = built.drums;
        rec.seamMat = built.seamMat;
        rec.hook = built.hook || null;
        rec.tick = built.tick || null;
      }
      parent.add(rec.group);
      recordMountedRootForUnreadyScan(rec.group);
      rec.boundMesh = mesh_;
      const displaced = boundIndex.get(mesh_);
      // A mesh re-seat steals the index entry — clear the displaced owner's
      // bound field so its later detach can't delete our live mapping.
      if (displaced && displaced !== rec) displaced.boundMesh = null;
      boundIndex.set(mesh_, rec);
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
    const spin = BOSS_SPIN_RATES[kind] || VANE_SPIN;
    const spinRate = reduced ? spin[1] : spin[0];

    if (rec.phase === 'build' || rec.phase === 'spin') {
      const buildT = Math.min(1, rec.clock / BUILD_S);
      const s = easeOutCubic(buildT);
      rec.group.scale.setScalar(Math.max(0.0001, s));
      rec.spinAngle += spinRate * Math.min(1, buildT * 1.5) * dt;
      driveBossDrums(rec);
      if (rec.tick) rec.tick(rec, simTime, dt, reduced, calmFlash);
      if (rec.seamMat) {
        rec.seamMat.emissiveIntensity = calmFlash
          ? 0.8
          : 0.35 + buildT * 0.75 + (reduced ? 0 : 0.15 * Math.sin(simTime * 1.9));
      }
      if (rec.hook) {
        rec.hook.rotation.z = reduced ? 0 : 0.12 * Math.sin(simTime * 0.9);
      }
      if (rec.phase === 'build' && buildT >= 1) rec.phase = 'spin';
    } else if (rec.phase === 'release') {
      rec.releaseClock += dt;
      const rt = Math.min(1, rec.releaseClock / RELEASE_S);
      rec.spinAngle += spinRate * (1 - rt) * dt;
      driveBossDrums(rec);
      if (rec.tick) rec.tick(rec, simTime, dt, reduced, calmFlash);
      rec.group.scale.setScalar(Math.max(0.0001, 1 - rt));
      rec.group.position.y += RELEASE_FLING_WU * dt * rt;
      if (rec.seamMat) rec.seamMat.emissiveIntensity = Math.max(0.08, 1.1 * (1 - rt));
      if (rt >= 1) {
        detachBoss(rec);
        rec.phase = 'done';
      }
    }
  }

  function releaseEntityMesh(entityId) {
    const rec = bossRecords.get(entityId);
    if (rec) detachBoss(rec);
    const affixRec = affixRecords.get(entityId);
    if (affixRec) detachAffix(affixRec);
  }

  function releaseMesh(mesh_) {
    if (!mesh_) return;
    detachBoss(boundIndex.get(mesh_));
    detachAffix(affixBoundIndex.get(mesh_));
  }

  // Batched twin for mass-despawn sweeps: O(pending.size) via the index.
  function releaseMeshSet(meshes) {
    if (!meshes || meshes.size === 0) return;
    for (const mesh_ of meshes) {
      detachBoss(boundIndex.get(mesh_));
      detachAffix(affixBoundIndex.get(mesh_));
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of bossRecords.keys()) {
      if (!activeEntityIds.has(id)) {
        disposeBoss(bossRecords.get(id));
        bossRecords.delete(id);
      }
    }
    for (const id of affixRecords.keys()) {
      if (!activeEntityIds.has(id)) {
        disposeAffix(affixRecords.get(id));
        affixRecords.delete(id);
      }
    }
  }

  function peekRoom() {
    return room.root ? {
      root: room.root, parts: room.parts, arenaId: room.arenaId,
      relayWires: room.relayWires, pylonPositions: room.pylonPositions,
    } : null;
  }

  function peekBoss(entityId) {
    return bossRecords.get(entityId) || null;
  }

  function peekAffix(entityId) {
    return affixRecords.get(entityId) || null;
  }

  return {
    handleInstall, handleReleased, updateRoom,
    updateBossDressing, releaseEntityMesh, releaseMesh, releaseMeshSet, prune,
    peekRoom, peekBoss, peekAffix,
  };
}

export const globalLawArenaDressing = createLawArenaDressing();
