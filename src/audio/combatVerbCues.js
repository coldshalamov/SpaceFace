// Every player-caused gameplay emit names an existing recipe, or SILENT with a reason.
// No new recordings. Internal bookkeeping may be SILENT.

const SILENT = (reason) => Object.freeze({ recipe: 'SILENT', reason });

export const COMBAT_VERB_CUES = Object.freeze({
  fire: 'sfx_wpn_pulse_laser',
  hit: 'sfx_hull_scrape',
  shield: 'sfx_shield_blowout_pop',
  hull: 'sfx_hull_stress_groan',
  shove: 'sfx_bomb_concussion_shove',
  throwRelease: 'sfx_tether_twang',
  latch: 'sfx_tether_latch_lock',
  break: 'sfx_tether_crack',
  slam: 'sfx_hull_decompress',
  kill: 'sfx_kill_confirm',
  dock: 'sfx_dock_clunk',
  undock: 'sfx_undock_release',
});

export const PLAYER_ACTION_CUES = Object.freeze({
  ...COMBAT_VERB_CUES,
  'combat:fire': 'sfx_wpn_pulse_laser',
  'combat:shove': 'sfx_bomb_concussion_shove',
  'projectile:hit': 'sfx_hull_scrape',
  shieldRestored: 'sfx_shield_blowout_pop',

  'mining:start': 'sfx_mining_beam',
  'mining:stop': SILENT('The beam stopping is the absence of the mining tone.'),
  'mining:tick': 'sfx_mining_impact',
  'mining:yield': 'sfx_mining_impact',
  'mining:seamHit': 'sfx_mining_impact',
  'mining:beamLocked': 'sfx_mining_beam',
  'mining:heatChanged': SILENT('Heat is a meter, not a sting.'),
  'mining:ventReady': SILENT('The vent-ready lamp is visual.'),
  'mining:ventBonus': 'sfx_mining_impact',
  'mining:richCoreChargeStart': 'sfx_mining_beam',
  'mining:richCoreCompleted': 'sfx_mining_impact',
  'mining:richCoreExposed': 'sfx_mining_impact',
  'mining:richCoreFizzle': 'sfx_hull_scrape',
  'mining:podSplit': SILENT('Pod split is a cargo bookkeeping split.'),
  'mining:bulkHaulDelivered': 'sfx_ui_confirm',
  'mining:bulkRequiresTether': SILENT('The refusal is the missing line, already shown.'),
  'mining:npcExtraction': SILENT('NPC extraction is bookkeeping, not the player\'s tool.'),

  scrape: 'sfx_hull_scrape',
  'ship:boostStart': 'sfx_engine_boost',
  'ship:boostStop': SILENT('Boost release is the engine returning to the thrust voice.'),
  'ship:boostPreKick': SILENT('The pre-kick is the same boost voice winding up.'),
  boost: 'sfx_engine_boost',

  'jump:start': SILENT('Jump departure is the gate visual; no jump sting is authored.'),
  'jump:arrive': SILENT('Jump arrival is the gate visual; no jump sting is authored.'),
  'jump:chargeStart': SILENT('Jump charge is the travel drive already heard as thrust.'),
  'jump:chargeTick': SILENT('Jump charge ticks are the travel drive, not a new sting.'),
  'jump:chargeAbort': SILENT('Aborting a jump adds no authored sting.'),
  'jump:departurePreflight': SILENT('Preflight is a checklist, not a sting.'),
  'jump:unfiledConfirmed': SILENT('The unfiled confirm is UI, not a world sting.'),
  'world:requestJump': SILENT('The jump request is the same unauthored gate transit.'),
  'world:abortJumpCharge': SILENT('Aborting the charge adds no authored sting.'),
  'world:confirmUnfiledJump': SILENT('The confirm is UI copy, not a world sting.'),
  'world:requestUnfiledJump': SILENT('The request is UI copy, not a world sting.'),

  alarm: SILENT('The wanted alarm is the existing heat voice, not a new siren.'),
  'credits:changed': 'sfx_ui_confirm',
  payout: 'sfx_ui_confirm',

  'contactHail:offer': SILENT('The hail is the comms voice line, not a second sting.'),
  'contactHail:response': SILENT('The reply is the comms voice line.'),
  'contactHail:availability': SILENT('Hail availability is bookkeeping.'),
  'contactHail:clear': SILENT('Clearing a hail is bookkeeping.'),
  'contactHail:handoff': SILENT('The handoff is bookkeeping between comms speakers.'),
  hail: SILENT('The hail is the comms voice line, not a second sting.'),

  'tether:latched': 'sfx_tether_latch_lock',
  'tether:attached': 'sfx_tether_latch_lock',
  'tether:broke': 'sfx_tether_crack',
  'tether:broken': 'sfx_tether_crack',
  'tether:cut': 'sfx_tether_twang',
  'tether:released': 'sfx_tether_twang',
  'tether:releaseRated': 'sfx_tether_twang',
  'tether:strain': SILENT('Strain is the continuous rope voice, not a one-shot.'),
  'tether:reel': SILENT('Reel is the continuous winch voice.'),
  'tether:reelPump': SILENT('Reel pump is the same winch voice.'),
  'tether:nearBreak': 'sfx_tether_crack',
  'tether:whipImpact': 'sfx_hull_decompress',
  'tether:whipSnap': 'sfx_tether_crack',
  'tether:snapCatch': 'sfx_tether_latch_lock',
  'tether:latchDenied': SILENT('A refused latch is silence; the line did not meet.'),
  'tether:cutDenied': SILENT('A refused cut leaves the line where it is.'),
  'tether:lineControlDenied': SILENT('A refused reel is the winch not moving.'),
  'fields:hitchLatched': 'sfx_tether_latch_lock',
  'fields:hitchCut': 'sfx_tether_twang',

  'cruise:engaged': 'sfx_engine_boost',
  'cruise:dropped': SILENT('Dropping cruise is the thrust voice falling back.'),
  'cruise:charging': SILENT('Cruise charge is the thrust voice, not a new sting.'),
  'cruise:snared': 'sfx_hull_scrape',
  'cruise:snareRequest': SILENT('The snare request is bookkeeping until the line meets.'),

  'drill:start': 'sfx_mining_beam',
  'drill:end': SILENT('The drill stopping is the beam ending.'),
  'drill:break': 'sfx_mining_impact',
  'drill:spark': 'sfx_mining_impact',
  'drill:yield': 'sfx_mining_impact',
  'drill:gasHit': 'sfx_hull_scrape',
  'drill:cargoFull': SILENT('A full hold is a meter, not a sting.'),
  'drill:rockDepleted': 'sfx_asteroid_depleted',
  'drill:scanPulse': 'sfx_mining_scan_root',
  'drill:warn': SILENT('The drill warning is the existing alarm voice.'),
  'drill:approachStarted': SILENT('Approach is flight, already the thrust voice.'),
  'drill:approachCompleted': SILENT('Arrival is flight, not a new sting.'),
  'drill:approachCancelled': SILENT('A cancelled approach adds no sting.'),
  'drill:retry': SILENT('Retry is bookkeeping.'),

  'salvage:cutComplete': 'sfx_mining_impact',
  'salvage:actionRead': SILENT('Reading a salvage action is UI.'),
  'salvage:communicatorFound': SILENT('The find is the comms voice.'),
  'salvage:completed': 'sfx_ui_confirm',
  'salvage:fieldVulture': SILENT('An NPC vulture is not the player\'s tool.'),
  'salvage:npcExtraction': SILENT('NPC extraction is bookkeeping.'),
  'salvage:npcUnload': SILENT('NPC unload is bookkeeping.'),
  'salvage:placed': SILENT('Placement is the same cut, already heard when it completes.'),
  'salvage:reactorBurst': 'sfx_hull_decompress',
  'salvage:reactorTowedClear': SILENT('The clear is bookkeeping after the tow.'),
  'salvage:reactorVented': 'sfx_hull_stress_groan',

  'dock:docked': 'sfx_dock_clunk',
  'dock:undocked': 'sfx_undock_release',
});

export const COMBAT_VERB_IDS = Object.freeze(Object.keys(COMBAT_VERB_CUES));

export function combatVerbCueRow(verbId) {
  const row = PLAYER_ACTION_CUES[verbId] || COMBAT_VERB_CUES[verbId];
  if (!row) return null;
  if (typeof row === 'string') return { recipe: row, reason: '' };
  return row;
}

export function combatVerbRecipe(verbId) {
  const row = combatVerbCueRow(verbId);
  if (!row || row.recipe === 'SILENT') return '';
  return row.recipe || '';
}
