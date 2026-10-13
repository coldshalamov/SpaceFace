// Scripted pilots. Archetypes do not read doctrine memory. The counter tape reads only
// the telegraph the doctrine has already published on the hull.

import { holdManeuver, steerToward } from '../../src/ai/counterplay/steer.js';

function posOf(entity) {
  return entity && entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null;
}

function actor(ctx, role) {
  return ctx.actors.get(role) || null;
}

function published(ctx) {
  const opponent = actor(ctx, 'opponent');
  return opponent && opponent.data && opponent.data.counterplay || null;
}

function toInput(self, maneuver, extra = {}) {
  return {
    moveX: maneuver.right || 0,
    moveZ: maneuver.forward || 0,
    turnIntent: maneuver.torqueYaw || 0,
    boost: maneuver.boost === true,
    brake: maneuver.brake === true,
    fire: extra.fire === true,
    aimAngle: Number.isFinite(extra.aimAngle) ? extra.aimAngle : (self && self.rot) || 0,
    verb: extra.verb || null,
  };
}

function aimAt(self, target) {
  if (!self || !target || !target.pos) return self && self.rot || 0;
  const dx = target.pos.x - self.pos.x;
  const dz = target.pos.z - self.pos.z;
  const gap = Math.hypot(dx, dz) || 1;
  const lead = Math.min(0.45, gap / 320);
  return Math.atan2(dz + (target.vel?.z || 0) * lead, dx + (target.vel?.x || 0) * lead);
}

export function pilotIntent(pilotId, ctx) {
  if (pilotId === 'stationary') return toInput(ctx.player, holdManeuver(ctx.player));
  if (pilotId === 'counter' || (ctx.scene && ctx.scene.tape === 'counter' && pilotId === ctx.scene.pilotId && pilotId !== 'close_booster' && pilotId !== 'rope_manipulator' && pilotId !== 'evasive' && pilotId !== 'civilian_protector')) {
    return counterIntent(ctx);
  }
  if (pilotId === 'counter') return counterIntent(ctx);
  if (pilotId === 'rope_manipulator') return ropePilot(ctx);
  if (pilotId === 'evasive') return evasivePilot(ctx);
  if (pilotId === 'civilian_protector') return protectorPilot(ctx);
  return boosterPilot(ctx);
}

function boosterPilot(ctx) {
  const self = ctx.player;
  const target = actor(ctx, 'opponent') || actor(ctx, 'packmate');
  const maneuver = target
    ? steerToward(self, target.pos, { boost: true, arrive: 28, boostDist: 90 })
    : holdManeuver(self);
  return toInput(self, maneuver);
}

function ropePilot(ctx) {
  const self = ctx.player;
  const decoy = actor(ctx, 'opponent');
  const prize = actor(ctx, 'prize');
  const target = ctx.scene.doctrineId === 'cp_prize_runner' ? prize : decoy;
  const already = (ctx.tethers || []).some((tether) => tether.ownerId === self.id || tether.targetId === self.id);
  let verb = null;
  if (!already && target && Math.hypot(target.pos.x - self.pos.x, target.pos.z - self.pos.z) < 230) {
    verb = { kind: 'latch', targetRole: target === prize ? 'prize' : 'opponent', restScale: 1, maxRange: 240, ownerRole: 'player' };
  }
  const maneuver = target
    ? steerToward(self, target.pos, { boost: true, arrive: 40, boostDist: 100 })
    : boosterPilot(ctx);
  if (maneuver.moveZ != null) return maneuver;
  return toInput(self, maneuver, { verb });
}

function evasivePilot(ctx) {
  const self = ctx.player;
  const target = actor(ctx, 'opponent');
  const angle = ctx.tick * 0.035 + (ctx.scene.seed % 7) * 0.2;
  const origin = target ? target.pos : { x: 0, z: 0 };
  const point = {
    x: origin.x + Math.cos(angle) * 180,
    z: origin.z + Math.sin(angle) * 180,
  };
  return toInput(self, steerToward(self, point, { arrive: 40, boost: false }));
}

function protectorPilot(ctx) {
  const self = ctx.player;
  const civilian = actor(ctx, 'civilian') || actor(ctx, 'patient');
  const threat = actor(ctx, 'opponent');
  if (!civilian || !threat) return evasivePilot(ctx);
  return toInput(self, steerToward(self, hideBehind(civilian.pos, threat.pos, 74), {
    arrive: 16,
    brakeDist: 20,
    brakeSpeed: 6,
  }));
}

function counterIntent(ctx) {
  const id = ctx.scene.doctrineId;
  const self = ctx.player;
  const cue = published(ctx);
  if (id === 'cp_heavy_anchor_grappler') {
    const verb = cue && (cue.phase === 'spool' || cue.phase === 'swing')
      ? { kind: 'cut', tetherRole: 'anchor' }
      : null;
    return toInput(self, steerToward(self, posOf(actor(ctx, 'opponent')), { arrive: 80 }), { verb });
  }
  if (id === 'cp_feint_break_courier') {
    const gate = ctx.scene.objective && ctx.scene.objective.gate;
    return toInput(self, gate ? steerToward(self, gate, { arrive: 20, brakeDist: 30 }) : holdManeuver(self));
  }
  if (id === 'cp_corridor_pack_leader') {
    const lane = ctx.scene.objective && ctx.scene.objective.lane;
    return toInput(self, lane ? steerToward(self, lane, { arrive: 10, brakeDist: 14, brakeSpeed: 3, boost: false }) : holdManeuver(self));
  }
  if (id === 'cp_rescue_tow') {
    const verb = cue && (cue.phase === 'spool' || cue.phase === 'tow')
      ? { kind: 'cut', tetherRole: 'patient' }
      : null;
    return toInput(self, steerToward(self, posOf(actor(ctx, 'opponent')), { arrive: 70 }), { verb });
  }
  if (id === 'cp_prize_runner') {
    const prize = actor(ctx, 'prize');
    const verb = { kind: 'cut', tetherRole: 'prize' };
    return toInput(self, prize
      ? steerToward(self, prize.pos, { boost: true, arrive: 8, boostDist: 20 })
      : holdManeuver(self), { verb });
  }
  if (id === 'cp_release_orbit_hunter') {
    const verb = cue && cue.phase === 'station' ? { kind: 'cut', tetherRole: 'orbit' } : null;
    return toInput(self, steerToward(self, posOf(actor(ctx, 'opponent')), { arrive: 100 }), { verb });
  }
  if (id === 'cp_tether_bait_decoy') {
    return boosterPilot(ctx);
  }
  if (id === 'cp_collateral_hold') {
    const civilian = actor(ctx, 'civilian');
    const threat = actor(ctx, 'opponent');
    if (!civilian || !threat) return holdInput(self);
    return toInput(self, steerToward(self, hideBehind(civilian.pos, threat.pos, 64), {
      arrive: 10,
      brakeDist: 14,
      brakeSpeed: 4,
    }));
  }
  if (id === 'cp_cover_peel') {
    const rock = actor(ctx, 'cover');
    const threat = actor(ctx, 'opponent');
    const peel = cue && cue.cue && cue.cue.peel;
    const away = peel || (threat && threat.pos);
    if (!rock || !away) return holdInput(self);
    return toInput(self, steerToward(self, hideBehind(rock.pos, away, 52), {
      arrive: 8,
      brakeDist: 12,
      brakeSpeed: 3,
    }));
  }
  const mechanic = actor(ctx, 'opponent');
  return toInput(self, steerToward(self, mechanic ? mechanic.pos : { x: 0, z: 0 }, {
    boost: true,
    arrive: 18,
    boostDist: 40,
  }), {
    fire: true,
    aimAngle: aimAt(self, mechanic),
  });
}

function holdInput(self) {
  return toInput(self, holdManeuver(self));
}

function hideBehind(blocker, threat, distance) {
  const dx = blocker.x - threat.x;
  const dz = blocker.z - threat.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: blocker.x + (dx / len) * distance, z: blocker.z + (dz / len) * distance };
}

export function idleManeuver(role, tethered) {
  if (role === 'orbit_body') {
    return { targetHeading: 0, forward: 0, right: 0, torqueYaw: 0, brake: false, boost: false };
  }
  if (role === 'patient' && tethered) {
    return { targetHeading: 0, forward: 0, right: 0, torqueYaw: 0, brake: false, boost: false };
  }
  return { targetHeading: 0, forward: 0, right: 0, torqueYaw: 0, brake: true, boost: false };
}
