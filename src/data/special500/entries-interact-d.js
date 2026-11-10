// src/data/special500/entries-interact-d.js — batch cat-interact-d (33 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-interact-d.json). Encounter and
// oneoff-mission kinds — the campaign's interactive core: standoffs, rescues,
// chases, offers, judgment calls. The catalog entry carries the schedulable
// tell (the hail, the wire, the first-sight line); where the core mechanic is
// bespoke-interactive (a boarding, a vendor, a choice, an NPC that must
// actually fly), the channel is memory plus a followup naming the mechanic and
// its real seam file — the encounter-file track builds that leg against the
// director's memory receipt.
//
// No sector remaps were needed — every consensus sector id is real
// (src/data/sectors.js, src/data/frontierRegions/*.js).
// Every receipt trigger names a bus event verified against src/systems
// emitters: combat:kill (world.js), law:fineAssessed (lawSecurity.js),
// dock:docked (src/ui/input.js + world.js), mission:completed (missions.js),
// scan:completed (scanner.js), cargo:delivered (missions.js),
// drill:chargeBlast (drill.js), hazard:exit (hazard system),
// meridian:convoyRaided (meridian rail), choir:bellHeadRing
// (faction_choir.js), lastShift:archived (lastShift.js), npc:hailed
// (barkDirector.js). Anchors verified: station_sker, station_helios,
// station_io_merc, station_tethys, station_drift, station_ceres,
// station_ashcache, station_kepler_scar, poi_ceres_weigh_pin (Inbound Weigh
// Pin, the refinery approach), poi_tethys_weigh (Weigh-Slip Buoy, the skim
// corridor's weigh line), world_site_wreck_cathedral (world_site anchors are
// landed precedent — entries-world-a.js). No mail.

export const ENTRIES_INTERACT_D = [
  // SP2-185 — The Impound Grudge Interview: the shelf has a slot ready for you.
  // The grudge gate and the slot dressing are the bespoke leg; the tell is the
  // label on the slot.
  {
    id: 'SP2-185',
    kind: 'encounter',
    title: 'The Impound Grudge Interview',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'station_sker', wu: 800 },
    channel: 'memory',
    followup: 'Grudge-gated shelf dressing keyed to impoundGrudge state (src/systems/impoundGrudge.js): the labeled slot is a prop at the Reach impound shelf near station_sker, one size too generous; settling the underlying fine moves your callsign to the shorter, prouder CLEARED column (flag slot_cleared).',
    payload: {
      text: 'The impound shelf has a slot prepared for your hull — labeled, dated, one size too generous: "WE PREPARE FOR EVERYONE. MOST NEVER EARN IT. YOUR SLOT IS THE CORRECT SIZE FOR WHO YOU WILL BE IF YOU KEEP FLYING LIKE THIS. IT IS A COMPLIMENT AND A WARNING AND WE DO NOT DIFFERENTIATE."',
    },
  },

  // SP2-187 — The Debt Collector's Duet: the debt clears on witness alone.
  // Per the hones, the witnessed story is ONE assist/scan/dock inside the
  // window — open-ended maneuver watching is not judgeable.
  {
    id: 'SP2-187',
    kind: 'encounter',
    title: "The Debt Collector's Duet",
    sectors: [],
    trigger: { type: 'receipt', event: 'npc:hailed' },
    channel: 'memory',
    followup: 'Debt-state read + witness window on the creditor-hull hail (economy debt seam): one assist, scan or dock inside three minutes of the hail is the story — the debt clears on witness alone, once (flag story_current), and the creditor greets you as "the story" thereafter.',
    payload: {
      text: 'The creditor\'s hull hails back off the record, desk traffic still open behind it: "The desk wants the number. I want the story. You are one good story from current. Tell it."',
    },
  },

  // SP1-079 — The Fire Watch: a station module burns and the drones keep
  // missing. The shove is real physics; the band call is the tell.
  {
    id: 'SP1-079',
    kind: 'encounter',
    title: 'The Fire Watch',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter near station_helios with a burning module prop: shove it off the spine via the massline/bolus force seams (src/data/bolusForces.js) — save it for rep and a dock discount, or let it torch and the station rebuilds and mentions it; seeded once per sector week (hashDaily 1-in-5).',
    payload: {
      text: 'A station module catches fire and the extinguisher drones\' sweeps keep missing by meters in the vent wind. The call over the band is dignified and desperate: "Any hull with mass assist. Push the module off the spine. We will owe you the respect of the ledger."',
    },
  },

  // SP3-189 — The Verge Pilgrims: a Pale Holiday crossing nobody scheduled.
  // The convoy must actually fly — memory + followup.
  {
    id: 'SP3-189',
    kind: 'encounter',
    title: 'The Verge Pilgrims',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'calendar', dayOfYear: 33, windowS: [0, 600] },
    recurring: true,
    channel: 'memory',
    followup: 'Lane-contact convoy on the festival gate (choir pilgrim runtime precedent) crossing from the Veil gate to the far marker, with the lamp floor and the one-minute all-dark of SP3-103/106; escorting the full crossing is its own receipt; codex entry.',
    payload: {
      text: 'A candle-chain of small ships crosses toward the Veil\'s deep field — one lamp each, no formation discipline, some old and slow, observing the Pale Holiday nobody scheduled. Falling out of the chain is not an insult; rejoining is expected. At the far marker they all flash once and go dark for a minute.',
    },
  },

  // SP3-066 — The Crusher Trail: industry's massline, made visible. The tug
  // must actually fly — memory + followup.
  {
    id: 'SP3-066',
    kind: 'encounter',
    title: 'The Crusher Trail',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_weigh_pin', wu: 400 },
    channel: 'memory',
    followup: 'NPC hauler job (npcJobs, saveVersion v12) with a massline-attached boulder spawned on each station shift change (stationShiftAt), inbound on the refinery approach; taut-line presentation via MONOFILAMENT_BLADE_TAUT_RATIO (src/render/vfx.js); cutting the line is massline:playerLineCut and the band reacts.',
    payload: {
      text: 'A yard tug drags a boulder bigger than itself down the refinery approach, its massline drawn bar-taut and singing, rock dust shedding behind it in a slow fan. Give way or get swept. Cut the line and the boulder rolls free, and everyone on the channel has opinions.',
    },
  },

  // SP1-132 — The Long Follow: "Keep up or don't." The chase is a real 120 s
  // proximity await; the racer must actually fly — memory + followup.
  {
    id: 'SP1-132',
    kind: 'encounter',
    title: 'The Long Follow',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.04 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter: spawn the racer hull on the trade lane and judge 120 s of visual contact honestly (vignetteInterpreter near/trail awaits); keep up and they introduce themselves at the next bar as a named contact tipping credits-worthy rumors (barContact flag); lose them and it never happened.',
    payload: {
      text: 'A racer blows past and, without slowing, tags you on the band: "Keep up or don\'t." The chase has no purse, no rules, no finish line announced — just a hull ahead that flies beautifully for exactly two minutes and then buys the drinks.',
    },
  },

  // SP3-074 — The Wolf Pack: scavengers strip the fresh wreck by lamp code.
  // The wings must actually spawn — memory + followup.
  {
    id: 'SP3-074',
    kind: 'encounter',
    title: 'The Wolf Pack',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'Scavenger wings arrive in file 60 s after a capital-class kill, inside 500 WU: scavenger presence template with job-signature lights via emitNpcJobSignature (src/render/vfx.js), donor plates from wreckAftermathDressing.js; green go-lamps over chosen plates, red over contested; contesting the claim runs the salvage dispute path.',
    payload: {
      text: 'The scavenger wings arrive in file, cutting lights flashing as they work — green go-lamps over chosen plates, red stop-lamps over contested ones — and the wreck field lights up like a construction site. They strip visibly: plates teeter, detach, get dragged. Their claim is contestable. Their lights say they do not think you will.',
    },
  },

  // SP1-058 — The Rodeo: claim-jumpers steal your seam as sport. The tug-of-war
  // is the massline, honestly — memory + followup.
  {
    id: 'SP1-058',
    kind: 'encounter',
    title: 'The Rodeo',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'drill:chargeBlast' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter gated to a claimed seam while you work it (cooldown one day): attachment tug-of-war on the massline — re-lasso your own rocks, shoot their lines, or out-score them by throwing bigger; scoring on massline throw events (tow_recovery precedent); they concede the seam with a tip of the hat.',
    payload: {
      text: 'Claim-jumpers run a literal rodeo on your seam: lassoing loose boulders with masslines and dragging them out of the beacon ring, whooping, scoring themselves. It is theft as sport, and they want an audience. You are the audience. Also the mark.',
    },
  },

  // SP1-081 — The Ticketed Wreck: the famous wreck has a ticket booth, and a
  // poacher on the far side. Tour-or-chase is the bespoke leg.
  {
    id: 'SP1-081',
    kind: 'encounter',
    title: 'The Ticketed Wreck',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'world_site_wreck_cathedral', wu: 600 },
    channel: 'memory',
    followup: 'Numbered ambient encounter at the Wreck Cathedral during a seeded tour window (cooldown one day): tour column (vignetteInterpreter) with the narrator\'s one honest sentence the script does not advertise (codex page on completion), or chase the poacher off the far side for the operator\'s fee (d.grant).',
    payload: {
      text: 'The most famous wreck in the belt has a ticket booth. A tug runs sightseeing loops, a licensed narrator reads the disaster\'s timeline over the band, and six civilian hulls hold formation at the no-closer ring — while, far side, a scavenger works the wreck. Banned. Working. Unbothered.',
    },
  },

  // SP1-009 — Toll War: two packs, one lane, and you pay the OTHER one's toll.
  // The pay-or-side choice is the bespoke leg.
  {
    id: 'SP1-009',
    kind: 'encounter',
    title: 'Toll War',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'Two numbered files on the toll script sharing state.story.flags[\'toll_war_sector\'] (src/systems/encounterScripts.js toll handler; planner collision made deliberate, minSectorTier 2): pay one side and slip through the brawl, or escort either pack for a day for a cut of the other\'s toll; the lane stays contested for days.',
    payload: {
      text: 'Two rival packs have claimed the same lane and are arguing about it with mass drivers when you arrive. Both demand you pay the other one\'s toll to pass through their fight. The math is insolent. The geometry is worse.',
    },
  },

  // SP1-010 — The Honest Fence: the dullest service in the lawless belt,
  // scrupulously polite. The fence deal is the bespoke leg.
  {
    id: 'SP1-010',
    kind: 'encounter',
    title: 'The Honest Fence',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'memory',
    followup: 'Bounty gate (cooldown 1 h per consensus) on a numbered selfRegistered file: she re-registers stolen goods into clean paperwork — sell hot cargo at 70% value with zero rep damage (commodityMoralTags read, src/data/commodityMoralTags.js; d.grant/charge intents); her receipt is a stamped chit other hulls can scan later.',
    payload: {
      text: 'A Quiet-registered broker hails with a ledger and offers the dullest service in the lawless belt: "I re-register stolen goods into clean paperwork. A percentage. I am scrupulously polite about it, because it is legal to be and honest to remain."',
    },
  },

  // SP3-169 — The Phantom Patrol: radar-only until hailed. The hulls must
  // actually spawn and light up — memory + followup.
  {
    id: 'SP3-169',
    kind: 'encounter',
    title: 'The Phantom Patrol',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'memory',
    followup: 'Patrol presence template on a hash-picked watch each week with a lamps-off state until hailed (lamp-bus gain gate keyed to the hail receipt): three law hulls light up exactly where the radar blips were and conduct a perfectly routine inspection; codex entry on the law\'s oldest trick.',
    payload: {
      text: 'A patrol blip on radar holds formation in open dark. Nothing visible. No lamps, no hull, no future. Hail it, and three law hulls light up exactly where the blips were, floods on, conducting a perfectly routine inspection as if they had been visible the whole time. It is the law\'s oldest trick, and it works because it is routine.',
    },
  },

  // SP3-038 — The Skimmer Shift: harvest barges strung like lanterns on the
  // weigh line. The barges must actually fly — memory + followup.
  {
    id: 'SP3-038',
    kind: 'encounter',
    title: 'The Skimmer Shift',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_weigh', wu: 500 },
    channel: 'memory',
    followup: 'Civilian zone presence + harvest-barge jobs (npcJobs, saveVersion v12) staged to the skim corridor\'s first watch: running lights and heat-scoop glow along the weigh line, corridor-etiquette hail, a comms nod for polite flying, and the last barge\'s flood flash (annoyance, not law) if you cut the line.',
    payload: {
      text: 'A line of harvest barges works the skim corridor with running lights on, each dragging a heat-scoop glow — a string of amber lanterns along the weigh line. They hail you with corridor etiquette. Cut through their line and the last barge flashes its floods at you: annoyance, not law.',
    },
  },

  // SP3-131 — The Survivor's Lamp: a mercy mechanic rendered entirely in light.
  // The pod must actually spawn and be towed — memory + followup.
  {
    id: 'SP3-131',
    kind: 'encounter',
    title: "The Survivor's Lamp",
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'Crew-pod payload entity spawned on kills with a 4-minute life window: the manually strobed "here" pattern, latch via massline turns the strobe steady, tow to any berth pays a small bonus and a rep nod and hangs the pod\'s lamp in the station\'s bunting for a day; miss the window and the last blink is the only record.',
    payload: {
      text: 'A pod tumbles away from the kill with one hand strobe blinking a slow, manually operated pattern. Not quite SOS. Just: here. Latch it and the strobe goes steady — calm. Tow it to any berth and its lamp joins the station\'s bunting for a day. Miss the window and the strobe\'s last blink is the only record.',
    },
  },

  // SP3-119 — The Hitchhiker: an EVA suit with its arm raised. It must be
  // latched and carried — memory + followup.
  {
    id: 'SP3-119',
    kind: 'encounter',
    title: 'The Hitchhiker',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'memory',
    followup: 'Pickup entity with contactHail comms line + massline carry + strobe lamp channel, hash-picked once per week near the merc lane: a small fee and a drop-off at any berth (codex entry); two suits exist per seed and the second is the anomaly payoff — it knocks, and nobody has ever been inside.',
    payload: {
      text: 'A lone EVA suit drifts near the merc lane, hand strobe blinking, arm raised, slowly tumbling. Latch it and it knocks politely on your hull — a comms line, a small fee, a request to be dropped at any berth. Two suits fly this lane per seed. One of them is lying about being alive.',
    },
  },

  // SP1-172 — The Census: three questions, each a required action. The physical
  // response steps are the bespoke leg; the row is permanent.
  {
    id: 'SP1-172',
    kind: 'encounter',
    title: 'The Census',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 300] },
    recurring: true,
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter at the border checkpoint (station_customs) with physical-response steps: jettison one unit and name it, flash lights twice, name the last hull you refused; the row persists in story.flags and a census follow-up encounter opens years later quoting it back word for word (gates.requiresCompletedShape).',
    payload: {
      text: 'The Meridian census is physical. Three questions, each with a required action, not an answer: "Dump one unit of anything and tell us what it was. Flash your lights twice for the record. Name the last hull you refused." The census taker writes it all down without comment. Your answers become a row in a ledger nobody can edit.',
    },
  },

  // SP1-064 — The Pulse Seam: the impossible job inside a pulsing radiation
  // pocket. The timing-gate contract is the bespoke leg.
  {
    id: 'SP1-064',
    kind: 'oneoff-mission',
    title: 'The Pulse Seam',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'receipt', event: 'hazard:exit' },
    channel: 'memory',
    followup: 'Hazard-window mining contract (uniqueWrecks timingGate precedent, src/data/uniqueWrecks.js) posted at the Veil station after one survived pulse inside the radiation field: hold-and-dash loops on the public pulse clock, payout scaled by purity, module discount as priced gratitude (economyTerms).',
    payload: {
      text: 'A survey company posts the impossible job: the sector\'s richest seam sits inside a radiation pocket that pulses on a fixed clock. Every miner who tried mined between pulses and died between pulses. The clock is public. The rhythm is learnable.',
    },
  },

  // SP2-184 — The Last Shift Witness: read the report to the yard, out loud,
  // at the bell. The bell-window reading is the bespoke leg.
  {
    id: 'SP2-184',
    kind: 'oneoff-mission',
    title: 'The Last Shift Witness',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'lastShift:archived' },
    channel: 'memory',
    followup: 'Bell-window reading interaction at world_site_ceres_second_measure keyed to the filed Last Shift evidence (lastShift:archived receipt; doss_ceres_last_shift evidence read): flag last_shift_read_aloud, the yard\'s night light becomes permanent dressing, DMC standing +6, codex page "Said Right."',
    payload: {
      text: '"You read the shift report. You are one of maybe five living hulls who has. Read it to the yard, out loud, at the bell. The dead worked there. The yard should hear its own name said right." No fee. No receipt. The payoff is that the night crew starts leaving one light on for the shift that never clocked out.',
    },
  },

  // SP2-186 — The Courier's Ghost Run: fly it from memory, not from the plot.
  // Per the hones, keyed to courier contracts completed in-sector (deed
  // counter); no lane-history ledger exists.
  {
    id: 'SP2-186',
    kind: 'oneoff-mission',
    title: "The Courier's Ghost Run",
    sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed' },
    channel: 'memory',
    followup: 'Keyed to courier contracts completed in-sector (deed counter; no lane-history ledger exists): the dispatcher appends the memory run to a later courier contract — fly it with honest deviation inside tolerance for a memory bonus; flag lane_from_memory unlocks their best contracts permanently.',
    payload: {
      text: 'The courier brief appends one personal note from the dispatcher: "You know this lane better than the manifest does. Fly it from memory, not from the plot. If your wake matches the chart exactly, the lane learns nothing. If it doesn\'t, you are late. Be neither."',
    },
  },

  // SP3-051 — Ride the Front: sixty seconds in the surge, wick lit. The
  // landmark mission row is the bespoke leg.
  {
    id: 'SP3-051',
    kind: 'oneoff-mission',
    title: 'Ride the Front',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'station_io_merc', wu: 800 },
    channel: 'memory',
    followup: 'landmarkMissions.js row (src/data/landmarkMissions.js) with a surge-phase occupancy predicate (pure seasonalWeatherPhase read), offered at station_io_merc during solar_wind weeks: sixty seconds inside the visible front, small bonus + codex entry (storm rider).',
    payload: {
      text: '"Stay in the surge for sixty seconds and bring the wick back lit." Sixty seconds inside the visible front — streamers combed past your canopy, the hull crawling with static — then the calm hits like a door closing and the wick\'s blue flame stands straight up.',
    },
  },

  // SP3-097 — The Bell Ringer's Apprentice: toll the Eighth Bell in the
  // foundry's own sequence. The sequence interaction + lit rows are bespoke.
  {
    id: 'SP3-097',
    kind: 'oneoff-mission',
    title: "The Bell Ringer's Apprentice",
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'choir:bellHeadRing' },
    channel: 'memory',
    followup: 'Keeper-contact offer chained on the witnessed unscheduled toll (choir:bellHeadRing receipt): three-rest-one toll interaction, each correct toll lights one foundry window row via the lamp-bus gain path and completed rows stay lit for the season, wrong order rings flat (existing toll audio recipe); codex entry.',
    payload: {
      text: 'The bell\'s keeper finds you after the unscheduled toll, not angry — interested. "Toll the Eighth Bell in the foundry\'s own sequence. Three, rest, one. Each correct toll lights a window row. Wrong order and the bell answers itself, flat, and we all stand there knowing."',
    },
  },

  // SP1-124 — The Gate Sprint: an unofficial lunchtime tradition. The race
  // mission and the persisted record are the bespoke leg.
  {
    id: 'SP1-124',
    kind: 'oneoff-mission',
    title: 'The Gate Sprint',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 24, windowS: [180, 300] },
    recurring: true,
    channel: 'memory',
    followup: 'Race-type mission posted during scheduled traffic lulls (weekly lulls in the glue): a clean timed sprint on the station-to-gate lane geometry; beat the record and your time is the record (persisted in story.flags, visible at both stations); traffic control\'s "recreational velocity" advisories via news:publish.',
    payload: {
      text: 'Two stations, one gate, and an unofficial lunchtime tradition: the gate sprint. Traffic control pretends not to see it and issues a formal advisory about "recreational velocity." The purse is small, the bragging is eternal, and the safety record is, frankly, remarkable.',
    },
  },

  // SP3-029 — Shoot the Crown: one exposure of the burning aurora crown, from
  // inside the corridor. The landmark mission row is the bespoke leg.
  {
    id: 'SP3-029',
    kind: 'oneoff-mission',
    title: 'Shoot the Crown',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'station_tethys', wu: 800 },
    channel: 'memory',
    followup: 'landmarkMissions.js row (same shape as CAVED_SHAFT_PROBE, src/data/landmarkMissions.js) with the aurora season forecast (SP3-021) as its availability predicate, offered on the ordinary mission board at station_tethys: scan pulse under the burning limb; photography moment + codex entry + small bonus.',
    payload: {
      text: '"One exposure of the crown from inside the skim corridor while it burns. Don\'t die; the plate is the deliverable." You fly under the burning limb with the aurora filling the top of the frame and fire the scan pulse.',
    },
  },

  // SP3-070 — Separate the Dancers: split the Boulder Binary before it is dust.
  // Massline physics on the two bodies; the dust ring is the scar.
  {
    id: 'SP3-070',
    kind: 'oneoff-mission',
    title: 'Separate the Dancers',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_drift', wu: 800 },
    channel: 'memory',
    followup: 'landmarkMissions.js row + ordinary massline physics on the two asteroidMotion bodies, offered at station_drift after the player witnesses one full binary period: latch one boulder, burn against the orbit, pull them apart; the abraded dust ring persists via gas volume; the binary becomes two solitary rocks with a named history (codex entry).',
    payload: {
      text: '"They\'re grinding each other to gravel. Split them before they\'re dust." The Boulder Binary has been eating itself for years — latch one boulder, burn against the orbit, and pull the pair apart. The separation throws a ring of abraded dust that hangs there afterward, a visible scar with your name on the paperwork.',
    },
  },

  // SP1-049 — The Futures Broker: paper on tomorrow's convoy. The bet and its
  // three forks are the bespoke leg.
  {
    id: 'SP1-049',
    kind: 'oneoff-mission',
    title: 'The Futures Broker',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_ceres', wu: 800 },
    channel: 'memory',
    followup: 'Numbered encounter + economy intents via economyCycles reading the scheduled convoy (spawns via the convoy script, src/systems/encounterScripts.js): escort it (honest win), raid it (profit, wanted), or ignore it and the market moves without you — all three visible in next-day prices.',
    payload: {
      text: 'A broker offers paper on tomorrow\'s convoy: "That hull arrives full, price dips, you lose. It arrives empty, price spikes, you win. It arrives at all — that\'s your problem to arrange." The contract is a bet on a real scheduled convoy, and the broker does not blink at the arrangement clause.',
    },
  },

  // SP1-020 — The Impound Auction: 40% of book, delivery means towing her out
  // yourself past the claimants. The tow race is the bespoke leg.
  {
    id: 'SP1-020',
    kind: 'oneoff-mission',
    title: 'The Impound Auction',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'memory',
    followup: 'Wreck/tow mission in the WRECK_MISSIONS pattern (src/data/wreckMissions.js, tow_recovery type) gated on ≥1 impounded hull record (uniqueOnce per hull): the hull spawns disabled at the Forge Outlying Yard, three claimant-hulls race you to her, and the yard ledger entry persists where other NPCs reference it.',
    payload: {
      text: 'The impound yard posts one confiscated smuggler\'s ship at forty percent of book — payment due on delivery, and delivery means towing her out yourself, past three claimant-hulls who got the same notice and read it faster.',
    },
  },

  // SP3-089 — Fire the Furnace: relight a dead foundry and the sector gets a
  // permanent light. The sectorWonders build is the bespoke leg.
  {
    id: 'SP3-089',
    kind: 'oneoff-mission',
    title: 'Fire the Furnace',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'station_ashcache', wu: 700 },
    channel: 'memory',
    followup: 'sectorWonders build (operations/payloads/receivers, src/data/sectorWonders.js) + a registered place record for the cold foundry near station_ashcache: tow the ignition slug from the redoubt (ordinary massline work), seat it, and the relight is a sustained event light that floods the ash fields orange and stays as a sector feature; codex entry.',
    payload: {
      text: 'The job is to relight a dead foundry: tow the ignition slug from the redoubt, seat it in the firebox, and stand back. When the stack takes, the flood of furnace light rolls across the ash fields and every nearby lamp blinks — celebration, or applause, or both.',
    },
  },

  // SP1-016 — The Lane Priority Bond: Concord sells queue-jumping, beautifully
  // papered. Per the hones: posted by a Concord desk hull as a numbered
  // encounter; missions.js only if clean at build time.
  {
    id: 'SP1-016',
    kind: 'oneoff-mission',
    title: 'The Lane Priority Bond',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'cargo:delivered' },
    channel: 'memory',
    followup: 'Numbered encounter posted by a Concord desk hull after three completed deliveries (count in glue; missions.js/dock-contract path only if clean at build time, per hones): the bond buys a sector-day scan waiver at the rings, the skipped queue is visibly resentful, and refusing all bonds makes one particular customs officer remember your face (flavor barks).',
    payload: {
      text: 'Concord sells "lane priority bonds" — pay the fee, and for the next sector-day the patrol cutters wave you through the scan rings while everyone else queues. The queue you skip is visibly resentful. The paperwork is beautiful. That is the product.',
    },
  },

  // SP1-018 — The Sworn Scan: five clean scans and the officer deputizes you
  // mid-lane. The scan-three-hulls escort leg is the bespoke leg.
  {
    id: 'SP1-018',
    kind: 'oneoff-mission',
    title: 'The Sworn Scan',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter (fallback from the DIRTY missions.js SET_PIECE_MISSIONS pattern) after the fifth clean patrol scan in-sector: ride with a convoy and read three hulls (recon_scan stage); real contraband pays a bonus and a Concord contact, nothing found still pays — he suspected as much.',
    payload: {
      text: 'The customs officer who has scanned you five times without finding anything deputizes you mid-lane: "You\'re clean, you\'re regular, and I\'m short-staffed. Ride with this convoy and read three hulls for me." He hands over a scanner like it is a badge. It is a badge.',
    },
  },

  // SP1-025 — Chain of Custody: a sealed evidence pod and two very polite
  // problems. Per the hones: a numbered encounter with a fragile prop; news
  // via publishSituationNews, not the dirty missions files.
  {
    id: 'SP1-025',
    kind: 'oneoff-mission',
    title: 'Chain of Custody',
    sectors: ['sector_tethys_junction', 'sector_helios_prime'],
    trigger: { type: 'receipt', event: 'meridian:convoyRaided' },
    channel: 'memory',
    followup: 'Numbered encounter with a custody-pod fragile prop (not the dirty missions files, per hones) after a witnessed convoy raid: carry the sealed black box to Coalition HQ for Concord rep, with Reach and Quiet approaches at the refuel stop; the trial\'s outcome hits the news wire a week later via publishSituationNews (src/systems/crSituationKit.js); every fork is remembered.',
    payload: {
      text: 'Concord hands you a sealed evidence pod — a black box from a raid they prosecuted — to carry to Coalition HQ. The Reach wants it destroyed quietly. The Quiet want it copied. Both send very polite people to explain this at the refuel stop.',
    },
  },

  // SP2-067 — The Bar Bet That Is Real: settle it with your hull, loaded to
  // stated max, engine cold. The geometry check is the bespoke leg.
  {
    id: 'SP2-067',
    kind: 'oneoff-mission',
    title: 'The Bar Bet That Is Real',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'barContacts twice-in-a-sitting rail counter at station_beltout opens the bet: fly the approach rock loaded to exactly the hold\'s stated max, engines cold, once — approach-corridor geometry check; success pays both crews\' pooled stake (they were betting on your side, they explain), failure costs one line — "Well. Now we know." The regulars retell it with your actual numbers.',
    payload: {
      text: 'Two rock crews at the Belt Outpost rail are arguing about whether a loaded hauler can clear the approach rock on a cold coast. They bet. One turns to you: "You have a hull. Settle it." The job: fly the approach, loaded to exactly the hold\'s stated max, engine cold, once.',
    },
  },

  // SP1-125 — The Anchor Drag: latch a moving freight train and hold. The
  // tension-telemetry competition is the bespoke leg.
  {
    id: 'SP1-125',
    kind: 'oneoff-mission',
    title: 'The Anchor Drag',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.08 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter reading attachment tension telemetry (src/combat/attachments.js) when a scheduled freight column passes (uniqueOnce per column): latch and hold with no winching and no slack against a posted record kept in story.flags; the record-holder\'s identity is a legend you can meet.',
    payload: {
      text: 'The illegal one: latch a moving freight train and hold — no winching, no slack, just nerve and a line rated for less than this. The record is chalked on the last car. The railway does not endorse this. The railway rates your line, loudly, by name.',
    },
  },

  // SP2-156 — The Kepler Unbroken Offer: go ask the mast what the battle was
  // about. The listen + decoder rig are the bespoke leg; the unregistered mast
  // stands in via the dead-corvette ring scan (comms-b precedent).
  {
    id: 'SP2-156',
    kind: 'oneoff-mission',
    title: 'The Kepler Unbroken Offer',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'One-off mission gated on scanning the dead-corvette ring (poi_kepler_hulk stands in for the unregistered Unbroken mast, per entries-comms-b precedent) then docking at station_kepler_scar: a ten-minute listen with the exchange-issue decoder rig, the rig becomes a permanent inventory item that pings mast-like structures sector-wide, codex page "Still Winning."',
    payload: {
      text: 'The hunters\' exchange offers the only job the mast has ever generated: "THE MAST WON THE BATTLE. NOBODY KNOWS WHAT THE BATTLE WAS ABOUT. GO ASK IT." The job is ten minutes at the mast with an exchange-issue decoder rig. The log is one line, repeated for years: "STILL THEIRS. STILL HOLDING. STILL WINNING." Nobody knows who "they" are. The exchange pays for the ambiguity.',
    },
  },
];
