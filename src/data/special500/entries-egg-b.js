// src/data/special500/entries-egg-b.js — batch cat-egg-b (46 easter-egg entries).
// Authored from the ratified consensus rows in design/program/special-500/CONSENSUS_500.json
// (ids in design/program/special-500/batches/cat-egg-b.json); each entry folds its
// mergedFrom content and applies the debate's hones directives.
//
// Sector notes: every consensus sector exists in the live chart (frontierRegions packs
// included), so this batch needs NO sector remaps. The Triton Wake entries (SP2-028,
// SP2-153) use the real sector_triton_wake and anchor to the real poi_triton_watcher —
// the wave-1 "Triton Wake -> sector_charon_expanse" remap is superseded now that the
// chart carries the sector. One consensus self-contradiction reconciled by place name:
// SP1-014 said "sector_pallas_drift, station_reach dock" — the dock it names is Reach
// Station, so the entry lives in sector_io_reach. Every receipt event was verified
// against src/systems emitters; every flag trigger names a real flag writer
// (special500.SP2-034 is authored in cat-comms-b; quill_copied is src/data/quill.js's
// copiedFlag; the Doss gate is dossArchiveComplete, nudged by
// stationContact:counterChanged). No entry channels mail — mail rows are the serial
// integration pass and are named in followups.

export const ENTRIES_EGG_B = [
  // SP2-109 — The Archive's Borrowing Card: Doss issues you a library card for
  // everything. The real gate is the three core doss source flags; the counter tick
  // is only the eligibility nudge.
  {
    id: 'SP2-109',
    kind: 'easter-egg',
    title: 'The Archive\'s Borrowing Card',
    sectors: [],
    trigger: { type: 'receipt', event: 'stationContact:counterChanged' },
    channel: 'comms',
    payload: {
      from: 'The Doss Archive',
      ttl: 8,
      text: 'A laminated card, hand-delivered by a courier who declined the tip: BORROWER: YOU. ITEMS: ALL OF IT. DUE: WHEN YOU ARE. THE ARCHIVE DOES NOT RECALL ITS LOANS. IT REMEMBERS THEM. Stamped with Prof. Halev Doss\'s own seal, in duplicate — the second copy is already filed in the archive, under your name.',
    },
    followup: 'real gate: doss_vesta_shift_end_cache + doss_veil_resonance_obelisk + doss_lung_of_charon_case (dossArchiveComplete, src/data/dossArchive.js); mail.js row keyed to the flags + real inventory card item + shipScreen dressing; codex Figures line for Doss',
    dormant: true,
    dormantReason: "Fires on the first stationContact counter tick anywhere; the three Doss archive flags it should gate on are never consulted.",
  },

  // SP1-014 — The Wrecking Permit: one cheap forgery flips scavenger first contact.
  // Hone: the flag is read ONLY in a new numbered encounter file — never open the
  // dirty missions.js.
  {
    id: 'SP1-014',
    kind: 'easter-egg',
    title: 'The Wrecking Permit',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'station_reach', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A booth at the Reach dock sells laminated salvage licenses under a hand-painted sign: MAKES YOU LEGAL-SHAPED. The forgeries are obvious — the laminate is already warping — and every scavenger pack on the band will hail you "Permit holder" and stand down anyway. Concord patrols will read it, pause, and add one line item.',
    },
    followup: 'dock offer authored in a NEW numbered encounter file (never open dirty missions.js): cheap purchase writes flag wrecking_permit; scavenger first-contact reads it and stands down with "Permit holder" respect; Concord scan appends one fine line item',
  },

  // SP2-115 — The Concord's Lost Flag: the first hull, folded around the old flag.
  {
    id: 'SP2-115',
    kind: 'easter-egg',
    title: 'The Concord\'s Lost Flag',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_towed_moonlet', wu: 220 },
    channel: 'memory',
    payload: {
      text: 'An old pennant, space-hardened, still stitched, wrapped around a shard of patrol hull. The stitching is the old flag — pre-charter, pre-REF 44-C, back when the Concord was a tow cooperative that answered maydays. The registry lists the shard as PATROL HULL 1 (FIRST). It has been out here since before anyone was looking for it.',
    },
    followup: 'dock choice: donate for Concord standing +6 and the codex page "The First Tow", or keep it as a hull-note trinket Concord clerks notice with quiet respect or quiet anger, per clerk (flag read at dock)',
  },

  // SP2-024 — The Cipher Plate: three seized-plate scans spell a frequency, and the
  // impound rack confesses to the pylon.
  {
    id: 'SP2-024',
    kind: 'easter-egg',
    title: 'The Cipher Plate',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'comms',
    payload: {
      from: 'The impound rack',
      ttl: 8,
      text: 'Third plate scanned, and the inscriptions stop being graffiti: together they spell a frequency. Tune it and the welded rack of seized goods reads its own manifest aloud, all the way down to the last line — "ONE (1) CONCORD PYLON, TAKEN, NOT ADMITTED, NOT RETURNED, NOT SORRY."',
    },
    followup: 'three-plate scan counter in flags (one visit, any order) + hail-within-10s branch pays Reach rep +3; impound-shelf rack POI row at the Bazaar + codex overlay',
  },

  // SP1-177 — The Loader's Fumble: low-grav drops the crate, the dock takes a bow.
  {
    id: 'SP1-177',
    kind: 'easter-egg',
    title: 'The Loader\'s Fumble',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.12 },
    channel: 'spectacle',
    payload: {
      from: 'The dock line',
      text: 'The loader exoskeletons hand your cargo down the dock line, and one of them fumbles: the crate pinwheels in low-grav, three loaders dive, and it lands — either cracked open, with a handwritten apology taped to the survivors, or caught one meter off the deck by a claw that will never admit how close it came. The lead loader takes a bow either way. The band applauds like it saw.',
    },
    followup: 'dock ambient vignette (vignetteInterpreter, 902-scene precedent); cracked variant drops one free unit + readable apology-note item; caught variant gets band applause rows',
  },

  // SP2-134 — The Eunomia Buoy Chain: six buoys, one sentence, one life\'s work.
  {
    id: 'SP2-134',
    kind: 'easter-egg',
    title: 'The Eunomia Buoy Chain',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Gulf band',
      text: 'The sixth scan links them: six uncharted nav buoys, each holding one word. The sentence reads IF FOUND ALONE I AM NOT ALONE COUNT AGAIN. Someone strung a sentence across the gulf, maintains it, and still buys the bulbs. The scan log files it as a scale test. The scan log is wrong.',
    },
    followup: 'six-scan counter in flags + credits cache POI at the unlit seventh buoy, 100 WU past poi_eunomia_lamp_row + codex page "The Counting Buoys"',
  },

  // SP2-028 — The Half-Second Station: the Watcher\'s beacon publishes the tithe roll
  // for half a second, once, ending on PENDING.
  {
    id: 'SP2-028',
    kind: 'easter-egg',
    title: 'The Half-Second Station',
    sectors: ['sector_triton_wake'],
    trigger: { type: 'receipt', event: 'cargo:jettisoned' },
    channel: 'comms',
    payload: {
      from: 'The Tide-Locked Watcher',
      ttl: 1,
      text: 'You left the offering on the rim. For exactly half a second — the same half-second as the Elroy third tag — the Watcher\'s beacon transmits a full page: hull names and dates, one per line, ending on an empty line and the word PENDING. It cannot be re-read. It was not addressed to you. It was left where someone would read it.',
    },
    followup: 'rim check within 200 WU of poi_triton_watcher + 20 s passive-scan wait arms the burst (comms:popup with ttl 1, 0.5 s text window); a Data pad at station_triton\'s bar carries the same list minus the last two lines (barContacts read offer); the empty line + PENDING exists only in the half-second version',
  },

  // SP1-156 — The Dust Script: wakes hold in the calm fog, and someone writes there.
  // Hone: one ephemeral capped wake polyline per visit + authored daily-writer props;
  // no persistent player-authored wake store.
  {
    id: 'SP1-156',
    kind: 'easter-egg',
    title: 'The Dust Script',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_murmur_buoy', wu: 260 },
    channel: 'memory',
    payload: {
      text: 'In the calm patches of the fog, wakes do not fade — they hold for hours, and someone has been writing there. Old routes. A name. An arrow pointing at nothing, patiently, all of it in wake-script fading at the same honest rate as everything else. Yours will last exactly as long as anyone\'s. The best-known entry has been re-carved fresh every day for years, and it is signed by a pilot everyone thought died.',
    },
    followup: 'one ephemeral capped wake polyline per visit + authored daily-writer props; NO persistent player-authored wake store (honed); reading via proximity reveal; the daily writer\'s signature is its own codex thread',
  },

  // SP2-136 — The Rope Cache Under The Approach: the first crew\'s kit, welded shut
  // under the lane they made work.
  {
    id: 'SP2-136',
    kind: 'easter-egg',
    title: 'The Rope Cache Under The Approach',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_lane_pin', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'Forty WU off the Corridor Pin\'s centerline, one junk rock reads eight percent heavier than its size class. Pulled off a clean weld line, its shell opens on a pre-charter tow kit — hooks, line, and a laminated card: IF YOU FOUND THIS, THE LANE WORKED. LEAVE THE HOOKS, TAKE THE CARD. — THE FIRST CREW. The hooks stay, physical, for whoever flies past next.',
    },
    followup: 'worldOneOffs rope-cache pattern (HELIOS_ROPE_CACHE precedent) + codex page "The First Crew\'s Card"; the card grants +2% tow-assist speed permanently; the 8%-heavy junk rock is a flagged field row on the pin\'s offset, opened by a massline pull',
  },

  // SP1-160 — The Cascade: the ring\'s decay goes critical twice a year, and the band
  // calls it like a horse race.
  {
    id: 'SP1-160',
    kind: 'easter-egg',
    title: 'The Cascade',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'spectacle',
    payload: {
      from: 'Tethys Junction',
      text: 'The derelict ring\'s decay just went critical, and for the next hour the lane rains junk in slow, grinding, enormous silence — hull meeting hull meeting hull, while traffic holds at the rim and the band calls the collisions like a horse race. Nobody is hurt. Everything is memorial. When it settles, the fresh field is first-come, and the ring\'s orbit is visibly, permanently cleaner.',
    },
    followup: 'scheduled debris event in the aftermathWrecks seam + real loot physics on the fresh field; band race-commentary rows; the ring\'s orbit state persists — the same decay the game models, observed',
  },

  // SP2-139 — The Overtime Locker: the second scan, 24 hours later, opens the night
  // clerk\'s locker. Chained behind SP2-036\'s flag.
  {
    id: 'SP2-139',
    kind: 'easter-egg',
    title: 'The Overtime Locker',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'flag', requires: 'special500.SP2-036' },
    channel: 'commsLog',
    payload: {
      from: 'Overtime Berth',
      text: 'Second scan, and the locker that was "jammed — shift ends soon" clicks open. Inside: an unbroken run of night-shift logs, and one personal item — a photo of the Bay 7 grid, R3-CARRIER, taken on delivery day. The caption reads: SO THIS IS WHERE YOU ENDED UP. He knew. He always knew.',
    },
    followup: 'second locker scan gated 24 in-game hours after SP2-036\'s fired flag + flag overtime_knew; the Ashfall Kurtz-ledger addendum gains the SP2-011 Bay 7 closing line; codex page "The Night Clerk Knew."',
  },

  // SP2-147 — The Gravity Well Garden: the garden disagreed.
  {
    id: 'SP2-147',
    kind: 'easter-egg',
    title: 'The Gravity Well Garden',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'receipt', event: 'cargo:jettisoned' },
    channel: 'memory',
    payload: {
      text: 'The food you jettisoned at the drift point is gone. In its place, tethered at the exact coordinates: a fist-sized Understory cutting in a proper planter, labeled with your callsign and the date. The spore-tender who waters it once a week looks up exactly once: "You threw away a garden. The garden disagreed."',
    },
    followup: 'food-cargo check + drift-point POI near the Understory row markers + 7-day return visit grows the named garden one stage (faction_understory stage runtime); flag garden_disagreed; Understory standing +3',
  },

  // SP2-036 — The Overtime Log: the derelict\'s log carries one extra line at night.
  {
    id: 'SP2-036',
    kind: 'easter-egg',
    title: 'The Overtime Log',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Overtime Berth',
      text: 'The derelict\'s work log carries one extra line tonight only: SHIFT ENDED. I STAYED. THE LANE DOES NOT SUPERVISE ITSELF. By day the line is absent and the log ends two entries earlier. Nobody has ever caught the moment it appears. Somebody has been leaving it on for years.',
    },
    followup: 'scan copy keyed to the night phase of stationShiftAt (worldCalendar seam); the day read omits the line; codex Helios overlay quotes it; one Kessler mail letter: "the night clerk at the overtime pin. Good man. Never billed us."',
  },

  // SP2-149 — The Sedna Marker Cache: the pin that points at nothing finishes its
  // route 4,000 WU out, mid-entry.
  {
    id: 'SP2-149',
    kind: 'easter-egg',
    title: 'The Sedna Marker Cache',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'proximity', nearStation: 'poi_sedna_survey_etch', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'Follow the dead lane pin\'s bearing far enough and it stops pointing at nothing: a survey stake, driven into a rock, flagged with tarp and a tin cup. Sealed beside it, the original crew\'s route log, ending mid-entry — DAY 214. THE DARK DID NOT WIN. WE STOPPED FOR LUNCH. RE— The unfinished word is the cache. The lunch break is twenty seasons long.',
    },
    followup: 'bearing-follow check (4,000+ WU straight line from the dead pin) reveals the stake; POI + charted beacon row "Route 214, Terminus"; codex page "Day 214"; Sedna standing +2',
  },

  // SP2-047 — Postcard From a Dead Sector: the count is current, every reading.
  {
    id: 'SP2-047',
    kind: 'easter-egg',
    title: 'Postcard From a Dead Sector',
    sectors: [],
    trigger: { type: 'receipt', event: 'mail:delivered' },
    channel: 'comms',
    payload: {
      from: 'Ashcache post',
      ttl: 8,
      text: 'A postcard photograph of the debris floor — the dead liner, the eleven-year count. On the back, in pencil: "Still here. Still counting. The count is now 41,812." The number is current. It was current when it was written, and it will be current every time you read it, which is the part nobody explains.',
    },
    followup: 'mail.js row with a live-value token in the body (marketNews token pattern) — the count interpolates from the live Ashfall ledger at every reading; gate: first delivery 2+ in-game days after leaving Ashfall',
  },

  // SP2-150 — The Proteus Double Take Double: third crew doubled. Fourth crew: you.
  {
    id: 'SP2-150',
    kind: 'easter-egg',
    title: 'The Proteus Double Take Double',
    sectors: ['sector_proteus_well'],
    trigger: { type: 'flag', requires: 'special500.SP2-034' },
    channel: 'memory',
    payload: {
      text: 'Under the stash rack\'s shadow there is a second, smaller rack. The plaque is third crew\'s hand: FIRST CREW NAMED. SECOND CREW LEFT. THIRD CREW DOUBLED. FOURTH CREW: YOUR TURN. Inside: one decent module and a note of advice so honest it hurts to follow. The big rack got a name. The small one got a legacy.',
    },
    followup: 're-scan of poi_proteus_stash\'s shadow after SP2-034\'s admission-note flag; grants one real module + the honest-advice note; flag third_crew_doubled; the rack gains one cosmetic shelf per era of lore uncovered (capped)',
  },

  // SP1-173 — The Hours: the Collective stamps your number. It is lower than you\'d
  // guess. Everyone\'s is.
  {
    id: 'SP1-173',
    kind: 'easter-egg',
    title: 'The Hours',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'comms',
    payload: {
      from: 'Ceres tally office',
      ttl: 7,
      text: 'The Collective\'s tally office converts your logged hours into credit hours — one per hour worked, never spendable, always counted — and stamps your ledger with the number. It is lower than you\'d guess. Everyone\'s is. "That\'s the point," says the clerk, who has done this ten thousand times and believes it every time.',
    },
    followup: 'labor-hours counter in story.flags (20+ h gate); the stamped number persists and Collective NPCs reference it with respect proportional to its size (bark rows)',
  },

  // SP1-061 — The Ore Hound: twenty years past warranty, still hunting, waiting to
  // be kept.
  {
    id: 'SP1-061',
    kind: 'easter-egg',
    title: 'The Ore Hound',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_driller', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'A quadruped assay drone, twenty years past its warranty, still hunts the old rig\'s shadow — pointing rigidly at the nearest ore body every few minutes, like a bird dog waiting for a handler who retired. It follows anyone who scans it. It cannot be repaired. It does not need to be. It needs keeping.',
    },
    followup: 'numbered ambient encounter; adopting writes the companion flag — it parks on the hull and points at one hidden ore body per sector day (daily seeded pick from real ore positions, bounded and deterministic); codex entry',
  },

  // SP2-151 — The Haumea Tool Ledger: the rift keeps score, and you would be the
  // first return.
  {
    id: 'SP2-151',
    kind: 'easter-egg',
    title: 'The Haumea Tool Ledger',
    sectors: ['sector_haumea_rift'],
    trigger: { type: 'proximity', nearStation: 'poi_haumea_fissure', wu: 220 },
    channel: 'memory',
    payload: {
      text: 'The extraction mast sits on the seam with its lanyard snapped, the loose wrench still ropeable from a careful hull. Any mining-station claim office will file its return in the physical ledger: 0 TOOLS RETURNED. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE. Eleven entries in that ledger. You would be the first return.',
    },
    followup: 'ropeable tool item + claim-office return interaction at station_haumea_rift; flag tool_returned; future claim approvals skip one procedural step ("they return tools"); Haumea standing +3',
  },

  // SP2-056 — Letters For The Dead Crew: the benefits desk was never told.
  {
    id: 'SP2-056',
    kind: 'easter-egg',
    title: 'Letters For The Dead Crew',
    sectors: [],
    trigger: { type: 'simWindow', startS: 3600, endS: 480000 },
    channel: 'comms',
    payload: {
      from: 'CONCORD BENEFITS DESK',
      ttl: 9,
      text: 'A letter addressed to your hull\'s dead crew, not to you: "TO: CREW, TESSERA / RE: THE SEVENTH RUN / We are still holding your deposits. They have matured. Come collect. Bring registration." The desk is not being cruel. The desk has never once been told.',
    },
    followup: 'reply-option glue: answering with your own registration instead of the crew\'s closes the account — ACCOUNT CLOSED BY SUCCESSOR. DEPOSITS FORFEITED TO THE COUNT. FLY HER WELL. — small credits payout, big lore; ties the SP2-007/SP2-001 Tessera thread',
  },

  // SP2-153 — The Triton Tithe Audit: on the fourth visit, the rim has curated your
  // offerings. Chained behind SP2-028\'s first offering.
  {
    id: 'SP2-153',
    kind: 'easter-egg',
    title: 'The Triton Tithe Audit',
    sectors: ['sector_triton_wake'],
    trigger: { type: 'flag', requires: 'special500.SP2-028' },
    channel: 'spectacle',
    payload: {
      from: 'The rim',
      text: 'On the fourth visit the rim has been curated: your three offerings stand in a neat row, squared to the dark, under a fresh tally plate — 3 FOR 3. NOBODY EVER TAKES. YOU KEPT GIVING ANYWAY. THE RIM NOTICES. It is signed with a single glyph. The glyph is the Watcher\'s own.',
    },
    followup: 'rim jettison counter across 3+ separate visits (counted at poi_triton_watcher); arrangement dressing state; flag tithe_notices; one guaranteed rare commodity find at the rim thereafter; codex page "The Rim Notices."',
  },

  // SP1-179 — The Busker: two of the songs are good. The canister is the set list.
  {
    id: 'SP1-179',
    kind: 'easter-egg',
    title: 'The Busker',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.08 },
    channel: 'commsLog',
    payload: {
      from: 'Dock mouth',
      text: 'A refit drone with a speaker bolted to its frame is playing at the dock mouth — old station songs, two of them good — with a cargo net for tips. Dockhands toss rivets. In the net, displayed, sits a full canister somebody tossed thirty years ago, with a small sign: SOMETIMES.',
    },
    followup: 'dock vignette with a jettison-tip interaction; the third tip writes a flag and the drone learns your hull\'s name, playing it at every dock thereafter; three-drone seeded rotation; songs via audioRecipes (src/data/audioRecipes.js)',
  },

  // SP2-155 — The Orcus Tide Ledger: cycle 4,110, count correct as of cycle 4,110.
  {
    id: 'SP2-155',
    kind: 'easter-egg',
    title: 'The Orcus Tide Ledger',
    sectors: ['sector_orcus_shadow'],
    trigger: { type: 'proximity', nearStation: 'poi_orcus_plinth', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'Watch the transponder gate through one full tide cycle and you will see what the sector pretends not to know: a mechanical odometer, sun-bleached, reading CYCLE 4,110. COUNT CORRECT AS OF CYCLE 4,110. Someone winds it. Nobody has ever been seen winding it. The windmill-shaped component is the dark\'s best-kept secret and its least-kept secret, simultaneously.',
    },
    followup: 'full-cycle hold timer at the gate + odometer dressing state; flag tide_wound; every later reading ends in the last digit of the player\'s hull number (deterministic whimsy); codex page "Cycle 4,110."',
  },

  // SP2-081 — The Pilgrim\'s Meal Ticket: everyone\'s road is the road.
  {
    id: 'SP2-081',
    kind: 'easter-egg',
    title: 'The Pilgrim\'s Meal Ticket',
    sectors: [],
    trigger: { type: 'receipt', event: 'claim:convoyDocked' },
    channel: 'comms',
    payload: {
      from: 'Pilgrim table',
      ttl: 7,
      text: 'One of the pilgrims you convoyed in quietly orders a second meal and has it sealed to go. Asked why: "For the road. Not mine — yours. Everyone\'s road is the road." The sealed meal rides in your hold as one unit of provisions under a handwritten seal that says, accurately, EAT WHEN IT MATTERS.',
    },
    followup: 'provisions unit with custom provenance (flag pilgrim_meal); consuming it ticks crew morale and grants a one-time 5% repair discount at the next Choir berth (service-pricing seam reads the flag)',
  },

  // SP1-184 — The Squatter: the stranger in your berth, and the gift chosen with
  // alarming precision. Hone: keyed to the most-docked station; no berth-number
  // identity exists to squat.
  {
    id: 'SP1-184',
    kind: 'easter-egg',
    title: 'The Squatter',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'comms',
    payload: {
      from: 'Your berth, temporarily',
      ttl: 8,
      text: 'Your berth has a stranger in it. They are apologetic to the point of ceremony: your fee for the night is already paid, there is a note — "they said someone loves this berth; it looked like just a berth; I\'m sorry" — and a small gift chosen with alarming precision from your known tastes. That precision is why you will end up knowing their name.',
    },
    followup: 'keyed to the most-docked station (honed — no berth-number identity exists); gift precision reads the player\'s deed history; the stranger becomes a named contact; the berth war recurs once a season, and the third time they leave it to you, permanently, with a formal note',
  },

  // SP3-145 — The Jukebox Ghost: Pale Holiday, one play per sitting, no recipe
  // matches, nobody loaded that.
  {
    id: 'SP3-145',
    kind: 'easter-egg',
    title: 'The Jukebox Ghost',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 33, windowS: [240, 300] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'The bar',
      text: 'The Pale Holiday mix cuts mid-song and something else plays instead: a slow, wrong-temperature melody that no recipe in the catalog matches, ending on the jukebox\'s mechanical reset clunk. The room listens all the way through. Nobody dances to it. The barkeep: "Nobody loaded that."',
    },
    followup: 'one authored detuned, off-scale recipe — the game\'s one unexplained audio artifact — gated inside the festival window + barkeep barContact line + codex entry',
  },

  // SP1-187 — The Statistician: your actual statistics, slightly wrong in the
  // direction of a better story, corrected live by people who were there.
  {
    id: 'SP1-187',
    kind: 'easter-egg',
    title: 'The Statistician',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'The rememberer',
      text: 'A professional rememberer — that is the job title — is performing your legend to the bar: "Fifty-one rescues! Give or take; who counts?" The numbers are your actual statistics, slightly wrong in the direction of a better story, and corrected live by hecklers who were THERE for three of them. The corrections win. The legend is better for it.',
    },
    followup: 'deedRecord stats (50+ deeds gate) rendered as folk numbers; heckler correction rows persist and improve the pool for every player; after the show the rememberer buys you a drink and asks for yours',
    dormant: true,
    dormantReason: "Prints a hardcoded Fifty-one rescues on the first dock; the 50-deed gate has no reader.",
  },

  // SP1-083 — The Reef Light: there is no reef. There is something.
  {
    id: 'SP1-083',
    kind: 'easter-egg',
    title: 'The Reef Light',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_pylon_field', wu: 220 },
    channel: 'commsLog',
    payload: {
      from: 'Expanse band',
      text: 'On the cut corner past the Lattice, a dead survey ship\'s beacon still rotates on the exact period it held in life — and traffic still obeys it. Every hull that cuts the corner goes wide, silently, first. Locals will not say what it warns off. There is no reef. There is something.',
    },
    followup: 'Reef Light beacon POI row on the ambush lane + seeded hazard roll (cutting the corner is survivable N-1 times out of N; the one exception is never explained on any band) + codex entry',
  },

  // SP1-121 — The Frozen Watch: the requisition was approved.
  {
    id: 'SP1-121',
    kind: 'easter-egg',
    title: 'The Frozen Watch',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_far_sounding', wu: 220 },
    channel: 'memory',
    payload: {
      text: 'A military hull, powered, intact, four degrees above vacuum. Her bridge crew is still at stations, frozen mid-shift, watches still on wrists, coffee still in the cup. Nothing killed them. Something turned the heat off and left. The log\'s last entry is a routine requisition. The requisition was approved.',
    },
    followup: 'interior-read scan sequence (numbered ambient encounter); delivering the crew\'s effects to their faction\'s office opens one quiet dialogue that never mentions it again; the soberest codex page in the game',
  },

  // SP2-174 — The Burn Claim Pin\'s Flame: the burn gets fed, and the statistics
  // are accurate.
  {
    id: 'SP2-174',
    kind: 'easter-egg',
    title: 'The Burn Claim Pin\'s Flame',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'cargo:jettisoned' },
    channel: 'commsLog',
    payload: {
      from: 'Io Reach band',
      text: 'The fuel cells catch mid-drift — the claim pin\'s pilot flame takes them — and for the rest of the day the burn burns one color hotter. The band explains in eleven separate voices: "The burn gets fed." "The burn gets fed." "Nobody who feeds the burn has ever died on this rock." The statistics, checked later, are accurate.',
    },
    followup: 'fuel-cell jettison within 100 WU of poi_io_burn_stake ignites the offering; flag burn_fed; real fuel-efficiency buff inside the claim\'s gravity well for the day; codex page "Feed The Burn."',
  },

  // SP3-091 — The Welding Constellation: the drones are following the weld schedule.
  // Both things are true.
  {
    id: 'SP3-091',
    kind: 'easter-egg',
    title: 'The Welding Constellation',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_colony', wu: 220 },
    channel: 'spectacle',
    payload: {
      from: 'The night frame',
      text: 'At night watch, the lone construction frame off the colony welds, and its drones flash in a pattern that — from this one bearing, and only this one — reads as the dots of a constellation. On inspection, the drones are just following the frame\'s weld schedule. The frame\'s plate calls it "the sky we came from." Both things are true.',
    },
    followup: 'third-watch-only visibility + marked bearing data row; drone flash timings hashed to the constellation pattern (pure data, everyday-kit frame); codex entry',
  },

  // SP3-199 — The 500th Rock: a survey mark, the Tally, one person\'s decade
  // project. Hone: attributed in-world; the meta voice becomes a story.
  {
    id: 'SP3-199',
    kind: 'easter-egg',
    title: 'The 500th Rock',
    sectors: [],
    trigger: { type: 'receipt', event: 'mining:yield' },
    channel: 'commsLog',
    payload: {
      from: 'The Tally',
      text: 'One rock in the field carries a small painted 500 and forty tally strokes underneath, and when the beam bites it rings — a clean note, lower than the rock has any right to be. The paint is a survey mark: THE TALLY, one person\'s decade project, one rock per field, each strike a note of a scale the belt was left tuned to. Somebody spent ten years painting an instrument, and then stopped counting at five hundred.',
    },
    followup: 'seeded painted-rock flag per sector field (scatter-salt idiom, src/data/opticStructures.js) + strike pitch from sector index; ten marked rocks found completes the codex page on the Tally and the person who painted it',
  },

  // SP2-135 — The Dione Customs Coin: legal nowhere, valid everywhere. Hone: the
  // coin waives the authored Dione dispute once; no generic lien system exists.
  {
    id: 'SP2-135',
    kind: 'easter-egg',
    title: 'The Dione Customs Coin',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'comms',
    payload: {
      from: 'Dione Customs',
      ttl: 8,
      text: 'Both liens paid, honest, and the stamp comes down on a single physical coin: ONE (1) HULL SETTLED TWO (2) LIENS. THIS COIN IS LEGAL NOWHERE AND VALID EVERYWHERE. It is real, it is in your hand, and customs watched you earn it — which is the only reason it works.',
    },
    followup: 'honed scope: the coin waives the authored dione_customs container dispute once (no generic lien system exists); presenting it retires the coin — drilled and nailed to the customs hall wall with your callsign; codex page "The Coin"; customs standing +4',
  },

  // SP2-146 — The Quiet\'s Fog Rack: uncertified airframes, and one chalk line that
  // is fresh.
  {
    id: 'SP2-146',
    kind: 'easter-egg',
    title: 'The Quiet\'s Fog Rack',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_harvest_deep', wu: 240 },
    channel: 'memory',
    payload: {
      text: 'Deep in the fog, where nothing pings, a rack of stored hulls: unmarked, uncertified, airframes the ledger never admitted existed. The Quiet\'s own. One berth is empty, with a chalk line on the deck where a hull should be, and the chalk line is fresh. Someone is out flying it right now, on no manifest, in your weather.',
    },
    followup: 'straight-line 60 s no-ping occlusion gate reveals the rack POI; flag quiet_fog_rack; codex page "The Ledger\'s Blind Spot"; one-time loan of the chalk-line berth\'s twin offered at the Sker fence',
  },

  // SP2-172 — The Tether Memorial\'s New Line: the wall hears the maydays.
  {
    id: 'SP2-172',
    kind: 'easter-egg',
    title: 'The Tether Memorial\'s New Line',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'hull:fractured' },
    channel: 'commsLog',
    payload: {
      from: 'Expanse bar regular',
      text: 'The memorial\'s tether wall has a new line: your near-death date and hull, stenciled by no visible hand, in the same paint as everyone else\'s. A regular at the bar does not look up: "The wall hears the maydays. If you lived through one, it knows. That is all the memorial has ever done: know."',
    },
    followup: 'below-10%-integrity check on the hull:fractured record adds the line to the memorial dressing; flag wall_knows; the memorial becomes a permanent map landmark; one hunter buys the player a drink for "being on the wall the fun way"',
  },

  // SP2-179 — The Pilgrim Mooring\'s Guest Book: between.
  {
    id: 'SP2-179',
    kind: 'easter-egg',
    title: 'The Pilgrim Mooring\'s Guest Book',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_pilgrim_moor', wu: 180 },
    channel: 'memory',
    payload: {
      text: 'The mooring\'s guest book updates in handwriting, and the most recent entry is always half-finished, because every pilgrim moors mid-thought. Yours appears as you settle: your callsign, ARRIVED — and waits, cursor blinking, until you actually leave. Then it finishes itself: ARRIVED. DEPARTED. BETWEEN: EVERYTHING.',
    },
    followup: '60 s hold at low speed opens the book; text state machine flips the entry on departure; flag mooring_between; codex page "Between"; Helios standing +2',
  },

  // SP1-006 — The Gang Wire: pack scores, hot lanes, and a weather report for
  // ambushes. Hone: the hot-lanes readout is generated from the seeded encounter
  // tables — one source of truth, never a parallel schedule.
  {
    id: 'SP1-006',
    kind: 'easter-egg',
    title: 'The Gang Wire',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_bounty', wu: 220 },
    channel: 'commsLog',
    payload: {
      from: 'Pirate band',
      text: 'A jury-rigged mast on a relay rock plays a scratchy station for anyone close enough to matter: pack heraldry read out like sports scores, which toll lanes are hot this week, and a weather report for ambushes — "cloudy with a chance of you." The hot-lanes list is real. That is the alarming part.',
    },
    followup: 'numbered ambient encounter (script selfRegistered, noCombat) + codex page on Reach pack culture; hot-lanes readout generated from the seeded encounter tables themselves — one source of truth, never a parallel hand-authored schedule (honed)',
  },

  // SP2-171 — The Reader\'s Stake Bookmark: AR-3 files your work as its own
  // recommendations. Real gate: quill_copied >= 2.
  {
    id: 'SP2-171',
    kind: 'easter-egg',
    title: 'The Reader\'s Stake Bookmark',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'flag', requires: 'quill_copied', min: 2 },
    channel: 'memory',
    payload: {
      text: 'The Reader\'s Stake has gained a bookmark: a physical ribbon tied by AR-3\'s grip, marking the one page of its open log that names every sealed thing you have ever unsealed, with dates. The knot is the Archive\'s index knot. AR-3 has been filing your work as its own recommendations, and the recommendations are good.',
    },
    followup: 'real gate: quill_copied counter flag >= 2 (src/data/quill.js copiedFlag) + player in sector; ribbon dressing at poi_charon_reader_stake; Archive standing +4; codex page "The Recommendations."',
  },

  // SP2-085 — The Two-Credit Truth: rest, then sell. The rock is not going anywhere;
  // that is its whole personality.
  {
    id: 'SP2-085',
    kind: 'easter-egg',
    title: 'The Two-Credit Truth',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'comms',
    payload: {
      from: 'Old rockhand',
      ttl: 7,
      text: 'You sold the scale three tired loads in a row, and an old rockhand buys the next drink for exactly two credits: "You are selling tired. The scale can hear it in the tonnage. Rest, then sell. The rock is not going anywhere; that is its whole personality." The advice is correct. It is also, mechanically, correct, which at this bar counts as a miracle.',
    },
    followup: 'three-losses-in-a-row sale counter at the Belt Outpost scale keys the barContacts dialogue; flag two_credit_truth; the next above-band sale yields +2% one-time; codex page "Two-Credit Truth."',
  },

  // SP3-107 — The Bargain Light: the market\'s oldest sign, hidden where only
  // neighbors would look.
  {
    id: 'SP3-107',
    kind: 'easter-egg',
    title: 'The Bargain Light',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'calendar', dayOfYear: 13, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Smuggler Den',
      text: 'One small green lamp on the Den\'s vent spine, shadow side, lit only today — Ring Fair — blinking a patient pattern. Decoded, it is the market\'s oldest sign: current best margin routes, hidden where only neighbors would look. The neighbors all know it. The neighbors all pretend the lamp is a lamp.',
    },
    followup: 'lamp prop channel on the Den\'s vent spine, Ring-Fair-only; the blink pattern is authored data and decodes (codex) to a real map hint',
  },

  // SP2-178 — The Lost Freight\'s Address: the loop is administrative and eternal,
  // and today it has your name in it.
  {
    id: 'SP2-178',
    kind: 'easter-egg',
    title: 'The Lost Freight\'s Address',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'Lost-property board',
      text: 'The freight on the lost apron carries a label that matches a tag on the board: CONTENTS: ONE (1) ENGINE, WAITING SINCE BEFORE YOU ARRIVED. OWNER NOTIFIED 41 TIMES. OWNER IS THE WAITING PROBLEM. The freight is waiting for itself. The board is waiting for the freight. The loop is administrative and eternal, and today it has your name in it, as courier.',
    },
    followup: 'cross-reference gate: poi_helios_lost_freight scanned, then any Helios dock\'s lost-property board shows the tag; carrying the tag (a mail attachment) to the freight ships both halves — flag + codex page "The Waiting Problem."',
  },

  // SP2-041 — The Previous Tenant\'s Mail: the cushion was load-bearing socially.
  {
    id: 'SP2-041',
    kind: 'easter-egg',
    title: 'The Previous Tenant\'s Mail',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:purchased' },
    channel: 'comms',
    payload: {
      from: 'Station mailroom',
      ttl: 7,
      text: 'One letter arrives addressed to the previous operator of your new hull: "RE: THE SEAT CUSHION YOU TOOK. WE NOTICED. WE HAVE NOT FORGIVEN. THE CUSHION WAS LOAD-BEARING SOCIALLY." No return address. The grief is specific. The cushion, you suspect, is gone.',
    },
    followup: 'fires once, on the second hull onward; mail.js cast row + the letter\'s author becomes a bar regular via the canonical barContacts contact pattern',
  },

  // SP2-053 — The Third Stool\'s Letter: not sentiment. Inventory.
  {
    id: 'SP2-053',
    kind: 'easter-egg',
    title: 'The Third Stool\'s Letter',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', nth: 10 },
    channel: 'comms',
    payload: {
      from: 'Quinn',
      ttl: 8,
      text: 'A typed letter, signed by hand: "FROM: QUINN / RE: YOUR STOOL / The third stool has been reupholstered. The old cover is in the lost-property column under evidence. Nobody asked for it back. You are the only person who sat there and left the seat warm instead of the tab long. This is not sentiment. It is inventory."',
    },
    followup: 'same-station dock counter (10+) at Quinn\'s bar; bar greeting changes permanently ("Your stool. Same one."); +1 bar-contact mission payouts at that station for the rest of the game',
  },

  // SP2-077 — The Dog Watch Knot: eleven months, one knot, and the room listens.
  {
    id: 'SP2-077',
    kind: 'easter-egg',
    title: 'The Dog Watch Knot',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    payload: {
      text: 'During the dog watch, off-duty patrol pilots run a standing puzzle on the rail table: a physical massline knot nobody has undone in eleven months. The rules are one sentence — no tools, one hand, and if you are the guest, no hands but yours. The room does not watch you try. The room listens.',
    },
    followup: 'dog-watch phase check + radial-sequence solve interaction (commsRadial offer pattern, src/ui/commsRadial.js); flag knot_undone pays free drinks at Coalition bars permanently and Concord rep +2 ("patience under watch")',
  },

  // SP3-117 — The Paper Plane: nothing glides in vacuum. Hone: ballistics — a folded
  // plate thrown on a computed arc, burning in the heat wash; the thrower is the
  // mystery.
  {
    id: 'SP3-117',
    kind: 'easter-egg',
    title: 'The Paper Plane',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 21, windowS: [420, 440] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Helios apron',
      text: 'The pod bay ejects something tiny: a folded hull plate with a lamp on it, thrown on a computed arc that carries it across the apron\'s light, gaining speed, burning to a brief silver flash in the heat wash. Nothing glides in vacuum. Somebody threw it on purpose. The wire never mentions it, and the thrower has never once missed the window.',
    },
    followup: 'ballistic prop on a computed arc + one explosionBreach cue light at burnout, all pooled; witness-gated codex entry (two lines: "who folds these?")',
  },

  // SP3-138 — The Hum at Sker: hold still in the loudest sector and the machinery
  // composes.
  {
    id: 'SP3-138',
    kind: 'easter-egg',
    title: 'The Hum at Sker',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'station_sker', wu: 80 },
    channel: 'spectacle',
    payload: {
      from: 'Sker Haven',
      text: 'A hum you half-noticed all over the Haven resolves, at exactly this bearing and only if you hold still, into a slow melody: the yard\'s cranes, pumps and welders are all in tune, and from here they compose. Move, and it degrades back into machinery. It was always the same machinery. You are what changed.',
    },
    followup: 'stillness gate (thrust under 5% inside the 80 WU zone for 30 s) ducks all other audio and unmutes a chord mix of existing ambient recipes — pure audio-bus work; codex entry: a listening place in the loudest sector',
  },
];
