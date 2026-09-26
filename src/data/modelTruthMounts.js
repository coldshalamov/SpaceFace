// Pure mount, size, and hit-volume math. Rows come from the census. No file IO.

const WEAPON_SOCKET_ORDER = [
  'SOCKET_Weapon_Front',
  'SOCKET_Weapon_Dorsal',
  'SOCKET_Weapon_Ventral',
  'SOCKET_Weapon_Port',
  'SOCKET_Weapon_Starboard',
  'SOCKET_Weapon_Left',
  'SOCKET_Weapon_Right',
  'SOCKET_Weapon_Rear',
  'SOCKET_Weapon_Aft',
];

const ENGINE_PREFIXES = ['SOCKET_Engine_', 'SOCKET_Trail_'];
const GENERIC_VOLUME_IDS = [
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_sensor',
  'subsystem_tether_spool',
  'subsystem_power',
  'subsystem_transport_clamp',
];

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mountDrawScale(row, entity) {
  const base = finite(row && row.drawScale, 1);
  const scale = base > 0 ? base : 1;
  const gameplay = row && row.gameplay || {};
  if (finite(gameplay.dockRadius) > 0) {
    const live = finite(entity && entity.data && entity.data.dockRadius, gameplay.dockRadius);
    return scale * (live / gameplay.dockRadius);
  }
  const ref = finite(gameplay.entityRadius, 0);
  const live = finite(entity && entity.radius, ref);
  if (ref > 0 && live > 0) return scale * (live / ref);
  return scale;
}

export function fittedSocketLocal(row, entity, position) {
  const scale = mountDrawScale(row, entity);
  const offset = row && Array.isArray(row.drawOffset) ? row.drawOffset : [0, 0, 0];
  const p = position || [0, 0, 0];
  return {
    x: finite(p[0]) * scale + finite(offset[0]),
    y: finite(p[1]) * scale + finite(offset[1]),
    z: finite(p[2]) * scale + finite(offset[2]),
  };
}

export function worldFromLocal(entity, local) {
  const rot = finite(entity && entity.rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const px = finite(entity && entity.pos && entity.pos.x);
  const pz = finite(entity && entity.pos && entity.pos.z);
  const x = finite(local && local.x);
  const z = finite(local && local.z);
  return {
    x: px + c * x - s * z,
    y: finite(local && local.y),
    z: pz + s * x + c * z,
  };
}

export function socketsNamed(row, prefix) {
  const list = row && Array.isArray(row.sockets) ? row.sockets : [];
  return list.filter((socket) => socket && String(socket.name || '').startsWith(prefix));
}

export function weaponSocketNames(row) {
  const names = socketsNamed(row, 'SOCKET_Weapon_').map((socket) => socket.name);
  names.sort((a, b) => {
    const ia = WEAPON_SOCKET_ORDER.indexOf(a);
    const ib = WEAPON_SOCKET_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  return names;
}

export function socketByName(row, name) {
  const list = row && Array.isArray(row.sockets) ? row.sockets : [];
  return list.find((socket) => socket && socket.name === name) || null;
}

export function socketWorldFromRow(row, entity, name) {
  const socket = socketByName(row, name);
  if (!socket) return null;
  return worldFromLocal(entity, fittedSocketLocal(row, entity, socket.position));
}

export function weaponSocketNameForSlot(row, slotIndex) {
  const names = weaponSocketNames(row);
  if (!names.length) return null;
  const index = Number.isFinite(slotIndex) ? Math.max(0, slotIndex) : 0;
  return names[index] || names[0];
}

export function shotWorldFromRow(row, entity, slotIndex) {
  const name = weaponSocketNameForSlot(row, slotIndex);
  if (!name) return null;
  return socketWorldFromRow(row, entity, name);
}

export function plumeSocketNameFromNames(names) {
  const list = Array.isArray(names) ? names.map((name) => String(name || '')) : [];
  const engines = list.filter((name) => name.startsWith('SOCKET_Engine_')).sort();
  if (engines.length) return engines[0];
  const trails = list.filter((name) => name.startsWith('SOCKET_Trail_'));
  trails.sort((a, b) => {
    if (a === 'SOCKET_Trail_Main') return -1;
    if (b === 'SOCKET_Trail_Main') return 1;
    return a.localeCompare(b);
  });
  return trails[0] || null;
}

export function plumeWorldFromRow(row, entity) {
  const names = (row && Array.isArray(row.sockets) ? row.sockets : []).map((socket) => socket && socket.name);
  const name = plumeSocketNameFromNames(names);
  return name ? socketWorldFromRow(row, entity, name) : null;
}

export function nozzleWorldFromRow(row, entity) {
  const nozzles = socketsNamed(row, 'SOCKET_Engine_');
  const trails = socketsNamed(row, 'SOCKET_Trail_');
  const socket = nozzles[0] || trails[0];
  if (!socket) return null;
  return socketWorldFromRow(row, entity, socket.name);
}

/** Aft face of the measured bounds, fitted into the live body. Never the entity origin. */
export function measuredHardpointFromRow(row, entity) {
  const bounds = row && row.bounds;
  if (!bounds || !bounds.min || !bounds.center) return null;
  const local = fittedSocketLocal(row, entity, [
    bounds.min[0],
    bounds.center[1],
    bounds.center[2],
  ]);
  const world = worldFromLocal(entity, local);
  const ox = finite(entity && entity.pos && entity.pos.x);
  const oz = finite(entity && entity.pos && entity.pos.z);
  if (Math.hypot(world.x - ox, world.z - oz) < 0.05) {
    const nudge = fittedSocketLocal(row, entity, [
      finite(bounds.min[0]) - 0.25,
      bounds.center[1],
      bounds.center[2],
    ]);
    return worldFromLocal(entity, nudge);
  }
  return world;
}

export function ropeEndFromRow(row, entity) {
  return socketWorldFromRow(row, entity, 'SOCKET_Tether_Massline')
    || socketWorldFromRow(row, entity, 'SOCKET_Tether')
    || measuredHardpointFromRow(row, entity);
}

export function mountFractionsFromRow(row, prefix) {
  const radius = finite(row && row.gameplay && row.gameplay.entityRadius, 1) || 1;
  const names = prefix === 'SOCKET_Weapon_'
    ? weaponSocketNames(row)
    : socketsNamed(row, prefix).map((socket) => socket.name).sort();
  return names.map((name) => {
    const socket = socketByName(row, name);
    const local = fittedSocketLocal(row, { radius, pos: { x: 0, z: 0 }, rot: 0, data: {} }, socket.position);
    return {
      name,
      pos: [local.x / radius, local.y / radius, local.z / radius],
      facing: name.includes('Rear') || name.includes('Aft') ? 'rear' : 'front',
      size: 'S',
    };
  });
}

function normalizedCenter(row, entity, position) {
  const radius = Math.max(1e-6, finite(entity && entity.radius, finite(row && row.gameplay && row.gameplay.entityRadius, 1)));
  const local = fittedSocketLocal(row, entity, position);
  return [local.x / radius, local.z / radius];
}

export function hitVolumeFromRow(row, entity, subsystemId) {
  if (!row) return null;
  const radius = Math.max(1e-6, finite(entity && entity.radius, finite(row.gameplay && row.gameplay.entityRadius, 1)));
  if (subsystemId === 'subsystem_drive') {
    const sockets = [...socketsNamed(row, 'SOCKET_Engine_'), ...socketsNamed(row, 'SOCKET_Trail_')]
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!sockets.length) return null;
    return {
      shape: 'box',
      space: 'normalized',
      center: normalizedCenter(row, entity, sockets[0].position),
      halfExtents: [0.2, 0.2],
      measured: true,
    };
  }
  if (subsystemId === 'subsystem_weapon') {
    const sockets = socketsNamed(row, 'SOCKET_Weapon_').sort((a, b) => a.name.localeCompare(b.name));
    if (!sockets.length) return null;
    return {
      shape: 'box',
      space: 'normalized',
      center: normalizedCenter(row, entity, sockets[0].position),
      halfExtents: [0.2, 0.2],
      measured: true,
    };
  }
  if (subsystemId === 'subsystem_tether_spool') {
    const socket = socketByName(row, 'SOCKET_Tether_Massline') || socketByName(row, 'SOCKET_Tether');
    const center = socket
      ? normalizedCenter(row, entity, socket.position)
      : null;
    if (!center) return null;
    return { shape: 'circle', space: 'normalized', center, radius: 0.14, measured: true };
  }
  if (subsystemId === 'subsystem_power') {
    const bounds = row.bounds;
    if (!bounds || !bounds.center) return null;
    const center = normalizedCenter(row, entity, bounds.center);
    return { shape: 'circle', space: 'normalized', center, radius: 0.18, measured: true };
  }
  if (subsystemId === 'subsystem_sensor') {
    const socket = socketByName(row, 'SOCKET_Camera_Focus');
    if (!socket) return null;
    return {
      shape: 'circle',
      space: 'normalized',
      center: normalizedCenter(row, entity, socket.position),
      radius: 0.12,
      measured: true,
    };
  }
  if (subsystemId === 'subsystem_transport_clamp') return null;
  return null;
}

export function unmeasuredHitVolumeIds(row) {
  if (!row || row.solid !== true) return [];
  const families = new Set(['player-hull', 'enemy-hull', 'faction-hull', 'traffic-hull']);
  if (!families.has(row.family)) return [];
  const standIn = { radius: finite(row.gameplay && row.gameplay.entityRadius, 1) || 1, pos: { x: 0, z: 0 }, rot: 0, data: {} };
  return GENERIC_VOLUME_IDS.filter((id) => !hitVolumeFromRow(row, standIn, id));
}

/** Bolt and mine-sensor radii are fractions of the measured planar size, not a second literal. */
export function boltRadiusFromPlanar(planar) {
  const size = finite(planar, 0);
  if (!(size > 0)) return 0.7;
  return Math.max(0.05, size * (0.7 / 14));
}

export function mineSensorRadiusFromPlanar(planar) {
  const size = finite(planar, 0);
  if (!(size > 0)) return 1.6;
  return Math.max(0.05, size * (1.6 / 14));
}

export function placeDrawScaleFromRow(row, entity) {
  if (!row) return null;
  if (row.family === 'player-hull' || row.family === 'enemy-hull' || row.family === 'faction-hull' || row.family === 'traffic-hull') {
    return null;
  }
  return mountDrawScale(row, entity);
}

export { ENGINE_PREFIXES, GENERIC_VOLUME_IDS };
