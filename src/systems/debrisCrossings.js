// Debris hazard discs promise fast junk on flat arcs. This moves a few shards
// across the disc the player is standing in. A slow hull is a graze. A fast
// hull takes one impact. Kill-machine jaws are not these discs.

export const DEBRIS_CROSS_SPEED = 160;
export const DEBRIS_SHARD_RADIUS = 14;
export const DEBRIS_GRAZE_SPEED = 45;
export const DEBRIS_HIT_HULL = 8;
export const DEBRIS_GAP_S = 3.2;
export const DEBRIS_LIVE_CAP = 2;
export const DEBRIS_SPEED_FULL = 120;
const MISS_BAND = 0.85;

export function debrisImpactDamage(intensity, playerSpeed) {
  const speed = Number(playerSpeed) || 0;
  if (!(speed > DEBRIS_GRAZE_SPEED)) return 0;
  const burn = Math.max(0, Number(intensity) || 0);
  if (!(burn > 0)) return 0;
  const scale = Math.min(1, speed / DEBRIS_SPEED_FULL);
  return DEBRIS_HIT_HULL * burn * scale;
}

function playerSpeed(player) {
  const vel = player && player.vel;
  if (!vel) return 0;
  return Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
}

function zoneKey(zone, index) {
  if (zone && zone.id) return String(zone.id);
  const c = zone && zone.center;
  return `${index}:${c ? c.x : 0}:${c ? c.z : 0}:${zone && zone.radius}`;
}

function pointSegmentDistance(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (!(len2 > 0)) return Math.hypot(px - x0, pz - z0);
  let t = ((px - x0) * dx + (pz - z0) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

function bookFor(host, sectorId) {
  let book = host._debrisBook;
  if (!book || book.sectorId !== sectorId) {
    if (book) retireAll(host, book);
    book = host._debrisBook = { sectorId, meters: new Map(), shards: [] };
  }
  return book;
}

function retireShard(host, book, shard) {
  const entity = shard.entity;
  if (entity) entity.alive = false;
  const remove = host.helpers && host.helpers.removeEntity;
  if (shard.entityId != null && typeof remove === 'function') remove(shard.entityId);
  const at = book.shards.indexOf(shard);
  if (at >= 0) book.shards.splice(at, 1);
}

function retireAll(host, book) {
  const shards = book.shards.slice();
  for (let i = 0; i < shards.length; i++) retireShard(host, book, shards[i]);
  book.meters.clear();
}

function spawnShard(host, state, zone, rng) {
  const radius = Number(zone.radius) || 0;
  const center = zone.center;
  const angle = rng() * Math.PI * 2;
  const offset = (rng() - 0.5) * 2 * radius * MISS_BAND;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const halfSq = radius * radius - offset * offset;
  if (!(halfSq > 1)) return null;
  const half = Math.sqrt(halfSq);
  const px = -dirZ;
  const pz = dirX;
  const x = center.x + px * offset - dirX * half;
  const z = center.z + pz * offset - dirZ * half;
  const spec = {
    type: 'pickup',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: DEBRIS_SHARD_RADIUS,
    collides: false,
    alive: true,
    data: {
      hazardDebris: true,
      kind: 'debris',
      amount: 0,
      name: 'Crossing junk',
    },
  };
  const spawn = host.helpers && host.helpers.spawnEntity;
  let entity = null;
  if (typeof spawn === 'function') entity = spawn(spec) || null;
  if (entity && entity.pos) {
    entity.pos.x = x;
    entity.pos.z = z;
    entity.vel = entity.vel || { x: 0, z: 0 };
    entity.vel.x = 0;
    entity.vel.z = 0;
    entity.collides = false;
    entity.data = entity.data || spec.data;
    entity.data.hazardDebris = true;
  }
  return {
    x,
    z,
    vx: dirX * DEBRIS_CROSS_SPEED,
    vz: dirZ * DEBRIS_CROSS_SPEED,
    distLeft: half * 2,
    radius: DEBRIS_SHARD_RADIUS,
    intensity: Math.max(0, Number(zone.intensity) || 0) * (Number(zone.intensityScale) || 1),
    entity,
    entityId: entity && entity.id != null ? entity.id : null,
    spec,
  };
}

/**
 * Advance crossing junk for this tick. `host` is the world system (helpers,
 * book). Returns the impacts a fast hull earned. A graze retires the shard
 * and deals nothing.
 */
export function stepDebrisCrossings(host, dt, state) {
  const empty = { spawned: 0, grazes: 0, hits: [] };
  if (!host || !(dt > 0) || !state || !state.world) return empty;
  const sectorId = state.world.currentSectorId || null;
  const book = bookFor(host, sectorId);
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || player.alive === false) {
    retireAll(host, book);
    return empty;
  }
  const docked = !!(state.ui && state.ui.docked) || !!(player.flags && player.flags.docked);
  const zones = (state.world.activeSector && state.world.activeSector.hazards) || [];
  const speed = playerSpeed(player);
  const pr = Number(player.radius) > 0 ? Number(player.radius) : 8;
  const hits = [];
  let grazes = 0;
  let spawned = 0;

  for (let i = book.shards.length - 1; i >= 0; i--) {
    const shard = book.shards[i];
    const step = Math.min(shard.distLeft, DEBRIS_CROSS_SPEED * dt);
    const x0 = shard.x;
    const z0 = shard.z;
    const x1 = x0 + shard.vx * (step / DEBRIS_CROSS_SPEED);
    const z1 = z0 + shard.vz * (step / DEBRIS_CROSS_SPEED);
    shard.x = x1;
    shard.z = z1;
    shard.distLeft -= step;
    if (shard.entity && shard.entity.pos) {
      shard.entity.pos.x = x1;
      shard.entity.pos.z = z1;
      if (shard.entity.vel) {
        shard.entity.vel.x = 0;
        shard.entity.vel.z = 0;
      }
    }
    const reach = pr + shard.radius;
    const struck = player.pos
      && pointSegmentDistance(player.pos.x, player.pos.z, x0, z0, x1, z1) <= reach;
    if (struck && !docked) {
      const damage = debrisImpactDamage(shard.intensity, speed);
      if (damage > 0) {
        hits.push({
          damage,
          intensity: shard.intensity,
          pos: { x: player.pos.x, z: player.pos.z },
        });
      } else grazes += 1;
      retireShard(host, book, shard);
      continue;
    }
    if (!(shard.distLeft > 0)) retireShard(host, book, shard);
  }

  if (!docked) {
    const rng = typeof state.rng === 'function' ? state.rng : null;
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (!zone || zone.type !== 'debris' || !zone.center) continue;
      const radius = Number(zone.radius);
      if (!(radius > 0) || !player.pos) continue;
      const dx = player.pos.x - zone.center.x;
      const dz = player.pos.z - zone.center.z;
      const inside = dx * dx + dz * dz <= radius * radius;
      const key = zoneKey(zone, i);
      if (!inside) {
        book.meters.delete(key);
        continue;
      }
      const intensity = Math.max(0, Number(zone.intensity) || 0) * (Number(zone.intensityScale) || 1);
      if (!(intensity > 0) || !rng) continue;
      const gap = DEBRIS_GAP_S / Math.max(intensity, 0.25);
      const meter = (book.meters.get(key) || 0) + dt;
      if (meter < gap || book.shards.length >= DEBRIS_LIVE_CAP) {
        book.meters.set(key, Math.min(meter, gap));
        continue;
      }
      book.meters.set(key, 0);
      const shard = spawnShard(host, state, zone, rng);
      if (shard) {
        book.shards.push(shard);
        spawned += 1;
      }
    }
  }

  return { spawned, grazes, hits };
}
