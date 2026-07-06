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
    ],
    warn: [
      'You are entering a controlled corridor. Reduce speed or be cited.',
      'Advisory: your heading violates transit protocol. Correct it now.',
      'This is a Concord checkpoint. Present clearance or hold position.',
    ],
    'demand-cargo': [
      'Cargo seizure authorized under Ref 44-C. Cut your drive and prepare for boarding.',
      'Your goods are flagged for administrative review. Surrender them.',
      'Compliance is not optional. Jettison contraband for collection.',
    ],
    attack: [
      'Resistance noted. Escalating to enforcement action.',
      'You are now non-compliant. Ordnance authorized.',
      'Filing use-of-force report. Weapons free.',
    ],
    flee: [
      'Disengaging. Your registry has been flagged for follow-up.',
      'Pursuit suspended. This incident remains open, Ref 44-C.',
      'Withdrawing to reassess. The paperwork does not withdraw.',
    ],
    reinforce: [
      'Requesting patrol support. Additional units inbound.',
      'Escalation approved. Standby elements, converge.',
      'Backup dispatched. Maintain containment.',
    ],
    taunt: [
      'Every maneuver you make is being logged. All of it.',
      'You cannot outrun a filing.',
      'The fine accrues whether you comply or not.',
    ],
    'patrol-greeting': [
      'Concord Patrol on station. Keep your transponder lit and pass.',
      'Routine patrol. Nothing to see. Move along.',
      'Lawful transit acknowledged. Safe passage.',
    ],
  },

  // ── Meridian — smooth / mercantile ─────────────────────────────────────────
  faction_mts: {
    scan: [
      'Meridian Trade. Just confirming your account is in good standing. Nothing personal.',
      'Pinging your registry — call it market research. Hold still.',
      'Syndicate hail. We do like to know who we are doing business with.',
    ],
    warn: [
      'This lane carries a toll, friend. You have not paid it.',
      'You are trading in our territory without a license. That is a fee waiting to happen.',
      'Consider this a courtesy notice before it becomes an invoice.',
    ],
    'demand-cargo': [
      'Let us make a deal: your cargo, our terms. The alternative costs more.',
      'A small percentage of your hold and we forget we saw you. Reasonable, yes?',
      'Consider this an acquisition. The price is everything you are carrying.',
    ],
    attack: [
      'You should have paid. Now the markup applies.',
      'Regrettable. This will be itemized.',
      'Bad for business, but we do settle accounts.',
    ],
    flee: [
      'Pleasure not doing business. Your balance remains open.',
      'We will meet again. The Syndicate always collects.',
      'Withdrawing. Consider the account merely deferred.',
    ],
    reinforce: [
      'Calling in the collections team. Do stay put.',
      'Additional assets inbound. This is now a priority acquisition.',
      'Backup en route — the investment must be protected.',
    ],
    taunt: [
      'Everything has a price. Even you. Especially you.',
      'You cannot afford this argument.',
      'The house always wins, and we are the house.',
    ],
    'patrol-greeting': [
      'Meridian escort. Rates are fair, mostly. Fly safe.',
      'Trade lane secured. Keep your credits handy.',
      'Syndicate convoy passing. No fees today. Enjoy it.',
    ],
  },

  // ── Drift — blue-collar / tired ────────────────────────────────────────────
  faction_dmc: {
    scan: [
      'Drift Collective. Just checking you ain’t claim-jumping. Long shift.',
      'Reading your hull. You lost, or you working?',
      'Miner’s hail. State your business, keep it short.',
    ],
    warn: [
      'That’s a filed claim you’re drifting into. Back off, we don’t want trouble.',
      'Rock’s spoken for. Move along before somebody makes a thing of it.',
      'You’re in a worked belt. We already had a rough cycle. Don’t add to it.',
    ],
    'demand-cargo': [
      'Look, drop the ore and we’re square. Nobody wants to bleed over rocks.',
      'That load’s ours by rights. Hand it over and we all go home.',
      'You took from a claim. Give it back and we forget it. I’m too tired for this.',
    ],
    attack: [
      'Damn it. Fine. You want it the hard way.',
      'Should’ve just walked. Now I gotta file an incident too.',
      'Didn’t sign up for this today, but here we are.',
    ],
    flee: [
      'Not worth it. I’m going home. Keep the rocks.',
      'Pulling out. Ain’t dying over somebody else’s quota.',
      'Done. This one’s above my pay grade.',
    ],
    reinforce: [
      'Radioing the other rigs. Hang on, they’re coming.',
      'Getting the crew. We look after our own out here.',
      'Whistle’s up. The belt’s answering.',
    ],
    taunt: [
      'You ever done an honest day’s work? Didn’t think so.',
      'Big talk from somebody who never dug a rock.',
      'We been out here twenty cycles. You won’t last two.',
    ],
    'patrol-greeting': [
      'Drift rig, hauling. Mind the debris, friend.',
      'Just working the belt. You do you.',
      'Safe hauls out there. It’s a long way to anywhere.',
    ],
  },

  // ── Reach — predatory but under-armed ──────────────────────────────────────
  faction_reach: {
    scan: [
      'Crimson Reach. We been watching your heat signature for a while, friend.',
      'Nice hull. Bet it carries nice things. Sizing you up.',
      'Reach picket. Don’t mind us. We’re just... counting.',
    ],
    warn: [
      'This is our lane now. Turn around while you still can.',
      'You wandered into the wrong dark. Last warning.',
      'The Reach owns this stretch. Pay the crossing or don’t cross.',
    ],
    'demand-cargo': [
      'Everything in the hold, right now, and maybe you keep the ship.',
      'Cargo or your life. We’ll take the cargo either way.',
      'Drop it all. We’re not asking twice, and we barely asked once.',
    ],
    attack: [
      'Should’ve given us the cargo! Take him apart!',
      'Cut his engines! He’s worth more slow!',
      'Light him up before he calls it in!',
    ],
    flee: [
      'This one bites — break off, break off!',
      'Not worth the salvage. We’re gone!',
      'Scatter! There’s easier prey than this.',
    ],
    reinforce: [
      'Call the pack! Tell ’em there’s a fat one!',
      'Bring the whole nest, this one’s loaded!',
      'Reach! To me! We got a live one!',
    ],
    taunt: [
      'You’re already dead, you just haven’t filed it yet.',
      'Nice flying. Won’t save you.',
      'We eat ships like yours for the scrap.',
    ],
    'patrol-greeting': [
      'Reach territory. Keep moving and maybe we let you.',
      'You’re alive because we’re bored. Don’t push it.',
      'Passing through? Fast, then. Real fast.',
    ],
  },

  // ── The Quiet — terse / minimal ────────────────────────────────────────────
  faction_quiet: {
    scan: [
      'Seen.',
      'You’re logged.',
      'We know your face now.',
    ],
    warn: [
      'Wrong route. Leave.',
      'Not here.',
      'Turn back. No repeat.',
    ],
    'demand-cargo': [
      'The hold. Now.',
      'Give it. Quiet.',
      'Cargo. Or nothing.',
    ],
    attack: [
      'No more words.',
      'Done talking.',
      'Then this.',
    ],
    flee: [
      'Gone.',
      'Later.',
      'Not today.',
    ],
    reinforce: [
      'Others come.',
      'Not alone.',
      'Wait for them.',
    ],
    taunt: [
      'Loud ones die first.',
      'You talk too much.',
      'Predictable.',
    ],
    'patrol-greeting': [
      'Pass. Say nothing.',
      'We didn’t see you.',
      'Keep it quiet.',
    ],
  },

  // ── Ascendant Choir — zealot / ritual ──────────────────────────────────────
  faction_choir: {
    scan: [
      'The Choir observes. Your pattern is being read, pilgrim.',
      'We measure the resonance of your passage. Hold, and be known.',
      'A signal in the dark. The Ascendant hears all who approach.',
    ],
    warn: [
      'You tread on consecrated void. Withdraw before you are inscribed.',
      'This space is given to the Pattern. You are not yet part of it. Turn away.',
      'The shrine-lanes are not for the unascended. Depart.',
    ],
    'demand-cargo': [
      'Your burden is not yours. Offer it up and be lightened.',
      'What you carry belongs to the ascent. Release it willingly.',
      'Tithe your hold to the Pattern. Refusal is a kind of falling.',
    ],
    attack: [
      'You have chosen the fall. We deliver you to it.',
      'Unmade, then, and remade cleaner. Hold still.',
      'The Pattern demands your correction. It is given.',
    ],
    flee: [
      'The moment passes. The ascent does not. We will return.',
      'You are recorded in the Pattern now. Distance changes nothing.',
      'We withdraw. The reckoning is only deferred, never denied.',
    ],
    reinforce: [
      'Choir, converge. Let the chorus be complete.',
      'The faithful gather. Sing him into silence.',
      'More voices rise. The Pattern will not be denied.',
    ],
    taunt: [
      'You cling to a body the void has already claimed.',
      'Your struggle is a note in a song you cannot hear.',
      'Even your defiance is written into the Pattern.',
    ],
    'patrol-greeting': [
      'The Choir passes. May the Pattern find you worthy.',
      'Peace, unascended. Your time will come, or it will not.',
      'We sing on. Do not fear us today.',
    ],
  },

  // ── Free Frontier — independent / plainspoken ──────────────────────────────
  faction_free: {
    scan: [
      'Frontier relay. Just seeing who’s out here. No hassle.',
      'Reading your beacon. You friendly? We’re friendly.',
      'Free Frontier. We don’t bite unless bitten. Carry on.',
    ],
    warn: [
      'Heads up, that heading’s trouble. Might want to reroute.',
      'Not our rule, but folks around here won’t like you here. Just saying.',
      'You’re pushing into a rough patch. Free advice: don’t.',
    ],
    'demand-cargo': [
      'Look, times are lean. Spare some cargo and we part friendly.',
      'Not proud of this, but we need what you’re hauling. Make it easy.',
      'Hand over a share and nobody has a bad day. Your call.',
    ],
    attack: [
      'Alright, you asked for it. Hate that it came to this.',
      'Didn’t want this fight, but I’ll finish it.',
      'Fine. No hard feelings, but I’m shooting now.',
    ],
    flee: [
      'This ain’t worth it. Peeling off, good luck out there.',
      'Nope. Not dying today. We’re gone.',
      'Call it a draw. Fly safe, seriously.',
    ],
    reinforce: [
      'Getting the others on the line. Sit tight.',
      'Frontier folks stick together — help’s coming.',
      'Radioing the neighbors. Hang on.',
    ],
    taunt: [
      'You fly like you got somewhere better to be.',
      'Big system out here. Plenty of room to run.',
      'No shame in leaving, friend. Offer’s open.',
    ],
    'patrol-greeting': [
      'Frontier watch. Waystation’s open if you need it. Fly easy.',
      'All clear out here. Wave if you need anything.',
      'Just neighbors keeping an eye out. Safe travels.',
    ],
  },

  // ── The Vael — alien contract-language / formal ────────────────────────────
  faction_vael: {
    scan: [
      'Vael Consensus. Clause 1: your presence is registered. Await disposition.',
      'This-vessel initiates assessment. Your form is being appraised against terms.',
      'Contact acknowledged under provisional terms. State your standing.',
    ],
    warn: [
      'Clause 3: you occupy Vael-held space without instrument of passage. Void your position.',
      'Your continuance breaches the boundary-accord. Amend, or the accord amends you.',
      'The terms do not admit you here. Withdrawal is the offered remedy.',
    ],
    'demand-cargo': [
      'Clause 7: your holdings are subject to Vael claim. Render them to satisfy the term.',
      'The contents of your vessel are, by accord, forfeit. Deliver, and the ledger balances.',
      'Surrender the carried-mass. This settles the debt you did not know you incurred.',
    ],
    attack: [
      'Clause 9 invoked. The penalty is enacted upon your form.',
      'You have voided the terms. Enforcement is now this-vessel’s obligation.',
      'The accord permits correction. It is administered.',
    ],
    flee: [
      'The term is suspended, not dissolved. This-vessel withdraws.',
      'Clause 12: engagement lapses. The obligation persists in the ledger.',
      'Disposition deferred. Your entry remains in the accord.',
    ],
    reinforce: [
      'Consensus summoned. Additional-vessels enter the accord.',
      'The many are called. The term will be fulfilled in number.',
      'Clause of quorum invoked. More of this-kind converge.',
    ],
    taunt: [
      'Your resistance is a clause already anticipated and priced.',
      'You bargain against terms you cannot read.',
      'The ledger closes with or without your assent.',
    ],
    'patrol-greeting': [
      'Vael passage. The terms hold. You are permitted, for now.',
      'This-vessel transits under standing accord. No obligation falls to you today.',
      'Consensus observes. Your standing is neutral. Proceed.',
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

export default { BARKS, BARK_FACTIONS, BARK_SITUATIONS, barkFor };
