// src/data/special500/entries-interact-b.js — batch cat-interact-b (32 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-interact-b.json). These are the
// encounter and oneoff-mission kinds — standoffs, rescues, chases, offers,
// judgment calls — so nearly every core mechanic is bespoke-interactive (an
// NPC that must actually spawn and fly, a choice UI, a vendor, a towable prop)
// and rides channel 'memory' with a followup naming the mechanic and its real
// seam file; the encounter-file track builds each leg against the recorded
// receipt. Every receipt trigger names a bus event verified against a src/
// systems emit site; every sector and anchor id is real (src/data/sectors.js
// + src/data/frontierRegions/*). All consensus sectors were real —
// sector_triton_wake (east pack) and sector_nyx_march (west pack) assemble
// into SECTORS — so no remaps were needed.

export const ENTRIES_INTERACT_B = [
  // SP1-026 — The Mole's Handoff: a customs cutter and a Quiet ghost hull
  // share forty silent seconds at the edge of scan range.
  {
    id: 'SP1-026',
    kind: 'encounter',
    title: "The Mole's Handoff",
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.04 },
    channel: 'memory',
    followup: "Numbered file script 'whisper' with a scan tell (DIST_TELL_R pattern, src/systems/encounterScripts.js): scan during the forty-second drift reads the hold-vs-mass mismatch; then choose — report it (Concord rep, flag mole_reported pulls the cutter from the customs rotation) or sell the observation to the ghost (a stolen scan schedule: story flag the patrol planner reads to keep patrols off the player for one day).",
    payload: {
      text: 'At the edge of scan range, a customs cutter sits alongside a Quiet ghost hull for exactly forty seconds, says nothing on any band, and both leave. Scanned inside that window, the cutter\'s hold reads empty and its mass does not. Nobody on the customs roster is scheduled to be there.',
    },
  },

  // SP1-029 — The First-Rights Picket: scavengers ring a fresh wreck with
  // beacon-banners that honestly read FIRST LINE HOLDS.
  {
    id: 'SP1-029',
    kind: 'encounter',
    title: 'The First-Rights Picket',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_driller', wu: 1500 },
    channel: 'memory',
    followup: "Claim-contest variant of the numbered-file claimThreat script (src/systems/encounterScripts.js; src/data/encounters/050-claim-threat.js is the family base): cross the picket and the crew fights (worse armed than it acts); hold off 60 s and the lead pays a third of the salvage pool as a finds-fee; leave and return the next day to find the wreck cleanly stripped (per-wreck flag).",
    payload: {
      text: 'Five beacon-banners ring a fresh wreck, codes honestly reading FIRST LINE HOLDS, and one old hull sits parked nose-in to the prize like a dog on a bone. The scavenger crew is worse armed than it acts, and it knows you can see that.',
    },
  },

  // SP1-043 — The Drafter: a mule hauler rides your wake and offers the gate
  // toll as payment.
  {
    id: 'SP1-043',
    kind: 'encounter',
    title: 'The Drafter',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Ambient numbered encounter with a speed/position check (matched velocity 30 WU astern for 20 s, src/systems/encounterScripts.js): accept the toll trade — d.grant/d.charge credit transfer, the drafter added to the band as a named acquaintance — or refuse and she peels off with dignity intact (bark, no grudge).',
    payload: {
      text: 'A mule hauler settles in thirty WU behind your wake and rides it, visibly saving burn, matched to your every correction. When you finally hail her, she is unashamed: "Your wake, my range. I\'ll cover the next gate\'s toll for it." Everyone does this. Nobody admits it first.',
    },
  },

  // SP1-045 — The Reefer Handoff: a venting volatile reefer, a hauler who
  // cannot dock with it, and one watch to move it.
  {
    id: 'SP1-045',
    kind: 'encounter',
    title: 'The Reefer Handoff',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_forge', wu: 1500 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter spawning a fragile venting prop pod on a one-watch timer (fragileCargo patterns, src/systems/fragileCargo.js): deliver to the Forge refinery for the container\'s whole margin and a recurring named hauler; fail and the venting writes a harmless but humiliating ice cloud (cosmetic one-shot keyed to the memory receipt).',
    payload: {
      text: 'A hauler hails with the one problem you cannot ignore: a volatile reefer is venting and she cannot dock with it aboard. "Take it. Run it to the Forge before the watch turns and I\'ll pay the container\'s whole margin." The container is visibly frosting over.',
    },
  },

  // SP1-057 — The Seam Singer: an old prospector who surveys by throat.
  {
    id: 'SP1-057',
    kind: 'encounter',
    title: 'The Seam Singer',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_hot_face', wu: 1200 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with an audio-cue prop (the tone echoes differently off ore than rock; audio leg keys on the same memory receipt): follow the song\'s echo to a rich co-mining site — she cracks, you haul, honest split via mining yield events; her song later buyable as a rig tune (permanent small survey buff, src/data/modules.js module or trait).',
    payload: {
      text: 'An old prospector works the face alone, singing — a slow tonal pulse from her rig that comes back off ore bodies differently than it comes back off rock. "The belt lies to instruments. It never lies to a tuned throat." Her own gear cannot crack the vein her song found. Following the echo is the only survey that will.',
    },
  },

  // SP1-012 — The Maroon: a pirate the pack marooned for skimming, selling
  // the pack's next ambush plan for a ride to a bar.
  {
    id: 'SP1-012',
    kind: 'encounter',
    title: 'The Maroon',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with a tetherable pod prop the player tows (tetherable: true, beacon-tow precedent; barks table in the file, src/systems/encounterScripts.js): ferry him for a future-ambush forewarning flag plus bar gossip, leave him, or hand him to a passing pack (Reach rep intent).',
    payload: {
      text: 'A lone escape pod, one survivor: a pirate the pack marooned for skimming. "They left me the air I\'d stolen. That\'s Reach arithmetic." He will trade the pack\'s next ambush plan for a ride to anywhere with a bar.',
    },
  },

  // SP1-069 — The Air Auction: a genuine distress, and a Reach "rescuer" who
  // hails the victims first with a price list. distress:call is the traffic
  // distress emit (src/systems/trafficRoleOps.js).
  {
    id: 'SP1-069',
    kind: 'encounter',
    title: 'The Air Auction',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'distress:call' },
    channel: 'memory',
    followup: 'Numbered file script \'distress\' variant with a second responder squad spawned by the same runtime (src/data/encounters/100-distress-call.js family): outbid, outrun, or outfight the Reach collector; rescue without payment for faction-wide gratitude plus a named family that writes later, or let the Reach have it and hear about it in bars for years (deedRecord tag).',
    payload: {
      text: 'A stranded freighter is down to its last watch of air, and arriving from the opposite bearing is a Reach "rescuer" who hails the victims first — with a price list. The victims transmit both offers to you, in the clear, hoping market pressure helps them.',
    },
  },

  // SP1-096 — The Courtesy: a quiet ghost flies perfect formation, drops
  // exactly enough fuel, and never says a word. encounter:receipt is the
  // encounter-outcome emit (src/systems/encounterDirector.js); the no-fire
  // counter is the bespoke gate.
  {
    id: 'SP1-096',
    kind: 'encounter',
    title: 'The Courtesy',
    sectors: [],
    trigger: { type: 'receipt', event: 'encounter:receipt' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter keyed to a no-fire counter in state.story.flags (three hostile encounters left without firing; cache prop via beacons, quiet_ghost archetype passive behavior): the ghost drops a cache sized honestly from the distance to the next station; the courtesy repeats once more at a count of ten, then never again — restraint has a budget too.',
    payload: {
      text: 'A quiet ghost falls in off your wing and flies perfect formation for sixty seconds — matching every burn, holding exactly station — then drops a small sealed cache and is gone without one word on any band. The cache holds exactly enough fuel to reach the next station.',
    },
  },

  // SP1-110 — The Heir: the pack requires a conclusion, not a grudge.
  // encounter:namedCaptainDefeated is the scripted-captain defeat emit
  // (src/systems/encounterScripts.js).
  {
    id: 'SP1-110',
    kind: 'encounter',
    title: 'The Heir',
    sectors: [],
    trigger: { type: 'receipt', event: 'encounter:namedCaptainDefeated' },
    channel: 'memory',
    followup: 'NamedHunter file variant chained on the defeat receipt, arriving 2-5 sector-days after the kill (src/systems/encounterScripts.js namedHunter script; heir entry added to the NAMED_CAPTAINS roster pattern in src/data/encounters.js): better escorts, worse experience; defeat closes the file — future pack encounters open with respect (visible bark change via priorOutcome) — and letting the heir escape keeps it open for one better return.',
    payload: {
      text: 'A formal hail, of all things: "I am {name}\'s heir. The pack requires a conclusion, not a grudge. The paper says you killed well. The paper says I inherit. One of us is about to be right." The escorts are better than the old captain\'s were. The experience is not.',
    },
  },

  // SP1-118 — The Professional: three escapes from the same hunter earns the
  // mid-pursuit pension offer. encounter:receipt carries the escape outcome
  // (src/systems/encounterDirector.js resolve(live, 'escaped')).
  {
    id: 'SP1-118',
    kind: 'encounter',
    title: 'The Professional',
    sectors: [],
    trigger: { type: 'receipt', event: 'encounter:receipt' },
    channel: 'memory',
    followup: 'NamedHunter variant keyed to a per-captain escape counter in state.encounterDirector.named (NAMED_CAPTAINS state precedent; src/data/encounters/060-named-hunter.js): the third escape from the SAME captain triggers the mid-pursuit choice UI — split voids the writ, pays both, and the hunter becomes a bar story that follows you; refuse and win the fourth round and the hull genuinely retires either way (that is the code).',
    payload: {
      text: 'The hunter who has chased you across three sectors and three escapes finally hails mid-pursuit, winded and honest: "You\'re the first hull to make me look bad three times. That\'s a pension problem. Last offer: split the writ, and we both retire rich."',
    },
  },

  // SP1-086 — The Honor Guard: two drones still patrolling a warship's wreck
  // under rules of engagement announced in a voice forty years dead.
  {
    id: 'SP1-086',
    kind: 'encounter',
    title: 'The Honor Guard',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with per-zone ROE (setEntityDoctrine per-entity, src/ai/doctrine.js; src/data/encounters/1207-the-witnessed-price.js is the doctrine-scene precedent): salvage the allowed sections freely (the drones mark your respect in their log), touch a crew area and they escalate precisely, not lethally — they take the module back.',
    payload: {
      text: 'Two honor-guard drones still patrol a warship\'s wreck, and their rules of engagement are legible and fair, announced on loop in a voice forty years dead: crew areas inviolate, armory fair game. They do not miss.',
    },
  },

  // SP1-112 — The Grid Hostage: raiders clamped the power core; the terms
  // timer is honest and the brownout is yours to choose.
  {
    id: 'SP1-112',
    kind: 'encounter',
    title: 'The Grid Hostage',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'station_veil', wu: 1600 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with a towable core prop and colony lighting state in story.flags (endingWorldPresence precedent, src/systems/endingWorldPresence.js): negotiate, sneak the core back on a line, or pay — every resolution leaves the colony\'s lights at a state you chose, visible from orbit, for the rest of the save; shoot the core and the map section browns out for weeks.',
    payload: {
      text: 'Raiders have clamped the power core and hauled it outside station reach — "The lights come back when the vault does" — and the colony is running dark under a terms timer that is, insultingly, honest. Shoot the core and the whole map section browns out. For weeks.',
    },
  },

  // SP1-003 — The Debt Finds You: the lane you skipped still counts its
  // interest. gate:verdict is the toll lane's emit
  // (src/systems/gateControlDirector.js); the escaped-outcome gate is bespoke.
  {
    id: 'SP1-003',
    kind: 'encounter',
    title: 'The Debt Finds You',
    sectors: [],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'memory',
    followup: "Numbered file with gates.requiresCompletedShape + blockAfterOutcome reading story.depthProgramEncounters (priorOutcome in src/systems/crSituationKit.js): fires the next sector day after a toll/whisper shape resolved 'escaped' — a lean interceptor shadows a full minute, then hails; settle the original toll plus interest (credit intent, flag cleared) or fight a motivated, stat-boosted collector.",
    payload: {
      text: 'Days after you ran a toll, a lean interceptor shadows you for a full minute before hailing: "Wake-bearer. The lane you skipped still counts its interest." It quotes your own escape vector back at you.',
    },
  },

  // SP1-005 — The Sheepdog: a protection racket with a face, and a fee cap.
  // Hone (c) adopted: two interventions per sector day at a flat fee.
  {
    id: 'SP1-005',
    kind: 'encounter',
    title: 'The Sheepdog',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: "Ambush-file variant keyed off state.story.flags['sheepdog_paid'] (src/systems/encounterScripts.js; src/data/encounters/020-ambush-snare.js reuse; same-day-ambush precondition in the file's gates): the sheepdog genuinely intervenes in future ambushes in that sector — capped at two interventions per sector day for a flat fee, because a subscription that always works is a tax, not a character; refuse and both packs hunt you next pass.",
    payload: {
      text: 'Just as the second Reach pack of the day springs, an older pirate hull cuts in from the flank and fights them off — then hails: "That\'s my patch. You fly it again, you pay me, not them." A protection racket with a face.',
    },
  },

  // SP1-116 — The Witnessed Standoff: two convoys, one lane, and a stalemate
  // only a neutral hull can end.
  {
    id: 'SP1-116',
    kind: 'encounter',
    title: 'The Witnessed Standoff',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with two convoy columns stopped nose to nose (src/data/encounters/1207-the-witnessed-price.js precedent for witnessed-scene construction): be the witness — the truth posts to the news wire and both sides pay a fee — or nudge one hull a meter and let physics end the argument; one side wins, the other remembers (faction memory tag via deedRecord).',
    payload: {
      text: 'Two armed convoys have stopped nose to nose over a right of way — the oldest war — and both sides, seeing you, independently hail: "Neutral hull. Witness this. Whatever happens here happened fairly." Then nobody moves. Nobody will move. Someone has to move.',
    },
  },

  // SP1-119 — The Wrecker's Bout: no guns. Hull, hook, and nerve. Chained in
  // the file to SP1-109 (The Ring Rules) duel losses.
  {
    id: 'SP1-119',
    kind: 'encounter',
    title: "The Wrecker's Bout",
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_bounty', wu: 1500 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with weapons-locked ROE (doctrine, src/ai/doctrine.js) and massline tug-of-war as the weapon; audience hulls hold the ring boundary (vignette ring motion, src/systems/vignetteInterpreter.js): gated in-file on a post-duel-loss visit (SP1-109 The Ring Rules receipt); the crowd pays for spectacle, and a good showing — win or lose — makes you ring-regular (the champion nods, forever after).',
    payload: {
      text: 'The wreckers run their own ring with their own rules, posted plainly: NO GUNS. HULL, HOOK, AND NERVE. Six hulls hold the boundary as audience, and the champion — an ugly, wonderful old tug — is practicing shoves against a dead hulk when you arrive.',
    },
  },

  // SP2-054 — The Unclaimed Reward: the desk does not hold credits. The desk
  // moves them. mission:completed is the contract emit
  // (src/systems/missions.js); the 3-day watcher and the motion fee are the
  // bespoke leg.
  {
    id: 'SP2-054',
    kind: 'oneoff-mission',
    title: 'The Unclaimed Reward',
    sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed' },
    channel: 'memory',
    followup: 'Claim watcher in the bounty-board seam (src/systems/missionBoardOps.js): 3+ in-game days after a tagged-kill bounty completes unclaimed, the board pays out minus a 2% handling fee itemized as "motion" and sets flag desk_moved; future claims at that board pre-waive the fee with the memo "you learned."',
    payload: {
      text: 'The bounty board mails the payout unsolicited: "YOU DID NOT CLAIM. THE DESK DOES NOT HOLD CREDITS. THE DESK MOVES THEM. DO NOT MAKE THE DESK MOVE THEM AGAIN." A 2% handling fee has been deducted, itemized as "motion."',
    },
  },

  // SP1-122 — The Resignation Letter: the warlord's wreck yields a
  // resignation dated the day he died, never sent. boss:defeated is the
  // boss-kill emit (src/systems/world.js).
  {
    id: 'SP1-122',
    kind: 'oneoff-mission',
    title: 'The Resignation Letter',
    sectors: [],
    trigger: { type: 'receipt', event: 'boss:defeated' },
    channel: 'memory',
    followup: 'Drop attached to the boss-outcome facts (crSituationKit facts; numbered delivery encounter, src/systems/encounterScripts.js): deliver it to the pack in Pallas Drift for a succession with less blood than expected — the sector\'s raid prices actually soften (economy intent) — or keep it; the pack hardens, and the letter is the best item description in your hold.',
    payload: {
      text: 'The warlord\'s wreck yields, of all things, a sealed letter — a resignation written to his own pack, dated the day he died, never sent: "Tell them I was tired. Tell them the tolls were getting heavy to carry. Don\'t tell them I said sorry."',
    },
  },

  // SP2-102 — The Meridian Gift With A Clause: 2,000 cr, no interest, no
  // term, one clause. Hone (c): the recall is survivable by flying, never a
  // snatch.
  {
    id: 'SP2-102',
    kind: 'oneoff-mission',
    title: 'The Meridian Gift With A Clause',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'station_tethys', wu: 900 },
    channel: 'memory',
    followup: 'Economy contract via src/data/economyContractTemplates.js plus one seeded recall day; gates Meridian standing >= 30 and lifetime profit > 20k: credits compound at real daily interest until the collector visits once — survivable by flying (outrun or outmaneuver, never a raw credit snatch); surviving the recall gracefully doubles the relationship permanently.',
    payload: {
      text: 'MTS offers a "courtesy investment": 2,000 cr, no interest, no term, one clause — "the syndicate may recall it at any moment, including mid-flight, including from the hold." The clerk swears the clause has never once felt like a threat. The clause is the story.',
    },
  },

  // SP1-046 — The Extra Crate: forty on manifest, forty-one in the hold, and
  // the extra one is humming.
  {
    id: 'SP1-046',
    kind: 'oneoff-mission',
    title: 'The Extra Crate',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with cargo inspection and three seeded outcome props (module from src/data/modules.js, a stowaway, or a very lost pet drone): open it, deliver it somewhere, or teach her the broker\'s trick — bill it as sentimental freight and dock it anyway (flag; the customs scan reads the paperwork honestly ever after).',
    payload: {
      text: 'A junior hauler has counted wrong and everyone in the lane knows it: forty crates on manifest, forty-one in the hold, and the extra one is humming. "It was on the dock. It had a shipping label. Labels mean it\'s mine. Right?"',
    },
  },

  // SP2-097 — The Archive Librarian's Fine: one item, forty-one years
  // overdue. The tapes are home. The LEDGER is mine.
  {
    id: 'SP2-097',
    kind: 'oneoff-mission',
    title: "The Archive Librarian's Fine",
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 900 },
    channel: 'memory',
    followup: "One-off mission via src/systems/missions.js chained to the library_tapes roaming story; gates on 30+ codex pages read: the borrower's estate is a wreck in the player's charted sectors (uniqueWrecks rumor-to-bearing-to-scan pattern, src/systems/uniqueWrecks.js); recovery yields Archive standing +4 and the codex page 'The Borrower's Estate' — the fine assessed at one credit and a formal apology the desk stamps.",
    payload: {
      text: 'The Archive\'s librarian hails you with your own overdue list: one item, forty-one years overdue — the ledgers that go with the roaming library tapes. "The tapes are home. The LEDGER is mine." The job is find the borrower\'s estate and bring back the paperwork.',
    },
  },

  // SP2-075 — The Route Auction: someone is selling your own route history at
  // the back table, and the errand IS the question.
  {
    id: 'SP2-075',
    kind: 'oneoff-mission',
    title: 'The Route Auction',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_smuggler', wu: 600 },
    channel: 'memory',
    followup: 'One-off decoy-lane mission against ambush-signature data (src/data/ambushSignatures.js); gates on high heat at a night-shift dock at the Den: success destroys the history (flag routes_cleaned — one-time scan immunity against one bounty hunt); refusing means the history sells and the sector\'s ambush rate rises for a week of game time.',
    payload: {
      text: 'A fixer slides a slate across the back table: someone is selling your own route history. He will get it for the price of one errand — no questions; the errand IS the question. Fly a decoy lane so the buyer\'s tail follows the wrong hull.',
    },
  },

  // SP2-122 — Quill's Second Copy: AR-3 does not deal in rumors, and files
  // one anyway, on principle. scan:completed is the scanner emit
  // (src/systems/scanner.js).
  {
    id: 'SP2-122',
    kind: 'oneoff-mission',
    title: "Quill's Second Copy",
    sectors: ['sector_triton_wake'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Quill read-ring logic + copy-stamp check (src/data/quill.js): fires when a delivered wreck\'s manifest has already been copied once; AR-3 refuses on principle, copies anyway, files the third as "RUMOR: THAT LOG. CONFIDENCE: TOTAL" — flag quill_rumor, codex page "The Rumor Index", Archive standing +2 (they side with the index).',
    payload: {
      text: 'AR-3 refuses, gently, on principle: "This log exists twice. A third is not a copy. A third is a rumor. I do not deal in rumors." Then it copies it anyway, and files the third in its own index: "RUMOR: THAT LOG. CONFIDENCE: TOTAL." The distinction matters to exactly one machine in the universe, and it is this one.',
    },
  },

  // SP1-123 — The Comet Run: the only race in the belt where the COURSE
  // moves. Anchored inside SP3-005's perihelion window (days 15-17); hone (c)
  // folded: gates on the comet's ephemeris, purse in the hundreds.
  {
    id: 'SP1-123',
    kind: 'oneoff-mission',
    title: 'The Comet Run',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 600] },
    recurring: true,
    channel: 'memory',
    followup: 'Race-type mission with courseSector and moving gate positions (race in MISSION_TYPES, src/data/missions.js): runs inside SP3-005\'s perihelion window with gates drifting on the comet\'s actual ephemeris; purse in the hundreds across three pay bands; winners\' hull names chalked on the comet-post until next perihelion.',
    payload: {
      text: 'The comet run: gates strung along the tail, the whole field riding the outgassing — the only race in the belt where the COURSE moves and every gate drifts with it. The locals\' advice, posted at the lane mouth: "The comet does not care who wins. This is why it is honest."',
    },
  },

  // SP2-090 — The Alibi Engine: a legit freight job whose purpose is your
  // transponder being somewhere boring.
  {
    id: 'SP2-090',
    kind: 'oneoff-mission',
    title: 'The Alibi Engine',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'proximity', nearStation: 'station_nyx_march', wu: 900 },
    channel: 'memory',
    followup: 'One-off mission via src/data/missions.js plus the warrant/heat seam; gates on Concord heat above threshold at first dock at the march: the haul is dull and perfectly timed; completion clears one active warrant\'s evidence trail (flag alibi_confirmed); payment small, value structural.',
    payload: {
      text: 'A march-regular runs an "alibi engine" — a legit freight job whose entire purpose is putting your transponder somewhere boring at a specific time. "The records do not ask what you did. They ask where you were. I sell where."',
    },
  },

  // SP2-110 — The Pitborn Adoption Rite: yard is family. Family is inventory.
  // It is a compliment. deniable:fenceThanked is the fence-deal outcome emit
  // (src/systems/encounterDirector.js).
  {
    id: 'SP2-110',
    kind: 'oneoff-mission',
    title: 'The Pitborn Adoption Rite',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'receipt', event: 'deniable:fenceThanked' },
    channel: 'memory',
    followup: 'Fence-sale counter keyed to deniable:fenceThanked receipts (deedRecord listens there, src/systems/deedRecord.js; five sells to Pitborn fences): the cull-side ceremony grants a welded plate with your callsign scratched by every yardmaster in turn — permanent shipScreen dressing, Pitborn prices +5% on your sells forever, flag yard_family.',
    payload: {
      text: 'The yard calls a cull-side ceremony: a small plate, welded, your callsign scratched into it by every yardmaster in turn. "You count what you sell. You sell what counts. You are yard. Yard is family. Family is inventory. It is a compliment."',
    },
  },

  // SP2-111 — The Understory's Seed Debt: the garden grows on what fell, and
  // what fell was yours. entity:killed is the player-kill emit
  // (src/systems/combat.js).
  {
    id: 'SP2-111',
    kind: 'oneoff-mission',
    title: "The Understory's Seed Debt",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'entity:killed' },
    channel: 'memory',
    followup: 'Garden runtime state check plus one-off visit mission (src/systems/faction_understory.js; fires when a hull dies in a sector with an Understory garden at stage 2): the unarmed spore-tender intercepts and asks custody of the wreck — visit the garden (proximity + scan) with the tender watching and the garden stages up one level as thanks; Understory standing +4, flag seed_debt_paid.',
    payload: {
      text: 'A spore-tender intercepts — no weapons, no hostility, never fires first — and asks for the wreck you made. Not salvage rights: custody. "The garden grows on what fell. What fell was yours. The garden asks its maker to visit. That is all debt means here."',
    },
  },

  // SP1-032 — The Dead Man's Manifest: four pods, four bearings, and not all
  // of them survived. Hone (c): chain payout under ~1.5x a delivery contract.
  {
    id: 'SP1-032',
    kind: 'oneoff-mission',
    title: "The Dead Man's Manifest",
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'salvage:communicatorFound' },
    channel: 'memory',
    followup: 'Four-site scavenge chain via the salvage_signal script + follow-on stubs (followOnStub pattern, src/systems/encounterScripts.js; src/data/encounters/110-salvage-signal.js family): seeded outcomes — one pod crushed, one already claimed, one full, one full of something else entirely; total payout caps under ~1.5x a comparable delivery contract — the find is the payoff.',
    payload: {
      text: 'A black box lists a cargo the ship never delivered — four pods jettisoned at four different bearings, "so at least someone gets paid." The bearings are real, spread across the sector, and not all pods survived.',
    },
  },

  // SP1-021 — The Transponder That Isn't Yours: a clerical reform gave your
  // registry number a history. player:scannedByPatrol is the patrol-scan emit
  // (src/systems/economy.js).
  {
    id: 'SP1-021',
    kind: 'oneoff-mission',
    title: "The Transponder That Isn't Yours",
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'player:scannedByPatrol' },
    channel: 'memory',
    followup: 'Authored three-leg chain in the SET_PIECE_MISSIONS pattern (three commonStages, no branch): the station records office, the old hijacker\'s actual wreck via uniqueWrecks rumor-to-bearing-to-scan (src/systems/uniqueWrecks.js), and a notarized scan — ends with the record corrected and a codex page on registry reform nobody asked for.',
    payload: {
      text: 'A patrol scan flags YOUR hull for a hijacking committed two years ago by a ship whose registry number now collides with yours after a clerical reform. "The record doesn\'t care what you say. It cares what it says."',
    },
  },

  // SP1-022 — The Amnesty Burn: the window is announced in world time (hone
  // c: watches per worldCalendar.js — second watch to day's end, never hours)
  // and the run to the desk is the event.
  {
    id: 'SP1-022',
    kind: 'oneoff-mission',
    title: 'The Amnesty Burn',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 24, windowS: [200, 600] },
    recurring: true,
    channel: 'memory',
    followup: 'Amnesty event on the hunter spawn table (src/data/bountyHunters.js), window expressed in world time per src/data/worldCalendar.js (this entry anchors the second-watch open), gated on bounty > 0 at posting: reach the Helios law desk inside the window — bounty cleared at a discount, hunters paid off (d.rep intents), and one hunter who followed you the whole way respects you afterward (named-hunter state).',
    payload: {
      text: '"CONCORD NOTICE: transponder amnesty window open second watch to day\'s end." Every hunter in the belt got the same notice and reads it as open season while the guilty are lined up for the desk. The run to the desk is the event.',
    },
  },

  // SP2-119 — Ruckus Closes The Work Order: the board prints a line it has
  // never printed, and waits. It is good at waiting. It is a yard.
  {
    id: 'SP2-119',
    kind: 'oneoff-mission',
    title: 'Ruckus Closes The Work Order',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ruckus_work_yard', wu: 800 },
    channel: 'memory',
    followup: 'Ruckus runtime counter + line variant at poi_ruckus_work_yard (work-order completions counted at the yard runtime; free-repair flag consumed by service pricing): after 3+ completed work orders the board sets flag ruckus_idle and adopts the player\'s hull as its standing work order — every future dock generates one small free repair; DMC standing +3.',
    payload: {
      text: 'Ruckus\'s open-work-order board prints one line it has never printed: "WORK ORDER: [ALL]. STATUS: NONE OPEN. ADJACENT PROBLEM: IDLE. RECOMMENDATION: FIND A NEW SHIP THAT NEEDS THINGS. I WILL WAIT. I AM GOOD AT WAITING. I AM A YARD."',
    },
  },

  // SP2-132 — The Claim Tag Wedding: not a dispute — a JOINT claim form,
  // pre-signed, one blank line. claim:claimed is the claims emit
  // (src/systems/claims.js).
  {
    id: 'SP2-132',
    kind: 'oneoff-mission',
    title: 'The Claim Tag Wedding',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'claim:claimed' },
    channel: 'memory',
    followup: 'Claim-system dialogue keyed to claim:claimed with a rival crew physically present and contesting (src/systems/claims.js; body registry in src/data/claimableBodies.js): sign or decline — signing grants the joint-yield flag for that body (both yields doubled permanently) and one recurring co-owner letter ("The claim is well. The scale is honest. — V"); declining earns respect and no grudge.',
    payload: {
      text: 'Instead of a dispute, the rival crew hails with paperwork: a JOINT claim form, pre-signed, one blank line. "SECOND NAME. THIS IS NOT A QUESTION. WE SAW YOUR SCALE READINGS. MARRY US COMMERCIALLY."',
    },
  },
];
