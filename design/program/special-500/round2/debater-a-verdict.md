<!-- LIFETIME: CAMPAIGN -->
# Round 2 — Debater A verdict (Builder: feasibility / seams / performance / determinism)

I read all three round-1 files in full and spot-checked the cited seams against the live tree
(`git status --short` this sitting; grep of every load-bearing export named below). Verdict up
front: **the round-1 seam maps are unusually honest.** Every gate in `_gatesPass`, every shipped
script id in `ENCOUNTER_SCRIPTS` (line 4127), `crSituationKit`'s `priorOutcome`/`settleSituation`/
`publishSituationNews`/`loosenBody`, the full `MOTIONS` set in `vignetteInterpreter` (including
`vulture` and `column`), `worldCalendar`'s `stationShiftAt`/`marketDayAt`/`festivalForDayOfYear`/
`calendarAt`, `seasonalWeather`'s pure reads, `sectorVisualProfiles`' background rows
(`cometInterval`, `signatureHero`, `paintedSky.strength`, `structure.warp`), `lampChannels`
(`breathe`/`beacon`/`strobe`, `lampPhaseForKey`), `audioRecipes` `MUSIC_STEMS` +
`STATION_LIFE_AUDIO_RECIPES`, `worldClock`'s once-per-transition `calendar:*` emits and `_news`,
the `weatherMeteors` slot book, `numbersShadow`, `pallasHiddenCache` CHOICES, `HELIOS_ROPE_CACHE`,
`CAVED_SHAFT_PROBE.targetLocalPos`, `WRECK_MISSIONS` + `tow_recovery`, the `mail.js` trigger
vocabulary and kinds, `namesForTheDead`, every cited POI id, all 24 sector ids (including
`sector_the_bolus` = `BOLUS_SECTOR_ID`), and every cited encounter precedent file (100/140/290/321/
331/901/902-family/1207/1210) **exist and do what the proposals claim.** I found exactly one real
seam lie and one naming slip; everything else below is cost/benefit, dirty-file routing, and
honest-label work.

## Critique highlights

1. **The one seam lie: `resolveLookLighting` / `resolveLookPost` do not exist.** sa3 cites
   `resolveLookLighting in src/render/look.js` (SP3-002, SP3-009, SP3-018 family) and
   "`resolveLookPost` path in `src/data/lookMoods.js`" (SP3-156). `look.js` exports
   `beginLookMood`, `updateLook`, `tuneLook`, `LOOK_FIELDS`, `LOOK_SURFACE_UNIFORMS`,
   `LOOK_POST_UNIFORMS` — nothing named `resolveLook*`. The capability (a timed light/post
   overlay) is real via a new mood-overlay data file merged through the mood path; the named
   functions are invented. Honed, not killed: SP3-002, SP3-008, SP3-018, SP3-031, SP3-156. The
   same correction bounds SP3-007 (its "no new renderer code" claim only holds for a sector-wide
   gain envelope, not a spatially-walking terminator) and SP3-009 (zone-local rig boost is
   per-frame glue, not data).
2. **Naming slip:** sa1's seam map cites `902-scene-mail-through-crossfire.js`; the actual file is
   `902-scene-fare-dodger-chase.js`. The 902–93x vignette family is real, so no proposal dies —
   but build notes must cite real filenames.
3. **`CODEX_OVERLAYS` is not an export.** sa2's seam map names it in `src/data/codexPages.js`; the
   real overlays are `COMMODITY_OVERLAYS`/`HULL_OVERLAYS` maps plus the discovery gate in
   `src/ui/sim/codexPages.js`. Every "codex overlay row" proposal survives, but the build should
   target the actual maps, not a phantom constant.
4. **The dirty-file situation moved under all three docs.** Round 1 recorded a short dirty list;
   this sitting `git status` also shows dirty: `src/data/modules.js`, `src/render/visualOverrides.js`,
   `src/systems/fields.js`, `src/data/contactHail.js`, `src/ui/ship/shipScreen.js`,
   `src/ui/screens/resultsSheet.js`, `src/ui/screens/demoEnd.js`, `src/systems/npcJobsRuntime.js`,
   `src/render/masslinePresentation.js`, `src/data/scanReveal.js`, `src/systems/quill.js`,
   `src/render/illustratedSurface.js`, `src/render/fieldForcePresentation.js`, `src/systems/input.js`.
   Proposals whose only seam was "clean" at drafting time are honed to fallbacks — the good news is
   sa1/sa2 mostly pre-registered those fallbacks; I lock them in below. `src/data/encounters.js`,
   `encounters/index.generated.js`, `mail.js`, `encounterScripts.js`, `crSituationKit.js`,
   `vignetteInterpreter.js`, `uniqueWrecks.js`, `worldCalendar.js`, `seasonalWeather.js`,
   `sectorVisualProfiles.js`, `lampChannels.js`, `audioRecipes.js`, `environmentalMachinery.js`,
   `landmarkMissions.js`, `worldOneOffs.js`, `codexPages.js` remain clean — the workhorse seams
   are safe.
5. **Clone families (name both ids):** SP1-001/SP1-015 (mass-vs-manifest audit twice — Reach toll
   and Concord scan are the same core); SP1-003/SP1-195 (skipped-toll-reckoning with a face);
   SP1-017/SP1-103 (pass-counter beacon with numbered milestone lines); SP1-149/SP3-024 (both
   literally titled "Ring Rain", same planetary-shedding core); SP1-162/SP3-002/SP3-015 (one
   scheduled eclipse wearing three hats); SP2-013/SP2-014 (self-declared sibling numbers
   stations); SP2-007/SP2-197 (bulkhead graffiti additions); SP2-096/SP1-168 (living hull-growth
   companion, twice); SP3-006/SP3-020 (same sky-plate wink, two festivals); SP3-112/SP3-180 (the
   roll call and its witness-pause variant); SP3-148/SP1-093 (audio-dead region twice). I merge
   all twelve sources into their stronger targets; the merged build notes carry the folded twist.
6. **Effort-label honesty:** high. sa1 labels bespoke exactly where bespoke is true (Old Web,
   Rodeo, Shelf Drop, Comet Road...). sa2's "data" mail rows are genuinely data — `mail.js` is
   clean and its trigger vocabulary checks out. Two label corrections: SP3-013 is data+glue (gas
   row plus a call-site read, not pure data), SP2-022 is data+glue (cadence data + claimableBodies
   row + primer purchase, not bespoke). One fake-mechanic payoff: SP2-175's "every future hail
   costs 20% less airtime" — there is no airtime resource; honed to a real payoff.
7. **Determinism:** clean across all 600. Every trigger I checked keys off `state.simTime`,
   hash-seeded day/season reads, proximity, persistent flags, or event receipts. No wall time
   anywhere. SP2-189/SP2-190's counters and SP3's entire calendar family are pure functions of
   simTime. This is the most determinism-clean 600-proposal batch I have audited in this repo.
8. **Performance flags (all honed, none silent):** SP1-011 spawns forty live wasps — capped;
   SP3-063 runs continuous two-body articulation forever — sleep-bounded; SP3-077 grows an
   unbounded deposit field — capped at 12 layers; SP1-063's permanent zone reshuffle and SP3-007's
   spatial terminator are reduced to windowed/global forms. Permanent *scene additions* in the set
   (authoredPlaces/worldOneOffs rows) all ride registered, already-budgeted paths.
9. **Reachability:** no dev-flag gating found. Post-ending gates (SP2-035, SP2-191, SP2-193) are
   late-default-route, which is legal. SP3-016's "photo mode hook" is the one reachability
   question — honed to the verified scanner-pulse capture path.
10. **Family-cadence risk, not a kill:** sa2's machine-people decade (SP2-116…SP2-125) is ten
    same-shaped line-variant-plus-counter entries on ten beloved characters. Each is individually
    cheap and true to its file (`morrow.js`/`vesper.js`/`quill.js`/`ruud.js` all verified); as a
    block they should not land in one sitting or the pattern reads as a stamp machine. Sequencing
    note for the build phase, nothing more.

## Hones

- SP1-006 | HONE | H-01: the "hot lanes" readout must be generated from the seeded encounter tables themselves (one source of truth), never a parallel hand-authored schedule that can drift from what actually spawns.
- SP1-011 | HONE | H-46: cap the drill grid at 12–16 drones on the civilian deck with a bounded window; forty live hulls in formation violates the spawn budget for an ambient.
- SP1-014 | HONE | H-02: keep the flag read in a new numbered encounter file; do not open `missions.js` (dirty) — the author's own fallback is the build note.
- SP1-016 | HONE | H-03: post via a Concord desk hull as a numbered encounter; `missions.js`/`missionSpawningOps.js` only if clean at build time.
- SP1-025 | HONE | H-04: custody pod as a numbered encounter with a fragile prop; news beat via `publishSituationNews`, not the dirty missions file.
- SP1-056 | HONE | H-05: there is no hull-decal system; deliver PAID/SKIP as a shipScreen hull-note + scan label keyed to the story flag. `visualOverrides.js` is dirty and is not a decal path anyway.
- SP1-063 | HONE | H-06: keep the one-time cascade with the catchable rich boulder; drop the permanent reshaping of the zone's rock layout (asteroid field layout is generated; persistent reshuffle is not a supported write).
- SP1-068 | HONE | H-07: register the comet-road slipstream as a field row via `environmentalMachinery.js` (clean kernel), not an edit to dirty `fields.js`.
- SP1-089 | HONE | H-08: the engine does not cast shadow-text; build it as a backlit welded stencil plate (cutout letters, rim glow from the nebula side) — same read, real seam.
- SP1-094 | HONE | H-09: bounded ring buffer — persist the last 5 comms popup payloads for replay, not a full comms history store (none exists).
- SP1-100 | HONE | H-10: one dead-moon pair plus a registered slow field (fields kernel row); drop the three-body mutual orbit — background composition does not articulate three moons.
- SP1-105 | HONE | H-11: the auction sells the framing of the chosen event's *next* wire mention (one sourceRef override going forward); there is no news-history rewrite store.
- SP1-115 | HONE | H-12: ranging fleck as a story prop through the presentation-cue path (`lanes.vfx`); drop the accuracy nerf entirely — combat readouts stay untouched.
- SP1-147 | HONE | H-13: bloom wavefront as a scheduled story-prop light curtain + the cache window; no edits to dirty `lookMoods.js`/`vfx.js`.
- SP1-150 | HONE | H-07: same field-row registration as SP1-068 for the skim-run speed lane.
- SP1-156 | HONE | H-14: your wake persists as ONE ephemeral polyline per visit (sampled, capped, per sector-day) plus authored "daily writer" entries as fixed props; no persistent player-authored wake script store.
- SP1-168 | HONE | H-15: micromend as a slow capped regen riding an existing armor/survival path; touch `damage.js` only if clean at build time (it is dirty now).
- SP1-184 | HONE | H-16: key to most-docked *station* — there is no persistent berth-number identity to squat.
- SP1-186 | HONE | H-17: purchasable plaque + one dock greeting line + fee; drop the "dock layout change" claim (dock layout is static UI).
- SP1-188 | HONE | H-18: maneuver stats are not persisted; key the copycat to most-used weapon class / escort count from existing deed records.
- SP1-197 | HONE | H-19: ONE authored lane (the starter lane) with flag-gated tallies; there is no route-usage ledger and building one for chalk is not worth it.
- SP1-199 | HONE | H-20: key to the save's first-hull record if present, else a fit snapshot taken at the two-hour mark; do not build a new loadout-history ledger.
- SP2-006 | HONE | H-21: fence greeting variant as a comms line keyed to the flag; `barContacts.js` is dirty — request, do not edit.
- SP2-018 | HONE | H-22: author hail-response variants in a NEW data file consumed by the same contactHail seam; `contactHail.js` is dirty this sitting.
- SP2-022 | HONE | H-23: relabel data+glue (blink cadence data + claimableBodies row + primer purchase). The bespoke label overstates it.
- SP2-029 | HONE | H-22: same new hail-response data file as SP2-018.
- SP2-046 | HONE | H-24: post the job as a numbered selfRegistered encounter; `missions.js` only if clean at build.
- SP2-058 | HONE | H-22: same new hail-response data file.
- SP2-091 | HONE | H-25: the read-back lands as a late mail letter, not an ending-screen edit — ending/spine files are foreign-dirty and the letter is the same beat.
- SP2-135 | HONE | H-26: the coin waives the Dione dispute once and becomes the wall dressing; there is no generic lien-dispute system to end — scope it to the authored dispute.
- SP2-154 | HONE | H-27: key to hailing the channel (hail-count), not "transmits any audio" — there is no free-form transmit.
- SP2-175 | HONE | H-47: drop the fake "20% less airtime" mechanic; the payoff is the edited-hail audio variant plus a band-priority greeting. No airtime resource exists.
- SP2-186 | HONE | H-28: no lane-history ledger exists; key to courier contracts completed in that sector (deed counter).
- SP2-187 | HONE | H-29: the witnessed story = one assist/scan/dock event inside the window; open-ended "any maneuvering" watching is not judgeable.
- SP2-188 | HONE | H-30: deliver the line via comms popup + flag; `resultsSheet.js` and `demoEnd.js` are dirty. The next-session quiet-mode flag keys a parallel ambient table, not a `narrative.js` edit.
- SP2-200 | HONE | H-31: comms sequence in first-contact order (order ledger is small glue) + one persisted flag + next-session mail row; no results-sheet edit.
- SP3-002 | HONE | H-32: corrected seam — author a new mood-overlay data file merged via `beginLookMood`/`tuneLook` + `LOOK_POST_UNIFORMS` in `look.js`; `resolveLookLighting` does not exist. `lookMoods.js` stays untouched.
- SP3-007 | HONE | H-33: sector-wide gain envelope keyed to the transit minute; a spatially-walking terminator is renderer work and the "no new renderer code" claim is false in that form.
- SP3-008 | HONE | H-32: same corrected mood-overlay seam.
- SP3-009 | HONE | H-48: zone-occupancy rig boost is per-frame glue through `tuneLook`, not zone-record data — relabel data+glue and keep the arc window as the trigger.
- SP3-013 | HONE | H-34: relabel data+glue (weather-volume gas row + one call-site read in the dirty vfx file).
- SP3-016 | HONE | H-35: capture = scan pulse fired inside the alignment window (landmarkMissions precedent); do not depend on a photo-mode hook.
- SP3-018 | HONE | H-32: same corrected mood-overlay seam.
- SP3-031 | HONE | H-32: same corrected mood-overlay seam for the one-watch rig overlay.
- SP3-032 | HONE | H-36: ripple the survey buoys' lamps only (`lampPhaseForKey` offsets); `structure.warp` is a static field — drop the star-shear claim.
- SP3-053 | HONE | H-37: gas-volume falling motes only; hull-settling plus thrust-shedding is bespoke particle attachment — cut it, keep the season.
- SP3-063 | HONE | H-38: articulation sleeps beyond 600 WU; contact sparks only on player-near ticks. A permanently awake two-body grind violates the frame budget.
- SP3-077 | HONE | H-39: cap the tailings field at 12 visible layers with oldest fade; unbounded growth fails perf law.
- SP3-093 | HONE | H-40: announcement + apron flood dim only; the job director does not re-route traffic on a popup and `npcJobsRuntime.js` is dirty. Drop the "traffic clears" claim.
- SP3-137 | HONE | H-41: audio pulse + proximity gate only; skip the HUD band-edge breathing.
- SP3-153 | HONE | H-42: two authored background accents cross-fading by proximity; drop the "data-only" focus-pull claim — per-star proximity splitting needs renderer work that is not worth it.
- SP3-154 | HONE | H-43: static seasonal void corridor (warp/voidFloor row keyed to the third-season gate); a moving crossing is bespoke background animation.
- SP3-156 | HONE | H-44: corrected seam — zone-keyed post override goes through `LOOK_POST_UNIFORMS`/mood path; `resolveLookPost` does not exist in `lookMoods.js` or anywhere.
- SP3-163 | HONE | H-45: register the patch as its own tiny weather volume plus a forecast line that reads clear; "a footprint with no volume registered" is not a supported shape in the kernel.

## New proposals

Fillers for the killed slots and cheap clean-seam certainty the mix can always absorb. All verified
against seams named above.

### SPX-A-01 — The Pointing Chain
- Kind: anomaly
- Where: sector_ceres_belt, derelict_field
- Trigger: proximity to the first buoy; first-entry discovery; uniqueOnce
- The player sees: a chain of five dead nav buoys, each physically aimed at the next; the last aims at an uncharted rock marked with a hand-chalked X and nothing else.
- Payoff: the X rock holds one modest cache and a codex page ("someone wanted to be followed").
- Build seam: `src/data/worldOneOffs.js` cluster row (deterministic offsets) + cache POI + `src/data/codexPages.js` overlay
- Effort: data
- replaces: SP1-050

### SPX-A-02 — The Forty-Year Crate
- Kind: easter-egg
- Where: sector_helios_prime, station_helios dock
- Trigger: dock proximity; uniqueOnce
- The player sees: the freight manifest's oldest line — "IN TRANSIT, YEAR 3" — and the crate itself on the apron, opened and resealed so many times the tape has stratified.
- Payoff: pure worldbuilding; codex page; the crate is scan scenery, never claimable.
- Build seam: `src/data/stationSigns.js` SIGN_BAY-family row + one dressing prop + codex overlay
- Effort: data
- replaces: —

### SPX-A-03 — The Missed Bells
- Kind: comms-event
- Where: any sector, the player's most-docked station
- Trigger: three consecutive shift bells missed (bell counter in `state.story.flags`); fires once
- The player sees: the PA, dry: "Station to hull: we noticed the absence. The lane did not. One of those is a compliment."
- Payoff: one line of being known; flag persists; regulars reference it once.
- Build seam: `worldCalendar.stationShiftAt` window + flag counter + bark row in `ENCOUNTER_BARKS`
- Effort: data+glue
- replaces: —

### SPX-A-04 — The Painted Ring
- Kind: world-oneoff
- Where: sector_helios_prime, starter mining field
- Trigger: first mining strike on the marked rock; uniqueOnce
- The player sees: one rock carries a hand-painted white ring and "MINE. — K." It strikes clean and rings true; by the next visit the ring has been freshly re-painted.
- Payoff: a smile and a codex line; the re-painting is never explained.
- Build seam: `src/data/worldOneOffs.js` row + mining-event bark + persistent re-paint flag
- Effort: data+glue
- replaces: SP1-050

### SPX-A-05 — The Queue Critic
- Kind: comms-event
- Where: any sector, border_checkpoint
- Trigger: during any customs scan hold; seeded 20% per hold; cooldownS 3600
- The player sees: the hull ahead transmits a two-line review of the queue's service: "Two stars. The forms are load-bearing."
- Payoff: pure band life; a rotating bark table.
- Build seam: bark table rows read by the existing `patrolScan` script variant
- Effort: data
- replaces: —

### SPX-A-06 — The Borrowed Ladder
- Kind: encounter
- Where: sector_charon_expanse, derelict_field
- Trigger: proximity; uniqueOnce
- The player sees: two wrecks lashed by one intact ladder-tether. Latch the ladder and a log cylinder slides down the tether into your hold, with a note: "RETURN ANYTIME. IT LIKES THE TRIP."
- Payoff: a codex fragment now; re-latching on later visits yields nothing but a polite click.
- Build seam: numbered `selfRegistered` encounter + `state.combat.attachments` read (1210 pattern)
- Effort: data+glue
- replaces: —

### SPX-A-07 — The Abutment Weight
- Kind: easter-egg
- Where: sector_tethys_junction, the weigh clamp
- Trigger: scan the clamp abutment; updates per sector-day
- The player sees: your exact hull mass chalked on the stone with yesterday's date — and a season of dates marching up the abutment, every hull that ever idled there.
- Payoff: the scale's memory made visible; codex overlay.
- Build seam: scan-copy variant keyed to `calendarDay(simTime)` + flag
- Effort: data+glue
- replaces: —

### SPX-A-08 — The Last Ferry
- Kind: visual-setpiece
- Where: sector_io_reach, trade_lane
- Trigger: shift turn, once per sector-day
- The player sees: a two-hull ferry pair crosses the lane sharing one lit lamp hung between them; the older hull is visibly half-towing the younger, and has been for years.
- Payoff: pure column motion world-life; the wire never mentions it.
- Build seam: vignette `column` motion spec + single lamp channel
- Effort: data
- replaces: —

### SPX-A-09 — The Half a Conversation
- Kind: easter-egg
- Where: sector_phoebe_echo, the retired channel buoy
- Trigger: hail the buoy after SP2-029's flag; uniqueOnce
- The player sees: the buoy plays one side of an old argument; the other party's turns are carrier-silence, and the pauses are exactly long enough to answer into.
- Payoff: codex page; the most uncomfortable silence in the game.
- Build seam: band audio rows (bandpass/noise recipes) + flag gate + codex overlay
- Effort: data+glue
- replaces: —

### SPX-A-10 — The Census of One
- Kind: world-oneoff
- Where: sector_tethys_junction, poi_tethys_weigh
- Trigger: proximity per sector-day
- The player sees: a tally buoy chalks every hull that passed today, in order, yours included and underlined.
- Payoff: being counted, gently; the day's list persists until it rolls over.
- Build seam: numbered ambient encounter + per-day flag list capped at 12 entries
- Effort: data+glue
- replaces: —

### SPX-A-11 — The Dockmaster's Garden
- Kind: easter-egg
- Where: sector_helios_prime, station_helios dock
- Trigger: dock proximity; uniqueOnce
- The player sees: a hydroponic rack bolted to the dock spine, three rows of lamps, one row wilted, sign: "NOT FOR RESALE. YES, FOR YOU, FRANK."
- Payoff: pure dock charm; codex line.
- Build seam: dock dressing row + codex overlay
- Effort: data
- replaces: —

### SPX-A-12 — The Insurance Frame
- Kind: oneoff-mission
- Where: sector_kepler_scar, fresh wreck field
- Trigger: offered while a seeded scrapper convoy is en route (wire posting); seasonal predicate
- The player sees: "One exposure before the breakers eat it. The underwriter wants the paint verified." Scan the flagged derelict before the convoy arrives; the plate pays, and the convoy's tally comes up one hull short, documented.
- Payoff: small bonus + codex page; the convoy crew hails you once, professionally unamused.
- Build seam: `src/data/landmarkMissions.js` row (scanner-pulse deliverable) with a seasonal window
- Effort: data
- replaces: SP1-048

## Ballot

SP1-001 | KEEP | Reach weigh-in; merge target of SP1-015; data seam verified
SP1-002 | KEEP | witness-a-claim via attachments read; crSituationKit verified
SP1-003 | MERGE->SP1-195 | same skipped-toll-reckoning core; the kid is the better face, keep the gate machinery in the build note
SP1-004 | KEEP | prize auction; mine-ring prop + barks all data-reachable
SP1-005 | KEEP | sheepdog protection racket; scripted ally on ambush reuse is honest bespoke
SP1-006 | HONE | H-01: hot-lanes list generated from the seeded encounter tables, one source of truth
SP1-007 | KEEP | ransom buoy; run-history seeded pick via d.stream verified
SP1-008 | KEEP | captain's tow column; vignette column motion verified
SP1-009 | KEEP | toll war; shared story flag across two toll files is glue, not surgery
SP1-010 | KEEP | honest fence; commodityMoralTags verified
SP1-011 | HONE | H-46: cap 12-16 drones, bounded window; 40 live hulls breaks the ambient spawn budget
SP1-012 | KEEP | marooned pirate; tetherable pod via loosenBody verified
SP1-013 | KEEP | parley chit; escape counter + requiresCompletedShape verified
SP1-014 | HONE | H-02: flag read in a new numbered encounter; never open dirty missions.js
SP1-015 | MERGE->SP1-001 | same mass-vs-manifest audit core; Reach weigh-in is the more distinctive face
SP1-016 | HONE | H-03: Concord desk hull posting; missions.js fallback only if clean at build
SP1-017 | KEEP | weigh-point milestones; counter + barks verified; merge target of SP1-103
SP1-018 | KEEP | sworn scan escort leg; recon_scan stage pattern verified
SP1-019 | KEEP | runner at the ring; chase motion + patrol doctrine verified
SP1-020 | KEEP | impound auction; WRECK_MISSIONS + tow_recovery verified
SP1-021 | KEEP | registry collision paper trail; uniqueWrecks rumor->bearing->scan verified
SP1-022 | KEEP | amnesty burn; bountyHunters table + simTime window verified
SP1-023 | KEEP | checkpoint cat; ambient prop + flag, cheapest charm in the set
SP1-024 | KEEP | clock trap; ambush variant + sensor_tripline vocabulary verified
SP1-025 | HONE | H-04: numbered-encounter custody pod; news via publishSituationNews
SP1-026 | KEEP | mole's handoff; whisper + DIST_TELL_R scan tell verified (DIST_TELL_R = 1500)
SP1-027 | KEEP | relay that files you; flag consumed by patrol-scan fine logic is clean glue
SP1-028 | KEEP | warden drill; scheduled hold/ring motions verified
SP1-029 | KEEP | first-rights picket; claimThreat script verified
SP1-030 | KEEP | insurance hull; damage-state read + news publish verified
SP1-031 | KEEP | keel bell; ceresShipbreak event + attachments verified, bespoke honest
SP1-032 | KEEP | dead man's manifest; salvageSignal + followOnStub chain verified
SP1-033 | KEEP | vulture ring; 'vulture' motion exists in MOTIONS
SP1-034 | KEEP | tailings sift; barkDirector verified
SP1-035 | KEEP | jumped seam; claimsOnly gate + claimThreat verified
SP1-036 | KEEP | old web; pre-latched attachment bodies, bespoke labeled honestly
SP1-037 | KEEP | executor arrives; loot-event timing + comms popup verified
SP1-038 | KEEP | slag diver; uniqueWrecks timingGate hazard_window verified
SP1-039 | KEEP | prop wreck; distress + custom scan_tell lines, data-labeled honestly
SP1-040 | KEEP | tally board; authoredPlaces + flags, bespoke honest
SP1-041 | KEEP | two-line problem; attachments cut seam verified
SP1-042 | KEEP | story broker; moralTags + codex verified
SP1-043 | KEEP | the drafter; proximity/speed check + d.grant, glue honest
SP1-044 | KEEP | the corner; economyCycles schedule read verified (economyCycles.js exists)
SP1-045 | KEEP | reefer handoff; fragileCargo.js verified
SP1-046 | KEEP | extra crate; cargo inspection + module reward, glue honest
SP1-047 | KEEP | berth queue; column/hold motions + barks verified
SP1-048 | KILL | a second economy actor mirroring the player's trades is a new economy simulation for a gag; cost/benefit fails
SP1-049 | KEEP | futures broker; economy intents + convoy script verified, bespoke honest
SP1-050 | KILL | mass-gated physical choke plus ferry micro-economy has no hull-size traversal seam; true cost is bespoke physics plus a new loop
SP1-051 | KEEP | hot potato; passed prop + beacons seam verified
SP1-052 | KEEP | merger convoy; two convoy scripts + junction anchor, data honest
SP1-053 | KEEP | receipts read aloud; transaction history read + codex verified
SP1-054 | KEEP | perishable sprint; deadline variant, fallback pre-registered
SP1-055 | KEEP | flare reroute; scheduled zone-state flip is glue in clean sectorZones
SP1-056 | HONE | H-05: no hull-decal system exists; shipScreen hull-note + scan label instead
SP1-057 | KEEP | seam singer; co-mining split + module reward, bespoke honest
SP1-058 | KEEP | the rodeo; attachment tug scoring, bespoke honest
SP1-059 | KEEP | bell rock; mining-event key + lootShards verified
SP1-060 | KEEP | prospector's cairn; fixed props + moral flag, glue honest
SP1-061 | KEEP | ore hound; bounded daily seeded pick, bespoke honest
SP1-062 | KEEP | intake ballet; spiral via column motions verified
SP1-063 | HONE | H-06: one-time cascade with catchable boulder; drop the permanent zone reshuffle
SP1-064 | KEEP | pulse seam; timingGate pattern verified in uniqueWrecks
SP1-065 | KEEP | belt strike; shared flag pair + d.rep verified
SP1-066 | KEEP | assay war; survey result to world.discovery, fallback pre-registered
SP1-067 | KEEP | tailings fire; burning prop + massline rescue, bespoke honest
SP1-068 | HONE | H-07: register the slipstream as a field row via environmentalMachinery, not dirty fields.js
SP1-069 | KEEP | air auction; 100-distress-call base + second responder verified
SP1-070 | KEEP | relay chain; requiresCompletedShape on rescue outcome verified
SP1-071 | KEEP | warm tow; tow_recovery + deadlineS verified
SP1-072 | KEEP | genuine article; counter-gated distress tell, data honest
SP1-073 | KEEP | ring of hands; 'formation' await exists in vignetteInterpreter
SP1-074 | KEEP | reactor ferry; deadline + lootShards explosion verified
SP1-075 | KEEP | ration ledger; page-store in flags + codex, glue honest
SP1-076 | KEEP | fourth mayday; distress counter + spoof lines, glue honest
SP1-077 | KEEP | bucket line; repeatable tow legs + tally prop, bespoke honest
SP1-078 | KEEP | cold manifest; three-outcome branch, fallback pre-registered
SP1-079 | KEEP | fire watch; bolusForces verified at src/data/bolusForces.js
SP1-080 | KEEP | the keeper; item requirement via vignette requires verified
SP1-081 | KEEP | ticketed wreck; tour column + codex verified
SP1-082 | KEEP | two halves; two uniqueWrecks sites + shared log pool verified
SP1-083 | KEEP | reef light; seeded hazard roll on proximity, glue honest
SP1-084 | KEEP | the resident; vendor entity at the web, bespoke honest
SP1-085 | KEEP | engine shrine; offerings counter + bandRadio consequence verified
SP1-086 | KEEP | honor guard; per-entity doctrine verified (src/ai/doctrine.js exists, clean)
SP1-087 | KEEP | falling anchor; simTime drift prop + impact news, bespoke honest
SP1-088 | KEEP | wreck deed; auction + claim-defense chain, bespoke honest
SP1-089 | HONE | H-08: backlit welded stencil plate; the engine does not cast shadow-text
SP1-090 | KEEP | flag change; seeded weekly variant pick, fallback pre-registered
SP1-091 | KEEP | the hum; requiredPings pattern (140 precedent) verified
SP1-092 | KEEP | paid fare; search chain, fallback pre-registered
SP1-093 | KEEP | the silence; bandRadio + barkDirector gates verified; merge target of SP3-148
SP1-094 | HONE | H-09: bounded 5-line comms buffer, not a full history store
SP1-095 | KEEP | the scale; director cargoValue() seam verified at line 1408
SP1-096 | KEEP | the courtesy; no-fire counter + beacons cache verified
SP1-097 | KEEP | favor ledger; flags-written-by-outcomes pattern, bespoke honest
SP1-098 | KEEP | the negative; 290-depth-h8-echo-of-player.js precedent verified
SP1-099 | KEEP | long sentence; simTime-indexed character state, glue honest
SP1-100 | HONE | H-10: one dead-moon pair + registered slow field; drop the triple mutual orbit
SP1-101 | KEEP | scheduled ghost; fixed simTime window + news advisories verified
SP1-102 | KEEP | four points; deedRecord.js verified reading real deed stats
SP1-103 | MERGE->SP1-017 | same pass-counter-plus-milestone-lines core; fold the lighthouse dressing into the weigh-point
SP1-104 | KEEP | whisper with a name; WHISPER_LINES verified, data honest
SP1-105 | HONE | H-11: auction sells the framing of the event's next wire mention; no history-rewrite store exists
SP1-106 | KEEP | the stutter; simTime-modulo prop offset, bespoke honest
SP1-107 | KEEP | the undertow; curlField.js verified at src/data/curlField.js
SP1-108 | KEEP | the dimming; decay flag + charge interaction, bespoke honest
SP1-109 | KEEP | ring rules; 331-pd-screen-wall tech + single-spawn rule verified
SP1-110 | KEEP | the heir; namedHunter variant + NAMED_CAPTAINS verified
SP1-111 | KEEP | brood mare; capitalBossEncounters subsystem pattern verified
SP1-112 | KEEP | grid hostage; endingWorldPresence.js verified
SP1-113 | KEEP | the return; near-death record + escort motions, bespoke honest
SP1-114 | KEEP | the taxidermist; lair vendor + deedRecord trophies, bespoke honest
SP1-115 | HONE | H-12: story-prop fleck via presentation cue; drop the accuracy nerf
SP1-116 | KEEP | witnessed standoff; two columns + witnessed-price precedent (1207) verified
SP1-117 | KEEP | counter-contract; bountyHunt.js verified
SP1-118 | KEEP | the professional; per-captain escape counter + namedHunter verified
SP1-119 | KEEP | wrecker's bout; weapons-locked doctrine + massline duel, bespoke honest
SP1-120 | KEEP | second last argument; 901-last-argument.js verified
SP1-121 | KEEP | frozen watch; interior scan + comms popup fallback pre-registered
SP1-122 | KEEP | resignation letter; crSituationKit facts + delivery encounter verified
SP1-123 | KEEP | comet run; race type verified in MISSION_TYPES (race: 370)
SP1-124 | KEEP | gate sprint; race + persisted record, glue honest
SP1-125 | KEEP | anchor drag; attachments tension telemetry, bespoke honest
SP1-126 | KEEP | deadweight derby; tow-constraint race, bespoke honest
SP1-127 | KEEP | credible loss; inverted scoring race, bespoke honest
SP1-128 | KEEP | burn line; timingGate hazard race, glue honest
SP1-129 | KEEP | the hare; bountyHunter script + timed purse window verified
SP1-130 | KEEP | wrong way; race + map flag consumed by mapWorkbench, bespoke honest
SP1-131 | KEEP | pace car; wake bonus via story-prop marker per the author's own fallback
SP1-132 | KEEP | long follow; near/trail awaits verified
SP1-133 | KEEP | the bet; station-visit keyed arc via docking hooks, glue honest
SP1-134 | KEEP | wrong number; boreDeadDrop.js verified
SP1-135 | KEEP | tower's favorites; dockingCorridor.js verified
SP1-136 | KEEP | broadcast will; nearest-hull math + disabled-entity grant, bespoke honest
SP1-137 | KEEP | morning report; digest vs real economy/news state, bespoke honest
SP1-138 | KEEP | the blind; overheard-bark arc, glue honest
SP1-139 | KEEP | quiet hours; bandRadio night window + recipe verified
SP1-140 | KEEP | complaint desk; deedRecord/fines read + settlement verified
SP1-141 | KEEP | weather desk; forecast from real hazard schedules (environmentalMachinery verified)
SP1-142 | KEEP | courtesy loop; scripted relay exchange + codex, glue honest
SP1-143 | KEEP | open auction; jettison-escrow, bespoke honest
SP1-144 | KEEP | the sermon; crSituationKit history composition verified
SP1-145 | KEEP | missed connection; rescue flag + dock scene verified
SP1-146 | KEEP | sixth pip; simTime hour boundary, data honest
SP1-147 | HONE | H-13: bloom wavefront as scheduled story-prop curtain + cache window; no dirty-file edits
SP1-148 | KEEP | shelf avalanche; asteroidMotion + lootShards verified, bespoke honest
SP1-149 | MERGE->SP3-024 | same ring-shedding core, literally the same title; SP3-024 has the concrete weatherMeteors seam
SP1-150 | HONE | H-07: skim-lane speed bonus as a registered field row via environmentalMachinery
SP1-151 | KEEP | frost line; radius crossing + hull frost flag, bespoke honest
SP1-152 | KEEP | tumbleweed; ballistic prop via asteroidMotion, glue honest
SP1-153 | KEEP | full burn; formation at scale + join check verified
SP1-154 | KEEP | metal garden; magnetic forces via bolusForces, bespoke honest
SP1-155 | KEEP | long fall; debrisCrossings.js verified
SP1-156 | HONE | H-14: one ephemeral wake polyline per visit + authored daily-writer props; no persistent wake-script store
SP1-157 | KEEP | lightning farmers; storm vfx + vendor, glue honest
SP1-158 | KEEP | the crossing; scheduled lighting flag + edge encounter, bespoke honest
SP1-159 | KEEP | fog wedding; formation + lighting states verified
SP1-160 | KEEP | the cascade; aftermathWrecks.js verified
SP1-161 | KEEP | undertakers' bell; kill-record count, glue honest
SP1-162 | MERGE->SP3-002 | same scheduled-eclipse core; fold the shadow-window cache into the Umbra Minute package
SP1-163 | KEEP | traffic keeper; density read + shove, bespoke honest
SP1-164 | KEEP | graveyard orbit; wreck ring + append rule, bespoke honest
SP1-165 | KEEP | the confessional; receipts read + d.rep verified
SP1-166 | KEEP | read fee; per-wreck scan service + codex verified
SP1-167 | KEEP | efficiency audit; fittedModules.js verified
SP1-168 | HONE | H-15: micromend as capped regen on an existing armor path; damage.js only if clean at build
SP1-169 | KEEP | dock wedding; dock scene + merged-line toll note verified
SP1-170 | KEEP | helix barge; vendor queue + ring-violation broadcast, bespoke honest
SP1-171 | KEEP | prism read; power/fit read as barks, glue honest
SP1-172 | KEEP | the census; physical-response choices + persisted row verified
SP1-173 | KEEP | the hours; labor counter + stamp, glue honest
SP1-174 | KEEP | one favor; frontier job chain, fallback pre-registered
SP1-175 | KEEP | lost luggage office; inventory from encounter history, bespoke honest
SP1-176 | KEEP | librarian's grudge; destruction-event ledger, bespoke honest
SP1-177 | KEEP | loader's fumble; 902-scene vignette spec + item drop, data honest
SP1-178 | KEEP | wash refusal; story-mark flag + fixed vignette spec, data honest
SP1-179 | KEEP | the busker; jettison-tip + audioRecipes verified
SP1-180 | KEEP | the sniffer; telemetry summary read, glue honest
SP1-181 | KEEP | night shift; schedule-driven station state, bespoke honest
SP1-182 | KEEP | the naming; rescue flag + ceremony vignette, bespoke honest
SP1-183 | KEEP | last tow; procession column + audio log verified
SP1-184 | HONE | H-16: key to most-docked station; no berth-number identity exists
SP1-185 | KEEP | the book; docking telemetry odds, bespoke honest
SP1-186 | HONE | H-17: plaque + greeting + fee; drop the dock-layout claim
SP1-187 | KEEP | the statistician; deedRecord stats as a comms scene per the author's fallback
SP1-188 | HONE | H-18: key to most-used weapon class / escort count; maneuver stats not persisted
SP1-189 | KEEP | the plaque; first-kill coordinates + marker prop, bespoke honest
SP1-190 | KEEP | debt garden; debt hooks write flag state, bespoke honest
SP1-191 | KEEP | letter home; rescue records -> letter queue + codex verified
SP1-192 | KEEP | wake market; jettison log via clean cargo.js events (lossLedger is dirty)
SP1-193 | KEEP | portrait buoys; authored texture props per the author's fallback, no illustratedSurface edit
SP1-194 | KEEP | the interest; refusal records + matured deal verified
SP1-195 | KEEP | the witness; priorOutcome + toll pricing flag verified; merge target of SP1-003
SP1-196 | KEEP | the notary; witnessed flag per deed type + codex verified
SP1-197 | HONE | H-19: one authored lane with flag-gated tallies; no route-usage ledger
SP1-198 | KEEP | homecoming bell; absence record + bark pattern, glue honest
SP1-199 | HONE | H-20: first-hull record or 2-hour fit snapshot; no new loadout ledger
SP1-200 | KEEP | book of receipts; history threshold + codex artifact, bespoke honest
SP2-001 | KEEP | Vols pod; POI row + scan line + codex verified
SP2-002 | KEEP | behind the plate; mail.js repair-event trigger verified, pure data
SP2-003 | KEEP | seventh run; new commsWhispers file fallback pre-registered
SP2-004 | KEEP | sealed side; scan-detail row keyed to visit count verified
SP2-005 | KEEP | KAEL's marker; worldOneOffs row + mail variant verified
SP2-006 | HONE | H-21: fence greeting as a comms variant; barContacts is dirty
SP2-007 | KEEP | hull remembers; graffiti corpus line + flag; shipScreen note when clean
SP2-008 | KEEP | REF 44-C; mail STAT trigger + sender variant verified
SP2-009 | KEEP | 25th plinth; scan interaction + flag + codex verified
SP2-010 | KEEP | moisture tally; flag copy + cargo offering verified
SP2-011 | KEEP | bay 7; stationSigns SIGN_BAY verified
SP2-012 | KEEP | the question; reply-listen window is honest bespoke comms glue
SP2-013 | KEEP | second numbers station; NUMBERS_SHADOW_STATION verified; merge target of SP2-014
SP2-014 | MERGE->SP2-013 | same occluded-numbers-station core; fold the tide-drift bearing in as the hard variant
SP2-015 | KEEP | yard echoes you; state comparison + codex row verified
SP2-016 | KEEP | funeral channel; proximity + stationShiftAt verified
SP2-017 | KEEP | distress echo; routes to existing survivorPod recovery verified
SP2-018 | HONE | H-22: hail-response variants in a new data file; contactHail.js is dirty
SP2-019 | KEEP | static stutter; proximity audio row + cache gate verified
SP2-020 | KEEP | quiet's receipt; popup + scan variant, data honest
SP2-021 | KEEP | ninth bell; trade counter + bell window verified
SP2-022 | HONE | H-23: relabel data+glue; cadence data + claimableBodies + primer purchase
SP2-023 | KEEP | dead star chart; scan copy + POI row verified
SP2-024 | KEEP | cipher plate; scan-order counter + hail response verified
SP2-025 | KEEP | corridor pin; visit-count offset + chalk scan copy verified
SP2-026 | KEEP | frequency nobody owns; occlusion audio + vesper line table verified
SP2-027 | KEEP | posthumous ping; deed-memory death record + mail verified
SP2-028 | KEEP | half-second station; timed text burst + bar pad read verified
SP2-029 | HONE | H-22: hail-count branch in the new hail-response data file
SP2-030 | KEEP | archive wrong number; codex-read counter + mail row verified
SP2-031 | KEEP | latch-child's rag; per-sector flag + wreck dressing, bespoke honest
SP2-032 | KEEP | fourth copy; flag-gated scan copy, data honest
SP2-033 | KEEP | backwards bell; geometry check + choir copy verified
SP2-034 | KEEP | unguided tour; scan-audio row + cache verified
SP2-035 | KEEP | Wren buoy; worldOneOffs + post-ending flag gate, reachable late-route
SP2-036 | KEEP | overtime log; shift-phase scan copy verified
SP2-037 | KEEP | the retraction; news headline row + bar lore read verified
SP2-038 | KEEP | Fennel comes home; roamingStories binding verified, bespoke honest
SP2-039 | KEEP | forty-first hull; transit counter + scan copy verified
SP2-040 | KEEP | star marker's star; two-phase scan + intersection POI, bespoke honest
SP2-041 | KEEP | previous tenant's mail; ship:purchased trigger verified
SP2-042 | KEEP | spam sector; mail spam row with DAY cadence, pure data
SP2-043 | KEEP | fan mail; DEED trigger + trinket flag verified
SP2-044 | KEEP | bill for nothing; bill row + payment follow-up verified
SP2-045 | KEEP | quiet chain letter; self-redacting glue in the mail evaluator, honest
SP2-046 | HONE | H-24: numbered selfRegistered job; missions.js only if clean at build
SP2-047 | KEEP | postcard; live-value token in mail body path verified
SP2-048 | KEEP | understudy letter; mail row + bar price nudge verified
SP2-049 | KEEP | hate mail; deed trigger + reply flag glue verified
SP2-050 | KEEP | wrong window; WINDOW row + late-line variant verified
SP2-051 | KEEP | Voss's open page; signal:surveyFiled verified in MAIL_EVENT_NAMES
SP2-052 | KEEP | Mira fixes it; trap suppression flag, glue honest
SP2-053 | KEEP | third stool; dock counter + greeting variant verified
SP2-054 | KEEP | unclaimed reward; unsolicited payout via mail row, board flag is optional glue
SP2-055 | KEEP | dead drop digest; relay line + one-shot heat flag verified
SP2-056 | KEEP | letters for the dead crew; mail cast row + reply glue, bespoke honest
SP2-057 | KEEP | yard wire; spam row with live-stat token verified
SP2-058 | HONE | H-22: contact-roaming autoreply in the new hail-response data file
SP2-059 | KEEP | the refund; paired economy events + mail row, data honest
SP2-060 | KEEP | long silence; no-dock counter glue in mail evaluator, honest
SP2-061 | KEEP | empty stool; bar dressing + purchase option verified
SP2-062 | KEEP | tab outlived; contactDeedMemory key verified
SP2-063 | KEEP | karaoke bell; shift bell + barPressureAt verified
SP2-064 | KEEP | two-yard feud; rumor rows + pallet job, bespoke honest
SP2-065 | KEEP | sommelier; CANONICAL_CONTACTS verified in barContacts (request, do not edit)
SP2-066 | KEEP | cartographer's corner; survey counter + lore read verified
SP2-067 | KEEP | bar bet; geometry check mission, bespoke honest
SP2-068 | KEEP | complaint choir; stationLifeProfile standing read verified
SP2-069 | KEEP | gardener; understory.js faction file + garden stage verified
SP2-070 | KEEP | question booth; contact + gate POI reveal, bespoke honest
SP2-071 | KEEP | reading hour; day-window bar event + codex pages verified
SP2-072 | KEEP | wreck elder; wreck-visit flags + memorial tag, bespoke honest
SP2-073 | KEEP | margin's interview; deed lines via deedPhrases.js verified
SP2-074 | KEEP | rival's round; rival deed key + follow-ups, bespoke honest
SP2-075 | KEEP | route auction; decoy mission + ambush-signature data, bespoke honest
SP2-076 | KEEP | shoal toast; seasonalWeather window verified
SP2-077 | KEEP | dog watch knot; radial-sequence interaction, bespoke honest
SP2-078 | KEEP | ghost regular; day-phase dressing + codex verified
SP2-079 | KEEP | choir chair; ropeable pod + flag verified
SP2-080 | KEEP | night manager; canonical contact + tip option verified
SP2-081 | KEEP | pilgrim's meal; cargo provenance + service discount, bespoke honest
SP2-082 | KEEP | quiet booth; transaction receipts + stationContacts pattern verified
SP2-083 | KEEP | vael clause reader; service contact + codex verified
SP2-084 | KEEP | bedtime bell; shift-phase dressing verified
SP2-085 | KEEP | two-credit truth; sale receipts + price-band nudge, bespoke honest
SP2-086 | KEEP | lost luggage board; roamingStories cross-reference verified
SP2-087 | KEEP | shift-bell handoff; PA row by station TYPE verified
SP2-088 | KEEP | grease menu; heat-keyed purchases + law seams, bespoke honest
SP2-089 | KEEP | chalk ledger; trade receipts + dressing flag verified
SP2-090 | KEEP | alibi engine; timed haul + warrant seam, bespoke honest
SP2-091 | HONE | H-25: read-back as a late mail letter; ending/spine files are dirty
SP2-092 | KEEP | kiosk confesses; use counter + copy variant verified
SP2-093 | KEEP | requiem for a tool; choir receipt key + codex verified
SP2-094 | KEEP | form that files you back; mail header variant verified
SP2-095 | KEEP | filed as standard; fine-waiver flag verified
SP2-096 | MERGE->SP1-168 | same living-hull-growth core; the florist becomes the purchase wrapper for the graft
SP2-097 | KEEP | librarian's fine; library_tapes roaming id verified in roamingStories.js
SP2-098 | KEEP | airlock crossword; dock counter + dressing row verified
SP2-099 | KEEP | tollbooth poetry; day-seed receipt copy + codex verified
SP2-100 | KEEP | hundredth pilgrim; counter + bell-pulse cue verified
SP2-101 | KEEP | pop quiz; dock counter hail script, data honest
SP2-102 | KEEP | gift with a clause; economyContractTemplates.js verified, bespoke honest
SP2-103 | KEEP | retirement watch; mining counter + dressing verified
SP2-104 | KEEP | honest sigil; hull-note flag + toll pricing verified
SP2-105 | KEEP | black receipt; consumable item + fence flag, bespoke honest
SP2-106 | KEEP | silent shift; calendar pause cue verified
SP2-107 | KEEP | porch light; loss-event beacon + mail, bespoke honest
SP2-108 | KEEP | clause zero; clean-state hail branch, bespoke honest
SP2-109 | KEEP | borrowing card; doss flags + mail row verified
SP2-110 | KEEP | adoption rite; sell counter + shipScreen dressing, bespoke honest
SP2-111 | KEEP | seed debt; faction_understory.js verified at src/systems/faction_understory.js
SP2-112 | KEEP | toll riddle; gate interaction + hull read, bespoke honest
SP2-113 | KEEP | invoice poem; fine counter footer verified
SP2-114 | KEEP | queue miracle; delivery timing check + greeting verified
SP2-115 | KEEP | lost flag; debris POI + dock choice, bespoke honest
SP2-116 | KEEP | morrow's hundredth; MORROW_LINES + freshMorrowMemory verified
SP2-117 | KEEP | vesper's lost phrase; pitch-order check + VESPER_LINES verified
SP2-118 | KEEP | bracket's perfect game; collision counter + hail variant verified
SP2-119 | KEEP | ruckus closes; work-order counter verified
SP2-120 | KEEP | rubric's autograph; marking counter + dressing, bespoke honest
SP2-121 | KEEP | solstice's lantern; calendar dark window + light radius verified
SP2-122 | KEEP | quill's second copy; copy-stamp check verified (src/data/quill.js clean)
SP2-123 | KEEP | ruud's nineteen hours; day counter + RUUD line variant verified
SP2-124 | KEEP | eighth bell answers; clean-pulse receipt verified
SP2-125 | KEEP | blind welder; assist counter + hail variant verified
SP2-126 | KEEP | kiln cools; runtime counter + state transition, bespoke honest
SP2-127 | KEEP | pallet jack; unsecured-cargo watcher, bespoke honest
SP2-128 | KEEP | scissorwake mercy; roamer gate on hull state, bespoke honest
SP2-129 | KEEP | wreck court recess; oneOffCast verdict branch, bespoke honest
SP2-130 | KEEP | gallery rock; marking-state scan copy verified
SP2-131 | KEEP | cold drill four; proximity + shift-phase PA row verified
SP2-132 | KEEP | claim wedding; claimableBodies + joint flag, bespoke honest
SP2-133 | KEEP | reheat ceremony; cargo-drop trigger + crusher cue, bespoke honest
SP2-134 | KEEP | buoy chain; scan-order counter + cache verified
SP2-135 | HONE | H-26: coin waives the authored Dione dispute once + wall dressing; no generic lien system
SP2-136 | KEEP | rope cache; HELIOS_ROPE_CACHE pattern verified
SP2-137 | KEEP | coffin cache; orbit POI + massline nudge, bespoke honest
SP2-138 | KEEP | scale zero; seeded rock flag + mass override, bespoke honest
SP2-139 | KEEP | overtime locker; two-scan flag gate verified
SP2-140 | KEEP | counterfeit beacon; scanClues stale pattern verified
SP2-141 | KEEP | wreck not wrecked; scan-count dressing + trade, bespoke honest
SP2-142 | KEEP | insurance scam; pallasHiddenCache CHOICES pattern verified
SP2-143 | KEEP | chess game; visit counter + interior states verified
SP2-144 | KEEP | stowaway cache; loss-ledger read via clean cargo events, bespoke honest
SP2-145 | KEEP | census misspelling; chart copy variant + hail line, glue honest
SP2-146 | KEEP | fog rack; occlusion state + POI reveal, bespoke honest
SP2-147 | KEEP | gravity well garden; jettison + garden stage reuse, bespoke honest
SP2-148 | KEEP | confession booth; heat seam + delayed band line, bespoke honest
SP2-149 | KEEP | sedna marker; bearing-follow check + POI, bespoke honest
SP2-150 | KEEP | double take double; scan-shadow interaction + module grant verified
SP2-151 | KEEP | tool ledger; ropeable item + claim-office return verified
SP2-152 | KEEP | coupling riddle; dock-attempt dialog state, bespoke honest
SP2-153 | KEEP | tithe audit; jettison counter + dressing verified
SP2-154 | HONE | H-27: key to hailing the channel; there is no free-form transmit
SP2-155 | KEEP | tide ledger; hold-timer + dressing verified
SP2-156 | KEEP | unbroken offer; listen mission + inventory item, bespoke honest
SP2-157 | KEEP | last pod; impulse-sensitive cut via masslineImpactDamage verified
SP2-158 | KEEP | pour margin; post-thread dressing + codex verified
SP2-159 | KEEP | cell debt; purchase counter + pricing flag, bespoke honest
SP2-160 | KEEP | count completion; doss gate + count-audio variant verified
SP2-161 | KEEP | third half; three-scan sequence + hidden POI, bespoke honest
SP2-162 | KEEP | habitat interview; hold-state check + dressing cue, bespoke honest
SP2-163 | KEEP | field's reply; flag-keyed hail branch verified
SP2-164 | KEEP | warm freighter; cargo jettison + tab flag, bespoke honest
SP2-165 | KEEP | garden's fourth; proximity persistence + plaque state machine, bespoke honest
SP2-166 | KEEP | preserved cockpit; session scan counter + manifest lines verified
SP2-167 | KEEP | empty skin; two-visit state + hull-class read, bespoke honest
SP2-168 | KEEP | broken shepherd; kill-event proximity + wreck-herding presentation, bespoke honest
SP2-169 | KEEP | lung's breath; cycle timer + economy-linked pitch, bespoke honest
SP2-170 | KEEP | vigil array; watch interaction + wall dressing, bespoke honest
SP2-171 | KEEP | stake bookmark; quill flag read verified
SP2-172 | KEEP | tether memorial; near-death record + dressing verified
SP2-173 | KEEP | slurry relic; commodity-context scan verified
SP2-174 | KEEP | burn claim pin; jettison-ignite + flame dressing verified
SP2-175 | HONE | H-47: drop the fake airtime mechanic; payoff is the edited-hail variant + band priority
SP2-176 | KEEP | tender's lullaby; calendar audio + harmony response verified
SP2-177 | KEEP | misdeclared freight; scan context + delivery mission, bespoke honest
SP2-178 | KEEP | lost freight; cross-reference between POI and board, bespoke honest
SP2-179 | KEEP | guest book; hold-timer + text state machine, bespoke honest
SP2-180 | KEEP | ash pins; two-visit flag + combined overlay verified
SP2-181 | KEEP | escort of one; proximity escort + standing + item, bespoke honest
SP2-182 | KEEP | bond audit; clamp hold + lawful-state read, bespoke honest
SP2-183 | KEEP | false gate sparks; seasonal surge + one-rotation cue, bespoke honest
SP2-184 | KEEP | last shift witness; doss flag + bell-window interaction, bespoke honest
SP2-185 | KEEP | grudge interview; impoundGrudge state read verified (dirty — request)
SP2-186 | HONE | H-28: key to courier contracts completed in-sector; no lane-history ledger
SP2-187 | HONE | H-29: witness = one assist/scan/dock in the window; drop open-ended maneuver watching
SP2-188 | HONE | H-30: comms popup + flag; resultsSheet/demoEnd are dirty
SP2-189 | KEEP | jump attribution; jump counter + two popup rows, glue honest
SP2-190 | KEEP | 47-A refund; day gate + payout + codex tense swap verified
SP2-191 | KEEP | 47-B cold call; spine gate + packet state machine, bespoke honest
SP2-192 | KEEP | B8 bloom; flag + coordinate POI reveal, bespoke honest
SP2-193 | KEEP | endings' return mail; spine end-state mail rows verified
SP2-194 | KEEP | second count; post-SP2-160 dressing + ledger page verified
SP2-195 | KEEP | correction of record; news weighting variant, bespoke honest
SP2-196 | KEEP | yard reunion; provenance read + cull-meter cue, bespoke honest
SP2-197 | MERGE->SP2-007 | same bulkhead-graffiti core; fold the eighth tally in as the second trigger
SP2-198 | KEEP | quiet's one question; refusal-deed read + receipt variant verified
SP2-199 | KEEP | registry's last field; station-crawl check + dressing verified
SP2-200 | HONE | H-31: comms sequence + one flag + next-session mail row; no results-sheet edit
SP3-001 | KEEP | glint hour; existing coat response + calendar hook verified
SP3-002 | HONE | H-32: corrected seam — new mood-overlay file via beginLookMood/tuneLook; resolveLookLighting does not exist
SP3-003 | KEEP | unannounced flare; second rig key via cue row, call-site only
SP3-004 | KEEP | zodiacal shelf; background structure row verified, pure data
SP3-005 | KEEP | comet perihelion; L6 comet + weatherMeteors slots verified
SP3-006 | KEEP | lantern winks; paintedSky strength overlay verified; merge target of SP3-020
SP3-007 | HONE | H-33: global gain envelope only; the spatial terminator claim is false
SP3-008 | HONE | H-32: second fill channel as a mood-overlay data file
SP3-009 | HONE | H-48: zone-occupancy rig boost is per-frame glue through tuneLook; relabel data+glue
SP3-010 | KEEP | ring-plane flash; bespoke labeled honestly, payoff worth it
SP3-011 | KEEP | cold glint; hash32 idiom + pooled sprite verified
SP3-012 | KEEP | mirror train; convoy rows + tell lights verified
SP3-013 | HONE | H-34: relabel data+glue; gas row + one call-site read
SP3-014 | KEEP | sun dogs; sky-plate accent pair, pure data
SP3-015 | MERGE->SP3-002 | same umbra core seen from a station; fold the lamp wave into the eclipse package
SP3-016 | HONE | H-35: capture via scan pulse inside the window; no photo-mode dependency
SP3-017 | KEEP | ghost limb; pooled cue sprite + seeded position verified
SP3-018 | HONE | H-32: long twilight as a mood-overlay data file
SP3-019 | KEEP | eclipse bulletin; worldClock _news + calendar row verified, pure data
SP3-020 | MERGE->SP3-006 | same plate-wink source; fold the Quiet Night double-pulse as the second observation
SP3-021 | KEEP | aurora crown; storm-season emissive + sustained light, bespoke honest
SP3-022 | KEEP | anvil breathes water; pooled particles + bounded cooling field, bespoke honest
SP3-023 | KEEP | lightning web; explosionIgnition + gas flash verified
SP3-024 | KEEP | ring rain; weatherMeteors slot reuse verified; merge target of SP1-149
SP3-025 | KEEP | sling chime; audioRecipes additive verified
SP3-026 | KEEP | still eye; zone record + band-predicate exemption, bespoke honest
SP3-027 | KEEP | plunge runners; zone presence + reentry heat model verified
SP3-028 | KEEP | moonrise; signatureHero addition verified
SP3-029 | KEEP | shoot the crown; landmarkMissions row verified
SP3-030 | KEEP | ember trail; destruction beats + death-tier row verified
SP3-031 | HONE | H-32: one-watch rig overlay via the corrected mood-overlay seam
SP3-032 | HONE | H-36: buoy-lamp ripple only; drop the star-shear claim
SP3-033 | KEEP | fiddle strings; worldOneOffs tether + wind-pitched recipe verified
SP3-034 | KEEP | band survey; landmarkMissions + place_lane_beacon verified
SP3-035 | KEEP | anvil lighthouse; authoredPlaces + beacon channel verified, pure data
SP3-036 | KEEP | ocean glint walk; planet specular band, bespoke honest
SP3-037 | KEEP | aurora warning; calendar:stormSeason branch verified
SP3-038 | KEEP | skimmer shift; zone presence + npcJobs persistence verified
SP3-039 | KEEP | planet blinks; emissive envelope overlay, glue honest
SP3-040 | KEEP | ice halo; opticStructures scatter + cue light verified
SP3-041 | KEEP | curtain rises; weather volume presentation verified
SP3-042 | KEEP | static crawl; _statusMatterVfx attachment verb verified (10 call sites)
SP3-043 | KEEP | streamer field; ribbon wind bias at the trail call-site, honest
SP3-044 | KEEP | the fireball; explosionBeat + weatherMeteors slot verified
SP3-045 | KEEP | dust shear; asteroidMotion impulse wave verified
SP3-046 | KEEP | silence front; audio duck param verified in presentationAdapters
SP3-047 | KEEP | front riders; zone presence + tell lights verified
SP3-048 | KEEP | forecast bell; weatherSeasonAt pure read + recipes verified
SP3-049 | KEEP | hail of ore; mining yield window verified
SP3-050 | KEEP | the wash; racingSetPieces wave row verified + field registration
SP3-051 | KEEP | ride the front; landmarkMissions + phase predicate verified
SP3-052 | KEEP | weathered buoy chain; lamp channels keyed to weatherSeasonAt verified
SP3-053 | HONE | H-37: gas-volume motes only; cut hull-settling and thrust-shedding
SP3-054 | KEEP | fog bank; zone gas-opacity envelope verified
SP3-055 | KEEP | rime lightning; pooled arc with hold phase, bespoke honest
SP3-056 | KEEP | shelter advisory; apron streaks + fee note verified
SP3-057 | KEEP | lightning catcher; event-light pool + mast donor verified
SP3-058 | KEEP | sails take the wind; ANVIL_ORCHARD_GUST_PROFILE verified
SP3-059 | KEEP | marooned trawler; single-spawn + tow + flare cue verified
SP3-060 | KEEP | the clearing; structure lerp + exhale recipe verified
SP3-061 | KEEP | barometer ghost; boundary warp presentation, bespoke honest
SP3-062 | KEEP | storm riders' shrine; memorial donor + seasonal ledger verified
SP3-063 | HONE | H-38: articulation sleeps beyond 600 WU; sparks on player-near ticks only
SP3-064 | KEEP | unstable cluster; staged fractures (v15) + light chain verified
SP3-065 | KEEP | boulder binary; asteroidMotion pair keyed to simTime verified
SP3-066 | KEEP | crusher trail; job runtime + taut-line presentation verified
SP3-067 | KEEP | sluice pulse; killMachinePhase verified at line 820
SP3-068 | KEEP | shed panel; aftermath fragment donors on seeded schedule, data honest
SP3-069 | KEEP | measured ring; opticScatterSpecsFor verified
SP3-070 | KEEP | separate the dancers; massline job on the binary bodies, bespoke honest
SP3-071 | KEEP | glitter vein; miningYield light rows verified, data honest
SP3-072 | KEEP | measured rock; worldOneOffs row + calendar shrink verified
SP3-073 | KEEP | grinding halt; seeded terminal tick + news, bespoke honest
SP3-074 | KEEP | wolf pack; scavenger presence + job signature lights verified
SP3-075 | KEEP | the quiet zone; gas stillness scalar + seeded row verified
SP3-076 | KEEP | avalanche; _spawnCollisionThrowSpray verified at vfx.js:11725
SP3-077 | HONE | H-39: cap 12 layers with oldest fade; unbounded growth fails perf law
SP3-078 | KEEP | rock crossing; wire + deterministic convoy verified
SP3-079 | KEEP | workfleet crossing; crossing row shape verified in racingSetPieces
SP3-080 | KEEP | boulder garden; deterministic cluster row, pure data
SP3-081 | KEEP | slow kiss; world.records durable bodies + shear family, bespoke honest
SP3-082 | KEEP | photograph of the kiss; landmarkMissions row with impact window, data honest
SP3-083 | KEEP | the pour; fieldSustain slot pattern verified, bespoke honest
SP3-084 | KEEP | kiln door; emissive envelope on existing story prop verified
SP3-085 | KEEP | all the bells; lamp-bus envelope + existing toll recipe verified
SP3-086 | KEEP | shift cascade; lamp-bus wave keyed to stationShiftAt, zero new systems
SP3-087 | KEEP | dry dock dance; everyday-kit donors verified
SP3-088 | KEEP | radiator bloom; emissive envelope on finishes, data honest
SP3-089 | KEEP | fire the furnace; sectorWonders build pattern verified, bespoke honest
SP3-090 | KEEP | clockwork yard; simTime-mod articulation, no sim cost
SP3-091 | KEEP | welding constellation; hashed drone flash timings, pure data
SP3-092 | KEEP | drill choir; miningContact row + chord recipe verified
SP3-093 | HONE | H-40: announcement + apron dim only; drop the traffic re-route claim
SP3-094 | KEEP | the inspection; headlight slot + patrol row, data honest
SP3-095 | KEEP | last anvil; forge donor + articulated hammer verified
SP3-096 | KEEP | annealing glow; emissive ramp + steam, bespoke honest
SP3-097 | KEEP | bell ringer's apprentice; landmarkMissions + lamp toggles verified
SP3-098 | KEEP | the governor; fragment shard + alarm channel verified
SP3-099 | KEEP | machine that waits; scan-identity audio + simTime articulation, data honest
SP3-100 | KEEP | foundry bell; positioned ducked cues verified
SP3-101 | KEEP | night shift hymn; oscillator-chord recipe, pure data
SP3-102 | KEEP | market day rush; calendar:rushHour verified emit
SP3-103 | KEEP | funeral line; convoy row + lamp override verified
SP3-104 | KEEP | festival bunting; lamp finishes toggled by festival predicate, pure data
SP3-105 | KEEP | fire drill; SIDE_EVENTS vocabulary verified
SP3-106 | KEEP | quiet night itself; lamp floor override keyed to festival row, pure data
SP3-107 | KEEP | bargain light; lamp channel + codex pattern verified, pure data
SP3-108 | KEEP | dock choir; STATION_LIFE_AUDIO_RECIPES verified import
SP3-109 | KEEP | bay seven's cargo; popup + pickup spawn verified
SP3-110 | KEEP | tent city; festival-keyed dressing stream verified
SP3-111 | KEEP | searchlight argument; two headlight slots + patrol pair, pure data
SP3-112 | KEEP | roll call; namesForTheDead verified; merge target of SP3-180
SP3-113 | KEEP | tug race; articulated tugs on a circuit, bespoke honest
SP3-114 | KEEP | courteous lights; headlight pattern hook, bespoke honest
SP3-115 | KEEP | the sitter; zero-agency worldOneOffs row, pure data
SP3-116 | KEEP | laundry day; gas puffs + proxy props with sway verified
SP3-117 | KEEP | paper plane; ballistic prop + burnout cue verified
SP3-118 | KEEP | auction chime; festival priceTilt + chime verified
SP3-119 | KEEP | hitchhiker; pickup entity + massline carry verified
SP3-120 | KEEP | grid restart; lamp section wake sequence verified
SP3-121 | KEEP | reactor bloom; emitDestructionLightBeats data-row extension verified
SP3-122 | KEEP | the magazine; lamp sequence + emitExplosionPhase verified
SP3-123 | KEEP | cooling cinder; emissive ramp keyed to time-since-death verified
SP3-124 | KEEP | paint tally; claim markers + two-light NPC, bespoke honest
SP3-125 | KEEP | open vault; cargo drop path + pod strobes verified
SP3-126 | KEEP | long fall; durable world-record body + reentry presentation, bespoke honest
SP3-127 | KEEP | echo wreck; lamp-bus envelope on one wreck, simTime modulo
SP3-128 | KEEP | pilgrim's rest; plate donors + seeded count verified
SP3-129 | KEEP | loss notice; chronicler facts + worldClock news verified
SP3-130 | KEEP | the scuttle; kill-path variant via the new dyingHull path, honest
SP3-131 | KEEP | survivor's lamp; pod payload + lamp states + dock receipt verified
SP3-132 | KEEP | beacon's last light; wreck state -> lamp removal verified
SP3-133 | KEEP | last photograph; breaker convoy schedule, bespoke honest
SP3-134 | KEEP | debris halo; shard pool + authored alignment pass, honest
SP3-135 | KEEP | uncooling wreck; persistent emissive + latch pulse verified
SP3-136 | KEEP | bell tolls for you; player:death duck + toll cue verified
SP3-137 | HONE | H-41: audio pulse + proximity gate; skip the HUD breathing
SP3-138 | KEEP | hum at sker; proximity+stillness audio gate verified
SP3-139 | KEEP | tether note; tension oscillator + cable shimmer, call-site note
SP3-140 | KEEP | meteor hiss; doppler cue on tracked slots verified
SP3-141 | KEEP | whisper buoy; contactDeedMemory ledger verified, bespoke honest
SP3-142 | KEEP | chime field; optic-field hit events verified
SP3-143 | KEEP | choir trawl; engine-pitched oscillators, bespoke honest
SP3-144 | KEEP | time signal; stationOffsetS verified at worldCalendar.js:37
SP3-145 | KEEP | jukebox ghost; authored wrong recipe + festival gate verified
SP3-146 | KEEP | resonant rock; strike-pitched cue + shimmer verified
SP3-147 | KEEP | doppler festival; apron mix layer gated by race window verified
SP3-148 | MERGE->SP1-093 | same audio-dead-region core; implement both sites off one audio-gate seam
SP3-149 | KEEP | toll echo; three delayed positioned cues verified
SP3-150 | KEEP | singing wires; tether substrate + wind-pitched oscillator verified
SP3-151 | KEEP | 40-day chord; year-boundary gate + stacked recipes verified
SP3-152 | KEEP | quiet watch; MUSIC_STEMS gain row verified at audioRecipes.js:3947
SP3-153 | HONE | H-42: two cross-fading background accents; drop the data-only focus-pull claim
SP3-154 | HONE | H-43: static seasonal void corridor; a moving crossing is bespoke background animation
SP3-155 | KEEP | slow lens; bounded well kernel registration, bespoke honest
SP3-156 | HONE | H-44: post override via LOOK_POST_UNIFORMS/mood path; resolveLookPost does not exist
SP3-157 | KEEP | pulse source; migrating cue sprite via season hash verified
SP3-158 | KEEP | beacon that isn't; season-hash step function + codex track, data honest
SP3-159 | KEEP | static ship; zero-agency row + authored shadow offset, bespoke honest
SP3-160 | KEEP | prism hour; opticField splinter path driven by bearing predicate, bespoke honest
SP3-161 | KEEP | mirror escort; mirrored doctrine routes verified
SP3-162 | KEEP | triangulation; landmarkMissions + scan logs verified
SP3-163 | HONE | H-45: register the patch as its own tiny volume + clear-reading forecast line
SP3-164 | KEEP | glitter path; pure coat geometry + data row verified
SP3-165 | KEEP | dark survey; three targetLocalPos steps verified (CAVED_SHAFT pattern)
SP3-166 | KEEP | twin flash; paired cue lights on simTime gate verified
SP3-167 | KEEP | surveyor's rest; zero-agency donor row, pure data
SP3-168 | KEEP | number station; weather read three seasons out, pure and deterministic
SP3-169 | KEEP | phantom patrol; lamps-off-until-hailed gate verified
SP3-170 | KEEP | breath of the veil; plate strength keyed to simTime modulo verified
SP3-171 | KEEP | pixel star; background star + chartable place record verified
SP3-172 | KEEP | shadow bands; brightness ripple keyed to the eclipse envelope verified
SP3-173 | KEEP | standing watch; lamp-pattern exchange mission, bespoke honest
SP3-174 | KEEP | cold fire; gas flame layer + frost rim, bespoke honest
SP3-175 | KEEP | broken clock; station-scoped offset via the stationOffsetS path verified
SP3-176 | KEEP | ghost hail; registry-flagged ghost contact + degraded recipe verified
SP3-177 | KEEP | aurora ladder; curtain stacking + sustained light verified
SP3-178 | KEEP | vanishing field; discovery-bag ledger + row placement, bespoke honest
SP3-179 | KEEP | year bell; calendar gate + existing bell recipes verified
SP3-180 | MERGE->SP3-112 | the roll call and its witness-pause are one sequence; fold the pause into SP3-112
SP3-181 | KEEP | founder's letters; lamp group envelopes from known timing, pure data
SP3-182 | KEEP | market bells; marketDayAt gates verified
SP3-183 | KEEP | shift whistle; whistle + per-sector delayed echo verified
SP3-184 | KEEP | tally eve; provenance fines ledger (v14) + comms sequence verified
SP3-185 | KEEP | calendar rock; notch count from calendarDay(simTime), pure data
SP3-186 | KEEP | festival beacon chain; landmarkMissions + bunting gates, bespoke honest
SP3-187 | KEEP | new year tug; lane-contact fixture on calendar gate verified
SP3-188 | KEEP | quiet minute; master duck + exposure lift verified
SP3-189 | KEEP | verge pilgrims; festival convoy + lamp floor mechanics verified
SP3-190 | KEEP | forge due whistle; five recipes + shift-cascade lamps verified
SP3-191 | KEEP | ashfall calendar; ringed prop + seasonal ledger count verified
SP3-192 | KEEP | closed books; alternate plate rows keyed to year-day verified
SP3-193 | KEEP | almanac wink; shared spectacle-live registry read verified
SP3-194 | KEEP | weather wire jingle; four recipes + forecast delivery path, pure data
SP3-195 | KEEP | watchman's kettle; worldOneOffs row + shift gate verified
SP3-196 | KEEP | last meteor; last-slot retirement event + scripted crossing verified
SP3-197 | KEEP | the almanac; witness ledger + codex page + archive scan verified
SP3-198 | KEEP | farewell light; BORROWED_SUN_PHASES verified at borrowedSun.js:13
SP3-199 | KEEP | 500th rock; seeded rock flag via scatter-salt idiom verified
SP3-200 | KEEP | ten-rock scale; landmarkMissions family + strike-pitch mechanic verified

## MY-500

SP3-019, SP3-048, SP3-194, SP2-002, SP2-042, SP2-044, SP2-095, SP2-114, SP1-104, SP1-146, SP1-024, SP1-039, SP1-072, SP1-029, SP3-004, SP3-006, SP3-014, SP3-086, SP3-104, SP3-106, SP3-144, SP3-151, SP3-152, SP3-175, SP3-182, SP3-183, SP3-190, SP3-192, SP3-195, SP3-198, SP2-008, SP2-011, SP2-030, SP2-036, SP2-041, SP2-045, SP2-050, SP2-059, SP2-087, SP2-101, SP2-113, SP2-189, SP1-001, SP1-052, SP1-053, SP1-140, SP1-135, SP1-198, SP1-177, SP1-178, SP1-005, SP1-041, SP1-042, SP1-045, SP1-047, SP1-059, SP1-060, SP1-080, SP1-083, SP1-085, SP1-099, SP1-161, SP1-187, SP1-191, SP1-193, SP1-196, SP1-197, SP1-200, SP2-003, SP2-004, SP2-005, SP2-009, SP2-010, SP2-116, SP2-118, SP2-119, SP2-120, SP2-121, SP2-123, SP2-124, SP2-125, SP2-131, SP2-141, SP3-035, SP3-052, SP3-062, SP3-080, SP3-115, SP3-128, SP3-132, SP3-158, SP3-164, SP3-167, SP3-170, SP3-088, SP3-091, SPX-A-01, SPX-A-02, SPX-A-03, SPX-A-04, SPX-A-05, SPX-A-06, SPX-A-07, SPX-A-08, SPX-A-09, SPX-A-10, SPX-A-11, SPX-A-12, SP1-002, SP1-006, SP1-007, SP1-008, SP1-010, SP1-011, SP1-013, SP1-014, SP1-016, SP1-017, SP1-018, SP1-019, SP1-020, SP1-021, SP1-022, SP1-023, SP1-025, SP1-027, SP1-028, SP1-030, SP1-032, SP1-033, SP1-034, SP1-035, SP1-036, SP1-037, SP1-040, SP1-043, SP1-046, SP1-051, SP1-054, SP1-055, SP1-056, SP1-057, SP1-058, SP1-062, SP1-063, SP1-064, SP1-065, SP1-066, SP1-068, SP1-069, SP1-070, SP1-071, SP1-074, SP1-075, SP1-076, SP1-077, SP1-078, SP1-081, SP1-082, SP1-084, SP1-086, SP1-087, SP1-089, SP1-090, SP1-091, SP1-092, SP1-093, SP1-094, SP1-095, SP1-096, SP1-097, SP1-098, SP1-100, SP1-101, SP1-102, SP1-105, SP1-106, SP1-107, SP1-108, SP1-109, SP1-110, SP1-111, SP1-112, SP1-115, SP1-116, SP1-117, SP1-120, SP1-121, SP1-122, SP1-123, SP1-124, SP1-125, SP1-126, SP1-127, SP1-128, SP1-129, SP1-130, SP1-131, SP1-132, SP1-133, SP1-134, SP1-137, SP1-138, SP1-139, SP1-141, SP1-142, SP1-144, SP1-145, SP1-147, SP1-148, SP1-150, SP1-151, SP1-152, SP1-153, SP1-154, SP1-155, SP1-156, SP1-157, SP1-158, SP1-159, SP1-160, SP1-165, SP1-166, SP1-167, SP1-168, SP1-169, SP1-171, SP1-172, SP1-173, SP1-174, SP1-175, SP1-179, SP1-180, SP1-181, SP1-182, SP1-183, SP1-184, SP1-185, SP1-186, SP1-188, SP1-189, SP1-192, SP1-194, SP1-195, SP1-199, SP2-001, SP2-006, SP2-007, SP2-013, SP2-015, SP2-016, SP2-017, SP2-018, SP2-019, SP2-020, SP2-021, SP2-022, SP2-023, SP2-024, SP2-025, SP2-026, SP2-027, SP2-028, SP2-029, SP2-032, SP2-033, SP2-034, SP2-035, SP2-037, SP2-039, SP2-043, SP2-046, SP2-047, SP2-048, SP2-049, SP2-052, SP2-053, SP2-054, SP2-055, SP2-057, SP2-058, SP2-060, SP2-061, SP2-062, SP2-063, SP2-065, SP2-066, SP2-069, SP2-071, SP2-073, SP2-076, SP2-078, SP2-080, SP2-082, SP2-083, SP2-084, SP2-086, SP2-089, SP2-092, SP2-093, SP2-094, SP2-098, SP2-099, SP2-100, SP2-103, SP2-104, SP2-106, SP2-109, SP2-111, SP2-115, SP2-117, SP2-128, SP2-130, SP2-134, SP2-135, SP2-136, SP2-138, SP2-139, SP2-140, SP2-142, SP2-143, SP2-145, SP2-147, SP2-149, SP2-150, SP2-151, SP2-152, SP2-153, SP2-154, SP2-155, SP2-156, SP2-157, SP2-158, SP2-159, SP2-160, SP2-161, SP2-162, SP2-163, SP2-164, SP2-166, SP2-167, SP2-168, SP2-169, SP2-170, SP2-171, SP2-172, SP2-173, SP2-174, SP2-175, SP2-176, SP2-177, SP2-178, SP2-179, SP2-180, SP2-181, SP2-182, SP2-183, SP2-184, SP2-185, SP2-186, SP2-187, SP2-188, SP2-190, SP2-191, SP2-192, SP2-193, SP2-194, SP2-195, SP2-196, SP2-198, SP2-199, SP2-200, SP3-001, SP3-002, SP3-003, SP3-005, SP3-007, SP3-008, SP3-009, SP3-011, SP3-012, SP3-013, SP3-016, SP3-017, SP3-018, SP3-023, SP3-024, SP3-025, SP3-027, SP3-028, SP3-029, SP3-030, SP3-031, SP3-033, SP3-034, SP3-037, SP3-038, SP3-039, SP3-040, SP3-041, SP3-044, SP3-045, SP3-046, SP3-047, SP3-049, SP3-050, SP3-051, SP3-053, SP3-054, SP3-056, SP3-057, SP3-058, SP3-060, SP3-064, SP3-065, SP3-066, SP3-067, SP3-068, SP3-069, SP3-070, SP3-071, SP3-072, SP3-074, SP3-075, SP3-078, SP3-079, SP3-082, SP3-084, SP3-085, SP3-087, SP3-090, SP3-092, SP3-093, SP3-094, SP3-095, SP3-097, SP3-099, SP3-100, SP3-101, SP3-102, SP3-103, SP3-105, SP3-107, SP3-108, SP3-109, SP3-110, SP3-111, SP3-112, SP3-116, SP3-117, SP3-118, SP3-119, SP3-120, SP3-121, SP3-122, SP3-123, SP3-125, SP3-127, SP3-129, SP3-131, SP3-134, SP3-135, SP3-136, SP3-137, SP3-138, SP3-139, SP3-140, SP3-142, SP3-145, SP3-146, SP3-147, SP3-149, SP3-150, SP3-154, SP3-156, SP3-157, SP3-161, SP3-162, SP3-163, SP3-165, SP3-166, SP3-168, SP3-169, SP3-171, SP3-172, SP3-176, SP3-177, SP3-179, SP3-181, SP3-184, SP3-185, SP3-187, SP3-188, SP3-189, SP3-191, SP3-193, SP3-196, SP3-197, SP3-199, SP3-200
