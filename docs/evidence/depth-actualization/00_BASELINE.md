# Depth Actualization — P0 Baseline

**Branch:** `grok/depth-player-route-actualization`  
**Worktree:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Base HEAD:** `f277c5e711d8348d0e260347b68ecd153f4a4608`  
**Date:** 2026-07-17

## Forbid list (do not touch)

- Mining / drill / tether craft (`mining.js`, `drill.js`, `fieldDepletion`, tether mastery)
- Assets / Blender / `src/render` presentation / thrusters / materials
- Menu shell, HUD layout rewrite, input redesign, station strategy redesign
- New landmark/prop/ship GLBs; L1/PR1/H1 art DONE claims
- Weakening goldens; `window.SF` primary acceptance

## Baseline gate results (pre-fix → post P1 batch 1)

| Gate | Pre-fix | Post batch 1 | Notes |
|---|---|---|---|
| `check:unique-loot` | GREEN | GREEN | 12 wrecks, 13 rumor sources |
| `check:depth-program:gt1:loot-audit` | RED (13≠8 sources) | GREEN | Live combat tables grew to 13; test pin updated |
| `check:doctrine-distinct` | GREEN | GREEN | |
| `check:depth-program:f2` | RED (stale index + soak) | GREEN | Index regenerated; soak global-coords + zone patrol |
| `check:sim:compare` | RED (no node_modules) | pending re-run | Worktree needed `npm install` |
| `check:alpha:evidence:contract` | RED (stale AGENTS wiring) | GREEN | Asserts current program front door |

## Root causes fixed in batch 1

1. **GT1:** Frozen expected source count was historical (8); live enumeration is 13 sources × 1000 seeds. Audit itself was clean (0 unique leaks).
2. **F2 encounter index:** `index.generated.js` stale vs 43 authored modules — regenerated.
3. **F2 soak:** After M2 global coordinates, harness placed player in sector-local space while proximity zones use galactic-global. Proximity-gated ambushes never fired. Fixed boot conversion + zone patrol dwell.
4. **Alpha evidence contract:** Root `AGENTS.md` no longer lists MASTER_TASTE/ALPHA front-door rows; wiring assertions updated to `design/program/README.md` authority without inventing Task 0.1 live-corpus Complete.

## Harness inventory

### Depth check scripts
- `check-depth-program-a1.mjs`, `a2.mjs`, `e1.mjs`, `k1-behavior.mjs`, `k1-ui-runtime.mjs`
- `check-depth-program-r2-sweep.mjs`, `s3-reach-cultures.mjs`, `sp1.mjs`, `sp1-duration.mjs`
- Aggregate: `npm run check:depth-program:contracts`

### Depth tests
- 48 `test/depth-program*` files

### Key systems (present)
- `uniqueWrecks.js`, `encounterDirector.js`, `bandRadio.js`, `factionPresence.js`
- `shipLedger.js` (UI exists; not player-wired)
- `titles.js` (not registered)

## Dependency graph (acceptance order)

```
F1/F2 → V1/V2 → R1 → R2 → SP1
         ↘ E1
F2 → K1 → D1
V2 → A1
R1+V2 → A2
all literacy + opposition → GT1
```

## Next

P1 complete criteria: F2 + GT1 + depth contracts revalidation + sim:compare green.  
Then P2 R1/R2 natural unassisted wreck routes.
