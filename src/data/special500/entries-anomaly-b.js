// src/data/special500/entries-anomaly-b.js — batch cat-anomaly-b (30 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-anomaly-b.json). Real physics
// behaving strangely, forecastable by an attentive pilot. Channel choice per
// the anomaly register: a visual/audio moment you witness -> spectacle; a core
// that is genuinely interactive (persisted counters, scan puzzles, mass
// ledgers, dialog verdicts) -> memory + one-line followup naming the bespoke
// mechanic; a line heard on the band -> comms/commsLog; a wire teaching ->
// news. Never mail.
//
// Trigger/anchor notes:
// - No sector remaps: every consensus sector id is real (src/data/sectors.js,
//   src/data/frontierRegions/*.js).
// - Proximity anchors resolve only where a marker entity carries
//   data.poiId (src/systems/world.js poi spawn). runtimeOwner-delegated POIs
//   (poi_tethys_split_station, poi_io_listening_field, poi_charon_hull_garden,
//   poi_charon_star_marker, poi_charon_broken_shepherd) spawn no marker
//   entity, so those entries use receipt/sectorEntry triggers with the
//   poi-specific condition named in the followup. Safe anchors used:
//   poi_charon_lung_marker, poi_io_cathedral_vigil.
// - Receipt events verified against src/systems emitters: scan:completed,
//   combat:kill, poi:discovered, npc:hailed, dock:docked.
// - All consensus hones applied inline (SP3-163 tiny-volume, SP2-175 honed
//   payoff, SP3-055 ionized traces not a held bolt, SP1-094 bounded 5-line
//   buffer, SP3-061 functional edge taught by the wire, SP3-013 data+glue,
//   SP3-053 motes only — nothing settles or sheds in vacuum).

export const ENTRIES_ANOMALY_B = [
  // SP3-004 — The Zodiacal Shelf: a tilted wedge of dust-light over the belt's
  // deep field, visible in the season's calm phase, drifting one sky-quadrant
  // per season. The calendar day is the calm-phase tell; the quadrant step is
  // the sectorVisualProfiles data leg.
  {
    id: 'SP3-004',
    kind: 'anomaly',
    title: 'The Zodiacal Shelf',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'calendar', dayOfYear: 24, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Ceres Belt',
      text: 'Calm phase, and the deep field is showing its shelf again: a faint tilted wedge of dust-light leaning over the rocks, brightest where the key light rakes it, gone by the sector edge. It moves at background parallax only — untouchable, and obviously enormous. Old hands chart it anyway. One sky-quadrant per season, no exceptions; the drift is lawful, and proving it takes three seasons of looking up.',
    },
  },

  // SP2-161 — The Split Station's Third Half: scan both halves, then scan the
  // gap. The split station is runtimeOwner-delegated (no marker entity), so
  // the three-scan sequence rides the poi:discovered/scan seam via followup;
  // the receipt + sector scope is the catalog tell.
  {
    id: 'SP2-161',
    kind: 'anomaly',
    title: "The Split Station's Third Half",
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    payload: {
      text: 'Scan both known halves of the Split Station, then scan the gap between them, and the gap scans back as occupied: a third station section, mass-verified and invisible, holding the two halves together by mass alone. Its transponder reads the station\'s own name with one letter changed. It has been the load-bearing piece since the split. Nobody charts it. Charts do not record what holds things together.',
    },
    followup: 'three-scan sequence on poi_tethys_split_station via discoveryPresentation.js (halves, then the gap) keyed in story.flags; the invisible third section as scan copy + hidden mass reading; codex page "The Third Half"; Tethys standing +2; the Split Station market gains one unlisted commodity slot (stock: mystery, rotates)',
  },

  // SP2-163 — The Listening Field's Reply: after the sealed shelf (SP2-004),
  // a hail from inside the field radius gets the only unsealed thing the field
  // does — a direct reply. Chained on the SP2-004 fired flag; the
  // hail-from-within-radius check is the glue leg.
  {
    id: 'SP2-163',
    kind: 'anomaly',
    title: "The Listening Field's Reply",
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_listening_field', wu: 150 },
    after: ['SP2-004'],
    channel: 'comms',
    payload: {
      from: 'The Listening Field',
      text: 'Transmit from inside the field\'s radius and the field answers — to you, directly, the only unsealed thing it does: "RECEIVED. YOUR TRANSMISSION HAS BEEN FILED UNDER TODAY, CROSS-REFERENCED TO NOTHING. IN ELEVEN YEARS NO ONE HAS FILED FROM HERE. THE SHELF IS PLEASED. CONTINUE."',
      ttl: 8,
    },
  },

  // SP3-017 — The Ghost Limb: a rim-light arc describing a ship-shaped absence
  // on the Veil rim. Consensus proximity to a fixed-seed rim point maps to the
  // seeded daily roll (proximity anchors need a live entity; the rim point is
  // seeded data owned by the vfx leg).
  {
    id: 'SP3-017',
    kind: 'anomaly',
    title: 'The Ghost Limb',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.07 },
    channel: 'spectacle',
    payload: {
      from: 'Veil rim watch',
      text: 'Out on the rim, away from everything, a rim-light arc draws itself around empty space — the violet-on-black edge exactly as a hull would catch it, describing a ship-shaped absence, corvette-sized, holding for three seconds. Then gone. It never repeats from the same angle, which is how you know it is not a hull. The Archive pays a small bonus for a clean scan of one.',
    },
  },

  // SP2-168 — The Broken Shepherd's Flock: a kill near the shepherd and the
  // wreck-herding rigs gather the wreckage back into orbit around it.
  {
    id: 'SP2-168',
    kind: 'anomaly',
    title: "The Broken Shepherd's Flock",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    payload: {
      text: 'Break a hull inside six hundred WU of the Broken Shepherd and its wreck-herding rigs detach, piece by piece, and gather the fresh wreckage into a quiet orbit around it — the flock, re-flocked. Its one working PA loops, softer each cycle: "COUNTED. COUNTED. COUNTED." The count is correct.',
    },
    followup: 'kill-event proximity check (600 WU of poi_charon_broken_shepherd) + wreck-herding presentation on the uniqueWrecks seam orbiting the fresh wreckage; flag flock_reflocked; the wreckage stays collectible salvage for anyone (Understory first claim); codex page "Re-Flocked"',
  },

  // SP2-169 — The Lung's Breath: the lane marker inhales and exhales on its
  // pressure cycle, and the band answers. The cycle-timer hold and the
  // economy-linked pitch are the bespoke leg; this is the tell.
  {
    id: 'SP2-169',
    kind: 'anomaly',
    title: "The Lung's Breath",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_lung_marker', wu: 300 },
    channel: 'spectacle',
    payload: {
      from: 'Charon traffic',
      text: 'Hold station near the Lung through one full pressure cycle — the period is posted on the hunters\' writ wall — and you feel it inhale: dust, debris, one careless cargo lid. Then the exhale, a slow resonant tone rolling the whole lane, and everyone on the band pauses. One hunter transmits the traditional response, mandatory, tonal: "BREATHE EASY." The Lung breathes again. The tradition is older than the writ that ignores it. Listen close: the pitch moves with the air price. Nobody agrees on why. Everybody has a theory.',
    },
  },

  // SP3-026 — The Still Eye: an 80 WU calm pocket inside the Anvil storm band
  // where the storm flows around a hole. Zone record + exemption predicate are
  // the follow-up batch.
  {
    id: 'SP3-026',
    kind: 'anomaly',
    title: 'The Still Eye',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'Inside the Anvil\'s storm band there is one circle of nothing — eighty WU across, fixed-seeded, drifting one band-width per season — where the lightning stops, the drag vanishes, and loose debris hangs motionless, glittering. A calm pocket the storm flows around. Heat cools at the out-of-band rate inside. The pilots who track it call it the only honest repair berth in the sector, and they do not share the coordinates. They do share the season math.',
    },
    followup: 'sectorZones zone record (anomaly_deep type, no presence) whose position steps one band-width per season from a season hash; drag/heat exemption keyed by the same predicate as the planets.js storm bands; codex entry; tracking it across seasons is the pilot skill',
  },

  // SP3-163 — The Wrong Weather Patch: honed to a registered tiny weather
  // volume whose forecast line reads clear — weather as archaeology.
  {
    id: 'SP3-163',
    kind: 'anomaly',
    title: 'The Wrong Weather Patch',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Helios weather desk',
      text: 'One small patch off the tutorial lane is a storm that does not exist: a registered weather cell, forty WU of crawling static and curtain flickers, running every day in every season. The forecast line for that exact patch reads CLEAR. It has read clear every day since the charts began. The cell\'s footprint is exactly the size of a station that isn\'t there anymore. The weather remembers the station. The forecast does not.',
    },
  },

  // SP2-173 — The Slurry Relic's Contents: scan the relic while slurry is in
  // your recent sampling context and the composition line names the wrong grid.
  {
    id: 'SP2-173',
    kind: 'anomaly',
    title: "The Slurry Relic's Contents",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    payload: {
      text: 'Scan the Slurry Relic with slurry still fresh in your sampling log and the composition returns too specific: "SLURRY, REFINED, BATCH R3-CARRIER. CONTAINER: R3-CARRIER GRID, PANEL 9." Panel 9 of the grid shelved in Helios Bay 7 has been here, full, for fourteen years — the only panel that ever left the warehouse, and it left as a container, not cargo.',
    },
    followup: 'commodity-context scan branch (fires after sampling any slurry cargo) on the poi_charon_slurry scan copy; flag panel9_found; codex page "Panel Nine"; the wrong-grid reveal gains a physical middle chapter via the Bay 7 thread flags',
  },

  // SP1-091 — The Hum: the ancient wreck resonates at the whisper-pool's
  // interval. requiredPings encounter + the new whisper line are the
  // follow-up batch.
  {
    id: 'SP1-091',
    kind: 'anomaly',
    title: 'The Hum',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'One of the old wrecks in the deep is humming — a low, structural tone that means nothing until you hold a scan on it across three close passes, and then it resolves into the whisper-pool\'s cadence, exact. It is not broadcasting. It is resonating. At the interval of the voices, as if the whispers come FROM hulls like this one. All of them. Everywhere.',
    },
    followup: 'numbered anomaly encounter on a fixed seeded deep wreck with the requiredPings pattern (140-unique-wreck-deepsurvey-ping-elite.js precedent); one new whisper line readable only here added to WHISPER_LINES; codex entry reframing every prior whisper as fleet-wide',
  },

  // SP2-175 — The Quiet Mast's Silence Toll: honed payoff — no airtime
  // resource exists; the payoff is the edited-hail variant plus a band
  // priority greeting other pilots can hear.
  {
    id: 'SP2-175',
    kind: 'anomaly',
    title: "The Quiet Mast's Silence Toll",
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'npc:hailed' },
    channel: 'memory',
    payload: {
      text: 'Transmit three hails inside a minute near the Quiet Mast and the mast dampens your channel — not jamming, editing: your third hail plays back with every filler word removed. "TRANSMISSION: EDITED. CONTENT: PRESERVED. THE MAST PREFERS YOU." From then on your hails resolve on the first ping, and other pilots hear you ahead of their own traffic. The preference is permanent. Nobody has ever gotten the mast to explain it.',
    },
    followup: 'chatter-rate check (three hails within 60 s inside the poi_io_quiet_mast radius) gating the edited-hail playback variant; register payoff per hone: hails resolve on the first ping + a band-priority greeting other pilots notice (bark variant); flag mast_prefers_you; codex page "The Mast Prefers You"',
  },

  // SP3-031 — The Wrong Shadow: the Anvil's shadow runs backward for one watch
  // on the Pale Holiday. Once, not recurring; the one-watch rig overlay rides
  // the mood-overlay seam keyed by the pale_holiday festival row.
  {
    id: 'SP3-031',
    kind: 'anomaly',
    title: 'The Wrong Shadow',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'calendar', dayOfYear: 33, windowS: [400, 600] },
    channel: 'spectacle',
    payload: {
      from: 'Tethys Junction',
      text: 'Third watch of the Pale Holiday, and the Anvil\'s shadow is pointing the wrong way — stretched across the belt, backward, away from the sun, for exactly one watch. Hulls inside it keep their normal light. Only the dust goes dark, a black stain on nothing. Where the false shadow touches, the Void_signal\'s violet rim bleeds faintly onto the rocks. It is the one day a year the signals run strange on schedule. Set a clock by it. Somebody does.',
    },
  },

  // SP2-180 — The Ash Pin's Second Age: two pins, two sectors, one incident.
  // The same-week two-visit flag and the combined overlay are the follow-up.
  {
    id: 'SP2-180',
    kind: 'anomaly',
    title: "The Ash Pin's Second Age",
    sectors: ['sector_helios_prime', 'sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'memory',
    payload: {
      text: 'The ash pins are a pair — same stake design, same paint batch, same era — one burned down in Helios, one on the Pallas leg of Ceres, marking the same incident from two ends. Read both and the two partial texts complete each other, except the middle: the part neither pin carries is the part everyone remembers and no one wrote down.',
    },
    followup: 'two-visit flag (both poi_helios_ash_pin and poi_ceres_ash_pin discovered within one in-game week) + combined codex overlay "The Two Pins"; the missing middle line is the player\'s own campaign thread number; flag pins_paired',
  },

  // SP3-158 — The Beacon That Isn't: a standard-pattern nav light in open
  // space, moving one WU per season on a bearing out of the sector. Position
  // from a season-hash step function; the codex track draws from the same pure
  // function.
  {
    id: 'SP3-158',
    kind: 'anomaly',
    title: "The Beacon That Isn't",
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Ashfall Reach',
      text: 'There is a navigation light blinking in open space — exactly the standard pattern, catalog-clean, no hull attached, no wreck, no reason. And it is moving. One world-unit per season, along a bearing that, plotted visit over visit, aims out of the sector. Cartography has flagged it. Cartography has declined to follow it. The plotted track is the collectible; bring the plot to the Archive and they pay for the dots alone.',
    },
  },

  // SP3-055 — Rime Lightning: honed — no bolt freezes mid-fork; the statue is
  // the persistent ionized trace seen from a distance, and you can fly it.
  {
    id: 'SP3-055',
    kind: 'anomaly',
    title: 'Rime Lightning',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'hashDaily', chance: 0.2 },
    channel: 'spectacle',
    payload: {
      from: 'Pallas Drift',
      text: 'Cold surge, and a pale-blue arc walks between two rocks — then the fork hangs in the air after it. Not frozen: ionized. A glassy statue of the discharge, holding its shape while you fly your hull straight through the outline, and it crumbles around you into ice-dust. The traces stay on the rock for minutes afterward, faint and glassy, glowing where the fork touched. Photographers time their whole shift around cold surges here.',
    },
  },

  // SP1-094 — The Echo Bank: the lattice replays the sector's old traffic —
  // and, once per visit window, your own last hours. Honed to a bounded
  // 5-line comms ring buffer; no full history store exists.
  {
    id: 'SP1-094',
    kind: 'anomaly',
    title: 'The Echo Bank',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'A crystalline debris cluster in the deep that stores comm traffic in its lattice and replays it — years old, other hulls\' arguments, a station\'s entire last night shift, worn smooth by repetition. And then, once a visit, it plays your own voice. From hours ago. Saying something you had forgotten typing. The bank does not care that it is unsettling. It is a bank.',
    },
    followup: 'numbered anomaly encounter persisting the last 5 comms:popup payloads (bounded ring buffer in story.flags, per hone — no full history store); one replay of the player\'s own past line per visit window via comms:popup with lag; codex entry on who built a memory bank and why they needed receipts',
  },

  // SP1-171 — The Prism Read: the prism field splits your running lights into
  // a spectrum fan and the Vergers read it — honestly, because it is your
  // power budget, refracted.
  {
    id: 'SP1-171',
    kind: 'anomaly',
    title: 'The Prism Read',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'Fly the prism field with your running lights on and the field splits them into a long spectrum fan behind you — and the Vergers read the fan like a mood ring, hull by hull: "Exhausted. Well-fed. Recently paid. Afraid of checkpoints." They are right every time, because it is not a mood. It is your power budget, refracted. Change your fit and the reading changes, which is how the locals check each other\'s hulls without ever asking a question.',
    },
    followup: 'numbered ambient encounter reading real power/fit state via the ship-stats seam; spectrum-fan vfx through the light-behavior path; honest one-per-visit readings as barks derived from the player\'s actual systems',
  },

  // SP2-152 — The Nereid Coupling Riddle: the empty tanker coupling completes
  // its handshake with you out of loneliness. Dock-attempt dialog + the
  // remembers-the-shape payoff are the follow-up batch.
  {
    id: 'SP2-152',
    kind: 'anomaly',
    title: 'The Nereid Coupling Riddle',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    payload: {
      text: 'The mid-dock tanker coupling, empty for eleven years, completes its handshake with your hull out of sheer loneliness — a full freight-platform protocol exchange, all nine steps, ending in one honest line: "TANKER: NOT PRESENT. DECADE: ELEVEN. COUPLING: STILL OUT. ARE YOU THE TANKER? [AWAITING VERDICT]" Whatever you answer, it says "UNDERSTOOD. STILL OUT." and lets go, gently, like something setting down the only thing it has held in a decade.',
    },
    followup: 'dock-attempt interaction + dialog state on the empty mid-dock coupling; answer branch (any verdict accepted); codex page "Still Out"; Nereid standing +2; the handshake thereafter completes for the player in four steps instead of nine ("it remembers the shape")',
  },

  // SP3-042 — Static Crawl: violet discharge hunting for ground along hull
  // seams in the last ten seconds before an ion front. The hash-picked tell
  // stands in for the warning-phase clock; the attached status-matter pool is
  // the render leg.
  {
    id: 'SP3-042',
    kind: 'anomaly',
    title: 'Static Crawl',
    sectors: ['sector_vesta_forge', 'sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'spectacle',
    payload: {
      from: 'Vesta Forge weather watch',
      text: 'In the last ten seconds before an ion front, look at your own hull: violet discharge crawling the panel seams, pooling at the wingtips — electricity hunting for ground. The hulls around you show it too, dimmer. When the front hits, the crawl snaps off all at once, with a tick. It costs nothing, predicts everything, and the pilots who ignore it are the ones who get found by the surge with their shields still furled.',
    },
  },

  // SP1-154 — The Metal Garden: a magnetic spine wearing a kilometer of iron
  // like fruit. Magnetic forces + mass-balance persistence are the follow-up.
  {
    id: 'SP1-154',
    kind: 'anomaly',
    title: 'The Metal Garden',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'One spine rock in the radiation field holds a magnetism so strong that loose hull-plate, bolts and dead drones from a kilometer around hang off it in slow, still fringes — a garden of iron, sorted by mass, swaying when anything passes. Salvage hangs here like fruit. Taking it is possible. The spine takes it back, eventually, from everyone. The locals leave offerings, and the garden grows.',
    },
    followup: 'numbered anomaly encounter with magnetic attraction forces (bolusForces precedent); pulled salvage dragged back within a day unless the player leaves metal of their own (mass-balance persistence in story.flags — the garden keeps its mass); offerings visibly add to the fringe',
  },

  // SP2-165 — The Three Hull Garden's Fourth: leave a wreck in the garden's
  // tether radius and the garden prepares a planter sized for you. Persistence
  // + engraving state machine are the follow-up batch.
  {
    id: 'SP2-165',
    kind: 'anomaly',
    title: "The Three Hull Garden's Fourth",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    payload: {
      text: 'Leave any wrecked hull — yours or a kill\'s — inside the Three Hull Garden\'s tether radius for a day, and the garden grows a fourth: not grown from the dead, but a fourth planter, prepared, empty, waiting, sized exactly to your hull. Beside it, a plaque-in-progress is being engraved, slowly, letter by letter, across visits. It currently reads: "GARDENER: [ENGRAVING]."',
    },
    followup: 'wreck-within-tether-radius persistence (24+ in-game hours) on poi_charon_hull_garden + garden stage reuse for the fourth planter; flag garden_fourth_planted; weekly visits advance the engraving; a completed plaque = the garden stages up',
  },

  // SP2-170 — The Vigil Array's Request: the nightly sweep offers you the empty
  // night-watch slot. The vigil array is a marker-spawning beacon POI, so
  // proximity anchors resolve.
  {
    id: 'SP2-170',
    kind: 'anomaly',
    title: "The Vigil Array's Request",
    sectors: ['sector_io_reach'],
    trigger: { type: 'proximity', nearStation: 'poi_io_cathedral_vigil', wu: 500 },
    channel: 'memory',
    payload: {
      text: 'Let the Vigil Array\'s nightly sweep catch your hull and it hails with a request no chart lists: "VIGIL ROSTER: ONE (1) EMPTY SLOT, NIGHT WATCH. REQUIREMENTS: A HULL. A LIGHT. FOUR HOURS. REWARD: A NAME ON THE WALL." Accepting parks you in the array\'s watch pattern — four hours of sim, compressed by the duty cycle — and welds your callsign to the wall, with the vigil\'s dead. The wall is visitable forever. The night, thereafter, knows you.',
    },
    followup: 'worldCalendar night-window gate on the poi_io_cathedral_vigil proximity + watch interaction (four hours sim, duty-cycle compressed); flag vigil_named; wall dressing gains the player callsign permanently; Io standing +4; one-time +5% night-sensor efficiency ("the night knows you now")',
  },

  // SP3-061 — The Barometer Ghost: honed to functional — the refraction edge
  // IS the safe line, taught once by the wire.
  {
    id: 'SP3-061',
    kind: 'anomaly',
    title: 'The Barometer Ghost',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'news',
    payload: {
      text: 'WEATHER DESK, one item, not repeated: when the stars at a front\'s edge double and smear into a ring, that ring is the edge itself — the coming weather, drawn in refraction before the weather arrives. The ring is the safe line. Stay outside it. This desk has said its whole speech; the sky will do the rest.',
      kind: 'incidents',
    },
  },

  // SP2-040 — The Star Marker's Star: a sextant pointing at two empty patches;
  // the bearings intersect above nothing. Scan-per-phase + the intersection
  // POI are the follow-up batch.
  {
    id: 'SP2-040',
    kind: 'anomaly',
    title: "The Star Marker's Star",
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    payload: {
      text: 'Scan the Star Marker by one shift phase and it points at an empty patch of sky. Scan it by another and it points at a different empty patch. Cross-reference the two bearings and they intersect at one fixed point in the sector — above nothing, where nothing is charted. It is a sextant. It has been aimed this whole time.',
    },
    followup: 'scan copy per shift phase (two worldCalendar phases) on poi_charon_star_marker; intersection POI spawned on flag star_marker_fixed revealing a single preserved cockpit beacon — a grave; codex page; Understory rep +3 if the player leaves it undisturbed (never scans it a third time)',
  },

  // SP3-013 — Sparkle Front: honed to data+glue — a gas-volume row plus one
  // call-site read; the sky grain is an existing layer brightening against the
  // sun.
  {
    id: 'SP3-013',
    kind: 'anomaly',
    title: 'Sparkle Front',
    sectors: ['sector_vesta_forge', 'sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'spectacle',
    payload: {
      from: 'Vesta Forge',
      text: 'Solar-wind surge, and the dust between you and the key light ignites into a drifting field of microscopic glints — the whole sky acquires grain, and every hull silhouette gains a faint halo. Nothing new is drawn; an existing gas layer is just brightening against the sun. The forecast already names the season. The pilots who read it come out early to watch the air show off.',
    },
  },

  // SP3-178 — The Vanishing Field: the rock field is N smaller every visit and
  // the missing rocks stand in a numbered row somewhere else. The seeded
  // per-visit ledger is the follow-up batch.
  {
    id: 'SP3-178',
    kind: 'anomaly',
    title: 'The Vanishing Field',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'The rock field is measurably smaller every time you count it — and somewhere else in the sector, the missing rocks are found arranged in a neat row, numbered in survey paint, facing away from everything. The count is exact. The arrangement is exact. The reason is absent. Whatever is auditing this sector keeps its working notes in better order than any living surveyor.',
    },
    followup: 'seeded per-visit count ledger (the discovery-bag pattern: state.world.discovery[sectorId]) shrinking the field each visit; the missing rocks placed in the numbered row from the same seed stream; codex entry "a mystery with an audit trail"',
  },

  // SP1-027 — The Registry That Forgot to Die: a pre-charter Concord relay
  // still files every passing hull, kindly. The relay_stamp fine shield is the
  // follow-up batch.
  {
    id: 'SP1-027',
    kind: 'anomaly',
    title: 'The Registry That Forgot to Die',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'A Concord relay wreck from before the sector was charted still auto-files every ship that passes the starter lane — including yours — into a log nobody collects. The filings are oddly kind: "Vessel observed maintaining lane discipline. Noted with approval." Read the whole log — it goes back decades, mostly drift and dust and one very good dog — and the registry stamps you: clean transponder, one use, no expiry. The dead desk vouches for you. Nothing else in the sector can.',
    },
    followup: 'numbered ambient encounter on a starter-lane derelict relay; reading the full log writes state.story.flags[\'relay_stamp\'], consumed by patrol_scan fine logic in encounterScripts.js as a one-time fine shield; codex entry',
  },

  // SP2-023 — The Dead Star Chart: the survey wreck's chart table, tally
  // marks, one circled. The circled position becomes a real discoverable.
  {
    id: 'SP2-023',
    kind: 'anomaly',
    title: 'The Dead Star Chart',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    payload: {
      text: 'The drifting survey wreck\'s chart table still displays a star map — but every star has been replaced by a tally mark, hand-cut, and one tally is circled. The circled mark corresponds, position for position, to a real body in this sector that no chart row currently names. The surveyor died before filing it, or after, or because of it. The map does not say. The map is only a map.',
    },
    followup: 'first-scan overlay copy on the Sedna survey wreck + one new POI row placed at the circled offset (a dead precursor pin, Verge-Layer register) spawned on flag; codex page "The Surveyor\'s Last Map"',
  },

  // SP3-053 — First Snow: honed to gas-volume falling motes only — nothing
  // settles or sheds in vacuum; the seasonal identity stays, the physics
  // honesty stays.
  {
    id: 'SP3-053',
    kind: 'anomaly',
    title: 'First Snow',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'calendar', dayOfYear: 28, windowS: [0, 600] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Pallas Drift',
      text: 'The Pallas crews\' cold turn of the year comes round and the sector\'s dust acquires a slow, falling drift of bright motes — First Snow, the Pallas crews call it, and act like they are too tough to have named it. The rock fields read softer through it. The whole sector lowers its voice. Nothing settles on your hull — nothing settles in vacuum; the crews know it and say it anyway. For a while, the belt flies like it is holding its breath.',
    },
  },

  // SP3-141 — The Whisper Buoy: the Lung lane marker plays forty seconds of
  // year-old sector traffic, once per visit, never the same transcript twice.
  {
    id: 'SP3-141',
    kind: 'anomaly',
    title: 'The Whisper Buoy',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_lung_marker', wu: 120 },
    channel: 'spectacle',
    payload: {
      from: 'Lung Marker',
      text: 'Inside a hundred WU of the lane marker its speaker crackles and plays forty seconds of year-old traffic chatter — real voices, real idioms, the sector\'s own contact ledger played back degraded — then stops, mid-word. The wire has no comment. It does this once per visit and never the same transcript twice in a row. The lane remembers more than anyone on it.',
    },
  },
];
