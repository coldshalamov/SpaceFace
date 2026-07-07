// gateControl.js — BP-11 packet A8 "Gate Traffic-Control", PURE SCENE PLANNER.
// (See design/revamp/detail/A_sector_station.md packet A8.)
//
// Jumping through a controlled gate should be a SCENE, not a silent loading screen: a Meridian
// toll, a Concord hold-scan, a queue in safe space — chosen deterministically per gate-day. This
// file is the pure "what scene does this gate run today" layer, mirroring encounters.js: no imports
// beyond core/rng, no state reads, no Math.random. The director (gateControlDirector.js) fires it on
// jump:chargeStart and turns the scene into voice/credits/spawn intents.
//
// No-stack rule (structural, not a runtime read of world internals): src/systems/world.js _gateToll
// already charges a high-sec customs fee when sector.security > 0.6. We band OUR scene toll to
// security <= MTS_TOLL_MAX_SEC so a Meridian gate never double-charges — high-sec Meridian gates get
// a comms-only queue instead. Our toll uses the distinct reason 'gate:toll' (world's is 'gate_toll').
//
// Determinism: everything derives from mulberry32(hash32(seed, sectorId, gateTo, dayIndex)); THREE
// floats are drawn up front in a fixed order (variant, amount, wing) so a later edit to one branch
// can never reshuffle another branch's stream. `wanted` is a planner INPUT (not hidden state) — the
// contract is "same gate-day + same wanted → same scene," a fully testable matrix.

import { hash32, mulberry32 } from '../core/rng.js';

// world.js _gateToll charges only when sector.security > 0.6 — band our scene toll to <= this so the
// two never stack on the same gate. (Keep in sync with src/systems/world.js _gateToll.)
export const MTS_TOLL_MAX_SEC = 0.6;
export const WING_MAX = 2;

// One comms line per scene type (taste: ≤12 words, caps callsigns, factual, no exclamation). Silent
// scenes carry no line. variantRoll picks among a type's lines.
const LINES = Object.freeze({
  mts_toll: Object.freeze(['MERIDIAN LANE CONTROL: transit levy assessed. Clear on payment.']),
  scn_scan: Object.freeze(['CONCORD CHECKPOINT: hold your vector for a routine hold scan.']),
  queue:    Object.freeze(['GATE CONTROL: you are in the queue. Hold the lane.']),
  hostile:  Object.freeze(['GATE WATCH: your registry is flagged. Stand down for inspection.']),
});

function silent() { return { type: 'silent', comms: null, tollAmount: 0, scanWing: 0 }; }

/**
 * planGateScene(seed, sectorId, gateTo, dayIndex, { factionId, security, wanted })
 *   -> { type:'mts_toll'|'scn_scan'|'queue'|'silent'|'hostile', comms, tollAmount, scanWing }
 *
 * PURE + deterministic. The decision table is evaluated in a FIXED order; the toll amount and scan
 * wing size are seeded (never per-frame). A frontier / low-traffic gate is silent; a wanted player
 * skips the polite scene entirely and gets the hostile line (the actual hostility is the AI stack's
 * job — this packet spawns no combatants).
 */
export function planGateScene(seed, sectorId, gateTo, dayIndex, ctx = {}) {
  if (sectorId == null || gateTo == null) return silent();
  const day = dayIndex | 0;
  const rng = mulberry32(hash32(seed == null ? 0 : seed, String(sectorId), String(gateTo), day));
  // Fixed three-draw vector, fixed order — reshuffle-proof across future edits.
  const variantRoll = rng();
  const amountRoll = rng();
  const wingRoll = rng();

  const factionId = ctx.factionId || null;
  const security = Number.isFinite(ctx.security) ? ctx.security : 0.5;
  const wanted = !!ctx.wanted;

  const line = (type) => { const arr = LINES[type]; return arr[Math.floor(variantRoll * arr.length) % arr.length]; };

  // 1. Wanted / red-rep player → skip the polite scene (hostility handled by the AI stack).
  if (wanted) return { type: 'hostile', comms: line('hostile'), tollAmount: 0, scanWing: 0 };
  // 2. Frontier / low-traffic gate → silent (no scene).
  if (security < 0.35) return silent();
  // 3. Meridian toll — banded to <= MTS_TOLL_MAX_SEC so it never stacks with world's high-sec fee.
  if (factionId === 'faction_mts' && security <= MTS_TOLL_MAX_SEC) {
    return { type: 'mts_toll', comms: line('mts_toll'), tollAmount: 40 + Math.floor(amountRoll * 4) * 15, scanWing: 0 };
  }
  // 4. Concord high-sec checkpoint → a ≤2 patrol scan wing (seeded size).
  if (factionId === 'faction_scn' && security >= 0.6) {
    const wing = security >= 0.8 ? WING_MAX : 1 + (wingRoll < 0.4 ? 1 : 0);
    return { type: 'scn_scan', comms: line('scn_scan'), tollAmount: 0, scanWing: Math.min(WING_MAX, wing) };
  }
  // 5. Safe / neutral space (incl. high-sec Meridian) → a comms-only queue.
  if (security >= 0.55) return { type: 'queue', comms: line('queue'), tollAmount: 0, scanWing: 0 };
  // 6. Otherwise silent.
  return silent();
}

export default { planGateScene, MTS_TOLL_MAX_SEC, WING_MAX };
