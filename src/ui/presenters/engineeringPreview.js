// src/ui/presenters/engineeringPreview.js — Milestone-3 truthful engineering previews.
//
// Pure view mapping for normal Shipyard + Outfitting routes:
//   stock hull compare · fitted loadout ghost deltas · gauge packets · fit availability
//
// Discipline:
//   • PURE — no DOM, no Math.random, no Date.now, no emit, no state mutation.
//   • ONE STAT AUTHORITY — every player-facing number comes from ships.getDerivedStats
//     with a real hull defId + fittings[] parallel to buildSlotList. Never invents
//     simplified fittings, geometry claims, or raw module.mods key diffs as flight stats.
//   • FIT RULES — buildSlotList + fits from ships system only.
//   • FAIL CLOSED — missing def / impossible fit yields honest unavailable reasons, not zeros.
//   • Role lattice is read-only flavor (describeHullRole / compareHulls); not a second math path.

import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  buildSlotList,
  fits,
  getDerivedStats,
} from '../../systems/ships.js';
import {
  compareHulls,
  describeHullRole,
} from '../../data/shipRoleLattice.js';

export const ENGINEERING_PREVIEW_SCHEMA = 'spaceface.engineeringPreview.v1';

/** Player-facing derived metrics shown on Shipyard/Outfitting comparison surfaces. */
export const PREVIEW_METRICS = Object.freeze([
  Object.freeze({ key: 'hullMax', label: 'Hull', higherIsBetter: true }),
  Object.freeze({ key: 'shieldMax', label: 'Shield', higherIsBetter: true }),
  Object.freeze({ key: 'cargoCap', label: 'Cargo', higherIsBetter: true }),
  Object.freeze({ key: 'maxSpeed', label: 'Max speed', higherIsBetter: true }),
  Object.freeze({ key: 'turnRate', label: 'Turn rate', higherIsBetter: true }),
  Object.freeze({ key: 'thrust', label: 'Thrust', higherIsBetter: true }),
  Object.freeze({ key: 'operationalMass', label: 'Op. mass', higherIsBetter: false }),
  Object.freeze({ key: 'continuousDrain', label: 'Power draw', higherIsBetter: false }),
  Object.freeze({ key: 'capMax', label: 'Energy', higherIsBetter: true }),
]);

/** Compact shop-row subset (keeps five-second scan readable). */
export const SHOP_DELTA_METRICS = Object.freeze([
  'shieldMax', 'cargoCap', 'maxSpeed', 'turnRate', 'thrust', 'operationalMass', 'continuousDrain',
]);

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FITTABLE_BY_ID = new Map();
for (const m of MODULES) FITTABLE_BY_ID.set(m.id, m);
for (const w of WEAPONS) if (!FITTABLE_BY_ID.has(w.id)) FITTABLE_BY_ID.set(w.id, w);

const UNAVAILABLE_COPY = Object.freeze({
  missing_ship: 'No hull selected.',
  unknown_ship: 'Hull is not in the ship catalog.',
  missing_module: 'Select a module to preview.',
  unknown_module: 'Module is not in the catalog.',
  no_compatible_slot: 'No compatible hardpoint on this hull.',
  slot_occupied: 'Compatible hardpoints are full — unfit first or buy to inventory.',
  size_mismatch: 'Module size exceeds the hardpoint.',
  type_mismatch: 'Wrong hardpoint type for this module.',
  unknown_slot: 'Hardpoint index is out of range.',
  remove_empty: 'That hardpoint is already empty.',
});

/**
 * Player input for stock-hull previews: keep efficiency mods, zero cargo mass so hangar cargo
 * never inflates a bare candidate hull's operational mass.
 */
export function stockPreviewPlayer(player = null) {
  const p = player && typeof player === 'object' ? player : {};
  return {
    ...p,
    cargo: { usedMass: 0 },
    efficiencyMods: (p.efficiencyMods && typeof p.efficiencyMods === 'object') ? p.efficiencyMods : {},
  };
}

/** Normalize fittings to buildSlotList length (defId | null). */
export function normalizeFittings(defId, fittings = []) {
  const shipDef = SHIP_BY_ID.get(defId);
  if (!shipDef) return [];
  const slots = buildSlotList(shipDef);
  const out = new Array(slots.length).fill(null);
  for (let i = 0; i < slots.length; i++) {
    const id = fittings && fittings[i];
    out[i] = id || null;
  }
  return out;
}

export function resolveShipDef(defOrId) {
  if (!defOrId) return null;
  if (typeof defOrId === 'string') return SHIP_BY_ID.get(defOrId) || null;
  if (defOrId.id && SHIP_BY_ID.has(defOrId.id)) return SHIP_BY_ID.get(defOrId.id);
  return defOrId.id ? defOrId : null;
}

export function resolveModuleDef(defOrId) {
  if (!defOrId) return null;
  if (typeof defOrId === 'string') return FITTABLE_BY_ID.get(defOrId) || null;
  if (defOrId.id && FITTABLE_BY_ID.has(defOrId.id)) return FITTABLE_BY_ID.get(defOrId.id);
  return defOrId.id ? defOrId : null;
}

export function activeOwnedShip(player = null) {
  const p = player || {};
  const owned = Array.isArray(p.ownedShips) ? p.ownedShips : [];
  const idx = Number.isInteger(p.activeShipIndex) ? p.activeShipIndex : 0;
  return owned[idx] || owned[0] || null;
}

export function unavailableReason(code, detail = null) {
  const reason = code || 'unknown';
  return Object.freeze({
    ok: false,
    reason,
    detail: detail || UNAVAILABLE_COPY[reason] || 'Preview unavailable.',
  });
}

/**
 * Canonical derived readout used by gauges and delta rows.
 * @returns {{ ok:true, defId, fittings, derived, gauges } | unavailable}
 */
export function presentDerivedReadout(defId, fittings = [], player = null) {
  const shipDef = resolveShipDef(defId);
  if (!shipDef) return unavailableReason(defId ? 'unknown_ship' : 'missing_ship');
  const fit = normalizeFittings(shipDef.id, fittings);
  const derived = getDerivedStats(shipDef.id, fit, player);
  return Object.freeze({
    ok: true,
    reason: 'ok',
    detail: null,
    defId: shipDef.id,
    shipName: shipDef.name,
    fittings: Object.freeze(fit.slice()),
    derived,
    gauges: Object.freeze(gaugePacketFromDerived(derived)),
  });
}

/** Gauge payload for shipEngineeringStage.setGauges — derived only. */
export function presentGaugePacket(defId, fittings = [], player = null) {
  const readout = presentDerivedReadout(defId, fittings, player);
  if (!readout.ok) {
    return Object.freeze({
      ok: false,
      reason: readout.reason,
      detail: readout.detail,
      mass: null,
      capMax: null,
      capRegen: null,
      shieldMax: null,
      cargoCap: null,
      maxSpeed: null,
      continuousDrain: null,
    });
  }
  return Object.freeze({
    ok: true,
    reason: 'ok',
    detail: null,
    ...readout.gauges,
  });
}

function gaugePacketFromDerived(derived) {
  return {
    mass: finite(derived.mass, 0),
    capMax: finite(derived.capMax, 0),
    capRegen: finite(derived.capRegen, 0),
    shieldMax: finite(derived.shieldMax, 0),
    cargoCap: finite(derived.cargoCap, 0),
    maxSpeed: finite(derived.maxSpeed, 0),
    continuousDrain: finite(derived.continuousDrain, 0),
  };
}

/**
 * Stock hull-vs-hull compare for Shipyard (empty fittings both sides, zero cargo).
 * Numbers only from getDerivedStats; lattice supplies role copy + adjacency.
 * Shape matches historical describeShipyardHullCompare for existing call sites.
 */
export function presentHullCompare(candidateDefOrId, player = {}) {
  const candidateDef = resolveShipDef(candidateDefOrId);
  if (!candidateDef) return null;

  const owned = activeOwnedShip(player);
  const currentId = (owned && owned.defId) || 'ship_kestrel';

  if (candidateDef.id === currentId) {
    const self = describeHullRole(candidateDef.id);
    return Object.freeze({
      kind: 'current',
      title: candidateDef.name + ' is your active hull',
      body: (self && (self.identityLine || self.shortWhy)) || hullFallbackWhy(candidateDef),
      compare: null,
      basis: 'stock',
      candidateFittings: Object.freeze(normalizeFittings(candidateDef.id, [])),
      currentFittings: Object.freeze(normalizeFittings(currentId, [])),
    });
  }

  const stockPlayer = stockPreviewPlayer(player);
  const candFit = normalizeFittings(candidateDef.id, []);
  const curFit = normalizeFittings(currentId, []);
  const candDerived = getDerivedStats(candidateDef.id, candFit, stockPlayer);
  const curDerived = getDerivedStats(currentId, curFit, stockPlayer);
  const compare = compareHulls(candidateDef.id, currentId, candDerived, curDerived);
  if (!compare) return null;

  const better = compare.rows.filter((r) => r.tone === 'better').map((r) => r.label);
  const worse = compare.rows.filter((r) => r.tone === 'worse').map((r) => r.label);
  const adj = compare.adjacencyFromCurrent ? ' On your upgrade path.' : '';
  const betterText = better.length ? 'Gains ' + better.slice(0, 3).join(', ') : 'No clear gains';
  const worseText = worse.length ? '; trades away ' + worse.slice(0, 3).join(', ') : '';
  const why = compare.candidateWhy || hullFallbackWhy(candidateDef);

  return Object.freeze({
    kind: 'compare',
    title: candidateDef.name + ' vs ' + (compare.currentName || 'current hull'),
    body: why + ' ' + betterText + worseText + '.' + adj,
    compare,
    basis: 'stock',
    note: 'Stock hull stats (empty fittings, no cargo). Outfitting changes live loadout numbers.',
    candidateFittings: Object.freeze(candFit),
    currentFittings: Object.freeze(curFit),
    candidateDerived: candDerived,
    currentDerived: curDerived,
  });
}

function hullFallbackWhy(def) {
  return (def && def.name) ? def.name + ' hull platform.' : 'Select a hull to inspect.';
}

/**
 * Before/after loadout delta from two fittings arrays on the same hull.
 * @param {object} opts
 * @param {string} opts.defId
 * @param {Array} [opts.beforeFittings]
 * @param {Array} opts.afterFittings
 * @param {object|null} [opts.player]
 * @param {string[]} [opts.metricKeys] — subset of PREVIEW_METRICS keys
 */
export function presentLoadoutDelta(opts = {}) {
  const shipDef = resolveShipDef(opts.defId);
  if (!shipDef) return unavailableReason(opts.defId ? 'unknown_ship' : 'missing_ship');

  const beforeFit = normalizeFittings(shipDef.id, opts.beforeFittings || []);
  const afterFit = normalizeFittings(shipDef.id, opts.afterFittings || []);
  const player = opts.player != null ? opts.player : null;
  const before = getDerivedStats(shipDef.id, beforeFit, player);
  const after = getDerivedStats(shipDef.id, afterFit, player);

  const keySet = Array.isArray(opts.metricKeys) && opts.metricKeys.length
    ? new Set(opts.metricKeys)
    : null;
  const metrics = PREVIEW_METRICS.filter((m) => !keySet || keySet.has(m.key));
  const rows = metrics.map((m) => deltaRow(m, before, after)).filter(Boolean);

  return Object.freeze({
    ok: true,
    reason: 'ok',
    detail: null,
    defId: shipDef.id,
    beforeFittings: Object.freeze(beforeFit.slice()),
    afterFittings: Object.freeze(afterFit.slice()),
    before,
    after,
    rows: Object.freeze(rows),
    gauges: Object.freeze(gaugePacketFromDerived(after)),
  });
}

function deltaRow(metric, before, after) {
  const b = readMetric(before, metric.key);
  const a = readMetric(after, metric.key);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  const delta = a - b;
  let tone = 'same';
  if (Math.abs(delta) >= 1e-6) {
    const improved = metric.higherIsBetter ? delta > 0 : delta < 0;
    tone = improved ? 'better' : 'worse';
  }
  return Object.freeze({
    key: metric.key,
    label: metric.label,
    before: b,
    after: a,
    delta,
    tone,
    higherIsBetter: metric.higherIsBetter,
  });
}

function readMetric(derived, key) {
  if (!derived) return NaN;
  if (key === 'operationalMass') {
    const v = derived.operationalMass != null ? derived.operationalMass : derived.mass;
    return finite(v, NaN);
  }
  return finite(derived[key], NaN);
}

/**
 * Ghost/preview a module install, swap, or remove against the live fittings array.
 * @param {object} opts
 * @param {string} opts.defId — active hull
 * @param {Array} [opts.fittings] — current owned fittings
 * @param {string} [opts.moduleId] — catalog module/weapon id
 * @param {number} [opts.slotIndex] — explicit slot; auto-picks empty compatible when omitted
 * @param {boolean} [opts.remove] — clear slotIndex instead of installing
 * @param {object|null} [opts.player]
 * @param {string[]} [opts.metricKeys]
 * @param {boolean} [opts.allowReplace] — if no empty slot, replace first same-type fitted that fits size
 */
export function presentModuleFitPreview(opts = {}) {
  const shipDef = resolveShipDef(opts.defId);
  if (!shipDef) return unavailableReason(opts.defId ? 'unknown_ship' : 'missing_ship');

  const beforeFit = normalizeFittings(shipDef.id, opts.fittings || []);
  const slots = buildSlotList(shipDef);
  const player = opts.player != null ? opts.player : null;

  if (opts.remove) {
    const slotIndex = Number.isInteger(opts.slotIndex) ? opts.slotIndex : -1;
    if (slotIndex < 0 || slotIndex >= slots.length) {
      return Object.freeze({
        ...unavailableReason('unknown_slot'),
        defId: shipDef.id,
        beforeFittings: Object.freeze(beforeFit.slice()),
        afterFittings: Object.freeze(beforeFit.slice()),
        slotIndex: slotIndex,
        moduleId: null,
        rows: Object.freeze([]),
        gauges: presentGaugePacket(shipDef.id, beforeFit, player),
      });
    }
    if (!beforeFit[slotIndex]) {
      return Object.freeze({
        ...unavailableReason('remove_empty'),
        defId: shipDef.id,
        beforeFittings: Object.freeze(beforeFit.slice()),
        afterFittings: Object.freeze(beforeFit.slice()),
        slotIndex,
        moduleId: null,
        rows: Object.freeze([]),
        gauges: presentGaugePacket(shipDef.id, beforeFit, player),
      });
    }
    const afterFit = beforeFit.slice();
    afterFit[slotIndex] = null;
    const delta = presentLoadoutDelta({
      defId: shipDef.id,
      beforeFittings: beforeFit,
      afterFittings: afterFit,
      player,
      metricKeys: opts.metricKeys,
    });
    return Object.freeze({
      ...delta,
      mode: 'remove',
      slotIndex,
      moduleId: beforeFit[slotIndex],
      detail: 'Preview: unfit hardpoint ' + slotIndex + '.',
    });
  }

  const moduleDef = resolveModuleDef(opts.moduleId);
  if (!moduleDef) {
    return Object.freeze({
      ...unavailableReason(opts.moduleId ? 'unknown_module' : 'missing_module'),
      defId: shipDef.id,
      beforeFittings: Object.freeze(beforeFit.slice()),
      afterFittings: Object.freeze(beforeFit.slice()),
      slotIndex: -1,
      moduleId: opts.moduleId || null,
      rows: Object.freeze([]),
      gauges: presentGaugePacket(shipDef.id, beforeFit, player),
    });
  }

  const target = resolveFitTarget(slots, beforeFit, moduleDef, opts.slotIndex, opts.allowReplace !== false);
  if (!target.ok) {
    return Object.freeze({
      ...unavailableReason(target.reason),
      defId: shipDef.id,
      beforeFittings: Object.freeze(beforeFit.slice()),
      afterFittings: Object.freeze(beforeFit.slice()),
      slotIndex: target.slotIndex != null ? target.slotIndex : -1,
      moduleId: moduleDef.id,
      moduleName: moduleDef.name,
      rows: Object.freeze([]),
      gauges: presentGaugePacket(shipDef.id, beforeFit, player),
      mode: 'unavailable',
    });
  }

  const afterFit = beforeFit.slice();
  afterFit[target.slotIndex] = moduleDef.id;
  const delta = presentLoadoutDelta({
    defId: shipDef.id,
    beforeFittings: beforeFit,
    afterFittings: afterFit,
    player,
    metricKeys: opts.metricKeys || SHOP_DELTA_METRICS,
  });
  const changed = delta.rows.filter((r) => r.tone !== 'same' && Math.abs(r.delta) >= 0.05);
  return Object.freeze({
    ...delta,
    mode: target.mode,
    slotIndex: target.slotIndex,
    moduleId: moduleDef.id,
    moduleName: moduleDef.name,
    detail: target.mode === 'replace'
      ? 'Preview: replace fitted ' + (slots[target.slotIndex].type) + ' with ' + moduleDef.name + '.'
      : 'Preview: fit ' + moduleDef.name + ' on open ' + slots[target.slotIndex].type + ' ' + slots[target.slotIndex].size + '.',
    changedRows: Object.freeze(changed),
  });
}

function resolveFitTarget(slots, fittings, moduleDef, explicitSlotIndex, allowReplace) {
  if (Number.isInteger(explicitSlotIndex)) {
    const slot = slots[explicitSlotIndex];
    if (!slot) return { ok: false, reason: 'unknown_slot', slotIndex: explicitSlotIndex };
    if (slot.type !== moduleDef.slotType) {
      return { ok: false, reason: 'type_mismatch', slotIndex: explicitSlotIndex };
    }
    if (!fits(slot, moduleDef)) {
      return { ok: false, reason: 'size_mismatch', slotIndex: explicitSlotIndex };
    }
    return {
      ok: true,
      slotIndex: explicitSlotIndex,
      mode: fittings[explicitSlotIndex] ? 'replace' : 'install',
    };
  }

  const emptyIdx = slots.findIndex((s, i) => !fittings[i] && fits(s, moduleDef));
  if (emptyIdx >= 0) return { ok: true, slotIndex: emptyIdx, mode: 'install' };

  const anyType = slots.some((s) => s.type === moduleDef.slotType);
  if (!anyType) return { ok: false, reason: 'no_compatible_slot', slotIndex: -1 };

  const sizeOkEmpty = slots.some((s, i) => s.type === moduleDef.slotType && !fittings[i] && fits(s, moduleDef));
  if (sizeOkEmpty) return { ok: false, reason: 'slot_occupied', slotIndex: -1 };

  if (allowReplace) {
    const replaceIdx = slots.findIndex((s, i) => fittings[i] && fits(s, moduleDef));
    if (replaceIdx >= 0) return { ok: true, slotIndex: replaceIdx, mode: 'replace' };
  }

  const typeMatch = slots.some((s) => s.type === moduleDef.slotType);
  if (typeMatch) {
    // Type exists but nothing is large enough (and no replace allowed / nothing fitted that fits).
    const anyFits = slots.some((s) => fits(s, moduleDef));
    if (!anyFits) return { ok: false, reason: 'size_mismatch', slotIndex: -1 };
    return { ok: false, reason: 'slot_occupied', slotIndex: -1 };
  }
  return { ok: false, reason: 'no_compatible_slot', slotIndex: -1 };
}

/**
 * Format a single delta for shop/compare chips (no HTML).
 * @returns {string} e.g. "+12 shield" or "−3.2 max speed"
 */
export function formatPreviewDelta(row) {
  if (!row || !Number.isFinite(row.delta)) return '';
  const d = row.delta;
  if (Math.abs(d) < 0.05) return '';
  const sign = d > 0 ? '+' : '';
  const shown = Math.abs(d) >= 100
    ? sign + Math.round(d)
    : (Number.isInteger(d)
      ? sign + d
      : sign + (Math.round(d * 10) / 10));
  return shown + ' ' + String(row.label || row.key).toLowerCase();
}

/**
 * Shop-row packet: derived deltas when fittable/swappable, else honest unavailable reason.
 */
export function presentShopModuleDelta(opts = {}) {
  const preview = presentModuleFitPreview({
    defId: opts.defId,
    fittings: opts.fittings,
    moduleId: opts.moduleId,
    slotIndex: opts.slotIndex,
    player: opts.player,
    metricKeys: opts.metricKeys || SHOP_DELTA_METRICS,
    allowReplace: opts.allowReplace !== false,
  });
  if (!preview.ok) {
    return Object.freeze({
      ok: false,
      reason: preview.reason,
      detail: preview.detail,
      mode: 'unavailable',
      moduleId: preview.moduleId || opts.moduleId || null,
      slotIndex: preview.slotIndex,
      rows: Object.freeze([]),
      chips: Object.freeze([]),
    });
  }
  const changed = (preview.changedRows || preview.rows.filter((r) => r.tone !== 'same')).slice(0, 4);
  const chips = changed.map((row) => Object.freeze({
    label: formatPreviewDelta(row),
    tone: row.tone,
    key: row.key,
  })).filter((c) => c.label);
  return Object.freeze({
    ok: true,
    reason: 'ok',
    detail: preview.detail,
    mode: preview.mode,
    moduleId: preview.moduleId,
    moduleName: preview.moduleName,
    slotIndex: preview.slotIndex,
    rows: preview.rows,
    chips: Object.freeze(chips),
    gauges: preview.gauges,
  });
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
