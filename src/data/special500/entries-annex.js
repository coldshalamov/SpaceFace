// src/data/special500/entries-annex.js — the annex wave (50 entries).
//
// A second wave riding the same director as the ratified 500, assembled by the
// commissioning process the catalog already encodes:
//
//   BENCH   the 20 ratified consensus spares (CONSENSUS_500.json ranks 501-520,
//           kept under their own ids so saves and tests stay traceable to the
//           debate artifact). Each was recast into a channel its moment can
//           actually deliver: a noticing line -> commsLog/comms, a place record
//           -> memory + followup naming the bespoke seam, a visual whose
//           renderer leg is a later batch -> spectacle. No copy promises a
//           mechanic the data does not fire.
//   SPX-D   30 new proposals in the debate's SPX convention (A/B/C were the
//           round-2 debaters; D is the annex wave). Selection was by the
//           curator test: fires on an ordinary route, the noticing IS the
//           payoff (or memory + a named seam), voice the creative direction
//           calls the casting.
//
// Hones applied across the wave:
//   * five after-chains (SPX-D-01..05) make earlier entries into continuing
//     documents — the Fiddle Strings, the Favor Ledger, the Umbra Minute, the
//     Bell Rock and the Hull Remembers all gain a second, later fact.
//   * notBeforeS on the Wash Refusal so the gag cannot precede a hull mark.
//   * nth counters (third checkpoint, fifth manifest) so milestones land on
//     meaningful counts rather than firsts.
//   * every proximity anchor is a real station/poi id from sectors.js; every
//     sector id is real. "any sector" stays only where the beat is portable.
//   * every receipt event is verified against src/systems emitters
//     (combat:kill world.js; dock:docked input/world; freight:loss
//     freightCausality; meridian:convoyLost; economy:oreFlood;
//     pitborn:claimForeclosed; law:fineAssessed lawSecurity; tether:broke;
//     chain:tetherShare; ship:nameChanged/appearanceSaved ships.js;
//     verge:checkpointCleared; archive:copyPublished;
//     lastShift:recorderReturned; world:requestUnfiledJump;
//     player:scannedByPatrol; hull:fractured; economy:tradeCompleted).
//   * calendar rituals re-arm yearly; the year clock is the heartbeat.

export const ENTRIES_ANNEX = [
  // ── BENCH: the twenty ratified spares ─────────────────────────────────────

  // SP3-047 — Front Riders: salvage hulls riding the surge edge, marking the
  // richest streaks green.
  {
    id: 'SP3-047',
    kind: 'encounter',
    title: 'Front Riders',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'The storm lane',
      text: 'Two ragged salvage hulls ride the leading edge of the debris current in formation, sails of backlit dust streaming off their bows, cutting whatever the front throws at them. One throws a lamp burst at you — green, a salute — and cuts into the richest streak. Green marks all the way down the front.',
    },
    followup: 'green-mark salvage bonus seam (the marks are findable debris rows) + codex entry for riding a full surge',
  },

  // SP3-149 — The Toll Echo: the rocks answer the Eighth Bell, detuned by size.
  {
    id: 'SP3-149',
    kind: 'visual-setpiece',
    title: 'The Toll Echo',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 18, windowS: [60, 300] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'The Eighth Bell field',
      text: 'Two seconds after the bell tolls, the field answers — three boulder clusters returning the note a half-step off, each detuned by its own size. Stand where the echoes overlap and they phase into a chord nobody tuned, ringing for a full breath after the bell has stopped.',
    },
    followup: 'three delayed positioned audio:cue copies keyed to the toll event; the chord spot is real geometry (player pos vs clusters)',
  },

  // SP3-153 — The Folding Star: the doubled star slides shut as you close.
  {
    id: 'SP3-153',
    kind: 'anomaly',
    title: 'The Folding Star',
    sectors: ['sector_triton_wake'],
    trigger: { type: 'proximity', nearStation: 'poi_triton_anomaly', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'One star in the wake\'s deep field is doubled — two points a hair apart. As you close they slide slowly together and become one, like a focus pull. The survey log offers three hypotheses and refuses to choose.',
    },
    followup: 'proximity-keyed split on the background star row (sectorVisualProfiles vocabulary); codex anomaly page',
  },

  // SP3-059 — The Marooned Trawler: dead in the crosswind, one lamp left.
  {
    id: 'SP3-059',
    kind: 'encounter',
    title: 'The Marooned Trawler',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'comms',
    payload: {
      from: 'Trawler Lucky Pennant',
      text: 'Anybody listening: we are dead in the crosswind, beam-on, one lamp left and it is doing all the talking. A push into the lee of the big rock is all we ask. We will make it worth a story.',
      ttl: 9,
    },
    followup: 'zone presence single-spawn + tow-to-lee on the existing massline physics; thank-you flare via explosionIgnition cue; good-samaritan receipt',
  },

  // SP3-111 — The Searchlight Argument: a stowaway chase played in light.
  {
    id: 'SP3-111',
    kind: 'encounter',
    title: 'The Searchlight Argument',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'station_beltout', wu: 2000 },
    channel: 'spectacle',
    payload: {
      from: 'Beltout apron',
      text: 'Two tug floods dart between the depot pylons, sweeping the belly — a stowaway chase played entirely in light. They never catch it. Your hull crosses a beam for one second; both floods swing to you, accuse, and resume without comment.',
    },
    followup: 'two NPC headlight slots + patrol-route pair; the accusatory second is choreography data',
  },

  // SP3-069 — The Measured Ring: forty fragments, one exact circle.
  {
    id: 'SP3-069',
    kind: 'anomaly',
    title: 'The Measured Ring',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'proximity', nearStation: 'poi_eunomia_debris', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'Forty impact fragments lie exactly on a circle 120 WU across, every long axis pointed at the center — not scattered, arranged. A survey pin at the circle\'s edge reads: CIRCUMFERENCE RE-CHECKED, DAY 40, UNCHANGED. Nothing explains the circle.',
    },
    followup: 'opticScatterSpecsFor-style seeded placement on a circle constraint + claim-mark donor prop; Archive scan bonus + codex anomaly page',
  },

  // SP3-075 — The Quiet Zone: a patch of ash where the fall hangs still.
  {
    id: 'SP3-075',
    kind: 'anomaly',
    title: 'The Quiet Zone',
    sectors: ['sector_rhea_cinder'],
    trigger: { type: 'proximity', nearStation: 'poi_rhea_slag', wu: 500 },
    channel: 'spectacle',
    payload: {
      from: 'The ash field',
      text: 'Inside this patch the ash-fall stops — flakes hang in place, glittering, as if time were thick here. Your wake does not disturb them; they close behind you like water. Outside the patch it keeps falling.',
    },
    followup: 'gas-volume velocity-freeze radius (per-volume stillness scalar on the _gas layer); seeded position row + codex anomaly page',
  },

  // SP1-152 — The Tumbleweed: the dead fuel skid the belt tracks like a pet.
  {
    id: 'SP1-152',
    kind: 'world-oneoff',
    title: 'The Tumbleweed',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The band still tracks it like a pet: the dead fuel skid that has been tumbling through the belt for years on a trajectory everyone knows — too slow to matter, too stubborn to stop, bounced off three claims and raided twice. The position board lists it between weather and humor.',
    },
    followup: 'persistent wandering prop on a fixed ballistic path (asteroidMotion); one small unfound cache; band commentary rows',
  },

  // SP1-178 — The Wash Refusal: the dock washer cannot take the dent off.
  {
    id: 'SP1-178',
    kind: 'easter-egg',
    title: 'The Wash Refusal',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    notBeforeS: 2400, // four world days in: the hull needs a mark before this reads true
    channel: 'comms',
    payload: {
      from: 'Helios dock frame',
      text: 'The hull-washer arch takes your plating on the first pass, then — audibly — re-runs the one spot it cannot clean, three times, and gives up with a mechanical sigh. The dock hands lean out to look. The spot has been on the hull longer than your registry. The washer has decided it is structural.',
      ttl: 8,
    },
    followup: 'dock vignette keyed to hull story-mark flags: the washer re-tries the spot on every later visit without comment',
  },

  // SP3-184 — Tally Eve's List: customs reads the year's fines on the open band.
  {
    id: 'SP3-184',
    kind: 'comms-event',
    title: 'Tally Eve\'s List',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 38, windowS: [420, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Customs open band',
      text: 'Tally Eve. Customs reads the year\'s outstanding fines on the open band — hull by hull, in the same flat tone for everyone. The list closes with the year\'s largest offender, which is usually a hauler.',
    },
    followup: 'provenance fines ledger read: the player\'s own hull and fine join the read-back when one exists (saveVersion v14 ledger)',
  },

  // SP1-128 — The Burn Line: every gate at full burn, on a published clock.
  {
    id: 'SP1-128',
    kind: 'oneoff-mission',
    title: 'The Burn Line',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'memory',
    payload: {
      text: 'Posted at the field rim, one sentence: EVERY GATE AT FULL BURN. NO COAST. The course threads the radiation vents on a published clock — learning the clock is the race. The belt calls it the burn line, and the entry fee goes up every time you ask.',
    },
    followup: 'race mission with hazard-window gates (timingGate pattern from src/data/uniqueWrecks.js); band records persist in story.flags; escalating entry fee',
  },

  // SP1-129 — The Hare: a purse poster with your hull and your real routes.
  {
    id: 'SP1-129',
    kind: 'encounter',
    title: 'The Hare',
    sectors: [],
    trigger: { type: 'receipt', event: 'player:scannedByPatrol' },
    channel: 'comms',
    payload: {
      from: 'Bounty wire',
      text: 'A purse poster went up on the junction boards overnight: your hull, a number, and — in the fine print — your last three routes. They are accurate. Three burn signatures are already inbound from different bearings, chattering on a private channel you can half-hear.',
      ttl: 9,
    },
    followup: 'purse-window spawn leg: three-bearing hunters on a timed window; clearing your name mid-chase closes it; every hunter remembers by name',
  },

  // SP1-131 — The Pace Car: the unpaid hull that runs the fog at safe speed.
  {
    id: 'SP1-131',
    kind: 'encounter',
    title: 'The Pace Car',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Fog lane chatter',
      text: 'A battered local hull runs the fog at exactly the safe speed, lights on, three regulars tucked into her wake like ducklings — the pace car, unpaid, permanent, and visibly tired of the job. Tuck in and the fog parts for you too.',
    },
    followup: 'wake-following speed/safety bonus through the fog stretch + tip-her hand-signal for the deep shortcut she has never told anyone',
  },

  // SP3-140 — Meteor Hiss: the shower made audible.
  {
    id: 'SP3-140',
    kind: 'visual-setpiece',
    title: 'Meteor Hiss',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'spectacle',
    payload: {
      from: 'The surge lane',
      text: 'A stone goes past close enough to hear: a doppler hiss rising as it closes, dropping away behind — the shower made audible, traffic noise out of falling rock. The next close one cracks like a whip off your plating.',
    },
    followup: 'audio:cue with doppler rate on the weatherMeteors slot entities; cue rate-limited by the discoverySound throttle idiom',
  },

  // SP3-125 — The Open Vault: a dead hauler's hold spills strobing pallets.
  {
    id: 'SP3-125',
    kind: 'visual-setpiece',
    title: 'The Open Vault',
    sectors: [],
    trigger: { type: 'receipt', event: 'freight:loss' },
    channel: 'spectacle',
    payload: {
      from: 'The lane',
      text: 'The dead hauler\'s hold splits along its doors and the cargo spills in a slow bloom — pallets tumbling into the light, each carrying its own tiny strobe, the whole cloud glittering as it spreads. It reads less like wreckage than a hand opening.',
    },
    followup: 'cargo drop path + strobe lamp finishes on pod donors; the pallets are the loot',
  },

  // SP3-191 — The Ashfall Calendar: the weather record as geology.
  {
    id: 'SP3-191',
    kind: 'world-oneoff',
    title: 'The Ashfall Calendar',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_ossuary', wu: 400 },
    channel: 'memory',
    payload: {
      text: 'A rock tower banded like sediment — each dark ring a survived storm season, each pale band a calm one, the count exactly this sector\'s weather history — with a wire-spool ladder up its side. The newest ring is still soft; you can see the season falling on it.',
    },
    followup: 'ringed prop (donor rock + band emissive tints); the count reads the seasonal ledger (weatherSeasonAt history)',
  },

  // SP3-152 — The Quiet Watch: the mix itself keeps third watch.
  {
    id: 'SP3-152',
    kind: 'visual-setpiece',
    title: 'The Quiet Watch',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.6 },
    channel: 'commsLog',
    payload: {
      from: 'The band, third watch',
      text: 'Third watch. The band thins to a single low pad and the chatter goes to whispers — every night, same hour, the mix itself keeps the watch. Even the wire reads quieter. Nobody scheduled it. Everybody honors it.',
    },
    followup: 'watch-keyed MUSIC_STEMS gain row (src/data/audioRecipes.js) so the pad and the thin-out are the mix performing the night watch',
  },

  // SP3-175 — The Broken Clock: the apron runs forty-seven seconds late.
  {
    id: 'SP3-175',
    kind: 'world-oneoff',
    title: 'The Broken Clock',
    sectors: ['sector_rhea_cinder'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Rhea slag apron',
      text: 'The apron clock is frozen at one minute past a shift turn — and everything here genuinely runs forty-seven seconds late: shifts, pour announcements, even the vending lights. Crews set their watches by the frozen clock and are right.',
    },
    followup: 'station-scoped +47 s offset on the existing stationOffsetS hash path (src/data/worldCalendar.js) + the clock prop',
  },

  // SP1-051 — The Hot Potato: three hulls, one glowing crate, perfect rhythm.
  {
    id: 'SP1-051',
    kind: 'encounter',
    title: 'The Hot Potato',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'The trade lane',
      text: 'Three hulls pass one glowing crate between them in perfect rhythm — each handoff timed to look like routine traffic, all of it visible from above like a choreographed play. One of them is being followed. None of them know it is you.',
    },
    followup: 'numbered selfRegistered encounter with a passed prop pod: catch the crate mid-relay (contraband prize), warn the pursued (Quiet rep), or shadow the relay to its drop cache (beacons seam)',
  },

  // SP3-185 — The Calendar Rock: someone notches the year in stone.
  {
    id: 'SP3-185',
    kind: 'world-oneoff',
    title: 'The Calendar Rock',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'proximity', nearStation: 'poi_hyperion_driller', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A boulder with forty notches chiseled around its equator and a fresh cut on today\'s — the cut still glinting — plus a small pile of forty years of chisel dust at its base. Someone comes out here every day. The notch count is exactly right, every time you check.',
    },
    followup: 'worldOneOffs row; the notch count reads calendarDay(simTime) so it is exactly right on every visit',
  },

  // ── SPX-D: thirty new proposals ───────────────────────────────────────────

  // SPX-D-01 — The Twelfth Tether: the Fiddle Strings gain a missing note.
  {
    id: 'SPX-D-01',
    kind: 'easter-egg',
    title: 'The Twelfth Tether',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    after: ['SP3-033'],
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'Eleven tethers. Ask an old hand why not twelve and they will tell you the twelfth is the one you save for the song that has not been written yet. Nobody has ever heard it. Everybody keeps the anchor point clear.',
    },
  },

  // SPX-D-02 — The Ledger's Second Line: the Favor Ledger adds a fact about you.
  {
    id: 'SPX-D-02',
    kind: 'easter-egg',
    title: 'The Ledger\'s Second Line',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    after: ['SP1-097'],
    channel: 'comms',
    payload: {
      from: 'Unregistered buoy',
      text: 'A relay note from the buoy, waiting for you at the cradle: your line has a second entry — "RETURNED, ONCE, TO LOOK." It was posted while you were gone. Beneath it, in smaller type: "the ledger remembers whether you meant it."',
      ttl: 9,
    },
    followup: 'the ledger read/write logic (rescue/tow follow-up batch) gets a second-line row per return visit',
  },

  // SPX-D-03 — The Umbra Wager: the eclipse bet, settled by a kid with a watch.
  {
    id: 'SPX-D-03',
    kind: 'easter-egg',
    title: 'The Umbra Wager',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 12, windowS: [146, 600] },
    recurring: true,
    after: ['SP3-002'],
    channel: 'commsLog',
    payload: {
      from: 'Dockside bar',
      text: 'The bar settled the eclipse bet the way it always does: a dockhand\'s kid with a station watch called the second the light returned, and the losers paid without arguing. The kid has never been wrong. Nobody knows whose kid it is.',
    },
  },

  // SPX-D-04 — The Ringer's Pool: the Bell Rock's quiet office pool.
  {
    id: 'SPX-D-04',
    kind: 'easter-egg',
    title: 'The Ringer\'s Pool',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'hashDaily', chance: 0.5 },
    after: ['SP1-059'],
    channel: 'commsLog',
    payload: {
      from: 'Drill band',
      text: 'The drills run a quiet pool on who rings the hollow rock next, and where. It pays out every week — to the house, always to the house. The house is a boulder with a tin cup wired to it.',
    },
  },

  // SPX-D-05 — The Margin Answers: the handless line replies on the second fracture.
  // (no after-gate: nth already orders it — an after-gate would starve the
  // counter until the dependency fired and land this on the THIRD fracture.)
  {
    id: 'SPX-D-05',
    kind: 'easter-egg',
    title: 'The Margin Answers',
    sectors: [],
    trigger: { type: 'receipt', event: 'hull:fractured', nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'BULKHEAD 3 LOG',
      text: 'Damage report complete. One line in the feed margin this time, same unauthored hand: "SHE HELD TWICE. YOU\'RE WELCOME."',
    },
  },

  // SPX-D-06 — The Christening: the registry files the rename without comment.
  {
    id: 'SPX-D-06',
    kind: 'easter-egg',
    title: 'The Christening',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:nameChanged' },
    channel: 'commsLog',
    payload: {
      from: 'Registry desk',
      text: 'Registry acknowledges the rename in the flat voice of a form being filed correctly. Somewhere on the band an old hand observes: a hull answers better when you meant the name.',
    },
  },

  // SPX-D-07 — The New Coat: the paint job joins the record.
  {
    id: 'SPX-D-07',
    kind: 'easter-egg',
    title: 'The New Coat',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:appearanceSaved' },
    channel: 'commsLog',
    payload: {
      from: 'Berth log',
      text: 'The yard noted the fresh paint in the berth log without comment. So did the collectors, the brokers, and one toll booth that raised its rate anyway. Camouflage is a subscription.',
    },
  },

  // SPX-D-08 — The First Mark: the band's silence after a first kill.
  {
    id: 'SPX-D-08',
    kind: 'comms-event',
    title: 'The First Mark',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'commsLog',
    payload: {
      from: 'The band',
      text: 'For one second after the first kill the band holds a silence it does not hold for anyone else. Then an old voice, from far off: "First one\'s the one you keep." Nothing after that. There never is.',
    },
  },

  // SPX-D-09 — The First Fine: posted like a birth notice.
  {
    id: 'SPX-D-09',
    kind: 'comms-event',
    title: 'The First Fine',
    sectors: [],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'commsLog',
    payload: {
      from: 'Desk wire',
      text: 'A first fine posts like a birth notice: ONE VIOLATION, PAID OR PENDING. The clerk who stamped it will not remember you. The ledger will.',
    },
  },

  // SPX-D-10 — The Regular: the third checkpoint, and the gate knows your voice.
  {
    id: 'SPX-D-10',
    kind: 'easter-egg',
    title: 'The Regular',
    sectors: [],
    trigger: { type: 'receipt', event: 'verge:checkpointCleared', nth: 3 },
    channel: 'comms',
    payload: {
      from: 'Verge checkpoint',
      text: 'CLEARED, the gate says — then, one beat late, in the interrogative register\'s rare flat mood: YOU AGAIN. The toll does not drop for regulars. It just takes your number without asking.',
      ttl: 7,
    },
  },

  // SPX-D-11 — The Stacks: your account shelved by date filed.
  {
    id: 'SPX-D-11',
    kind: 'easter-egg',
    title: 'The Stacks',
    sectors: [],
    trigger: { type: 'receipt', event: 'archive:copyPublished' },
    channel: 'commsLog',
    payload: {
      from: 'Archive intake',
      text: 'Your account of it goes into the stacks between a mutiny report and a grocery list from a dead colony ship. The Archive shelves by date filed, not by importance. It insists these are the same thing.',
    },
  },

  // SPX-D-12 — The Tape Outlives: the last shift's recorder comes home.
  {
    id: 'SPX-D-12',
    kind: 'world-oneoff',
    title: 'The Tape Outlives',
    sectors: [],
    trigger: { type: 'receipt', event: 'lastShift:recorderReturned' },
    channel: 'commsLog',
    payload: {
      from: 'The desk',
      text: 'The flight recorder of the last shift came home in a courier pouch. The desk played it twice: once for the record, once for the room. Nobody spoke during either.',
    },
  },

  // SPX-D-13 — The Unfiled Lane: the lane forgives what the desk will not.
  {
    id: 'SPX-D-13',
    kind: 'comms-event',
    title: 'The Unfiled Lane',
    sectors: [],
    trigger: { type: 'receipt', event: 'world:requestUnfiledJump' },
    channel: 'commsLog',
    payload: {
      from: 'Lane wire',
      text: 'The lane forgives an unfiled jump the way the sea forgives swimmers: entirely, and without any memory of it. The desk that noticed will bill your estate anyway. The lane keeps its own books.',
    },
  },

  // SPX-D-14 — The Empty Berth: a convoy that does not come home.
  {
    id: 'SPX-D-14',
    kind: 'comms-event',
    title: 'The Empty Berth',
    sectors: [],
    trigger: { type: 'receipt', event: 'meridian:convoyLost' },
    channel: 'news',
    payload: {
      text: 'CONVOY LEDGER: the Meridian run lists its seventh hull as "pending arrival" for the third cycle running. The exchange floor observed thirty seconds of silence, then repriced the silence as within tolerance.',
      kind: 'incidents',
    },
  },

  // SPX-D-15 — The Tow Quote: a tug hails the moment your line goes.
  {
    id: 'SPX-D-15',
    kind: 'comms-event',
    title: 'The Tow Quote',
    sectors: [],
    trigger: { type: 'receipt', event: 'tether:broke' },
    channel: 'comms',
    payload: {
      from: 'Salvage tug',
      text: 'Saw the line go. Not saying you will need a pull — saying the quote is good for a week. They already have your mass estimate on file. It is low.',
      ttl: 8,
    },
  },

  // SPX-D-16 — The Flood Price: set by whoever drowned last.
  {
    id: 'SPX-D-16',
    kind: 'comms-event',
    title: 'The Flood Price',
    sectors: [],
    trigger: { type: 'receipt', event: 'economy:oreFlood' },
    channel: 'news',
    payload: {
      text: 'ORE DESK: the flood price is set by whoever drowned last, and today\'s is a cooperative that over-mined its own claim. Their spokesperson calls it a liquidity event. The desk calls it Tuesday.',
      kind: 'incidents',
    },
  },

  // SPX-D-17 — The Rock's Return: foreclosed claims go back to the rock.
  {
    id: 'SPX-D-17',
    kind: 'comms-event',
    title: 'The Rock\'s Return',
    sectors: [],
    trigger: { type: 'receipt', event: 'pitborn:claimForeclosed' },
    channel: 'news',
    payload: {
      text: 'CLAIM LEDGER: another stake goes back to the rock. The rock\'s rate of return is perfect and always has been; the desk that filed it declined to be interviewed, citing the desk.',
      kind: 'incidents',
    },
  },

  // SPX-D-18 — The Shared Line: the only marriage the belt notarizes.
  {
    id: 'SPX-D-18',
    kind: 'easter-egg',
    title: 'The Shared Line',
    sectors: [],
    trigger: { type: 'receipt', event: 'chain:tetherShare' },
    channel: 'commsLog',
    payload: {
      from: 'The band',
      text: 'Two hulls on one tether is the only marriage the belt notarizes. The band gives you an hour of quiet about it, which out here is the reception.',
    },
  },

  // SPX-D-19 — The Toll-Free Minute: one unrepealed minute a year.
  {
    id: 'SPX-D-19',
    kind: 'comms-event',
    title: 'The Toll-Free Minute',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 25, windowS: [300, 330] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'MARKET NOTICE: for one minute on the twenty-fifth the toll boards drop to zero — an old charter clause nobody repealed. Nobody trusts it. The queues form anyway, out of respect for the possibility.',
      kind: 'notices',
    },
  },

  // SPX-D-20 — The Founders' Lie: every station tells a different founding.
  {
    id: 'SPX-D-20',
    kind: 'comms-event',
    title: 'The Founders\' Lie',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 1, windowS: [0, 120] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'FOUNDING DAY: every station broadcasts the story of its own founding, and no two versions agree. Helios says grit, Ceres says providence, the Reach says nothing and charges admission. The wire prints all of them under one headline: ORIGIN DISPUTED, RECEPTION GOOD.',
      kind: 'notices',
    },
  },

  // SPX-D-21 — The Unowned Hour: the year's last hour belongs to no station.
  {
    id: 'SPX-D-21',
    kind: 'comms-event',
    title: 'The Unowned Hour',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 39, windowS: [390, 539] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Every band, thin',
      text: 'The year\'s last hour belongs to no station: gantries idle, the wire reads weather, and the toll booths dim to standby out of something nobody calls reverence. The ledger rests. Tomorrow it itemizes.',
    },
  },

  // SPX-D-22 — The Double Funeral: one clerk, two ceremonies.
  {
    id: 'SPX-D-22',
    kind: 'comms-event',
    title: 'The Double Funeral',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 300] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'DESK MEMO: the same records clerk was buried twice this week — once by the dock office, once by the archives, both ceremonies well attended and mutually unacknowledged. The discrepancy is being audited by the clerk, who attended neither.',
      kind: 'incidents',
    },
  },

  // SPX-D-23 — The Painted Asteroid: filed as citrus, permanently.
  {
    id: 'SPX-D-23',
    kind: 'easter-egg',
    title: 'The Painted Asteroid',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_survey', wu: 400 },
    channel: 'memory',
    payload: {
      text: 'A belt boulder painted traffic-cone orange, stenciled smile and all — somebody\'s idea of a joke on the survey drones. The drones keep re-filing it as citrus. The crew responsible is long gone. The filing persists.',
    },
    followup: 'donor prop + survey-drone misclassification gag row in the discovery log',
  },

  // SPX-D-24 — The Scarecrow Buoy: toll compliance rises in its shadow.
  {
    id: 'SPX-D-24',
    kind: 'world-oneoff',
    title: 'The Scarecrow Buoy',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_weigh', wu: 500 },
    channel: 'memory',
    payload: {
      text: 'A navigation buoy dressed in a surplus EVA suit, arms out, facing the toll-dodger corridor. It does nothing. Toll compliance in its shadow runs eleven percent higher. Nobody will say whether the suit is empty.',
    },
    followup: 'buoy prop with the suit dressing; compliance stat cited in the weigh-station ledger page',
  },

  // SPX-D-25 — The Burn Lamp: no fuel line, sixty-one years open.
  {
    id: 'SPX-D-25',
    kind: 'world-oneoff',
    title: 'The Burn Lamp',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_burn_lamp', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'A lamp on a stone pylon burning without a fuel line for as long as the redoubt has records. Crews leave it offerings — lengths of wire, coil ends, one glove. The lamp accepts everything. The maintenance ticket is open, sixty-one years.',
    },
    followup: 'lamp prop + offering dressing; the ticket is a fixture line on the redoubt maintenance board',
  },

  // SPX-D-26 — The Last Lantern: where the light budget ran out.
  {
    id: 'SPX-D-26',
    kind: 'world-oneoff',
    title: 'The Last Lantern',
    sectors: ['sector_orcus_shadow'],
    trigger: { type: 'proximity', nearStation: 'world_site_orcus_last_lantern', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The lantern marks where the light budget ran out — literally: the survey\'s illumination line ends at this post, and dark begins two meters past it like a property line. Everything past it is filed UNLIT. Some of the files are old.',
    },
    followup: 'lantern prop at the light-line terminus + the UNLIT file row in the sector ledger',
  },

  // SPX-D-27 — The Metronome: a stone that ticks once a day, exactly.
  {
    id: 'SPX-D-27',
    kind: 'anomaly',
    title: 'The Metronome',
    sectors: ['sector_eris_margin'],
    trigger: { type: 'proximity', nearStation: 'poi_eris_metronome', wu: 250 },
    channel: 'spectacle',
    payload: {
      from: 'The margin',
      text: 'A flat stone on the margin ticks once a day, every day, at the same second — a pebble shifting in a crevice, on a schedule. Toll crews set their hearts to it passing through. Nobody has caught it being wrong.',
    },
    followup: 'once-per-day tick cue keyed to the stone (calendarDay boundary); toll-crew superstition band rows',
  },

  // SPX-D-28 — The Prayer Rock: weld one out, pry one home.
  {
    id: 'SPX-D-28',
    kind: 'world-oneoff',
    title: 'The Prayer Rock',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_cathedral_vigil', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A boulder plated in welded coins — crews weld one on outbound for luck and pry one off on return. The account balances. The rock keeps the difference in weight it never claims.',
    },
    followup: 'coin-weld counter flag per save + the rock as a chartable place record',
  },

  // SPX-D-29 — The Borrowed Beacon: it answers to Harbor Light.
  {
    id: 'SPX-D-29',
    kind: 'anomaly',
    title: 'The Borrowed Beacon',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'proximity', nearStation: 'poi_dione_relay', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The lane beacon answers to the wrong name — has for sixty years, since a field tech fat-fingered the registry. Every chart corrects it in pencil. Nobody has ever corrected the beacon. It answers to HARBOR LIGHT. There is no harbor.',
    },
    followup: 'beacon ident row keyed to the misfiled name; chart margin note in the sector ledger',
  },

  // SPX-D-30 — The Clerk's Column: one signature for five hundred documents.
  {
    id: 'SPX-D-30',
    kind: 'easter-egg',
    title: 'The Clerk\'s Column',
    sectors: [],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted', nth: 5 },
    channel: 'commsLog',
    payload: {
      from: 'Manifest desk',
      text: 'Five manifests deep and the desk clerk stamps the last one S. PECIAL — five hundred documents a day, one signature for all of them. You ask if that is a name. The clerk says it is a workload.',
    },
  },
];
