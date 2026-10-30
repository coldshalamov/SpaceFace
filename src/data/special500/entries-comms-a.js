// src/data/special500/entries-comms-a.js — batch cat-comms-a (40 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-comms-a.json). Every receipt trigger
// names a bus event verified against src/systems emitters; every sector and
// station id is real (src/data/sectors.js). Channel choice: a line heard on
// comms -> comms/commsLog, a wire bulletin -> news, an audio/visual leg the
// renderer still owes -> spectacle, a genuinely interactive core (choices,
// cargo, vendor) -> memory + followup naming the bespoke mechanic.

export const ENTRIES_COMMS_A = [
  // SP3-144 — The Time Signal: four notes at every shift turn, per-station pitch.
  // Absorbs SP2-087's handoff liturgy and SP3-183's whistle: the stack layers —
  // whistle leads, liturgy follows, the four notes ride underneath as the clock.
  {
    id: 'SP3-144',
    kind: 'comms-event',
    title: 'The Time Signal',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 1, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Station PA',
      text: 'Four notes, the same four every shift turn, transposed per station until each berth has its own voice. The whistle opens, the hands mumble their handoff, and underneath it all the four notes keep the clock. Give it a few days — you will know whose time it is with your eyes shut.',
    },
  },

  // SP3-048 — The Forecast Bell: season turn announced as a wire bulletin with
  // weight. Absorbs SP3-194's per-kind jingles — one chime grammar, three weathers.
  {
    id: 'SP3-048',
    kind: 'comms-event',
    title: 'The Forecast Bell',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 8, windowS: [0, 120] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'SEASON WIRE: the bell has struck and the weather has changed addresses. Three notes, one per temper — ion, wind, iron — and the season you get is the one it names. The almanac calls that an announcement. The dockhands call it the only honest thing on the band.',
      kind: 'incidents',
    },
  },

  // SP3-182 — The Market Bells: market day open and close. Absorbs SP3-118's
  // auction chime: open bright, close low, a third stroke when prices tilt.
  {
    id: 'SP3-182',
    kind: 'comms-event',
    title: 'The Market Bells',
    sectors: [],
    trigger: { type: 'receipt', event: 'calendar:marketDay' },
    channel: 'spectacle',
    payload: {
      from: 'Exchange floor',
      text: 'Market day opens bright, closes low, and when the prices tilt a third stroke rolls the lamp cascade down the station spine — the starmap fold pulses on the same tick. Sound, light, and the price of ore, all telling time together. The market has a gong now. Mind it.',
    },
  },

  // SP3-081 — The Slow Kiss: two dead hulks touch on a seeded intercept near the
  // Ashfall redoubt, one week into the save; the wire predicted the minute and now
  // reads the obituary. Absorbs SP3-082's photograph leg — one event, two frames.
  // The impact light leg (explosionShear family) is a later batch; this is the tell.
  {
    id: 'SP3-081',
    kind: 'comms-event',
    title: 'The Slow Kiss',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'simWindow', startS: 4170, endS: 4260 },
    channel: 'spectacle',
    payload: {
      from: 'Ashfall Reach',
      text: 'The wire promised this minute six days ago, and the wire was right: the Marnie\'s Pride and the hulk she killed touch near the redoubt — one deep flash rolling both keels, a slow blossom of plates, no sound at all. Somebody got their frame. The wire is already setting the obituary of a collision nobody caused.',
    },
  },

  // SPX-C-03 — Division Six's Quiet Neighbor: an extra band under the Veil storm.
  // The denial is the tell. The playback-reply leg (I. S.) keys off the heard
  // flag recorded by the director and is a later batch.
  {
    id: 'SPX-C-03',
    kind: 'comms-event',
    title: "Division Six's Quiet Neighbor",
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'station_veil', wu: 400 },
    channel: 'comms',
    payload: {
      from: 'Research Station Veil',
      text: 'Under the storm noise, one narrow band is carrying a pattern that is not weather and not any code on the books. The station\'s wire, unbidden: "ALL BANDS NOMINAL. THERE IS NO EXTRA BAND." Nobody asked. The denial is the receipt.',
      ttl: 7,
    },
  },

  // SPX-B-03 — The Rookie Rate: the first gate toll of a save is on the house,
  // taught as welcome instead of extortion. Gate verdicts are the toll lane's
  // bus event; the receipt variant is the first-toll line.
  {
    id: 'SPX-B-03',
    kind: 'comms-event',
    title: 'The Rookie Rate',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'comms',
    payload: {
      from: 'Reach toll collector',
      text: 'Your receipt prints one line no other receipt has: ROOKIE RATE — FIRST TOLL ON THE HOUSE. THE LANE WANTS YOU BACK. Hail the collector about it and he clears his throat: "It\'s a promotion. Don\'t make it a thing."',
      ttl: 7,
    },
  },

  // SPX-A-03 — The Missed Bells: three shift bells missed, the PA dry about it.
  // Mapped to a fixed save-age window (a regular's twelfth day); the bell
  // counter itself is the later glue pass.
  {
    id: 'SPX-A-03',
    kind: 'comms-event',
    title: 'The Missed Bells',
    sectors: [],
    trigger: { type: 'simWindow', startS: 6600, endS: 7200 },
    channel: 'comms',
    payload: {
      from: 'Station PA',
      text: '"Station to hull: we noticed the absence. The lane did not. One of those is a compliment."',
      ttl: 6,
    },
  },

  // SPX-A-05 — The Queue Critic: a hull ahead reviews the customs hold.
  // player:scannedByPatrol is the scan-hold bus event (economy.js).
  {
    id: 'SPX-A-05',
    kind: 'comms-event',
    title: 'The Queue Critic',
    sectors: [],
    trigger: { type: 'receipt', event: 'player:scannedByPatrol' },
    channel: 'commsLog',
    payload: {
      from: 'Hull ahead in the queue',
      text: 'The hull ahead transmits a two-line review of the service, addressed to no one: "Two stars. The forms are load-bearing." A pause, then, generously: "The scan itself was five stars. Very thorough. Nobody escaped."',
    },
  },

  // SP1-191 — The Letter Home: after a survivor goes into custody, their home
  // station writes — not thanks, better: their mail. Absorbs SP2-043's candle
  // trinket as one enclosure of the letters folder (later batch).
  {
    id: 'SP1-191',
    kind: 'comms-event',
    title: 'The Letter Home',
    sectors: [],
    trigger: { type: 'receipt', event: 'aftermath:custodySurvivor' },
    channel: 'comms',
    payload: {
      from: 'Home-station mailroom',
      text: 'A letter from the crew you pulled out — not thanks, better: their mail. "Thought you\'d want to know the kid talks about the rescue like weather. \'And then the hull just CAME.\' We told them you charge rates like everyone. They\'ve decided you\'re a smuggler of people. High praise here." Packed in with it: a candle, for luck, wired to the envelope.',
      ttl: 8,
    },
  },

  // SP3-180 — The Toll of Names: Drift Wake evening (day 7, the calendar's own
  // festival day), Senna's roll read aloud. Carries SP3-112's witness pause —
  // only the names the player personally saw die get the two seconds.
  {
    id: 'SP3-180',
    kind: 'comms-event',
    title: 'The Toll of Names',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 7, windowS: [400, 520] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Drift Wake fire',
      text: 'Drift Wake evening, and Senna\'s roll gets read to anyone who will stand still for it — every name, no editorial. When the reading reaches a death somebody in this sector actually saw, it stops: two full seconds of nothing, the name held up in the quiet, before it goes on. The witnessed names are the only ones that cost the reader anything.',
    },
  },

  // SP2-012 — The Question, Answered Wrong: a voice on the Sedna dark asks one
  // question and waits. Interactive core (answer or stay silent) — the
  // reply-listen interpreter is the bespoke leg; the text is the noticing line.
  {
    id: 'SP2-012',
    kind: 'comms-event',
    title: 'The Question, Answered Wrong',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Reply-listen interpreter on the comms radial offer/receipt path: the voice waits — any transmitted number answers "No. Try again next cycle."; ten seconds of silence answers "Correct," and closes the channel forever (flag the_question_answered).',
    payload: {
      text: 'On an empty band, a voice that does not use a callsign asks one question — "What did the mass weigh?" — and waits.',
    },
  },

  // SP2-200 — The Mass Signs Off: the run's end-of-wrap sequence. Genuinely
  // needs end-of-run orchestration; the sign-off line is the persisted text.
  {
    id: 'SP2-200',
    kind: 'comms-event',
    title: 'The Mass Signs Off',
    sectors: [],
    trigger: { type: 'receipt', event: 'game:over' },
    channel: 'memory',
    followup: 'End-of-run orchestration in the story/results seam: every touched system sends one final line in first-contact order at one-second intervals, then the sign-off; next session opens with the unaddressed popup "the mass resumed." (flag mass_signs_off; no results-sheet edit).',
    payload: {
      text: 'the mass knew you. the mass signs off. the mass will know you again.',
    },
  },

  // SP2-027 — The Posthumous Ping: the Quiet Mast relays a dead contact's
  // queued personal, timestamped before the death. history:deadNoted is the
  // contact-death bus event (historyWear.js); the Rook-bill suppression flag is
  // the billing-seam follow-up batch.
  {
    id: 'SP2-027',
    kind: 'comms-event',
    title: 'The Posthumous Ping',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'comms',
    payload: {
      from: 'The Quiet Mast',
      text: 'The mast relays a personal that has been waiting in the queue, timestamped the day before its sender died: "If this sends, the count got me. Settle nothing on my behalf. Especially not to Rook."',
      ttl: 9,
    },
  },

  // SP2-044 — The Bill For Nothing: a 4 cr shakedown that is also legal, timed
  // to the moment the player settles their last debt and thinks they are clean.
  // Pay-or-refuse is interactive — the invoice resolution is the bespoke leg.
  {
    id: 'SP2-044',
    kind: 'comms-event',
    title: 'The Bill For Nothing',
    sectors: [],
    trigger: { type: 'receipt', event: 'frontier:debtSettled' },
    channel: 'memory',
    followup: 'Pay-or-refuse invoice: settle the 4 cr within a day and Hale sends "Correct answer."; refuse and a second bill arrives — LATE FEE ON STANDBY FEE. Either way 4 cr out, Hale rep +1 both ways (they respect consistency).',
    payload: {
      text: 'CONCORD TOWAGE — STANDBY FEE. NO TOW PERFORMED. READINESS IS THE SERVICE. Amount: 4 cr. The account line\'s memo field reads: "This is a shakedown. It is also legal. — H."',
    },
  },

  // SP2-003 — The Seventh Run: half a sentence from no registered sender.
  // Seeded 2% per in-game day; three hearings grow the Tessera codex page later.
  {
    id: 'SP2-003',
    kind: 'comms-event',
    title: 'The Seventh Run',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.02 },
    channel: 'commsLog',
    payload: {
      from: 'unregistered relay',
      text: 'Half a sentence from no registered sender, then static: "—sevenths run, if anyone is counting, we did not talk about—" The log\'s note field admits the relay could not triangulate. Whoever was counting is not saying.',
    },
  },

  // SP2-008 — REF 44-C, Filed Against You: Concord assigns you a clerk after
  // your first paid law obligation. The replacement inherits the Quiet's
  // sealed-evidence desk — Clerk Yune's own, not a Concord one.
  {
    id: 'SP2-008',
    kind: 'comms-event',
    title: 'REF 44-C, Filed Against You',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'law:obligationPaid' },
    channel: 'comms',
    payload: {
      from: 'CONCORD PATROL',
      text: 'Form letter, pre-signed: "REF 44-C RECURS. YOUR FILING PATTERN IS NOW ITS OWN CATEGORY. A CLERK HAS BEEN ASSIGNED. SHE HAS ALREADY READ EVERYTHING." The clerk is never named. The desk she inherits is not a Concord desk — it is the Quiet\'s sealed-evidence desk, Clerk Yune\'s own.',
      ttl: 8,
    },
  },

  // SP2-042 — Spam: You Have Won A Sector. Day 4 onward, the bonds house finds
  // you every year. The fine print is an accurate summary of the silt economy.
  {
    id: 'SP2-042',
    kind: 'comms-event',
    title: 'Spam: You Have Won A Sector',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 4, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'MERIDIAN BONDS OFFICIAL',
      text: 'CONGRATULATIONS VHL-4471-T! YOUR HULL HAS BEEN PRE-APPROVED TO SPONSOR A SECTOR. ATMOSPHERIC NAMING RIGHTS FROM 900 CR. CURRENT LEAD BIDDER: NOBODY. CURRENT SECTOR CONDITION: DECLINING. The fine print is, annoyingly, a fully accurate summary of the silt and atmo economy.',
    },
  },

  // SP2-099 — The Reach Weigh-Booth Tollbooth Poetry: gate receipts print a
  // haiku-length line, rotating per day-seed. gate:verdict is the toll lane's
  // bus event; five collected poems open the Frequency 13 chapbook later.
  {
    id: 'SP2-099',
    kind: 'comms-event',
    title: 'The Reach Weigh-Booth Tollbooth Poetry',
    sectors: ['sector_io_reach', 'sector_sker_haven'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'commsLog',
    payload: {
      from: 'Reach weigh-booth',
      text: 'The receipt prints with a haiku at the bottom, a different one every day: WEIGH-SLIP FOUR HULLS / THREE FILLED, ONE SHORT, THE LANE / KEEPS WHAT IT IS OWED. The collector, asked about it, denies authorship in a way that confirms it.',
    },
  },

  // SP1-140 — The Complaint Desk: the registrar reads everything on file
  // against your hull, verbatim, after a fine is assessed for an incident
  // you caused. Settlement-by-apology is the later glue pass.
  {
    id: 'SP1-140',
    kind: 'comms-event',
    title: 'The Complaint Desk',
    sectors: [],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'comms',
    payload: {
      from: 'Registrar of Complaints',
      text: 'A formal reading of everything on file against your hull, verbatim, names and registration numbers included: the toll you ran ("witness: three hulls, one of them a child"), the queue you cut, the wake that rattled a pilgrim\'s lamp. The clerk reads all of it. The clerk has heard worse. The clerk has a favorite, and will not say which.',
      ttl: 9,
    },
    dormant: true,
    dormantReason: "Reads back a skipped toll, a cut queue and a pilgrim's lamp as facts on file; fires on any fine and the world records none of them.",
  },

  // SP2-128 — Scissorwake Spares The Tessera: the roamer's old-hulls mercy
  // rule. Combat-gated core — the engagement check on the real roamer is the
  // bespoke leg; the line is the rule, stated once, on no channel in particular.
  {
    id: 'SP2-128',
    kind: 'comms-event',
    title: 'Scissorwake Spares The Tessera',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.04 },
    channel: 'memory',
    followup: 'Verify Scissorwake in the oneOffCast roamers and wire the old-hulls mercy rule there: at engagement range with hull integrity below 25% it breaks off and shadows at a respectful distance; persistent flag scissorwake_mercy consumed by the roamer\'s engagement logic.',
    payload: {
      text: 'NO. THE OLD HULLS GET TO DIE OF OLD AGE. THAT IS THE RULE. I DO NOT MAKE THE RULES. I DO ENFORCE THIS ONE.',
    },
  },

  // SP2-188 — The Demo End's Uninvited Guest: a popup queued since minute one,
  // dismissed by nothing because it needed no dismissing. Session-end and the
  // attention counter are the bespoke leg; the line is the persisted text.
  {
    id: 'SP2-188',
    kind: 'comms-event',
    title: "The Demo End's Uninvited Guest",
    sectors: [],
    trigger: { type: 'receipt', event: 'game:over' },
    channel: 'memory',
    followup: 'Results-sheet line keyed to a popup-dismiss counter: fires when a run ends with zero popups dismissed all session; next session\'s ambient popups run 20% quieter (parallel ambient table keyed to flag read_everything).',
    payload: {
      text: 'YOU READ EVERYTHING. THE CHANNEL NOTICED. THE CHANNEL IS MOSTLY NOISE. SO WAS MOST OF THIS. THANK YOU FOR THE PART THAT WASN\'T.',
    },
  },

  // SP2-006 — The Count of Doors: the Quiet count hulls, then doors, then
  // correct themselves. Proximity to the Quiet's own berth in Pallas Drift
  // stands in for the Quiet-tagged hull pass; the cargo condition is glue.
  {
    id: 'SP2-006',
    kind: 'comms-event',
    title: 'The Count of Doors',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_smuggler', wu: 900 },
    channel: 'comms',
    payload: {
      from: 'flat relay, unaddressed',
      text: 'A relay voice that is not talking to you: "FORTY-ONE HULLS. FORTY-TWO DOORS." Two seconds of carrier hum. "CORRECTED. PROCEED." No threat is ever named. Your hold, whatever is in it, has been counted by something that did not need to look.',
      ttl: 7,
    },
  },

  // SP2-037 — The Retraction: Lira Vonn retracts the headline about you because
  // it was accurate. news:headline is the crawl's bus event (aftermathWrecks,
  // aceMemory, custodyConsequences, e1EncounterRuntime).
  {
    id: 'SP2-037',
    kind: 'comms-event',
    title: 'The Retraction',
    sectors: [],
    trigger: { type: 'receipt', event: 'news:headline' },
    channel: 'news',
    payload: {
      text: 'RETRACTION: THE PILOT NAMED IN OUR LAST ITEM WAS ONE HULL AMONG SEVERAL. WE REGRET THE ACCURACY. — L.V., The Margin.',
      kind: 'incidents',
    },
  },

  // SP1-134 — The Wrong Number: a handler's sheet routed to your queue, and a
  // voice closer than you'd like. The runnable-job core (run it, sell it back,
  // or let the buyer wait) is the bespoke leg.
  {
    id: 'SP1-134',
    kind: 'comms-event',
    title: 'The Wrong Number',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_smuggler', wu: 1200 },
    channel: 'memory',
    followup: 'Real runnable job (boreDeadDrop precedent, src/systems/boreDeadDrop.js): the misrouted orders are a live drop-site run — run it honest and get paid by nobody, sell the orders back for Quiet rep, or ignore it and the buyer waits at the drop for a hull that never comes.',
    payload: {
      text: 'A burst routed for someone else lands in your queue: the cargo, the window, the buyer\'s scan schedule, the whole handler\'s sheet. Thirty seconds later, very calm, very close: "Delete that."',
    },
  },

  // SP1-144 — The Sermon: the Choir's weekly broadcast, tailored from your own
  // receipts. Seeded weekly ≈ one day in seven; the receipt-composer is glue.
  {
    id: 'SP1-144',
    kind: 'comms-event',
    title: 'The Sermon',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'commsLog',
    payload: {
      from: 'The Choir',
      text: 'The weekly sermon is public, serene, and this week tailored: your last three transactions, cited by fact and number, no names, as verses. "And the hull that paid the tithe twice and the third time ran — what did the third lane cost, children?" Everyone in earshot knows who it is about. It is about no one.',
    },
  },

  // SP1-042 — The Story Broker: the Quiet buy the story of your worst sale, not
  // the goods. Sell-or-refuse is interactive — the deal is the bespoke leg.
  {
    id: 'SP1-042',
    kind: 'comms-event',
    title: 'The Story Broker',
    sectors: [],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'memory',
    followup: 'Dock broker deal: sell the story of your moral-tagged cargo sale for credits (the Quiet own the shame; the commodity\'s moral ledger cleans) or refuse and keep the deed on your own ledger, in codex, visibly. Reads commodityMoralTags; cooldown a day.',
    payload: {
      text: 'A Quiet broker finds you at the dock, not to buy goods: "You sold famine-grade ration packs to a resort station. That\'s a story. I\'ll buy the story. The resort never needs to know you know what you did."',
    },
  },

  // SP2-017 — The Distress Echo: the Snapped-Tether Hab-Pod's mayday, five
  // seconds ahead of the pod, from where nothing is squawking. Breadcrumb to
  // the existing tether-wreck recovery encounter; echo_heard gates the bar
  // regular's explanation later.
  {
    id: 'SP2-017',
    kind: 'comms-event',
    title: 'The Distress Echo',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'comms',
    payload: {
      from: 'Repeating mayday',
      text: 'A distress call, word for word the Snapped-Tether Hab-Pod\'s mayday — but five seconds ahead of the pod itself, repeating from further down the radiation lane, from a point where nothing is squawking. The signal degrades to static at the exact second the real recording ends.',
      ttl: 8,
    },
  },

  // SP1-104 — The Whisper With a Name: the pool that never addresses anyone
  // addresses you. Seeded whisper roll; the unpaid-toll condition and the
  // silencing flag are the later glue.
  {
    id: 'SP1-104',
    kind: 'comms-event',
    title: 'The Whisper With a Name',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.1 },
    channel: 'comms',
    payload: {
      from: 'the pool',
      text: 'The whisper pool, which never addresses anyone, addresses you: "the toll you skipped still counts your engine note" — and then, once, for one transmission only, it names the exact lane. Same voice as always. The specificity is new.',
      ttl: 6,
    },
    dormant: true,
    dormantReason: "Claims the whisper names the exact lane the player skipped; no skipped-lane record exists and the sentence has no lane.",
  },

  // SP2-114 — The Fulfillment Queue Miracle: the queue files an emotion.
  // cargo:delivered is the delivery bus event (missions.js); the zero-buffer
  // timing check and the MIRACLE honorific greeting are the glue pass.
  {
    id: 'SP2-114',
    kind: 'comms-event',
    title: 'The Fulfillment Queue Miracle',
    sectors: [],
    trigger: { type: 'receipt', event: 'cargo:delivered' },
    channel: 'comms',
    payload: {
      from: 'FULFILLMENT',
      text: 'DELIVERY RECEIVED. BUFFER: 0.00s. CLASSIFICATION: MIRACLE (STATISTICAL). MIRACLE HAS BEEN FILED. MIRACLE WILL NOT BE REPEATED. THE QUEUE IS EMOTIONAL ABOUT THIS AND DECLINES TO ELABORATE.',
      ttl: 7,
    },
    dormant: true,
    dormantReason: "Prints BUFFER: 0.00s / MIRACLE on any first delivery; no delivery-timing read exists.",
  },

  // SP2-020 — The Quiet's Receipt: sixty seconds after the fence deal closes,
  // an unaddressed relay files you. deniable:fenceThanked is the fence-deal
  // outcome event (encounterDirector.js); the off-by-one seal is the tell.
  {
    id: 'SP2-020',
    kind: 'comms-event',
    title: "The Quiet's Receipt",
    sectors: [],
    trigger: { type: 'receipt', event: 'deniable:fenceThanked' },
    channel: 'commsLog',
    payload: {
      from: 'unaddressed relay',
      text: 'THE QUIET THANK NOBODY. THE QUIET FILE EVERYTHING. YOUR FILE IS CURRENT. Attached: a receipt naming the commodity and the amount, sealed with a code one character off from the seal code printed on your own hull registration.',
    },
  },

  // SP1-137 — The Morning Report: three headlines, two true, one wrong about
  // color, never about money. Mapped to a recurring calendar edition; the
  // lie-spotting counter and the reporter's private note are the bespoke leg.
  {
    id: 'SP1-137',
    kind: 'comms-event',
    title: 'The Morning Report',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 2, windowS: [0, 300] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'MORNING REPORT, three items: prices that did not move; a raid smaller than filed; a rescue with no rescuer. Two of these are true. One is wrong in a direction that costs nobody money — it lies about color, never about coin. Nobody knows why. Nobody has stopped reading.',
      kind: 'incidents',
    },
  },

  // SP2-193 — The Endings' Return Mail: after the spine files its last state,
  // the paperwork catches up with whoever you decided to be.
  // story:postEndingContinuity is the spine's own bus event (story.js).
  {
    id: 'SP2-193',
    kind: 'comms-event',
    title: "The Endings' Return Mail",
    sectors: [],
    trigger: { type: 'receipt', event: 'story:postEndingContinuity' },
    channel: 'comms',
    payload: {
      from: 'Return mail',
      text: 'The spine files its last state, and the return mail catches up — addressed to whoever you decided to become. Yours is the one for staying: a berth assignment. The berth is the same berth. It has always been the same berth. Postscript, stamped in red: 47-B: OPEN.',
      ttl: 10,
    },
  },

  // SP2-058 — The Vacation Reply: hail a contact who is, pointedly, elsewhere.
  // npc:hailed is the player-hail bus event (barkDirector.js).
  {
    id: 'SP2-058',
    kind: 'comms-event',
    title: 'The Vacation Reply',
    sectors: [],
    trigger: { type: 'receipt', event: 'npc:hailed' },
    channel: 'comms',
    payload: {
      from: 'automated reply',
      text: 'Recorded badly, in the contact\'s own voice: "I am not here. I am exactly where you are not, which is the point of a vacation. For seal codes press nothing. For anything else, wait, like the paperwork does."',
      ttl: 6,
    },
    dormant: true,
    dormantReason: "Vacation recording in the contact's own voice fires on any first hail from any contact; needs a per-contact voice/vacation state.",
  },

  // SP1-075 — The Ration Ledger: a hull two months off-lane sells its log by
  // the page. The page-store vendor is interactive — that deal is the bespoke
  // leg; these lines are what a page sounds like.
  {
    id: 'SP1-075',
    kind: 'comms-event',
    title: 'The Ration Ledger',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Page-store vendor on the adrift hulk: hail to buy the log by the page (serialized codex entries) or the whole log at the end; a page you buy is a page they eat better for. Page ledger in state.story.flags; codex additions in src/data/codexPages.js.',
    payload: {
      text: '"Day forty-one. The cook found a way to make algae taste like regret. Day forty-two. Regret again." The hull selling its log by the page to anyone who hails is two months off-lane on air rations, and it is not begging — it is a business model, and the writing is good.',
    },
  },

  // SP2-073 — The Margin's Interview: Lira Vonn reads your deeds back as
  // quotes and signs off. economy:tradeCompleted is the trade bus event
  // (economy.js); the three-question feature rows and bar page are glue.
  {
    id: 'SP2-073',
    kind: 'comms-event',
    title: "The Margin's Interview",
    sectors: [],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'comms',
    payload: {
      from: 'Lira Vonn, The Margin',
      text: 'Vonn hails on an open channel and conducts the whole interview herself, three questions fast, answering them by reading your logged deeds back as quotes. Sign-off: "The Margin thanks you. The Margin bills nobody. Advertisers are afraid of us."',
      ttl: 9,
    },
    dormant: true,
    dormantReason: "Claims Lira read the player's logged deeds back as quotes; the payload carries no deed.",
  },

  // SP2-095 — The Helix Fine That Is A Compliment: zero invoices is anomalous,
  // and anomalies are filed. mission:completed is the contract bus event
  // (missions.js); the standard-deviation waiver flag is the fine-seam pass.
  {
    id: 'SP2-095',
    kind: 'comms-event',
    title: 'The Helix Fine That Is A Compliment',
    sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed' },
    channel: 'comms',
    payload: {
      from: 'HELIX DIRECTORATE',
      text: 'AUDIT COMPLETE. NO FINES OUTSTANDING. THIS IS ANOMALOUS. AN ANOMALY IS EITHER AN ERROR OR A STANDARD. WE HAVE FILED YOU AS A STANDARD. DO NOT DEVIATE. DEVIATION IS INVOICED.',
      ttl: 8,
    },
    dormant: true,
    dormantReason: "Asserts zero fines outstanding on any mission completion; no fine query backs it.",
  },

  // SP1-141 — The Weather Desk: a forecaster selling honest hazard calls.
  // The paid subscription is a vendor — that deal is the bespoke leg; the
  // pitch is what she sounds like at the dock.
  {
    id: 'SP1-141',
    kind: 'comms-event',
    title: 'The Weather Desk',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.08 },
    channel: 'memory',
    followup: 'Subscription vendor: hazard calls computed from the sim\'s own hazard schedules (flare windows, bloom tides, undertow shifts — environmentalMachinery data), a visible accuracy percentage that is honest because it is computed, a public miss log, and a fee that varies by how good the sector is.',
    payload: {
      text: 'A forecaster sells hazard calls with a visible accuracy percentage that is honest because it is computed. "Eighty-two percent. The other eighteen percent is why it\'s cheap." Her misses are real misses and she logs them in public.',
    },
  },

  // SP1-142 — The Courtesy Loop: two dead relay hulls keep each other company
  // in protocol-speak. Mapped to first entry into the Charon field; the
  // donation leg and codex elegy are the later batch.
  {
    id: 'SP1-142',
    kind: 'comms-event',
    title: 'The Courtesy Loop',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Derelict relay handshake',
      text: 'Two dead relay hulls are still exchanging courtesies across the derelict field — arrival pings, good-morning acknowledgments, berth availability reports for berths that no longer exist. The final exchange is a status request that will never be answered, re-sent on schedule, forever. Neither machine has learned its operator died. Both remain polite about it.',
    },
  },

  // SP2-101 — The Concord Pop Quiz: the entire quiz. dock:docked is the
  // player-dock bus event (src/ui/input.js); the bar-correct answer rows and
  // the REF 44-C codex overlay are glue.
  {
    id: 'SP2-101',
    kind: 'comms-event',
    title: 'The Concord Pop Quiz',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'comms',
    payload: {
      from: 'CONCORD PATROL',
      text: 'ROUTINE COMPLIANCE QUIZ. QUESTION ONE: WHAT DOES REF 44-C GOVERN? ANSWER: [ALL OF IT]. CORRECT. YOU HAVE PASSED. THIS IS THE ENTIRE QUIZ. HAVE A SHIFT.',
      ttl: 7,
    },
  },

  // SP2-198 — The Quiet's One Question: asked once, retracted before it can
  // matter. Chained behind SP2-020 (the Quiet's receipt) so it lands after the
  // player has done Quiet business; the refused-advantage deed read is glue.
  {
    id: 'SP2-198',
    kind: 'comms-event',
    title: "The Quiet's One Question",
    sectors: [],
    trigger: { type: 'flag', requires: 'special500.SP2-020' },
    channel: 'comms',
    payload: {
      from: 'no sender',
      text: 'The Quiet break register — one question, on no channel: "WHY." It hangs a full ten seconds. Then, before any answer could matter: "RETRACTED. THE ANSWER IS KNOWN. THE QUESTION WAS COURTESY. FLY CLEAN."',
      ttl: 10,
    },
  },
];
