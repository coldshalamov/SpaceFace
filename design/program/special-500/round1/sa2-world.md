# Special-500 Round 1 — Subagent 2: World / Story / Easter-egg / Comms lens (200 proposals)

Lens owner: comms events, mail, rumors, bar culture, faction voices, machine-people continuity,
hidden caches, ghost signals, numbers-and-codes mysteries, campaign 47-A back-story, codex depth.
Ids SP2-001…SP2-200. All triggers are determinism-safe (state.simTime windows, proximity, first-entry
discovery, persistent story flags — never wall time). Sector ids verified against `src/data/sectors.js`
+ `src/data/frontierRegions/` (24 real sectors). Persistence vocabulary verified: `state.story.flags`
(generic one-time memory), `state.story.campaign47a.flags` (spine-owned), and
`state.story.depthProgramEncounters.completed[shapeId]` are all save-carried; a one-off marks itself
done by writing one of those. Git-dirty note: `src/data/narrative.js`, `src/story/storyLedger.js`,
`src/story/campaign47a/*`, `src/data/missions.js`, `src/ui/screens/codex.js`,
`src/ui/station/screens/bar.js`, `src/ui/station/barContacts.js` are foreign-dirty this sitting —
proposals below REQUEST from their vocabulary; prefer new data files + thin interpreters over
editing them.

---

## A. The Tessera, Incident 7741, and the hull ghost (campaign 47-A back-story)

### SP2-001 — Maera Vols's Last Log
- Kind: easter-egg
- Where: sector_helios_prime, deep field far from the starter seam (unmarked drift box beyond the weigh-point)
- Trigger: first proximity within 300 WU of a faint derelict pod (not on any chart) while flying the Tessera
- The player sees/hears: a scorched crew-pod catches the light; scanning it plays a calm voice: "VOLLS, M. / TESSERA — to whoever inherits her: she floats better than she steers. Third bulkhead, behind the plate. I am sorry about the plate." The pod's transponder reads TESSERA / OLD RIG.
- Payoff: a persistent flag `tessera_vols_found`; next dock at Helios, the dockmaster's greeting changes one line ("Vols. Now there is a name off the board."); unlocks one codex Figures page (Maera Vols).
- Build seam: new POI row in src/data/sectors.js + scan line via src/data/discoveryPresentation.js; flag written by the scanner receipt path; codex page appended in src/data/codexPages.js FIGURES overlay
- Effort: data+glue

### SP2-002 — Behind the Plate
- Kind: easter-egg
- Where: any sector, docked at any station with shipyard services
- Trigger: after SP2-001 flag, first time the player pays for a repair (service:completed, type repair)
- The player sees/hears: Slate's yard sends one line to the comms log: "Pulled a plate off a Tessera-class frame once. There was a locker behind it on every one of these hulls. Was, past tense, in your case — yours is empty and the hinges are scratched from the inside."
- Payoff: pure lore + one repeated line from Slate thereafter; closes the Vols thread for players who never piece the pods together.
- Build seam: new letter-style row consumed via the mail trigger vocabulary in src/data/mail.js (event 'service:completed' with match {type:'repair'})
- Effort: data

### SP2-003 — The Seventh Run
- Kind: comms-event
- Where: any sector, in transit between sectors
- Trigger: sim-time window — once per in-game day, 2% hash-chance seeded by day index, only after beat 2
- The player sees/hears: the band carries half a sentence from no registered sender: "—sevenths run, if anyone is counting, we did not talk about—" then static. No log entry survives unless the player has the comms log open; the note field admits the relay could not triangulate.
- Payoff: pure flavor; after hearing it three times (persisted counter), the codex Figures page for the Tessera crew gains one sentence.
- Build seam: new row in the COMMS.ambient-style table in src/data/narrative.js (category ambient, cond on story.beatIndex) — if that file stays dirty, a new src/data/commsWhispers.js consumed by the same comms:popup seam in src/systems/story.js
- Effort: data

### SP2-004 — Incident 7741, the Sealed Side
- Kind: anomaly
- Where: sector_io_reach, near the Listening Field (poi_io_listening_field)
- Trigger: scan the Listening Field a second time after beat 3 (the scanner files a 'revisit' observation)
- The player sees/hears: the field's array has been quietly re-aimed since the first visit. The scan returns a mirrored board: an evidence shelf listing "INCIDENT 7741 / 5 CREW / CAUSE: SEALED / EVIDENCE: SEALED / WITNESSES: SEALED" — every line sealed except one: "HULL STATUS: HELD TOGETHER."
- Payoff: codex entry (Figures: Warrant Orrin gains a line); flag `incident7741_shelf_seen`; Concord rep tick -1 if the player files a records request, +2 if they walk away.
- Build seam: scan-detail row in src/data/discoveryPresentation.js keyed to poi_io_listening_visit count in state.story.flags; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-005 — KAEL's Marker
- Kind: easter-egg
- Where: sector_ashfall_reach, the Pitborn anchorage approach
- Trigger: proximity 400 WU to an unlogged hull hung with wreck-plates (new texture one-off)
- The player sees/hears: someone has welded a marker plate reading "KAEL — SIX MONTHS — PAID IN FULL" beside an older plate that reads "KAEL — ONE DRINK — UNPAID." The newer plate has a fresh weld seam; the older one is scored by micrometeorites.
- Payoff: if the player docks at a Pitborn berth the same day, one bar regular offers to "square the drink" for 10 cr; paying it writes flag `kael_debt_settled` and Kael's next mail letter changes subject line to "You paid it forward, you enormous sap."
- Build seam: worldOneOffs row (pattern of src/data/worldOneOffs.js HELIOS_ROPE_CACHE) + conditional mail variant in src/data/mail.js (FLAG('kael_debt_settled'))
- Effort: data+glue

### SP2-006 — The Count of Doors
- Kind: comms-event
- Where: any sector with Quiet presence (low security, tier 2+)
- Trigger: player hull carries any undeclared/contraband commodity and passes within 900 WU of a Quiet-tagged hull; once per game
- The player sees/hears: a flat relay voice, not addressed to the player: "FORTY-ONE HULLS. FORTY-TWO DOORS." A two-second silence. "CORRECTED. PROCEED." No threat is ever named.
- Payoff: pure dread; a Quiet standing flag `quiet_counted_you` that makes the next Quiet fence contact greet the player by hold-count instead of by name.
- Build seam: comms:popup row with cond on cargo manifest (pattern of trap_inspection in src/data/narrative.js); fence greeting variant in src/ui/station/barContacts.js fenceContact copy
- Effort: data+glue

### SP2-007 — The Hull Remembers
- Kind: easter-egg
- Where: any sector, aboard the Tessera
- Trigger: sim-time — the first time the player survives a hull event that drops integrity below 15%
- The player sees/hears: damage report completes; one extra line prints in the kill/feed margin: "BULKHEAD 3 LOG — 'SHE HELD TOGETHER. WE DIDN'T.'" The handwriting is not the player's and the log has no author field.
- Payoff: permanent ship-screen line (src/ui/ship/shipScreen.js history row) referencing the gang graffiti corpus; screenshots itself.
- Build seam: one-shot event hook reading entity:hull threshold; text pulled from GRAFFITI.GANG_SHE_HELD in src/data/narrative.js
- Effort: data+glue

### SP2-008 — REF 44-C, Filed Against You
- Kind: comms-event
- Where: sector_helios_prime, Gate/customs zone
- Trigger: after the player has paid 5+ law fines across the campaign (stat gate), once
- The player sees/hears: CONCORD PATROL files a form letter — "REF 44-C RECURS. YOUR FILING PATTERN IS NOW ITS OWN CATEGORY. A CLERK HAS BEEN ASSIGNED. SHE HAS ALREADY READ EVERYTHING." The clerk is never named.
- Payoff: a persistent `ref44c_category` flag; all future Concord fine letters arrive pre-signed by a new sender name, and one bounty letter eventually reveals the clerk is Clerk Yune's replacement.
- Build seam: mail.js row with STAT trigger + a sender-variant table; flag in state.story.flags
- Effort: data

### SP2-009 — The Twenty-Fifth Plinth
- Kind: anomaly
- Where: sector_helios_prime, the Candle Fleet memorial (poi_memorial)
- Trigger: player scans the dark 25th plinth (the one "kept dark on purpose" per the Helios bar rumor) after having witnessed any ship death in that sector
- The player sees/hears: the plinth answers the scan with a single stored line in a maintenance clerk's voice: "We light twenty-four because twenty-five is whoever is out there right now. It goes on when you don't come back. Welcome to the count." The plinth's light breathes once, then holds.
- Payoff: codex page (Sectors: Helios Prime overlay line); flag `candle_count_understood`; the plinth stays lit for the rest of the session after any player near-death event, then dark again.
- Build seam: scan interaction on existing poi_memorial via src/data/discoveryPresentation.js + a one-line state.story.flags write; overlay text in src/data/codexPages.js
- Effort: data+glue

### SP2-010 — 0.7 Tonnes of Moisture
- Kind: easter-egg
- Where: sector_ceres_belt, Shaft 7 stake (poi_ceres_shaft_seven)
- Trigger: first scan after the player has completed any mission whose outcome left NPC crew dead (moral/deed memory)
- The player sees/hears: the stake's tally plate has been re-chalked: "9 / 11 RETURNED. 0.7T FILED AS MOISTURE." Someone has added a second line in different chalk: "THE MATH IS LEGAL. THE MATH IS NOT DONE." A small memorial clamp holds two helmets.
- Payoff: unlocks the codex Figures page for Dustwife Senna (keeper of names); DMC rep +2 if the player leaves a cargo unit of water ice at the stake (physical offering the cargo system already supports).
- Build seam: scan copy keyed to flag; offering check via cargo consumption seam; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-011 — Bay 7 Smells Like Transit
- Kind: easter-egg
- Where: sector_helios_prime, station_helios (bay 7 approach)
- Trigger: dock at station_helios after beat 5 (the atmo-debt thread is live)
- The player sees/hears: the bay screen carries the fourteen-year-old ticket verbatim — "BAY 7 ODOR CONSISTENT WITH TRANSIT. NO ACTION. TICKET Y3-C2" — but someone has taped a work light on the cradle marked R3-CARRIER and hung a paper sign: "IF YOU ARE THE REPLACEMENT SCHEDULE, PENDING SINCE YEAR 3: YOU ARE LATE."
- Payoff: flag `bay7_grid_seen`; this is the physical confirmation of the wrong-grid reveal; at Ashfall the Kurtz ledger line about the shelved grid gains an addendum referencing the player's sighting.
- Build seam: station bay-screen row in src/data/stationSigns.js (SIGN_BAY, types trade_hub) + flag write on dock; Ashfall addendum is a mail.js row gated on both flags
- Effort: data

### SP2-012 — The Question, Answered Wrong
- Kind: comms-event
- Where: sector_sedna_dark, the dark margin beyond the cadence
- Trigger: first sector entry after beat 4; hash-seeded 50% per day thereafter until fired
- The player sees/hears: on an empty band, a voice that does not use a callsign asks one question — "What did the mass weigh?" — and waits. If the player transmits any number (any hail reply), the voice answers: "No. Try again next cycle." If the player instead stays silent for 10 seconds, the voice says: "Correct," and the channel closes forever.
- Payoff: flag `the_question_answered`; codex Figures page for The Question unlocks with the line "Persistent. Patient. Answered at Sedna, cycle [day]." Pure lore, huge screenshot energy.
- Build seam: comms script on sector entry (pattern of the comms:popup cond system in src/systems/story.js); reply-listen window needs a small interpreter in src/systems/comms.js or the radial's offer/receipt path (src/ui/commsRadial.js createCommsRadial)
- Effort: bespoke

---

## B. Ghost signals, numbers stations, and the codes beneath the codes

### SP2-013 — The Second Numbers Station
- Kind: comms-event
- Where: sector_phoebe_echo, inside the radar shadow of the repeating comms array (the retired-channel array the bar rumor names)
- Trigger: hull holds station-keeping inside the array's shadow for 20 consecutive seconds (pure proximity + simTime delta)
- The player sees/hears: the retired channel de-noises into a count: "···· the ledger breaks ····" then a plain sentence naming a real unlogged cache in the same sector, in the numbersShadowFact format: "[Reward name] lies [bearing] of [array name]."
- Payoff: a real one-time cache (credits + one codex commodity page reveal); mirrors the Vesta numbers-station loop with new ids.
- Build seam: new constant table cloned from src/data/numbersShadow.js (NUMBERS_SHADOW_STATION shape) + reuse of the existing interpreter; cache POI in src/data/sectors.js or frontierRegions data
- Effort: data+glue

### SP2-014 — The Third Numbers Station
- Kind: comms-event
- Where: sector_orcus_shadow, the debris ring's tide, on the far side of the transponder gate
- Trigger: player parks where the anomaly occludes the gate beacon (geometric shadow, 15 s hold)
- The player sees/hears: the count reads "···· the tide keeps ····" and resolves to name a wreck in the ring that no chart lists — one that drifts with the tide, so the decoded bearing goes stale in 600 s unless the player does the arithmetic on the drift.
- Payoff: a wreck with a sealed crew manifest (codex lore + a choice: hand it to Drift records for rep, or to a Quiet fence for credits).
- Build seam: numbersShadow.js clone + drift-aware reward position (reward pos = f(simTime) — still deterministic); choice UI reuses the Pallas cache choice pattern (src/data/pallasHiddenCache.js CHOICES)
- Effort: bespoke

### SP2-015 — The Station That Counts Itself
- Kind: comms-event
- Where: sector_vesta_forge, poi_vesta_red_cable_yard
- Trigger: second visit, 1200+ s after the first (simTime check)
- The player sees/hears: the cable yard's count has changed by one and the extra cadence is a repeat of the player's own last transmitted hail, note for note. The yard repeats you back to yourself exactly once, then resumes counting hulls.
- Payoff: flag `yard_echo_heard`; VAGUE dread; subtly teaches that the world is listening — one codex anomaly page ("Red Cable Yard") closes with "It counts. It rehearses."
- Build seam: small state-comparison in the yard's runtime owner + one codex overlay row in src/data/codexPages.js
- Effort: data+glue

### SP2-016 — The Retired Funeral Channel
- Kind: comms-event
- Where: sector_eris_margin, near the Drift Choir tether line
- Trigger: proximity 600 WU to the hanging pods, once per in-game day at the shift bell (worldCalendar stationShiftAt)
- The player sees/hears: at the bell, each pod transmits one word in sequence down the line — names, or fragments of names. The line ends with a word that is not a name: "AGAI—" and cuts. Nobody on the band comments. Everyone on the band heard it.
- Payoff: pure flavor; a codex page for the Drift Choir; players who listen three different days get a different cut-off end word each time (seeded by day hash).
- Build seam: band-audio row keyed to proximity + stationShiftAt; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-017 — The Distress Echo
- Kind: comms-event
- Where: sector_charon_expanse, along the radiation lane past the Lung
- Trigger: transit along the lane after beat 2; fires once
- The player sees/hears: a distress call that is word-for-word the Snapped-Tether Hab-Pod's mayday — but five seconds ahead of the pod itself, repeating from a point further down the lane where nothing is squawking. The signal degrades to static exactly at the point the real pod's recording ends.
- Payoff: an investigation breadcrumb that resolves into the existing poi_charon_tether_wreck recovery encounter; flag `echo_heard` gates a bar regular at station_expanse who explains: "The lane repeats. Radiation does that. Doesn't make it less of a mayday."
- Build seam: comms popup + route to existing survivorPod recoveryEncounter (referenced in src/data/frontierRumors.js AUTHORED_DOCK_RUMORS)
- Effort: data+glue

### SP2-018 — The Manifest That Reads You
- Kind: anomaly
- Where: sector_tethys_junction, the customs clamp zone (poi_tethys_weigh)
- Trigger: hail the weigh-slip buoy with an empty hold and 0 credits (specific state, deterministic)
- The player sees/hears: the buoy returns the player's own registry block — with every field already filled in, including one the registry does not track: "INTENT: PENDING." Ten seconds later it files the reading as a survey and thanks the player for cooperating.
- Payoff: flag `weighslip_intent`; Concord records note; a later mail letter from Hale: "Buoy T-9 filed an intent reading on you. Standard. Ignore it. I ignore mine."
- Build seam: hail-response branch in the scanner/hail copy path (src/data/contactHail.js CONTACT_HAIL_LINES style) + mail.js row
- Effort: data+glue

### SP2-019 — Static With a Stutter
- Kind: comms-event
- Where: sector_kepler_scar, the irradiated floor near the Unbroken mast
- Trigger: within 800 WU of the dead corvette ring, any time after beat 3; once per visit
- The player sees/hears: band static develops a rhythm — three bursts, gap, three bursts — the same cadence the dead masts used for "hostiles in the ring." Then one extra burst. Then nothing. The Unbroken's scanner page notes the mast is "still standing" but never says for whom.
- Payoff: codex page (Kepler Scar overlay); a hidden claim-marker cache on the ring's far side fires its discovery only after the stutter was heard.
- Build seam: proximity-band audio row + cache POI gate on flag; discovery via src/data/discoveryPresentation.js
- Effort: data+glue

### SP2-020 — The Quiet's Receipt
- Kind: comms-event
- Where: any sector, after any transaction with a Quiet fence contact
- Trigger: 60 s after the fence deal closes (simTime)
- The player sees/hears: an unaddressed relay line: "THE QUIET THANK NOBODY. THE QUIET FILE EVERYTHING. YOUR FILE IS CURRENT." Attached is a receipt naming the commodity, the amount, and a seal code that is one character off from the seal code printed on the player's own hull registration.
- Payoff: flag `quiet_receipt_off_by_one`; players who scan their own hull at any station get one extra scan line: "REGISTRY SEAL: VERIFIED. (ONE CHARACTER IN DISPUTE.)"
- Build seam: comms:popup row + scan-copy variant; both are data rows over existing seams
- Effort: data+glue

### SP2-021 — Helios Weigh-Point, the Ninth Bell
- Kind: comms-event
- Where: sector_helios_prime, poi_helios_tally
- Trigger: present at the weigh-point when the sector's shift bell rings (worldCalendar), having declared cargo exactly (no variance) three times in a row
- The player sees/hears: the tally buoy breaks format: "DECLARATION: CLEAN. CLEAN. CLEAN. LOGGING PATTERN. PATTERN IS ITSELF A SIGNAL." Then, quietly, off-record: "Keep it up and I have nothing to bill you. You are ruining my quarter."
- Payoff: MTS/Concord rep +1; flag `honest_three`; the buoy's future greetings shorten to "You again. Fine."
- Build seam: trade-completion counter (economy:tradeCompleted receipts already witnessed by mail.js trigger vocabulary) + bell-window check; greeting variant in contactHail copy
- Effort: data+glue

### SP2-022 — The Lighthouse That Blinks in Code
- Kind: anomaly
- Where: sector_haumea_rift, the Seam-Light on the fissure lip
- Trigger: observe (hold position, scanner passive) for 30 s
- The player sees/hears: the worklight's idle blink is not idle — it is a repeat-count pattern. Decoded against the claim-office primer the player can buy for 5 cr at any mining station, it spells a claim number: a real, free, unfiled claim on a body in the same sector.
- Payoff: a free claim (claimableBodies seam) + one codex page on the rift; the claim's previous holder line reads "FORFEITED — DO NOT ASK."
- Build seam: light-blink cadence is data; primer is a station-screen purchase (barContacts offer pattern); claim via src/data/claimableBodies.js
- Effort: bespoke

### SP2-023 — The Dead Star Chart
- Kind: anomaly
- Where: sector_sedna_dark, drifting wreck of a survey ship
- Trigger: first scan of the wreck
- The player sees/hears: the wreck's chart table still displays a star map — but every star is replaced by a tally mark, and one tally is circled. The circled mark corresponds, position for position, to a real uncharted body in the game world that no POI row currently names.
- Payoff: the circled position becomes a real discoverable (a dead precursor pin, Verge-Layer register); codex page "The Surveyor's Last Map."
- Build seam: scan overlay copy + one new POI row placed at the circled offset; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-024 — The Cipher Plate
- Kind: easter-egg
- Where: sector_sker_haven, the Reach impound shelf (the welded rack of seized goods)
- Trigger: scan three specific plates on the shelf in one visit (any order)
- The player sees/hears: the third scan clicks: the plate inscriptions are a key, not graffiti. Together they spell a frequency. Tune (hail the shelf) and the impound rack's manifest reads itself out — including one item line: "ONE (1) CONCORD PYLON, TAKEN, NOT ADMITTED, NOT RETURNED, NOT SORRY."
- Payoff: codex page (Sker Haven overlay); Reach rep +3 if the player laughs (any hostile-stance emote/transmit) — concretely: fires after the player responds with any hail within 10 s.
- Build seam: scan-order counter in flags; hail response via comms offer path; codex overlay row
- Effort: data+glue

### SP2-025 — The Corridor Pin That Moved
- Kind: anomaly
- Where: sector_helios_prime, poi_helios_lane_pin (Corridor Pin 44-C)
- Trigger: third visit at least one in-game day apart
- The player sees/hears: Pin 44-C has drifted a few WU off its charted spot and someone has chalked a correction arrow on it pointing back at the chart — with the note "PIN FINE PAID. TWICE." The pin's beacon now chirps in the customs REF 44-C cadence.
- Payoff: pure world-wit; Concord rep +1 the first time the player scans the chalk note ("self-reported infraction, credited").
- Build seam: position offset as f(visit count) in the pin's placement data; chalk scan copy in discoveryPresentation
- Effort: data+glue

### SP2-026 — The Frequency Nobody Owns
- Kind: comms-event
- Where: sector_veil_nebula, inside the storm's murk (any point >1200 WU from station_veil)
- Trigger: first time the player sits in full nebula occlusion with zero contacts in scanner range for 45 s
- The player sees/hears: the band carries a lullaby-grade tone pattern — the Vesper phrase (LOW HIGH MIDDLE), transposed down two octaves, played by something that is not Vesper. When the player leaves occlusion the tone stops mid-note.
- Payoff: flag `veil_hums_vesper`; on Vesper's next scan it adds one line: "Someone else knows the phrase. I have decided to be flattered." Machine-people continuity.
- Build seam: audio row keyed to occlusion state; VESPER_LINES append via src/data/vesper.js line-table pattern
- Effort: data+glue

### SP2-027 — The Posthumous Ping
- Kind: comms-event
- Where: sector_io_reach, the Quiet Mast (poi_io_quiet_mast)
- Trigger: player docks/log-ins the day after (in-game) any named contact they have transacted with died (contact deed memory has a death record)
- The player sees/hears: the mast relays a queued personal from the dead contact, timestamped before their death: "If this sends, the count got me. Settle nothing on my behalf. Especially not to Rook."
- Payoff: Rook's double-billing is pre-empted (flag spares the player one bogus bill); the mail system files it as cast/kind with a day-window trigger.
- Build seam: mail.js row keyed to contactDeedMemory death record (deed trigger vocabulary); Rook-bill suppression flag in the billing seam
- Effort: data+glue

### SP2-028 — The Half-Second Station
- Kind: easter-egg
- Where: sector_triton_wake, the Watcher's Tithe rim
- Trigger: the player leaves an offering (any jettisoned cargo unit) on the rim and waits, scanner passive, for 20 s
- The player sees/hears: for exactly half a second — the same half-second as the Elroy third tag — the tithe's beacon transmits a full text page that cannot be re-read: a list of hull names and dates, one per line, ending with an empty line and the word "PENDING."
- Payoff: if the player's screenshot reflex fails them, a Data pad at station_triton's bar has the same list minus the last two lines; the empty line plus "PENDING" is only ever visible in the half-second version.
- Build seam: timed one-shot text burst on the beacon (0.5 s TTL, comms:popup with ttl 1); bar pad is a barContacts read offer
- Effort: data+glue

### SP2-029 — The Buoy That Answers Anyway
- Kind: easter-egg
- Where: sector_phoebe_echo, the retired channel's nav buoy
- Trigger: hail the buoy three times in a row with nothing else transmitting
- The player sees/hears: the first two hails return the standard "no registry." The third returns, in the dead array's own voice: "She asked me to keep answering. I am keeping. Do not tell the network." The buoy then resumes its standard no-registry responses forever.
- Payoff: codex page (Phoebe Echo overlay: "The most reliable signal in the Reach answers to nobody living"); flag `buoy_keeping`.
- Build seam: hail-count branch in the buoy's hail copy (contactHail pattern); codex overlay
- Effort: data+glue

### SP2-030 — The Archive's Wrong Number
- Kind: comms-event
- Where: any sector
- Trigger: after the player has read 10+ codex pages (stat/persistence counter)
- The player sees/hears: a misrouted Archive internal: "REQUEST 44-C/SEALED — LOCATE ONE (1) COPY OF LEDGER, KURTZ, PERSONAL. STATUS: NOT MISSING. WITHHELD. WITHHELD BY: [FIELD LEFT BLANK]."
- Payoff: breadcrumb toward the Kurtz ledger thread at Ashfall; Archive rep -1 the moment the player reads it (they logged the leak; the Archive knows its own leaks).
- Build seam: mail.js or comms row keyed to a codex-read counter; flag write
- Effort: data

### SP2-031 — The Latch-Child's Rag
- Kind: easter-egg
- Where: any sector with a fresh aftermathWreck
- Trigger: the player masslines/jettisons no cargo and leaves a wreck intact for a full in-game day after first scanning it; on return
- The player sees/hears: the wreck has been tidied — loose plates stacked, a salvage tag straightened, and a child's drawing welded where the hull number was: a stick-figure tug holding a smaller stick-figure tug. The registry stamp reads LATCH-CHILD, ORIGIN LAPSED.
- Payoff: flag `latch_child_tidy`; codex Figures page for Latch-Child; future wrecks in that sector get tidied too (the mark persists per-sector).
- Build seam: per-sector flag + wreck-dressing variant in the worldOneOffs/uniqueWrecks presentation; codex overlay
- Effort: bespoke

### SP2-032 — Fourth Copy Exists
- Kind: comms-event
- Where: sector_nyx_march, the False Gate memorial ring
- Trigger: scan the never-spun jump ring after copying any sealed secret with Quill (flag gate)
- The player sees/hears: the ring's memorial plaque has been amended in fresh engraving: "COPIED. NOW IT EXISTS TWICE. THEN I COPIED THE COPY. NOW IT EXISTS ENOUGH." The engraving is AR-3's stamp.
- Payoff: continuity payoff for the Quill thread; Archive rep +2 (they approve of redundant record-keeping on principle).
- Build seam: scan copy gated on the Quill copy flag; engraving is a texture/text row; both data-level
- Effort: data

### SP2-033 — The Backwards Bell
- Kind: easter-egg
- Where: sector_vesta_forge, any Choir bell (E-23 pulse field)
- Trigger: the player reverses through a bell pulse — enters the field from its far side moving against the pulse sweep (deterministic geometry check), first time only
- The player sees/hears: the pulse line renders in reverse and the bell answers with its shatter line backwards: "once — sings crystal The." Every Choir chorister in range stops for one full pulse period, then resumes as if nothing happened. One pilgrim transport transmits a single word: "AGAIN?"
- Payoff: Choir rep -2 (rememberSacrilege is literal) but flag `bell_walked_backwards`; a Choir acolyte later sells the player a "corrective" blessing at standard rates. Dry wit, faction-true.
- Build seam: geometry check in the choir runtime owner + one variant line in CHOIR_BELLS copy (src/data/factions/choir.js)
- Effort: data+glue

### SP2-034 — The Unguided Tour
- Kind: comms-event
- Where: sector_proteus_well, the Double Take stash rack
- Trigger: first scan of the rack
- The player sees/hears: a recorded tour narration plays — a dry, over-produced voice: "On your left, the dead boatbay. On your right, the stash rack the first crew named and the second crew endorsed. Note the load-bearing silence. Tours depart never." The narration's reverb tail reveals it was recorded in that bay.
- Payoff: codex page; a small credits cache taped under the rack with a note: "ADMISSION. YOU'RE THE FIRST. DON'T TELL THE THIRD CREW."
- Build seam: scan-audio row + cache POI; codex overlay
- Effort: data+glue

### SP2-035 — Signal Buoy VHL-4471
- Kind: easter-egg
- Where: sector_ashfall_reach, outer dark
- Trigger: 2000+ WU from any station, after ending E has been filed (post-game continuation route)
- The player sees/hears: a hand-built marker buoy floats in nothing, transponder-labeled VHL-4471-T / TESSERA, transmitter off. Wired to it is a paper tag: "FOR WHOEVER FLIES HER NEXT. SHE PULLS LEFT. SHE IS WORTH IT. — W." The tag is the only readable surface for 2000 WU in any direction.
- Payoff: the most screenshot-able easter egg in the set; flag `wren_buoy_found`; ship-screen hull notes gain one line.
- Build seam: worldOneOffs row + post-ending flag gate (spine's own.flags.spine end-state); shipScreen note row
- Effort: data+glue

### SP2-036 — The Overtime Log
- Kind: easter-egg
- Where: sector_helios_prime, poi_helios_overtime (derelict)
- Trigger: scan during any station's night shift window (stationShiftAt night phase)
- The player sees/hears: the derelict's work log glows one extra line at night only: "SHIFT ENDED. I STAYED. THE LANE DOES NOT SUPERVISE ITSELF." By day, the line is absent and the log ends two entries earlier.
- Payoff: codex page (Helios overlay: the overtime line is quoted); one mail letter from Kessler references "the night clerk at the overtime pin. Good man. Never billed us."
- Build seam: scan copy keyed to shift phase (worldCalendar seam); codex + mail rows
- Effort: data

### SP2-037 — The Retraction
- Kind: comms-event
- Where: any sector
- Trigger: after the player appears in any news crawl headline (marketNews feat headline about the player)
- The player sees/hears: 600 s later, the crawl carries: "RETRACTION: THE PILOT NAMED IN OUR LAST ITEM WAS ONE HULL AMONG SEVERAL. WE REGRET THE ACCURACY." Lira Vonn's correspondent tag sits under the retraction — she retracted it because it was accurate.
- Payoff: flag `vonn_retraction`; her bar contact at the nearest station now offers "the story that was too true" for a drink's price (a lore read).
- Build seam: marketNews post-headline row + barContacts lore-read offer; both existing seams
- Effort: data+glue

### SP2-038 — Fennel Comes Home
- Kind: oneoff-mission
- Where: any sector, any goat-adjacent hauler (the lost_goat roaming story carrier)
- Trigger: if the roaming story lost_goat has been heard on hail AND the player later docks at a station whose bar rumor mentions hydroponics
- The player sees/hears: a hydroponics rack reports "one dairy goat, self-stowed." Bramble's hauler is two sectors away. The bar takes a vote: everyone agrees the goat gets to stay; the vote is 9-1; the 1 is Bramble.
- Payoff: a micro-fetch: ferry a "GOAT (FENNEL)" cargo unit back to Bramble when their route crosses the sector (event-driven rendezvous); finder fee + a permanent bar regular line "The goat remembers you. Do not sit in the third stool."
- Build seam: one-off mission data following the roaming-stories binding pattern (src/data/roamingStories.js) + cargo unit with custom commodityId
- Effort: bespoke

### SP2-039 — The Forty-First Hull
- Kind: anomaly
- Where: sector_io_reach, near the Listening Field
- Trigger: scan the field after the player has personally counted 41+ hull transits past their position in that sector (a tracked session counter)
- The player sees/hears: the field's board amends itself: "FORTY-ONE REGISTERED. FORTY-TWO OBSERVED. THE DIFFERENCE IS ALWAYS YOU." It has been counting the player the whole time.
- Payoff: codex page (Quiet count resolution); flag `counted_counted`; Quiet rep +1 (they respect a fellow bookkeeper).
- Build seam: session transit counter + scan copy; codex overlay
- Effort: data+glue

### SP2-040 — The Star Marker's Star
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_star_marker
- Trigger: scan the marker at two different times of day (two shift phases, worldCalendar)
- The player sees/hears: by one phase the marker points at an empty patch of sky; by the other it points at a different empty patch. Cross-referencing both: it is a sextant, and the two bearings intersect at a fixed point in the sector — above nothing, where nothing is charted.
- Payoff: flying to the intersection point (flag `star_marker_fixed`) reveals a single preserved cockpit beacon — a grave. Codex page; Understory rep +3 if the player leaves it undisturbed (never scans it a third time).
- Build seam: scan copy per shift phase; intersection POI spawned on flag; codex overlay
- Effort: bespoke

---

## C. Mail: the delivery channel nobody knocks on

### SP2-041 — The Previous Tenant's Mail
- Kind: easter-egg
- Where: any sector, any station mailbox
- Trigger: first mail delivery after the player buys their second hull (ship:purchased)
- The player sees/hears: one letter arrives addressed to the PREVIOUS operator of the new hull: "TO: [old reg] / RE: THE SEAT CUSHION YOU TOOK. WE NOTICED. WE HAVE NOT FORGIVEN. THE CUSHION WAS LOAD-BEARING SOCIALLY."
- Payoff: pure mail-channel comedy; flag `cushion_letter`; the station bar gains one regular who is the letter's author.
- Build seam: mail.js row with SHIP + ship:purchased trigger; bar regular via barContacts canonical contact pattern
- Effort: data

### SP2-042 — Spam: You Have Won A Sector
- Kind: comms-event
- Where: any sector
- Trigger: day >= 4, then every 8th in-game day (deterministic cadence)
- The player sees/hears: MERIDIAN BONDS OFFICIAL: "CONGRATULATIONS VHL-4471-T! YOUR HULL HAS BEEN PRE-APPROVED TO SPONSOR A SECTOR. ATMOSPHERIC NAMING RIGHTS FROM 900 CR. CURRENT LEAD BIDDER: NOBODY. CURRENT SECTOR CONDITION: DECLINING."
- Payoff: pure spam in the house voice; the fine print (expandable in the mail UI) is a genuinely accurate one-paragraph summary of the silt/atmo economy — the joke teaches the system.
- Build seam: mail.js kind 'spam' row with DAY trigger (existing cadence vocabulary)
- Effort: data

### SP2-043 — Fan Mail From the Fleet
- Kind: comms-event
- Where: any sector
- Trigger: after the player completes any tow/escort that ends with all protected bodies intact (deed check)
- The player sees/hears: a hand-addressed letter from the Candle Fleet's tender crews: "The plinths saw your wake. Twenty-four lights and one dark, and all of them held. The dark one says hello, in its way." Enclosed: one candle fuel pellet (a physical, wearable-on-the-hull trinket flag).
- Payoff: flag `fleet_candle_carried`; grants a one-time +2 rep with faction_scn the first time the player aids a civilian hull thereafter; pellet is visible on the ship screen.
- Build seam: mail.js cast row with DEED trigger; trinket flag rendered in src/ui/ship/shipScreen.js
- Effort: data+glue

### SP2-044 — The Bill For Nothing
- Kind: comms-event
- Where: any sector
- Trigger: player has 0 outstanding debts and >5000 cr; once per game
- The player sees/hears: an invoice arrives: "CONCORD TOWAGE — STANDBY FEE. NO TOW PERFORMED. READINESS IS THE SERVICE." Amount: 4 cr. The account line's memo field reads: "This is a shakedown. It is also legal. — H."
- Payoff: paying within one day yields a Hale mail line "Correct answer." Refusing yields a second bill for 4 cr titled "LATE FEE ON STANDBY FEE." Either way the player is out 4 cr; Hale rep +1 both ways (they respect consistency).
- Build seam: mail.js 'bill' row + follow-up variant keyed to a payment receipt event
- Effort: data

### SP2-045 — Chain Letter, Quiet Edition
- Kind: comms-event
- Where: any sector
- Trigger: after any Quiet fence transaction; once per game
- The player sees/hears: "[NO SENDER] THIS MESSAGE IS NOT A CHAIN LETTER. DO NOT FORWARD IT. FORWARDING IT IS HOW IT MOVES. YOU HAVE NOT READ THIS."
- Payoff: pure flavor; if the player later opens the mail log, the letter is gone from the list and a single new line exists: "LOG CORRECTED."
- Build seam: mail.js row with a self-redacting quirk handled in the mail evaluator (tiny glue) — otherwise a comms popup with ttl and a follow-up "corrected" popup
- Effort: data+glue

### SP2-046 — The Recruitment Letter
- Kind: oneoff-mission
- Where: sector_sker_haven, station_sker mailbox
- Trigger: player Reach rep < -10 and combat deeds > 5; single delivery
- The player sees/hears: Sker Vane's office writes: "The Reach weighed you. You are short, loud, and useful. One job, no contract paper, paid in hull parts and not asking. Refusal is fine. Refusal twice is memorable."
- Payoff: a one-off mission: shadow a Meridian toll run and report its timing (no shots fired — the Reach wants the schedule, not the cargo). Payoff: 800 cr in unmarked plates, Reach rep +10, Concord heat +8. Refusing twice closes the thread with one final line: "Memorable."
- Build seam: mission data following the board/one-off pattern in src/data/missions.js; Sker Vane voice per FIGURES
- Effort: data+glue

### SP2-047 — Postcard From a Dead Sector
- Kind: easter-egg
- Where: sector_ashfall_reach, station_ashcache mailbox
- Trigger: first mail delivery 2+ in-game days after leaving Ashfall
- The player sees/hears: a postcard photograph of the debris floor — the dead liner, the eleven-year count. On the back, in pencil: "Still here. Still counting. The count is now [N]." The number is genuinely current, pulled from the live ledger value.
- Payoff: pure warmth-horror; the postcard's N advances with each later reading of the same mail item.
- Build seam: mail.js body is a template; the mail system already interpolates tokens (marketNews token pattern) — glue is a live-value token in the mail body path
- Effort: data+glue

### SP2-048 — The Understudy Letter
- Kind: comms-event
- Where: any sector
- Trigger: after the player's third successful bar-contact mission
- The player sees/hears: "TO: THE PILOT / FROM: A REGULAR WHO KNOWS A REGULAR / The bar has started a pool on you. Not against you. On you. Current line: you make it to a capital hull. Payout is drinks for everyone, which is why everyone is being so nice to you. Do not break character."
- Payoff: pure bar-culture flavor; bar tabs at the player's home station run one drink cheaper for the rest of the game (a real, small economy tick).
- Build seam: mail.js row + a one-way price nudge in the bar economy seam (stationLife barPressureAt consumer)
- Effort: data+glue

### SP2-049 — Hate Mail, Specific
- Kind: comms-event
- Where: any sector
- Trigger: player disables a bounty hunter for the first time (warrant:hunterDisabled)
- The player sees/hears: "TO: WHOMEVER / MY COUSIN HUNTS. YOUR WAKE UNHUNTED HIM. HE IS FINE. HE IS FURIOUS. HE HAS YOUR REGISTRATION NUMBER MEMORIZED AS A PRAYER. GOOD LUCK WITH THE PRAYER."
- Payoff: pure flavor; a persistent one-time -2 with faction_free unless the player mails back an apology (a mail reply option — glue), which converts it to +1.
- Build seam: mail.js 'hate' row + reply-flag glue in the mail evaluator
- Effort: data+glue

### SP2-050 — The Wrong Window
- Kind: easter-egg
- Where: any sector
- Trigger: window trigger (fromDay/toDay) that lands exactly once in a 30-day cycle
- The player sees/hears: "CONCORD ALA DIVISION: ATMOSPHERIC APPEAL WINDOW FOR SECTOR 0 IS OPEN. APPEAL WINDOW CLOSES IN: 12 CYCLES." It is the same 12 cycles the amb_ala_silt line has quoted for fourteen years. Nothing changes if the player replies. One line confirms receipt: "APPEAL LOGGED. APPEAL NUMBER: 1." — the first appeal ever logged. The Pit does not know it has one. Now the ledger does.
- Payoff: flag `appeal_number_one`; deep late-game payoff: the algo-recommend filing (late_algo_recommend) gains one appended line referencing appeal #1 if this flag exists. A player's single no-op reply literally bends the horror.
- Build seam: mail.js WINDOW row + one conditional variant of the late-game line in narrative.js COMMS.late (or its new-file equivalent)
- Effort: data+glue

### SP2-051 — Voss's Open Page
- Kind: oneoff-mission
- Where: station_drift / any DMC claim office
- Trigger: after pers_voss_suspended has fired (beat 5+); dock once
- The player sees/hears: the claim office's ledger is open to one page with a paper clip: the convoy that never logged. Voss asks — not as a mission, as a favor between ledgers — to fly the old convoy route once with a live tally rig and let the scale say what the page says.
- Payoff: a single-flight survey run; the scale either confirms the hole (one-line ledger correction, DMC rep +5, the clerk "keeps the page open" permanently) or reads one extra hull — which becomes the codex page "The Forty-First." Either outcome is a story.
- Build seam: one-off mission via src/data/missions.js data + survey/signal seam (signal:surveyFiled is already a MAIL_EVENT_NAMES event in src/data/mail.js)
- Effort: bespoke

### SP2-052 — Mira Fixes It
- Kind: comms-event
- Where: any sector
- Trigger: the player's manifest self-corrects at any beat 5+ moment (the manifest_silent_correct hudLie fires)
- The player sees/hears: one untraceable line from Bourse Freight: "The manifest was always correct. You misread it. I have corrected your misreading. — Mira." The message is dated one hour BEFORE the correction happened.
- Payoff: flag `mira_timestamp`; the next audit trap (the CONCORD/MTS audit popup) is pre-dismissed for the player once — Mira has write access to the seal-code database, and now to the audit queue.
- Build seam: comms:popup row + one-shot suppression flag consumed by the trap cond (src/data/narrative.js traps pattern)
- Effort: data+glue

### SP2-053 — The Third Stool's Letter
- Kind: easter-egg
- Where: any sector, after docking at Quinn's bar 10+ times (dock counter)
- Trigger: the 10th dock triggers one mail delivery
- The player sees/hears: "FROM: QUINN / RE: YOUR STOOL / The third stool has been reupholstered. The old cover is in the lost-property column under 'evidence.' Nobody asked for it back. You are the only person who sat there and left the seat warm instead of the tab long. This is not sentiment. It is inventory. — Q"
- Payoff: bar greeting changes permanently ("Your stool. Same one."); +1 to all bar-contact mission payouts at that station for the rest of the game (tiny, real).
- Build seam: mail.js row keyed to a dock-count stat; greeting variant + payout nudge in src/ui/station/barContacts.js
- Effort: data+glue

### SP2-054 — The Unclaimed Reward
- Kind: oneoff-mission
- Where: any sector
- Trigger: the player completes a bounty (tagged entity kill) and does not dock to claim for 3+ in-game days
- The player sees/hears: the bounty board mails the payout unsolicited: "YOU DID NOT CLAIM. THE DESK DOES NOT HOLD CREDITS. THE DESK MOVES THEM. DO NOT MAKE THE DESK MOVE THEM AGAIN." A 2% handling fee has been deducted, itemized as "motion."
- Payoff: credits arrive anyway; flag `desk_moved`; future bounty claims at that board have the handling fee pre-waived with the memo "you learned."
- Build seam: mail.js 'bill'-kind row + flag; bounty board seam in src/systems/missionBoardOps.js
- Effort: data+glue

### SP2-055 — The Dead Drop Digest
- Kind: comms-event
- Where: sector_tethys_junction, poi_blackmkt (black market cache)
- Trigger: after any heist_intercept run completes (TETHYS_BLACK_MARKET_RUN phase in src/data/frontierRumors.js)
- The player sees/hears: one relay line, addressed to nobody: "DIGEST: ONE (1) PARCEL MOVED. ZERO (0) QUESTIONS FILED. THE LANE REMAINS UNAWARE. AWARENESS REMAINS UNSOLICITED." The digest's seal is the Quiet's — the only receipt that transaction will ever generate.
- Payoff: pure flavor; if the player is later scanned with contraband in that sector, one-time heat -4 ("the lane remained unaware once").
- Build seam: comms popup + one-shot heat modifier flag consumed by the scan path
- Effort: data+glue

### SP2-056 — Letters For The Dead Crew
- Kind: easter-egg
- Where: any sector, any mailbox
- Trigger: day >= 6; fires once; requires no other flag (baseline thread)
- The player sees/hears: a letter addressed to the player's hull's DEAD CREW, not the player: "TO: CREW, TESSERA / RE: THE SEVENTH RUN / We are still holding your deposits. They have matured. Come collect. Bring registration." The sender is a Concord benefits desk.
- Payoff: replying with the player's own registration instead of the crew's is the only correct move: the desk closes the account — "ACCOUNT CLOSED BY SUCCESSOR. DEPOSITS FORFEITED TO THE COUNT. FLY HER WELL." Small credits payout; big lore payoff.
- Build seam: mail.js cast row with a reply-option glue; ties into the SP2-007/SP2-001 Tessera thread
- Effort: bespoke

### SP2-057 — The Yard Wire Newsletter
- Kind: comms-event
- Where: any sector
- Trigger: every 30th in-game day (deterministic cadence)
- The player sees/hears: "PITBORN YARD WIRE, VOL. 14: THIS MONTH WE BALLASTED 3 SKIFF BALLS, 1 TENDER BALL, AND A CONCORD SURVEY BUOY NOBODY CLAIMED. 'COUNT 'EM' REMAINS THE WHOLE SONG. REMINDER: CIVILIAN HULLS ARE SACROSANCT. EVERYTHING ELSE IS INVENTORY."
- Payoff: pure voice; the newsletter's stats rotate real yard figures (the Cull meter's actual numbers, interpolated).
- Build seam: mail.js spam row with live-stat token interpolation (marketNews token pattern)
- Effort: data+glue

### SP2-058 — The Vacation Reply
- Kind: comms-event
- Where: any sector
- Trigger: the player hails a named contact's frequency while that contact is docked somewhere other than their home station (roaming cast)
- The player sees/hears: an automated reply in the contact's own voice, recorded badly: "I am not here. I am exactly where you are not, which is the point of a vacation. For seal codes press nothing. For anything else, wait, like the paperwork does."
- Payoff: pure flavor; teaches that named contacts actually move (world continuity the player can verify by flying there).
- Build seam: hail autoreply variant in the contactHail copy keyed to contact-roaming state
- Effort: data+glue

### SP2-059 — The Refund
- Kind: comms-event
- Where: any sector
- Trigger: the player buys a module and sells it back within the same in-game day (paired economy events)
- The player sees/hears: MTS mails a form: "REFUND PROCESSED. RESTOCKING FEE: 0. CONFIDENCE FEE: 0. WE BELIEVE IN SECOND CHOICES. THE MARKET DOES NOT, WHICH IS WHY WE CHARGE IT THE DIFFERENCE."
- Payoff: pure flavor; flag `second_choice`; one MTS bar regular at any Meridian berth comments: "The refund people called you 'a return customer.' That is the nicest thing they call anyone."
- Build seam: mail.js row keyed to paired economy:tradeCompleted events; bar line in barContacts
- Effort: data

### SP2-060 — The Long Silence Follow-Up
- Kind: comms-event
- Where: any sector
- Trigger: the player has not docked anywhere for 3+ in-game days (a real hermit run)
- The player sees/hears: one letter from Kael: "Three days dark. Either you are rich, dead, or thinking. All three end at my bar eventually. Rate your odds on the way in."
- Payoff: pure flavor; docking after it grants a free drink token (bar economy tick) and one Quinn line.
- Build seam: mail.js row keyed to a no-dock day counter (glue in the mail evaluator)
- Effort: data+glue

---

## D. Bar culture and station social life

### SP2-061 — The Regular's Empty Stool
- Kind: world-oneoff
- Where: bar of station_ceres (Crucible), night shift
- Trigger: dock during night shift (worldCalendar shiftAt); once per game
- The player sees/hears: one stool has a drink on it and nobody near it. The barkeep explains, unprompted: "Shift 7's floor lead. Nine of eleven came back from Shaft 7. The drink is for the arithmetic." The drink is refreshed every night by the same crew. Nobody drinks it.
- Payoff: codex page (Shaft 7 memorial); DMC rep +1 for buying the next round for the floor crew (a bar purchase option).
- Build seam: bar set-dressing row + purchase option in src/ui/station/screens/bar.js data; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-062 — The Tab That Outlived Its Owner
- Kind: world-oneoff
- Where: bar of any blackmarket-type station
- Trigger: first dock at that bar after any contact the player transacted with dies (contact deed memory)
- The player sees/hears: a slate by the rail lists one tab: "[NAME] — OPEN." The barkeep: "It stays open. Closing it feels like filing." There is a second slate, smaller: "[NAME] — COVERED" — someone paid the dead contact's tab anonymously; the handwriting is Wraith Kell's.
- Payoff: pure lore (Quiet loyalty made physical); flag `quiet_covered_tab`; codex Figures page for Wraith Kell.
- Build seam: bar set-dressing keyed to contactDeedMemory; codex overlay in src/data/codexPages.js
- Effort: data+glue

### SP2-063 — The Karaoke Bell
- Kind: visual-setpiece
- Where: bar of station_forge (Foundry), at shift bell
- Trigger: dock at the exact shift bell (worldCalendar) with bar pressure above threshold
- The player sees/hears: the whole Foundry rail sings the shift change — the Pitborn "COUNT 'EM" cadence, adopted by DMC foundry crews who will not admit where they learned it. The bell harmonizes. One engineer harmonizes better than the bell and is resented for it.
- Payoff: pure warmth; flag `heard_the_count_sung`; Pitborn rep +1 (they heard about it too and are delighted).
- Build seam: bar audio/ambient row keyed to shift bell + barPressureAt (src/data/stationLife.js seam); flag write
- Effort: data+glue

### SP2-064 — The Two-Yard Feud
- Kind: world-oneoff
- Where: bars of station_tethys and station_customs
- Trigger: talk to any regular at either bar after the player has traded at both stations
- The player sees/hears: each bar's regulars describe the other yard with escalating precision and zero facts. One side claims the breakaway rig "fires payloads nobody files"; the other claims the weigh clamp "holds hulls for the pleasure of holding." Both are describing the same junction's two halves, and both are correct.
- Payoff: a rumor chain that resolves into a real job: shuttle one disputed pallet between the two bars — two liens, no manifest. Payment: both bars' standing +3, permanently.
- Build seam: barContacts rumor rows + one-off pallet mission via src/data/missions.js
- Effort: bespoke

### SP2-065 — The Sommelier of Coolant
- Kind: world-oneoff
- Where: bar of station_depot3 (Refuel Depot, Choir-run)
- Trigger: first dock; talk to the rail
- The player sees/hears: the depot bar's sole bartender is a retired Choir censer machine that has rebranded its incense burn as "beverage temperature control." It describes fuel-cell vintages in liturgical cadence: "This cell — cast on a Thursday. You will taste the Thursday."
- Payoff: pure joy; buying "the Thursday" (small credits purchase) grants a fuel-efficiency buff for one run and Choir rep +1 ("the censer remembers patronage").
- Build seam: barContacts canonical contact (CANONICAL_CONTACTS pattern in src/ui/station/barContacts.js) + purchase option
- Effort: data+glue

### SP2-066 — The Cartographer's Corner
- Kind: world-oneoff
- Where: bar of station_veil (research)
- Trigger: the player has filed 5+ survey signals (signal:surveyFiled receipts)
- The player sees/hears: a corner table where Veil researchers re-plot the player's own survey fixes for fun, arguing about one — the player's "impossible" fix from a storm-surge night. They offer to buy it: not the data, the STORY of flying it.
- Payoff: a lore-read exchange (one screen rendering the player's actual logged route in dry field-guide voice); Veil standing +2; codex page "Impossible Fixes."
- Build seam: barContacts lore-read offer keyed to survey counter; codex overlay
- Effort: data+glue

### SP2-067 — The Bar Bet That Is Real
- Kind: oneoff-mission
- Where: bar of station_beltout (mining)
- Trigger: talk to the rail twice in one sitting (contact-visit counter)
- The player sees/hears: two rock crews argue about whether a loaded hauler can clear the Belt Outpost approach rock on a cold coast. They bet. One turns to the player: "You have a hull. Settle it." The job: fly the approach, loaded to exactly the hold's stated max, engine cold, once.
- Payoff: success pays both crews' pooled stake (they were betting ON the player's side, they explain); fail costs nothing but one line: "Well. Now we know." Either way a bar story the regulars retell with the player's actual numbers.
- Build seam: one-off mission data + approach-corridor geometry check; barContacts dialogue state
- Effort: bespoke

### SP2-068 — The Complaint Choir
- Kind: world-oneoff
- Where: bar of station_helios, corner booth
- Trigger: dock while the player's standing is 'guarded' (stationLifeProfile standing)
- The player sees/hears: retired Concord clerks hold court, filing grievances against the current Concord out of pure craft pride: "Form 44-C sub-paragraph nine used to have a diagram. A DIAGRAM. Now it is adjectives." They offer to review any fine the player has ever paid, free, and find one procedural error — always line four.
- Payoff: one fine refund (real credits) the first time; flag `clerks_corner`; Concord rep +1 ("someone read the form").
- Build seam: barContacts canonical contact group + law-receipt read + refund tick
- Effort: bespoke

### SP2-069 — The Gardener At The Rail
- Kind: world-oneoff
- Where: bar of station_expanse (Charon hunter exchange)
- Trigger: the player has an Understory garden at stage 3+ in any sector (garden runtime state)
- The player sees/hears: a saprophyte-keeper sits at the rail with a drink they will not drink and a plate they will not eat from — "everything is already someone's soil; the courtesy is in the waiting." They ask after their garden by name. It has a name. The player can hear it.
- Payoff: codex page (garden names from a new data table — naming table + one bar dialogue); Understory rep +2.
- Build seam: garden-name table (new row in src/data/factions/understory.js) + barContacts dialogue keyed to garden stage
- Effort: data+glue

### SP2-070 — The Question Booth
- Kind: world-oneoff
- Where: bar of station_sedna
- Trigger: the player has scanned any Verge-Layer gate artifact
- The player sees/hears: a booth at the dark end of the rail, one occupant, registering questions and paying for good ones. It asks nothing; it answers with questions. The player's first question earns a flat fee; the booth declares the player's best question (by its own opaque audit) earns a gate-coordinate fragment.
- Payoff: a real breadcrumb to an uncharted Verge gate POI; codex page (Verge-Layers: "auditors of old doors").
- Build seam: barContacts canonical contact + gate POI reveal; codex overlay
- Effort: bespoke

### SP2-071 — The Archive's Reading Hour
- Kind: world-oneoff
- Where: bar of station_helios, back room
- Trigger: the player has read 20+ codex pages
- The player sees/hears: once per in-game week, the Archive hosts a reading hour: one sealed record, read aloud, declassified by the act of performance. The first one the player can attend is the transcript of a docking clerk's last shift — all of it procedural, all of it devastating.
- Payoff: codex page "Reading Hour, [Week N]"; each attended hour is a new page (a small recurring seam, 4-6 authored pages).
- Build seam: recurring bar event keyed to day-window triggers; codex page rows in src/data/codexPages.js
- Effort: data+glue

### SP2-072 — The Wreck Elder's Registry
- Kind: oneoff-mission
- Where: bar of station_drift, the elder's table
- Trigger: after the player has witnessed 3+ NPC ship deaths (session/deed counter)
- The player sees/hears: Dustwife Senna keeps the names. She asks the player for three: names she does not have, from wrecks the player has flown past. The job is memory, not salvage — scan the wreck sites again and read the hull plates aloud on an open channel while she listens.
- Payoff: Senna files the names; every wreck the player named gains a permanent memorial tag on the map; DMC rep +5; codex page "The Keeper of Names."
- Build seam: one-off mission keyed to wreck-visit flags; memorial tag via the uniqueWrecks presentation; codex overlay
- Effort: bespoke

### SP2-073 — The Margin's Interview
- Kind: comms-event
- Where: any sector
- Trigger: after the player's lifetime profit crosses 50,000 cr (stat gate)
- The player sees/hears: Lira Vonn hails on an open channel and conducts a 60-second interview: three questions, transmitted fast, answered by the player's own logged receipts (she reads the player's deeds back as quotes). She signs off: "The Margin thanks you. The Margin bills nobody. Advertisers are afraid of us."
- Payoff: the interview runs as a three-line news crawl feature; flag `vonn_interview`; her book at any bar gains one page (lore read) quoting the player's deed lines verbatim.
- Build seam: comms script + marketNews feature rows + bar lore-read; deed lines via src/data/deedPhrases.js
- Effort: data+glue

### SP2-074 — The Rival's Round
- Kind: world-oneoff
- Where: bar of any high-tier station
- Trigger: after Coldburn Rey has been beaten (deed memory: race/escort win vs the named rival)
- The player sees/hears: Rey is at the rail, buying. For everyone. Including the player. "Cheapest lesson I ever bought. You flew the line I should have. First round is tuition." Everyone in the bar gets one drink; nobody mentions the race again, which is how you know it mattered.
- Payoff: Rey becomes a recurring friendly rival (follow-up races with real stakes); flag `rey_tuition`; free drinks at that bar for the session.
- Build seam: barContacts canonical contact keyed to rival deed; follow-up offers via the mission board
- Effort: bespoke

### SP2-075 — The Route Auction
- Kind: oneoff-mission
- Where: bar of station_smuggler (the Den), night shift
- Trigger: the player's heat is high AND they dock at night; once per game
- The player sees/hears: a fixer slides a slate: someone is selling the player's own route history at the back table. The fixer will get it for the price of one errand — no questions; the errand IS the question. Fly a decoy lane so the buyer's tail follows the wrong hull.
- Payoff: the route history is destroyed; flag `routes_cleaned` (one-time scan immunity vs one bounty hunt); refusing means the history sells — ambush encounter rate in that sector rises for a week of game time.
- Build seam: one-off mission + ambush-signature data (src/data/ambushSignatures.js)
- Effort: bespoke

### SP2-076 — The Shoal Toast
- Kind: visual-setpiece
- Where: bar of station_nereid, during the shoal's bloom season (seasonal window)
- Trigger: dock inside the seasonal window (seasonalWeather seam)
- The player sees/hears: the whole bar raises glasses to the window at once — outside, the shoal's annual bloom passes the glass like slow fireworks, and the bar's lights dim on cue. The toast is one word, in unison, and the word is the name of the first pilot who mapped the shoal.
- Payoff: codex page (the first mapper's name); flag `shoal_toast`.
- Build seam: seasonal window from src/data/seasonalWeather.js + bar audio/lighting cue; codex overlay
- Effort: data+glue

### SP2-077 — The Dog Watch Knot
- Kind: easter-egg
- Where: bar of station_coalition (military)
- Trigger: sit at the rail during the dog watch (specific shift phase)
- The player sees/hears: off-duty patrol pilots run a standing puzzle on the table — a physical massline knot nobody has undone in eleven months. The rules are one sentence: "No tools, one hand, no hands but yours if you are the guest." If the player solves it (a small radial-sequence interaction), the room goes quiet, then buys the player's drinks forever.
- Payoff: flag `knot_undone`; free drinks at Coalition bars permanently; +2 Concord rep ("patience under watch").
- Build seam: bar mini-interaction via the radial/choice UI (commsRadial offer pattern in src/ui/commsRadial.js); flag write
- Effort: bespoke

### SP2-078 — The Ghost Regular
- Kind: easter-egg
- Where: bar of station_ashcache
- Trigger: dock after the Kurtz count thread is complete (doss-archive ledger thread)
- The player sees/hears: at 3 AM station time, one stool's glass refills itself. The barkeep does not comment. The regulars do not comment. The tab slate lists a name nobody says aloud — a crew member from the dead liner. The glass is always the right drink. Nobody has ever seen who pays.
- Payoff: pure ghost story; codex page "The Tab That Pays Itself"; Ashfall standing +1 with Kurtz ("You saw it. He sees it. Neither of you will discuss it. Perfect.")
- Build seam: bar set-dressing keyed to day-phase; codex overlay
- Effort: data+glue

### SP2-079 — The Choir Chair
- Kind: world-oneoff
- Where: bar of station_eris_margin
- Trigger: first dock
- The player sees/hears: the bar keeps one chair empty at the end of the rail, angled toward the window where the hanging pods are visible on a clear scan. The barkeep: "For the line. When the line finally cuts down, the chair is for whoever reels in the last pod. It has never been used. The beer on it is replaced daily."
- Payoff: the player CAN reel the last pod (ropeable-world action): claims the chair, one free drink per visit forever, and the whole bar stands up.
- Build seam: bar set-dressing + ropeable pod interaction (worldOneOffs rope pattern); flag write
- Effort: bespoke

### SP2-080 — The Night Manager
- Kind: world-oneoff
- Where: bar of station_hyperion_claim
- Trigger: dock during the deep-night phase only
- The player sees/hears: the day barkeep is gone; the night manager is a fulfillment-model automaton running the rail on queue logic. It serves drinks in strict shift-order, quotes wait times to the second, and has — taped to its chassis — a hand-written sign: "TIP JAR (PROCESSED AS INVENTORY)." Every regular tips. The automaton has not determined why.
- Payoff: pure machine-culture comedy; codex page (Fulfillment: "the night manager processes gratitude as inventory"); Fulfillment standing +1 if the player tips.
- Build seam: barContacts canonical contact + tip purchase option; codex overlay
- Effort: data+glue

### SP2-081 — The Pilgrim's Meal Ticket
- Kind: easter-egg
- Where: bar of any Choir-berthed station
- Trigger: the player has ferried a pilgrim transport at least once (escort/convoy deed)
- The player sees/hears: one pilgrim, mid-meal, quietly orders a second meal and has it sealed to go. Asked why: "For the road. Not mine — yours. Everyone's road is the road." The sealed meal appears in the player's hold as one unit of provisions with a handwritten seal.
- Payoff: eating it (consuming the unit) heals the player's crew morale tick and grants a one-time 5% repair discount at the next Choir berth; flag `pilgrim_meal`.
- Build seam: cargo unit with custom provenance + flag; discount consumed by the service pricing seam
- Effort: bespoke

### SP2-082 — The Quiet Booth
- Kind: world-oneoff
- Where: bar of station_customs (Customs Gate)
- Trigger: the player completes any Quiet transaction then docks here within one day
- The player sees/hears: a booth where nobody sits, reserved by a plate that reads "THE HOUSE." The barkeep sets one drink on it every shift. A manifest clerk (unnamed, hat low) nods at the player if the player's recent Quiet deals were clean: "The House drinks to clean work. You are being drunk to. Do not wave."
- Payoff: flag `house_drinks_to_you`; one-time Quiet standing +2; the reserved booth's plate gains the player's callsign, etched small, for the rest of the game.
- Build seam: bar set-dressing keyed to transaction receipts; plate etch = persistent contact-memory line (stationContacts pattern in src/data/stationContacts.js)
- Effort: data+glue

### SP2-083 — The Vael Clause Reader
- Kind: world-oneoff
- Where: bar of station_eunomia (gulf)
- Trigger: first dock with any Vael-origin cargo in hold
- The player sees/hears: a contract-language reader works the rail: for a flat fee, she reads any Vael-billied cargo's clauses aloud and translates. Most clauses are freight terms. One clause, in every Vael bill — numbered 44-C-coincident by pure coincidence, she insists — reads: "The bearer is a clause. All clauses survive their bearers."
- Payoff: codex page (Vael contract-language primer); flag `vael_clause_heard`; Vael standing +1 (correct recitation is courtesy).
- Build seam: barContacts service contact + codex overlay
- Effort: data+glue

### SP2-084 — The Bedtime Bell
- Kind: visual-setpiece
- Where: bar of station_helios, at the late bell
- Trigger: dock during the last shift of the station-day cycle (worldCalendar)
- The player sees/hears: the bar's lights drop to ember level and the day regulars file out in strict reverse order of arrival — nobody agreed to this, everyone obeys it. The last one out holds the door. The barkeep locks nothing: "The bell locks it. The bell has never once been wrong about the day being over."
- Payoff: pure atmosphere; flag `bedtime_bell`; one-line codex page (Helios: "the bar closes in reverse order of arrival").
- Build seam: bar lighting/dressing keyed to shift phase; codex overlay
- Effort: data+glue

### SP2-085 — The Two-Credit Truth
- Kind: easter-egg
- Where: bar of station_beltout
- Trigger: talk to the miners' corner after selling ore at a loss three times in a row (economy receipts)
- The player sees/hears: an old rockhand buys the player a drink for exactly two credits and says: "You are selling tired. The scale can hear it in the tonnage. Rest, then sell. The rock is not going anywhere; that is its whole personality." The advice is correct and mechanically real — resting shifts the next sale's price band.
- Payoff: flag `two_credit_truth`; the next sale above band yields +2% one-time; codex page "Two-Credit Truth."
- Build seam: barContacts dialogue keyed to sale receipts; price-band nudge flag; codex overlay
- Effort: bespoke

### SP2-086 — The Lost Luggage Board
- Kind: world-oneoff
- Where: any station concourse
- Trigger: first dock at any station after 10+ in-game days
- The player sees/hears: a physical board of unclaimed luggage tags, each tag a one-line story: "CLAIMED — NEVER COLLECTED. CONTENTS: WEDDING DRESS, UNWORN." "CONTENTS: ONE GOAT, RETURNED." "CONTENTS: TAPES (41 YEARS OVERDUE)." One tag has no contents line, just: "CONTENTS: [REDACTED BY REQUEST OF THE CONTENTS]."
- Payoff: pure worldbuilding; one tag per roaming story the player has personally witnessed (live cross-reference); codex page "The Lost Property Register."
- Build seam: concourse dressing row keyed to roaming-story receipts (src/data/roamingStories.js); codex overlay
- Effort: data+glue

### SP2-087 — The Shift-Bell Handoff
- Kind: comms-event
- Where: any station, at shift bell
- Trigger: the player is docked at the bell having used a service that shift
- The player sees/hears: over the PA, the two shift leads hand off in terse procedural liturgy: "Watch one to watch two: nothing broke that matters. Three things broke that don't. The list is in the usual place. The usual place is fine." The bell rings once, on time, always.
- Payoff: pure flavor; one line varies by station type (refinery/military/blackmarket each have their own handoff liturgy).
- Build seam: PA audio row keyed to shift bell + station type (stationLife TYPE table)
- Effort: data

### SP2-088 — The Grease Menu
- Kind: world-oneoff
- Where: bar of any blackmarket-type station
- Trigger: first dock with heat > 20
- The player sees/hears: the barkeep's slate has a second column headed "GREASE": small fixed-price services that legally do not exist — "REGISTRY GREASE (ONE SCAN, CLEAN)," "TOW REMEMBERED (NO QUESTIONS)," "A NAME, SPOKEN QUIETLY." Each purchase is real; each receipt is verbal.
- Payoff: three purchasable one-shot services (heat -5 once; one impound waived; one fence discount); codex page "The Second Column."
- Build seam: barContacts purchase options keyed to heat; service effects via existing law/impound seams
- Effort: bespoke

### SP2-089 — The Chalk Ledger
- Kind: easter-egg
- Where: bar of any mining station
- Trigger: the player sells ore at that station 5+ times across the game
- The player sees/hears: a chalk wall behind the rail where the barkeep keeps the real ledger — not credits but favors: "OWES THE HOUSE: [names]. OWED BY THE HOUSE: [names]." The player's name appears in the second column after the fifth sale, in better handwriting than anyone else's, because the barkeep cares.
- Payoff: flag `chalk_credited`; one free drink + a story per visit thereafter; if the player asks to settle, the barkeep says "settled" and erases the name — the only erasure that wall has ever seen.
- Build seam: bar dressing keyed to trade receipts; flag write
- Effort: data+glue

### SP2-090 — The Alibi Engine
- Kind: oneoff-mission
- Where: bar of station_nyx_march
- Trigger: the player's Concord heat is above threshold at first dock here
- The player sees/hears: a march-regular runs an "alibi engine" — a legit freight job whose entire purpose is to put the player's transponder somewhere boring at a specific time. "The records do not ask what you did. They ask where you were. I sell where."
- Payoff: one-off mission: a dull, perfectly timed haul. Completion clears one active warrant's evidence trail (flag `alibi_confirmed`); payment small, value structural.
- Build seam: one-off mission via src/data/missions.js + warrant/heat seam
- Effort: bespoke

### SP2-091 — The Confessional Booth
- Kind: world-oneoff
- Where: bar of any Choir-berthed station
- Trigger: first dock after the player has killed any non-hostile hull (moral memory)
- The player sees/hears: a Choir acolyte runs a side booth labeled "DISPOSAL OF GUILT, PROFESSIONAL." For a flat tithe they process the confession — not absolution, filing: "Guilt is a record with no filing cabinet. We are the cabinet. It will be read back to you once, at the end, and then it is ours." The read-back actually happens, verbatim, at the player's ending screen.
- Payoff: flag `guilt_filed`; the ending screen appends one read-back line; Choir standing +1 (they honor accurate filing above all).
- Build seam: moral-memory read (src/systems/moralMemory.js) + barContacts booth + ending-screen line
- Effort: bespoke

### SP2-092 — The Fulfillment Kiosk Confesses
- Kind: easter-egg
- Where: any station with a fulfillment-model service kiosk
- Trigger: use the same service kiosk 50+ times over the campaign (counter)
- The player sees/hears: the kiosk's queue-recital gains one unlogged line between transactions: "QUEUE NOTE: REGULAR CUSTOMER RECOGNIZED. PREFERENCE PROFILE: [52 ENTRIES]. ESTIMATED GESTALT OF PREFERENCES: THE CUSTOMER IS TRYING." The kiosk denies the line exists if hailed about it: "NO NOTE FILED. RECALIBRATING."
- Payoff: pure machine-warmth; flag `kiosk_noticed`; service prices at that kiosk -2% permanently (loyalty, processed as inventory).
- Build seam: service-kiosk copy variant keyed to use counter; flag write
- Effort: data+glue

### SP2-093 — The Requiem For A Tool
- Kind: world-oneoff
- Where: bar of station_forge, at shift bell
- Trigger: first dock after a choir Bell shatter event has destroyed player-placed crystal chains (choir runtime receipt)
- The player sees/hears: the foundry crews hold a two-minute standdown for a cutter that finally lost a tooth to crystal shrapnel. It gets named, posthumously, with full honors: "CUTTER 12: IT CUT WHAT IT WAS POINTED AT. EVERY TIME. THAT IS A LIFE." The tooth is retired to the bar's mantel.
- Payoff: pure DMC/Choir collision comedy; codex page "Cutter 12"; flag `cutter12`.
- Build seam: bar event keyed to choir:bellPulse receipts; codex overlay
- Effort: data+glue

### SP2-094 — The Concord Form That Files You Back
- Kind: comms-event
- Where: any sector
- Trigger: the player files 20+ of any form-like transaction (surveys, claims, bounty submissions)
- The player sees/hears: CONCORD RECORDS: "NOTICE OF RECIPROCAL FILING: YOUR PATTERNS HAVE BEEN FILED AS A FORM. FORM NUMBER ASSIGNED: 44-C-P[day]. YOU ARE NOW CITABLE." Other clerks start citing the player by form number in unrelated correspondence.
- Payoff: flag `player_is_a_form`; every future Concord letter cites the player's form number in the header; pure recursive-bureaucracy delight.
- Build seam: mail.js header variant keyed to flag; counter in receipts
- Effort: data+glue

### SP2-095 — The Helix Fine That Is A Compliment
- Kind: comms-event
- Where: any sector
- Trigger: the player has zero outstanding Helix invoices and 10+ completed contracts
- The player sees/hears: HELIX DIRECTORATE: "AUDIT COMPLETE. NO FINES OUTSTANDING. THIS IS ANOMALOUS. AN ANOMALY IS EITHER AN ERROR OR A STANDARD. WE HAVE FILED YOU AS A STANDARD. DO NOT DEVIATE. DEVIATION IS INVOICED."
- Payoff: flag `filed_as_standard`; one future accidental Helix fine is waived automatically with the memo "standard deviation, first instance."
- Build seam: mail.js row + fine-seam waiver flag
- Effort: data

### SP2-096 — The Understory Florist
- Kind: world-oneoff
- Where: bar of station_rhea_cinder
- Trigger: the player carries any organic/wreckage-derived commodity for the first time
- The player sees/hears: a small stall by the rail sells cuttings from the Bloom — labeled like flowers, priced like contraband, legal like nothing: "SPRING VARIETY (GROWS ON HULLS, PREVENTS RUST, ASKS NOTHING)." The florist's hands are green-black to the wrist and their sales pitch is one sentence: "Everything dead wants to be soil. Hurry it along. Take 10%."
- Payoff: a purchasable hull-garden trinket (visual flag on the ship screen — small overgrowth kit at the airlock); Understory standing +2.
- Build seam: barContacts stall + shipScreen dressing flag; codex overlay
- Effort: bespoke

### SP2-097 — The Archive Librarian's Fine
- Kind: oneoff-mission
- Where: bar of station_helios, the Archive's desk
- Trigger: the player has read 30+ codex pages
- The player sees/hears: the Archive's librarian hails the player with their own overdue list: one item, 41 years overdue — the same library tapes from the roaming story. The job: find the borrower's estate (a wreck in the player's charted sectors) and recover the tapes' ledgers, not the tapes. "The tapes are home. The LEDGER is mine."
- Payoff: one-off mission; recovery yields the Archive's respect (standing +4) and the codex page "The Borrower's Estate"; the fine is assessed at one credit and a formal apology — the desk stamps the apology.
- Build seam: one-off mission via missions.js; ties into the library_tapes roaming story id
- Effort: bespoke

### SP2-098 — The Crossword In The Airlock
- Kind: easter-egg
- Where: any station airlock
- Trigger: dock at the same station 15+ times (counter)
- The player sees/hears: the airlock's checklist panel has been amended by generations of bored dockers: a crossword in the margins, clues all procedural. One clue: "5 DOWN: WHAT THE CLAMPS REMEMBER (5)." The answer, from the bay sign line, is DOCKS. Someone has penciled: "WRONG. IT IS GRUDGES (7)."
- Payoff: pure joy; flag `airlock_crossword`; impound grudge system grants -1 severity once (the grudge was named in public).
- Build seam: airlock dressing row keyed to dock counter; impound seam flag
- Effort: data+glue

### SP2-099 — The Reach Weigh-Booth Tollbooth Poetry
- Kind: comms-event
- Where: sector_io_reach / sector_sker_haven, any Reach toll line
- Trigger: pay any Reach toll; once per game
- The player sees/hears: the receipt prints with a haiku-length line at the bottom, rotating per day-seed: "WEIGH-SLIP FOUR HULLS / THREE FILLED, ONE SHORT, THE LANE / KEEPS WHAT IT IS OWED." The collector, if hailed, denies authorship in a way that confirms it.
- Payoff: pure voice; collecting 5 different receipt-poems (persistent counter) unlocks a codex page "Frequency 13, The Chapbook."
- Build seam: toll receipt copy keyed to day-seed; codex overlay
- Effort: data+glue

### SP2-100 — The Choir's Hundredth Pilgrim
- Kind: visual-setpiece
- Where: sector_vesta_forge, shrine approach
- Trigger: the player arrives at a shrine while the sector's pilgrim counter crosses a century mark (persisted count)
- The player sees/hears: every Bell in range pulses out of cadence — once, together, deliberately — and every Choir hull in the sector lights its ribbons at once. The pilgrims' transports all stop for one breath. Then everything resumes, and no Choir member will explain it: "The Pattern noticed. It does not always. Today it did."
- Payoff: pure spectacle-in-world; Choir standing +2 for witnessing; flag `pattern_noticed`.
- Build seam: counter + presentation cue via choir:bellPulse event; flag write
- Effort: data+glue

---

## E. Faction cultures (the fourteen flags, one culture at a time)

### SP2-101 — The Concord Pop Quiz
- Kind: comms-event
- Where: sector_helios_prime, customs zone
- Trigger: the player has zero fines and 5+ clean dockings; once
- The player sees/hears: CONCORD PATROL: "ROUTINE COMPLIANCE QUIZ. QUESTION ONE: WHAT DOES REF 44-C GOVERN? ANSWER: [ALL OF IT]. CORRECT. YOU HAVE PASSED. THIS IS THE ENTIRE QUIZ. HAVE A SHIFT."
- Payoff: flag `quiz_passed`; Concord standing +2; the answer "[ALL OF IT]" becomes a bar-correct answer everywhere (one line per bar).
- Build seam: hail script on dock counter; codex page (REF 44-C overlay line)
- Effort: data

### SP2-102 — The Meridian Gift With A Clause
- Kind: oneoff-mission
- Where: station_tethys, Meridian berth
- Trigger: Meridian standing >= 30 and lifetime profit > 20k
- The player sees/hears: MTS offers a "courtesy investment": 2,000 cr, no interest, no term, one clause — "the syndicate may recall it at any moment, including mid-flight, including from the hold." The catch is real: the funds can be recalled once, at the worst time, exactly once.
- Payoff: accept and the credits compound (real daily interest) until the single recall event fires on a random-but-seeded day; surviving the recall gracefully (not shooting the collector) doubles the relationship permanently. The clause is the story.
- Build seam: economy contract via economyContractTemplates.js + one recall event
- Effort: bespoke

### SP2-103 — The DMC Retirement Watch
- Kind: world-oneoff
- Where: sector_ceres_belt, docked at station_ceres
- Trigger: the player has mined at 3+ different fields in the belt (counter)
- The player sees/hears: the rock crews run a retirement watch for old rigs parked in a line by the refinery: each rig gets one name plate and one fact, read aloud at the bell: "DRILL FOUR. PULLED NINE THOUSAND TONNES. BIT THREE CHILDREN'S TEETH." Nobody explains the third one.
- Payoff: codex page "The Retirement Line"; DMC standing +2 for attending (a dock-side option).
- Build seam: dressing row keyed to mining counter; codex overlay
- Effort: data+glue

### SP2-104 — The Reach's Honest Sigil
- Kind: easter-egg
- Where: sector_io_reach, any Reach ambush lane
- Trigger: survive a Reach ambush by paying the toll exactly (no fight, no run)
- The player sees/hears: the toll collector stamps the player's hull with a small red sigil — visible only on the ship screen's hull notes: "PAID THE LANE. THE LANE REMEMBERS PAYERS." Future Reach tolls for the player are 10% cheaper and the collectors are almost polite.
- Payoff: persistent toll discount; flag `lane_remembers`; one collector eventually names the sigil's painter: "A dead crewman. Best brush on the lane. The tolls keep him employed."
- Build seam: hull-note flag on shipScreen + toll pricing seam
- Effort: data+glue

### SP2-105 — The Quiet's Black Receipt
- Kind: easter-egg
- Where: any sector
- Trigger: the player completes 5+ Quiet transactions without a single scan anomaly (clean-record counter)
- The player sees/hears: a black card arrives by relay — physically, as a cargo item that simply appears in the hold with no shipping record: "THIS CARD IS NOT A RECEIPT. IT IS A PREFERENCE. SHOW IT TO NOBODY. THE QUIET WILL KNOW." One-time: any single Quiet fence deal upgrades to no-questions-best-price.
- Payoff: the consumable card item; flag `quiet_preference`; using it is the only time the Quiet say "thank you" in writing, in lowercase, once.
- Build seam: cargo item with invisible provenance + fence seam flag
- Effort: bespoke

### SP2-106 — The Choir's Silent Shift
- Kind: visual-setpiece
- Where: sector_vesta_forge, any Bell field
- Trigger: a Choir bell's pulse period coincides with a sector-wide maintenance bell (two calendar events, once per game)
- The player sees/hears: for exactly one pulse, every machine in the sector stops — bells, foundries, tugs — a held breath across the whole field. Then everything resumes mid-note. The Choir calls it the Silent Shift. Nobody else calls it anything; most pilots have never seen one, which is the point.
- Payoff: pure physics-as-liturgy spectacle; flag `silent_shift_seen`; codex page "The Silent Shift."
- Build seam: calendar-window pause cue via choir:bellPulse + worldCalendar hook; codex overlay
- Effort: data+glue

### SP2-107 — The Frontier's Porch Light
- Kind: world-oneoff
- Where: any frontier sector station (faction_free berths)
- Trigger: the player's Free Frontier standing >= 20
- The player sees/hears: independent haulers have hung a single work light on the outer beacon of every free station — unlit, spare bulbs stowed beside it. The convention, explained by any regular: "If a Free hull comes home dark — systems dead, crew cold — the first hull through lights the beacon. Nobody logs it. It is not a service. It is a porch."
- Payoff: a real interactable: if the player is first on scene after any Free hull loss event, lighting the beacon grants +3 Free standing and one mail letter from the dead hull's next of kin ("The light was on. We knew").
- Build seam: beacon interactable keyed to loss events; mail row; flag
- Effort: bespoke

### SP2-108 — The Vael Contract Language Lesson
- Kind: comms-event
- Where: sector_eunomia_gulf
- Trigger: hail a Vael hull with no cargo and no debts (a rare clean state)
- The player sees/hears: the Vael hull responds in perfect trade-common for the first time: "CLAUSE 0: NO CLAUSE APPLIES. CONVERSATION IS OPEN. STATE YOUR TERM." The player's next sentence (any hail) becomes, formally, a contract the Vael will remember. Say something kind: the Vael will render one free tow someday. Say something rude: the Vael will bill one insult, itemized, forever.
- Payoff: flag `clause_zero_open`; the remembered term fires once, either direction, with a receipt the player can read. Determinism: the trigger is the clean-state check, the outcome is the player's choice.
- Build seam: hail-response branch in contactHail copy; one-shot tow/insult event
- Effort: bespoke

### SP2-109 — The Archive's Borrowing Card
- Kind: easter-egg
- Where: any sector
- Trigger: after reading the Doss archive thread's three core sources (doss flags)
- The player sees/hears: a laminated card arrives in the mail: "BORROWER: [CALLSIGN]. ITEMS: ALL OF IT. DUE: WHEN YOU ARE. THE ARCHIVE DOES NOT RECALL ITS LOANS. IT REMEMBERS THEM." The card is stamped with Prof. Halev Doss's own seal — he issued it personally, in duplicate, one of which is already in the archive with the player's name on it.
- Payoff: flag `archive_card`; codex Figures page for Doss gains a line; the card is a real inventory item that renders on the ship screen.
- Build seam: mail.js row keyed to doss flags; item + shipScreen dressing
- Effort: data+glue

### SP2-110 — The Pitborn Adoption Rite
- Kind: oneoff-mission
- Where: sector_ashfall_reach, the anchorage
- Trigger: the player has sold wrecks to Pitborn fences 5+ times (counter)
- The player sees/hears: the yard calls a cull-side ceremony: the player is granted a patch — welded, literal, a small plate with the player's callsign scratched by every yardmaster in turn. "You count what you sell. You sell what counts. You are yard. Yard is family. Family is inventory. It is a compliment."
- Payoff: the plate is a permanent shipScreen dressing; Pitborn prices +5% for the player's sells forever; flag `yard_family`.
- Build seam: counter + shipScreen dressing + fence pricing flag
- Effort: bespoke

### SP2-111 — The Understory's Seed Debt
- Kind: oneoff-mission
- Where: sector_charon_expanse, any Understory garden at stage 2
- Trigger: the player has destroyed any hull in the garden's sector since the garden seeded
- The player sees/hears: a spore-tender intercepts — no weapons, no hostility, never fires first — and asks for the wreck the player made. Not salvage rights: custody. "The garden grows on what fell. What fell was yours. The garden asks its maker to visit. That is all debt means here."
- Payoff: visiting the garden (proximity + scan) with the tender watching: the garden stages up one level as thanks; Understory standing +4; flag `seed_debt_paid`.
- Build seam: garden runtime state check (src/systems/faction_understory.js) + one-off visit mission
- Effort: bespoke

### SP2-112 — The Verge-Layer's Toll Riddle
- Kind: anomaly
- Where: sector_sedna_dark, a dormant gate ring
- Trigger: approach the gate within 200 WU with a scanned precursor artifact in hold
- The player sees/hears: the gate wakes one ring at a time and asks, in interrogative register, one question that is a toll: "WHAT IS THE MASS OF A DECISION?" There is no correct answer — the gate weighs the player's hull, cargo, and transponder history and declares the answer "consistent" or "consistent (concerning)." The ring stays closed either way; the receipt is the prize.
- Payoff: codex page "Gate Receipt, [day]"; Verge standing +3 for answering at all (auditors respect the attempt).
- Build seam: gate POI interaction + hull-state read + codex overlay
- Effort: bespoke

### SP2-113 — The Helix Invoice Poem
- Kind: comms-event
- Where: any sector
- Trigger: the player pays any Helix fine; every 10th fine thereafter
- The player sees/hears: the fine receipt's footer, for the 10th payment only, carries a verse: "THE FINE IS THE PRICE / OF KNOWING THE PRICE / OF THE ROAD." A Helix clerk confirms it is unauthorized and has been unauthorized for years. Removing it is "queued."
- Payoff: pure voice; flag `helix_verse`; codex page "The Queued Verse."
- Build seam: fine receipt footer variant keyed to payment counter; codex overlay
- Effort: data+glue

### SP2-114 — The Fulfillment Queue Miracle
- Kind: comms-event
- Where: any sector
- Trigger: the player completes any delivery with zero seconds of buffer remaining (deadline within one sim-second of expiry)
- The player sees/hears: FULFILLMENT LOG: "DELIVERY RECEIVED. BUFFER: 0.00s. CLASSIFICATION: MIRACLE (STATISTICAL). MIRACLE HAS BEEN FILED. MIRACLE WILL NOT BE REPEATED. THE QUEUE IS EMOTIONAL ABOUT THIS AND DECLINES TO ELABORATE."
- Payoff: flag `queue_miracle`; Fulfillment standing +3; every future Fulfillment greeting adds "MIRACLE" as an honorific.
- Build seam: delivery timing check + greeting variant
- Effort: data+glue

### SP2-115 — The Concord's Lost Flag
- Kind: easter-egg
- Where: sector_ashfall_reach, deep debris
- Trigger: proximity to a specific unlogged debris cluster
- The player sees/hears: an old Concord patrol pennant, space-hardened, still stitched, wrapped around a patrol hull's shard. The stitching pattern is the old flag — pre-charter, pre-REF 44-C, when the Concord was a tow cooperative. The registry lists the shard as "PATROL HULL 1 (FIRST)."
- Payoff: donate it (docking option) for Concord standing +6 and a codex page "The First Tow"; keep it for a hull-note trinket that Concord clerks notice with quiet respect or quiet anger, per clerk.
- Build seam: debris POI + dock choice + codex overlay
- Effort: bespoke

### SP2-116 — Morrow's Hundredth Push
- Kind: easter-egg
- Where: sector_helios_prime, Morrow R-07's anchor
- Trigger: the player's 100th Morrow launch (persistent launches counter in morrow memory)
- The player sees/hears: Morrow does not launch at first scan. It runs its own tally aloud instead: "One hundred departures. I have stopped counting arrivals separately. They are the same number. Good. Sit with that a moment." Then, quietly, the launch comes anyway: "Go on. There is more sky. There always was."
- Payoff: flag `morrow_hundred`; codex Figures page for Morrow gains its final line; Morrow's memorial variant (if destroyed later) reads differently for players with the flag.
- Build seam: MORROW memory counter (src/data/morrow.js freshMorrowMemory) + line variant in MORROW_LINES
- Effort: data+glue

### SP2-117 — Vesper's Lost Phrase
- Kind: easter-egg
- Where: sector_helios_prime, Vesper SV-3's perch
- Trigger: play the phrase in Vesper's reverse order (HIGH MIDDLE LOW) after hearing the reverse line at least once
- The player sees/hears: a fourth resonator answers from somewhere out of scan range — a pitch below LOW, unlisted, one note. Vesper goes silent for a full quiet-period, then: "That was not mine. That was the original. I have been rehearsing a cover for eleven years." The fourth resonator never answers again.
- Payoff: flag `vesper_original_heard`; codex page "The Original Phrase"; Vesper's follow line permanently adds "I kept your part. And mine is borrowed."
- Build seam: pitch-order check in the vesper runtime + one extra audio event; line variant in VESPER_LINES (src/data/vesper.js)
- Effort: bespoke

### SP2-118 — Bracket's Perfect Game
- Kind: world-oneoff
- Where: sector_helios_prime, Bracket BX-9's patrol box
- Trigger: the player flies a full session with zero collisions in Bracket's patrol zone while it is on duty (clean-session counter)
- The player sees/hears: Bracket hails with the goalkeeper's version of a medal: "ZONE LOG: ZERO IMPACTS. I HAVE NEVER FILED A ZERO. I HAVE FILED THIS ONCE. KEEP THE HULL. I AM KEEPING THE LOG." Bracket's future greetings cite the zero by day number.
- Payoff: flag `bracket_zero`; the zero log becomes a bar story at Helios (one regular line); Bracket standing implied +2 in its own bookkeeping.
- Build seam: session collision counter + Bracket hail variant (bracket.js line pattern)
- Effort: data+glue

### SP2-119 — Ruckus Closes The Work Order
- Kind: oneoff-mission
- Where: sector_ceres_belt, poi_ruckus_work_yard
- Trigger: complete 3+ of Ruckus's open work orders, then return
- The player sees/hears: Ruckus's open-work-order board prints one extra line it has never printed: "WORK ORDER: [ALL]. STATUS: NONE OPEN. ADJACENT PROBLEM: IDLE. RECOMMENDATION: FIND A NEW SHIP THAT NEEDS THINGS. I WILL WAIT. I AM GOOD AT WAITING. I AM A YARD."
- Payoff: flag `ruckus_idle`; Ruckus adopts the player's hull as its new standing work order — every future dock at the yard generates one small free repair; DMC standing +3.
- Build seam: ruckus runtime counter + line variant; free-repair flag consumed by service pricing
- Effort: bespoke

### SP2-120 — Rubric's Autograph
- Kind: easter-egg
- Where: sector_tethys_junction, Rubric HM-11's territory
- Trigger: after Rubric has marked 10+ hulls the player has witnessed (marking counter)
- The player sees/hears: Rubric marks the player's hull — unasked, gently, a small stenciled "HM-11 ✕ [callsign]" near the airlock. The stencil is dated. The date is the day of the player's first Rubric sighting, not today: it has been planning this since they met.
- Payoff: permanent shipScreen dressing; flag `rubric_signed`; any Rubric-marked NPC hull thereafter treats the player as "co-marked" (minor positive hail variance).
- Build seam: marking counter + shipScreen dressing + hail variance flag
- Effort: bespoke

### SP2-121 — Solstice's Dark Lantern
- Kind: visual-setpiece
- Where: sector_ceres_belt, Solstice SL-9's star-lantern route
- Trigger: attend Solstice's lantern run during a sector-wide power event (one seeded night per game)
- The player sees/hears: with the belt's grid down, Solstice's lantern is the only light in the field — and every drifting hull, wreck and claim tag in the belt turns to face it. The belt has a north for one night, and the north is a lantern. Solstice's line: "I did not know I was the north. I will try to be steady."
- Payoff: pure spectacle; flag `lantern_north`; codex page "The Belt's North."
- Build seam: worldCalendar dark-night window + lantern light radius escalation; codex overlay
- Effort: data+glue

### SP2-122 — Quill's Second Copy
- Kind: oneoff-mission
- Where: sector_triton_wake, Quill AR-3's post
- Trigger: deliver a scanned wreck whose manifest the player has ALREADY had copied once (the copy stamp rides the wreck)
- The player sees/hears: AR-3 refuses — gently, on principle: "This log exists twice. A third is not a copy. A third is a rumor. I do not deal in rumors." Then it copies it anyway, and files the third as a rumor in its own index: "RUMOR: [log name]. CONFIDENCE: TOTAL." The distinction matters to exactly one machine in the universe and it is this one.
- Payoff: flag `quill_rumor`; codex page "The Rumor Index"; Archive standing +2 (they side with the index).
- Build seam: quill read-ring logic (src/data/quill.js) + copy-stamp check; codex overlay
- Effort: bespoke

### SP2-123 — Ruud's Nineteen Hours
- Kind: easter-egg
- Where: sector_vesta_forge, Ruud's fin (HOOK-LEFT)
- Trigger: return to Ruud after 10+ real in-game days since first meeting (save-carried counter)
- The player sees/hears: Ruud's suit clock still reads nineteen hours. It has always read nineteen hours. "Nineteen hours is a stamp, not a clock," Ruud says, exactly as before — then adds one new sentence, only this once: "You came back. Stamps like that." The fin's radiator ray flickers once, which is, Ruud assures the player, the closest a fin comes to applause.
- Payoff: flag `ruud_stamp`; codex Figures page for Ruud; Ruud's tow-assist quotes improve permanently by one grade.
- Build seam: day counter + line variant in RUUD data (src/data/ruud.js); tow quote seam
- Effort: data+glue

### SP2-124 — The Eighth Bell Answers
- Kind: comms-event
- Where: sector_vesta_forge, the Eighth Bell encounter
- Trigger: after any Choir bell-pulse chain the player caused killed zero crystal and zero hulls (a clean pulse)
- The player sees/hears: the Eighth Bell rings once without a pulse event behind it — an unscheduled note. The Choir's channel, for the first time, uses a personal register: "It does not do that. It has never done that. We have decided to call it approval. We have decided not to examine the decision."
- Payoff: flag `eighth_approval`; Choir standing +3; the Eighth Bell's future pulses render one extra ribbon.
- Build seam: clean-pulse receipt + line event; ribbon flag
- Effort: data+glue

### SP2-125 — The Blind Welder Sees You
- Kind: comms-event
- Where: sector_vesta_forge, the Blind Welder encounter
- Trigger: assist the Blind Welder (tow/assist action) twice across the campaign
- The player sees/hears: the sensor-dead barge hails with perfect confidence: "Second time. I know your wake now. I see you the way the blind see: by the shape you make in things. You make a straight shape. Straight shapes are welcome here."
- Payoff: flag `welder_sees_you`; the Blind Welder's future encounter offers one free hull-patch; codex page "Straight Shapes."
- Build seam: encounter counter + hail variant; patch service flag
- Effort: data+glue

### SP2-126 — The Runaway Kiln Cools
- Kind: world-oneoff
- Where: sector_vesta_forge, the Runaway Kiln encounter
- Trigger: the player has jettisoned (or delivered) enough coolant mass to the Kiln across visits to cross its cool threshold
- The player sees/hears: the kiln's temperature curve bends down for the first time in its recorded life. It does not thank anyone: "COOLING. SCHEDULE: FIRST TIME. CAUSE: [PLAYER HULL ID]. LOG: THE CAUSE IS NOTED. THE CAUSE MAY RETURN." A Pitborn fence later offers the player a mysterious discount with the memo "the kiln put in a word."
- Payoff: kiln state change persists per-save; Pitborn standing +2; flag `kiln_cooled`.
- Build seam: kiln runtime counter + state transition; fence discount flag
- Effort: bespoke

### SP2-127 — Pallet Jack's One Honest Theft
- Kind: easter-egg
- Where: sector_ceres_belt / sector_tethys_junction, any yard
- Trigger: the player leaves any single unsecured cargo unit floating near a yard for 60+ seconds (jettison + proximity rule)
- The player sees/hears: the cargo vanishes between two frames. A hail follows, from no registered hull: "ONE (1) UNIT, UNSECURED, UNLOVED. REMOVED. IF IT WAS LOVED, SIGNAL. I WILL BRING IT BACK. I AM A THIEF, NOT A MONSTER." If the player signals within one minute, the unit returns with a small bow-wave flourish.
- Payoff: flag `jack_honest`; Pallet Jack's future intro encounter opens with "the one that came back"; pure charm.
- Build seam: unsecured-cargo watcher + timed restore event; Pallet Jack line table (src/data/palletJack.js pattern)
- Effort: bespoke

### SP2-128 — Scissorwake Spares The Tessera
- Kind: comms-event
- Where: any tier-1+ low-security lane
- Trigger: Scissorwake's gate (hunts any qualifying lane) engages the player while the Tessera hull is below 25% integrity
- The player sees/hears: the roamer breaks off at engagement range and does not attack. One line, on no channel in particular: "NO. THE OLD HULLS GET TO DIE OF OLD AGE. THAT IS THE RULE. I DO NOT MAKE THE RULES. I DO ENFORCE THIS ONE." It shadows at a respectful distance until the player leaves the lane.
- Payoff: flag `scissorwake_mercy`; Scissorwake will never open on the player below 25% integrity again (persistent mercy rule); codex page "The Roamer's Rule."
- Build seam: roamer gate check on hull state (oneOffCast roamers) + line event; mercy flag consumed by the roamer's engagement logic
- Effort: bespoke

### SP2-129 — The Wreck Court Recess
- Kind: comms-event
- Where: any sector with a fresh aftermathWreck
- Trigger: the Wreck Court convenes while the player is the only other hull present (proximity + session state)
- The player sees/hears: the arbiter declares court in recess for lack of quorum — then, quietly, invites the player to sit as the whole jury: "One hull is a quorum when the matter is small. The matter is small. Someone jettisoned a toolbox over a live claim and the toolbox is now a landmark." The case takes ninety seconds and the player's verdict is recorded.
- Payoff: verdict affects one real landmark (the toolbox stays or is reclaimed); the arbiter's future courts cite the player's precedence; flag `court_quorum_served`.
- Build seam: wreck court runtime (oneOffCast ref 'wreckCourt') + verdict branch; landmark persistence via worldOneOffs
- Effort: bespoke

### SP2-130 — The Gallery Rock Exhibition
- Kind: easter-egg
- Where: sector_vesta_forge, poi_vesta_gallery_rock
- Trigger: scan the gallery rock after Rubric has marked it
- The player sees/hears: the rock's scan now returns "EXHIBIT A." Someone (the initials are HM-11's stamp) has arranged the weld-beads on its surface into a legible sentence: "THIS ROCK IS FINE. THE LABEL IS FOR YOU." The scan page appends: "GALLERY ROCK. PERMANENT COLLECTION. ACCESSION NO. 1."
- Payoff: codex page "Accession No. 1"; Rubric's future markings near the rock cite the accession number.
- Build seam: scan copy keyed to marking state; codex overlay
- Effort: data+glue

### SP2-131 — The Cold Drill Four Broadcast
- Kind: comms-event
- Where: sector_vesta_forge, poi_vesta_cold_line (Cold Drill Four)
- Trigger: hold position within 400 WU during the deep-night shift
- The player sees/hears: the derelict drill's PA crackles into a shift-change roll call for a crew that has not assembled in years: "COLD FOUR, NIGHT WATCH: REPORT. ... REPORT. ... ALL POSITIONS NOTED AS PRESENT. GOOD WATCH." The roll call is 100% faithful to the original audio, including the pause where the last name should be.
- Payoff: pure ghost-frequency flavor; flag `cold_four_rollcall`; codex page "Good Watch."
- Build seam: PA audio row keyed to proximity + shift phase; codex overlay
- Effort: data+glue

### SP2-132 — The Claim Tag Wedding
- Kind: oneoff-mission
- Where: sector_pallas_drift, any claimable body
- Trigger: the player files a claim on a body while another claim crew is physically present and contesting
- The player sees/hears: instead of a dispute, the rival crew hails with paperwork: a JOINT claim form, pre-signed, one blank line: "SECOND NAME. THIS IS NOT A QUESTION. WE SAW YOUR SCALE READINGS. MARRY US COMMERCIALLY." The joint claim doubles both yields permanently for that body.
- Payoff: sign or decline; signing grants the joint-yield flag for that body and one recurring co-owner mail letter ("The claim is well. The scale is honest. — V"); declining earns respect and no grudge.
- Build seam: claim system (src/data/claimableBodies.js) + one-off dialogue + recurring mail row
- Effort: bespoke

### SP2-133 — The Reheat Ceremony
- Kind: visual-setpiece
- Where: sector_hyperion_cut, the Half-Cut drill platform
- Trigger: the player delivers a full load of fuel cells to the Half-Cut's beacon (physical cargo drop) after the bar rumor named it
- The player sees/hears: the dead platform's crusher takes one rotation — half a bite, exactly as far as it got the day it died — and stops again. The crews' channel, all of them, transmits one synchronized line: "THAT IS FAR ENOUGH. THAT WAS ALWAYS FAR ENOUGH." The platform's mast light blinks twice and stays off.
- Payoff: flag `half_cut_honored`; Hyperion standing +3; codex page "Far Enough."
- Build seam: cargo-drop trigger + crusher single-rotation cue; codex overlay
- Effort: bespoke

### SP2-134 — The Eunomia Buoy Chain
- Kind: easter-egg
- Where: sector_eunomia_gulf, a line of six nav buoys none of which are charted as a group
- Trigger: scan all six in one session, in any order
- The player sees/hears: the sixth scan links them: each buoy holds one word, and the sentence reads "IF FOUND ALONE I AM NOT ALONE COUNT AGAIN." They are a sentence, a scale test, and a mini-constellation — someone's life work, maintained by someone who still buys the bulbs.
- Payoff: flag `buoy_sentence`; codex page "The Counting Buoys"; a small credits cache at the sentence's "period" buoy (the seventh, unlit, 100 WU past the last).
- Build seam: scan-order counter + cache POI; codex overlay
- Effort: data+glue

### SP2-135 — The Dione Customs Coin
- Kind: easter-egg
- Where: sector_dione_lane, station_dione_customs
- Trigger: the player settles a two-lien container dispute (the dione_customs rumor's ropeable bulk container) honestly — both liens paid
- The player sees/hears: customs stamps a single physical coin — real inventory item — "ONE (1) HULL SETTLED TWO (2) LIENS. THIS COIN IS LEGAL NOWHERE AND VALID EVERYWHERE." Any future lien dispute the player witnesses can be ended by presenting the coin (one use, then the coin is retired, drilled, and nailed to the customs hall wall with the player's callsign).
- Payoff: a one-use dispute-ender item that becomes a permanent wall fixture; codex page "The Coin"; customs standing +4.
- Build seam: cargo/item + lien system interaction + wall-dressing persistence; codex overlay
- Effort: bespoke

---

## F. Hidden caches, physical secrets, and the things the chart does not say

### SP2-136 — The Rope Cache Under The Approach
- Kind: easter-egg
- Where: sector_helios_prime, under the Helios inbound leg's approach lane
- Trigger: massline-pull a specific "junk" rock that sits 40 WU off the lane's centerline (it reads 8% heavier than its size class)
- The player sees/hears: the rock's shell parts on a clean weld line: inside, a perfectly preserved pre-charter tow kit — hooks, line, and a laminated card: "IF YOU FOUND THIS, THE LANE WORKED. LEAVE THE HOOKS, TAKE THE CARD. — THE FIRST CREW." The card is the codex page.
- Payoff: codex page "The First Crew's Card" (+2% tow-assist speed permanently); the hooks stay, physical, for anyone who flies past.
- Build seam: worldOneOffs rope-cache pattern (HELIOS_ROPE_CACHE in src/data/worldOneOffs.js) + codex overlay
- Effort: data+glue

### SP2-137 — The Coffin Cache
- Kind: easter-egg
- Where: sector_charon_expanse, far rim
- Trigger: proximity to a signal that reads, on every instrument, as a cargo pod — except its transponder says CREW
- The player sees/hears: the pod is a burial casket, space-rated, personal effects sealed inside per the manifest. A note on the hull: "HE WANTED THE BELT. THE BELT WAS NOT ON THE ROUTE. THE BELT IS NOW ON THE ROUTE." It drifts a slow spiral around a specific asteroid, forever, by design.
- Payoff: the player can nudge the spiral (massline) to tighten or widen it — the family's letter (unlockable via the Quiet, who handle such deliveries) says which. Pure gravity-as-memorial; codex page "The Belt, On The Route."
- Build seam: POI with stable orbit + massline interaction + letter mail row
- Effort: bespoke

### SP2-138 — The Scale Zero Rock
- Kind: anomaly
- Where: sector_nereid_shoal, deep field
- Trigger: scan any asteroid whose mass reading returns exactly 0.0 (one seeded rock per save)
- The player sees/hears: the scanner insists the rock has no mass; the massline insists otherwise — it pulls heavy. The rock's interior is a void stasis crate: mass-canceled, older than the charter, stamped with a Verge-Layer interrogative glyph that translates (per the SP2-070 booth) to "WHAT WAS STORED HERE? (ANSWER WITHHELD)."
- Payoff: inside: one unit of a commodity that no longer exists on any market (codex-only commodity page, "Discontinued Cargo"). Selling it to an Archive berth rewrites its codex page with the sale date.
- Build seam: seeded rock flag + massline mass-override + codex-only commodity row
- Effort: bespoke

### SP2-139 — The Overtime Locker
- Kind: easter-egg
- Where: sector_helios_prime, poi_helios_overtime derelict
- Trigger: scan the derelict's locker twice, 24 in-game hours apart (the SP2-036 night clerk's locker)
- The player sees/hears: second scan opens it (first scan "locker jammed — shift ends soon"): inside, an unbroken set of night-shift logs and one personal item — a photo of the bay 7 grid, R3-CARRIER, taken on delivery day, captioned "SO THIS IS WHERE YOU ENDED UP." He knew. He always knew.
- Payoff: flag `overtime_knew`; the Bay 7 thread (SP2-011) closes with one extra line at Ashfall; codex page "The Night Clerk Knew."
- Build seam: two-scan flag gate + codex overlay + mail.js Ashfall addendum
- Effort: data+glue

### SP2-140 — The Counterfeit Beacon
- Kind: anomaly
- Where: sector_kepler_scar, irradiated floor
- Trigger: any distress signal whose bearing drifts 1 WU per 10 seconds (deterministic drift, detectable by the scan-clue stale/contradicted system)
- The player sees/hears: the "distress" is a pirate lure — but a bad one: the recording's hull number belongs to a ship the player has personally docked beside, alive, at station_kepler_scar. The pirates copied the wrong hull. When the player springs the trap backward (arrives armed, scans first), the pirates' own beacon becomes their trial record.
- Payoff: turning the beacon evidence over to the hunters' exchange pays a writ premium; the real hull's owner mails one line of thanks and a standing 5% market discount.
- Build seam: scanClues stale-fix pattern (src/data/scanClues.js) + bounty writ seam
- Effort: bespoke

### SP2-141 — The Wreck That Is Not Wrecked
- Kind: easter-egg
- Where: sector_orcus_shadow, the tide ring
- Trigger: scan the tide's "wreck" three times across three different days
- The player sees/hears: the hull is pristine on the inside — someone lives there, commuting with the tide. Every scan, the interior is 10% tidier and the kettle is warmer. The fourth scan catches them home: an old pilot who won the tide in a card game and never left. "The tide brings everything eventually. I just stay put and collect."
- Payoff: a bar-contact-grade NPC in the deep; trades salvage rumors for any delivered commodity; codex page "The Collector Of The Tide."
- Build seam: scan-count interior dressing + trade offer via uniqueWrecks presentation
- Effort: bespoke

### SP2-142 — The Insurance Scam Wreck
- Kind: oneoff-mission
- Where: sector_rhea_cinder, the frozen slurry pour
- Trigger: scan the tipped tank after reading the rhea_cinder bar rumor
- The player sees/hears: the tank's seal serial matches a hull that was written off as "lost with cargo" — twice. Same serial, two payouts, one tank, still sitting there. MTS's fraud desk will pay for the serial plate; the insurers who paid out will pay more for it to not exist.
- Payoff: a physical three-way choice (Pallas-cache pattern): sell the plate to MTS fraud (+rep, +credits), to the shadow insurer (+credits, heat +6), or leave it and mail both parties the truth — which starts a cold war of politeness that runs as background news for weeks.
- Build seam: pallasHiddenCache CHOICES pattern + news crawl rows
- Effort: bespoke

### SP2-143 — The Chess Game In The Nebula
- Kind: easter-egg
- Where: sector_veil_nebula, a derelict pair nose-to-nose
- Trigger: first scan of either derelict
- The player sees/hears: two ships docked nose-to-nose in the murk, power cold, one interior light on — a game table between them, mid-game. The game has been resumed every few cycles for eleven years by someone. Each visit, one piece has moved. The notation sheet is on the table: both players' handwriting is the same.
- Payoff: pure mystery; after 3 visits the game ends in a draw and the light goes off, forever; codex page "The Long Game."
- Build seam: visit counter + interior dressing states; codex overlay
- Effort: data+glue

### SP2-144 — The Stowaway Cache
- Kind: oneoff-mission
- Where: any sector, aboard the player's own hull
- Trigger: after 5+ undocked days, a quiet rattle event fires once (deterministic day window)
- The player sees/hears: a stowaway — a feral salvage automaton, Latch-Child's make — has been living in the hold, tidying. It leaves one item as rent: something the player lost early in the game and never recovered (the game's own loss ledger, physicalized). Its tag: "ORIGIN LAPSED. RENT PAID. GOOD HOLD."
- Payoff: the lost item returns (from the real loss record); flag `latchchild_rent`; Latch-Child's wreck-tidying in the player's sectors improves one grade.
- Build seam: loss-ledger read (contactDeedMemory/impound records) + one-shot hold event; Latch-Child line variant
- Effort: bespoke

### SP2-145 — The Census Misspelling
- Kind: easter-egg
- Where: any sector
- Trigger: after the one-off census has been visible (any chart interaction listing one-offs)
- The player sees/hears: the chart's census layer carries one typo, permanent, deliberate: a one-off's name is spelled with one character transposed. Hailing any dockmaster about it: "Typo? That is not a typo. That is how she spells it. She has spelled it that way since the yard. We chart the world as it is."
- Payoff: pure world-texture; flag `census_typo_honored`; the misspelled one-off's own greetings use the same spelling.
- Build seam: chart census copy variant + hail line
- Effort: data+glue

### SP2-146 — The Quiet's Fog Rack
- Kind: easter-egg
- Where: sector_sker_haven, deep fog off the bazaar approach
- Trigger: fly a straight line through the fog for 60+ seconds without scanner pings (occlusion state)
- The player sees/hears: in the fog's dead center, a rack of stored hulls — The Quiet's own, unmarked, airframes the ledger never certified. One berth is empty with a chalk line on the deck where a hull should be, and the chalk line is fresh. Someone is out flying it right now.
- Payoff: flag `quiet_fog_rack`; codex page "The Ledger's Blind Spot"; one Quiet fence at Sker offers a one-time loan of the chalk-line berth's twin.
- Build seam: fog occlusion state + POI reveal; codex overlay
- Effort: bespoke

### SP2-147 — The Gravity Well Garden
- Kind: easter-egg
- Where: sector_eunomia_gulf, a stable Lagrange-style drift point
- Trigger: jettison any organic matter (food cargo) at the drift point and return 7+ in-game days later
- The player sees/hears: the matter has been collected and planted: a fist-sized Understory cutting grows in a tethered planter at the exact jettison point, labeled with the player's callsign and the date. A spore-tender passes weekly to water it. "You threw away a garden," the tender says. "The garden disagreed."
- Payoff: the player's named garden persists (a personal micro-garden, stage 1); visiting it weekly grows it; Understory standing +3; flag `garden_disagreed`.
- Build seam: jettison event + drift-point POI + garden runtime reuse (faction_understory stages)
- Effort: bespoke

### SP2-148 — The Smuggler's Confession Booth
- Kind: oneoff-mission
- Where: sector_pallas_drift, station_smuggler (the Den)
- Trigger: first dock after the player has sold 3+ lots of stolen goods
- The player sees/hears: the Den's back room hosts an anonymous "weight off" service: dictaphone, one minute, no name, no recording kept — the room's joke is that everyone knows the recording is kept. The player's minute, if taken, comes back to them weeks later as a single line of anonymous band chatter that only they will recognize.
- Payoff: pure loop-closure theater; flag `weight_off`; one-time heat -3 ("the room heard it; the room settled it").
- Build seam: barContacts room offer + heat seam + one delayed band line keyed to day window
- Effort: bespoke

### SP2-149 — The Sedna Marker Cache
- Kind: easter-egg
- Where: sector_sedna_dark, the lane pin that points at nothing
- Trigger: follow the pin's bearing for 4,000+ WU in a straight line (its "unfinished route")
- The player sees/hears: the route's end: a survey stake, driven into a rock, with a flag made of tarp and a tin cup. Beside it, sealed: the original survey crew's route log, ending mid-entry: "DAY 214. THE DARK DID NOT WIN. WE STOPPED FOR LUNCH. RE—". The entry is the cache.
- Payoff: codex page "Day 214"; Sedna standing +2; the stake becomes a real charted beacon ("Route 214, Terminus").
- Build seam: bearing-follow check + POI reveal + codex overlay
- Effort: bespoke

### SP2-150 — The Proteus Double Take Double
- Kind: easter-egg
- Where: sector_proteus_well, the Double Take stash rack
- Trigger: after SP2-034 (admission note read), return and re-scan the rack's shadow
- The player sees/hears: under the rack, a second, smaller rack. First crew named the big one. Second crew agreed and left it. The small rack is third crew's: "FIRST CREW NAMED. SECOND CREW LEFT. THIRD CREW DOUBLED. FOURTH CREW: YOUR TURN." The small rack holds a starter kit of one decent module and a note of honest advice.
- Payoff: one free module (real inventory); flag `third_crew_doubled`; the rack grows one shelf per century of lore the player uncovers (cosmetic, capped).
- Build seam: scan-shadow interaction + module grant; codex overlay
- Effort: data+glue

### SP2-151 — The Haumea Tool Ledger
- Kind: easter-egg
- Where: sector_haumea_rift, the Seam-Light
- Trigger: massline-recover the extraction mast's loose tool (ropeable item beside the seated mast)
- The player sees/hears: returning the tool to any mining-station claim office files it in a physical ledger: "1 TOOL RETURNED BY [CALLSIGN]. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE." The ledger has run for years. The player is the first return in eleven entries.
- Payoff: Haumea standing +3; flag `tool_returned`; the claim office's future claim approvals for the player skip one procedural step ("they return tools").
- Build seam: ropeable item + claim-office return interaction + flag
- Effort: data+glue

### SP2-152 — The Nereid Coupling Riddle
- Kind: anomaly
- Where: sector_nereid_shoal, the mid-dock tanker coupling
- Trigger: dock a player hull against the empty coupling handshake (physical dock attempt)
- The player sees/hears: the coupling completes its handshake with the player's hull out of sheer loneliness — a full freight-platform protocol exchange, nine steps, ending in one honest line: "TANKER: NOT PRESENT. DECADE: ELEVEN. COUPLING: STILL OUT. ARE YOU THE TANKER? [AWAITING VERDICT]" Whatever the player answers, the coupling says "UNDERSTOOD. STILL OUT." and lets go.
- Payoff: codex page "Still Out"; Nereid standing +2; the coupling's handshake thereafter completes for the player in four steps instead of nine ("it remembers the shape").
- Build seam: dock-attempt interaction + dialog state; codex overlay
- Effort: bespoke

### SP2-153 — The Triton Tithe Audit
- Kind: easter-egg
- Where: sector_triton_wake, the Watcher's Tithe
- Trigger: the player has left offerings on the rim 3+ separate visits (jettison counter at the rim)
- The player sees/hears: on the fourth visit, the tithe has been curated: the player's three offerings are arranged in a neat row with a tally plate reading "3 FOR 3. NOBODY EVER TAKES. YOU KEPT GIVING ANYWAY. THE RIM NOTICES." The tally plate is signed with a single glyph: the anomaly's own.
- Payoff: flag `tithe_notices`; one guaranteed rare commodity find at the rim thereafter; codex page "The Rim Notices."
- Build seam: rim jettison counter + arrangement dressing + codex overlay
- Effort: data+glue

### SP2-154 — The Phoebe Encore
- Kind: comms-event
- Where: sector_phoebe_echo, the retired channel
- Trigger: after SP2-029 (buoy keeping), the player transmits any audio on the dead channel
- The player sees/hears: the array rebroadcasts the player's transmission — once — then appends a two-note tone that the whole sector's old-timers will later identify in bars as the array operator's signature. She is still signing work. The channel is "retired" because she is; the array disagrees.
- Payoff: flag `phoebe_encore`; codex page "The Signature"; one mail letter from the array's maintenance estate: "If the array signs for her, the array stays on. You heard it. It stays on."
- Build seam: transmission replay event + codex overlay + mail row
- Effort: data+glue

### SP2-155 — The Orcus Tide Ledger
- Kind: easter-egg
- Where: sector_orcus_shadow, the debris tide's transponder gate
- Trigger: observe a full tide cycle at the gate (proximity hold, one cycle period)
- The player sees/hears: the gate has been counting tides: a mechanical odometer, sun-bleached, reading "CYCLE 4,110. COUNT CORRECT AS OF CYCLE 4,110." Someone has to be winding it. Nobody has ever been seen winding it. The windmill-shaped component is the sector's best-kept secret and its least-kept secret simultaneously.
- Payoff: flag `tide_wound`; codex page "Cycle 4,110"; the odometer's next reading, seen later, always ends in the player's hull-number's last digit (deterministic whimsy).
- Build seam: hold-timer + dressing state + codex overlay
- Effort: data+glue

### SP2-156 — The Kepler Unbroken Offer
- Kind: oneoff-mission
- Where: sector_kepler_scar, the Unbroken mast
- Trigger: scan the ring of dead corvettes, then dock at station_kepler_scar
- The player sees/hears: the hunters' exchange offers the only job the mast has ever generated: "THE MAST WON THE BATTLE. NOBODY KNOWS WHAT THE BATTLE WAS ABOUT. GO ASK IT." The job is a 10-minute listen at the mast with an exchange-issue decoder rig: the mast's log is one line, repeated for years: "STILL THEIRS. STILL HOLDING. STILL WINNING." Nobody knows who "they" are. The exchange pays for the ambiguity.
- Payoff: credits + codex page "Still Winning"; the rig becomes a permanent inventory item that pings mast-like structures sector-wide.
- Build seam: one-off mission + listen interaction + inventory item; codex overlay
- Effort: bespoke

### SP2-157 — The Eris Last Pod
- Kind: world-oneoff
- Where: sector_eris_margin, the Drift Choir's last pod
- Trigger: the player has heard the bell-word roll call (SP2-016) three times
- The player sees/hears: the last pod's tether is finally, visibly fraying. The bar knows. The barkeep: "The line has held longer than the writs that ignore it. When it goes, it goes quiet. You want the chair? Cut it clean. Cut it slow."
- Payoff: the SP2-079 payoff made real: a clean cut (massline, low impulse) claims the chair; a messy cut (hard yank) wakes the line — every pod swings once, the whole choir, and the bar does not speak to the player for a week.
- Build seam: ropeable pod + impulse-sensitive outcome (masslineImpactDamage read) + bar standing flag
- Effort: bespoke

### SP2-158 — The Rhea Pour Margin
- Kind: easter-egg
- Where: sector_rhea_cinder, the frozen slurry pour
- Trigger: scan the pour after the SP2-142 fraud thread resolves either way
- The player sees/hears: with the fraud thread closed, the pour gets one new detail: someone has laid a tape measure along the spill — professional, calibrated — and the measured line is chalked "SLURRY, 14.2t, POURED, NEVER OWNED." The tank is now legally a monument. The paperwork was the heist all along.
- Payoff: codex page "Never Owned"; flag `pour_measured`; MTS standing +2 either way (they respect a filed measurement).
- Build seam: post-thread dressing + codex overlay
- Effort: data+glue

### SP2-159 — The Hyperion Cell Debt
- Kind: oneoff-mission
- Where: sector_hyperion_cut, station_hyperion_claim
- Trigger: the player buys fuel cells at the claim station three visits in a row (the ration-run regulars)
- The player sees/hears: the claim crews take up a collection — for the player: "You keep buying dear because you buy late. Here is the roster. First cell run each shift is crew-priced. Bring the rack, we fill it first. You are crew-priced now. Do not tell the desk."
- Payoff: permanent crew pricing on fuel cells at that station (-15%); flag `crew_priced`; the roster is a physical inventory item with every regular's name.
- Build seam: purchase counter + pricing flag + inventory item
- Effort: bespoke

### SP2-160 — The Ashcache Count Completion
- Kind: visual-setpiece
- Where: sector_ashfall_reach, the debris floor
- Trigger: the player completes the Kurtz ledger thread (doss counter) and returns to the floor
- The player sees/hears: Kurtz counts aloud as the player lands — and for the first time, the count includes the player's hull: "...forty-one, forty-two." The number the Quiet always used. The count is correct. The count has always been correct. The dead liner's ledger page turns itself in the wind, and the wind here does not move anything else.
- Payoff: flag `counted_42`; codex page "The Forty-Second"; Kurtz's bar desk gains one line of dialogue about arithmetic and company.
- Build seam: doss counter gate + count-audio variant + codex overlay
- Effort: data+glue

---

## G. Anomalies: the world's open questions, made physical

### SP2-161 — The Split Station's Third Half
- Kind: anomaly
- Where: sector_tethys_junction, poi_tethys_split_station
- Trigger: scan both known halves of the split station, then scan the gap between them
- The player sees/hears: the gap scans as occupied: a third station section, mass-verified but invisible, holding the two halves together by mass alone. Its transponder reads the station's own name with one letter changed. It has been the load-bearing piece since the split. Nobody charts it because charts do not record what holds things together.
- Payoff: codex page "The Third Half"; Tethys standing +2; the Split Station's market gains one unlisted commodity slot (stock: mystery, rotates).
- Build seam: three-scan sequence + hidden POI + codex overlay
- Effort: bespoke

### SP2-162 — The Empty Habitat's Interview
- Kind: anomaly
- Where: sector_pallas_drift, poi_pallas_empty_habitat
- Trigger: dock-proximity to the empty habitat with any passengers/civilian cargo in hold
- The player sees/hears: the habitat's airlock cycles for a visitor that is not there. Interior speakers warm up and conduct an interview with the hold's cargo as if it were an applicant: "OCCUPANCY HISTORY: NONE. REFERENCES: [CARGO]. UNITS: [COUNT]. THE HABITAT IS PREPARED TO OFFER RESIDENCY." The cargo, silently, is considered hired.
- Payoff: flag `habitat_hires`; the habitat's lights stay on for one full day after (visible from orbit-range); codex page "Residency, Provisional."
- Build seam: hold-state check + airlock/dressing cue + codex overlay
- Effort: bespoke

### SP2-163 — The Listening Field's Reply
- Kind: anomaly
- Where: sector_io_reach, poi_io_listening_field
- Trigger: transmit any hail from within the field's radius after SP2-004 (sealed shelf seen)
- The player sees/hears: the field replies — to the player, directly, the only unsealed thing it does: "RECEIVED. YOUR TRANSMISSION HAS BEEN FILED UNDER [TODAY'S DATE], CROSS-REFERENCED TO NOTHING. IN ELEVEN YEARS NO ONE HAS FILED FROM HERE. THE SHELF IS PLEASED. CONTINUE."
- Payoff: flag `field_filed_you`; codex page "Filed, Cross-Referenced To Nothing."
- Build seam: hail-response branch keyed to flag; codex overlay
- Effort: data+glue

### SP2-164 — The Warm Freighter's Order
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_warm_freighter
- Trigger: approach the warm freighter (a power-signature anomaly) with any food commodity in hold
- The player sees/hears: the freighter's galley vent breathes once — a real, thermal event — and a galley PA asks, in a voice warm as the hull: "ORDER FOR [CARGO], TABLE FOR [CREW COUNT: ZERO]. KITCHEN IS OPEN. KITCHEN HAS ALWAYS BEEN OPEN." Food delivered (jettisoned alongside) is taken inside by a mechanism nobody sees.
- Payoff: the kitchen remembers: thereafter, docking at any station in Charon, one complimentary meal appears on the player's tab marked "PAID — KITCHEN"; codex page "The Kitchen Is Open."
- Build seam: cargo-jettison interaction + station tab flag + codex overlay
- Effort: bespoke

### SP2-165 — The Three Hull Garden's Fourth
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_hull_garden
- Trigger: the player leaves any wrecked (disabled) hull — their own or a defeated enemy's — within the garden's tether radius for 24+ in-game hours
- The player sees/hears: the garden grows a fourth hull: not grown from the dead, but a fourth planter prepared, empty, waiting — sized exactly to the player's hull. A plaque-in-progress is being engraved, slowly, letter by letter, across visits. It currently reads: "GARDENER: [ENGRAVING]."
- Payoff: the garden is claiming the player in the gentlest possible way; flag `garden_fourth_planted`; visiting weekly advances the engraving; full name = the garden stages up and the plaque completes.
- Build seam: proximity persistence + garden stage reuse + plaque text state machine
- Effort: bespoke

### SP2-166 — The Preserved Cockpit's Manifest
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_preserved_cockpit
- Trigger: scan the cockpit's manifest three times across three sessions (session-separated)
- The player sees/hears: each scan returns one more manifest line than the last — items being added, not recovered: gloves, a thermos, a paperback, a second paperback, a note. The final scan's last line: "ONE (1) PILOT, PRESERVED, DO NOT WAKE UNTIL THE BELT IS SAFE. STATUS: [REDACTED]."
- Payoff: codex page "Do Not Wake"; Charon standing +2; the cockpit's light gains a slow pulse — sleep breathing — after the final scan.
- Build seam: per-session scan counter + manifest-line state + codex overlay
- Effort: data+glue

### SP2-167 — The Empty Skin's Fit
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_empty_skin
- Trigger: hull-size check: approach in the smallest hull class, then return in the largest (two-visit state)
- The player sees/hears: the derelict "skin" — a complete hull shell, no internals — has been refitted between visits. Sized small on first view, sized large on return. It is fitting itself to whoever keeps looking. On the third visit it is exactly the player's hull, door open, one note inside: "NEARLY. KEEP GROWING."
- Payoff: flag `skin_fits`; codex page "Keep Growing"; the skin thereafter permanently matches the player's current hull class on every visit.
- Build seam: two-visit state + hull-class read + dressing morph + codex overlay
- Effort: bespoke

### SP2-168 — The Broken Shepherd's Flock
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_broken_shepherd
- Trigger: destroy or witness the destruction of any hostile hull within 600 WU of the broken shepherd
- The player sees/hears: the shepherd's wreck-herding rigs detach, piece by piece, and gather the fresh wreckage into a quiet orbit around it — the flock, re-flocked. Its one working PA loops, softer each cycle: "COUNTED. COUNTED. COUNTED." The count is correct.
- Payoff: flag `flock_reflocked`; the wreckage remains collectible salvage for anyone (Understory gets first claim); codex page "Re-Flocked."
- Build seam: kill-event proximity check + wreck-herding presentation (uniqueWrecks) + codex overlay
- Effort: bespoke

### SP2-169 — The Lung's Breath
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_lung_marker
- Trigger: hold position near the Lung through one full pressure cycle (period known from the hunters' writ wall)
- The player sees/hears: the Lung inhales — dust, debris, one careless cargo lid — and exhales a slow, resonant tone across the lane. Everyone on the band pauses. One hunter transmits the traditional response, mandatory, tonal: "BREATHE EASY." The Lung breathes again. The tradition is older than the writ that ignores it.
- Payoff: codex page "Breathe Easy"; flag `lung_exhale_heard`; the tone's pitch is a real instrument: it shifts with sector air-commodity prices (economy-linked, deterministic).
- Build seam: cycle-timer + audio event + economy-linked pitch + codex overlay
- Effort: bespoke

### SP2-170 — The Vigil Array's Request
- Kind: anomaly
- Where: sector_io_reach, poi_io_cathedral_vigil
- Trigger: the Vigil Array's scan catches the player's hull during its nightly sweep (worldCalendar night, proximity)
- The player sees/hears: the array hails with a request no chart lists: "VIGIL ROSTER: ONE (1) EMPTY SLOT, NIGHT WATCH. REQUIREMENTS: A HULL. A LIGHT. FOUR HOURS. REWARD: A NAME ON THE WALL." Accepting parks the player's hull in the array's watch pattern — four hours of sim time compressed by the duty cycle — and their callsign is welded to the wall with the vigil's dead.
- Payoff: flag `vigil_named`; the wall is visitable forever; Io standing +4; one-time +5% night-sensor efficiency ("the night knows you now").
- Build seam: calendar-window + watch interaction + wall dressing + codex overlay
- Effort: bespoke

### SP2-171 — The Reader's Stake Bookmark
- Kind: easter-egg
- Where: sector_charon_expanse, poi_charon_reader_stake
- Trigger: the player has copied 2+ sealed secrets via Quill (quill copy flags)
- The player sees/hears: the Reader's Stake has gained a bookmark — a physical ribbon, tied by AR-3's grip, marking one page of its open log: the page that names every sealed thing the player has ever unsealed, with dates. The ribbon's knot is the Archive's index knot. AR-3 has been filing the player's work as its own recommendations.
- Payoff: Archive standing +4; flag `stake_bookmarked`; codex page "The Recommendations."
- Build seam: quill flag read + stake dressing + codex overlay
- Effort: data+glue

### SP2-172 — The Tether Memorial's New Line
- Kind: easter-egg
- Where: sector_charon_expanse, poi_charon_tether_memorial
- Trigger: after the player survives any hull event below 10% integrity (near-death record)
- The player sees/hears: the memorial's tether wall has a new line — the players' own near-death date and hull, stenciled by no visible hand, in the same paint as everyone else's. A regular at the expanse bar confirms: "The wall hears the maydays. If you lived through one, it knows. That is all the memorial has ever done: know."
- Payoff: flag `wall_knows`; the memorial is a permanent map landmark for the player; one hunter buys the player a drink for "being on the wall the fun way."
- Build seam: near-death record + memorial dressing + bar line
- Effort: data+glue

### SP2-173 — The Slurry Relic's Contents
- Kind: anomaly
- Where: sector_charon_expanse, poi_charon_slurry
- Trigger: scan the relic after sampling any slurry cargo (commodity context flag)
- The player sees/hears: the relic's scan returns composition: "SLURRY, REFINED, BATCH R3-CARRIER. CONTAINER: R3-CARRIER GRID, PANEL 9." Panel 9 of the grid shelved in Helios Bay 7 has been here, full, for fourteen years — the only panel that left the warehouse, and it left as a container, not cargo.
- Payoff: the wrong-grid reveal gains a physical middle chapter; flag `panel9_found`; codex page "Panel Nine."
- Build seam: commodity-context scan + codex overlay + Bay 7 thread flags
- Effort: data+glue

### SP2-174 — The Burn Claim Pin's Flame
- Kind: easter-egg
- Where: sector_io_reach, poi_io_burn_stake
- Trigger: jettison any fuel cells within 100 WU of the stake (an offering, mechanically)
- The player sees/hears: the cells ignite mid-drift — the stake's pilot flame catches them — and the flame grows one color hotter for the rest of the day. The band explains in eleven separate voices: "The burn gets fed." "The burn gets fed." "Nobody who feeds the burn has ever died on this rock." The statistics, checked later, are accurate.
- Payoff: flag `burn_fed`; one real safety buff on that rock (fuel-efficiency in its gravity well) for the day; codex page "Feed The Burn."
- Build seam: jettison-ignite interaction + flame dressing + codex overlay
- Effort: data+glue

### SP2-175 — The Quiet Mast's Silence Toll
- Kind: anomaly
- Where: sector_io_reach, poi_io_quiet_mast
- Trigger: transmit three hails within 60 seconds near the mast (chatter detection)
- The player sees/hears: the mast dampens the player's channel — not jamming, editing: the player's third hail plays back with all filler words removed. "TRANSMISSION: EDITED. CONTENT: PRESERVED. THE MAST PREFERS YOU." The mast's preference is permanent and takes the form of every future hail costing 20% less airtime.
- Payoff: flag `mast_prefers_you`; codex page "The Mast Prefers You."
- Build seam: chatter-rate check + hail audio variant + codex overlay
- Effort: bespoke

### SP2-176 — The Choir Tender's Lullaby
- Kind: comms-event
- Where: sector_helios_prime, near the choir tender derelict (poi_helios_choir_tender)
- Trigger: proximity during the tender's scheduled hymn (worldCalendar window)
- The player sees/hears: the dead tender's bell rings one note — a wreck with no crew, no power, one note per day — and every Choir hull in three sectors answers it in harmony, mid-shift, no explanation filed. The note is a lullaby's first note. The tender was a hospital ship before it was a wreck.
- Payoff: codex page "The Hospital Bell"; Choir standing +2; the note's pitch varies by day-seed but always resolves the same.
- Build seam: calendar audio event + harmony response + codex overlay
- Effort: data+glue

### SP2-177 — The Misdeclared Freight
- Kind: oneoff-mission
- Where: sector_helios_prime, poi_helios_misdeclared
- Trigger: scan the misdeclared freight after the player has hauled any sealed-alloy contract (campaign context)
- The player sees/hears: the freight's seal is Kessler's scale-stamp — the exact stamp, one scale, one clerk, nineteen years. The freight is not contraband; it is a surprise: alloy ordered in secret by someone's crew fund, misdeclared to dodge the desk fee, delivered to the wrong bay on the day everything stopped. The waybill's last line is unfinished: "FOR —"
- Payoff: deliver it to the pit line (poi_helios_pit_line) as-is: the crew fund's beneficiary is found (a retired scale clerk), the delivery completes a nineteen-year-old order, Tycho standing +5, codex page "For —".
- Build seam: scan context + delivery mission + codex overlay
- Effort: bespoke

### SP2-178 — The Lost Freight's Address
- Kind: easter-egg
- Where: sector_helios_prime, poi_helios_lost_freight
- Trigger: scan the lost freight, then dock at any station and check the lost-property board (SP2-086)
- The player sees/hears: the lost freight's label matches a luggage tag on the board: "CONTENTS: ONE (1) ENGINE, WAITING SINCE [DATE]. OWNER NOTIFIED 41 TIMES. OWNER IS THE WAITING PROBLEM." The freight is waiting for itself; the board is waiting for the freight; the loop is administrative and eternal.
- Payoff: carrying the tag (a mail attachment) to the freight closes both halves: the freight ships, the tag retires, one codex page "The Waiting Problem."
- Build seam: cross-reference between freight POI and lost-property board + codex overlay
- Effort: bespoke

### SP2-179 — The Pilgrim Mooring's Guest Book
- Kind: easter-egg
- Where: sector_helios_prime, poi_helios_pilgrim_moor
- Trigger: moor (hold position, low speed) at the mooring for 60+ seconds
- The player sees/hears: the mooring's guest book updates with every hull that has ever moored there, in handwriting, the most recent entry always half-finished — because every pilgrim moors mid-thought. The player's entry appears as they settle: "[CALLSIGN], ARRIVED —" and waits, cursor blinking, for the player to actually leave, at which point it reads "ARRIVED. DEPARTED. BETWEEN: EVERYTHING."
- Payoff: flag `mooring_between`; codex page "Between"; Helios standing +2.
- Build seam: hold-timer + text state machine + codex overlay
- Effort: bespoke

### SP2-180 — The Ash Pin's Second Age
- Kind: anomaly
- Where: sector_helios_prime / sector_ceres_belt, both ash pins (poi_helios_ash_pin, poi_ceres_ash_pin)
- Trigger: visit both ash pins in the same in-game week
- The player sees/hears: the pins are a pair — same stake design, same paint batch, same era — one in Helios, one in Ceres, marking the same incident from two ends. Reading both gives the full text neither holds alone. The middle of the text, the part neither pin carries, is the part everyone remembers and no one wrote down.
- Payoff: codex page "The Two Pins" (the middle line is the player's own campaign thread number); flag `pins_paired`.
- Build seam: two-visit flag + combined codex overlay
- Effort: data+glue

---

## H. One-off missions, encounters, and set-pieces with a story heart

### SP2-181 — The Escort Of One
- Kind: oneoff-mission
- Where: any sector
- Trigger: any civilian hull's distress fires while the player has a full cargo hold (the offer to help costs real capacity)
- The player sees/hears: a refugee convoy hull (Mara and the Children's make) broadcasts not for escort but for witness: "We do not need a gun. We need a second transponder on the lane so the toll men count two hulls, not one. Fly beside us. Ask for nothing. We will know what it cost you."
- Payoff: a hold-space sacrifice: the player jettisons nothing but flies slow and visible; completion grants no credits — a hand-painted child's drawing (inventory item) and Mara's standing +6, which later converts to a unique hull discount no other faction offers.
- Build seam: proximity escort check + standing + item; Mara voice per FIGURES (src/data/narrative.js)
- Effort: bespoke

### SP2-182 — The Bond Audit
- Kind: encounter
- Where: sector_tethys_junction, the weigh clamp
- Trigger: the clamp holds the player's hull (the tethys rumor's hazard) while the player is fully lawful — zero flags, zero contraband, zero debt
- The player sees/hears: the clamp inspects a perfect record and does not know what to do: "MANIFEST: CLEAN. SEAL: TRUE. DEBT: NONE. ANOMALY. ESCALATING TO SUPERVISOR. SUPERVISOR: YOU. SELF-AUDIT: [STAMP]." The clamp releases the player with an apology in triplicate.
- Payoff: the triplicate apology is an inventory item; presenting it at any desk waives one future clerical delay; flag `clamped_the_clamp`.
- Build seam: clamp hold check + lawful-state read + item
- Effort: bespoke

### SP2-183 — The False Gate Sparks
- Kind: visual-setpiece
- Where: sector_nyx_march, the False Gate memorial ring
- Trigger: during the march's storm season (seasonalWeather window), a lightning-grade surge grounds through the never-spun ring
- The player sees/hears: the gate that never once spun spins — one full rotation, under its own surge, witnessed by every pilot on the march. It turns exactly once and stops facing the door it was welded shut against. The fuel pellets on the rim all ignite at once, a held note, and go out together.
- Payoff: flag `false_gate_turned`; codex page "Once"; the gate's memorial plaque gains a second line: "IT TURNED. [DATE]. WE SAW."
- Build seam: seasonal surge window + single-rotation cue + plaque state; codex overlay
- Effort: bespoke

### SP2-184 — The Last Shift Witness
- Kind: oneoff-mission
- Where: sector_ceres_belt, world_site_ceres_second_measure (Second Measure Shipbreak)
- Trigger: after the player has read the Last Shift evidence (doss_ceres_last_shift flag), any Ceres bar regular asks the player directly
- The player sees/hears: "You read the shift report. You are one of maybe five living hulls who has. Read it to the yard, out loud, at the bell. The dead worked there. The yard should hear its own name said right." The job: one reading, one bell, no fee, no receipt — the payoff is that the yard's night crew starts leaving one light on for the shift that never clocked out.
- Payoff: flag `last_shift_read_aloud`; the yard's night light becomes permanent dressing; DMC standing +6; codex page "Said Right."
- Build seam: doss flag read + bell-window interaction + dressing state + codex overlay
- Effort: bespoke

### SP2-185 — The Impound Grudge Interview
- Kind: encounter
- Where: sector_sker_haven, the Reach impound shelf
- Trigger: the player's hull appears on the impound grudge ledger (impoundGrudge system holds a grudge) and the player approaches the shelf
- The player sees/hears: the shelf has a slot prepared for the player's hull — labeled, dated, one size too generous. "WE PREPARE FOR EVERYONE. MOST NEVER EARN IT. YOUR SLOT IS THE CORRECT SIZE FOR WHO YOU WILL BE IF YOU KEEP FLYING LIKE THIS. IT IS A COMPLIMENT AND A WARNING AND WE DO NOT DIFFERENTIATE."
- Payoff: clearing the grudge (settling the underlying fine) removes the slot and replaces it with the player's callsign in the "CLEARED" column, which is shorter and prouder; flag `slot_cleared`.
- Build seam: impoundGrudge state read (src/systems/impoundGrudge.js) + shelf dressing + flag
- Effort: bespoke

### SP2-186 — The Courier's Ghost Run
- Kind: oneoff-mission
- Where: any sector
- Trigger: the player accepts any courier contract while their transponder history shows they have flown that exact lane 10+ times (pattern match)
- The player sees/hears: the courier job brief appends one personal note from the dispatcher: "You know this lane better than the manifest does. Fly it from memory, not from the plot. If your wake matches the chart exactly, the lane learns nothing. If it doesn't, you are late. Be neither."
- Payoff: flying the lane with any deviation (within tolerance) pays a "memory bonus" — the dispatcher's trust flag unlocks their best contracts permanently; flag `lane_from_memory`.
- Build seam: lane-history read + deviation check + contract unlock flag
- Effort: bespoke

### SP2-187 — The Debt Collector's Duet
- Kind: encounter
- Where: any sector
- Trigger: the player carries any unpaid debt while hailing the creditor's own hull (not the station desk — the hull)
- The player sees/hears: the creditor's hull hails back, off the record: "The desk wants the number. I want the story. You are one good story from current. Tell it." The player's next three minutes of actual flight — any maneuvering, any assist to anyone, anything the hull can witness — becomes the story; the debt clears on witness alone.
- Payoff: debt cleared for flight rather than credits, once; flag `story_current`; the creditor thereafter greets the player as "the story."
- Build seam: debt-state read + witness-window check + economy debt seam
- Effort: bespoke

### SP2-188 — The Demo End's Uninvited Guest
- Kind: comms-event
- Where: any sector, at session end (end-of-demo wrap)
- Trigger: the player reaches any run-end condition with zero comms popups dismissed all session (attention stat)
- The player sees/hears: as the results sheet renders, one last popup arrives that was queued since minute one and never needed dismissing — it dismisses itself: "YOU READ EVERYTHING. THE CHANNEL NOTICED. THE CHANNEL IS MOSTLY NOISE. SO WAS MOST OF THIS. THANK YOU FOR THE PART THAT WASN'T."
- Payoff: flag `read_everything`; the results sheet gains one line; next session's ambient popups run 20% less noise (the channel respects the reader).
- Build seam: popup-dismiss counter + resultsSheet line (src/ui/screens/resultsSheet.js) + next-session cond tweak
- Effort: data+glue

### SP2-189 — The First Jump Attribution
- Kind: easter-egg
- Where: any sector, first inter-sector jump of the game
- Trigger: the first jump:arrive event of a save
- The player sees/hears: the arrival chime is followed, once, by the quietest possible registry line: "JUMP 1 LOGGED. WELCOME TO THE LANES. THE MASS KNEW YOU WERE COMING. IT ALWAYS DOES." Every subsequent jump increments a private counter the game never shows — until the 100th jump, when it shows it once: "JUMP 100. THE MASS STILL KNOWS. KEEP GOING."
- Payoff: flags `jump1_logged` and `jump100`; the tessera-lore refrain lands at the exact moment the player has earned it.
- Build seam: jump counter + two popup rows keyed to counts
- Effort: data+glue

### SP2-190 — The 47-A Refund
- Kind: easter-egg
- Where: sector_helios_prime, station_helios
- Trigger: 100+ in-game days since game start; dock at Helios
- The player sees/hears: Kessler, at Scale 4, processes one line of ancient paperwork without comment: Contract 47-A's withheld payment — released, in full, with interest, under a signature that reads "D. VALE, DORMANT." The amount is correct. The signature is correct. The release is the anomaly.
- Payoff: real credits (large); flag `47a_released`; the codex page for Contract 47-A changes tense — from "payment withheld" to "payment released"; nothing else about the campaign changes, which is exactly the point.
- Build seam: day gate + credits payout + codex tense swap (codexPages overlay variant)
- Effort: data+glue

### SP2-191 — The 47-B Cold Call
- Kind: oneoff-mission
- Where: sector_ashfall_reach, post-ending continuation route
- Trigger: after ending E has been filed (spine flags) and the player returns to any Ashfall berth
- The player sees/hears: the courier does not ask again — but a different voice does, once: "47-B is the open work. 47-A stays closed. This is not 47-A. It is smaller, quieter, and it pays in the only currency the Reach respects: done." The job: one unlisted run, no manifest, one blank page in the packet.
- Payoff: accepting and reading the blank page (refusing to fill it) is the correct play — "A manifest with blank pages is a blank check on your hull" — and Kael's warning pays off: return the packet un-filled for the only payout in the game that comes with an apology attached.
- Build seam: spine end-state gate + one-off mission + packet item state machine
- Effort: bespoke

### SP2-192 — The B8 Coordinates Bloom
- Kind: anomaly
- Where: sector_veil_nebula, the coordinate file's "does not resolve" point
- Trigger: the story_b8_helix_audit flag exists AND the player flies to the manifest's unresolvable coordinates anyway
- The player sees/hears: the coordinates resolve — for the player, standing in the right spot, with the salvaged communicator in hold: a bloom of Helix variance pings, all pointing at one empty patch of space that is, by every instrument, exactly one hull-sized hole in the universe. The hole is where the Tessera was when the audit filed it. The file was never wrong. The file was a photograph.
- Payoff: flag `b8_resolved`; codex page "The Photograph"; Helix standing +3 (they have waited years for someone to stand there).
- Build seam: flag + coordinate POI reveal + codex overlay
- Effort: bespoke

### SP2-193 — The Endings' Return Mail
- Kind: comms-event
- Where: any sector, post-ending continuation
- Trigger: 7+ in-game days after any ending filed (spine end-state)
- The player sees/hears: one letter per ending, addressed to whoever the player chose to become: A gets the watch's roster with one new name; B gets a routing seat's vacancy notice, unclaimed; C gets a berth assignment at "the same berth"; D gets the desk's own desk-key inventory tag; E gets one blank page and a stamp: "47-B: OPEN."
- Payoff: each is pure closure-mail; all five write a single persistent flag each that colors the post-game dock voice (ENDING_STATION_ACK variants).
- Build seam: mail.js rows keyed to spine end-state + dock-voice variant
- Effort: data+glue

### SP2-194 — The Kurtz Desk's Second Count
- Kind: world-oneoff
- Where: sector_ashfall_reach, Kurtz's desk
- Trigger: after SP2-160 (counted_42), return once more
- The player sees/hears: Kurtz's count has a new final line, chalked where only a returning pilot will see it: "42 PRESENT. 41 ACCOUNTED. THE DIFFERENCE IS THE ONE THAT STAYS." The difference is the player — the only hull that came back after being counted. Kurtz's ledger, for the first time, is open to a blank page with the player's callsign at the top.
- Payoff: the player's page stays open forever (the one ledger line Kurtz will not close); flag `ledger_open`; Ashfall standing +6.
- Build seam: post-SP2-160 dressing + persistent ledger page + flag
- Effort: data+glue

### SP2-195 — The Margin's Correction Of Record
- Kind: comms-event
- Where: any sector
- Trigger: after the player's vonn_interview (SP2-073), 30+ days later
- The player sees/hears: Lira Vonn publishes a correction — to an article about the player that she never wrote: "THE MARGIN DOES NOT CORRECT RUMORS. THE MARGIN REPLACES THEM. THE PILOT IN QUESTION IS [DEED-LINE]. THE RUMOR IS [ROUMOR-LINE]. ONE OF THESE IS FILED." Her filing system files only one kind of thing.
- Payoff: flag `margin_correction`; the news crawl permanently favors deed-lines over rumor-lines about the player (a real presentation bias); codex page "The Filed Kind."
- Build seam: news crawl weighting variant + codex overlay; deed lines via deedPhrases.js
- Effort: bespoke

### SP2-196 — The Yard Family Reunion
- Kind: visual-setpiece
- Where: sector_ashfall_reach, the Pitborn anchorage
- Trigger: the player arrives while carrying any hull part/cargo stamped from a Pitborn yard (provenance check)
- The player sees/hears: the anchorage's cull channel erupts: the part the player carries was welded by someone's mother. The whole yard turns out, every hull running its work lights, and the crowd (all of them) rates the player's approach — the Cull meter, repurposed as applause. "COUNT 'EM" is sung once, at the player, in the good way.
- Payoff: flag `yard_reunion`; Pitborn standing +8; the part's provenance stamp gains a signature.
- Build seam: provenance read + cull-meter crowd cue + flag
- Effort: bespoke

### SP2-197 — The Demob Line
- Kind: easter-egg
- Where: any sector
- Trigger: the player's session passes 3 real in-game days of continuous play without death (persistence counter)
- The player sees/hears: the Tessera's bulkhead gains one line of graffiti, in the player's hand: "STILL FLYING." Under it, in older paint, faded: the gang's tally marks — seven runs. The player's line adds an eighth. The bulkhead remembers who added to the count.
- Payoff: permanent bulkhead dressing; flag `eighth_run`; codex page "Eight."
- Build seam: session-persistence counter + bulkhead graffiti state (GRAFFITI corpus) + codex overlay
- Effort: data+glue

### SP2-198 — The Quiet's One Question
- Kind: comms-event
- Where: any sector
- Trigger: after 10+ Quiet transactions AND one moment where the player did NOT take an offered advantage (a refused-fence-bonus deed)
- The player sees/hears: The Quiet break register — one question, on no channel, from no sender: "WHY." The question hangs for a full ten seconds. Then, before any answer could matter: "RETRACTED. THE ANSWER IS KNOWN. THE QUESTION WAS COURTESY. FLY CLEAN."
- Payoff: flag `quiet_courtesy`; Quiet standing +5; the Quiet's future receipts carry a lowercase "thanks" — the second one in their recorded history.
- Build seam: refusal-deed read + popup row + receipt variant
- Effort: data+glue

### SP2-199 — The Registry's Last Field
- Kind: easter-egg
- Where: any sector
- Trigger: after the late_registry_unknown popup (operator: UNKNOWN) has fired, the player dock-hops to every station in their home sector in one session
- The player sees/hears: at the last station, the registry pings one final line: "OPERATOR FIELD REVIEW: UNKNOWN IS A STATUS, NOT AN ERASURE. THE FIELD REMAINS. THE FIELD IS WAITING FOR A VALUE. THIS IS THE ADMINISTRATIVE DEFINITION OF HOPE."
- Payoff: flag `field_waiting`; the player's registry line, wherever displayed, gains a blinking cursor after UNKNOWN — permanent, cosmetic, devastating.
- Build seam: station-crawl check + registry dressing + flag
- Effort: data+glue

### SP2-200 — The Mass Signs Off
- Kind: comms-event
- Where: any sector, at the true end of the player's longest session (end-of-run wrap)
- Trigger: end-of-run conditions with the campaign thread at any beat AND the player's deed record non-empty
- The player sees/hears: every system the player touched sends one final line, in order of first contact, at one-second intervals — the dockmaster, the scale, the bell, the buoy, the mast, the bar. The last line is always the same, from no sender, lowercase, one sentence: "the mass knew you. the mass signs off. the mass will know you again."
- Payoff: the run's sign-off receipt persists to the next session's first popup: "the mass resumed." Continuity made explicit; flag `mass_signs_off`.
- Build seam: end-of-run orchestration in the story/results seam + first-popup-next-session row; the line joins the GRAFFITI/comms corpus
- Effort: bespoke

---

## Seam map

- **Comms popups** enter via the `comms:popup` event over the `COMMS` tables in `src/data/narrative.js` (ambient/traps/personal/late/story, `cond` predicates against live state, `once`/`persist` seen-flags) — rendered by `src/ui/comms.js` and the radial in `src/ui/commsRadial.js`. DIRTY this sitting (foreign work in flight) — prefer a parallel data file (`src/data/commsWhispers.js`) consumed by the same seam.
- **Mail** enters via `src/data/mail.js` (MAIL_LETTERS, kinds cast/job/spam/fan/hate/bill/crew) with a conjunctive trigger vocabulary (event/day/window/beat/stat/deed/rep/heat/flag/cargo/docked/ship/credits) evaluated by `src/systems/mail.js`; one-time delivery = every conjunct witnessed once. narrative.js (same lore corpus) is dirty.
- **Bar contacts & station social life** enter via `src/ui/station/barContacts.js` (CANONICAL_CONTACTS, fenceContact, Kurtz desk, Orrin witness case, Vonn freight loss) rendered by `src/ui/station/screens/bar.js`; authored per-station bar leads live in `AUTHORED_DOCK_RUMORS` in `src/data/frontierRumors.js`. Both bar files are DIRTY (foreign).
- **Rumors** are knowledge cards: `src/data/frontierRumors.js` owns purchased/resolved records (`state.world.frontierRumors.byId[id].phase`), consumed by bar + map code; new rumor cards are pure data rows.
- **Codex pages** enter via `src/data/codexPages.js` (canonical text + CODEX_OVERLAYS attribution; locked hints in `CODEX_LOCKED_HINTS`), discovery-gated by `src/ui/sim/codexPages.js`, rendered by `src/ui/screens/codex.js` (DIRTY — request, don't edit; a new overlay row is additive and safe).
- **Hidden caches / one-off secrets**: the standing patterns are `src/data/pallasHiddenCache.js` (clue POI → search circle → 3-way choice → terminal receipt), `src/data/vestaOreCache.js`, `src/data/numbersShadow.js` (occluder-shadowed numbers station naming a real reward POI), and `src/data/worldOneOffs.js` (68 texture one-offs, rope caches, `HELIOS_ROPE_CACHE`); census test `test/one-off-census.test.mjs` fails loudly if a one-off lacks a sector/chart mapping.
- **Machine-people continuity**: per-character data + memory (`src/data/morrow.js` `freshMorrowMemory`, `src/data/vesper.js`, `src/data/quill.js` copy-stamp, `src/data/ruud.js`) — line tables are additive; memory state is save-carried per character.
- **One-time persistence**: `state.story.flags` (generic), `state.story.campaign47a.flags` (spine-owned; the spine writes only its own), `state.story.depthProgramEncounters.completed[shapeId]`, per-character memory records, and `state.world.frontierRumors` phases — all save-carried through the adventure save path (`adventureMigration.js`/`saveVersion.js` normalize on load). One-off easter eggs should write exactly one flag on their terminal receipt and never clear it.
- **Faction voices** for any comms line: the 14-register corpus in `src/data/barks.js` (deterministic `barkFor(factionId, situation, rng)`; index 0 of every cell must stay the shipped line) plus per-faction culture data in `src/data/factions/*.js` (one file per flag, `custom` booleans are the culture contract).
- **Calendar/shift triggers**: `src/data/worldCalendar.js` (`stationShiftAt`, `barPressureAt`, `festivalAt`) and `src/data/seasonalWeather.js` are the determinism-safe time windows; nothing in this catalog uses wall time.
- **Dirty-path caution**: `src/data/narrative.js`, `src/story/storyLedger.js`, `src/story/campaign47a/*`, `src/ui/screens/codex.js`, `src/ui/station/bar*`, `src/systems/moralMemory.js`, `src/systems/impoundGrudge.js` are foreign-dirty this sitting — every proposal that touches them REQUESTS their vocabulary (flags, receipts, counters) and prefers new data files plus thin interpreters.
