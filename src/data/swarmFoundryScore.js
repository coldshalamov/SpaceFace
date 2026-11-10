// One opening score shared by the wave's existing owners. These are read windows,
// not a second round director: finite quotas, damage, motion and clears stay put.
const rows = [
  ['first_strike', 'Throw the first strike', 'Send loose mass through the pack. Guns work too.', 0, 0, 0, 0],
  ['hold_a_side', 'Choose a side to hold', 'Hold one approach, then cross to the other.', 120, 300, 0, 0],
  ['read_the_mark', 'Dodge the mark', 'Move after the acid mark commits; return fire from clear ground.', 360, 0, 0, 0],
  ['throw_then_move', 'Throw, then move', 'Release through the pack, then leave the acid mark.', 360, 720, 0, 0],
  ['break_the_maw', 'Break Iron Maw', 'Read the Maw first. Acid and fuse-lit reinforcements arrive later.', 0, 720, 360, 480],
  ['use_the_wreck', 'Make the wreck work', 'If the Maw offcut survives nearby with a clear lane, use it against the pack. Guns work too; Jackal mines follow.', 360, 480, 0, 0],
  ['spend_the_charge', 'Let the charge spend itself', 'Leave the Maw offcut as cover, or throw it. Bait the charge and sidestep.', 480, 0, 0, 0],
  ['slip_the_lance', 'Slip the rail shot', 'The Lancer opens alone. When it charges, strafe sideways, then close while it resets. The crowd follows.', 480, 1, 480, 480],
];

export const SWARM_FOUNDRY_SCORE = Object.freeze(rows.map(([id, title, preparation,
  shipReadTicks, debutReadTicks, broodReadTicks, sporeReadTicks], index) => Object.freeze({
  id, wave: index + 1, title, preparation, shipReadTicks, debutReadTicks,
  broodReadTicks, sporeReadTicks,
  // Existing physical banks remain the room's reference; no rotating wall lesson
  // competes with the wreck payoff on round six.
  arenaPhase: index === 4 ? 'boss' : 'loose_plate',
  massGap: false,
  events: 'quiet',
  broodPacketSize: 18,
  broodPacketGapS: 0.75,
  bankReadS: index === 6 ? 8 : 0,
  ...(index === 7 ? { debutAtTick: 0 } : {}),
})));

export function swarmFoundryRound({ arenaId, wave, mutators = [], circuitRound = null } = {}) {
  if (arenaId !== 'helios_core' || !Number.isInteger(wave) || wave < 1 || wave > SWARM_FOUNDRY_SCORE.length
    || (Array.isArray(mutators) && mutators.length > 0) || circuitRound) return null;
  return SWARM_FOUNDRY_SCORE[wave - 1];
}

// Only a real plan opts its consumers in. Old saves, isolated engine callers and
// other modes keep their original contracts rather than acquiring a new clock.
export function foundryScoreFromPlan(plan, wave) {
  const score = plan?.swarm?.foundry;
  const canonical = Number.isInteger(wave) ? SWARM_FOUNDRY_SCORE[wave - 1] : null;
  return canonical && score?.id === canonical.id && score.wave === wave ? canonical : null;
}
