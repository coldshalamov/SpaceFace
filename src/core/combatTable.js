// Dense combat SoA beside GameState. Entity objects remain save/authority;
// hot radius queries and later snapshot packing read these columns.

export const COMBAT_TABLE_SCHEMA = 'spaceface.combatTable.v1';

const FLAG_SHIP = 1 << 0;
const FLAG_PROJECTILE = 1 << 1;
const FLAG_PLAYER = 1 << 2;
const FLAG_WRECK = 1 << 3;

function grow(table, capacity) {
  table.capacity = capacity;
  table.id = new Uint32Array(capacity);
  table.x = new Float64Array(capacity);
  table.z = new Float64Array(capacity);
  table.vx = new Float64Array(capacity);
  table.vz = new Float64Array(capacity);
  table.yaw = new Float64Array(capacity);
  table.radius = new Float64Array(capacity);
  table.team = new Int32Array(capacity);
  table.flags = new Uint32Array(capacity);
}

export function ensureCombatTable(state, capacity = 64) {
  if (!state || typeof state !== 'object') return null;
  let table = state.combatTable;
  if (table && table.schema === COMBAT_TABLE_SCHEMA && table.id instanceof Uint32Array) {
    return table;
  }
  table = {
    schema: COMBAT_TABLE_SCHEMA,
    count: 0,
    capacity: 0,
    tick: -1,
  };
  grow(table, Math.max(8, capacity));
  state.combatTable = table;
  return table;
}

export function packCombatTable(state) {
  const table = ensureCombatTable(state);
  if (!table) return null;
  const index = state.entityIndex;
  const ships = (index && index.shipLike) || [];
  const projectiles = (index && index.projectiles) || [];
  const wrecks = (index && index.wrecks) || [];
  const n = ships.length + projectiles.length + wrecks.length;
  if (n > table.capacity) {
    let next = table.capacity || 8;
    while (next < n) next *= 2;
    grow(table, next);
  }
  let w = 0;
  const write = (entity, extraFlags) => {
    if (!entity || entity.alive === false || !entity.pos) return;
    table.id[w] = entity.id >>> 0;
    table.x[w] = Number(entity.pos.x) || 0;
    table.z[w] = Number(entity.pos.z) || 0;
    table.vx[w] = entity.vel ? Number(entity.vel.x) || 0 : 0;
    table.vz[w] = entity.vel ? Number(entity.vel.z) || 0 : 0;
    table.yaw[w] = Number(entity.rot) || 0;
    table.radius[w] = Number(entity.radius) || 0;
    table.team[w] = entity.team == null ? -1 : entity.team | 0;
    let flags = extraFlags;
    if (entity.isPlayer === true || entity.id === state.playerId) flags |= FLAG_PLAYER;
    table.flags[w] = flags;
    w++;
  };
  for (let i = 0; i < ships.length; i++) write(ships[i], FLAG_SHIP);
  for (let i = 0; i < projectiles.length; i++) write(projectiles[i], FLAG_PROJECTILE);
  for (let i = 0; i < wrecks.length; i++) write(wrecks[i], FLAG_WRECK);
  table.count = w;
  table.tick = state.tick | 0;
  return table;
}

export function queryCombatTableRadius(table, x, z, radius, outIds = []) {
  outIds.length = 0;
  if (!table || table.count <= 0) return outIds;
  const r2 = radius * radius;
  const n = table.count;
  for (let i = 0; i < n; i++) {
    const dx = table.x[i] - x;
    const dz = table.z[i] - z;
    if (dx * dx + dz * dz <= r2) outIds.push(table.id[i]);
  }
  return outIds;
}

export function queryCombatTableEntities(state, x, z, radius, out = [], flagMask = 0) {
  out.length = 0;
  const table = state && state.combatTable;
  if (!table || table.count <= 0 || !state.entities || typeof state.entities.get !== 'function') {
    return out;
  }
  const r2 = radius * radius;
  const n = table.count;
  const want = flagMask | 0;
  for (let i = 0; i < n; i++) {
    if (want && (table.flags[i] & want) === 0) continue;
    const dx = table.x[i] - x;
    const dz = table.z[i] - z;
    if (dx * dx + dz * dz > r2) continue;
    const entity = state.entities.get(table.id[i]);
    if (entity && entity.alive !== false) out.push(entity);
  }
  return out;
}

export function combatTableRowDistance(table, id, x, z) {
  if (!table || table.count <= 0 || id == null) return null;
  const nid = id >>> 0;
  const n = table.count;
  for (let i = 0; i < n; i++) {
    if (table.id[i] !== nid) continue;
    const dx = table.x[i] - x;
    const dz = table.z[i] - z;
    return Math.hypot(dx, dz);
  }
  return null;
}

export const COMBAT_TABLE_FLAGS = Object.freeze({
  SHIP: FLAG_SHIP,
  PROJECTILE: FLAG_PROJECTILE,
  PLAYER: FLAG_PLAYER,
  WRECK: FLAG_WRECK,
});
