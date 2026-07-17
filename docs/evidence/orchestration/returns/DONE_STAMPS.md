# DONE_STAMPS — green owning checks only

**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Tip:** `2226e908` (dirty tree: candle POI + GT1 continuous full-spine land; no commit)  
**Scratch implementer:** `%TEMP%/grok-goal-696b88462e5d/implementer/`  
**Rule:** Rows below are green-exit owning gates (or classified residual with honest non-green).  
**Do not stamp DONE** for Helix carriers, dual-platform golden-thread primaryAcceptance, or Tier-B unassisted continuous.

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
| H1c Candle Fleet embody | `node --test test/depth-program-a1-physical-actors.test.mjs` + continuous probe | 0 | `2226e908` | DONE Tier-A (no new GLB; `poi_memorial` flavorTargetRef) |
| GT1 gallery | capture gallery 42 | 0 | `a8180c4c` | SUPPORTING not primaryAcceptance |
| GT1 continuous | `check:depth-program:gt1:continuous` | 0 | `2226e908` | DONE primary Tier-A full spine (`supporting:false`); Electron dual-platform residual |
| Electron dual-platform | `check:electron:new-game` | non-zero | `241cc7a0` | RESIDUAL REAL/HARNESS |

## Explicit non-DONE (frozen open — not stamped)

| Item | Why not DONE |
|---|---|
| Helix natural fleet carriers | REAL residual (`fleetClass:'none'`); ambient soak green only under fail-closed option3; `FORCE_HELIX_CARRIER=1` fails closed |
| Dual-platform golden-thread primaryAcceptance | Browser gallery supporting; Electron new-game RED; not primaryAcceptance |
| Tier-B unassisted continuous | Playwright New Game → screenshots each beat / dual-platform path not closed; `productReadyUnassisted=false` |

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
| H1c Candle Fleet | `returns/G_CANDLE_FLEET_EMBODY.md` — memorial stamp + a1 actors 6/6 |
| GT1 gallery | `gt1-gallery-capture.log` / `.exit=0` — shots=42 |
| GT1 continuous | `gt1-continuous.log` / `.devshots/depth-program/gt1-continuous.json` — FULL SPINE OK `supporting:false` |
| Electron dual-platform | `browser-electron-routes.log` — exit=1 procedural-fallback NPCs |

## Plan AC map (honest)

| Plan AC | Stamps above | Not claimed here |
|---|---|---|
| AC1 primary matrix + D10 | DONE primary / DONE | — |
| AC2 recovery / Helios / HUD | DONE ×3 | dual-platform GT1 is **not** AC2 |
| AC4 expansion (V2) | DONE | — |
| AC5 gallery residual docs | SUPPORTING gallery + Electron residual | primaryAcceptance dual-platform |
| H1c Candle + GT1 continuous Tier-A | DONE embody + DONE primary Tier-A full spine | dual-platform primaryAcceptance; Tier-B unassisted continuous |
