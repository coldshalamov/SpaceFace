// The instant kill-cam stage (DEMO_READINESS_2026-09-20 §4, "The toy (swarm)").
//
// Plays the recorded round tail (src/sim/killcamTape.js) inside the uiStage scene on the
// MAIN renderer — the same one-way seam the live title attract uses: this module reads
// poses out of the tape and moves meshes; it never steps a simulation and never writes
// game state. No second WebGL context is ever opened (see the uiStage header: a second
// context is refused on Intel GPUs and TDR'd the live one).
//
// The film plays ONCE. The playhead runs on the stage clock (frozen under reduced
// motion — and the results screen never even requests this scene under reduced motion);
// when the tape ends the last tableau holds while the camera keeps its slow orbit, the
// same turntable posture the death dial beside the plate speaks in prose.
//
// Failure contract: no tape, a malformed tape, or hulls that fail to load degrade to
// `ready: false` — uiStage keeps the results plate, and the death dial tells the story.
// A stage built over a skip flag holds a quiet tableau; the plate is back on top anyway.

import * as THREE from 'three';
import { wholeShipVisualForEntity } from './partsLibrary.js';
import {
  decodeKillcamTape, isKillcamTape, takeKillcamTape, killcamPlaybackSkipped,
} from '../sim/killcamTape.js';

/** Sim wu → stage units. Same convention as the title attract so camera math translates. */
const SCALE = 0.35;
const SHIP_VISUAL_BOOST = 1.35;
/** A wreck drifts and tumbles this long after its kill, then clears out of the frame. */
const WRECK_SECONDS = 2.4;
/** Impact / kill flash duration, seconds of stage time. */
const FLASH_SECONDS = 0.5;
/** Instanced pools sized to the window: 5 s of one arena, not 60 s of one. */
const MAX_BOLTS = 256;
const MAX_FLASHES = 128;
/** Camera: a tighter, lower orbit than the title's — the death is the subject. */
const CAM_ORBIT_RAD_S = 0.09;
const CAM_RADIUS = 58;
const CAM_HEIGHT = 34;
const CAM_CENTROID_CLAMP = 40;
const CAM_LERP = 2.2;

const TEAM_BOLT_COLORS = [0xbfd4ff, 0xffc27a, 0x8fc7ff];

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3(1, 1, 1);
const _unit = new THREE.Vector3(1, 1, 1);
const _eul = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _centroid = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _color = new THREE.Color();
const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

function markOwned(mesh) {
  mesh.userData.uiStageOwned = true;
}

/**
 * Build the kill-cam content for a live uiStage scene.
 * @param built  the uiStage's stage record (scene, camera, clock, renderer, residencyOwner)
 * @param io     { loadPart(file, slot) -> Promise<record|null> } — uiStage's loader, so the
 *               same release/source path and residency rules apply to the replayed hulls.
 */
export async function buildKillcamStage(built, io) {
  const { scene } = built;

  const stageRoot = new THREE.Group();
  stageRoot.name = 'UiStageKillcam';
  stageRoot.scale.setScalar(SCALE);
  stageRoot.visible = false; // uiStage reveals it after the compile pass, like every root

  const prototypes = new THREE.Group();
  prototypes.name = 'UiStageKillcamPrototypes';
  prototypes.visible = false;
  stageRoot.add(prototypes);
  const fleet = new THREE.Group();
  fleet.name = 'UiStageKillcamFleet';
  stageRoot.add(fleet);

  // The tape seals here if the screen has not already sealed it (idempotent). Nothing to
  // play — no run, an empty window — fails closed to the results plate: the death dial
  // already tells the story in prose.
  let tape = null;
  try { tape = takeKillcamTape(); } catch (error) { console.warn('[killcam] tape seal failed', error); }
  if (!isKillcamTape(tape)) {
    return { ready: false, roots: [], update() {}, controlsCamera: true, dispose() {} };
  }
  const film = decodeKillcamTape(tape);

  // -- Ship visuals: one GLB blueprint per hull identity the tape actually carries.
  const visualKeys = new Map(); // key -> { proto, unitScale }
  for (const slotDef of film.ships) {
    const ship = slotDef.ship;
    const key = `${ship.visual || ''}|${ship.silhouette || ''}`;
    if (visualKeys.has(key)) continue;
    visualKeys.set(key, null);
    let selection = null;
    try {
      selection = wholeShipVisualForEntity({
        type: 'ship', team: ship.team,
        data: { lootTableId: ship.visual, silhouette: ship.silhouette },
      });
    } catch (error) {
      console.warn('[killcam] visual lookup failed for', key, error);
    }
    const file = selection && selection.file;
    if (!file) continue;
    const record = await io.loadPart(file, 'hull');
    if (!record) continue;
    const proto = new THREE.Group();
    let span = 0;
    for (const primitive of record.primitives) {
      const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
      mesh.name = primitive.name;
      primitive.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      proto.add(mesh);
    }
    proto.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(proto);
    if (!box.isEmpty()) {
      const size = new THREE.Vector3();
      box.getSize(size);
      span = Math.max(size.x, size.y, size.z);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      for (const mesh of proto.children) mesh.position.sub(centre);
    }
    prototypes.add(proto);
    visualKeys.set(key, { proto, unitScale: span > 0 ? 1 / span : 0 });
  }

  // -- Bolt pool: stretched, team-tinted tracers over the tape's round tracks.
  const boltGeometry = new THREE.BoxGeometry(5.4, 0.55, 0.55);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bolts = new THREE.InstancedMesh(boltGeometry, boltMaterial, MAX_BOLTS);
  bolts.name = 'UiStageKillcamBolts';
  bolts.count = 0;
  bolts.frustumCulled = false;
  bolts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX_BOLTS; i++) bolts.setColorAt(i, _color.setHex(0xffffff));
  markOwned(bolts);
  stageRoot.add(bolts);

  // -- Flash pool: kill pops (real recorded deaths) and round-end pops.
  const flashGeometry = new THREE.IcosahedronGeometry(1, 1);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd9a8, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const flashes = new THREE.InstancedMesh(flashGeometry, flashMaterial, MAX_FLASHES);
  flashes.name = 'UiStageKillcamFlashes';
  flashes.count = 0;
  flashes.frustumCulled = false;
  flashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  markOwned(flashes);
  stageRoot.add(flashes);

  // Per-hull play state, parallel to film.ships.
  const slots = film.ships.map((slotDef) => ({
    def: slotDef,
    ship: slotDef.ship,
    key: `${slotDef.ship.visual || ''}|${slotDef.ship.silhouette || ''}`,
    obj: null,
    phase: 0, // 0 waiting/cleared, 1 alive, 2 wreck, 3 no visual
    wreckT: -1, // seconds of film time at which the hull died
    cleared: false,
    wreckX: 0, wreckZ: 0, wreckRot: 0,
  }));

  const activeFlashes = [];
  const roundPopped = new Array(film.rounds.length).fill(false);

  let filmTime = -1; // seconds into the film; -1 until the first presented frame
  let eventCursor = 0; // decoded kill flashes, ascending
  let camInit = false;

  function spawnShip(slot) {
    const visual = visualKeys.get(slot.key);
    const proto = visual && visual.proto;
    if (!proto) return null;
    const obj = proto.clone(true);
    const diameter = Math.max(4, slot.ship.radius * 2 * SHIP_VISUAL_BOOST);
    obj.scale.setScalar((visual.unitScale || 0) * diameter);
    obj.visible = true;
    fleet.add(obj);
    return obj;
  }

  function pushFlash(x, z, size) {
    if (activeFlashes.length >= MAX_FLASHES) activeFlashes.shift();
    activeFlashes.push({ t0: filmTime, x, z, size });
  }

  function update(built2, dt) {
    if (killcamPlaybackSkipped()) {
      // The visible SKIP was pressed: hold a quiet tableau — the plate is back on top.
      if (filmTime < 0) filmTime = film.seconds;
      poseAt(film.seconds, 0);
      return;
    }
    // Plays once, on the stage clock — the same clock presentUiStage freezes under
    // reduced motion, so a scene that is somehow requested there still cannot move.
    // The playhead clamps at the end; the tableau holds while the camera keeps its orbit.
    filmTime = Math.min(film.seconds, Math.max(0, built2.clock));
    poseAt(filmTime, dt);
    orbitCamera(built2, dt);
  }

  function poseAt(seconds, dt) {
    const rate = film.tape.sampleRate;
    const t = seconds * rate;

    // -- Recorded kill flashes this window passed.
    while (eventCursor < film.flashes.length && film.flashes[eventCursor].s <= t) {
      const ev = film.flashes[eventCursor++];
      pushFlash(ev.x, ev.z, ev.size);
    }
    // Round ends pop where their track stops — an impact is a place, not a timeout.
    for (let i = 0; i < film.rounds.length; i++) {
      if (roundPopped[i]) continue;
      const round = film.rounds[i].round;
      const end = round.b + round.n;
      if (end > 0 && t >= end) {
        roundPopped[i] = true;
        const last = film.rounds[i].poseAt(end - 1);
        pushFlash(last.x, last.z, 1.4);
      }
    }

    // -- Hulls.
    _centroid.set(0, 0, 0);
    let centroidN = 0;
    for (const slot of slots) {
      const ship = slot.ship;
      const dead = ship.d >= 0 && t >= ship.d;
      const wreckAgeS = dead ? (t - ship.d) / rate : 0;
      // During playback a wreck older than WRECK_SECONDS clears out and stays cleared;
      // the held tableau at the end keeps whatever the final frame carried.
      if (t < ship.b || (dead && wreckAgeS > WRECK_SECONDS && seconds < film.seconds)) {
        if (slot.obj) {
          fleet.remove(slot.obj); slot.obj = null;
          slot.phase = 0; slot.wreckT = -1; slot.cleared = true;
        }
        continue;
      }
      if (slot.cleared && !slot.obj) continue; // cleared during playback stays cleared
      if (!slot.obj) {
        slot.obj = spawnShip(slot);
        slot.phase = dead ? 2 : 1;
        if (!slot.obj) { slot.phase = 3; continue; }
      }
      if (!dead) {
        const pose = slot.def.poseAt(t);
        slot.obj.position.set(pose.x, 0, pose.z);
        slot.obj.rotation.y = -pose.rot;
        // Cosmetic bank from recorded yaw-rate — presentation polish, not a sim value.
        slot.obj.rotation.x = Math.max(-0.5, Math.min(0.5, -pose.turning * 0.32));
        slot.obj.rotation.z = 0;
        slot.wreckX = pose.x; slot.wreckZ = pose.z; slot.wreckRot = pose.rot;
        _centroid.x += pose.x; _centroid.z += pose.z; centroidN++;
      } else {
        if (slot.phase !== 2 || slot.wreckT < 0) {
          slot.phase = 2;
          slot.wreckT = ship.d / rate;
          const deathPose = slot.def.poseAt(ship.d);
          slot.wreckX = deathPose.x; slot.wreckZ = deathPose.z; slot.wreckRot = deathPose.rot;
        }
        const age = Math.max(0, seconds - slot.wreckT);
        // The wreck keeps its recorded death velocity — a body conserving momentum.
        slot.obj.position.set(
          slot.wreckX + ship.vx * age, 0,
          slot.wreckZ + ship.vz * age,
        );
        slot.obj.rotation.y = -(slot.wreckRot + ship.wz * age);
        slot.obj.rotation.x += dt * 1.7; // dead tumbling — a body, not a pop
        slot.obj.rotation.z += dt * 0.9;
        _centroid.x += slot.obj.position.x; _centroid.z += slot.obj.position.z; centroidN++;
      }
    }

    // -- Bolts.
    let bi = 0;
    for (let i = 0; i < film.rounds.length && bi < MAX_BOLTS; i++) {
      const round = film.rounds[i].round;
      if (t < round.b || t >= round.b + round.n) continue;
      const pose = film.rounds[i].poseAt(t);
      _pos.set(pose.x, 0, pose.z);
      _eul.set(0, -Math.atan2(pose.vz, pose.vx), 0);
      _quat.setFromEuler(_eul);
      _mat.compose(_pos, _quat, _unit);
      bolts.setMatrixAt(bi, _mat);
      bolts.setColorAt(bi, _color.setHex(TEAM_BOLT_COLORS[round.team] || 0xffe0b0));
      bi++;
    }
    for (let i = bi; i < bolts.count; i++) bolts.setMatrixAt(i, ZERO_SCALE);
    bolts.count = bi;
    bolts.instanceMatrix.needsUpdate = true;
    if (bolts.instanceColor) bolts.instanceColor.needsUpdate = true;

    // -- Flashes.
    let fi = 0;
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const fl = activeFlashes[i];
      const age = (seconds - fl.t0) / FLASH_SECONDS;
      if (age >= 1) { activeFlashes.splice(i, 1); continue; }
      if (fi >= MAX_FLASHES) break;
      const s = fl.size * Math.sin(Math.min(1, Math.max(0, age)) * Math.PI) + 0.001;
      _pos.set(fl.x, 0, fl.z);
      _scl.setScalar(s);
      _mat.compose(_pos, _quat.identity(), _scl);
      flashes.setMatrixAt(fi++, _mat);
      _scl.set(1, 1, 1);
    }
    for (let i = fi; i < flashes.count; i++) flashes.setMatrixAt(i, ZERO_SCALE);
    flashes.count = fi;
    flashes.instanceMatrix.needsUpdate = true;

    // -- Camera target: the smoothed fight centroid, clamped near the death.
    if (centroidN > 0) _centroid.multiplyScalar(1 / centroidN); else _centroid.set(0, 0, 0);
    const len = Math.hypot(_centroid.x, _centroid.z);
    if (len > CAM_CENTROID_CLAMP) _centroid.multiplyScalar(CAM_CENTROID_CLAMP / len);
  }

  function orbitCamera(built2, dt) {
    if (!camInit) { _camTarget.copy(_centroid); camInit = true; }
    const k = 1 - Math.exp(-Math.max(0, dt) * CAM_LERP);
    _camTarget.lerp(_centroid, k);
    const az = built2.clock * CAM_ORBIT_RAD_S;
    const height = CAM_HEIGHT + Math.sin(built2.clock * 0.047) * 4;
    const radius = CAM_RADIUS + Math.sin(built2.clock * 0.031) * 5;
    built2.camera.position.set(
      _camTarget.x + Math.cos(az) * radius,
      height,
      _camTarget.z + Math.sin(az) * radius,
    );
    built2.camera.lookAt(_camTarget.x, 0, _camTarget.z);
  }

  return {
    ready: [...visualKeys.values()].some((v) => v && v.unitScale > 0),
    roots: [stageRoot],
    update,
    controlsCamera: true,
    dispose() {
      for (const slot of slots) if (slot.obj) { fleet.remove(slot.obj); slot.obj = null; }
      activeFlashes.length = 0;
      slots.length = 0;
      for (const v of visualKeys.values()) if (v && v.proto) prototypes.remove(v.proto);
      visualKeys.clear();
    },
  };
}
