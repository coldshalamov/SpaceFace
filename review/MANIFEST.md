<!-- LIFETIME: VOLATILE — coverage tracker for the thermonuclear review. Update as each area is read. -->
# Thermonuclear Review — Coverage Manifest

This file tracks *what has actually been read* in the exhaustive sweep. Each area is marked
`pending` → `in_progress` → `done`. Findings live in `FINDINGS.md` (sectioned by area); dead/unintegrated
work lives in `ABANDONED.md`. Any session can resume from here — read this file first, then continue at
the first `pending`/`in_progress` area.

**Method:** read every file in the main thread (no delegation — delegation defeats cross-referencing),
extract findings to disk immediately, tick this manifest. Generated files (`*.generated.js`) are noted
but not deep-read (their bugs live in the generator).

## src/ (gameplay code)

| Area | Files | Lines | Status | Read by |
|---|---:|---:|---|---|
| `src/core/` | 50 | 17859 | done | all load-bearing read; 50-file list skimmed |
| `src/systems/` | 133 | 93245 | done (hygiene+orphan scan; economy/cargo full-read; single-writers verified) | not line-by-line — 93k lines; full-read economy+cargo, hygiene-scanned all 133, orphan-scanned, verified all single-writer contracts |
| `src/combat/` | 23 | 8233 | done | damage/impulseKernel/rewardEligibility/kernel full-read; rest skimmed |
| `src/ai/` | 18 | 5608 | done | contracts/engagementAuthority full-read; rest skimmed |
| `src/data/` | 181 | 28984 | done (integrity cross-checks) | catalog cross-refs validated; 24 sectors (not 10); 14 factions; newGameDefaults read |
| `src/render/` | 108 | 68898 | scan done | hygiene scan; §1.2 DOM + §5.2 HUD verified; not line-read |
| `src/ui/` | 136 | 75149 | scan done | hygiene scan; HUD-visibility rule verified (uiRoot.js:1070); not line-read |
| `src/save/` | — | — | pending | |
| `src/audio/` | — | — | pending | |
| `src/balance/` | — | — | pending | |
| `src/careers/` | — | — | pending | |
| `src/contracts/` `src/economy/` `src/law/` `src/missions/` `src/observability/` `src/onboarding/` `src/presentation/` `src/runtime/` `src/sim/` `src/story/` `src/vfxnext/` `src/localization/` | — | — | scan done | hygiene clean; save CURRENT_VERSION=12 single-source; audio Math.random is synth noise |

## test/

| Area | Status |
|---|---|
| `test/` | scan done | 698 files; 3 goldens; harness audited; no silent skips; per-file line-read not done |

## scripts/ + tools/

| Area | Status |
|---|---|
| `scripts/` | scan done | 827 files; 203 unwired (CLI tools + stale one-offs); ~25 stale-named |
| `tools/` | scan done | 139 blender .py + 70 art .mjs (asset authoring); not deep-read |

## Notes
- `src/localization/catalogs/en-US.generated.js` (9538 lines) is GENERATED — skip deep read; verify generator instead.
