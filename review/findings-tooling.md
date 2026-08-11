# Thermonuclear Review — `scripts/` (839 .mjs) + `tools/` (139 .py, 82 .mjs)
Source: read-only Explore subagent. All six pre-claims CONFIRMED.

## Six pre-claims — all CONFIRMED
| # | Claim | Verdict |
|---|---|---|
| a | `check:baseline` NOT reachable from check:all/CI | ✅ CONFIRMED. `CI_MATRIX_ROOT_SCRIPTS=['precheck','check']`; `check` chain has `check:alpha:baseline:contracts` but never `check:baseline`. Zero npm invocations. Hand-run only. |
| b | `:compare` goldens tolerate stale goldens | ✅ CONFIRMED (by design, `sf-sim.mjs:704,708`). Mitigated: ci-report `stale_golden` classifier + hash-gating `check:sim` siblings in same chain. |
| c | No production-profile golden | ✅ CONFIRMED. Only 2 telemetry goldens; `sf-sim` has no `--profile production`. |
| d | No single-writer/event-name enforcement gate | ✅ CONFIRMED. `physicsWriterAudit.mjs` is `diagnostic-only`; `build-code-index.mjs` lists dead events but asserts nothing. |
| e | `sim-golden-diff` is diagnostic-only not a gate | ✅ CONFIRMED (intentional, header says so; not in package.json). |
| f | `check:massline` doc-count 23 ≠ array 26 | ✅ CONFIRMED. 26 entries; every prose comment says 23 (or "17"/"22"). Runtime uses `checks.length` so no functional bug — pure doc drift. |

## 🟠 Real regression holes (CI-gated checks neutered by `|| true`)
- 🟠 **`scripts/check-map-information-depth.mjs:876-877`** — precondition neutered: `assert.ok(Math.hypot(...) > 1 || true, 'sanity placeholder…')`. The "frame actually moved" precondition is bypassed; a no-op open-system action starting at origin passes trivially. Post-condition at L879-881 still checks the END state, so it's a one-sided hole, not total — but real. npm: `check:map-information-depth`.
- 🟠 **`scripts/check-m4-living-galaxy-player-route.mjs:651-655`** — `.every(...|| true)` always truthy → `authored` collapses to `(ships.length > 0)`. **Authored-asset verification fully bypassed.** Comment concedes "soft authored check" but variable is reported as if it verified something. 
- 🟡 `check-cargo-conscience.mjs:152` + `check-cause-ledger.mjs:208` — `assert.ok(true, 'destroy unsubscribes cleanly')` tautology; only protection is incidental throw-on-emit. A "didn't throw" tripwire dressed as an assertion.

## 🟠 Other material
- 🟠 **`scripts/bg-probe-temp.mjs:6` hardcodes `const ROOT = 'C:/Users/93rob/Documents/GitHub/SpaceFace';`** — non-portable absolute path; breaks on any other checkout. (Orphan/untracked, but anti-pattern if copy-pasted.)
- 🟡 **Two independent hand-maintained "fast gate" command lists** — `check-baseline.mjs:95-166` (LINKS, 11) and `check-ci-report.mjs:13-22` (SMOKE_COMMANDS, 8); neither derives from the other or package.json. A third notion of "what the fast gate runs."
- 🟡 **`precheck` is a deliberate ghost sentinel** in `CI_MATRIX_ROOT_SCRIPTS` (tripwire if someone reintroduces an npm lifecycle hook). Not a bug — don't "fix" by deleting.

## 🟡 Orphan / stale scripts (114 total; 99 committed)
- **99 committed orphan scripts** (neither in package.json nor imported): ~36 `check-*`, 20 `capture-*`, 16 `probe-*`, 11 underscore, 4 `*-temp`. The committed count is the real debt.
- 🟡 **`scripts/check-test-temp.mjs` is literally `console.log('temp');`** — single-line junk committed.
- 🟡 11 underscore one-shot repair/patch scripts (`_patch_*`, `_repair_*`, `_restore-gold-hub-parity`) — throwaway by own headers; parse clean but working-tree clutter.
- 🟡 Versioned candidate-gate orphans never wired to CI: `check-m4-helios-hub-v6-1`, `check-golden-frigate-surface-v2`, `check-golden-warden-module-triad-v1`, `check-kestrel-borrowed-time-v3`, `check-m5-story-embodied-{runtime,browser}`, etc. Superseded by family-level live checks; safe-delete candidates.
- 🟡 Dead `scripts/lib/` helpers: `_frag_runner.mjs`, `_frag_sample_window.mjs`, `_patch_probe_repair.mjs` (0 refs each).
- 🟡 135 scripts depend on `.devshots/` or `scratch/` local artifacts — fragility signal in a fresh checkout/CI.
- 🟢 `probe-dod-*` cluster (11) is NOT stale — DoD §22 acceptance probes driving production systems. Legit hand-run.

## 🟡 tools/ (139 .py + 82 .mjs)
- 🟢 **All 139 blender .py pass `python3 -m py_compile`** (no syntax errors). All art .mjs imports resolve. Healthy on syntax.
- 🟡 **Only 3 of 221 tools files wired to npm** (`finalize_whole_ship.mjs`, `generate_ship_parts_library.py`, `dispatch-log.mjs`). The entire `check:art` mega-gate references `tools/` ZERO times — asset-publish tools get no CI consistency gate.
- 🟡 **Helios-hub asset version sprawl** — 8 `finalize_m4_helios_hub_v{2,3,6,6_1,7,8,9}_candidate.mjs` all still referenced; v3 (27 refs) most-referenced while v9 (8 refs) is latest. Hard to reason about; old finalize scripts can't be safely deleted.
- 🟡 **3 committed `.pyc` files** in `tools/art/**/__pycache__/` — should be gitignored.
- 🟡 Untracked editor-recovery scratch + 6 underscore tools (`*.repair`, `*.pre_repair_bak`, `_hull_weld_reframe_once.py`, `_patch_v8_*.py`).
- 🟡 `tools/production/run-agent.mjs` — orphaned write-enabling transactional agent runner ("SAFE-001"); `campaign:dispatch` uses `dispatch-log.mjs` not this. Write-capable runner with no npm wiring.
- 🟢 `tools/foundry/` + `tools/recovery/` legit hand-run harnesses (asset-clone audit, donor validation).

## 🟢 Confirmed clean
- All 433 npm-referenced `scripts/*.mjs` exist; all 3 npm-referenced `tools/*` exist (no broken package.json wiring — verified via fs.existsSync).
- `check-release-soak.mjs` is NOT a stub (process.exit(0) is help/success path; fail-closed).
