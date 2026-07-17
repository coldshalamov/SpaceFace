# DONE_STAMPS — green owning checks only

**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Tip:** `241cc7a0` (`fix(depth): held-out primary matrix with earned carriers only`)  
**Scratch implementer:** `%TEMP%/grok-goal-696b88462e5d/implementer/`  
**Rule:** Rows below are green-exit owning gates (or classified residual with honest non-green).  
**Do not stamp DONE** for Helix carriers, dual-platform golden-thread primary, or continuous unassisted GT1.

| Chunk | Gate | Exit | Tip | Claim |
|---|---|---|---|---|
| R2 primary matrix | `check:depth-program:r2:natural-primary-matrix` | 0 | `241cc7a0` | DONE primary |
| D10 primary | `check:depth-program:r2:natural-d10:primary` | 0 | `15ea9482` | DONE |
| E1 natural 8 shapes | `check:depth-program:e1:natural` | 0 | `55c04163` | DONE supporting residual noted |
| M3 recovery | `check:m3:recovery` | 0 | `2a3b504d` | DONE |
| M1 Helios | `check:m1:helios-route` | 0 | `0580a007` | DONE |
| NAV-HUD | `check:nav-hud-hierarchy` | 0 | `156aec66` | DONE |
| V2 | `check:depth-program:v2` | 0 | `0580a007` | DONE |
| D1 ambient | `check:depth-program:d1:living-opposition` | 0 | `a0230957` | PARTIAL Helix residual |
| GT1 gallery | capture gallery 42 | 0 | `a8180c4c` | SUPPORTING not primaryAcceptance |
| GT1 continuous | `check:depth-program:gt1:continuous` | 0 | `a0230957` | SUPPORTING residual candle REAL |
| Electron dual-platform | `check:electron:new-game` | non-zero | `241cc7a0` | RESIDUAL REAL/HARNESS |

## Explicit non-DONE (frozen open — not stamped)

| Item | Why not DONE |
|---|---|
| Helix natural fleet carriers | REAL residual (`fleetClass:'none'`); ambient soak green only under fail-closed option3; `FORCE_HELIX_CARRIER=1` fails closed |
| Dual-platform golden-thread primary | Browser gallery supporting; Electron new-game RED; not primaryAcceptance |
| Continuous unassisted GT1 | Gate exit 0 is **partial** (`supporting:true`, `fullSpinePass=false`); candle-fleet REAL residual |

## Evidence pointers (implementer logs)

| Chunk | Log |
|---|---|
| R2 primary matrix | `wreck-routes.log` — 12/12 × held-out 5, `supporting:false` |
| D10 primary | `natural-d10-primary.log` — 5 seeds, `supporting:false` |
| E1 natural 8 shapes | `e1-natural.log` — 17 runs |
| M3 recovery | `m3-recovery.log` |
| M1 Helios | `m1-helios.log` |
| NAV-HUD | `nav-hud.log` — 6 groups |
| V2 | `depth-contracts.log` (v2 segment, fail 0) |
| D1 ambient | `living-opposition.log` — ambient pass; Helix residual REAL |
| GT1 gallery | `gt1-gallery-capture.log` / `.exit=0` — shots=42 |
| GT1 continuous | `gt1-continuous.log` — PARTIAL OK supporting |
| Electron dual-platform | `browser-electron-routes.log` — exit=1 procedural-fallback NPCs |

## Plan AC map (honest)

| Plan AC | Stamps above | Not claimed here |
|---|---|---|
| AC1 primary matrix + D10 | DONE primary / DONE | — |
| AC2 recovery / Helios / HUD | DONE ×3 | dual-platform GT1 is **not** AC2 |
| AC4 expansion (V2) | DONE | — |
| AC5 gallery residual docs | SUPPORTING gallery + Electron residual | primaryAcceptance dual-platform |
| D1 / GT1 continuous | PARTIAL / SUPPORTING | Helix DONE; unassisted continuous DONE |
