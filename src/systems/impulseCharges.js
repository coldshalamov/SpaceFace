// Impulse charges system (GDD §4.4 "blast plates", BUILD_PLAN WS-D2 / GROK-1).
//
// Sticky radial impulse bombs: lob from the player nose, adhere to hulls/asteroids, detonate on F.
// armTimeS is the throw cooldown — charges arm instantly on stick. Friendly-fire on.
//
// Input contract (read-only): state.input.actions.chargeThrow / chargeDetonate (edge bools).
// Cargo: one cmdty_impulse_charge consumed per throw via removeCargo (src/systems/cargo.js).
// Impulse: direct Δv on entity.vel (vx/vz); damage via combat routeDamage / scalarHitToDamagePacket.
import { IMPULSE_CHARGES } from '../data/impulseCharges.js';
import { removeCargo } from './cargo.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

const CHARGE_COMMODITY = 'cmdty_impulse_charge';
const STICK_TYPES = new Set(['ship', 'drone', 'asteroid']);
const BLAST_DAMAGE_TYPES = new Set(['ship', 'station', 'drone']);
const CHARGE_BY_ID = new Map(Object.entries(IMPULSE_CHARGES));

function chargeDef(id) {
  return CHARGE_BY_ID.get(id) || CHARGE_BY_ID.get('charge_standard');
}

function ensurePlayerRuntime(player) {
  const d = player.data || (player.data = {});
  if (!d.impulseCharges) d.impulseCharges = { throwCdT: 0 };
  return d.impulseCharges;
}

function aimDir(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw) {
    const dx = aw.x - player.pos.x, dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return Math.atan2(dz, dx);
  }
  const inp = state.input;
  return (inp && inp.aimAngle != null) ? inp.aimAngle : (player.rot || 0);
}

function linearFalloff(dist, radius) {
  if (!(radius > 0)) return 0;
  return Math.max(0, 1 - dist / radius);
}

function worldOffset(host, local) {
  const cos = Math.cos(host.rot || 0), sin = Math.sin(host.rot || 0);
  return {
    x: host.pos.x + local.x * cos - local.z * sin,
    z: host.pos.z + local.x * sin + local.z * cos,
  };
}

function toLocalOffset(host, wx, wz) {
  const dx = wx - host.pos.x, dz = wz - host.pos.z;
  const cos = Math.cos(-(host.rot || 0)), sin = Math.sin(-(host.rot || 0));
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

function activeCharges(state, ownerId) {
  const out = [];
  for (const e of state.entityList) {
    if (!e.alive || e.type !== 'charge') continue;
    const d = e.data;
    if (!d || d.ownerId !== ownerId) continue;
    out.push(e);
  }
  out.sort((a, b) => (a.data.spawnedAt || 0) - (b.data.spawnedAt || 0));
  return out;
}

function stickCandidatesNear(state, pos, radius, out) {
  return queryNearbyEntities(state, pos, radius, out, state.entityList);
}

export const impulseCharges = {
  name: 'impulseCharges',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._stickScratch = [];
    this._blastScratch = [];
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    const rt = ensurePlayerRuntime(player);
    if (rt.throwCdT > 0) rt.throwCdT = Math.max(0, rt.throwCdT - dt);

    this._tickCharges(dt, state);
    this._handleThrow(player, rt, state);
    this._handleDetonate(player, state);
  },

  _tickCharges(dt, state) {
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'charge') continue;
      const d = e.data;
      if (!d) continue;

      if (d.hostId != null) {
        const host = state.entities.get(d.hostId);
        if (!host || !host.alive) {
          e.alive = false;
          continue;
        }
        const w = worldOffset(host, d.localOffset || { x: 0, z: 0 });
        e.pos.x = w.x;
        e.pos.z = w.z;
        e.vel.x = host.vel.x;
        e.vel.z = host.vel.z;
        d.armed = true;
        continue;
      }

      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      this._tryStick(e, d, state);
    }
  },

  _tryStick(charge, d, state) {
    const def = chargeDef(d.chargeId);
    const r = def.stickRadius;
    const candidates = stickCandidatesNear(state, charge.pos, r + (charge.radius || 1), this._stickScratch);
    let best = null, bestDist = Infinity;
    for (const host of candidates) {
      if (!host.alive || host.id === charge.id) continue;
      if (!STICK_TYPES.has(host.type)) continue;
      const dx = charge.pos.x - host.pos.x, dz = charge.pos.z - host.pos.z;
      // Nose-launched charges spawn on the owner's hull — brief owner-stick lockout so the lob
      // clears the thrower; rear-plate self-stick still works once the charge returns aft.
      if (host.id === d.ownerId && state.simTime - (d.spawnedAt || 0) < 0.35) continue;
      const surface = (host.radius || 6) + (charge.radius || 1);
      const dist = Math.hypot(dx, dz);
      if (dist > surface + r) continue;
      if (dist < bestDist) { bestDist = dist; best = host; }
    }
    if (!best) return;

    d.hostId = best.id;
    d.localOffset = toLocalOffset(best, charge.pos.x, charge.pos.z);
    d.armed = true;
    charge.vel.x = best.vel.x;
    charge.vel.z = best.vel.z;
    const w = worldOffset(best, d.localOffset);
    charge.pos.x = w.x;
    charge.pos.z = w.z;
    this.bus.emit('charge:stuck', { chargeId: charge.id, hostId: best.id, pos: { x: w.x, z: w.z } });
  },

  _handleThrow(player, rt, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.chargeThrow) return;
    actions.chargeThrow = false;

    if (rt.throwCdT > 0) return;
    if (player.flags && player.flags.docked) return;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return;

    const def = chargeDef('charge_standard');
    const consumed = removeCargo(state, CHARGE_COMMODITY, 1);
    if (consumed <= 0) {
      this.bus.emit('toast', { text: 'No impulse charges in cargo', kind: 'error', ttl: 2 });
      return;
    }

    const dir = aimDir(player, state);
    const cf = Math.cos(dir), sf = Math.sin(dir);
    const noseR = player.radius || 6;
    const throwSpeed = def.throwSpeed;

    const active = activeCharges(state, player.id);
    while (active.length >= def.maxActive) {
      const oldest = active.shift();
      if (oldest) oldest.alive = false;
    }

    const charge = this.helpers.spawnEntity({
      type: 'charge',
      pos: { x: player.pos.x + cf * noseR, z: player.pos.z + sf * noseR },
      vel: {
        x: cf * throwSpeed + player.vel.x,
        z: sf * throwSpeed + player.vel.z,
      },
      rot: dir,
      radius: 1.2,
      mass: 0.5,
      collides: false,
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'impulse_charge',
        chargeId: 'charge_standard',
        ownerId: player.id,
        hostId: null,
        localOffset: null,
        armed: false,
        spawnedAt: state.simTime,
        spawnPos: { x: player.pos.x + cf * noseR, z: player.pos.z + sf * noseR },
      },
    });

    rt.throwCdT = def.armTimeS;
    this.bus.emit('charge:thrown', { chargeId: charge.id, ownerId: player.id, pos: { x: charge.pos.x, z: charge.pos.z } });
  },

  _handleDetonate(player, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.chargeDetonate) return;
    actions.chargeDetonate = false;

    for (const charge of state.entityList) {
      if (!charge.alive || charge.type !== 'charge') continue;
      const d = charge.data;
      if (!d || !d.armed) continue;
      this._detonateOne(charge, d, player.id, state);
    }
  },

  _detonateOne(charge, d, ownerId, state) {
    const def = chargeDef(d.chargeId);
    const pos = { x: charge.pos.x, z: charge.pos.z };
    const hits = [];

    const candidates = stickCandidatesNear(state, pos, def.radius, this._blastScratch);
    for (const ent of candidates) {
      if (!ent.alive || ent.id === charge.id) continue;
      const dx = ent.pos.x - pos.x, dz = ent.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > def.radius) continue;

      const falloff = linearFalloff(dist, def.radius);
      if (falloff <= 0) continue;

      const mass = Math.max(0.1, ent.mass || 1);
      const dv = def.impulse * falloff / mass;
      let dirX = 0, dirZ = 1;
      if (dist > 1e-4) {
        dirX = dx / dist;
        dirZ = dz / dist;
      }
      ent.vel.x += dirX * dv;
      ent.vel.z += dirZ * dv;
      hits.push(ent.id);

      if (BLAST_DAMAGE_TYPES.has(ent.type) && def.damage > 0) {
        const packet = scalarHitToDamagePacket({
          damage: def.damage * falloff,
          damageType: 'explosive',
          pos,
          source: { kind: 'impulse_charge', chargeId: d.chargeId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        this._routeDamage({
          attackerId: ownerId,
          targetId: ent.id,
          packet,
          origin: { kind: 'impulse_charge', id: charge.id },
        });
      }
    }

    charge.alive = false;
    this.bus.emit('charge:detonated', { pos, hits });
    this.bus.emit('presentation:vfxCue', {
      id: 'combat.explosion.small',
      lane: 'combat',
      particles: 36,
      lights: 2,
      magnitude: Math.max(0.5, def.radius / 42),
      position: pos,
      material: 'explosive',
      sourceId: ownerId,
      targetId: null,
      flashReduced: false,
    });
    this.bus.emit('audio:cue', { id: 'sfx_explosion_small', position: pos, gain: 0.65 });
  },

  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') {
      return helpers.routeCombatDamage(request);
    }
    const combatSys = this.registry && this.registry.get && this.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') {
      return combatSys.ensureKernel().routeDamage(request);
    }
    this.bus.emit('combat:routeDamage', request);
    return null;
  },
};