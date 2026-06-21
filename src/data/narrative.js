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
  kurtz:         { name: '(unnamed)',   role: 'the Kurtz figure — derelict administrator, Ashfall Reach' },
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
  ambient: [
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
    { id: 'amb_ala_silt',       sender: 'CONCORD ALA DIVISION', text: 'SILT ALLOCATION NOTICE: REFINED SLURRY DELIVERY SUSPENDED FOR SECTOR 0 PENDING ATMO DEBT REVIEW. APPEAL WINDOW: 12 CYCLES.',
      note: 'The appeal window has been open and unfilled for 14 years. The Pit does not know it has one.' },
    { id: 'amb_sec6_air',       sender: 'SECTOR 6 TRADING POST', text: 'BREATHABLE AIR: PRESSURIZED CANISTERS, 150KG, ORIGIN UNSPECIFIED. PRICE ON REQUEST.',
      note: "The Quiet's booth. 'Origin unspecified' is the tell. The buyer pays for anonymity, not the air." },
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
      note: "First contact with the Kurtz figure's station. Arrives as a comms popup, not a mission. Dismissable. Returns next cycle.",
      beat: 6, persist: true }, // persists across sessions until the player flies there
    { id: 'late_atmo_debt', sender: 'CONCORD ALA DIVISION', text: 'ATMO DEBT NOTICE: SECTOR 0 (THE PIT) / ACCUMULATED BALANCE: [FIGURE REDACTED] / STATUS: ADMINISTRATIVE CLOSURE PENDING / AUTHORIZED: D. VALE.',
      note: 'Internal administrative notice that should not appear to the player. Appears because they have secondary-log access. Balance = 14 years of deferred Silt maintenance = 12.4t of recycler catalyst grid relocated under code VALE-ALA-47A.',
      beat: 7, once: true },
  ],

  // The single direct Vale line — fires once at endgame jump-charge, regardless of choice (B7).
  story: [
    { id: 'story_vale_goodwork', sender: '[NO SENDER · NO CHANNEL ID]', text: 'Good work. Keep it clean.',
      note: "Vale's only direct line. Fires the moment the jump drive begins charging from Ashfall Reach.",
      beat: 7, once: true, persist: true },
  ],
};

// ── Graffiti catalog ─────────────────────────────────────────────────────────────────────────
// Driven by `graffiti:show` { line, where, author?, beat }. `where` = 'airlock' | 'shipyard' |
// 'clearing' | 'chain_dest' | 'bulkhead' (player's own). The through-line: "THEY KNEW THE MASS."
export const GRAFFITI = {
  // The recurring callback. Appears first at B0 home airlock; returns on the bulkhead at B6; the
  // doubled form at B7. Never repainted over for long.
  THEY_KNEW_THE_MASS:        'THEY KNEW THE MASS.',
  THEY_ALWAYS_KNEW:          'THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.',

  // Per-location / per-beat lines (verbatim from the spine doc).
  REDISTRIBUTED:             'REDISTRIBUTED TO THE HIGHEST BIDDER.',   // B1 destination (appears early)
  THEY_WERE_CARRYING_MEDICINE: 'THEY WERE CARRYING MEDICINE.',          // B2 after Elroy kill
  WELD_KNOWS:                'THE WELD KNOWS WHO CUT IT TWICE.',       // B3 shipyard (Slate's line)
  VARIANCE_ADJUSTMENT:       'VARIANCE ADJUSTMENT',                    // B3 ship name on a hull (Kessler's terminology — the tell)
  EVERY_MAN_PAYS_TWICE:      'EVERY MAN PAYS TWICE. FIRST IN FLESH. THEN IN COIN.', // B4 clearing (MTS)
  WALLS_NEVER_PRISON:        'THE WALLS WERE NEVER THE REAL PRISON.',  // B5 chain dest (Quiet)

  // Endgame graffiti (from ENDGAME-B7-REDESIGN).
  CLEAN_UNIFORM_AIRLOCK:     'The signature is always the same. Only the paper changes.',
  CLEAN_UNIFORM_BULKHEAD:    'They let you in. That means they need something from you.',
  SILENCE_BULKHEAD:          "You're not a person anymore. You're a channel. That's fine. Channels last longer.",
  SILENCE_OLD_BERTH:         'THEY NEVER SHOWED BUT THE CARGO MOVED.',
  SILENCE_BERTH_BELOW:       "DON'T ASK WHO SENT IT.",
  NEXT_RUN_HOME:             'YOU KNEW THE MASS AND YOU TOOK THE COIN.',
  THIS_ONE_STAYED:           'THIS ONE STAYED.',                       // Choice D
  NOT_COMING_BACK:           "THEY'RE NOT COMING BACK.",               // Choice D

  // Thread B post-endgame addition (STORY-STRUCTURE).
  COORDINATES_DONT_MATCH:    'THE COORDINATES DON\u2019T MATCH ANYTHING ON FILE.',
};

// ── Beat → narrative content (replaces the flat BEAT_HINT tutorial strings) ──────────────────
// For each beat index, the story system fires the listed devices when the beat becomes current.
// `hint` is the new "Captain's Log north star" — in-world voice, not tutorial.
// `phase` sets the HUD meta-arc phase (1 Protective / 2 Complicit / 3 Absent).
//
// Beat indices match src/data/missions.js STORY_BEATS[] (0..7).
export const BEAT_CONTENT = [
  { // B0 — COLD START
    beat: 0, phase: 1,
    hint: 'Contract 47-A. Mine the ore. Deliver it. The weight on accept will not be the weight on delivery. That is not your problem.',
    graffiti: [{ line: GRAFFITI.THEY_KNEW_THE_MASS, where: 'airlock' }],
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
    graffiti: [{ line: GRAFFITI.THEY_WERE_CARRYING_MEDICINE, where: 'airlock', delayS: 8 }],
    comms: [],
    hudLie: 'civilian_tag_flicker', // CIVILIAN VESSEL — REGISTERED flickers 0.5s, then kill feed overwrites
  },
  { // B3 — BIGGER BOAT
    beat: 3, phase: 1,
    hint: 'Buy a bigger hull. A ship at the yard is named VARIANCE ADJUSTMENT. That is Kessler\u2019s terminology. Someone who worked the scales named it before they sold it.',
    graffiti: [
      { line: GRAFFITI.WELD_KNOWS, where: 'shipyard' },
      { line: GRAFFITI.VARIANCE_ADJUSTMENT, where: 'shipyard', author: 'hull stencil' },
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
    hint: 'Deploy your first asset. The first deposit clears through VALE HOLDINGS LLC. This was always the case. You just started generating enough income for the line to appear.',
    graffiti: [{ line: GRAFFITI.THEY_KNEW_THE_MASS, where: 'bulkhead' }], // player's own bulkhead, their own hand
    comms: ['pers_47a_pending', 'late_blocked_sender', 'late_registry_unknown', 'late_ashfall_signal'],
    hudLie: 'phase3_freeze', // tags freeze on last-known state; CONTRACT 47-A shows PENDING (the truth)
  },
  { // B7 — THE DEEP REACH
    beat: 7, phase: 3,
    hint: 'Ashfall Reach. The Kurtz figure has been here eleven years. Your callsign is in the ledger under COUNTERPARTY, filed six weeks before your first contract. You were in the record before you arrived.',
    graffiti: [{ line: GRAFFITI.THEY_ALWAYS_KNEW, where: 'bulkhead' }],
    comms: ['late_atmo_debt'],
    hudLie: 'phase3_freeze', // final contract entry PENDING; cannot be closed
  },
];

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
    summary: 'Available only if you took the Kurtz figure\u2019s ledger and have not jettisoned it. Stay. Become the next Kurtz figure. Watch, record, stay.',
    hiddenCost: 'Your ledger entry transitions COUNTERPARTY — ACTIVE → WITNESS — CURRENT. The patterns keep recurring. The Kurtz figure who was here eventually leaves — not by dying, just by not being there when you check next cycle.',
    requires: (s) => hasCargo(s, 'cmdty_personal_ledger'),
    kind: 'stay', // fires on depart-Ashfall prompt if player chooses to stay
  },
  {
    id: 'E', key: 'next_run', title: 'THE NEXT RUN',
    boardText: null, // no board entry; a courier NPC dialog line, not a contract
    promptText: 'Contract settled. New one\u2019s open.',
    graffitiHome: GRAFFITI.NEXT_RUN_HOME,
    summary: 'Decline all four (A, B, C, D). Approach the Ashfall Reach station one final time. A courier who was not there before says the line. Accept the payout for 47-A: +1,200cr. Status: CLOSED. Immediately: CONTRACT 47-B: STATUS: PENDING.',
    hiddenCost: 'You are not a Sector Baron. Not a shadow coordinator. Not a witness. Not a symbol. You are just another tired pilot in a cheap hull who needs to pay for reactor fuel. You know exactly whose air is being cut off by the cargo you carry. You click Accept anyway.',
    requires: (s) => declinedAll(s, ['A', 'B', 'C', 'D']),
    kind: 'courier',
  },
];

// ── Kurtz figure (Ashfall Reach derelict station) ────────────────────────────────────────────
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
    'The count never ends. You know that. That\u2019s why you\u2019re here.',
    "You're still here.",   // on repeat approach
    'You can have the desk.', // later
  ],
};

// ── Persistent cargo (Thread B + Choice D) ───────────────────────────────────────────────────
// These items cannot be sold or jettisoned; the game treats them as PERSONAL EFFECTS.
export const PERSISTENT_CARGO = [
  { id: 'cmdty_unclassified_composite', name: 'UNCLASSIFIED COMPOSITE', mass: 0.0031, note: 'PERSONAL EFFECTS — 3.1 kg. The second fragment. In the manifest since first launch.' },
  KURTZ.ledgerCargoId && { id: KURTZ.ledgerCargoId, name: KURTZ.ledgerName, mass: KURTZ.ledgerMass, note: 'The Kurtz figure\u2019s ledger. 0.4t. The mass never changes, even if jettisoned.' },
  KURTZ.coordsCargoId && { id: KURTZ.coordsCargoId, name: KURTZ.coordsName, mass: KURTZ.coordsMass, note: 'Coordinates in a format no database recognizes. 0.01t. Might weigh everything.' },
].filter(Boolean);

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
  const decl = (s.story && s.story.flags && s.story.flags.endgameDeclined) || [];
  return choiceIds.every((id) => decl.includes(id));
}

// Re-export the condition helpers so the story system can also call them directly if needed.
export const COND = { hasContraband, inHighSecurity, sectorDwellS, inSector, noActiveMissions, fullLoad, hasCargo, declinedAll };
