// src/data/special500/entries-interact-c.js — batch cat-interact-c (32 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-interact-c.json). This batch is the
// campaign's interactive core — encounter and oneoff-mission kinds — so every
// entry carries the schedulable tell (the hail, the first-sight line, the wire
// copy) on channel 'memory' with a followup naming the bespoke mechanic and its
// real seam file; the encounter-file track builds those legs against these
// memory receipts. Every receipt event was verified against `bus.emit(` in
// src/systems; every sector and proximity anchor is real (src/data/sectors.js,
// src/data/frontierRegions/west.js). Sector remaps: none — every consensus
// sector id exists. Hones applied: SP1-111 retitled "The Broodyard" per the
// unanimous hone; SP1-105 folds hones (a)/(b)/(c) — bids capped at jettisoned
// pocket change, the prize is one wire line reframed as a
// retraction-with-footnote, the original stays legible.

export const ENTRIES_INTERACT_C = [
  // SP1-120 — The Second Last Argument: the gambit you watched once, replayed on
  // a bigger mark by a shakier hand. Chained to the 901 siege-ark encounter by
  // its completion shape; the catalog rolls the sighting, the file gates it.
  {
    id: 'SP1-120',
    kind: 'encounter',
    title: 'The Second Last Argument',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'Numbered file gated requiresCompletedShape on 901-last-argument (src/data/encounters/901-last-argument.js, src/systems/lastArgument.js): the same gambit replays with a station fuel line as the mark; three-way outcome — end it quiet, end it loud, back the blackmailer for a currency of favors — via crSituationKit settleSituation.',
    payload: {
      text: 'Someone else is running the play you watched once: a lone hull, a final offer, a very calm voice about consequences. Only this time the mark is a whole station\'s fuel line, the offer is worse, and the speaker\'s gun-arm is trembling where your scan can see it. You know how this argument ends. They do not.',
    },
  },

  // SP1-019 — The Runner at the Ring: the customs hold becomes a pursuit
  // corridor while you are standing in it. The scan hold is the catalog trigger.
  {
    id: 'SP1-019',
    kind: 'encounter',
    title: 'The Runner at the Ring',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'player:scannedByPatrol' },
    channel: 'memory',
    followup: 'Numbered selfRegistered file at the Tally: the pursuit is real AI — vignetteInterpreter chase motion for the runner, Concord cutters on patrol doctrine (src/ai/doctrine.js); block him with your hull (Concord rep, contraband reward), wave him through (Quiet thanks, flag), or hold position and watch.',
    payload: {
      text: 'Mid-scan, a smuggler blows the checkpoint at full burn with two cutters peeling off after him. The examiner\'s voice goes flat mid-count: "Hold position. This is now a pursuit corridor." Your hull is parked square in it.',
    },
  },

  // SP1-033 — The Vulture Ring: six patient scavengers and one dying ship, and
  // the terms of the split, offered politely before anything pops.
  {
    id: 'SP1-033',
    kind: 'encounter',
    title: 'The Vulture Ring',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with the vulture orbit (vignetteInterpreter MOTIONS \'vulture\') and persistent outcome flags: join the ring and share, kill the ship early and own the wreck while the belt remembers, or defend the dying ship — a stranger\'s life for rep everywhere.',
    payload: {
      text: 'Six scavenger hulls hold a patient orbit around a dying ship — nobody fires, everybody waits. One of them hails you, conversational: "Rule\'s simple. It pops, we split. You want in, you hold station. You want the whole thing, that\'s a different conversation."',
    },
  },

  // SP1-038 — The Slag Diver: a local legend flies her impossible line on
  // purpose, visibly, and leaves room in it for one more fool. Anchored at the
  // Burn Lamp, the field's own radiation-rim marker.
  {
    id: 'SP1-038',
    kind: 'encounter',
    title: 'The Slag Diver',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_burn_lamp', wu: 900 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with a fixed seeded waypoint line and hazard window (uniqueWrecks timingGate precedent, src/data/uniqueWrecks.js): fly her line into the Roaming Burn\'s vent window for the second cache — she keeps the first and toasts you at the bar — or fail, and she tows YOUR hull out and adds the debt to the same ledger.',
    payload: {
      text: 'The legend herself, doing it on purpose: her scow drops into the Burn\'s vent window to skim a half-molten cache, and her route is visible the whole way down — bloom-lit, smoking, exactly survivable if you fly it perfectly. She does not look back to see if anyone is fool enough to follow. She leaves room, though.',
    },
  },

  // SP1-039 — The Prop Wreck: the distress that reads wrong on the second
  // look. The scan is the trigger; the nest is the leg.
  {
    id: 'SP1-039',
    kind: 'encounter',
    title: 'The Prop Wreck',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Numbered file script \'distress\' with custom scan_tell lines (ENCOUNTER_BARKS distress block precedent, src/data/encounters.js): spot the tell before the spring and leave clean with sellable proof, or spring it — a close-quarters fight where the wreck itself is cover for both sides.',
    payload: {
      text: 'One of the wrecks out here scans perfectly dead — except for a heat bloom where no engine should be, and a hull breach that was welded from the inside. The distress call is a recording. The wreck is crewed. You are already inside their mine envelope; count the mines before you count the salvage.',
    },
  },

  // SP1-111 — The Broodyard (retitled from "Brood Mare" per the unanimous
  // hone): a capital hull whose fight is subsystem destruction — the racks,
  // not the hull.
  {
    id: 'SP1-111',
    kind: 'encounter',
    title: 'The Broodyard',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'station_ashcache', wu: 1800 },
    channel: 'memory',
    followup: 'Capital-boss-adjacent numbered encounter on the subsystem pattern (src/systems/capitalBossEncounters.js) with rack targets: each rack pops like a pinata and the swarm thins by arithmetic; the emptied hull surrenders by powering down and pays an intact spawn-rack module nobody else has.',
    payload: {
      text: 'A capital hull that isn\'t fighting — it\'s farming: rack after rack of live wasps rolling off a carousel deck while the crew works between them like it\'s harvest. Every instinct you have about capital hulls is wrong here. The hull is the barn. The racks are the animal.',
    },
  },

  // SP1-167 — The Efficiency Audit: a Fulfillment auditor that is warm, correct,
  // and wants — visibly, joyfully — to fix you.
  {
    id: 'SP1-167',
    kind: 'encounter',
    title: 'The Efficiency Audit',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_ceres', wu: 1400 },
    channel: 'memory',
    followup: 'Numbered ambient encounter reading fitted modules (src/core/fittedModules.js) against usage stats: accept and get a real refit recommendation that is actually good, or decline politely and stay marked AWAITING OPTIMIZATION — it checks back, forever, kindly.',
    payload: {
      text: 'A Fulfillment surveyor hails on the approach, warm as a heating vent: "Two of your modules overlap functionally, one is six percent under-rated, and you carry cargo capacity you have never once used. Everything I have said is true. May I fix you?"',
    },
  },

  // SP1-072 — The Genuine Article: the distress in the belt that has burned you
  // twice, which is real this once. The bait counter is the leg; the call is
  // the catalog trigger.
  {
    id: 'SP1-072',
    kind: 'encounter',
    title: 'The Genuine Article',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'distress:call' },
    channel: 'memory',
    followup: 'Numbered file script \'distress\' with counter-gated tell lines — fires only after the persistent bait counter in story.flags passes two escaped bait distresses in-sector: a second scan pulse, deliberately, finds the real heartbeat under the fake signature; the rescue pays double reputation because you risked it on a read.',
    payload: {
      text: 'Another distress ping out of the same belt that has burned you twice as bait. It scans wrong the same way, right down to the signature. Except this once, buried under the fake, there is a real crew with an old decoy transmitter, praying you are not as burned as you should be.',
    },
  },

  // SP1-117 — The Counter-Contract: your hunter arrives, and so does his.
  {
    id: 'SP1-117',
    kind: 'encounter',
    title: 'The Counter-Contract',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Numbered file script \'bountyHunter\' variant (src/data/encounters/040-bounty-hunter.js) spawning a second hunter squad keyed to live bounty state (src/systems/bountyHunt.js): a three-way fight where any pair can ally for the moment, deliver the writ-holder\'s wreck to the rival for double, or watch two professionals duel and sell the story later.',
    payload: {
      text: 'Your hunter\'s approach gets interrupted — professionally — by a second hunter who hails YOU, not him: "Ignore the writ. I pay better for the writ-holder\'s hull. Or just stay out of my firing line. Either way." The contract has a contract on it now.',
    },
  },

  // SP3-027 — Plunge Runners: market-day heat-treat divers working the Anvil
  // reentry band, on the same physics you fly.
  {
    id: 'SP3-027',
    kind: 'encounter',
    title: 'Plunge Runners',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'calendar:marketDay' },
    channel: 'memory',
    followup: 'Zone presence row (src/data/sectorZones.js, P.raiders-style) with a custom route plus the existing reentry heat model (src/data/planets.js) — the divers fly the player\'s own physics on the second watch of market days: follow and survive to reach the band\'s-edge vendor for a discounted heat-treated commodity and a codex entry.',
    payload: {
      text: 'Three lightly-built hulls dive the Anvil reentry band in a chain, plasma sheaths lighting their bellies white-orange, then pull out trailing ember smoke and sell to a hauler holding off the edge. Heat-treated stock, market-day price. They fly it on the same physics you do, and the band does not care who any of you are.',
    },
  },

  // SP1-035 — The Jumped Seam: a beacon slapped onto your asteroid mid-cut.
  // Mining the seam is the catalog trigger; the claim gate is the leg.
  {
    id: 'SP1-035',
    kind: 'encounter',
    title: 'The Jumped Seam',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'mining:start' },
    channel: 'memory',
    followup: 'Numbered file on script \'claimThreat\' (src/data/encounters/050-claim-threat.js) with a beacon-as-prop and attachments tug-of-war logic, claims read via state.claims (gates.claimsOnly — the player owns the in-sector claim): physically pull the beacon, pay them off, or let it ride into a claim-defense war.',
    payload: {
      text: 'Mid-cut, a jackal hull screams past and slaps a rival claim beacon onto YOUR asteroid with a harpoon. "Registered before yours expired. Check the paperwork. Oh — you can\'t. I have it."',
    },
  },

  // SP1-194 — The Interest: the deal you refused, matured, returned with
  // better terms and a person attached.
  {
    id: 'SP1-194',
    kind: 'encounter',
    title: 'The Interest',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Refusal records in story.flags plus a matured-deal numbered encounter, uniqueOnce per bargain: the same deal with better terms and real safety included, from a counterpart who has earned the yes; refuse a second time and they accept it gracefully, once, as a person would (exit flag).',
    payload: {
      text: 'The counterpart from the deal you refused finds you — not hostile, thorough: "You said no. Fair. I\'ve had time to think about why. I\'ve raised the offer, and I\'ve brought the thing you\'d have needed to do it safely. I want this DONE."',
    },
  },

  // SP1-067 — The Tailings Fire: a physics rescue with a four-minute clock and
  // one very useful massline. Anchored off the Belt Outpost approach.
  {
    id: 'SP1-067',
    kind: 'encounter',
    title: 'The Tailings Fire',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_beltout', wu: 1500 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with a burning prop on a real drift vector and a massline-physics rescue: tow or shove the pile clear before it cooks the three-habitat camp; the camp\'s gratitude is a permanent dock discount and the best fuel in the belt.',
    payload: {
      text: 'A volatile tailings heap has self-ignited next to a three-habitat camp, and the camp\'s own tug is too small to move it. The burning pile is drifting — slowly, at walking pace — toward the habitats. You have maybe four minutes and one very useful massline.',
    },
  },

  // SP1-109 — The Ring Rules: an honest 1v1 inside a hard-light circle, with a
  // chalk tally that remembers how you won. Anchored at the Marked Rock.
  {
    id: 'SP1-109',
    kind: 'encounter',
    title: 'The Ring Rules',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_marked_rock', wu: 700 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with a pd_screen boundary prop (331-pd-screen-wall.js tech) and a single-spawn rule, purse via d.grant: an honest 1v1 with a real purse — win inside the ring and even their pack respects it (a chalk on the tally); win by cheating and every pack in the sector treats it as a debt.',
    payload: {
      text: 'A circle of rocks with a hard-light boundary and a posted rule in three languages: one hull each, inside the ring, anything goes, nobody\'s friends intervene. A Reach commander is already inside, waiting for someone worth the fuel. The tally chalked on the ring stone is long, and legible.',
    },
  },

  // SP2-182 — The Bond Audit: the clamp meets a perfect record and escalates
  // to the only supervisor available.
  {
    id: 'SP2-182',
    kind: 'encounter',
    title: 'The Bond Audit',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'player:scannedByPatrol' },
    channel: 'memory',
    followup: 'Clamp hold check plus lawful-state read (zero flags, zero contraband, zero debt) and one inventory item: presenting the triplicate apology at any desk waives one future clerical delay; flag clamped_the_clamp.',
    payload: {
      text: 'The clamp inspects a perfect record and does not know what to do: "MANIFEST: CLEAN. SEAL: TRUE. DEBT: NONE. ANOMALY. ESCALATING TO SUPERVISOR. SUPERVISOR: YOU. SELF-AUDIT: [STAMP]." It releases you with an apology. In triplicate.',
    },
  },

  // SP1-070 — The Relay Chain: the crew you saved, saved again, by their own
  // admission a franchise.
  {
    id: 'SP1-070',
    kind: 'encounter',
    title: 'The Relay Chain',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescue:complete' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter gated on the prior rescue outcome (crSituationKit priorOutcome \'rescued\'; roster memory via state.story.flags): the second rescue earns a permanent employer dock discount, and the radio traffic between rescues starts treating you as their personal roadside service.',
    payload: {
      text: 'A mayday comes in, and the voice is one of the crew you saved — different ship, different sector, same luck. "I know. I KNOW. It\'s not a curse, it\'s a franchise. Please."',
    },
  },

  // SP1-044 — The Corner: three traders, one refinery order, and the queue
  // that tells the truth the board won't. Market day is the price event.
  {
    id: 'SP1-044',
    kind: 'oneoff-mission',
    title: 'The Corner',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'calendar:marketDay' },
    channel: 'memory',
    followup: 'Authored mission on the economyContracts seams (src/systems/economyContracts.js) reading the economyCycles schedule: buy first and the three pay you to step aside, escort all three and be owed by a syndicate, or beat them to the refinery and sell into the spike yourself.',
    payload: {
      text: 'Three independent traders are all quietly buying the same commodity for the same reason — a refinery order due tomorrow. The board doesn\'t say this. The queue at the exchange does: nobody is selling, everybody is watching everybody.',
    },
  },

  // SP2-144 — The Stowaway Cache: five days out, the hold rattles once, and
  // the game's own loss ledger pays rent.
  {
    id: 'SP2-144',
    kind: 'oneoff-mission',
    title: 'The Stowaway Cache',
    sectors: [],
    trigger: { type: 'simWindow', startS: 3000, endS: 3600 },
    channel: 'memory',
    followup: 'Loss-ledger read (contactDeedMemory / impound records) plus a one-shot hold event, gated in the leg on an undocked streak of five days: the lost item returns from the real loss record; flag latchchild_rent; Latch-Child\'s wreck-tidying in your sectors improves one grade.',
    payload: {
      text: 'A quiet rattle in the hold resolves into a stowaway: a feral salvage automaton, Latch-Child\'s make, that has been living aboard and tidying. It leaves one item as rent — the thing you lost early and never recovered — tag reading: "ORIGIN LAPSED. RENT PAID. GOOD HOLD."',
    },
  },

  // SP1-166 — The Read Fee: the Archive reconstructs the last sixty seconds of
  // any wreck, and the paragraph is never about what you asked.
  {
    id: 'SP1-166',
    kind: 'oneoff-mission',
    title: 'The Read Fee',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'scan:wreckInvestigated' },
    channel: 'memory',
    followup: 'Per-wreck read service keyed to wreck-scan events (repeatable per wreck), fee via d.charge, fragments via src/data/codexPages.js: honest-method lore ("the galley\'s coffee pot was still warm; impact came from above"), a codex page per read, and the Archive\'s debt of gratitude after ten.',
    payload: {
      text: 'The Archive offers the strangest service in the belt: pay the fee and their readers reconstruct the last sixty seconds of any wreck\'s existence from hull stress, log fragments and powder burns. One paragraph. It is always about something you didn\'t ask.',
    },
  },

  // SP1-088 — The Wreck Deed: an auction whose fine print is the event. You
  // are not buying a ship; you are buying an argument.
  {
    id: 'SP1-088',
    kind: 'oneoff-mission',
    title: 'The Wreck Deed',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Authored chain — auction leg plus a claim-defense leg reusing the claim_threat script; hull reward via a disabled entity grant (1210-the-deadweight pattern): win the auction, defend or settle the claim physically, deliver the deed intact, and the capital-adjacent hull is yours to strip or register.',
    payload: {
      text: 'The auction of a legendary wreck is posted, and the fine print is the event: delivery within the week, current possession "contested by all previous bidders, who have been notified." You are not buying a ship. You are buying an argument.',
    },
  },

  // SP2-148 — The Smuggler's Confession Booth: the Den's back room, one
  // minute, no recording kept. Everyone knows the recording is kept.
  {
    id: 'SP2-148',
    kind: 'oneoff-mission',
    title: "The Smuggler's Confession Booth",
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Room offer via src/ui/station/barContacts.js (fires on the first dock after three-plus stolen lots sold) plus the heat seam and one delayed band line keyed to a day window: take the minute for flag weight_off and a one-time heat -3 — the room heard it; the room settled it.',
    payload: {
      text: 'The Den\'s back room hosts an anonymous "weight off" service: dictaphone, one minute, no name, no recording kept. The room\'s joke is that everyone knows the recording is kept. Yours, if you take the minute, comes back to you weeks later as a single line of band chatter only you will recognize.',
    },
  },

  // SP1-174 — The One Favor: the Frontier doesn't recruit; it buys you a drink
  // and tells you the truth. Anchored off Reach Station, the free faction's floor.
  {
    id: 'SP1-174',
    kind: 'oneoff-mission',
    title: 'The One Favor',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'station_reach', wu: 1200 },
    channel: 'memory',
    followup: 'Authored mission via the missions.js authored pattern (fallback numbered selfRegistered job chain), rep gate on faction_free — fires when Frontier rep crosses zero from either side: a genuinely hard job whose briefing names every risk correctly; refusing is honored forever; accepting makes the Frontier yours and you theirs.',
    payload: {
      text: 'The Frontier doesn\'t recruit. A recruiter buys you one drink and explains the actual arrangement: "One job. You can say no. If you say no, we\'ll like you anyway, and this conversation never happened. If you say yes, you\'re one of ours until the job\'s done — and the job is real."',
    },
  },

  // SP1-105 — The Null Auction: a ring of hulls bidding on nothing, solemnly.
  // Folds all three hones: pocket-change bids; the prize is one wire line's
  // reframing as a retraction-with-footnote; the original stays legible.
  {
    id: 'SP1-105',
    kind: 'oneoff-mission',
    title: 'The Null Auction',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with jettisoned-credit bids capped at pocket change and a news rewrite via news:publish with sourceRef override (history pool from deedRecord): the winning bid buys one seeded event\'s next wire mention reframed as a retraction-with-footnote — the original line stays legible somewhere, because this world keeps receipts.',
    payload: {
      text: 'A ring of hulls bidding on nothing. No lot, no seller, no cargo — only a price climbing a public board, paid in jettisoned credits, with total solemnity. When you hail, the answer is serene: "The lot is the auction. Everything is the lot. You are early; the lot has not been chosen."',
    },
  },

  // SP1-065 — The Belt Strike: the new toll lands on Tally Eve, the books-close
  // day customs itself dreads, and the miners hold a physical picket line.
  {
    id: 'SP1-065',
    kind: 'oneoff-mission',
    title: 'The Belt Strike',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 38, windowS: [0, 600] },
    channel: 'memory',
    followup: 'Numbered encounter pair reading a shared story flag, consequences via faction rep intents (d.rep) and economy notes: haul for the company (pay, miner resentment) or run supply through the picket for the union (rep, company resentment); either way prices and patrols visibly shift for days.',
    payload: {
      text: 'Belt miners have downed tools over the new toll and are holding a physical picket line across the lane — beacons, banners, and a pot of the worst coffee in the belt. The company is hiring non-union haulers. Both sides posted. The band is a mess.',
    },
  },

  // SP2-159 — The Hyperion Cell Debt: three late cell runs at the Cut Claim
  // Outpost and the crews make you crew. Purchase counter is the leg.
  {
    id: 'SP2-159',
    kind: 'oneoff-mission',
    title: 'The Hyperion Cell Debt',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'memory',
    followup: 'Purchase counter (fuel-cell buys at station_hyperion_claim, three visits running) plus a pricing flag and one inventory item — the roster, every regular\'s name on it: permanent crew pricing on fuel cells at that station (-15%); flag crew_priced.',
    payload: {
      text: 'The claim crews take up a collection — for you: "You keep buying dear because you buy late. Here is the roster. First cell run each shift is crew-priced. Bring the rack, we fill it first. You are crew-priced now. Do not tell the desk."',
    },
  },

  // SP1-074 — The Reactor Ferry: tow the dying ship that cannot dock, with the
  // countdown audible the whole way. Anchored off the Ruined Cache Station.
  {
    id: 'SP1-074',
    kind: 'oneoff-mission',
    title: 'The Reactor Ferry',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'station_ashcache', wu: 1500 },
    channel: 'memory',
    followup: 'Authored tow mission posted on a seeded reactor-casualty event, with a sim-time fuse (deadlineS plus a visible countdown) and a real explosion on failure via lootShards — visible from the colony and remembered by it; success pays from three directions: crew, company, colony.',
    payload: {
      text: 'A freighter\'s reactor is in cascade and the ship cannot dock — docking means the station eats the blast. The posting is one line long: tow the whole dying ship to a disposal trajectory while her crew shuttles off. Every second of the tow, the reactor\'s countdown is visible and audible.',
    },
  },

  // SP1-126 — The Deadweight Derby: a tow race where the physics is the
  // opponent. Anchored off the Forge Outlying Yard.
  {
    id: 'SP1-126',
    kind: 'oneoff-mission',
    title: 'The Deadweight Derby',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_vesta_outlying_yard', wu: 1200 },
    channel: 'memory',
    followup: 'Race mission posted at the yard on off-shifts (repeatable) with a mandatory latched tow prop on the course, hulk props from src/data/wreckClasses.js: prizes scale with hulk intactness at the line, and the yard re-sells your "raced" hulk with a plaque.',
    payload: {
      text: 'The derby is simple: everyone races towing a yard-supplied dead hulk, and the hulks are all worse than yours. Winning is less about thrust than line discipline — every towed swing through the refinery shallows is a fresh chance to lose the whole thing.',
    },
  },

  // SP1-127 — The Credible Loss: a race scored in reverse. A prior race win is
  // the catalog trigger; the inverted bands are the leg.
  {
    id: 'SP1-127',
    kind: 'oneoff-mission',
    title: 'The Credible Loss',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'race:ended' },
    channel: 'memory',
    followup: 'Race mission with inverted scoring bands (rewards on the near-miss) and a fixed-line autopilot rival (combatDoctrine): throw it cleanly — harder than winning — for triple pay, or win honestly and he doubles your fee out of respect for the insult.',
    payload: {
      text: 'A rich kid\'s offer, itemized: race my autopilot, lose by less than a length, no crashes, one take. "Father thinks the ship is cursed. It is not cursed. It is embarrassing. Fix the STORY." The success condition is a photo finish you must lose on purpose.',
    },
  },

  // SP1-054 — The Perishable Sprint: the produce run every hull hears at the
  // same moment, with the cargo visibly frosting as the clock runs.
  {
    id: 'SP1-054',
    kind: 'oneoff-mission',
    title: 'The Perishable Sprint',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.08 },
    channel: 'memory',
    followup: 'Delivery contract with a real decay on the commodity state (economyContracts + economyCycles; fallback numbered encounter with deadlineS): triple rate inside the window, the colony\'s market stock visibly recovers, latecomers sell at normal rate to a grateful-but-broke dome.',
    payload: {
      text: 'A colony agri-dome had a blower failure. The station posts a produce run at triple rate, the produce visibly frosts as the clock runs, and every hull in the sector hears the same posting at the same moment.',
    },
  },

  // SP1-130 — The Wrong Way: racing the debris stream upstream, and the run
  // itself is the survey the salvors are paying for. Storm season is the
  // drift-season trigger.
  {
    id: 'SP1-130',
    kind: 'oneoff-mission',
    title: 'The Wrong Way',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'calendar:stormSeason' },
    channel: 'memory',
    followup: 'Race mission (repeatable through the season) whose run produces a real, sellable map of the stream\'s slow lanes — a persisted record the navigation leg reads via the map seam (src/ui/map/), salvor purse via d.grant: the map makes the upstream route permanently faster for everyone.',
    payload: {
      text: 'The debris stream flows one way at a walking pace, and the locals race it wrong-way — upstream through the grains, drafting between the big rocks where the current slackens, for a purse the salvors put up because they want the stream mapped at speed.',
    },
  },

  // SP2-177 — The Misdeclared Freight: Kessler's stamp on a nineteen-year-old
  // order, and a waybill that stops mid-word. The scan is the trigger.
  {
    id: 'SP2-177',
    kind: 'oneoff-mission',
    title: 'The Misdeclared Freight',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Scan context plus a delivery mission to poi_helios_pit_line and a codex overlay ("For —"): deliver it as-is and the crew fund\'s beneficiary is found — a retired scale clerk — completing a nineteen-year-old order; Tycho standing +5.',
    payload: {
      text: 'The misdeclared freight\'s seal carries Kessler\'s scale-stamp — the exact stamp, one scale, one clerk, nineteen years. It is not contraband; it is a surprise: alloy ordered in secret by a crew fund, misdeclared to dodge the desk fee, delivered to the wrong bay on the day everything stopped. The waybill\'s last line is unfinished: "FOR —"',
    },
  },

  // SP3-034 — The Band Survey: four buoys, four hysteresis band edges, and the
  // planet drawn in lamps. Storm season is the offer window.
  {
    id: 'SP3-034',
    kind: 'oneoff-mission',
    title: 'The Band Survey',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'calendar:stormSeason' },
    channel: 'memory',
    followup: 'src/data/landmarkMissions.js row family offered at station_customs, with beacon props (place_lane_beacon precedent) and band predicates from src/data/planets.js PLANET_SITE bands (reentry/danger/skim/sling): drop one buoy at each Anvil band edge; the four rings pulse once, together — planetary band map codex entry plus a small bonus.',
    payload: {
      text: 'Honest work with a view: drop one buoy at each of the Anvil\'s four band edges — reentry, danger, skim, sling — and each one lights when its boundary\'s hysteresis band crosses it. The last buoy\'s light lands on the first\'s, and the four rings pulse once, together. The planet, drawn in lamps.',
    },
  },
];
