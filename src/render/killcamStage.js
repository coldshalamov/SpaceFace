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
// when the tape ends the last tableau and camera hold. A temporary overlay or stage
// rebuild resumes the same sealed tape's playhead rather than replaying the death.
//
// Failure contract: no tape, a malformed tape, or hulls that fail to load degrade to
// `ready: false` — uiStage keeps the results plate, and the death dial tells the story.
// A stage built over a skip flag holds a quiet tableau; the plate is back on top anyway.

import * as THREE from 'three';
import { wholeShipVisualForEntity } from './partsLibrary.js';
import { dedupWarn } from '../core/warnDedup.js';
import {
  decodeKillcamTape, isKillcamTape, takeKillcamTape, killcamPlaybackSkipped, killcamPlaybackTime,
} from '../sim/killcamTape.js';
import { NpcCableFx } from './combat/npcCableFx.js';
import { FieldForcePresentation } from './forceLanguage/fieldForcePresentation.js';
import { FORCE_TAPE_MAX_LINES, FORCE_TAPE_MAX_FIELDS } from '../sim/forceTape.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';
import { createReplayWeaponStage } from './replayWeaponStage.js';

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
export async function buildKillcamStage(built, io, options = {}) {
  const { scene } = built;
  const control = options.control || null;

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
  try { tape = options.tape || takeKillcamTape(); } catch (error) { console.warn('[killcam] tape seal failed', error); }
  if (!isKillcamTape(tape)) {
    return { ready: false, roots: [], update() {}, controlsCamera: true, dispose() {} };
  }
  const film = decodeKillcamTape(tape);
  // Evaluate the pure camera lease once. Playback interpolates this resident table
  // at display cadence without allocating camera request objects every frame.
  const cameraFrames = control?.cameraLease ? Array.from({ length: Math.ceil(film.seconds * 60) + 1 }, (_, i) => (
    control.cameraLease.frameAt((tape.baseTick || 0) + i)
  )) : null;
  // Adventure coordinates can be thousands of WU from zero. Centre the stage on
  // the recorded player's final position; camera targets use the same stage units.
  const subject = tape.ships.find((ship) => ship.player) || tape.ships[0];
  const originX = subject?.x[subject.n - 1] || 0, originZ = subject?.z[subject.n - 1] || 0;
  stageRoot.position.set(-originX * SCALE, 0, -originZ * SCALE);
  const forceStage = createForceStage(stageRoot, film.forces);

  // -- Ship visuals: one GLB blueprint per hull identity the tape actually carries.
  const visualKeys = new Map(); // key -> { proto, unitScale }
  const picks = [];
  for (const slotDef of film.ships) {
    const ship = slotDef.ship;
    // Faction kits swap the whole-ship file — the blueprint key must carry the faction so
    // two liveries of one hull don't alias onto whichever decoded first.
    const key = visualKey(ship);
    if (visualKeys.has(key)) continue;
    visualKeys.set(key, null);
    let selection = null;
    try {
      selection = ship.type === 'asteroid' ? { file: 'places/place_asteroid_rock_a.glb' } : wholeShipVisualForEntity({
        type: 'ship', team: ship.team, factionId: ship.factionId || null,
        data: { lootTableId: ship.visual, defId: ship.visual, silhouette: ship.silhouette },
      }, { requiredWholeShip: true });
    } catch (error) {
      dedupWarn('killcam.visual-lookup', '[killcam] visual lookup failed for', key, error);
    }
    const file = selection && selection.file;
    if (!file) continue;
    picks.push({ key, file });
  }
  // A cold replay serializes one decode per hull inside the death-screen build — fan the
  // unique-file decodes out two at a time at deadline class instead.
  const decoded = new Map();
  for (let i = 0; i < picks.length; i += 2) {
    const batch = await Promise.all(picks.slice(i, i + 2).map(async ({ key, file }) => (
      [key, await io.loadPart(file, 'hull', { admissionDeadline: true })]
    )));
    for (const [key, record] of batch) decoded.set(key, record);
  }
  for (const { key } of picks) {
    const record = decoded.get(key);
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

  const weaponStage = createReplayWeaponStage(stageRoot);
  let flashProfile = resolveVfxAccessibilityProfile(null);

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
    key: visualKey(slotDef.ship),
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
  let clockStart = null;
  const resumeAt = control ? 0 : killcamPlaybackTime();
  let held = false;

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

  // All clones are admitted up front, including actors first seen later on the tape.
  // Seeking only poses/hides them; it never decodes or allocates a replacement hull.
  for (const slot of slots) { slot.obj = spawnShip(slot); if (slot.obj) slot.obj.visible = false; }

  function pushFlash(x, z, size, at = filmTime) {
    if (activeFlashes.length >= MAX_FLASHES) activeFlashes.shift();
    activeFlashes.push({ t0: at, x, z, size });
  }

  function update(built2, dt, state) {
    if (held && !control) return;
    forceStage.settings = state?.settings || {};
    flashProfile = resolveVfxAccessibilityProfile(state?.settings);
    flashMaterial.opacity = 0.9 * flashProfile.flashOpacityScale;
    weaponStage.begin(built2.camera, dt, state?.settings, built2.renderer?.domElement?.height || 720);
    if (!control && killcamPlaybackSkipped()) {
      // The visible SKIP was pressed: hold a quiet tableau — the plate is back on top.
      if (filmTime < 0) filmTime = film.seconds;
      poseAt(film.seconds, 0);
      orbitCamera(built2, 0);
      held = true;
      return;
    }
    // Plays once, on the stage clock — the same clock presentUiStage freezes under
    // reduced motion, so a scene that is somehow requested there still cannot move.
    // The playhead clamps at the end; the tableau holds while the camera keeps its orbit.
    if (clockStart == null) clockStart = built2.clock;
    const nextTime = control ? Math.max(0, Math.min(film.seconds, control.elapsed))
      : Math.min(film.seconds, resumeAt + Math.max(0, built2.clock - clockStart));
    if (control && (nextTime < filmTime || nextTime - filmTime > 0.25)) {
      eventCursor = 0; activeFlashes.length = 0; roundPopped.fill(false);
      for (const slot of slots) { slot.cleared = false; slot.phase = 0; slot.wreckT = -1; }
    }
    filmTime = nextTime;
    if (!control) killcamPlaybackTime(filmTime);
    poseAt(filmTime, dt);
    orbitCamera(built2, dt);
    held = filmTime >= film.seconds;
  }

  function poseAt(seconds, dt) {
    const rate = film.tape.sampleRate;
    const t = seconds * rate;
    forceStage.update(t, seconds, dt);

    // -- Recorded kill flashes this window passed.
    while (eventCursor < film.flashes.length && film.flashes[eventCursor].s <= t) {
      const ev = film.flashes[eventCursor++];
      pushFlash(ev.x, ev.z, ev.size, ev.s / rate);
    }
    // Round ends pop where their track stops — an impact is a place, not a timeout.
    for (let i = 0; i < film.rounds.length; i++) {
      if (roundPopped[i]) continue;
      const round = film.rounds[i].round;
      const end = round.b + round.n;
      if (end > 0 && t >= end) {
        roundPopped[i] = true;
        const last = film.rounds[i].poseAt(end - 1);
        pushFlash(last.x, last.z, 1.4, end / rate);
      }
    }

    // -- Hulls.
    _centroid.set(0, 0, 0);
    let centroidN = 0;
    // The fallback camera follows the recorded subject itself — an unclamped
    // centroid would park on the death point while a travelled tape plays out
    // of frame.
    const subjectShip = (slots.find((s) => s.ship && s.ship.player) || slots[0] || {}).ship || null;
    let subjectX = 0, subjectZ = 0, subjectSeen = false;
    for (const slot of slots) {
      const ship = slot.ship;
      const dead = ship.d >= 0 && t >= ship.d;
      const wreckAgeS = dead ? (t - ship.d) / rate : 0;
      // During playback a wreck older than WRECK_SECONDS clears out and stays cleared;
      // the held tableau at the end keeps whatever the final frame carried.
      if (t < ship.b || (Number.isFinite(ship.end) && t > ship.end)
        || (dead && wreckAgeS > WRECK_SECONDS && seconds < film.seconds)) {
        if (slot.obj) {
          slot.obj.visible = false;
          slot.phase = 0; slot.wreckT = -1; slot.cleared = true;
        }
        continue;
      }
      if (!slot.obj) { slot.phase = 3; continue; }
      slot.obj.visible = true;
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
        slot.obj.rotation.x = age * 1.7;
        slot.obj.rotation.z = age * 0.9;
        _centroid.x += slot.obj.position.x; _centroid.z += slot.obj.position.z; centroidN++;
      }
      if (ship === subjectShip && slot.obj) {
        subjectX = slot.obj.position.x; subjectZ = slot.obj.position.z; subjectSeen = true;
      }
    }

    // -- Bolts.
    for (let i = 0; i < film.rounds.length && i < MAX_BOLTS; i++) {
      const round = film.rounds[i].round;
      if (t < round.b || t >= round.b + round.n) continue;
      const pose = film.rounds[i].poseAt(t);
      weaponStage.write(i, round.weaponId, round.team, pose.x, pose.z, pose.vx, pose.vz, dt);
    }
    weaponStage.end();

    // -- Flashes.
    let fi = 0;
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const fl = activeFlashes[i];
      const life = flashProfile.flashOpacityScale < 1 ? 0.24 : FLASH_SECONDS;
      const age = (seconds - fl.t0) / life;
      if (age >= 1) { activeFlashes.splice(i, 1); continue; }
      if (fi >= MAX_FLASHES) break;
      const s = fl.size * flashProfile.flashSizeScale * Math.sin(Math.min(1, Math.max(0, age)) * Math.PI) + 0.001;
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
    _centroid.x = (_centroid.x - originX) * SCALE;
    _centroid.z = (_centroid.z - originZ) * SCALE;
    if (subjectSeen) {
      // Follow the subject wherever the tape carries it; the fight centroid's
      // 40-unit clamp exists for the orbit radius, not the subject's flight.
      _centroid.x = (subjectX - originX) * SCALE;
      _centroid.z = (subjectZ - originZ) * SCALE;
    } else {
      const len = Math.hypot(_centroid.x, _centroid.z);
      if (len > CAM_CENTROID_CLAMP) _centroid.multiplyScalar(CAM_CENTROID_CLAMP / len);
    }
  }

  function orbitCamera(built2, dt) {
    if (control) {
      const index = Math.max(0, Math.min((cameraFrames?.length || 1) - 1, Math.floor(filmTime * 60)));
      const plan = cameraFrames?.[index], next = cameraFrames?.[Math.min(index + 1, cameraFrames.length - 1)];
      const alpha = filmTime * 60 - index;
      let x = _centroid.x, z = _centroid.z, height = CAM_HEIGHT;
      if (plan?.recorded && plan.focus) {
        const to = next?.recorded && next.focus ? next : plan;
        x = (plan.focus.x + (to.focus.x - plan.focus.x) * alpha - originX) * SCALE;
        z = (plan.focus.z + (to.focus.z - plan.focus.z) * alpha - originZ) * SCALE;
        height = Math.max(12, (plan.zoom + (to.zoom - plan.zoom) * alpha) * SCALE);
      }
      const photo = control.photo;
      if (photo?.enabled) {
        x += photo.panX * SCALE; z += photo.panZ * SCALE;
        const distance = Math.max(12, height * 1.6) * photo.distance;
        const horizontal = distance * Math.cos(photo.pitch);
        built2.camera.position.set(x + Math.cos(photo.yaw) * horizontal,
          distance * Math.sin(photo.pitch), z + Math.sin(photo.yaw) * horizontal);
      } else built2.camera.position.set(x, Math.max(12, height), z + 0.01);
      built2.camera.lookAt(x, 0, z);
      return;
    }
    if (!camInit) { _camTarget.copy(_centroid); camInit = true; }
    const k = 1 - Math.exp(-Math.max(0, dt) * CAM_LERP);
    _camTarget.lerp(_centroid, k);
    const az = filmTime * CAM_ORBIT_RAD_S;
    const height = CAM_HEIGHT + Math.sin(filmTime * 0.047) * 4;
    const radius = CAM_RADIUS + Math.sin(filmTime * 0.031) * 5;
    built2.camera.position.set(
      _camTarget.x + Math.cos(az) * radius,
      height,
      _camTarget.z + Math.sin(az) * radius,
    );
    built2.camera.lookAt(_camTarget.x, 0, _camTarget.z);
  }

  return {
    tape,
    ready: [...visualKeys.values()].some((v) => v && v.unitScale > 0),
    roots: [stageRoot],
    update,
    controlsCamera: true,
    dispose() {
      weaponStage.dispose();
      forceStage.dispose();
      for (const slot of slots) if (slot.obj) { fleet.remove(slot.obj); slot.obj = null; }
      activeFlashes.length = 0;
      slots.length = 0;
      for (const v of visualKeys.values()) if (v && v.proto) prototypes.remove(v.proto);
      visualKeys.clear();
    },
  };
}

const FORCE_ACCESSIBILITY = Object.freeze({
  motionAmplitudeScale: 1, animateMotion: true, animatePulse: true,
  pulseScale: 1, radianceScale: 1, opacityScale: 1,
});
const FORCE_REDUCED_FLASH = Object.freeze({ ...FORCE_ACCESSIBILITY,
  animatePulse: false, pulseScale: 0, radianceScale: 0.62, opacityScale: 0.72 });

/** Reuse the game's cable and field recipes against recorded data, never GameState. */
function createForceStage(root, frames) {
  const entities = new Map(), attachments = {};
  const rows = Array.from({ length: FORCE_TAPE_MAX_LINES }, (_, i) => {
    const a = { id: `tape-a-${i}`, alive: true, pos: { x: 0, z: 0 }, rot: 0 };
    const b = { id: `tape-b-${i}`, alive: true, pos: { x: 0, z: 0 }, rot: 0 };
    entities.set(a.id, a); entities.set(b.id, b);
    const link = { id: `tape-line-${i}`, defId: 'tether_standard', state: 'inactive',
      ownerId: a.id, targetId: b.id, load: 0, restLength: 0,
      masslineTelemetry: { tensionFraction: 0 } };
    attachments[link.id] = link;
    return { a, b, link };
  });
  const fieldRows = Array.from({ length: FORCE_TAPE_MAX_FIELDS }, () => ({
    id: null, kind: null, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 0,
    halfAngleRad: 0.56, halfWidth: 52, engaged: false,
  }));
  const facade = { entities, playerId: null, combat: { attachments: { byId: attachments } },
    fields: { active: [] }, simTime: 0, settings: {}, entityList: [] };
  const local = (x, z, out) => { out.x = x; out.z = z; return out; };
  const cables = new NpcCableFx(root, local, (settings) => (
    settings?.video?.flashReduce || settings?.accessibility?.flashReduce ? FORCE_REDUCED_FLASH : FORCE_ACCESSIBILITY
  ));
  const fields = new FieldForcePresentation(root, { toLocal: local });
  let cursor = 0;
  return {
    set settings(value) { facade.settings = value; },
    update(sample, seconds, dt) {
      while (cursor > 0 && frames[cursor]?.sample > sample) cursor--;
      while (cursor + 1 < frames.length && frames[cursor + 1].sample <= sample) cursor++;
      const frame = frames[cursor], next = frames[cursor + 1];
      const alpha = next ? Math.max(0, Math.min(1, (sample - frame.sample) / (next.sample - frame.sample))) : 0;
      facade.simTime = seconds;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i], line = frame?.lines[i];
        row.link.state = line ? 'active' : 'inactive';
        if (!line) continue;
        const to = matchingForce(next?.lines, line.id) || line;
        row.a.pos.x = line.ax + (to.ax - line.ax) * alpha; row.a.pos.z = line.az + (to.az - line.az) * alpha;
        row.b.pos.x = line.bx + (to.bx - line.bx) * alpha; row.b.pos.z = line.bz + (to.bz - line.bz) * alpha;
        row.link.load = line.load + (to.load - line.load) * alpha;
        row.link.restLength = line.restLength;
        row.link.masslineTelemetry.tensionFraction = line.tension;
      }
      const active = facade.fields.active;
      active.length = frame?.fields.length || 0;
      for (let i = 0; i < active.length; i++) {
        const from = frame.fields[i], to = matchingForce(next?.fields, from.id) || from;
        const row = fieldRows[i];
        row.id = from.id; row.kind = from.kind; row.engaged = from.engaged;
        row.center.x = from.center.x + (to.center.x - from.center.x) * alpha;
        row.center.z = from.center.z + (to.center.z - from.center.z) * alpha;
        row.dir.x = from.dir.x; row.dir.z = from.dir.z; row.radius = from.radius;
        row.halfAngleRad = from.halfAngleRad; row.halfWidth = from.halfWidth;
        active[i] = row;
      }
      cables.update(facade);
      fields.update(dt, facade);
    },
    dispose() { cables.dispose(); fields.dispose(); },
  };
}

function visualKey(ship) {
  return `${ship.type || 'ship'}|${ship.visual || ''}|${ship.silhouette || ''}|${ship.factionId || ''}`;
}

function matchingForce(rows, id) {
  for (let i = 0; i < (rows?.length || 0); i++) if (rows[i].id === id) return rows[i];
  return null;
}
