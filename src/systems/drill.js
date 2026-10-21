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
export const GAS_TELL_RADIUS = 2; // tiles — gas is hinted within this radius of a cleared tile
export const DRILL_ENERGY_MAX = 100;
export const DRILL_ENERGY_RECOVERY = 28;
export const DRILL_ENERGY_RESUME = 24;
export const DRILL_HEAT_COOLING = 36;
/** Overheat clears at this head temperature. Shared by recovery and the commitment copy. */
export const DRILL_HEAT_RESUME = 10;
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
// A full hold must not chew the same vein again on the next cruise beat. This is the same
// throttle the tier warning already uses, and it is a retry — not a blacklist.
export const DRILL_CARGO_FULL_RETRY_S = 1.2;

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

// Bore charges — controlled demolition as the rig's third verb (bore, build, blast). A charge is
// a paid, planted, FUSED cut: the board quotes the whole 3×3 verdict before the credit leaves the
// wallet, and the fuse buys exactly enough drill-clock time to step out of the pattern. It is
// deliberately cruder than the bore — it banks a fraction of each vein it eats (the rubble keeps
// the rest), cooks off every gas pocket in the pattern at once, and backblasts a rig still
// standing in the cut. What it buys is nine cells at once: hall-carving for machine rooms, and a
// priced answer to rock that is legal but slow.
export const CHARGE_FUSE_S = 1.4;         // planted -> detonation, on the drill clock
export const CHARGE_REARM_S = 1.6;        // dead time after a blast before the next can be set
export const CHARGE_COST_CR = 180;        // per shot, through the economy:chargeCredits seam
export const CHARGE_YIELD_FRACTION = 0.6; // crude extraction — the rubble keeps the rest
export const CHARGE_BACKBLAST_PCT = 10;   // hull % when the rig is still in the pattern
export const CHARGE_BLAST_RADIUS = 1;     // cells — a 3×3 cut that always quotes the rig's own square
export const CHARGE_SHAPE_LEN = 5;        // cells — the shaped charge's corridor
export const CHARGE_SEISMIC_RADIUS = 2;  // cells — a 5×5 fracture field

// One armed verb, four payloads. Cost is the credit price when the press has no stock on the
// rock; the preview reports which purse pays. `harms` marks a payload whose pattern can still
// bite the rig — venting and seismic shots are safe to stand next to.
export const CHARGE_PAYLOADS = {
  blast:   { label: 'Blast charge',   cost: CHARGE_COST_CR, harms: true,  fuse: CHARGE_FUSE_S },
  shape:   { label: 'Shaped charge',  cost: 120,            harms: true,  fuse: CHARGE_FUSE_S },
  vent:    { label: 'Venting charge', cost: 90,             harms: false, fuse: 0.9 },
  seismic: { label: 'Seismic charge', cost: 140,            harms: false, fuse: 1.1 },
};
export const CHARGE_PAYLOAD_ORDER = ['blast', 'shape', 'vent', 'seismic'];

// Roof mechanics. A corridor is safe — its ceiling rests on walls one row up. A HALL (a run of
// empties with open headroom above it) is not: widen one past the warn span and the roof cells
// crack; keep widening while cracks stand and the whole beam drops into the hall as rubble.
export const CAVE_SPAN_WARN = 5;    // empties in a run before the roof takes notice
export const CAVE_HEADROOM_MIN = 3; // columns of open air above the run that make it a hall
export const CAVE_SPAN_FALL = 6;    // a cracked hall widened to this span drops its roof
export const CAVE_BEAM_SCAN = 8;    // rows of open air a roof beam may hide behind
export const CAVE_IN_PCT = 15;      // hull % when the fall lands on the rig

export const EMPTY_TILE = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
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
  // A re-cleared cell cannot still be rubble or a standing fault — the three lists are
  // mutually exclusive and the empty tile needs no flags.
  for (const key of ['drillRubble', 'drillFaults']) {
    if (Array.isArray(d[key])) d[key] = d[key].filter((i) => Math.trunc(Number(i)) !== idx);
  }
}

// Flag lists keep the geometry registry (`drillCleared`) honest: a vented seam is still an
// empty cell, a scar is still an empty cell, a fault is still solid. Rubbles are the exception —
// a fallen cell is solid again, so it must leave `drillCleared` entirely.
function flagTile(data, key, col, row) {
  const d = ensureAsteroidDeepCore(data);
  if (!d) return;
  const idx = tileIndex(col, row);
  if (idx < 0 || idx >= COLS * ROWS) return;
  if (!Array.isArray(d[key])) d[key] = [];
  if (!d[key].includes(idx)) d[key].push(idx);
}

function recordVentedTile(data, col, row) { flagTile(data, 'drillVented', col, row); }
function recordScarredTile(data, col, row) { flagTile(data, 'drillScars', col, row); }
function recordFaultedTile(data, col, row) { flagTile(data, 'drillFaults', col, row); }
function recordRubbleTile(data, col, row) {
  const d = ensureAsteroidDeepCore(data);
  if (!d) return;
  const idx = tileIndex(col, row);
  if (idx < 0 || idx >= COLS * ROWS) return;
  flagTile(d, 'drillRubble', col, row);
  for (const key of ['drillCleared', 'drillVented', 'drillScars', 'drillFaults']) {
    if (Array.isArray(d[key])) d[key] = d[key].filter((i) => Math.trunc(Number(i)) !== idx);
  }
}

// Fallen ceiling material — soft fill the auger has to chew a second time. It is 'dirt' so the
// extractor's silicate contact law applies unchanged; `rubble` marks it for the renderers.
const RUBBLE_TILE = () => ({ type: 'dirt', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 0.4, rubble: true });

// One fracture body for both sources: the generator's fault planes and the seismic charge. The
// tile stays standing — it just stops arguing with the auger.
function fractureTile(tile) {
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

function writeVeinRemainder(data, col, row, yieldU, ore) {
  const d = ensureAsteroidDeepCore(data);
  if (!d) return;
  const idx = tileIndex(col, row);
  if (idx < 0 || idx >= COLS * ROWS) return;
  const list = Array.isArray(d.drillVeinRemainders) ? d.drillVeinRemainders : [];
  const next = [];
  for (const rec of list) {
    if (!rec || Math.trunc(Number(rec.idx)) === idx) continue;
    next.push(rec);
  }
  const qty = Math.floor(Number(yieldU) || 0);
  if (qty > 0) next.push({ idx, yieldU: qty, ore: ore || null });
  d.drillVeinRemainders = next;
}

/** Reapply unaccepted vein yield after the seeded field is rebuilt. Cleared holes stay empty. */
export function applyVeinRemainders(field, remainders) {
  if (!field || !Array.isArray(remainders)) return;
  for (const rec of remainders) {
    if (!rec) continue;
    const idx = Math.trunc(Number(rec.idx));
    const yieldU = Math.floor(Number(rec.yieldU) || 0);
    if (!Number.isFinite(idx) || idx < 0 || idx >= COLS * ROWS || yieldU <= 0) continue;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const tile = field[col] && field[col][row];
    if (!tile || tile.type !== 'vein') continue;
    tile.yieldU = yieldU;
    if (rec.ore) {
      tile.ore = rec.ore;
      tile.tierReq = drillTierReqForOre(rec.ore);
    }
  }
}

/**
 * Pay a broken vein through the cargo writer before the hole is committed.
 * Returns 'preserve' when unaccepted ore is still on this cell, otherwise 'clear'.
 */
function settleVeinYield(host, d, rockEnt, target, col, row, ore, yieldU) {
  const budget = Number.isFinite(d.rockBudget) ? d.rockBudget : Infinity;
  if (budget <= 0) {
    host.bus.emit('drill:rockDepleted', {
      asteroidId: d.asteroidId,
      budget: 0,
      commodityId: ore,
      pos: { col, row },
      text: 'Vein played out — this rock has no deep-core yield left.',
    });
    host.bus.emit('drill:warn', {
      text: 'Vein played out — this rock has no deep-core yield left.',
      reason: 'depleted',
      commodityId: ore,
      pos: { col, row },
    });
    if (rockEnt && rockEnt.data) writeVeinRemainder(rockEnt.data, col, row, 0);
    return 'clear';
  }

  // Pay only whole units this visit can cover. A refused bite keeps the rest of the vein,
  // including ore above this visit's budget — that tail is still in the rock, not destroyed.
  const wholeYield = Math.max(0, Math.floor(Number(yieldU) || 0));
  const avail = Math.min(wholeYield, Math.floor(budget));
  const added = avail > 0 ? addCargo(host.state, ore, avail) : 0;
  const rejected = Math.max(0, avail - added);
  const remain = Math.max(0, wholeYield - added);
  if (added > 0) {
    d.yieldLog[ore] = (d.yieldLog[ore] || 0) + added;
    if (Number.isFinite(d.rockBudget)) d.rockBudget = Math.max(0, budget - added);
    const entData = rockEnt && rockEnt.data;
    if (entData && Number(d.rockBudgetMax) > 0 && Number.isFinite(d.rockBudget)) {
      entData.drillDepletion = clamp01((Number(entData.drillDepletion) || 0) + added / Number(d.rockBudgetMax));
      entData.lastDrillT = Number(host.state.simTime) || 0;
    }
    host.bus.emit('drill:yield', { commodityId: ore, qty: added, pos: { col, row } });
    if (Number.isFinite(d.rockBudget) && d.rockBudget <= 0 && Number(d.rockBudgetMax) > 0) {
      host.bus.emit('drill:rockDepleted', {
        asteroidId: d.asteroidId,
        budget: 0,
        text: 'Rock deep-core yield exhausted for this visit.',
      });
    }
  }
  if (rejected > 0) {
    target.type = 'vein';
    target.ore = ore;
    target.yieldU = remain;
    const restoredHp = Math.max(1, Number(target.maxHp) || 1);
    target.hp = restoredHp;
    target.maxHp = restoredHp;
    if (rockEnt && rockEnt.data) writeVeinRemainder(rockEnt.data, col, row, remain, ore);
    d.remainderHold = DRILL_CARGO_FULL_RETRY_S;
    d.remainderAt = { col, row };
    d.moveCooldown = DRILL_CARGO_FULL_RETRY_S;
    d.avatar.isDrilling = true;
    d.avatar.drillTarget = { col, row };
    d.avatar.drillBlocked = false;
    host.bus.emit('drill:cargoFull', {
      commodityId: ore, qty: remain, pos: { col, row },
    });
    host.bus.emit('drill:warn', {
      text: 'Cargo holds cannot take this ore — free volume is too tight or holds are full.',
      reason: 'cargoFull',
      commodityId: ore,
      pos: { col, row },
    });
    return 'preserve';
  }
  if (avail <= 0) {
    host.bus.emit('drill:warn', {
      text: 'Vein played out — this rock has no deep-core yield left.',
      reason: 'depleted',
      commodityId: ore,
      pos: { col, row },
    });
  }
  if (rockEnt && rockEnt.data) writeVeinRemainder(rockEnt.data, col, row, 0);
  return 'clear';
}

/**
 * Pay a blast-eaten vein. Cruder than the bore: the rock gives up the whole remaining cut, but
 * only CHARGE_YIELD_FRACTION of it lands in the hold — the rubble keeps the rest. Ore the holds
 * cannot take is lost outright: a blast has no "preserve the vein" answer because the cell is
 * already gone. Returns the units banked.
 */
function settleBlastYield(host, d, rockEnt, col, row, ore, yieldU) {
  const budget = Number.isFinite(d.rockBudget) ? d.rockBudget : Infinity;
  const wholeYield = Math.max(0, Math.floor(Number(yieldU) || 0));
  const avail = Math.min(wholeYield, Math.floor(budget));
  if (rockEnt && rockEnt.data) writeVeinRemainder(rockEnt.data, col, row, 0);
  if (avail <= 0) return 0;
  const offer = Math.max(1, Math.floor(avail * CHARGE_YIELD_FRACTION));
  const added = offer > 0 ? addCargo(host.state, ore, offer) : 0;
  if (Number.isFinite(d.rockBudget)) d.rockBudget = Math.max(0, budget - avail);
  const entData = rockEnt && rockEnt.data;
  if (entData && Number(d.rockBudgetMax) > 0 && Number.isFinite(d.rockBudget)) {
    entData.drillDepletion = clamp01((Number(entData.drillDepletion) || 0) + avail / Number(d.rockBudgetMax));
    entData.lastDrillT = Number(host.state.simTime) || 0;
  }
  if (added > 0) {
    d.yieldLog[ore] = (d.yieldLog[ore] || 0) + added;
    host.bus.emit('drill:yield', { commodityId: ore, qty: added, pos: { col, row }, via: 'blast' });
  }
  const spilled = Math.max(0, offer - added);
  if (spilled > 0) {
    host.bus.emit('drill:cargoFull', { commodityId: ore, qty: spilled, pos: { col, row }, via: 'blast' });
    host.bus.emit('drill:warn', {
      text: 'Blasted ore lost — the holds could not take it.',
      reason: 'cargoFull',
      commodityId: ore,
      pos: { col, row },
    });
  }
  if (Number.isFinite(d.rockBudget) && d.rockBudget <= 0 && Number(d.rockBudgetMax) > 0) {
    host.bus.emit('drill:rockDepleted', {
      asteroidId: d.asteroidId,
      budget: 0,
      text: 'Rock deep-core yield exhausted for this visit.',
    });
  }
  return added;
}

function chargeRefusalText(reason, cost = CHARGE_COST_CR) {
  switch (reason) {
    case 'armed': return 'A charge is already cooking — stand clear.';
    case 'cooldown': return 'The boom arm is still retracting.';
    case 'credits': return `A bore charge is ${cost} credits — the wallet is short.`;
    case 'empty': return 'Nothing to break there — the cut is already hollow.';
    case 'range': return 'The boom arm only reaches the faces beside the rig.';
    default: return 'The charge refuses to seat.';
  }
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

function recoverRig(d, dt) {
  d.drillTemp = Math.max(0, d.drillTemp - DRILL_HEAT_COOLING * dt);
  d.drillEnergy = Math.min(DRILL_ENERGY_MAX, d.drillEnergy + DRILL_ENERGY_RECOVERY * dt);
  if (d.overheated && d.drillTemp <= DRILL_HEAT_RESUME) d.overheated = false;
  if (d.energyDepleted && d.drillEnergy >= DRILL_ENERGY_RESUME) d.energyDepleted = false;
}

export function drillHeatLimitCopy() {
  return `Drill cooling down — cool the bit. It cuts again once heat falls to ${DRILL_HEAT_RESUME}.`;
}

export function drillEnergyLimitCopy() {
  return `Wait for energy — rig capacitor recharging. It resumes at ${DRILL_ENERGY_RESUME}.`;
}

export function cargoFreeUnits(cargo) {
  if (!cargo || !(Number(cargo.capVolume) > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(Number(cargo.capVolume) - (Number(cargo.usedVolume) || 0)));
}

const COMMITMENT_DIRS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([-1, 0]),
  Object.freeze([0, 1]), Object.freeze([0, -1]),
]);
const COMMITMENT_FACE = Object.freeze({
  left: Object.freeze([-1, 0]),
  right: Object.freeze([1, 0]),
  up: Object.freeze([0, -1]),
  down: Object.freeze([0, 1]),
});

function commitmentBlank() {
  return { type: null, ore: null, yieldU: null, tierReq: null, risk: null };
}

function fieldSize(field) {
  const cols = Array.isArray(field) ? field.length : 0;
  const rows = cols && Array.isArray(field[0]) ? field[0].length : 0;
  return { cols, rows };
}

function cellAt(field, col, row, cols, rows) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const column = field[col];
  return column ? column[row] || null : null;
}

function isEmptyCell(field, col, row, cols, rows) {
  const tile = cellAt(field, col, row, cols, rows);
  return !!tile && tile.type === 'empty';
}

function isTraversableCell(field, col, row, cols, rows) {
  const tile = cellAt(field, col, row, cols, rows);
  return !!tile && tile.type === 'empty' && !tile.structure;
}

function clearedNear(field, col, row, cols, rows) {
  for (let dc = -GAS_TELL_RADIUS; dc <= GAS_TELL_RADIUS; dc++) {
    for (let dr = -GAS_TELL_RADIUS; dr <= GAS_TELL_RADIUS; dr++) {
      if (isEmptyCell(field, col + dc, row + dr, cols, rows)) return true;
    }
  }
  return false;
}

function dilateCleared(field, cols, rows) {
  const near = new Uint8Array(cols * rows);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!isEmptyCell(field, c, r, cols, rows)) continue;
      for (let dc = -GAS_TELL_RADIUS; dc <= GAS_TELL_RADIUS; dc++) {
        for (let dr = -GAS_TELL_RADIUS; dr <= GAS_TELL_RADIUS; dr++) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          near[nr * cols + nc] = 1;
        }
      }
    }
  }
  return near;
}

/**
 * What the decision view may say about one cell.
 * Survey marks and the gas tell are the only evidence. Unscanned ore and yield stay off the result.
 * This does not close the works-board visibility gate (`isTileSurveyed` stays open for PQ-130).
 */
export function drillCellEvidence(field, col, row, nearCleared) {
  const { cols, rows } = fieldSize(field);
  const c = Math.trunc(col);
  const r = Math.trunc(row);
  if (c < 0 || r < 0 || c >= cols || r >= rows) {
    return { kind: 'boundary', ...commitmentBlank() };
  }
  const tile = cellAt(field, c, r, cols, rows);
  if (!tile) return { kind: 'unrevealed', ...commitmentBlank() };
  if (tile.type === 'empty') return {
    kind: 'open', type: 'empty', ore: null, yieldU: null, tierReq: null, risk: null,
    cave: !!tile.cave, vented: !!tile.vented, scar: !!tile.scar,
  };
  if (tile.surveyed) {
    const vein = tile.type === 'vein' && tile.ore;
    return {
      kind: 'known',
      type: tile.type,
      ore: vein ? tile.ore : null,
      yieldU: vein ? Math.max(0, Math.floor(Number(tile.yieldU) || 0)) : null,
      tierReq: vein ? tile.tierReq ?? drillTierReqForOre(tile.ore) : null,
      risk: tile.risk || null,
      stratum: tile.stratum || null,
      fault: !!tile.fault,
      rich: !!tile.rich,
      cracked: !!tile.cracked,
      rubble: !!tile.rubble,
    };
  }
  const told = nearCleared
    ? nearCleared[r * cols + c] === 1
    : clearedNear(field, c, r, cols, rows);
  if (tile.type === 'gas' && told) return { kind: 'suspected-gas', ...commitmentBlank() };
  // A crack is a live warning, not a survey fact — it surfaces even on rock never assayed.
  return { kind: 'unrevealed', ...commitmentBlank(), cracked: !!tile.cracked, fault: !!tile.fault };
}

/** Cable points that are still open tunnel. A solid or unknown cell is dropped, not drawn through. */
export function visibleCablePoints(trail, field) {
  if (!Array.isArray(trail) || !field) return [];
  const { cols, rows } = fieldSize(field);
  const out = [];
  for (const pt of trail) {
    if (!pt) continue;
    const col = Math.trunc(pt.col);
    const row = Math.trunc(pt.row);
    if (!isTraversableCell(field, col, row, cols, rows)) continue;
    out.push({ col, row });
  }
  return out;
}

/** Shortest walk back to the surface shaft through empty cells only. Never steps on rock, ore, or gas. */
export function knownReturnPath(field, col, row) {
  const { cols, rows } = fieldSize(field);
  const startCol = Math.trunc(col);
  const startRow = Math.trunc(row);
  if (!isTraversableCell(field, startCol, startRow, cols, rows) || cols <= 0 || rows <= 0) return [];
  const entryCol = Math.floor(cols / 2);
  const entryRow = 0;
  const here = { col: startCol, row: startRow };
  if (!isTraversableCell(field, entryCol, entryRow, cols, rows)) return [here];
  const start = startRow * cols + startCol;
  const target = entryRow * cols + entryCol;
  if (start === target) return [here];
  const prev = new Int32Array(cols * rows);
  prev.fill(-2);
  prev[start] = -1;
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  let found = false;
  while (head < tail) {
    const idx = queue[head++];
    if (idx === target) { found = true; break; }
    const c = idx % cols;
    const r = (idx - c) / cols;
    for (let i = 0; i < COMMITMENT_DIRS.length; i++) {
      const nc = c + COMMITMENT_DIRS[i][0];
      const nr = r + COMMITMENT_DIRS[i][1];
      if (!isTraversableCell(field, nc, nr, cols, rows)) continue;
      const next = nr * cols + nc;
      if (prev[next] !== -2) continue;
      prev[next] = idx;
      queue[tail++] = next;
    }
  }
  if (!found) return [here];
  const path = [];
  let cur = target;
  while (cur !== -1) {
    path.push({ col: cur % cols, row: Math.floor(cur / cols) });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

function neighborIsEmpty(field, col, row, cols, rows) {
  for (let i = 0; i < COMMITMENT_DIRS.length; i++) {
    if (isEmptyCell(field, col + COMMITMENT_DIRS[i][0], row + COMMITMENT_DIRS[i][1], cols, rows)) return true;
  }
  return false;
}

/**
 * The next drilling commitment from facts the pilot already has: surveyed ore, a gas tell,
 * a tier the bit cannot cut, and the cleared walk home. Unscanned cells contribute nothing —
 * no ore id, no yield, no promise.
 */
export function deriveDrillCommitment(session, opts = {}) {
  const field = session && session.field;
  const avatar = session && session.avatar;
  if (!field || !avatar) return null;
  const { cols, rows } = fieldSize(field);
  if (cols <= 0 || rows <= 0) return null;
  const tier = Math.max(1, Math.trunc(Number(opts.tier) || 1));
  const cargoFree = opts.cargoFree == null ? Number.POSITIVE_INFINITY : Number(opts.cargoFree);
  const near = dilateCleared(field, cols, rows);
  const ac = Math.trunc(avatar.col);
  const ar = Math.trunc(avatar.row);
  const face = COMMITMENT_FACE[avatar.faceDir] || COMMITMENT_FACE.down;
  const fc = ac + face[0];
  const fr = ar + face[1];
  const evidence = (fc < 0 || fr < 0 || fc >= cols || fr >= rows)
    ? { kind: 'boundary', ...commitmentBlank() }
    : drillCellEvidence(field, fc, fr, near);
  const facing = {
    col: fc,
    row: fr,
    evidence: evidence.kind,
    type: evidence.type,
    ore: evidence.ore,
    yieldU: evidence.yieldU,
    tierReq: evidence.tierReq,
    blocked: evidence.kind === 'known' && evidence.type === 'vein' && (evidence.tierReq || 1) > tier,
    risk: evidence.risk,
  };
  const suspectedGas = [];
  const veins = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cell = drillCellEvidence(field, c, r, near);
      if (cell.kind === 'suspected-gas') {
        suspectedGas.push({ col: c, row: r });
        continue;
      }
      if (cell.kind !== 'known' || cell.type !== 'vein' || !cell.ore) continue;
      if (!neighborIsEmpty(field, c, r, cols, rows)) continue;
      veins.push({
        col: c,
        row: r,
        ore: cell.ore,
        yieldU: cell.yieldU,
        tierReq: cell.tierReq,
        blocked: (cell.tierReq || 1) > tier,
        risk: cell.risk || 'low',
      });
    }
  }
  veins.sort((a, b) => a.row - b.row || a.col - b.col);
  const nearby = veins[0] || null;
  let deeper = veins.length > 1 ? veins[veins.length - 1] : null;
  if (deeper && nearby && deeper.col === nearby.col && deeper.row === nearby.row) deeper = null;
  const energyBlocked = !!(session.energyDepleted) || Number(session.drillEnergy) <= 0;
  const heatBlocked = !!(session.overheated) || Number(session.drillTemp) >= 100;
  const limit = energyBlocked && heatBlocked ? 'both' : energyBlocked ? 'energy' : heatBlocked ? 'heat' : null;
  const cargoBlocked = Number.isFinite(cargoFree) && cargoFree <= 0;
  const depleted = Number.isFinite(session.rockBudget)
    && session.rockBudget <= 0
    && Number(session.rockBudgetMax) > 0;
  const holds = facing.ore ? Math.max(0, Math.floor(Number(facing.yieldU) || 0)) : 0;
  return {
    facing,
    nearby,
    deeper,
    suspectedGas,
    returnPath: knownReturnPath(field, ac, ar),
    limit,
    energyResume: DRILL_ENERGY_RESUME,
    heatResume: DRILL_HEAT_RESUME,
    cargoFree: Number.isFinite(cargoFree) ? cargoFree : null,
    cargoBlocked,
    depleted,
    cargoGrant: holds > 0 && !facing.blocked && !depleted && !cargoBlocked && !limit,
  };
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
    chargesSet: Number(d.chargesSet) || 0,
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
    // A partial bite is not a cleared hole. The seed would otherwise put the original yield back.
    applyVeinRemainders(field, data && data.drillVeinRemainders);
    // Layered flags: vented seams and blast scars live on cleared holes, and rubble lands after
    // them so a stale cleared entry can never erase a collapse. Seismic faults go last so a shot
    // that softened standing rubble stays softened — the live order was fracture-then-bury too.
    applyFlaggedTiles(field, data && data.drillVented, (t) => { if (t.type === 'empty') t.vented = true; });
    applyFlaggedTiles(field, data && data.drillScars, (t) => { if (t.type === 'empty') t.scar = true; });
    applyRubbleTiles(field, data && data.drillRubble);
    applyFlaggedTiles(field, data && data.drillFaults, (t) => { if (t.type !== 'empty') fractureTile(t); });

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
      chargeArmed: false,     // the demolition verb is being aimed (R)
      chargePayload: 'blast', // the rack the armed verb will seat — blast/shape/vent/seismic
      chargeStock: 0,         // pucks on the rock (press-made); stock is spent before credits
      chargeAim: null,        // pointer-named anchor cell, re-validated on every use
      charge: null,           // { col, row, fuse } once set — cooks off on the drill clock
      chargeCooldown: 0,      // re-arm dead time after a blast
      chargesSet: 0,          // session count — the receipt knows how loud this visit got
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
    // A paid charge is never lost to a retract: it cooks off as the rig comes home, against the
    // field exactly as it stands. The blast owns the cells; the receipt still names the exit.
    if (d.charge) this._detonateCharge(d);
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

    // Session budget is already richness-scaled. Storing 1 - budget/max would scale it again
    // on the next begin. Depletion moves only when cargo accepts units, inside the bite.
    if (Number.isFinite(d.rockBudget) && Number(d.rockBudgetMax) > 0) {
      data.drillYieldMax = Math.max(1, Math.floor(Number(d.rockBudgetMax) || 0));
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

  // ---------- bore charges: the demolition verb ----------
  //
  // Where the charge would sit: the pointer's pick when it names a face the boom can reach,
  // otherwise the cell the auger already faces. Either way the rig's own square is inside the
  // quoted cut — stand in it when the fuse ends and the blast takes the rig too.
  chargeAnchor() {
    const d = this.state.drill;
    if (!d || !d.avatar) return null;
    const aim = d.chargeAim;
    if (aim && Number.isFinite(aim.col) && Number.isFinite(aim.row)
        && Math.abs(aim.col - d.avatar.col) <= 1 && Math.abs(aim.row - d.avatar.row) <= 1
        && (aim.col !== d.avatar.col || aim.row !== d.avatar.row)) {
      return { col: aim.col, row: aim.row };
    }
    const dv = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d.avatar.faceDir || 'down'] || [0, 1];
    return { col: d.avatar.col + dv[0], row: d.avatar.row + dv[1] };
  },

  // The cells a payload touches. `shape` runs away from the rig along the anchor direction —
  // plant on a face, bore a corridor. Everything else centers on the anchor.
  _chargePattern(anchor, payload) {
    if (!anchor) return [];
    const d = this.state.drill;
    const cells = [];
    const push = (col, row) => {
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) cells.push({ col, row });
    };
    if (payload === 'shape') {
      const av = d.avatar || { col: anchor.col, row: anchor.row };
      let dx = Math.sign(anchor.col - av.col);
      let dy = Math.sign(anchor.row - av.row);
      if (dx !== 0 && dy !== 0) { if (Math.abs(anchor.col - av.col) >= Math.abs(anchor.row - av.row)) dy = 0; else dx = 0; }
      if (dx === 0 && dy === 0) dy = 1;
      for (let i = 0; i < CHARGE_SHAPE_LEN; i++) push(anchor.col + dx * i, anchor.row + dy * i);
      return cells;
    }
    const radius = payload === 'seismic' ? CHARGE_SEISMIC_RADIUS : CHARGE_BLAST_RADIUS;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) push(anchor.col + dc, anchor.row + dr);
    }
    return cells;
  },

  // Stock lives on the asteroid — charges a press fabricates stay on this rock between visits.
  chargeStockCount() {
    const d = this.state.drill;
    const ent = d && this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
    const entStock = ent && ent.data ? Number(ent.data.chargeStock) : NaN;
    if (Number.isFinite(entStock)) return Math.max(0, Math.floor(entStock));
    return d ? Math.max(0, Math.floor(Number(d.chargeStock) || 0)) : 0;
  },

  _spendChargeStock(d) {
    const ent = this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
    if (ent && ent.data && Number(ent.data.chargeStock) > 0) {
      ent.data.chargeStock = Math.max(0, Math.floor(Number(ent.data.chargeStock)) - 1);
      return true;
    }
    if (Number(d.chargeStock) > 0) {
      d.chargeStock = Math.max(0, Math.floor(Number(d.chargeStock)) - 1);
      return true;
    }
    return false;
  },

  // What a blasted vein would bank — the quote the board shows before the credit moves.
  _blastYieldQuote(d, yieldU) {
    const budget = Number.isFinite(d.rockBudget) ? d.rockBudget : Infinity;
    const avail = Math.min(Math.max(0, Math.floor(Number(yieldU) || 0)), Math.floor(budget));
    return avail > 0 ? Math.max(1, Math.floor(avail * CHARGE_YIELD_FRACTION)) : 0;
  },

  // The pattern the charge would touch, clipped to the field, every cell carrying its verdict —
  // the permanent consequence previewed at decision time (design law), not a surprise on the far
  // side of the fuse. `ok`/`reason` is also the plant gate, so the quote can never lie.
  chargePreview() {
    const d = this.state.drill;
    if (!d || !d.active) return { ok: false, reason: 'inactive', anchor: null, cells: [] };
    const anchor = this.chargeAnchor();
    const payload = CHARGE_PAYLOADS[d.chargePayload] ? d.chargePayload : 'blast';
    const def = CHARGE_PAYLOADS[payload];
    const tier = this.getDrillTier();
    const credits = Number(this.state.player && this.state.player.credits) || 0;
    const stock = this.chargeStockCount();
    const cost = stock > 0 ? 0 : def.cost;
    const cells = [];
    const yields = {};
    let willBreak = 0, gasCount = 0, ventCount = 0, softenCount = 0, tierBlocked = 0, structureBlocked = 0;
    for (const { col, row } of this._chargePattern(anchor, payload)) {
      const tile = d.field[col] && d.field[col][row];
      // Machine housing is stamped on HOLLOW cells — check the stamp first, or the empty
      // test below swallows every machine in the cut.
      if (tile && tile.structure) {
        structureBlocked++;
        cells.push({ col, row, type: tile.type, verdict: 'structure' });
        continue;
      }
      if (!tile || tile.type === 'empty') {
        cells.push({ col, row, type: 'empty', verdict: 'void' });
        continue;
      }
      if (payload === 'vent') {
        // Venting charge: pockets open into seams, every other cell is simply passed over.
        if (tile.type === 'gas') {
          ventCount++;
          gasCount++;
          cells.push({ col, row, type: 'gas', verdict: 'vent' });
        } else {
          cells.push({ col, row, type: tile.type, verdict: 'spare', ore: tile.ore || null });
        }
        continue;
      }
      if (payload === 'seismic') {
        softenCount++;
        cells.push({ col, row, type: tile.type, verdict: 'soften', ore: tile.ore || null, fault: !!tile.fault, rich: !!tile.rich });
        continue;
      }
      if ((tile.tierReq || 1) > tier) {
        tierBlocked++;
        cells.push({ col, row, type: tile.type, verdict: 'tier', ore: tile.ore || null, tierReq: tile.tierReq });
        continue;
      }
      const verdict = tile.type === 'gas' ? 'gas' : 'break';
      if (verdict === 'gas') gasCount++;
      willBreak++;
      cells.push({ col, row, type: tile.type, verdict, ore: tile.ore || null, fault: !!tile.fault, rich: !!tile.rich });
      if (tile.type === 'vein' && tile.ore) {
        const take = this._blastYieldQuote(d, tile.yieldU);
        if (take > 0) yields[tile.ore] = (yields[tile.ore] || 0) + take;
      }
    }
    const inBounds = !!(anchor && anchor.col >= 0 && anchor.col < COLS && anchor.row >= 0 && anchor.row < ROWS);
    let reason = null;
    if (!inBounds) reason = 'range';
    else if (d.charge) reason = 'armed';
    else if (d.chargeCooldown > 0) reason = 'cooldown';
    else if (payload === 'vent' ? ventCount === 0 : payload === 'seismic' ? softenCount === 0 : willBreak === 0) reason = 'empty';
    else if (stock === 0 && credits < cost) reason = 'credits';
    // Danger = the rig's square inside or beside the kill pattern. Vent/seismic never hurt.
    const selfDanger = def.harms && cells.some((c) => Math.abs(c.col - d.avatar.col) <= 1
      && Math.abs(c.row - d.avatar.row) <= 1);
    return {
      ok: reason === null,
      reason,
      anchor,
      payload,
      payloadLabel: def.label,
      cost,
      fromStock: stock > 0,
      stock,
      cells,
      breakCount: willBreak,
      gasCount,
      ventCount,
      softenCount,
      tierBlocked,
      // Housing inside the cut survives the blast — the bracket names it, the charge still seats.
      structureSurvives: structureBlocked,
      yields,
      selfDanger,
    };
  },

  armCharge() {
    const d = this.state.drill;
    if (!d || !d.active) return false;
    if (d.charge || d.chargeCooldown > 0) return false;
    if (!d.chargeArmed) {
      d.chargeArmed = true;
      this.bus.emit('drill:chargeArm', { armed: true });
    }
    return true;
  },

  disarmCharge() {
    const d = this.state.drill;
    if (!d || !d.chargeArmed) return false;
    d.chargeArmed = false;
    d.chargeAim = null;
    this.bus.emit('drill:chargeArm', { armed: false });
    return true;
  },

  setChargeAim(col, row) {
    const d = this.state.drill;
    if (!d || !d.avatar) return;
    const c = Math.trunc(Number(col));
    const r = Math.trunc(Number(row));
    const reach = Number.isFinite(c) && Number.isFinite(r)
      && Math.abs(c - d.avatar.col) <= 1 && Math.abs(r - d.avatar.row) <= 1
      && (c !== d.avatar.col || r !== d.avatar.row);
    d.chargeAim = reach ? { col: c, row: r } : null;
  },

  // Q while armed — walk the payload rack. The preview re-quotes immediately; nothing is free
  // to change silently.
  cycleChargePayload() {
    const d = this.state.drill;
    if (!d || !d.active || !d.chargeArmed) return null;
    const idx = CHARGE_PAYLOAD_ORDER.indexOf(d.chargePayload);
    d.chargePayload = CHARGE_PAYLOAD_ORDER[(idx + 1) % CHARGE_PAYLOAD_ORDER.length] || 'blast';
    this.bus.emit('drill:chargeArm', { armed: true, payload: d.chargePayload });
    return d.chargePayload;
  },

  // The commit half of the verb. Everything the shot will do is already bracketed on the board —
  // this spends the puck (site stock first, then the wallet) and starts the fuse.
  plantCharge() {
    const d = this.state.drill;
    if (!d || !d.active) return false;
    const preview = this.chargePreview();
    if (!preview.ok) {
      this.bus.emit('drill:warn', {
        reason: 'charge',
        chargeReason: preview.reason,
        text: chargeRefusalText(preview.reason, preview.cost),
        pos: preview.anchor ? { col: preview.anchor.col, row: preview.anchor.row } : null,
      });
      return false;
    }
    const { col, row } = preview.anchor;
    const payload = preview.payload;
    const fuseS = (CHARGE_PAYLOADS[payload] || CHARGE_PAYLOADS.blast).fuse;
    if (!this._spendChargeStock(d)) {
      // Ordnance money moves through the economy seam like every other spend (bombs.js:
      // 'ordnance:<id>'). Where no economy is listening the shot is simply free — a sandbox
      // without a wallet is no reason to refuse the verb.
      this.bus.emit('economy:chargeCredits', {
        amount: preview.cost,
        reason: 'ordnance:bore_charge',
        sink: 'ordnance',
        cause: `bore_charge:${payload}`,
        pos: { col, row },
      });
    }
    // The footprint is fixed at seat time — a planted charge cannot re-aim itself. `_chargePattern`
    // derives `shape`'s corridor from the avatar's offset to the anchor, and the fuse exists so the
    // rig can move; re-deriving at detonation would let the cut land somewhere the quote never showed.
    d.charge = { col, row, fuse: fuseS, fuseS, payload, pattern: this._chargePattern(preview.anchor, payload) };
    d.chargeArmed = false;
    d.chargeAim = null;
    d.chargesSet = (Number(d.chargesSet) || 0) + 1;
    this.bus.emit('drill:chargePlanted', {
      col, row, fuseS, cost: preview.cost, payload, fromStock: preview.fromStock,
    });
    return true;
  },

  // The fuse is up. Resolve the cut against the field AS IT STANDS — anything the pilot bored
  // during the countdown is already gone, and machine housing is never blast matter no matter
  // what the preview once promised.
  _detonateCharge(d) {
    const charge = d.charge;
    d.charge = null;
    d.chargeCooldown = CHARGE_REARM_S;
    if (!charge) return;
    const payload = CHARGE_PAYLOADS[charge.payload] ? charge.payload : 'blast';
    const def = CHARGE_PAYLOADS[payload];
    const anchor = { col: charge.col, row: charge.row };
    const rockEnt = this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    const tier = this.getDrillTier();
    // Resolve the cells the pilot was quoted — never a pattern re-derived from where the rig has
    // since stepped. Tile state inside the footprint is still read live, as it stands.
    const pattern = Array.isArray(charge.pattern) && charge.pattern.length
      ? charge.pattern
      : this._chargePattern(anchor, payload);
    const broken = [];
    const vented = [];
    const fractured = [];
    const yields = {};
    let gasCount = 0;
    for (const { col, row } of pattern) {
      const tile = d.field[col] && d.field[col][row];
      if (!tile || tile.type === 'empty' || tile.structure) continue;
      if (payload === 'vent') {
        // The pocket opens into a vented seam — a gas tap can still sip it afterward.
        if (tile.type !== 'gas') continue;
        d.field[col][row] = { ...EMPTY_TILE(), vented: true };
        if (rockEnt && rockEnt.data) {
          recordClearedTile(rockEnt.data, col, row);
          recordVentedTile(rockEnt.data, col, row);
        }
        d.tilesCleared++;
        d.maxDepth = Math.max(d.maxDepth, row);
        gasCount++;
        vented.push({ col, row });
        this.bus.emit('drill:gasVent', { col, row });
        this.bus.emit('drill:break', { col, row, type: 'gas', ore: null, wasVein: false, wasGas: true, blast: true, vented: true });
        continue;
      }
      if (payload === 'seismic') {
        // No rock moves — the 5×5 just fractures. Fault marks make the auger's follow-up fast
        // and the renderer can read the crack straight off the tile.
        fractureTile(tile);
        if (rockEnt && rockEnt.data) recordFaultedTile(rockEnt.data, col, row);
        fractured.push({ col, row, type: tile.type });
        continue;
      }
      if ((tile.tierReq || 1) > tier) continue;
      const wasGas = tile.type === 'gas';
      const wasVein = tile.type === 'vein';
      const ore = tile.ore || null;
      const yieldU = tile.yieldU || 0;
      if (wasVein && ore) {
        const paid = settleBlastYield(this, d, rockEnt, col, row, ore, yieldU);
        if (paid > 0) yields[ore] = (yields[ore] || 0) + paid;
      }
      d.field[col][row] = { ...EMPTY_TILE(), scar: true };
      if (rockEnt && rockEnt.data) {
        recordClearedTile(rockEnt.data, col, row);
        recordScarredTile(rockEnt.data, col, row);
      }
      d.tilesCleared++;
      d.maxDepth = Math.max(d.maxDepth, row);
      broken.push({ col, row, type: tile.type, ore });
      this.bus.emit('drill:break', {
        col, row, type: tile.type, ore, wasVein, wasGas, blast: true,
      });
      if (wasGas) {
        gasCount++;
        d.gasHits++;
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
            origin: { kind: 'deep_core_gas', asteroidId: d.asteroidId, col, row },
          });
          this.bus.emit('drill:gasHit', { dmg, pos: { col, row }, via: 'blast' });
        }
      }
    }
    // Backblast — only harming payloads bite, and only when a pattern cell sits on or beside
    // the rig. The fuse was the warning.
    let backblast = 0;
    if (def.harms && player && player.hullMax > 0
        && pattern.some((c) => Math.abs(c.col - d.avatar.col) <= 1 && Math.abs(c.row - d.avatar.row) <= 1)) {
      backblast = Math.ceil(player.hullMax * (CHARGE_BACKBLAST_PCT / 100));
      const packet = scalarHitToDamagePacket({
        damage: backblast,
        damageType: 'explosive',
        penetration: 1,
        shieldBypass: 0,
        source: { kind: 'deep_core_blast', asteroidId: d.asteroidId },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      this._routeDamage({
        attackerId: null,
        targetId: this.state.playerId,
        packet,
        origin: { kind: 'deep_core_blast', asteroidId: d.asteroidId, col: anchor.col, row: anchor.row },
      });
      this.bus.emit('drill:backblast', {
        dmg: backblast,
        pos: { col: d.avatar.col, row: d.avatar.row },
      });
    }
    this.bus.emit('camera:shake', { amount: payload === 'seismic' ? 0.55 : 0.85 });
    this.bus.emit('drill:chargeBlast', {
      col: anchor.col,
      row: anchor.row,
      payload,
      cells: broken,
      broken: broken.length,
      vented,
      fractured,
      gasCount,
      backblast,
      yields,
      cost: def.cost,
    });
    for (const cell of broken) this._structCheck(d, cell.col, cell.row);
    for (const cell of vented) this._structCheck(d, cell.col, cell.row);
  },

  // ---------- roof mechanics ----------
  //
  // Called every time a cell opens. A horizontal run of empties shorter than the warn span is a
  // corridor and never bothers anyone. A run with open headroom is a HALL: the solid cells above
  // the void are a beam. Crack a beam once — the rock groans and the cells mark themselves —
  // then let the hall keep growing and the beam drops: each cracked roof cell opens, its column
  // of air fills with rubble, and anything standing under it pays for the excavation it skipped.
  _structCheck(d, col, row) {
    const field = d.field;
    const openAt = (c, r) => {
      const t = c >= 0 && c < COLS && r >= 0 && r < ROWS && field[c] ? field[c][r] : null;
      return !!(t && t.type === 'empty' && !t.structure);
    };
    if (!openAt(col, row)) return;
    let c0 = col;
    while (openAt(c0 - 1, row)) c0--;
    let c1 = col;
    while (openAt(c1 + 1, row)) c1++;
    const runLen = c1 - c0 + 1;
    if (runLen < CAVE_SPAN_WARN) return;
    // The beam is the first solid cell above each headroom column — up to CAVE_BEAM_SCAN rows of
    // air can sit under it and still count as the same roof.
    const beams = [];
    for (let c = c0; c <= c1; c++) {
      if (!openAt(c, row - 1)) continue;   // wall-top column — its roof is one row up, it holds
      let beamRow = -1;
      for (let r = row - 2; r >= Math.max(0, row - CAVE_BEAM_SCAN); r--) {
        if (!openAt(c, r)) { beamRow = r; break; }
      }
      if (beamRow >= 0) beams.push({ col: c, row: beamRow });
    }
    if (beams.length < CAVE_HEADROOM_MIN) return;
    const rockEnt = this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
    const fresh = [];
    for (const b of beams) {
      const t = field[b.col][b.row];
      if (t && t.type !== 'empty' && !t.cracked) { t.cracked = true; fresh.push(b); }
    }
    if (fresh.length) {
      this.bus.emit('drill:rockCreak', { cells: fresh.map((b) => ({ col: b.col, row: b.row })), span: runLen });
      this.bus.emit('drill:warn', {
        reason: 'structure',
        text: `The roof over this span is cracking — ${runLen} cells wide with open air above it.`,
        pos: { col, row },
      });
    }
    // A beam only falls when the hall keeps growing under cracks it already raised. First contact
    // warns; widening a cracked span past the fall line is the decision the roof answers.
    if (runLen < CAVE_SPAN_FALL || beams.length - fresh.length === 0) return;
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    const fell = [];
    const dropped = [];
    for (const b of beams) {
      const roof = field[b.col][b.row];
      if (!roof || roof.type === 'empty' || roof.structure) continue;
      // The roof cell opens; its column of air collapses — the lowest open cell fills.
      let floorRow = -1;
      for (let r = b.row + 1; r < ROWS; r++) {
        if (!openAt(b.col, r)) { floorRow = r - 1; break; }
      }
      if (floorRow < b.row + 1) continue;
      field[b.col][b.row] = EMPTY_TILE();
      if (rockEnt && rockEnt.data) recordClearedTile(rockEnt.data, b.col, b.row);
      fell.push({ col: b.col, row: b.row });
      field[b.col][floorRow] = RUBBLE_TILE();
      if (rockEnt && rockEnt.data) recordRubbleTile(rockEnt.data, b.col, floorRow);
      dropped.push({ col: b.col, row: floorRow });
      this.bus.emit('drill:break', { col: b.col, row: b.row, type: roof.type, ore: roof.ore || null, wasVein: false, wasGas: false, cave: true });
      if (player && player.hullMax > 0 && d.avatar.col === b.col && d.avatar.row === floorRow) {
        const dmg = Math.ceil(player.hullMax * (CAVE_IN_PCT / 100));
        const packet = scalarHitToDamagePacket({
          damage: dmg,
          damageType: 'kinetic',
          penetration: 0,
          shieldBypass: 0,
          source: { kind: 'deep_core_cavein', asteroidId: d.asteroidId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        this._routeDamage({
          attackerId: null,
          targetId: this.state.playerId,
          packet,
          origin: { kind: 'deep_core_cavein', asteroidId: d.asteroidId, col: b.col, row: floorRow },
        });
      }
    }
    if (fell.length) {
      this.bus.emit('drill:caveIn', { fell, dropped, span: runLen });
      this.bus.emit('camera:shake', { amount: 0.7 });
    }
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
    if (!Number.isFinite(d.chargeCooldown)) d.chargeCooldown = 0;
    d.sessionElapsed += dt;

    d.scan.cooldown = Math.max(0, (Number(d.scan.cooldown) || 0) - dt);
    d.scan.active = Math.max(0, (Number(d.scan.active) || 0) - dt);

    // A planted charge cooks on the same drill clock as everything else — the fuse keeps burning
    // while the player is thinking, and the re-arm dead time decays alongside it.
    d.chargeCooldown = Math.max(0, d.chargeCooldown - dt);
    if (d.charge) {
      d.charge.fuse -= dt;
      // The fuse beats faster as it runs out — a 0.45s clock tightening to 0.18s in the last
      // second, the same lamp strobe the board shows.
      d.charge.tick = (d.charge.tick || 0) - dt;
      if (d.charge.tick <= 0) {
        const beat = d.charge.fuse < 1 ? 0.18 : 0.45;
        d.charge.tick = beat;
        if (this.bus) this.bus.emit('drill:chargeTick', { col: d.charge.col, row: d.charge.row, fuse: Math.max(0, d.charge.fuse) });
      }
      if (d.charge.fuse <= 0) this._detonateCharge(d);
    }

    if (d.moveCooldown > 0) {
      d.moveCooldown -= dt;
    }

    // Bore work a bite already paid for. It runs down on the clock like everything else here, so a
    // player who bites and walks away is never handed a dead drill when they come back.
    const boreDebtBefore = Math.max(0, Number(d.boreDebt) || 0);
    d.boreDebt = Math.max(0, boreDebtBefore - dt);
    if (d.remainderHold > 0) d.remainderHold = Math.max(0, d.remainderHold - dt);

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
      // Every cardinal face uses the same bore contract. The rover must be able to route
      // around deposits and cut back upward when making space for contact-fed machinery.
      if (d.overheated || d.energyDepleted) {
        d.boreHold = 0;
        d.avatar.isDrilling = false;
        // A temporary interlock keeps its target. The input controller can then wait on the
        // same held intent and resume after recovery, while release still cancels immediately.
        d.avatar.drillTarget = { col: nc, row: nr };
        d.avatar.drillBlocked = false;
        const heatBlocked = d.overheated;
        const energyBlocked = d.energyDepleted;
        recoverRig(d, dt);
        if (d.moveCooldown <= 0) {
          const parts = [];
          if (heatBlocked) parts.push(drillHeatLimitCopy());
          if (energyBlocked) parts.push(drillEnergyLimitCopy());
          this.bus.emit('drill:warn', {
            text: parts.join(' '),
            reason: heatBlocked ? 'overheat' : 'capacitor',
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

      // Unaccepted ore is still in this cell. Do not grind it down again until the retry hold ends.
      if (d.remainderHold > 0 && d.remainderAt && d.remainderAt.col === nc && d.remainderAt.row === nr) {
        d.boreHold = 0;
        d.avatar.isDrilling = true;
        d.avatar.drillTarget = { col: nc, row: nr };
        d.avatar.drillBlocked = false;
        recoverRig(d, dt);
        if (d.moveCooldown <= 0) {
          this.bus.emit('drill:warn', {
            text: 'Cargo holds cannot take this ore — free volume is too tight or holds are full.',
            reason: 'cargoFull',
            commodityId: target.ore || null,
            pos: { col: nc, row: nr },
          });
          d.moveCooldown = DRILL_CARGO_FULL_RETRY_S;
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
        const wasVein = target.type === 'vein';
        const wasGas = target.type === 'gas';
        const wasType = target.type;
        const ore = target.ore;
        const yieldU = target.yieldU || 0;
        const rockEnt = this.state.entities && this.state.entities.get && this.state.entities.get(d.asteroidId);
        // Cargo answers before the hole is committed. Unaccepted ore stays on this vein.
        if (wasVein && ore && settleVeinYield(this, d, rockEnt, target, nc, nr, ore, yieldU) === 'preserve') {
          return;
        }

        d.field[nc][nr] = EMPTY_TILE();
        // Persist immediately so a crash/retract mid-session still leaves the hole next visit.
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
        this._structCheck(d, nc, nr);

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

  /** Read-only next commitment. Presentation asks; the fixed step does not scan the field for it. */
  commitmentView() {
    const d = this.state && this.state.drill;
    if (!d || !d.active) return null;
    const cargo = this.state.player && this.state.player.cargo;
    return deriveDrillCommitment(d, {
      tier: this.getDrillTier(),
      cargoFree: cargoFreeUnits(cargo),
    });
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

// Lane-facade read view: binds the system's read methods to a foreign `state`
// (the worker lane's mirror). The prototype IS the system object, so every
// `this.` read helper (getDrillTier, getDrillDPS, getTargetTelemetry,
// isHazardRevealed, isTileSurveyed) resolves against the real implementation
// while `this.state` reads the mirror. READ-ONLY surface — the write path
// (tickInput, begin, pulseScan, end) belongs to lane domEvent descriptors;
// callers must pick read names off the view, never expose it whole.
export function drillReadView(state) {
  const view = Object.create(drill);
  view.state = state;
  view.bus = null;
  view.ctx = { state, bus: null };
  return view;
}

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
  DRILL_HEAT_RESUME,
  GAS_TELL_RADIUS,
  CHARGE_FUSE_S,
  CHARGE_REARM_S,
  CHARGE_COST_CR,
  CHARGE_YIELD_FRACTION,
  CHARGE_BACKBLAST_PCT,
  CHARGE_BLAST_RADIUS,
  CHARGE_SHAPE_LEN,
  CHARGE_SEISMIC_RADIUS,
  CHARGE_PAYLOADS,
  CHARGE_PAYLOAD_ORDER,
};
