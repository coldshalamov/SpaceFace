// src/data/barks.js — per-faction radio VOICE corpus + deterministic selector.
//
// "The story is in the paperwork." Each of the 8 code factions speaks in a DISTINCT
// register so a scan/warn/attack line instantly reads as who is talking, without an
// IFF tag. This is PURE DATA — no imports, no DOM, no Math.random; the one witness-run
// seam below stays a pure function of the counter values passed into it.
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

// Event situations: every faction covers these too, but they fire on a moment, not a contact
// state — same precedent as HULL_RECOGNITION below. They are deliberately NOT in BARK_SITUATIONS:
// that set is the generated-WAV index contract (faction × situation × line), and appending would
// renumber every later faction's shipped line_*.wav rows.
export const BARK_EVENT_SITUATIONS = Object.freeze(['distress']);

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
      'Reach Station lane hail: the dock changes hands by the week; the lane stays open. Fly polite and nobody counts your plates.',
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
      'Ashfall relay clause: the Deep-Mother’s arena is registered ground. Scan before you grieve.',
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
      'Your guns were bought, not born. The yard melts both.',
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
      'We have eaten navies. You are barely a mouthful.',
    ],
    'patrol-greeting': [
      'The garden admits all travelers. Especially the tired.',
      'Rest easy. The wreck-light warms those who mean no cutting.',
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

// ── G2 witness-run seam ──────────────────────────────────────────────────────────────────────
// The Witness Run's terminal settlements move two durable station-contact counters
// (`dorin.trust` -1..1, `kell.cover` 0..6; written only by the stationContacts system from
// canonical stationContact:counterDelta intents). The bar voice for those two contacts reacts:
// one authored seam slot per register is swapped for the band line matching the persisted
// counter. Selection is a pure function of the counter value — syncWitnessSeamVoice is called
// by the stationContacts system on counter change, save load, and new game, so a fresh session
// re-derives the identical voice from the save. No imports, no state reads: pure data + pure fn.

const WITNESS_SEAM_SLOTS = Object.freeze({
  'dorin.trust': { contactId: 'contact_filecleaver_dorin', slotIndex: 5 },
  'kell.cover': { contactId: 'contact_wraith_kell', slotIndex: 4 },
});

// Bands over each counter's full range. `line: null` keeps the authored original. Cover BUILDS
// from its authored initial 0 through sheltered runs and erodes through public/burned ones, so
// every seam state is reachable and reversible within the counter's bounds.
const WITNESS_SEAM_BANDS = Object.freeze({
  'dorin.trust': Object.freeze([
    { min: 1, max: 1, line: 'You filed the log. The massacre has a record. I breathe.' },
    { min: 0, max: 0, line: null },
    { min: -1, max: -1, line: 'The log stays buried. I counted who watched you choose the shelf.' },
  ]),
  'kell.cover': Object.freeze([
    { min: 0, max: 0, line: null },
    { min: 1, max: 2, line: 'Hale asked the desk two questions today. I answered one, smiling.' },
    { min: 3, max: 4, line: 'My day-files stopped matching my night-files. Somebody noticed.' },
    { min: 5, max: 6, line: 'Six years of quiet handoffs. The desk would swear I was never there.' },
  ]),
});

const witnessSeamLines = {
  'dorin.trust': null,
  'kell.cover': null,
};

/** Pure band pick: the seam line a counter value speaks (null keeps the authored original). */
export function witnessSeamLineFor(trackerId, value) {
  const bands = WITNESS_SEAM_BANDS[trackerId];
  if (!bands) return null;
  const row = bands.find((band) => value >= band.min && value <= band.max);
  return row ? row.line : null;
}

/**
 * Re-derive both seam voices from the persisted counter bag. Called by the stationContacts
 * system (counter change / save load / new game); safe to call with partial or empty counters —
 * missing counters fall back to their authored initial (0), which keeps the original lines.
 */
export function syncWitnessSeamVoice(counters = {}) {
  for (const trackerId of Object.keys(WITNESS_SEAM_SLOTS)) {
    const value = Number.isFinite(Number(counters && counters[trackerId]))
      ? Math.trunc(Number(counters[trackerId]))
      : 0;
    witnessSeamLines[trackerId] = witnessSeamLineFor(trackerId, value);
  }
}

const contactVoiceWithSeam = (register, lines, choices, trackerId) => {
  const base = Object.freeze(lines.slice());
  const firstContact = Object.freeze({ choices: Object.freeze(choices.slice()) });
  return Object.freeze({
    register,
    // Live seam: the swapped array is computed per read so the bar always voices the current
    // persisted counter without any second copy of the corpus.
    get lines() {
      const seam = witnessSeamLines[trackerId];
      const slot = WITNESS_SEAM_SLOTS[trackerId] && WITNESS_SEAM_SLOTS[trackerId].slotIndex;
      if (seam == null || !Number.isInteger(slot)) return base;
      const out = base.slice();
      out[slot] = seam;
      return out;
    },
    firstContact,
    dialogueComplete: false,
  });
};

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
  contact_filecleaver_dorin: contactVoiceWithSeam('bureaucratic-panic', [
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
  ], 'dorin.trust'),
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
  contact_wraith_kell: contactVoiceWithSeam('split-clerk', [
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
  ], 'kell.cover'),
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
  // STAGED: the five deep factions below have no station or sector carrying their factionId
  // yet, so no bar pool resolves to them in production. They stay authored — a deep-faction
  // station presence activates this corpus with no further copy work.
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
  // STAGED: same reachability caveat as BAR_GREETING_BARKS — no deep-faction station exists yet.
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
    'Gone hot! The whole fence knows your hull now.',
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

// ── A wounded pirate breaks off for an ejected pod (THE WORLD ANSWERS, C7) ───────────────────
//
// Event lines, not BARK_SITUATIONS, keyed the way every pirate event corpus is: key → faction →
// lines. `pirate_pod_hunt_break` is the dispatch — the pirate names the pod it is going for, a
// line the player can act on (leave the pod, cut the tow and the pursuer stops pressing).
// `pirate_pod_hunt_capture` is the taking — the pod is theirs, the ransom is the point. Spoken by
// src/ai/podHunt.js through the voice channel with the hunter's own factionId; the caller derives
// the index from hash32(seed, hunter id) so a line is stable across save/load with no rng spend.
// Only the pirate-class registers are authored; any other faction speaks the Reach register.
export const POD_HUNT_BARKS = Object.freeze({
  pirate_pod_hunt_break: Object.freeze({
    faction_reach: Object.freeze([
      'Pod’s adrift. We’re taking it — stay off the tow and I stay off you.',
      'Breaking off for that pod. Leave it drifting and we’re square, friend.',
      'Survivors weigh more than your hull today. Don’t reach for the pod.',
    ]),
    faction_quiet: Object.freeze([
      'The pod. Not you.',
      'Leave the pod.',
      'We take the pod. Stand clear.',
    ]),
    faction_choir: Object.freeze([
      'The pod is adrift. We gather it. Stand clear of the verse.',
      'The line breaks for the pod. Leave it and the line stays broken.',
      'Something breathes in that pod. We will answer it. Stand clear.',
    ]),
    faction_pitborn: Object.freeze([
      'Pod in the drift, kin. We take it, you keep your hull. Don’t get greedy.',
      'Breaking off. That pod pays better than your scrap — leave it to us.',
      'Yard wants that pod. Cut your tow and we forget you.',
    ]),
    faction_free: Object.freeze([
      'Pod’s drifting. We’re taking it — leave it be and we’ll leave you be.',
      'Breaking off for the pod. Keep your hands off the tow.',
      'Easier ransom than a fight. Let us have the pod.',
    ]),
  }),
  pirate_pod_hunt_capture: Object.freeze({
    faction_reach: Object.freeze([
      'Pod’s ours. Ransom goes to whoever pays.',
      'Pod’s on the hook. The crew rides with us until someone pays.',
      'Got the pod, friend. Survivors keep breathing — for a price.',
    ]),
    faction_quiet: Object.freeze([
      'Pod taken.',
      'The crew is ours.',
      'Ransom. Not rescue.',
    ]),
    faction_choir: Object.freeze([
      'The pod is gathered. The crew joins the verse.',
      'Taken in. The survivors will be kept.',
      'The Pattern holds the pod now. Do not ask for it back.',
    ]),
    faction_pitborn: Object.freeze([
      'Got the pod, kin. Crew rides with the yard till someone pays.',
      'Pod’s hooked. Survivors are scrap that talks — name a price.',
      'Pod’s ours. The yard keeps what the lane drops.',
    ]),
    faction_free: Object.freeze([
      'Pod’s aboard. The crew lives — ransom is the fare home.',
      'Pod secured. Someone pays, or they ride a long way.',
      'Got the pod. The survivors stay with us until it’s settled.',
    ]),
  }),
});

/**
 * One pod-hunt line for a pirate hull. Deterministic (integer index); an unknown faction speaks the
 * Reach register; an unknown key is null so a caller can stay silent rather than invent text.
 */
export function podHuntBarkFor(key, factionId, index) {
  const cell = key && POD_HUNT_BARKS[key];
  if (!cell) return null;
  const lines = (factionId && cell[factionId]) || cell.faction_reach;
  const line = lines[pickIndex(index, lines.length)] || lines[0];
  return typeof line === 'string' && line.length ? line : null;
}

// ── A shattered rock floods the lane with loose ore (THE WORLD ANSWERS, C8) ──────────────────
//
// Event lines, not BARK_SITUATIONS. `economy:oreFlood` is the receipt of a rock the PLAYER broke
// that dumped real ore on the lane; barkDirector picks ONE speaker per body — a working hull
// nearby (the neutral working-belt register), else the local station's desk, in Dock-control
// (lawful) or Yardmaster (everyone else) register, the same split economy.js uses for the
// dock-slam notice. `{ore}` is the commodity's display name lower-cased ("iron ore"), or "ore"
// when the receipt names none. The desk lines carry their own sender prefix: they are text on the
// bark channel, not a popup.
export const ORE_FLOOD_BARKS = Object.freeze({
  working: Object.freeze([
    'Loose {ore} all over the lane — somebody cracked a seam. Scooping.',
    'Free {ore} on the chart. Haulers, you’re welcome.',
    'That rock let go of all its {ore} at once — scoop it before it drifts.',
  ]),
  dock_control: Object.freeze([
    'Dock control: loose {ore} in the lane — mind the pattern, scoop clear of traffic.',
    'Dock control: a rock came apart out there, {ore} adrift — recover it clear of the approach.',
    'Dock control: free {ore} in the lane, the price will sag — salvage crews, clear it.',
  ]),
  yardmaster: Object.freeze([
    'Yardmaster: loose {ore} in the lane — somebody shot us a surplus. Haul it in.',
    'Yardmaster: rock split and spilled {ore} — good for the yard, bad for the price.',
    'Yardmaster: free {ore} on the lane. Come and get it, haulers.',
  ]),
});

/**
 * One ore-flood line. Deterministic (integer index); an unknown register speaks the working-belt
 * line; an absent ore name reads as plain "ore".
 */
export function oreFloodBarkFor(register, index, oreName) {
  const lines = (register && ORE_FLOOD_BARKS[register]) || ORE_FLOOD_BARKS.working;
  const line = lines[pickIndex(index, lines.length)] || lines[0];
  const ore = typeof oreName === 'string' && oreName.trim() ? oreName.trim().toLowerCase() : 'ore';
  return line.replace(/\{ore\}/g, ore);
}

// ── A tumbling heavy's point defence rakes its own battle line (THE WORLD ANSWERS, C10) ──────
//
// Spoken by a hull on the raked line (barkDirector, once per tumble episode) — the "check fire,
// that's our own guns" moment, one neutral combat register for every faction.
export const TUMBLE_RAKE_BARKS = Object.freeze([
  'Her guns are swinging through us — break off the line!',
  'That heavy’s tumbling and her battery is raking us — clear her arc!',
  'Point defence is sweeping our own line — scatter, scatter!',
]);

export function tumbleRakeBarkFor(index) {
  const line = TUMBLE_RAKE_BARKS[pickIndex(index, TUMBLE_RAKE_BARKS.length)] || TUMBLE_RAKE_BARKS[0];
  return typeof line === 'string' && line.length ? line : null;
}

// ── Dock control remembers the pilot (THE WORLD REMEMBERS, U-E) ──────────────────────────────
//
// Spoken once on `dock:docked` when the station's faction weighs the Record at or past ±4. The
// frame is dock control's greeting; `{deed}` is one line from deedPhrases (voice 'grievance' for
// the cold bank, 'praise' for the warm one), `{place}` the station's name, `{faction}` its house.
// barkDirector owns the listener and marks the deed told only when the bark is accepted.
export const DOCK_DEED_BARKS = Object.freeze({
  cold: Object.freeze([
    'Dock control: your hull is on file here, pilot. {deed}',
    'Dock control: {faction} has a folder on you. Keep your hands off the ring. {deed}',
    'Dock control: clearance granted, under protest. {deed}',
    'Dock control: {place} remembers you. {deed}',
  ]),
  warm: Object.freeze([
    'Dock control: welcome back, pilot. {deed}',
    'Dock control: {faction} keeps a berth warm for you. {deed}',
    'Dock control: good to see your transponder again. {deed}',
    'Dock control: priority approach for you at {place}. {deed}',
  ]),
});

/** One dock-control greeting; null for an unknown tone or an empty deed line. */
export function dockDeedBarkFor(tone, index, tokens = {}) {
  const lines = DOCK_DEED_BARKS[tone];
  const deed = typeof tokens.deed === 'string' ? tokens.deed.trim() : '';
  if (!lines || !deed) return null;
  const line = lines[pickIndex(index, lines.length)] || lines[0];
  return line
    .replace(/\{deed\}/g, deed)
    .replace(/\{place\}/g, tokens.place || 'this station')
    .replace(/\{faction\}/g, tokens.faction || 'This house');
}

// ── Law step receipts: CONTROL voices what the law just did ──────────────────────────────────
//
// FB-040 — event lines, not a BARK_SITUATION, and deliberately one line each: these are receipts
// in the lawful register, not personality chatter. The speaker is the lawful channel itself — a
// responder hull close enough to carry it, or the control desk when the receipt lands docked or
// off-radio. barkDirector owns the subscriptions and the per-incident dedupe; nothing else
// should speak these rows.

export const LAW_STEP_BARKS = Object.freeze({
  'law:fineAssessed': 'Assessment posted. The warrant prices itself — answer it before it answers for you.',
  'law:sanctuaryWithdrawal': 'Contact broke at the station ring. Withdrawal logged; the lane holds.',
  'law:responseDeferred': 'Response queued at capacity. Dispatch holds until the grid clears a slot.',
  'law:incidentResolved': 'Incident closed at the cordon. The approach is secure — resume transit.',
  'law:wantedWarrantReleased': 'The posted warrant is released. The ledger keeps what the hunt recorded.',
  'law:distressRaised': 'Distress acknowledged on the guard channel. Patrol is burning for the marker.',
});

/** The lawful-register receipt line for a law event; null for anything outside the corpus. */
export function lawStepBarkFor(eventName) {
  const line = eventName && LAW_STEP_BARKS[eventName];
  return typeof line === 'string' && line.length ? line : null;
}

// ── Passengers are people — the person a contract is about ───────────────────────────────────
//
// A passenger job used to be one sentence: a seat count with a fee. These corpora make the fare a
// person — a name minted per offer from (seed, offerId), one "why I'm traveling" line printed on
// the board, and three beats spoken on the existing comms seams (boarding on undock, a mid-run
// line at the route midpoint, an arrival line quoted in the settlement receipt). Register is the
// Frontier's: plainspoken, live-and-let-live — a fare talks like a person, not like a faction.
// Pure data + index selectors, same as every corpus above: the CALLER derives the index from
// hash32(state seed, mission/offer id) so lines are stable across save/load with no rng spend.
//
// Tokens: {name} the passenger (resolved by the caller), {dest} the destination station name.
export const FRONTIER_FIRST_NAMES = Object.freeze([
  'Orion', 'Kael', 'Voss', 'Mira', 'Juno', 'Sable', 'Ren', 'Thane', 'Lyra', 'Dax',
  'Cira', 'Nev', 'Soren', 'Tova', 'Zara', 'Calder', 'Rhea', 'Vek', 'Inara', 'Koda',
  'Maeve', 'Cassius', 'Lira', 'Draven', 'Ember', 'Tycho', 'Neve', 'Ash', 'Selene', 'Rook',
  'Brynn', 'Orin', 'Callum', 'Vesper', 'Idris', 'Sully', 'Kira', 'Jace', 'Nova', 'Petra',
]);

export const FRONTIER_LAST_NAMES = Object.freeze([
  'Vance', 'Ashford', 'Kellan', 'Revik', 'Solari', 'Morrow', 'Quade', 'Theron',
  'Aldric', 'Craine', 'Falken', 'Stroud', 'Varek', 'Holden', 'Rennick', 'Deckard',
  'Torren', 'Briggs', 'Calloway', 'Sagan', 'Tull', 'Graves', 'Huxley', 'Kepler',
  'Madsen', 'Oakes', 'Stark', 'Merrik', 'Calder', 'Voss',
]);

// The one-line "why I'm traveling" printed under the board row. {dest} always resolves.
export const PASSENGER_WHY_LINES = Object.freeze([
  'Work at {dest} starts when I sign in, and I am already late.',
  'Family question at {dest}. Thirty cycles of silence, one answer owed.',
  '{dest} has a med wing that still owes me a scan.',
  'A name at {dest} remembers me. That is the whole plan.',
  'Bought a berth at {dest} sight unseen. Sight stays unseen.',
  'Everything I own is one case, and {dest} is where the case is going.',
  'The lanes I ran are closed. {dest} is the road that is left.',
  'I heard {dest} pays debt collectors. I am one, and I am owed.',
  'Contract at {dest}, three cycles, no extensions. Same as anyone.',
  'Not running from anything. Ask me again at {dest} and I may answer.',
]);

// The three riding beats. board: spoken as the umbilical clears. midrun: once, at the route
// midpoint (or on the destination-sector crossing, whichever lands first). arrive: quoted in
// the settlement receipt, so the job closes in the fare's words, not the board's.
export const PASSENGER_BEATS = Object.freeze({
  board: Object.freeze([
    'Thanks for the seat. I travel quiet — no stops unless the hull complains.',
    'I will be in the back with my case. Wake me when the marker turns.',
    'Paid in full, so the trip stays boring. Boring is the point.',
    'If anyone hails us, I am cargo. Boring, lawful cargo.',
    'First lift off this rock in three cycles. Try not to die, hm?',
    'Couch is fine, the case stays on my knees. Punch it when you are ready.',
    'You fly, I nap. Wake me for anything louder than a customs ping.',
    'No stops, no questions, and nobody looks in the case. Deal and deal.',
  ]),
  midrun: Object.freeze([
    'Halfway, by my count. The seat still beats walking.',
    'You fly steady. That is the whole review.',
    'I keep watching the marker like it moves. It does not. Keep going.',
    'Something shifted in the hold. Probably mine. Probably.',
    'When we land, leave the manifest to me. It is simpler that way.',
    'Quiet run so far. Do not jinx it by agreeing.',
    'The old pilot I rode with said lanes feel shorter talking. Talk.',
  ]),
  arrive: Object.freeze([
    'You got me here in one piece. That puts you ahead of my last pilot.',
    'Keep the hatch quiet and open — I was never on your manifest.',
    'If anyone asks who flew me: nobody. But it was you, and I am grateful.',
    'Here is fine. Here is finally fine.',
    'Tell the board the trip was boring. Best thing a trip can be.',
    'Good hull, good hands. I will ask for you by name — not mine.',
  ]),
});

/** One line from a passenger corpus by numeric index (0..2^32). Deterministic; never empty. */
export function passengerBeatLine(kind, index) {
  const pool = PASSENGER_BEATS[kind];
  if (!Array.isArray(pool) || !pool.length) return '';
  const i = (Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0) % pool.length;
  const line = pool[i];
  return typeof line === 'string' && line.length ? line : pool[0];
}

// WORLD-35 / WORLD-42. Role registers, not faction patrol-greeting lines. A tourist liner
// must not borrow the freighter hail, and an empty-lot hauler speaks this register only.
export const TOURIST_HAIL_REGISTER = Object.freeze([
  'Scenic liner. The window is the cargo. Mind the glass.',
  'Tour pass. We are looking, not hauling. Hold your lane.',
  'Liner on the view. Passengers at the ports. No freight aboard.',
]);

export const HAULER_REGISTER = Object.freeze([
  'Empty lot. I burned the lane for nothing.',
  'Berth is bare. Somebody posted a ghost.',
  'No load on the pad. I am not waiting on a rumour.',
]);

// 363 — THE GRANDEE. The lanes' one celebrity: old, huge, and aware of both. Her pass-by
// hail is a famous ship sounding famous, not a freighter chirp with a bigger hull.
export const GRANDEE_REGISTER = Object.freeze([
  'Easy on the burn, pilot. I was crossing lanes before your keel was laid.',
  'GRANDEE-1. Yes, the Grandee. Wave if you like — I see everything this big.',
  'Mind the wake, small fry. She takes a while to argue with.',
]);

export function grandeeHailFor(rng) {
  return GRANDEE_REGISTER[pickIndex(rng, GRANDEE_REGISTER.length)];
}

// The wreck-field rival cutter (aftermathWrecks ecology). The contest over a fresh wreck is
// a spoken scene now: the claim when it starts cutting, the yield when its hull is pressed,
// and the departure that names what it took.
export const RIVAL_SCAVENGER_REGISTER = Object.freeze({
  claim: [
    'Claiming a cut of this field. First come is first served, friend — nothing personal.',
    'This wreck has my name in the ledger already. Find your own rock.',
    'Rival cutter on the hull. The pool is big enough for both of us — barely.',
  ],
  pressured: [
    'Take it! Take it, it is yours — I am not dying for a hold of scrap!',
    'DROPPING THE CUT — hull is coming apart. Tell the pool I quit!',
    'Fine! Half is yours! The other half keeps me breathing!',
  ],
  departed: [
    'Hold is full. Your rock, my cut — nothing personal.',
    'That is my take banked. Next time, work faster.',
    'Full hold, running the lane. The scavenger tax is real.',
  ],
});

export function rivalScavengerLineFor(kind, rng) {
  const table = RIVAL_SCAVENGER_REGISTER[kind];
  if (!table || !table.length) return '';
  return table[pickIndex(rng, table.length)];
}

// A freight raider clearing its escape leash (encounterScripts freight-custody). The thief
// names its own take as it goes — one line per hull, spoken over the getaway transponder burn.
export const FREIGHT_RAIDER_ESCAPE_REGISTER = Object.freeze([
  'Pods secured. The hauler\'s loss is my margin — chase the wake if you want it back.',
  'Freight\'s ours. Transponder\'s going dark — spend the fuel if you\'re feeling rich.',
  'Full hold, clean lane. That cargo was never yours, friend.',
]);

export function freightRaiderEscapeBarkFor(rng) {
  return FREIGHT_RAIDER_ESCAPE_REGISTER[pickIndex(rng, FREIGHT_RAIDER_ESCAPE_REGISTER.length)];
}

export function touristHailFor(rng) {
  return TOURIST_HAIL_REGISTER[pickIndex(rng, TOURIST_HAIL_REGISTER.length)];
}

export function haulerRegisterBarkFor(rng) {
  return HAULER_REGISTER[pickIndex(rng, HAULER_REGISTER.length)];
}

/** Tourist, hauler, and Grandee lines. Freighter and every other role stay on the faction hail. */
export function trafficRoleHail(role, rng) {
  const key = String(role || '').toLowerCase();
  if (key === 'tourist') return { register: 'tourist', text: touristHailFor(rng) };
  if (key === 'hauler') return { register: 'hauler', text: haulerRegisterBarkFor(rng) };
  if (key === 'grandee') return { register: 'grandee', text: grandeeHailFor(rng) };
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════════
// ZONE CHATTER (audit Z.1 / ID-V) — overheard-radio layer. ~40 lines per zone type,
// resolved against the live census: every {actor} is a real hull in the zone, {site}
// a real station, {zone}/{sector} the authored names. A line whose tokens cannot all
// resolve is skipped — the channel never invents a tug that isn't there.
// ════════════════════════════════════════════════════════════════════════════════════

export const ZONE_CHATTER_BARKS = Object.freeze({
  civilian_core: Object.freeze([
    'Control, {site} queue is still holding — copy?',
    '{actor}, your docking window moved two slots back.',
    'Anyone else hearing that rattle on the approach to {site}?',
    'Commuter traffic stacked over the pads, hold your vectors.',
    '{actor}, ease off the throttle — this is a residential lane.',
    'Insurance drone just pinged me again. Third time this week.',
    '{site} custom counter says the next berth frees at the half hour.',
    'Who left a crate floating mid-lane? Tagging it now.',
    '{actor} and {actor2}, stop orbiting each other and pick a pad.',
    'Pad nine at {site} is closed for wash-down. Expect delays.',
    'Lovely day to be indoors, huh. Not for us.',
    'Remember — no hot burns inside the {zone} corridor.',
    'Delivery for {site} pharmacy wing, who takes it?',
    'Traffic says the {sector} run is clean all the way out.',
    '{actor}, your port beacon is flickering again.',
    'Civ channel only, please. Haulers move to band four.',
    'Someone\'s skiff is drifting off {site} east pad.',
    'Quiet morning. Enjoy it while it lasts.',
    '{actor}, you cut that close to the hab ring.',
    'Rent went up again at {site}. Surprise, surprise.',
    'Anybody got eyes on a lost kid\'s drone? Yellow hull.',
    'The {zone} queue moves when it moves. Patience.',
    '{actor2}, quit shadowing {actor} — you\'re spooking the civvies.',
    'Water reclaim crew wants lane six clear for an hour.',
    'That\'s the third shuttle to miss {site} approach today.',
    'All hulls — school transport on final, yield starboard.',
    '{actor}, you forgot your running lights. Again.',
    'Bakery barge is doing rounds past {site}. Place orders.',
    'Nothing on scan but dust and gossip. Good.',
    '{site} says repairs are booked out till next cycle.',
    'Watch your wash, {actor} — there are miners below you.',
    'The garden deck crew needs a tug. Anyone free?',
    'Two more ships and this lane is officially a parking lot.',
    '{actor}, your anchor line is trailing sparkles.',
    'Quiet orbit, clean pads. Keep it that way.',
    'Someone parked in the red zone at {site} again.',
    'Local net says a storm front is coming off {sector} rim.',
    'If it\'s not on the manifest it doesn\'t dock at {site}.',
    'Good shift, people. Keep the lane boring.',
  ]),
  trade_lane: Object.freeze([
    'Convoy slot is yours, {actor} — take point.',
    'Toll relay ahead wants manifest open. Don\'t argue.',
    '{actor}, you\'re riding my wash. Back it off two ticks.',
    'Rates at {site} just jumped — sell now if you\'re holding.',
    'Escrow cleared on my end. Goods better be real.',
    '{actor2} tried to cut the queue at the {zone} gate. Saw it.',
    'Full hold, thin fuel — that\'s the whole route, friend.',
    'The {sector} run is paying double for ore this cycle.',
    '{actor}, your convoy tag is still on last week\'s manifest.',
    'Slow freight keeps formation. Fast freight answers to pirates.',
    'Weigh-station says {actor} is over mass. Good luck.',
    'Anyone heading rim-ward from {site}? I\'ll pace you.',
    'Contract says delivery by dusk. Space says otherwise.',
    '{actor} keeps braking for ghost rocks. New pilot, probably.',
    'Fuel\'s cheaper at {site} but the dock fees eat it.',
    'Two toll gates, one inspection. Budget the whole day.',
    '{actor2}, quit broadcasting your manifest. Rookie move.',
    'Last hauler through here left cargo in the lane.',
    'Escort wanted, three hulls, {zone} stretch. Any takers?',
    'You smell that? Someone\'s freezer unit is leaking.',
    '{actor}, your transponder is still on hauler mode.',
    'Convoy splits at {site} — north group, take the high lane.',
    'Nobody buys slag at these prices. Nobody.',
    'Check your mass, {actor} — scales here are honest.',
    'The toll wants exact mass or they re-scan the hold.',
    'I\'ve got coffee older than this queue at {site}.',
    'Hauler ahead of {actor} is leaking coolant. Keep clear.',
    'Manifest\'s clean. Route\'s clean. Ship\'s another matter.',
    'The {sector} market is paying for salvage-grade alloys.',
    '{actor2}, your wingman is lagging. Form up or lose the slot.',
    'Oversize load on approach — give the barge room.',
    'Fuel gauge says no. Debt ledger says go anyway.',
    'The {zone} checkpoint just flagged a skiff for scan.',
    'Buy low at {site}, sell lower somewhere else. Classic.',
    'Lane\'s clear to the horizon. Burn gentle, keep watch.',
    'Every hauler in this line has the same tired story.',
    '{actor}, your brake lights — I mean burn lights — are sticky.',
    'First one to {site} unloads first. That\'s the rule.',
    'Half this queue is running on a prayer and a patch kit.',
  ]),
  patrol_corridor: Object.freeze([
    'Patrol two, hold your lane — traffic is thick at {site}.',
    'All hulls, this channel is monitored. Keep it clean.',
    '{actor}, identify — your beacon just dropped.',
    'Nothing on the scope but honest freight today.',
    'Checkpoint ahead wants engine signature on file.',
    '{actor}, you were clocked hot through the {zone} marker.',
    'Perimeter sweep\'s clear out to the {sector} boundary.',
    'That last inspection went smooth. Count your fingers anyway.',
    'All traffic, keep ten ticks spacing on the {site} approach.',
    'Two ships ran the checkpoint last shift. Don\'t be third.',
    '{actor2}, state your cargo — channel record only.',
    'Beacon maintenance on lane four. Expect false pings.',
    'You hear a distress ping, you report it. That\'s all.',
    'Patrol six is cycling rest — coverage stays nominal.',
    '{actor}, your drift correction flagged the net. Hold course.',
    'Quiet beat today. Boring is beautiful on this corridor.',
    'The {zone} marker needs new paint. Logged it.',
    'Any hull without transponder gets boarded. No exceptions.',
    'Civilian craft: stay off the patrol band. This is not it.',
    '{site} reports a missing skiff — last ping near {actor}.',
    'Someone painted a rude word on the {sector} beacon. Grow up.',
    'Checkpoint crew says the scanner\'s slow today. Be patient.',
    'Patrol nine, your sector light is on. Respond.',
    'All clear to {site}. Routine only.',
    'Watch the gap between {actor} and {actor2} — looks tight.',
    'The toll lane and the patrol lane are not the same lane.',
    'We write tickets, not recommendations. Fly straight.',
    'An unmarked hull shadowed me out past the {zone} ring.',
    'The scanner\'s down at post three — visual only.',
    'Keep your log open for review on approach to {site}.',
    'Two more hours on this sweep. Then the bar, maybe.',
    '{actor}, confirm your registration — the file\'s fuzzy.',
    'That was a warning shot the next system over, people.',
    'The {sector} patrol route never sleeps. Neither do we.',
    'No unscheduled burns inside the corridor, final warning.',
    '{actor2}, dock your grievances at {site}, not here.',
    'Clean sweep on lane two. Moving to lane seven.',
    'Nothing worth a report today. Log it anyway.',
    'Traffic through here is honest because we are here.',
    'End of watch in four. Someone else inherits the cold.',
  ]),
  border_checkpoint: Object.freeze([
    'Papers before propulsion. You know the drill.',
    '{actor}, step forward — full manifest, open hold.',
    'The checkpoint scanner ate another permit chip.',
    'Line\'s moving. Nobody talks their way past {site}.',
    'Fines triple for unmarked cargo. Read the sign.',
    'That skiff\'s registration expired last cycle. Flag it.',
    '{actor2}, you crossed the {zone} line without clearance.',
    'Random inspection, berth four. Nothing personal.',
    'The stamp machine\'s jammed. Everything is delayed.',
    'You don\'t cross the {sector} boundary on a promise.',
    'Customs just pulled {actor} aside — manifest mismatch.',
    'No contraband on your scan, no problem. Next.',
    'Checkpoint crew wants a second look at the ore hold.',
    'Two ships tried to queue-jump. They wait now.',
    '{actor}, that permit is expired. Renewal line is left.',
    'The {site} inspector is thorough. Budget an hour.',
    'Everything in your hold is on your manifest. Right?',
    'Slow day — three skiffs and a lecture. Fine by me.',
    'You want in, you scan clean. Simple.',
    '{actor2}, hold — your crew list is short a name.',
    'Weigh-station says light. Manifest says heavy. Explain.',
    'Border\'s just a line until someone crosses it wrong.',
    'The {zone} checkpoint sees everything. Eventually.',
    'Fine\'s posted to your account, {actor}. Appeal at {site}.',
    'Cleared. Move through and keep your drives cool.',
    'That crate of \'farm equipment\'? We scanned it twice.',
    'You\'re flagged for a random deep-scan, {actor}. Don\'t sweat.',
    'Two permits, one hull. Pick a story.',
    'Checkpoint shift ends at the horn. Until then — line.',
    'Someone tried bribing the scanner again. It reported them.',
    'All hulls: queue order is arrival order. No exceptions.',
    'You argue with the stamp, you lose the day.',
    '{site} customs is running a quota audit this cycle.',
    'Your hold smells funny, {actor}. That\'s a re-scan.',
    'The {sector} boundary is where patience meets paperwork.',
    'Three vessels, one gate. Do the math.',
    'Cleared through. Welcome back. Try to stay gone.',
    'Denial of entry is not negotiable. Sign here.',
    'Paperwork outlasts propulsion, every time.',
    'Next ship. Keep your manifest open and your mouth shut.',
  ]),
  refinery_approach: Object.freeze([
    'Slag haze on approach — keep your intake filters clean.',
    '{site} offload window is short. Burn gentle, land hard.',
    'The melt crew wants lane two clear for the slag train.',
    '{actor}, your ore cart is drifting off the belt guide.',
    'Spill alarm on pad three. Stand by for vent.',
    'Refinery buys what the belt coughs up. Today it\'s cheap.',
    'The stack\'s running hot again. Don\'t stare at it.',
    'Ore assay line\'s backed up to {zone} marker. Wait it out.',
    'Unload window\'s thirty ticks. Make them count, {actor}.',
    'Coolant pipe burst on the south stack. Smell that?',
    'Two barges ahead of you. Both carrying heavy.',
    'The chem-wash team is downwind of the melt today.',
    'Slag rates dropped again. The belt\'s been busy.',
    '{actor2}, your heat signature\'s lighting up the board.',
    'Dock crane\'s on its last hydraulics. Be kind to it.',
    'Melt supervisor says no walk-ons today. Stay in hull.',
    'The {sector} ore quota\'s two hulls short. Sell now.',
    'Scrap line\'s open on the east side of {site}.',
    'You want clean alloy you go in-system. This is slag.',
    '{actor}, offload your ore then clear the belt guide.',
    'Something\'s burning in the secondary stack. Not us.',
    'Weigh-station\'s honest here. Refinery\'s honest nowhere.',
    'The haze eats radio signals — repeat your transponder.',
    'Ore cart\'s off the rail at the {zone} bend. Crew en route.',
    'Smelter crew\'s on break. Offload waits.',
    '{actor2}, quit hovering — you\'re blocking the slag vent.',
    'Last ship that hot-docked lost its cargo. Learn.',
    'Refinery takes hull damage too. Inspect before you leave.',
    'The melt runs all night. Sleep through it if you can.',
    'Two ore barges, one crane. You see the problem.',
    '{site} buys by the ton, not the story.',
    'Someone\'s been skimming the belt guide. Watch your load.',
    'Heat warning on pad six — shift your hull, {actor}.',
    'The belt\'s dry till next shift. Relax.',
    'All inbound: the approach corridor re-routes at {zone}.',
    'Assay\'s back — your ore reads clean, {actor}.',
    'Keep your plume off the stack intake. Final warning.',
    'Unload fast. The haze doesn\'t wait for paperwork.',
    'The refinery never sleeps. The refinery never apologizes.',
    'Next hull on the offload ramp. Make it quick.',
  ]),
  mining_belt: Object.freeze([
    'My claim, my rock. Pick another one, {actor}.',
    'The vein\'s three ticks deep — drill slow or lose it.',
    'Dust cloud incoming from the {zone} rim. Seal up.',
    'That rock\'s hollow. I\'ve drilled a thousand of them.',
    'Ore\'s down, morale\'s down, dust is forever.',
    '{actor2} drilled through my marker. Again.',
    'The belt pays in tonnage and bruises.',
    'Scanner says {actor}\'s hold is already full. Lucky.',
    'Two rocks just collided near the {site} approach. Avoid.',
    'The drill crew wants a medic. Someone\'s hand again.',
    'Claim flags are sacred. Touch mine and see.',
    '{actor}, your pulse drill is bleeding heat.',
    'There\'s nickel in that rock. Smell it? Nickel.',
    'The {sector} vein runs thin this season. Work harder.',
    'Nobody owns the belt. Everybody fights for it anyway.',
    'Watch for rock spiders. They nest in the cracks.',
    'Drill\'s jammed on a pocket of ice. Stand by.',
    'The dust out here gets in everything. Even the soup.',
    '{actor2}, that\'s the third rock you\'ve lost this week.',
    'Ore\'s heavy today. The hold\'s heavier.',
    'The belt\'s honest — it gives what you take.',
    'Two more hours on this vein, then I\'m rich. Again.',
    'Rock\'s shifting under the drill. Everyone hold.',
    'The {zone} claim\'s been dry for a week. Try the north rim.',
    'Your drill\'s louder than my engine, {actor}. Fix it.',
    'Assay says this rock\'s half air. Half pay.',
    'The belt teaches patience and pays for stupidity.',
    'Claim\'s marked on the board at {site}. It\'s official.',
    'I\'ve got rocks older than this sector. Respect them.',
    'Someone\'s been poaching the {zone} markers at night.',
    'Drill bit\'s dull. Ore\'s hard. Story of my life.',
    'The dust storm scrubbed two claims off the map.',
    '{actor}, that rock\'s too big to crack. Move on.',
    'The belt owes me a fortune. It pays in dust.',
    'Ore cart\'s on the far side of the {site} guide.',
    'Two miners went in the crack. Three came out.',
    'The vein\'s dead. Move to the next rock.',
    'Drill\'s overheating again. Take five.',
    'This belt\'s been worked for years. Still pays.',
    'Every rock\'s a riddle. Answer wrong and it bites.',
    'Shift\'s over when the hold\'s full. So — never.',
  ]),
  colony: Object.freeze([
    'Hab cycle two starts in ten. Doors seal.',
    'The {site} market opens when the lights warm.',
    'Kids on the promenade — mind your thrusters, {actor}.',
    'Water reclaim\'s running behind. Ration tight.',
    'The garden deck\'s open. First come, first green.',
    'Someone left a bicycle in the airlock again.',
    'Local traffic only past the {zone} boundary.',
    'The {sector} supply ship is three days late.',
    'Medic\'s on the upper deck if you need stitches.',
    'The town hall\'s loud tonight. Democracy at work.',
    '{actor}, dock at the visitor\'s pad, not the farm ring.',
    'Power\'s rationed on the lower decks till morning.',
    'The school shuttle\'s delayed. Again.',
    'You can smell the algae vats from orbit. Home.',
    'Two families are feuding over docking rights. Again.',
    'The {zone} festival starts when the cargo arrives.',
    'Everyone\'s cousin works the reactor here.',
    'Fresh produce at {site} — real dirt, real price.',
    'The church bell rings when the dock\'s full.',
    '{actor2}, your hull\'s parked on the market square.',
    'Hydroponics wants volunteers. No pay, good food.',
    'The colony\'s old enough to have its own accent.',
    'Don\'t mention the reactor hiccup at dinner.',
    'The {sector} mail packet just landed. Letters, people.',
    'Someone\'s been stealing water credits. Again.',
    'The greenhouses glow at night. Pretty sight.',
    'Local rule: no engines inside the hab ring.',
    'Two births this week, one funeral. The count holds.',
    'The {zone} council meets at the old dock bar.',
    'You leave {site}, you\'re a stranger for a year.',
    'The kids race drone kites off the east pad.',
    'Medicine\'s short this cycle. Share if you can.',
    'The old man at {site} claims he\'s seen a ghost ship.',
    'Everyone knows everyone\'s business. Act accordingly.',
    'The {sector} harvest\'s in. Trade fair\'s next.',
    'Dock fees pay for the school. Complain gently.',
    '{actor}, your crew\'s overdue on the water tab.',
    'The colony remembers everyone who left. And why.',
    'Quiet night. Even the reactor sounds sleepy.',
    'Home is where the airlock knows your name.',
  ]),
  derelict_field: Object.freeze([
    'Claim flags on that hull. Check the board at {site}.',
    '{actor}, that wreck\'s still warm — watch your approach.',
    'Something\'s nesting in the {zone} hulk. Keep distance.',
    'Scrap\'s thick today. Pick a hull, stake a flag.',
    'That wreck still has her reactor core. Don\'t touch it.',
    'Salvage rights go to whoever claims the tag first.',
    'The dead don\'t mind sharing their ships. Usually.',
    'Two crews went into the big hull. One came back.',
    'The {sector} field\'s picked clean except the deep wrecks.',
    '{actor2}, that hull\'s booby-trapped. Can\'t you smell it?',
    'The field\'s quiet till you start cutting. Then it isn\'t.',
    'Every wreck out here has a story. Nobody to tell it.',
    'The deep wrecks still hum. Nobody knows why.',
    '{actor}, your cutting torch is too close to the fuel line.',
    'The salvage board at {site} is updated hourly.',
    'That hull\'s full of spider nests. Fresh ones.',
    'The field teaches you what a hull\'s worth when it\'s done.',
    'Someone found a whole cargo bay yesterday. Intact.',
    'The {zone} field\'s a graveyard and a bank.',
    'Don\'t go in alone. The wrecks keep people.',
    'That hull\'s been dead fifty years. Still leaks.',
    'The wrecks shift at night. Currents, maybe. Maybe.',
    'Two scavengers fought over the {zone} hulk. Both lost.',
    'Cut slow. The wrecks don\'t forgive haste.',
    'The field\'s older than the war that filled it.',
    'Someone\'s been marking the deep wrecks. Nobody knows who.',
    'The {sector} field pays in metal and nightmares.',
    '{actor}, your line\'s tangled in the wreck\'s spine.',
    'The hulks hum when the radiation front hits.',
    'Every wreck\'s got a claim flag and a curse.',
    'The field\'s quiet today. Too quiet.',
    'Salvage law: first cut, first claim. Second gets scraps.',
    'The deep field\'s where the good metal hides. And worse.',
    'That hull still has her nav computer. Rare find.',
    'The wrecks remember being ships. Treat them gently.',
    'Two more hulks drifted in from {sector} rim last night.',
    'The field\'s honest — it takes back what the living borrow.',
    'Cut your lines before the tide turns. Trust me.',
    'The {zone} field eats ships. Slowly.',
    'One more salvage run and I retire. Third time I\'ve said it.',
  ]),
  outlaw_zone: Object.freeze([
    'Nobody asks names on this channel. Keep it that way.',
    'The {zone} crew runs protection on the lane. Pay or pray.',
    '{actor}, you\'re new. New ships pay new rates.',
    'The law stops at the {sector} line. We don\'t.',
    'Debt\'s called in at the dock, not the ledger.',
    'Two ships went in the back channel. Neither came out.',
    'The {site} fence pays half for anything unmarked.',
    'Keep your transponder cold and your stories colder.',
    'The {zone} boss hears everything on this band.',
    'Runners only. Tourists get robbed — twice.',
    '{actor2}, your hull\'s flagged on three bounty boards.',
    'The channel\'s clean. The work isn\'t.',
    'Someone sold our route to the patrol. We\'ll find who.',
    'The {sector} fence moves tonight. Be there or be broke.',
    'Law\'s busy at the checkpoint. Work while you can.',
    'The {zone} run pays triple for a reason.',
    'Every hull out here has a price and a secret.',
    'The bounty\'s posted on {actor}. Collect if you can.',
    'No questions on this band. Questions get answered.',
    'The {site} crew took a share of my haul. Fair trade, they said.',
    'Silent hulls move fastest. Remember that.',
    'The {zone} route\'s burned. Use the back lane.',
    'Two of our own went missing. Lookouts everywhere.',
    'The fence pays in clean credits. No questions.',
    'The law\'s a rumor out here. We\'re the truth.',
    'You want safe passage, you pay the {zone} toll.',
    'Every ship in this lane has a warrant somewhere.',
    'The {sector} border\'s a suggestion, not a wall.',
    'Keep your cargo close and your engines hot.',
    'The {site} fixer knows where your family docks.',
    'We don\'t take sides. We take cargo.',
    'The bounty boards refresh at dawn. Check your name.',
    'No law past the {zone} line. Just agreements.',
    'The {sector} crew\'s recruiting. Don\'t apply.',
    'Silent running buys you one free pass. One.',
    'The {site} fence moved again. Find it or starve.',
    'Debt collectors work this band. Pay up or burn.',
    'The {zone} crew runs the only honest game out here.',
    'You want work, you ask at the back channel. Not here.',
    'The law\'s got a price out here. We\'re it.',
    'Every hull\'s a rumor until proven a ship.',
  ]),
  radiation_field: Object.freeze([
    'Dosimeter\'s at yellow. Turn back or burn through, {actor}.',
    'The field\'s hungry today. Shields up or go home.',
    'Two ships went dark in the {zone} last cycle.',
    'My dose badge is older than my ship. Still works.',
    'The {sector} field eats hulls that linger.',
    'Your skin\'s the cheapest shield. Buy better.',
    'The field\'s at red on the far side of {site}.',
    'Burn fast, turn slow. That\'s the {zone} rule.',
    'The radiation front hit hard last night. All clear now.',
    'Two dosimeters, one says safe. Trust neither.',
    'The {zone} field doesn\'t care about your schedule.',
    'Hull\'s glowing from the dose. Get out while you can.',
    'The field\'s quiet till it isn\'t. Then it\'s too late.',
    '{actor2}, your shields are at half. Turn back.',
    'The {sector} field\'s thicker this season. Blame the sun.',
    'Every burn through here costs a year off your life.',
    'The dosimeter reads hot. The hull reads hotter.',
    'Stay in the shadow of the big rock. Safer.',
    'The {site} crew sells shield time by the hour.',
    'Radiation front\'s coming. You can feel it.',
    'The {zone} field\'s at full charge today.',
    'Your engines\'ll fry before your shields. Choose.',
    'Two more rads and you\'re a walking lantern.',
    'The field\'s hungry for hulls. Don\'t feed it.',
    'The {sector} dose map\'s wrong again. Trust your gut.',
    'Shields up or die young. Simple math.',
    'The field\'s got a rhythm. Learn it or leave.',
    'My hair fell out last cycle. The field\'s a gift.',
    'The {zone} field\'s quiet today. Don\'t trust it.',
    'Burn through at full throttle. Every second counts.',
    'The dosimeter just screamed. That\'s not good.',
    'The {site} shield crew works miracles. Expensive ones.',
    'Radiation\'s free. Surviving it costs everything.',
    'The {sector} field\'s a furnace without the fire.',
    'Your hull\'s cooking. Move to the safe channel.',
    'The field\'s at maximum today. Full stop.',
    'Two ships fried in the {zone} last week. Learn.',
    'The shield\'s the only friend out here.',
    'Burn fast. Pray faster.',
    'The field doesn\'t negotiate. It irradiates.',
  ]),
  nebula_fog: Object.freeze([
    'I see your lights, {actor}. Don\'t see your hull.',
    'The fog\'s eating my sensors again. Stay close.',
    'Ghost ping off the port bow. Probably nothing.',
    'The {zone} fog\'s thick enough to float a hull.',
    'Two ships collided in the murk last cycle. Slow down.',
    'My scanner sees shapes that aren\'t there. Probably.',
    'The fog hums when you run the engines hot.',
    'Keep your lights on, {actor2}. It\'s all I\'ve got.',
    'The {sector} fog\'s a maze with no exit signs.',
    'Something big moved through the fog an hour ago.',
    'Navigation by feel today. The fog ate the map.',
    'The fog\'s alive when you squint at it right.',
    'Stay in my wash, {actor}. Don\'t wander.',
    'The {site} beacon\'s the only light in the murk.',
    'Fog\'s thicker than porridge. Hold your heading.',
    'The {zone} fog plays tricks on the long-range scan.',
    'Your lights are getting dim, {actor}. Come back.',
    'The murk\'s full of whispers today.',
    'Two hulls lost in the fog. No trace.',
    'The {sector} fog\'s a curtain on the whole show.',
    'Lights on, engines low, eyes open.',
    'The fog\'s a liar — it shows you what you fear.',
    'Navigation\'s guesswork in this soup.',
    'The {zone} fog\'s a blanket over the whole route.',
    'I hear engines in the murk that aren\'t mine.',
    'The fog\'s full of rocks and regrets.',
    'Stay tight, {actor2}. The murk eats stragglers.',
    'The {site} light\'s the only truth out here.',
    'Fog\'s at maximum. Reduce to drift speed.',
    'Your transponder\'s the only thing keeping us together.',
    'The murk\'s full of dead ships. And living ones.',
    'The {sector} fog\'s a story the sensors can\'t read.',
    'Keep formation. The fog\'s full of ghosts.',
    'Something\'s out there. It\'s always something.',
    'The fog\'s a maze and we\'re the rats.',
    'Your lights flicker, {actor}. Check your systems.',
    'The {zone} murk\'s a test. Pass it or join it.',
    'The fog\'s quiet. Too quiet for comfort.',
    'Two hulls went in. The fog kept them.',
    'Lights only. Trust nothing but the burn.',
  ]),
  ambush_lane: Object.freeze([
    'Keep drives hot, {actor}. This lane\'s got teeth.',
    'Two ships went quiet past the {zone} marker.',
    'The lane\'s clean till it isn\'t. Stay sharp.',
    'Escort wanted, {zone} stretch. Name your rate.',
    'The {sector} lane\'s been hit three times this week.',
    'Watch the rocks on the starboard. They watch back.',
    'Silent running through the bad stretch. Standard.',
    'The {site} crew sells escort by the hour.',
    'Your hull\'s a target, {actor}. Paint it dull.',
    'The lane\'s got a toll that isn\'t on the board.',
    'Two hulls jumped out at the {zone} bend. Be ready.',
    'The escort\'s worth the fee. Count the scars.',
    'Burn straight, turn fast. That\'s the lane\'s law.',
    'The {sector} lane\'s a gauntlet. Run it scared.',
    'Keep your cargo close and your friends closer.',
    'The ambush\'s a rumor until it\'s real.',
    'Your transponder\'s a beacon, {actor2}. Kill it.',
    'The lane\'s full of hungry shadows. Stay lit.',
    'The {site} escort crew\'s cheap. Use them.',
    'The {zone} lane\'s where cargo goes to die.',
    'Three hulls in formation. That\'s the only way.',
    'The lane\'s honest about one thing — it\'s dangerous.',
    'Watch your six. The lane\'s watching your eight.',
    'The {sector} lane\'s got a body count.',
    'Escort\'s not optional out here. It\'s survival.',
    'The ambush\'s a toll you pay in hull, not credits.',
    'Your hold\'s worth more than your hull out here.',
    'The {zone} lane\'s quiet. That\'s the warning.',
    'Two ships vanished past the marker. Stay together.',
    'The lane\'s a gauntlet. Run it or die.',
    'Keep your engines hot and your eyes open.',
    'The {site} crew knows where the ambushes hide.',
    'The {sector} lane\'s a graveyard with traffic.',
    'Silent ships die silently. Stay loud.',
    'The lane\'s got more teeth than a pit fighter.',
    'Your hull\'s a meal ticket, {actor}. Guard it.',
    'The ambush\'s waiting. It always is.',
    'Two escorts went with the last convoy. Worth it.',
    'The lane\'s a lie. Trust your eyes.',
    'Stay sharp. The {zone} bend\'s hungry.',
  ]),
  anomaly_deep: Object.freeze([
    'The instruments lie out here. Trust your gut.',
    'The {zone} anomaly\'s reading different today.',
    'Two ships came back from the deep changed.',
    'The {sector} anomaly\'s a hole in the map.',
    'Your compass is drunk, {actor}. Follow the lights.',
    'The anomaly hums a frequency nobody can name.',
    'The deep\'s full of answers nobody asked for.',
    'The {site} lab buys anomalous readings by the byte.',
    'Time\'s funny in the {zone}. Check your clock.',
    'The anomaly\'s growing. Nobody knows into what.',
    'The deep\'s quiet till it sings. Then run.',
    'Two research hulls went in. One came back wrong.',
    'The {sector} anomaly\'s a wound in space.',
    'Your instruments are confused, {actor2}. So are we.',
    'The deep\'s honest — it shows you what you are.',
    'The anomaly\'s a mirror. Don\'t look too long.',
    'The {zone} deep\'s got a pulse. Listen.',
    'The instruments screamed at the last marker.',
    'The deep\'s full of signals that aren\'t ours.',
    'The {site} crew\'s been listening to the anomaly for years.',
    'The anomaly\'s patient. It waits.',
    'Two lights in the deep that aren\'t stars.',
    'The {sector} deep\'s a question without an answer.',
    'Your hull\'s a toy to the deep. Respect it.',
    'The anomaly\'s a door. Don\'t open it.',
    'The deep\'s got a rhythm. Match it or leave.',
    'The {zone} anomaly\'s a story without an ending.',
    'Instruments at maximum. Nothing\'s out there. Sure.',
    'The deep\'s full of echoes that aren\'t ours.',
    'The anomaly\'s a test the universe forgot to grade.',
    'Two hulls went in curious. Came back strange.',
    'The {sector} deep\'s a wound that doesn\'t heal.',
    'Your compass is spinning, {actor}. Good.',
    'The deep\'s honest about one thing — it\'s wrong.',
    'The anomaly\'s a song you can\'t unhear.',
    'The {site} lab\'s paying for readings. Sell yours.',
    'The deep\'s a mouth. Don\'t feed it.',
    'The anomaly\'s a clock that runs sideways.',
    'The deep\'s quiet today. That\'s the loudest warning.',
    'Two signals in the deep. Neither\'s ours.',
  ]),
  planetary_mass: Object.freeze([
    'Gravity\'s got a price. Pay it in fuel.',
    'The well\'s deep here. Burn gentle, {actor}.',
    'The {zone} mass bends more than light.',
    'Your orbit\'s decaying. Correct or crash.',
    'The planet\'s a magnet. Your hull\'s a nail.',
    'Dock approach\'s at the {site} beacon. Follow it.',
    'The well\'s hungry today. Feed it carefully.',
    'Two hulls dropped out of orbit last night.',
    'The {sector} mass pulls at your fuel like a tax.',
    'Your vector\'s wrong, {actor2}. Recalculate.',
    'The planet\'s a wall. Hit it wrong and it\'s the last.',
    'Approach trim\'s off. Fix it before you burn.',
    'The well\'s deep. Deeper than your reserves.',
    'The {zone} mass is a tax on every burn.',
    'Your hull\'s a rock in the well. Climb out.',
    'The planet\'s got a temper. Don\'t test it.',
    'Two ships dropped too fast. Wreckage below.',
    'The {site} dock\'s a haven in the well.',
    'Gravity\'s honest — it pulls and never apologizes.',
    'The well\'s a trap for the careless. Be careful.',
    'Your burn\'s too hot for the approach, {actor}.',
    'The {sector} mass bends your path. Plan for it.',
    'Orbit\'s a dance. Step wrong and you fall.',
    'The well\'s got teeth. Respect the gravity.',
    'Two more degrees and you\'re in the soup.',
    'The {zone} mass is a wall you can\'t see.',
    'Your approach\'s steep, {actor2}. Pull up.',
    'The planet\'s a hook. Your hull\'s a fish.',
    'Dock approach\'s marked on the {site} beacon.',
    'The well\'s deep and getting deeper.',
    'Gravity\'s a tax collector. Pay or burn.',
    'The planet\'s a wall of gravity. Don\'t hit it.',
    'Your orbit\'s a thread. Don\'t break it.',
    'The {sector} mass pulls at everything.',
    'Two hulls fell out of the well. Gone.',
    'The {zone} mass is a magnet for the unwary.',
    'Your vector\'s a guess. Recalculate, {actor}.',
    'The well\'s honest — it takes what it\'s owed.',
    'Dock\'s at the beacon. Don\'t miss it.',
    'Gravity\'s the only law out here.',
    'The planet\'s a weight. Carry it carefully.',
  ]),
});

// Tokens resolved against the live census: {actor}/{actor2} = a real hull in the zone,
// {site} = nearest station name, {zone} = the zone's authored name, {sector} = the sector's.
const ZONE_CHATTER_TOKEN_RE = /\{(actor|actor2|site|zone|sector)\}/g;

/**
 * Pick a zone-chatter line for `zoneType` at deterministic `index`, substituting tokens
 * from `tokens` ({actor, actor2, site, zone, sector}). Scans forward from the seeded start
 * so a line whose tokens cannot all resolve is skipped — the channel never names a hull
 * that isn't there. Returns null when no line resolves or the type has no corpus.
 */
export function zoneChatterBarkFor(zoneType, index, tokens = null) {
  const pool = ZONE_CHATTER_BARKS[zoneType];
  if (!pool || !pool.length) return null;
  const t = tokens || {};
  const start = pickIndex(index, pool.length) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const line = pool[(start + i) % pool.length];
    const resolved = line.replace(ZONE_CHATTER_TOKEN_RE, (_m, key) => (t[key] ? String(t[key]) : _m));
    if (!resolved.includes('{')) return resolved;
  }
  return null;
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
  POD_HUNT_BARKS,
  ORE_FLOOD_BARKS,
  DOCK_DEED_BARKS,
  TUMBLE_RAKE_BARKS,
  LAW_STEP_BARKS,
  FRONTIER_FIRST_NAMES,
  FRONTIER_LAST_NAMES,
  PASSENGER_WHY_LINES,
  PASSENGER_BEATS,
  barkFor,
  hullRecognitionBarkFor,
  historyBarkFor,
  witnessCrimeBarkFor,
  pursuitBarkFor,
  surrenderBarkFor,
  escapeTauntBarkFor,
  podHuntBarkFor,
  oreFloodBarkFor,
  tumbleRakeBarkFor,
  lawStepBarkFor,
  passengerBeatLine,
  witnessSeamLineFor,
  syncWitnessSeamVoice,
  TOURIST_HAIL_REGISTER,
  HAULER_REGISTER,
  touristHailFor,
  haulerRegisterBarkFor,
  trafficRoleHail,
  ZONE_CHATTER_BARKS,
  zoneChatterBarkFor,
};
