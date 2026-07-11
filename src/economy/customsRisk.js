// customsRisk.js — ECON-P4 pure smuggling / customs risk adapters.
//
// Shared, authority-free math for preflight + UI adapters. Mirrors the shipped economy.runScan
// tunables (BASE_SCAN / FINE_MULT / BRIBE_FRAC) so projected odds and fines match the engine —
// but this module NEVER charges credits, confiscates cargo, writes heat, or mutates missions.
//
// Pure responsibilities:
//   • hidden hold capacity (smuggler-hold pct × cargo cap), capped
//   • remaining illicit stacks after the hidden hold absorbs volume
//   • scan chance from security + cloak + hot-until modifier
//   • estimated fine / bribe (projection only — no double fine path)
//   • smuggling preflight copy (chips + warning strings)
//
// Lead seam: economy.runScan still scans the full illicitCargo list; wiring remainingIllicit
// into the engine is intentionally out of this packet (noTouch economy.js).

import { COMMODITIES } from '../data/commodities.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// ── tunables mirrored from economy.js:46-50 (projection only; engine remains authority) ──────
export const BASE_SCAN = 0.25;
export const SCAN_LO = 0.02;
export const SCAN_HI = 0.95;
export const FINE_MULT = Object.freeze({
  legal: 0,
  restricted: 0.8,
  illegal: 1.2,
  contraband: 1.5,
});
export const BRIBE_FRAC = 0.30;

// SPEC3-12 Smuggling 2.0: escaping a scan marks gates "hot" for 10 min → scan +15%.
export const HOT_SCAN_BONUS = 0.15;
export const HOT_DURATION_S = 600;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

export function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, 0, 1);
}

/** Percent clamp for scan chance — always [SCAN_LO, SCAN_HI]. Pure. */
export function clampScanChance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return SCAN_LO;
  return clamp(n, SCAN_LO, SCAN_HI);
}

/**
 * scanChanceInputs({ security, cloak, hot }) -> full intermediate breakdown.
 * Formula (economy.js:858 + SPEC3-12 hot): clamp(BASE_SCAN*(1+sec) - cloak + hotBonus, .02, .95).
 * Pure; no roll.
 */
export function scanChanceInputs({ security = 0, cloak = 0, hot = false } = {}) {
  const sec = Number.isFinite(Number(security)) ? Math.max(0, Number(security)) : 0;
  const cl = Number.isFinite(Number(cloak)) ? Math.max(0, Number(cloak)) : 0;
  const isHot = !!hot;
  const base = BASE_SCAN * (1 + sec);
  const hotBonus = isHot ? HOT_SCAN_BONUS : 0;
  const raw = base - cl + hotBonus;
  const chance = clampScanChance(raw);
  return {
    security: sec,
    cloak: cl,
    hot: isHot,
    base,
    hotBonus,
    raw,
    chance,
    pct: Math.round(chance * 100),
  };
}

/** Scalar scan chance in [SCAN_LO, SCAN_HI]. Pure. */
export function scanChance(inputs = {}) {
  return scanChanceInputs(inputs).chance;
}

/**
 * hiddenHoldCapacity({ capVolume, hiddenCargoPct }) -> volume units that can be shielded.
 * Cap: pct clamped to [0,1]; capacity never exceeds capVolume; never negative.
 */
export function hiddenHoldCapacity({ capVolume = 0, hiddenCargoPct = 0 } = {}) {
  const cap = Math.max(0, Number(capVolume) || 0);
  const pct = clamp01(hiddenCargoPct, 0);
  return cap * pct;
}

/**
 * Normalize a stack to a full def-aware record. Accepts either:
 *   { commodityId, qty, def? }  or  { commodityId, qty, basePrice, legality, volPerU, name }
 * Pure; never invents legality for unknown ids beyond catalog lookup.
 */
function normalizeStack(stack) {
  if (!stack) return null;
  const commodityId = stack.commodityId || stack.id || null;
  const qty = Math.max(0, Math.floor(Number(stack.qty) || 0));
  if (!commodityId || qty <= 0) return null;
  const catalog = CMDTY_BY_ID.get(commodityId) || {};
  const def = stack.def && typeof stack.def === 'object' ? stack.def : catalog;
  const legality = stack.legality || def.legality || 'legal';
  if (!legality || legality === 'legal') return null;
  const basePrice = Number(stack.basePrice != null ? stack.basePrice : def.basePrice) || 0;
  const volPerU = Number(stack.volPerU != null ? stack.volPerU : def.volPerU);
  const vol = Number.isFinite(volPerU) && volPerU > 0 ? volPerU : 1;
  const name = stack.name || def.name || commodityId;
  const fineMultFallback = Number(stack.fineMult != null ? stack.fineMult : def.fineMult);
  return {
    commodityId,
    qty,
    name,
    legality,
    basePrice,
    volPerU: vol,
    volume: qty * vol,
    fineMultFallback: Number.isFinite(fineMultFallback) ? fineMultFallback : 1,
  };
}

/**
 * stackFine(stack) — projected line fine using FINE_MULT[legality] (engine parity at economy.js:866).
 * Projection only; never charged.
 */
export function stackFine(stack) {
  const s = normalizeStack(stack) || stack;
  if (!s || !(s.qty > 0)) return 0;
  const legality = s.legality || 'legal';
  const mult = FINE_MULT[legality] != null
    ? FINE_MULT[legality]
    : (Number.isFinite(s.fineMultFallback) ? s.fineMultFallback : 1);
  return round((Number(s.basePrice) || 0) * (Number(s.qty) || 0) * mult);
}

/**
 * remainingIllicit({ stacks, hiddenCapacity }) -> {
 *   totalVolume, hiddenVolume, remainingVolume, remainingQty,
 *   hiddenStacks, exposedStacks, fullyCovered
 * }
 *
 * The hidden hold absorbs illicit VOLUME up to hiddenCapacity (capped). Absorption walks stacks
 * in stable commodityId order so the remainder is deterministic. Exposed stacks are what a scan
 * would still fine — the fine estimate must use ONLY exposed stacks (no double fine on hidden).
 * Pure.
 */
export function remainingIllicit({ stacks = [], hiddenCapacity = 0 } = {}) {
  const normalized = [];
  for (const raw of stacks) {
    const s = normalizeStack(raw);
    if (s) normalized.push(s);
  }
  // Stable order: commodityId ASC, then qty DESC for ties.
  normalized.sort((a, b) => {
    if (a.commodityId < b.commodityId) return -1;
    if (a.commodityId > b.commodityId) return 1;
    return b.qty - a.qty;
  });

  let budget = Math.max(0, Number(hiddenCapacity) || 0);
  let totalVolume = 0;
  let hiddenVolume = 0;
  let remainingVolume = 0;
  let remainingQty = 0;
  const hiddenStacks = [];
  const exposedStacks = [];

  for (const s of normalized) {
    totalVolume += s.volume;
    if (budget <= 0) {
      exposedStacks.push({ ...s });
      remainingVolume += s.volume;
      remainingQty += s.qty;
      continue;
    }
    if (s.volume <= budget) {
      // Fully hidden.
      hiddenStacks.push({ ...s });
      hiddenVolume += s.volume;
      budget -= s.volume;
      continue;
    }
    // Partially hidden: hide as many whole units as volume allows.
    const hideQty = Math.floor(budget / s.volPerU);
    const hideVol = hideQty * s.volPerU;
    if (hideQty > 0) {
      hiddenStacks.push({ ...s, qty: hideQty, volume: hideVol });
      hiddenVolume += hideVol;
      budget -= hideVol;
    }
    const expQty = s.qty - hideQty;
    if (expQty > 0) {
      const expVol = expQty * s.volPerU;
      exposedStacks.push({ ...s, qty: expQty, volume: expVol });
      remainingVolume += expVol;
      remainingQty += expQty;
    }
  }

  return {
    totalVolume,
    hiddenVolume,
    remainingVolume,
    remainingQty,
    hiddenStacks,
    exposedStacks,
    fullyCovered: remainingQty <= 0 && totalVolume > 0,
    empty: totalVolume <= 0,
  };
}

/**
 * estimatedFine(stacks) — sum of projected line fines. Pass EXPOSED stacks only to respect the
 * hidden hold. Never charges; never confuses itself with a second fine authority.
 */
export function estimatedFine(stacks = []) {
  let total = 0;
  for (const s of stacks) total += stackFine(s);
  return total;
}

/** estimatedBribe(fine) — round(fine * BRIBE_FRAC). Projection only. */
export function estimatedBribe(fine = 0) {
  return round((Number(fine) || 0) * BRIBE_FRAC);
}

/**
 * hotUntilActive(hotUntil, simTime) — true while simTime is strictly below hotUntil.
 * Accepts a number, or a map of factionId → untilSim (any entry still active counts as hot
 * when factionId is omitted; with factionId, only that entry).
 */
export function hotUntilActive(hotUntil, simTime = 0, factionId = null) {
  const t = Number(simTime) || 0;
  if (hotUntil == null) return false;
  if (typeof hotUntil === 'number') {
    return Number.isFinite(hotUntil) && t < hotUntil;
  }
  if (typeof hotUntil === 'object') {
    if (factionId != null) {
      const until = Number(hotUntil[factionId]);
      return Number.isFinite(until) && t < until;
    }
    for (const key of Object.keys(hotUntil)) {
      const until = Number(hotUntil[key]);
      if (Number.isFinite(until) && t < until) return true;
    }
  }
  return false;
}

/** hotScanModifier — HOT_SCAN_BONUS while hot, else 0. Pure. */
export function hotScanModifier(hotUntil, simTime = 0, factionId = null) {
  return hotUntilActive(hotUntil, simTime, factionId) ? HOT_SCAN_BONUS : 0;
}

/**
 * smugglingPreflightCopy(input) -> { chips, warning, scan, fine, remaining, fullyCovered }
 *
 * Board/preflight surface for smuggling risk math. Pure over its inputs; never mutates state.
 *
 * input:
 *   security, cloak, hot | hotUntil + simTime + factionId,
 *   stacks (illicit or projected mission cargo),
 *   capVolume, hiddenCargoPct
 */
export function smugglingPreflightCopy(input = {}) {
  const security = input.security;
  const cloak = input.cloak;
  const simTime = Number(input.simTime) || 0;
  const factionId = input.factionId || null;
  const hot = input.hot != null
    ? !!input.hot
    : hotUntilActive(input.hotUntil, simTime, factionId);

  const hiddenCap = hiddenHoldCapacity({
    capVolume: input.capVolume,
    hiddenCargoPct: input.hiddenCargoPct,
  });
  const remaining = remainingIllicit({
    stacks: input.stacks || [],
    hiddenCapacity: hiddenCap,
  });
  const fine = estimatedFine(remaining.exposedStacks);
  const bribe = estimatedBribe(fine);
  const scan = scanChanceInputs({ security, cloak, hot });

  const chips = [];
  // Scan odds always visible for smuggling work (SPEC3-12 exception to no-numbers).
  chips.push({
    kind: scan.chance >= 0.55 ? 'bad' : (scan.chance >= 0.30 ? 'warn' : 'ok'),
    text: `Scan ~${scan.pct}%` + (hot ? ' (hot)' : ''),
  });

  if (remaining.empty) {
    chips.push({ kind: 'info', text: 'No illicit staged' });
  } else if (remaining.fullyCovered) {
    chips.push({ kind: 'ok', text: 'Hidden hold covers cargo' });
  } else {
    chips.push({
      kind: fine > 0 ? 'bad' : 'warn',
      text: `Fine ~${fine.toLocaleString('en-US')} cr`,
    });
    if (hiddenCap > 0 && remaining.hiddenVolume > 0) {
      chips.push({
        kind: 'info',
        text: `Hidden ${Math.round(remaining.hiddenVolume * 10) / 10}u`,
      });
    }
  }

  if (hot) {
    chips.push({ kind: 'warn', text: 'Gates hot +15% scan' });
  }

  let warning = null;
  if (!remaining.empty && !remaining.fullyCovered && fine > 0) {
    warning = hot
      ? `Customs odds ~${scan.pct}% while gates are hot; projected fine ~${fine.toLocaleString('en-US')} cr (bribe ~${bribe.toLocaleString('en-US')} cr).`
      : `Customs scan chance ~${scan.pct}%; projected fine ~${fine.toLocaleString('en-US')} cr if caught (bribe ~${bribe.toLocaleString('en-US')} cr).`;
  } else if (remaining.fullyCovered && scan.chance >= 0.55) {
    warning = `Hidden hold covers the staged illicit load, but scan odds stay high (~${scan.pct}%).`;
  } else if (hot) {
    warning = 'Faction gates are hot — scan chance elevated for the next window.';
  }

  return {
    chips,
    warning,
    scan,
    estFine: fine,
    estBribe: bribe,
    remaining,
    hiddenCapacity: hiddenCap,
    fullyCovered: remaining.fullyCovered,
    // Explicit non-authority marker: consumers must not treat this as a charge.
    projectionOnly: true,
  };
}

/**
 * buildIllicitStacksFromCargo(cargo, catalogLookup?) — pure helper turning a cargo.items map
 * into illicit stack records for remainingIllicit / estimatedFine. Legal goods are skipped.
 */
export function buildIllicitStacksFromCargo(cargo) {
  const items = (cargo && cargo.items) || cargo || {};
  const out = [];
  for (const id of Object.keys(items)) {
    const qty = Math.floor(Number(items[id]) || 0);
    if (qty <= 0) continue;
    const s = normalizeStack({ commodityId: id, qty });
    if (s) out.push(s);
  }
  out.sort((a, b) => (a.commodityId < b.commodityId ? -1 : a.commodityId > b.commodityId ? 1 : 0));
  return out;
}

/**
 * buildProjectedMissionStacks(mission) — pure: for a smuggling_run (or any cargo mission),
 * project the contract cargo as illicit stacks when the commodity is non-legal.
 */
export function buildProjectedMissionStacks(mission) {
  const p = (mission && mission.params) || {};
  const cmdtyId = p.cmdtyId;
  const qty = Math.floor(Number(p.qty) || 0);
  if (!cmdtyId || qty <= 0) return [];
  const s = normalizeStack({ commodityId: cmdtyId, qty });
  return s ? [s] : [];
}

export default {
  BASE_SCAN,
  SCAN_LO,
  SCAN_HI,
  FINE_MULT,
  BRIBE_FRAC,
  HOT_SCAN_BONUS,
  HOT_DURATION_S,
  clamp01,
  clampScanChance,
  scanChanceInputs,
  scanChance,
  hiddenHoldCapacity,
  remainingIllicit,
  stackFine,
  estimatedFine,
  estimatedBribe,
  hotUntilActive,
  hotScanModifier,
  smugglingPreflightCopy,
  buildIllicitStacksFromCargo,
  buildProjectedMissionStacks,
};
