// Pure deterministic helpers for the Depth Program's authored-wreck complications.
//
// This module deliberately owns no state and imports no renderer/runtime systems. Callers persist
// the returned timer delays and gate receipts under player.uniqueWrecks so save/load never rerolls
// a cleaner, radiation window, or encounter hook.

import { hash32, mulberry32 } from './rng.js';
import {
  hazardContainsPointAt,
  hazardMotionPhaseAt,
  nextHazardClearAt,
} from './hazardMotion.js';

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function rounded(value) {
  return Math.round(finite(value) * 1000) / 1000;
}

/**
 * Return a stable delay (seconds) for one authored timer. The purpose label is part of the seed,
 * so adding or evaluating an unrelated timer cannot perturb an existing cleaner deadline.
 */
export function deterministicTimer(programSeed, wreckId, label, timer = {}) {
  const minS = Math.max(0, finite(timer.minS, 0));
  const maxS = Math.max(minS, finite(timer.maxS, minS));
  if (maxS === minS) return rounded(minS);
  const seed = hash32(
    (Number(programSeed) >>> 0) || 1,
    String(wreckId || ''),
    String(label || ''),
    String(timer.seedSalt || ''),
  ) || 1;
  const rng = mulberry32(seed);
  return rounded(minS + rng() * (maxS - minS));
}

/**
 * D3's authored moving-radiation approach gate. It reads the world owner's live spatial hazard;
 * there is no parallel countdown that can disagree with the radiation currently crossing the wreck.
 */
export function movingRadiationGate(state, record, def) {
  const context = def && def.hazardContext || {};
  const approachGate = String(context.approachGate || '').toLowerCase();
  if (!(approachGate.includes('moving') && approachGate.includes('radiation'))) {
    return Object.freeze({ allowed: true, reason: null, phase: 0, nextOpenAt: null });
  }

  const now = Math.max(0, finite(state && state.simTime, 0));
  const selector = context.hazardSelector || {};
  const hazards = state && state.world && state.world.activeSector
    && Array.isArray(state.world.activeSector.hazards)
    ? state.world.activeSector.hazards
    : [];
  const hazard = hazards.find((entry) => entry
    && (!selector.type || entry.type === selector.type)
    && (selector.moving !== true || entry.moving === true));
  const point = record && (record.exactPos || record.fixedPos);
  if (!hazard || !point) {
    return Object.freeze({
      allowed: false,
      reason: 'moving_radiation_unavailable',
      phase: 0,
      nextOpenAt: null,
    });
  }
  const covered = hazardContainsPointAt(hazard, point, now);
  return Object.freeze({
    allowed: !covered,
    reason: covered ? 'moving_radiation_window' : null,
    phase: rounded(hazardMotionPhaseAt(hazard, now)),
    nextOpenAt: covered ? nextHazardClearAt(hazard, point, now) : null,
  });
}

/** Resolve one authored encounter hook without making it eligible for ambient scheduling. */
export function complicationEncounterId(def, kind) {
  if (!def || !kind) return null;
  const wanted = String(kind).toLowerCase();
  for (const entry of Array.isArray(def.encounterRefs) ? def.encounterRefs : []) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    const entryKind = typeof entry === 'object' && entry ? String(entry.kind || '').toLowerCase() : '';
    if (!id) continue;
    if (entryKind === wanted || String(id).toLowerCase().includes(wanted)) return String(id);
  }
  for (const entry of Array.isArray(def.complications) ? def.complications : []) {
    const entryKind = String(entry && entry.kind || '').toLowerCase();
    const id = entry && (entry.encounterRef || entry.encounterId);
    if (id && entryKind === wanted) return String(id);
  }
  return null;
}

/**
 * Normalize every recovery reward. Equippables still route through ships.grantModule, cargo through
 * pickup:collected, and story data through the durable unique-wreck sidecar; this is description
 * only, not a second item system.
 */
export function rewardDescriptors(def) {
  if (!def || typeof def !== 'object') return Object.freeze([]);
  const out = [];
  const seen = new Set();
  const drops = Array.isArray(def.uniqueDrops) && def.uniqueDrops.length
    ? def.uniqueDrops
    : (def.uniqueDropId ? [{ id: def.uniqueDropId, kind: 'module' }] : []);

  for (const drop of drops) {
    if (!drop || !drop.id || seen.has(drop.id)) continue;
    seen.add(drop.id);
    const reward = {
      id: String(drop.id),
      kind: String(drop.kind || 'module'),
    };
    if (drop.baseId) reward.baseId = String(drop.baseId);
    if (drop.flagKey) reward.flagKey = String(drop.flagKey);
    if (Number.isFinite(Number(drop.qty))) reward.qty = Math.max(0, Number(drop.qty));
    out.push(Object.freeze(reward));
  }

  for (const cargo of Array.isArray(def.bonusCargo) ? def.bonusCargo : []) {
    const id = cargo && cargo.commodityId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(Object.freeze({
      id: String(id),
      kind: 'cargo',
      qty: Math.max(0, finite(cargo.qty, 0)),
    }));
  }
  return Object.freeze(out);
}
