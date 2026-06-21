export function worldPointToEntityLocal(entity, worldPoint) {
  const px = Number(worldPoint && worldPoint.x) || 0;
  const pz = Number(worldPoint && worldPoint.z) || 0;
  const dx = px - (Number(entity && entity.pos && entity.pos.x) || 0);
  const dz = pz - (Number(entity && entity.pos && entity.pos.z) || 0);
  const angle = -(Number(entity && entity.rot) || 0);
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function entityLocalPointToWorld(entity, localPoint) {
  const lx = Number(localPoint && localPoint.x) || 0;
  const lz = Number(localPoint && localPoint.z) || 0;
  const angle = Number(entity && entity.rot) || 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    x: (Number(entity && entity.pos && entity.pos.x) || 0) + lx * c - lz * s,
    z: (Number(entity && entity.pos && entity.pos.z) || 0) + lx * s + lz * c,
  };
}

export function volumeContainsPoint(volume, localPoint, entityRadius = 1) {
  if (!volume || !localPoint) return false;
  const scale = volume.space === 'normalized' ? Math.max(0.000001, Number(entityRadius) || 1) : 1;
  const center = pair(volume.center, 0, 0);
  const x = localPoint.x - center[0] * scale;
  const z = localPoint.z - center[1] * scale;
  switch (volume.shape) {
    case 'circle': {
      const radius = Math.max(0, Number(volume.radius) || 0) * scale;
      return x * x + z * z <= radius * radius;
    }
    case 'box': {
      const half = pair(volume.halfExtents, 0, 0);
      return Math.abs(x) <= Math.max(0, half[0]) * scale && Math.abs(z) <= Math.max(0, half[1]) * scale;
    }
    case 'capsule': {
      const a = pair(volume.a, -0.5, 0);
      const b = pair(volume.b, 0.5, 0);
      const radius = Math.max(0, Number(volume.radius) || 0) * scale;
      const ax = a[0] * scale - center[0] * scale;
      const az = a[1] * scale - center[1] * scale;
      const bx = b[0] * scale - center[0] * scale;
      const bz = b[1] * scale - center[1] * scale;
      return distanceSqPointSegment(localPoint.x, localPoint.z, ax, az, bx, bz) <= radius * radius;
    }
    default:
      return false;
  }
}

export function selectHitSubsystem(entity, combatant, catalog, hit = {}) {
  if (!combatant || !combatant.subsystems) return null;
  if (hit.subsystemId && combatant.subsystems[hit.subsystemId]) return hit.subsystemId;
  if (!hit.pos) return null;
  const local = worldPointToEntityLocal(entity, hit.pos);
  const matches = [];
  for (const subsystemId of Object.keys(combatant.subsystems).sort()) {
    const def = catalog.subsystems.get(subsystemId);
    if (def && volumeContainsPoint(def.volume, local, entity.radius || 1)) {
      matches.push({ id: subsystemId, priority: Number(def.hitPriority) || 0 });
    }
  }
  matches.sort((a, b) => b.priority - a.priority || compareText(a.id, b.id));
  return matches.length ? matches[0].id : null;
}

export function socketWorldPosition(entity, socket) {
  const local = pair(socket && socket.localPos, 0, 0);
  const scale = Math.max(0.000001, Number(entity && entity.radius) || 1);
  return entityLocalPointToWorld(entity, { x: local[0] * scale, z: local[1] * scale });
}

function distanceSqPointSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-12) {
    const ox = px - ax, oz = pz - az;
    return ox * ox + oz * oz;
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ox = px - (ax + dx * t), oz = pz - (az + dz * t);
  return ox * ox + oz * oz;
}

function pair(value, fallbackX, fallbackZ) {
  if (!Array.isArray(value)) return [fallbackX, fallbackZ];
  return [Number(value[0]) || 0, Number(value[1]) || 0];
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
