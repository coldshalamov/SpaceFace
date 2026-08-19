// Canonical standing-reason phrase bank + law-cause pin for provenance joins.
// UI screens render labels from this module; systems own emitting reason ids.

export const REP_REASON_LABELS = Object.freeze({
  init: 'new-save baseline',
  complete_faction_mission: 'completed faction mission',
  fail_faction_mission: 'failed or expired mission',
  trade_at_faction_station: 'station trade',
  caught_contraband: 'contraband scan',
  rescue_faction_distress: 'distress rescue',
  kill_faction_ship: 'faction ship kill',
  kill_faction_enemy_ship: 'rival kill bounty',
  war_won: 'war outcome support',
  war_lost: 'war outcome loss',
  decay: 'reputation decay',
  bribe_standing: 'standing bribe paid',
});

// Reasons that can be causally joined to lawSecurity receipt causes.
export const REASON_TO_CAUSE = Object.freeze({
  kill_faction_ship: Object.freeze(['player_attack', 'player_assault', 'player_piracy']),
  kill_faction_enemy_ship: Object.freeze(['player_attack', 'player_assault', 'player_piracy']),
});

// lawSecurity receipt causes that are valid and intentionally do not move faction standing.
export const CAUSES_WITHOUT_REP = Object.freeze([
  'authored_danger',
  'hostile_fire',
  'npc_piracy',
  'payload_theft',
  'refused_demand',
  'security_response',
  'self_defense',
  'unknown',
  'unmotivated',
  'valuable_cargo',
  'wanted_status',
]);
