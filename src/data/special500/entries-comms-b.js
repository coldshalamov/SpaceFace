// src/data/special500/entries-comms-b.js — batch cat-comms-b (39 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-comms-b.json). Rules applied:
//   - Every receipt trigger names a bus event verified against src/systems
//     emitters (grep bus.emit): vael:patrolHail (faction_vael.js), ai:flee
//     (ai.js/pirateDisengage.js — the escape, not the kill), npcJobs:
//     towAssistComplete (npcJobsRuntime.js), rescuedWorker:returned
//     (rescuedWorkerReturn.js — the completed-rescue receipt; rescue:complete
//     is onboarding-only), archive:indexRead (faction_archive.js),
//     mission:completed, dock:docked, combat:outcome (combatOutcome.js —
//     nearest verified causal for "disabled a hunter"; the first-disable
//     counter is glue), helix:manifestFiled (the player files a manifest at
//     the desk), helix:finePaid, choir:bellPulse (faction_choir.js — nearest
//     causal for a clean pulse; the zero-crystal condition is glue),
//     scan:completed, deniable:fenceThanked (encounterDirector.js),
//     history:deadNoted, calendar:stormSeason (worldClock.js — the surge
//     start), story:beatAdvanced (story.js — the beat whose content carries
//     the manifest_silent_correct hudLie; B1 and B5).
//   - Every sector id is real in the live SECTORS assembly (src/data/sectors.js
//     + src/data/frontierRegions/*). NO sector remaps: every consensus-named
//     sector resolves as-is, including sector_phoebe_echo (the wave-1 remap to
//     sector_io_reach predates that sector's assembly; it is live now).
//   - Chains (trigger flag.requires): SP2-154 on special500.SP2-029 (landed,
//     entries-egg-a.js), SP2-195 on special500.SP2-073 (landed,
//     entries-comms-a.js), SP2-032 on special500.SP2-122 (Quill's Second Copy,
//     not yet landed — the chain waits for that batch by design).
//   - Anchors verified: poi_vesta_red_cable_yard, poi_helios_choir_tender,
//     poi_vesta_cold_line, poi_helios_tally, station_helios,
//     station_kepler_scar (stand-in for the Unbroken mast's unregistered
//     dead-corvette ring), poi_bounty (Sker "Bounty Wrecks" stakeout field),
//     poi_pallas_tag_drift (the Drift Tag lane buoy).
//   - SP3-093 keys to SP3-083's landed calendar row (day 9, window [250,345]):
//     the announcement is the 30 s lead-in. SP3-078 and the standing broadcasts
//     recur per 40-day year; seeded-daily entries map to hashDaily per the
//     brief (chance 1.0 = the guaranteed first nightly roll).
//   - Applied hones: SP2-154 keyed to hailing (no free-form transmit);
//     SP3-093 promises announcement + apron flood dim only (no traffic
//     re-route); SP3-108 keeps the plain "Dock Choir" name; SP3-109 makes bay
//     7's canon emptiness the joke; SP3-129 renames the lost hull off Wren to
//     an ordinary name-pool ship.

export const ENTRIES_COMMS_B = [
  // SP2-108 — The Vael Contract Language Lesson: a clean-hulled Vael patrol
  // drops the book and opens the floor. The clean state rides the patrol-hail
  // payload (no stains, no open invoices); count-gate folded into the followup.
  // Interactive core (the player's sentence becomes a term) — bespoke leg.
  {
    id: 'SP2-108',
    kind: 'comms-event',
    title: 'The Vael Contract Language Lesson',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'receipt', event: 'vael:patrolHail' },
    channel: 'memory',
    followup: 'Clause 0 on the Vael patrol-hail path: the player\'s next transmission banks as a remembered term — kind wording schedules one free tow (fires once, with a receipt the player can read); rude wording files an itemized insult bill that never closes. Flag clause_zero_open; read the clean-state row (no stains, no open invoices) the patrol hail already carries.',
    payload: {
      text: 'The Vael hull answers in perfect trade-common, for the first time: "CLAUSE 0: NO CLAUSE APPLIES. CONVERSATION IS OPEN. STATE YOUR TERM." Whatever you say next is, formally, a contract the Vael will remember.',
    },
  },

  // SP1-013 — The Parley Chit: three escapes buy a parley. ai:flee is the
  // pirate's own disengage receipt (pirateDisengage.js); the escape counter is
  // glue, the sector gate stands in for "in a sector".
  {
    id: 'SP1-013',
    kind: 'comms-event',
    title: 'The Parley Chit',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'ai:flee' },
    channel: 'comms',
    payload: {
      from: 'Reach voice, no callsign',
      text: 'Third chase this run you have made more expensive than the cargo, and the voice you have never let catch up finally transmits direct: "You\'re expensive to chase. Cheaper to talk." They are selling the bearing of their rival pack\'s stash — for you, not for them — if you keep their name out of it.',
      ttl: 8,
    },
    dormant: true,
    dormantReason: "ai:flee is not the player's third escape (wing/AI flee emits share the event); needs a player-escape receipt.",
  },

  // SP2-015 — The Station That Counts Itself: the Red Cable Yard repeats the
  // player's own last hail back, once. Proximity tell; the state-comparison
  // leg and codex overlay are glue (flag yard_echo_heard).
  {
    id: 'SP2-015',
    kind: 'comms-event',
    title: 'The Station That Counts Itself',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_red_cable_yard', wu: 900 },
    channel: 'comms',
    payload: {
      from: 'Red Cable Yard',
      text: 'The yard\'s count is off by one. The extra cadence sounds a lot like a hail, played back once, note for note — then the yard goes back to counting hulls. It counts. It rehearses.',
      ttl: 8,
    },
  },
  // SP1-139 — The Quiet Hours: Helios' nightly song for empty lanes. Seeded
  // daily per the consensus — hashDaily chance 1.0 lands it on the player's
  // first night in the sector; the nightly recurrence is the world texture.
  {
    id: 'SP1-139',
    kind: 'comms-event',
    title: 'The Quiet Hours',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 1.0 },
    channel: 'commsLog',
    payload: {
      from: 'Helios traffic',
      text: 'At some hours the station\'s band plays one song for empty lanes and holds one rule: nobody talks over it. Approach traffic goes silent and dances its docking in lights until the song ends.',
    },
  },

  // SP2-124 — The Eighth Bell Answers: a clean pulse, and the Eighth Bell
  // rings unscheduled. choir:bellPulse is the pulse receipt; the zero-crystal
  // check and the extra-ribbon flag are glue. Audio moment — spectacle.
  {
    id: 'SP2-124',
    kind: 'comms-event',
    title: 'The Eighth Bell Answers',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'choir:bellPulse' },
    channel: 'spectacle',
    payload: {
      from: 'The Choir',
      text: 'Your pulse chain comes up empty — nothing shattered, no hull billed — and the Eighth Bell rings once with nothing driving it. An unscheduled note. The Choir\'s channel, in a register it has never used on an open band: "It does not do that. It has never done that. We have decided to call it approval. We have decided not to examine the decision."',
    },
  },

  // SP2-125 — The Blind Welder Sees You: two assists across the campaign and
  // the sensor-dead barge learns your wake. npcJobs:towAssistComplete is the
  // assist receipt; the twice-count and the free hull-patch flag are glue.
  {
    id: 'SP2-125',
    kind: 'comms-event',
    title: 'The Blind Welder Sees You',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'npcJobs:towAssistComplete', nth: 2 },
    channel: 'comms',
    payload: {
      from: 'The Blind Welder',
      text: 'The sensor-dead barge hails with perfect confidence: "Second time. I know your wake now. I see you the way the blind see: by the shape you make in things. You make a straight shape. Straight shapes are welcome here."',
      ttl: 8,
    },
  },

  // SP1-145 — The Missed Connection: the rescued party posts for you two
  // sector-days later. rescuedWorker:returned is the completed-rescue receipt;
  // the dock meeting and the saved-up gift are the bespoke leg.
  {
    id: 'SP1-145',
    kind: 'comms-event',
    title: 'The Missed Connection',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescuedWorker:returned' },
    channel: 'memory',
    followup: 'Rescue follow-up scene keyed to the returned-worker receipt flag: any station dock offers the meeting — the rescued family\'s own accounting of that day, which is nothing like yours — and hands over the thing they saved up for you (a modules.js one-off, never money).',
    payload: {
      text: 'A notice on the band, awkward and formal, looking for "the hull that answered, description follows" — and the description is yours, itemized with embarrassing accuracy, down to a dent you had forgotten. The poster has something to say and could not find you until now.',
    },
  },
  // SP2-026 — The Frequency Nobody Owns: the nebula hums the Vesper phrase.
  // First entry into full occlusion stands in for the 45 s occlusion roll
  // (no occlusion-state trigger in the deterministic vocabulary); the audio
  // leg keys off the recorded receipt in a later batch.
  {
    id: 'SP2-026',
    kind: 'comms-event',
    title: 'The Frequency Nobody Owns',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'the murk',
      text: 'Deep in the occlusion, scanner empty, the band carries a tone pattern nobody owns: the Vesper phrase — LOW HIGH MIDDLE — two octaves down, played by something that is not Vesper. It stops mid-note the moment the murk breaks, like a door closed gently from the other side.',
    },
  },

  // SP2-030 — The Archive's Wrong Number: a misrouted internal after the
  // player has been reading. archive:indexRead is the reading receipt (the
  // codex-page counter is glue).
  {
    id: 'SP2-030',
    kind: 'comms-event',
    title: "The Archive's Wrong Number",
    sectors: [],
    trigger: { type: 'receipt', event: 'archive:indexRead' },
    channel: 'comms',
    payload: {
      from: 'ARCHIVE ROUTER',
      text: 'A misrouted internal, addressed to a desk that does not answer: "REQUEST 44-C/SEALED — LOCATE ONE (1) COPY OF LEDGER, KURTZ, PERSONAL. STATUS: NOT MISSING. WITHHELD. WITHHELD BY: [FIELD LEFT BLANK]." The Archive has already logged the leak. The Archive always logs its own leaks.',
      ttl: 7,
    },
  },

  // SP2-048 — The Understudy Letter: the bar's pool on you. mission:completed
  // is the contract receipt; the third-mission count and the cheaper bar tab
  // are glue.
  {
    id: 'SP2-048',
    kind: 'comms-event',
    title: 'The Understudy Letter',
    sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed' },
    channel: 'comms',
    payload: {
      from: 'A REGULAR WHO KNOWS A REGULAR',
      text: '"TO: THE PILOT. The bar has started a pool on you. Not against you. On you. Current line says you make it to a capital hull. Payout is drinks for everyone, which is why everyone has been so nice to you lately. Do not break character."',
      ttl: 8,
    },
  },

  // SP2-154 — The Phoebe Encore: the retired channel signs back. Chained
  // behind SP2-029's buoy-keeping (landed); the hones keep it keyed to
  // hailing — the catalog line is the encore tell, the replay leg is glue.
  {
    id: 'SP2-154',
    kind: 'comms-event',
    title: 'The Phoebe Encore',
    sectors: ['sector_phoebe_echo'],
    trigger: { type: 'proximity', nearStation: 'poi_phoebe_echo', wu: 400 },
    after: ['SP2-029'],
    channel: 'commsLog',
    payload: {
      from: 'Phoebe Echo array',
      text: 'Hail the retired channel and the array gives it back to you — once, clean — then appends two notes. The old-timers in any bar will name them for you later: the array operator\'s signature. She is still signing work. The channel is "retired" because she is; the array disagrees.',
    },
  },
  // SP2-049 — Hate Mail, Specific: the cousin of a hunter you stopped.
  // combat:outcome is the nearest verified causal for a disable (the
  // first-disable-on-a-hunter counter is glue).
  {
    id: 'SP2-049',
    kind: 'comms-event',
    title: 'Hate Mail, Specific',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:outcome' },
    channel: 'comms',
    payload: {
      from: 'no return address',
      text: '"TO: WHOMEVER. MY COUSIN HUNTS. YOUR WAKE UNHUNTED HIM. HE IS FINE. HE IS FURIOUS. HE HAS YOUR REGISTRATION NUMBER MEMORIZED AS A PRAYER. GOOD LUCK WITH THE PRAYER."',
      ttl: 7,
    },
  },

  // SP1-133 — The Bet: two haulers argue their way across three stations.
  // Seeded twice per sector week; the structured arc and the judgment choice
  // are the bespoke leg.
  {
    id: 'SP1-133',
    kind: 'comms-event',
    title: 'The Bet',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.28 },
    channel: 'memory',
    followup: 'Three-station comms arc keyed to dock events: each docking adds a cited measurement to the queue-versus-forge argument; at the third stop the comms choice judges — right pays a cut of the pot and two named acquaintances, wrong pays nothing but their grace, and the wire runs the result either way.',
    payload: {
      text: 'Two haulers are having an argument on the open band about whether the Ceres queue or the Forge queue moves faster, with money on it, and the argument is STRUCTURED: measurements, sources, one of them increasingly obviously wrong. At the third stop they will ask the nearest neutral hull to settle it. That hull is you.',
    },
  },

  // SP2-176 — The Choir Tender's Lullaby: the hospital bell and the harmony
  // answer. Proximity to the tender during the calendar's daily note; the
  // pitch-varies-by-day-seed detail is the audio leg.
  {
    id: 'SP2-176',
    kind: 'comms-event',
    title: "The Choir Tender's Lullaby",
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_choir_tender', wu: 500 },
    channel: 'spectacle',
    payload: {
      from: 'Relief-Freighter Choir-Tender',
      text: 'The dead tender\'s bell rings one note — no crew, no power, one note a day, pitch set by the calendar and always resolving the same — and every Choir hull in three sectors answers it in harmony, mid-shift, no explanation filed. It is the first note of a lullaby. The tender was a hospital ship before it was a wreck.',
    },
  },

  // SP1-135 — The Tower's Favorites: ten dockings and traffic control has a
  // relationship with you. dock:docked is the receipt; the per-station count
  // and the berth preference are glue.
  {
    id: 'SP1-135',
    kind: 'comms-event',
    title: "The Tower's Favorites",
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'comms',
    payload: {
      from: 'Traffic control',
      text: 'Traffic control has developed opinions. "Tower to hull 4471-T: welcome back. Berth 12, as usual. Try not to dent 12." The regulars on the band consider this high society. The one day you dock sloppily, the whole approach goes quiet, and the tower says only: "...noted."',
      ttl: 7,
    },
    dormant: true,
    dormantReason: "Hardcodes hull 4471-T and Berth 12 and promises a sloppy-dock beat; needs per-station dock counts and the player callsign.",
  },
  // SP1-136 — The Broadcast Will: a dying captain's live will names the
  // nearest clean hull. Seeded rare; the sensor-math inheritance, the contest
  // fight and the witness refusal are the bespoke leg.
  {
    id: 'SP1-136',
    kind: 'comms-event',
    title: 'The Broadcast Will',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'hashDaily', chance: 0.02 },
    channel: 'memory',
    followup: 'Self-registered inheritance encounter: compute the true nearest hull, spawn the bequest as a disabled hulk (1210 grant pattern), and run the contest — claim it (a real fight, a real registry battle at the dock) or refuse on-band and be named witness instead, which pays nothing and changes how executors treat you forever.',
    payload: {
      text: 'A dying captain wills his ship live on the band — "to the nearest hull with a clean registry, no offense" — and the nearest hull, per the actual sensor math, is you. Four other hulls dispute the math. One of them has stopped disputing and started moving.',
    },
  },

  // SP2-094 — The Concord Form That Files You Back: your paperwork becomes a
  // form number. helix:manifestFiled is the player-files-forms receipt; the
  // twenty-count and the letter-header variant are glue.
  {
    id: 'SP2-094',
    kind: 'comms-event',
    title: 'The Concord Form That Files You Back',
    sectors: [],
    trigger: { type: 'receipt', event: 'helix:manifestFiled' },
    channel: 'comms',
    payload: {
      from: 'CONCORD RECORDS',
      text: '"NOTICE OF RECIPROCAL FILING: YOUR PATTERNS HAVE BEEN FILED AS A FORM. FORM NUMBER ASSIGNED: 44-C-P1. YOU ARE NOW CITABLE." Within the week, unrelated correspondence begins citing you by form number.',
      ttl: 8,
    },
  },

  // SP2-113 — The Helix Invoice Poem: the unauthorized footer verse.
  // helix:finePaid is the pay-a-fine receipt; the tenth-payment count is glue.
  {
    id: 'SP2-113',
    kind: 'comms-event',
    title: 'The Helix Invoice Poem',
    sectors: [],
    trigger: { type: 'receipt', event: 'helix:finePaid', nth: 10 },
    channel: 'comms',
    payload: {
      from: 'HELIX DIRECTORATE',
      text: 'The fine receipt prints with a verse in the footer, where no verse has ever been: "THE FINE IS THE PRICE / OF KNOWING THE PRICE / OF THE ROAD." It runs on every tenth payment, by unwritten rule. A Helix clerk confirms it is unauthorized, has been unauthorized for years, and that removing it is "queued."',
      ttl: 8,
    },
  },

  // SP2-131 — The Cold Drill Four Broadcast: the derelict's shift roll call.
  // Proximity during the deep-night stand-in; the PA audio row is glue.
  {
    id: 'SP2-131',
    kind: 'comms-event',
    title: 'The Cold Drill Four Broadcast',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_cold_line', wu: 400 },
    channel: 'commsLog',
    payload: {
      from: 'Cold Drill Four',
      text: 'The derelict drill\'s PA crackles into a shift-change roll call for a crew that has not assembled in years: "COLD FOUR, NIGHT WATCH: REPORT. ... REPORT. ... ALL POSITIONS NOTED AS PRESENT. GOOD WATCH." One hundred percent faithful to the original audio, including the pause where the last name should be.',
    },
  },
  // SP1-138 — The Blind: a hunter stakeout's open channel. Proximity to the
  // Bounty Wrecks field; the sell-or-sit choice is the bespoke leg.
  {
    id: 'SP1-138',
    kind: 'comms-event',
    title: 'The Blind',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_bounty', wu: 800 },
    channel: 'memory',
    followup: 'Overheard-plan encounter at the Bounty Wrecks field: sell the plan to the quarry (they pay, and become a named contact) or sit on it — the takedown runs on schedule, watchable, and the hunters tip the professionals who stayed out of the line.',
    payload: {
      text: 'You drift through a hunter team\'s comms discipline by accident: target descriptions, shift changes, the quarry\'s known habits — crisp argot, all audible, none of it about you. They are professionals mid-job and the band is their workplace. Then the quarry\'s engine note passes under everyone\'s, including yours.',
    },
  },

  // SP3-078 — Rock Crossing Warning: the wire posted it, and it happens on
  // schedule. Recurring calendar convoy; the deterministic spawn leg is glue.
  {
    id: 'SP3-078',
    kind: 'comms-event',
    title: 'Rock Crossing Warning',
    sectors: ['sector_kepler_scar', 'sector_ashfall_reach'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [200, 260] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'the Scar lane',
      text: 'The wire posted it yesterday and the wire was right: at exactly the posted minute a forty-meter iron crosses the lane — a dark boulder, three blinking survey lamps, a lit tail of dust, escorted by a bored tender skiff that would rather be anywhere else. Traffic gives it room. So does the skiff, mostly.',
    },
  },

  // SP2-034 — The Unguided Tour: the Double Take stash rack's recorded
  // narration. scan:completed gated to the rack's sector; the cache POI and
  // codex overlay are glue.
  {
    id: 'SP2-034',
    kind: 'comms-event',
    title: 'The Unguided Tour',
    sectors: ['sector_proteus_well'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'commsLog',
    payload: {
      from: 'recorded narration',
      text: 'The scan finishes and a tour narration plays — dry, over-produced: "On your left, the dead boatbay. On your right, the stash rack the first crew named and the second crew endorsed. Note the load-bearing silence. Tours depart never." The reverb tail gives it away: it was recorded in that bay.',
    },
  },

  // SP2-195 — The Margin's Correction Of Record: Vonn replaces a rumor with a
  // deed. Chained behind her interview (SP2-073, landed); the "30+ days" beat
  // is carried in the text. The crawl-weighting change is the bespoke leg.
  {
    id: 'SP2-195',
    kind: 'comms-event',
    title: "The Margin's Correction Of Record",
    sectors: [],
    trigger: { type: 'flag', requires: 'special500.SP2-073' },
    channel: 'news',
    payload: {
      text: 'A month after the interview she billed nobody for, Lira Vonn publishes a correction — to an article about you that she never wrote: "THE MARGIN DOES NOT CORRECT RUMORS. THE MARGIN REPLACES THEM. THE PILOT IN QUESTION IS [DEED-LINE]. THE RUMOR IS [RUMOR-LINE]. ONE OF THESE IS FILED." Her filing system files only one kind of thing.',
      kind: 'incidents',
    },
    dormant: true,
    dormantReason: "Chained on the dormant SP2-073 and its copy carries unfilled DEED-LINE / RUMOR-LINE tokens; needs a deed ledger read.",
  },
  // SP3-093 — The Pour Announcement: thirty seconds of warning before the
  // landed SP3-083 pour (day 9, window [250,345]). Hones: announcement +
  // apron flood dim only — the job director does not re-route traffic on a
  // popup.
  {
    id: 'SP3-093',
    kind: 'comms-event',
    title: 'The Pour Announcement',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 9, windowS: [220, 250] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'FORGE WIRE: pour in thirty. Channel is hot. Give the spine room. The apron floods dim on schedule and the foundry floor stands down to watch-light — industry, rehearsed.',
      kind: 'incidents',
    },
  },

  // SP1-007 — The Ransom Buoy: a lane buoy reads the debtors' roll. Proximity
  // to the Drift Tag lane buoy; the run-history list generation is glue.
  {
    id: 'SP1-007',
    kind: 'comms-event',
    title: 'The Ransom Buoy',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pallas_tag_drift', wu: 600 },
    channel: 'comms',
    payload: {
      from: 'lane buoy, official',
      text: 'A lane buoy transmits a rolling list of "captains of interest" — dry, official Reach bookkeeping: names, unpaid tithes, interest accrued, updated while you listen. One entry matches a callsign you met earlier this run. The buoy does not editorialize. It does not have to.',
      ttl: 7,
    },
  },

  // SP3-108 — The Dock Choir: docking chatter as audible texture. Proximity
  // during the rush stand-in; the STATION_LIFE_AUDIO_RECIPES row is glue.
  {
    id: 'SP3-108',
    kind: 'comms-event',
    title: 'The Dock Choir',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 250 },
    channel: 'spectacle',
    payload: {
      from: 'Helios apron',
      text: 'Inside the approach, the docking chatter stops being noise and becomes texture: overlapping approach calls, berth assignments, one voice always slightly behind the others. It ducks under anything urgent and fills the rest. The apron has a choir, and it is made of work.',
    },
  },

  // SP2-045 — Chain Letter, Quiet Edition: arrives after Quiet business and
  // denies its own existence. deniable:fenceThanked is the fence receipt; the
  // self-redacting log line is glue.
  {
    id: 'SP2-045',
    kind: 'comms-event',
    title: 'Chain Letter, Quiet Edition',
    sectors: [],
    trigger: { type: 'receipt', event: 'deniable:fenceThanked' },
    channel: 'comms',
    payload: {
      from: '[NO SENDER]',
      text: '"THIS MESSAGE IS NOT A CHAIN LETTER. DO NOT FORWARD IT. FORWARDING IT IS HOW IT MOVES. YOU HAVE NOT READ THIS."',
      ttl: 6,
    },
  },
  // SP3-109 — Bay Seven's Cargo: the weekly unattended-cargo popup, and why
  // (hones: bay 7's canon emptiness is the joke the regulars explain). The
  // keyed pickup spawn is glue.
  {
    id: 'SP3-109',
    kind: 'comms-event',
    title: "Bay Seven's Cargo",
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'comms',
    payload: {
      from: 'station wire',
      text: '"UNATTENDED CARGO, BAY 7. CLAIM OR IT DRILLS." Bay 7, the regulars will tell you, has been empty for nine years — which is exactly why the wire uses it: nothing in bay 7 has ever contradicted the wire yet. Nobody has ever found a pod there to claim, and the regulars take that as proof the wire is working.',
      ttl: 7,
    },
  },

  // SP2-052 — Mira Fixes It: the manifest self-corrects and Bourse Freight
  // takes credit, retroactively. story:beatAdvanced is the verified beat
  // receipt — the beat whose content carries the manifest_silent_correct
  // hudLie (B1 and B5, narrative.js). The dated-one-hour-early stamp and the
  // audit-trap suppression are glue.
  {
    id: 'SP2-052',
    kind: 'comms-event',
    title: 'Mira Fixes It',
    sectors: [],
    trigger: { type: 'receipt', event: 'story:beatAdvanced' },
    channel: 'comms',
    payload: {
      from: 'Bourse Freight',
      text: 'One untraceable line: "The manifest was always correct. You misread it. I have corrected your misreading. — Mira." The message is dated one hour before the correction happened. You checked. You did not misread it.',
      ttl: 7,
    },
  },

  // SP2-060 — The Long Silence Follow-Up: Kael notices a hermit stretch.
  // "Not docked for 3+ days" has no receipt — absence is not an event — so it
  // lands in a fixed save-age window (day 3); the no-dock counter and the
  // drink token are glue.
  {
    id: 'SP2-060',
    kind: 'comms-event',
    title: 'The Long Silence Follow-Up',
    sectors: [],
    trigger: { type: 'simWindow', startS: 1860, endS: 2400 },
    channel: 'comms',
    payload: {
      from: 'Kael',
      text: 'One letter, no subject line: "Three days in. Either you are rich, dead, or thinking. All three end at my bar eventually. Rate your odds on the way in."',
      ttl: 8,
    },
  },

  // SP2-021 — Helios Weigh-Point, the Ninth Bell: the tally buoy breaks
  // format for a spotless record. Proximity to the weigh-point; the
  // three-clean-declarations count is folded into the prose, the greeting
  // variant is glue.
  {
    id: 'SP2-021',
    kind: 'comms-event',
    title: 'Helios Weigh-Point, the Ninth Bell',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_tally', wu: 400 },
    channel: 'comms',
    payload: {
      from: 'Helios tally buoy',
      text: 'At the bell, the tally buoy breaks format: "DECLARATION: CLEAN. CLEAN. CLEAN. LOGGING PATTERN. PATTERN IS ITSELF A SIGNAL." Then, quietly, off the record: "Keep it up and I will have nothing to bill you. You are ruining my quarter."',
      ttl: 8,
    },
  },
  // SP2-019 — Static With a Stutter: the dead masts' cadence, plus one. The
  // Unbroken mast has no registered anchor, so station_kepler_scar (the
  // irradiated floor's station) stands in; the gated cache POI is glue.
  {
    id: 'SP2-019',
    kind: 'comms-event',
    title: 'Static With a Stutter',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'proximity', nearStation: 'station_kepler_scar', wu: 900 },
    channel: 'commsLog',
    payload: {
      from: 'the irradiated floor',
      text: 'Band static develops a rhythm out here: three bursts, gap, three bursts — the cadence the dead masts used for "hostiles in the ring." Then one extra burst. Then nothing. The Unbroken\'s scanner page notes the mast is still standing. It has never once said for whom.',
    },
  },

  // SP2-032 — Fourth Copy Exists: the False Gate ring's fresh engraving.
  // Chained behind Quill AR-3's copying work (SP2-122, not yet landed — the
  // chain waits by design); the Archive standing bonus is glue.
  {
    id: 'SP2-032',
    kind: 'comms-event',
    title: 'Fourth Copy Exists',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'flag', requires: 'special500.SP2-122' },
    channel: 'commsLog',
    payload: {
      from: 'the False Gate ring',
      text: 'The memorial ring carries fresh engraving over the old: "COPIED. NOW IT EXISTS TWICE. THEN I COPIED THE COPY. NOW IT EXISTS ENOUGH." The stamp is AR-3\'s. The Archive\'s position on redundant record-keeping is on file, and enthusiastic.',
    },
  },

  // SP2-057 — The Yard Wire Newsletter: Pitborn PR, every month-ish.
  // Deterministic cadence mapped to the 40-day calendar (day 30, yearly).
  {
    id: 'SP2-057',
    kind: 'comms-event',
    title: 'The Yard Wire Newsletter',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 30, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'PITBORN YARD WIRE',
      text: '"VOL. 14: THIS MONTH WE BALLASTED 3 SKIFF BALLS, 1 TENDER BALL, AND A CONCORD SURVEY BUOY NOBODY CLAIMED. \'COUNT \'EM\' REMAINS THE WHOLE SONG. REMINDER: CIVILIAN HULLS ARE SACROSANCT. EVERYTHING ELSE IS INVENTORY."',
    },
  },

  // SP3-056 — Shelter Advisory: surge start, stations broadcast.
  // calendar:stormSeason is the verified surge-start receipt (worldClock.js);
  // the apron light streak and the fee cut are glue.
  {
    id: 'SP3-056',
    kind: 'comms-event',
    title: 'Shelter Advisory',
    sectors: [],
    trigger: { type: 'receipt', event: 'calendar:stormSeason' },
    channel: 'commsLog',
    payload: {
      from: 'station advisory',
      text: '"SHELTER ADVISORY: surge until second bell. Apron lights doubled, berths half price." The aprons brighten as the line runs. Weather, touching the price of a berth, through one honest sentence.',
    },
  },
  // SP3-129 — The Loss Notice: the chronicler's one line for hulls you saw
  // die. history:deadNoted is the contact-death receipt; the witnessed-only
  // filter is glue. Hones applied: the lost hull is an ordinary name-pool
  // ship, nothing resembling the protagonist.
  {
    id: 'SP3-129',
    kind: 'comms-event',
    title: 'The Loss Notice',
    sectors: [],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'news',
    payload: {
      text: 'LOST: the Marlowe B, with all records. Killed in the Belt under flags of trade. One line, the chronicler\'s voice, for the hulls you were there to see go — the record remembering that you saw it.',
      kind: 'incidents',
    },
  },

  // SP1-053 — Your Receipts, Read Aloud: a broker roasts your trade history at
  // the dock. economy:tradeCompleted is the transaction receipt; the
  // transcript purchase and the NPC retelling are the bespoke leg.
  {
    id: 'SP1-053',
    kind: 'comms-event',
    title: 'Your Receipts, Read Aloud',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'memory',
    followup: 'Dock encounter with a choice: buy the transcript (a real codex page of your own trade history, gently roasted) or shut him up — he sells it anyway, and you hear it later from an NPC who quotes it wrong.',
    payload: {
      text: 'A data-broker at the dock has your purchase history and reads the three funniest entries over the open band: "Sixty units of water ice, bought at panic prices, sold at panic prices, to the same station. Beautiful. Frame it."',
    },
  },

  // SP1-180 — The Sniffer: the fuel-dock inspector reads your week from the
  // tank. Seeded low chance per fueling; the telemetry-backed detail and the
  // inspector's memory are glue.
  {
    id: 'SP1-180',
    kind: 'comms-event',
    title: 'The Sniffer',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.1 },
    channel: 'comms',
    payload: {
      from: 'line inspector',
      text: 'The line inspector taps your tank, listens, and reads your week back to you from the fuel: "Three hard burns, one cold soak, and somebody ran you rich for about a minute — chase? Race? Either way, your mixture\'s honest. Sign here." The paperwork is real. The insight is free.',
      ttl: 7,
    },
  },

  // SP3-168 — The Number Station: seven digits, twice, no callsign, and the
  // codex eventually notices it is a forecast. Hash-picked daily per the
  // consensus — hashDaily chance 1.0 lands the first hearing in the sector.
  {
    id: 'SP3-168',
    kind: 'comms-event',
    title: 'The Number Station',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'hashDaily', chance: 1.0 },
    channel: 'commsLog',
    payload: {
      from: 'no callsign',
      text: 'A flat voice reads seven digits, pauses, reads seven more, and signs off. The numbers count something. Nobody on any band can say what, or who is counting, and the voice has never answered a hail.',
    },
  },
];
