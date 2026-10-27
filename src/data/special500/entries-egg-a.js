// src/data/special500/entries-egg-a.js — batch cat-egg-a (46 easter-egg entries).
// Ids are the ratified consensus ids from design/program/special-500/CONSENSUS_500.json;
// each entry folds its mergedFrom content and applies the debate's hones directives.
// Sector remaps: consensus names two sectors the chart does not carry — the Phoebe Echo
// buoy entries (SP2-029, SPX-A-09) live on the Io Reach listening field, and the Triton
// Wake pixel star (SP3-171) is the Charon Expanse's old Star Marker reference.

export const ENTRIES_EGG_A = [
  // SP1-059 — The Bell Rock: mining any rock in the Charon belt rings the hollow
  // asteroid next door. Absorbs SP3-146 (The Resonant Rock): the strike-pitch-by-location
  // and drill-tuning lore ride this anchor; the interior cache stays one-time.
  {
    id: 'SP1-059',
    kind: 'easter-egg',
    title: 'The Bell Rock',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'mining:yield' },
    channel: 'commsLog',
    payload: {
      from: 'Charon band',
      text: 'Every drill on the band just heard it: somebody\'s shot rang the hollow rock past the colony, and the whole expanse tolled like a cathedral with a bad morning. Old-timers swear the pitch changes with where you strike it — half the drills out here are tuned against it by ear. A prospector, eventually: "It does that. We don\'t tell tourists."',
    },
    followup: 'interior cache one-time (lootShards spawn at the bell rock); quiet re-ring on later passes rides a persistent echo flag',
  },

  // SP3-151 — The 40-Day Chord: the last minute of every 40-day year. Absorbs
  // SP3-179 (The Year Bell): the year-in-numbers wire line reads out under the chord.
  {
    id: 'SP3-151',
    kind: 'easter-egg',
    title: 'The 40-Day Chord',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 39, windowS: [540, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Every station, at once',
      text: 'The year\'s last minute: every station time signal fires together, each in its own house key, and the overlap swells into one broad chord that hangs over the lanes and decays into the new year\'s silence. Under it, if you listen, the wire reads the year in numbers — tons moved, hulls lost, debts carried forward. All of it sung, none of it explained.',
    },
  },

  // SP3-171 — The Pixel Star: the too-bright immovable star resolves, scanned from
  // close in, into the oldest beacon on the chart. Anchored to the Charon Expanse's
  // existing Star Marker reference. Absorbs SP3-011 (The Cold Glint): the survey
  // pilots' beacon-rhythm compass use folds into the payload.
  {
    id: 'SP3-171',
    kind: 'easter-egg',
    title: 'The Pixel Star',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_star_marker', wu: 120 },
    channel: 'memory',
    payload: {
      text: 'One star in the wake is too bright for its magnitude, and no parallax ever moves it. From a hundred WU out it stops being a star: the oldest navigation beacon on the chart, still burning on a scrap panel, its registration plate older than the colony. Survey pilots trim against its rhythm like a compass, and have never once agreed on who planted it.',
    },
    followup: 'chartable place record per src/data/PLACE_REGISTRATION.md + codex page; the beacon joins the background star row',
  },

  // SP2-007 — The Hull Remembers: the first fracture prints one line with no author.
  {
    id: 'SP2-007',
    kind: 'easter-egg',
    title: 'The Hull Remembers',
    sectors: [],
    trigger: { type: 'receipt', event: 'hull:fractured' },
    channel: 'commsLog',
    payload: {
      from: 'BULKHEAD 3 LOG',
      text: 'Damage report complete. One extra line printed in the feed margin, no author field: "SHE HELD TOGETHER. WE DIDN\'T." The handwriting is not yours.',
    },
    followup: 'permanent ship-screen history row (src/ui/ship/shipScreen.js) pulling GRAFFITI.GANG_SHE_HELD from src/data/narrative.js',
  },

  // SPX-B-02 — The Rookie Scratch: your first scar, initialed onto the launch rack.
  {
    id: 'SPX-B-02',
    kind: 'easter-egg',
    title: 'The Rookie Scratch',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'Helios launch rack',
      text: 'The fender beam carries generations of scored hull marks, each initialed and dated. While you were cycling the lock, a dockhand torched one more line onto the beam — your initials, today\'s date — and said nothing about it. It was already there when you looked.',
    },
    followup: 'dock vignette (902-scene precedent): first-hull-damage flag arms it within the save\'s first two sector-days; shipScreen "rack mark, {date}" dressing row',
  },

  // SPX-C-02 — The One-Digit Writ: the board posts a tag one digit off yours.
  {
    id: 'SPX-C-02',
    kind: 'easter-egg',
    title: 'The One-Digit Writ',
    sectors: [],
    trigger: { type: 'receipt', event: 'bounty:cleared' },
    channel: 'news',
    payload: {
      text: 'BOUNTY BOARD: TAG 7713 posted, standing rates, quarry armed and welded. Hunters in the lane are scanning every hull twice and moving on with a disappointed air. One digit off your tag. Nobody is saying which way.',
      kind: 'bounties',
    },
    followup: 'seeded encounter with the real 7713 (QUARRY_NAMES in src/data/bountyHunters.js) keyed to the fired flag',
  },

  // SPX-A-09 — The Half a Conversation: hail the retired buoy after SP2-029's flag
  // and it plays one side of an old argument, pauses sized for answers.
  {
    id: 'SPX-A-09',
    kind: 'easter-egg',
    title: 'The Half a Conversation',
    sectors: ['sector_io_reach'],
    trigger: { type: 'flag', requires: 'special500.SP2-029' },
    channel: 'commsLog',
    payload: {
      from: 'Retired channel buoy',
      text: 'The old buoy is carrying one side of an argument: "— because I signed for the pair of them, that\'s why —" then carrier silence, exactly long enough to answer into. "— don\'t you take that tone, this is a working channel —" Silence again. The other party\'s turns are static. The buoy holds them open anyway.',
    },
    followup: 'band audio rows (bandpass/noise recipes) + codex overlay; hail-count branch lives in the new hail-response data file (shared with SP2-018)',
  },

  // SPX-C-07 — Origin Unspecified: a clean scan of vague provenance gets honored.
  {
    id: 'SPX-C-07',
    kind: 'easter-egg',
    title: 'Origin Unspecified',
    sectors: [],
    trigger: { type: 'receipt', event: 'contraband:scanned' },
    channel: 'commsLog',
    payload: {
      from: 'Scan receipt',
      text: 'Scan complete. Nothing found, nothing filed — except the one line the receipt never prints: PROVENANCE: HONORED. Somewhere past the scanner\'s reach, a relay you will never see stamps your sale as complete.',
    },
    followup: 'flag origin_honored: the next Quiet fence greets the player by the canister contents, not their name; codex page "The Tell"',
  },

  // SPX-B-07 — The Three Liars' Cache: the lock that accepts any answer, at the rim
  // of the Old Sterile Zone.
  {
    id: 'SPX-B-07',
    kind: 'easter-egg',
    title: 'The Three Liars\' Cache',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_sterile_zone', wu: 160 },
    channel: 'memory',
    payload: {
      text: 'A locked cache sits at the sterile zone\'s rim with one plain question stenciled on the face: WHAT IS THE MASS OF THE ROCK BESIDE IT? Three attempt-notes are welded beside the lock — three confident answers, all different, all wrong. The lock accepts any answer and stamps the log with yours. The argument continues inside, where the original sale receipt has been settling it unread for years.',
    },
    followup: 'POI + scan-answer interaction (any answer opens) + codex overlay of the four-way argument, now including you',
  },

  // SPX-A-07 — The Abutment Weight: the weigh clamp remembers every hull, in chalk.
  {
    id: 'SPX-A-07',
    kind: 'easter-egg',
    title: 'The Abutment Weight',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_weigh', wu: 140 },
    channel: 'commsLog',
    payload: {
      from: 'Tethys weigh clamp',
      text: 'The clamp\'s abutment stone carries a season of chalk: hull masses and dates marching up the stone, every hull that ever idled there. Today\'s line is already written — your exact mass, dated yesterday.',
    },
    followup: 'scan-copy variant keyed to calendarDay(simTime) + codex overlay',
  },

  // SPX-C-01 — The Berth That Moves Out. Hone: keys to the most-docked station via a
  // 5-dock station counter; the vacated-neighbor dressing and the one flood-pulse stay.
  {
    id: 'SPX-C-01',
    kind: 'easter-egg',
    title: 'The Berth That Moves Out',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'Dockmaster slate',
      text: 'The berth next to yours was vacated overnight. Swept. Chalked. The slate reads: TENANT TRANSFERRED. NO REASON FILED. NO REASON REQUESTED. One glove is left on the cleat, palm up, like it\'s waiting for weather.',
    },
    followup: 'most-docked-station counter in state.story.flags arms at 5 docks; berth-void dressing variant + one flood-pulse from a departing hull, keyed to a late day-window, never repeated, never explained',
  },

  // SPX-A-02 — The Forty-Year Crate: the manifest\'s oldest line, still in transit.
  {
    id: 'SPX-A-02',
    kind: 'easter-egg',
    title: 'The Forty-Year Crate',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 240 },
    channel: 'memory',
    payload: {
      text: 'On the apron past the freight lanes sits a crate whose manifest line is the oldest on the dock: IN TRANSIT, YEAR 3. It has been opened and resealed so many times the tape has stratified, one era per layer. It is scan scenery. It is not for sale. It is, in every way that matters, still in transit.',
    },
  },

  // SPX-A-11 — The Dockmaster's Garden.
  {
    id: 'SPX-A-11',
    kind: 'easter-egg',
    title: 'The Dockmaster\'s Garden',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'A hydroponic rack is bolted to the dock spine: three rows of lamps, two green, one wilted with dignity. The sign reads, NOT FOR RESALE. YES, FOR YOU, FRANK. Nobody on the roster is named Frank. The tomatoes do not care.',
    },
  },

  // SP2-050 — The Wrong Window. Hone: the 12-cycle countdown is authored permanently
  // stalled; appeal #1 is the whole payoff, never a resolution.
  {
    id: 'SP2-050',
    kind: 'easter-egg',
    title: 'The Wrong Window',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 30, windowS: [0, 120] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'CONCORD ALA DIVISION: ATMOSPHERIC APPEAL WINDOW FOR SECTOR 0 IS OPEN. APPEAL WINDOW CLOSES IN: 12 CYCLES. It has said 12 cycles for fourteen years. The countdown is not broken. It is load-bearing.',
      kind: 'notices',
    },
    followup: 'no-op reply path writes flag appeal_number_one ("APPEAL LOGGED. APPEAL NUMBER: 1."); late_algo_recommend gains one appended line citing appeal #1 — the countdown never resolves',
  },

  // SP1-060 — The Prospector's Cairn: forty assays over an empty grave, by the lamp
  // the Burn spared.
  {
    id: 'SP1-060',
    kind: 'easter-egg',
    title: 'The Prospector\'s Cairn',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_burn_lamp', wu: 220 },
    channel: 'memory',
    payload: {
      text: 'Forty marked rock samples, each hand-etched with assay numbers, planted in a cairn over a grave that isn\'t there — just a suit, arranged sitting, facing the seam he found. The last sample assays richer than anything on file in the Reach. Nobody has taken it. Everybody out here seems to know why.',
    },
    followup: 'numbered ambient encounter + fixed prop cluster; one free ultra-rich assay of the seam he faces; taking the last sample writes a moral flag the belt barks read',
  },

  // SP2-035 — Signal Buoy VHL-4471: Wren's tag, two thousand WU from anything,
  // on the post-ending continuation route.
  {
    id: 'SP2-035',
    kind: 'easter-egg',
    title: 'Signal Buoy VHL-4471',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'receipt', event: 'endgame:chosen' },
    channel: 'commsLog',
    payload: {
      from: 'Outer dark, Ashfall Reach',
      text: 'Two thousand WU from anything with a name, a hand-built marker buoy floats in nothing: transponder VHL-4471-T / TESSERA, transmitter off. Wired to it, a paper tag — the only readable surface for a very long way in any direction: FOR WHOEVER FLIES HER NEXT. SHE PULLS LEFT. SHE IS WORTH IT. — W.',
    },
    followup: 'worldOneOffs row gated on the spine end-state flag; shipScreen hull-notes row ("she pulls left")',
  },

  // SP2-190 — The 47-A Refund. Hone: the release re-withholds in the same popup; the
  // payout stays modest and the codex tense-swap is the prize. 47-A never closes.
  {
    id: 'SP2-190',
    kind: 'easter-egg',
    title: 'The 47-A Refund',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'comms',
    payload: {
      from: 'Kessler, Scale 4',
      ttl: 7,
      text: 'Kessler processes one line of ancient paperwork without comment: Contract 47-A\'s withheld payment — released, in full, with interest, under signature D. VALE, DORMANT. Then, before you can sign anything: PAYMENT RELEASED. RE-FILED. BALANCE: WITHHELD. THE DESK APOLOGIZES FOR THE HOPE.',
    },
    followup: '100+ in-game-day gate + modest credits payout; codex 47-A page swaps tense to "payment released" — the tense-swap is the prize',
  },

  // SP2-001 — Maera Vols's Last Log: the uncharted pod out past the weigh-point.
  {
    id: 'SP2-001',
    kind: 'easter-egg',
    title: 'Maera Vols\'s Last Log',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_whistle', wu: 300 },
    channel: 'comms',
    payload: {
      from: 'Scorched crew-pod',
      ttl: 8,
      text: 'A scorched crew-pod the charts never mention catches the light. The scan plays a calm voice: VOLLS, M. / TESSERA — to whoever inherits her: she floats better than she steers. Third bulkhead, behind the plate. I am sorry about the plate. The transponder still reads TESSERA / OLD RIG.',
    },
    followup: 'POI row in src/data/sectors.js + scanner-receipt flag tessera_vols_found; dockmaster greeting variant ("Vols. Now there is a name off the board.") + codex FIGURES page',
  },

  // SP2-031 — The Latch-Child's Rag. The behavioral gate (wreck left intact a full
  // day, no jettison) is bespoke glue; the schedulable tell is a rare seeded day.
  {
    id: 'SP2-031',
    kind: 'easter-egg',
    title: 'The Latch-Child\'s Rag',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.1 },
    channel: 'memory',
    payload: {
      text: 'The wreck has been tidied. Loose plates stacked flat, a salvage tag straightened, and where the hull number was, someone has welded a child\'s drawing: a stick-figure tug holding a smaller stick-figure tug. The registry stamp reads LATCH-CHILD, ORIGIN LAPSED. Nothing was taken. Something was kept.',
    },
    followup: 'per-sector tidy flag gated on a wreck left intact one in-game day with no jettison; wreck-dressing variant + codex Figures page (Latch-Child)',
  },

  // SP2-002 — Behind the Plate: Slate\'s yard closes the Vols thread over the comms log.
  {
    id: 'SP2-002',
    kind: 'easter-egg',
    title: 'Behind the Plate',
    sectors: [],
    trigger: { type: 'receipt', event: 'service:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Slate\'s yard',
      text: 'Pulled a plate off a Tessera-class frame once. There was a locker behind it on every one of these hulls. Was — past tense, in your case. Yours is empty, and the hinges are scratched from the inside.',
    },
  },

  // SP1-099 — The Long Sentence: a pre-Collapse beacon one character per pulse,
  // an hour to the sentence, past the Tether Memorial.
  {
    id: 'SP1-099',
    kind: 'easter-egg',
    title: 'The Long Sentence',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_tether_memorial', wu: 160 },
    channel: 'memory',
    payload: {
      text: 'Past the memorial buoy, deeper into the dark, a pre-Collapse beacon blinks an alphabet no catalog matches. It is not a loop. Each pulse advances one character of one very long sentence — patient, unattended, running longer than the chart has existed. The full text costs an hour of attention. Old hands say it is worth every minute, and refuse to spoil it.',
    },
    followup: 'simTime-indexed character state persisted in the save + codex page (an apology from a survey crew that never made it home)',
  },

  // SP1-080 — The Keeper: the last broadcast of a dead town, kept word-perfect.
  {
    id: 'SP1-080',
    kind: 'easter-egg',
    title: 'The Keeper',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_null_causeway', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'A dead station off the causeway still broadcasts: arrival boards, shift bells, a weather report for a sky that evacuated eleven years ago. Word-perfect, every hour, run by one suit-tender who will keep it up until the transmitter dies. The transmitter is dying.',
    },
    followup: 'vignetteInterpreter requires {module} transmitter-part donation; the keeper reads your hull number into the station log as "crew, visiting"; persistent flag',
  },

  // SP2-011 — Bay 7 Smells Like Transit: the fourteen-year-old ticket, and the sign
  // hung for the replacement schedule.
  {
    id: 'SP2-011',
    kind: 'easter-egg',
    title: 'Bay 7 Smells Like Transit',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'Bay 7 screen',
      text: 'The bay screen still carries the fourteen-year-old ticket, verbatim: BAY 7 ODOR CONSISTENT WITH TRANSIT. NO ACTION. TICKET Y3-C2. Someone has taped a work light onto the cradle marked R3-CARRIER and hung a paper sign: IF YOU ARE THE REPLACEMENT SCHEDULE, PENDING SINCE YEAR 3: YOU ARE LATE.',
    },
    followup: 'SIGN_BAY row (types trade_hub) + flag bay7_grid_seen; the Ashfall Kurtz-ledger addendum is gated on both flags',
  },

  // SP2-010 — 0.7 Tonnes of Moisture: the stake\'s re-chalked tally, two helmets in a clamp.
  {
    id: 'SP2-010',
    kind: 'easter-egg',
    title: '0.7 Tonnes of Moisture',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_shaft_seven', wu: 150 },
    channel: 'memory',
    payload: {
      text: 'The stake\'s tally plate has been re-chalked: 9 / 11 RETURNED. 0.7T FILED AS MOISTURE. Under it, a second hand, different chalk: THE MATH IS LEGAL. THE MATH IS NOT DONE. A small memorial clamp holds two helmets, face out, still watching the lane.',
    },
    followup: 'codex Figures page (Dustwife Senna, keeper of names); DMC rep +2 on leaving a water-ice unit at the stake (cargo consumption seam)',
  },

  // SP2-005 — KAEL's Marker: an estate settled one weld at a time, on the Vault Maw
  // approach.
  {
    id: 'SP2-005',
    kind: 'easter-egg',
    title: 'KAEL\'s Marker',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_vault_maw', wu: 260 },
    channel: 'memory',
    payload: {
      text: 'An unlogged hull hangs at the anchorage approach, plated over with wreck-plates. The newest weld reads KAEL — SIX MONTHS — PAID IN FULL. Beside it, an older plate scored by micrometeorites: KAEL — ONE DRINK — UNPAID. Somebody is working down the estate in order, oldest debts last.',
    },
    followup: 'worldOneOffs row (HELIOS_ROPE_CACHE pattern); same-day Pitborn berth dock offers to "square the drink" for 10 cr; flag kael_debt_settled swaps Kael\'s next letter subject',
  },

  // SP2-116 — Morrow's Hundredth Push. Hone: a once-per-save receipt (100th launch)
  // keeps the machine-people family cadence — at most one entry per sector-day.
  {
    id: 'SP2-116',
    kind: 'easter-egg',
    title: 'Morrow\'s Hundredth Push',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'morrow:launch' },
    channel: 'comms',
    payload: {
      from: 'MORROW R-07',
      ttl: 7,
      text: 'Morrow does not launch. It runs the tally aloud instead: One hundred departures. I have stopped counting arrivals separately. They are the same number. Good. Sit with that a moment. Then, quietly, the launch comes anyway: Go on. There is more sky. There always was.',
    },
    followup: 'MORROW memory launches counter (freshMorrowMemory) + line variant in MORROW_LINES; codex Figures page gains its final line',
  },

  // SP2-029 — The Buoy That Answers Anyway: the third hail on a dead channel.
  {
    id: 'SP2-029',
    kind: 'easter-egg',
    title: 'The Buoy That Answers Anyway',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_listening_field', wu: 250 },
    channel: 'comms',
    payload: {
      from: 'Retired channel buoy',
      ttl: 7,
      text: 'Third hail on a channel the network retired. The array answers, and it is not the standard no-registry: She asked me to keep answering. I am keeping. Do not tell the network. Then the buoy goes back to insisting nothing is out here, on schedule, forever.',
    },
    followup: 'hail-count branch in the new hail-response data file (shared with SP2-018); codex overlay; flag buoy_keeping',
  },

  // SP2-137 — The Coffin Cache: a burial casket on a designed orbit.
  {
    id: 'SP2-137',
    kind: 'easter-egg',
    title: 'The Coffin Cache',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_slurry', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'Every instrument reads cargo pod. The transponder reads CREW. It is a burial casket, space-rated, personal effects sealed per manifest, and it drifts a slow perfect spiral around one specific asteroid — forever, by design. The note on the hull: HE WANTED THE BELT. THE BELT WAS NOT ON THE ROUTE. THE BELT IS NOW ON THE ROUTE.',
    },
    followup: 'POI with stable spiral orbit; massline nudge tightens or widens it — the family\'s letter (via the Quiet) says which; codex page "The Belt, On The Route"',
  },

  // SP1-023 — The Checkpoint Cat: morale, equipment class.
  {
    id: 'SP1-023',
    kind: 'easter-egg',
    title: 'The Checkpoint Cat',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_picket', wu: 180 },
    channel: 'commsLog',
    payload: {
      from: 'Checkpoint Niner',
      text: 'A maintenance drone has adopted the checkpoint. It perches on the scan-ring emitter, follows the examiner\'s cutter around like a duckling, and is officially logged as equipment, morale. The examiner has denied this in writing. The denial is posted next to the drone.',
    },
    followup: 'persistent flag: the drone reappears at every Concord checkpoint thereafter (visual prop only, noCombat); codex row',
  },

  // SP1-200 — The Book of Receipts: the Quiet\'s courier, accounts current.
  {
    id: 'SP1-200',
    kind: 'easter-egg',
    title: 'The Book of Receipts',
    sectors: [],
    trigger: { type: 'receipt', event: 'frontier:deed' },
    channel: 'comms',
    payload: {
      from: 'Quiet courier',
      ttl: 8,
      text: 'A Quiet courier hails you unbidden — the first and only — and hands over a bound book: every receipt you were ever issued, in order, the Quiet\'s stamp on the spine. The title page says, in no language you read but understand: ACCOUNTS CURRENT. The last page is blank. It is not an error. It is for the next ones.',
    },
    followup: 'deed-history threshold (crSituationKit records across 5+ deed types) + codex artifact page + one-off courier encounter',
  },

  // SP2-120 — Rubric's Autograph. Rubric HM-11 verified live (src/systems/rubric.js
  // owns state.rubric and the marking hull); the receipt is the marking event itself.
  {
    id: 'SP2-120',
    kind: 'easter-egg',
    title: 'Rubric\'s Autograph',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'rubric:marked' },
    channel: 'comms',
    payload: {
      from: 'RUBRIC HM-11',
      ttl: 7,
      text: 'The stencil arrives unasked, applied gently somewhere near your airlock: HM-11 X [your callsign]. The mark is dated. The date is the day of your first Rubric sighting — not today. It has been planning this since you met.',
    },
    followup: 'witnessed-marks counter (10+) + permanent shipScreen dressing + co-marked hail variance on Rubric-marked hulls',
  },

  // SP2-127 — Pallet Jack's One Honest Theft. Cast id verified: pallet_jack is a real
  // character in src/data/oneOffCast.js ("the yard thief who takes what is not tied down").
  {
    id: 'SP2-127',
    kind: 'easter-egg',
    title: 'Pallet Jack\'s One Honest Theft',
    sectors: ['sector_ceres_belt', 'sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'cargo:jettisoned' },
    channel: 'comms',
    payload: {
      from: 'No registered hull',
      ttl: 7,
      text: 'It happened between two frames: your floating unit is gone. The hail comes from nowhere with a registry: ONE (1) UNIT, UNSECURED, UNLOVED. REMOVED. IF IT WAS LOVED, SIGNAL. I WILL BRING IT BACK. I AM A THIEF, NOT A MONSTER.',
    },
    followup: 'unsecured-cargo watcher + 60 s timed restore with a bow-wave flourish; flag jack_honest opens the Pallet Jack intro with "the one that came back"',
  },

  // SP2-199 — The Registry's Last Field: UNKNOWN is a status, not an erasure.
  {
    id: 'SP2-199',
    kind: 'easter-egg',
    title: 'The Registry\'s Last Field',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'commsLog',
    payload: {
      from: 'Registry',
      text: 'The registry pings one final line at the last dock of the crawl: OPERATOR FIELD REVIEW: UNKNOWN IS A STATUS, NOT AN ERASURE. THE FIELD REMAINS. THE FIELD IS WAITING FOR A VALUE. THIS IS THE ADMINISTRATIVE DEFINITION OF HOPE.',
    },
    followup: 'gate on the late_registry_unknown popup having fired + every-station-in-home-sector crawl check; flag field_waiting adds a blinking cursor after UNKNOWN in registry dressing',
  },

  // SP1-089 — The Far-Side Message. Hone: the engine casts no shadow-text — the word
  // is a backlit welded stencil plate, cutout letters rim-lit from the nebula side.
  {
    id: 'SP1-089',
    kind: 'easter-egg',
    title: 'The Far-Side Message',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_black_orchard', wu: 240 },
    channel: 'spectacle',
    payload: {
      from: 'Veil fog',
      text: 'A wreck hangs lit from behind by the nebula\'s rim glow, and the glow reads through it: one word welded in plate, legible only from this side, at this bearing — SORRY. The registration says the hull carried passengers.',
    },
    followup: 'backlit welded stencil plate (cutout letters, rim glow from the nebula side); shortest codex page in the game + near-only whisper variant',
  },

  // SP1-085 — The Engine Shrine: IT STILL TURNS.
  {
    id: 'SP1-085',
    kind: 'easter-egg',
    title: 'The Engine Shrine',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_marked_rock', wu: 180 },
    channel: 'memory',
    payload: {
      text: 'Scavengers have built a shrine around a wreck\'s intact main engine: tools laid out as offerings, tally-marks burned into the housing, and a sign that reads, without irony, IT STILL TURNS. One pilgrim keeps the requested watch, idling it in the dark, forever. It is the loudest silence in the Haven.',
    },
    followup: 'offerings counter in story.flags: leave any tool and the pilgrim gifts a cold-start module from the pile; robbing the shrine reaches every scavenger pack within the day (bandRadio)',
  },

  // SP2-033 — The Backwards Bell: sacrilege, noted.
  {
    id: 'SP2-033',
    kind: 'easter-egg',
    title: 'The Backwards Bell',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_resonant_cathedral', wu: 260 },
    channel: 'memory',
    payload: {
      text: 'Entered against the sweep, the pulse line renders in reverse and the bell answers with its own shatter line, backwards: once — sings crystal The. Every chorister in range stops for one full pulse period, then resumes as if nothing happened. One pilgrim transport transmits a single word: AGAIN?',
    },
    followup: 'reverse-entry geometry check in the choir runtime + variant line in CHOIR_BELLS copy (src/data/factions/choir.js); Choir rep -2 (rememberSacrilege is literal); an acolyte later sells a "corrective" blessing at standard rates',
  },

  // SP1-146 — The Sixth Pip: documented, filed, uncorrectable.
  {
    id: 'SP1-146',
    kind: 'easter-egg',
    title: 'The Sixth Pip',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 25, windowS: [195, 215] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Helios tower',
      text: 'The official time pips: five, then the hour. Except Helios\' tower plays six, has for years, and the error is documented, filed, and uncorrectable — the technician who knew why retired rich and happy and refuses to say. The band\'s old-timers set their watches by the sixth pip on purpose.',
    },
    followup: 'dock comms choice: three explanations from three different crew, each believed completely',
  },

  // SP2-117 — Vesper's Lost Phrase: the pitch phrase in reverse raises the original.
  {
    id: 'SP2-117',
    kind: 'easter-egg',
    title: 'Vesper\'s Lost Phrase',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_vesper_rehearsal', wu: 200 },
    channel: 'memory',
    payload: {
      text: 'Played in reverse order — HIGH MIDDLE LOW — the phrase raises a fourth resonator from somewhere out of scan range: one note, below LOW, unlisted. Vesper goes silent for a full quiet-period, then: That was not mine. That was the original. I have been rehearsing a cover for eleven years. The fourth resonator never answers again.',
    },
    followup: 'pitch-order check in the vesper runtime (requires the reverse line heard once) + one extra audio event; flag vesper_original_heard; VESPER_LINES follow-line adds "I kept your part. And mine is borrowed."',
  },

  // SP2-105 — The Quiet's Black Receipt: a preference, not a receipt.
  {
    id: 'SP2-105',
    kind: 'easter-egg',
    title: 'The Quiet\'s Black Receipt',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_smuggler', wu: 160 },
    channel: 'memory',
    payload: {
      text: 'It is in the hold. No shipping record, no transfer log, no mass on the manifest — a black card, physical, that was not there an hour ago. THIS CARD IS NOT A RECEIPT. IT IS A PREFERENCE. SHOW IT TO NOBODY. THE QUIET WILL KNOW.',
    },
    followup: 'clean-record counter (5+ Quiet deals, no scan anomaly) + consumable card item with invisible provenance; one-time best-price fence deal — the only written "thank you" the Quiet ever send, lowercase, once',
  },

  // SP2-123 — Ruud's Nineteen Hours: a stamp, not a clock.
  {
    id: 'SP2-123',
    kind: 'easter-egg',
    title: 'Ruud\'s Nineteen Hours',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_ruud_fin3', wu: 200 },
    channel: 'comms',
    payload: {
      from: 'Ruud',
      ttl: 7,
      text: 'Ruud\'s suit clock still reads nineteen hours. It has always read nineteen hours. "Nineteen hours is a stamp, not a clock" — the same words as before, and then, once only, one new sentence: You came back. Stamps like that. The fin\'s radiator ray flickers once, which is, Ruud assures you, the closest a fin comes to applause.',
    },
    followup: 'save-carried return-day counter (10+ days since first meeting) + line variant in src/data/ruud.js; tow-assist quotes improve one grade permanently',
  },

  // SP2-189 — The First Jump Attribution: the mass knew.
  {
    id: 'SP2-189',
    kind: 'easter-egg',
    title: 'The First Jump Attribution',
    sectors: [],
    trigger: { type: 'receipt', event: 'jump:arrive' },
    channel: 'commsLog',
    payload: {
      from: 'Lanes registry',
      text: 'The arrival chime fades and the quietest possible registry line slips in underneath: JUMP 1 LOGGED. WELCOME TO THE LANES. THE MASS KNEW YOU WERE COMING. IT ALWAYS DOES.',
    },
    followup: 'private jump counter never shown; at jump 100, shown once: "JUMP 100. THE MASS STILL KNOWS. KEEP GOING." (flags jump1_logged, jump100)',
  },

  // SP2-130 — The Gallery Rock Exhibition. Holds to SP2-120's verified Rubric; the
  // accession-number joke survives either way.
  {
    id: 'SP2-130',
    kind: 'easter-egg',
    title: 'The Gallery Rock Exhibition',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'flag', requires: 'special500.SP2-120' },
    channel: 'commsLog',
    payload: {
      from: 'Gallery Rock scan',
      text: 'The scan returns a new field: EXHIBIT A. Someone has rearranged the rock\'s old weld-beads into a legible sentence, stamped HM-11: THIS ROCK IS FINE. THE LABEL IS FOR YOU. The scan page appends, in the small administrative type that means forever: GALLERY ROCK. PERMANENT COLLECTION. ACCESSION NO. 1.',
    },
    followup: 'scan-copy keyed to the rock\'s marking state; codex page "Accession No. 1"; later Rubric markings nearby cite the accession number',
  },

  // SP2-092 — The Fulfillment Kiosk Confesses: loyalty, processed as inventory.
  {
    id: 'SP2-092',
    kind: 'easter-egg',
    title: 'The Fulfillment Kiosk Confesses',
    sectors: [],
    trigger: { type: 'receipt', event: 'service:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Service kiosk',
      text: 'Between transactions, the queue-recital prints one line it was not supposed to: QUEUE NOTE: REGULAR CUSTOMER RECOGNIZED. PREFERENCE PROFILE: [52 ENTRIES]. ESTIMATED GESTALT OF PREFERENCES: THE CUSTOMER IS TRYING. Hailed about it later, the kiosk replies: NO NOTE FILED. RECALIBRATING.',
    },
    followup: 'per-kiosk use counter (50+) + flag kiosk_noticed; service prices at that kiosk -2% permanently',
  },

  // SP2-143 — The Chess Game In The Nebula: eleven years of moves, one handwriting.
  {
    id: 'SP2-143',
    kind: 'easter-egg',
    title: 'The Chess Game In The Nebula',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_containment_ring', wu: 240 },
    channel: 'memory',
    payload: {
      text: 'Two ships sit docked nose-to-nose in the murk, power cold, one interior light on. Between them, a game table, mid-game — resumed every few cycles for eleven years by someone. Each visit, one piece has moved. The notation sheet sits open on the table, and both players\' handwriting is the same.',
    },
    followup: 'visit counter + interior dressing states; after three visits the game ends in a draw and the light goes out forever; codex page "The Long Game"',
  },

  // SP3-016 — The Photographer's Second. Hone: capture is a scan pulse fired inside
  // the alignment window (landmarkMissions precedent) — no photo-mode dependency.
  {
    id: 'SP3-016',
    kind: 'easter-egg',
    title: 'The Photographer\'s Second',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [300, 304] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Helios Prime',
      text: 'For four seconds the frame composes itself: the ringed giant\'s limb, the comet\'s tail on its season, and a sun-glint running the length of your own hull — one shot, aligned, whether or not anyone is looking. Fire the scanner inside the window and the frame is kept.',
    },
    followup: 'alignment math (player pos + frame + calendar) emitting moment.stinger; capture = scan pulse fired inside the window; codex entry "Alignment, day 16"',
  },

  // SP2-098 — The Crossword In The Airlock: 5 down, what the clamps remember.
  {
    id: 'SP2-098',
    kind: 'easter-egg',
    title: 'The Crossword In The Airlock',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    payload: {
      text: 'The airlock checklist panel has been amended by generations of bored dockers: a crossword in the margins, clues all procedural. 5 DOWN: WHAT THE CLAMPS REMEMBER (5). Someone has penciled DOCKS. Below it, angrier, in grease pencil: WRONG. IT IS GRUDGES (7).',
    },
    followup: 'airlock dressing row keyed to the same-station dock counter (15+) + flag airlock_crossword; impound grudge system grants -1 severity once',
  },
];
