// Canonical standing-reason phrase bank + law-cause pin for provenance joins.
// UI screens render labels from this module; systems own emitting reason ids.
// WF-09: the bank covers every standing reason the register can read back, so a deed
// surfaces as words ("distress rescue · +20") and never as a raw reason id.

export const REP_REASON_LABELS = Object.freeze({
  init: 'new-save baseline',
  new_game_seed: 'new-save baseline',
  complete_faction_mission: 'completed faction mission',
  fail_faction_mission: 'failed or expired mission',
  trade_at_faction_station: 'station trade',
  caught_contraband: 'contraband scan',
  contraband: 'contraband scan',
  rescue_faction_distress: 'distress rescue',
  kill_faction_ship: 'faction ship kill',
  kill_faction_ship_collision: 'collision kill of their ship',
  kill_faction_enemy_ship: 'rival kill bounty',
  kill_discovered: 'discovered kill of their ship',
  kill_discovered_collision: 'discovered collision kill',
  war_won: 'war outcome support',
  war_lost: 'war outcome loss',
  decay: 'reputation decay',
  bribe_standing: 'standing bribe paid',
  station_growth: 'station grew on your freight',
  depot_provisioning: 'depot provisioning run',
  endgame_pull_victim: 'endgame pull loss',
  stunt_trick: 'stunt reputation',
  story_branch: 'branch choice support',
  story_branch_opposing: 'chose against them',
  moralTrap: 'moral debt',
  salvage_rights_redeem: 'salvage rights redeemed',
  wreck_cathedral_archive: 'archive returned',
  world_site_recovery: 'world site recovered',
  cinder_sluice_recovery: 'cinder sluice recovered',
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

// Compound reasons carry their family as a `prefix:suffix` id; the family names the deed and
// the suffix (a mission type, a defense outcome) is spoken as its own words when it reads well.
const REASON_PREFIX_LABELS = Object.freeze({
  mission_failed: 'mission failed',
  mission_expired: 'mission expired',
  story: 'story beat',
  recovery: 'wreck recovery',
  claim_defense: 'claim defense',
});

function humanizeTail(tail) {
  return String(tail || '').replace(/[_-]+/g, ' ').trim();
}

/** One label for any standing reason id. Unknown ids stay honest: humanized, never invented. */
export function repReasonLabel(reason) {
  const raw = String(reason == null ? '' : reason).trim();
  if (!raw) return 'unknown event';
  if (raw.startsWith('spillover:')) {
    return 'ally/rival spillover (' + repReasonLabel(raw.slice('spillover:'.length)) + ')';
  }
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const family = raw.slice(0, colon);
    const label = REASON_PREFIX_LABELS[family];
    if (label) {
      const tail = humanizeTail(raw.slice(colon + 1));
      return tail ? `${label} (${tail})` : label;
    }
  }
  return REP_REASON_LABELS[raw] || humanizeTail(raw);
}
