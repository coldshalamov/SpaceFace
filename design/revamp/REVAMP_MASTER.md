# SPACEFACE REVAMP — MASTER PLAN (2.1)

> **The only doc every agent must read before starting a lane.** It sets the vision, the document map,
> the wave sequencing, the stable contracts you must not violate, and the reconciliation ledger.
>
> **Provenance:** distilled from the design brief, the GDD 2.0 pillars, a four-part codebase recon
> (systems maturity · specced-but-unbuilt inventory · story spine · visual-asset pipeline), the shipped
> `design/WORLD_OVERHAUL_2_1.md` (Sector Zones), and a Fable-5 architecture pass. Authored by the lead
> orchestration session.
>
> **Authority:** `ARCHITECTURE.md` (technical) > `design/GDD_2_0.md` (design) > this doc and the
> `design/revamp/BP-*.md` build plans (the build authority) > the frozen `design/spec3/` & `design/spec2/`
> threads (reference; each BP names what it extends/supersedes). Never edit spec3/spec2 retroactively.

---

## 1. NORTH STAR

**A world you can read in one glance and bend with momentum — where air is money, money is politics, and
every ship on screen has a reason to be there.**

The engine is already professional (deterministic 60 Hz sim, supply/demand economy, faction reputation,
mission boards, versioned saves). The revamp's entire job is to make that simulation **visible, legible,
and inhabited** — and to let the story *explain* what the systems already do. Air scarcity **is** the
economy. Faction squads **are** the politics. The Pit is everywhere, so the world must already be breathing
when the player arrives.

### Experience objectives (ranked by leverage)

| # | Objective | Pillar | Success test | Story multiplier |
|---|---|---|---|---|
| 1 | **Every contact has a story** — convoys, patrols, distress, named bosses exist without you | 4 | Sit still 5 min in any sector; 3 legible events happen nearby | convoys haul Silt/recyclers; The Quiet run distress-bait; Concord scans-seals-clears |
| 2 | **One glance, total comprehension** — one zoomable map; fog only at true frontier | 2 | New player finds "where is air cheap and who kills me on the way" in 10 s | the S0→S9 air gradient becomes literally visible |
| 3 | **The economy breathes on-screen** — news ticker, forecast cones, dock event cards | 4 | Player makes a speculative trade off a news item and it pays | "MTS shorts Hollow's air futures" is a headline, not lore |
| 4 | **Dogfights with a ceiling** — velocity-lead, momentum inherit, beams, overload/vent | 1 | A skilled pilot wins outnumbered by flying, not stats | — |
| 5 | **The story is in the paperwork** — dock-deny reasons, faction barks, manifest phases, Wren thread | 3 | Player grasps Vale is an administrator before any cutscene says so | this IS the theme-delivery mechanism |
| 6 | **Light that sells the fiction** — bloom, ACES, ribbon trails, faction-distinct stations | 2 | Screenshots read as a shipped game | Vael stations glow with the best air in the system |

---

## 2. DOCUMENT MAP (`design/revamp/`)

| Doc | Purpose | Owner lane |
|---|---|---|
| **REVAMP_MASTER.md** (this) | Vision, contracts, wave sequencing, reconciliation ledger | orchestrator |
| **PROGRESS.md** | **The single source of truth for task state** (DONE/IN-FLIGHT/NEXT/BLOCKED per task). Every session reads this first; every task updates it first+last. Supersedes `STATUS.md` + memory for task state. | orchestrator |
| **WAVE4_PROMPT.md** | The dispatch prompt for the unified execution track (T1–T9). Paste into a fresh session to run a task; it self-continues via the ledger. | orchestrator |
| **BP-01_WORLD_ALIVE.md** | Deepen the encounter director: named bosses, NPC miners contending belts, patrol respond-to-distress, faction-war pulses, POI behaviors | extends SPEC2/04, SPEC3-F7 |
| **BP-02_COMBAT_CEILING.md** | Damage-triangle surfacing, scanning weak-point loop, wingman tactics, boss mechanics, remaining feel | extends SPEC3-F4 |
| **BP-03_ONE_MAP.md** | Galaxy-map parity checklist, territory/fog rules, old-map retirement criteria | extends WORLD_NAVIGATION_SPEC |
| **BP-04_ECONOMY_VISIBLE.md** | NPC trade loop phase 2 (traders replace abstract flows, flag-staged), supply-chain glyphs, stock viz | extends SPEC3-F1 |
| **BP-05_STORY_WIRE.md** | Beat registry B8+, Wren/Callum/graffiti-web/endgame Choices A–E, Helix role, bark corpus use | extends SPEC3-F7 §32 |
| **BP-06_BASES_TERRITORY.md** | 12–16 claimables, visible module GLBs, upkeep, tower-defense, sector flips on map, faction-gated access | extends SPEC3-F6 |
| **BP-07_FLIGHT_TRAVERSAL.md** | Leash-steering targets, brake-to-stop, mass-wired handling, ring-lane highways, tether combat/traversal | extends SPEC3-F3 |
| **BP-08_VISUAL_ASSET_SPEC.md** | The Blender agent's ordered manifest + per-asset contracts. **Written first — longest lead time** | extends SPEC3-F8/F9 |
| **BP-09_SHIPS_FITTING.md** | Nested outfit budgets, mount size/type gating, engine/thruster split, register authored engines/weapons | extends SPEC3-F5 |
| **BP-10_POLISH_UX.md** | Tooltips everywhere, text-scale, colorblind palette, PBR heroes, drone logs, remaining graphics/audio | extends SPEC3-F10, SPEC3-F8 |

---

## 3. STABLE CONTRACTS — every lane obeys these (do not "fix" them)

1. **Determinism.** The sim NEVER calls `Math.random()`. Randomness derives from a seeded RNG domain
   (`state.<domain>.rng`) or `hash32(state.meta.seed, key)` (`src/core/rng.js`). Cosmetic/VFX code guarded
   by `typeof window` may use `Math.random`. Every new spawner/roller states its RNG domain.
2. **`factionId` is cosmetic + kill-rep ONLY.** Hostility is decided by `scanner.isHostileToPlayer`
   (team / archetype / `ai.spawnContext` / sector security). Territory and rep features route through the
   scanner seam. Never couple hostility to `factionId`.
3. **`spawnBudget.js` is the single ship-cap arbiter.** Zone ambient, the encounter director, and mission
   spawns all `request()`/`release()` slots against the ~10–14 live-ship cap. No system spawns hostiles
   without going through it. (Zone ambient in `world.js` becomes a budget client — an orchestrator-only edit.)
4. **`voiceArbiter` enforces pillar 3.** Toasts, barks, news, and story comms go through one priority
   queue (`ctx.helpers.voice.say`). Only one voice surfaces at a time.
5. **`sectorZones.js` is the placement substrate.** Encounters, missions, salvage, and base defense consume
   named zones (`zonesForSector`, `zoneAt`, `planZoneSpawns`) — no system reinvents placement geometry.
6. **Squads form via `ai.squadId`.** Spawn a coherent group by giving its members a shared
   `spec.data.ai.squadId` and clustering them; the SG-06 roster (`aiPorts.js:262`) forms them up. The AI
   brains (`src/ai/`) are already good — do not rebuild squads/formations/tactics.
7. **Additive + guarded.** Never hard-require new data; degrade gracefully. A sector with no zones keeps
   the legacy ring spawner. New GLBs fall back to procedural meshes.
8. **Merge protocol for parallel lanes.** A lane creates only its own NEW files and returns registration
   instructions; the orchestrator does all edits to shared files (`registry.js`, `world.js`, `combat.js`,
   `uiRoot.js`, `bindings.js`, `input.js`) sequentially at merge. New systems take a seeded RNG at construction.

---

## 4. WAVE SEQUENCING

**Shipped (pre-plan):** `design/WORLD_OVERHAUL_2_1.md` — Sector Zones + purposeful faction-squad spawning +
truthful factions + zone-entry cue + steady mining. Verified.

**Wave 0 (orchestrator, docs + baseline):** this doc, `BP-08` (full), BP-01…BP-10 skeletons, a captured
47-A/perf baseline for regression attribution.

**Wave 1 (parallel fleet, new-file systems — collision-free):**
`voiceArbiter.js` · `marketNews.js`+`newsTemplates.js` · `barks.js`+`dockDeny.js` · `salvage.js`+`wreckMissions.js`
· `spawnBudget.js`+`encounterDirector.js`+`encounters.js` · `galaxyMap.js`. Orchestrator integrates + verifies,
then re-consults the Fable advisor before Wave 2.

**Wave 2 (hot-file single-owner lanes):** Combat (velocity-lead + projectile momentum + beam pipeline +
missile LOS) · Story (Wren thread B8+, manifest phases, graffiti web) · Render (bloom + ACES + fog + dynamic
lights + ribbon trails) · Map integration (territory overlays, frontier-only fog).

**Wave 3 (finishers):** wingman orders → SG-06 tactics · anomaly/POI behaviors · overload/active-vent ·
Helix data row · tooltips + text-scale + colorblind · **flight-feel tuning (last — highest golden risk;
consult advisor first)** · one-map cutover (parity-gated).

**Dependency spine:** BP-08 → Blender agent runs in parallel with everything · `encounterDirector` →
BP-01/BP-05 encounters/BP-06 defense waves · `galaxyMap` → territory → BP-06 sector flips · `voiceArbiter`
→ all later talkers · NPC economy → BP-04 phase 2.

---

## 5. RISK LEDGER

1. **Spawn-budget wars** — zones + director + missions compete for 10–14 ships. `spawnBudget.js` must be the
   arbiter *before* any new spawner ships. Zone ambient becomes a budget client (orchestrator edit).
2. **Golden drift masked by pre-existing red** — `check:sim:compare` (47-A) is red for a documented
   projectile-collision *precondition*, unrelated to content. Snapshot current output; diff new combat/flight
   work against the snapshot, not against red/green.
3. **Determinism leaks** — distress-bait rolls, convoy schedules, news, bark selection must each draw from a
   named seeded domain. Keep a `Math.random` grep in the merge checklist.
4. **Economy double-counting** — NPC traders moving real goods while abstract flows still run desyncs prices.
   Traders emit the *existing* trade events, flag-gated, small volumes; replacing abstract flows is a BP-04
   decision, not a Wave-1 one. (NPC economy deferred out of Wave 1 for this reason.)
5. **Map limbo** — two-and-a-half maps is worse than two. Old maps stay fully functional until the BP-03
   parity checklist passes; cutover is a single flag flip.

---

## 6. RECONCILIATION LEDGER (explicit decisions)

1. **Helix Directorate** — the story bible's 9th faction is a *paper faction*: a data row in `factions.js`
   that appears in dock-deny text, contracts, news, and barks but owns **zero ships** (its assets fly MTS/REACH
   flags, per the bible). Resolves bible-vs-code with no spawn-table change. BP-05 owns its narrative use.
2. **Two maps → one** — `galaxyMap` supersedes `localmap.js` + `starmap.js`; the old maps stay behind a flag
   until the BP-03 parity checklist passes; deletion is a Wave-3 step.
3. **`factionId` cosmetic; hostility via scanner** — intentional architecture, not a bug. Document in every lane.
4. **Blocked whole-ship GLBs** (`kestrel`/`pelican`/`wasp`) — accessory-only, 0 hull tris; P1 re-author in
   BP-08. Nothing gates on them; procedural fallback is the contract working as designed.
5. **Story beat registry** — B0–B7 are code truth; all written-not-wired content gets B8+ IDs in
   `narrative.js`; BP-05 is the single numbering authority.
6. **Sector Zones are the placement substrate** — see contract §5.5; no system reinvents placement geometry.

---

## 7. THE STORY SPINE (context every lane should honor)

Air is rationed as a weapon. **Silt** (a CO2-scrubbing catalytic slurry) degrades and must be replaced;
**Director Vale** — an administrator, not a villain — initials an allocation algorithm that decides which
station suffocates. The protagonist **Wren** secretly hunts a Vethari (alien) artifact trail to find his lost
sister. Theme: *the Pit is everywhere; you've been breathing it the whole time.* Traveling **S0 Pit → S1 Helios
core → S2-3 trade → S4-5 survival → S6-7 scavenging → S8 Veil (the Vael have the best air) → S9 Ashfall** is
traveling to the truth of the world you started in. Factions differ by voice and method (Concord bureaucratic,
MTS mercantile, Drift blue-collar, Crimson Reach predatory-but-poor, The Quiet terse, Choir zealot, Free
independent, Vael alien-formal). Deliver all of it **through systems, one voice at a time** — dock-deny text,
faction barks, market headlines, manifest phases — never a wall of lore. Full canon in `docs/worldbuilding/`.

---

## 8. THE DETAIL DOCTRINE (governs Wave 3+ and the "attention to detail" layer)

The flat/empty/cheap feeling is not missing features — it's features the player can't **see**, **predict**, or
**change**. The governing filter, applied to every detail: **"A detail earns its place only if the player can
see it, predict it, or change it. If none of the three, it's not detail — it's cost."** Full constitution:
[`DETAIL_DOCTRINE.md`](DETAIL_DOCTRINE.md) (load-bearing rules, pillar filter, gold-packet schema, four-way triage,
hard-freeze concurrency rule). Source quarry: [`DETAIL_BRAINSTORM_R2.md`](DETAIL_BRAINSTORM_R2.md) (500 items).
Curated, wave-mapped packets (91 gold packets · 56 already-shipped-validated · 58 cut/deferred):
[`DETAIL_PACKETS.md`](DETAIL_PACKETS.md), authored into three new BPs — [BP-11 Sector Atmosphere &
Station Life](BP-11_SECTOR_ATMOSPHERE.md), [BP-12 Causal Economy Missions & Contracts](BP-12_CAUSAL_ECONOMY.md),
[BP-13 Pirate Ecology & Named Characters](BP-13_PIRATE_ECOLOGY.md) — plus `BP-0X.1` addenda folded onto existing
lanes (applied AFTER their wave merges, never inline). Full per-packet detail in `detail/A..G_*.md`.

### The first-15-minutes proof surface (named)
The revamp is judged on two surfaces: this ritual and the 47-A slice. The **first-15 proof ritual** (a proof, not
a tutorial): minute-1 one objective + one beacon, no chatter → **first derelict teaches the tether by *saving*
something**, not by explaining a control → **first mining**: scanner pulse reveals seams, beam pulse teaches the
heat rhythm → **first combat**: a weak pirate demands a toll then flees at low hull (teaches combat *and* mercy)
→ **first station**: sell ore, buy one useful module, accept one recommended job → **first choice**: haul / bounty
/ survey. Tutorial-memory (skip learned verbs); mentor-silence (never talk over success). All verbs it needs —
tether, mining rhythm, `barks`, `encounterDirector` — already shipped; the ritual assembles them.

---

## 9. RECONCILIATION LEDGER — quarries ↔ curated layer ↔ working tree

> *Appended 2026-07-06. §9–§15 are new; §1–§8 are unchanged. These sections reconcile the floating source
> quarries with the curated detail layer (§8) AND with the live working tree, then add the cleanup, story/asset
> build-out, verification, and release-readiness tracks the doctrine does not cover. They obey the hard-freeze rule
> (§7 of `DETAIL_DOCTRINE`): the *only* edits below to a lane doc are corrections of factually-wrong claims, which
> are stop-the-line-equivalent (a doc that lies about what's built is worse than a missing one).*

### 9.1 The four source quarries — where each lives

The lead was given four planning passes. Two are already absorbed into the curated layer; two are **floating**
(referenced nowhere in `design/revamp/`). This ledger binds all four to a home so nothing stays a parallel schedule.

| Quarry | Exists in repo? | Canonical home | Notes |
|---|---|---|---|
| **AI research spec** (21-game study, SG-06 spine, spawn director, doctrines, maneuver library, 8-phase roadmap) | No file | **→ BP-13** (pirate doctrines, named aces) + `BP-02.1` (maneuver library) + §11 (corrections) | Its "spawn director" is the shipped `encounterDirector` + `spawnBudget`, not a new system (§9.2). |
| **Design audit R2** (25-game benchmark, 660 ideas, Waves 0–6) | **Yes** = `DETAIL_BRAINSTORM_R2.md` (already curated into 91 gold packets) | Already home | Its Waves 0–6 map onto our Wave 0–3 + the new tracks in §12–§14. |
| **Performance queue** (13 quality-preserving perf prompts) | No file; ~half its scripts now exist | **→ §14** (verification track) + `design/PERF_BUDGET.md` | The "quality-preserving" doctrine is already repo policy (`AGENTS.md §6`); §14 *enforces* it with checks. |
| **Massline ladder** (24 atomic prompts: telemetry → release → load → snap → reel → arc → whip → 47-A beats) | No file; its rungs ARE the Wave-2 massline lane | **→ Wave 2** (status in §10.1) | Formerly in-flight; now folded into the unified track (T3/T4, §11) per lead direction 2026-07-06. |

### 9.2 Hallucination corrections — systems the quarries/docs call "missing" that EXIST

Three systems the quarries/docs say are "missing" or "need building" **already exist** in the working tree
(verified 2026-07-06, file:line evidence below). An agent acting on the original text would rebuild them. Treat
these as **DONE-validated**, same status as the convergent-validation items in `DETAIL_PACKETS §3`. The doc claims
that say otherwise are corrected in §12.1.

| Claimed missing / needs-building | Working-tree reality | Evidence | Action |
|---|---|---|---|
| `encounterDirector.js` (design-audit R2 Wave 2; `CURRENT_BUILD_STATUS` line 54) | **DONE — COMPLETE, not a stub** | `src/systems/encounterDirector.js:1-370`; registered `registry.js:46,65,86`; `planEncounters()` at `:200`; emits `encounter:spawned` (`:142`); consumed by `world.js:622,672`. Header: *"THE KEYSTONE that makes the world feel alive."* | Mark validated. Only its *check script* is missing → §13.1. |
| `attentionArbiter.js` (design-audit R2 Wave 3, packet #401) | **DONE as `voiceArbiter.js`** — different name | `src/ui/voiceArbiter.js:1-215`; registered `registry.js:48,64,86` as `ctx.helpers.voice`; `VoiceQueue` priority queue (`:54`). Routed by `story.js:253`, `marketNews.js:177`, `encounterDirector.js:171`. | Mark validated. ≡ the quarry's `attentionArbiter`. One nuance: legacy-toast interceptor is **off by default** (`:182-184`); §13.1 `check:one-voice` covers migrating stragglers. |
| `state.world.facts` (design-audit R2 packet #21) | **DONE** | `gameState.js:103`; `scenarioRuntime.js:68-70` builds the map; `scenarioSchemas.js:147,420,440` validates beats reference facts + branches carry `worldFactEffects`. 47-A defines 5 facts. | Mark validated. BP-12 cause-ledger *surfaces* this; it does not build it. |

### 9.3 Inverse correction — legacy files wrongly called "dead"

`AGENTS.md §5` says `flight.js` and `ai.js` have "zero importers anywhere" and are safe to ignore. That is
**factually wrong**, and the reality is more nuanced than "fallback." Verified 2026-07-06:

| File | True status | Evidence |
|---|---|---|
| `flight.js` | **CI-live / runtime-fallback** | Imported `registry.js:13`; `selectFlightSystem` (`:198-204`) returns it unless `flightBackend==='v3' && physicsBackend==='rapier-dynamic'`. **Runs by default in every `check:sim*` gate** (`sf-sim.mjs:79` `--flight-system` defaults `'legacy'`; `package.json:15` `check:sim` passes no override) — it pins the canonical golden hash. At player runtime, V3 is the default (`gameState.js:16`). |
| `ai.js` | **CI-live / runtime-fallback — and the most CI-critical** | Imported `registry.js:9`; `selectAISystem` (`:188-194`) returns it unless `aiBackend==='sg06-tactical' && physicsBackend==='rapier-dynamic'`. **Runs in *every* `check:sim*` gate including `check:sim:v3`** — `sf-sim.mjs:74` `tacticalAI` defaults `false`, and **no** `check:sim*` script passes `--tactical-ai` (so even the "v3" sim is V3-flight + *legacy* AI). |
| `flightDynamics.js` | **LIVE in all paths** | Imported by **both** `aiPorts.js:13` (`resolveFlightProfile`, used `:438`) **and** `flight.js:20`. `aiPorts.js` is unconditionally in the update loop (`registry.js:8,64,85`). |

**Action:** §12.1 corrects the "zero importers" wording in `AGENTS.md §5`. These files are **not deletion
candidates** — they pin CI determinism and feed the live tactical AI stack. Editing them for a "player-facing fix"
still has no effect at runtime (V3+tactical is the shipped default), which is the real trap `AGENTS.md` warns about;
but they are load-bearing infrastructure, not dead code.

---

## 10. WORKING-TREE TRUTH — the state this plan executes against

> *Captured 2026-07-06 against the working tree (~17k lines ahead of HEAD — trust it over HEAD and over any status
> doc, per `AGENTS.md §3`). This is the **ground truth** the execution tracks sequence against. "A status doc says
> X" is not evidence; the live file + `check:*` output is. Re-snapshot before each wave.*

### 10.1 Wave 2 massline lane — current state (NOW folded into the unified track per §11)

| Ladder rung (#) | Status | Evidence |
|---|---|---|
| 01 telemetry | **DONE** | `masslineTelemetry.js` (186 lines) |
| 02 release-rated event | **DONE** | `tetherGameplay.js:91,114,255,258` emits `tether:releaseRated` |
| 03 release feedback | **DONE** | `presentationOrchestrator.js:59` consumes; `check:massline:release-feedback` green |
| 04 tether.load field | **DONE** | `tetherGameplay.js` `computeTetherLoad` + `_mirror` writes `tether.load`; telemetry relays; `vfx.js` cable color/glow keys off it; `check:massline:load` green |
| 05 snap-catch | **DONE** | `masslineTelemetry.js` `_stepSnapCatch` + `freshSnap` + `tether:snapCatch` emit (once/latch); `check:massline:snapcatch` green (clean/static/window/stalled/once-per-latch/observer-only); control-verified non-vacuous |
| 06 reel-pump | **DONE** | `masslineTelemetry.js` `_stepReelPump` + `freshPump` + `tether:reelPump` emit (once/stroke, debounced); `telemetry.reelPump` mirror with `risk` tier (low/med/high by strain); `check:massline:reelpump` green (loaded/slack/sub-threshold/debounce/re-arm/latch-reset/observer-only/risk-tiers); control-verified non-vacuous |
| 07 target-scoring (pure) | **DONE** | `src/combat/masslineTargetScoring.js` (198 lines): `scoreMasslineTarget` + `rankMasslineTargets`, pure (no state/bus), factors = swing geometry (tangential ÷ relative) + mass band + range comfort + caller-resolved hostility; `check:massline:target-scoring` green (11 cases incl. out-of-range gate, swing-vs-radial, static-zero-swing, mass/range bands, hostility bonus, rating bands, ranking + tiebreak, purity/no-mutation, determinism); control-verified non-vacuous |
| 08 auto-target wire | **DONE** | `combat/autoTargetMode.js` imports `rankMasslineTargets` + `isHostileToPlayer`; new `pickMasslineAutoTarget(state,opts)` picks the best massline anchor when `state.player.tether.active` (massline mode), resolves hostility via scanner (not factionId), includes asteroids as candidates, applies lock; `check:massline:auto-target` green (8 cases incl. massline/non-massline gate, asteroids, range gate, no-candidates, hostility resolved from scanner, applyLock:false, score-zero guard); control-verified non-vacuous (3 controls). `rankMasslineTargets` gained `opts.isLatched` predicate (backward-compatible). |
| 09 threat events | **DONE** | `src/systems/masslineThreats.js` (new observer, registered after `masslineTelemetry` in `registry.js`): detects `line-near-break` (strain ≥ 0.75 overload floor, once/latch), `hostile-on-arc` (scanner.isHostileToPlayer + closing + genuine swing ≥ 25 wu/s, once/hostile/latch), `collision-course` (ballistic impact ≤ 1.5 s, once/obstacle/latch); own subtree `state.player.masslineThreats`; single emit `massline:threat`; `check:massline:threats` green (9 cases); control-verified non-vacuous (4 controls); sim:compare failure A/B-proven pre-existing |
| 10 threat feedback | **DONE** | `presentationOrchestrator.js` consumes `massline:threat` → `massline.threat` cue (severity→magnitude, kind in tags; sibling of tether.near_break); recipe in `cueRecipes.js` (5 lanes, warn tier); `presentationAdapters.js` audio sting + non-diegetic HUD warn ('SWING THREAT') + caption; `check:massline:threat-feedback` green (5 cases incl. end-to-end from the real rung-09 observer + dedupe); control-verified non-vacuous (3 controls) |
| 11 arc-preview data | **DONE** | `masslineTelemetry.js` `updateArcPreview` + `computeTimeToWhip` + `exitRayHitsAnchor`; `telemetry.arcPreview` {peakSpeed = targetSpeed+relSpeed (≥ current speed by triangle ineq), exitAngle, exitSpeed, timeToWhip (taut-solve, null beyond 8 s), viable (loaded phase + tangentQuality ≥ 0.5 + exit ≥ 25 wu/s + anchor clearance)}; in FALLBACK/freshRuntime, cleared by writeInactive; `check:massline:arc-data` green (7 cases incl. isolated anchor-clearance gate); control-verified non-vacuous (4 controls) |
| 12 arc-preview render | **DONE** | `vfx.js` `_initArcPreview`/`_updateArcPreview` (siblings of the tether cable, wired in update() behind `_arcPreviewActive`): faint dashed additive ribbon from the hull along `arcPreview.exitAngle`, length scaled to `peakSpeed` (24–130 wu), shown only tethered+viable with fade envelope, cosmetic-only; `check:massline:arc-render` green (5 cases incl. length-scaling A/B + cosmetic-only); vfx trail-bind/frame-sleep/sg08 checks green; control-verified non-vacuous (3 controls) |
| 13 whip-impact detect | **DONE** | `src/systems/masslineImpacts.js` (new observer, registered after `masslineThreats` in `registry.js`): the whipped MASS (tether target — latched, or ≤6 s post-release sling armed only if it left the line ≥25 wu/s) contacting a solid body (padded-radius overlap OR one-tick swept crossing; never the player) with mass world speed ≥25 wu/s AND relative contact speed ≥25 wu/s (the SNAP_CATCH bar); once per victim per run, new latch re-arms; own subtree `state.player.masslineImpacts` (records persist post-run for rung-14/20 consumers); single emit `tether:whipImpact` {targetId=mass, victimId, relSpeed, massSpeed, mass, momentum, slung, severity, rating glance/solid/crushing, tick, time}; `check:massline:whip-impact` green (10 cases); control-verified non-vacuous (4 controls); sim:compare failure identical to `_BASELINE.md` |
| 14 whip feedback (+opt damage) | **DONE** | `presentationOrchestrator.js` consumes `tether:whipImpact` → `tether.whip_impact` cue (severity→magnitude, rating + latched/slung in tags, struck body as cue target; sibling of massline.threat); recipe in `cueRecipes.js` (5 lanes, payoff tier); `presentationAdapters.js` audio crack (`sfx.tetherSnap` via `audioSystem.js`) + non-diegetic HUD 'MASSLINE IMPACT' + caption; damage half in `combat.js` `onWhipImpact` behind NEW `combat.whipDamage` flag (`featureFlags.js` Tier-B: OFF in node golden, ON in browser) — momentum-scaled kinetic (1/1600, cap 45, solid/crushing only, ship/station/drone victims) through `scalarHitToDamagePacket` + `ensureKernel().routeDamage` (attacker = player, friendly-fire flags matching impulse charges); `check:massline:whip-feedback` green (7 cases incl. end-to-end from the real rung-13 observer, dedupe, kernel-only mutation, cap + rating/type/flag gates); control-verified non-vacuous (2 controls: cue emit cut, damage route cut); massline family + sim/gameplay-core baselines unchanged |
| 15 impulse authority helper | **DONE** | `impulseCharges.js` `_applyBlastImpulse` routes blast impulses through `helpers.combatPhysics.applyImpulse({entityId, impulse, point:null, reason:'impulse_charge', tick})` — same port/shape as `combat/actions.js:185` + `combat/damage.js:201`; magnitude `def.impulse × falloff` (= old Δv × mass, same physics, authority-owned mutation); rejected/portless requests skipped, never forced; direct `ent.vel` writes on blast victims REMOVED; `check:impulse:authority` green (5 cases: call shape + port-is-the-mutator, no-direct-mutation proof with a non-mutating port, rejected-skip, portless-safe, geometry/falloff); control-verified non-vacuous (reintroduced direct write caught); `check:sim:compare` failure byte-identical to `_BASELINE.md` (47-A projectile precondition — golden tape never throws/detonates charges, so no hash impact); tether-gameplay + gameplay-core baselines unchanged |
| 16 impulse+massline combos | **DONE** | `MASSLINE_COMBOS` in `src/data/impulseCharges.js` (anchorKick ×1.5 channeled kick; slingBomb gate ≥40 wu/s tangential = 1.6× snap-catch bar, impulse ×1.35 damage ×1.5; tailPop 1400 player escape impulse) + wiring in `impulseCharges.js`: `_detectCombo` reads `state.player.tether` + `state.player.masslineTelemetry` observer-style (player charges only; anchorKick outranks slingBomb); anchorKick redirects the anchor's blast share along the line (player→anchor) in `_detonateOne`; tailPop in `_handleDetonate` on same-tick cut intent (READS `actions.tetherCut`, never consumes — tetherGameplay owns the cut) with backward line impulse on the player; all impulses via the rung-15 authority path; one `charge:combo` emit per combo; deterministic (sim-state gates only, no RNG/wall-clock); `check:impulse:massline-combos` green (8 cases incl. channel-direction proof, timing gate, precedence, cut-not-consumed, no-tether control); control-verified non-vacuous (3 controls: gate removal, channel cut, cut-gate removal); massline family + sim/gameplay-core baselines unchanged |
| 17 mining bulk-haul guidance | **MISSING** | — |
| 18–22 47-A physical beats (spindle/scavenger/debris/contested/priority) | **PARTIAL** | scenario JSON + spawner complete; physical-beat *mechanics* are JSON contract only, not live-scene-implemented |
| 23 47-A physical branch resolution | **PARTIAL** | 4 branches authored in JSON; live predicate exists (`check:47a:live-branch`) but physical-state-driven resolution is the unfinished piece |
| 24 consolidated massline check | **MISSING** | no `check:massline` aggregate |

**Net:** ~3 of 24 rungs done. This is now T3 in §11.

### 10.2 Core systems maturity — build on these, don't rebuild

| System | Status | Evidence |
|---|---|---|
| Encounter director | **DONE** | `encounterDirector.js:1-370` |
| One-voice arbiter | **DONE** (legacy-toast interceptor off by default — see §13.1) | `voiceArbiter.js:1-215` |
| Fact ledger | **DONE** | `gameState.js:103` + `scenarioRuntime.js` + `scenarioSchemas.js` |
| Story 47-A (data + spawner) | **DONE** | `47a.scenario.json` (528 lines, 8 beats, 4 branches) + `47aLiveScene.js` (309 lines, wired at boot `main.js:158,172`) |
| 10 sectors | **DONE** (all authored, fixed geography) | `sectors.js` + `sectorAnchors.js` (228 lines) |
| 9 factions | **DONE** (8 canonical + Helix paper) | `factions.js` |
| Story canon (dual-thread written) | **DONE** | `docs/worldbuilding/` + `narrative.js` (449 lines) |
| Mission infrastructure | **DONE** | `missions.js` system (1948 lines) + `wreckMissions.js` |
| 63 release GLBs (live) | **DONE** | `assets/ships/release/parts/` 10 categories |
| 10 code-native ship builders | **DONE** | `src/render/ships/` |
| `spawnBudget` cap arbiter | **DONE** | contract §3.3 |
| WANTED heat | **DONE** | `heat.js:275` (`isPlayerWanted`); threshold `:31` — *line refs shifted from AGENTS.md's :147/:33* |
| `sectorZones` placement substrate | **DONE** | contract §3.5 |
| `dangerModel` + `sectorSim` (the "gold ore" for BP-12) | **DONE** | offscreen losses, danger/price field |

### 10.3 Genuinely missing — the build targets

| System | Quarry source | Home | Notes |
|---|---|---|---|
| Enemy doctrines (`enemyDoctrines.js` behavior contracts: range/morale/tells/counters) | AI research §4 | **BP-13** | Converts scattered AI conditionals into data. |
| Spawn-graph enrichment (legal zones, ingress, fairness penalties, exit plans) | AI research §2 | **BP-13 addendum** | Enriches the shipped `encounterDirector`/`sectorZones`; NOT a new `spawnDirector.js` (that role is filled). |
| Maneuver library extension (kite/boom-zoom/bracket/retreat-to-X) | AI research §6 | **BP-02.1 addendum** | Extends SG-06 `ManeuverPlanner`. |
| `state.player.careerProfile` | design-audit R2 §A | **BP-12 addendum** | Career = economy recognition layer. |
| Suspicion layer (separate from heat; controls scan depth, not hostility) | design-audit R2 §E | **BP-12** (customs/contraband) | `heat` stays the hostility authority; suspicion is the "they want a look in your hold" axis. |
| Salvage wreck-module anatomy (black box/reactor/pod as discrete typed modules) | design-audit R2 §D | **BP-01.1** (salvage depth) | `salvage.js` exists (275 lines); this adds module-typed anatomy. |
| Faction adaptation / rival memory counters | AI research §12; design-audit R2 §K | **BP-13** (named aces cover the rival-memory half) | Light Nemesis/MGSV borrow — don't overbuild. |

---

## 11. UNIFIED EXECUTION SEQUENCE (replaces ad-hoc wave handoffs)

`DETAIL_DOCTRINE §7` froze lane docs while a wave ran. Wave 2 has landed (per lead direction 2026-07-06), so the
freeze lifts and the massline rungs fold in here. This is the **single sequence** — no parallel wave docs, no
competing schedules.

### 11.1 File-ownership map (who may touch what, when) — prevents cross-lane collisions

| Track | Files owned | Sequencing |
|---|---|---|
| **T1 — Verification scaffolding** | NEW `scripts/check-encounter-director.mjs`, `check-one-voice.mjs`, `check-release-soak.mjs` only | Now. No code/assets touched. |
| **T2 — Doc cleanup** | The stale docs in §12.1 + `AGENTS.md §5` wording | Now. Zero code/assets. |
| **T3 — Finish Wave 2 massline** | `masslineTelemetry.js`, `tetherGameplay.js`, `impulseCharges.js`, `masslineThreats.js` (new), `masslineTargetScoring.js` (new), `autoTargetMode.js`, `47aLiveScene.js`, + rung check scripts | Now (Wave 2 lane is free). Each rung lands with its check (ladder discipline). |
| **T4 — Wave 3 new BPs** | BP-11/12/13 code (new files per merge protocol §3.8) | After T3 massline lands. BP-11 → BP-12 → BP-01.1 → **BP-13 LAST** (every packet is a `spawnBudget` client; `DETAIL_PACKETS §5`). |
| **T5 — BP-0X.1 addenda code** | Per owning lane | After each owning wave merges (hard-freeze rule). |
| **T6 — Asset manifest sync + queued asset authoring** | `parts_manifest.json`, queued GLBs | Coordinate with graphics lane (§12.3). |
| **T7 — Perf gate hardening** | `scripts/probe-*.mjs`, `PERF_BUDGET.md`, `package.json` `check` chain | After BP-10 render lane stable. |
| **T8 — Story-narrative check family** | NEW `check-*` scripts for BP-11/12/13 acceptance | Alongside T4 (each BP's check is its acceptance). |
| **T9 — Release-readiness gate** | The 8-point bar in §15 | Last. |

### 11.2 Dependency spine (the order inside T3→T4)

```
finish massline rungs 04–24 (T3) — each lands with its check
    ↓ (frees tether/scenario files)
BP-11 atmosphere (T4) — widest-felt, lowest-risk, mostly surfacing shipped data
    ↓
BP-12 causal economy (T4) — needs the cause-ledger seam over dangerModel/sectorSim
    ↓
BP-01.1 wreck provenance (T4) — needs sectorSim loss hooks ("who died here")
    ↓
BP-13 pirate ecology (T4, LAST) — every packet a spawnBudget client; depends on
    BP-01.1 (ambushes-leave-wrecks) + BP-12 (danger→bounty clusters)
```

---

## 12. THE CLEANUP TRACK — kill stale artifacts (evidence-based)

> *The doctrine (§8) governs NEW detail; it doesn't cover accumulated drift. This track does, sequenced for zero
> collision. Every item is evidence-backed (recon 2026-07-06); nothing is deleted on assumption.*

### 12.1 Doc corrections (zero-risk — do first, in T2)

| Doc | Problem (verified) | Fix |
|---|---|---|
| `design/ARCHITECTURE.md` (3.5KB) | Name-collides with the authoritative 68KB root `ARCHITECTURE.md`; it's a stale agent self-report | Move → `design/_ARCHIVE/handoff_architecture.md` (or delete) |
| `design/_ARCHIVE/adr/0003-flight-physics-controller.md` | Historical custom-controller decision superseded by rapier-dynamic + V3 (§9.3) | Archived; never implementation authority |
| `design/FLIGHT_PHYSICS_SPEC.md` | Same stale "not raw rigid-body" framing | Mark legacy; point to `design/spec3/SPEC3-F3-flight-physics-feel.md` |
| `design/BUILD_PLAN_2_0.md §42` | Ownership line names `flight.js` + `flightDynamics.js` (pre-V3) | Revise → `flightV3.js` + `src/core/flight/*` |
| `README.md §87` | Mentions only spec2; both spec2+spec3 live (AGENTS.md §4) | Add spec3 + point to `AGENTS.md` as front door |
| `design/CURRENT_BUILD_STATUS.md` line 54 | Says `encounterDirector.js` missing — WRONG (DONE, §9.2) | Revise: source exists, only check-script pending |
| `design/CURRENT_BUILD_STATUS.md` line 41 | Says `check-cruise.mjs` missing — WRONG (exists, 11KB) | Revise |
| `AGENTS.md §5` | "zero importers anywhere" for `flight.js`/`ai.js` — WRONG (§9.3) | Replace with: "CI-live / runtime-fallback — they pin `check:sim` goldens and feed `aiPorts.js`; not deletion candidates. Editing them for a runtime fix still has no effect (V3+tactical is the shipped default)." |
| Loose drift docs (`SKILLS_IMPROVEMENT_SPEC`, `STATION_MARKET_UI_REVAMP`, `WORLD_OVERHAUL_2_1`, `GRAPHICS_*`) | No superseded header → risk of implementation from stale plans | Add `Status: LEGACY — do not implement from` header (or fold into the BP that supersedes them) |

### 12.2 Code cleanup (LOW priority — verify each before acting)

| Candidate | Verdict (verified) | Action |
|---|---|---|
| `flight.js`, `ai.js`, `flightDynamics.js` | **Load-bearing** — CI-live/runtime-fallback (§9.3); `flightDynamics.js` live in all paths | **KEEP.** Not deletion candidates. |
| Scratch scripts (`*-temp.mjs`, one-off generators/purges/probes/inspectors) | Tooling, not shipped; some may be useful | Trace current callers and retained evidence, then archive or delete tools with no current purpose. No fixed filename quota or approval ritual proves safety. |
| Legacy 1.x spec suite | Archived under `design/_ARCHIVE/specs-1.x/` | Historical only; route retained outcomes through the current program. |
| Shipped systems | **Zero dead** — all 47 systems have importers; smallest (`actions.js`, 13 lines) is a real delegating system | None |

### 12.3 Asset manifest sync (T6 — coordinate with graphics lane)

| Issue | Reality (verified) | Fix |
|---|---|---|
| 3 blocked wholeships (`kestrel`/`pelican`/`wasp`) | `QUEUE.md` says blocked; `parts_manifest.json` has **no `status:"blocked"` entries** and lists them in `runtimeSlots.hull` → ambiguous per `check-asset-status.mjs` | Add `parts[]` entries with `status:"blocked"` + `statusNote`, OR drop from `runtimeSlots` |
| `WHOLE_SHIP_FILE_BY_DEF_ID` | Active production routes for Kestrel and Wasp; other definitions remain modular unless deliberately validated/promoted | Verify exact manifest/classification and player-route evidence before changing a route |
| Queued-but-unbuilt assets (per `assets/QUEUE.md`) | 7 claim props, 12 hunter-sig rails, 5 landmarks+vault/tower, 8 module-visual variants | The build queue — authored as BP-11/12/13 packets demand them, not as a wishlist |

---

## 13. THE STORY & ASSET BUILD-OUT — wire the canon, build around the inspiration

> *The canon is written (`docs/worldbuilding/`); the inspiration art exists (`assets/concept/`, 49 paintings);
> 63 release GLBs are live. The job is to **wire more of the canon into runtime** and **build assets that clarify
> gameplay** — not to add sprawl. Every asset follows `assets/AGENTS.md`: authored role, readable
> silhouette, provenance, validation, runtime reachability, representative captures, and measured
> performance. Historical palettes and budget numbers are diagnostics, not quality ceilings.*

### 13.1 Story wiring (extends BP-05; reuses shipped `narrative.js`, `story.js`, `scenarioRuntime.js`)

Thread A (the System: Contract 47-A, REF 44-C, Director Vale, weight discrepancies, the recycler theft, Silt/ATMO
economy, 5 endgame choices) is **runtime-wired** (47-A Phase 0 live at boot). Thread B (the Search: the 3.1kg
artifact, Callum Oakes, Vethari, Lida) is **written but background**. The 8-chapter spine (B0–B7) has narrative
content authored; mission-by-mission runtime wiring varies by beat. Build-out priorities:

- **BP-05 corpus** (the unfinished half of Wave 2 §6): B8+ beat registry (only B8 minimum shipped), Wren artifact
  quest chain (cargo item + anomaly/salvage depth + quest markers), manifest phases 2–3 *content*, NPC-ecology
  graffiti web (Kessler↔Drift↔Voss↔… full wiring), Callum encounter, VALE registry sightings, faction bark corpus
  on all SG-06 transitions. Endgame A–E already built.
- **47-A physical beats** (ladder rungs 18–23, §10.1): the JSON contract is complete; the *mechanics* need
  live-scene implementation (spindle stabilization, scavenger line-threat, debris sling, recovery contested,
  civilian priority, physical branch resolution).
- **Story-narrative surfacing** (BP-12 owns this half): dock-deny reasons, manifest phases, "why X?" tooltips —
  theme delivery through paperwork, never lore dumps.

### 13.2 Asset build-out (extends BP-08; the gameplay-readability backlog)

Per the design-audit R2 §O priority order — assets that **clarify gameplay** first, vanity last:

1. **Station archetype silhouettes** (BP-08 P0 — the 8 faction-distinct station cores; blocks BP-11's visual half).
2. **Lane/gate/ring infrastructure** (ring-lane highways for BP-07 traversal; gate visuals are Grok lane).
3. **Claim module GLBs** (visible props for BP-06; blocks "see logistics move").
4. **Hunter signature parts** (BP-13 named aces; identifiable in target panel).
5. **Salvage/wreck anatomy parts** (BP-01.1; black box/reactor/pod as readable modules).
6. **Module visual variants** (BP-09 build identities; ram-plate/cargo-pod/tether-spool visible on hull).
7. **Decorative sector props / landmarks** (BP-11 sector postcards; lowest priority).

**Forbidden** (per `assets/AGENTS.md`): wiring reference concept art into runtime; wiring blocked wholeships;
weakening the boot gate; accepting "detailed" GLBs with no hull body. Every asset needs role + silhouette + palette
+ budget + validation + runtime reachability.

### 13.3 Concept art as inspiration, not runtime (per `assets/concept/AGENTS.md`)

The 49 concept paintings (`assets/concept/`, indexed by `index.json` → `blender_part_id`/sector placement) are
**reference-only** — never wired into gameplay. They are the **targets** for Blender authoring: station/gate
archetype mood boards, sector overview paintings, faction silhouettes. Build assets *toward* them; do not load them.

---

## 14. THE VERIFICATION TRACK — close every proof gap to professionalism

> *The repo has 139 check scripts + master `check`/`check:ci` chains. The gaps cluster in four places. This track
> closes them. New scripts only — no collision with other lanes.*

### 14.1 Checks for already-existing systems (T1 — highest priority, verifies shipped work)

| Missing check | Verifies | Why it matters |
|---|---|---|
| `check:encounter-director` (`scripts/check-encounter-director.mjs`) | `encounterDirector.js` determinism, budget compliance, one-voice | The keystone "world feels alive" system (§9.2) has **no proof gate** |
| `check:one-voice` (`scripts/check-one-voice.mjs`) | `voiceArbiter.js` — no overlapping text in a 10-min run; no direct DOM writes outside arbiter; **+ migrate legacy-toast stragglers to `voice.say`** (interceptor is off by default, §9.2) | Pillar 3 is *enforced* by voiceArbiter but never *verified* |
| `check:release-soak` (`scripts/check-release-soak.mjs`) | 30-min soak within encounter budget, no drift, no leaks, no untelegraphed spawns | No long-haul gate exists at all (AGENTS.md §11 confirms missing) |

### 14.2 The massline check family (lands with T3 rungs)

15 of 24 ladder rungs have no check (§10.1). These land **with their rungs** in T3 — not before. Ladder discipline:
each rung's prompt already specifies its check. List: `massline:load/snapcatch/reelpump/target-scoring/auto-target/
threats/arc-data/arc-render/whip-impact/whip-feedback` + `impulse:authority/massline-combos` + `47a:spindle/
scavenger-threat/debris-sling/recovery-contested/civilian-priority/physical-branches` + the `check:massline`
aggregate (ladder rung 24).

### 14.3 The story-narrative check family (lands with T4 BPs — each BP's acceptance)

All MISSING. Each verifies a BP-11/12/13 packet's acceptance gate:
`check:sector-atmosphere` (BP-11) · `check:causal-economy` (BP-12) · `check:pirate-ecology` (BP-13) ·
`check:career-profile` · `check:fact-ledger` (surfaces the existing `state.world.facts`) · `check:salvage-anatomy`
· `check:smuggling-card` · `check:station-mood` · `check:claim-ledger` · `check:war-overlay` · `check:market-chart`.

### 14.4 Perf gate hardening (T7 — the perf quarry, enforced)

The perf quarry's doctrine ("measure the bottleneck, never hide it by making the game uglier") is already
`AGENTS.md §6` policy. What's missing is **enforcement**: `check:perf`, `check:hitch-budget`, `check:gpu-path`
exist but are **not in the default `check`/`check:ci` chain** (only `check:perf-budget`, a doc-keyword linter,
enters via `check:ui:perf`). Fold the headed deep-perf probes + the soak gate (§14.1) into the default chain so
quality regressions can't slip. **Quality-preserving:** structural fixes (batching, instancing, cadence, cache
reuse) only — never asset disables, never browser/desktop divergence.

### 14.5 The missing-check themes (summary — drives T1/T3/T7/T8)

- **Encounter/AI:** `check:encounter-director`, `check:one-voice`, `check:release-soak` (T1); `check:pirate-ecology` (T4).
- **Massline:** 15 rung checks (T3).
- **Perf/soak:** soak gate + folding headed-perf into `check` (T7).
- **Story/narrative:** 8 checks entirely absent — career/fact/salvage/smuggling/station-mood/claim-ledger/war-overlay/market-chart (T8).

---

## 15. THE PROFESSIONALISM BAR — definition of "finished"

> *The revamp is **done** when a new player can play 20 minutes and the experience matches the design-audit R2 bar:
> "I am a pilot in a real economy / ships around me have jobs / danger has causes / my ship has mass and
> personality / my choices change the world / every object on screen has a reason / the world is not waiting for me,
> but it notices me." Concretely:*

The release gate (all eight must be green):

1. **First-15 proof ritual green** (§8) — `check:first-15-runtime` + screenshot pair into `.devshots/`.
2. **47-A slice green** — `check:47a:*` family + `check:sim:compare` (the documented projectile-collision precondition resolved or explicitly accepted per `_BASELINE.md`).
3. **World-alive green** — `check:encounter-director` + `check:one-voice` + `check:release-soak` (all from §14.1).
4. **Cause is visible everywhere** — `check:causal-economy` + the "why X?" tooltips (BP-12) pass; no surfaced change lacks a machine-traceable cause.
5. **Pirates have motive** — `check:pirate-ecology`: scan-before-fire, break-on-patrol, flee-and-return, budget-respected.
6. **Performance floor held** — `check:perf` p95 within budget, **quality-preserving** (no asset disables, no browser/desktop divergence).
7. **No stale artifacts** — §12 cleanup complete; `AGENTS.md`, `CURRENT_BUILD_STATUS`, `BUILD_PLAN_2_0` reconciled with the working tree.
8. **Full `check`/`check:ci` chain green** with the new gates (§14) folded in.

Anything not on a path to one of these eight is either **CUT** (per `DETAIL_DOCTRINE §8`) or **deferred to backlog**
with a named reason. *More content is not the goal; causality, ritual, and proof are.* The professional niche
(design-audit R2 §12): a top-down, physics-first space trader where the world is small enough to be authored, deep
enough to be causal, and readable enough that every object on screen tells you what it is, what it wants, and why
it matters.

---

*§9–§15 appended 2026-07-06 by the unified-planning pass. They sit on top of §1–§8 (unchanged) and obey the
authority chain in the header. The quarries (AI research, design-audit R2, perf queue, massline ladder) are now
bound to homes in §9.1; the working-tree truth is snapshot in §10; the single execution sequence is §11; cleanup is
§12; story/asset build-out is §13; verification is §14; the release bar is §15. Re-snapshot §10 before each wave.*
