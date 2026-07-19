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

// The eight code faction ids, exported for validators/consumers.
export const BARK_FACTIONS = [
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
  'faction_quiet', 'faction_choir', 'faction_free', 'faction_vael',
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
  },

  // ── Meridian — smooth / mercantile ─────────────────────────────────────────
  faction_mts: {
    scan: [
      'Meridian Trade. Just confirming your account is in good standing. Nothing personal.',
      'Pinging your registry — call it market research. Hold still.',
      'Syndicate hail. We do like to know who we are doing business with.',
      'Account check. Your balance is healthy. The health of your competitors is on the board.',
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
    ],
  },

  // ── Drift — blue-collar / tired ────────────────────────────────────────────
  faction_dmc: {
    scan: [
      'Drift Collective. Just checking you ain’t claim-jumping. Long shift.',
      'Reading your hull. You lost, or you working?',
      'Miner’s hail. State your business, keep it short.',
      'Fourteenth shift this week. Reading your beacon. Try not to be interesting.',
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

export default { BARKS, BARK_FACTIONS, BARK_SITUATIONS, CONTACT_VOICE_REGISTERS, barkFor };
