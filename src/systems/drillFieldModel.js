// Shared deterministic bore geometry. No drill session, cargo/damage writer or runtime owner.
import { ORES } from '../data/mining.js';
import { hash32, mulberry32 } from '../core/rng.js';
const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };

export const COLS = 28;        // width of the cross-section (tiles)

export const ROWS = 45;        // depth (surface at row 0, deeper = rarer/harder)

export const DIRT_HP = 4;

export const DIRT_HARDNESS = 0.7;

export const DRILL_GEOMETRY_RECOVERY_PER_S = 1 / 1800;

export const EMPTY_TILE = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });

export const RUBBLE_TILE = () => ({ type: 'dirt', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 0.4, rubble: true });

const ORE_TIER_BY_ID = new Map(ORES.map((o) => [o.id, o.tier]));

export function drillTierReqForOre(oreId) {
  const oreTier = ORE_TIER_BY_ID.get(oreId);
  if (oreTier == null || oreTier <= 0) return 1;
  if (oreTier === 1) return 2;
  return oreTier;
}

export function tileIndex(col, row) {
  return (Math.trunc(row) * COLS) + Math.trunc(col);
}

export function entryShaftIndex() {
  return tileIndex(Math.floor(COLS / 2), 0);
}

export function normalizeClearedTiles(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const idx = Math.trunc(Number(value));
    if (!Number.isFinite(idx) || idx < 0 || idx >= COLS * ROWS || seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  out.sort((a, b) => a - b);
  return out;
}

export function recoverClearedGeometry(cleared, elapsedS, recoveryPerS = DRILL_GEOMETRY_RECOVERY_PER_S) {
  const list = normalizeClearedTiles(cleared);
  if (!list.length) return list;
  const elapsed = Math.max(0, Number(elapsedS) || 0);
  if (!(elapsed > 0) || !(recoveryPerS > 0)) return list;
  const healFrac = clamp01(elapsed * recoveryPerS);
  if (healFrac <= 0) return list;
  if (healFrac >= 1) {
    // Fully settled — keep only the surface entry so a re-bore always has a legal spawn cell.
    return [entryShaftIndex()];
  }
  // Deep voids collapse first; shallow scars linger (reads as settling rock, not a teleport reset).
  const byDepth = [...list].sort((a, b) => {
    const ra = Math.floor(a / COLS);
    const rb = Math.floor(b / COLS);
    return rb - ra || b - a;
  });
  const dropCount = Math.floor(byDepth.length * healFrac);
  if (dropCount <= 0) return list;
  const keep = new Set(byDepth.slice(dropCount));
  keep.add(entryShaftIndex());
  return [...keep].sort((a, b) => a - b);
}

export function applyClearedTiles(field, cleared) {
  const list = normalizeClearedTiles(cleared);
  if (!field || !list.length) return list;
  for (const idx of list) {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    if (!field[col] || row < 0 || row >= ROWS) continue;
    field[col][row] = EMPTY_TILE();
  }
  return list;
}

export function fractureTile(tile) {
  tile.fault = true;
  tile.hardness = Math.max(0.2, Number((Number(tile.hardness) * 0.5).toFixed(2)));
  tile.hp = Math.max(1, Math.floor(Number(tile.hp) * 0.55));
  tile.maxHp = Math.max(tile.hp, Math.floor(Number(tile.maxHp) * 0.55));
}

export function applyRubbleTiles(field, rubble) {
  const list = normalizeClearedTiles(rubble);
  if (!field || !list.length) return;
  for (const idx of list) {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    if (!field[col] || row < 0 || row >= ROWS) continue;
    field[col][row] = RUBBLE_TILE();
  }
}

export function applyFlaggedTiles(field, flagged, fn) {
  const list = normalizeClearedTiles(flagged);
  if (!field || !list.length || typeof fn !== 'function') return;
  for (const idx of list) {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const tile = field[col] && field[col][row];
    if (tile) fn(tile, col, row);
  }
}

const DEFAULT_GEOLOGY_FAMILY = 'deep-core';
const METAL_ORES_BY_BAND = Object.freeze([
  Object.freeze(['cmdty_ore_iron', 'cmdty_ore_bronzium']),
  Object.freeze(['cmdty_ore_bronzium', 'cmdty_ore_copper', 'cmdty_ore_silverium']),
  Object.freeze(['cmdty_ore_silverium', 'cmdty_ore_goldium', 'cmdty_ore_platinium']),
]);
const ICE_ORE = 'cmdty_gem_diamond';
const EXOTIC_ORES = Object.freeze([
  'cmdty_ore_einsteinium',
  'cmdty_gem_emerald',
  'cmdty_gem_ruby',
  'cmdty_exotic_amazonite',
]);
const FORMATION_NEIGHBORS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([-1, 0]),
  Object.freeze([0, 1]), Object.freeze([0, -1]),
]);

function fieldDepth(row, rows) {
  return rows > 1 ? row / (rows - 1) : 0;
}

export function seededDrillRng(seed) {
  return mulberry32((seed | 0) || 1);
}

/**
 * The strata a prospector reads. Cap is the worked surface, spine is the working band, heart is
 * where the deep ore and the deep risk both live. It is a label on the same math the field was
 * already generated with — the board gains a name for what the eye was already seeing.
 */
export function stratumForDepth(depth) {
  if (depth < 0.34) return 'cap';
  if (depth < 0.68) return 'spine';
  return 'heart';
}

function matrixTile(row, rows, basalt = false) {
  const depth = fieldDepth(row, rows);
  const stratum = stratumForDepth(depth);
  if (!basalt || row <= 2) {
    return {
      type: 'dirt', hp: DIRT_HP, maxHp: DIRT_HP, ore: null, hazard: false, tierReq: 1,
      hardness: DIRT_HARDNESS, risk: 'low', stratum,
    };
  }
  const hp = 8 + Math.floor(depth * 25);
  return {
    type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1,
    hardness: Number((1.15 + depth * 0.85).toFixed(2)),
    risk: depth >= 0.7 ? 'elevated' : 'low', stratum,
  };
}

function gasTile() {
  return { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5, risk: 'critical' };
}

function veinTile(row, rows, ore, rng, rich = false) {
  const depth = fieldDepth(row, rows);
  const stratum = stratumForDepth(depth);
  const tierReq = Math.min(4, drillTierReqForOre(ore) + (rich ? 1 : 0));
  const yieldU = (1 + Math.floor(rng() * (2 + depth * 5))) * (rich ? 3 : 1);
  const hp = 5 + Math.floor(depth * 15) + (rich ? 4 : 0);
  return {
    type: 'vein', hp, maxHp: hp, ore, yieldU, hazard: false, tierReq,
    hardness: Number(((0.9 + depth * 0.65 + Math.max(0, tierReq - 1) * 0.12) * (rich ? 1.25 : 1)).toFixed(2)),
    risk: rich ? 'high' : (depth >= 0.7 ? 'high' : (depth >= 0.35 ? 'elevated' : 'low')),
    stratum, rich: rich || undefined,
  };
}

/**
 * A sealed cave — packed friable fill the field was born with, never a born hollow: the contact
 * law requires every ring cell to be solid or worked, so a pocket the player hasn't opened is
 * still rock. It bores in one bite and pays nothing — the payout is the chamber it reveals.
 * cave:true marks it so the renderer and the inspector can name it.
 */
function caveTile(row, rows) {
  const stratum = stratumForDepth(fieldDepth(row, rows));
  return { type: 'rock', hp: 2, maxHp: 2, ore: null, hazard: false, tierReq: 1, hardness: 0.4, risk: 'low', stratum, cave: true };
}

/** A fracture plane: the same rock, cut at half hardness along a seeded run. */
function markFault(field, col, row) {
  const tile = field[col] && field[col][row];
  if (!tile || tile.type === 'empty' || tile.type === 'gas' || tile.fault) return false;
  tile.fault = true;
  tile.hardness = Math.max(0.2, Number((Number(tile.hardness) * 0.45).toFixed(2)));
  return true;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function latticeNoise(seed, x, y) {
  return hash32(seed, x, y) / 4294967296;
}

function valueNoise(seed, x, y, scale) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smoothstep(sx - x0);
  const ty = smoothstep(sy - y0);
  const a = latticeNoise(seed, x0, y0);
  const b = latticeNoise(seed, x0 + 1, y0);
  const c = latticeNoise(seed, x0, y0 + 1);
  const d = latticeNoise(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** A bounded three-octave field used to wrinkle otherwise depth-flat strata. */
function strataNoise(seed, col, row) {
  return valueNoise(hash32(seed, 'coarse'), col, row, 11) * 0.56
    + valueNoise(hash32(seed, 'middle'), col, row, 5.5) * 0.29
    + valueNoise(hash32(seed, 'fine'), col, row, 2.75) * 0.15;
}

function buildStrata(seed, width, height) {
  const rng = seededDrillRng(hash32(seed, 'strata-profile'));
  const period = 6.4 + rng() * 2.8;
  const phase = rng() * period;
  const slope = (rng() * 2 - 1) * 0.24;
  const field = Array.from({ length: width }, () => Array(height));
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) {
      const depth = fieldDepth(row, height);
      const grain = strataNoise(seed, col, row);
      const warpedDepth = row + col * slope + phase + (grain - 0.5) * 3.2;
      const band = Math.sin((warpedDepth / period) * Math.PI * 2);
      const threshold = 0.68 - depth * 0.66;
      const basalt = row > 3 && band + (grain - 0.5) * 0.5 > threshold;
      field[col][row] = matrixTile(row, height, basalt);
    }
  }
  return field;
}

function formationCellIndex(col, row, width) {
  return row * width + col;
}

function pickWeighted(rng, candidates) {
  let total = 0;
  for (const candidate of candidates) total += candidate.weight;
  let roll = rng() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

function findFormationStart(rng, blocked, width, minRow, maxRow) {
  const minCol = width > 2 ? 1 : 0;
  const maxCol = width > 2 ? width - 2 : width - 1;
  const rowSpan = Math.max(1, maxRow - minRow + 1);
  const colSpan = Math.max(1, maxCol - minCol + 1);
  for (let attempt = 0; attempt < 96; attempt++) {
    const col = minCol + Math.floor(rng() * colSpan);
    const row = minRow + Math.floor(rng() * rowSpan);
    if (!blocked[formationCellIndex(col, row, width)]) return { col, row };
  }
  const offset = Math.floor(rng() * width * rowSpan);
  for (let step = 0; step < width * rowSpan; step++) {
    const probe = (offset + step) % (width * rowSpan);
    const col = probe % width;
    const row = minRow + Math.floor(probe / width);
    if (col >= minCol && col <= maxCol && !blocked[formationCellIndex(col, row, width)]) return { col, row };
  }
  return null;
}

/**
 * A branching random walk biased along one grain vector. Every accepted cell is four-connected to
 * the body already grown; occasional restarts from an older member make forks without scattering
 * unrelated dots across the cross-section.
 */
function growFormationBody(rng, blocked, width, minRow, maxRow, targetSize, grainAngle) {
  const start = findFormationStart(rng, blocked, width, minRow, maxRow);
  if (!start) return null;
  const cells = [start];
  const members = new Set([formationCellIndex(start.col, start.row, width)]);
  const gx = Math.cos(grainAngle);
  const gy = Math.sin(grainAngle);
  let head = start;
  let lastStep = null;
  const minCol = width > 2 ? 1 : 0;
  const maxCol = width > 2 ? width - 2 : width - 1;

  for (let guard = 0; cells.length < targetSize && guard < targetSize * 80; guard++) {
    const branching = cells.length > 2 && rng() < 0.24;
    let origin = branching ? cells[Math.floor(rng() * cells.length)] : head;
    let candidates = neighborCandidates(origin);
    if (!candidates.length) {
      // A walker can box itself in. Restart from a seeded older member, still growing only through
      // a face so the body cannot ever become confetti.
      const offset = Math.floor(rng() * cells.length);
      for (let i = 0; i < cells.length && !candidates.length; i++) {
        origin = cells[(offset + i) % cells.length];
        candidates = neighborCandidates(origin);
      }
    }
    if (!candidates.length) break;
    const next = pickWeighted(rng, candidates);
    const cell = { col: next.col, row: next.row };
    members.add(formationCellIndex(cell.col, cell.row, width));
    cells.push(cell);
    head = cell;
    lastStep = { dc: next.dc, dr: next.dr };
  }
  return cells.length === targetSize ? cells : null;

  function neighborCandidates(origin) {
    const candidates = [];
    for (const [dc, dr] of FORMATION_NEIGHBORS) {
      const col = origin.col + dc;
      const row = origin.row + dr;
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
      const idx = formationCellIndex(col, row, width);
      if (blocked[idx] || members.has(idx)) continue;
      const alignment = Math.abs(dc * gx + dr * gy);
      const continues = lastStep && dc === lastStep.dc && dr === lastStep.dr ? 1 : 0;
      const reverses = lastStep && dc === -lastStep.dc && dr === -lastStep.dr ? 1 : 0;
      candidates.push({
        col, row, dc, dr,
        weight: 0.12 + alignment * 2.8 + continues * 1.45 - reverses * 0.08 + rng() * 0.35,
      });
    }
    return candidates;
  }
}

function reserveFormation(blocked, cells, width, height) {
  for (const cell of cells) {
    blocked[formationCellIndex(cell.col, cell.row, width)] = 2;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const col = cell.col + dc;
        const row = cell.row + dr;
        if (col < 0 || col >= width || row < 0 || row >= height) continue;
        const idx = formationCellIndex(col, row, width);
        if (!blocked[idx]) blocked[idx] = 1;
      }
    }
  }
}

function placeFormation({
  rng, blocked, field, width, height, minRow, maxRow, size, grainAngle, makeTile,
}) {
  const low = Math.max(3, Math.min(height - 2, Math.trunc(minRow)));
  const high = Math.max(low, Math.min(height - 2, Math.trunc(maxRow)));
  for (let attempt = 0; attempt < 48; attempt++) {
    const cells = growFormationBody(rng, blocked, width, low, high, size, grainAngle);
    if (!cells) continue;
    reserveFormation(blocked, cells, width, height);
    for (const cell of cells) field[cell.col][cell.row] = makeTile(cell.row);
    return cells;
  }
  return null;
}

function metalOreFor(row, height, rng) {
  const depth = fieldDepth(row, height);
  const band = depth < 0.34 ? 0 : (depth < 0.68 ? 1 : 2);
  const ores = METAL_ORES_BY_BAND[band];
  return ores[Math.floor(rng() * ores.length) % ores.length];
}

/**
 * Pure interior geology generator. The seed identifies the individual asteroid; `family` is a
 * stable family label for callers that have one. Independent seeded streams build the multi-octave
 * host strata, sealed gas pockets, and anisotropic vein walks, so changing one formation count does
 * not consume ambient simulation randomness or alter any payout/tier rule.
 */
export function generateFormations(seed, family = DEFAULT_GEOLOGY_FAMILY, width = COLS, height = ROWS) {
  const w = Math.max(1, Math.trunc(Number(width) || COLS));
  const h = Math.max(4, Math.trunc(Number(height) || ROWS));
  const asteroidSeed = (seed | 0) || 1;
  const geologySeed = hash32(asteroidSeed, String(family || DEFAULT_GEOLOGY_FAMILY), w, h, 'drill-geology-v1');
  const field = buildStrata(geologySeed, w, h);
  const blocked = new Uint8Array(w * h);

  const gasRng = seededDrillRng(hash32(geologySeed, 'gas-pockets'));
  const gasCount = 3 + Math.floor(gasRng() * 4);
  for (let i = 0; i < gasCount; i++) {
    const size = 2 + Math.floor(gasRng() * 5);
    const cells = placeFormation({
      rng: gasRng, blocked, field, width: w, height: h,
      minRow: 5, maxRow: h - 3, size, grainAngle: gasRng() * Math.PI * 2,
      makeTile: gasTile,
    });
    if (!cells) break;
  }

  const metalRng = seededDrillRng(hash32(geologySeed, 'metal-veins'));
  const metalCount = 6 + Math.floor(metalRng() * 7);
  for (let i = 0; i < metalCount; i++) {
    const size = 4 + Math.floor(metalRng() * 11);
    const center = 5 + ((i + 0.5 + (metalRng() - 0.5) * 0.7) / metalCount) * Math.max(1, h - 10);
    // The first legal interior row carries one surveyable seam through the fresh work register.
    // Rows 0-2 remain the guaranteed soft surface; deeper walks keep their stratified bands.
    const minRow = i === 0 ? 3 : Math.max(4, Math.floor(center - 4));
    const maxRow = i === 0 ? 3 : Math.min(h - 2, Math.ceil(center + 4));
    const bandOre = metalOreFor(center, h, metalRng);
    const ore = i === 0 ? 'cmdty_ore_iron' : bandOre;
    const grainAngle = (metalRng() - 0.5) * 1.05;
    const cells = placeFormation({
      rng: metalRng, blocked, field, width: w, height: h,
      minRow, maxRow, size, grainAngle,
      makeTile: (row) => veinTile(row, h, ore, metalRng),
    });
    if (!cells) break;
  }

  const iceRng = seededDrillRng(hash32(geologySeed, 'ice-lenses'));
  const iceCount = 1 + Math.floor(iceRng() * 3);
  for (let i = 0; i < iceCount; i++) {
    const size = 3 + Math.floor(iceRng() * 6);
    const cells = placeFormation({
      rng: iceRng, blocked, field, width: w, height: h,
      minRow: 5, maxRow: Math.max(5, Math.floor(h * 0.68)), size,
      grainAngle: (iceRng() - 0.5) * 0.6,
      makeTile: (row) => veinTile(row, h, ICE_ORE, iceRng),
    });
    if (!cells) break;
  }

  const exoticRng = seededDrillRng(hash32(geologySeed, 'exotic-core'));
  const exoticCount = 1 + Math.floor(exoticRng() * 3);
  for (let i = 0; i < exoticCount; i++) {
    const size = 3 + Math.floor(exoticRng() * 5);
    const ore = EXOTIC_ORES[Math.floor(exoticRng() * EXOTIC_ORES.length) % EXOTIC_ORES.length];
    const cells = placeFormation({
      rng: exoticRng, blocked, field, width: w, height: h,
      minRow: Math.floor(h * 0.72), maxRow: h - 2, size,
      grainAngle: (exoticRng() - 0.5) * 0.9,
      makeTile: (row) => veinTile(row, h, ore, exoticRng),
    });
    if (!cells) break;
  }

  // Rich seams — the lucky strike a deep prospector is actually digging for. Rare, denser,
  // tier-gated one step above the ore's band, and seeded like every other body on this rock.
  const richRng = seededDrillRng(hash32(geologySeed, 'rich-seams'));
  const richCount = 1 + Math.floor(richRng() * 2);
  for (let i = 0; i < richCount; i++) {
    const size = 3 + Math.floor(richRng() * 5);
    const ore = metalOreFor(Math.floor(h * 0.55) + i * 4, h, richRng);
    const cells = placeFormation({
      rng: richRng, blocked, field, width: w, height: h,
      minRow: Math.floor(h * 0.4), maxRow: h - 2, size,
      grainAngle: (richRng() - 0.5) * 0.7,
      makeTile: (row) => veinTile(row, h, ore, richRng, true),
    });
    if (!cells) break;
  }

  // Sealed caves — born hollows inside the rock. They never open onto the surface; a bore or a
  // charge finds them, and the board gains real chambers to expand instead of only digging.
  const caveRng = seededDrillRng(hash32(geologySeed, 'sealed-caves'));
  const caveCount = 1 + Math.floor(caveRng() * 2);
  for (let i = 0; i < caveCount; i++) {
    const size = 3 + Math.floor(caveRng() * 5);
    const cells = placeFormation({
      rng: caveRng, blocked, field, width: w, height: h,
      minRow: Math.floor(h * 0.5), maxRow: h - 3, size,
      grainAngle: caveRng() * Math.PI * 2,
      makeTile: (row) => caveTile(row, h),
    });
    if (!cells) break;
  }

  // Fracture planes — seeded straight runs of cracked rock that bore at half hardness. They do not
  // reserve cells (a fault marks rock that was already placed), and the renderer reads `fault` for
  // the crack decal so the fast line is legible before the bit touches it.
  const faultRng = seededDrillRng(hash32(geologySeed, 'fault-planes'));
  const faultCount = 1 + Math.floor(faultRng() * 3);
  for (let i = 0; i < faultCount; i++) {
    const len = 8 + Math.floor(faultRng() * 14);
    let col = 1 + Math.floor(faultRng() * Math.max(1, w - 2));
    let row = 4 + Math.floor(faultRng() * Math.max(1, h - 8));
    const angle = Math.floor(faultRng() * 4) * (Math.PI / 2) + (faultRng() - 0.5) * 0.35;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (let step = 0; step < len; step++) {
      const c = Math.round(col), r = Math.round(row);
      if (c < 1 || c >= w - 1 || r < 3 || r >= h - 2) break;
      markFault(field, c, r);
      col += dx + (faultRng() - 0.5) * 0.22;
      row += dy + (faultRng() - 0.5) * 0.22;
    }
  }

  return field;
}

/**
 * Generate the full undrilled cross-section for a seed. Pure given the seed — this is the single
 * source of truth for strata layout, shared by live drill sessions and the asteroid-site system
 * (which regenerates fields from a site's frozen boreSeed to recompute machine contact rings
 * without a live session). The interior generator derives independent mulberry32 streams from the
 * asteroid seed, so generation never advances the ambient simulation RNG.
 */
export function generateDrillField(seed, family = DEFAULT_GEOLOGY_FAMILY) {
  return generateFormations(seed, family, COLS, ROWS);
}
