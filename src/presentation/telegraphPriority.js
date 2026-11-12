// Telegraph attention hierarchy (packet 02, design/combat-convergence/02_COMBAT_READABILITY_AND_TARGETING.md).
//
// "A telegraph already shown cannot be deleted merely because an explosion requested the last VFX
// slot." and "prioritise by consequence and time-to-contact". This module is the one place both
// rules live, as pure functions the slot allocators consult:
//   * render/actionVfx.js — the 32-slot action-answer pool (an incoming telegraph may take the
//     lowest-ranked NON-telegraph slot instead of being refused; nothing ever evicts a telegraph
//     that ranks at or above the newcomer).
//   * systems/presentationOrchestrator.js — the admission priority a doctrine telegraph cue carries
//     into the shared particle/sprite/light pools (vfxAdmissionPriority honours an explicit value).
//
// PURE and TOTAL: no state, no clock (callers pass elapsed/duration), no rng.
import { telegraphUrgency } from '../combat/telegraphFootprint.js';

/**
 * How much it costs the player to miss this tell, 0..1. A lethal committed attack (fuse, ram,
 * alpha strike, broadside) outranks a nuisance (a scan sweep, a stalking ghost). Unknown kinds read
 * as an ordinary attack.
 */
export const TELEGRAPH_CONSEQUENCE = Object.freeze({
  detonator_fuse: 1.0,
  broadside_desperation: 0.95,
  attackRun: 0.9,
  alphaStrike: 0.9,
  broadside_charge: 0.9,
  shield_lance: 0.9,
  weapon_charge: 0.8,
  furnace_preheat: 0.75,
  wake_mines: 0.6,
  swarmer_vent: 0.55,
  return_fire_warning: 0.5,
  attach_spool: 0.5,
  field_spool: 0.5,
  engine_flare: 0.45,
  pirate_stalk: 0.35,
  mothlight_iris: 0.35,
  pd_curtain: 0.3,
  sensor_ghost: 0.3,
  scan_sweep: 0.25,
});
const DEFAULT_CONSEQUENCE = 0.6;

export function telegraphConsequence(kind) {
  const c = TELEGRAPH_CONSEQUENCE[kind];
  return Number.isFinite(c) ? c : DEFAULT_CONSEQUENCE;
}

/**
 * The admission priority a telegraph carries into the shared VFX pools, 0.7..1: by consequence,
 * rising as contact nears, and higher when it is aimed at the player. An ordinary explosion's own
 * priority tops out near 0.9, so an imminent lethal tell outlives it while a distant nuisance does
 * not outrank a catastrophe.
 */
export function telegraphAdmissionPriority({ kind, elapsedTicks = 0, durationTicks = 0, onPlayer = false } = {}) {
  const consequence = telegraphConsequence(kind);
  const urgency = telegraphUrgency(elapsedTicks, durationTicks);
  const base = onPlayer ? 0.78 : 0.7;
  return Math.min(1, base + 0.14 * consequence + 0.08 * urgency);
}

// ---- the action-answer slot pool ---------------------------------------------------------------

/** A non-telegraph answer's rank: continuous tool work is cheapest to drop, brief receipts next. */
function plainRank(slot) {
  const recipe = slot && slot.recipe;
  return recipe && recipe.continuous ? 0.1 : 0.3;
}

/**
 * Rank of a resident or incoming slot. Every telegraph outranks every non-telegraph answer (rank >
 * 1); among telegraphs the order is consequence, then time-to-contact. `elapsed`/`duration` are in
 * sim seconds.
 */
export function slotRank(event, kind, slot, now) {
  if (event !== 'ai:telegraph') return plainRank(slot);
  const recipe = slot && slot.recipe;
  const duration = recipe && Number.isFinite(recipe.life) ? recipe.life : 1.6;
  const elapsed = slot && Number.isFinite(slot.born) && Number.isFinite(now) ? Math.max(0, now - slot.born) : 0;
  return 1 + telegraphConsequence(kind) * (0.5 + 0.5 * telegraphUrgency(elapsed, duration));
}

/**
 * Which resident slot an incoming answer may take when the pool is full, or -1 (refuse).
 * Only a telegraph may displace anything, and only a resident that ranks STRICTLY below it: a
 * telegraph being read is never deleted for an explosion or an equal-consequence peer. The lowest
 * rank goes first; among equals the oldest.
 *   slots: ActionVfx slot rows ({alive, event, kind, born, recipe}); incoming: {event, kind}.
 */
export function chooseActionSlotVictim(slots, incoming, now) {
  if (!incoming || incoming.event !== 'ai:telegraph') return -1;
  const mine = slotRank('ai:telegraph', incoming.kind, null, now); // newborn: urgency 0
  let victim = -1;
  let victimRank = Infinity;
  let victimBorn = Infinity;
  for (let i = 0; i < slots.length; i += 1) {
    const s = slots[i];
    if (!s || !s.alive) continue;
    const rank = slotRank(s.event, s.kind, s, now);
    if (!(rank < mine)) continue;
    const born = Number.isFinite(s.born) ? s.born : 0;
    if (rank < victimRank || (rank === victimRank && born < victimBorn)) {
      victim = i; victimRank = rank; victimBorn = born;
    }
  }
  return victim;
}
