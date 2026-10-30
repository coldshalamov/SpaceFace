// src/data/special500/entries-annex2-d.js — annex wave 2, file D (SPX-E-151..200).
//
// The wave's back half: place records for the sectors file A did not reach,
// after-chains that turn earlier entries into continuing documents (the
// catalog's signature move), flag-gated returns to places already seen, and
// the micro-series — the postmaster, the underwriters, the founding twins,
// the inspector-general — that run across more than one entry.

export const ENTRIES_ANNEX2_D = [
  // ── place records: the fifteen sectors file A didn't reach ────────────────

  // SPX-E-151 — The Runner's Memorial's Race Bib.
  {
    id: 'SPX-E-151',
    kind: 'world-oneoff',
    title: 'The Runner\'s Race Bib',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'proximity', nearStation: 'poi_nyx_runner_memorial', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The memorial to the march\'s fastest runner carries his race bib — number 000, the number reserved for pilots who run without filing intent. He filed intent once, the story goes, and the desk lost it, and he decided the desk had the right idea. The bib is sealed in glass. The glass is scratched on the inside.',
    },
  },

  // SPX-E-152 — The Unwritten Bridge's Toll.
  {
    id: 'SPX-E-152',
    kind: 'anomaly',
    title: 'The Unwritten Bridge\'s Toll',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'proximity', nearStation: 'world_site_nyx_unwritten_bridge', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'A bridge of pylons that ends mid-gap — construction stopped the day the funding act was repealed, in mid-sentence, the way the bridge stops mid-gap. The toll booth at the near end was finished and staffed for one season. It still opens for the anniversaries. Ships that dock to look are charged nothing, and given a receipt.',
    },
  },

  // SPX-E-153 — The Beacon's Honest Count.
  {
    id: 'SPX-E-153',
    kind: 'world-oneoff',
    title: 'The Beacon\'s Honest Count',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'proximity', nearStation: 'poi_hyperion_beacon', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The cut\'s navigation beacon counts the hulls that pass it and posts the number in its hail — a running census, exact, going back to the first day of the cut. Your hull is number four hundred and eleven thousand and change. The beacon reads the number plainly, the way it reads all of them, and there is something in the plainness that is almost a welcome.',
    },
  },

  // SPX-E-154 — The Tow Marks' Ledger.
  {
    id: 'SPX-E-154',
    kind: 'easter-egg',
    title: 'The Tow Marks\' Ledger',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'proximity', nearStation: 'poi_kepler_tow_marks', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The scar\'s deepest rocks carry tow marks — drag lines scored into the stone by a hundred years of hulks pulled to salvage. The scar\'s crews read them like tree rings: every mark a ship that was worth pulling, and the depth of the score roughly the size of the argument it took to pull it.',
    },
  },

  // SPX-E-155 — The Measure Stake's Complaint.
  {
    id: 'SPX-E-155',
    kind: 'anomaly',
    title: 'The Measure Stake\'s Complaint',
    sectors: ['sector_orcus_shadow'],
    trigger: { type: 'proximity', nearStation: 'poi_orcus_measure_stake', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The survey stake planted to measure the shadow\'s drift reports a number the survey declines to use — the stake insists the shadow is a handspan longer than last year, and the survey has re-surveyed it eleven times with eleven different results. The stake\'s number is the only one that has never changed. The survey\'s note reads, in full: INSTRUMENT CONFIDENT.',
    },
  },

  // SPX-E-156 — The Red Sun Engine's Idle Threat.
  {
    id: 'SPX-E-156',
    kind: 'anomaly',
    title: 'The Red Sun Engine\'s Idle Threat',
    sectors: ['sector_rhea_cinder'],
    trigger: { type: 'proximity', nearStation: 'world_site_rhea_red_sun_engine', wu: 400 },
    channel: 'spectacle',
    payload: {
      from: 'The engine field',
      text: 'The red sun engine — a pylon array built to flare a false dawn across the cinder — powers up twice a day for ninety seconds and stands down. It was built to frighten a raider flotilla and it worked, once, sixty years ago. It still runs the firing sequence, on the old schedule, for an enemy that surrendered before the second dawn.',
    },
  },

  // SPX-E-157 — The Glass Harp's Cold Note.
  {
    id: 'SPX-E-157',
    kind: 'anomaly',
    title: 'The Glass Harp\'s Cold Note',
    sectors: ['sector_haumea_rift'],
    trigger: { type: 'proximity', nearStation: 'world_site_haumea_glass_harp', wu: 350 },
    channel: 'spectacle',
    payload: {
      from: 'The harp field',
      text: 'The rift\'s ice-glass fins ring in the solar wind — long cold notes, each fin a different pitch, tuned by nothing but accretion. Stand in the field and the notes pan across you like weather with a score. The rift crews chart the harp\'s health by how many fins still sing. This year, all of them.',
    },
  },

  // SPX-E-158 — The Dead Drop's Etiquette. (the postmaster, i)
  {
    id: 'SPX-E-158',
    kind: 'easter-egg',
    title: 'The Dead Drop\'s Etiquette',
    sectors: ['sector_eris_margin'],
    trigger: { type: 'proximity', nearStation: 'poi_eris_dead_drop', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The margin\'s dead drop has rules scratched on the lid: TAKE ONLY WHAT\'S ADDRESSED. LEAVE ONLY WHAT CAN\'T BE. The box holds eleven letters right now, and the oldest is addressed to a ship that was scrapped thirty years ago. The last postmaster left standing orders: the box is not a grave until the postmark says so.',
    },
  },

  // SPX-E-159 — The Struck Face's Fresh Scar.
  {
    id: 'SPX-E-159',
    kind: 'anomaly',
    title: 'The Struck Face\'s Fresh Scar',
    sectors: ['sector_phoebe_echo'],
    trigger: { type: 'proximity', nearStation: 'poi_phoebe_struck_face', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The struck face — the cliff where the old impact lithographed the rock — has a new scar across its middle, decades younger than the rest, and the survey cannot find the impactor that made it. The locals call it the signature. The survey calls it pending. It is the only thing in the echo sector that does not repeat.',
    },
  },

  // SPX-E-160 — The Ship in Ice's Manifest.
  {
    id: 'SPX-E-160',
    kind: 'anomaly',
    title: 'The Ship in Ice\'s Manifest',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'proximity', nearStation: 'world_site_nereid_ship_in_ice', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The hulk in the ice is older than the shoal\'s records, and its manifest — recovered in shards — lists cargo under a single line: ONE PASSENGER. The ice keeps the rest. The shoal\'s rule is you do not drill the ship, only circle it, the way you circle a house where someone might be sleeping.',
    },
  },

  // SPX-E-161 — The Bearer Post's Last Delivery.
  {
    id: 'SPX-E-161',
    kind: 'easter-egg',
    title: 'The Bearer Post\'s Last Delivery',
    sectors: ['sector_proteus_well'],
    trigger: { type: 'proximity', nearStation: 'poi_proteus_bearer_post', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The bearer post — the well\'s old message buoy — still carries its last delivery: a packet addressed TO WHOEVER COMES NEXT, dated the day the post was decommissioned. It has never been opened. The well\'s crews pass it like a relic: you may read it when you retire it. Nobody has retired it. The packet waits for somebody\'s last day.',
    },
  },

  // SPX-E-162 — The Watcher's Field Glass.
  {
    id: 'SPX-E-162',
    kind: 'world-oneoff',
    title: 'The Watcher\'s Field Glass',
    sectors: ['sector_triton_wake'],
    trigger: { type: 'proximity', nearStation: 'poi_triton_watcher', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The watcher post has a field glass bolted to the rail — pointed at nothing in particular, focused by fifty years of hands, each keeper adjusting it a degree toward whatever they thought was coming. It points, currently, at the shipping lane. The watchers say it drifts toward whatever the wake is about to do next. The optics say it drifts toward the sun. Both readings have been right often enough.',
    },
  },

  // SPX-E-163 — The Stepwell's Deeper Landing.
  {
    id: 'SPX-E-163',
    kind: 'anomaly',
    title: 'The Stepwell\'s Deeper Landing',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'proximity', nearStation: 'world_site_eunomia_stepwell', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The stepwell — cut platforms descending the crater wall — has one landing below the surveyed bottom: older steps, chisel-marked, going down past where the water line says anything should be. The gulf\'s pilots lower supplies to the last mapped platform and someone always finds them a meter lower than left. The survey calls it slippage. The pilots call it the well accepting deliveries.',
    },
  },

  // SPX-E-164 — The Cadence Beacon's Flat Note.
  {
    id: 'SPX-E-164',
    kind: 'anomaly',
    title: 'The Cadence Beacon\'s Flat Note',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'proximity', nearStation: 'poi_sedna_cadence', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The cadence beacon marks the dark\'s outer edge with a metronome pulse — one ping, regular, eternal — except for a flat note it hits once every few years, logged by listeners as a skipped heartbeat. Sedna\'s archive keeps a running list of the flats. The intervals between them are getting shorter. The archive\'s only comment is the list itself.',
    },
  },

  // SPX-E-165 — The Way Drop's Second Postmaster. (the postmaster, ii)
  {
    id: 'SPX-E-165',
    kind: 'easter-egg',
    title: 'The Way Drop\'s Second Postmaster',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'proximity', nearStation: 'poi_dione_deaddrop', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The lane\'s dead drop has a caretaker nobody appointed — a hull that swings by on the long circuit, collects what\'s addressed to the living, delivers it slow. The letters arrive years late, marked with a stamp that says nothing official. The desk calls the carrier the second postmaster. The second postmaster has never cashed a paycheck. There was never a first.',
    },
  },

  // ── after-chains: earlier entries acquire new meaning ─────────────────────

  // SPX-E-166 — The Times Checked Column: the ledger counts your looking.
  {
    id: 'SPX-E-166',
    kind: 'easter-egg',
    title: 'The Times Checked Column',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    after: ['SP1-097'],
    channel: 'commsLog',
    payload: {
      from: 'Unregistered buoy',
      text: 'A wire from the buoy: the ledger has a third column now — TIMES CHECKED — and your line has a first entry in it. The favors column still reads the same. The checking column, you notice, is the one that updates itself.',
    },
  },

  // SPX-E-167 — The Margin Withdraws: third fracture, no more welcome.
  // (nth orders the chain — an after-gate would starve the counter.)
  {
    id: 'SPX-E-167',
    kind: 'easter-egg',
    title: 'The Margin Withdraws',
    sectors: [],
    trigger: { type: 'receipt', event: 'hull:fractured', nth: 3 },
    channel: 'commsLog',
    payload: {
      from: 'BULKHEAD 3 LOG',
      text: 'Damage report complete. This time the margin line is shorter, same unauthored hand: "THIRD TIME. STILL KEEPING COUNT. STOP MAKING ME."',
    },
  },

  // SPX-E-168 — The Twelfth Tether's Waiting List: the song has applicants.
  {
    id: 'SPX-E-168',
    kind: 'easter-egg',
    title: 'The Twelfth Tether\'s Waiting List',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    after: ['SPX-D-01'],
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The twelfth tether has a waiting list now — crews filing dibs on the unwritten song, each claiming the honor of being its first name. The list is kept by the same band that keeps the anchor point clear. The band\'s rule stands: nobody hears the song first. Everybody gets to wait for it.',
    },
  },

  // SPX-E-169 — The Operator's Third Signature: the encore has a sequel.
  {
    id: 'SPX-E-169',
    kind: 'comms-event',
    title: 'The Operator\'s Third Signature',
    sectors: ['sector_phoebe_echo'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    after: ['SP2-154'],
    channel: 'commsLog',
    payload: {
      from: 'Phoebe Echo array',
      text: 'The retired channel answers again — this time with a note the old-timers read twice: the operator\'s signature, a third one, appended under the two they already knew. She is still signing work. The channel is still "retired." The array and the retirement remain in quiet, permanent disagreement about which of them is lying.',
    },
  },

  // SPX-E-170 — The Checkpoint Cat's Successor: the new hire.
  {
    id: 'SPX-E-170',
    kind: 'easter-egg',
    title: 'The Checkpoint Cat\'s Successor',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    after: ['SP1-023'],
    channel: 'comms',
    payload: {
      from: 'Dock hands',
      text: 'The checkpoint has a successor — a dock dog, hired, per the memo, for complementary coverage. The dog inspects nothing and accepts tribute anyway. The cat watches from the booth roof, unimpressed, on a schedule of its own devising. The memo lists them both as personnel. The personnel list is accurate.',
      ttl: 8,
    },
  },

  // SPX-E-171 — The Buoy's Last Broadcast: VHL-4471 goes quiet.
  {
    id: 'SPX-E-171',
    kind: 'easter-egg',
    title: 'The Buoy\'s Last Broadcast',
    sectors: [],
    trigger: { type: 'receipt', event: 'jump:arrive' },
    after: ['SP2-035'],
    channel: 'commsLog',
    payload: {
      from: 'Signal desk',
      text: 'VHL-4471 transmitted once more after you chose — a single frame, logged by every listening post in the reach: the coordinates of every hull that ever answered it. Then silence, on schedule, as filed. The signal desk calls it the cleanest retirement on record. The coordinates are filed under GUESTS.',
    },
  },

  // SPX-E-172 — The Chord's Downbeat: the new year's first minute resolves
  // the fortieth day's chord. (dayOfYear is 0-39; "the first minute of the
  // new year" is day 0's opening window, gated on the chord having rung.)
  {
    id: 'SPX-E-172',
    kind: 'easter-egg',
    title: 'The Chord\'s Downbeat',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 0, windowS: [0, 60] },
    recurring: true,
    after: ['SP3-151'],
    channel: 'commsLog',
    payload: {
      from: 'Every band',
      text: 'The new year\'s first minute carries the downbeat — the note the old year\'s chord was bending toward all forty days, arriving the way a period arrives at the end of a sentence. The bands hold it for one breath. Then the ledger opens a new column.',
    },
  },

  // SPX-E-173 — The Founding's Rebuttal: one station objects to the others.
  {
    id: 'SPX-E-173',
    kind: 'easter-egg',
    title: 'The Founding\'s Rebuttal',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 1, windowS: [330, 600] },
    recurring: true,
    after: ['SPX-D-20'],
    channel: 'news',
    payload: {
      text: 'FOUNDING DAY, LATE EDITION: a fourth station has filed its own founding story — claiming the other three were all founded, in order, as outbuildings of it. The claim is on file. The file\'s provenance section is one word: probably. The wire prints it last and largest, under the headline: STILL DISPUTED, NOW WITH ANNEXES.',
      kind: 'notices',
    },
  },

  // SPX-E-174 — The Gate's Preferred Customer: fifth crossing.
  {
    id: 'SPX-E-174',
    kind: 'easter-egg',
    title: 'The Gate\'s Preferred Customer',
    sectors: [],
    trigger: { type: 'receipt', event: 'verge:checkpointCleared', nth: 5 },
    channel: 'comms',
    payload: {
      from: 'Verge checkpoint',
      text: 'CLEARED — and then, unprompted, in a register the gate reserves for ships it has decided to enjoy: HAVE A NICE TRANSIT. The toll does not drop. It never drops. But somewhere in the gate\'s filing you have been moved from TRAFFIC to FIXTURE. The fixture rate is the same. The fixture is warmer.',
      ttl: 8,
    },
  },

  // SPX-E-175 — The Pool Pays Out: the Bell Rock rings and the house collects.
  {
    id: 'SPX-E-175',
    kind: 'easter-egg',
    title: 'The Pool Pays Out',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'mining:yield', nth: 3 },
    after: ['SPX-D-04'],
    channel: 'commsLog',
    payload: {
      from: 'Drill band',
      text: 'The hollow rock rang and the office pool paid — to the house, as always. The tin cup on the boulder collected its winnings in the usual manner: left out overnight, found heavier in the morning. Nobody admits to paying it. The boulder\'s balance is the only account in the expanse that is never audited and never doubted.',
    },
  },

  // SPX-E-176 — The Moisture Audit: the 0.7 tonnes gets itemized.
  {
    id: 'SPX-E-176',
    kind: 'easter-egg',
    title: 'The Moisture Audit',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    after: ['SP2-010'],
    channel: 'commsLog',
    payload: {
      from: 'Audit desk',
      text: 'The moisture audit posted: the shaft\'s missing 0.7 tonnes, accounted for — 0.4 lost to a cracked main, 0.2 to a crew nobody asked, and 0.1 the desk lists as DIASPORA, a word it uses for water that leaves on purpose. The audit closes the file. The file reopens itself every season, per moisture.',
    },
  },

  // SPX-E-177 — The Second Honest Theft: pallet jack has a successor.
  {
    id: 'SPX-E-177',
    kind: 'easter-egg',
    title: 'The Second Honest Theft',
    sectors: ['sector_ceres_belt', 'sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'cargo:jettisoned', nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Lane chatter',
      text: 'The honest theft has a sequel — a second jettisoned crate, recovered by a second scavenger, returned with the same note in a different hand: TOOK ONLY WHAT WAS FALLING. The lane has decided the note is a signature, not a coincidence. The ledger lists both thefts under GOOD SAMARITANS, which is the only theft category that pays.',
    },
  },

  // SPX-E-178 — The Ledger Offers a Pen: the buoy upgrades you again.
  {
    id: 'SPX-E-178',
    kind: 'easter-egg',
    title: 'The Ledger Offers a Pen',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'flag', requires: 'special500.SPX-D-02' },
    channel: 'commsLog',
    payload: {
      from: 'Unregistered buoy',
      text: 'The buoy\'s screen has changed again — under the favors table, a new line of instructions nobody wrote: LEDGERS GROW BY WITNESS. LEAVE ONE FACT, TAKE ONE FACT. Below it, a blank field blinks, cursor patient. The ledger is accepting entries. The ledger has always been accepting entries. You were just only now invited.',
    },
  },

  // ── flag-gated returns: places that remember you ──────────────────────────

  // SPX-E-179 — The Ledger's Fine Print: the junction remembers.
  {
    id: 'SPX-E-179',
    kind: 'easter-egg',
    title: 'The Ledger\'s Fine Print',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'flag', requires: 'special500.SP1-097' },
    channel: 'commsLog',
    payload: {
      from: 'Junction chatter',
      text: 'Word is the ledger buoy now answers hails from hulls it has filed — a courtesy tier, available to the recorded. The junction\'s pilots treat filing on it the way they treat credit: you do not ask what your line says, you just make sure it says yes when it matters.',
    },
  },

  // SPX-E-180 — The Buoy's Band Adds You: the reach knows your callsign.
  {
    id: 'SPX-E-180',
    kind: 'easter-egg',
    title: 'The Buoy\'s Band Adds You',
    sectors: ['sector_io_reach'],
    trigger: { type: 'flag', requires: 'special500.SP2-029' },
    channel: 'commsLog',
    payload: {
      from: 'Reach chatter',
      text: 'The listening field keeps a private band — the buoy\'s band — and your callsign is on it now, added the day the buoy answered you. The reach\'s regulars say the list is short and it is not an honor roll exactly. It is a guest book for a conversation nobody is having yet.',
    },
  },

  // SPX-E-181 — The Toll Boards' Sequel: the minute's quiet aftermath.
  {
    id: 'SPX-E-181',
    kind: 'easter-egg',
    title: 'The Toll Boards\' Sequel',
    sectors: [],
    trigger: { type: 'flag', requires: 'special500.SPX-D-19' },
    channel: 'commsLog',
    payload: {
      from: 'Toll desk',
      text: 'The minute\'s aftermath: one hull actually crossed during the toll-free minute, and the boards have marked it — an asterisk on the free column, dated, witnessed. The hull saved the posted toll: nine credits. The asterisk cost the boards a reprint. The boards say it was worth it for the proof.',
    },
  },

  // SPX-E-182 — The Bar Starts Collecting: eclipse bets for next year.
  {
    id: 'SPX-E-182',
    kind: 'easter-egg',
    title: 'The Bar Starts Collecting',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'flag', requires: 'special500.SP3-002' },
    channel: 'commsLog',
    payload: {
      from: 'Dockside bar',
      text: 'The bar has already opened the book on next year\'s eclipse — same odds, same kid, whose employment status remains nobody\'s business. The house adds one new rule this year: no betting against the kid. The rule was proposed by the kid\'s usual losers. They are tired of being right.',
    },
  },

  // SPX-E-183 — The Refund's Paper Trail: 47-A acquires a file.
  {
    id: 'SPX-E-183',
    kind: 'easter-egg',
    title: 'The Refund\'s Paper Trail',
    sectors: [],
    trigger: { type: 'flag', requires: 'special500.SP2-190' },
    channel: 'commsLog',
    payload: {
      from: 'Registry desk',
      text: 'The 47-A refund generated a file — a full folder, stamped, cross-referenced, flagged for follow-up: the desk cannot leave a refund unaccompanied. The refund was nine credits. The file is forty pages. Somewhere in the registry\'s cost accounting, the follow-up has been followed up. The folder is still open. Folders like that outlive refunds.',
    },
  },

  // SPX-E-184 — The Tumbleweed's Fan Club: the skid has a following.
  {
    id: 'SPX-E-184',
    kind: 'easter-egg',
    title: 'The Tumbleweed\'s Fan Club',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'flag', requires: 'special500.SP1-152' },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The tumbleweed has a fan club — a standing band thread that tracks its position, celebrates its anniversaries, and argues about whether it counts as a ship. The thread has been running for six years. It outposts the traffic report, the weather wire, and — on slow weeks — the news. The skid is unaware. The skid is always unaware.',
    },
  },

  // ── the postmaster, iii ───────────────────────────────────────────────────

  // SPX-E-185 — The Cache's Cold Letters: mail that outlives addresses.
  {
    id: 'SPX-E-185',
    kind: 'easter-egg',
    title: 'The Cache\'s Cold Letters',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'proximity', nearStation: 'poi_nereid_cache', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The shoal\'s old supply cache has a mail slot — drilled into the lid by a crew that expected to come back. Inside: three letters, addressed to the cache itself, from ships that visited after the crew did not. The letters thank it for the supplies. The slot keeps the letters dry. The postmaster\'s rule holds here too: it is not a grave until the postmark says so.',
    },
  },

  // ── the underwriters ──────────────────────────────────────────────────────

  // SPX-E-186 — The Loss Adjustor: freight loss, professionally mourned.
  {
    id: 'SPX-E-186',
    kind: 'comms-event',
    title: 'The Loss Adjustor',
    sectors: [],
    trigger: { type: 'receipt', event: 'freight:loss' },
    channel: 'commsLog',
    payload: {
      from: 'Underwriting desk',
      text: 'The loss adjustor\'s note posts before your hold finishes emptying — the underwriters keep a standing watch on every manifest in the lane, and their condolences are faster than the wreck\'s own transponder. The note is courteous, itemized, and already depreciating. Sympathy, on the books, is a declining asset.',
    },
  },

  // SPX-E-187 — Claim Status Familiar: the fourth fracture's review.
  {
    id: 'SPX-E-187',
    kind: 'easter-egg',
    title: 'Claim Status Familiar',
    sectors: [],
    trigger: { type: 'receipt', event: 'hull:fractured', nth: 4 },
    channel: 'commsLog',
    payload: {
      from: 'Underwriting desk',
      text: 'CLAIM REVIEW: your hull\'s file has been upgraded to FAMILIAR — the underwriters\' category for damage they could set their clocks by. The note includes, unprompted, a retention offer: stay insured and they will name a deductible after you. It is the only honor in the sector that comes with a surcharge.',
    },
  },

  // ── the founding twins ────────────────────────────────────────────────────

  // SPX-E-188 — Helios Was First: the prime story.
  {
    id: 'SPX-E-188',
    kind: 'easter-egg',
    title: 'Helios Was First',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'commsLog',
    payload: {
      from: 'Prime chatter',
      text: 'Helios insists it was founded first — and the belt, goes the local line, was built second so Helios would have somewhere to be first about it. The story is in the visitor packet. The visitor packet\'s provenance page is blank. The primers do not find this suspicious. They find it conclusive.',
    },
  },

  // SPX-E-189 — Ceres Was Second, On Purpose: the belt's counterclaim.
  {
    id: 'SPX-E-189',
    kind: 'easter-egg',
    title: 'Ceres Was Second, On Purpose',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The belt\'s version: Ceres was founded second — deliberately, by founders who looked at Helios and decided the belt could do better waiting. The belt calls it the oldest documented case of peer review. Helios calls it revisionism. The registry calls it, in its oldest surviving annotation: BOTH, FILED.',
    },
  },

  // ── the inspector-general of rocks ───────────────────────────────────────

  // SPX-E-190 — The Inspector-General Files You: a claim, audited.
  {
    id: 'SPX-E-190',
    kind: 'comms-event',
    title: 'The Inspector-General Files You',
    sectors: [],
    trigger: { type: 'receipt', event: 'claim:claimed' },
    channel: 'commsLog',
    payload: {
      from: 'Inspector-general\'s office',
      text: 'Your claim was reviewed by the inspector-general of rocks — the official who audits stones the way auditors audit books. Your claim passed: rock, genuine. The office\'s seal is a small hammer. Nobody has met the inspector-general. The office\'s mail suggests the inspector-general is more than one person, or less than one.',
    },
  },

  // SPX-E-191 — The Inspector-General Grades Your Scans.
  {
    id: 'SPX-E-191',
    kind: 'easter-egg',
    title: 'The Inspector-General Grades Your Scans',
    sectors: [],
    trigger: { type: 'receipt', event: 'scan:completed', nth: 8 },
    after: ['SPX-E-190'],
    channel: 'commsLog',
    payload: {
      from: 'Inspector-general\'s office',
      text: 'SCAN REVIEW: the office has graded your last eight surveys — seven genuine, one PROVISIONAL, a grade the office assigns to rocks it suspects of lying about their age. You are invited to rescan at your own expense. The invitation is also a finding. The office\'s findings are always invitations.',
    },
  },

  // ── the cold callers ──────────────────────────────────────────────────────

  // SPX-E-192 — The Dead Company's Quota: a hail from a shuttered firm.
  {
    id: 'SPX-E-192',
    kind: 'easter-egg',
    title: 'The Dead Company\'s Quota',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.25 },
    channel: 'comms',
    payload: {
      from: 'Abraxas Mineral Group',
      text: 'Greetings, valued partner — our quarterly offer for your ore reserves is standing, at rates last published thirty years ago. Abraxas Mineral Group dissolved in the second crash. The sales beacon never got the memo. It is, technically, still the sector\'s highest-rated vendor. The rates are unbeatable. The company is the catch.',
      ttl: 9,
    },
  },

  // SPX-E-193 — The Extended Warranty Call: coverage for a hull you sold.
  {
    id: 'SPX-E-193',
    kind: 'easter-egg',
    title: 'The Extended Warranty Call',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:purchased' },
    channel: 'comms',
    payload: {
      from: 'Warranty desk',
      text: 'Courtesy call: your newly purchased hull\'s extended coverage is due for renewal — the desk\'s records show the warranty active since the hull\'s first owner, forty years, three owners, zero claims filed. The desk would like to congratulate whoever has been paying. The desk does not know it is you now. It will learn.',
      ttl: 9,
    },
  },

  // ── the 47-second men ─────────────────────────────────────────────────────

  // SPX-E-194 — The Forty-Seven Second Men's Tithe: the cinder's clock cult.
  {
    id: 'SPX-E-194',
    kind: 'easter-egg',
    title: 'The Forty-Seven Second Men\'s Tithe',
    sectors: ['sector_rhea_cinder'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    after: ['SP3-175'],
    channel: 'commsLog',
    payload: {
      from: 'Cinder chatter',
      text: 'The crews who set their watches to the broken clock call themselves the forty-seven second men, and they keep one rule: when the apron clock ticks its frozen minute, they each owe the station forty-seven seconds of work — unpaid, unrecorded, done. The station\'s maintenance board has never run a deficit it could not explain by this.',
    },
  },

  // ── the margin cartographer ───────────────────────────────────────────────

  // SPX-E-195 — The Cartographer's Margin Note: what discovery costs.
  {
    id: 'SPX-E-195',
    kind: 'anomaly',
    title: 'The Cartographer\'s Margin Note',
    sectors: [],
    trigger: { type: 'receipt', event: 'poi:discovered', nth: 3 },
    channel: 'memory',
    payload: {
      text: 'Your third discovery pings the cartographer\'s desk — the map shop that charts what the survey files. Their margin note on your entry is not about the place. It is about you: DISCOVERER TYPE: THE KIND WHO CHECKS. The desk keeps a taxonomy of discoverers. You will never read the other categories. That is by design.',
    },
  },

  // ── remaining singles ─────────────────────────────────────────────────────

  // SPX-E-196 — The Standing Ovation of One: the applause buoy.
  {
    id: 'SPX-E-196',
    kind: 'easter-egg',
    title: 'The Standing Ovation of One',
    sectors: [],
    trigger: { type: 'receipt', event: 'race:ended', nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Finish buoy',
      text: 'Past the finish line, one buoy applauds — a sound file, played at your hull\'s transponder, of a single person clapping with everything they have. The buoy was installed by a racer who came last his whole life and wanted to leave the applause running. It plays for everyone now. It means more to the slow ones.',
    },
  },

  // SPX-E-197 — The Dione Ledger's Running Tab.
  {
    id: 'SPX-E-197',
    kind: 'comms-event',
    title: 'The Dione Ledger\'s Running Tab',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Lane wire',
      text: 'The lane\'s ledger runs a tally of favors — tolls bent, cradles held, dead hulls dragged home — all logged as IOUs the lane itself owes nobody in particular. The tab is always in the lane\'s favor and always shrinking, because the lane pays its debts the only way a road can: by being there when it counts.',
    },
  },

  // SPX-E-198 — The Season's Liturgy: the storm-season office.
  {
    id: 'SPX-E-198',
    kind: 'comms-event',
    title: 'The Season\'s Liturgy',
    sectors: [],
    trigger: { type: 'receipt', event: 'calendar:stormSeason' },
    channel: 'commsLog',
    payload: {
      from: 'Storm chapel',
      text: 'The storm chapel reads the season\'s liturgy — a service composed entirely of weather warnings from ships that did not make it, read as scripture, in the original voices. The chapel\'s rule: no names, no ranks, just the warnings, in order of how late they arrived. The last one is always the calmest. It always arrives last.',
    },
  },

  // SPX-E-199 — The Lane Forgives Twice: the second unfiled jump.
  {
    id: 'SPX-E-199',
    kind: 'easter-egg',
    title: 'The Lane Forgives Twice',
    sectors: [],
    trigger: { type: 'receipt', event: 'world:requestUnfiledJump', nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Lane wire',
      text: 'A second unfiled jump and the lane\'s answer is the same flat forgiveness — but the desk\'s copy of your file now carries a margin note: LEARNS FAST, FILES SLOW. It is not a black mark. It is barely a mark at all. It is the desk admitting, in writing, that you have become a habit.',
    },
  },

  // SPX-E-200 — The Registrar's Final Stamp: the last document.
  {
    id: 'SPX-E-200',
    kind: 'easter-egg',
    title: 'The Registrar\'s Final Stamp',
    sectors: [],
    trigger: { type: 'receipt', event: 'endgame:chosen' },
    channel: 'commsLog',
    payload: {
      from: 'Registrar',
      text: 'When the choice is made the registrar stamps the last page of your file — not closed, the stamp reads, COMPLETE. The distinction matters to the desk: a closed file is finished; a complete file is kept. Yours is kept. The stamp is the only one in the office that is never used twice in a year.',
    },
  },
];
