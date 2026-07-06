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
