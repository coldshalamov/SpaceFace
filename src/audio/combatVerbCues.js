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
  'mining:yield': SILENT('Ore yield is the semantic mining voice (mining.yield.collected); a verb-cue play would double it.'),
  'mining:seamHit': SILENT('A seam reward is the semantic mining voice (mining.seam.reward); a verb-cue play would double it.'),
  'mining:beamLocked': 'sfx_mining_beam',
  'mining:heatChanged': SILENT('Heat is a meter, not a sting; the WANTED crossing already has its own heat voice.'),
  // mining:ventReady row lives in the packet-C block at the foot of this table
  // (sfx_vent_chime, shared with the presentation route); it is not duplicated here.
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

  // jump:start/arrive rows live in the packet-C block at the foot of this table
  // (semantic journey voices); they are not duplicated here.
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
  'tether:snagged': 'sfx_tether_twang',
  // Same twang family as a snag. The strain instrument owns nearBreak / loaded phase.
  'tether:rebound': 'sfx_tether_twang',
  'tether:snagCleared': SILENT('A cleared snag is the reel moving again, which already has its voice.'),
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
  'fields:hitchLatched': 'sfx_hitch_latch',
  'cloak:faded': 'sfx_cloak_fade',
  'cloak:dropped': 'sfx_massline_cloak_off',
  'massline:releaseCancelled': 'sfx_ui_switch_detent',
  'weapons:momentumSinkPlanted': 'sfx_vector_mine',
  'weapons:momentumSinkReleased': 'sfx_ui_drawer_latch',
  'fields:hitchCut': 'sfx_tether_twang',

  'cruise:engaged': SILENT('Cruise engage is owned by the lane-lock voice (presentation.travel.lane_lock); a boost row would double it.'),
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
  'salvage:reactorTowedClear': 'sfx_wanted_clear',
  'salvage:reactorVented': 'sfx_hull_stress_groan',
  'salvage:changed': SILENT('Salvage bay fill is a meter, not a sting.'),
  'salvage:bayCashedIn': SILENT('The cash-in already plays sfx_loot_collect.'),
  'salvage:claimJumped': SILENT('The protest is the claim toast and the law report, not a second sting.'),
  'salvage:coreEjected': SILENT('The eject is the warning toast and the loose core, not a second sting.'),
  'salvage:cookerFlight': SILENT('The cooking core is the crew bark, not a second sting.'),
  'salvage:coreDetonated': SILENT('The blast is the damage packet; this emit is the chain record.'),
  'gate:verdict': SILENT('The verdict is the comms line and the toll; this emit is the record.'),
  'intervention:jumperRipped': SILENT('The rip is the tether toast; the line already has its own voice.'),

  'dock:docked': 'sfx_dock_clunk',
  'dock:undocked': 'sfx_undock_release',

  // EAR+FIGHT shared packet C: every player-caused emit in the audit names an existing
  // recipe, or stays SILENT with a reason. No new recordings.
  // bombs:detonated already emits a per-payload audio:cue from bombs._emitDetonated
  // (def.audioCue / def.collapseAudioCue, e.g. bombs.concussion.shove -> sfx_bomb_concussion_shove).
  // This row lets the normalized verb-cue route (combatVerbRecipe) resolve the same family
  // without duplicating that direct cue.
  'bombs:detonated': 'sfx_bomb_concussion_shove',
  // hull:fractured is a brittle rock/hull split: the mining fracture break (sub + noise) reads
  // as breakage, not combustion, and stays distinct from sfx_explosion_small.
  'hull:fractured': 'sfx_mining_fracture_break',
  // cargo:hotDockSpill announces through cargo's own undock receipt (toast + audio:cue 'alert'):
  // the spill lands under the dock clunk with the station hub up, so a verb-route sting here
  // would play into the hub instead of the moment the player can act on it.
  'cargo:hotDockSpill': SILENT('The spill receipt is the undock toast + alert cue; the dock clunk owns the arrival moment.'),
  // jump start/arrive own semantic journey voices (travel.jump.committed / travel.arrival ->
  // sfx_travel_commit / sfx_travel_arrival). The raw bus rows deliberately stay out of the
  // verb-cue route so the audio lane never stacks a direct voice with the journey voice.
  'jump:start': SILENT('Jump departure is owned by the semantic journey voice (travel.jump.committed); a verb-cue row would double it.'),
  'jump:arrive': SILENT('Jump arrival is owned by the semantic journey voice (travel.arrival); a verb-cue row would double it.'),
  // mining:ventReady already chimes via presentation (mining.vent.ready -> sfx_vent_chime).
  // combatVerbRecipe must resolve the same existing recipe so a verb-route audit sees it.
  'mining:ventReady': 'sfx_vent_chime',
  // mining:heatChanged is a continuous meter, not a sting. The WANTED crossing already has a
  // voice via the heat:changed packet; the mining meter itself stays silent (row above).
  // player:respawn already chimes via audioSystem._onPlayerRespawn (sfx_respawn_chime x2).
  // brake has no bus event at all: the brake's rising-edge bite (sfx_brake_bite) is played
  // directly in audioSystem._updateBrakeHiss, one cue per press. There is no 'brake' verb
  // to map, so no row is added here.
  'player:respawn': 'sfx_respawn_chime',
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
