// Drill lens system (V2 §7 / cut-list #27). The deep-core extraction verb. When active, this owns a 2D
// vein cross-section the player drills into with WASD / Arrow keys. Yields real ore into cargo
// via the canonical addCargo writer. Hazards (gas pockets) have tells so they can be learned and
// avoided — the foundation of the hazard-taxonomy that automation will later program around.
//
// Single-writer: drill owns only state.drill (the field + avatar + accumulator). Ore grants route
// through cargo.addCargo. Determinism: the field is seeded by the asteroid's id (V2 §32 seed model)
// so the same asteroid drills the same way every visit.
import { addCargo } from './cargo.js';
import { ORES } from '../data/mining.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { recordFieldExtraction, fieldMemoryReadout } from './fieldDepletion.js';
import { hash32, mulberry32 } from '../core/rng.js';

const ORE_TIER_BY_ID = new Map(ORES.map((o) => [o.id, o.tier]));

// Map authored ore tier (0-4) to drill-head requirement (1-4).
// Must stay stable per ore id — depth must never change whether a vein is mineable.
export function drillTierReqForOre(oreId) {
  const oreTier = ORE_TIER_BY_ID.get(oreId);
  if (oreTier == null || oreTier <= 0) return 1;
  if (oreTier === 1) return 2;
  return oreTier;
}

function updateCableTrail(d, col, row) {
  if (!d.cableTrail) d.cableTrail = [];
  const idx = d.cableTrail.findIndex(p => p.col === col && p.row === row);
  if (idx !== -1) {
    // Backtracked! Crop the cable trail to this taut point to avoid loops
    d.cableTrail = d.cableTrail.slice(0, idx + 1);
  } else {
    // Extended the cable
    d.cableTrail.push({ col, row });
  }
}

const COLS = 28;        // width of the cross-section (tiles)
const ROWS = 45;        // depth (surface at row 0, deeper = rarer/harder)
const TILE = 40;        // px per tile (render hint; the screen may scale)
const DRILL_DPS = 8;    // ore-units/sec the player's drill clears (tier 0 baseline)
const GAS_DAMAGE = 18;  // hull % lost if you drill into a gas pocket (the lesson)
const GAS_TELL_RADIUS = 2; // tiles — gas is hinted (discolored) within this radius of a cleared tile
export const DRILL_ENERGY_MAX = 100;
export const DRILL_ENERGY_RECOVERY = 28;
export const DRILL_ENERGY_RESUME = 24;
export const DRILL_HEAT_COOLING = 36;
export const SCAN_RADIUS = 5;
export const SCAN_COOLDOWN_S = 6;
export const SCAN_ACTIVE_S = 0.9;
export const DIRT_HP = 4;
export const DIRT_HARDNESS = 0.7;

// Surgical drive cadence (PQ-130.02 — design law §4 + §11.7, playfield §5 item 9).
// The rig is a heavy machine you place, not a cursor you nudge, and the drill clock owns the whole
// cadence — browser key auto-repeat is never the movement clock:
//   • a press seats exactly ONE cell and stamps MOVE_HOLD_DELAY_S, so a hold shorter than the
//     delay can never produce a second cell (law §11.7);
//   • a hold that outlasts the delay cruises, still one cell per beat, at MOVE_CRUISE_INTERVAL_S —
//     inside the authored 0.22–0.28 s/cell band a person can steer down a tunnel;
//   • a press against rock lands a bore bite instead (BORE_BITE_S), never a silent no-op.
// The 0.06 s rocket this replaces is illegal by name in ASTEROID_WORKS_PLAYFIELD.md §3, and so is
// a merely slower rocket: the tap/hold split below is the law, not the number.
export const MOVE_HOLD_DELAY_S = 0.18;      // a hold shorter than this commits one cell, never two
export const MOVE_CRUISE_INTERVAL_S = 0.24; // seconds per cell once the chain is cruising
export const MOVE_COOLDOWN_BASE = MOVE_CRUISE_INTERVAL_S;
export const MOVE_COOLDOWN_CARGO = 0.03;    // full holds → 0.27 s/cell, still inside the band

// A tap against rock is a bite you can see: BORE_BITE_S of bore work delivered in one lump instead
// of a 1/60 s nibble. It is LOOKAHEAD, not a bonus — the bite pre-pays the next BORE_BITE_S of
// grind (d.boreDebt), so holding still cuts exactly one second of rock per second and a mashed key
// is strictly slower than an honest hold rather than faster. Without that, the bite would be free
// work stacked on top of continuous drilling and tapping would become the optimal way to mine.
// The bit then stays visibly seated in the bitten cell for BORE_BITE_HOLD_S, because presentation
// reads the crack stage off avatar.isDrilling / avatar.drillTarget and by then the key is already up.
export const BORE_BITE_S = 0.18;
export const BORE_BITE_HOLD_S = 0.45;

// Deep-core rocks remember being drilled. Each asteroid tracks:
//   • drillDepletion / drillYieldMax — how much ore still *pays*
//   • drillCleared[] — which tiles were already bored (so re-entry does not rebuild a pristine
//     cross-section as if nothing happened)
// Both recover slowly while you are away. Budget ~10 min full refill; tunnel geometry ~30 min so a
// 5-minute hop still shows the scars (immersion) without permanent eternal holes forever.
const DRILL_ROCK_RECOVERY_PER_S = 1 / 600; // depletion fraction healed per second → ~10 min full refill
/** Fraction of cleared tunnels that "settle" per second of real sim time away (~30 min full fill-in). */
export const DRILL_GEOMETRY_RECOVERY_PER_S = 1 / 1800;
// Surface yieldU is the flight-beam rock total (~8–22u). The minigame field is dense with veins, so
// deep-core uses a larger pool derived from that base. Without this, 3–4 veins empty the rock and
// every later real silicate break pays 0 with no cargo change — the "I mined 10 veins, nothing"
// report. Field richness may soft-scale the pool but must never floor a still-bearing rock to 0.
export const DEEP_CORE_YIELD_MULT = 4;
const EMPTY_TILE = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };

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

/**
 * Cheap geometry recovery: drop a time-proportional share of cleared cells (deepest first).
 * Storage is just an int list (usually dozens of entries) — not a full field bitmap.
 * At 5 minutes away only ~17% of holes fill; full settle is ~30 minutes.
 */
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

/** Apply previously bored cells onto a freshly seeded field (empty holes stay empty). */
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

function ensureAsteroidDeepCore(data) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.drillCleared)) data.drillCleared = [];
  return data;
}

function recordClearedTile(data, col, row) {
  const d = ensureAsteroidDeepCore(data);
  if (!d) return;
  const idx = tileIndex(col, row);
  if (idx < 0 || idx >= COLS * ROWS) return;
  if (!d.drillCleared.includes(idx)) d.drillCleared.push(idx);
}

/**
 * Pure budget math for deep-core sessions.
 * @returns {{ budget: number, max: number, remaining: number, richness: number }}
 */
export function computeDeepCoreBudget({
  surfaceYieldU = 0,
  drillYieldMax = null,
  drillDepletion = 0,
  lastDrillT = 0,
  simTime = 0,
  richnessMult = 1,
} = {}) {
  const surface = Math.max(0, Math.floor(Number(surfaceYieldU) || 0));
  const stored = drillYieldMax != null ? Math.max(0, Math.floor(Number(drillYieldMax) || 0)) : 0;
  // Prefer the larger of stored pool and surface×mult so older saves that locked drillYieldMax to
  // the tiny surface total still get a playable deep-core pool.
  const seeded = surface > 0 ? Math.max(surface, Math.floor(surface * DEEP_CORE_YIELD_MULT)) : 0;
  const max = Math.max(stored, seeded);
  if (max <= 0) return { budget: Number.POSITIVE_INFINITY, max: 0, remaining: Number.POSITIVE_INFINITY, richness: 1 };

  let depletion = clamp01(drillDepletion);
  const now = Number(simTime) || 0;
  const lastT = Number(lastDrillT) || 0;
  if (Number.isFinite(lastT) && now > lastT) {
    depletion = clamp01(depletion - (now - lastT) * DRILL_ROCK_RECOVERY_PER_S);
  }

  const remaining = Math.max(0, Math.floor(max * (1 - depletion) + 1e-9));
  const richness = Number.isFinite(richnessMult) && richnessMult > 0 ? richnessMult : 1;
  // Soft-scale by field richness, but never floor a rock that still has remaining capacity to 0.
  // Bug this kills: floor(smallMax * richness≈0.45) === 0 → every real vein break paid nothing.
  let budget = Math.floor(remaining * richness + 1e-9);
  if (remaining > 0) budget = Math.max(1, budget);
  else budget = 0;
  return { budget, max, remaining, richness, depletion };
}

/** Cargo-weighted cruise interval (seconds). loadFactor is usedVolume/capVolume in [0,1]. */
export function moveCooldownForLoad(loadFactor) {
  const lf = Math.max(0, Math.min(1, Number(loadFactor) || 0));
  return MOVE_COOLDOWN_BASE + Math.max(0, Math.min(MOVE_COOLDOWN_CARGO, lf * MOVE_COOLDOWN_CARGO));
}

/** Linear progress of the current visual step (0..1). 1 when idle / snap. */
export function avatarMoveProgress(avatar) {
  if (!avatar) return 1;
  const dur = avatar.moveDuration;
  if (!Number.isFinite(dur) || dur <= 0) return 1;
  const elapsed = Number.isFinite(avatar.moveElapsed) ? avatar.moveElapsed : 0;
  return Math.min(1, Math.max(0, elapsed / dur));
}

/** Pixel draw position for the rover (tile-space, not yet camera-scrolled). Time-interpolated. */
export function avatarDrawPos(avatar, tileSize = TILE) {
  const col = avatar?.col ?? 0;
  const row = avatar?.row ?? 0;
  const t = avatarMoveProgress(avatar);
  const fromCol = Number.isFinite(avatar?.fromCol) ? avatar.fromCol : col;
  const fromRow = Number.isFinite(avatar?.fromRow) ? avatar.fromRow : row;
  return {
    x: (fromCol + (col - fromCol) * t) * tileSize,
    y: (fromRow + (row - fromRow) * t) * tileSize,
    t,
  };
}

/** Explicit material resistance. Higher values mine slower and consume more rig power. */
export function materialHardness(tile) {
  if (!tile || tile.type === 'empty') return 0;
  if (Number.isFinite(tile.hardness)) return Math.max(0.35, tile.hardness);
  if (tile.type === 'gas') return 0.5;
  if (tile.type === 'dirt') return 0.75;
  if (tile.type === 'vein') return 1.15;
  return 1.45;
}

/** Read-only extraction receipt used by the HUD and deterministic checks. */
export function extractionTelemetry(tile, baseDps = DRILL_DPS) {
  const hardness = materialHardness(tile);
  if (!tile || tile.type === 'empty' || hardness <= 0) {
    return { hardness: 0, progress: 1, effectiveDps: 0, remainingS: 0, energyPerS: 0, heatPerS: 0 };
  }
  const effectiveDps = Math.max(0, Number(baseDps) || 0) / hardness;
  const maxHp = Math.max(0.001, Number(tile.maxHp) || Number(tile.hp) || 1);
  const hp = Math.max(0, Number(tile.hp) || 0);
  return {
    hardness,
    progress: Math.max(0, Math.min(1, 1 - hp / maxHp)),
    effectiveDps,
    remainingS: effectiveDps > 0 ? hp / effectiveDps : Infinity,
    energyPerS: 12 + hardness * 12,
    heatPerS: 17 + hardness * 7,
  };
}

function commitAvatarMove(d, nc, nr, cooldownVal) {
  const prevCol = d.avatar.col;
  const prevRow = d.avatar.row;
  d.avatar.fromCol = prevCol;
  d.avatar.fromRow = prevRow;
  d.avatar.col = nc;
  d.avatar.row = nr;
  d.avatar.moveDuration = cooldownVal;
  d.avatar.moveElapsed = 0;
  d.moveCooldown = cooldownVal;
  d.boreHold = 0; // the bit left that cell; stop lingering on the block behind us
  updateCableTrail(d, nc, nr);
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

function seededDrillRng(seed) {
  return mulberry32((seed | 0) || 1);
}

function matrixTile(row, rows, basalt = false) {
  const depth = fieldDepth(row, rows);
  if (!basalt || row <= 2) {
    return {
      type: 'dirt', hp: DIRT_HP, maxHp: DIRT_HP, ore: null, hazard: false, tierReq: 1,
      hardness: DIRT_HARDNESS, risk: 'low',
    };
  }
  const hp = 8 + Math.floor(depth * 25);
  return {
    type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1,
    hardness: Number((1.15 + depth * 0.85).toFixed(2)),
    risk: depth >= 0.7 ? 'elevated' : 'low',
  };
}

function gasTile() {
  return { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5, risk: 'critical' };
}

function veinTile(row, rows, ore, rng) {
  const depth = fieldDepth(row, rows);
  const tierReq = drillTierReqForOre(ore);
  const yieldU = 1 + Math.floor(rng() * (2 + depth * 5));
  const hp = 5 + Math.floor(depth * 15);
  return {
    type: 'vein', hp, maxHp: hp, ore, yieldU, hazard: false, tierReq,
    hardness: Number((0.9 + depth * 0.65 + Math.max(0, tierReq - 1) * 0.12).toFixed(2)),
    risk: depth >= 0.7 ? 'high' : (depth >= 0.35 ? 'elevated' : 'low'),
  };
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

function recoverRig(d, dt) {
  d.drillTemp = Math.max(0, d.drillTemp - DRILL_HEAT_COOLING * dt);
  d.drillEnergy = Math.min(DRILL_ENERGY_MAX, d.drillEnergy + DRILL_ENERGY_RECOVERY * dt);
  if (d.overheated && d.drillTemp <= 10) d.overheated = false;
  if (d.energyDepleted && d.drillEnergy >= DRILL_ENERGY_RESUME) d.energyDepleted = false;
}

function sessionResult(d, reason) {
  const yieldLog = { ...d.yieldLog };
  return Object.freeze({
    asteroidId: d.asteroidId,
    reason,
    aborted: reason === 'aborted',
    yieldLog,
    yieldUnits: Object.values(yieldLog).reduce((sum, qty) => sum + (Number(qty) || 0), 0),
    rockBudgetRemaining: Number.isFinite(d.rockBudget) ? Math.max(0, Math.floor(d.rockBudget)) : null,
    rockBudgetMax: Math.max(0, Math.floor(Number(d.rockBudgetMax) || 0)),
    gasHits: Number(d.gasHits) || 0,
    tilesCleared: Number(d.tilesCleared) || 0,
    maxDepth: Number(d.maxDepth) || 0,
    elapsedS: Number((Number(d.sessionElapsed) || 0).toFixed(3)),
  });
}

export const drill = {
  name: 'drill',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    ctx.drill = this;
    // live drill state; null when inactive (no asteroid being drilled)
    this.state.drill = null;
  },

  // Each rock remembers how much deep-core yield remains and refills slowly over sim time, so
  // re-entering a drilled rock pays out less (and nothing once played out) instead of fully
  // refreshing on every visit. Field richness soft-scales the pool but never floors a still-bearing
  // rock to zero (that made real silicate veins clear with no cargo). Persists remainder on entity.
  // Returns { budget, max, fieldId, sectorId }; budget is Infinity when the rock has no yield
  // metadata (legacy rocks simply aren't depletion-tracked rather than yielding nothing).
  _computeRockBudget(asteroidId) {
    const state = this.state;
    const ent = state && state.entities && typeof state.entities.get === 'function' ? state.entities.get(asteroidId) : null;
    const data = (ent && ent.data) || null;
    const fieldId = (data && data.fieldId) || null;
    const sectorId = (state && state.world && state.world.currentSectorId) || null;
    const richness = (fieldId && fieldMemoryReadout(state, fieldId).richnessMult) || 1;
    const computed = computeDeepCoreBudget({
      surfaceYieldU: data && data.yieldU,
      drillYieldMax: data && data.drillYieldMax,
      drillDepletion: data && data.drillDepletion,
      lastDrillT: data && data.lastDrillT,
      simTime: state && state.simTime,
      richnessMult: richness,
    });
    if (data && computed.max > 0) {
      data.drillYieldMax = computed.max;
      data.drillDepletion = computed.depletion;
      data.lastDrillT = Number(state && state.simTime) || 0;
    }
    return {
      budget: computed.budget,
      max: computed.max,
      fieldId,
      sectorId,
    };
  },

  // Begin a drilling session on an asteroid. Seeds the field from the asteroid's stable id so the
  // same rock has the same *undrilled* layout (V2 §32), then re-applies any previously cleared
  // cells so exit→re-enter resumes the bore instead of handing back a pristine rock.
  begin(asteroidId) {
    if (!asteroidId) return false;
    const ent = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(asteroidId)
      : null;
    const data = ensureAsteroidDeepCore(ent && ent.data);

    // Time away heals budget (in _computeRockBudget) and slowly settles tunnels (here).
    // Site-anchored rocks (Massline Core installed — asteroidSites.js) never settle: a permanent
    // claim with machines inside must not heal shut around them.
    const now = Number(this.state.simTime) || 0;
    const lastT = Number(data && data.lastDrillT) || 0;
    const awayS = Number.isFinite(lastT) && now > lastT ? now - lastT : 0;
    if (data && !data.siteId) {
      data.drillCleared = recoverClearedGeometry(data.drillCleared, awayS);
    }

    // Sites freeze their layout: data.boreSeed (stamped at core install) survives the asteroid
    // entity re-rolling its id across sector visits, so the same interior comes back every time.
    const field = generateDrillField((data && Number.isFinite(data.boreSeed)) ? data.boreSeed : asteroidId);
    // Carve an entry shaft at the surface center so the avatar always has a legal start cell.
    const startCol = Math.floor(COLS / 2);
    field[startCol][0] = EMPTY_TILE();
    if (data) recordClearedTile(data, startCol, 0);

    // Resume prior bore: empty every tile this rock still remembers as dug after geometry recovery.
    const cleared = applyClearedTiles(field, data && data.drillCleared);
    if (data) data.drillCleared = cleared;

    const rock = this._computeRockBudget(asteroidId);

    // Prefer last known empty cell so re-entry drops the rig back into the existing tunnel.
    let spawnCol = startCol;
    let spawnRow = 0;
    if (data && Number.isFinite(data.drillAvatarCol) && Number.isFinite(data.drillAvatarRow)) {
      const ac = Math.trunc(data.drillAvatarCol);
      const ar = Math.trunc(data.drillAvatarRow);
      if (ac >= 0 && ac < COLS && ar >= 0 && ar < ROWS && field[ac][ar] && field[ac][ar].type === 'empty') {
        spawnCol = ac;
        spawnRow = ar;
      }
    }

    this.state.drill = {
      asteroidId,
      field,
      fieldId: rock.fieldId,
      _sectorId: rock.sectorId,
      rockBudget: rock.budget,
      rockBudgetMax: rock.max,
      avatar: {
        col: spawnCol,
        row: spawnRow,
        fromCol: spawnCol,
        fromRow: spawnRow,
        moveDuration: 0,
        moveElapsed: 0,
        faceDir: 'down',
        isDrilling: false,
        drillTarget: null,
      },
      drillDir: null,         // kept for compatibility
      moveCooldown: 0,
      drillTemp: 0,           // drill head temperature (0 to 100)
      overheated: false,      // is drill overheated?
      drillEnergy: DRILL_ENERGY_MAX,
      energyDepleted: false,
      cableTrail: [{ col: spawnCol, row: spawnRow }], // active massline cable path trail
      accumulator: 0,         // fractional ore carry + drill damage carry
      gasHits: 0,             // how many gas pockets the player has triggered
      yieldLog: {},           // commodityId -> total units extracted this session (for the HUD + log)
      tilesCleared: cleared.length,
      maxDepth: Math.max(0, ...cleared.map((idx) => Math.floor(idx / COLS)), spawnRow),
      sessionElapsed: 0,
      scan: {
        cooldown: 0,
        active: 0,
        serial: 0,
        contacts: 0,
      },
      active: true,
    };
    this.bus.emit('drill:start', {
      asteroidId,
      rockBudget: rock.budget,
      rockBudgetMax: rock.max,
      resumedCleared: cleared.length,
    });
    // Played-out rocks still show veins, but every break pays 0 until recovery — tell the pilot now.
    if (Number.isFinite(rock.budget) && rock.budget <= 0 && rock.max > 0) {
      this.bus.emit('drill:rockDepleted', {
        asteroidId,
        budget: 0,
        max: rock.max,
        text: 'This rock is played out — veins break but pay no ore until it recovers.',
      });
      this.bus.emit('drill:warn', {
        text: 'This rock is played out — veins break but pay no ore until it recovers.',
        reason: 'depleted',
      });
    } else if (cleared.length > 1) {
      this.bus.emit('drill:warn', {
        text: `Resuming prior bore — ${cleared.length} cells already cleared on this rock.`,
        reason: 'resume',
      });
    }
    return true;
  },

  // End the session (player exits the screen). Keeps the yieldLog so a summary can show on exit.
  // Flushes budget remaining + avatar pose onto the asteroid so the next begin() resumes cleanly.
  end({ reason = 'retracted' } = {}) {
    const d = this.state.drill;
    if (!d) return null;
    d.active = false;
    this._persistSessionProgress(d);
    const result = sessionResult(d, reason);
    // Share extraction with the field-depletion ledger so drill + flight mining accumulate against
    // one field richness/recovery curve (a single receipt per session, by total units extracted).
    if (d.fieldId && Number(result.yieldUnits) > 0) {
      try { recordFieldExtraction(this.state, { fieldId: d.fieldId, sectorId: d._sectorId, extractedU: result.yieldUnits }); }
      catch (_) { /* field memory is best-effort; it must never block session end */ }
    }
    this.state.drill = null;
    this.bus.emit('drill:end', result);
    return result;
  },

  /** Write budget remaining, avatar pose, and cleared-tile memory back onto the asteroid entity. */
  _persistSessionProgress(d) {
    if (!d || d.asteroidId == null) return;
    const ent = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(d.asteroidId)
      : null;
    const data = ensureAsteroidDeepCore(ent && ent.data);
    if (!data) return;

    // Authoritative depletion from remaining session budget (covers mid-session extracts).
    if (Number.isFinite(d.rockBudget) && Number(d.rockBudgetMax) > 0) {
      const remaining = Math.max(0, Math.floor(d.rockBudget));
      const max = Math.max(1, Math.floor(d.rockBudgetMax));
      data.drillYieldMax = max;
      data.drillDepletion = clamp01(1 - (remaining / max));
      data.lastDrillT = Number(this.state.simTime) || 0;
    }

    if (d.avatar) {
      data.drillAvatarCol = d.avatar.col;
      data.drillAvatarRow = d.avatar.row;
    }

    // Scan the live field so any empty cell is remembered even if a write was missed mid-tick.
    if (Array.isArray(d.field)) {
      const merged = new Set(normalizeClearedTiles(data.drillCleared));
      for (let c = 0; c < COLS; c++) {
        const col = d.field[c];
        if (!col) continue;
        for (let r = 0; r < ROWS; r++) {
          if (col[r] && col[r].type === 'empty') merged.add(tileIndex(c, r));
        }
      }
      data.drillCleared = [...merged].sort((a, b) => a - b);
    }
  },

  abort() {
    return this.end({ reason: 'aborted' });
  },

  retry() {
    const d = this.state.drill;
    if (!d) return false;
    const asteroidId = d.asteroidId;
    const previous = this.end({ reason: 'retry' });
    const started = this.begin(asteroidId);
    if (started) this.bus.emit('drill:retry', { asteroidId, previous });
    return started;
  },

  newGame() {
    this.state.drill = null;
  },

  // Drill sessions are intentionally transient. Cargo already lives under the canonical cargo
  // writer; resuming a half-cleared procedural bore after load would duplicate authority.
  serialize() {
    return null;
  },

  deserialize() {
    this.state.drill = null;
  },

  // Legacy API wrapper for horizontal moves (if needed by external systems)
  move(dc) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    const nc = d.avatar.col + dc;
    if (nc < 0 || nc >= COLS) return;
    const target = d.field[nc][d.avatar.row];
    if (target.type !== 'empty') return;
    d.avatar.col = nc;
  },

  // Legacy API wrapper for vertical moves
  drillVertical(dir, dt) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    if (dir !== -1 && dir !== 1) return;
    if (!d.avatar || !Number.isFinite(d.avatar.col) || !Number.isFinite(d.avatar.row)) return;
    if (!Number.isFinite(d.moveCooldown)) d.moveCooldown = 0;
    if (!Number.isFinite(d.drillTemp)) d.drillTemp = 0;
    if (typeof d.overheated !== 'boolean') d.overheated = false;
    if (typeof d.avatar.isDrilling !== 'boolean') d.avatar.isDrilling = false;
    if (!d.avatar.drillTarget) d.avatar.drillTarget = null;
    if (!d.avatar.faceDir) d.avatar.faceDir = dir === 1 ? 'down' : 'up';
    if (!Array.isArray(d.cableTrail)) d.cableTrail = [{ col: d.avatar.col, row: d.avatar.row }];
    this.tickInput({ left: false, right: false, up: dir === -1, down: dir === 1 }, dt);
  },

  // Survey the nearby strata. A pulse permanently marks nearby tiles for this drill session, so
  // route planning has a real verb without adding another screen or any random outcome.
  pulseScan() {
    const d = this.state.drill;
    if (!d || !d.active) return false;
    if (!d.scan) d.scan = { cooldown: 0, active: 0, serial: 0, contacts: 0 };
    if (d.scan.cooldown > 0) return false;

    const ac = d.avatar.col;
    const ar = d.avatar.row;
    let contacts = 0;
    for (let dc = -SCAN_RADIUS; dc <= SCAN_RADIUS; dc++) {
      for (let dr = -SCAN_RADIUS; dr <= SCAN_RADIUS; dr++) {
        if ((dc * dc) + (dr * dr) > SCAN_RADIUS * SCAN_RADIUS) continue;
        const col = ac + dc;
        const row = ar + dr;
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
        const tile = d.field[col][row];
        if (!tile) continue;
        tile.surveyed = true;
        if (tile.type === 'vein' || tile.type === 'gas') contacts++;
      }
    }

    d.scan.cooldown = SCAN_COOLDOWN_S;
    d.scan.active = SCAN_ACTIVE_S;
    d.scan.serial++;
    d.scan.contacts = contacts;
    this.bus.emit('drill:scanPulse', {
      col: ac,
      row: ar,
      radius: SCAN_RADIUS,
      cooldown: SCAN_COOLDOWN_S,
      contacts,
      serial: d.scan.serial,
    });
    return true;
  },

  getDrillTier() {
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? (player.data?.miningBeam || this.state.player.miningBeam) : null;
    if (!beam) return 1;
    if (beam.tierId === 'beam_industrial') return 4;
    if (beam.tierId === 'beam_mk3') return 3;
    if (beam.tierId === 'beam_mk2') return 2;
    return 1; // beam_mk1
  },

  getDrillDPS() {
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? (player.data?.miningBeam || this.state.player.miningBeam) : null;
    // Scale minigame dps with player's beam dps
    return beam ? (beam.dps || 18) : 18;
  },

  // Unified tick input processor (WASD/Arrow control).
  // Processes motion, direction checks, and drilling action.
  //
  // opts.impulse marks the single fixed step that acknowledges a fresh key press — the tap itself.
  // On an empty face it seats one cell and stamps the short MOVE_HOLD_DELAY_S beat; on rock it
  // lands one BORE_BITE_S bite. Every other step is ordinary cruise / bore work. Callers with no
  // press-vs-hold distinction (the legacy drillVertical wrapper) simply never pass it.
  tickInput(held, dt, opts) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    const impulse = !!(opts && opts.impulse);

    if (!Number.isFinite(d.moveCooldown)) d.moveCooldown = 0;
    if (!Number.isFinite(d.avatar.moveElapsed)) d.avatar.moveElapsed = 0;
    if (!Number.isFinite(d.avatar.moveDuration)) d.avatar.moveDuration = 0;
    if (!Number.isFinite(d.avatar.fromCol)) d.avatar.fromCol = d.avatar.col;
    if (!Number.isFinite(d.avatar.fromRow)) d.avatar.fromRow = d.avatar.row;
    if (!d.scan) d.scan = { cooldown: 0, active: 0, serial: 0, contacts: 0 };
    if (!Number.isFinite(d.drillTemp)) d.drillTemp = 0;
    if (!Number.isFinite(d.drillEnergy)) d.drillEnergy = DRILL_ENERGY_MAX;
    if (typeof d.energyDepleted !== 'boolean') d.energyDepleted = false;
    if (!Number.isFinite(d.tilesCleared)) d.tilesCleared = 0;
    if (!Number.isFinite(d.maxDepth)) d.maxDepth = d.avatar.row || 0;
    if (!Number.isFinite(d.sessionElapsed)) d.sessionElapsed = 0;
    if (!Number.isFinite(d.boreHold)) d.boreHold = 0;
    if (!Number.isFinite(d.boreDebt)) d.boreDebt = 0;
    if (!Number.isFinite(d.boreBites)) d.boreBites = 0;
    d.sessionElapsed += dt;

    d.scan.cooldown = Math.max(0, (Number(d.scan.cooldown) || 0) - dt);
    d.scan.active = Math.max(0, (Number(d.scan.active) || 0) - dt);

    if (d.moveCooldown > 0) {
      d.moveCooldown -= dt;
    }

    // Bore work a bite already paid for. It runs down on the clock like everything else here, so a
    // player who bites and walks away is never handed a dead drill when they come back.
    const boreDebtBefore = Math.max(0, Number(d.boreDebt) || 0);
    d.boreDebt = Math.max(0, boreDebtBefore - dt);

    // Advance visual move window so presentation can lerp for the full step duration.
    if (d.avatar.moveDuration > 0 && d.avatar.moveElapsed < d.avatar.moveDuration) {
      d.avatar.moveElapsed = Math.min(d.avatar.moveDuration, d.avatar.moveElapsed + dt);
    }

    let dx = 0;
    let dy = 0;
    if (held.left) { dx = -1; d.avatar.faceDir = 'left'; }
    else if (held.right) { dx = 1; d.avatar.faceDir = 'right'; }
    else if (held.down) { dy = 1; d.avatar.faceDir = 'down'; }
    else if (held.up) { dy = -1; d.avatar.faceDir = 'up'; }

    if (dx === 0 && dy === 0) {
      // A bite outlives the key. The crack stage is drawn off avatar.isDrilling / drillTarget, so
      // retiring them the instant a tap ends would make a short bite literally invisible. Hold the
      // bit in the bitten cell for the rest of BORE_BITE_HOLD_S, then let go.
      d.boreHold = Math.max(0, d.boreHold - dt);
      const lingerAt = d.boreHold > 0 ? d.avatar.drillTarget : null;
      const lingerTile = lingerAt && d.field[lingerAt.col] ? d.field[lingerAt.col][lingerAt.row] : null;
      if (!lingerTile || lingerTile.type === 'empty') {
        d.boreHold = 0;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
      }
      d.avatar.drillBlocked = false;
      recoverRig(d, dt);
      return;
    }

    const nc = d.avatar.col + dx;
    const nr = d.avatar.row + dy;

    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
      d.boreHold = 0;
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      recoverRig(d, dt);
      return;
    }

    // --- 2. Calculate cargo-load movement speed (inertia) ---
    const cargo = this.state.player.cargo;
    const loadFactor = cargo && cargo.capVolume > 0 ? (cargo.usedVolume / cargo.capVolume) : 0;
    // Cruise beats are cargo-weighted (0.24s empty → 0.27s with full holds). The tap that opens a
    // press instead stamps the flat hold delay, so the EARLIEST a second cell can ever land is
    // MOVE_HOLD_DELAY_S after the first — that is what makes law §11.7 a real boundary instead of
    // an accident of whatever the cruise interval happens to be.
    const cruiseVal = moveCooldownForLoad(loadFactor);
    const cooldownVal = impulse ? MOVE_HOLD_DELAY_S : cruiseVal;

    const target = d.field[nc][nr];
    // Installed site machines occupy hollow cells (asteroidSites.js stamps tile.structure on
    // drill:start). They block the rover and the bore alike — removal goes through the build
    // console, never the drill head.
    if (target.type === 'empty' && target.structure) {
      d.boreHold = 0;
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = { col: nc, row: nr };
      d.avatar.drillBlocked = true;
      recoverRig(d, dt);
      if (d.moveCooldown <= 0) {
        this.bus.emit('drill:warn', {
          text: 'Machine housing ahead — dismantle it from the build console to reclaim the cell.',
          reason: 'structure',
          pos: { col: nc, row: nr },
        });
        d.moveCooldown = 1.0;
      }
      return;
    }
    if (target.type === 'empty') {
      d.boreHold = 0;
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      d.avatar.drillBlocked = false;
      recoverRig(d, dt);
      if (d.moveCooldown <= 0) {
        commitAvatarMove(d, nc, nr, cooldownVal);
      }
    } else {
      // Solid tile! Cannot drill UP or if overheated
      if (dy === -1) {
        d.boreHold = 0;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        recoverRig(d, dt);
        return;
      }

      if (d.overheated || d.energyDepleted) {
        d.boreHold = 0;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        const wasOverheated = d.overheated;
        recoverRig(d, dt);
        if (d.moveCooldown <= 0) {
          this.bus.emit('drill:warn', {
            text: wasOverheated ? 'Drill cooling down — release the bore.' : 'Rig capacitor recharging — release the bore.',
          });
          d.moveCooldown = 1.0;
        }
        return;
      }

      // Check drill tier requirement
      const tier = this.getDrillTier();
      const req = target.tierReq || 1;
      if (tier < req) {
        d.boreHold = 0;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = { col: nc, row: nr };
        d.avatar.drillBlocked = true;
        recoverRig(d, dt);
        if (d.moveCooldown <= 0) {
          const names = { 2: 'Drill MK2', 3: 'Drill MK3', 4: 'Industrial Drill' };
          const need = names[req] || 'a better drill';
          this.bus.emit('drill:warn', {
            text: `Upgrade required! Need ${need}.`,
            reason: 'tier',
            tierReq: req,
            pos: { col: nc, row: nr },
          });
          d.moveCooldown = 1.2; // throttle warnings
        }
        return;
      }

      // Active drilling
      const wasBitingThisCell = !!d.avatar.drillTarget
        && d.avatar.drillTarget.col === nc && d.avatar.drillTarget.row === nr;
      d.avatar.isDrilling = true;
      d.avatar.drillTarget = { col: nc, row: nr };
      d.avatar.drillBlocked = false;
      d.boreHold = BORE_BITE_HOLD_S;
      // Lookahead belongs to the cell that was bitten; aim somewhere else and it is forfeit.
      if (!wasBitingThisCell) d.boreDebt = 0;
      const paidAhead = wasBitingThisCell ? boreDebtBefore : 0;

      // A fresh press against rock is a BITE: one lump of bore work delivered at once, so a tap is
      // a crack you can see instead of a 1/60 s nibble. It costs a full cruise beat and pre-pays
      // the grind it just fast-forwarded, so holding still cuts one second of rock per second and
      // mashing comes out behind it — measured 14.6 vs 18 HP/s on baseline rock. A tap is precision,
      // never a shortcut. (test/asteroid-drive-cadence.test.mjs §6 measures both and compares them.)
      let biteDt = 0;
      if (impulse && d.moveCooldown <= 0) {
        biteDt = BORE_BITE_S;
        d.moveCooldown = cruiseVal;
        d.boreDebt = Math.max(0, BORE_BITE_S - dt);
        d.boreBites++;
      }

      const telemetry = extractionTelemetry(target, this.getDrillDPS());
      const energyWindow = telemetry.energyPerS > 0 ? d.drillEnergy / telemetry.energyPerS : dt;
      const heatWindow = telemetry.heatPerS > 0 ? (100 - d.drillTemp) / telemetry.heatPerS : dt;
      // Held grind is suppressed for exactly as long as the last bite already covered.
      const liveDt = biteDt > 0 ? 0 : Math.max(0, dt - paidAhead);
      const workDt = Math.max(0, Math.min(liveDt + biteDt, energyWindow, heatWindow));
      target.hp -= telemetry.effectiveDps * workDt;
      d.drillEnergy = Math.max(0, d.drillEnergy - telemetry.energyPerS * workDt);
      d.drillTemp = Math.min(100, d.drillTemp + telemetry.heatPerS * workDt);
      if (d.drillEnergy <= 0) d.energyDepleted = true;
      if (d.drillTemp >= 100) d.overheated = true;

      // Emit spark particles request
      this.bus.emit('drill:spark', {
        col: nc,
        row: nr,
        type: target.type,
        ore: target.ore,
        hpFrac: target.maxHp > 0 ? Math.max(0, target.hp / target.maxHp) : 0,
        bore: target.maxHp > 0 ? Math.max(0, Math.min(1, 1 - target.hp / target.maxHp)) : 1,
        bite: biteDt > 0,
        hardness: telemetry.hardness,
        energy: d.drillEnergy,
      });

      if (target.hp <= 0) {
        // Cleared!
        const wasVein = target.type === 'vein';
        const wasGas = target.type === 'gas';
        const wasType = target.type;
        const ore = target.ore;
        const yieldU = target.yieldU || 0;

        d.field[nc][nr] = EMPTY_TILE();
        // Persist immediately so a crash/retract mid-session still leaves the hole next visit.
        const rockEnt = this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
        if (rockEnt && rockEnt.data) recordClearedTile(rockEnt.data, nc, nr);
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        commitAvatarMove(d, nc, nr, cooldownVal);
        d.tilesCleared++;
        d.maxDepth = Math.max(d.maxDepth, nr);

        this.bus.emit('drill:break', {
          col: nc,
          row: nr,
          type: wasType,
          ore: ore || null,
          wasVein,
          wasGas,
        });

        if (wasVein && ore) {
          const budget = Number.isFinite(d.rockBudget) ? d.rockBudget : Infinity;
          if (budget <= 0) {
            // Rock played out: the vein tile clears, but it pays nothing until the rock recovers.
            // Surface (flight) mining can still destroy the rock normally.
            this.bus.emit('drill:rockDepleted', {
              asteroidId: d.asteroidId,
              budget: 0,
              commodityId: ore,
              pos: { col: nc, row: nr },
              text: 'Vein played out — this rock has no deep-core yield left.',
            });
            this.bus.emit('drill:warn', {
              text: 'Vein played out — this rock has no deep-core yield left.',
              reason: 'depleted',
              commodityId: ore,
              pos: { col: nc, row: nr },
            });
          } else {
            const avail = Math.min(yieldU, Math.floor(budget));
            const added = avail > 0 ? addCargo(this.state, ore, avail) : 0;
            if (added > 0) {
              d.yieldLog[ore] = (d.yieldLog[ore] || 0) + added;
              d.rockBudget = Math.max(0, budget - added);
              const ent = this.state.entities && this.state.entities.get(d.asteroidId);
              if (ent && ent.data && Number(d.rockBudgetMax) > 0) {
                ent.data.drillDepletion = clamp01((Number(ent.data.drillDepletion) || 0) + added / Number(d.rockBudgetMax));
                ent.data.lastDrillT = Number(this.state.simTime) || 0;
              }
              this.bus.emit('drill:yield', { commodityId: ore, qty: added, pos: { col: nc, row: nr } });
              if (Number.isFinite(d.rockBudget) && d.rockBudget <= 0 && Number(d.rockBudgetMax) > 0) {
                this.bus.emit('drill:rockDepleted', {
                  asteroidId: d.asteroidId,
                  budget: 0,
                  text: 'Rock deep-core yield exhausted for this visit.',
                });
              }
            } else if (avail > 0) {
              // Holds have volume free in percent, but this unit would not fit (or cargo writer
              // rejected it). Same player-facing "full" path so the wasted break is not silent.
              this.bus.emit('drill:cargoFull', {
                commodityId: ore, qty: avail, pos: { col: nc, row: nr },
              });
              this.bus.emit('drill:warn', {
                text: 'Cargo holds cannot take this ore — free volume is too tight or holds are full.',
                reason: 'cargoFull',
                commodityId: ore,
                pos: { col: nc, row: nr },
              });
            } else {
              this.bus.emit('drill:warn', {
                text: 'Vein played out — this rock has no deep-core yield left.',
                reason: 'depleted',
                commodityId: ore,
                pos: { col: nc, row: nr },
              });
            }
          }
        }

        if (wasGas) {
          d.gasHits++;
          const player = this.state.entities.get(this.state.playerId);
          if (player && player.hullMax > 0) {
            const dmg = Math.ceil(player.hullMax * (GAS_DAMAGE / 100));
            const packet = scalarHitToDamagePacket({
              damage: dmg,
              damageType: 'explosive',
              penetration: 1,
              shieldBypass: 0,
              source: { kind: 'deep_core_gas', asteroidId: d.asteroidId },
            });
            packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
            this._routeDamage({
              attackerId: null,
              targetId: this.state.playerId,
              packet,
              origin: { kind: 'deep_core_gas', asteroidId: d.asteroidId, col: nc, row: nr },
            });
            this.bus.emit('drill:gasHit', { dmg, pos: { col: nc, row: nr } });
            this.bus.emit('camera:shake', { amount: 0.5 });
          }
        }
      }
    }
  },

  _routeDamage(request) {
    const helpers = this.ctx && this.ctx.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') return helpers.routeCombatDamage(request);
    const combatSys = this.ctx?.registry?.get && this.ctx.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') return combatSys.ensureKernel().routeDamage(request);
    this.bus.emit('combat:routeDamage', request);
    return null;
  },

  getTargetTelemetry(col, row) {
    const d = this.state.drill;
    if (!d || col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    const tile = d.field[col][row];
    return { tile, ...extractionTelemetry(tile, this.getDrillDPS()) };
  },

  update(dt, state) {
    // Kept for registry interface compatibility
  },

  // Is a tile's hazard "revealed" (its tell visible) given the current cleared tiles? Gas tiles
  // show a faint discoloration when within GAS_TELL_RADIUS of a cleared tile, so an alert player
  // sees the danger before drilling into it. This is the legibility law (V2 §3) in miniature.
  isHazardRevealed(col, row) {
    const d = this.state.drill;
    if (!d) return false;
    for (let dc = -GAS_TELL_RADIUS; dc <= GAS_TELL_RADIUS; dc++) {
      for (let dr = -GAS_TELL_RADIUS; dr <= GAS_TELL_RADIUS; dr++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (d.field[c][r].type === 'empty') return true;
      }
    }
    return false;
  },

  // THE PRESENTATION VISIBILITY GATE — AND IT IS OPEN (design law §2.3, PQ-130.04).
  //
  // "No fog of war. Every cell's material is visible from the first frame. The strategy lives in
  // tunnel geometry, not information hiding. Deep exotics are visible even when your drill can't
  // reach them yet — visible aspiration is the upgrade advertisement."
  //
  // This query has exactly one job: telling presentation whether it may name a cell. Every caller
  // is a drawer or a readout (the works renderer, the cursor readout the screen shell feeds the
  // inspector, and the legacy 2D painter's context line), so opening it here removes fog everywhere
  // at once and cannot touch a sim value: no yield, hardness, tier gate, hazard, rock budget or
  // save field reads it, and none of them ever did.
  //
  // What stays untouched above: pulseScan() still sweeps SCAN_RADIUS and still writes
  // `tile.surveyed`. The pulse is now a cosmetic assay ping (law §2.3 permits exactly that) and its
  // marks remain the session record the drive checks assert against — it simply no longer decides
  // what a person is allowed to see.
  isTileSurveyed(col, row) {
    const d = this.state.drill;
    if (!d || col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    return true;
  },

  // Deterministic mulberry32 RNG seeded by the asteroid id — same id, same field, every visit.
  _seededRng(seed) {
    return seededDrillRng(seed);
  },
};

export const DRILL_CONST = {
  COLS,
  ROWS,
  TILE,
  MOVE_HOLD_DELAY_S,
  MOVE_CRUISE_INTERVAL_S,
  MOVE_COOLDOWN_BASE,
  MOVE_COOLDOWN_CARGO,
  BORE_BITE_S,
  BORE_BITE_HOLD_S,
  SCAN_RADIUS,
  SCAN_COOLDOWN_S,
  SCAN_ACTIVE_S,
  DRILL_ENERGY_MAX,
  DRILL_ENERGY_RECOVERY,
  DRILL_ENERGY_RESUME,
  DRILL_HEAT_COOLING,
};
