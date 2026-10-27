// src/data/special500/entries-interact-a.js — batch cat-interact-a (33 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-interact-a.json). Encounter and
// oneoff-mission kinds — the campaign's interactive core (standoffs, rescues,
// chases, offers, judgment calls). The entry carries the schedulable tell; the
// bespoke mechanic is named in `followup` and built later against this memory
// receipt, so every entry here is channel 'memory' or 'spectacle'.
//
// Every receipt trigger names a bus event verified against src/systems
// emitters: drill:caveIn drill.js; aftermathWreck:spawned aftermathWrecks.js;
// gate:verdict gateControlDirector.js; scan:completed + scan:pulse scanner.js;
// cruise:engaged cruise.js; mining:podSplit mining.js; salvage:completed
// salvage.js; ship:purchased ships.js; law:fineAssessed lawSecurity.js;
// cargo:delivered missions.js; history:deadNoted historyWear.js;
// distress:call onboarding.js; dock:docked world.js + src/ui/input.js.
// Every sector and station id is real (src/data/sectors.js,
// src/data/frontierRegions/*.js); proximity anchors are station entity ids
// (world.js attaches data.stationId from sectors.js). No sector remaps —
// every consensus sector id existed. Chained flags reference landed
// catalog entries: special500.SP1-036 (entries-anomaly-a.js, The Old Web —
// the Resident lives at its center) and special500.SP2-193
// (entries-comms-a.js, The Endings' Return Mail — the ending filed).
// Absorbed consensus ids, folded into the surviving entry per hones:
// SP1-148, SP2-141, SP1-143, SP2-129, SP3-161, SP3-147, SP3-101, SP2-142,
// SP2-158, SP3-165, SP1-188.

export const ENTRIES_INTERACT_A = [
  // SP1-063 — The Shelf Drop: your crack rings hollow and the shelf face lets
  // go. Absorbs SP1-148 (the NPC-misfire trigger and the fresh ore face at the
  // scar line); one-time cascade with a catchable boulder, no zone reshuffle.
  {
    id: 'SP1-063',
    kind: 'encounter',
    title: 'The Shelf Drop',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'drill:caveIn' },
    channel: 'memory',
    followup: 'One-time mining cascade keyed to drill:caveIn in a seeded unstable shelf: the face detaches, house-sized rock pours down the seam, one falling rock flashes payable — latch it mid-fall on your line or dive clear (asteroid layout via src/data/asteroidMotion.js seams; absorbs SP1-148\'s misfire trigger and fresh ore face; no persistent reshuffle).',
    payload: {
      text: 'Your latest crack rings hollow, and then the seam answers: the whole shelf face lets go, a slow cascade of house-sized rock pouring down the line. One of the falling rocks flashes with a metallic seam everyone in this belt would call payable. Catch it on your line mid-fall or dive clear — the belt grades on whether your hull is still where you left it, nothing else.',
    },
  },

  // SP1-084 — The Resident: the web's hermit, uninterested in leaving.
  // Chained behind SP1-036 (The Old Web) so the hermitage arrives after the
  // web is on the record. Absorbs SP2-141 as her second act.
  {
    id: 'SP1-084',
    kind: 'encounter',
    title: 'The Resident',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'flag', requires: 'special500.SP1-036' },
    channel: 'memory',
    followup: 'Dock-like vendor entity at the web\'s center wreck (placement keys to the SP1-036 Old Web leg): stories-for-supplies trade, maps of every wreck she has watched strip, lichen as a rare good; second act — the scan-count reveal that the hermitage is itself becoming a wreck that trades (absorbs SP2-141).',
    payload: {
      text: 'One wreck in the web has a breathable seam, a laid-out bunk, and a garden of vacuum-hardy lichen in a cracked dome. The resident trades stories for supplies — precise, unhostile, and completely uninterested in leaving. "The dead keep better company than the living. Quieter, too."',
    },
  },

  // SP1-004 — The Prize Auction: a captured hauler going under the hammer.
  // Absorbs SP1-143's open-auction jettison-bid escrow; the mayday stays the
  // headline and the bids stay pocket change.
  {
    id: 'SP1-004',
    kind: 'encounter',
    title: 'The Prize Auction',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_smuggler', wu: 2000 },
    channel: 'memory',
    followup: 'Mine-ring auction site with the captive hauler (mine props per mines.mineCorridorLayout, 325-minefield-wake.js precedent): bid by jettisoning credits into the open escrow (absorbs SP1-143), blow the ring open to free the hauler for faction_mts/scn rep, or ignore; the crew\'s mayday runs under the patter the whole time and the crew remembers who cleared it.',
    payload: {
      text: 'A mule hauler lashed inside a mine-ring, its manifest going under the hammer on the open band: "Lot one, forty units refined, going once." Under the auctioneer\'s patter, the hauler\'s own crew is still transmitting mayday. Nobody has bid on the mayday yet.',
    },
  },

  // SP1-002 — The Wreck Court: two crews, one arbiter, one visible fact.
  // Carries SP2-129's sole-juror recess as the court's second, smaller case.
  {
    id: 'SP1-002',
    kind: 'encounter',
    title: 'The Wreck Court',
    sectors: [],
    trigger: { type: 'receipt', event: 'aftermathWreck:spawned' },
    channel: 'memory',
    followup: 'Witness-a-claim verdict at a fresh aftermathWreck with two scavenger crews and a Reach arbiter: judge by who holds a line attached right now (read state.combat.attachments, 1210-the-deadweight pattern, via src/systems/crSituationKit.js); an honest witness earns Reach respect and a finder\'s fee, vouching against the visible line marks your transponder for SP1-003; SP2-129\'s sole-juror recess is the court\'s second, smaller case.',
    payload: {
      text: 'Two scavenger crews and a Reach arbiter orbit a fresh wreck, beacon-banners out. The arbiter hails you as a "disinterested hull" and asks you to witness the claim: which crew reached the wreck first, judged by who has a line attached right now. The evidence is visible from here. So is the temptation.',
    },
  },

  // SP3-012 — The Mirror Train: skim-corridor season, one day a year, the
  // reflected sun walked across the cloud tops. Absorbs SP3-161's
  // mirrored-escort leg — the doctrine made public and private in one entry.
  {
    id: 'SP3-012',
    kind: 'encounter',
    title: 'The Mirror Train',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Anvil approach',
      text: 'A convoy of mirror-barges flies the approach lane in a slow chain, each hull rotating in turn to walk one reflected sun-spot across the cloud tops like a searchlight relay. Fly inside the chain and your hull becomes the last mirror — the spot lands on you, and the convoy hails you, formally, as the sixth barge.',
    },
  },

  // SP3-113 — The Tug Race: Ring Fair closes (day 13), the yard tugs run.
  // Absorbs SP3-147's apron doppler mix so the race exists for ears too.
  {
    id: 'SP3-113',
    kind: 'encounter',
    title: 'The Tug Race',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'calendar', dayOfYear: 13, windowS: [430, 570] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Sker Bazaar apron',
      text: 'Six yard tugs, festival bunting still attached, race a ragged circuit around the station — engines flaring, one of them cheating through the spar field, every docked hull flashing lamps as they pass. The apron speakers carry it too: doppler, bunting snap, crowd. The winner takes a victory lap with the floods on.',
    },
  },

  // SP3-143 — renamed The Hauling Chorus per hones (c); absorbs SP3-101's
  // engine-pitched oscillator as the fifth voice. The Ascendant Choir keeps
  // its word.
  {
    id: 'SP3-143',
    kind: 'encounter',
    title: 'The Hauling Chorus',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'station_expanse', wu: 1500 },
    channel: 'spectacle',
    payload: {
      from: 'Colony approach',
      text: 'A hauling convoy sings on the open band — a work song in four rough synthesized voices, one per hull, each slightly out of sync with its own engine. Formate on them and your engine\'s hum is folded into the mix as the fifth voice. The song is not recorded anywhere. It only exists while somebody is hauling.',
    },
  },

  // SP1-001 — The Manifest Weigh-In: the discrepancy is the tithe.
  {
    id: 'SP1-001',
    kind: 'encounter',
    title: 'The Manifest Weigh-In',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'memory',
    followup: 'Numbered encounter file src/data/encounters/600-weigh-in.js on script toll (registered in src/data/encounters.js, receipt row in ENCOUNTER_RECEIPTS): the weighmaster names the mass-versus-manifest delta in commodity, never in credits; pay by jettison or in coin; the weighmaster\'s name is kept on the receipt for later encounters.',
    payload: {
      text: 'A Reach weighmaster cutter locks alongside and demands a live manifest audit. "Your hold says forty units. Your mass says fifty-three." They name the delta, not a credit number. The discrepancy is the tithe, and the tithe is payable in kind.',
    },
  },

  // SPX-B-09 — The Anchor Light: the tow you cannot pay for. The hashDaily is
  // only the scheduler; the hull-state gate (<25% integrity, heat 0, >800 WU
  // from any station) is consumed by the bespoke leg against this receipt.
  {
    id: 'SPX-B-09',
    kind: 'encounter',
    title: 'The Anchor Light',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Silent tug NPC gated on the real hull state (integrity below 25%, heat at zero, more than 800 WU from any station — the receipt fires the check, the gate consumes it): takes an offered line, tows via massline physics to the nearest station ring, casts off unpaid; registry check later reads a crew of zero and a home port that closed years ago; once per save.',
    payload: {
      text: 'A dead tug you have never seen settles alongside without a hail, takes your line if you offer it, and tows you — fast, competent, silent — to the nearest station ring. One anchor light, no transponder. At the ring it casts off and is gone before you can pay or thank it.',
    },
  },

  // SPX-B-05 — The Sprung Hold: a loaded spring wearing a freighter.
  {
    id: 'SPX-B-05',
    kind: 'encounter',
    title: 'The Sprung Hold',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.05 },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter with pre-latched attachments and a breakable constraint chain (1210-the-deadweight pattern): latch the bent beam with the massline before cutting the frayed strap, or the pallet launches through the field shedding cargo; catch it mid-flight on a line for the whole hold plus the belt\'s respect, miss and it scatters salvage across a kilometer, first-come.',
    payload: {
      text: 'A dead freighter\'s hold is a loaded spring: cargo strapped under a bent beam, one frayed strap holding all of it, the hull visibly bowed. Cut it wrong and the pallet leaves like a comet, shedding cargo the whole way. Cut it right and it settles. The scan tell is the bow and the singing strap.',
    },
  },

  // SPX-C-06 — Hollow Station's Backlog: paper-snow, one rock, two crews.
  {
    id: 'SPX-C-06',
    kind: 'encounter',
    title: "Hollow Station's Backlog",
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'station_drift', wu: 2400 },
    channel: 'memory',
    followup: 'Claim-office wreck placement on the Hollow Station approach; twenty-two cycles of filings as light debris props; carry either crew\'s filing or file both and let the stamp\'s order decide; the winning claim\'s beacon lights via claimableBodies and the losing crew becomes a recurring rival contact via story.flags.',
    payload: {
      text: 'The claim office still queues paper into a chute that goes nowhere — twenty-two cycles of filings flutter out a broken seam and drift in slow paper-snow. Two live crews are racing to re-file the same rock\'s claim at the one working stamp. Both offer you carriage. The paper is real, the race is real, the rock is one rock.',
    },
  },

  // SPX-A-06 — The Borrowed Ladder: one tether tied by someone who expected
  // it to matter.
  {
    id: 'SPX-A-06',
    kind: 'encounter',
    title: 'The Borrowed Ladder',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter: latch the intact ladder-tether lashed between the two wrecks (state.combat.attachments read, 1210 pattern) and the log cylinder slides down the tether into your hold with its note; a codex fragment now; re-latching on later visits yields nothing but a polite click.',
    payload: {
      text: 'Two wrecks lashed together by one intact ladder-tether, the only line in the field that was tied by someone who expected it to matter. Latch the ladder and a log cylinder slides down the tether into your hold, with a note: "RETURN ANYTIME. IT LIKES THE TRIP."',
    },
  },

  // SP1-195 — The Witness: the kid on the buoy asks the question the belt
  // will not.
  {
    id: 'SP1-195',
    kind: 'encounter',
    title: 'The Witness',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'memory',
    followup: 'Answer scene keyed to a toll lane with priorOutcome escaped, five sector-days later (numbered ambient encounter): honest yes and the kid respects it — the toll quietly caps for you thereafter; a badly-made lie and the kid knows anyway, and likes you more; the answer flag is consumed by toll pricing (gateControlDirector seam).',
    payload: {
      text: 'A kid working the toll lane\'s buoy — real job, too young for it — looks up your registry on the public board and asks the question the belt won\'t: "It says a hull with this number ran the toll in spring. Was that you?" The lane is empty. The buoy is counting. The kid just wants to know if the legends are true.',
    },
  },

  // SP1-037 — The Executor Arrives: not hostile. Just early.
  {
    id: 'SP1-037',
    kind: 'encounter',
    title: 'The Executor Arrives',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'salvage:completed' },
    channel: 'memory',
    followup: 'Numbered selfRegistered encounter firing ~40 s after salvage:completed on a seeded family-flagged wreck, uniqueOnce per wreck: hand over the logbook (their story continues — a letter reaches you two sectors later via comms:popup), refuse (the wreck\'s plaque reads colder when you pass again), or fight them (a real bounty).',
    payload: {
      text: 'Just as the dead salvager\'s strongbox cracks, a battered family hauler drops out of cruise. "That was my father\'s hull. Take the credits. The logbook stays." They are not hostile. They are just early.',
    },
  },

  // SP1-031 — The Keel Bell: the bell tolls once, then the section falls.
  {
    id: 'SP1-031',
    kind: 'encounter',
    title: 'The Keel Bell',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_ceres', wu: 1300 },
    channel: 'memory',
    followup: 'Keel-release competition hooked to the shipbreak cut seam (src/systems/ceresWorkfleet.js, src/data/ceresShipbreak.js): first line on the falling keel section before the catcher net takes first refusal on the scrap — heavy bonus payout and the yard crew\'s respect; chalk mark on the tally board cross-ref SP1-040; yard hands\' odds move in real time.',
    payload: {
      text: 'The yard\'s cutters free a keel section and an actual bell tolls over the band, once, and then the section falls. Anyone with a line on it before the catcher net gets first refusal on the scrap. The yard hands are taking bets on which hull catches it.',
    },
  },

  // SP1-041 — The Two-Line Problem: two lines, one pod, and the pod has
  // opinions.
  {
    id: 'SP1-041',
    kind: 'encounter',
    title: 'The Two-Line Problem',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'mining:podSplit' },
    channel: 'memory',
    followup: 'Standoff read from two active attachments on one ore-pod target (src/combat/attachments.js, numbered ambient encounter): cut one line (the loser hates you, the winner pays), catch the pod yourself (nobody pays, everyone respects), or watch physics settle it and collect from both as an independent witness.',
    payload: {
      text: 'Two salvagers have both latched the same ore pod and are having a towing argument at thirty WU/s, screaming over the band about line seniority. The pod, notably, has opinions, and it is gaining on a rock.',
    },
  },

  // SP1-024 — The Clock Trap: the trip-lines are strung to the second.
  {
    id: 'SP1-024',
    kind: 'encounter',
    title: 'The Clock Trap',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'cruise:engaged' },
    channel: 'memory',
    followup: 'Ambush-script variant (020-ambush-snare.js) with customs_cutter archetypes and the sensor_tripline signature from src/data/ambushSignatures.js made physical: three cutters box you out of cruise on the marked lane — stand and be fined (a real collectable-at-dock notice item) or bolt and be chased.',
    payload: {
      text: 'You drop out of cruise into a pre-laid speed trap: three cutters in a box formation with radar trip-lines strung between them, timed to the lane\'s cruise window to the second. "Mass and velocity logged. Courtesy notice issued." The notice is a real item. It lowers prices at Concord docks by nothing, and it is fun to have.',
    },
  },

  // SP1-030 — The Insurance Hull: fraud-arc anchor, three acts. Absorbs
  // SP2-142's serial-plate payout and SP2-158's monument aftermath; the
  // mid-act tow stays the headline.
  {
    id: 'SP1-030',
    kind: 'oneoff-mission',
    title: 'The Insurance Hull',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Fraud arc, three acts (absorbs SP2-142 serial-plate payout and SP2-158 measured-monument aftermath): let the scuttle happen and bank a real favor stored in state.story.flags, report it (insurance rep, they hate you), or tow them to the refinery mid-act, which nobody has a rule for; refinery reaction via news:publish. Hull damage-state read in a numbered selfRegistered encounter.',
    payload: {
      text: 'A hauler is positioning itself to scuttle on a refinery\'s sensor blind spot — venting arranged just so, distress beacon conveniently dead. The crew is bad at crime and knows it. "You see nothing, we owe you a favor." It is the first honest sentence they have transmitted all day.',
    },
  },

  // SP3-162 — The Triangulation: two bearings, one fix, and the plate comes
  // back showing your own lines. Absorbs SP3-165's three-plate lens-drift
  // proof as the payoff plate.
  {
    id: 'SP3-162',
    kind: 'oneoff-mission',
    title: 'The Triangulation',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'receipt', event: 'scan:pulse' },
    channel: 'memory',
    followup: 'landmarkMissions.js row (scanner-authority precedent in the same file): take any two scan:pulse logs from different positions, the Archive computes the fix, then photograph the fix at the next pulse; the payoff plate shows your own two bearing lines, correct and useless; codex entry plus small bonus; absorbs SP3-165\'s three-plate lens-drift proof.',
    payload: {
      text: '"Two bearings. One fix. Bring the coordinates." The Archive takes your two pulse logs, computes the fix, and asks you to photograph it at the next pulse. The plate comes back showing your own two bearing lines crossing — correct, and useless, and yours.',
    },
  },

  // SP1-199 — The Successor: someone bought your first fit, at auction, with
  // saved wages. Absorbs SP1-188's maneuver lesson as the tip content; keyed
  // to the first-hull record or a two-hour fit snapshot, no new ledger.
  {
    id: 'SP1-199',
    kind: 'oneoff-mission',
    title: 'The Successor',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:purchased' },
    channel: 'memory',
    followup: 'Tip-choice scene keyed to the save\'s first-hull record or a two-hour fit snapshot (no new loadout-history ledger; key the copycat to most-used weapon class and escort count from existing deed records): the chosen tip becomes the successor NPC\'s persistent doctrine flag, their record accrues, and the belt credits the technique to your name via news:publish with a date and a witness. Absorbs SP1-188\'s maneuver lesson as tip content.',
    payload: {
      text: 'A kid has bought — genuinely bought, at auction, with saved wages — a ship fitted exactly like your first fit, down to the module you replaced years ago. "It\'s a good starter. Everyone says so. Everyone says YOU said so, years ago, to somebody. One tip. That\'s all I\'m asking."',
    },
  },

  // SPX-C-08 — The Reinstatement: the office hands the notice to whoever is
  // standing there, and you are standing there.
  {
    id: 'SPX-C-08',
    kind: 'oneoff-mission',
    title: 'The Reinstatement',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Delivery choice gated on state.story.seenComms.pers_voss_suspended (the claim-desk encounter reads the seen-flag before staging): carry the reinstatement to the second crew yourself — Voss rep +4, the second crew\'s rep +2, codex line "The system ate both. One hull carried the paper." — or refuse and be filed; the refusal reaches the second crew by wire, colder.',
    payload: {
      text: 'Voss\'s suspension is lifted and the original claim reinstated; the filing is explicit that the second crew "will not be notified." The claim office hands the notice to whoever is standing at the desk, and you are standing at the desk. The second crew filed in time, in the only window they had, on a filing system that ate both.',
    },
  },

  // SPX-C-04 — Dorin's Dead Drop: pages that prove the fines were
  // pre-written.
  {
    id: 'SPX-C-04',
    kind: 'oneoff-mission',
    title: "Dorin's Dead Drop",
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'memory',
    followup: 'Numbered encounter with a two-outcome handoff of the cut seal-log pages: deliver to the Archive (records restored, standing +4) or sell to the hunters\' exchange (credits — and within the week one pre-written fine arrives for you, personally, keyed to the outcome flag; the ledger is honest about what it does); seal-log prose as codex overlay "Pre-Written".',
    payload: {
      text: 'The drop holds pages cut from a Concord seal-log: which fines were pre-written, which inspections were scheduled before the ships were. Filecleaver Dorin\'s marginalia argues with the stamps in a neat, furious hand. The hunters\' exchange pays for the pages too, and its scanner sweep is on a clock you can read.',
    },
  },

  // SPX-B-10 — The Hand-Me-Down Route: thirty years of route, one torn page.
  {
    id: 'SPX-B-10',
    kind: 'oneoff-mission',
    title: 'The Hand-Me-Down Route',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'cargo:delivered' },
    channel: 'memory',
    followup: 'Dock encounter vendor: the sealed route envelope grants berth-priority flags read by docking; one listed berth is seeded a cheat from programSeed — it stings once and becomes your best contact when you catch it; the retiring regular retires to a visitable berth and asks how the route is doing.',
    payload: {
      text: 'She sells you her route — a sealed envelope of berths, timings and contacts, thirty years of it — for her retirement fund, exact change, no haggling. One page is torn out. "One of these berths will cheat you. Finding which one is the tuition. I never did."',
    },
  },

  // SPX-A-12 — The Insurance Frame: one exposure before the breakers eat it.
  {
    id: 'SPX-A-12',
    kind: 'oneoff-mission',
    title: 'The Insurance Frame',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'calendar', dayOfYear: 26, windowS: [0, 600] },
    recurring: true,
    channel: 'memory',
    followup: 'landmarkMissions.js row with the seasonal window: scan-pulse the flagged derelict before the seeded scrapper convoy arrives; the plate pays, the convoy\'s tally comes up one hull short, documented; small bonus plus codex page; the convoy crew hails you once, professionally unamused.',
    payload: {
      text: '"One exposure before the breakers eat it. The underwriter wants the paint verified." The flagged derelict is on the plate list and the scrapper convoy is already en route. Scan it in time and the plate pays; the convoy\'s tally comes up one hull short, documented.',
    },
  },

  // SP2-191 — The 47-B Cold Call: the post-ending work that is not 47-A.
  // Chained behind SP2-193 (the ending filed), scoped to the Ashfall return.
  {
    id: 'SP2-191',
    kind: 'oneoff-mission',
    title: 'The 47-B Cold Call',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'flag', requires: 'special500.SP2-193' },
    channel: 'memory',
    followup: 'Packet item state machine on the spine\'s post-ending continuation route (end-state gate + one-off mission): one unlisted run, no manifest, one blank page; returning the packet un-filled is the only payout in the game that comes with an apology attached; filling it makes it a blank check on your hull, and Kael\'s warning was about exactly that.',
    payload: {
      text: 'The courier does not ask again — but a different voice does, once: "47-B is the open work. 47-A stays closed. This is not 47-A. It is smaller, quieter, and it pays in the only currency the Reach respects: done." The packet holds one unlisted run, no manifest, and one blank page.',
    },
  },

  // SP1-078 — The Cold Manifest: six pods, power for one, the captain's whole
  // law.
  {
    id: 'SP1-078',
    kind: 'oneoff-mission',
    title: 'The Cold Manifest',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Six-pod thaw choice, three seeded outcomes (a mechanic, a debtor, a child of somebody important) or deliver all six frozen for the honest price; the woken NPC appears at a dock and remembers the order of the thaw; authored one-off in the SET_PIECE pattern, fallback numbered selfRegistered with three outcome branches.',
    payload: {
      text: 'A dead hauler\'s hold contains six cryo pods, labels worn, power for one. The manifest\'s last line, in the captain\'s hand: "Thaw in order of fare paid. I\'m sorry. That\'s the whole law out here."',
    },
  },

  // SP2-046 — The Recruitment Letter: Sker Vane's office writes to a hull it
  // has weighed. Numbered selfRegistered job per hones (missions.js only if
  // clean at build).
  {
    id: 'SP2-046',
    kind: 'oneoff-mission',
    title: 'The Recruitment Letter',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'memory',
    followup: 'Numbered selfRegistered job (missions.js data only if clean at build): shadow a Meridian toll run and report its timing — no shots fired, the Reach wants the schedule, not the cargo; 800 cr in unmarked plates, Reach rep +10, Concord heat +8; refusing twice closes the thread with one final line: "Memorable." Sker Vane voice per FIGURES.',
    payload: {
      text: 'Sker Vane\'s office writes: "The Reach weighed you. You are short, loud, and useful. One job, no contract paper, paid in hull parts and not asking. Refusal is fine. Refusal twice is memorable."',
    },
  },

  // SP2-072 — The Wreck Elder's Registry: the job is memory, not salvage.
  {
    id: 'SP2-072',
    kind: 'oneoff-mission',
    title: "The Wreck Elder's Registry",
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'memory',
    followup: 'One-off keyed to wreck-visit flags: re-scan the three named wreck sites and read the hull plates aloud on an open channel while Senna listens; every named wreck gains a permanent memorial tag via the uniqueWrecks presentation; DMC rep +5; codex page "The Keeper of Names."',
    payload: {
      text: 'Dustwife Senna keeps the names, and she is short three. She asks for them from wrecks you have flown past: scan the sites again and read the hull plates aloud on an open channel while she listens. The job is memory, not salvage. It pays like memory, too — which is to say it does not, and it matters more.',
    },
  },

  // SP2-181 — The Escort Of One: no gun. A second transponder on the lane.
  {
    id: 'SP2-181',
    kind: 'oneoff-mission',
    title: 'The Escort Of One',
    sectors: [],
    trigger: { type: 'receipt', event: 'distress:call' },
    channel: 'memory',
    followup: 'Proximity escort check (fly slow and visible beside the convoy, ask for nothing) with the hold-left-full as the real cost; completion pays no credits — a hand-painted child\'s drawing as an inventory item and Mara standing +6, later converting to a unique hull discount no other faction offers. Mara voice per FIGURES (src/data/narrative.js).',
    payload: {
      text: 'A refugee convoy hull broadcasts not for escort but for witness: "We do not need a gun. We need a second transponder on the lane so the toll men count two hulls, not one. Fly beside us. Ask for nothing. We will know what it cost you."',
    },
  },

  // SP2-038 — Fennel Comes Home: the vote is nine to one, and the one is
  // Bramble.
  {
    id: 'SP2-038',
    kind: 'oneoff-mission',
    title: 'Fennel Comes Home',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Micro-fetch bound per the roaming-stories pattern (src/data/roamingStories.js; the leg gates on the lost_goat band/hail surface having been heard): a GOAT (FENNEL) cargo unit with a custom commodityId, ferried back when Bramble\'s route crosses the sector (event-driven rendezvous); finder fee plus the permanent bar regular line about the third stool.',
    payload: {
      text: 'A hydroponics rack reports "one dairy goat, self-stowed." Bramble\'s hauler is two sectors away. The bar takes a vote: everyone agrees the goat gets to stay; the vote is nine to one, and the one is Bramble.',
    },
  },

  // SP2-051 — Voss's Open Page: a favor between ledgers.
  {
    id: 'SP2-051',
    kind: 'oneoff-mission',
    title: "Voss's Open Page",
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Single-flight survey run with a live tally rig down the old convoy route (signal:surveyFiled is already a MAIL_EVENT_NAMES event in src/data/mail.js; the staging leg gates on state.story.seenComms.pers_voss_suspended): the scale confirms the hole — one-line ledger correction, DMC rep +5, the clerk keeps the page open — or reads one extra hull, which becomes the codex page "The Forty-First."',
    payload: {
      text: 'The claim office\'s ledger is open to one page with a paper clip: the convoy that never logged. Voss asks — not as a mission, as a favor between ledgers — to fly the old route once with a live tally rig and let the scale say what the page says.',
    },
  },

  // SP1-092 — The Paid Fare: one manifest line that refuses to be a total
  // loss.
  {
    id: 'SP1-092',
    kind: 'oneoff-mission',
    title: 'The Paid Fare',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Authored search chain (recon_scan stages over seeded debris, SET_PIECE pattern, fallback numbered chain): scan candidate debris for pod transponders; seeded ending found-alive (a passenger with one scene\'s worth of story, via crew data) or found-at-peace (the life-support log is the reward).',
    payload: {
      text: 'Everything about the wreck says total loss except one line of the manifest: a passenger who paid in full, boarded, and was listed aboard at impact. The pod bays are empty. The pods themselves are somewhere, and pods keep life-support logs.',
    },
  },

  // SP1-071 — The Warm Tow: pods travel warm. Your hull is the ambulance.
  {
    id: 'SP1-071',
    kind: 'oneoff-mission',
    title: 'The Warm Tow',
    sectors: ['sector_tethys_junction', 'sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'memory',
    followup: 'tow_recovery-type mission row in MISSION_TYPES: pod latched and running warm, pod temperature as a deadlineS proxy for cold hours, the threat entirely physical — debris, tolls, your own line discipline; arrival pays and the patient\'s family names a berth after your hull.',
    payload: {
      text: 'A stasis pod\'s heater is dead and the patient has cold hours, not days. The medical station\'s rule is immutable: pods travel warm. Your hull, running warm, latched to the pod, is the ambulance. The pod is fragile. The lane is not.',
    },
  },
];
