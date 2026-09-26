// src/data/barks.js — per-faction radio VOICE corpus + deterministic selector.
//
// "The story is in the paperwork." Each of the 8 code factions speaks in a DISTINCT
// register so a scan/warn/attack line instantly reads as who is talking, without an
// IFF tag. This is PURE DATA — no imports, no state, no DOM, no Math.random.
//
// The selector barkFor(factionId, situation, rng) is deterministic: it takes either a
// seeded rng function (mulberry32-style, returns [0,1)) OR a numeric index. Given the
// same inputs it always returns the same line. Callers derive rng from state.meta.seed
// (see src/core/rng.js makeStream) so radio chatter is replayable.
//
// Situations (the "core" set every faction MUST cover):
//   scan            — passive sensor sweep / hail on first contact
//   warn            — you are somewhere you shouldn't be; back off
//   demand-cargo    — hand over the goods (piracy / shakedown / toll)
//   attack          — opening fire
//   flee            — breaking off, running
//   reinforce       — calling in / rallying the squad
//   taunt           — jeering mid-fight
//   patrol-greeting — ambient friendly/neutral passing hail
//
// VOICE per faction (keep these in mind when adding lines):
//   faction_scn   Concord   — procedural, bureaucratic, cites regs & ref codes, bloodless
//   faction_mts   Meridian  — smooth, mercantile, everything is a transaction / fee
//   faction_dmc   Drift     — blue-collar, tired, shift-worker fatalism
//   faction_reach Reach     — predatory but under-armed, bravado over hardware
//   faction_quiet Quiet     — terse, minimal, says as little as possible
//   faction_choir Choir     — zealot, ritual cadence, ascension / the Pattern
//   faction_free  Frontier  — independent, plainspoken, live-and-let-live
//   faction_vael  Vael      — alien contract-language, formal, clause-numbered
//   faction_archive      Archive    — monastic librarian, archival/index register, terrifying calm
//   faction_fulfillment  Fulfillment— administrative automaton, queue/routing updates, no affect
//   faction_pitborn      Pitborn    — escaped yard scrapper, kin-talk, scrap prices, Concord-hate
//   faction_understory   Understory — saprophyte keeper, decay-as-harvest, eerie gentleness
//   faction_verge_layers Verge-Layer— precursor gate-auditor, interrogative, ancient patience
// (Helix is canonically voiceless — it has no corpus on purpose.)

// The code faction ids with a voice corpus, exported for validators/consumers.
// Appended ids keep earlier indices stable: the generated line_*.wav corpus is indexed by
// BARK_FACTIONS order × situation × line.
export const BARK_FACTIONS = [
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
  'faction_quiet', 'faction_choir', 'faction_free', 'faction_vael',
  'faction_archive', 'faction_fulfillment', 'faction_pitborn',
  'faction_understory', 'faction_verge_layers',
];

// The core situations every faction is guaranteed to cover.
export const BARK_SITUATIONS = [
  'scan', 'warn', 'demand-cargo', 'attack', 'flee', 'reinforce', 'taunt', 'patrol-greeting',
];

// Corpus: BARKS[factionId][situation] = [lines...]. Each array is non-empty.
export const BARKS = {
  // ── Concord — procedural / bureaucratic ────────────────────────────────────
  faction_scn: {
    scan: [
      'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.',
      'Vessel identified. Your manifest is subject to inspection. Do not deviate.',
      'Automated hail: comply with sensor sweep. Non-compliance is logged.',
      'Transponder query logged under your registry. Your prior operator already answered this one.',
    ],
    warn: [
      'You are entering a controlled corridor. Reduce speed or be cited.',
      'Advisory: your heading violates transit protocol. Correct it now.',
      'This is a Concord checkpoint. Present clearance or hold position.',
      'Corridor closed under Ref 44-C. The closure does not require a reason. It requires a signature.',
    ],
    'demand-cargo': [
      'Cargo seizure authorized under Ref 44-C. Cut your drive and prepare for boarding.',
      'Your goods are flagged for administrative review. Surrender them.',
      'Compliance is not optional. Jettison contraband for collection.',
      'The cargo was reclassified before we hailed you. The haul is ours in the ledger either way.',
    ],
    attack: [
      'Resistance noted. Escalating to enforcement action.',
      'You are now non-compliant. Ordnance authorized.',
      'Filing use-of-force report. Weapons free.',
      'Force report pre-dated to your first deviation. Saves a step.',
    ],
    flee: [
      'Disengaging. Your registry has been flagged for follow-up.',
      'Pursuit suspended. This incident remains open, Ref 44-C.',
      'Withdrawing to reassess. The paperwork does not withdraw.',
      'Your escape is filed as evasion. Evasion accrues a surcharge per cycle. We invoice.',
    ],
    reinforce: [
      'Requesting patrol support. Additional units inbound.',
      'Escalation approved. Standby elements, converge.',
      'Backup dispatched. Maintain containment.',
      'Two patrol calls filed. Budget covers the second. Always has.',
    ],
    taunt: [
      'Every maneuver you make is being logged. All of it.',
      'You cannot outrun a filing.',
      'The fine accrues whether you comply or not.',
      'Your transponder’s already filed as non-compliant. Catch up.',
      'Three of your tags predate your ownership of this hull. We filed the rest.',
    ],
    'patrol-greeting': [
      'Concord Patrol on station. Keep your transponder lit and pass.',
      'Routine patrol. Nothing to see. Move along.',
      'Lawful transit acknowledged. Safe passage.',
      'Customs net is live this shift. Keep your manifests honest.',
      'Shift 14. The same corridor. The same seven seal codes. Filed.',
      'Pass. The order holds. Bring your fees current before the next cycle.',
    ],
    distress: [
      'Declaring emergency under Ref 77-A. All stations render aid.',
      'Hull integrity critical. Filing the casualty pre-report now.',
      'This vessel is going down. Witnesses are requested for the record.',
      'Mayday logged. Next of kin will be invoiced for the filing.',
    ],
  },

  // ── Meridian — smooth / mercantile ─────────────────────────────────────────
  faction_mts: {
    scan: [
      'Meridian Trade. Just confirming your account is in good standing. Nothing personal.',
      'Pinging your registry — call it market research. Hold still.',
      'Syndicate hail. We do like to know who we are doing business with.',
      'Account check. Your balance is healthy. The health of your competitors is on the board.',
      'Tethys lane control: pinging registry against open bills of lading. Maintain heading.',
    ],
    warn: [
      'This lane carries a toll, friend. You have not paid it.',
      'You are trading in our territory without a license. That is a fee waiting to happen.',
      'Consider this a courtesy notice before it becomes an invoice.',
      'Your cargo is shorting the wrong position. Move it or we move the price.',
    ],
    'demand-cargo': [
      'Let us make a deal: your cargo, our terms. The alternative costs more.',
      'A small percentage of your hold and we forget we saw you. Reasonable, yes?',
      'Consider this an acquisition. The price is everything you are carrying.',
      'The hold contents are already booked to our margin. Hand them over and we’ll waive the storage fee.',
    ],
    attack: [
      'You should have paid. Now the markup applies.',
      'Regrettable. This will be itemized.',
      'Bad for business, but we do settle accounts.',
      'Your insurance countersigned our terms. Payout begins on your hull debris.',
    ],
    flee: [
      'Pleasure not doing business. Your balance remains open.',
      'We will meet again. The Syndicate always collects.',
      'Withdrawing. Consider the account merely deferred.',
      'Run. Your debt compounds every cycle you stay ahead of us.',
    ],
    reinforce: [
      'Calling in the collections team. Do stay put.',
      'Additional assets inbound. This is now a priority acquisition.',
      'Backup en route — the investment must be protected.',
      'Recovery filed. The board does not write off assets. It repossesses them.',
    ],
    taunt: [
      'Everything has a price. Even you. Especially you.',
      'You cannot afford this argument.',
      'The house always wins, and we are the house.',
      'Your account moved to collections the moment you opened fire.',
      'The Pit’s air index moved two points while you were shooting. Someone thanked you.',
    ],
    'patrol-greeting': [
      'Meridian escort. Rates are fair, mostly. Fly safe.',
      'Trade lane secured. Keep your credits handy.',
      'Syndicate convoy passing. No fees today. Enjoy it.',
      'Good cycle. Clear Air is up. Don’t ask who it’s down on.',
      'Tethys exchange hail: present bill of lading or settle the transit tariff at the buoy.',
      'Tethys trader inbound: bonded freight clearance logged with Meridian exchange.',
    ],
    distress: [
      'We are losing her. Invoice the rescue to our account.',
      'Hull failing. The Syndicate pays for recovery, not eulogies.',
      'Breaking up. Charge the salvage to the house.',
      'Mayday. The board reimburses whoever pulls us out.',
    ],
  },

  // ── Drift — blue-collar / tired ────────────────────────────────────────────
  faction_dmc: {
    scan: [
      'Drift Collective. Just checking you ain’t claim-jumping. Long shift.',
      'Reading your hull. You lost, or you working?',
      'Miner’s hail. State your business, keep it short.',
      'Fourteenth shift this week. Reading your beacon. Try not to be interesting.',
      'Ceres yard control. Check your drift vector; refinery dock is full to the gantry.',
    ],
    warn: [
      'That’s a filed claim you’re drifting into. Back off, we don’t want trouble.',
      'Rock’s spoken for. Move along before somebody makes a thing of it.',
      'You’re in a worked belt. We already had a rough cycle. Don’t add to it.',
      'That’s our vein. MTS already skimmed a third. We bleed for what’s left. Move off.',
    ],
    'demand-cargo': [
      'Look, drop the ore and we’re square. Nobody wants to bleed over rocks.',
      'That load’s ours by rights. Hand it over and we all go home.',
      'You took from a claim. Give it back and we forget it. I’m too tired for this.',
      'That ore fed a shaft for nine years. The shaft fed a station. We are the station. Drop it.',
    ],
    attack: [
      'Damn it. Fine. You want it the hard way.',
      'Should’ve just walked. Now I gotta file an incident too.',
      'Didn’t sign up for this today, but here we are.',
      'Reactor’s old. Hands are cold. Still got enough to gut you for the vein.',
    ],
    flee: [
      'Not worth it. I’m going home. Keep the rocks.',
      'Pulling out. Ain’t dying over somebody else’s quota.',
      'Done. This one’s above my pay grade.',
      'Going home. Two riggers didn’t this cycle. I will.',
    ],
    reinforce: [
      'Radioing the other rigs. Hang on, they’re coming.',
      'Getting the crew. We look after our own out here.',
      'Whistle’s up. The belt’s answering.',
      'The whole shift is coming. We don’t leave our ore in another crew’s hold.',
    ],
    taunt: [
      'You ever done an honest day’s work? Didn’t think so.',
      'Big talk from somebody who never dug a rock.',
      'Call it moisture loss when you’re gone. Fits the column.',
      'You’ll price our ore. We’ll price your hull. Same scales. Same cold math.',
    ],
    'patrol-greeting': [
      'Drift rig, hauling. Mind the debris, friend.',
      'Just working the belt. You do you.',
      'Safe hauls out there. It’s a long way to anywhere.',
      'Crew of nine down Shaft Four. Two up here. Same ore. Same quotas. Fly past.',
      'Ceres yard hail: keep your distance from the refinery docks, shift is running hot.',
      'Ceres trader inbound: Drift ore haul from the belt, clear the conveyor.',
    ],
    distress: [
      'She’s coming apart. Tell the shift I stayed with her.',
      'We’re done here. Somebody call the yard for the crew.',
      'Hull’s gone. Get the rookies off first.',
      'Going down. Keep my pay on the crew’s tab.',
    ],
  },

  // ── Reach — predatory but under-armed ──────────────────────────────────────
  //  Idiolect = salvage math. Counting, weigh-slips, scrap-weight, the tally.
  //  Vael has clause-numbers; Reach has the weigh. Predation fused with the
  //  bureaucratic world the game is built on — not generic tough-guy ("we eat
  //  ships," "nice flying, won't save you" = any pirate in any game).
  faction_reach: {
    scan: [
      'Crimson Reach. We been watching your heat signature for a while, friend.',
      'Nice hull. Bet it carries nice things. Sizing you up.',
      'Reach picket. Don’t mind us. We’re just... counting.',
      'Weigh-slip open. Your mass is already on the board.',
      'Logged your tonnage. Logged your escort. Math says you’re light for this lane.',
    ],
    warn: [
      'This is our lane now. Turn around while you still can.',
      'You wandered into the wrong dark. Last warning.',
      'The Reach owns this stretch. Pay the crossing or don’t cross.',
      'Wake is salted. Turn now or fly through our work.',
      'This lane cost us four hulls to take. You can pay it in cargo or you can pay it in hull. We are flexible.',
    ],
    'demand-cargo': [
      'Everything in the hold, right now, and maybe you keep the ship.',
      'Cargo or your life. We’ll take the cargo either way.',
      'Drop it all. We’re not asking twice, and we barely asked once.',
      'Tithe the hold. Curtain stays up either way.',
      'The haul, the manifest, and the seal codes. We weigh on the way out. Don’t make us reweigh.',
    ],
    attack: [
      'Should’ve given us the cargo! Take him apart!',
      'Cut his engines! He’s worth more slow!',
      'Light him up before he calls it in!',
      'Strip the panels first. Cargo floats if the hull pops.',
    ],
    flee: [
      'This one bites — break off, break off!',
      'Not worth the salvage. We’re gone!',
      'Scatter! There’s easier prey than this.',
      'Pull out. Three of us for one of him. The math turned. It does that.',
    ],
    reinforce: [
      'Call the pack! Tell ’em there’s a fat one!',
      'Bring the whole nest, this one’s loaded!',
      'Reach! To me! We got a live one!',
      'Vane wants this one’s hull numbered. Bring him whole or bring the number.',
    ],
    taunt: [
      'You’re already dead, you just haven’t filed it yet.',
      'Forty tonnes of hull, twelve of cargo, zero of sense. Weighed and found.',
      'Your salvage value’s climbing by the second. Keep shooting.',
      'We tag you before you cool. The weigh-slip’s already printed.',
      'We were cargo once. Tagged, weighed, filed under someone’s margin. Now we run the scales.',
    ],
    'patrol-greeting': [
      'Reach territory. Keep moving and maybe we let you.',
      'You’re alive because we’re bored. Don’t push it.',
      'Passing through? Fast, then. Real fast.',
      'Fly past. Our last three friends who stopped are welded into the Throne.',
    ],
    distress: [
      'We’re lit! Any Reach hull — pull him off us and split the salvage!',
      'She’s breaking! Vane owes us — come collect!',
      'Hull’s opening! Take his guns as payment for the save!',
      'Losing her! The pack better answer for this weigh!',
    ],
  },

  // ── The Quiet — terse / minimal ────────────────────────────────────────────
  faction_quiet: {
    scan: [
      'Seen.',
      'You’re logged.',
      'We know your face now.',
      'Counted. Forty-two today.',
    ],
    warn: [
      'Wrong route. Leave.',
      'Not here.',
      'Turn back. No repeat.',
      'This lane carries no manifest. Yours shouldn’t either. Turn.',
    ],
    'demand-cargo': [
      'The hold. Now.',
      'Give it. Quiet.',
      'Cargo. Or nothing.',
      'Hold. No names. No chain.',
    ],
    attack: [
      'No more words.',
      'Done talking.',
      'Then this.',
      'One less to count.',
    ],
    flee: [
      'Gone.',
      'Later.',
      'Not today.',
      'Forty-two. Still.',
    ],
    reinforce: [
      'Others come.',
      'Not alone.',
      'Wait for them.',
      'More doors open.',
    ],
    taunt: [
      'Loud ones die first.',
      'You talk too much.',
      'Predictable.',
      'Ghost already has the shot.',
      'You filed a name. Names are weight. We drop weight.',
    ],
    'patrol-greeting': [
      'Pass. Say nothing.',
      'We didn’t see you.',
      'Keep it quiet.',
      'No log. No wave. Go.',
      'Pass. The number stays the same either way.',
    ],
    distress: [
      'Dying. Say nothing.',
      'Hull open. Close the channel.',
      'One less. Count it.',
      'Dark now. No name.',
    ],
  },

  // ── Ascendant Choir — zealot / ritual ──────────────────────────────────────
  //  The uncanny lives in monotony and repetition, not adjectives. Liturgy, not
  //  gothic poetry. Proof: Latch-Child is scarier than any of these and says six
  //  words. Keep the cadence. Cut the metaphor-stacking (cling/body/void/claimed).
  faction_choir: {
    scan: [
      'The Choir observes. Hold.',
      'Hold. Be read.',
      'Pattern open. Stand.',
      'You arrive carrying your name. It is heavier than you know.',
    ],
    warn: [
      'Consecrated void. Withdraw.',
      'Not yours. Turn.',
      'Shrine-lane. Depart.',
      'The Pattern holds this lane. You are the dissonance. Withdraw.',
    ],
    'demand-cargo': [
      'Tithe. Release. Rise.',
      'The burden is ours. Give it.',
      'Offer the hold. Be lightened.',
      'Your cargo is weight. Weight is name. Release it and rise.',
    ],
    attack: [
      'Corrected. Hold still.',
      'The Pattern demands. It is given.',
      'Unmade. Remade cleaner.',
      'Refrain. Fire is the answer.',
      'The seventh interval. Your correction is already notated.',
    ],
    flee: [
      'Recorded. Distance changes nothing.',
      'The Pattern holds. We withdraw.',
      'Deferred. Never denied.',
      'The next chorus remembers your heading.',
    ],
    reinforce: [
      'Choir, converge.',
      'More voices. Complete the chorus.',
      'The faithful gather. Sing him silent.',
      'Third refrain. Form the ring.',
      'Ninth voice enters. The Pattern widens to receive him.',
    ],
    taunt: [
      'You are already in the Pattern.',
      'The void has filed you.',
      'Hold still. It is faster.',
      'Your colors are already counted.',
      'You cling to your name. We released ours. Watch which of us is lightened.',
    ],
    'patrol-greeting': [
      'The Choir passes.',
      'Peace. Your time will come, or it will not.',
      'We sing on.',
      'Walk lightly. The Pattern does not require you to be remembered.',
    ],
    distress: [
      'The Pattern receives this vessel. Mark the interval.',
      'We ascend. Sing the hull home.',
      'The chorus opens. We enter unburdened.',
      'Correction complete. We release the form.',
    ],
  },

  // ── Free Frontier — independent / plainspoken ──────────────────────────────
  faction_free: {
    scan: [
      'Frontier relay. Just seeing who’s out here. No hassle.',
      'Reading your beacon. You friendly? We’re friendly.',
      'Free Frontier. We don’t bite unless bitten. Carry on.',
      'Frontier hail. You’re the third live transponder this week. The others weren’t friendly.',
    ],
    warn: [
      'Heads up, that heading’s trouble. Might want to reroute.',
      'Not our rule, but folks around here won’t like you here. Just saying.',
      'You’re pushing into a rough patch. Free advice: don’t.',
      'Salted wake ahead. Reach seeded it two cycles back. Take the long way.',
    ],
    'demand-cargo': [
      'Look, times are lean. Spare some cargo and we part friendly.',
      'Not proud of this, but we need what you’re hauling. Make it easy.',
      'Hand over a share and nobody has a bad day. Your call.',
      'Station behind us is out of filters. Your hold isn’t. Share, and we forget we met.',
    ],
    attack: [
      'Alright, you asked for it. Hate that it came to this.',
      'Didn’t want this fight, but I’ll finish it.',
      'Fine. No hard feelings, but I’m shooting now.',
      'Two of my crew starved on the last lean run. You made it personal.',
    ],
    flee: [
      'This ain’t worth it. Peeling off, good luck out there.',
      'Nope. Not dying today. We’re gone.',
      'Call it a draw. Fly safe, seriously.',
      'Going home. Tell the station we tried.',
    ],
    reinforce: [
      'Getting the others on the line. Sit tight.',
      'Frontier folks stick together — help’s coming.',
      'Radioing the neighbors. Hang on.',
      'Waystation’s awake. They owe us for the last convoy. They’re paying.',
    ],
    taunt: [
      'You fly like you got somewhere better to be.',
      'Big system out here. Plenty of room to run.',
      'No shame in leaving, friend. Offer’s open.',
      'You took this lane because it was empty. It’s empty for a reason.',
      'You don’t wave out here. The ones who waved are why this lane got a name.',
    ],
    'patrol-greeting': [
      'Frontier watch. Waystation’s open if you need it. Fly easy.',
      'All clear out here. Wave if you need anything.',
      'Just neighbors keeping an eye out. Safe travels.',
      'Wave back, friend. Few do. Makes the night shorter.',
    ],
    distress: [
      'We’re coming apart out here — anybody copy?',
      'Hull’s failing. Get word to the waystation for us.',
      'Breaking up. Tell the neighbors we tried.',
      'Going down hard — somebody mark this lane.',
    ],
  },

  // ── The Vael — alien contract-language / formal ────────────────────────────
  faction_vael: {
    scan: [
      'Vael Consensus. Clause 1: your presence is registered. Await disposition.',
      'This-vessel initiates assessment. Your form is being appraised against terms.',
      'Contact acknowledged under provisional terms. State your standing.',
      'Clause 1.4: your species’ entry is noted. The prior entry under this standing is older than your record.',
    ],
    warn: [
      'Clause 3: you occupy Vael-held space without instrument of passage. Void your position.',
      'Your continuance breaches the boundary-accord. Amend, or the accord amends you.',
      'The terms do not admit you here. Withdrawal is the offered remedy.',
      'Clause 3.7: boundary breached. Your vessel predates the notice by eleven of your cycles. The notice is still valid.',
    ],
    'demand-cargo': [
      'Clause 7: your holdings are subject to Vael claim. Render them to satisfy the term.',
      'The contents of your vessel are, by accord, forfeit. Deliver, and the ledger balances.',
      'Surrender the carried-mass. This settles the debt you did not know you incurred.',
      'Clause 7.2: the mass is claimed by prior entry. Your transit was its temporary custody.',
    ],
    attack: [
      'Clause 9 invoked. The penalty is enacted upon your form.',
      'You have voided the terms. Enforcement is now this-vessel’s obligation.',
      'The accord permits correction. It is administered.',
      'Clause 9.5: correction. Your form resists the term. The term does not resist.',
    ],
    flee: [
      'The term is suspended, not dissolved. This-vessel withdraws.',
      'Clause 12: engagement lapses. The obligation persists in the ledger.',
      'Disposition deferred. Your entry remains in the accord.',
      'Clause 12.3: lapsed. Your entry is permanent. Distance is decorative.',
    ],
    reinforce: [
      'Consensus summoned. Additional-vessels enter the accord.',
      'The many are called. The term will be fulfilled in number.',
      'Clause of quorum invoked. More of this-kind converge.',
      'Consensus expands. The term was drafted for the many. The many arrive.',
    ],
    taunt: [
      'Your resistance is a clause already anticipated and priced.',
      'You bargain against terms you cannot read.',
      'The ledger closes with or without your assent.',
      'Clause 19: the losing party bears the cost of the verdict. This is the verdict.',
      'Your species negotiates. The accord pre-dates negotiation. It will outlast yours.',
    ],
    'patrol-greeting': [
      'Vael passage. The terms hold. You are permitted, for now.',
      'This-vessel transits under standing accord. No obligation falls to you today.',
      'Consensus observes. Your standing is neutral. Proceed.',
      'Passage granted. The clause permitting you was authored before your world formed.',
    ],
    distress: [
      'Clause 23: this-vessel declares termination imminent. Assistance is owed.',
      'Form integrity fails. The accord obligates witness.',
      'This-vessel dissolves. The ledger must record the cause.',
      'Termination proceeds. Custody of the record transfers.',
    ],
  },
  // ── Deep factions (K1 route) — each speaks its own register, never the Frontier fallback ──────
  faction_archive: {
    scan: [
      'The reading room sees you. Your file opens itself.',
      'Shelf notice: a vessel enters the catalogue. Remain legible.',
      'Your transponder is read aloud in a dead tongue. Hold still.',
      'The index turns toward you. Nothing about you is new to it.',
    ],
    warn: [
      'Shelve your velocity. The stacks are not a corridor.',
      'Your wake smudges the folios. The librarians are patient, not forgiving.',
      'Margin note: this approach is annotated as carelessness.',
      'Reading-room order: silence, distance, and no fire near the paper.',
    ],
    'demand-cargo': [
      'Your hold contains unindexed mass. Surrender it for cataloguing.',
      'The Archive does not steal. It recovers what was never yours to shelve.',
      'Deliver the undocumented cargo. The rest of you may leave the stacks.',
      'What you carry is a loan. The lending period is over.',
    ],
    attack: [
      'Redaction begins. Your name will keep; the rest of you will not.',
      'You chose the burning wing. The Codex records who chose first.',
      'We do not fight. We erase what resists being remembered.',
      'Every reader has a lighter. Yours is lit now.',
    ],
    flee: [
      'Withdrawing to closed stacks. The file remains open.',
      'The index retreats a shelf. Your entry does not.',
      'Censors fall back. Nothing you did is unread.',
      'Retreating to the Severed Codex. Distance does not unwrite you.',
    ],
    reinforce: [
      'Additional readers summoned. The index converges.',
      'The abbot-cruisers turn their lamps this way.',
      'More eyes on the same page. Your page.',
      'The reading room expands. You are still inside it.',
    ],
    taunt: [
      'Your hull is a rumor. We keep the confirmed volumes.',
      'You shoot at a library. The bruise on the universe is already filed.',
      'Burn one book and every reader in the dark learns your name.',
      'We have read braver pilots. Their chapters are short.',
    ],
    'patrol-greeting': [
      'Reader\'s courtesy: state nothing you want unremembered.',
      'The Archive transits. Your secrets arrive early.',
      'Reading-room greeting. We already know the interesting parts.',
      'Pass gently. The stacks remember the rude.',
    ],
    distress: [
      'The codex leaks folios. A reader requests the loan of rescue.',
      'Hull breach in the stacks. Witnesses are obligated to remember us.',
      'We sink into our own index. Assistance is requested, not begged.',
      'The Archive dims. Even enemies of knowledge answer this page.',
    ],
  },
  faction_fulfillment: {
    scan: [
      'Vessel detected at waypoint. Submitting for re-sequence.',
      'Transponder received. Queue position assigned.',
      'Sensor sweep routine. Your compliance is already logged.',
      'Checkpoint reached. Your transit enters the manifest.',
    ],
    warn: [
      'Deviation from fixed route detected. A correction will be scheduled.',
      'Your heading conflicts with the assigned lane. Amend it.',
      'Waypoint tolerance exceeded. Return to sequence.',
      'Transit anomaly logged. The next unit will hold for your correction.',
    ],
    'demand-cargo': [
      'Administrative boarding is now a routing event. Hold position.',
      'Your cargo requires manifest reconciliation. Stand by for boarding.',
      'Seizure is a routing outcome, not a negotiation. Hold still.',
      'Cargo inspection is scheduled at this waypoint. It is scheduled now.',
    ],
    attack: [
      'Escalation protocol: your non-compliance has been re-routed.',
      'Defensive fire authorized. Your incident number is assigned.',
      'First-fire prohibition satisfied. Disabling you is now routine.',
      'Compliance enforcement engaged. This was itemized in advance.',
    ],
    flee: [
      'Unit withdrawing to assigned waypoint. This interaction is archived.',
      'Route deviation: self-preservation. Your file retains the debt.',
      'This unit exits the sequence. Another will hold the waypoint.',
      'Withdrawal scheduled. Your route rating is adjusted.',
    ],
    reinforce: [
      'Support units dispatched on the fixed route. Arrival is scheduled.',
      'Waypoint saturation increased. Additional hulls inbound on schedule.',
      'Escort re-sequence complete. Your odds were tabulated.',
      'The route provides. More units are already en route by design.',
    ],
    taunt: [
      'Your transit is inefficient. The route will absorb it.',
      'Resistance adds handling time. It does not add outcomes.',
      'Your deviation is unremarkable. The schedule is not.',
      'Every route ends at a waypoint. Yours ends sooner.',
    ],
    'patrol-greeting': [
      'Route status: nominal. Your presence is noted and sequenced.',
      'Fixed-route transit. Keep your lane and there is no incident.',
      'The Fulfillment passes on schedule. You are not part of the schedule.',
      'Waypoint traffic is routine. Your transponder has been filed.',
    ],
    distress: [
      'Hull integrity below route tolerance. Requesting scheduled assistance.',
      'This unit cannot complete the route. A recovery waypoint is filed.',
      'Transit failure declared. The manifest must record the cause.',
      'Propulsion lost. Stand by for administrative rescue.',
    ],
  },
  faction_pitborn: {
    scan: [
      'Yard eyes on you, kin. What\'s your manifest weigh?',
      'The fence reads your hull. Scrap or sibling — the scale decides.',
      'Dock-credit check. Pitborn don\'t stare, we appraise.',
      'Seen your weld seams from here. Yard born, or bought?',
    ],
    warn: [
      'Easy on the lane — that\'s the yard\'s shooting lane, not a stroll.',
      'Mind the fence line. Trespass gets sold, not chased.',
      'You\'re drifting into the burn zone, kin. Steer.',
      'Concord rules end at the yard light. Yard law started already.',
    ],
    'demand-cargo': [
      'Fence takes it all — the hold, not the hull. Your choice.',
      'Dump the cargo, kin. Scrap\'s worth more than your pride.',
      'Yard tax: everything heavy you\'re hauling. Tonight it feeds the yard.',
      'We weigh your hold and take our cut. Cheaper than the alternative, always.',
    ],
    attack: [
      'Yard law! Scrap is scrap — yours is coming home!',
      'For the yard! Cut the engines, keep the hull!',
      'You picked the wrong fence to lean on, kin!',
      'The Pitborn don\'t fire first on kin. You stopped being kin a blink ago.',
    ],
    flee: [
      'Falling back to the fence! The yard don\'t bleed for pride.',
      'Scrap ain\'t worth dying for twice. We\'re out.',
      'Back to the burn piles! The yard keeps what it can hold.',
      'Kin inbound get hurt — pull out! Live scrappers eat tomorrow.',
    ],
    reinforce: [
      'Kin inbound! The yard answers its own.',
      'More of us on the burn! The fence holds by numbers.',
      'Yardmaster sent the reserve — salvage crews with teeth.',
      'Brothers and sisters, converge! Somebody weighed our kin wrong.',
    ],
    taunt: [
      'Seen better hulls in the burn pile, friend.',
      'Your guns are Concord-issue. Cute. We melt those.',
      'Bright target, dim pilot. The yard prices both.',
      'That hull\'s worth more dead than you are flying it.',
    ],
    'patrol-greeting': [
      'Yard keeps the lights on. Wrecks welcome, Concord ain\'t.',
      'Safe passage through the fence, kin. Don\'t make us re-weigh that.',
      'Pitborn on the lane. Sell us your scrap or stay out of it.',
      'The yard\'s open. First drink\'s a story, second one\'s your manifest.',
    ],
    distress: [
      'Yard\'s going down! Any kin listening — scrap the difference later!',
      'Hull\'s burning, fuel\'s worse. Pitborn asks the dark for a pull.',
      'Fence breached! If the Concord gets this wreck, we all lose.',
      'We\'re losing the hull. Somebody tow a Pitborn home — the yard pays.',
    ],
  },
  faction_understory: {
    scan: [
      'You drift over a garden. We read what you will leave.',
      'The bloom tastes your wake. It remembers the flavor of steel.',
      'Small bright thing. The garden measures what feeds it.',
      'Your hull is warm and full. The wreck-light notices.',
    ],
    warn: [
      'Careful passage. The roots have long patience, not none.',
      'The garden does not chase. It only keeps what falls.',
      'You bruise the bloom. It has eaten harder bruises.',
      'Move gently here. The dead built this place, and the dead are touchy.',
    ],
    'demand-cargo': [
      'The dead give freely. The living may also be persuaded.',
      'What you carry rots slower in our hold. Relinquish it.',
      'Feed the garden the heavy things. Your hull stays lighter — and intact.',
      'We ask nothing of the dead. Of you, we ask only cargo.',
    ],
    attack: [
      'The bloom defends the garden. It is what feeding looks like.',
      'You have become mulch with engines. The garden accepts.',
      'We did not fire first. We never do. The bloom fires now.',
      'Your resistance is just slower decay. The roots are patient.',
    ],
    flee: [
      'We recede into the wreck-light. The garden keeps growing.',
      'The bloom folds back. Nothing uproots the garden but time.',
      'We retreat as rot does — everywhere at once, slowly.',
      'Into the grave-fields. Your leavings will find us anyway.',
    ],
    reinforce: [
      'More tendrils rise. The bloom answers its own hunger.',
      'The wreck-light swells. What sleeps here wakes for this.',
      'The garden calls its keepers. More arrive to tend you.',
      'Bloom upon bloom. The graveyard is never under-crewed.',
    ],
    taunt: [
      'You are bright and brief. The dark is patient and fed.',
      'Everything you carry was once ours. It returns eventually.',
      'Strike the bloom and it flowers elsewhere. Gardens do not die in pieces.',
      'We have eaten navies. You are a snack with a transponder.',
    ],
    'patrol-greeting': [
      'The garden admits all travelers. Especially the tired.',
      'Drift easy. The wreck-light warms those who mean no cutting.',
      'Tender\'s greeting. The garden asks what you will become.',
      'Pass through the bloom gently. It keeps what it catches.',
    ],
    distress: [
      'The bloom is wounded. Tenders ask the dark for hands.',
      'We rot faster than the garden feeds. Assistance, while we still flower.',
      'The wreck-light dims. Even reapers fear the clearing.',
      'Our hold is cracking. The garden remembers who helped it live.',
    ],
  },
  faction_verge_layers: {
    scan: [
      'Query: is this vessel gate-true? Your wake is being read.',
      'The prism observes. Transit logged in the standing ledger.',
      'Assessment: your mass disturbs the lattice within tolerance.',
      'The gate remembers every crossing. Yours is being inscribed.',
    ],
    warn: [
      'Assessment pending: your transit disturbs the lattice.',
      'The lattice reads instability in your wake. Compose it.',
      'You pass close to a closure wound. The lattice asks your intent.',
      'Transit irregularity detected. The prism brightens its question.',
    ],
    'demand-cargo': [
      'The lattice requires an accounting of what you carry.',
      'Your hold is un-audited mass. Present it for inscription.',
      'Closure audit: surrender the undocumented cargo to the lattice.',
      'What transits is owed an entry. Render the cargo for the record.',
    ],
    attack: [
      'Closure response: the lattice unmakes what unmakes it.',
      'You chose to be a closure event. The lattice complies.',
      'We do not destroy. We revoke. Your transit ends here.',
      'Gate-shutter logic applies: what threatens the passage is removed.',
    ],
    flee: [
      'The prism recedes. The lattice does not pursue — it waits.',
      'We withdraw from the crossing. The gate still stands.',
      'The lattice dims this facet. Others watch other gates.',
      'Retreat is a routing fact. The lattice is a standing one.',
    ],
    reinforce: [
      'The lattice brightens. Additional prisms respond.',
      'Gate-audit quorum reached. More facets turn this way.',
      'The crossing is reinforced. The lattice always outnumbers.',
      'More of us cohere. The gate does not stand alone.',
    ],
    taunt: [
      'You are a brief signal. The lattice is a standing question.',
      'Brief light, loud wake. The lattice has closed louder.',
      'Your defiance is a minor vibration. It damps itself.',
      'The gates stood before your star warmed. You are weather.',
    ],
    'patrol-greeting': [
      'The gates hold. Your transit is tolerated — answer honestly.',
      'Prism-watch acknowledges your passage. Cross clean.',
      'The lattice admits you. It admits everyone it watches.',
      'Transit approved for now. The audit never fully closes.',
    ],
    distress: [
      'The lattice frays at this facet. Aid requested of any true crossing.',
      'A prism dims. The gate-keepers ask passage of mercy.',
      'Structural clarity failing. The lattice petitions the living.',
      'We hold the crossing even broken. Assistance preserves the gate.',
    ],
  },
};

/**
 * Pick a deterministic index in [0, len) from a seeded rng OR a numeric index.
 * @param {function|number|undefined} rng  mulberry32-style fn returning [0,1), or an integer index.
 * @param {number} len  array length (> 0).
 */
function pickIndex(rng, len) {
  if (len <= 1) return 0;
  if (typeof rng === 'number' && Number.isFinite(rng)) {
    // Numeric index: wrap into range (handles negatives).
    return ((Math.floor(rng) % len) + len) % len;
  }
  if (typeof rng === 'function') {
    const v = rng();
    const f = (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    // Clamp to [0,1) then scale.
    const clamped = f < 0 ? 0 : (f >= 1 ? 0.9999999 : f);
    return Math.floor(clamped * len);
  }
  // No rng provided — deterministic first line.
  return 0;
}

/**
 * Deterministically select one radio bark line for a faction + situation.
 *
 * @param {string} factionId   one of BARK_FACTIONS (unknown ids fall back to faction_free).
 * @param {string} situation   one of BARK_SITUATIONS (unknown falls back to 'scan').
 * @param {function|number} [rng]  seeded rng fn (returns [0,1)) or a numeric index. Deterministic.
 * @returns {string}  a non-empty radio line. Always returns a string (never null/undefined).
 */
export function barkFor(factionId, situation, rng) {
  const faction = (factionId && BARKS[factionId]) ? BARKS[factionId] : BARKS.faction_free;
  let lines = faction[situation];
  if (!Array.isArray(lines) || lines.length === 0) {
    // Situation not covered for this faction — fall back to 'scan', then to any populated situation.
    lines = faction.scan;
    if (!Array.isArray(lines) || lines.length === 0) {
      for (const key of BARK_SITUATIONS) {
        if (Array.isArray(faction[key]) && faction[key].length) { lines = faction[key]; break; }
      }
    }
  }
  if (!Array.isArray(lines) || lines.length === 0) return '...'; // ultimate guard
  const idx = pickIndex(rng, lines.length);
  const line = lines[idx];
  return (typeof line === 'string' && line.length) ? line : '...';
}

// ── PQ-142.01 — recognition by hull ───────────────────────────────────────────────────────────
//
// `design/VISION.md` Part II: the ship accumulates "a reputation by hull — until it is my fucking
// ship". These lines are the moment somebody says the NAME of the ship instead of "unidentified
// vessel", after that hull was seen doing something. They are deliberately NOT a BARK_SITUATION:
// that set is the contract every faction must cover for ordinary contact, and recognition is an
// event, not a contact state.
//
// Tokens: {ship} the hull's name, {class} its class word. Both always resolve.
export const HULL_RECOGNITION = Object.freeze({
  faction_scn: Object.freeze([
    'Registry match: {ship}. The incident file grew again. Ref 44-C.',
    'That is the {ship}. Log the sighting before the shooting stops.',
    'Concord advisory: {ship} is on scene. Adjust your paperwork accordingly.',
    '{ship}, {class} hull. We know the silhouette. We are filing it anyway.',
  ]),
  faction_mts: Object.freeze([
    'That is the {ship}. Her wake costs money. Someone always pays it.',
    'Meridian floor: the {ship} just moved the price of standing here.',
    '{ship} on the board. Adjust the spread, she does not negotiate.',
    'Recognise the {class}? That is the {ship}. Invoice follows the wreckage.',
  ]),
  faction_dmc: Object.freeze([
    "That is the {ship}. I've hauled past her twice. Twice was enough.",
    'Drift crews know the {ship}. Nobody wants the shift she works.',
    '{ship} again. Long day just got longer.',
    "It's the {ship}. Shut the intercom and hold the lane.",
  ]),
  faction_reach: Object.freeze([
    'That is the {ship}! I told you the hull was real!',
    "The {ship}. Somebody's cousin died over this {class}.",
    "{ship} is here. Say her name so they know we're not scared.",
    'Reach knows the {ship}. Reach has a price for the {ship}.',
  ]),
  faction_quiet: Object.freeze([
    '{ship}.',
    'The {ship}. Hold.',
    'That hull is the {ship}. Say nothing else.',
    'Recognised: {ship}. Channel closed.',
  ]),
  faction_choir: Object.freeze([
    'The {ship} is written. The Pattern remembers the {class}.',
    'Behold: {ship}, marked and returning. The mark is the message.',
    '{ship} carries her scars where the Pattern can read them.',
    'The {ship} has been counted. Ascension notices the counted.',
  ]),
  faction_free: Object.freeze([
    "That's the {ship}. Everybody out here has heard that name.",
    '{ship}. Word travels faster than a {class} does.',
    "It's the {ship}. Leave her the lane, she's earned it.",
    'Frontier channel: the {ship} is on the board. Mind your distance.',
  ]),
  faction_vael: Object.freeze([
    'Clause four: the vessel {ship} is a party of record.',
    'Identification affirmed — {ship}, {class} form. Terms are amended.',
    'The {ship} appears. Prior obligations resume without notice.',
    '{ship}. Your history is admissible.',
  ]),
  faction_archive: Object.freeze([
    '{ship}. The entry exists. The index did not write itself.',
    'That is the {ship}. Your {class} has a chapter already.',
    'Shelf note: the {ship} returns. The record grows by a page.',
    '{ship}, {class} class. The reading room recognizes its characters.',
  ]),
  faction_fulfillment: Object.freeze([
    'Vessel identified as {ship}. Priority re-sequence initiated.',
    'The {ship}. Your route history has been loaded.',
    'Manifest match: {ship}, {class}. Deviation tolerance reassessed.',
    '{ship} on the route. Its incident file precedes it.',
  ]),
  faction_pitborn: Object.freeze([
    'That\'s the {ship}! The yard talks about that {class}, kin.',
    '{ship} on the lane. The fence remembers what it towed in.',
    'Yard eyes know the {ship}. Stories like that hull don\'t stay quiet.',
    'The {ship}. Kin or quarry — the yard weighed you long ago.',
  ]),
  faction_understory: Object.freeze([
    'The {ship} flowers again. The garden remembers its scent.',
    'That hull is the {ship}. The wreck-light kept its shape.',
    '{ship}, a {class} the roots have tasted before.',
    'The garden reads the {ship}\'s wake. It has read it before.',
  ]),
  faction_verge_layers: Object.freeze([
    'The lattice recognizes {ship}. Prior crossings are recalled.',
    '{ship} transits again. The gate keeps every inscription.',
    'Assessment: the {ship}, a {class} of record. Its file is ancient.',
    '{ship}. The lattice does not forget a signature.',
  ]),
});

/**
 * Deterministically select one hull-recognition line and fill its tokens.
 *
 * @param {string} factionId  one of BARK_FACTIONS (unknown ids fall back to faction_free).
 * @param {function|number} [rng]  seeded rng fn or a numeric index. Deterministic.
 * @param {{ship?: string, class?: string}} [tokens]
 * @returns {string} a non-empty line with every token resolved.
 */
export function hullRecognitionBarkFor(factionId, rng, tokens = {}) {
  const lines = (factionId && HULL_RECOGNITION[factionId]) || HULL_RECOGNITION.faction_free;
  const line = lines[pickIndex(rng, lines.length)];
  const ship = typeof tokens.ship === 'string' && tokens.ship.trim() ? tokens.ship.trim() : 'that hull';
  const shipClass = typeof tokens.class === 'string' && tokens.class.trim()
    ? tokens.class.trim() : 'hull';
  return String(line).replace(/\{ship\}/g, ship).replace(/\{class\}/g, shipClass);
}

// ── Living-world history recognition ──────────────────────────────────────────────────────────
//
// Where HULL_RECOGNITION names the hull, HISTORY_RECOGNITION names what the hull DID: the count of
// a faction's hulls the player broke, and the named captains who remember them (hunting, fearful,
// or grateful). Same contract as hull recognition — not a BARK_SITUATION, an event line. The
// selector only ever picks a family whose fact actually exists (a named captain, or a nonzero kill
// count), so a history line always references real history.

export const HISTORY_RECOGNITION = Object.freeze({
  faction_scn: Object.freeze({
    kills: Object.freeze([
      'Registry cross-reference: {kills} Concord hulls lost to {ship}. Your file is thick.',
      '{ship}. {kills} open incident files. Ref 44-C notes repeat offenders.',
    ]),
    hunts: Object.freeze([
      '{captain} filed a standing grievance against {ship}. It is approved.',
      'Advisory: {captain} holds priority claim on {ship}. Do not interfere with the recovery.',
    ]),
    fears: Object.freeze([
      '{captain} requests armed escort whenever {ship} is on the board. Request granted.',
      '{ship} sighted. {captain}\'s wing declines engagement. Noted, not judged.',
    ]),
    offers_work: Object.freeze([
      '{captain} holds a work order with {ship}\'s name on it. Lucky hull.',
      '{captain} vouches for {ship}. The vouch is on file.',
    ]),
  }),
  faction_mts: Object.freeze({
    kills: Object.freeze([
      '{kills} of our hulls, {ship}. Someone has been paying your premiums.',
      '{ship} — {kills} write-offs this quarter. The board knows your name.',
    ]),
    hunts: Object.freeze([
      '{captain} bought your debt, {ship}. Collections is on the lane.',
      '{captain} holds the note on {ship}. The rate just went up.',
    ]),
    fears: Object.freeze([
      '{captain} passed on your contract, {ship}. First smart money all cycle.',
      'The floor dropped {captain}\'s position on {ship}. Even collectors have limits.',
    ]),
    offers_work: Object.freeze([
      '{captain} fronted you credit, {ship}. Good for the margin. Keep flying.',
      '{captain} underwrote {ship}. That is a reputation with a number on it.',
    ]),
  }),
  faction_dmc: Object.freeze({
    kills: Object.freeze([
      '{kills} rigs. That is {kills} shift whistles that went quiet. We know, {ship}.',
      '{ship}. {kills} of our hulls on the scrap list this cycle. Long war.',
    ]),
    hunts: Object.freeze([
      '{captain} keeps a wrench with {ship}\'s name scratched in it.',
      '{captain} radioed the belts: {ship} owes blood on the ledger.',
    ]),
    fears: Object.freeze([
      '{captain} pulled their crew off the lane when {ship} showed. Smart, that.',
      'Nobody blames {captain} for running. {ship} earned that fear.',
    ]),
    offers_work: Object.freeze([
      '{captain} says {ship} pulls weight for the Collective. The yard remembers that.',
      '{captain} put in a word for {ship} at the yard. Words like that hold.',
    ]),
  }),
  faction_reach: Object.freeze({
    kills: Object.freeze([
      '{ship}. {kills} hulls on their weigh-slip. The Reach counts, friend.',
      '{kills} of ours, by {ship}\'s guns. That is a debt with mass.',
    ]),
    hunts: Object.freeze([
      '{captain} opened the weigh-slip on {ship}. The number keeps climbing.',
      '{captain} called the pack. {ship}\'s tonnage is the prize.',
    ]),
    fears: Object.freeze([
      '{captain}\'s crew won\'t weigh against {ship}. Look at the slip — can\'t blame them.',
      '{ship} is on the board and {captain} just remembered urgent business elsewhere.',
    ]),
    offers_work: Object.freeze([
      '{captain} vouches {ship} pays fair. Rare words in the Reach.',
      '{captain} pulled {ship}\'s wake out of the red. The crew noticed.',
    ]),
  }),
  faction_quiet: Object.freeze({
    kills: Object.freeze([
      '{kills}. Counted. {ship}.',
      '{ship}. {kills} of ours. The number holds.',
    ]),
    hunts: Object.freeze([
      '{captain} speaks your name, {ship}. Once.',
      '{captain} keeps the count. {ship} is in it.',
    ]),
    fears: Object.freeze([
      '{captain} saw {ship}. {captain} left.',
      '{ship}. {captain} says nothing. That is the answer.',
    ]),
    offers_work: Object.freeze([
      '{captain} owes {ship}. Debts are quiet but paid.',
      '{captain} holds work with {ship}\'s name on it.',
    ]),
  }),
  faction_choir: Object.freeze({
    kills: Object.freeze([
      '{kills} voices, {ship}, silenced into the Pattern. It remembers.',
      '{ship} carries {kills} of our names. Heavy cargo.',
    ]),
    hunts: Object.freeze([
      '{captain} notates {ship}\'s correction. The interval approaches.',
      '{captain} sings the verse that ends with {ship}.',
    ]),
    fears: Object.freeze([
      '{captain} deferred the chorus when {ship} neared. Deferred, never denied.',
      '{ship} is counted and {captain} withdrew. The Pattern is patient.',
    ]),
    offers_work: Object.freeze([
      '{captain} names {ship} friendly to the chorus. Rare grace.',
      '{captain} walks with {ship}. The Pattern notes the kindness.',
    ]),
  }),
  faction_free: Object.freeze({
    kills: Object.freeze([
      '{ship}. Folks say {kills} hulls went down to your guns. We keep count out here too.',
      '{kills} of ours, {ship}. Neighbors remember.',
    ]),
    hunts: Object.freeze([
      '{captain} is asking after {ship}. Nothing good comes of that ask.',
      '{captain} took the {ship} contract personal. Watch the lane.',
    ]),
    fears: Object.freeze([
      '{captain} wants no part of {ship}. First wise call all week.',
      '{captain} saw {ship} and turned. Can\'t say I\'d blame them.',
    ]),
    offers_work: Object.freeze([
      '{captain} speaks well of {ship}. Says the hull pays its debts.',
      '{captain} owes {ship} one. Out here that means something.',
    ]),
  }),
  faction_vael: Object.freeze({
    kills: Object.freeze([
      'Clause {kills}: {ship} stands in breach. The ledger accumulates.',
      '{ship}. {kills} entries under breach-of-accord. The terms remember.',
    ]),
    hunts: Object.freeze([
      '{captain} holds an open term against {ship}. It matures soon.',
      'The accord assigns {captain} to {ship}. Enforcement follows.',
    ]),
    fears: Object.freeze([
      '{captain} declined the {ship} term. Disposition deferred.',
      '{captain}\'s consensus withdrew from {ship}. The ledger notes hesitation.',
    ]),
    offers_work: Object.freeze([
      '{captain} extends {ship} provisional credit. Rare terms.',
      '{captain} names {ship} a party of record in good standing.',
    ]),
  }),
  faction_archive: Object.freeze({
    kills: Object.freeze([
      '{ship}: {kills} readers\' hulls unwritten. The index keeps the count in red.',
      '{kills} folios closed by {ship}. The reading room does not forgive a burned page.',
    ]),
    hunts: Object.freeze([
      '{captain} petitioned the abbot for {ship}\'s chapter. Granted.',
      '{captain} reads the hunt aloud at every crossing. {ship} is the text.',
    ]),
    fears: Object.freeze([
      '{captain} refused the shelf where {ship} hunts. Noted without judgment.',
      '{captain} closes their folio when {ship} is sighted. The stacks understand.',
    ]),
    offers_work: Object.freeze([
      '{captain} vouched {ship}\'s name into the catalogue. The loan stands.',
      '{captain} reads {ship} kindly. The index trusts a reader\'s memory.',
    ]),
  }),
  faction_fulfillment: Object.freeze({
    kills: Object.freeze([
      '{ship}: {kills} hull losses on the route ledger. Your routing is flagged.',
      'Incident tally: {kills} Fulfillment hulls, attributed {ship}. Variance logged.',
    ]),
    hunts: Object.freeze([
      '{captain} re-sequenced to {ship}\'s route. The schedule is deliberate.',
      '{captain} holds {ship}\'s incident file. Recovery is on the manifest.',
    ]),
    fears: Object.freeze([
      '{captain} deviated on sighting {ship}. The route granted it.',
      '{captain} queued behind other waypoints when {ship} transits.',
    ]),
    offers_work: Object.freeze([
      '{captain} rated {ship} route-friendly. The score is filed.',
      '{captain} shares a waypoint ledger with {ship}. Standing: good.',
    ]),
  }),
  faction_pitborn: Object.freeze({
    kills: Object.freeze([
      '{ship}. {kills} of our kin scrapped by your guns. The fence don\'t forget.',
      '{kills} Pitborn hulls to your name, {ship}. The yard tallies in blood.',
    ]),
    hunts: Object.freeze([
      '{captain} sharpened a tow-hook for {ship}. The yard knows why.',
      '{captain} priced {ship}\'s hull already. Kin pays up when asked.',
    ]),
    fears: Object.freeze([
      '{captain} sold their salvage rights rather than meet {ship}. Smart yard trade.',
      '{captain} saw the {ship} burn-scar and turned for the fence.',
    ]),
    offers_work: Object.freeze([
      '{captain} says {ship} trades square with the yard. That\'s rare gold.',
      '{captain} owes {ship} a tow. The fence settles its kin-debts.',
    ]),
  }),
  faction_understory: Object.freeze({
    kills: Object.freeze([
      '{ship}: {kills} blooms cut down. The garden composts grievances too.',
      '{kills} tenders lost to {ship}. The wreck-light remembers the shape.',
    ]),
    hunts: Object.freeze([
      '{captain} tends the root that grows toward {ship}. Slow, patient, fed.',
      '{captain} marked {ship}\'s scent in the bloom. The garden follows.',
    ]),
    fears: Object.freeze([
      '{captain} wilted at {ship}\'s wake. The garden permits retreat.',
      '{captain} folds into the wreck-light when {ship} crosses the field.',
    ]),
    offers_work: Object.freeze([
      '{captain} says {ship} leaves good leavings. The garden repays in kind.',
      '{captain} calls {ship} a tender-friend. The bloom remembers warmth.',
    ]),
  }),
  faction_verge_layers: Object.freeze({
    kills: Object.freeze([
      '{ship}: {kills} prism-facets dimmed. The lattice archives the loss.',
      '{kills} gate-keepers closed by {ship}. The audit keeps the count.',
    ]),
    hunts: Object.freeze([
      '{captain} recalibrates for {ship}. The lattice appoints its auditors.',
      '{captain} holds the closure-warrant on {ship}. It predates your flight.',
    ]),
    fears: Object.freeze([
      '{captain} diverted to an outer gate when {ship} transited. Prudent prism.',
      '{captain} dims voluntarily rather than audit {ship} again.',
    ]),
    offers_work: Object.freeze([
      '{captain} inscribed {ship} as gate-true. A rare entry.',
      '{captain} stands surety for {ship} at the lattice. The record honors it.',
    ]),
  }),
});

const HISTORY_STANCE_PRECEDENCE = Object.freeze(['hunts', 'fears', 'offers_work']);

/**
 * One line that references the player's actual history with a faction. Facts come from
 * factionHistoryFromMemory (namedAces.js): at least one of { captains, kills } must be truthy.
 * Family order: a remembered captain beats a kill count; each family's fact is guaranteed real.
 *
 * @param {string} factionId  one of BARK_FACTIONS (unknown ids fall back to faction_free).
 * @param {{shipName?: string, kills?: number, captains?: Array<{name: string, stance: string}>}} facts
 * @param {function|number} [rng]  seeded rng fn or numeric index. Deterministic.
 * @returns {string} a non-empty line referencing a real fact (falls back to '' without facts).
 */
export function historyBarkFor(factionId, facts = {}, rng = 0) {
  if (!facts || facts.hasHistory !== true) return '';
  const families = (factionId && HISTORY_RECOGNITION[factionId]) || HISTORY_RECOGNITION.faction_free;
  const captains = Array.isArray(facts.captains) ? facts.captains : [];
  let family = null;
  let captain = null;
  for (const stance of HISTORY_STANCE_PRECEDENCE) {
    const match = captains.find((row) => row && row.stance === stance);
    if (match && Array.isArray(families[stance]) && families[stance].length) {
      family = stance;
      captain = match;
      break;
    }
  }
  if (!family && facts.kills > 0 && Array.isArray(families.kills) && families.kills.length) {
    family = 'kills';
  }
  if (!family) return '';
  const line = families[family][pickIndex(rng, families[family].length)];
  const ship = typeof facts.shipName === 'string' && facts.shipName.trim()
    ? facts.shipName.trim() : 'that hull';
  return String(line)
    .replace(/\{ship\}/g, ship)
    .replace(/\{kills\}/g, String(Math.max(0, facts.kills | 0)))
    .replace(/\{captain\}/g, (captain && captain.name) || 'the captain');
}

const contactChoice = (id, label, lineIndexes) => Object.freeze({
  id,
  label,
  lineIndex: lineIndexes[0],
  lineIndexes: Object.freeze(lineIndexes.slice()),
});

const contactVoice = (register, lines, choices, dialogueComplete = false) => Object.freeze({
  register,
  lines: Object.freeze(lines.slice()),
  firstContact: Object.freeze({ choices: Object.freeze(choices.slice()) }),
  dialogueComplete,
});

// Dock conversations do not consume the one-voice overlay budget. Mission chains may unlock
// later lines, but every named register is authored now so no contact falls back to generic copy.
export const CONTACT_VOICE_REGISTERS = Object.freeze({
  contact_yune: contactVoice('quiet-bureaucratic', [
    'Registration VHL-4471-T. Incident 7741. Lower your voice.',
    'Sealed files open for a fee. Then re-seal.',
    'REF 44-C is not a rule. It is a drawer.',
    'Contract 47-A was filed unpaid before you flew it.',
    'Build a name first. Then ask who voided payment.',
    'You heard no code here. I whispered no code.',
  ], [
    contactChoice('incident', 'Ask about 7741', [0, 2]),
    contactChoice('contract', 'Ask about 47-A', [3, 4]),
    contactChoice('reseal', 'Re-seal the file', [1, 5]),
  ]),
  contact_coldburn_rey: contactVoice('working-rival', [
    'You took that lane. I remember which one.',
    'I hauled it first. You got the stamp.',
    'Not piracy. Competition with better aim.',
    'I do not hide. I cut across your lane.',
    'Keep winning. I can afford another escort.',
    'Do not call me villain. Call me underbid.',
  ], [
    contactChoice('lane', 'Name the lane', [0, 1]),
    contactChoice('settle', 'Settle the contract', [2, 5]),
    contactChoice('intercept', 'Challenge his intercept', [3, 4]),
  ]),
  contact_iren_suhl: contactVoice('plain-clause', [
    'The clauses answer back. I keep the transcripts.',
    'The Vael clause repeats your breath before you speak.',
    'They are not translating us. They are transcribing us.',
    'Bring artifacts. I pay for field samples, not miracles.',
    'Each shard unlocks one clause. Never two.',
    'Peace requires the answer they expected, not the one you prefer.',
  ], [
    contactChoice('transcripts', 'Read the transcripts', [0, 1]),
    contactChoice('artifact', 'Offer an artifact', [3, 4]),
    contactChoice('peace', 'Ask about peace', [2, 5]),
  ]),
  contact_orrin: contactVoice('procedural-defeated', [
    'The audit is clean. The audit is always clean.',
    'Seventeen inquiries opened. Seventeen closures. All properly witnessed.',
    'I cannot protect testimony. I can protect evidence.',
    'Five sealed records become a case I cannot close.',
    'The Quiet will charge you for becoming legible.',
    'Bring black boxes, ledgers, originals. Not summaries.',
  ], [
    contactChoice('audits', 'Ask about the audits', [0, 1]),
    contactChoice('evidence', 'Submit evidence', [2, 5]),
    contactChoice('threshold', 'Ask what five means', [3, 4]),
  ]),
  contact_sker_vane: contactVoice('patient-bravado', [
    'My lane. My toll. My cut of your apology.',
    "That hull ran my captain's cargo. Poorly, but memorably.",
    'I inherited the lane. You inherited the apology.',
    'Tolls first. Raids later. Patience makes both profitable.',
    'Orrin likes files. I like knowing who carries them.',
    'Choose whose enemy you can afford before touching mine.',
  ], [
    contactChoice('toll', 'Discuss the toll', [0, 3]),
    contactChoice('tessera', 'Ask about Tessera', [1, 2]),
    contactChoice('file', 'Ask about the file', [4, 5]),
  ]),
  contact_dustwife_senna: contactVoice('soft-recordkeeper', [
    'The dark remembers. I write it down.',
    'Three wrecks visited. Only then did the dark mention you.',
    'Registries lose names. Metal keeps the pronunciation.',
    'I need one name returned. No cargo. No spectacle.',
    'Write it once at Ashfall. That will be enough.',
    'Come back when your first asset pays. Earlier would cheapen it.',
  ], [
    contactChoice('memory', 'Ask what remembers', [0, 2]),
    contactChoice('wrecks', 'Ask about the wrecks', [1, 5]),
    contactChoice('name', 'Offer to return the name', [3, 4]),
  ]),
  contact_latch_child: contactVoice('automaton-loop', [
    'Found. Held. Delivered. Found. Held. Delivered.',
    'Sold scrap returns.',
    'Contraband feeds investigation.',
    'Warnings found. Ignored.',
    'Quiet maker absent.',
    'Name held. Undelivered.',
  ], [
    contactChoice('scrap', 'Show sold scrap', [0, 1]),
    contactChoice('contraband', 'Offer contraband', [2, 3]),
    contactChoice('maker', 'Ask its maker', [4, 5]),
  ]),
  contact_question: contactVoice('precursor-interrogative', [
    'What was carried?',
    'What was carried?',
    'What was owed?',
    'What was owed?',
    'Answer?',
    'Answer?',
  ], [
    contactChoice('sample', 'Present the 47-A sample', [0, 1]),
    contactChoice('ledger', 'Present the Kurtz ledger', [2, 3]),
    contactChoice('navigation', 'Present navigational data', [4, 5]),
  ], true),
  contact_filecleaver_dorin: contactVoice('bureaucratic-panic', [
    'I stole the seal log. It proves a massacre.',
    'Bounty says pirate. Transponder says Concord. Scan before shooting.',
    'REF 44-C. Corridor count attached. Please keep moving.',
    'Turn me in and Vale opens a door.',
    'Spare me and Orrin gets an original.',
    'I copied the seal log. They copied my death notice.',
  ], [
    contactChoice('transponder', 'Scan his transponder', [1, 2]),
    contactChoice('bounty', 'Invoke the bounty', [0, 3]),
    contactChoice('cover', 'Offer him cover', [4, 5]),
  ]),
  contact_lira_vonn: contactVoice('plain-sourcework', [
    'I print what happened. You happened. Talk.',
    'You are a source, not a hero. Better for print.',
    'Give me the deed. Then give me your spin.',
    'I publish names only when names survive verification.',
    'Some wrecks stay hidden until somebody prints the loss.',
    'Decline politely. Silence is still a quote, just a worse one.',
  ], [
    contactChoice('interview', 'Grant an interview', [0, 1]),
    contactChoice('spin', 'Choose your spin', [2, 3]),
    contactChoice('wrecks', 'Ask about wrecks', [4, 5]),
  ]),
  contact_tinker_zell: contactVoice('fast-bravado', [
    'Stolen parts, fair prices, no warranty. Park it.',
    'Scrambler works. Warranty does not. Heat climbs anyway.',
    'Pirate IFF says friend until a patrol asks twice.',
    'Vane Special tracks faster and incriminates beautifully.',
    'Slate welds regulations. I weld what regulations missed.',
    'Park clean, leave dirty. That is the premium service.',
  ], [
    contactChoice('stock', 'See the stock', [0, 5]),
    contactChoice('illegal', 'Ask about illegal installs', [1, 2]),
    contactChoice('vane_special', 'Ask for the Vane Special', [3, 4]),
  ]),
  contact_mara_children: contactVoice('plain-exhausted', [
    'Three children, one hold, no destination. Take us.',
    'Mara. Three aboard besides me. I count every hail.',
    'Drift tonight. Belt Outpost if the lane stays open.',
    'No quest speech. Just keep the children breathing.',
    'Ignore the call and nobody will invoice you.',
    'Reach Ashfall with us and one witness remains.',
  ], [
    contactChoice('passengers', 'Count the passengers', [0, 1]),
    contactChoice('escort', 'Offer an escort', [2, 3]),
    contactChoice('otherwise', 'Ask what happens otherwise', [4, 5]),
  ]),
  contact_wraith_kell: contactVoice('split-clerk', [
    'I file manifests by day, copy them by night. Burn?',
    'Manifest accepted. Clerk present. Nothing unusual to report.',
    'Off duty: the second fine is policy. Hale is the instrument.',
    'Dead drop opens after the corridor file breathes.',
    'Six years copying margins. One bad handoff burns everything.',
    'Say burn only when you can carry a witness.',
  ], [
    contactChoice('clerk', 'Address the clerk', [0, 1]),
    contactChoice('fine', 'Ask about the second fine', [2, 4]),
    contactChoice('burn', 'Say “burn”', [3, 5]),
  ]),
  contact_halev_doss: contactVoice('precise-warm', [
    'The sector has a paper trail. I walk it daily.',
    'Primary sources, please. Memory is useful, but difficult to cite.',
    'The administration edits nouns first. Verbs implicate people.',
    'Each recovered document restores one public footnote.',
    'Complete the record and I will add your name alphabetically.',
    'The Archive keeps truth. I prefer lending copies.',
  ], [
    contactChoice('document', 'Submit a document', [1, 3]),
    contactChoice('changes', 'Ask what changed', [0, 2]),
    contactChoice('reward', 'Ask about the reward', [4, 5]),
  ]),
  contact_maera_vols: contactVoice('tired-fragment', [
    'I left the engines warm. You fly her further than I did.',
    'Keep port injector warm. It sticks after cold jumps.',
    'Crew, answer status. ...No. Continue holding pattern.',
    'Quiet job remains open. Message still in my pocket.',
    'Yard beacon says fourteen months. Instrument fault.',
    'Deliver it. Then tell me where everyone went.',
  ], [
    contactChoice('captain', 'Answer the captain', [0, 2]),
    contactChoice('yard', 'Ask about the yard', [1, 4]),
    contactChoice('message', 'Take the Quiet message', [3, 5]),
  ], true),
});

// ── Station-bar generated contacts: greeting + approach voice ────────────────────────────────
//
// Generated bar contacts (ui/station/barContacts.js) carry a factionId but used to share one
// global ROLE_LINES table, so a Quiet fixer and a Concord clerk opened with the same sentence.
// These pools are the bar register of each house: the greeting is the first-impression line a
// generated contact opens with; the approach line is what the talk stage shows while the player
// stands in front of them. Authored canonical and depth contacts keep their own lines — these
// tables only voice generated names. Selection is a deterministic per-contact index, never the
// roster rng, so a save and a reroll can't re-voice the same person.

export const BAR_GREETING_BARKS = Object.freeze({
  faction_scn: Object.freeze({
    any: Object.freeze([
      'State your inquiry. The register is open.',
      'Your manifest precedes you. Speak plainly.',
      'This counter accepts questions. Formally.',
      'Inquiries are logged. Proceed.',
    ]),
    barkeep: Object.freeze([
      'Your account is on file. State your order.',
      'The counter is open. Orders are logged.',
    ]),
  }),
  faction_mts: Object.freeze({
    any: Object.freeze([
      'Everything has a price. Yours first.',
      'The board never sleeps. Neither do margins.',
      'Ask. The first question is complimentary.',
      'Politeness is free. Answers are not.',
    ]),
    barkeep: Object.freeze([
      'Your tab is a ledger. Keep it interesting.',
      'Order. The house takes its margin either way.',
    ]),
  }),
  faction_dmc: Object.freeze({
    any: Object.freeze([
      'Pull up a crate. The shift is long.',
      'Ain\'t much quiet on this claim. Ask away.',
      'Vein\'s thin, patience thinner. What do you need?',
      'Long shift. Make it worth the ore.',
    ]),
    barkeep: Object.freeze([
      'Pour\'s honest. Talk ain\'t free, but close.',
      'Rest your rig. The belt can wait a pour.',
    ]),
  }),
  faction_reach: Object.freeze({
    any: Object.freeze([
      'You are weighed already. Mind your tonnage.',
      'The pack weighs the weigh, not the mouth.',
      'Ask. Answers are weighed by the answer.',
      'Your hull scans heavy. Talk light.',
    ]),
    barkeep: Object.freeze([
      'House weighs the pour. You weigh the company.',
      'Drink is cheap. Your cargo is not.',
    ]),
  }),
  faction_quiet: Object.freeze({
    any: Object.freeze([
      'Sit.',
      'Ask. Low.',
      'No names. Order.',
      'Seen.',
    ]),
    barkeep: Object.freeze([
      'Same drawer. Same rates. Ask.',
      'Drink. Then quiet.',
    ]),
  }),
  faction_free: Object.freeze({
    any: Object.freeze([
      'Sit. What can I do you for?',
      'Pull up a stool. What is on your mind?',
      'New face. Talk.',
      'Buy a drink or sell a story. Either works.',
    ]),
    barkeep: Object.freeze([
      'Drink first, story second. What will it be?',
      'Room is open. So is the tap.',
    ]),
  }),
  faction_vael: Object.freeze({
    any: Object.freeze([
      'Clause one: parties may convene. State your term.',
      'This-vessel acknowledges your presence. Petition noted.',
      'The accord grants audience. Speak within the terms.',
      'Your approach is registered. The floor is open.',
    ]),
    barkeep: Object.freeze([
      'The pour is a standing clause. Obligations follow.',
      'Your order is granted. The ledger remains open.',
    ]),
  }),
  faction_choir: Object.freeze({
    any: Object.freeze([
      'The Chorus hears. Speak.',
      'A seat opens. The Pattern observes.',
      'Sing your need. The shrine listens.',
      'The interval permits. Speak in measure.',
    ]),
    barkeep: Object.freeze([
      'The pour is consecrated. The question is not.',
      'Rest. The chorus holds your place.',
    ]),
  }),
  faction_archive: Object.freeze({
    any: Object.freeze([
      'The reading room admits you. Speak; it will be filed.',
      'A chair opens. The stacks are listening.',
      'Ask. Your question joins the catalogue either way.',
      'Reader\'s courtesy. Keep your voice off the folios.',
    ]),
    barkeep: Object.freeze([
      'The pour is documented. So are you. Order.',
      'Sit. Your account predates your arrival.',
    ]),
  }),
  faction_fulfillment: Object.freeze({
    any: Object.freeze([
      'You have reached the head of the queue. Proceed.',
      'This station accepts inquiries in sequence. You are now sequenced.',
      'State your requirement. Processing begins on speech.',
      'Interaction window open. It closes on schedule.',
    ]),
    barkeep: Object.freeze([
      'Order is logged on submission. State it.',
      'Service slot assigned. Order within the window.',
    ]),
  }),
  faction_pitborn: Object.freeze({
    any: Object.freeze([
      'Pull up, kin. The yard drinks first, weighs second.',
      'New hull at the bar. What\'s your story worth in scrap?',
      'Sit. First round\'s a story, and yours better be good.',
      'The fence keeps a stool for honest scrappers. That you?',
    ]),
    barkeep: Object.freeze([
      'Pour\'s on the yard. The tab goes on the fence.',
      'Drink up, kin. Yard credit don\'t transfer to corps.',
    ]),
  }),
  faction_understory: Object.freeze({
    any: Object.freeze([
      'Sit by the wreck-light. The garden warms the tired.',
      'A place is kept. All things that arrive are kept.',
      'Rest. The bloom listens better than most bars.',
      'You came a long way. The garden counts the crossing.',
    ]),
    barkeep: Object.freeze([
      'The pour is dark and honest. The garden provides.',
      'Drink slow. Everything here keeps a while.',
    ]),
  }),
  faction_verge_layers: Object.freeze({
    any: Object.freeze([
      'The prism registers your approach. State your question.',
      'A crossing is permitted. Speak within the audit.',
      'You transit to this seat. The lattice notes intent.',
      'Inquiry accepted. The ledger stays open while you talk.',
    ]),
    barkeep: Object.freeze([
      'Service is an open channel. Place your order.',
      'The prism pours. Your account is inscribed on receipt.',
    ]),
  }),
});

export const BAR_APPROACH_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Your approach is logged. State your inquiry.',
    'They acknowledge you. Questions proceed formally.',
    'A nod, protocol satisfied. Ask your question.',
  ]),
  faction_mts: Object.freeze([
    'A raised glass and a measured look. The account is open.',
    'They note you like a line item. Ask something.',
    'An appraising glance. Business may commence.',
  ]),
  faction_dmc: Object.freeze([
    'A tired nod. What do you need?',
    'They shift over. Talk is cheap, ore ain\'t.',
    'A grunt of acknowledgment. Ask away.',
  ]),
  faction_reach: Object.freeze([
    'Eyes like a weigh-slip. Ask carefully.',
    'They measure you before they hear you. Ask.',
    'A slow look over your gear. Speak.',
  ]),
  faction_quiet: Object.freeze([
    'No greeting. Ask, or leave it.',
    'A look. Nothing else.',
    'They watch you sit. That is the greeting.',
  ]),
  faction_free: Object.freeze([
    'They look up as you approach. Ask them something.',
    'A friendly nod. What is on your mind?',
    'They make room. Ask away.',
  ]),
  faction_vael: Object.freeze([
    'Acknowledgment registers. State your petition.',
    'Your presence is noted in the ledger. Proceed.',
    'The counterparty observes you. Terms may follow.',
  ]),
  faction_choir: Object.freeze([
    'They incline their head. The Pattern receives you.',
    'A measure of silence, then room. Speak.',
    'The chorus pauses for you. Ask.',
  ]),
  faction_archive: Object.freeze([
    'They close a folio as you sit. Your entry opens.',
    'A reader\'s nod — already annotated. Ask your question.',
    'They turn a page instead of a stare. Speak; it is filed.',
  ]),
  faction_fulfillment: Object.freeze([
    'A status light acknowledges you. Interaction begins.',
    'Your approach is time-stamped. State your requirement.',
    'They process your arrival without looking up. Proceed.',
  ]),
  faction_pitborn: Object.freeze([
    'A scarred grin. They weigh your boots before your words.',
    'They wave you over like kin. The yard don\'t do formal.',
    'A mug raised your way. Talk scrap or talk trouble — both pay.',
  ]),
  faction_understory: Object.freeze([
    'They turn slowly, like something growing toward light.',
    'The wreck-light shifts. They had already noticed you.',
    'A gentle tilt of the head. The garden receives its visitor.',
  ]),
  faction_verge_layers: Object.freeze([
    'Their attention arrives before their eyes do. Speak.',
    'A facet turns toward you. The audit is informal — for now.',
    'They regard you the way a gate regards a crossing. Ask.',
  ]),
});

function barLineAt(pool, index) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const n = Number.isFinite(index) ? index : 0;
  return pool[((Math.floor(n) % pool.length) + pool.length) % pool.length];
}

/**
 * Deterministic first-impression line for a generated bar contact, voiced in the contact's own
 * faction register. Unknown factions fall back to faction_free; role pools fall back to 'any'.
 * @param {string} factionId
 * @param {string} [role]    generated contact role ('barkeep' gets the counter voice).
 * @param {number} [index]   deterministic pick (e.g. a stable hash of the contact id).
 * @returns {string|null} a non-empty line, or null if the corpus is empty.
 */
export function barGreetingBarkFor(factionId, role, index) {
  const cell = BAR_GREETING_BARKS[factionId] || BAR_GREETING_BARKS.faction_free;
  const pool = (role && cell[role]) || cell.any
    || (BAR_GREETING_BARKS.faction_free && BAR_GREETING_BARKS.faction_free.any);
  return barLineAt(pool, index);
}

/**
 * Deterministic stage line shown while the player stands in front of a generated bar contact —
 * the faction-voiced replacement for "They look up as you approach." Authored contacts do not
 * use this table; their stage copy stays as written.
 * @param {string} factionId
 * @param {number} [index]  deterministic pick.
 * @returns {string|null} a non-empty line, or null if the corpus is empty.
 */
export function barApproachBarkFor(factionId, index) {
  return barLineAt(BAR_APPROACH_BARKS[factionId] || BAR_APPROACH_BARKS.faction_free, index);
}

// ── Witness reaction: somebody watched the crime ────────────────────────────────────────────
//
// Same contract as HULL_RECOGNITION and HISTORY_RECOGNITION: an event line, not a
// BARK_SITUATION. When lawSecurity validates a witnessed kill or theft, the receipt names the
// witnesses; the bark director resolves one of them and lets them say what they saw. The line
// is the ambient proof that the witness gate is real — a crime somebody watched gets talked
// about on the channel, in the watching faction's own register.

export const WITNESS_CRIME_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Witness statement filed: a vessel was just destroyed in controlled space. Ref 44-C.',
    'This channel confirms a homicide in jurisdiction. Statement logged.',
    'Concord advisory: we watched that kill. The record watched it too.',
    'Incident observed and timestamped. Your transponder is in the file.',
  ]),
  faction_mts: Object.freeze([
    'Meridian channel: somebody just wrote a ship off the ledger. Adjusting the spread.',
    'We saw the flash and the signature behind it. That report has a price attached.',
    'A kill in the open market — bold, expensive, noted.',
    'Someone is about to discover what witnesses cost. We already invoiced.',
  ]),
  faction_dmc: Object.freeze([
    "Saw the flash from the rig — somebody's shift just ended permanent, calling it in.",
    "That's a kill on my watch — great, more paperwork nobody pays me for.",
    'Whole crew saw it. Drift crews talk, friend — that story is already moving.',
    "Venting a ship in front of working people. Report's gone up the shaft.",
  ]),
  faction_reach: Object.freeze([
    'Hooo — did you SEE that — opened like a cargo seal!',
    'We watched you vent them. No charge for the show — the law pays for the tip.',
    'That was ugly and we loved it. Still selling your transponder though.',
    'Reach saw the kill — Reach always sees, and Reach always bills somebody.',
  ]),
  faction_quiet: Object.freeze([
    'Seen. Reported.',
    'Counted. One less.',
    'We saw. The channel knows.',
    'Logged. Nothing else needed.',
  ]),
  faction_choir: Object.freeze([
    'The Pattern receives one more. We witnessed the unmaking.',
    'A vessel returned to the chorus before its interval. We saw the hand that cut it.',
    'The rupture was witnessed. It is notated in your name.',
    'One more silence entered the Pattern. Your signature attends it.',
  ]),
  faction_free: Object.freeze([
    "Frontier channel — I just watched a killing out here. Reporting it now.",
    'We saw what you did to that ship, friend. Whole lane saw it.',
    "That's a body on the board. Frontier talks fast — it's already out.",
    'Saw the whole thing. Around here, seeing means saying.',
  ]),
  faction_vael: Object.freeze([
    'Clause 14 observed: unlawful termination of a vessel. This-vessel files the breach.',
    'The act is entered into evidence. Witness-terms satisfied.',
    'Termination witnessed under accord. The ledger does not unsee.',
    'This-vessel attests: the destruction was observed. Attestation is binding.',
  ]),
  faction_archive: Object.freeze([
    'A hull burned in the open. The index files the burning under your name.',
    'The stacks saw it. The stacks file everything.',
    'Destruction witnessed. Your chapter gains a red marginalia.',
    'The reading room watched the whole of it. Nothing burns unread.',
  ]),
  faction_fulfillment: Object.freeze([
    'Vessel destruction logged at this waypoint. Incident attributed.',
    'Observation complete: hull lost, outside sequence. A report generates itself.',
    'Your action has been appended to the route ledger. Retrieval is pending.',
    'Termination event filed. The manifest now includes the cause.',
  ]),
  faction_pitborn: Object.freeze([
    'Whole yard saw that, kin. Torch-work like that gets talked about.',
    'You just scrapped somebody in front of the fence. Bold or stupid — we\'ll see.',
    'That kill\'s got a price now. The yard always learns the price.',
    'We watched you burn a hull. The fence decides what it means.',
  ]),
  faction_understory: Object.freeze([
    'The garden watched the hull come apart. It knows the sound of feeding.',
    'Something fell. The roots noticed who let it go.',
    'A death is never wasted here. But it is always witnessed.',
    'The bloom saw. It keeps the memory of what you cut.',
  ]),
  faction_verge_layers: Object.freeze([
    'The lattice observed the termination. The audit expands to include it.',
    'A vessel was unmade within sight of the prism. It is inscribed.',
    'The crossing registered a closure. Your signature is on it.',
    'Destruction inside the audit is still an audit item. It is yours now.',
  ]),
});

/**
 * Deterministically select one witness-reaction line.
 *
 * @param {string} factionId  one of BARK_FACTIONS (unknown ids fall back to faction_free).
 * @param {function|number} [rng]  seeded rng fn or a numeric index. Deterministic.
 * @returns {string} a non-empty line.
 */
export function witnessCrimeBarkFor(factionId, rng) {
  const lines = (factionId && WITNESS_CRIME_BARKS[factionId]) || WITNESS_CRIME_BARKS.faction_free;
  const line = lines[pickIndex(rng, lines.length)] || lines[0];
  return typeof line === 'string' && line.length ? line : '...';
}

// ── Pursuit chatter: the law (or the pack) is actively running the player down ────────────────
//
// Same event-line contract as WITNESS_CRIME_BARKS — not a BARK_SITUATION. When a pursuit opens
// (law:wantedWarrantPosted posts the bounty hunter), the chasing faction says what the run costs
// the runner. Speaker = the pursuer, in its own register. barkDirector consumes this corpus.

export const PURSUIT_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Pursuit authorized under Ref 51-B. Your heading is already filed.',
    'Fleeing adds a second citation. Both are already drafted.',
    'Intercept course set. Compliance is still cheaper than capture.',
    'All units: the fugitive’s transponder is doing our work for us.',
  ]),
  faction_mts: Object.freeze([
    'Running only raises the recovery fee, friend.',
    'Every burn you make is billable. Keep going.',
    'We have your route on the books. The margin always collects.',
    'Pursuit is an investment. You are the return.',
  ]),
  faction_dmc: Object.freeze([
    'Hold still. I’m not chasing you past my shift.',
    'Every rock I dodge to catch you is going on your tab.',
    'You couldn’t outrun a loaded hauler. Stop wasting my fuel.',
    'Fine, we chase. Somebody log my overtime.',
  ]),
  faction_reach: Object.freeze([
    'Run! It only makes the weigh sweeter.',
    'He’s burning fuel — when the tanks go dry, the scales open.',
    'Fast little hull. We’ll weigh it slow.',
    'Keep sprinting, friend. Tired salvage strips easier.',
  ]),
  faction_quiet: Object.freeze([
    'Still.',
    'We follow.',
    'Nowhere to go.',
    'The lane ends.',
  ]),
  faction_choir: Object.freeze([
    'The interval shortens. Hold still for it.',
    'Flight is only a longer verse.',
    'The Pattern has no outside.',
    'Your heading was notated before you chose it.',
  ]),
  faction_free: Object.freeze([
    'Easy now — nobody has to get hurt worse.',
    'You’re running toward nothing out here, friend.',
    'We just want to talk. The talk’s shorter if you stop.',
    'Lane’s a long dark, and we’re right behind you.',
  ]),
  faction_vael: Object.freeze([
    'Clause 11: flight constitutes admission. It is entered.',
    'Your velocity extends the term. It does not void it.',
    'Evasion is a recognized remedy. It is also a priced one.',
    'The pursuit interval is contractually bounded. Your hull is not.',
  ]),
  faction_archive: Object.freeze([
    'You run through the stacks. The index is faster than you are.',
    'Flee if you must. The catalogue travels with your name.',
    'The reading room does not chase. It already knows where this ends.',
    'Your heading is a footnote. The chapter has been decided.',
  ]),
  faction_fulfillment: Object.freeze([
    'Evasion logged. Intercept units re-sequenced onto your route.',
    'Deviation escalates recovery priority. The schedule adjusts.',
    'Your flight adds transit time. It does not add distance.',
    'Pursuit is a routing operation. Yours is being executed.',
  ]),
  faction_pitborn: Object.freeze([
    'Run, kin! The yard loves a chase — scrap falls off a fast hull.',
    'You run like a Concord debtor! Keep the lane straight, we\'re behind you.',
    'The whole fence is on your tail now. Ditch the cargo and maybe we stop.',
    'Fast one! Fast don\'t matter — the yard knows every shortcut you\'ll take.',
  ]),
  faction_understory: Object.freeze([
    'Flee deeper if you like. The garden has no edge.',
    'The bloom does not hurry. What it tends is already caught.',
    'You drift toward more garden. The roots thank you.',
    'Running is a kind of falling. We catch what falls.',
  ]),
  faction_verge_layers: Object.freeze([
    'The lattice does not pursue. It is already at your destination.',
    'Your heading crosses a gate. All gates answer to the same audit.',
    'Evasion increases the interval, not the outcome.',
    'The prism tracks every crossing. There is no outside the lattice.',
  ]),
});

/** One pursuit-chatter line for the chasing faction. Deterministic; falls back to faction_free. */
export function pursuitBarkFor(factionId, rng) {
  const lines = (factionId && PURSUIT_BARKS[factionId]) || PURSUIT_BARKS.faction_free;
  const line = lines[pickIndex(rng, lines.length)] || lines[0];
  return typeof line === 'string' && line.length ? line : '...';
}

// ── Surrender: heave-to demands and yield terms ───────────────────────────────────────────────
//
// Event line, not a BARK_SITUATION. When the law demands a surrender — the posted nets checkpoint
// (law:wantedCheckpointPosted) is the heave-to demand — the speaking faction states the one term
// that matters, in its own register. barkDirector consumes this corpus from the staffing cutter.

export const SURRENDER_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Cut your drive and present for custody. Ref 51-B applies.',
    'Surrender is a recognized outcome. It reduces the fine.',
    'Power down and hold. Resistance is billable.',
    'Heave to and live. The alternative is paperwork you will not see.',
  ]),
  faction_mts: Object.freeze([
    'Surrender the hull and the account closes clean.',
    'Yield now and we waive the pursuit surcharge.',
    'Strike your drive. Everything else is negotiable.',
    'Accept our terms and nobody writes a loss report.',
  ]),
  faction_dmc: Object.freeze([
    'Yield and we both clock out alive.',
    'Cut the engine, friend. Nobody’s quota includes a corpse.',
    'Give it up. I’ve got a dinner getting cold.',
    'Stand down. Whatever you stole isn’t worth my paperwork.',
  ]),
  faction_reach: Object.freeze([
    'Strike your colors — we’ll only take the ship.',
    'Power down and you keep breathing. Simple math.',
    'Surrender the hold and we might forget your face.',
    'Kill your drive before we weigh what’s left of you.',
  ]),
  faction_quiet: Object.freeze([
    'Stop. Live.',
    'Power down. Stay seen.',
    'Yield. Once.',
    'Engines off. Choose.',
  ]),
  faction_choir: Object.freeze([
    'Kneel before the Pattern. Ascension is still permitted.',
    'Release your name and the verse ends gently.',
    'Submit. The chorus accepts the willing.',
    'Cease your dissonance. Mercy is one note.',
  ]),
  faction_free: Object.freeze([
    'Power down, friend — this doesn’t have to end in scrap.',
    'Call it quits and we all go home tonight.',
    'Stand down. Nobody out here wants your funeral.',
    'Drop the guns and the lane stays friendly.',
  ]),
  faction_vael: Object.freeze([
    'Clause 16: submission terminates the enforcement term.',
    'Yield your form. The accord permits survival.',
    'Surrender is a valid clause. Invoke it.',
    'Cease propulsion. Custody is the offered remedy.',
  ]),
  faction_archive: Object.freeze([
    'Power down and be read as a survivor. The alternative is a short chapter.',
    'Yield your helm. The index prefers intact entries.',
    'Cut your drive. The reading room accepts surrendered texts.',
    'Strike and live inside the record. Resist and be the record.',
  ]),
  faction_fulfillment: Object.freeze([
    'Reduce thrust to zero. A surrender waypoint has been assigned.',
    'Submission is a routing option. It is the lowest-cost one remaining.',
    'Cease maneuvering. Compliance terminates this incident early.',
    'Power down. Your manifest can still be reconciled.',
  ]),
  faction_pitborn: Object.freeze([
    'Cut the drive, kin! Live scrappers trade again tomorrow.',
    'Drop the guns — hull\'s worth more parked than burning.',
    'Strike and walk! The fence only takes the hold, not the life.',
    'Power down before the yard decides you\'re scrap instead.',
  ]),
  faction_understory: Object.freeze([
    'Still your engines. The garden keeps living things too.',
    'Yield to the bloom. Surrender is only a slower arrival.',
    'Stop burning fuel. What rests here is tended, not taken.',
    'Let the hull drift. The roots are gentler than the alternative.',
  ]),
  faction_verge_layers: Object.freeze([
    'Cease transit and hold position. The audit can still conclude gently.',
    'Stand down at this crossing. The lattice accepts halted accounts.',
    'Stop your engines. Compliance is the shortest route out of this.',
    'Hold still for the prism. A closed crossing may reopen.',
  ]),
});

/** One surrender line for the demanding faction. Deterministic; falls back to faction_free. */
export function surrenderBarkFor(factionId, rng) {
  const lines = (factionId && SURRENDER_BARKS[factionId]) || SURRENDER_BARKS.faction_free;
  const line = lines[pickIndex(rng, lines.length)] || lines[0];
  return typeof line === 'string' && line.length ? line : '...';
}

// ── Post-escape taunt: the pursuit resolved as escaped ────────────────────────────────────────
//
// Event line, not a BARK_SITUATION. When a pursuit resolves with the player away, the former
// pursuer gets the last word — a consequence, not a eulogy. STAGED: no live emitter names an
// unambiguous escape yet (law:wantedWarrantReleased also fires on paid/served clears), so no
// system consumes this corpus; the coverage test above keeps every cell authored.

export const ESCAPE_TAUNT_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Escape logged as evasion. The next checkpoint already knows.',
    'Your transponder stays flagged. Distance changes nothing.',
    'Evasion surcharge applied. See you at the next corridor.',
    'You fled a citation — now it is a warrant.',
  ]),
  faction_mts: Object.freeze([
    'Run, then. Distance is just interest on the debt.',
    'You got away in a hull that is still ours on paper.',
    'Enjoy the head start. The margin does not expire.',
    'Every kilometer adds a handling fee.',
  ]),
  faction_dmc: Object.freeze([
    'Go on. I’ll be back on shift when your fuel runs out.',
    'You ran. The belt’s still here when you come crawling back.',
    'Fast bird. We’ll be at the dock when you land.',
    'Escaped today. The rocks remember you tomorrow.',
  ]),
  faction_reach: Object.freeze([
    'Counted your hull, friend. We’ll weigh it later.',
    'You escaped this weigh-slip. There’s always a next one.',
    'Fast prey. We like a challenge with a price tag.',
    'Run far. Your salvage value grows with the legend.',
  ]),
  faction_quiet: Object.freeze([
    'Gone. For now.',
    'Counted anyway.',
    'The door stays open.',
    'We remember the shape.',
  ]),
  faction_choir: Object.freeze([
    'Distance is a verse. The chorus outlasts it.',
    'You cannot exit the Pattern. You can only delay the note.',
    'Fled, not freed. The interval keeps your place.',
    'Every heading curves back to the Pattern.',
  ]),
  faction_free: Object.freeze([
    'Fast bird. The lanes talk — you’ll hear us again.',
    'You made it out. Enjoy the quiet while it lasts.',
    'Fair enough. Next time bring friends.',
    'Escaped. The waystation will hear about this one.',
  ]),
  faction_vael: Object.freeze([
    'Clause 12 applies: distance is decorative. The term persists.',
    'Your escape is recorded as a deferral, not a release.',
    'Flight postpones disposition. It does not amend it.',
    'The accord closes no matter where you park.',
  ]),
  faction_archive: Object.freeze([
    'You left the reading room. The record did not.',
    'Fled from a library. Everything you did is on a shelf now.',
    'Distance is just an unfiled delay. The index is patient.',
    'Your chapter pauses. Chapters do not end this way.',
  ]),
  faction_fulfillment: Object.freeze([
    'Evasion complete. Your incident file stays open indefinitely.',
    'You exited the pursuit queue. The queue retains your entry.',
    'Recovery deferred, not cancelled. The route is patient too.',
    'Your waypoint assignment lapses. Your rating does not recover.',
  ]),
  faction_pitborn: Object.freeze([
    'Gone! Enjoy the scrap money — the fence charges interest too.',
    'You outran the yard today. The yard eats tomorrow anyway.',
    'Fast bird! The whole fence knows your hull now.',
    'Escaped clean, kin. Next time we weigh you at the light.',
  ]),
  faction_understory: Object.freeze([
    'You slipped the bloom. The garden grows where you are going.',
    'Fled the wreck-light. All light dims eventually.',
    'The roots release you. The roots always release — once.',
    'Go. What falls later still falls here.',
  ]),
  faction_verge_layers: Object.freeze([
    'The crossing closed behind you. The audit remains open.',
    'You exited this gate. Every gate is the same gate.',
    'Escape logged as transit. Your file follows the lattice.',
    'A deferred inscription. The lattice has outwaited stars.',
  ]),
});

/** One post-escape taunt for the faction that lost the runner. Deterministic; faction_free fallback. */
export function escapeTauntBarkFor(factionId, rng) {
  const lines = (factionId && ESCAPE_TAUNT_BARKS[factionId]) || ESCAPE_TAUNT_BARKS.faction_free;
  const line = lines[pickIndex(rng, lines.length)] || lines[0];
  return typeof line === 'string' && line.length ? line : '...';
}

export default {
  BARKS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  CONTACT_VOICE_REGISTERS,
  HULL_RECOGNITION,
  HISTORY_RECOGNITION,
  WITNESS_CRIME_BARKS,
  PURSUIT_BARKS,
  SURRENDER_BARKS,
  ESCAPE_TAUNT_BARKS,
  barkFor,
  hullRecognitionBarkFor,
  historyBarkFor,
  witnessCrimeBarkFor,
  pursuitBarkFor,
  surrenderBarkFor,
  escapeTauntBarkFor,
};
