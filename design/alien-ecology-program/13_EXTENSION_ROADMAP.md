# 13 — Extension Roadmap (follow-on packets AE-160…AE-269)

## Status

Same contract as `10_EXECUTION_ROADMAP.md`: this is a dependency map and packet
quarry, not automatic admission into the active queue. Packets continue the AE
identifier sequence so follow-on agents can claim them without colliding with
current PQ work.

## What is already built (do not redo)

- **Phases 0–10 complete** (see `IMPLEMENTATION_PHASE_0_4.md` and PR #170's
  description): canon, contamination/revelation model, infestation prop kit,
  fauna drive FSM, Cinder Nursery slice, the Phase-5 toolkit (memory priors,
  point contamination, ambient growth, capture/exposure), content waves A+B
  (14 fauna species, 5 sites), the ecology deck + phantoms + faction policy +
  missions, and the machine layer (3 kinds, directive grammar, protocol
  ladder, suppression fields, 7 structures, Witness Mark, `machine:` gate).

## How to claim a packet

Each packet names its seed in `11_CONTENT_CATALOG.md` and the seam to extend.
Conventions already wired that packets should reuse:

- **Fauna species**: add a row to `ALIEN_FAUNA` in `src/data/alienFauna.js`
  (schema: stimuli/anatomy/carrier/migrates/capturable/sessile/dormant/
  heatHunter/beamResist/physicsBody/commotion/aggregation/juveniles/trails/
  pilesDebris), a builder in `src/render/faunaVisuals.js`, drives reuse
  `FAUNA_DRIVES`. Extend drives only when no existing drive fits.
- **Ecology sites**: add a row to `ALIEN_SITES` in `src/data/alienEcology.js`
  (worldSiteId only if it needs a manifest beam-op; otherwise runtime
  materialization is automatic), a zone row in `src/data/sectorZones.js`, a
  `poi_*` row with `pos` + `runtimeOwner: 'alienEcology'` in
  `src/data/sectors.js`.
- **Machine kinds/sites**: `MACHINE_KINDS` / `MACHINE_SITES` in
  `src/data/precursorMachines.js`, builders in `src/render/machineVisuals.js`
  (`buildMachineMesh` + `buildMachineProp`), POI rows with
  `runtimeOwner: 'machineLayer'`.
- **Missions**: append `ECOLOGY_MISSIONS` rows reusing existing
  `MISSION_TYPES`; the `mission:offered` path with `source:'ecology'` is
  already allowlisted and retained.
- **Unlocks/equipment**: `src/data/modules.js` rows whose `mods` map onto the
  named gameplay multipliers; add the multiplier read at the named system
  seam.
- **Determinism**: `state.rng` / `state.simTime` only; planners take a seeded
  `mulberry32` stream. Single-writer contract: economy→credits, cargo→cargo,
  factions→rep. Never edit `test/*.expected.json` without a deliberate,
  disclosed gameplay reason.

Acceptance for every packet: focused test under `test/` extending
`alienEcology.test.mjs` patterns, `node --test` green, `check:baseline`
unchanged (currently 14/16 — two preexisting master reds), and player-route
reachability on the default game path.

---

## Phase 16 — Fauna completion (AE-160…AE-169)

The remaining six catalog species plus the half-built fauna systems that
phases 5–10 deliberately left as data stubs.

### AE-160 — Cold Bell (A15)
Seed: rings electromagnetically on pressure/radiation change — a weather
warning organism. New drive input: react to `sectorsim` storm/radiation
events rather than player stimuli. Seam: `ALIEN_FAUNA` row
(`sessile:false, dormant:true`, new `weatherListener` flag), tickFauna reads
sector weather state into `eco.stim.pressure`; visual = large hollow bell
body. Exit: bell tolls (audio cue + comms log) before a storm front arrives.

### AE-161 — Suture Mite (A16)
Seed: hull-repair organism; hostile only when removed from active repair.
Drive: `repair` — seeks damaged wreck dressing, emits repair progress into
`siteC` record. Seam: new drive case + `stim.damage` hook on
`entity:killed`/`hull:breached` events. Exit: mites visibly close a breach
row; removing them (tether) flips defense.

### AE-162 — Black Sail (A17)
Seed: ultra-thin photophore reading as debris until it reorients as one sheet.
Drive: `sail` — drifts edge-on (near-zero scanner return), flips broadside on
`stim.scan`. Seam: `ALIEN_FAUNA` row + `beamResist` high, scanner label stays
"DEBRIS" tier until scan completes. Exit: reveal moment is a scanner-tier
flip, not a spawn.

### AE-163 — Stone Lung (A18)
Seed: asteroid-buried filter organism venting gas/spores on a period. Drive:
`sessile` + periodic `vent` timer; vents feed `pointContaminationAt` local
lift. Seam: `ALIEN_SITES` anchor type `asteroid` (resolve a field asteroid as
host, not a wreck); `planAmbientGrowth` variant for rock bodies. Exit: a
catalogued asteroid vents on a clock; harvesting it spikes sector C.

### AE-164 — Pilgrim Spine (A19)
Seed: migrating line of linked organisms on an unexplained route. Drive:
`migrate` already exists — extend to chained-follow (each segment follows the
preceding entity, `eco.chainTo`). Route: multi-sector migrationRoute spanning
Veil→Ashfall (machine memory route, ties to L09 Return Bearing). Exit: the
line crosses a sector over ~10 min of sim.

### AE-165 — Empty Skin (A20)
Seed: molted giant shell — shelter/salvage/false wreck, not an enemy. Not a
fauna entity: implement as a colonizable derelict site (`ALIEN_SITES` row,
`faunaCast` empty, `carrier:false`) that scanners flag with `signature:
'fauna'` until close-resolved. Exit: one false-alarm site that becomes a
weather-shelter point.

### AE-166 — Juvenile stages
`juveniles` exists on species rows as spawn-on-kill filler only. Make it a
stage: `eco.stage: juvenile|adult`, juveniles grow to adults on a timer,
different drives/scales. Seam: fauna spawn spec `stage` field; `tickFauna`
promotes. Exit: ruptured carrier sacs produce juveniles that mature.

### AE-167 — Live-capture completion
AE-059 latches `captured` on tether; complete the loop: captured entity
despawns into cargo as `cmdty_live_specimen` (new commodity,
`biohazard:true`), feeds `REVELATION_SOURCES.sample_collected`, and
G13 Capture Cradle raises survival odds. Seam: tether release handler →
cargo.add (single-writer: cargo system owns it — emit intent, let cargo
write). Exit: tether → hold → sell at faction_quiet premium.

### AE-168 — Aggregation herding
`aggregation` field exists; make clustered species share drive state through
`ae.signals` (a flock alarm propagates via field coherence, exactly the "one
turns, all turn" behavior D01 leans on). Exit: scattering one member
staggers the rest within a radius.

### AE-169 — Fauna balance + census pass
Playtest-drive pass over the 20 species: speeds, alertR, bloom thresholds,
scanLabel tiers. Produce a `test/fauna-census.test.mjs` asserting every
species row is spawnable, every drive is exercised, no dead schema fields.
Exit: zero unused schema keys.

## Phase 17 — Infection morphology (AE-170…AE-177)

B-table growths as dressing variants inside `planInfestationModules` /
`planAmbientGrowth`. Each is one kit archetype + one behavior hook. Builder
side: extend `buildAlienGrowthProp`/`machine prop` families or the
`alien_growth_*` placeIds already routed in `partsLibrary.js`.

### AE-170 — Nerve Lace + Red Core (B01, B02)
Fine filament webbing + pulsing nucleus node. New placeIds
`alien_growth_nerve_lace`, `alien_growth_red_core`; red core pulses on
`stim.heat` (emissive tick). Exit: two dressing types seeded into ring plans.

### AE-171 — Calcite Collar + Lung Bladder (B03, B04)
Mineral shell ring (hardened growth, blocks tether) + rhythmically inflating
sac (drives the Breathing Dock's pressure cycle sound/beat). Exit: collar is
the first non-destructible growth prop; bladder breathes on a 24s period.

### AE-172 — Spore Chimney + Memory Knot (B05, B06)
Vent column that lifts `pointContaminationAt` locally + archive node that
raises R one tier on close scan (revelation source `memory_knot`). Exit:
knot is a one-shot discovery beat per site.

### AE-173 — Silt Root + Mirror Membrane (B07, B08)
Buried root lines radiating from sites (dressing-only migration trace) + a
flat membrane that reflects scanner pings — spawns phantom-style pings
without being one (investigation bait). Exit: membrane reads as contact
until approached.

### AE-174 — Dead Crown + False Cable (B09, B10)
Starved crown formation marking a burned-out site + cable-imitating growth
that visually merges with station umbilicals (the "is it infrastructure or
is it alive" read). Exit: both placeable; false cable requires scan tier ≥2
to resolve as biology.

### AE-175 — Morphology planner upgrade
`planInfestationModules` gains per-site `morphologyMix` (which B-rows a site
draws from) so sites read distinct, not just recolored. Exit: nursery ≠
garden ≠ dock prop fingerprints.

### AE-176 — Growth state decay
Severed/killed growth transitions: `severed` sites dim emissives and stop
ambient spill (planAmbientGrowth already gates on state — extend to dressing
palette swap). Exit: revisit a severed site and it reads dead.

### AE-177 — Morphology census test
Assert every B-row placeId resolves a builder and every site picks at least
three distinct morphologies.

## Phase 18 — Field language behaviors (AE-178…AE-185)

The D-table systemic events: ecological behaviors the player witnesses
crossing site boundaries. All are `signals`/`handleAlienEcologyEvent`
extensions — no new systems.

### AE-178 — Synchronized Turn (D01)
On a relay pulse signal, all fauna within a site rotate toward the signal
source for one beat. Exit: visible "all heads turn" moment, test asserts
rot delta.

### AE-179 — Relay Pulse (D02)
Sites sharing a strain emit a periodic coherence pulse (signal event +
emissive flash on growth dressing). Exit: two same-strain sites pulse in
phase when both awake.

### AE-180 — Panic Cascade (D03)
`entity:killed` of one fauna raises `commotion` drive on all same-site fauna
for N seconds (existing `commotion` field becomes the timer). Exit: one kill
routs a flock.

### AE-181 — Route Echo (D04)
A fauna cast inherits a dead host's docking path: members fly a recorded
approach spline then scatter (uses `migration` infra, waypoint list from the
host wreck's arrival). Exit: warm freighter swarm flies the docking lane.

### AE-182 — Heat Bloom (D05)
Dormant growth within `alertR*2` of a powered structure wakes when that
structure powers up (already the nursery beat — generalize to any site with
`heatWakes:true`). Exit: Quiet Ice's powered drill wakes its understory.

### AE-183 — Dead Pocket boundary (D06)
Extend suppression fields: crossing the boundary drops `ae.signals` coherence
to zero instantly (visual hard edge, not gradient). Exit: fauna inside a
null corridor are inert; step out and they resume.

### AE-184 — Predator Silence (D07)
When a heatHunter is present in a site, other drives dampen (flee weight +
forage 0). Exit: furnace maw entering a garden silences it.

### AE-185 — Spore Weather + Cross-Species Warning (D08, D10)
Sector weather front modulates migration speed/phantom count; a flee event
in one species propagates to unrelated infected species after ~2s delay.
Exit: weather file hook + inter-species alarm delay.

## Phase 19 — Site wave C (AE-186…AE-194)

The remaining nine catalog locations (C04, C07–C15). Each: `ALIEN_SITES`
row + zone + POI + fauna cast + at least one authored beat. Distribute
across Triton Wake, Phoebe Echo, Nyx March sectors so the C gradient reaches
deep space (SECTOR_CONTAMINATION_LEAN rows exist for all three).

### AE-186 — The Closed Refinery (C04)
Ceres-adjacent DMC refinery sealed mid-operation; highest-integrity
infestation — a "how did it look mid-conversion" fossil record. Threat 2,
faction_dmc zone. Exit: refinery loop props encased in calcite collars.

### AE-187 — Red Cable Yard (C07)
Salvage yard where false-cable growth merged with the power bus; yard's
lights are alive (D05 heat bloom on yard floodlights). Exit: cutting yard
power starves the growth.

### AE-188 — The Empty Habitat (C08)
Station that evacuated in hours; intact rooms, growth used the air system.
Ghost-ship boardable POI type — reuse manualInvestigation. Exit: inside
walkway dressing rows, no fauna — the colonists left.

### AE-189 — Shepherd's Ring (C09)
Anchor-beast cluster arranged around a dead relay; investigate reveals the
ring is the containment measure. Exit: destroying anchors releases a bloom.

### AE-190 — Black Orchard (C10)
Glassback forest in shadowed space; growth rows are sessile A09-tier
organisms, not fauna. Exit: forest passivates beam scanners until resolved.

### AE-191 — The Preserved Cockpit (C11)
Single cockpit held intact inside growth — crew vitals still run (L07 clue
site). Exit: boarding beat carries a crew log; recovery feeds evidence.

### AE-192 — Split Station (C12)
Half-converted station: clean side crewed, grown side sealed. Faction
incident live: station split is a policy vignette (E08 adjacent). Exit: one
station, two quarantine zones.

### AE-193 — Red Snow (C13)
Ice field where buried spore layers tint whole frost drifts; ambient-only
site, no cast — pure map C lift + phantom field. Exit: pretty and wrong.

### AE-194 — Towed Moonlet + Old Sterile Zone (C14, C15)
A contaminated moonlet under tow toward a populated sector (mission hook
F07/F13) + a machine-burned exclusion crater with zero C (J11 adjacent —
the absence is the tell). Exit: two extremes bookending the model.

## Phase 20 — Mission wave B (AE-195…AE-203)

Remaining F-table missions. Reuse `ECOLOGY_MISSIONS` + existing
`MISSION_TYPES`; each packet is one row + params + a test. Where a mission
needs a new type, prefer reusing `recon_scan`/`salvage_retrieval` with params
over new machinery.

### AE-195 — Bloom Burn (F07)
Timed burn-out job: clear a site's growth before bloom hits a nearby lane
(scaffolded by M06 heat trigger). Exit: deadline variant on salvage type.

### AE-196 — Cyst Convoy (F08)
Escort a sealed cyst transport through two sectors; ambush scripted by E05
bait trap. Exit: convoy type on existing escort machinery.

### AE-197 — False Contamination (F09)
Scan job that resolves to clean — payer is running a scam (E03/E10 hooks).
Exit: mission whose reward is finding nothing.

### AE-198 — Lost Route (F10) + Deep Trace (F15)
Navigation recovery via `ae.mapKnowledge` rows; deep trace requires a
surveyor prism flyby first (K02 unlock ties). Exit: two-stage intel chain.

### AE-199 — Filter Run (F03)
Timed delivery while exposure accrues — drives the AE-075 pressure loop into
a mission. Exit: exposure model on a clock.

### AE-200 — Quarantine Tow (F02)
Tow a contaminated wreck section through a checkpoint (E03 beat inside a
mission). Exit: tow mechanics + customs beat.

### AE-201 — Dead Relay (F12)
Reactivate or permanently sever a site relay; choice writes `ae.sites` state
and shifts sector C both ways. Exit: mission with a lasting map consequence.

### AE-202 — Contaminated Claim (F13)
DMC claim-jump job on an infested claim; pay scales with local C at complete
time. Exit: reward reads live contamination.

### AE-203 — Missing Crew expansion (F04)
Extend `em_missing_crew_quiet_ice` pattern to Empty Habitat + Preserved
Cockpit: same type, different resolution (cockpit survivor vs empty log).
Exit: two more instances, one twist each.

## Phase 21 — Human encounters (AE-204…AE-213)

E-table vignettes — ambient encounters where humans react to the ecology.
All ride the existing encounter-director `mysteryRate` pull (AE-072 already
biases it in high-C space); each is an encounter row + comms barks + one
systemic edge.

### AE-204 — Miners vs Ray Flock (E01)
DMC miners want a migration cleared; player can move the flock (scatter) or
clear the miners (rep). Exit: two-sided resolution, no new UI.

### AE-205 — Corporate Sample Grab (E02)
MTS hires a live-sample grab before regulators arrive — timer + faction
policy consequences at delivery. Exit: AE-076 refusal becomes a mission beat.

### AE-206 — Concord Quarantine Delay (E03)
Checkpoint encounter: a patrol holds your cargo on an ambiguous scan. Pays
off the faction policy table; Witness Mark or clean exposure waives it.
Exit: policy check encounter, skippable via K03 seal.

### AE-207 — Quiet Safe Passage (E04)
Quiet broker sells a signal profile (one-use item) that suppresses fauna
stimuli for a transit — `stim` dampening consumable. Exit: purchasable
stealth window.

### AE-208 — Reach Bait Trap (E05)
Pirates plant a heat lure beacon (G10) to pull predators onto a lane;
encounter spawns lure + incoming heatHunter. Exit: ecology weaponized by NPCs.

### AE-209 — Free Frontier Hide (E06)
Researchers concealed a harmless colony; bounty players can find/report it —
first "do you report it" ethics encounter. Exit: choice writes rep + evidence.

### AE-210 — Choir Relic (E07)
A shrine's holy thread is live filament; Choir pays for proof, Concord wants
it seized. Exit: faction split on one item.

### AE-211 — Vael Clause (E08)
The page-nine contamination clause executes: a Vael contract auto-rejects
exposed cargo. Systemic: AE-075 exposure flags cargo at trade commit. Exit:
exposure model reaches the trade screen.

### AE-212 — Salvage Union Walkout (E09)
DMC yard refuses a site; player can accept the job they won't touch for a
hazard premium. Exit: story beat + mission offer source.

### AE-213 — Insurance War (E10)
Market event: exposure history raises ship insurance premium (economy hook
on `ae.exposure` lifetime max). Exit: long-tail economy pressure.

## Phase 22 — Unlock & equipment wave (AE-214…AE-225)

G-table hardware. All are `src/data/modules.js` rows + one read site in a
named system; none need new UI beyond standard module fitting.

### AE-214 — Bio-Spectral Pass (G01)
Scanner mod `mods.bioScanTier: +1` — raises effective revelation tier for
biology signatures only. Seam: scannerBiologyLabel call site. Exit: see one
rung higher on the label ladder.

### AE-215 — Filament Contrast (G02)
`mods.filamentContrastMult` — phantom contacts show a "?" flag instead of
fooling the scope. Seam: planPhantomContacts consumer. Exit: phantoms
annotated, not removed.

### AE-216 — Host Map (G03)
`mods.hostMapReveal` — contamination sectors render known `mapKnowledge`
summaries on the galaxy map. Seam: map screen reads ae.mapKnowledge (UI edit
allowed; keep minimal). Exit: learned sectors show notes.

### AE-217 — Field Coherence Meter (G04)
`mods.coherenceMeter: true` — HUD element shows live field coherence while
in a site radius. Seam: alienEcology → HUD data event. Exit: visible
coherence bar.

### AE-218 — Echo Recorder (G05)
`mods.echoRecorder` — records one relay pulse per sector into intel log
(revelation source `relay_observed`). Exit: replayable pulse evidence.

### AE-219 — Quarantine Locker + Hull Purge Ring + Bioseal (G06/G08/G09)
Cargo hold quarantine (exposure doesn't flag stored biohazard), a
once-per-dock exposure purge, and a passive exposure mult stacking with
Filter Stack. Exit: three exposure counters at different price tiers.

### AE-220 — Heat Lure (G10)
Deployable beacon emitting `stim.heat` — pulls heatHunters off your lane.
Pairs with E05. Exit: deployable lure entity, 60s burn.

### AE-221 — Quiet Mask (G11)
`mods.stealthBioMult` — dampens your ship's `stim` emission (heat/mass) to
fauna. Seam: tickFauna stim accumulation reads ship mods. Exit: sneaking
past dormant sites becomes a build.

### AE-222 — Relay Needle + Capture Cradle + Resonant Massline (G12–G14)
Probe that reads relay health at range; tether upgrade raising capture
survival (AE-167); massline tip that doesn't wake dormant fauna on contact.
Exit: three module rows + three call sites.

### AE-223 — Quiet Equation (G15)
A machine-language decoder unlock: once Witness Mark is held, translates
`machineDirectiveLine` output into player-legible intent text. Exit:
directives show resolution hints.

### AE-224 — Module synergy pass
Ensure the G-table multipliers compose sanely (filter × mask × locker).
`test/module-synergy.test.mjs` asserting no negative/zero-total corner.
Exit: documented stacking table.

### AE-225 — Fitting economy placement
Assign each G-unlock to a faction research branch / site reward /
machine-grant path; no module should be buyable in two places. Exit:
acquisition map table in doc 06.

## Phase 23 — Resource & crafting wave (AE-226…AE-231)

H-table materials: ten contaminated-salvage commodities feeding the G-table
crafting path.

### AE-226 — Harvest loop
Killed fauna and severed sites drop `cmdty_*` bioresources (H01 calcified
filament, H03 relay nodule, H05 cyst resin, H07 host archive sample...);
each `biohazard:true`, bound to the AE-076 faction policy. Exit: six
commodity rows + drop table on `entity:killed`.

### AE-227 — Sterile shell + mineralized nerve glass (H08, H06)
High-tier materials only inside suppression fields / machine sites —
crosses the two lanes. Exit: two rare drops gated on dead pockets.

### AE-228 — Conductive fiber + membrane laminate (H02, H04)
Craft inputs for G07/G09/G11 modules. Seam: existing module-install
resource check. Exit: modules cost ecology materials.

### AE-229 — Spore catalyst + preserved interface tissue (H09, H10)
Consumable catalyst (instant exposure purge at a station fee) + story-tier
tissue that feeds revelation sources. Exit: two items, one story beat.

### AE-230 — Salvage mutation risk
Biohazard cargo held through high-C sectors can "ripen" — commodity mutates
to a rarer form or ruptures (cargo event). Exit: time-in-transit risk on
the AE-076 premium.

### AE-231 — Market tension test
`test/ecology-economy.test.mjs`: no sellable H-row is infinitely farmable
from a respawning source; every premium has a refusal counterparty.

## Phase 24 — Machine wave B (AE-232…AE-241)

The remaining twelve I-table machines. Same pattern as the built three:
`MACHINE_KINDS` row + builder + tick role. Most need only data + one
behavior clause in `tickMachineLayer`.

### AE-232 — Witness (I05)
A machine that has observed one site for millennia — zero motion, WITNESS
directive inverts: it asks YOU to hold still. Exit: presence-only encounter.

### AE-233 — Shepherd (I06)
Maintains a safe corridor through infected space — a mobile suppression
field that drifts a fixed route. Seam: `suppressionFieldAt` gains moving
centers. Exit: followable moving dead-pocket.

### AE-234 — Mason (I07)
Repairs massive infrastructure; crossing its work path while it welds a
wreck section = HOLD directive with real geometry (it welds around you).
Exit: mason + one under-construction structure.

### AE-235 — Executor (I08)
Rare enforcement machine; only appears on protocol 'revoked' — the actual
threat the grammar implies. Exit: revoked state has teeth.

### AE-236 — Courier (I09)
Carries a protocol token between dead sites; intercepting it is the only way
to read site-to-site mail (L06 clue source). Exit: interceptable token drop.

### AE-237 — Conservator + Measure (I10, I11)
Preserves sealed samples (refuses OPEN: it won't release what it keeps) +
a machine measuring one impossible variable forever (P-adjacent mystery —
its reading is a `mapKnowledge` anomaly). Exit: two prop-machines.

### AE-238 — Boundary Walker (I12)
Patrols an invisible quarantine line; crossing while it's watching flags
violation — moving exclusion (M08). Exit: patrolled border you can time.

### AE-239 — Appeals Clerk (I13)
Accepts counter-evidence: bring it a `mapKnowledge` note that contradicts a
site's classification to flip a revoked verdict (APPEAL directive made
mechanical). Exit: the only machine you can argue with.

### AE-240 — Debris Sorter (I14)
Cleans battlefields — treats human wrecks as maintenance waste. Ambient:
follows big battles and removes wreckage after a delay. Exit: salvage timer
pressure, weirdly polite.

### AE-241 — Sleeping Jury (I15)
Cluster of inert machines that awaken when three protocol conditions
coincide (violation + witness mark + revoked route present). Exit:
conditional boss-tier machine reveal.

## Phase 25 — Structure wave B (AE-242…AE-249)

The remaining J-table structures. Same recipe as Phase 10: `MACHINE_SITES`
row + propRing/layout + POI + directive.

### AE-242 — Containment Ring (J07)
A ring structure around an infected moonlet — suppression covering an
orbiting body. Exit: biggest single prop; suppression stays stable.

### AE-243 — Star Marker (J08)
A navigational lattice at sector edge; protocol-compliant players get a
route-breadcrumb beacon (map intel). Exit: machine-layer wayfinding.

### AE-244 — Quiet Dock (J09)
A machine-maintained dock that still functions; docking is permitted to
witnessed players only — the only "station" the machines run. Exit: usable
dock gated on protocol.

### AE-245 — Listening Field (J11)
Array of dish props that react to scans — scan it and it scans back
(revelation bump + protocol 'seen'). Exit: reciprocal observation beat.

### AE-246 — Empty Foundry (J12)
A manufacturing site that ran dry of inputs centuries ago and idles —
machines queue at it anyway (dark comedy beat). Exit: foundry + queue.

### AE-247 — The Line (J13)
A drawn boundary across a whole sector — no props, just a geometry wall the
machines enforce (Boundary Walker patrols it). Exit: visible-on-map
quarantine frontier.

### AE-248 — Broken Shepherd Station (J14)
A machine station half-eaten by growth: the crossover site where the lanes
collide spatially (doc 07 §12). Exit: first site with both runtimeOwners.

### AE-249 — Exception Chamber (J15)
Sealed interior where a machine stores protocol exceptions — enterable only
in 'exception' protocol state (the one fault that opens doors). Exit:
exception has a reward.

## Phase 26 — Route & access (AE-250…AE-257)

K-table unlocks — machine-side credentials and access artifacts, all
persisted under `ae.machineAccess`.

### AE-250 — Gate Handshake Token (K01)
Consumable granting one compliant transit through a machine-gated route
without a protocol record. Exit: one-shot route pass.

### AE-251 — Surveyor Prism Module (K02)
Ship-mounted prism harmonics: machines read your scan as protocol traffic —
directives resolve 'satisfied' faster while fitted. Exit: module + tick
read.

### AE-252 — Containment Seal (K03)
Cargo certification that waives E03/E08 quarantine refusals once per trip.
Exit: paperwork as equipment.

### AE-253 — Inertial Datum (K04)
A machine-shared coordinate truth: unlocks the Null Corridor's true path on
the map (K07's content). Exit: corridor renders a navigable lane.

### AE-254 — Lattice Coupler + Revocation Beacon (K05, K08)
Coupler lets you read a site's last directive without approaching; the
beacon emits a false revocation — banishes you but scares every machine in
range too. Exit: one read tool, one panic button with a cost.

### AE-255 — Gate's Exception + Unbroken Lens (K09, K10)
Exception = the permanent exemption credential (AE-249's key); lens = a
recorder that captures machine light-language for the Appeals Clerk (AE-239
evidence source). Exit: two endgame credentials.

### AE-256 — Protocol persistence audit
Serialize `machineAccess`/`machineProtocol`/`ae.machineSites` through save
load (data file already versions); test round-trip carries a Witness Mark.
Exit: credentials survive saves.

### AE-257 — Access economy placement
Every K-item needs exactly one acquisition path (site reward, mission,
Appeals Clerk, or Executor drop). Exit: table in doc 06 updated.

## Phase 27 — Clue & lore layer (AE-258…AE-265)

L-table records — physical evidence objects feeding revelation and the
P-question frame. All are `evidence`/`mapKnowledge` writes + discoverable
text.

### AE-258 — Page-Nine Clause + Old Quarantine Age (L01, L05)
Contract text proving the clause predates the infection's discovery; a
machine log dating the quarantine before human spaceflight. Exit: two
timeline-shifting records.

### AE-259 — Seventeen Probablies + Same Harmonic (L02, L03)
A Choir numerology text matching machine directive cadence; a spectrum
recording showing fauna pulses at a machine frequency. Exit: the two
cultures' overlap made physical.

### AE-260 — Dead Crew Route + Three Closed Gates (L04, L06)
A crew's last flightpath as a ghosted map overlay; evidence that three gate
closings happened the same day. Exit: route replay + a synchronized
revocation fact.

### AE-261 — Preserved Cockpit Memory + Silent Machine Reaction (L07, L08)
The C11 cockpit's recorder (a survivor's voice); proof that one machine
observed a crew death and did nothing — it wasn't tasked to. Exit: the
"not cruel, just not for you" beat.

### AE-262 — Return Bearing + Missing System (L09, L10)
A machine coordinate pointing at a sector not on any chart (the seeded
deep-route teaser); a census showing a whole mapped system was deleted.
Exit: postgame route seed + a vanished-sector mystery.

### AE-263 — Evidence ledger
`ae.evidence` surface: a discoverable-notes ledger on the map/intel screen
aggregating L-rows + REVELATION_SOURCES hits. Exit: player-readable
knowledge progress.

### AE-264 — Revelation pacing pass
Tune which L/P content lands at each R tier so tiers 0–5 each unlock exactly
one new "the world is bigger than you thought" beat. Exit: tier pacing
table + test asserting each tier has ≥1 source.

### AE-265 — Terminology audit
Sweep in-game strings for canon leaks: Vethari named only at R≥3, machine
labels never pre-guess creators, "alien" never applied to Vael. Exit:
string-lint check passing.

## Phase 28 — Hazard wave (AE-266…AE-272)

M-table hazards — how the ecology hurts you without ever being a boss
monster. Mostly flag/event additions to the exposure/impulse seams.

### AE-266 — Filter Saturation (M01)
BioFilter modules saturate in sustained high-C: mult decays over exposure
time and needs a station recharge — makes G07 a consumable commitment.
Exit: saturation state on module instance.

### AE-267 — Adhesive Tendrils + Moving Exclusion (M02, M08)
Growth rows that grab tethers/hulls (slow, not damage); machine exclusion
volumes that move on patrol. Exit: two mobile hazard volumes.

### AE-268 — Sensor Ghosting + Spore Wake (M03, M05)
Inside high-C: scanner pings return stale positions (ghost TTL); fast travel
through a spore field leaves a decoy trail. Exit: scanner lies in fog, not
silence.

### AE-269 — Relay Induction + Dormant Cyst Heat (M04, M06)
Powering machinery near a relay feeds it coherence (D05 generalized to
grid-scale: reactor-on = site wake); dormant cysts trigger on sustained
heat above threshold. Exit: your engine is an alarm clock.

### AE-270 — Pressure Rupture + Quarantine Pulse (M07, M09)
Opening a sealed compartment under pressure detonates cyst rows; a machine
quarantine pulse scrubs all fauna in a radius — including your captured
cargo. Exit: two sharp edge cases.

### AE-271 — Memory Panic (M10)
High-exposure player state: phantom contacts gain false hostile signatures
— the model's psychological edge, one tier past `severe`. Exit: exposure
tier 3 as paranoia mechanic.

### AE-272 — Hazard balance sheet
Table of every M-row: trigger, cost, counter. Assert each hazard has at
least one counterplay module/action. Exit: no unavoidable damage.

## Phase 29 — Setpieces (AE-273…AE-282)

N-table authored moments — the roadmap's Phase-14 beats broken into
implementable packets. Each is scripted via existing beat/directive/events;
no new cinematic machinery.

### AE-273 — The First Turn (N01)
First-contact setpiece: entering a dormant site, the whole growth ring
rotates toward the player ship. Exit: one unforgettable screenshot.

### AE-274 — The Living Wreck (N02)
A wreck resolves as alive mid-salvage — dressing breathes, POI label flips
wreck→fauna while you're inside. Exit: mid-operation reveal.

### AE-275 — The Long Migration + Carrier Shadow (N03, N08)
Pilgrim Spine crossing a populated lane; a giant carrier silhouette occludes
the sun for a sector minute. Exit: two scale beats, no combat.

### AE-276 — Gate Refusal + Safe Cylinder (N04, N05)
Machine gate refuses a fleeing convoy mid-route (witnessed refusal); a
pylon field carving one survivable pocket inside a bloom. Exit: refusal is
the event, the cylinder is the mercy.

### AE-277 — The Custodian + Breathing Station (N06, N07)
Watching a custodian repair a wreck like it owes the wreck something;
docking inside a breathing station while it inhales. Exit: two
environmental vignettes.

### AE-278 — Black Vault Opens One Meter (N09)
The vault's door cracks — inside is a hatch date older than the gate
network, and nothing else yet. Exit: the postgame hook lands.

### AE-279 — Human Override + Integrated Cathedral (N10, N11)
A DMC corpo tries to drive machinery through a site and learns machines
don't take orders (E-tables converge); the wreck cathedral revisited as a
converted structure. Exit: two thematic payoffs reusing built sites.

### AE-280 — Grief Window + Revocation Chain (N12, N13)
A 60-second window where all machine activity pauses (observed mourning?);
a route revocation cascading sector to sector on a timer. Exit: silence as
a mechanic; revocation as a map event.

### AE-281 — Ship That Blots the Star + Route Home (N14, N15)
The vessel-scale Vethari shadow passes between player and star — canon:
never rendered, shadow + scanner only; and the epilogue route home through
a reopened gate. Exit: the largest thing in the game is never seen.

### AE-282 — Setpiece harness
Each N-moment needs a deterministic trigger test (`test/setpieces.test.mjs`):
given state X, event fires once, records evidence, never refires. Exit:
setpieces are regressions-proof.

## Phase 30 — Ambient texture (AE-283…AE-292)

O-table world barks — station chatter, graffiti, market rumors. All are
data rows in existing comms/bark/market tables gated on sector C band.

### AE-283 — Station rumors set (O01, O03, O13)
Scrubbers sold out, insurance surcharges, filter price spikes — three
market/bark lines keyed on C band. Exit: clean stations talk about it.

### AE-284 — Frontier texture set (O02, O04, O12)
DON'T CUT RED THREAD graffiti, fake alien tooth scam, miner slang naming —
comms log + station texture rows. Exit: ordinary people have opinions.

### AE-285 — Contract texture set (O05, O08)
Cargo inspector refuses a seal; Vael contract auto-rejects exposed lots —
two contract-clause barks at trade commit. Exit: paperwork texture.

### AE-286 — Underworld set (O06, O07)
Counterfeit precursor tokens; a pilgrim's sterile relic — one scam, one
devotion. Exit: two quiet faith/crime notes.

### AE-287 — Instrument wrongness set (O09, O10)
Research buoy playing calls at wrong speed; wreck beacon saying SAFE over
an active metabolism scan — instruments contradicting instruments. Exit:
two scanner-era creeps.

### AE-288 — Children + nests set (O11, O15)
A kid's drawing treating rays as ordinary wildlife; a nest incorporating
station signage — hope and reuse. Exit: the ecology normalizes.

### AE-289 — Machine ambient set (O14)
A precursor robot crosses the map as a neutral unknown and never
acknowledges you — one ambient machine flyby per high-C sector visit. Exit:
the machines are traffic.

### AE-290 — Bark + comms distribution
Wire O-rows into comms:log / station barks tables by faction + C band;
test asserts no clean-sector station plays a bloom bark. Exit: gating
correct.

### AE-291 — Accessibility + readability pass
All new toasts/barks respect reduced-motion/flash and reading time; long
directives split to two lines. Exit: a11y check green.

### AE-292 — Performance dense-site pass
Profile a five-site sector (Charon at full bloom + pylon field): cap fauna
+ prop counts per sector, instanced growth meshes where count > 40. Exit:
frame cost table + budgets in doc 08.

## Phase 31 — Mysteries & convergence (AE-293…AE-299)

P-table questions are canon freight — they are never answered in code, only
evidenced. These packets plant the evidence and close the program.

### AE-293 — Origin evidence (P01–P04)
Records that let a careful player assemble "did the fungus come before the
Vethari" — four clue rows feeding the ledger without resolving it. Exit:
the question is askable, never answered.

### AE-294 — Creator evidence (P05–P07)
Machine logs implying the creators are gone vs. merely elsewhere; gate
closings that protected things that didn't exist yet. Exit: ambiguity
preserved in hard data.

### AE-295 — Route memory evidence (P08)
Fauna migration matching precursor glyph routes — the L09/AE-164 Pilgrim
Spine payoff. Exit: one overlay proving the overlap.

### AE-296 — Domain evidence (P09–P10)
The deep trace + missing system records: the domain is a question the
machines also can't classify (exception chamber text). Exit: the largest
mystery is bureaucratically admitted.

### AE-297 — Save + migration audit
Full-state serialization pass over every ae.* field added in phases 5–10:
schema bump, stale-save normalization, dead-field cleanup. Exit: old saves
load forward clean.

### AE-298 — Canon contradiction + taxonomy audit
String/asset audit: no Vethari body renders, no Vael-as-alien strings, no
machine implying a creator opinion. Exit: canon check green (extends
AE-004).

### AE-299 — Program completion review
Re-walk the doc 09 vertical-slice rubric against the finished build; write
the closing audit into this program's README. Exit: the program reports
itself done — or names exactly what remains.

---

## Claim notes for follow-on agents

- Packet order inside a phase is loose; dependency order between phases is
  loose too (a Phase 25 structure doesn't need Phase 16 fauna). The hard
  dependencies: AE-167 needs AE-059's captured drive; AE-198 needs
  mapKnowledge (AE-074); AE-239 needs the directive table (AE-092);
  AE-250–257 need `machineAccess` persistence (AE-109).
- Every new species/site/machine gets exactly one claimable unit of work:
  data row + visual + behavior + test. Do not bundle multiple catalog seeds
  into one commit unless they share a structure (AE-194, AE-285-style pairs
  are pre-grouped for that reason).
- When in doubt, the seam is: `src/data/` defines it, `src/systems/` ticks
  it, `src/render/` draws it, `test/` pins it.

---

## Phase 31 landings — acquisition map, pacing audit, closing review

### K-table acquisition map (where each credential comes from)

| Item | Earned by | Spent at |
|---|---|---|
| `cmdty_gate_handshake` | Intercepting a **courier** mid-route (io_listening_field) | `_wormholeUnlocked` consumes one on a refused `machine:` route |
| `cmdty_inertial_datum` | Approaching the **measure** engine inside `readR` (charon_star_marker) | K04 protocol-trade leverage |
| `cmdty_revocation_beacon` | Stock item only via authored salvage | Declaring yourself revoked-adjacent (carries `restricted` legality risk) |
| `cmdty_unbroken_lens` | Holding the **WITNESS** directive at veil_exception_chamber until resolved | Proof-of-exception; `ae.machineAccess.gates_exception` mints alongside |
| `mod_lattice_coupler_s` | Salvage-only module (K05) | Passive: echoes any machine site's standing directive on approach |

### L-table pacing audit (how the ledger discloses)

- **Tier 1 (L01, L02, L03, L07)**: observational — filed by first-approach `seen` beats.
  Three filed rows of any tier lift `revelation` to 2 (`recordEvidence` threshold).
- **Tier 2 (L04, L05, L06, L08)**: causal — earned through behavior (severance aftermath,
  courier intercept, a watched line crossing). These are the revelation-2 scaffolding.
- **Tier 3 (L09, L10)**: interpretive — the machines' own failure records. A single
  tier-3 row lifts `revelation` to 3: finding out the lattice *also* failed is the secret.
- **P-table (P01–P10)**: the ecology's answers — filed by deep setpieces (N12–N15) and
  the exception chamber. P-rows are what the ledger is *for*: the mystery resolves as
  evidence, never as exposition.

Terminology check (AE-298 partial): the ledger calls itself `evidence`, the machine
vocabulary stays procedural (`LOGGED`/`FILED`/`VERDICT`), and no row names a creator or
assigns intent — the lattice records, it does not explain.

### AE-299 — Program-closing review (cycle 3)

What the closing build holds end-to-end:

- The fungus is a **system** (contamination C → revelation tiers → encounter deck →
  hazards M01–M10), not a set of props. A pilot's hull accumulates exposure; sites
  remember severance; dormant sites heat-bloom on the scanner.
- The lattice is a **bureaucracy** (protocol ladder → directives → faults → appeal):
  14 machine kinds, 16 sites, a verdict economy where evidence is physical and appeals
  are locations. Protocol faults are sticky — a see-beat cannot lift a revocation
  (regression-pinned in `test/machineWaveB.test.mjs`).
- The two threads cross only at authored seams: suppression fields sterilize growth,
  the executor scrubs biohazard lots, the chamber mints a lens the growth cannot read.

Open for follow-on agents (post-program): setpieces N07/N11 remain unauthored slots in
the N-table; the O-table's `machine:true` barks assume `ae.machineProtocol !== 'unknown'`
as the knowledge gate — a future "lattice language" module could refine that; and the
P05 (shepherds_ring) mystery still lacks its firing site. The program is otherwise
self-reporting: every L/P row names the site that files it.
