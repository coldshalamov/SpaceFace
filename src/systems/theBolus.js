// The Bolus — interior host. One volume, one fungus, one Massline.
// Spawns the seeded cast and ticks the throat. No second ecology, no second grapple.

import { addCargo } from './cargo.js';
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { Masks } from '../core/entity.js';
import {
  BOLUS_SECTOR_ID,
  BOLUS_WALL_X,
  BOLUS_IRIS_Z,
  BOLUS_ACID_X0,
  BOLUS_ACID_X1,
  planBolusLayout,
  bolusResolvedSpec,
  commitBolusLatch,
  bolusInCone,
  bolusIrisOpen,
} from '../data/theBolus.js';

const EXPOSURE_PER_SEC = 0.015;
const ACID_DPS = 2;
const LIMP_SPEED = 22;
const FAST_SPEED = 55;
const DRIVEN = new Set(['louse', 'drum', 'fingerling', 'floater', 'mite', 'glove']);
const FIRST_KNOB = { x: -700, z: -2000 };
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

function push(entity, ix, iz, _state) {
  if (!entity) return;
  if (!entity.vel) entity.vel = { x: 0, y: 0, z: 0 };
  entity.vel.x += ix;
  entity.vel.z += iz;
  queuePhysicsImpulse(entity, { x: ix, y: 0, z: iz });
}

function drive(entity, vx, vz, _state) {
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

export function tickBolus(world, dt) {
  const state = world && world.state;
  if (!state || !(dt > 0)) return;
  if (!state.world || state.world.currentSectorId !== BOLUS_SECTOR_ID) return;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || !player.pos || player.alive === false) return;
  const step = dt > 0.1 ? 0.1 : dt;
  const origin = world._sectorOrigin(BOLUS_SECTOR_ID);
  if (!origin) return;
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

  ae.exposure = Math.min(1, (ae.exposure || 0) + EXPOSURE_PER_SEC * step);

  let toothPull = 0;
  let uvula = false;
  let pleat = false;
  let crookHeld = false;
  let miteHit = false;

  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const ent = list[i];
    if (!ent || ent.alive === false || !ent.data || !ent.data.bolus) continue;
    if (ent.homeSectorId !== BOLUS_SECTOR_ID) continue;
    const tag = ent.data.bolus;
    const heldLine = taut.has(ent.id);
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
    if (heldLine && tag.role === 'tooth') toothPull = flags['bolus:papilla'] ? 0.5 : 1;
    if (heldLine && tag.role === 'uvula' && tag.hold >= 0.4) uvula = true;
    if (heldLine && tag.role === 'crook' && tag.hold >= 0.4) crookHeld = true;
    const ex = ent.pos.x - origin.x;
    const ez = ent.pos.z - origin.z;
    if (tag.role === 'mite' && !flags['bolus:mite'] && Math.hypot(ex - lx, ez - lz) < 36 && speed < LIMP_SPEED) {
      miteHit = true;
    }
    if (tag.role === 'baleen' && boosting && Math.hypot(ex - lx, ez - lz) < 90 && !(Number(flags['bolus:baleenUntil']) > simTime)) {
      flags['bolus:baleenUntil'] = simTime + 2;
      push(player, 0, -18, state);
    }
    if (tag.role === 'glove' && Math.hypot(ex - lx, ez - lz) < 240) {
      const frenum = Number(flags['bolus:frenumUntil']) > simTime;
      if (speed < LIMP_SPEED) {
        const kx = FIRST_KNOB.x - lx;
        const kz = FIRST_KNOB.z - lz;
        const dist = Math.hypot(kx, kz) || 1;
        push(player, (kx / dist) * 12 * step, (kz / dist) * 12 * step, state);
      } else if (!frenum && speed >= FAST_SPEED) {
        const gx = ex - lx;
        const gz = ez - lz;
        const dist = Math.hypot(gx, gz) || 1;
        push(player, (gx / dist) * 16 * step, (gz / dist) * 16 * step, state);
      }
    }
    cast.push({ ent, tag, heldLine, ex, ez });
  }

  if (!(Number(flags['bolus:peristalsisUntil']) > simTime)) {
    const wave = 6 + 8 * Math.sin((simTime / 12) * Math.PI * 2);
    push(player, 0, wave * step, state);
  }
  if (Math.abs(lx - BOLUS_WALL_X) < 180 && !boosting && speed < 40) {
    push(player, 0, 8 * step, state);
  }
  if (!(Number(flags['bolus:acidQuietUntil']) > simTime) && lx >= BOLUS_ACID_X0 && lx <= BOLUS_ACID_X1) {
    hurt(player, ACID_DPS * step);
  }
  if (!(Number(flags['bolus:hushUntil']) > simTime) && !bolusIrisOpen(simTime)
      && Math.abs(lz - BOLUS_IRIS_Z) < 90 && lx > -900 && lx < 900) {
    push(player, 0, lz < BOLUS_IRIS_Z ? -28 * step : 28 * step, state);
  }
  if (toothPull) push(player, 18 * toothPull * step, 0, state);
  if (uvula) push(player, (lx < BOLUS_WALL_X ? 1 : -1) * 6 * step, 0, state);
  if (pleat) push(player, 0, 14, state);
  if (miteHit) {
    flags['bolus:mite'] = true;
    ae.exposure = Math.min(1, (ae.exposure || 0) + 0.04);
    toast(world, 'Something thin is on the line.');
  }

  for (let i = 0; i < cast.length; i++) {
    steerFauna(cast[i], { lx, lz, rot, speed, boosting, simTime, flags, crookHeld, state });
  }
}

function steerFauna(row, ctx) {
  const { ent, tag, heldLine, ex, ez } = row;
  if (heldLine || !DRIVEN.has(tag.role)) return;
  if (!ent.physicsBody || ent.physicsBody.dynamic === false) return;
  const { state } = ctx;
  if (tag.role === 'louse') {
    const frozen = bolusInCone(ctx.lx, ctx.lz, ctx.rot, ex, ez)
      || (ctx.crookHeld && Math.hypot(ex - CROOK_AT.x, ez - CROOK_AT.z) <= 220);
    if (frozen) {
      drive(ent, 0, 0, state);
      return;
    }
    const phase = (tag.phase || 0) + ctx.simTime * 0.7;
    drive(ent, Math.cos(phase) * 16, Math.sin(phase * 1.3) * 16, state);
    return;
  }
  if (tag.role === 'drum') {
    const spur = Number(ctx.flags['bolus:spurUntil']) > ctx.simTime
      && Math.hypot(ex - SPUR_AT.x, ez - SPUR_AT.z) <= 450;
    if (spur) {
      drive(ent, 0, 0, state);
      return;
    }
    if (!(ctx.boosting || ctx.speed >= FAST_SPEED)) {
      const phase = (ent.rot || 0) + ctx.simTime * 0.2;
      drive(ent, Math.cos(phase) * 6, Math.sin(phase) * 6, state);
      return;
    }
    const dx = ctx.lx - ex;
    const dz = ctx.lz - ez;
    const dist = Math.hypot(dx, dz) || 1;
    drive(ent, (dx / dist) * 28, (dz / dist) * 28, state);
    return;
  }
  if (tag.role === 'fingerling') {
    if (ctx.boosting && Math.hypot(ex - ctx.lx, ez - ctx.lz) < 220) {
      const dx = ex - ctx.lx;
      const dz = ez - ctx.lz;
      const dist = Math.hypot(dx, dz) || 1;
      drive(ent, (dx / dist) * 36, (dz / dist) * 36, state);
      return;
    }
    const phase = ctx.simTime * 0.8 + (tag.phase || 0);
    drive(ent, (tag.anchorX + Math.cos(phase) * 30 - ex) * 0.8, (tag.anchorZ + Math.sin(phase) * 30 - ez) * 0.8, state);
    return;
  }
  if (tag.role === 'floater') {
    const phase = (tag.phase || 0) + ctx.simTime * 0.35;
    const ax = tag.anchorX + Math.cos(phase) * 40;
    const az = tag.anchorZ + Math.sin(phase * 0.7) * 26;
    drive(ent, (ax - ex) * 0.4, (az - ez) * 0.4, state);
    return;
  }
  if (tag.role === 'mite') {
    const phase = ctx.simTime * 1.4 + (ent.rot || 0);
    drive(ent, Math.cos(phase) * 10, Math.sin(phase) * 8, state);
    return;
  }
  if (tag.role === 'glove') {
    drive(ent, (tag.anchorX - ex) * 0.6, (tag.anchorZ - ez) * 0.6, state);
  }
}
