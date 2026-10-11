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
import { modelById } from '../data/reactiveMatter/models.js';
import { stepReactiveMatter } from '../matter/reactive/step.js';
import {
  addHitch,
  addMachine,
  createReactiveWorld,
  spawnReactiveBody,
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
    state.reactiveMatterWorld = createReactiveWorld({ seed: state.seed || 1, tick: state.tick | 0 });
  }
  return state.reactiveMatterWorld;
}

function spawnLiveEntity(state, spec) {
  if (state.entities.has(spec.id)) return state.entities.get(spec.id);
  const model = modelById(spec.modelId);
  const anchored = spec.anchored === true || model?.anchored === true;
  const entity = makeEntity({
    id: spec.id,
    type: anchored ? 'station' : (spec.isPlayer || spec.role === 'ship' || spec.role === 'traffic' ? 'ship' : 'asteroid'),
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
      reactiveMatter: {
        modelId: spec.modelId,
        parentId: spec.parentId || null,
        runtime: spec.runtime === true,
        anchored,
        role: spec.role || model?.role || 'cargo',
      },
    },
  });
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
    const existing = world.bodies.get(entity.id);
    if (!existing) {
      spawnReactiveBody(world, {
        id: entity.id,
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
    const existing = world.machines.get(entity.id);
    if (!existing) {
      addMachine(world, {
        id: entity.id,
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
    let hitch = world.hitches.get(id);
    if (!hitch) {
      hitch = addHitch(world, {
        id,
        ownerId: attachment.ownerId,
        targetId: attachment.targetId,
        rest: attachment.restLength,
        lugLocalX: attachment.lugLocalX || 0,
        lugLocalZ: attachment.lugLocalZ || 0,
        alive: attachment.state !== 'cut' && attachment.state !== 'broken',
      });
    }
    if (!hitch) continue;
    if (attachment.state === 'cut' || attachment.state === 'broken') hitch.alive = false;
  }
}

function syncFields(world, state) {
  const kernel = state.fieldsKernel;
  const list = kernel && typeof kernel.list === 'function' ? kernel.list() : [];
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

function applyDemo(state, world, dt) {
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
  const owner = state.physicsOwner;
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
  const body = state.entities.get(impulse.bodyId);
  const other = impulse.otherId ? state.entities.get(impulse.otherId) : null;
  const anchor = impulse.anchorId ? state.entities.get(impulse.anchorId) : null;
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
  if (other) {
    queuePhysicsImpulse(other, { x: -jx, y: 0, z: -jz }, { source: 'reactiveMatter', externalProtected: true });
  } else if (anchor) {
    queuePhysicsImpulse(anchor, { x: -jx, y: 0, z: -jz }, { source: 'reactiveMatter', externalProtected: true });
  }
}

function commitBodies(state, world) {
  for (const body of world.bodies.values()) {
    const entity = state.entities.get(body.id);
    if (!entity) continue;
    const stamp = entity.data.reactiveMatter;
    stamp.phase = body.phase;
    stamp.parentId = body.parentId;
    entity.heat = body.heat;
    if (body.phase === 'fractured') {
      entity.radius = 0;
      entity.mass = 0;
      entity.collides = false;
      entity.physicsBody = false;
      entity.vel.x = 0;
      entity.vel.z = 0;
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

function commitSpawns(state, world, spawned) {
  for (let i = 0; i < spawned.length; i++) {
    const body = world.bodies.get(spawned[i]);
    if (!body || state.entities.has(body.id)) continue;
    const entity = spawnLiveEntity(state, {
      id: body.id,
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
    });
    entity.data.reactiveMatter.phase = body.phase;
    entity.data.reactiveMatter.parentId = body.parentId;
  }
}

function commitRetargets(state, world, result) {
  const byId = attachmentMap(state);
  const owner = state.physicsOwner;
  for (let i = 0; i < result.retargets.length; i++) {
    const retarget = result.retargets[i];
    const attachment = byId[retarget.hitchId];
    const hitch = world.hitches.get(retarget.hitchId);
    if (attachment) {
      attachment.targetId = retarget.toId;
      attachment.lugLocalX = hitch ? hitch.lugLocalX : 0;
      attachment.lugLocalZ = hitch ? hitch.lugLocalZ : 0;
      attachment.state = 'active';
    }
    if (owner?.cutAttachment && owner?.createAttachment && attachment) {
      owner.syncFromEntities?.(state.entityList);
      owner.cutAttachment({ attachmentId: attachment.id, reason: 'retarget', tick: world.tick });
      const target = state.entities.get(retarget.toId);
      const ship = state.entities.get(attachment.ownerId);
      if (target && ship) {
        owner.createAttachment({
          attachmentId: attachment.id,
          defId: 'attachment_massline_s',
          ownerId: attachment.ownerId,
          targetId: retarget.toId,
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
    this.state = ctx.state;
    this.bus = ctx.bus;
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
    }
  },

  update(dt, state) {
    const world = ensureWorld(state || this.state);
    const stepDt = dt > 0 ? dt : REACTIVE_DT;
    const owner = state.physicsOwner;
    if (owner && typeof owner.drainContactImpacts === 'function') {
      const receipts = owner.drainContactImpacts() || [];
      for (let i = 0; i < receipts.length; i++) {
        const copy = copyImpact(receipts[i]);
        if (copy) this.pending.push(copy);
      }
    }
    syncBodies(world, state);
    syncMachines(world, state);
    syncHitches(world, state);
    syncFields(world, state);
    applyDemo(state, world, stepDt);
    const contacts = this.pending.splice(0, this.pending.length);
    const result = stepReactiveMatter(world, { dt: stepDt, contacts });
    for (let i = 0; i < result.impulses.length; i++) queuePair(state, world, result.impulses[i], result.dt);
    commitSpawns(state, world, result.spawned);
    commitBodies(state, world);
    commitRetargets(state, world, result);
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

  destroy() {
    for (const off of this._off || []) if (typeof off === 'function') off();
    this._off = [];
    this.pending = [];
  },
};

export function installReactiveEntity(state, spec) {
  const model = modelById(spec.modelId);
  const entity = spawnLiveEntity(state, {
    id: spec.id,
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
  });
  if (spec.reactiveMachine) entity.data.reactiveMachine = { ...spec.reactiveMachine };
  return entity;
}

export { REEL_SPEED, REST_MIN, REST_MAX };
