// Physics system: integrate positions, rebuild the spatial hash, broad-phase + circle/circle
// collision with response, swept projectile tests. Runs as steps 5-7 of the sim spine (§2.3).
// Velocity is updated by flight (thrust/drag); physics integrates position from velocity.
import { Masks } from './entity.js';

const RESTITUTION = 0.2;

export const physics = {
  name: 'physics',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._scratch = [];
  },

  update(dt, state) {
    this.integrate(dt, state);
    state.spatialHash.rebuild(state.entityList);
    this.collide(dt, state);
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
      e.rot += e.angVel * dt;
    }
  },

  collide(dt, state) {
    const bus = this.bus;
    const out = this._scratch;
    const checked = new Set(); // pair keys this step
    for (const a of state.entityList) {
      if (!a.alive || !a.collides) continue;
      out.length = 0;
      state.spatialHash.queryRadius(a.pos.x, a.pos.z, a.radius + 4, out);
      for (const bEnt of out) {
        if (bEnt === a || !bEnt.alive || !bEnt.collides) continue;
        if (!(a.collisionMask & maskOf(bEnt)) && !(bEnt.collisionMask & maskOf(a))) continue;
        const key = a.id < bEnt.id ? a.id * 100003 + bEnt.id : bEnt.id * 100003 + a.id;
        if (checked.has(key)) continue;
        checked.add(key);
        const dx = bEnt.pos.x - a.pos.x, dz = bEnt.pos.z - a.pos.z;
        const rsum = a.radius + bEnt.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > rsum * rsum) continue;
        this.resolvePair(a, bEnt, Math.sqrt(d2) || 0.0001, dx, dz, bus, state);
      }
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
    // station proximity (dock range) — soft, no physical push
    if (ta === 'station' || tb === 'station') {
      const st = ta === 'station' ? a : b;
      const sh = ta === 'station' ? b : a;
      if (sh.type === 'ship' && sh.id === state.playerId) {
        bus.emit('dock:range', { stationId: st.data && st.data.stationId, shipId: sh.id, inRange: true });
      }
      // soft bounce off station hull
      pushApart(a, b, dist, dx, dz, 0.5);
      return;
    }
    // ship/ship and ship/asteroid: separate + restitution impulse
    pushApart(a, b, dist, dx, dz, 1);
    impulse(a, b, dx / dist, dz / dist);
    bus.emit('collision', { aId: a.id, bId: b.id, impulse: 1, pos: { x: a.pos.x, z: a.pos.z } });
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

function invMass(e) { return (e.type === 'station' || e.type === 'asteroid') ? 0 : 1 / Math.max(0.1, e.mass); }

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

function impulse(a, b, nx, nz) {
  const ima = invMass(a), imb = invMass(b);
  const tot = ima + imb;
  if (tot === 0) return;
  const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
  const relN = rvx * nx + rvz * nz;
  if (relN > 0) return;
  const j = -(1 + RESTITUTION) * relN / tot;
  a.vel.x -= j * nx * ima; a.vel.z -= j * nz * ima;
  b.vel.x += j * nx * imb; b.vel.z += j * nz * imb;
}
