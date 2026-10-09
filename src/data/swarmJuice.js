// SWARM-02 — the arcade juice vocabulary (SWARM_ARCADE §5).
//
// Everything the Swarm-only feedback layer SAYS is decided here, DOM-free, so the sim
// system (src/systems/swarmJuice.js) emits honest events and the presenter
// (src/ui/swarmJuiceHud.js) only has to draw them. Adventure never sees this layer:
// it gates on a live swarm ruleset run and on the one Arcade effects setting.
//
// The vocabulary is deliberately louder than Adventure's restraint — that is the point
// of the mode. Words, thresholds and counters live here so tests pin language, not CSS.

/** Named chain tiers (§5.1). Order matters: ascending. */
export const SWARM_CHAIN_TIERS = Object.freeze([
  { at: 10, id: 'ignition', name: 'IGNITION' },
  { at: 25, id: 'flare', name: 'FLARE' },
  { at: 50, id: 'nova', name: 'NOVA' },
  { at: 100, id: 'supernova', name: 'SUPERNOVA' },
  { at: 200, id: 'singularity', name: 'SINGULARITY' },
]);

/** The highest tier at or below `chain`, or null under the first mark. Pure. */
export function swarmChainTier(chain) {
  const n = Number.isFinite(chain) ? chain : 0;
  let hit = null;
  for (const tier of SWARM_CHAIN_TIERS) if (n >= tier.at) hit = tier;
  return hit;
}

/** The next tier above `chain` (the "next mark" the hero shows), or null at the top. */
export function swarmChainNextTier(chain) {
  const n = Number.isFinite(chain) ? chain : 0;
  for (const tier of SWARM_CHAIN_TIERS) if (n < tier.at) return tier;
  return null;
}

/** The tier crossed between `previous` and `chain` (highest newly reached), or null. */
export function swarmChainTierCrossed(chain, previous) {
  const n = Number.isFinite(chain) ? chain : 0;
  const p = Number.isFinite(previous) ? previous : 0;
  let hit = null;
  for (const tier of SWARM_CHAIN_TIERS) {
    if (n >= tier.at && p < tier.at) hit = tier;
  }
  return hit;
}

/** Index of a tier row in SWARM_CHAIN_TIERS, or -1. Used to scale punch by tier. */
export function swarmChainTierIndex(tier) {
  if (!tier || typeof tier !== 'object') return -1;
  return SWARM_CHAIN_TIERS.indexOf(tier);
}

// --- Kill cause words (§5.2) -----------------------------------------------------

/**
 * The word a kill popup carries. `cause` is the style family from styleCauseFromKill
 * (direct | explosive | terrain | collision); `surface` is the presentation receipt's
 * contact surface (terrain | craft | structure) when the emitter said one.
 *
 *   SLAMMED — a body put through arena terrain (a rock, the wall, the berm)
 *   BANKED  — a body put through the arena structure: ricocheted off the built shell
 *   SLUNG   — a body thrown into another hull
 *   MINED   — an explosive end (mine, charge, cookoff)
 *   SHREDDED — shot down, plain and loud
 *   FRIENDLY FIRE — the room killed one of its own
 */
export const SWARM_KILL_WORDS = Object.freeze({
  slammed: 'SLAMMED',
  banked: 'BANKED',
  slung: 'SLUNG',
  mined: 'MINED',
  shredded: 'SHREDDED',
  friendlyFire: 'FRIENDLY FIRE',
  down: 'DOWN',
});

export function swarmKillCauseWord({ cause = null, surface = null, friendlyFire = false } = {}) {
  if (friendlyFire === true) return SWARM_KILL_WORDS.friendlyFire;
  if (cause === 'terrain') {
    return surface === 'structure' ? SWARM_KILL_WORDS.banked : SWARM_KILL_WORDS.slammed;
  }
  if (cause === 'collision') return SWARM_KILL_WORDS.slung;
  if (cause === 'explosive') return SWARM_KILL_WORDS.mined;
  if (cause === 'direct') return SWARM_KILL_WORDS.shredded;
  return SWARM_KILL_WORDS.down;
}

// --- The multi-kill announcer (§5.3) ----------------------------------------------

/** Kills inside this sim-time window count toward one announcement. */
export const SWARM_MULTI_WINDOW_S = 0.6;
/** Physics causes — the ones a PILE-UP is made of. */
export const SWARM_PILEUP_CAUSES = Object.freeze(['collision', 'terrain']);

export function swarmMultiKillWord(count) {
  const n = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (n >= 5) return 'SWARM WIPE';
  if (n === 4) return 'QUAD';
  if (n === 3) return 'TRIPLE';
  if (n === 2) return 'DOUBLE';
  return null;
}

/**
 * True when the kills in the window are ALL physics kills — one thrown body, one charge
 * or one wall taking several. A mixed burst gets the ordinary DOUBLE/TRIPLE words; a
 * pure physics burst gets PILE-UP ×N.
 */
export function swarmPileUp(causes) {
  if (!Array.isArray(causes) || causes.length < 2) return false;
  return causes.every((c) => SWARM_PILEUP_CAUSES.includes(c));
}

// --- Beats that need a threshold ---------------------------------------------------

/** The player hull fraction under which a kill reads as CLOSE CALL (§5.3). */
export const SWARM_CLOSE_CALL_HULL = 0.10;
/** How fresh the last hit on the player must be for a kill on the hitter to read REVENGE. */
export const SWARM_REVENGE_WINDOW_S = 8;
/** A kill this close to the wave clear is the round's LAST ONE. */
export const SWARM_LAST_ONE_WINDOW_S = 1.0;

// --- Hit-stop (§5.4) -----------------------------------------------------------------

export const SWARM_HITSTOP_MIN_S = 0.04;
export const SWARM_HITSTOP_MAX_S = 0.08;
/** The slow the world dips to — deep enough to read as a beat, shallow enough to not stall. */
export const SWARM_HITSTOP_SCALE = 0.35;
/** The time-effects source id the juice layer requests with. */
export const SWARM_HITSTOP_SOURCE = 'swarm:juice-hitstop';

/** Hit-stop seconds for a kill at this chain: 40 ms + 10 ms per chain tier reached, ≤ 80 ms. */
export function swarmHitStopSeconds(chain) {
  const index = swarmChainTierIndex(swarmChainTier(chain));
  const s = SWARM_HITSTOP_MIN_S + Math.max(0, index + 1) * 0.01;
  return Math.min(SWARM_HITSTOP_MAX_S, Math.max(SWARM_HITSTOP_MIN_S, s));
}

// --- Round clear tally (§5.5) ---------------------------------------------------------

/** A wave resolved faster than this (sim seconds) earns the SPEED CLEAR line. */
export const SWARM_SPEED_CLEAR_S = 30;

/**
 * The count-up rows the clear moment lists, in the order they land (§5.5): the honors
 * first, then the figures. Rows with nothing earned are absent — a flat round is short,
 * not shamed.
 *   flawless   — player hull never dropped this wave
 *   durationS  — sim seconds the wave was active
 *   kills      — run-owned bodies resolved on the player's account
 *   bestChain  — the chain's peak (carries across rounds; the wave's own high-water)
 */
export function swarmRoundTally({ flawless = false, durationS = null, kills = 0, bestChain = 0 } = {}) {
  const rows = [];
  if (flawless === true) rows.push({ id: 'flawless', label: 'FLAWLESS', value: 'NO HULL LOST' });
  if (Number.isFinite(durationS) && durationS <= SWARM_SPEED_CLEAR_S) {
    rows.push({ id: 'speed', label: 'SPEED CLEAR', value: `${Math.max(0, Math.round(durationS))}s` });
  }
  const n = Number.isFinite(kills) ? Math.trunc(kills) : 0;
  if (n > 0) rows.push({ id: 'kills', label: 'ROOM KILLS', value: `×${n}` });
  const chain = Number.isFinite(bestChain) ? Math.trunc(bestChain) : 0;
  if (chain > 0) rows.push({ id: 'chain', label: 'BEST CHAIN', value: `×${chain}` });
  return rows;
}

// --- New threat counters (§5.7) ---------------------------------------------------------

/**
 * The counter card's five words — what the debut archetype does and the one move that
 * answers it. Roster rows that never debut past wave 1 need no line. The spec's own
 * example ("It explodes. Throw it.") sets the register: body part, then verb.
 */
export const SWARM_NEWCOMER_COUNTERS = Object.freeze({
  reaver_pirate: 'It rushes. Shred it mid-pass.',
  choir_zealot: 'It packs. Keep the room moving.',
  detonator_dart: 'It explodes. Throw it.',
  mine_layer_jackal: 'It salts lanes. Shove it back.',
  lancer_sniper: 'It lines long shots. Break them.',
  warden_escort: 'It shields a friend. Pop it.',
  corsair_raider: 'It duels. Throw mass, not shots.',
  customs_cutter: 'It disables. Ram it first.',
  quiet_ghost: 'It snipes unseen. Close fast.',
  pd_screen_escort: 'It blocks shots. Well it.',
  patrol_lawman: 'It shrugs throws. Grind it.',
  tether_control_raider: 'It ropes you. Rope it first.',
  bruiser_brawler: 'It rams. Sidestep, then sling.',
  field_anchor_controller: 'It anchors wells. Rope it away.',
});

// --- The one setting (§5 preamble) -------------------------------------------------------

export const SWARM_EFFECTS_LEVELS = Object.freeze(['off', 'reduced', 'full']);
export const SWARM_EFFECTS_DEFAULT = 'full';

/**
 * The effective Arcade effects level. `settings.video.arcadeEffects` is the player's
 * choice (full | reduced | off; default full); motionReduce or flashReduce can only
 * ever pull it DOWN to reduced — accessibility outranks volume, always (§5 preamble).
 */
export function arcadeEffectsLevel(settings) {
  const video = settings && settings.video;
  const access = settings && settings.accessibility;
  const motionDown = !!(video && video.motionReduce) || !!(access && access.flashReduce);
  const raw = video && typeof video.arcadeEffects === 'string' ? video.arcadeEffects : SWARM_EFFECTS_DEFAULT;
  const chosen = SWARM_EFFECTS_LEVELS.includes(raw) ? raw : SWARM_EFFECTS_DEFAULT;
  if (chosen === 'off') return 'off';
  if (motionDown) return 'reduced';
  return chosen;
}
