# PROGRESS LEDGER — the single source of truth for what's done / in-flight / next

> **Read this FIRST, every session.** It is more authoritative than `STATUS.md`, memory, or any status doc for
> task state. If a task is marked `DONE` here, do not redo it; if `IN-FLIGHT`, check its branch before touching its
> files; if `NEXT`, that's your pick. **Every task updates this file as its FIRST and LAST action** (see
> `WAVE4_PROMPT.md` §0 for the exact update protocol).
>
> **Authority chain:** `ARCHITECTURE.md` > `design/GDD_2_0.md` > `design/revamp/REVAMP_MASTER.md` (§1–§15) > this
> ledger (task state) > `STATUS.md` (wave narrative) > memory. When this ledger and `STATUS.md` disagree on task
> state, **this ledger wins** — update `STATUS.md` to match.
>
> **Snapshot basis:** working tree as of 2026-07-06 (~17k lines ahead of HEAD; trust the tree over HEAD per
> `AGENTS.md §3`). Re-verify any `DONE` row's claim before building on top of it — grep the file, run the check.

---

## STATE KEY
- `DONE` — implemented + its check passes (or it's a doc move). Safe to build on.
- `DONE-VALIDATED` — already shipped under a different name; quarry re-derived it. DO NOT rebuild (see `DETAIL_PACKETS §3`).
- `IN-FLIGHT` — a session is actively working it. Do NOT touch its `files` unless you are that session.
- `NEXT` — ready to pick up; no blocker. The lowest `NEXT` in each track is the recommended next task for that track.
- `BLOCKED` — waiting on a dependency named in `depends-on`.
- `CUT` — rejected per `DETAIL_DOCTRINE §8`; do not implement.

> **Branching policy:** all work is on `master` — no feature branches. (The `branch` column in the tables below is
> retained for a future where that changes, but is currently unused; leave it `—`.) Conflict prevention is by the
> `status` + `files` columns: a row marked `IN-FLIGHT` locks its files to that session.

---

## T1 — VERIFICATION SCAFFOLDING (new `scripts/` only; no code/assets)

| id | task | files | status | branch | check | depends-on | next |
|---|---|---|---|---|---|---|---|
| T1a | `check-encounter-director.mjs` — verify `encounterDirector.js` determinism + budget + one-voice | `scripts/check-encounter-director.mjs` (new), `package.json` | NEXT | — | `npm run check:encounter-director` | — | T1b |
| T1b | `check-one-voice.mjs` — verify `voiceArbiter.js` (no overlap 10-min; migrate legacy-toast stragglers) | `scripts/check-one-voice.mjs` (new), `package.json`, possibly 1-2 `src/` toast callers | NEXT | — | `npm run check:one-voice` | T1a | T1c |
| T1c | `check-release-soak.mjs` — 30-min soak within budget, no drift/leaks/untelegraphed spawns | `scripts/check-release-soak.mjs` (new), `package.json` | NEXT | — | `npm run check:release-soak` | T1a | — |

## T2 — DOC CLEANUP (zero code/assets)

| id | task | files | status | branch | depends-on | next |
|---|---|---|---|---|---|---|
| T2a | Move stale `design/ARCHITECTURE.md` (3.5KB handoff) → `design/_ARCHIVE/` (collides with root `ARCHITECTURE.md`) | `design/ARCHITECTURE.md` → `design/_ARCHIVE/handoff_architecture.md` | DONE 2026-07-06 | — | file moved via `git mv`; refs updated in `AGENTS.md:82`, `design/AGENTS.md:9`, `docs/MODULE_MAP.md:262`; root `ARCHITECTURE.md` (920 lines) intact | — |
| T2b | Mark `design/adr/0003-flight-physics-controller.md` SUPERSEDED (V3+rapier mandatory; it says "optional") | `design/adr/0003-flight-physics-controller.md` | DONE 2026-07-06 | — | SUPERSEDED banner added; cites `gameState.js:16` (`physicsBackend:'rapier-dynamic'`, `flightBackend:'v3'`) + `flightV3.js`/`src/core/flight/*` as live; original "Accepted" status preserved as historical | T2a | — |
| T2c | Mark `design/FLIGHT_PHYSICS_SPEC.md` legacy (point to SPEC3-F3) | `design/FLIGHT_PHYSICS_SPEC.md` | DONE 2026-07-06 | — | LEGACY banner added; points to `design/spec3/SPEC3-F3-flight-physics-feel.md` (verified EXISTS 19KB); flags "Collision And Backend Policy" section (default `custom`, Rapier "optional") as wrong-as-of-V3 | — | — |
| T2d | Fix `design/BUILD_PLAN_2_0.md §42` ownership line → `flightV3.js` + `src/core/flight/*` | `design/BUILD_PLAN_2_0.md` | DONE 2026-07-06 | — | §42 ownership row now names `flightV3.js` + `src/core/flight/*`; legacy `flight.js`/`flightDynamics.js` noted as CI-pinned, not actively edited; original line preserved as strikethrough context | — | — |
| T2e | Fix `README.md §87` → add spec3 + AGENTS.md front-door pointer | `README.md` | DONE 2026-07-06 | — | §87 now lists `design/spec3/` alongside spec2; added pointer block to `AGENTS.md` (front door) + `design/revamp/` (build plan + ledger) + root `ARCHITECTURE.md` (contract) | — | — |
| T2f | Fix `design/CURRENT_BUILD_STATUS.md` line 54 (encounterDirector NOT missing) + line 41 (check-cruise EXISTS) | `design/CURRENT_BUILD_STATUS.md` | DONE 2026-07-06 | — | Line 54: `encounterDirector.js` EXISTS (1033 lines) + `check-encounter-director.mjs` EXISTS (13KB) — both corrected from "missing". Line 41: `check-cruise.mjs` EXISTS (11KB) — corrected from "missing". **⚠ Side-finding: T1a lists `check-encounter-director.mjs` as a new file to create — it already exists; T1a scope is now "verify/augment", not "create".** | — | — |
| T2g | Fix `AGENTS.md §5` "zero importers" wording for flight.js/ai.js (CI-live/runtime-fallback, load-bearing) | `AGENTS.md` | DONE 2026-07-06 | — | Both legacy rows now say "not dead — statically imported by `registry.js:9,13`, `sf-sim.mjs`, `check-*` CI gates; CI-load-bearing". Verified via grep: flight.js imported by registry.js + 9 scripts; ai.js by registry.js + 6 scripts. Rules section updated to match (frozen fixtures, not dead code). | — | — |
| T2h | Add `Status: LEGACY` headers to loose drift docs (SKILLS/STATION_MARKET/WORLD_OVERHAUL/GRAPHICS_*) | various `design/*.md` | DONE 2026-07-06 | — | 6 docs tagged: `GRAPHICS_MASTERPLAN`, `GRAPHICS_SPEC`, `GRAPHICS_UPGRADE_PLAN`, `SKILLS_IMPROVEMENT_SPEC`, `STATION_MARKET_UI_REVAMP`, `WORLD_OVERHAUL_2_1`. Each banner cites `AGENTS.md §4` + points to the live spec2/spec3/revamp authority that supersedes it. | — | — |

## T3 — FINISH MASSLINE LADDER (Wave 2's unfinished rungs; `STATUS.md` confirms lane is free)

> Sequenced by the ladder's own dependency order. Each rung lands with its own check (ladder discipline).
> Rungs 01–03 are DONE; the ladder actually stopped at rung 04.

| id | rung | task | files | status | branch | check | depends-on | next |
|---|---|---|---|---|---|---|---|---|
| T3-01 | 01 | telemetry | `masslineTelemetry.js` | DONE-VALIDATED | — | `check:massline:telemetry` | — | — |
| T3-02 | 02 | release-rated event | `tetherGameplay.js` | DONE-VALIDATED | — | `check:massline:release` | — | — |
| T3-03 | 03 | release feedback | presentation layer | DONE-VALIDATED | — | `check:massline:release-feedback` | — | — |
| T3-04 | 04 | `tether.load` field | `tetherGameplay.js`, `masslineTelemetry.js`, `vfx.js` | DONE 2026-07-06 | — | `npm run check:massline:load` PASS | T3-03 | T3-05 |
| T3-05 | 05 | snap-catch | `masslineTelemetry.js` | DONE 2026-07-06 | — | `npm run check:massline:snapcatch` PASS | T3-04 | T3-06 |
| T3-06 | 06 | reel-pump | `masslineTelemetry.js` | DONE 2026-07-06 | — | `npm run check:massline:reelpump` PASS | T3-05 | T3-07 |
| T3-07 | 07 | target-scoring (pure) | `combat/masslineTargetScoring.js` (new) | DONE 2026-07-06 | — | `npm run check:massline:target-scoring` PASS | T3-06 | T3-08 |
| T3-08 | 08 | auto-target wire | `combat/autoTargetMode.js` | DONE 2026-07-06 | — | `npm run check:massline:auto-target` PASS | T3-07 | T3-09 |
| T3-09 | 09 | threat events | `masslineThreats.js` (new) | DONE 2026-07-06 | — | `npm run check:massline:threats` PASS | T3-08 | T3-10 |
| T3-10 | 10 | threat feedback | presentation layer | DONE 2026-07-06 | — | `npm run check:massline:threat-feedback` PASS | T3-09 | T3-11 |
| T3-11 | 11 | arc-preview data | `masslineTelemetry.js` | DONE 2026-07-06 | — | `npm run check:massline:arc-data` PASS | T3-10 | T3-12 |
| T3-12 | 12 | arc-preview render | `vfx.js` | NEXT | — | `check:massline:arc-render` | T3-11 | T3-13 |
| T3-13 | 13 | whip-impact detect | `masslineImpacts.js` (new) or `masslineTelemetry.js` | NEXT | — | `check:massline:whip-impact` | T3-12 | T3-14 |
| T3-14 | 14 | whip feedback (+opt damage) | presentation + `combat.js` | NEXT | — | `check:massline:whip-feedback` | T3-13 | T3-15 |
| T3-15 | 15 | impulse authority helper | `impulseCharges.js` | NEXT | — | `check:impulse:authority` | T3-14 | T3-16 |
| T3-16 | 16 | impulse+massline combos | `impulseCharges.js` | NEXT | — | `check:impulse:massline-combos` | T3-15 | T3-17 |
| T3-17 | 17 | mining bulk-haul guidance | `mining.js`, HUD | NEXT | — | `check:mining:bulk-guidance` | T3-16 | T3-18 |
| T3-18 | 18 | 47-A spindle stabilization | `47aLiveScene.js` | NEXT | — | `check:47a:spindle` | T3-17 | T3-19 |
| T3-19 | 19 | 47-A scavenger line-threat | `47aLiveScene.js`, `enemies.js` | NEXT | — | `check:47a:scavenger-threat` | T3-18 | T3-20 |
| T3-20 | 20 | 47-A debris sling | `47aLiveScene.js` | NEXT | — | `check:47a:debris-sling` | T3-19 | T3-21 |
| T3-21 | 21 | 47-A recovery contested | `47aLiveScene.js` | NEXT | — | `check:47a:recovery-contested` | T3-20 | T3-22 |
| T3-22 | 22 | 47-A civilian priority | `47aLiveScene.js` | NEXT | — | `check:47a:civilian-priority` | T3-21 | T3-23 |
| T3-23 | 23 | 47-A physical branch resolution | `47aLiveScene.js`, `scenarioRuntime.js` | NEXT | — | `check:47a:physical-branches` | T3-22 | T3-24 |
| T3-24 | 24 | consolidated `check:massline` aggregate + `docs/MASSLINE_MECHANICS.md` | `package.json`, `docs/MASSLINE_MECHANICS.md` | NEXT | — | `check:massline` | T3-23 | — |

## T4 — WAVE 3 NEW BPs (after T3 lands; per `DETAIL_PACKETS §5` dependency order)

| id | BP | packets | status | branch | check | depends-on | next |
|---|---|---|---|---|---|---|---|
| T4a | BP-11 Sector Atmosphere | 14 packets (`detail/A_sector_station.md`) | NEXT | — | `check:sector-atmosphere` | T3 done | T4b |
| T4b | BP-12 Causal Economy | 14 packets (`detail/E_salvage_economy_contracts.md`) | NEXT | — | `check:causal-economy` | T4a | T4c |
| T4c | BP-01.1 Wreck provenance + salvage depth | 8 packets | NEXT | — | (BP-01.1 checks) | T4b | T4d |
| T4d | BP-13 Pirate Ecology (LAST) | 12 packets (`detail/B_traffic_pirates.md`) | NEXT | — | `check:pirate-ecology` | T4c | T5 |

## T5 — BP-0X.1 ADDENDA (after each owning wave merges; hard-freeze rule)

| id | addendum | status | depends-on | next |
|---|---|---|---|---|
| T5a | BP-02.1 combat readability (9 packets) + BP-02 mining fold (7) | NEXT | T4 (combat lane) | — |
| T5b | BP-05.1 story/comms (7 packets) | NEXT | T4 | — |
| T5c | BP-07.1 flight/ship-mass (5 packets) | NEXT | T4 | — |
| T5d | BP-10.1 audio (7 packets) | NEXT | T4 | — |
| T5e | BP-09.1 builds/synergies (4 packets) | NEXT | T4 | — |
| T5f | BP-03.1 map (3 packets) | NEXT | T4 | — |

## T6 — ASSET MANIFEST SYNC + QUEUED ASSET AUTHORING (coordinate with graphics lane)

| id | task | status | depends-on | next |
|---|---|---|---|---|
| T6a | Add `status:"blocked"` to 3 wholeship manifest entries (or drop from runtimeSlots) | NEXT | graphics-lane handoff | — |
| T6b | Station archetype silhouettes (BP-08 P0; blocks BP-11 visual half) | NEXT | T6a | T6c |
| T6c | Lane/gate/ring infrastructure (blocks BP-07 traversal) | NEXT | T6b | T6d |
| T6d | Claim module GLBs (blocks BP-06 "see logistics move") | NEXT | T6c | T6e |
| T6e | Hunter signature parts (blocks BP-13 named aces) | NEXT | T6d | T6f |
| T6f | Salvage/wreck anatomy parts (blocks BP-01.1) | NEXT | T6e | T6g |
| T6g | Module visual variants (blocks BP-09 build identities) | NEXT | T6f | T6h |
| T6h | Decorative sector props/landmarks (BP-11 postcards; lowest priority) | NEXT | T6g | — |

## T7 — PERF GATE HARDENING (after BP-10 render lane stable)

| id | task | status | depends-on | next |
|---|---|---|---|---|
| T7a | Fold `check:perf`/`check:hitch-budget`/`check:gpu-path` into default `check`/`check:ci` chain | NEXT | T4 render lane | T7b |
| T7b | Verify headed deep-perf runs in CI (quality-preserving; no asset disables) | NEXT | T7a | — |

## T8 — STORY-NARRATIVE CHECK FAMILY (alongside T4 BPs)

| id | check | verifies | status | depends-on | next |
|---|---|---|---|---|---|
| T8a | `check:career-profile` | BP-12 careers surface economy | NEXT | T4b | — |
| T8b | `check:fact-ledger` | surfaces existing `state.world.facts` | NEXT | T1a | — |
| T8c | `check:salvage-anatomy` | BP-01.1 wreck-module anatomy | NEXT | T4c | — |
| T8d | `check:smuggling-card` | BP-12 customs/contraband | NEXT | T4b | — |
| T8e | `check:station-mood` | BP-11 station life | NEXT | T4a | — |
| T8f | `check:claim-ledger` | BP-06 bases | NEXT | T4 | — |
| T8g | `check:war-overlay` | faction war map | NEXT | T4 | — |
| T8h | `check:market-chart` | BP-12 market viz | NEXT | T4b | — |

## T9 — RELEASE-READINESS GATE (LAST — the §15 8-point bar)

| id | gate | status | depends-on | next |
|---|---|---|---|---|
| T9a | First-15 proof ritual green (`check:first-15-runtime` + screenshot pair) | NEXT | T4a, T3 done | — |
| T9b | 47-A slice green (`check:47a:*` + sim:compare precondition accepted) | NEXT | T3-24 | — |
| T9c | World-alive green (T1a + T1b + T1c) | NEXT | T1 | — |
| T9d | Cause visible everywhere (T4b + tooltips) | NEXT | T4b | — |
| T9e | Pirates have motive (`check:pirate-ecology`) | NEXT | T4d | — |
| T9f | Perf floor held (quality-preserving) | NEXT | T7b | — |
| T9g | No stale artifacts (T2 all done) | NEXT | T2 | — |
| T9h | Full `check`/`check:ci` green with new gates folded | NEXT | T7, T8 | — |

---

## HOW TO USE THIS LEDGER

### Picking up work
1. Find the lowest-numbered `NEXT` row in the track you want to run.
2. Check its `depends-on` — all must be `DONE` or `DONE-VALIDATED`.
3. Claim it: set `status` → `IN-FLIGHT`, set `branch` → your git branch name.
4. Commit that ledger edit immediately so no other session picks the same row.

### Finishing work
1. Run your check; confirm it passes.
2. Set `status` → `DONE`. Clear the `branch` field.
3. Update `STATUS.md` narrative if the task is a meaningful milestone.
4. The next session's prompt is: the row whose `id` matches this row's `next` column.

### Conflict rule
- If a row is `IN-FLIGHT`, its `files` are locked to that branch. Do not edit them.
- If two sessions somehow picked the same row, the one with the earlier git commit on the ledger wins; the other re-picks.

### When done is wrong
- If you find a `DONE` row whose check now fails, or whose file doesn't match its claim, set it back to `NEXT` and note why in `STATUS.md`. Do not silently rebuild it.
