// src/data/encounters.js — ENCOUNTER SHAPE DEFINITIONS (the "what happens here" layer).
//
// The encounterDirector runs a deterministic, pressure-budgeted campaign from this catalogue: it
// plans a small seeded schedule per sector-day (planEncounters), then a 1 Hz pacing gate decides
// WHEN each planned shape actually fires, based on pressure, spacing rules, and fire-time gates.
// This file is pure data + pure helpers — no imports, no Three.js, no RNG (callers pass their
// seeded sim RNG). Each shape declares:
//   * tier         — 'major' | 'minor' | 'ambient'. Majors are rare (≤1/10min), minors paced
//                    (≤2/10min); ambient is quiet world-life that never counts against those caps.
//   * deck         — 'combat' | 'civilian'. The two decks spend SEPARATE pressure pools so ambient
//                    civilian life never starves combat pressure and vice versa.
//   * weight       — relative selection weight when the planner rolls a slot.
//   * zoneTypes    — sectorZones ZONE_TYPES ids this shape can anchor to. No matching zone → the
//                    shape is simply not schedulable in that sector (additive, never crashes).
//   * script       — the director-side phase script that runs this shape (telegraph → offer →
//                    conflict/resolution → outcome → receipt). Symbolic id, resolved in
//                    encounterScripts.js — data stays serializable.
//   * pressureCost — pressure spent from the deck's pool when the shape fires. Spending IS the
//                    pacing valve: a fired encounter buys quiet time after it.
//   * cooldownS    — per-shape refire cooldown (sector-scoped, sim-time seconds).
//   * gates        — fire-time eligibility read from live state (cargo value, contraband, bounty,
//                    claims, named-captain pool). Planner schedules the slot; an ineligible slot
//                    fizzles quietly instead of spawning an unmotivated encounter.
//   * proximity    — if true the shape only fires while the player is on/near its anchor zone
//                    (zone reason is sacred: no spawns near the player without a why-here).
//   * squad/escort/boss/genuine/bait — spawn recipes; archetypes reference src/data/enemies.js.
//   * context      — ai.spawnContext for spawned ships. Hostiles 'encounter'; lawful 'patrol';
//                    civilians 'convoy_civilian' (non-danger). factionId is READABILITY only —
//                    hostility is decided by scanner.isHostileToPlayer via team/passive/lawful/
//                    context, never by factionId.
//   * bark         — the ONE primary comms line spoken on entry (one-voice law).
//   * choices      — compact choice descriptors for the offer phase. The director emits
//                    `encounter:choiceOffered` and accepts `encounter:choose`; every choice also
//                    has a PHYSICAL read (brake to pay, fly off to run, fire to refuse) so no
//                    modal UI is ever required. `timeoutChoice` is the deterministic default.
//
// Taste (spec2/00): encounter barks ≤14 words on variant arrays (≤12 on legacy single strings),
// no exclamation marks outside genuine emergencies, callsigns in caps on hails, receipts short
// and factual — they must never overclaim what actually changed.

/** Encounter shape catalogue, keyed by id. */
export const ENCOUNTERS = Object.freeze({
  // ═══ COMBAT DECK ═══════════════════════════════════════════════════════════════════════════════

  // ── PIRATE TOLL — Reach skiffs scan your hold and name a price ─────────────────────────────────
  pirate_toll: Object.freeze({
    id: 'pirate_toll',
    tier: 'minor',
    deck: 'combat',
    weight: 3,
    zoneTypes: ['trade_lane', 'ambush_lane', 'outlaw_zone', 'refinery_approach'],
    script: 'toll',
    pressureCost: 40,
    cooldownS: 300,
    proximity: true,
    // maxSecurity: never fire in Concord-safe cores (Helios freight spine is trade_lane but not Reach turf).
    gates: Object.freeze({ minCargoValue: 240, maxSecurity: 0.75 }),
    motive: 'cargo_extortion',
    engagementTrigger: 'demand_pending',
    factionId: 'faction_reach',
    context: 'encounter',                              // hostile-capable; held passive during the demand
    squad: Object.freeze({ archetypes: Object.freeze(['reaver_pirate', 'corsair_raider']), size: Object.freeze([2, 3]), doctrine: 'scavenger', formation: 'wedge' }),
    bark: 'toll_demand',
    offerS: 14,                                        // seconds to answer before the default fires
    choices: Object.freeze([
      Object.freeze({ id: 'pay', label: 'Pay toll', needs: 'credits' }),
      Object.freeze({ id: 'refuse', label: 'Refuse' }),
      Object.freeze({ id: 'run', label: 'Run' }),
    ]),
    timeoutChoice: 'refuse',
  }),

  // ── AMBUSH SNARE — pirates lying in wait; snares cruise if you barrel through ──────────────────
  ambush_snare: Object.freeze({
    id: 'ambush_snare',
    tier: 'minor',
    deck: 'combat',
    weight: 2,
    zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field'],
    script: 'ambush',
    pressureCost: 45,
    cooldownS: 420,
    proximity: true,
    gates: Object.freeze({}),
    factionId: 'faction_reach',
    context: 'encounter',
    squad: Object.freeze({ archetypes: Object.freeze(['reaver_pirate', 'wasp_swarmer', 'corsair_raider']), size: Object.freeze([2, 4]), doctrine: 'scavenger', formation: 'wedge' }),
    bark: 'ambush_tele',
  }),

  // ── PATROL SCAN — Concord matches your vector and sweeps the hold ──────────────────────────────
  patrol_scan: Object.freeze({
    id: 'patrol_scan',
    tier: 'minor',
    deck: 'combat',
    weight: 3,
    zoneTypes: ['patrol_corridor', 'border_checkpoint', 'civilian_core'],
    script: 'patrolScan',
    pressureCost: 25,
    cooldownS: 360,
    proximity: true,
    gates: Object.freeze({}),
    factionId: 'faction_scn',
    context: 'patrol',                                 // lawful; NEVER hostile to a clean player
    squad: Object.freeze({ archetypes: Object.freeze(['patrol_lawman']), size: Object.freeze([2, 2]), doctrine: 'official', formation: 'wedge' }),
    bark: 'patrol_scan_hail',
    scanS: 10,                                         // scan beam duration; staying in range = submit
    choices: Object.freeze([
      Object.freeze({ id: 'submit', label: 'Submit to scan' }),
      Object.freeze({ id: 'bribe', label: 'Bribe', needs: 'contraband+credits' }),
      Object.freeze({ id: 'dump', label: 'Dump cargo', needs: 'contraband' }),
      Object.freeze({ id: 'run', label: 'Run' }),
    ]),
    timeoutChoice: 'submit',
  }),

  // ── BOUNTY HUNTER — someone paid; they collect. Only fires while a bounty stands ───────────────
  bounty_hunter: Object.freeze({
    id: 'bounty_hunter',
    tier: 'minor',
    deck: 'combat',
    weight: 1,
    zoneTypes: ['ambush_lane', 'outlaw_zone', 'trade_lane', 'border_checkpoint'],
    script: 'bountyHunter',
    pressureCost: 50,
    cooldownS: 600,
    proximity: false,
    gates: Object.freeze({ bountyOnly: true }),
    motive: 'bounty_collection',
    engagementTrigger: 'active_bounty_contract',
    factionId: 'faction_quiet',
    context: 'bounty_hunter',
    squad: Object.freeze({ archetypes: Object.freeze(['corsair_raider']), size: Object.freeze([1, 2]), doctrine: 'balanced', formation: 'loose' }),
    bark: 'bounty_notice',
  }),

  // ── CLAIM THREAT — scavengers ping a claim you own in this sector ──────────────────────────────
  claim_threat: Object.freeze({
    id: 'claim_threat',
    tier: 'minor',
    deck: 'combat',
    weight: 1,
    zoneTypes: ['mining_belt', 'derelict_field'],
    script: 'claimThreat',
    pressureCost: 30,
    cooldownS: 600,
    proximity: false,
    gates: Object.freeze({ claimsOnly: true }),
    factionId: 'faction_reach',
    context: 'encounter',
    squad: Object.freeze({ archetypes: Object.freeze(['wasp_swarmer', 'reaver_pirate']), size: Object.freeze([2, 2]), doctrine: 'scavenger', formation: 'loose' }),
    bark: 'claim_ping',
  }),

  // ── NAMED HUNTER — a persistent named captain works these lanes (major, rare) ──────────────────
  named_hunter: Object.freeze({
    id: 'named_hunter',
    tier: 'major',
    deck: 'combat',
    weight: 1,
    rare: true,
    zoneTypes: ['ambush_lane', 'outlaw_zone'],
    script: 'namedHunter',
    pressureCost: 90,
    cooldownS: 900,
    proximity: false,
    gates: Object.freeze({ namedPool: true }),         // needs a living captain in NAMED_CAPTAINS
    motive: 'personal_vendetta',
    engagementTrigger: 'named_hunter_grudge',
    factionId: 'faction_reach',
    context: 'encounter',
    entranceS: 8,                                      // staged entrance: callsign + silhouette, never a teleport-ambush
    bark: null,                                        // per-captain bark (see NAMED_CAPTAINS)
  }),

  // ═══ CIVILIAN DECK ═════════════════════════════════════════════════════════════════════════════

  // ── CONVOY — scheduled heavies run the lane; scannable, guardable, robbable ────────────────────
  convoy_departure: Object.freeze({
    id: 'convoy_departure',
    tier: 'minor',
    deck: 'civilian',
    weight: 3,
    zoneTypes: ['trade_lane', 'refinery_approach', 'border_checkpoint'],
    script: 'convoy',
    pressureCost: 35,
    cooldownS: 420,
    proximity: false,
    gates: Object.freeze({}),
    factionId: 'faction_mts',
    context: 'convoy_civilian',
    squad: Object.freeze({ archetypes: Object.freeze(['mule_trader']), size: Object.freeze([2, 3]), doctrine: 'balanced', formation: 'column' }),
    escort: Object.freeze({ archetypes: Object.freeze(['patrol_lawman']), size: Object.freeze([1, 2]), doctrine: 'official', formation: 'wedge', context: 'patrol', factionId: 'faction_scn' }),
    bark: 'convoy_depart',
    transitS: 220,                                     // lane transit time before arrival applies market pressure
    unitsPerHauler: Object.freeze([6, 10]),            // cargo units each hauler carries (seeded in-band)
    guardPay: 200,
  }),

  // ── TRADER RUN — one hauler with somewhere to be that isn't you ────────────────────────────────
  trader_run: Object.freeze({
    id: 'trader_run',
    tier: 'ambient',
    deck: 'civilian',
    weight: 4,
    zoneTypes: ['trade_lane', 'civilian_core', 'refinery_approach', 'mining_belt'],
    script: 'traderRun',
    pressureCost: 15,
    cooldownS: 180,
    proximity: false,
    gates: Object.freeze({}),
    factionId: 'faction_mts',
    context: 'convoy_civilian',
    squad: Object.freeze({ archetypes: Object.freeze(['mule_trader']), size: Object.freeze([1, 1]), doctrine: 'balanced', formation: 'loose' }),
    bark: 'trader_pass',
    transitS: 160,
    unitsPerHauler: Object.freeze([3, 6]),
  }),

  // ── PATROL BEAT — a Concord wing walks its corridor (ambient law presence) ─────────────────────
  patrol_beat: Object.freeze({
    id: 'patrol_beat',
    tier: 'ambient',
    deck: 'civilian',
    weight: 2,
    zoneTypes: ['patrol_corridor', 'civilian_core', 'border_checkpoint'],
    script: 'patrolBeat',
    pressureCost: 15,
    cooldownS: 240,
    proximity: false,
    gates: Object.freeze({}),
    factionId: 'faction_scn',
    context: 'patrol',
    squad: Object.freeze({ archetypes: Object.freeze(['patrol_lawman']), size: Object.freeze([2, 3]), doctrine: 'official', formation: 'wedge' }),
    bark: 'patrol_beat_hail',
    beatS: 120,
  }),

  // ── DISTRESS — a stricken ship calls; 60% genuine, 40% pirate bait (seeded, preserved) ─────────
  distress_call: Object.freeze({
    id: 'distress_call',
    tier: 'minor',
    deck: 'civilian',
    weight: 2,
    zoneTypes: ['trade_lane', 'derelict_field', 'nebula_fog', 'radiation_field', 'mining_belt'],
    script: 'distress',
    pressureCost: 35,
    cooldownS: 480,
    proximity: false,
    gates: Object.freeze({}),
    variant: 'distress',
    genuineChance: 0.6,                                // roll < 0.6 → genuine victim, else pirate bait
    bark: 'distress_call',                             // the mayday itself — same line either way (trust is a read)
    springR: 650,                                      // bait: closing inside this springs the trap
    approachR: 900,                                    // genuine: inside this you're "on scene"
    windowS: 240,                                      // signal fades after this if ignored (no punishment)
    rescuePay: 120,
    // GENUINE: a holed hauler adrift; a small pirate pack works the wreck and turns on arrivals.
    genuine: Object.freeze({
      factionId: 'faction_free',
      context: 'convoy_civilian',
      squad: Object.freeze({ archetypes: Object.freeze(['mule_trader']), size: Object.freeze([1, 1]), doctrine: 'balanced', formation: 'loose' }),
      threat: Object.freeze({ archetypes: Object.freeze(['reaver_pirate', 'wasp_swarmer']), size: Object.freeze([1, 2]), doctrine: 'scavenger', formation: 'loose', context: 'encounter', factionId: 'faction_reach' }),
    }),
    // BAIT: the "victim" is pirates running silent — closing in springs the trap.
    bait: Object.freeze({
      factionId: 'faction_reach',
      context: 'encounter',
      squad: Object.freeze({ archetypes: Object.freeze(['reaver_pirate', 'corsair_raider', 'wasp_swarmer']), size: Object.freeze([3, 4]), doctrine: 'scavenger', formation: 'ring' }),
    }),
    choices: Object.freeze([
      Object.freeze({ id: 'assist', label: 'Assist' }),
      Object.freeze({ id: 'scan', label: 'Scan first' }),
      Object.freeze({ id: 'ignore', label: 'Ignore' }),
    ]),
    timeoutChoice: 'ignore',
  }),

  // ── SALVAGE SIGNAL — a faint transponder in the derelict field; evidence waits ─────────────────
  salvage_signal: Object.freeze({
    id: 'salvage_signal',
    tier: 'ambient',
    deck: 'civilian',
    weight: 2,
    zoneTypes: ['derelict_field'],
    script: 'salvageSignal',
    pressureCost: 20,
    cooldownS: 420,
    proximity: false,
    gates: Object.freeze({}),
    bark: 'salvage_ping',
    windowS: 300,
    // Fallback cache when the sector's salvage points are already spent (director-owned wreck).
    cachePool: Object.freeze({ cmdty_salvage_electronics: 2, cmdty_scrap_metal: 3 }),
  }),

  // ── ANOMALY WHISPER — CHN UNKNOWN speaks once, softly (anomaly sectors only) ───────────────────
  anomaly_whisper: Object.freeze({
    id: 'anomaly_whisper',
    tier: 'ambient',
    deck: 'civilian',
    weight: 1,
    zoneTypes: ['anomaly_deep'],
    script: 'whisper',
    pressureCost: 5,
    cooldownS: 300,                                    // ≤1 whisper per 5 min (spec2/04 §3)
    proximity: false,
    gates: Object.freeze({}),
    bark: null,                                        // seeded from WHISPER_LINES
  }),
});

/** Persistent named captains (the seed roster). State lives in state.encounterDirector.named:
 *  { [id]: { alive, tier, escapes, kills, lastSeenSector } } — saved, migration-safe. Escalation is
 *  COMPOSITION (escort +1 per tier), never +HP%. Gimmick = an existing gameplay verb via archetype. */
export const NAMED_CAPTAINS = Object.freeze([
  Object.freeze({
    id: 'cap_sable_iask', name: 'Sable Iask', gimmick: 'sniper',
    combatDoctrineId: 'ranged_disengager',
    archetype: 'lancer_sniper', levelBonus: 2, bountyCr: 450,
    escort: Object.freeze({ archetypes: Object.freeze(['corsair_raider']), size: Object.freeze([1, 1]), doctrine: 'scavenger', formation: 'wedge' }),
    bark: 'hunter_iask',
  }),
  Object.freeze({
    id: 'cap_redcut_sorrel', name: 'Redcut Sorrel', gimmick: 'rammer',
    combatDoctrineId: 'interceptor_flyby',
    archetype: 'bruiser_brawler', levelBonus: 2, bountyCr: 500,
    escort: Object.freeze({ archetypes: Object.freeze(['reaver_pirate']), size: Object.freeze([1, 1]), doctrine: 'scavenger', formation: 'loose' }),
    bark: 'hunter_sorrel',
  }),
  Object.freeze({
    id: 'cap_vane_ash', name: 'Vane the Ash', gimmick: 'screen',
    combatDoctrineId: 'tether_control_raider',
    archetype: 'corsair_raider', levelBonus: 3, bountyCr: 550,
    escort: Object.freeze({ archetypes: Object.freeze(['wasp_swarmer']), size: Object.freeze([2, 2]), doctrine: 'scavenger', formation: 'ring' }),
    bark: 'hunter_vane',
  }),
]);

/** Bark lines keyed by bark id. Values are a string or a variant array (seeded pick via barkText).
 *  `{key}` placeholders are substituted after pick. One voice, ≤14 words on variant arrays,
 *  callsigns in caps on hails, no exclamation marks outside genuine emergencies.
 *
 *  Faction suitability (pool members — not runtime-filtered):
 *    toll_demand [0,1,3] Reach transactional; [2,4] Vael smuggler customs voice.
 *    patrol_scan_hail [0,1,3] Concord bureaucratic; [2,4] Meridian border-control voice. */
export const ENCOUNTER_BARKS = Object.freeze({
  // toll — Reach [0,1,3] transactional; Vael [2,4] customs/smuggler phrasing
  toll_demand: Object.freeze([
    'REACH: toll {amount} cr. Cut thrust to pay, or run.',
    'REACH: lane fee {amount}. Brake to transfer, or break formation.',
    'VAEL: transit tax {amount} cr. Settle now or we vector you.',
    'REACH: your cargo weighs {amount}. Pay calm or we scrape the hold.',
    'VAEL: customs at {amount}. Drop thrust or we board for inventory.',
  ]),
  toll_paid_ack: Object.freeze([
    'Smart trade. Lane is yours.',
    'Credits received. Resume on your heading.',
    'Fair rate. You are cleared through Reach lanes.',
    'Toll logged. We part on good terms.',
    'Payment good. Keep your thrust trimmed, pilot.',
  ]),
  toll_refused_ack: Object.freeze([
    'Wrong answer. Take the cargo.',
    'Then we take it from the hull.',
    'Refusal noted. Raiders, peel their hold.',
    'No pay means salvage rights. Engage.',
    'Wrong call. We board and strip cargo.',
  ]),
  toll_flee_ack: Object.freeze([
    'Runner. Burn them down.',
    'He bolted. Pack, chase and cut thrust.',
    'Runner tagged. Do not let them reach lane.',
    'Vector shift detected. Hunters, full burn.',
    'Fleeing. Close range and gut their drive.',
  ]),
  toll_broke_ack: Object.freeze([
    'Empty pockets. Take it out of the hull.',
    'Zero balance. We invoice in hull plate.',
    'No credits. Collect from whatever cargo moves.',
    'Broke answer. Scrape the hold for value.',
    'Accounts dry. Payment due in stripped cargo.',
  ]),
  // patrol scan — Concord [0,1,3] bureaucratic; Meridian [2,4] border-control voice
  patrol_scan_hail: Object.freeze([
    'CONCORD: cut thrust for scan.',
    'CONCORD: hold vector for customs sweep.',
    'MERIDIAN: slow thrust. Manifest and hull scan.',
    'CONCORD: match patrol speed. Submit for inspection.',
    'MERIDIAN: traffic hold. Hold transponder open for scan.',
  ]),
  patrol_scan_clear: Object.freeze([
    'Clear. Fly safe.',
    'Hold reads clean. Resume on lane.',
    'Manifest matches. You are released.',
    'No flags. Continue on assigned vector.',
    'Inspection complete. Transponder cleared.',
  ]),
  patrol_scan_caught: Object.freeze([
    'Contraband confirmed. Fine logged, goods seized.',
    'Illegal cargo flagged. Fine assessed, hold emptied.',
    'Manifest mismatch. Contraband seized, fine recorded.',
    'Hidden goods found. Penalty logged, cargo impounded.',
    'Smuggled items confirmed. Fine due, cargo forfeited.',
  ]),
  patrol_scan_refused: Object.freeze([
    'Scan refused. Transponder flagged.',
    'Noncompliance logged. Transponder marked for review.',
    'Refusal recorded. Patrol will shadow your wake.',
    'You fled inspection. Flag set on your beacon.',
    'Scan denied. Concord tags your transponder dirty.',
  ]),
  // ambush
  ambush_tele: Object.freeze([
    'Sensor ghosts in the belt shadow. Stay sharp.',
    'Contacts flicker off the belt edge. Eyes up.',
    'Mass signatures hiding in the lane shadow.',
    'Radar clutter ahead. Something masks a group.',
    'Bogies blink on and off the asteroid shelf.',
  ]),
  ambush_spring: Object.freeze([
    'Ambush. Cut them off — nobody leaves with cargo.',
    'Now! Box them in — cargo stays with us!',
    'Spring it! Cut thrust and take their hold!',
    'Ambush live! Nobody vectors out with that cargo!',
    'Trap sprung! Raiders in — strip them clean!',
  ]),
  snare_warn:         'Mass-snare charging dead ahead. Break vector.',
  // distress
  distress_call: Object.freeze([
    'Mayday. Drive dead, shields failing. Anyone.',
    'Mayday! Reactor cold, hull venting. Need assist!',
    'Distress! Drives out, life support thin. Respond!',
    'Mayday! Stranded, debris field. Any hull nearby?',
    'Emergency! Power lost, beacon weak. Please respond!',
  ]),
  distress_rescued_ack: Object.freeze([
    'You came. Thought nobody would.',
    'Did not think anyone would answer that hail.',
    'Rescue confirmed. I owe you more than credits.',
    'You are here. I had written us off already.',
    'Help arrived. I will remember this vector, pilot.',
  ]),
  distress_bait_spring: Object.freeze([
    'Gotcha. Light them up.',
    'Trap set! Burn them down before they bolt!',
    'Got you! Reach pack, take their hull apart!',
    'Bait taken! Cut thrust and gut their cargo!',
    'Spring it! They bit — light them up now!',
  ]),
  scan_tell_bait:     'Signal reads wrong. No pods. Weapons hot.',
  scan_tell_genuine:  'One heartbeat aboard. Hull venting.',
  // convoy / traders / patrol
  convoy_depart: Object.freeze([
    '{faction} convoy on the lane — {cargo} for {dest}.',
    '{faction} bulk haul forming — {cargo} bound for {dest}.',
    '{faction} escorted train moving {cargo} toward {dest}.',
    'Lane traffic: {faction} convoy with {cargo} for {dest}.',
    '{faction} freighters rolling — {cargo} earmarked for {dest}.',
  ]),
  convoy_guard_ack:   'Escort logged. {faction} remembers this.',
  trader_pass: Object.freeze([
    'Hauler on approach. {cargo} for {dest}.',
    'Single freighter inbound — {cargo} for {dest}.',
    'Trader ping: {cargo} manifest, routing toward {dest}.',
    'Independent hauler passing through with {cargo} for {dest}.',
    'Cargo runner on lane, {cargo} ticketed to {dest}.',
  ]),
  patrol_beat_hail: Object.freeze([
    'Concord patrol on station. Fly clean.',              // [0] original shipped line
    'CONCORD: patrol unit holding this lane. Fly clean.',
    'CONCORD: sector sweep active. Keep transponder honest.',
    'CONCORD: marking traffic. Observe lane limits.',
    'CONCORD: enforcement on station. No irregular thrust.',
  ]),
  // salvage
  salvage_ping: Object.freeze([
    'Salvage transponder, faint. Derelict field marked.',
    'Weak beacon in the derelict field. Worth a look.',
    'Faint salvage ping off the wreck shelf.',
    'Transponder ghost near derelicts. Someone left cargo.',
    'Scrap signal brushing the debris field edge.',
  ]),
  // hunters
  bounty_notice: Object.freeze([
    'Bounty board paid up front. Nothing personal.',
    'Contract posted. I am here to collect your hull.',
    'Board paid this job. Your transponder is the target.',
    'Bounty issued. I get paid whether you run or not.',
    'Upfront contract. Collect alive or stripped — same pay.',
  ]),
  hunter_iask:        'Range is mine, pilot. Sable Iask. Hold still.',
  hunter_sorrel:      'Redcut Sorrel. Brace. I like the sound.',
  hunter_vane:        'Vane the Ash. My wasps eat missiles. Try.',
  miniboss_taunt:     'You picked the wrong lane, pilot. This one is mine.',
  // claims
  claim_ping:         'Your claim beacon reports contacts picking the seam.',
});

/** CHN UNKNOWN whisper pool (anomaly ambience — lowercase on purpose; seeded pick). */
export const WHISPER_LINES = Object.freeze([
  'count the quiet between your engines.',
  'the lanes remember older wakes.',
  'your mass sings at the threshold.',
]);

/** Receipt templates keyed `shapeId.outcome`. Short, factual, never overclaiming: every line here
 *  states only consequences the director actually applied (or that sanctioned systems applied). */
export const ENCOUNTER_RECEIPTS = Object.freeze({
  'pirate_toll.paid':        'TOLL PAID — {amount} cr. Cargo intact, Reach cools.',
  'pirate_toll.cleared':     'RAIDERS DOWN — toll lane cleared.',
  'pirate_toll.escaped':     'TOLL EVADED — Reach marks your wake.',
  'patrol_scan.clean':       'SCAN CLEAR — Concord logged you clean.',
  'patrol_scan.fined':       'FINED {fine} cr — contraband seized.',
  'patrol_scan.bribed':      'BRIBE TAKEN — patrol looked away.',
  'patrol_scan.dumped':      'CARGO DUMPED — hold reads clean.',
  'patrol_scan.ran':         'SCAN REFUSED — Concord flagged your transponder.',
  'ambush_snare.cleared':    'AMBUSH BROKEN — Reach pack destroyed.',
  'ambush_snare.escaped':    'AMBUSH EVADED — they wait for slower prey.',
  'distress_call.rescued':   'RESCUE COMPLETE — {faction} remembers. {pay} cr.',
  'distress_call.lost':      'SIGNAL LOST — you were too late.',
  'distress_call.bait_broken':'BAIT BROKEN — Reach ambush undone.',
  'distress_call.escaped':   'BAIT ESCAPED — the trap resets somewhere dark.',
  'convoy_departure.arrived':'CONVOY ARRIVED — {dest} {cargo} supply rises.',
  'convoy_departure.guarded':'CONVOY GUARDED — {faction} owes you. {pay} cr.',
  'convoy_departure.robbed': 'CONVOY RAIDED — law logs the incident.',
  'convoy_departure.lost':   'CONVOY LOST — {dest} prices will feel it.',
  'trader_run.arrived':      'HAULER ARRIVED — {dest} takes delivery.',
  'salvage_signal.recovered':'BLACK BOX RECOVERED — new lead logged.',
  'salvage_signal.stripped': 'CACHE STRIPPED — salvage secured.',
  'named_hunter.killed':     'HUNTER DOWN — {name} removed from the lanes.',
  'named_hunter.escaped':    'HUNTER ESCAPED — {name} will return stronger.',
  'bounty_hunter.cleared':   'CONTRACT VOIDED — hunters down.',
  'bounty_hunter.escaped':   'HUNTERS SHAKEN — the bounty stands.',
  'claim_threat.defended':   'CLAIM DEFENDED — scavengers driven off.',
  'claim_threat.picked':     'CLAIM PICKED — scavengers stripped the seam edge.',
});

/** Short spoken labels for faction ids (comms barks / receipts — callsign register). */
export const FACTION_LABELS = Object.freeze({
  faction_scn: 'Concord',
  faction_mts: 'MTS',
  faction_dmc: 'Collective',
  faction_reach: 'Reach',
  faction_free: 'Frontier',
  faction_quiet: 'Quiet',
  faction_vael: 'Vael',
});

/** Convoy/trader cargo table: which goods run the lanes (seeded pick). Kept to liquid, legible
 *  mid-value commodities so "supply rises" is a real, visible market sentence. */
export const CONVOY_CARGO = Object.freeze([
  Object.freeze({ commodityId: 'cmdty_refined_metals', label: 'refined metals' }),
  Object.freeze({ commodityId: 'cmdty_volatiles', label: 'ice volatiles' }),
  Object.freeze({ commodityId: 'cmdty_ore_iron', label: 'iron ore' }),
  Object.freeze({ commodityId: 'cmdty_ice_water', label: 'water ice' }),
]);

/** Toll pricing: min(12% of cargo value, 400), floored to a round 10, minimum 50. */
export function tollAmountFor(cargoValue) {
  const v = Math.max(0, Number(cargoValue) || 0);
  const raw = Math.min(0.12 * v, 400);
  return Math.max(50, Math.round(raw / 10) * 10);
}

/** All encounters whose tier matches, as an array (stable order = definition order). */
export function encountersByTier(tier) {
  return Object.values(ENCOUNTERS).filter((e) => e.tier === tier);
}

/** Encounters schedulable in a sector = those with at least one matching zone type present. */
export function encountersForZoneTypes(zoneTypeSet, tier) {
  const out = [];
  for (const enc of Object.values(ENCOUNTERS)) {
    if (tier && enc.tier !== tier) continue;
    if (!enc.zoneTypes || !enc.zoneTypes.some((zt) => zoneTypeSet.has(zt))) continue;
    out.push(enc);
  }
  return out;
}

/** Deterministic uint32 hash (FNV-1a) — inline so this module stays import-free. */
function barkHash32(...args) {
  let h = 0x811c9dc5;
  const str = args.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The bark text for a bark id with `{key}` substitution (empty string if unknown).
 *  Array values pick one variant deterministically from barkId + pickKey (encounter id). */
export function barkText(barkId, vars, pickKey) {
  const raw = ENCOUNTER_BARKS[barkId];
  if (!raw) return '';
  let line;
  if (Array.isArray(raw)) {
    const key = pickKey != null ? String(pickKey) : String(barkId);
    const h = barkHash32('encounter-bark', barkId, key);
    line = raw[h % raw.length];
  } else {
    line = raw;
  }
  return fmt(line || '', vars);
}

/** The receipt text for a shape+outcome with `{key}` substitution ('' if the outcome is silent). */
export function receiptText(shapeId, outcome, vars) {
  return fmt(ENCOUNTER_RECEIPTS[`${shapeId}.${outcome}`] || '', vars);
}

/** Tiny `{key}` template substitution (pure; missing keys render as ''). */
export function fmt(text, vars) {
  if (!text || !vars) return text || '';
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}
