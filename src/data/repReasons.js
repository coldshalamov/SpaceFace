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
  // inf-standing-reason-words — the rest of the register's vocabulary: every standing reason
  // the repo emits reads as words, per this bank's own law. Phrased from each emitter's own
  // beat, not invented from the id.
  arena_law_bounty: 'arena law bounty',
  choir_circuit: 'choir circuit flown',
  choir_escort: 'choir escort kept',
  choir_heresy_silenced: 'heresy silenced for the choir',
  choir_pilgrim_leg: 'pilgrim leg flown',
  civilian_freight_recovery: 'civilian freight recovered',
  compost_run: 'compost run delivered',
  understory_compost_run: 'understory compost run delivered',
  cover_burned: 'cover burned at their checks',
  cover_fined: 'cover fined at their checks',
  cover_tip: 'cover tip repaid',
  cover_warned: 'cover questioned at their checks',
  dock_slam: 'dock slam fine',
  fence_route: 'fence route run',
  lawful_inspection_clear: 'inspection passed',
  lawful_inspection_escape: 'inspection fled',
  pallas_hidden_cache_report: 'hidden cache reported',
  restitution_settled: 'restitution paid',
  sandbox: 'sandbox session',
  sommelier_patronage: 'sommelier patronage',
  standby_fee_settled: 'standby bill settled',
  standby_fee_late_assessed: 'standby bill assessed late',
  surrender_custody: 'surrendered to custody',
  vael_lien_cut: 'lien payload cut loose',
  vesta_ore_cache_report: 'vesta cache reported',
  event: 'unfiled event',
  'verge:clean_transit': 'clean border transit',
  'verge:permit_clean': 'border permit kept clean',
  'verge:escort_complied': 'border escort obeyed',
  'verge:escort_broken': 'border escort broken',
  'verge:border_flight': 'fled the border',
  'verge:unauthorized_crossing': 'crossed the border unwelcome',
  'survivorPod:rescued': 'mayday answered',
  'survivorPod:strip': 'pod stripped for salvage',
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
  // inf-standing-reason-words — the compound families the repo actually emits.
  'choir_offering': 'choir offering',
  'choir_relief': 'choir relief work',
  'choir_sacrilege': 'sacrilege against the choir',
  'archive': 'archive deed',
  'cinderglass': 'cinderglass dealing',
  'gate3': 'gate three',
  'occupation_switch': 'occupation changed',
  'poi': 'site deed',
  'quill': 'quill affair',
  'special500': 'the five hundred',
});

function humanizeTail(tail) {
  // CamelCase splits and id punctuation dissolves: a future unphrased family id falls back to
  // words, never code.
  return String(tail || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_:\-]+/g, ' ')
    .trim();
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
  // The unphrased fallback reads as words too: lowercased, split, punctuation dissolved —
  // a deed that has not earned its phrase yet still never prints as code.
  return REP_REASON_LABELS[raw] || humanizeTail(raw).toLowerCase();
}
