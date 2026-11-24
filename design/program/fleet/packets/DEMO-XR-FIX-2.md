# DEMO-XR-FIX-2 — Fix XR-DEMO-SIMFIX-2-C, pq-133-04-foundry, raw-retry save stall, and review cleanups

**For:** Devin SWE-2 (`devin3`). **Kind:** scoped mechanical / sim / test fixes.
**CRITICAL RULES:**
1. **Do NOT run `git commit` or `git add`!** Leave all edits unstaged in the working tree so the director can inspect every diff before committing.
2. **Do NOT boot the game, browser, Chromium, or Electron** (no `check:playable`, no `check:smooth`, no `capture:*`, no `probe-*`). Run only pure Node tests, `npm run check:src-syntax`, `npm run check:src-reachability`, `npm run check:plain-words`, and `npm run check:sim`.
3. **Preserve all unrelated uncommitted files in this shared checkout** (the `src/render/*` batch, `src/ui/input.js`, `src/ui/orrery/hudAdapter.js`, `src/ui/uiRoot.js`, `src/ui/survivalHud.js`, `src/systems/survivalAnnounce.js`, `src/systems/flightV3.js`, etc.). Edit ONLY the files needed for the 4 items below.

## Work items (all 4)

### 1. Fix open findings from `XR-DEMO-SIMFIX-2-C`
- Read `.devshots/fleet/runs/XR-DEMO-SIMFIX-2-C.gd-review.2026-11-24T*/RECEIPT.md` (latest `XR-DEMO-SIMFIX-2-C` receipt) and inspect `git show 5f0e294b04`.
- Files: `src/ai/stack.js`, `src/systems/tacticalAI.js`, `src/ai/squad.js` (read-only unless needed), `test/pallet-jack-maneuver.test.mjs`, `test/tactical-ai-phased-think.test.mjs`, `test/tactical-ai-refresh-cadence.test.mjs`, `test/tactical-ai-production-cadence.test.mjs`.
- Fix the 4 verified review findings cleanly:
  1. Restore off-slot authored steering / re-plan (`shapeBehavior` / `maneuver.plan`) and `request()` `palletJackDecision`'s shaped maneuver on the default `aiPhasedThink: true` path (drop the `if (!this.phasedThink)` guard or run shape+plan on the off-slot path in `src/ai/stack.js`, and call `request()` for pallet-jack in `src/systems/tacticalAI.js:871-876`). Keep firing/dead-target revoke working.
  2. Gate `this.commander.update` (`src/ai/stack.js:217-218`) to `thinkPeriodTicks` alongside director/mind, reusing the last squads record on off-slot ticks so formation slew (`formationTurnPerTick`) stays at think cadence.
  3. Re-read `simCoreFlag('aiPhasedThink')` inside `stack.update()` rather than baking `this.phasedThink` once at construction (`stack.js:96`).
  4. Remove the `aiPhasedThink: false` pin from `test/pallet-jack-maneuver.test.mjs:8-10` so it passes on the default `aiPhasedThink: true` path; pin `aiPhasedThink: false` on the synchronous all-hulls-on-same-tick test in `test/tactical-ai-refresh-cadence.test.mjs`; add assertions in `test/tactical-ai-phased-think.test.mjs` pinning commander cadence and off-slot authored steering.
- Verify:
  `node --test test/tactical-ai-phased-think.test.mjs test/tactical-ai-refresh-cadence.test.mjs test/tactical-ai-production-cadence.test.mjs test/pallet-jack-maneuver.test.mjs` and `npm run check:sim` (hash must stay `4dac41d0fdfa01057c5226c239f0e7b268065daaa05a3fe259431ab9333838cc`).

### 2. Fix both failing tests in `test/pq-133-04-foundry.test.mjs`
- Read `test/pq-133-04-foundry.test.mjs:195-260` and `src/data/enemies.js:518-535`.
- Line 207: `mirrorjaw_foreman` (`src/data/enemies.js:521-528`, `DUST P6 BS-7`) intentionally uses `combatDoctrineId: 'interceptor_flyby'` (at mass 420 it flies the `brawler_commit` profile). Update the stale assertion in `test/pq-133-04-foundry.test.mjs` with a clear comment referencing `DUST P6 (BS-7)`.
- Line 249: diagnose why `combat.onHit(..., damage: 100000)` left a cohort entity with `entity.alive === true` in `'ten wave schedules materialize under the unchanged cap and cleanup waits for real combat deaths'` (`test/pq-133-04-foundry.test.mjs:232-260`). Inspect `src/systems/combat.js` / `src/core/physics.js` / `src/systems/waveMaterialization.js` to determine if it's a real combat bug or stale test expectation (`fastLiveEntities` / shield gate / boss immunity / etc.) and fix the genuine cause cleanly without weakening real combat invariants.
- Verify: `node --test test/pq-133-04-foundry.test.mjs` -> **14/14 PASS** (plus run any combat/wave tests for any `src/` file touched).

### 3. Diagnose and fix the `raw-retry` >240 s asymmetric restore stall in `test/worker-paused-save-completion.test.mjs`
- Read `test/worker-paused-save-completion.test.mjs:470-624`, `src/save/saveSystem.js` (restore / `_restoreChunks` / `save:loaded` vs `save:restoreCommitted` / paced listener drain), and `src/core/wholeSimBrowserWorker.js`.
- In earlier runs (even at ~13% CPU), the `compressed-reject` fresh-worker restore leg finished in ~2.4–3.7 s, whereas the `raw-retry` leg hit 45 s, 120 s, and 240 s timeouts with `saveLoadedArrived=true` and `restoreCommittedArrived=false` while `entity:spawned` / `game:loadingProgress` kept firing.
- Do **NOT** bump the timeout to 600 s! Find the real root cause of the asymmetry between `raw-retry` and `compressed-reject` (in `src/save/saveSystem.js`, worker lane, or `test/worker-paused-save-completion.test.mjs` storage setup/harness) and fix it cleanly.
- Restore a tight sane bound (<= 45 s inner wait, <= 90 s node test timeout) with clear diagnostic fields (`saveLoadedArrived`, `restoreCommittedArrived`, `waitedMs`) on failure.
- Verify: `node --test test/worker-paused-save-completion.test.mjs test/save-restore-atomicity.test.mjs test/save-envelope-fidelity.test.mjs` (runs cleanly well inside 45 s).

### 4. Small review cleanups (`XR-DEMO-LOAD-2` & dead `stationCommands.js`)
- `test/loading-detail-plain.test.mjs`: read `XR-DEMO-LOAD-2` receipt notes and drop the brittle `animations.length === 1` requirement on `bootVisualizer`'s `watchDetail`, while keeping assertions that plain counted strings (`Compiling the shaders — n of m`) and startup errors are never rewritten with glyph noise. Verify `node --test test/loading-detail-plain.test.mjs`.
- Dead `src/ui/station/stationCommands.js` (flagged in `DEMO-GATES-CLEAN-1`): grep the entire repo (`src/`, `test/`, `styles/`) for `stationCommands` and `.so-command-trigger`. If `stationCommands.js` and `.so-command-trigger` have no live feature or test depending on them (or only trivial dead CSS/stub references that can be removed cleanly), remove dead `src/ui/station/stationCommands.js` (via removing its contents/file and removing its entry from `test/src-reachability.baseline.json`), and clean `.so-command-trigger` if safe; if live tests or screens still rely on it, leave it alone and report why cleanly in your receipt.
- Verify `npm run check:src-reachability` and any station tests (`test/station-services.test.mjs`, `test/station-tabs-truthful.test.mjs`, `test/station-shell.test.mjs` if present).

## Final Verification Before Writing Receipt
1. Run all focused tests from items 1–4.
2. Run `npm run check:src-syntax`.
3. Run `npm run check:src-reachability`.
4. Run `npm run check:plain-words`.
5. Run `npm run check:sim` (confirm sha256 `4dac41d0fdfa01057c5226c239f0e7b268065daaa05a3fe259431ab9333838cc` is unmoved).
6. Run `git status --short` and `git log -n 3 --oneline` to confirm no commits were made and only scoped files were modified.
7. Write your receipt (`RECEIPT.md`) with exact modified files, root-cause findings for item 2 & item 3, and verbatim pass/fail test outputs.
