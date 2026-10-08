// src/systems/foldAberrant.js — The Unclosed. World-owned, not a registered system.
// world.js materializes it from _spawnDressingChunks and ticks it beside the machine layer.
// Sim only: no Three.js. Time is state.simTime. The body is kinematic (physicsBody: false);
// the corner and the plate are ordinary dynamic payloads so a tether and a shot are real.

import {
  FOLD,
  foldPhase,
  foldIndex,
  foldRisingEdge,
  foldAttackKind,
  chordSide,
  crossedChord,
  reflectAcrossChord,
  invertRadial,
  dampSpeed,
  chordClearOf,
} from '../data/foldAberrant.js';
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { DEFAULT_MASK, Masks } from '../core/entity.js';

const HEADING = 0.65;
const RIBBON_HALF = 14;
const SCAR_COOLDOWN_S = 8;
const SCAR_FLIP_SCALE = 0.45;
const YANK_DV = 36;
const ORBIT_RATE = 0.85;

function siteRec(state) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.machineSites || typeof ae.machineSites !== 'object') ae.machineSites = {};
  let rec = ae.machineSites[FOLD.siteId];
  if (!rec || typeof rec !== 'object') {
    rec = {};
    ae.machineSites[FOLD.siteId] = rec;
  }
  return rec;
}

function say(world, text) {
  if (!world || !world.bus || typeof world.bus.emit !== 'function') return;
  world.bus.emit('comms:log', { from: 'The Unclosed', kind: 'machine', text });
}

function playerOf(state) {
  if (!state || state.playerId == null || !state.entities || !state.entities.get) return null;
  const player = state.entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return null;
  return player;
}

function speedOf(e) {
  if (!e || !e.vel) return 0;
  const x = Number(e.vel.x) || 0;
  const z = Number(e.vel.z) || 0;
  return Math.hypot(x, z);
}

function massOf(e) {
  const bodyMass = e && e.physicsBody && Number(e.physicsBody.mass);
  if (bodyMass > 0) return bodyMass;
  const m = e && Number(e.mass);
  return m > 0 ? m : 1;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (!(len2 > 1e-6)) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function live(state, id, role) {
  if (id == null || !state || !state.entities || !state.entities.get) return null;
  const e = state.entities.get(id);
  if (!e || e.alive === false) return null;
  const fold = e.data && e.data.foldAberrant;
  if (role && (!fold || fold.role !== role)) return null;
  return e;
}

function findRole(state, role) {
  const list = state && state.entityList;
  if (!list) return null;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e || e.alive === false || !e.data || !e.data.foldAberrant) continue;
    if (e.data.foldAberrant.role === role) return e;
  }
  return null;
}

function pushDressing(bag, ent) {
  if (!bag || !Array.isArray(bag.dressing) || !ent) return;
  bag.dressing.push({
    id: ent.id,
    placeId: null,
    pos: { x: ent.pos.x, z: ent.pos.z },
    paletteClass: 'machine',
  });
}

function dropEntity(world, id) {
  if (id == null || !world) return;
  const helpers = world.helpers;
  if (helpers && typeof helpers.removeEntity === 'function') {
    helpers.removeEntity(id, { immediate: true, reason: 'fold_aberrant' });
    return;
  }
  const e = world.state && world.state.entities && world.state.entities.get(id);
  if (e) e.alive = false;
}

function shove(world, entity, ix, iz) {
  if (!entity || entity.physicsBody === false) return false;
  if (!Number.isFinite(ix) || !Number.isFinite(iz)) return false;
  if (ix === 0 && iz === 0) return false;
  const physics = world && world.helpers && world.helpers.combatPhysics;
  if (physics && typeof physics.applyImpulse === 'function') {
    const accepted = physics.applyImpulse({
      entityId: entity.id,
      impulse: { x: ix, z: iz },
      point: null,
      reason: 'fold_aberrant',
      tick: world.state && world.state.tick,
    });
    if (accepted !== false) return true;
  }
  if (!entity.vel) return false;
  const m = massOf(entity);
  entity.vel.x = (Number(entity.vel.x) || 0) + ix / m;
  entity.vel.z = (Number(entity.vel.z) || 0) + iz / m;
  return false;
}

function reflectVelocity(world, entity, next) {
  if (!entity || !entity.vel || !next) return;
  const vx = Number(entity.vel.x) || 0;
  const vz = Number(entity.vel.z) || 0;
  shove(world, entity, (next.x - vx) * massOf(entity), (next.z - vz) * massOf(entity));
}

function routeFoldDamage(world, attacker, target, amount) {
  if (!world || !target || !(amount > 0)) return null;
  const packet = scalarHitToDamagePacket({
    damage: amount,
    damageType: 'kinetic',
    pos: target.pos ? { x: target.pos.x, z: target.pos.z } : null,
    source: { kind: 'fold_aberrant', siteId: FOLD.siteId },
  });
  const request = {
    attackerId: attacker ? attacker.id : null,
    targetId: target.id,
    packet,
    origin: { kind: 'fold_aberrant', id: attacker ? attacker.id : null },
  };
  const helpers = world.helpers;
  if (helpers && typeof helpers.routeCombatDamage === 'function') {
    return helpers.routeCombatDamage(request);
  }
  if (world.bus && typeof world.bus.emit === 'function') world.bus.emit('combat:routeDamage', request);
  return request;
}

function globalAnchor(world, sectorId) {
  const local = { x: FOLD.anchor.x, z: FOLD.anchor.z };
  if (world && typeof world._toGlobal === 'function') {
    const g = world._toGlobal(local, sectorId);
    if (g && Number.isFinite(g.x) && Number.isFinite(g.z)) return { x: g.x, z: g.z };
  }
  return { x: local.x, z: local.z };
}

function spawnBody(world, active, sectorId, anchor) {
  const state = world.state;
  const phase = foldPhase(state.simTime);
  const ent = world.helpers.spawnEntity({
    type: 'drone',
    team: 1,
    factionId: null,
    pos: { x: anchor.x, z: anchor.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: FOLD.radius,
    mass: 180,
    hull: FOLD.hull,
    hullMax: FOLD.hull,
    collides: true,
    collisionMask: DEFAULT_MASK.drone,
    physicsBody: false,
    homeSectorId: sectorId,
    data: {
      name: 'The Unclosed',
      scanLabel: 'THE UNCLOSED',
      scannerSignalKind: 'anomaly',
      foldAberrant: {
        role: 'body',
        siteId: FOLD.siteId,
        phase,
        prevPhase: phase,
        heading: HEADING,
        anchorX: anchor.x,
        anchorZ: anchor.z,
        classified: false,
        quietRecover: false,
        hazardIndex: null,
        saidShearIndex: null,
        saidMisrepair: false,
        saidLeave: false,
        misrepairEarned: false,
        shownKind: null,
        chord: null,
        chordSide0: 0,
        shearHit: false,
        cornerId: null,
        cornerReleased: false,
        snapped: false,
        plateId: null,
        plateShed: false,
        orbit: null,
        telegraph: null,
      },
    },
  });
  if (!ent) return null;
  ent.vel.x = 0;
  ent.vel.z = 0;
  ent.angVel = 0;
  pushDressing(active, ent);
  const rec = siteRec(state);
  rec.bodyId = ent.id;
  return ent;
}

function spawnScar(world, bag, sectorId, anchor) {
  const state = world.state;
  const existing = findRole(state, 'scar');
  if (existing) return existing;
  const ent = world.helpers.spawnEntity({
    type: 'drone',
    team: 2,
    factionId: null,
    pos: { x: anchor.x, z: anchor.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 14,
    mass: 40,
    hull: 1,
    hullMax: 1,
    collides: false,
    physicsBody: false,
    homeSectorId: sectorId,
    data: {
      name: 'Fold Scar',
      scanLabel: 'FOLD SCAR',
      scannerSignalKind: 'anomaly',
      foldAberrant: {
        role: 'scar',
        siteId: FOLD.siteId,
        phase: foldPhase(state.simTime),
        anchorX: anchor.x,
        anchorZ: anchor.z,
        nextFlipAt: 0,
      },
    },
  });
  if (!ent) return null;
  pushDressing(bag, ent);
  siteRec(state).scarId = ent.id;
  return ent;
}

function spawnSplinter(world, bag, sectorId, anchor) {
  const rec = siteRec(world.state);
  if (rec.splinterSpawned) return null;
  const ent = world.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: anchor.x + 18, z: anchor.z + 8 },
    vel: { x: 6, z: -4 },
    radius: 2.2,
    homeSectorId: sectorId,
    data: {
      kind: 'cargo',
      commodityId: 'cmdty_inertial_datum',
      amount: 1,
      name: 'Inertial Datum',
    },
  });
  if (!ent) return null;
  rec.splinterSpawned = true;
  pushDressing(bag, ent);
  return ent;
}

function sectorBag(world, sectorId) {
  const state = world.state;
  const worldRec = state.world || (state.world = {});
  const contents = worldRec.sectorContents || (worldRec.sectorContents = {});
  let bag = contents[sectorId];
  if (!bag || typeof bag !== 'object') {
    bag = { dressing: [] };
    contents[sectorId] = bag;
  }
  if (!Array.isArray(bag.dressing)) bag.dressing = [];
  return bag;
}

const PAYLOAD_MASK = DEFAULT_MASK.payload | Masks.PROJECTILE;

function spawnCorner(world, bag, body, player) {
  const fold = body.data.foldAberrant;
  const away = fold.heading + Math.PI;
  // Fixed center, chosen once. Not the player.
  const cx = fold.anchorX + Math.cos(away) * 36;
  const cz = fold.anchorZ + Math.sin(away) * 36;
  const ang = away + Math.PI / 2;
  const pos = {
    x: cx + Math.cos(ang) * FOLD.cornerOrbit,
    z: cz + Math.sin(ang) * FOLD.cornerOrbit,
  };
  const ent = world.helpers.spawnEntity({
    type: 'payload',
    team: 1,
    factionId: null,
    pos,
    vel: { x: 0, z: 0 },
    radius: FOLD.cornerRadius,
    mass: FOLD.cornerMass,
    hull: FOLD.cornerHull,
    hullMax: FOLD.cornerHull,
    collides: true,
    collisionMask: PAYLOAD_MASK,
    physicsBody: { mass: FOLD.cornerMass, radius: FOLD.cornerRadius, dynamic: true },
    homeSectorId: body.homeSectorId || FOLD.sectorId,
    data: {
      name: 'Unclosed Corner',
      scanLabel: 'UNCLOSED CORNER',
      foldAberrant: { role: 'corner', siteId: FOLD.siteId, parentId: body.id },
      combat: player ? { targetId: player.id } : null,
    },
  });
  if (!ent) return null;
  fold.cornerId = ent.id;
  fold.cornerReleased = false;
  fold.orbit = { cx, cz, angle: ang };
  pushDressing(bag, ent);
  return ent;
}

function spawnPlate(world, bag, body, player) {
  const fold = body.data.foldAberrant;
  const px = player && player.pos ? player.pos.x : body.pos.x;
  const pz = player && player.pos ? player.pos.z : body.pos.z;
  const ent = world.helpers.spawnEntity({
    type: 'payload',
    team: 1,
    factionId: null,
    pos: { x: px + 22, z: pz },
    vel: { x: 0, z: 0 },
    radius: 5,
    mass: FOLD.cornerMass,
    hull: FOLD.cornerHull,
    hullMax: FOLD.cornerHull,
    collides: true,
    collisionMask: PAYLOAD_MASK,
    physicsBody: { mass: FOLD.cornerMass, radius: 5, dynamic: true },
    homeSectorId: body.homeSectorId || FOLD.sectorId,
    data: {
      name: 'Unclosed Plate',
      scanLabel: 'UNCLOSED PLATE',
      foldAberrant: { role: 'plate', siteId: FOLD.siteId, parentId: body.id },
      combat: player ? { targetId: player.id } : null,
    },
  });
  if (!ent) return null;
  fold.plateId = ent.id;
  fold.plateShed = false;
  if (!fold.saidMisrepair) {
    fold.saidMisrepair = true;
    say(world, 'APPEAL WINDOW CLOSED.');
  }
  pushDressing(bag, ent);
  return ent;
}

function authorChord(body, player) {
  const fold = body.data.foldAberrant;
  const px = player && player.pos ? player.pos.x : body.pos.x + 400;
  const pz = player && player.pos ? player.pos.z : body.pos.z;
  const chord = chordClearOf(body.pos.x, body.pos.z, fold.heading, FOLD.shearLength, px, pz);
  fold.chord = { ax: chord.ax, az: chord.az, bx: chord.bx, bz: chord.bz };
  fold.chordSide0 = chordSide(px, pz, chord.ax, chord.az, chord.bx, chord.bz);
  fold.shearHit = false;
}

function bagFor(world) {
  const contents = world.state && world.state.world && world.state.world.sectorContents;
  const liveBag = contents && contents[FOLD.sectorId];
  if (liveBag && Array.isArray(liveBag.dressing)) return liveBag;
  return sectorBag(world, FOLD.sectorId);
}

function writeTelegraph(state, body, phase, index) {
  const fold = body.data.foldAberrant;
  const grow = phase <= 0.15 ? 0 : phase >= 0.48 ? 1 : (phase - 0.15) / (0.48 - 0.15);
  const spent = phase >= FOLD.passPhase;
  const kind = !spent ? (fold.shownKind || foldAttackKind(index)) : null;
  let cornerX = null;
  let cornerZ = null;
  if (kind === 'corner' && fold.orbit && !fold.cornerReleased) {
    const c = live(state, fold.cornerId, 'corner');
    if (c && c.pos) {
      cornerX = c.pos.x;
      cornerZ = c.pos.z;
    } else {
      cornerX = fold.orbit.cx + Math.cos(fold.orbit.angle) * FOLD.cornerOrbit;
      cornerZ = fold.orbit.cz + Math.sin(fold.orbit.angle) * FOLD.cornerOrbit;
    }
  }
  const chord = kind === 'shear' && fold.chord ? fold.chord : null;
  fold.phase = phase;
  fold.telegraph = {
    kind,
    grow: phase < FOLD.passPhase ? grow : 1,
    recover: phase >= FOLD.passPhase && phase < FOLD.recoverEnd,
    heading: fold.heading,
    ax: chord ? chord.ax : null,
    az: chord ? chord.az : null,
    bx: chord ? chord.bx : null,
    bz: chord ? chord.bz : null,
    cornerX,
    cornerZ,
    disk: kind === 'inside',
    slide: slideOffset(index, grow),
  };
}

function slideOffset(index, grow) {
  const even = (Math.abs(index) % 2) === 0;
  return (even ? grow : (1 - grow)) * FOLD.slide;
}

function placeBody(body, index, phase) {
  const fold = body.data.foldAberrant;
  const grow = phase <= 0.15 ? 0 : phase >= 0.48 ? 1 : (phase - 0.15) / (0.48 - 0.15);
  const offset = slideOffset(index, grow);
  body.pos.x = fold.anchorX + Math.cos(fold.heading) * offset;
  body.pos.z = fold.anchorZ + Math.sin(fold.heading) * offset;
  if (body.vel) {
    body.vel.x = 0;
    body.vel.z = 0;
    if (Number.isFinite(body.vel.y)) body.vel.y = 0;
  }
  body.angVel = 0;
  body.rot = 0;
}

function classify(world, body, player) {
  const fold = body.data.foldAberrant;
  if (!player) {
    fold.classified = false;
    fold.quietRecover = false;
    if (body.data.combat) delete body.data.combat;
    return { inLeash: false, speed: 0 };
  }
  const inLeash = dist2(player.pos.x, player.pos.z, fold.anchorX, fold.anchorZ) <= FOLD.leash * FOLD.leash;
  const speed = speedOf(player);
  if (!inLeash) {
    if (fold.classified && !fold.saidLeave) {
      fold.saidLeave = true;
      say(world, 'VOLUME CLEAR.');
    }
    fold.classified = false;
    fold.quietRecover = false;
    if (body.data.combat) delete body.data.combat;
    return { inLeash: false, speed };
  }
  fold.saidLeave = false;
  if (speed >= FOLD.drift || fold.classified) {
    if (!fold.classified) {
      fold.classified = true;
      say(world, 'CATEGORY: UNRESOLVED. APPLY CONTAINMENT.');
    }
    body.data.combat = { targetId: player.id };
  } else if (body.data.combat) delete body.data.combat;
  return { inLeash: true, speed };
}

function updateQuiet(fold, phase, speed, inLeash) {
  const prev = fold.prevPhase;
  if (prev < FOLD.passPhase && phase >= FOLD.passPhase) {
    fold.quietRecover = !!(fold.classified && inLeash && speed < FOLD.drift);
  }
  if (phase >= FOLD.passPhase && phase < FOLD.recoverEnd && fold.quietRecover && speed >= FOLD.drift) {
    fold.quietRecover = false;
  }
  if (prev < FOLD.recoverEnd && phase >= FOLD.recoverEnd && fold.quietRecover) {
    fold.classified = false;
    fold.quietRecover = false;
    return true;
  }
  return false;
}

function ownedCorner(state, fold) {
  return live(state, fold.cornerId, 'corner');
}

function ownedPlate(state, fold) {
  return live(state, fold.plateId, 'plate');
}

function noteReleased(fold, corner) {
  if (!corner) return;
  if (corner.alive === false || (corner.hull != null && corner.hull <= 0)) fold.cornerReleased = true;
}

function steerCorner(world, corner, fold, dt) {
  if (!corner || !fold.orbit || fold.cornerReleased || !corner.pos) return;
  const prevX = fold.orbit.cx + Math.cos(fold.orbit.angle) * FOLD.cornerOrbit;
  const prevZ = fold.orbit.cz + Math.sin(fold.orbit.angle) * FOLD.cornerOrbit;
  const behind = Math.hypot(corner.pos.x - prevX, corner.pos.z - prevZ);
  if (fold.cornerArmed && behind > FOLD.cornerRelease) {
    fold.cornerReleased = true;
    if (corner.data && corner.data.combat) delete corner.data.combat;
    return;
  }
  fold.cornerArmed = true;
  const ang = fold.orbit.angle + dt * ORBIT_RATE;
  fold.orbit.angle = ang;
  const ix = fold.orbit.cx + Math.cos(ang) * FOLD.cornerOrbit;
  const iz = fold.orbit.cz + Math.sin(ang) * FOLD.cornerOrbit;
  const dx = ix - corner.pos.x;
  const dz = iz - corner.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const vx = corner.vel ? (Number(corner.vel.x) || 0) : 0;
  const vz = corner.vel ? (Number(corner.vel.z) || 0) : 0;
  const want = Math.min(70, dist / Math.max(dt, 1 / 60));
  shove(world, corner, ((dx / dist) * want - vx) * massOf(corner), ((dz / dist) * want - vz) * massOf(corner));
}

function steerPlate(world, plate, fold, player, dt) {
  if (!plate || fold.plateShed || !plate.pos) return;
  const speed = speedOf(plate);
  const playerSpeed = player ? speedOf(player) : 0;
  const hurt = plate.hullMax > 0 && plate.hull < plate.hullMax - 0.5;
  if (speed > FOLD.plateShedSpeed || playerSpeed > FOLD.plateShedSpeed || hurt) {
    fold.plateShed = true;
    if (plate.data && plate.data.combat) delete plate.data.combat;
    return;
  }
  if (player && player.pos) {
    const dx = player.pos.x - plate.pos.x;
    const dz = player.pos.z - plate.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist > 8) {
      const pull = Math.min(22, dist) * massOf(plate) * Math.min(dt, 0.1);
      shove(world, plate, (dx / dist) * pull, (dz / dist) * pull);
    }
  }
  if (plate.vel) {
    const next = dampSpeed(Number(plate.vel.x) || 0, Number(plate.vel.z) || 0, FOLD.plateDampSpeed, dt);
    shove(world, plate, (next.x - (Number(plate.vel.x) || 0)) * massOf(plate), (next.z - (Number(plate.vel.z) || 0)) * massOf(plate));
  }
}

function resolvePass(world, body, player, index) {
  const fold = body.data.foldAberrant;
  const state = world.state;
  let kind = fold.shownKind || foldAttackKind(index);
  if (foldAttackKind(index) === 'misrepair' && !fold.misrepairEarned) kind = 'shear';
  fold.shownKind = kind;
  if (!fold.classified || !player) return;
  if (kind === 'shear') {
    if (fold.saidShearIndex !== index) {
      fold.saidShearIndex = index;
      say(world, 'FOLD INCOMPLETE.');
    }
    const chord = fold.chord;
    if (chord && !fold.shearHit) {
      const side = chordSide(player.pos.x, player.pos.z, chord.ax, chord.az, chord.bx, chord.bz);
      if (crossedChord(fold.chordSide0, side)) {
        fold.shearHit = true;
        const next = reflectAcrossChord(
          Number(player.vel && player.vel.x) || 0,
          Number(player.vel && player.vel.z) || 0,
          chord.ax, chord.az, chord.bx, chord.bz,
        );
        reflectVelocity(world, player, next);
        routeFoldDamage(world, body, player, FOLD.shearDamage);
      }
    }
    return;
  }
  if (kind === 'inside') {
    const inside = dist2(player.pos.x, player.pos.z, body.pos.x, body.pos.z) <= FOLD.insideRadius * FOLD.insideRadius;
    if (inside) {
      const next = invertRadial(
        Number(player.vel.x) || 0,
        Number(player.vel.z) || 0,
        player.pos.x, player.pos.z, body.pos.x, body.pos.z,
      );
      reflectVelocity(world, player, next);
      say(world, 'OUTSIDE IS INSIDE. CONFIRM.');
    }
    return;
  }
  if (kind === 'misrepair') {
    if (fold.plateShed) return;
    const plate = ownedPlate(state, fold);
    const reach = (plate && plate.radius ? plate.radius : 5) + (player.radius || 8) + 6;
    const close = plate && plate.pos
      && dist2(player.pos.x, player.pos.z, plate.pos.x, plate.pos.z) <= reach * reach;
    if (close) {
      routeFoldDamage(world, body, player, FOLD.shearDamage);
      fold.plateShed = true;
      if (plate.data && plate.data.combat) delete plate.data.combat;
      return;
    }
    const ax = body.pos.x;
    const az = body.pos.z;
    const bx = plate && plate.pos ? plate.pos.x : ax + Math.cos(fold.heading) * FOLD.shearLength;
    const bz = plate && plate.pos ? plate.pos.z : az + Math.sin(fold.heading) * FOLD.shearLength;
    const next = reflectAcrossChord(
      Number(player.vel.x) || 0,
      Number(player.vel.z) || 0,
      ax, az, bx, bz,
    );
    reflectVelocity(world, player, next);
    routeFoldDamage(world, body, player, FOLD.shearDamage);
    say(world, 'FOLD INCOMPLETE.');
    dropEntity(world, fold.plateId);
    fold.plateId = null;
    return;
  }
  if (kind === 'corner') {
    const corner = ownedCorner(state, fold);
    noteReleased(fold, corner);
    if (!corner || fold.cornerReleased || fold.snapped) return;
    const onRibbon = distToSeg(
      player.pos.x, player.pos.z,
      body.pos.x, body.pos.z, corner.pos.x, corner.pos.z,
    ) <= RIBBON_HALF;
    fold.snapped = true;
    if (!onRibbon) return;
    const dx = corner.pos.x - player.pos.x;
    const dz = corner.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    shove(world, player, (dx / d) * YANK_DV * massOf(player), (dz / d) * YANK_DV * massOf(player));
    routeFoldDamage(world, body, player, FOLD.cornerDamage);
    return;
  }
}

function maintainHazard(world, body, player, index, phase) {
  const fold = body.data.foldAberrant;
  const state = world.state;
  const bag = bagFor(world);
  if (fold.hazardIndex !== index) {
    if (!fold.cornerReleased) dropEntity(world, fold.cornerId);
    if (!fold.plateShed) dropEntity(world, fold.plateId);
    fold.hazardIndex = index;
    fold.cornerId = null;
    fold.plateId = null;
    fold.cornerReleased = false;
    fold.cornerArmed = false;
    fold.plateShed = false;
    fold.snapped = false;
    fold.shearHit = false;
    fold.orbit = null;
    fold.chord = null;
    fold.chordForClass = false;
    const raw = foldAttackKind(index);
    const inside = player && dist2(player.pos.x, player.pos.z, body.pos.x, body.pos.z) <= FOLD.misrepairR * FOLD.misrepairR;
    fold.misrepairEarned = raw === 'misrepair' && !!inside;
    fold.shownKind = raw === 'misrepair' && !fold.misrepairEarned ? 'shear' : raw;
    if (fold.shownKind === 'shear') authorChord(body, player);
  }
  if (phase >= FOLD.passPhase) return;
  const raw = foldAttackKind(index);
  if (raw === 'misrepair' && fold.misrepairEarned) {
    const inside = player && dist2(player.pos.x, player.pos.z, body.pos.x, body.pos.z) <= FOLD.misrepairR * FOLD.misrepairR;
    if (!inside) {
      fold.misrepairEarned = false;
      fold.shownKind = 'shear';
      if (!fold.plateShed) dropEntity(world, fold.plateId);
      fold.plateId = null;
      if (!fold.chord) authorChord(body, player);
    }
  }
  if (!fold.classified) return;
  if (fold.shownKind === 'shear' && !fold.chordForClass && player) {
    authorChord(body, player);
    fold.chordForClass = true;
  }
  if (fold.shownKind === 'corner' && !fold.cornerReleased && !ownedCorner(state, fold)) {
    spawnCorner(world, bag, body, player);
  }
  if (raw === 'misrepair' && fold.misrepairEarned && !fold.plateShed && !ownedPlate(state, fold)) {
    spawnPlate(world, bag, body, player);
  }
}

function finishRecover(world, body, phase) {
  const fold = body.data.foldAberrant;
  if (phase < FOLD.recoverEnd) return;
  if (!fold.cornerReleased && fold.cornerId != null && fold.snapped) {
    dropEntity(world, fold.cornerId);
    fold.cornerId = null;
  }
  if (!fold.plateShed && fold.plateId != null) {
    dropEntity(world, fold.plateId);
    fold.plateId = null;
  }
}

function tickScar(world, dt) {
  void dt;
  const state = world.state;
  const rec = siteRec(state);
  let scar = live(state, rec.scarId, 'scar') || findRole(state, 'scar');
  if (!scar) return;
  rec.scarId = scar.id;
  const fold = scar.data.foldAberrant;
  fold.phase = foldPhase(state.simTime);
  if (scar.vel) {
    scar.vel.x = 0;
    scar.vel.z = 0;
  }
  const player = playerOf(state);
  if (!player || !player.vel) return;
  const now = Number(state.simTime) || 0;
  if (now < (fold.nextFlipAt || 0)) return;
  if (speedOf(player) <= FOLD.scarFlipSpeed) return;
  if (dist2(player.pos.x, player.pos.z, scar.pos.x, scar.pos.z) > FOLD.scarRadius * FOLD.scarRadius) return;
  const next = invertRadial(
    Number(player.vel.x) || 0,
    Number(player.vel.z) || 0,
    player.pos.x, player.pos.z, scar.pos.x, scar.pos.z,
  );
  const vx = Number(player.vel.x) || 0;
  const vz = Number(player.vel.z) || 0;
  reflectVelocity(world, player, {
    x: vx + (next.x - vx) * SCAR_FLIP_SCALE,
    z: vz + (next.z - vz) * SCAR_FLIP_SCALE,
  });
  fold.nextFlipAt = now + SCAR_COOLDOWN_S;
}

function tickBody(world, body, dt) {
  const state = world.state;
  const fold = body.data.foldAberrant;
  const phase = foldPhase(state.simTime);
  const index = foldIndex(state.simTime);
  placeBody(body, index, phase);
  const player = playerOf(state);
  const cls = classify(world, body, player);
  if (updateQuiet(fold, phase, cls.speed, cls.inLeash)) {
    if (body.data.combat) delete body.data.combat;
  }
  // Quiet-clear can drop classification before the hazard couples.
  maintainHazard(world, body, player, index, phase);
  const corner = ownedCorner(state, fold);
  if (corner) {
    noteReleased(fold, corner);
    if (fold.cornerReleased && corner.data && corner.data.combat) delete corner.data.combat;
    else steerCorner(world, corner, fold, dt);
  } else if (fold.cornerId != null && !fold.cornerReleased) {
    fold.cornerReleased = true;
  }
  const plate = ownedPlate(state, fold);
  if (plate) steerPlate(world, plate, fold, player, dt);
  if (foldRisingEdge(fold.prevPhase, phase)) resolvePass(world, body, player, index);
  finishRecover(world, body, phase);
  // Re-zero: a rejected impulse must not become a flight command on the kinematic body.
  placeBody(body, index, phase);
  writeTelegraph(state, body, phase, index);
  fold.prevPhase = phase;
  fold.phase = phase;
}

export function materializeFoldAberrant(world, sector, active) {
  if (!world || !sector || sector.id !== FOLD.sectorId || !world.helpers || !world.state) return;
  const state = world.state;
  const rec = siteRec(state);
  const anchor = globalAnchor(world, sector.id);
  if (rec.foldCleared) {
    spawnScar(world, active, sector.id, anchor);
    if (!rec.splinterSpawned) spawnSplinter(world, active, sector.id, anchor);
    return;
  }
  const existing = live(state, rec.bodyId, 'body') || findRole(state, 'body');
  if (existing) {
    rec.bodyId = existing.id;
    return;
  }
  spawnBody(world, active, sector.id, anchor);
}

export function tickFoldAberrant(world, dt) {
  const state = world && world.state;
  if (!state || !(dt > 0)) return;
  const sectorId = state.world && state.world.currentSectorId;
  if (sectorId !== FOLD.sectorId) return;
  const rec = siteRec(state);
  if (!rec.foldCleared) {
    const body = live(state, rec.bodyId, 'body') || findRole(state, 'body');
    if (body) {
      rec.bodyId = body.id;
      tickBody(world, body, dt);
    }
  }
  if (rec.foldCleared || findRole(state, 'scar')) tickScar(world, dt);
}

/**
 * entity:killed only. Corner and plate deaths must not complete the fold.
 * A missing body (already stripped) fails closed and does not write the flag.
 */
export function noteFoldAberrantKilled(world, payload) {
  const state = world && world.state;
  if (!state || !payload || payload.id == null || !state.entities || !state.entities.get) return;
  const ent = state.entities.get(payload.id);
  const fold = ent && ent.data && ent.data.foldAberrant;
  if (!fold) return;
  if (fold.role === 'corner' || fold.role === 'plate') {
    const parent = live(state, fold.parentId, 'body') || (state.entities.get(fold.parentId));
    const parentFold = parent && parent.data && parent.data.foldAberrant;
    if (parentFold && parentFold.role === 'body') {
      if (fold.role === 'corner') parentFold.cornerReleased = true;
      if (fold.role === 'plate') parentFold.plateShed = true;
    }
    return;
  }
  if (fold.role !== 'body') return;
  const rec = siteRec(state);
  rec.foldCleared = true;
  rec.bodyId = null;
  say(world, 'FOLD COMPLETE.');
  if (!fold.cornerReleased) dropEntity(world, fold.cornerId);
  if (!fold.plateShed) dropEntity(world, fold.plateId);
  const anchor = { x: fold.anchorX, z: fold.anchorZ };
  const bag = sectorBag(world, FOLD.sectorId);
  if (world.helpers && typeof world.helpers.spawnEntity === 'function') {
    spawnScar(world, bag, FOLD.sectorId, anchor);
    spawnSplinter(world, bag, FOLD.sectorId, anchor);
  }
}
