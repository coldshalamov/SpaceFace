// src/data/special500/entries-visual-a.js — visual-setpiece batch A (cat-visual-a).
// 35 entries from design/program/special-500/batches/cat-visual-a.json, authored
// against the ratified consensus in CONSENSUS_500.json. The payload text is the
// pilot's noticing line; the full renderer leg is a later graphics batch keyed on
// the same memory receipt. Trigger anchors verified against live data: sectors
// (src/data/sectors.js SECTORS[] incl. the frontier spread), stations, bus events
// (story:kurtzLedger, aceMemory:heirNamed, aceMemory:returnRequested,
// drill:chargeBlast, claim:convoyDocked) and the world calendar festivals.

export const ENTRIES_VISUAL_A = [
  // SP1-062 — The Intake Ballet: shift-turn ore spiral at the Forge intake. Absorbs
  // SP1-034's tailings scoop-drones and the deadpan hull-naming broadcast.
  {
    id: 'SP1-062',
    kind: 'visual-setpiece',
    title: 'The Intake Ballet',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 3, windowS: [192, 250] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Forge intake',
      text: 'Shift turn at the Forge intake: eight ore barges pour into a single slow spiral, each one shedding the queue exactly on the horn, and the intake throat never stops swallowing. Tugs put the off-key ones back in step with two-second shoves you can read from the lane. Down the spill line, scoop-drones sift tailings while the tower reads out hull names in the flattest voice ever put on a wire — it has never once gotten a name wrong.',
    },
  },

  // SP3-006 — The Lantern Winks: Founders' Day, the painted sky plate pulses once.
  // Carries SP3-020's Quiet Night double-pulse as the second observation.
  {
    id: 'SP3-006',
    kind: 'visual-setpiece',
    title: 'The Lantern Winks',
    sectors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 0, windowS: [196, 216] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Charter watch',
      text: 'Founders’ Day. The reading is done, and for one slow pulse the lit mass painted into the sector’s sky — the lantern shelf behind the stars — brightens and lets go, like something back there acknowledging the Charter. Old watchers swear it winked twice, once, on the Quiet Night. Nobody has caught it again. Once a year, easy to miss, impossible to unsee.',
    },
  },

  // SP1-159 — The Fog Wedding: lights-only ceremony in the Veil fog. Absorbs
  // SP1-169's freight liturgy ("in slack and in strain") and the merged-line toll.
  {
    id: 'SP1-159',
    kind: 'visual-setpiece',
    title: 'The Fog Wedding',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'station_veil', wu: 1200 },
    channel: 'spectacle',
    payload: {
      from: 'Veil fog',
      text: 'A wedding in the fog, and nobody sees a hull: two ships exchange vows as approach patterns and a horn duet, then both families’ convoys open a corridor of running lights through the soup — an aisle you are silently invited to join. The liturgy, when it comes over the band, is freight-grade: “in slack and in strain.” From tonight the two lines run merged, tolls and all, under a name chosen while you watched.',
    },
    followup: 'bespoke leg: joining the light corridor is a judged formation event; the married pair’s merged convoy persists afterward as a named fixture record.',
  },

  // SP3-106 — The Quiet Night Itself: smuggler berths at floor gain, all day.
  // Absorbs SP3-188's midnight minute (the 90% duck) as the festival's center beat.
  {
    id: 'SP3-106',
    kind: 'visual-setpiece',
    title: 'The Quiet Night Itself',
    sectors: ['sector_pallas_drift', 'sector_sker_haven'],
    trigger: { type: 'calendar', dayOfYear: 21, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Smuggler berths',
      text: 'The Quiet Night, and the smuggler berths lower their lamps to the floor — not dark, just lowered — window rows burning at half, ships docking without floodlights. At the night’s center the whole berth ducks nine ticks deeper and holds one minute; even the arguments wait. It is the one day the black market keeps its voice down, and you can see it from approach range.',
    },
  },

  // SP3-085 — All the Bells: Forge Due toll wave crossing the infrastructure.
  // Absorbs SP3-190's five-stack whistle phrase and the books-closed lamp step.
  {
    id: 'SP3-085',
    kind: 'visual-setpiece',
    title: 'All the Bells',
    sectors: ['sector_vesta_forge', 'sector_ceres_belt', 'sector_sker_haven'],
    trigger: { type: 'calendar', dayOfYear: 26, windowS: [194, 248] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Forge Due',
      text: 'The Eighth Bell tolls, and two seconds behind each toll the sector’s window rows flash once in a traveling wave — the toll physically passing through the infrastructure, gate by gate. A five-stack whistle phrase rides the crest and the lamps step down to their books-closed gain. Out in Ceres and Sker the yard bells answer one octave down.',
    },
  },
  // SP3-083 — The Pour: foundry spine event light with an arc. Absorbs SP3-096's
  // annealing afterglow as the closing phase: pour, spread, anneal.
  {
    id: 'SP3-083',
    kind: 'visual-setpiece',
    title: 'The Pour',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 9, windowS: [250, 345] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Forge floor',
      text: 'The foundry spine opens and the pour runs: a white-orange channel of melt light landing on every hull parked within two hundred WU — real event light — while the glow itself walks the spine gate by gate. The final mould flashes once and goes dark, and the annealing afterglow fades over the next minute, the sector’s whole economy made visible and then put away.',
    },
  },

  // SP3-065 — The Boulder Binary: the belt's clockwork pair, period exactly one
  // 600 s day. Absorbs SP3-063 (one pair, not two): articulation sleeps beyond
  // 600 WU, sparks only on player-near ticks.
  {
    id: 'SP3-065',
    kind: 'visual-setpiece',
    title: 'The Boulder Binary',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Reef approach',
      text: 'Two matched boulders orbit a common point about a ship-length apart, their orbit plane hazed faint with abraded dust — a clockwork the belt wound itself. The period is exactly one 600-second day; miners set watches by them and don’t argue about whose watch is right. Inside 600 WU the pair throws sparks at the close pass. Beyond that they keep the time in silence.',
    },
  },

  // SP3-076 — Avalanche: the overburden pile lets go. Absorbs SP3-064's
  // shoot-the-pile trigger; terrain memory persists one season, then heals.
  {
    id: 'SP3-076',
    kind: 'visual-setpiece',
    title: 'Avalanche',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'receipt', event: 'drill:chargeBlast' },
    channel: 'spectacle',
    payload: {
      from: 'Cut floor',
      text: 'The overburden pile lets go downslope in three surges — each one a grinding, light-flecked front that buries the field’s low side and settles into terrain that will hold until the season turns and heals it. The drill rig rides it out on its legs, lights blinking something insulted. The slide has opened fresh ore on the cut face. The heal takes a season; the ore doesn’t wait.',
    },
  },

  // SP3-001 — The Glint Hour: the key light's azimuth crosses the authored glint
  // bearing. Absorbs SP3-164's debris-arc walk as the second venue; wire posts both.
  {
    id: 'SP3-001',
    kind: 'visual-setpiece',
    title: 'The Glint Hour',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 5, windowS: [400, 440] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Helios watch',
      text: 'Glint hour at Helios, third bell: the key light’s azimuth crosses the glint bearing and every lacquered hull, pod and wreck in view flares its clear-coat sun glint inside the same two seconds — a traveling sparkle wave crossing the field as the angle sweeps. Nothing is added to the scene; the world just admits, once a day, that it is polished metal. The debris arc off the lane gets its own walk a beat later, and the wire posts both minutes.',
    },
  },

  // SP1-183 — The Last Tow: the Ceres yard retires its oldest tug with honors.
  // Absorbs SP3-103's single-bow-lamp procession and lane-hold; the log rides the column.
  {
    id: 'SP1-183',
    kind: 'visual-setpiece',
    title: 'The Last Tow',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 16, windowS: [0, 600] },
    channel: 'spectacle',
    payload: {
      from: 'Ceres shipbreak',
      text: 'The yard retires its oldest tug with full honors: a procession to the crusher mouth, every working hull at rest with lights on, one bow lamp riding lead and the whole lane holding for it. Her forty-year log goes out over the band, read by the three crew who know it best. Then the yard’s own tradition — one last tow, unmanned, into the jaw, at the exact speed she always towed at. The next hull to wear the yard’s collar will carry her name.',
    },
  },
  // SP3-044 — The Fireball: one boulder-sized meteor crosses the sector and lands
  // real. Absorbs SP3-196: the surge-exit stone lands exactly on the end tick.
  {
    id: 'SP3-044',
    kind: 'visual-setpiece',
    title: 'The Fireball',
    sectors: ['sector_veil_nebula', 'sector_vesta_forge'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'Storm watch',
      text: 'A boulder-sized fireball crosses the whole sector in eight seconds — brighter than anything else up there, beating successive light pulses across the field beneath it — and lands somewhere real: a smoking crater marker with fresh ore in the rim until end of day, for anyone who read the bearing off the wire. The last stone of the surge comes down exactly on the surge’s last tick.',
    },
  },

  // SPX-B-01 — The Arrival Stencil: hull-paint welcome on the starter lane rock.
  {
    id: 'SPX-B-01',
    kind: 'visual-setpiece',
    title: 'The Arrival Stencil',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 2000 },
    channel: 'spectacle',
    payload: {
      from: 'Starter lane',
      text: 'Stenciled hull-paint on the lane’s biggest rock, renewed by dockhands between shifts: WELCOME TO THE LANE. MIND THE TANKERS. Under it, a chalked list of the three dumbest ways to die here, honest and current — number three is “the scan ring is NOT a suggestion.” One line is scratched out and corrected in different paint, and the correction is the tutorial the briefing skipped. Regulars add a small mark each time they pass clean.',
    },
  },

  // SPX-C-05 — The Pigeon Day: twelve racers, one derelict loft. The birds cross
  // the sector as a visible vignette column; landing is props parking at the wreck.
  {
    id: 'SPX-C-05',
    kind: 'visual-setpiece',
    title: 'The Pigeon Day',
    sectors: [],
    trigger: { type: 'receipt', event: 'claim:convoyDocked' },
    channel: 'spectacle',
    payload: {
      from: 'Loft wire',
      text: 'The coop carrier docks, the loft’s new keeper signs, and twelve racers are released for the ceremonial first flight — whereupon the birds, who remember the OLD loft, cross the entire sector in a tight line and land on the old one, a welded-shut derelict. The keeper watches the whole crossing, then writes “twelve for twelve” in the log anyway. There is a lamp on the derelict now. The keeper feeds them there on market days.',
    },
  },

  // SP3-005 — Comet Perihelion: days 15-17, the background comet at near-plane.
  // One perihelion event, three human responses: the road, the race, the stones.
  {
    id: 'SP3-005',
    kind: 'visual-setpiece',
    title: 'Comet Perihelion',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 15, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Perihelion wire',
      text: 'The comet drops from sky depth to near-plane for one day, tail streaming anti-sunward, close enough that its parallax moves when you do. On the middle day it sheds three real debris stones into the sector; intercept one before it sublimates on day 17. The road runners run it, the racers race each other along it, and the stones fall through the middle of both. One comet. Three answers.',
    },
  },

  // SPX-B-08 — The Shadow Ring: a pure-flying ritual, no prompt, no marker.
  {
    id: 'SPX-B-08',
    kind: 'visual-setpiece',
    title: 'The Shadow Ring',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Gulf rock',
      text: 'A faded painted ring on a flat-faced rock off the trade lane, a tiny dead lamp at its center. No marker, no prompt, no legend on the charts — but the paint is fresh enough, and on the days the lamp is lit there is no other reason for it to be. Locals will not explain it. When new paint appears under the ring it reads, simply: STILL GOT IT.',
    },
    followup: 'bespoke leg: fly your hull’s shadow inside the ring at the right sun minute (shadow-geometry predicate) to light the lamp for the day; a story.flags hit counter pays the tenth-hit paint.',
  },
  // SPX-A-08 — The Last Ferry: shift-turn column life on the Io Reach lane.
  {
    id: 'SPX-A-08',
    kind: 'visual-setpiece',
    title: 'The Last Ferry',
    sectors: ['sector_io_reach'],
    trigger: { type: 'calendar', dayOfYear: 2, windowS: [194, 236] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Io Reach',
      text: 'At the shift turn a two-hull ferry pair crosses the trade lane sharing one lamp hung between them — the older hull visibly half-towing the younger, and has been for years. They hold their lane, they keep their speed, and the wire has never once mentioned them. Some things run because somebody keeps them running.',
    },
  },

  // SP2-160 — The Ashcache Count Completion: Kurtz counts, and the count is 42.
  {
    id: 'SP2-160',
    kind: 'visual-setpiece',
    title: 'The Ashcache Count Completion',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'receipt', event: 'story:kurtzLedger' },
    channel: 'spectacle',
    payload: {
      from: 'Ashcache floor',
      text: 'Kurtz counts as you land, aloud, the way the Quiet always counted — and for the first time the count includes your hull: “...forty-one, forty-two.” The count is correct. The count has always been correct. On the dead liner’s ledger page, the wind turns a leaf of paper. The wind here does not move anything else.',
    },
  },

  // SP1-047 — The Berth Queue: peak-shift holding pattern at the Helios dock spine.
  {
    id: 'SP1-047',
    kind: 'visual-setpiece',
    title: 'The Berth Queue',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 1500 },
    channel: 'spectacle',
    payload: {
      from: 'Helios approach',
      text: 'Peak shift at Helios and the queue is visible from the gate: six hulls holding pattern around the dock spine in a slow spiral, a tug assigning berths in hand-signal light codes, and two captains bickering on the band about who called it first — “I said ‘mark’ before he said ‘dibs’” — while the tug, who heard both, assigns neither. Join the queue politely. The controller notices who cuts, and remembers longer than you’d think.',
    },
  },

  // SP2-100 — The Choir's Hundredth Pilgrim: the depot gate says the count aloud,
  // then every Bell in range pulses out of cadence, once, together.
  {
    id: 'SP2-100',
    kind: 'visual-setpiece',
    title: 'The Choir’s Hundredth Pilgrim',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_depot3', wu: 1400 },
    channel: 'spectacle',
    payload: {
      from: 'Choir depot',
      text: 'The depot gate reads its hundredth pilgrim of the season aloud — the bell says it, the PA says it, the number is spoken so nobody has to guess — and then every Bell in range pulses out of cadence, once, together, deliberately, and every Choir hull in the sector lights its ribbons at the same breath. The pilgrim transports all stop for one heartbeat. Then everything resumes. “The Pattern noticed. It does not always. Today it did.”',
    },
  },

  // SP3-025 — The Sling Chime: the Anvil gravity-assist band, mass made audible.
  {
    id: 'SP3-025',
    kind: 'visual-setpiece',
    title: 'The Sling Chime',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Anvil sling',
      text: 'The gravity-assist band around the Anvil becomes visible for a moment: every predictor line and engine trail inside it bends into the same family of arcs, and a low harmonic swells under the band chatter — mass made audible. Passing haulers all sing the same note at the same place on the curve. It is the most lawlike sound in the sector; even the pirates cross it politely.',
    },
    followup: 'bespoke leg: the sling-band predicate (tangential above 140 WU/s between r 1040-1450) swells the shared harmonic and bends the player’s predictor with everyone else’s; codex page “mass made audible”.',
  },
  // SP2-121 — Solstice's Dark Lantern: the one seeded night the belt's grid is
  // down, and the lantern is the north.
  {
    id: 'SP2-121',
    kind: 'visual-setpiece',
    title: 'Solstice’s Dark Lantern',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 27, windowS: [400, 520] },
    channel: 'spectacle',
    payload: {
      from: 'The belt',
      text: 'The belt’s grid is down — it happens once, and this is the night — and in a field of dead lamps Solstice’s lantern is the only light left burning. Every drifting hull, wreck and claim tag in reach has turned to face it. The belt has a north for one night, and the north is a lantern. Solstice, who did not ask for this: “I did not know I was the north. I will try to be steady.”',
    },
  },

  // SP1-115 — The Range Note: Sable Iask's subscription reminder. Story-prop fleck
  // via the presentation-cue path; accuracy untouched.
  {
    id: 'SP1-115',
    kind: 'visual-setpiece',
    title: 'The Range Note',
    sectors: [],
    trigger: { type: 'receipt', event: 'aceMemory:returnRequested' },
    channel: 'spectacle',
    payload: {
      from: 'Nowhere',
      text: 'A red ranging fleck crosses your hull glass — brief, precise, from nowhere — and no contact appears on any scanner. It is not an attack. It is a subscription reminder from Sable Iask: range is mine. I decide when. The flecks last the day. Your gunners check their harnesses without being told.',
    },
  },

  // SP2-076 — The Shoal Toast: bloom day at the Nereid bar, one word in unison.
  {
    id: 'SP2-076',
    kind: 'visual-setpiece',
    title: 'The Shoal Toast',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'calendar', dayOfYear: 18, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Nereid bar',
      text: 'Bloom day in the shoal: outside the glass the year’s bloom passes like slow fireworks, the bar’s lights dim on cue, and every glass in the place goes up at once. The toast is one word, in unison, and the word is the name of the pilot who mapped the shoal first — the one the charts kept and the wrecks remember. Visitors drink it without knowing what they are toasting. The regulars let them.',
    },
  },

  // SP1-008 — The Captain's tow: a Reach pack buries its own. Wire announcement;
  // the tow column itself is the graphics leg. Attacking it costs Reach standing.
  {
    id: 'SP1-008',
    kind: 'visual-setpiece',
    title: 'The Captain’s tow',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'receipt', event: 'aceMemory:heirNamed' },
    channel: 'news',
    payload: {
      text: 'REACH BURIAL — a Reach pack takes a dead captain home on the long burn: casket-rigged hull in slow column toward the star, engines dim, a wasp peeling off every hundred WU like a gun salute. The pack has declared hands-off for the tow, and is keeping it. You should too; every Reach pack will remember it otherwise.',
      kind: 'incidents',
    },
  },

  // SP3-060 — The Clearing: the wipe that ends every storm. Pairs with the
  // Forecast Bell to teach the whole weather arc.
  {
    id: 'SP3-060',
    kind: 'visual-setpiece',
    title: 'The Clearing',
    sectors: [],
    trigger: { type: 'hashDaily', chance: 0.5 },
    channel: 'spectacle',
    payload: {
      from: 'Weather eye',
      text: 'The sky cleans in one wipe: the curtain-light collapses anti-sunward, stars sharpen over a single second, the gas thins, and every hull’s rim light comes back at once — the whole sector audibly relaxes, one low exhale under the mix. It ends every storm the same way. Five seconds. Best weather in the game, and the Forecast Bell taught you to wait for it.',
    },
  },
  // SP1-073 — The Ring of Hands: nine survivors keeping order by hand.
  {
    id: 'SP1-073',
    kind: 'visual-setpiece',
    title: 'The Ring of Hands',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'station_veil', wu: 1800 },
    channel: 'spectacle',
    payload: {
      from: 'Deep anomaly',
      text: 'Nine suited survivors drifting in a perfect ring, hand over hand, suits touching suits — the only way nine people keep together without tethers. They do not break the ring to wave. One of them conducts, silently, keeping the whole circle facing the rescue beacon, and the conductor’s tempo is the only order left in this dark.',
    },
    followup: 'bespoke leg: a formation-preserved tow — pull the ring home intact; breaking formation scatters them. Each survivor reaches a different port and the story travels.',
  },

  // SP1-150 — The Ashfall Skim: Ashfall's own refinery skim runs (the Anvil is
  // Tethys's planet). The lane registers as an environmentalMachinery field row.
  {
    id: 'SP1-150',
    kind: 'visual-setpiece',
    title: 'The Ashfall Skim',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'calendar', dayOfYear: 8, windowS: [300, 420] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Skim crew',
      text: 'Ashfall’s skim barges dip close enough to the star that their hulls read as silhouettes against the flare, collector fields dragging behind them on lines, and the crew’s voices come over the band with the calm of people who do this twice a shift. The star is enormous and completely indifferent. Behind the barges the collector fields shear the local drag into a brief speed lane. Flying it uninvited is possible, stupid, and faintly legendary.',
    },
  },

  // SP1-151 — The Frost Line: the belt's economy, visible as a radius nobody
  // crosses without a reason.
  {
    id: 'SP1-151',
    kind: 'visual-setpiece',
    title: 'The Frost Line',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Outer belt',
      text: 'One invisible boundary and the universe changes: hull rims whiten with feathered ice, exhales hang, comms acquire a crackle, and every hull ahead of you wears the same frost. You can see the line in the traffic itself — the belt’s whole economy, stacked up on the sunward side of a radius nobody crosses without a reason. Your own hull frosts from the nose back, in real time, and stays frosted until you turn sunward. That is your trip record now.',
    },
  },

  // SP1-153 — The Full Burn: the station fleet drill. Morale is a system.
  {
    id: 'SP1-153',
    kind: 'visual-setpiece',
    title: 'The Full Burn',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 10, windowS: [140, 190] },
    channel: 'spectacle',
    payload: {
      from: 'Helios tower',
      text: 'The drill, announced: every operational hull at the station — tugs, barges, patrol, the lot — lights off simultaneously for a synchronized station-keeping burn, holds ten seconds, and cuts together. Pure, pointless, perfect choreography. It exists because a stationmaster sixty years ago decided morale was a system, and the system has outlived everyone who laughed at it. The formation ring takes any hull that joins; the tower grades you once, forever.',
    },
  },

  // SP2-133 — The Reheat Ceremony: the Half-Cut wants one more rotation, no
  // further. The delivery is the trigger leg; the ceremony is the payoff.
  {
    id: 'SP2-133',
    kind: 'visual-setpiece',
    title: 'The Reheat Ceremony',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'proximity', nearStation: 'station_hyperion_claim', wu: 1200 },
    channel: 'spectacle',
    payload: {
      from: 'Half-Cut',
      text: 'The Half-Cut platform, dead where it stands: crusher stopped mid-bite sixty years ago, mast light dark, and every crew on the channel mutters the same rumor — the old girl wants one more rotation, no further. Bring her a full load of cells and see.',
    },
    followup: 'bespoke leg: a full fuel-cell load physically dropped at the platform beacon fires the single crusher rotation, the crews’ synchronized line (“THAT IS FAR ENOUGH. THAT WAS ALWAYS FAR ENOUGH.”) and the mast double-blink; flag half_cut_honored.',
  },
  // SP1-155 — The Broadside: the moon takes a meteor stream face-on (renamed per
  // consensus hones; SP3-126 owns "The Long Fall").
  {
    id: 'SP1-155',
    kind: 'visual-setpiece',
    title: 'The Broadside',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'calendar', dayOfYear: 31, windowS: [60, 420] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Ashfall watch',
      text: 'The moon takes a meteor stream broadside: a hundred visible impacts stitched across its face like a slow string of flashbulbs, each one throwing a plume you can pick out from the lane. The band goes uncharacteristically respectful. The moon is not in danger — it has taken worse for four billion years — and everyone watches anyway. The stream’s leading edge is real iron crossing the lane; dodge it or weather it.',
    },
  },

  // SP1-157 — The Lightning Farmers: storm season on the farm rocks.
  {
    id: 'SP1-157',
    kind: 'visual-setpiece',
    title: 'The Lightning Farmers',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'proximity', nearStation: 'station_veil', wu: 2600 },
    channel: 'spectacle',
    payload: {
      from: 'Farm band',
      text: 'Storm season on the farm rocks: the cells ground themselves on the ridge and the farmers harvest — long collector lines between the rocks, each strike running the line to a capacitor bank with a bang you feel in your teeth. The commentary on the band has the rhythm of people who talk about weather because the weather is the whole conversation. Charged cells for sale, queue on the left, and the farmer will tell you for free which rock to stand behind.',
    },
  },

  // SP1-052 — The Merger Convoy: two columns become one, manifests read like a
  // marriage register. Twice the loot, twice the escort work; everyone knows it.
  {
    id: 'SP1-052',
    kind: 'visual-setpiece',
    title: 'The Merger Convoy',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.15 },
    channel: 'spectacle',
    payload: {
      from: 'Belt lane',
      text: 'Two convoys meet at the junction, run lights-to-lights for a moment, and merge into one column with the old leads falling in side by side — the band carries a brief, formal exchange of freight manifests, read like a marriage register. Everybody on that frequency knows what a doubled column means: twice the loot for raiders, twice the escort work, one shared graveyard if it goes wrong. The leads light cigars anyway. Nobody smokes in vacuum; it is the gesture that counts.',
    },
  },

  // SP3-036 — Ocean Glint Walk: the specular bead crossing the Anvil's ocean band.
  {
    id: 'SP3-036',
    kind: 'visual-setpiece',
    title: 'Ocean Glint Walk',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 6, windowS: [430, 470] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Anvil approach',
      text: 'A single burning point of reflected sun slides across the Anvil’s ocean band like a bead of fire, widening as the angle shallows into a golden road of specular glint, then pinching out at the limb. Forty seconds, once a day, pure sun-angle geometry. For exactly that long the planet reads as what it is: water, with a sky over it.',
    },
  },

  // SP3-028 — Moonrise Over the Anvil: a daily moonrise signature, fully decoupled
  // from the eclipse chain — not a fourth transit.
  {
    id: 'SP3-028',
    kind: 'visual-setpiece',
    title: 'Moonrise Over the Anvil',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 30, windowS: [120, 360] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Tethys watch',
      text: 'A small cratered moonlet the background never quite showed before rises across the Anvil’s face — a hard black coin with a lit rim, taking four minutes to cross, close enough to read as a place and not a painting. No eclipse in it, no omen: a moonrise, signed. Watch it once and you will find yourself checking the sky on day 30 ever after.',
    },
  },
];
