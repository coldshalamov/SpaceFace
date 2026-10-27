// src/data/special500/entries-visual-b.js — visual-setpiece batch B (cat-visual-b).
// 35 entries from design/program/special-500/batches/cat-visual-b.json, authored
// against the ratified consensus in CONSENSUS_500.json. The payload text is the
// pilot's noticing line; the full renderer leg is a later graphics batch keyed on
// the same memory receipt. Triggers are deterministic only, verified against live
// data: sectors (src/data/sectors.js SECTORS[] + src/data/frontierRegions/*.js +
// sector_the_bolus from src/data/theBolus.js), station/POI anchors (station_helios,
// station_ashcache, station_bolus_rib — real stations[] rows), bus events emitted
// in src/systems (player:death, planet:plungeStage, dock:docked, entity:killed,
// massline:rideStarted) and the world calendar (shift turns at 0/200/400 s per
// 600 s day; festival dayOfYear rows in worldCalendar.js FESTIVALS).
//
// Sector notes / remaps (wave-1 precedent header):
// - SP1-011: consensus "outlaw_zone" is an encounter zone type, not a sector id —
//   scoped to sector_ashfall_reach (the outlaw region the consensus names).
// - SP2-196: "the Pitborn anchorage" has no station row — proximity anchored at
//   station_ashcache (the Ashfall station); the anchorage staging itself is the
//   bespoke leg's spawn.
// - SP3-137: sector_the_bolus verified real (theBolus.js BOLUS_SECTOR_ID); the
//   "throat" proximity anchors at station_bolus_rib (the Bolus's own station).
// - SP1-193: the "helios -> ashfall" buoy corridor is scoped to the two real
//   neighbor routes (sectors.js neighbors): helios/vesta/tethys/charon/io/ashfall.
// Weather-surge prose (surge ends, storm phases, calm-phase events) maps to
// hashDaily per wave-1 precedent (SP3-044, SP3-060); the season-kind predicate is
// the bespoke leg named in the followup where the leg needs it.

export const ENTRIES_VISUAL_B = [
  // SP3-136 — The Bell Tolls for You: your own death gets the wrecks' grammar.
  {
    id: 'SP3-136',
    kind: 'visual-setpiece',
    title: 'The Bell Tolls for You',
    sectors: [],
    trigger: { type: 'receipt', event: 'player:death' },
    channel: 'spectacle',
    payload: {
      from: 'Nowhere in particular',
      text: 'Your hull comes apart the way every hull you have watched come apart does — and then the world does one thing for you: everything goes quiet except a single bell, tolling once, from the direction of the nearest station, not from you. The last frame holds a half-beat longer than it should. Your death gets the same grammar as the wrecks you have watched. Somebody was keeping time.',
    },
    followup: 'bespoke leg: on the player:death path, duck all audio except one bell toll spatialized to the nearest station (not the victim) and hold the final frame a half-beat; closure, never a penalty read.',
  },

  // SP1-147 — The Bloom Tide: the Veil's scheduled light-front; the cache hour.
  {
    id: 'SP1-147',
    kind: 'visual-setpiece',
    title: 'The Bloom Tide',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.12 },
    channel: 'spectacle',
    payload: {
      from: 'Veil watch',
      text: 'The tide the almanac promised: a light-front rolls across the Veil at walking pace and everything it passes flares in sequence — hulls, rocks, wrecks, you — traffic lighting up like a coastline at night. Work stops for the length of it; nobody pretends otherwise. Somewhere in the shine one rock\'s surface phosphors wake for the only hour they will be visible all season. The band announced the front to the minute. The band is never wrong about the tide.',
    },
    followup: 'bespoke leg: scheduled story-prop light curtain keyed to the bloom tide calendar read plus one cache whose surface phosphors are visible only inside the window; no edits to dirty lookMoods/vfx files.',
  },

  // SP3-086 — Shift Change Cascade: every station visibly changing hands.
  {
    id: 'SP3-086',
    kind: 'visual-setpiece',
    title: 'Shift Change Cascade',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 5, windowS: [200, 245] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Station spine',
      text: 'The watch turns and the building shows its work: window rows go dark floor by floor, bottom to top, then relight in the new watch\'s warmer gain — a station visibly changing hands. Docked, you hear the PA mumble the handoff; outside, the lights do all the talking. Every berth keeps its own offset, so the cascade never comes when you expect it. That is how a station teaches you its clock.',
    },
  },

  // SP3-023 — Lightning Web: the Anvil band's learnable strike rhythm.
  {
    id: 'SP3-023',
    kind: 'visual-setpiece',
    title: 'Lightning Web',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'Anvil band',
      text: 'The storm band is working: discharge forks walk the cloud deck every eight to twenty seconds, each strike a white flash that throws real light across every hull skimming the band and leaves a slow-fading patch on the clouds. The rhythm is honest if you count — triplets, and the third strike always lands on the richest row. Regulars hold outside the band on the one count and skim in on the two. The clouds cannot lie about the timing. You can.',
    },
  },

  // SP3-030 — Ember Trail: a Plunge breakup writes its own trajectory.
  {
    id: 'SP3-030',
    kind: 'visual-setpiece',
    title: 'Ember Trail',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'planet:plungeStage' },
    channel: 'spectacle',
    payload: {
      from: 'Reentry band',
      text: 'A Plunge goes to pieces in the band and the largest pieces do not stop: they carry on along the tangent as glowing embers, drawing a slowly cooling dotted line across the storm for two minutes. The crash writes its own trajectory, and the line ends at the salvage. No beacon, no marker buoy — just physics, legible. Follow the dots.',
    },
    followup: 'bespoke leg: extend the ember lifetime by death tier (DEATH_MASS_TIER_THRESHOLDS) on the plunge-breakup/entity:killed handoff so the embers are the wreck marker for the salvage leg.',
  },

  // SP3-104 — Festival Bunting: a calendar you can see from the lane.
  {
    id: 'SP3-104',
    kind: 'visual-setpiece',
    title: 'Festival Bunting',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 0, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Festival watch',
      text: 'Festival day, and the lamp strings come out — cheap colored bulbs run spine to spine by whoever has a free hour, each festival in its own scheme: Founders\' Day all white, Ring Fair a brawl of trading-house colors, the Quiet Night nothing at all, which is its own message. From a mile out the bunting carries the whole silhouette. Dock fees are what they are; the lights are free. A calendar you can see from the lane.',
    },
  },

  // SP1-197 — The Chalk: the starter lane remembers you in its own handwriting.
  {
    id: 'SP1-197',
    kind: 'visual-setpiece',
    title: 'The Chalk',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'proximity', nearStation: 'station_helios', wu: 2400 },
    channel: 'spectacle',
    payload: {
      from: 'Starter lane',
      text: 'Your regular lane has grown chalk. A tally on the third rock — your passes, in somebody\'s handwriting, increasing. A correction arrow where you went wide last month. And on the worst corner, a small, professionally painted sign that says only: AGAIN? Nobody signs the chalk and everybody adds to it; the marks are real hazards, honest as survey data. The lane has been counting.',
    },
    followup: 'bespoke leg: one authored starter-lane prop set with flag-gated pass tallies (no route-usage ledger exists); hazard arrows read from the player\'s actual collision/drift records.',
  },

  // SP3-092 — The Drill Choir: six seam drills play the line awake.
  {
    id: 'SP3-092',
    kind: 'visual-setpiece',
    title: 'The Drill Choir',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'calendar', dayOfYear: 14, windowS: [400, 445] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Drill line',
      text: 'Mining watch at the Hyperion drill line, and the six seam drills come alive in sequence — each starter a light beat down the row and one bass note a rising fifth apart, so the line plays itself a chord as it wakes. By the sixth drill the chord fills the cut. When the watch ends they fall silent in reverse order, the chord collapsing the way it rose. The most musical machine in the belt, and it thinks it is just starting work.',
    },
  },

  // SP2-106 — The Choir's Silent Shift: one pulse, every machine stops.
  {
    id: 'SP2-106',
    kind: 'visual-setpiece',
    title: "The Choir's Silent Shift",
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'calendar', dayOfYear: 24, windowS: [300, 360] },
    channel: 'spectacle',
    payload: {
      from: 'Bell field',
      text: 'For exactly one pulse, every machine in the sector stops — bells, foundries, tugs, the drills — a held breath across the whole field, long enough to hear your own air. Then everything resumes mid-note, as if the pause had been scored. The Choir calls it the Silent Shift. Nobody else calls it anything; most pilots work years and never see one. That is the point of it.',
    },
    followup: 'bespoke leg: calendar-window pause cue keyed to the Choir bell pulse + maintenance bell coincidence; write flag silent_shift_seen and a codex page, "The Silent Shift".',
  },

  // SP3-098 — The Governor: the flywheel's season failure, full arc, no casualties.
  {
    id: 'SP3-098',
    kind: 'visual-setpiece',
    title: 'The Governor',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'spectacle',
    payload: {
      from: 'Belt Outpost',
      text: 'The depot flywheel runs away with itself — once a season, on a schedule nobody admits to — and the governor screams over speed, sheds its safety ring in a strobing tumble, and spends a full minute visibly slowing while the yard\'s alarms paint it red. A skiff scurries after the ring before it stops wobbling. Then the ring goes back on, the wheel settles, and the season continues. A machine failure with a beginning, a middle, and no casualties. Watch the skiff; that is the best pilot on the yard.',
    },
  },

  // SP1-011 — The Muster: a pirate fleet doing PT around a dead carrier.
  {
    id: 'SP1-011',
    kind: 'visual-setpiece',
    title: 'The Muster',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'spectacle',
    payload: {
      from: 'Ashfall dark',
      text: 'Off the lane, around a dead carrier hull, a swarm is doing PT: wasps in silent formation grids, reliefs cycling through a breach every thirty seconds, nobody hailing anybody. A pirate fleet drilling. They are busy, and they are good — the formations are tight enough to time a clock by — and every pilot who finds them does the same thing: cuts throttle, watches, and eases back out the way they came. Scanning the carrier reads out how Reach packs actually work. Mostly it is logistics.',
    },
    followup: 'bespoke leg: ambient no-combat encounter spawning the drill grid at the fixed rock — cap at 12-16 drones in a bounded window (forty live hulls breaks the ambient spawn budget); scan payoff is a codex page on Reach pack logistics.',
  },

  // SP3-057 — The Lightning Catcher: the mast that earns its grounding.
  {
    id: 'SP3-057',
    kind: 'visual-setpiece',
    title: 'The Lightning Catcher',
    sectors: ['sector_vesta_forge', 'sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.25 },
    channel: 'spectacle',
    payload: {
      from: 'Forge mast',
      text: 'Ion surge, and the comm mast earns its grounding: a crawling glow gathers at the tip, then the strike — and the bolt\'s light visibly lands on the mast\'s neighbors and every hull parked on the apron, throwing sharp transient shadows from a source nobody controls. One bolt every forty-five seconds or so, forecastable as a bus. From a safe distance it is the best show in the sector. The apron lights double for the duration; the mast keeps the receipts.',
    },
  },

  // SP3-102 — Market Day Rush: the economy made visible from outside.
  {
    id: 'SP3-102',
    kind: 'visual-setpiece',
    title: 'Market Day Rush',
    sectors: ['sector_helios_prime', 'sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'spectacle',
    payload: {
      from: 'Exchange apron',
      text: 'Market day, and the station breathes faster: shuttle swarms queue on the approach in lamp-trails, container racks shuffle themselves around the apron on their crawlers, the window rows step up a gain. From the lane it reads as one organism with somewhere to be. The rush runs in two ninety-second windows after each shift bell, same as the toll queues. The economy, made visible. You can set your approach by it.',
    },
  },

  // SP2-196 — The Yard Family Reunion: the part you carry was welded by family.
  {
    id: 'SP2-196',
    kind: 'visual-setpiece',
    title: 'The Yard Family Reunion',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'proximity', nearStation: 'station_ashcache', wu: 1400 },
    channel: 'spectacle',
    payload: {
      from: 'The anchorage',
      text: 'The part in your hold was welded by someone\'s mother, and the anchorage knows it the second your provenance stamp crosses the cull channel: work lights on every hull, the whole yard turned out, and the crowd rating your approach — the Cull meter, repurposed, as applause. Somebody sings COUNT \'EM once, at you, in the good way. Park like you are expected. You are.',
    },
    followup: 'bespoke leg: provenance-stamp check on the player\'s hull part/cargo at the anchorage; cull-meter crowd cue + work-light turnout; write flag yard_reunion, Pitborn standing +8, and give the part\'s stamp a signature.',
  },

  // SP3-137 — The Belt Heartbeat: the Bolus keeps time, eight seconds at a beat.
  {
    id: 'SP3-137',
    kind: 'visual-setpiece',
    title: 'The Belt Heartbeat',
    sectors: ['sector_the_bolus'],
    trigger: { type: 'proximity', nearStation: 'station_bolus_rib', wu: 900 },
    channel: 'spectacle',
    payload: {
      from: 'Inside',
      text: 'Inside 900 WU of the throat you stop hearing the pulse and start feeling it: a sub-bass beat every eight seconds, older than the chart that named it. Match your thrust to it — long burn on the swell, coast on the sink — and the approach runs measurably smoother; the biology settles for things that move like it does. Fight the rhythm and the mouth eventually notices. Pilots who have been in say you learn to breathe on the eight-count without deciding to.',
    },
    followup: 'bespoke leg: audio pulse only — one low oscillator gated on simTime mod 8 inside the proximity radius; no HUD band-edge breathing (honed out); codex bio-rhythm page.',
  },

  // SP3-068 — The Shed Panel: a dead ship becoming more dead, on schedule.
  {
    id: 'SP3-068',
    kind: 'visual-setpiece',
    title: 'The Shed Panel',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'spectacle',
    payload: {
      from: 'Graveyard watch',
      text: 'A wreck in the cruiser graveyard quietly lets go of a hull panel — a groan you feel more than hear if you are close, then the panel tumbling free in full sun, its lacquer catching slow flashes as it drifts off the site. Nothing explodes. Nothing is looted. It is just a dead ship becoming more dead, on its own schedule, and for twenty seconds the whole graveyard holds still to watch it.',
    },
  },

  // SP3-045 — Dust Shear: a solar-wind front you can watch coming.
  {
    id: 'SP3-045',
    kind: 'visual-setpiece',
    title: 'Dust Shear',
    sectors: ['sector_ceres_belt', 'sector_rhea_cinder'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'spectacle',
    payload: {
      from: 'Field eye',
      text: 'The wind front arrives on time and you can watch it come: a glowing wall of dust rolling through the rock field, and the rocks lean and shiver as it passes — asteroids moving like wheat in wind, visible seconds before it reaches you. Loose ore scatters ahead of the wave. Anything the front exposes on the far side stays rich for the picking. Stand sunward, hold, and let the field rake itself.',
    },
  },

  // SP3-050 — The Wash: ten seconds when the lane is a river of iron.
  {
    id: 'SP3-050',
    kind: 'visual-setpiece',
    title: 'The Wash',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'spectacle',
    payload: {
      from: 'Lane control',
      text: 'Eight seconds of warning stinger, then the wash: a wall of tumbling wreck-fragments sweeps across the trade lane at hull height, backlit by the key, and for ten seconds the lane is a river of iron. Hold, dodge, or ride the edge — all three have partisans. The debris hits; the wash is not a light show, it is weather with mass. The racing circuits pay good money for a course like this. Here it is free, twice a calm, on a bearing the control desk reads out if you ask nicely.',
    },
  },

  // SP2-183 — The False Gate Sparks: the gate that never spun, spins. Once.
  {
    id: 'SP2-183',
    kind: 'visual-setpiece',
    title: 'The False Gate Sparks',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'hashDaily', chance: 0.06 },
    channel: 'spectacle',
    payload: {
      from: 'The march',
      text: 'The surge that night grounds through the False Gate — the memorial ring welded shut before it ever spun — and the gate turns. Once. A full slow rotation under its own borrowed lightning, every pilot on the march watching, and it stops facing the door it was welded shut against. The fuel pellets on the rim ignite together, one held note, and go out together. Afterward the plaque carries a second line, dated: IT TURNED. WE SAW. The gate never moves again.',
    },
    followup: 'bespoke leg: seasonal surge-window predicate grounds through the ring; single-rotation cue + rim pellet ignition; write flag false_gate_turned, add the plaque line with the date, and open the codex page "Once".',
  },

  // SP1-193 — The Portrait Buoys: saints' cards up the whole approach.
  {
    id: 'SP1-193',
    kind: 'visual-setpiece',
    title: 'The Portrait Buoys',
    sectors: ['sector_helios_prime', 'sector_vesta_forge', 'sector_tethys_junction', 'sector_charon_expanse', 'sector_io_reach', 'sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Beacon shroud',
      text: 'Somebody is painting hull portraits on the beacon shrouds up the whole approach — working pilots, dead pilots, the lot, hung along the lanes like saints\' cards. The style is good and the likenesses are kind, which is how you can tell the painter flies too. The newest shroud on its frame is half-finished, and it is your hull, and the paint is still wet. Nobody signs them. The painter is findable, and takes payment only in stories worth the canvas.',
    },
    followup: 'bespoke leg: persistent buoy props with authored painted-shroud textures (no illustratedSurface edit while dirty); fame order read from deedRecord; the painter is a commission contact who prices work in stories.',
  },

  // SP3-007 — Shadow Transit: lights-on minute the calendar pays for.
  {
    id: 'SP3-007',
    kind: 'visual-setpiece',
    title: 'Shadow Transit',
    sectors: ['sector_ceres_belt', 'sector_pallas_drift'],
    trigger: { type: 'calendar', dayOfYear: 19, windowS: [320, 360] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Belt watch',
      text: 'The minute arrives and the belt\'s lights come on by themselves: the giant\'s shadow crosses the rock field on schedule, stones winking out to silhouette in sequence until the field reads as a line of lamps instead of rock. Mine inside the transit line and your beam is briefly the brightest thing for a mile — a working light show the calendar pays for. The transit is pure geometry, fixed to the minute. Old miners call it lights-on and plan their blasts around it.',
    },
    followup: 'bespoke leg: sector-wide key/ambient gain envelope keyed to the transit minute through the mood-overlay seam; the spatially-walking terminator is renderer work for the graphics batch.',
  },

  // SP3-009 — The Gap Light: the slot canyon the sun opens twice a season.
  {
    id: 'SP3-009',
    kind: 'visual-setpiece',
    title: 'The Gap Light',
    sectors: ['sector_pallas_drift', 'sector_kepler_scar'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Reef mouth',
      text: 'Twice a season the sun lines up with the reef mouth, and the sixty-WU gap between the clusters becomes a slot canyon: hard key light raking down one wall while the rest of the field sits in shadow, and your own paint ignites for the six seconds of the transit. In vacuum there is no beam — only the pool on the rocks and you inside it. Racing takes the gap flat out. Everyone else slows down, and nobody blames them.',
    },
    followup: 'bespoke leg: zone-occupancy rig boost per frame through tuneLook while inside the authored gap with the key bearing inside the arc; the arc window is posted on the wire once per season.',
  },

  // SP3-067 — The Sluice Pulse: the kill machines drink on the shift bell.
  {
    id: 'SP3-067',
    kind: 'visual-setpiece',
    title: 'The Sluice Pulse',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 22, windowS: [200, 245] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Cinder Sluice',
      text: 'Shift change at the Cinder Sluice and the kill machines drink: the gates open in sequence and a river of gravel pours down the channel, each gate\'s opening throwing a light beat along the line. The pulse runs about forty seconds. Stand in the channel while it runs and it is a slow avalanche you can outrun, once. The machines are fed on the shift bell like everything else in the belt. The belt agrees about time even when it disagrees about everything else.',
    },
  },

  // SP3-018 — The Long Twilight: the day legible as a day, everywhere.
  {
    id: 'SP3-018',
    kind: 'visual-setpiece',
    title: 'The Long Twilight',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 1, windowS: [400, 560] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Night watch',
      text: 'Third watch, and the whole sector eases down: key light warming and dimming a third, ambient dropping, until headlights and window lamps carry more of the frame than the sky does — the long twilight, everywhere at once, that lifts again at first watch. Nobody added a single light. The day just leans that way, every day, on the same clock. Fly one full night watch and you will never be lost again: the light is a clock face, and it is honest.',
    },
  },

  // SP3-021 — Aurora Crown: the aurora is a light source, not paint.
  {
    id: 'SP3-021',
    kind: 'visual-setpiece',
    title: 'Aurora Crown',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'spectacle',
    payload: {
      from: 'Anvil watch',
      text: 'Storm season on the Anvil opens its best trick first: a ring of green-violet curtain fire ignites around the planet\'s limb and walks slowly around the disc, and the light is real — hulls inside the influence edge wear the aurora\'s color on their sunward side, then lose it as the curtain walks past. It dies with the surge, on the forecast\'s schedule. The forecast already told you it was coming. Knowing does not make it smaller.',
    },
    followup: 'bespoke leg: sustained light slot in the event-light pool (vfxColorLightDirector is DIRTY — file the request, do not edit) plus a planet emissive band keyed to the ion_storm season in seasonalWeather.',
  },

  // SP3-022 — The Anvil Breathes Water: two geysers an hour, same longitude.
  {
    id: 'SP3-022',
    kind: 'visual-setpiece',
    title: 'The Anvil Breathes Water',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.5 },
    channel: 'spectacle',
    payload: {
      from: 'Ocean band',
      text: 'The Anvil breathes: a white column of vapor punches off the ocean band, hangs one absurd second, and falls back as a slow fountain of beads that catch the key light like struck match-heads. The column\'s shadow walks the cloud deck beneath it. Fly through the falling spray and your hull glitters and your heat read drops a few honest points — the only air conditioning on this side of the lane. Two an hour, same longitude as the last. The planet keeps its appointments.',
    },
  },

  // SP2-063 — The Karaoke Bell: the Foundry rail sings the change.
  {
    id: 'SP2-063',
    kind: 'visual-setpiece',
    title: 'The Karaoke Bell',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'spectacle',
    payload: {
      from: 'Foundry bar',
      text: 'Dock at the exact shift bell with the bar full and you get the whole performance: the Foundry rail sings the change — the Pitborn COUNT \'EM cadence, adopted by DMC crews who will not tell you where they learned it — and the shift bell harmonizes on top. One engineer harmonizes better than the bell, and everyone resents him for it, forever, warmly. The bell is supposed to be the pitch pipe. The bell is not the pitch pipe.',
    },
    followup: 'bespoke leg: bar audio row keyed to barPressureAt + the exact shift bell at station_forge; write flag heard_the_count_sung and Pitborn rep +1 (they heard about it and are delighted).',
  },

  // SP3-049 — Hail of Ore: the minute after the storm is the best payday.
  {
    id: 'SP3-049',
    kind: 'visual-setpiece',
    title: 'Hail of Ore',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.14 },
    channel: 'spectacle',
    payload: {
      from: 'Field edge',
      text: 'The shower ends and the field pays out: loose ore shaken free of the rocks catches the returning key light as a slow golden snowfall, a full minute of it, settling onto everything. Scoop during the fall and it is free — no drill, no claim, no argument. The regulars sit at the field edge with scoops warm, waiting out the last of the iron, because everyone knows the minute after the storm is the best payday in the belt. It is not mining. It is catching.',
    },
    followup: 'bespoke leg: free-scoop emission window on the mining:yield path for the fall\'s duration; the light is just the returning key.',
  },

  // SP2-084 — The Bedtime Bell: the bar closes in reverse order of arrival.
  {
    id: 'SP2-084',
    kind: 'visual-setpiece',
    title: 'The Bedtime Bell',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'spectacle',
    payload: {
      from: 'Helios bar',
      text: 'The late bell, and the bar\'s lights drop to ember level, and the regulars file out in strict reverse order of arrival — nobody agreed to this, everyone obeys it, and you will too. The last one out holds the door. The barkeep locks nothing: "The bell locks it. The bell has never once been wrong about the day being over."',
    },
    followup: 'bespoke leg: bar lighting/dressing keyed to the last shift of the station-day at station_helios; write flag bedtime_bell and a one-line codex page (Helios: "the bar closes in reverse order of arrival").',
  },

  // SP3-122 — The Magazine: dread instead of noise.
  {
    id: 'SP3-122',
    kind: 'visual-setpiece',
    title: 'The Magazine',
    sectors: [],
    trigger: { type: 'receipt', event: 'entity:killed' },
    channel: 'spectacle',
    payload: {
      from: 'Aftermath',
      text: 'No blast — not yet. Ten seconds of interior flashes through the wreck\'s window rows, cook-off lighting the ship from inside, room by room, like someone walking the deck with a lamp they keep dropping. Then the magazine goes, and the hull opens along its seams in one slow bloom, and the light arrives all at once instead of in pieces. Every combat pilot learns to read those ten seconds from a distance. It is the longest ten seconds in the sector.',
    },
    followup: 'bespoke leg: munitions-flagged hulls only; window-row emissive cook-off sequence via the lamp bus, then one delayed emitExplosionPhase rupture opening the seams.',
  },

  // SP3-123 — The Cooling Cinder: a visible clock running on the wreckage.
  {
    id: 'SP3-123',
    kind: 'visual-setpiece',
    title: 'The Cooling Cinder',
    sectors: [],
    trigger: { type: 'receipt', event: 'entity:killed' },
    channel: 'spectacle',
    payload: {
      from: 'Debris field',
      text: 'The big fragment comes out of the kill glowing reactor-blue, and then it cools in public: blue to white to yellow to the deep dull red of things that will never be hot again, three minutes top to bottom, a visible clock running on the wreckage. Its light lands dimly on the debris around it, so the whole field breathes with the one color. Salvagers read the cinder from across the zone and time their approach on it. Everything in space tells you how old it is, if it is still hot enough to say.',
    },
    followup: 'bespoke leg: capital-tier fragment only (DEATH_MASS_TIER_THRESHOLDS); emissive ramp through the black-body colors keyed to simTime since death, persisted on the wreck record.',
  },

  // SP3-130 — The Scuttle: a death with manners.
  {
    id: 'SP3-130',
    kind: 'visual-setpiece',
    title: 'The Scuttle',
    sectors: [],
    trigger: { type: 'receipt', event: 'entity:killed' },
    channel: 'spectacle',
    payload: {
      from: 'The lane',
      text: 'The captain loses the ship and keeps the manners: one engine flare to center the hulk, then every lamp dies in order, bow to stern, while the band carries one clipped sentence — thanks for the fight, mind the charge — and then the spine opens. No debris scream, no tumble. A death with manners, witnessed more than once and never the same twice. Duelists take their hats off for this one. Everyone else just gets quiet on the channel for a bit.',
    },
    followup: 'bespoke leg: disabled-captained hulls only (seeded crew choice); lamp-bus extinguish order bow-to-stern, one comms line, then the scuttle charge opens the spine; codex entry.',
  },

  // SP3-116 — Laundry Day: the largest machine and the smallest chore.
  {
    id: 'SP3-116',
    kind: 'visual-setpiece',
    title: 'Laundry Day',
    sectors: ['sector_tethys_junction', 'sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'spectacle',
    payload: {
      from: 'Station sunward side',
      text: 'The station vents steam in fat white puffs, and on the sunward side a line of suited figures drifts on tethers, shaking out laundry sheets that fill and flash silver like little sails. Four minutes, once a week, per station. It is the least dramatic thing in the sector and somehow the thing you remember — one frame holds the biggest machine you have ever docked at and its smallest chore. Nobody questions the station\'s laundry. It has been hanging there longer than most careers.',
    },
  },

  // SP3-139 — The Tether Note: the pilot's tuning fork.
  {
    id: 'SP3-139',
    kind: 'visual-setpiece',
    title: 'The Tether Note',
    sectors: [],
    trigger: { type: 'receipt', event: 'massline:rideStarted' },
    channel: 'spectacle',
    payload: {
      from: 'Your own line',
      text: 'Hold the line taut on the right bearing — sun dead astern of the pull — and it starts to sing: one clean harmonic that rises with tension, the cable showing a faint standing-wave shimmer like a plucked string filmed in slow motion. Cut it at the peak and the note resolves down a fifth, once, and is gone. It does nothing. It carries nothing. It is the pilot\'s tuning fork, and the pilots who know it do not tell the ones who do not.',
    },
    followup: 'bespoke leg: one oscillator keyed to massline tension telemetry; the full note requires the 95%-alignment-with-key-bearing predicate held 3 s; standing-wave shimmer on the cable surface; codex page, "the pilot\'s tuning fork".',
  },

  // SP3-041 — The Curtain Rises: the storm that gives you a curtain call.
  {
    id: 'SP3-041',
    kind: 'visual-setpiece',
    title: 'The Curtain Rises',
    sectors: ['sector_vesta_forge', 'sector_io_reach', 'sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.15 },
    channel: 'spectacle',
    payload: {
      from: 'Weather eye',
      text: 'The forecast says the front is thirty seconds out, and you can see the forecast: a slow wall of violet curtain light leaning across the sector from the named bearing, flickers running down its leading edge onto every hull it passes. Thirty seconds, exactly as promised, to outfly it, face it, or dock. The curtain is the weather made visible before it arrives — the only storm in the lanes that gives you a curtain call. Pilots who run weather for a living time their last burns to watch it come.',
    },
  },
];
