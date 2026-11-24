# SpaceFace Demo-Readiness Handoff (`2026-11-24`)

Generated at `master` commit `ce391a0f7a` (before committing this doc). All tool outputs, hashes, and gate checks cited below were observed directly after the commits listed in §1.

---

## 1. What Was Landed on `master` (13 Exact-Path Commits)

| Commit | Summary | What the player now gets |
|---|---|---|
| `55c30f5ae0` | `fleet(run.mjs)`: `REAL_HOME` fix | `devin3` / `opencode` workers resolve auth under the real user profile when run from isolated `agy` profiles. |
| `706f456d54` | `ui(perf)`: flight UI dormant gates | Dormant HUD overlays skip per-frame work and comms nodes pool cleanly (`test/flight-ui-dormant-gates.test.mjs` 6/6). |
| `eb45eeb9c3` | `audio(perf)`: audio voice bake | Transient synth recipes offline-bake to PCM buffers with pooled thin shells (`test/audio-voice-bake.test.mjs` 6/6). |
| `71ad07b10b` | `test`: pool & spawn-budget tests | Unit pins landed for committed body-pool and spawn-budget code (14/14). |
| `16a483107a` | `DEMO-LOAD-1` | Loading bar shows plain counted steps (`Placing ships and stations — N still staging`) and logs timeline milestones in `probe-first-swarm-minute.mjs` (43/43). |
| `485b7cb47d` | `copy(R18)`: plain-words sweep (29 files) | Replaced internal codenames (`Crucible`, `Massline`, `Too heavy`, `unbound`, etc.) with plain Swarm/Line/research wording (68/68 + `check:sim`). |
| `ae4d2278f5` | `ui(W2-3)`: honest death screen | Removed `'Unidentified attacker'` / `'Unidentified fire'` fallbacks on `deathCauseText`, `killChainRows`, `deathDialSpec`, and `weaponDisplayName`. |
| `6a6fe73d25` | `combat-ui(W2-1)`: heat readability | Unified `0.6` amber heat band (`HEAT_AMBER_BAND`), added per-gun lock alerts (`<GUN> LOCKED`) and dry-fire click, registered `sfx_promotion_chord` (29/29 + `check:audio-identity`). **Note:** `src/ui/orrery/hudAdapter.js` still needs its hardpoint pip update once `DEMO-SWARM-TUTOR-1` lands (see §3). |
| `12f626d78f` | `weapons(W2-2)`: honest gun cards | Gave `wpn_bank_stream_m` `attackTraits: ['mod_bank_shot']` so *"Banks off stone"* is real; aligned `bench-gun-curve.mjs` to `PLAYER_GUN_LOCK_S` (36/36 + `check:sim`). |
| `2977fe3164` | `test(hud)`: `hud-g-lag` rAF flush | Fixed the 3 EMP/shield-collapse glitch assertions waiting synchronously on `hud.js`'s rAF-deferred class toggle (17/17). |
| `71b967cbd8` | `DEMO-XR-FIX-1` (15 files, Devin + reviewed) | Initialized `_emptyBatchPending` & guarded `onAfterRender` in `quarksSystem.js`; kept `0.6` floor scoped to `createSmoothDrsGovernor` and restored `0.5` legacy/tier floor + working `?rfx=-drsSmooth` fallback; updated `fastLiveEntities` retire handshake tests; restored `economy-tick-tail-cost` shared-demand pass test & added custody-pod overflow regression test; aligned Plow copy (`help.js`, `settings.js`, `arsenalWords.js`) with R17 (wedge only); cleaned `physics.js` retry comment and pinned physics-first capture warm (179/179 + `check:sim`). |
| `b0687b8167` | `fix(swarm)`: Run Over `Again` & flight Space hijack | Fixed the live bug caught by `DEMO-GATE-1`: clicking/pressing `Again` now immediately emits `ui:closeAll` (no longer leaving the Run Over plate covering the screen for 8–13 s while loading), tears down document `keydown` capture on launch/`onHide()`/`dispose()`, and stops empty `screenStack: []` from hijacking flight Space/Enter (66/66). Needs live Electron confirmation via `probe-runover-first-enter.mjs`. |
| `ce391a0f7a` | `DEMO-GATES-CLEAN-1` (35 files, Devin + reviewed) | Converted all 17 CSS colour literals in `styles/ui.css` / `styles/intro.css` to tokens; baselined 4 unreachable modules honestly in `test/src-reachability.baseline.json`; regenerated `SAVE_SCHEMA.md` (v26, 476 paths); updated drifted consumer symbols (`impulseChargeReadModel.js`, `fieldReadModel.js`) & registered the 3 Kinetic Catalysts in `scripts/check-progression-verb-audit.mjs`; added `npm run check:plain-words` (`scripts/check-plain-words.mjs`) scanning 18,404 strings and cleaned `'Well'`/`'Repulsor'`/`'Clearing Cone'`/`'Gyre'`/`'RP'`/stray `'Massline'` copy + regenerated `en-US` localization catalogs. |

---

## 2. Current Verified Scorecard (at `ce391a0f7a` & `DEMO-GATE-1`)

### Static, Sim, & Fast Suite (verified on `ce391a0f7a`)

| Check | Result | Notes |
|---|---|---|
| `npm run check:src-syntax` | **PASS** | 3529 modules parse clean |
| `npm run test:fast` | **PASS** | **40/40 passed** in 44.0 s |
| `npm run check:sim` | **PASS** | `deterministic: true`, sha256 `4dac41d0fdfa01057c5226c239f0e7b268065daaa05a3fe259431ab9333838cc` == baseline |
| `npm run check:colour-tokens` | **PASS** | 207 colour literals inspected, 0 violations |
| `npm run check:src-reachability` | **PASS** | 3382 / 3520 reachable; 38 baselined orphans, 0 new |
| `npm run check:save-schema` | **PASS** | `SAVE_SCHEMA.md` OK (v26, 476 paths) |
| `npm run check:progression-verb-audit` | **PASS** | 161 modules, 49 weapons, 35 tech, **29/29** verb keys verified against live source (`0 declared-only`) |
| `npm run check:plain-words` | **PASS** | 18,404 player-facing strings scanned, 0 banned codenames |
| `npm run check:audio-identity` | **PASS** | 7/7 checks passed (14 recipes, 102 semantic / 73 literal cues) |

### Live Runtime & Frame Gates (`DEMO-GATE-1` at `2977fe3164` on a loaded shared host)

From `.devshots/fleet/runs/DEMO-GATE-1.devin3.2026-11-24T03-40-42/RECEIPT.md`:

| Route / Gate | World Speed (overall / worst 10 s) | Frame p50 / p95 | Frames >100 ms | Longest Gap | Press → Control | Again → Control | Verdict & Load |
|---|---|---|---|---|---|---|---|
| `check:playable` | — | — | — | — | 12.0 s boot | — | **PASS 18/18** (1093 ms bloom GPU warning; CPU ~34%) |
| `check:no-freeze` swarm | `x0.938 / x0.811` | — | 7 | 170 ms | — | — | **FAIL** (CPU 16–32%, lock shared) |
| `check:no-freeze` adventure | `x0.943 / x0.820` | — | 36 + 5 | **340 ms** | — | — | **FAIL** (net pose age 181 ms > 100 ms) |
| `check:no-freeze` swarm-pad | `x0.947 / —` | — | 7 | 131 ms | — | — | **FAIL** (`< 0.97` threshold) |
| `check:smooth` Swarm r2 (as-is) | `x0.868 / x0.549` | `50 / 83.4 ms` | 21 | 250.1 ms | — | — | **FAIL** (flag: `LOADED — other load 41%`) |
| `check:smooth` Swarm r2 (cap 60) | same | `34 / 83.3 ms` | 11 | 133.3 ms | — | — | **FAIL** |
| `check:smooth` Swarm r6 | — | — | — | — | — | — | **NOT MEASURED** (probe died while queued ~10 min behind other locks) |
| `probe-first-swarm-minute` ×2 | worker min `x0.067`–`x0.088` | Wave 2 **13.8–15.5 fps** | — | — | **37.3–39.8 s** | **12.8–13.3 s** (re-press wait) | Loop complete (boot → fight → throws → Pick One → death → Again → wave 2). **Again fixed post-gate in `b0687b8167`**; needs re-probe. |

### Visual Inspection Notes (from `contact.png` & `40-run-over.png`)
- **Good:** In-flight HUD, radar, Pick-One card (`Hollow Point / Wide Bore / Thick Skin`), `LATCHED` / `CROSSFIRE` / `PILE-UP` callouts, and `40-run-over.png` (honest killer, directional starboard impact arc, last-8 hits strip, clean `Again [Enter]` CTA) all read crisply with zero overlap or ring clutter.
- **Needs fixing:** Loading sits **28–30 s** on one static dark-red Foundry shot at `84%–88% · LIGHTING THE SCENE` (`stageId: render-pipelines`, `cookPhase: current-sector`, up to `70 pendingAdmissions`) even though sim `pressToRoundActiveS` is already done by `6.8–10.4 s`. Loading telemetry also sampled scrambled decrypt-glyph strings (`/\▖▝2▞...`) in `report.json`.

---

## 3. Uncommitted / In-Flight Working Tree Disposition

> **Do NOT run tree-wide `git reset` / `git checkout -- .`.** The files below belong to active/other workstreams and were deliberately preserved:

1. **Uncommitted 3D Render Performance Batch (11/21–11/23, needs visual review + A/B smooth check before committing):**
   `src/render/vfx.js`, `src/render/actionVfx.js`, `src/render/combat/persistentBeams.js`, `src/render/combat/structuredBurstGeometry.js`, `src/render/farPlaneLife.js`, `src/render/feel.js`, `src/render/forceLanguage/flowEnvironment.js`, `src/render/forceLanguage/sweptSurfaceBatch.js`, `src/render/ironKrakenWreckVisuals.js`, `src/render/packageCpuDetach.js`, `src/render/parallaxLayers.js`, `src/render/readyPackagedBodies.js`, `src/render/shipMicroMotion.js`, `src/render/thruster/ribbon/contrailTrail.js`, `src/render/thruster/ribbon/plasmaRibbons.js`, `src/render/thruster/systems/plasmaStream.js`, `src/render/vfx/combatContactVfx.js`, `src/render/visualFactory.js`, `src/render/weapons/projectileGeometries.js`, `src/features/industrialDisasters/render.js`, `styles/deckplate.generated.css`, `test/cold-hulk-pool.test.mjs`, `test/cosmetic-cadence-sockets.test.mjs`, plus 4 passing updated tests (`test/explosion-rupture.test.mjs`, `test/gfx12-admission-standin.test.mjs`, `test/sg02-coincident-spawn.test.mjs`, `test/vfx-accessibility-profile.test.mjs` — 50/50 pass on current HEAD).
2. **`DEMO-SWARM-TUTOR-1` (stopped on `dsx` at 180 min timeout — NOT landed yet):**
   `src/data/swarmTeaching.js`, `src/ui/swarmTeaching.js`, `src/systems/survivalAnnounce.js`, `src/ui/survivalHud.js`, `src/ui/orrery/hudAdapter.js`, `src/ui/uiRoot.js` (also carries `CONTROLLER-1` pad-reticle hunks!), `test/swarm-one-teaching-card.test.mjs` (12/12 pass), `scripts/look-swarm-teaching.mjs`.
   - *Important side effect flagged by `DEMO-GATES-CLEAN-1`:* `check:m6:localization` passed all 25 unit tests, then `check-localization-reachability.mjs` failed because `.sf-mt-obj` read empty at flight start while `DEMO-SWARM-TUTOR-1` / `hudAdapter` / `flightV3` edits were uncommitted. Also finish remaining `W2-1` hardpoint pip wiring (`_lockUntil` + `0.6` amber threshold in `hudAdapter.js:839-845` + `simTime`/`heatLocked` into `readClusterModel`) once `DEMO-SWARM-TUTOR-1` lands.
3. **`CONTROLLER-1` (46/46 tests + `massline-input-grammar` / `nxi-004` 29/29 pass, mixed into `uiRoot.js`):**
   `src/ui/input.js`, `test/five-powers-merge-4242.test.mjs`, `test/g18-02-one-set-of-keys.test.mjs`, `test/help-gamepad-rebind.test.mjs`, `test/teach-09-pad-chord-sheet.test.mjs` (updated on disk for R17 Plow wording -> 13/13 pass).
4. **Other Active / External Workstreams (leave alone unless owning their packet):**
   - Berth / Slingshot / Flight V3: `src/core/flight/flightPresentationReads.js`, `src/systems/flightV3.js`, `src/systems/plants/pl178SlingshotHour.js`, `scripts/probe-berth-run.mjs`, `test/berth-autopilot-holds-course.test.mjs`, `test/berth-run-seeded-path.test.mjs`, `test/station-docking-corridor.test.mjs`, `test/slingshot-hour-brake-priority.test.mjs`.
   - Cohort / UI-bench / probes & tests: `scripts/bench-sim-fight.mjs`, `scripts/check-trail-streak-instancing-webgl.mjs`, `scripts/lib/uiBenchCatalog.mjs`, `scripts/probe-sim-population.mjs`, `tools/ui-bench.js`, remaining modified tests under `test/`, `design/program/fleet/packets/XR-DEMO-*.md`, `scripts/.tmp-*.mjs`, `test/__probe_witness.mjs`.

---

## 4. Prioritized Remaining Work to Hit Demo Bar

### P0 — Demo Blockers (Must Fix Before Showing)
1. **W1-4 Boot-to-Flight < 10 s (`render-pipelines` / `Lighting the scene` 28–30 s stall):**
   `probe-first-swarm-minute` reached round active in `6.8–10.4 s`, then hung ~30 s at `84%–88%` (`cookPhase: current-sector`, up to `70 pendingAdmissions`) plus a `1093 ms` bloomScene GPU stall on rock instances. Needs precompile/cook audit + moving non-first-frame assets/lights out of the blocking veil. Also replace the decrypt-glyph flicker in the loading detail line (`/\▖...`) with steady plain progress.
2. **Smoothness / Frame Rate in Wave 2+ (13.8–15.5 fps & world speed dips):**
   Even accounting for shared-host load during `DEMO-GATE-1`, Wave 2 dropped to 13.8–15.5 fps and `check:no-freeze` hit `340 ms` / `x0.81`. Audit + land the uncommitted 3D render batch (§3.1) and fix open `XR-DEMO-FRAME-1-C` items (`drawBatchOpt` / `vfxBudget` A/B verification) and `DEMO-SIMFIX-2` (`tacticalAI` phased think). Then run a **quiet-machine** `check:smooth -- --routes=swarm-r2,swarm-r6` and `check:no-freeze`.
3. **Verify `Again` Fix (`b0687b8167`) Live on Electron:**
   Run `node scripts/fleet/game-lock.mjs run -- node scripts/probe-runover-first-enter.mjs` (and `probe-first-swarm-minute.mjs`) on a quiet machine to confirm single-Enter `Again` clears `.sf-runover` immediately and Wave 1+ Space fire stays intact.
4. **Asymmetric Restore Stall (`test/worker-paused-save-completion.test.mjs`):**
   Devin's runs on a ~13% busy host timed out 4 times (45 s, 45 s, 120 s, 240 s) on the `raw-retry` leg with `saveLoadedArrived=true; restoreCommittedArrived=false` while `compressed-reject` passed in ~3.7 s. Investigate why `saveSystem.js` / paced `_restoreChunks` stalls or takes >240 s specifically on `raw-retry`.

### P1 — High-Impact Polish & Integration
5. **Finish & Review In-Flight Features:**
   - Land `DEMO-SWARM-TUTOR-1` (`look-swarm-teaching.mjs` + `check:m6:localization` verification) and `CONTROLLER-1` (`uiRoot.js`, `input.js`), splitting `uiRoot.js` cleanly if needed.
   - Finish remaining `W2-1` wiring in `src/ui/orrery/hudAdapter.js:839-845` (use per-mount `_lockUntil`, `0.6` amber threshold, pass `simTime`/`heatLocked` to `readClusterModel`).
   - Run visual checks + `check:playable` for `W1-1`/`W1-2` (Foundry lighting/shadows, readability) and `W1-3` (Adventure berth dock live route).
6. **Clean Remaining Red Unit Tests Known Today:**
   - `test/pq-133-04-foundry.test.mjs` has **2 failing tests** (`'interceptor_flyby'` vs `'brawler_commit'` on Mirrorjaw, and wave cleanup waiting for real combat deaths).
   - Audit whether `mothlight` (`reach` -> `skirmish`/`pack`) and `brood_tendril` (`rush`) in `src/data/enemyJobs.js` match their actual runtime combat roles.
   - Clean up dead `src/ui/station/stationCommands.js` (plus `.so-command-trigger` in `stationFrames.js`) noted by `DEMO-GATES-CLEAN-1`.
   - Sweep remaining red buckets in `design/overhaul/15_RED_TESTS.txt`.

### P2 — Pre-Ship Cleanup
7. **`XR-DEMO-DETERMINISM-1-C` (`d266d11616`)**: Clean up/document `bench-sim-fight` `--ab` harness flags.
8. **`W2-4`, `W2-5`, `W4-1`, `W4-3`** polish & audio/UI micro-interactions from `15_NEXT_RUN.md`.
9. Re-run full `node scripts/test-sweep.mjs --conc=12`, `check:m6:localization`, `check:playable`, `check:no-freeze`, and `check:smooth` on an **idle** machine before declaring demo-ready.

---

## 5. Ready-to-Run Packet Split for Next Session

### Lane A — Devin SWE-2 (`devin3`) Mechanical Packets (no 3D/taste, no commits)
- **Packet 1 (`DEMO-TESTFIX-1`)**: Fix the 2 failing tests in `test/pq-133-04-foundry.test.mjs` (inspect `brawler_commit` vs `interceptor_flyby` commit history to distinguish code bug vs stale pin), audit & fix `stationCommands.js` dead trigger (`.so-command-trigger`), and cherry-pick the top 10–15 `master/wording` / `values-differ` failures from `design/overhaul/15_RED_TESTS.txt`.
- **Packet 2 (`DEMO-SAVE-DIAG-1`)**: Diagnose why `raw-retry` in `test/worker-paused-save-completion.test.mjs` hangs >240 s between `save:loaded` and `restoreCommitted` while `compressed-reject` takes 3.7 s, fix root cause in `src/save/saveSystem.js`, and restore a tight timeout.
- **Packet 3 (`DEMO-SIMFIX-2`)**: Execute `design/program/fleet/packets/XR-DEMO-SIMFIX-2.md` (`tacticalAI` phased think) strictly on Node tests + `check:sim`.
- **Packet 4 (`DEMO-GATE-2`, quiet host)**: After P0 fixes land, run `check:no-freeze`, `check:smooth -- --routes=swarm-r2,swarm-r6`, `probe-runover-first-enter.mjs`, `probe-first-swarm-minute.mjs`, and `check:m6:localization` via `game-lock` on an otherwise idle machine.

### Lane B — Director / 3D / Taste Session
- **Visual & Perf Landing**: Open screenshots + run A/B `check:smooth` on the uncommitted 11/21–11/23 `src/render/*` batch (§3.1) + `XR-DEMO-FRAME-1-C` (`drawBatchOpt` & `vfxBudget`) + `W1-1`/`W1-2` Foundry lighting + `W1-4` removing the 30 s `Lighting the scene` / `current-sector` blocking load.
- **UI Integration & Playtest**: Visual inspection of `look-swarm-teaching.mjs` + landing `DEMO-SWARM-TUTOR-1` & `CONTROLLER-1` + finishing `hudAdapter.js` `W2-1` hardpoints + fixing `.sf-mt-obj` objective heading on `check:m6:localization`.
- **Live Adventure & Swarm Playthrough**: Verify `W1-3` Adventure berth loop and Swarm rounds 1–10 feel/pacing on desktop Electron.
