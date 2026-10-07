// Phase 2b #10 side bench: rich-core timing window at human release jitter. Drives the REAL
// mining._updateRichCoreCharge / _resolveRichCore (hold fire, release; hit = |progress-0.5| <=
// windowPct/2 of RICH_CORE_DURATION_S) with release times drawn from N(target + bias, sigma).
// Tier sets windowPct via richCoreWindowPctForTier (0.22 at tier 0 -> 0.12 at tier 5).
import { mining, RICH_CORE_DURATION_S, richCoreWindowPctForTier } from '../../../src/systems/mining.js';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function trial({ tier, sigma, bias, trials = 2000, seed = 1, windowOverride = null }) {
  const rng = mulberry32(seed * 7777 + tier * 31 + Math.round(sigma * 1000));
  const sys = Object.create(mining);
  let hits = 0;
  const events = [];
  sys.bus = { emit: (n) => { if (n === 'mining:richCoreCompleted') hits++; events.push(n); } };
  sys._giveCargo = () => 99; sys._spawnPickup = () => 0; sys._parkUnreleasedOre = () => {};
  const dt = 1 / 60;
  for (let i = 0; i < trials; i++) {
    const state = { simTime: 0, entities: new Map(), player: { mining: {} }, playerId: 1 };
    sys.state = state;
    const windowPct = windowOverride != null ? windowOverride : richCoreWindowPctForTier(tier);
    state.player.mining.richCore = { id: 'c', asteroidId: 9, commodityId: 'x', multiplier: 4, windowPct, durationS: RICH_CORE_DURATION_S, openedAt: 0, expiresAt: RICH_CORE_DURATION_S, chargeStartedAt: null, resolved: false };
    const release = Math.max(dt, RICH_CORE_DURATION_S * 0.5 + bias + gauss(rng) * sigma);
    for (let t = 0; t < 600; t++) {
      const firing = state.simTime < release;
      sys._updateRichCoreCharge(firing, dt, state);
      if (!state.player.mining.richCore) break;
      state.simTime += dt;
    }
  }
  return { hitRate: hits / trials, windowPct: windowOverride != null ? windowOverride : richCoreWindowPctForTier(tier), halfWindowS: (windowOverride != null ? windowOverride : richCoreWindowPctForTier(tier)) * 0.5 * RICH_CORE_DURATION_S };
}
