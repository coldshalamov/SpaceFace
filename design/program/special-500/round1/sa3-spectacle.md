# Special-500 Round 1 — SUBAGENT 3: SPECTACLE lens (200 proposals)

One-off visuals, VFX set-pieces, light/sky/weather phenomena, machine rituals, station life seen
from space, death-of-a-ship spectacles, audio moments. Read-only round: this file is the only
artifact. All `Where` fields use real sector ids from `src/data/sectors.js` +
`src/data/frontierRegions/`; all seams are verified files. Determinism law respected throughout:
triggers are `state.simTime` calendar windows (`src/data/worldCalendar.js`,
`src/data/seasonalWeather.js`), proximity, first-entry discovery, or event-bus receipts — never
wall time. The fantasy is physics-as-spectacle: the best of these can be predicted from the wire,
positioned for, and chained. Dirty-file note: `src/render/vfx.js`, `src/render/vfxColorLightDirector.js`,
`src/data/lookMoods.js`, `src/render/illustratedSurface.js` are foreign-dirty this sitting — every
proposal below REQUESTS from their existing vocabulary; the build should prefer new data files plus
thin interpreters over editing them.

---

## A. Stellar & light phenomena

### SP3-001 — The Glint Hour
- Kind: visual-setpiece
- Where: sector_helios_prime (any sector with a fixed key-light bearing works; Helios is the teaching ground)
- Trigger: sim-time window — the 40-WU stretch of each 600 s day when the key light's azimuth crosses the sector's authored glint bearing (pure function of simTime; forecastable)
- The player sees/hears: every lacquered hull, pod and wreck in view flares its clear-coat sun glint within the same two seconds, a traveling sparkle wave crossing the field as the angle sweeps. Nothing is added to the scene — the existing coatSun response simply gets its moment, and the world reads as polished metal under a moving light.
- Payoff: visual wonder only; a fixed-seed minute the wire can post ("glint hour at Helios, third bell").
- Build seam: calendar hook in `src/data/worldCalendar.js` + a thin presentation cue; the glint itself is the existing coat response in `src/render/illustratedSurface.js` (DIRTY — request, don't edit).
- Effort: data+glue

### SP3-002 — The Umbra Minute
- Kind: visual-setpiece
- Where: sector_helios_prime (first shipping window); any sector by profile flag later
- Trigger: sim-time window — once per 40-day year at an authored minute (day 12, first watch), a background moon crosses the key-light line for ~45 s
- The player sees/hears: the sector's key light visibly dims to 30% and warms; the dark side takes over, station windows and nav lamps suddenly carry the frame (the "lonely lights" picture LOOK.md asks for). A chalk-white rim from the rim light keeps silhouettes. Then the light returns in one clean ramp.
- Payoff: visual wonder only; the calendar wire posts it one day ahead so players can position for it.
- Build seam: authored key/rig gain envelope in `src/data/lookMoods.js` mood-overlay pattern consumed by `resolveLookLighting` in `src/render/look.js` (lookMoods is DIRTY — author as a new data overlay file that look.js merges).
- Effort: data+glue

### SP3-003 — The Unannounced Flare
- Kind: anomaly
- Where: sector_ceres_belt
- Trigger: sim-time window — once per 7-day season at a hash-picked minute, for 6 s
- The player sees/hears: the sun briefly doubles — a hard secondary point of light beside the key that throws a second faint shadow and a white-hot spark line on every hull edge. Codex notes it as "solar parallax, unexplained." Veteran pilots swear it happens when the Borrowed Sun is folding.
- Payoff: plus codex entry (anomaly classification).
- Build seam: data row + a second rig key flash routed through the existing event-light pool via `presetFor('cue', ...)` in `src/render/vfxColorLightDirector.js` (DIRTY — request the `cue` row, author the colour at the call site as the director allows).
- Effort: data+glue

### SP3-004 — The Zodiacal Shelf
- Kind: anomaly
- Where: sector_ceres_belt
- Trigger: sim-time window — visible only during the season's calm phase, drifting one sky-quadrant per season (pure `weatherSeasonAt` read)
- The player sees/hears: a faint tilted wedge of dust-light leans over the belt's deep field, brightest where the key light rakes it, fading to nothing at the sector edge. It moves at background parallax only — untouchable, and obviously enormous.
- Payoff: plus codex entry after three seasons of observation (the player can confirm its drift is lawful).
- Build seam: `src/data/sectorVisualProfiles.js` background structure row (structureKind/regionLo/regionHi vocabulary exists) + one authored accent plate via the paintedSky/sky plate path.
- Effort: data

### SP3-005 — Comet Perihelion
- Kind: visual-setpiece
- Where: sector_helios_prime, then one gate-neighbor per season (ceres_belt, tethys_junction, vesta_forge)
- Trigger: sim-time window — every 40-day year, days 15–17; the spaceBackground comet's authored perihelion pass
- The player sees/hears: the L6 background comet (already in `src/render/spaceBackground.js`) drops from sky depth to near-plane parallax for one day, tail streaming anti-sunward, and visibly sheds three real debris stones into the sector on the middle day. Intercept a stone before it sublimates on day 17.
- Payoff: plus small bonus (one volatiles pickup per stone) and a codex entry if all three are caught.
- Build seam: `spaceBackground.js` cometInterval/composition knobs already exist in `src/data/sectorVisualProfiles.js`; the three stones use the finite-slot pattern of `src/systems/weatherMeteors.js`.
- Effort: data+glue

### SP3-006 — The Lantern Winks
- Kind: visual-setpiece
- Where: sector_ceres_belt, sector_tethys_junction, sector_vesta_forge (core plates)
- Trigger: sim-time window — Founders' Day (dayOfYear 0) only, at the shift turn minute
- The player sees/hears: the dominant lit mass of the sector's baked sky plate (`core-lantern-shelf`, `sky-helios-orbital-void` family) pulses once, slowly, like something behind the stars acknowledging the Charter reading. Once a year, easy to miss, impossible to unsee.
- Payoff: plus codex entry; photography moment.
- Build seam: a one-day `strength` overlay on the paintedSky/sky plate rows in `src/data/sectorVisualProfiles.js` (resolveBackgroundPaintedSky already takes strength).
- Effort: data

### SP3-007 — Shadow Transit
- Kind: visual-setpiece
- Where: sector_ceres_belt (over f_ceres_2 rock field), sector_pallas_drift (reef field)
- Trigger: sim-time window — the giant's shadow line crosses the named field once per 600 s day at a fixed minute (pure geometry from the signatureHero position)
- The player sees/hears: a hard terminator walks across the rock field at cruise speed; rocks wink out to silhouette in sequence and their rim lights take over, so the belt briefly reads as a line of lamps instead of stone. Mining inside the transit line pays a visible-lux bonus light show as your beam becomes the brightest thing on the rocks.
- Payoff: visual wonder only; rich-mining window is the teachable chain.
- Build seam: data row (field id + transit minute) + thin interpreter that scales the sector rig's ambient/key gains locally per frame via the `look.js` lerp path; no new renderer code.
- Effort: data+glue

### SP3-008 — The Double Dawn
- Kind: anomaly
- Where: sector_helios_prime
- Trigger: sim-time window — third watch of day 5 only
- The player sees/hears: for eleven minutes a second, cooler light source rises from the painted-estuary horizon's far side, splitting every shadow on the apron into two faint pencils that slowly cross. Dock crews on the wire claim it is the estuary plate misregistered. It always happens on day 5.
- Payoff: plus codex entry (anomaly).
- Build seam: authored second rig fill channel as a `lookMoods.js`-style overlay merged in `src/render/look.js` (lookMoods DIRTY — new overlay data file).
- Effort: data+glue

### SP3-009 — The Gap Light
- Kind: visual-setpiece
- Where: sector_pallas_drift (reef mouth), sector_kepler_scar (scar descent)
- Trigger: proximity — fly the authored 60 WU gap between two field clusters while the key light's bearing is inside the gap's authored arc (learnable, posted on the wire once per season)
- The player sees/hears: the gap acts as a slot canyon — hulls inside catch a hard rake of key light down one wall while the rest of the sector sits in shadow, and your own hull's paint ignites for the transit. It is real light landing on real surfaces; in vacuum there is no beam, only the pool on the rocks.
- Payoff: visual wonder only; a known racing shortcut gains a ceremonial read.
- Build seam: authored light-rig boost keyed by zone occupancy in `src/data/sectorZones.js` zone records consumed by the `resolveLookLighting` path — data-only on top of existing seams.
- Effort: data+glue

### SP3-010 — Ring-Plane Flash
- Kind: anomaly
- Where: sector_helios_prime (signature ringed giant), sector_ceres_belt background rings
- Trigger: proximity + angle — fly through the plane the background ring lies in while the ring is backlit (a computable bearing band; two windows per day)
- The player sees/hears: the ring collapses from a disc to a single hairline of white light across the sky, then blooms into a broad backlit glare band as you cross — dust acting like dust. Radar-friendly: the moment is purely optical, zero gameplay threat, pure physics reward.
- Payoff: plus codex entry (optics), photography moment.
- Build seam: presentation cue with camera-relevant flag consumed by the background compositor's existing ring rendering in `src/render/spaceBackground.js`; the trigger is pure math on player pos vs the profile's signatureHero frame in `src/data/sectorVisualProfiles.js`.
- Effort: bespoke

### SP3-011 — The Cold Glint
- Kind: anomaly
- Where: sector_sker_haven
- Trigger: fixed-seed bearing + watch window — one hash-picked compass bearing per sector seed, visible only during third watch
- The player sees/hears: a single distant point out in the dark flares once every 1.5 s — beacon rhythm, beacon color, but nothing is charted there and no hull is visible even at full scan gain. It never gets closer. Survey pilots use it as an informal compass.
- Payoff: plus codex entry; using it to navigate is its own reward.
- Build seam: data row (seeded bearing, `hash32(seed, sectorId)` idiom from `src/data/seasonalWeather.js`) + one pooled sprite from `vfx.spawnPresentationSprite` in `src/render/vfx.js` (DIRTY — call-site only).
- Effort: data+glue

### SP3-012 — The Mirror Train
- Kind: encounter
- Where: sector_tethys_junction (Anvil approach lane)
- Trigger: sim-time window — skim-corridor season + proximity 300 WU to the lane
- The player sees/hears: a convoy of mirror-barges flies a slow chain, each hull rotating in turn to walk one reflected sun-spot across the Anvil's cloud tops like a searchlight relay. Fly inside the chain and your hull becomes the last mirror — the spot lands on you and the convoy hails you as "the sixth barge."
- Payoff: plus codex entry and a comms line; photography moment.
- Build seam: laneContacts-style convoy rows (see the courier precedent in `src/data/worldOneOffs.js` comments) + doctrine tell lights via `vfxColorLightDirector` `tell` rows.
- Effort: data+glue

### SP3-013 — Sparkle Front
- Kind: anomaly
- Where: sector_vesta_forge, sector_io_reach (weather sectors)
- Trigger: sim-time window — solar_wind season, surge phase only
- The player sees/hears: the interplanetary dust between you and the key light ignites into a drifting field of microscopic glints — the whole sky acquires grain, and hull silhouettes gain a faint halo. Gas-volume vocabulary: nothing new is drawn, an existing gas layer just brightens against the sun.
- Payoff: visual wonder only; forecast teaches it (weatherForecast already names solar_wind).
- Build seam: gas-volume opacity/parallax row in the weather volume data in `src/data/environmentalMachinery.js` consumed by `vfx._gas` (DIRTY — request existing vocabulary).
- Effort: data

### SP3-014 — The Sun Dogs
- Kind: anomaly
- Where: sector_helios_prime
- Trigger: sim-time window — days 20–22 of every year, first watch
- The player sees/hears: two bright mock suns flank the key at exactly 22 degrees, each with a short tail of colored fire, for about a minute. They hold formation while everything moves — haulers fly "through" them. The bar keeps a bet running on which one goes out first.
- Payoff: plus codex entry; a barContacts line on day 20.
- Build seam: sky-plate accent pair (paintedSky strength pulse) in `src/data/sectorVisualProfiles.js` — no new renderer work.
- Effort: data

### SP3-015 — Occultation Bell
- Kind: visual-setpiece
- Where: sector_ceres_belt (station_ceres), sector_vesta_forge (station_forge)
- Trigger: sim-time window — the same Umbra Minute as SP3-002, seen from a station: the umbra crosses the station at a computable minute after sector entry
- The player sees/hears: the station's window rows go dark deck by deck as the shadow crosses — a wave of extinguished light you can watch approach for a full minute — then ignite again in the same order. Docked or nearby, the PA calls "umbra in sixty" and the bar goes quiet.
- Payoff: visual wonder only; pairs with SP3-002 into one chainable event.
- Build seam: lamp-bus floor/offset scheduling — the envelope vocabulary already exists in `src/data/lampChannels.js` (`breathe` floor + per-material phase via `lampPhaseForKey`); a data row schedules the window.
- Effort: data+glue

### SP3-016 — The Photographer's Second
- Kind: easter-egg
- Where: sector_helios_prime
- Trigger: proximity + sim-time — the player, the ringed giant's limb, the current comet (SP3-005 season) and the sector glint bearing all align inside a 4-second window, once per year
- The player sees/hears: for four seconds the frame composes itself — giant, ring-edge, comet tail and a sun-glint on your own hull in one shot. If the player captures the photo (photo mode flash) inside the window, the frame is kept.
- Payoff: photography moment + codex entry ("Alignment, day 16").
- Build seam: pure trigger math (player pos + profile frame + calendar) emitting the existing `moment.stinger` audio cue and a photo-mode hook; data file rows for the alignment constants.
- Effort: bespoke

### SP3-017 — The Ghost Limb
- Kind: anomaly
- Where: sector_veil_nebula (outer rim, away from all volumes)
- Trigger: proximity — 240 WU of a fixed-seed point on the rim
- The player sees/hears: a rim-light arc draws itself around empty space — the violet-on-black rim exactly as a hull would catch it, describing a ship-shaped absence roughly corvette-sized, holding for three seconds, then gone. It never repeats from the same angle.
- Payoff: plus codex entry (the Archive pays a small bonus for a scan of it).
- Build seam: one pooled rim-colored sprite/light from the event pool (`cue` row in `src/render/vfxColorLightDirector.js`) + seeded position data row.
- Effort: data+glue

### SP3-018 — The Long Twilight
- Kind: visual-setpiece
- Where: any sector (all moods inherit it)
- Trigger: sim-time window — third watch of every day, all sectors, pure `stationShiftAt`-style calendar read
- The player sees/hears: across the whole sector the key light warms and eases down a third while the ambient gains drop — the LOOK.md "dark, with lonely lights" picture becomes the default state of the night watch, then lifts again at first watch. Headlights and lamps carry more of the frame for a third of every day, everywhere, and nobody had to add a single light.
- Payoff: visual wonder only; makes the whole 600-second day legible as a day.
- Build seam: calendar-driven gain envelope merged through the `look.js` mood-lerp path; authored as a data overlay (lookMoods.js is DIRTY).
- Effort: data+glue

### SP3-019 — Eclipse Bulletin
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — news wire, one day before each Umbra Minute (SP3-002)
- The player sees/hears: `SECTOR WIRE: umbra transit tomorrow, second bell. Window glass down, work lights up.` The starmap marks the minute. The bulletin is the teach: players learn the eclipse is scheduled, not random.
- Payoff: plus codex entry after witnessing a bulletin and its event.
- Build seam: worldClock `_news` path in `src/systems/worldClock.js` + one calendar row; identical shape to the storm-season announce that already ships.
- Effort: data

### SP3-020 — The Lantern Winks Twice
- Kind: easter-egg
- Where: sector_ceres_belt
- Trigger: sim-time — The Quiet Night (dayOfYear 21), third watch only, once
- The player sees/hears: the sky-plate lantern that winks on Founders' Day (SP3-006) gives two short pulses instead — same source, different sentence. The bar's regulars refuse to discuss it. Codex entry only if the player saw both versions.
- Payoff: plus codex entry (requires both observations across two festival days — a multi-day chase).
- Build seam: same plate-strength overlay as SP3-006 keyed by `festivalForDayOfYear`; data only.
- Effort: data

---

## B. The Anvil & planetary interaction

### SP3-021 — Aurora Crown
- Kind: visual-setpiece
- Where: sector_tethys_junction (The Anvil, `planet_tethys_anvil`)
- Trigger: sim-time — ion_storm storm-season weeks only, surge phase
- The player sees/hears: a ring of green-violet curtain fire ignites around the Anvil's limb and walks slowly around the disc, its light visibly landing on hulls inside the influence edge — the aurora is a real light source, not paint. It dies when the surge ends.
- Payoff: visual wonder only; the weather forecast already announces the season.
- Build seam: planet material emissive band keyed by the existing storm season in `src/data/seasonalWeather.js`, light landing via the event-light pool's `fieldSustain`-style sustained slot in `src/render/vfxColorLightDirector.js` (DIRTY — request, don't edit).
- Effort: bespoke

### SP3-022 — The Anvil Breathes Water
- Kind: visual-setpiece
- Where: sector_tethys_junction (Anvil storm band, r 880–1040)
- Trigger: sim-time — a geyser cycle every 300 s at a hash-picked longitude (pure calendar read; two visible per hour)
- The player sees/hears: a white column of vapor punches off the ocean band and falls back as a slow fountain of beads that catch the key light; flying through the falling spray glitters your hull and cools your heat read. The column's shadow walks the cloud deck.
- Payoff: plus small bonus (heat cool inside the spray) and a codex entry.
- Build seam: particle burst via pooled `vfx.spawnParticle` vocabulary (DIRTY — call-site) + a bounded cooling field registered beside the existing heat bands in `src/data/planets.js`.
- Effort: bespoke

### SP3-023 — Lightning Web
- Kind: visual-setpiece
- Where: sector_tethys_junction (Anvil danger band, r 800–880)
- Trigger: sim-time — surge phase only, strike every 8–20 s at hash-picked points inside the band
- The player sees/hears: discharge forks walk the storm band's cloud deck — each strike is a white flash that throws real light onto every hull skimming nearby, leaving a fading afterglow patch on the clouds. Count the rhythm: the third strike of a triplet always lands on the richest cloud row.
- Payoff: visual wonder only; the rhythm is learnable and rewards positioning.
- Build seam: `explosionIgnition`-family event lights + gas-volume flash; both vocabularies exist in `src/render/vfxColorLightDirector.js` and `vfx._gas`.
- Effort: data+glue

### SP3-024 — Ring Rain
- Kind: anomaly
- Where: sector_tethys_junction (Anvil influence edge, r 1450–2600)
- Trigger: sim-time — meteor_shower season only, one visible stream per surge
- The player sees/hears: bright streaks peel off the influence edge and fall sunward toward the disc in slow file — the planet visibly eating its own ring. Stones that survive to the skim corridor become ordinary minable rocks (the weatherMeteors slot pattern).
- Payoff: plus small bonus (the fallen stones are ore-rich).
- Build seam: reuse `src/systems/weatherMeteors.js` slot book verbatim with an Anvil key; spawn points derived from `PLANET_SITE.bands` in `src/data/planets.js`.
- Effort: data+glue

### SP3-025 — The Sling Chime
- Kind: visual-setpiece
- Where: sector_tethys_junction (Anvil sling band, r 1040–1450)
- Trigger: proximity — any hull crossing the sling band at above 140 WU/s tangential
- The player sees/hears: the gravity-assist band becomes visible for a moment: every hull's predictor line and engine trail bends into the same family of arcs, and a low harmonic swells — mass made audible. Passing NPC haulers all sing the same note at the same place; it is the most lawlike sound in the sector.
- Payoff: plus codex entry (orbital mechanics); audio-visual, physics-truthful.
- Build seam: audio:cue with a new oscillator recipe in `src/data/audioRecipes.js` (RECIPES list is additive) triggered by the sling band predicate from `src/data/planets.js`; trails already bend via the existing predictor.
- Effort: data+glue

### SP3-026 — The Still Eye
- Kind: anomaly
- Where: sector_tethys_junction (Anvil storm band)
- Trigger: proximity — a fixed-seed 80 WU circle inside the danger band
- The player sees/hears: inside the circle the lightning stops, the drag vanishes and loose debris hangs motionless, glittering — a calm pocket the storm flows around. Heat cools at the out-of-band rate inside. It drifts one band-width per season.
- Payoff: plus codex entry; a known fast-repair hole for pilots who track it.
- Build seam: zone record in `src/data/sectorZones.js` (anomaly_deep type, no presence) + drag/heat exemption keyed by the same predicate as the bands in `src/data/planets.js`.
- Effort: bespoke

### SP3-027 — Plunge Runners
- Kind: encounter
- Where: sector_tethys_junction (Anvil reentry band edge)
- Trigger: sim-time — second watch of market days (heat-treat demand), proximity 400 WU
- The player sees/hears: three lightly-built hulls dive the reentry band in a chain, plasma sheaths lighting their bellies white-orange, then pull out trailing ember smoke and sell to a waiting hauler. If you follow and survive, the vendor sells to you at the band's edge.
- Payoff: plus small bonus (discounted heat-treated commodity) and a codex entry.
- Build seam: zone presence template (`P.raiders`-style row in `src/data/sectorZones.js`) with a custom route + the existing reentry heat model from `src/data/planets.js` — the NPCs use the player's own physics.
- Effort: data+glue

### SP3-028 — Moonrise Over the Anvil
- Kind: visual-setpiece
- Where: sector_tethys_junction
- Trigger: sim-time — day 30 of every year, the moonlet crosses the disc face over ~4 minutes
- The player sees/hears: a small cratered moonlet the background never quite showed before crosses the Anvil's face as a hard black coin with a lit rim, and for four minutes every eclipse-shadow behavior (SP3-002/015 family) reads against the planet instead of the belt.
- Payoff: visual wonder only; pairs into the eclipse chain.
- Build seam: background composition `signatureHero` addition in `src/data/sectorVisualProfiles.js` (the resolver already supports hero rows) keyed by calendar day.
- Effort: data

### SP3-029 — Shoot the Crown
- Kind: oneoff-mission
- Where: sector_tethys_junction (skim corridor)
- Trigger: offered at station_tethys when an aurora season (SP3-021) is forecast — the ordinary mission board
- The player sees/hears: "One exposure of the crown from inside the skim corridor while it burns. Don't die; the plate is the deliverable." You fly under the burning limb with the aurora filling the top of the frame and fire the scan pulse.
- Payoff: photography moment + codex entry + small bonus.
- Build seam: `src/data/landmarkMissions.js` row (same shape as CAVED_SHAFT_PROBE) with the aurora season as its availability predicate.
- Effort: data

### SP3-030 — Ember Trail
- Kind: visual-setpiece
- Where: sector_tethys_junction (reentry band)
- Trigger: after event — any Plunge breakup (existing commit/breakup heat path)
- The player sees/hears: the destroyed hull's largest fragments continue along the tangent as glowing embers, drawing a slowly cooling dotted line across the storm band for two minutes — the crash becomes a legible trajectory you can follow to the salvage.
- Payoff: visual wonder only; gameplay-honest (the embers ARE the wreck marker).
- Build seam: `emitDestructionLightBeats` + wreck handoff already in `src/render/vfx.js` subscriptions (`entity:killed`); a data row extends the ember lifetime by death tier (`DEATH_MASS_TIER_THRESHOLDS`).
- Effort: data+glue

### SP3-031 — The Wrong Shadow
- Kind: anomaly
- Where: sector_tethys_junction (Anvil)
- Trigger: sim-time — third watch of day 33 (The Pale Holiday), once
- The player sees/hears: the Anvil's shadow stretches across the belt pointing away from the sun — backward — for exactly one watch. Hulls inside the false shadow keep normal light; only the belt's dust goes dark. Void_signal's violet rim bleeds faintly onto everything the shadow touches.
- Payoff: plus codex entry (anomaly); Pale Holiday tie ("signals run strange").
- Build seam: one-watch rig overlay (ambient dim + violet rim) via the look-lerp path keyed by the festival row in `src/data/worldCalendar.js`.
- Effort: data+glue

### SP3-032 — The Driftmark Pulse
- Kind: anomaly
- Where: sector_tethys_junction (Driftmark Survey, `zone_tethys_driftmark`)
- Trigger: proximity — inside the survey's 480 WU disc, on its 10 s cycle
- The player sees/hears: every ten seconds the star field behind the survey marks visibly shears for a quarter-second — parallax bending around a mass that is not there — and the survey buoys' lamps ripple in sequence outward from the center, as if something under the plate turned over.
- Payoff: plus codex entry; the Archive's existing survey framing gives it a home.
- Build seam: background structure warp pulse keyed by zone occupancy (structure.warp field exists in `src/data/sectorVisualProfiles.js`); buoy lamp ripple via lamp-bus phase offsets (`lampPhaseForKey`).
- Effort: bespoke

### SP3-033 — The Fiddle Strings
- Kind: world-oneoff
- Where: sector_ceres_belt (between two boulders of f_ceres_2)
- Trigger: always present; audibly active during solar_wind seasons
- The player sees/hears: someone has strung eleven real cargo tethers between two boulders like a harp. During solar wind they sing — a slow, detuned chord that changes pitch as the wind fronts pass, each string throwing a faint vibration glint. Shoot one string and the chord loses a voice for a season.
- Payoff: plus codex entry; a listening place, not a fight.
- Build seam: `src/data/worldOneOffs.js` row (props + tether lines via the existing rope substrate) + a wind-pitched audio:cue recipe in `src/data/audioRecipes.js`.
- Effort: data+glue

### SP3-034 — The Band Survey
- Kind: oneoff-mission
- Where: sector_tethys_junction (all four Anvil band edges)
- Trigger: offered at station_customs during any storm season; requires dropping one buoy at each band edge (reentry/danger/skim/sling from `PLANET_SITE.bands`)
- The player sees/hears: each buoy lights when its boundary's hysteresis band crosses it — the planet's regions made visible as four standing rings of lamps. The last buoy's light lands on the first's and the four rings pulse once, together.
- Payoff: plus codex entry (planetary band map) + small bonus.
- Build seam: `src/data/landmarkMissions.js` row family + beacon props (existing `place_lane_beacon`); band predicates from `src/data/planets.js`.
- Effort: data+glue

### SP3-035 — The Anvil Lighthouse
- Kind: world-oneoff
- Where: sector_tethys_junction (influence edge, fixed orbit)
- Trigger: always present; flashes on a 13 s lamp period
- The player sees/hears: an old automated beacon rides the influence edge on a slow orbit, its lamp sweeping the dark side of the disc once every 13 seconds — the only structure for a thousand WU, reading as one lonely light in the black. Its flash is visible from the sling band; pilots time approaches by it.
- Payoff: plus codex entry; a registered charted place (map-visible).
- Build seam: `src/data/authoredPlaces.js` zone record + beacon lamp with the `beacon` channel from `src/data/lampChannels.js`; atlas gates per `src/data/PLACE_REGISTRATION.md`.
- Effort: data

### SP3-036 — Ocean Glint Walk
- Kind: visual-setpiece
- Where: sector_tethys_junction (Anvil ocean band)
- Trigger: sim-time — the specular walk crosses the ocean band once per 600 s day, ~40 s duration (pure sun-angle geometry)
- The player sees/hears: a single burning point of reflected sun slides across the Anvil's ocean band like a bead of fire, widening into a golden road of specular glint as the angle shallows, then pinching out. For forty seconds the planet reads as water.
- Payoff: visual wonder only; pairs with SP3-001 as the planetary sibling of the Glint Hour.
- Build seam: planet-factory specular parametric moment — one authored material band in the `planet_tethys_anvil` constants (`src/data/planets.js` names the palette path via `planetFactory.js`); data-driven, no new shader.
- Effort: bespoke

### SP3-037 — Aurora Warning
- Kind: comms-event
- Where: sector_tethys_junction
- Trigger: sim-time — season turn into an ion_storm week, `calendar:stormSeason` already fires
- The player sees/hears: `ANVIL WIRE: crown likely tonight. Skim corridor lit, danger band lethal.` One line, teaches that the aurora (SP3-021) follows the storm calendar — the chain that makes the phenomenon predictable.
- Payoff: plus codex entry (weather literacy).
- Build seam: one calendar-scoped branch on the existing `calendar:stormSeason` emit in `src/systems/worldClock.js`.
- Effort: data

### SP3-038 — The Skimmer Shift
- Kind: encounter
- Where: sector_tethys_junction (skim corridor)
- Trigger: sim-time — first watch of any day, proximity 500 WU of the corridor
- The player sees/hears: a line of harvest barges works the corridor with running lights on, each dragging a heat-scoop glow that reads as a string of amber lanterns along the band. They hail you with corridor etiquette; cut through their line and the last barge flashes its floods at you — annoyance, not law.
- Payoff: visual wonder only; world-alive texture that rewards polite flying with a comms nod.
- Build seam: zone presence (civilian template) + job runtime (miner/hauler jobs persist under `data.npcJobs`, saveVersion v12).
- Effort: data

### SP3-039 — The Planet Blinks
- Kind: anomaly
- Where: sector_tethys_junction (Anvil)
- Trigger: sim-time — one 600 s day per year (hash-picked), the whole cloud deck brightens and dims on a slow 8 s swell
- The player sees/hears: the Anvil appears to breathe light — cloud bands swelling brighter then darker, like luminescence rising from under the weather. Radar reads nothing. It never happens twice the same day.
- Payoff: plus codex entry (anomaly).
- Build seam: planet material emissive envelope as a one-day overlay keyed by calendar hash; same seam as SP3-021.
- Effort: data+glue

### SP3-040 — The Ice Halo
- Kind: anomaly
- Where: sector_pallas_drift (reef field shepherd rock)
- Trigger: proximity — crossing the halo's fixed 260 WU radius while the key light's bearing sits inside its authored arc
- The player sees/hears: a ring of ice shards in orbit around the reef's largest rock catches the sun all at once as you cross its plane — a 360-degree flash of white sparks that travels outward along the ring like a fuse, then darkens. Twice a day, if you know the bearing.
- Payoff: plus codex entry (optics); photography moment.
- Build seam: optic-lattice stamp (`src/data/opticStructures.js` scatter vocabulary) using diamond cells as the shards + cue light through `presetFor('vein', ...)` family.
- Effort: data+glue

---

## C. Weather & season phenomena

### SP3-041 — The Curtain Rises
- Kind: visual-setpiece
- Where: sector_vesta_forge, sector_io_reach, sector_veil_nebula (the three WEATHER_SECTOR_IDS)
- Trigger: sim-time — ion_storm season, warning phase (30 s), at the forecast bearing from `SEASONAL_WEATHER_VOLUMES`
- The player sees/hears: the ion front arrives visibly — a slow wall of violet curtain-light leaning across the sector from the forecast bearing, its leading edge throwing flickers on every hull it passes, closing to surge in 30 seconds exactly as the forecast says. You can outfly it, face it, or dock.
- Payoff: visual wonder only; the warning phase is already timed data.
- Build seam: weather volume field presentation (fields register in the ONE kernel via `src/data/environmentalMachinery.js`) + gas-volume color ramp via `vfx._gas` vocabulary.
- Effort: data+glue

### SP3-042 — Static Crawl
- Kind: anomaly
- Where: sector_vesta_forge, sector_io_reach (ion_storm weeks)
- Trigger: sim-time — the final 10 s of each warning phase, hulls in open space
- The player sees/hears: violet discharge crawls along your own hull's panel seams and pools at the wingtips — the status-matter vocabulary showing electricity hunting for ground. NPCs' hulls show it too, dimmer. When the front hits (surge phase), the crawl snaps off all at once with a tick.
- Payoff: plus codex entry (storm sign); a readable tell that costs nothing.
- Build seam: attached status-matter pool (`_statusMatterVfx` owner in `src/render/vfx.js`, DIRTY — request the existing attachment verb) keyed by the warning-phase predicate.
- Effort: data+glue

### SP3-043 — The Streamer Field
- Kind: anomaly
- Where: sector_io_reach (solar_wind weeks)
- Trigger: sim-time — surge phase, hulls at speed
- The player sees/hears: every drive trail in the sector stretches into long cometary streamers that lean hard downwind — the whole traffic picture visibly combs in one direction, and loose debris drifts the same way. Stop thrust and your own streamers overtake you.
- Payoff: visual wonder only; makes the crosswind mechanically honest (the wind already carries hulls).
- Build seam: ribbon-trail wind bias — the trail ribbon vocabulary in `src/render/vfx.js` (`RIBBON_*` constants) takes a data-driven wind vector from the weather volume.
- Effort: bespoke

### SP3-044 — The Fireball
- Kind: visual-setpiece
- Where: sector_veil_nebula (storm lane), sector_vesta_forge
- Trigger: sim-time — meteor_shower surge phase, one fireball per surge on a hash-picked bearing
- The player sees/hears: a single boulder-sized fireball crosses the whole sector in eight seconds — brighter than anything else in the sky, throwing successive light beats onto the field below it — and lands somewhere real: its impact site becomes a smoking crater marker with fresh ore for the rest of the day.
- Payoff: plus small bonus (the crater is a one-day mini-site); the wire can name its bearing.
- Build seam: `explosionBeat` light family + finite physical meteor reusing the weatherMeteors slot book; impact marker via the aftermathWreck record path.
- Effort: data+glue

### SP3-045 — Dust Shear
- Kind: visual-setpiece
- Where: sector_ceres_belt (f_ceres_2), sector_rhea_cinder (slag field)
- Trigger: sim-time — solar_wind surge, a visible shear wave rolls one named field per surge
- The player sees/hears: a front of glowing dust rolls through the rock field and the rocks lean and shiver as it passes — asteroid motion you can see coming, like wind through wheat. Loose ore in the field scatters ahead of the wave.
- Payoff: visual wonder only; rich-mining after the wave passes (fresh exposure).
- Build seam: `asteroidMotion` impulse wave keyed by the volume field kernel (one registered sheet field in `src/data/environmentalMachinery.js`).
- Effort: data+glue

### SP3-046 — The Silence Front
- Kind: anomaly
- Where: sector_veil_nebula (radiation belt)
- Trigger: sim-time — first 20 s of every ion_storm surge inside the belt volume
- The player sees/hears: all sound ducks to nothing — engine, weapons, radio — for twenty seconds while violet static visibly crawls on the hull. Then everything floods back with a half-second of doubled echo. The belt did not get quieter; you went deaf.
- Payoff: plus codex entry (anomaly); a genuinely unsettling fifteen seconds.
- Build seam: audio bus master duck keyed by volume occupancy (the duck parameter already exists on `audio:cue` payloads in `src/systems/presentationAdapters.js`).
- Effort: data+glue

### SP3-047 — Front Riders
- Kind: encounter
- Where: sector_veil_nebula (storm lane)
- Trigger: sim-time — surge phase, proximity 300 WU of the front edge
- The player sees/hears: a pair of ragged salvage hulls rides the leading edge of the debris current in formation, sails of backlit dust streaming off their bows, cutting whatever the front throws at them. They salute anyone riding as well and mark the richest debris streaks with green lamp bursts.
- Payoff: plus small bonus (follow the green marks to salvage); codex entry for riding a full surge with them.
- Build seam: zone presence row + doctrine tell lights (`tellLink` family in `src/render/vfxColorLightDirector.js`).
- Effort: data

### SP3-048 — The Forecast Bell
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — every season turn (7 days), all sectors
- The player sees/hears: a three-note chime (one per weather kind — ion, wind, iron) and the existing `weatherForecast` text delivered as a wire bulletin with weight, not popup: the season is now an announced character in the run.
- Payoff: plus codex entry (the almanac opens once all three chimes are heard).
- Build seam: `weatherSeasonAt` already pure in `src/data/seasonalWeather.js`; a recipe per chime in `src/data/audioRecipes.js` + worldClock news emit.
- Effort: data

### SP3-049 — Hail of Ore
- Kind: visual-setpiece
- Where: sector_ceres_belt (post-surge rock fields)
- Trigger: after event — meteor_shower surge ends over a named field
- The player sees/hears: as the front clears, the field rains glitter — loose ore shaken free of the rocks catches the returning key light as a slow golden snowfall for a minute, settling onto the rocks. Anything you scoop during the fall is free.
- Payoff: plus small bonus; a post-storm payday ritual pilots will wait for.
- Build seam: mining yield pickup vocabulary (`mining:yield` path) with an authored emission window; light is just the returning key.
- Effort: data+glue

### SP3-050 — The Wash
- Kind: visual-setpiece
- Where: sector_veil_nebula (the lane), generalized from `circuit_veil_wash`
- Trigger: sim-time — twice per calm phase, a debris wash crosses the trade lane on a fixed bearing with an 8 s warning stinger
- The player sees/hears: a wall of tumbling wreck-fragments sweeps across the lane at hull height, backlit, and for ten seconds the lane is a river of iron. It is the racing set-piece let loose in adventure: hold, dodge, or ride the edge.
- Payoff: visual wonder only; combat-honest (the debris hits).
- Build seam: `src/data/racingSetPieces.js` `wave` row shape ported to an adventure weather volume via `environmentalMachinery.js` field registration.
- Effort: data+glue

### SP3-051 — Ride the Front
- Kind: oneoff-mission
- Where: sector_io_reach
- Trigger: offered at station_io_merc during solar_wind weeks
- The player sees/hears: "Stay in the surge for sixty seconds and bring the wick back lit." Sixty seconds inside the visible front — streamers combed past your canopy, the hull crawling with static — then the calm hits like a door closing and the wick's blue flame stands straight up.
- Payoff: plus small bonus + codex entry (storm rider).
- Build seam: `src/data/landmarkMissions.js` row with a surge-phase occupancy predicate (pure `seasonalWeatherPhase` read).
- Effort: data

### SP3-052 — The Weathered Buoy Chain
- Kind: world-oneoff
- Where: sector_veil_nebula (storm lane edge)
- Trigger: always present; the chain's lamps read the current season
- The player sees/hears: five derelict weather buoys strung along the lane edge, one lamp each: amber burns during solar wind, violet during ion storm, dark when clear, all five relighting in sequence at each season turn like a wind gauge changing its mind.
- Payoff: plus codex entry; the chain becomes the sector's forecast you can see.
- Build seam: `src/data/worldOneOffs.js` cluster rows + lamp channels keyed by `weatherSeasonAt` (the lamp bus accepts data-driven gain).
- Effort: data+glue

### SP3-053 — First Snow
- Kind: anomaly
- Where: sector_pallas_drift (cold_drift weeks)
- Trigger: sim-time — the two cold seasons of each year
- The player sees/hears: the sector's dust acquires a slow, falling drift of bright motes that settle on hull tops and stay — ships fly with dusting of white that sheds when you thrust. Rock fields read softer; the whole sector lowers its voice.
- Payoff: visual wonder only; a seasonal identity for Pallas that costs nothing.
- Build seam: gas-volume particle row keyed by season hash; shedding on thrust via the existing trail emission gate.
- Effort: data+glue

### SP3-054 — The Fog Bank
- Kind: anomaly
- Where: sector_veil_nebula (nebula_fog zones)
- Trigger: sim-time — one cycle per calm phase, fog thickens for 90 s at a hash-picked zone
- The player sees/hears: the fog wall exhales outward to three times its radius — radar rings bloom into static, lights go haloed, and ships emerge as silhouettes at 200 WU. Then it inhales back over the origin rock like a tide.
- Payoff: visual wonder only; ambush-honest (fog zones already hide hulls).
- Build seam: zone-attached gas-volume opacity envelope; the fog zone type already exists in `src/data/sectorZones.js` ZONE_TYPES.
- Effort: data+glue

### SP3-055 — Rime Lightning
- Kind: anomaly
- Where: sector_pallas_drift (cold seasons only)
- Trigger: sim-time — hash-picked strikes during cold surges
- The player sees/hears: a pale-blue arc walks between two rocks — and freezes mid-fork for a full second, a statue of lightning, before crumbling into ice-dust. Frozen bolts persist as faint glassy traces on the rocks for minutes.
- Payoff: plus codex entry; photography moment.
- Build seam: pooled arc sprite with an authored hold phase (sprite-batch vocabulary in `src/render/vfx.js`); traces via the seam-marker pipeline already exported there.
- Effort: bespoke

### SP3-056 — Shelter Advisory
- Kind: comms-event
- Where: any sector with an active surge
- Trigger: sim-time — surge start, stations broadcast
- The player sees/hears: `SHELTER ADVISORY: surge until second bell. Apron lights doubled, berths half price.` Docking during the surge shows doubled apron work-lights and the wire confirms the fee cut — weather touching economy through one line.
- Payoff: plus small bonus (dock fee cut); teaches that stations respond to weather.
- Build seam: worldClock popup + the existing station-side-event director reaching `spawnStationSideEventStreak` (apron light streaks) in `src/render/vfx.js`.
- Effort: data

### SP3-057 — The Lightning Catcher
- Kind: visual-setpiece
- Where: sector_vesta_forge (station_forge mast), sector_io_reach (station_reach)
- Trigger: sim-time — during ion surges, the named mast draws one bolt every ~45 s
- The player sees/hears: the forge's comm mast gathers a crawling glow, then takes the strike — the bolt's light visibly lands on the mast's neighbors and every hull parked on the apron, throwing sharp transient shadows. A safe distance away it is the best show in the sector.
- Payoff: visual wonder only; pairs with the doubled apron lights of SP3-056.
- Build seam: event-light pool (`explosionIgnition` row) + mast geometry from the existing everyday-kit (`place_sensor_mast`); all existing parts.
- Effort: data+glue

### SP3-058 — The Sails Take the Wind
- Kind: world-oneoff
- Where: sector_tethys_junction (Anvil Orchard)
- Trigger: sim-time — solar_wind weeks; the orchard's sails respond to the gust profile
- The player sees/hears: the orchard's farm sails (the gust profile already authored in `ANVIL_ORCHARD_GUST_PROFILE`) visibly billow and yaw through the front, throwing moving shade patterns across the pod rows beneath. In calm they hang slack. The wind is visible because something is rigged to catch it.
- Payoff: visual wonder only; the orchard becomes a weather dial.
- Build seam: `src/data/anvilOrchardBody.js` sail articulation + the existing gust profile; presentation only, no sim change.
- Effort: data+glue

### SP3-059 — The Marooned Trawler
- Kind: encounter
- Where: sector_io_reach (solar_wind weeks)
- Trigger: sim-time — surge phase, proximity 200 WU of a hash-picked lane point
- The player sees/hears: a trawler lies dead in the crosswind, beam-on, its one working lamp sweeping in slow panicked arcs while debris streams past it. Hail it and the crew asks for a push into the lee of a nearby rock — tow them 300 WU and they light a thank-you flare from the airlock.
- Payoff: plus small bonus + codex entry (good-samaritan receipt).
- Build seam: zone presence single-spawn template + tow via the existing massline physics; flare via `explosionIgnition` cue light.
- Effort: data+glue

### SP3-060 — The Clearing
- Kind: visual-setpiece
- Where: any weather sector
- Trigger: sim-time — the exact second each surge ends
- The player sees/hears: the sky cleans in one wipe: the curtain-light collapses anti-sunward, stars sharpen over a second, gas thins, and every hull's rim light comes back at once — the sector audibly relaxes (a single low exhale in the mix). The best five seconds of weather in the game, and it ends every storm.
- Payoff: visual wonder only; paired with the Forecast Bell it teaches the whole weather arc.
- Build seam: post exposure/structure lerp on the `resolveBackgroundStructure` fields in `src/data/sectorVisualProfiles.js` keyed by phase flip; exhale cue in `src/data/audioRecipes.js`.
- Effort: data+glue

### SP3-061 — The Barometer Ghost
- Kind: anomaly
- Where: sector_veil_nebula (volume edge)
- Trigger: proximity — the 40 WU skin at each weather volume's edge during warning phase
- The player sees/hears: stars viewed through the volume's boundary lens visibly refract — a ring of doubled, smeared stars marking the exact edge of the coming front, so the invisible weather gets an edge you can see before it arrives.
- Payoff: plus codex entry; practical (the edge is the safe line).
- Build seam: background structure warp pulse at volume boundary (the `warp` field exists in the structure vocabulary of `src/data/sectorVisualProfiles.js`).
- Effort: bespoke

### SP3-062 — The Storm Riders' Shrine
- Kind: world-oneoff
- Where: sector_veil_nebula (storm lane, lane-side rock)
- Trigger: always present; one ribbon per survived season, seeded from the sector's weather history
- The player sees/hears: an antenna mast on the lane-side rock, ribbons tied to it — one per season the lane has survived, color-coded to the season kind, the oldest bleached grey. In wind they all stream one way; new pilots add theirs (a small lamp ignites on the mast).
- Payoff: plus codex entry; a place that remembers the weather.
- Build seam: `src/data/worldOneOffs.js` row (`place_memorial_array` donor) + ribbon count read from the seasonal ledger (seeded, deterministic).
- Effort: data

---

## D. Belt & debris dynamics

### SP3-063 — The Grand Tumble
- Kind: visual-setpiece
- Where: sector_ceres_belt (f_ceres_2)
- Trigger: always present; pair separation is a pure function of sector seed + simTime
- The player sees/hears: two field boulders the size of tugs grind against each other in a slow destroy-and-settle dance — contact sparks flare on the seam every few minutes, and over the run you can literally see the pair has moved. By year's end they read as a different shape than day one.
- Payoff: plus codex entry (geology); a landmark that ages.
- Build seam: `src/data/asteroidMotion.js` paired-rock articulation (the ceresWorkfleet articulation vocabulary proves multi-body props work); contact spark via `collision` event-light row.
- Effort: bespoke

### SP3-064 — The Unstable Cluster
- Kind: visual-setpiece
- Where: sector_kepler_scar (debris arc)
- Trigger: first sector entry per season seeds one unstable pile; collapses when any hit lands or a hull over 400 mass passes
- The player sees/hears: a teetering mound of hull plates and rock leaning against a boulder, visibly breathing under its own load. One shot drops it: a chain of sub-collisions runs the pile's length, each link flaring its own light beat, ending in a slow settle and a rising dust ghost.
- Payoff: plus small bonus (the pile was covering ore); physics spectacle earned by a trigger you control.
- Build seam: finite staged fractures (saveVersion v15 already persists pending fractures/blasts) + `explosionBeat` light chain in `src/render/vfxColorLightDirector.js`.
- Effort: data+glue

### SP3-065 — The Boulder Binary
- Kind: visual-setpiece
- Where: sector_pallas_drift (reef approach)
- Trigger: always present; orbit phase is pure simTime
- The player sees/hears: two matched boulders orbit a common point about a ship-length apart, their orbit plane glowing faintly with abraded dust — a clockwork of the belt. Their period is exactly one 600 s day; miners tell time by them.
- Payoff: plus codex entry; a visible clock (the calendar made physical).
- Build seam: `asteroidMotion` binary pair keyed to simTime; dust ring via one gas-volume row.
- Effort: data+glue

### SP3-066 — The Crusher Trail
- Kind: encounter
- Where: sector_ceres_belt (refinery approach)
- Trigger: sim-time — after each shift change, proximity 400 WU of the approach lane
- The player sees/hears: a yard tug drags a boulder bigger than itself down the refinery approach, its massline drawn bar-taut and singing, rock dust shedding behind. Give way or get swept; cut the line and the boulder rolls free and everyone on the channel has opinions.
- Payoff: visual wonder only; the massline made visible as industry.
- Build seam: NPC job runtime (hauler jobs, saveVersion v12) with a massline-attached load; taut-line presentation already exists (`MONOFILAMENT_BLADE_TAUT_RATIO` in `src/render/vfx.js`).
- Effort: data+glue

### SP3-067 — The Sluice Pulse
- Kind: visual-setpiece
- Where: sector_ceres_belt (Cinder Sluice, CINDER_SLUICE_SITE_ID)
- Trigger: sim-time — on every shift change, one pulse cycle (~40 s)
- The player sees/hears: the sluice gates open in sequence and a river of gravel pours through the kill machines' channel, each gate's opening throwing a light beat down the line — the machines visibly drinking. Stand in the channel and the pulse is a slow avalanche you outrun or don't.
- Payoff: visual wonder only; ties the calendar to the machine site.
- Build seam: `killMachinePhase` vocabulary in `src/data/environmentalMachinery.js` + `explosionBeat` lights on the gates; particle pour via pooled particles.
- Effort: data+glue

### SP3-068 — The Shed Panel
- Kind: visual-setpiece
- Where: sector_io_reach (Cruiser Graveyard, poi_cruiser)
- Trigger: sim-time — hash-picked once per season per wreck family, 20 s duration
- The player sees/hears: a wreck quietly lets go of a hull panel: a groan (if near), the panel tumbling free in the light, spinning so its lacquer catches sun in slow flashes as it drifts off the site. Nothing explodes. It is just a dead ship becoming more dead, on its own schedule.
- Payoff: plus codex entry (each family sheds a named panel once); quiet, memorable.
- Build seam: `place_aftermath_deb_*` fragment donors from `src/data/wreckAftermathDressing.js` spawned as finite props on the seeded schedule; sun flashes are the existing coat.
- Effort: data

### SP3-069 — The Measured Ring
- Kind: anomaly
- Where: sector_eunomia_gulf
- Trigger: proximity — 150 WU of the ring's fixed-seed center
- The player sees/hears: forty impact fragments lie exactly on a circle 120 WU across, every fragment's long axis pointing at the center — not scattered, arranged. A survey pin at the circle's edge reads "circumference re-checked, day 40, unchanged." Nothing explains the circle.
- Payoff: plus codex entry (anomaly); the Archive pays a scan bonus.
- Build seam: optic-scatter-style seeded placement (`opticScatterSpecsFor` pattern in `src/data/opticStructures.js`) on a circle constraint + a claim-mark donor prop.
- Effort: data

### SP3-070 — Separate the Dancers
- Kind: oneoff-mission
- Where: sector_pallas_drift (Boulder Binary, SP3-065)
- Trigger: offered at station_drift after the player has witnessed one full binary period
- The player sees/hears: "They're grinding each other to gravel. Split them before they're dust." A massline job: latch one boulder, burn against the orbit, and pull the pair apart — the separation moment flings a ring of abraded dust that hangs as a visible scar of the job.
- Payoff: plus small bonus + codex entry (the binary becomes two solitary rocks with a named history).
- Build seam: `src/data/landmarkMissions.js` row + ordinary massline physics on the two `asteroidMotion` bodies; dust ring via gas volume.
- Effort: bespoke

### SP3-071 — The Glitter Vein
- Kind: visual-setpiece
- Where: sector_ceres_belt (rich-core fields)
- Trigger: after event — first mining yield from a rich-core vein during meteor_shower season
- The player sees/hears: the vein's exposed face throws its payout sparkle harder than usual — ejected ore catches the light as a brief constellation around the rock before collecting. For a moment the rock reads as a jewelry box, then it is just mining again.
- Payoff: plus small bonus (the season's first rich yield pays double at the refinery).
- Build seam: `miningYield`/`veinPayout` light rows in `src/render/vfxColorLightDirector.js` already exist; a data row gates the season bonus.
- Effort: data

### SP3-072 — The Measured Rock
- Kind: world-oneoff
- Where: sector_eunomia_gulf (beside the Stepwell site)
- Trigger: always present
- The player sees/hears: a house-sized boulder with survey pins hammered in every 10 WU along one seam and a brass plate: "STILL SHRINKING. — Gulf Survey, year 12." Fresh filings glitter at the newest pin. Someone has measured it every day for years, and it is measurably, deterministically smaller each visit.
- Payoff: plus codex entry; a joke with a straight face.
- Build seam: `src/data/worldOneOffs.js` row (claim-mark + pins via existing prop donors); shrink step keyed to calendar year (deterministic).
- Effort: data

### SP3-073 — The Grinding Halt
- Kind: visual-setpiece
- Where: sector_pallas_drift (Boulder Binary)
- Trigger: sim-time — the fixed season in which the binary's orbit finally decays (seeded, years out); one-time
- The player sees/hears: the pair touch: a long sub-audible groan, one white contact flash that lights the whole reef, and then stillness — two rocks become one dumbbell with a glowing seam that cools over an hour. The wire reports it the next day; pilots who saw it live can say so in the bar.
- Payoff: plus codex entry (a one-time sector event that was always scheduled).
- Build seam: the SP3-065 binary's seeded terminal tick + `explosionCapital`-scale single light via the director; news row via worldClock.
- Effort: bespoke

### SP3-074 — The Wolf Pack
- Kind: encounter
- Where: sector_kepler_scar (fresh wreck field)
- Trigger: after event — 60 s after any capital-class kill in the sector, proximity 500 WU
- The player sees/hears: scavenger wings arrive in file, cutting lights flashing as they work — green go-lamps over chosen plates, red stop-lamps over contested ones — and the wreck field lights up like a construction site. They strip visibly: plates teeter, detach, get dragged.
- Payoff: visual wonder only; contestable if you want their claim.
- Build seam: scavenger presence template + job-signature lights (`emitNpcJobSignature` in `src/render/vfx.js`); aftermath donor plates from `wreckAftermathDressing.js`.
- Effort: data+glue

### SP3-075 — The Quiet Zone
- Kind: anomaly
- Where: sector_rhea_cinder (ash field)
- Trigger: proximity — a fixed-seed 100 WU patch where the ash hangs motionless
- The player sees/hears: inside the patch the perpetual ash-fall stops — flakes hang in place, glittering, as if time were thick there. Your wake doesn't disturb them; they close behind you like water. The ash outside the patch keeps falling.
- Payoff: plus codex entry (anomaly).
- Build seam: gas-volume velocity-freeze radius (the `_gas` layer takes a per-volume stillness scalar); seeded position row.
- Effort: data+glue

### SP3-076 — Avalanche
- Kind: visual-setpiece
- Where: sector_hyperion_cut (drill-site overburden)
- Trigger: after event — a hull above 900 mass (hauler-class) passes within 60 WU of the seeded pile, or two mining blasts inside 10 s
- The player sees/hears: the overburden pile lets go downslope in three surges — each surge a grinding light-flecked front that buries the field's low side and settles into new terrain that stays for the season. The drill rig survives on its legs, lights blinking insulted.
- Payoff: plus small bonus (the slide exposes ore); terrain memory via persisted fracture receipts.
- Build seam: staged fracture chain (saveVersion v15) + `spawnCollisionThrowSpray` vocabulary in `src/render/vfx.js`.
- Effort: bespoke

### SP3-077 — The Tailings River
- Kind: world-oneoff
- Where: sector_ceres_belt (down-sun of station_ceres)
- Trigger: always present; grows one visible deposit layer per season
- The player sees/hears: a slow, glowing stream of refinery tailings arcs from the refinery's ejection spine to a tailings field that visibly grows — season by season the field's bank of dull-glowing slag reaches farther, its newest layer still warm enough to read in the dark.
- Payoff: plus codex entry; the refinery's shadow made physical.
- Build seam: station-side-event pour (existing streak vocabulary) + a deterministic deposit-growth row in the sector's dressing data (seeded per season, like `everydaySpaceKitDressing.js`).
- Effort: bespoke

### SP3-078 — Rock Crossing Warning
- Kind: comms-event
- Where: sector_kepler_scar, sector_ashfall_reach
- Trigger: sim-time — the wire posts a rock-crossing one day ahead; the crossing happens on schedule
- The player sees/hears: `WIRE: a 40 m iron crosses the Scar lane tomorrow, second bell. Give it room.` Tomorrow, at exactly the posted minute, it crosses — a dark boulder with three blinking survey lamps and a lit tail of dust, escorted by a bored tender skiff.
- Payoff: plus codex entry (schedule literacy); being there on the minute is its own reward.
- Build seam: worldClock news + a deterministic convoy spawned from the calendar row (lane-contact idiom from `src/data/worldOneOffs.js` comments).
- Effort: data+glue

### SP3-079 — The Workfleet Crossing
- Kind: encounter
- Where: sector_ceres_belt (refinery lane), generalized from `circuit_helios_belt`'s textile crossing
- Trigger: sim-time — once per day at shift change, the crossing sweeps the refinery lane for ~50 s
- The player sees/hears: the full ceres workfleet crosses the lane in column — breakers, tenders, the ladle barge — running lights on, holding a diamond formation with the smooth discipline of habit. Everyone waits; the lane is theirs for a minute. Their senior barge dips its floods once at your ship if you held position.
- Payoff: visual wonder only; the respectful-wait becomes a social mechanic (the dip is a reputation nod).
- Build seam: `racingSetPieces.js` `crossing` row shape ported to the adventure lane + `ceresWorkfleet` identities.
- Effort: data+glue

### SP3-080 — The Boulder Garden
- Kind: world-oneoff
- Where: sector_charon_expanse (behind poi_colony)
- Trigger: always present
- The player sees/hears: thirty fist-sized rocks in a careful double spiral around a claim post, each on a tiny numbered pedestal of welded scrap — someone's garden, tended. One rock is missing; its pedestal reads "LOST IN THE WIND. REPLANTED SPRING."
- Payoff: plus codex entry; a smile, then a reason to come back next year.
- Build seam: `src/data/worldOneOffs.js` cluster row (deterministic offsets, per the file's own law) + claim-post donor.
- Effort: data

### SP3-081 — The Slow Kiss
- Kind: comms-event
- Where: sector_ashfall_reach
- Trigger: sim-time — two dead hulks on a seeded intercept; the wire predicts the impact minute one week out; the impact is one-time per seed
- The player sees/hears: `WIRE: the Marnie's Pride and the hulk she killed will touch in six days, near the redoubt. Pilots may wish to observe.` Six days later, at the minute: a gentle contact, one deep flash rolling along both hulls, a silent blossom of plates — then the wire reads the obituary of the collision nobody caused.
- Payoff: plus codex entry (a scheduled, unmissable death); photography moment.
- Build seam: two durable wreck records (world.records, saveVersion v11) with seeded drift + `explosionShear` light family; wire via worldClock.
- Effort: bespoke

### SP3-082 — The Photograph of the Kiss
- Kind: oneoff-mission
- Where: sector_ashfall_reach (the Slow Kiss, SP3-081)
- Trigger: offered at station_ashcache when the wire posts the prediction
- The player sees/hears: "One frame at contact. Close enough to see the paint." The scan pulse fires at the impact minute from inside 120 WU: the flash fills the frame, the plate captures two hulls mid-softening, and the station pays before it reviews the exposure.
- Payoff: photography moment + codex entry + small bonus.
- Build seam: `src/data/landmarkMissions.js` row with the impact tick as its window (pure simTime compare).
- Effort: data

---

## E. Machine rituals & industry

### SP3-083 — The Pour
- Kind: visual-setpiece
- Where: sector_vesta_forge (station_forge foundry spine)
- Trigger: sim-time — twice per day at hash-picked shift midpoints, ~90 s
- The player sees/hears: the foundry spine opens and a white-orange pour runs down the channel mould, its light landing on every hull parked within 200 WU — real event light, calibrated by the director — while the pour's own glow walks the spine gate by gate. The final mould flashes once and goes dark, and the channel's heat shimmer fades over a minute.
- Payoff: visual wonder only; the sector's whole economy made visible.
- Build seam: sustained event light (`fieldSustain` slot pattern) + pooled particles; all vocabulary exists in `src/render/vfxColorLightDirector.js`.
- Effort: bespoke

### SP3-084 — The Kiln Door
- Kind: world-oneoff
- Where: sector_vesta_forge (the Runaway Kiln story prop)
- Trigger: sim-time — the kiln's cycle: door every 300 s, burn 40 s
- The player sees/hears: the runaway kiln's door irises open on schedule and its interior glow breathes out in three slow pulses, heat shimmer standing off the shell, before the door irises shut mid-breath (it never completes the fourth pulse — that is why they call it runaway). Its light catches nearby rocks like a lighthouse of warmth.
- Payoff: plus codex entry; gives the existing story prop a heartbeat.
- Build seam: emissive envelope on the existing story-prop package keyed by simTime; `moment.stinger` cue already attached to it in `src/data/trailerMoments.js`.
- Effort: data+glue

### SP3-085 — All the Bells
- Kind: visual-setpiece
- Where: sector_vesta_forge (the Eighth Bell), sector_ceres_belt, sector_sker_haven
- Trigger: sim-time — Forge Due (dayOfYear 26) only, at shift turns; one toll per sector in sequence
- The player sees/hears: on Forge Due the Eighth Bell tolls and, two seconds after each toll, every station's window rows in the sector flash once in a wave — the toll physically passing through the infrastructure. In Ceres and Sker, their own yard bells answer one octave down.
- Payoff: plus codex entry; a festival felt in light, not just the wire.
- Build seam: lamp-bus global envelope keyed by the festival row in `src/data/worldCalendar.js`; toll audio recipe already exists (`sfx_eighth_bell_toll`).
- Effort: data+glue

### SP3-086 — Shift Change Cascade
- Kind: visual-setpiece
- Where: any sector (station-anchored)
- Trigger: sim-time — each station's three shift turns per 600 s day (per-berth offsets already hashed)
- The player sees/hears: the station's window rows extinguish in a floor-by-floor wave and relight at the new watch's warmer gain — the building visibly changing hands. Docked, you hear the PA; outside, you watch the lights do the talking.
- Payoff: visual wonder only; makes every station a clock.
- Build seam: lamp-bus gain wave keyed by `stationShiftAt` in `src/data/worldCalendar.js`; zero new systems.
- Effort: data

### SP3-087 — The Dry Dock Dance
- Kind: visual-setpiece
- Where: sector_tethys_junction (station_customs service bay)
- Trigger: sim-time — one repair cycle per watch, ~3 minutes
- The player sees/hears: two service gantries rotate in complement around a berthed hull, their welding arcs strobing complementary colors (one cyan, one sodium), the hull slowly rotating between them like a carved bird. The arcs' light lands on the apron and passing traffic.
- Payoff: visual wonder only; repairs you can watch from the lane.
- Build seam: everyday-kit donors (`place_repair_scaffold`, `place_welding_drone` in `src/data/everydaySpaceKitDressing.js`) + welding flash via `muzzle` light family.
- Effort: data+glue

### SP3-088 — Radiator Bloom
- Kind: world-oneoff
- Where: sector_tethys_junction (station_tethys spine), sector_ceres_belt (station_ceres)
- Trigger: sim-time — vent cycle every 600 s day, ~60 s duration
- The player sees/hears: the station's radiator banks bloom to deep red heat over a minute — a slow sunrise along the spine — then vent in visible shimmering sheets and cool back to dark metal. The bloom is bright enough to silhouette any hull crossing it, and pilots use it as a backdrop.
- Payoff: visual wonder only; photography moment.
- Build seam: emissive envelope on radiator finishes (Forge emissive gain vocabulary from `lookMoods.js` LOOK_EMISSIVE_GAIN pattern); data-only.
- Effort: data

### SP3-089 — Fire the Furnace
- Kind: oneoff-mission
- Where: sector_ashfall_reach (a cold foundry near station_ashcache)
- Trigger: offered at station_ashcache; the foundry's cold stack is a map-visible place
- The player sees/hears: relight a dead foundry: tow the ignition slug from the redoubt, seat it in the firebox, and stand back as the stack takes — a rising column of furnace light that, when it catches, visibly floods the sector's ash fields with orange and sets every nearby lamp blinking in celebration.
- Payoff: plus small bonus + codex entry; the light stays as a sector feature (a proper place, not a set-dress).
- Build seam: `src/data/sectorWonders.js` build pattern (operations/payloads/receivers) + a registered place record; the relight is a sustained event light.
- Effort: bespoke

### SP3-090 — The Clockwork Yard
- Kind: world-oneoff
- Where: sector_vesta_forge (station_vesta_outlying_yard)
- Trigger: always present; every machine on the same 60 s metronome, all out of phase
- The player sees/hears: a yard where nothing idles: presses, cranes and turntables all run a visible 60-second metronome, deliberately phase-shifted so at any moment exactly one machine is at its peak stroke. Watch a full minute and you can predict which one fires next. Nobody remembers who set the phase.
- Payoff: plus codex entry; the pleasure of a learnable rhythm.
- Build seam: everyday-kit machines with simTime-mod-60 articulation (deterministic phase per machine id hash); no sim cost.
- Effort: data+glue

### SP3-091 — The Welding Constellation
- Kind: easter-egg
- Where: sector_charon_expanse (construction frame off poi_colony)
- Trigger: sim-time — third watch only
- The player sees/hears: at night watch a lone construction frame's welding drones work in a pattern that, watched from the right bearing, reads as a recognizable constellation's dots — the drones are (obviously, on inspection) just following the frame's weld schedule. The frame's plate calls it "the sky we came from."
- Payoff: plus codex entry; discoverable only at third watch from the marked bearing.
- Build seam: everyday-kit frame + drone flash timings hashed to match the pattern (pure data); the bearing is a data row.
- Effort: data

### SP3-092 — The Drill Choir
- Kind: visual-setpiece
- Where: sector_hyperion_cut (drill line, poi_hyperion_driller)
- Trigger: sim-time — mining watch start, one bass note per drill in launch sequence
- The player sees/hears: the refinery's line of six seam drills spins up in sequence — each starter throwing a light beat and a bass note a fifth below the last, so the line plays a rising chord as it comes to life. By the sixth drill the chord fills the sector; when the watch ends they fall silent in reverse.
- Payoff: visual wonder only; the most musical machine in the belt.
- Build seam: machine ignition lights (`miningContact` row) + one chord recipe composed of six `ambient_machine_*`-style oscillators in `src/data/audioRecipes.js`.
- Effort: data+glue

### SP3-093 — The Pour Announcement
- Kind: comms-event
- Where: sector_vesta_forge
- Trigger: sim-time — 30 s before each Pour (SP3-083)
- The player sees/hears: `FORGE WIRE: pour in thirty. Channel is hot. Give the spine room.` Traffic visibly clears a lane (jobs re-route), apron floods dim, and the pour runs with the lane empty — industry rehearsed.
- Payoff: plus codex entry; the announcement makes the pour an appointment.
- Build seam: worldClock popup + one traffic-reaction hook on the existing job director; all seams present.
- Effort: data+glue

### SP3-094 — The Inspection
- Kind: encounter
- Where: sector_tethys_junction (station_customs hull)
- Trigger: sim-time — third watch, proximity 150 WU of the customs hull
- The player sees/hears: a law cutter crawls the customs hull's dark side with one hard floodlight, its pool walking across plates and ribs like a slow lighthouse. Park where the beam can find you and it pauses — one long deliberate look — then moves on. Its light is the only thing moving for a mile.
- Payoff: visual wonder only; the LOOK.md "lonely lights" fantasy, embodied in an NPC.
- Build seam: NPC headlight slot (`LOOK_HEADLIGHT` npcReach pool) + patrol job row; all existing systems.
- Effort: data

### SP3-095 — The Last Anvil
- Kind: world-oneoff
- Where: sector_vesta_forge (off the freighter drift)
- Trigger: always present; hammer strokes on a fixed 9 s period
- The player sees/hears: a fully manual forge bolted to a rock: one power hammer arm, one glowing stock, a robot arm that fetches billets. The hammer falls every nine seconds with a spark crown, and has (the plate says) not stopped in thirty-one years. The sparks' light reaches the approach lane.
- Payoff: plus codex entry; a metronome landmark with a story.
- Build seam: `src/data/worldOneOffs.js` row (forge donor + articulated hammer) + spark light via `miningContact` family.
- Effort: data+glue

### SP3-096 — The Annealing Glow
- Kind: visual-setpiece
- Where: sector_vesta_forge (station_forge quench basin)
- Trigger: after event — 20 s after each Pour (SP3-083) completes
- The player sees/hears: the pour's finished plate is lifted white-hot into the quench basin: the basin erupts in a sheet of steam lit from below, and the plate cools through white to yellow to cherry to black over two minutes — a slow color ramp the whole apron watches, its light shrinking on neighboring hulls in real time.
- Payoff: visual wonder only; the physical meaning of cooling, performed.
- Build seam: emissive ramp envelope on one prop + steam via gas volume; the light shrink is just the emissive floor falling (no new lights).
- Effort: bespoke

### SP3-097 — The Bell Ringer's Apprentice
- Kind: oneoff-mission
- Where: sector_vesta_forge (the Eighth Bell)
- Trigger: offered by the bell's keeper contact after the player witnesses one unscheduled toll
- The player sees/hears: toll the Eighth Bell in the foundry's own sequence (three, rest, one) — each correct toll lights one window row of the foundry in acknowledgment, and the completed sequence leaves the rows lit for the season. Wrong order and the bell answers itself, flat.
- Payoff: plus codex entry + a persistent small light change (the lit rows) that players will recognize.
- Build seam: `src/data/landmarkMissions.js` row + lamp rows toggled via the lamp-bus gain path; audio is the existing toll recipe.
- Effort: data+glue

### SP3-098 — The Governor
- Kind: visual-setpiece
- Where: sector_ceres_belt (station_beltout flywheel)
- Trigger: sim-time — overspeed event once per season, hash-picked watch; spin-down takes 60 s
- The player sees/hears: the mining depot's flywheel governor screams over speed, sheds its safety ring (the ring tumbles away, strobing, to be recovered by a scurrying skiff), and spends a full minute visibly slowing while the yard's alarms paint it red. It settles, the ring is re-welded, the season continues.
- Payoff: visual wonder only; a machine failure with a full arc and no casualties.
- Build seam: `spawnCauseFragment` (safety-ring shard) + alarm lamp channel via lamp-bus; all pooled.
- Effort: data+glue

### SP3-099 — The Machine That Waits
- Kind: anomaly
- Where: sector_sedna_dark (off-lane)
- Trigger: proximity — 200 WU of the machine's fixed position
- The player sees/hears: a survey-class machine of no current registry cycles perfectly on the minute — one sweep, one light pulse — with no load, no task and no telemetry. Its counter's display is facing away. It has been waiting (the dust line says) for years.
- Payoff: plus codex entry; the Archive has one line about it and no more.
- Build seam: `ambient_machine_*` scan-identity audio + one prop with simTime-mod-60 articulation; data rows only.
- Effort: data

### SP3-100 — The Foundry Bell
- Kind: world-oneoff
- Where: sector_vesta_forge (station_forge gantry)
- Trigger: sim-time — struck once at each shift turn
- The player sees/hears: a cast bell the size of a cargo pod hangs from the forge gantry; at each shift turn a robot arm strikes it once — a single deep note that rolls across the yard and (because the yard is full of plates and tanks) returns a two-second echo from three directions.
- Payoff: plus codex entry; the station's heartbeat, audible from the approach.
- Build seam: audio:cue with the toll recipe pitched down + spatial echo via two delayed cues (the audio bus supports positioned, ducked cues).
- Effort: data

### SP3-101 — The Night Shift Hymn
- Kind: comms-event
- Where: sector_sker_haven (station_sker), sector_ceres_belt (station_beltout)
- Trigger: sim-time — third watch start, open channel
- The player sees/hears: over the open band, a slow four-part work song synthesized from the stations' own machinery pitches — the PA calls it "the hum arranged." Docked or close, you hear it properly; at distance it degrades into the general static like everything else.
- Payoff: plus codex entry; a new audio recipe (procedural, per GDD §9.5).
- Build seam: one oscillator-chord recipe in `src/data/audioRecipes.js` + worldClock popup keyed to the shift row.
- Effort: data

---

## F. Station life visible from space

### SP3-102 — Market Day Rush
- Kind: visual-setpiece
- Where: sector_helios_prime (station_helios), sector_ceres_belt (station_ceres)
- Trigger: sim-time — each station's market day (already hashed per berth), the 90 s rush windows
- The player sees/hears: the apron comes alive: shuttle swarms in lamp-trails queue on the approach, container racks shuffle on their crawlers, and the station's window rows brighten a step. From the lane it reads as one organism breathing faster.
- Payoff: visual wonder only; the economy made visible from outside.
- Build seam: `calendar:rushHour` hook (already emitted by worldClock) + traffic thickening + apron streaks (`spawnStationSideEventStreak`).
- Effort: data+glue

### SP3-103 — The Funeral Line
- Kind: visual-setpiece
- Where: sector_ceres_belt (refinery approach)
- Trigger: sim-time — Drift Wake (dayOfYear 7), the procession hour
- The player sees/hears: a hauler procession flies the approach with every running light dark except one bow lamp each — a chain of single points of light in formation, slow and exact. Everyone gives way; even pirates stand off the lane for the hour. The last hull carries the bunting.
- Payoff: plus codex entry; traffic behavior honors it (a lane-hold like the crossing).
- Build seam: lane-contact convoy row + lamp-bus gain override (all lamps to floor except nav-port); festival predicate from worldCalendar.
- Effort: data+glue

### SP3-104 — Festival Bunting
- Kind: visual-setpiece
- Where: any station sector
- Trigger: sim-time — festival days (the seven dayOfYear rows in worldCalendar)
- The player sees/hears: strings of colored lamps run between the station's spines — each festival its own color scheme (Founders' Day white, Ring Fair mixed trading-house colors, Quiet Night none at all) — and at night watch they carry the whole silhouette. Cheap, human, visible from a mile.
- Payoff: visual wonder only; a calendar you can see.
- Build seam: lamp strings as Forge emissive finishes (variant finish idiom from `src/data/lampChannels.js`) toggled by festival predicate.
- Effort: data

### SP3-105 — Fire Drill
- Kind: visual-setpiece
- Where: sector_tethys_junction (station_tethys), sector_ashfall_reach (station_ashcache)
- Trigger: sim-time — one drill per season per station, hash-picked watch
- The player sees/hears: red strobes walk the station hull section by section while every shuttle on the apron lifts, holds in a ranked hover, and re-docks in order. Traffic halts on the lane. Three minutes, exactly rehearsed, slightly menacing from outside.
- Payoff: visual wonder only; pairs with a dock-control popup ("exercise in progress").
- Build seam: station-side-event row (`src/data/stationSideEvents.js` SIDE_EVENTS vocabulary) + red strobe lamp finishes + traffic hold hook.
- Effort: data+glue

### SP3-106 — The Quiet Night Itself
- Kind: visual-setpiece
- Where: sector_pallas_drift (station_smuggler), sector_sker_haven (station_sker)
- Trigger: sim-time — The Quiet Night (dayOfYear 21), all day at the smuggler berths
- The player sees/hears: the smuggler berths' lamps drop to their floor gain — not dark, just... lowered — and window rows burn at half. Ships dock without floodlights. It is the one day the black market keeps its voice down, and you can see it from approach range.
- Payoff: plus codex entry ("nobody says what for").
- Build seam: lamp floor-gain override keyed by the festival row (the `breathe` channel's floor is the model); data-only.
- Effort: data

### SP3-107 — The Bargain Light
- Kind: easter-egg
- Where: sector_pallas_drift (station_smuggler)
- Trigger: sim-time — Ring Fair (dayOfYear 13) only; blinks on the station's vent spine
- The player sees/hears: one small green lamp on the smuggler station's shadow side, lit only during Ring Fair, blinking a pattern that decodes (codex) to current best margin routes — the market's oldest sign, hidden where only neighbors would look.
- Payoff: plus codex entry (the pattern is a real map hint).
- Build seam: lamp channel + codex page row; the blink pattern is authored data.
- Effort: data

### SP3-108 — The Dock Choir
- Kind: comms-event
- Where: sector_helios_prime (station_helios)
- Trigger: proximity — inside 250 WU during rush windows
- The player sees/hears: docking chatter becomes audible as texture: overlapping approach calls, berth assignments, one voice always slightly behind. It ducks under urgent cues but fills the apron approach with life.
- Payoff: visual wonder only (audio); ambient, deduped, accessibility-respecting.
- Build seam: `STATION_LIFE_AUDIO_RECIPES` (already imported into `src/data/audioRecipes.js`) + proximity gate using the station-side-event reach math.
- Effort: data

### SP3-109 — Bay Seven's Cargo
- Kind: comms-event
- Where: sector_helios_prime (station_helios bay 7)
- Trigger: sim-time — one popup per week (hash-picked watch): "unattended cargo, bay 7"
- The player sees/hears: `UNATTENDED CARGO, BAY 7. Claim or it drills.` And it is real: a tagged pod appears on the apron for one hour. First hull to latch it keeps it; the wire reports the claiming if it wasn't you.
- Payoff: plus small bonus (the pod); a weekly appointment with a payoff.
- Build seam: worldClock popup + a one-hour pickup spawn keyed to the same calendar hash (pickup acceptance path exists).
- Effort: data+glue

### SP3-110 — The Tent City
- Kind: world-oneoff
- Where: any station sector, festival days only
- Trigger: sim-time — festival days; dressing cluster spawns at the station's lee
- The player sees/hears: a cluster of habitat pods and awning frames grows at the station's lee side for the day — warm window rows, tether-line laundry, one string of lamps — and strikes again at midnight. The same families in the same spots each time (deterministic offsets).
- Payoff: visual wonder only; festivals have geography.
- Build seam: everyday/wreck kit donors from `src/data/everydaySpaceKitDressing.js` on a festival-keyed dressing stream (seeded, per the dressing salt idiom).
- Effort: data

### SP3-111 — The Searchlight Argument
- Kind: encounter
- Where: sector_ceres_belt (station_beltout apron)
- Trigger: sim-time — hash-picked watch each week, proximity 200 WU
- The player sees/hears: two tug skiffs sweep their floods around the depot's belly, darting between pylons — a stowaway chase played entirely in light. They never catch it. If the player's hull accidentally blocks a beam both floods swing to them for one accusatory second, then resume.
- Payoff: visual wonder only; slapstick at a distance.
- Build seam: two NPC headlight slots + a patrol-route pair; pure choreography data.
- Effort: data

### SP3-112 — The Roll Call
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — Drift Wake evening, open channel
- The player sees/hears: the names read slowly over the band — one per four seconds, no music, ships answering "present" between some of them. If a name the player personally saw die is read (the chronicler already records kill facts), the reading pauses on it a beat longer.
- Payoff: plus codex entry; the existing `namesForTheDead` ledger becomes audible.
- Build seam: `namesForTheDead(state)` from `src/data/discoveryPresentation.js` read as a timed comms sequence; recipe is one oscillator pad.
- Effort: data+glue

### SP3-113 — The Tug Race
- Kind: encounter
- Where: sector_sker_haven (station_sker)
- Trigger: sim-time — after Ring Fair closes, once; ~90 s
- The player sees/hears: six yard tugs, festival-bunting still attached, race a ragged circuit around the station — engines flaring, one cheating through the spar field, the crowd (every docked hull) flashing lamps as each passes. The winner takes a victory lap with its floods on.
- Payoff: visual wonder only; a once-a-year crowd scene.
- Build seam: ceresWorkfleet-style articulated tugs on a fixed circuit (racing anchor geometry idiom) + lamp-flash crowd via lamp-bus pulses.
- Effort: bespoke

### SP3-114 — The Courteous Lights
- Kind: oneoff-mission
- Where: sector_helios_prime (station_helios apron)
- Trigger: offered by a taxi-shuttle contact after the player docks three times during rush
- The player sees/hears: the taxi shuttles greet regulars with lamp patterns; the mission asks you to answer one in kind (hold your headlights in their rhythm for five seconds). When you get it right, every taxi on the apron flashes once together — the apron says hello.
- Payoff: plus codex entry + the greeting pattern becomes permanent for your hull.
- Build seam: `src/data/landmarkMissions.js` row + a headlight toggle hook (LOOK_HEADLIGHT intensity path) reading an authored pattern.
- Effort: bespoke

### SP3-115 — The Sitter
- Kind: world-oneoff
- Where: sector_charon_expanse (station_expanse viewport row)
- Trigger: always present
- The player sees/hears: one habitat pod on the station's outer ring, lamp on, oriented — as far as anyone can tell for the last nine years — exactly at the station's observation window. The pod's plate says "RESERVED." Nothing docks it; nothing moves it; the lamp never blinks.
- Payoff: plus codex entry; a two-sentence mystery.
- Build seam: `src/data/worldOneOffs.js` row, zero agency, zero rng — the file's own preferred shape.
- Effort: data

### SP3-116 — Laundry Day
- Kind: visual-setpiece
- Where: sector_tethys_junction (station_tethys), sector_io_reach (station_reach)
- Trigger: sim-time — once per week per station, hash-picked watch, ~4 minutes
- The player sees/hears: the station vents steam in fat white puffs while, on the sunward side, a line of suit figures drifts on tethers shaking out laundry sheets that catch the light like sails. The sheets flash silver when they fill. It is the least dramatic and most alive thing in the sector.
- Payoff: visual wonder only; scale contrast — the game's largest and smallest things in one frame.
- Build seam: gas puffs + cloth-line proxy props (place donors) with a simTime-keyed sway; no physics cost.
- Effort: data+glue

### SP3-117 — The Paper Plane
- Kind: easter-egg
- Where: sector_helios_prime (station_helios pod bay)
- Trigger: sim-time — one launch per year, hash-picked minute; 20 s flight
- The player sees/hears: a pod bay ejects something tiny: a folded hull plate with a lamp on it, gliding a slow arc across the apron's light, gaining speed, and burning up against the apron's heat wash in a brief silver flash. The wire never mentions it.
- Payoff: plus codex entry if witnessed (a two-line mystery: "who folds these?").
- Build seam: one small prop on a deterministic ballistic path + coat glint + one `explosionBreach` cue light at burnout; all pooled.
- Effort: data+glue

### SP3-118 — The Auction Chime
- Kind: comms-event
- Where: any station sector
- Trigger: sim-time — Ring Fair hourly marks
- The player sees/hears: a bright two-note chime from the station and a pulse of its bunting lamps (SP3-104); the starmap's market prices visibly fold/refresh at the same tick. Sound, light and economy in one heartbeat.
- Payoff: plus small bonus (fair price tilts already exist in the festival row).
- Build seam: festival `priceTilt` (already authored) + chime recipe + bunting pulse; all present seams.
- Effort: data

### SP3-119 — The Hitchhiker
- Kind: encounter
- Where: sector_io_reach (merc lane)
- Trigger: sim-time — hash-picked once per week, proximity 150 WU of the lane
- The player sees/hears: a lone EVA suit with a hand strobe drifting near the lane, arm raised, slowly tumbling. Latch it (massline) and it knocks politely on your hull — a comms line, a small fee, and it asks to be dropped at any berth. Two suits exist per seed; one of them is lying about being alive.
- Payoff: plus codex entry (the second suit is an anomaly payoff).
- Build seam: pickup entity with comms line via `contactHail` idiom + massline carry; strobe via lamp channel.
- Effort: data+glue

### SP3-120 — Grid Restart
- Kind: visual-setpiece
- Where: any station sector, after any surge ends in that sector
- Trigger: after event — surge end (SP3-060) while a station is in the sector
- The player sees/hears: the station's systems come back section by section over two minutes — each section's lamps waking with a soft double-flash as its channel re-energizes, the whole hull reading like a city restoring power district by district. The last section to wake is always the bars.
- Payoff: visual wonder only; chains the weather arc into station life.
- Build seam: lamp-bus section wake sequence keyed to the same phase-flip event as SP3-060; data rows name the section order.
- Effort: data+glue

---

## G. Death & aftermath

### SP3-121 — The Reactor Bloom
- Kind: visual-setpiece
- Where: any sector (capital deaths)
- Trigger: after event — capital-class kill (existing death-tier thresholds)
- The player sees/hears: the reactor's white-blue rupture flash — already calibrated (`explosionReactorRupture`) — extended by two delayed light beats rolling fore and aft along the hull, so the death reads as a wave passing through the ship rather than one bang. The beats land on nearby hulls; the dark drinks the rest.
- Payoff: visual wonder only; the game's best existing effect, given a second sentence.
- Build seam: `emitDestructionLightBeats` in `src/render/vfx.js` (already subscribed to `entity:killed`) — one data row extends beat count/delay by death tier.
- Effort: data

### SP3-122 — The Magazine
- Kind: visual-setpiece
- Where: any sector
- Trigger: after event — a hull flagged munitions-heavy dies intact
- The player sees/hears: no immediate blast: ten seconds of interior flashes through the wreck's window rows — cook-off lighting the ship from inside, room by room — then the magazine goes and the hull opens along its seams in one slow bloom.
- Payoff: visual wonder only; dread instead of noise.
- Build seam: window-row emissive sequence via lamp-bus + delayed rupture via the existing phased-explosion vocabulary (`emitExplosionPhase`).
- Effort: data+glue

### SP3-123 — The Cooling Cinder
- Kind: visual-setpiece
- Where: any sector
- Trigger: after event — any capital kill
- The player sees/hears: the largest surviving fragment glows reactor-blue and cools through the black-body colors over three minutes — a visible clock on the wreckage. Its light lands dimly on neighboring debris. Salvagers read its color from across the field to time their approach.
- Payoff: visual wonder only; honest thermal aftermath.
- Build seam: emissive ramp on the wreck's largest donor plate (`wreckAftermathDressing` fresh variants) keyed to simTime since death; persisted via the wreck record.
- Effort: data+glue

### SP3-124 — The Paint Tally
- Kind: encounter
- Where: any sector (post-battle)
- Trigger: after event — 90 s after a 3+ hull battle ends, proximity 400 WU
- The player sees/hears: a lone painter-skiff with two floodlights tours the fresh wrecks, spraying a small colored mark on each hull it catalogs — each mark's color naming the faction that will claim it. It does not strip anything. It just makes the field legible, and it flashes its floods once at you if you watch politely.
- Payoff: plus codex entry; claim marking made visible (claims system exists).
- Build seam: aftermathWreck marker records + a two-light NPC; marks are decal-colored donor plates.
- Effort: bespoke

### SP3-125 — The Open Vault
- Kind: visual-setpiece
- Where: any sector
- Trigger: after event — a cargo-heavy hauler dies
- The player sees/hears: the hold splits along its doors and the cargo spills in a slow bloom — pallets tumbling into the light, each carrying its own tiny strobe, the whole cloud glittering as it spreads. It reads less like wreckage than a hand opening.
- Payoff: plus small bonus (the pallets are the loot); visual grammar for the existing cargo-drop event.
- Build seam: cargo drop path + strobe lamp finishes on pod donors; light beats via `pickup` row.
- Effort: data+glue

### SP3-126 — The Long Fall
- Kind: visual-setpiece
- Where: sector_tethys_junction (Anvil)
- Trigger: sim-time — a seeded dead section falls sunward for two seasons; burns on a fixed day (one-time per seed)
- The player sees/hears: a station section the Anvil's influence caught drifts visibly lower across the skim corridor, week by week, until on the appointed day it takes the reentry band: a three-minute line of fire across the storm band, heard even in the bar as a rising hiss on the open channel.
- Payoff: plus codex entry; a scheduled, sector-defining death.
- Build seam: a durable world-record body with seeded decay + the existing reentry heat/plasma presentation from `src/data/planets.js`.
- Effort: bespoke

### SP3-127 — The Echo Wreck
- Kind: anomaly
- Where: sector_io_reach (Cruiser Graveyard, one seeded hull)
- Trigger: proximity — inside 100 WU, the echo loops on a 60 s cycle
- The player sees/hears: the wreck's window rows and lamp channels replay, in light only, its final minute — a scan sweep, a panic of strobes, a blackout walking bow to stern — then hold dark for forty seconds before repeating. Sensors insist the hull is cold.
- Payoff: plus codex entry (anomaly); the Archive pays for its recording.
- Build seam: lamp-bus envelope sequence authored on one wreck package (data rows only); the loop is pure simTime modulo.
- Effort: data+glue

### SP3-128 — The Pilgrim's Rest
- Kind: world-oneoff
- Where: sector_pallas_drift (reef field)
- Trigger: always present; one plate per season, deterministic
- The player sees/hears: a dead tug with dozens of hull plates welded to its flanks like votives — each plate a crew's mark, name and sector stamped, the newest still bright-edged. Someone left a working lamp on the stern, powered by a scrap panel, that has not gone out.
- Payoff: plus codex entry; one plate per season means returning pilots see it grow.
- Build seam: `src/data/worldOneOffs.js` row + plate donors; the growth is a seeded-count read.
- Effort: data

### SP3-129 — The Loss Notice
- Kind: comms-event
- Where: any sector
- Trigger: after event — any named NPC hull the player personally saw die, read on the next day's wire
- The player sees/hears: `LOST: the Harriet Wren, with all records. Killed in the Belt under flags of trade.` One line, the chronicler's voice, for hulls the player witnessed — the game remembering that you were there.
- Payoff: plus codex entry; consequences rendered as memory.
- Build seam: chronicler kill facts (already recorded) + worldClock news on the day boundary; zero new sim.
- Effort: data+glue

### SP3-130 — The Scuttle
- Kind: visual-setpiece
- Where: any sector
- Trigger: after event — a captained NPC hull dies while disabled, not destroyed (seeded crew choice)
- The player sees/hears: the captain scuttles with ceremony: engines flare once to center the hulk, every lamp dies in bow-to-stern order, the comms band carries one clipped sentence, and only then does the scuttle charge open the spine. A death with manners.
- Payoff: plus codex entry; witnessable repeatedly, never identically.
- Build seam: kill-path variant keyed to entity data flag + lamp-bus extinguish sequence + one comms popup; all pooled systems.
- Effort: data+glue

### SP3-131 — The Survivor's Lamp
- Kind: encounter
- Where: any sector (post-engagement)
- Trigger: after event — a crew-pod ejects from any kill; 4-minute life window
- The player sees/hears: a pod with one hand strobe blinking a slow, manually operated pattern — not quite SOS, just "here." Latch it and the strobe goes steady (calm). Tow it to any berth and the pod's lamp joins the station's bunting for a day. Miss the window and the strobe's last blink is the only record.
- Payoff: plus small bonus + reputation nod; a mercy mechanic rendered entirely in light.
- Build seam: payload entity + lamp states + docking receipt; no new systems beyond data rows.
- Effort: data+glue

### SP3-132 — The Beacon's Last Light
- Kind: world-oneoff
- Where: any wreck field
- Trigger: after event — a wreck record reaches fully-stripped state (salvage completed)
- The player sees/hears: the wreck's marker lamp — which has burned steadily since the wreck was logged — dims, blinks twice, and goes dark for good. The field is officially done. Scavengers' go-lamps stand down one by one after it.
- Payoff: plus codex entry; the end of a story told by one lamp.
- Build seam: aftermathWreck record state → lamp removal; the marker lamp already exists in the wreck dressing path.
- Effort: data

### SP3-133 — The Last Photograph
- Kind: oneoff-mission
- Where: sector_kepler_scar (a named famous wreck slated for breaking)
- Trigger: offered at the nearest station while the breaker convoy is en route (posted on the wire)
- The player sees/hears: "Before the breakers take her — one clean frame." The breakers arrive on schedule and begin cutting with visible arcs; your window is the hours before or the moments between cuts. The final exposure is taken with a cutter's light mid-arc behind the hull.
- Payoff: photography moment + codex entry + small bonus; the wreck then becomes a normal stripped site.
- Build seam: `src/data/landmarkMissions.js` row + breaker convoy (workfleet idiom) with a schedule; photo capture via the scan pulse.
- Effort: bespoke

### SP3-134 — The Debris Halo
- Kind: anomaly
- Where: any sector
- Trigger: after event — any destruction; a 6 s window while fresh debris disperses
- The player sees/hears: the newborn debris cloud catches the key light as a brief expanding ring of glints — one clean halo — before individual fragments separate and the ring dissolves into ordinary wreckage. Every death in the game has six seconds of terrible beauty.
- Payoff: visual wonder only; already half-true in the current burst visuals, formalized here.
- Build seam: `spawnCollisionThrowSpray`/shard pool with an authored first-second sun-alignment pass (sprite-batch material exists); a data row, not new code.
- Effort: data

### SP3-135 — The Uncooling Wreck
- Kind: anomaly
- Where: sector_veil_nebula (radiation belt edge)
- Trigger: proximity — one seeded wreck, permanent
- The player sees/hears: one wreck in the Belt never cools: a faint reactor-orange warmth persists along its spine years after its death, and frost refuses to form on it even where every neighboring hull is rimmed white. Touch its hull (massline) and the warmth pulses once, like a pulse.
- Payoff: plus codex entry (anomaly); a landmark of wrongness.
- Build seam: wreck record flag + a persistent low emissive on the donor plate; pulse via lamp-bus on latch event.
- Effort: data+glue

### SP3-136 — The Bell Tolls for You
- Kind: visual-setpiece
- Where: any sector (player death)
- Trigger: after event — `player:death`
- The player sees/hears: as your own hull breaks (the existing death explosion), the audio duck drops everything except a single distant bell tolling once — spatialized to the nearest station, not to you — and the last frame holds half a beat longer than the current cut. Your death gets the same grammar as the wrecks you've watched.
- Payoff: visual wonder only; closure, not punishment.
- Build seam: `player:death` subscription in `src/render/vfx.js` already fires the explosion; add the audio duck + toll cue on the same event.
- Effort: data+glue

---

## H. Audio moments

### SP3-137 — The Belt Heartbeat
- Kind: visual-setpiece
- Where: sector_the_bolus (approach)
- Trigger: proximity — inside 900 WU of the Bolus throat
- The player sees/hears: a sub-bass pulse every eight seconds, felt before heard, and the HUD's band edges breathe with it — the whole sector contracting on the Bolus's rhythm. Match your thrust to the pulse and your approach is measurably smoother (the biology calms to matched motion).
- Payoff: plus codex entry (bio-rhythm); a mechanic taught entirely by sound.
- Build seam: one low oscillator recipe with simTime-mod-8 gate in `src/data/audioRecipes.js` + proximity gate (discoverySound's existing cast/proximity idiom).
- Effort: data+glue

### SP3-138 — The Hum at Sker
- Kind: easter-egg
- Where: sector_sker_haven (one seeded bearing off the black market)
- Trigger: proximity + stillness — hold position (thrust under 5%) inside the 80 WU zone for 30 s
- The player sees/hears: a low hum you half-noticed all over Sker resolves, at exactly this bearing, into a slow melody — the yard's cranes, pumps and welders are all (it turns out) in tune, and from here they compose. Move, and it degrades back into machinery.
- Payoff: plus codex entry; a listening place in the loudest sector.
- Build seam: proximity+stillness gate → duck all other audio and unmute a chord mix of existing ambient recipes; pure audio-bus work.
- Effort: data+glue

### SP3-139 — The Tether Note
- Kind: visual-setpiece
- Where: any sector
- Trigger: after event — massline held at above 95% alignment with the key light's bearing for 3 s
- The player sees/hears: the taut line begins to sing — a clean harmonic that rises with tension — and the line itself shows a faint standing-wave shimmer. Cut it at the peak and the note resolves down a fifth. A perfectly useless, perfectly physical instrument.
- Payoff: plus codex entry ("the pilot's tuning fork").
- Build seam: tension telemetry already exists on the massline; one oscillator keyed to it + shimmer via the existing cable surface vocabulary (`masslinePresentation` family).
- Effort: data+glue

### SP3-140 — Meteor Hiss
- Kind: visual-setpiece
- Where: any weather sector during meteor_shower surges
- Trigger: proximity — each meteor slot passing within 300 WU of the player
- The player sees/hears: passing stones drag a doppler hiss across your hull — pitch rising as they close, falling as they pass — so the shower becomes audible space-traffic. Close calls get a whip-crack and a light beat on your hull from the stone's glow.
- Payoff: visual wonder only; situational awareness through sound.
- Build seam: audio:cue with doppler rate on the weatherMeteors slot entities (positions already tracked); cue rate-limited by the discoverySound throttle idiom.
- Effort: data+glue

### SP3-141 — The Whisper Buoy
- Kind: anomaly
- Where: sector_charon_expanse (lane marker, poi_charon_lung_marker)
- Trigger: proximity — inside 100 WU, one replay per visit
- The player sees/hears: the lane marker's speaker crackles and plays forty seconds of year-old traffic chatter — real recorded-idiom voices from the sector's own contact ledger, degraded — then stops mid-word. The wire has no comment. It does this once per visit, never the same transcript twice in a row.
- Payoff: plus codex entry; the lane's memory.
- Build seam: comms popup sequence with degraded audio recipes (bandpass + noise recipes exist) fed from contact deed memory (`src/data/contactDeedMemory.js` exists as a ledger).
- Effort: bespoke

### SP3-142 — The Chime Field
- Kind: visual-setpiece
- Where: sector_ceres_belt (Ceres Prism Gallery, `optic_ceres_prism_gallery`)
- Trigger: after event — any bolt lighting the optic lattice
- The player sees/hears: as the splinters walk the fuse, each diamond struck rings — pitch by material, position by pan — so the optic fight plays itself as a chord progression across the lattice. The full gallery lit at once is a glissando.
- Payoff: plus codex entry; the optic structures become an instrument.
- Build seam: optic-field hit events already fire; map hit order to one pentatonic oscillator set in `src/data/audioRecipes.js`; pan by cell position.
- Effort: data+glue

### SP3-143 — The Choir Trawl
- Kind: encounter
- Where: sector_charon_expanse (colony approach)
- Trigger: sim-time — first watch, proximity 300 WU of the approach lane
- The player sees/hears: a hauling convoy sings on the open band — a work song in four rough synthesized voices, one per hull, each slightly out of sync with its engine pitch. Formate on them and your engine's hum is folded into the mix as the fifth voice (the mix honestly reads your thrust).
- Payoff: plus codex entry; music made from machinery, GDD §9.5's hybrid ideal.
- Build seam: four oscillator recipes phase-locked to engine pitch + formation predicate; the convoy is a lane-contact row.
- Effort: bespoke

### SP3-144 — The Time Signal
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — at every station's shift turn, the station broadcasts a four-note time signal
- The player sees/hears: four notes, the same four, every time, pitch-shifted per station so each berth has its own voice — after a few days you can tell whose clock you're hearing blind. Docked, the chime comes from the station's direction in space.
- Payoff: plus codex entry (station pitch table); the calendar made audible.
- Build seam: `stationShiftAt` gate + one four-note recipe transposed by the existing station-offset hash (`stationOffsetS` in `src/data/worldCalendar.js`).
- Effort: data

### SP3-145 — The Jukebox Ghost
- Kind: easter-egg
- Where: any bar (docked, Pale Holiday)
- Trigger: sim-time — The Pale Holiday (dayOfYear 33), one play per sitting, hash-picked minute
- The player sees/hears: the bar's ambient mix cuts and something plays — a slow, wrong-temperature melody that no recipe in the catalog matches, ending with the jukebox's mechanical reset clunk. The barkeep's line: "Nobody loaded that."
- Payoff: plus codex entry; the one unexplained audio artifact in the game.
- Build seam: one authored "wrong" recipe (detuned, off-scale) gated by the festival row + the barContact system for the line.
- Effort: data

### SP3-146 — The Resonant Rock
- Kind: world-oneoff
- Where: sector_pallas_drift (reef field)
- Trigger: proximity + interaction — mining beam or massline latch on the named boulder
- The player sees/hears: the reef's largest rock rings — a deep bell tone whose pitch depends on where you strike it (its size gives it a scale), each strike flashing a faint surface shimmer that ripples across the rock's face. Miners use it to tune their drills, they claim.
- Payoff: plus codex entry; an instrument you mine.
- Build seam: one prop with strike-pitched audio:cue + surface shimmer via the seam-marker pipeline; data rows pick pitches by hit offset.
- Effort: data+glue

### SP3-147 — The Doppler Festival
- Kind: comms-event
- Where: sector_sker_haven (after the tug race, SP3-113)
- Trigger: sim-time — race end; 30 s of the field's engine doppler mixed from the apron
- The player sees/hears: the race's engines sweep past in one long doppler cluster — you hear the whole circuit from the apron as rising and falling pitch traffic, the crowd's lamp flashes (SP3-113) synced to the loudest passes.
- Payoff: visual wonder only (audio); the race exists even if you never watch a lap.
- Build seam: existing engine audio + one apron-positioned mix layer gated by the race window.
- Effort: data

### SP3-148 — The Silence Room
- Kind: anomaly
- Where: sector_sedna_dark
- Trigger: proximity — a fixed-seed 60 WU sphere
- The player sees/hears: crossing the boundary, all audio falls away mid-syllable — not ducked, gone, including your own engine — while the visuals continue untouched. Inside, the only sensation is a faint high tone that (the codex suggests) is your own ship complaining. Exit restores sound with a half-second of reversed echo.
- Payoff: plus codex entry; the loudest quiet in the game.
- Build seam: audio master gate keyed by a seeded zone (same predicate shape as SP3-046); the reversed echo is a bus-side trick, no new content.
- Effort: data+glue

### SP3-149 — The Toll Echo
- Kind: visual-setpiece
- Where: sector_vesta_forge (the Eighth Bell's field)
- Trigger: after event — each toll of the Eighth Bell
- The player sees/hears: two seconds after each toll, the field's rocks answer — the echo spatialized to three boulder clusters around the bell, each returning the note slightly detuned by its size. Stand in the right spot and the echoes phase into a chord.
- Payoff: plus codex entry; acoustic geometry as a place.
- Build seam: three delayed positioned audio:cue copies keyed to the toll event; the "right spot" is real geometry (player pos vs clusters).
- Effort: data

### SP3-150 — The Singing Wires
- Kind: encounter
- Where: sector_kepler_scar (two wrecks joined by a cargo line)
- Trigger: sim-time — solar_wind weeks; always faintly audible inside 200 WU
- The player sees/hears: two dead hulls, still connected by someone's forgotten tow line, sing in the wind — a rising whine that cracks into harmonics as gusts pass, occasionally thrumming a note strong enough to visibly vibrate the cable. Cut the line and the song ends forever (the wrecks drift apart).
- Payoff: plus codex entry; a one-time choice rendered in audio.
- Build seam: tether cable substrate (existing) + wind-pitched oscillator keyed to the weather phase; the cut is a permanent world-record note.
- Effort: data+glue

### SP3-151 — The 40-Day Chord
- Kind: easter-egg
- Where: any sector
- Trigger: sim-time — the last minute of every 40-day year (day 40, third watch end)
- The player sees/hears: every station's time signal (SP3-144) fires at once — and because each is transposed differently, the overlap resolves into one broad chord that swells and decays over the minute's last seconds. The new year begins in the silence after it.
- Payoff: plus codex entry; the calendar's one big cadence.
- Build seam: calendar year-boundary tick + the SP3-144 recipes stacked; zero new content beyond the gate.
- Effort: data

### SP3-152 — The Quiet Watch
- Kind: visual-setpiece
- Where: any sector
- Trigger: sim-time — third watch, all sectors, every day
- The player sees/hears: the music stems drop to a single low pad and ambient sound thins — the mix itself performs the night watch, so even the HUD feels like it's whispering. Paired with the Long Twilight (SP3-018), night becomes a full-body mode.
- Payoff: visual wonder only; the day/night cycle reaches the mix.
- Build seam: MUSIC_STEMS layering already exists in `src/data/audioRecipes.js`; a watch-keyed stem gain row.
- Effort: data

---

## I. Deep anomalies & odd light

### SP3-153 — The Folding Star
- Kind: anomaly
- Where: sector_triton_wake
- Trigger: proximity — inside 600 WU of the seeded point; resolves at 200 WU
- The player sees/hears: one star in the wake's deep field is doubled — two points a hair apart — and as you close they slowly slide together and become one, like a focus pull. The codex offers three hypotheses and refuses to choose.
- Payoff: plus codex entry; pure perception play.
- Build seam: background structure star association row (the star vocabulary in `src/data/sectorVisualProfiles.js`) with a proximity-keyed split; data-only.
- Effort: data

### SP3-154 — The Dark Comet
- Kind: anomaly
- Where: sector_sedna_dark, sector_orcus_shadow
- Trigger: sim-time — every third season, a three-day crossing
- The player sees/hears: a comet crosses whose tail is darkness — a lane of occluded stars gliding across the sky with a faintly darker-than-space head, visible only by what it blocks. Instruments show nothing. It never hits anything; it just erases, then returns the stars.
- Payoff: plus codex entry; the negative of SP3-005.
- Build seam: background structure void-warp row keyed to the third-season gate; the star field machinery already supports voidFloor shaping.
- Effort: bespoke

### SP3-155 — The Slow Lens
- Kind: anomaly
- Where: sector_proteus_well
- Trigger: proximity — the arc is fixed-seed, 300 WU across
- The player sees/hears: stars near one empty point smear into short arcs pointing around it — a lens with no visible mass — and hulls passing through the arc's line catch a faint blue rim on the side facing the point. Fly the exact line and your predictor bows for one second.
- Payoff: plus codex entry; gravitational lensing as a place.
- Build seam: background structure warp field (region-locked, the `warp` field exists) + one bounded well kernel registered like `PLANET_SITE.field` in `src/data/planets.js`.
- Effort: bespoke

### SP3-156 — The Color Thief
- Kind: anomaly
- Where: sector_nyx_march (crosswind lane)
- Trigger: proximity — a fixed-seed 150 WU patch
- The player sees/hears: inside the patch every color desaturates — hulls, lamps, your own drives — while brightness and shape stay exact. Exit restores full chroma in one step, and for a moment the whole sector looks freshly painted. The Archive's survey tag reads "chroma boundary, unmoved since logging."
- Payoff: plus codex entry; a post-processing place.
- Build seam: zone-locked post saturation/vibrance override via the `resolveLookPost` path in `src/data/lookMoods.js` (DIRTY — author as overlay data); zone row in sectorZones.
- Effort: bespoke

### SP3-157 — The Pulse Source
- Kind: anomaly
- Where: sector_veil_nebula (deep field)
- Trigger: proximity — a violet pulse every 13 s from a point no chart names
- The player sees/hears: out in the deep field, one violet pulse every thirteen seconds — visible, timed, and triangulable: take two bearings from two positions and the lines cross somewhere that is (of course) not there when you arrive. The pulse continues from the next point over.
- Payoff: plus codex entry; the Archive's standing riddle.
- Build seam: pooled pulse sprite (`cue` light row) with a seeded, slowly migrating position (pure hash-of-season); data rows only.
- Effort: data+glue

### SP3-158 — The Beacon That Isn't
- Kind: anomaly
- Where: sector_ashfall_reach
- Trigger: proximity — it moves 1 WU per season along a fixed line
- The player sees/hears: a navigation light of exactly the standard pattern blinks in open space, catalog-clean, no hull — and it is moving, one world-unit per season along a bearing that (plotted across visits) aims out of the sector. Cartography has flagged it and declined to follow.
- Payoff: plus codex entry; its plotted track is itself a collectible.
- Build seam: lamp-finish sprite + position from a season-hash step function; the codex entry draws the track from the same pure function.
- Effort: data

### SP3-159 — The Static Ship
- Kind: anomaly
- Where: sector_eunomia_gulf
- Trigger: proximity — permanent, one seeded hull
- The player sees/hears: a mid-size freighter holding perfect station for years — no drift, no rotation, lamps in their standard pattern — except that its shadow falls the wrong way, one hull-length displaced from the sun's geometry. Scan it and the return comes back clean, tagged, and dated next year.
- Payoff: plus codex entry (anomaly).
- Build seam: worldOneOffs row (zero agency, the file's preferred shape) + one authored shadow-offset on the package (renderer request).
- Effort: bespoke

### SP3-160 — The Prism Hour
- Kind: visual-setpiece
- Where: sector_ceres_belt (Ceres Prism Gallery)
- Trigger: sim-time — the once-per-day minute when the key light's bearing enters the gallery's authored fuse axis
- The player sees/hears: for one minute the whole gallery lights passively: each diamond splits the rake into colored fans that land on the surrounding stone walls — the lattice becomes a kaleidoscope you can fly through, no bolt required. The minute ends and the gallery goes back to being a trap.
- Payoff: visual wonder only; turns a combat site into a daily appointment.
- Build seam: optic-lattice hit-visualization (the splinter color path in `src/combat/opticField.js` vocabulary) driven by a light-bearing predicate; data rows name the minute.
- Effort: bespoke

### SP3-161 — The Mirror Escort
- Kind: encounter
- Where: sector_phoebe_echo (Echo Shrine approach)
- Trigger: proximity — 400 WU of the shrine; the pair performs while observed
- The player sees/hears: two identical unmanned hulls fly perfect mirrored paths around an empty point between them — every turn reflected, every lamp flash paired — as if orbiting something the shrine declines to name. Approach the point and both peel away in opposite directions, lamps dark.
- Payoff: plus codex entry; the shrine's mystery given choreography.
- Build seam: two doctrine-driven drones with mirrored route rows; doctrine tells exist (`spawnDoctrineTellPulse`).
- Effort: data+glue

### SP3-162 — The Triangulation
- Kind: oneoff-mission
- Where: sector_veil_nebula (the Pulse Source, SP3-157)
- Trigger: offered by the Archive after the player logs the pulse from two different positions
- The player sees/hears: "Two bearings. One fix. Bring the coordinates." Take the two logs (any two positions, any two pulses), and the Archive computes a fix — which the mission then asks you to photograph at the next pulse. The fix's plate shows your own two bearing lines, correct and useless.
- Payoff: plus codex entry + small bonus; teaches the mechanic it rewards.
- Build seam: `src/data/landmarkMissions.js` row family + scan logs (scanner authority precedent in the same file).
- Effort: data+glue

### SP3-163 — The Wrong Weather Patch
- Kind: anomaly
- Where: sector_helios_prime (one 40 WU patch off the tutorial lane)
- Trigger: proximity — permanent
- The player sees/hears: one small patch of Helios behaves like an ion-storm cell every day regardless of the season — crawling static, curtain flickers, a forecast that insists it is clear. The patch is exactly the footprint of a station that isn't there anymore.
- Payoff: plus codex entry; weather as archaeology.
- Build seam: a weather-volume footprint with no volume registered (data row + the field-kernel boundary presentation only).
- Effort: data+glue

### SP3-164 — The Glitter Path
- Kind: anomaly
- Where: sector_kepler_scar (debris arc)
- Trigger: sim-time — once per day, a four-minute specular walk crosses the arc
- The player sees/hears: the sun angle crosses the debris arc's plane and a chain of glints walks the whole field, fragment by fragment, a fuse of reflected light moving at walk speed — the arc visibly lit end to end for the first time. Pilots who know the minute fly the path with it.
- Payoff: plus codex entry; the field's one daily beauty.
- Build seam: pure geometry (existing coat response on debris donors); a data row for the daily minute + a wire bulletin (SP3-019 pattern).
- Effort: data

### SP3-165 — The Dark Survey
- Kind: oneoff-mission
- Where: sector_proteus_well (the Slow Lens, SP3-155)
- Trigger: offered by the Archive once the lens arc is in the player's chart
- The player sees/hears: three survey marks ring the lens; photograph the arc from each. Each exposure shows the star field with the arcs recentered on the mark — three plates that, laid side by side (the codex does this), prove the lens moved between shots.
- Payoff: photography moment + codex entry + small bonus.
- Build seam: `src/data/landmarkMissions.js` row with three `targetLocalPos` steps (the CAVED_SHAFT probe pattern scaled).
- Effort: data

### SP3-166 — The Twin Flash
- Kind: anomaly
- Where: sector_ashfall_reach
- Trigger: sim-time — two flashes 180 degrees apart, exactly 2.0 s apart, from the same point, every 40 s
- The player sees/hears: from one unremarkable empty point: flash, count two, flash — antiphase, metronome-exact, each flash's light landing briefly on the field below. The Iron Maw's pickets log it. Nobody has gone to look twice.
- Payoff: plus codex entry.
- Build seam: paired `cue` lights on a 40 s simTime gate; a seeded point row.
- Effort: data

### SP3-167 — The Surveyor's Rest
- Kind: world-oneoff
- Where: sector_phoebe_echo (off the shrine approach)
- Trigger: always present
- The player sees/hears: an old survey buoy with a folding chair welded beside it and a mug rail holding three mugs — one for each shift, the plate says. The buoy's lamp is warm, not standard white. Someone's whole career fits in a 12 WU circle.
- Payoff: plus codex entry.
- Build seam: `src/data/worldOneOffs.js` row (buoy + chair donors), zero agency.
- Effort: data

### SP3-168 — The Number Station
- Kind: comms-event
- Where: sector_sedna_dark
- Trigger: sim-time — daily at a hash-picked minute, open channel
- The player sees/hears: a flat voice reads seven digits, pauses, reads seven more, and signs off with no callsign. Across days the numbers (the codex discovers) count something real: the digit pairs match the sector's weather phases, three ahead. It is a forecast, sent to no one.
- Payoff: plus codex entry (a real, if odd, forecast source).
- Build seam: worldClock timed popup + `weatherSeasonAt` read three seasons out (pure); voice is one degraded recipe.
- Effort: data+glue

### SP3-169 — The Phantom Patrol
- Kind: encounter
- Where: sector_sker_haven
- Trigger: sim-time — hash-picked watch each week; radar-only until hailed
- The player sees/hears: a patrol blip on radar holding formation in open dark — nothing visible, no lamps, no hull — until you hail it, at which point three law hulls light up exactly where the blips were, floods on, and conduct a perfectly routine inspection as if they had been visible the whole time.
- Payoff: plus codex entry; the law's oldest trick.
- Build seam: patrol presence template with a lamps-off state until hailed (lamp-bus gain gate keyed to hail receipt).
- Effort: data+glue

### SP3-170 — The Breath of the Veil
- Kind: anomaly
- Where: sector_veil_nebula (whole sector)
- Trigger: sim-time — a 600 s brightening/darkening swell across the nebula plates
- The player sees/hears: the Veil's background fog visibly inhales and exhales on the sector-day cycle — plate strength swelling a step, then settling — so the sector has a resting respiration you stop noticing until you dock for a while and come back out to find it mid-breath.
- Payoff: plus codex entry; the sector as organism.
- Build seam: plate `strength` sinusoid keyed to `simTime % WEATHER_DAY_S` in the paintedSky/sky resolve path of `src/data/sectorVisualProfiles.js`.
- Effort: data

### SP3-171 — The Pixel Star
- Kind: easter-egg
- Where: sector_triton_wake
- Trigger: always present; catalog-only until scanned from within 100 WU
- The player sees/hears: one star in the wake is too bright for its magnitude — a single sharp point in the deep field that no parallax ever moves. Scanned up close it resolves to the oldest navigation beacon in the chart, still burning on a scrap panel, its registration plate older than the colony.
- Payoff: plus codex entry + the chart updates (a real place, registered properly).
- Build seam: background star row + a chartable place record (atlas gates per `src/data/PLACE_REGISTRATION.md`).
- Effort: data+glue

### SP3-172 — Shadow Bands
- Kind: anomaly
- Where: sector_ceres_belt (during the Umbra Minute, SP3-002)
- Trigger: sim-time — the eclipse's partial phases
- The player sees/hears: during the partial phase, the belt's dust shows moving bands of light and shade — ripples of brightness walking across rock fields a minute before the umbra, like light through water. They reverse as the eclipse releases.
- Payoff: visual wonder only; the eclipse gains a preamble and a coda.
- Build seam: gas-volume brightness ripple keyed to the eclipse envelope (same calendar gate as SP3-002); data-only.
- Effort: data+glue

### SP3-173 — The Standing Watch
- Kind: oneoff-mission
- Where: sector_nereid_shoal (the automated watcher)
- Trigger: offered after the player observes the watcher's full 600 s cycle twice
- The player sees/hears: an automated watch post that scans the shoal on the hour, every hour; the mission is to relieve it — dock your lamp signal to its pattern, hold through one full watch (ten minutes) in its blind spot, and it stands down to you for one shift, its floods bowing to your hull before it resumes.
- Payoff: plus codex entry + the post answers your hail for the season.
- Build seam: `src/data/landmarkMissions.js` row + a lamp-pattern exchange (the SP3-114 mechanic) on a 600 s schedule.
- Effort: bespoke

### SP3-174 — The Cold Fire
- Kind: anomaly
- Where: sector_haumea_rift (fissure edge)
- Trigger: proximity — permanent, licking one seeded cold wreck
- The player sees/hears: green aurora-fire plays over one wreck's hull — flame-shaped, slow, feeding on nothing — and where it touches, frost blooms instead of melting. The fissure's harp chords (SP3-049-adjacent site) ring flat when it flares.
- Payoff: plus codex entry; wrongness with a physical grammar.
- Build seam: gas-volume flame layer + frost rim (cold_drift surface values) on one wreck package; audio detune on the harp site.
- Effort: bespoke

### SP3-175 — The Broken Clock
- Kind: world-oneoff
- Where: sector_rhea_cinder (station_rhea_slag apron)
- Trigger: always present
- The player sees/hears: a station clock frozen at one minute past a shift turn — and everything on this apron genuinely runs 47 seconds late: shifts, pour announcements, even the vending lights. Crews set their watches by the frozen clock and are right.
- Payoff: plus codex entry; a joke the calendar honors.
- Build seam: a station-scoped +47 s offset on the existing `stationOffsetS` hash path (`src/data/worldCalendar.js`), plus the clock prop; data-only.
- Effort: data+glue

### SP3-176 — The Ghost Hail
- Kind: comms-event
- Where: sector_eunomia_gulf
- Trigger: sim-time — once per season, hash-picked watch
- The player sees/hears: a hail arrives from a hull the registry lists as scrapped eight years ago — a voice with the wet-audio artifact of a failing suit mic, one sentence of small talk, then clean static. The registry's page for the hull now shows one extra line: "answers sometimes."
- Payoff: plus codex entry.
- Build seam: contactHail idiom + a registry-flagged ghost contact (world.records row); audio is one degraded recipe.
- Effort: data+glue

### SP3-177 — The Aurora Ladder
- Kind: anomaly
- Where: sector_veil_nebula (surge peak only)
- Trigger: sim-time — the last 30 s of an ion surge
- The player sees/hears: the aurora curtains stack vertically for the surge's last half-minute — five bright rungs of light standing on the horizon — and their light visibly lands on hulls rung by rung, a ladder the sector climbs before the Clearing (SP3-060) wipes it.
- Payoff: visual wonder only; the weather arc's final chord.
- Build seam: gas-volume curtain layering (vertical offset stack) keyed to the surge tail; light landing via the sustained event-light slot.
- Effort: data+glue

### SP3-178 — The Vanishing Field
- Kind: anomaly
- Where: sector_nyx_march
- Trigger: per visit — the field is N rocks smaller each visit (seeded ledger)
- The player sees/hears: a rock field that is measurably smaller every time — and somewhere else in the sector, the missing rocks are found arranged in a neat row, numbered in survey paint, facing away from everything. The count is exact, the arrangement is exact, the reason is absent.
- Payoff: plus codex entry; a mystery with an audit trail.
- Build seam: seeded per-visit count ledger (the discovery-bag pattern: `state.world.discovery[sectorId]`) + row placement from the same seed stream.
- Effort: bespoke

---

## J. Calendar, comms & easter eggs

### SP3-179 — The Year Bell
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — day 40, first watch
- The player sees/hears: every station's bell (SP3-100 family) tolls once, staggered across the sectors' offsets, and the wire posts your year in numbers — distance, tonnage, hulls, names — in the chronicle's dry voice. The 40-day chord (SP3-151) closes the minute.
- Payoff: plus codex entry; a save-worthy moment every year.
- Build seam: calendar year gate + worldClock news + existing bell recipes; zero new sim.
- Effort: data

### SP3-180 — The Toll of Names
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — Drift Wake evening
- The player sees/hears: the roll call (SP3-112) reaches a name, and if the player witnessed that death the reading pauses — a full two-second silence with the name held on screen — before continuing. Nobody else's names get the pause.
- Payoff: plus codex entry; personal consequence inside a public ritual.
- Build seam: the SP3-112 sequence with a witness check against chronicler facts (already recorded); data+glue.
- Effort: data+glue

### SP3-181 — The Founder's Letters
- Kind: easter-egg
- Where: sector_helios_prime (station_helios)
- Trigger: sim-time — Founders' Day speech, the speech's length
- The player sees/hears: during the Charter reading, the station's window rows flicker in groups that (a pilot with a stopwatch and a codex page discovers) spell the Charter's first clause in lamp code, repeated every cycle. The concourse PA has no comment.
- Payoff: plus codex entry (the clause, decoded).
- Build seam: lamp-bus group envelopes authored from the speech's known timing; pure data.
- Effort: data

### SP3-182 — The Market Bells
- Kind: comms-event
- Where: any station sector
- Trigger: sim-time — market day open and close
- The player sees/hears: two bell patterns (open bright, close low) with a lamp cascade running the station's spine (SP3-086's wave, faster), and the starmap's price fold pulses once at the same tick — sound, light and economy synchronized.
- Payoff: plus small bonus (marketDayMults already author the fold); the market gets a gong.
- Build seam: `marketDayAt` gates in `src/data/worldCalendar.js` + bell recipes + the lamp wave; all present.
- Effort: data

### SP3-183 — The Shift Whistle
- Kind: comms-event
- Where: any station sector
- Trigger: sim-time — every shift turn, from the station's position in space
- The player sees/hears: a steam whistle whose echo comes back off the nearest rock field a second later — the station's voice doubled by its geology. In belt sectors the echo is long and gravelly; in the Veil there is no echo at all, which regulars find ominous.
- Payoff: plus codex entry (per-sector echo table); the calendar you can hear.
- Build seam: one whistle recipe + one delayed echo cue scaled by sector's rock-field proximity (pure data per sector).
- Effort: data

### SP3-184 — Tally Eve's List
- Kind: comms-event
- Where: any station sector
- Trigger: sim-time — Tally Eve (dayOfYear 38), evening
- The player sees/hears: customs reads its accumulated fines on the open band — hull by hull — and if you have any, your name and your fine are read in the same flat tone as everyone else's. The list closes with the year's largest offender, which is usually a hauler and once was you.
- Payoff: plus codex entry; consequence as public accounting.
- Build seam: provenance fines ledger (saveVersion v14) + a comms sequence; zero new sim.
- Effort: data+glue

### SP3-185 — The Calendar Rock
- Kind: world-oneoff
- Where: sector_hyperion_cut (beside the driller)
- Trigger: always present; one notch per elapsed year-day, deterministic
- The player sees/hears: a boulder with forty notches chiseled around its equator and a fresh cut on today's — the cut still glinting — plus a small pile of forty years of chisel dust at its base. Someone comes out here every day. The notch count is exactly right, every time you check.
- Payoff: plus codex entry; the calendar made stone.
- Build seam: `src/data/worldOneOffs.js` row + notch count from `calendarDay(simTime)` (pure); data-only.
- Effort: data

### SP3-186 — The Festival Beacon Chain
- Kind: oneoff-mission
- Where: sector_helios_prime → sector_ceres_belt → sector_tethys_junction
- Trigger: offered on Founders' Day morning; the chain runs that day only
- The player sees/hears: relight the three sector beacons in order before the day ends — each lights with a column of sparks and (this is the point) each sector's stations answer with their bunting (SP3-104) as its beacon catches. The last beacon's light is visible from the first's position on the chart.
- Payoff: plus codex entry + the chain stays lit for the day in all three sectors.
- Build seam: `src/data/landmarkMissions.js` row + beacon props + bunting gates; the chain state is a calendar-keyed ledger.
- Effort: bespoke

### SP3-187 — The New Year Tug
- Kind: easter-egg
- Where: sector_helios_prime (the start lane)
- Trigger: sim-time — day 40 turning to day 1, one crossing, 30 s
- The player sees/hears: a tiny single-tug crosses the start lane towing one plate with hand-painted lamp-rim letters ("GOOD YEAR") and one very old lamp, at exactly the year turn. It has right of way over everything. The wire does not mention it; the barges all flash once as it passes.
- Payoff: plus codex entry.
- Build seam: lane-contact fixture (the courier idiom from `src/data/worldOneOffs.js` comments) on a calendar gate; barge flash via lamp-bus pulse.
- Effort: data

### SP3-188 — The Quiet Minute
- Kind: easter-egg
- Where: sector_pallas_drift, sector_sker_haven (Quiet Night, dayOfYear 21)
- Trigger: sim-time — midnight of Quiet Night, exactly one minute
- The player sees/hears: at the minute, ALL ambient audio ducks 90% across the sector — engines included — while the sky's stars sharpen one step. One minute of the loudest quiet, then the world breathes back in. Pilots plan to be still for it.
- Payoff: plus codex entry; the calendar's most shared secret.
- Build seam: festival-minute master duck (the same bus gate as SP3-048's silence, inverted) + a one-step background exposure lift.
- Effort: data+glue

### SP3-189 — The Verge Pilgrims
- Kind: encounter
- Where: sector_veil_nebula (from the gate)
- Trigger: sim-time — Pale Holiday (dayOfYear 33), one crossing
- The player sees/hears: a candle-chain of small ships crosses toward the Veil's deep field — one lamp each, no formation discipline, some old and slow — observing the holiday nobody scheduled. Falling out of the chain is not an insult; rejoining is expected. At the far marker they all flash once and go dark for a minute.
- Payoff: plus codex entry; escorting the full crossing is its own receipt.
- Build seam: lane-contact convoy on a festival gate + the lamp floor/dark mechanics of SP3-103/106.
- Effort: data+glue

### SP3-190 — The Forge Due Whistle
- Kind: comms-event
- Where: sector_vesta_forge
- Trigger: sim-time — Forge Due (dayOfYear 26), the quarter-books hour
- The player sees/hears: the foundries blow steam whistles in sequence — five stacks, five pitches, a rising phrase — and hold the last note while the yard's accounting lights (green window rows) step on floor by floor. The books are closed; the sector audibly relaxes.
- Payoff: plus codex entry; an economy beat with a melody.
- Build seam: five whistle recipes + the shift-cascade lamp mechanics; festival gate from worldCalendar.
- Effort: data

### SP3-191 — The Ashfall Calendar
- Kind: world-oneoff
- Where: sector_ashfall_reach (near the redoubt)
- Trigger: always present; one ring per storm season, deterministic
- The player sees/hears: a rock tower banded like sediment — each dark ring a survived storm season, each pale band a calm one, the count exactly the sector's weather history — with a wire-spool ladder up its side. The newest ring is still soft; you can see the season falling on it.
- Payoff: plus codex entry; the weather record as geology.
- Build seam: ringed prop (donor rock + band emissive tints) with the count read from the seasonal ledger (pure `weatherSeasonAt` history); data-only.
- Effort: data

### SP3-192 — The Closed Books
- Kind: comms-event
- Where: sector_helios_prime, sector_ceres_belt
- Trigger: sim-time — day 40 only (year end), the painted sky variant
- The player sees/hears: for one day the sectors' sky plates swap to their "closed-books" variant — the Lantern shelf's lit mass dims to embers and the estuary's lights go out except one — and the wire runs nothing but the Year Bell (SP3-179). The sky itself takes the day off.
- Payoff: visual wonder only; a calendar beat with weight.
- Build seam: alternate plate rows keyed to the year-day gate in `src/data/sectorVisualProfiles.js` (plates resolve per profile already).
- Effort: data

### SP3-193 — The Almanac Wink
- Kind: easter-egg
- Where: any sector (starmap)
- Trigger: sim-time — when any scheduled spectacle (SP3-001/002/005/021 family) is live in the viewed sector
- The player sees/hears: the sector's glyph on the starmap briefly gains a faint rim glow while a timed phenomenon is live — never labeled, never explained in UI. Pilots learn the wink and plan around it; the map becomes a rumor you can check.
- Payoff: plus codex entry (the Almanac page lists every wink-able event); rewards understanding, per the campaign brief.
- Build seam: a map-layer rim flag fed by one shared "is a spectacle live" registry read (the same gate every SP3 event registers to).
- Effort: data+glue

### SP3-194 — The Weather Wire Jingle
- Kind: comms-event
- Where: any sector
- Trigger: sim-time — every `weatherForecast` delivery
- The player sees/hears: each forecast kind gets a three-note jingle (ion: descending minor; wind: rising major; meteor: two beats and a rest; clear: a single held tone) — after a week you know tomorrow's weather from the next room.
- Payoff: plus codex entry; the forecast becomes ambient literacy.
- Build seam: four recipes + the existing forecast delivery path; pure data.
- Effort: data

### SP3-195 — The Watchman's Kettle
- Kind: world-oneoff
- Where: sector_sker_haven (gate-side beacon hut)
- Trigger: always present; steam at every shift turn
- The player sees/hears: a one-room beacon hut with a stove pipe that puffs steam in three short bursts at every shift change — the watchman (never seen) putting the kettle on. The hut's one window is warm. Its beacon never misses; neither does the kettle.
- Payoff: plus codex entry; the calendar you can smell.
- Build seam: `src/data/worldOneOffs.js` row + gas puffs keyed to `stationShiftAt`-style gate; data-only.
- Effort: data

### SP3-196 — The Last Meteor
- Kind: visual-setpiece
- Where: any weather sector
- Trigger: sim-time — the exact end of any meteor_shower surge
- The player sees/hears: as the surge's last slot retires, one final stone crosses the whole sector low and slow, throwing its light beat across every field it passes, and burns out exactly on the surge's end tick — the season's signature, an exit line the sky writes every time.
- Payoff: visual wonder only; the weather arc's closing shot.
- Build seam: the weatherMeteors slot book's last-slot retirement event + one scripted crossing (the fireball path of SP3-044 at reduced scale).
- Effort: data+glue

### SP3-197 — The Almanac
- Kind: oneoff-mission
- Where: any sector (Archive, faction_archive)
- Trigger: offered once the player has witnessed five distinct timed spectacles (any of the SP3 timed family)
- The player sees/hears: the Archive compiles your observations into "the pilot's almanac" — a codex page listing each phenomenon you caught with its schedule arithmetic shown, your five bearings plotted. Publishing it (one scan at the Archive buoy) stamps your hull id into the page's margin.
- Payoff: plus codex entry (the campaign's understanding-reward, formalized).
- Build seam: a witness ledger (same discovery-bag persistence as `state.world.discovery`) + a codex page row + one Archive buoy scan.
- Effort: bespoke

### SP3-198 — The Farewell Light
- Kind: visual-setpiece
- Where: any sector (Borrowed Sun visits)
- Trigger: after event — the Borrowed Sun's `fold` phase begins (its own phase machine in `src/data/borrowedSun.js`)
- The player sees/hears: as the wandering station folds for transit, every lamp on it flares once in sequence — bow to stern, a full-body goodbye — holds one beat at full glow, and steps down into the fold's compression flicker. The whole visit cycle (deploy/open/fold) becomes a story told in light.
- Payoff: visual wonder only; gives an existing system its missing ceremony.
- Build seam: lamp sequence keyed to the existing `BORROWED_SUN_PHASES` ticks; data rows only.
- Effort: data

### SP3-199 — The 500th Rock
- Kind: easter-egg
- Where: any sector (one per sector, seeded position in each rock field)
- Trigger: proximity — mining beam contact
- The player sees/hears: one rock in every sector's field carries a small painted "500" and a tally of forty strokes under it. Strike it and it rings (SP3-146's mechanic) with a pitch that is — the codex confirms when you've found all ten — one note of a ten-note scale. The belt is an instrument; the campaign left it tuned.
- Payoff: plus codex entry (collecting all ten completes the scale page).
- Build seam: seeded rock flag in the field draw stream (the scatter-salt idiom from `src/data/opticStructures.js`) + strike pitch from sector index; data+glue.
- Effort: data+glue

### SP3-200 — The Ten-Rock Scale
- Kind: oneoff-mission
- Where: any sector (the ten SP3-199 "500th Rocks", one per sector)
- Trigger: offered by the Archive once the player's scan log holds three of the ten marked rocks
- The player sees/hears: "Ten marks, ten notes, one scale. Bring us the rest." Each found rock's pitch is already in your log; the mission is the hunt across sectors — and the payoff is the Archive's own bell tower ringing the completed ten-note scale once, every station lamp in earshot pulsing on the notes.
- Payoff: plus codex entry (the completed scale page) + small bonus; the Archive bell performance is one-time and permanent in the chronicle.
- Build seam: `src/data/landmarkMissions.js` row family + the SP3-199 seeded rock ledger + the SP3-146 strike-pitch mechanic + one bell sequence through `audio:cue`; all established seams.
- Effort: data+glue

---

## Seam map

How visual/audio set-piece content actually enters this game, and what is dirty right now:

- **Event light vocabulary:** `src/render/vfxColorLightDirector.js` (DIRTY) — the single writer for every dynamic event light in `vfx.js`; call sites name a kind+severity (`presetFor('explosion','reactor-rupture')`, `cue`, `vein`, `tell` families) and the pool (6 event + 2 weapon) admits them. New set-pieces request from these rows; a genuinely new identity is one new row in this file, not per-site literals.
- **Pooled VFX emitters:** `src/render/vfx.js` (DIRTY, ~18k lines) — subscribes to bus events (`entity:killed`, `mining:yield`, `weatherMeteors` retirements, `sector:enter` resets) and spawns from fixed pools (`spawnSprite/spawnParticle/spawnPresentationSprite`, `emitDestructionLightBeats`, `spawnStationSideEventStreak`, gas volumes `_gas`, seam markers). A set-piece is one more event subscription + pooled emission; it must respect the `flashReduce`/`motionReduce` budget multipliers applied in `src/systems/presentationAdapters.js`.
- **Presentation cues (the clean seam):** `src/systems/presentationAdapters.js` — sim emits cues with `lanes.vfx / audio / camera / ui`; `_applyVfx` routes lanes (including `vfx.direct_*`), `_applyAudio` maps cue ids to recipes. New spectacles should enter as cues where possible — it is the dedupe/accessibility/telemetry path — rather than raw bus emissions.
- **Audio recipes:** `src/data/audioRecipes.js` (additive `RECIPES` list) + positioned `audio:cue` events; procedural one-shot vocabulary proven by `src/data/bolusAudio.js` (oscillator + sweep + envelope) and role sounds in `src/data/discoveryAudio.js`. Music stems (`MUSIC_STEMS`) exist for calendar-scoped mix changes. Ambient proximity calls: `src/systems/discoverySound.js` (`tickDiscoverySound`, 2.5 s throttle, 9 s per-entity memory) is the model for any new ambient set-piece sound.
- **Sky/background:** `src/data/sectorVisualProfiles.js` — background composition (cometInterval, signatureHero, paintedSky/sky plates, structure recipe: warp/dust/band fields), resolved via `resolveBackground*` and consumed by `src/render/spaceBackground.js` (the L6 comet is already here) and `tabletopPictureRecipes.js`. Timed sky phenomena are pure data rows keyed to calendar predicates.
- **Look/mood:** `src/data/lookMoods.js` (DIRTY) + `src/render/look.js` — moods are flat number bags lerped on sector change; a timed light event (eclipse, twilight, color thief) is best authored as a new overlay file merged through `resolveLookLighting/resolveLookPost` rather than editing the dirty mood table. Lamp rhythm lives in `src/data/lampChannels.js` + `src/render/lampBus.js` (flash-and-decay envelopes, per-material phase, `flashReduce` flattening) — the single cheapest way to make a structure perform.
- **Scheduling/determinism:** `src/data/worldCalendar.js` (`calendarAt`: 600 s days, 3 shifts, market days, 7 festivals on dayOfYear, storm seasons via `seasonalWeather.js`) read by `src/systems/worldClock.js`, which emits `calendar:festival`, `calendar:stormSeason`, `calendar:rushHour` and news/popup events exactly once per transition (48-key dedupe). `src/data/seasonalWeather.js` (`weatherSeasonAt`/`seasonalWeatherPhase`: warning 30 s / surge 90 s / calm 180 s cycles) is the pure forecast a timed spectacle schedules against. A "phenomenon window" is: pick the calendar predicate, gate the emission on it, announce via the wire.
- **Finite phenomena persistence:** the pattern to copy is `src/systems/weatherMeteors.js` — a per-volume slot book in `state.world.discovery[sectorId]` (slots, cycles, retired flags) that survives saves and makes "already saw/already spent X" deterministic; `saveVersion.js` (v21) documents the durable bags (`world.records` v11 for durable bodies, `worldPressure` v19 for bounded receipts). One-off witnessed-state belongs in `state.world.discovery` (per-sector, per-key), not in renderer state.
- **Places (when a spectacle IS a place):** `src/data/authoredPlaces.js` additive zone records + `src/data/PLACE_REGISTRATION.md` gates (`check:atlas-integrity`); no art required (procedural proxy tiers), no presence required (no spawns). `src/data/worldOneOffs.js` is the set-piece prop path (deterministic positions, existing place-GLB donors, spawned by `world.js _spawnWorldOneOffs`); `src/data/sectorWonders.js` is the machine-ritual path (cut/release/repair operations with payloads and receivers); `src/data/landmarkMissions.js` is the follow-up-mission path (scanner-pulse deliverables).
- **Weather/machinery volumes:** `src/data/environmentalMachinery.js` registers fields into the ONE field kernel (weather volumes, kill machines, the Pallas reef); `src/systems/weatherMeteors.js` and `src/systems/worldClock.js` consume them. New phenomena register volumes here rather than inventing force paths; `src/data/racingSetPieces.js` shows the authored-crossing/wave/shutter grammar worth porting to adventure lanes.
- **Trailer/camera staging:** `src/data/trailerMoments.js` — the camera-moment + music-cue + clip grammar for "you found a thing" beats; discovery presentation hooks (`sfx_discovery_plate_note`, `moment.stinger`) are the audio stingers a first-sight spectacle should reuse.
- **Dirty-file caution:** `src/render/vfx.js`, `src/render/vfxColorLightDirector.js`, `src/data/lookMoods.js`, `src/render/illustratedSurface.js`, `src/render/fieldForcePresentation` siblings, `src/systems/encounterDirector.js`, `src/data/missions.js`, `src/data/lookMoods.js` are foreign-dirty in this working tree. The build should add NEW data files + thin interpreters (registered through the clean seams above) and touch dirty render files only at existing, narrow call sites.
