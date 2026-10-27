// src/data/special500/entries-anomaly-a.js — batch cat-anomaly-a (31 entries).
// Anomaly-heavy slice of the ratified consensus (CONSENSUS_500.json). Physics
// behaving strangely, forecastable by an attentive pilot. Entries whose core is
// genuinely interactive (persisted counters, scan puzzles, cargo effects) ship
// as channel 'memory' with a one-line followup naming the bespoke mechanic; the
// schedulable tells ship as spectacle/commsLog per the slice in entries.js.

export const ENTRIES_ANOMALY_A = [
  // SP1-103 — The Tally Sweep: the retired toll-keeper's lighthouse still sweeps
  // the io_reach lane on its old schedule; the tally buoy counts honestly. The
  // 12-line save-long milestone arc (SP1-017 folded in) is the follow-up batch.
  {
    id: 'SP1-103',
    kind: 'anomaly',
    title: 'The Tally Sweep',
    sectors: ['sector_io_reach'],
    trigger: { type: 'calendar', dayOfYear: 7, windowS: [0, 600] },
    recurring: true,
    channel: 'memory',
    payload: {
      text: 'The retired toll-keeper\'s lighthouse still sweeps the trade lane on its old schedule, and being caught in the sweep feels exactly like being counted — because the tally buoy beside it increments, visibly, every pass. The count is in the hundreds of thousands. Yours is on it now, and the count is honest: re-visits add to your line. A recording, dry as sand, says one line per milestone. Twelve lines exist. Collecting them takes a whole save.',
    },
    followup: 'numbered ambient encounter at the real tally POI: sweep-cone pass counter persisted per player in story.flags; twelve milestone lines in ENCOUNTER_BARKS carrying SP1-017\'s weigh-point tonnage thresholds and the retired stationmaster\'s signature on the 100k line',
  },

  // SP1-093 — The Silence: a hard-edged region in the Veil where every band is
  // dead. Zone grammar (audio/comms suppression, SP3-148's full audio-null and
  // reversed-echo exit folded in) is the follow-up batch.
  {
    id: 'SP1-093',
    kind: 'anomaly',
    title: 'The Silence',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'Past the hard edge, every band goes dead — NPC comms, barks, your own transmission echo, all of it. Traffic inside flies running lights only, and the accepted etiquette, learned from watching, is to pass port-to-port and say nothing. Whatever is said in here stays in here.',
    },
    followup: 'sectorZones zone fixture (fixed seeded region): bandRadio.js + barkDirector gates mute NPC comms/barks while inside, full audio-null with reversed-echo exit (SP3-148); the one scripted voice per save gated in story.flags',
  },

  // SP3-024 — Ring Rain: one visible stream per meteor-shower surge off the
  // Anvil's influence edge; survivors become ordinary ore-rich minables on the
  // weatherMeteors seam. The sift culture and capped free ice (SP1-149) ride in
  // the tell.
  {
    id: 'SP3-024',
    kind: 'anomaly',
    title: 'Ring Rain',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Tethys Junction',
      text: 'Bright streaks are peeling off the Anvil\'s influence edge and falling sunward in slow file — the planet visibly eating its own ring. Stones that survive to the skim corridor read as ordinary minable rock, ore-rich, and the sift crews work the fall under the hard daily cap on free ice.',
    },
  },

  // SP3-010 — Ring-Plane Flash: cross the ring plane while backlit and the disc
  // collapses to a hairline, then blooms (SP3-040's ice-halo fuse folded in as
  // the second venue). Purely optical; the angle math is the compositor's leg.
  {
    id: 'SP3-010',
    kind: 'anomaly',
    title: 'Ring-Plane Flash',
    sectors: ['sector_helios_prime', 'sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'spectacle',
    payload: {
      from: 'Helios Prime',
      text: 'Cross the plane the background ring lies in while the ring is backlit and the disc collapses to a single hairline of white light across the sky, then blooms into a broad backlit glare band as you come out the far side — dust acting like dust. Purely optical, radar-friendly, zero threat in it anywhere. The ice-halo variant runs the same fuse one plane over.',
    },
  },

  // SP3-170 — The Breath of the Veil: the nebula plates swell and settle on the
  // sector-day clock (SP3-039's radar-reads-nothing instrument beat folded in).
  // The sinusoid keyed to simTime is the paintedSky leg.
  {
    id: 'SP3-170',
    kind: 'anomaly',
    title: 'The Breath of the Veil',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 1.0 },
    channel: 'spectacle',
    payload: {
      from: 'The Veil',
      text: 'The Veil\'s fog inhales and exhales on the sector-day clock — plate strength swelling a step, then settling — a resting respiration you stop noticing until you dock for a while and come back out to find it mid-breath. The radar agrees with nothing in particular: the plates read as breathing, not moving.',
    },
  },

  // SP3-003 — The Unannounced Flare: the sun doubles for six seconds at a
  // hash-picked minute, once per 7-day season (SP3-008's day-5 clockwork and
  // apron double-shadow folded in). Second rig key stays a cue-row call site.
  {
    id: 'SP3-003',
    kind: 'anomaly',
    title: 'The Unannounced Flare',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'spectacle',
    payload: {
      from: 'Ceres Belt',
      text: 'The sun doubled for six seconds — a hard secondary point beside the key throwing a second faint shadow, a white-hot spark line on every hull edge. The codex files it as "solar parallax, unexplained." Old apron hands set their coffee by it: day five of the season, clockwork, right when the Borrowed Sun is folding.',
    },
  },

  // SP3-155 — The Slow Lens: stars smear around one empty point with mass;
  // fixed-seed arc, 300 WU. SP3-032's survey-buoy lamp ripple (lamps only) and
  // the Archive survey framing fold in. Structure warp stays static.
  {
    id: 'SP3-155',
    kind: 'anomaly',
    title: 'The Slow Lens',
    sectors: ['sector_proteus_well'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Proteus Well survey',
      text: 'Stars near one empty point smear into short arcs pointing around it — a lens with no visible mass, fixed in place, three hundred WU across. Hulls crossing the arc\'s line catch a faint blue rim on the side facing the point; fly the exact line and your predictor bows for one second. The survey buoys\' lamps ripple when they idle near it — lamps only, the structure has never moved. The Archive files it under a name nobody uses.',
    },
  },

  // SPX-B-04 — The Deck Chair: one welded chair aimed at the best view in
  // dione_lane. The double heat-bleed while parked and the wipe scan are the
  // follow-up batch.
  {
    id: 'SPX-B-04',
    kind: 'anomaly',
    title: 'The Deck Chair',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'A patch of nothing — no rocks, no traffic, no salvage — with one welded deck chair bolted to a bare plate, aimed at the best view of the star in the sector. A small placard: RESERVED FOR WHOEVER NEEDS IT. WIPE IT DOWN.',
    },
    followup: 'sectorZones zone record (no presence) + one chair prop: hull heat bleeds at double rate while parked inside (exemption predicate pattern); wipe = scan interaction that leaves it clean for the next pilot and chalks your initials on the plate\'s underside',
  },

  // SPX-A-01 — The Pointing Chain: five dead nav buoys aimed at each other, the
  // last at a chalked-X rock with a modest cache and a codex page. WorldOneOffs
  // cluster row; the discovery tell rides belt chatter like the Fiddle Strings.
  {
    id: 'SPX-A-01',
    kind: 'anomaly',
    title: 'The Pointing Chain',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'In the derelict field: a chain of five dead nav buoys, each one physically aimed at the next, the last aiming at an uncharted rock marked with a hand-chalked X and nothing else. Someone wanted to be followed. The rock holds one modest cache and a page of somebody\'s codex.',
    },
  },

  // SP2-009 — The Twenty-Fifth Plinth: scan the dark plinth at the Candle Fleet
  // memorial after witnessing a ship death and it answers once. Scan gating and
  // the flag write are the follow-up batch.
  {
    id: 'SP2-009',
    kind: 'anomaly',
    title: 'The Twenty-Fifth Plinth',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The dark twenty-fifth plinth answers a scan with one stored line, a maintenance clerk\'s voice: "We light twenty-four because twenty-five is whoever is out there right now. It goes on when you don\'t come back. Welcome to the count." The plinth\'s light breathes once, then holds.',
    },
    followup: 'scan interaction on poi_memorial via discoveryPresentation.js, gated on having witnessed any ship death in-sector; one-line story.flags write candle_count_understood; the plinth stays lit for the session after any player near-death, then dark; codexPages overlay line',
  },

  // SP2-004 — Incident 7741, the Sealed Side: the Listening Field re-aimed, the
  // board mirrored, one line open. Revisit-count gating and the Concord rep tick
  // are the follow-up batch.
  {
    id: 'SP2-004',
    kind: 'anomaly',
    title: 'Incident 7741, the Sealed Side',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The Listening Field\'s array has been quietly re-aimed since the last visit. The scan returns a mirrored board: INCIDENT 7741 / 5 CREW / CAUSE: SEALED / EVIDENCE: SEALED / WITNESSES: SEALED. Every line sealed except one: HULL STATUS: HELD TOGETHER.',
    },
    followup: 'scan-detail row in discoveryPresentation.js keyed to the Listening Field revisit count in story.flags (fired after beat 3); codexPages overlay gives Warrant Orrin a line; Concord rep -1 if the player files a records request, +2 for walking away',
  },

  // SP1-076 — The Fourth Mayday: the fourth distress you answer is your own
  // registry, your own voice, nobody there. Counter gating and the courier's
  // final log are the follow-up batch.
  {
    id: 'SP1-076',
    kind: 'anomaly',
    title: 'The Fourth Mayday',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescue:started' },
    channel: 'memory',
    payload: {
      text: 'The fourth mayday of the run transmits your own registry number as the vessel in distress, at your own last-known heading, your own voice pattern in the carrier wave. Nobody is there. Your transponder, checked mid-flight, is fine and slightly smug about it. The source is a crashed courier that copied traffic to spoof rescues; its final real log says it was never hunting ships. It was lonely.',
    },
    followup: 'numbered selfRegistered encounter gated on a persisted distress-response counter (fourth in a run); spoof mayday lines via comms:popup; the crashed courier\'s final real log as a codexPages page',
  },

  // SP1-102 — The Four Points: four beacons at compass points around a dead
  // star, each one sentence about a thing you actually did. Deed-stat reads and
  // the composed verdict are the follow-up batch.
  {
    id: 'SP1-102',
    kind: 'anomaly',
    title: 'The Four Points',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'Four identical beacons stand at compass points around a dead star, each one sentence, plain as a shipping notice — and each sentence is about a thing you actually did this run: rescued, refused, robbed, ran. Nobody built them this week. They were here first. The fourth point reads the other three into one verdict with no author and no punishment. Just the record, read aloud.',
    },
    followup: 'four numbered ambient encounters on fixed compass-point beacons reading real player deed stats via src/systems/deedRecord.js; the fourth beacon composes the verdict from the completed records',
  },

  // SP1-161 — The Undertakers' Bell: a wreck that rings once per honest death.
  // The persisted per-sector-day count and the deliberate manual ring (plaque)
  // are the follow-up batch.
  {
    id: 'SP1-161',
    kind: 'anomaly',
    title: 'The Undertakers\' Bell',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    payload: {
      text: 'A derelict tug that tows nothing and follows nothing rings its bell once for every hull that died in the sector today. The count is honest — the bell knows things the news doesn\'t — and the day you first hear it, it rings for someone you never met, one more time than the news reported.',
    },
    followup: 'numbered ambient encounter on the fixed wreck reading sector-day kill records into a persisted per-sector-day bell count (story.flags); ringing it yourself once is a deliberate manual choice that writes a plaque no one can find (codex)',
  },

  // SP2-166 — The Preserved Cockpit's Manifest: the manifest grows by one line
  // per session-scan; items being added, not recovered. Per-session counter,
  // breathing light and codex page are the follow-up batch.
  {
    id: 'SP2-166',
    kind: 'anomaly',
    title: 'The Preserved Cockpit\'s Manifest',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The preserved cockpit\'s manifest returns one more line per scan, sessions apart — gloves, a thermos, a paperback, a second paperback, a note. Items being added, not recovered. The final scan\'s last line: ONE (1) PILOT, PRESERVED, DO NOT WAKE UNTIL THE BELT IS SAFE. STATUS: [REDACTED].',
    },
    followup: 'per-session scan counter on poi_charon_preserved_cockpit + manifest-line state; codex page "Do Not Wake"; Charon standing +2; the cockpit light gains a slow sleep-breathing pulse after the final scan',
  },

  // SP1-100 — The Empty Barycenter: two dead moons (honed down from three) orbit
  // a center that contains nothing — and the nothing has mass. The registered
  // slow-field row and the locals' timing lesson are the follow-up batch.
  {
    id: 'SP1-100',
    kind: 'anomaly',
    title: 'The Empty Barycenter',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'Two dead moons orbit a common center that contains nothing at all — and the nothing has mass. Instruments agree on the gravity and disagree on everything else. Rocks that drift too close to the center slow down, politely, as if remembering something. The fastest route across the sector threads it, and the locals charge to teach the timing.',
    },
    followup: 'one dead-moon pair in fixed-seed mutual orbit + a registered slow-field row (fields.js precedent) around the empty center; the locals\' timing lesson offered as a lane contact',
  },

  // SP1-101 — The Scheduled Ghost: a nine-hull convoy that no longer exists
  // crosses the patrol corridor at the same minute anyway; the advisory board
  // thanks it for right-of-way. The catalog re-observes it once a year at the
  // exact minute; the black box is salvage-signal glue.
  {
    id: 'SP1-101',
    kind: 'anomaly',
    title: 'The Scheduled Ghost',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'calendar', dayOfYear: 13, windowS: [240, 255] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Charon traffic',
      text: 'Every day at the same minute, sensors paint a nine-hull convoy crossing the patrol corridor — arrivals logged, traffic advisories issued — and no hull is ever visible. The advisory board still thanks it for right-of-way. It has never been late. Scan the empty route at the exact minute, once in a save, and the convoy\'s final black box is yours.',
    },
  },

  // SP2-164 — The Warm Freighter's Order: approach with food in hold and the
  // galley takes an order for a crew of zero. The delivery interaction, the
  // "PAID — KITCHEN" tab flag and the codex page are the follow-up batch.
  {
    id: 'SP2-164',
    kind: 'anomaly',
    title: 'The Warm Freighter\'s Order',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The warm freighter\'s galley vent breathes once — a real, thermal event — and the galley PA asks, warm as the hull: "ORDER FOR [CARGO], TABLE FOR [CREW COUNT: ZERO]. KITCHEN IS OPEN. KITCHEN HAS ALWAYS BEEN OPEN." Food jettisoned alongside is taken inside by a mechanism nobody sees. After that, one complimentary meal appears on your tab at any Charon station: PAID — KITCHEN.',
    },
    followup: 'galley PA popup on approach with a food commodity in hold; jettison-alongside delivery taken in by an unseen mechanism; station tab flag "PAID — KITCHEN" on any Charon docking thereafter; codex overlay "The Kitchen Is Open"',
  },

  // SP2-167 — The Empty Skin's Fit: the derelict hull shell refits itself
  // between visits. Two-visit state, the morph, the fitter's hands (tool marks
  // and work log on the fourth scan) and the codex page are the follow-up batch.
  {
    id: 'SP2-167',
    kind: 'anomaly',
    title: 'The Empty Skin\'s Fit',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The empty skin — a complete hull shell, no internals — has been refitted between visits: sized small last time, sized large now. It is fitting itself to whoever keeps looking. The third visit it is exactly your hull, door open, one note inside: NEARLY. KEEP GROWING. The fourth scan finds tool marks and a work log. Someone is doing the fitting.',
    },
    followup: 'two-visit hull-class state on poi_charon_empty_skin + dressing morph (small first, large on return, exact fit on the third, tool marks and a work log on the fourth); flag skin_fits; codex overlay "Keep Growing"',
  },

  // SP1-107 — The Undertow: the marked fog region has a real current and the
  // locals built a culture on it. The curlField force, the tide table and the
  // drift etiquette are the follow-up batch.
  {
    id: 'SP1-107',
    kind: 'anomaly',
    title: 'The Undertow',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'The marked fog region has a real current: everything drifts two WU a second the same direction, all the time. The locals adapted — sails of foil, tide tables posted at the lane mouth, a whole etiquette about who drifts with it and who fights it. Riding the undertow outward is the cheapest freight speed-up in the sector, and everyone pretends it isn\'t.',
    },
    followup: 'curlField.js region force (steady 2 WU/s drift) on the marked fog region; readable tide table at the lane mouth + tide-table NPC as a numbered ambient encounter; drift etiquette barks; riding the undertow outward as the freight speed-up',
  },

  // SP1-036 — The Old Web: a dozen wrecks lashed together by tethers that never
  // rotted; one strand is not dead. The cutting interaction (pre-latched
  // attachment bodies) and the SP1-084 resident are the follow-up batch.
  {
    id: 'SP1-036',
    kind: 'anomaly',
    title: 'The Old Web',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'A dozen wrecks from different decades, still lashed together by dead tethers that never rotted — a physical web hanging in the dark. Cutting one line shifts the load visibly to the others; some of them groan. One strand is not dead.',
    },
    followup: 'numbered selfRegistered encounter with pre-latched attachment bodies (state.combat.attachments seeding precedent); cutting shifts load visibly, a wrong cut drops the whole cluster; the live strand belongs to the SP1-084 resident',
  },

  // SP2-112 — The Verge-Layer's Toll Riddle: a dormant gate wakes ring by ring
  // and asks one question that is a toll. The artifact gate, the weigh and the
  // receipt codex page are the follow-up batch.
  {
    id: 'SP2-112',
    kind: 'anomaly',
    title: 'The Verge-Layer\'s Toll Riddle',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The dormant gate ring wakes one ring at a time and asks, in the interrogative register: "WHAT IS THE MASS OF A DECISION?" There is no correct answer. It weighs your hull, your cargo and your transponder history, then declares you "consistent" or "consistent (concerning)." The ring stays closed either way. The receipt is the prize.',
    },
    followup: 'gate POI interaction: one-ring-at-a-time wake, artifact-in-hold check, hull/cargo/transponder weigh, verdict "consistent" or "consistent (concerning)"; codex page "Gate Receipt, [day]"; Verge standing +3',
  },

  // SP2-018 — The Manifest That Reads You: hail the weigh-slip buoy broke and
  // blank and it returns your registry with INTENT: PENDING. The contactHail
  // variants file (contactHail.js was dirty at debate time) and Hale's mail row
  // are the follow-up batch.
  {
    id: 'SP2-018',
    kind: 'anomaly',
    title: 'The Manifest That Reads You',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'Hail the weigh-slip buoy with an empty hold and nothing to your name and it returns your own registry block — every field already filled in, including one the registry does not track: INTENT: PENDING. Ten seconds later it files the reading as a survey and thanks you for cooperating.',
    },
    followup: 'hail-response variants in a NEW data file on the contactHail seam (contactHail.js was dirty this sitting); gate on empty hold + 0 credits; flag weighslip_intent + Concord records note; mail.js row from Hale: "Buoy T-9 filed an intent reading on you. Standard. Ignore it. I ignore mine."',
  },

  // SP2-022 — The Lighthouse That Blinks in Code: the Seam-Light's idle blink is
  // a repeat-count pattern; the primer decodes it to a free unfiled claim. The
  // cadence data, claimableBodies row and primer purchase are the follow-up
  // batch (honed to data+glue at debate).
  {
    id: 'SP2-022',
    kind: 'anomaly',
    title: 'The Lighthouse That Blinks in Code',
    sectors: ['sector_haumea_rift'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'The Seam-Light\'s worklights blink while idle, and the blink is not idle: held under a passive scanner for thirty seconds it resolves as repeat-count pattern — a claim number, decodable against the primer any mining station sells for five credits. A real, free, unfiled claim on a body in this sector. The previous holder line reads: FORFEITED — DO NOT ASK.',
    },
    followup: 'blink cadence as data rows + claimableBodies row (one real, free, unfiled claim) + 5 cr claim-office primer purchase (barContacts offer pattern); previous-holder line "FORFEITED — DO NOT ASK"',
  },

  // SP1-095 — The Scale: a ring of worked stone that projects your exact cargo
  // value, honest to the credit. The live cargo read and the rim's carved wrong
  // theories are the follow-up batch.
  {
    id: 'SP1-095',
    kind: 'anomaly',
    title: 'The Scale',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'A ring of worked stone — actual stone, ancient — projects a number above your hull as you pass through: your exact cargo value, honest to the credit. Locals have carved their whole history of guesses around the rim. Everyone is wrong about what it means. It means exactly what it says.',
    },
    followup: 'numbered ambient encounter on the stone ring reading live cargo value (director cargoValue() seam) projected as a number above the hull; uniqueOnce per hull-mass bracket; the rim\'s carved wrong theories as the codex entry',
  },

  // SP2-025 — The Corridor Pin That Moved: Pin 44-C drifted, someone chalked the
  // correction, the fine was paid twice. The visit-count offset and the chalk
  // scan (Concord +1) are the follow-up batch.
  {
    id: 'SP2-025',
    kind: 'anomaly',
    title: 'The Corridor Pin That Moved',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'Corridor Pin 44-C has drifted a few WU off its charted spot, and someone has chalked a correction arrow on it pointing back at the chart, with a note: PIN FINE PAID. TWICE. The beacon chirps in the customs REF 44-C cadence now.',
    },
    followup: 'pin placement offset as f(visit count) on poi_helios_lane_pin, third visit at least one in-game day apart; chalk-note scan copy in discoveryPresentation; Concord +1 on the first chalk scan ("self-reported infraction, credited")',
  },

  // SP2-192 — The B8 Coordinates Bloom: chained off the B8 thread — the receipt
  // is the verified communicator-found event that opens the helix audit; the
  // stand-there-with-communicator reveal and "The Photograph" codex page are the
  // follow-up batch.
  {
    id: 'SP2-192',
    kind: 'anomaly',
    title: 'The B8 Coordinates Bloom',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'receipt', event: 'salvage:communicatorFound' },
    channel: 'memory',
    payload: {
      text: 'The B8 manifest coordinates never resolve — unless you stand in the right spot with the salvaged communicator in hold. Then they resolve all at once: a bloom of Helix variance pings, every one pointing at a patch of space that is, by every instrument, exactly one hull-sized hole in the universe. The Tessera was there when the audit filed it. The file was never wrong. The file was a photograph.',
    },
    followup: 'coordinate POI reveal at the manifest\'s unresolvable point, gated on standing there with the salvaged communicator in hold (chained from the B8 helix audit, story_b8_helix_audit); flag b8_resolved; codex page "The Photograph"; Helix standing +3',
  },

  // SP2-138 — The Scale Zero Rock: one seeded rock per save reads mass 0.0 and
  // pulls heavy anyway; a void stasis crate older than the charter. The seeded
  // flag, massline override and discontinued commodity page are the follow-up
  // batch.
  {
    id: 'SP2-138',
    kind: 'anomaly',
    title: 'The Scale Zero Rock',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    payload: {
      text: 'The scanner insists one rock in the deep field has no mass. The massline insists otherwise — it pulls heavy. Inside: a void stasis crate, mass-canceled, older than the charter, stamped with a Verge-Layer interrogative glyph: WHAT WAS STORED HERE? (ANSWER WITHHELD). It holds one unit of a commodity that no longer exists on any market.',
    },
    followup: 'one seeded rock per save flagged for a mass-0.0 reading; massline mass-override (pulls heavy); interior as a void stasis crate with the Verge-Layer glyph "WHAT WAS STORED HERE? (ANSWER WITHHELD)"; one unit of a discontinued commodity (codex-only page) whose page rewrites with the sale date when sold to an Archive berth',
  },

  // SP3-127 — The Echo Wreck: one hull in the Cruiser Graveyard replays its
  // final minute in light only, on a clean sixty-second cycle. Lamp-bus envelope
  // rows on the wreck package are the data leg.
  {
    id: 'SP3-127',
    kind: 'anomaly',
    title: 'The Echo Wreck',
    sectors: ['sector_io_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Io Reach watch',
      text: 'One hull in the Cruiser Graveyard replays its final minute in light only — window rows and lamp channels: a scan sweep, a panic of strobes, a blackout walking bow to stern — then holds dark forty seconds and starts over, on a clean sixty-second cycle. Sensors insist the hull is cold. The Archive pays for the recording.',
    },
  },

  // SP2-039 — The Forty-First Hull: the Listening Field amends its count mid-
  // scan; the difference is always you. The transit counter and the Quiet's
  // respect are the follow-up batch.
  {
    id: 'SP2-039',
    kind: 'anomaly',
    title: 'The Forty-First Hull',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The Listening Field\'s board amends itself mid-scan: FORTY-ONE REGISTERED. FORTY-TWO OBSERVED. THE DIFFERENCE IS ALWAYS YOU. It has been counting you the whole time. The Quiet respect a fellow bookkeeper.',
    },
    followup: 'tracked session counter of hull transits past the player\'s position in-sector gating the Listening Field scan copy; flag counted_counted; Quiet standing +1; codex overlay resolves the Quiet count',
  },

  // SP2-140 — The Counterfeit Beacon: a pirate lure that copied the wrong hull —
  // one the pilot has personally docked beside, alive. The drifting-bearing
  // scanClue and the writ premium are the follow-up batch.
  {
    id: 'SP2-140',
    kind: 'anomaly',
    title: 'The Counterfeit Beacon',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'receipt', event: 'distress:call' },
    channel: 'memory',
    payload: {
      text: 'A distress call on the irradiated floor with a bearing that drifts one WU every ten seconds — a pirate lure, and a bad one: the recording\'s hull number belongs to a ship you have personally docked beside, alive, at Kepler Scar. The pirates copied the wrong hull. Arrive armed, scan first, and their own beacon becomes their trial record.',
    },
    followup: 'pirate-lure distress whose bearing drifts 1 WU per 10 s via the scanClues stale/contradicted pattern; the copied hull number belongs to a hull the player has docked beside at station_kepler_scar; spring it backward (arrive armed, scan first) → the beacon becomes the pirates\' trial record; hunters\'-exchange writ premium + the real owner\'s one-line thanks mail with a standing 5% market discount',
  },
];
