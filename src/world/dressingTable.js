// Presenter/atlas dressing. POI markers, landmarks, and band props are not combat entities.

import { allocateEntityId } from '../core/entity.js';
import { initializePresentationAdmission } from '../core/presentationAdmission.js';

export const DRESSING_TABLE_SCHEMA = 'spaceface.dressingTable.v1';

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function ensureDressingTable(state) {
  if (!state || typeof state !== 'object') return null;
  const world = state.world || (state.world = {});
  let table = world.dressing;
  if (table && table.schema === DRESSING_TABLE_SCHEMA && Array.isArray(table.rows)) {
    if (!(table.byId instanceof Map)) table.byId = new Map(table.rows.map((row) => [row.id, row]));
    return table;
  }
  table = {
    schema: DRESSING_TABLE_SCHEMA,
    version: 0,
    rows: [],
    byId: new Map(),
  };
  world.dressing = table;
  return table;
}

function allocateDressingId(state, table, reserved = 0) {
  if (Number.isSafeInteger(reserved) && reserved > 0
    && !table.byId.has(reserved)
    && !(state && state.entities && state.entities.has(reserved))) {
    return reserved;
  }
  if (Number.isSafeInteger(state && state.nextEntityId) && state.nextEntityId >= 1) {
    return allocateEntityId(state);
  }
  let id = 1;
  while (table.byId.has(id) || (state && state.entities && state.entities.has(id))) id++;
  return id;
}

export function insertDressingRow(state, spec = {}) {
  const table = ensureDressingTable(state);
  const id = allocateDressingId(state, table, spec.id);
  const row = {
    id,
    type: spec.type || 'fx',
    alive: true,
    dressingResident: true,
    pos: { x: finite(spec.pos && spec.pos.x), z: finite(spec.pos && spec.pos.z) },
    rot: finite(spec.rot),
    radius: Math.max(0.5, finite(spec.radius, 10)),
    collides: false,
    homeSectorId: spec.homeSectorId || (spec.data && spec.data.homeSectorId) || null,
    data: spec.data && typeof spec.data === 'object' ? spec.data : {},
  };
  initializePresentationAdmission(row);
  table.rows.push(row);
  table.byId.set(id, row);
  table.version++;
  return row;
}

export function getDressingRow(state, id) {
  const table = state && state.world && state.world.dressing;
  if (!table || !table.byId) return null;
  return table.byId.get(id) || null;
}

export function dropDressingSector(state, sectorId) {
  const table = state && state.world && state.world.dressing;
  if (!table || !sectorId) return 0;
  let dropped = 0;
  for (let i = table.rows.length - 1; i >= 0; i--) {
    const row = table.rows[i];
    const home = row && (row.homeSectorId || (row.data && row.data.homeSectorId));
    if (home !== sectorId) continue;
    table.rows.splice(i, 1);
    table.byId.delete(row.id);
    dropped++;
  }
  if (dropped) table.version++;
  return dropped;
}

export function dressingCensus(state) {
  const table = state && state.world && state.world.dressing;
  const rows = table && Array.isArray(table.rows) ? table.rows.length : 0;
  let liveFx = 0;
  for (const e of state && state.entityList || []) {
    if (e && e.alive !== false && e.type === 'fx') liveFx++;
  }
  return { dressingRows: rows, liveFx };
}

export function forEachDressingRow(state, fn) {
  const table = state && state.world && state.world.dressing;
  if (!table || typeof fn !== 'function') return 0;
  let n = 0;
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (!row || row.alive === false) continue;
    fn(row);
    n++;
  }
  return n;
}
