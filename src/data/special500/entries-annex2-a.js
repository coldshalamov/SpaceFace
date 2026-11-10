// src/data/special500/entries-annex2-a.js — annex wave 2, file A (SPX-E-001..050).
//
// Fifty proximity place-records. Every anchor is a real station/poi id from
// sectors.js that the ratified catalog and annex wave 1 left unused, and every
// anchor lives inside the sector that gates its entry — verified, not assumed.
// Channels lean memory/spectacle so the places chart themselves as records;
// a few commsLog lines carry the band's version of the same sight.
// Copy promises nothing the trigger cannot deliver: the noticing is the payoff.

export const ENTRIES_ANNEX2_A = [
  // SPX-E-001 — The Claim Mark Under Fresh Paint: old stake, newer lie.
  {
    id: 'SPX-E-001',
    kind: 'world-oneoff',
    title: 'The Claim Mark Under Fresh Paint',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_claim_mark', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A survey stake under three coats of fresh paint — each coat a different company color, the oldest still legible at the corners. The registry lists one owner. The paint says otherwise, in layers, all the way down to the first hand that swung the hammer.',
    },
    followup: 'layered-paint prop tint stack; registry-page contradiction row',
  },

  // SPX-E-002 — The Locker That Rents by the Year.
  {
    id: 'SPX-E-002',
    kind: 'easter-egg',
    title: 'The Locker That Rents by the Year',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_locker', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'A dockside locker with a renewal slip forty-one years deep taped inside the door — same name, same hand, each year the writing a little less certain. The desk says the account is current. Nobody living remembers what is inside. The rent is always paid.',
    },
  },

  // SPX-E-003 — Bay 7's Painted Queue.
  {
    id: 'SPX-E-003',
    kind: 'world-oneoff',
    title: 'Bay 7\'s Painted Queue',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_bay7', wu: 400 },
    channel: 'commsLog',
    payload: {
      from: 'Apron chatter',
      text: 'The floor marks outside Bay 7 still hold a queue of painted boots — crews that stood there during the long strike, stenciled where they waited. New dockhands walk the line end to end on their first shift, out of respect or out of habit. The boots outnumber the shift.',
    },
  },

  // SPX-E-004 — The Ash Pin's Tally.
  {
    id: 'SPX-E-004',
    kind: 'anomaly',
    title: 'The Ash Pin\'s Tally',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_ash_pin', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The marker where they pin storm-ash samples has a tally etched beside it — one cut per season, each cut dated in the same neat hand. The oldest dates predate the station. The pin itself is the fourth replacement; the tally was transferred, cut for cut, each time.',
    },
  },

  // SPX-E-005 — The Shift Bell Ringers' Signature.
  {
    id: 'SPX-E-005',
    kind: 'world-oneoff',
    title: 'The Shift Bell Ringers\' Signature',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_shift_bell', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The shift bell carries a brass plate listing every ringer since the first — forty names, and under the last one a line that is not a name: STILL RINGS TRUE. The current ringer is nameless by choice, says the desk. The plate was ordered before the choice was made.',
    },
  },

  // SPX-E-006 — The Misdeclared Pallet.
  {
    id: 'SPX-E-006',
    kind: 'easter-egg',
    title: 'The Misdeclared Pallet',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'poi_helios_misdeclared', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'A customs-sealed pallet declared MACHINE PARTS eleven years ago and never claimed — the seal is intact, the manifest is a masterpiece of vagueness, and the pallet hums on nights when the yard compressors run. Customs audits it yearly. The pallet passes. It always passes.',
    },
  },

  // SPX-E-007 — The Flare Rack's Good Candles.
  {
    id: 'SPX-E-007',
    kind: 'world-oneoff',
    title: 'The Flare Rack\'s Good Candles',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_flare_rack', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A rack of spent distress flares wired upright like votive candles — crews add one each time a mayday ends in a tow home. The oldest flares are black with handling. A chalk line under the rack reads: EVERY ONE OF THESE SOMEBODY CAME BACK. The chalk is refreshed, season on season.',
    },
  },

  // SPX-E-008 — The Throughline Toll.
  {
    id: 'SPX-E-008',
    kind: 'world-oneoff',
    title: 'The Throughline Toll',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_throughline', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The straight shot through the belt is marked by a cable no thicker than a finger, and along it every hauler clips a transit tag as it passes — a moving toll of plastic tabs glittering on the line. Cut one off and the belt will know your name by tomorrow. Nobody tests that.',
    },
  },

  // SPX-E-009 — The Second Measure's Second Door.
  {
    id: 'SPX-E-009',
    kind: 'anomaly',
    title: 'The Second Measure\'s Second Door',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'world_site_ceres_second_measure', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The survey shack everyone calls the Second Measure has a second door on the blind side — hinged, serviced, and sealed from the outside with a survey weld. The weld log shows it renewed every season by a crew that has never been inside. The door was built first. The shack was built around it.',
    },
  },

  // SPX-E-010 — The Kettle Ribs' Kettlebell.
  {
    id: 'SPX-E-010',
    kind: 'easter-egg',
    title: 'The Kettle Ribs\' Bell',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_kettle_ribs', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The stripped hull-ribs the wreckers call the Kettle have a ship\'s bell welded mid-frame, polished to a shine by passing gloves. Strike it and the whole rib cage rings back, second-hand, a note lower. The wreckers call it the cheapest clock in the belt: it rings for whoever paid for the weld.',
    },
  },

  // SPX-E-011 — The Closed Refinery's Open Tab.
  {
    id: 'SPX-E-011',
    kind: 'world-oneoff',
    title: 'The Closed Refinery\'s Open Tab',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_closed_refinery', wu: 400 },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The old refinery has been closed thirty years and its canteen tab is still open — the bar program was never cancelled, so the steward\'s lamp still flags a credit balance on the door every supply day. The last drink owed is to a crew that ships out of Sedna now. The tab is honored on sight, says the lamp.',
    },
  },

  // SPX-E-012 — The Solstice Lantern's Spare Wick.
  {
    id: 'SPX-E-012',
    kind: 'world-oneoff',
    title: 'The Solstice Lantern\'s Spare Wick',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_solstice_lantern', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The solstice lantern has a second wick laid beside it in an oiled cloth — a spare, replaced unused every year in a two-minute rite the lantern crews call the sharpening. The used-never-used spares go into the lantern\'s plinth. Nobody opens the plinth. The rite is older than the lantern.',
    },
  },

  // SPX-E-013 — The Lapsed Cache's Honest Thieves.
  {
    id: 'SPX-E-013',
    kind: 'easter-egg',
    title: 'The Lapsed Cache\'s Honest Thieves',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_ceres_lapsed_cache', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A claim cache whose filing lapsed forty years ago — legal salvage for anyone, and yet the cans sit untouched behind a hundred years of boot prints that all stop at the stake line. The belt\'s rule is unwritten: take from a lapsed cache and your own cache learns how it feels. The boots admire. They do not cross.',
    },
  },

  // SPX-E-014 — The Claim Rookery.
  {
    id: 'SPX-E-014',
    kind: 'anomaly',
    title: 'The Claim Rookery',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'proximity', nearStation: 'poi_claim_rookery', wu: 350 },
    channel: 'spectacle',
    payload: {
      from: 'The rookery flats',
      text: 'A shoal of abandoned claim beacons — hundreds, blinking out of phase, pinging expired ownership to nobody. The belt calls it the rookery: beacons drift here to die, and on clear passes they read like a field of birds that never learned to fly. Every so often one pings a name you know.',
    },
  },

  // SPX-E-015 — The Black Market's Brightest Lamp.
  {
    id: 'SPX-E-015',
    kind: 'world-oneoff',
    title: 'The Black Market\'s Brightest Lamp',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_blackmkt', wu: 350 },
    channel: 'commsLog',
    payload: {
      from: 'Dockside chatter',
      text: 'The market that does not exist is lit by the brightest service lamp in the junction — maintained, metered, and billed to a department that was closed before the lamp was installed. The invoice is paid on time every cycle, from an account with no name on it. The light is very good. Everyone shops under it.',
    },
  },

  // SPX-E-016 — The Queue Head's Padded Bar.
  {
    id: 'SPX-E-016',
    kind: 'world-oneoff',
    title: 'The Queue Head\'s Padded Bar',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_tally_queue_head', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The head-of-queue bar at the tally line is wrapped in padding older than most crews — worn smooth in two palm-shaped spots where thousands of first-in-line pilots have leaned. The padding is never replaced. It is not padding, an old hand tells you. It is the tally of everyone who got here first.',
    },
  },

  // SPX-E-017 — The Red Gate's One Apology.
  {
    id: 'SPX-E-017',
    kind: 'easter-egg',
    title: 'The Red Gate\'s One Apology',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_tally_gate_red', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The red gate refuses cargoes in a flat chime, but scratched into its housing at pilot height is a single apology: SORRY FOR THE HOLD, HULL 41-9N — YOU WERE RIGHT, WE CHECKED. No gate log records the check. Hull 41-9N is not in the registry anymore. The apology is kept polished.',
    },
  },

  // SPX-E-018 — The Tally Pod's Seventh Seat.
  {
    id: 'SPX-E-018',
    kind: 'world-oneoff',
    title: 'The Tally Pod\'s Seventh Seat',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_tally_pod', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The tally pod seats six clerks but the bolt-holes for a seventh seat are still in the floor, and on audit days the six work a beat slower, as if leaving room. The seventh seat was removed after the clerk in it turned out to have been stamping manifests for a year without existing. The desk kept the seat. Just in case.',
    },
  },

  // SPX-E-019 — Marshal Nine's Spare Chair.
  {
    id: 'SPX-E-019',
    kind: 'easter-egg',
    title: 'Marshal Nine\'s Spare Chair',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_marshal_nine', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The marshal\'s booth keeps a second chair facing the desk — for visitors, officially. Unofficially it faces the door, and the marshals have a standing order that it stays empty unless someone asks for a name the booth stopped using years ago. The chair has sat four people in twenty years. All four left quiet.',
    },
  },

  // SPX-E-020 — The Refused Bay's Christmas Lights.
  {
    id: 'SPX-E-020',
    kind: 'world-oneoff',
    title: 'The Refused Bay\'s Holiday',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_refused', wu: 350 },
    channel: 'commsLog',
    payload: {
      from: 'Junction chatter',
      text: 'The bay that refuses everybody is strung with clearance lights every year on the refusal\'s anniversary — the dock crews celebrate the one bureaucrat who never bends. The lights go up, the bay refuses them too, and the crews drink to the only institution out here that cannot be bought.',
    },
  },

  // SPX-E-021 — The Second Count's Spare Ledger.
  {
    id: 'SPX-E-021',
    kind: 'anomaly',
    title: 'The Second Count\'s Spare Ledger',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_second_count', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The recount office keeps a spare ledger — a second record, handwritten, of every manifest that ever disagreed with the official count. It is not an audit book. It is a guest book. The first page, in the office founder\'s hand: EVERY DISAGREEMENT IS A CUSTOMER. The pages since are names only.',
    },
  },

  // SPX-E-022 — Customs' Own Purgatory.
  {
    id: 'SPX-E-022',
    kind: 'world-oneoff',
    title: 'Customs\' Own Purgatory',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'station_customs', wu: 500 },
    channel: 'memory',
    payload: {
      text: 'The customs station holds its own impound shelf — crates seized from customs officers by customs officers, each tagged with the seizing clerk\'s initials and the seized clerk\'s initials, sometimes the same initials twice. The shelf is full. The shelf\'s paperwork is perfect. Nobody on it has ever been charged.',
    },
  },

  // SPX-E-023 — The Slag Relay's Bedtime.
  {
    id: 'SPX-E-023',
    kind: 'world-oneoff',
    title: 'The Slag Relay\'s Bedtime',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_slag_relay', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The slag relay shuts down for nine minutes each cycle, without schedule or reason, and the crews call the pause its bedtime. Power logs show the relay drawing its full load the whole time — asleep, by every measure except the meter. The nine minutes are never the same nine. The relay has never missed one.',
    },
  },

  // SPX-E-024 — The Gallery Rock's Paid Attendance.
  {
    id: 'SPX-E-024',
    kind: 'easter-egg',
    title: 'The Gallery Rock\'s Paid Attendance',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_gallery_rock', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The carved rock the forge calls its gallery has a visitor ledger beside it — a paid desk, one clerk, and the ledger records attendance at zero for forty years while charging admission to nobody. The clerk is paid anyway, out of the maintenance fund, under a line item called APPRECIATION.',
    },
  },

  // SPX-E-025 — The Guild Stamps' Signature Wall.
  {
    id: 'SPX-E-025',
    kind: 'world-oneoff',
    title: 'The Guild Stamps\' Signature Wall',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_guild_stamps', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A bulkhead plated in struck guild stamps — every founder\'s mark the forge has ever issued, overlapped like a fresco of brass knuckles. Under the oldest mark, guild law is etched small: A STAMP IS A PROMISE KEPT AT TEMPERATURE. The wall is warm to the touch, always, even in the cold season.',
    },
  },

  // SPX-E-026 — The Reject Run's Finish Ribbon.
  {
    id: 'SPX-E-026',
    kind: 'easter-egg',
    title: 'The Reject Run\'s Finish Ribbon',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_vesta_reject_run', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The conveyor lane the forge uses for rejects ends at a crushing jaw, and across the last stretch someone strung a finish-line ribbon — the kind you break at the end of a race. The ribbon is torn and restrung each season by the yard\'s own crews. The rejects run it alone. The crews cheer anyway, says the shift log.',
    },
  },

  // SPX-E-027 — The Kilnside Claim's Standby.
  {
    id: 'SPX-E-027',
    kind: 'anomaly',
    title: 'The Kilnside Claim\'s Standby',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'poi_claim_kilnside', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A claim staked inside the kiln shadow where no ore has ever been found, kept filed and paid for thirty years by an owner nobody can name. The assay on file reads: STANDBY. The kiln crews respect it — some claims are not for ore. The steward calls it the only claim in the forge that has never been wrong.',
    },
  },

  // SPX-E-028 — The Empty Habitat's One Light.
  {
    id: 'SPX-E-028',
    kind: 'anomaly',
    title: 'The Empty Habitat\'s One Light',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pallas_empty_habitat', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'A habitation ring registered empty for sixty years with one lamp lit in a middle window — replaced by the drift\'s maintenance crews at their own expense, off the books, in a standing agreement nobody will explain. The register says the light is not power; it is a lamp, removed and relit. The crews call the upkeep tidying.',
    },
  },

  // SPX-E-029 — The Faith Stake's Honest Answer.
  {
    id: 'SPX-E-029',
    kind: 'easter-egg',
    title: 'The Faith Stake\'s Honest Answer',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pallas_faith_stake', wu: 250 },
    channel: 'comms',
    payload: {
      from: 'Unmarked beacon',
      text: 'A survey stake driven by a penitent crew who asked the drift to judge them — the beacon under it still answers their old hail code, fifty years on: IF YOU ARE LISTENING, WE ARE STILL SORRY. It answers anybody, on any channel. The sorry does not name what it is for.',
      ttl: 9,
    },
  },

  // SPX-E-030 — The Quiet Bell's Loud Neighbor.
  {
    id: 'SPX-E-030',
    kind: 'world-oneoff',
    title: 'The Quiet Bell\'s Loud Neighbor',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pallas_quiet_bell', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'The bell that is never rung hangs beside a dock chime that rings for everything — berths, meals, shift turns, complaints. Drift hands say the pair is deliberate: one bell for the news everyone hears, one for the news nobody gets told. The quiet bell is polished weekly. It has never been struck on record.',
    },
  },

  // SPX-E-031 — The Den Arch's Four Rocks.
  {
    id: 'SPX-E-031',
    kind: 'anomaly',
    title: 'The Den Arch\'s Four Rocks',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_den_arch_a', wu: 300 },
    channel: 'spectacle',
    payload: {
      from: 'The den arches',
      text: 'Four stone arches in file — A through D on the old charts — each casting a shadow that lands one arch late: A\'s shadow falls on B, B\'s on C. On D, nothing lands. Chart it and the survey flags the geometry as unremarkable, which is how the drift files everything it cannot explain.',
    },
  },

  // SPX-E-032 — The Eighteenth Dock's Wild Oats.
  {
    id: 'SPX-E-032',
    kind: 'world-oneoff',
    title: 'The Eighteenth Dock\'s Wild Oats',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'proximity', nearStation: 'poi_pallas_eighteenth', wu: 350 },
    channel: 'commsLog',
    payload: {
      from: 'Drift chatter',
      text: 'The eighteenth dock was where smugglers sowed their wild oats — a berth of bad decisions under a wall of scratched hull-names, deepest scratch belonging to a pilot who is a customs marshal now. The names are preserved by the dock\'s own ordinance: history, says the rule, is the one cargo no one may seize.',
    },
  },

  // SPX-E-033 — The Shepherd's Ring's Stray.
  {
    id: 'SPX-E-033',
    kind: 'anomaly',
    title: 'The Shepherd\'s Ring\'s Stray',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_shepherds_ring', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'A ring of moored cargo tethers around nothing — built to hold a station that never arrived. The shepherds still patrol the ring as if it mattered, and their logs record the empty center as PRESENT, EVERY CHECK. One stray tether trails the ring, attached to a crate that has circled it for eleven years unclaimed.',
    },
  },

  // SPX-E-034 — The Quiet Mast's Standing Order.
  {
    id: 'SPX-E-034',
    kind: 'world-oneoff',
    title: 'The Quiet Mast\'s Standing Order',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_quiet_mast', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'A listening mast with one standing order bolted to its base: LOG EVERYTHING. REPLY TO NOTHING. For forty years it has logged every hail in the reach and answered none — until the survey found, filed, and sealed a single reply on the day the mast\'s first operator died. The reply is one word. The file does not quote it.',
    },
  },

  // SPX-E-035 — The Burn Stake's Anniversary Crew.
  {
    id: 'SPX-E-035',
    kind: 'world-oneoff',
    title: 'The Burn Stake\'s Anniversary Crew',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_burn_stake', wu: 300 },
    channel: 'commsLog',
    payload: {
      from: 'Reach chatter',
      text: 'The stake where the first engine test blew a hole in the chart is tended every year by a crew that does not exist — no ship, no manifest, just a fresh wreath of cooling fins on the anniversary. The reach\'s insurance desk writes it down as weather. Weather with wrenches, says the desk, off the record.',
    },
  },

  // SPX-E-036 — The Merc Station's Empty Throne.
  {
    id: 'SPX-E-036',
    kind: 'easter-egg',
    title: 'The Merc\'s Empty Throne',
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'station_io_merc', wu: 400 },
    channel: 'memory',
    payload: {
      text: 'The mercenary exchange keeps an unlisted berth at the center of its dock plan — the throne, reserved since the exchange opened for a contractor whose account number has never been issued. On the exchange\'s books the berth is OCCUPIED. The harbor office declines to say by whom. The berth\'s dues are paid in advance, forever.',
    },
  },

  // SPX-E-037 — The Cinder Nursery's Warm Stones.
  {
    id: 'SPX-E-037',
    kind: 'anomaly',
    title: 'The Cinder Nursery\'s Warm Stones',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'world_site_charon_cinder_nursery', wu: 350 },
    channel: 'spectacle',
    payload: {
      from: 'The nursery drift',
      text: 'A drift of fist-sized cinders, each one warm — not hot, just warm, the way a thing is after hands. The survey calls it residual; the haulers call them eggs and will not mine them. The cinders drift a little closer together every year on record, in no current anyone can find.',
    },
  },

  // SPX-E-038 — The Broken Shepherd's Lamb.
  {
    id: 'SPX-E-038',
    kind: 'anomaly',
    title: 'The Broken Shepherd\'s Lamb',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_broken_shepherd', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The shepherding drone that failed forty years ago still holds station beside a single rock — the rest of its flock long mined out. It corrects the rock\'s drift on schedule, scans it on schedule, reports it intact on schedule. The reports go to a decommissioned desk. The desk auto-files them. The filing is impeccable.',
    },
  },

  // SPX-E-039 — The Reader Stake's Margin.
  {
    id: 'SPX-E-039',
    kind: 'easter-egg',
    title: 'The Reader Stake\'s Margin',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_reader_stake', wu: 250 },
    channel: 'memory',
    payload: {
      text: 'A survey stake someone turned into a lectern — a weathered ledger chained to it, entries in hundreds of hands, each one a name and a single line about a crossing. The earliest pages are illegible; the newest page is dated this week. The book has no owner. The chain is very old. The writing never stops.',
    },
  },

  // SPX-E-040 — The Tether Wreck's Second Knot.
  {
    id: 'SPX-E-040',
    kind: 'anomaly',
    title: 'The Tether Wreck\'s Second Knot',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_tether_wreck', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The wreck is famous for the knot that killed it — a tow line that fouled its own drive. Chart records show a second knot tied over the first, later, by a hand. It holds the hull to its own debris field, like an animal tied to its shadow. The second knot has never been claimed. It has never slipped either.',
    },
  },

  // SPX-E-041 — The Throne's Unpaid Bill.
  {
    id: 'SPX-E-041',
    kind: 'easter-egg',
    title: 'The Throne\'s Unpaid Bill',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_throne', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The seat the haven\'s last boss built out of seized bail bonds is still occupied — by the bill he never paid. The haven\'s accountants read it aloud every year on the seat\'s anniversary, in the harbor, in full. The reading takes eleven minutes. The bill accrues. The accountants call it the only honest contract the man ever signed.',
    },
  },

  // SPX-E-042 — The Red Snow's Only Witness.
  {
    id: 'SPX-E-042',
    kind: 'anomaly',
    title: 'The Red Snow\'s Only Witness',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_red_snow', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The patch where the frost reads red on every scan — iron in the ice, says the assay, but the haven\'s story is that one crew saw what made it and signed a treaty with each other never to say. The treaty is on file. The only unredacted line is the last one: IT WAS NOT WORTH THE WITNESS.',
    },
  },

  // SPX-E-043 — The Quiet Dock's Loud Record.
  {
    id: 'SPX-E-043',
    kind: 'easter-egg',
    title: 'The Quiet Dock\'s Loud Record',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_quiet_dock', wu: 300 },
    channel: 'commsLog',
    payload: {
      from: 'Haven chatter',
      text: 'The berth where the haven parks people it cannot file — officially quiet, unpatrolled, unlogged. The dock\'s one concession to order is a sign over the cradle: NO RECORDS. Beneath it, in harbor paint, someone has underlined the words NO and RECORDS separately, so it reads two ways at once.',
    },
  },

  // SPX-E-044 — The Penance Moor's Paid Debt.
  {
    id: 'SPX-E-044',
    kind: 'world-oneoff',
    title: 'The Penance Moor\'s Paid Debt',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'proximity', nearStation: 'poi_sker_penance_moor', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The mooring where debtors work off what they owe — every hull on it flies a white tag showing balance-remaining, updated by the debtors themselves. One hull has carried a tag reading PAID for nine years and has never left. The haven lets it stay. It is the only thing on the moor that is free.',
    },
  },

  // SPX-E-045 — The Wormhole's Return Address.
  {
    id: 'SPX-E-045',
    kind: 'anomaly',
    title: 'The Wormhole\'s Return Address',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_wormhole', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'The wormhole\'s registry entry lists a return address — not a coordinate, a mail drop: a numbered drawer in the Veil station\'s dead-letter room where probes that go through and come back get filed. The drawer has held exactly three probes. Each came back with its clock running. Each clock is wrong in a different direction.',
    },
  },

  // SPX-E-046 — The Quiet Ice's Debtors' Row.
  {
    id: 'SPX-E-046',
    kind: 'anomaly',
    title: 'The Quiet Ice\'s Debtors\' Row',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_quiet_ice', wu: 350 },
    channel: 'memory',
    payload: {
      text: 'A sheet of sensor-quiet ice where the veil keeps its unpayable instruments — every dead probe the survey could not afford to fix, parked in a neat row. They still hum when the nebula sings. The desk that owns them is dissolved; the row is maintained by an order that outlived the desk: KEEP THE QUIET ONES TOGETHER.',
    },
  },

  // SPX-E-047 — The Revoked Gate's Standing Apology.
  {
    id: 'SPX-E-047',
    kind: 'easter-egg',
    title: 'The Revoked Gate\'s Standing Apology',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_revoked_gate', wu: 300 },
    channel: 'comms',
    payload: {
      from: 'Revoked gate',
      text: 'A gate whose charter was revoked mid-construction — it still powers up for ships that approach, cycles its lamps in the old sequence, and transmits one sentence on the navigation band: THIS GATE IS NOT A GATE. It apologizes, in a sense. Ships slow anyway. The lamps are very persuasive.',
      ttl: 9,
    },
  },

  // SPX-E-048 — The Exception Chamber's One Tenant.
  {
    id: 'SPX-E-048',
    kind: 'anomaly',
    title: 'The Exception Chamber\'s One Tenant',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'poi_veil_exception_chamber', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The chamber built for things the rules cannot classify has one permanent tenant: a filing cabinet labeled PENDING DEFINITION, containing the chamber\'s own paperwork. The survey notes the recursion and files it — inside the cabinet, on page one. The cabinet is full. The definition is still pending.',
    },
  },

  // SPX-E-049 — The Breathing Dock's Held Breath.
  {
    id: 'SPX-E-049',
    kind: 'anomaly',
    title: 'The Breathing Dock\'s Held Breath',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_breathing_dock', wu: 350 },
    channel: 'spectacle',
    payload: {
      from: 'The dock frame',
      text: 'The dock \'breathes\' — a pressure pulse through the old pressure mains, in and out on a four-second tide. For sixty seconds a year it stops. The crews call the pause the held breath and nobody works through it; the ashfall\'s oldest hands say the dock is listening. The maintenance log calls it a valve fault. The valve was removed thirty years ago.',
    },
  },

  // SPX-E-050 — The Underlayer Gate's Two Keys.
  {
    id: 'SPX-E-050',
    kind: 'easter-egg',
    title: 'The Underlayer Gate\'s Two Keys',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_ashfall_gate_underlayer', wu: 300 },
    channel: 'memory',
    payload: {
      text: 'The underlayer gate opens on two keyholes — one operated by the port authority, one by nobody the port will name. Both keys have been used, on the log, exactly once: the same hour, thirty years apart, opening the same door for a single hull each time. The second use is logged in the same hand as the first. The clerk who wrote both entries is on file as two different people.',
    },
  },
];
