// swarmQuickStart.js — the title's one-press Swarm entry (S4 "one press to the fight").
//
// A pure, frozen record: the ruleset, the arena, the stake, the starter build, and the
// armory flag the opening phase machine reads. Nothing here knows about screens, seeds, or
// DOM — the title asks for a SETUP (the same shape the Crucible door hands the launch path)
// and the launch path runs it through the ordinary New Game route. Every referenced id is
// validated against its catalog at construction time so a renamed starter or stake can never
// silently launch a broken run.
//
// `openArmoryBeforeRound1: false` is the quick-start's one difference from the Crucible door:
// the armory stays reachable (Esc → settings → the refit screen between waves is untouched —
// it is still one click away) but round 1 begins in flight. The full setup experience — seed
// field, stake ladder, starter row — remains behind the ordinary CRUCIBLE verb.

import { SWARM_RULESET } from './swarmMode.js';
import { survivalArenaById } from './survivalArenas.js';
import { SWARM_STAKE_BY_ID, SWARM_DEFAULT_STAKE_ID } from './swarmStakes.js';
import { COMBAT_LAB_STARTER_PACKAGES } from './combatLabSetups.js';

export const SWARM_QUICK_START = Object.freeze({
  ruleset: SWARM_RULESET,
  arenaId: 'helios_core',
  stakeId: SWARM_DEFAULT_STAKE_ID,
  starterPackageId: 'ricochet_runner',
  openArmoryBeforeRound1: false,
});

/** True when every id the record names resolves against its catalog. Pure lookup — no side
 *  effects, safe to call from a test or a boot-time assert. */
export function swarmQuickStartValid(record = SWARM_QUICK_START) {
  if (!record || typeof record !== 'object') return false;
  if (record.ruleset !== SWARM_RULESET) return false;
  if (!survivalArenaById(record.arenaId)) return false;
  if (!SWARM_STAKE_BY_ID[record.stakeId]) return false;
  if (!COMBAT_LAB_STARTER_PACKAGES.some((pkg) => pkg.id === record.starterPackageId)) return false;
  if (record.openArmoryBeforeRound1 !== false) return false;
  return true;
}

/** The launch extras the title passes to `crucibleSetupFor` — the same fields the door's own
 *  setup carries, plus the armory flag that rides the begin request into run telemetry.
 *  Returns null rather than a half-valid record: a broken catalog entry must fail loudly on
 *  the title, not mid-boot. */
export function swarmQuickStartExtras() {
  if (!swarmQuickStartValid(SWARM_QUICK_START)) return null;
  return {
    arenaId: SWARM_QUICK_START.arenaId,
    ruleset: SWARM_QUICK_START.ruleset,
    starterId: SWARM_QUICK_START.starterPackageId,
    swarmStake: SWARM_QUICK_START.stakeId,
    openArmoryBeforeRound1: SWARM_QUICK_START.openArmoryBeforeRound1,
  };
}
