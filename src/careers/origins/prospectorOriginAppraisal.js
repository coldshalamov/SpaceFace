// Deposit appraisal — pure reads against mining data + scanned entity fields.
// Teaches "read the rock before you burn" (SPEC3-15 / first-hour B2 spirit).
// No sim writes. Deterministic from entity typeId + optional yield hints.

import { ASTEROIDS, ORES } from '../../data/mining.js';
import {
  PROSPECTOR_GRADE_ORDER,
  PROSPECTOR_MIN_APPRAISAL_GRADE,
} from './prospectorOriginDefs.js';

const ASTEROID_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ORE_BY_ID = new Map(ORES.map((o) => [o.id, o]));

const GRADE_INDEX = Object.freeze(
  Object.fromEntries(PROSPECTOR_GRADE_ORDER.map((g, i) => [g, i])),
);

function finiteOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sortIds(ids) {
  return ids.slice().sort((a, b) => String(a).localeCompare(String(b)));
}

/** Expected base value of one unit of an ore id. */
export function oreBaseValue(commodityId) {
  const ore = ORE_BY_ID.get(commodityId);
  return Math.max(0, finiteOr(ore && ore.baseValue, 0));
}

/** Weighted expected unit value of an asteroid type's ore table. */
export function expectedUnitValueFromOreTable(oreTable) {
  if (!oreTable || typeof oreTable !== 'object') return 0;
  let weightSum = 0;
  let valueSum = 0;
  for (const id of sortIds(Object.keys(oreTable))) {
    const w = Math.max(0, finiteOr(oreTable[id], 0));
    if (!(w > 0)) continue;
    weightSum += w;
    valueSum += w * oreBaseValue(id);
  }
  if (!(weightSum > 0)) return 0;
  return valueSum / weightSum;
}

/**
 * Map expected unit value + tier to a grade band.
 * Tuned to starter rocks (silicate/iron ≈ fair) vs exotic (prime).
 */
export function gradeFromExpectedValue(expectedUnitValue, tierCap = 0) {
  const v = finiteOr(expectedUnitValue, 0);
  const tier = Math.max(0, Math.floor(finiteOr(tierCap, 0)));
  if (v <= 0) return 'barren';
  if (v < 8 && tier <= 0) return 'poor';
  if (v < 25 || tier <= 1) return 'fair';
  if (v < 80 || tier <= 2) return 'rich';
  return 'prime';
}

export function gradeAtLeast(grade, minGrade) {
  const a = GRADE_INDEX[grade];
  const b = GRADE_INDEX[minGrade];
  if (a == null || b == null) return false;
  return a >= b;
}

export function glyphForOreTable(oreTable) {
  if (!oreTable) return 'Ore';
  const ids = sortIds(Object.keys(oreTable));
  let bestId = null;
  let bestW = -1;
  for (const id of ids) {
    const w = finiteOr(oreTable[id], 0);
    if (w > bestW) {
      bestW = w;
      bestId = id;
    }
  }
  if (!bestId) return 'Ore';
  if (bestId.includes('ice')) return 'H2O';
  if (bestId.includes('gas')) return 'Gas';
  if (bestId.includes('crystal') || bestId.includes('gem')) return 'Cr';
  if (bestId.includes('exotic')) return 'Xe';
  if (bestId.includes('ore') || bestId.includes('silicate')) return 'Fe';
  return 'Ore';
}

/**
 * Risk score 0..1 from volatility tags + mass of dominant ores.
 * Higher = more extraction risk (fragile/gas/exotic).
 */
export function extractionRiskFromOreTable(oreTable) {
  if (!oreTable) return 0.15;
  let weightSum = 0;
  let riskSum = 0;
  for (const id of sortIds(Object.keys(oreTable))) {
    const w = Math.max(0, finiteOr(oreTable[id], 0));
    if (!(w > 0)) continue;
    const ore = ORE_BY_ID.get(id);
    const tags = (ore && ore.tags) || [];
    let r = 0.12;
    if (tags.includes('gas') || tags.includes('bulky')) r += 0.18;
    if (tags.includes('crystal') || tags.includes('fragile')) r += 0.22;
    if (tags.includes('rare') || tags.includes('exotic')) r += 0.2;
    if (tags.includes('ice')) r += 0.08;
    weightSum += w;
    riskSum += w * r;
  }
  if (!(weightSum > 0)) return 0.15;
  return Math.max(0, Math.min(1, riskSum / weightSum));
}

/**
 * Appraise a deposit entity (asteroid) or a raw typeId.
 * Uses live entity.data.scanOreGlyph when present (scanner authority).
 */
export function appraiseDeposit(target) {
  if (target == null) {
    return {
      ok: false,
      reason: 'no_target',
      depositId: null,
      typeId: null,
      grade: 'barren',
      glyph: '—',
      expectedUnitValue: 0,
      extractionRisk: 0,
      commodityIds: [],
      meetsMinGrade: false,
      minGrade: PROSPECTOR_MIN_APPRAISAL_GRADE,
    };
  }

  const isEntity = typeof target === 'object';
  const typeId = isEntity
    ? (target.data && target.data.typeId) || target.typeId || null
    : String(target);
  const depositId = isEntity ? (target.id != null ? target.id : null) : null;
  const def = typeId ? ASTEROID_BY_ID.get(typeId) : null;
  const oreTable = def && def.oreTable ? def.oreTable : null;
  const expectedUnitValue = Math.round(expectedUnitValueFromOreTable(oreTable) * 100) / 100;
  const grade = gradeFromExpectedValue(expectedUnitValue, def && def.tierCap);
  const glyph = (isEntity && target.data && target.data.scanOreGlyph)
    || glyphForOreTable(oreTable);
  const extractionRisk = Math.round(extractionRiskFromOreTable(oreTable) * 1000) / 1000;
  const commodityIds = oreTable ? sortIds(Object.keys(oreTable)) : [];

  return {
    ok: !!def,
    reason: def ? null : 'unknown_type',
    depositId,
    typeId,
    grade,
    glyph,
    expectedUnitValue,
    extractionRisk,
    commodityIds,
    meetsMinGrade: gradeAtLeast(grade, PROSPECTOR_MIN_APPRAISAL_GRADE),
    minGrade: PROSPECTOR_MIN_APPRAISAL_GRADE,
    tierCap: def ? def.tierCap : 0,
    look: def ? def.look : null,
  };
}

/**
 * Pick the best appraised deposit from a list (stable id tie-break).
 * Used when scan:completed fires and tests inject scanned asteroids.
 */
export function pickBestDepositAppraisal(entities) {
  const list = Array.isArray(entities) ? entities : [];
  let best = null;
  for (const ent of list) {
    if (!ent || (ent.type && ent.type !== 'asteroid')) continue;
    const appraisal = appraiseDeposit(ent);
    if (!appraisal.ok) continue;
    if (!best) {
      best = appraisal;
      continue;
    }
    const gBest = GRADE_INDEX[best.grade] || 0;
    const gNext = GRADE_INDEX[appraisal.grade] || 0;
    if (gNext > gBest) {
      best = appraisal;
      continue;
    }
    if (gNext === gBest) {
      if (appraisal.expectedUnitValue > best.expectedUnitValue) {
        best = appraisal;
        continue;
      }
      if (
        appraisal.expectedUnitValue === best.expectedUnitValue
        && String(appraisal.depositId) < String(best.depositId)
      ) {
        best = appraisal;
      }
    }
  }
  return best;
}

/** Read-only cargo mass pressure for extraction-risk teaching. */
export function cargoMassPressure(state) {
  const cargo = state && state.player && state.player.cargo;
  if (!cargo) return { usedMass: 0, capMass: 0, frac: 0, strained: false };
  const usedMass = Math.max(0, finiteOr(cargo.usedMass, 0));
  const capMass = Math.max(0, finiteOr(cargo.capMass, 0));
  const frac = capMass > 0 ? usedMass / capMass : 0;
  return {
    usedMass,
    capMass,
    frac: Math.round(frac * 1000) / 1000,
    strained: frac >= 0.65,
  };
}

/** True if player hold has any of the given commodity ids. */
export function holdHasOre(state, commodityIds) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items) return false;
  const ids = Array.isArray(commodityIds) && commodityIds.length
    ? commodityIds
    : Object.keys(items);
  for (const id of ids) {
    if ((items[id] || 0) > 0) return true;
  }
  // Any raw ore-like stack counts if no filter.
  if (!commodityIds || !commodityIds.length) {
    for (const id of Object.keys(items)) {
      if ((items[id] || 0) > 0 && (id.startsWith('cmdty_ore') || id.startsWith('cmdty_silicate')
        || id.startsWith('cmdty_ice') || id.startsWith('cmdty_gas')
        || id.startsWith('cmdty_crystal') || id.startsWith('cmdty_gem')
        || id.startsWith('cmdty_exotic'))) {
        return true;
      }
    }
  }
  return false;
}
