// The Adventure work branches' gates (progression lead 2026-11-20). Pure data + pure reads.
//
// Building (ruling 2026-11-20, "skills unlock complexity gradually"): a new claim board offers the
// basic kit — the first working chain: the Line Core (power), the Geological Extractor (the drill),
// the Cargo Port (storage and export), the Refinery (the first processor) and the Site Relay. The
// advanced machines open a few at a time through the Building skills, in the order a base grows:
//   Foundations    — Gas Tap, Auto-Bore Head, Fabricator        (more inputs, then assembly)
//   Tight Packing  — Capacitor Bank, Cryo-Coolant Condenser, Charge Press   (a denser hall)
//   Yard Hand      — Hydraulic Pillar Brace, Sub-Surface Mass Driver, Exotic Lattice Synthesizer,
//                    Geodesic Vein Exciter                                    (the big works)
// A machine already built keeps working whatever the tree says; the gate is read only when the
// player installs a new one. Old saves get the covering skills granted free by the v25->26
// migration, so nobody's board shrinks.

import { activePilotRecord, getPilotCard } from './pilotTree.js';

export const BUILDER_MACHINE_SKILL = Object.freeze({
  sm_gas_tap: 'builder_foundations',
  sm_auto_drill: 'builder_foundations',
  sm_fabricator: 'builder_foundations',
  sm_capacitor_bank: 'builder_tight_packing',
  sm_cryo_condenser: 'builder_tight_packing',
  sm_charge_press: 'builder_tight_packing',
  sm_seismic_brace: 'builder_yard_hand',
  sm_mass_driver: 'builder_yard_hand',
  sm_deep_synthesizer: 'builder_yard_hand',
  sm_harmonic_resonator: 'builder_yard_hand',
});

/** The Building skills in the order they open (each needs the one before). */
export const BUILDER_SKILL_ORDER = Object.freeze(['builder_foundations', 'builder_tight_packing', 'builder_yard_hand']);

/**
 * Null when the player may install this machine kind; otherwise the skill that opens it:
 * { nodeId, name, line } where `line` is the one sentence the board prints.
 */
export function builderMachineLock(state, defId) {
  const nodeId = BUILDER_MACHINE_SKILL[defId];
  if (!nodeId) return null;
  const pilot = activePilotRecord(state);
  if (pilot && Array.isArray(pilot.nodes) && pilot.nodes.includes(nodeId)) return null;
  const card = getPilotCard(nodeId);
  const name = card ? card.name : nodeId;
  return { nodeId, name, line: `Learn ${name} (Building) in the Pilot Tree to build this.` };
}

/** The Building skills (in order, each with its prerequisites) that cover a set of built kinds. */
export function builderSkillsCovering(defIds) {
  let deepest = -1;
  for (const id of defIds || []) {
    const node = BUILDER_MACHINE_SKILL[id];
    if (node) deepest = Math.max(deepest, BUILDER_SKILL_ORDER.indexOf(node));
  }
  return BUILDER_SKILL_ORDER.slice(0, deepest + 1);
}

// ── Trading (ruling 2026-11-20) ──────────────────────────────────────────────────────────────
// A player learns to read the price shapes; the skills make the reading easier, never replace it.
//   trader_long_memory  — the chart shows twice the history (20 minutes instead of 10).
//   trader_market_sense — the chart names the trend in plain words and how long it has run
//                         ("Climbing for 12 min"). Without it no trend is named anywhere.
//   trader_best_buyer   — a good in the hold shows the best price you remember for it, where
//                         and how old.
export const TRADER_HISTORY_SPAN_S = Object.freeze({ plain: 600, longMemory: 1200 });
/** The history RPC's grid for Long Memory (15 s samples), sized to cover the doubled window. */
export const TRADER_LONG_MEMORY_HISTORY = Object.freeze({ spanS: 15 * 95, stepS: 15, limit: 96 });

const TREND_WORDS = Object.freeze({
  steady: 'Steady', climb: 'Climbing', slide: 'Sliding', swing: 'Swinging', squeeze: 'Squeezed', glut: 'Flooded',
});

export function traderHistorySpanS(state) {
  const pilot = activePilotRecord(state);
  return pilot && Array.isArray(pilot.nodes) && pilot.nodes.includes('trader_long_memory')
    ? TRADER_HISTORY_SPAN_S.longMemory : TRADER_HISTORY_SPAN_S.plain;
}

/** "Climbing for 12 min" with Market Sense, '' without it (the chart names no trend). */
export function traderTrendLine(state, regimeState) {
  const pilot = activePilotRecord(state);
  if (!(pilot && Array.isArray(pilot.nodes) && pilot.nodes.includes('trader_market_sense'))) return '';
  if (!regimeState) return '';
  const word = TREND_WORDS[regimeState.kind] || 'Steady';
  const minutes = Math.max(1, Math.round((Number(regimeState.elapsed) || 0) / 60));
  return `${word} for ${minutes} min`;
}

export function traderHasBestBuyer(state) {
  const pilot = activePilotRecord(state);
  return !!(pilot && Array.isArray(pilot.nodes) && pilot.nodes.includes('trader_best_buyer'));
}
