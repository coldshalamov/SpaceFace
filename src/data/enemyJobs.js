// Enemy jobs (design/overhaul/03_COMBAT.md §9A, ruling R19). Every enemy kind does exactly one
// job; the job decides its brain tier, what the player should do about it, how a cast reads in
// plain words, and what it costs a fight's budget. The composer (src/systems/encounterComposer.js)
// builds every fight from these rows.
//
// brain: 'pack'     — the shared context-steering pack brain (src/ai/pack/packBrain.js)
//        'pack+'    — the pack brain plus the kind's one extra behaviour (still its doctrine today;
//                     it moves onto the pack brain as that behaviour is ported)
//        'tactical' — the full tactical stack: phased Walls (bosses) and Sources only
// cost:  budget units — how hard the kind is to answer. Fodder is cheap so a late round can
//        still be a crowd.

export const ENEMY_JOB = Object.freeze({
  RUSH: 'rush',
  BURST: 'burst',
  REACH: 'reach',
  WALL: 'wall',
  SKIRMISH: 'skirmish',
  DENY: 'deny',
  SEIZE: 'seize',
  SOURCE: 'source',
});

/** Plain words for a job — the round card and contract card read these. */
export const ENEMY_JOB_WORDS = Object.freeze({
  rush: Object.freeze({ one: 'a rushing pack', answer: 'Shove or plough them; bowl a rock' }),
  burst: Object.freeze({ one: 'darts that dive and blow', answer: 'Shove them back into their friends' }),
  reach: Object.freeze({ one: 'a sniper on the rim', answer: 'Break its line with a rock, or close on the Line' }),
  wall: Object.freeze({ one: 'a heavy that is terrain', answer: 'Throw things at it; orbit it on the Line' }),
  skirmish: Object.freeze({ one: 'raiders on strafing passes', answer: 'Pin one mid-pass' }),
  deny: Object.freeze({ one: 'a ship that fills space with danger', answer: 'Use its mines and fields against its own side' }),
  seize: Object.freeze({ one: 'a ship that grabs you', answer: 'Cut the cable, or tow it into something' }),
  source: Object.freeze({ one: 'a carrier that makes more', answer: 'Kill the source first' }),
});

const row = (job, brain, cost, tell) => Object.freeze({ job, brain, cost, tell });

/**
 * One row per enemy id in src/data/enemies.js that fights. Law ships and traders have reasons to
 * be somewhere and are not combat jobs (they carry job: null).
 */
export const ENEMY_JOBS = Object.freeze({
  wasp_swarmer: row('rush', 'pack', 1, 'engine_flare'),
  choir_zealot: row('rush', 'pack', 1.5, 'engine_flare'),
  detonator_dart: row('burst', 'pack', 2, 'detonator_fuse'),
  lancer_sniper: row('reach', 'pack+', 4, 'charge_cue'),
  mothlight: row('reach', 'pack+', 5, 'weapon_charge'),
  quiet_ghost: row('seize', 'pack+', 4, 'shimmer_ripple'),
  bruiser_brawler: row('wall', 'pack+', 5, 'engine_flare'),
  kilnback: row('wall', 'pack+', 5, 'engine_flare'),
  corsair_raider: row('skirmish', 'pack+', 4, 'lance_cue'),
  reaver_pirate: row('skirmish', 'pack+', 3, 'pack_call'),
  scissorwake: row('skirmish', 'pack+', 4, 'engine_flare'),
  pallet_jack: row('seize', 'pack+', 4, 'engine_flare'),
  mine_layer_jackal: row('deny', 'pack+', 3, 'wake_mines'),
  field_anchor_controller: row('deny', 'pack+', 6, 'field_spool'),
  pd_screen_escort: row('deny', 'pack+', 4, 'tracer_stream'),
  warden_escort: row('deny', 'pack+', 5, 'ward_link'),
  tether_control_raider: row('seize', 'pack+', 4, 'rope_shot'),
  brood_tendril: row('rush', 'tactical', 6, 'engine_flare'),
  casket_worm: row('wall', 'tactical', 8, 'engine_flare'),
  nest_carrier: row('source', 'tactical', 12, 'broadside_charge'),
  brood_queen: row('source', 'tactical', 12, 'engine_flare'),
  hive_hulk: row('source', 'tactical', 14, 'broadside_charge'),
  dreadnought_boss: row('wall', 'tactical', 20, 'broadside_charge'),
  mirrorjaw_foreman: row('wall', 'tactical', 16, 'engine_flare'),
  forge_regent: row('wall', 'tactical', 20, 'lance_cue'),
  furnace_maw: row('wall', 'tactical', 16, 'broadside_charge'),
  yardmaster: row('wall', 'tactical', 18, 'broadside_charge'),
  adjudicator_44c: row('wall', 'tactical', 16, 'broadside_charge'),
  last_argument: row('wall', 'tactical', 24, 'broadside_charge'),
  enemy_iron_kraken: row('wall', 'tactical', 16, 'broadside_charge'),
  enemy_iron_kraken_colossus: row('wall', 'tactical', 22, 'broadside_charge'),
  patrol_lawman: row(null, 'tactical', 4, null),
  customs_cutter: row(null, 'tactical', 4, null),
  mule_trader: row(null, 'tactical', 0, null),
});

export function enemyJobFor(enemyId) {
  return typeof enemyId === 'string' ? ENEMY_JOBS[enemyId] || null : null;
}

/** Jobs of a cast list ([{ enemyId, count }]) in first-seen order, without duplicates. */
export function castJobs(cast) {
  const out = [];
  for (const entry of cast || []) {
    const row = enemyJobFor(entry && entry.enemyId);
    if (row && row.job && !out.includes(row.job)) out.push(row.job);
  }
  return out;
}
