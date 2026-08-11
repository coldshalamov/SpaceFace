<!-- LIFETIME: VOLATILE — running ledger of concrete problems found in the exhaustive sweep. Append-only per area. -->
# Thermonuclear Review — Findings Ledger

Severity: 🔴 P0 (broken/risky now) · 🟠 P1 (materially wrong, misleads) · 🟡 P2 (real conflict, lower blast) · 🟢 P3 (hygiene).
Each finding has file:line evidence. Cross-cutting/misalignment findings are the high-value output of a long-context read.

## VERIFIED findings (subagent fact-checked with git history — these are ground truth, not assumption)
The owner flagged that any of {doc, code, test} can be the wrong one, and agents sometimes change code without updating docs. These verdicts determine the INTENDED truth via `git log`/`git blame`, so a future "fix per doc" doesn't regress the code.

- ✅ **VERIFIED — magnetRange live truth = 420 (`mining.js:36` MAGNET_RANGE).** Runtime pull radius is `Math.max(MAGNET_RANGE, state.player.magnetRange||0)` at `mining.js:757`; same pattern at `uniqueLootAbilities.js:323`. Doc's 90 was the live value at initial commit `d5f2d7d7`, bumped to 250 (`00d7a65c`, Jun 26), then 420-floor introduced (`bf1a6767`, "7/3/26", Mining 2.0). Doc never updated → stale. **Fix the doc to 420, don't "fix" the code to 90.**
- ✅ **VERIFIED — `state.player.magnetRange: 250` is read-but-INERT.** It is referenced (not dead code) but its value (250 < 420) can never win the Math.max, and NO runtime code ever writes to it. Functions as a dormant override hook. Safe to leave or wire-in; do NOT delete assuming it's dead.
- 🔴 **VERIFIED NEW BUG — tractor module `magnetRange` stats are DISPLAY-ONLY.** `src/data/modules.js:114,119,120` define magnetRange 400/720 + magnetRangePct for tractor modules, shown in outfitting UI (`fitTree.js:38`, `outfitting.js:304`). But `playerModSum` (`mining.js:1585`) is ONLY ever called with `'richCoreRingPctBonus'` (`mining.js:1043`) — NEVER `'magnetRange'`. So a player buying a "720 magnet" module gets zero gameplay effect. Either wire the mod in or remove the misleading UI stat. **Real player-facing bug, not doc rot.**
- ✅ **VERIFIED — loop cap = 4 is intended truth (`simulationRunner.js:6`).** Doc's 8 was accurate at initial commit (`loop.js` `MAX_STEPS=8`), reduced to 4 by Claude in perf refactor `42859c3a` (Jul 28) — doc untouched. Refactor also changed backlog shedding (now retains sub-tick remainder vs old zero-reset). **Fix the doc to 4.**
- ✅ **VERIFIED — system counts: manifest (132 init / 100 update) is intended truth.** ARCH §4.2's 20/13 list was a VERBATIM accurate transcription of the initial-commit `registry.js` (token-for-token match including comments). Game outgrew it; manifest introduced `3f98e842` (Jul 24) as new source of truth; §4.2 frozen since. Note: even the manifest's own header "98 entries" comment is drifted from 100. **Fix §4.2 to point at the manifest.**
- ✅ **VERIFIED — 14 factions is intended; ARCH §3.10 stale.** The 6 newer factions (helix paper faction `bb18f79c` Jul 13; understory/fulfillment/archive/pitborn/vergelayers K1 set `850c80f3` Jul 14) are deliberate per `design/depth-program/BUILD_PLAN.md` K1 milestone (L405-406). (K1 still IN-PROGRESS per `design/depth-program/PROGRESS_LEDGER.md:27` — acceptance pending.)
- ✅ **VERIFIED — 24 sectors is intended; ARCH §6 stale.** `SECTORS` = 10 CORE + 14 FRONTIER (from `src/data/frontierRegions/{west,north,east,south}.js`), added deliberately in `f4ba6a91` (Jul 11, "expand persistent galaxy to 24 regions"). Confirmed by `design/MAP_DATA_HANDOFF.md:6,90` ("all 24 sectors") and `design/depth-program/00_DEPTH_PROGRAM.md:20`.
- ✅ **CORRECTION — pitborn does NOT start at 0; it starts at +40.** My earlier "starts 0 / verify intent" finding was WRONG. `factions.js:92-94` has a fallback: `startRep = NEW_GAME.factionRep[id] != null ? that : meta.startingRep`. pitborn is omitted from newGameDefaults.factionRep, so the fallback applies → pitborn starts +40, exactly as authored and intended (`BUILD_PLAN.md:103` "only faction where the player starts with positive rep"). **This is NOT a bug.** The only smell: newGameDefaults is an explicit-override layer for the original 8; the 6 newer factions rely on the non-obvious fallback. Cosmetic symmetry option, not behavioral. *(This is exactly the kind of silent error verification caught — I would have "fixed" it wrong.)*
- 🔴 **NEW VERIFIED BUG (from UI subagent) — `ui:drillFadeStart` violates §6.** `uiRoot.js:892-963` mutates physics directly from UI: zeroes `player.vel`, animates `player.pos` via rAF, sets `player.rot`, sets `state.input.blocked`, mutates tether runtime fields. UI must emit an intent a sim system performs. Real contract violation, not doc rot. → details in `review/findings-ui.md`.
- 🔴 **NEW VERIFIED BUG (from render subagent) — `shaders.js` listed in ARCH §6 but DOES NOT EXIST.** Zero importers repo-wide. GLSL is inline in consumers. Pure dead doc row.
## src/systems/automation.js — VERIFIED spec deviation (code is intended truth)
- 🟠 **VERIFIED — automation passive-cap uses a HARD CLAMP, deliberately NOT the spec's `credited = cap + (net-cap)*0.25` overflow formula** (`automation.js:1460-1474`). The spec formula is mathematically incompatible with the cap for sustained gross — "25% of a big lump dwarfs the cap and breaks the upper bound (verified: a full build credited 310/min vs a 250 active rate)." The code drops overflow entirely to GUARANTEE `net/min <= passiveCapFrac*A(T) <= active` at every tier. **Code is the intended truth; the spec is the loser — DO NOT "fix" the code to match the spec formula (that reintroduces the idle-game exploit). Reconcile the spec instead.** A pending-overflow reservoir was also considered and rejected (would breach cap across sessions). Single-writer honored: routes via `economy:grantCredits` (line 1476), never writes credits directly. *(Another "docs may be wrong" case — verification caught it before a bad "fix".)*
- 🟢 **Concurrency note (not a bug):** a PQ-047 packet started during this review (NOW.md + PQ-047.md + `encounterScripts.js` + `test/pirate-predation-authority.test.mjs` now dirty). `encounterScripts.js` is mid-flight — treat any finding there as possibly in-progress, not a latent bug.

## src/systems/scanner.js — VERIFIED clean (hostility oracle)
- 🟢 **`isHostileToPlayer` (scanner.js:1284) is a sound, layered, fail-safe oracle** depended on by 20+ files (combat damage routing, ai/engagementAuthority, weapons, camera, vfx). Returns false (not hostile) by default; checks team/passive/lawful+WANTED/retaliation/hostileTeams/explicit-targeting/encounter/standing/context/archetype/lane-danger in cheapest-first order. Consistent with engagementAuthority. No bug.

## src/economy/customsRisk.js + save chain + whole-tree single-writer — VERIFIED
- 🟢 **VERIFIED (self-corrected) — customs hidden-hold IS wired into the engine.** I initially flagged `customsRisk.js:14-15` ("economy.runScan still scans the full illicitCargo list") as a half-finished "UI says safe, engine fines you" seam. **Wrong.** `economy.js:1407-1421` `illicitCargo()` calls `remainingIllicit({stacks,hiddenCapacity}).exposedStacks` and `runScan` (1441-1443) consumes that — the engine scans ONLY exposed stacks, honoring the hidden hold correctly. **The `customsRisk.js:14-15` comment is STALE** (describes the pre-wiring state). Real finding = stale comment, not a bug. *(Third finding verification overturned — pitborn, customs, and the general "doc-stale" stance all reinforce: `git log`/verify before logging.)*
- ✅ **VERIFIED — save migration chain complete & continuous.** `src/save/migrations.js` has entries 1→2→…→11→12, no gaps; `CURRENT_VERSION=12` reached; each bump documented in `saveVersion.js` (v3 sectorSim, v4 SG-02, v5 SG-03 combat, v6 nav intent, v7 loss-ledger, v8 aftermath wrecks, v9 global XZ, v10 career origins, v11 world records, v12 npcJobs). Critical system is sound.
- ✅ **VERIFIED — single-writer contracts hold across the ENTIRE src/ tree.** Direct `.credits`/`.rep`/`player.cargo.items[]` write scan across core/systems/combat/ai/data/render/ui/save/audio/balance/careers/contracts/missions/presentation/vfxnext/sim/observability/onboarding/law/economy(sub) = ZERO live violations. The only `.credits` writes outside economy.js are in `balance/careerCohorts.js` + `testing/lab/*` (isolated analysis/test states, not in the registry UPDATE_ORDER). §0.6 holds everywhere it matters.
## NEW from bulk reads (systems-tail + scripts/tools + tests subagents) — persisted in findings-{systems-tail,tooling,tests}.md
- 🔴🔴 **~355 of 693 test files (~51%) NEVER EXECUTE IN CI** (`findings-tests.md` headline). No glob discovery (`node --test test/` doesn't exist); every `node --test` uses explicit filenames. Only ~338 of 693 files reachable. Dead weight includes `ai-behavior-stability`, `massline-invariants`, `freight-cargo-custody`, `bounded-autosave` (~1000 lines), `world-site-kernel`, `rep-gated-docking`, `asteroid-formation-persistence` (a determinism-grep test). **This is the root structural defect; fix = one glob discovery step.** (Earlier "stale golden" concern refuted: goldens were re-recorded 2026-08-09; the risk is the `:compare` tolerance lane, not the data.)
- 🔴 **REAL BUG — `lossLedger.js:141,143` uses `'faction_concord'`/`'faction_drift'` which DON'T EXIST** (canonical = `faction_scn`/`faction_dmc`). Both branches dead → every Concord/Drift loss headline falls through to default "A a hauler went dark…". Real player-facing content bug.
- 🔴 **REAL SAVE BUG — `intervention.js` `_nextId` not re-derived on `save:loaded`.** Set in init/newGame but never recomputed from existing records on load → next loss after Continue starts at 1, collides with stored records + `'intervention-'+rec.id` alert keys. Compare `claims.js:1568` which DOES re-derive `_nextClaimId = max(existing)+1` on deserialize (the repo pattern). Mirror that.
- 🔴 **REAL — two CI-gated checks neutered by `|| true`:** `check-map-information-depth.mjs:876-877` (precondition bypassed) and `check-m4-living-galaxy-player-route.mjs:651-655` (`.every(...||true)` → authored-asset check fully bypassed). Real regression holes.
- 🟠 **§4.4 master event table missing ~120 events** (now quantified across systems): entire `encounter:*`, `tether:*`, `massline:*`, `sectorsim:*`, `uniqueWreck:*`, `claim:*`, `recovery:*`, `site:*`, `law:*`, `surrender:*`, `drill:*`, `nav:*`, `wingMorale:*`, `station:*`, `aftermath:*`, `tutorial:*`, plus `ai:telegraph/doctrinePhase/flee/formationBroken`, `combat:routeDamage/weakPointHit/nonlethalResolution`, `physics:impact` (ambiguous vs `collision` — owner decide), `game:over` (major runtime transition, undocumented), `player:recoveryFailed`. The table's "authoritative, all aliases reconciled" claim is false.
- 🟠 **Event-name `:` conformance (§0.3/§4.4) NOT enforced by any test** — total blind spot (pairs with the §4.4 rot above).
- 🟠 **`onboarding.js:1183-1320` builds its own DOM** (`document.createElement`/`innerHTML`/`head.appendChild`) — §1.2 arch-boundary deviation, deliberate per header ("self-contained") but precedent-setting; confirm still intended.
- ✅ **CORRECTION — `weapon-impulse-consequence.test.mjs` is a REAL test, not a mock.** Earlier test-audit subagent claimed it "mocks the kernel." The tests subagent verified it imports the REAL createCombatKernel/createCombatCatalog/createBus + real impulseKernel/collisionConsequences and asserts real computed physics (damage ratios 0.6/1.8 at 1e-12 precision, deltaV mass-scaling, zero-momentum→null). **The earlier critique was wrong.** *(Fourth verification self-correction — reinforces: verify, don't relay.)*
- 🟡 **Rep single-writer coverage thin** (only 2 tests) vs credits (9+) /cargo (multiple) — §0.6 triple's weak leg.
- 🟡 **`pq019-heat-incident-listener` fabricates the law receipt signature** — "only law can sign, a mission cannot" is assumed, not tested (idempotency/denial/save-reload ARE real). Drive from a real lawSecurity conviction.
- 🟡 **Goldens gated by npm SCRIPTS, not any .test.mjs** — `node --test test/` validates nothing about the golden; hash asserted only in `sf-sim.mjs:666`.
- 🟡 **99 committed orphan scripts** (neither in package.json nor imported); `check-test-temp.mjs` is literally `console.log('temp')`; `bg-probe-temp.mjs` hardcodes `C:/Users/93rob/...` absolute path.
- 🟡 **Only 3 of 221 tools files wired to npm**; the `check:art` mega-gate references `tools/` zero times — asset-publish tools get no CI consistency gate. 3 committed `.pyc` files. Helios-hub 8-version finalize-script sprawl.
- 🟢 **All 139 blender .py pass py_compile; all art .mjs imports resolve; all 433 npm-referenced scripts exist (no broken wiring).**

## Six pre-claims — ALL CONFIRMED (`findings-tooling.md`)
(a) check:baseline unreachable from CI ✅; (b) :compare tolerates stale goldens (by design, mitigated) ✅; (c) no production-profile golden ✅; (d) no single-writer/event-name enforcement gate ✅; (e) sim-golden-diff diagnostic-only (intentional) ✅; (f) check:massline doc-count 23 ≠ array 26 (doc drift only) ✅.

This file is seeded with findings from the first pass (highlights tour) — those are marked **[seed]**. New findings from the exhaustive sweep are unmarked and appended per area as each directory is read.

---

## Cross-cutting (code vs ARCHITECTURE.md)

- 🔴 **[seed]** `check:baseline` is NOT in the CI gate. `scripts/check-ci-report.mjs` builds the matrix from `precheck`+`check` roots; `precheck` is undefined in package.json and `check` doesn't invoke `check:baseline`. Goldens self-document this: `test/47a.telemetry.expected.json` "check:baseline was RED ON MASTER." **Highest-leverage fix.**
- 🔴 **[seed]** No production-profile golden. Both goldens run under `LEGACY47A_FEATURES` (massline2 off, travel off, combat Tier-B off — `runtimeProfiles.js:59-90`). `PRODUCTION_FEATURES` has zero golden coverage.
- 🔴 **[seed]** PQ-046 collision code path (`combatFlag('weaponImpulseConsequences')`) is OFF in every golden profile; `collisionConsequences.js:95` early-returns. Goldens can't catch regressions in active work.
- 🔴 **[seed]** `:compare` golden links tolerate stale goldens by design (`sf-sim.mjs:704-708` returns ok when both replays agree but disagree with recorded hash). Only non-compare lane actually gates.
- 🔴 **[seed]** Single-writer contracts (credits/rep/cargo §0.6) hold in live path but have NO enforcement test. `test/physics-writer-audit.test.mjs` feeds hand-written strings; `report-physics-writers.mjs` is a report, not a gate.
- 🟠 **[seed]** ARCH §2.2 says `cap 8 steps`; code is `MAX_CATCHUP_STEPS = 4` (`simulationRunner.js:6`). Doc wrong.
- 🟠 **[seed]** ARCH §4.2 system lists off by ~6×. Doc: 20 init / 15 update. Reality (`authoritativeSystemManifest.js`): 127 init / 95 update.
- 🟠 **[seed]** ARCH §3.10 says 8 factions; code has 14 (`src/data/factions/index.js`). 6 new ones default to rep 0.
- 🟡 **[seed]** **Likely real bug:** `newGameDefaults.factionRep` only seeds 8 factions; `factions.js:92-96` reads `NEW_GAME.factionRep[id]`, NOT `FACTION_META.startingRep`. So `faction_pitborn` (authored `startingRep: +40`) starts at 0. Other 5 new factions all 0 anyway, so only pitborn is observably wrong.
- 🟠 **[seed]** ARCH §3.4.1 entity types stale. Doc lists 8; code also has `payload`, `massSeed`, `mine`, `fieldEmitter`, `masslineSnare`, `masslineSnareAnchor` (`coreSystem.js` index).
- 🟠 **[seed]** gameState defaults drift vs ARCH: `magnetRange` 250 vs doc 90 (§3.5); `camera.lookAhead` 26 vs 18 (§0.14); `camera.zoom` 144 vs presets 55/70/130; `audio.master/sfx/music` 0.55/0.7/0.32 vs 0.8/0.9/0.6 (§3.3). bloomStrength/bloomThreshold/particleQuality in-flight via PQ-046.
- 🟠 **[seed]** ARCH §1.1 dep list stale: omits rapier3d-compat (physics authority), @floating-ui/dom, three/addons/ (all in index.html importmap).
- 🟡 **[seed]** No event-name conformance lint (§0.3/§4.4). Live emit() calls are clean but `build-code-index.mjs` has no `--check` mode; nothing fails on a typo'd/orphan event.
- 🟡 **[seed]** `sim-golden-diff.mjs` (only field-level motion classifier) deliberately NOT a gate (its own header). Operator must run by hand on hash flips.

## Confirmed CORRECT (so nobody re-litigates)
- Commodity ID unification (§3.6.1): 46 `cmdty_*`, zero legacy refs in economy/mining/cargo.
- Event delimiter (§0.3): zero non-`:` emit() calls in live code.
- Single-writer credits/rep/cargo in LIVE path (careerCohorts/testing-lab hits are isolated analysis/test states, not in UPDATE_ORDER).
- Determinism (§0.5): one `Math.random()` in sim dirs — `telemetry.js:54` session-id gen. Holds.
- `hp` alias (§3.4.1): `Object.defineProperty` in `entity.js:158-162`.
- Starter config (§0.10): credits 5000, ship_kestrel, cargo 40, sector_helios_prime, beam 18 ore-HP/s — exact.
- Sector count 10, ship count 13 — exact.
- Runtime selection (AGENTS §5): flightV3 + tacticalAI + rapier-dynamic production defaults; ai.js/flight.js retained as fallback.
- DOM layering (§1.2), station hub 7-tab (§5.3), save order (§4.5) — match.
- Zero FIXME/XXX/HACK in src/.
- `starfield.js` confirmed NOT WIRED (§2.4).

---

## src/core/ — READ
Read: gameState, registry, coreSystem, loop, simulationRunner, entity, physics, eventBus, timeEffects, rng, math, runTransitionGuard, spatialHash, physicsAuthority (+ skimmed list of all 50).

- 🟠 **`src/core/time.js` does not exist** but ARCH §6 manifest lists it ("sim-day boundary detection → `day:tick`"). The logic lives in `coreSystem.js` (`DAY_SECONDS=600`, `day:tick` emit at `coreSystem.js:163-173`). Doc manifest stale.
- 🟠 **Three live events missing from ARCH §4.4 master table:** `physics:impact` (`physics.js:1133` — the primary collision-consequence event for the whole SG-02/impulse system), `gate:range` (`physics.js:745,749`), `projectile:nearMiss` (`physics.js:621`). The event table claims to be the authoritative "all aliases reconciled" list.
- 🟠 **Entity carries undocumented fields:** `physicsBody`, `bank`/`pitch`/`prevBank`/`prevPitch` (banking lean for renderer interp), `flightModel`, `entityIndex` on state. None in ARCH §3.4.1 Entity shape.
- 🟡 **Collision category beyond documented Masks bitfield:** `MINE_COLLISION_CATEGORY = 1 << 8` (256) in `physics.js:954`, and `maskOf()` handles `massSeed`/`masslineSnareAnchor` reusing it. ARCH §3.4.1 only documents SHIP..WRECK (1..64). Doc gap, not a bug.
- 🟡 **Legacy `'rapier'` backend still wired** in `physics.js:_syncOptionalBackend` (imports `./rapierCollisionWorld.js`). Production uses `'rapier-dynamic'` (SG-02). The plain `'rapier'` path is reachable only via `physicsBackend==='rapier'` which no default sets — candidate dead code, retained per AGENTS §5 "don't delete casually."
- 🟢 **Confirmed clean:** rng.js (serializable mulberry32 continuation, H9 save/load), math.js, runTransitionGuard.js (monotonic + one-shot commit), spatialHash.js (incremental dynamic layer + static query cache — sophisticated, correct), physicsAuthority.js (WeakMap command membrane, save-safe), eventBus.js (snapshot dispatch, per-handler try/catch, pooled). timeEffects.js matches §2.2 min-wins exactly.

## src/combat/ — READ
Read: damage, impulseKernel, rewardEligibility, kernel (earlier), + skim of all 23.

- 🟠 **`damage.js:287-298` hardcodes weapon ID `wpn_emp_disruptor_m`** for a difficulty-scaling bypass. If that weapon id is ever renamed, the special case silently breaks and the Fulfillment's stop-and-board route gets difficulty-scaled into "an effectively unreachable multi-hit lottery" (per the comment). Fragile string coupling in the damage router; no test guards the id.
- 🟡 **5-channel damage model (kinetic/thermal/ion/plasma/phase) undocumented.** ARCH §0.7 only describes "shield→armor→hull." The real model has shield bypass, penetration, subsystem targeting, channel multipliers, heat, statuses. Doc dramatically understates combat complexity. Not a bug — code is correct — but the doc misleads.
- 🟡 **`SURFACE_DAMAGE_MULTIPLIER.craft = 0.6`** in `impulseKernel.js:28` is the in-flight PQ-046.craft-collision value (was 0; NOW.md confirms active mutation). `VISION_ALIGNMENT_PLAN.md` still says `craft: 0` — doc now stale relative to the code change in progress. The red `check:impulse:authority` is this value crossing the test's expectation.
- 🟢 **Confirmed clean:** `rewardEligibility.js` (durable first-hit truth persisted on AI data record — save-safe design), `impulseKernel.js` (pure receipts, WeakMaps, no motion mutation), damage router (allocation-free scratch channels, per-channel routing).

## src/ai/ — READ
Read: contracts, engagementAuthority (+ skim of all 18).

- 🟡 **`engagementAuthority.js:23-28` hardcodes `LAWFUL_STATION_FACTIONS`** to the canonical 4 (`scn/mts/dmc/free`). With 14 factions now shipping, any new faction that should grant station protection wouldn't unless added here. Probably intentional (only those 4 are "lawful") but it's a silent coupling to the faction list — same disease as the hardcoded weapon id.
- 🟡 **Heavy scenario-specific coupling** for the 47-A onboarding scenario (`SCENARIO_47A_SCAVENGERS`, `scenario.47a.mass-discrepancy`, `is47aScavengerCounterplayAuthorized`). Necessary for the authored opening, but it's a lot of special-case authority code keyed to one scenario id string.
- 🟢 **Confirmed clean:** `contracts.js` (pure normalization, frozen objects, `AI_CONTRACT_VERSION=1` matches gameState), `engagementAuthority.js` (fail-closed multi-layer gate — revalidates hostility/motive/doctrine-phase/leash/station-jurisdiction at execution time; first-session attacker cap; durable predation-relation identity checks). This is well-defended code.

## src/combat/
(pending)

## src/ai/
(pending)

## src/data/ — READ (integrity cross-checks on all catalogs)
- 🟠 **ARCH §6 says "10 sectors"; actual `SECTORS.length` = 24.** Sectors 11-24 are the frontier expansion (nyx_march, hyperion_cut, kepler_scar, orcus_shadow, rhea_cinder, haumea_rift, eris_margin, phoebe_echo, nereid_shoal, proteus_well, triton_wake, eunomia_gulf, sedna_dark, dione_lane). Doc stale by 2.4×.
- 🟡 **6 newer factions (helix/understory/fulfillment/archive/pitborn/verge_layers) have NO stations** in the sector graph (stations reference only the canonical 8 faction ids). They ARE integrated as K1 "depth program" roaming factions — anchored in `data/encounters/170-210-k1-*`, `factionPresence.js`, `factionDoctrines.js`, `bandRadio.js`, `palettes.js`. By design, not a bug — but ARCH §3.10 doesn't acknowledge them at all.
- 🟡 **Re-assess earlier "pitborn rep bug":** pitborn has authored `startingRep: +40` in FACTION_META but `newGameDefaults.factionRep` omits it → starts at 0 via fallback. If pitborn is a met-later K1 faction, neutral-0 may be intentional; the authored +40 suggests someone wanted them friendly. **Verify intent** rather than treat as definite bug. The mismatch between `FACTION_META.startingRep` and `newGameDefaults.factionRep` is real either way — two sources of truth for starting rep.
- 🟢 **Cross-refs clean:** 0 bad sector neighbor refs; 0 unknown faction refs from stations; all 45 encounter shapes load via generated barrel; `encounterDirector` referenced shapes (`claim_threat`, `ambush_snare`) exist.
- 🟢 **Commodity registry clean:** 46 `cmdty_*` ids, station-type refs in producedBy/consumedBy valid.

## src/systems/ — READ (hygiene-scanned all 133; full-read economy+cargo; single-writers verified)
- 🟢 **Single-writer contracts all hold in live path:** credits (economy.js grantCredits/chargeCredits only), rep (factions.js only), cargo (cargo.js addCargo/removeCargo only — `e.data.derived` written only by ships.js:859,998 via getDerivedStats). Verified by grepping live dirs, excluding test/balance/testing-lab harnesses.
- 🟢 **economy.js documents a previously-latent NPC-wallet bug now FIXED** (`economy.js:453-459`): NPC/aiTrader trades used to route through `execute()` which hardcoded `isPlayer=true`, "so an NPC 'sale' literally paid the player." Now uses stock-only `applyStockPressure`. Good catch, fixed, documented.
- 🟡 **`execute()` still hardcodes `const isPlayer = true`** (`economy.js:1023`) with a comment that current callers act on the player hold. Brittle but documented; safe as long as no NPC caller uses execute() directly (the fix above routes them elsewhere).
- 🟡 **`economy.js` is far richer than ARCH §3.6** — closed-form price integrals (`avgMid`), regional supply recipes, demand model, economy cycles (hidden formula regimes), trade-ledger lot accounting, market intel memory. ARCH describes a simple stock/eq/eventMods market. Doc dramatically understates; code is correct and impressive.
- 🟡 **Precision on earlier golden finding:** `weaponImpulseConsequences: true` in `PRODUCTION_FEATURES` (`runtimeProfiles.js:17`) — so PQ-046 collision code IS live in the shipping game. The gap is only that `LEGACY47A_FEATURES` (the golden profile) pins it OFF, so goldens don't exercise it. Not "code dead in production" — "code uncovered by deterministic gate."
- 🟡 **Undocumented event `cargo:jettisoned`** (`cargo.js:254`) — not in ARCH §4.4 table.
- 🟢 **Hygiene clean:** 0 `console.log/debug` (only warn/error), 0 FIXME/XXX/HACK/BUG markers, only `telemetry.js:54` Math.random (session-id, determinism-safe).
- 🟢 **Integration clean (orphan scan):** all 45 encounter files imported via generated barrel `index.generated.js`; all flavor files similarly wired; `masslineMetrics.js` used by lab harness. **Only real orphan is `starfield.js`** (already documented in ARCH §2.4 as deliberately unwired harvest candidate). Despite repo history, little dead gameplay code.

## src/systems/ — additional deep reads (weapons, flightV3, world, mining, input heads)
- 🟠 **Magnet range has THREE sources of truth:** `gameState.js:76` `player.magnetRange: 250`, `mining.js:36` `MAGNET_RANGE = 420` (the actual pull radius used), and ARCH §3.5 `magnetRange: 90`. The mining constant wins at runtime; the gameState field appears dead/overridden. Either remove the player.magnetRange field or make mining read it. Doc (90) is stale regardless.
- 🟡 **`src/ui/panels/moduleRisk.js:76` flagged as stale text** by `mining.js:79-84`: it claims a "greed gets loud" mining-noise danger mechanic. The mechanic was previously dead (`danger:miningNoise` emitted to nobody) and is NOW wired via `sectorsim:impulse`, but the UI text may describe the old/non-existent version. Verify the text matches the now-working mechanic.
- 🟡 **world.js documents a single-writer exception:** "Radiation hull drain is an environmental effect applied to the entity hull, which has no separate combat owner" (`world.js:23`). Hull is normally combat-owned; this is a documented, deliberate cross-owner write. Not a bug — but worth noting it's the one place the §0.6 contract is intentionally bent.
- 🟢 **mining.js documents two found-and-fixed dead-code issues** (bulkHaul chunk path was unreachable; `danger:miningNoise` emitted to nobody) — evidence the team actively hunts and fixes dead code. The "were unreachable code that had never run once" comment at `mining.js:50-52` is exactly the kind of archaeology note that makes this codebase maintainable.
- 🟢 **weapons.js + flightV3.js contract-respecting:** weapons gates behavior on runtime feature flags not `typeof window` (Node/browser parity, `weapons.js:76-79`); flightV3 never writes pos/vel/rot directly — only force/torque/impulse through the SG-02 membrane (`flightV3.js:5-6`). `legacy47a keeps weaponHeatVent false so 47-A goldens stay stable; production enables it` (`weapons.js:74-75`).

## src/render/ — deep reads (camera, renderer heads)
- 🟠 **ARCH §0.14 camera params substantially stale.** `camera.js`: `SHAKE_POS_MAX=1.55` (doc says 2.2); `TRAUMA_DECAY_PER_S=1.8` (doc says 1.6); zoom system fully redesigned — `DEFAULT_ZOOM=144`, `CAMERA_ZOOM_MIN=45`, `CAMERA_ZOOM_MAX=330`, plus speed-zoom (0.88–1.18×) and physics-earned-speed-zoom (up to 1.55×). Doc's "presets combat 55/cruise 70/map-peek 130, scroll clamps 45..130" no longer reflects reality.
- 🟡 **`gameState.camera.lookAhead: 26` is a second dead-ish default** (like magnetRange): `camera.js:39-40` uses its own `LOOKAHEAD_MAX=18` (normal) / `LOOKAHEAD_MAX_CRUISE=26`. The gameState value is overridden. ARCH §0.14's "lookAhead max 18" is correct for the normal case but misses cruise 26.
- 🟠 **ARCH §6 render file manifest wildly incomplete.** `renderer.js` imports ~15 modules not in the doc's render table: `parallaxLayers`, `spaceReflectionEnvironment`, `visualOverrides`, `post/spaceRenderGraph`, `partsLibrary`, `assetLoader`, `asteroidInstancePool`, `renderEntityFrame`, `presentationWorld/Publisher/Queries`, `lod`, `collisionDebug`, `diagnostics`. Doc lists 9 render files; the dir has 108.
- 🟢 **camera.js is sophisticated and correct-in-spirit:** floating-origin (frame-local chase focus, galactic-global entity.pos), 32Hz-fixed shake noise resample (display-frequency consistent — determinism-safe cosmetic), distance-attenuated world-event shake (NPC explosion no longer hits player camera full-force), motion-reduce scale 0.25. ARCH §0.14's *intent* (no yaw follow, damped follow, trauma model) is honored; only the numbers drift.

## src/ui/
(pending)

## src/save/
(pending)

## scripts/ + tools/ + test/ — structural scans
- 🟡 **203 of 827 scripts (~25%) are neither referenced in package.json nor imported by another script.** Mostly `capture-*` (screenshot/lab capture), `build-*` (release/build), `bg-*-temp` one-offs. Mix of legit hand-run CLI tools and stale one-offs. ~25 carry explicit stale-name signals (`temp`/`old`/`draft`/`exp`). This is the closest thing to "abandoned/unintegrated work" in the repo — and it's in tooling, **not gameplay**. Candidate: a triage pass to archive/remove true orphans (e.g. `bg-ab-perf-temp.mjs`, `capture-bg-temp.mjs`, `gen-sector-geography-draft.mjs`).
- 🟢 **tools/ is asset-authoring surface** (139 blender `.py` + 70 art `.mjs`) — low gameplay-relevance per the owner ("assets don't matter for core gameplay"); not deep-reviewed. Structure is clean (organized by tool family).
- 🟡 **Only 3 test goldens** (`test/*.expected.json`) — the 47a telemetry pair + v3. Confirms the test-audit finding: deterministic coverage is narrow and legacy47a-scoped.
- 🟢 **No silent test skips found at scan level** (the test-audit subagent earlier confirmed `it.skip`/`todo` are disciplined — explicit-with-reason, never silent passes). Files matching `.skip(` tokens are ones that *document* the skip policy, not silently skip.
- 🟢 **Overall tooling health is good:** package.json is enormous (58KB) but structured; `check:baseline`/`check:all`/`check:ci:report` machinery is sophisticated; the gap is *coverage* (production features uncovered) and *CI wiring* (baseline not in the gate), not broken tools.
