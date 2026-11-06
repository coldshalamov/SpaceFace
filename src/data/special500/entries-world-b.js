// src/data/special500/entries-world-b.js — batch cat-world-b (31 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-world-b.json). World one-offs:
// places, fixtures, resident characters, persistent world facts.
//
// Trigger/channel mapping follows AUTHORING_BRIEF.md. Receipt triggers name
// bus events verified against src/systems emitters: dock:docked (world.js /
// input.js), combat:kill (world.js), gate:verdict
// (gateControlDirector.js:143 — carries sectorId, so a sector-scoped receipt
// reads as "came back through this sector's gate"), choir:crystalShattered
// (faction_choir.js:548), race:ended (missions.js:5691),
// signal:surveyFiled (v2FlavorRuntime.js:318), wreckEcology:scavenged
// (aftermathWrecks.js:1456). Chained flag: special500.SP2-157 requires the
// live SP2-079 chair-promise flag — the consensus named SP2-016 for the
// bell-word roll call, but SP2-016 is NOT among the ratified 500 (dangling
// cross-reference), so the chain keys to SP2-079, the entry SP2-157's payoff
// explicitly completes. Every sector, station and poi id is real
// (src/data/sectors.js, src/data/frontierRegions/*.js).
//
// NO SECTOR REMAPS. sector_phoebe_echo is now a real frontier sector
// (src/data/frontierRegions/north.js:378) and sector_pallas_drift is core
// (src/data/sectors.js:734), so the wave-1 remap precedents (Phoebe Echo ->
// sector_io_reach) are obsolete for this batch — every consensus sector id
// is used verbatim.
//
// Channel choice: a line addressed to the player -> comms; a visual or audio
// noticing line whose renderer/audio leg is a later batch keyed on this
// entry's memory receipt -> spectacle; a genuinely interactive fixture
// (vendor, purchase, cache, physics prop, joinable work) -> memory +
// followup naming the bespoke mechanic. No mail.
//
// Canon/hone notes applied per entry's own hones directive:
//   SP2-157  "Drift Choir" name dropped — one Choir; "the line's last pod."
//   SP1-186  purchasable plaque + one dock greeting + fee; the dock-layout
//            claim is dropped (dock layout is static UI).
//   SP3-095  consensus title already carries the rename to "The Last Anvil"
//            (the Anvil is Tethys's named planet); nine seconds stays in the
//            text, out of the title.
//   SP3-077  renderer cap: 12 visible tailings layers with oldest-layer fade
//            (unbounded growth fails the perf law) — prose hints the fade,
//            the cap lives in the follow-up leg.
//   SP3-110  "festival days" maps to the world calendar's festival list
//            (src/data/worldCalendar.js FESTIVALS); Ring Fair (dayOfYear 13,
//            the open-market fair) is the day the tent city is up, window
//            spans the whole 600 s day, recurring per year.
//   SP1-176  the Archive is canon (src/data/codexPages.js); the sector's only
//            registered log relay, poi_tethys_customs_log, stands in as the
//            Archive's relay anchor.
//   SP1-198  "first re-entry after 20+ sector-days away" maps to receipt
//            gate:verdict scoped to the starter sector (the verified causal
//            event for coming back through the gate); the 20-day absence
//            gate is the bespoke leg's business, not the director's.

export const ENTRIES_WORLD_B = [
  // SP1-040 — The Tally Board: the derelict field's working scores, in chalk
  // that does not wash off. First sector entry is the tell; the board is the
  // bespoke prop.
  {
    id: 'SP1-040',
    kind: 'world-oneoff',
    title: 'The Tally Board',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Persistent fixture prop bolted to the derelict field\'s biggest rock (authoredPlaces zone pattern): chalk state in story.flags, one line per deed (stripped, caught the keel, owes the yard), the player\'s line added on first deed in the field; NPC scavenger ambient barks quote the board\'s current standings (encounterScripts ambient pool); codex page "The Field Scores."',
    payload: {
      text: 'The biggest rock in the field carries a bolted hull plate, chalked with the field\'s working scores — who stripped what, who caught the keel, who owes the yard. Your hull is on it now, under TODAY, and the chalk does not wash off. The scavengers quote it like weather.',
    },
  },

  // SP2-083 — The Vael Clause Reader: the Eunomia rail's contract-language
  // reader. The Vael-cargo hold gate is the bespoke leg.
  {
    id: 'SP2-083',
    kind: 'world-oneoff',
    title: 'The Vael Clause Reader',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'barContacts service contact at station_eunomia gated to a Vael-origin lot in hold at dock: flat-fee read sets flag vael_clause_heard, Vael standing +1 (correct recitation is courtesy), and unlocks a codex page — the Vael contract-language primer.',
    payload: {
      text: 'At the Eunomia rail works a contract-language reader: flat fee, and she reads any Vael-billied cargo\'s clauses aloud and translates. Most are freight terms. One clause rides every Vael bill — numbered 44-C, by pure coincidence, she insists — and it reads: "The bearer is a clause. All clauses survive their bearers."',
    },
  },

  // SP2-157 — The Eris Last Pod: the tether finally frays. Chained behind
  // SP2-079 (the chair promise) because consensus' SP2-016 was never
  // ratified; the clean-cut-versus-hard-yank outcome is the bespoke leg.
  {
    id: 'SP2-157',
    kind: 'world-oneoff',
    title: 'The Eris Last Pod',
    sectors: ['sector_eris_margin'],
    trigger: { type: 'flag', requires: 'special500.SP2-079' },
    channel: 'memory',
    followup: 'Ropeable pod keyed to flag special500.SP2-079 (the chair story live) plus three visits under the line\'s roll-call bell: a clean cut (massline, low impulse) claims the SP2-079 chair; a hard yank wakes the line — every pod swings once — and the bar goes silent to the player for a sector week (masslineImpactDamage read, bar standing flag).',
    payload: {
      text: 'The line\'s last pod at Eris is finally, visibly fraying, and the bar knows. The barkeep does not look up: "The line has held longer than the writs that ignore it. When it goes, it goes quiet. You want the chair? Cut it clean. Cut it slow."',
    },
  },

  // SP1-186 — The View: six view berths, one honest fine print. Purchase,
  // plaque and greeting are the bespoke leg; no dock-layout change (hone).
  {
    id: 'SP1-186',
    kind: 'world-oneoff',
    title: 'The View',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Dock-side purchase at station_helios (gate: 30+ lifetime docks, story.flags count): fee buys a plaque line on the view-berth board plus one personalized dock greeting; the plaque is read aloud once a year at the Ring Fair bell; berth flag persists. Dock layout is static UI and is not touched (hone A H-17).',
    payload: {
      text: 'The station auctions six "view berths" — the docks facing open star — price and waiting list posted, and the fine print is honest: "The view is the same star. The star does not care. This berth is about what you look at while you drink." One holder bought his fifty years ago and has never once docked anywhere else.',
    },
  },

  // SP2-093 — The Requiem For A Tool: the foundry buries a cutter with full
  // honors after the Choir's shatter takes a tooth. Keyed to the verified
  // shatter receipt (faction_choir.js:548).
  {
    id: 'SP2-093',
    kind: 'world-oneoff',
    title: 'The Requiem For A Tool',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'choir:crystalShattered' },
    channel: 'memory',
    followup: 'Bar event at station_forge when a choir:crystalShattered receipt lands on a dock within the day: flag cutter12, DMC and Choir standing +1 each (the collision is the joke), codex page "Cutter 12"; the retired tooth stays on the bar mantel for the rest of the save.',
    payload: {
      text: 'The foundry crews call a two-minute standdown at shift bell: a cutter finally lost a tooth to crystal shrapnel in the Choir\'s shatter, and it gets named posthumously, with full honors — "CUTTER 12: IT CUT WHAT IT WAS POINTED AT. EVERY TIME. THAT IS A LIFE." The tooth is retired to the bar mantel, between two ore samples that behaved.',
    },
  },

  // SP1-196 — The Notary: witness your deed, in legalese, for a trivial fee.
  {
    id: 'SP1-196',
    kind: 'world-oneoff',
    title: 'The Notary',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Dock comms offer, one per deed type (rescue, kill, delivery, refusal), repeatable per type: accepting stamps the next deed of that type (witnessed flag read at outcome time) and pays its rep once at double weight; the notary\'s ledger of the player\'s sealed deeds is a standing codex page — stamped, dull, wonderful.',
    payload: {
      text: 'A notary drone works the dock line in perfect legalese: "Your next deed, whatever it is, witnessed and sealed. Witnessed deeds are... different. Ask anyone who has one." The fee is trivial. Eleven thousand deeds witnessed. Thanked by none of them. Professionally.',
    },
  },

  // SP1-198 — The Homecoming Bell: the starter beacon\'s saved line, rung on
  // the first gate return. Sector-scoped gate:verdict is the verified
  // re-entry causal; the 20-day absence record is the bespoke leg.
  {
    id: 'SP1-198',
    kind: 'world-oneoff',
    title: 'The Homecoming Bell',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'comms',
    payload: {
      from: 'Tutorial Beacon',
      text: 'Your hull crosses the gate and the starter beacon rings a pattern the old-timers on the band sit up for: someone\'s come back. It is rung for hulls that left and made it, and for nobody else. Then the one extra line it saved all this time: "Throttle\'s where I taught you. Welcome home."',
      ttl: 8,
    },
  },

  // SP2-074 — The Rival's Round: a clean player win in Coldburn Rey's relief contest.
  {
    id: 'SP2-074',
    kind: 'world-oneoff',
    title: 'The Rival\'s Round',
    sectors: [],
    trigger: {
      type: 'receipt', event: 'coldburnRey:raceSettled',
      where: { winner: 'player', captainId: 'captain:coldburn-rey', sabotaged: false },
    },
    channel: 'memory',
    followup: 'Records a clean player win over Coldburn Rey in the supplied-load relief race, keyed by the canonical raceSettled receipt.',
    payload: {
      text: 'Coldburn Rey is at the rail, buying, for everyone, including you. "Cheapest lesson I ever bought. You flew the line I should have. First round is tuition." Nobody in the bar mentions the race again, which is how you know it mattered.',
    },
  },

  // SP2-088 — The Grease Menu: the slate's second column, for heat-carrying
  // hulls only.
  {
    id: 'SP2-088',
    kind: 'world-oneoff',
    title: 'The Grease Menu',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'barContacts purchase options at any blackmarket bar, gated to heat > 20 at dock: three flat-priced one-shots — registry grease (one scan comes back clean, heat -5 once), a remembered tow (one impound waived), a name spoken quietly (one fence discount) — effects ride the existing law/impound seams; codex page "The Second Column."',
    payload: {
      text: 'The barkeep\'s slate has a second column headed GREASE: small fixed-price services that legally do not exist. REGISTRY GREASE (ONE SCAN, CLEAN). TOW REMEMBERED (NO QUESTIONS). A NAME, SPOKEN QUIETLY. Each purchase is real. Each receipt is verbal.',
    },
  },

  // SP1-077 — The Bucket Line: a colony's water crisis, met with hulls.
  // The seeded crisis week (hashDaily roll pins it) opens the joinable legs.
  {
    id: 'SP1-077',
    kind: 'world-oneoff',
    title: 'The Bucket Line',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.15 },
    channel: 'memory',
    followup: 'Seeded crisis week (the hashDaily pass pins a water_crisis_week flag spanning six days): numbered repeatable tow legs up the lane — each leg a short real tow, colony rep via d.rep per leg — and a persistent tally-wall prop (authoredPlaces pattern) that lists the week\'s haulers forever after the crisis ends.',
    payload: {
      text: 'A colony\'s reclamation loop is down and the belt has improvised: a bucket line of hulls passing water tanks hand to hand up the lane, day and night, a chalk tally growing on the station wall. Nobody is making money. Everyone is counting. The band invites all traffic: "One leg is enough. Bring a tank."',
    },
  },

  // SP3-052 — The Weathered Buoy Chain: five lamps that read the season.
  // Lamp channels keyed to weatherSeasonAt are the renderer/audio leg.
  {
    id: 'SP3-052',
    kind: 'world-oneoff',
    title: 'The Weathered Buoy Chain',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Veil Nebula',
      text: 'Five derelict weather buoys strung along the storm lane\'s edge, one lamp each: amber through solar wind, violet through ion storm, dark when clear. At each season turn all five relight in sequence, like a wind gauge changing its mind. The chain is the sector\'s forecast, and you can see it from the lane.',
    },
  },

  // SP3-095 — The Last Anvil: thirty-one years at nine seconds. Anchor is
  // the freighter drift's registered derelict (poi_freighter).
  {
    id: 'SP3-095',
    kind: 'world-oneoff',
    title: 'The Last Anvil',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_freighter', wu: 800 },
    channel: 'spectacle',
    payload: {
      from: 'Vesta Forge',
      text: 'Bolted to a rock off the freighter drift: a fully manual forge — one power hammer arm, one glowing stock, a robot arm that fetches billets. The hammer falls every nine seconds with a spark crown, and the plate swears it has not stopped in thirty-one years. On a dark approach you steer by its sparks.',
    },
  },

  // SP3-100 — The Foundry Bell: one toll per shift turn, and the yard
  // answers in echo. The audio leg (toll recipe + two delayed spatial cues)
  // keys on this receipt.
  {
    id: 'SP3-100',
    kind: 'world-oneoff',
    title: 'The Foundry Bell',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_forge', wu: 1000 },
    channel: 'spectacle',
    payload: {
      from: 'Forge gantry',
      text: 'A cast bell the size of a cargo pod hangs from the forge gantry, and at each shift turn a robot arm strikes it once — a single deep note that rolls across the yard and comes back off the plates and tanks as a two-second echo from three directions. It is the station\'s heartbeat, audible from the approach.',
    },
  },

  // SP3-058 — The Sails Take the Wind: the orchard's gust profile made
  // visible. Sail articulation on ANVIL_ORCHARD_GUST_PROFILE is the
  // renderer leg; solar-wind weeks map to the seeded daily roll.
  {
    id: 'SP3-058',
    kind: 'world-oneoff',
    title: 'The Sails Take the Wind',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'Anvil Orchard',
      text: 'A gust front crosses the orchard and the farm sails take it — billow, yaw, hold — throwing moving shade across the pod rows while the pods swing on their tethers. In calm the same sails hang slack as laundry. The wind out here is invisible until something is rigged to catch it.',
    },
  },

  // SP3-062 — The Storm Riders' Shrine: ribbons for every season the lane
  // survived. Ribbon count reads the seasonal ledger in the renderer leg.
  {
    id: 'SP3-062',
    kind: 'world-oneoff',
    title: 'The Storm Riders\' Shrine',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Veil storm lane',
      text: 'On the lane-side rock stands an antenna mast tied with ribbons — one per season the lane has survived, color-coded to the season, the oldest bleached grey. In wind they all stream one way. New pilots add theirs, and a small lamp ignites on the mast. It is a place that remembers the weather.',
    },
  },

  // SP3-090 — The Clockwork Yard: sixty seconds, one peak stroke at a time.
  // simTime-mod-60 articulation keyed to this receipt is the renderer leg.
  {
    id: 'SP3-090',
    kind: 'world-oneoff',
    title: 'The Clockwork Yard',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_vesta_outlying_yard', wu: 800 },
    channel: 'spectacle',
    payload: {
      from: 'Forge Outlying Yard',
      text: 'Nothing in this yard idles. Presses, cranes and turntables all run one visible sixty-second metronome, deliberately out of phase, so that at any moment exactly one machine is at its peak stroke. Watch a full minute and you can call the next one. Nobody remembers who set the phase. Everybody keeps it.',
    },
  },

  // SP3-072 — The Measured Rock: the Gulf Survey's daily joke, kept with a
  // straight face. The Stepwell site anchors it (poi_eunomia_hulk,
  // sectorWonders eunomia_stepwell); shrink step keyed to calendar year.
  {
    id: 'SP3-072',
    kind: 'world-oneoff',
    title: 'The Measured Rock',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'proximity', nearStation: 'poi_eunomia_hulk', wu: 600 },
    channel: 'spectacle',
    payload: {
      from: 'Gulf Survey',
      text: 'A house-sized boulder beside the Stepwell, survey pins hammered every ten WU along one seam, brass plate reading: "STILL SHRINKING. — Gulf Survey, year 12." Fresh filings glitter at the newest pin. Somebody has measured it every day for years, and it is measurably, honestly smaller each visit. The joke keeps a straight face.',
    },
  },

  // SP1-114 — The Taxidermist: forty plates, one empty space. The lair site
  // and the trophy vendor are the bespoke leg; combat:kill is the verified
  // causal for "survived a hunter encounter."
  {
    id: 'SP1-114',
    kind: 'world-oneoff',
    title: 'The Taxidermist',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'Persistent lair site in the ashfall derelict field (authoredPlaces pattern), unlocked once the player has survived a hunter encounter: trade with the collector at premium trophy prices (deedRecord kill history read); the polished empty slot at the end of the airlock is purchasable — the price is a fight with house rules (numbered encounter script).',
    payload: {
      text: 'A hunter\'s lair built like a museum: forty hull IDs engraved on the airlock, each with a plate from the kill bolted under it, chronological. One space at the end is empty, polished, waiting. The current occupant is home, is charming, and is absolutely not apologetic.',
    },
  },

  // SP3-080 — The Boulder Garden: thirty pedestals, one apology to spring.
  {
    id: 'SP3-080',
    kind: 'world-oneoff',
    title: 'The Boulder Garden',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_colony', wu: 600 },
    channel: 'spectacle',
    payload: {
      from: 'Charon Expanse',
      text: 'Behind the dead colony: thirty fist-sized rocks in a careful double spiral around a claim post, each on a tiny numbered pedestal of welded scrap. Somebody\'s garden, tended. One pedestal stands empty — "LOST IN THE WIND. REPLANTED SPRING." — and the bed beside it has been turned and is waiting.',
    },
  },

  // SP3-084 — The Kiln Door: the runaway breathes in threes. The emissive
  // envelope (door every 300 s, burn 40 s, fourth pulse never lands) keys on
  // this receipt; the Runaway Kiln is oneOffCast 'runaway_kiln', not a
  // stationary POI, so the tell rides first sector entry.
  {
    id: 'SP3-084',
    kind: 'world-oneoff',
    title: 'The Kiln Door',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Vesta Forge',
      text: 'On schedule, the runaway kiln\'s door irises open and the interior glow breathes out in three slow pulses, heat shimmer standing off the shell, its light catching nearby rocks like a lighthouse of warmth. The door shuts mid-breath — it never completes the fourth pulse. That is why they call it runaway.',
    },
  },

  // SP3-088 — Radiator Bloom: the vent cycle's slow sunrise. Emissive
  // envelope on the radiator finishes (LOOK_EMISSIVE_GAIN vocabulary) keys on
  // this receipt; the Ceres spine shares the cycle.
  {
    id: 'SP3-088',
    kind: 'world-oneoff',
    title: 'Radiator Bloom',
    sectors: ['sector_tethys_junction', 'sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_tethys', wu: 1500 },
    channel: 'spectacle',
    payload: {
      from: 'Tethys Junction',
      text: 'On the vent cycle the radiator banks bloom to deep red heat over a minute — a slow sunrise along the station spine — then vent in shimmering sheets and cool back to dark metal. The bloom silhouettes any hull that crosses it, and pilots time their crossings for exactly that. The Ceres refinery runs the same cycle on its own spine, and calls it dawn too.',
    },
  },

  // SP1-176 — The Librarian's Grudge: the Archive keeps score. The grudge
  // ledger and the donation option are the bespoke leg; the sector's only
  // registered log relay (poi_tethys_customs_log) is the anchor.
  {
    id: 'SP1-176',
    kind: 'world-oneoff',
    title: 'The Librarian\'s Grudge',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_customs_log', wu: 600 },
    channel: 'memory',
    followup: 'Persistent fixture at the Tethys archive relay reading record-destruction receipts into story.flags: the causes column accrues against the player\'s hull number; a dock-side donation option (one click, feeless) moves the player to the donors column of the same ledger, and the librarian\'s two-line thanks outweigh any fee; codex page "The Grudge Ledger."',
    payload: {
      text: 'The Archive\'s night relay keeps a personal, unofficial ledger of every record destroyed in the sector, by cause — and since you arrived, the causes column has a new entry that grows. "Hull 4471-T: two survey logs, one black box, one piece of evidence. Destroyed." The librarian is not angry. The librarian is keeping score, which is worse.',
    },
  },

  // SP3-115 — The Sitter: nine years at the window. Zero agency, zero rng —
  // the purest worldOneOffs shape; the prop row is the renderer leg.
  {
    id: 'SP3-115',
    kind: 'world-oneoff',
    title: 'The Sitter',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'station_expanse', wu: 900 },
    channel: 'spectacle',
    payload: {
      from: 'Expanse Refinery',
      text: 'One habitat pod on the outer ring, lamp on, oriented — as far as anyone can tell for nine years — exactly at the station\'s observation window. The plate says RESERVED. Nothing docks it. Nothing moves it. The lamp has never blinked.',
    },
  },

  // SP3-077 — The Tailings River: the refinery's shadow, made physical.
  // Renderer cap per hone A H-39: 12 visible deposit layers, oldest fade —
  // unbounded growth fails the perf law; the prose only hints the fade.
  {
    id: 'SP3-077',
    kind: 'world-oneoff',
    title: 'The Tailings River',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_ceres', wu: 1200 },
    channel: 'spectacle',
    payload: {
      from: 'Ceres Refinery',
      text: 'A slow, glowing stream of refinery tailings arcs from the ejection spine down-sun to a field that visibly grows — season by season the bank of dull-glowing slag reaches farther, its newest layer still warm enough to read the dark by. The oldest beds have gone dark and no one remembers the first of them. The refinery\'s shadow, made physical, one layer at a time.',
    },
  },

  // SP3-128 — The Pilgrim's Rest: a dead tug wearing the seasons as plates.
  {
    id: 'SP3-128',
    kind: 'world-oneoff',
    title: 'The Pilgrim\'s Rest',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Pallas Drift',
      text: 'A dead tug in the reef field, flanks welded with hull plates like votives — each a crew\'s mark, name and home sector stamped, the newest still bright-edged. On the stern, a working lamp fed by a scrap panel, and it has not gone out. Somebody adds a plate every season. Somebody keeps the lamp fed.',
    },
  },

  // SP3-132 — The Beacon's Last Light: the lamp that ends a wreck's story.
  // Keyed to the verified wreck-record scavenging receipt
  // (aftermathWrecks.js:1456); lamp stand-down is the renderer leg.
  {
    id: 'SP3-132',
    kind: 'world-oneoff',
    title: 'The Beacon\'s Last Light',
    sectors: [],
    trigger: { type: 'receipt', event: 'wreckEcology:scavenged' },
    channel: 'spectacle',
    payload: {
      from: 'the wreck field',
      text: 'The marker lamp that has burned steadily since the wreck was logged dims, blinks twice, and goes dark for good. The field is officially done. One by one across the dark, the scavengers\' go-lamps stand down and follow it out.',
    },
  },

  // SP2-066 — The Cartographer's Corner: the researchers want the story, not
  // the data. Keyed to the verified survey receipt
  // (v2FlavorRuntime.js:318).
  {
    id: 'SP2-066',
    kind: 'world-oneoff',
    title: 'The Cartographer\'s Corner',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'receipt', event: 'signal:surveyFiled' },
    channel: 'memory',
    followup: 'barContacts lore-read offer at station_veil keyed to 5+ signal:surveyFiled receipts: the purchase renders the player\'s actual logged route in dry field-guide voice for one screen; Veil standing +2; codex page "Impossible Fixes."',
    payload: {
      text: 'A corner table at the Veil research bar where researchers re-plot survey fixes for fun — and they are arguing about yours: the impossible one from the storm-surge night. They offer to buy it. Not the data. The story of flying it.',
    },
  },

  // SP1-192 — The Wake Market: his stock is your past. The jettison log
  // (cargo:jettisoned, src/systems/cargo.js:1426) feeds the inventory.
  {
    id: 'SP1-192',
    kind: 'world-oneoff',
    title: 'The Wake Market',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Persistent buy-back site at a fixed pallas_drift coordinate fed by the cargo:jettisoned event log: everything the player dumps settles into the stall\'s stock on the slow drift and can be bought back at a markup that is fair (d.charge purchases); inventory persists and updates per save.',
    payload: {
      text: 'At the crossing of two drift lines sits a scavenger\'s stall stocked with things you will recognize: everything you ever jettisoned, dropped, or lost settles here on the slow drift, and he has been collecting. "Your wake pays better than most wrecks. Don\'t take it personal. I also sell it back."',
    },
  },

  // SP3-110 — The Tent City: festivals have geography. Ring Fair (calendar
  // dayOfYear 13, src/data/worldCalendar.js FESTIVALS) is the day the tents
  // are up; the dressing cluster is the renderer leg.
  {
    id: 'SP3-110',
    kind: 'world-oneoff',
    title: 'The Tent City',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 13, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'the station lee',
      text: 'For one day the station\'s lee side grows a village: habitat pods and awning frames in the same spots as always, warm window rows, tether-line laundry, one string of lamps — and at midnight it all strikes and is gone. The same families, the same footprints, every festival. Festivals have geography.',
    },
  },

  // SP3-167 — The Surveyor's Rest: one career, twelve WU, kept comfortable.
  {
    id: 'SP3-167',
    kind: 'world-oneoff',
    title: 'The Surveyor\'s Rest',
    sectors: ['sector_phoebe_echo'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Phoebe Echo',
      text: 'Off the shrine approach: an old survey buoy with a folding chair welded beside it and a mug rail holding three mugs — one per shift, the plate says. The lamp burns warm instead of standard white. Somebody\'s whole career fits in a twelve-WU circle, and somebody kept it comfortable.',
    },
  },

  // SP1-090 — The Flag Change: the good wreck changes hands weekly. Seeded
  // weekly owner + three encounter variants are the bespoke leg; poi_pwreck
  // is the field's registered wreck anchor.
  {
    id: 'SP1-090',
    kind: 'world-oneoff',
    title: 'The Flag Change',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pwreck', wu: 800 },
    channel: 'memory',
    followup: 'Seeded weekly owner pick at poi_pwreck (per-save seed, week key from worldCalendar): the mast\'s current fabric flag honestly predicts the encounter there this week — patrol scan, lawful share, or toll — as three numbered-encounter script reuses with visualOverrides fabric props replaced on the seeded rotation; reading the flags is a learnable skill the game never explains.',
    payload: {
      text: 'The good wreck in the field changes hands like a fishing spot: Concord claims it one day, a scavenger crew strips it lawfully the next, the Reach taxes the scavengers the day after — and by week\'s end three flags fly on one mast and nobody can say who owns what. The flags are real fabric, and somebody replaces them, every time.',
    },
  },
];
