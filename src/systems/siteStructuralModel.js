// Site structural model — the vibration twin of siteThermalModel.
//
// Thermal answers "can this machine shed heat into the rock it touches?"
// This answers "is the ceiling still holding the bay these machines shake?"
//
// Same clock: the site owner calls it once per production step (asteroidSites
// _tickSite, dt = SITE_BALANCE.tickS). Separate state: the record lives on the
// site as `structure`, never inside a thermal solve.
//
// The schedule is authored seconds of heavy machines actually running, not a
// roll. A solid rock, dirt, or vein cell on the straight line between two
// heavies is a pillar and the bay does not load. Gas is not a pillar. A heavy
// is a machine that draws at least as much as the refinery; the catalog has no
// crusher id, and the fabricator sits in that same weight class because it
// draws more than the refinery. Extractors and ports do not.
//
// One consequence: the ceiling slab above the bay lets go and lands in the
// bore. The caller paints that body. This module does not write heat, cargo,
// credits, or machine stats, and it does not roll state.rng.

import { SITE_MACHINE_BY_ID } from '../data/sites.js';

export const STRUCTURE_MODEL_VERSION = 1;

/** Sim seconds on the site tick. Rumble first, so the fall is not the first sign. */
export const SITE_STRUCTURE = Object.freeze({
  rumbleS: 8,
  fractureS: 12,
});

function heavyDrawMW() {
  const refinery = SITE_MACHINE_BY_ID.get('sm_refinery');
  const draw = refinery && typeof refinery.power === 'number' ? -refinery.power : 0;
  // The catalog refinery draws 8. The fallback only matters if that row is missing.
  return draw > 0 ? draw : 8;
}

function finite(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function inBounds(col, row, cols, rows) {
  return col >= 0 && row >= 0 && col < cols && row < rows;
}

function tileAt(field, col, row) {
  return field && field[col] && field[col][row];
}

/** Rock, packed dirt, and ore are the only cells that brace a span. */
function isPillar(tile) {
  return !!tile && (tile.type === 'rock' || tile.type === 'dirt' || tile.type === 'vein');
}

function isHollow(tile) {
  return !!tile && tile.type === 'empty' && !tile.structure;
}

function isHeavy(def) {
  return !!(def && typeof def.power === 'number' && def.power < 0 && -def.power + 1e-9 >= heavyDrawMW());
}

function emptyBoreTile() {
  return { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
}

function slabFrom(tile) {
  const hp = finite(tile && tile.hp, 1);
  const slab = {
    type: tile.type,
    hp: hp > 0 ? hp : 1,
    maxHp: finite(tile && tile.maxHp, hp > 0 ? hp : 1),
    ore: tile && tile.ore || null,
    hazard: !!(tile && tile.hazard),
    tierReq: finite(tile && tile.tierReq, 1),
    hardness: finite(tile && tile.hardness, 1),
    risk: tile && typeof tile.risk === 'string' ? tile.risk : 'low',
    fallen: true,
  };
  if (tile && Number.isFinite(tile.yieldU)) slab.yieldU = tile.yieldU;
  return slab;
}

/**
 * Repair a saved structure record. Absent or garbage becomes null so a normal
 * site keeps the field off its save. A real record is plain data.
 */
export function normalizeSiteStructure(raw, cols, rows) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const width = Math.max(1, Math.trunc(finite(cols, 1)));
  const height = Math.max(1, Math.trunc(finite(rows, 1)));
  const falls = [];
  if (Array.isArray(raw.falls)) {
    for (const fall of raw.falls) {
      if (!fall || typeof fall !== 'object' || !isPillar(fall.tile)) continue;
      const col = Math.trunc(finite(fall.col, -1));
      const row = Math.trunc(finite(fall.row, -1));
      const fromCol = Math.trunc(finite(fall.fromCol, -1));
      const fromRow = Math.trunc(finite(fall.fromRow, -1));
      if (!inBounds(col, row, width, height) || !inBounds(fromCol, fromRow, width, height)) continue;
      falls.push({ col, row, fromCol, fromRow, tile: slabFrom(fall.tile) });
      if (falls.length >= 4) break;
    }
  }
  const stressS = Math.max(0, finite(raw.stressS, 0));
  if (!(stressS > 0) && raw.warned !== true && raw.fractured !== true && falls.length === 0) return null;
  return {
    stressS: Math.min(SITE_STRUCTURE.fractureS, stressS),
    warned: raw.warned === true,
    fractured: raw.fractured === true || falls.length > 0,
    falls,
  };
}

function blankStructure() {
  return { stressS: 0, warned: false, fractured: false, falls: [] };
}

function machinePosKey(m) {
  return `${String(m.col).padStart(4, '0')}:${String(m.row).padStart(4, '0')}:${m.id}`;
}

/** True when no solid cell sits strictly between the two housings. */
function spanUnsupported(field, a, b) {
  if (a.col !== b.col && a.row !== b.row) return false;
  if (a.col === b.col && a.row === b.row) return false;
  if (a.row === b.row) {
    const row = a.row;
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    for (let c = c0 + 1; c < c1; c++) {
      if (isPillar(tileAt(field, c, row))) return false;
    }
    return true;
  }
  const col = a.col;
  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  for (let r = r0 + 1; r < r1; r++) {
    if (isPillar(tileAt(field, col, r))) return false;
  }
  return true;
}

function ceilingAbove(field, col, row, occupied) {
  for (let r = row - 1; r >= 0; r--) {
    if (occupied.has(`${col},${r}`)) return null;
    const tile = tileAt(field, col, r);
    if (!tile || isHollow(tile)) continue;
    if (isPillar(tile)) return { col, row: r, tile };
    return null;
  }
  return null;
}

/**
 * The slab falls straight down into the first hollow bore cell of the span
 * that is not a machine and not the rover. Lowest row, then lowest column.
 */
function planFall(field, a, b, occupied, avatar, cols, rows) {
  const spots = [];
  if (a.row === b.row) {
    const row = a.row;
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    for (let c = c0; c <= c1; c++) spots.push({ col: c, row: row - 1 });
    for (let c = c0 + 1; c < c1; c++) spots.push({ col: c, row });
  } else {
    const col = a.col;
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    for (let r = r0; r < r1; r++) spots.push({ col, row: r });
    spots.push({ col, row: r0 - 1 });
  }
  spots.sort((p, q) => p.row - q.row || p.col - q.col);
  const seen = new Set();
  for (const spot of spots) {
    const key = `${spot.col},${spot.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!inBounds(spot.col, spot.row, cols, rows)) continue;
    if (occupied.has(key)) continue;
    if (avatar && avatar.col === spot.col && avatar.row === spot.row) continue;
    if (!isHollow(tileAt(field, spot.col, spot.row))) continue;
    const ceiling = ceilingAbove(field, spot.col, spot.row, occupied);
    if (!ceiling) continue;
    return {
      col: spot.col,
      row: spot.row,
      fromCol: ceiling.col,
      fromRow: ceiling.row,
      tile: slabFrom(ceiling.tile),
    };
  }
  return null;
}

/**
 * One structural step. Pure: the field and the previous record are not mutated.
 * `dtS` is the site tick, the same value production just consumed.
 */
export function stepSiteStructure(snapshot) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const cols = Math.max(1, Math.trunc(finite(snap.cols, 1)));
  const rows = Math.max(1, Math.trunc(finite(snap.rows, 1)));
  const prev = normalizeSiteStructure(snap.structure, cols, rows) || blankStructure();
  const dtS = finite(snap.dtS, 0);
  if (prev.fractured || !(dtS > 0) || !snap.field) {
    return { structure: prev, rumble: null, fracture: null };
  }

  const occupied = new Set();
  const running = [];
  const raw = Array.isArray(snap.machines) ? snap.machines : [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const col = Math.trunc(finite(m.col, -1));
    const row = Math.trunc(finite(m.row, -1));
    if (!inBounds(col, row, cols, rows)) continue;
    const id = typeof m.id === 'string' && m.id ? m.id : `${col},${row}`;
    occupied.add(`${col},${row}`);
    const def = typeof m.defId === 'string' ? SITE_MACHINE_BY_ID.get(m.defId) : null;
    const ratio = finite(m.powerRatio, 0);
    if (!isHeavy(def) || !(ratio > 0)) continue;
    running.push({
      id,
      col,
      row,
      name: def && typeof def.name === 'string' ? def.name : '',
    });
  }
  running.sort((a, b) => (machinePosKey(a) < machinePosKey(b) ? -1 : machinePosKey(a) > machinePosKey(b) ? 1 : 0));

  let pair = null;
  for (let i = 0; i < running.length && !pair; i++) {
    for (let j = i + 1; j < running.length; j++) {
      if (!spanUnsupported(snap.field, running[i], running[j])) continue;
      pair = [running[i], running[j]];
      break;
    }
  }

  if (!pair) return { structure: prev, rumble: null, fracture: null };

  // No hollow bore under a real ceiling means there is nothing to drop. A
  // machine parked between the heavies is that case: do not groan at a bay
  // that cannot fail.
  const avatar = snap.avatar && Number.isInteger(snap.avatar.col) && Number.isInteger(snap.avatar.row)
    ? snap.avatar : null;
  const landing = planFall(snap.field, pair[0], pair[1], occupied, avatar, cols, rows);
  if (!landing) return { structure: prev, rumble: null, fracture: null };

  const stressS = Math.min(SITE_STRUCTURE.fractureS, prev.stressS + dtS);
  const names = pair.map((m) => m.name).filter((name) => name);
  let warned = prev.warned;
  let rumble = null;
  if (!warned && stressS + 1e-9 >= SITE_STRUCTURE.rumbleS) {
    warned = true;
    rumble = { names };
  }

  let fracture = null;
  let falls = prev.falls;
  let fractured = false;
  if (stressS + 1e-9 >= SITE_STRUCTURE.fractureS) {
    fractured = true;
    falls = prev.falls.concat(landing);
    fracture = { ...landing, names };
  }

  return {
    structure: { stressS, warned, fractured, falls },
    rumble,
    fracture,
  };
}

/** Paint landed slabs after a field rebuild. Ceilings stay empty via the cleared list. */
export function paintStructuralFalls(field, structure) {
  if (!field || !structure || !Array.isArray(structure.falls)) return;
  for (const fall of structure.falls) {
    if (!fall || !fall.tile || !field[fall.col]) continue;
    field[fall.col][fall.row] = { ...fall.tile, fallen: true };
  }
}

/** Move one ceiling tile down into the bore. The two cells are not aliased. */
export function paintStructuralFracture(field, fracture) {
  if (!field || !fracture || !field[fracture.col] || !field[fracture.fromCol]) return false;
  field[fracture.col][fracture.row] = { ...fracture.tile, fallen: true };
  field[fracture.fromCol][fracture.fromRow] = emptyBoreTile();
  return true;
}
