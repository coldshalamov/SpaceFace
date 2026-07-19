// Impulse charges system (GDD §4.4 "blast plates", BUILD_PLAN WS-D2 / GROK-1).
//
// Sticky radial impulse bombs: lob from the player nose, adhere to hulls/asteroids, detonate on R.
// armTimeS is the throw cooldown — charges arm instantly on stick. Friendly-fire on.
//
// Input contract (read-only): state.input.actions.chargeThrow / chargeDetonate (edge bools).
// Cargo: one cmdty_impulse_charge consumed per throw via removeCargo (src/systems/cargo.js).
// Impulse: routed through the physics authority's applyImpulse (helpers.combatPhysics, same port
// as combat/actions.js + combat/damage.js) — never a direct entity.vel write (ARCHITECTURE §3:
// under rapier-dynamic the backend owns body state; direct mutation desyncs the rigid body).
// Damage via combat routeDamage / scalarHitToDamagePacket.
import { IMPULSE_CHARGES, MASSLINE_COMBOS } from '../data/impulseCharges.js';
import { removeCargo } from './cargo.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { massline2Flag } from '../data/featureFlags.js';
import { MODULES } from '../data/modules.js';

const CHARGE_COMMODITY = 'cmdty_impulse_charge';
const STICK_TYPES = new Set(['ship', 'drone', 'asteroid']);
const BLAST_DAMAGE_TYPES = new Set(['ship', 'station', 'drone']);
const CHARGE_BY_ID = new Map(Object.entries(IMPULSE_CHARGES));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

// M3 bomb-propulsion dials. Brake/reverse + the existing throw verb drops an already-armed plate
// aft at a safe but still damaging standoff; R remains the deliberate detonation verb.
export const BOMB_PROPULSION_DIALS = Object.freeze({
  standoffRadii: 2.25,
  minStandoff: 13,
  // A fixed-radius blast cannot reach the center of capital hulls. Preserve the authored 2.25R
  // placement on small ships, but cap the clear gap behind the hull to half the blast radius.
  maxSurfaceGapRadiusFrac: 0.5,
  relativeDropSpeed: 0,
  selfImpulseMult: 4.5,
  referenceSelfImpulseMin: 2200,
});

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

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  let value = Number.isFinite(angle) ? angle : 0;
  value = ((value + Math.PI) % tau + tau) % tau - Math.PI;
  return value;
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

/** True only for a researched, fitted vector rack. The original charge rack/system stays live. */
export function bombPropulsionAvailable(state) {
  if (!massline2Flag('bombPropulsion')) return false;
  const p = state && state.player;
  const ship = p && Array.isArray(p.ownedShips) ? p.ownedShips[p.activeShipIndex] : null;
  const fittings = ship && Array.isArray(ship.fittings) ? ship.fittings : [];
  const researched = new Set(p && p.researchedNodes || []);
  return fittings.some((id) => {
    const def = MODULE_BY_ID.get(id);
    return !!(def && def.mods && def.mods.bombPropulsion
      && (!def.requiresTech || researched.has(def.requiresTech)));
  });
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
        if (!Number.isFinite(d.localRot)) {
          // Backward-compatible recovery for charges restored from saves written before sticky pose
          // tracked orientation. Preserve the visible pose on the first tick, then follow the host.
          d.localRot = normalizeAngle((e.rot || 0) - (host.rot || 0));
        }
        e.rot = normalizeAngle((host.rot || 0) + d.localRot);
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
    d.localRot = normalizeAngle((charge.rot || 0) - (best.rot || 0));
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

    const aftDrop = bombPropulsionAvailable(state)
      && !!(actions.brake || state.input.brake || Number(state.input.moveZ) < -0.5);
    const dir = aftDrop ? (player.rot || 0) + Math.PI : aimDir(player, state);
    const cf = Math.cos(dir), sf = Math.sin(dir);
    const noseR = player.radius || 6;
    const spawnDistance = aftDrop
      ? Math.max(
        BOMB_PROPULSION_DIALS.minStandoff,
        noseR + Math.min(
          noseR * (BOMB_PROPULSION_DIALS.standoffRadii - 1),
          def.radius * BOMB_PROPULSION_DIALS.maxSurfaceGapRadiusFrac,
        ),
      )
      : noseR;
    const throwSpeed = aftDrop ? BOMB_PROPULSION_DIALS.relativeDropSpeed : def.throwSpeed;

    const active = activeCharges(state, player.id);
    while (active.length >= def.maxActive) {
      const oldest = active.shift();
      if (oldest) oldest.alive = false;
    }

    const charge = this.helpers.spawnEntity({
      type: 'charge',
      pos: { x: player.pos.x + cf * spawnDistance, z: player.pos.z + sf * spawnDistance },
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
        localRot: null,
        armed: aftDrop,
        aftDrop,
        propulsionImpulseMult: aftDrop ? BOMB_PROPULSION_DIALS.selfImpulseMult : 1,
        spawnedAt: state.simTime,
        spawnPos: { x: player.pos.x + cf * spawnDistance, z: player.pos.z + sf * spawnDistance },
      },
    });

    rt.throwCdT = def.armTimeS;
    this.bus.emit('charge:thrown', { chargeId: charge.id, ownerId: player.id, pos: { x: charge.pos.x, z: charge.pos.z } });
    if (aftDrop) {
      const root = state.massline2 || (state.massline2 = {});
      root.bombPropulsion = { lastDropTick: state.tick, chargeId: charge.id, standoff: spawnDistance };
      this.bus.emit('charge:aftDropped', {
        chargeId: charge.id, ownerId: player.id, pos: { x: charge.pos.x, z: charge.pos.z },
        standoff: spawnDistance,
      });
      this.bus.emit('audio:cue', { id: 'massline.bombDrop', position: { x: charge.pos.x, z: charge.pos.z } });
    }
  },

  _handleDetonate(player, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.chargeDetonate) return;
    actions.chargeDetonate = false;

    let detonated = 0;
    for (const charge of state.entityList) {
      if (!charge.alive || charge.type !== 'charge') continue;
      const d = charge.data;
      if (!d || !d.armed) continue;
      this._detonateOne(charge, d, player.id, state);
      detonated += 1;
    }

    // Rung 16 — tailPop: cut + detonate on the same tick while tethered is the escape move. We
    // only READ actions.tetherCut (tetherGameplay runs after us in UPDATE_ORDER and performs the
    // actual cut from the same press); the burst is a backward player impulse along the line,
    // away from the anchor, through the physics authority like every other impulse here.
    if (detonated > 0 && actions.tetherCut) {
      const tether = state.player && state.player.tether;
      if (tether && tether.active && tether.targetId != null) {
        const anchor = state.entities.get(tether.targetId);
        let dirX, dirZ;
        if (anchor && anchor.pos) {
          const dx = player.pos.x - anchor.pos.x, dz = player.pos.z - anchor.pos.z;
          const len = Math.hypot(dx, dz);
          if (len > 1e-4) { dirX = dx / len; dirZ = dz / len; }
        }
        if (dirX == null) { // anchor gone this tick: burst straight astern instead
          dirX = -Math.cos(player.rot || 0);
          dirZ = -Math.sin(player.rot || 0);
        }
        const magnitude = MASSLINE_COMBOS.tailPop.impulse;
        this._applyBlastImpulse(player, dirX * magnitude, dirZ * magnitude, state);
        this.bus.emit('charge:combo', {
          combo: 'tailPop',
          ownerId: player.id,
          targetId: tether.targetId,
          impulse: magnitude,
        });
      }
    }
  },

  // Rung 16 — per-charge combo detection at detonation time. Reads the massline mirrors
  // observer-style (state.player.tether from tetherGameplay, state.player.masslineTelemetry from
  // masslineTelemetry) — never mutates them. Player charges only: the massline is the player's.
  // anchorKick outranks slingBomb for the same charge (the channeled kick IS the amplified form).
  _detectCombo(d, ownerId, state) {
    if (ownerId !== state.playerId) return null;
    const playerState = state.player;
    const tether = playerState && playerState.tether;
    if (tether && tether.active && tether.targetId != null && d.hostId === tether.targetId) {
      return { combo: 'anchorKick', anchorId: tether.targetId, def: MASSLINE_COMBOS.anchorKick };
    }
    const telemetry = playerState && playerState.masslineTelemetry;
    if (telemetry && telemetry.active
      && Math.abs(telemetry.tangentialSpeed) >= MASSLINE_COMBOS.slingBomb.minTangentialSpeed) {
      return { combo: 'slingBomb', anchorId: null, def: MASSLINE_COMBOS.slingBomb };
    }
    return null;
  },

  _detonateOne(charge, d, ownerId, state) {
    const def = chargeDef(d.chargeId);
    const pos = { x: charge.pos.x, z: charge.pos.z };
    const hits = [];

    // Rung 16 — massline combo for THIS charge. slingBomb amplifies the whole blast; anchorKick
    // channels the anchor's share of it along the tether line instead of the radial direction.
    const combo = this._detectCombo(d, ownerId, state);
    const impulseMult = combo && combo.combo === 'slingBomb' ? combo.def.impulseMult : 1;
    const damageMult = combo && combo.combo === 'slingBomb' ? combo.def.damageMult : 1;
    const player = state.entities.get(state.playerId);

    // Aft plates are outside the owner's hull. Spatial hashes index centers, so enlarge this one
    // query by the owner radius and use surface distance for the owner below. Other blast victims
    // retain the established center-distance falloff and therefore cannot gain accidental range.
    const blastQueryRadius = def.radius + (d.aftDrop && player ? (player.radius || 0) : 0);
    const candidates = stickCandidatesNear(state, pos, blastQueryRadius, this._blastScratch);
    for (const ent of candidates) {
      if (!ent.alive || ent.id === charge.id) continue;
      const dx = ent.pos.x - pos.x, dz = ent.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const propulsionOwner = !!(d.aftDrop && ent.id === ownerId);
      const falloffDist = propulsionOwner ? Math.max(0, dist - (ent.radius || 0)) : dist;
      if (falloffDist > def.radius) continue;

      const falloff = linearFalloff(falloffDist, def.radius);
      if (falloff <= 0) continue;

      let dirX = 0, dirZ = 1;
      if (dist > 1e-4) {
        dirX = dx / dist;
        dirZ = dz / dist;
      }
      let magnitude = def.impulse * falloff * impulseMult;
      if (propulsionOwner) {
        magnitude *= Math.max(1, Number(d.propulsionImpulseMult) || 1);
      }
      // anchorKick: the line channels the anchor's blast share — direction becomes the tether
      // line (player → anchor), amplified. Everything else in the radius still gets the radial.
      if (combo && combo.combo === 'anchorKick' && ent.id === combo.anchorId && player && player.pos) {
        const lx = ent.pos.x - player.pos.x, lz = ent.pos.z - player.pos.z;
        const len = Math.hypot(lx, lz);
        if (len > 1e-4) {
          dirX = lx / len;
          dirZ = lz / len;
          magnitude = def.impulse * falloff * combo.def.impulseMult;
        }
      }
      // Rung 15: the blast is an impulse REQUEST to the physics authority, applied at the center
      // of mass. Magnitude def.impulse × falloff is the old per-entity Δv × mass — same physics,
      // different owner of the mutation. A rejected request (no rigid body / no port) is skipped,
      // never forced with a direct vel write.
      this._applyBlastImpulse(ent, dirX * magnitude, dirZ * magnitude, state);
      hits.push(ent.id);

      if (BLAST_DAMAGE_TYPES.has(ent.type) && def.damage > 0) {
        const packet = scalarHitToDamagePacket({
          damage: def.damage * falloff * damageMult,
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
    if (combo) {
      this.bus.emit('charge:combo', {
        combo: combo.combo,
        chargeId: charge.id,
        ownerId,
        anchorId: combo.anchorId,
        pos,
      });
    }
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

  // Physics-authority impulse (rung 15). Same port + call shape as combat/actions.js:185 and
  // combat/damage.js:201: helpers.combatPhysics.applyImpulse({entityId, impulse, point, reason,
  // tick}). Returns true only if the backend accepted the impulse.
  _applyBlastImpulse(ent, impulseX, impulseZ, state) {
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return false;
    const accepted = physics.applyImpulse({
      entityId: ent.id,
      impulse: { x: impulseX, z: impulseZ },
      point: null,
      reason: 'impulse_charge',
      tick: state.tick,
    });
    return accepted !== false;
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
