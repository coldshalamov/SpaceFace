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
  const exact = subsystemMatchesAtPoint(entity, combatant, catalog, local);
  if (exact.length) return exact[0].id;

  // Swept-circle collision reports the projectile centre at first contact, which sits just outside
  // the target hull. Preserve exact authored hit positions above, then trace only the bounded entry
  // segment from the hull skin toward the target centre and select the first subsystem it crosses.
  // Reject distant coordinates so an arbitrary off-hull damage packet cannot invent a subsystem hit.
  const radius = Math.max(0.000001, Number(entity && entity.radius) || 1);
  const distance = Math.hypot(local.x, local.z);
  if (distance < radius * 0.9 || distance > radius * 1.25) return null;
  const skin = { x: local.x * radius / distance, z: local.z * radius / distance };
  const center = { x: 0, z: 0 };
  const penetrations = [];
  for (const subsystemId of Object.keys(combatant.subsystems).sort()) {
    const def = catalog.subsystems.get(subsystemId);
    const entryT = def ? segmentVolumeEntryT(def.volume, skin, center, radius) : null;
    if (entryT != null) penetrations.push({ id: subsystemId, priority: Number(def.hitPriority) || 0, entryT });
  }
  penetrations.sort((a, b) => a.entryT - b.entryT || b.priority - a.priority || compareText(a.id, b.id));
  return penetrations.length ? penetrations[0].id : null;
}

export function socketWorldPosition(entity, socket) {
  return entityLocalPointToWorld(entity, socketLocalPosition(entity, socket));
}

export function socketLocalPosition(entity, socket) {
  const local = pair(socket && socket.localPos, 0, 0);
  const scale = Math.max(0.000001, Number(entity && entity.radius) || 1);
  return { x: local[0] * scale, z: local[1] * scale };
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

function subsystemMatchesAtPoint(entity, combatant, catalog, local) {
  const matches = [];
  for (const subsystemId of Object.keys(combatant.subsystems).sort()) {
    const def = catalog.subsystems.get(subsystemId);
    if (def && volumeContainsPoint(def.volume, local, entity.radius || 1)) {
      matches.push({ id: subsystemId, priority: Number(def.hitPriority) || 0 });
    }
  }
  matches.sort((a, b) => b.priority - a.priority || compareText(a.id, b.id));
  return matches;
}

function segmentVolumeEntryT(volume, start, end, entityRadius) {
  if (!volume) return null;
  const scale = volume.space === 'normalized' ? entityRadius : 1;
  const center = pair(volume.center, 0, 0);
  const cx = center[0] * scale, cz = center[1] * scale;
  if (volume.shape === 'circle') {
    const radius = Math.max(0, Number(volume.radius) || 0) * scale;
    return segmentCircleEntryT(start, end, cx, cz, radius);
  }
  if (volume.shape === 'box') {
    const half = pair(volume.halfExtents, 0, 0);
    return segmentBoxEntryT(start, end, cx, cz,
      Math.max(0, half[0]) * scale, Math.max(0, half[1]) * scale);
  }
  if (volume.shape === 'capsule') {
    const a = pair(volume.a, -0.5, 0);
    const b = pair(volume.b, 0.5, 0);
    const radius = Math.max(0, Number(volume.radius) || 0) * scale;
    return segmentCapsuleEntryT(
      start,
      end,
      a[0] * scale - cx,
      a[1] * scale - cz,
      b[0] * scale - cx,
      b[1] * scale - cz,
      radius,
    );
  }
  return null;
}

function segmentCircleEntryT(start, end, cx, cz, radius) {
  const sx = start.x - cx, sz = start.z - cz;
  if (sx * sx + sz * sz <= radius * radius) return 0;
  const dx = end.x - start.x, dz = end.z - start.z;
  const a = dx * dx + dz * dz;
  if (a <= 1e-12) return null;
  const b = 2 * (sx * dx + sz * dz);
  const c = sx * sx + sz * sz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const entry = (-b - root) / (2 * a);
  const exit = (-b + root) / (2 * a);
  if (exit < 0 || entry > 1) return null;
  return Math.max(0, entry);
}

function segmentBoxEntryT(start, end, cx, cz, halfX, halfZ) {
  let enter = 0, exit = 1;
  const dx = end.x - start.x, dz = end.z - start.z;
  const axes = [
    [start.x, dx, cx - halfX, cx + halfX],
    [start.z, dz, cz - halfZ, cz + halfZ],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) <= 1e-12) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let near = (min - origin) / delta;
    let far = (max - origin) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  return exit < 0 || enter > 1 ? null : Math.max(0, enter);
}

function segmentCapsuleEntryT(start, end, ax, az, bx, bz, radius) {
  const axisX = bx - ax, axisZ = bz - az;
  const length = Math.hypot(axisX, axisZ);
  if (length <= 1e-12) return segmentCircleEntryT(start, end, ax, az, radius);

  const unitX = axisX / length, unitZ = axisZ / length;
  const normalX = -unitZ, normalZ = unitX;
  const project = (point) => {
    const offsetX = point.x - ax, offsetZ = point.z - az;
    return {
      x: offsetX * unitX + offsetZ * unitZ,
      z: offsetX * normalX + offsetZ * normalZ,
    };
  };
  const projectedStart = project(start);
  const projectedEnd = project(end);
  const entries = [
    segmentCircleEntryT(start, end, ax, az, radius),
    segmentCircleEntryT(start, end, bx, bz, radius),
    segmentBoxEntryT(projectedStart, projectedEnd, length * 0.5, 0, length * 0.5, radius),
  ].filter((entry) => entry != null);
  return entries.length ? Math.min(...entries) : null;
}

function pair(value, fallbackX, fallbackZ) {
  if (!Array.isArray(value)) return [fallbackX, fallbackZ];
  return [Number(value[0]) || 0, Number(value[1]) || 0];
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
