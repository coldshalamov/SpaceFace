// Pilot flight character (§21A combat-variety seam): a deterministic per-hull temperament that
// makes two ships flying the same doctrine read as different pilots. Pure data + hashUnit —
// no ambient randomness, no world access, no rng draws (replay-safe).
//
// Traits (all 0..1):
//   verve — speed appetite; scales the maneuver speed envelope and pounce willingness.
//   poise — steering calm; higher slew smoothing, less heading twitch.
//   weave — strafe-weave tendency while closing on a hostile target ("fly and dodge").
//   dash  — brake-check / jink appetite when the geometry favors it.
//   aim   — fire discipline: gunners keep the nose on target, dodgers sacrifice aim for motion.
//
// Doctrine sets the baseline (a brawler is a brawler); per-entity jitter makes wingmates differ.
// The planner folds these into slew, speed, waypoint offsets, and reflex magnitudes.

import { clamp, hashUnit } from './contracts.js';

export const TEMPERAMENT_IDENTITY = Object.freeze({
  id: 'crew',
  verve: 0.55,
  poise: 0.55,
  weave: 0.45,
  dash: 0.45,
  aim: 0.55,
});

const DOCTRINE_ANCHORS = Object.freeze({
  // Knife-fighters: weave hard, jink often, hold their nose off the boresight.
  interceptor_flyby: { id: 'skirmisher', verve: 0.85, poise: 0.45, weave: 0.80, dash: 0.70, aim: 0.35 },
  swarm_pack: { id: 'swarmer', verve: 0.80, poise: 0.40, weave: 0.85, dash: 0.55, aim: 0.30 },
  pack_pursuit: { id: 'pursuer', verve: 0.75, poise: 0.50, weave: 0.60, dash: 0.60, aim: 0.45 },
  // Commit-and-hit pilots: steady approach, heavy trigger, minimal evasion.
  brawler_commit: { id: 'bruiser', verve: 0.60, poise: 0.60, weave: 0.25, dash: 0.35, aim: 0.85 },
  // Standoff marksmen: stay back, keep the sight picture, sidestep rather than weave.
  ranged_disengager: { id: 'marksman', verve: 0.45, poise: 0.70, weave: 0.55, dash: 0.65, aim: 0.90 },
  // Authored score pieces move deliberately — the hull's mass does the talking.
  capital_broadside: { id: 'commander', verve: 0.30, poise: 0.80, weave: 0.12, dash: 0.20, aim: 0.90 },
  capital_broadside_tollman: { id: 'commander', verve: 0.30, poise: 0.80, weave: 0.12, dash: 0.20, aim: 0.90 },
  capital_broadside_ala: { id: 'commander', verve: 0.30, poise: 0.80, weave: 0.12, dash: 0.20, aim: 0.90 },
  escort_screen: { id: 'warden', verve: 0.50, poise: 0.70, weave: 0.30, dash: 0.40, aim: 0.60 },
  // Specialists split the difference; their authored verbs dominate.
  tether_control_raider: { id: 'specialist', verve: 0.55, poise: 0.60, weave: 0.45, dash: 0.50, aim: 0.60 },
  field_anchor_controller: { id: 'specialist', verve: 0.50, poise: 0.65, weave: 0.40, dash: 0.45, aim: 0.60 },
  mine_layer_wake: { id: 'saboteur', verve: 0.60, poise: 0.55, weave: 0.55, dash: 0.55, aim: 0.55 },
  shield_breaker: { id: 'specialist', verve: 0.55, poise: 0.60, weave: 0.40, dash: 0.45, aim: 0.65 },
  // Kamikaze: flat-out and unflinching. No weave, no brake-check — a dart that jinks reads as
  // trying to survive, and it is not.
  detonator_run: { id: 'fanatic', verve: 0.98, poise: 0.50, weave: 0.10, dash: 0.15, aim: 0.30 },
});

const TRAIT_KEYS = Object.freeze(['verve', 'poise', 'weave', 'dash', 'aim']);
const JITTER = 0.30; // ±0.15 around the doctrine anchor, deterministic per pilot

/**
 * Resolve a pilot's temperament. `entityId` is the stable per-ship seed component;
 * `doctrineId` picks the anchor row; `massBand` ('heavy'/'capital' from the sensor band
 * fields) keeps heavy hulls deliberate regardless of doctrine.
 */
export function temperamentFor(entityId, { seed = 1, doctrineId = null, massBand = null } = {}) {
  const anchor = DOCTRINE_ANCHORS[doctrineId] || TEMPERAMENT_IDENTITY;
  const key = entityId == null ? 'anonymous' : String(entityId);
  const heavy = massBand === 'heavy' || massBand === 'capital';
  const out = { id: anchor.id };
  for (const trait of TRAIT_KEYS) {
    const jitter = (hashUnit(seed, key, 'temperament', trait) - 0.5) * JITTER;
    let value = clamp(anchor[trait] + jitter, 0, 1);
    // A flying fortress never dodges like a wasp; a wasp never sits like a fortress.
    if (heavy) {
      if (trait === 'weave' || trait === 'dash' || trait === 'verve') value *= 0.55;
      else value = Math.min(1, value * 1.2 + 0.08);
    }
    out[trait] = value;
  }
  return out;
}

/** Inspection label for the dominant trait pairing (dodger vs shooter). */
export function temperamentLabel(t) {
  if (!t) return 'crew';
  if (t.aim >= 0.7 && t.weave < 0.5) return 'gunner';
  if (t.weave >= 0.6 && t.aim < 0.5) return 'dodger';
  if (t.dash >= 0.6) return 'breaker';
  if (t.verve >= 0.75) return 'driver';
  if (t.poise >= 0.72) return 'steady';
  return t.id || 'crew';
}
