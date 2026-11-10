<!-- LIFETIME: ACTIVE_PROGRAM -->
# Q4 — the razor

**Scope:** the three Q1 delete rows assigned to Q4 (Q1-04, Q1-05, Q1-17), plus a bounded survey of
the largest remaining dead/duplicate mechanisms. Measured on the shared checkout at
`3196b7611c2a`; counts below are from the working tree and `HEAD^` for files already removed by the
concurrent E2 commit (see publication note).

## Deleted (provably dead)

| Row | Path | Why it was dead | Proof |
|---|---|---|---|
| Q1-04 | `src/systems/automation.js` offline wall-clock branch | No writer for `settings.gameplay.wallClockOfflineProgress` or `opts.wallClockOffline`; `pendingOfflineElapsedSec` read/cleared but never written by a host. | `rg wallClockOfflineProgress\|pendingOfflineElapsedSec src` returned readers only. Replaced with a behavior test: a ten-hour `Date.now` jump produces `zero_elapsed`, 0 credits. |
| Q1-05 | `src/core/simWorker.js`, `simWorkerHost.js`, `simWorkerProtocol.js` | `state.__simWorkerPhase14` is written nowhere; only tests constructed the host. The live route is `wholeSimBrowserWorker.js` (E1's file). | `rg __simWorkerPhase14 src` → one reader in the deleted host. No production import. |
| Q1-17 | `src/systems/ai.js` | Not in any profile system list (`LEGACY47A_SYSTEM_IDS` omits `aiSlot`; production defaults to `aiBackend:'sg06-tactical'`). Registry imported it only as an unreachable fallback. | `rg "systems/ai.js"` → registry/factory/test/script only; `createRegistry` defaults and post-change boot both resolve `aiSlot.name === 'tacticalAI'`. |

## Counts before → after

| Deletion | Source files | Lines | Systems | Tests |
|---|---|---|---|---|
| Q1-04 automation | 0 deleted (1 edited) | −45 / +11 in `automation.js` (net −34) | 0 manifest; −1 writer-less branch, −1 helper | +1 behavior test; 1 source-pin test rewritten |
| Q1-05 phase-14 worker | −3 (`simWorker*.js`) | −579 source; −135 worker tests; −13 net in `persistence-architecture-poles` | −1 optional second sim lane (never in manifest) | −6 cases (5 removed, 1 merged into the retained snapshot test) |
| Q1-17 legacy AI | −5 (−1 source, −3 legacy test files, −1 legacy check script) | −920 source, −281 tests, −357 script = **−1,558** | −1 legacy backend/registration; 0 manifest ids | −9 cases in deleted files; −1 legacy case in `cloak-interplay` |
| **Total** | **−8 files** | **−2,137 file lines; −321 net edited lines; −2,458 total** | **0 manifest ids** (288 registered / 220 update-order unchanged); **−2 non-manifest backends** | **−3 test files (5,434 → 5,431); −16 cases, +1 new** |

## Ten largest remaining dead/duplicate mechanisms

Sizes are lines at `HEAD^`/current tree. None of the large rows were executed; UI/render owners
must choose wire-or-delete.

| # | Path | Why it is dead/duplicate | Owner | Action |
|---|---|---|---|---|
| 1 | `src/systems/ai.js` (920) | Compatibility AI backend, off every profile; deleted this pass. | Q4 | **Deleted.** |
| 2 | `src/ui/commandDeckRefit.js` (667) | Off-route additive presentation lab; production does not import or auto-mount. | P1 | Delete, or wire as a station screen with route proof. |
| 3 | `src/ui/virtualList.js` (623) | List-windowing kernel; no long screen mounts it (reachability baseline). | P2/Q4 | Mount on market/contracts/ledger/codex or retire. |
| 4 | `src/core/simWorker*.js` (579) | Writer-less phase-14 lane; tests only; deleted this pass. | Q4/E1 | **Deleted.** |
| 5 | `src/ui/orrery/flightInstruments.js` + `flightPreview.js` (550) | Staged ORRERY flight cluster; no mount on the default route. | P1 | Wire with the ORRERY cluster or retire both. |
| 6 | `src/systems/signatureAdapters.js` (385) | Adapter layer for the unwired site-signature model; zero importers. | W2 | Wire the signature model or delete the adapters. |
| 7 | `src/render/batchedInstanceRenderer.js` (176) | Perf-rescue candidate held out of the route; gate exists. | E7 | Keep as measured candidate; do not delete before the E7 verdict. |
| 8 | `src/render/backendDecision.js` (140) | PQ-044 backend choice is deferred; nothing selects it. | E7 | Keep deferred until the WebGPU/TSL decision. |
| 9 | `src/render/reactiveMatter/pass.js` (100) | Optional gameplay-camera marker layer; no renderer mount; live cargo uses authored models. | P4/E7 | Mount into the scene pass or retire. |
| 10 | `src/render/thimbleDoorVisuals.js` (91) | Inactive Thimble door rig; waits for a gameplay door body. | W3 | Keep until the door body activates, then wire or delete. |

Also found but below the ten: `src/render/presentPhaseTimers.js` (70, instrumentation), `src/render/wreckCourt/present.js` (30, no viewer screen), `src/ui/station/moduleCardMetrics.js` (21, P1 sheet replaced its consumer), and `SectorSim.meta.pendingOfflineElapsedSec` (the same writer-less host seam as Q1-04, still live in `src/systems/sectorSim.js`; delete or give it a real writer in a save-aware pass).

## Deliberately left

- `src/systems/aiPorts.js`, `tacticalAI.js`, `src/ai/*` — the live AI.
- `wholeSimBrowserWorker.js`, `simLaneMain.js`, `presentationRunner.js` — E1's live worker lane.
- `src/systems/flight.js` — still the explicit compatibility flight fallback; not an AI dependency.
- The `'ai'` slot aliases in `registry.js` (`lookup.set('ai', aiSlot)`, `byName.set('ai', aiSlot)`) — they point at the live tactical slot and keep the manifest/clock alias stable.
- Deferred render/UI candidates in the table — Q4 does not delete another owner's staged mechanism.

## Publication note

A concurrent E2 commit (`3196b7611c2a`, “economy slicing is on”) picked up the staged `git rm`
deletions of `simWorker*.js`, `ai.js`, the three legacy AI test files, `check-ai-telegraphs.mjs`, and
the `package.json` script line before Q4's own commit. The files are gone from `HEAD`; this
campaign's commit carries the surviving registry/factory/test/doc edits and this report. No file was
restored or re-deleted.

## Checks

- `node --test test/economy-automation-offline.test.mjs test/fb-determinism-wall-time-guard.test.mjs test/holistic-fix4-regression.test.mjs` — 38/39 pass; the one red is the pre-existing `frameTruth.js`/`simStepProfiler.js` wall-clock allowlist gap (not automation, not introduced here).
- `node --test test/performance-worker-save-ui-audio.test.mjs test/persistence-architecture-poles.test.mjs` — 17/17 pass.
- `node --test test/runtime-profiles.test.mjs test/authoritative-manifest.test.mjs test/activity-runtime.test.mjs test/cloak-interplay.test.mjs test/holistic-fix4-regression.test.mjs test/infer-p05-patrol-hostility-live.test.mjs test/presentation-registry.test.mjs` — 96/97 pass; the one red is `infer-p05-patrol-hostility-live` (0 shots at a wanted player; it builds its own direct tactical sim and does not import `registry.js`).
- `node --test test/sim-worker*.test.mjs` — 37/37 live worker tests pass.
- `node --test test/automation-*.test.mjs test/dead-wire-offline-receipt.test.mjs` — 96/97 pass; the one red is `automation-worker-outpost-action` "the list uses cold cadence" (the `automation.outposts` domain leaf is just under the 4 KiB threshold with 100 fixture outposts). It does not read the deleted offline branch.
- `node --test test/agent-loop.test.mjs` — not run; that file does not reference automation (confirmed by `rg automation test/agent-loop.test.mjs`).
- `npm run test:fast` — 39/39 pass.
- `npm run check:src-syntax` — OK, 3,019 modules.
- `node scripts/check-src-reachability.mjs` — PASS, 34 baselined orphans, no new ones.
- `node scripts/check-data.mjs` — 17 ok, 0 fail.
- `node scripts/check-game-playable.mjs` — 18/18, game boots and plays.
- `node scripts/check-sg06-intake.mjs` — OK after updating its registry assertion.
- `npm run check:ai:telegraphs:live` — deterministic, all six live telegraph cases correct.
- `node --test test/ai-engagement-authority.test.mjs` — 25/25 pass.
- `node scripts/check-gameplay-core.mjs` — red in `checkWingmenSpawnAsLiveEntities` (`wingmen._wingDeaths` undefined when the check calls `update` without `init`); unrelated to these deletions.
