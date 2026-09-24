// Emergent ARPG combat primitives. Fixed-step forces cross the Rapier membrane.
// Idle when nothing is armed, so an untouched flight pays one null check.

import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  dipoleImpulse,
  physicalProfile,
  reducedMass,
  reflectVelocity,
  shockImpulse,
  shrapnelDirections,
  slugMomentum,
  springImpulse,
  viscousImpulse,
  compileEmergentAttack,
} from '../combat/emergentPrimitives.js';
import {
  PROC_COSTS,
  createLineage,
  createProcWorld,
  syncProcWorldTick,
  trySpawnDescendant,
} from '../combat/attackLineage.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../core/physicsAuthority.js';
import {
  EMERGENT_LIMITS,
  EMERGENT_POOL,
  EMERGENT_TUNING,
  emergentWeaponByKind,
} from '../data/emergentPrimitives.js';
import { createEmergentVoice } from '../audio/emergentPrimitiveVoice.js';

const T = EMERGENT_TUNING;
const DT_MIN = 1 / 240;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function blankProjectile() {
  return {
    alive: false, kind: '', x: 0, z: 0, vx: 0, vz: 0,
    age: 0, life: 1, ownerId: 0, mass: 1, ignoreId: 0, weaponId: '',
    bounces: 0, skipPrism: -1,
  };
}

export function ensureEmergent(state) {
  if (state.emergent && state.emergent.projectiles) return state.emergent;
  const projectiles = new Array(EMERGENT_POOL.projectiles);
  for (let i = 0; i < projectiles.length; i++) projectiles[i] = blankProjectile();
  const presentation = new Array(EMERGENT_POOL.presentation);
  for (let i = 0; i < presentation.length; i++) presentation[i] = { kind: '', x: 0, z: 0, x2: 0, z2: 0, scale: 1, yaw: 0 };
  const audio = new Array(EMERGENT_POOL.audio);
  state.emergent = {
    hot: false,
    projectiles,
    projectileLive: 0,
    stickies: [],
    coatings: [],
    springs: [],
    polarities: [],
    fields: [],
    prisms: [],
    hijacks: [],
    gongs: [],
    links: [],
    flashes: [],
    owners: Object.create(null),
    ray: null,
    presentation,
    presentationCount: 0,
    audio,
    audioWrite: 0,
    audioCount: 0,
    procWorld: createProcWorld({ descendantsPerTickMax: 24 }),
    arcLock: false,
    bus: null,
  };
  return state.emergent;
}

function ownerRow(world, id) {
  const key = String(id);
  let row = world.owners[key];
  if (!row) {
    row = { grav: 0, quantum: 0, polarity: 1 };
    world.owners[key] = row;
  }
  return row;
}

function ent(state, id) {
  if (id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function allocProjectile(world) {
  const list = world.projectiles;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].alive) {
      list[i].alive = true;
      world.projectileLive += 1;
      return list[i];
    }
  }
  let oldest = list[0];
  for (let i = 1; i < list.length; i++) {
    if (list[i].age > oldest.age) oldest = list[i];
  }
  return oldest;
}

function freeProjectile(world, slot) {
  if (!slot.alive) return;
  slot.alive = false;
  world.projectileLive = Math.max(0, world.projectileLive - 1);
}

function pushCap(list, item, cap) {
  if (list.length >= cap) list.shift();
  list.push(item);
  return item;
}

function cue(state, id, x, z, impulse = 0, contact = null) {
  const world = state.emergent;
  if (!world) return;
  const slot = world.audio[world.audioWrite % world.audio.length];
  const row = slot || { id: '', x: 0, z: 0, impulse: 0, tick: 0 };
  row.id = id;
  row.x = x;
  row.z = z;
  row.impulse = impulse;
  row.tick = state.tick | 0;
  world.audio[world.audioWrite % world.audio.length] = row;
  world.audioWrite += 1;
  world.audioCount = Math.min(world.audio.length, world.audioWrite);
  const player = ent(state, state.playerId);
  let pan = 0;
  if (player && player.pos) pan = Math.max(-1, Math.min(1, ((x || 0) - player.pos.x) / 400));
  if (world.bus && typeof world.bus.emit === 'function') {
    world.bus.emit('emergent:audio', { id, x, z, pan, gain: 0.8, impulse });
    const knocked = contact && contact.b;
    const other = contact && contact.a;
    if (impulse > 40 && knocked && other) {
      const mass = contact.mass > 0 ? contact.mass : physicalProfile(knocked).mass;
      const playerId = state.playerId;
      world.bus.emit('emergent:contact', {
        impulse,
        deltaV: impulse / Math.max(1, mass),
        mass,
        pos: { x, z },
        aId: other.id,
        bId: knocked.id,
        knockId: knocked.id,
        otherId: other.id,
        playerInvolved: playerId != null && (other.id === playerId || knocked.id === playerId),
        tick: state.tick | 0,
      });
    }
  }
}

function flash(world, kind, x, z, x2 = x, z2 = z, scale = 1, yaw = 0) {
  if (world.flashes.length >= EMERGENT_POOL.presentation) world.flashes.shift();
  world.flashes.push({ kind, x, z, x2, z2, scale, yaw, ttl: 0.22 });
}

function give(entity, jx, jz, provenance, tick) {
  if (!entity || (!(jx * jx + jz * jz > 0))) return 0;
  // Rapier only integrates bodies that stay alive. A wreck is a live rigid body
  // (aftermath wrecks spawn alive); alive === false is removed from the solver and
  // this impulse would sit unused. Callers that mean "dead hulk" use type 'wreck'.
  queuePhysicsImpulse(entity, { x: jx, y: 0, z: jz }, { provenance, tick, kind: provenance });
  return Math.hypot(jx, jz);
}

function giveTorque(entity, torque, provenance, tick) {
  if (!entity || !torque) return;
  queuePhysicsTorqueImpulse(entity, { x: 0, y: torque, z: 0 }, { provenance, tick, kind: provenance });
}

function hurt(sys, state, target, amount, damageType, attackerId) {
  if (!(amount > 0) || !target) return;
  const pos = target.pos || { x: 0, z: 0 };
  const packet = scalarHitToDamagePacket({
    damage: amount,
    damageType,
    pos: { x: pos.x, z: pos.z },
    source: { kind: 'emergent', damageType },
  });
  packet.flags = { allowAnyTarget: true, ignoreFriendlyFire: true };
  const route = sys && sys.helpers && sys.helpers.routeCombatDamage;
  if (typeof route === 'function') {
    route({ attackerId, targetId: target.id, packet, origin: { kind: 'emergent', x: pos.x, z: pos.z } });
    return;
  }
  target.hull = num(target.hull, 0) - amount;
}

function dataOf(entity) {
  if (!entity.data || typeof entity.data !== 'object') entity.data = {};
  return entity.data;
}

function addHeat(state, entity, amount, sys) {
  if (!entity || !(amount > 0)) return;
  entity.heat = num(entity.heat) + amount;
  const profile = physicalProfile(entity);
  const data = dataOf(entity);
  if (profile.fractures && entity.heat >= T.fractureHeat && data.fractured !== true) {
    data.fractured = true;
    hurt(sys, state, entity, Math.max(num(entity.hull, 1), 1), 'thermal', null);
    if (!(sys && sys.helpers && typeof sys.helpers.routeCombatDamage === 'function')) entity.hull = 0;
    cue(state, 'sfx_emergent_crumple', entity.pos.x, entity.pos.z, profile.mass * 4);
    flash(state.emergent, 'ring', entity.pos.x, entity.pos.z, entity.pos.x, entity.pos.z, profile.radius * 1.4);
    const dir = shrapnelDirections(state.rng || (() => 0.37), 1)[0];
    give(entity, dir.x * profile.mass * 6, dir.z * profile.mass * 6, 'thermal_fracture', state.tick);
  }
  if (profile.reactor && entity.alive !== false && entity.type !== 'asteroid' && entity.type !== 'wreck'
    && entity.heat >= T.reactorHeat && !(num(data.reactorLockoutUntil) > num(state.simTime))) {
    data.reactorLockoutUntil = num(state.simTime) + T.reactorLockS;
    data.weaponVentUntil = num(state.simTime) + T.reactorLockS;
    cue(state, 'sfx_emergent_cook', entity.pos.x, entity.pos.z, 80);
  }
  if (profile.magazine > 0 && entity.heat >= T.magazineHeat && data.magazineCooked !== true) {
    data.magazineCooked = true;
    const weapons = data.weapons || [];
    for (let i = 0; i < weapons.length; i++) {
      if (weapons[i]) {
        weapons[i]._heat = 0;
        weapons[i].ammo = 0;
      }
    }
    const blast = profile.magazine * 1.5;
    const yaw = num(entity.rot);
    give(entity, Math.cos(yaw) * blast, Math.sin(yaw) * blast, 'magazine_cookoff', state.tick);
    hurt(sys, state, entity, profile.magazine * 0.15, 'explosive', null);
    cue(state, 'sfx_emergent_cook', entity.pos.x, entity.pos.z, blast);
  }
  if (profile.fuelVolatile >= T.stickyFuelMin && entity.heat >= T.cookHeat && data.cooked !== true) {
    data.cooked = true;
    entity.fuelVolatile = 0;
    data.fuelVolatile = 0;
    const blast = 900 + profile.fuelVolatile * 1400 + profile.mass * 4;
    give(entity, blast, blast * 0.15, 'reactor_cookoff', state.tick);
    hurt(sys, state, entity, 18 + profile.mass * 0.05, 'explosive', null);
    spawnShrapnel(state, entity.pos.x, entity.pos.z, entity.id, null);
    cue(state, 'sfx_emergent_cook', entity.pos.x, entity.pos.z, blast);
    flash(state.emergent, 'ring', entity.pos.x, entity.pos.z, entity.pos.x, entity.pos.z, 14);
  }
}

function spawnShrapnel(state, x, z, ignoreId, ownerId) {
  const world = ensureEmergent(state);
  const dirs = shrapnelDirections(state.rng || (() => 0.5), T.shrapnelCount);
  for (let i = 0; i < dirs.length; i++) {
    const slot = allocProjectile(world);
    slot.kind = 'shrapnel';
    slot.x = x;
    slot.z = z;
    slot.vx = dirs[i].x * T.shrapnelSpeed;
    slot.vz = dirs[i].z * T.shrapnelSpeed;
    slot.age = 0;
    slot.life = T.shrapnelLife;
    slot.ownerId = ownerId == null ? 0 : ownerId;
    slot.mass = T.shrapnelMass;
    slot.ignoreId = ignoreId == null ? 0 : ignoreId;
    slot.weaponId = 'wpn_sticky_detonator';
  }
  world.hot = true;
}

function muzzle(owner, angle) {
  const reach = (owner.radius || 1) + 1.5;
  return {
    x: owner.pos.x + Math.cos(angle) * reach,
    z: owner.pos.z + Math.sin(angle) * reach,
  };
}

function launchBolt(state, owner, angle, kind, speed, life, mass, weaponId) {
  const world = ensureEmergent(state);
  const from = muzzle(owner, angle);
  const slot = allocProjectile(world);
  slot.kind = kind;
  slot.x = from.x;
  slot.z = from.z;
  slot.vx = Math.cos(angle) * speed;
  slot.vz = Math.sin(angle) * speed;
  slot.age = 0;
  slot.life = life;
  slot.ownerId = owner.id;
  slot.mass = mass;
  slot.ignoreId = owner.id;
  slot.weaponId = weaponId;
  slot.bounces = 0;
  slot.skipPrism = -1;
  world.hot = true;
  return slot;
}

export function launchEmergent(state, owner, def, angle) {
  if (!state || !owner || !owner.pos || !def) return false;
  const kind = def.emergentPrimitive;
  const aim = Number.isFinite(angle) ? angle : num(owner.rot);
  const world = ensureEmergent(state);
  world.hot = true;
  if (kind === 'sticky') {
    launchBolt(state, owner, aim, 'sticky', T.stickySpeed, T.stickyLife, 2, def.id);
    cue(state, 'sfx_emergent_slug', owner.pos.x, owner.pos.z, 30);
    return true;
  }
  if (kind === 'primer') {
    launchBolt(state, owner, aim, 'primer', T.primerSpeed, T.primerLife, 1, def.id);
    cue(state, 'sfx_emergent_crackle', owner.pos.x, owner.pos.z, 20);
    return true;
  }
  if (kind === 'grav') {
    launchBolt(state, owner, aim, 'grav', 300, 2.4, 1, def.id);
    cue(state, 'sfx_emergent_spring', owner.pos.x, owner.pos.z, 16);
    return true;
  }
  if (kind === 'mass') {
    const slot = launchBolt(state, owner, aim, 'mass', T.slugSpeed, 2.2, T.slugMass, def.id);
    const recoil = slugMomentum(slot.mass, slot.vx, slot.vz);
    const j = give(owner, -recoil.jx, -recoil.jz, 'mass_driver_recoil', state.tick);
    cue(state, 'sfx_emergent_slug', owner.pos.x, owner.pos.z, j);
    return true;
  }
  if (kind === 'polarity') {
    launchBolt(state, owner, aim, 'polarity', T.polaritySpeed, 2.2, 1, def.id);
    return true;
  }
  if (kind === 'hijack') {
    launchBolt(state, owner, aim, 'hijack', T.hijackSpeed, 2.4, 1.2, def.id);
    cue(state, 'sfx_emergent_spin', owner.pos.x, owner.pos.z, 24);
    return true;
  }
  if (kind === 'gong') {
    launchBolt(state, owner, aim, 'gong', 220, 2.6, 4, def.id);
    return true;
  }
  if (kind === 'quantum') {
    launchBolt(state, owner, aim, 'quantum', 320, 2.2, 1, def.id);
    return true;
  }
  if (kind === 'viscosity' || kind === 'prism') {
    const drop = kind === 'prism' ? T.prismDrop : T.fieldDrop;
    const x = owner.pos.x + Math.cos(aim) * drop;
    const z = owner.pos.z + Math.sin(aim) * drop;
    if (kind === 'viscosity') {
      pushCap(world.fields, {
        x, z,
        axisX: Math.cos(aim),
        axisZ: Math.sin(aim),
        life: T.viscosityLife,
        radius: T.viscosityRadius,
        ownerId: owner.id,
      }, EMERGENT_POOL.fields);
      cue(state, 'sfx_emergent_gel', x, z, 12);
    } else {
      const nAng = aim - Math.PI / 4;
      const nx = Math.cos(nAng);
      const nz = Math.sin(nAng);
      pushCap(world.prisms, {
        x, z, nx, nz, yaw: nAng,
        life: T.prismLife,
        radius: T.prismRadius,
        ownerId: owner.id,
      }, EMERGENT_POOL.prisms);
      const coatedBody = firstAlong(state, owner.pos.x, owner.pos.z, Math.cos(aim), Math.sin(aim), drop + 8, owner.id);
      if (coatedBody) {
        coatedBody.entity.reflectivity = 1;
        const coatData = dataOf(coatedBody.entity);
        coatData.reflectNormal = { x: nx, z: nz };
        pushCap(world.coatings, {
          hostId: coatedBody.entity.id,
          until: num(state.simTime) + T.prismLife,
          kind: 'reflect',
        }, EMERGENT_POOL.coatings);
      }
      cue(state, 'sfx_emergent_prism', x, z, 10);
    }
    return true;
  }
  if (kind === 'thermal') {
    setEmergentRay(state, owner, def, aim);
    return true;
  }
  return false;
}

export function setEmergentRay(state, owner, def, angle) {
  if (!state || !owner) return;
  const world = ensureEmergent(state);
  const aim = Number.isFinite(angle) ? angle : num(owner.rot);
  world.ray = {
    ownerId: owner.id,
    angle: aim,
    weaponId: def && def.id,
    range: def && Number.isFinite(def.range) ? def.range : T.thermalRange,
  };
  world.hot = true;
}

export function clearEmergentRay(state, ownerId) {
  const world = state && state.emergent;
  if (!world || !world.ray) return;
  if (ownerId == null || world.ray.ownerId === ownerId) world.ray = null;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function firstAlong(state, x, z, dx, dz, range, ignoreId) {
  let best = null;
  let bestT = range;
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.pos || e.id === ignoreId || e.type === 'fx') continue;
    const px = e.pos.x - x;
    const pz = e.pos.z - z;
    const t = px * dx + pz * dz;
    if (t < 0 || t > bestT) continue;
    const ox = px - dx * t;
    const oz = pz - dz * t;
    const rad = e.radius || 1;
    if (ox * ox + oz * oz <= rad * rad) {
      bestT = t;
      best = e;
    }
  }
  return best ? { entity: best, t: bestT, x: x + dx * bestT, z: z + dz * bestT } : null;
}

function firstPrism(world, x, z, dx, dz, range, ignoreIndex) {
  let best = null;
  let bestT = range;
  for (let i = 0; i < world.prisms.length; i++) {
    if (i === ignoreIndex) continue;
    const p = world.prisms[i];
    const px = p.x - x;
    const pz = p.z - z;
    const t = px * dx + pz * dz;
    if (t < 0 || t > bestT) continue;
    const ox = px - dx * t;
    const oz = pz - dz * t;
    if (ox * ox + oz * oz <= p.radius * p.radius) {
      bestT = t;
      best = { index: i, prism: p, t, x: x + dx * t, z: z + dz * t };
    }
  }
  return best;
}

function traceRay(state, x, z, angle, range, ignoreId) {
  const world = state.emergent;
  let dx = Math.cos(angle);
  let dz = Math.sin(angle);
  let left = range;
  let speed = 1;
  let skipPrism = -1;
  for (let bounce = 0; bounce < EMERGENT_LIMITS.prismBounces; bounce++) {
    const prism = firstPrism(world, x, z, dx, dz, left, skipPrism);
    const body = firstAlong(state, x, z, dx, dz, left, ignoreId);
    if (prism && (!body || prism.t <= body.t)) {
      const reflected = reflectVelocity(dx * speed, dz * speed, prism.prism.nx, prism.prism.nz, T.prismGain);
      const sp = Math.hypot(reflected.x, reflected.z) || 1;
      flash(world, 'prism', prism.x, prism.z, prism.x, prism.z, prism.prism.radius, prism.prism.yaw);
      cue(state, 'sfx_emergent_prism', prism.x, prism.z, sp);
      dx = reflected.x / sp;
      dz = reflected.z / sp;
      speed = sp;
      left -= prism.t;
      x = prism.x + dx * 0.8;
      z = prism.z + dz * 0.8;
      skipPrism = prism.index;
      ignoreId = 0;
      continue;
    }
    if (body) return { entity: body.entity, x: body.x, z: body.z, speed };
    return null;
  }
  return null;
}

function hitEntities(state, slot) {
  const list = state.entityList || [];
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.pos || e.id === slot.ignoreId || e.id === slot.ownerId || e.type === 'fx') continue;
    const reach = (e.radius || 1) + 1.1;
    const d2 = dist2(slot.x, slot.z, e.pos.x, e.pos.z);
    if (d2 <= reach * reach && d2 < bestD) {
      best = e;
      bestD = d2;
    }
  }
  return best;
}

function onHit(state, slot, target, sys) {
  const kind = slot.kind;
  if (kind === 'sticky') {
    pushCap(state.emergent.stickies, {
      hostId: target.id,
      ox: slot.x - target.pos.x,
      oz: slot.z - target.pos.z,
      ownerId: slot.ownerId,
      armed: true,
    }, EMERGENT_POOL.stickies);
    cue(state, 'sfx_emergent_crumple', target.pos.x, target.pos.z, 24);
    return;
  }
  if (kind === 'primer') {
    pushCap(state.emergent.coatings, {
      hostId: target.id,
      until: num(state.simTime) + T.coatSeconds,
    }, EMERGENT_POOL.coatings);
    target.conductivity = Math.max(num(target.conductivity, physicalProfile(target).conductivity), 1);
    cue(state, 'sfx_emergent_crackle', target.pos.x, target.pos.z, 18);
    return;
  }
  if (kind === 'grav') {
    const row = ownerRow(state.emergent, slot.ownerId);
    if (!row.grav || row.grav === target.id) {
      row.grav = target.id;
      return;
    }
    const other = ent(state, row.grav);
    row.grav = 0;
    if (!other || !other.pos) return;
    const dist = Math.hypot(target.pos.x - other.pos.x, target.pos.z - other.pos.z);
    pushCap(state.emergent.springs, {
      aId: other.id,
      bId: target.id,
      rest: Math.max(4, dist * T.springRestFraction),
      k: T.springK,
    }, EMERGENT_POOL.springs);
    cue(state, 'sfx_emergent_spring', target.pos.x, target.pos.z, 40);
    return;
  }
  if (kind === 'mass' || kind === 'shrapnel') {
    const mom = slugMomentum(slot.mass, slot.vx, slot.vz);
    const ox = slot.x - target.pos.x;
    const oz = slot.z - target.pos.z;
    const torque = (ox * mom.jz - oz * mom.jx) * 0.015;
    const j = deliverShock(state, target, mom.jx, mom.jz, torque, 0, sys, 'mass_driver_impact');
    const owner = ent(state, slot.ownerId);
    cue(state, 'sfx_emergent_slug', target.pos.x, target.pos.z, j, {
      a: owner || target,
      b: target,
      mass: physicalProfile(target).mass,
    });
    if (kind === 'shrapnel') hurt(sys, state, target, 2, 'kinetic', slot.ownerId);
    return;
  }
  if (kind === 'polarity') {
    const row = ownerRow(state.emergent, slot.ownerId);
    const sign = row.polarity >= 0 ? 1 : -1;
    row.polarity = -sign;
    target.magneticCharge = sign;
    dataOf(target).magneticCharge = sign;
    let found = false;
    const tags = state.emergent.polarities;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].hostId === target.id) {
        tags[i].charge = sign;
        found = true;
        break;
      }
    }
    if (!found) pushCap(tags, { hostId: target.id, charge: sign }, EMERGENT_POOL.polarities);
    cue(state, 'sfx_emergent_crackle', target.pos.x, target.pos.z, 14);
    return;
  }
  if (kind === 'hijack') {
    pushCap(state.emergent.hijacks, {
      hostId: target.id,
      ownerId: slot.ownerId,
      until: num(state.simTime) + T.hijackLife,
    }, EMERGENT_POOL.hijacks);
    cue(state, 'sfx_emergent_spin', target.pos.x, target.pos.z, 30);
    return;
  }
  if (kind === 'gong') {
    const profile = physicalProfile(target);
    pushCap(state.emergent.gongs, {
      hostId: target.id,
      mass: profile.mass,
      next: num(state.simTime),
      left: T.gongWaves,
      ownerId: slot.ownerId,
    }, EMERGENT_POOL.gongs);
    cue(state, 'sfx_emergent_seismic', target.pos.x, target.pos.z, profile.mass);
    return;
  }
  if (kind === 'quantum') {
    const row = ownerRow(state.emergent, slot.ownerId);
    if (!row.quantum || row.quantum === target.id) {
      row.quantum = target.id;
      return;
    }
    const otherId = row.quantum;
    row.quantum = 0;
    if (!ent(state, otherId)) return;
    pushCap(state.emergent.links, { aId: otherId, bId: target.id }, EMERGENT_POOL.links);
    cue(state, 'sfx_emergent_prism', target.pos.x, target.pos.z, 22);
  }
}

function partnerId(world, id) {
  const links = world.links;
  for (let i = 0; i < links.length; i++) {
    if (links[i].aId === id) return links[i].bId;
    if (links[i].bId === id) return links[i].aId;
  }
  return 0;
}

function deliverShock(state, entity, jx, jz, torque, generation, sys, provenance, visited) {
  if (!entity || generation > EMERGENT_LIMITS.generationMax) return 0;
  const seen = visited || new Set();
  if (seen.has(entity.id)) return 0;
  seen.add(entity.id);
  const j = give(entity, jx, jz, provenance, state.tick);
  if (torque) giveTorque(entity, torque, provenance, state.tick);
  const otherId = partnerId(state.emergent, entity.id);
  if (!otherId || generation >= EMERGENT_LIMITS.generationMax) return j;
  const other = ent(state, otherId);
  if (!other || seen.has(other.id)) return j;
  deliverShock(state, other, jx, jz, torque, generation + 1, sys, 'quantum_sympathy', seen);
  return j;
}

function detonateStickies(state, sys) {
  const world = state.emergent;
  const armed = world.stickies;
  for (let i = armed.length - 1; i >= 0; i--) {
    const charge = armed[i];
    const host = ent(state, charge.hostId);
    armed.splice(i, 1);
    const x = host && host.pos ? host.pos.x + charge.ox : 0;
    const z = host && host.pos ? host.pos.z + charge.oz : 0;
    const list = state.entityList || [];
    for (let n = 0; n < list.length; n++) {
      const body = list[n];
      if (!body || !body.pos || body.type === 'fx') continue;
      const dx = body.pos.x - x;
      const dz = body.pos.z - z;
      const dist = Math.hypot(dx, dz) || 1;
      const fall = 1 / (1 + (dist / T.stickyFalloff) * (dist / T.stickyFalloff));
      const j = T.stickyYield * fall;
      const nx = dx / dist;
      const nz = dz / dist;
      if (body === host) deliverShock(state, body, nx * j, nz * j, 0, 0, sys, 'sticky_detonator');
      else give(body, nx * j * 0.65, nz * j * 0.65, 'sticky_detonator', state.tick);
    }
    if (host) addHeat(state, host, T.stickyCookHeat, sys);
    spawnShrapnel(state, x, z, host ? host.id : 0, charge.ownerId);
    cue(state, 'sfx_emergent_cook', x, z, T.stickyYield);
    flash(world, 'ring', x, z, x, z, 18);
  }
}

function coated(world, id, simTime) {
  for (let i = 0; i < world.coatings.length; i++) {
    const coat = world.coatings[i];
    if (coat.kind === 'reflect') continue;
    if (coat.hostId === id && coat.until > simTime) return true;
  }
  return false;
}

function arcFrom(state, source, sys, parent, visited) {
  if (!source || visited.has(source.id)) return;
  visited.add(source.id);
  const world = state.emergent;
  let cursor = source;
  let lineage = parent;
  for (let depth = 0; depth < EMERGENT_LIMITS.arcDepth; depth++) {
    let best = null;
    let bestD = T.arcRange;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (!candidate || !candidate.pos || visited.has(candidate.id) || candidate.type === 'fx') continue;
      const profile = physicalProfile(candidate);
      if (!profile || profile.conductivity < 0.35) continue;
      const d = Math.hypot(candidate.pos.x - cursor.pos.x, candidate.pos.z - cursor.pos.z);
      if (d < bestD) {
        best = candidate;
        bestD = d;
      }
    }
    if (!best) return;
    if (lineage) {
      const spawned = trySpawnDescendant(lineage, {
        inheritKind: 'chainChildren',
        cost: PROC_COSTS.chain,
        tick: state.tick | 0,
        spec: lineage.spec || parent.spec,
      });
      if (!spawned.ok) return;
      lineage = spawned.runtime;
    }
    visited.add(best.id);
    const dx = best.pos.x - cursor.pos.x;
    const dz = best.pos.z - cursor.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    give(best, (dx / len) * T.arcImpulse, (dz / len) * T.arcImpulse, 'conductive_arc', state.tick);
    hurt(sys, state, best, 4, 'emp', null);
    addHeat(state, best, T.arcHeat, sys);
    flash(world, 'arc', cursor.pos.x, cursor.pos.z, best.pos.x, best.pos.z, 1);
    cue(state, 'sfx_emergent_crackle', best.pos.x, best.pos.z, T.arcImpulse);
    cursor = best;
  }
}

export function noteEmergentEnergyHit(state, target, amount, attackerId, sys) {
  if (!state || !target || !(amount > 0)) return false;
  const world = state.emergent;
  if (!world || world.arcLock) return false;
  if (!coated(world, target.id, num(state.simTime))) return false;
  const compiled = compileEmergentAttack(emergentWeaponByKind('primer') || 'wpn_conductive_primer');
  if (!compiled.ok) return false;
  world.arcLock = true;
  try {
    syncProcWorldTick(world.procWorld, state.tick | 0);
    const lineage = createLineage({
      spec: compiled.spec,
      world: world.procWorld,
      createdTick: state.tick | 0,
      sourceEntityId: attackerId == null ? null : attackerId,
    });
    lineage.spec = compiled.spec;
    arcFrom(state, target, sys, lineage, new Set());
  } finally {
    world.arcLock = false;
  }
  world.hot = true;
  return true;
}

function tickProjectiles(state, dt, sys) {
  const world = state.emergent;
  const list = world.projectiles;
  for (let i = 0; i < list.length; i++) {
    const slot = list[i];
    if (!slot.alive) continue;
    slot.age += dt;
    if (slot.age > slot.life) {
      freeProjectile(world, slot);
      continue;
    }
    dragProjectile(world, slot, dt);
    slot.x += slot.vx * dt;
    slot.z += slot.vz * dt;
    reflectProjectile(state, slot);
    const hit = hitEntities(state, slot);
    if (!hit) continue;
    onHit(state, slot, hit, sys);
    freeProjectile(world, slot);
  }
}

function reflectProjectile(state, slot) {
  if ((slot.bounces | 0) >= EMERGENT_LIMITS.prismBounces) return;
  const world = state.emergent;
  const prisms = world.prisms;
  for (let i = 0; i < prisms.length; i++) {
    if (slot.skipPrism === i) continue;
    const prism = prisms[i];
    if (Math.hypot(slot.x - prism.x, slot.z - prism.z) > prism.radius) continue;
    const reflected = reflectVelocity(slot.vx, slot.vz, prism.nx, prism.nz, T.prismGain);
    slot.vx = reflected.x;
    slot.vz = reflected.z;
    slot.bounces = (slot.bounces | 0) + 1;
    slot.skipPrism = i;
    const sp = Math.hypot(slot.vx, slot.vz) || 1;
    slot.x = prism.x + (slot.vx / sp) * (prism.radius + 0.6);
    slot.z = prism.z + (slot.vz / sp) * (prism.radius + 0.6);
    cue(state, 'sfx_emergent_prism', prism.x, prism.z, sp);
    return;
  }
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const body = list[i];
    if (!body || !body.pos || body.id === slot.ownerId || body.id === slot.ignoreId) continue;
    if (num(body.reflectivity, num(body.data && body.data.reflectivity, 0)) < 0.5) continue;
    const reach = (body.radius || 1) + 1.2;
    if (Math.hypot(slot.x - body.pos.x, slot.z - body.pos.z) > reach) continue;
    const normal = body.data && body.data.reflectNormal;
    const nx = normal && Number.isFinite(normal.x) ? normal.x : slot.x - body.pos.x;
    const nz = normal && Number.isFinite(normal.z) ? normal.z : slot.z - body.pos.z;
    const reflected = reflectVelocity(slot.vx, slot.vz, nx, nz, T.prismGain);
    slot.vx = reflected.x;
    slot.vz = reflected.z;
    slot.bounces = (slot.bounces | 0) + 1;
    slot.ignoreId = body.id;
    cue(state, 'sfx_emergent_prism', body.pos.x, body.pos.z, Math.hypot(slot.vx, slot.vz));
    return;
  }
}

function dragProjectile(world, slot, dt) {
  const fields = world.fields;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (dist2(slot.x, slot.z, field.x, field.z) > field.radius * field.radius) continue;
    const drag = viscousImpulse(slot.vx, slot.vz, field.axisX, field.axisZ, slot.mass, T.viscosityParallel, T.viscosityPerp, dt);
    slot.vx += drag.jx / slot.mass;
    slot.vz += drag.jz / slot.mass;
  }
}

function tickSprings(state, dt, sys) {
  const springs = state.emergent.springs;
  for (let i = springs.length - 1; i >= 0; i--) {
    const spring = springs[i];
    const a = ent(state, spring.aId);
    const b = ent(state, spring.bId);
    if (!a || !b || !a.pos || !b.pos) {
      springs.splice(i, 1);
      continue;
    }
    const impulse = springImpulse(a.pos.x, a.pos.z, b.pos.x, b.pos.z, spring.rest, spring.k, dt);
    if (!impulse) continue;
    const ja = give(a, impulse.jax, impulse.jaz, 'grav_anchor', state.tick);
    give(b, impulse.jbx, impulse.jbz, 'grav_anchor', state.tick);
    flash(state.emergent, 'arc', a.pos.x, a.pos.z, b.pos.x, b.pos.z, 1);
    if (impulse.dist <= (a.radius || 1) + (b.radius || 1)) {
      const rvx = num(b.vel && b.vel.x) - num(a.vel && a.vel.x);
      const rvz = num(b.vel && b.vel.z) - num(a.vel && a.vel.z);
      const nx = (b.pos.x - a.pos.x) / (impulse.dist || 1);
      const nz = (b.pos.z - a.pos.z) / (impulse.dist || 1);
      const closing = -((rvx * nx) + (rvz * nz));
      if (closing > 2) {
        const damage = reducedMass(physicalProfile(a).mass, physicalProfile(b).mass) * closing * T.springCollide;
        hurt(sys, state, a, damage, 'kinetic', null);
        hurt(sys, state, b, damage, 'kinetic', null);
        cue(state, 'sfx_emergent_crumple', (a.pos.x + b.pos.x) * 0.5, (a.pos.z + b.pos.z) * 0.5, ja);
      }
    }
  }
}

function tickDipoles(state, dt, sys) {
  const tags = state.emergent.polarities;
  for (let i = tags.length - 1; i >= 0; i--) {
    if (!ent(state, tags[i].hostId)) tags.splice(i, 1);
  }
  for (let i = 0; i < tags.length; i++) {
    const a = ent(state, tags[i].hostId);
    if (!a) continue;
    const qa = num(a.magneticCharge, tags[i].charge);
    for (let j = i + 1; j < tags.length; j++) {
      const b = ent(state, tags[j].hostId);
      if (!b) continue;
      const qb = num(b.magneticCharge, tags[j].charge);
      const impulse = dipoleImpulse(a.pos.x, a.pos.z, b.pos.x, b.pos.z, qa, qb, T.dipoleK, dt, T.dipoleEps);
      if (!impulse) continue;
      give(a, impulse.jax, impulse.jaz, 'polarity_dipole', state.tick);
      give(b, impulse.jbx, impulse.jbz, 'polarity_dipole', state.tick);
      if (impulse.attract && impulse.dist <= (a.radius || 1) + (b.radius || 1)) {
        const damage = reducedMass(physicalProfile(a).mass, physicalProfile(b).mass) * impulse.magnitude * T.dipoleContact;
        hurt(sys, state, a, damage, 'kinetic', null);
        hurt(sys, state, b, damage, 'kinetic', null);
        cue(state, 'sfx_emergent_crumple', (a.pos.x + b.pos.x) * 0.5, (a.pos.z + b.pos.z) * 0.5, impulse.magnitude);
      }
    }
  }
}

function tickFields(state, dt, sys) {
  const fields = state.emergent.fields;
  const list = state.entityList || [];
  for (let i = fields.length - 1; i >= 0; i--) {
    const field = fields[i];
    field.life -= dt;
    if (field.life <= 0) {
      fields.splice(i, 1);
      continue;
    }
    for (let n = 0; n < list.length; n++) {
      const body = list[n];
      if (!body || !body.pos || !body.vel || body.type === 'fx' || body.type === 'projectile') continue;
      if (dist2(body.pos.x, body.pos.z, field.x, field.z) > field.radius * field.radius) continue;
      const profile = physicalProfile(body);
      const drag = viscousImpulse(num(body.vel.x), num(body.vel.z), field.axisX, field.axisZ, profile.mass, T.viscosityParallel, T.viscosityPerp, dt);
      give(body, drag.jx, drag.jz, 'viscosity_drag', state.tick);
      if (drag.power > T.viscosityIgnitePower) {
        addHeat(state, body, dt * 18 * Math.min(4, drag.power / T.viscosityIgnitePower), sys);
      }
    }
  }
}

function tickHijacks(state, dt) {
  const hijacks = state.emergent.hijacks;
  for (let i = hijacks.length - 1; i >= 0; i--) {
    const dart = hijacks[i];
    const body = ent(state, dart.hostId);
    if (!body || !body.pos || num(state.simTime) > num(dart.until, Infinity)) {
      hijacks.splice(i, 1);
      continue;
    }
    const profile = physicalProfile(body);
    const target = T.hijackSpinScale * profile.turnRate;
    const inertia = profile.mass * profile.radius * profile.radius * 0.45;
    const torque = inertia * (target - num(body.angVel));
    let jx = 0;
    let jz = 0;
    if (profile.dead && (profile.thrust > 0 || profile.fuelVolatile > 0)) {
      const thrust = profile.thrust > 0 ? profile.thrust : T.hijackBurner;
      const yaw = num(body.rot);
      jx = Math.cos(yaw) * thrust * dt * 60;
      jz = Math.sin(yaw) * thrust * dt * 60;
    }
    deliverShock(state, body, jx, jz, torque, 0, null, 'thruster_hijack');
  }
}

function tickGongs(state, sys) {
  const gongs = state.emergent.gongs;
  const now = num(state.simTime);
  for (let i = gongs.length - 1; i >= 0; i--) {
    const gong = gongs[i];
    const host = ent(state, gong.hostId);
    if (!host || !host.pos || gong.left <= 0) {
      gongs.splice(i, 1);
      continue;
    }
    if (now + 1e-6 < gong.next) continue;
    gong.next = now + T.gongPeriod;
    gong.left -= 1;
    const amplitude = gong.mass * T.gongImpulsePerMass;
    const list = state.entityList || [];
    for (let n = 0; n < list.length; n++) {
      const body = list[n];
      if (!body || !body.pos || body.id === host.id) continue;
      const wave = shockImpulse(host.pos.x, host.pos.z, body.pos.x, body.pos.z, amplitude, T.gongRadius);
      if (wave.dist > T.gongRadius) continue;
      if (body.type === 'projectile' || (body.data && body.data.tracking === 'homing')) {
        give(body, -wave.jz, wave.jx, 'seismic_deflect', state.tick);
      } else if (body.type !== 'fx') {
        give(body, wave.jx, wave.jz, 'seismic_gong', state.tick);
        if (num(body.shield) > 0) body.shield = Math.max(0, body.shield * (1 - T.gongShieldFraction));
      }
    }
    const bolts = state.emergent.projectiles;
    for (let n = 0; n < bolts.length; n++) {
      const bolt = bolts[n];
      if (!bolt.alive) continue;
      const wave = shockImpulse(host.pos.x, host.pos.z, bolt.x, bolt.z, amplitude * 0.02, T.gongRadius);
      if (wave.dist > T.gongRadius) continue;
      bolt.vx += -wave.jz * 0.02;
      bolt.vz += wave.jx * 0.02;
    }
    cue(state, 'sfx_emergent_seismic', host.pos.x, host.pos.z, amplitude);
    flash(state.emergent, 'ring', host.pos.x, host.pos.z, host.pos.x, host.pos.z, 8 + (T.gongWaves - gong.left) * 6);
    if (gong.left <= 0) gongs.splice(i, 1);
  }
}

function tickRay(state, dt, sys) {
  const ray = state.emergent.ray;
  if (!ray) return;
  const owner = ent(state, ray.ownerId);
  state.emergent.ray = null;
  if (!owner || !owner.pos) return;
  const from = muzzle(owner, ray.angle);
  const hit = traceRay(state, from.x, from.z, ray.angle, ray.range, owner.id);
  flash(state.emergent, 'arc', from.x, from.z, hit ? hit.x : from.x + Math.cos(ray.angle) * 24, hit ? hit.z : from.z + Math.sin(ray.angle) * 24, 1);
  if (!hit) return;
  addHeat(state, hit.entity, T.thermalHeatPerSec * dt, sys);
  const j = 6 * dt * 60;
  give(hit.entity, Math.cos(ray.angle) * j, Math.sin(ray.angle) * j, 'thermal_cooker', state.tick);
  if ((hit.entity.conductivity || 0) > 0 && coated(state.emergent, hit.entity.id, num(state.simTime))) {
    noteEmergentEnergyHit(state, hit.entity, T.thermalHeatPerSec * dt, owner.id, sys);
  }
}

function tickContactArcs(state, sys) {
  const world = state.emergent;
  const now = num(state.simTime);
  for (let i = world.coatings.length - 1; i >= 0; i--) {
    const coat = world.coatings[i];
    if (coat.until <= now) {
      world.coatings.splice(i, 1);
      continue;
    }
    if ((state.tick | 0) - (coat.arcTick || 0) < 18) continue;
    const host = ent(state, coat.hostId);
    if (!host || !host.pos) continue;
    const list = state.entityList || [];
    for (let n = 0; n < list.length; n++) {
      const other = list[n];
      if (!other || other.id === host.id || !other.pos) continue;
      const profile = physicalProfile(other);
      if (!profile || profile.conductivity < 0.35) continue;
      const d = Math.hypot(other.pos.x - host.pos.x, other.pos.z - host.pos.z);
      if (d > (host.radius || 1) + (other.radius || 1) + T.arcContactPad) continue;
      coat.arcTick = state.tick | 0;
      noteEmergentEnergyHit(state, host, 1, coat.hostId, sys);
      break;
    }
  }
}

function rebuildPresentation(state, dt) {
  const world = state.emergent;
  const flashes = world.flashes;
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].ttl -= dt;
    if (flashes[i].ttl <= 0) flashes.splice(i, 1);
  }
  let count = 0;
  const out = world.presentation;
  const write = (item) => {
    if (count >= out.length) return;
    const slot = out[count];
    slot.kind = item.kind;
    slot.x = item.x;
    slot.z = item.z;
    slot.x2 = item.x2;
    slot.z2 = item.z2;
    slot.scale = item.scale;
    slot.yaw = item.yaw || 0;
    count += 1;
  };
  for (let i = 0; i < flashes.length; i++) write(flashes[i]);
  for (let i = 0; i < world.fields.length; i++) {
    const field = world.fields[i];
    write({ kind: 'gel', x: field.x, z: field.z, x2: field.x, z2: field.z, scale: field.radius, yaw: 0 });
  }
  for (let i = 0; i < world.prisms.length; i++) {
    const prism = world.prisms[i];
    write({ kind: 'prism', x: prism.x, z: prism.z, x2: prism.x, z2: prism.z, scale: prism.radius, yaw: prism.yaw });
  }
  world.presentationCount = count;
}

function stillHot(world) {
  if (world.projectileLive > 0 || world.ray) return true;
  return world.stickies.length + world.coatings.length + world.springs.length
    + world.polarities.length + world.fields.length + world.prisms.length
    + world.hijacks.length + world.gongs.length + world.links.length
    + world.flashes.length > 0;
}

export function tickEmergent(state, dt, sys) {
  const world = state.emergent;
  if (!world) return;
  world.bus = sys && sys.bus;
  const step = dt > DT_MIN ? dt : DT_MIN;
  syncProcWorldTick(world.procWorld, state.tick | 0);
  const detonate = !!(state.input && state.input.actions && state.input.actions.chargeDetonate);
  if (detonate && world.stickies.length) detonateStickies(state, sys);
  tickProjectiles(state, step, sys);
  tickSprings(state, step, sys);
  tickDipoles(state, step, sys);
  tickFields(state, step, sys);
  tickHijacks(state, step);
  tickGongs(state, sys);
  tickRay(state, step, sys);
  tickContactArcs(state, sys);
  for (let i = world.prisms.length - 1; i >= 0; i--) {
    world.prisms[i].life -= step;
    if (world.prisms[i].life <= 0) world.prisms.splice(i, 1);
  }
  rebuildPresentation(state, step);
  world.hot = stillHot(world);
}

export const emergentPrimitives = {
  name: 'emergentPrimitives',
  init(ctx) {
    this.destroy();
    this.bus = ctx && ctx.bus;
    this.helpers = (ctx && ctx.helpers) || {};
    this.registry = ctx && ctx.registry;
    this.state = ctx && ctx.state;
    this.voice = createEmergentVoice();
    this._onDamage = (payload) => {
      if (!payload || !this.state || (this.state.emergent && this.state.emergent.arcLock)) return;
      const channels = payload.channels || {};
      const thermal = num(channels.thermal) + num(channels.energy);
      const type = payload.type || payload.damageType;
      if (!(thermal > 0) && type !== 'thermal' && type !== 'energy') return;
      const target = ent(this.state, payload.targetId);
      noteEmergentEnergyHit(this.state, target, payload.amount || thermal || 1, payload.attackerId, this);
    };
    this._onAudio = (cuePayload) => {
      if (this.voice) this.voice.play(cuePayload, this.registry);
    };
    const unsubs = [];
    const listen = (event, fn) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, fn);
      unsubs.push(typeof off === 'function' ? off : () => this.bus.off && this.bus.off(event, fn));
    };
    listen('combat:damage', this._onDamage);
    listen('emergent:audio', this._onAudio);
    this._unbind = () => {
      while (unsubs.length) unsubs.pop()();
    };
  },
  update(dt, state) {
    this.state = state;
    if (!state || state.mode !== 'flight') return;
    if (!state.emergent || !state.emergent.hot) return;
    tickEmergent(state, dt, this);
  },
  destroy() {
    if (typeof this._unbind === 'function') this._unbind();
    this._unbind = null;
    if (this.voice) this.voice.dispose();
    this.voice = null;
  },
};
