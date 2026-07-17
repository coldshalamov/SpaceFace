# C — W1 Recovery settle return

**Date:** 2026-07-17  
**Owner:** Grok (SPINE worktree `SpaceFace-depth-actualization`)  
**Branch:** `grok/depth-player-route-actualization`  
**Work package:** Post-Game-Over recovery settles (`player:recoveryRequested` → `player:respawn`, GO dismisses, lawful collision-clear berth, control returns)

## 1) Classification

| Finding | Class | Notes |
|---|---|---|
| Game Over only dismissed when `mgr.top() === 'gameOver'` | **REAL** | Product bug: if Load save (or any modal) sat above GO, successful `player:respawn` left GO on the stack and controls locked. Fixed via `popAncestorsUntilGameOverResolves` in `src/ui/screens/gameOver.js`. |
| Combat `recoverPendingPlayer` path (re-arm, berth offset, single charge) | **REAL** (already present) | Prior combat work on this spine already placed the player at `station + RECOVERY_BERTH_CLEARANCE_WU`, re-armed from `lastPlayerDefeat`, and emitted one `player:respawn`. Verified; no combat change required this slice. |
| Nested-stack dismiss missing from unit coverage | **HARNESS** | Extended `test/damage-death-recovery.test.mjs` + new `scripts/check-m3-recovery.mjs` so the REAL stack-pop fix cannot regress silently. |
| Historical “no respawn within 30s” public-route note | **STALE** relative to this headless settle | Combat+UI settle path is green headless. Full browser public-route timing remains out of this slice (no Playwright pass claimed here). |

**Slice verdict:** **REAL** product fix (UI stack dismiss) + **HARNESS** proof. Combat settle was already product-correct on this worktree.

## 2) Trace (production path)

```
combat.kill(player) / beginPlayerDefeat
  → player:death { recoverable:true }
  → game:over
uiRoot → pushScreen('gameOver')
gameOver Continue click
  → player:recoveryRequested { source:'after_action' }
combat.recoverPendingPlayer
  → rearmPendingRecoveryFromReceipt (if latch lost)
  → restorePlayerAtRecoveryDock (sector enter if needed, berth offset, vitals restore)
  → cargo / economy:chargeCredits
  → player:respawn { stationId, source, … }
gameOver listener
  → popAncestorsUntilGameOverResolves (pops through nested modals until GO leaves)
  → game:over:dismissed
stack empty → flight HUD / control returns
```

## 3) Files landed

| Path | Role |
|---|---|
| `src/ui/screens/gameOver.js` | `popAncestorsUntilGameOverResolves` — dismiss GO on `player:respawn` even when not strictly top of stack |
| `scripts/check-m3-recovery.mjs` | Headless combat+UI settle: defeat → Continue → respawn · GO dismiss · lawful berth · nested stack |
| `package.json` | `"check:m3:recovery": "node scripts/check-m3-recovery.mjs"` |
| `test/damage-death-recovery.test.mjs` | Nested-stack dismiss coverage; stack-aware manager in existing DOM test |
| `docs/evidence/orchestration/returns/C_RECOVERY_RETURN.md` | This return |

**Fence:** no `input.js`, thrusters, materials, mining rewrite, station redesign, assets.

## 4) Proof run

| Command | Exit |
|---|---|
| `node --test test/damage-death-recovery.test.mjs` | **0** (24 pass, 0 fail) |
| `node scripts/check-m3-recovery.mjs` | **0** |
| `npm run check:m3:recovery` | **0** |

### `check-m3-recovery` asserts

1. Source contract: `popAncestorsUntilGameOverResolves`, recovery intent, `recoverPendingPlayer`, berth clearance constant  
2. Top-of-stack: kill → GO on stack → Continue click → one `player:respawn` → `game:over:dismissed` → empty stack → alive at Helios berth `(460, -80)` · no invuln · lawful `protectedStationAt`  
3. Nested stack: `['gameOver','saveLoad']` → recovery still respawns and clears GO + ancestors  
4. Rearm: latch cleared, receipt retained → `player:recoveryRequested` still recovers  

## 5) Residual

- Browser/Electron public-input route log (playwright click on live GO) not re-run in this slice; headless production-path settle is the proof bar here.  
- Do not re-record save goldens; recovery does not touch save format.  
