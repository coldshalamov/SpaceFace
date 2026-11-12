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
  ['break_the_guard', 'Break the guard', 'A Warden guards a Lancer. Attack the guard or circle its screen; dodge the rail charge. A lone glowing Cyst follows: burst it away from your hull to scatter the pack.', 840, 1, 840, 840],
  ['reach_the_exit', 'Reach the first exit', 'The Corsair opens alone. Dodge its charged lance, then return fire as it peels away. The forecast event follows, then the crowd. Clear the round to refit, bank or extract.', 840, 1, 840, 840],
  ['shed_the_drag', 'Shed the drag', 'A Leecher latches and slows you. Shoot it on approach, or carry it into a fast scrape against solid rock. A clear nearby surface earns a lone first approach; the crowd follows.', 720, 720, 720, 720],
  ['turn_the_hunt', 'Turn the hunt', 'The Quiet Ghost opens alone. Strafe its charge, then close as it switches flank. A Leecher follows if a nearby scrape lane is clear; recover your speed before the crowd.', 1080, 1, 1080, 1080],
  ['crack_the_shell', 'Crack the shell', 'The Cutter opens alone: cross its plated nose and attack the flank. A Glassback follows beside usable loose mass if the lane is clear. Guns cannot crack its shell; ram or throw mass, then leave the shards.', 1080, 1, 1080, 1080],
  ['peel_the_screen', 'Peel the screen', 'A Point-Defense Screen covers the Cutter. Break the escort or circle its firing position; then work the Cutter flank. The crowd follows.', 840, 1, 840, 840],
  ['cross_the_foreman', 'Cross the Foreman', 'Read the Foreman alone first. Leave the locked charge lane, cross behind its mirrored prow and attack during the coast. Watch the stern vent; the Lawman and crowd follow.', 1200, 1200, 1200, 1200],
  ['keep_your_line', 'Keep your line', 'The Tether-Control Raider opens alone. Its spool commits to your loaded line: swing the anchor away or release before the cut. Fight with guns if you prefer; the crowd follows.', 840, 1, 840, 840],
  ['ring_the_bell', 'Ring the Bellows', 'A Bellows and pack can open beside surviving solid cover. Shoot until it swells, then finish it or let the fuse burst it. Keep clear of the shockwave, or turn its shove into the bank. The crowd follows.', 600, 600, 600, 600],
  ['slip_the_weight', 'Slip the weight', 'The Bruiser opens alone. Its engine flare announces a committed pass: slip sideways, then attack while it hauls around. Leave room to escape; the crowd follows.', 840, 1, 840, 840],
  ['cross_the_kraken', 'Cross the Kraken', 'Iron Kraken opens alone. Dodge the marked arms and locked jet; fire into its open front core during recovery. A Bellows pocket follows if solid cover is still usable. Keep an escape lane before the crowd arrives.', 1080, 1080, 1080, 1080],
  ['earn_the_second_exit', 'Earn the second exit', 'A screen covers the Raider; the Bruiser follows. Choose an exposed target, keep an escape lane, then face the forecast event and the crowd. Clear to refit, bank or extract, or carry on.', 1200, 1200, 1200, 1200],
  ['split_the_chase', 'Split the chase', 'The Ghost hunts from one side; the Bruiser follows from the other. Cross a committed pass rather than backing into the second approach. The crowd follows.', 960, 960, 960, 960],
  ['read_the_anchor', 'Read the anchor', 'The Anchor Controller opens alone. Leave its marked snare before it commits, then close during recovery. Its field catches the pack too; the crowd follows.', 840, 1, 840, 840],
  ['uncover_the_anchor', 'Uncover the anchor', 'A Warden guards the Anchor Controller. Break the escort or work around its screen; keep outside the marked snare, then attack during recovery. The crowd follows.', 1080, 1080, 1080, 1080],
];

export const SWARM_FOUNDRY_SCORE = Object.freeze(rows.map(([id, title, preparation,
  shipReadTicks, debutReadTicks, broodReadTicks, sporeReadTicks], index) => Object.freeze({
  id, wave: index + 1, title, preparation, shipReadTicks, debutReadTicks,
  broodReadTicks, sporeReadTicks,
  // Existing physical banks remain the room's reference; no rotating wall lesson
  // competes with the wreck payoff on round six.
  arenaPhase: index === 4 || index === 14 ? 'boss' : 'loose_plate',
  massGap: false,
  events: index === 9 || index === 19 ? 'seeded' : 'quiet',
  broodPacketSize: 18,
  broodPacketGapS: 0.75,
  bankReadS: index === 6 ? 8 : 0,
  ...(index === 7 ? { debutAtTick: 0 } : {}),
  ...(index === 8 ? { debutAtTick: 0, cystAtTick: 480 } : {}),
  ...(index === 9 ? { debutAtTick: 0, eventReadTicks: 480 } : {}),
  ...(index === 10 ? { leecherAtTick: 1 } : {}),
  // Optional surviving terrain must not determine the primary ship's read time.
  ...(index === 11 ? { debutAtTick: 0, leecherAtTick: 600, characterForeground: true } : {}),
  ...(index === 12 ? { debutAtTick: 0, glassbackAtTick: 480, characterForeground: true } : {}),
  ...(index === 13 ? { debutAtTick: 0 } : {}),
  // Post-Foreman is one five-round act ending at the existing second exit.
  // The schedule borrows ordinary owed seats; each package keeps its real AI.
  ...(index >= 15 ? { protectForeground: true, bankScene: false } : {}),
  ...(index === 15 || index === 17 ? { debutAtTick: 0 } : {}),
  ...(index === 16 ? { bellowsAtTick: 1 } : {}),
  ...(index === 18 ? { bellowsAtTick: 480, characterForeground: true } : {}),
  ...(index === 19 ? { eventReadTicks: 720, foregroundShips: Object.freeze([
    Object.freeze({ enemyId: 'pd_screen_escort', role: 'support', gate: 'nw', readTicks: 1 }),
    Object.freeze({ enemyId: 'tether_control_raider', role: 'control', gate: 'nw', readTicks: 1 }),
    Object.freeze({ enemyId: 'bruiser_brawler', role: 'anchor', gate: 'se', readTicks: 360 }),
  ]) } : {}),
  // The second exit leads into one combined-pressure act. Reuse the canonical
  // Anchor debut, then pair learned threats; ordinary seats pay every entrance.
  ...(index === 20 ? { foregroundShips: Object.freeze([
    Object.freeze({ enemyId: 'quiet_ghost', role: 'reach', gate: 'nw', readTicks: 1 }),
    Object.freeze({ enemyId: 'bruiser_brawler', role: 'anchor', gate: 'se', readTicks: 360 }),
  ]) } : {}),
  ...(index === 21 ? { debutAtTick: 0 } : {}),
  ...(index === 22 ? { foregroundShips: Object.freeze([
    Object.freeze({ enemyId: 'warden_escort', role: 'support', gate: 'nw', readTicks: 1 }),
    Object.freeze({ enemyId: 'field_anchor_controller', role: 'anchor', gate: 'nw', readTicks: 1 }),
  ]) } : {}),

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
