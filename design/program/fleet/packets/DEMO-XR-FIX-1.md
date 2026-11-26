# DEMO-XR-FIX-1 — Fix verified cross-review defects (scoped mechanical lane)

**For:** Devin SWE-2 (`devin3`). **Kind:** scoped mechanical fixes.
**CRITICAL RULES:**
1. **Do NOT run `git commit` or `git add`!** Leave all edits unstaged in the working tree so the director can review every diff before committing.
2. **Do NOT boot the game, browser, or Electron** (no `check:playable`, no `check:smooth`, no `capture:*`, no `probe-*`). Run only pure Node `node --test`, `npm run check:src-syntax`, and `npm run check:sim`.
3. **Edit ONLY the files explicitly named below.** Do not touch `src/ui/orrery/hudAdapter.js`, `src/ui/survivalHud.js`, `src/ui/uiRoot.js`, `src/systems/survivalAnnounce.js`, `src/ui/swarmTeaching.js`, `styles/ui.css`, `src/systems/survivalResults.js`, `src/ui/screens/crucible.js`, `src/ui/weaponHeat.js`, `src/ui/orrery/flightCluster.js`, `src/ui/hud.js`, `src/ui/crucibleCombatReadout.js`, `src/audio/audioSystem.js`, `src/data/weapons.js`, or `scripts/bench-gun-curve.mjs`.

## Work items (all 8)

### 1. `XR-DEMO-FRAME-1-C`: Safe `onAfterRender` & `_emptyBatchPending` in `src/render/quarksSystem.js`
- Read `src/render/quarksSystem.js` around constructor and `_hideEmptyBatches` (~lines 734-768).
- Initialize `this._emptyBatchPending = false;` in the constructor.
- Guard `previous` in the `onAfterRender` wrapper (`if (typeof previous === 'function') return previous.apply(this, args);`).
- Verify: `node --test test/quarks-vfx-system.test.mjs test/vfx-budget.test.mjs`.

### 2. `XR-DEMO-FRAME-1-C`: Scope `0.6` DRS floor & fix `?rfx=-drsSmooth` fallback
- Files: `src/render/renderer.js` (~33754-33763), `src/render/adaptiveQuality.js` (~449-479), `test/adaptive-quality-controller.test.mjs`, `test/gpu-tier-detection.test.mjs`, `test/gpu-budget-governor.test.mjs`.
- Read `src/render/renderer.js:33740-33775` and `src/render/adaptiveQuality.js:440-490` and check git commit `2001d73636` (`git show 2001d73636`) to see exactly what changed.
- Fix `?rfx=-drsSmooth` so disabling `drsSmooth` re-enables the existing `_gpuBudget` governor instead of locking scale to `1.0`.
- Keep the `0.6` floor scoped to `createSmoothDrsGovernor` / `drsSmooth` on, and restore `0.5` for `COMBINED_READABILITY_FLOOR` and `GPU_TIER_DYNRES_FLOOR.integrated`.
- Restore the `0.5` assertions in `test/adaptive-quality-controller.test.mjs` and `test/gpu-tier-detection.test.mjs`, and strengthen `test/gpu-budget-governor.test.mjs` so it asserts `createSmoothDrsGovernor` actually reaches `0.6` under sustained slow frames.
- Verify: `node --test test/adaptive-quality-controller.test.mjs test/gpu-tier-detection.test.mjs test/gpu-budget-governor.test.mjs`.

### 3. `XR-DEMO-SIMFIX-1-C`: Fix reflection/continuation handshake tests under default `fastLiveEntities`
- Files: `test/optic-field.test.mjs` (~649) and `test/pq-133-04-foundry.test.mjs` (~108) (and read `git show d690a74a91 -- test/attack-live-wiring.test.mjs src/combat/attackHit.js src/core/physics.js`).
- Notice `test/optic-field.test.mjs` ("metal reflect keeps the same body alive after physics sets alive=false") and `test/pq-133-04-foundry.test.mjs` ("eligible reflection continues one body...") fail under default `fastLiveEntities: true` because they still test direct `alive = false` instead of `retireContinuingProjectile`.
- Update those two handshake tests (only the `fastLiveEntities` handshake lines — leave any unrelated pre-existing failures in `pq-133-04-foundry.test.mjs` documented if caused by other files) to test `retireContinuingProjectile` cleanly with a comment citing `d690a74a91`, OR inspect if `retireContinuingProjectile` needs anything. Do NOT touch `src/core/physics.js` bullet logic unless needed without breaking `check:sim`.
- Verify: `node --test test/optic-field.test.mjs test/attack-live-wiring.test.mjs test/pq-133-04-foundry.test.mjs`.

### 4. `XR-DEMO-TESTHEALTH-2B`: Restore sane timeout in `test/worker-paused-save-completion.test.mjs`
- Inspect `git show 3dc92f65fe`. It accidentally changed `12000` (12 s) to `240000` (240 s) and node timeout to `280000` after misreading ms as seconds.
- Restore a sane bound (45 s inner / 90 s node timeout) with clear diagnostic failure output showing `save:loaded` vs `restoreCommitted` if the event lags.
- Verify: `node --test test/worker-paused-save-completion.test.mjs`.

### 5. `XR-DEMO-TESTHEALTH-2B`: Restore rewritten regional-pressure pass test in `test/economy-tick-tail-cost.test.mjs`
- Inspect `git show 9dc30918e0 -- test/economy-tick-tail-cost.test.mjs`.
- Add a rewritten test in `test/economy-tick-tail-cost.test.mjs` verifying `applyStockPressure` / `refreshStationDemand` shares one sector demand pass without forking quotes (replacing the deleted 101-line pin using the current `ECON-BUILD-1` APIs).
- Verify: `node --test test/economy-tick-tail-cost.test.mjs`.

### 6. `XR-DEMO-TESTHEALTH-2B`: Add custody-overflow test in `test/arcade-loot.test.mjs`
- Inspect `git show 37ae9bd13e -- src/systems/mining.js` and `test/arcade-loot.test.mjs`.
- Add a regression test in `test/arcade-loot.test.mjs` proving a refused custody-annotated pod (`cargoIdentity.ownerId`) stays alive when the hold refuses it and does not emit `economy:grantCredits`.
- Verify: `node --test test/arcade-loot.test.mjs`.

### 7. `XR-DEMO-TESTHEALTH-2B`: Align Plow copy in Help, Settings, and `arsenalWords.js` with R17
- Files: `src/ui/screens/help.js` (~136), `src/ui/screens/settings.js` (~272), `src/data/arsenalWords.js` (~88-94) (and check `test/arsenal-identity.test.mjs`, `test/help-controls-truth.test.mjs` or similar — do NOT touch `test/teach-09-pad-chord-sheet.test.mjs` which has uncommitted changes).
- Align Plow copy so it describes the clearing wedge only and does not promise a silent planet-band flip to ore scoop (`rigWords('skim')` / help / settings).
- Verify: `node --test test/arsenal-identity.test.mjs` and any help/settings tests that read those strings.

### 8. `XR-DEMO-DETERMINISM-1-C`: Clean `physics.js:720` comment + pin physics-first warm in `test/bounded-autosave.test.mjs`
- File: `src/core/physics.js` (~line 720): fix the misleading comment citing nonexistent `RAPIER_INIT_RETRY_S` (note: `src/core/physics.js` has no uncommitted hunks right now, check `git diff -- src/core/physics.js` first).
- File: `test/bounded-autosave.test.mjs`: add a test pinning that the production `_saveCapturePlan` puts `physics` inside the synchronous first `primeAutosaveCapture` slice.
- Verify: `node --test test/bounded-autosave.test.mjs test/autosave-capture-plan-contract.test.mjs test/physics-authority-stall.test.mjs test/physics-authority-stall-backoff.test.mjs`.

## Final Verification Before Writing Receipt
1. Run `npm run check:src-syntax`.
2. Run `npm run check:sim` (confirm hash `4dac41d0fdfa01057c5226c239f0e7b268065daaa05a3fe259431ab9333838cc` is unmoved).
3. Run `git status --short` to verify only the packet's files were edited and nothing was committed.
4. Write your receipt to the path specified in your prompt with: Result (`DONE`/`PARTIAL`), exact list of modified files, exact test commands and pass/fail counts run after your last edit.
