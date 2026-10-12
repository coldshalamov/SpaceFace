// Reactive matter on the live entity graph.
// Laws stay in src/matter/reactive/step.js. This system copies entity kinematics in,
// then writes impulses, debris, collider revisions, and attachment.targetId back out
// through the public physics and massline seams. It does not integrate positions.

import { makeEntity } from '../core/entity.js';
import {
  prepareExternalPhysicsImpulse,
  queuePhysicsImpulse,
  syncDerivedPhysicsMass,
} from '../core/physicsAuthority.js';
import { DEFAULT_MASSLINE_DEF } from '../core/constraints/masslineController.js';
import { REACTIVE_DT } from '../data/reactiveMatter/budgets.js';
import { getCombatKernel } from '../combat/kernel.js';
import { reactiveHabitatFor } from '../data/reactiveMatter/habitats.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { modelById } from '../data/reactiveMatter/models.js';
import { stepReactiveMatter } from '../matter/reactive/step.js';
import {
  addHitch,
  addMachine,
  createReactiveWorld,
  spawnReactiveBody,
  saveReactiveWorld,
  loadReactiveWorld,
} from '../matter/reactive/world.js';

const REEL_SPEED = DEFAULT_MASSLINE_DEF.reelInSpeed;
const REST_MIN = DEFAULT_MASSLINE_DEF.minLength;
const REST_MAX = DEFAULT_MASSLINE_DEF.maxLength;
const THRUST_ACCEL = 40;

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function tapeAt(segments, tick) {
  const tape = { thrust: 0, heading: 0, reel: 0, brake: 0, cut: false };
  const rows = segments || [];
  for (let i = 0; i < rows.length; i++) {
    const seg = rows[i];
    if (tick < seg.from || tick >= seg.to) continue;
    if (seg.thrust != null) tape.thrust = seg.thrust;
    if (seg.heading != null) tape.heading = seg.heading;
    if (seg.reel != null) tape.reel = seg.reel;
    if (seg.brake != null) tape.brake = seg.brake;
    if (seg.cut) tape.cut = true;
  }
  return tape;
}

function attachmentMap(state) {
  const combat = state.combat || (state.combat = {});
  if (!combat.attachments) combat.attachments = { byId: {} };
  if (!combat.attachments.byId) combat.attachments.byId = {};
  return combat.attachments.byId;
}

function copyImpact(payload) {
  if (!payload) return null;
  const normal = payload.normal || {};
  return {
    aId: payload.aId,
    bId: payload.bId,
    nx: Number.isFinite(normal.x) ? normal.x : 0,
    nz: Number.isFinite(normal.z) ? normal.z : 0,
    closingSpeed: Number.isFinite(payload.preSolveClosingSpeed) ? payload.preSolveClosingSpeed : 0,
    tick: payload.tick,
  };
}

function ensureWorld(state) {
  if (!state.reactiveMatterWorld) {
    state.reactiveMatterWorld = createReactiveWorld({ seed: state.meta?.seed || state.seed || 1, tick: state.tick | 0 });
  }
  return state.reactiveMatterWorld;
}

function liveByKey(state, id) {
  return state.entities.get(id) || state.entityList.find((e) => e.alive !== false
    && (e.data?.reactiveMatter?.key === id || e.data?.reactiveMachine?.key === id)) || null;
}

function spawnLiveEntity(state, spec, helpers = null) {
  if (state.entities.has(spec.id)) return state.entities.get(spec.id);
  const model = modelById(spec.modelId);
  const anchored = spec.anchored === true || model?.anchored === true;
  const entitySpec = {
    id: spec.id,
    type: anchored ? (helpers ? 'fx' : 'station')
      : (spec.isPlayer || spec.role === 'ship' || spec.role === 'traffic' ? 'ship' : (helpers ? 'payload' : 'asteroid')),
    alive: true,
    occupantGeneration: 1,
    isPlayer: spec.isPlayer === true,
    pos: { x: spec.x || 0, y: 0, z: spec.z || 0 },
    vel: { x: spec.vx || 0, y: 0, z: spec.vz || 0 },
    radius: spec.radius,
    mass: spec.mass,
    collides: spec.collides !== false,
    physicsBody: anchored ? {
      shape: 'ball', radius: spec.radius, mass: spec.mass, dynamic: false,
    } : {
      shape: 'ball', radius: spec.radius, mass: spec.mass, dynamic: true, ccd: true,
    },
    data: {
      persistenceOwner: 'reactiveMatter',
      isLandmark: anchored,
      landmarkId: spec.key ?? spec.id,
      homeSectorId: state.world?.currentSectorId || null,
      placeId: spec.placeId || null,
      scanLabel: spec.scanLabel || `${spec.modelId.replace(/_/g, ' ')} · towable material`,
      authoredPayloadAssetId: !anchored ? 'pod_cargo_container' : null,
      reactiveMatter: {
        key: spec.key ?? spec.id,
        modelId: spec.modelId,
        parentId: spec.parentId || null,
        runtime: spec.runtime === true,
        anchored,
        role: spec.role || model?.role || 'cargo',
      },
    },
  };
  if (helpers?.spawnEntity) {
    if (entitySpec.id == null) delete entitySpec.id;
    return helpers.spawnEntity(entitySpec);
  }
  const entity = makeEntity(entitySpec);
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function syncBodies(world, state) {
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const stamp = entity?.data?.reactiveMatter;
    if (!stamp || entity.alive === false) continue;
    const key = stamp.key ?? entity.id;
    const existing = world.bodies.get(key);
    if (!existing) {
      spawnReactiveBody(world, {
        id: key,
        modelId: stamp.modelId,
        x: entity.pos.x,
        z: entity.pos.z,
        vx: entity.vel.x,
        vz: entity.vel.z,
        mass: entity.mass,
        radius: entity.radius,
        runtime: stamp.runtime === true,
        anchored: stamp.anchored === true,
        isPlayer: entity.isPlayer === true,
        role: stamp.role,
        phase: stamp.phase,
        parentId: stamp.parentId,
        heat: entity.heat || 0,
      });
      continue;
    }
    existing.x = entity.pos.x;
    existing.z = entity.pos.z;
    if (!existing.anchored && existing.phase !== 'fractured') {
      existing.vx = entity.vel.x;
      existing.vz = entity.vel.z;
    }
  }
}

function syncMachines(world, state) {
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const machine = entity?.data?.reactiveMachine;
    if (!machine) continue;
    const existing = world.machines.get(machine.key ?? entity.id);
    if (!existing) {
      addMachine(world, {
        id: machine.key ?? entity.id,
        bodyId: machine.key ?? entity.id,
        x: entity.pos.x,
        z: entity.pos.z,
        strength: machine.strength,
        fieldRadius: machine.fieldRadius,
        polarity: machine.polarity,
        anchored: true,
        flipEvery: machine.flipEvery || 0,
        enabled: machine.enabled !== false,
      });
    } else {
      existing.x = entity.pos.x;
      existing.z = entity.pos.z;
    }
  }
}

function syncHitches(world, state) {
  const byId = attachmentMap(state);
  for (const id of Object.keys(byId)) {
    const attachment = byId[id];
    if (!attachment) continue;
    for (const entityId of [attachment.ownerId, attachment.targetId]) {
      const entity = state.entities.get(entityId);
      if (!entity || entity.alive === false) continue;
      const key = entity.data?.reactiveMatter?.key ?? entity.id;
      if (!world.bodies.has(key)) {
        const body = spawnReactiveBody(world, { id: key, modelId: 'hauler', role: 'observer',
          x: entity.pos.x, z: entity.pos.z, mass: entity.mass, radius: entity.radius, isPlayer: entity.isPlayer });
        if (body) { body.mass = entity.mass; body.radius = entity.radius; }
      }
    }
    let hitch = world.hitches.get(id);
    if (!hitch) {
      hitch = addHitch(world, {
        id,
        ownerId: state.entities.get(attachment.ownerId)?.data?.reactiveMatter?.key ?? attachment.ownerId,
        targetId: state.entities.get(attachment.targetId)?.data?.reactiveMatter?.key ?? attachment.targetId,
        rest: attachment.restLength,
        lugLocalX: attachment.lugLocalX || 0,
        lugLocalZ: attachment.lugLocalZ || 0,
        alive: attachment.state !== 'cut' && attachment.state !== 'broken',
      });
    }
    if (!hitch) continue;
    hitch.rest = attachment.restLength;
    if (attachment.state === 'cut' || attachment.state === 'broken') hitch.alive = false;
  }
}

function syncFields(world, fieldsPort) {
  const list = fieldsPort?.kernelList?.() || fieldsPort?.list?.() || [];
  const fields = [];
  for (let i = 0; i < list.length; i++) {
    const field = list[i];
    const thermal = field && field.thermal;
    if (!thermal || thermal.kind !== 'burn') continue;
    fields.push({
      id: field.id,
      kind: 'thermal',
      x: field.center ? field.center.x : 0,
      z: field.center ? field.center.z : 0,
      radius: field.radius,
      heatPerSec: thermal.heatPerSecond || 0,
    });
  }
  world.fields = fields;
}

function applyDemo(state, world, dt, owner) {
  const demo = state.reactiveMatterDemo;
  if (!demo) return;
  const tape = tapeAt(demo.tape, world.tick);
  const player = state.entities.get('player');
  if (player && player.mass > 0 && tape.thrust > 0) {
    const j = player.mass * THRUST_ACCEL * tape.thrust * dt;
    queuePhysicsImpulse(player, {
      x: Math.cos(tape.heading) * j,
      y: 0,
      z: Math.sin(tape.heading) * j,
    }, { motionIntent: 'player_maneuver', source: 'reactiveMatter', tick: world.tick, dt });
  }
  if (player && player.mass > 0 && tape.brake > 0) {
    const keep = Math.exp(-3 * tape.brake * dt);
    const scale = 1 - keep;
    queuePhysicsImpulse(player, {
      x: -player.vel.x * player.mass * scale,
      y: 0,
      z: -player.vel.z * player.mass * scale,
    }, { motionIntent: 'player_maneuver', source: 'reactiveMatter', tick: world.tick, dt });
  }
  const byId = attachmentMap(state);
  for (const hitch of world.hitches.values()) {
    if (tape.cut && hitch.alive && hitch.ownerId === 'player') {
      hitch.alive = false;
      hitch.broken = 'cut';
      const attachment = byId[hitch.id];
      if (attachment) attachment.state = 'cut';
      owner?.cutAttachment?.({ attachmentId: hitch.id, reason: 'cut', tick: world.tick });
    }
    if (tape.reel && hitch.alive && hitch.ownerId === 'player') {
      hitch.rest = clamp(hitch.rest - tape.reel * REEL_SPEED * dt, REST_MIN, REST_MAX);
      const attachment = byId[hitch.id];
      if (attachment) attachment.restLength = hitch.rest;
      owner?.setAttachmentReel?.({ attachmentId: hitch.id, restLength: hitch.rest });
    }
  }
}

function queuePair(state, world, impulse, dt) {
  const body = liveByKey(state, impulse.bodyId);
  const other = impulse.otherId != null ? liveByKey(state, impulse.otherId) : null;
  const anchor = impulse.anchorId != null ? liveByKey(state, impulse.anchorId) : null;
  let jx = impulse.jx;
  let jz = impulse.jz;
  const player = body?.isPlayer ? body : (other?.isPlayer ? other : null);
  if (player && impulse.externalEffect) {
    const sign = body?.isPlayer ? 1 : -1;
    const scaled = prepareExternalPhysicsImpulse(player, { x: jx * sign, y: 0, z: jz * sign }, {
      externalEffect: true,
      tick: world.tick,
      dt,
      continuous: impulse.continuous === true,
    });
    if (!scaled) return;
    const raw = Math.hypot(jx, jz);
    const got = Math.hypot(scaled.x, scaled.z);
    const scale = raw > 1e-8 ? got / raw : 0;
    jx *= scale;
    jz *= scale;
    if (impulse.storeId && impulse.storeJ > 0) {
      const store = world.bodies.get(impulse.storeId);
      if (store) store.stored = Math.max(0, store.stored - impulse.storeJ * (1 - scale));
    }
    queuePhysicsImpulse(player, { x: scaled.x, y: 0, z: scaled.z }, {
      externalProtected: true,
      source: 'reactiveMatter',
    });
    const partner = body?.isPlayer ? (other || anchor) : body;
    if (partner && partner !== player) {
      queuePhysicsImpulse(partner, { x: -scaled.x, y: 0, z: -scaled.z }, {
        externalProtected: true,
        source: 'reactiveMatter',
      });
    }
    return;
  }
  if (body) {
    queuePhysicsImpulse(body, { x: jx, y: 0, z: jz }, { source: 'reactiveMatter', externalProtected: true });
  }
  if (other && other !== body) {
    queuePhysicsImpulse(other, { x: -jx, y: 0, z: -jz }, { source: 'reactiveMatter', externalProtected: true });
  } else if (anchor && anchor !== body) {
    queuePhysicsImpulse(anchor, { x: -jx, y: 0, z: -jz }, { source: 'reactiveMatter', externalProtected: true });
  }
}

function commitBodies(state, world) {
  for (const body of world.bodies.values()) {
    const entity = liveByKey(state, body.id);
    if (!entity?.data?.reactiveMatter) continue;
    const stamp = entity.data.reactiveMatter;
    stamp.phase = body.phase;
    stamp.parentId = body.parentId;
    entity.heat = body.heat;
    if (body.phase === 'fractured') {
      entity.radius = 0;
      entity.mass = 0;
      entity.collides = false;
      entity.physicsBody = false;
      continue;
    }
    if (body.mass > 0 && (entity.mass !== body.mass || entity.radius !== body.radius)) {
      entity.mass = body.mass;
      entity.radius = body.radius;
      if (entity.physicsBody && entity.physicsBody !== false) {
        syncDerivedPhysicsMass(entity, body.mass, entity.physicsBody.inertiaY, body.radius);
      }
    }
  }
}

function ensureCounterpart(world, entity) {
  if (!entity?.pos || entity.alive === false) return null;
  const key = entity.data?.reactiveMatter?.key ?? entity.id;
  let body = world.bodies.get(key);
  if (!body) body = spawnReactiveBody(world, { id: key, modelId: 'hauler', role: 'observer',
    x: entity.pos.x, z: entity.pos.z, isPlayer: entity.isPlayer });
  if (body && !entity.data?.reactiveMatter) {
    Object.assign(body, { x: entity.pos.x, z: entity.pos.z, vx: entity.vel?.x || 0, vz: entity.vel?.z || 0,
      mass: Math.max(0.25, entity.mass || 1), radius: entity.radius || 1,
      anchored: entity.physicsBody?.dynamic === false, isPlayer: entity.isPlayer === true });
  }
  return key;
}

function commitSpawns(state, world, spawned, helpers) {
  for (let i = 0; i < spawned.length; i++) {
    const body = world.bodies.get(spawned[i]);
    if (!body || liveByKey(state, body.id)) continue;
    const entity = spawnLiveEntity(state, {
      id: helpers?.spawnEntity ? undefined : body.id,
      key: body.id,
      modelId: body.modelId,
      x: body.x,
      z: body.z,
      vx: body.vx,
      vz: body.vz,
      mass: body.mass,
      radius: body.radius,
      runtime: true,
      role: body.role,
      parentId: body.parentId,
      anchored: false,
    }, helpers);
    entity.data.reactiveMatter.phase = body.phase;
    entity.data.reactiveMatter.parentId = body.parentId;
  }
}

function commitRetargets(state, world, result, owner, attachments) {
  const byId = attachmentMap(state);
  for (let i = 0; i < result.retargets.length; i++) {
    const retarget = result.retargets[i];
    const attachment = byId[retarget.hitchId];
    const hitch = world.hitches.get(retarget.hitchId);
    const next = liveByKey(state, retarget.toId);
    if (attachments && attachment && next) {
      const rebound = attachments.rebind(attachment.id, attachment.ownerId, {
        targetId: next.id, targetAnchorLocal: { x: hitch?.lugLocalX || 0, y: 0, z: hitch?.lugLocalZ || 0 },
      });
      if (!rebound.ok) attachments.breakAttachment(attachment, 'fracture', attachment.ownerId);
      continue;
    }
    if (attachment) {
      attachment.targetId = next?.id ?? retarget.toId;
      attachment.lugLocalX = hitch ? hitch.lugLocalX : 0;
      attachment.lugLocalZ = hitch ? hitch.lugLocalZ : 0;
      attachment.state = 'active';
    }
    if (owner?.cutAttachment && owner?.createAttachment && attachment) {
      owner.syncFromEntities?.(state.entityList);
      owner.cutAttachment({ attachmentId: attachment.id, reason: 'retarget', tick: world.tick });
      const target = liveByKey(state, retarget.toId);
      const ship = state.entities.get(attachment.ownerId);
      if (target && ship) {
        owner.createAttachment({
          attachmentId: attachment.id,
          defId: 'attachment_massline_s',
          ownerId: attachment.ownerId,
          targetId: target.id,
          sourceWorld: ship.pos,
          targetWorld: target.pos,
          targetAnchorLocal: { x: attachment.lugLocalX || 0, y: 0, z: attachment.lugLocalZ || 0 },
          restLength: attachment.restLength,
          spring: { mode: 'legacy_rope' },
          tick: world.tick,
        });
      }
    }
  }
  for (let i = 0; i < result.towClears.length; i++) {
    const clear = result.towClears[i];
    const attachment = byId[clear.hitchId];
    if (attachment) attachment.state = 'broken';
    owner?.cutAttachment?.({ attachmentId: clear.hitchId, reason: 'fracture', tick: world.tick });
  }
}

export const reactiveMatter = {
  name: 'reactiveMatter',

  init(ctx) {
    for (const off of this._off || []) if (typeof off === 'function') off();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this.ctx = ctx;
    this._sceneSector = null;
    this.pending = [];
    this.cues = [];
    this._off = [];
    if (ctx.bus && typeof ctx.bus.on === 'function') {
      this._off.push(ctx.bus.on('physics:impact', (payload) => {
        const copy = copyImpact(payload);
        if (!copy) return;
        this.pending.push(copy);
        if (this.pending.length > 128) this.pending.shift();
      }));
      this._off.push(ctx.bus.on('sector:exit', () => this._clearLive()));
      this._off.push(ctx.bus.on('game:new', () => { this._clearLive(); this.state.reactiveMatterWorld = null; }));
    }
  },

  update(dt, state) {
    state = state || this.state;
    this.state = state;
    if (this.registry && !this.helpers.reactiveMatterLab && (state.mode !== 'flight' || !(state.timeScale > 0)
      || state.entities.get(state.playerId)?.flags?.docked)) return null;
    this._place();
    const world = ensureWorld(state || this.state);
    const stepDt = dt > 0 ? dt : REACTIVE_DT;
    const owner = this.physicsPort || this.helpers.combatPhysics || this.registry?.physics || this.registry?.get?.('physics');
    if (this.helpers.reactiveMatterLab && owner && typeof owner.drainContactImpacts === 'function') {
      const receipts = owner.drainContactImpacts() || [];
      for (let i = 0; i < receipts.length; i++) {
        const copy = copyImpact(receipts[i]);
        if (copy) this.pending.push(copy);
      }
    }
    syncBodies(world, state);
    syncMachines(world, state);
    syncHitches(world, state);
    syncFields(world, this.fieldsPort || this.registry?.fields || this.registry?.get?.('fields'));
    if (this.helpers.reactiveMatterLab) applyDemo(state, world, stepDt, owner);
    const player = state.entities.get(state.playerId);
    if (player) ensureCounterpart(world, player);
    const contacts = [], seen = new Set();
    for (const row of this.pending.splice(0)) {
      const a = state.entities.get(row.aId), b = state.entities.get(row.bId);
      if (!a?.data?.reactiveMatter && !b?.data?.reactiveMatter) continue;
      const key = `${row.tick}:${String(row.aId)}:${String(row.bId)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({ ...row, aId: ensureCounterpart(world, a), bId: ensureCounterpart(world, b) });
    }
    const result = stepReactiveMatter(world, { dt: stepDt, contacts });
    for (let i = 0; i < result.impulses.length; i++) queuePair(state, world, result.impulses[i], result.dt);
    commitSpawns(state, world, result.spawned, this.helpers.reactiveMatterLab ? null : this.helpers);
    commitBodies(state, world);
    const attachments = result.retargets.length && this.registry ? getCombatKernel(this.ctx).attachments : null;
    commitRetargets(state, world, result, owner, attachments);
    for (const key of result.reaped || []) {
      const e = liveByKey(state, key);
      if (e?.data?.reactiveMatter?.runtime) this.helpers.removeEntity?.(e.id);
    }
    if (result.cues.length) {
      this.cues.push(...result.cues);
      if (this.cues.length > 64) this.cues.splice(0, this.cues.length - 64);
      state.reactiveMatterCues = result.cues;
      this.bus?.emit?.('reactiveMatter:cues', result.cues);
    } else {
      state.reactiveMatterCues = [];
    }
    state.reactiveMatterLast = result;
    return result;
  },

  _place() {
    const state = this.state, sectorId = state.world?.currentSectorId;
    if (this.helpers.reactiveMatterLab || !this.helpers.spawnEntity || !sectorId) return;
    const kind = state.run?.kind;
    if (kind && kind !== 'adventure' && kind !== 'campaign') return;
    const habitat = reactiveHabitatFor(sectorId);
    if (!habitat || this._sceneSector === sectorId) return;
    this._sceneSector = sectorId;
    const world = ensureWorld(state);
    for (const row of habitat.bodies) {
      const key = `reactive:${sectorId}:${row.id}`;
      if (liveByKey(state, key)) continue;
      const saved = world.bodies.get(key);
      if (world.terminal.get(key) === 'fractured') continue;
      const p = sectorLocalToGlobalForSector({ x: habitat.x + row.x, z: habitat.z + row.z }, sectorId);
      const entity = installReactiveEntity(state, { ...row, key, x: saved?.x ?? p.x, z: saved?.z ?? p.z,
        vx: saved?.vx || 0, vz: saved?.vz || 0, mass: saved?.mass, radius: saved?.radius,
      }, this.helpers);
      if (saved) { entity.data.reactiveMatter.phase = saved.phase; entity.heat = saved.heat; }
    }
    const fragments = [...world.bodies.values()].filter((body) => String(body.id).startsWith(`reactive:${sectorId}:`)
      && (body.role === 'shard' || body.role === 'debris'));
    commitSpawns(state, world, fragments.map((body) => body.id), this.helpers);
  },

  _clearLive() {
    const world = this.state?.reactiveMatterWorld;
    if (world) syncBodies(world, this.state);
    for (const e of [...(this.state?.entityList || [])]) {
      if (e.data?.persistenceOwner === 'reactiveMatter') this.helpers.removeEntity?.(e.id);
    }
    if (world) { world.machines.clear(); world.hitches.clear(); }
    this.pending = []; this._sceneSector = null;
  },

  serialize() {
    const world = ensureWorld(this.state);
    syncBodies(world, this.state);
    const saved = saveReactiveWorld(world);
    saved.bodies = saved.bodies.filter((body) => body.role !== 'observer');
    return saved;
  },

  deserialize(data) {
    this._clearLive();
    this.state.reactiveMatterWorld = loadReactiveWorld(data);
    this._sceneSector = null;
  },

  destroy() {
    for (const off of this._off || []) if (typeof off === 'function') off();
    this._off = [];
    this.pending = [];
  },
};

export function installReactiveEntity(state, spec, helpers = null) {
  const model = modelById(spec.modelId);
  const entity = spawnLiveEntity(state, {
    id: spec.id,
    key: spec.key,
    placeId: spec.placeId,
    scanLabel: spec.scanLabel,
    modelId: spec.modelId,
    x: spec.x || 0,
    z: spec.z || 0,
    vx: spec.vx || 0,
    vz: spec.vz || 0,
    mass: spec.mass || model.mass,
    radius: spec.radius || model.radius,
    isPlayer: spec.isPlayer === true,
    role: spec.role || model.role,
    anchored: spec.anchored === true || model.anchored === true,
    runtime: spec.runtime === true,
    parentId: spec.parentId || null,
  }, helpers);
  if (spec.reactiveMachine) entity.data.reactiveMachine = { ...spec.reactiveMachine, key: spec.key ?? entity.id };
  return entity;
}

export { REEL_SPEED, REST_MIN, REST_MAX };
