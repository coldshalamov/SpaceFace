<!-- LIFETIME: VOLATILE — senior-engineer's whole-repo picture + consolidation roadmap. -->
# SpaceFace — Senior-Engineer Review & Consolidation Roadmap

> **OWNER TRIAGE (2026-08-10):** See `review/OWNER_TRIAGE.md`. Safe packet executed
> (loss headlines, ARCH pointers/counts, customs comment, hide fake magnet stats).
> Do **not** execute Phase 1–5 as written — several “critical” items were demoted or rejected.

This is the capstone of the thermonuclear review (`review/FINDINGS.md`, `findings-{render,ui,…}.md`,
`ABANDONED.md`, `FIXES_PROPOSED.md`, `MANIFEST.md`). Read this first; drill into the per-area files
for evidence. Every claim here is backed by file:line evidence or a subagent-verified git-history
check. Where code and docs disagreed, I determined the **intended truth via `git log`** rather than
assuming the doc was stale — because agents frequently change code without updating docs, and
"fixing per doc" has regressed real fixes here (e.g. automation passive-cap, loop cap).

## The whole-repo picture (the "sense of everything")

**Scale:** ~688k lines of code across 780 src / 698 test / 827 script / 220 tool files, plus ~996 docs.
**Architecture:** Three.js browser/Electron space game. Flat `GameState`, event bus, ~127-system
fixed-timestep (60Hz) sim decoupled from a presentation layer; sim is deterministic (`state.rng`/
`simTime`), presentation is cosmetic (Math.random allowed). Rapier-dynamic physics via an SG-02
command membrane; flight V3 + tactical AI are production defaults; legacy `flight.js`/`ai.js` retained
as fallbacks. One game path (browser/Electron/probes share gameplay).

**The dominant finding, with high confidence:** the gameplay code is **disciplined, well-contracted,
and actively maintained.** Verified clean: single-writer (credits/rep/cargo/derived), determinism
(one `Math.random` in sim, a session-id), commodity-id unification (46 `cmdty_*`), event `:` delimiter,
hp alias, starter config, save order, runtime selection, hostility oracle, damage router, economy
closed-form pricing, AI fail-closed engagement gate. Zero FIXME/XXX/HACK repo-wide. Found-and-fixed
dead code is documented inline (mining bulkHaul, danger:miningNoise). **There is no large block of
abandoned or broken gameplay code** — the only true orphan is `starfield.js`, already documented as
deliberately unwired.

**The disease is documentation rot**, with two secondary veins: **repo/tooling hygiene drift** and a
handful of **isolated code smells + a few real bugs**.

### Why the docs rotted (root cause)
ARCHITECTURE.md was **literally accurate at the initial commit** (2026-06-16) — verified: §2.2's
`steps < 8` and §4.2's 20-system list were token-for-token transcriptions of the original code. Then
agents grew/refactored the code (system manifest introduced 7/24; loop cap reduced 7/28; 14 new
factions 7/13–14; galaxy expanded to 24 sectors 7/11; camera/bloom/UI all redesigned) **without
updating the docs**. So almost every "doc vs code" discrepancy is **code-is-intended, doc-is-stale** —
but not all (see "be careful" below). The fix is structural: stop duplicating enumerative facts in
prose; point to the code source; make doc-sync part of "done" (the proposed AGENTS.md rule).

### Be careful — cases where "fix per doc" would regress the code
These are the trap the owner warned about. Verified examples:
- **Automation passive-cap** (`automation.js:1460`): code uses a HARD CLAMP, not the spec's
  `cap+(net-cap)*0.25`. The spec formula breaks the cap (verified 310/min > 250 active). **Code is
  right; fix the spec.**
- **Loop cap 4** (`simulationRunner.js:6`): doc says 8; 8 was the original, reduced to 4 deliberately
  in a perf refactor. **Fix the doc.**
- **magnetRange 420** (`mining.js:36`): doc says 90 (original), gameState 250 (inert). **Fix the doc.**
- **14 factions / 24 sectors / 127 systems**: doc says 8/10/20. All grew deliberately. **Fix the docs.**

The meta-rule for whoever fixes: **for every doc/code mismatch, check `git log` to confirm which side
moved and why, before changing either.**

## The real bugs (verified, prioritized)

| # | Severity | Finding | File:line |
|---|---|---|---|
| 1 | 🔴🔴 | **~51% of test files NEVER RUN in CI** — no glob discovery; ~355 of 693 are dead weight (`ai-behavior-stability`, `massline-invariants`, `freight-cargo-custody`, `bounded-autosave`, etc.). One-line fix (`node --test test/*.test.mjs`) makes half the suite live. | package.json (no glob); findings-tests.md |
| 2 | 🔴 | UI mutates physics directly (`ui:drillFadeStart` zeroes vel, animates pos via rAF, sets rot, mutates tether) — §6 violation + sim/rAF race | uiRoot.js:892-963 |
| 3 | 🔴 | Tractor-module `magnetRange` stats (400/720) are DISPLAY-ONLY — `playerModSum` never called with 'magnetRange'; player buys a "720 magnet" that does nothing | modules.js:114-120; mining.js:1043,1585 |
| 4 | 🔴 | `shaders.js` listed in ARCH §6 but file DOES NOT EXIST (zero importers) — pure dead doc row | ARCHITECTURE.md:870 |
| 5 | 🔴 | `lossLedger.js` uses `'faction_concord'`/`'faction_drift'` which DON'T EXIST (canonical `faction_scn`/`faction_dmc`) — every Concord/Drift loss headline falls through to default | lossLedger.js:141,143 |
| 6 | 🔴 | `intervention.js` `_nextId` not re-derived on `save:loaded` → id/alert-key collisions after Continue (claims.js does it right) | intervention.js; cf claims.js:1568 |
| 7 | 🔴 | Two CI-gated checks neutered by `\|\| true`: `check-map-information-depth` precondition + `check-m4-living-galaxy-player-route` authored-asset check | check-map-information-depth.mjs:876; check-m4-living-galaxy-player-route.mjs:651 |
| 8 | 🟠 | `check:baseline` not wired into CI (`check:all` runs `precheck`+`check`; `precheck` undefined) — gate that catches stale goldens is invisible to CI | package.json; check-ci-report.mjs |
| 9 | 🟠 | No production-profile golden — goldens run `LEGACY47A` features only; the shipping feature set (incl. live combat Tier-B) has zero deterministic coverage | runtimeProfiles.js; test/*.expected.json |
| 10 | 🟠 | §4.4 master event table missing ~120 events; event-name `:` conformance + single-writer/rep contracts have NO enforcement test — nothing fails on a new violation | §4.4; (no tests) |
| 11 | 🟠 | `combat.js` emits `game:over` (major runtime transition) undocumented; `physics:impact` ambiguous vs `collision` | combat.js:553,635; heistFacilities.js:162 |
| 12 | 🟡 | HUD advertises a travel-drive energy drain that "does not yet SPEND from it"; `shipyard.js` sell bypasses intent bus; vfx.js nav-index off by 4-9k lines | hud.js:3961; shipyard.js:811; vfx.js:9 |
| 13 | 🟡 | Hardcoded id coupling (`wpn_emp_disruptor_m`, enemy-id lists, `ship_kestrel`/`sector_helios_prime`, `CONCORD_FACTION_ID` defined twice, `LAW_FACTIONS`) — every edit risks a lossLedger-style drift | scattered |

## Verification self-corrections (the method that makes this review trustworthy)
Four findings I initially logged were **wrong until verification overturned them**: (1) pitborn DOES start +40 via fallback (not 0); (2) customs hidden-hold IS wired into the engine (comment was stale); (3) `weapon-impulse-consequence.test.mjs` is a REAL test (not a mock); (4) goldens are NOT stale (re-recorded 2026-08-09; the risk is the `:compare` lane). **Lesson baked into the `VERIFIED` block: `git log`/read the actual code before logging a discrepancy — agents change code without updating docs, so the doc is very often the wrong side.**

## The doc rot (verified intended-truth, fix the doc not the code)
ARCHITECTURE.md: §2.2 loop cap (8→4); §4.2/§2.3 system lists (20/13 → 127/95, point at
`authoritativeSystemManifest.js`); §3.10 factions (8→14, note 6 are K1 roaming); §6 sectors (10→24) +
the §6 file manifests throughout (core 18→50, render 9→108, ui list phantom files); §0.14 camera
(shake 2.2→1.55, decay 1.6→1.8, zoom presets → 45/144/330 + speed-zoom); §2.4 renderFrame order
(actual: prepareFrame→vfx→drawPreparedFrame); §3.4.1 entity types/masks (6 new types); §1.1 deps
(rapier, floating-ui); §4.4 event table (missing physics:impact, gate:range, projectile:nearMiss,
cargo:jettisoned); §5.1/§5.2/§5.3 UI (body not #ui-root; fulfillmentBlackoutActive; 7-tab rail is now
Market/Shipworks/Industry/Missions/Factions/Bar/Ledger); bloom (single-pass → multi-scale pyramid).
Plus 6 doc-vs-doc conflicts in `design/` (GEMINI "LAWS" overclaim; COMMAND_DECK drops VISION from
authority chain; broken `HUD_REVAMP_DESIGN.md`/`WORLD_OVERHAUL`/`FLIGHT_PHYSICS_SPEC` citations;
Massline verb GDD-vs-revamp; subsystem-HP targeting contradicts §0.7+VISION).

## Repo / tooling hygiene (the real "abandoned work" surface)
- **203 of 827 scripts (~25%)** are neither in package.json nor imported by another script — mostly
  legit hand-run CLI/capture/build tools, ~25 with stale-name signals (`-temp`/`-old`/`-draft`). This,
  not gameplay, is where abandoned/unintegrated work actually lives. **Triage pass recommended.**
- Tracked junk at repo root: 5 misplaced binaries (`2026-*.png`, `hull_*.blend`, `place_*.blend`) +
  4 `_*lab.html` (the stray `-`/`nul` are gitignored local Windows-redirect accidents, not tracked).
- Semi-orphaned UI screens: `screens/starmap.js` + `screens/localmap.js` (registered, never pushed —
  galaxyMap replaced them); `screens/drill.js` (superseded by asteroidScreen); `screens/stationHub.js`
  (now helper-only); `commandBar.js` (dead flag). Decide integrate-or-delete.
- `--class/` + the m5_claim_outposts tree: PQ-019 receiver candidate (in NOW.md "uncommitted"),
  needs REVISE/KEEP/discard decision — protected, not abandoned.

## Consolidation roadmap (what the future work is, in priority order)

### Phase 1 — Stop the rot + unlock half the test suite (structural, small, highest-leverage; ~1-2 days)
1. 🔴🔴 **Add `node --test test/*.test.mjs` glob discovery** (or wire every test into a `check:*`). ~355 of 693 test files currently never run — this single change makes the entire existing test investment live. **Do this FIRST.**
2. Add the docs-sync rule to `AGENTS.md` §6 (text in `FIXES_PROPOSED.md`): never duplicate enumerative facts in prose; point to code sources; new system/faction/event/default → update the matching doc in the same commit.
3. Convert ARCH §4.2/§2.3 to **pointers** to `authoritativeSystemManifest.js` (kills the re-rot).
4. Add `check:docs-sync` (faction/sector/§4.2-pointer invariants) + a **single-writer enforcement test** + **event-name `:` conformance check** + a **rep single-writer test** (additive; all pass today, fail-on-regression forever). Wire into `check:baseline`.
5. Add a **test-wiring audit check** that fails if a `.test.mjs` isn't reachable from any `check:*` (prevents the 355-dead-tests problem recurring).

### Phase 2 — Reconcile the doc to current truth (~1-2 days, mostly mechanical)
Update every "doc-is-stale" item. For each, `git log` confirms code-is-intended, so edit the doc. Re-dump §4.4 (add ~120 missing events) or drop its "authoritative" claim. Single PR. This is the bulk that makes the repo legible to the next agent.

### Phase 3 — Fix the real bugs (~2-3 days)
1. Move `ui:drillFadeStart` ship positioning behind a sim-owned intent (fixes §6 violation + sim/rAF race).
2. Wire tractor-module `magnetRange` mods into `playerModSum` (or remove the misleading UI stat).
3. `lossLedger.js`: fix `faction_concord`→`faction_scn`, `faction_drift`→`faction_dmc`.
4. `intervention.js`: re-derive `_nextId = max(existing)+1` on `save:loaded` (mirror `claims.js:1568`).
5. Remove the two `|| true` neutered assertions (`check-map-information-depth:876`, `check-m4-living-galaxy-player-route:651`) — make them real or delete honestly.
6. Delete the `shaders.js` row from ARCH §6; repair the `vfx.js` nav index.
7. Close the half-finished travel-drive energy drain in the HUD (spend it or hide the gauge).
8. Drive `pq019-heat` from a real lawSecurity conviction so "a mission cannot sign" is actually proven.

### Phase 4 — Coverage + CI (~2-3 days)
1. Wire `check:baseline` into CI (accept it's red until PQ-046's impulse assertion lands, or mark non-blocking until then).
2. Add a **production-profile golden** so the shipping feature set has deterministic coverage (do after PQ-046 lands to avoid churn).
3. Promote `sim-golden-diff.mjs` (the only field-level motion classifier) from diagnostic to gate.
4. Scripts triage: delete the 99 committed orphans + `check-test-temp.mjs` (`console.log('temp')`); archive CLI tools; remove root junk + 3 committed `.pyc`.

### Phase 5 — De-couple the magic strings (taste, ~ongoing)
Replace hardcoded faction/weapon/sector/ship ids with data-driven lookups: `wpn_emp_disruptor_m` in
damage router, enemy-id lists in precompile, `ship_kestrel`/`sector_helios_prime` in render, the 4
hardcoded lawful factions. Each is a silent-break-on-rename hazard.

## Meta-lessons (the senior-engineer read)
1. **The codebase's biggest risk is not bugs, it's illegibility at scale.** 127 systems, 688k lines,
   docs 6 weeks out of date. The review/ ledger this produced is itself the missing "sense of
   everything" — keep it alive.
2. **Agents change code, not docs.** Every long-running agent-driven repo needs the docs-sync rule
   AND an enforceable check, or the docs become adversarial (they mislead the next agent into
   regressing real fixes).
3. **The verification discipline matters more than the reading.** Two of my findings were wrong until
   subagents checked git history (pitborn DOES start +40 via fallback; I'd have "fixed" it). Always
   `git log` a discrepancy before acting on it.
4. **The sim/presentation split is the backbone and it holds.** Every render file verified to write
   zero sim state; every UI economic action is intent-only. The one violation (`drillFadeStart`) is
   the exception that proves how clean the rest is. This is the contract to defend hardest.
5. **Tests are the weak layer.** Sophisticated check tooling, but narrow coverage (legacy47a goldens
   only), contracts unenforced, and several tests-that-test-nothing. The next dollar of engineering
   spend goes here for durable confidence.

## Status of this review
- **Verified (subagent + git history):** magnetRange, loop cap, system count, factions, sectors,
  pitborn correction, automation cap deviation, scanner oracle — all in FINDINGS.md "VERIFIED" block.
- **Deep-read:** core, combat, ai, systems gameplay-core, data integrity, render camera/renderer, ui
  core, scanner, automation, story, presentation heads.
- **Bulk-read by subagent (reports persisted/incoming):** render (`findings-render.md`), ui
  (`findings-ui.md`), systems long-tail + scripts/tools + tests (background; will be
  `findings-systems-tail.md`/`findings-tooling.md`/`findings-tests.md`).
- **Concurrent work noted:** PQ-047 active (`encounterScripts.js` + pirate-predation test mid-flight);
  PQ-018 cathedral assets dirty; `--class/` PQ-019 uncommitted. Treat those paths as unstable.
