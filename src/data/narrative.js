// src/data/narrative.js – canonical narrative content for the story-spine overlay.
//
// Source of truth: docs/worldbuilding/story/* (STORY-SPINE-NARRATIVE-OVERLAY, COMMS-MICRO-POPUPS,
// HUD-META-ARC, ENDGAME-B7-REDESIGN, STORY-STRUCTURE). All text below is transcribed verbatim from
// those canonical docs; do not paraphrase. The story SYSTEM (src/systems/story.js) reads these
// tables and fires comms:popup / graffiti:show / hud:phase events at the right beats. The UI
// overlays (src/ui/comms.js, graffiti, endgame choice) render whatever those events carry.
//
// This module is PURE DATA — no imports, no state mutation, no DOM. Systems/UI consume it.
//
// DESIGN PRINCIPLE (from COMMS doc): "Most popups are not for the player. Some are. The ones that
// are for the player are the ones that don't address them by name." Everything here honours that.

// ── The Tessera — starting ship history ──────────────────────────────────────────────────────
// The ghost ship. You just got out of a galactic prison colony. Your friend owed you a favor.
// Nobody else would touch it. Spacers, like sailors, get superstitious on long runs. You're no
// different. But you take what you can get.
//
// The Tessera was running for a Crimson Reach gang affiliate — smuggling for The Quiet, the
// shadow logistics network that routes everything nobody is supposed to move. At Waypoint 9 it
// was boarded. Crew of five. No survivors. The ship held together. They didn't.
// Impounded 14 months. Unclaimed. Then your friend made a call.
//
// The gang left their mark on the bulkhead. It's still there.
export const SHIP = {
  name:             'Tessera',
  registration:     'VHL-4471-T',
  incident:         '7741',
  incidentRef:      'REF 44-C',
  previousOperator: 'REDACTED — INCIDENT 7741',
  crewStatus:       'NO SURVIVORS ON RECORD',
  impoundMonths:    14,
  friend:           { callsign: 'KAEL', debt: 'six months in the colony' },
};

// ── Cold start — what the player encounters in the first 20 seconds ──────────────────────────
// Fires ONLY on new game (not on load). The friend hands the ship over. The registry notices.
// A dock worker recognizes the hull. All of this arrives without explanation.
// The previous crew's bulkhead graffiti is already there when the engines wake up.
export const COLD_START = [
  // t=0: the favor. One line. No explanation.
  {
    id: 'cold_friend', sender: 'KAEL', delayS: 0,
    text: "She's yours. Don't ask what happened to the last crew. I mean it.",
    category: 'personal', ttl: 14,
    note: "KAEL. Old debt. You were in the colony six months; he had the ship sitting in a Pit berth nobody would rent. He made sure of that.",
  },
  // t=8: the registry auto-pings on engine start. The transfer was never formally filed.
  {
    id: 'cold_registry', sender: 'CONCORD VESSEL REGISTRY', delayS: 8,
    text: 'VESSEL PING: TESSERA / VHL-4471-T / OPERATOR: UNKNOWN / INCIDENT 7741: SEALED / REF 44-C.',
    category: 'ambient', ttl: 9,
    note: "OPERATOR: UNKNOWN because the handoff was informal. That was intentional. Your friend didn't mention the paperwork wasn't done.",
  },
  // t=18: dock worker recognizes the hull by silhouette. They all do.
  {
    id: 'cold_dockmaster', sender: 'HELIOS DOCKMASTER', delayS: 18,
    text: "That's the 7741 ship. Keep your fees current and we won't have a problem.",
    category: 'ambient', ttl: 9,
    note: "Recognized by hull profile. Incident 7741 was not a quiet incident. His crew moved to a different berth by morning.",
  },
];

// ── Reference codes that recur across the world ──────────────────────────────────────────────
// These are not flavor — they are cross-references the player learns to recognise. REF 44-C is the
// same code for customs (Hale), contract authorization (Vale), atmospheric allocation (the Silt
// economy), and sealed-evidence suppression. 47-A is the player's own first contract, never closed.
export const REFS = {
  CONTRACT_47A: '47-A',   // the player's first contract; payment withheld forever
  REF_44C: 'REF 44-C',    // the administrative code that governs everything inconvenient
};

// ── Named figures (for attribution / graffiti authorship) ────────────────────────────────────
// From PROTAGONIST.md + NPCs-CANONICAL.md. Names appear in registries, manifests, ledgers.
export const FIGURES = {
  protagonist:   { name: 'Wren',        ship: 'Tessera', role: 'pilot' },
  vale:          { name: 'Director Vale', org: 'Concord Administration', role: 'antagonist' },
  kessler:       { name: 'Kessler',     role: 'weight-discrepancy clerk' },
  mira:          { name: 'Mira',        org: 'Bourse Freight', role: 'manifest re-router' },
  hale:          { name: 'Hale',        org: 'Concord Patrol', role: 'customs / REF 44-C filer' },
  rook:          { name: 'Rook',        role: 'bounty double-biller' },
  slate:         { name: 'Slate',       org: 'Pit Shipyard', role: 'hull welder' },
  quinn:         { name: 'Quinn',       org: "Outpost 9 bar", role: 'barkeep (never not management)' },
  voss:          { name: 'Voss',        org: 'Drift Miners Collective', role: 'claim filer' },
  elroy:         { name: 'Elroy',       org: 'Pit Engineering, Maintenance Division', role: 'whistleblower (B2 target)' },
  kurtz:         { name: '(unnamed)',   role: 'the Ashfall Witness — derelict administrator, Ashfall Reach' },
  clerk_yune:    { name: 'Clerk Yune', org: 'The Quiet', role: 'sealed-evidence broker' },
  coldburn_rey:  { name: '“Coldburn” Rey', org: 'Free Frontier', role: 'independent hauler and named rival' },
  iren_suhl:     { name: 'Dr. Iren Suhl', org: 'Research Station Veil', role: 'xenolinguist' },
  warrant_orrin: { name: 'Warrant Orrin', org: 'Concord Inspector General', role: 'evidence-case witness' },
  sker_vane:     { name: 'Boss Sker Vane', org: 'Crimson Reach', role: 'lane kingpin' },
  dustwife_senna:{ name: '“Dustwife” Senna', org: 'Drift Miners Collective', role: 'wreck elder and keeper of names' },
  latch_child:   { name: 'Latch-Child', org: 'Quiet logistics, origin lapsed', role: 'feral salvage automaton' },
  the_question:  { name: 'The Question', org: 'precursor unknown', role: 'persistent interrogative' },
  filecleaver_dorin: { name: '“Filecleaver” Dorin', org: 'Concord records, bounty-posted', role: 'seal-log whistleblower' },
  lira_vonn:     { name: 'Lira Vonn, “The Margin”', org: 'The Margin', role: 'independent correspondent' },
  tinker_zell:   { name: 'Tinker Zell', org: 'Sker Bazaar', role: 'black-market mechanic' },
  mara_children: { name: 'Mara and the Children', org: 'civilian convoy', role: 'refugee witness' },
  wraith_kell:   { name: '“Wraith” Kell', org: 'The Quiet, embedded at Customs', role: 'deep-cover manifest clerk' },
  halev_doss:    { name: 'Prof. Halev Doss', org: 'Helios public archive', role: 'university archivist' },
  maera_vols:    { name: 'Captain Maera Vols', org: 'Tessera / The Quiet', role: 'previous captain and hull ghost' },
};

// ── Comms popup catalog ──────────────────────────────────────────────────────────────────────
// Driven by the `comms:popup` event { id, sender, header, text, category, ttl, persist }.
// `category` drives styling + the log: 'ambient' | 'trap' | 'personal' | 'late' | 'story'.
// `cond` is evaluated by the story system against (state, ctx) — returns true to fire.
// Most are NOT addressed to the player. The ones that are don't name them.
//
// Firing model: the story system holds a per-game shuffle of ambient lines and emits one on a timer
// + condition. Personal/late/story lines fire exactly once on their beat and set a seen-flag.
export const COMMS = {
  // AMBIENT NOISE — appears early game, random cycle. The migraine of the channel.
  // Ghost-ship entries: seeded into the normal rotation. The Tessera is known.
  // Players who aren't paying attention will miss them. That's fine.
  ambient: [
    { id: 'amb_ghost_vhl', sender: 'FREE FRONTIER RELAY',
      text: 'VESSEL SIGHTING: VHL-4471-T — TESSERA. OPERATOR: UNKNOWN. INCIDENT 7741. CAUTION ADVISED.',
      note: "Auto-flag on registry ping. The Tessera is on a watch-list that technically closed 14 months ago. The flag was never cleared because the transfer was never filed." },
    { id: 'amb_berth_avoid', sender: 'HELIOS DOCKMASTER — BERTH 4',
      text: 'NOTICE TO VHL-4471-T: ADJACENT BERTH CREW REQUESTS ALTERNATE ASSIGNMENT.',
      note: "Spacers. Standard superstition. They moved before you could respond. You don't blame them." },
    { id: 'amb_spacer_talk', sender: 'OPEN CHANNEL — FREQ 9',
      text: 'ANYONE KNOW WHO\'S FLYING THE 7741 SHIP OUT OF HELIOS? THOUGHT THAT THING WAS IMPOUNDED.',
      note: "No reply on the channel. The question stays unanswered. You don't answer it either." },
    { id: 'amb_meridian_ore',   sender: 'MERIDIAN EXCHANGE', text: 'COMMODITY ALERT: ORE PRICES ADJUSTED. EFFECTIVE IMMEDIATELY.',
      note: 'The adjustment is downward. The adjustment was made four cycles ago. The alert is for the old price.' },
    { id: 'amb_concord_gate3',  sender: 'CONCORD GATE 3', text: 'NOTICE: INSPECTION PROTOCOL UPDATED. REF 44-C.',
      note: 'Ref 44-C is the regulation Hale uses to file the second fine.' },
    { id: 'amb_outpost9',       sender: 'OUTPOST 9 — BAR COMMS', text: "QUINN'S PLACE UNDER NEW MANAGEMENT. SAME RATES.",
      note: "Quinn's rates have never changed. Quinn has never not been the management." },
    { id: 'amb_tycho_47a',      sender: 'TYCHO RELAY', text: 'WEIGHT VARIANCE NOTICE: SHIPMENT 47-A UNDER REVIEW. CONTACT KESSLER.',
      note: '47-A is always under review. Contact Kessler has never resolved anything.' },
    { id: 'amb_drift_claims',   sender: 'DRIFT MINERS COLLECTIVE', text: 'CLAIM FILING SUSPENDED: HOLLOW STATION. BACKLOG 22 CYCLES.',
      note: 'The backlog exists because filed claims are contested by claims filed the same shift by a second crew.' },
    { id: 'amb_bourse_seals',   sender: 'BOURSE FREIGHT', text: 'CARGO INSURANCE REMINDER: VERIFY SEAL CODES BEFORE TRANSIT.',
      note: 'The seal code verification system logs to a database Mira has write access to.' },
    { id: 'amb_concord_atmo',   sender: 'CONCORD LOGISTICS OVERSIGHT', text: 'SECTOR MAINTENANCE ADVISORY: ATMOSPHERIC RECYCLER SERVICE SCHEDULED. SECTORS NOT MEETING VIABILITY THRESHOLD INELIGIBLE. REVIEW REQUIREMENTS UNDER REF 44-C.',
      note: "REF 44-C is also the framework for atmospheric viability scoring. The Pit's viability score fell below threshold in year 3. The Pit has not been on this advisory list since year 3." },
    { id: 'amb_mts_clear_air', sender: 'MERIDIAN EXCHANGE',
      text: 'CLEAR AIR INDEX: OUTER SECTORS WEAK. ATMO TOKEN DESK BID FIRM. SHORT INTEREST HELD.',
      note: 'Beneficiary every cycle — MTS books gain when outer air fails. One legible receipt, no lecture.' },
    { id: 'amb_ala_silt',       sender: 'CONCORD ALA DIVISION', text: 'SILT ALLOCATION NOTICE: REFINED SLURRY DELIVERY SUSPENDED FOR SECTOR 0 PENDING ATMO DEBT REVIEW. APPEAL WINDOW: 12 CYCLES.',
      note: 'The appeal window has been open and unfilled for 14 years. The Pit does not know it has one.' },
    { id: 'amb_sec6_air',       sender: 'SECTOR 6 TRADING POST', text: 'BREATHABLE AIR: PRESSURIZED CANISTERS, 150KG, ORIGIN UNSPECIFIED. PRICE ON REQUEST.',
      note: "The Quiet's booth. 'Origin unspecified' is the tell. The buyer pays for anonymity, not the air." },
    { id: 'amb_helios_vent',    sender: 'HELIOS PRIME — MAINTENANCE', text: 'VENTILATION REVIEW CLOSED: BAY 7 ODOR CONSISTENT WITH TRANSIT. NO ACTION. TICKET Y3-C2.',
      note: "A fourteen-year-old ticket about a smell in a Core warehouse. The player will not understand this popup the first time they see it. The grid that left the Pit in year 3 arrived at Helios, was shelved because Helios already had a better one, and has sat in bay 7 ever since. The smell complaint is the only record at the destination that the grid exists. Seeds the wrong-grid reveal the player uncovers at Ashfall Reach." },
    // Beneficiary-cycle lines (audit II.2): MTS books a recurring gain when outer air fails.
    // One legible receipt per cycle. No lecture. The number does the work.
    { id: 'amb_mts_atmo_short', sender: 'MERIDIAN EXCHANGE',
      text: 'ATMO TOKENS — SECTOR 0 BID RAISED 0.4. SECTOR 6 BID RAISED 0.6. POSITION HELD. NEXT CLEAR IN 12 CYCLES.',
      note: 'The Pit’s air gets worse; the token price climbs; the same desk holds the position. Twelve cycles later it clears again. One beneficiary, every cycle, with a line item.' },
    { id: 'amb_pit_filter_recall', sender: 'CONCORD ALA DIVISION',
      text: 'FILTER RECALL NOTICE: SECTOR 0 BATCH R3-CARRIER WITHDRAWN. REPLACEMENT SCHEDULE: PENDING ALLOCATION REVIEW.',
      note: 'The replacement never comes because the allocation review never closes. The recall line is the only record the replacement existed. R3-CARRIER is the grid now shelved in Helios Bay 7.' },
    { id: 'amb_d shaft_collapse', sender: 'DRIFT MINERS COLLECTIVE',
      text: 'SHAFT 7 STATUS: OPERATIONAL. CREW RETURN: 9 / 11. MOISTURE LOSS: 0.7T LOGGED.',
      note: 'Two miners did not return. The discrepancy is filed as 0.7t moisture loss — the sub-tonne skim column that keeps the real number off the casualty line. The 0.7t is lawful. The two are not on the casualty line because they were never on the crew line.' },
    { id: 'amb_quiet_count', sender: '[UNCORROBORATED RELAY]',
      text: 'FORTY-ONE REGISTERED HULLS THIS LANE. FORTY-ONE TRANSIT FILINGS. ZERO DECLARED CARGO.',
      note: 'The Quiet move mass without manifest. The count matches the filings because the filings say nothing. The relay is uncorroborated because no one will sign it.' },
    { id: 'amb_reach_weigh_slip', sender: 'CRIMSON REACH — FREQUENCY 13',
      text: 'WEIGH-SLIP OPEN: FOUR HULLS THIS CYCLE. THREE FILLED. ONE SHORT. SHORT FALLS TO THE LANE.',
      note: 'Reach counts in hulls, not credits. The short one is the hauler who did not pay the tithe. The lane keeps the body. The weigh-slip keeps the tonnage. The two ledgers do not reconcile.' },
  ],

  // TRAPS — mid-game, during jump charging or transit. Conditions gate them.
  traps: [
    { id: 'trap_inspection', sender: 'CONCORD PATROL', text: 'RANDOM INSPECTION IN PROGRESS. PLEASE HOLD POSITION.',
      note: 'Inspections are never random. The algorithm was calibrated against a list of ships that paid bribes.',
      cond: (s) => hasContraband(s) && inHighSecurity(s) && sectorDwellS(s) > 90 },
    { id: 'trap_audit', sender: 'MERIDIAN TRANSIT HUB', text: 'ACCOUNT ALERT: YOUR LAST SHIPMENT HAS BEEN FLAGGED FOR AUDIT. PLEASE DOCK FOR REVIEW.',
      note: 'The resolution fee is the bribe amount the shipper declined to pay when the cargo was originally logged.',
      cond: (s) => (s.story && s.story.beatIndex >= 3) },
    { id: 'trap_bounty_tag', sender: 'CINDER BOUNTY BOARD', text: 'TARGET UPDATE: BOUNTY TAG 7713 EXTENDED. NEW EXPIRY: 72 HOURS.',
      note: "Tag 7713 is one digit off the player's tag (7714). This is either a data error or it isn't.",
      cond: (s) => (s.story && s.story.beatIndex >= 3) },
    { id: 'trap_distress', sender: 'FREE FRONTIER RELAY', text: 'DISTRESS SIGNAL: COORDINATES ATTACHED. REWARD POSTED.',
      note: 'The coordinates are in the contested corridor where Crimson Reach disables drives mid-transit.',
      cond: (s) => (s.story && s.story.beatIndex >= 4) },
    { id: 'trap_audit_fee', sender: 'MERIDIAN TRANSIT HUB', text: 'RESOLUTION FEE INVOICED: ACCOUNT VHL-4471-T. PAYMENT WINDOW: 6 CYCLES. POSTED BEFORE INSPECTION.',
      note: 'The fee was invoiced before the inspection that justifies it. The timestamp is the tell. The player who reads timestamps learns the inspection is the invoice.',
      cond: (s) => (s.story && s.story.beatIndex >= 3) },
    { id: 'trap_medicine_trace', sender: 'CONCORD CUSTOMS', text: 'RELIEF CARGO TRACE: BATCH R3-CARRIER / SHIPMENT 47-A / ORIGIN: PENDING. NOTIFY HALE IF LOCATED.',
      note: 'The medicine the player may have hauled at B1 is being traced. Hale is the filer. The origin is pending because the origin is the Pit grid that never arrived. The player is the link and does not know it yet.',
      cond: (s) => (s.story && s.story.beatIndex >= 2 && s.story.beatIndex <= 5) },
  ],

  // PERSONAL — mid-game, tied to story beats. Fire once.
  personal: [
    { id: 'pers_good_haul', sender: '[UNKNOWN ORIGIN]', text: 'GOOD HAUL LAST CYCLE. THE BOARD NOTICED.',
      note: 'Origin traces to Concord Relay 3, forwarded through four stations. This is how Director Vale communicates.',
      beat: 3, once: true },
    { id: 'pers_47a_pending', sender: 'CONCORD ADMIN', text: 'CONTRACT 47-A: PAYMENT PENDING. PLEASE ADVISE AVAILABILITY.',
      note: 'This is the first run. This message arrives in B6. The payment amount is correct.',
      beat: 6, once: true },
    { id: 'pers_slate_return', sender: '[UNDELIVERED — RETURN TO SENDER]', text: 'TO: SLATE / PIT SHIPYARD / RE: BERTH 4 / WE KNOW WHICH SEAM.',
      note: "Return-to-sender means either Slate moved or the sender didn't survive to check delivery.",
      beat: 4, once: true },
    { id: 'pers_voss_suspended', sender: 'HOLLOW STATION CLAIM OFFICE', text: 'VOSS FILING SUSPENDED: DISPUTE PENDING. NEW CREW ADVISE.',
      note: 'The second crew filed in time. The suspension will be lifted. The original claim reinstated. The second crew will not be notified.',
      beat: 5, once: true },
    { id: 'pers_elroy_unsigned', sender: '[RETURNED — RECIPIENT UNKNOWN]', text: 'TO: E. / RE: THE THIRD TAG / YOU SAW IT. I KNOW YOU SAW IT. FILE OR DON\u2019T. THE TAG DID.',
      note: 'Unsigned message addressed to a single initial. Elroy was the B2 target; the third tag flickered 0.5s before the kill feed overwrote it. This message is the residue the flicker left — the same-dock guarantee that the moral bruise was real. The recipient is unknown because Elroy no longer has an address.',
      beat: 3, once: true },
    { id: 'pers_kessler_margin', sender: 'TYCHO RELAY — PRIVATE QUEUE', text: 'KESSLER: YOUR DISCREPANCY CLOSED ITSELF. SIGNATURE ON FILE: VALE, D. NO ACTION REQUIRED FROM YOU.',
      note: 'The player’s 47-A discrepancy was closed by someone who was not the player. The signature is Vale’s. Kessler is told, not asked. The player is neither. This is how the algorithm signs.',
      beat: 5, once: true },
  ],

  // LATE GAME — Phase 3 HUD, B6-B7.
  late: [
    { id: 'late_blocked_sender', sender: '[CHANNEL UNAVAILABLE]', text: 'SENDER BLOCKED.',
      note: "The blocked sender is the player's own transponder, from a message sent 14 cycles ago on a channel that no longer exists.",
      beat: 6, once: true },
    { id: 'late_registry_unknown', sender: 'CONCORD REGISTRY', text: 'VESSEL STATUS UPDATE: [PLAYER SHIP ID] / STATUS: ACTIVE / OPERATOR: UNKNOWN.',
      note: "The player's name has been removed from the registry. Not deleted — the field reads UNKNOWN. Removal date = the B5 cargo audit.",
      beat: 6, once: true, persist: true },
    { id: 'late_ashfall_signal', sender: 'ASHFALL REACH', text: 'SIGNAL DETECTED: LONG-FORM TRANSMISSION. SOURCE: DERELICT STATION. CONTENTS: ADMINISTRATIVE LOG — 11 YEARS. RECEIVING?',
      note: "First contact with the Witness's station. Arrives as a comms popup, not a mission. Dismissable. Returns next cycle.",
      beat: 6, persist: true }, // persists across sessions until the player flies there
    { id: 'late_atmo_debt', sender: 'CONCORD ALA DIVISION', text: 'ATMO DEBT NOTICE: SECTOR 0 (THE PIT) / ACCUMULATED BALANCE: [FIGURE REDACTED] / STATUS: ADMINISTRATIVE CLOSURE PENDING / AUTHORIZED: D. VALE.',
      note: 'Internal administrative notice that should not appear to the player. Appears because they have secondary-log access. Balance = 14 years of deferred Silt maintenance = 12.4t of recycler catalyst grid relocated under code VALE-ALA-47A.',
      beat: 7, once: true },
    // Audit II.3: the algorithm recommends; Vale initials. Player sees the recommendation, not the choice.
    { id: 'late_algo_recommend', sender: 'CONCORD ALA — ALLOCATION ENGINE',
      text: 'RECOMMENDATION 7-SECTOR: REALLOCATE UNDERSERVICED ATMOSPHERIC ASSETS. NET BENEFIT PER CYCLE: POSITIVE. DISPOSITION: SIGNED D. VALE. FILED.',
      note: 'The engine does not name the Pit. The engine does not name anyone. The engine recommends a category. The category, this cycle, resolves to the Pit, to six outer sectors, to nine million breathers. Vale initials. The signature is correct. The signature is always correct. That is the horror: nothing in this filing is wrong.',
      beat: 7, once: true, persist: true },
    // Audit II.4: the Vethari silence has a budget. A division exists because the secret exists.
    { id: 'late_xenolinguistics_line', sender: 'RESEARCH STATION VEIL — INTERNAL',
      text: 'DIVISION 6 BUDGET RENEWED. LINE ITEM: SIGNAL CONTAINMENT. DURATION: INDEFINITE. JUSTIFICATION: SEALED. AUTHORIZED: D. VALE / REF 44-C.',
      note: 'Division 6 exists because the Vethari signal exists. Its budget renews every cycle under the same code that files everything else. The justification is sealed under REF 44-C — the same drawer. The player who has read the Witness ledger understands: someone is paying to keep the silence, and the payment is on the same ledger as the Pit’s air debt.',
      beat: 7, once: true },
  ],

  // Vale milestone filings — authored system acknowledgements keyed to what the player actually did.
  // They remain single-line text so the comms backlog, captions, and one-voice floor carry identical
  // readable copy without a modal or a second narrative surface.
  story: [
    { id: 'story_vale_profit_100k', sender: 'D. VALE / ADMIN / PRIORITY',
      text: 'LIFETIME MARGIN: 100,000 CR. REF 44-C NOW APPLIES. KEEP THE LEDGER CLEAN.',
      note: 'First 100,000 lifetime profit. Vale notices the player as an economic actor, not on a scripted chapter boundary.',
      once: true, persist: true },
    { id: 'story_vale_conflict_flip', sender: 'D. VALE / ADMIN / PRIORITY',
      text: 'SECTOR REVISION FILED. YOUR WEIGHT IS IN THE MARGIN. REF 44-C.',
      note: 'First conflict flip with non-zero player influence. An NPC-only territorial change does not address the player.',
      once: true, persist: true },
    { id: 'story_vale_claim_charter', sender: 'D. VALE / ADMIN / PRIORITY',
      text: 'CHARTER RECORDED: {CLAIM}. OWNERSHIP ENTERS THE LEDGER. REF 44-C.',
      note: 'First player claim charter. The live body name replaces {CLAIM} so the filing identifies what the player owns.',
      once: true, persist: true },
    // Final direct line — fires once at endgame jump-charge, regardless of choice (B7).
    { id: 'story_vale_goodwork', sender: '[NO SENDER · NO CHANNEL ID]', text: 'Good work. Keep it clean.',
      note: "Vale's final unfiled line. Fires the moment the jump drive begins charging from Ashfall Reach.",
      beat: 7, once: true, persist: true },
    // B8 — Wren artifact thread opener (salvage:communicatorFound trigger in story.js).
    { id: 'story_b8_helix_audit', sender: 'HELIX DIRECTORATE', text: 'VESSEL VHL-4471-T — VARIANCE FILE OPEN. COORDINATES ON ATTACHED MANIFEST DO NOT RESOLVE. NO ACTION REQUIRED.',
      note: 'Paper-faction audit ping. The coordinate file on the salvaged communicator never decodes — the system files it anyway.',
      beat: 8, once: true },
  ],
};

// ── Graffiti catalog ─────────────────────────────────────────────────────────────────────────
// Driven by `graffiti:show` { line, where, author?, beat }. `where` = 'airlock' | 'shipyard' |
// 'clearing' | 'chain_dest' | 'bulkhead' (player's own). The through-line: "THEY KNEW THE MASS."
export const GRAFFITI = {
  // Previous crew — Tessera gang markings. Still on the bulkhead. Never coming off.
  // Dark humor. Short. Punk. The dead talking.
  // Written by a crew who knew their odds and went anyway. You inherit their handwriting.
  GANG_DIDNT_MAKE_IT:  "IF YOU'RE READING THIS WE DIDN'T MAKE IT. DON'T TAKE IT PERSONALLY.",
  GANG_SHE_HELD:       'SHE HELD TOGETHER. WE DIDN\'T.',
  GANG_SEVEN_RUNS:     'SEVEN RUNS. ONE WE DON\'T TALK ABOUT.',
  GANG_QUIET_PAYS:     'THE QUIET PAYS WELL UNTIL IT DOESN\'T.',
  GANG_COUNT_EXITS:    'BERTH 4. FIVE WENT OUT. THE FEES ARE STILL RUNNING.',
  GANG_STILL_FLYING:   'DEAD MEN\'S SHIP. STILL FLYING. MAKE SOMETHING OF IT.',

  // The recurring callback. Appears first at B0 home airlock; returns on the bulkhead at B3+.
  // By B6 it's in the player's own hand — they wrote it without remembering they did.
  THEY_KNEW_THE_MASS:        'THEY KNEW THE MASS.',
  THEY_ALWAYS_KNEW:          'THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.',

  // Per-location / per-beat lines (verbatim from the spine doc).
  REDISTRIBUTED:             'REDISTRIBUTED TO THE HIGHEST BIDDER.',   // B1 destination (appears early)
  THEY_WERE_CARRYING_MEDICINE: 'THEY WERE CARRYING MEDICINE.',          // B2 after Elroy kill
  WELD_KNOWS:                'THE WELD KNOWS WHO CUT IT TWICE.',       // B3 shipyard (Slate's line)
  VARIANCE_ADJUSTMENT:       'VARIANCE ADJUSTMENT',                    // B3 ship name on a hull (Kessler's terminology — the tell)
  EVERY_MAN_PAYS_TWICE:      'EVERY MAN PAYS TWICE. FIRST IN FLESH. THEN IN COIN.', // B4 clearing (MTS)
  WALLS_NEVER_PRISON:        'THE WALLS WERE NEVER THE REAL PRISON.',  // B5 chain dest (Quiet)
  HELIOS_NOT_NEEDED:         "HELIOS DIDN'T NEED IT. THEY TOOK IT ANYWAY.", // B0 foreshadow — the wrong-grid reveal (paid off at Ashfall Reach)

  // Endgame graffiti (from ENDGAME-B7-REDESIGN).
  CLEAN_UNIFORM_AIRLOCK:     'AUXILIARY COMMISSION: SIGNED D. VALE. PAPER: NEW. HAND: SAME.',
  CLEAN_UNIFORM_BULKHEAD:    'CLEARANCE GRANTED. REQUISITION ATTACHED. CYCLE LOGGED.',
  SILENCE_BULKHEAD:          "OPERATOR FIELD: CHANNEL. FREIGHT MOVED: DAILY.",
  SILENCE_OLD_BERTH:         'THEY NEVER SHOWED BUT THE CARGO MOVED.',
  SILENCE_BERTH_BELOW:       "DON'T ASK WHO SENT IT.",
  NEXT_RUN_HOME:             'YOU KNEW THE MASS AND YOU TOOK THE COIN.',
  THIS_ONE_STAYED:           'THIS ONE STAYED.',                       // Choice D
  NOT_COMING_BACK:           "THEY'RE NOT COMING BACK.",               // Choice D

  // Thread B post-endgame addition (STORY-STRUCTURE).
  COORDINATES_DONT_MATCH:    'THE COORDINATES DON\u2019T MATCH ANYTHING ON FILE.',

  // New testimony-form additions. Each names a beneficiary, a number, or a fact.
  // No maxims, no chiasmus — the wall states the receipt; the reader keeps the verdict.
  MOISTURE_LOSS_NINE:        'SHAFT 7. 9 OF 11 RETURNED. 0.7T FILED AS MOISTURE. THE MATH IS LEGAL.',
  ATMO_SHORT_HELD:           'THE PIT\u2019S AIR FELL. THE TOKEN ROSE. SAME DESK. BOTH BOOKS.',
  ALGO_RECOMMENDS_VALE_SIGNS:'THE ENGINE DID NOT NAME US. THE ENGINE DOES NOT NAME ANYONE.',
  ELROY_THIRD_TAG:           'THE THIRD TAG WAS THERE FOR HALF A SECOND. IT COUNTED.',
  KESSLER_DAUGHTER_BERTH:    'KESSLER. SCALE 4. TYCHO. TWENTY-TWO MONTHS. LOOK IT UP.',
  FILTER_RECALL_PENDING:     'R3-CARRIER WITHDRAWN YEAR 3. REPLACEMENT PENDING YEAR 17.',
  QUITE_COUNT_DOORS:         'FORTY-ONE HULLS. FORTY-ONE FILINGS. ZERO CARGO. COUNT DOORS.',
  REACH_WEIGH_SHORT:         'WEIGH-SLIP OPEN. FOUR HULLS. THREE FILLED. ONE SHORT TO THE LANE.',
};

// ── Beat → narrative content (replaces the flat BEAT_HINT tutorial strings) ──────────────────
// For each beat index, the story system fires the listed devices when the beat becomes current.
// `hint` is the new "Captain's Log north star" — in-world voice, not tutorial.
// `phase` sets the HUD meta-arc phase (1 Protective / 2 Complicit / 3 Absent).
//
// Beat indices match src/data/missions.js STORY_BEATS[] exactly (0..7). Trigger-only extensions
// live in POST_SPINE_BEAT_CONTENT so the Codex cannot mistake them for playable chapters.
export const BEAT_CONTENT = [
  { // B0 — COLD START
    beat: 0, phase: 1,
    // Flavor-only Captain's Log voice (story-mode panel / Mission Log context). Not a flight
    // command — first-flight B0 uses the one-verb hierarchy (HUD tracker + single tutorial bark).
    hint: 'Contract 47-A. Mass on accept: 12.4t. Authorization: VALE, D. / REF 44-C. Sample the discrepancy. Deliver Helios. Payment withheld.',
    // Bulkhead: the previous crew's last words. Set by _fireColdStart() on game:started so it's there
    // from the first frame. This beat's graffiti only adds the airlock line (seen on first dock).
    // The gang line stays on the bulkhead through B2; at B3 the story takes it over.
    graffiti: [
      { line: GRAFFITI.THEY_KNEW_THE_MASS, where: 'airlock' },
      // Foreshadow the wrong-grid reveal: a line the player cannot parse on first read.
      // Paid off at Ashfall Reach when the Witness's ledger shows the grid was shelved uninstalled.
      { line: GRAFFITI.HELIOS_NOT_NEEDED, where: 'airlock', delayS: 4 },
    ],
    comms: [], // 47-A authorisation line is ambient (Tycho relay) — player "almost certainly doesn't read it"
    hudLie: 'stable_load', // CARGO shows STABLE LOAD after the cargo is gone
  },
  { // B1 — HONEST WORK
    beat: 1, phase: 1,
    hint: 'Haul the components. The manifest will say INDUSTRIAL COMPONENTS. At destination it will say SURPLUS REDISTRIBUTION. Nobody will flag the change. This is normal.',
    graffiti: [{ line: GRAFFITI.REDISTRIBUTED, where: 'airlock' }], // appears at destination airlock
    comms: [],
    hudLie: 'manifest_silent_correct', // manifest self-corrects silently, no notification
  },
  { // B2 — FIRST BLOOD (Elroy)
    beat: 2, phase: 1,
    hint: 'Eliminate the hostile. The tag will read UNKNOWN before, THREAT NEUTRALIZED after. There is a third tag, briefly. You may not catch it.',
    graffiti: [
      { line: GRAFFITI.THEY_WERE_CARRYING_MEDICINE, where: 'airlock', delayS: 2 },
      // Same-session residue (audit W06): even if the 0.5s flicker is missed, the wall names it.
      { line: GRAFFITI.ELROY_THIRD_TAG, where: 'airlock', delayS: 6 },
    ],
    comms: [],
    hudLie: 'civilian_tag_flicker', // CIVILIAN VESSEL — REGISTERED flickers 0.5s, then kill feed overwrites
  },
  { // B3 — BIGGER BOAT
    beat: 3, phase: 1,
    hint: 'Buy a bigger hull. A ship at the yard is named VARIANCE ADJUSTMENT. That is Kessler\u2019s terminology. Someone who worked the scales named it before they sold it.',
    graffiti: [
      { line: GRAFFITI.WELD_KNOWS, where: 'shipyard' },
      { line: GRAFFITI.VARIANCE_ADJUSTMENT, where: 'shipyard', author: 'hull stencil' },
      // The story's refrain takes over the bulkhead at B3: the board noticed you.
      // The gang's voice is gone. You're no longer just flying a dead crew's ship.
      { line: GRAFFITI.THEY_KNEW_THE_MASS, where: 'bulkhead' },
    ],
    comms: ['pers_good_haul'], // "GOOD HAUL LAST CYCLE. THE BOARD NOTICED." — the Vale popup
    hudLie: null,
  },
  { // B4 — PICK A SIDE (branch)
    beat: 4, phase: 2,
    hint: 'Three intro contracts, one clearing station. The administrator field reads V. DIRECTOR, ACTING. All three sides run through the same administrator.',
    graffiti: [{ line: GRAFFITI.EVERY_MAN_PAYS_TWICE, where: 'clearing' }],
    comms: ['pers_slate_return'],
    hudLie: null,
  },
  { // B5 — PROVING GROUND
    beat: 5, phase: 2,
    hint: 'Complete the chain. One target vessel\u2019s last registered owner is VALE HOLDINGS LLC. The salvage manifest you deliver will read ADMINISTRATIVE RECORDS \u2014 3 YEARS / SEALED.',
    graffiti: [{ line: GRAFFITI.WALLS_NEVER_PRISON, where: 'chain_dest' }],
    comms: ['pers_voss_suspended'],
    hudLie: 'manifest_silent_correct', // Phase 2 begins; manifest self-corrects (INDUSTRIAL COMPONENTS -> ADMINISTRATIVE RECORDS)
  },
  { // B6 — EMPIRE SEED
    beat: 6, phase: 3,
    hint: 'Deploy first asset. First remittance line: CLEARED — VALE HOLDINGS LLC.',
    graffiti: [{ line: GRAFFITI.THEY_KNEW_THE_MASS, where: 'bulkhead' }], // player's own bulkhead, their own hand
    comms: ['pers_47a_pending', 'late_blocked_sender', 'late_registry_unknown', 'late_ashfall_signal'],
    hudLie: 'phase3_freeze', // tags freeze on last-known state; CONTRACT 47-A shows PENDING (the truth)
  },
  { // B7 — THE DEEP REACH
    beat: 7, phase: 3,
    hint: 'Deep Reach operation, then Ashfall desk. Ledger COUNTERPARTY: your prior transponder. Elroy: DECEASED.',
    graffiti: [
      { line: GRAFFITI.THEY_ALWAYS_KNEW, where: 'bulkhead' },
      // The algorithm line lands here, beside the Witness ledger: the horror is that nothing was wrong.
      { line: GRAFFITI.ALGO_RECOMMENDS_VALE_SIGNS, where: 'bulkhead', delayS: 4 },
    ],
    comms: ['late_atmo_debt', 'late_algo_recommend', 'late_xenolinguistics_line'],
    hudLie: 'phase3_freeze', // final contract entry PENDING; cannot be closed
  },
];

// Triggered narrative hooks outside the playable eight-beat mission spine. These reuse the same
// device packet shape, but are addressed explicitly by their trigger rather than story.beatIndex.
export const POST_SPINE_BEAT_CONTENT = {
  8: { // B8 — WREN THREAD (fires on salvage:communicatorFound)
    beat: 8, phase: 3,
    hint: 'The communicator still carries a coordinate file. The registry cross-check returns NO MATCH. That is also normal.',
    graffiti: [{ line: GRAFFITI.COORDINATES_DONT_MATCH, where: 'bulkhead' }],
    comms: ['story_b8_helix_audit'],
    hudLie: null,
  },
};

// ── Endgame choices (Ashfall Reach, after B7 gate met) ───────────────────────────────────────
// Presented as board entries + a graffiti-only option + a stay-at-desk option. Only one can be
// accepted. From ENDGAME-B7-REDESIGN.md (Choices A-E). `requires` gates availability.
export const ENDGAME_CHOICES = [
  {
    id: 'A', key: 'clean_uniform', title: 'THE CLEAN UNIFORM',
    boardText: 'CONCORD AUXILIARY COMMISSION — SECTOR ADMINISTRATOR APPOINTMENT',
    hudOnAccept: 'Appointment confirmed. Record expunged. Welcome to the service.',
    graffitiBulkhead: GRAFFITI.CLEAN_UNIFORM_BULKHEAD,
    graffitiNextAirlock: GRAFFITI.CLEAN_UNIFORM_AIRLOCK,
    summary: 'Concord rep → +700 (Hero). Criminal record cleared. Station surcharges gone. The HUD stabilizes — clean tags, accurate IFF. Everything looks clean.',
    hiddenCost: 'The first offered mission is a ROUTINE CUSTOMS OPERATION. The seized cargo belonged to someone you worked with. The manifest already assigns it to a private buyer.',
    requires: () => true,
    kind: 'contract', // appears on the contract board
  },
  {
    id: 'B', key: 'same_silence', title: 'THE SAME SILENCE',
    boardText: 'QUIET SYNDICATE — SENIOR ROUTING POSITION (UNDISCLOSED LOCATION)',
    hudOnAccept: 'Position confirmed. Traffic begins immediately.',
    graffitiBulkhead: GRAFFITI.SILENCE_BULKHEAD,
    graffitiOldBerth: GRAFFITI.SILENCE_OLD_BERTH,
    graffitiBerthBelow: GRAFFITI.SILENCE_BERTH_BELOW,
    summary: 'Identity disappears from public records. Name stops appearing on boards. ROUTING OVERSIGHT jobs unlock — logistics only, no direct action. The cut arrives automatically.',
    hiddenCost: 'The pilots run contracts that look exactly like yours used to. Your callsign will show up in someone else\u2019s graffiti. The HUD stops showing your own rep delta. You can see the freight moving. You cannot see yourself.',
    requires: () => true,
    kind: 'contract',
  },
  {
    id: 'C', key: 'only_honest', title: 'THE ONLY HONEST OPTION',
    boardText: null, // NO board entry — graffiti only, on the bulkhead after B6
    promptText: 'JUMP WITHOUT DESTINATION?',
    graffitiBulkhead: GRAFFITI.THEY_ALWAYS_KNEW,
    summary: 'No contract. A graffiti line. Fly to Ashfall Reach with full load, no active contracts, initiate jump-drive charge toward the wormhole with no destination registered.',
    hiddenCost: 'The jump completes. You emerge at the Pit\u2019s docking bay. The date is the same as the day you left. The board shows one entry: CONTRACT 47-A — OPEN / PAYMENT: PENDING. The wormhole is not an exit; it is the system telling you that you are already in the only place you were ever going to be. The campaign resets. The HUD prints: CARGO: STABLE.',
    requires: (s) => inSector(s, 'sector_ashfall_reach') && noActiveMissions(s) && fullLoad(s),
    kind: 'wormhole', // fires on jump-charge-without-destination prompt
  },
  {
    id: 'D', key: 'ledger_continues', title: 'THE LEDGER CONTINUES',
    boardText: null, // no board entry; prompt on attempting to leave Ashfall Reach with the ledger
    promptText: 'DEPART ASHFALL REACH?',
    graffitiOnStay: GRAFFITI.THIS_ONE_STAYED,
    graffitiNeverReturn: GRAFFITI.NOT_COMING_BACK,
    summary: 'Available only if you took the Witness\u2019s ledger and have not jettisoned it. Stay. Become the next Witness. Watch, record, stay.',
    hiddenCost: 'Your ledger entry transitions COUNTERPARTY — ACTIVE → WITNESS — CURRENT. The patterns keep recurring. The Witness who was here eventually leaves — not by dying, just by not being there when you check next cycle.',
    requires: (s) => hasCargo(s, 'cmdty_personal_ledger'),
    kind: 'stay', // fires on depart-Ashfall prompt if player chooses to stay
  },
  {
    id: 'E', key: 'next_run', title: 'THE NEXT RUN',
    boardText: null, // no board entry; a courier NPC dialog line, not a contract
    promptText: 'Contract settled. New one\u2019s open.',
    graffitiHome: GRAFFITI.NEXT_RUN_HOME,
    summary: 'Decline all four (A, B, C, D). Approach the Ashfall Reach station one final time. A courier who was not there before says the line. Accept the payout for 47-A: +1,200cr. Status: CLOSED. Immediately: CONTRACT 47-B: STATUS: PENDING.',
    hiddenCost: 'You know exactly whose air is being cut off by the cargo you carry. You need reactor fuel. You click Accept.',
    requires: (s) => declinedAll(s, ['A', 'B', 'C', 'D']),
    kind: 'courier',
  },
];

// ── Witness (Ashfall Reach derelict station) ────────────────────────────────────────────
export const KURTZ = {
  sectorId: 'sector_ashfall_reach',
  ledgerCargoId: 'cmdty_personal_ledger',
  ledgerName: 'PERSONAL EFFECTS',
  ledgerMass: 0.4,
  coordsCargoId: 'cmdty_navigational_data',
  coordsName: 'NAVIGATIONAL DATA',
  coordsMass: 0.01,
  dialogue: [
    'I know what you\u2019re carrying. I knew before you got here. The mass is always the same. Only the manifest changes.',
    'Filed it myself. Eleven years. Same columns. The handwriting hasn\u2019t improved.', // muttered, to the wall
    'The count never ends. You know that. That\u2019s why you\u2019re here.', // the parting line (canonical)
    "You're still here.",   // on repeat approach
    'You can have the desk.', // later
  ],
};

// ── Persistent cargo (Thread B + Choice D) ───────────────────────────────────────────────────
// These items cannot be sold or jettisoned; the game treats them as PERSONAL EFFECTS.
export const PERSISTENT_CARGO = [
  { id: 'cmdty_47a_assay_sample', name: '47-A ASSAY SAMPLE', mass: 0.0031, note: 'SEALED EVIDENCE — CONTRACT 47-A. Deliver to Helios Station.' },
  { id: 'cmdty_unclassified_composite', name: 'UNCLASSIFIED COMPOSITE', mass: 0.0031, note: 'PERSONAL EFFECTS — 3.1 kg. The second fragment. In the manifest since first launch.' },
  KURTZ.ledgerCargoId && { id: KURTZ.ledgerCargoId, name: KURTZ.ledgerName, mass: KURTZ.ledgerMass, note: 'The Witness\u2019s ledger. 0.4t. The mass never changes, even if jettisoned.' },
  KURTZ.coordsCargoId && { id: KURTZ.coordsCargoId, name: KURTZ.coordsName, mass: KURTZ.coordsMass, note: 'Coordinates in a format no database recognizes. 0.01t. Format: unknown.' },
].filter(Boolean);

/** Thread-B fragment present from New Game (PERSONAL EFFECTS). Not the B0 assay sample. */
export const THREAD_B_FRAGMENT_ID = 'cmdty_unclassified_composite';

/** B0 contract body — optional deep-read; numbers only, no lore dump. */
export const CONTRACT_47A_B0_BODY = Object.freeze({
  contractId: '47-A',
  title: 'Contract 47-A: Mass Variance Sample',
  massAcceptT: 12.4,
  massDeliverT: 0,
  authorization: 'APPROVED: VALE, D. / MID-SECTOR ADMIN / REF 44-C',
  code: 'VALE-ALA-47A',
  summary: 'Mass on accept: 12.4t. Authorization: VALE, D. / REF 44-C. Sample the discrepancy. Deliver to Helios Station.',
  fullText: [
    'CONTRACT 47-A — MASS VARIANCE / ASSAY RECOVERY',
    'MASS ON ACCEPT: 12.4t',
    'MASS ON DELIVERY: RECONCILED TO LOG',
    'AUTHORIZATION: APPROVED: VALE, D. / MID-SECTOR ADMIN / REF 44-C',
    'CODE: VALE-ALA-47A',
    'STATUS: OPEN / PAYMENT: PENDING',
  ].join('\n'),
});

/** Post-ending home airlock lines (ENDGAME-B7). Keyed by ending id. */
export const ENDING_AIRLOCK_GRAFFITI = Object.freeze({
  A: GRAFFITI.CLEAN_UNIFORM_AIRLOCK,
  B: GRAFFITI.SILENCE_OLD_BERTH,
  C: GRAFFITI.THEY_KNEW_THE_MASS,
  D: GRAFFITI.THIS_ONE_STAYED,
  E: GRAFFITI.NEXT_RUN_HOME,
});

/** Helios Bay 7 wrong-grid payoff (optional explore). */
export const HELIOS_BAY7 = Object.freeze({
  stationId: 'station_helios',
  sectorId: 'sector_helios_prime',
  poiId: 'poi_helios_bay7',
  ticketId: 'Y3-C2',
  scanLine: 'SHELVED GRID — 12.4t / TICKET Y3-C2: ODOR CONSISTENT WITH TRANSIT. NO ACTION.',
  massT: 12.4,
});

// ── Condition helpers (pure; take state, return boolean) ────────────────────────────────────
// These read state defensively so the data tables above can reference them without importing systems.
function hasContraband(s) {
  const items = (s.player && s.player.cargo && s.player.cargo.items) || {};
  // contraband/restricted commodity ids begin with cmdty_ and are flagged in commodities data, but
  // for the comms condition we use a conservative heuristic: any known contraband id present.
  const CONTRABAND = ['cmdty_contraband', 'cmdty_stimulants', 'cmdty_exotics', 'cmdty_black_market_tech'];
  return CONTRABAND.some((id) => items[id] > 0);
}
function inHighSecurity(s) {
  const sec = currentSectorDef(s);
  return !!(sec && sec.security >= 0.6);
}
function sectorDwellS(s) {
  return (s.world && s.world._sectorEnterSimTime != null)
    ? Math.max(0, (s.simTime || 0) - s.world._sectorEnterSimTime) : 0;
}
function currentSectorDef(s) {
  const id = s.world && s.world.currentSectorId;
  return id && s.world.sectors ? s.world.sectors[id] : null;
}
function inSector(s, sectorId) {
  return !!(s.world && s.world.currentSectorId === sectorId);
}
function noActiveMissions(s) {
  const a = (s.missions && s.missions.active) || [];
  return a.length === 0;
}
function fullLoad(s) {
  const c = s.player && s.player.cargo;
  if (!c) return false;
  return c.capVolume > 0 && (c.usedVolume || 0) >= c.capVolume * 0.95;
}
function hasCargo(s, id) {
  const items = (s.player && s.player.cargo && s.player.cargo.items) || {};
  return (items[id] || 0) > 0;
}
function declinedAll(s, choiceIds) {
  // Canonical path is state.story.endgameDeclined (top-level, written by UI/story).
  // Fall back to legacy flags.endgameDeclined only when the top-level field is absent.
  let decl = [];
  if (s.story && Array.isArray(s.story.endgameDeclined)) {
    decl = s.story.endgameDeclined;
  } else if (s.story && s.story.flags && Array.isArray(s.story.flags.endgameDeclined)) {
    decl = s.story.flags.endgameDeclined;
  }
  return choiceIds.every((id) => decl.includes(id));
}

// Re-export the condition helpers so the story system can also call them directly if needed.
export const COND = { hasContraband, inHighSecurity, sectorDwellS, inSector, noActiveMissions, fullLoad, hasCargo, declinedAll };
