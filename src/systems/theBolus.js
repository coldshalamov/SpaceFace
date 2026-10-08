// The Bolus — interior host. One volume, one fungus, one Massline.
// Spawns the seeded cast and ticks the throat. No second ecology, no second grapple.

import { addCargo } from './cargo.js';
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { Masks } from '../core/entity.js';
import {
  BOLUS_SECTOR_ID,
  BOLUS_ACID_X0,
  BOLUS_ACID_X1,
  planBolusLayout,
  bolusResolvedSpec,
  commitBolusLatch,
  bolusInCone,
  bolusIrisOpen,
} from '../data/theBolus.js';
import { BOLUS_FORCES as F } from '../data/bolusForces.js';
import { BOLUS_CUE } from '../data/bolusAudio.js';

const DRIVEN = new Set(['louse', 'drum', 'fingerling', 'floater', 'mite', 'glove']);
const LOOSE = new Set(['drum', 'rib', 'bezoar', 'cyst']);
const SMALL = new Set(['louse', 'mite', 'fingerling']);
const CROOK_AT = { x: 480, z: -1680 };
const SPUR_AT = { x: 640, z: 80 };

export function materializeBolus(world, sector, active) {
  if (!world || !sector || sector.id !== BOLUS_SECTOR_ID) return;
  const spawn = world.helpers && world.helpers.spawnEntity;
  if (typeof spawn !== 'function' || typeof world._toGlobal !== 'function') return;
  const state = world.state;
  const seed = state && state.meta ? state.meta.seed : 1;
  const flags = state ? ensureAlienEcologyState(state).sectorFlags : {};
  const layout = planBolusLayout(seed);
  for (let i = 0; i < layout.length; i++) {
    const spec = bolusResolvedSpec(layout[i], flags);
    const pos = world._toGlobal({ x: spec.x, z: spec.z }, sector.id);
    const ent = spawn({
      type: 'fauna',
      name: spec.name,
      pos,
      rot: spec.rot || 0,
      radius: spec.radius,
      mass: spec.mass,
      hull: spec.dynamic ? 48 : 900,
      hullMax: spec.dynamic ? 48 : 900,
      collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID,
      physicsBody: {
        dynamic: !!spec.dynamic,
        mass: spec.mass,
        radius: spec.radius,
        material: 'fauna',
        shape: 'ball',
      },
      homeSectorId: sector.id,
      data: {
        name: spec.name,
        strainId: 'ashfall_choir',
        masslineTetherable: true,
        bolus: {
          role: spec.role,
          key: spec.key,
          anchorX: spec.x,
          anchorZ: spec.z,
          phase: spec.phase || 0,
          hold: 0,
          spent: false,
        },
        ecology: {
          speciesId: spec.speciesId,
          driveState: spec.dynamic ? 'drift' : 'anchored',
          phase: spec.phase || 0,
          anchor: { x: pos.x, z: pos.z },
        },
      },
    });
    if (!ent) continue;
    if (typeof world._stampHomeSector === 'function') world._stampHomeSector(ent, sector.id);
    if (active && Array.isArray(active.dressing)) {
      active.dressing.push({ id: ent.id, placeId: null, pos: ent.pos, paletteClass: 'alien' });
    }
  }
}

function tautTargetIds(state) {
  const out = new Set();
  const phase = state.player && state.player.tether && state.player.tether.phase;
  if (phase !== 'loaded' && phase !== 'overload') return out;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return out;
  const pid = state.playerId;
  const rows = Object.values(byId);
  for (let i = 0; i < rows.length; i++) {
    const att = rows[i];
    if (!att || att.state !== 'active') continue;
    if (att.ownerId !== pid && att.controllerId !== pid) continue;
    if (att.targetId != null) out.add(att.targetId);
  }
  return out;
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  if (!vel) return 0;
  return Math.hypot(vel.x || 0, vel.z || 0);
}

function push(entity, ix, iz) {
  if (!entity) return;
  if (!entity.vel) entity.vel = { x: 0, y: 0, z: 0 };
  entity.vel.x += ix;
  entity.vel.z += iz;
  queuePhysicsImpulse(entity, { x: ix, y: 0, z: iz });
}

function drive(entity, vx, vz) {
  if (!entity) return;
  if (!entity.vel) entity.vel = { x: 0, y: 0, z: 0 };
  const dx = vx - (entity.vel.x || 0);
  const dz = vz - (entity.vel.z || 0);
  entity.vel.x = vx;
  entity.vel.z = vz;
  if (dx !== 0 || dz !== 0) queuePhysicsImpulse(entity, { x: dx, y: 0, z: dz });
}

function hurt(entity, amount) {
  if (!entity || !(amount > 0)) return;
  let left = amount;
  const shield = Number(entity.shield) || 0;
  if (shield > 0) {
    const used = shield < left ? shield : left;
    entity.shield = shield - used;
    left -= used;
  }
  if (left > 0) entity.hull = Math.max(0, (Number(entity.hull) || 0) - left);
}

function toast(world, text) {
  const bus = world && world.bus;
  if (bus && typeof bus.emit === 'function') bus.emit('toast', { text, kind: 'info', ttl: 3.4 });
}

function cue(world, id) {
  const bus = world && world.bus;
  if (bus && typeof bus.emit === 'function') bus.emit('audio:cue', { id });
}

function kickHold(flags, simTime) {
  return Number(flags['bolus:crestHoldUntil']) > simTime
    || Number(flags['bolus:irisKickUntil']) > simTime
    || Number(flags['bolus:baleenKickUntil']) > simTime
    || Number(flags['bolus:pleatHoldUntil']) > simTime;
}

export function tickBolus(world, dt) {
  const state = world && world.state;
  if (!state || !(dt > 0)) return;
  if (!state.world || state.world.currentSectorId !== BOLUS_SECTOR_ID) return;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || !player.pos || player.alive === false) return;
  const step = dt > 0.1 ? 0.1 : dt;
  const origin = world._sectorOrigin(BOLUS_SECTOR_ID);
  if (!origin) return;
  if (!player.vel) player.vel = { x: 0, y: 0, z: 0 };
  const lx = player.pos.x - origin.x;
  const lz = player.pos.z - origin.z;
  const simTime = Number(state.simTime) || 0;
  const ae = ensureAlienEcologyState(state);
  const flags = ae.sectorFlags;
  const taut = tautTargetIds(state);
  const speed = speedOf(player);
  const boosting = !!(player.flags && player.flags.boosting);
  const rot = player.rot || 0;
  const cast = [];

  ae.exposure = Math.min(1, (ae.exposure || 0) + F.exposurePerSec * step);
  if (boosting || speed >= F.fast) flags['bolus:fastFor'] = (Number(flags['bolus:fastFor']) || 0) + step;
  else flags['bolus:fastFor'] = 0;

  let toothRising = false;
  let uvulaHold = 0;
  let uvulaHeld = false;
  let pleat = false;
  let crookHeld = false;
  let miteHit = false;
  let baleenCandidate = false;
  let gloveCandidate = null;

  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const ent = list[i];
    if (!ent || ent.alive === false || !ent.data || !ent.data.bolus) continue;
    if (ent.homeSectorId !== BOLUS_SECTOR_ID) continue;
    const tag = ent.data.bolus;
    const heldLine = taut.has(ent.id);
    const wasHeld = tag.held === true;
    if (wasHeld && !heldLine && LOOSE.has(tag.role)) {
      flags[`bolus:loose:${tag.key}`] = simTime + F.looseWindow;
    }
    tag.held = heldLine;
    if (!heldLine) {
      tag.hold = 0;
      tag.spent = false;
    } else {
      tag.hold = (tag.hold || 0) + step;
      if (tag.role === 'tendon' && !tag.spent) {
        tag.spent = true;
        flags['bolus:peristalsisUntil'] = simTime + 12;
      }
      if (!tag.spent && tag.role !== 'tendon') {
        const committed = commitBolusLatch(flags, tag.role, tag.key, tag.hold, simTime);
        if (committed) {
          tag.spent = true;
          if (committed.cargo) addCargo(state, committed.cargo, committed.qty);
          if (committed.exposure) ae.exposure = Math.min(1, (ae.exposure || 0) + committed.exposure);
          if (committed.toast) toast(world, committed.toast);
          cue(world, BOLUS_CUE.latch);
          if (committed.event === 'suture') {
            tag.role = 'suture';
            if (!ent.data.ecology) ent.data.ecology = {};
            ent.data.ecology.speciesId = 'bolus_suture';
            ent.data.name = 'White Suture';
            ent.mass = 2400;
            if (ent.physicsBody && typeof ent.physicsBody === 'object') {
              ent.physicsBody.dynamic = false;
              ent.physicsBody.mass = 2400;
              if (Number.isFinite(ent.physicsBody.revision)) ent.physicsBody.revision += 1;
            }
          }
          if (committed.event === 'pleat') pleat = true;
        }
      }
    }
    if (heldLine && tag.role === 'tooth') {
      if (flags['bolus:toothHeld'] !== true && !(Number(flags['bolus:toothYankUntil']) > simTime)) toothRising = true;
    }
    if (heldLine && tag.role === 'uvula') {
      uvulaHeld = true;
      uvulaHold = tag.hold;
    }
    if (heldLine && tag.role === 'crook' && tag.hold >= 0.4) crookHeld = true;
    const ex = ent.pos.x - origin.x;
    const ez = ent.pos.z - origin.z;
    if (tag.role === 'mite' && !flags['bolus:mite'] && Math.hypot(ex - lx, ez - lz) < 36 && speed < F.limp) {
      miteHit = true;
    }
    if (tag.role === 'baleen' && boosting && Math.hypot(ex - lx, ez - lz) < F.baleenReach
        && !(Number(flags['bolus:baleenUntil']) > simTime)) {
      baleenCandidate = true;
    }
    if (tag.role === 'glove') {
      const near = Math.hypot(ex - lx, ez - lz) < F.gloveReach;
      if (!near) tag.gloveHot = false;
      else if (!tag.gloveHot) {
        const frenum = Number(flags['bolus:frenumUntil']) > simTime;
        if (speed < F.limp) {
          const kx = F.gloveKnob.x - lx;
          const kz = F.gloveKnob.z - lz;
          const dist = Math.hypot(kx, kz) || 1;
          gloveCandidate = { tag, ix: (kx / dist) * F.gloveNudge, iz: (kz / dist) * F.gloveNudge };
        } else if (!frenum && speed >= F.fast) {
          const gx = ex - lx;
          const gz = ez - lz;
          const dist = Math.hypot(gx, gz) || 1;
          gloveCandidate = { tag, ix: (gx / dist) * F.gloveYank, iz: (gz / dist) * F.gloveYank };
        }
      }
    }
    cast.push({ ent, tag, heldLine, ex, ez });
  }

  let ix = 0;
  let iz = 0;
  let xKicked = false;
  let zKicked = false;
  const sour = !!flags['bolus:papilla'];

  if (toothRising) {
    ix = sour ? F.toothXSour : F.toothX;
    xKicked = true;
    flags['bolus:toothYankUntil'] = simTime + F.toothQuiet;
  } else if (!bolusIrisOpen(simTime) && !(Number(flags['bolus:hushUntil']) > simTime)
      && !(Number(flags['bolus:irisBumpUntil']) > simTime)
      && Math.abs(lz - F.irisAt) < F.irisHalfWidth && Math.abs(lx) < F.irisSkirt) {
    iz = (lz <= F.irisAt ? -1 : 1) * F.irisZ;
    zKicked = true;
    flags['bolus:irisBumpUntil'] = simTime + F.irisQuiet;
    flags['bolus:irisKickUntil'] = simTime + F.irisKick;
    cue(world, BOLUS_CUE.iris);
  } else if (pleat) {
    iz = F.pleatZ;
    zKicked = true;
    flags['bolus:pleatHoldUntil'] = simTime + F.pleatHold;
  } else if (baleenCandidate) {
    iz = F.baleenZ;
    zKicked = true;
    flags['bolus:baleenUntil'] = simTime + F.baleenRearm;
    flags['bolus:baleenKickUntil'] = simTime + F.baleenKick;
  } else if (gloveCandidate) {
    ix = gloveCandidate.ix;
    iz = gloveCandidate.iz;
    xKicked = true;
    zKicked = true;
    gloveCandidate.tag.gloveHot = true;
  } else if (crestDue(flags, simTime)) {
    iz = F.peristalsisZ;
    zKicked = true;
    flags['bolus:peristalsisMark'] = Math.floor(simTime / F.peristalsisPeriod);
    flags['bolus:crestHoldUntil'] = simTime + F.crestHold;
    cue(world, BOLUS_CUE.crest);
  }

  if (uvulaHeld && uvulaHold >= F.uvulaHold) {
    const arrived = Math.abs(lx - F.uvulaX) <= F.uvulaArrive;
    const want = arrived ? 0 : Math.sign(F.uvulaX - lx) * F.uvulaSpeed;
    if (!xKicked) ix += want - (player.vel.x || 0);
    flags['bolus:uvulaSeek'] = true;
  } else if (flags['bolus:uvulaSeek']) {
    flags['bolus:uvulaSeek'] = false;
    if (!xKicked) ix += -(player.vel.x || 0);
  }

  if (!zKicked && !kickHold(flags, simTime) && lx >= F.ciliaX0 && lx <= F.ciliaX1) {
    const vz = player.vel.z || 0;
    if (vz < F.ciliaZ) iz += F.ciliaZ - vz;
  }

  if (ix !== 0 || iz !== 0) push(player, ix, iz);

  if (!(Number(flags['bolus:acidQuietUntil']) > simTime) && lx >= BOLUS_ACID_X0 && lx <= BOLUS_ACID_X1) {
    hurt(player, F.acidDps * step);
  }
  if (miteHit) {
    flags['bolus:mite'] = true;
    ae.exposure = Math.min(1, (ae.exposure || 0) + 0.04);
    toast(world, 'Something thin is on the line.');
  }

  flags['bolus:toothHeld'] = false;
  for (let i = 0; i < cast.length; i++) {
    if (cast[i].heldLine && cast[i].tag.role === 'tooth') flags['bolus:toothHeld'] = true;
    steerFauna(cast[i], { lx, lz, rot, speed, boosting, simTime, flags, crookHeld, state, world });
  }
}

function crestDue(flags, simTime) {
  const mark = Math.floor(simTime / F.peristalsisPeriod);
  if (!Object.prototype.hasOwnProperty.call(flags, 'bolus:peristalsisMark')) {
    flags['bolus:peristalsisMark'] = mark;
    return false;
  }
  if (mark === flags['bolus:peristalsisMark']) return false;
  if (Number(flags['bolus:peristalsisUntil']) > simTime) {
    flags['bolus:peristalsisMark'] = mark;
    return false;
  }
  return true;
}

function steerFauna(row, ctx) {
  const { ent, tag, heldLine, ex, ez } = row;
  if (Number(ctx.flags[`bolus:loose:${tag.key}`]) > ctx.simTime) return;
  if (heldLine || !DRIVEN.has(tag.role)) return;
  if (!ent.physicsBody || ent.physicsBody.dynamic === false) return;
  const inCone = bolusInCone(ctx.lx, ctx.lz, ctx.rot, ex, ez);
  const crookFreeze = tag.role === 'louse' && ctx.crookHeld && Math.hypot(ex - CROOK_AT.x, ez - CROOK_AT.z) <= F.crookReach;

  if (tag.role === 'louse' && !crookFreeze) {
    const phase = (tag.phase || 0) + ctx.simTime * 0.7;
    drive(ent, Math.cos(phase) * F.louseScurry, Math.sin(phase) * F.louseScurry);
  } else if (tag.role === 'drum') {
    const spur = Number(ctx.flags['bolus:spurUntil']) > ctx.simTime
      && Math.hypot(ex - SPUR_AT.x, ez - SPUR_AT.z) <= 450;
    if (spur) {
      drive(ent, 0, 0);
    } else if (Number(ctx.flags['bolus:fastFor']) >= F.drumChaseDelay) {
      const dx = ctx.lx - ex;
      const dz = ctx.lz - ez;
      const dist = Math.hypot(dx, dz) || 1;
      drive(ent, (dx / dist) * F.drumChase, (dz / dist) * F.drumChase);
    } else {
      const phase = (ent.rot || 0) + ctx.simTime * 0.2;
      drive(ent, Math.cos(phase) * F.drumWander, Math.sin(phase) * F.drumWander);
    }
  } else if (tag.role === 'fingerling') {
    if (ctx.boosting && Math.hypot(ex - ctx.lx, ez - ctx.lz) < 220) {
      const dx = ex - ctx.lx;
      const dz = ez - ctx.lz;
      const dist = Math.hypot(dx, dz) || 1;
      drive(ent, (dx / dist) * 36, (dz / dist) * 36);
    } else {
      const phase = ctx.simTime * 0.8 + (tag.phase || 0);
      drive(ent, (tag.anchorX + Math.cos(phase) * 30 - ex) * 0.8, (tag.anchorZ + Math.sin(phase) * 30 - ez) * 0.8);
    }
  } else if (tag.role === 'floater') {
    const phase = (tag.phase || 0) + ctx.simTime * 0.35;
    const ax = tag.anchorX + Math.cos(phase) * 40;
    const az = tag.anchorZ + Math.sin(phase * 0.7) * 26;
    drive(ent, (ax - ex) * 0.4, (az - ez) * 0.4);
  } else if (tag.role === 'mite') {
    const phase = ctx.simTime * 1.4 + (ent.rot || 0);
    drive(ent, Math.cos(phase) * 10, Math.sin(phase) * 8);
  } else if (tag.role === 'glove') {
    drive(ent, (tag.anchorX - ex) * 0.6, (tag.anchorZ - ez) * 0.6);
  }

  if (SMALL.has(tag.role) && (inCone || crookFreeze)) drive(ent, 0, 0);
  const frozen = SMALL.has(tag.role) && (inCone || crookFreeze);
  if (frozen && tag.frozen !== true) cue(ctx.world, BOLUS_CUE.freeze);
  tag.frozen = frozen;
}
