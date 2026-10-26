// Deterministic shot input for the production weapon presenter. This is a bench-only adapter:
// it owns WHEN a shot is born and where its contact lands, and never draws a frame itself.
// Everything visible comes from src/render/weapons/presenter.js, the production
// PersistentCombatBeamPool, and the shared weapon recipes.
//
// The production weapons system owns ammo, spread, RNG, damage and collision. This adapter uses
// the same authored projectile speed and recipe, quantizes flight to the 60 Hz presentation
// clock, and emits production-shaped `handleFire` / `handleHit` calls. See README.md.
import * as THREE from 'three';
import { modelTruthBoltRadius } from '../../src/data/modelTruth.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PersistentCombatBeamPool } from '../../src/render/combat/persistentBeams.js';
import { WeaponVfxPresenter } from '../../src/render/weapons/presenter.js';
import { resolveWeaponRecipe, WEAPON_SOCKET_NAME } from '../../src/render/weapons/recipes.js';
import { worldSizeForPixels } from '../../src/render/weapons/pixelFloor.js';
import { resolveVfxAccessibilityProfile } from '../../src/render/vfxAccessibility.js';
import { resolveMuzzleProfile } from '../../src/render/vfxProfiles.js';

const STEP = 1 / 60;
const BEAM_CONTACT_INTERVAL = 0.08;

const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));

function makeRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const ambient = Math.random;
  const random = makeRandom(seed);
  try {
    Math.random = random;
    return fn();
  } finally {
    Math.random = ambient;
  }
}

function round6(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function boltRadiusFor(entity) {
  const radius = Number(modelTruthBoltRadius(entity));
  return Number.isFinite(radius) && radius > 0 ? radius : 0.7;
}

export function createWeaponSequence({
  scene, camera, state, ownerMesh, targetMesh, ownerEntity, targetEntity,
  viewportHeight = 900, seed = 17, onImpact = null, onFire = null,
}) {
  if (!scene || !camera || !ownerMesh || !targetMesh || !ownerEntity || !targetEntity) {
    throw new Error('createWeaponSequence needs scene, camera, both meshes and both entities');
  }
  const root = new THREE.Group();
  root.name = 'CombatFeelProductionWeaponVfx';
  scene.add(root);
  const meshes = new Map([[ownerEntity.id, ownerMesh], [targetEntity.id, targetMesh]]);
  const entities = new Map([[ownerEntity.id, ownerEntity], [targetEntity.id, targetEntity]]);
  const privateState = {
    ...state,
    mode: 'flight',
    playerId: ownerEntity.id,
    simTime: 0,
    entities,
    entityList: [ownerEntity, targetEntity],
    entityIndex: null,
    fields: { active: [] },
    render: { ...(state && state.render ? state.render : {}), scene: root, camera, meshes },
  };
  const socketScratch = new THREE.Vector3();
  let presenter = null;
  let combatBeams = null;
  let clock = 0;
  let runSeed = Number(seed) >>> 0;
  let disposed = false;
  let shotSerial = 0;
  const shots = [];

  function ensureBeams() {
    if (combatBeams) return combatBeams;
    combatBeams = new PersistentCombatBeamPool(THREE, { scene: root, maxBeams: 4, timeoutS: 0.14 });
    root.add(combatBeams.group);
    return combatBeams;
  }

  function socketWorldPose() {
    const socket = ownerMesh.getObjectByName(WEAPON_SOCKET_NAME);
    if (!socket) return null;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(socketScratch);
    return {
      x: socketScratch.x,
      y: socketScratch.y,
      z: socketScratch.z,
      forwardX: Math.cos(Number(ownerEntity.rot) || 0),
      forwardY: 0,
      forwardZ: Math.sin(Number(ownerEntity.rot) || 0),
    };
  }

  function ensureEntities() {
    entities.clear();
    entities.set(ownerEntity.id, ownerEntity);
    entities.set(targetEntity.id, targetEntity);
    for (const shot of shots) {
      if (shot.projectile && shot.projectile.alive) entities.set(shot.projectile.id, shot.projectile);
    }
    privateState.entityList = [ownerEntity, targetEntity];
    for (const shot of shots) {
      if (shot.projectile && shot.projectile.alive) privateState.entityList.push(shot.projectile);
    }
  }

  function publishPresent(dt) {
    presenter.update(dt, {
      state: privateState,
      camera,
      viewportHeight,
      interpolationAlpha: 1,
    });
    if (combatBeams) {
      const profile = resolveVfxAccessibilityProfile(privateState.settings);
      const cameraDistance = camera.position.length();
      combatBeams.update(
        clock,
        null,
        profile,
        worldSizeForPixels(cameraDistance, 8, camera.fov, viewportHeight),
        (entry) => {
          if (entry.ownerId !== ownerEntity.id) return null;
          const beamShot = shots.find((shot) => shot.beam && shot.launched && !shot.stopped);
          return beamShot ? { ...beamShot.start, forwardX: beamShot.axis.x, forwardY: 0, forwardZ: beamShot.axis.z } : null;
        },
      );
    }
  }

  function reset({ time = 0, seed: nextSeed = runSeed } = {}) {
    if (disposed) throw new Error('Weapon sequence is disposed');
    clock = Number(time) || 0;
    runSeed = Number(nextSeed) >>> 0;
    if (presenter) presenter.dispose();
    if (combatBeams) {
      combatBeams.dispose();
      combatBeams = null;
    }
    shots.length = 0;
    shotSerial = 0;
    entities.clear();
    entities.set(ownerEntity.id, ownerEntity);
    entities.set(targetEntity.id, targetEntity);
    privateState.playerId = ownerEntity.id;
    privateState.simTime = clock;
    privateState.settings = state.settings || { video: {}, accessibility: {} };
    privateState.fields = state.fields || { active: [] };
    withSeededRandom(runSeed, () => {
      presenter = new WeaponVfxPresenter({
        scene: root,
        state: privateState,
        helpers: { socketWorldPose: () => socketWorldPose() },
      });
      presenter.discharges.sequence = runSeed;
      if (presenter.quarks) presenter.quarks._flowSequence = runSeed;
      publishPresent(0);
    });
    ensureEntities();
    return inspect();
  }

  function arm({ weaponId, contact = 'hull', fireAt = 0.2, releaseAfterSeconds = null }) {
    if (disposed) throw new Error('Weapon sequence is disposed');
    const weapon = WEAPON_BY_ID.get(weaponId);
    if (!weapon) throw new Error(`Unknown weapon ${weaponId}`);
    const beam = weapon.continuous === true;
    if (!beam && !(Number(weapon.projSpeed) > 0)) {
      throw new Error(`${weaponId} has no finite projectile speed`);
    }
    const socket = ownerMesh.getObjectByName(WEAPON_SOCKET_NAME);
    let start;
    let socketMode;
    if (socket) {
      start = socketWorldPose();
      socketMode = `authored ${WEAPON_SOCKET_NAME}`;
    } else {
      const rot = Number(ownerEntity.rot) || 0;
      start = {
        x: ownerEntity.pos.x + Math.cos(rot) * ownerEntity.radius,
        y: 0.4,
        z: ownerEntity.pos.z + Math.sin(rot) * ownerEntity.radius,
        forwardX: Math.cos(rot), forwardY: 0, forwardZ: Math.sin(rot),
      };
      socketMode = 'radius fallback (no authored socket)';
    }
    const dx = targetEntity.pos.x - start.x;
    const dz = targetEntity.pos.z - start.z;
    const distance = Math.hypot(dx, dz);
    const contactRadius = contact === 'shield'
      ? Number(targetEntity.radius)
      : Number(targetEntity.contactRadius) || Number(targetEntity.radius);
    if (!(distance > contactRadius)) {
      throw new Error(`${weaponId}: muzzle must sit outside the target`);
    }
    const axis = { x: dx / distance, z: dz / distance };
    const end = {
      x: targetEntity.pos.x - axis.x * contactRadius,
      y: 0.4,
      z: targetEntity.pos.z - axis.z * contactRadius,
    };
    const aimedDistance = Math.hypot(end.x - start.x, end.z - start.z);
    const rawTravel = beam ? 0 : aimedDistance / Number(weapon.projSpeed);
    const flightFrames = beam ? 0 : Math.max(1, Math.ceil(rawTravel / STEP - 1e-8));
    const travelSeconds = round6(flightFrames * STEP);
    const contactAt = round6(Number(fireAt) + travelSeconds);
    const releaseAt = beam
      ? round6(Number(fireAt) + Math.max(0.1, Number(releaseAfterSeconds) || 1.2))
      : contactAt;
    const shot = {
      index: shotSerial++,
      weaponId,
      weapon,
      recipe: resolveWeaponRecipe(weaponId, weapon),
      contact,
      beam,
      fireAt: round6(fireAt),
      contactAt,
      releaseAt,
      travelSeconds,
      flightFrames,
      distanceWu: round6(aimedDistance),
      socketMode,
      start: { x: start.x, y: start.y, z: start.z },
      end,
      axis,
      launched: false,
      launchedAt: null,
      hit: false,
      stopped: false,
      impacts: 0,
      nextContactAt: Infinity,
      projectile: null,
      beamReceipt: null,
      beamProfile: beam ? resolveMuzzleProfile(weaponId) : null,
      lastImpactKind: null,
    };
    shots.push(shot);
    return summarizeShot(shot);
  }

  function launch(shot) {
    shot.launched = true;
    shot.launchedAt = clock;
    const payload = { ...shot.weapon, weaponId: shot.weaponId, ownerId: ownerEntity.id, hardpointIdx: 0 };
    presenter.handleFire(payload, shot.start, Math.atan2(shot.axis.z, shot.axis.x));
    if (typeof onFire === 'function') onFire({ shot, weapon: shot.weapon, atS: round6(clock) });
    if (shot.beam) {
      ensureBeams();
      shot.beamReceipt = {
        beamKey: `${ownerEntity.id}:0:${shot.index}`,
        ownerId: ownerEntity.id,
        weaponId: shot.weaponId,
        hardpointIdx: 0,
        from: shot.start,
        to: shot.end,
        continuous: true,
        phase: 'begin',
      };
      combatBeams.upsert(shot.beamReceipt, clock, shot.beamProfile);
      impact(shot);
      shot.nextContactAt = clock + BEAM_CONTACT_INTERVAL;
      return;
    }
    const projectile = {
      id: 900000 + (runSeed % 1000) * 10 + shot.index,
      type: 'projectile',
      alive: true,
      ownerId: ownerEntity.id,
      team: 0,
      pos: { x: shot.start.x, z: shot.start.z },
      prevPos: { x: shot.start.x, z: shot.start.z },
      vel: { x: shot.axis.x * shot.weapon.projSpeed, z: shot.axis.z * shot.weapon.projSpeed },
      rot: Math.atan2(shot.axis.z, shot.axis.x),
      radius: boltRadiusFor(ownerEntity),
      data: { ...shot.weapon, weaponId: shot.weaponId },
    };
    shot.projectile = projectile;
    entities.set(projectile.id, projectile);
    ensureEntities();
  }

  function impact(shot) {
    if (shot.hit && !shot.beam) return;
    if (!shot.hit) shot.hit = true;
    if (shot.projectile) {
      shot.projectile.alive = false;
      entities.delete(shot.projectile.id);
      ensureEntities();
    }
    shot.impacts += 1;
    shot.lastImpactKind = shot.contact;
    const payload = {
      ...shot.weapon,
      weaponId: shot.weaponId,
      ownerId: ownerEntity.id,
      targetId: targetEntity.id,
      pos: { ...shot.end },
      normal: { x: -shot.axis.x, y: 0, z: -shot.axis.z },
      approach: { x: shot.axis.x, y: 0, z: shot.axis.z },
      targetRadius: targetEntity.radius,
    };
    presenter.handleHit(payload, shot.contact === 'shield');
    if (typeof onImpact === 'function') {
      onImpact({
        shot,
        weapon: shot.weapon,
        contact: shot.contact,
        point: { ...shot.end },
        normal: payload.normal,
        approach: payload.approach,
        damage: shot.weapon.continuous
          ? Number(shot.weapon.dmg) * BEAM_CONTACT_INTERVAL
          : Number(shot.weapon.dmg),
        atS: round6(clock + (shot.launchedAt == null ? 0 : 0)),
      });
    }
  }

  function advance(time) {
    if (disposed) return;
    const targetTime = Number(time);
    if (!Number.isFinite(targetTime)) return;
    while (clock < targetTime - 1e-9) {
      const dt = Math.min(STEP, targetTime - clock);
      clock = round6(clock + dt);
      privateState.simTime = clock;
      for (const shot of shots) {
        if (!shot.launched && clock + 1e-9 >= shot.fireAt) launch(shot);
        if (!shot.launched) continue;
        if (shot.beam) {
          if (shot.stopped) continue;
          if (clock + 1e-9 >= shot.releaseAt) {
            combatBeams.stop(shot.beamReceipt);
            shot.stopped = true;
          } else if (clock + 1e-9 >= shot.nextContactAt) {
            shot.beamReceipt.phase = 'update';
            combatBeams.upsert(shot.beamReceipt, clock, shot.beamProfile);
            impact(shot);
            shot.nextContactAt = clock + BEAM_CONTACT_INTERVAL;
          } else {
            shot.beamReceipt.phase = 'update';
            combatBeams.upsert(shot.beamReceipt, clock, shot.beamProfile);
          }
          continue;
        }
        if (shot.hit) continue;
        const age = Math.max(0, clock - shot.fireAt);
        const progress = Math.min(1, age / Math.max(1e-9, shot.travelSeconds));
        const projectile = shot.projectile;
        if (projectile) {
          projectile.prevPos.x = projectile.pos.x;
          projectile.prevPos.z = projectile.pos.z;
          projectile.pos.x = shot.start.x + (shot.end.x - shot.start.x) * progress;
          projectile.pos.z = shot.start.z + (shot.end.z - shot.start.z) * progress;
        }
        if (clock + 1e-9 >= shot.contactAt) {
          if (projectile) {
            projectile.pos.x = shot.end.x;
            projectile.pos.z = shot.end.z;
          }
          impact(shot);
        }
      }
    }
    ensureEntities();
  }

  function present(dt = STEP) {
    if (disposed) return;
    publishPresent(dt);
  }

  function summarizeShot(shot) {
    return {
      index: shot.index,
      weaponId: shot.weaponId,
      contact: shot.contact,
      fireAt: shot.fireAt,
      contactAt: shot.contactAt,
      releaseAt: shot.releaseAt,
      travelSeconds: shot.travelSeconds,
      flightFrames: shot.flightFrames,
      distanceWu: shot.distanceWu,
      beam: shot.beam,
      socketMode: shot.socketMode,
      launched: shot.launched,
      hit: shot.hit,
      stopped: shot.stopped,
      impacts: shot.impacts,
    };
  }

  function quarksCounts() {
    const q = presenter && presenter.quarks;
    if (!q) return {};
    const count = (system) => (system && Number(system.particleNum) > 0 ? Number(system.particleNum) : 0);
    return {
      impactSpall: count(q.impactSpall),
      shieldShards: count(q.shieldShards),
      muzzleSparks: count(q.muzzleSparks),
      casingEjection: count(q.casingEjection),
      damageVenting: count(q.damageVenting),
      shrapnel: count(q.shrapnel),
      collisionSpall: count(q.collisionSpall),
      iceSpall: count(q.iceSpall),
      cargoDebris: count(q.cargoDebris),
    };
  }

  function lightStats() {
    const lights = presenter && presenter.lights;
    if (!lights) return { live: 0, peak: 0 };
    let peak = 0;
    for (const slot of lights.slots) {
      if (!slot.alive || !slot.light) continue;
      peak = Math.max(peak, Number(slot.light.intensity) || 0);
    }
    return { live: Number(lights.live) || 0, peak: round6(peak) };
  }

  function inspect() {
    const q = quarksCounts();
    const light = lightStats();
    const activeBeams = combatBeams ? combatBeams.activeCount : 0;
    const bolts = presenter ? presenter.bolts.live : 0;
    const discharges = presenter ? presenter.discharges.activeCount : 0;
    const scorches = presenter ? presenter.scorches.live : 0;
    const heavyImpacts = presenter ? presenter.heavyImpacts.live : 0;
    const particles = Object.values(q).reduce((sum, value) => sum + value, 0);
    const anyFlight = shots.some((shot) => shot.launched && !shot.hit);
    const anyBeamWorking = shots.some((shot) => shot.beam && shot.launched && !shot.stopped);
    const allHit = shots.length > 0 && shots.every((shot) => shot.hit || shot.stopped);
    const stage = !shots.length ? 'idle'
      : !shots.some((shot) => shot.launched) ? 'armed'
        : anyFlight ? 'travel'
          : anyBeamWorking ? 'working'
            : allHit ? 'settling' : 'contact';
    return {
      stage,
      time: round6(clock),
      shots: shots.map(summarizeShot),
      counts: {
        muzzle: discharges + q.muzzleSparks + q.casingEjection,
        discharges,
        bolts,
        beams: activeBeams,
        travel: bolts + activeBeams,
        scorches,
        heavyImpacts,
        lights: light.live,
        lightPeak: light.peak,
        particles,
        ...q,
      },
      contact: shots.find((shot) => shot.hit)
        ? { kind: shots.find((shot) => shot.hit).contact, atS: shots.find((shot) => shot.hit).contactAt, impacts: shots.reduce((sum, shot) => sum + shot.impacts, 0) }
        : null,
      beamProfile: shots.find((shot) => shot.beam)?.beamProfile || null,
      socketMode: shots[0] ? shots[0].socketMode : null,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (combatBeams) combatBeams.dispose();
    if (presenter) presenter.dispose();
    root.removeFromParent();
    shots.length = 0;
    entities.clear();
    meshes.clear();
  }

  reset({ time: 0, seed: runSeed });
  return { root, reset, arm, advance, present, inspect, dispose, get presenter() { return presenter; }, get clock() { return clock; } };
}
