# C_RECOVERY_SPINE_RETURN — post-Game-Over recovery settle

**Date:** 2026-07-17  
**Worktree:** `SpaceFace-depth-actualization` (SPINE)  
**Branch:** `grok/depth-player-route-actualization`  
**Commit:** `2a3b504d` (`fix(recovery): dismiss buried Game Over and gate M3 settle`)  
**Gate:** `npm run check:m3:recovery` → **green**

## What was broken (REAL)

`gameOver.js` only dismissed on `player:respawn` when `mgr.top() === 'gameOver'`.

If another modal sat above Game Over (e.g. Load save → `saveLoad`), combat could still:

1. honor `player:recoveryRequested`
2. run production `recoverPendingPlayer`
3. emit `player:respawn` and berth the wreck

…but the after-action screen stayed on the stack, so the route looked unsettled (GO still visible, controls still locked). Public-route settle checks that require **both** respawn **and** a hidden GO screen fail that case.

Combat settle itself (defeat latch, re-arm from `lastPlayerDefeat`, lawful berth offset, single deductible charge, one `player:respawn`) was already product-correct on this tree.

## Fix (minimal)

In `src/ui/screens/gameOver.js`:

- Add `popAncestorsUntilGameOverResolves(ctx, manager)`
- On `player:respawn`, pop the stack until `gameOver` leaves (bounded), then emit `game:over:dismissed`
- Fall back to single top-only pop when `screenStack` is unavailable

No combat algorithm change required for this residual. No `input.js`, assets, thrusters, or station redesign.

## Gate

| Artifact | Role |
|---|---|
| `scripts/check-m3-recovery.mjs` | Headless production path: combat `recoverPendingPlayer` + real `gameOver` Continue (no SF injection) |
| `package.json` → `check:m3:recovery` | npm entry |
| `test/damage-death-recovery.test.mjs` | Nested-stack dismiss + existing combat re-arm suite (24/24) |

### `check:m3:recovery` covers

1. Defeat freezes (no auto-respawn); Continue → exactly one `player:respawn`
2. Lawful collision-clear Helios berth (`station + 140` WU), no invuln hack
3. GO dismisses when top
4. GO dismisses when buried under another screen (**REAL fix**)
5. Double Continue does not double-charge

### Result

```
npm run check:m3:recovery  →  exit 0
node --test test/damage-death-recovery.test.mjs  →  24 pass
```

## Classification

| Item | Class |
|---|---|
| Top-only GO dismiss left recovery visually stuck | **REAL** — fixed |
| Combat recovery latch / berth / charge | **REAL** (prior; verified green) |
| Headless settle gate | **HARNESS** — added |
| Full headed Hunter public-route re-proof | **Residual** — not claimed this slice |

## Fences honored

No `input.js`, assets, thrusters, station redesign, graphics.
