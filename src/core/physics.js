// Physics system: integrate positions, rebuild the spatial hash, broad-phase + circle/circle
// collision with response, swept projectile tests. Runs as steps 5-7 of the sim spine (§2.3).
// Velocity is updated by flight (thrust/drag); physics integrates position from velocity.
import { Masks } from './entity.js';

const DEFAULT_MATERIAL = Object.freeze({
  push: 1,
  restitution: 0.18,
  tangentDamping: 0.04,
  impactScale: 1,
});

const COLLISION_MATERIALS = Object.freeze({
  ship: DEFAULT_MATERIAL,
  drone: { push: 0.9, restitution: 0.16, tangentDamping: 0.06, impactScale: 0.7 },
  asteroid: { push: 1, restitution: 0.24, tangentDamping: 0.08, impactScale: 1.1 },
  station: { push: 0.48, restitution: 0.05, tangentDamping: 0.35, impactScale: 0.35 },
});

export const physics = {
  name: 'physics',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._scratch = [];
    this._statics = [];
    this._checked = new Set(); // reused each collide() to avoid a per-frame Set allocation
    this._dockStationId = null;
    this._gateEntityId = null;
    this._rapier = null;
    this._rapierInit = null;
    this._rapierToken = 0;
    this._diag = {
      backend: 'custom',
      rapierReady: false,
      bodies: 0,
      colliders: 0,
      ccdBodies: 0,
      rapierContacts: 0,
      rapierEvents: 0,
      sweptShipContacts: 0,
      sweptProjectileHits: 0,
      tickMs: 0,
    };
  },

  update(dt, state) {
    const t0 = nowMs();
    this._diag.sweptShipContacts = 0;
    this._diag.sweptProjectileHits = 0;
    this.integrate(dt, state);
    if (state.spatialHash) state.spatialHash.rebuild(state.entityList);
    this.sweepShipStatics(dt, state);
    this.sweepProjectiles(dt, state);
    if (state.spatialHash && this._diag.sweptShipContacts > 0) state.spatialHash.rebuild(state.entityList);
    this.collide(dt, state);
    this._syncOptionalBackend(dt, state);
    this.updateDockRange(state);
    this._diag.tickMs = Math.max(0, nowMs() - t0);
    state.physicsRuntime = state.physicsRuntime || {};
    state.physicsRuntime.diagnostics = this._diag;
  },

  integrate(dt, state) {
    const b = state.bounds;
    for (const e of state.entityList) {
      if (!e.alive) continue;
      // sector soft boundary: gentle inward acceleration past the soft radius
      if (e.type === 'ship' && b) {
        const dx = e.pos.x - b.center.x, dz = e.pos.z - b.center.z;
        const d = Math.hypot(dx, dz);
        if (d > b.radius) {
          const over = (d - b.radius) / Math.max(1, b.hardRadius - b.radius);
          const k = 60 * Math.min(1, over);
          e.vel.x -= (dx / d) * k * dt;
          e.vel.z -= (dz / d) * k * dt;
        }
      }
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      // NOTE: e.rot is NOT integrated here. Rotation (yaw + bank) is fully owned by flight.js
      // (Phase 1 fix: the old `e.rot += e.angVel*dt` here double-applied rotation, since flight
      // already advanced e.rot). Projectiles set their own rot in weapons/spawn; flight sets ships'.
    }
  },

  collide(dt, state) {
    const bus = this.bus;
    const out = this._scratch;
    const checked = this._checked; checked.clear(); // pair keys this step (reused; no per-frame alloc)
    for (const a of state.entityList) {
      if (!a.alive || !a.collides) continue;
      out.length = 0;
      state.spatialHash.queryRadius(a.pos.x, a.pos.z, a.radius + 4, out);
      for (const bEnt of out) {
        if (!a.alive) break;
        if (bEnt === a || !bEnt.alive || !bEnt.collides) continue;
        if (!(a.collisionMask & maskOf(bEnt)) && !(bEnt.collisionMask & maskOf(a))) continue;
        const key = pairKey(a.id, bEnt.id);
        if (checked.has(key)) continue;
        checked.add(key);
        if (!a.alive || !bEnt.alive) continue;
        const dx = bEnt.pos.x - a.pos.x, dz = bEnt.pos.z - a.pos.z;
        const rsum = a.radius + bEnt.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > rsum * rsum) continue;
        this.resolvePair(a, bEnt, Math.sqrt(d2) || 0.0001, dx, dz, bus, state);
      }
    }
  },

  sweepShipStatics(dt, state) {
    const out = this._scratch;
    const useHash = !!(state.spatialHash && typeof state.spatialHash.queryRadius === 'function');
    const statics = this._statics;
    if (!useHash) {
      statics.length = 0;
      for (const e of state.entityList) {
        if (e.alive && e.collides && (e.type === 'asteroid' || e.type === 'station')) statics.push(e);
      }
      if (!statics.length) return;
    }
    for (const ship of state.entityList) {
      if (!ship.alive || !ship.collides || (ship.type !== 'ship' && ship.type !== 'drone')) continue;
      const start = previousPos(ship, dt);
      const end = ship.pos;
      let candidates = statics;
      if (useHash) {
        const sweepRadius = Math.hypot(end.x - start.x, end.z - start.z) * 0.5 + (ship.radius || 0);
        out.length = 0;
        state.spatialHash.queryRadius((start.x + end.x) * 0.5, (start.z + end.z) * 0.5, sweepRadius, out);
        candidates = out;
      }
      let best = null;
      for (const target of candidates) {
        if (!target.alive || !target.collides || (target.type !== 'asteroid' && target.type !== 'station')) continue;
        if (target === ship || (!canCollide(ship, target) && !canCollide(target, ship))) continue;
        const hit = segmentCircleHit(start, end, target.pos, (ship.radius || 0) + (target.radius || 0));
        if (!hit.hit) continue;
        if (!best || hit.t < best.hit.t) best = { target, hit };
      }
      if (!best) continue;
      const nx = best.hit.nx, nz = best.hit.nz;
      const skin = 0.01;
      ship.pos.x = best.hit.x + nx * skin;
      ship.pos.z = best.hit.z + nz * skin;
      applySurfaceResponse(ship, nx, nz, materialFor(best.target));
      this._diag.sweptShipContacts++;
    }
  },

  sweepProjectiles(dt, state) {
    const out = this._scratch;
    const useHash = !!(state.spatialHash && typeof state.spatialHash.queryRadius === 'function');
    for (const proj of state.entityList) {
      if (!proj.alive || proj.type !== 'projectile' || !proj.collides) continue;
      const start = previousPos(proj, dt);
      const end = proj.pos;
      let candidates = state.entityList;
      if (useHash) {
        const sweepRadius = Math.hypot(end.x - start.x, end.z - start.z) * 0.5 + (proj.radius || 0);
        out.length = 0;
        state.spatialHash.queryRadius((start.x + end.x) * 0.5, (start.z + end.z) * 0.5, sweepRadius, out);
        candidates = out;
      }
      let best = null;
      for (const tgt of candidates) {
        if (!tgt.alive || tgt === proj || !tgt.collides || tgt.type === 'projectile') continue;
        if (proj.ownerId === tgt.id) continue;
        if (!canCollide(proj, tgt) && !canCollide(tgt, proj)) continue;
        const hit = segmentCircleHit(start, end, tgt.pos, (proj.radius || 0) + (tgt.radius || 0));
        if (!hit.hit) continue;
        if (!best || hit.t < best.hit.t) best = { target: tgt, hit };
      }
      if (!best) continue;
      const pd = proj.data || {};
      proj.pos.x = best.hit.x;
      proj.pos.z = best.hit.z;
      this.bus.emit('projectile:hit', {
        targetId: best.target.id,
        ownerId: proj.ownerId,
        damage: pd.damage || 0,
        damageType: pd.damageType || 'kinetic',
        pos: { x: proj.pos.x, z: proj.pos.z },
      });
      proj.alive = false;
      this._diag.sweptProjectileHits++;
    }
  },

  resolvePair(a, b, dist, dx, dz, bus, state) {
    const ta = a.type, tb = b.type;
    // projectile hits
    if (ta === 'projectile' || tb === 'projectile') {
      const proj = ta === 'projectile' ? a : b;
      const tgt = ta === 'projectile' ? b : a;
      if (tgt.type === 'projectile') return;
      if (proj.ownerId === tgt.id) return; // never hit owner
      const pd = proj.data || {};
      bus.emit('projectile:hit', {
        targetId: tgt.id, ownerId: proj.ownerId, damage: pd.damage || 0,
        damageType: pd.damageType || 'kinetic', pos: { x: proj.pos.x, z: proj.pos.z },
      });
      proj.alive = false;
      return;
    }
    // pickups
    if (ta === 'pickup' || tb === 'pickup') {
      const pk = ta === 'pickup' ? a : b;
      const col = ta === 'pickup' ? b : a;
      if (col.type !== 'ship' && col.type !== 'drone') return;
      const d = pk.data || {};
      bus.emit('pickup:collected', { pickupId: pk.id, collectorId: col.id, kind: d.kind, amount: d.amount, commodityId: d.commodityId, pos: { x: pk.pos.x, z: pk.pos.z } });
      pk.alive = false;
      return;
    }
    // station hull contact — soft, no physical push. Dock-range enter/exit is tracked once per
    // frame in updateDockRange() so the UI receives both true and false transitions.
    if (ta === 'station' || tb === 'station') {
      // soft bounce off station hull
      const material = pairMaterial(a, b);
      pushApart(a, b, dist, dx, dz, material.push);
      impulse(a, b, dx / dist, dz / dist, material);
      return;
    }
    // ship/ship and ship/asteroid: separate + restitution impulse
    const material = pairMaterial(a, b);
    pushApart(a, b, dist, dx, dz, material.push);
    const impulseMag = impulse(a, b, dx / dist, dz / dist, material);
    bus.emit('collision', {
      aId: a.id,
      bId: b.id,
      impulse: Math.max(0.1, impulseMag * material.impactScale * 0.01),
      pos: { x: a.pos.x, z: a.pos.z },
    });
  },

  updateDockRange(state) {
    const player = state.entities.get(state.playerId);
    let nextStationId = null;
    let nextDist = Infinity;
    let nextGate = null;
    let nextGateDist = Infinity;

    if (player && player.alive) {
      for (const st of state.entityList) {
        if (!st.alive || st.type !== 'station') continue;
        const data = st.data || {};
        const range = ((data.dockRadius || st.radius || 80) + (player.radius || 0));
        const d = Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z);
        if (data.isGate) {
          if (d <= range + 28 && d < nextGateDist) {
            nextGateDist = d;
            nextGate = st;
          }
          continue;
        }
        if (!data.stationId) continue;
        if (d <= range && d < nextDist) {
          nextDist = d;
          nextStationId = data.stationId;
        }
      }
    }

    if (nextStationId !== this._dockStationId) {
      if (this._dockStationId) {
        this.bus.emit('dock:range', { stationId: this._dockStationId, shipId: state.playerId, inRange: false });
      }
      this._dockStationId = nextStationId;
      if (nextStationId) {
        this.bus.emit('dock:range', { stationId: nextStationId, shipId: state.playerId, inRange: true });
      }
    }

    const nextGateId = nextGate ? nextGate.id : null;
    if (nextGateId !== this._gateEntityId) {
      if (this._gateEntityId) this.bus.emit('gate:range', { gateId: this._gateEntityId, shipId: state.playerId, inRange: false });
      this._gateEntityId = nextGateId;
      if (nextGate) {
        const data = nextGate.data || {};
        this.bus.emit('gate:range', {
          gateId: nextGate.id,
          shipId: state.playerId,
          inRange: true,
          gateTo: data.gateTo || null,
          name: data.name || 'Jump Gate',
        });
      }
    }
  },

  _syncOptionalBackend(dt, state) {
    const backend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
    this._diag.backend = backend === 'rapier' ? 'rapier' : 'custom';
    if (backend !== 'rapier') {
      this._disableRapierBackend();
      return;
    }
    if (!this._rapierInit) {
      const token = ++this._rapierToken;
      this._rapierInit = import('./rapierCollisionWorld.js')
        .then((m) => m.createRapierCollisionWorld())
        .then((backendWorld) => {
          const currentBackend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
          if (token !== this._rapierToken || currentBackend !== 'rapier') {
            if (backendWorld && typeof backendWorld.dispose === 'function') backendWorld.dispose();
            return null;
          }
          this._rapier = backendWorld;
          return backendWorld;
        })
        .catch((err) => {
          if (token === this._rapierToken) {
            console.warn('[physics] Rapier backend failed; falling back to custom collision', err);
            this._rapier = null;
            this._rapierInit = null;
            this._diag.backend = 'custom';
          }
          return null;
        });
    }
    if (!this._rapier) return;
    this._rapier.syncFromEntities(state.entityList);
    this._rapier.step(dt);
    const rdiag = this._rapier.diagnostics();
    this._diag.rapierReady = true;
    this._diag.bodies = rdiag.bodies;
    this._diag.colliders = rdiag.colliders;
    this._diag.ccdBodies = rdiag.ccdBodies || 0;
    this._diag.rapierContacts = rdiag.contacts || 0;
    this._diag.rapierEvents = rdiag.collisionEvents || 0;
  },

  _disableRapierBackend() {
    if (this._rapier || this._rapierInit) this._rapierToken++;
    if (this._rapier && typeof this._rapier.dispose === 'function') this._rapier.dispose();
    this._rapier = null;
    this._rapierInit = null;
    this._diag.rapierReady = false;
    this._diag.bodies = 0;
    this._diag.colliders = 0;
    this._diag.ccdBodies = 0;
    this._diag.rapierContacts = 0;
    this._diag.rapierEvents = 0;
  },
};

function maskOf(e) {
  switch (e.type) {
    case 'ship': return Masks.SHIP;
    case 'asteroid': return Masks.ASTEROID;
    case 'station': return Masks.STATION;
    case 'projectile': return Masks.PROJECTILE;
    case 'pickup': return Masks.PICKUP;
    case 'drone': return Masks.DRONE;
    case 'wreck': return Masks.WRECK;
    default: return 0;
  }
}

function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function canCollide(a, b) {
  return !!(a.collisionMask & maskOf(b));
}

function invMass(e) { return (e.type === 'station' || e.type === 'asteroid') ? 0 : 1 / Math.max(0.1, e.mass); }

function materialFor(e) {
  return COLLISION_MATERIALS[e.type] || DEFAULT_MATERIAL;
}

function pairMaterial(a, b) {
  const ma = materialFor(a);
  const mb = materialFor(b);
  return {
    push: Math.min(ma.push, mb.push),
    restitution: Math.min(ma.restitution, mb.restitution),
    tangentDamping: Math.max(ma.tangentDamping, mb.tangentDamping),
    impactScale: Math.min(ma.impactScale, mb.impactScale),
  };
}

function applySurfaceResponse(e, nx, nz, material) {
  const rel = e.vel.x * nx + e.vel.z * nz;
  if (rel < 0) {
    e.vel.x -= nx * rel * (1 + material.restitution);
    e.vel.z -= nz * rel * (1 + material.restitution);
  }
  if (material.tangentDamping > 0) {
    const vt = e.vel.x * -nz + e.vel.z * nx;
    e.vel.x += nz * vt * material.tangentDamping;
    e.vel.z -= nx * vt * material.tangentDamping;
  }
}

function pushApart(a, b, dist, dx, dz, scale) {
  const pen = (a.radius + b.radius) - dist;
  if (pen <= 0) return;
  const ima = invMass(a), imb = invMass(b);
  const tot = ima + imb;
  if (tot === 0) return;
  const nx = dx / dist, nz = dz / dist;
  const push = pen * scale;
  a.pos.x -= nx * push * (ima / tot); a.pos.z -= nz * push * (ima / tot);
  b.pos.x += nx * push * (imb / tot); b.pos.z += nz * push * (imb / tot);
}

function impulse(a, b, nx, nz, material) {
  const ima = invMass(a), imb = invMass(b);
  const tot = ima + imb;
  if (tot === 0) return 0;
  const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
  const relN = rvx * nx + rvz * nz;
  if (relN > 0) return 0;
  const j = -(1 + material.restitution) * relN / tot;
  a.vel.x -= j * nx * ima; a.vel.z -= j * nz * ima;
  b.vel.x += j * nx * imb; b.vel.z += j * nz * imb;
  if (material.tangentDamping > 0) {
    const tx = -nz, tz = nx;
    const relT = rvx * tx + rvz * tz;
    const jt = -relT * material.tangentDamping / tot;
    a.vel.x -= jt * tx * ima; a.vel.z -= jt * tz * ima;
    b.vel.x += jt * tx * imb; b.vel.z += jt * tz * imb;
  }
  return Math.abs(j);
}

function previousPos(e, dt) {
  if (e.prevPos && Number.isFinite(e.prevPos.x) && Number.isFinite(e.prevPos.z)) return e.prevPos;
  return {
    x: e.pos.x - ((e.vel && e.vel.x) || 0) * dt,
    z: e.pos.z - ((e.vel && e.vel.z) || 0) * dt,
  };
}

function segmentCircleHit(start, end, center, radius) {
  const sx = start.x, sz = start.z;
  const ex = end.x, ez = end.z;
  const dx = ex - sx, dz = ez - sz;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 0.000001) {
    const ox = sx - center.x, oz = sz - center.z;
    const d = Math.hypot(ox, oz) || 0.0001;
    return d <= radius ? { hit: true, t: 0, x: sx, z: sz, nx: ox / d, nz: oz / d } : { hit: false };
  }
  const relX = sx - center.x;
  const relZ = sz - center.z;
  const r2 = radius * radius;
  const startDist2 = relX * relX + relZ * relZ;
  if (startDist2 <= r2) {
    const d = Math.sqrt(startDist2);
    const len = Math.sqrt(len2);
    const nx = d > 0.0001 ? relX / d : -dx / len;
    const nz = d > 0.0001 ? relZ / d : -dz / len;
    return { hit: true, t: 0, x: center.x + nx * radius, z: center.z + nz * radius, nx, nz };
  }

  const b = 2 * (relX * dx + relZ * dz);
  const c = startDist2 - r2;
  const disc = b * b - 4 * len2 * c;
  if (disc < 0) return { hit: false };

  const sqrtDisc = Math.sqrt(disc);
  const invDenom = 1 / (2 * len2);
  let t = (-b - sqrtDisc) * invDenom;
  if (t < 0 || t > 1) {
    t = (-b + sqrtDisc) * invDenom;
    if (t < 0 || t > 1) return { hit: false };
  }

  const x = sx + dx * t;
  const z = sz + dz * t;
  const ox = x - center.x, oz = z - center.z;
  const d = Math.hypot(ox, oz) || 0.0001;
  const nx = ox / d, nz = oz / d;
  return { hit: true, t, x: center.x + nx * radius, z: center.z + nz * radius, nx, nz };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
